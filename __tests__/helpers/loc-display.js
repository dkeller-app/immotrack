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

import { echeanceBail, pastilleEcheance } from '../../js/core/bail-echeance.js';

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
 * L'info d'échéance d'un bail (vert/orange/rouge) — BAUX-ECHUS : délègue à LA règle du type
 * (js/core/bail-echeance.js), exactement comme _locEcheanceInfo dans l'app. Plus de copie de logique.
 * Gère explicitement les dates invalides (NaN) → warn au lieu de OK silencieux.
 * @param {object} bail
 * @param {function} fdFn - formatter de date (ex: ISO → "JJ/MM/AAAA"), optionnel
 * @param {string} [todayIso] - date du jour (défaut : aujourd'hui, heure locale)
 * @returns {{cls: string, text: string, urgent: boolean}}
 */
export function echeanceInfo(bail, fdFn, todayIso) {
  if (!bail) return { cls: 'muted', text: '', urgent: false };
  if (bail.fin && isNaN(new Date(bail.fin).getTime())) return { cls: 'warn', text: '⚠ Date invalide', urgent: true };
  const d = new Date();
  const t = todayIso || (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  return pastilleEcheance(echeanceBail(bail, null, { todayIso: t }), { todayIso: t, fd: fdFn });
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
