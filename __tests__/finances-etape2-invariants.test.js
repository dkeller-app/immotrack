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

describe('étape 2 · tranche 2 — R-2 : recouvrement sur le dû du barème (suppressions §9)', () => {
  const duCCsur = (r, dueMonth) => {
    let du = 0, retard = 0;
    r.months.forEach((m) => { if (m.mo <= dueMonth) { du += m.duHC + m.duCH; retard += m.loyerRetard + m.chargeRetard; } });
    return { du: Math.round(du * 100) / 100, retard: Math.round(retard * 100) / 100 };
  };

  it('le moteur REND le dû du mois (duHC/duCH) — le dénominateur unique, fini attenduHCTheo', () => {
    const mvts = mouvementsJusquA(9);
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const r = run(mvts, win);
    const { du, retard } = duCCsur(r, win.dueMonth);
    expect(du).toBe(9 * 900);
    expect(retard).toBe(0);
    // recouvrement = (dû − retard) / dû = 100 %
    expect(Math.round((du - retard) / du * 1000) / 10).toBe(100);
  });

  it('un loyer payé D\'AVANCE ne fait jamais dépasser 100 % (dénominateur = exigibilité)', () => {
    // Tout l'exercice payé en janvier (10 800 € d'un coup).
    const mvts = [mvLoyer('2026-01', 10800)];
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const r = run(mvts, win);
    const { du, retard } = duCCsur(r, win.dueMonth);
    expect(du).toBe(9 * 900);
    expect(retard).toBe(0);                       // le netting : l'avance couvre les mois suivants
    const recouv = Math.round((du - retard) / du * 1000) / 10;
    expect(recouv).toBeLessThanOrEqual(100);
    expect(recouv).toBe(100);
  });

  it('zéro paiement = pire retard : recouvrement 0 %, retard = dû complet (loyers + charges)', () => {
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: [] });
    // Fenêtre sans mouvement mais exercice en cours : dernier mois échu quand même (dueMonth=9).
    expect(win.dueMonth).toBe(9);
    const r = run([], win);
    const { du, retard } = duCCsur(r, win.dueMonth);
    expect(du).toBe(9 * 900);
    expect(retard).toBe(9 * 900);
  });

  it('paiement PARTIEL : le manque tombe d\'abord sur les charges (H-1), le retard CC le capte', () => {
    // 800 versés sur 900 dus chaque mois → charges en retard de 100/mois.
    const mvts = mouvementsJusquA(9, 800);
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const r = run(mvts, win);
    const { du, retard } = duCCsur(r, win.dueMonth);
    expect(retard).toBe(9 * 100);
    const sept = r.months.find((m) => m.mo === 9);
    expect(sept.chargeRetard).toBe(100);          // la cascade sert le loyer d'abord
    expect(sept.loyerRetard).toBe(0);
    expect(Math.round((du - retard) / du * 1000) / 10).toBeCloseTo(88.9, 1);
  });
});

describe('étape 2 · tranche 3 — tableau (L-2/L-4/L-5, rattrapage, H-2, H-7)', () => {
  it('L-5 : le « resté à ta charge » bascule en Autres (225) et le cash-flow réel ne bouge pas d\'un centime', () => {
    const mvts = mouvementsJusquA(9).concat([
      { date: '2026-04-12', cat: 'Eau', db: 300, qui: LOT },        // récupérable, bail actif → transit
      { date: '2026-05-20', cat: 'Eau', db: 120, qui: 'LOT-VIDE' }  // récupérable, lot SANS bail → à charge
    ]);
    const isRecup = (m) => m.cat === 'Eau';
    const base = { mouvements: mvts, year: YEAR, scope: null, catLigne, loyerDue, activeLots: [LOT], today: TODAY };
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const sans = _computeFinancesMonthly(Object.assign({}, base, { window: win, isRecupCharge: isRecup }));
    const avec = _computeFinancesMonthly(Object.assign({}, base, { window: win, isRecupCharge: isRecup, isRecupACharge: (m) => m.qui === 'LOT-VIDE' }));
    expect(avec.annual.recupACharge).toBe(120);
    expect(avec.annual.autres).toBe(120);            // bascule ligne 225
    expect(avec.annual.recup).toBe(300);             // seul le récupérable reste au transit
    expect(avec.annual.recupSolde).toBe(sans.annual.recupSolde + 120);
    expect(avec.annual.cashflowReel).toBe(sans.annual.cashflowReel);   // déplacement, pas ajout
    // L-4 : total charges = somme exacte des lignes affichées
    const m5 = avec.months.find((m) => m.mo === 5);
    expect(m5.charges).toBeCloseTo(m5.pret + m5.taxe + m5.travaux + m5.honoraires + m5.assurance + m5.gestionHF + m5.autres, 2);
  });

  it('rattrapage : l\'arriéré de mars encaissé en juin apparaît en sous-ligne du mois de juin', () => {
    const mvts = [];
    for (let m = 1; m <= 9; m++) {
      if (m === 3) continue;                                   // mars impayé
      mvts.push(mvLoyer(YEAR + '-' + String(m).padStart(2, '0'), m === 6 ? 1800 : 900));  // juin paie double
    }
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const r = run(mvts, win);
    const juin = r.months.find((m) => m.mo === 6);
    expect(juin.rattrapage).toBe(900);                         // le mois qui reçoit porte le rattrapage
    const mars = r.months.find((m) => m.mo === 3);
    expect(mars.loyerRetard + mars.chargeRetard).toBe(0);      // arriéré soldé (netting)
    expect(r.annual.rattrapage).toBe(900);
  });

  it('H-2 : un encaissement de loyer SANS lot est compté au total ET rendu visible (nonAffecte)', () => {
    const mvts = mouvementsJusquA(9).concat([{ date: '2026-06-15', cat: 'Loyer', cr: 750, qui: '' }]);
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const r = run(mvts, win);
    const juin = r.months.find((m) => m.mo === 6);
    expect(juin.nonAffecte).toBe(750);
    expect(r.annual.nonAffecte).toBe(750);
    expect(r.annual.loyersBrut).toBe(9 * 900 + 750);           // total juste (rien ne disparaît)
  });

  it('H-7 : des intérêts datés 31/12 sont répartis au prorata des échéances payées et n\'étendent pas le constat', () => {
    const mvts = mouvementsJusquA(9).concat([
      { date: '2026-01-05', cat: 'Prêt', db: 600 }, { date: '2026-02-05', cat: 'Prêt', db: 600 },
      { date: '2026-12-31', cat: 'Interets', db: 1200 }
    ]);
    const cat3 = (c) => (c === 'Loyer' ? { ligne2044: '211', type: 'recette' } : (c === 'Interets' ? { ligne2044: '250', type: 'interet' } : null));
    // La fenêtre de constat EXCLUT les intérêts de son extension (côté app : filtreMouvement).
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts, filtreMouvement: (mv) => mv.cat !== 'Interets' });
    expect(win.lastMonth).toBe(9);                             // pas de décembre fantôme
    const r = _computeFinancesMonthly({
      mouvements: mvts, year: YEAR, scope: null, catLigne: cat3, loyerDue,
      activeLots: [LOT], today: TODAY, window: win, isEcheance: (m) => m.cat === 'Prêt'
    });
    const jan = r.months.find((m) => m.mo === 1), fev = r.months.find((m) => m.mo === 2);
    expect(jan.interets).toBe(600);                            // 1200 × (600/1200)
    expect(fev.interets).toBe(600);
    expect(r.annual.interets).toBe(1200);
    expect(r.interetsKnown).toBe(true);
  });
});

describe('étape 2 · tranche 4 — ratios sous le socle (R-2 compteur, R-4 occupation, K-2 vacance)', () => {
  it('R-2 : « N impayés » vient du moteur — lots à retard résiduel > 0, rien d\'autre', async () => {
    const { _computeFinancesMonthly: eng } = await import('../js/core/finances-monthly.js');
    const due2 = (qui) => (qui === 'A' || qui === 'B' ? { hc: 500, ch: 50 } : { hc: 0, ch: 0 });
    const mvts = [];
    for (let m = 1; m <= 9; m++) mvts.push({ date: YEAR + '-' + String(m).padStart(2, '0') + '-03', cat: 'Loyer', cr: 550, qui: 'A' });
    // B ne paie rien : pire retard, il doit compter. A est à jour : il ne compte pas.
    const win = computeConstatWindow({ year: YEAR, today: TODAY, mouvements: mvts });
    const r = eng({ mouvements: mvts, year: YEAR, scope: null, catLigne, loyerDue: due2, activeLots: ['A', 'B'], today: TODAY, window: win });
    expect(r.lotsEnRetard).toEqual(['B']);
  });

  it('R-4/K-2 : occupation = moyenne de la période, sous le socle (lots injectés) ; manque à gagner théorique = jours vides × loyer de référence', async () => {
    const { _computeOccupationLots } = await import('../js/core/legal-bilan.js');
    const db = {
      baux: { OCC: { ref: 'OCC', debut: '2025-01-01', hc: 800, ch: 100 } },
      baux_historique: [{ ref: 'VIDE', debut: '2024-01-01', fin: '2026-03-31', finEffective: '2026-03-31', archive: true, hc: 600 }]
    };
    const lots = [
      { ref: 'OCC', locataire: 'X', loyerHcRef: 800 },
      { ref: 'VIDE', locataire: '', loyerHcRef: 600 },           // vide depuis le 31/03
      { ref: 'SANS-BAILLEUR', locataire: '', loyerHcRef: 500 }   // P-2 : il COMPTE (constat 21)
    ];
    const r = _computeOccupationLots(db, lots, { from: '2026-01-01', to: '2026-06-30' });
    expect(r.nbLots).toBe(3);
    // OCC : 181 jours · VIDE : 90 (jan→mars) · SANS-BAILLEUR : 0 → (181+90)/543
    expect(r.taux).toBeCloseTo((181 + 90) / (3 * 181) * 100, 0);
    // K-2 : VIDE 91 jours vides × 600/30,44 + SANS-BAILLEUR 181 × 500/30,44
    expect(r.manqueAGagner).toBeCloseTo(91 / 30.44 * 600 + 181 / 30.44 * 500, 0);
    // État du jour (information distincte de la moyenne, R-4)
    expect(r.vacantsJour.map(v => v.ref).sort()).toEqual(['SANS-BAILLEUR', 'VIDE']);
    expect(r.vacantsJour.find(v => v.ref === 'VIDE').depuis).toBe('2026-03-31');
  });
});
