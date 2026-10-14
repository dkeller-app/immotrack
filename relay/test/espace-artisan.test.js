// CIRCUIT D'UN INCIDENT (migration 0060) — routes du relais : lien de l'artisan (/a, /api/ar/*), signalement enrichi et
// créneau du locataire, IA des liens publics (quota par lien imputé au propriétaire), tâches IA.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';
import app from '../src/index.js';
import { appAuth } from './_auth.js';
import { _resetSessionPourTests, rpc } from '../src/el-supabase.js';
import { EL_CSP } from '../src/espace-locataire.js';
import { QUOTA_LIEN } from '../src/ai/public.js';
import { lireUsageJour } from '../src/ai/quota.js';
import * as IL from '../src/ai/tasks/incident-locataire.js';
import * as CA from '../src/ai/tasks/constat-artisan.js';
import * as LF from '../src/ai/tasks/lecture-facture.js';
import { TACHES_LIEN } from '../src/ai/tasks/index.js';

const BASE = String(env.SUPABASE_URL).replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const E = { ...env, EL_RELAIS_EMAIL: 'relais@example.test', EL_RELAIS_MOT_DE_PASSE: 'mot-de-passe-de-test', AI_PROVIDER: 'fake' };
const JETON = 'B'.repeat(43);
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const appels = [];

function monterIdentite() {
  fetchMock.get(ORIGIN).intercept({ path: '/auth/v1/token?grant_type=password', method: 'POST' })
    .reply(200, { access_token: 'jwt-relais', expires_in: 3600 }, { headers: { 'content-type': 'application/json' } }).persist();
}
function rpcRepond(fn, fabrique, statut = 200, fois = 1) {
  const i = fetchMock.get(ORIGIN).intercept({ path: '/rest/v1/rpc/' + fn, method: 'POST' })
    .reply((opts) => { const corps = JSON.parse(opts.body); appels.push({ fn, corps }); return { statusCode: statut, data: JSON.stringify(typeof fabrique === 'function' ? fabrique(corps) : fabrique), responseOptions: { headers: { 'content-type': 'application/json' } } }; });
  if (fois > 1) i.times(fois);
}
const postAr = (path, body, headers = {}) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ar-Jeton': JETON, ...headers }, body: body instanceof Uint8Array ? body : JSON.stringify(body || {}) }, E);
const postEl = (path, body, headers = {}) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-El-Jeton': JETON, ...headers }, body: body instanceof Uint8Array ? body : JSON.stringify(body || {}) }, E);

beforeAll(async () => { await appAuth(); fetchMock.activate(); fetchMock.disableNetConnect(); });
beforeEach(() => { _resetSessionPourTests(); appels.length = 0; });

describe('page /a (artisan)', () => {
  it('HTML sans aucune donnée, mêmes en-têtes de sécurité que /l ; micro autorisé pour la page seulement', async () => {
    const r = await app.request('/a', {}, E);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Security-Policy')).toBe(EL_CSP);
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Permissions-Policy')).toBe('geolocation=(), microphone=(self), camera=(), payment=()');
    const html = await r.text();
    expect(html).toMatch(/\/ar\.js\?v=/); expect(html).not.toMatch(/https?:\/\//);
    const l = await app.request('/l', {}, E);
    expect(l.headers.get('Permissions-Policy')).toMatch(/microphone=\(self\)/);
  });
});

describe('API /api/ar — frontière', () => {
  it('seule l\'EMPREINTE du jeton part vers ar_ouvrir ; réponse enrichie (phrase du plafond, référentiel, IA)', async () => {
    monterIdentite();
    rpcRepond('ar_ouvrir', { actif: true, artisan: 'Plomberie Weber', bailleur: 'SCI Dupont', plafond_ttc: 300, demande: { titre: 'Fuite', photos: [{ index: 0, nom: 'p' }] }, creneau: { date: '2026-10-17', debut: '08:00', fin: '10:00' }, depots: [] });
    const r = await postAr('/api/ar/ouvrir');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(appels[0].corps.p_jeton_sha256).toBe(await sha(JETON));
    expect(JSON.stringify(appels)).not.toContain(JETON);
    expect(j.phrasePlafond).toMatch(/jusqu'à 300 € TTC/);
    expect(j.creneauAccordExpres).toEqual({ exige: true, motif: 'samedi' });
    expect(j.referentiel.constats).toHaveLength(6);
    expect(j.referentiel.devis.ref).toMatch(/Arrêté du 24 janvier 2017/);
    expect(j.ia).toBe(true);
  });
  it('lien inactif : 410 sans donnée ; jeton mal formé : empreinte nulle', async () => {
    monterIdentite();
    rpcRepond('ar_ouvrir', { actif: false });
    const r = await postAr('/api/ar/ouvrir', {}, { 'X-Ar-Jeton': 'court' });
    expect(r.status).toBe(410);
    expect(await r.json()).toEqual({ actif: false });
    expect(appels[0].corps.p_jeton_sha256).toBeNull();
  });
  it('rpc accepte el_* et ar_*, refuse le reste', async () => {
    await expect(rpc(E, 'artisan_acces', {})).rejects.toMatchObject({ statut: 500 });
    await expect(rpc(E, 'arx', {})).rejects.toMatchObject({ statut: 500 });
    // Fonctions réservées aux membres : jamais sous l'identité du relais.
    for (const fn of ['ar_acces_emettre', 'ar_acces_revoquer', 'ar_acces_valider', 'ar_devis_decider', 'ar_acces_contact', 'el_acces_emettre', 'el_acces_contact']) {
      await expect(rpc(E, fn, {})).rejects.toMatchObject({ statut: 500 })
    }
  });
  it('document : montant TTC exigé pour un devis ou une facture ; transmis tel quel (décision du statut par la base)', async () => {
    const r0 = await postAr('/api/ar/document', { type: 'devis', path: 'x/y/files/ar-z.pdf', montant_ttc: '' });
    expect(r0.status).toBe(400);
    monterIdentite();
    rpcRepond('ar_document', { id: 'd1', statut: 'auto_accepte' });
    const r = await postAr('/api/ar/document', { type: 'devis', path: 'x/y/files/ar-z.pdf', montant_ttc: '118,00', numero: 'D-1\nX', nom: 'devis.pdf' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: 'd1', statut: 'auto_accepte' });
    expect(appels[0].corps).toMatchObject({ p_type: 'devis', p_montant_ttc: 118, p_numero: 'D-1 X' });
    const r2 = await postAr('/api/ar/document', { type: 'virement', path: 'p' });
    expect(r2.status).toBe(400);
  });
  it('créneau et constat validés avant la base', async () => {
    expect((await postAr('/api/ar/creneau', { date: '2026-10-17', debut: '10:00', fin: '08:00' })).status).toBe(400);
    expect((await postAr('/api/ar/constat', { constat: 'faute' })).status).toBe(400);
    monterIdentite();
    rpcRepond('ar_constat', true);
    const c = await postAr('/api/ar/constat', { constat: 'exterieure', ampleur: 'petite', resume: 'Joint' });
    expect(c.status).toBe(200);
    expect(appels[0].corps).toMatchObject({ p_constat: 'exterieure', p_sous_type: 'tiers', p_ampleur: 'petite' });
  });
  it('fichier : source et rang bornés', async () => {
    expect((await postAr('/api/ar/fichier', { source: 'bail' })).status).toBe(400);
  });
});

describe('espace locataire — signalement enrichi et créneau (0060)', () => {
  it('signaler : aide de l\'IA nettoyée, téléphone transmis SEULEMENT avec l\'accord', async () => {
    monterIdentite();
    rpcRepond('el_signaler', 'f0f0f0f0-0000-4000-8000-000000000001', 200, 2);
    const base = { piece: 'cuisine', element: 'fuite_eau', urgence: 'importante', description: 'Fuite sous l\'évier', photos: [] };
    await postEl('/api/el/signaler', { ...base, ia: { resume: 'Fuite goutte à goutte', element: 'canalisation', nature: 'fuite', urgences: ['eau', 'licorne'], pirate: 1 }, tel_partage: true, telephone: '06 39 98 12 34', acces_info: 'Code 4719B' });
    expect(appels[0].corps).toMatchObject({ p_ia: { resume: 'Fuite goutte à goutte', element: 'canalisation', urgences: ['eau'] }, p_tel_partage: true, p_telephone: '06 39 98 12 34', p_acces_info: 'Code 4719B' });
    expect(appels[0].corps.p_ia.pirate).toBeUndefined();
    await postEl('/api/el/signaler', { ...base, tel_partage: false, telephone: '06 39 98 12 34' });
    expect(appels[1].corps).toMatchObject({ p_ia: null, p_tel_partage: false, p_telephone: null });
  });
  it('créneau : accord exprès transmis ; refus de la base traduit (accord_requis)', async () => {
    monterIdentite();
    rpcRepond('el_creneau_confirmer', { message: 'el:accord-requis', code: '22023' }, 400);
    const r = await postEl('/api/el/creneau', { signalement_id: 'f0f0f0f0-0000-4000-8000-000000000001', accord_expres: false });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toBe('accord_requis');
    expect((await postEl('/api/el/creneau', { signalement_id: 'x' })).status).toBe(400);
  });
});

describe('IA des liens publics (D15)', () => {
  const audio = new Uint8Array(4000).fill(7);
  it('seules les tâches du type de lien ; lien inactif = 410', async () => {
    expect(TACHES_LIEN).toEqual({ el: ['incident-locataire'], ar: ['constat-artisan'] });
    monterIdentite();
    rpcRepond('el_ia_autorise', { proprietaire: crypto.randomUUID(), lien: crypto.randomUUID() });
    const r = await postEl('/api/el/ia/structurer', { task: 'edl-piece', input: {} });
    expect(r.status).toBe(400);
    rpcRepond('el_ia_autorise', null);
    const r2 = await postEl('/api/el/ia/structurer', { task: 'incident-locataire', input: { texte: 'De l\'eau sous l\'évier de la cuisine' } });
    expect(r2.status).toBe(410);
  });
  it('locataire : structuration imputée au lien ET au propriétaire ; une seule question', async () => {
    const proprio = crypto.randomUUID(), lien = crypto.randomUUID();
    monterIdentite();
    rpcRepond('el_ia_autorise', { proprietaire: proprio, lien });
    const r = await postEl('/api/el/ia/structurer', { task: 'incident-locataire', input: { texte: 'Il y a de l\'eau sous l\'évier de la cuisine, ça goutte' } });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.data).toMatchObject({ piece: 'cuisine', element: 'canalisation', nature: 'fuite', urgence: 'importante' });
    expect(j.data.questions).toHaveLength(1);
    expect((await lireUsageJour(env.SESSIONS_KV, proprio)).appels).toBe(1);
    expect((await lireUsageJour(env.SESSIONS_KV, 'lien-el-' + lien)).appels).toBe(1);
  });
  it('quota du LIEN atteint : 429 motif lien_appels, même si le propriétaire a de la marge', async () => {
    const proprio = crypto.randomUUID(), lien = crypto.randomUUID();
    monterIdentite();
    rpcRepond('ar_ia_autorise', { proprietaire: proprio, lien }, 200, QUOTA_LIEN.ar.appelsJour + 1);
    for (let i = 0; i < QUOTA_LIEN.ar.appelsJour; i++) {
      const r = await app.request('/api/ar/ia/transcrire', { method: 'POST', headers: { 'Content-Type': 'audio/webm', 'X-Ar-Jeton': JETON }, body: audio }, E);
      expect(r.status).toBe(200);
    }
    const r = await app.request('/api/ar/ia/transcrire', { method: 'POST', headers: { 'Content-Type': 'audio/webm', 'X-Ar-Jeton': JETON }, body: audio }, E);
    expect(r.status).toBe(429);
    expect((await r.json()).motif).toBe('lien_appels');
  });
  it('artisan : constat proposé, citation vérifiée mot pour mot', async () => {
    monterIdentite();
    rpcRepond('ar_ia_autorise', { proprietaire: crypto.randomUUID(), lien: crypto.randomUUID() });
    const r = await postAr('/api/ar/ia/structurer', { task: 'constat-artisan', input: { texte: 'Joint du siphon écrasé, collier rouillé, changé. C\'est l\'usure.' } });
    expect(r.status).toBe(200);
    expect((await r.json()).data).toMatchObject({ constat: 'usure', ampleur: 'petite', citation: 'Joint du siphon écrasé' });
  });
  it('lecture de facture : route authentifiée du socle (propriétaire), images comptées', async () => {
    const sub = crypto.randomUUID();
    const img = 'data:image/jpeg;base64,' + 'A'.repeat(300 * 1024);
    const r = await app.request('/ai/structure', { method: 'POST', headers: { ...(await appAuth({ sub })), 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'lecture-facture', input: { type: 'facture', images: [img] } }) }, E);
    expect(r.status).toBe(200);
    expect((await r.json()).data).toMatchObject({ montantTTC: 118, constatProbable: 'usure' });
    expect((await lireUsageJour(env.SESSIONS_KV, sub)).images).toBe(1);
  });
});

describe('/ar/notifier (invitation par e-mail)', () => {
  it('lien vérifié AVANT de lire le corps de structurer : sans lien actif, 410 même pour un corps invalide', async () => {
    monterIdentite();
    rpcRepond('ar_ia_autorise', null);
    const r = await app.request('/api/ar/ia/structurer', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ar-Jeton': JETON }, body: '{pas du json' }, E);
    expect(r.status).toBe(410);
  });
  it('3 invitations par lien et par heure, destinataire lu en base', async () => {
    const accesId = crypto.randomUUID();
    const h = { ...(await appAuth({ sub: crypto.randomUUID() })), 'Content-Type': 'application/json' };
    fetchMock.get(ORIGIN).intercept({ path: '/rest/v1/rpc/ar_acces_contact', method: 'POST' })
      .reply(200, { email: 'artisan@example.test', bailleur: 'SCI Dupont' }, { headers: { 'content-type': 'application/json' } }).times(4);
    const corps = JSON.stringify({ acces_id: accesId, jeton: JETON });
    for (let i = 0; i < 3; i++) {
      const r = await app.request('https://relais.example.test/ar/notifier', { method: 'POST', headers: h, body: corps }, E);
      expect(r.status).toBe(200);
    }
    const r = await app.request('https://relais.example.test/ar/notifier', { method: 'POST', headers: h, body: corps }, E);
    expect(r.status).toBe(429);
  });
});

describe('tâches IA (validation entrée / sortie)', () => {
  it('incident-locataire : jamais de cause dans le résumé ; clés inconnues → « autre » ; pas de question au second tour', () => {
    const inp = IL.validerEntree({ texte: 'Fuite sous l\'évier', reponses: [{ q: 'Continu ?', r: 'Goutte à goutte' }] }).input;
    const s = IL.validerSortie({ resume: 'Fuite due à une faute du locataire', piece: 'grenier', probleme: 'x', element: 'licorne', nature: 'fuite', urgence: 'faible', urgences: ['eau'], questions: [{ question: 'Q ?', choix: ['a', 'b'] }] }, inp);
    expect(s.data.resume).toBe('Fuite sous l\'évier');
    expect(s.data).toMatchObject({ piece: 'autre', element: 'autre', nature: 'fuite', urgence: 'importante', questions: [] });
    expect(s.rejets).toBeGreaterThanOrEqual(4);
    expect(IL.validerEntree({ texte: 'ok ok', images: ['http://x'] }).ok).toBe(false);
    expect(IL.validerEntree({ texte: 'ok ok', images: Array(4).fill('data:image/jpeg;base64,AAAA') }).ok).toBe(false);
  });
  it('constat-artisan : constat hors liste refusé ; citation inventée écartée ; sous-type seulement pour « cause extérieure »', () => {
    const inp = CA.validerEntree({ texte: 'Joint écrasé, changé.' }).input;
    expect(CA.validerSortie({ constat: 'faute' }, inp).ok).toBe(false);
    const s = CA.validerSortie({ constat: 'usure', sousType: 'tiers', ampleur: 'petite', resume: 'Joint changé', citation: 'tuyau percé par le locataire' }, inp);
    expect(s.data).toEqual({ constat: 'usure', sousType: null, ampleur: 'petite', resume: 'Joint changé', citation: null });
  });
  it('lecture-facture : SIRET et date contrôlés, TTC inférieur au HT écarté', () => {
    const s = LF.validerSortie({ entreprise: 'X', siret: '123', date: '16/10/2026', numero: 'F1', montantHT: 200, tva: 20, montantTTC: 100, lignes: [], travaux: null, constatProbable: 'faute' });
    expect(s.data).toMatchObject({ siret: null, date: null, montantTTC: null, constatProbable: null });
    expect(s.rejets).toBe(4);
  });
});
