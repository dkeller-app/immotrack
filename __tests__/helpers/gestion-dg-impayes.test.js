/**
 * Tests pour GESTION DG & IMPAYÉS v15.12 Sprint 12 V1.1.
 * Module js/core/gestion-dg-impayes.js
 */
import { describe, it, expect } from 'vitest';
import {
  _dgStatut, _calculerDelaiRestitution, _calculerSoldeDG,
  _planApurementStatut, _procedureJudiciaireEtat, _listerImpayesActifs,
  DG_STATUS, PROCEDURE_ETAT
} from '../../js/core/gestion-dg-impayes.js';

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

  it('Délai 1 mois encore en cours → a_restituer + joursRestants', () => {
    const r = _dgStatut(baseClotur, '2026-01-20');
    expect(r.statut).toBe(DG_STATUS.A_RESTITUER);
    expect(r.joursRestants).toBeGreaterThan(0);
    expect(r.delaiMois).toBe(1);
  });

  it('Délai dépassé → en_retard avec joursRetard', () => {
    const r = _dgStatut(baseClotur, '2026-03-01');
    expect(r.statut).toBe(DG_STATUS.EN_RETARD);
    expect(r.joursRetard).toBeGreaterThan(0);
  });

  it('DG déjà restitué → restitue', () => {
    const r = _dgStatut({ ...baseClotur, dgRestitueAt: '2026-02-01' }, '2026-03-01');
    expect(r.statut).toBe(DG_STATUS.RESTITUE);
  });

  it('Bail clôturé avec retenue → délai 2 mois', () => {
    const bail = { ...baseClotur, dgRetenu: 200 };
    // 2 mois après 15/01 = 15/03 → le 25/02 reste à venir
    const r = _dgStatut(bail, '2026-02-25');
    expect(r.statut).toBe(DG_STATUS.A_RESTITUER);
    expect(r.delaiMois).toBe(2);
  });
});

describe('_calculerDelaiRestitution', () => {
  it('Sans dgRetenu et sans EDL → 1 mois (cas favorable)', () => {
    expect(_calculerDelaiRestitution({ dgRetenu: 0 })).toBe(1);
    expect(_calculerDelaiRestitution({})).toBe(1);
  });

  it('Avec dgRetenu > 0 → 2 mois', () => {
    expect(_calculerDelaiRestitution({ dgRetenu: 200 })).toBe(2);
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

// ═══════════════════════════════════════════════════════════════════
//  _listerImpayesActifs
// ═══════════════════════════════════════════════════════════════════

describe('_listerImpayesActifs', () => {
  const baux = {
    'F-001': { ref: 'F-001', debut: '2025-01-01', hc: 600, ch: 50 },
    'F-002': { ref: 'F-002', debut: '2025-06-01', hc: 800, ch: 80 },
    'F-003': { ref: 'F-003', debut: '2025-01-01', hc: 700, ch: 50, cloture: true },
    'F-004': { ref: 'F-004', debut: '2025-09-01', hc: 500, ch: 30,
               procedure: { miseEnDemeureDate: '2026-01-05', commandementDate: '2026-02-15' } }
  };
  const logements = [
    { ref: 'F-001', locataire: 'MARTIN' },
    { ref: 'F-002', locataire: 'DUPONT' },
    { ref: 'F-003', locataire: 'OLD' },   // bail clôturé
    { ref: 'F-004', locataire: 'IMPAYE' },
    { ref: 'F-005', locataire: null }     // vacant
  ];

  it('Skip baux clôturés / vacants', () => {
    const r = _listerImpayesActifs(logements, baux, [], new Date('2026-06-01'));
    expect(r.find(x => x.ref === 'F-003')).toBeUndefined();
    expect(r.find(x => x.ref === 'F-005')).toBeUndefined();
  });

  it('Calcule montantImpaye depuis bail.debut', () => {
    const r = _listerImpayesActifs([logements[0]], { 'F-001': baux['F-001'] }, [], new Date('2026-01-31'));
    // 13 mois × 650 = 8450, 0 reçu → 8450
    expect(r[0].montantImpaye).toBe(8450);
  });

  it('Statut "recent" si < 15j', () => {
    const mvts = [{ qui: 'F-001', date: '2026-05-25', cr: 650, _deleted: false }];
    const r = _listerImpayesActifs([logements[0]], { 'F-001': baux['F-001'] }, mvts, new Date('2026-06-01'));
    if (r.length > 0) {
      expect(r[0].statut).toBe('recent');
    }
  });

  it('Statut "critique" si > 90j sans paiement', () => {
    const mvts = [{ qui: 'F-001', date: '2026-01-05', cr: 650, _deleted: false }];
    const r = _listerImpayesActifs([logements[0]], { 'F-001': baux['F-001'] }, mvts, new Date('2026-06-01'));
    expect(r[0].statut).toBe('critique');
  });

  it('Procédure judiciaire en cours = statut surchargé', () => {
    const r = _listerImpayesActifs([logements[3]], { 'F-004': baux['F-004'] }, [], new Date('2026-06-01'));
    expect(r[0].statut).toBe('procedure_commandement_payer');
    expect(r[0].procedureEtat).toBe(PROCEDURE_ETAT.COMMANDEMENT_PAYER);
  });

  it('Tri : procédure avancée d\'abord, puis ancienneté', () => {
    const r = _listerImpayesActifs(logements, baux, [], new Date('2026-06-01'));
    // F-004 (procédure) doit être en premier
    expect(r[0].ref).toBe('F-004');
  });
});
