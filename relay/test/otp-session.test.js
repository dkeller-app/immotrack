import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  createSession, recordOtpSent, recordOtpVerified, recordOtpAttempt, loadSession,
} from '../src/sessions.js';
import { emailHash } from '../src/crypto-utils.js';

async function freshSession() {
  const { sessionId } = await createSession(env, {
    bailRef: 'LOG-014',
    pdfBytes: new Uint8Array([1, 2, 3]),
    signers: [{ emailHash: await emailHash('a@b.fr'), role: 'locataire', ordre: 1 }],
  });
  return sessionId;
}

describe('recordOtpSent', () => {
  it('pose hash + expiresAt + attempts=0 sur le signataire courant', async () => {
    const id = await freshSession();
    await recordOtpSent(env, id, 'deadbeef', 1_111);
    const s = await loadSession(env, id);
    expect(s.signers[0].otp).toEqual({ hash: 'deadbeef', expiresAt: 1_111, attempts: 0, delivery: 'ecran-test' });
  });
});

describe('recordOtpAttempt', () => {
  it('incrémente attempts', async () => {
    const id = await freshSession();
    await recordOtpSent(env, id, 'deadbeef', 1_111);
    await recordOtpAttempt(env, id);
    await recordOtpAttempt(env, id);
    const s = await loadSession(env, id);
    expect(s.signers[0].otp.attempts).toBe(2);
  });
});

describe('recordOtpVerified', () => {
  it('pose otpVerifiedAt + otpChannel + emailVerifiedAt et consomme le code', async () => {
    const id = await freshSession();
    await recordOtpSent(env, id, 'deadbeef', 1_111);
    await recordOtpVerified(env, id);
    const s = await loadSession(env, id);
    expect(typeof s.signers[0].otpVerifiedAt).toBe('string');
    expect(s.signers[0].otpChannel).toBe('email');
    expect(s.signers[0].otpDelivery).toBe('ecran-test');   // par défaut : mode test (code affiché), jamais « e-mail »
    expect(typeof s.signers[0].emailVerifiedAt).toBe('string');
    expect(s.signers[0].otp.hash).toBeNull();
  });
});

describe('recordOtpVerified — remise réelle du code', () => {
  it('code ENVOYÉ par e-mail → otpDelivery email', async () => {
    const id = await freshSession();
    await recordOtpSent(env, id, 'deadbeef', 1_111, 'email');
    await recordOtpVerified(env, id);
    expect((await loadSession(env, id)).signers[0].otpDelivery).toBe('email');
  });
  it("la remise décidée à l'envoi fait foi (mode changé entre envoi et saisie)", async () => {
    const id = await freshSession();
    await recordOtpSent(env, id, 'deadbeef', 1_111, 'ecran-test');
    await recordOtpVerified(env, id, { delivery: 'email' });
    expect((await loadSession(env, id)).signers[0].otpDelivery).toBe('ecran-test');
  });
});

describe('createSession — nom du bail', () => {
  it('nom conservé (borné à 120), absent → chaîne vide', async () => {
    const { session } = await createSession(env, { bailRef: 'X', pdfBytes: new Uint8Array([1]), signers: [
      { emailHash: 'h1', role: 'locataire', ordre: 1, nom: '  BERLENGA Baptiste  ' },
      { emailHash: 'h2', role: 'locataire', ordre: 2, nom: 'x'.repeat(300) },
      { emailHash: 'h3', role: 'locataire', ordre: 3 }
    ] });
    expect(session.signers.map((s) => s.nom.length)).toEqual([17, 120, 0]);
    expect(session.signers[0].nom).toBe('BERLENGA Baptiste');
  });
});
