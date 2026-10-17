// Pages et réponses qui portent un jeton (signataire, candidat, propriétaire) : jamais en cache (proxy,
// navigateur partagé), jamais affichées dans un cadre tiers, jamais de Referer vers un tiers.
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { appToken } from './_auth.js';
import { makeBailBytes } from './_fixtures.js';

const attendre = (res) => {
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('x-frame-options')).toBe('DENY');
  expect(res.headers.get('content-security-policy') || '').toContain("frame-ancestors 'none'");
};

async function creerSession() {
  const form = new FormData();
  form.set('pdf', new Blob([await makeBailBytes(2)], { type: 'application/pdf' }), 'b.pdf');
  form.set('meta', JSON.stringify({ bailRef: 'B', signers: [{ role: 'locataire', email: 'a@b.fr', tel: '', ordre: 1 }] }));
  const res = await SELF.fetch('https://relay.test/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${await appToken()}` }, body: form
  });
  return res;
}

describe('en-têtes des pages porteuses de jeton', () => {
  it('/s/:id (page de signature, contient le jeton du signataire)', async () => {
    const cree = await creerSession();
    expect(cree.headers.get('cache-control')).toBe('no-store');   // la réponse porte le jeton propriétaire
    const { sessionId } = await cree.json();
    attendre(await SELF.fetch(`https://relay.test/s/${sessionId}`));
  });
  it('/s/:id inconnu (page d\'erreur) : mêmes en-têtes', async () => {
    attendre(await SELF.fetch('https://relay.test/s/deadbeef'));
  });
  it('/d/:id inconnu : mêmes en-têtes', async () => {
    attendre(await SELF.fetch('https://relay.test/d/deadbeef'));
  });
  it('API des sessions : pas de cache', async () => {
    const res = await SELF.fetch('https://relay.test/api/sessions/deadbeef/pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
