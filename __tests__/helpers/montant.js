/**
 * Helpers de validation de montants — SPRINT 1 BUG-HC-GARDE-FOU
 *
 * Stubs testables avant intégration dans index.html.
 * Spec : empêcher saisie de montants HC/CH aberrants qui révèlent une erreur de saisie.
 *
 * Workflow TDD :
 *   1. tests écrits dans __tests__/helpers/montant.test.js
 *   2. Helpers stabilisés ici
 *   3. Portage dans index.html (saveBail / saveParamLog) en Sprint 1E
 */

/**
 * Valide un montant HC (loyer hors charges).
 * Rejet si valeur clairement aberrante :
 *   - HC < 1 (négatif ou nul → invalide)
 *   - HC > 50000 € mensuel (excessif, sauf indication)
 *   - HC non numérique
 *
 * @param {*} value - Valeur saisie (string, number, etc.)
 * @returns {{valid: boolean, value: number, reason?: string}}
 */
export function _validateHC(value) {
  const n = Number(value);
  if (Number.isNaN(n) || value === '' || value == null) {
    return { valid: false, value: 0, reason: 'Montant non numérique' };
  }
  if (n < 1) {
    return { valid: false, value: n, reason: 'Montant nul ou négatif' };
  }
  if (n > 50000) {
    return { valid: false, value: n, reason: 'Montant excessif (> 50 000 €/mois)' };
  }
  return { valid: true, value: n };
}

/**
 * Valide la cohérence HC vs CH (charges).
 * Heuristique : CH ne devrait pas dépasser HC (loyer principal).
 *
 * @param {number} hc
 * @param {number} ch
 * @returns {{coherent: boolean, ratio: number, reason?: string}}
 */
export function _validateHCCH(hc, ch) {
  const hcN = Number(hc) || 0;
  const chN = Number(ch) || 0;
  if (hcN <= 0) return { coherent: false, ratio: 0, reason: 'HC manquant ou nul' };
  if (chN < 0) return { coherent: false, ratio: 0, reason: 'CH négatif' };
  const ratio = chN / hcN;
  if (ratio > 1) {
    return { coherent: false, ratio, reason: 'Charges > loyer principal (anormal)' };
  }
  if (ratio > 0.5) {
    return { coherent: false, ratio, reason: 'Charges > 50% du loyer (à vérifier)' };
  }
  return { coherent: true, ratio };
}

/**
 * Compare une valeur à une médiane et signale les outliers.
 * Utilisé pour détecter une saisie aberrante en référence à un panel.
 *
 * @param {number} value - Valeur à tester
 * @param {number} median - Médiane du panel
 * @param {number} [threshold=10] - Ratio max acceptable
 */
export function _outlierVsMedian(value, median, threshold = 10) {
  const v = Number(value) || 0;
  const m = Number(median) || 0;
  if (m <= 0 || v <= 0) return { outlier: false, ratio: 0 };
  const ratio = v / m;
  if (ratio >= threshold || ratio <= 1 / threshold) {
    return { outlier: true, ratio };
  }
  return { outlier: false, ratio };
}
