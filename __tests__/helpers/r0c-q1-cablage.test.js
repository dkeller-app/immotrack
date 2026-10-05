/**
 * R0-C · Q1 RÉVISÉ — CÂBLAGE (🟠1 de l'audit du 30/09) : le VRAI code de l'app (js/app/app-part1.js et
 * app-part2.js), EXÉCUTÉ tel qu'il est écrit, avec les vrais modules du cœur.
 *
 *  - `_finBailHcChAt` lit le point de départ du suivi (`_finLotSuivi` → js/core/anteriorite.js) et le
 *    dû par `duMoisSuiviFromRaw` ;
 *  - `_finMonthly` transmet `debutDu` (jamais pour la date provisoire) et le solde d'ouverture ;
 *  - (b) PREUVE : sans date d'achat ni antériorité saisie, chaque mois de dû et chaque sortie de
 *    `_finMonthly` sont IDENTIQUES à l'ancien chemin (le même code sans le module = la règle d'avant),
 *    sur 30 parcs multi-lots / multi-baux ;
 *  - `_computeExpectedRent` (🟠2) lit la même règle ;
 *  - `_finDetteBail` donne à la dette d'un bail le même point de départ et la même ouverture.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as Anteriorite from '../../js/core/anteriorite.js';
import { duMoisFromRaw, duMoisSuiviFromRaw, bailsFromRaw } from '../../js/core/loyer-du-mois.js';
import { _computeFinancesMonthly, _computeDetteBail } from '../../js/core/finances-monthly.js';
import { computeConstatWindow } from '../../js/core/finances-window.js';
import { jeuMultiLots, catLigne, estLoyer, ymRange } from './r0c-jeux.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const F1 = ['_findBailByRefTolerant', '_getAllBailsForLog', '_getLogementStartIso', '_getLogementStartMi', '_duMoisLot',
  '_getActiveBailHcChProratedSplit', '_getActiveBailHcChProrated', '_computeExpectedRent'];
const F2 = ['_finLotStartMi', '_finImmDuLot', '_finDuRaw', '_finLotSuivi', '_finBailHcChAt', '_finActiveLotsInScope',
  '_finLotOccupe', '_finIsRecupACharge', '_finDetteBail', '_finMonthly'];
const SRC = F1.map((n) => extraireFonction(P1, n)).concat(F2.map((n) => extraireFonction(P2, n))).join('\n');

/** Monte le vrai code autour d'un DB ; `avecModule:false` = le même code SANS le module (= règle d'avant). */
function monter(DB, { avecModule = true } = {}) {
  const window = {
    _dbGen: 1, duMoisFromRaw, duMoisSuiviFromRaw, bailsFromRaw, _computeFinancesMonthly, _computeDetteBail,
    _anteriorite: avecModule ? Anteriorite : undefined
  };
  const deps = {
    DB, window,
    _isLoyerCategory: estLoyer,
    _finCatLigne: catLigne,
    _finCatMere: (c) => (c === 'Prêt' ? { nom: 'Prêt' } : c === 'Eau (récupérable)' ? { nom: c, recup: true } : null),
    _finScopeWeight: (scope, m) => ((!m || m._deleted) ? 0 : 1)
  };
  const noms = Object.keys(deps);
  const lets = 'let _finLotStartCache = { gen: -1, map: {} }; let _finLotSuiviCache = { gen: -1, map: {} }; let _finMonthlyCache = { gen: -1, m: new Map() };\n';
  const exp = '\nreturn { ' + F1.concat(F2).join(', ') + ' };';
  return new Function(...noms, lets + SRC + exp)(...noms.map((n) => deps[n]));
}

/** Un parc multi-lots du générateur → DB de l'app (immeuble, logements, bail courant, archives, barème). */
function dbDe(seed, { dateAcq = null } = {}) {
  const { lots, mouvements } = jeuMultiLots(seed);
  const DB = { entites: [{ nom: 'SCI T', immeubles: [{ nom: 'Imm', dateAcquisition: dateAcq }] }], logements: [], baux: {}, baux_historique: [], loyerBareme: [], mouvements };
  for (const l of lots) {
    DB.logements.push({ ref: l.ref, imm: 'Imm', entity: 'SCI T' });
    const bs = l.ctx.bails;
    bs.forEach((b, k) => {
      const last = k === bs.length - 1;
      if (last && !b.finEffective) DB.baux[l.ref] = { ref: l.ref, debut: b.debut, hc: b.hc, ch: b.ch };
      else DB.baux_historique.push({ ref: l.ref, debut: b.debut, finEffective: b.finEffective || null, fin: b.finEffective || null, hc: b.hc, ch: b.ch });
    });
    DB.loyerBareme.push(...l.ctx.bareme);
  }
  return DB;
}
const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i);
const TODAY = '2026-09-30';
const mois = ymRange('2021-01', '2026-12');

describe('R0-C · (b) PREUVE — sans date saisie, le dû et Finances sont IDENTIQUES à l\'ancien chemin', () => {
  for (const seed of SEEDS) {
    it(`parc ${seed} : _finBailHcChAt mois par mois, puis _finMonthly 2024-2026 (fenêtre + numérique)`, () => {
      const DB = dbDe(seed);
      const neuf = monter(DB), ancien = monter(DB, { avecModule: false });
      for (const l of DB.logements) for (const ym of mois) expect(neuf._finBailHcChAt(l.ref, ym)).toEqual(ancien._finBailHcChAt(l.ref, ym));
      for (const yr of [2024, 2025, 2026]) {
        const win = computeConstatWindow({ year: yr, today: TODAY, mouvements: DB.mouvements });
        expect(JSON.stringify(neuf._finMonthly(yr, null, win))).toBe(JSON.stringify(ancien._finMonthly(yr, null, win)));
        expect(JSON.stringify(neuf._finMonthly(yr, null, 7))).toBe(JSON.stringify(ancien._finMonthly(yr, null, 7)));
      }
    });
  }
  it('la preuve n\'est pas vide : des lots ont un bail commencé avant leur 1ᵉʳ loyer (date provisoire à confirmer)', () => {
    let tronques = 0;
    for (const seed of SEEDS) { const app = monter(dbDe(seed)); dbDe(seed).logements.forEach((l) => { const s = app._finLotSuivi(l.ref); if (s && s.aConfirmer) tronques++; }); }
    expect(tronques).toBeGreaterThan(5);
  });
});

// Ferrette : acheté loué le 01/03/2026, bail de 2018 (650 €), loyers encaissés à partir du 02/03/2026.
function ferrette({ dateAcq = null, anteriorite = null } = {}) {
  return {
    entites: [{ nom: 'SCI S', immeubles: [{ nom: 'Ferrette', dateAcquisition: dateAcq }] }],
    logements: [{ ref: 'F-BAR', imm: 'Ferrette', entity: 'SCI S' }],
    baux: { 'F-BAR': { ref: 'F-BAR', debut: '2018-03-16', fin: '2021-03-15', hc: 650, ch: 0, anteriorite } },
    baux_historique: [], loyerBareme: [],
    mouvements: ymRange('2026-03', '2026-09').map((ym) => ({ qui: 'F-BAR', date: ym + '-02', cat: 'Loyers encaissés', cr: 650, db: 0 }))
  };
}

describe('R0-C · Q1 révisé — le vrai _finBailHcChAt lit le point de départ du suivi', () => {
  it('Ferrette sans date : provisoire au 1ᵉʳ loyer (01/03/2026), à confirmer ; rien n\'est dû avant', () => {
    const app = monter(ferrette());
    expect(app._finLotSuivi('F-BAR')).toMatchObject({ date: '2026-03-01', source: 'provisoire', aConfirmer: true });
    expect(app._finBailHcChAt('F-BAR', '2026-02')).toEqual({ hc: 0, ch: 0 });
    expect(app._finBailHcChAt('F-BAR', '2026-03')).toEqual({ hc: 650, ch: 0 });
  });
  it('date d\'achat le 15/03/2026 : mars proratisé au jour, rien avant ; `debutDu` transmis au moteur', () => {
    const app = monter(ferrette({ dateAcq: '2026-03-15' }));
    expect(app._finLotSuivi('F-BAR')).toMatchObject({ date: '2026-03-15', source: 'acquisition' });
    expect(app._finBailHcChAt('F-BAR', '2026-03').hc).toBe(356.45);   // 650 × 17/31
    expect(app._finBailHcChAt('F-BAR', '2025-12')).toEqual({ hc: 0, ch: 0 });
  });
  it('_finMonthly transmet debutDu et l\'ouverture SAISIS, jamais pour la date provisoire', () => {
    const DB = ferrette({ anteriorite: { date: '2026-03-01', situation: 'arriere', loyer: 1300, charges: 0, mois: ['2026-01', '2026-02'] } });
    const app = monter(DB);
    const r = app._finMonthly(2026, null, computeConstatWindow({ year: 2026, today: TODAY, mouvements: DB.mouvements }));
    expect(r.byLot['F-BAR'].months.reduce((s, m) => s + m.loyerRetard, 0)).toBe(1300);   // l'arriéré noté, une fois
    const prov = monter(ferrette());
    const r0 = prov._finMonthly(2026, null, computeConstatWindow({ year: 2026, today: TODAY, mouvements: ferrette().mouvements }));
    expect(r0.byLot['F-BAR'].months.reduce((s, m) => s + m.loyerRetard, 0)).toBe(0);
  });
  it('🟠2 : _computeExpectedRent = Σ du dû de Finances (une seule règle)', () => {
    const app = monter(ferrette({ dateAcq: '2026-03-15' }));
    const att = app._computeExpectedRent('F-BAR', 2026, 9);
    const sigma = ymRange('2026-01', '2026-09').reduce((s, ym) => { const d = app._finBailHcChAt('F-BAR', ym); return s + d.hc + d.ch; }, 0);
    expect(att).toBe(sigma);
    expect(att).toBe(356.45 + 6 * 650);
  });
  it('_finDetteBail : même point de départ et même solde d\'ouverture que Finances', () => {
    const app = monter(ferrette({ anteriorite: { date: '2026-03-01', situation: 'arriere', loyer: 1300, charges: 0 } }));
    const d = app._finDetteBail('F-BAR', '2018-03-16', null);
    expect(d).toMatchObject({ loyer: 1300, debutSuivi: '2026-03-01', suiviPartiel: true });
  });
});

describe('R0-C 🟠3 — L-5 (« restée à charge ») teste l\'OCCUPATION, plus le dû suivi', () => {
  const eau = (date, qui = 'F-BAR') => ({ qui, date, cat: 'Eau (récupérable)', cr: 0, db: 120 });
  it('un mois occupé mais pas encore suivi (avant le 1ᵉʳ loyer encaissé) est RÉCUPÉRABLE, pas vacant', () => {
    const DB = ferrette();   // bail depuis 2018, 1ᵉʳ loyer en mars 2026, aucune date d'achat
    const app = monter(DB);
    expect(app._finBailHcChAt('F-BAR', '2026-02')).toEqual({ hc: 0, ch: 0 });   // pas suivi…
    expect(app._finIsRecupACharge(eau('2026-02-20'))).toBe(false);              // …mais occupé
  });
  it('avant la date d\'achat, la charge n\'est pas récupérable par le bailleur actuel', () => {
    const app = monter(ferrette({ dateAcq: '2026-03-01' }));
    expect(app._finIsRecupACharge(eau('2026-02-20'))).toBe(true);
    expect(app._finIsRecupACharge(eau('2026-03-20'))).toBe(false);
  });
  it('un vrai mois de vacance (aucun bail) reste à charge ; un lot « compte charges » désactivé aussi', () => {
    const DB = ferrette(); DB.baux['F-BAR'].finEffective = '2026-05-31';
    expect(monter(DB)._finIsRecupACharge(eau('2026-07-10'))).toBe(true);
    const DB2 = ferrette(); DB2.logements[0].compteCharges = false;
    expect(monter(DB2)._finIsRecupACharge(eau('2026-04-10'))).toBe(true);
  });
  it('niveau immeuble : « à charge » seulement si AUCUN lot n\'est occupé ce mois-là', () => {
    const app = monter(ferrette());
    expect(app._finIsRecupACharge({ qui: '', imm: 'Ferrette', date: '2026-02-10', cat: 'Eau (récupérable)', db: 300, cr: 0 })).toBe(false);
  });
});
