import { describe, it, expect } from 'vitest';
import {
  entreeValideeDuCycle, revDepuisEntree, annulerRevisionProgrammee
} from '../../js/core/irl-revision.js';
import { appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';
import { duMois } from '../../js/core/loyer-du-mois.js';

/**
 * IRL-REVISION (docs/subjects/IRL-REVISION.md) — R6 (la lettre suit la révision VALIDÉE) et
 * R7 (annuler une révision programmée sans toucher au passé).
 */

const REF = 'D-101';
const BAIL = { debut: '2023-09-01', fin: null, hc: 600, ch: 60 };
const BAREME0 = [{ ref: REF, debut: '2023-09-01', fin: null, hc: 600, ch: 60, source: 'bail', bailDebut: '2023-09-01' }];
const ENTREE = {
  date: '2026-09-24', ref: REF, locataire: 'Martin', ancienHC: 600, nouveauHC: 606.82, diff: 6.82,
  irlRef: 'T2 2025', irlRefVal: 146.68, irlVigueur: 'T2 2026', irlVigueurVal: 148.37,
  dateRevision: '2026-09-01', dateEffet: '2026-10-01', dateApplication: '2026-10-01',
  pendingApply: true, appliedAt: ''
};
const ctx = (bareme) => ({ ref: REF, bails: [BAIL], bareme });

describe('entreeValideeDuCycle — la révision validée qui correspond au cycle affiché', () => {
  it('trouve l\'entrée du cycle', () => {
    expect(entreeValideeDuCycle([ENTREE], REF, '2026-09-01')).toBe(ENTREE);
  });
  it('ignore les renonciations, les entrées supprimées, les autres lots', () => {
    const j = [
      { ...ENTREE, action: 'renonciation' },
      { ...ENTREE, _deleted: true },
      { ...ENTREE, ref: 'AUTRE' }
    ];
    expect(entreeValideeDuCycle(j, REF, '2026-09-01')).toBeNull();
  });
  it('n\'attribue jamais au cycle une révision d\'un cycle antérieur', () => {
    expect(entreeValideeDuCycle([{ ...ENTREE, dateRevision: '2025-09-01' }], REF, '2026-09-01')).toBeNull();
  });
  it('accepte une clé à l\'ancien format du même cycle (1er du mois de l\'anniversaire)', () => {
    // Bail du 15/09 : cycle 2026 au 01/10, marqué 2026-09-01 par l'ancienne règle.
    expect(entreeValideeDuCycle([{ ...ENTREE, dateRevision: '2026-09-01' }], REF, '2026-10-01')).not.toBeNull();
  });
  it('la plus récente l\'emporte si deux entrées tombent dans le cycle', () => {
    const a = { ...ENTREE, date: '2026-09-20', nouveauHC: 605 };
    const b = { ...ENTREE, date: '2026-09-24', nouveauHC: 606.82 };
    expect(entreeValideeDuCycle([a, b], REF, '2026-09-01')).toBe(b);
  });
  it('entrées vides → null, jamais de crash', () => {
    expect(entreeValideeDuCycle(null, REF, '2026-09-01')).toBeNull();
    expect(entreeValideeDuCycle([ENTREE], REF, '')).toBeNull();
  });
});

describe('revDepuisEntree — la lettre dit ce qui a été VALIDÉ, jamais un recalcul sur le loyer courant', () => {
  it('rejoue indices, variation, ancien et nouveau loyer, date d\'effet réelle', () => {
    const r = revDepuisEntree(ENTREE);
    expect(r.T).toBe(2);
    expect(r.N).toBe(2026);
    expect(r.irlRef).toEqual({ key: 'T2 2025', val: 146.68 });
    expect(r.irlVigueur).toEqual({ key: 'T2 2026', val: 148.37 });
    expect(r.nouveauHC).toBe(606.82);
    expect(r.ancienHC).toBe(600);
    expect(r.dateEffetIso).toBe('2026-10-01');
    expect(r.variation).toBeCloseTo((148.37 - 146.68) / 146.68, 10);
    expect(r.dateRevision.getFullYear()).toBe(2026);
    expect(r.dateRevision.getMonth()).toBe(8);
  });
  it('après application, le loyer courant a changé : la lettre garde 600 → 606,82', () => {
    // C'est le défaut corrigé : l'ancienne lettre recalculait 606,82 × ratio.
    const r = revDepuisEntree({ ...ENTREE, pendingApply: false });
    expect(r.ancienHC).toBe(600);
    expect(r.nouveauHC).toBe(606.82);
  });
  it('indices absents (entrée legacy) → null : pas de lettre inventée', () => {
    expect(revDepuisEntree({ ...ENTREE, irlVigueur: '', irlVigueurVal: '' })).toBeNull();
    expect(revDepuisEntree(null)).toBeNull();
  });
});

describe('annulerRevisionProgrammee (R7) — le loyer d\'avant reprend, le passé ne bouge pas', () => {
  const bareme1 = appliquerNouvellePeriode(BAREME0, {
    ref: REF, debut: '2026-10-01', hc: 606.82, ch: 60, source: 'irl', bailDebut: '2023-09-01'
  });

  it('témoin : la révision programmée change le dû à partir d\'octobre', () => {
    expect(duMois(ctx(bareme1), '2026-09').hc).toBe(600);
    expect(duMois(ctx(bareme1), '2026-10').hc).toBe(606.82);
  });

  it('annulée avant son effet : octobre et après reviennent à 600, septembre et avant intacts', () => {
    const r = annulerRevisionProgrammee({
      irlHistorique: [ENTREE], bareme: bareme1, ref: REF, todayIso: '2026-09-25'
    });
    expect(r.ok).toBe(true);
    for (const ym of ['2025-12', '2026-09', '2026-10', '2027-03']) {
      expect(duMois(ctx(r.bareme), ym).hc).toBe(600);
      expect(duMois(ctx(r.bareme), ym).ch).toBe(60);
    }
    // l'entrée est retirée par tombstone (propagation cloud), jamais supprimée
    expect(r.irlHistorique).toHaveLength(1);
    expect(r.irlHistorique[0]._deleted).toBe(true);
    expect(r.entree.nouveauHC).toBe(606.82);
  });

  it('ne mute pas les entrées reçues (fonction pure)', () => {
    const hist = [{ ...ENTREE }];
    annulerRevisionProgrammee({ irlHistorique: hist, bareme: bareme1, ref: REF, todayIso: '2026-09-25' });
    expect(hist[0]._deleted).toBeUndefined();
  });

  it('refuse une révision dont l\'effet est ATTEINT (le loyer a déjà changé, des mois ont pu être payés)', () => {
    const r = annulerRevisionProgrammee({
      irlHistorique: [ENTREE], bareme: bareme1, ref: REF, todayIso: '2026-10-01'
    });
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/effet/i);
  });

  it('refuse s\'il n\'y a rien de programmé', () => {
    const r = annulerRevisionProgrammee({
      irlHistorique: [{ ...ENTREE, pendingApply: false }], bareme: bareme1, ref: REF, todayIso: '2026-09-25'
    });
    expect(r.ok).toBe(false);
  });

  it('entrées vides → refus propre', () => {
    expect(annulerRevisionProgrammee(null).ok).toBe(false);
  });
});
