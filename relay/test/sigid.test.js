import { describe, it, expect } from 'vitest';
import { sideOf, computeSigId } from '../public/sign/sigid.js';

describe('sideOf', () => {
  it('classe le locataire et le preneur côté locataire', () => {
    expect(sideOf('locataire')).toBe('locataire');
    expect(sideOf('Locataire principal')).toBe('locataire');
    expect(sideOf('preneur')).toBe('locataire');
  });
  it('classe bailleur, gérant et mandataire côté bailleur', () => {
    expect(sideOf('bailleur')).toBe('bailleur');
    expect(sideOf('gérant')).toBe('bailleur');
    expect(sideOf('mandataire')).toBe('bailleur');
  });
});

describe('computeSigId', () => {
  const signers = [
    { role: 'bailleur', ordre: 0 },
    { role: 'locataire', ordre: 1 },
    { role: 'locataire', ordre: 2 }
  ];
  it('indexe par rang dans le même côté', () => {
    expect(computeSigId(signers, 0)).toBe('bailleur-0');
    expect(computeSigId(signers, 1)).toBe('loc-0');
    expect(computeSigId(signers, 2)).toBe('loc-1');
  });
  it('lève si index hors borne', () => {
    expect(() => computeSigId(signers, 9)).toThrow();
  });
});
