// E-MAILS — corrections de l'audit (relecture adverse Opus + relecture ciblée Fable, 15/10/2026).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';
import { Hono } from 'hono';
import app from '../src/index.js';
import { createSession, loadSession } from '../src/sessions.js';
import { emailHash } from '../src/crypto-utils.js';
import { makeSender, adresseValide, emailsOperationnels } from '../src/email-sender.js';
import { modeleEmail } from '../src/email-modeles.js';
import { consommer, marge, compter, parHeure, regleGlobale, LIMITES } from '../src/email-limites.js';
import { registerEspaceLocataireProprietaire } from '../src/espace-locataire.js';

function kvMemoire() {
  const m = new Map();
  return { m, async get(k, t) { const v = m.has(k) ? m.get(k) : null; return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); } };
}
// KV qui refuse les écritures (au plus une écriture par seconde sur une clé, en production) ou les lectures.
const kvEcritureRefusee = () => ({ async get() { return null; }, async put() { throw new Error('KV PUT failed: 429 Too Many Requests'); } });
const kvLectureRefusee = () => ({ async get() { throw new Error('KV GET failed'); }, async put() {} });
const ok = () => vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
const RESEND = (kv, extra = {}) => ({ EMAIL_MODE: 'resend', RESEND_API_KEY: 'cle-de-test', EMAIL_FROM: 'ne-pas-repondre@notifications.propryo.fr', SIGNING_SECRET: 's', SESSIONS_KV: kv, ...extra });

let journaux = [];
beforeEach(() => {
  journaux = [];
  for (const k of ['log', 'info', 'warn', 'error']) vi.spyOn(console, k).mockImplementation((...a) => { journaux.push(a.map(String).join(' ')); });
});
afterEach(() => vi.restoreAllMocks());

describe('KV en échec : jamais d\'exception, politique explicite', () => {
  it('écriture refusée : consommer → false par défaut (route d\'un tiers), true si siErreur', async () => {
    expect(await consommer(kvEcritureRefusee(), [parHeure('x', 5)])).toBe(false);
    expect(await consommer(kvEcritureRefusee(), [parHeure('x', 5)], undefined, { siErreur: true })).toBe(true);
    await expect(compter(kvEcritureRefusee(), [parHeure('x', 5)])).resolves.toBeUndefined();
  });
  it('lecture refusée : marge → false (par défaut)', async () => {
    expect(await marge(kvLectureRefusee(), [parHeure('x', 5)])).toBe(false);
  });
  it('envoi : plafond global et destinataire en échec KV → l\'e-mail part quand même (borné ailleurs)', async () => {
    const f = ok();
    expect((await makeSender(RESEND(kvEcritureRefusee()), f).send({ to: 'a@b.fr', code: '123456' })).sent).toBe(true);
    expect(f).toHaveBeenCalledOnce();
  });
});

describe('plafond global en deux réserves (codes / avis)', () => {
  it('une rafale d\'avis n\'empêche pas un code de signature', async () => {
    const kv = kvMemoire(), f = ok();
    const s = makeSender(RESEND(kv, { EMAIL_QUOTA_JOUR: '4' }), f);   // codes 2, avis 2
    expect((await s.sendModele({ to: 'l1@x.fr', type: 'message', donnees: {} })).sent).toBe(true);
    expect((await s.sendModele({ to: 'l2@x.fr', type: 'message', donnees: {} })).sent).toBe(true);
    expect(await s.sendModele({ to: 'l3@x.fr', type: 'message', donnees: {} })).toEqual({ sent: false, error: 'quota' });
    expect((await s.send({ to: 'sig@x.fr', code: '123456' })).sent).toBe(true);
    expect(regleGlobale({}, 'otp_signature').max + regleGlobale({}, 'document').max).toBe(LIMITES.GLOBAL_JOUR);
  });
});

describe('limite par destinataire (renouveler un lien ne remet rien à zéro)', () => {
  it(`${LIMITES.DESTINATAIRE_JOUR} e-mails par jour vers une même adresse, casse comprise ; clé sans l'adresse`, async () => {
    const kv = kvMemoire(), f = ok();
    const s = makeSender(RESEND(kv, { EMAIL_QUOTA_JOUR: '1000' }), f);
    for (let i = 0; i < LIMITES.DESTINATAIRE_JOUR; i++) expect((await s.sendModele({ to: i % 2 ? 'Cible@X.fr' : 'cible@x.fr', type: 'message', donnees: {} })).sent).toBe(true);
    expect((await s.sendModele({ to: 'cible@x.fr', type: 'message', donnees: {} })).error).toBe('quota');
    expect((await s.sendModele({ to: 'autre@x.fr', type: 'message', donnees: {} })).sent).toBe(true);
    const cles = [...kv.m.keys()].join(' ');
    expect(cles).not.toMatch(/cible|@/i);
    expect(journaux.join('\n')).not.toMatch(/cible/i);
  });
});

describe('adresses et configuration', () => {
  it('partie locale ASCII seulement (signe Kelvin refusé)', () => {
    expect(adresseValide('jean.K@x.fr')).toBe(true);
    expect(adresseValide('jean.' + String.fromCharCode(0x212A) + '@x.fr')).toBe(false);
    expect(adresseValide('é@x.fr')).toBe(false);
  });
  it('emailsOperationnels : mode resend ET clé ET expéditeur valide', () => {
    expect(emailsOperationnels({ EMAIL_MODE: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.fr' })).toBe(true);
    expect(emailsOperationnels({ EMAIL_MODE: 'resend', EMAIL_FROM: 'a@b.fr' })).toBe(false);
    expect(emailsOperationnels({ EMAIL_MODE: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'x' })).toBe(false);
    expect(emailsOperationnels({ EMAIL_MODE: 'dev', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.fr' })).toBe(false);
  });
  it('/el/etat : configuration incomplète = e-mails inactifs', async () => {
    const r = await app.request('/el/etat', {}, { ...env, EMAIL_MODE: 'resend', RESEND_API_KEY: '' });
    expect((await r.json()).emails).toBe(false);
  });
});

describe('modèles : grammaire quand le nom est inconnu, bailleur du code de signature', () => {
  it('« au bailleur » / « au propriétaire », jamais « à le »', () => {
    for (const t of ['document', 'message', 'invitation_artisan', 'otp_signature']) {
      const m = modeleEmail(t, { lien: 'https://r.test/a#x', code: '123456', titre: 'Bail' }, { repondre: true });
      expect(m.texte).not.toMatch(/\bà le\b|\bde le\b/);
    }
    expect(modeleEmail('message', {}).texte).toMatch(/adressez-vous directement au bailleur\./);
    expect(modeleEmail('invitation_artisan', { lien: 'https://r.test/a#x' }).texte).toMatch(/directement au propriétaire\./);
  });
  it('titre : seulement une famille de titres de l\'app ; numéro de téléphone refusé', () => {
    expect(modeleEmail('document', { titre: 'Quittance de mars 2026 (réédition du 15/10/2026)' }).texte).toMatch(/réédition du 15\/10\/2026/);
    expect(modeleEmail('document', { titre: 'Votre colis est bloqué' }).texte).toMatch(/disponible : document\./);
    expect(modeleEmail('document', { titre: 'Quittance — appelez le 08 99 12 34 56' }).texte).toMatch(/disponible : document\./);
    expect(modeleEmail('message', { bailleur: 'SCI appelez +33 6 12 34 56 78' }).texte).toMatch(/^De la part de votre bailleur/);
  });
  it('code de signature : nom du bailleur enregistré sur la session', async () => {
    const f = ok();
    await makeSender(RESEND(kvMemoire()), f).send({ to: 'a@b.fr', code: '123456', bailleur: 'SCI Dupont' });
    expect(JSON.parse(f.mock.calls[0][1].body).text).toMatch(/^De la part de SCI Dupont via Propryo/);
  });
});

// ─── Routes ───
beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
const E_RESEND = { ...env, EMAIL_MODE: 'resend', RESEND_API_KEY: 'cle-de-test', EMAIL_FROM: 'ne-pas-repondre@notifications.propryo.fr' };
async function sessionSignature(email, bailleur) {
  const { sessionId } = await createSession(env, {
    bailRef: 'LOG-1', pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]), bailleur,
    signers: [{ emailHash: await emailHash(email), role: 'locataire', ordre: 1 }],
  });
  const html = await (await app.request(`https://relay.test/s/${sessionId}`, {}, E_RESEND)).text();
  return { id: sessionId, t: html.match(/window\.__SIGN_TOKEN__\s*=\s*"([^"]+)"/)[1] };
}
const verif = (s, email) => app.request(`https://relay.test/api/sessions/${s.id}/verify-email`, {
  method: 'POST', headers: { 'X-Sign-Token': s.t, 'content-type': 'application/json' }, body: JSON.stringify({ email }),
}, E_RESEND);
const resend = (statut) => fetchMock.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' })
  .reply((o) => ({ statusCode: statut, data: statut === 200 ? '{"id":"e1"}' : '{"message":"refus"}', responseOptions: { headers: { 'content-type': 'application/json' } } }));

describe('verify-email en mode resend (fournisseur simulé)', () => {
  it('envoi réussi : otpSent, pas de devCode, bailleur de la session dans l\'e-mail, rien de personnel journalisé', async () => {
    let corps = null;
    fetchMock.get('https://api.resend.com').intercept({ path: '/emails', method: 'POST' })
      .reply((o) => { corps = JSON.parse(o.body); return { statusCode: 200, data: '{"id":"e1"}', responseOptions: { headers: { 'content-type': 'application/json' } } }; });
    const s = await sessionSignature('resend.ok@example.test', 'SCI Les Tilleuls');
    const r = await verif(s, 'resend.ok@example.test');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toEqual({ ok: true, otpSent: true });
    expect(corps.to).toEqual(['resend.ok@example.test']);
    expect(corps.text).toMatch(/^De la part de SCI Les Tilleuls via Propryo/);
    const code = corps.text.match(/\n(\d{6})\n/)[1];
    expect(journaux.join('\n')).not.toMatch(new RegExp('resend\\.ok|' + code));
    expect((await loadSession(env, s.id)).signers[0].otp.delivery).toBe('email');
  });
  it('refus du fournisseur : 502 { ok:false, error:"send-failed" } (la page ne dit pas « code envoyé »)', async () => {
    resend(500);
    const s = await sessionSignature('resend.ko@example.test');
    const r = await verif(s, 'resend.ko@example.test');
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ ok: false, otpSent: false, error: 'send-failed' });
  });
});

describe('/el/notifier : un modèle invalide ne consomme pas le quota du lien', () => {
  it('invitation dont le lien serait en http (origine non sûre) → 400, aucun compteur', async () => {
    const acces = crypto.randomUUID();
    const BASE = String(env.SUPABASE_URL).replace(/\/+$/, '');
    fetchMock.get(new URL(BASE).origin).intercept({ path: '/rest/v1/rpc/el_acces_contact', method: 'POST' })
      .reply(200, JSON.stringify({ email: 'loc.modele@example.test', bailleur: 'SCI Dupont' }), { headers: { 'content-type': 'application/json' } });
    const mini = new Hono();
    registerEspaceLocataireProprietaire(mini, { requireSupabaseUser: async () => ({ userId: crypto.randomUUID() }), sender: { sendModele: async () => ({ sent: true }) } });
    const r = await mini.request('http://relais.example/el/notifier', { method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'invitation', acces_id: acces, jeton: 'Z'.repeat(43) }) }, env);
    expect(r.status).toBe(400);
    expect(await env.SESSIONS_KV.get('lim:eln:lien:h:' + acces)).toBeNull();
  });
});
