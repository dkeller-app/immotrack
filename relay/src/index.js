import { Hono } from 'hono';
import { createSession, loadSession, recordSignature } from './sessions.js';
import { emailHash, randomHex } from './crypto-utils.js';
import { createToken, verifyToken } from './tokens.js';
import { SESSION_TTL_SECONDS, getOriginalPdf, getSignedPdf } from './storage.js';
import { validatePdfUpload } from './validate.js';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'bail-sign-relay' }));

function expEpoch() {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}

app.post('/sessions', async (c) => {
  const auth = c.req.header('Authorization') || '';
  if (auth !== `Bearer ${c.env.APP_KEY}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const form = await c.req.formData();
  const pdfFile = form.get('pdf');
  const metaRaw = form.get('meta');
  if (!pdfFile || !metaRaw) return c.json({ error: 'missing pdf or meta' }, 400);

  let meta;
  try { meta = JSON.parse(metaRaw); } catch { return c.json({ error: 'bad meta json' }, 400); }
  if (!Array.isArray(meta.signers) || meta.signers.length === 0) {
    return c.json({ error: 'no signers' }, 400);
  }

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

export default app;
