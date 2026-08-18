/**
 * Tests pour UX-GROUP-BY-IMMEUBLE v15.76.
 * Module js/core/group-by-imm.js — helpers purs groupage logements par immeuble.
 */
import { describe, it, expect } from 'vitest';
import {
  _groupLogementsByImm, _computeIRLGroupKPIs,
  _groupLogementsByEntite, _grouperLotsParBailleurEtImmeuble
} from '../../js/core/group-by-imm.js';

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

// ═══════════════════════════════════════════════════════════════════════════
//  Groupage à DEUX niveaux — bailleur puis immeuble (décision user 18/08)
// ═══════════════════════════════════════════════════════════════════════════

describe('_groupLogementsByEntite', () => {
  const logs = [
    { ref: 'A', entity: 'SCI Delle' },
    { ref: 'B', entity: 'SCI Ferrette' },
    { ref: 'C', entity: 'SCI Delle' },
    { ref: 'D', entity: '' },
    { ref: 'E' }
  ];
  it('groupe par bailleur, trié en français', () => {
    const out = _groupLogementsByEntite(logs);
    expect(out.map(g => g.key)).toEqual(['SCI Delle', 'SCI Ferrette', '__sans_bailleur__']);
    expect(out[0].logements.map(l => l.ref)).toEqual(['A', 'C']);
  });
  it('les lots sans bailleur restent VISIBLES dans un panier explicite, en dernier', () => {
    const out = _groupLogementsByEntite(logs);
    const panier = out[out.length - 1];
    expect(panier.isUnassigned).toBe(true);
    expect(panier.logements.map(l => l.ref)).toEqual(['D', 'E']);
    // Invariant : aucun lot ne disparaît.
    expect(out.reduce((n, g) => n + g.logements.length, 0)).toBe(logs.length);
  });
  it('entrée invalide → tableau vide', () => {
    expect(_groupLogementsByEntite(null)).toEqual([]);
    expect(_groupLogementsByEntite([])).toEqual([]);
  });
});

describe('_grouperLotsParBailleurEtImmeuble', () => {
  const logs = [
    { ref: 'A', entity: 'SCI Delle', imm: 'Damelevières' },
    { ref: 'B', entity: 'SCI Delle', imm: 'Delle' },
    { ref: 'C', entity: 'SCI Ferrette', imm: 'Ferrette' },
    { ref: 'D', entity: 'SCI Delle' },              // sans immeuble
    { ref: 'E', imm: 'Orphelin' }                    // sans bailleur
  ];

  it('« Toutes » les SCI → deux niveaux : bailleur, puis immeuble', () => {
    const out = _grouperLotsParBailleurEtImmeuble(logs, { parBailleur: true });
    expect(out.map(g => g.key)).toEqual(['SCI Delle', 'SCI Ferrette', '__sans_bailleur__']);
    expect(out[0].immeubles.map(i => i.key)).toEqual(['Damelevières', 'Delle', '__unassigned__']);
  });

  it('une seule SCI sélectionnée → un seul niveau, les immeubles', () => {
    const dansUneSci = logs.filter(l => l.entity === 'SCI Delle');
    const out = _grouperLotsParBailleurEtImmeuble(dansUneSci, { parBailleur: false });
    expect(out).toHaveLength(1);
    expect(out[0].entite).toBeNull();
    expect(out[0].immeubles.map(i => i.key)).toEqual(['Damelevières', 'Delle', '__unassigned__']);
  });

  it('aucun lot ne disparaît, quel que soit le mode', () => {
    for (const parBailleur of [true, false]) {
      const out = _grouperLotsParBailleurEtImmeuble(logs, { parBailleur });
      const n = out.reduce((s, g) => s + g.immeubles.reduce((s2, i) => s2 + i.logements.length, 0), 0);
      expect(n).toBe(logs.length);
    }
  });

  it('le niveau immeuble délègue bien à _groupLogementsByImm (même tri, même panier)', () => {
    const out = _grouperLotsParBailleurEtImmeuble(logs, { parBailleur: false });
    expect(out[0].immeubles).toEqual(_groupLogementsByImm(logs));
  });

  it('liste vide → tableau vide', () => {
    expect(_grouperLotsParBailleurEtImmeuble([], { parBailleur: true })).toEqual([]);
    expect(_grouperLotsParBailleurEtImmeuble([], { parBailleur: false })).toEqual([]);
    expect(_grouperLotsParBailleurEtImmeuble(null, { parBailleur: false })).toEqual([]);
  });
});
