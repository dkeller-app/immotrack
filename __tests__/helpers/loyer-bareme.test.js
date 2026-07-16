import { describe, it, expect } from 'vitest';
import {
  computeDateEffetIRL,
  clampDateEffet,
  periodeInitialeBail,
  appliquerNouvellePeriode,
  synchroniserPeriodeBail,
  cloturerBareme,
  tombstonerPeriodesDuBail,
  _premierDuMois,
  _premierDuMoisSuivant
} from '../../js/core/loyer-bareme.js';
import { duMois } from '../../js/core/loyer-du-mois.js';

// AUDIT-SUIVI-LOYERS étape 2 (2026-07-15) — le noyau PUR qui alimente DB.loyerBareme[].
// Encode les décisions actées 14/07 :
//   Q1 : chaque révision IRL porte une DATE D'EFFET EXPLICITE, jamais rétroactive, jamais
//        avant un mois déjà quittancé. Pré-remplissage : validée avant/au 1er anniversaire de
//        l'année → effet au 1er du mois de l'anniversaire ; validée après → 1er du mois suivant
//        la validation. La date est modifiable (validée par les MÊMES garde-fous).
//   Barème : périodes {ref, debut, fin|null, hc, ch, source, note, bailDebut} append-only.
//        Une écriture de loyer = une nouvelle période ; la période ouverte précédente est
//        clôturée à la veille. Consommé par duMois() (loyer-du-mois.js).

describe('_premierDuMois / _premierDuMoisSuivant', () => {
  it('1er du mois', () => {
    expect(_premierDuMois('2026-03-15')).toBe('2026-03-01');
    expect(_premierDuMois('2026-03')).toBe('2026-03-01');
    expect(_premierDuMois('2026-12-31')).toBe('2026-12-01');
  });
  it('1er du mois suivant (franchit l\'année)', () => {
    expect(_premierDuMoisSuivant('2026-06-20')).toBe('2026-07-01');
    expect(_premierDuMoisSuivant('2026-06-01')).toBe('2026-07-01');
    expect(_premierDuMoisSuivant('2026-12-10')).toBe('2027-01-01');
  });
});

describe('computeDateEffetIRL (Q1) — pré-remplissage de la date d\'effet', () => {
  it('validée AVANT l\'anniversaire → effet au 1er du mois de l\'anniversaire', () => {
    // bail au 1er mars, anniversaire 2026-03-01, validée le 12 février
    const r = computeDateEffetIRL({ anniversaireIso: '2026-03-01', validationIso: '2026-02-12' });
    expect(r.effetIso).toBe('2026-03-01');
  });
  it('validée LE JOUR de l\'anniversaire → effet au 1er du mois de l\'anniversaire', () => {
    const r = computeDateEffetIRL({ anniversaireIso: '2026-03-01', validationIso: '2026-03-01' });
    expect(r.effetIso).toBe('2026-03-01');
  });
  it('validée APRÈS l\'anniversaire (cas Fric : 20 juin, anniv mars) → 1er du mois SUIVANT la validation', () => {
    const r = computeDateEffetIRL({ anniversaireIso: '2026-03-01', validationIso: '2026-06-20' });
    expect(r.effetIso).toBe('2026-07-01');
  });
  it('anniversaire un 15 : effet quand même au 1er du mois (jamais un prorata dans la date d\'effet)', () => {
    const r = computeDateEffetIRL({ anniversaireIso: '2026-03-15', validationIso: '2026-02-01' });
    expect(r.effetIso).toBe('2026-03-01');
  });
  it('garde-fou : jamais avant un mois déjà quittancé (le passé quittancé ne bouge pas)', () => {
    // validée en février pour effet mars, mais mars ET avril déjà quittancés → effet repoussé à mai
    const r = computeDateEffetIRL({
      anniversaireIso: '2026-03-01', validationIso: '2026-02-12', dernierMoisQuittanceYm: '2026-04'
    });
    expect(r.effetIso).toBe('2026-05-01');
  });
  it('garde-fou quittance non déclenché si l\'effet est déjà postérieur', () => {
    const r = computeDateEffetIRL({
      anniversaireIso: '2026-03-01', validationIso: '2026-06-20', dernierMoisQuittanceYm: '2026-03'
    });
    expect(r.effetIso).toBe('2026-07-01');
  });
});

describe('clampDateEffet — validation d\'une date d\'effet MODIFIÉE par l\'utilisateur', () => {
  const base = { annivMoisPremierIso: '2026-03-01', dernierMoisQuittanceYm: '2026-04' };
  it('date valide (postérieure aux garde-fous) → conservée', () => {
    expect(clampDateEffet('2026-08-01', base).effetIso).toBe('2026-08-01');
  });
  it('date rétroactive avant l\'anniversaire → remontée au 1er du mois de l\'anniversaire, signalée', () => {
    const r = clampDateEffet('2026-01-01', { annivMoisPremierIso: '2026-03-01' });
    expect(r.effetIso).toBe('2026-03-01');
    expect(r.ajustee).toBe(true);
  });
  it('date dans un mois quittancé → remontée au 1er mois libre, signalée', () => {
    const r = clampDateEffet('2026-03-01', base);
    expect(r.effetIso).toBe('2026-05-01');
    expect(r.ajustee).toBe(true);
  });
  it('normalise toujours au 1er du mois', () => {
    expect(clampDateEffet('2026-09-17', { annivMoisPremierIso: '2026-03-01' }).effetIso).toBe('2026-09-01');
  });
});

describe('periodeInitialeBail — période de départ à la création d\'un bail', () => {
  it('reprend debut/hc/ch du bail, fin ouverte, source bail', () => {
    const p = periodeInitialeBail({ ref: 'F-001', debut: '2024-03-01', hc: 500, ch: 50 });
    expect(p).toEqual({
      ref: 'F-001', debut: '2024-03-01', fin: null, hc: 500, ch: 50,
      source: 'bail', bailDebut: '2024-03-01', note: ''
    });
  });
});

describe('appliquerNouvellePeriode — une nouvelle période clôture la précédente à la veille', () => {
  const p0 = { ref: 'F-001', debut: '2024-03-01', fin: null, hc: 500, ch: 50, source: 'bail', bailDebut: '2024-03-01', note: '' };
  it('révision IRL au 1er juillet : la période bail se clôture au 30 juin, période irl ouverte', () => {
    const out = appliquerNouvellePeriode([p0], {
      ref: 'F-001', debut: '2026-07-01', hc: 505.15, ch: 50, source: 'irl', bailDebut: '2024-03-01', note: 'IRL T1 2026'
    });
    expect(out.length).toBe(2);
    expect(out[0].fin).toBe('2026-06-30');           // clôturée à la veille
    expect(out[1]).toMatchObject({ debut: '2026-07-01', fin: null, hc: 505.15, source: 'irl' });
  });
  it('ne mute pas le tableau d\'entrée (pur)', () => {
    const arr = [p0];
    appliquerNouvellePeriode(arr, { ref: 'F-001', debut: '2026-07-01', hc: 505.15, ch: 50, source: 'irl', bailDebut: '2024-03-01' });
    expect(arr[0].fin).toBe(null);
  });
  it('idempotent : ré-appliquer la MÊME période (même ref/debut/source) ne duplique pas (boot _applyPending)', () => {
    const once = appliquerNouvellePeriode([p0], { ref: 'F-001', debut: '2026-07-01', hc: 505.15, ch: 50, source: 'irl', bailDebut: '2024-03-01' });
    const twice = appliquerNouvellePeriode(once, { ref: 'F-001', debut: '2026-07-01', hc: 505.15, ch: 50, source: 'irl', bailDebut: '2024-03-01' });
    expect(twice.length).toBe(2);
  });
  it('ne clôture QUE la période ouverte du même lot (ref tolérante), pas les autres', () => {
    const autre = { ref: 'X-9', debut: '2024-01-01', fin: null, hc: 800, ch: 0, source: 'bail', bailDebut: '2024-01-01' };
    const out = appliquerNouvellePeriode([p0, autre], { ref: ' f-001 ', debut: '2026-07-01', hc: 505.15, ch: 50, source: 'irl', bailDebut: '2024-03-01' });
    expect(out.find(p => p.ref === 'X-9').fin).toBe(null);   // intacte
    expect(out.find(p => p.debut === '2024-03-01').fin).toBe('2026-06-30');
  });
  it('le barème produit est lu correctement par duMois() (bout en bout)', () => {
    const bareme = appliquerNouvellePeriode([p0], { ref: 'F-001', debut: '2026-07-01', hc: 505.15, ch: 50, source: 'irl', bailDebut: '2024-03-01' });
    const ctx = { ref: 'F-001', bails: [{ debut: '2024-03-01', fin: null, hc: 505.15, ch: 50 }], bareme, quittances: [] };
    expect(duMois(ctx, '2026-06').total).toBe(550);   // ancien loyer
    expect(duMois(ctx, '2026-07').total).toBe(555.15); // révisé, à sa date d'effet
  });
});

describe('synchroniserPeriodeBail — saveBail (création OU édition) : la période ouverte SUIT le bail courant', () => {
  it('aucune période (bail neuf) → crée la période initiale', () => {
    const out = synchroniserPeriodeBail([], { ref: 'F-001', debut: '2024-03-01', hc: 500, ch: 50 });
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ debut: '2024-03-01', fin: null, hc: 500, ch: 50, source: 'bail' });
  });
  it('édition du loyer courant (même debut) → met à jour la période ouverte EN PLACE, pas de doublon', () => {
    const p0 = { ref: 'F-001', debut: '2024-03-01', fin: null, hc: 500, ch: 50, source: 'bail', bailDebut: '2024-03-01' };
    const out = synchroniserPeriodeBail([p0], { ref: 'F-001', debut: '2024-03-01', hc: 520, ch: 60 });
    expect(out.length).toBe(1);
    expect(out[0].hc).toBe(520);
    expect(out[0].ch).toBe(60);
    expect(out[0].fin).toBe(null);
  });
  it('la période ouverte peut être une révision IRL : l\'édition met à jour son hc, garde fin ouverte', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-03-01', fin: '2026-06-30', hc: 500, ch: 50, source: 'bail', bailDebut: '2024-03-01' },
      { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 505.15, ch: 50, source: 'irl', bailDebut: '2024-03-01' }
    ];
    const out = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2024-03-01', hc: 510, ch: 50 });
    expect(out.length).toBe(2);
    expect(out[0].fin).toBe('2026-06-30');           // période close intacte
    expect(out[1].hc).toBe(510);                     // période ouverte mise à jour
  });
  it('idempotent : re-save à l\'identique ne change rien', () => {
    const p0 = { ref: 'F-001', debut: '2024-03-01', fin: null, hc: 500, ch: 50, source: 'bail', bailDebut: '2024-03-01', note: '' };
    const out = synchroniserPeriodeBail([p0], { ref: 'F-001', debut: '2024-03-01', hc: 500, ch: 50 });
    expect(out).toEqual([p0]);
  });
  it('ne mute pas l\'entrée (pur)', () => {
    const arr = [{ ref: 'F-001', debut: '2024-03-01', fin: null, hc: 500, ch: 50, source: 'bail', bailDebut: '2024-03-01' }];
    synchroniserPeriodeBail(arr, { ref: 'F-001', debut: '2024-03-01', hc: 999, ch: 50 });
    expect(arr[0].hc).toBe(500);
  });
});

describe('cloturerBareme — clôture de bail (re-bail / départ) : la période ouverte reçoit une fin', () => {
  const p0 = { ref: 'F-001', debut: '2024-03-01', fin: null, hc: 500, ch: 50, source: 'bail', bailDebut: '2024-03-01' };
  it('pose fin sur la période ouverte du lot', () => {
    const out = cloturerBareme([p0], 'F-001', '2026-06-30');
    expect(out[0].fin).toBe('2026-06-30');
  });
  it('ne touche pas une période déjà clôturée', () => {
    const clos = { ...p0, fin: '2025-12-31' };
    const out = cloturerBareme([clos], 'F-001', '2026-06-30');
    expect(out[0].fin).toBe('2025-12-31');
  });
  it('ref tolérante', () => {
    const out = cloturerBareme([p0], ' f-001 ', '2026-06-30');
    expect(out[0].fin).toBe('2026-06-30');
  });
});

describe('tombstonerPeriodesDuBail — au re-bail, les périodes de l\'ANCIEN bail sont tombstonées si on repart de zéro', () => {
  it('marque _deleted les périodes du bailDebut donné, laisse les autres', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-03-01', fin: '2026-06-30', hc: 500, ch: 50, bailDebut: '2024-03-01' },
      { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 520, ch: 50, bailDebut: '2026-07-01' }
    ];
    const out = tombstonerPeriodesDuBail(bareme, 'F-001', '2024-03-01');
    expect(out[0]._deleted).toBe(true);
    expect(out[1]._deleted).toBeFalsy();
  });
});
