import { describe, it, expect } from 'vitest';
import { _isLoyerCategory, _isChargeRecupCategory, _countMatching } from './charges.js';

describe('_isLoyerCategory', () => {
  it('accepte legacy "Loyers"', () => {
    expect(_isLoyerCategory('Loyers')).toBe(true);
  });

  it('accepte LEGAL-2044 "Loyers encaissés"', () => {
    expect(_isLoyerCategory('Loyers encaissés')).toBe(true);
  });

  it('accepte LEGAL-2044 "Arriérés de loyers" (211)', () => {
    expect(_isLoyerCategory('Arriérés de loyers')).toBe(true);
  });

  it('rejette les autres recettes 211 si elles existent', () => {
    // GLI = 213, pas 211 → ce N'EST PAS un loyer même si recette
    expect(_isLoyerCategory('Indemnité GLI / loyers impayés')).toBe(false);
  });

  it('rejette charges', () => {
    expect(_isLoyerCategory('Charges')).toBe(false);
    expect(_isLoyerCategory('Provisions pour charges de copropriété')).toBe(false);
    expect(_isLoyerCategory('Travaux de réparation et d\'entretien')).toBe(false);
  });

  it('rejette catégorie inconnue/custom', () => {
    expect(_isLoyerCategory('FooBar')).toBe(false);
    expect(_isLoyerCategory('')).toBe(false);
    expect(_isLoyerCategory(null)).toBe(false);
  });

  it('accepte référentiel STD custom', () => {
    const custom = [{ nom: 'Mon Loyer Custom', ligne2044: '211', type: 'recette' }];
    expect(_isLoyerCategory('Mon Loyer Custom', custom)).toBe(true);
    expect(_isLoyerCategory('Loyers encaissés', custom)).toBe(false);
  });
});

describe('_isChargeRecupCategory', () => {
  it('accepte legacy "Charges"', () => {
    expect(_isChargeRecupCategory('Charges')).toBe(true);
  });

  it('accepte "Charges de copropriété" (229)', () => {
    expect(_isChargeRecupCategory('Charges de copropriété')).toBe(true);
  });

  it('accepte "Charges récupérables (eau, énergie…)" (flag recup, hors 2044)', () => {
    // FIX-REGUL-RECUP : l'intitulé eau/énergie tagué à l'import DOIT entrer dans la régul.
    // Avant : ignoré car ligne2044 vide → charges récup jamais refacturées au locataire.
    expect(_isChargeRecupCategory('Charges récupérables (eau, énergie…)')).toBe(true);
  });

  it('accepte "Régularisation provisions copro N-1" (230)', () => {
    expect(_isChargeRecupCategory('Régularisation provisions copro N-1')).toBe(true);
  });

  it('REJETTE "Charges récupérables non récupérées" (225 = part bailleur)', () => {
    // Important : 225 = part bailleur non refacturable → exclu de la régul
    expect(_isChargeRecupCategory('Charges récupérables non récupérées')).toBe(false);
  });

  it('rejette travaux (224 = charges propriétaire pas récupérables)', () => {
    expect(_isChargeRecupCategory('Travaux de réparation et d\'entretien')).toBe(false);
  });

  it('rejette assurance PNO (223 = charge bailleur)', () => {
    expect(_isChargeRecupCategory('Primes d\'assurance PNO')).toBe(false);
  });

  it('rejette loyers', () => {
    expect(_isChargeRecupCategory('Loyers')).toBe(false);
    expect(_isChargeRecupCategory('Loyers encaissés')).toBe(false);
  });

  it('rejette inconnue', () => {
    expect(_isChargeRecupCategory('')).toBe(false);
    expect(_isChargeRecupCategory(null)).toBe(false);
  });
});

describe('Scenario complet — BUG-CHARGE-001', () => {
  // Reproduit le bug : avec v14.78 LEGAL-2044, un utilisateur tagge ses mvts
  // avec les nouvelles catégories. computeRegul filtre 'Loyers' strict → 0 match.
  const mvtsLegacy = [
    { date: '2026-01-15', cat: 'Loyers', cr: 1000, qui: 'F-001' },
    { date: '2026-02-15', cat: 'Loyers', cr: 1000, qui: 'F-001' },
    { date: '2026-01-20', cat: 'Charges', db: 200, imm: 'Beta' }
  ];

  const mvtsModern = [
    { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' },
    { date: '2026-02-15', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' },
    { date: '2026-01-20', cat: 'Charges de copropriété', db: 200, imm: 'Beta' }
  ];

  it('AVANT FIX : filtre legacy stricte casse avec catégories LEGAL-2044', () => {
    const provLegacy = _countMatching(mvtsModern, m => m.cat === 'Loyers' && m.cr > 0);
    expect(provLegacy).toBe(0); // ← le bug : 0 provision détectée
    const chgLegacy = _countMatching(mvtsModern, m => m.cat === 'Charges' && m.db > 0);
    expect(chgLegacy).toBe(0); // ← bug
  });

  it('APRÈS FIX : helpers acceptent les deux formats', () => {
    const provModern = _countMatching(mvtsModern, m => _isLoyerCategory(m.cat) && m.cr > 0);
    expect(provModern).toBe(2); // 2 mois de loyer
    const chgModern = _countMatching(mvtsModern, m => _isChargeRecupCategory(m.cat) && m.db > 0);
    expect(chgModern).toBe(1);
  });

  it('APRÈS FIX : compatibilité 100% avec legacy', () => {
    const provLeg = _countMatching(mvtsLegacy, m => _isLoyerCategory(m.cat) && m.cr > 0);
    expect(provLeg).toBe(2);
    const chgLeg = _countMatching(mvtsLegacy, m => _isChargeRecupCategory(m.cat) && m.db > 0);
    expect(chgLeg).toBe(1);
  });

  it('APRÈS FIX : mix legacy + modern dans même DB → match les deux', () => {
    const mvtsMix = [...mvtsLegacy, ...mvtsModern];
    const prov = _countMatching(mvtsMix, m => _isLoyerCategory(m.cat) && m.cr > 0);
    expect(prov).toBe(4); // 2 legacy + 2 modern
    const chg = _countMatching(mvtsMix, m => _isChargeRecupCategory(m.cat) && m.db > 0);
    expect(chg).toBe(2);
  });

  it('FIX-REGUL-RECUP : une charge « Charges récupérables (eau, énergie…) » entre dans la régul', () => {
    // Le vrai bug remonté : eau/énergie taguée à l'import → ignorée par computeRegul.
    const mvts = [
      { date: '2026-03-10', cat: 'Charges récupérables (eau, énergie…)', db: 320, qui: 'F-001' },
      { date: '2026-04-10', cat: 'Charges récupérables (eau, énergie…)', db: 180, qui: 'F-001' },
      { date: '2026-05-10', cat: 'Travaux (entretien, réparation, amélioration)', db: 500, imm: 'Beta' } // NON récup
    ];
    const chg = _countMatching(mvts, m => _isChargeRecupCategory(m.cat) && m.db > 0);
    expect(chg).toBe(2); // les 2 lignes eau/énergie, pas les travaux
  });
});
