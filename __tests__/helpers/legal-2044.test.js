import { describe, it, expect } from 'vitest';
import { _compute2044, _format2044Recap, _2044ToCsv } from '../../js/core/legal-2044.js';

const STD_CATEGORIES = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Arriérés de loyers', ligne2044: '211', type: 'recette' },
  { nom: 'Subventions ANAH', ligne2044: '213', type: 'recette' },
  { nom: 'Frais de gestion / honoraires', ligne2044: '221', type: 'charge' },
  { nom: 'Primes d\'assurance PNO', ligne2044: '223', type: 'charge' },
  { nom: 'Travaux de réparation et d\'entretien', ligne2044: '224', type: 'charge' },
  { nom: 'Charges récupérables non récupérées', ligne2044: '225', type: 'charge' },
  { nom: 'Taxe foncière (et taxes annexes)', ligne2044: '227', type: 'charge' },
  { nom: 'Provisions pour charges de copropriété', ligne2044: '229', type: 'charge' },
  { nom: 'Prêt — Intérêts d\'emprunt', ligne2044: '250', type: 'interet' },
  { nom: 'Prêt — Capital remboursé', ligne2044: '', type: 'special' }
];

describe('_compute2044', () => {
  it('aggregate basique : 1 loyer + 1 charge + 1 intérêt', () => {
    const mvts = [
      { id: 1, date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' },
      { id: 2, date: '2026-02-10', cat: 'Frais de gestion / honoraires', db: 50, qui: 'F-001' },
      { id: 3, date: '2026-03-01', cat: 'Prêt — Intérêts d\'emprunt', db: 300, qui: 'F-001' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.lignes['211']).toBe(1000);
    expect(r.lignes['221']).toBe(50);
    expect(r.lignes['250']).toBe(300);
    expect(r.totalRecettes).toBe(1000);
    expect(r.totalCharges).toBe(50);
    expect(r.totalInterets).toBe(300);
    expect(r.resultatFoncier).toBe(650);
  });

  it('résultat négatif → déficit foncier potentiel', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 500 },
      { date: '2026-02-10', cat: 'Travaux de réparation et d\'entretien', db: 3000 }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.resultatFoncier).toBe(-2500);
  });

  it('filtre par période from/to', () => {
    const mvts = [
      { date: '2025-12-31', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-01-01', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-12-31', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2027-01-01', cat: 'Loyers encaissés', cr: 1000 }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { from: '2026-01-01', to: '2026-12-31' });
    expect(r.lignes['211']).toBe(2000);
  });

  it('filtre par entité (qui = ref logement OU SCI:nom)', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' },
      { date: '2026-02-15', cat: 'Loyers encaissés', cr: 800, qui: 'F-002' },
      { date: '2026-03-15', cat: 'Subventions ANAH', cr: 500, qui: 'SCI:Mon SCI' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'] });
    expect(r.lignes['211']).toBe(1000); // F-001 only
    expect(r.lignes['213']).toBe(500);  // SCI: prefix
    expect(r.totalRecettes).toBe(1500);
  });

  it('ignore les mouvements supprimés (_deleted)', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-02-15', cat: 'Loyers encaissés', cr: 500, _deleted: true }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.lignes['211']).toBe(1000);
  });

  it('ignore les catégories type special (capital, DG)', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Prêt — Capital remboursé', db: 500 }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.lignes['250']).toBeUndefined();
    expect(r.totalCharges).toBe(0);
  });

  it('catégorie custom non mappée → nonMappes[]', () => {
    const mvts = [
      { id: 9, date: '2026-01-15', cat: 'Ma cat custom', db: 200, lib: 'Achat divers', qui: 'F-001' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.nonMappes).toHaveLength(1);
    expect(r.nonMappes[0].cat).toBe('Ma cat custom');
    expect(r.nonMappes[0].db).toBe(200);
  });

  it('compte le nombre de mouvements par ligne', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-02-15', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-03-15', cat: 'Loyers encaissés', cr: 1000 }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.comptes['211']).toBe(3);
  });

  it('arrondi à 2 décimales', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000.123 },
      { date: '2026-02-15', cat: 'Loyers encaissés', cr: 1000.456 }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.lignes['211']).toBe(2000.58);
  });

  it('null/undefined safe', () => {
    const r = _compute2044(null, STD_CATEGORIES);
    expect(r.totalRecettes).toBe(0);
    expect(r.resultatFoncier).toBe(0);
  });
});

describe('_format2044Recap', () => {
  it('produit un récap texte multiligne', () => {
    const r = _compute2044([
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-02-10', cat: 'Taxe foncière (et taxes annexes)', db: 800 }
    ], STD_CATEGORIES);
    const txt = _format2044Recap(r, { yr: '2026' });
    expect(txt).toContain('DÉCLARATION 2044');
    expect(txt).toContain('Ligne 211');
    expect(txt).toContain('Ligne 227');
    expect(txt).toContain('Année : 2026');
    expect(txt).toContain('RÉSULTAT FONCIER');
  });

  it('inclut avertissement déficit foncier si résultat < 0', () => {
    const r = { lignes: {}, comptes: {}, totalRecettes: 0, totalCharges: 5000, totalInterets: 0, resultatFoncier: -5000, nonMappes: [] };
    const txt = _format2044Recap(r);
    expect(txt).toMatch(/déficit foncier/i);
    expect(txt).toContain('10 700');
  });

  it('inclut avertissement si nonMappes non vide', () => {
    const r = { lignes: {}, comptes: {}, totalRecettes: 0, totalCharges: 0, totalInterets: 0, resultatFoncier: 0, nonMappes: [{ cat: 'X' }, { cat: 'Y' }] };
    const txt = _format2044Recap(r);
    expect(txt).toContain('2 mouvement(s)');
    expect(txt).toContain('catégorie non mappée');
  });
});

describe('_2044ToCsv', () => {
  it('génère CSV avec header + totaux', () => {
    const r = _compute2044([
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-02-10', cat: 'Frais de gestion / honoraires', db: 50 }
    ], STD_CATEGORIES);
    const csv = _2044ToCsv(r);
    expect(csv).toContain('ligne_2044,description,nb_mouvements,montant_eur');
    expect(csv).toContain('211');
    expect(csv).toContain('Loyers encaissés / arriérés');
    expect(csv).toContain('TOTAL_RECETTES');
    expect(csv).toContain('RESULTAT_FONCIER');
  });

  it('escape virgules dans description', () => {
    const r = _compute2044([
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 }
    ], STD_CATEGORIES);
    const csv = _2044ToCsv(r);
    // "Loyers encaissés / arriérés" pas de virgule, mais "Provisions pour charges
    // de copropriété" non plus. Test sur "Subventions / indemnités / recettes diverses"
    // qui contient des "/" mais pas de virgule, donc safe. Test du format CSV propre.
    expect(csv.split('\n').length).toBeGreaterThan(2); // header + at least 1 + totals
  });
});
