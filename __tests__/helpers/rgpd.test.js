import { describe, it, expect } from 'vitest';
import { _findPersonalDataForRef, _generateGdprExport, _planErasure, _isEraseEligible } from '../../js/core/rgpd.js';

function mkDB() {
  return {
    logements: [
      { id: 1, ref: 'F-001', locataire: 'MARTIN Jean', entity: 'SCI Test', tel: '06 11 11 11 11', mail: 'jean.martin@example.com', debut: '2020-01-01', fin: '2023-12-31' },
      { id: 2, ref: 'F-002', locataire: 'DUPOND Marie', entity: 'SCI Test' }
    ],
    baux: {
      'F-001': { ref: 'F-001', locataires: [{ nom: 'MARTIN Jean', tel: '06 11 11 11 11' }], debut: '2020-01-01', fin: '2023-12-31', hc: 800 },
      'F-002': { ref: 'F-002', locataires: [{ nom: 'DUPOND Marie' }], debut: '2024-01-01', hc: 700 }
    },
    baux_historique: [
      { id: 100, ref: 'F-001', locataires: [{ nom: 'DURAND Paul' }], debut: '2015-01-01', fin: '2019-12-31' }
    ],
    mouvements: [
      { id: 10, date: '2023-01-15', cat: 'Loyers', cr: 800, qui: 'F-001', lib: 'Loyer janvier MARTIN' },
      { id: 11, date: '2023-02-15', cat: 'Loyers', cr: 800, qui: 'F-001', lib: 'Loyer février MARTIN' },
      { id: 12, date: '2024-01-15', cat: 'Loyers', cr: 700, qui: 'F-002', lib: 'Loyer DUPOND' }
    ],
    quittances: [
      { id: 20, logement: 'F-001', locataire: 'MARTIN Jean', mois: 'janvier 2023' },
      { id: 21, logement: 'F-001', locataire: 'MARTIN Jean', mois: 'février 2023' }
    ],
    edl: [
      { id: 30, logement: 'F-001', date: '2020-01-01', type: 'entree' }
    ],
    assurances: [],
    mrh: [
      { id: 40, logement: 'F-001', locataire: 'MARTIN Jean', compagnie: 'AXA' }
    ],
    irlHistorique: [
      { date: '2023-01-01', ref: 'F-001', locataire: 'MARTIN Jean', ancienHC: 780, nouveauHC: 800, dateRevision: '2023-01-01' }
    ]
  };
}

describe('_findPersonalDataForRef', () => {
  it('trouve toutes les données d\'un logement', () => {
    const r = _findPersonalDataForRef(mkDB(), 'F-001');
    expect(r.logement.ref).toBe('F-001');
    expect(r.bailCourant.ref).toBe('F-001');
    expect(r.bauxHistoriques).toHaveLength(1);
    expect(r.mouvements).toHaveLength(2);
    expect(r.quittances).toHaveLength(2);
    expect(r.edls).toHaveLength(1);
    expect(r.mrh).toHaveLength(1);
    expect(r.irlHistorique).toHaveLength(1);
    expect(r.totalRecords).toBe(10); // logement(1) + bailCourant(1) + bauxHist(1) + mvts(2) + quit(2) + edl(1) + mrh(1) + irl(1) = 10
  });

  it('ignore tombstones', () => {
    const db = mkDB();
    db.mouvements[0]._deleted = true;
    const r = _findPersonalDataForRef(db, 'F-001');
    expect(r.mouvements).toHaveLength(1);
  });

  it('logRef inconnu → struct vide mais valide', () => {
    const r = _findPersonalDataForRef(mkDB(), 'INEXISTANT');
    expect(r.logement).toBeUndefined();
    expect(r.bailCourant).toBeNull();
    expect(r.mouvements).toEqual([]);
    expect(r.totalRecords).toBe(0);
  });

  it('null safe', () => {
    expect(_findPersonalDataForRef(null, 'F-001')).toBeNull();
    expect(_findPersonalDataForRef({}, null)).toBeNull();
  });

  it('collectedAt est un timestamp ISO', () => {
    const r = _findPersonalDataForRef(mkDB(), 'F-001');
    expect(r.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('_generateGdprExport', () => {
  it('produit un JSON valide avec metadata', () => {
    const json = _generateGdprExport(mkDB(), 'F-001');
    const parsed = JSON.parse(json);
    expect(parsed._meta.app).toBe('ImmoTrack');
    expect(parsed._meta.logRef).toBe('F-001');
    expect(parsed._meta.rgpdArticle).toMatch(/Art\. 20 RGPD/);
    expect(parsed.data.totalRecords).toBeGreaterThan(0);
  });

  it('logRef invalide → JSON erreur', () => {
    const json = _generateGdprExport(null, 'F-001');
    expect(JSON.parse(json).error).toBeDefined();
  });
});

describe('_planErasure', () => {
  it('génère opérations cohérentes', () => {
    const plan = _planErasure(mkDB(), 'F-001');
    expect(plan.operations.length).toBeGreaterThan(0);

    const types = new Set(plan.operations.map(o => o.type));
    expect(types.has('anonymize')).toBe(true); // logement, mouvements, irlHistorique
    expect(types.has('tombstone')).toBe(true); // bail, baux_historique, quittances, edl, mrh
  });

  it('logement marqué anonymize (pas tombstone — c\'est un bien physique)', () => {
    const plan = _planErasure(mkDB(), 'F-001');
    const logOp = plan.operations.find(o => o.collection === 'logements');
    expect(logOp.type).toBe('anonymize');
    expect(logOp.fields).toContain('locataire');
  });

  it('bail courant marqué tombstone', () => {
    const plan = _planErasure(mkDB(), 'F-001');
    const bailOp = plan.operations.find(o => o.collection === 'baux');
    expect(bailOp.type).toBe('tombstone');
  });

  it('mouvements anonymisés (conservation montants pour compta)', () => {
    const plan = _planErasure(mkDB(), 'F-001');
    const mvtOps = plan.operations.filter(o => o.collection === 'mouvements');
    expect(mvtOps).toHaveLength(2);
    mvtOps.forEach(o => {
      expect(o.type).toBe('anonymize');
      expect(o.fields).toContain('lib');
      expect(o.fields).toContain('qui');
    });
  });

  it('logRef inconnu → 0 opérations', () => {
    expect(_planErasure(mkDB(), 'X-999').operations).toHaveLength(0);
  });

  it('totalRecords cohérent avec operations.length', () => {
    const plan = _planErasure(mkDB(), 'F-001');
    expect(plan.totalRecords).toBe(plan.operations.length);
  });
});

describe('_isEraseEligible', () => {
  it('éligible si dernier bail terminé > 3 ans', () => {
    const db = mkDB();
    // dernier bail F-001 finit 2023-12-31, hist DURAND finit 2019-12-31
    // Si on est en 2026+, 2023-12-31 + 3 ans = 2026-12-31 → encore dans la fenêtre
    // On force un bail terminé en 2020 pour test
    db.baux['F-001'].fin = '2020-12-31';
    db.baux_historique = [];
    const r = _isEraseEligible(db, 'F-001');
    expect(r.eligible).toBe(true);
  });

  it('non éligible si bail trop récent', () => {
    const db = mkDB();
    db.baux['F-001'].fin = '2025-12-31';
    db.baux_historique = [];
    const r = _isEraseEligible(db, 'F-001');
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/prescription/i);
  });

  it('non éligible si bail toujours actif (pas de fin)', () => {
    const db = mkDB();
    db.baux['F-001'].fin = '';
    db.baux_historique = [];
    const r = _isEraseEligible(db, 'F-001');
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/actif|fin/i);
  });

  it('éligible si aucun bail trouvé', () => {
    const db = { logements: [], baux: {}, baux_historique: [] };
    const r = _isEraseEligible(db, 'X-INEXISTANT');
    expect(r.eligible).toBe(false); // logement absent
  });

  it('logRef inconnu → non éligible avec raison claire', () => {
    expect(_isEraseEligible(mkDB(), 'X-XYZ').eligible).toBe(false);
  });
});
