/**
 * Chantier « un seul endroit pour l'argent » — lot 1, surfaces R5 et R7 (feu vert pilotage 06/10/2026).
 *
 * R5 — fiche du bien, KPI « Loyer actuel » : lisait `bail.hc + bail.ch`, sans le barème. Une révision
 *      IRL appliquée au barème restait invisible ; une révision programmée (déjà recopiée dans le bail)
 *      s'affichait avant sa date d'effet. Il lit désormais le moteur : `_finTauxPleinMois`, le même taux
 *      plein du mois que le potentiel locatif de Finances.
 * R7 — barre latérale, ordre des entités : sommait `m.cr` de TOUTES catégories (dépôts, apports,
 *      virements internes compris). Il lit désormais les recettes de l'Accueil / Finances (`_dashCfReel`).
 *
 * Vraies fonctions de js/app/app-part*.js et du module js/core/loyer-du-mois.js ; aujourd'hui figé.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tauxPleinMoisFromRaw } from '../../js/core/loyer-du-mois.js';
import { extraireFonction } from './_extraction-source.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = ['app-part1.js', 'app-part2.js'].map((f) => readFileSync(resolve(root, 'js/app', f), 'utf8'));
const corps = (nom) => { for (const s of SRC) { try { return extraireFonction(s, nom); } catch (e) { /* autre part */ } } throw new Error('introuvable : ' + nom); };

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

describe('R5 — fiche du bien : « Loyer actuel » = le loyer en vigueur au barème (moteur)', () => {
  // Bail signé à 700 + 50. IRL appliquée au 01/07/2026 (barème : 720). Révision suivante PROGRAMMÉE au
  // 01/12/2026 (740), déjà recopiée dans le bail. Aujourd'hui : 06/10/2026 → le loyer en vigueur est 770.
  const BAIL = { ref: 'A1', debut: '2024-01-01', hc: 740, ch: 50, locataires: [{ nom: 'Lea' }] };
  const BAREME = [
    { ref: 'A1', debut: '2024-01-01', fin: '2026-06-30', hc: 700, ch: 50 },
    { ref: 'A1', debut: '2026-07-01', fin: '2026-11-30', hc: 720, ch: 50 },
    { ref: 'A1', debut: '2026-12-01', hc: 740, ch: 50 },
  ];
  const rendu = ({ bareme = BAREME, auj = '2026-10-06', module = true } = {}) => {
    const DB = { logements: [{ ref: 'A1', hc: 700, ch: 50 }], baux: { A1: BAIL }, baux_historique: [], loyerBareme: bareme, mouvements: [] };
    const fn = monter(['_renderLogFicheHeroStats', '_finTauxPleinMois'], {
      DB, window: module ? { tauxPleinMoisFromRaw } : {},
      td: () => auj, fmt: (n) => String(Math.round((n || 0) * 100) / 100) + ' €', escHtml: (x) => String(x == null ? '' : x),
      _isAlive: (x) => !!x && !x._deleted, _bienIsBailActif: () => true, _bienActiveBail: () => BAIL,
      _findBailByRefTolerant: (ref) => DB.baux[ref] || null, _lotCcQuotePartMois: () => [], _getAllBailsForLog: () => [BAIL],
      Math, Number, String, Object, Array, Date, parseInt,
    });
    const h = fn._renderLogFicheHeroStats({ ref: 'A1', hc: 700, ch: 50 }, 'A1');
    const m = h.match(/logf-stat-v k-money">([^<]*)<small>\/mois<\/small><\/div>\s*<div class="logf-stat-l">Loyer actuel/);
    return m ? m[1] : 'KPI introuvable';
  };

  it('révision IRL appliquée au barème : 770 €, pas les 790 € du bail (révision de décembre pas encore en vigueur)', () => {
    expect(rendu()).toBe('770 €');
  });

  it('avant la révision de juillet : 750 €', () => {
    expect(rendu({ auj: '2026-05-15' })).toBe('750 €');
  });

  it('à la date d’effet programmée : 790 €', () => {
    expect(rendu({ auj: '2026-12-01' })).toBe('790 €');
  });

  it('lot sans barème : le moteur retombe lui-même sur le bail', () => {
    expect(rendu({ bareme: [] })).toBe('790 €');
  });

  it('module non chargé (file://) : repli sur le bail, sans erreur', () => {
    expect(rendu({ module: false })).toBe('790 €');
  });
});

describe('R7 — barre latérale : les entités triées par leurs RECETTES (Accueil / Finances)', () => {
  // SCI BETA encaisse plus de loyers ; SCI ALPHA a surtout reçu un dépôt de garantie et un apport
  // d'associé — de l'argent qui n'est pas une recette. L'ancien tri (Σ cr) plaçait ALPHA en tête.
  const ANNUEL = {
    'SCI ALPHA': { loyersHC: 3000, provisions: 300, recettesDiverses: 0, charges: 0, recup: 0, cashflowReel: 3300 },
    'SCI BETA': { loyersHC: 9000, provisions: 900, recettesDiverses: 200, charges: 0, recup: 0, cashflowReel: 10100 },
    'SCI GAMMA': { loyersHC: 0, provisions: 0, recettesDiverses: 0, charges: 0, recup: 0, cashflowReel: 0 },
  };
  const DB = {
    entites: [{ nom: 'SCI GAMMA' }, { nom: 'SCI ALPHA' }, { nom: 'SCI BETA' }, { nom: 'SCI EFFACEE', _deleted: true }],
    logements: [{ ref: 'A1', entity: 'SCI ALPHA' }, { ref: 'B1', entity: 'SCI BETA' }],
    mouvements: [
      { date: '2026-02-01', qui: 'A1', cr: 3300, cat: 'Loyers encaissés' },
      { date: '2026-02-02', qui: 'A1', cr: 900, cat: 'Dépôt de garantie (reçu / restitué)' },
      { date: '2026-02-03', qui: 'SCI:SCI ALPHA', cr: 40000, cat: 'CCA / distribution SCI' },
      { date: '2026-02-04', qui: 'B1', cr: 10100, cat: 'Loyers encaissés' },
    ],
  };
  const appels = [];
  const base = {
    DB, _isAlive: (x) => !!x && !x._deleted,
    _finEntScope: (ent) => ({ kind: 'ent', ent }),
    _finWindows: () => null,
    _finMonthly: (y, scope) => { appels.push(scope && scope.ent); return { annual: ANNUEL[scope && scope.ent] || {} }; },
    Math, Number, String, Object, Array, Date, parseInt,
  };

  it('ordre = recettes de l’Accueil (loyers HC + provisions + recettes diverses), pas la somme des crédits', () => {
    const fn = monter(['_v4TopEntities', '_dashCfReel'], base);
    const ents = fn._v4TopEntities();
    expect(ents.map((e) => e.nom)).toEqual(['SCI BETA', 'SCI ALPHA', 'SCI GAMMA']);
    expect(ents.map((e) => e.recettes)).toEqual([10100, 3300, 0]);
    expect(appels).toContain('SCI ALPHA');            // chaque entité est lue au moteur, sur SON périmètre
  });

  it('entité supprimée : absente', () => {
    const fn = monter(['_v4TopEntities', '_dashCfReel'], base);
    expect(fn._v4TopEntities().map((e) => e.nom)).not.toContain('SCI EFFACEE');
  });

  it('moteur absent (file://) : aucune erreur, ordre de DB.entites conservé', () => {
    const fn = monter(['_v4TopEntities'], { DB, _isAlive: base._isAlive, _dashCfReel: undefined, Math, Number, String, Object, Array, Date, parseInt });
    expect(fn._v4TopEntities().map((e) => e.nom)).toEqual(['SCI GAMMA', 'SCI ALPHA', 'SCI BETA']);
  });

  it('plus aucune somme de `m.cr` dans le tri (R-0 : aucun calcul local)', () => {
    expect(corps('_v4TopEntities')).not.toMatch(/\.cr\b/);
    expect(corps('_v4TopEntities')).toMatch(/_dashCfReel\(/);
  });
});
