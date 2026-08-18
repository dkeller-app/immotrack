import { describe, it, expect } from 'vitest';
import {
  ETAT, ETATS_MUETS, effetDuCycle, moisRappel, premierEffet,
  cycleEnCours, cycleSuivant, etatRevision, ganttRevisions
} from '../../js/core/irl-calendrier.js';

/**
 * CDC-QUITTANCES-IRL étape 5 — le calendrier des révisions.
 * Invariants : I8 (prescription art. 17-1), I9 (rappel M-1), I10 (loyer gelé DPE F/G).
 */

// Le bail d'Ohl (mockup revision-irl.html) : signé le 15/09/2023.
const OHL = '2023-09-15';

describe('D12 — l\'effet est au 1ᵉʳ jour du mois de l\'anniversaire', () => {
  it('bail du 15/09 → effet au 01/09 de chaque année, jamais au jour anniversaire', () => {
    expect(effetDuCycle(OHL, 2026)).toBe('2026-09-01');
    expect(effetDuCycle(OHL, 2027)).toBe('2027-09-01');
  });
  it('bail du 1ᵉʳ du mois → inchangé', () => {
    expect(effetDuCycle('2026-02-01', 2027)).toBe('2027-02-01');
  });
  it('la première révision tombe l\'année du premier anniversaire', () => {
    expect(premierEffet(OHL)).toBe('2024-09-01');
    expect(premierEffet('2026-02-01')).toBe('2027-02-01');
  });
  it('entrées invalides → chaîne vide, jamais de crash', () => {
    expect(effetDuCycle('', 2026)).toBe('');
    expect(effetDuCycle(OHL, NaN)).toBe('');
    expect(premierEffet('nope')).toBe('');
  });
});

describe('D13 — le mois de rappel est le mois précédent, en entier', () => {
  it('effet 01/09 → rappel sur tout août', () => {
    expect(moisRappel('2026-09-01')).toBe('2026-08');
  });
  it('franchit l\'année', () => {
    expect(moisRappel('2027-01-01')).toBe('2026-12');
  });
});

describe('cycleEnCours / cycleSuivant', () => {
  it('le cycle en cours est le dernier effet déjà passé', () => {
    expect(cycleEnCours(OHL, '2026-08-18').effetIso).toBe('2025-09-01');
    expect(cycleEnCours(OHL, '2026-09-01').effetIso).toBe('2026-09-01');
    expect(cycleEnCours(OHL, '2026-08-31').effetIso).toBe('2025-09-01');
  });
  it('null tant que le premier anniversaire n\'est pas atteint', () => {
    expect(cycleEnCours(OHL, '2024-08-31')).toBeNull();
    expect(cycleEnCours(OHL, '2024-09-01')).not.toBeNull();
  });
  it('le cycle suivant est un an après', () => {
    expect(cycleSuivant(OHL, '2026-08-18').effetIso).toBe('2026-09-01');
    expect(cycleSuivant(OHL, '2026-08-18').rappelYm).toBe('2026-08');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I9 — Rappel M-1 : du 1ᵉʳ au dernier jour du mois précédent, et pas avant
// ═══════════════════════════════════════════════════════════════════════════

describe('I9 — une révision d\'effet 01/09 apparaît du 01/08 au 31/08, jamais avant', () => {
  // Cycle 2025 déjà appliqué → c'est bien le rappel du cycle 2026 qu'on observe.
  const at = (today) => etatRevision({ debut: OHL, todayISO: today, derniereApplicationIso: '2025-09-01' });

  it('le 31/07 : rien à préparer', () => {
    expect(at('2026-07-31').etat).toBe(ETAT.FAITE);
  });
  it('le 01/08 : la ligne apparaît', () => {
    const r = at('2026-08-01');
    expect(r.etat).toBe(ETAT.A_PREPARER);
    expect(r.effetPrevuIso).toBe('2026-09-01');
    expect(r.joursAvantEffet).toBe(31);
  });
  it('le 18/08 : toujours à préparer, 14 jours avant l\'effet (exemple du mockup)', () => {
    const r = at('2026-08-18');
    expect(r.etat).toBe(ETAT.A_PREPARER);
    expect(r.joursAvantEffet).toBe(14);
  });
  it('le 31/08 : dernier jour de la fenêtre', () => {
    expect(at('2026-08-31').etat).toBe(ETAT.A_PREPARER);
  });
  it('le 01/09 : la fenêtre est fermée — le cycle est devenu le cycle en cours', () => {
    expect(at('2026-09-01').etat).toBe(ETAT.EN_RETARD);
  });
  it('un mois AVANT le rappel (le 15/07) : rien', () => {
    expect(at('2026-07-15').etat).not.toBe(ETAT.A_PREPARER);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I8 — Prescription (art. 17-1) : le cycle périmé est fermé
// ═══════════════════════════════════════════════════════════════════════════

describe('I8 — au-delà d\'un an, la révision n\'est plus proposée', () => {
  it('un oubli de 5 mois reste proposable (cycle en cours)', () => {
    // Effet prévu 01/03/2026, on est le 18/08/2026 : 5 mois, cycle encore ouvert.
    const r = etatRevision({ debut: '2024-03-03', todayISO: '2026-08-18', derniereApplicationIso: '2025-03-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-03-01');
    expect(r.perdue).toBeNull();
  });

  it('un oubli de DEUX ans : seul le cycle EN COURS est proposé, le précédent est perdu', () => {
    const r = etatRevision({ debut: '2021-06-20', todayISO: '2026-08-18', derniereApplicationIso: '2024-06-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-06-01');   // cycle en cours, sur le loyer ACTUEL
    expect(r.perdue).toEqual({ annee: 2025, effetIso: '2025-06-01' });
  });

  it('un cycle jamais appliqué de plus d\'un an n\'est JAMAIS la révision proposée', () => {
    // Rien n'a jamais été appliqué depuis 2021 : la proposition porte sur 2026, pas sur 2022.
    const r = etatRevision({ debut: '2021-06-20', todayISO: '2026-08-18' });
    expect(r.effetPrevuIso).toBe('2026-06-01');
    const prescription = new Date(r.perdue.effetIso + 'T00:00:00');
    expect(prescription.getFullYear()).toBe(2025);
    // Aucun état ne peut renvoyer une date d'effet vieille de plus d'un an.
    const unAnAvant = '2025-08-18';
    expect(r.effetPrevuIso > unAnAvant).toBe(true);
  });

  it('aucun cycle perdu quand tout est à jour', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2026-08-18', derniereApplicationIso: '2025-09-15' });
    expect(r.perdue).toBeNull();
  });

  it('la prescription ne remonte pas avant la première révision possible', () => {
    // Bail de 2025 : au 18/08/2026 le cycle en cours est le premier, rien n'est « perdu ».
    const r = etatRevision({ debut: '2025-03-10', todayISO: '2026-08-18' });
    expect(r.effetPrevuIso).toBe('2026-03-01');
    expect(r.perdue).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I10 — Loyer gelé DPE F/G
// ═══════════════════════════════════════════════════════════════════════════

describe('I10 — un lot au DPE F ou G n\'apparaît jamais dans « à réviser »', () => {
  it('le gel prime sur toute autre situation, même un retard de trois ans', () => {
    const r = etatRevision({ debut: '2021-06-20', todayISO: '2026-08-18', gel: true });
    expect(r.etat).toBe(ETAT.GEL);
    expect(r.muet).toBe(true);
    expect(ETATS_MUETS).toContain(r.etat);
  });
  it('un état muet n\'est jamais « à préparer » ni « en retard »', () => {
    for (const today of ['2026-05-01', '2026-08-01', '2026-08-18', '2026-09-01']) {
      const r = etatRevision({ debut: OHL, todayISO: today, gel: true });
      expect(r.etat).not.toBe(ETAT.A_PREPARER);
      expect(r.etat).not.toBe(ETAT.EN_RETARD);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  D17 — les non-révisables sont visibles mais muets
// ═══════════════════════════════════════════════════════════════════════════

describe('D17 — visibles, hors du compteur, sans action', () => {
  it('bail de moins d\'un an : muet, avec sa première échéance', () => {
    const r = etatRevision({ debut: '2026-02-01', todayISO: '2026-08-18' });
    expect(r.etat).toBe(ETAT.TROP_JEUNE);
    expect(r.muet).toBe(true);
    expect(r.effetPrevuIso).toBe('2027-02-01');
    expect(r.joursAvantEffet).toBe(167);   // « Dans 167 j » du mockup
  });
  it('indice non publié : muet, mais la date d\'effet reste connue', () => {
    // COLMAR-4 du mockup : effet prévu au 01/11/2025 jamais réclamé, indice T4 non publié.
    const r = etatRevision({ debut: '2022-11-12', todayISO: '2026-08-18', derniereApplicationIso: '2024-11-01', indiceManquant: true });
    expect(r.etat).toBe(ETAT.INDICE_MANQUANT);
    expect(ETATS_MUETS).toContain(r.etat);
    expect(r.muet).toBe(true);
    expect(r.effetPrevuIso).toBe('2025-11-01');
  });
  it('tous les états muets portent bien muet=true', () => {
    const cas = [
      { debut: OHL, todayISO: '2026-08-18', gel: true },
      { debut: '2026-02-01', todayISO: '2026-08-18' },
      { debut: OHL, todayISO: '2026-08-18', indiceManquant: true }
    ];
    for (const c of cas) {
      const r = etatRevision(c);
      if (ETATS_MUETS.includes(r.etat)) expect(r.muet).toBe(true);
    }
  });
  it('entrées vides → état neutre, aucun crash', () => {
    expect(etatRevision({}).etat).toBe(ETAT.RIEN);
    expect(etatRevision(null).etat).toBe(ETAT.RIEN);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  D16 — le calendrier Gantt
// ═══════════════════════════════════════════════════════════════════════════

describe('D16 — douze mois glissants, un lot par ligne', () => {
  const today = '2026-08-18';
  const lot = (ref, input) => ({ ref, libelle: ref, etat: etatRevision(Object.assign({ todayISO: today }, input)) });

  it('douze mois à partir du mois courant', () => {
    const g = ganttRevisions([], today);
    expect(g.mois).toHaveLength(12);
    expect(g.mois[0]).toMatchObject({ ym: '2026-08', courant: true });
    expect(g.mois[11].ym).toBe('2027-07');
  });

  it('bande de rappel au mois M-1, pavé plein au mois d\'effet', () => {
    const g = ganttRevisions([lot('MUTZIG-B1', { debut: OHL, derniereApplicationIso: '2025-09-01' })], today);
    const cells = g.lignes[0].cells;
    expect(cells.find(c => c.ym === '2026-08').kind).toBe('rappel');
    expect(cells.find(c => c.ym === '2026-09').kind).toBe('effet');
    expect(cells.filter(c => c.kind === 'effet')).toHaveLength(1);
  });

  it('un lot gelé porte une bande « loyer gelé », jamais un pavé d\'effet', () => {
    const g = ganttRevisions([lot('SELESTAT-3', { debut: '2022-11-12', gel: true })], today);
    const kinds = g.lignes[0].cells.map(c => c.kind);
    expect(kinds).not.toContain('effet');
    expect(kinds).not.toContain('rappel');
  });

  it('un cycle déjà fait se distingue d\'un cycle à faire', () => {
    const g = ganttRevisions([lot('X', { debut: '2024-08-05', derniereApplicationIso: '2026-08-01' })], today);
    expect(g.lignes[0].cells.find(c => c.ym === '2026-08').kind).toBe('faite');
  });

  it('liste vide ou date invalide → structure vide, aucun crash', () => {
    expect(ganttRevisions(null, today).lignes).toEqual([]);
    expect(ganttRevisions([], 'nope').mois).toEqual([]);
  });
});
