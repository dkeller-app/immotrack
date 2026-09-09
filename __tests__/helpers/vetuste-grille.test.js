/**
 * Tests — GRILLE DE VÉTUSTÉ (décret 2016-382, barème OPAC).
 * Module js/core/vetuste-grille.js
 */
import { describe, it, expect } from 'vitest';
import {
  VETUSTE_BAREME, VETUSTE_SOURCES,
  vetusteParams, vetusteAge, vetusteUsure, vetustePart,
  computeVetusteLigne, computeVetusteTotal
} from '../../js/core/vetuste-grille.js';

describe('vetusteParams', () => {
  it('trouve le type demandé', () => {
    expect(vetusteParams('moquette').vie).toBe(7);
    expect(vetusteParams('sanitaire').res).toBe(25);
  });
  it('repli sur le 1er type si inconnu', () => {
    expect(vetusteParams('inexistant').k).toBe(VETUSTE_BAREME[0].k);
  });
  it('accepte un barème custom', () => {
    const custom = [{ k: 'x', nom: 'X', vie: 4, fr: 0, ab: 25, res: 0 }];
    expect(vetusteParams('x', custom).vie).toBe(4);
  });
});

describe('vetusteAge — années révolues', () => {
  it('date pile → âge entier', () => {
    expect(vetusteAge('2018-06-15', '2026-06-15')).toBe(8);
    expect(vetusteAge('2015-06-15', '2026-06-15')).toBe(11);
  });
  it('avant l’anniversaire dans l’année → une année de moins', () => {
    expect(vetusteAge('2020-09-01', '2026-06-15')).toBe(5); // pas encore septembre
  });
  it('mise en service absente → 0', () => {
    expect(vetusteAge('', '2026-06-15')).toBe(0);
    expect(vetusteAge(null, '2026-06-15')).toBe(0);
  });
});

describe('vetusteUsure — franchise + plafond résiduel', () => {
  it('peinture (7/1/15/10) à 6 ans → 75 %', () => {
    expect(vetusteUsure(vetusteParams('peinture'), 6)).toBeCloseTo(0.75, 5);
  });
  it('pendant la franchise → 0 %', () => {
    expect(vetusteUsure(vetusteParams('peinture'), 1)).toBe(0);
    expect(vetusteUsure(vetusteParams('peinture'), 0)).toBe(0);
  });
  it('équipement amorti → plafonné à (100 − résiduel)', () => {
    // moquette 11 ans : (11−1)×15 % = 150 % → plafonné à 90 %
    expect(vetusteUsure(vetusteParams('moquette'), 11)).toBeCloseTo(0.90, 5);
    // sanitaire 22 ans : (22−5)×5 % = 85 % → plafonné à 75 %
    expect(vetusteUsure(vetusteParams('sanitaire'), 22)).toBeCloseTo(0.75, 5);
  });
});

describe('vetustePart — le locataire paie au moins la part résiduelle', () => {
  it('peinture 520 € à 6 ans → 130 €', () => {
    expect(vetustePart(520, vetusteParams('peinture'), 6)).toBe(130);
  });
  it('moquette 500 € amortie (11 ans) → 50 € (jamais 0)', () => {
    expect(vetustePart(500, vetusteParams('moquette'), 11)).toBe(50);
  });
  it('sanitaire 800 € à 22 ans → 200 €', () => {
    expect(vetustePart(800, vetusteParams('sanitaire'), 22)).toBe(200);
  });
  it('revêtement plastique humide 480 € à 8 ans → 192 €', () => {
    expect(vetustePart(480, vetusteParams('solplast_h'), 8)).toBe(192);
  });
});

describe('computeVetusteLigne — ancrage de la preuve', () => {
  const ctx = { refDate: '2026-06-15' };
  it('source facture → âge depuis la date de pose', () => {
    const r = computeVetusteLigne({ type: 'solplast_h', cout: 480, source: 'facture', mes: '2018-06-15' }, ctx);
    expect(r.age).toBe(8);
    expect(r.part).toBe(192);
    expect(r.aJustifier).toBe(false);
  });
  it('source edl_neuf → âge ancré sur la date de l’EDL d’entrée', () => {
    const r = computeVetusteLigne({ type: 'peinture', cout: 520, source: 'edl_neuf', edlEntreeDate: '2020-09-01' }, ctx);
    expect(r.age).toBe(5); // depuis l'EDL d'entrée, pas une date de pose saisie
    expect(r.aJustifier).toBe(false);
  });
  it('source edl_neuf → ancre depuis ctx.edlEntreeDate (cas réel : date portée par le contexte)', () => {
    const r = computeVetusteLigne(
      { type: 'peinture', cout: 520, source: 'edl_neuf' }, // pas d'edlEntreeDate sur la ligne
      { refDate: '2026-06-15', edlEntreeDate: '2020-09-01' }
    );
    expect(r.age).toBe(5);       // depuis l'EDL d'entrée du contexte
    expect(r.part).toBe(208);    // (5−1)×15 % = 60 % → 520 × 40 %
    expect(r.aJustifier).toBe(false);
  });
  it('source estim → marqué à justifier', () => {
    const r = computeVetusteLigne({ type: 'moquette', cout: 500, source: 'estim', mes: '2015-06-15' }, ctx);
    expect(r.age).toBe(11);
    expect(r.part).toBe(50);
    expect(r.aJustifier).toBe(true);
  });
  it('sans ancre → âge 0 et à justifier', () => {
    const r = computeVetusteLigne({ type: 'peinture', cout: 300, source: 'facture', mes: '' }, ctx);
    expect(r.age).toBe(0);
    expect(r.part).toBe(300); // aucune vétusté prouvée → coût plein
    expect(r.aJustifier).toBe(true);
  });
});

describe('computeVetusteTotal', () => {
  it('somme les parts + compte les lignes à justifier', () => {
    const lignes = [
      { type: 'peinture',   cout: 520, source: 'edl_neuf', edlEntreeDate: '2020-06-15' }, // age 6 → 130
      { type: 'solplast_h', cout: 480, source: 'facture',  mes: '2018-06-15' },            // age 8 → 192
      { type: 'moquette',   cout: 500, source: 'estim',    mes: '2015-06-15' }             // age 11 → 50 (à justifier)
    ];
    const t = computeVetusteTotal(lignes, { refDate: '2026-06-15' });
    expect(t.total).toBe(372);
    expect(t.nbAJustifier).toBe(1);
    expect(t.rows).toHaveLength(3);
  });
  it('liste vide → 0', () => {
    expect(computeVetusteTotal([], {}).total).toBe(0);
    expect(computeVetusteTotal(null, {}).total).toBe(0);
  });
});

describe('constantes exposées', () => {
  it('barème OPAC complet + sources', () => {
    expect(VETUSTE_BAREME.length).toBe(15);
    expect(Object.keys(VETUSTE_SOURCES)).toEqual(['facture', 'edl_neuf', 'estim']);
  });
});
