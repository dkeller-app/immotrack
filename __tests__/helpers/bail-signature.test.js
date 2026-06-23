/**
 * Tests bail-signature — date de signature manuelle (v15.344)
 */

import { describe, it, expect } from 'vitest';
import { resolveSignatureTimestamp } from './bail-signature.js';

const NOW = '2026-06-22T09:30:00.000Z';

describe('resolveSignatureTimestamp — date de signature choisie vs maintenant', () => {
  it('date valide YYYY-MM-DD → midi UTC ce jour-là', () => {
    expect(resolveSignatureTimestamp('2026-03-15', NOW)).toBe('2026-03-15T12:00:00.000Z');
  });

  it('autre date valide → midi UTC', () => {
    expect(resolveSignatureTimestamp('2026-12-01', NOW)).toBe('2026-12-01T12:00:00.000Z');
  });

  it('midi UTC garde le bon jour via slice(0,10)', () => {
    expect(resolveSignatureTimestamp('2026-03-15', NOW).slice(0, 10)).toBe('2026-03-15');
  });

  it('champ vide → maintenant (comportement par défaut conservé)', () => {
    expect(resolveSignatureTimestamp('', NOW)).toBe(NOW);
  });

  it('null / undefined → maintenant', () => {
    expect(resolveSignatureTimestamp(null, NOW)).toBe(NOW);
    expect(resolveSignatureTimestamp(undefined, NOW)).toBe(NOW);
  });

  it('format non ISO (JJ/MM/AAAA) → maintenant', () => {
    expect(resolveSignatureTimestamp('15/03/2026', NOW)).toBe(NOW);
  });

  it('date impossible (30 février) → maintenant (round-trip refusé)', () => {
    expect(resolveSignatureTimestamp('2026-02-30', NOW)).toBe(NOW);
  });

  it('mois/jour hors bornes (2026-13-01) → maintenant', () => {
    expect(resolveSignatureTimestamp('2026-13-01', NOW)).toBe(NOW);
  });

  it('chaîne parasite → maintenant', () => {
    expect(resolveSignatureTimestamp('demain', NOW)).toBe(NOW);
  });
});
