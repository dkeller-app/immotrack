/**
 * Tests pour QUITTANCES-ACTIVES v15.10 Sprint 11 V1.1.
 * Module js/core/quittances-actives.js — helpers purs statut + escalade + génération auto.
 *
 * CDC-QUITTANCES-IRL étape 1 : `_matchPaiementQuittance` et `_matcheMois` sont SUPPRIMÉS
 * (7ᵉ moteur d'imputation, C3) — leurs tests miroir partent avec eux. `_statutQuittance`
 * ne compte plus les mouvements : il reçoit `{ montantPaye }`, déjà imputé au mois par la
 * cascade unique (js/core/loyers-mois.js).
 */
import { describe, it, expect } from 'vitest';
import {
  _statutQuittance, _escaladeAlerte,
  _planQuittancesAGenerer, QUITTANCE_STATUS
} from '../../js/core/quittances-actives.js';

// ═══════════════════════════════════════════════════════════════════
//  _statutQuittance — 7 états
// ═══════════════════════════════════════════════════════════════════

describe('_statutQuittance — payée', () => {
  it('Montant imputé au mois ≥ attendu → payée', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50 };
    const r = _statutQuittance(q, { montantPaye: 650 }, '2026-01-10');
    expect(r.statut).toBe(QUITTANCE_STATUS.PAYEE);
    expect(r.montantPaye).toBe(650);
  });
  it('Surplus → payée (pas trop-perçu calculé ici)', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50 };
    expect(_statutQuittance(q, { montantPaye: 700 }, '2026-01-10').statut).toBe(QUITTANCE_STATUS.PAYEE);
  });
});

describe('_statutQuittance — partielle', () => {
  it('Imputé < montant attendu → partielle', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50 };
    expect(_statutQuittance(q, { montantPaye: 300 }, '2026-01-10').statut).toBe(QUITTANCE_STATUS.PARTIELLE);
  });
  it('Le cumul est fait par la cascade, pas ici', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50 };
    const r = _statutQuittance(q, { montantPaye: 500 }, '2026-01-20');
    expect(r.statut).toBe(QUITTANCE_STATUS.PARTIELLE);
    expect(r.montantPaye).toBe(500);
  });
});

describe('_statutQuittance — escalade impayés', () => {
  it('J+2 → attendue (avant J+5)', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50, dateEcheance: '2026-01-05' };
    expect(_statutQuittance(q, {}, '2026-01-07').statut).toBe(QUITTANCE_STATUS.ATTENDUE);
  });
  it('J+5 exactement → impayée_J5', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50, dateEcheance: '2026-01-05' };
    expect(_statutQuittance(q, {}, '2026-01-10').statut).toBe(QUITTANCE_STATUS.IMPAYEE_J5);
  });
  it('J+15 → impayée_J15', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50, dateEcheance: '2026-01-05' };
    expect(_statutQuittance(q, {}, '2026-01-20').statut).toBe(QUITTANCE_STATUS.IMPAYEE_J15);
  });
  it('J+30 → impayée_J30', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50, dateEcheance: '2026-01-05' };
    expect(_statutQuittance(q, {}, '2026-02-04').statut).toBe(QUITTANCE_STATUS.IMPAYEE_J30);
  });
  it('Mise en demeure envoyée → mise_en_demeure (état terminal)', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50, miseEnDemeureEnvoyee: true };
    expect(_statutQuittance(q, {}, '2026-02-15').statut).toBe(QUITTANCE_STATUS.MISE_EN_DEMEURE);
  });
});

describe('_statutQuittance — sans date d\'échéance explicite', () => {
  it('Mois français → date par défaut = 1er du mois', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50 };
    expect(_statutQuittance(q, {}, '2026-01-11').statut).toBe(QUITTANCE_STATUS.IMPAYEE_J5);
  });
  it('Format ISO YYYY-MM → idem', () => {
    const q = { mois: '2026-01', logement: 'F-001', hc: 600, ch: 50 };
    expect(_statutQuittance(q, {}, '2026-01-20').statut).toBe(QUITTANCE_STATUS.IMPAYEE_J15);
  });
});

describe('_statutQuittance — edge cases', () => {
  it('Quittance null → attendue', () => {
    expect(_statutQuittance(null, {}, '2026-01-10').statut).toBe(QUITTANCE_STATUS.ATTENDUE);
  });
  it('Contexte absent → 0 imputé, pas de crash', () => {
    const q = { mois: 'décembre 2026', logement: 'F-001', hc: 600, ch: 50 };
    expect(_statutQuittance(q, null, '2026-01-01').statut).toBe(QUITTANCE_STATUS.ATTENDUE);
  });
  it('Le module ne lit AUCUN mouvement : rien à filtrer ici (I6)', () => {
    const q = { mois: 'janvier 2026', logement: 'F-001', hc: 600, ch: 50 };
    // Passer une liste de mouvements ne produit aucun montant : la source est ctx.montantPaye.
    expect(_statutQuittance(q, [{ qui: 'F-001', cr: 650 }], '2026-01-15').montantPaye).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _escaladeAlerte
// ═══════════════════════════════════════════════════════════════════

describe('_escaladeAlerte', () => {
  it('Payée → info, pas d\'email', () => {
    const r = _escaladeAlerte(QUITTANCE_STATUS.PAYEE);
    expect(r.severity).toBe('info');
    expect(r.emailType).toBeNull();
  });
  it('Attendue → avis-echeance', () => {
    expect(_escaladeAlerte(QUITTANCE_STATUS.ATTENDUE).emailType).toBe('avis-echeance');
  });
  it('Impayée J+5 → rappel-impaye-1', () => {
    const r = _escaladeAlerte(QUITTANCE_STATUS.IMPAYEE_J5);
    expect(r.severity).toBe('warn');
    expect(r.emailType).toBe('rappel-impaye-1');
  });
  it('Impayée J+15 → rappel-impaye-2', () => {
    expect(_escaladeAlerte(QUITTANCE_STATUS.IMPAYEE_J15).emailType).toBe('rappel-impaye-2');
  });
  it('Impayée J+30 → rappel-impaye-3 (mise en demeure) — severity err', () => {
    const r = _escaladeAlerte(QUITTANCE_STATUS.IMPAYEE_J30);
    expect(r.severity).toBe('err');
    expect(r.emailType).toBe('rappel-impaye-3');
  });
  it('Mise en demeure envoyée → err, pas d\'autre email', () => {
    const r = _escaladeAlerte(QUITTANCE_STATUS.MISE_EN_DEMEURE);
    expect(r.severity).toBe('err');
    expect(r.emailType).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _planQuittancesAGenerer
// ═══════════════════════════════════════════════════════════════════

describe('_planQuittancesAGenerer', () => {
  const logements = [
    { ref: 'F-001', locataire: 'MARTIN', hc: 600, ch: 50, entity: 'SCI A' },
    { ref: 'F-002', locataire: 'DUPONT', hc: 800, ch: 80, entity: 'SCI A' },
    { ref: 'F-003', locataire: null, hc: 700 },  // vacant
    { ref: 'F-004', archived: true, locataire: 'OLD' },  // archivé
  ];
  const baux = {
    'F-001': { debut: '2025-01-01', fin: '2028-01-01', hc: 600, ch: 50, entity: 'SCI A' },
    'F-002': { debut: '2025-06-01', hc: 800, ch: 80, entity: 'SCI A' },
    'F-003': { debut: '2025-01-01', cloture: true },
  };

  it('Génère pour baux actifs sans quittance déjà existante', () => {
    const plan = _planQuittancesAGenerer(logements, baux, [], new Date('2026-01-15'));
    expect(plan.length).toBe(2);  // F-001 + F-002 (F-003 vacant + F-004 archivé)
    expect(plan[0].mois).toBe('janvier 2026');
  });

  it('Skip si quittance déjà existante', () => {
    const quittances = [{ logement: 'F-001', mois: 'janvier 2026' }];
    const plan = _planQuittancesAGenerer(logements, baux, quittances, new Date('2026-01-15'));
    expect(plan.length).toBe(1);
    expect(plan[0].ref).toBe('F-002');
  });

  it('Skip bail futur (debut > today)', () => {
    const bauxF = {
      'F-001': { debut: '2027-01-01', hc: 600, ch: 50 }
    };
    const plan = _planQuittancesAGenerer([logements[0]], bauxF, [], new Date('2026-01-15'));
    expect(plan.length).toBe(0);
  });

  it('Skip bail terminé (fin < today)', () => {
    const bauxF = {
      'F-001': { debut: '2024-01-01', fin: '2025-06-30', hc: 600, ch: 50 }
    };
    const plan = _planQuittancesAGenerer([logements[0]], bauxF, [], new Date('2026-01-15'));
    expect(plan.length).toBe(0);
  });

  it('Skip bail clôturé', () => {
    const plan = _planQuittancesAGenerer([logements[2]], baux, [], new Date('2026-01-15'));
    expect(plan.length).toBe(0);
  });

  it('Idempotent : 2e appel ne re-génère rien si quittances déjà créées', () => {
    const plan1 = _planQuittancesAGenerer(logements, baux, [], new Date('2026-01-15'));
    const quittances = plan1.map(p => ({ logement: p.ref, mois: p.mois }));
    const plan2 = _planQuittancesAGenerer(logements, baux, quittances, new Date('2026-01-15'));
    expect(plan2.length).toBe(0);
  });
});
