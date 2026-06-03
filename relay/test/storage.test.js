import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import {
  putMeta, getMeta, putOriginalPdf, getOriginalPdf, putSignedPdf, getSignedPdf
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
