/**
 * Tests pour UX-GROUP-BY-IMMEUBLE v15.76.
 * Module js/core/group-by-imm.js — helpers purs groupage logements par immeuble.
 */
import { describe, it, expect } from 'vitest';
import { _groupLogementsByImm, _computeIRLGroupKPIs } from '../../js/core/group-by-imm.js';

// ═══════════════════════════════════════════════════════════════════
//  _groupLogementsByImm
// ═══════════════════════════════════════════════════════════════════

describe('_groupLogementsByImm — groupage et tri', () => {
  it('groupe par champ imm, tri alpha FR', () => {
    const logs = [
      { ref: 'A101', imm: 'Bâtiment B' },
      { ref: 'A102', imm: 'Bâtiment A' },
      { ref: 'A103', imm: 'Bâtiment B' },
    ];
    const out = _groupLogementsByImm(logs);
    expect(out.map(g => g.imm)).toEqual(['Bâtiment A', 'Bâtiment B']);
    expect(out[0].logements.length).toBe(1);
    expect(out[1].logements.length).toBe(2);
  });

  it('ordre naturel (numérique) : "Imm 2" avant "Imm 10"', () => {
    const logs = [
      { ref: 'A', imm: 'Imm 10' },
      { ref: 'B', imm: 'Imm 2' },
      { ref: 'C', imm: 'Imm 1' },
    ];
    const out = _groupLogementsByImm(logs);
    expect(out.map(g => g.imm)).toEqual(['Imm 1', 'Imm 2', 'Imm 10']);
  });

  it('conserve l\'ordre d\'origine à l\'intérieur d\'un groupe', () => {
    const logs = [
      { ref: 'Z', imm: 'A' },
      { ref: 'A', imm: 'A' },
      { ref: 'M', imm: 'A' },
    ];
    const out = _groupLogementsByImm(logs);
    expect(out[0].logements.map(l => l.ref)).toEqual(['Z', 'A', 'M']);
  });
});

describe('_groupLogementsByImm — bucket "sans immeuble"', () => {
  it('logements sans imm → bucket isUnassigned en dernier', () => {
    const logs = [
      { ref: 'A', imm: 'Bât A' },
      { ref: 'B' }, // pas d'imm
      { ref: 'C', imm: '' }, // imm vide
      { ref: 'D', imm: '   ' }, // imm spaces
      { ref: 'E', imm: 'Bât B' },
    ];
    const out = _groupLogementsByImm(logs);
    expect(out.length).toBe(3);
    expect(out[0].imm).toBe('Bât A');
    expect(out[1].imm).toBe('Bât B');
    expect(out[2].isUnassigned).toBe(true);
    expect(out[2].key).toBe('__unassigned__');
    expect(out[2].logements.map(l => l.ref)).toEqual(['B', 'C', 'D']);
  });

  it('pas de bucket si aucun unassigned', () => {
    const logs = [{ ref: 'A', imm: 'Bât A' }];
    const out = _groupLogementsByImm(logs);
    expect(out.length).toBe(1);
    expect(out.some(g => g.isUnassigned)).toBe(false);
  });

  it('tout unassigned → 1 seul bucket isUnassigned', () => {
    const logs = [{ ref: 'A' }, { ref: 'B' }];
    const out = _groupLogementsByImm(logs);
    expect(out.length).toBe(1);
    expect(out[0].isUnassigned).toBe(true);
    expect(out[0].logements.length).toBe(2);
  });
});

describe('_groupLogementsByImm — robustesse', () => {
  it('liste vide → []', () => {
    expect(_groupLogementsByImm([])).toEqual([]);
  });
  it('non-array → []', () => {
    expect(_groupLogementsByImm(null)).toEqual([]);
    expect(_groupLogementsByImm(undefined)).toEqual([]);
    expect(_groupLogementsByImm({ ref: 'A' })).toEqual([]);
  });
  it('ignore les entrées nulles', () => {
    const logs = [{ ref: 'A', imm: 'X' }, null, undefined, { ref: 'B', imm: 'X' }];
    const out = _groupLogementsByImm(logs);
    expect(out.length).toBe(1);
    expect(out[0].logements.length).toBe(2);
  });
  it('chaque groupe expose key + imm + isUnassigned', () => {
    const out = _groupLogementsByImm([{ ref: 'A', imm: 'X' }]);
    expect(out[0]).toMatchObject({ key: 'X', imm: 'X', isUnassigned: false });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _computeIRLGroupKPIs
// ═══════════════════════════════════════════════════════════════════

describe('_computeIRLGroupKPIs — calcul KPI', () => {
  it('nb lots + loyer total HC', () => {
    const group = { logements: [{ hc: 650 }, { hc: 720 }, { hc: 580 }] };
    const kpis = _computeIRLGroupKPIs(group);
    expect(kpis.nbLots).toBe(3);
    expect(kpis.loyerTotalHC).toBe(1950);
  });

  it('arrondi 2 décimales sur loyer total', () => {
    const group = { logements: [{ hc: 100.333 }, { hc: 50.667 }] };
    const kpis = _computeIRLGroupKPIs(group);
    expect(kpis.loyerTotalHC).toBe(151);
  });

  it('ignore hc non numérique ou Infinity', () => {
    const group = { logements: [{ hc: 500 }, { hc: 'oops' }, { hc: Infinity }, { hc: null }] };
    const kpis = _computeIRLGroupKPIs(group);
    expect(kpis.loyerTotalHC).toBe(500);
    expect(kpis.nbLots).toBe(4); // nbLots compte tous les logements du groupe
  });
});

describe('_computeIRLGroupKPIs — alertes via computeRevisionFn', () => {
  it('compte gelDpeFG + insuffisant + dpeManquant', () => {
    const group = {
      logements: [
        { ref: 'A' }, { ref: 'B' }, { ref: 'C' }, { ref: 'D' }, { ref: 'E' },
      ],
    };
    const fn = (l) => {
      if (l.ref === 'A') return { gelDpeFG: true };
      if (l.ref === 'B') return { insuffisant: true };
      if (l.ref === 'C') return { dpeManquant: true };
      if (l.ref === 'D') return { isApplicable: true };
      return null;
    };
    const kpis = _computeIRLGroupKPIs(group, fn);
    expect(kpis.nbAlertesGel).toBe(1);
    expect(kpis.nbInsuffisant).toBe(1);
    expect(kpis.nbDpeManquant).toBe(1);
  });

  it('sans fn → seulement nbLots + loyerTotalHC, alertes à 0', () => {
    const group = { logements: [{ hc: 100 }] };
    const kpis = _computeIRLGroupKPIs(group);
    expect(kpis).toEqual({ nbLots: 1, loyerTotalHC: 100, nbAlertesGel: 0, nbInsuffisant: 0, nbDpeManquant: 0 });
  });
});

describe('_computeIRLGroupKPIs — robustesse', () => {
  it('group null → KPIs vides', () => {
    expect(_computeIRLGroupKPIs(null)).toEqual({ nbLots: 0, loyerTotalHC: 0, nbAlertesGel: 0, nbInsuffisant: 0, nbDpeManquant: 0 });
  });
  it('group sans logements → vide', () => {
    expect(_computeIRLGroupKPIs({}).nbLots).toBe(0);
  });
  it('logements vide → tous 0', () => {
    expect(_computeIRLGroupKPIs({ logements: [] }).nbLots).toBe(0);
  });
});
