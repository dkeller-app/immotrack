/**
 * Lot 0 KPI — statut d'entretien (CDC §3.1/§3.2).
 *
 * Prouve que le module RÉPARE les trois défauts de l'ancienne branche `chauffage` :
 *   E-1  ne plante pas quand `equipData` est un OBJET indexé par clé (le vrai format écrit).
 *   E-2  lit les 12 obligations, pas seulement /chaud|chauff/ — un ramonage de poêle est vu.
 *   E-3  lit le champ `lastDate`, pas `dernierControle`.
 *   E-4  pire verdict l'emporte (ko > wn > ok) ; aucun équipement soumis → 'na'.
 */
import { describe, it, expect } from 'vitest';
import { computeEntretienStatut } from '../../js/core/entretien-statut.js';

// Sous-ensemble fidèle de EQUIP_RULES (mêmes clés, mêmes condFn, mêmes intervalles).
const RULES = [
  { key: 'CHAUDIERE_GAZ', intervalYears: 1, rappels: [30, 7], condFn: (b, l) => !!(l && l.chauffage && l.chauffage.gaz) },
  { key: 'POELE_BOIS_RAM', intervalYears: 1, rappels: [21], condFn: (b, l) => !!(l && l.chauffage && l.chauffage.poeleBois) },
  { key: 'CLIM_ENT', intervalYears: 1, rappels: [], condFn: (b, l) => !!(l && l.chauffage && l.chauffage.clim) }, // info seule (rappels vide)
];
const TODAY = new Date('2026-08-26T00:00:00');
const logGaz = { ref: 'L1', chauffage: { gaz: true } };
const logGazPoele = { ref: 'L2', chauffage: { gaz: true, poeleBois: true } };
const bail = { debut: '2020-01-01' };

describe('computeEntretienStatut — répare la branche chauffage', () => {
  it('E-1 : equipData en OBJET indexé par clé ne plante pas (ancien bug : eq.find)', () => {
    const equipData = { CHAUDIERE_GAZ: { lastDate: '2026-05-01', interv: 'Chantal HVAC' } };
    expect(() => computeEntretienStatut({ equipData, rules: RULES, bail, log: logGaz, today: TODAY })).not.toThrow();
  });

  it('chaudière gaz contrôlée récemment → ok', () => {
    const r = computeEntretienStatut({ equipData: { CHAUDIERE_GAZ: { lastDate: '2026-05-01' } }, rules: RULES, bail, log: logGaz, today: TODAY });
    expect(r.statut).toBe('ok');
    expect(r.applicables).toBe(1);
  });

  it('E-3 : lit lastDate — un contrôle de plus de 13 mois passe en wn', () => {
    const r = computeEntretienStatut({ equipData: { CHAUDIERE_GAZ: { lastDate: '2025-06-01' } }, rules: RULES, bail, log: logGaz, today: TODAY });
    expect(r.statut).toBe('wn');           // échéance 2026-06-01 + 31 j grâce < 26/08 → en retard
    expect(r.enRetard).toBe(1);
    expect(r.pireRetardJours).toBeGreaterThan(0);
  });

  it('chaudière jamais contrôlée → ko', () => {
    const r = computeEntretienStatut({ equipData: {}, rules: RULES, bail, log: logGaz, today: TODAY });
    expect(r.statut).toBe('ko');
    expect(r.jamaisControle).toBe(1);
  });

  it('E-2 : un poêle à bois est vu (l\'ancien filtre /chaud|chauff/ le ratait)', () => {
    // chaudière gaz à jour, ramonage poêle jamais fait → le lot n'est PAS conforme.
    const equipData = { CHAUDIERE_GAZ: { lastDate: '2026-05-01' } }; // POELE_BOIS_RAM absent
    const r = computeEntretienStatut({ equipData, rules: RULES, bail, log: logGazPoele, today: TODAY });
    expect(r.applicables).toBe(2);         // gaz + ramonage poêle
    expect(r.statut).toBe('ko');           // le ramonage jamais fait tire le verdict au rouge
  });

  it('E-4 : pire verdict l\'emporte — gaz en retard + poêle jamais fait = ko', () => {
    const equipData = { CHAUDIERE_GAZ: { lastDate: '2024-01-01' } }; // gaz très en retard, poêle absent
    const r = computeEntretienStatut({ equipData, rules: RULES, bail, log: logGazPoele, today: TODAY });
    expect(r.enRetard).toBe(1);
    expect(r.jamaisControle).toBe(1);
    expect(r.statut).toBe('ko');           // ko > wn
  });

  it('aucun équipement soumis → na', () => {
    const r = computeEntretienStatut({ equipData: {}, rules: RULES, bail, log: { ref: 'L3', chauffage: {} }, today: TODAY });
    expect(r.statut).toBe('na');
    expect(r.applicables).toBe(0);
  });

  it('règle « info seule » (rappels vide) n\'est jamais une obligation — clim ignorée', () => {
    const r = computeEntretienStatut({ equipData: {}, rules: RULES, bail, log: { ref: 'L4', chauffage: { clim: true } }, today: TODAY });
    expect(r.statut).toBe('na');           // seule la clim s'applique, mais elle est info-only
  });

  it('entrées corrompues (equipData null, règle sans condFn) : robuste, pas de throw', () => {
    expect(() => computeEntretienStatut({ equipData: null, rules: [{ key: 'X' }, null], bail, log: logGaz, today: TODAY })).not.toThrow();
    const r = computeEntretienStatut({ equipData: null, rules: RULES, bail, log: logGaz, today: TODAY });
    expect(r.statut).toBe('ko');           // gaz applicable, jamais contrôlé
  });
});
