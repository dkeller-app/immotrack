import { describe, it, expect } from 'vitest';
import { canCreateLogement } from './parcours-bien-model.js';

describe('canCreateLogement — Identité obligatoire (décision user 2026-07-11)', () => {
  const full = { ref: 'F-102', typeUsage: 'habitation-nu', entity: 'SCI du Château', imm: '12 rue du Château' };
  it('accepte quand les 4 champs requis sont présents', () => {
    expect(canCreateLogement(full)).toEqual({ ok: true, missing: [] });
  });
  it('refuse si la référence manque', () => {
    const r = canCreateLogement({ ...full, ref: '  ' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('ref');
  });
  it('refuse si le type d’usage manque', () => {
    expect(canCreateLogement({ ...full, typeUsage: '' }).missing).toContain('typeUsage');
  });
  it('refuse si l’entité ou l’immeuble manque', () => {
    const r = canCreateLogement({ ...full, entity: '', imm: '' });
    expect(r.missing).toEqual(expect.arrayContaining(['entity', 'imm']));
  });
  it('tolère null/undefined en entrée', () => {
    expect(canCreateLogement(null).ok).toBe(false);
  });
});

import { logementCompleteness, immeubleCompleteness } from './parcours-bien-model.js';

describe('logementCompleteness', () => {
  const base = { ref: 'F-102', typeUsage: 'habitation-nu', entity: 'SCI', imm: '12 rue' };
  it('a-completer quand seule l’identité est remplie (onglets optionnels vides)', () => {
    const r = logementCompleteness(base);
    expect(r.level).toBe('a-completer');
    expect(r.missing).toEqual(expect.arrayContaining(['surface', 'loyer', 'dpe']));
  });
  it('complet quand identité + surface + loyer + dpe sont remplis', () => {
    const r = logementCompleteness({ ...base, surface: 44, loyer: 508, dpe: 'D' });
    expect(r.level).toBe('complet');
    expect(r.missing).toEqual([]);
  });
  it('a-completer (jamais complet) si l’identité manque', () => {
    expect(logementCompleteness({ surface: 44, loyer: 508, dpe: 'D' }).level).toBe('a-completer');
  });
});

describe('immeubleCompleteness', () => {
  it('complet dès qu’une adresse est présente', () => {
    expect(immeubleCompleteness({ nom: '12 rue', adr: '12 rue du Château' }).level).toBe('complet');
  });
  it('a-completer sans adresse', () => {
    expect(immeubleCompleteness({ nom: '12 rue', adr: '' }).level).toBe('a-completer');
  });
});

import { buildParcoursTree, parcoursSummary } from './parcours-bien-model.js';

describe('buildParcoursTree', () => {
  const entite = { id: 1, nom: 'SCI du Château', immeubles: [
    { id: 11, nom: '12 rue du Château', adr: '12 rue du Château' },
    { id: 12, nom: '5 av. Gare', adr: '' },
  ]};
  const logements = [
    { ref: 'F-102', entity: 'SCI du Château', imm: '12 rue du Château', surface: 44, loyer: 508, dpe: 'D' },
    { ref: 'F-103', entity: 'SCI du Château', imm: '12 rue du Château' },
    { ref: 'X-1',  entity: 'Autre SCI',      imm: 'ailleurs' },
    { ref: 'Z-9',  entity: 'SCI du Château', imm: 'immeuble fantôme' },
  ];
  it('groupe les logements du bailleur sous ses immeubles', () => {
    const tree = buildParcoursTree(entite, logements);
    expect(tree.bailleur.nom).toBe('SCI du Château');
    const imm1 = tree.immeubles.find((i) => i.nom === '12 rue du Château');
    expect(imm1.logements.map((l) => l.ref)).toEqual(['F-102', 'F-103']);
    expect(imm1.completeness.level).toBe('complet');
    expect(imm1.logements[0].completeness.level).toBe('complet');
    expect(imm1.logements[1].completeness.level).toBe('a-completer');
  });
  it('inclut les immeubles sans logement', () => {
    const tree = buildParcoursTree(entite, logements);
    const imm2 = tree.immeubles.find((i) => i.nom === '5 av. Gare');
    expect(imm2.logements).toEqual([]);
    expect(imm2.completeness.level).toBe('a-completer');
  });
  it('range les logements à immeuble inconnu dans « — Sans immeuble — »', () => {
    const tree = buildParcoursTree(entite, logements);
    const orphan = tree.immeubles.find((i) => i.nom === '— Sans immeuble —');
    expect(orphan.logements.map((l) => l.ref)).toEqual(['Z-9']);
    expect(orphan.synthetic).toBe(true);
  });
  it('exclut les logements d’un autre bailleur', () => {
    const tree = buildParcoursTree(entite, logements);
    const allRefs = tree.immeubles.flatMap((i) => i.logements.map((l) => l.ref));
    expect(allRefs).not.toContain('X-1');
  });
});

describe('parcoursSummary', () => {
  it('compte immeubles (réels) et logements, et liste les logements à louer', () => {
    const entite = { id: 1, nom: 'SCI', immeubles: [{ id: 11, nom: 'A', adr: 'a' }] };
    const logements = [
      { ref: 'A-1', entity: 'SCI', imm: 'A', locataire: '' },
      { ref: 'A-2', entity: 'SCI', imm: 'A', locataire: 'Dupont' },
    ];
    const s = parcoursSummary(buildParcoursTree(entite, logements));
    expect(s.nbImmeubles).toBe(1);
    expect(s.nbLogements).toBe(2);
    expect(s.logementsALouer.map((l) => l.ref)).toEqual(['A-1']);
  });
});
