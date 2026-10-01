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
import { bailForfaitActifLe, regimeForfaitObjet } from '../../js/core/avenant.js';
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
/** `mutation` : (src) => src modifié — prouve qu'un test ÉCHOUE quand le correctif est retiré. */
function charger(DB, { aujourdhui = '2026-10-15', dernierMoisQuittance = null, mutation = null } = {}) {
  const window = { AvenantRegistre, bailForfaitActifLe, forfaitAvenantsDuBail, regimeForfaitObjet, _baremeClampDateEffet: clampDateEffet, _bailModifBorneMinEffet: () => '' };
  let src = varDe(html, '_AV_LBL') + '\n' + varDe(html, '_AV_CHAMP_LBL') + '\n'
    + ['_forfaitAvenantsDuBail', '_avenantPorteRegime', '_forfaitAvantAvenant', '_avenantAppliquer', '_avenantRetroMessage'].map((n) => corpsDe(html, n)).join('\n');
  if (mutation) { const m = mutation(src); if (m === src) throw new Error('mutation sans effet'); src = m; }
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

// ── Contre-audit 30/09 ─────────────────────────────────────────────────────────────────────────────
const signe = (id, no, date, mode) => ({ id, type: 'avenant', ref: 'L1', bailDebut: '2025-01-01', no, statut: 'signe', aLaSignature: true, date, effetApplique: date,
  objets: [{ k: 'charges', data: { mode, montant: '' } }] });

describe('M12 — le régime « avant » vient de la TIMELINE à la signature, pas du flag périmé', () => {
  // Avenant lot 2 « forfait » ANNULÉ : le flag chForfait posé à l'enregistrement reste vrai. Un avenant
  // lot 3 « passage au forfait » signé ensuite CHANGE bien le régime (la timeline est aux provisions).
  const scenario = () => {
    const annule = { id: 'av_l2', type: 'avenant', ref: 'L1', bailDebut: '2025-01-01', no: 1, statut: 'annule', date: '2026-03-01', appliques: [], docSeul: ['Charges'],
      objets: [{ k: 'charges', data: { mode: FORFAIT, montant: '' } }] };
    const av = Object.assign(avLot3('2026-07-01'), { id: 'av2', no: 2 });
    const DB = dbAvec(av); DB.baux_evenements = [annule, av]; DB.baux.L1.chForfait = true;
    return { DB, av };
  };
  it('appliqué : « Passage au forfait de charges »', () => {
    const { DB, av } = scenario();
    expect(charger(DB)._avenantAppliquer('L1', av).appliques).toEqual(['Passage au forfait de charges']);
  });
  it('la mutation M12 (forfaitAvant non passé à la signature) est détectée : le test ci-dessus échouerait', () => {
    const { DB, av } = scenario();
    const res = charger(DB, { mutation: (src) => src.split(', forfaitAvant:_forfaitAvantAvenant(ref, bail, effet, av.id)').join('') })._avenantAppliquer('L1', av);
    expect(res.appliques).not.toEqual(['Passage au forfait de charges']);
    expect(res.docSeul).toEqual(['Charges']);
  });
});

describe('recalage de la date qui franchit une étape de régime INVERSE — régime jugé à la date recalée', () => {
  // A : forfait au 01/01/2026 (signé) · B : retour aux provisions au 01/06/2026 (signé).
  // C : « passage au forfait » écrit au 01/03 (déjà au forfait à cette date) ; mois quittancés jusqu'à
  // juin → recalé au 01/07, où le régime est aux PROVISIONS → C change bien le régime.
  const scenario = () => {
    const A = signe('avA', 1, '2026-01-01', FORFAIT);
    const B = signe('avB', 2, '2026-06-01', 'Passage aux provisions avec régularisation');
    const C = Object.assign(avLot3('2026-03-01'), { id: 'avC', no: 3 });
    const DB = dbAvec(C); DB.baux_evenements = [A, B, C]; DB.baux.L1.chForfait = false;
    return { DB, C };
  };
  it('effet recalé au 01/07 et changement de régime appliqué ; forfait honoré dès le 01/07', () => {
    const { DB, C } = scenario();
    const res = charger(DB, { dernierMoisQuittance: '2026-06' })._avenantAppliquer('L1', C);
    expect(res.effet).toBe('2026-07-01');
    expect(res.ajuste).toBe(true);
    expect(res.appliques).toEqual(['Passage au forfait de charges']);
    expect(DB.baux.L1.chForfait).toBe(true);
    const signeC = Object.assign({}, C, { statut: 'signe', effetApplique: res.effet });
    const liste = DB.baux_evenements.filter((x) => x.id !== 'avC').concat([signeC]);
    expect(bailForfaitActifLe(DB.baux.L1, '2026-06-30', liste)).toBe(false);
    expect(bailForfaitActifLe(DB.baux.L1, '2026-07-01', liste)).toBe(true);
  });
  it('mutation « régime jugé sur la date écrite » (pas de réévaluation après recalage) : détectée', () => {
    const { DB, C } = scenario();
    const res = charger(DB, { dernierMoisQuittance: '2026-06', mutation: (src) => src.replace(/\n\s*if\(ajuste\) plan=window\.AvenantRegistre\.planApplication\([^\n]*\n/, '\n') })._avenantAppliquer('L1', C);
    expect(res.appliques).toEqual([]);   // la version fautive le rangeait en « document seulement »
  });
  it('mutation « pas de recalage sans changement de régime à la date écrite » : détectée', () => {
    const { DB, C } = scenario();
    const res = charger(DB, { dernierMoisQuittance: '2026-06', mutation: (src) => src.split('||_avenantPorteRegime(av.objets)').join('') })._avenantAppliquer('L1', C);
    expect(res.effet).toBe('2026-03-01');   // resté sur un mois quittancé, en « document seulement »
    expect(res.appliques).toEqual([]);
  });
});

describe('M9 — liste et numérotation des avenants du bail COURANT (debutsClos dans _avenantArgs)', () => {
  function chargerListe(DB, mutation) {
    let src = ['_avenantArgs', '_avenantListe'].map((n) => corpsDe(html, n)).join('\n');
    if (mutation) { const m = mutation(src); if (m === src) throw new Error('mutation sans effet'); src = m; }
    // eslint-disable-next-line no-new-func
    return new Function('window', 'DB', src + '\nreturn { _avenantArgs, _avenantListe };')({ AvenantRegistre }, DB);
  }
  // Bail A clos au 31/12/2025 avec un avenant n° 3 « À signer » (effet au 01/01/2026) ; bail B au 01/01/2026.
  const DB = {
    baux: { L2: { ref: 'L2', debut: '2026-01-01', type: 'nu' } },
    baux_historique: [{ ref: 'L2', debut: '2024-01-01', finEffective: '2025-12-31', type: 'meuble' }],
    baux_evenements: [{ id: 'avA3', type: 'avenant', ref: 'L2', bailDebut: '2024-01-01', no: 3, statut: 'a_signer', aLaSignature: true, date: '2026-01-01',
      objets: [{ k: 'charges', data: { mode: FORFAIT } }] }],
    bailEvents: [],
  };
  it('bail B : l\'avenant du bail clos n\'est ni listé ni compté dans la numérotation', () => {
    const f = chargerListe(DB);
    expect(f._avenantListe('L2')).toEqual([]);
    expect(AvenantRegistre.numeroSuivant(f._avenantArgs('L2'))).toBe(1);
  });
  it('la mutation M9 (_avenantArgs sans debutsClos) est détectée : le test ci-dessus échouerait', () => {
    const f = chargerListe(DB, (src) => src.replace(/,\s*debutsClos:\(window\.AvenantRegistre[^}]*\}/, ' }'));
    expect(f._avenantListe('L2').map((a) => a.no)).toEqual([3]);
    expect(AvenantRegistre.numeroSuivant(f._avenantArgs('L2'))).toBe(4);
  });
});
