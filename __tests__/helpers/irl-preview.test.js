/**
 * Tests pour BUG-IRL-APERCU-LETTRE-V15 (Sprint 19A) v15.74.
 * Module js/core/irl-preview.js — helpers purs pour le panneau aperçu lettre IRL.
 */
import { describe, it, expect } from 'vitest';
import {
  _irlIsPreviewable,
  _irlListPreviewableRefs,
  _irlPickFirstPreviewableRef,
} from '../../js/core/irl-preview.js';

// ═══════════════════════════════════════════════════════════════════
//  _irlIsPreviewable
// ═══════════════════════════════════════════════════════════════════

describe('_irlIsPreviewable — cas non prévisualisables', () => {
  it('null → false (pas de date de bail)', () => {
    expect(_irlIsPreviewable(null)).toBe(false);
  });
  it('undefined → false', () => {
    expect(_irlIsPreviewable(undefined)).toBe(false);
  });
  it('dpeManquant → false (DPE non renseigné)', () => {
    expect(_irlIsPreviewable({ dpeManquant: true, T: 2 })).toBe(false);
  });
  it('gelDpeFG → false (loyer gelé DPE F/G loi Climat 2021)', () => {
    expect(_irlIsPreviewable({ gelDpeFG: true, dpe: 'F', T: 1 })).toBe(false);
  });
  it('insuffisant → false (index IRL manquant en table)', () => {
    expect(_irlIsPreviewable({ insuffisant: true, T: 4, missingKey: 'T4 2026' })).toBe(false);
  });
});

describe('_irlIsPreviewable — cas prévisualisables', () => {
  it('pasEncoreApplicable → true (bail < 1 an, aperçu anticipé)', () => {
    expect(_irlIsPreviewable({ pasEncoreApplicable: true, T: 2 })).toBe(true);
  });
  it('révision calculée applicable → true', () => {
    expect(_irlIsPreviewable({ isApplicable: true, dejaApplique: false, T: 3 })).toBe(true);
  });
  it('révision déjà appliquée → true (consultation lettre passée)', () => {
    expect(_irlIsPreviewable({ isApplicable: true, dejaApplique: true, T: 3 })).toBe(true);
  });
  it('révision à venir (isApplicable=false) → true', () => {
    expect(_irlIsPreviewable({ isApplicable: false, dejaApplique: false, T: 1 })).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _irlListPreviewableRefs
// ═══════════════════════════════════════════════════════════════════

const make = (ref, locataire = 'Dupont') => ({ ref, locataire });

describe('_irlListPreviewableRefs — filtrage', () => {
  it('logements vide → array vide', () => {
    expect(_irlListPreviewableRefs([], () => null)).toEqual([]);
  });
  it('logements non-array → array vide', () => {
    expect(_irlListPreviewableRefs(null, () => null)).toEqual([]);
    expect(_irlListPreviewableRefs(undefined, () => null)).toEqual([]);
  });
  it('computeFn non-function → array vide', () => {
    expect(_irlListPreviewableRefs([make('L01')], null)).toEqual([]);
  });
  it('exclut les rev null et dpeManquant', () => {
    const logs = [make('L01'), make('L02'), make('L03')];
    const fn = (l) => {
      if (l.ref === 'L01') return null;
      if (l.ref === 'L02') return { dpeManquant: true };
      if (l.ref === 'L03') return { isApplicable: true };
      return null;
    };
    const out = _irlListPreviewableRefs(logs, fn);
    expect(out.length).toBe(1);
    expect(out[0].ref).toBe('L03');
  });
  it('exclut DPE F/G et insuffisant', () => {
    const logs = [make('L01'), make('L02')];
    const fn = (l) => l.ref === 'L01'
      ? { gelDpeFG: true }
      : { insuffisant: true };
    expect(_irlListPreviewableRefs(logs, fn)).toEqual([]);
  });
});

describe('_irlListPreviewableRefs — étiquetage état', () => {
  it('dejaApplique → etat = "applique"', () => {
    const logs = [make('A', 'X')];
    const out = _irlListPreviewableRefs(logs, () => ({ isApplicable: true, dejaApplique: true }));
    expect(out[0].etat).toBe('applique');
    expect(out[0].label).toBe('A — X');
  });
  it('pasEncoreApplicable → etat = "anticipe"', () => {
    const out = _irlListPreviewableRefs([make('B', 'Y')], () => ({ pasEncoreApplicable: true }));
    expect(out[0].etat).toBe('anticipe');
  });
  it('isApplicable=true et !dejaApplique → etat = "applicable"', () => {
    const out = _irlListPreviewableRefs([make('C', 'Z')], () => ({ isApplicable: true }));
    expect(out[0].etat).toBe('applicable');
  });
  it('isApplicable=false et !dejaApplique → etat = "a-venir"', () => {
    const out = _irlListPreviewableRefs([{ ref: 'D' }], () => ({ isApplicable: false }));
    expect(out[0].etat).toBe('a-venir');
    expect(out[0].label).toBe('D');
  });
});

describe('_irlListPreviewableRefs — robustesse', () => {
  it('skip les logements sans ref', () => {
    const logs = [{ locataire: 'A' }, make('L01'), null];
    const out = _irlListPreviewableRefs(logs, () => ({ isApplicable: true }));
    expect(out.length).toBe(1);
    expect(out[0].ref).toBe('L01');
  });
  it('conserve l\'ordre d\'entrée des logements', () => {
    const logs = [make('Z'), make('A'), make('M')];
    const out = _irlListPreviewableRefs(logs, () => ({ isApplicable: true }));
    expect(out.map(p => p.ref)).toEqual(['Z', 'A', 'M']);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _irlPickFirstPreviewableRef
// ═══════════════════════════════════════════════════════════════════

describe('_irlPickFirstPreviewableRef — priorité de sélection', () => {
  it('liste vide → null', () => {
    expect(_irlPickFirstPreviewableRef([])).toBeNull();
  });
  it('non-array → null', () => {
    expect(_irlPickFirstPreviewableRef(null)).toBeNull();
    expect(_irlPickFirstPreviewableRef(undefined)).toBeNull();
  });
  it('priorité 1 : "applicable" préféré à "applique"/"anticipe"', () => {
    const list = [
      { ref: 'A', label: 'A', etat: 'anticipe' },
      { ref: 'B', label: 'B', etat: 'applique' },
      { ref: 'C', label: 'C', etat: 'applicable' },
    ];
    expect(_irlPickFirstPreviewableRef(list)).toBe('C');
  });
  it('priorité 2 : "a-venir" préféré à "applique"/"anticipe" si pas d\'applicable', () => {
    const list = [
      { ref: 'A', label: 'A', etat: 'anticipe' },
      { ref: 'B', label: 'B', etat: 'applique' },
      { ref: 'C', label: 'C', etat: 'a-venir' },
    ];
    expect(_irlPickFirstPreviewableRef(list)).toBe('C');
  });
  it('priorité 3 : "applique" préféré à "anticipe"', () => {
    const list = [
      { ref: 'A', label: 'A', etat: 'anticipe' },
      { ref: 'B', label: 'B', etat: 'applique' },
    ];
    expect(_irlPickFirstPreviewableRef(list)).toBe('B');
  });
  it('priorité 4 : fallback "anticipe" si rien d\'autre', () => {
    const list = [
      { ref: 'A', label: 'A', etat: 'anticipe' },
      { ref: 'B', label: 'B', etat: 'anticipe' },
    ];
    expect(_irlPickFirstPreviewableRef(list)).toBe('A');
  });
  it('un seul élément → ce ref est choisi quel que soit son état', () => {
    expect(_irlPickFirstPreviewableRef([{ ref: 'X', label: 'X', etat: 'anticipe' }])).toBe('X');
    expect(_irlPickFirstPreviewableRef([{ ref: 'Y', label: 'Y', etat: 'applique' }])).toBe('Y');
  });
  it('même priorité : prend le 1er dans l\'ordre de la liste', () => {
    const list = [
      { ref: 'A', label: 'A', etat: 'applicable' },
      { ref: 'B', label: 'B', etat: 'applicable' },
    ];
    expect(_irlPickFirstPreviewableRef(list)).toBe('A');
  });
});
