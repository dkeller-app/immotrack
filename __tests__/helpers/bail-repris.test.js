import { describe, it, expect } from 'vitest';
import { buildReprisBail } from './bail-repris.js';

describe('buildReprisBail', () => {
  const occ = { locataire: 'MARTIN TEST', hc: 680, ch: 50, dg: 680, debut: '2021-09-01' };
  it('produit un bail typeContrat:repris, type:nu, sans signature', () => {
    const b = buildReprisBail(occ, 'SCI TEST', 'A-101', '2026-06-03T10:00:00.000Z');
    expect(b.typeContrat).toBe('repris');
    expect(b.type).toBe('nu');
    expect('signatures' in b).toBe(false);
    expect(b.entity).toBe('SCI TEST');
    expect(b.hc).toBe(680);
    expect(b.ch).toBe(50);
    expect(b.dg).toBe(680);
    expect(b.debut).toBe('2021-09-01');
    expect(b.fin).toBe('');
    expect(b.irl).toBe('');
    expect(b.locataires).toEqual([{ nom: 'MARTIN TEST' }]);
    expect(b.nom).toBe('MARTIN TEST');
    expect(b.source).toEqual({ import: 'acte', acteRef: '', importeLe: '2026-06-03T10:00:00.000Z' });
  });
  it('coerce les nombres et gère les champs manquants', () => {
    const b = buildReprisBail({ locataire: 'X' }, 'E', 'R', 'now');
    expect(b.hc).toBe(0);
    expect(b.ch).toBe(0);
    expect(b.dg).toBe(0);
    expect(b.debut).toBe('');
  });
  it('locataire vide → locataires []', () => {
    const b = buildReprisBail({}, 'E', 'R', 'now');
    expect(b.locataires).toEqual([]);
    expect(b.nom).toBe('');
  });
});
