/**
 * Chantier « un seul endroit pour l'argent » — lot 6, corrections de l'audit.
 *
 * 🔴1 — avec un bailleur choisi, l'export filtrait par refs EXACTES : une charge posée sur l'immeuble (qui vide +
 *       imm : taxe foncière, PNO, syndic) ou une ref saisie avec des espaces / une autre casse n'était ni écrite
 *       ni listée, alors que Finances la compte. L'app injecte désormais LE périmètre de Finances
 *       (`_finEntScope` + `_finScopeWeightCore`) : `opts.dansPerimetre`.
 * Plus : tri et arrondi des non-exportés, XSS du récapitulatif, fichier de la liste dans le ZIP, classement figé
 * à l'ouverture du dossier, lignes « # » d'une seule ligne.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _buildMvtRows, _buildEcritures, _listNonExportes, _nonExportesCsv } from '../../js/core/export-comptable.js';
import { _dcIndexCsv } from '../../js/core/dossier-comptable.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { resolveScope, scopeWeight } from '../../js/core/finances-scope.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lire = (f) => readFileSync(resolve(root, f), 'utf8').replace(/\r/g, '');
const P1 = lire('js/app/app-part1.js'), P2 = lire('js/app/app-part2.js');
const STD = (() => { const i = P1.indexOf('const STD_CATEGORIES = ['), j = P1.indexOf('\n];', i); return new Function(P1.slice(i, j + 3) + '\nreturn STD_CATEGORIES;')(); })();
const corps = (nom) => { const i = P2.search(new RegExp('\\n(async )?function ' + nom + '\\(')); return i < 0 ? '' : P2.slice(i, P2.indexOf('\n}', i + 1) + 2); };
const catMere = (nom) => STD.find((c) => c.nom === nom) || null;

const LOGEMENTS = [
  { ref: 'A1', entity: 'SCI A', imm: 'Imm A' },
  { ref: 'A2', entity: 'SCI A', imm: 'Imm A' },
  { ref: 'B1', entity: 'SCI B', imm: 'Imm B' },
];
const TF = 'Taxe foncière (et taxes annexes)', LOYER = 'Loyers encaissés', HONO = 'Frais de gestion / honoraires / comptabilité';
const MVTS = [
  { date: '2025-03-01', cat: TF, db: 500, qui: '', imm: 'Imm A', lib: 'Taxe foncière immeuble' },   // niveau immeuble
  { date: '2025-01-10', cat: LOYER, cr: 900, qui: ' a1 ', lib: 'Loyer (ref saisie à la main)' },     // ref tolérante
  { date: '2025-02-10', cat: LOYER, cr: 1000, qui: 'A2', lib: 'Loyer A2' },
  { date: '2025-04-01', cat: HONO, db: 100, qui: 'SCI:SCI A', lib: 'Comptable' },
  { date: '2025-05-01', cat: 'Divers (non déductible)', db: 20, qui: '', imm: 'Imm A', lib: 'Divers immeuble' },
  { date: '2025-06-01', cat: LOYER, cr: 777, qui: 'B1', lib: 'Loyer autre bailleur' },
  { date: '2025-06-02', cat: TF, db: 300, qui: '', imm: 'Imm B', lib: 'TF autre immeuble' },
];
const SC = resolveScope({ ent: 'SCI A' }, LOGEMENTS, { entites: [{ nom: 'SCI A' }, { nom: 'SCI B' }] });
const OPTS = { from: '2025-01-01', to: '2025-12-31', entityNom: 'SCI A', refs: ['A1', 'A2'], catMere, dansPerimetre: (m) => scopeWeight(SC, m) > 0 };

describe('Export d’un bailleur : le périmètre est celui de Finances', () => {
  it('charge posée sur l’immeuble et ref tolérante : écrites ; l’autre bailleur : absent', () => {
    expect(_buildMvtRows(MVTS, STD, OPTS).map((r) => r.lib)).toEqual(['Taxe foncière immeuble', 'Loyer (ref saisie à la main)', 'Loyer A2', 'Comptable']);
    expect(_listNonExportes(MVTS, STD, OPTS).rows.map((r) => r.lib)).toEqual(['Divers immeuble']);
  });
  it('sans le périmètre injecté (repli historique) les deux disparaissaient — le défaut que l’injection corrige', () => {
    const { dansPerimetre, ...sans } = OPTS;
    expect(_buildMvtRows(MVTS, STD, sans).map((r) => r.lib)).toEqual(['Loyer A2', 'Comptable']);
  });
  it('invariant : écrits + listés = tous les mouvements que Finances compte pour ce bailleur', () => {
    const ecrits = _buildMvtRows(MVTS, STD, OPTS).map((r) => r.mvt);
    const listes = _listNonExportes(MVTS, STD, OPTS).rows.map((r) => MVTS.find((m) => m.lib === r.lib));
    const finances = MVTS.filter((m) => scopeWeight(SC, m) > 0 && ((m.cr || 0) || (m.db || 0)));
    expect([...ecrits, ...listes].sort((a, b) => a.lib.localeCompare(b.lib))).toEqual([...finances].sort((a, b) => a.lib.localeCompare(b.lib)));
  });
  it('net de l’export = Finances, ligne par ligne, sur ce bailleur', () => {
    const fin = _computeFinancesMonthly({
      mouvements: MVTS, year: 2025, scope: SC, scopeWeight, today: '2025-12-31',
      catLigne: (cat) => { const s = catMere(cat); return s && s.ligne2044 ? { ligne2044: s.ligne2044, type: s.type } : null; },
    }).annual;
    const net = {};
    const lignes = new Map(_buildMvtRows(MVTS, STD, OPTS).map((r) => [r.mapping.compte, r.std.ligne2044]));
    _buildEcritures(MVTS, STD, OPTS).forEach((e) => { const l = lignes.get(e.compte); if (l) net[l] = (net[l] || 0) + (l === '211' ? e.credit - e.debit : e.debit - e.credit); });
    expect(net).toEqual({ 211: 1900, 221: 100, 227: 500 });
    expect([fin.loyersBrut, fin.honoraires, fin.taxe]).toEqual([1900, 100, 500]);
  });
  // Contre-vérification 🟡C / 🟠1 — câblage EXÉCUTÉ (plus seulement cherché dans le source).
  const opts = (ent, catalogue = ['SCI A', 'SCI B']) => {
    const env = {
      window: { _finScopeWeightCore: scopeWeight }, DB: { logements: LOGEMENTS }, _isAlive: (x) => !!x && !x._deleted,
      v: (id) => ({ 'compta-year': '2025', 'compta-ent': ent }[id] || ''), _finCatMere: catMere,
      _finEntScope: (e) => resolveScope({ ent: e }, LOGEMENTS, { entites: catalogue.map((nom) => ({ nom })) }),
    };
    return new Function(...Object.keys(env), corps('_comptaDansPerimetre') + corps('_comptaBuildOpts') + '\nreturn _comptaBuildOpts;')(...Object.values(env))();
  };
  it('_comptaBuildOpts exécuté : le prédicat de Finances écrit la charge d’immeuble, exclut l’autre bailleur', () => {
    const o = opts('SCI A');
    expect(typeof o.dansPerimetre).toBe('function');
    expect(_buildMvtRows(MVTS, STD, o).map((r) => r.lib)).toEqual(['Taxe foncière immeuble', 'Loyer (ref saisie à la main)', 'Loyer A2', 'Comptable']);
    expect(opts('').dansPerimetre).toBeNull();   // « Toutes » : tout le patrimoine, sans prédicat
  });
  it('bailleur INTROUVABLE (supprimé / renommé) : rien n’est exporté, jamais tout le patrimoine sous son nom', () => {
    const o = opts('SCI X');
    expect(o.dansPerimetre).toBe(false);
    // même ses propres frais `SCI:SCI X` : le module ne retombe jamais sur le filtre historique
    const avecFrais = [...MVTS, { date: '2025-07-01', cat: HONO, db: 50, qui: 'SCI:SCI X', lib: 'Frais X' }, { date: '2025-07-02', cat: 'Prêt', db: 50, qui: 'SCI:SCI X', lib: 'Prêt X' }];
    expect(_buildMvtRows(avecFrais, STD, o)).toEqual([]);
    expect(_listNonExportes(avecFrais, STD, o).count).toBe(0);
    const toasts = [], fichiers = [];
    const env = { showToast: (...a) => toasts.push(a), _comptaBuildOpts: () => o, _comptaDownload: (...a) => fichiers.push(a), DB: { mouvements: MVTS }, STD_CATEGORIES: STD, _auditLog: () => {},
      window: { _buildEcritures, _toFEC: () => 'fec' } };
    new Function(...Object.keys(env), corps('_comptaBailleurInconnu') + corps('downloadFEC') + '\nreturn downloadFEC;')(...Object.values(env))();
    expect(fichiers).toEqual([]);
    expect(toasts[0][0]).toContain('Bailleur « SCI X » introuvable');
  });
  it('« Télécharger la liste » : les options FIGÉES au toast (pas la liste déroulante relue), jamais une liste vide', () => {
    const fichiers = [], toasts = [];
    const env = {
      window: { _listNonExportes, _nonExportesCsv }, DB: { mouvements: MVTS }, STD_CATEGORIES: STD, showToast: (...a) => toasts.push(a),
      _comptaDownload: (contenu, nom) => fichiers.push(nom), _dcTodayYmd: () => '2026-10-06', _auditLog: () => {},
      _comptaBuildOpts: () => { throw new Error('relu'); }, _dcBuildOpts: () => { throw new Error('relu'); },
    };
    const f = new Function(...Object.keys(env), 'let _comptaListeOpts = null;\n' + corps('_comptaBailleurInconnu') + corps('_comptaNonExportes') + corps('_comptaBoutonListe') + corps('_comptaTelechargerNonExportes') + '\nreturn { _comptaBoutonListe, _comptaTelechargerNonExportes };')(...Object.values(env));
    expect(f._comptaBoutonListe('dc', { ...OPTS, yr: '2025' })).toContain('min-height:44px');
    f._comptaTelechargerNonExportes('dc');
    expect(fichiers).toEqual(['Mouvements-non-exportes_2025_SCI_A.csv']);
    f._comptaBoutonListe('compta', { ...OPTS, from: '2030-01-01', to: '2030-12-31', yr: '2030' });
    f._comptaTelechargerNonExportes('compta');
    expect(fichiers).toHaveLength(1);
    expect(toasts.at(-1)[0]).toBe('Aucun mouvement non exporté sur cette période');
  });
  it('l’app injecte bien ce périmètre (FEC / journal / grand livre ET dossier ZIP)', () => {
    expect(corps('_comptaDansPerimetre')).toContain('window._finScopeWeightCore(sc, m) > 0');
    expect(corps('_comptaDansPerimetre')).toContain("_finEntScope(entNom, '')");
    expect(corps('_comptaBuildOpts')).toContain('dansPerimetre: _comptaDansPerimetre(entNom)');
    expect(corps('_dcBuildOpts')).toContain('dansPerimetre: _comptaDansPerimetre(entityNom)');
  });
  it('mouvement sans date : hors de toute période (ni écrit, ni listé — Finances l’ignore aussi)', () => {
    const m = [{ cat: LOYER, cr: 50, qui: 'A2' }, { cat: 'Prêt', db: 10, qui: 'A2' }];
    expect(_buildMvtRows(m, STD, OPTS)).toEqual([]);
    expect(_listNonExportes(m, STD, OPTS).count).toBe(0);
  });
});

describe('Non-exportés : ordre, arrondis, lignes « # »', () => {
  it('triés par date, totaux arrondis au centime', () => {
    const m = [
      { date: '2025-09-01', cat: 'Prêt', db: 0.1, qui: 'A2' },
      { date: '2025-02-01', cat: 'Prêt', db: 0.2, qui: 'A2' },
    ];
    const l = _listNonExportes(m, STD, OPTS);
    expect(l.rows.map((r) => r.date)).toEqual(['2025-02-01', '2025-09-01']);
    expect(l.sorties).toBe(0.3);
    expect(l.parCategorie[0].sorties).toBe(0.3);
  });
  it('montant écrit arrondi au centime (0,1 + 0,2)', () => {
    expect(_buildMvtRows([{ date: '2025-02-01', cat: HONO, db: 0.1 + 0.2, qui: 'A2' }], STD, OPTS)[0].montant).toBe(0.3);
  });
  it('un nom de bailleur ou de catégorie avec un retour à la ligne n’ouvre jamais une ligne de données', () => {
    const l = _listNonExportes([{ date: '2025-02-01', cat: 'X\n=1+1', db: 5, qui: 'A2' }], STD, { ...OPTS, catMere: () => null });
    const csv = _nonExportesCsv(l, { entityNom: 'SCI\n=HYPERLINK("x")', from: '2025-01-01', to: '2025-12-31' }).split('\n');
    // Tout ce qui précède la ligne des colonnes est un commentaire « # » (la cellule de détail, elle, est citée par _csvCell).
    const cols = csv.indexOf('date,lot,categorie,famille,libelle,entree,sortie');
    expect(cols).toBe(4);
    expect(csv.slice(0, cols).every((x) => x.startsWith('# '))).toBe(true);
    expect(csv[1]).toContain('bailleur : SCI =HYPERLINK("x")');
    expect(csv[3]).toBe('# X =1+1 — famille : sans famille : 1 mouvement(s) · entrées 0.00 · sorties 5.00');
    const idx = _dcIndexCsv({ meta: { entityNom: 'SCI\n=1+1' }, rows: [], pieceRefByNum: {} }).split('\n');
    expect(idx).toHaveLength(2);
    expect(idx[0]).toContain('bailleur : SCI =1+1');
  });
});

describe('Dossier ZIP — câblage exécuté', () => {
  const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  it('récapitulatif : une catégorie piégée est échappée, le bloc est affiché avec la mention', () => {
    let html = '';
    const env = {
      document: { body: { insertAdjacentHTML: (_p, h) => { html = h; } }, getElementById: () => null },
      el: () => null, escHtml: esc, _uiIcon: () => '',
    };
    const f = new Function(...Object.keys(env), corps('_dcCloseOv') + corps('_dcEuro') + corps('_dcDateFr') + corps('_dcRecapOverlay') + '\nreturn _dcRecapOverlay;');
    const nonExp = { count: 1, entrees: 0, sorties: 5, parCategorie: [{ cat: '<img src=x onerror=alert(1)>', famille: 'sans famille', count: 1, entrees: 0, sorties: 5 }] };
    f(...Object.values(env))({ counts: { mouvements: 1, factures: 0, manquantes: 0 }, rows: [] }, { from: '2025-01-01', to: '2025-12-31', entityNom: 'SCI A', _nonExp: nonExp });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("1 mouvement(s) non exporté(s) : compte à définir avec l'expert-comptable");
    expect(html).toContain('ecritures/mouvements-non-exportes.csv');
    expect(html).toContain('min-height:44px');
  });
  const lancerZip = async (nonExp) => {
    let entries = null;
    const env = {
      window: {
        _dc: { applyFetchFailure: () => {}, indexCsv: () => 'idx', zipName: () => 'z.zip' },
        _bk: { storedZip: (e) => { entries = e; return new Uint8Array(0); } },
        _buildEcritures: () => [], _buildGrandLivre: () => [], _toFEC: () => 'fec', _journalToCsv: () => 'j', _grandLivreToCsv: () => 'g',
        _nonExportesCsv: (ne) => 'liste ' + ne.count,
      },
      DB: { mouvements: [] }, STD_CATEGORIES: STD, TextEncoder, Blob, _BK_ZIP64_LIMIT: 1e12,
      _dcRenderProgress: () => {}, _dcFetchDataUrl: async () => null, _dcDataUrlToBytes: () => null, _dcCloseOv: () => {},
      _downloadBlobAs: () => {}, showToast: () => {}, _auditLog: () => {}, console,
    };
    const f = new Function(...Object.keys(env), 'let _dcRunning = false;\n' + corps('_dcRun') + '\nreturn _dcRun;');
    await f(...Object.values(env))({ rows: [], counts: { manquantes: 0 }, pieceRefByNum: {} }, { from: '2025-01-01', to: '2025-12-31', extractionYmd: '2026-10-06', _nonExp: nonExp });
    return entries.map((e) => e.name);
  };
  it('le fichier de la liste entre dans le ZIP quand il y a des non-exportés, pas sinon', async () => {
    expect(await lancerZip({ count: 2 })).toEqual(['ecritures/FEC.txt', 'ecritures/journal.csv', 'ecritures/grand-livre.csv', 'ecritures/index.csv', 'ecritures/mouvements-non-exportes.csv']);
    expect(await lancerZip({ count: 0 })).toEqual(['ecritures/FEC.txt', 'ecritures/journal.csv', 'ecritures/grand-livre.csv', 'ecritures/index.csv']);
  });
  it('classement des catégories perso FIGÉ à l’ouverture (une hydratation avant le clic ne décale pas les num)', () => {
    let o = null;
    const alias = { 'Péage A35': 'Divers (non déductible)' };
    const env = {
      window: { _dc: { buildPlan: () => ({}) }, _buildMvtRows: () => [{ num: 1 }], _bk: { storedZip: () => {} }, _listNonExportes: () => null },
      DB: { mouvements: [{ cat: 'Péage A35' }, { cat: 'Loyers encaissés' }], documents: [], logements: [] }, STD_CATEGORIES: STD,
      showToast: () => {}, _dcRecapOverlay: (_p, opts) => { o = opts; },
      _dcBuildOpts: () => ({ from: '2025-01-01', to: '2025-12-31', catMere: (c) => STD.find((s) => s.nom === (alias[c] || c)) || null }),
    };
    const f = new Function(...Object.keys(env), corps('_comptaNonExportes') + corps('_comptaBailleurInconnu') + corps('openDossierComptable') + '\nreturn openDossierComptable;');
    f(...Object.values(env))();
    alias['Péage A35'] = 'Travaux (entretien, réparation, amélioration)';   // hydratation cloud : l'alias change
    expect(o.catMere('Péage A35').nom).toBe('Divers (non déductible)');
    expect(o.catMere('Inconnue')).toBeNull();
  });
});
