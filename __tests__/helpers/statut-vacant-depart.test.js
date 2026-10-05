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
const STATUT = ['_bienActiveBail', '_bienIsBailActif', '_lotStatutLibelle', '_lotEstLoue', '_lotBailOuvert', '_logementsVacants', '_dgDuLot', '_dgDetenuDuLot'];

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
