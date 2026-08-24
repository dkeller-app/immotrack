// INVARIANT DE STRUCTURE DU BARÈME — « un lot n'a JAMAIS deux périodes ouvertes ».
//
// Trouvé par l'audit du chantier ÉCRITURES DESTRUCTRICES (2026-08-20), sur le correctif du LOT 2
// lui-même. La branche de repli de `synchroniserPeriodeBail` poussait une période initiale sans
// se soucier des périodes déjà ouvertes. `_periodeAt` (loyer-du-mois.js) retient la plus tardive
// dont le début est passé : une seconde période ouverte commençant AVANT elle REPEINT donc tout
// le passé au tarif du bail courant — l'infraction I-1 exactement.
//
// DÉCLENCHEUR RÉEL, mesuré sur les modules : corriger la DATE DE DÉBUT d'un bail. `debut` n'est
// pas un terme financier (js/core/bail-modif.js CHAMPS_FINANCIERS = hc/ch/dg), donc aucune popup
// de validation ne s'interpose : on tombe droit dans synchroniserPeriodeBail.
//
//   barème  2024-01-01→2026-08-31 700+100 [bail] · 2026-09-01→ouverte 730+100 [irl]
//   saveBail { debut: '2024-01-15' }        (correction d'une coquille de saisie)
//     avant l'audit : 3 périodes dont 2 OUVERTES → duMois 2025-06 = 830 € (au lieu de 800)
//     puis, après le départ et le re-bail suivant à 900+150 :
//       duMois 2024-06 = 1050 €   ← trois ans de l'ancien locataire au loyer du nouveau
//
// Le dépôt qualifie déjà cet état d'interdit ailleurs (js/core/bail-modif.js borneMinEffetBareme :
// « laisserait DEUX périodes ouvertes → dû divergent silencieusement »). Ce fichier en fait un
// invariant vérifié sur les trois écrivains du barème.

import { describe, it, expect } from 'vitest';
import {
  synchroniserPeriodeBail, appliquerNouvellePeriode, cloturerBareme, periodeInitialeBail,
  cloturerPeriodeParDebut, reancrerPeriodesDuBail
} from '../../js/core/loyer-bareme.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { casReferenceIRL, surfacesSocle, infractionsI1 } from './finances-invariant-i1.js';

const ouvertes = (bareme, ref) =>
  bareme.filter((p) => p && !p._deleted && p.ref === ref && p.fin == null);

/** L'état réel d'un lot dont la révision IRL est inscrite au barème pour une date future. */
const baremeAvecRevisionProgrammee = () => ([
  { ref: 'F-001', debut: '2024-01-01', fin: '2026-08-31', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
  { ref: 'F-001', debut: '2026-09-01', fin: null, hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' },
]);

describe('synchroniserPeriodeBail — jamais deux périodes ouvertes', () => {
  it('CAS VÉCU : corriger la date de début du bail ne crée pas de seconde période ouverte', () => {
    const out = synchroniserPeriodeBail(baremeAvecRevisionProgrammee(), {
      ref: 'F-001', debut: '2024-01-15', hc: 730, ch: 100
    });
    expect(ouvertes(out, 'F-001')).toHaveLength(1);
    expect(ouvertes(out, 'F-001')[0].source).toBe('irl');   // la révision reste la seule ouverte
  });

  it('CAS VÉCU : et le passé n\'est pas repeint — juin 2025 reste à 800 €', () => {
    const bareme = synchroniserPeriodeBail(baremeAvecRevisionProgrammee(), {
      ref: 'F-001', debut: '2024-01-15', hc: 730, ch: 100
    });
    const bails = [{ debut: '2024-01-15', fin: null, finEffective: null, hc: 730, ch: 100, archive: false }];
    expect(duMois({ ref: 'F-001', bails, bareme }, '2025-06')).toMatchObject({ hc: 700, ch: 100, total: 800 });
  });

  it('CAS VÉCU, suite : après départ puis re-bail, le passé n\'est toujours pas repeint', () => {
    // c'est la composition qui faisait le plus de dégâts : la période orpheline restait ouverte,
    // cloturerBareme ne fermait que la plus tardive, et le re-bail écrivait SON loyer dans l'orpheline.
    let bareme = synchroniserPeriodeBail(baremeAvecRevisionProgrammee(), { ref: 'F-001', debut: '2024-01-15', hc: 730, ch: 100 });
    bareme = cloturerBareme(bareme, 'F-001', '2026-12-31');
    bareme = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2027-01-01', hc: 900, ch: 150 });
    expect(ouvertes(bareme, 'F-001')).toHaveLength(1);
    const bails = [
      { debut: '2024-01-15', fin: null, finEffective: '2026-12-31', hc: 730, ch: 100, archive: true },
      { debut: '2027-01-01', fin: null, finEffective: null, hc: 900, ch: 150, archive: false },
    ];
    expect(duMois({ ref: 'F-001', bails, bareme }, '2024-06').total).toBe(800);
    expect(duMois({ ref: 'F-001', bails, bareme }, '2025-06').total).toBe(800);
    expect(duMois({ ref: 'F-001', bails, bareme }, '2027-03').total).toBe(1050);   // le NOUVEAU bail
  });

  it('BARÈME MAL REFERMÉ : une période ouverte laissée par un bail antérieur est clôturée, pas doublée', () => {
    // le seul cas où la branche de repli a le droit de créer : toutes les ouvertes commencent
    // avant ce bail, donc elles peuvent être fermées à la veille sans chevauchement.
    const bareme = [{ ref: 'F-001', debut: '2022-01-01', fin: null, hc: 650, ch: 90, source: 'irl', bailDebut: '2021-01-01' }];
    const out = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2026-07-01', hc: 800, ch: 120 });
    expect(out).toHaveLength(2);
    expect(out[0].fin).toBe('2026-06-30');                  // clôturée à la veille
    expect(ouvertes(out, 'F-001')).toHaveLength(1);
    expect(out[1]).toMatchObject({ debut: '2026-07-01', fin: null, hc: 800, ch: 120, source: 'bail' });
  });

  it('l\'invariant tient sur les trois écrivains, enchaînés', () => {
    let b = [periodeInitialeBail({ ref: 'F-001', debut: '2024-01-01', hc: 700, ch: 100 })];
    b = appliquerNouvellePeriode(b, { ref: 'F-001', debut: '2026-09-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    b = synchroniserPeriodeBail(b, { ref: 'F-001', debut: '2024-01-01', hc: 700, ch: 100 });
    b = synchroniserPeriodeBail(b, { ref: 'F-001', debut: '2024-02-01', hc: 700, ch: 100 });
    b = cloturerBareme(b, 'F-001', '2027-06-30');
    b = synchroniserPeriodeBail(b, { ref: 'F-001', debut: '2027-07-01', hc: 950, ch: 160 });
    expect(ouvertes(b, 'F-001')).toHaveLength(1);
  });
});

describe('cloturerBareme — ne pose jamais une fin antérieure au début', () => {
  // Trouvé par un balayage exhaustif que j'ai lancé faute d'audit disponible (limite API) :
  // 21 cas sur 41 783 produisaient `fin < debut`, et ils étaient INTRODUITS par le chantier.
  // Le chemin : une correction datée bornée loin dans le futur repousse le début de la période
  // du bail au lendemain de cette borne ; si le locataire part AVANT cette échéance,
  // cloturerBareme posait une fin antérieure au début — une période impossible.
  // Elle ne s'appliquera jamais : on la tombstone plutôt que d'écrire une incohérence.
  it('la période qui commence après la clôture est tombstonée, pas rendue impossible', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-01-01', fin: '2027-12-31', hc: 677, ch: 78, source: 'manuel', bailDebut: '2024-01-01' },
      { ref: 'F-001', debut: '2028-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
    ];
    const out = cloturerBareme(bareme, 'F-001', '2026-06-30');
    expect(out.every((x) => x.fin == null || x.fin >= x.debut)).toBe(true);
    expect(out[1]._deleted).toBe(true);
    expect(ouvertes(out, 'F-001')).toHaveLength(0);
    expect(out[0].fin).toBe('2027-12-31');   // la correction n'est pas touchée
  });

  it('clôture NORMALE inchangée : la fin est posée sur la période ouverte', () => {
    const bareme = [{ ref: 'F-001', debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }];
    const out = cloturerBareme(bareme, 'F-001', '2026-06-30');
    expect(out[0].fin).toBe('2026-06-30');
    expect(out[0]._deleted).toBeUndefined();
  });

  it('clôture le JOUR du début : autorisée (période d’un jour)', () => {
    const bareme = [{ ref: 'F-001', debut: '2026-06-30', fin: null, hc: 700, ch: 100, source: 'bail' }];
    const out = cloturerBareme(bareme, 'F-001', '2026-06-30');
    expect(out[0].fin).toBe('2026-06-30');
    expect(out[0]._deleted).toBeUndefined();
  });
});

describe('BARÈME REFERMÉ — un saveBail ne repasse plus par-dessus une correction datée', () => {
  // Trouvé par le smoke, pas par l'audit. Une correction de période BORNÉE (« Corriger une
  // période » avec date de fin) laisse le lot SANS période ouverte. Le saveBail suivant recréait
  // alors la période du bail à sa date de début — par-dessus la correction.
  // Mesuré à l'écran : correction 2024-01-01→2025-12-31 à 677 € validée avec motif, puis un
  // changement de téléphone → une période 2024-01-01 à 662 € réapparaissait et duMois rendait
  // 740 € au lieu de 755 €. La saisie datée, motivée et tracée était annulée sans un mot.
  const apresCorrectionBornee = () => ([
    { ref: 'F-001', debut: '2024-01-01', fin: '2025-12-31', hc: 677, ch: 78, source: 'manuel', bailDebut: '2024-01-01', note: 'erreur de saisie' },
  ]);

  it('la période du bail démarre APRÈS la dernière période vivante, pas par-dessus', () => {
    const out = synchroniserPeriodeBail(apresCorrectionBornee(), { ref: 'F-001', debut: '2024-01-01', hc: 662, ch: 78 });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ debut: '2024-01-01', fin: '2025-12-31', hc: 677 });   // intacte
    expect(out[1]).toMatchObject({ debut: '2026-01-01', fin: null, hc: 662, source: 'bail' });
    expect(ouvertes(out, 'F-001')).toHaveLength(1);
  });

  it('et le dû suit : la correction vaut pour sa fenêtre, le bail pour la suite', () => {
    const bareme = synchroniserPeriodeBail(apresCorrectionBornee(), { ref: 'F-001', debut: '2024-01-01', hc: 662, ch: 78 });
    const bails = [{ debut: '2024-01-01', fin: null, finEffective: null, hc: 662, ch: 78, archive: false }];
    expect(duMois({ ref: 'F-001', bails, bareme }, '2024-06').total).toBe(755);   // 677 + 78, la correction
    expect(duMois({ ref: 'F-001', bails, bareme }, '2026-06').total).toBe(740);   // 662 + 78, le bail
  });

  it('RE-BAIL : quand le barème est refermé AVANT le nouveau bail, rien ne se décale', () => {
    const bareme = [
      { ref: 'F-001', debut: '2024-01-01', fin: '2026-06-30', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
    ];
    const out = synchroniserPeriodeBail(bareme, { ref: 'F-001', debut: '2027-01-01', hc: 900, ch: 150 });
    expect(out[1]).toMatchObject({ debut: '2027-01-01', fin: null, hc: 900 });
  });

  it('BAIL NEUF sur lot vierge : la période démarre bien à la date du bail', () => {
    const out = synchroniserPeriodeBail([], { ref: 'F-001', debut: '2026-09-01', hc: 640, ch: 95 });
    expect(out[0]).toMatchObject({ debut: '2026-09-01', fin: null, hc: 640, ch: 95, source: 'bail' });
  });
});

describe('MÊME DATE D’EFFET — la seconde révision supersède la première', () => {
  // Reproduit à l'écran : _applyIRLValidated(ref, 730, '2026-09-01') puis (ref, 742, '2026-09-01')
  // laissait DEUX périodes ouvertes au même jour. Corriger le montant puis revalider est un geste
  // ordinaire ; c'était le dernier chemin par lequel l'invariant tombait.
  const base = () => ([{ ref: 'F', debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }]);

  it('deux révisions à la même date : une seule période vivante, la dernière', () => {
    let b = appliquerNouvellePeriode(base(), { ref: 'F', debut: '2026-09-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    b = appliquerNouvellePeriode(b, { ref: 'F', debut: '2026-09-01', hc: 742, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    const vivantes = b.filter((p) => !p._deleted && p.ref === 'F');
    expect(vivantes.filter((p) => p.fin == null)).toHaveLength(1);
    expect(vivantes.filter((p) => p.fin == null)[0].hc).toBe(742);
    expect(b.filter((p) => p._deleted)).toHaveLength(1);   // l'historique garde la ligne
    expect(b.filter((p) => p._deleted)[0].hc).toBe(730);
  });

  it('rejouer la MÊME révision ne tombstone rien (idempotence)', () => {
    const nouvelle = { ref: 'F', debut: '2026-09-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' };
    let b = appliquerNouvellePeriode(base(), nouvelle);
    const apres = appliquerNouvellePeriode(b, nouvelle);
    expect(apres).toEqual(b);
    expect(apres.filter((p) => p._deleted)).toHaveLength(0);
  });

  it('le lot voisin n’est pas touché', () => {
    const b0 = base().concat([{ ref: 'AUTRE', debut: '2026-09-01', fin: null, hc: 1, ch: 1, source: 'bail' }]);
    const b = appliquerNouvellePeriode(b0, { ref: 'F', debut: '2026-09-01', hc: 742, ch: 100, source: 'irl' });
    expect(b.find((p) => p.ref === 'AUTRE')._deleted).toBeUndefined();
  });
});

describe('changement de la DATE DE DÉBUT du bail — re-ancrage (2e audit)', () => {
  // `debut` n'est pas un terme financier (CHAMPS_FINANCIERS = hc/ch/dg) : aucune popup ne
  // s'interpose. Les périodes du bail gardaient donc leur ancien `bailDebut`, devenaient
  // « étrangères » à leur propre bail, et la branche de clôture les fermait — éteignant une
  // révision IRL programmée par la porte de service. saveBail passe désormais la date
  // précédente en 3e argument.
  const avecRevisionAVenir = () => ([
    { ref: 'F-001', debut: '2024-01-01', fin: '2026-06-30', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
    { ref: 'F-001', debut: '2026-07-01', fin: null, hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' },
  ]);

  it('début AVANCÉ : la révision IRL programmée survit (elle était éteinte)', () => {
    // mesuré avant correctif : la période irl était clôturée puis remplacée par 700 → duMois
    // d'octobre 2026 retombait à 800 EUR au lieu de 830.
    const out = synchroniserPeriodeBail(avecRevisionAVenir(), { ref: 'F-001', debut: '2026-09-01', hc: 700, ch: 100 }, '2024-01-01');
    const vivantes = ouvertes(out, 'F-001');
    expect(vivantes).toHaveLength(1);
    expect(vivantes[0].hc).toBe(730);
    expect(vivantes[0].source).toBe('irl');
    expect(vivantes[0].bailDebut).toBe('2026-09-01');   // ré-ancrée sur la nouvelle date
  });

  it('début RECULÉ : la période la plus ancienne du bail est étendue, pas de trou de barème', () => {
    // sans extension, les mois entre l'ancienne et la nouvelle date n'ont plus de période et
    // duMois retombe sur le repli « bail » — c'est-à-dire le tarif d'AUJOURD'HUI sur le passé.
    const out = synchroniserPeriodeBail(avecRevisionAVenir(), { ref: 'F-001', debut: '2023-09-01', hc: 700, ch: 100 }, '2024-01-01');
    expect(ouvertes(out, 'F-001')).toHaveLength(1);
    expect(out[0].debut).toBe('2023-09-01');
    const bails = [{ debut: '2023-09-01', fin: null, finEffective: null, hc: 730, ch: 100, archive: false }];
    expect(duMois({ ref: 'F-001', bails, bareme: out }, '2023-10')).toMatchObject({ hc: 700, ch: 100, total: 800 });
  });

  it('sans 3e argument, rien ne régresse : la révision reste protégée', () => {
    const out = synchroniserPeriodeBail(avecRevisionAVenir(), { ref: 'F-001', debut: '2024-01-01', hc: 700, ch: 100 });
    expect(ouvertes(out, 'F-001')).toHaveLength(1);
    expect(ouvertes(out, 'F-001')[0].hc).toBe(730);
  });

  it('date de début inchangée : le re-ancrage ne se déclenche pas', () => {
    const entree = avecRevisionAVenir();
    const out = synchroniserPeriodeBail(entree, { ref: 'F-001', debut: '2024-01-01', hc: 700, ch: 100 }, '2024-01-01');
    expect(out).toEqual(entree);
  });
});


describe('CORRECTION DE PÉRIODE — la date de fin SAISIE fait foi (3e audit)', () => {
  // La borne automatique introduite pour l'invariant « une seule ouverte » a un effet de bord :
  // la période insérée peut naître CLOSE. Or _histoSaveCorrPeriode posait la fin dans un second
  // temps, via cloturerPeriodeParDebut — qui exige `fin == null` et devenait donc un no-op
  // SILENCIEUX. La fin saisie était jetée et la correction courait jusqu'à la période suivante.
  // Mesuré : correction du 01/01/2025 au 31/03/2025 à 715+100 sur un barème portant une révision
  // au 01/01/2026 → la correction courait jusqu'au 31/12/2025, soit 9 mois surfacturés.
  // La borne redevient un DÉFAUT : une fin explicite fait foi, sauf si elle dépasse la borne.
  const base = () => ([
    { ref: 'F', debut: '2024-01-01', fin: '2025-12-31', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
    { ref: 'F', debut: '2026-01-01', fin: null, hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' },
  ]);

  it('la séquence complète de _histoSaveCorrPeriode respecte la fin saisie', () => {
    let b = appliquerNouvellePeriode(base(), {
      ref: 'F', debut: '2025-01-01', fin: '2025-03-31', hc: 715, ch: 100, source: 'manuel', note: 'accord amiable'
    });
    b = cloturerPeriodeParDebut(b, 'F', '2025-01-01', '2025-03-31');   // filet, no-op désormais
    const corr = b.find((x) => x.debut === '2025-01-01');
    expect(corr.fin).toBe('2025-03-31');
    expect(corr.note).toBe('accord amiable');
    expect(ouvertes(b, 'F')).toHaveLength(1);
  });

  it('une fin explicite PLUS TARDIVE que la suivante est ramenée à la borne (jamais deux ouvertes)', () => {
    const b = appliquerNouvellePeriode(base(), { ref: 'F', debut: '2025-01-01', fin: '2027-12-31', hc: 715, ch: 100, source: 'manuel' });
    expect(b.find((x) => x.debut === '2025-01-01').fin).toBe('2025-12-31');
    expect(ouvertes(b, 'F')).toHaveLength(1);
  });

  it('sans fin explicite, la borne automatique s’applique toujours', () => {
    const b = appliquerNouvellePeriode(base(), { ref: 'F', debut: '2025-01-01', hc: 715, ch: 100, source: 'manuel' });
    expect(b.find((x) => x.debut === '2025-01-01').fin).toBe('2025-12-31');
  });

  it('une fin ANTÉRIEURE au début est ignorée, pas écrite (période impossible)', () => {
    const b = appliquerNouvellePeriode(base(), { ref: 'F', debut: '2025-01-01', fin: '2024-06-30', hc: 715, ch: 100, source: 'manuel' });
    const corr = b.find((x) => x.debut === '2025-01-01');
    expect(corr.fin).toBe('2025-12-31');            // repli sur la borne, jamais fin < debut
    expect(b.every((x) => x.fin == null || x.fin >= x.debut)).toBe(true);
  });

  it('aucune période suivante : une fin explicite reste telle quelle', () => {
    const b = appliquerNouvellePeriode([{ ref: 'F', debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail' }],
      { ref: 'F', debut: '2025-01-01', fin: '2025-03-31', hc: 715, ch: 100, source: 'manuel' });
    expect(b.find((x) => x.debut === '2025-01-01').fin).toBe('2025-03-31');
  });
});

describe('reancrerPeriodesDuBail — l’étiquette suit le bail, AUCUN montant ne bouge', () => {
  const base = () => ([
    { ref: 'F', debut: '2020-01-01', fin: '2023-12-31', hc: 500, ch: 80, source: 'bail', bailDebut: '2020-01-01' },
    { ref: 'F', debut: '2024-01-01', fin: '2026-06-30', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
    { ref: 'F', debut: '2026-07-01', fin: null, hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' },
  ]);

  it('ne change QUE bailDebut (et le debut de la plus ancienne si le bail recule)', () => {
    const out = reancrerPeriodesDuBail(base(), 'F', '2024-01-01', '2023-06-01');
    expect(out.map((x) => [x.hc, x.ch])).toEqual([[500, 80], [700, 100], [730, 100]]);
    expect(out[1].debut).toBe('2023-06-01');            // étendue vers l'arrière
    expect(out[1].bailDebut).toBe('2023-06-01');
    expect(out[2].bailDebut).toBe('2023-06-01');
    expect(out[0].bailDebut).toBe('2020-01-01');        // le bail précédent n'est pas touché
  });

  it('début AVANCÉ : les périodes entièrement antérieures gardent leur étiquette', () => {
    const out = reancrerPeriodesDuBail(base(), 'F', '2024-01-01', '2026-09-01');
    expect(out[1].bailDebut).toBe('2024-01-01');        // fin 2026-06-30 < 2026-09-01 → hors bail
    expect(out[2].bailDebut).toBe('2026-09-01');        // ouverte → suit le bail
    expect(out[1].debut).toBe('2024-01-01');            // aucune date déplacée vers l'avant
  });

  it('no-op quand rien ne change, et entrées dégradées sans crash', () => {
    const b = base();
    expect(reancrerPeriodesDuBail(b, 'F', '2024-01-01', '2024-01-01')).toEqual(b);
    expect(reancrerPeriodesDuBail(b, 'F', null, '2024-01-01')).toEqual(b);
    expect(reancrerPeriodesDuBail(null, 'F', '2024-01-01', '2023-01-01')).toEqual([]);
  });

  it('PUR : le tableau d’entrée n’est pas muté', () => {
    const b = base();
    reancrerPeriodesDuBail(b, 'F', '2024-01-01', '2023-06-01');
    expect(b[1].bailDebut).toBe('2024-01-01');
    expect(b[1].debut).toBe('2024-01-01');
  });
});

describe('INVARIANT I-1 branché sur synchroniserPeriodeBail (le trou du harnais)', () => {
  // Le harnais ne construisait ses barèmes qu'avec periodeInitialeBail + appliquerNouvellePeriode.
  // synchroniserPeriodeBail — l'écrivain de CHAQUE saveBail — n'y passait jamais : c'est pour ça
  // que 3271 tests verts n'ont pas vu l'infraction ci-dessus. On l'y branche.
  it('un saveBail après révision IRL ne modifie AUCUN chiffre des mois figés', () => {
    const { avant, apres, moisFiges, ref, hcApres, ch } = casReferenceIRL();
    const apresSave = {
      ...apres,
      bareme: synchroniserPeriodeBail(apres.bareme, { ref, debut: avant.bails[0].debut, hc: hcApres, ch })
    };
    expect(infractionsI1({ avant, apres: apresSave, moisFiges, surfaces: surfacesSocle() })).toEqual([]);
  });

  it('… et corriger la date de début ne fait PAS repasser les mois au tarif révisé', () => {
    // Attention au piège de lecture : décaler le début du bail du 1er au 15 janvier proratise
    // légitimement janvier (900 EUR x 14/31 = 406,45 EUR de moins) — ce n'est pas une infraction I-1,
    // c'est la conséquence directe du geste. Ce qu'il faut prouver, c'est que les mois ANTÉRIEURS
    // à la date d'effet gardent le TARIF d'avant révision, et qu'une seule période reste ouverte.
    const { avant, apres, moisFiges, ref, hc, hcApres, ch } = casReferenceIRL();
    const debutCorrige = avant.bails[0].debut.slice(0, 8) + '15';
    const bareme = synchroniserPeriodeBail(apres.bareme, { ref, debut: debutCorrige, hc: hcApres, ch });
    expect(ouvertes(bareme, ref)).toHaveLength(1);
    const bails = [{ ...apres.bails[0], debut: debutCorrige }];
    for (const ym of moisFiges.slice(1)) {   // hors janvier, proratisé par le geste lui-même
      expect(duMois({ ref, bails, bareme }, ym)).toMatchObject({ hc, ch });
    }
  });
});
