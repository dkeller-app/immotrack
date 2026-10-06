/**
 * Tests pour GESTION DG & IMPAYÉS v15.12 Sprint 12 V1.1.
 * Module js/core/gestion-dg-impayes.js
 */
import { describe, it, expect } from 'vitest';
import {
  _dgStatut, _calculerDelaiRestitution, _calculerSoldeDG, _penaliteRetardDG,
  _planApurementStatut, _procedureJudiciaireEtat,
  DG_STATUS, PROCEDURE_ETAT
} from '../../js/core/gestion-dg-impayes.js';

// ═══════════════════════════════════════════════════════════════════
//  _penaliteRetardDG — pénalité art. 22 (10 % loyer HC / mois entamé)
// ═══════════════════════════════════════════════════════════════════
describe('_penaliteRetardDG', () => {
  // Pas d'EDL de sortie → conformité inconnue → échéance applicable 2 mois ; sortie 15/06/2026 → 15/08/2026.
  const base = { hc: 650, ch: 80, dgRetenu: 100, depart: { dateSortie: '2026-06-15' } };

  it('restitué dans le délai → aucune pénalité', () => {
    const r = _penaliteRetardDG({ ...base, dgRestitueAt: '2026-08-10' });
    expect(r.enRetard).toBe(false);
    expect(r.penalite).toBe(0);
    expect(r.moisRetard).toBe(0);
    expect(r.dateLimite).toBe('2026-08-15');
  });
  it('1 mois pile de retard → 1 mois entamé = 65 €', () => {
    const r = _penaliteRetardDG({ ...base, dgRestitueAt: '2026-09-15' });
    expect(r.moisRetard).toBe(1);
    expect(r.base).toBe(650); // loyer HC, pas HC+charges
    expect(r.penalite).toBe(65);
  });
  it('1 mois + 1 jour → 2 mois entamés = 130 €', () => {
    const r = _penaliteRetardDG({ ...base, dgRestitueAt: '2026-09-16' });
    expect(r.moisRetard).toBe(2);
    expect(r.penalite).toBe(130);
  });
  it('adresse non communiquée → pénalité neutralisée', () => {
    const r = _penaliteRetardDG({ ...base, dgRestitueAt: '2026-09-16', dgAdresseNonCommuniquee: true });
    expect(r.enRetard).toBe(true);
    expect(r.moisRetard).toBe(2);
    expect(r.exclue).toBe(true);
    expect(r.penalite).toBe(0);
  });
  it('non restitué → retard courant calculé à la date de référence', () => {
    const r = _penaliteRetardDG(base, '2026-10-20'); // pas de dgRestitueAt
    expect(r.enRetard).toBe(true);
    expect(r.moisRetard).toBe(3); // 15/08 → 20/10 = 2 mois pleins + entamé
    expect(r.penalite).toBe(195);
  });
  it('sans date de sortie → 0 (incalculable)', () => {
    const r = _penaliteRetardDG({ hc: 650 });
    expect(r.penalite).toBe(0);
    expect(r.dateLimite).toBe(null);
  });

  // AUDIT #1 — recadrage fin de mois (art. 641 CPC), comme _departDeadlineDG.
  describe('débordement fin de mois', () => {
    it('sortie 31/12, délai 2 mois → date limite recadrée au 28/02 (pas 03/03)', () => {
      const r = _penaliteRetardDG({ hc: 650, dgRetenu: 100, depart: { dateSortie: '2025-12-31' }, dgRestitueAt: '2026-02-28' });
      expect(r.dateLimite).toBe('2026-02-28');
      expect(r.moisRetard).toBe(0); // pile à la date limite → pas de retard
    });
    // EDL de sortie CONFORME (pas de dégradation) → délai 1 mois : 31/12 + 1 = 31/01.
    const CONFORME = [{ type: 'Sortie', logement: 'F-1', date: '2025-12-31', pieces: [{ elements: [{ etatE: 'Bon état', etatS: 'Bon état' }] }] }];
    it('date limite 31/01 (sortie 31/12, EDL conforme), restit 01/03 → 2 mois entamés (pas 1)', () => {
      const r = _penaliteRetardDG({ ref: 'F-1', hc: 650, depart: { dateSortie: '2025-12-31' }, dgRestitueAt: '2026-03-01' }, undefined, CONFORME);
      expect(r.dateLimite).toBe('2026-01-31');
      expect(r.moisRetard).toBe(2); // 1er mois plein court jusqu'au 28/02 ; au 01/03 le 2e est entamé
      expect(r.penalite).toBe(130);
      expect(r.possible).toBeNull();
    });
    it('date limite 31/01, restit exactement +1 mois (28/02) → 1 mois', () => {
      const r = _penaliteRetardDG({ ref: 'F-1', hc: 650, depart: { dateSortie: '2025-12-31' }, dgRestitueAt: '2026-02-28' }, undefined, CONFORME);
      expect(r.moisRetard).toBe(1);
    });
  });

  // Pilotage 06/10 — conformité INCONNUE (pas d'EDL de sortie) : pénalité CERTAINE depuis 2 mois, POSSIBLE depuis 1 mois.
  describe('conformité de l’EDL de sortie inconnue', () => {
    it('la pénalité certaine court depuis 2 mois ; celle depuis 1 mois est rendue à part, jamais dans « penalite »', () => {
      const r = _penaliteRetardDG({ hc: 650, depart: { dateSortie: '2025-12-31' }, dgRestitueAt: '2026-03-01' });
      expect(r).toMatchObject({ dateLimite: '2026-02-28', enRetard: true, moisRetard: 1, penalite: 65 });
      expect(r.possible).toEqual({ depuis: '2026-01-31', moisRetard: 2, penalite: 130 });
    });
    it('entre 1 et 2 mois : aucune pénalité certaine, une pénalité possible', () => {
      const r = _penaliteRetardDG({ hc: 650, depart: { dateSortie: '2025-12-31' }, dgRestitueAt: '2026-02-15' });
      expect(r).toMatchObject({ enRetard: false, penalite: 0, possible: { depuis: '2026-01-31', moisRetard: 1, penalite: 65 } });
    });
    it('les retenues ne décident plus du délai : retenue + EDL conforme → 1 mois', () => {
      const r = _penaliteRetardDG({ ref: 'F-1', hc: 650, dgRetenu: 300, depart: { dateSortie: '2025-12-31' }, dgRestitueAt: '2026-02-01' }, undefined,
        [{ type: 'Sortie', logement: 'F-1', date: '2025-12-31', pieces: [] }]);
      expect(r).toMatchObject({ dateLimite: '2026-01-31', enRetard: true, moisRetard: 1, possible: null });
    });
    it('point de départ : la remise des clés déclarée passe AVANT la date de l’EDL de sortie et la fin effective', () => {
      const r = _penaliteRetardDG({ ref: 'F-1', hc: 650, finEffective: '2025-11-30', depart: { dateSortie: '2025-12-31' }, dgRestitueAt: '2026-01-15' }, undefined,
        [{ type: 'Sortie', logement: 'F-1', date: '2026-01-05', pieces: [] }]);
      expect(r.dateLimite).toBe('2026-01-31');
      const sansRemise = _penaliteRetardDG({ ref: 'F-1', hc: 650, finEffective: '2025-11-30', dgRestitueAt: '2026-01-15' }, undefined,
        [{ type: 'Sortie', logement: 'F-1', date: '2026-01-05', pieces: [] }]);
      expect(sansRemise.dateLimite).toBe('2026-02-05');   // date de l'EDL de sortie, avant la fin effective
    });
  });
});

describe('_calculerSoldeDG — repli dgPaid → dg (AUDIT observation)', () => {
  it('dgPaid non renseigné → base = dg (pas 0)', () => {
    const r = _calculerSoldeDG({ dg: 1300, dgRetenu: 300 }, []);
    expect(r.dgPaid).toBe(1300);
    expect(r.soldeRestitue).toBe(1000); // 1300 − 300, pas 0
  });
  it('dgPaid renseigné → prioritaire sur dg', () => {
    const r = _calculerSoldeDG({ dg: 1300, dgPaid: 1200, dgRetenu: 200 }, []);
    expect(r.dgPaid).toBe(1200);
    expect(r.soldeRestitue).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _dgStatut — Tracking DG bail actif
// ═══════════════════════════════════════════════════════════════════

describe('_dgStatut — bail actif', () => {
  it('DG manquant (dû mais pas versé)', () => {
    const r = _dgStatut({ dg: 1200, dgPaid: 0 });
    expect(r.statut).toBe(DG_STATUS.MANQUANT);
    expect(r.soldeRestant).toBe(1200);
  });
  it('DG partiel (versé < dû)', () => {
    const r = _dgStatut({ dg: 1200, dgPaid: 600 });
    expect(r.statut).toBe(DG_STATUS.PARTIEL);
    expect(r.soldeRestant).toBe(600);
  });
  it('DG complet (versé = dû)', () => {
    const r = _dgStatut({ dg: 1200, dgPaid: 1200 });
    expect(r.statut).toBe(DG_STATUS.COMPLET);
    expect(r.soldeRestant).toBe(0);
  });
  it('DG complet (versé > dû)', () => {
    const r = _dgStatut({ dg: 1200, dgPaid: 1500 });
    expect(r.statut).toBe(DG_STATUS.COMPLET);
  });
  it('Bail null → manquant', () => {
    expect(_dgStatut(null).statut).toBe(DG_STATUS.MANQUANT);
  });
});

describe('_dgStatut — bail clôturé (restitution)', () => {
  const baseClotur = { dg: 1200, dgPaid: 1200, cloture: true, finEffective: '2026-01-15' };

  // Sans EDL de sortie : conformité inconnue → 15/02 si conforme, 15/03 sinon (pilotage 06/10).
  it('Conformité inconnue, avant 1 mois → a_restituer ; les deux maximums rendus', () => {
    const r = _dgStatut(baseClotur, '2026-01-20');
    expect(r).toMatchObject({ statut: DG_STATUS.A_RESTITUER, delaiMois: 2, conforme: null, limiteSiConforme: '2026-02-15', limite: '2026-03-15', joursRestants: 54 });
  });

  it('Conformité inconnue, entre 1 et 2 mois → dépassement possible, pas en retard', () => {
    const r = _dgStatut(baseClotur, '2026-03-01');
    expect(r.statut).toBe(DG_STATUS.DEPASSEMENT_POSSIBLE);
    expect(r.joursRestants).toBe(14);
  });

  it('Au-delà de 2 mois → en_retard avec joursRetard', () => {
    const r = _dgStatut(baseClotur, '2026-03-20');
    expect(r.statut).toBe(DG_STATUS.EN_RETARD);
    expect(r.joursRetard).toBe(5);
  });

  it('EDL de sortie conforme → 1 mois ; dépassé le lendemain → en retard', () => {
    const bail = { ...baseClotur, ref: 'F-1' };
    const edls = [{ type: 'Sortie', logement: 'F-1', date: '2026-01-15', pieces: [] }];
    expect(_dgStatut(bail, '2026-02-15', edls)).toMatchObject({ statut: DG_STATUS.A_RESTITUER, delaiMois: 1, conforme: true, joursRestants: 0 });
    expect(_dgStatut(bail, '2026-02-16', edls)).toMatchObject({ statut: DG_STATUS.EN_RETARD, joursRetard: 1 });
  });

  it('point de départ : remise des clés déclarée avant la fin effective', () => {
    const r = _dgStatut({ ...baseClotur, depart: { dateSortie: '2026-01-05' } }, '2026-01-20');
    expect(r.limite).toBe('2026-03-05');
  });

  it('DG déjà restitué → restitue', () => {
    const r = _dgStatut({ ...baseClotur, dgRestitueAt: '2026-02-01' }, '2026-03-01');
    expect(r.statut).toBe(DG_STATUS.RESTITUE);
  });

  it('Une retenue ne décide pas du délai : EDL conforme + retenue → 1 mois', () => {
    const bail = { ...baseClotur, ref: 'F-1', dgRetenu: 200 };
    const r = _dgStatut(bail, '2026-02-10', [{ type: 'Sortie', logement: 'F-1', date: '2026-01-15', pieces: [] }]);
    expect(r.statut).toBe(DG_STATUS.A_RESTITUER);
    expect(r.delaiMois).toBe(1);
  });
});

describe('EDL de sortie de CE bail : sans EDL passés, le module lit le résolveur borné de l’app', () => {
  it('window._edlSortieDuBail (borné au début du bail suivant) prime sur le DB vivant brut', () => {
    const save = globalThis.window;
    // DB vivant : la sortie DÉGRADÉE est celle du locataire suivant ; le résolveur de l'app ne la rend pas.
    const conforme = { type: 'Sortie', logement: 'F-1', date: '2026-01-15', pieces: [] };
    const suivant = { type: 'Sortie', logement: 'F-1', date: '2027-06-30', pieces: [{ elements: [{ etatE: 'Bon état', etatS: 'Mauvais état' }] }] };
    globalThis.window = { __immoGetDB: () => ({ edl: [conforme, suivant] }), _edlSortieDuBail: () => conforme };
    try {
      expect(_calculerDelaiRestitution({ ref: 'F-1', debut: '2024-01-01' })).toBe(1);
      expect(_dgStatut({ ref: 'F-1', cloture: true, finEffective: '2026-01-15', dg: 900, dgPaid: 900 }, '2026-02-01').delaiMois).toBe(1);
      globalThis.window = { __immoGetDB: () => ({ edl: [conforme, suivant] }) };   // sans le résolveur : le plus récent du DB
      expect(_calculerDelaiRestitution({ ref: 'F-1', debut: '2024-01-01' })).toBe(2);
    } finally { globalThis.window = save; }
  });
});

describe('_calculerDelaiRestitution', () => {
  it('Sans EDL de sortie → 2 mois (seul maximum certain ; conformité inconnue)', () => {
    expect(_calculerDelaiRestitution({ dgRetenu: 0 })).toBe(2);
    expect(_calculerDelaiRestitution({})).toBe(2);
  });

  it('Une retenue ne décide pas du délai (pilotage 06/10) : EDL conforme + dgRetenu > 0 → 1 mois', () => {
    expect(_calculerDelaiRestitution({ ref: 'F-001', dgRetenu: 200 }, [{ type: 'Sortie', logement: 'F-001', pieces: [] }])).toBe(1);
  });

  it('Avec EDL sortie sans dégradation → 1 mois', () => {
    const edls = [{
      type: 'Sortie', logement: 'F-001',
      pieces: [{ elements: [{ etatE: 'Bon état', etatS: 'Bon état' }] }]
    }];
    expect(_calculerDelaiRestitution({ ref: 'F-001' }, edls)).toBe(1);
  });

  it('Avec EDL sortie + dégradation Mauvais état → 2 mois', () => {
    const edls = [{
      type: 'Sortie', logement: 'F-001',
      pieces: [{ elements: [{ etatE: 'Bon état', etatS: 'Mauvais état' }] }]
    }];
    expect(_calculerDelaiRestitution({ ref: 'F-001' }, edls)).toBe(2);
  });

  it('Bail null → 2 mois (sécuritaire)', () => {
    expect(_calculerDelaiRestitution(null)).toBe(2);
  });
});

describe('_calculerSoldeDG', () => {
  it('Sans retenue ni impayé → solde = DG versé', () => {
    const bail = { dg: 1200, dgPaid: 1200, debut: '2026-01-01', fin: '2026-01-15', hc: 0, ch: 0, ref: 'F-001' };
    const r = _calculerSoldeDG(bail, []);
    expect(r.soldeRestitue).toBe(1200);
  });

  it('Avec retenue 200 → solde = 1000', () => {
    const bail = { dg: 1200, dgPaid: 1200, dgRetenu: 200, debut: '2026-01-01', fin: '2026-01-15', hc: 0, ch: 0 };
    expect(_calculerSoldeDG(bail, []).soldeRestitue).toBe(1000);
  });

  it('Avec loyer impayé → déduit', () => {
    const bail = {
      ref: 'F-001', dg: 1200, dgPaid: 1200,
      debut: '2026-01-01', finEffective: '2026-03-31',
      hc: 600, ch: 50
    };
    // 3 mois × 650 = 1950 attendu, 0 reçu → impayé 1950
    const r = _calculerSoldeDG(bail, []);
    expect(r.loyerImpaye).toBe(1950);
    expect(r.soldeRestitue).toBe(0); // 1200 - 1950 → clamped à 0
  });

  it('Retenue + impayé partiel', () => {
    const bail = {
      ref: 'F-001', dg: 1200, dgPaid: 1200, dgRetenu: 100,
      debut: '2026-01-01', finEffective: '2026-01-31', hc: 600, ch: 50
    };
    const mvts = [{ qui: 'F-001', date: '2026-01-05', cr: 400, _deleted: false }];
    // 1 mois × 650 attendu, 400 reçu → 250 impayé
    // Solde = 1200 - 100 (retenue) - 250 (impayé) = 850
    const r = _calculerSoldeDG(bail, mvts);
    expect(r.loyerImpaye).toBe(250);
    expect(r.soldeRestitue).toBe(850);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _planApurementStatut
// ═══════════════════════════════════════════════════════════════════

describe('_planApurementStatut', () => {
  it('Plan sans échéances → aucun', () => {
    expect(_planApurementStatut({}).statut).toBe('aucun');
    expect(_planApurementStatut(null).statut).toBe('aucun');
    expect(_planApurementStatut({ echeances: [] }).statut).toBe('aucun');
  });

  it('Toutes échéances payées → termine', () => {
    const plan = { echeances: [
      { date: '2026-01-31', montant: 200, paye: true },
      { date: '2026-02-28', montant: 200, paye: true }
    ]};
    const r = _planApurementStatut(plan, '2026-03-15');
    expect(r.statut).toBe('termine');
    expect(r.montantPaye).toBe(400);
  });

  it('Échéance à venir + dans le futur → a_jour', () => {
    const plan = { echeances: [
      { date: '2026-01-31', montant: 200, paye: true },
      { date: '2026-12-31', montant: 200, paye: false }
    ]};
    const r = _planApurementStatut(plan, '2026-06-15');
    expect(r.statut).toBe('a_jour');
    expect(r.prochaineEcheance).toBe('2026-12-31');
  });

  it('Échéance dépassée non payée → retard avec retardJours', () => {
    const plan = { echeances: [
      { date: '2026-01-31', montant: 200, paye: false }
    ]};
    const r = _planApurementStatut(plan, '2026-02-10');
    expect(r.statut).toBe('retard');
    expect(r.retardJours).toBeGreaterThanOrEqual(9);
    expect(r.prochaineEcheance).toBe('2026-01-31');
  });

  it('Plusieurs échéances : la première impayée fait foi', () => {
    const plan = { echeances: [
      { date: '2026-01-31', montant: 200, paye: true },
      { date: '2026-02-28', montant: 200, paye: false },
      { date: '2026-03-31', montant: 200, paye: false }
    ]};
    const r = _planApurementStatut(plan, '2026-03-15');
    expect(r.prochaineEcheance).toBe('2026-02-28');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _procedureJudiciaireEtat
// ═══════════════════════════════════════════════════════════════════

describe('_procedureJudiciaireEtat', () => {
  it('Aucune procédure → aucune', () => {
    expect(_procedureJudiciaireEtat({}).etat).toBe(PROCEDURE_ETAT.AUCUNE);
    expect(_procedureJudiciaireEtat(null).etat).toBe(PROCEDURE_ETAT.AUCUNE);
  });

  it('Mise en demeure seule', () => {
    const r = _procedureJudiciaireEtat({ miseEnDemeureDate: '2026-01-05' }, '2026-01-15');
    expect(r.etat).toBe(PROCEDURE_ETAT.MISE_EN_DEMEURE);
    expect(r.nbJoursDernEtape).toBe(10);
  });

  it('Escalade : mise en demeure → commandement → assignation → jugement', () => {
    const proc = {
      miseEnDemeureDate: '2026-01-05',
      commandementDate:  '2026-02-10',
      assignationDate:   '2026-04-15',
      jugementDate:      '2026-07-30'
    };
    expect(_procedureJudiciaireEtat(proc, '2026-08-15').etat).toBe(PROCEDURE_ETAT.JUGEMENT);
  });

  it('Clôture après jugement', () => {
    const proc = {
      miseEnDemeureDate: '2026-01-05',
      jugementDate:      '2026-07-30',
      clotureDate:       '2026-09-15'
    };
    expect(_procedureJudiciaireEtat(proc).etat).toBe(PROCEDURE_ETAT.CLOTUREE);
  });

  it('État = dernière étape franchie même si dates antérieures manquent', () => {
    // Cas exotique : seule l'assignation est renseignée
    const r = _procedureJudiciaireEtat({ assignationDate: '2026-04-15' }, '2026-05-01');
    expect(r.etat).toBe(PROCEDURE_ETAT.ASSIGNATION);
  });
});
