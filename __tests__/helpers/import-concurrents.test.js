import { describe, it, expect } from 'vitest';
import { _mapRentila, _mapBailFacile, _mergeImport } from '../../js/core/import-concurrents.js';

describe('_mapRentila', () => {
  it('mappe biens → logements', () => {
    const raw = {
      biens: [{ id: 1, reference: 'F-001', adresse: '1 rue Test', surface: 50, type: 'T2', loyer_hc: 800, charges: 50 }]
    };
    const r = _mapRentila(raw);
    expect(r.out.logements).toHaveLength(1);
    expect(r.out.logements[0].ref).toBe('F-001');
    expect(r.out.logements[0].hc).toBe(800);
    expect(r.out.logements[0].surf).toBe(50);
    expect(r.summary.logements).toBe(1);
  });

  it('mappe baux + locataires', () => {
    const raw = {
      biens: [{ id: 1, reference: 'F-001' }],
      locataires: [{ id: 11, bien_id: 1, prenom: 'Jean', nom: 'MARTIN', email: 'j@m.fr', telephone: '06...' }],
      baux: [{ id: 21, bien_id: 1, date_debut: '2025-01-01', date_fin: '2027-01-01', loyer: 800, charges: 50, depot_garantie: 1600 }]
    };
    const r = _mapRentila(raw);
    expect(r.out.baux['F-001']).toBeDefined();
    expect(r.out.baux['F-001'].dg).toBe(1600);
    expect(r.out.baux['F-001'].locataires).toHaveLength(1);
    expect(r.out.baux['F-001'].locataires[0].nom).toBe('Jean MARTIN');
  });

  it('mappe paiements → mouvements catégorie Loyers encaissés', () => {
    const raw = {
      biens: [{ id: 1, reference: 'F-001' }],
      baux: [{ id: 21, bien_id: 1 }],
      paiements: [{ id: 31, bail_id: 21, date: '2025-01-15', montant: 800, type: 'virement' }]
    };
    const r = _mapRentila(raw);
    expect(r.out.mouvements).toHaveLength(1);
    expect(r.out.mouvements[0].cat).toBe('Loyers encaissés');
    expect(r.out.mouvements[0].cr).toBe(800);
    expect(r.out.mouvements[0].qui).toBe('F-001');
  });

  it('erreur si bien sans référence', () => {
    const raw = { biens: [{ id: 1, surface: 50 }] };
    const r = _mapRentila(raw);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toMatch(/référence manquante/);
  });

  it('erreur si bail sans bien existant', () => {
    const raw = { biens: [], baux: [{ id: 1, bien_id: 999 }] };
    const r = _mapRentila(raw);
    expect(r.errors.some(e => e.includes('non trouvé'))).toBe(true);
  });

  it('null safe', () => {
    expect(_mapRentila(null).errors.length).toBeGreaterThan(0);
    expect(_mapRentila(null).summary.logements).toBe(0);
  });

  it('entityNom personnalisable', () => {
    const r = _mapRentila({ biens: [{ id: 1, reference: 'A' }] }, { entityNom: 'Mon SCI' });
    expect(r.out.logements[0].entity).toBe('Mon SCI');
  });
});

describe('_mapBailFacile', () => {
  it('mappe sheet Logements', () => {
    const wb = {
      Logements: [
        { Ref: 'F-001', Adresse: '1 rue', Surface: 50, Type: 'T2', 'Loyer HC': 800, Charges: 50, DG: 1600 }
      ]
    };
    const r = _mapBailFacile(wb);
    expect(r.out.logements).toHaveLength(1);
    expect(r.out.logements[0].hc).toBe(800);
    expect(r.out.logements[0].dg).toBe(1600);
  });

  it('mappe sheet Baux', () => {
    const wb = {
      Baux: [
        { 'Ref Logement': 'F-001', Locataire: 'MARTIN', Email: 'm@m.fr', 'Date début': '2025-01-01', Loyer: 800 }
      ]
    };
    const r = _mapBailFacile(wb);
    expect(r.out.baux['F-001']).toBeDefined();
    expect(r.out.baux['F-001'].locataires[0].nom).toBe('MARTIN');
  });

  it('mappe sheet Paiements', () => {
    const wb = {
      Paiements: [{ 'Ref Logement': 'F-001', Date: '2025-01-15', Montant: 800, Type: 'CB' }]
    };
    const r = _mapBailFacile(wb);
    expect(r.out.mouvements).toHaveLength(1);
    expect(r.out.mouvements[0].cat).toBe('Loyers encaissés');
  });

  it('tolère noms d\'onglets variants (lowercase)', () => {
    const wb = { logements: [{ Ref: 'F-001' }] };
    const r = _mapBailFacile(wb);
    expect(r.out.logements).toHaveLength(1);
  });

  it('null safe', () => {
    expect(_mapBailFacile(null).errors.length).toBeGreaterThan(0);
    expect(_mapBailFacile({}).summary.logements).toBe(0);
  });
});

describe('_mergeImport', () => {
  function mkDB() {
    return {
      logements: [{ id: 1, ref: 'F-EXIST' }],
      baux: { 'F-EXIST': { ref: 'F-EXIST', hc: 800 } },
      mouvements: [{ date: '2025-01-15', qui: 'F-EXIST', cr: 800, db: 0 }]
    };
  }

  it('ajoute les nouveaux logements', () => {
    const db = mkDB();
    const imported = { logements: [{ id: 99, ref: 'F-NEW' }] };
    const r = _mergeImport(db, imported);
    expect(r.added.logements).toBe(1);
    expect(db.logements).toHaveLength(2);
  });

  it('skip logement avec ref existante', () => {
    const db = mkDB();
    const imported = { logements: [{ id: 99, ref: 'F-EXIST' }] };
    const r = _mergeImport(db, imported);
    expect(r.added.logements).toBe(0);
    expect(r.skipped.logements).toBe(1);
  });

  it('skip bail avec ref existante', () => {
    const db = mkDB();
    const imported = { baux: { 'F-EXIST': { ref: 'F-EXIST', hc: 999 } } };
    const r = _mergeImport(db, imported);
    expect(r.added.baux).toBe(0);
    expect(r.skipped.baux).toBe(1);
    expect(db.baux['F-EXIST'].hc).toBe(800); // pas écrasé
  });

  it('dédup mouvements par signature (date+qui+cr+db)', () => {
    const db = mkDB();
    const imported = { mouvements: [
      { date: '2025-01-15', qui: 'F-EXIST', cr: 800, db: 0 }, // duplicate
      { date: '2025-02-15', qui: 'F-EXIST', cr: 800, db: 0 }  // new
    ]};
    const r = _mergeImport(db, imported);
    expect(r.added.mouvements).toBe(1);
    expect(r.skipped.mouvements).toBe(1);
  });

  it('null safe', () => {
    expect(_mergeImport(null, {}).added.logements).toBe(0);
    expect(_mergeImport({}, null).added.logements).toBe(0);
  });

  it('initialise collections manquantes', () => {
    const db = {};
    _mergeImport(db, { logements: [{ ref: 'X' }] });
    expect(db.logements).toBeDefined();
    expect(db.baux).toBeDefined();
    expect(db.mouvements).toBeDefined();
  });
});
