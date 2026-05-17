/**
 * Tests pour UX-GROUP-BY-IMMEUBLE drill-downs v15.77.
 * Module js/core/irl-drill.js — helpers purs drill IRL par immeuble.
 */
import { describe, it, expect } from 'vitest';
import {
  _irlDeltaImm,
  _irlListAlertes,
  _irlProjectionAnnuelle,
  _irlListLotsForDrill,
} from '../../js/core/irl-drill.js';

// ═══════════════════════════════════════════════════════════════════
//  _irlDeltaImm
// ═══════════════════════════════════════════════════════════════════

describe('_irlDeltaImm — somme deltas révisions applicables', () => {
  it('cas nominal : 2 lots applicables', () => {
    const logs = [{ ref: 'A', hc: 650 }, { ref: 'B', hc: 720 }];
    const fn = (l) => l.ref === 'A'
      ? { isApplicable: true, nouveauHC: 655.05 }
      : { isApplicable: true, nouveauHC: 725.62 };
    expect(_irlDeltaImm(logs, fn)).toBe(10.67);
  });

  it('exclut lots dejaApplique (déjà comptabilisés)', () => {
    const logs = [{ ref: 'A', hc: 100 }, { ref: 'B', hc: 100 }];
    const fn = (l) => l.ref === 'A'
      ? { isApplicable: true, nouveauHC: 110 }
      : { isApplicable: true, dejaApplique: true, nouveauHC: 110 };
    expect(_irlDeltaImm(logs, fn)).toBe(10);
  });

  it('exclut lots non applicables (gel, insuffisant, pasEncore)', () => {
    const logs = [{ ref: 'A', hc: 500 }, { ref: 'B', hc: 600 }, { ref: 'C', hc: 700 }];
    const fn = (l) => {
      if (l.ref === 'A') return { gelDpeFG: true };
      if (l.ref === 'B') return { insuffisant: true };
      if (l.ref === 'C') return { pasEncoreApplicable: true };
      return null;
    };
    expect(_irlDeltaImm(logs, fn)).toBe(0);
  });

  it('arrondi 2 décimales', () => {
    const logs = [{ ref: 'X', hc: 100 }];
    const fn = () => ({ isApplicable: true, nouveauHC: 100.333 });
    expect(_irlDeltaImm(logs, fn)).toBe(0.33);
  });

  it('robustesse : array vide, fn null, log null', () => {
    expect(_irlDeltaImm([], () => null)).toBe(0);
    expect(_irlDeltaImm([{ hc: 100 }], null)).toBe(0);
    expect(_irlDeltaImm(null, () => null)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _irlListAlertes
// ═══════════════════════════════════════════════════════════════════

describe('_irlListAlertes — classification des alertes', () => {
  it('détecte DPE F/G gelé', () => {
    const logs = [{ ref: 'A', locataire: 'X' }];
    const fn = () => ({ gelDpeFG: true, dpe: 'F' });
    const out = _irlListAlertes(logs, fn);
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('gel');
    expect(out[0].detail).toMatch(/DPE F/);
  });

  it('détecte DPE manquant', () => {
    const out = _irlListAlertes([{ ref: 'A' }], () => ({ dpeManquant: true }));
    expect(out[0].type).toBe('dpeManquant');
  });

  it('détecte index IRL manquant', () => {
    const out = _irlListAlertes([{ ref: 'A' }], () => ({ insuffisant: true, missingKey: 'T2 2026' }));
    expect(out[0].type).toBe('insuffisant');
    expect(out[0].detail).toMatch(/T2 2026/);
  });

  it('ignore lots OK (isApplicable, dejaApplique, pasEncoreApplicable)', () => {
    const logs = [{ ref: 'A' }, { ref: 'B' }, { ref: 'C' }];
    const fn = (l) => {
      if (l.ref === 'A') return { isApplicable: true };
      if (l.ref === 'B') return { dejaApplique: true };
      return { pasEncoreApplicable: true };
    };
    expect(_irlListAlertes(logs, fn)).toEqual([]);
  });

  it('cumulé : 1 gel + 1 insuffisant + 1 dpeManquant + 1 OK = 3 alertes', () => {
    const logs = [{ ref: 'A' }, { ref: 'B' }, { ref: 'C' }, { ref: 'D' }];
    const fn = (l) => {
      if (l.ref === 'A') return { gelDpeFG: true };
      if (l.ref === 'B') return { insuffisant: true };
      if (l.ref === 'C') return { dpeManquant: true };
      return { isApplicable: true };
    };
    const out = _irlListAlertes(logs, fn);
    expect(out.length).toBe(3);
    expect(out.map(x => x.type).sort()).toEqual(['dpeManquant', 'gel', 'insuffisant']);
  });

  it('robustesse', () => {
    expect(_irlListAlertes([], () => null)).toEqual([]);
    expect(_irlListAlertes(null, () => null)).toEqual([]);
    expect(_irlListAlertes([{ ref: 'A' }], null)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _irlProjectionAnnuelle
// ═══════════════════════════════════════════════════════════════════

describe('_irlProjectionAnnuelle', () => {
  it('cas nominal : 1950 € × 12 = 23 400 €', () => {
    expect(_irlProjectionAnnuelle(1950)).toBe(23400);
  });
  it('arrondi 2 décimales', () => {
    expect(_irlProjectionAnnuelle(100.333)).toBe(1204);
  });
  it('robustesse : non-number → 0', () => {
    expect(_irlProjectionAnnuelle(null)).toBe(0);
    expect(_irlProjectionAnnuelle('1950')).toBe(0);
    expect(_irlProjectionAnnuelle(Infinity)).toBe(0);
    expect(_irlProjectionAnnuelle(NaN)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _irlListLotsForDrill
// ═══════════════════════════════════════════════════════════════════

describe('_irlListLotsForDrill — résumé statuts', () => {
  it('Applicable → statut "✓ Applicable" + nouveauHC arrondi', () => {
    const out = _irlListLotsForDrill(
      [{ ref: 'A', locataire: 'Dupont', hc: 650 }],
      () => ({ isApplicable: true, nouveauHC: 655.054 })
    );
    expect(out[0]).toMatchObject({ ref: 'A', locataire: 'Dupont', hc: 650, statut: '✓ Applicable', nouveauHC: 655.05 });
  });

  it('Gelé DPE F → statut adapté', () => {
    const out = _irlListLotsForDrill([{ ref: 'A', hc: 580 }], () => ({ gelDpeFG: true, dpe: 'F' }));
    expect(out[0].statut).toBe('🔒 Gelé DPE F');
    expect(out[0].nouveauHC).toBeNull();
  });

  it('Bail < 1 an → "⏳ Bail < 1 an"', () => {
    const out = _irlListLotsForDrill([{ ref: 'A' }], () => ({ pasEncoreApplicable: true }));
    expect(out[0].statut).toBe('⏳ Bail < 1 an');
  });

  it('Déjà appliquée → "✅ Appliquée"', () => {
    const out = _irlListLotsForDrill([{ ref: 'A' }], () => ({ isApplicable: true, dejaApplique: true }));
    expect(out[0].statut).toBe('✅ Appliquée');
  });

  it('DPE manquant + index manquant', () => {
    const logs = [{ ref: 'A' }, { ref: 'B' }];
    const fn = (l) => l.ref === 'A' ? { dpeManquant: true } : { insuffisant: true, missingKey: 'T3 2026' };
    const out = _irlListLotsForDrill(logs, fn);
    expect(out[0].statut).toBe('📋 DPE manquant');
    expect(out[1].statut).toMatch(/T3 2026/);
  });

  it('rev null → "⚠ Bail incomplet"', () => {
    const out = _irlListLotsForDrill([{ ref: 'A' }], () => null);
    expect(out[0].statut).toBe('⚠ Bail incomplet');
  });

  it('robustesse : logs non-array, skip sans ref', () => {
    expect(_irlListLotsForDrill(null, () => null)).toEqual([]);
    expect(_irlListLotsForDrill([{}, { ref: 'X' }], () => null).length).toBe(1);
  });
});
