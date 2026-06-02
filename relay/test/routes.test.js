import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { emailHash } from '../src/crypto-utils.js';
import { verifyToken } from '../src/tokens.js';

describe('GET /health', () => {
  it('répond 200 avec ok:true', async () => {
    const res = await SELF.fetch('https://relay.test/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

function pdfForm(meta) {
  const form = new FormData();
  const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3])], { type: 'application/pdf' });
  form.set('pdf', pdf, 'bail.pdf');
  form.set('meta', JSON.stringify(meta));
  return form;
}

describe('POST /sessions', () => {
  const META = { bailRef: 'BAIL-1', signers: [{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }] };

  it('rejette 401 sans APP_KEY', async () => {
    const res = await SELF.fetch('https://relay.test/sessions', { method: 'POST', body: pdfForm(META) });
    expect(res.status).toBe(401);
  });

  it('crée la session et renvoie sessionId + signUrl + ownerToken valides', async () => {
    const res = await SELF.fetch('https://relay.test/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.APP_KEY}` },
      body: pdfForm(META)
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sessionId).toMatch(/^[0-9a-f]{64}$/);
    expect(body.signUrl).toContain(`/s/${body.sessionId}`);
    const ver = await verifyToken(body.ownerToken, env.SIGNING_SECRET);
    expect(ver.valid).toBe(true);
    expect(ver.payload.role).toBe('owner');
    expect(ver.payload.sid).toBe(body.sessionId);
  });
});

async function createTestSession(signers) {
  const form = new FormData();
  form.set('pdf', new Blob([new Uint8Array([0x25,0x50,0x44,0x46,1])], { type: 'application/pdf' }), 'b.pdf');
  form.set('meta', JSON.stringify({ bailRef: 'B', signers }));
  const res = await SELF.fetch('https://relay.test/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.APP_KEY}` }, body: form
  });
  return res.json();
}

describe('GET /s/:id', () => {
  it('404 si session inconnue', async () => {
    const res = await SELF.fetch('https://relay.test/s/deadbeef');
    expect(res.status).toBe(404);
  });

  it('sert une page HTML qui injecte un signToken valide du signataire courant', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    const m = html.match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    const ver = await verifyToken(m[1], env.SIGNING_SECRET);
    expect(ver.valid).toBe(true);
    expect(ver.payload.role).toBe('signer');
    expect(ver.payload.idx).toBe(0);
    expect(ver.payload.sid).toBe(sessionId);
  });
});

describe('GET /api/sessions/:id/pdf', () => {
  async function signTokenOf(sessionId) {
    const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
    const html = await res.text();
    return html.match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
  }

  it('401 sans token', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/pdf`);
    expect(res.status).toBe(401);
  });

  it('renvoie le PDF original avec un signToken valide', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const token = await signTokenOf(sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/pdf`, {
      headers: { 'X-Sign-Token': token }
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x25); // %
  });

  it('401 si le token cible une session différente', async () => {
    const a = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const b = await createTestSession([{ role: 'locataire', email: 'c@d.fr', tel: '', ordre: 1 }]);
    const tokenA = await signTokenOf(a.sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${b.sessionId}/pdf`, {
      headers: { 'X-Sign-Token': tokenA }
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/sessions/:id/signed', () => {
  async function signTokenOf(sessionId) {
    const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
    return (await res.text()).match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
  }
  const signedPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 8, 8, 8]);

  it('rejette un upload non-PDF (400)', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const token = await signTokenOf(sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST',
      headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf' },
      body: new Uint8Array([1, 2, 3, 4])
    });
    expect(res.status).toBe(400);
  });

  it('accepte le PDF signé, complète la session mono-signataire', async () => {
    const { sessionId } = await createTestSession([{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }]);
    const token = await signTokenOf(sessionId);
    const res = await SELF.fetch(`https://relay.test/api/sessions/${sessionId}/signed`, {
      method: 'POST',
      headers: { 'X-Sign-Token': token, 'content-type': 'application/pdf', 'CF-Connecting-IP': '9.9.9.9' },
      body: signedPdf
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
  });
});
