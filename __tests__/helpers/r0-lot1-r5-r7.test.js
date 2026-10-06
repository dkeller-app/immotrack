/**
 * Chantier « un seul endroit pour l'argent » — lot 1, surfaces R5 et R7 (feu vert pilotage 06/10/2026).
 *
 * R5 — fiche du bien, KPI « Loyer actuel » : lisait `bail.hc + bail.ch`, sans le barème (une révision
 *      IRL appliquée restait invisible). Il lit désormais LA MÊME fonction que le bandeau « Loyer en
 *      vigueur » de l'onglet Bail de la fiche (`_histoBailEnVigueur` → `enVigueur` du barème, au jour,
 *      date locale). Audit 06/10 : le taux plein du MOIS affichait une révision du 20 dès le 1er.
 * R7 — barre latérale, ordre des entités : sommait `m.cr` de TOUTES catégories (dépôts, apports,
 *      virements internes compris). Il lit désormais les recettes du moteur Finances par entité.
 *
 * Vraies fonctions de js/app/app-part*.js, vrais modules du cœur (barème, moteur Finances).
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enVigueur } from '../../js/core/bail-historique.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { extraireFonction } from './_extraction-source.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = ['app-part1.js', 'app-part2.js'].map((f) => readFileSync(resolve(root, 'js/app', f), 'utf8'));
const corps = (nom) => { for (const s of SRC) { try { return extraireFonction(s, nom); } catch (e) { /* autre part */ } } throw new Error('introuvable : ' + nom); };
const STD = (() => {
  const s = SRC[0].replace(/\r/g, ''), i = s.indexOf('const STD_CATEGORIES = ['), j = s.indexOf('\n];', i);
  return new Function(s.slice(i, j + 3) + '\nreturn STD_CATEGORIES;')();
})();

/** Monte les vraies fonctions `noms` ; tout identifiant non fourni = fonction qui rend ''. */
function monter(noms, base) {
  const decl = new Set(noms);
  const scope = new Proxy(base, {
    has: (t, k) => typeof k === 'string' && !decl.has(k),
    get: (t, k) => (k in t ? t[k] : (k in globalThis ? globalThis[k] : () => '')),
  });
  // eslint-disable-next-line no-new-func
  return new Function('scope', 'with (scope) {\n' + noms.map(corps).join('\n') + '\nreturn {' + noms.join(',') + '};\n}')(scope);
}

describe('R5 — fiche du bien : « Loyer actuel » = le loyer en vigueur AUJOURD’HUI (= onglet Bail)', () => {
  // Bail signé 700 + 50. IRL appliquée au 01/07/2026 (barème 720). Révision IRL PROGRAMMÉE au 20/10/2026
  // (anniversaire du bail, date libre) à 740 : le barème la porte, le bail n'est pas recopié (applyNow faux).
  const BAIL = { ref: 'A1', debut: '2024-10-20', hc: 700, ch: 50, locataires: [{ nom: 'Lea' }] };
  const BAREME = [
    { ref: 'A1', debut: '2024-10-20', fin: '2026-06-30', hc: 700, ch: 50 },
    { ref: 'A1', debut: '2026-07-01', fin: '2026-10-19', hc: 720, ch: 50 },
    { ref: 'A1', debut: '2026-10-20', hc: 740, ch: 50 },
  ];
  afterEach(() => vi.useRealTimers());
  const rendu = ({ bareme = BAREME, auj = '2026-10-06', module = true } = {}) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(auj + 'T10:00:00'));
    const DB = { logements: [{ ref: 'A1', hc: 700, ch: 50 }], baux: { A1: BAIL }, baux_historique: [], loyerBareme: bareme, mouvements: [] };
    const fn = monter(['_renderLogFicheHeroStats', '_histoBailEnVigueur', '_histoBailTodayIso'], {
      DB, window: module ? { _bailHistoEnVigueur: enVigueur } : {},
      td: () => auj, fmt: (n) => String(Math.round((n || 0) * 100) / 100) + ' €', escHtml: (x) => String(x == null ? '' : x),
      _isAlive: (x) => !!x && !x._deleted, _bienIsBailActif: () => true, _bienActiveBail: () => BAIL,
      _lotCcQuotePartMois: () => [], _getAllBailsForLog: () => [BAIL],
      Math, Number, String, Object, Array, Date, parseInt,
    });
    const h = fn._renderLogFicheHeroStats({ ref: 'A1', hc: 700, ch: 50 }, 'A1');
    const m = h.match(/logf-stat-v k-money">([^<]*)<small>\/mois<\/small><\/div>\s*<div class="logf-stat-l">Loyer actuel/);
    return { kpi: m ? m[1] : 'KPI introuvable', bandeauBail: fn._histoBailEnVigueur('A1') };
  };

  it('IRL de juillet appliquée au barème : 770 € (pas les 750 € du bail)', () => {
    expect(rendu().kpi).toBe('770 €');
  });

  it('révision programmée au 20/10, consultée le 06/10 : toujours 770 € — rien avant la date d’effet', () => {
    expect(rendu({ auj: '2026-10-06' }).kpi).toBe('770 €');
    expect(rendu({ auj: '2026-10-19' }).kpi).toBe('770 €');
  });

  it('le 20/10, jour d’effet : 790 €', () => {
    expect(rendu({ auj: '2026-10-20' }).kpi).toBe('790 €');
  });

  it('avant l’IRL de juillet : 750 €', () => {
    expect(rendu({ auj: '2026-05-15' }).kpi).toBe('750 €');
  });

  it('même chiffre que le bandeau « Loyer en vigueur » de l’onglet Bail, à toute date', () => {
    for (const auj of ['2026-05-15', '2026-07-01', '2026-10-06', '2026-10-20', '2027-03-01']) {
      const r = rendu({ auj });
      expect(r.kpi, auj).toBe(String(r.bandeauBail.total) + ' €');
    }
  });

  it('lot sans période de barème couvrant aujourd’hui : repli sur le bail (750 €)', () => {
    expect(rendu({ bareme: [] }).kpi).toBe('750 €');
  });

  it('modules non chargés (file://) : repli sur le bail, sans erreur', () => {
    expect(rendu({ module: false }).kpi).toBe('750 €');
  });
});

describe('R7 — barre latérale : les entités triées par leurs RECETTES, lues au VRAI moteur Finances', () => {
  // SCI ALPHA a encaissé 3 300 € de loyers, mais aussi un dépôt de garantie (900 €) et un apport
  // d'associé (40 000 €) — de l'argent qui n'est pas une recette. SCI BETA a encaissé 10 100 € de
  // loyers. L'ancien tri (Σ cr) plaçait ALPHA en tête.
  const DB = {
    entites: [{ nom: 'SCI GAMMA' }, { nom: 'SCI ALPHA' }, { nom: 'SCI BETA' }, { nom: '' }, { nom: 'SCI EFFACEE', _deleted: true }],
    logements: [{ ref: 'A1', entity: 'SCI ALPHA' }, { ref: 'B1', entity: 'SCI BETA' }],
    mouvements: [
      { date: '2026-02-01', qui: 'A1', cr: 3300, db: 0, cat: 'Loyers encaissés' },
      { date: '2026-02-02', qui: 'A1', cr: 900, db: 0, cat: 'Dépôt de garantie (reçu / restitué)' },
      { date: '2026-02-03', qui: 'SCI:SCI ALPHA', cr: 40000, db: 0, cat: 'CCA / distribution SCI' },
      { date: '2026-02-04', qui: 'B1', cr: 9900, db: 0, cat: 'Loyers encaissés' },
      { date: '2026-03-04', qui: 'B1', cr: 200, db: 0, cat: 'Recettes diverses' },
    ],
  };
  const lotsDe = (ent) => DB.logements.filter((l) => l.entity === ent).map((l) => l.ref);
  const stdParNom = (nom) => STD.find((c) => c.nom === nom) || null;
  let fenetres;
  const base = () => ({
    DB, window: { _computeFinancesMonthly, _dbGen: 1 }, STD_CATEGORIES: STD, _stdCategoryByName: stdParNom,
    _isAlive: (x) => !!x && !x._deleted, _finMonthlyCache: { gen: -1, m: new Map() },
    _finEntScope: (ent) => (ent ? { kind: 'ent', ent } : { kind: 'all' }),        // comme le vrai : nom vide = « Tout »
    _finScopeWeight: (scope, m) => (m && !m._deleted && (scope.kind === 'all' || lotsDe(scope.ent).includes(m.qui) || m.qui === 'SCI:' + scope.ent)) ? 1 : 0,
    _finCatLigne: (cat) => { const c = stdParNom(cat); return c && c.ligne2044 ? { ligne2044: c.ligne2044, type: c.type } : null; },
    _finBailHcChAt: () => ({ hc: 0, ch: 0 }), _finLotSuivi: () => null, _finActiveLotsInScope: () => [], _finIsRecupACharge: () => false,
    _finWindows: () => { fenetres++; return null; },
    Math, Number, String, Object, Array, Date, parseInt, JSON, Map, Set,
  });
  const NOMS = ['_v4TopEntities', '_finRecettesDe', '_finMonthly', '_finCatMere', '_finChargeHf', '_finStdByLigne'];
  beforeEach(() => { fenetres = 0; });

  it('ordre = recettes du moteur (loyers + recettes diverses) ; dépôt et apport ignorés', () => {
    const ents = monter(NOMS, base())._v4TopEntities();
    expect(ents.map((e) => e.nom)).toEqual(['SCI BETA', 'SCI ALPHA', 'SCI GAMMA', '']);
    const r = Object.fromEntries(ents.map((e) => [e.nom, e.recettes]));
    expect(r['SCI ALPHA']).toBe(3300);              // ni les 900 € de dépôt, ni les 40 000 € d'apport
    expect(r['SCI BETA']).toBe(10100);              // loyers 9 900 + recettes diverses 200
  });

  it('une entité sans nom ne prend pas les recettes de tout le patrimoine (« Tout »)', () => {
    const ents = monter(NOMS, base())._v4TopEntities();
    expect(ents.find((e) => e.nom === '').recettes).toBe(0);
  });

  it('entité supprimée : absente', () => {
    expect(monter(NOMS, base())._v4TopEntities().map((e) => e.nom)).not.toContain('SCI EFFACEE');
  });

  it('pas de fenêtre de constat calculée pour un simple tri (coût, audit 06/10)', () => {
    monter(NOMS, base())._v4TopEntities();
    expect(fenetres).toBe(0);
  });

  it('une entité en erreur compte 0 : la barre de navigation ne tombe pas', () => {
    const b = base();
    b._finEntScope = (ent) => { if (ent === 'SCI ALPHA') throw new Error('panne'); return { kind: 'ent', ent }; };
    const ents = monter(NOMS, b)._v4TopEntities();
    expect(ents.map((e) => e.nom)).toEqual(['SCI BETA', 'SCI GAMMA', 'SCI ALPHA', '']);
  });

  it('moteur absent (file://) : aucune erreur, ordre de DB.entites conservé', () => {
    const fn = monter(['_v4TopEntities', '_finRecettesDe'], { DB, _isAlive: (x) => !!x && !x._deleted, _finMonthly: undefined, _finEntScope: undefined, Math, Number, String, Object, Array, Date });
    expect(fn._v4TopEntities().map((e) => e.nom)).toEqual(['SCI GAMMA', 'SCI ALPHA', 'SCI BETA', '']);
  });

  it('une seule définition des recettes : l’Accueil (`_dashCfReel`) et le tri lisent `_finRecettesDe`', () => {
    expect(corps('_dashCfReel')).toContain('_finRecettesDe(A)');
    expect(corps('_v4TopEntities')).toContain('_finRecettesDe(');
    expect(corps('_v4TopEntities')).not.toMatch(/\.cr\b/);
  });
});
