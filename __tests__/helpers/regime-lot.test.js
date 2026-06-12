import { describe, it, expect } from 'vitest';
import { MEUBLE_TYPES, lotRegimeForYear, splitFonciereLots } from '../../js/core/regime-lot.js';

// Helpers de fabrication de baux (un bail = { type, debut, fin })
const nu      = (debut, fin) => ({ type: 'nu',       debut, fin });
const meuble  = (debut, fin) => ({ type: 'meuble',   debut, fin });
const Y = 2026;

describe('lotRegimeForYear — éligibilité 2044 (foncier nu) d\'un lot selon la nature de ses baux', () => {

  it('MEUBLE_TYPES couvre meuble + etudiant + mobilite', () => {
    expect(MEUBLE_TYPES).toEqual(expect.arrayContaining(['meuble', 'etudiant', 'mobilite']));
    expect(MEUBLE_TYPES).not.toContain('nu');
    expect(MEUBLE_TYPES).not.toContain('garage');
  });

  it('lot loué nu toute l\'année → relève du foncier (2044)', () => {
    const r = lotRegimeForYear({ currentBail: nu('2024-01-01', null), histoBails: [], year: Y });
    expect(r.fonciere).toBe(true);
    expect(r.mode).toBe('nu');
    expect(r.flag).toBeNull();
  });

  it('lot loué meublé → EXCLU du 2044 (relève du BIC)', () => {
    const r = lotRegimeForYear({ currentBail: meuble('2024-01-01', null), histoBails: [], year: Y });
    expect(r.fonciere).toBe(false);
    expect(r.mode).toBe('meuble');
  });

  it('bail étudiant et bail mobilité comptent comme meublé (exclus)', () => {
    expect(lotRegimeForYear({ currentBail: { type: 'etudiant', debut: '2026-01-01' }, histoBails: [], year: Y }).fonciere).toBe(false);
    expect(lotRegimeForYear({ currentBail: { type: 'mobilite', debut: '2026-01-01' }, histoBails: [], year: Y }).fonciere).toBe(false);
  });

  it('garage (location nue) → reste au foncier', () => {
    const r = lotRegimeForYear({ currentBail: { type: 'garage', debut: '2024-01-01' }, histoBails: [], year: Y });
    expect(r.fonciere).toBe(true);
    expect(r.mode).toBe('nu');
  });

  it('type de bail absent → défaut nu (foncier), pas d\'exclusion silencieuse', () => {
    const r = lotRegimeForYear({ currentBail: { debut: '2024-01-01' }, histoBails: [], year: Y });
    expect(r.fonciere).toBe(true);
    expect(r.mode).toBe('nu');
  });

  it('lot vacant (aucun bail chevauchant l\'année) → foncier par défaut', () => {
    const r = lotRegimeForYear({ currentBail: null, histoBails: [], year: Y });
    expect(r.fonciere).toBe(true);
    expect(r.mode).toBe('vacant');
  });

  it('bail terminé AVANT l\'année déclarée → ignoré (vacant)', () => {
    const r = lotRegimeForYear({ currentBail: null, histoBails: [meuble('2023-01-01', '2024-06-30')], year: Y });
    expect(r.mode).toBe('vacant');
    expect(r.fonciere).toBe(true);
  });

  it('meublé toute l\'année via historique (sans bail courant) → exclu', () => {
    const r = lotRegimeForYear({ currentBail: null, histoBails: [meuble('2025-01-01', '2026-12-31')], year: Y });
    expect(r.fonciere).toBe(false);
    expect(r.mode).toBe('meuble');
  });

  it('MIXTE : nu en début d\'année puis meublé → inclus MAIS flagué (on ne perd pas la part nue)', () => {
    const r = lotRegimeForYear({
      currentBail: meuble('2026-07-01', null),
      histoBails: [nu('2024-01-01', '2026-06-30')],
      year: Y
    });
    expect(r.mode).toBe('mixte');
    expect(r.fonciere).toBe(true);   // la part nue reste déclarée
    expect(r.flag).toBeTruthy();     // la part meublée est signalée « à retirer »
  });

});

describe('splitFonciereLots — répartit un scope de lots entre foncier / exclus / flagués', () => {
  const baux = {
    'L-NU':   { type: 'nu',      debut: '2024-01-01' },
    'L-MEUB': { type: 'meuble',  debut: '2024-01-01' },
    'L-GAR':  { type: 'garage',  debut: '2024-01-01' },
    'L-MIX':  { type: 'meuble',  debut: '2026-07-01' }  // mixte avec l'historique nu ci-dessous
  };
  const bauxHisto = [
    { logement: 'L-MIX', type: 'nu', debut: '2024-01-01', fin: '2026-06-30' }
  ];
  const logements = [{ ref: 'L-NU' }, { ref: 'L-MEUB' }, { ref: 'L-GAR' }, { ref: 'L-MIX' }, { ref: 'L-VAC' }];

  it('garde nu/garage/mixte/vacant en foncier, exclut le meublé pur', () => {
    const r = splitFonciereLots(logements, { baux, bauxHisto, year: 2026 });
    expect([...r.fonciereRefs].sort()).toEqual(['L-GAR', 'L-MIX', 'L-NU', 'L-VAC']);
    expect(r.exclus).toEqual([{ ref: 'L-MEUB', mode: 'meuble' }]);
    expect(r.flagues.map(f => f.ref)).toEqual(['L-MIX']);
    expect(r.flagues[0].msg).toMatch(/meubl/i);
  });

  it('scope vide → tout vide, pas de plantage', () => {
    const r = splitFonciereLots([], { baux, bauxHisto, year: 2026 });
    expect(r.fonciereRefs).toEqual([]);
    expect(r.exclus).toEqual([]);
    expect(r.flagues).toEqual([]);
  });

  it('sans données de baux → tous foncier par défaut (jamais d\'exclusion silencieuse)', () => {
    const r = splitFonciereLots([{ ref: 'A' }, { ref: 'B' }], { year: 2026 });
    expect(r.fonciereRefs).toEqual(['A', 'B']);
    expect(r.exclus).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FORMES RÉELLES (export immotrack-2026-06-09) : bail.type vide sur 22/24 baux ;
// la nature meublé vient de logement.typeUsage ; baux_historique porte .ref (pas .logement).
// (Audit code-reviewer CRITIQUE 1 & 2.)
// ════════════════════════════════════════════════════════════════════════════
describe('Données réelles — nature via logement.typeUsage quand bail.type est absent', () => {
  it('bail SANS type + logement meublé (typeUsage) → EXCLU (cas réel « RDC gauche »)', () => {
    const r = lotRegimeForYear({ currentBail: { debut: '2024-01-01' }, logement: { typeUsage: 'habitation-meuble' }, year: Y });
    expect(r.fonciere).toBe(false);
    expect(r.mode).toBe('meuble');
  });

  it('bail SANS type + logement habitation-nu → foncier', () => {
    const r = lotRegimeForYear({ currentBail: { debut: '2024-01-01' }, logement: { typeUsage: 'habitation-nu' }, year: Y });
    expect(r.fonciere).toBe(true);
    expect(r.mode).toBe('nu');
  });

  it('bail.type explicite PRIME sur le typeUsage du logement', () => {
    const r = lotRegimeForYear({ currentBail: { type: 'nu', debut: '2024-01-01' }, logement: { typeUsage: 'habitation-meuble' }, year: Y });
    expect(r.fonciere).toBe(true);
  });

  it('garage (typeUsage) → reste foncier', () => {
    const r = lotRegimeForYear({ currentBail: { debut: '2024-01-01' }, logement: { typeUsage: 'garage' }, year: Y });
    expect(r.fonciere).toBe(true);
  });

  it('local-pro / autre → foncier MAIS flagué « à qualifier » (cas réel « Ferrette - Bar »)', () => {
    const r = lotRegimeForYear({ currentBail: { debut: '2024-01-01' }, logement: { typeUsage: 'local-pro' }, year: Y });
    expect(r.fonciere).toBe(true);
    expect(r.mode).toBe('autre');
    expect(r.flag).toBeTruthy();
  });

  it('lot meublé VACANT (aucun bail) connu via typeUsage → exclu (pas faussement foncier)', () => {
    const r = lotRegimeForYear({ currentBail: null, histoBails: [], logement: { typeUsage: 'habitation-meuble' }, year: Y });
    expect(r.fonciere).toBe(false);
  });
});

describe('splitFonciereLots — formes réelles (typeUsage + histo par .ref)', () => {
  it('classe par typeUsage, exclut le meublé, flague local-pro, retrouve l\'histo par .ref', () => {
    const logements = [
      { ref: 'RDC gauche', typeUsage: 'habitation-meuble' },
      { ref: 'Appt 1',     typeUsage: 'habitation-nu' },
      { ref: 'Bar',        typeUsage: 'local-pro' },
      { ref: 'Box',        typeUsage: 'garage' }
    ];
    const baux = { 'RDC gauche': { debut: '2024-01-01' }, 'Appt 1': { debut: '2024-01-01' } }; // pas de .type
    const bauxHisto = [{ ref: 'Box', debut: '2023-01-01', fin: '2026-12-31' }]; // forme réelle : .ref, sans .logement
    const r = splitFonciereLots(logements, { baux, bauxHisto, year: Y });
    expect(r.exclus.map(e => e.ref)).toEqual(['RDC gauche']);
    expect([...r.fonciereRefs].sort()).toEqual(['Appt 1', 'Bar', 'Box']);
    expect(r.flagues.map(f => f.ref)).toEqual(['Bar']);
  });

  it('histo meublé retrouvé par .ref (pas .logement) → mixte détecté', () => {
    const logements = [{ ref: 'L1', typeUsage: 'habitation-nu' }];
    const baux = { 'L1': { type: 'nu', debut: '2026-07-01' } };
    const bauxHisto = [{ ref: 'L1', type: 'meuble', debut: '2024-01-01', fin: '2026-06-30' }];
    const r = splitFonciereLots(logements, { baux, bauxHisto, year: Y });
    expect(r.fonciereRefs).toEqual(['L1']);          // mixte reste au foncier
    expect(r.flagues.map(f => f.ref)).toEqual(['L1']); // mais flagué
  });
});
