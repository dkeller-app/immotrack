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
    DB, window: { bailLoueAu, finOccupationBail, ...(extra.window || {}) },
    _todayIsoLocal: () => AUJ, td: () => AUJ, fd: (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : ''),
    escHtml: (x) => String(x == null ? '' : x), _isAlive: (x) => !!x && !x._deleted, fmt: (n) => String(Math.round(n || 0)) + ' €',
    el: (id) => (els[id] = els[id] || { id, value: '', innerHTML: '', textContent: '', style: {}, classList: { contains: () => false } }),
    showToast: (m) => { (base._toasts = base._toasts || []).push(m); }, confirm2: () => false,
    _isPhone: () => false, _PIL_MTX_COLS: [], Math, JSON, Number, String, Object, Array, Set, Map, Date, parseInt, parseFloat, isNaN,
    ...extra,
  };
  base.window = { bailLoueAu, finOccupationBail, ...(extra.window || {}) };   // `extra.window` complète, n'écrase pas
  const scope = new Proxy(base, {
    has: (t, k) => typeof k === 'string' && !decl.has(k),
    get: (t, k) => (k in t ? t[k] : (k in globalThis ? globalThis[k] : () => '')),
  });
  // eslint-disable-next-line no-new-func
  const fn = new Function('scope', 'with (scope) {\n' + noms.map(corps).join('\n') + '\nreturn {' + noms.join(',') + '};\n}')(scope);
  return { fn, base, els, html };
}
const STATUT = ['_bienActiveBail', '_bienIsBailActif', '_lotStatutLibelle', '_lotEstLoue', '_lotBailOuvert', '_logementsVacants', '_dgDuLot', '_dgDetenuDuLot', '_dgDetenuDuBail', '_dgRestitutionEnregistree'];

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
    expect(tuile({ A1: DEPART })).toContain('1 dépôts');
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
    const m = monter(DB, [...STATUT, 'archiverBail', '_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation'], {
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
    expect(fn._finAncienBailAuRebail({ ...BAIL, depart: { dateSortie: '2026-11-15' } }, '2026-11-15')).toEqual({ fin: '2026-11-14', sortie: '2026-11-15', sortieApres: true });
    expect(fn._finAncienBailAuRebail({ ...BAIL, depart: { dateSortie: '2026-11-14' } }, '2026-11-15')).toEqual({ fin: '2026-11-14', sortie: '2026-11-14', sortieApres: false });
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
    const m = monter(DB, [...STATUT, 'archiverBail', '_finAncienBailAuRebail', '_isoDecaleJours', '_bailFinOccupation', '_computeUnifiedTodo', '_departDeadlineDG'], {
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
    expect(t.actionFn).toBe('openBailHist(0)');
  });
});

describe('15 · clôture d\'un bail (VRAIS saveBailClore / terminerBail) : restitution du dépôt', () => {
  const clore = (fnNom, saisie, rep = true) => {
    const DB = dbDe({ A1: { ...DEPART, ref: 'A1' } });
    const msgs = [];
    const vals = { 'b-clore-ref': 'A1', 'b-ref': 'A1', 'b-fin-effective': '2026-09-30', 'b-fin-motif': 'Congé du locataire' };
    const m = monter(DB, [...STATUT, fnNom, '_clotureDgConfirmer', '_clotureDgAppliquer'], {
      v: (id) => vals[id] || '', pf: (id) => Number(saisie[id] || 0), confirm2: (t) => { msgs.push(t); return msgs.length === 1 ? true : rep; },
      _ART22_RESTITUTION: ['« art22-2mois »', '« art22-1mois »'], _baremeCloturerLot: () => {}, saveDB: () => {}, rBaux: () => {}, _gmbiAlerterSortie: () => {},
    });
    m.els['b-clore-ref'] = { value: 'A1' };
    m.fn[fnNom]();
    return { DB, msgs };
  };
  for (const fnNom of ['saveBailClore', 'terminerBail']) {
    it(fnNom + ' sans restitution saisie : avertit (art. 22), ne bloque pas ; le dépôt reste détenu (bail archivé)', () => {
      const { DB, msgs } = clore(fnNom, {});
      expect(msgs[1]).toContain('art22-2mois');
      expect(msgs[1]).toContain('900 €');
      expect(DB.baux.A1._deleted).toBe(true);
      expect(DB.baux_historique[0].dgRestitueAt).toBeFalsy();
      expect(monter(DB, STATUT).fn._dgDetenuDuLot({ ref: 'A1' })).toBe(900);
    });
    it(fnNom + ' : renoncer à l\'avertissement n\'archive rien', () => {
      const { DB } = clore(fnNom, {}, false);
      expect(DB.baux.A1._deleted).toBeFalsy();
      expect(DB.baux_historique).toEqual([]);
    });
    it(fnNom + ' avec restitution saisie : pas d\'avertissement, dgRestitueAt posé (date de saisie), plus détenu', () => {
      const { DB, msgs } = clore(fnNom, { 'b-dg-restitue': 780, 'b-dg-retenu': 120 });
      expect(msgs).toHaveLength(1);
      expect(DB.baux_historique[0].dgRestitueAt).toBe(AUJ);
      expect(monter(DB, STATUT).fn._dgDetenuDuLot({ ref: 'A1' })).toBe(0);
    });
  }
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
    const m = monter(DB, [...STATUT, '_computeUnifiedTodo', '_departDeadlineDG'], {
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
