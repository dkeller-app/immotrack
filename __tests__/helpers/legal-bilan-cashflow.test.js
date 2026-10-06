/**
 * Chantier « un seul endroit pour l'argent » — lot 6, B.
 *
 * Le bilan annuel calculait son « Cash-flow opérationnel » lui-même (revenus − charges au sens 2044) :
 * un calcul sauvage, faux dès qu'il y a un prêt, des travaux d'agrandissement, une dépense non
 * déductible… Désormais la ligne de l'entité LIT Finances (`_dashCfReel` → `_finMonthly` →
 * `annual.cashflowReel`, injecté). La colonne par lot, qui n'a jamais été un cash-flow, s'appelle
 * « Résultat fiscal » et vaut le résultat foncier du lot. Le bilan n'est jamais enregistré : il est
 * affiché, rien n'est réécrit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _computeBilanAnnuel, _formatBilanTexte } from '../../js/core/legal-bilan.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8').replace(/\r/g, '');
const corps = (nom) => { const i = P2.indexOf('\nfunction ' + nom + '('); return i < 0 ? '' : P2.slice(i, P2.indexOf('\n}', i + 1) + 2); };

const STD = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Travaux (entretien, réparation, amélioration)', ligne2044: '224', type: 'charge' },
  { nom: "Prêt — Intérêts d'emprunt", ligne2044: '250', type: 'interet' },
];
const db = () => ({
  entites: [{ id: 1, nom: 'SCI B', type: 'SCI IR' }],
  logements: [{ id: 1, ref: 'B-1', entity: 'SCI B', type: 'T2', locataire: 'X' }, { id: 2, ref: 'B-2', entity: 'SCI B', type: 'T1', locataire: 'Y' }],
  baux: {}, baux_historique: [],
  mouvements: [
    { date: '2025-01-10', cat: 'Loyers encaissés', cr: 1000, qui: 'B-1' },
    { date: '2025-02-10', cat: 'Travaux (entretien, réparation, amélioration)', db: 300, qui: 'B-1' },
    { date: '2025-12-31', cat: "Prêt — Intérêts d'emprunt", db: 120, qui: 'B-1' },          // intérêts du lot
    { date: '2025-03-10', cat: 'Loyers encaissés', cr: 500, qui: 'B-2' },
    { date: '2025-06-01', cat: 'Prêt', db: 900, qui: 'B-2' },                                // échéance : hors 2044
  ],
});

describe('Bilan annuel — cash-flow lu dans Finances, colonne par lot = résultat fiscal', () => {
  it('la ligne de l’entité = la valeur injectée de Finances, arrondie au centime (jamais recalculée)', () => {
    const b = _computeBilanAnnuel(db(), STD, 'SCI B', 2025, { cashflowReel: -12.346 });
    expect(b.kpis.cashFlow).toBe(-12.35);
    expect(b.kpis.resultatFoncier).toBe(1080);          // 1500 − 300 − 120 : la 2044, elle, ne bouge pas
  });

  it('sans valeur injectée (ou invalide) : null, affiché « non disponible »', () => {
    for (const v of [undefined, null, NaN, '500']) {
      const b = _computeBilanAnnuel(db(), STD, 'SCI B', 2025, { cashflowReel: v });
      expect(b.kpis.cashFlow).toBeNull();
      expect(_formatBilanTexte(b)).toMatch(/Cash-flow réel \(Finances\) \.+ +non disponible/);
    }
  });

  it('texte : libellé « Cash-flow réel (Finances) », colonne « Résultat fiscal » = résultat foncier du lot', () => {
    const b = _computeBilanAnnuel(db(), STD, 'SCI B', 2025, { cashflowReel: 480 });
    expect(b.parLogement.map((l) => [l.ref, l.resultatFiscal])).toEqual([['B-1', 580], ['B-2', 500]]);   // B-1 : 1000 − 300 − 120
    const txt = _formatBilanTexte(b);
    expect(txt).toContain('Cash-flow réel (Finances) ......        480,00 €');
    expect(txt).not.toContain('Cash-flow opérationnel');
    const entete = txt.split('\n').find((x) => x.includes('Locataire'));
    expect(entete).toMatch(/Résultat fiscal$/);
    expect(entete).not.toContain('Cash-flow');
    const ligneB1 = txt.split('\n').find((x) => x.startsWith('  B-1'));
    expect(ligneB1.endsWith('580,00 €')).toBe(true);
    expect(ligneB1.length).toBe(entete.length);         // colonne alignée sous son titre
  });

  it('les mouvements du BAILLEUR ne sont comptés dans aucun lot : ligne « non réparti », somme = entité', () => {
    const d = db();
    d.mouvements.push({ date: '2025-04-01', cat: 'Travaux (entretien, réparation, amélioration)', db: 70, qui: 'SCI:SCI B' });
    d.mouvements.push({ date: '2025-09-30', cat: "Prêt — Intérêts d'emprunt", db: 40, qui: 'SCI:SCI B' });
    const b = _computeBilanAnnuel(d, STD, 'SCI B', 2025, { cashflowReel: 0 });
    expect(b.parLogement.map((l) => l.charges)).toEqual([300, 0]);
    expect(b.bailleurNonReparti).toEqual({ revenus: 0, charges: 70, resultatFiscal: -110 });
    const somme = b.parLogement.reduce((s, l) => s + l.resultatFiscal, 0) + b.bailleurNonReparti.resultatFiscal;
    expect(somme).toBe(b.kpis.resultatFoncier);
    const txt = _formatBilanTexte(b).split('\n');
    const nr = txt.find((x) => x.includes('Bailleur et immeubles (non réparti)'));
    expect(nr.endsWith('-110,00 €')).toBe(true);
    expect(nr.length).toBe(txt.find((x) => x.includes('Locataire')).length);
    expect(_computeBilanAnnuel(db(), STD, 'SCI B', 2025, {}).bailleurNonReparti).toBeNull();
    // Des intérêts seuls (prêt global du bailleur) suffisent à faire apparaître la ligne.
    const d2 = db();
    d2.mouvements.push({ date: '2025-09-30', cat: "Prêt — Intérêts d'emprunt", db: 40, qui: 'SCI:SCI B' });
    expect(_computeBilanAnnuel(d2, STD, 'SCI B', 2025, {}).bailleurNonReparti).toEqual({ revenus: 0, charges: 0, resultatFiscal: -40 });
  });

  it('charge posée sur l’IMMEUBLE (qui vide + imm) : dans la 2044 de l’entité et sur la ligne « non réparti », jamais perdue', () => {
    const d = db();
    d.logements.forEach((l) => { l.imm = 'Imm B'; });
    d.mouvements.push({ date: '2025-10-15', cat: 'Travaux (entretien, réparation, amélioration)', db: 500, qui: '', imm: 'Imm B' });
    d.mouvements.push({ date: '2025-10-16', cat: 'Travaux (entretien, réparation, amélioration)', db: 999, qui: '', imm: 'Autre immeuble' });
    const b = _computeBilanAnnuel(d, STD, 'SCI B', 2025, {});
    expect(b.kpis.totalCharges).toBe(800);                          // 300 (lot) + 500 (immeuble), jamais l'autre immeuble
    expect(b.bailleurNonReparti).toEqual({ revenus: 0, charges: 500, resultatFiscal: -500 });
    const somme = b.parLogement.reduce((s, l) => s + l.resultatFiscal, 0) + b.bailleurNonReparti.resultatFiscal;
    expect(somme).toBe(b.kpis.resultatFoncier);
  });

  it('même périmètre que Finances : ref saisie avec espaces / casse, nom d’immeuble avec espace — rien ne se perd', () => {
    const d = db();
    d.logements.forEach((l) => { l.imm = 'Imm B '; });
    d.mouvements.push({ date: '2025-10-15', cat: 'Travaux (entretien, réparation, amélioration)', db: 500, qui: '', imm: 'Imm B' });
    d.mouvements.push({ date: '2025-11-10', cat: 'Loyers encaissés', cr: 200, qui: ' b-1 ' });
    const b = _computeBilanAnnuel(d, STD, 'SCI B', 2025, {});
    expect(b.kpis.totalRevenus).toBe(1700);                       // 1000 + 500 + 200 (ref tolérante)
    expect(b.parLogement.find((l) => l.ref === 'B-1').revenus).toBe(1200);
    expect(b.bailleurNonReparti).toEqual({ revenus: 0, charges: 500, resultatFiscal: -500 });
    const somme = b.parLogement.reduce((s, l) => s + l.resultatFiscal, 0) + b.bailleurNonReparti.resultatFiscal;
    expect(somme).toBe(b.kpis.resultatFoncier);
  });

  it('openBilanAnnuel : une panne du moteur Finances n’empêche pas le bilan (« non disponible »)', () => {
    const sortie = { textContent: '', style: {} };
    const env = {
      window: { _computeBilanAnnuel: (d, s, e, y, o) => _computeBilanAnnuel(db(), STD, 'SCI B', 2025, o), _formatBilanTexte },
      v: (id) => ({ 'bilan-year': '2025', 'bilan-ent': 'SCI B' }[id]), el: () => sortie, showToast: () => {}, DB: {}, STD_CATEGORIES: STD,
      _dashCfReel: () => { throw new Error('moteur'); }, console: { warn: () => {} },
    };
    new Function(...Object.keys(env), corps('openBilanAnnuel') + '\nreturn openBilanAnnuel;')(...Object.values(env))();
    expect(sortie.textContent).toMatch(/Cash-flow réel \(Finances\) \.+ +non disponible/);
  });

  it('openBilanAnnuel injecte le cash-flow du bloc unique (même périmètre que l’entité choisie)', () => {
    const appels = [];
    const sortie = { textContent: '', style: {} };
    const env = {
      window: { _computeBilanAnnuel: (d, s, e, y, o) => { appels.push(o); return _computeBilanAnnuel(db(), STD, 'SCI B', 2025, o); }, _formatBilanTexte },
      v: (id) => ({ 'bilan-year': '2025', 'bilan-ent': 'SCI B' }[id]),
      el: () => sortie, showToast: () => {}, DB: {}, STD_CATEGORIES: STD,
      _dashCfReel: (ctx) => (ctx.yr === '2025' && ctx.activeEnt === 'SCI B' ? { cf: 480 } : { cf: -1 }),
    };
    const f = new Function(...Object.keys(env), corps('openBilanAnnuel') + '\nreturn openBilanAnnuel;');
    f(...Object.values(env))();
    expect(appels).toHaveLength(1);
    expect(appels[0].cashflowReel).toBe(480);
    expect(sortie.textContent).toContain('480,00 €');
  });

  it('le bilan n’est jamais enregistré : affiché seulement, aucune écriture en base', () => {
    const c = corps('openBilanAnnuel');
    expect(c).not.toMatch(/saveDB|_stamp\(|DB\.[\w.]+\s*=(?!=)|localStorage|_idbPut/);
    expect(c).toContain('out.textContent = txt');
  });
});
