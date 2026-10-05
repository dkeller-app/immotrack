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
