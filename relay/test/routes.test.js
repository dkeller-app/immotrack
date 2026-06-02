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
