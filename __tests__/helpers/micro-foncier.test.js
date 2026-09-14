/**
 * Tests — MICRO-FONCIER (art. 32 CGI). Module js/core/micro-foncier.js
 *
 * Règle fiscale (sources : art. 32 CGI + BOFiP BOI-RFPI-DECLA-10) :
 *  - Seuil : revenu brut foncier annuel ≤ 15 000 € (location nue).
 *  - Abattement forfaitaire de 30 % (représentatif des charges).
 *  - Micro imposable = loyers × 0,70 ; réel imposable = loyers − charges réelles.
 *  - Le micro est ≤ au réel quand charges ≤ 30 % des loyers.
 *  L'app NE PEUT PAS vérifier : régimes spéciaux, total du foyer hors Propryo → suggestion, pas verdict.
 */
import { describe, it, expect } from 'vitest';
import {
  MF_SEUIL, MF_ABATTEMENT, evaluerMicroFoncier
} from '../../js/core/micro-foncier.js';

describe('constantes légales', () => {
  it('seuil 15 000 € et abattement 30 %', () => {
    expect(MF_SEUIL).toBe(15000);
    expect(MF_ABATTEMENT).toBe(0.30);
  });
});

describe('éligibilité au seuil', () => {
  it('loyers nuls → statut « na » (rien à proposer)', () => {
    expect(evaluerMicroFoncier({ loyersNus: 0, chargesReelles: 0 }).statut).toBe('na');
  });
  it('loyers > 15 000 € → réel obligatoire (l\'app peut l\'affirmer)', () => {
    const r = evaluerMicroFoncier({ loyersNus: 18000, chargesReelles: 1000 });
    expect(r.statut).toBe('reel_obligatoire');
    expect(r.eligibleSeuil).toBe(false);
  });
  it('loyers = 15 000 € pile → encore éligible (≤)', () => {
    const r = evaluerMicroFoncier({ loyersNus: 15000, chargesReelles: 1000 });
    expect(r.eligibleSeuil).toBe(true);
  });
});

describe('comparaison micro vs réel (loyers éligibles)', () => {
  it('charges < 30 % → micro plus avantageux (piste)', () => {
    const r = evaluerMicroFoncier({ loyersNus: 9000, chargesReelles: 1800 }); // 20 %
    expect(r.statut).toBe('micro_piste');
    expect(r.microImposable).toBe(6300);
    expect(r.reelImposable).toBe(7200);
    expect(r.microAvantageux).toBe(true);
    expect(r.gain).toBe(900); // réel − micro (assiette économisée)
  });
  it('charges > 30 % → réel plus avantageux', () => {
    const r = evaluerMicroFoncier({ loyersNus: 9000, chargesReelles: 4000 }); // 44 %
    expect(r.statut).toBe('reel_avantageux');
    expect(r.microImposable).toBe(6300);
    expect(r.reelImposable).toBe(5000);
    expect(r.microAvantageux).toBe(false);
  });
  it('charges = 30 % pile → micro (même impôt mais plus simple, pas de 2044)', () => {
    const r = evaluerMicroFoncier({ loyersNus: 10000, chargesReelles: 3000 });
    expect(r.microImposable).toBe(7000);
    expect(r.reelImposable).toBe(7000);
    expect(r.statut).toBe('micro_piste');
    expect(r.microAvantageux).toBe(true);
  });
  it('charges > loyers (déficit foncier) → réel largement avantageux', () => {
    const r = evaluerMicroFoncier({ loyersNus: 8000, chargesReelles: 12000 });
    expect(r.statut).toBe('reel_avantageux');
    expect(r.reelImposable).toBe(-4000); // déficit
    expect(r.microAvantageux).toBe(false);
  });
  it('pourcentage de charges arrondi exposé', () => {
    const r = evaluerMicroFoncier({ loyersNus: 9000, chargesReelles: 1800 });
    expect(r.chargesPct).toBe(20);
  });
});

describe('robustesse des entrées', () => {
  it('valeurs manquantes / non numériques → 0', () => {
    const r = evaluerMicroFoncier({});
    expect(r.statut).toBe('na');
  });
  it('charges négatives ramenées à 0', () => {
    const r = evaluerMicroFoncier({ loyersNus: 9000, chargesReelles: -50 });
    expect(r.chargesReelles).toBe(0);
    expect(r.statut).toBe('micro_piste');
  });
  it('arrondi à l\'euro des assiettes', () => {
    const r = evaluerMicroFoncier({ loyersNus: 9999, chargesReelles: 1000 });
    expect(Number.isInteger(r.microImposable)).toBe(true);
    expect(Number.isInteger(r.reelImposable)).toBe(true);
  });
});
