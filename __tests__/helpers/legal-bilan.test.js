import { describe, it, expect } from 'vitest';
import { _computeBilanAnnuel, _formatBilanTexte } from '../../js/core/legal-bilan.js';

const STD_CATS = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Travaux de réparation et d\'entretien', ligne2044: '224', type: 'charge' },
  { nom: 'Prêt — Intérêts d\'emprunt', ligne2044: '250', type: 'interet' },
  { nom: 'Taxe foncière (et taxes annexes)', ligne2044: '227', type: 'charge' }
];

function mkDB() {
  return {
    entites: [{ id: 1, nom: 'SCI Test', type: 'SCI IS', siren: '123456789' }],
    logements: [
      { id: 11, ref: 'F-001', entity: 'SCI Test', type: 'T2', imm: 'Beta', locataire: 'MARTIN', debut: '2025-01-01', fin: '2025-12-31', hc: 800 },
      { id: 12, ref: 'F-002', entity: 'SCI Test', type: 'T3', imm: 'Beta', locataire: 'DUPOND', debut: '2025-03-01', hc: 1000 }
    ],
    baux: {
      'F-001': { ref: 'F-001', entity: 'SCI Test', debut: '2025-01-01', fin: '2025-12-31', hc: 800 },
      'F-002': { ref: 'F-002', entity: 'SCI Test', debut: '2025-03-01', hc: 1000 }
    },
    baux_historique: [],
    mouvements: [
      { id: 1, date: '2025-01-15', cat: 'Loyers encaissés', cr: 800, qui: 'F-001' },
      { id: 2, date: '2025-02-15', cat: 'Loyers encaissés', cr: 800, qui: 'F-001' },
      { id: 3, date: '2025-03-15', cat: 'Loyers encaissés', cr: 1000, qui: 'F-002' },
      { id: 4, date: '2025-04-15', cat: 'Loyers encaissés', cr: 1000, qui: 'F-002' },
      { id: 5, date: '2025-06-15', cat: 'Travaux de réparation et d\'entretien', db: 500, qui: 'F-001' },
      { id: 6, date: '2025-09-15', cat: 'Prêt — Intérêts d\'emprunt', db: 200, qui: 'SCI:SCI Test' },
      { id: 7, date: '2024-12-31', cat: 'Loyers encaissés', cr: 999, qui: 'F-001' } // hors période
    ]
  };
}

describe('_computeBilanAnnuel', () => {
  it('agrège revenus + charges + intérêts', () => {
    const b = _computeBilanAnnuel(mkDB(), STD_CATS, 'SCI Test', 2025);
    expect(b.kpis.totalRevenus).toBe(3600); // 800+800+1000+1000
    expect(b.kpis.totalCharges).toBe(500);
    expect(b.kpis.totalInterets).toBe(200);
    expect(b.kpis.cashFlow).toBe(3100);
    expect(b.kpis.resultatFoncier).toBe(2900);
  });

  it('filtre par période (hors 2025 exclu)', () => {
    const b = _computeBilanAnnuel(mkDB(), STD_CATS, 'SCI Test', 2025);
    // Le mvt du 2024-12-31 NE doit PAS être compté
    expect(b.kpis.totalRevenus).not.toBe(4599);
  });

  it('compte logements et taux occupation', () => {
    const b = _computeBilanAnnuel(mkDB(), STD_CATS, 'SCI Test', 2025);
    expect(b.kpis.nbLogements).toBe(2);
    // F-001 occupé toute l'année 2025 (365j)
    // F-002 occupé du 2025-03-01 au 2025-12-31 (306j)
    expect(b.kpis.tauxOccupationGlobal).toBeGreaterThan(80);
    expect(b.kpis.tauxOccupationGlobal).toBeLessThanOrEqual(100);
  });

  it('détail par logement', () => {
    const b = _computeBilanAnnuel(mkDB(), STD_CATS, 'SCI Test', 2025);
    expect(b.parLogement).toHaveLength(2);
    const f1 = b.parLogement.find(l => l.ref === 'F-001');
    expect(f1.revenus).toBe(1600);
    expect(f1.charges).toBe(500);
    expect(f1.cashFlow).toBe(1100);
    expect(f1.locataire).toBe('MARTIN');
    expect(f1.tauxOccupation).toBeCloseTo(100, 1); // toute l'année
  });

  it('manque à gagner sur logement vacant partiel', () => {
    const db = mkDB();
    db.logements[1].debut = '2025-07-01'; // F-002 démarre en juillet
    db.baux['F-002'].debut = '2025-07-01';
    const b = _computeBilanAnnuel(db, STD_CATS, 'SCI Test', 2025);
    const f2 = b.parLogement.find(l => l.ref === 'F-002');
    expect(f2.vacanceDays).toBeGreaterThan(170); // ~181 jours vacance jan-juin
    expect(f2.manqueAGagner).toBeGreaterThan(5000); // ~6 mois × 1000€
  });

  it('entité inconnue → null', () => {
    expect(_computeBilanAnnuel(mkDB(), STD_CATS, 'Inconnu', 2025)).toBeNull();
  });

  it('null safe', () => {
    expect(_computeBilanAnnuel(null, STD_CATS, 'SCI Test', 2025)).toBeNull();
    expect(_computeBilanAnnuel(mkDB(), STD_CATS, null, 2025)).toBeNull();
    expect(_computeBilanAnnuel(mkDB(), STD_CATS, 'SCI Test', null)).toBeNull();
  });

  it('inclut info entité dans le résultat', () => {
    const b = _computeBilanAnnuel(mkDB(), STD_CATS, 'SCI Test', 2025);
    expect(b.entity.nom).toBe('SCI Test');
    expect(b.entity.siren).toBe('123456789');
    expect(b.entity.type).toBe('SCI IS');
  });
});

describe('_formatBilanTexte', () => {
  it('produit un texte multiligne', () => {
    const b = _computeBilanAnnuel(mkDB(), STD_CATS, 'SCI Test', 2025);
    const txt = _formatBilanTexte(b);
    expect(txt).toContain('BILAN ANNUEL');
    expect(txt).toContain('SCI Test');
    expect(txt).toContain('2025');
    expect(txt).toContain('Revenus totaux');
    expect(txt).toContain('Cash-flow');
    expect(txt).toContain('DÉTAIL PAR LOGEMENT');
    expect(txt).toContain('F-001');
    expect(txt).toContain('F-002');
  });

  it('null safe', () => {
    expect(_formatBilanTexte(null)).toMatch(/introuvable/i);
  });
});
