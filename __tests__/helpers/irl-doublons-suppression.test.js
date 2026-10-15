import { describe, it, expect } from 'vitest';
import {
  cleRevision, revisionDejaEnregistree, dedoublonnerRevisions,
  analyserSuppressionRevision, supprimerRevision
} from '../../js/core/irl-revision.js';
import { appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { _loyerHCAtDate } from '../../js/core/utils.js';

/**
 * Retours du 15/10/2026 (lot 1, point 2) — révisions IRL EN DOUBLE.
 * Cas réel : 4 cartes « Révision IRL validée » identiques, 790,00 € → 796,14 € au 01/10/2026,
 * dont 3 « EN ATTENTE » : la première s'est appliquée, les trois autres restaient bloquées à vie
 * par le contrôle `log.hc ≠ ancienHC` de _applyPendingIRLRevisions.
 */

const REF = 'FER-001';
const BAIL = { debut: '2024-10-01', fin: null, hc: 790, ch: 50 };
const ctx = (bareme) => ({ ref: REF, bails: [BAIL], bareme });
const BAREME0 = [{ ref: REF, debut: '2024-10-01', fin: null, hc: 790, ch: 50, source: 'bail', bailDebut: '2024-10-01' }];
const BAREME_REV = appliquerNouvellePeriode(BAREME0, {
  ref: REF, debut: '2026-10-01', hc: 796.14, ch: 50, source: 'irl', bailDebut: '2024-10-01'
});
const REV = {
  date: '2026-09-12', ref: REF, locataire: 'Dupont', ancienHC: 790, nouveauHC: 796.14, diff: 6.14,
  irlRef: 'T2 2025', irlRefVal: 146.68, irlVigueur: 'T2 2026', irlVigueurVal: 147.82,
  dateRevision: '2026-10-01', dateEffet: '2026-10-01', dateApplication: '2026-10-01',
  dateEffetAjustee: false, pendingApply: false, appliedAt: '2026-10-01'
};
const ATTENTE = (date) => ({ ...REV, date, pendingApply: true, appliedAt: '' });
const CAS_REEL = () => [{ ...REV }, ATTENTE('2026-09-13'), ATTENTE('2026-09-20'), ATTENTE('2026-09-28')];
const NOW = '2026-10-15T08:00:00.000Z';

describe('cleRevision — identité d\'une révision : lot + indice + date d\'effet', () => {
  it('même lot (ref tolérante), même indice, même effet → même clé', () => {
    expect(cleRevision(REV)).toBe(cleRevision({ ...REV, ref: ' fer-001 ', irlVigueur: 't2  2026', date: '2026-09-30' }));
  });
  it('indice, effet ou lot différent → clé différente', () => {
    expect(cleRevision({ ...REV, irlVigueur: 'T3 2026' })).not.toBe(cleRevision(REV));
    expect(cleRevision({ ...REV, dateEffet: '2026-11-01' })).not.toBe(cleRevision(REV));
    expect(cleRevision({ ...REV, ref: 'FER-002' })).not.toBe(cleRevision(REV));
  });
  it('renonciation, entrée supprimée, entrée sans date → pas de clé', () => {
    expect(cleRevision({ ...REV, action: 'renonciation' })).toBeNull();
    expect(cleRevision({ ...REV, _deleted: true })).toBeNull();
    expect(cleRevision({ ...REV, dateEffet: '', dateApplication: '', dateRevision: '' })).toBeNull();
    expect(cleRevision(null)).toBeNull();
  });
  it('entrée ancienne sans date d\'effet : repli sur la date d\'application puis l\'anniversaire', () => {
    expect(cleRevision({ ...REV, dateEffet: '' })).toBe(cleRevision(REV));
  });
});

describe('revisionDejaEnregistree — la garde anti-doublon de la validation', () => {
  it('double clic / rejeu : la révision existe déjà → elle est rendue (pas de nouvelle entrée)', () => {
    const e = revisionDejaEnregistree([REV], { ref: REF, irlVigueur: 'T2 2026', dateEffet: '2026-10-01' });
    expect(e).toBe(REV);
  });
  it('préférence à l\'entrée appliquée', () => {
    const j = [ATTENTE('2026-09-13'), REV];
    expect(revisionDejaEnregistree(j, { ref: REF, irlVigueur: 'T2 2026', dateEffet: '2026-10-01' })).toBe(REV);
  });
  it('autre indice, autre date d\'effet, autre lot, entrée supprimée, renonciation → aucune', () => {
    const j = [REV, { ...REV, irlVigueur: 'T3 2026', _deleted: true }];
    expect(revisionDejaEnregistree(j, { ref: REF, irlVigueur: 'T3 2026', dateEffet: '2026-10-01' })).toBeNull();
    expect(revisionDejaEnregistree(j, { ref: REF, irlVigueur: 'T2 2026', dateEffet: '2026-11-01' })).toBeNull();
    expect(revisionDejaEnregistree(j, { ref: 'AUTRE', irlVigueur: 'T2 2026', dateEffet: '2026-10-01' })).toBeNull();
    expect(revisionDejaEnregistree([{ ...REV, action: 'renonciation' }], { ref: REF, irlVigueur: 'T2 2026', dateEffet: '2026-10-01' })).toBeNull();
    expect(revisionDejaEnregistree(null, { ref: REF })).toBeNull();
  });
});

describe('dedoublonnerRevisions — nettoyage des doublons existants (migration au démarrage)', () => {
  it('cas réel : 1 appliquée + 3 en attente → une seule, l\'appliquée ; les autres en tombstone', () => {
    const j = CAS_REEL();
    const r = dedoublonnerRevisions(j, NOW);
    const vivantes = r.irlHistorique.filter(h => !h._deleted);
    expect(vivantes).toHaveLength(1);
    expect(vivantes[0].pendingApply).toBe(false);
    expect(vivantes[0].date).toBe('2026-09-12');
    expect(r.retirees).toHaveLength(3);
    // jamais de perte silencieuse : l'entrée reste, marquée, horodatée, avec ce qui l'a remplacée
    expect(r.irlHistorique).toHaveLength(4);
    for (const h of r.irlHistorique.slice(1)) {
      expect(h._deleted).toBe(true);
      expect(h._deletedAt).toBe(NOW);
      expect(h._modifiedAt).toBe(NOW);
      expect(h._doublonDe).toEqual({ date: '2026-09-12', dateEffet: '2026-10-01' });
      expect(h.nouveauHC).toBe(796.14);
    }
    // fonction pure : le journal reçu n'est pas muté
    expect(j.filter(h => h._deleted)).toHaveLength(0);
  });

  it('le loyer ne bouge pas : même loyer à toute date avant/après, barème non concerné', () => {
    const j = CAS_REEL();
    const r = dedoublonnerRevisions(j, NOW);
    const log = { ref: REF, hc: 796.14 };
    for (const d of ['2025-01-01', '2026-09-30', '2026-10-01', '2026-10-15', '2027-06-01']) {
      expect(_loyerHCAtDate(log, d, r.irlHistorique)).toBe(_loyerHCAtDate(log, d, j));
    }
    for (const ym of ['2026-09', '2026-10', '2026-11']) {
      expect(duMois(ctx(BAREME_REV), ym).hc).toBe(ym < '2026-10' ? 790 : 796.14);
    }
  });

  it('idempotent : un second passage ne change rien et rend le même tableau', () => {
    const r1 = dedoublonnerRevisions(CAS_REEL(), NOW);
    const r2 = dedoublonnerRevisions(r1.irlHistorique, '2026-10-16T08:00:00.000Z');
    expect(r2.retirees).toHaveLength(0);
    expect(r2.irlHistorique).toBe(r1.irlHistorique);
  });

  it('doublons seulement en attente : la plus récente validation est gardée', () => {
    const j = [ATTENTE('2026-09-13'), ATTENTE('2026-09-20')];
    const r = dedoublonnerRevisions(j, NOW);
    expect(r.irlHistorique[0]._deleted).toBe(true);
    expect(r.irlHistorique[1]._deleted).toBeUndefined();
  });

  it('montants différents à la même clé : rien n\'est retiré automatiquement, le groupe est signalé', () => {
    const j = [{ ...REV }, { ...ATTENTE('2026-09-20'), nouveauHC: 801.5 }];
    const r = dedoublonnerRevisions(j, NOW);
    expect(r.retirees).toHaveLength(0);
    expect(r.divergents).toEqual([cleRevision(REV)]);
    expect(r.irlHistorique).toBe(j);
  });

  it('révisions légitimes (années, lots, indices différents) et renonciations : intactes', () => {
    const j = [
      { ...REV, irlVigueur: 'T2 2025', dateRevision: '2025-10-01', dateEffet: '2025-10-01', dateApplication: '2025-10-01', ancienHC: 780, nouveauHC: 790 },
      { ...REV },
      { ...REV, ref: 'FER-002' },
      { ...REV, action: 'renonciation' },
      { ...REV, action: 'renonciation' }
    ];
    const r = dedoublonnerRevisions(j, NOW);
    expect(r.retirees).toHaveLength(0);
    expect(r.irlHistorique).toBe(j);
  });
});

describe('supprimerRevision — « Supprimer cette révision » depuis l\'historique du bail', () => {
  const base = (over) => ({
    irlHistorique: CAS_REEL(), bareme: BAREME_REV, ref: REF, index: 1,
    todayIso: '2026-10-15', nowIso: NOW, dernierMoisQuittanceYm: '2026-09', bailDebut: '2024-10-01',
    logHc: 796.14, ...over
  });

  it('un doublon : seule l\'entrée part (tombstone) ; barème et loyer inchangés', () => {
    const r = supprimerRevision(base());
    expect(r.ok).toBe(true);
    expect(r.nature).toBe('doublon');
    expect(r.irlHistorique[1]._deleted).toBe(true);
    expect(r.irlHistorique[1]._deletedAt).toBe(NOW);
    expect(r.irlHistorique.filter(h => !h._deleted)).toHaveLength(3);
    expect(r.bareme).toEqual(BAREME_REV);
    expect(r.logHc).toBeNull();
  });

  it('une révision PROGRAMMÉE (effet à venir) : le loyer d\'avant reprend à la même date', () => {
    const j = [ATTENTE('2026-09-12')];
    const r = supprimerRevision(base({ irlHistorique: j, index: 0, todayIso: '2026-09-20', logHc: 790 }));
    expect(r.ok).toBe(true);
    expect(r.nature).toBe('programmee');
    expect(r.reprise).toBe('2026-10-01');
    expect(r.logHc).toBeNull();                 // jamais appliquée : le loyer vivant est déjà l'ancien
    for (const ym of ['2026-09', '2026-10', '2027-03']) expect(duMois(ctx(r.bareme), ym).hc).toBe(790);
    expect(r.irlHistorique[0]._deleted).toBe(true);
    expect(j[0]._deleted).toBeUndefined();      // pure
  });

  it('une révision APPLIQUÉE, mois d\'effet non quittancé : le loyer d\'avant reprend dès la date d\'effet', () => {
    const r = supprimerRevision(base({ irlHistorique: [{ ...REV }], index: 0, dernierMoisQuittanceYm: '2026-09' }));
    expect(r.ok).toBe(true);
    expect(r.nature).toBe('appliquee');
    expect(r.reprise).toBe('2026-10-01');
    expect(r.logHc).toBe(790);
    expect(duMois(ctx(r.bareme), '2026-09').hc).toBe(790);
    expect(duMois(ctx(r.bareme), '2026-10').hc).toBe(790);
    expect(duMois(ctx(r.bareme), '2026-10').ch).toBe(50);
  });

  it('une révision APPLIQUÉE dont des mois sont quittancés : ces mois ne changent PAS, le loyer d\'avant reprend après', () => {
    const r = supprimerRevision(base({ irlHistorique: [{ ...REV }], index: 0, dernierMoisQuittanceYm: '2026-10' }));
    expect(r.ok).toBe(true);
    expect(r.reprise).toBe('2026-11-01');
    expect(r.moisQuittancesConserves).toBe(true);
    expect(duMois(ctx(r.bareme), '2026-10').hc).toBe(796.14);   // quittancé : fait foi
    expect(duMois(ctx(r.bareme), '2026-11').hc).toBe(790);
    expect(duMois(ctx(r.bareme), '2027-05').hc).toBe(790);
    expect(duMois(ctx(r.bareme), '2026-11').ch).toBe(50);
    expect(r.logHc).toBe(790);
  });

  it('la marque de cycle revient à la révision précédente du bail (ou rien)', () => {
    const prev = { ...REV, irlVigueur: 'T2 2025', dateRevision: '2025-10-01', dateEffet: '2025-10-01', dateApplication: '2025-10-01', ancienHC: 780, nouveauHC: 790 };
    const r = supprimerRevision(base({ irlHistorique: [prev, { ...REV }], index: 1 }));
    expect(r.ok).toBe(true);
    expect(r.marqueCycle).toBe('2025-10-01');
    const r2 = supprimerRevision(base({ irlHistorique: [{ ...REV }], index: 0 }));
    expect(r2.marqueCycle).toBe('');
  });

  it('refuse de supprimer une révision sur laquelle s\'appuie une révision plus récente', () => {
    const prev = { ...REV, irlVigueur: 'T2 2025', dateRevision: '2025-10-01', dateEffet: '2025-10-01', dateApplication: '2025-10-01', ancienHC: 780, nouveauHC: 790 };
    const r = supprimerRevision(base({ irlHistorique: [prev, { ...REV }], index: 0 }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/plus récente/);
    expect(analyserSuppressionRevision(base({ irlHistorique: [prev, { ...REV }], index: 0 })).ok).toBe(false);
    expect(analyserSuppressionRevision(base({ irlHistorique: [prev, { ...REV }], index: 1 })).ok).toBe(true);
  });

  it('refus propres : renonciation, entrée déjà supprimée, autre lot, index hors bornes, entrée qui a changé', () => {
    expect(supprimerRevision(base({ irlHistorique: [{ ...REV, action: 'renonciation' }], index: 0 })).ok).toBe(false);
    expect(supprimerRevision(base({ irlHistorique: [{ ...REV, _deleted: true }], index: 0 })).ok).toBe(false);
    expect(supprimerRevision(base({ ref: 'AUTRE', index: 0 })).ok).toBe(false);
    expect(supprimerRevision(base({ index: 9 })).ok).toBe(false);
    expect(supprimerRevision(base({ index: 0, attendu: { dateEffet: '2026-11-01', nouveauHC: 796.14 } })).ok).toBe(false);
    expect(supprimerRevision(base({ index: 0, attendu: { dateEffet: '2026-10-01', nouveauHC: 796.14 } })).ok).toBe(true);
    expect(supprimerRevision(null).ok).toBe(false);
  });

  it('deux révisions de montants différents à la même date : supprimer l\'une ne touche ni barème ni loyer', () => {
    const j = [{ ...REV }, { ...ATTENTE('2026-09-20'), nouveauHC: 801.5 }];
    const r = supprimerRevision(base({ irlHistorique: j, index: 1 }));
    expect(r.ok).toBe(true);
    expect(r.nature).toBe('doublon');
    expect(r.bareme).toEqual(BAREME_REV);
    expect(r.logHc).toBeNull();
  });
});

describe('Relecture Fable — cas limites de la suppression et de la garde', () => {
  const base = (over) => ({
    irlHistorique: CAS_REEL(), bareme: BAREME_REV, ref: REF, index: 0,
    todayIso: '2026-10-15', nowIso: NOW, dernierMoisQuittanceYm: '2026-09', bailDebut: '2024-10-01',
    logHc: 796.14, ...over
  });
  it("montants différents à la même date : celle EN VIGUEUR n'est pas supprimable tant que l'autre existe", () => {
    const j = [{ ...REV }, { ...ATTENTE('2026-09-20'), nouveauHC: 801.5 }];
    const r = supprimerRevision(base({ irlHistorique: j, index: 0 }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/801,50/);
    // l'autre (non appliquée) part seule, puis celle en vigueur redevient supprimable normalement
    const r1 = supprimerRevision(base({ irlHistorique: j, index: 1 }));
    expect(r1.ok && r1.nature).toBe('doublon');
    const r2 = supprimerRevision(base({ irlHistorique: r1.irlHistorique, index: 0 }));
    expect(r2.ok && r2.nature).toBe('appliquee');
    expect(duMois(ctx(r2.bareme), '2026-10').hc).toBe(790);
  });
  it("révision appliquée sans sa période au barème à la date d'effet : refus explicite (pas de loyer divergent)", () => {
    const r = supprimerRevision(base({ irlHistorique: [{ ...REV }], bareme: BAREME0 }));
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/Corriger une période/);
    // … sauf si des mois sont quittancés : la reprise est une nouvelle période, posée quoi qu'il arrive
    const r2 = supprimerRevision(base({ irlHistorique: [{ ...REV }], bareme: BAREME0, dernierMoisQuittanceYm: '2026-10' }));
    expect(r2.ok).toBe(true);
    expect(duMois(ctx(r2.bareme), '2026-11').hc).toBe(790);
  });
  it("révision programmée déjà quittancée d'avance : le mois quittancé garde le loyer révisé", () => {
    const r = supprimerRevision(base({ irlHistorique: [ATTENTE('2026-09-12')], todayIso: '2026-09-25', dernierMoisQuittanceYm: '2026-10', logHc: 790 }));
    expect(r.ok && r.nature).toBe('programmee');
    expect(r.reprise).toBe('2026-11-01');
    expect(duMois(ctx(r.bareme), '2026-10').hc).toBe(796.14);
    expect(duMois(ctx(r.bareme), '2026-11').hc).toBe(790);
    expect(r.logHc).toBeNull();
  });
  it("une entrée du bail PRÉCÉDENT n'est ni une jumelle, ni un doublon pour la garde", () => {
    const ancien = { ...REV, ref: REF, dateEffet: '2024-07-01', dateApplication: '2024-07-01', dateRevision: '2024-07-01' };
    expect(revisionDejaEnregistree([ancien], { ref: REF, irlVigueur: 'T2 2026', dateEffet: '2024-07-01', bailDebut: '2024-10-01' })).toBeNull();
    expect(revisionDejaEnregistree([ancien], { ref: REF, irlVigueur: 'T2 2026', dateEffet: '2024-07-01' })).toBe(ancien);
  });
});
