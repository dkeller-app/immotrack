/**
 * core/finances-summary.js — Agrégation pure pour l'onglet Finances (REPORTING-BAILLEUR).
 *
 * AUCUNE logique métier nouvelle : reçoit des primitives déjà calculées par les
 * fonctions existantes (_computeBilanAnnuel, _compute2044, _listerImpayesActifs,
 * computeIRLRevision, computeRegul) et produit résultat net + ratios + total à
 * récupérer. Pure (pas de DOM, pas de DB) → testable Vitest.
 *
 * @param {Object} input
 * @param {number} input.loyersHC      Loyers hors charges encaissés sur l'exercice
 * @param {number} input.provisions    Provisions sur charges encaissées
 * @param {Object} input.charges       {interets,taxeFonciere,travaux,honoraires,assurance,autres}
 * @param {number} input.loyersHCN1    Loyers HC encaissés N-1
 * @param {number} input.resultatNetN1 Résultat net N-1
 * @param {number} input.nbOcc         Lots occupés
 * @param {number} input.nbTotal       Lots totaux
 * @param {number} input.attenduHC     Loyer HC attendu sur l'exercice (pour recouvrement)
 * @param {number} input.encaisseHC    Loyer HC effectivement encaissé
 * @param {Object} input.recuperer     {vacance,impaye,irl,regul}
 * @returns {Object} résultat agrégé
 */
export function _computeFinancesSummary(input) {
  const i = input || {};
  const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const loyersHC = n(i.loyersHC);
  const c = i.charges || {};
  const totalCharges = n(c.interets) + n(c.taxeFonciere) + n(c.travaux) + n(c.honoraires) + n(c.assurance) + n(c.autres);
  const resultatNet = loyersHC - totalCharges;
  const margePct = loyersHC > 0 ? Math.round(resultatNet / loyersHC * 100) : 0;
  const resultatNetN1 = n(i.resultatNetN1);
  const varPct = resultatNetN1 > 0 ? Math.round((resultatNet - resultatNetN1) / resultatNetN1 * 1000) / 10 : 0;

  const attenduHC = n(i.attenduHC), encaisseHC = n(i.encaisseHC);
  const nbTotal = n(i.nbTotal), nbOcc = n(i.nbOcc);
  const ratios = {
    recouvrement: attenduHC > 0 ? Math.round(encaisseHC / attenduHC * 1000) / 10 : 0,
    occupation:   nbTotal > 0 ? Math.round(nbOcc / nbTotal * 100) : 0,
    poidsCharges: loyersHC > 0 ? Math.round(totalCharges / loyersHC * 1000) / 10 : 0
  };

  const rec = i.recuperer || {};
  const aRecuperer = {
    vacance: n(rec.vacance), impaye: n(rec.impaye), irl: n(rec.irl), regul: n(rec.regul),
    total: n(rec.vacance) + n(rec.impaye) + n(rec.irl) + n(rec.regul)
  };

  return { loyersHC, provisions: n(i.provisions), totalEncaisse: loyersHC + n(i.provisions),
           totalCharges, resultatNet, margePct, resultatNetN1, loyersHCN1: n(i.loyersHCN1), varPct, ratios, aRecuperer };
}
