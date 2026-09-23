/**
 * R0-H — le manque à gagner d'une vacance appliquait le loyer d'AUJOURD'HUI à des jours
 * vides PASSÉS.
 *
 * Deux moteurs le calculaient, avec deux sources différentes — `bailCourant.hc` dans
 * `_computeBilanAnnuel`, `lot.loyerHcRef || lot.hc` dans `_computeOccupationLots` — et la même
 * infraction à I-1 (« le loyer d'aujourd'hui appliqué à tout le passé ») que le CDC déclare
 * supprimée. Un lot vidé à 800 €, reloué 900 € puis révisé à 950 € se voyait imputer sa
 * vacance à 950 €.
 *
 * Ces tests passent par les fonctions PUBLIQUES du module : c'est le chiffre rendu qui est
 * vérifié, pas la forme du code.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
import { _computeOccupationLots, loyerHcDuLotA, loyerDuLotA } from '../../js/core/legal-bilan.js';

const LOT = { ref: 'A-1', hc: 950, loyerHcRef: 950 };

/** Un parc d'un lot, vidé fin juin, reloué au 1ᵉʳ octobre. */
const DB_BASE = {
  logements: [LOT],
  baux: { 'A-1': { ref: 'A-1', debut: '2026-10-01', hc: 900 } },
  baux_historique: [
    { ref: 'A-1', debut: '2023-01-01', fin: '2024-12-31', finEffective: '2024-12-31', hc: 700 },
    { ref: 'A-1', debut: '2025-01-01', fin: '2026-06-30', finEffective: '2026-06-30', hc: 800 }
  ],
  loyerBareme: []
};

const occ = (db, from, to) => _computeOccupationLots(db, db.logements, { from, to });

describe('La vacance est valorisée au loyer de SON époque', () => {
  it('juillet→septembre vides : 800 €, le loyer du bail qui venait de finir', () => {
    // 92 jours du 01/07 au 30/09. AVANT : 92/30,44 × 950 € = 2 871 € (le loyer d'aujourd'hui).
    const r = occ(DB_BASE, '2026-07-01', '2026-09-30');
    expect(r.occDays).toBe(0);
    expect(r.louableDays).toBe(92);
    expect(r.manqueAGagner).toBe(2417.87);                 // 92/30,44 × 800, et non × 950
  });

  it('le BARÈME l’emporte sur le bail — c’est l’historique du loyer', () => {
    const db = { ...DB_BASE, loyerBareme: [{ ref: 'A-1', debut: '2026-05-01', hc: 860 }] };
    const r = occ(db, '2026-07-01', '2026-09-30');
    expect(r.manqueAGagner).toBe(2599.21);                // 92/30,44 × 860
  });

  it('un lot occupé toute la période ne manque rien', () => {
    const db = { ...DB_BASE, baux: { 'A-1': { ref: 'A-1', debut: '2020-01-01', hc: 900 } }, baux_historique: [] };
    const r = occ(db, '2026-01-01', '2026-12-31');
    expect(r.occDays).toBe(365);
    expect(r.manqueAGagner).toBe(0);
  });

  it('une vacance ENTRE deux baux n’attrape pas le loyer du bail suivant', () => {
    // Le lot valait 800 € quand il s'est vidé. Qu'il reparte à 900 € ne change pas ce que la
    // vacance a coûté : on ne facture pas le passé au prix du présent.
    const r = occ(DB_BASE, '2026-01-01', '2026-12-31');
    // Occupé du 01/01 au 30/06 (181 j) et du 01/10 au 31/12 (92 j) = 273 j ; 92 j vides.
    expect(r.occDays).toBe(273);
    expect(r.manqueAGagner).toBe(2417.87);
  });
});

describe('Les jours occupés et les jours vides sortent de la MÊME décomposition', () => {
  it('deux baux qui se CHEVAUCHENT ne facturent pas 92 jours pour 1 jour affiché', () => {
    // Le compte des jours occupés ADDITIONNAIT les baux puis écrêtait ; les segments vides,
    // eux, prenaient l'union. Le même objet renvoyait donc « 99,7 % d'occupation » et
    // « 2 720,11 € de manque à gagner ». Deux lignes d'historique pour la même ref existent
    // (la clé de synchro est `ref|_archivedAt`), et un bail courant peut y être recopié.
    const db = {
      logements: [LOT],
      baux: {},
      baux_historique: [
        { ref: 'A-1', debut: '2026-01-01', finEffective: '2026-06-30', hc: 800 },
        { ref: 'A-1', debut: '2026-04-01', finEffective: '2026-09-30', hc: 900 }
      ],
      loyerBareme: []
    };
    const r = occ(db, '2026-01-01', '2026-12-31');
    expect(r.occDays).toBe(273);                 // 01/01 → 30/09, pas 364
    // Les 92 jours vides sont valorisés à 900 € : c'est le bail qui courait encore le 30/09.
    expect(r.manqueAGagner).toBe(2720.11);
    // L'invariant qui manquait : le manque à gagner porte sur les jours RÉELLEMENT vides.
    expect(r.louableDays - r.occDays).toBe(92);
    expect(Math.round((r.manqueAGagner * 30.44) / 900)).toBe(92);
  });

  it('un bail COURANT recopié dans l’historique ne fabrique pas de manque à gagner', () => {
    // Avant : « 100 % d'occupation, aucun lot vacant, 1 550,59 € de manque à gagner ».
    const db = {
      logements: [LOT],
      baux: { 'A-1': { ref: 'A-1', debut: '2026-03-01', hc: 800 } },
      baux_historique: [{ ref: 'A-1', debut: '2026-03-01', finEffective: '2026-12-31', hc: 800 }],
      loyerBareme: []
    };
    const r = occ(db, '2026-01-01', '2026-12-31');
    expect(r.occDays).toBe(306);                 // 01/03 → 31/12
    expect(r.manqueAGagner).toBe(1550.59);       // les 59 jours de janvier-février, eux, sont vides
  });
});

describe('Les changements d’heure ne déplacent aucun jour', () => {
  // À Paris, `+ 86 400 000 ms` sur le 25 octobre donne le 25 à 23 h. L'arithmétique est
  // désormais en UTC, où un jour dure exactement 86 400 000 ms toute l'année.
  const trou = (finBail, repriseBail) => ({
    logements: [LOT],
    baux: { 'A-1': { ref: 'A-1', debut: repriseBail, hc: 900 } },
    baux_historique: [{ ref: 'A-1', debut: '2025-01-01', finEffective: finBail, hc: 800 }],
    loyerBareme: []
  });

  it('PRINTEMPS : un trou d’un seul jour n’est pas avalé', () => {
    // Le bail finit le 28/03, le suivant commence le 30/03 : le 29/03 est vide — et c'est le
    // jour du passage à l'heure d'été. Le manque à gagner rendait 0 € pour 1 jour compté vide.
    const r = occ(trou('2026-03-28', '2026-03-30'), '2026-01-01', '2026-12-31');
    expect(r.occDays).toBe(364);
    expect(r.manqueAGagner).toBe(26.28);         // 1/30,44 × 800, et non 0
  });

  it('AUTOMNE : une vacance qui suit la bascule n’est pas datée la veille', () => {
    // Le barème est refermé à la date de sortie du locataire : lire la vacance un jour trop
    // tôt la valorisait AU TARIF DE LA PÉRIODE CLOSE — I-1, en plus petit.
    const db = {
      logements: [LOT],
      baux: {},
      baux_historique: [{ ref: 'A-1', debut: '2025-01-01', finEffective: '2026-10-25', hc: 800 }],
      // Correction datée : le barème dit 830 € JUSQU'AU 25/10, puis plus rien.
      loyerBareme: [{ ref: 'A-1', debut: '2025-01-01', fin: '2026-10-25', hc: 830 }]
    };
    const r = occ(db, '2026-10-26', '2026-12-31');
    expect(r.occDays).toBe(0);
    expect(r.manqueAGagner).toBe(1760.84);       // 67 j × 800 (le bail), et non × 830
  });

  it('une année entière compte 365 jours, bascules comprises', () => {
    const db = { logements: [LOT], baux: { 'A-1': { ref: 'A-1', debut: '2020-01-01', hc: 800 } }, baux_historique: [], loyerBareme: [] };
    expect(occ(db, '2026-01-01', '2026-12-31').occDays).toBe(365);
    expect(occ(db, '2024-01-01', '2024-12-31').occDays).toBe(366);   // bissextile
  });
});

describe('loyerHcDuLotA — la chaîne des sources, dans l’ordre', () => {
  const ctx = {
    bareme: [],
    bailCourant: DB_BASE.baux['A-1'],
    hists: DB_BASE.baux_historique,
    lot: LOT
  };

  it('le bail EN COURS à cette date', () => {
    // Le 31 décembre, le lot est reloué depuis le 1ᵉʳ octobre : c'est CE bail qui vaut.
    // Sans cette branche, la recherche ne regardait que les baux TERMINÉS et renvoyait 800 €.
    expect(loyerHcDuLotA('2026-12-31', 'A-1', ctx)).toBe(900);
    expect(loyerHcDuLotA('2025-06-15', 'A-1', ctx)).toBe(800);   // dans le 2ᵉ bail
    expect(loyerHcDuLotA('2023-06-15', 'A-1', ctx)).toBe(700);   // dans le 1ᵉʳ
  });

  it('le bail TERMINÉ le plus récemment, quand le lot est VIDE à cette date', () => {
    expect(loyerHcDuLotA('2026-08-15', 'A-1', ctx)).toBe(800);
  });

  it('un vrai TROU entre deux baux prend le loyer d’avant le trou', () => {
    const avecTrou = {
      bareme: [], bailCourant: null, lot: LOT,
      hists: [
        { ref: 'A-1', debut: '2023-01-01', finEffective: '2024-06-30', hc: 700 },
        { ref: 'A-1', debut: '2025-01-01', finEffective: '2026-06-30', hc: 800 }
      ]
    };
    expect(loyerHcDuLotA('2024-09-15', 'A-1', avecTrou)).toBe(700);   // dans le trou
    expect(loyerHcDuLotA('2025-03-15', 'A-1', avecTrou)).toBe(800);   // après le trou, occupé
  });

  it('l’ordre du TABLEAU ne décide de rien — la date de fin décide', () => {
    // L'ancien code prenait `hists[hists.length - 1]`. Ici le plus ancien est en dernier.
    const inverse = { ...ctx, hists: [...DB_BASE.baux_historique].reverse() };
    expect(loyerHcDuLotA('2026-08-15', 'A-1', inverse)).toBe(800);
    expect(inverse.hists[inverse.hists.length - 1].hc).toBe(700);   // le piège, s'il revenait
  });

  it('avant TOUT bail : le premier bail à venir, faute de mieux', () => {
    expect(loyerHcDuLotA('2022-03-01', 'A-1', ctx)).toBe(700);
  });

  it('aucun bail du tout : la fiche du lot, en dernier recours', () => {
    expect(loyerHcDuLotA('2026-08-15', 'A-1', { bareme: [], hists: [], lot: LOT })).toBe(950);
    expect(loyerHcDuLotA('2026-08-15', 'A-1', { bareme: [], hists: [], lot: { hc: 640 } })).toBe(640);
  });

  it('rien nulle part : zéro, jamais NaN ni undefined', () => {
    expect(loyerHcDuLotA('2026-08-15', 'A-1', {})).toBe(0);
    expect(loyerHcDuLotA('2026-08-15', 'A-1', { hists: [{ ref: 'A-1' }], lot: {} })).toBe(0);
    expect(loyerHcDuLotA('', 'A-1', ctx)).toBe(0);
    expect(loyerHcDuLotA(null, 'A-1', ctx)).toBe(0);
  });

  it('un bail sans loyer ne masque pas celui d’avant', () => {
    // Un montant jamais saisi est une LACUNE, pas un loyer de zéro. S'arrêter au bail le plus
    // récent faisait retomber sur la fiche du lot — c'est-à-dire sur le loyer d'AUJOURD'HUI,
    // le défaut I-1 que tout ce lot corrige. On remonte jusqu'au dernier montant connu.
    const sansHc = {
      bareme: [], hists: [
        { ref: 'A-1', debut: '2023-01-01', finEffective: '2024-12-31', hc: 700 },
        { ref: 'A-1', debut: '2025-01-01', finEffective: '2026-06-30' }      // hc manquant
      ], lot: { hc: 9999 }
    };
    expect(loyerHcDuLotA('2026-08-15', 'A-1', sansHc)).toBe(700);
  });

  it('un loyer de 0 RÉELLEMENT saisi vaut 0 — ce n’est pas une lacune', () => {
    // Logement de fonction, bail à titre gratuit : rejeter ce 0 faisait valoriser la vacance
    // au loyer du bail d'avant, donc un manque à gagner sur un lot qui ne rapportait rien.
    const gratuit = {
      bareme: [], hists: [
        { ref: 'A-1', debut: '2023-01-01', finEffective: '2024-12-31', hc: 700 },
        { ref: 'A-1', debut: '2025-01-01', finEffective: '2026-06-30', hc: 0 }
      ], lot: { hc: 9999 }
    };
    expect(loyerHcDuLotA('2026-08-15', 'A-1', gratuit)).toBe(0);
  });

  it('`hc` et `ch` viennent de la MÊME source, jamais l’un du barème et l’autre du bail', () => {
    // Trois écrans valorisaient une vacance à `hc + ch`, chacun avec sa façon de trouver
    // « le dernier bail ». Le lecteur daté rend les deux ensemble.
    const mix = {
      bareme: [{ ref: 'A-1', debut: '2026-01-01', hc: 860, ch: 120 }],
      bailCourant: null, lot: { hc: 9999, ch: 9999 },
      hists: [{ ref: 'A-1', debut: '2025-01-01', finEffective: '2026-06-30', hc: 800, ch: 90 }]
    };
    expect(loyerDuLotA('2026-08-15', 'A-1', mix)).toEqual({ hc: 860, ch: 120 });   // le barème
    const sansBareme = { ...mix, bareme: [] };
    expect(loyerDuLotA('2026-08-15', 'A-1', sansBareme)).toEqual({ hc: 800, ch: 90 });  // le bail
  });

  it('`loyerDuLotA` ne rend jamais `undefined` dans une addition', () => {
    // `hc + ch` sur un retour dégradé donnerait NaN, qui se propage en silence jusqu'à l'écran.
    for (const arg of [[null, 'A-1', {}], ['', 'A-1', ctx], ['2026-08-15', 'A-1', undefined]]) {
      const r = loyerDuLotA(...arg);
      expect(Number.isFinite(r.hc + r.ch), JSON.stringify(arg)).toBe(true);
    }
  });

  it('un bail CLÔTURÉ sans `finEffective` est quand même terminé à sa date de fin', () => {
    // Trois lectures de « fin de bail » cohabitaient : celle-ci ne regardait que
    // `finEffective`, donc un tel bail n'était « en cours » à AUCUNE date.
    const ctxClot = {
      bareme: [], bailCourant: null, lot: { hc: 9999 },
      hists: [{ ref: 'A-1', debut: '2025-01-01', fin: '2026-06-30', cloture: true, hc: 820 }]
    };
    expect(loyerHcDuLotA('2026-03-15', 'A-1', ctxClot)).toBe(820);   // pendant le bail
    expect(loyerHcDuLotA('2026-08-15', 'A-1', ctxClot)).toBe(820);   // après, dernier connu
  });
});

describe('La tacite reconduction ne crée pas de vacance à valoriser', () => {
  it('un bail dont la fin est passée mais qui n’est pas clôturé reste occupé', () => {
    // R0-E : seule la clôture termine un bail. Sans ça, le cas le plus courant du parc — un
    // bail nu non dénoncé — fabriquait une vacance, donc un manque à gagner inventé.
    const db = {
      logements: [LOT],
      baux: { 'A-1': { ref: 'A-1', debut: '2023-01-01', fin: '2025-12-31', hc: 900 } },
      baux_historique: [], loyerBareme: []
    };
    const r = occ(db, '2026-01-01', '2026-12-31');
    expect(r.occDays).toBe(365);
    expect(r.manqueAGagner).toBe(0);
  });
});

describe('« Le dernier bail » d’un lot — lu sur la date de FIN, pas sur l’ordre du tableau', () => {
  /** Extrait `_getLastBailForLog` d'index.html et l'exécute. */
  function dernierBail(bails) {
    const src = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, '');
    const i = src.indexOf('function _getLastBailForLog(');
    const j = src.indexOf('\n}', i);
    if (i === -1 || j === -1) throw new Error('fonction introuvable — le test ne teste plus rien');
    return new Function('_getAllBailsForLog',
      src.slice(i, j + 2) + '\nreturn _getLastBailForLog;')(() => bails)('A-1');
  }

  it('deux baux qui se chevauchent : celui qui finit le plus tard gagne', () => {
    // `_getAllBailsForLog` trie par DÉBUT. Un bail commencé avant et fini après un autre se
    // retrouvait donc avant lui dans le tableau, et `bails[bails.length-1]` désignait le mauvais.
    // Mesuré dans l'app : « dernier bail : 660 € » au lieu de 890 €, et un manque à gagner de
    // 1 843 € au lieu de 2 485 €.
    const b = dernierBail([
      { debut: '2023-01-01', fin: '2026-06-30', hc: 800, ch: 90 },
      { debut: '2024-01-01', fin: '2025-03-31', hc: 600, ch: 60 }
    ]);
    expect(b.hc + b.ch).toBe(890);
  });

  it('un bail EN COURS l’emporte sur tous les baux terminés', () => {
    const b = dernierBail([
      { debut: '2023-01-01', fin: '2026-06-30', hc: 800, ch: 90 },
      { debut: '2026-07-01', fin: null, hc: 950, ch: 110 }
    ]);
    expect(b.hc + b.ch).toBe(1060);
  });

  it('le cas ordinaire — baux successifs — ne bouge pas', () => {
    const b = dernierBail([
      { debut: '2022-01-01', fin: '2024-12-31', hc: 600, ch: 60 },
      { debut: '2025-01-01', fin: '2026-06-30', hc: 800, ch: 90 }
    ]);
    expect(b.hc + b.ch).toBe(890);
  });

  it('aucun bail → null, pas une exception', () => {
    expect(dernierBail([])).toBe(null);
  });
});
