// __tests__/helpers/popup-signature-reel.test.js — PARAPHE-UNIQUE (audit 01/10).
//
// Le VRAI bundle de la popup de signature, EXTRAIT d'index.html (la chaîne `scripts` de
// previewBailData, assemblée avec les vrais mirrors js/helpers/*.global.js) puis EXÉCUTÉ dans une
// fenêtre simulée. Contrairement à popup-signature-bundle.test.js (réplique écrite à la main), ce test
// casse si une injection disparaît, si l'enregistrement n'écrit plus la bonne forme, ou si la
// réouverture ne relit plus par parapheCarte : il observe ce que la popup ÉCRIT et RELIT.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { parapheCarte, FORMAT_SIGNATURES } from '../../js/core/bail-paraphes.js';
import { MSG_VERSION_SIGNER, MSG_VERSION_PDF, MSG_FORMAT_INCONNU } from '../../js/core/version-app.js';

const SRC = fs.readFileSync('index.html', 'utf8');
const MIRRORS = ['bail-signataires', 'pdf-flow', 'doc-brand', 'montant-doc', 'bail-paraphes', 'version-app', 'bail-sign-sigid'];
const REF = 'T-1';
const VERSION_COURANTE = /const IMMOTRACK_VERSION = '([0-9.]+)'/.exec(SRC)[1];
const B = 'data:image/png;base64,BAILLEUR', L = 'data:image/png;base64,LOCATAIRE';
const SIGS = [{ id: 'bailleur-0', nomCourt: 'Demo', role: 'BAILLEUR' }, { id: 'loc-0', nomCourt: 'Loc', role: 'LOCATAIRE' }];

// ── 1. Assemble la chaîne `scripts` exactement comme previewBailData ────────────────────────────
function assemblerBundle({ bail, opts }) {
  const a = SRC.indexOf("var scripts = '<script>'");
  const e = SRC.indexOf("+'<\\/script>';", a);
  if (a < 0 || e < 0) throw new Error('bundle de la popup introuvable dans index.html');
  const rhs = SRC.slice(a + 'var scripts = '.length, e) + "+'<\\/script>'";
  const parent = vm.createContext({ console });
  parent.window = parent;
  for (const m of MIRRORS) vm.runInContext(fs.readFileSync(`js/helpers/${m}.global.js`, 'utf8'), parent);
  const any = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : any), apply: () => any });
  const locaux = {
    JSON, Math, String, Number, Object, Array, RegExp, Date, Boolean, encodeURIComponent, parseInt, isNaN,
    window: parent, bail, opts, ref: REF, DB: { baux: { [REF]: bail }, baux_evenements: [], params: {} },
    sigsJson: JSON.stringify(SIGS), bailStructureJson: '[]', sciLabel: 'SCI T', KEY: '_test_immotrack_v4', N_PAGES: 10,
    _d2aBModes: ['pres'], _d2aBSigIdMap: [], titleLabel: 'T',
    IMMOTRACK_VERSION: VERSION_COURANTE, _swVersionUrl: () => 'http://127.0.0.1/sw.js'
  };
  const scope = new Proxy(locaux, {
    has: () => true,
    get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : (k in parent ? parent[k] : any)))
  });
  const html = (new Function('scope', 'with(scope){ return (' + rhs + '); }'))(scope);
  return html.replace(/^<script>/, '').replace(/<\/script>$/, '');
}

// ── 2. Fenêtre de popup simulée (DOM minimal, opener = l'app) ───────────────────────────────────
function element() {
  const el = {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild: (x) => x, remove() {}, setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [], insertAdjacentHTML() {}, focus() {}, click() {}, scrollTo() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }), getContext: () => null, contains: () => false
  };
  return el;
}
function ouvrirPopup({ bail, opts = { useSnapshot: true }, fetchTexte = null, fetchEchec = false }) {
  const code = assemblerBundle({ bail, opts });
  const ecrit = { sig: null, saves: 0 };
  const opener = {
    closed: false,
    DB: { baux: { [REF]: JSON.parse(JSON.stringify(bail)) }, logements: [], entites: [], params: {} },
    saveDB() { ecrit.saves++; ecrit.sig = JSON.parse(JSON.stringify(opener.DB.baux[REF].signatures)); return true; },
    rBaux() {}, _refreshAfterMutation() {}, showToast() {}, focus() {}
  };
  const alertes = [];
  const w = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    alert: (m) => alertes.push(String(m)), confirm: () => true,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { href: 'about:blank' }, navigator: { userAgent: 'test' },
    Image: function () { return element(); }, MouseEvent: function () {}, FileReader: function () {},
    AbortController, Promise, JSON, Math, Date, Object, Array, String, Number, RegExp, Error, encodeURIComponent, parseInt, isNaN,
    fetch: async () => { if (fetchEchec) throw new Error('hors ligne'); return { ok: true, text: async () => fetchTexte || '' }; }
  });
  w.window = w; w.self = w; w.opener = opener;
  w.addEventListener = () => {}; w.removeEventListener = () => {}; w.scrollTo = () => {}; w.close = () => {}; w.focus = () => {};
  w.document = {
    title: 'Bail', readyState: 'complete', body: element(), documentElement: element(),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => element(),
    addEventListener() {}, removeEventListener() {}, activeElement: null
  };
  vm.runInContext(code, w);
  return { w, ecrit, alertes, opener };
}

// Carte page → signataire et heures, 9 pages paraphées sur 10.
function etat(sigIds) {
  const carte = {}, heures = {}, imgs = { 'bailleur-0': B, 'loc-0': L };
  for (let p = 1; p <= 9; p++) { carte[p] = {}; heures[p] = {}; for (const id of sigIds) { carte[p][id] = imgs[id]; heures[p][id] = '2026-10-01T08:00:0' + (p % 10) + '.000Z'; } }
  return { carte, heures };
}
function signer(w, { sigIds, finales }) {
  const { carte, heures } = etat(sigIds);
  w._wizV2Pages = Array.from({ length: 10 }, (_, i) => ({ pageNum: i + 1, noParaphe: i === 9 }));
  w._wizV2Paraphes = JSON.parse(JSON.stringify(carte));
  w._wizV2ParapheTimes = JSON.parse(JSON.stringify(heures));
  w._wizV2FinalSignatures = finales; w._wizV2LuApprouveBy = {}; w._wizV2AnnexAckBy = {};
  w._wizV2Phase2 = false; w._wizV2LuApprouve = true;
  vm.runInContext('_wizV2PersistSignatures()', w);
  return carte;
}
const bailVierge = () => ({ ref: REF, locataires: [{ nom: 'Loc' }], signatures: null });
const SW = (v) => `const CACHE_VER = 'immotrack-v${v}';`;
const VERSION = /const IMMOTRACK_VERSION = '([\d.]+)'/.exec(SRC)[1];
const plusRecente = VERSION.replace(/(\d+)$/, (d) => String(+d + 1).padStart(d.length, '0'));

describe('popup réelle — fonctions injectées', () => {
  it('le bundle extrait d’index.html définit le lecteur et l’écrivain (pas window.BailParaphes)', () => {
    const { w } = ouvrirPopup({ bail: bailVierge() });
    for (const f of ['parapheDe', 'parapheCarte', 'compacterParaphes', 'ecrireParaphes', 'signaturesCompletes', 'formatSignaturesConnu', 'versionPlusRecente', 'versionDepuisSw'])
      expect(typeof w[f], f).toBe('function');
    expect(w.BailParaphes).toBeUndefined();
    expect(w.FORMAT_SIGNATURES).toBe(FORMAT_SIGNATURES);
  });
});

describe('popup réelle — enregistrement', () => {
  it('bail PARTIEL (le locataire signera ensuite) : paraphes en entier, sans parapheImg', () => {
    const { w, ecrit } = ouvrirPopup({ bail: bailVierge() });
    const carte = signer(w, { sigIds: ['bailleur-0'], finales: { 'bailleur-0': B } });
    expect(ecrit.sig.paraphes).toEqual(JSON.parse(JSON.stringify(carte)));
    expect(ecrit.sig.parapheImg).toBeUndefined();
    expect(ecrit.sig.format).toBe(FORMAT_SIGNATURES);
  });

  it('bail COMPLET : une image par signataire, paraphes vide, relecture identique', () => {
    const { w, ecrit } = ouvrirPopup({ bail: bailVierge() });
    const carte = signer(w, { sigIds: ['bailleur-0', 'loc-0'], finales: { 'bailleur-0': B, 'loc-0': L } });
    expect(ecrit.sig.parapheImg).toEqual({ 'bailleur-0': B, 'loc-0': L });
    expect(ecrit.sig.paraphes).toEqual({});
    expect(parapheCarte(ecrit.sig)).toEqual(JSON.parse(JSON.stringify(carte)));
  });

  it('forme FUTURE déjà enregistrée : la popup refuse d’écrire', () => {
    const bail = bailVierge(); bail.signatures = { format: FORMAT_SIGNATURES + 1, finales: {}, mode: 'bailleur-seul' };
    const { w, ecrit, alertes } = ouvrirPopup({ bail, opts: { signQueue: ['loc-0'] } });
    signer(w, { sigIds: ['loc-0'], finales: { 'loc-0': L } });
    expect(ecrit.saves).toBe(0);
    expect(alertes).toContain(MSG_FORMAT_INCONNU);
  });
});

describe('popup réelle — réouverture d’un bail signé', () => {
  const complet = () => { const { carte, heures } = etat(['bailleur-0', 'loc-0']); return { carte, heures }; };
  it('forme compacte : la carte relue = celle qui a été signée', () => {
    const { carte, heures } = complet();
    const bail = bailVierge(); bail.signatures = { signedAt: '2026-10-01T08:00:00.000Z', mode: 'avec-locataire', totalPages: 10, format: 2, paraphes: {}, parapheImg: { 'bailleur-0': B, 'loc-0': L }, parapheTimes: heures, finales: { 'bailleur-0': B, 'loc-0': L } };
    const { w } = ouvrirPopup({ bail });
    expect(JSON.parse(JSON.stringify(w._wizV2Paraphes))).toEqual(JSON.parse(JSON.stringify(carte)));
    expect(w._wizV2Pages.map((p) => (p.noParaphe ? 0 : 1)).join('')).toBe('1111111110');
  });
  it('ancienne forme : relue telle quelle', () => {
    const { carte, heures } = complet();
    const bail = bailVierge(); bail.signatures = { signedAt: '2026-09-01T08:00:00.000Z', mode: 'avec-locataire', totalPages: 10, paraphes: carte, parapheTimes: heures, finales: { 'bailleur-0': B, 'loc-0': L } };
    const { w } = ouvrirPopup({ bail });
    expect(JSON.parse(JSON.stringify(w._wizV2Paraphes))).toEqual(JSON.parse(JSON.stringify(carte)));
  });
  it('forme FUTURE : non relue, message de rechargement', () => {
    const bail = bailVierge(); bail.signatures = { signedAt: '2027-01-01T08:00:00.000Z', format: FORMAT_SIGNATURES + 1, totalPages: 10, paraphes: {}, finales: {} };
    const { w, alertes } = ouvrirPopup({ bail });
    expect(Object.keys(w._wizV2Paraphes || {})).toEqual([]);
    expect(alertes).toContain(MSG_FORMAT_INCONNU);
  });
});

describe('popup réelle — contrôle de version (onglet périmé)', () => {
  const bailSigne = () => { const b = bailVierge(); b.signatures = { signedAt: '2026-10-01T08:00:00.000Z', totalPages: 10, paraphes: etat(['bailleur-0']).carte, finales: { 'bailleur-0': B } }; return b; };
  async function pdf(opt) {
    const { w, alertes } = ouvrirPopup({ bail: bailSigne(), ...opt });
    let appels = 0; w.genPDFNative = () => { appels++; };
    await vm.runInContext('_wizPdfNatif()', w);
    return { appels, alertes };
  }
  it('« PDF » sur un bail signé : version servie plus récente → pas de PDF, message', async () => {
    const r = await pdf({ fetchTexte: SW(plusRecente) });
    expect(r.appels).toBe(0); expect(r.alertes).toContain(MSG_VERSION_PDF);
  });
  it('« PDF » : même version → PDF généré ; réseau en échec → PDF généré (jamais bloquer hors ligne)', async () => {
    expect((await pdf({ fetchTexte: SW(VERSION) })).appels).toBe(1);
    expect((await pdf({ fetchEchec: true })).appels).toBe(1);
  });
  it('signature : version servie plus récente → le parcours ne démarre pas', async () => {
    const { w, alertes } = ouvrirPopup({ bail: bailVierge(), opts: { signQueue: ['bailleur-0', 'loc-0'] }, fetchTexte: SW(plusRecente) });
    let prerendu = 0; w.prerenderPDFPages = async () => { prerendu++; return []; };
    await vm.runInContext('startSignatureWizardV2()', w);
    expect(prerendu).toBe(0); expect(alertes).toContain(MSG_VERSION_SIGNER);
  });
});
