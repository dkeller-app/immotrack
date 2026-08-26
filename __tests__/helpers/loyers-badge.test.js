// __tests__/helpers/loyers-badge.test.js — CDC-QUITTANCES-IRL D22 / invariant I15.
//
// « La pastille = nombre de lignes actionnables de l'écran Loyers ; 0 → pas de pastille ; les
//   non-révisables et les révisions perdues n'y entrent JAMAIS. »
//
// PUR : aucune DB, aucun DOM. Chaque cas rougit à la mutation (ajouter les muets/perdues au compte,
// ou compter une quittance non prête, casse un test).

import { describe, it, expect } from 'vitest';
import { loyersBadgeCount, loyersBadgeBreakdown } from '../../js/core/loyers-badge.js';

describe('loyersBadgeCount — I15', () => {
  it('écran vide → 0 (donc pas de pastille)', () => {
    expect(loyersBadgeCount([], {})).toBe(0);
    expect(loyersBadgeCount(null, null)).toBe(0);
    expect(loyersBadgeCount(undefined, undefined)).toBe(0);
  });

  it('somme quittances PRÊTES + pas à jour + révisions à préparer (à-préparer + en-retard)', () => {
    const etats = [
      { demande: true, aQuittancer: ['2026-04'], retard: { enRetard: false } },  // quittance prête → +1
      { demande: false, aQuittancer: ['x'], retard: { enRetard: true } },         // pas à jour → +1
      { demande: false, aQuittancer: [], retard: { enRetard: true } },            // pas à jour → +1
    ];
    const rev = { aPreparer: [1, 2], enRetard: [3], muets: [], perdues: [] };     // révisions → +3
    expect(loyersBadgeCount(etats, rev)).toBe(1 + 2 + 3);
  });

  it('une quittance DEMANDÉE mais sans mois à quittancer n\'est PAS actionnable', () => {
    expect(loyersBadgeCount([{ demande: true, aQuittancer: [], retard: { enRetard: false } }], {})).toBe(0);
  });

  it('les NON-RÉVISABLES (muets) et les révisions PERDUES n\'entrent JAMAIS dans le compteur', () => {
    // 6 muets + 2 perdues, rien d'actionnable → 0 (pas de pastille), quoi qu'il arrive.
    expect(loyersBadgeCount([], { aPreparer: [], enRetard: [], muets: [1, 2, 3, 4, 5, 6], perdues: [7, 8] })).toBe(0);
    // Et ils ne gonflent pas un compteur non nul : 1 retard + 1 à-préparer = 2, muets/perdues ignorés.
    const etats = [{ demande: false, aQuittancer: [], retard: { enRetard: true } }];
    expect(loyersBadgeCount(etats, { aPreparer: [1], enRetard: [], muets: [1, 2, 3], perdues: [9] })).toBe(2);
  });

  it('breakdown : trois nombres cohérents avec le total', () => {
    const etats = [
      { demande: true, aQuittancer: ['a'], retard: { enRetard: false } },
      { demande: false, aQuittancer: [], retard: { enRetard: true } },
    ];
    const rev = { aPreparer: [1], enRetard: [2, 3], muets: [4], perdues: [5] };
    const b = loyersBadgeBreakdown(etats, rev);
    expect(b).toEqual({ quittances: 1, pasAJour: 1, revisions: 3 });
    expect(b.quittances + b.pasAJour + b.revisions).toBe(loyersBadgeCount(etats, rev));
  });
});
