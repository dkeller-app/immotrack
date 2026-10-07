/**
 * FINANCES-SUIVI-UNIQUE P7 — le code mort des anciens moteurs est SUPPRIMÉ.
 *
 * 1. ABSENCE des anciens appels / symboles dans js/ (hors commentaires) et des expositions window.* ;
 * 2. la passe FISCALE de `_computeFinancesMonthly` est identique au centime à la copie FIGÉE d'avant
 *    suppression (docs/subjects/FINANCES-SUIVI-UNIQUE/legacy/), avec ET sans suivi, ≥ 300 jeux aléatoires ;
 *    avec le suivi injecté, TOUT le reste (retard, avance de suivi, écart, byLot, lotsEnRetard) l'est aussi ;
 * 3. sans suivi (module absent) : retard / avance de suivi / écart / byLot valent 0 / vide, le fiscal reste exact.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as statut from '../../js/core/loyer-statut.js';
import * as loyersMois from '../../js/core/loyers-mois.js';
import * as dueMois from '../../js/core/loyer-du-mois.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';
import { _computeFinancesMonthly as legacyFinances } from '../../docs/subjects/FINANCES-SUIVI-UNIQUE/legacy/finances-monthly.legacy.mjs';
import { suiviLot } from '../../js/core/suivi-loyers.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { prng, lotAleatoire, lotArslan, TODAY_ARSLAN } from './suivi-loyers-fixtures.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lire = (f) => readFileSync(resolve(ROOT, f), 'utf8');
// Code seul : sans commentaires de ligne ni de bloc (les notes historiques citent encore les anciens noms).
const code = (f) => lire(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
const JS = ['js/main.js', 'js/app/app-part1.js', 'js/app/app-part2.js', 'js/app/app-part3.js',
  'js/core/finances-monthly.js', 'js/core/loyer-statut.js', 'js/core/loyers-mois.js', 'js/core/loyer-du-mois.js', 'js/core/suivi-loyers.js'];
const SUPPRIMES = ['_computeLoyerStatut', '_computeLoyerCumul', '_loyerSoldeAjuste', '_loyerChipVerdict', '_loyerSplitCascade',
  '_computeLoyerArrears', '_computeLoyerNetting', '_debutSuivi', 'etatMoisLot', '_openingOf'];

describe('P7 — les anciens moteurs sont supprimés (absence, pas seulement non-appel)', () => {
  for (const nom of SUPPRIMES) {
    it(nom + ' n\'existe plus dans le code de js/ (ni appel, ni exposition window.*)', () => {
      for (const f of JS) expect(code(f), f).not.toMatch(new RegExp('(?<![\\w$])' + nom + '(?![\\w$])'));
    });
  }
  it('loyer-statut.js ne garde que la passe fiscale, l\'horloge locale et la tolérance du 10', () => {
    expect(Object.keys(statut).sort()).toEqual(['_LOYER_TOLERANCE_JOUR', '_computeLoyerChargeAlloc', '_loyerTodayLocal', '_loyerToleranceActive']);
  });
  it('loyers-mois.js n\'exporte plus de recalcul d\'état (etatMoisLot) : il LIT la forme d\'état', () => {
    expect(loyersMois.etatMoisLot).toBeUndefined();
    for (const k of ['peutQuittancer', 'moisAQuittancer', 'retardLot', 'lignesRelance', 'datePaiementMois', 'ymRange']) expect(typeof loyersMois[k]).toBe('function');
  });
  it('loyer-du-mois.js : ni _debutSuivi ni _computeLoyerNetting ; la passe et le dû restent', () => {
    expect(dueMois._debutSuivi).toBeUndefined();
    expect(dueMois._computeLoyerNetting).toBeUndefined();
    expect(typeof dueMois._loyerArrearsPass).toBe('function');
    expect(typeof dueMois.duMois).toBe('function');
  });
  it('finances-monthly.js n\'importe plus le netting ni la tolérance : il lit le suivi et garde la passe fiscale', () => {
    const src = code('js/core/finances-monthly.js');
    expect(src).not.toMatch(/loyer-du-mois\.js/);
    expect(src).not.toMatch(/_LOYER_TOLERANCE_JOUR/);
    expect(src).toMatch(/_computeLoyerChargeAlloc/);
    expect(src).toMatch(/versByLot/);
  });
  it('main.js n\'importe ni n\'expose plus aucun symbole supprimé ; les règles vivantes restent exposées', () => {
    const main = lire('js/main.js');
    for (const nom of SUPPRIMES) expect(main).not.toMatch(new RegExp('window\\.' + nom + '\\b'));
    for (const k of ['_computeLoyerChargeAlloc', '_loyerToleranceActive', '_loyerTodayLocal', '_LOYER_TOLERANCE_JOUR']) expect(main).toMatch(new RegExp('window\\.' + k + ' = '));
  });
  it('l\'app ne garde aucun repli « ancien netting » : le commentaire de _finMonthly dit retard = 0 sans module', () => {
    expect(lire('js/app/app-part2.js')).not.toMatch(/repli jusqu'à P7/);
  });
});

// ── La passe fiscale et le suivi injecté : identiques à la copie figée d'avant suppression ──────
const FISC = ['loyersBrut', 'loyersHC', 'provisions', 'avance', 'rattrapage', 'recettesDiverses', 'base2044', 'duHC', 'duCH', 'reel', 'cashflowReel', 'charges', 'recup', 'recupSolde'];
const catLigne = (cat) => ({ Loyer: { ligne2044: '211', type: 'recette' }, GLI: { ligne2044: '213', type: 'recette' }, Taxe: { ligne2044: '227', type: 'charge' } }[cat] || null);
const mouvementsDe = (lot) => lot.paiements.map((p) => ({
  id: p.id, date: p.date, qui: lot.ref, cat: p.kind === 'gli' ? 'GLI' : 'Loyer', cr: p.montant > 0 ? p.montant : 0, db: p.montant < 0 ? -p.montant : 0
}));
const loyerDueDe = (lots) => (qui, ym) => {
  const l = lots.find((x) => x.ref === qui);
  if (!l) return { hc: 0, ch: 0 };
  const d = duMois({ ref: l.ref, bails: l.baux, bareme: l.bareme }, ym);
  return { hc: d.hc || 0, ch: d.ch || 0 };
};
const entrees = (lots, today, suivi, extraMv) => {
  const mo = parseInt(today.slice(5, 7), 10);
  return {
    mouvements: lots.flatMap(mouvementsDe).concat(extraMv || []), year: today.slice(0, 4), scope: null, scopeWeight: () => 1,
    catLigne, isEcheance: () => false, loyerDue: loyerDueDe(lots), activeLots: lots.map((l) => l.ref),
    window: { lastMonth: mo, dueMonth: mo, today }, today, suivi
  };
};
const suivis = (lots, today) => lots.map((l) => suiviLot(l, { today, graceLast: parseInt(today.slice(8, 10), 10) < 10 }));

describe('P7 — finances-monthly : fiscal inchangé au centime vs la copie figée d\'avant suppression', () => {
  const compareFiscal = (a, b) => {
    for (const k of FISC) {
      expect(b.annual[k], 'annuel ' + k).toBe(a.annual[k]);
      a.months.forEach((m, i) => expect(b.months[i][k], m.ym + ' ' + k).toBe(m[k]));
    }
    expect(b.months.map((m) => m.ym)).toEqual(a.months.map((m) => m.ym));
  };
  it('cas Arslan + une charge, sans suivi : fiscal identique', () => {
    const lots = [lotArslan()];
    const e = entrees(lots, TODAY_ARSLAN, undefined, [{ id: 't1', date: '2026-09-15', qui: 'Ferrette - 101', cat: 'Taxe', cr: 0, db: 812 }]);
    compareFiscal(legacyFinances(e), _computeFinancesMonthly(e));
  });
  it('≥ 300 jeux aléatoires : fiscal identique SANS suivi ; AVEC suivi, tout (retard, avance, écart, byLot, lotsEnRetard) identique', () => {
    const rnd = prng(77);
    for (let n = 0; n < 300; n++) {
      const nb = 1 + Math.floor(rnd() * 3);
      const gen = Array.from({ length: nb }, (_, k) => lotAleatoire(rnd, n * 10 + k));
      const today = gen.map((g) => g.today).sort().pop();
      const lots = gen.map((g) => g.lot);
      compareFiscal(legacyFinances(entrees(lots, today, undefined)), _computeFinancesMonthly(entrees(lots, today, undefined)));
      const avecSuivi = entrees(lots, today, suivis(lots, today));
      expect(_computeFinancesMonthly(avecSuivi)).toEqual(legacyFinances(avecSuivi));
    }
  });
});

describe('P7 — sans suivi injecté (module absent) : plus de repli, le P&L fiscal reste exact', () => {
  it('retard, avance de suivi, écart, byLot et lotsEnRetard valent 0 / vide ; le dû et l\'encaissé restent rendus', () => {
    const lots = [lotArslan()];
    const r = _computeFinancesMonthly(entrees(lots, TODAY_ARSLAN, undefined));
    expect(r.byLot).toEqual({});
    expect(r.lotsEnRetard).toEqual([]);
    for (const m of r.months.concat([r.annual])) {
      expect(m.loyerRetard).toBe(0); expect(m.chargeRetard).toBe(0); expect(m.avanceLot).toBe(0); expect(m.ecart).toBe(0);
    }
    expect(r.annual.loyersBrut).toBeGreaterThan(0);
    expect(r.annual.duHC + r.annual.duCH).toBeGreaterThan(0);
  });
});
