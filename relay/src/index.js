import { Hono } from 'hono';
import { createSession, loadSession, recordSignature, recordEmailVerified } from './sessions.js';
import { emailHash, randomHex, timingSafeEqualStr } from './crypto-utils.js';
import { createToken, verifyToken } from './tokens.js';
import { SESSION_TTL_SECONDS, getOriginalPdf, getSignedPdf } from './storage.js';
import { validatePdfUpload, validateSigners } from './validate.js';
import { renderSignPage, renderErrorPage } from './sign-page.js';

const app = new Hono();

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

app.post('/sessions', async (c) => {
  const auth = c.req.header('Authorization') || '';
  if (!timingSafeEqualStr(auth, `Bearer ${c.env.APP_KEY}`)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
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
  const obj = await getOriginalPdf(c.env, sessionId);
  if (!obj) return c.json({ error: 'pdf missing' }, 404);
  return new Response(obj.body, { headers: { 'content-type': 'application/pdf' } });
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
  const obj = await getSignedPdf(c.env, sessionId);
  if (!obj) return c.json({ error: 'signed pdf missing' }, 404);
  return new Response(obj.body, { headers: { 'content-type': 'application/pdf' } });
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

export default app;
