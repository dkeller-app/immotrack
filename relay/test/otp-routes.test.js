import { describe, it, expect } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { createSession, loadSession } from '../src/sessions.js';
import { emailHash } from '../src/crypto-utils.js';

async function freshSession(email = 'a@b.fr') {
  const { sessionId } = await createSession(env, {
    bailRef: 'LOG-014',
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]),
    signers: [{ emailHash: await emailHash(email), role: 'locataire', ordre: 1 }],
  });
  return sessionId;
}
async function signTokenOf(sessionId) {
  const res = await SELF.fetch(`https://relay.test/s/${sessionId}`);
  return (await res.text()).match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1];
}
async function post(sessionId, route, token, body) {
  return SELF.fetch(`https://relay.test/api/sessions/${sessionId}/${route}`, {
    method: 'POST',
    headers: { 'X-Sign-Token': token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('verify-email → envoie le code (mode dev : devCode retourné)', () => {
  it('email correct → ok + otpSent + devCode 6 chiffres', async () => {
    const id = await freshSession();
    const t = await signTokenOf(id);
    const r = await post(id, 'verify-email', t, { email: 'a@b.fr' });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.ok).toBe(true);
    expect(j.otpSent).toBe(true);
    expect(j.devCode).toMatch(/^[0-9]{6}$/);
  });
  it('email faux → ok:false, aucun code', async () => {
    const id = await freshSession();
    const t = await signTokenOf(id);
    const j = await (await post(id, 'verify-email', t, { email: 'wrong@b.fr' })).json();
    expect(j.ok).toBe(false);
    expect(j.otpSent).toBeUndefined();
  });
  it('401 sans token de signataire', async () => {
    const id = await freshSession();
    const r = await SELF.fetch(`https://relay.test/api/sessions/${id}/verify-email`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.fr' }),
    });
    expect(r.status).toBe(401);
  });
});

describe('verify-otp', () => {
  it('bon code → verified:true + otpVerifiedAt posé', async () => {
    const id = await freshSession();
    const t = await signTokenOf(id);
    const e = await (await post(id, 'verify-email', t, { email: 'a@b.fr' })).json();
    const r = await post(id, 'verify-otp', t, { code: e.devCode });
    expect((await r.json()).verified).toBe(true);
    const s = await loadSession(env, id);
    expect(typeof s.signers[0].otpVerifiedAt).toBe('string');
    expect(typeof s.signers[0].emailVerifiedAt).toBe('string');
  });
  it('mauvais code → verified:false', async () => {
    const id = await freshSession();
    const t = await signTokenOf(id);
    await post(id, 'verify-email', t, { email: 'a@b.fr' });
    const j = await (await post(id, 'verify-otp', t, { code: '000000' })).json();
    expect(j.verified).toBe(false);
  });
  it('code consommé : un 2e verify-otp avec l_ancien code échoue (anti-rejeu)', async () => {
    const id = await freshSession();
    const t = await signTokenOf(id);
    const e = await (await post(id, 'verify-email', t, { email: 'a@b.fr' })).json();
    await post(id, 'verify-otp', t, { code: e.devCode });            // consomme
    const j = await (await post(id, 'verify-otp', t, { code: e.devCode })).json();
    expect(j.verified).toBe(false);
  });
});
