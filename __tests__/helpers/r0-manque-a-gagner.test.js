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
import { _computeOccupationLots, loyerHcDuLotA } from '../../js/core/legal-bilan.js';

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
    expect(r.manqueAGagner).toBe(2417.87);                 // 92/30,44 × 800
    const avant = Math.round((92 / 30.44) * 950 * 100) / 100;
    expect(avant).toBe(2871.22);                          // ce que l'ancien calcul donnait
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
    const sansHc = {
      bareme: [], hists: [
        { ref: 'A-1', debut: '2023-01-01', finEffective: '2024-12-31', hc: 700 },
        { ref: 'A-1', debut: '2025-01-01', finEffective: '2026-06-30' }      // hc manquant
      ], lot: {}
    };
    expect(loyerHcDuLotA('2026-08-15', 'A-1', sansHc)).toBe(0);   // on n'invente pas 700
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
