import { describe, it, expect } from 'vitest';
import {
  computeDateEffetIRL,
  clampDateEffet,
  periodeInitialeBail,
  appliquerNouvellePeriode,
  synchroniserPeriodeBail,
  cloturerBareme,
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
  // ── LOT 2 (chantier ÉCRITURES DESTRUCTRICES, 2026-08-20) ──────────────────────────────
  // Le test qui occupait ces lignes affirmait le contraire : « la période ouverte peut être une
  // révision IRL : l'édition met à jour son hc ». Il verrouillait le défaut. Mesuré dans le
  // navigateur sur origin/main : barème FER-001 = 2024-01-01→2026-08-31 700+100 puis
  // 2026-09-01→ouverte 730+100 [irl] ; un saveBail SANS le moindre changement financier
  // (un numéro de téléphone) ramenait la période de révision à 700+100. La révision
  // disparaissait du barème et de la timeline jusqu'au redémarrage suivant (pendingApply la
  // remettait), et une quittance émise dans cette fenêtre partait au mauvais tarif.
  //
  // CONTRAT : un saveBail sans changement financier ne touche QUE la période de source 'bail' —
  // celle que le bail a lui-même créée. Les révisions IRL ('irl') et les corrections datées
  // ('manuel') ont leur propre chemin d'écriture (appliquerNouvellePeriode) ; elles ne sont
  // jamais réécrites ici. Aucune date du jour n'entre dans la décision : le résultat ne dépend
  // pas du moment où l'on enregistre.
  it('RÉVISION IRL PROGRAMMÉE : un save sans changement financier ne la ramène pas au tarif du bail', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-01-01', fin: '2026-08-31', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
      { ref: 'F-001', debut: '2026-09-01', fin: null, hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' }
    ];
    const out = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2024-01-01', hc: 700, ch: 100 });
    expect(out.length).toBe(2);
    expect(out[0].fin).toBe('2026-08-31');   // période close intacte
    expect(out[1].hc).toBe(730);             // LA RÉVISION SURVIT
    expect(out[1].ch).toBe(100);
    expect(out[1].fin).toBe(null);
  });

  it('RÉVISION IRL DÉJÀ EN VIGUEUR : elle n\'est pas davantage réécrite', () => {
    // même invariant, révision passée : le tarif en vigueur appartient à la révision, pas au bail.
    const bareme = [
      { ref: 'F-001', debut: '2024-03-01', fin: '2026-06-30', hc: 500, ch: 50, source: 'bail', bailDebut: '2024-03-01' },
      { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 505.15, ch: 50, source: 'irl', bailDebut: '2024-03-01' }
    ];
    const out = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2024-03-01', hc: 510, ch: 50 });
    expect(out.map(p => p.hc)).toEqual([500, 505.15]);
    expect(out.length).toBe(2);              // et surtout : aucune période créée en douce
  });

  it('CORRECTION MANUELLE DATÉE : elle survit aussi (même chemin d\'écriture que l\'IRL)', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-01-01', fin: '2026-02-28', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
      { ref: 'F-001', debut: '2026-03-01', fin: null, hc: 750, ch: 110, source: 'manuel', bailDebut: '2024-01-01', note: 'accord amiable' }
    ];
    const out = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2024-01-01', hc: 700, ch: 100 });
    expect(out[1].hc).toBe(750);
    expect(out[1].ch).toBe(110);
    expect(out[1].note).toBe('accord amiable');
  });

  it('la période de source \'bail\' reste, elle, synchronisée même si une période close la précède', () => {
    const bareme = [
      { ref: 'F-001', debut: '2022-01-01', fin: '2023-12-31', hc: 650, ch: 90, source: 'bail', bailDebut: '2022-01-01' },
      { ref: 'F-001', debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }
    ];
    const out = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2024-01-01', hc: 712, ch: 105 });
    expect(out[1].hc).toBe(712);
    expect(out[1].ch).toBe(105);
    expect(out[0].hc).toBe(650);
  });

  it('RE-BAIL : une période laissée ouverte par un AUTRE bail est CLÔTURÉE, pas doublée', () => {
    // bailDebut différent → ce n'est pas la période de ce bail ; on en crée une plutôt que de
    // repeindre celle du locataire précédent avec le loyer du nouveau. Mais on la FERME d'abord :
    // la première version de ce test se contentait de compter deux périodes et laissait donc
    // passer DEUX périodes ouvertes — l'état qui repeint le passé (cf.
    // __tests__/helpers/bareme-une-seule-periode-ouverte.test.js).
    const bareme = [
      { ref: 'F-001', debut: '2022-01-01', fin: null, hc: 650, ch: 90, source: 'irl', bailDebut: '2021-01-01' }
    ];
    const out = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2026-07-01', hc: 800, ch: 120 });
    expect(out.length).toBe(2);
    expect(out[0].hc).toBe(650);
    expect(out[0].fin).toBe('2026-06-30');
    expect(out.filter((x) => x.fin == null)).toHaveLength(1);
    expect(out[1]).toMatchObject({ debut: '2026-07-01', fin: null, hc: 800, ch: 120, source: 'bail' });
  });

  it('DÉTERMINISME : le résultat ne dépend pas de la date du jour', () => {
    // aucune horloge dans la décision — deux appels identiques rendent le même barème.
    const bareme = [
      { ref: 'F-001', debut: '2024-01-01', fin: '2026-08-31', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
      { ref: 'F-001', debut: '2026-09-01', fin: null, hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' }
    ];
    const bail = { ref: 'F-001', debut: '2024-01-01', hc: 700, ch: 100 };
    expect(synchroniserPeriodeBail(bareme, bail)).toEqual(synchroniserPeriodeBail(bareme, bail));
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

describe('appliquerNouvellePeriode — au plus UNE période ouverte, quel que soit le sens', () => {
  // Trou de couverture trouvé par mutation (borne de date de la sélection), puis élargi par le
  // 2e audit : une période INTERCALAIRE — insérée avant une période déjà présente, cas de la
  // révision rétro-datée — restait ouverte À CÔTÉ de celle qui la suit. _periodeAt retenant la
  // plus tardive dont le début est passé, le dû divergeait selon le mois consulté. Le garde-fou
  // borneMinEffetBareme existe, mais il n'est branché que sur la popup de modification du bail
  // (index.html:20566 et :20593) : ni applyIRL ni _baremeRecordRevision n'en bénéficient.
  // L'invariant est donc porté par le MODULE, pas par la discipline des appelants.
  it('insertion en AVANT : la période ouverte précédente est clôturée à la veille', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }
    ];
    const out = appliquerNouvellePeriode(bareme, { ref: 'F-001', debut: '2026-03-01', hc: 715, ch: 100, source: 'manuel' });
    expect(out).toHaveLength(2);
    expect(out[0].fin).toBe('2026-02-28');
    expect(out[1].fin).toBe(null);
    expect(out.filter((p) => p.fin == null)).toHaveLength(1);
  });

  it('insertion INTERCALAIRE (révision rétro-datée) : la nouvelle est bornée par celle qui la suit', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-01-01', fin: '2026-08-31', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
      { ref: 'F-001', debut: '2026-09-01', fin: null, hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' }
    ];
    const out = appliquerNouvellePeriode(bareme, { ref: 'F-001', debut: '2026-03-01', hc: 715, ch: 100, source: 'manuel' });
    expect(out).toHaveLength(3);
    expect(out.filter((p) => p.fin == null)).toHaveLength(1);   // JAMAIS deux ouvertes
    expect(out[2]).toMatchObject({ debut: '2026-03-01', fin: '2026-08-31', hc: 715 });
    expect(out[1]).toMatchObject({ debut: '2026-09-01', fin: null, hc: 730 });  // la révision intacte
  });

  it('aucune période après : la nouvelle reste ouverte (cas nominal)', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-01-01', fin: '2026-06-30', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }
    ];
    const out = appliquerNouvellePeriode(bareme, { ref: 'F-001', debut: '2026-07-01', hc: 730, ch: 100, source: 'irl' });
    expect(out[1].fin).toBe(null);
  });

  it('la borne ne regarde que le MÊME lot', () => {
    const bareme = [
      { ref: 'AUTRE', debut: '2026-09-01', fin: null, hc: 1, ch: 1, source: 'bail' }
    ];
    const out = appliquerNouvellePeriode(bareme, { ref: 'F-001', debut: '2026-03-01', hc: 715, ch: 100, source: 'manuel' });
    expect(out.find((p) => p.ref === 'F-001').fin).toBe(null);
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

// ── Audit HISTORIQUE-BAIL-ONGLET 17/07 (re-audit) : le chemin « fin explicite » de la
// correction de période clôturait la période ouverte LA PLUS RÉCENTE du lot (la vivante)
// au lieu de la correction insérée → période vivante corrompue (fin < debut) + double
// période ouverte. cloturerPeriodeParDebut cible la période par (ref, debut).
import { cloturerPeriodeParDebut } from '../../js/core/loyer-bareme.js';

describe('cloturerPeriodeParDebut — clôture ciblée par (ref, debut)', () => {
  const bareme = [
    { ref: 'F-001', debut: '2024-03-01', fin: '2026-06-30', hc: 500, ch: 50, source: 'bail' },
    { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 505.15, ch: 65, source: 'irl' },
    { ref: 'F-001', debut: '2025-01-01', fin: null, hc: 480, ch: 50, source: 'manuel', note: 'correction' }
  ];

  it('clôture la période visée SANS toucher la période vivante ultérieure', () => {
    const out = cloturerPeriodeParDebut(bareme, 'F-001', '2025-01-01', '2025-12-31');
    expect(out.find(p => p.debut === '2025-01-01').fin).toBe('2025-12-31');
    expect(out.find(p => p.debut === '2026-07-01').fin).toBe(null);   // vivante intacte
    expect(bareme[2].fin).toBe(null);                                  // pureté
  });

  it('fin < debut refusée (no-op) ; période introuvable → no-op ; ref tolérante', () => {
    const out = cloturerPeriodeParDebut(bareme, 'F-001', '2025-01-01', '2024-01-01');
    expect(out.find(p => p.debut === '2025-01-01').fin).toBe(null);
    const out2 = cloturerPeriodeParDebut(bareme, 'F-001', '2030-01-01', '2030-06-30');
    expect(out2).toHaveLength(3);
    const out3 = cloturerPeriodeParDebut(bareme, '  f-001 ', '2025-01-01', '2025-12-31');
    expect(out3.find(p => p.debut === '2025-01-01').fin).toBe('2025-12-31');
  });
});
