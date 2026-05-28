/**
 * Tests log-immeuble-resolver — le bien hérite de son immeuble parent
 * (ARCHI-FICHES-UNIFIED Session 2 Commit 2, v15.213)
 */

import { describe, it, expect } from 'vitest';
import {
  resolveAddressForLog,
  resolvePeriodeConstrForLog,
  resolveRegimeJuridiqueForLog,
  resolveAnneeForLog,
  resolveEquipementsCommunsForLog,
  resolveInheritedForLog,
  formatLogLocation
} from './log-immeuble-resolver.js';

const makeImm = (over = {}) => ({
  id: 'imm-1', nom: 'Résidence Test',
  adr: '15 rue de la République', codePostal: '69001', ville: 'Lyon',
  annee: 1925, periodeConstr: 'Avant 1949', regimeJuridique: 'Copropriété',
  equipementsCommuns: { ascenseur: true, gardien: false, customs: ['Toit-terrasse'] },
  ...over
});

const makeLog = (over = {}) => ({
  ref: 'LOG-001', imm: 'Résidence Test', entity: 'SCI Test',
  type: 'T3', surf: 65, npp: 3, etage: '3',
  ...over
});

describe('resolveAddressForLog', () => {
  it('immeuble post-migration → adresse vient de l\'immeuble', () => {
    const r = resolveAddressForLog(makeLog(), makeImm());
    expect(r.rue).toBe('15 rue de la République');
    expect(r.codePostal).toBe('69001');
    expect(r.ville).toBe('Lyon');
    expect(r.full).toBe('15 rue de la République, 69001 Lyon');
    expect(r.source).toBe('imm');
  });

  it('immeuble legacy (adr seul, pas migré) → adresse vient de l\'imm', () => {
    const r = resolveAddressForLog(
      makeLog(),
      { adr: '47 rue Voltaire, 75011 Paris', codePostal: '', ville: '' }
    );
    expect(r.full).toBe('47 rue Voltaire, 75011 Paris');
    expect(r.source).toBe('imm');
  });

  it('pas d\'immeuble parent + log.adr legacy → fallback log-legacy', () => {
    const r = resolveAddressForLog({ adr: '10 rue Z, 13002 Marseille' }, null);
    expect(r.full).toBe('10 rue Z, 13002 Marseille');
    expect(r.source).toBe('log-legacy');
  });

  it('rien nulle part → vide + source=none', () => {
    expect(resolveAddressForLog({}, null)).toEqual({
      rue: '', codePostal: '', ville: '', full: '', source: 'none'
    });
  });

  it('log + imm null → fallback log.adr', () => {
    const r = resolveAddressForLog({ adr: 'Test rue' }, null);
    expect(r.rue).toBe('Test rue');
    expect(r.source).toBe('log-legacy');
  });
});

describe('resolvePeriodeConstrForLog', () => {
  it('immeuble fournit la période', () => {
    const r = resolvePeriodeConstrForLog(makeLog(), makeImm());
    expect(r).toEqual({ value: 'Avant 1949', source: 'imm' });
  });

  it('immeuble vide + log legacy → fallback log', () => {
    const r = resolvePeriodeConstrForLog(
      { periodeConstr: 'De 1975 à 1989' },
      { adr: '', periodeConstr: '' }
    );
    expect(r).toEqual({ value: 'De 1975 à 1989', source: 'log-legacy' });
  });

  it('rien → none', () => {
    expect(resolvePeriodeConstrForLog({}, {})).toEqual({ value: '', source: 'none' });
  });
});

describe('resolveRegimeJuridiqueForLog', () => {
  it('Copropriété depuis immeuble', () => {
    expect(resolveRegimeJuridiqueForLog(makeLog(), makeImm())).toEqual({
      value: 'Copropriété', source: 'imm'
    });
  });

  it('Monopropriété forcée', () => {
    expect(resolveRegimeJuridiqueForLog(makeLog(), makeImm({ regimeJuridique: 'Monopropriété' }))).toEqual({
      value: 'Monopropriété', source: 'imm'
    });
  });

  it('fallback log', () => {
    expect(resolveRegimeJuridiqueForLog({ regimeJuridique: 'Copropriété' }, {})).toEqual({
      value: 'Copropriété', source: 'log-legacy'
    });
  });
});

describe('resolveAnneeForLog', () => {
  it('1925 depuis immeuble', () => {
    expect(resolveAnneeForLog(makeLog(), makeImm())).toEqual({ value: 1925, source: 'imm' });
  });

  it('parseInt string', () => {
    expect(resolveAnneeForLog({}, { annee: '2010' })).toEqual({ value: 2010, source: 'imm' });
  });

  it('0 traité comme absent', () => {
    expect(resolveAnneeForLog({}, { annee: 0 })).toEqual({ value: 0, source: 'none' });
  });
});

describe('resolveEquipementsCommunsForLog', () => {
  it('équipements depuis immeuble (toujours, décision A3)', () => {
    const r = resolveEquipementsCommunsForLog(makeLog(), makeImm());
    expect(r.equipements.ascenseur).toBe(true);
    expect(r.equipements.customs).toContain('Toit-terrasse');
    expect(r.source).toBe('imm');
  });

  it('immeuble sans équipements → defensive empty', () => {
    const r = resolveEquipementsCommunsForLog(makeLog(), { nom: 'Sans équip' });
    expect(r.equipements).toEqual({ customs: [] });
    expect(r.source).toBe('none');
  });
});

describe('resolveInheritedForLog — appel groupé', () => {
  it('retourne tous les champs hérités en 1 objet', () => {
    const r = resolveInheritedForLog(makeLog(), makeImm());
    expect(r.address.full).toBe('15 rue de la République, 69001 Lyon');
    expect(r.periodeConstr.value).toBe('Avant 1949');
    expect(r.regimeJuridique.value).toBe('Copropriété');
    expect(r.annee.value).toBe(1925);
    expect(r.equipementsCommuns.equipements.ascenseur).toBe(true);
  });
});

describe('formatLogLocation', () => {
  it('étage 3 sans numApt → "3e étage"', () => {
    expect(formatLogLocation({ etage: '3' })).toBe('3e étage');
  });

  it('étage 1 → "1er étage"', () => {
    expect(formatLogLocation({ etage: '1' })).toBe('1er étage');
  });

  it('étage 0 → "rez-de-chaussée"', () => {
    expect(formatLogLocation({ etage: '0' })).toBe('rez-de-chaussée');
  });

  it('"RDC" → rez-de-chaussée', () => {
    expect(formatLogLocation({ etage: 'RDC' })).toBe('rez-de-chaussée');
  });

  it('étage 5 + numApt 3B → "Apt 3B, 5e étage"', () => {
    expect(formatLogLocation({ etage: '5', numApt: '3B' })).toBe('Apt 3B, 5e étage');
  });

  it('numApt seul → "Apt 12"', () => {
    expect(formatLogLocation({ etage: '', numApt: '12' })).toBe('Apt 12');
  });

  it('rien → vide', () => {
    expect(formatLogLocation({})).toBe('');
    expect(formatLogLocation(null)).toBe('');
  });

  it('étage non numérique non-RDC → vide', () => {
    expect(formatLogLocation({ etage: 'XYZ' })).toBe('');
  });
});
