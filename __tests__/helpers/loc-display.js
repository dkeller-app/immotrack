/**
 * Module loc-display — helpers de présentation pour pages Biens/Locataires
 * (ARCHI-FICHES-UNIFIED Session 4, v15.224, audit P3-O)
 *
 * Extraction des helpers pures de index.html pour tests Vitest dédiés.
 * Les versions inline dans index.html restent source de vérité opérationnelle
 * (le module ES sert UNIQUEMENT à la testabilité).
 *
 * Helpers :
 *   - avatarInitials(nom) → initiales pour avatar (filtre civilités)
 *   - echeanceInfo(bail, fdFn) → {cls, text, urgent} avec gestion NaN
 *   - bailProgressPct(bail) → % bail écoulé ou null
 */

import { isTaciteReconductionAllowed } from './bail-types.js';

const CIV_REGEX = /^(M\.?|Mme\.?|Mlle\.?|Mr\.?|Mrs\.?|Dr\.?|Pr\.?|Me\.?)$/i;

/**
 * Calcule les initiales pour un avatar à partir d'un nom complet.
 * Filtre les civilités courantes (M./Mme/Mlle/Mr/Mrs/Dr/Pr/Me).
 * @param {string} nom
 * @returns {string} 1 ou 2 lettres en majuscules, ou '?' si vide
 */
export function avatarInitials(nom) {
  if (!nom) return '?';
  const parts = String(nom).trim().split(/\s+/).filter(p => p && !CIV_REGEX.test(p));
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Calcule l'info d'échéance d'un bail (vert/orange/rouge).
 * Gère explicitement les dates invalides (NaN) → warn au lieu de OK silencieux.
 * @param {object} bail
 * @param {function} fdFn - formatter de date (ex: ISO → "JJ/MM/AAAA"), optionnel
 * @returns {{cls: string, text: string, urgent: boolean}}
 */
export function echeanceInfo(bail, fdFn) {
  if (!bail || !bail.fin) return { cls: 'ok', text: 'Tacite reconduction', urgent: false };
  try {
    const finDate = new Date(bail.fin);
    const finTime = finDate.getTime();
    if (isNaN(finTime)) {
      return { cls: 'warn', text: '⚠ Date invalide', urgent: true };
    }
    const today = new Date();
    const daysLeft = Math.floor((finTime - today.getTime()) / 86400000);
    const finLbl = fdFn ? fdFn(bail.fin) : String(bail.fin);
    if (daysLeft >= 0) {
      // Échéance à venir : alerte préavis si < 90 jours, sinon « en cours ».
      if (daysLeft < 90) return { cls: 'warn', text: `${finLbl} (${daysLeft}j)`, urgent: true };
      return { cls: 'ok', text: finLbl, urgent: false };
    }
    // v15.343 BUG-STATUT-TACITE — Échéance dépassée : distinguer
    //   • tacite reconduction (nu/meublé) → le bail se prolonge, PAS « échu »
    //   • échu réel (étudiant/mobilité/garage/autre, non reconductibles)
    if (isTaciteReconductionAllowed(bail.type || 'nu')) {
      return { cls: 'ok', text: 'Tacite reconduction', urgent: false };
    }
    return { cls: 'err', text: `Échu (${finLbl})`, urgent: true };
  } catch (e) {
    return { cls: 'warn', text: '⚠ Erreur date', urgent: true };
  }
}

/**
 * v15.343 BUG-STATUT-TACITE — Un bail rend-il le logement OCCUPÉ (non vacant) ?
 * La vacance dépend uniquement de l'existence d'un bail vivant et non terminé,
 * JAMAIS de la simple échéance : un bail dont `bail.fin` est dépassée peut être
 * tacitement reconduit (nu/meublé) OU échu réel (étudiant/mobilité) — dans les
 * deux cas le logement n'est PAS « vacant » tant que le bail n'a pas été
 * clôturé (`cloture`) ou résilié (`finEffective`).
 * @param {object} bail
 * @returns {boolean} true si le bail occupe le logement
 */
export function isBailPresent(bail) {
  return !!(bail && !bail._deleted && !bail.cloture && !bail.finEffective);
}

/**
 * Calcule le pourcentage de bail écoulé entre debut et fin.
 * @param {object} bail
 * @returns {number|null} 0-100 ou null si impossible à calculer
 */
export function bailProgressPct(bail) {
  if (!bail || !bail.debut || !bail.fin) return null;
  try {
    const debut = new Date(bail.debut).getTime();
    const fin = new Date(bail.fin).getTime();
    if (isNaN(debut) || isNaN(fin) || fin <= debut) return null;
    const now = Date.now();
    if (now <= debut) return 0;
    if (now >= fin) return 100;
    return Math.round(((now - debut) / (fin - debut)) * 100);
  } catch (e) { return null; }
}
