/**
 * C2 — SUIVI-LOYERS-SOURCE-UNIQUE / Finances maître de l'arriéré.
 * Fondation : la position d'OUVERTURE (dette reportée d'avant la fenêtre) injectée dans le
 * netting via opts.opening. Le total d'arriéré du moteur (que l'Accueil lira via Finances) doit
 * inclure cette dette d'ouverture, recouvrée en priorité (loyer avant charge), attribuée à M0.
 */
import { describe, it, expect } from 'vitest';
import { _computeLoyerNetting } from '../../js/core/loyer-du-mois.js';

const sigma = (r, k) => r.retardMois.reduce((s, m) => s + m[k], 0);

describe('C2 — position d\'ouverture d\'arriéré', () => {
  it('sans ouverture : comportement inchangé (mois soldé → 0)', () => {
    const r = _computeLoyerNetting([{ hcDue: 500, chDue: 0, received: 500 }]);
    expect(r.retardMois[0].loyer).toBe(0);
    expect(r.loyerArrear).toBe(0);
  });

  it('ouverture non recouvrée (mois juste soldé) → arriéré = ouverture, Σ retardMois = final', () => {
    const r = _computeLoyerNetting([{ hcDue: 500, chDue: 0, received: 500 }], false, { loyer: 500, charge: 0 });
    expect(r.loyerArrear).toBe(500);          // la dette d'ouverture persiste
    expect(sigma(r, 'loyer')).toBe(500);      // invariant : Σ retardMois = arriéré final (M0)
  });

  it('ouverture recouvrée par un surplus du mois', () => {
    const r = _computeLoyerNetting([{ hcDue: 500, chDue: 0, received: 1000 }], false, { loyer: 500, charge: 0 });
    expect(r.loyerArrear).toBe(0);            // 500 de surplus soldent l'ouverture
    expect(sigma(r, 'loyer')).toBe(0);
  });

  it('priorité loyer avant charge sur le recouvrement de l\'ouverture', () => {
    // 300 de surplus, ouverture {loyer:500, charge:200} : le loyer se solde d'abord (200 restant),
    // la charge reste entière (200).
    const r = _computeLoyerNetting([{ hcDue: 0, chDue: 0, received: 300 }], false, { loyer: 500, charge: 200 });
    expect(r.loyerArrear).toBe(200);
    expect(r.chargeArrear).toBe(200);
  });

  it('l\'ouverture ne touche pas l\'avance : un lot à jour + surplus > ouverture → avance nette', () => {
    // dû 500, reçu 800, ouverture 100 : 500 loyer courant, 100 solde ouverture, 200 restent = avance
    const r = _computeLoyerNetting([{ hcDue: 500, chDue: 0, received: 800 }], false, { loyer: 100, charge: 0 });
    expect(r.loyerArrear).toBe(0);
    expect(r.avance).toBe(200);
  });

  it('AVANCE d\'ouverture (trop-perçu N-1) : couvre les 1ers mois → aucun faux retard (audit #1)', () => {
    // 2 mois dus 500 ; le 1er reçoit 0 (payé d'avance en N-1), le 2e est payé. Avance d'ouverture 500.
    const r = _computeLoyerNetting([{ hcDue: 500, chDue: 0, received: 0 }, { hcDue: 500, chDue: 0, received: 500 }], false, { avance: 500 });
    expect(r.loyerArrear).toBe(0);
    expect(r.retardMois.reduce((s, m) => s + m.loyer, 0)).toBe(0);
  });
});
