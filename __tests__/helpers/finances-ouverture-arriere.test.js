/**
 * C2 — Finances MAÎTRE de l'arriéré : la position d'ouverture (arriéré reporté d'avant l'exercice,
 * borné au début du suivi) entre dans `byLot[ref].annual.retard`. L'Accueil lira ce total → il ne
 * ment plus sur un vieux dû. Nette contre les paiements de l'année (avance de l'année → solde N-1
 * d'abord). Base fiscale 2044 (loyersHC) INTOUCHÉE par l'ouverture.
 */
import { describe, it, expect } from 'vitest';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';

const base = {
  scope: null,
  scopeWeight: () => 1,
  catLigne: (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null),
  isEcheance: () => false,
  loyerDue: (q, ym) => (ym >= '2024-01' ? { hc: 500, ch: 0 } : { hc: 0, ch: 0 }),
  window: { lastMonth: 12, dueMonth: 12, today: '2025-12-31' },
  today: '2025-12-31',
};
const mv = (ym, qui, cr) => ({ date: ym + '-05', cat: 'Loyer', qui, cr, db: 0 });
const pay = (year, n, qui) => Array.from({ length: n }, (_, k) => mv(year + '-' + String(k + 1).padStart(2, '0'), qui, 500));

describe('C2 — position d\'ouverture dans le moteur Finances (maître)', () => {
  it('arriéré N-1 (2 mois impayés en 2024) → retard 2025 = 1000 (l\'ouverture)', () => {
    const mvts = [...pay('2024', 10, 'L1'), ...pay('2025', 12, 'L1')];   // 2024 : 10/12 payés ; 2025 : soldé
    const r = _computeFinancesMonthly({ year: '2025', mouvements: mvts, activeLots: ['L1'], ...base });
    expect(r.byLot['L1'].annual.retard).toBe(1000);
    expect(r.lotsEnRetard).toContain('L1');
  });

  it('une avance de l\'année solde d\'abord la dette N-1 (net, pas d\'addition)', () => {
    // 2024 : 10/12 payés (doit 1000) ; 2025 : 12 mois + 2 de plus (surplus 1000) → ouverture soldée
    const mvts = [...pay('2024', 10, 'L1'), ...pay('2025', 12, 'L1'), mv('2025-06', 'L1', 500), mv('2025-07', 'L1', 500)];
    const r = _computeFinancesMonthly({ year: '2025', mouvements: mvts, activeLots: ['L1'], ...base });
    expect(r.byLot['L1'].annual.retard).toBe(0);
    expect(r.lotsEnRetard).not.toContain('L1');
  });

  it('témoin : aucun mouvement pré-exercice → aucune ouverture (changement inerte)', () => {
    const r = _computeFinancesMonthly({ year: '2025', mouvements: pay('2025', 10, 'L1'), activeLots: ['L1'], ...base });
    expect(r.byLot['L1'].annual.retard).toBe(1000);   // 2 mois 2025 non payés, PAS d'ouverture N-1
  });

  it('la base fiscale 2044 (loyersHC annuel) ne dépend PAS de l\'ouverture', () => {
    const sans = _computeFinancesMonthly({ year: '2025', mouvements: pay('2025', 12, 'L1'), activeLots: ['L1'], ...base });
    const avec = _computeFinancesMonthly({ year: '2025', mouvements: [...pay('2024', 8, 'L1'), ...pay('2025', 12, 'L1')], activeLots: ['L1'], ...base });
    expect(avec.annual.loyersHC).toBe(sans.annual.loyersHC);   // 2044 intouchée par le report N-1
    expect(avec.byLot['L1'].annual.retard).toBe(2000);          // 4 mois 2024 impayés reportés
  });
});
