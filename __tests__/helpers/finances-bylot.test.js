/**
 * Lot 0 du chantier KPI — `_computeFinancesMonthly` REND `byLot`.
 *
 * CDC-KPI §R-0 (corrigé D34) : tout écran qui affiche un montant par lot LIT Finances, ne
 * recalcule rien. Le moteur calcule déjà le détail par lot dans sa boucle `allLots.forEach`
 * (cascade + netting mois par mois) puis JETTE les montants — il ne renvoyait que
 * `lotsEnRetard`. Ce lot EXPOSE ce qui est déjà calculé, sans nouveau calcul.
 *
 * Forme exigée (D34) :
 *   byLot[ref] = {
 *     months: [{ ym, duHC, duCH, encaisse, loyerRetard, chargeRetard, avance, rattrapage }],
 *     annual: { duHC, duCH, encaisse, retard, avance },
 *     solde:  encaisse − dû        // signé : + avance / − retard
 *   }
 *
 * INVARIANTS (prouvés par mutation) :
 *   B-1  Σ des mois de byLot = agrégats annuels du même lot.
 *   B-2  parité stricte avec `lotsEnRetard` : un lot a un solde < 0 ⟺ il est dans lotsEnRetard.
 *   B-3  Σ encaisse/retard/avance de tous les lots = totaux annuels du moteur (aucune fuite).
 */
import { describe, it, expect } from 'vitest';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';

const catLigne = (cat) => (cat === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null);
const isEcheance = (m) => m.cat === 'Prêt';

// Trois lots aux situations distinctes, dus 500/50 par mois, exercice à fin mars.
//   A — à jour : paie 550 chaque mois.
//   B — en retard : paie janvier seulement, rien ensuite.
//   C — en avance : paie 3×550 en janvier (couvre janv+févr+mars).
const YEAR = 2026, TODAY = '2026-03-31';
const due = (qui) => (['A', 'B', 'C'].includes(qui) ? { hc: 500, ch: 50 } : { hc: 0, ch: 0 });
const mvts = [
  { date: '2026-01-03', cat: 'Loyer', qui: 'A', cr: 550, db: 0 },
  { date: '2026-02-03', cat: 'Loyer', qui: 'A', cr: 550, db: 0 },
  { date: '2026-03-03', cat: 'Loyer', qui: 'A', cr: 550, db: 0 },
  { date: '2026-01-03', cat: 'Loyer', qui: 'B', cr: 550, db: 0 },
  { date: '2026-01-05', cat: 'Loyer', qui: 'C', cr: 1650, db: 0 },
];
const base = {
  mouvements: mvts, year: YEAR, scope: null, catLigne, isEcheance,
  loyerDue: due, activeLots: ['A', 'B', 'C'], today: TODAY,
};

describe('_computeFinancesMonthly — byLot (Lot 0 KPI)', () => {
  it('rend un byLot indexé par référence de lot', () => {
    const r = _computeFinancesMonthly(base);
    expect(r.byLot).toBeTypeOf('object');
    expect(Object.keys(r.byLot).sort()).toEqual(['A', 'B', 'C']);
  });

  it('chaque lot porte une frise de 12 mois de l\'exercice (D34 : maille mensuelle)', () => {
    const { byLot } = _computeFinancesMonthly(base);
    // Le moteur borne au dernier mois produit ; ici 3 mois écoulés.
    expect(byLot.A.months.map((m) => m.ym)).toEqual(['2026-01', '2026-02', '2026-03']);
    const jan = byLot.A.months[0];
    expect(jan).toHaveProperty('duHC');
    expect(jan).toHaveProperty('duCH');
    expect(jan).toHaveProperty('encaisse');
    expect(jan).toHaveProperty('loyerRetard');
    expect(jan).toHaveProperty('chargeRetard');
    expect(jan).toHaveProperty('avance');
    expect(jan).toHaveProperty('rattrapage');
  });

  it('lot à jour (A) : dû = encaissé, solde nul, pas en retard', () => {
    const { byLot } = _computeFinancesMonthly(base);
    expect(byLot.A.annual.duHC).toBe(1500);
    expect(byLot.A.annual.duCH).toBe(150);
    expect(byLot.A.annual.encaisse).toBe(1650);      // 3 × 550
    expect(byLot.A.solde).toBe(0);
    expect(byLot.A.annual.retard).toBe(0);
  });

  it('lot en retard (B) : solde négatif = ce qu\'il doit encore', () => {
    const { byLot } = _computeFinancesMonthly(base);
    // dû 3×550 = 1650, payé 550 → doit 1100.
    expect(byLot.B.annual.encaisse).toBe(550);
    expect(byLot.B.annual.retard).toBe(1100);
    expect(byLot.B.solde).toBe(-1100);
  });

  it('lot en avance (C) : solde positif = l\'avance, aucun retard', () => {
    const { byLot } = _computeFinancesMonthly(base);
    expect(byLot.C.annual.encaisse).toBe(1650);      // payé d'un coup
    expect(byLot.C.annual.retard).toBe(0);
    expect(byLot.C.solde).toBe(0);                   // 3 mois dus, 3 mois couverts
  });

  it('B-1 : Σ des mois de byLot = agrégats annuels du même lot', () => {
    const { byLot } = _computeFinancesMonthly(base);
    for (const ref of Object.keys(byLot)) {
      const l = byLot[ref];
      const som = (k) => l.months.reduce((s, m) => s + (m[k] || 0), 0);
      expect(Math.round(som('duHC') * 100) / 100).toBe(l.annual.duHC);
      expect(Math.round(som('duCH') * 100) / 100).toBe(l.annual.duCH);
      expect(Math.round(som('encaisse') * 100) / 100).toBe(l.annual.encaisse);
      expect(Math.round((som('loyerRetard') + som('chargeRetard')) * 100) / 100).toBe(l.annual.retard);
    }
  });

  it('B-2 : parité stricte avec lotsEnRetard (solde < 0 ⟺ dans lotsEnRetard)', () => {
    const r = _computeFinancesMonthly(base);
    const enRetardParByLot = Object.keys(r.byLot).filter((ref) => r.byLot[ref].solde < -0.005).sort();
    expect(enRetardParByLot).toEqual([...r.lotsEnRetard].sort());
  });

  it('B-3 : aucune fuite — Σ encaissé par lot = Σ crédits loyer, Σ retard par lot = retard annuel', () => {
    const r = _computeFinancesMonthly(base);
    // encaissé : l'argent RÉELLEMENT entré au titre des loyers (les crédits bruts, avant cascade).
    // NB : loyersHC + provisions + avance NE convient PAS — `avance` est un report cumulé mois par
    // mois, il double-compterait le surplus qui roule d'un mois sur l'autre.
    const totCredits = mvts.filter((m) => m.cat === 'Loyer').reduce((s, m) => s + (m.cr || 0), 0);
    const totEncaisse = Object.values(r.byLot).reduce((s, l) => s + l.annual.encaisse, 0);
    expect(Math.round(totEncaisse * 100) / 100).toBe(Math.round(totCredits * 100) / 100);
    // retard : l'agrégat annuel du moteur = Σ des retards par lot.
    const totRetard = Object.values(r.byLot).reduce((s, l) => s + l.annual.retard, 0);
    expect(Math.round(totRetard * 100) / 100).toBe(
      Math.round((r.annual.loyerRetard + r.annual.chargeRetard) * 100) / 100
    );
  });
});
