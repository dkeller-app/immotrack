/**
 * Lot 1a KPI — agrégateur des 8 familles (CDC §2.2/§2.3/§2.4/§2.7).
 *
 *   F-1  une famille vide n'a pas de carte.
 *   F-2  l'ordre des familles = coût du retard (dépôt > irl > impayé > régul > finbail >
 *        document > entretien > vacant), quel que soit l'ordre des clés d'entrée.
 *   F-3  regroupement par zone : 4 en Argent, 4 en Gestion locative, 0 en Pilotage.
 *   F-4  le pire cas est en tête (tri par urgence, sens correct selon la famille).
 *   F-5  le montant d'une famille = Σ des montants ; négatif pour la vacance.
 *   F-6  count et total exacts.
 */
import { describe, it, expect } from 'vitest';
import { computePilotageFamilles, FAMILLES, ordreFamille, pilotagePay } from '../../js/core/pilotage-familles.js';

// Chaque famille à 2 items met VOLONTAIREMENT le pire cas en 2ᵉ position : le tri doit le
// remonter. Un tri neutralisé (comparateur → 0) laisserait le mauvais item en tête et
// ferait échouer F-4 — c'est ce qui garantit que le test mord.
const jeu = () => ({
  depot: [
    { ref: 'L2', nom: 'Théo', montant: 640, urgenceJours: 47 },     // limite dans 47 j → moins urgent
    { ref: 'L1', nom: 'Marion', montant: 720, urgenceJours: 19 },   // limite dans 19 j → PIRE, en 2ᵉ
  ],
  irl: [{ ref: 'F1', nom: 'Ferrette 001', montant: 34, urgenceJours: 200 }],
  impaye: [
    { ref: 'K1', nom: 'Kieffer', montant: 820, urgenceJours: 34 },
    { ref: 'M1', nom: 'Meyer', montant: 1530, urgenceJours: 67 },   // 67 j de retard → PIRE, en 2ᵉ
  ],
  regul: [{ ref: 'D1', nom: 'Damelevières 2025', urgenceJours: 240 }],
  finbail: [{ ref: 'F3', nom: 'Ferrette 103', urgenceJours: 35 }],
  document: [{ ref: 'F4', nom: 'Weigel Lisa', urgenceJours: 0 }],
  entretien: [{ ref: 'F5', nom: 'Ferrette 102', urgenceJours: 40 }], // 40 j de retard
  vacant: [
    { ref: 'V2', nom: 'Mulhouse 2', montant: 890, urgenceJours: 47 },
    { ref: 'V1', nom: 'Pèlerins 1', montant: 1340, urgenceJours: 112 }, // vide 112 j → PIRE, en 2ᵉ
  ],
});

describe('computePilotageFamilles', () => {
  it('F-1 : une famille vide n\'a pas de carte', () => {
    const r = computePilotageFamilles({ impaye: [{ ref: 'X', montant: 100, urgenceJours: 5 }], vacant: [] });
    expect(r.familles.map((f) => f.id)).toEqual(['impaye']);
  });

  it('F-2 : ordre = coût du retard, indépendant de l\'ordre des clés d\'entrée', () => {
    // clés fournies dans le désordre — le résultat doit rester l'ordre canonique.
    const r = computePilotageFamilles({
      vacant: [{ ref: 'V', montant: 1, urgenceJours: 1 }],
      depot: [{ ref: 'D', montant: 1, urgenceJours: 1 }],
      entretien: [{ ref: 'E', urgenceJours: 1 }],
      irl: [{ ref: 'I', montant: 1, urgenceJours: 1 }],
    });
    expect(r.familles.map((f) => f.id)).toEqual(['depot', 'irl', 'entretien', 'vacant']);
  });

  it('F-3 : regroupement par zone — 4 Argent, 4 Gestion, aucune Pilotage', () => {
    const r = computePilotageFamilles(jeu());
    expect(r.parZone.map((z) => z.id)).toEqual(['argent', 'gestion']);
    const argent = r.parZone.find((z) => z.id === 'argent');
    const gestion = r.parZone.find((z) => z.id === 'gestion');
    expect(argent.familles.map((f) => f.id)).toEqual(['depot', 'irl', 'impaye', 'regul']);
    expect(gestion.familles.map((f) => f.id)).toEqual(['finbail', 'document', 'entretien', 'vacant']);
  });

  it('F-4 : pire cas en tête — dépôt le plus proche de sa limite, impayé/vacance le plus ancien', () => {
    const r = computePilotageFamilles(jeu());
    const byId = Object.fromEntries(r.familles.map((f) => [f.id, f]));
    expect(byId.depot.pire.nom).toBe('Marion');       // 19 j < 47 j
    expect(byId.impaye.pire.nom).toBe('Meyer');       // 67 j > 34 j
    expect(byId.vacant.pire.nom).toBe('Pèlerins 1');  // 112 j > 47 j
  });

  it('F-5 : montant = Σ des montants ; vacance négative', () => {
    const r = computePilotageFamilles(jeu());
    const byId = Object.fromEntries(r.familles.map((f) => [f.id, f]));
    expect(byId.depot.montant).toBe(1360);            // 720 + 640
    expect(byId.impaye.montant).toBe(2350);           // 1530 + 820
    expect(byId.vacant.montant).toBe(-2230);          // −(1340 + 890)
    expect(byId.regul.montant).toBeNull();            // pas d'euros
  });

  it('F-6 : count par famille et total', () => {
    const r = computePilotageFamilles(jeu());
    const byId = Object.fromEntries(r.familles.map((f) => [f.id, f]));
    expect(byId.depot.count).toBe(2);
    expect(byId.irl.count).toBe(1);
    expect(r.total).toBe(2 + 1 + 2 + 1 + 1 + 1 + 1 + 2);   // 11
  });

  it('entrée vide → aucune famille, total 0', () => {
    const r = computePilotageFamilles({});
    expect(r.familles).toEqual([]);
    expect(r.parZone).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('robuste : items falsy filtrés, urgenceJours manquant relégué en fin', () => {
    const r = computePilotageFamilles({ impaye: [null, { ref: 'A', montant: 1 }, { ref: 'B', montant: 1, urgenceJours: 10 }] });
    const imp = r.familles[0];
    expect(imp.count).toBe(2);
    expect(imp.pire.ref).toBe('B');                   // A (sans urgenceJours) est relégué
  });

  it('les 8 familles sont définies et ordreFamille les classe', () => {
    expect(FAMILLES).toHaveLength(8);
    expect(ordreFamille('depot')).toBe(0);
    expect(ordreFamille('vacant')).toBe(7);
    expect(ordreFamille('inconnue')).toBe(-1);
  });
});

describe('pilotagePay — la pastille de paiement colle à la bulle Impayés (audit KPI §1)', () => {
  it('hors bail (pas de locataire) → na', () => {
    expect(pilotagePay(false, 'L1', new Set(['L1']), -700)).toBe('na');
  });

  it('membre de la bulle Impayés → neg, même avec un solde brut positif (l\'arriéré prime)', () => {
    expect(pilotagePay(true, 'L1', new Set(['L1']), 200)).toBe('neg');
  });

  it('LE 1er DU MOIS : loyer courant non versé → PAS « en retard »', () => {
    // La bulle est tolérante (le mois courant avant le 10 n'y entre pas) → 'L1' n'est PAS dans
    // impayeRefs. Le solde BRUT est négatif (loyer du mois non encaissé) — mais ce n'est pas un
    // retard. La pastille doit rester 'pos', jamais 'neg'. C'est le bug corrigé.
    expect(pilotagePay(true, 'L1', new Set([]), -700)).toBe('pos');
  });

  it('pas d\'arriéré + solde positif → avance', () => {
    expect(pilotagePay(true, 'L1', new Set([]), 620)).toBe('adv');
  });

  it('pas d\'arriéré + solde nul → à jour', () => {
    expect(pilotagePay(true, 'L1', new Set([]), 0)).toBe('pos');
  });

  it('accepte un tableau de réfs comme un Set', () => {
    expect(pilotagePay(true, 'L2', ['L1', 'L2'], 0)).toBe('neg');
    expect(pilotagePay(true, 'L3', ['L1', 'L2'], 0)).toBe('pos');
  });
});
