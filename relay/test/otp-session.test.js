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
    expect(s.signers[0].otp).toEqual({ hash: 'deadbeef', expiresAt: 1_111, attempts: 0 });
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
    expect(typeof s.signers[0].emailVerifiedAt).toBe('string');
    expect(s.signers[0].otp.hash).toBeNull();
  });
});
