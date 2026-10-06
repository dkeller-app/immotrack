/**
 * STATUT LOUÉ / VACANT d'un lot (décision Didier 06/10) — UNE fonction de statut, branchée sur la règle unique
 * de fin d'occupation (js/core/fin-occupation.js) :
 *   loué ⇔ bail courant vivant, non clôturé, et occupation non terminée aujourd'hui.
 * Un DÉPART DÉCLARÉ PASSÉ rend le lot VACANT — « Vacant (départ le JJ/MM/AAAA, bail à clôturer) » — alors que
 * son bail reste ouvert : le DÉPÔT détenu (pas encore restitué) et les IMPAYÉS du locataire parti restent
 * visibles. Deux questions, deux fonctions : `_bienIsBailActif` (occupé ?) et `_bienActiveBail` (bail ouvert ?).
 *
 * Vraies fonctions de l'index assemblé (js/app/app-part*.js) et des modules du cœur ; environnement simulé
 * par un scope dont les fonctions non fournies rendent '' (rendu HTML capturé). Aujourd'hui figé au 05/10/2026.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bailLoueAu, finOccupationBail } from '../../js/core/fin-occupation.js';
import { _computeOccupationLots } from '../../js/core/legal-bilan.js';
import { duMoisFromRaw } from '../../js/core/loyer-du-mois.js';
import { bailHistCle } from '../../js/core/store-mapping.js';
import { extraireFonction } from './_extraction-source.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = ['app-part1.js', 'app-part2.js'].map((f) => readFileSync(resolve(root, 'js/app', f), 'utf8'));
const corps = (nom) => { for (const s of SRC) { try { return extraireFonction(s, nom); } catch (e) { /* autre part */ } } throw new Error('introuvable : ' + nom); };

const AUJ = '2026-10-05';
const BAIL = { type: 'nu', debut: '2023-07-01', fin: '2026-06-30', hc: 500, ch: 100, dg: 900, locataires: [{ nom: 'Lea' }] };
const DEPART = { ...BAIL, depart: { declaredAt: '2026-08-01', congePar: 'locataire', dateSortie: '2026-09-30' } };
const dbDe = (baux) => ({
  logements: [{ ref: 'A1', imm: 'Tilleuls', locataire: 'Lea', hc: 500, ch: 100 }, { ref: 'B2', imm: 'Tilleuls', hc: 400, ch: 50 }, { ref: 'C3', imm: 'Tilleuls', hc: 300 }],
  baux, baux_historique: [], mouvements: [], entites: [], loyerBareme: [],
});

/** Monte les vraies fonctions `noms` ; tout identifiant non fourni = fonction qui rend ''. */
function monter(DB, noms, extra = {}) {
  const decl = new Set(noms);
  const html = { out: '' };
  const els = {};
  const base = {
    DB, window: { bailLoueAu, finOccupationBail, bailHistCle, ...(extra.window || {}) },
    _todayIsoLocal: () => AUJ, td: () => AUJ, fd: (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''),
    escHtml: (x) => String(x == null ? '' : x), _isAlive: (x) => !!x && !x._deleted, fmt: (n) => String(Math.round(n || 0)) + ' €',
    el: (id) => (els[id] = els[id] || { id, value: '', innerHTML: '', textContent: '', style: {}, classList: { contains: () => false } }),
    showToast: (m) => { (base._toasts = base._toasts || []).push(m); }, confirm2: () => false,
    _isPhone: () => false, _PIL_MTX_COLS: [], _lyQ: (x) => String(x == null ? '' : x), Math, JSON, Number, String, Object, Array, Set, Map, Date, parseInt, parseFloat, isNaN,
    ...extra,
  };
  base.window = { bailLoueAu, finOccupationBail, bailHistCle, ...(extra.window || {}) };   // `extra.window` complète, n'écrase pas
  const scope = new Proxy(base, {
    has: (t, k) => typeof k === 'string' && !decl.has(k),
    get: (t, k) => (k in t ? t[k] : (k in globalThis ? globalThis[k] : () => '')),
  });
  // eslint-disable-next-line no-new-func
  const fn = new Function('scope', 'with (scope) {\n' + noms.map(corps).join('\n') + '\nreturn {' + noms.join(',') + '};\n}')(scope);
  return { fn, base, els, html };
}
const STATUT = ['_bienActiveBail', '_bienIsBailActif', '_lotStatutLibelle', '_lotEstLoue', '_lotBailOuvert', '_logementsVacants', '_dgDuLot', '_dgDetenuDuLot', '_dgDetenuDuBail', '_dgRestitutionEnregistree', '_dgDetenusDuLot', '_dgNbDetenusDuLot', '_bailHistCleDe', '_archivesDetenuesDuLot'];

describe('1 · la règle de statut (module pur)', () => {
  it('bail nu reconduit (échéance passée), sans départ : loué', () => expect(bailLoueAu(BAIL, AUJ)).toBe(true));
  it('départ déclaré au 30/09, aujourd\'hui 05/10 : vacant', () => expect(bailLoueAu(DEPART, AUJ)).toBe(false));
  it('le jour même du départ : encore loué ; la veille aussi', () => {
    expect(bailLoueAu(DEPART, '2026-09-30')).toBe(true);
    expect(bailLoueAu(DEPART, '2026-09-29')).toBe(true);
  });
  it('clôturé, fin effective, tombstone, absent : vacant', () => {
    expect(bailLoueAu({ ...BAIL, cloture: true }, AUJ)).toBe(false);
    expect(bailLoueAu({ ...BAIL, finEffective: '2027-01-01' }, AUJ)).toBe(false);
    expect(bailLoueAu({ ...BAIL, _deleted: true }, AUJ)).toBe(false);
    expect(bailLoueAu(null, AUJ)).toBe(false);
  });
  it('bail étudiant échu non clôturé : loué (occupé jusqu\'à la clôture)', () => expect(bailLoueAu({ ...BAIL, type: 'etudiant' }, AUJ)).toBe(true));
});

describe('2 · fonctions de l\'app : statut ≠ bail ouvert', () => {
  const { fn } = monter(dbDe({ A1: DEPART, B2: BAIL }), STATUT);
  const L = (ref) => ({ ref });
  it('lot au départ déclaré passé : VACANT, bail encore OUVERT', () => {
    expect(fn._bienIsBailActif('A1')).toBe(false);
    expect(fn._lotEstLoue(L('A1'))).toBe(false);
    expect(fn._bienActiveBail('A1')).toBeTruthy();
    expect(fn._lotBailOuvert(L('A1'))).toBe(true);
  });
  it('libellé « Vacant (départ le 30/09/2026, bail à clôturer) » ; « Loué » ; « Vacant »', () => {
    expect(fn._lotStatutLibelle('A1')).toBe('Vacant (départ le 30/09/2026, bail à clôturer)');
    expect(fn._lotStatutLibelle('B2')).toBe('Loué');
    expect(fn._lotStatutLibelle('C3')).toBe('Vacant');
  });
  it('candidatures : le lot parti est proposable (liste des vacants)', () => {
    expect(fn._logementsVacants().map((l) => l.ref)).toEqual(['A1', 'C3']);
  });
  it('sans module (file://) : statut d\'avant (bail ouvert = loué)', () => {
    const m = monter(dbDe({ A1: DEPART }), STATUT, { window: { bailLoueAu: undefined } });
    expect(m.fn._bienIsBailActif('A1')).toBe(true);
  });
});

describe('3 · DÉPÔTS DÉTENUS : reçu et pas encore restitué, jamais « lot loué »', () => {
  it('départ déclaré le 30/09, dépôt de 900 € non rendu : toujours détenu le 05/10', () => {
    const { fn } = monter(dbDe({ A1: DEPART }), STATUT);
    expect(fn._dgDetenuDuLot({ ref: 'A1', dg: 0 })).toBe(900);
  });
  it('restitution enregistrée (dgRestitueAt) : plus détenu', () => {
    const { fn } = monter(dbDe({ A1: { ...DEPART, dgRestitueAt: '2026-10-04' } }), STATUT);
    expect(fn._dgDetenuDuLot({ ref: 'A1' })).toBe(0);
  });
  it('bail clôturé (tombstone) : plus détenu ; lot sans bail : 0 (jamais le dépôt de référence du lot)', () => {
    const { fn } = monter(dbDe({ A1: { ref: 'A1', _deleted: true } }), STATUT);
    expect(fn._dgDetenuDuLot({ ref: 'A1', dg: 900 })).toBe(0);
    expect(fn._dgDetenuDuLot({ ref: 'C3', dg: 300 })).toBe(0);
  });
  it('bail occupé : détenu (repli sur le dépôt du lot si le bail n\'en porte pas)', () => {
    const { fn } = monter(dbDe({ B2: { ...BAIL, dg: 0 } }), STATUT);
    expect(fn._dgDetenuDuLot({ ref: 'B2', dg: 450 })).toBe(450);
  });
  it('tuile PC « Dépôts détenus » (VRAI _renderPilotage) : garde les 900 € jusqu\'à la restitution, puis les retire', () => {
    const tuile = (baux) => {
      const DB = dbDe(baux);
      const { fn, els } = monter(DB, [...STATUT, '_renderPilotage']);
      try { fn._renderPilotage({ scopeLogs: DB.logements, yr: '2026', mo: null, activeEnt: '' }); } catch (e) { /* la suite du rendu (bulles) n'est pas simulée */ }
      const h = els['pil-strip'].innerHTML;
      return h.slice(h.indexOf('Dépôts détenus'), h.indexOf('Dépôts détenus') + 120);
    };
    expect(tuile({ A1: DEPART })).toContain('900 €');
    expect(tuile({ A1: DEPART })).toContain('1 dépôt ·');
    expect(tuile({ A1: { ...DEPART, dgRestitueAt: '2026-10-20' } })).toContain('0 €');
  });
});

describe('4 · bilan (legal-bilan) : la liste des vacants suit le statut (fin de l\'incohérence avec le KPI)', () => {
  const occ = (today) => _computeOccupationLots({ baux: { A1: { ref: 'A1', ...DEPART } }, baux_historique: [], loyerBareme: [] },
    [{ ref: 'A1' }], { from: '2026-10-01', to: '2026-10-31', today });
  it('le 05/10 : vacant depuis le 30/09 (départ déclaré) — et 0 jour occupé en octobre', () => {
    const o = occ(AUJ);
    expect(o.vacantsJour).toEqual([{ ref: 'A1', depuis: '2026-09-30', departDeclare: true }]);
    expect(o.occDays).toBe(0);
  });
  it('le 15/09 (avant le départ) : pas vacant', () => expect(occ('2026-09-15').vacantsJour).toEqual([]));
});

describe('5 · lecteurs câblés (vraies fonctions de rendu)', () => {
  it('Accueil — statut de loyer d\'un lot (_v4ComputeLotStatus) : le lot parti reste SUIVI (impayé visible)', () => {
    const strip = { monthlyFull: 600, solde: -600, attendu: 5400, recu: 4800, months: [] };
    const { fn } = monter(dbDe({ A1: DEPART }), [...STATUT, '_v4ComputeLotStatus'], {
      _suiviLoyerStrip: () => strip, window: { _loyerChipVerdict: () => ({ cls: 'retard', montant: 600 }) },
    });
    expect(fn._v4ComputeLotStatus({ ref: 'A1', hc: 500, ch: 100 }, '2026').vacant).not.toBe(true);
  });
  it('matrice Pilotage (_pilLotLigne) : pastille de paiement en dette ET action « Relouer »', () => {
    const { fn } = monter(dbDe({ A1: DEPART }), [...STATUT, '_pilLotLigne'], {
      _pilEstRepris: () => false, window: { pilotagePay: (loue, ref, imp) => (!loue ? 'na' : (imp.has(ref) ? 'neg' : 'pos')) },
    });
    const lig = fn._pilLotLigne({ ref: 'A1', imm: 'Tilleuls', hc: 500, ch: 100 }, { solde: -600 }, AUJ, new Set(['A1']), null, {});
    expect(lig.pay).toBe('neg');
    expect(lig.vacant).toBe(true);
    expect(lig.actions.map((a) => a.label)).toContain('Relouer');
  });
  it('archivage d\'un logement : refusé tant que le bail est OUVERT (même vacant)', () => {
    const { fn, base } = monter(dbDe({ A1: DEPART }), [...STATUT, 'archiveLogement']);
    fn.archiveLogement('A1');
    expect(base._toasts).toEqual(['Terminez d\'abord le bail en cours avant d\'archiver']);
  });
  it('fiche du bien (VRAI rLogFiche) — PC et téléphone : badge « Vacant (départ…) », portes annonce + candidat ouvertes ; loué : fermées', () => {
    for (const phone of [false, true]) {
      const DB = dbDe({ A1: DEPART, B2: BAIL });
      const rendu = (ref) => { const { fn, els } = monter(DB, [...STATUT, 'rLogFiche', '_renderLogFichePhHero'], { _currentLogFicheRef: ref, _isPhone: () => phone, _renderLogFichePhStrip: () => [] }); fn.rLogFiche(); return els['log-fiche-content'].innerHTML; };
      const a1 = rendu('A1'), b2 = rendu('B2');
      expect(a1).toContain('Vacant (départ le 30/09/2026, bail à clôturer)');
      expect(a1).toContain('Créer une annonce');
      expect(a1).toContain('Inviter un candidat');
      expect(b2).not.toContain('Créer une annonce');
      expect(b2).not.toContain('Inviter un candidat');
    }
  });
  it('liste des biens — carte : libellé « Vacant (départ le …, bail à clôturer) »', () => {
    const { fn } = monter(dbDe({ A1: DEPART }), [...STATUT, '_renderLogementCardFlat']);
    expect(fn._renderLogementCardFlat({ ref: 'A1', imm: 'Tilleuls', locataire: 'Lea' })).toContain('Vacant (départ le 30/09/2026, bail à clôturer)');
  });
  it('liste des biens — filtre « vacants » / « loués » (VRAI _filterAndSortLogs)', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const filtre = (occup) => monter(DB, [...STATUT, '_filterAndSortLogs'], { _biensFilters: { search: '', entity: '', occup, type: '', sort: 'recent' } })
      .fn._filterAndSortLogs(DB.logements).map((l) => l.ref);
    expect(filtre('vacant').sort()).toEqual(['A1', 'C3']);
    expect(filtre('loue')).toEqual(['B2']);
  });
  it('Accueil téléphone et bandeau : compte des lots loués (VRAI _renderPilotage) — le lot parti compte vide', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const { fn, els } = monter(DB, [...STATUT, '_renderPilotage']);
    try { fn._renderPilotage({ scopeLogs: DB.logements, yr: '2026', mo: null, activeEnt: '' }); } catch (e) { /* bulles non simulées */ }
    expect(els['pil-strip'].innerHTML).toContain('3 <small>· 2 vides</small>');
  });
});
describe('6 · lecteurs sous mutation (dépôts, onglet Loyers, règle)', () => {
  it('règle : un bail CLÔTURÉ dont l\'échéance est à venir n\'est pas loué', () => {
    expect(bailLoueAu({ ...BAIL, fin: '2027-06-30', cloture: true }, AUJ)).toBe(false);
  });
  const docDe = (els) => ({ getElementById: (id) => (els[id] = els[id] || { id, innerHTML: '', style: {} }), createElement: () => ({ style: {} }) });
  it('Accueil TÉLÉPHONE « Dépôts détenus » (VRAI _renderAccueilPhone) : 900 € jusqu\'à la restitution, puis 0', () => {
    const rendu = (baux) => {
      const DB = dbDe(baux);
      const m = monter(DB, [...STATUT, '_renderAccueilPhone'], { _isPhone: () => true });
      m.base.document = docDe(m.els);
      try { m.fn._renderAccueilPhone({ scopeLogs: DB.logements, yr: '2026', mo: null, activeEnt: '', mvs: [], mvsYTD: [] }); } catch (e) { /* suite non simulée */ }
      const h = (m.els['accm-phone'] || {}).innerHTML || '';
      const i = h.indexOf('Dépôts détenus');
      return i < 0 ? '(absent)' : h.slice(i, i + 400);
    };
    const avant = rendu({ A1: DEPART });
    expect(avant).toContain('900 €');
    expect(avant).toContain('1 dépôt');
    const apres = rendu({ A1: { ...DEPART, dgRestitueAt: '2026-10-03' } });
    expect(apres).not.toContain('900 €');
  });
  it('carte « Dépôts de garantie » (VRAI _buildWidgetV1Legacy) : le lot parti garde ses 900 € détenus', () => {
    const DB = dbDe({ A1: DEPART });
    const m = monter(DB, [...STATUT, '_buildWidgetV1Legacy'], {
      DashCtx: { mvTotals: () => ({}), occupationKpis: () => ({ nbOcc: 0, nbTotal: 3 }) }, _DD: {}, _DMF: [],
      _nomLotAffiche: (l) => l.locataire || '',
    });
    let w = null;
    try { w = m.fn._buildWidgetV1Legacy('dg', { scopeLogs: DB.logements, yr: '2026', mo: null }); } catch (e) { /* */ }
    expect(m.base._DD.dg && m.base._DD.dg.html).toContain('A1');
    expect(m.base._DD.dg.html).toContain('900 €');
    expect(m.base._DD.dg.html).toContain('1 DG détenus');
    expect(w).toBeTruthy();
  });
  it('onglet Loyers (VRAI _lyTousLoyersHtml) : le locataire parti reste listé, avec son statut et son retard', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    DB.logements[1].locataire = 'Bob';
    const m = monter(DB, [...STATUT, '_lyTousLoyersHtml'], {
      window: { _computeLoyerStatut: () => ({}), _loyerChipVerdict: () => ({}) },
      _suiviLoyerStrip: () => ({ monthlyFull: 600, months: [] }), _SUIVI_CC: {}, _suiviOpen: null,
      _finEntScope: () => ({}), _finWindows: () => ({ constat: '' }),
      _finMonthly: () => ({ byLot: { A1: { annual: { retard: 600 } }, B2: { annual: {} } } }),
    });
    const h = m.fn._lyTousLoyersHtml('2026', '', { inline: true }).html;
    expect(h).toContain('Lea');
    expect(h).toContain('Vacant (départ le 30/09/2026, bail à clôturer)');
    expect(h).toContain('retard 600 €');
    expect(h).toContain('Bob');
    // le locataire OCCUPANT n'a pas d'étiquette de statut
    expect(h.split('bail à clôturer').length - 1).toBe(1);
  });
});
describe('7 · lecteurs de statut (libellés et loyer de référence du prochain bail)', () => {
  it('badge de bail (VRAI getBailStatus) : « Vacant (départ le …, bail à clôturer) »', () => {
    const { fn } = monter(dbDe({ A1: DEPART }), [...STATUT, 'getBailStatus']);
    expect(fn.getBailStatus({ ref: 'A1' }).badge).toContain('Vacant (départ le 30/09/2026, bail à clôturer)');
  });
  it('fiche du bien, chiffres clés (VRAI _renderLogFicheHeroStats) : « Vacant depuis » la date de sortie (5 j)', () => {
    const { fn } = monter(dbDe({ A1: DEPART }), [...STATUT, '_renderLogFicheHeroStats', '_daysBetweenIso'], { _getAllBailsForLog: () => [] });
    let h = '';
    try { h = fn._renderLogFicheHeroStats({ ref: 'A1', hc: 500, ch: 100 }, 'A1'); } catch (e) { h = 'ERREUR ' + e.message; }
    expect(h).toContain('Vacant depuis');
    expect(h).toContain('5 j');
  });
  it('loyer de référence (VRAI saveLoyerBien) : VERROUILLÉ tant que le bail du locataire sorti est ouvert (sinon recopié dans son bail) ; libre sur un lot sans bail', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const sauver = (ref) => { const m = monter(DB, [...STATUT, 'saveLoyerBien'], { _lbCtx: { logRef: ref }, v: (id) => (id === 'lb-hc' ? '620' : '80'), _stamp: () => {}, saveDB: () => {} }); m.fn.saveLoyerBien(); return m.base._toasts || []; };
    expect(sauver('A1')[0]).toContain('Bail à clôturer');
    expect(DB.logements[0].hc).toBe(500);
    expect(sauver('B2')[0]).toContain('Bien occupé');
    expect(DB.logements[1].hc).toBe(400);
    sauver('C3');
    expect(DB.logements[2].hc).toBe(620);
  });
});
describe('8 · lecteurs de statut (listes et exports)', () => {
  it('liste des biens TÉLÉPHONE (VRAI _renderLogementsGroupedPhone) : « 3 lots · 1 loué » (le lot parti ne compte pas)', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const m = monter(DB, [...STATUT, '_renderLogementsGroupedPhone'], { _readLogGroupsCollapsed: () => new Set(), _natCmp: () => 0, _uiIcon: () => '' });
    let h = '';
    try { h = m.fn._renderLogementsGroupedPhone(DB.logements); } catch (e) { h = 'ERREUR ' + e.message; }
    expect(h).toContain('3 lots · 1 loué');
  });
  it('drill « Occupation » (VRAI _buildOccDrill) : ligne du lot parti « Vacant (départ le …) »', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const m = monter(DB, [...STATUT, '_buildOccDrill'], { _occPerimetre: () => ({ loues: 1, total: 3, taux: 33, vacants: [], manque: 0 }), _nomLotAffiche: () => '' });
    expect(m.fn._buildOccDrill({ scopeLogs: DB.logements }).html).toContain('Vacant (départ le 30/09/2026, bail à clôturer)');
  });
  it('export CSV des biens (VRAI exportBiensCSV) : colonne Statut = le libellé', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const cap = {};
    const m = monter(DB, [...STATUT, 'exportBiensCSV'], {
      _biensTab: 'actifs', _activeLogements: () => DB.logements, _filterAndSortLogs: (p) => p,
      Blob: function (parts) { cap.csv = parts[0]; }, URL: { createObjectURL: () => 'u', revokeObjectURL: () => {} },
      document: { createElement: () => ({ click() {} }) },
    });
    m.fn.exportBiensCSV();
    expect(cap.csv).toContain('"A1";"Tilleuls"');
    expect(cap.csv).toContain('"Vacant (départ le 30/09/2026, bail à clôturer)"');
    expect(cap.csv).toContain('"Loué"');
  });
  it('liste des biens PC, blocs par immeuble (VRAI _renderBuildingBlockA) : libellé du lot parti', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const m = monter(DB, [...STATUT, '_renderBuildingBlockA', '_aggregateBuilding'], { _natCmp: () => 0, _lyQ: (x) => x, fmtN: (x) => String(x), _uiIcon: () => '' });
    let h = '';
    try { h = m.fn._renderBuildingBlockA('', 'Tilleuls', DB.logements, null, false); } catch (e) { h = 'ERREUR ' + e.message; }
    expect(h).toContain('Vacant (départ le 30/09/2026, bail à clôturer)');
  });
});
describe('9 · loyer souhaité du prochain bail (annonce, fenêtre loyer de référence)', () => {
  const AG = { nombre: (x) => (x === '' || x == null ? null : Number(x)) };
  it('annonce, étape 1 (VRAI _annonceStep1Continuer) : lot parti, bail à clôturer → loyer souhaité gardé (loyerHcRef), loyer du lot INCHANGÉ ; lot sans bail → poussé', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const essai = (log) => {
      const m = monter(DB, [...STATUT, '_annonceStep1Continuer', '_logpPushLoyerRef'], {
        window: { AnnonceGenerator: AG }, _annonceCtx: { log }, _appReadOnly: false, _stamp: () => {}, saveDB: () => {},
      });
      m.els['an-hc'] = { value: '650' }; m.els['an-ch'] = { value: '90' };
      try { m.fn._annonceStep1Continuer(); } catch (e) { /* étape 2 non simulée */ }
    };
    essai(DB.logements[0]);
    expect(DB.logements[0].loyerHcRef).toBe('650');
    expect(DB.logements[0].hc).toBe(500);
    essai(DB.logements[1]);
    expect(DB.logements[1].hc).toBe(400);
    essai(DB.logements[2]);
    expect(DB.logements[2].hc).toBe(650);
  });
  it('fenêtre « loyer de référence » (VRAI openLoyerBienModal) : lot parti verrouillé avec « Bail à clôturer » ; lot loué « Bien occupé » ; lot vide saisissable', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const ouvrir = (ref) => { const m = monter(DB, [...STATUT, 'openLoyerBienModal']); m.fn.openLoyerBienModal(null, ref); return m.els; };
    const a1 = ouvrir('A1');
    expect(a1['lb-hc'].disabled).toBe(true);
    expect(a1['lb-warn'].innerHTML).toContain('Bail à clôturer');
    const b2 = ouvrir('B2');
    expect(b2['lb-hc'].disabled).toBe(true);
    expect(b2['lb-warn'].innerHTML).toContain('Bien occupé');
    expect(ouvrir('C3')['lb-hc'].disabled).toBe(false);
  });
});
describe('10 · sélecteur d\'intervention : bail ouvert (remise en état après départ)', () => {
  it('VRAI openEquipIntervention : le lot parti (bail à clôturer) reste sélectionnable ; le lot vide non', () => {
    const DB = dbDe({ A1: DEPART, B2: BAIL });
    const m = monter(DB, [...STATUT, 'openEquipIntervention'], { _nomsDuBail: () => '' });
    try { m.fn.openEquipIntervention(); } catch (e) { /* suite du formulaire non simulée */ }
    const h = m.els['ei-log'].innerHTML;
    expect(h).toContain('value="A1"');
    expect(h).toContain('value="B2"');
    expect(h).not.toContain('value="C3"');
  });
});
describe('11 · fiche du lot, enregistrement (VRAI saveParamLog) : loyer souhaité jamais poussé sur un bail ouvert', () => {
  it('lot parti (bail à clôturer) : verrou levé seulement à la clôture ; lot sans bail : poussé', () => {
    const essai = (ref, baux) => {
      const DB = dbDe(baux);
      const cap = {};
      const m = monter(DB, [...STATUT, 'saveParamLog'], {
        v: (id) => (id === 'log-ref' ? ref : ''), _isFrActive: () => false, _appReadOnly: false,
        _logpReadFromForm: () => ({ log: { loyerHcRef: '650' } }), _logpApplyPartial: () => {},
        _logpPushLoyerRef: (log, p, occupe) => { cap.occupe = occupe; return false; },
        _stamp: () => {}, saveDB: () => {}, _syncLogToBail: () => {}, _logPiecesDraft: [], _logModalMobilierDraft: [],
      });
      try { m.fn.saveParamLog(); } catch (e) { cap.err = e.message; }
      return cap;
    };
    expect(essai('A1', { A1: DEPART }).occupe).toBe(true);
    expect(essai('B2', { B2: BAIL }).occupe).toBe(true);
    expect(essai('C3', {}).occupe).toBe(false);
  });
});
describe('12 · relocation d\'un lot parti (VRAI archiverBail, appelé par saveBail) — audit 06/10', () => {
  const rebail = (ancien, nouveauDebut) => {
    const DB = dbDe({ A1: ancien });
    const m = monter(DB, [...STATUT, 'archiverBail', '_archiverDansHistorique', '_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation'], {
      _baremeCloturerLot: (ref, fin) => { DB._bareme = fin; },
    });
    m.fn.archiverBail('A1', nouveauDebut);
    DB.baux.A1 = { ref: 'A1', type: 'nu', debut: nouveauDebut, hc: 650, ch: 50, dg: 1300, locataires: [{ nom: 'Nouveau' }] };
    return DB;
  };
  const du = (DB, ym) => {
    const d = duMoisFromRaw('A1', ym, { currentBail: DB.baux.A1, bauxHistorique: DB.baux_historique, bareme: [] });
    return d ? Math.round((d.hc || 0) + (d.ch || 0)) : 0;
  };
  it('départ déclaré au 30/09, nouveau bail au 15/11 : l\'ancien bail finit le 30/09 — octobre n\'est dû par personne, novembre seulement par le nouveau (prorata)', () => {
    const DB = rebail({ ...DEPART, ref: 'A1', fin: '2028-12-31' }, '2026-11-15');
    expect(DB.baux_historique[0].finEffective).toBe('2026-09-30');
    expect(DB._bareme).toBe('2026-09-30');
    expect(du(DB, '2026-09')).toBe(600);
    expect(du(DB, '2026-10')).toBe(0);
    expect(du(DB, '2026-11')).toBe(Math.round(700 * 16 / 30));
  });
  it('sortie déclarée APRÈS le début du nouveau bail : l\'ancien bail finit la veille du nouveau', () => {
    const DB = rebail({ ...BAIL, ref: 'A1', depart: { dateSortie: '2026-11-20' } }, '2026-11-15');
    expect(DB.baux_historique[0].finEffective).toBe('2026-11-14');
  });
  it('sans départ déclaré : la veille du nouveau bail (comportement C4 inchangé) ; fin effective déjà posée : gardée', () => {
    expect(rebail({ ...BAIL, ref: 'A1' }, '2026-11-15').baux_historique[0].finEffective).toBe('2026-11-14');
    expect(rebail({ ...BAIL, ref: 'A1', finEffective: '2026-08-31' }, '2026-11-15').baux_historique[0].finEffective).toBe('2026-08-31');
  });
  it('règle (VRAI _finAncienBailAuRebail) : sortie le jour même du nouveau bail = veille + avertissement', () => {
    const { fn } = monter(dbDe({}), ['_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation']);
    expect(fn._finAncienBailAuRebail({ ...BAIL, depart: { dateSortie: '2026-11-15' } }, '2026-11-15')).toEqual({ fin: '2026-11-14', sortie: '2026-11-15', sortieApres: true, source: 'chevauchement' });
    expect(fn._finAncienBailAuRebail({ ...BAIL, depart: { dateSortie: '2026-11-14' } }, '2026-11-15')).toEqual({ fin: '2026-11-14', sortie: '2026-11-14', sortieApres: false, source: 'sortie' });
  });
  it('formulaire en relocation (VRAI onBailRefChange) : début proposé = lendemain de la sortie déclarée ; sans départ : vide ; en édition : début du bail édité', () => {
    const debut = (baux, edit) => {
      const DB = dbDe(baux);
      DB.logements[0].debut = '2023-07-01';
      const m = monter(DB, ['onBailRefChange', '_isoDecaleJours', '_bailFinOccupation'], { _bailIsEdit: edit, _readLogForBail: () => ({}), _TU2BT: {} });
      m.fn.onBailRefChange({ value: 'A1' });
      return m.els['b-debut'].value;
    };
    expect(debut({ A1: DEPART }, false)).toBe('2026-10-01');
    expect(debut({ A1: BAIL }, false)).toBe('');
    expect(debut({}, false)).toBe('');
    expect(debut({ A1: DEPART }, true)).toBe('2023-07-01');
  });
});
describe('13 · dépôts détenus = état de restitution, baux vivants ET archivés (coordination Finances 06/10)', () => {
  const ARCH = { ...DEPART, ref: 'A1', finEffective: '2026-09-30', _archivedAuto: true };
  const NOUV = { ref: 'A1', type: 'nu', debut: '2026-11-15', hc: 650, ch: 50, dg: 1300, locataires: [{ nom: 'Nouveau' }] };
  const detenu = (baux, histo) => {
    const DB = dbDe(baux); DB.baux_historique = histo;
    return monter(DB, STATUT).fn._dgDetenuDuLot({ ref: 'A1', dg: 0 });
  };
  it('relocation avant restitution : le dépôt de 900 € de l\'ancien bail (archivé) reste détenu, en plus du nouveau', () => {
    expect(detenu({ A1: NOUV }, [ARCH])).toBe(2200);
  });
  it('restitution enregistrée sur le bail archivé (dgRestitueAt) : seul le nouveau dépôt reste', () => {
    expect(detenu({ A1: NOUV }, [{ ...ARCH, dgRestitueAt: '2026-11-20' }])).toBe(1300);
  });
  it('bail archivé par relocation, montants EN COURS de calcul (dgRetenu sans dgRestitueAt) : toujours détenu', () => {
    expect(detenu({}, [{ ...ARCH, dgRetenu: 120, dgRestitue: 780 }])).toBe(900);
  });
  it('bail CLÔTURÉ : montants saisis à la clôture = restitution (anciennes clôtures) ; clôture sans montant ni date = détenu', () => {
    expect(detenu({ A1: { ref: 'A1', _deleted: true } }, [{ ...ARCH, cloture: true, dgRestitue: 900 }])).toBe(0);
    expect(detenu({ A1: { ref: 'A1', _deleted: true } }, [{ ...ARCH, cloture: true, dgRetenu: 900 }])).toBe(0);
    expect(detenu({ A1: { ref: 'A1', _deleted: true } }, [{ ...ARCH, cloture: true, dgRestitue: 0, dgRetenu: 0 }])).toBe(900);
  });
  it('bail en cours : un dgRetenu calculé ne vaut pas restitution (seul dgRestitueAt) ; tombstone et historique supprimé ignorés', () => {
    expect(detenu({ A1: { ...DEPART, dgRetenu: 100 } }, [])).toBe(900);
    expect(detenu({ A1: { ref: 'A1', _deleted: true } }, [{ ...ARCH, _deleted: true }])).toBe(0);
  });
  it('tuile PC « Dépôts détenus » (VRAI _renderPilotage) après relocation : 2 200 €', () => {
    const DB = dbDe({ A1: NOUV }); DB.baux_historique = [ARCH];
    const { fn, els } = monter(DB, [...STATUT, '_renderPilotage']);
    try { fn._renderPilotage({ scopeLogs: DB.logements, yr: '2026', mo: null, activeEnt: '' }); } catch (e) { /* bulles non simulées */ }
    const h = els['pil-strip'].innerHTML;
    expect(h.slice(h.indexOf('Dépôts détenus'), h.indexOf('Dépôts détenus') + 120)).toContain('2200 €');
  });
});

describe('14 · scénario de l\'audit : relocation d\'un lot parti (VRAIS archiverBail → dû, dépôt, tâche)', () => {
  const scenario = () => {
    const DB = dbDe({ A1: { ...DEPART, ref: 'A1', fin: '2028-12-31' } });
    const m = monter(DB, [...STATUT, 'archiverBail', '_archiverDansHistorique', '_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation', '_computeUnifiedTodo', '_departDeadlineDG', '_edlSortieDuBail', '_edlsDuBail', '_bailSuivantDebut'], {
      _baremeCloturerLot: () => {}, _departState: () => null, td: () => AUJ, AlertRules: new Proxy({}, { get: () => () => [] }), EQUIP_RULES: [], _DIAGS_CATALOG_INLINE: [], _isoLocal: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    });
    m.fn.archiverBail('A1', '2026-11-15');
    DB.baux.A1 = { ref: 'A1', type: 'nu', debut: '2026-11-15', hc: 650, ch: 50, dg: 1300, locataires: [{ nom: 'Nouveau' }] };
    return { DB, m };
  };
  it('octobre et novembre ne sont plus dus par l\'ancien locataire', () => {
    const { DB } = scenario();
    const ancien = (ym) => { const d = duMoisFromRaw('A1', ym, { currentBail: null, bauxHistorique: DB.baux_historique, bareme: [] }); return d ? Math.round((d.hc || 0) + (d.ch || 0)) : 0; };
    expect(ancien('2026-09')).toBe(600);
    expect(ancien('2026-10')).toBe(0);
    expect(ancien('2026-11')).toBe(0);
  });
  it('le dépôt de 900 € reste détenu, et la tâche « DG avant le 30/11 » reste (bail archivé)', () => {
    const { DB, m } = scenario();
    expect(m.fn._dgDetenuDuLot(DB.logements[0])).toBe(2200);
    let out = [];
    try { out = m.fn._computeUnifiedTodo({ scopeLogs: [DB.logements[0]], scopeImms: [], yr: '2026' }) || []; } catch (e) { out = ['ERREUR ' + e.message]; }
    const t = out.find((x) => x && x.type === 'depart');
    expect(t && t.subtitle).toContain('DG avant le 30/11/2026');
    expect(t.subtitle).toContain('900 €');
    expect(t.actionFn).toBe("_dgOpenRestitution('A1','" + bailHistCle(DB.baux_historique[0]) + "')");
  });
});

describe('15 · clôture d\'un bail (VRAIS saveBailClore / terminerBail) : restitution du dépôt', () => {
  const clore = (fnNom, saisie, rep = true, bailEnPlus = {}) => {
    const DB = dbDe({ A1: { ...DEPART, ref: 'A1', ...bailEnPlus } });
    const msgs = [];
    const vals = { 'b-clore-ref': 'A1', 'b-ref': 'A1', 'b-fin-effective': '2026-09-30', 'b-fin-motif': 'Congé du locataire', 'b-dg-restitue-date': saisie.date || '' };
    const m = monter(DB, [...STATUT, fnNom, '_clotureDgConfirmer', '_clotureDgAppliquer', '_archiverDansHistorique'], {
      v: (id) => vals[id] || '', pf: (id) => Number(saisie[id] || 0), confirm2: (t) => { msgs.push(t); return msgs.length === 1 ? true : rep; },
      _ART22_RESTITUTION: ['« art22-2mois »', '« art22-1mois »'], _todayIsoLocal: () => '2026-10-06', td: () => '2026-10-06',
      _baremeCloturerLot: () => {}, saveDB: () => {}, rBaux: () => {}, _gmbiAlerterSortie: () => {},
    });
    m.els['b-clore-ref'] = { value: 'A1' };
    m.fn[fnNom]();
    return { DB, msgs };
  };
  const detenu = (DB) => monter(DB, STATUT).fn._dgDetenuDuLot({ ref: 'A1' });
  for (const fnNom of ['saveBailClore', 'terminerBail']) {
    it(fnNom + ' sans date de virement : avertit (art. 22), ne bloque pas ; le dépôt reste détenu (clotureV 2)', () => {
      const { DB, msgs } = clore(fnNom, {});
      expect(msgs[1]).toContain('art22-2mois');
      expect(msgs[1]).toContain('900 €');
      expect(DB.baux.A1._deleted).toBe(true);
      expect(DB.baux_historique[0]).toMatchObject({ clotureV: 2 });
      expect(DB.baux_historique[0].dgRestitueAt).toBeFalsy();
      expect(detenu(DB)).toBe(900);
    });
    it(fnNom + ' : renoncer à l\'avertissement n\'archive rien', () => {
      const { DB } = clore(fnNom, {}, false);
      expect(DB.baux.A1._deleted).toBeFalsy();
      expect(DB.baux_historique).toEqual([]);
    });
    it(fnNom + ' montants saisis SANS date : avertit quand même, jamais de date inventée, dépôt détenu', () => {
      const { DB, msgs } = clore(fnNom, { 'b-dg-restitue': 780, 'b-dg-retenu': 120 });
      expect(msgs).toHaveLength(2);
      expect(DB.baux_historique[0].dgRestitueAt).toBeFalsy();
      expect(detenu(DB)).toBe(900);
    });
    it(fnNom + ' avec la date du virement : pas d\'avertissement, dgRestitueAt = cette date, plus détenu', () => {
      const { DB, msgs } = clore(fnNom, { 'b-dg-restitue': 780, 'b-dg-retenu': 120, date: '2026-10-02' });
      expect(msgs).toHaveLength(1);
      expect(DB.baux_historique[0].dgRestitueAt).toBe('2026-10-02');
      expect(detenu(DB)).toBe(0);
    });
  }
  it('scénario « régularisation puis clôture » : montants calculés pré-remplis (150 / 750), clôture sans date → 900 € toujours détenus', () => {
    const { DB, msgs } = clore('saveBailClore', { 'b-dg-restitue': 750, 'b-dg-retenu': 150 }, true, { dgRetenu: 150, dgRestitue: 750 });
    expect(msgs[1]).toContain('pas de date de virement');
    expect(DB.baux_historique[0]).toMatchObject({ cloture: true, clotureV: 2, dgRestitue: 750, dgRetenu: 150 });
    expect(detenu(DB)).toBe(900);
  });
  it('clôture ANCIENNE (sans clotureV) aux montants saisis : vaut restitution (sauvegardes réelles inchangées)', () => {
    const DB = dbDe({ A1: { ref: 'A1', _deleted: true } }); DB.baux_historique = [{ ...DEPART, ref: 'A1', cloture: true, dgRestitue: 650 }];
    expect(detenu(DB)).toBe(0);
  });
});
describe('16 · fiche du bien d\'un lot parti (VRAI rLogFiche + panneaux réels) : le bail OUVERT reste affiché', () => {
  const rendu = (phone) => {
    const DB = dbDe({ A1: DEPART });
    const m = monter(DB, [...STATUT, 'rLogFiche', '_renderLogFichePhHero', '_renderLogFichePhStrip', '_renderLogFichePanelBail'], {
      _currentLogFicheRef: 'A1', _isPhone: () => phone,
      _departState: () => ({ doneCount: 1, total: 6, deadline: { iso: '2026-11-30', jours: 56 }, steps: [] }),
      _duMoisLot: () => ({ total: 600 }), _lyEtatLot: () => ({ retard: { enRetard: true, reste: 600 } }),
      window: { retardLot: () => ({}) },
    });
    m.fn.rLogFiche();
    return m.els['log-fiche-content'].innerHTML;
  };
  it('PC : panneau « Départ en cours » du bail ouvert', () => {
    expect(rendu(false)).toContain('Départ en cours — étape 1/6');
  });
  it('téléphone : bandeau chiffré « Dépôt 900 € » et « Solde -600 € », et « Départ en cours »', () => {
    const h = rendu(true);
    expect(h).toMatch(/900 €<\/div><div class="k">Dépôt/);
    expect(h).toMatch(/-600 €<\/div><div class="k">Solde/);
    expect(h).toContain('Départ en cours — étape 1/6');
  });
});
describe('17 · badge « Locataires » de la barre latérale (VRAI _v4NavCounts) = la page Locataires (rBaux)', () => {
  it('lot parti (bail à clôturer) + lot loué : 2, comme la page ; lot vide et bail clôturé : non comptés', () => {
    const DB = dbDe({ A1: DEPART, B2: { ...BAIL, locataires: [{ nom: 'Bob' }] }, C3: { ref: 'C3', _deleted: true } });
    const m = monter(DB, [...STATUT, '_v4NavCounts', '_lotLocataireAffiche'], { _isLoyerCategory: () => false });
    expect(m.fn._v4NavCounts().locs).toBe(2);
  });
});
describe('18 · loyer souhaité (VRAI _pushLoyerTheoFromLive) : jamais écrasé sur un lot vacant ou parti', () => {
  const pousse = (baux, log) => { const DB = dbDe(baux); monter(DB, [...STATUT, '_pushLoyerTheoFromLive']).fn._pushLoyerTheoFromLive(log); return log; };
  it('lot parti, souhaité saisi à l\'annonce : gardé', () => {
    const l = pousse({ A1: DEPART }, { ref: 'A1', hc: 500, ch: 100, loyerHcRef: '650', chargesRef: '90' });
    expect([l.loyerHcRef, l.chargesRef]).toEqual(['650', '90']);
  });
  it('lot vide, souhaité saisi : gardé ; lot parti sans souhaité : rempli par le loyer courant', () => {
    expect(pousse({}, { ref: 'C3', hc: 300, loyerHcRef: '420' }).loyerHcRef).toBe('420');
    expect(pousse({ A1: DEPART }, { ref: 'A1', hc: 500, ch: 100 }).loyerHcRef).toBe(500);
  });
  it('lot loué : le bail pousse son loyer (comportement B1 inchangé)', () => {
    const l = pousse({ B2: BAIL }, { ref: 'B2', hc: 400, ch: 50, loyerHcRef: '999', chargesRef: '9' });
    expect([l.loyerHcRef, l.chargesRef]).toEqual([400, 50]);
  });
  it('saisie explicite du loyer de référence sur un lot vide (VRAI saveLoyerBien) : le souhaité suit la saisie', () => {
    const DB = dbDe({});
    DB.logements[2].loyerHcRef = '300';
    const m = monter(DB, [...STATUT, 'saveLoyerBien', '_pushLoyerTheoFromLive'], { _lbCtx: { logRef: 'C3' }, v: (id) => (id === 'lb-hc' ? '620' : '80'), _stamp: () => {}, saveDB: () => {} });
    m.fn.saveLoyerBien();
    expect([DB.logements[2].hc, DB.logements[2].loyerHcRef, DB.logements[2].chargesRef]).toEqual([620, 620, 80]);
  });
});
describe('19 · tâche du dépôt d\'un bail archivé (VRAI _computeUnifiedTodo) : sévérité selon l\'échéance art. 22', () => {
  const tache = (sortie) => {
    const DB = dbDe({}); DB.baux_historique = [{ ...BAIL, ref: 'A1', depart: { dateSortie: sortie }, finEffective: sortie, _archivedAuto: true }];
    const m = monter(DB, [...STATUT, '_computeUnifiedTodo', '_departDeadlineDG', '_edlSortieDuBail', '_edlsDuBail', '_bailSuivantDebut'], {
      _departState: () => null, AlertRules: new Proxy({}, { get: () => () => [] }), EQUIP_RULES: [], _DIAGS_CATALOG_INLINE: [],
      _isoLocal: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    });
    return (m.fn._computeUnifiedTodo({ scopeLogs: [DB.logements[0]] }) || []).find((x) => x && x.type === 'depart');
  };
  it('échéance dans 15 jours : orange « DG à restituer avant le … »', () => {
    const t = tache('2026-08-20');
    expect(t.severity).toBe('ora');
    expect(t.subtitle).toContain('DG à restituer avant le 20/10/2026 (J‑15)');
  });
  it('échéance dépassée : rouge « DG en retard … (majoration) » ; lointaine : information', () => {
    expect(tache('2026-07-01').severity).toBe('red');
    expect(tache('2026-07-01').subtitle).toContain('DG en retard 34 j (majoration)');
    expect(tache('2026-09-30').severity).toBe('info');
  });
});
describe('20 · compteur « Dépôts détenus » = nombre de DÉPÔTS (un lot reloué avant restitution en porte deux)', () => {
  const ARCH = { ...DEPART, ref: 'A1', finEffective: '2026-09-30', _archivedAuto: true };
  const NOUV = { ref: 'A1', type: 'nu', debut: '2026-11-15', hc: 650, ch: 50, dg: 1300, locataires: [{ nom: 'Nouveau' }] };
  const base = () => { const DB = dbDe({ A1: NOUV, B2: { ...BAIL, dg: 400 } }); DB.baux_historique = [ARCH]; return DB; };
  it('règle (VRAIS _dgDetenusDuLot / _dgNbDetenusDuLot) : A1 = 900 + 1 300 en 2 dépôts', () => {
    const { fn } = monter(base(), STATUT);
    expect(fn._dgDetenusDuLot({ ref: 'A1' })).toEqual([1300, 900]);
    expect(fn._dgNbDetenusDuLot({ ref: 'A1' })).toBe(2);
    expect(fn._dgNbDetenusDuLot({ ref: 'C3' })).toBe(0);
  });
  it('tuile PC (VRAI _renderPilotage) : 2 600 € · 3 dépôts', () => {
    const DB = base();
    const { fn, els } = monter(DB, [...STATUT, '_renderPilotage']);
    try { fn._renderPilotage({ scopeLogs: DB.logements, yr: '2026', mo: null, activeEnt: '' }); } catch (e) { /* bulles non simulées */ }
    const h = els['pil-strip'].innerHTML;
    const t = h.slice(h.indexOf('Dépôts détenus'), h.indexOf('Dépôts détenus') + 140);
    expect(t).toContain('2600 €');
    expect(t).toContain('3 dépôts');
  });
  it('Accueil téléphone (VRAI _renderAccueilPhone) : 3 dépôts', () => {
    const DB = base();
    const m = monter(DB, [...STATUT, '_renderAccueilPhone'], { _isPhone: () => true });
    m.base.document = { getElementById: (id) => (m.els[id] = m.els[id] || { id, innerHTML: '', style: {} }), createElement: () => ({ style: {} }) };
    try { m.fn._renderAccueilPhone({ scopeLogs: DB.logements, yr: '2026', mo: null, activeEnt: '', mvs: [], mvsYTD: [] }); } catch (e) { /* suite non simulée */ }
    const h = (m.els['accm-phone'] || {}).innerHTML || '';
    expect(h.slice(h.indexOf('Dépôts détenus'), h.indexOf('Dépôts détenus') + 200)).toContain('3 dépôts');
  });
  it('widget (VRAI _buildWidgetV1Legacy) : « 3 DG détenus », moyenne par dépôt', () => {
    const DB = base();
    const m = monter(DB, [...STATUT, '_buildWidgetV1Legacy'], { DashCtx: { mvTotals: () => ({}), occupationKpis: () => ({ nbOcc: 0, nbTotal: 3 }) }, _DD: {}, _DMF: [], _nomLotAffiche: () => '' });
    let w = null;
    try { w = m.fn._buildWidgetV1Legacy('dg', { scopeLogs: DB.logements, yr: '2026', mo: null }); } catch (e) { /* */ }
    expect(m.base._DD.dg.html).toContain('Total (3 DG détenus)');
    expect(JSON.stringify(w)).toContain('3 DG détenus');
    expect(JSON.stringify(w)).toContain('Moyenne 867 € / dépôt');
  });
});
describe('21 · restitution du dépôt sur le bail EXACT (VRAIS _dgOpenRestitution / _dgConfirmerRestitution)', () => {
  const LEA = { ...DEPART, ref: 'A1', finEffective: '2026-09-30', _archivedAt: '2026-11-14', _archivedAuto: true, locataires: [{ nom: 'Lea' }] };
  const NINA = { ref: 'A1', type: 'nu', debut: '2026-11-15', hc: 650, ch: 50, dg: 1300, locataires: [{ nom: 'Nina' }] };
  const RESTIT = ['_dgOpenRestitution', '_dgConfirmerRestitution', '_dgBailCible', '_dgRestitRecalc'];
  const ouvrir = (DB, ref, cle, date = '2026-10-20') => {
    const vals = { 'dg-restit-date': date, 'dg-restit-autres': '0', 'dg-restit-detail-retenues': '' };
    const m = monter(DB, [...STATUT, ...RESTIT, '_computeUnifiedTodo', '_departDeadlineDG', '_edlSortieDuBail', '_edlsDuBail', '_bailSuivantDebut'], {
      v: (id) => vals[id] || '', _dgVgRows: [], _dgVgCtx: {}, _dgVgSeedFromEdl: () => [], _dgVgRender: () => {},
      _calculerSoldeDG: (b) => ({ soldeRestitue: Number(b.dgPaid || b.dg) - Number(b.dgRetenu || 0), loyerImpaye: 0 }),
      _dgStatut: () => ({ statut: 'a_restituer' }), _calculerDelaiRestitution: () => 2, confirm2: () => true, _stamp: (o) => { o._modifiedAt = 'stamp'; }, saveDB: () => {},
      _departState: () => null, AlertRules: new Proxy({}, { get: () => () => [] }), EQUIP_RULES: [], _DIAGS_CATALOG_INLINE: [],
      _isoLocal: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
      window: { computeVetusteTotal: () => ({ total: 0 }), _penaliteRetardDG: () => ({ penalite: 0 }) },
    });
    m.fn._dgOpenRestitution(ref, cle);
    const ouvert = !!m.base._dgRestitCible;
    m.els['ov-dg-restitution-ref'] = { value: ref };
    if (ouvert) m.fn._dgConfirmerRestitution();
    return { m, ouvert };
  };
  const taches = (m, DB) => (m.fn._computeUnifiedTodo({ scopeLogs: [DB.logements[0]] }) || []).filter((x) => x && x.type === 'depart');
  it('après une RELOCATION (geste de la tâche / de la frise, clé du bail archivé) : les 900 € de Lea ne sont plus détenus, les 1 300 € de Nina le restent, aucune fausse tâche', () => {
    const DB = dbDe({ A1: { ...NINA } }); DB.baux_historique = [{ ...LEA }];
    const { m } = ouvrir(DB, 'A1', bailHistCle(DB.baux_historique[0]));
    expect(DB.baux_historique[0].dgRestitueAt).toBe('2026-10-20');
    expect(DB.baux_historique[0]._modifiedAt).toBe('stamp');   // propagé au cloud (signature de contenu + _modifiedAt)
    expect(DB.baux.A1.dgRestitueAt).toBeUndefined();
    expect(DB.baux.A1.depart).toBeUndefined();
    expect(m.fn._dgDetenusDuLot(DB.logements[0])).toEqual([1300]);
    expect(taches(m, DB)).toEqual([]);
  });
  it('après une relocation, appel SANS clé : le bail de Nina (sans départ) n\'est jamais visé — le seul bail archivé au dépôt détenu l\'est', () => {
    const DB = dbDe({ A1: { ...NINA } }); DB.baux_historique = [{ ...LEA }];
    ouvrir(DB, 'A1');
    expect(DB.baux.A1.dgRestitueAt).toBeUndefined();
    expect(DB.baux_historique[0].dgRestitueAt).toBe('2026-10-20');
  });
  it('après une CLÔTURE sans restitution (tombstone) : la restitution s\'écrit sur le bail archivé, jamais sur le tombstone', () => {
    const DB = dbDe({ A1: { ref: 'A1', _deleted: true } }); DB.baux_historique = [{ ...LEA, cloture: true, clotureV: 2, _archivedAuto: undefined }];
    const { m } = ouvrir(DB, 'A1');
    expect(DB.baux.A1).toEqual({ ref: 'A1', _deleted: true });
    expect(DB.baux_historique[0].dgRestitueAt).toBe('2026-10-20');
    expect(m.fn._dgDetenuDuLot(DB.logements[0])).toBe(0);
  });
  it('deux dépôts archivés en attente et appel SANS clé : refus (ambigu), rien n\'est écrit ; avec la clé : le bon', () => {
    const DB = dbDe({ A1: { ...NINA } }); DB.baux_historique = [{ ...LEA }, { ...LEA, _archivedAt: '2025-06-30', locataires: [{ nom: 'Ancien' }] }];
    const { m, ouvert } = ouvrir(DB, 'A1');
    expect(ouvert).toBe(false);
    expect(m.base._toasts[0]).toContain('plusieurs dépôts archivés en attente');
    expect(DB.baux_historique.map((h) => h.dgRestitueAt)).toEqual([undefined, undefined]);
    ouvrir(DB, 'A1', bailHistCle(DB.baux_historique[1]));
    expect(DB.baux_historique.map((h) => h.dgRestitueAt)).toEqual([undefined, '2026-10-20']);
    expect(DB.baux.A1.dgRestitueAt).toBeUndefined();
  });
  it('bail en départ (bail en cours) : la restitution s\'écrit sur lui, comme avant', () => {
    const DB = dbDe({ A1: { ...DEPART, ref: 'A1' } });
    ouvrir(DB, 'A1');
    expect(DB.baux.A1.dgRestitueAt).toBe('2026-10-20');
  });
  it('montant versé affiché = le dépôt de CE bail (900 €, pas les 1 300 € de Nina)', () => {
    const DB = dbDe({ A1: { ...NINA } }); DB.baux_historique = [{ ...LEA }];
    const { m } = ouvrir(DB, 'A1', bailHistCle(DB.baux_historique[0]));
    expect(m.els['ov-dg-restitution-body'].innerHTML).toMatch(/DG initial versé<\/td><td[^>]*>900 €/);
  });
});
describe('22 · frise du bien (VRAI _histoBailEventHtml) : le geste de restitution vise le bail archivé exact', () => {
  const LEA = { ...DEPART, ref: 'A1', finEffective: '2026-09-30', _archivedAt: '2026-11-14', _archivedAuto: true };
  const carte = (bail, statut) => {
    const DB = dbDe({});
    const m = monter(DB, [...STATUT, '_histoBailEventHtml'], {
      DG_STATUS: { RESTITUE: 'restitue', EN_RETARD: 'retard', A_RESTITUER: 'a_restituer', COMPLET: 'complet', PARTIEL: 'partiel' },
      _dgStatut: (b) => ({ statut: b.dgRestitueAt ? 'restitue' : 'a_restituer', joursRestants: 10, delaiMois: 2 }), _uiIcon: () => '',
    });
    return m.fn._histoBailEventHtml({ type: 'dg-verse', montant: 900 }, { statut, bail }, 'A1', null);
  };
  it('bail archivé au dépôt détenu : « Préparer la restitution du DG » avec sa clé', () => {
    expect(carte({ ...LEA }, 'clos')).toContain(`_dgOpenRestitution('A1','${bailHistCle(LEA)}')`);
  });
  it('bail archivé restitué : badge « Restitué », pas de geste ; clôture ancienne aux montants saisis : idem', () => {
    const h = carte({ ...LEA, dgRestitueAt: '2026-10-20' }, 'clos');
    expect(h).toContain('Restitué');
    expect(h).not.toContain('_dgOpenRestitution');
    const v1 = carte({ ...LEA, cloture: true, dgRestitue: 900 }, 'clos');
    expect(v1).toContain('Restitué');
    expect(v1).not.toContain('_dgOpenRestitution');
  });
});
describe('23 · article 22 cité mot pour mot (Légifrance, alinéas 3 et 4)', () => {
  it('le texte de l\'avertissement porte la phrase sur l\'adresse du nouveau domicile', () => {
    const src = SRC[0];
    const i = src.indexOf('const _ART22_RESTITUTION = [');
    const bloc = src.slice(i, src.indexOf('];', i));
    expect(bloc).toContain("sous réserve qu'elles soient dûment justifiées. A cette fin, le locataire indique au bailleur ou à son mandataire, lors de la remise des clés, l'adresse de son nouveau domicile.");
    expect(bloc).toContain("Il est restitué dans un délai maximal d'un mois à compter de la remise des clés par le locataire lorsque l'état des lieux de sortie est conforme à l'état des lieux d'entrée");
  });
});
describe('24 · nouveau bail sur un lot (VRAIS openBail / convertCandidatToBail / _ouvrirNouveauBailSurLot / assistant de départ)', () => {
  const docStub = () => ({ querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }) });
  const ouvrirAvec = (baux, appel) => {
    const DB = dbDe(baux);
    DB.logements[0].debut = '2023-07-01'; DB.logements[0].fin = '2026-06-30';
    DB.candidats = [{ id: 'c1', statut: 'valide', logRef: 'A1', nom: 'Nina' }];
    const E = {};
    const elX = (id) => (E[id] = E[id] || { id, value: '', innerHTML: '', textContent: '', style: {}, dataset: {}, disabled: false, checked: false, options: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, querySelectorAll: () => [], querySelector: () => null, appendChild() {} });
    const m = monter(DB, [...STATUT, 'openBail', 'onBailRefChange', '_ouvrirNouveauBailSurLot', 'convertCandidatToBail', '_isoDecaleJours', '_bailFinOccupation'], {
      el: elX, document: docStub(), _activeLogements: () => DB.logements, sortedIRLKeys: () => ['T1 2026'], getIRLRefForDate: () => 'T1 2023',
      _bailIsEdit: false, _readLogForBail: () => ({}), _TU2BT: {}, _candidatVersLocataire: (c) => ({ nom: c.nom }), _candidatVersGarant: () => null,
      _loyerAttenduForCand: () => null, _bailLegacyToGarants: () => [],
    });
    try { appel(m.fn); } catch (e) { m.base.__err = e.message; }
    m.els = E;
    return m;
  };
  it('openBail(nouveau, lot connu) : ni le début ni la fin de l\'ancien bail', () => {
    const m = ouvrirAvec({ A1: DEPART }, (fn) => fn.openBail(null, { logRef: 'A1' }));
    expect(m.els['b-debut'].value).toBe('');
    expect(m.els['b-fin'].value).toBe('');
  });
  it('conversion d\'un candidat sur le lot parti : début proposé = lendemain de la sortie (01/10/2026), jamais 2023-07-01', () => {
    const m = ouvrirAvec({ A1: DEPART }, (fn) => fn.convertCandidatToBail('c1'));
    expect(m.els['b-debut'].value).toBe('2026-10-01');
    expect(m.els['b-fin'].value).toBe('');
  });
  it('conversion sur un lot vide : début laissé vide', () => {
    const m = ouvrirAvec({}, (fn) => fn.convertCandidatToBail('c1'));
    expect(m.els['b-debut'].value).toBe('');
  });
  it('édition d\'un bail existant : ses dates restent', () => {
    const m = ouvrirAvec({ A1: DEPART }, (fn) => fn.openBail('A1'));
    expect(m.els['b-debut'].value).toBe('2023-07-01');
  });
  it('assistant de départ, étape « Nouveau bail + EDL entrée + DG » : ouvre un NOUVEAU bail sur le lot (jamais l\'édition du bail du locataire sorti)', () => {
    const src = corps('_departState');
    expect(src).toContain("t:'Nouveau bail + EDL entrée + DG', s:'Bail', on:`closeM('ov-depart');_ouvrirNouveauBailSurLot('${jsRef}')`");
    expect(src).not.toMatch(/Nouveau bail \+ EDL entrée \+ DG[^}]*openBail\(/);
  });
});
describe('25 · confirmation de relocation (VRAI saveBail) : fin de l\'ancien bail et sa source, dépôt de l\'ancien locataire', () => {
  const confirmation = (ancien, debut = '2026-11-15') => {
    const DB = dbDe({ A1: { ...ancien, ref: 'A1' } });
    const msgs = [];
    const vals = { 'b-ref': 'A1', 'b-debut': debut, 'b-fin': '2029-11-14', 'b-hc': '650', 'b-ch': '50', 'b-dg': '1300' };
    const m = monter(DB, [...STATUT, 'saveBail', '_rebailConfirmTexte', '_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation', '_bailEnCours'], {
      v: (id) => vals[id] || '', pf: (id) => Number(vals[id] || 0), getBailLocs: () => [{ nom: 'Nina' }], _skipDdtCheckOnce: true,
      confirm2: (t) => { msgs.push(t); return false; },
    });
    try { m.fn.saveBail(); } catch (e) { msgs.push('ERREUR ' + e.message); }
    return msgs.find((x) => x.includes('a déjà un bail actif')) || msgs.join(' || ') || '(aucune confirmation)';
  };
  it('sortie déclarée : « terminé le 30/09/2026 (sortie déclarée) » + dépôt de 900 € détenu', () => {
    const t = confirmation(DEPART);
    expect(t).toContain("L'ancien bail sera terminé le 30/09/2026 (sortie déclarée).");
    expect(t).toContain("Le dépôt de garantie de l'ancien locataire (900 €) n'a pas de restitution enregistrée");
  });
  it('fin effective déjà posée : « fin déjà enregistrée le … », jamais « veille du nouveau bail »', () => {
    const t = confirmation({ ...BAIL, finEffective: '2026-09-15' });
    expect(t).toContain("L'ancien bail garde sa fin déjà enregistrée le 15/09/2026.");
    expect(t).not.toContain('veille du nouveau bail');
  });
  it('chevauchement (sortie le jour du nouveau bail) : avertissement, fin la veille', () => {
    const t = confirmation({ ...BAIL, depart: { dateSortie: '2026-11-15' } });
    expect(t).toContain("⚠️ La sortie déclarée de l'ancien locataire (15/11/2026) n'est pas antérieure au début du nouveau bail (15/11/2026) : l'ancien bail sera terminé la veille, le 14/11/2026.");
  });
  it('sans départ : veille du nouveau bail ; dépôt restitué : pas d\'avertissement de dépôt', () => {
    const t = confirmation({ ...BAIL, dgRestitueAt: '2026-10-20' });
    expect(t).toContain("L'ancien bail sera terminé le 14/11/2026 (veille du nouveau bail).");
    expect(t).not.toContain("n'a pas de restitution enregistrée");
  });
});
describe('26 · dépôts détenus : doublons d\'archive, bail courant clôturé, pluriel du bandeau', () => {
  const LEA = { ...DEPART, ref: 'A1', finEffective: '2026-09-30', _archivedAt: '2026-11-14', _archivedAuto: true };
  const det = (baux, histo, lot = { ref: 'A1' }) => { const DB = dbDe(baux); DB.baux_historique = histo; return monter(DB, STATUT).fn._dgDetenusDuLot(lot); };
  it('la même archive deux fois (même bailHistCle) : un seul dépôt de 900 €', () => {
    expect(det({}, [{ ...LEA }, { ...LEA }])).toEqual([900]);
  });
  it('doublon dont une copie porte la restitution : rendu (0 dépôt) ; copie supprimée ignorée', () => {
    expect(det({}, [{ ...LEA }, { ...LEA, dgRestitueAt: '2026-10-20' }])).toEqual([]);
    expect(det({}, [{ ...LEA }, { ...LEA, _deleted: true }])).toEqual([900]);
  });
  it('bail COURANT clôturé (non tombstone) au dépôt nul : jamais le repli sur le dépôt de la fiche du lot', () => {
    expect(det({ A1: { ...BAIL, ref: 'A1', dg: 0, cloture: true } }, [], { ref: 'A1', dg: 500 })).toEqual([]);
    expect(det({ A1: { ...BAIL, ref: 'A1', dg: 0 } }, [], { ref: 'A1', dg: 500 })).toEqual([500]);
  });
  it('bandeau PC (VRAI _renderPilotage) : « 1 dépôt » au singulier', () => {
    const DB = dbDe({ B2: { ...BAIL, dg: 400 } });
    const { fn, els } = monter(DB, [...STATUT, '_renderPilotage']);
    try { fn._renderPilotage({ scopeLogs: DB.logements, yr: '2026', mo: null, activeEnt: '' }); } catch (e) { /* bulles non simulées */ }
    expect(els['pil-strip'].innerHTML).toContain('1 dépôt · argent des locataires');
  });
});
describe('27 · échéance du dépôt (VRAI _departDeadlineDG) : EDL de sortie de CE bail, date locale', () => {
  const LEA = { ...DEPART, ref: 'A1', finEffective: '2026-09-30', _archivedAt: '2026-11-14', _archivedAuto: true };
  const NINA = { ref: 'A1', type: 'nu', debut: '2026-11-15', hc: 650, ch: 50, dg: 1300 };
  const EDL = (date, conforme) => ({ id: 'e' + date, logement: 'A1', type: 'Sortie', date, pieces: [{ elements: [{ etatE: 'Bon état', etatS: conforme ? 'Bon état' : 'Mauvais état' }] }] });
  const echeance = (edl, extra = {}) => {
    const DB = dbDe({ A1: { ...NINA } }); DB.baux_historique = [{ ...LEA }]; DB.edl = edl;
    const m = monter(DB, [...STATUT, '_departDeadlineDG', '_edlSortieDuBail', '_edlsDuBail', '_bailSuivantDebut', '_calculerDelaiRestitution'], {
      _isoLocal: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), ...extra,
    });
    return m.fn._departDeadlineDG(DB.baux_historique[0]);
  };
  it('sortie de Lea conforme (30/09) : 1 mois → 30/10 ; l\'EDL de sortie de Nina (2027) n\'est jamais celui de Lea', () => {
    expect(echeance([EDL('2026-09-30', true)])).toMatchObject({ iso: '2026-10-30', mois: 1, provisional: false });
    expect(echeance([EDL('2027-01-10', true)])).toMatchObject({ iso: '2026-11-30', mois: 2, provisional: true });
  });
  it('jours restants comptés à la date LOCALE (_todayIsoLocal), pas td() (UTC)', () => {
    const d = echeance([], { _todayIsoLocal: () => '2026-10-06', td: () => '2026-10-05' });
    expect(d.jours).toBe(55);
  });
});
describe('28 · fenêtre de restitution sur le bail archivé (VRAIS _dgOpenRestitution / _dgRestitRecalc) : chiffres de CE bail', () => {
  const LEA = { ...DEPART, ref: 'A1', finEffective: '2026-09-30', _archivedAt: '2026-11-14', _archivedAuto: true, locataires: [{ nom: 'Lea' }] };
  const NINA = { ref: 'A1', type: 'nu', debut: '2026-11-15', hc: 650, ch: 50, dg: 1300, locataires: [{ nom: 'Nina' }] };
  const ouvrir = (edl) => {
    const DB = dbDe({ A1: { ...NINA } }); DB.baux_historique = [{ ...LEA }]; DB.edl = edl;
    const vals = { 'dg-restit-autres': '0', 'dg-restit-date': '' };
    const m = monter(DB, [...STATUT, '_dgOpenRestitution', '_dgBailCible', '_dgRestitRecalc', '_calculerDelaiRestitution', '_edlsDuBail', '_bailSuivantDebut'], {
      v: (id) => vals[id] || '', _dgVgRows: [], _dgVgCtx: {}, _dgVgSeedFromEdl: () => [], _dgVgRender: () => {},
      _calculerSoldeDG: (b) => ({ soldeRestitue: Number(b.dgPaid || b.dg) - Number(b.dgRetenu || 0), loyerImpaye: 0 }),
      _dgStatut: () => ({ statut: 'a_restituer' }),
      window: { computeVetusteTotal: () => ({ total: 0 }), _penaliteRetardDG: () => ({ penalite: 0, enRetard: false }) },
    });
    m.fn._dgOpenRestitution('A1', bailHistCle(DB.baux_historique[0]));
    m.fn._dgRestitRecalc('A1');
    return m.els;
  };
  it('recalcul du solde sur le dépôt de Lea (900 €), jamais celui de Nina (1 300 €)', () => {
    expect(ouvrir([])['dg-restit-solde-display'].textContent).toBe('900 €');
  });
  it('délai légal : l\'EDL de sortie de Nina (2027, avec dégradations) n\'est pas celui de Lea', () => {
    const nina = { id: 'en', logement: 'A1', type: 'Sortie', date: '2027-01-10', pieces: [{ elements: [{ etatE: 'Bon état', etatS: 'Mauvais état' }] }] };
    expect(ouvrir([nina])['ov-dg-restitution-body'].innerHTML).toContain('Délai légal : <strong>1 mois</strong>');
  });
});
describe('29 · cible de la restitution (VRAIS _dgBailCible / _dgConfirmerRestitution) : cas limites', () => {
  const LEA = { ...DEPART, ref: 'A1', finEffective: '2026-09-30', _archivedAt: '2026-01-14', _archivedAuto: true, locataires: [{ nom: 'Lea' }] };
  const NINA = { ref: 'A1', type: 'nu', debut: '2026-01-15', hc: 650, ch: 50, dg: 1300, locataires: [{ nom: 'Nina' }] };
  const cible = (baux, histo) => { const DB = dbDe(baux); DB.baux_historique = histo; return monter(DB, [...STATUT, '_dgBailCible']).fn._dgBailCible('A1', ''); };
  it('bail en cours AVEC départ déclaré + archive en attente, sans clé : la cible est le bail en cours (Nina)', () => {
    const c = cible({ A1: { ...NINA, depart: { dateSortie: '2026-10-31' } } }, [{ ...LEA }]);
    expect(c.bail.locataires[0].nom).toBe('Nina');
  });
  it('bail en cours SANS départ + archive en attente : l\'archive (Lea)', () => {
    expect(cible({ A1: { ...NINA } }, [{ ...LEA }]).bail.locataires[0].nom).toBe('Lea');
  });
  it('tombstone sans archive en attente : aucune cible (jamais le tombstone)', () => {
    expect(cible({ A1: { ref: 'A1', _deleted: true } }, [{ ...LEA, dgRestitueAt: '2026-10-20' }])).toBe(null);
  });
  it('_dgConfirmerRestitution sur une cible devenue tombstone : refus, rien n\'est écrit', () => {
    const DB = dbDe({ A1: { ref: 'A1', _deleted: true } });
    const tomb = DB.baux.A1;
    const m = monter(DB, [...STATUT, '_dgConfirmerRestitution', '_dgBailCible'], {
      _dgRestitCible: { ref: 'A1', bail: tomb, cle: '' }, v: () => '2026-10-20', _dgVgRows: [], confirm2: () => true, saveDB: () => {}, _stamp: () => {},
      _calculerSoldeDG: () => ({ soldeRestitue: 900, loyerImpaye: 0 }), window: { computeVetusteTotal: () => ({ total: 0 }), _penaliteRetardDG: () => ({ penalite: 0 }) },
    });
    m.els['ov-dg-restitution-ref'] = { value: 'A1' };
    m.fn._dgConfirmerRestitution();
    expect(tomb).toEqual({ ref: 'A1', _deleted: true });
    expect(m.base._toasts[0]).toContain('Bail introuvable');
  });
});
describe('30 · « Créer le bail » sur un lot sans bail vivant (VRAI openBail, fiche et fil rouge) : un NOUVEAU bail', () => {
  const docStub = () => ({ querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }) });
  const lancer = (baux, appel) => {
    const DB = dbDe(baux);
    DB.logements[0].debut = '2023-07-01'; DB.logements[0].fin = '2026-09-30';
    const E = {};
    const elX = (id) => (E[id] = E[id] || { id, value: '', innerHTML: '', textContent: '', style: {}, dataset: {}, disabled: false, checked: false, options: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, querySelectorAll: () => [], querySelector: () => null, appendChild() {} });
    const m = monter(DB, [...STATUT, 'openBail', 'onBailRefChange', '_ouvrirNouveauBailSurLot', '_frConfirmBail', '_frCompAction', '_isoDecaleJours', '_bailFinOccupation'], {
      el: elX, document: docStub(), _activeLogements: () => DB.logements, sortedIRLKeys: () => ['T1 2026'], getIRLRefForDate: () => 'T1 2023',
      _bailIsEdit: false, _readLogForBail: () => ({}), _TU2BT: {}, _bailLegacyToGarants: () => [],
      _frCtx: { bailRef: 'A1' }, _frClose: () => {}, _frCompGuard: (f) => f(),
    });
    elX('fr-bail-log').value = 'A1';
    try { appel(m.fn); } catch (e) { m.base.__err = e.message; }
    return { E, err: m.base.__err };
  };
  const TOMB = { A1: { ref: 'A1', _deleted: true } };
  const nouveau = (r) => ({ editRef: r.E['b-edit-ref'] && r.E['b-edit-ref'].value, ref: r.E['b-ref'] && r.E['b-ref'].value, debut: r.E['b-debut'].value, fin: r.E['b-fin'].value });
  it('fiche « + Créer le bail » → openBail(ref) sur un lot clôturé : nouveau bail (pas d\'édition, ni les dates de l\'ancien)', () => {
    expect(nouveau(lancer(TOMB, (fn) => fn.openBail('A1')))).toEqual({ editRef: '', ref: 'A1', debut: '', fin: '' });
  });
  it('fil rouge _frConfirmBail et « creer-bail » (_frCompAction) : idem', () => {
    expect(nouveau(lancer(TOMB, (fn) => fn._frConfirmBail()))).toEqual({ editRef: '', ref: 'A1', debut: '', fin: '' });
    expect(nouveau(lancer({}, (fn) => fn._frCompAction('creer-bail', 'A1')))).toEqual({ editRef: '', ref: 'A1', debut: '', fin: '' });
  });
  it('bail vivant : openBail(ref) reste l\'édition de CE bail', () => {
    const r = lancer({ A1: BAIL }, (fn) => fn.openBail('A1'));
    expect(r.E['b-edit-ref'].value).toBe('A1');
    expect(r.E['b-debut'].value).toBe(BAIL.debut);
  });
});
describe('31 · deux archives du même lot le MÊME jour (relocation puis clôture) : identifiant d\'archive dès l\'archivage', () => {
  // VRAIS archiverBail (relocation de Lea) puis saveBailClore (clôture de Nina, sans virement) le même jour.
  const scenario = () => {
    const DB = dbDe({ A1: { ...DEPART, ref: 'A1' } });
    let n = 0;
    const vals = { 'b-clore-ref': 'A1', 'b-fin-effective': '2026-11-20', 'b-fin-motif': 'Congé du locataire', 'dg-restit-date': '2026-11-20' };
    const m = monter(DB, [...STATUT, 'archiverBail', '_archiverDansHistorique', '_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation',
      'saveBailClore', '_clotureDgConfirmer', '_clotureDgAppliquer', '_dgBailCible', '_dgConfirmerRestitution', '_computeUnifiedTodo', '_departDeadlineDG', '_edlSortieDuBail', '_edlsDuBail', '_bailSuivantDebut'], {
      window: { nouvelIdArchive: () => 'id' + (++n), computeVetusteTotal: () => ({ total: 0 }), _penaliteRetardDG: () => ({ penalite: 0 }) },
      _baremeCloturerLot: () => {}, saveDB: () => {}, rBaux: () => {}, _gmbiAlerterSortie: () => {}, confirm2: () => true, _stamp: () => {}, _ART22_RESTITUTION: ['a', 'b'],
      v: (id) => vals[id] || '', pf: () => 0, _dgVgRows: [], _calculerSoldeDG: (b) => ({ soldeRestitue: Number(b.dg), loyerImpaye: 0 }),
      _departState: () => null, AlertRules: new Proxy({}, { get: () => () => [] }), EQUIP_RULES: [], _DIAGS_CATALOG_INLINE: [],
      _isoLocal: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    });
    m.fn.archiverBail('A1', '2026-11-15');
    DB.baux.A1 = { ref: 'A1', type: 'nu', debut: '2026-11-15', hc: 650, ch: 50, dg: 1300, locataires: [{ nom: 'Nina' }] };
    m.els['b-clore-ref'] = { value: 'A1' };
    m.fn.saveBailClore();
    return { DB, m };
  };
  it('chaque archive a son identifiant : deux clés distinctes, dépôts [900, 1 300], deux tâches', () => {
    const { DB, m } = scenario();
    expect(DB.baux_historique.map((h) => h._archiveId)).toEqual(['id1', 'id2']);
    const cles = DB.baux_historique.map((h) => bailHistCle(h));
    expect(cles[0]).not.toBe(cles[1]);
    expect(m.fn._dgDetenusDuLot(DB.logements[0])).toEqual([900, 1300]);
    const t = (m.fn._computeUnifiedTodo({ scopeLogs: [DB.logements[0]] }) || []).filter((x) => x && x.type === 'depart');
    expect(t.map((x) => x.actionFn)).toEqual(cles.map((c) => `_dgOpenRestitution('A1','${c}')`));
  });
  it('la restitution par la clé de Nina vise l\'archive de Nina (pas celle de Lea)', () => {
    const { DB, m } = scenario();
    const cleNina = bailHistCle(DB.baux_historique[1]);
    m.base._dgRestitCible = m.fn._dgBailCible('A1', cleNina);
    expect(m.base._dgRestitCible.bail.locataires[0].nom).toBe('Nina');
    m.els['ov-dg-restitution-ref'] = { value: 'A1' };
    m.fn._dgConfirmerRestitution();
    expect(DB.baux_historique.map((h) => h.dgRestitueAt || null)).toEqual([null, '2026-11-20']);
    expect(m.fn._dgDetenusDuLot(DB.logements[0])).toEqual([900]);
  });
});
