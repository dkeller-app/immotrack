import { describe, it, expect } from 'vitest';
import { buildSignaturePlan } from './bail-sign-plan.js';

const mk = (o) => Object.assign({ id: 'x', role: 'bailleur', nom: 'X', mode: 'pres', email: '' }, o);

describe('buildSignaturePlan', () => {
  it('ordonne les présentiels bailleur(s) puis locataire(s)', () => {
    const p = buildSignaturePlan([
      mk({ id: 'loc-1', role: 'locataire', nom: 'Jean', mode: 'pres' }),
      mk({ id: 'bailleur-1', role: 'bailleur', nom: 'DK', mode: 'pres' }),
    ]);
    expect(p.presentiels.map(s => s.id)).toEqual(['bailleur-1', 'loc-1']);
  });

  it('sépare distants et exclut les "no"', () => {
    const p = buildSignaturePlan([
      mk({ id: 'bailleur-1', role: 'bailleur', mode: 'pres' }),
      mk({ id: 'bailleur-2', role: 'bailleur', mode: 'no' }),
      mk({ id: 'loc-1', role: 'locataire', mode: 'dist', email: 'a@b.fr' }),
    ]);
    expect(p.presentiels.map(s => s.id)).toEqual(['bailleur-1']);
    expect(p.distants.map(s => s.id)).toEqual(['loc-1']);
    expect(p.hasSigners).toBe(true);
  });

  it('hasSigners=false si tout le monde en "no"', () => {
    const p = buildSignaturePlan([mk({ mode: 'no' })]);
    expect(p.hasSigners).toBe(false);
    expect(p.presentiels).toEqual([]);
    expect(p.distants).toEqual([]);
  });

  it('préserve l’ordre d’entrée entre signataires de même rôle', () => {
    const p = buildSignaturePlan([
      mk({ id: 'bailleur-2', role: 'bailleur', mode: 'pres' }),
      mk({ id: 'bailleur-1', role: 'bailleur', mode: 'pres' }),
    ]);
    expect(p.presentiels.map(s => s.id)).toEqual(['bailleur-2', 'bailleur-1']);
  });
});
