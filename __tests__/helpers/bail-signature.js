/**
 * Helper bail-signature — version testable extraite (v15.344)
 *
 * Source de vérité documentée pour la logique de date de signature manuelle câblée
 * inline dans `_wizV2PersistSignatures` (index.html). Si la règle évolue, on la modifie
 * ici + on porte dans index.html (miroir inline).
 */

/**
 * Détermine l'horodatage ISO à graver pour la signature d'un bail.
 * La date de signature peut être saisie manuellement (`bail.dateSignaturePrevue`,
 * format `YYYY-MM-DD`) AVANT de signer. À défaut → l'instant courant (comportement legacy).
 *
 * Midi UTC : `slice(0,10)` (pastilles) et `toLocaleDateString('fr-FR')` (PDF) restent
 * sur le bon jour calendaire dans les fuseaux usuels (FR = UTC+1/+2).
 *
 * @param {string|null|undefined} planned  date saisie `YYYY-MM-DD` ou vide
 * @param {string} nowISO  ISO de l'instant courant (fallback)
 * @returns {string} ISO 8601 à utiliser pour signedAt / signedBailleurAt / signedLocataireAt
 */
export function resolveSignatureTimestamp(planned, nowISO) {
  if (typeof planned === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(planned)) {
    const iso = planned + 'T12:00:00.000Z';
    const d = new Date(iso);
    // Round-trip : rejette une date impossible normalisée par JS (ex. 2026-02-30 → 2026-03-02).
    if (!isNaN(d.getTime()) && d.toISOString().slice(0, 10) === planned) return iso;
  }
  return nowISO;
}
