// Vérif email (anti-transfert, §5 #2) + persistance du dossier de preuve côté relais (§5 #1/#3/#6/#8).
// Le relais enregistre emailVerifiedAt (autorité serveur) + la preuve client (acte de volonté, horodatages),
// exposés au propriétaire via GET /api/sessions/:id.
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

const APP_KEY = 'test-app-key';
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4

async function createSession(signers) {
  const form = new FormData();
  form.set('pdf', new File([PDF_BYTES], 'b.pdf', { type: 'application/pdf' }));
  form.set('meta', JSON.stringify({ bailRef: 'BAIL-PROOF-001', signers }));
  const res = await SELF.fetch('https://relay.test/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${APP_KEY}` }, body: form
  });
  expect(res.status).toBe(201);
  return res.json();
}

async function signTokenOf(sessionId) {
  const html = await (await SELF.fetch(`https://relay.test/s/${sessionId}`)).text();
  return html.match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
}

// Encode base64url UTF-8 (symétrique du décodage relais), comme le fera sign.js.
function b64urlJson(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('POST /api/sessions/:id/verify-email', () => {
  it('401 sans token de signature', async () => {
    const { sessionId } = await createSession([{ role: 'locataire', email: 'jean@x.fr', ordre: 0 }]);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/verify-email`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'jean@x.fr' })
    });
    expect(res.status).toBe(401);
  });

  it('{ok:false} si l\'email ne correspond pas (anti-transfert)', async () => {
    const { sessionId } = await createSession([{ role: 'locataire', email: 'jean@x.fr', ordre: 0 }]);
    const token = await signTokenOf(sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/verify-email`, {
      method: 'POST', headers: { 'X-Sign-Token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'pirate@x.fr' })
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
  });

  it('{ok:true} si l\'email correspond (insensible casse + espaces)', async () => {
    const { sessionId } = await createSession([{ role: 'locataire', email: 'jean@x.fr', ordre: 0 }]);
    const token = await signTokenOf(sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/verify-email`, {
      method: 'POST', headers: { 'X-Sign-Token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ email: '  JEAN@X.FR ' })
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

describe('dossier de preuve persisté via X-Sign-Proof', () => {
  it('enregistre vérif email + acte de volonté + horodatages, exposés au propriétaire', async () => {
    const { sessionId, ownerToken } = await createSession([{ role: 'locataire', email: 'jean@x.fr', ordre: 0 }]);
    const token = await signTokenOf(sessionId);

    // 1. Vérif email → emailVerifiedAt marqué côté serveur (autorité).
    await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/verify-email`, {
      method: 'POST', headers: { 'X-Sign-Token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'jean@x.fr' })
    });

    // 2. Envoi du PDF signé + preuve client (acte de volonté + horodatages).
    const proofHeader = b64urlJson({
      signerName: 'Jean Dupont', consentElectronic: true, luApprouve: true,
      openedAt: '2026-06-02T10:00:00.000Z', readCompletedAt: '2026-06-02T10:05:00.000Z'
    });
    const post = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST',
      headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf', 'X-Sign-Proof': proofHeader },
      body: PDF_BYTES
    });
    expect(post.status).toBe(200);

    // 3. Le dossier est exposé au propriétaire.
    const det = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, {
      headers: { 'X-Owner-Token': ownerToken }
    });
    const p = (await det.json()).signers[0].proof;
    expect(p.signerName).toBe('Jean Dupont');
    expect(p.consentElectronic).toBe(true);
    expect(p.luApprouve).toBe(true);
    expect(p.emailVerifiedAt).toMatch(/^20\d\d-/);
    expect(p.openedAt).toBe('2026-06-02T10:00:00.000Z');
    expect(p.readCompletedAt).toBe('2026-06-02T10:05:00.000Z');
    expect(p.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signature sans en-tête preuve : champs client à null, sans planter', async () => {
    const { sessionId, ownerToken } = await createSession([{ role: 'locataire', email: 'jean@x.fr', ordre: 0 }]);
    const token = await signTokenOf(sessionId);
    const post = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST', headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf' }, body: PDF_BYTES
    });
    expect(post.status).toBe(200);
    const det = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}`, {
      headers: { 'X-Owner-Token': ownerToken }
    });
    const p = (await det.json()).signers[0].proof;
    expect(p.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.signerName).toBeNull();
    expect(p.emailVerifiedAt).toBeNull();
  });
});
