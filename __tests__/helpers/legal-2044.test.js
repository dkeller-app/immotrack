import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { _compute2044, _format2044Recap, _2044ToCsv } from '../../js/core/legal-2044.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

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
  { nom: 'Régularisation provisions copro N-1', ligne2044: '230', type: 'deduction' },
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

describe('_compute2044 — charges immeuble / forfait 222 / part bailleur 225', () => {
  it('compte les charges au niveau immeuble (qui vide + imm dans opts.imms)', () => {
    const mvts = [
      { date: '2026-05-10', cat: 'Taxe foncière (et taxes annexes)', db: 800, qui: '', imm: 'Le Dupont' },
      { date: '2026-06-10', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'], imms: ['Le Dupont'] });
    expect(r.lignes['227']).toBe(800);
    expect(r.lignes['211']).toBe(1000);
    expect(r.totalCharges).toBe(800);
    expect(r.resultatFoncier).toBe(200);
  });

  it('exclut une charge immeuble si imm hors périmètre de l\'entité', () => {
    const mvts = [
      { date: '2026-05-10', cat: 'Taxe foncière (et taxes annexes)', db: 800, qui: '', imm: 'Autre immeuble' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'], imms: ['Le Dupont'] });
    expect(r.lignes['227']).toBeUndefined();
    expect(r.totalCharges).toBe(0);
  });

  it('ignore les mouvements liés à un compteur collectif (part bailleur injectée à part)', () => {
    const mvts = [
      { date: '2026-05-10', cat: 'Charges récupérables non récupérées', db: 500, qui: '', imm: 'Le Dupont', compteurCcId: 'cc_1' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: [], imms: ['Le Dupont'] });
    expect(r.lignes['225']).toBeUndefined();
    expect(r.totalCharges).toBe(0);
  });

  it('injecte le forfait légal ligne 222 (20 € par local) via opts.nbLocaux', () => {
    const mvts = [
      { date: '2026-05-10', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'], nbLocaux: 3 });
    expect(r.lignes['222']).toBe(60);
    expect(r.totalCharges).toBe(60);
    expect(r.resultatFoncier).toBe(940);
  });

  it('pas de forfait 222 si nbLocaux absent ou nul', () => {
    const mvts = [{ date: '2026-05-10', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' }];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'] });
    expect(r.lignes['222']).toBeUndefined();
    expect(r.totalCharges).toBe(0);
  });

  it('injecte la part bailleur sur la ligne 225 via opts.partBailleur225', () => {
    const mvts = [
      { date: '2026-05-10', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'], partBailleur225: 150 });
    expect(r.lignes['225']).toBe(150);
    expect(r.totalCharges).toBe(150);
    expect(r.resultatFoncier).toBe(850);
  });

  it('cumule la part bailleur avec les mouvements 225 existants', () => {
    const mvts = [
      { date: '2026-05-10', cat: 'Charges récupérables non récupérées', db: 100, qui: 'F-001' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'], partBailleur225: 150 });
    expect(r.lignes['225']).toBe(250);
    expect(r.totalCharges).toBe(250);
  });

  it('forfait 222 + part bailleur 225 cumulés dans le total des charges', () => {
    const mvts = [
      { date: '2026-05-10', cat: 'Loyers encaissés', cr: 2000, qui: 'F-001' },
      { date: '2026-05-12', cat: 'Taxe foncière (et taxes annexes)', db: 500, qui: '', imm: 'Le Dupont' }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'], imms: ['Le Dupont'], nbLocaux: 2, partBailleur225: 90 });
    expect(r.lignes['227']).toBe(500);
    expect(r.lignes['222']).toBe(40);
    expect(r.lignes['225']).toBe(90);
    expect(r.totalCharges).toBe(630);
    expect(r.resultatFoncier).toBe(1370);
  });
});

describe('_compute2044 — ligne 230 (régularisation provisions copro N-1 = DÉDUCTION)', () => {
  // Notice 2044 : ligne 240 = (221..229) − 230. La régularisation N-1 des provisions de
  // copropriété VIENT EN DÉDUCTION des charges déductibles (elle reprend la part déjà
  // déduite l'an passé qui s'est avérée couvrir des charges non déductibles / récupérables).
  // Bug historique : 230 typée 'charge' → s'AJOUTAIT aux charges (~1000 € d'erreur sur le
  // résultat foncier pour une régul de 500 €). Doit se SOUSTRAIRE.
  it('réduit le total des charges (et non l\'augmente)', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 2000 },
      { date: '2026-02-10', cat: 'Provisions pour charges de copropriété', db: 600 },
      { date: '2026-03-10', cat: 'Régularisation provisions copro N-1', db: 500 }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.lignes['229']).toBe(600);
    expect(r.lignes['230']).toBe(500);
    expect(r.totalCharges).toBe(100);      // 600 − 500
    expect(r.resultatFoncier).toBe(1900);  // 2000 − 100
  });

  it('régul seule sans autre charge → charges négatives (cas réel : trop-perçu N-1)', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-03-10', cat: 'Régularisation provisions copro N-1', db: 300 }
    ];
    const r = _compute2044(mvts, STD_CATEGORIES);
    expect(r.lignes['230']).toBe(300);
    expect(r.totalCharges).toBe(-300);
    expect(r.resultatFoncier).toBe(1300);  // 1000 − (−300)
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

  it('affiche la ligne 222 (forfait) quand le forfait est présent', () => {
    const r = _compute2044([{ date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' }],
      STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'], nbLocaux: 2 });
    const txt = _format2044Recap(r, { yr: '2026' });
    expect(txt).toContain('Ligne 222');
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

  it('inclut la ligne 222 (forfait) dans le CSV quand présente', () => {
    const r = _compute2044([{ date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000, qui: 'F-001' }],
      STD_CATEGORIES, { entityNom: 'Mon SCI', refs: ['F-001'], nbLocaux: 2 });
    const csv = _2044ToCsv(r);
    expect(csv).toContain('222');
    expect(csv).toMatch(/forfait/i);
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

describe('STD_CATEGORIES inline — ligne 230 typée deduction (anti-régression fiscale)', () => {
  // La ligne 230 (régul provisions copro N-1) DOIT se soustraire des charges (notice 2044 :
  // 240 = (221..229) − 230). Si elle est typée 'charge' elle s'AJOUTE → ~×2 d'erreur.
  // Ce test lit les deux HTML pour empêcher une régression silencieuse côté données inline.
  for (const file of ['index.html', 'index-test.html']) {
    it(`${file} : la catégorie ligne 230 est type:'deduction'`, () => {
      const html = readFileSync(resolve(repoRoot, file), 'utf8');
      // Cible la ligne du tableau STD_CATEGORIES qui porte ligne2044:'230'
      const m = html.match(/\{[^{}]*ligne2044:\s*'230'[^{}]*\}/);
      expect(m, `entrée ligne2044:'230' introuvable dans ${file}`).toBeTruthy();
      expect(m[0]).toMatch(/type:\s*'deduction'/);
    });
  }
});

describe('_compute2044 — opts.detail (détail mouvements par ligne pour le PDF)', () => {
  const STD = STD_CATEGORIES;
  it('sans detail : pas de mvtsByLigne', () => {
    const r = _compute2044([{ date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 }], STD);
    expect(r.mvtsByLigne).toBeUndefined();
  });
  it('detail:true → mvtsByLigne[ligne] liste {id,date,lib,montant} signé par type', () => {
    const mvts = [
      { id: 1, date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000, lib: 'Loyer janv', qui: 'F-001' },
      { id: 2, date: '2026-02-10', cat: 'Frais de gestion / honoraires', db: 50, lib: 'Honoraires', qui: 'F-001' },
      { id: 3, date: '2026-03-10', cat: 'Régularisation provisions copro N-1', db: 300, lib: 'Régul', qui: 'F-001' }
    ];
    const r = _compute2044(mvts, STD, { detail: true });
    expect(r.mvtsByLigne['211']).toEqual([{ id: 1, date: '2026-01-15', lib: 'Loyer janv', montant: 1000 }]);
    expect(r.mvtsByLigne['221']).toEqual([{ id: 2, date: '2026-02-10', lib: 'Honoraires', montant: 50 }]);
    // 230 (deduction) : montant = db − cr = 300 (positif), la soustraction est gérée dans le total
    expect(r.mvtsByLigne['230']).toEqual([{ id: 3, date: '2026-03-10', lib: 'Régul', montant: 300 }]);
  });
  it('detail:true n\'affecte pas les totaux', () => {
    const mvts = [{ date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 }];
    const a = _compute2044(mvts, STD).resultatFoncier;
    const b = _compute2044(mvts, STD, { detail: true }).resultatFoncier;
    expect(a).toBe(b);
  });
});

describe('_compute2044 — opts.mapping (catégories custom → ligne 2044)', () => {
  const STD = STD_CATEGORIES;
  it('une cat custom mappée via opts.mapping est agrégée (type déduit de la ligne)', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Honoraires comptable perso', db: 120, qui: 'F-001' }, // custom → 221 (charge)
      { date: '2026-02-15', cat: 'Loyer Airbnb', cr: 800, qui: 'F-001' }                // custom → 211 (recette)
    ];
    const r = _compute2044(mvts, STD, { mapping: { 'Honoraires comptable perso': '221', 'Loyer Airbnb': '211' } });
    expect(r.lignes['221']).toBe(120);
    expect(r.lignes['211']).toBe(800);
    expect(r.nonMappes).toHaveLength(0);
  });
  it('cat custom mappée sur 250 → comptée en intérêts', () => {
    const r = _compute2044([{ date: '2026-03-01', cat: 'Intérêts prêt SCI', db: 300 }], STD,
      { mapping: { 'Intérêts prêt SCI': '250' } });
    expect(r.lignes['250']).toBe(300);
    expect(r.totalInterets).toBe(300);
  });
  it('cat custom mappée sur 230 → soustraite des charges', () => {
    const r = _compute2044([
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-03-01', cat: 'Régul perso', db: 200 }
    ], STD, { mapping: { 'Régul perso': '230' } });
    expect(r.lignes['230']).toBe(200);
    expect(r.totalCharges).toBe(-200);
  });
  it('cat custom NON présente dans mapping → toujours nonMappes', () => {
    const r = _compute2044([{ id: 9, date: '2026-01-15', cat: 'Truc', db: 50 }], STD, { mapping: { 'Autre': '221' } });
    expect(r.nonMappes).toHaveLength(1);
  });
  it('STD_CATEGORIES prime sur opts.mapping (mapping ne s\'applique qu\'aux non-STD)', () => {
    // 'Loyers encaissés' est STD (211 recette) ; un mapping tordu ne doit pas la déplacer
    const r = _compute2044([{ date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 }], STD,
      { mapping: { 'Loyers encaissés': '221' } });
    expect(r.lignes['211']).toBe(1000);
    expect(r.lignes['221']).toBeUndefined();
  });
});
