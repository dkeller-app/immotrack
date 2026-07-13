// P1.7 DÉFAUTS ESPACE FRAIS (AUDIT SYNC CLOUD 2026-07-12 §4) — `_applyDataDefaults()`
//
// Bug : un espace cloud fraîchement créé ne recevait JAMAIS les défauts d'initDB hors params
// (`_applyParamDefaults` v15.452 ne rejoue QUE DB.params). Sur un blob espace_config = params
// seuls (prouvé : espace Marion 2e5c49db), categories/templates.bail/irlTable/piecesEDL/catConfig
// n'existent pas → TypeError / pages vides (Mouvements, Réglages catégories, IRL, éditeur bail)
// pour TOUT nouvel inscrit.
//
// Fix (même pattern que v15.452) : extraction 1:1 des blocs de DÉFAUTS idempotents d'initDB
// (fill-missing UNIQUEMENT, pas les migrations de données) dans `_applyDataDefaults()`, appelée
// par initDB() (chemin legacy) ET par __immoSetDB() (hydratation cloud) AVANT _applyParamDefaults.
//
// Ces tests extraient la fonction inline d'index.html et l'exécutent avec des constantes stubs
// (même approche que les tests inline legal-2044 / loyer-statut).

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

// ── Extraction de la fonction inline (déclaration top-level, fermée par `}` colonne 0) ──
function extractFn(html, name) {
  const start = html.indexOf(`function ${name}() {`);
  if (start === -1) return null;
  const end = html.indexOf('\n}', start);
  if (end === -1) return null;
  return html.slice(start, end + 2);
}

// Constantes stubs — formes réelles, valeurs minimales.
const IRL_DEFAULT = { 'T1 2024': 143.46, 'T2 2024': 145.17, 'T3 2024': 144.51 };
const DEFAULT_CATS = ['Loyers encaissés', 'Frais bancaires', 'Prêt'];
const DEFAULT_PIECES = { 'Cuisine': ['Sol', 'Murs'], 'Séjour': ['Sol'] };
const BAIL_TEMPLATE_DEFAULT = '<html>TPL-DEFAUT</html>';

let indexHtml, indexTestHtml, applyDataDefaults;

beforeAll(() => {
  indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  indexTestHtml = readFileSync(resolve(repoRoot, 'index-test.html'), 'utf8');
  const src = extractFn(indexHtml, '_applyDataDefaults');
  if (src) {
    // La fonction inline référence DB + constantes globales → wrapper qui les fournit.
    const factory = new Function(
      'IRL_DEFAULT', 'DEFAULT_CATS', 'DEFAULT_PIECES', 'BAIL_TEMPLATE_DEFAULT',
      `let DB; ${src}\nreturn (db) => { DB = db; _applyDataDefaults(); return DB; };`
    );
    applyDataDefaults = factory(IRL_DEFAULT, DEFAULT_CATS, DEFAULT_PIECES, BAIL_TEMPLATE_DEFAULT);
  }
});

describe('_applyDataDefaults — extraction & câblage index.html', () => {
  it('la fonction _applyDataDefaults existe dans index.html', () => {
    expect(extractFn(indexHtml, '_applyDataDefaults'), '_applyDataDefaults introuvable dans index.html').toBeTruthy();
  });

  it('parité : source byte-identique dans index-test.html', () => {
    expect(extractFn(indexTestHtml, '_applyDataDefaults'), '_applyDataDefaults introuvable dans index-test.html')
      .toBe(extractFn(indexHtml, '_applyDataDefaults'));
  });

  it('initDB appelle _applyDataDefaults() (les deux fichiers)', () => {
    for (const [name, html] of [['index.html', indexHtml], ['index-test.html', indexTestHtml]]) {
      const initDB = html.slice(html.indexOf('function initDB()'), html.indexOf('AGENDA — Modèle de données'));
      expect(initDB.includes('_applyDataDefaults();'), `initDB de ${name} n'appelle pas _applyDataDefaults`).toBe(true);
    }
  });

  it('__immoSetDB (index.html) appelle _applyDataDefaults AVANT _applyParamDefaults (ordre initDB)', () => {
    const start = indexHtml.indexOf('window.__immoSetDB = function');
    expect(start, '__immoSetDB introuvable').toBeGreaterThan(-1);
    const body = indexHtml.slice(start, indexHtml.indexOf('\n};', start));
    const iData = body.indexOf('_applyDataDefaults()');
    const iParam = body.indexOf('_applyParamDefaults()');
    expect(iData, '__immoSetDB doit appeler _applyDataDefaults').toBeGreaterThan(-1);
    expect(iParam, '__immoSetDB doit toujours appeler _applyParamDefaults').toBeGreaterThan(-1);
    expect(iData, '_applyDataDefaults doit précéder _applyParamDefaults').toBeLessThan(iParam);
  });

  it("initDB ne garde AUCUN doublon des blocs déplacés (DRY : déplacé, pas copié)", () => {
    for (const [name, html] of [['index.html', indexHtml], ['index-test.html', indexTestHtml]]) {
      const initDB = html.slice(html.indexOf('function initDB()'), html.indexOf('AGENDA — Modèle de données'));
      for (const marker of [
        'if (!DB.entites) DB.entites = [];',
        'DB.templates.bail = BAIL_TEMPLATE_DEFAULT;',
        'if (!DB.categories) DB.categories = [...DEFAULT_CATS];',
        'if (!DB.piecesEDL) DB.piecesEDL = {...DEFAULT_PIECES};',
        "if(!('Loyers' in DB.catConfig))",
        'if(!DB.irlHistorique) DB.irlHistorique = [];',
        'if(!DB.agenda) DB.agenda = [];',
        'if(!DB.equipements) DB.equipements = {};',
      ]) {
        expect(initDB.includes(marker), `${name} : bloc « ${marker} » encore inline dans initDB (doit vivre dans _applyDataDefaults)`).toBe(false);
      }
    }
  });
});

describe('_applyDataDefaults — espace VIDE (blob = params seuls, cas Marion)', () => {
  // Reproduit exactement le blob d'un espace frais : hydrate() fournit les collections
  // TABLES (vides) + config = params seuls. Tout le reste doit être créé.
  const freshCloudDB = () => ({
    entites: [], documents: [], logements: [], baux: {}, baux_historique: [],
    mouvements: [], quittances: [], edl: [], candidats: [], mrh: [], agenda: [],
    params: { dashRenderV: 'v2' },
  });

  it('crée categories = copie de DEFAULT_CATS (consommateurs initFilters / rParamsCats)', () => {
    const db = applyDataDefaults(freshCloudDB());
    expect(db.categories).toEqual(DEFAULT_CATS);
    expect(db.categories).not.toBe(DEFAULT_CATS); // copie, pas la réf partagée (leçon v15.439)
  });

  it('crée templates.bail (défaut versionné) — consommateur éditeur bail', () => {
    const db = applyDataDefaults(freshCloudDB());
    expect(db.templates.bail).toBe(BAIL_TEMPLATE_DEFAULT);
    expect(db.templates.bailVersion).toBeTruthy();
  });

  it('crée irlTable = copie de IRL_DEFAULT (consommateur Object.keys(DB.irlTable))', () => {
    const db = applyDataDefaults(freshCloudDB());
    expect(db.irlTable).toEqual(IRL_DEFAULT);
    expect(db.irlTable).not.toBe(IRL_DEFAULT);
  });

  it('crée piecesEDL = copie de DEFAULT_PIECES', () => {
    const db = applyDataDefaults(freshCloudDB());
    expect(db.piecesEDL).toEqual(DEFAULT_PIECES);
    expect(db.piecesEDL).not.toBe(DEFAULT_PIECES);
  });

  it('crée catConfig avec Loyers.inclYTD + annotations recuperable/deductible2044', () => {
    const db = applyDataDefaults(freshCloudDB());
    expect(db.catConfig['Loyers']).toEqual({ inclYTD: true, recuperable: null, deductible2044: null });
  });

  it('crée les collections annexes : assurances, irlHistorique, agenda(+LastSync), equipements, dashLayout', () => {
    const db = applyDataDefaults(freshCloudDB());
    expect(db.assurances).toEqual([]);
    expect(db.irlHistorique).toEqual([]);
    expect(db.agendaLastSync).toBeNull();
    expect(db.equipements).toEqual({});
    expect(db.params.dashLayout).toBeNull();
  });

  it('DB entièrement vide ({}) : ne jette pas, crée aussi les collections tables + params', () => {
    const db = applyDataDefaults({});
    expect(db.entites).toEqual([]);
    expect(db.baux).toEqual({});
    expect(db.mouvements).toEqual([]);
    expect(db.params).toEqual({ dashLayout: null });
    expect(db.categories).toEqual(DEFAULT_CATS);
  });

  it('INTERDIT (règle gravée) : aucune donnée démo injectée — collections métier restent vides', () => {
    const db = applyDataDefaults(freshCloudDB());
    expect(db.entites).toEqual([]);
    expect(db.logements).toEqual([]);
    expect(db.mouvements).toEqual([]);
    expect(db.baux).toEqual({});
  });
});

describe('_applyDataDefaults — espace NON vide : ne récupère QUE les clés manquantes', () => {
  it("n'écrase JAMAIS un existant (categories custom, piecesEDL custom, irlTable custom, catConfig)", () => {
    const db = {
      entites: [], documents: [], logements: [], baux: {}, baux_historique: [],
      mouvements: [], quittances: [], edl: [], candidats: [], mrh: [], agenda: [{ id: 'evt_1' }],
      params: { dashLayout: { rows: 2 } },
      categories: ['Ma catégorie perso'],
      piecesEDL: { 'Atelier': ['Sol'] },
      irlTable: { 'T1 2024': 999.99, 'T4 2019': 130.26 },
      catConfig: { 'Loyers': { inclYTD: false, recuperable: true, deductible2044: '221' }, 'Perso': { inclYTD: true } },
      templates: { bail: '<html>MON TEMPLATE</html>', bailVersion: '2026-v1' },
      irlHistorique: [{ ref: 'F-001' }],
      equipements: { 'F-001': {} },
    };
    const out = applyDataDefaults(db);
    expect(out.categories).toEqual(['Ma catégorie perso']);           // pas de réinjection DEFAULT_CATS
    expect(out.piecesEDL).toEqual({ 'Atelier': ['Sol'] });            // customs préservés
    expect(out.irlTable['T1 2024']).toBe(999.99);                     // valeur custom préservée…
    expect(out.irlTable['T2 2024']).toBe(145.17);                     // …mais trimestre MANQUANT réinjecté
    expect(out.irlTable['T4 2019']).toBe(130.26);                     // trimestre hors défaut intact
    expect(out.catConfig['Loyers']).toEqual({ inclYTD: false, recuperable: true, deductible2044: '221' });
    expect(out.templates.bail).toBe('<html>MON TEMPLATE</html>');     // template custom version courante intact
    expect(out.irlHistorique).toEqual([{ ref: 'F-001' }]);
    expect(out.agenda).toEqual([{ id: 'evt_1' }]);
    expect(out.equipements).toEqual({ 'F-001': {} });
    expect(out.params.dashLayout).toEqual({ rows: 2 });
  });

  it('annote un catConfig existant sans recuperable/deductible2044 (fill-missing par clé)', () => {
    const out = applyDataDefaults({ catConfig: { 'Perso': { inclYTD: true } } });
    expect(out.catConfig['Perso']).toEqual({ inclYTD: true, recuperable: null, deductible2044: null });
  });

  it('templates.bail avec bailVersion PÉRIMÉE → remplacé par le défaut (sémantique initDB conservée)', () => {
    const out = applyDataDefaults({ templates: { bail: '<html>VIEUX</html>', bailVersion: '2024-v0' } });
    expect(out.templates.bail).toBe(BAIL_TEMPLATE_DEFAULT);
    expect(out.templates.bailVersion).not.toBe('2024-v0');
  });

  it('correction silencieuse _irlFix : valeur erronée connue corrigée, autre valeur intacte', () => {
    const out = applyDataDefaults({ irlTable: { 'T1 2023': 140.59, 'T2 2023': 141.00 } });
    expect(out.irlTable['T1 2023']).toBe(138.61); // valeur erronée historique → corrigée
    expect(out.irlTable['T2 2023']).toBe(141.00); // valeur non listée → intacte
  });

  it('idempotence : deux passes = résultat identique', () => {
    const a = applyDataDefaults({});
    const b = applyDataDefaults(JSON.parse(JSON.stringify(a)));
    expect(b).toEqual(a);
  });
});
