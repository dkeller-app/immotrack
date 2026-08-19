/**
 * REFONTE FINANCES — ÉTAPE 2 (rebranchement) : les invariants du CDC (§ 0, § 2, § 4, § 11)
 * encodés en tests, tranche par tranche. Chaque tranche du chantier AJOUTE ses invariants ici,
 * le harnais I-1 (__tests__/helpers/finances-invariant-i1.js) reste l'outil commun.
 *
 * Tranche 1 « socle branché » :
 *   - le RETARD suit la fenêtre d'EXIGIBILITÉ, jamais celle de CONSTAT (piège du « retard
 *     fantôme » : ~800 €/lot si on confond les deux) ;
 *   - une fenêtre VIDE ne produit AUCUN mois (pas de janvier fantôme) ;
 *   - le N-1 aligné couvre la MÊME étendue de mois que N (T-2) ;
 *   - annuel = Σ des mois (T-1) sur le moteur piloté par fenêtre ;
 *   - I-1 : une IRL d'août ne modifie aucun chiffre de janvier à juillet.
 */
import { describe, it, expect } from 'vitest';
import { _computeFinancesMonthly } from '../js/core/finances-monthly.js';
import {
  computeConstatWindow, computeExigibiliteWindow, alignPreviousYear
} from '../js/core/finances-window.js';
import {
  casReferenceIRL, surfacesSocle, infractionsI1, formatInfractionsI1
} from './helpers/finances-invariant-i1.js';
import { duMois } from '../js/core/loyer-du-mois.js';

const TODAY = '2026-09-13';           // exercice 2026 en cours, 9 mois échus
const YEAR = 2026;

/** Un lot simple : 800 HC + 100 CH dus chaque mois, payé rubis sur l'ongle jusqu'en septembre. */
const LOT = 'LOT-A';
const loyerDue = (qui) => (qui === LOT ? { hc: 800, ch: 100 } : { hc: 0, ch: 0 });
const catLigne = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : null);
const mvLoyer = (ym, amt, qui) => ({ date: ym + '-05', cat: 'Loyer', cr: amt, qui: qui || LOT });

function mouvementsJusquA(mo, amt) {
  const out = [];
  for (let m = 1; m <= mo; m++) out.push(mvLoyer(YEAR + '-' + String(m).padStart(2, '0'), amt == null ? 900 : amt));
  return out;
}

function run(mvts, win) {
  return _computeFinancesMonthly({
    mouvements: mvts, year: YEAR, scope: null, catLigne, loyerDue,
    activeLots: [LOT], today: TODAY, window: win
  });
}

describe('étape 2 · tranche 1 — fenêtres branchées sur le moteur', () => {
  it('un encaissement post-daté OUVRE la colonne de son mois (décision « B ») sans créer de retard fantôme', () => {
    // Payé jan→sept + un loyer d'octobre déjà encaissé (post-daté).
    const mvts = mouvementsJusquA(9).concat([mvLoyer('2026-10', 900)]);
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    expect(win.lastMonth).toBe(10);      // constat étendu au mouvement connu
    expect(win.dueMonth).toBe(9);        // rien n'est dû au-delà de septembre
    const r = run(mvts, win);
    expect(r.months.length).toBe(10);
    const oct = r.months.find((m) => m.mo === 10);
    expect(oct.loyersHC).toBe(800);      // l'argent est là : compté
    // LE piège documenté : passer la borne de constat au retard fabriquait ~800 € ici.
    expect(oct.loyerRetard).toBe(0);
    expect(oct.chargeRetard).toBe(0);
    expect(r.annual.loyerRetard).toBe(0);
  });

  it('fenêtre VIDE (exercice à venir atteignable via le sélecteur) → ZÉRO mois, pas de janvier fantôme', () => {
    const win = computeConstatWindow({ year: YEAR + 1, today: TODAY, mouvements: [] });
    expect(win.empty).toBe(true);
    const r = _computeFinancesMonthly({
      mouvements: [], year: YEAR + 1, scope: null, catLigne, loyerDue,
      activeLots: [LOT], today: TODAY, window: win
    });
    expect(r.months.length).toBe(0);
    expect(r.annual.loyerRetard).toBe(0);
    expect(r.annual.loyersHC).toBe(0);
  });

  it('N-1 aligné : la MÊME étendue de mois que N (T-2) — jamais 12 mois contre 9', () => {
    const mvts = mouvementsJusquA(9);
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const n1 = alignPreviousYear(win);
    expect(n1.year).toBe(YEAR - 1);
    expect(n1.lastMonth).toBe(win.lastMonth);
    expect(n1.dueMonth).toBe(win.lastMonth);   // exercice clos : rien d'« à venir »
    // Moteur N-1 : produit exactement lastMonth mois.
    const mvtsN1 = [];
    for (let m = 1; m <= 12; m++) mvtsN1.push({ date: (YEAR - 1) + '-' + String(m).padStart(2, '0') + '-05', cat: 'Loyer', cr: 900, qui: LOT });
    const rN1 = _computeFinancesMonthly({
      mouvements: mvtsN1, year: YEAR - 1, scope: null, catLigne, loyerDue,
      activeLots: [LOT], today: TODAY, window: n1
    });
    expect(rN1.months.length).toBe(win.lastMonth);
  });

  it('T-1 : la colonne Année = Σ des colonnes mois, sur toutes les lignes', () => {
    const mvts = mouvementsJusquA(9).concat([
      { date: '2026-03-10', cat: 'Taxe', db: 1200 },
      { date: '2026-06-02', cat: 'Prêt', db: 650 }
    ]);
    const cat2 = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : (c === 'Taxe' ? { ligne2044: '227', type: 'charge' } : null));
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const r = _computeFinancesMonthly({
      mouvements: mvts, year: YEAR, scope: null, catLigne: cat2, loyerDue,
      activeLots: [LOT], today: TODAY, window: win,
      isEcheance: (m) => m.cat === 'Prêt'
    });
    const keys = ['loyersHC', 'provisions', 'avance', 'recettesDiverses', 'loyerRetard', 'chargeRetard',
      'pret', 'taxe', 'travaux', 'honoraires', 'assurance', 'autres', 'gestionHF', 'recup', 'charges'];
    keys.forEach((k) => {
      const somme = Math.round(r.months.reduce((s, m) => s + m[k], 0) * 100) / 100;
      expect(somme, 'annuel = Σ mois pour ' + k).toBeCloseTo(r.annual[k], 1);
    });
  });

  it('grace de début de mois : portée par la fenêtre d\'exigibilité, jamais recalculée', () => {
    const early = computeExigibiliteWindow({ year: YEAR, today: '2026-09-05' });
    expect(early.graceLast).toBe(true);
    const late = computeExigibiliteWindow({ year: YEAR, today: TODAY });
    expect(late.graceLast).toBe(false);
    // Moteur : avec la grâce, septembre impayé n'est PAS un retard le 5 du mois.
    const mvts = mouvementsJusquA(8);
    const win = { kind: 'constat', lastMonth: 9, dueMonth: 9, today: '2026-09-05', graceLast: true };
    const r = _computeFinancesMonthly({
      mouvements: mvts, year: YEAR, scope: null, catLigne, loyerDue,
      activeLots: [LOT], today: '2026-09-05', window: win
    });
    const sept = r.months.find((m) => m.mo === 9);
    expect(sept.loyerRetard).toBe(0);
  });
});

describe('étape 2 · tranche 1 — invariant I-1 (IRL d\'août, janvier→juillet figés)', () => {
  it('aucune surface du socle branché ne bouge sur les mois figés', () => {
    const cas = casReferenceIRL({ annee: YEAR });
    const mvts = [];
    for (let m = 1; m <= 9; m++) mvts.push({ date: YEAR + '-' + String(m).padStart(2, '0') + '-03', cat: 'Loyer', cr: 900, qui: cas.ref });
    const surfaces = surfacesSocle({ mouvements: mvts });
    const inf = infractionsI1({ avant: cas.avant, apres: cas.apres, moisFiges: cas.moisFiges, surfaces });
    expect(inf, formatInfractionsI1(inf)).toEqual([]);
    // Et les mois indexés bougent VRAIMENT (le harnais mesure quelque chose).
    expect(duMois(cas.apres, YEAR + '-08').hc).toBe(850);
    expect(duMois(cas.avant, YEAR + '-08').hc).toBe(800);
  });
});
