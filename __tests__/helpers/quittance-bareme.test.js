import { describe, it, expect } from 'vitest';
import { duMois, duMoisFromRaw } from '../../js/core/loyer-du-mois.js';

/**
 * CDC-QUITTANCES-IRL étape 2 — « la quittance lit le barème ».
 *
 * I1 : aucune quittance émise ne modifie un calcul — `duMois` est strictement
 *      insensible aux quittances (2 sources seulement : bail+barème pour le dû,
 *      import pour le payé — décision user 16/07).
 * I5 : le montant d'une quittance est celui du BARÈME DU MOIS, pas du bail courant
 *      (C4) — ré-éditer une quittance d'un mois antérieur donne le même montant
 *      après une révision IRL.
 */

// Le lot d'Ohl : bail au 15/09/2023, 700 € HC + 80 € de charges, révisé au 01/09/2026.
const REF = 'MUTZIG-B1';
const BAIL_APRES_REVISION = { debut: '2023-09-15', fin: null, hc: 733.32, ch: 80 };
const BAREME_AVANT = [
  { ref: REF, debut: '2023-09-15', fin: null, hc: 700, ch: 80, source: 'bail' }
];
const BAREME_APRES = [
  { ref: REF, debut: '2023-09-15', fin: '2026-08-31', hc: 700, ch: 80, source: 'bail' },
  { ref: REF, debut: '2026-09-01', fin: null, hc: 733.32, ch: 80, source: 'irl' }
];

// ═══════════════════════════════════════════════════════════════════════════
//  I5 — le barème du mois, jamais le loyer d'aujourd'hui
// ═══════════════════════════════════════════════════════════════════════════

describe('I5 — le montant d\'une quittance est celui du barème du mois', () => {
  const avant = (ym) => duMoisFromRaw(REF, ym, {
    currentBail: { debut: '2023-09-15', fin: null, hc: 700, ch: 80 },
    bauxHistorique: [], bareme: BAREME_AVANT
  });
  const apres = (ym) => duMoisFromRaw(REF, ym, {
    currentBail: BAIL_APRES_REVISION, bauxHistorique: [], bareme: BAREME_APRES
  });

  it('avant la révision, juin 2026 vaut 780 €', () => {
    expect(avant('2026-06').total).toBe(780);
  });

  it('APRÈS la révision, juin 2026 vaut TOUJOURS 780 € — ré-éditer donne le même document', () => {
    expect(apres('2026-06').total).toBe(avant('2026-06').total);
    expect(apres('2026-06').hc).toBe(700);
  });

  it('le mois d\'effet, lui, porte le nouveau loyer', () => {
    expect(apres('2026-09').hc).toBe(733.32);
    expect(apres('2026-09').total).toBe(813.32);
  });

  it('aucun mois ANTÉRIEUR à la date d\'effet n\'est touché par la révision', () => {
    for (const ym of ['2024-01', '2025-06', '2026-01', '2026-07', '2026-08']) {
      expect(apres(ym).hc).toBe(700);
    }
  });

  it('le bail courant (733,32 €) ne contamine JAMAIS un mois passé (C4)', () => {
    // C'est exactement le bug corrigé : genAllQuit lisait `bail.hc`.
    expect(apres('2026-05').hc).not.toBe(BAIL_APRES_REVISION.hc);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  I1 — la quittance ne pilote aucun calcul
// ═══════════════════════════════════════════════════════════════════════════

describe('I1 — émettre / modifier / supprimer une quittance ne change aucun dû', () => {
  const ctx = { ref: REF, bails: [{ debut: '2023-09-15', hc: 700, ch: 80 }], bareme: BAREME_AVANT };
  const MOIS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

  it('duMois ignore une collection de quittances passée dans le contexte', () => {
    const sansQ = MOIS.map(ym => duMois(ctx, ym).total);
    const avecQ = MOIS.map(ym => duMois(
      Object.assign({}, ctx, {
        quittances: [
          { logement: REF, mois: 'juin 2026', hc: 9999, ch: 9999 },
          { logement: REF, mois: 'mai 2026', hc: 0, ch: 0, _deleted: true }
        ]
      }), ym).total);
    expect(avecQ).toEqual(sansQ);
  });

  it('duMoisFromRaw ignore raw.quittances (la clé n\'existe plus dans le contrat)', () => {
    const raw = { currentBail: { debut: '2023-09-15', hc: 700, ch: 80 }, bauxHistorique: [], bareme: BAREME_AVANT };
    const sans = MOIS.map(ym => duMoisFromRaw(REF, ym, raw).total);
    const avec = MOIS.map(ym => duMoisFromRaw(REF, ym,
      Object.assign({}, raw, { quittances: [{ logement: REF, mois: 'juin 2026', hc: 1, ch: 1 }] })).total);
    expect(avec).toEqual(sans);
    expect(sans.every(t => t === 780)).toBe(true);
  });

  it('supprimer TOUTES les quittances ne change rien (elles ne sont pas une source)', () => {
    const raw = { currentBail: { debut: '2023-09-15', hc: 700, ch: 80 }, bauxHistorique: [], bareme: BAREME_AVANT };
    const avecTout = MOIS.map(ym => duMoisFromRaw(REF, ym, Object.assign({}, raw, { quittances: [] })).total);
    expect(avecTout).toEqual(MOIS.map(() => 780));
  });
});
