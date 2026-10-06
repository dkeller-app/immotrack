/**
 * UNE règle de fin d'occupation d'un bail — `finOccupationBail` (js/core/loyer-du-mois.js) — et TOUS ses
 * lecteurs alignés (décisions Didier 05/10) :
 *   1 = A : un bail étudiant / mobilité / garage / autre ÉCHU mais non clôturé reste occupé jusqu'à la
 *           clôture, comme un bail nu ou meublé reconduit ;
 *   2     : le loyer dû s'arrête au DÉPART DÉCLARÉ (`bail.depart.dateSortie`), avant même la clôture
 *           (mois de sortie proratisé au jour, comme une fin effective).
 * Lecteurs : le dû (bailsFromRaw → duMois), l'inline `_bailFinOccupation` (régularisation, compteurs,
 * _getAllBailsForLog, L-5, DG, 2044 via regime-lot) et le bilan / KPI d'occupation (legal-bilan).
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finOccupationBail, duMoisFromRaw } from '../../js/core/loyer-du-mois.js';
import { _computeOccupationLots } from '../../js/core/legal-bilan.js';
import { finOccupationBail as regleSource } from '../../js/core/fin-occupation.js';
import { chapitrePour } from '../../js/core/loyer-bareme.js';
import { debutSuiviLot } from '../../js/core/anteriorite.js';
import { extraireFonction } from './_extraction-source.js';

const P1 = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../js/app/app-part1.js'), 'utf8');
/** L'inline de l'app, branché sur le module comme main.js le fait sur window (ou sans, = file://). */
const inline = (w) => new Function('window', extraireFonction(P1, '_bailFinOccupation') + '\nreturn _bailFinOccupation;')(w); // eslint-disable-line no-new-func

const NU = { type: 'nu', debut: '2023-07-01', fin: '2026-06-30', hc: 500, ch: 100 };
const CAS = [
  ['nu reconduit (échéance passée)', NU, false, ''],
  ['meublé reconduit', { ...NU, type: 'meuble' }, false, ''],
  ['étudiant échu non clôturé', { ...NU, type: 'etudiant' }, false, ''],
  ['mobilité échue non clôturée', { ...NU, type: 'mobilite' }, false, ''],
  ['garage échu non clôturé', { ...NU, type: 'garage' }, false, ''],
  ['autre échu non clôturé', { ...NU, type: 'autre' }, false, ''],
  ['départ déclaré (bail en cours)', { ...NU, depart: { dateSortie: '2026-08-31' } }, false, '2026-08-31'],
  ['étudiant échu + départ déclaré', { ...NU, type: 'etudiant', depart: { dateSortie: '2026-08-31' } }, false, '2026-08-31'],
  ['clôturé (drapeau) sans finEffective', { ...NU, cloture: true }, false, '2026-06-30'],
  ['finEffective (prime sur le départ déclaré)', { ...NU, finEffective: '2026-07-15', depart: { dateSortie: '2026-08-31' } }, false, '2026-07-15'],
  ['historique : sa fin (le départ déclaré ne prime pas)', { ...NU, depart: { dateSortie: '2026-08-31' } }, true, '2026-06-30'],
  ['historique sans aucune fin (données cassées)', { type: 'nu', debut: '2020-01-01' }, true, ''],
];

describe('1 · la règle (module pur)', () => {
  for (const [nom, bail, clos, attendu] of CAS) {
    it(nom + ' → ' + (attendu || 'ouvert'), () => expect(finOccupationBail(bail, clos)).toBe(attendu));
  }
});

describe('2 · l\'inline de l\'app lit LA règle (aucune copie)', () => {
  it('branché sur le module : identique sur tous les cas', () => {
    const f = inline({ finOccupationBail });
    for (const [, bail, clos] of CAS) expect(f(bail, clos)).toBe(finOccupationBail(bail, clos));
  });
  it('appelle bien la fonction du module (un module différent → un résultat différent)', () => {
    expect(inline({ finOccupationBail: () => 'MODULE' })(NU, false)).toBe('MODULE');
  });
  it('repli DÉGRADÉ sans module (file://) : seule la clôture borne', () => {
    const f = inline(undefined);
    expect(f({ ...NU, finEffective: '2026-07-15' }, false)).toBe('2026-07-15');
    expect(f(NU, true)).toBe('2026-06-30');
    expect(f({ ...NU, depart: { dateSortie: '2026-08-31' } }, false)).toBe('');
  });
});

describe('3 · le dû (duMois) suit la règle', () => {
  const du = (bail, ym) => duMoisFromRaw('L1', ym, { currentBail: bail, bauxHistorique: [], bareme: [] });
  it('départ déclaré au 15/08 : juillet plein, août proratisé au jour (15/31), septembre 0', () => {
    const b = { ...NU, depart: { dateSortie: '2026-08-15' } };
    expect(du(b, '2026-07').total).toBe(600);
    expect(du(b, '2026-08').total).toBe(290.33);
    expect(du(b, '2026-09').total).toBe(0);
  });
  it('départ déclaré au 31/08 : août plein, septembre et octobre NON dus', () => {
    const b = { ...NU, depart: { dateSortie: '2026-08-31' } };
    expect(du(b, '2026-08').total).toBe(600);
    expect(du(b, '2026-09').total).toBe(0);
    expect(du(b, '2026-10').total).toBe(0);
  });
  it('étudiant / mobilité échus non clôturés : le loyer reste dû après l\'échéance', () => {
    for (const type of ['etudiant', 'mobilite']) expect(du({ ...NU, type }, '2026-09').total).toBe(600);
  });
  it('bail nu reconduit : dû inchangé (règle d\'avant)', () => {
    expect(du(NU, '2026-12').total).toBe(600);
  });
});

describe('4 · le bilan / KPI d\'occupation (legal-bilan) suit la règle', () => {
  const occ = (bail) => _computeOccupationLots({ baux: { L1: { ref: 'L1', ...bail } }, baux_historique: [], loyerBareme: [] },
    [{ ref: 'L1' }], { from: '2026-01-01', to: '2026-12-31' }).occDays;
  it('départ déclaré au 31/08 : 243 jours occupés en 2026', () => expect(occ({ ...NU, depart: { dateSortie: '2026-08-31' } })).toBe(243));
  it('étudiant échu non clôturé : 365 jours', () => expect(occ({ ...NU, type: 'etudiant' })).toBe(365));
  it('bail courant clôturé (drapeau) au 30/06 : 181 jours', () => expect(occ({ ...NU, cloture: true })).toBe(181));
});

describe('5 · une SEULE définition : loyer-du-mois ré-exporte fin-occupation', () => {
  it('même fonction (aucune copie)', () => expect(finOccupationBail).toBe(regleSource));
});

describe('6 · chapitre d\'une correction de barème (chapitrePour) : même fin d\'occupation', () => {
  // Forme réelle des baux passés à chapitrePour (_migrationBailsForLot) : archive + depart + cloture.
  const courant = (extra = {}) => [{ debut: '2023-07-01', fin: '2026-06-30', finEffective: null, archive: false, depart: null, cloture: false, ...extra }];
  it('bail courant reconduit : une correction après l\'échéance trouve son bail', () => {
    expect(chapitrePour([], 'L1', '2026-11-01', courant())).toBe('2023-07-01');
  });
  it('départ déclaré au 31/08 : le 31/08 est couvert, le 01/09 n\'appartient plus au bail (plus de dû à corriger)', () => {
    expect(chapitrePour([], 'L1', '2026-08-31', courant({ depart: { dateSortie: '2026-08-31' } }))).toBe('2023-07-01');
    expect(chapitrePour([], 'L1', '2026-09-01', courant({ depart: { dateSortie: '2026-08-31' } }))).toBe('');
  });
  it('bail archivé : s\'arrête à sa fin', () => {
    expect(chapitrePour([], 'L1', '2026-11-01', courant({ archive: true }))).toBe('');
  });
});

describe('7 · date de suivi d\'un lot (debutSuiviLot) : un bail « en cours à la date » se lit par la même règle', () => {
  // Date provisoire au 01/10/2026 : un bail commencé avant et encore occupé à cette date est « tronqué »
  // (à confirmer) ; un bail dont le départ déclaré précède la date ne l'est plus.
  const suivi = (bail) => debutSuiviLot({ bails: [{ debut: '2023-07-01', fin: '2026-06-30', archive: false, ...bail }], provisoireIso: '2026-10-01' });
  it('bail reconduit (échéance passée, non clôturé) : encore en cours → à confirmer', () => {
    expect(suivi({}).bailsAvant).toEqual(['2023-07-01']);
    expect(suivi({}).aConfirmer).toBe(true);
  });
  it('départ déclaré au 31/08 : le bail n\'est plus en cours au 01/10 → rien à confirmer', () => {
    expect(suivi({ depart: { dateSortie: '2026-08-31' } }).bailsAvant).toEqual([]);
    expect(suivi({ depart: { dateSortie: '2026-08-31' } }).aConfirmer).toBe(false);
  });
});

describe('8 · câblage : _finLotSuivi (app) transmet le départ déclaré à debutSuiviLot', () => {
  const P2 = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../js/app/app-part2.js'), 'utf8');
  function suiviApp(bail) {
    const DB = { logements: [{ ref: 'L1' }], baux: { L1: { ref: 'L1', ...bail } }, baux_historique: [], mouvements: [], entites: [] };
    const src = ['_finImmDuLot', '_finDuRaw', '_finLotSuivi'].map((n) => extraireFonction(P2, n)).join('\n');
    // eslint-disable-next-line no-new-func
    return new Function('DB', 'window', '_findBailByRefTolerant', '_getLogementStartIso',
      'let _finLotSuiviCache = { gen: -1, map: {} };\n' + src + '\nreturn _finLotSuivi;')(
      DB, { _dbGen: 1, _anteriorite: { debutSuiviLot } }, (r) => DB.baux[r], () => '2026-10-15')('L1');
  }
  it('bail reconduit : en cours à la date provisoire → à confirmer', () => {
    expect(suiviApp({ debut: '2023-07-01', fin: '2026-06-30' }).aConfirmer).toBe(true);
  });
  it('départ déclaré au 31/08 : plus en cours au 01/10 → rien à confirmer', () => {
    expect(suiviApp({ debut: '2023-07-01', fin: '2026-06-30', depart: { dateSortie: '2026-08-31' } }).aConfirmer).toBe(false);
  });
});

describe('9 · câblage : _migrationBailsForLot (app) transmet le départ déclaré à chapitrePour', () => {
  const P1b = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../js/app/app-part1.js'), 'utf8');
  const baux = (bail) => {
    const DB = { baux: { L1: { ref: 'L1', ...bail } }, baux_historique: [] };
    // eslint-disable-next-line no-new-func
    return new Function('DB', '_findBailByRefTolerant', extraireFonction(P1b, '_migrationBailsForLot') + '\nreturn _migrationBailsForLot;')(DB, (r) => DB.baux[r])('L1');
  };
  it('départ déclaré au 31/08 : correction au 01/09 sans bail, au 31/08 dans le bail', () => {
    const b = baux({ debut: '2023-07-01', fin: '2026-06-30', depart: { dateSortie: '2026-08-31' } });
    expect(chapitrePour([], 'L1', '2026-09-01', b)).toBe('');
    expect(chapitrePour([], 'L1', '2026-08-31', b)).toBe('2023-07-01');
  });
  it('bail reconduit sans départ : correction après l\'échéance dans le bail', () => {
    expect(chapitrePour([], 'L1', '2026-11-01', baux({ debut: '2023-07-01', fin: '2026-06-30' }))).toBe('2023-07-01');
  });
});
