/**
 * L-5 (P&L Finances : charge récupérable « restée à ta charge ») et RÉGULARISATION (computeRegul) lisent la
 * MÊME occupation — sinon une charge d'un jour occupé pour l'une et vacant pour l'autre n'est ni récupérée
 * (régul : au bailleur) ni déduite (L-5 : « récupérable »), ou l'inverse.
 *
 * Source unique : `_getAllBailsForLog` (fin = `_bailFinOccupation` : tacite reconduction, départ déclaré,
 * clôture). `_finLotOccupe` la lit à la DATE de la charge (lot précis), comme le chemin 2 de la régul.
 * Exception VOULUE : avant la date d'achat (`_finLotSuivi().jouissance`), rien n'est récupérable par le
 * bailleur actuel (garde-fou R0-C), même si la régul voit le bail repris.
 *
 * Vraies fonctions (js/app/app-part1.js + app-part2.js) et vrai module js/core/anteriorite.js.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as Anteriorite from '../../js/core/anteriorite.js';
import { finOccupationBail } from '../../js/core/loyer-du-mois.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const F1 = ['_isoLocal', '_bailTypeHasTacite', '_bailFinOccupation', '_findBailByRefTolerant', '_getAllBailsForLog',
  '_getLogementStartIso', 'computeRegul'];
const F2 = ['_ccLogOccupations', '_ccLogsInScope', '_ccApplyCleSimple', '_ccApplySousCompteurs', '_calcCcRepartition',
  '_finImmDuLot', '_finDuRaw', '_finLotSuivi', '_finLotOccupe', '_finIsRecupACharge'];
const SRC = F1.map((n) => extraireFonction(P1, n)).concat(F2.map((n) => extraireFonction(P2, n))).join('\n');

const IMM = 'Tilleuls', REF = 'TIL-A1';
const RECUP = 'Charges récupérables (eau, énergie…)';

function monter(DB) {
  const deps = {
    DB, window: { _dbGen: 1, _anteriorite: Anteriorite, finOccupationBail },
    _isAlive: (x) => !!x && !x._deleted,
    _isLoyerCategory: (c) => c === 'Loyers encaissés',
    _isChargeRecupCategory: (c) => c === RECUP,
    _catLigne2044: () => null,
    CC_REPARTITION_LABELS: {}, fd: (s) => s, fmtN: String, _ccType: () => ({}), _ccConsoLogPeriod: () => 0,
  };
  const noms = Object.keys(deps);
  // eslint-disable-next-line no-new-func
  return new Function(...noms, 'let _finLotSuiviCache = { gen: -1, map: {} };\n' + SRC + '\nreturn { computeRegul, _finIsRecupACharge, _finLotOccupe };')(...noms.map((n) => deps[n]));
}

/** Une charge directe le 1er, le 15 et le dernier jour de chaque mois de 2026 (bornes comprises). */
function charges() {
  const out = []; let id = 1;
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const fin = new Date(2026, m, 0).getDate();
    for (const j of ['01', '15', String(fin)]) out.push({ id: id++, date: `2026-${mm}-${j}`, cat: RECUP, db: 10, qui: REF, imm: IMM, lib: 'Eau' });
  }
  return out;
}
const dbDe = ({ baux = {}, historique = [], logement = {} }) => ({
  logements: [{ ref: REF, imm: IMM, entity: 'SCI', ...logement }], baux, baux_historique: historique, mouvements: charges(),
  entites: [{ nom: 'SCI', immeubles: [{ nom: IMM, compteursCollectifs: [] }] }],
});

/** Pour chaque charge : occupée selon la régul (imputée à un locataire) et selon L-5 (récupérable). */
function lectures(DB) {
  const f = monter(DB);
  const res = f.computeRegul('2026-01-01', '2026-12-31');
  const imputees = new Set(Object.values(res.entries).flatMap((e) => e.details.map((d) => d.mvId)));
  return DB.mouvements.map((m) => ({ date: m.date, regul: imputees.has(m.id), l5: !f._finIsRecupACharge(m) }));
}
const desaccords = (l) => l.filter((x) => x.regul !== x.l5).map((x) => `${x.date} régul:${x.regul} L-5:${x.l5}`);

describe('L-5 et régularisation : une seule occupation, au jour près', () => {
  it('bail nu reconduit tacitement (échéance 30/06/2026 passée) : toute l\'année occupée des deux côtés', () => {
    const l = lectures(dbDe({ baux: { [REF]: { type: 'nu', debut: '2023-07-01', fin: '2026-06-30', hc: 500, ch: 100, locataires: [{ nom: 'T' }] } } }));
    expect(desaccords(l)).toEqual([]);
    expect(l.every((x) => x.regul)).toBe(true);
  });

  it('bail clos au 31/03 : occupé jusqu\'au 31/03 inclus, vacant dès le 01/04 — des deux côtés', () => {
    const l = lectures(dbDe({ historique: [{ ref: REF, type: 'nu', debut: '2024-01-01', fin: '2027-12-31', finEffective: '2026-03-31', cloture: true, hc: 500, ch: 100 }] }));
    expect(desaccords(l)).toEqual([]);
    expect(l.find((x) => x.date === '2026-03-31').l5).toBe(true);
    expect(l.find((x) => x.date === '2026-04-01').l5).toBe(false);
  });

  it('départ déclaré au 31/08 (bail encore en cours) : vacant dès le 01/09 — des deux côtés', () => {
    const l = lectures(dbDe({ baux: { [REF]: { type: 'nu', debut: '2023-07-01', fin: '2026-06-30', hc: 500, ch: 100, depart: { dateSortie: '2026-08-31' } } } }));
    expect(desaccords(l)).toEqual([]);
    expect(l.find((x) => x.date === '2026-08-31').l5).toBe(true);
    expect(l.find((x) => x.date === '2026-09-01').l5).toBe(false);
  });

  it('vacance entre deux baux (A → 31/03, B ← 01/06) : avril et mai vacants des deux côtés', () => {
    const l = lectures(dbDe({
      baux: { [REF]: { type: 'nu', debut: '2026-06-01', fin: '', hc: 500, ch: 100 } },
      historique: [{ ref: REF, type: 'nu', debut: '2024-01-01', fin: '2026-03-31', hc: 500, ch: 100 }],
    }));
    expect(desaccords(l)).toEqual([]);
    expect(l.filter((x) => !x.l5).map((x) => x.date.slice(0, 7))).toEqual(['2026-04', '2026-04', '2026-04', '2026-05', '2026-05', '2026-05']);
  });

  it('bail ÉTUDIANT échu au 31/05, non clôturé : même règle des deux côtés (fin contractuelle)', () => {
    const l = lectures(dbDe({ baux: { [REF]: { type: 'etudiant', debut: '2025-09-01', fin: '2026-05-31', hc: 500, ch: 100 } } }));
    expect(desaccords(l)).toEqual([]);
  });

  it('achat le 01/04/2026, bail repris : d\'accord à partir de l\'achat ; avant, rien de récupérable par le bailleur actuel (voulu)', () => {
    const l = lectures(dbDe({
      baux: { [REF]: { type: 'nu', debut: '2020-01-01', fin: '', hc: 500, ch: 100 } },
      logement: { detenuDepuis: '2026-04-01' },
    }));
    expect(desaccords(l.filter((x) => x.date >= '2026-04-01'))).toEqual([]);
    expect(l.filter((x) => x.date < '2026-04-01').every((x) => x.l5 === false)).toBe(true);
  });
});
