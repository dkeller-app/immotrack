// __tests__/helpers/irl-dpe-gate.test.js — CDC-QUITTANCES-IRL D23 / invariant I16.
//
// « Un DPE absent ou périmé n'empêche AUCUNE révision : il informe. Seul un DPE renseigné F ou G
//   gèle le loyer (loi Climat art. 23). Un DPE de plus de 10 ans est traité comme manquant. »
//
// Ce module PUR tranche la seule question réglementaire : ce lot est-il GELÉ (exclu) ou seulement
// À COMPLÉTER (proposable + pastille informative) ? PUR : `todayISO` injecté, aucun new Date().

import { describe, it, expect } from 'vitest';
import { irlDpeGate } from './irl-dpe-gate.js';

const TODAY = '2026-08-26';

describe('irlDpeGate — D23 / I16', () => {
  it('DPE F ou G renseigné et valide → GEL (exclu des révisions)', () => {
    expect(irlDpeGate({ dpe: 'F', dpeDate: '2020-01-01', todayISO: TODAY })).toMatchObject({ gel: true, dpeManquant: false });
    expect(irlDpeGate({ dpe: 'g', dpeDate: '2019-06-01', todayISO: TODAY })).toMatchObject({ gel: true, dpeManquant: false });
  });

  it('DPE absent → PAS gelé, à compléter (révision proposable)', () => {
    expect(irlDpeGate({ dpe: '', dpeDate: null, todayISO: TODAY })).toMatchObject({ gel: false, dpeManquant: true });
    expect(irlDpeGate({ dpe: null, todayISO: TODAY })).toMatchObject({ gel: false, dpeManquant: true });
  });

  it('DPE renseigné (A→E) et valide → ni gel ni manquant (révision ordinaire)', () => {
    expect(irlDpeGate({ dpe: 'D', dpeDate: '2022-01-01', todayISO: TODAY })).toMatchObject({ gel: false, dpeManquant: false, dpeExpire: false });
    expect(irlDpeGate({ dpe: 'C', dpeDate: null, todayISO: TODAY })).toMatchObject({ gel: false, dpeManquant: false });
  });

  it('DPE de plus de 10 ans → traité comme MANQUANT (proposable), jamais gel', () => {
    // DPE D vieux de 11 ans : n'est plus valable → à compléter, révisable.
    expect(irlDpeGate({ dpe: 'D', dpeDate: '2015-01-01', todayISO: TODAY })).toMatchObject({ gel: false, dpeManquant: true, dpeExpire: true });
    // DPE F PÉRIMÉ : le gel ne s'applique plus sur un diagnostic périmé → révisable + à compléter.
    expect(irlDpeGate({ dpe: 'F', dpeDate: '2013-01-01', todayISO: TODAY })).toMatchObject({ gel: false, dpeManquant: true, dpeExpire: true });
  });

  it('DPE valide juste sous 10 ans → pas expiré', () => {
    expect(irlDpeGate({ dpe: 'E', dpeDate: '2017-01-01', todayISO: TODAY })).toMatchObject({ dpeExpire: false, dpeManquant: false });
  });
});
