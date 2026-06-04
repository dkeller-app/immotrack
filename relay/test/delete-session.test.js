import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index.js';

async function createSession() {
  const fd = new FormData();
  fd.set('pdf', new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' }), 'b.pdf');
  fd.set('meta', JSON.stringify({ bailRef: 'L1-2026', signers: [{ role: 'locataire', nom: 'X', email: 'x@y.fr', ordre: 1 }] }));
  const res = await app.request('/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${env.APP_KEY}` }, body: fd
  }, env);
  return res.json();
}

describe('DELETE /api/sessions/:id', () => {
  it('purge la session avec un X-Owner-Token valide → 204, puis GET → 404', async () => {
    const { sessionId, ownerToken } = await createSession();
    const del = await app.request(`/api/sessions/${sessionId}`, {
      method: 'DELETE', headers: { 'X-Owner-Token': ownerToken }
    }, env);
    expect(del.status).toBe(204);
    const after = await app.request(`/api/sessions/${sessionId}`, {
      method: 'GET', headers: { 'X-Owner-Token': ownerToken }
    }, env);
    expect(after.status).toBe(404);
  });

  it('refuse sans token → 401', async () => {
    const { sessionId } = await createSession();
    const del = await app.request(`/api/sessions/${sessionId}`, { method: 'DELETE' }, env);
    expect(del.status).toBe(401);
  });

  it('idempotent : re-DELETE → 204 ou 404', async () => {
    const { sessionId, ownerToken } = await createSession();
    await app.request(`/api/sessions/${sessionId}`, { method: 'DELETE', headers: { 'X-Owner-Token': ownerToken } }, env);
    const again = await app.request(`/api/sessions/${sessionId}`, { method: 'DELETE', headers: { 'X-Owner-Token': ownerToken } }, env);
    expect([204, 404]).toContain(again.status);
  });
});
