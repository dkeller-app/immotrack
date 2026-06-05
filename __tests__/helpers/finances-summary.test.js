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

describe('_computeFinancesSummary — ratios', () => {
  it('recouvrement = encaisseHC / attenduHC en %, 1 décimale', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.ratios.recouvrement).toBeCloseTo(98.3, 1); // 86800/88280
  });
  it('occupation = nbOcc / nbTotal en % entier', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.ratios.occupation).toBe(86); // 12/14
  });
  it('poids des charges = totalCharges / loyersHC en %, 1 décimale', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.ratios.poidsCharges).toBeCloseTo(37.0, 1); // 32100/86800
  });
  it('ratios bornés et sans division par zéro', () => {
    const r = _computeFinancesSummary({ nbTotal: 0, attenduHC: 0, loyersHC: 0 });
    expect(r.ratios.recouvrement).toBe(0);
    expect(r.ratios.occupation).toBe(0);
    expect(r.ratios.poidsCharges).toBe(0);
  });
});
