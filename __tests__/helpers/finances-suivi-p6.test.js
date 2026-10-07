/**
 * FINANCES-SUIVI-UNIQUE P6 — le bandeau « Tous les loyers » (frise 12 mois + solde), la pastille de
 * statut par lot (`_v4ComputeLotStatus`), la bulle Impayés de l'Accueil, le KPI, le pilotage (matrice)
 * et l'Accueil téléphone lisent LE MÊME moteur que Finances et l'onglet Loyers (js/core/suivi-loyers.js).
 *
 *  1. Adaptateur pur `versFrise` : la frise du bandeau sur le cas Arslan (Ferrette - 101), avec et
 *     sans le geste « accepter le manque », et la dette d'un locataire parti (décision Q2).
 *  2. Invariant « une valeur, toutes les surfaces » (300 lots aléatoires à graine fixe + Arslan),
 *     en exécutant les VRAIES fonctions de l'app (extraites d'index.html) : bulle Impayés
 *     (`_computeImpayes`) = ligne Finances (position, `_computeFinancesMonthly` avec le suivi) =
 *     onglet Loyers (versEtatLot + retardLot) = frise du bandeau (`_suiviLoyerStrip`) = pastille
 *     (`_v4ComputeLotStatus`) = pilotage (`pilotagePay`), au centime ; chaque case de la frise =
 *     la case du lot dans Finances.
 *  3. Câblage : plus aucun appel à `_computeLoyerStatut` / `_computeLoyerCumul` / `_loyerSoldeAjuste`
 *     hors de leur module (loyer-statut.js, supprimé en P7) et de son exposition (main.js).
 * La preuve sur l'export réel est la section P6 de compare-moteurs.mjs (exit 1 sinon).
 * Conception : docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md §A.3, §E.2, §G P6, §I (Q2, Q4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as SL from '../../js/core/suivi-loyers.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { retardLot } from '../../js/core/loyers-mois.js';
import { pilotagePay } from '../../js/core/pilotage-familles.js';
import { lotArslan, TODAY_ARSLAN, CLE_ANCIEN, CLE_ARSLAN, prng, lotAleatoire, vir } from './suivi-loyers-fixtures.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '../..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace(/\r/g, '');
const extrait = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  const j = html.indexOf('\n}', i);
  if (i < 0 || j < 0) throw new Error(nom + ' introuvable');
  return html.slice(i, j + 2);
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const catLigne = (cat) => ({ Loyer: { ligne2044: '211', type: 'recette' }, GLI: { ligne2044: '213', type: 'recette' } }[cat] || null);
const mouvementsDe = (lot) => lot.paiements.map((p) => ({
  id: p.id, date: p.date, qui: lot.ref, cat: p.kind === 'gli' ? 'GLI' : 'Loyer',
  cr: p.montant > 0 ? p.montant : 0, db: p.montant < 0 ? -p.montant : 0
}));
const loyerDueDe = (lot) => (qui, ym) => {
  if (qui !== lot.ref) return { hc: 0, ch: 0 };
  const d = duMois({ ref: lot.ref, bails: lot.baux, bareme: lot.bareme }, ym);
  return { hc: d.hc || 0, ch: d.ch || 0 };
};
const graceDe = (today) => parseInt(today.slice(8, 10), 10) < 10;

/**
 * Toutes les surfaces d'UN lot, calculées par le code de l'app, à `today`.
 * `log` = la fiche du lot telle que l'app la lit (loyer de référence hc + ch actuels).
 */
function surfaces(lot, today) {
  const graceLast = graceDe(today);
  const s = SL.suiviLot(lot, { today, graceLast, seuilArrondi: 1 });
  const year = today.slice(0, 4), mo = parseInt(today.slice(5, 7), 10);
  const dernier = lot.baux[lot.baux.length - 1];
  const log = { ref: lot.ref, hc: dernier.hc, ch: dernier.ch, locataire: 'X', entity: 'SCI' };
  // Finances : _finMonthly → _computeFinancesMonthly avec le suivi injecté (comme l'app).
  const R = _computeFinancesMonthly({
    mouvements: mouvementsDe(lot), year, scope: null, scopeWeight: () => 1, catLigne, isEcheance: () => false,
    loyerDue: loyerDueDe(lot), activeLots: [lot.ref], window: { lastMonth: mo, dueMonth: mo, today }, today, suivi: [s]
  });
  const win = {
    SuiviLoyers: SL, _loyerTodayLocal: () => today, _loyerToleranceActive: () => graceLast,
    pilotagePay
  };
  // Les VRAIES fonctions de l'app (index.html assemblé), dépendances remplacées par des doubles.
  const finSuiviLot = () => s;
  const strip = new Function('window', '_finSuiviLot', `${extrait('_suiviLoyerStrip')}\nreturn _suiviLoyerStrip;`)(win, finSuiviLot);
  const pastille = new Function('window', '_suiviLoyerStrip', '_lotEstLoue', 'fmt', '_isLoyerCategory',
    `${extrait('_v4ComputeLotStatus')}\nreturn _v4ComputeLotStatus;`)(win, strip, () => true, (n) => String(n), (c) => c === 'Loyer');
  const detteLot = new Function('_finSuiviLot', `${extrait('_finSuiviDetteLot')}\nreturn _finSuiviDetteLot;`)(finSuiviLot);
  const DB = { logements: [log], baux_historique: [] };
  const computeImpayes = new Function('window', 'DB', '_finMonthly', '_finEntScope', '_finWindows', '_finSuiviDetteLot', '_bienActiveBail',
    `${extrait('_nomsDuBail')}\n${extrait('_computeImpayes')}\nreturn _computeImpayes;`)(
    win, DB, () => R, () => null, () => ({ constat: { lastMonth: mo, dueMonth: mo } }), detteLot, () => null);
  const imp = computeImpayes({ scopeLogs: [log], yr: year, mo: '', activeEnt: '' });
  const item = imp.items.find((x) => x.ref === lot.ref);
  const bl = R.byLot[lot.ref] || { annual: { retard: 0, avance: 0 }, months: [], solde: 0 };
  const frise = strip(log, year);
  const lm = s.mois[s.dueYm] || { retard: 0, avance: 0, solde: 0 };
  return {
    s, R, bl, frise, lm,
    finances: r2((R.annual.loyerRetard || 0) + (R.annual.chargeRetard || 0)),   // ligne Finances, colonne Année (position)
    caseFinances: R.annual.ecart || 0,
    bulle: item ? item.reste : 0,
    nbBulle: imp.count,
    loyers: retardLot(SL.versEtatLot(s, { baux: 'visibles' }), { toleranceActive: false }).reste,
    pastille: pastille(log, year, '', []),
    pilotage: pilotagePay(true, lot.ref, new Set(imp.items.map((x) => x.ref)), bl.solde)
  };
}

// ── 1. Adaptateur versFrise ─────────────────────────────────────────────────────────────
describe('P6 — versFrise : la frise du bandeau lue dans le suivi (cas Arslan, Ferrette - 101)', () => {
  const GRACE = { today: TODAY_ARSLAN, graceLast: true, seuilArrondi: 1 };
  const frise = (geste) => SL.versFrise(SL.suiviLot(lotArslan({ geste }), GRACE), 2026, { monthlyFull: 780 });

  it('sans le geste : août, septembre, octobre « partiel » (−20 de charges), juin en avance, solde −20 (plus −943,01)', () => {
    const f = frise(false);
    expect(f.months.map((m) => m.cls).join(',')).toBe('vac,vac,ok,ok,ok,avance,ok,warn,warn,warn,avenir,avenir');
    expect(f.months[0].horsSuivi).toBe(true);                  // janvier, février : avant le 1er loyer encaissé (mars)
    expect(f.months.map((m) => m.solde).slice(2, 10)).toEqual([0, 0, 0, 780, 0, -20, -20, -20]);   // = la ligne de Finances
    expect(f.solde).toBe(-20);
    expect(f.retard).toBe(20);
    expect(f.avance).toBe(0);
    expect(f.months[7]).toMatchObject({ recu: 760, attendu: 780, retard: 20 });
    expect(f.months[3].recu).toBe(0);                          // avril : réglé par la retenue sur le dépôt, aucun virement
  });

  it('avec le geste « accepter le manque » (20 €, panne électrique) : tout est payé, solde 0', () => {
    const f = frise(true);
    expect(f.months.slice(2, 10).map((m) => m.cls)).toEqual(['ok', 'ok', 'ok', 'avance', 'ok', 'ok', 'ok', 'ok']);
    expect(f.solde).toBe(0);
  });

  it('solde du bandeau = byLot.solde = la case de Finances ; retard = byLot.annual.retard (bulle)', () => {
    for (const geste of [false, true]) {
      const s = SL.suiviLot(lotArslan({ geste }), GRACE);
      const f = SL.versFrise(s, 2026, { monthlyFull: 780 });
      const bl = SL.versByLot(s, 2026);
      expect(f.solde).toBe(bl.solde);
      expect(f.retard).toBe(bl.annual.retard);
      bl.months.forEach((m, i) => expect(f.months[i].solde).toBe(m.solde));
    }
  });

  it('locataire parti (Q2) : sa dette figée est dans la frise l\'année de son départ seulement, marquée « parti »', () => {
    const lot = {
      ref: 'F-Local', bareme: [], manques: [],
      baux: [{ cle: 'F-Local|2026-01-01', debut: '2026-01-01', fin: '2028-12-31', finEffective: '2026-08-31', archive: true, hc: 235, ch: 15, noms: 'Sorti' }],
      paiements: ['01', '02', '03', '04', '05'].map((m) => vir('p' + m, '2026-' + m + '-03', 250))
    };
    const f26 = SL.versFrise(SL.suiviLot(lot, { today: '2026-10-15', seuilArrondi: 1 }), 2026, { monthlyFull: 0 });
    expect(f26.months.slice(5, 10).map((m) => m.cls)).toEqual(['imp', 'imp', 'imp', 'warn', 'warn']);
    expect(f26.months[8]).toMatchObject({ retard: 750, parti: true, attendu: 0 });
    expect(f26.retard).toBe(750);
    const f27 = SL.versFrise(SL.suiviLot(lot, { today: '2027-02-15', seuilArrondi: 1 }), 2027, { monthlyFull: 0 });
    expect(f27.retard).toBe(0);                                  // disparaît au 1er janvier suivant
    expect(f27.months.every((m) => m.cls === 'vac')).toBe(true);
  });

  it('deux baux : la dette du parti et l\'avance du suivant ne se compensent jamais sur un bail', () => {
    const lot = {
      ref: 'F1', bareme: [], manques: [],
      baux: [
        { cle: 'F1|2026-01-01', debut: '2026-01-01', fin: null, finEffective: '2026-06-06', archive: true, hc: 450, ch: 45, noms: 'Ancien' },
        { cle: 'F1|2026-07-18', debut: '2026-07-18', fin: null, finEffective: null, archive: false, hc: 450, ch: 45, noms: 'Nouveau' }
      ],
      paiements: [vir('a', '2026-01-03', 495), vir('b', '2026-02-03', 495), vir('c', '2026-03-03', 495), vir('d', '2026-04-03', 495), vir('e', '2026-05-03', 495),
        vir('n1', '2026-07-19', 990), vir('n2', '2026-08-03', 495), vir('n3', '2026-09-03', 495), vir('n4', '2026-10-03', 495)]
    };
    const s = SL.suiviLot(lot, { today: '2026-10-15', seuilArrondi: 1 });
    const f = SL.versFrise(s, 2026, { monthlyFull: 495 });
    for (const b of s.baux) for (const m of b.mois) expect(m.retard > 0.005 && m.avance > 0.005).toBe(false);
    expect(f.retard).toBeGreaterThan(0);                        // dette de l'ancien (juin), visible en 2026
    expect(f.avance).toBeGreaterThan(0);                        // avance du nouveau
    expect(f.solde).toBe(r2(f.avance - f.retard));              // la case nette de Finances
    expect(f.solde).toBe(SL.versByLot(s, 2026).solde);
  });
});

// ── 2. Une valeur, toutes les surfaces ──────────────────────────────────────────────────
describe('P6 — une valeur, toutes les surfaces (code de l\'app exécuté)', () => {
  const verifier = (lot, today) => {
    const x = surfaces(lot, today);
    const ret = x.lm.retard;
    expect(x.finances, 'Finances (position)').toBe(ret);
    expect(x.bl.annual.retard, 'byLot (KPI, chip du bandeau)').toBe(ret);
    expect(x.loyers, 'onglet Loyers').toBe(ret);
    expect(x.frise.retard, 'frise du bandeau').toBe(ret);
    expect(x.frise.solde, 'solde du bandeau = case Finances').toBe(x.bl.solde);
    expect(x.frise.solde, 'solde du bandeau = ligne « Avance / retard du lot »').toBe(x.caseFinances);
    expect(x.bulle, 'bulle Impayés').toBe(ret > 0.5 ? ret : 0);
    expect(x.nbBulle).toBe(ret > 0.5 ? 1 : 0);
    expect(x.pilotage, 'pilotage (matrice)').toBe(ret > 0.5 ? 'neg' : (x.bl.solde > 0.5 ? 'adv' : 'pos'));
    if (x.pastille.vacant !== true || ret > 0.5) expect(r2(x.pastille.retard || 0), 'pastille _v4ComputeLotStatus').toBe(r2(ret));
    // chaque case de la frise (mois exigible) = la case du lot dans Finances
    x.bl.months.forEach((m, i) => { if (m.ym <= x.s.dueYm) expect(x.frise.months[i].solde, m.ym).toBe(m.solde); });
    // jamais retard ET avance sur un bail
    for (const b of x.s.baux) for (const m of b.mois) expect(m.retard > 0.005 && m.avance > 0.005).toBe(false);
    return x;
  };

  it('Elise (Ferrette - 101) : 20 € partout (bulle, Finances, Loyers, frise, pastille, pilotage) ; 0 avec le geste', () => {
    const x = verifier(lotArslan(), TODAY_ARSLAN);
    expect(x.bulle).toBe(20);
    expect(x.frise.solde).toBe(-20);
    expect(x.pilotage).toBe('neg');
    expect(x.pastille.cls).toBe('warn');
    const y = verifier(lotArslan({ geste: true }), TODAY_ARSLAN);
    expect(y.bulle).toBe(0);
    expect(y.pilotage).toBe('pos');
    expect(y.pastille.cls).toBe('ok');
  });

  it('GLI (Q4) : l\'indemnité ne réduit pas la dette — la bulle continue de la compter', () => {
    const lot = {
      ref: 'D-105', bareme: [], manques: [],
      baux: [{ cle: 'D-105|2026-01-01', debut: '2026-01-01', fin: null, finEffective: null, archive: false, hc: 900, ch: 50, noms: 'L' }],
      paiements: [vir('p1', '2026-01-04', 950), Object.assign(vir('g1', '2026-05-20', 1900), { kind: 'gli' })]
    };
    const x = verifier(lot, '2026-06-15');
    expect(x.bulle).toBe(4750);                                  // février → juin, 5 × 950, GLI ignorée
    expect(x.s.mois['2026-05'].couvertGli).toBe(1900);
  });

  it('lot VIDE dont l\'ancien locataire parti doit 750 € (Q2) : pastille et matrice en retard, comme la bulle', () => {
    const lot = {
      ref: 'F-Local', bareme: [], manques: [],
      baux: [{ cle: 'F-Local|2026-01-01', debut: '2026-01-01', fin: '2028-12-31', finEffective: '2026-08-31', archive: true, hc: 235, ch: 15, noms: 'Sorti' }],
      paiements: ['01', '02', '03', '04', '05'].map((m) => vir('p' + m, '2026-' + m + '-03', 250))
    };
    const x = verifier(lot, '2026-10-05');
    expect(x.bulle).toBe(750);
    const s = x.s;
    const strip = new Function('window', '_finSuiviLot', `${extrait('_suiviLoyerStrip')}\nreturn _suiviLoyerStrip;`)({ SuiviLoyers: SL }, () => s);
    const pastille = new Function('window', '_suiviLoyerStrip', '_lotEstLoue', 'fmt', '_isLoyerCategory',
      `${extrait('_v4ComputeLotStatus')}\nreturn _v4ComputeLotStatus;`)({}, strip, () => false, (n) => String(n), () => true);
    const log = { ref: 'F-Local', hc: 235, ch: 15, locataire: '' };
    expect(pastille(log, '2026', '')).toMatchObject({ cls: 'imp', retard: 750, vacant: true, parti: true });
    expect(pastille(log, '2026', '9')).toMatchObject({ retard: 750, parti: true });
    expect(pilotagePay(false, 'F-Local', new Set(['F-Local']), x.bl.solde)).toBe('neg');
    // l'année suivante : plus rien (dette visible l'année de son départ seulement)
    const s27 = SL.suiviLot(lot, { today: '2027-02-15', seuilArrondi: 1 });
    const strip27 = new Function('window', '_finSuiviLot', `${extrait('_suiviLoyerStrip')}\nreturn _suiviLoyerStrip;`)({ SuiviLoyers: SL }, () => s27);
    const p27 = new Function('window', '_suiviLoyerStrip', '_lotEstLoue', 'fmt', '_isLoyerCategory',
      `${extrait('_v4ComputeLotStatus')}\nreturn _v4ComputeLotStatus;`)({}, strip27, () => false, (n) => String(n), () => true);
    expect(p27(log, '2027', '')).toMatchObject({ cls: 'vac', vacant: true });
  });

  it('300 lots aléatoires (graine fixe) : bulle = Finances = Loyers = frise = pastille = pilotage, au centime', () => {
    const rnd = prng(0xB6A1);
    let enRetard = 0, enAvance = 0;
    for (let n = 0; n < 300; n++) {
      const { lot, today } = lotAleatoire(rnd, n);
      const x = verifier(lot, today);
      if (x.lm.retard > 0.5) enRetard++;
      if (x.bl.solde > 0.5) enAvance++;
    }
    expect(enRetard).toBeGreaterThan(100);
    expect(enAvance).toBeGreaterThan(10);
  });
});

// ── 3. Câblage ──────────────────────────────────────────────────────────────────────────
describe('P6 — câblage : l\'ancien calcul « bandeau » n\'est plus appelé', () => {
  const app = ['js/app/app-part1.js', 'js/app/app-part2.js', 'js/app/app-part3.js'].map((f) => readFileSync(resolve(ROOT, f), 'utf8')).join('\n');
  const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');

  it('aucun appel à _computeLoyerStatut / _computeLoyerCumul / _loyerSoldeAjuste / _loyerChipVerdict dans l\'app ni dans js/core hors de leur module', () => {
    const ANCIENS = /\b(_computeLoyerStatut|_computeLoyerCumul|_loyerSoldeAjuste|_loyerChipVerdict)\s*\(/;
    expect(code(app)).not.toMatch(ANCIENS);
    expect(code(html)).not.toMatch(ANCIENS);
    const core = ['suivi-loyers.js', 'finances-monthly.js', 'pilotage-familles.js', 'loyers-mois.js', 'loyer-du-mois.js', 'quittances-actives.js', 'gestion-dg-impayes.js', 'quittance-editeur.js', 'suivi-fenetre.js']
      .map((f) => readFileSync(resolve(ROOT, 'js/core', f), 'utf8')).join('\n');
    expect(code(core)).not.toMatch(ANCIENS);
    expect(code(app)).not.toMatch(/window\._computeLoyerStatut|window\._loyerChipVerdict/);
  });

  it('_suiviLoyerStrip lit le suivi de Finances (versFrise) ; plus de pool annuel sur les mouvements', () => {
    const f = extrait('_suiviLoyerStrip');
    expect(f).toMatch(/const s = _finSuiviLot\(log\.ref\);/);
    expect(f).toMatch(/SL\.versFrise\(s, parseInt\(yr, 10\), \{ monthlyFull \}\)/);
    expect(f).not.toMatch(/DB\.mouvements|totalPaid|_getActiveBailHcChProrated/);
  });

  it('_v4ComputeLotStatus et le bandeau « Tous les loyers » passent par _suiviLoyerStrip ; le chip lit byLot', () => {
    expect(extrait('_v4ComputeLotStatus')).toMatch(/const s = _suiviLoyerStrip\(log, yr\);/);
    const b = extrait('_lyTousLoyersHtml');
    expect(b).toMatch(/_suiviLoyerStrip\(l, yr\)/);
    expect(b).toMatch(/_finMonthly\(parseInt\(yr, 10\), _sc, _W \? _W\.constat : undefined\)/);
    expect(b).toMatch(/typeof window\.SuiviLoyers\.versFrise !== 'function'/);
    expect(code(b)).not.toMatch(/_computeLoyerStatut|_loyerChipVerdict/);
    // un lot dont seul un locataire PARTI doit encore (visible l'année de son départ) reste dans le bandeau
    expect(b).toMatch(/_lotEstLoue\(l\) \|\| _lyDetteVisible\(l\.ref\)/);
  });

  it('Accueil / KPI / Pilotage : bulle, matrice, téléphone lisent byLot de _finMonthly (suivi injecté)', () => {
    expect(extrait('_computeImpayes')).toMatch(/const r = _finMonthly\(refY, scope, W \? W\.constat : undefined\);/);
    expect(extrait('_pilCollectFamilles')).toMatch(/_computeImpayes\(ctx\)/);
    expect(extrait('_pilColRefs')).toMatch(/_computeImpayes\(ctx\)/);
    expect(extrait('_renderPilMatrice')).toMatch(/_finMonthly\(parseInt\(yr, 10\), scope, W \? W\.constat : undefined\)/);
    expect(extrait('_pilLotLigne')).toMatch(/window\.pilotagePay\(_loue, l\.ref, impayeRefs, _soldeSigned\)/);
    expect(extrait('_renderAccueilPhone')).toMatch(/_finMonthly\(parseInt\(yr, 10\), _scPh, _WPh \? _WPh\.constat : undefined\)/);
    expect(extrait('_finMonthly')).toMatch(/suivi: \(window\.SuiviLoyers && typeof window\.SuiviLoyers\.suiviLot === 'function'\) \? _finSuiviLots\(scope\) : undefined/);
  });
});
