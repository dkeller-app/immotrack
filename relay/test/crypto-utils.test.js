import { describe, it, expect } from 'vitest';
import { sha256hex, randomHex, emailHash } from '../src/crypto-utils.js';

describe('crypto-utils', () => {
  it('sha256hex retourne un hex 64 chars stable', async () => {
    const h = await sha256hex(new TextEncoder().encode('abc'));
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('randomHex(32) retourne 64 hex chars, différents à chaque appel', () => {
    const a = randomHex(32), b = randomHex(32);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('emailHash normalise (trim + lowercase) avant de hasher', async () => {
    const a = await emailHash('  Camille.Audrin@Gmail.com ');
    const b = await emailHash('camille.audrin@gmail.com');
    expect(a).toBe(b);
  });
});
