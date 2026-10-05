/**
 * R0-C — 2ᵉ audit 🟠3 : l'onglet Loyers, les relances et les quittances (`_loyerEtatLot`) lisent le
 * MÊME point de départ, le MÊME dû, la MÊME ouverture et la MÊME règle des encaissements d'avant que
 * Finances et la dette du bail. VRAI code de l'app (js/app/app-part1.js / app-part2.js) exécuté avec
 * les vrais modules du cœur.
 *
 * Avant : `_loyerEtatLot` partait du 1ᵉʳ janvier de l'année du 1ᵉʳ loyer (`_debutSuivi`), ignorait la
 * date d'achat et l'antériorité (mesuré : Ferrette-101 à 2 800 € dans l'onglet Loyers contre 2 100 €
 * dans Finances ; 55 125 € contre 34 244 € sur la sauvegarde réelle). Les relances sont des actes
 * opposables : elles ne réclament plus que la dette de Finances.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as Anteriorite from '../../js/core/anteriorite.js';
import { duMoisFromRaw, duMoisSuiviFromRaw, bailsFromRaw, _debutSuivi } from '../../js/core/loyer-du-mois.js';
import { _computeFinancesMonthly, _computeDetteBail, _avantBorne } from '../../js/core/finances-monthly.js';
import { computeConstatWindow } from '../../js/core/finances-window.js';
import { etatMoisLot, ymRange as ymRangeCore, retardLot, lignesRelance, moisAQuittancer } from '../../js/core/loyers-mois.js';
import { jeuAnteriorite, dbAppDe, catLigne, estLoyer, ymRange } from './r0c-jeux.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const F1 = ['_findBailByRefTolerant', '_getAllBailsForLog', '_getLogementStartIso', '_getLogementStartMi', '_duMoisLot',
  '_getActiveBailHcChProratedSplit', '_getActiveBailHcChProrated', '_loyerEtatLot'];
const F2 = ['_finLotStartMi', '_finImmDuLot', '_finDuRaw', '_finLotSuivi', '_finBailHcChAt', '_finActiveLotsInScope',
  '_finLotOccupe', '_finIsRecupACharge', '_finDetteBail', '_finMonthly'];
const SRC = F1.map((n) => extraireFonction(P1, n)).concat(F2.map((n) => extraireFonction(P2, n))).join('\n');

function monter(DB, today, { avecModule = true } = {}) {
  const window = {
    _dbGen: 1, duMoisFromRaw, duMoisSuiviFromRaw, bailsFromRaw, _debutSuivi, etatMoisLot, ymRange: ymRangeCore,
    _loyerTodayLocal: () => today,
    _computeFinancesMonthly: (i) => _computeFinancesMonthly({ today, ...i }), _computeDetteBail: (i) => _computeDetteBail({ today, ...i }),
    _anteriorite: avecModule ? Anteriorite : undefined, _avantBorne: avecModule ? _avantBorne : undefined
  };
  const deps = { DB, window, _isLoyerCategory: estLoyer, _finCatLigne: catLigne,
    _finCatMere: () => null, _finScopeWeight: (s, m) => ((!m || m._deleted) ? 0 : 1) };
  const noms = Object.keys(deps);
  const lets = 'let _finLotStartCache = { gen: -1, map: {} }; let _finLotSuiviCache = { gen: -1, map: {} }; let _finMonthlyCache = { gen: -1, m: new Map() };\n';
  return new Function(...noms, lets + SRC + '\nreturn { ' + F1.concat(F2).join(', ') + ' };')(...noms.map((n) => deps[n]));
}
const pay = (qui, date, cr = 700) => ({ qui, date, cat: 'Loyers encaissés', cr, db: 0 });
const lot = ({ dateAcq = null, anteriorite = null, debut = '2018-03-16', hc = 700 } = {}) => ({
  entites: [{ nom: 'SCI S', immeubles: [{ nom: 'Imm', dateAcquisition: dateAcq }] }],
  logements: [{ ref: 'L', imm: 'Imm', entity: 'SCI S' }],
  baux: { L: { ref: 'L', debut, hc, ch: 0, anteriorite } }, baux_historique: [], loyerBareme: [], mouvements: []
});
const TODAY = '2026-09-30';
const trois = (app, DB, today = TODAY, ref = 'L', bailDebut = '2018-03-16') => {
  const y = Number(today.slice(0, 4));
  const grace = Number(today.slice(8, 10)) < 10;
  const f = app._finMonthly(y, null, computeConstatWindow({ year: y, today, mouvements: DB.mouvements })).byLot[ref];
  const e = app._loyerEtatLot(ref, { graceLast: grace });
  const d = app._finDetteBail(ref, bailDebut, null);
  return { loyers: e.reste, finances: f ? f.annual.retard : 0, dette: Math.round((d.loyer + d.charge) * 100) / 100, etat: e };
};

describe('🟠3 — onglet Loyers = Finances = dette du bail', () => {
  it('S1 · arriéré de 1 400 € noté au 01/06/2025, loyers importés depuis 01/2024 : 1 400 € partout', () => {
    const DB = lot({ anteriorite: { date: '2025-06-01', situation: 'arriere', loyer: 1400, charges: 0 } });
    DB.mouvements = ymRange('2024-01', '2026-09').map((ym) => pay('L', ym + '-05'));
    const r = trois(monter(DB, TODAY), DB);
    expect(r).toMatchObject({ loyers: 1400, finances: 1400, dette: 1400 });
    expect(r.etat.avance).toBe(0);
    expect(r.etat.list[0].ym).toBe('2025-06');   // la fenêtre part de la date notée
  });
  it('S2 · achat le 15/02/2026, loyers dès mars : 0 € partout (février au vendeur, pas de prorata)', () => {
    const DB = lot({ dateAcq: '2026-02-15' });
    DB.mouvements = ymRange('2026-03', '2026-09').map((ym) => pay('L', ym + '-03'));
    const r = trois(monter(DB, TODAY), DB);
    expect(r).toMatchObject({ loyers: 0, finances: 0, dette: 0 });
    expect(r.etat.list[0].ym).toBe('2026-02');
    expect(r.etat.byYm['2026-02'].vacance).toBe(true);   // rien à quittancer, rien à relancer en février
  });
  it('date provisoire (b) : rien de saisi → l\'onglet Loyers garde EXACTEMENT l\'ancienne fenêtre (1ᵉʳ janvier), comme le maître garde la sienne', () => {
    const DB = lot();   // bail depuis 2018, aucune date saisie, 1ᵉʳ loyer le 05/03/2026
    DB.mouvements = ymRange('2026-03', '2026-09').map((ym) => pay('L', ym + '-05'));
    const app = monter(DB, TODAY);
    expect(app._finLotSuivi('L')).toMatchObject({ source: 'provisoire', date: '2026-03-01' });
    const neuf = app._loyerEtatLot('L'), ancien = monter(DB, TODAY, { avecModule: false })._loyerEtatLot('L');
    expect(JSON.stringify(neuf)).toBe(JSON.stringify(ancien));
    expect(neuf.list[0].ym).toBe('2026-01');
    // écart (b) assumé jusqu'à ce que la date soit saisie : l'onglet Loyers réclame janvier-février, Finances non
    expect(trois(app, DB)).toMatchObject({ loyers: 1400, finances: 0, dette: 0 });
    // … la date d'achat saisie les aligne
    DB.entites[0].immeubles[0].dateAcquisition = '2026-03-01';
    expect(trois(monter(DB, TODAY), DB)).toMatchObject({ loyers: 0, finances: 0, dette: 0 });
  });
  it('A2 · loyer de janvier payé en rattrapage le 09/02 (F-002) : sans date saisie, la quittance de janvier reste due et datée du 09/02, mai impayé n\'est pas quittançable', () => {
    const DB = lot({ debut: '2021-12-07', hc: 410 });
    DB.mouvements = [pay('L', '2026-02-05', 410), pay('L', '2026-02-09', 410), pay('L', '2026-03-05', 410), pay('L', '2026-04-06', 410)];
    const e = monter(DB, TODAY)._loyerEtatLot('L');
    expect(JSON.stringify(e)).toBe(JSON.stringify(monter(DB, TODAY, { avecModule: false })._loyerEtatLot('L')));
    expect(e.byYm['2026-01']).toMatchObject({ solde: true, datePaiement: '2026-02-09' });
    expect(moisAQuittancer(e, [])).not.toContain('2026-05');
  });
  it('A3 · bail clos en 2024, jamais saisi, aucun loyer : aucune relance fantôme (rien ne bouge)', () => {
    const DB = lot();
    DB.baux = {};
    DB.baux_historique = [{ ref: 'L', debut: '2023-04-01', fin: '2024-03-31', finEffective: '2024-03-31', hc: 530, ch: 0 }];
    const neuf = monter(DB, TODAY)._loyerEtatLot('L'), ancien = monter(DB, TODAY, { avecModule: false })._loyerEtatLot('L');
    expect(JSON.stringify(neuf)).toBe(JSON.stringify(ancien));
    expect(lignesRelance(neuf, {})).toEqual([]);
  });
  it('(b) PREUVE sur 30 parcs multi-lots sans date saisie : l\'onglet Loyers, les relances et les quittances sont IDENTIQUES à l\'ancien chemin', () => {
    let lots = 0;
    for (let seed = 1000; seed < 1030; seed++) {
      const DB = dbAppDe(seed);
      const neuf = monter(DB, TODAY), ancien = monter(DB, TODAY, { avecModule: false });
      for (const l of DB.logements) {
        const a = neuf._loyerEtatLot(l.ref), b = ancien._loyerEtatLot(l.ref);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(lignesRelance(a, {})).toEqual(lignesRelance(b, {}));
        expect(moisAQuittancer(a, [])).toEqual(moisAQuittancer(b, []));
        lots++;
      }
    }
    expect(lots).toBeGreaterThan(50);
  });
  it('terme payé d\'avance le 28 : noté « avait payé d\'avance » (3ᵉ audit A1), il couvre juin — 0 partout, juin quittançable', () => {
    const DB = lot({ anteriorite: { date: '2025-06-01', situation: 'avance', avance: 700 } });
    DB.mouvements = ymRange('2024-01', '2026-09').map((ym) => pay('L', ym + '-28'));
    const r = trois(monter(DB, '2026-10-20'), DB, '2026-10-20');
    expect(r).toMatchObject({ loyers: 0, finances: 0, dette: 0 });
    expect(r.etat.byYm['2025-06'].solde).toBe(true);
    expect(r.etat.byYm['2026-10'].solde).toBe(true);
    expect(r.etat.avance).toBe(0);
  });
  it('… noté « à jour » à tort : le versement du 28/05 n\'est pas imputé (jamais de réserve) — le dernier terme apparaît dû, partout pareil', () => {
    const DB = lot({ anteriorite: { date: '2025-06-01', situation: 'a-jour' } });
    DB.mouvements = ymRange('2024-01', '2026-09').map((ym) => pay('L', ym + '-28'));
    expect(trois(monter(DB, '2026-10-20'), DB, '2026-10-20')).toMatchObject({ loyers: 700, finances: 700, dette: 700 });
  });
  it('avance notée (560 €) : elle couvre les premiers mois, comme dans Finances', () => {
    const DB = lot({ anteriorite: { date: '2026-03-01', situation: 'avance', avance: 560 } });
    DB.mouvements = ymRange('2026-03', '2026-09').map((ym) => pay('L', ym + '-05', ym === '2026-03' ? 140 : 700));
    const r = trois(monter(DB, TODAY), DB);
    expect(r).toMatchObject({ loyers: 0, finances: 0, dette: 0 });
  });
});

describe('🟠3 — relances et quittances : l\'arriéré noté est une ligne à part, datée', () => {
  const s1 = (date = '2025-06-01') => {
    const DB = lot({ anteriorite: { date, situation: 'arriere', loyer: 1400, charges: 0 } });
    DB.mouvements = ymRange('2024-01', '2026-09').map((ym) => pay('L', ym + '-05'));
    return monter(DB, '2026-10-05')._loyerEtatLot('L');
  };
  it('la relance réclame « Arriéré de loyer au 01/06/2025 (situation notée) », jamais « loyer de juin 2025 »', () => {
    const e = s1();
    expect(e.ouverture).toMatchObject({ date: '2025-06-01', ym: '2025-06', loyer: 1400, charge: 0 });
    const lignes = lignesRelance(e, { toleranceActive: true });
    expect(lignes).toEqual([{ ym: '2025-06', mois: expect.any(String), libelle: 'Arriéré de loyer au 01/06/2025 (situation notée)', montant: 1400, ouverture: true }]);
    expect(retardLot(e, { toleranceActive: true })).toMatchObject({ enRetard: true, resteLoyer: 1400, reste: 1400, depuisYm: '2025-06' });
  });
  it('le 1ᵉʳ mois suivi, payé, reste quittançable (l\'arriéré noté ne le bloque pas)', () => {
    const e = s1();
    expect(e.byYm['2025-06']).toMatchObject({ solde: true, reste: 0, datePaiement: '2025-06-05' });
    expect(moisAQuittancer(e, [])).toContain('2025-06');
  });
  it('date notée en cours de mois (17/06/2025) : juin sans dû (terme au 01/06), l\'arriéré compte quand même', () => {
    const e = s1('2025-06-17');
    expect(e.byYm['2025-06'].vacance).toBe(true);
    expect(retardLot(e, { toleranceActive: true })).toMatchObject({ enRetard: true, resteLoyer: 1400 });
  });
  it('un arriéré noté soldé plus tard : le paiement qui le solde ne date AUCUN mois', () => {
    const DB = lot({ anteriorite: { date: '2025-06-01', situation: 'arriere', loyer: 700, charges: 0 } });
    DB.mouvements = ymRange('2025-06', '2026-09').map((ym) => pay('L', ym + '-05', ym === '2026-02' ? 1400 : 700));
    const e = monter(DB, TODAY)._loyerEtatLot('L');
    expect(e.reste).toBe(0);
    expect(e.ouverture).toBeNull();
    expect(e.byYm['2025-06'].datePaiement).toBe('2025-06-05');
    expect(e.byYm['2026-02'].datePaiement).toBe('2026-02-05');
  });
});

describe('🟠3 — HARNAIS : sur les jeux « relevés antérieurs à l\'antériorité », l\'onglet Loyers réclame la dette de Finances', () => {
  // Hors périmètre (écarts Q8 épinglés ailleurs) : les contre-passations, que l'onglet Loyers ignore.
  const jeux = Array.from({ length: 160 }, (_, i) => jeuAnteriorite(9100 + i))
    .filter((j) => !j.fin && !j.mouvements.some((m) => m.qui === j.ref && (m.db || 0) > 0));
  const DBde = (j) => ({
    entites: [{ nom: 'SCI S', immeubles: [{ nom: 'Imm', dateAcquisition: j.jouissance }] }],
    logements: [{ ref: j.ref, imm: 'Imm', entity: 'SCI S' }],
    baux: { [j.ref]: Object.assign({ ref: j.ref }, j.ctx.bails[0]) }, baux_historique: [], loyerBareme: j.ctx.bareme,
    mouvements: j.mouvements
  });
  it('le harnais mesure : assez de jeux ouverts, avec dettes', () => {
    expect(jeux.length).toBeGreaterThan(60);
  });
  it('reste de l\'onglet Loyers == retard Finances == dette du bail, au centime', () => {
    const ecarts = [];
    for (const j of jeux) {
      const DB = DBde(j);
      const r = trois(monter(DB, j.today), DB, j.today, j.ref, j.bailDebut);
      if (r.loyers !== r.finances || r.finances !== r.dette) ecarts.push({ ref: j.ref, ...r, etat: undefined });
    }
    expect(ecarts).toEqual([]);
  });
});
