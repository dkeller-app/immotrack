import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createSession, loadSession, recordSignature, recordEmailVerified } from './sessions.js';
import { emailHash, randomHex, timingSafeEqualStr } from './crypto-utils.js';
import { createToken, verifyToken } from './tokens.js';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { SESSION_TTL_SECONDS, getOriginalPdf, getSignedPdf, getPiece, candidatureTtl, deleteSession } from './storage.js';
import { validatePdfUpload, validateSigners, validatePieceUpload, validateDossier, validateDossierComplete, validateCandidatureMeta } from './validate.js';
import { renderSignPage, renderErrorPage } from './sign-page.js';
import {
  createCandidature, loadCandidature, saveDossier, addPiece, removePiece,
  markOpened, submitCandidature, reopenForComplement, reopenByCandidate, revokeCandidature, purgeCandidature
} from './candidatures.js';
import { renderDossierPage, renderDossierError } from './dossier-page.js';

const app = new Hono();

// CORS — l'app ImmoTrack appelle le relais en cross-origin avec en-têtes custom.
// Origine PROD réelle = https://dkeller-app.github.io (repo GitHub dkeller-app/immotrack).
// 'null' = frames sandboxées / file:// (tests locaux). didierkeller.github.io conservé (alias éventuel).
const ALLOWED_ORIGINS = ['https://dkeller-app.github.io', 'https://didierkeller.github.io', 'null'];
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return undefined;
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    if (/^http:\/\/localhost(:[1-9]\d{0,4})?$/.test(origin)) return origin;   // dev local
    return undefined; // origine non autorisée → pas d'en-tête
  },
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Authorization', 'X-Owner-Token', 'X-Sign-Token', 'X-Sign-Proof', 'Content-Type'],
  maxAge: 86400 // 86400 s = 24 h (plafond Firefox)
}));

app.get('/health', (c) => c.json({ ok: true, service: 'bail-sign-relay' }));

function expEpoch() {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}

// Décode l'en-tête X-Sign-Proof : base64url(JSON UTF-8) → objet. Borné et défensif :
// renvoie null sur en-tête absent, trop gros ou malformé (jamais une exception bloquante).
function decodeProofHeader(header) {
  if (!header || typeof header !== 'string' || header.length > 4096) return null;
  try {
    const b64 = header.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// ── Auth APP : un utilisateur CONNECTÉ à l'app ───────────────────────────────────────────────
// Remplace l'ancienne APP_KEY partagée (qui devait vivre côté client = lisible par TOUT utilisateur d'un
// site statique). On vérifie le jeton de session Supabase (JWT ES256) avec la CLÉ PUBLIQUE du projet
// (JWKS) : rien de secret ni dans le client ni dans le worker, et le worker ne peut pas forger de jeton.
// Le client envoie son access_token dans `Authorization: Bearer <token>`. Le JWKS (URL publique) vient de
// la variable d'env worker SUPABASE_URL.
let _supaJWKS = null;
function supaJWKS(env) {
  if (!_supaJWKS) {
    const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
    _supaJWKS = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  }
  return _supaJWKS;
}
async function requireSupabaseUser(c) {
  const m = /^Bearer\s+(.+)$/i.exec(c.req.header('Authorization') || '');
  if (!m) return { error: c.json({ error: 'unauthorized' }, 401) };
  try {
    const base = String(c.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const { payload } = await jwtVerify(m[1], supaJWKS(c.env), { issuer: `${base}/auth/v1` });
    if (payload.role !== 'authenticated' || !payload.sub) {
      return { error: c.json({ error: 'unauthorized' }, 401) };
    }
    return { userId: payload.sub };
  } catch {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
}

app.post('/sessions', async (c) => {
  const gate = await requireSupabaseUser(c);
  if (gate.error) return gate.error;
  const form = await c.req.formData();
  const pdfFile = form.get('pdf');
  const metaRaw = form.get('meta');
  if (!pdfFile || !metaRaw) return c.json({ error: 'missing pdf or meta' }, 400);

  let meta;
  try { meta = JSON.parse(metaRaw); } catch { return c.json({ error: 'bad meta json' }, 400); }
  const sv = validateSigners(meta.signers);
  if (!sv.ok) return c.json({ error: sv.reason }, 400);

  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const signers = [];
  for (const s of meta.signers) {
    signers.push({
      role: s.role,
      emailHash: await emailHash(s.email),
      tel: s.tel || '',
      ordre: s.ordre
    });
  }

  const { sessionId } = await createSession(c.env, { bailRef: meta.bailRef, pdfBytes, signers });
  const exp = expEpoch();
  const ownerToken = await createToken(
    { sid: sessionId, role: 'owner', jti: randomHex(8), exp },
    c.env.SIGNING_SECRET
  );
  const signUrl = new URL(`/s/${sessionId}`, c.req.url).toString();

  return c.json({ sessionId, signUrl, ownerToken }, 201);
});

async function requireSigner(c, sessionId) {
  const token = c.req.header('X-Sign-Token') || '';
  if (!token) return { error: c.json({ error: 'missing token' }, 401) };
  const ver = await verifyToken(token, c.env.SIGNING_SECRET);
  if (!ver.valid || ver.payload.role !== 'signer' || ver.payload.sid !== sessionId) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  const session = await loadSession(c.env, sessionId);
  if (!session) return { error: c.json({ error: 'not found' }, 404) };
  if (session.status === 'completed') return { error: c.json({ error: 'already completed' }, 410) };
  if (ver.payload.idx !== session.currentIndex) {
    return { error: c.json({ error: 'not your turn' }, 403) };
  }
  return { session, payload: ver.payload };
}

async function mintSignToken(env, sessionId, idx) {
  const exp = expEpoch();
  return createToken(
    { sid: sessionId, role: 'signer', idx, jti: randomHex(8), exp },
    env.SIGNING_SECRET
  );
}

app.get('/s/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const session = await loadSession(c.env, sessionId);
  if (!session) return c.html(renderErrorPage('Lien invalide ou expiré.'), 404);
  if (session.status === 'completed') return c.html(renderErrorPage('Ce document est déjà signé.'), 410);
  const signToken = await mintSignToken(c.env, sessionId, session.currentIndex);
  return c.html(renderSignPage({ session, signToken }));
});

app.get('/api/sessions/:id/pdf', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireSigner(c, sessionId);
  if (guard.error) return guard.error;
  const bytes = await getOriginalPdf(c.env, sessionId);
  if (!bytes) return c.json({ error: 'pdf missing' }, 404);
  return new Response(bytes, { headers: { 'content-type': 'application/pdf' } });
});

// Anti-transfert (§5 #2) : le signataire confirme son email. La comparaison se fait
// sur le hash (constant-time), jamais sur l'email en clair. Un match marque emailVerifiedAt
// côté serveur (autorité). Pas de blocage dur de /signed : le relais enregistre la preuve.
app.post('/api/sessions/:id/verify-email', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireSigner(c, sessionId);
  if (guard.error) return guard.error;

  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'bad json' }, 400); }
  const email = body && typeof body.email === 'string' ? body.email : '';
  const signer = guard.session.signers[guard.session.currentIndex];
  const match = timingSafeEqualStr(await emailHash(email), signer.emailHash);
  if (!match) return c.json({ ok: false });

  await recordEmailVerified(c.env, sessionId);
  return c.json({ ok: true });
});

async function requireOwner(c, sessionId) {
  const token = c.req.header('X-Owner-Token') || '';
  if (!token) return { error: c.json({ error: 'missing token' }, 401) };
  const ver = await verifyToken(token, c.env.SIGNING_SECRET);
  if (!ver.valid || ver.payload.role !== 'owner' || ver.payload.sid !== sessionId) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  const session = await loadSession(c.env, sessionId);
  if (!session) return { error: c.json({ error: 'not found' }, 404) };
  return { session };
}

app.post('/api/sessions/:id/signed', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireSigner(c, sessionId);
  if (guard.error) return guard.error;

  const contentType = c.req.header('content-type') || '';
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const v = validatePdfUpload(bytes, contentType);
  if (!v.ok) return c.json({ error: v.reason }, 400);

  const proof = {
    ip: c.req.header('CF-Connecting-IP') || '',
    userAgent: c.req.header('User-Agent') || '',
    signedAt: new Date().toISOString()
  };
  // Preuve client optionnelle (acte de volonté + horodatages d'étape), base64url(JSON UTF-8).
  // Décodage défensif : un en-tête malformé est ignoré, jamais bloquant.
  const clientProof = decodeProofHeader(c.req.header('X-Sign-Proof'));
  const session = await recordSignature(c.env, sessionId, { signedBytes: bytes, proof, clientProof });
  return c.json({ status: session.status, currentIndex: session.currentIndex });
});

app.get('/api/sessions/:id/result', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireOwner(c, sessionId);
  if (guard.error) return guard.error;
  if (guard.session.status !== 'completed') return c.json({ error: 'not completed' }, 409);
  const bytes = await getSignedPdf(c.env, sessionId);
  if (!bytes) return c.json({ error: 'signed pdf missing' }, 404);
  return new Response(bytes, { headers: { 'content-type': 'application/pdf' } });
});

app.get('/api/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireOwner(c, sessionId);
  if (guard.error) return guard.error;
  const s = guard.session;
  return c.json({
    sessionId: s.sessionId,
    bailRef: s.bailRef,
    status: s.status,
    currentIndex: s.currentIndex,
    expiresAt: s.expiresAt,
    signers: s.signers.map((sg) => ({
      role: sg.role, ordre: sg.ordre, statut: sg.statut,
      emailVerifiedAt: sg.emailVerifiedAt || null,
      // Dossier de preuve complet exposé au propriétaire (§5 #1/#3/#6/#8).
      proof: sg.proof ? {
        signedAt: sg.proof.signedAt,
        pdfSha256: sg.proof.pdfSha256,
        emailVerifiedAt: sg.proof.emailVerifiedAt || null,
        signerName: sg.proof.signerName || null,
        consentElectronic: sg.proof.consentElectronic ?? null,
        luApprouve: sg.proof.luApprouve ?? null,
        openedAt: sg.proof.openedAt || null,
        readCompletedAt: sg.proof.readCompletedAt || null,
        ip: sg.proof.ip || null,
        userAgent: sg.proof.userAgent || null
      } : null
    }))
  });
});

app.delete('/api/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireOwner(c, sessionId);   // 401 si token absent/invalide, 404 si déjà absente
  if (guard.error) return guard.error;
  await deleteSession(c.env, sessionId);
  return c.body(null, 204);
});

// ════════════════ CANDIDATURE (dossier locataire en ligne) ════════════════

async function requireCandidat(c, linkId) {
  const token = c.req.header('X-Cand-Token') || '';
  if (!token) return { error: c.json({ error: 'missing token' }, 401) };
  const ver = await verifyToken(token, c.env.SIGNING_SECRET);
  if (!ver.valid || ver.payload.role !== 'candidat' || ver.payload.lid !== linkId) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  const cand = await loadCandidature(c.env, linkId);
  if (!cand) return { error: c.json({ error: 'not found' }, 404) };
  if (cand.status === 'revoked') return { error: c.json({ error: 'revoked' }, 410) };
  if (new Date(cand.expiresAt).getTime() < Date.now()) return { error: c.json({ error: 'expired' }, 410) };
  return { cand };
}

async function requireCandOwner(c, linkId) {
  const token = c.req.header('X-Owner-Token') || '';
  if (!token) return { error: c.json({ error: 'missing token' }, 401) };
  const ver = await verifyToken(token, c.env.SIGNING_SECRET);
  if (!ver.valid || ver.payload.role !== 'cand-owner' || ver.payload.lid !== linkId) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  const cand = await loadCandidature(c.env, linkId);
  if (!cand) return { error: c.json({ error: 'not found' }, 404) };
  return { cand };
}

// Le bailleur (app) crée une invitation. Auth = jeton de session Supabase (comme POST /sessions).
app.post('/candidatures', async (c) => {
  const gate = await requireSupabaseUser(c);
  if (gate.error) return gate.error;
  let meta;
  try { meta = await c.req.json(); } catch { return c.json({ error: 'bad json' }, 400); }
  const v = validateCandidatureMeta(meta);
  if (!v.ok) return c.json({ error: v.reason }, 400);

  const { linkId, candidature } = await createCandidature(c.env, {
    logRef: meta.logRef, bienLabel: meta.bienLabel, loyer: meta.loyer,
    message: meta.message, expDays: meta.expDays
  });
  const exp = Math.floor(Date.now() / 1000) + candidatureTtl(meta.expDays);
  const ownerToken = await createToken(
    { lid: linkId, role: 'cand-owner', jti: randomHex(8), exp },
    c.env.SIGNING_SECRET
  );
  const candidatUrl = new URL(`/d/${linkId}`, c.req.url).toString();
  return c.json({ linkId, candidatUrl, ownerToken, expiresAt: candidature.expiresAt }, 201);
});

// Ping santé authentifié — alimente le bouton « Tester la connexion » des Réglages
// côté app. Vérifie d'un seul coup que la base répond ET que le jeton de session est accepté,
// sans écrire dans KV (zéro pollution). Auth = jeton de session Supabase.
app.get('/api/ping', async (c) => {
  const gate = await requireSupabaseUser(c);
  if (gate.error) return gate.error;
  return c.json({ ok: true, ts: Date.now() });
});

// Page publique candidat (sans compte). Token candidat injecté server-side.
app.get('/d/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const cand = await loadCandidature(c.env, linkId);
  if (!cand) return c.html(renderDossierError('Lien invalide ou expiré.'), 404);
  if (cand.status === 'revoked') return c.html(renderDossierError('Dossier traité — votre candidature a été étudiée par le propriétaire. Ce lien n\'est plus modifiable.'), 410);
  if (new Date(cand.expiresAt).getTime() < Date.now()) return c.html(renderDossierError('Ce lien a expiré.'), 410);
  const opened = await markOpened(c.env, linkId);
  const exp = Math.floor(new Date(opened.expiresAt).getTime() / 1000);
  const candidatToken = await createToken(
    { lid: linkId, role: 'candidat', jti: randomHex(8), exp },
    c.env.SIGNING_SECRET
  );
  return c.html(renderDossierPage({ candidature: opened, candidatToken }));
});

// Candidat : relit l'état de son dossier (reprise D13).
app.get('/api/candidatures/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  const cand = guard.cand;
  return c.json({
    status: cand.status, bienLabel: cand.bienLabel, message: cand.message,
    complementNote: cand.complementNote,
    dossier: cand.dossier,
    pieces: cand.pieces.map((p) => ({ pieceId: p.pieceId, categorie: p.categorie, filename: p.filename }))
  });
});

// Candidat : enregistre/complète son dossier (champs identité/situation/garant).
app.post('/api/candidatures/:linkId/dossier', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'open') return c.json({ error: 'not-open' }, 409);
  let dossier;
  try { dossier = await c.req.json(); } catch { return c.json({ error: 'bad json' }, 400); }
  const v = validateDossier(dossier);
  if (!v.ok) return c.json({ error: v.reason }, 400);
  await saveDossier(c.env, linkId, dossier);
  return c.json({ ok: true });
});

// Candidat : upload d'UNE pièce (octets bruts + en-têtes catégorie/nom).
app.post('/api/candidatures/:linkId/piece', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'open') return c.json({ error: 'not-open' }, 409);
  const contentType = c.req.header('content-type') || '';
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const v = validatePieceUpload(bytes, contentType);
  if (!v.ok) return c.json({ error: v.reason }, 400);
  let filename = 'piece';
  try { filename = decodeURIComponent(c.req.header('X-Piece-Filename') || '') || 'piece'; } catch { filename = c.req.header('X-Piece-Filename') || 'piece'; }
  const { pieceId } = await addPiece(c.env, linkId, {
    categorie: c.req.header('X-Piece-Categorie') || 'autre',
    filename,
    contentType, bytes
  });
  return c.json({ pieceId }, 201);
});

// Candidat : supprime une de ses pièces (remplacement avant envoi).
app.delete('/api/candidatures/:linkId/piece/:pieceId', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'open') return c.json({ error: 'not-open' }, 409);
  await removePiece(c.env, linkId, c.req.param('pieceId'));
  return c.json({ ok: true });
});

// Candidat : finalise l'envoi (open → submitted).
app.post('/api/candidatures/:linkId/submit', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'open') return c.json({ error: 'not-open' }, 409);
  // Validation serveur complète (identité + situation) — défense en profondeur si
  // le candidat contourne le JS. Le /dossier d'autosave reste permissif (reprise D13).
  const v = validateDossierComplete(guard.cand.dossier || {});
  if (!v.ok) return c.json({ error: v.reason }, 400);
  const cand = await submitCandidature(c.env, linkId);
  return c.json({ status: cand.status, submittedAt: cand.submittedAt });
});

// Bailleur : récupère le dossier soumis (méta + dossier). Pièces via route dédiée.
app.get('/api/candidatures/:linkId/result', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'submitted') return c.json({ status: guard.cand.status }, 200); // 200 (pas 409) → pas de rouge console au polling ; le client lit body.status
  const cand = guard.cand;
  return c.json({
    linkId: cand.linkId, logRef: cand.logRef, bienLabel: cand.bienLabel, loyer: cand.loyer,
    status: cand.status, submittedAt: cand.submittedAt,
    dossier: cand.dossier,
    pieces: cand.pieces.map((p) => ({ pieceId: p.pieceId, categorie: p.categorie, filename: p.filename, contentType: p.contentType, size: p.size }))
  });
});

// Bailleur : télécharge UNE pièce (pour rapatriement dans la GED de l'app).
app.get('/api/candidatures/:linkId/piece/:pieceId', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  const meta = guard.cand.pieces.find((p) => p.pieceId === c.req.param('pieceId'));
  if (!meta) return c.json({ error: 'piece not found' }, 404);
  const bytes = await getPiece(c.env, linkId, meta.pieceId);
  if (!bytes) return c.json({ error: 'piece missing' }, 404);
  return new Response(bytes, { headers: { 'content-type': meta.contentType || 'application/octet-stream' } });
});

// Bailleur : demande de complément (D13) — submitted → open + note.
app.post('/api/candidatures/:linkId/reopen', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  let body = {};
  try { body = await c.req.json(); } catch {}
  const cand = await reopenForComplement(c.env, linkId, body && body.note);
  return c.json({ status: cand.status });
});

// Candidat : rouvre LUI-MÊME son dépôt soumis (submitted → open) pour le compléter,
// sans intervention du bailleur. Jeton candidat. Refusé si pas soumis (409) — donc
// jamais si 'revoked' (≠ submitted), le bailleur ayant déjà tranché.
app.post('/api/candidatures/:linkId/reopen-self', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandidat(c, linkId);
  if (guard.error) return guard.error;
  if (guard.cand.status !== 'submitted') return c.json({ error: 'not-submitted', status: guard.cand.status }, 409);
  const cand = await reopenByCandidate(c.env, linkId);
  return c.json({ status: cand.status });
});

// Bailleur : révoque le lien (le rend inutilisable immédiatement).
app.post('/api/candidatures/:linkId/revoke', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  const cand = await revokeCandidature(c.env, linkId);
  return c.json({ status: cand.status });
});

// Bailleur : purge (accusé de réception après rapatriement dans l'app).
app.delete('/api/candidatures/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const guard = await requireCandOwner(c, linkId);
  if (guard.error) return guard.error;
  await purgeCandidature(c.env, linkId);
  return c.json({ ok: true });
});

export default app;
