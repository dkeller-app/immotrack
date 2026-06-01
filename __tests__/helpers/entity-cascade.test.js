/**
 * Tests pour NAV-FILTRE-ENTITE-GLOBAL (Chantier A).
 * Module js/core/entity-cascade.js — cascade Entité → Immeuble → Bien.
 */
import { describe, it, expect } from 'vitest';
import {
  _immeublesForEntity,
  _logementsForScope,
  _resolveDropdownValue,
  _filterByEntity,
} from '../../js/core/entity-cascade.js';

const LOGS = [
  { ref: 'D-101', entity: 'SCI DD', imm: 'Damelevières' },
  { ref: 'D-102', entity: 'SCI DD', imm: 'Damelevières' },
  { ref: 'F-001', entity: 'SCI DD', imm: 'Ferrette' },
  { ref: 'M-RDC', entity: 'Didier',  imm: 'Morschwiller' },
  { ref: 'M-F3',  entity: 'Didier',  imm: 'Morschwiller' },
  { ref: 'S-1',   entity: 'SCI SM',  imm: 'Smart-Tower' },
];

// ═══════════════════════════════════════════════════════════════════
//  _immeublesForEntity
// ═══════════════════════════════════════════════════════════════════

describe('_immeublesForEntity', () => {
  it('non-array → []', () => {
    expect(_immeublesForEntity(null)).toEqual([]);
    expect(_immeublesForEntity(undefined)).toEqual([]);
  });
  it('entité vide → tous les immeubles distincts', () => {
    expect(_immeublesForEntity(LOGS, '')).toEqual(['Damelevières', 'Ferrette', 'Morschwiller', 'Smart-Tower']);
  });
  it('entité vide (undefined) → tous', () => {
    expect(_immeublesForEntity(LOGS)).toEqual(['Damelevières', 'Ferrette', 'Morschwiller', 'Smart-Tower']);
  });
  it('SCI DD → uniquement ses immeubles', () => {
    expect(_immeublesForEntity(LOGS, 'SCI DD')).toEqual(['Damelevières', 'Ferrette']);
  });
  it('Didier → uniquement Morschwiller (dédupliqué)', () => {
    expect(_immeublesForEntity(LOGS, 'Didier')).toEqual(['Morschwiller']);
  });
  it('entité inconnue → []', () => {
    expect(_immeublesForEntity(LOGS, 'SCI INEXISTANTE')).toEqual([]);
  });
  it('ignore les logements null + sans immeuble', () => {
    const logs = [null, { entity: 'A', imm: '' }, { entity: 'A', imm: 'IMM-1' }, undefined];
    expect(_immeublesForEntity(logs, 'A')).toEqual(['IMM-1']);
  });
  it('préserve l\'ordre d\'apparition', () => {
    const logs = [
      { entity: 'A', imm: 'Zeta' },
      { entity: 'A', imm: 'Alpha' },
      { entity: 'A', imm: 'Zeta' },
    ];
    expect(_immeublesForEntity(logs, 'A')).toEqual(['Zeta', 'Alpha']);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _logementsForScope
// ═══════════════════════════════════════════════════════════════════

describe('_logementsForScope', () => {
  it('non-array → []', () => {
    expect(_logementsForScope(null)).toEqual([]);
  });
  it('aucun filtre → tous', () => {
    expect(_logementsForScope(LOGS, '', '').length).toBe(6);
    expect(_logementsForScope(LOGS).length).toBe(6);
  });
  it('entité seule (SCI DD) → 3 logements', () => {
    const out = _logementsForScope(LOGS, 'SCI DD', '');
    expect(out.map(l => l.ref)).toEqual(['D-101', 'D-102', 'F-001']);
  });
  it('entité + immeuble (SCI DD ∩ Damelevières) → 2 logements', () => {
    const out = _logementsForScope(LOGS, 'SCI DD', 'Damelevières');
    expect(out.map(l => l.ref)).toEqual(['D-101', 'D-102']);
  });
  it('immeuble seul (Morschwiller) → 2 logements', () => {
    const out = _logementsForScope(LOGS, '', 'Morschwiller');
    expect(out.map(l => l.ref)).toEqual(['M-RDC', 'M-F3']);
  });
  it('combinaison incohérente (SCI SM ∩ Damelevières) → []', () => {
    expect(_logementsForScope(LOGS, 'SCI SM', 'Damelevières')).toEqual([]);
  });
  it('ignore les null', () => {
    expect(_logementsForScope([null, LOGS[0], undefined], 'SCI DD').length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _resolveDropdownValue (Q1 reset auto)
// ═══════════════════════════════════════════════════════════════════

describe('_resolveDropdownValue', () => {
  it('valeur vide reste vide (« Tous »)', () => {
    expect(_resolveDropdownValue('', ['A', 'B'])).toBe('');
  });
  it('valeur toujours valide → conservée', () => {
    expect(_resolveDropdownValue('Ferrette', ['Damelevières', 'Ferrette'])).toBe('Ferrette');
  });
  it('valeur devenue invalide → reset « Tous »', () => {
    expect(_resolveDropdownValue('Damelevières', ['Smart-Tower'])).toBe('');
  });
  it('validValues vide → reset', () => {
    expect(_resolveDropdownValue('X', [])).toBe('');
    expect(_resolveDropdownValue('X', null)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _filterByEntity (branchement renderers)
// ═══════════════════════════════════════════════════════════════════

describe('_filterByEntity', () => {
  it('non-array → []', () => {
    expect(_filterByEntity(null, 'A')).toEqual([]);
  });
  it('entité vide → copie de tous', () => {
    const out = _filterByEntity(LOGS, '');
    expect(out.length).toBe(6);
    expect(out).not.toBe(LOGS); // copie, pas la même référence
  });
  it('filtre par entité (accesseur par défaut .entity)', () => {
    expect(_filterByEntity(LOGS, 'SCI DD').map(l => l.ref)).toEqual(['D-101', 'D-102', 'F-001']);
  });
  it('accesseur custom (ex mouvement.qui → entité)', () => {
    const mvs = [
      { id: 1, src: 'SCI DD' },
      { id: 2, src: 'Didier' },
      { id: 3, src: 'SCI DD' },
    ];
    const out = _filterByEntity(mvs, 'SCI DD', m => m.src);
    expect(out.map(m => m.id)).toEqual([1, 3]);
  });
});
