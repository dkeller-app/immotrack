/**
 * core/loyer-statut.js — règles PARTAGÉES du suivi des loyers qui survivent au moteur unique.
 *
 * FINANCES-SUIVI-UNIQUE P7 : le statut de paiement d'un locataire (`_computeLoyerStatut`, pool
 * annuel sans report), la position cumulée (`_computeLoyerCumul`), le solde ajusté, la pastille
 * (`_loyerChipVerdict`), le split au mois (`_loyerSplitCascade`) et les arriérés historiques
 * (`_computeLoyerArrears`) ont été SUPPRIMÉS : toutes les surfaces lisent js/core/suivi-loyers.js
 * (le moteur unique par bail). Il reste ici :
 *   - `_computeLoyerChargeAlloc` : la passe FISCALE à l'encaissement (loyers HC / provisions /
 *     avance imposable / base 2044), lue par `_finLoyersHC` et `_computeFinancesMonthly` — INTOUCHÉE ;
 *   - `_loyerTodayLocal` / `_loyerToleranceActive` / `_LOYER_TOLERANCE_JOUR` : l'horloge locale et
 *     la règle de tolérance début de mois, partagées par toutes les surfaces.
 * Copie figée des anciennes fonctions (pour les scripts « avant » du chantier) :
 * docs/subjects/FINANCES-SUIVI-UNIQUE/legacy/.
 */

/**
 * Date du jour en ISO LOCAL (pas toISOString/UTC : l'ancien code inline utilisait
 * getMonth() local — entre minuit et ~2 h un 1er du mois, l'UTC retarderait curMo
 * d'un mois, voire d'un an au 1er janvier. Audit Phase A, point mineur).
 */
export function _loyerTodayLocal(d) {
  const n = d instanceof Date ? d : new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
}

/**
 * Cascade d'imputation CUMULATIVE d'un lot sur l'année (décision user 2026-07-09 :
 * « effacer les dettes avant de faire de l'avance sur loyer »). Passage chronologique :
 * chaque mois comble d'abord SON loyer puis SES charges, puis le reliquat récupère les
 * ARRIÉRÉS (loyer d'abord, puis charges), et seul ce qui reste APRÈS les dettes = loyer
 * perçu d'avance. Attribué au mois qui reçoit (cohérence trésorerie), pas de pull-back.
 * `loyersHC` inclut l'avance (loyer imposable à l'encaissement). « sans bail » (dû 0 partout)
 * → tout en loyer, JAMAIS d'avance (un arriéré n'est pas une avance — audit).
 * @param {Array<{hcDue:number, chDue:number, received:number}>} months chronologiques (échus)
 * @returns {Array<{loyersHC:number, provisions:number, avance:number}>}
 */
export function _computeLoyerChargeAlloc(months) {
  const r2 = n => Math.round(n * 100) / 100;
  const ms = months || [];
  let loyerArrear = 0, chargeArrear = 0;
  return ms.map(m => {
    const hcDue = Math.max(0, Number(m.hcDue) || 0);
    const chDue = Math.max(0, Number(m.chDue) || 0);
    const recv = Number(m.received) || 0;
    // Le reliquat n'est une AVANCE que si le mois a un dû actif (bail en cours). Un paiement sur un
    // mois SANS dû (ancien locataire dont le bail n'est pas résolu, vacance) = loyer encaissé, PAS
    // une avance — sinon changement de locataire → paiements de l'ancien comptés « trop-perçu »
    // (bug user 2026-07-13). Garde-fou PAR MOIS, plus global au lot.
    const monthHasDue = (hcDue + chDue) > 0.005;
    let pool = Math.max(0, recv);
    const loyerCur = Math.min(pool, hcDue); pool -= loyerCur; loyerArrear += (hcDue - loyerCur);
    const chargeCur = Math.min(pool, chDue); pool -= chargeCur; chargeArrear += (chDue - chargeCur);
    const loyerRecov = Math.min(pool, loyerArrear); pool -= loyerRecov; loyerArrear -= loyerRecov;   // arriérés loyer (priorité)
    const chargeRecov = Math.min(pool, chargeArrear); pool -= chargeRecov; chargeArrear -= chargeRecov;
    const leftover = Math.max(0, pool);
    const negAdj = Math.min(0, recv);                       // remboursement net → réduit le loyer du mois
    return {
      loyersHC: r2(loyerCur + loyerRecov + leftover + negAdj),
      provisions: r2(chargeCur + chargeRecov),
      avance: r2(monthHasDue ? leftover : 0),
      // FINANCES étape 2 (sous-ligne « dont rattrapage d'un mois antérieur ») : la part du reçu
      // du mois qui a servi des ARRIÉRÉS de mois précédents — le P&L reste tenu à l'encaissement
      // (le mois qui reçoit porte le montant), la sous-ligne explique le dépassement du dû.
      rattrapage: r2(loyerRecov + chargeRecov)
    };
  });
}

/**
 * LA règle de tolérance début de mois, partagée par toutes les surfaces
 * (réf. _computeImpayes jour < 10 — seule règle conservée ; fin du
 * « 0 impayé sur l'Accueil, 14 sur Finances » — audit constat 45).
 * Tant qu'elle est active, le loyer du mois COURANT pas encore encaissé
 * ne doit pas être présenté comme un retard.
 */
export const _LOYER_TOLERANCE_JOUR = 10;
export function _loyerToleranceActive(todayISO) {
  const d = parseInt(String(todayISO || '').slice(8, 10), 10);
  return Number.isFinite(d) ? d < _LOYER_TOLERANCE_JOUR : false;
}
