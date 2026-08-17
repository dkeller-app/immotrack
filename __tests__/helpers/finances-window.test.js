import { describe, it, expect, vi } from 'vitest';
import {
  WINDOW_KIND,
  computeConstatWindow, computeExigibiliteWindow, alignPreviousYear,
  windowLabel, isFutureMonth, lastMovementMonth
} from '../../js/core/finances-window.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { _loyerTodayLocal } from '../../js/core/loyer-statut.js';

// 13/09/2026 — le cas du CDC : 9 mois échus, un loyer déjà encaissé en octobre (post-daté).
const TODAY = '2026-09-13';
const MVTS = [
  { date: '2026-01-10', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 },
  { date: '2026-09-03', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 },
  { date: '2026-10-02', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 },   // POST-DATÉ (décision « B »)
  { date: '2025-12-30', cat: 'Loyer', qui: 'L1', cr: 800, db: 0 },   // autre exercice
  { date: '2026-11-04', cat: 'Loyer', qui: 'L9', cr: 800, db: 0, _deleted: true }
];

describe('finances-window — fenêtre d\'EXIGIBILITÉ (F-1)', () => {
  it('exercice en cours : 01/01 → dernier mois échu (le mois courant)', () => {
    const w = computeExigibiliteWindow({ year: 2026, today: TODAY });
    expect(w.kind).toBe(WINDOW_KIND.EXIGIBILITE);
    expect(w.lastMonth).toBe(9);
    expect(w.fromYm).toBe('2026-01');
    expect(w.toYm).toBe('2026-09');
    expect(w.nbMois).toBe(9);
  });

  it('un mouvement post-daté N\'ÉTEND PAS l\'exigibilité (on n\'est pas en retard sur un dû à venir)', () => {
    const w = computeExigibiliteWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.lastMonth).toBe(9);
  });

  it('aucun mois n\'est « à venir » dans la fenêtre d\'exigibilité', () => {
    const w = computeExigibiliteWindow({ year: 2026, today: TODAY });
    expect(w.months.every(m => m.future === false)).toBe(true);
  });

  it('exercice clos → année pleine', () => {
    const w = computeExigibiliteWindow({ year: 2025, today: TODAY });
    expect(w.lastMonth).toBe(12);
    expect(w.toYm).toBe('2025-12');
  });

  it('exercice à venir → fenêtre VIDE (rien n\'est encore exigible)', () => {
    const w = computeExigibiliteWindow({ year: 2027, today: TODAY });
    expect(w.lastMonth).toBe(0);
    expect(w.months).toEqual([]);
    expect(w.empty).toBe(true);
    expect(w.toYm).toBe('');
  });

  it('tolérance de début de mois (constat 45) : graceLast avant le 10 du mois courant', () => {
    expect(computeExigibiliteWindow({ year: 2026, today: '2026-09-03' }).graceLast).toBe(true);
    expect(computeExigibiliteWindow({ year: 2026, today: '2026-09-13' }).graceLast).toBe(false);
    expect(computeExigibiliteWindow({ year: 2025, today: '2026-09-03' }).graceLast).toBe(false);
  });
});

describe('finances-window — fenêtre de CONSTAT (F-1 v2, décision « B »)', () => {
  it('01/01 → dernier mois contenant un mouvement connu, POST-DATÉ COMPRIS', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.kind).toBe(WINDOW_KIND.CONSTAT);
    expect(w.lastMonth).toBe(10);          // octobre entre dans l'exercice (constat 26)
    expect(w.toYm).toBe('2026-10');
    expect(w.nbMois).toBe(10);
  });

  it('les mois non échus sont COMPTÉS mais DRAPEAUTÉS « à venir » (grisage UI)', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.dueMonth).toBe(9);
    expect(w.months.filter(m => m.future).map(m => m.ym)).toEqual(['2026-10']);
    expect(isFutureMonth(w, '2026-10')).toBe(true);
    expect(isFutureMonth(w, '2026-09')).toBe(false);
  });

  it('sans mouvement post-daté, constat = exigibilité', () => {
    const sansPost = MVTS.filter(m => m.date < '2026-10');
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: sansPost });
    expect(w.lastMonth).toBe(9);
    expect(w.months.some(m => m.future)).toBe(false);
  });

  it('un mouvement supprimé n\'étend jamais la fenêtre', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.lastMonth).toBe(10);          // novembre (tombstone) ignoré
  });

  it('les mouvements d\'un autre exercice n\'entrent pas dans le calcul', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: [{ date: '2027-05-01' }] });
    expect(w.lastMonth).toBe(9);
  });

  it('la fenêtre respecte le PÉRIMÈTRE : un post-daté hors périmètre ne l\'étend pas', () => {
    const inScope = (m) => m.qui === 'L1';
    const hors = MVTS.map(m => (m.date === '2026-10-02' ? { ...m, qui: 'AUTRE' } : m));
    expect(computeConstatWindow({ year: 2026, today: TODAY, mouvements: hors, inScope }).lastMonth).toBe(9);
    expect(computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS, inScope }).lastMonth).toBe(10);
  });

  it('exercice clos → année pleine (aucun mois « à venir »)', () => {
    const w = computeConstatWindow({ year: 2025, today: TODAY, mouvements: MVTS });
    expect(w.lastMonth).toBe(12);
    expect(w.months.some(m => m.future)).toBe(false);
  });

  it('exercice à venir sans aucune saisie → fenêtre vide', () => {
    const w = computeConstatWindow({ year: 2027, today: TODAY, mouvements: MVTS });
    expect(w.empty).toBe(true);
    expect(w.months).toEqual([]);
  });

  it('exercice à venir DÉJÀ saisi → borné au dernier mouvement, tout est « à venir »', () => {
    const w = computeConstatWindow({ year: 2027, today: TODAY, mouvements: [{ date: '2027-03-01' }] });
    expect(w.lastMonth).toBe(3);
    expect(w.months.every(m => m.future)).toBe(true);
  });

  it('lastMovementMonth est exposé et testable seul', () => {
    expect(lastMovementMonth(MVTS, 2026)).toBe(10);
    expect(lastMovementMonth(MVTS, 2024)).toBe(0);
    expect(lastMovementMonth([], 2026)).toBe(0);
    expect(lastMovementMonth(null, 2026)).toBe(0);
  });

  it('une date malformée ne casse ni n\'étend la fenêtre', () => {
    expect(lastMovementMonth([{ date: '2026-13-01' }, { date: 'n/a' }, { date: null }], 2026)).toBe(0);
  });
});

describe('finances-window — libellés prêts à afficher', () => {
  it('constat, exercice en cours : « Exercice 2026 · tout ce qui est saisi au 13/09 »', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(w.label).toBe('Exercice 2026 · tout ce qui est saisi au 13/09');
    expect(windowLabel(w)).toBe(w.label);
  });

  it('constat, exercice clos : « Exercice 2025 · année complète »', () => {
    expect(computeConstatWindow({ year: 2025, today: TODAY }).label)
      .toBe('Exercice 2025 · année complète');
  });

  it('exigibilité : « du 01/01 au 30 septembre 2026 · 9 mois »', () => {
    expect(computeExigibiliteWindow({ year: 2026, today: TODAY }).label)
      .toBe('du 01/01 au 30 septembre 2026 · 9 mois');
  });

  it('exigibilité, un seul mois : « 1 mois » (pas de pluriel fautif)', () => {
    expect(computeExigibiliteWindow({ year: 2026, today: '2026-01-20' }).label)
      .toBe('du 01/01 au 31 janvier 2026 · 1 mois');
  });

  it('exigibilité, exercice clos : décembre', () => {
    expect(computeExigibiliteWindow({ year: 2025, today: TODAY }).label)
      .toBe('du 01/01 au 31 décembre 2025 · 12 mois');
  });

  it('février bissextile (29) et non bissextile (28)', () => {
    expect(computeExigibiliteWindow({ year: 2024, today: '2024-02-20' }).label)
      .toBe('du 01/01 au 29 février 2024 · 2 mois');
    expect(computeExigibiliteWindow({ year: 2026, today: '2026-02-20' }).label)
      .toBe('du 01/01 au 28 février 2026 · 2 mois');
  });

  it('fenêtre vide : le libellé le DIT', () => {
    expect(computeExigibiliteWindow({ year: 2027, today: TODAY }).label).toBe('aucun mois échu');
    expect(computeConstatWindow({ year: 2027, today: TODAY }).label).toBe('Exercice 2027 · rien de saisi');
  });
});

describe('finances-window — alignement du comparatif N-1', () => {
  it('N-1 couvre la MÊME étendue de mois que N (jamais 9 mois contre 8)', () => {
    const n = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    const n1 = alignPreviousYear(n);
    expect(n1.year).toBe(2025);
    expect(n1.lastMonth).toBe(n.lastMonth);
    expect(n1.nbMois).toBe(n.nbMois);
    expect(n1.months.map(m => m.mo)).toEqual(n.months.map(m => m.mo));
  });

  it('N-1 est du passé : aucun mois « à venir », même si N en avait', () => {
    const n1 = alignPreviousYear(computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS }));
    expect(n1.months.some(m => m.future)).toBe(false);
    expect(n1.dueMonth).toBe(n1.lastMonth);
  });

  it('le libellé N-1 annonce l\'alignement', () => {
    const n1 = alignPreviousYear(computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS }));
    expect(n1.aligned).toBe(true);
    expect(n1.label).toBe('2025 · même période (10 mois)');
  });

  it('alignement d\'une fenêtre d\'exigibilité : même règle', () => {
    const n1 = alignPreviousYear(computeExigibiliteWindow({ year: 2026, today: TODAY }));
    expect(n1.kind).toBe(WINDOW_KIND.EXIGIBILITE);
    expect(n1.lastMonth).toBe(9);
    expect(n1.label).toBe('2025 · même période (9 mois)');
  });

  it('alignement d\'une fenêtre vide → fenêtre vide', () => {
    const n1 = alignPreviousYear(computeExigibiliteWindow({ year: 2027, today: TODAY }));
    expect(n1.empty).toBe(true);
    expect(n1.months).toEqual([]);
  });

  it('alignPreviousYear(null) ne jette pas', () => {
    expect(alignPreviousYear(null)).toBeNull();
  });
});

describe('finances-window — composition avec le moteur mensuel (cible étape 2)', () => {
  const catLigne = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null);
  const run = (lastMonth) => _computeFinancesMonthly({
    mouvements: MVTS, year: 2026, scope: null, catLigne, today: TODAY, lastMonth
  });

  it('fenêtre de CONSTAT : le loyer post-daté d\'octobre entre enfin dans l\'exercice (constat 26)', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    const r = run(w.lastMonth);
    expect(r.months.map(m => m.ym)).toContain('2026-10');
    expect(r.annual.loyersBrut).toBe(2400);          // janv + sept + oct
  });

  it('fenêtre d\'EXIGIBILITÉ : octobre reste hors du dû (comportement actuel)', () => {
    const w = computeExigibiliteWindow({ year: 2026, today: TODAY });
    const r = run(w.lastMonth);
    expect(r.months.map(m => m.ym)).not.toContain('2026-10');
    expect(r.annual.loyersBrut).toBe(1600);
  });

  it('les mois de la fenêtre et ceux du moteur coïncident exactement', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(run(w.lastMonth).months.map(m => m.ym)).toEqual(w.months.map(m => m.ym));
  });
});

// ── Corrections d'audit ───────────────────────────────────────────────────────
describe('finances-window — robustesse (corrections d\'audit)', () => {
  const catLigne = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null);

  it('I1 : la date du jour est LOCALE, jamais toISOString()/UTC', () => {
    vi.useFakeTimers();
    try {
      // 1ᵉʳ janvier, 00 h 30 LOCAL : en UTC+X on est encore le 31/12 de l'exercice précédent.
      // Avec l'UTC, l'exercice en cours basculait en « à venir » → fenêtre VIDE.
      vi.setSystemTime(new Date(2026, 0, 1, 0, 30, 0));
      const w = computeExigibiliteWindow({ year: 2026 });
      expect(w.today).toBe(_loyerTodayLocal());
      expect(w.today).toBe('2026-01-01');
      expect(w.empty).toBe(false);
      expect(w.lastMonth).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('I2 : CONTRAT de la fenêtre vide — l\'appelant DOIT court-circuiter le moteur mensuel', () => {
    const w = computeExigibiliteWindow({ year: 2027, today: TODAY });
    expect(w.empty).toBe(true);
    expect(w.lastMonth).toBe(0);
    expect(w.months).toEqual([]);
    // Preuve du piège que l'étape 2 doit éviter : `lastMonth: 0` passé tel quel au moteur est
    // remonté à 1 (finances-monthly.js:52-54) et fabrique un mois de janvier FANTÔME.
    const r = _computeFinancesMonthly({
      mouvements: [], year: 2027, scope: null, catLigne, today: TODAY, lastMonth: w.lastMonth
    });
    expect(r.months.map(m => m.ym)).toEqual(['2027-01']);   // ← absent de la fenêtre : à ne PAS afficher
  });

  it('M1 : en décembre de l\'exercice EN COURS, le libellé ne ment pas (« année complète »)', () => {
    const enCours = computeConstatWindow({ year: 2026, today: '2026-12-05' });
    expect(enCours.lastMonth).toBe(12);
    expect(enCours.label).toBe('Exercice 2026 · tout ce qui est saisi au 05/12');
    // Une fois l'exercice CLOS, le libellé devient légitime.
    expect(computeConstatWindow({ year: 2026, today: '2027-01-05' }).label)
      .toBe('Exercice 2026 · année complète');
  });

  it('M3 : isFutureMonth ignore les mois d\'un AUTRE exercice', () => {
    const w = computeConstatWindow({ year: 2026, today: TODAY, mouvements: MVTS });
    expect(isFutureMonth(w, '2026-10')).toBe(true);
    expect(isFutureMonth(w, '2027-10')).toBe(false);   // même n° de mois, autre exercice
    expect(isFutureMonth(w, '2025-10')).toBe(false);
    expect(isFutureMonth(w, 10)).toBe(true);           // n° de mois nu : rétrocompatible
    expect(isFutureMonth(null, '2026-10')).toBe(false);
  });

  it('M4 : un exercice non numérique donne une fenêtre VIDE, jamais des mois « NaN-01 »', () => {
    ['abcd', '', null, undefined, NaN, 26].forEach(y => {
      const w = computeExigibiliteWindow({ year: y, today: TODAY });
      expect(w.empty).toBe(true);
      expect(w.months).toEqual([]);
      expect(w.fromYm).toBe('');
      expect(JSON.stringify(w)).not.toContain('NaN');
    });
    const c = computeConstatWindow({ year: 'oups', today: TODAY, mouvements: MVTS });
    expect(c.empty).toBe(true);
    expect(c.months).toEqual([]);
  });
});
