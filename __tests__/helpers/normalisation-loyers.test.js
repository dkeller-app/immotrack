/**
 * NORMALISATION-LOYERS (01/10) — « Loyers » / « Arriérés de loyers » hérités → « Loyers encaissés »,
 * IBAN du locataire purgé (RGPD). Module : js/core/normalisation-loyers.js.
 *
 * Tests COMPORTEMENTAUX : la vraie restauration (`_backupRestoreApply`) et le vrai import JSON
 * (`importJSON`) d'index.html sont extraits et exécutés sur une sauvegarde d'avril ANONYMISÉE
 * (__tests__/helpers/fixtures/sauvegarde-avril-anonymisee.json : structure réelle d'avril, aucun nom ni
 * montant réel), puis Finances est recalculé avec SES résolveurs (`_finCatLigne` extrait d'index.html,
 * moteur js/core/finances-monthly.js).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  normaliserDonneesLoyers, homonymePerso, CATEGORIE_LOYERS, CATEGORIES_LOYERS_HERITEES
} from '../../js/core/normalisation-loyers.js';
import { bailContentHash, bailLegalContent, canonicalStringify } from '../../js/core/bail-content-hash.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { _isLoyerCategory, catCtxFromDb } from '../../js/core/utils.js';
import { reappliquerJournalBaux, CHAMPS_VIE } from '../../js/core/bail-modifications.js';
import { createStoreSync } from '../../js/core/store-sync.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
const AVRIL = JSON.parse(readFileSync(resolve(__dir, 'fixtures/sauvegarde-avril-anonymisee.json'), 'utf8'));
const avril = () => JSON.parse(JSON.stringify(AVRIL));

/** Corps d'une fonction du monolithe, de `function X(` à son `\n}` de colonne 0. */
function corpsDe(nom) {
  const i = html.indexOf('function ' + nom + '(');
  if (i === -1) throw new Error(nom + ' introuvable dans index.html — le test ne teste plus rien');
  const j = html.indexOf('\n}', i);
  return html.slice(i, j + 2);
}
/** LE référentiel de l'app, évalué depuis index.html. */
function referentiel() {
  const i = html.indexOf('const STD_CATEGORIES = [');
  const j = html.indexOf('\n];', i);
  if (i === -1 || j === -1) throw new Error('STD_CATEGORIES introuvable');
  return new Function(html.slice(i, j + 3) + '\nreturn STD_CATEGORIES;')();
}
/** Source de `window.__immoSetDB = function(cloudDB) {…};` (affectation, pas une déclaration). */
function setDbSrc() {
  const i = html.indexOf('window.__immoSetDB = function(cloudDB) {');
  if (i === -1) throw new Error('__immoSetDB introuvable — le test ne teste plus rien');
  return html.slice(i, html.indexOf('\n};', i) + 3);
}
const NL = { normaliser: normaliserDonneesLoyers };
const silence = { info() {}, warn() {}, error() {} };

/**
 * Charge les VRAIES fonctions d'index.html (restauration, import, point d'appel de la normalisation,
 * `_stamp`, résolveurs de Finances) dans un même scope qui partage `DB`, comme dans l'app.
 */
function app(STD) {
  const src = ['_stamp', '_normaliserLoyers', '_backupRestoreApply', 'importJSON',
    '_stdCategoryByName', '_finStdByLigne', '_finCatMere', '_finCatLigne'].map(corpsDe).join('\n');
  const toasts = [];
  const win = { NormalisationLoyers: NL };
  class FakeFileReader {
    readAsText(file) { this.onload({ target: { result: file.__texte } }); }
  }
  const api = new Function('window', 'STD_CATEGORIES', 'console', 'FileReader', 'confirm2', 'showToast', 'saveDB',
    'initFilters', 'rExport', 'go', 'document',
    `let DB = {};\n${src}\nreturn { get DB() { return DB; }, set DB(d) { DB = d; }, _backupRestoreApply, importJSON, _finCatLigne, _normaliserLoyers };`
  )(win, STD, silence, FakeFileReader, () => true, (m, t) => toasts.push([m, t]), () => {}, () => {}, () => {}, () => {},
    { querySelector: () => null });
  api.toasts = toasts;
  return api;
}

/** Finances (exercice 2026, constat au 30/04) avec les résolveurs de l'app ; renvoie encaissé + recouvrement. */
function finances(a, db) {
  a.DB = db;
  const bauxLots = Object.entries(db.baux || {});
  const loyerDue = (qui, ym) => {
    const b = (db.baux || {})[qui];
    if (!b || !b.debut || String(b.debut).slice(0, 7) > ym) return { hc: 0, ch: 0 };
    return { hc: Number(b.hc) || 0, ch: Number(b.ch) || 0 };
  };
  const r = _computeFinancesMonthly({
    mouvements: db.mouvements, year: 2026, scope: null, catLigne: a._finCatLigne,
    loyerDue, activeLots: bauxLots.map(([ref]) => ref), today: '2026-04-30',
    window: { lastMonth: 4, dueMonth: 4, today: '2026-04-30' },
  });
  // Même formule que rFinances (index.html, R-2) : (dû − retard résiduel) ÷ dû, charges comprises.
  let du = 0, retard = 0;
  r.months.forEach(m => { du += m.duHC + m.duCH; retard += m.loyerRetard + m.chargeRetard; });
  return { annual: r.annual, du, retard, recouvrement: du > 0 ? Math.round((du - retard) / du * 1000) / 10 : null };
}

let STD;
beforeAll(() => { STD = referentiel(); });

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('la fixture est bien une sauvegarde d\'avril (structure réelle, données anonymes)', () => {
  it('porte la catégorie héritée « Loyers » et pas un seul « Loyers encaissés »', () => {
    const d = avril();
    expect(d.mouvements.filter(m => m.cat === 'Loyers').length).toBe(25);
    expect(d.mouvements.some(m => m.cat === CATEGORIE_LOYERS)).toBe(false);
    expect(d.categories).toContain('Loyers');
    expect(d.catConfig.Loyers).toEqual({ inclYTD: true });
  });
  it('mêmes clés de premier niveau et même forme de mouvement que les sauvegardes d\'avril', () => {
    expect(Object.keys(AVRIL).sort()).toEqual(['assurances', 'baux', 'baux_historique', 'catConfig', 'categories', 'edl',
      'edlTemplates', 'entites', 'irlTable', 'logements', 'mouvements', 'mrh', 'nid', 'params', 'piecesEDL', 'quittances', 'templates']);
    for (const m of AVRIL.mouvements) expect(Object.keys(m).sort()).toEqual(['cat', 'cr', 'date', 'db', 'fac', 'id', 'imm', 'lib', 'qui']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('RESTAURATION d\'une sauvegarde d\'avril (vraie _backupRestoreApply d\'index.html)', () => {
  it('100 % des loyers aboutissent en « Loyers encaissés », tamponnés pour la synchro', () => {
    const a = app(STD);
    a.DB = { baux: {}, logements: [], params: {} };
    a._backupRestoreApply(avril());
    const mv = a.DB.mouvements;
    expect(mv.filter(m => m.cat === 'Loyers' || m.cat === 'Arriérés de loyers')).toEqual([]);
    const loyers = mv.filter(m => m.cat === CATEGORIE_LOYERS);
    expect(loyers.length).toBe(25);
    expect(loyers.every(m => typeof m._modifiedAt === 'string')).toBe(true);
    // Les autres catégories ne bougent pas, et ne sont pas tamponnées.
    expect(mv.filter(m => m.cat !== CATEGORIE_LOYERS).every(m => !('_modifiedAt' in m))).toBe(true);
    expect(mv.filter(m => m.cat === 'Prêt').length).toBe(4);
  });

  it('les réglages hérités disparaissent : catConfig.Loyers, « Loyers » de la liste des catégories', () => {
    const a = app(STD);
    a.DB = { baux: {}, logements: [], params: {} };
    a._backupRestoreApply(avril());
    expect('Loyers' in a.DB.catConfig).toBe(false);
    expect(a.DB.catConfig['Remb GLI']).toEqual({ inclYTD: true });   // réglage d'une autre catégorie : intact
    expect(a.DB.categories).not.toContain('Loyers');
    expect(a.DB.categories).toContain(CATEGORIE_LOYERS);
  });

  it('Finances compte ces loyers comme ENCAISSÉS : le recouvrement n\'est plus à 0 %', () => {
    // AVANT (sans normalisation) : Finances ignore « Loyers » → 0 encaissé, 0 % de recouvrement.
    const brut = finances(app(STD), avril());
    expect(brut.annual.loyersBrut).toBe(0);
    expect(brut.recouvrement).toBe(0);
    // APRÈS restauration : même sauvegarde, passée par la vraie porte d'entrée.
    const a = app(STD);
    a.DB = { baux: {}, logements: [], params: {} };
    a._backupRestoreApply(avril());
    const apres = finances(a, a.DB);
    const attendu = AVRIL.mouvements.filter(m => m.cat === 'Loyers').reduce((s, m) => s + (m.cr || 0) - (m.db || 0), 0);
    expect(apres.du).toBe(4 * AVRIL.logements.reduce((s, l) => s + l.hc + l.ch, 0));
    expect(apres.annual.loyersBrut).toBeCloseTo(attendu, 2);
    expect(apres.recouvrement).toBeGreaterThan(99);   // 4 mois payés en entier, moins un remboursement de 30
    expect(apres.recouvrement).toBeLessThan(100);
  });

  it('un bail SIGNÉ conservé par la restauration reste vérifiable (empreinte inchangée)', async () => {
    const a = app(STD);
    const signe = bailSigneAvecIban();
    const empreinte = await bailContentHash(signe);
    signe.signatures.contentHashTerms = empreinte;
    a.DB = { baux: { 'A-01': signe }, logements: [], params: {} };
    a._backupRestoreApply(avril());
    const b = a.DB.baux['A-01'];
    expect(b).toBe(signe);                                   // la restauration garde le bail verrouillé
    expect('locNouvIban' in b).toBe(false);                  // racine purgée
    expect(b.signatures.bailSnapshot.locNouvIban).toBe('FR7600000000000000000000000');   // document signé intact
    expect(await bailContentHash(b)).toBe(empreinte);
    expect(b.signatures.contentHashTerms).toBe(empreinte);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('IMPORT JSON (vrai importJSON d\'index.html) : même résultat que la restauration', () => {
  it('les mouvements, la liste des catégories et les réglages sont identiques', () => {
    const r = app(STD);
    r.DB = { baux: {}, logements: [], params: {} };
    r._backupRestoreApply(avril());
    const i = app(STD);
    i.DB = { baux: {}, logements: [], params: {} };
    i.importJSON({ files: [{ __texte: JSON.stringify(AVRIL) }] });
    expect(i.toasts.some(([m]) => /Import réussi/.test(m))).toBe(true);
    const sansTampon = (mv) => mv.map(({ _modifiedAt, ...m }) => m);
    expect(sansTampon(i.DB.mouvements)).toEqual(sansTampon(r.DB.mouvements));
    expect(i.DB.mouvements.filter(m => m.cat === CATEGORIE_LOYERS).length).toBe(25);
    expect(i.DB.categories).toEqual(r.DB.categories);
    expect(i.DB.catConfig).toEqual(r.DB.catConfig);
    expect(finances(i, i.DB).recouvrement).toBe(finances(r, r.DB).recouvrement);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('idempotence', () => {
  it('un second passage ne modifie RIEN et ne tamponne rien', () => {
    const d = avril();
    const r1 = normaliserDonneesLoyers(d);
    expect(r1.modifie).toBe(true);
    expect(r1.mouvements).toBe(25);
    const fige = JSON.stringify(d);
    let tampons = 0;
    const r2 = normaliserDonneesLoyers(d, { stamp: () => { tampons++; } });
    expect(r2.modifie).toBe(false);
    expect(r2.mouvements + r2.reglages + r2.categories + r2.baux + r2.historique + r2.journal).toBe(0);
    expect(tampons).toBe(0);
    expect(JSON.stringify(d)).toBe(fige);
  });
  it('la restauration suivie du chargement (2e passage par _normaliserLoyers) ne change rien', () => {
    const a = app(STD);
    a.DB = { baux: {}, logements: [], params: {} };
    a._backupRestoreApply(avril());
    const fige = JSON.stringify(a.DB);
    const r = a._normaliserLoyers('démarrage');
    expect(r.modifie).toBe(false);
    expect(JSON.stringify(a.DB)).toBe(fige);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
function bailSigneAvecIban() {
  const snapshot = { hc: 500, ch: 50, locNouvIban: 'FR7600000000000000000000000', adrBien: 'Adresse lot A-01' };
  return {
    hc: 500, ch: 50, dg: 500, jpay: 5, debut: '2025-07-01', fin: '2028-06-30', type: 'nu',
    locataires: [{ civilite: 'M.', nom: 'Locataire A-01' }], irl: 'T1 2025',
    locNouvIban: 'FR7600000000000000000000000',
    signatures: { signedAt: '2025-06-20T10:00:00.000Z', locked: true, mode: 'presentiel', bailSnapshot: snapshot },
  };
}

describe('bail SIGNÉ : seul le champ racine part, le document scellé ne bouge pas', () => {
  it('empreinte légale (bailLegalContent / content_hash) identique avant et après', async () => {
    const b = bailSigneAvecIban();
    const avant = await bailContentHash(b);
    const contenuAvant = canonicalStringify(bailLegalContent(b));
    const snapAvant = JSON.stringify(b.signatures);
    const r = normaliserDonneesLoyers({ baux: { 'A-01': b } });
    expect(r.baux).toBe(1);
    expect(r.ibanSnapshotsSignes).toBe(1);                   // compté, jamais retiré (décision D3 ouverte)
    expect('locNouvIban' in b).toBe(false);
    expect(JSON.stringify(b.signatures)).toBe(snapAvant);
    expect(canonicalStringify(bailLegalContent(b))).toBe(contenuAvant);
    expect(await bailContentHash(b)).toBe(avant);
    expect('_modifiedAt' in b).toBe(false);                  // aucun tampon sur le document signé
  });
  it('bail NON signé et bail archivé : IBAN retiré, bail tamponné', () => {
    const vivant = { hc: 600, locNouvIban: 'FR76' };
    const archive = { hc: 400, locNouvIban: 'FR76', archive: true };
    const db = { baux: { 'B-01': vivant }, baux_historique: [archive] };
    const r = normaliserDonneesLoyers(db, { stamp: (o) => { o._modifiedAt = 'T'; } });
    expect(r.baux).toBe(1);
    expect(r.historique).toBe(1);
    expect(vivant).toEqual({ hc: 600, _modifiedAt: 'T' });
    expect(archive).toEqual({ hc: 400, archive: true, _modifiedAt: 'T' });
  });
  it('journal des baux signés : le changement IBAN est retiré, une entrée vidée est supprimée logiquement', () => {
    const seul = { id: 'j1', changements: [{ champ: 'locNouvIban', avant: '', apres: 'FR76' }] };
    const mixte = { id: 'j2', changements: [{ champ: 'locNouvIban', apres: 'FR76' }, { champ: 'dgRestitueAt', apres: '2026-05-01' }] };
    const autre = { id: 'j3', changements: [{ champ: 'jpay', apres: 7 }] };
    const r = normaliserDonneesLoyers({ baux_evenements: [seul, mixte, autre] }, { stamp: (o) => { o._modifiedAt = 'T'; } });
    expect(r.journal).toBe(2);
    expect(seul._deleted).toBe(true);
    expect(mixte.changements).toEqual([{ champ: 'dgRestitueAt', apres: '2026-05-01' }]);
    expect(mixte._deleted).toBeUndefined();
    expect(autre).toEqual({ id: 'j3', changements: [{ champ: 'jpay', apres: 7 }] });
  });
  it('un ancien journal portant l\'IBAN n\'est plus réappliqué au chargement (hors CHAMPS_VIE)', () => {
    expect('locNouvIban' in CHAMPS_VIE).toBe(false);
    const bail = { debut: '2025-07-01', signatures: { signedAt: '2025-06-20T10:00:00.000Z', mode: 'presentiel' } };
    reappliquerJournalBaux({ 'A-01': bail }, [{ id: 'j', type: 'modification', ref: 'A-01', bailDebut: '2025-07-01',
      signedAt: '2025-06-20T10:00:00.000Z', changements: [{ champ: 'locNouvIban', apres: 'FR76' }] }]);
    expect('locNouvIban' in bail).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('périmètre EXACT et catégorie personnelle', () => {
  it('« Arriérés de loyers » (ancien libellé) est normalisé comme « Loyers »', () => {
    const db = { mouvements: [{ cat: 'Arriérés de loyers', cr: 100 }], importRules: [{ cat: 'Arriérés de loyers' }],
      categories: ['Arriérés de loyers'] };
    const r = normaliserDonneesLoyers(db);
    expect(db.mouvements[0].cat).toBe(CATEGORIE_LOYERS);
    expect(db.importRules[0].cat).toBe(CATEGORIE_LOYERS);
    expect(db.categories).toEqual([CATEGORIE_LOYERS]);
    expect(r.reglesImport).toBe(1);
  });
  it('NE TOUCHE PAS « loyer » en minuscules ni aucun autre libellé voisin (espace d\'un autre utilisateur)', () => {
    const db = { mouvements: [{ cat: 'loyer', cr: 800 }, { cat: 'Loyer', cr: 1 }, { cat: 'Loyers ', cr: 1 }, { cat: 'loyers', cr: 1 }] };
    const fige = JSON.stringify(db);
    const r = normaliserDonneesLoyers(db);
    expect(r.modifie).toBe(false);
    expect(JSON.stringify(db)).toBe(fige);
    expect(CATEGORIES_LOYERS_HERITEES).toEqual(['Loyers', 'Arriérés de loyers']);
  });
  it('« Loyers » rattaché à la ligne 211 (cas réel 63bde261) : normalisé, mapping nettoyé, pierre tombale gardée', () => {
    const db = { mouvements: [{ cat: 'Loyers', cr: 500 }], params: { legal2044Mapping: { Loyers: '211', Autre: '221' },
      _deletedCategories: { Loyers: true } }, catConfig: { Loyers: { inclYTD: true } } };
    expect(homonymePerso(db, 'Loyers')).toBe(false);
    normaliserDonneesLoyers(db);
    expect(db.mouvements[0].cat).toBe(CATEGORIE_LOYERS);
    expect(db.params.legal2044Mapping).toEqual({ Autre: '221' });
    expect(db.params._deletedCategories).toEqual({ Loyers: true });
    expect(db.catConfig).toEqual({});
  });
  it('catégorie PERSONNELLE homonyme rattachée ailleurs : rien n\'est touché, le nom est signalé', () => {
    for (const reglage of [
      { catAlias: { Loyers: 'Recettes diverses' } },
      { catMapping: { Loyers: '213' } },
      { params: { legal2044Mapping: { Loyers: '__ignore' } } },
    ]) {
      const db = { mouvements: [{ cat: 'Loyers', cr: 80 }], categories: ['Loyers'], catConfig: { Loyers: { inclYTD: true } }, ...reglage };
      const fige = JSON.stringify(db);
      const r = normaliserDonneesLoyers(db);
      expect(r.nomsSautes).toEqual(['Loyers']);
      expect(JSON.stringify(db)).toBe(fige);
    }
  });
  it('mappings contradictoires : catMapping prime sur legal2044Mapping, comme le classifieur', () => {
    // Classé 211 par l'app (catMapping gagne) → c'est l'héritage, normalisé.
    const a = { catMapping: { Loyers: '211' }, params: { legal2044Mapping: { Loyers: '221' } } };
    expect(homonymePerso(a, 'Loyers')).toBe(false);
    // Classé 221 par l'app → catégorie personnelle, laissée intacte.
    const b = { catMapping: { Loyers: '221' }, params: { legal2044Mapping: { Loyers: '211' } } };
    expect(homonymePerso(b, 'Loyers')).toBe(true);
    // catMapping vide (falsy) : le wizard 2044 reprend la main, clé par clé.
    const c = { catMapping: { Loyers: '' }, params: { legal2044Mapping: { Loyers: '211' } } };
    expect(homonymePerso(c, 'Loyers')).toBe(false);
  });
  it('alias vers « Loyers encaissés » : c\'est bien l\'héritage, normalisé et alias retiré', () => {
    const db = { mouvements: [{ cat: 'Loyers', cr: 80 }], catAlias: { Loyers: CATEGORIE_LOYERS, 'Loyer F3': CATEGORIE_LOYERS } };
    normaliserDonneesLoyers(db);
    expect(db.mouvements[0].cat).toBe(CATEGORIE_LOYERS);
    expect(db.catAlias).toEqual({ 'Loyer F3': CATEGORIE_LOYERS });
  });
  it('base vide ou absente : ne jette pas', () => {
    expect(normaliserDonneesLoyers(null).modifie).toBe(false);
    expect(normaliserDonneesLoyers({}).modifie).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('plus aucune tolérance de « Loyers » dans le code', () => {
  it('le classifieur ne reconnaît plus le libellé hérité, même avec le vrai référentiel', () => {
    expect(_isLoyerCategory('Loyers', catCtxFromDb({}, STD))).toBe(false);
    expect(_isLoyerCategory(CATEGORIE_LOYERS, catCtxFromDb({}, STD))).toBe(true);
  });
  it('index.html : plus de repli `=== \'Loyers\'`, plus de réinjection de catConfig[\'Loyers\'], démo en « Loyers encaissés »', () => {
    expect(html).not.toMatch(/c => c === 'Loyers'\)/);
    expect(html).not.toMatch(/m\.cat === 'Loyers'/);
    expect(html).not.toMatch(/DB\.catConfig\['Loyers'\] = /);
    expect(html).not.toMatch(/cat:'Loyers',/);
    expect(html).not.toMatch(/'Arriérés de loyers': 'Loyers encaissés'/);
  });
  it('la normalisation est appelée aux 4 portes d\'entrée prévues', () => {
    expect(corpsDe('initDB')).toMatch(/_normaliserLoyers\('initDB'\)/);
    expect(corpsDe('_backupRestoreApply')).toMatch(/_normaliserLoyers\('restauration'\)/);
    expect(corpsDe('importJSON')).toMatch(/_normaliserLoyers\('import JSON', data\)/);
    // Cloud : à CHAQUE hydratation (__immoSetDB), plus une seule fois dans _bootDataJobs (audit 05/10).
    expect(setDbSrc()).toMatch(/_normaliserLoyers\('hydratation'\)/);
    expect(corpsDe('_bootDataJobs')).not.toMatch(/_normaliserLoyers\(/);
    // initDB : AVANT les autres migrations de catégories, et AVANT la capture d'annulation
    // (sinon « Annuler » juste après le démarrage ramènerait « Loyers »).
    const init = corpsDe('initDB');
    expect(init.indexOf("_normaliserLoyers('initDB')")).toBeLessThan(init.indexOf('const _CAT_MIGRATION'));
    expect(init.indexOf("_normaliserLoyers('initDB')")).toBeLessThan(init.indexOf('_undoLastSnapshot = _undoSnapshot()'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('écran de restitution du dépôt de garantie : plus d\'IBAN du locataire', () => {
  it('ni champ, ni lecture, ni écriture de locNouvIban', () => {
    const ouvrir = corpsDe('_dgOpenRestitution'), confirmer = corpsDe('_dgConfirmerRestitution');
    expect(ouvrir).not.toMatch(/dg-restit-iban|IBAN|locNouvIban/);
    expect(confirmer).not.toMatch(/dg-restit-iban|bail\.locNouvIban\s*=/);
    expect(confirmer).toMatch(/delete bail\.locNouvIban;/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AUDIT 05/10 — partage SCI : seul l'ESPACE PROPRE est normalisé ; bail verrouillé : rien à persister.
describe('espace propre (partage SCI) et bail verrouillé', () => {
  const dbPartage = () => ({
    mouvements: [
      { id: 1, cat: 'Loyers', cr: 500, _espaceId: 'E-PROPRE' },
      { id: 2, cat: 'Loyers', cr: 600 },                              // créé ici, pas encore tagué = propre
      { id: 3, cat: 'Loyers', cr: 700, _espaceId: 'E-TIERS' },       // SCI partagée par un autre propriétaire
    ],
    baux: { 'T-01': { hc: 700, locNouvIban: 'FR76', _espaceId: 'E-TIERS' } },
    baux_evenements: [{ id: 'j', _espaceId: 'E-TIERS', changements: [{ champ: 'locNouvIban', apres: 'FR76' }] }],
    categories: ['Loyers'],
  });
  for (const role of ['écriture', 'lecture seule']) {
    it(`associé en ${role} : les enregistrements du propriétaire ne sont JAMAIS modifiés`, () => {
      // Le rôle n'entre pas dans la décision : ce n'est pas la config de l'associé qui doit classer les
      // données du propriétaire, et en lecture seule la RLS refuserait l'envoi à chaque démarrage.
      const db = dbPartage();
      const tiersAvant = JSON.stringify([db.mouvements[2], db.baux, db.baux_evenements]);
      const r = normaliserDonneesLoyers(db, { espacePropre: 'E-PROPRE', stamp: (o) => { o._modifiedAt = 'T'; } });
      expect(db.mouvements[0].cat).toBe(CATEGORIE_LOYERS);
      expect(db.mouvements[1].cat).toBe(CATEGORIE_LOYERS);
      expect(JSON.stringify([db.mouvements[2], db.baux, db.baux_evenements])).toBe(tiersAvant);
      expect(r.mouvements).toBe(2);
      expect(r.horsEspace).toBe(3);   // 1 mouvement + 1 bail + 1 entrée de journal, laissés au propriétaire
    });
  }
  it('espace propre inconnu (getter qui répond null) : seuls les enregistrements NON tagués sont normalisés', () => {
    const db = dbPartage();
    normaliserDonneesLoyers(db, { espacePropre: null });
    expect(db.mouvements.map(m => m.cat)).toEqual(['Loyers', CATEGORIE_LOYERS, 'Loyers']);
  });
  it('hors mode cloud (pas d\'option) : tout est propre', () => {
    const db = dbPartage();
    normaliserDonneesLoyers(db);
    expect(db.mouvements.every(m => m.cat === CATEGORIE_LOYERS)).toBe(true);
  });
  it('IBAN sur un bail VERROUILLÉ seul : purgé en mémoire, mais rien à persister (pas de saveDB à chaque démarrage)', () => {
    const b = bailSigneAvecIban();   // signatures.locked = true
    const r = normaliserDonneesLoyers({ baux: { 'A-01': b } });
    expect('locNouvIban' in b).toBe(false);
    expect(r.modifie).toBe(true);
    expect(r.bauxVerrouilles).toBe(1);
    expect(r.aPersister).toBe(false);
    // Un bail non verrouillé, lui, part au cloud.
    const r2 = normaliserDonneesLoyers({ baux: { 'B-01': { hc: 1, locNouvIban: 'FR76' } } });
    expect(r2.aPersister).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// AUDIT 05/10 — hydratation cloud : vraie `__immoSetDB` d'index.html + vrai moteur de synchro (store-sync).
describe('hydratation cloud (__immoSetDB à CHAQUE appel) : persiste, pousse, ne boucle pas', () => {
  function cloud() {
    const timers = [];
    const compte = { saves: 0, dirty: 0, rendus: 0 };
    const win = {
      NormalisationLoyers: NL, __immoSupabaseMode: true, __immoOwnEspaceId: () => 'E-PROPRE',
      __immoRerenderCurrent: () => { compte.rendus++; },
    };
    // saveDB du mode cloud : marque sale → l'envoi part (supabase-entry : __immoMarkDirty → flush).
    const saveDB = () => { compte.saves++; if (typeof win.__immoMarkDirty === 'function') win.__immoMarkDirty(); };
    const src = [corpsDe('_stamp'), corpsDe('_normaliserLoyers'), setDbSrc()].join('\n');
    const api = new Function('window', 'console', 'setTimeout', 'saveDB', '_applyDataDefaults', '_applyParamDefaults',
      'document', 'closeM', '_bootDataJobs', '_bootDataJobsDone',
      `let DB = {};\n${src}\nreturn { get DB() { return DB; } };`
    )(win, silence, (fn) => { timers.push(fn); }, saveDB, () => {}, () => {}, { querySelectorAll: () => [] }, () => {}, undefined, true);
    const tick = () => { const t = timers.splice(0); t.forEach(f => f()); return t.length; };
    return { win, api, compte, tick };
  }
  // Store simulé : enregistre chaque écriture ; un enregistrement d'un AUTRE espace = refus RLS (associé en lecture).
  function storeRls() {
    const calls = [];
    const ok = (coll, rec) => { calls.push({ coll, rec }); if (rec && rec._espaceId === 'E-TIERS') throw new Error('42501 RLS'); return { status: 'updated', version: 2 }; };
    return { calls, upsert: async (c, r) => ok(c, r), remove: async (c, r) => ok(c, r), archive: async (c, r) => ok(c, r) };
  }
  const serveur = () => ({
    baux: {}, logements: [], entites: [],
    mouvements: [
      { id: 11, date: '2026-01-05', qui: 'A-01', cat: 'Loyers', cr: 550, db: 0, _espaceId: 'E-PROPRE' },
      { id: 12, date: '2026-02-05', qui: 'A-01', cat: 'Loyers', cr: 550, db: 0, _espaceId: 'E-PROPRE' },
      { id: 13, date: '2026-01-05', qui: 'T-01', cat: 'Loyers', cr: 700, db: 0, _espaceId: 'E-TIERS' },
      { id: 14, date: '2026-01-10', qui: '', cat: 'Prêt', cr: 0, db: 400, _espaceId: 'E-PROPRE' },
    ],
    categories: ['Loyers'], catConfig: { Loyers: { inclYTD: true } }, params: {},
  });

  it('login : normalise APRÈS le seed, sauvegarde, pousse les seuls mouvements propres, re-rend la page', async () => {
    const { win, compte, tick } = cloud();
    const db = serveur();
    expect(win.__immoSetDB(db)).toBe(true);
    // supabase-entry, de façon SYNCHRONE juste après __immoSetDB : seed puis branchement du marquage sale.
    expect(db.mouvements[0].cat).toBe('Loyers');            // pas encore normalisé : sinon la baseline l'avalerait
    const store = storeRls();
    const sync = createStoreSync({ store, getDB: () => db });
    sync.seed();
    win.__immoMarkDirty = () => { compte.dirty++; sync.markDirty(); };
    tick();                                                 // setTimeout(0)
    expect(compte.saves).toBe(1);                           // PERSISTE (la mutation « retrait du saveDB » échoue ici)
    expect(compte.dirty).toBe(1);                           // marque sale → envoi
    expect(compte.rendus).toBe(1);                          // le 1er rendu (données brutes) est remplacé
    const s = await sync.flush();
    const envoyes = store.calls.filter(c => c.coll === 'mouvements').map(c => c.rec.id).sort();
    expect(envoyes).toEqual([11, 12]);                      // POUSSE les mouvements propres normalisés…
    expect(store.calls.some(c => c.rec && c.rec._espaceId === 'E-TIERS')).toBe(false);   // …jamais ceux du tiers
    expect((s.errors || []).length).toBe(0);                // aucun refus RLS (associé en lecture seule)
    expect(db.mouvements.find(m => m.id === 13).cat).toBe('Loyers');
  });

  it('re-pull en cours de session (Realtime) : un « Loyers » reçu est normalisé sans recharger', () => {
    const { win, compte, tick } = cloud();
    const db1 = serveur();
    db1.mouvements.forEach(m => { if (m._espaceId === 'E-PROPRE' && m.cat === 'Loyers') m.cat = CATEGORIE_LOYERS; });
    db1.categories = [CATEGORIE_LOYERS]; db1.catConfig = {};
    win.__immoSetDB(db1); tick();
    expect(compte.saves).toBe(0);                           // rien d'hérité côté propre au login
    const db2 = serveur();                                  // un vieil appareil a repoussé « Loyers »
    win.__immoSetDB(db2); tick();
    expect(db2.mouvements.filter(m => m._espaceId === 'E-PROPRE' && m.cat === 'Loyers')).toEqual([]);
    expect(compte.saves).toBe(1);
    expect(compte.rendus).toBe(1);
  });

  it('PAS DE BOUCLE : normaliser → pousser → recevoir l\'écho → ré-hydrater → plus rien à faire', async () => {
    const { win, compte, tick } = cloud();
    const db = serveur();
    win.__immoSetDB(db);
    const store = storeRls();
    const sync = createStoreSync({ store, getDB: () => db });
    sync.seed();
    win.__immoMarkDirty = () => { compte.dirty++; sync.markDirty(); };
    tick();
    await sync.flush();
    // L'écho Realtime : le serveur renvoie l'état poussé → ré-hydratation complète, 3 tours.
    for (let i = 0; i < 3; i++) {
      const echo = JSON.parse(JSON.stringify(db));
      win.__immoSetDB(echo); tick();
    }
    expect(compte.saves).toBe(1);                           // une seule sauvegarde, au 1er tour
    expect(compte.dirty).toBe(1);
    expect(compte.rendus).toBe(1);
  });

  it('bail verrouillé portant un IBAN : aucune sauvegarde, aucun rendu, à chaque ré-hydratation', () => {
    const { win, compte, tick } = cloud();
    for (let i = 0; i < 3; i++) {
      const db = { baux: { 'A-01': Object.assign(bailSigneAvecIban(), { _espaceId: 'E-PROPRE' }) }, logements: [], mouvements: [] };
      win.__immoSetDB(db); tick();
      expect('locNouvIban' in db.baux['A-01']).toBe(false);
    }
    expect(compte.saves).toBe(0);
    expect(compte.rendus).toBe(0);
  });

  it('hors ligne : rien n\'est normalisé ni écrit', () => {
    const { win, compte, tick } = cloud();
    win.__immoHorsLigne = true;
    const db = serveur();
    win.__immoSetDB(db); tick();
    expect(db.mouvements[0].cat).toBe('Loyers');
    expect(compte.saves).toBe(0);
  });
});
