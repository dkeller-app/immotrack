import { describe, it, expect } from 'vitest';
import {
  ETAT, ETATS_MUETS, effetDuCycle, moisRappel, premierEffet, premierEffetAnticipe,
  moisRevisionParDefaut, moisRevision, anneeIndice, anneeReference, indiceDuCycle, trimestreConseille, indiceBaseConseille,
  cycleEnCours, cycleSuivant, etatRevision, ganttRevisions, rubanRevisions
} from '../../js/core/irl-calendrier.js';

/**
 * Le calendrier des révisions — CDC-QUITTANCES-IRL étape 5, révisé par IRL-REVISION
 * (docs/subjects/IRL-REVISION.md, validé 2026-09-24).
 * Invariants : I8 (prescription art. 17-1), I9 (rappel M-1), I10 (loyer gelé DPE F/G),
 * R1 (révision au 1er du mois, report au mois suivant), R5 (programmée), R12 (date commune).
 */

// Le bail d'Ohl : signé le 15/09/2023 → révisé chaque 01/10 (R1).
const OHL = '2023-09-15';
// Un bail commencé un 1er : révisé chaque 01/09, sans report.
const B1 = '2023-09-01';

describe('R1 — la révision est au 1er du mois, reportée au mois SUIVANT si le bail ne commence pas un 1er', () => {
  it('mois de révision par défaut', () => {
    expect(moisRevisionParDefaut(OHL)).toBe(10);
    expect(moisRevisionParDefaut(B1)).toBe(9);
    expect(moisRevisionParDefaut('2023-12-15')).toBe(1);   // franchit l'année
    expect(moisRevisionParDefaut('nope')).toBe(0);
  });
  it('bail du 15/09 → révision au 01/10 de chaque année, jamais avancée au 01/09 (ex-D12)', () => {
    expect(effetDuCycle(OHL, 2026)).toBe('2026-10-01');
    expect(effetDuCycle(OHL, 2027)).toBe('2027-10-01');
  });
  it('bail du 1er du mois → inchangé', () => {
    expect(effetDuCycle('2026-02-01', 2027)).toBe('2027-02-01');
  });
  it('un mois CONVENU au bail remplace le défaut (R10/R11)', () => {
    expect(moisRevision(OHL, 1)).toBe(1);
    expect(moisRevision(OHL, '')).toBe(10);
    expect(moisRevision(OHL, 13)).toBe(10);
    expect(effetDuCycle(OHL, 2026, 1)).toBe('2026-01-01');
  });
  it('la première révision tombe au moins un an après le début du bail', () => {
    expect(premierEffet(OHL)).toBe('2024-10-01');
    expect(premierEffet(B1)).toBe('2024-09-01');
    expect(premierEffet('2026-02-01')).toBe('2027-02-01');
    expect(premierEffet('2023-12-15')).toBe('2025-01-01');
  });
  it('entrées invalides → chaîne vide, jamais de crash', () => {
    expect(effetDuCycle('', 2026)).toBe('');
    expect(effetDuCycle(OHL, NaN)).toBe('');
    expect(premierEffet('nope')).toBe('');
  });
});

describe('R12 — date commune : jamais bloquant, même à moins d\'un an du début du bail', () => {
  it('bail du 01/10/2023, date commune au 1er janvier → première révision PROPOSÉE au 01/01/2024, signalée < 1 an', () => {
    expect(premierEffet('2023-10-01', 1)).toBe('2024-01-01');
    expect(premierEffetAnticipe('2023-10-01', 1)).toBe('2024-01-01');
  });
  it('sans date convenue, la première révision attend un an : rien de signalé', () => {
    expect(premierEffet('2023-10-01')).toBe('2024-10-01');
    expect(premierEffetAnticipe(OHL)).toBe('');
  });
  it('date convenue = mois du début d\'un bail commencé un 1er : un an plein, rien à signaler', () => {
    expect(premierEffet(B1, 9)).toBe('2024-09-01');
    expect(premierEffetAnticipe(B1, 9)).toBe('');
  });
  it('la révision anticipée a son rappel M-1 et devient « en retard » si elle n\'est pas faite', () => {
    expect(etatRevision({ debut: '2023-10-01', moisRevision: 1, todayISO: '2023-12-10' }).etat).toBe(ETAT.A_PREPARER);
    const r = etatRevision({ debut: '2023-10-01', moisRevision: 1, todayISO: '2024-01-10' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2024-01-01');
    expect(r.premiereAnticipeeIso).toBe('2024-01-01');
  });
  it('les cycles suivants suivent la date commune', () => {
    const r = etatRevision({ debut: '2023-10-01', moisRevision: 1, todayISO: '2025-01-15', derniereApplicationIso: '2024-01-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2025-01-01');
  });
});

describe('Indice — le dernier indice du trimestre du bail PUBLIÉ à la date de révision (INSEE)', () => {
  it('exemple INSEE : bail signé le 1er mars → IRL du T4 de l\'année précédente', () => {
    expect(anneeIndice(4, '2026-03-01')).toBe(2025);
  });
  it('T4 publié mi-janvier : au 01/01 c\'est encore celui de N-2', () => {
    expect(anneeIndice(4, '2026-01-01')).toBe(2024);
    expect(anneeIndice(4, '2026-02-01')).toBe(2025);
  });
  it('T1 mi-avril, T2 mi-juillet, T3 mi-octobre', () => {
    expect(anneeIndice(1, '2026-04-01')).toBe(2025);
    expect(anneeIndice(1, '2026-05-01')).toBe(2026);
    expect(anneeIndice(2, '2026-07-01')).toBe(2025);
    expect(anneeIndice(2, '2026-09-01')).toBe(2026);
    expect(anneeIndice(3, '2026-10-01')).toBe(2025);
    expect(anneeIndice(3, '2026-11-01')).toBe(2026);
  });
  it('entrées invalides → null', () => {
    expect(anneeIndice(5, '2026-03-01')).toBeNull();
    expect(anneeIndice(2, 'nope')).toBeNull();
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
  it('le cycle en cours est la dernière date de révision déjà passée', () => {
    expect(cycleEnCours(OHL, '2026-09-18').effetIso).toBe('2025-10-01');
    expect(cycleEnCours(OHL, '2026-10-01').effetIso).toBe('2026-10-01');
    expect(cycleEnCours(OHL, '2026-09-30').effetIso).toBe('2025-10-01');
  });
  it('null tant que le premier cycle n\'est pas atteint', () => {
    expect(cycleEnCours(OHL, '2024-09-30')).toBeNull();
    expect(cycleEnCours(OHL, '2024-10-01')).not.toBeNull();
  });
  it('le cycle suivant est un an après', () => {
    expect(cycleSuivant(OHL, '2026-09-18').effetIso).toBe('2026-10-01');
    expect(cycleSuivant(OHL, '2026-09-18').rappelYm).toBe('2026-09');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I9 / R4 — Rappel M-1 : du 1ᵉʳ au dernier jour du mois précédent, et pas avant
// ═══════════════════════════════════════════════════════════════════════════

describe('I9 — une révision d\'effet 01/09 apparaît du 01/08 au 31/08, jamais avant', () => {
  // Cycle 2025 déjà appliqué → c'est bien le rappel du cycle 2026 qu'on observe.
  const at = (today) => etatRevision({ debut: B1, todayISO: today, derniereApplicationIso: '2025-09-01' });

  it('le 31/07 : rien à préparer', () => {
    expect(at('2026-07-31').etat).toBe(ETAT.FAITE);
  });
  it('le 01/08 : la ligne apparaît', () => {
    const r = at('2026-08-01');
    expect(r.etat).toBe(ETAT.A_PREPARER);
    expect(r.effetPrevuIso).toBe('2026-09-01');
    expect(r.joursAvantEffet).toBe(31);
  });
  it('le 18/08 : toujours à préparer, 14 jours avant l\'effet', () => {
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
  it('bail du 15/09 : le rappel est en SEPTEMBRE (révision au 01/10)', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2026-09-10', derniereApplicationIso: '2025-10-01' });
    expect(r.etat).toBe(ETAT.A_PREPARER);
    expect(r.effetPrevuIso).toBe('2026-10-01');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  R5 — une révision VALIDÉE à effet futur est PROGRAMMÉE (le bug de prod v15.678)
// ═══════════════════════════════════════════════════════════════════════════

describe('R5 — « Valider la révision » fait quitter la ligne de « en retard » / « à préparer »', () => {
  it('BUG PROD : en retard (effet prévu 01/09), validée le 24/09 → effet 01/10 → PROGRAMMÉE, plus « en retard »', () => {
    const r = etatRevision({
      debut: B1, todayISO: '2026-09-24', derniereApplicationIso: '2025-09-01',
      journal: [{ ref: 'X', dateRevision: '2026-09-01', dateEffet: '2026-10-01', pendingApply: true }]
    });
    expect(r.etat).toBe(ETAT.PROGRAMMEE);
    expect(r.programmee).toEqual({ cycleIso: '2026-09-01', effetIso: '2026-10-01' });
    expect(r.muet).toBe(false);
    expect(r.joursAvantEffet).toBe(7);
  });
  it('sans l\'entrée du journal, la même ligne est bien « en retard » (témoin)', () => {
    const r = etatRevision({ debut: B1, todayISO: '2026-09-24', derniereApplicationIso: '2025-09-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
  });
  it('à préparer, validée à l\'avance pendant le mois de rappel → PROGRAMMÉE à la date de révision', () => {
    const r = etatRevision({
      debut: B1, todayISO: '2026-08-18', derniereApplicationIso: '2025-09-01',
      journal: [{ dateRevision: '2026-09-01', dateEffet: '2026-09-01', pendingApply: true }]
    });
    expect(r.etat).toBe(ETAT.PROGRAMMEE);
    expect(r.programmee.effetIso).toBe('2026-09-01');
  });
  it('la toute première révision, validée à l\'avance → PROGRAMMÉE aussi', () => {
    const r = etatRevision({
      debut: OHL, todayISO: '2024-09-10',
      journal: [{ dateRevision: '2024-10-01', dateEffet: '2024-10-01', pendingApply: true }]
    });
    expect(r.etat).toBe(ETAT.PROGRAMMEE);
  });
  it('effet atteint et appliqué → FAITE', () => {
    const r = etatRevision({
      debut: B1, todayISO: '2026-10-02', derniereApplicationIso: '2026-09-01',
      journal: [{ dateRevision: '2026-09-01', dateEffet: '2026-10-01', pendingApply: false }]
    });
    expect(r.etat).toBe(ETAT.FAITE);
  });
  it('une entrée SUPPRIMÉE (annulée) ne programme rien : la ligne revient « en retard »', () => {
    const r = etatRevision({
      debut: B1, todayISO: '2026-09-24', derniereApplicationIso: '2025-09-01',
      journal: [{ dateRevision: '2026-09-01', dateEffet: '2026-10-01', pendingApply: true, _deleted: true }]
    });
    expect(r.etat).toBe(ETAT.EN_RETARD);
  });
  it('une RENONCIATION traite le cycle sans le programmer', () => {
    const r = etatRevision({
      debut: B1, todayISO: '2026-09-24', derniereApplicationIso: '2025-09-01',
      journal: [{ dateRevision: '2026-09-01', action: 'renonciation' }]
    });
    expect(r.etat).toBe(ETAT.FAITE);
    expect(r.programmee).toBeNull();
  });
  it('les clés d\'anciens formats valent pour leur cycle (bail du 15/09 marqué « 2025-09-01 » = cycle 2025 fait)', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2026-08-18', derniereApplicationIso: '2025-09-01' });
    expect(r.etat).toBe(ETAT.FAITE);
    expect(r.effetPrevuIso).toBe('2025-10-01');
  });
  it('… mais n\'éteignent pas le cycle suivant (pas d\'IRL composée ni de cycle sauté)', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2026-10-05', derniereApplicationIso: '2025-09-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-10-01');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I8 — Prescription (art. 17-1) : le cycle périmé est fermé
// ═══════════════════════════════════════════════════════════════════════════

describe('I8 — au-delà d\'un an, la révision n\'est plus proposée', () => {
  it('un oubli de 4 mois reste proposable (cycle en cours)', () => {
    // Bail du 03/03 → révision au 01/04 ; cycle 2025 marqué à l'ancien format (01/03).
    const r = etatRevision({ debut: '2024-03-03', todayISO: '2026-08-18', derniereApplicationIso: '2025-03-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-04-01');
    expect(r.perdue).toBeNull();
  });

  it('un oubli de DEUX ans : seul le cycle EN COURS est proposé, le précédent est perdu', () => {
    const r = etatRevision({ debut: '2021-06-20', todayISO: '2026-08-18', derniereApplicationIso: '2024-06-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-07-01');   // cycle en cours, sur le loyer ACTUEL
    expect(r.perdue).toEqual({ annee: 2025, effetIso: '2025-07-01' });
  });

  it('un cycle jamais appliqué de plus d\'un an n\'est JAMAIS la révision proposée', () => {
    const r = etatRevision({ debut: '2021-06-20', todayISO: '2026-08-18' });
    expect(r.effetPrevuIso).toBe('2026-07-01');
    expect(new Date(r.perdue.effetIso + 'T00:00:00').getFullYear()).toBe(2025);
    expect(r.effetPrevuIso > '2025-08-18').toBe(true);
  });

  it('aucun cycle perdu quand tout est à jour', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2026-08-18', derniereApplicationIso: '2025-09-15' });
    expect(r.perdue).toBeNull();
  });

  it('la prescription ne remonte pas avant la première révision possible', () => {
    const r = etatRevision({ debut: '2025-03-10', todayISO: '2026-08-18' });
    expect(r.effetPrevuIso).toBe('2026-04-01');
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
    for (const today of ['2026-05-01', '2026-08-01', '2026-09-18', '2026-10-01']) {
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
    expect(r.joursAvantEffet).toBe(167);
  });
  it('indice non publié : muet, mais la date d\'effet reste connue', () => {
    // Bail du 12/11 → révision au 01/12 ; cycle 2025 jamais réclamé, indice non publié.
    const r = etatRevision({ debut: '2022-11-12', todayISO: '2026-08-18', derniereApplicationIso: '2024-11-01', indiceManquant: true });
    expect(r.etat).toBe(ETAT.INDICE_MANQUANT);
    expect(ETATS_MUETS).toContain(r.etat);
    expect(r.muet).toBe(true);
    expect(r.effetPrevuIso).toBe('2025-12-01');
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
//  D16 — le calendrier Gantt / le ruban
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
    const g = ganttRevisions([lot('MUTZIG-B1', { debut: B1, derniereApplicationIso: '2025-09-01' })], today);
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
    const g = ganttRevisions([lot('X', { debut: '2024-08-01', derniereApplicationIso: '2026-08-01' })], today);
    expect(g.lignes[0].cells.find(c => c.ym === '2026-08').kind).toBe('faite');
  });

  it('une révision PROGRAMMÉE n\'est plus comptée « à faire »', () => {
    const g = ganttRevisions([lot('P', {
      debut: B1, derniereApplicationIso: '2025-09-01',
      journal: [{ dateRevision: '2026-09-01', dateEffet: '2026-09-01', pendingApply: true }]
    })], today);
    const r = rubanRevisions(g);
    expect(r.totalEffet).toBe(0);
    expect(r.mois.find(m => m.ym === '2026-09').nbFaite).toBe(1);
  });

  it('une révision programmée tombe au mois où elle PREND EFFET, pas au mois de son cycle', () => {
    // Cycle du 01/09 validé en retard le 24/09 → effet 01/10 : la tuile verte est en octobre.
    const g = ganttRevisions([{ ref: 'P', libelle: 'P', etat: etatRevision({
      debut: B1, todayISO: '2026-09-24', derniereApplicationIso: '2025-09-01',
      journal: [{ dateRevision: '2026-09-01', dateEffet: '2026-10-01', pendingApply: true }]
    }) }], '2026-09-24');
    const cells = g.lignes[0].cells;
    expect(cells.find(c => c.ym === '2026-10').kind).toBe('faite');
    expect(cells.find(c => c.ym === '2026-09').kind).toBe('rappel');
  });

  it('rubanRevisions agrège nbFaite pour le mois d\'application', () => {
    const g = ganttRevisions([lot('X', { debut: '2024-08-01', derniereApplicationIso: '2026-08-01' })], today);
    const ruban = rubanRevisions(g);
    const aout = ruban.mois.find(m => m.ym === '2026-08');
    expect(aout.nbFaite).toBe(1);
    expect(aout.faite.map(f => f.ref)).toContain('X');
    expect(aout.nbEffet).toBe(0);
  });

  it('liste vide ou date invalide → structure vide, aucun crash', () => {
    expect(ganttRevisions(null, today).lignes).toEqual([]);
    expect(ganttRevisions([], 'nope').mois).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  D13/I9 — le rappel M-1 vaut aussi pour la PREMIÈRE révision
// ═══════════════════════════════════════════════════════════════════════════

describe('I9 — la première révision d\'un bail a droit à son mois de rappel', () => {
  // Bail du 15/09/2023 : premier effet au 01/10/2024, donc rappel sur tout septembre 2024.
  const at = (today) => etatRevision({ debut: OHL, todayISO: today });

  it('avant le mois de rappel : muet, listé comme non révisable', () => {
    const r = at('2024-08-15');
    expect(r.etat).toBe(ETAT.TROP_JEUNE);
    expect(r.muet).toBe(true);
  });

  it('le 01/09 : la ligne apparaît dans « à préparer », et elle n\'est PAS muette', () => {
    const r = at('2024-09-01');
    expect(r.etat).toBe(ETAT.A_PREPARER);
    expect(r.muet).toBe(false);
    expect(r.effetPrevuIso).toBe('2024-10-01');
    expect(r.cycleAnnee).toBe(2024);
  });

  it('le 30/09 : dernier jour de la fenêtre', () => {
    expect(at('2024-09-30').etat).toBe(ETAT.A_PREPARER);
  });

  it('le 01/10 : le cycle est en cours — en retard seulement s\'il n\'a pas été fait', () => {
    expect(at('2024-10-01').etat).toBe(ETAT.EN_RETARD);
    expect(etatRevision({ debut: OHL, todayISO: '2024-10-01', derniereApplicationIso: '2024-10-01' }).etat)
      .toBe(ETAT.FAITE);
  });

  it('sans l\'indice, le rappel reste muet plutôt que de proposer un calcul impossible', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2024-09-10', indiceManquant: true });
    expect(ETATS_MUETS).toContain(r.etat);
    expect(r.muet).toBe(true);
    expect(r.effetPrevuIso).toBe('2024-10-01');
  });

  it('un bail gelé DPE F/G n\'entre jamais dans ce rappel', () => {
    expect(etatRevision({ debut: OHL, todayISO: '2024-09-10', gel: true }).etat).toBe(ETAT.GEL);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIT code-reviewer (2026-09-25) — scénarios reproduits, verrouillés ici
// ═══════════════════════════════════════════════════════════════════════════

describe('Audit C1/C2 — jamais deux fois la même variation d\'indice', () => {
  it('référence = indice en vigueur de la dernière révision du bail, à défaut son indice de base', () => {
    expect(anneeReference({ bailIrl: 'T2 2023' })).toBe(2023);
    expect(anneeReference({ bailIrl: 'T4 2024', debut: '2024-03-01',
      journal: [{ dateRevision: '2025-03-01', irlVigueur: 'T4 2025' }] })).toBe(2025);
    expect(anneeReference({ bailIrl: 'T2' })).toBeNull();
  });
  it('une renonciation consomme aussi son année', () => {
    expect(anneeReference({ bailIrl: 'T2 2023', journal: [{ dateRevision: '2025-09-01', irlVigueur: 'T2 2025', action: 'renonciation' }] })).toBe(2025);
  });
  it('le journal du bail PRÉCÉDENT du lot est ignoré (relocation)', () => {
    expect(anneeReference({ bailIrl: 'T2 2026', debut: '2026-09-15',
      journal: [{ dateRevision: '2026-03-01', irlVigueur: 'T4 2025' }] })).toBe(2026);
  });
  it('C1 (règle ANIL, décision 25/09) — bail de mars T4, cycle 2025 appliqué en retard avec T4 2025 : RIEN à réviser en 2026, normal en 2027', () => {
    // Référence venue du JOURNAL : l'indice connu au 01/03/2026 (T4 2025) est déjà dans le loyer.
    expect(indiceDuCycle(4, '2026-03-01', 2025, false)).toEqual({ annee: 2025, dejaIndexe: true, rienAReviser: true });
    expect(indiceDuCycle(4, '2027-03-01', 2025, false)).toEqual({ annee: 2026, dejaIndexe: false, rienAReviser: false });
  });
  it('C2 — bail signé sur T2 2026 (dernier publié), date commune octobre : rien à réviser au 01/10/2026 si la référence vient d’une révision', () => {
    expect(indiceDuCycle(2, '2026-10-01', 2026, false).rienAReviser).toBe(true);
    expect(indiceDuCycle(2, '2027-10-01', 2026, false)).toEqual({ annee: 2027, dejaIndexe: false, rienAReviser: false });
  });
  it('Exception N1 — référence = indice de BASE du bail (ancienne table) : bail du 01/04/2025 sur T1 2025, on attend T1 2026', () => {
    expect(indiceDuCycle(1, '2026-04-01', 2025, true)).toEqual({ annee: 2026, dejaIndexe: true, rienAReviser: false });
  });
  it('cas nominal : bail de septembre T2, cycles successifs', () => {
    expect(indiceDuCycle(2, '2024-09-01', 2023)).toEqual({ annee: 2024, dejaIndexe: false, rienAReviser: false });
    expect(indiceDuCycle(2, '2025-09-01', 2024)).toEqual({ annee: 2025, dejaIndexe: false, rienAReviser: false });
  });
});

describe('Audit I1 — une révision programmée prime sur le rappel du cycle suivant', () => {
  it('cycle 2025-10 validé tard (15/09/2026, effet 01/10/2026) : le lot reste PROGRAMMÉ en septembre', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2026-09-20', derniereApplicationIso: '2024-10-01',
      journal: [{ dateRevision: '2025-10-01', dateEffet: '2026-10-01', pendingApply: true }] });
    expect(r.etat).toBe(ETAT.PROGRAMMEE);
    expect(r.programmee).toEqual({ cycleIso: '2025-10-01', effetIso: '2026-10-01' });
  });
  it('une fois l\'effet atteint et appliqué, le cycle suivant redevient proposable', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2026-10-02', derniereApplicationIso: '2025-10-01',
      journal: [{ dateRevision: '2025-10-01', dateEffet: '2026-10-01', pendingApply: false }] });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-10-01');
  });
});

describe('Audit I3 — relocation : les marques du bail précédent ne valent rien', () => {
  it('nouveau bail du 15/09/2026 (mois convenu octobre) : l\'ancienne marque 2026-03-01 ne fait pas son 1er cycle', () => {
    const r = etatRevision({ debut: '2026-09-15', moisRevision: 10, todayISO: '2026-10-05', derniereApplicationIso: '2026-03-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-10-01');
  });
});

describe('Audit passe 2 N3 — une ancienne marque « date d’effet » est ramenée à la clé de son cycle', () => {
  it('marque 2026-03-01 = date d’effet de l’entrée du cycle 2025-10 : le cycle 2026-10 reste à faire', () => {
    const r = etatRevision({ debut: OHL, todayISO: '2026-10-05', derniereApplicationIso: '2026-03-01',
      journal: [{ dateRevision: '2025-10-01', dateEffet: '2026-03-01', pendingApply: false }] });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-10-01');
  });
});

describe('Audit passe 2 N5 — changer le mois de révision ne saute aucun cycle', () => {
  it('révisé le 2025-09-01, passage en mars le 2025-11-10 : le cycle 2026-03-01 reste à faire', () => {
    const r = etatRevision({ debut: '2023-09-01', moisRevision: 3, moisRevisionDepuis: '2025-11-10',
      todayISO: '2026-03-10', derniereApplicationIso: '2025-09-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2026-03-01');
  });
  it('sans changement déclaré, la même marque fait le cycle (comportement inchangé)', () => {
    const r = etatRevision({ debut: '2023-09-01', moisRevision: 3, todayISO: '2026-03-10', derniereApplicationIso: '2025-09-01' });
    expect(r.etat).toBe(ETAT.FAITE);
  });
});

describe('Audit passe 3 N9 — une marque qui EST une date de cycle n’est jamais rattachée à un autre cycle', () => {
  it('bail du 01/10 : cycle 2024 validé tard (effet 01/10/2025), cycle 2025 fait (marque 2025-10-01 sans entrée) → FAIT', () => {
    const r = etatRevision({ debut: '2023-10-01', todayISO: '2026-02-10', derniereApplicationIso: '2025-10-01',
      journal: [{ dateRevision: '2024-10-01', dateEffet: '2025-10-01', pendingApply: false }] });
    expect(r.etat).toBe(ETAT.FAITE);
  });
});

describe('Maquette 7b validée (25/09) — trimestre IRL conseillé selon le mois de révision', () => {
  it('le trimestre dont l’indice est le plus récent au 1er du mois de révision', () => {
    expect([1,2,3,4,5,6,7,8,9,10,11,12].map(trimestreConseille)).toEqual([3,4,4,4,1,1,1,2,2,2,3,3]);
    expect(trimestreConseille(0)).toBeNull();
  });
  it('l’indice de base = dernier indice de ce trimestre publié à la signature', () => {
    expect(indiceBaseConseille('2025-09-15', 1)).toBe('T3 2024');   // T3 2025 paraît mi-octobre
    expect(indiceBaseConseille('2025-11-10', 1)).toBe('T3 2025');
    expect(indiceBaseConseille('2025-03-01', 3)).toBe('T4 2024');   // exemple INSEE
    expect(indiceBaseConseille('nope', 1)).toBe('');
  });
});

describe('Maquette 5 validée (option C) — deux révisions tombent en même temps', () => {
  it('cycle en retard + mois de rappel du suivant : le lot est « à décider » (conflitSuivant)', () => {
    const r = etatRevision({ debut: '2023-10-01', todayISO: '2026-09-24', derniereApplicationIso: '2024-10-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.effetPrevuIso).toBe('2025-10-01');
    expect(r.conflitSuivant).toEqual({ effetIso: '2026-10-01' });
  });
  it('hors du mois de rappel : révision en retard ordinaire, pas de conflit', () => {
    const r = etatRevision({ debut: '2023-10-01', todayISO: '2026-08-24', derniereApplicationIso: '2024-10-01' });
    expect(r.etat).toBe(ETAT.EN_RETARD);
    expect(r.conflitSuivant).toBeNull();
  });
});

describe('Audit passe 4 (C2/I1) — un cycle « sans objet » (règle ANIL) compte comme traité', () => {
  // Bail du 01/10/2025, base T3 2025 ; cycle 2026 appliqué avec T3 2026 ; le cycle 2027 n'a rien à réviser.
  const so = (e) => e === '2027-10-01';
  it('en septembre 2028, le rappel du cycle 2028 apparaît (le cycle 2027 ne le masque plus)', () => {
    const r = etatRevision({ debut: '2025-10-01', todayISO: '2028-09-15', derniereApplicationIso: '2026-10-01', sansObjet: so });
    expect(r.etat).toBe(ETAT.A_PREPARER);
    expect(r.effetPrevuIso).toBe('2028-10-01');
    expect(r.conflitSuivant).toBeNull();
  });
  it('en cours de cycle 2027 : « fait », signalé sans objet, jamais « en retard » ni « perdu »', () => {
    const r = etatRevision({ debut: '2025-10-01', todayISO: '2027-12-01', derniereApplicationIso: '2026-10-01', sansObjet: so });
    expect(r.etat).toBe(ETAT.FAITE);
    expect(r.sansObjet).toBe(true);
    const r2 = etatRevision({ debut: '2025-10-01', todayISO: '2028-11-01', derniereApplicationIso: '2028-10-01', sansObjet: so });
    expect(r2.perdue).toBeNull();
  });
});

describe('Audit passe 5 I-1 — dans le mois de rappel, un cycle suivant sans objet est dit « sans objet »', () => {
  it('bail du 01/03 T4, cycle 2025 fait en retard avec T4 2025 : le 15/02/2026, cycle 2026 sansObjet (pas « appliqué »)', () => {
    const so = (e) => e === '2026-03-01';
    const r = etatRevision({ debut: '2023-03-01', todayISO: '2026-02-15', derniereApplicationIso: '2025-03-01', sansObjet: so });
    expect(r.etat).toBe(ETAT.FAITE);
    expect(r.effetPrevuIso).toBe('2026-03-01');
    expect(r.sansObjet).toBe(true);
  });
});
