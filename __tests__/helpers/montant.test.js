import { describe, it, expect } from 'vitest';
import { _validateHC, _validateHCCH, _outlierVsMedian } from './montant.js';

describe('_validateHC', () => {
  it('accepte un loyer HC normal', () => {
    const r = _validateHC(650);
    expect(r.valid).toBe(true);
    expect(r.value).toBe(650);
  });

  it('accepte des décimales', () => {
    expect(_validateHC(665.4).valid).toBe(true);
    expect(_validateHC(665.4).value).toBe(665.4);
  });

  it('coerce une string numérique', () => {
    expect(_validateHC('650').valid).toBe(true);
    expect(_validateHC('650').value).toBe(650);
  });

  it('rejette null/undefined/empty string', () => {
    expect(_validateHC(null).valid).toBe(false);
    expect(_validateHC(undefined).valid).toBe(false);
    expect(_validateHC('').valid).toBe(false);
  });

  it('rejette un non-numérique', () => {
    expect(_validateHC('abc').valid).toBe(false);
    expect(_validateHC('abc').reason).toMatch(/non numérique/i);
  });

  it('rejette zéro et négatif', () => {
    expect(_validateHC(0).valid).toBe(false);
    expect(_validateHC(-100).valid).toBe(false);
    expect(_validateHC(-100).reason).toMatch(/négatif/i);
  });

  it('rejette un montant excessif', () => {
    const r = _validateHC(99999);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/excessif/i);
  });

  it('limite haute : accepte 50000, rejette 50001', () => {
    expect(_validateHC(50000).valid).toBe(true);
    expect(_validateHC(50001).valid).toBe(false);
  });
});

describe('_validateHCCH', () => {
  it('accepte CH cohérent (< 50% du HC)', () => {
    const r = _validateHCCH(650, 80);
    expect(r.coherent).toBe(true);
    expect(r.ratio).toBeCloseTo(0.123);
  });

  it('signale CH > 50% du HC', () => {
    const r = _validateHCCH(650, 400);
    expect(r.coherent).toBe(false);
    expect(r.reason).toMatch(/50%/);
  });

  it('signale CH > HC (anormal)', () => {
    const r = _validateHCCH(650, 800);
    expect(r.coherent).toBe(false);
    expect(r.reason).toMatch(/anormal/i);
  });

  it('rejette HC manquant', () => {
    expect(_validateHCCH(0, 100).coherent).toBe(false);
    expect(_validateHCCH(null, 100).coherent).toBe(false);
  });

  it('rejette CH négatif', () => {
    expect(_validateHCCH(650, -10).coherent).toBe(false);
  });

  it('CH = 0 est acceptable (loyer sans charges)', () => {
    expect(_validateHCCH(650, 0).coherent).toBe(true);
  });
});

describe('_outlierVsMedian', () => {
  it('détecte une valeur 10× la médiane', () => {
    const r = _outlierVsMedian(6500, 650);
    expect(r.outlier).toBe(true);
    expect(r.ratio).toBe(10);
  });

  it('détecte une valeur 1/10× la médiane', () => {
    const r = _outlierVsMedian(65, 650);
    expect(r.outlier).toBe(true);
  });

  it('accepte une valeur dans la fourchette normale', () => {
    expect(_outlierVsMedian(800, 650).outlier).toBe(false);
    expect(_outlierVsMedian(300, 650).outlier).toBe(false);
  });

  it('ignore médiane = 0 (pas de comparaison possible)', () => {
    expect(_outlierVsMedian(650, 0).outlier).toBe(false);
  });

  it('seuil personnalisable', () => {
    expect(_outlierVsMedian(1300, 650, 3).outlier).toBe(false);
    expect(_outlierVsMedian(2600, 650, 3).outlier).toBe(true);
  });
});
