/**
 * FORFAIT DE CHARGES × AVENANT lot 3 (application à la signature) — câblage RÉEL d'index.html.
 *
 * `_avenantAppliquer` (appelée à la signature) et `_avenantRetroMessage` sont extraites d'index.html et
 * branchées sur les vrais modules (registre, planApplication, timeline forfait, recalage du barème).
 * Vérifie : un avenant « forfait seul » est APPLIQUÉ (et plus « document seulement » avec une alerte
 * fausse), sa date d'effet est RECALÉE comme un montant (1ᵉʳ du mois, jamais un mois déjà quittancé),
 * et l'avertissement « effet antérieur » le mentionne.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as AvenantRegistre from '../../js/core/avenant-registre.js';
import { bailForfaitActifLe } from '../../js/core/avenant.js';
import { forfaitAvenantsDuBail } from '../../js/core/regul-forfait.js';
import { clampDateEffet } from '../../js/core/loyer-bareme.js';

let html;
beforeAll(() => { html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8').replace(/\r/g, ''); });
const corpsDe = (src, nom) => {
  const m = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm').exec(src);
  if (!m) throw new Error('fonction introuvable : ' + nom);
  return src.slice(m.index, src.indexOf('\n}', m.index) + 2);
};
const varDe = (src, nom) => {
  const m = new RegExp('^var\\s+' + nom + '\\s*=\\s*\\{[^\\n]*\\};', 'm').exec(src);
  if (!m) throw new Error('variable introuvable : ' + nom);
  return m[0];
};

const FORFAIT = 'Passage au forfait de charges';
function charger(DB, { aujourdhui = '2026-10-15', dernierMoisQuittance = null } = {}) {
  const window = { AvenantRegistre, bailForfaitActifLe, forfaitAvenantsDuBail, _baremeClampDateEffet: clampDateEffet, _bailModifBorneMinEffet: () => '' };
  const src = varDe(html, '_AV_LBL') + '\n' + varDe(html, '_AV_CHAMP_LBL') + '\n'
    + ['_forfaitAvenantsDuBail', '_forfaitAvantAvenant', '_avenantAppliquer', '_avenantRetroMessage'].map((n) => corpsDe(html, n)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function('window', 'DB', 'td', '_todayIsoLocal', '_dernierMoisQuittanceYm', 'fd',
    src + '\nreturn { _avenantAppliquer, _avenantRetroMessage };')(
    window, DB, () => aujourdhui, () => aujourdhui, () => dernierMoisQuittance, (d) => String(d).split('-').reverse().join('/'));
}
const avLot3 = (date) => ({ id: 'av1', type: 'avenant', ref: 'L1', bailDebut: '2025-01-01', no: 1, statut: 'a_signer', aLaSignature: true, date,
  objets: [{ k: 'charges', data: { mode: FORFAIT, montant: '' } }] });
const dbAvec = (av) => ({ baux: { L1: { ref: 'L1', debut: '2025-01-01', hc: 600, ch: 100, type: 'meuble' } }, baux_evenements: [av], bailEvents: [], baux_historique: [], logements: [], loyerBareme: [] });

describe('signature d\'un avenant « passage au forfait » (lot 3)', () => {
  it('appliqué (plus « document seulement »), sans l\'alerte « pas encore pris en compte », flag posé', () => {
    const av = avLot3('2026-07-01'); const DB = dbAvec(av);
    const res = charger(DB)._avenantAppliquer('L1', av);
    expect(res.appliques).toEqual(['Passage au forfait de charges']);
    expect(res.docSeul).toEqual([]);
    expect(res.alertes).toEqual([]);
    expect(res.effet).toBe('2026-07-01');
    expect(DB.baux.L1.chForfait).toBe(true);
    expect(DB.loyerBareme).toEqual([]);   // aucun montant daté au barème
  });
  it('date d\'effet en milieu de mois → recalée au 1ᵉʳ du mois (comme un montant)', () => {
    const av = avLot3('2026-07-15');
    const res = charger(dbAvec(av))._avenantAppliquer('L1', av);
    expect(res.effet).toBe('2026-07-01'); expect(res.ajuste).toBe(true);
  });
  it('jamais sur un mois déjà quittancé (I-1) → reportée au mois suivant le dernier quittancé', () => {
    const av = avLot3('2026-03-01');
    const res = charger(dbAvec(av), { dernierMoisQuittance: '2026-08' })._avenantAppliquer('L1', av);
    expect(res.effet).toBe('2026-09-01'); expect(res.ajuste).toBe(true);
  });
  it('déjà au forfait à cette date (avenant signé antérieur) : régime inchangé → document seulement', () => {
    const avant = { id: 'av0', type: 'avenant', ref: 'L1', bailDebut: '2025-01-01', no: 1, statut: 'signe', aLaSignature: true, date: '2026-01-01', effetApplique: '2026-01-01',
      objets: [{ k: 'charges', data: { mode: FORFAIT, montant: '' } }] };
    const av = Object.assign(avLot3('2026-07-01'), { no: 2 });
    const DB = dbAvec(av); DB.baux_evenements = [avant, av]; DB.baux.L1.chForfait = true;
    const res = charger(DB)._avenantAppliquer('L1', av);
    expect(res.appliques).toEqual([]); expect(res.docSeul).toEqual(['Charges']);
  });
});

describe('_avenantRetroMessage — effet antérieur au mois en cours', () => {
  it('forfait seul : averti (la régularisation depuis cette date change)', () => {
    const av = avLot3('2026-01-01');
    const msg = charger(dbAvec(av))._avenantRetroMessage('L1', av);
    expect(msg).toMatch(/antérieure au mois en cours/);
    expect(msg).toMatch(/forfait, non régularisable/);
    expect(msg).not.toMatch(/montants dus/);
  });
  it('effet dans le mois en cours ou futur : aucun avertissement', () => {
    const av = avLot3('2026-10-01');
    expect(charger(dbAvec(av))._avenantRetroMessage('L1', av)).toBeNull();
  });
});
