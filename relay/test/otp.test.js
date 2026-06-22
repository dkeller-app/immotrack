import { describe, it, expect } from 'vitest';
import { generateCode, hashCode, verifyCode, otpUsable, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from '../src/otp.js';

describe('generateCode', () => {
  it('rend exactement 6 chiffres', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateCode()).toMatch(/^[0-9]{6}$/);
    }
  });
  it('varie (pas une constante)', () => {
    const s = new Set(Array.from({ length: 30 }, () => generateCode()));
    expect(s.size).toBeGreaterThan(1);
  });
});

describe('hashCode / verifyCode', () => {
  it('le hash diffère du code en clair et est un sha256 hex', async () => {
    const h = await hashCode('sess-abc', '472915');
    expect(h).not.toContain('472915');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('lié à la session : même code + sessionId différent → hash différent', async () => {
    expect(await hashCode('sess-a', '111111')).not.toBe(await hashCode('sess-b', '111111'));
  });
  it('verifyCode : bon code → true, mauvais → false, trim, hash null → false', async () => {
    const h = await hashCode('sess-x', '472915');
    expect(await verifyCode('sess-x', '472915', h)).toBe(true);
    expect(await verifyCode('sess-x', '000000', h)).toBe(false);
    expect(await verifyCode('sess-x', ' 472915 ', h)).toBe(true);
    expect(await verifyCode('sess-x', '472915', null)).toBe(false);
    expect(await verifyCode('sess-x', 472915, h)).toBe(false); // non-string
  });
});

describe('otpUsable', () => {
  const now = 1_000_000;
  it('valide si non expiré et tentatives restantes', () => {
    expect(otpUsable({ hash: 'x', expiresAt: now + 1000, attempts: 0 }, now)).toBe(true);
  });
  it('faux si expiré', () => {
    expect(otpUsable({ hash: 'x', expiresAt: now - 1, attempts: 0 }, now)).toBe(false);
  });
  it('faux si tentatives épuisées', () => {
    expect(otpUsable({ hash: 'x', expiresAt: now + 1000, attempts: OTP_MAX_ATTEMPTS }, now)).toBe(false);
  });
  it('faux si pas de hash / null', () => {
    expect(otpUsable(null, now)).toBe(false);
    expect(otpUsable({ expiresAt: now + 1000 }, now)).toBe(false);
  });
});

describe('constantes', () => {
  it('TTL 10 min, max 5 tentatives', () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });
});
