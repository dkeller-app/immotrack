// E-MAILS (chantier EMAILS, 15/10/2026) — limites d'envoi sur TOUTES les routes qui envoient, et journaux.
// Routes : /api/sessions/:id/verify-email (code de signature, déclenchable avec le lien), /api/el/accord/code (code de
// l'accord, déclenchable avec le lien du locataire), /el/notifier et /ar/notifier (propriétaire connecté).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { env, SELF, fetchMock } from 'cloudflare:test';
import { Hono } from 'hono';
import { createSession } from '../src/sessions.js';
import { emailHash } from '../src/crypto-utils.js';
import { registerEspaceLocataireRoutes, registerEspaceLocataireProprietaire } from '../src/espace-locataire.js';
import { _resetSessionPourTests } from '../src/el-supabase.js';
import { LIMITES } from '../src/email-limites.js';

let journaux = [];
beforeEach(() => {
  journaux = [];
  for (const k of ['log', 'info', 'warn', 'error']) vi.spyOn(console, k).mockImplementation((...a) => { journaux.push(a.map(String).join(' ')); });
});
afterEach(() => vi.restoreAllMocks());

// ─── Signature à distance ───
async function session(email) {
  const { sessionId } = await createSession(env, {
    bailRef: 'LOG-014', pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]),
    signers: [{ emailHash: await emailHash(email), role: 'locataire', ordre: 1 }],
  });
  const html = await (await SELF.fetch(`https://relay.test/s/${sessionId}`)).text();
  return { id: sessionId, t: html.match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1] };
}
const verif = (s, email) => SELF.fetch(`https://relay.test/api/sessions/${s.id}/verify-email`, {
  method: 'POST', headers: { 'X-Sign-Token': s.t, 'content-type': 'application/json' }, body: JSON.stringify({ email }),
});

describe('signature à distance : code par e-mail (verify-email)', () => {
  it(`au plus ${LIMITES.OTP_SIGNATAIRE_HEURE} codes par heure pour un signataire, puis 429 « limite »`, async () => {
    const s = await session('sig1@example.test');
    for (let i = 0; i < LIMITES.OTP_SIGNATAIRE_HEURE; i++) expect((await verif(s, 'sig1@example.test')).status).toBe(200);
    const r = await verif(s, 'sig1@example.test');
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ ok: false, error: 'limite' });
  });
  it(`anti-oracle : ${LIMITES.VERIF_EMAIL_ECHECS_HEURE} adresses refusées par heure, puis 429 même pour la bonne`, async () => {
    const s = await session('sig2@example.test');
    for (let i = 0; i < LIMITES.VERIF_EMAIL_ECHECS_HEURE; i++) expect((await (await verif(s, `essai${i}@example.test`)).json()).ok).toBe(false);
    expect((await verif(s, 'sig2@example.test')).status).toBe(429);
  });
  it('la limite est propre à la session (une autre session n\'est pas touchée)', async () => {
    const a = await session('sig3@example.test'), b = await session('sig3@example.test');
    for (let i = 0; i < LIMITES.OTP_SIGNATAIRE_HEURE; i++) await verif(a, 'sig3@example.test');
    expect((await verif(a, 'sig3@example.test')).status).toBe(429);
    expect((await verif(b, 'sig3@example.test')).status).toBe(200);
  });
  it('mode dev : ni l\'adresse ni le code dans les journaux', async () => {
    const s = await session('sig4@example.test');
    const j = await (await verif(s, 'sig4@example.test')).json();
    expect(j.devCode).toMatch(/^\d{6}$/);
    const t = journaux.join('\n');
    expect(t).not.toContain('sig4@example.test');
    expect(t).not.toContain(j.devCode);
  });
});

// ─── Espace locataire ───
const BASE = String(env.SUPABASE_URL).replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const E = { ...env, EL_RELAIS_EMAIL: 'relais@example.test', EL_RELAIS_MOT_DE_PASSE: 'mot-de-passe-de-test' };
beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
beforeEach(() => _resetSessionPourTests());
const identite = () => fetchMock.get(ORIGIN).intercept({ path: '/auth/v1/token?grant_type=password', method: 'POST' })
  .reply(200, { access_token: 'jwt-relais', expires_in: 3600 }, { headers: { 'content-type': 'application/json' } }).persist();
const repond = (fn, corps, n = 1) => fetchMock.get(ORIGIN).intercept({ path: '/rest/v1/rpc/' + fn, method: 'POST' })
  .reply(200, JSON.stringify(corps), { headers: { 'content-type': 'application/json' } }).times(n);

describe('espace locataire : code de l\'accord (/api/el/accord/code)', () => {
  it(`${LIMITES.CODE_ACCORD_HEURE} codes par heure et par accès, destinataire lu en base ; rien de personnel journalisé`, async () => {
    identite();
    repond('el_contact', { email: 'loc.accord@example.test' }, LIMITES.CODE_ACCORD_HEURE + 1);
    const envoyes = [];
    const sender = { sendModele: async (m) => { envoyes.push(m); return { sent: true }; } };
    const mini = new Hono(); registerEspaceLocataireRoutes(mini, { sender });
    const jeton = 'C'.repeat(40) + Math.random().toString(36).slice(2, 5).padEnd(3, 'x');
    const E2 = { ...E, EL_CODE_ACCORD: 'true', EMAIL_MODE: 'resend' };
    const appel = () => mini.request('/api/el/accord/code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-El-Jeton': jeton, to: 'pirate@evil.test' }, body: JSON.stringify({ to: 'pirate@evil.test' }) }, E2);
    for (let i = 0; i < LIMITES.CODE_ACCORD_HEURE; i++) {
      const r = await appel();
      expect(r.status).toBe(200);
      expect((await r.json()).a).toMatch(/^l•••@e•••\.test$/);
    }
    expect((await appel()).status).toBe(429);
    expect(envoyes).toHaveLength(LIMITES.CODE_ACCORD_HEURE);
    expect(envoyes.every((m) => m.to === 'loc.accord@example.test' && m.type === 'code_accord' && /^\d{6}$/.test(m.donnees.code))).toBe(true);
    const t = journaux.join('\n');
    expect(t).not.toContain('loc.accord@example.test');
    for (const m of envoyes) expect(t).not.toContain(m.donnees.code);
  });
  it('envoi impossible → 502 « envoi » ; quota global atteint → 429 « limite »', async () => {
    identite();
    repond('el_contact', { email: 'loc.panne@example.test' }, 2);
    const E2 = { ...E, EL_CODE_ACCORD: 'true', EMAIL_MODE: 'resend' };
    const jeton = 'D'.repeat(40) + Math.random().toString(36).slice(2, 5).padEnd(3, 'x');
    const h = { 'Content-Type': 'application/json', 'X-El-Jeton': jeton };
    const panne = new Hono(); registerEspaceLocataireRoutes(panne, { sender: { sendModele: async () => ({ sent: false, error: 'reseau' }) } });
    const r1 = await panne.request('/api/el/accord/code', { method: 'POST', headers: h, body: '{}' }, E2);
    expect(r1.status).toBe(502); expect((await r1.json()).erreur).toBe('envoi');
    const quota = new Hono(); registerEspaceLocataireRoutes(quota, { sender: { sendModele: async () => ({ sent: false, error: 'quota' }) } });
    const r2 = await quota.request('/api/el/accord/code', { method: 'POST', headers: h, body: '{}' }, E2);
    expect(r2.status).toBe(429);
  });
});

describe('espace locataire : avis du propriétaire (/el/notifier), aligné sur /ar/notifier', () => {
  it(`${LIMITES.LIEN_HEURE} e-mails par accès et par heure, puis 429 ; un autre accès n'est pas touché`, async () => {
    const accesA = crypto.randomUUID(), accesB = crypto.randomUUID(), user = crypto.randomUUID();
    fetchMock.get(ORIGIN).intercept({ path: '/rest/v1/rpc/el_acces_contact', method: 'POST' })
      .reply(200, JSON.stringify({ email: 'loc.avis@example.test', bailleur: 'SCI Dupont' }), { headers: { 'content-type': 'application/json' } }).times(LIMITES.LIEN_HEURE + 2);
    const envoyes = [];
    const mini = new Hono();
    registerEspaceLocataireProprietaire(mini, { requireSupabaseUser: async () => ({ userId: user }), sender: { sendModele: async (m) => { envoyes.push(m); return { sent: true }; } } });
    const notifier = (acces) => mini.request('/el/notifier', { method: 'POST', headers: { Authorization: 'Bearer jwt-proprio', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'document', acces_id: acces, titre: 'Quittance' }) }, E);
    for (let i = 0; i < LIMITES.LIEN_HEURE; i++) expect((await notifier(accesA)).status).toBe(200);
    expect((await notifier(accesA)).status).toBe(429);
    expect((await notifier(accesB)).status).toBe(200);
    expect(envoyes).toHaveLength(LIMITES.LIEN_HEURE + 1);
    expect(journaux.join('\n')).not.toContain('loc.avis@example.test');
  });
  it('accès refusé par la base : 403 AVANT tout compteur (un tiers ne peut pas épuiser le quota d\'un lien)', async () => {
    const acces = crypto.randomUUID(), user = crypto.randomUUID();
    fetchMock.get(ORIGIN).intercept({ path: '/rest/v1/rpc/el_acces_contact', method: 'POST' })
      .reply(403, JSON.stringify({ code: '42501', message: 'el:interdit' }), { headers: { 'content-type': 'application/json' } }).times(5);
    const mini = new Hono();
    registerEspaceLocataireProprietaire(mini, { requireSupabaseUser: async () => ({ userId: user }), sender: { sendModele: async () => ({ sent: true }) } });
    for (let i = 0; i < 5; i++) {
      const r = await mini.request('/el/notifier', { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'message', acces_id: acces }) }, E);
      expect(r.status).toBe(403);
    }
    expect(await env.SESSIONS_KV.get('lim:eln:lien:h:' + acces)).toBeNull();
  });
});
