import { describe, it, expect } from 'vitest';
import { createToken, verifyToken } from '../src/tokens.js';

const SECRET = 'unit-test-secret-unit-test-secret-unit-test';

describe('tokens', () => {
  it('round-trip : un token créé est vérifiable et rend son payload', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createToken({ sid: 'abc', role: 'signer', idx: 1, jti: 'j1', exp }, SECRET);
    const res = await verifyToken(tok, SECRET);
    expect(res.valid).toBe(true);
    expect(res.payload).toMatchObject({ sid: 'abc', role: 'signer', idx: 1, jti: 'j1' });
  });

  it('rejette une signature falsifiée', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createToken({ sid: 'abc', role: 'owner', jti: 'j1', exp }, SECRET);
    const tampered = tok.slice(0, -2) + (tok.endsWith('A') ? 'BB' : 'AA');
    const res = await verifyToken(tampered, SECRET);
    expect(res.valid).toBe(false);
  });

  it('rejette un token expiré', async () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const tok = await createToken({ sid: 'abc', role: 'owner', jti: 'j1', exp }, SECRET);
    const res = await verifyToken(tok, SECRET);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe('expired');
  });

  it('rejette un token signé avec un autre secret', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createToken({ sid: 'abc', role: 'owner', jti: 'j1', exp }, SECRET);
    const res = await verifyToken(tok, 'un-autre-secret-different-un-autre-secret');
    expect(res.valid).toBe(false);
  });

  it('rejette un token malformé', async () => {
    const res = await verifyToken('pas-un-token', SECRET);
    expect(res.valid).toBe(false);
  });
});
