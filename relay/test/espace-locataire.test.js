// ESPACE LOCATAIRE (migration 0059) — routes du relais : en-têtes, frontière (seules les fonctions el_*), jeton jamais
// transmis en clair à la base, fichiers déposés (octets magiques, taille), erreurs, e-mails en mode dev.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';
import app from '../src/index.js';
import { appAuth } from './_auth.js';
import { _resetSessionPourTests, rpc } from '../src/el-supabase.js';
import { EL_CSP } from '../src/espace-locataire.js';

const BASE = String(env.SUPABASE_URL).replace(/\/+$/, '');
const ORIGIN = new URL(BASE).origin;
const E = { ...env, EL_RELAIS_EMAIL: 'relais@example.test', EL_RELAIS_MOT_DE_PASSE: 'mot-de-passe-de-test' };
const JETON = 'A'.repeat(43);
const EMPREINTE = '7b7a9ea3a4b6ac5e4e7a5d8c7b0f1d6b8f2a9a8e0c95e31fb2f2b6c4b0a5d4c8';   // placeholder, recalculée ci-dessous
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const appels = [];

function monterIdentite() {
  fetchMock.get(ORIGIN).intercept({ path: '/auth/v1/token?grant_type=password', method: 'POST' })
    .reply(200, { access_token: 'jwt-relais', expires_in: 3600 }, { headers: { 'content-type': 'application/json' } }).persist();
}
function rpcRepond(fn, fabrique, statut = 200) {
  fetchMock.get(ORIGIN).intercept({ path: '/rest/v1/rpc/' + fn, method: 'POST' })
    .reply((opts) => { const corps = JSON.parse(opts.body); appels.push({ fn, corps, headers: opts.headers }); return { statusCode: statut, data: JSON.stringify(typeof fabrique === 'function' ? fabrique(corps) : fabrique), responseOptions: { headers: { 'content-type': 'application/json' } } }; });
}
const post = (path, body, headers = {}, e = E) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-El-Jeton': JETON, ...headers }, body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body || {}) }, e);

beforeAll(async () => { await appAuth(); fetchMock.activate(); fetchMock.disableNetConnect(); });
beforeEach(() => { _resetSessionPourTests(); appels.length = 0; });

describe('page /l', () => {
  it('HTML sans aucune donnée, en-têtes de sécurité complets', async () => {
    const r = await app.request('/l', {}, E);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Security-Policy')).toBe(EL_CSP);
    expect(EL_CSP).toMatch(/default-src 'none'/); expect(EL_CSP).toMatch(/frame-ancestors 'none'/); expect(EL_CSP).not.toMatch(/https?:/);
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Robots-Tag')).toMatch(/noindex/);
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
    const html = await r.text();
    expect(html).toMatch(/\/el\.js\?v=/); expect(html).not.toMatch(/googleapis|cdn|<script>[^<]/i);
  });
});

describe('API /api/el — configuration, jeton, frontière', () => {
  it('sans identité technique configurée : 503 el_inactif (et en-têtes posés)', async () => {
    const r = await post('/api/el/ouvrir', {}, {}, env);
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toBe('el_inactif');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  it('jeton absent ou mal formé : la base reçoit une empreinte NULLE (tentative comptée) → 410', async () => {
    monterIdentite();
    rpcRepond('el_ouvrir', { actif: false });
    const r = await post('/api/el/ouvrir', {}, { 'X-El-Jeton': 'court' });
    expect(r.status).toBe(410);
    expect(appels[0].corps.p_jeton_sha256).toBeNull();
    expect(appels[0].corps.p_ip_hash).toMatch(/^[0-9a-f]{32}$/);
  });
  it('jeton valide : seule son EMPREINTE part vers la base (jamais le jeton), réponse enrichie du référentiel', async () => {
    monterIdentite();
    rpcRepond('el_ouvrir', { actif: true, phase: 'complet', locataire: 'Camille Durand', bailleur: 'SCI Dupont', logement: '8 rue des Lilas' });
    const r = await post('/api/el/ouvrir', {});
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.locataire).toBe('Camille Durand');
    expect(j.referentiel.pieces.length).toBeGreaterThan(5);
    expect(j.referentiel.art21.texte).toHaveLength(4);
    expect(j.libelleAccord).toBe('Camille Durand accepte de recevoir les quittances de ce bail par voie électronique.');
    expect(j.codeAccord).toBe(false);
    expect(appels[0].corps.p_jeton_sha256).toBe(await sha(JETON));
    expect(JSON.stringify(appels)).not.toContain(JETON);
    expect(appels[0].headers.authorization || appels[0].headers.Authorization).toBe('Bearer jwt-relais');
  });
  it('rpc refuse toute fonction qui n\'est pas el_* (aucune lecture de table par l\'identité du relais)', async () => {
    await expect(rpc(E, 'baux', {})).rejects.toMatchObject({ statut: 500 });
    await expect(rpc(E, 'is_app_admin', {})).rejects.toMatchObject({ statut: 500 });
  });
  it('erreurs de la base traduites sans détail : el:limite → 429, el:ferme → 409, 42501 → 503', async () => {
    monterIdentite();
    rpcRepond('el_documents', { code: 'P0001', message: 'el:limite' }, 400);
    expect((await post('/api/el/documents', {})).status).toBe(429);
    rpcRepond('el_messages', { code: 'P0001', message: 'el:ferme' }, 400);
    expect((await post('/api/el/messages', {})).status).toBe(409);
    rpcRepond('el_signalements', { code: '42501', message: 'el:interdit' }, 403);
    const r = await post('/api/el/signalements', {});
    expect(r.status).toBe(503);
    expect(await r.text()).not.toMatch(/interdit|42501/);
  });
  it('liste inactive (fonction → null) : 410', async () => {
    monterIdentite();
    rpcRepond('el_documents', null);
    expect((await post('/api/el/documents', {})).status).toBe(410);
  });
});

describe('fichiers', () => {
  const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const PATH = '3f2a9c10-4b5e-4d6f-8a7b-1c2d3e4f5a6b/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/files/el-11111111-2222-4333-8444-555555555555-99999999-8888-4777-8666-555555555555.jpg';
  it('dépôt : type réel refusé (SVG / HTML déguisé) → 415, sans appel à la base', async () => {
    monterIdentite();
    const r = await app.request('/api/el/depot', { method: 'POST', headers: { 'X-El-Jeton': JETON, 'Content-Type': 'image/jpeg' }, body: new TextEncoder().encode('<svg onload=alert(1)>') }, E);
    expect(r.status).toBe(415);
    expect(appels.length).toBe(0);
  });
  it('dépôt : plus de 10 Mo → 413', async () => {
    const r = await app.request('/api/el/depot', { method: 'POST', headers: { 'X-El-Jeton': JETON, 'Content-Length': String(11 * 1024 * 1024) }, body: JPG }, E);
    expect(r.status).toBe(413);
  });
  it('dépôt JPEG : ticket el_depot puis écriture sans écrasement au chemin imposé', async () => {
    monterIdentite();
    rpcRepond('el_depot', { path: PATH });
    let stockage = null;
    fetchMock.get(ORIGIN).intercept({ path: '/storage/v1/object/espace-files/' + PATH, method: 'POST' })
      .reply((o) => { stockage = o.headers; return { statusCode: 200, data: '{}' }; });
    const r = await app.request('/api/el/depot', { method: 'POST', headers: { 'X-El-Jeton': JETON, 'X-El-Nom': encodeURIComponent('photo évier.jpg') }, body: JPG }, E);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ path: PATH, mime: 'image/jpeg', taille: JPG.length, nom: 'photo évier.jpg' });
    expect(appels[0].corps.p_ext).toBe('jpg');
    expect(stockage['x-upsert']).toBe('false');
    expect(stockage['content-type']).toBe('image/jpeg');
  });
  it('ouvrir : la base autorise le chemin, le relais renvoie le fichier en pièce jointe, sans cache', async () => {
    monterIdentite();
    const doc = '3f2a9c10-4b5e-4d6f-8a7b-1c2d3e4f5a6b/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/files/qt_lilas_2026-09_ab12cd34ef56.pdf';
    rpcRepond('el_fichier', { path: doc, nom: 'Quittance de septembre 2026', mime: 'application/pdf' });
    fetchMock.get(ORIGIN).intercept({ path: '/storage/v1/object/authenticated/espace-files/' + doc, method: 'GET' }).reply(200, '%PDF-1.7 test');
    const r = await post('/api/el/fichier', { source: 'document', id: '11111111-2222-4333-8444-555555555555' });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/pdf');
    expect(r.headers.get('Content-Disposition')).toMatch(/^attachment; filename="Quittance de septembre 2026\.pdf"/);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await r.text()).toBe('%PDF-1.7 test');
  });
  it('ouvrir : source ou identifiant invalide → 400 sans appel', async () => {
    expect((await post('/api/el/fichier', { source: 'baux', id: 'x' })).status).toBe(400);
  });
});

describe('écritures du locataire', () => {
  it('signalement : saisie contrôlée avant la base (même règles)', async () => {
    monterIdentite();
    const r = await post('/api/el/signaler', { piece: 'garage', element: 'fuite_eau', urgence: 'faible', description: 'abc' });
    expect(r.status).toBe(400);
    expect(appels.length).toBe(0);
  });
  it('signalement valide transmis tel quel (photos nettoyées)', async () => {
    monterIdentite();
    rpcRepond('el_signaler', '0b0c0d0e-1111-4222-8333-444455556666');
    const r = await post('/api/el/signaler', { piece: 'cuisine', element: 'fuite_eau', urgence: 'importante', description: ' Fuite sous évier ', photos: [{ path: 'p', nom: '../x<.jpg', mime: 'image/jpeg', extra: 'non' }] });
    expect(r.status).toBe(200);
    expect(appels[0].corps).toMatchObject({ p_piece: 'cuisine', p_element: 'fuite_eau', p_urgence: 'importante', p_description: 'Fuite sous évier' });
    expect(appels[0].corps.p_photos).toEqual([{ path: 'p', nom: '.._x_.jpg', mime: 'image/jpeg' }]);
  });
  it('message vide refusé ; message valide transmis', async () => {
    monterIdentite();
    expect((await post('/api/el/message', { corps: '   ' })).status).toBe(400);
    rpcRepond('el_message_envoyer', '0b0c0d0e-1111-4222-8333-444455556667');
    const r = await post('/api/el/message', { corps: 'Bonjour', signalement_id: 'pas-un-uuid' });
    expect(r.status).toBe(200);
    expect(appels[0].corps.p_signalement_id).toBeNull();
  });
  it('accord : sans e-mail actif, pas de code exigé (D10) ; version du texte imposée par le serveur', async () => {
    monterIdentite();
    rpcRepond('el_accord', { donne_le: '2026-10-14T10:42:00Z', version: 'v1', code: false });
    const r = await post('/api/el/accord', { donner: true, code: '000000' });
    expect(r.status).toBe(200);
    expect(appels[0].corps).toMatchObject({ p_donner: true, p_version: 'v1', p_code: false });
  });
  it('accord : avec e-mail actif et code exigé, refus sans code', async () => {
    monterIdentite();
    const r = await post('/api/el/accord', { donner: true }, {}, { ...E, EL_CODE_ACCORD: 'true', EMAIL_MODE: 'resend' });
    expect(r.status).toBe(403);
    expect((await r.json()).erreur).toBe('code_requis');
  });
  it('code de l\'accord : inactif tant que l\'e-mail n\'est pas actif', async () => {
    expect((await post('/api/el/accord/code', {})).status).toBe(409);
  });
});

describe('e-mails à la demande du propriétaire (/el/notifier)', () => {
  it('401 sans connexion', async () => {
    const r = await app.request('/el/notifier', { method: 'POST', body: '{}' }, E);
    expect(r.status).toBe(401);
  });
  it('403 si le propriétaire ne voit pas l\'accès (RLS par SCI)', async () => {
    fetchMock.get(ORIGIN).intercept({ path: /\/rest\/v1\/locataire_acces\?/, method: 'GET' }).reply(200, '[]', { headers: { 'content-type': 'application/json' } });
    const r = await app.request('/el/notifier', { method: 'POST', headers: { ...(await appAuth()), 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'document', to: 'loc@example.test', acces_id: '11111111-2222-4333-8444-555555555555' }) }, E);
    expect(r.status).toBe(403);
  });
  it('mode dev : rien ne part, réponse honnête', async () => {
    fetchMock.get(ORIGIN).intercept({ path: /\/rest\/v1\/locataire_acces\?/, method: 'GET' }).reply(200, '[{"id":"11111111-2222-4333-8444-555555555555"}]', { headers: { 'content-type': 'application/json' } });
    const r = await app.request('/el/notifier', { method: 'POST', headers: { ...(await appAuth()), 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'document', to: 'loc@example.test', acces_id: '11111111-2222-4333-8444-555555555555', titre: 'Quittance' }) }, E);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ envoye: false, mode: 'dev' });
  });
  it('invitation : lien exigé au bon format', async () => {
    const r = await app.request('/el/notifier', { method: 'POST', headers: { ...(await appAuth()), 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'invitation', to: 'loc@example.test', acces_id: '11111111-2222-4333-8444-555555555555', lien: 'https://evil.example/autre' }) }, E);
    expect([400, 403]).toContain(r.status);
  });
});
void EMPREINTE;
