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
  synchroniserPeriodeBail, appliquerNouvellePeriode, cloturerBareme, periodeInitialeBail
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
