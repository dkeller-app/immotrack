/**
 * core/quittances-actives.js — Quittances actives v15.10 Sprint 11 V1.1
 *
 * Helpers purs (sans DB / DOM) : statut d'une quittance + escalade des rappels.
 *
 * CDC-QUITTANCES-IRL étape 1 (C3 / D7 / I6) — le 7ᵉ MOTEUR D'IMPUTATION EST SUPPRIMÉ.
 * `_matcheMois()` rattachait un paiement au mois calendaire de sa propre date, et
 * `_matchPaiementQuittance()` recollait un mouvement sur une quittance à ±5 € près.
 * Les deux contredisaient le résolveur unique (décisions 09/07 et 14/07). Le
 * rattachement paiement→mois vit désormais UNIQUEMENT dans `_loyerArrearsPass` /
 * `_computeLoyerNetting` / `_computeLoyerStatut`, lus par js/core/loyers-mois.js.
 * `_statutQuittance` ne compte donc plus les mouvements : il REÇOIT le montant déjà
 * imputé au mois (`ctx.montantPaye`).
 *
 * Tests Vitest miroir : __tests__/helpers/quittances-actives.test.js
 */

import { moisFrToYm, ymToMoisFr } from './loyers-mois.js';

// ────────────────────────────────────────────────────────────────────────────
// Statut dynamique d'une quittance — 7 états
// ────────────────────────────────────────────────────────────────────────────

const QUITTANCE_STATUS = {
  ATTENDUE:        'attendue',           // mois en cours / futur, pas encore en retard
  PAYEE:           'payée',               // paiement reçu ≥ montant attendu
  PARTIELLE:       'partielle',           // paiement reçu mais < montant attendu
  IMPAYEE_J5:      'impayée_J5',          // J+5 après date d'échéance
  IMPAYEE_J15:     'impayée_J15',         // J+15
  IMPAYEE_J30:     'impayée_J30',         // J+30 → mise en demeure
  MISE_EN_DEMEURE: 'mise_en_demeure'      // mise en demeure envoyée
};

/**
 * Calcule le statut d'une quittance à une date de référence.
 *
 * @param {object} quittance - { mois, logement, hc, ch, dateEcheance?, miseEnDemeureEnvoyee? }
 * @param {object} ctx - { montantPaye } — montant DÉJÀ IMPUTÉ à ce mois par la cascade
 *   unique (js/core/loyers-mois.js → `_loyerArrearsPass`). Ce module ne rattache plus
 *   aucun mouvement à un mois : c'était le 7ᵉ moteur (C3), il est supprimé.
 * @param {Date|string} [dateRef=today] - date de référence pour le calcul
 * @returns {{ statut: string, montantAttendu: number, montantPaye: number, joursRetard: number }}
 */
export function _statutQuittance(quittance, ctx, dateRef) {
  if (!quittance) {
    return { statut: QUITTANCE_STATUS.ATTENDUE, montantAttendu: 0, montantPaye: 0, joursRetard: 0 };
  }
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  const montantAttendu = (Number(quittance.hc)||0) + (Number(quittance.ch)||0);
  const montantPaye = Math.max(0, Number(ctx && ctx.montantPaye) || 0);
  const mois = quittance.mois;

  // Cas spécial : mise en demeure déjà envoyée
  if (quittance.miseEnDemeureEnvoyee) {
    return { statut: QUITTANCE_STATUS.MISE_EN_DEMEURE, montantAttendu, montantPaye, joursRetard: 0 };
  }

  if (montantPaye >= montantAttendu && montantAttendu > 0) {
    return { statut: QUITTANCE_STATUS.PAYEE, montantAttendu, montantPaye, joursRetard: 0 };
  }
  if (montantPaye > 0 && montantPaye < montantAttendu) {
    return { statut: QUITTANCE_STATUS.PARTIELLE, montantAttendu, montantPaye, joursRetard: 0 };
  }

  // Pas (encore) payé — calcul du retard
  const dateEch = quittance.dateEcheance ? new Date(quittance.dateEcheance + 'T00:00:00') : _moisToDate(mois);
  if (!dateEch || Number.isNaN(dateEch.getTime())) {
    return { statut: QUITTANCE_STATUS.ATTENDUE, montantAttendu, montantPaye, joursRetard: 0 };
  }
  const joursRetard = Math.floor((today.getTime() - dateEch.getTime()) / 86400000);
  if (joursRetard < 5) return { statut: QUITTANCE_STATUS.ATTENDUE, montantAttendu, montantPaye, joursRetard };
  if (joursRetard < 15) return { statut: QUITTANCE_STATUS.IMPAYEE_J5, montantAttendu, montantPaye, joursRetard };
  if (joursRetard < 30) return { statut: QUITTANCE_STATUS.IMPAYEE_J15, montantAttendu, montantPaye, joursRetard };
  return { statut: QUITTANCE_STATUS.IMPAYEE_J30, montantAttendu, montantPaye, joursRetard };
}

/** Convertit « janvier 2026 » (ou « 2026-01 ») → Date(2026-01-01) pour le calcul d'échéance.
 *  DRY : la reconnaissance du libellé vit dans loyers-mois.js (`moisFrToYm`), source unique. */
function _moisToDate(moisStr) {
  const ym = moisFrToYm(moisStr);
  return ym ? new Date(ym + '-01T00:00:00') : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Workflow escalade — niveau d'alerte
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pour un statut donné, retourne les métadonnées d'alerte (sévérité, action proposée).
 *
 * @param {string} statut - issu de _statutQuittance
 * @returns {{ severity: 'info'|'warn'|'err', label: string, emailType: string|null }}
 */
export function _escaladeAlerte(statut) {
  switch (statut) {
    case QUITTANCE_STATUS.PAYEE:
      return { severity: 'info', label: '✓ Payée', emailType: null };
    case QUITTANCE_STATUS.PARTIELLE:
      return { severity: 'warn', label: '⚠ Paiement partiel', emailType: 'rappel-impaye-1' };
    case QUITTANCE_STATUS.ATTENDUE:
      return { severity: 'info', label: '⏳ Attendue', emailType: 'avis-echeance' };
    case QUITTANCE_STATUS.IMPAYEE_J5:
      return { severity: 'warn', label: '⚠ Impayée J+5', emailType: 'rappel-impaye-1' };
    case QUITTANCE_STATUS.IMPAYEE_J15:
      return { severity: 'warn', label: '⚠ Impayée J+15', emailType: 'rappel-impaye-2' };
    case QUITTANCE_STATUS.IMPAYEE_J30:
      return { severity: 'err',  label: '🚨 Impayée J+30 — Mise en demeure', emailType: 'rappel-impaye-3' };
    case QUITTANCE_STATUS.MISE_EN_DEMEURE:
      return { severity: 'err',  label: '🚨 Mise en demeure envoyée', emailType: null };
    default:
      return { severity: 'info', label: 'Statut inconnu', emailType: null };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Génération auto mensuelle — planificateur idempotent
// ────────────────────────────────────────────────────────────────────────────

/**
 * Liste les baux actifs pour lesquels une quittance du mois courant DOIT être générée
 * (et n'existe pas déjà). Helper pur — la création effective est faite côté UI.
 *
 * @param {Array} logements - DB.logements
 * @param {object} baux - DB.baux
 * @param {Array} quittances - DB.quittances
 * @param {Date|string} [dateRef=today]
 * @returns {Array<{ref, locataire, hc, ch, mois}>}
 */
export function _planQuittancesAGenerer(logements, baux, quittances, dateRef) {
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  const moisIdx = today.getMonth();
  const moisLabel = ymToMoisFr(today.getFullYear() + '-' + String(moisIdx + 1).padStart(2, '0'));
  const out = [];
  for (const l of (logements||[])) {
    if (!l || l._deleted || l.archived) continue;
    if (!l.locataire) continue;
    const bail = baux && baux[l.ref];
    if (!bail || bail.cloture) continue;
    // bail actif ce mois ?
    if (bail.debut) {
      const dDebut = new Date(bail.debut + 'T00:00:00');
      if (dDebut > today) continue;
    }
    if (bail.fin) {
      const dFin = new Date(bail.fin + 'T23:59:59');
      if (dFin < today) continue;
    }
    // Quittance déjà existe ?
    const exists = (quittances||[]).some(q => q && !q._deleted && q.logement === l.ref && q.mois === moisLabel);
    if (exists) continue;
    out.push({
      ref: l.ref,
      locataire: l.locataire,
      hc: Number(bail.hc)||Number(l.hc)||0,
      ch: Number(bail.ch)||Number(l.ch)||0,
      mois: moisLabel,
      entity: bail.entity || l.entity || ''
    });
  }
  return out;
}

// Constantes exposées
export { QUITTANCE_STATUS };
