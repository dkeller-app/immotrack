// CONSO-IA (migration 0062) — consommation par compte et plafonds MENSUELS selon l'offre, côté relais.
// La base (ia_reserver / ia_consigner) est simulée par fetchMock ; la preuve SQL (verrou, bornes, droits) est la simulation
// supabase/tests/sim/0062-ia-conso-plafonds.sim.mjs.
import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';
import app from '../src/index.js';
import { appAuth } from './_auth.js';
import { _resetSessionPourTests } from '../src/el-supabase.js';
import { GRILLE_PRIX, coutMicroEur } from '../src/ai/prix.js';
import { FAMILLE_DE, FONCTION_TACHE, fonctionTache, estimationAudioSec, pourcentage, _resetConsoPourTests } from '../src/ai/conso.js';
import { TACHES } from '../src/ai/tasks/index.js';
import { CUISINE_INPUT } from './fixtures/edl-cuisine.js';

const BASE = String(env.SUPABASE_URL).replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const E = { ...env, EL_RELAIS_EMAIL: 'relais@example.test', EL_RELAIS_MOT_DE_PASSE: 'mot-de-passe-de-test', AI_PROVIDER: 'fake' };
const JETON = 'C'.repeat(43);
const appels = [];

function monterIdentite() {
  fetchMock.get(ORIGIN).intercept({ path: '/auth/v1/token?grant_type=password', method: 'POST' })
    .reply(200, { access_token: 'jwt-relais', expires_in: 3600 }, { headers: { 'content-type': 'application/json' } }).persist();
}
function rpcRepond(fn, fabrique, statut = 200, fois = 1) {
  const i = fetchMock.get(ORIGIN).intercept({ path: '/rest/v1/rpc/' + fn, method: 'POST' })
    .reply((opts) => { const corps = JSON.parse(opts.body); appels.push({ fn, corps, auth: opts.headers && (opts.headers.Authorization || opts.headers.authorization) }); return { statusCode: statut, data: JSON.stringify(typeof fabrique === 'function' ? fabrique(corps) : fabrique), responseOptions: { headers: { 'content-type': 'application/json' } } }; });
  if (fois > 1) i.times(fois);
}
const reserve = (ok, unites, plafond) => (corps) => ({ ok, unites: ok ? unites + corps.p_estimation : unites, plafond, mois: '2026-12-01', renouvellement: '2027-01-01' });
const audio = (n = 8000) => new Uint8Array(n).fill(7);
const transcribe = async (e, sub) => app.request('/ai/transcribe?lang=fr&task=edl-piece', { method: 'POST', headers: { ...(await appAuth({ sub })), 'Content-Type': 'audio/webm' }, body: audio() }, e);
const structure = async (e, sub, payload) => app.request('/ai/structure', { method: 'POST', headers: { ...(await appAuth({ sub })), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, e);

beforeAll(async () => { await appAuth(); fetchMock.activate(); fetchMock.disableNetConnect(); });
beforeEach(() => { _resetSessionPourTests(); _resetConsoPourTests(); appels.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe('grille de prix (un seul fichier, datée et sourcée)', () => {
  it('relevé daté ; 1 min de dictée, 1 M de jetons, 1 page lue', () => {
    expect(GRILLE_PRIX.releve).toBe('2026-10-16');
    expect(coutMicroEur({ audioSec: 60 })).toBe(Math.round(0.003 * 0.87 * 1e6));
    expect(coutMicroEur({ jetonsE: 1e6, jetonsS: 1e6 })).toBe(Math.round(0.75 * 0.87 * 1e6));
    expect(coutMicroEur({ pages: 1 })).toBe(Math.round(0.005 * 0.87 * 1e6));
    expect(coutMicroEur({ audioSec: -5, jetonsE: 'x' })).toBe(0);
  });
  it('gestes de référence de la grille validée : EDL dicté ≈ 0,03 €, dossier de 8 pages ≈ 0,035 €', () => {
    const edl = coutMicroEur({ audioSec: 8 * 60 }) + 8 * coutMicroEur({ jetonsE: 1500, jetonsS: 900 });
    expect(edl / 1e6).toBeGreaterThan(0.015); expect(edl / 1e6).toBeLessThan(0.035);
    expect(coutMicroEur({ pages: 8 }) / 1e6).toBeCloseTo(0.0348, 3);
  });
});

describe('fonctions mesurées', () => {
  it('chaque tâche du registre a sa fonction, chaque fonction sa famille', () => {
    for (const nom of Object.keys(TACHES)) expect(fonctionTache(nom), nom).toBeTruthy();
    for (const f of Object.values(FONCTION_TACHE)) expect(FAMILLE_DE[f], f).toBeTruthy();
    expect(FAMILLE_DE.locataire).toBe('liens'); expect(FAMILLE_DE.artisan).toBe('liens');
    expect(fonctionTache('__proto__')).toBe(null);
  });
  it('estimation de durée audio : haute, bornée', () => {
    expect(estimationAudioSec(0)).toBe(1);
    expect(estimationAudioSec(3000 * 60)).toBe(60);
    expect(estimationAudioSec(1e9)).toBe(1800);
  });
  it('pourcentage après l\'appel (unités réelles), null sans plafond', () => {
    expect(pourcentage({ mode: 'base', plafond: 600, unites: 560, estimation: 60 }, 40)).toBe(90);
    expect(pourcentage({ mode: 'base', plafond: null, unites: 5, estimation: 1 }, 1)).toBe(null);
    expect(pourcentage({ mode: 'kv' }, 1)).toBe(null);
  });
});

describe('plafond mensuel : routes du propriétaire', () => {
  it('sous le plafond : réservation par l\'IDENTITÉ DU RELAIS, puis correction par la durée facturée et coût', async () => {
    const sub = crypto.randomUUID();
    monterIdentite();
    rpcRepond('ia_reserver', reserve(true, 100, 600));
    rpcRepond('ia_consigner', null, 204);
    const r = await transcribe(E, sub);
    expect(r.status).toBe(200);
    const j = await r.json();
    const res = appels.find((a) => a.fn === 'ia_reserver');
    const con = appels.find((a) => a.fn === 'ia_consigner');
    expect(res.auth).toBe('Bearer jwt-relais');                       // jamais le jeton de l'utilisateur
    expect(res.corps).toEqual({ p_user: sub, p_famille: 'dictee', p_estimation: estimationAudioSec(8000) });
    expect(con.corps).toMatchObject({ p_user: sub, p_mois: '2026-12-01', p_famille: 'dictee', p_fonction: 'dictee', p_audio_sec: 2, p_appels: 1, p_correction: 2 - estimationAudioSec(8000) });
    expect(con.corps.p_cout_micro_eur).toBe(coutMicroEur({ audioSec: 2 }));
    expect(j.conso).toEqual({ famille: 'dictee', pct: Math.round(102 / 600 * 100) });
  });
  it('au plafond : 429 motif « mois », AUCUN appel payant, renouvellement annoncé', async () => {
    monterIdentite();
    rpcRepond('ia_reserver', reserve(false, 600, 600));
    const spy = vi.spyOn(console, 'log');
    const r = await transcribe(E, crypto.randomUUID());
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'quota', motif: 'mois', famille: 'dictee', renouvellement: '2027-01-01' });
    expect(appels.map((a) => a.fn)).toEqual(['ia_reserver']);
    expect(spy.mock.calls.flat().join(' ')).toMatch(/transcribe 429 motif=mois fn=dictee/);
  });
  it('structuration d\'une dictée : 0 minute réservée ; refusée quand la dictée du compte est en pause', async () => {
    monterIdentite();
    rpcRepond('ia_reserver', reserve(true, 10, 600));
    rpcRepond('ia_consigner', null, 204);
    const ok = await structure(E, crypto.randomUUID(), { task: 'edl-piece', input: CUISINE_INPUT });
    expect(ok.status).toBe(200);
    expect(appels[0].corps).toMatchObject({ p_famille: 'dictee', p_estimation: 0 });
    const con = appels.find((a) => a.fn === 'ia_consigner');
    expect(con.corps.p_correction).toBe(0);
    expect(con.corps.p_jetons_e).toBeGreaterThan(0);
    rpcRepond('ia_reserver', reserve(false, 600, 600));
    const ko = await structure(E, crypto.randomUUID(), { task: 'edl-piece', input: CUISINE_INPUT });
    expect(ko.status).toBe(429);
  });
  it('lecture des pièces (OCR) : 1 page réservée, pages lues consignées', async () => {
    const e = { ...E, AI_OCR: 'true' };
    monterIdentite();
    rpcRepond('ia_reserver', reserve(true, 3, 8));
    rpcRepond('ia_consigner', null, 204);
    const img = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
    const r = await structure(e, crypto.randomUUID(), { task: 'bulletin-paie', input: { type: 'bulletin', images: [img] } });
    expect(r.status).toBe(200);
    expect(appels[0].corps).toMatchObject({ p_famille: 'pieces', p_estimation: 1 });
    const con = appels.find((a) => a.fn === 'ia_consigner');
    expect(con.corps).toMatchObject({ p_fonction: 'pieces', p_pages: 1, p_correction: 0, p_cout_micro_eur: coutMicroEur({ pages: 1 }) });
    expect((await r.json()).conso).toEqual({ famille: 'pieces', pct: 50 });
  });
  it('fournisseur en échec : la réservation est rendue (correction = −estimation), l\'appel compté', async () => {
    monterIdentite();
    rpcRepond('ia_reserver', reserve(true, 0, 600));
    rpcRepond('ia_consigner', null, 204);
    const casse = { ...E, AI_PROVIDER: undefined, MISTRAL_API_KEY: 'k', MISTRAL_BASE_URL: 'https://mistral.invalid' };
    fetchMock.get('https://mistral.invalid').intercept({ path: '/v1/audio/transcriptions', method: 'POST' }).reply(500, '{}');
    const r = await transcribe(casse, crypto.randomUUID());
    expect(r.status).toBe(502);
    const con = appels.find((a) => a.fn === 'ia_consigner');
    expect(con.corps).toMatchObject({ p_correction: -estimationAudioSec(8000), p_appels: 1, p_audio_sec: 0, p_cout_micro_eur: 0 });
  });
});

describe('jamais bloquant : sans base, retour aux plafonds du jour (wrangler.toml)', () => {
  it('migration 0062 absente (PGRST202) : l\'appel passe, la base n\'est plus interrogée pendant 5 min', async () => {
    monterIdentite();
    rpcRepond('ia_reserver', { code: 'PGRST202', message: 'Could not find the function' }, 404);
    expect((await transcribe(E, crypto.randomUUID())).status).toBe(200);
    expect((await transcribe(E, crypto.randomUUID())).status).toBe(200);   // aucun intercept : sinon MockNotMatched
    expect(appels.filter((a) => a.fn === 'ia_reserver')).toHaveLength(1);
  });
  it('base en erreur (500) ou identité du relais absente : l\'appel passe', async () => {
    monterIdentite();
    rpcRepond('ia_reserver', { message: 'boom' }, 500);
    expect((await transcribe(E, crypto.randomUUID())).status).toBe(200);
    const sansIdentite = { ...E }; delete sansIdentite.EL_RELAIS_EMAIL;
    expect((await transcribe(sansIdentite, crypto.randomUUID())).status).toBe(200);
  });
  it('le garde-fou JOURNALIER reste appliqué avant la base', async () => {
    const e = { ...E, AI_QUOTA_CALLS: '1' };
    const sub = crypto.randomUUID();
    monterIdentite();
    rpcRepond('ia_reserver', reserve(true, 0, null));
    rpcRepond('ia_consigner', null, 204);
    expect((await transcribe(e, sub)).status).toBe(200);
    const r = await transcribe(e, sub);
    expect(r.status).toBe(429);
    expect((await r.json()).motif).toBe('appels');
  });
});

describe('liens publics : plafond « liens » du propriétaire, message sans son offre', () => {
  it('locataire : au plafond mensuel du propriétaire → 429 { erreur, motif:"mois" } seulement', async () => {
    const proprio = crypto.randomUUID();
    monterIdentite();
    rpcRepond('el_ia_autorise', { proprietaire: proprio, lien: crypto.randomUUID() });
    rpcRepond('ia_reserver', reserve(false, 10, 10));
    const r = await app.request('/api/el/ia/structurer', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-El-Jeton': JETON }, body: JSON.stringify({ task: 'incident-locataire', input: { texte: 'De l\'eau sous l\'évier de la cuisine' } }) }, E);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ erreur: 'quota', motif: 'mois' });
    expect(appels.find((a) => a.fn === 'ia_reserver').corps).toMatchObject({ p_user: proprio, p_famille: 'liens', p_estimation: 1 });
  });
  it('artisan : demande consignée au compte du propriétaire (fonction artisan)', async () => {
    const proprio = crypto.randomUUID();
    monterIdentite();
    rpcRepond('ar_ia_autorise', { proprietaire: proprio, lien: crypto.randomUUID() });
    rpcRepond('ia_reserver', reserve(true, 0, 10));
    rpcRepond('ia_consigner', null, 204);
    const r = await app.request('/api/ar/ia/transcrire', { method: 'POST', headers: { 'Content-Type': 'audio/webm', 'X-Ar-Jeton': JETON }, body: audio(4000) }, E);
    expect(r.status).toBe(200);
    expect(appels.find((a) => a.fn === 'ia_consigner').corps).toMatchObject({ p_user: proprio, p_famille: 'liens', p_fonction: 'artisan', p_correction: 0, p_appels: 1 });
  });
  it('journaux : aucun identifiant de compte ni de lien', async () => {
    const proprio = crypto.randomUUID(), lien = crypto.randomUUID();
    const spy = vi.spyOn(console, 'log');
    monterIdentite();
    rpcRepond('el_ia_autorise', { proprietaire: proprio, lien });
    rpcRepond('ia_reserver', { message: 'boom' }, 500);
    await app.request('/api/el/ia/transcrire', { method: 'POST', headers: { 'Content-Type': 'audio/webm', 'X-El-Jeton': JETON }, body: audio(4000) }, E);
    const logs = spy.mock.calls.flat().join(' ');
    expect(logs).not.toContain(proprio); expect(logs).not.toContain(lien);
  });
});
