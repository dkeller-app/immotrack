/**
 * Tests pour EQUIP-CONTROLES-PERIODIQUES v15.08 Sprint 9 V1.1.
 * Module js/core/equipements.js — helpers purs entretien locataire.
 */
import { describe, it, expect } from 'vitest';
import {
  _calculerProchainControle, _buildClauseEntretienItems, _isDaafCovered
} from '../../js/core/equipements.js';

// ═══════════════════════════════════════════════════════════════════
//  _calculerProchainControle
// ═══════════════════════════════════════════════════════════════════

describe('_calculerProchainControle — fréquence annuelle', () => {
  it('chaudière gaz (1 an) : 2025-09-15 → 2026-09-15', () => {
    expect(_calculerProchainControle({ intervalYears: 1 }, '2025-09-15')).toBe('2026-09-15');
  });
  it('ECS gaz (1 an)', () => {
    expect(_calculerProchainControle({ intervalYears: 1 }, '2024-12-01')).toBe('2025-12-01');
  });
  it('défaut 1 an si pas de fréquence', () => {
    expect(_calculerProchainControle({}, '2025-06-01')).toBe('2026-06-01');
  });
});

describe('_calculerProchainControle — fréquence en mois', () => {
  it('climatisation > 12 kW (24 mois) : 2025-06-15 → 2027-06-15', () => {
    expect(_calculerProchainControle({ intervalMonths: 24 }, '2025-06-15')).toBe('2027-06-15');
  });
  it('citerne fioul (60 mois) : 2024-01-01 → 2029-01-01', () => {
    expect(_calculerProchainControle({ intervalMonths: 60 }, '2024-01-01')).toBe('2029-01-01');
  });
  it('intervalYears + intervalMonths cumulés (rare mais cohérent)', () => {
    // 1 an + 24 mois = 3 ans cumulés
    expect(_calculerProchainControle({ intervalYears: 1, intervalMonths: 24 }, '2025-01-01')).toBe('2028-01-01');
  });
});

describe('_calculerProchainControle — edge cases', () => {
  it('null/undefined → null', () => {
    expect(_calculerProchainControle(null, '2025-01-01')).toBeNull();
    expect(_calculerProchainControle({ intervalYears: 1 }, null)).toBeNull();
    expect(_calculerProchainControle({ intervalYears: 1 }, '')).toBeNull();
  });
  it('date invalide → null', () => {
    expect(_calculerProchainControle({ intervalYears: 1 }, 'pas-une-date')).toBeNull();
    expect(_calculerProchainControle({ intervalYears: 1 }, '2025/06/01')).toBeNull();
  });
  it('roll-over mois 12 → janvier année suivante', () => {
    expect(_calculerProchainControle({ intervalMonths: 1 }, '2025-12-15')).toBe('2026-01-15');
  });
  it('pas de bug timezone (string-based)', () => {
    // 2025-01-15 + 6 mois = 2025-07-15 quelle que soit la timezone
    expect(_calculerProchainControle({ intervalMonths: 6 }, '2025-01-15')).toBe('2025-07-15');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _buildClauseEntretienItems
// ═══════════════════════════════════════════════════════════════════

describe('_buildClauseEntretienItems — chauffage', () => {
  it('Bail gaz → 1 item entretien annuel chaudière', () => {
    const items = _buildClauseEntretienItems({}, { chauffGaz: true });
    expect(items.length).toBe(1);
    expect(items[0]).toMatch(/Entretien annuel du système de chauffage/);
  });
  it('Bail fioul → entretien chauffage + ramonage', () => {
    const items = _buildClauseEntretienItems({}, { chauffFioul: true });
    expect(items.length).toBe(2);
    expect(items[1]).toMatch(/Ramonage annuel/);
  });
  it('Bail bois + poêle granulés → entretien + ramonage', () => {
    const items = _buildClauseEntretienItems({}, { chauffBois: true, chauffPoeleGran: true });
    expect(items.length).toBe(2);
  });
});

describe('_buildClauseEntretienItems — chauffe-eau', () => {
  it('ECS gaz → item chauffe-eau gaz', () => {
    const items = _buildClauseEntretienItems({ equipements: { ecsType: 'gaz' } }, {});
    expect(items.some(i => /chauffe-eau gaz/i.test(i))).toBe(true);
  });
  it('ECS thermodynamique → item dédié', () => {
    const items = _buildClauseEntretienItems({ equipements: { ecsType: 'thermodynamique' } }, {});
    expect(items.some(i => /thermodynamique/i.test(i))).toBe(true);
  });
  it('ECS électrique → pas d\'item (pas d\'entretien légal)', () => {
    const items = _buildClauseEntretienItems({ equipements: { ecsType: 'electrique' } }, {});
    expect(items.length).toBe(0);
  });
});

describe('_buildClauseEntretienItems — climatisation > 12 kW', () => {
  it('Clim été 15 kW → item inspection biennale', () => {
    const items = _buildClauseEntretienItems({ equipements: { climEte: true, climEtePuissance: 15 } }, {});
    expect(items.some(i => /Inspection biennale/i.test(i))).toBe(true);
  });
  it('Clim été 8 kW → pas d\'item (sous seuil 12 kW)', () => {
    const items = _buildClauseEntretienItems({ equipements: { climEte: true, climEtePuissance: 8 } }, {});
    expect(items.length).toBe(0);
  });
  it('Clim activée sans puissance → pas d\'item', () => {
    const items = _buildClauseEntretienItems({ equipements: { climEte: true } }, {});
    expect(items.length).toBe(0);
  });
});

describe('_buildClauseEntretienItems — autres équipements', () => {
  it('Citerne fioul → item quinquennal', () => {
    const items = _buildClauseEntretienItems({ equipements: { citerneFioul: true } }, {});
    expect(items.some(i => /quinquennal/i.test(i))).toBe(true);
  });
  it('VMC individuelle → item nettoyage bouches', () => {
    const items = _buildClauseEntretienItems({ equipements: { vmcType: 'individuelle' } }, {});
    expect(items.some(i => /bouches de ventilation/i.test(i))).toBe(true);
  });
  it('VMC collective → pas d\'item (charge bailleur)', () => {
    const items = _buildClauseEntretienItems({ equipements: { vmcType: 'collective' } }, {});
    expect(items.length).toBe(0);
  });
  it('Conduit fumée seul (sans bail chauff) → item ramonage', () => {
    const items = _buildClauseEntretienItems({ equipements: { conduitFumee: true } }, {});
    expect(items.length).toBe(1);
    expect(items[0]).toMatch(/Ramonage/);
  });
});

describe('_buildClauseEntretienItems — cas combinés', () => {
  it('Logement complet : gaz + ECS gaz + clim 15kW + VMC indiv + citerne → 5 items', () => {
    const items = _buildClauseEntretienItems(
      { equipements: { ecsType: 'gaz', climEte: true, climEtePuissance: 15, vmcType: 'individuelle', citerneFioul: true } },
      { chauffGaz: true }
    );
    expect(items.length).toBe(5); // chauffage + chauffe-eau + clim + citerne + VMC
  });
  it('Aucun équipement applicable → array vide', () => {
    expect(_buildClauseEntretienItems({}, {})).toEqual([]);
  });
  it('Log null → array vide', () => {
    expect(_buildClauseEntretienItems(null, {})).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _isDaafCovered
// ═══════════════════════════════════════════════════════════════════

describe('_isDaafCovered', () => {
  it('Statut string "present" → true', () => {
    expect(_isDaafCovered('present')).toBe(true);
  });
  it('Statut string "absent" → false', () => {
    expect(_isDaafCovered('absent')).toBe(false);
  });
  it('Statut string "defaut" → false (à corriger)', () => {
    expect(_isDaafCovered('defaut')).toBe(false);
  });
  it('Log avec daafPresent=true → true', () => {
    expect(_isDaafCovered({ equipements: { daafPresent: true } })).toBe(true);
  });
  it('Log avec daafPresent=false → false', () => {
    expect(_isDaafCovered({ equipements: { daafPresent: false } })).toBe(false);
  });
  it('Log avec daafPresent=null (non renseigné) → false', () => {
    expect(_isDaafCovered({ equipements: { daafPresent: null } })).toBe(false);
  });
  it('Log sans equipements → false', () => {
    expect(_isDaafCovered({})).toBe(false);
  });
  it('null/undefined → false', () => {
    expect(_isDaafCovered(null)).toBe(false);
    expect(_isDaafCovered(undefined)).toBe(false);
  });
});
