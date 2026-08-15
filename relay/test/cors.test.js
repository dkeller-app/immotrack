import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index.js';

const ALLOWED = 'https://didierkeller.github.io';

describe('CORS', () => {
  it('répond au preflight OPTIONS avec les bons en-têtes', async () => {
    const res = await app.request('/api/sessions/abc', {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED,
        'Access-Control-Request-Method': 'DELETE',
        'Access-Control-Request-Headers': 'X-Owner-Token'
      }
    }, env);
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
    const allowH = (res.headers.get('Access-Control-Allow-Headers') || '').toLowerCase();
    expect(allowH).toContain('x-owner-token');
    expect(allowH).toContain('authorization');
  });

  it('ajoute Allow-Origin sur une requête réelle d\'origine autorisée', async () => {
    const res = await app.request('/health', { headers: { Origin: ALLOWED } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
  });

  it('reflète localhost et null (file://)', async () => {
    for (const o of ['http://localhost:5500', 'null']) {
      const res = await app.request('/health', { headers: { Origin: o } }, env);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(o);
    }
  });

  it('ne reflète pas une origine non autorisée', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'https://evil.example.com' }
    }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
