import { describe, it, expect } from 'vitest';
import { _computeFinancesSummary } from '../../js/core/finances-summary.js';

const baseInput = {
  loyersHC: 86800, provisions: 14200,
  charges: { interets: 11200, taxeFonciere: 9800, travaux: 6400, honoraires: 3100, assurance: 1600, autres: 0 },
  loyersHCN1: 83200, resultatNetN1: 51500,
  nbOcc: 12, nbTotal: 14,
  attenduHC: 88280, encaisseHC: 86800,
  recuperer: { vacance: 7660, impaye: 1480, irl: 1850, regul: 2200 }
};

describe('_computeFinancesSummary — résultat net', () => {
  it('résultat net = loyers HC − total charges propriétaire', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.totalCharges).toBe(32100);
    expect(r.resultatNet).toBe(54700);
  });
  it('marge nette = résultat net / loyers HC, arrondie au %', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.margePct).toBe(63);
  });
  it('variation vs N-1 en % signé, 1 décimale', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.varPct).toBeCloseTo(6.2, 1);
  });
  it('renvoie des nombres finis, jamais NaN, même avec entrées vides', () => {
    const r = _computeFinancesSummary({});
    expect(Number.isFinite(r.resultatNet)).toBe(true);
    expect(Number.isFinite(r.margePct)).toBe(true);
    expect(r.resultatNet).toBe(0);
  });
  it('expose loyersHCN1 pour la colonne N-1 du compte de résultat', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.loyersHCN1).toBe(83200);
  });
});
