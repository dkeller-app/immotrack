// COUVERTURE DU CHAPITRE — « chaque mois du bail est porté par une période DE CE BAIL ».
//
// Trouvé par l'audit du 2026-08-24 sur la plage 9c2be61..7a5d498. Le balayage du chantier ne
// mesurait que trois propriétés de FORME (périodes ouvertes, chevauchements, fin < debut) et
// jamais les TROUS ni les EUROS : c'est pour ça que les deux bloquants ci-dessous étaient
// invisibles alors que 3 297 tests passaient au vert.
//
// Mesuré sur 4 008 séquences de 3 gestes UI-atteignables (les 3 écrivains du barème + duMois) :
//                        périodes ouvertes >1   fin<debut   chevauchements   TROUS      I-1 (mois / €)
//   f25397a (avant)              713               417          2 177         58 898    31 209 / 1 817 486
//   9c2be61                       58               385          1 008         51 813    29 844 / 1 629 540
//   7a5d498 (tête auditée)         0                 0            380         45 291    29 929 / 1 634 000
//   après ce chantier              0                 0             84            754         0 /         0
//
// Les 84 chevauchements et les 754 mois restants viennent TOUS d'une date posée hors de la
// fenêtre du bail (reculer le début d'un bail derrière le locataire précédent, clôturer un bail
// avant sa propre date de début) : un refus de saisie manquant, consigné en suite — jamais
// masqué ici par un no-op silencieux.

import { describe, it, expect } from 'vitest';
import {
  synchroniserPeriodeBail, appliquerNouvellePeriode, cloturerBareme, impactCloture,
  garantirCouvertureBail, _segmentsManquants, cloturerPeriodeParDebut
} from '../../js/core/loyer-bareme.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { construireHistoriqueBail } from '../../js/core/bail-historique.js';

const REF = 'F-001';
const vivantes = (b) => b.filter((p) => p && !p._deleted && p.ref === REF);
const ouvertes = (b) => vivantes(b).filter((p) => p.fin == null);
const veille = (iso) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

describe('B1 — le DÉBUT du bail ne reste jamais à découvert', () => {
  // GESTE REPRODUIT : bail au 01/09/2023 à 700+90 sur un lot dont le barème est vierge (stock
  // legacy non migré) → « Corriger une période » 01/01/2024→31/03/2024 à 600 → puis on corrige
  // le NUMÉRO DE TÉLÉPHONE du locataire (saveBail, aucun terme financier, donc aucune popup).
  //
  // AVANT : 2024-01-01→2024-03-31 600+90 [manuel] · 2024-04-01→ouverte 700+90 [bail]
  //         sept→déc 2023 n'ont AUCUNE période — _periodeAt rend null, duMois bascule sur le
  //         repli « bail », et à la révision IRL suivante 2023-09 et 2023-11 passaient de
  //         790 € à 870 €. Le passé recalculé au tarif d'aujourd'hui : infraction I-1.
  const bail = { ref: REF, debut: '2023-09-01', hc: 700, ch: 90 };
  // La chaîne RÉELLE de _histoSaveCorrPeriode : on gèle d'abord ce qui PRÉCÈDE la correction
  // (horizon = sa date de début), puis on l'écrit, puis le saveBail « téléphone » ne fait rien.
  const apresCorrectionPuisTelephone = () => {
    let b = garantirCouvertureBail([], bail, '2024-01-01');
    b = appliquerNouvellePeriode(b, {
      ref: REF, debut: '2024-01-01', fin: '2024-03-31', hc: 600, ch: 90,
      source: 'manuel', bailDebut: bail.debut, note: 'geste commercial'
    });
    b = cloturerPeriodeParDebut(b, REF, '2024-01-01', '2024-03-31');
    return synchroniserPeriodeBail(b, { ...bail }, bail.debut);
  };

  it('la couverture partielle donne DEUX segments, pas un décalage', () => {
    const out = apresCorrectionPuisTelephone();
    const v = vivantes(out).slice().sort((a, b) => a.debut.localeCompare(b.debut));
    expect(v.map((p) => [p.debut, p.fin, p.hc, p.source])).toEqual([
      ['2023-09-01', '2023-12-31', 700, 'bail'],   // ← le segment qui manquait
      ['2024-01-01', '2024-03-31', 600, 'manuel'], // ← la correction, intacte
    ]);
    // AUDIT 24/08 : et RIEN après le 31/03/2024. Une période ouverte posée là au tarif du
    // moment bornerait la prochaine augmentation et la ferait expirer. duMois résout déjà ces
    // mois au tarif du bail ; ils seront GELÉS par l'horizon de la prochaine écriture datée.
    expect(ouvertes(out)).toHaveLength(0);
  });

  it('et les euros suivent : sept→déc 2023 viennent du BARÈME, plus du repli', () => {
    const bareme = apresCorrectionPuisTelephone();
    const bails = [{ debut: bail.debut, fin: null, finEffective: null, archive: false, hc: 700, ch: 90 }];
    for (const ym of ['2023-09', '2023-10', '2023-11', '2023-12']) {
      expect(duMois({ ref: REF, bails, bareme }, ym)).toMatchObject({ total: 790, source: 'bareme' });
    }
    expect(duMois({ ref: REF, bails, bareme }, '2024-02').total).toBe(690);   // la correction
  });

  it('INVARIANT I-1 : la révision IRL suivante ne repeint plus 2023 (790 €, pas 870 €)', () => {
    // _baremeRecordRevision gèle [début du bail, veille de la date d'effet] AVANT d'écrire :
    // c'est ce geste qui fige les mois laissés au repli par la correction bornée.
    const bareme = appliquerNouvellePeriode(
      garantirCouvertureBail(apresCorrectionPuisTelephone(), bail, '2026-09-01'), {
      ref: REF, debut: '2026-09-01', hc: 780, ch: 90, source: 'irl', bailDebut: bail.debut
    });
    // saveBail a écrit le loyer révisé sur le bail : c'est LUI que le repli appliquait au passé.
    const bails = [{ debut: bail.debut, fin: null, finEffective: null, archive: false, hc: 780, ch: 90 }];
    for (const ym of ['2023-09', '2023-10', '2023-11', '2023-12']) {
      expect(duMois({ ref: REF, bails, bareme }, ym).total).toBe(790);
    }
    // … et les mois laissés au repli par la correction bornée sont gelés eux aussi.
    for (const ym of ['2024-04', '2025-06', '2026-08']) {
      expect(duMois({ ref: REF, bails, bareme }, ym)).toMatchObject({ total: 790, source: 'bareme' });
    }
    expect(duMois({ ref: REF, bails, bareme }, '2026-09').total).toBe(870);   // la révision, à sa date
    // Et elle ne s'éteint pas : le loyer révisé tient au-delà de toute période antérieure.
    for (const ym of ['2028-01', '2030-12', '2033-06']) {
      expect(duMois({ ref: REF, bails, bareme }, ym).total).toBe(870);
    }
  });

  it('sur un barème DÉJÀ complet, la garantie ne touche à rien (idempotence)', () => {
    const plein = apresCorrectionPuisTelephone();
    expect(synchroniserPeriodeBail(plein, { ...bail }, bail.debut)).toEqual(plein);
    expect(garantirCouvertureBail(plein, bail)).toEqual(plein);
  });
});

describe('B2 — au re-bail, le nouveau locataire est facturé à SON loyer', () => {
  // GESTE REPRODUIT : bail au 01/01/2024 à 700+100 avec une révision IRL déjà PROGRAMMÉE au
  // 01/09/2026 (elle borne la période du bail au 31/08/2026). Le locataire part, nouveau bail
  // au 01/03/2026 à 850+130 → saveBail → archiverBail(veille) → cloturerBareme.
  //
  // AVANT : cloturerBareme tombstonait la révision future et SORTAIT sans poser de fin ; la
  // période de l'ancien bail gardait sa fin au 31/08/2026, et la période du nouveau bail était
  // décalée jusqu'au 01/09/2026. Mars→août 2026 étaient dus 800 € au lieu de 980 € :
  // 1 080 € non facturés, sans un mot.
  const scenario = () => {
    let b = synchroniserPeriodeBail([], { ref: REF, debut: '2024-01-01', hc: 700, ch: 100 }, null);
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2026-09-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    const nouveau = { ref: REF, debut: '2026-03-01', hc: 850, ch: 130 };
    b = cloturerBareme(b, REF, veille(nouveau.debut));
    return synchroniserPeriodeBail(b, nouveau, null);
  };
  const bails = () => ([
    { debut: '2024-01-01', fin: null, finEffective: '2026-02-28', archive: true, hc: 700, ch: 100 },
    { debut: '2026-03-01', fin: null, finEffective: null, archive: false, hc: 850, ch: 130 },
  ]);

  it('la période du nouveau bail commence à SA date, pas à celle de la révision annulée', () => {
    const out = scenario();
    const v = vivantes(out).slice().sort((a, b) => a.debut.localeCompare(b.debut));
    expect(v.map((p) => [p.debut, p.fin, p.hc, p.bailDebut])).toEqual([
      ['2024-01-01', '2026-02-28', 700, '2024-01-01'],
      ['2026-03-01', null, 850, '2026-03-01'],
    ]);
  });

  it('EUROS : mars→août 2026 sont dus 980 €, pas 800 € (1 080 € qui manquaient)', () => {
    const bareme = scenario(), bs = bails();
    const mois = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    expect(mois.map((ym) => duMois({ ref: REF, bails: bs, bareme }, ym).total)).toEqual(mois.map(() => 980));
    expect(mois.reduce((a, ym) => a + (980 - duMois({ ref: REF, bails: bs, bareme }, ym).total), 0)).toBe(0);
  });

  it('et l\'ancien locataire n\'est pas facturé après son départ', () => {
    const bareme = scenario(), bs = bails();
    expect(duMois({ ref: REF, bails: bs, bareme }, '2026-01').total).toBe(800);
    expect(duMois({ ref: REF, bails: bs, bareme }, '2026-02').total).toBe(800);
  });
});

describe('I1 — `bailDebut` borne des DEUX côtés : on n\'écrit pas dans le chapitre du voisin', () => {
  // « Corriger une période » (index.html) laisse la date LIBRE et rattache la période au
  // chapitre du bail COURANT. Le filtre de supersession ne regardait que (ref, debut) : une
  // écriture du chapitre 2024-01-01 datée au 01/06/2022 SUPPRIMAIT la période du bail précédent.
  const deuxChapitres = () => ([
    { ref: REF, debut: '2022-06-01', fin: '2023-12-31', hc: 550, ch: 70, source: 'bail', bailDebut: '2022-06-01' },
    { ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
  ]);

  it('la période du bail PRÉCÉDENT survit à une correction datée dans sa fenêtre', () => {
    const out = appliquerNouvellePeriode(deuxChapitres(), {
      ref: REF, debut: '2022-06-01', hc: 900, ch: 100, source: 'manuel', bailDebut: '2024-01-01', note: 'faute de frappe'
    });
    expect(out.find((p) => p.debut === '2022-06-01' && p.hc === 550)._deleted).toBeFalsy();
    expect(out).toEqual(deuxChapitres());   // rien n'a été écrit : la date est hors du chapitre
  });

  it('une période ne peut pas commencer AVANT le bail auquel on la rattache', () => {
    const base = [{ ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }];
    expect(appliquerNouvellePeriode(base, {
      ref: REF, debut: '2023-01-01', hc: 600, ch: 100, source: 'manuel', bailDebut: '2024-01-01'
    })).toEqual(base);
  });

  it('DANS le même chapitre, la supersession fonctionne toujours (bc4efdf ne régresse pas)', () => {
    let b = appliquerNouvellePeriode(
      [{ ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }],
      { ref: REF, debut: '2026-09-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2026-09-01', hc: 742, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    expect(ouvertes(b)).toHaveLength(1);
    expect(ouvertes(b)[0].hc).toBe(742);
  });

  it('stock corrompu : une écriture ne supprime jamais la ligne d\'un AUTRE bail à la même date', () => {
    // Le second garde-fou d'I1, celui qui ne passe PAS par la date libre de « Corriger une
    // période ». Deux chapitres portent une période vivante au même jour : l'état arrive par le
    // blob cloud (deux appareils qui fusionnent) ou par un barème reconstruit, pas par l'écran.
    // Superséder « tout ce qui commence ce jour-là » effaçait la ligne du locataire précédent.
    const stock = [
      { ref: REF, debut: '2024-01-01', fin: null, hc: 550, ch: 70, source: 'irl', bailDebut: '2022-06-01' },
      { ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
    ];
    const out = appliquerNouvellePeriode(stock, {
      ref: REF, debut: '2024-01-01', hc: 715, ch: 100, source: 'manuel', bailDebut: '2024-01-01', note: 'accord'
    });
    expect(out.find((p) => p.bailDebut === '2022-06-01')._deleted).toBeFalsy();
    expect(out.find((p) => p.bailDebut === '2024-01-01' && p.hc === 700)._deleted).toBe(true);
  });

  it('un barème LEGACY (sans bailDebut) reste superséé : on ne conclut rien de son chapitre', () => {
    const legacy = [{ ref: REF, debut: '2026-09-01', fin: null, hc: 730, ch: 100, source: 'irl' }];
    const out = appliquerNouvellePeriode(legacy, { ref: REF, debut: '2026-09-01', hc: 742, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    expect(ouvertes(out)).toHaveLength(1);
    expect(ouvertes(out)[0].hc).toBe(742);
  });
});

describe('M5 / M6 / M7 — les trois mutations survivantes de l\'audit', () => {
  // L'audit a muté la supersession de trois façons sans faire rougir un seul test. Ce qui suit
  // les tue par le COMPORTEMENT, et documente pourquoi deux d'entre elles sont FAUSSES :
  // restreindre la supersession laisse DEUX périodes vivantes sur la même fenêtre, donc un dû
  // qui dépend de l'ordre du tableau — donc de l'appareil (le blob cloud réordonne).
  it('M5 — superséder seulement la MÊME SOURCE laisserait deux périodes sur la même date', () => {
    // une révision IRL au 01/09/2026, puis une correction MANUELLE à la même date d'effet.
    let b = appliquerNouvellePeriode(
      [{ ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }],
      { ref: REF, debut: '2026-09-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2026-09-01', hc: 715, ch: 100, source: 'manuel', bailDebut: '2024-01-01', note: 'accord' });
    expect(vivantes(b).filter((p) => p.debut === '2026-09-01')).toHaveLength(1);
    expect(vivantes(b).find((p) => p.debut === '2026-09-01').hc).toBe(715);
  });

  it('M6 — superséder seulement les périodes OUVERTES laisserait deux périodes FERMÉES identiques', () => {
    // corriger une période DÉJÀ BORNÉE (on se reprend sur le montant) : même début, même chapitre,
    // et elle est fermée. Ne pas la superséder ferait vivre 600 ET 620 sur la même fenêtre.
    const base = [
      { ref: REF, debut: '2024-01-01', fin: '2024-06-30', hc: 600, ch: 90, source: 'manuel', bailDebut: '2024-01-01' },
      { ref: REF, debut: '2024-07-01', fin: null, hc: 700, ch: 90, source: 'bail', bailDebut: '2024-01-01' },
    ];
    const out = appliquerNouvellePeriode(base, {
      ref: REF, debut: '2024-01-01', fin: '2024-06-30', hc: 620, ch: 90, source: 'manuel', bailDebut: '2024-01-01', note: 'le bon montant'
    });
    expect(vivantes(out).filter((p) => p.debut === '2024-01-01')).toHaveLength(1);
    expect(vivantes(out).find((p) => p.debut === '2024-01-01').hc).toBe(620);
    const bails = [{ debut: '2024-01-01', fin: null, finEffective: null, archive: false, hc: 700, ch: 90 }];
    expect(duMois({ ref: REF, bails, bareme: out }, '2024-03').total).toBe(710);   // 620 + 90, sans ambiguïté
  });

  it('M7 — deux périodes ouvertes au même début (état hérité) : la DERNIÈRE inscrite fait foi', () => {
    // `_openPeriodIdxWhere` départage par `>=` : sur un stock corrompu, c'est la dernière ligne
    // du tableau qui gagne. Le comportement est arbitraire mais il doit être ÉCRIT — sans quoi
    // basculer en `>` change l'état persisté sans qu'aucun test ne bronche.
    const corrompu = [
      { ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 90, source: 'bail', bailDebut: '2024-01-01' },
      { ref: REF, debut: '2024-01-01', fin: null, hc: 650, ch: 90, source: 'bail', bailDebut: '2024-01-01' },
    ];
    const out = synchroniserPeriodeBail(corrompu, { ref: REF, debut: '2024-01-01', hc: 800, ch: 90 });
    expect(out[1].hc).toBe(800);
    expect(out[0].hc).toBe(700);
  });
});

describe('I4 — corriger UNIQUEMENT la date de fin n\'est plus un no-op silencieux', () => {
  const base = () => ([{ ref: REF, debut: '2025-01-01', fin: '2025-06-30', hc: 700, ch: 100, source: 'manuel', bailDebut: '2024-01-01' }]);

  it('la fin saisie remplace l\'ancienne (la clé d\'idempotence contient `fin`)', () => {
    const out = appliquerNouvellePeriode(base(), {
      ref: REF, debut: '2025-01-01', fin: '2025-09-30', hc: 700, ch: 100, source: 'manuel', bailDebut: '2024-01-01', note: 'la bonne fin'
    });
    expect(vivantes(out)).toHaveLength(1);
    expect(vivantes(out)[0].fin).toBe('2025-09-30');
  });

  it('… mais rejouer la MÊME période reste un no-op (le boot rejoue les révisions)', () => {
    const nouvelle = { ref: REF, debut: '2026-09-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' };
    const b0 = [{ ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }];
    const un = appliquerNouvellePeriode(b0, nouvelle);
    expect(appliquerNouvellePeriode(un, nouvelle)).toEqual(un);
    expect(un.filter((p) => p._deleted)).toHaveLength(0);
  });

  it('… y compris quand la période a depuis été BORNÉE par une suivante (pas d\'empilement de tombstones)', () => {
    // la fin calculée est comparée, pas la fin demandée : sinon chaque démarrage aurait tombstoné
    // puis recréé la même ligne, et le blob cloud aurait gonflé sans fin.
    const nouvelle = { ref: REF, debut: '2025-01-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' };
    let b = appliquerNouvellePeriode([{ ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }], nouvelle);
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2026-01-01', hc: 760, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    const avant = b.filter((p) => p._deleted).length;
    expect(appliquerNouvellePeriode(b, nouvelle).filter((p) => p._deleted)).toHaveLength(avant);
  });
});

describe('SPLIT — une correction posée DANS une période fermée la coupe, elle ne la chevauche pas', () => {
  // Conséquence directe de la garantie de couverture : le barème contient désormais des segments
  // FERMÉS. `appliquerNouvellePeriode` ne fermait que la période OUVERTE précédente — insérer une
  // correction à l'intérieur d'un segment fermé produisait deux périodes vivantes sur la même
  // fenêtre (mesuré : 603 couples chevauchants sur 4 096 séquences avant ce correctif).
  it('la tranche d\'avant s\'arrête à la veille, celle d\'après reprend le MÊME tarif', () => {
    const base = [{ ref: REF, debut: '2023-09-01', fin: '2026-12-31', hc: 700, ch: 90, source: 'bail', bailDebut: '2023-09-01' }];
    const out = appliquerNouvellePeriode(base, {
      ref: REF, debut: '2024-01-01', fin: '2024-03-31', hc: 600, ch: 90, source: 'manuel', bailDebut: '2023-09-01', note: 'geste'
    });
    const v = vivantes(out).slice().sort((a, b) => a.debut.localeCompare(b.debut));
    expect(v.map((p) => [p.debut, p.fin, p.hc])).toEqual([
      ['2023-09-01', '2023-12-31', 700],
      ['2024-01-01', '2024-03-31', 600],
      ['2024-04-01', '2026-12-31', 700],
    ]);
  });

  it('aucun couple de périodes vivantes ne se chevauche', () => {
    const base = [{ ref: REF, debut: '2023-09-01', fin: '2026-12-31', hc: 700, ch: 90, source: 'bail', bailDebut: '2023-09-01' }];
    const out = appliquerNouvellePeriode(base, { ref: REF, debut: '2024-01-01', fin: '2024-03-31', hc: 600, ch: 90, source: 'manuel', bailDebut: '2023-09-01' });
    const v = vivantes(out);
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      const a = v[i], b = v[j];
      expect(a.debut <= (b.fin || '9999-12-31') && b.debut <= (a.fin || '9999-12-31')).toBe(false);
    }
  });

  it('une nouvelle période OUVERTE ne laisse pas de reprise derrière elle', () => {
    const base = [{ ref: REF, debut: '2023-09-01', fin: '2026-12-31', hc: 700, ch: 90, source: 'bail', bailDebut: '2023-09-01' }];
    const out = appliquerNouvellePeriode(base, { ref: REF, debut: '2025-01-01', hc: 760, ch: 90, source: 'manuel', bailDebut: '2023-09-01' });
    expect(ouvertes(out)).toHaveLength(1);
    expect(vivantes(out).map((p) => [p.debut, p.fin])).toEqual([['2023-09-01', '2024-12-31'], ['2025-01-01', null]]);
  });
});

describe('_segmentsManquants — la brique : elle DIT où sont les trous, elle n\'écrit rien', () => {
  it('barème vide : un seul segment, ouvert, à la date du bail', () => {
    expect(_segmentsManquants([], REF, '2024-01-01')).toEqual([{ debut: '2024-01-01', fin: null }]);
  });
  it('trou en tête ET en queue : deux segments', () => {
    const b = [{ ref: REF, debut: '2024-01-01', fin: '2024-03-31', hc: 1, ch: 1 }];
    expect(_segmentsManquants(b, REF, '2023-09-01')).toEqual([
      { debut: '2023-09-01', fin: '2023-12-31' }, { debut: '2024-04-01', fin: null }
    ]);
  });
  it('une période OUVERTE couvre tout ce qui la suit : rien après elle', () => {
    const b = [{ ref: REF, debut: '2024-01-01', fin: null, hc: 1, ch: 1 }];
    expect(_segmentsManquants(b, REF, '2023-09-01')).toEqual([{ debut: '2023-09-01', fin: '2023-12-31' }]);
    expect(_segmentsManquants(b, REF, '2024-01-01')).toEqual([]);
  });
  it('les tombstones et les autres lots ne comblent rien', () => {
    const b = [
      { ref: REF, debut: '2024-01-01', fin: null, hc: 1, ch: 1, _deleted: true },
      { ref: 'AUTRE', debut: '2024-01-01', fin: null, hc: 1, ch: 1 },
    ];
    expect(_segmentsManquants(b, REF, '2024-01-01')).toEqual([{ debut: '2024-01-01', fin: null }]);
  });
});

describe('garantirCouvertureBail — les écrivains DATÉS comblent sans jamais toucher à l\'existant', () => {
  // Point d'entrée de la popup de modification, de _baremeRecordRevision et de la correction de
  // période. Passer par synchroniserPeriodeBail à leur place a été mesuré comme une régression
  // I-1 : sa branche « la période ouverte de bail suit le formulaire » repeignait les mois
  // d'AVANT la date d'effet au tarif qu'on venait de saisir.
  it('ne modifie AUCUNE période existante, même quand le loyer du bail a changé', () => {
    const base = [
      { ref: REF, debut: '2024-01-01', fin: '2024-06-30', hc: 700, ch: 90, source: 'bail', bailDebut: '2024-01-01' },
      { ref: REF, debut: '2025-01-01', fin: null, hc: 720, ch: 90, source: 'bail', bailDebut: '2024-01-01' },
    ];
    const out = garantirCouvertureBail(base, { ref: REF, debut: '2024-01-01', hc: 999, ch: 90 });
    expect(out.slice(0, 2)).toEqual(base);
    expect(out).toHaveLength(3);
    expect(out[2]).toMatchObject({ debut: '2024-07-01', fin: '2024-12-31', hc: 999 });
  });

  it('LOT 3 — une PROVISION non saisie reprend la valeur connue au lieu d\'inventer un 0', () => {
    const base = [{ ref: REF, debut: '2024-01-01', fin: '2024-06-30', hc: 700, ch: 136, source: 'bail', bailDebut: '2024-01-01' }];
    const out = garantirCouvertureBail(base, { ref: REF, debut: '2024-01-01', hc: 700, ch: '' }, '2025-01-01');
    expect(out[1]).toMatchObject({ debut: '2024-07-01', hc: 700, ch: 136 });
  });

  it('LOT 3 — un LOYER non saisi aussi (le champ hc, pas seulement ch)', () => {
    // Mutant survivant de la passe précédente : retirer le repli `prec && prec.hc` ne faisait
    // rougir personne, le test ne couvrait que la provision. Un bail dont le loyer est vide
    // (import à colonne manquante) écrivait alors 0 € de loyer sur tout le segment comblé.
    const base = [{ ref: REF, debut: '2024-01-01', fin: '2024-06-30', hc: 655, ch: 136, source: 'bail', bailDebut: '2024-01-01' }];
    const out = garantirCouvertureBail(base, { ref: REF, debut: '2024-01-01', hc: '', ch: 136 }, '2025-01-01');
    expect(out[1]).toMatchObject({ debut: '2024-07-01', hc: 655, ch: 136 });
  });

  it('un 0 réellement SAISI reste un 0 (montantSaisi distingue vide et zéro)', () => {
    const base = [{ ref: REF, debut: '2024-01-01', fin: '2024-06-30', hc: 655, ch: 136, source: 'bail', bailDebut: '2024-01-01' }];
    const out = garantirCouvertureBail(base, { ref: REF, debut: '2024-01-01', hc: 655, ch: 0 }, '2025-01-01');
    expect(out[1]).toMatchObject({ debut: '2024-07-01', hc: 655, ch: 0 });
  });

  it('le segment comblé DIT pourquoi il ne commence pas à la date du bail', () => {
    const base = [{ ref: REF, debut: '2024-01-01', fin: '2024-06-30', hc: 700, ch: 90, source: 'bail', bailDebut: '2024-01-01' }];
    const out = garantirCouvertureBail(base, { ref: REF, debut: '2024-01-01', hc: 700, ch: 90 }, '2025-01-01');
    expect(out[1].note).toBe('Complété : période non couverte par le barème');
  });

  it('HORIZON — rien n\'est écrit au-delà de la date d\'effet annoncée', () => {
    const base = [{ ref: REF, debut: '2023-01-01', fin: '2027-12-31', hc: 677, ch: 90, source: 'manuel', bailDebut: '2023-01-01' }];
    // le trou commence APRÈS l'horizon : rien à geler
    expect(garantirCouvertureBail(base, { ref: REF, debut: '2023-01-01', hc: 700, ch: 90 }, '2026-09-01')).toEqual(base);
    // et sans horizon, la queue ouverte n'est pas posée non plus (elle ne commence pas au bail)
    expect(garantirCouvertureBail(base, { ref: REF, debut: '2023-01-01', hc: 700, ch: 90 })).toEqual(base);
  });

  it('… mais la période du bail LUI-MÊME est bien posée (bail neuf, re-bail)', () => {
    expect(garantirCouvertureBail([], { ref: REF, debut: '2026-09-01', hc: 640, ch: 95 }))
      .toEqual([expect.objectContaining({ debut: '2026-09-01', fin: null, hc: 640, ch: 95, source: 'bail' })]);
    const apresCloture = [{ ref: REF, debut: '2024-01-01', fin: '2026-02-28', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }];
    const out = garantirCouvertureBail(apresCloture, { ref: REF, debut: '2026-03-01', hc: 850, ch: 130 });
    expect(out[1]).toMatchObject({ debut: '2026-03-01', fin: null, hc: 850, bailDebut: '2026-03-01' });
  });

  it('DEUX trous, DEUX segments : la tête ET l\'intervalle, pas seulement le dernier', () => {
    // Le cas reel : une correction bornee au milieu de rien. Le bail commence avant elle (trou de
    // tete) et la revision qu'on s'apprete a ecrire vient apres (trou intermediaire). Les DEUX
    // doivent etre geles - n'en poser qu'un laisse le debut du bail au repli « bail », donc au
    // tarif d'aujourd'hui applique au passe des la revision suivante.
    const base = [{ ref: REF, debut: '2024-01-01', fin: '2024-03-31', hc: 600, ch: 90, source: 'manuel', bailDebut: '2023-09-01' }];
    const bailB1 = { ref: REF, debut: '2023-09-01', hc: 700, ch: 90 };
    const out = garantirCouvertureBail(base, bailB1, '2025-01-01');
    const v = vivantes(out).slice().sort((a, b) => a.debut.localeCompare(b.debut));
    expect(v.map((p) => [p.debut, p.fin, p.hc])).toEqual([
      ['2023-09-01', '2023-12-31', 700],
      ['2024-01-01', '2024-03-31', 600],
      ['2024-04-01', '2024-12-31', 700],
    ]);
    const bails = [{ debut: '2023-09-01', fin: null, finEffective: null, archive: false, hc: 700, ch: 90 }];
    for (const ym of ['2023-09', '2023-12', '2024-04', '2024-12']) {
      expect(duMois({ ref: REF, bails, bareme: out }, ym)).toMatchObject({ total: 790, source: 'bareme' });
    }
    expect(duMois({ ref: REF, bails, bareme: out }, '2024-02').total).toBe(690);
  });

  it('PUR : le tableau d\'entrée n\'est pas muté', () => {
    const base = [{ ref: REF, debut: '2024-01-01', fin: '2024-06-30', hc: 700, ch: 90, source: 'bail', bailDebut: '2024-01-01' }];
    garantirCouvertureBail(base, { ref: REF, debut: '2024-01-01', hc: 700, ch: 90 });
    expect(base).toHaveLength(1);
  });
});

describe('I2 — une ligne écartée reste VISIBLE dans l\'historique du bail', () => {
  // Le module de barème affirmait « la ligne reste dans l'historique, _baremeOfLot la filtre ».
  // FAUX : construireHistoriqueBail filtre lui aussi `_deleted`. Mesuré : après deux validations
  // IRL à la même date d'effet, la ligne 730 € DISPARAISSAIT de la timeline — une saisie détruite
  // en silence, exactement ce que ce chantier combat.
  const contexte = (bareme) => ({
    ref: REF, today: '2026-08-24',
    bailCourant: { ref: REF, debut: '2024-01-01', hc: 700, ch: 100, dg: 700, locataires: [{ nom: 'Martin' }] },
    bauxHistorique: [], bareme, irlHistorique: [], bailEvents: []
  });
  const evs = (bareme) => construireHistoriqueBail(contexte(bareme)).chapitres[0].rail
    .filter((r) => r.kind === 'evenement').map((r) => r.ev);

  it('période REMPLACÉE : un événement porte l\'ancien montant et le nouveau', () => {
    let b = appliquerNouvellePeriode(
      [{ ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }],
      { ref: REF, debut: '2026-09-01', hc: 730, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    b = appliquerNouvellePeriode(b, { ref: REF, debut: '2026-09-01', hc: 742, ch: 100, source: 'irl', bailDebut: '2024-01-01' });
    const e = evs(b).find((x) => x.type === 'periode-remplacee');
    expect(e).toBeTruthy();
    expect(e).toMatchObject({ date: '2026-09-01', avant: 830, apres: 842 });
  });

  it('période ANNULÉE par la clôture : un événement dit pourquoi elle ne s\'appliquera pas', () => {
    const b = cloturerBareme([
      { ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
      { ref: REF, debut: '2027-01-01', fin: null, hc: 800, ch: 100, source: 'irl', bailDebut: '2024-01-01' },
    ], REF, '2026-06-30');
    const e = evs(b).find((x) => x.type === 'periode-annulee');
    expect(e).toMatchObject({ date: '2027-01-01', avant: 900, dateEffet: '2026-06-30' });
  });

  it('un tombstone SANS raison (stock legacy) reste invisible', () => {
    const b = [
      { ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
      { ref: REF, debut: '2025-01-01', fin: null, hc: 1, ch: 1, source: 'irl', bailDebut: '2024-01-01', _deleted: true },
    ];
    expect(evs(b).filter((x) => x.type === 'periode-remplacee' || x.type === 'periode-annulee')).toHaveLength(0);
  });
});

describe('I3 — la clôture est annoncée avant d\'être faite (impactCloture)', () => {
  it('annonce exactement ce que cloturerBareme va faire', () => {
    const b = [
      { ref: REF, debut: '2024-01-01', fin: '2027-12-31', hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' },
      { ref: REF, debut: '2027-01-01', fin: null, hc: 800, ch: 100, source: 'irl', bailDebut: '2024-01-01' },
    ];
    const im = impactCloture(b, REF, '2026-06-30');
    const out = cloturerBareme(b, REF, '2026-06-30');
    expect(im.annulees.map((p) => p.debut)).toEqual(out.filter((p) => p._annuleeParCloture).map((p) => p.debut));
    expect(im.tronquees.map((p) => p.debut)).toEqual(['2024-01-01']);
  });

  it('clôture sans conséquence : rien à annoncer', () => {
    const b = [{ ref: REF, debut: '2024-01-01', fin: null, hc: 700, ch: 100, source: 'bail', bailDebut: '2024-01-01' }];
    expect(impactCloture(b, REF, '2026-06-30')).toEqual({ annulees: [], tronquees: [] });
  });
});
