import { Hono } from 'hono';
import { createSession, loadSession, recordSignature } from './sessions.js';
import { emailHash, randomHex, timingSafeEqualStr } from './crypto-utils.js';
import { createToken, verifyToken } from './tokens.js';
import { SESSION_TTL_SECONDS, getOriginalPdf, getSignedPdf } from './storage.js';
import { validatePdfUpload, validateSigners } from './validate.js';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'bail-sign-relay' }));

function expEpoch() {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
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
  if (!session) return c.text('Lien invalide ou expiré.', 404);
  if (session.status === 'completed') return c.text('Ce document est déjà signé.', 410);

  const signToken = await mintSignToken(c.env, sessionId, session.currentIndex);
  // Phase 2 : remplacer ce placeholder par le vrai sign.html (wizard porté).
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Signature du bail</title></head><body>
<p>Placeholder de signature (Phase 2 : wizard).</p>
<script>window.__SIGN_TOKEN__ = "${signToken}"; window.__SESSION_ID__ = "${sessionId}";</script>
</body></html>`;
  return c.html(html);
});

app.get('/api/sessions/:id/pdf', async (c) => {
  const sessionId = c.req.param('id');
  const guard = await requireSigner(c, sessionId);
  if (guard.error) return guard.error;
  const obj = await getOriginalPdf(c.env, sessionId);
  if (!obj) return c.json({ error: 'pdf missing' }, 404);
  return new Response(obj.body, { headers: { 'content-type': 'application/pdf' } });
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
  const session = await recordSignature(c.env, sessionId, { signedBytes: bytes, proof });
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
      proof: sg.proof ? { signedAt: sg.proof.signedAt, pdfSha256: sg.proof.pdfSha256 } : null
    }))
  });
});

export default app;
