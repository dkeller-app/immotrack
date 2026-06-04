import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  putMeta, getMeta, putOriginalPdf, getOriginalPdf, putSignedPdf, getSignedPdf,
  putCand, getCand, delCand, putPiece, getPiece, delPiece, candidatureTtl
} from '../src/storage.js';

describe('storage KV', () => {
  it('putMeta puis getMeta restitue l\'objet', async () => {
    await putMeta(env, 'sid-1', { hello: 'world', n: 2 });
    const got = await getMeta(env, 'sid-1');
    expect(got).toEqual({ hello: 'world', n: 2 });
  });

  it('getMeta retourne null si absent', async () => {
    const got = await getMeta(env, 'sid-inexistant');
    expect(got).toBeNull();
  });
});

describe('storage PDF (KV)', () => {
  it('putOriginalPdf puis getOriginalPdf restitue les octets', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
    await putOriginalPdf(env, 'sid-2', bytes);
    const buf = await getOriginalPdf(env, 'sid-2');
    const out = new Uint8Array(buf);
    expect(out).toEqual(bytes);
  });

  it('putSignedPdf puis getSignedPdf restitue les octets', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 9]);
    await putSignedPdf(env, 'sid-3', bytes);
    const buf = await getSignedPdf(env, 'sid-3');
    const out = new Uint8Array(buf);
    expect(out).toEqual(bytes);
  });

  it('getSignedPdf retourne null si absent', async () => {
    const buf = await getSignedPdf(env, 'sid-inexistant');
    expect(buf).toBeNull();
  });
});

describe('storage candidature (KV)', () => {
  it('putCand puis getCand restitue l\'objet', async () => {
    await putCand(env, 'lid-1', { linkId: 'lid-1', status: 'open' }, 3600);
    expect(await getCand(env, 'lid-1')).toEqual({ linkId: 'lid-1', status: 'open' });
  });
  it('getCand retourne null si absent', async () => {
    expect(await getCand(env, 'lid-absent')).toBeNull();
  });
  it('delCand supprime', async () => {
    await putCand(env, 'lid-2', { linkId: 'lid-2' }, 3600);
    await delCand(env, 'lid-2');
    expect(await getCand(env, 'lid-2')).toBeNull();
  });
  it('putPiece/getPiece restitue les octets, delPiece supprime', async () => {
    const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 7, 8]);
    await putPiece(env, 'lid-3', 'p1', bytes, 3600);
    expect(new Uint8Array(await getPiece(env, 'lid-3', 'p1'))).toEqual(bytes);
    await delPiece(env, 'lid-3', 'p1');
    expect(await getPiece(env, 'lid-3', 'p1')).toBeNull();
  });
  it('candidatureTtl = expDays*86400 + grâce 7 j', () => {
    expect(candidatureTtl(14)).toBe(14 * 86400 + 7 * 86400);
  });
});
