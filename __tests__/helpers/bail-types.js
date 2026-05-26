/**
 * Helpers BAIL-TYPES — version testable extraite (Phase B Étape 5 v15.195)
 *
 * Source de vérité documentée pour la logique type-aware câblée dans
 * `buildBailStructure` (index.html). Si une règle légale évolue (ex : durée,
 * DG max, articles de loi), on la modifie ici + on porte dans index.html.
 *
 * Périmètre : 6 types de bail couverts par ImmoTrack.
 *
 * Refs légifrance :
 * - Bail nu : loi 89-462 art. 10 (durée), 22 (DG)
 * - Bail meublé : loi 89-462 art. 25-3 à 25-11 + décret 2015-981 (mobilier)
 * - Bail étudiant : loi 89-462 art. 25-7 dernier alinéa (9 mois non reconductible)
 * - Bail mobilité : loi 89-462 art. 25-12 à 25-18 + loi ELAN 2018 art. 107 (DG interdit)
 * - Bail garage : Code civil art. 1709 et suivants (libre)
 * - Bail autre : régime libre, consulter notaire
 */

/** Tous les types de bail supportés par ImmoTrack (`bail.type`). */
export const BAIL_TYPES = ['nu', 'meuble', 'etudiant', 'mobilite', 'garage', 'autre'];

/** Type par défaut (rétrocompat baux v<15.191). */
export const BAIL_TYPE_DEFAULT = 'nu';

/**
 * 11 catégories obligatoires de mobilier — décret n° 2015-981 du 31 juillet 2015,
 * article 2. La fourniture intégrale est requise pour qualifier le logement
 * de meublé au sens de l'article 25-4 de la loi du 6 juillet 1989.
 *
 * Format : clé interne (DB) → libellé légal officiel.
 */
export const MOB_CATEGORIES_DECRET_2015_981 = Object.freeze({
  literie:    'Literie comprenant couette ou couverture',
  occultation:'Dispositif d\'occultation des fenêtres dans les pièces destinées à être utilisées comme chambre à coucher',
  cuisson:    'Plaques de cuisson',
  four:       'Four ou four à micro-ondes',
  frigo:      'Réfrigérateur et congélateur ou, au minimum, un réfrigérateur doté d\'un compartiment permettant de disposer d\'une température inférieure ou égale à -6 °C',
  vaisselle:  'Vaisselle nécessaire à la prise des repas',
  ustensiles: 'Ustensiles de cuisine',
  table:      'Table et sièges',
  etageres:   'Étagères de rangement',
  luminaires: 'Luminaires',
  entretien:  'Matériel d\'entretien ménager adapté aux caractéristiques du logement'
});

/** Liste ordonnée des clés (utile pour itérer dans l'ordre légal). */
export const MOB_CATEGORY_KEYS = Object.freeze(Object.keys(MOB_CATEGORIES_DECRET_2015_981));

/** Vrai si le bail est un meublé au sens du décret 2015-981 (meublé/étudiant/mobilité). */
export function isBailFurnished(type) {
  return type === 'meuble' || type === 'etudiant' || type === 'mobilite';
}

/**
 * Durée légale en mois selon le type.
 * @returns {number|null} mois (null si durée libre/variable comme mobilité/garage/autre)
 */
export function getBailDureeMonths(type, opts = {}) {
  const { isPersoPhysique = false } = opts;
  switch (type) {
    case 'meuble':    return 12;       // 1 an (art. 25-7)
    case 'etudiant':  return 9;        // 9 mois non reconductible (art. 25-7 dernier alinéa)
    case 'mobilite':  return null;     // 1-10 mois libre (art. 25-14)
    case 'garage':    return null;     // libre (CC 1709)
    case 'autre':     return null;     // à préciser
    case 'nu':
    default:          return isPersoPhysique ? 36 : 72;  // 3 ans perso / 6 ans morale (art. 10)
  }
}

/**
 * DG max en multiples de loyer HC selon le type.
 * @returns {number|null} multiplicateur (null si libre, 0 si interdit)
 */
export function getBailDgMonthsMax(type) {
  switch (type) {
    case 'meuble':    return 2;     // art. 25-6 loi 89-462
    case 'etudiant':  return 2;     // variante meublé
    case 'mobilite':  return 0;     // INTERDIT (art. 25-14, ELAN)
    case 'garage':    return null;  // libre
    case 'autre':     return null;  // libre
    case 'nu':
    default:          return 1;     // art. 22 loi 89-462
  }
}

/**
 * Articles de loi à citer dans le bail pour le type donné.
 * @returns {string[]} liste de références légifrance/code civil
 */
export function getBailLegalRefs(type) {
  switch (type) {
    case 'meuble':
      return ['loi 89-462 art. 25-3 à 25-11', 'décret 2015-981'];
    case 'etudiant':
      return ['loi 89-462 art. 25-7 dernier alinéa', 'décret 2015-981'];
    case 'mobilite':
      return ['loi 89-462 art. 25-12 à 25-18', 'loi ELAN 2018 art. 107'];
    case 'garage':
      return ['Code civil art. 1709 et suivants'];
    case 'autre':
      return [];  // régime libre
    case 'nu':
    default:
      return ['loi 89-462 art. 10', 'loi 89-462 art. 22'];
  }
}

/**
 * Préavis de congé en mois selon le type et la partie qui congé.
 * @returns {number|null} mois (null si pas applicable, ex : bailleur en mobilité)
 */
export function getBailPreavisMonths(type, party) {
  if (party === 'locataire') {
    if (isBailFurnished(type)) return 1;  // 1 mois meublé/étudiant/mobilité
    if (type === 'garage' || type === 'autre') return null;
    return 3;  // 3 mois nu
  }
  if (party === 'bailleur') {
    if (type === 'meuble') return 3;       // 3 mois meublé
    if (type === 'etudiant') return null;  // pas de congé bailleur (non reconductible)
    if (type === 'mobilite') return null;  // pas de congé bailleur
    if (type === 'garage' || type === 'autre') return null;
    return 6;  // 6 mois nu
  }
  return null;
}

/** Vrai si le type supporte la tacite reconduction. */
export function isTaciteReconductionAllowed(type) {
  if (type === 'etudiant') return false;  // 9 mois non reconductible
  if (type === 'mobilite') return false;  // non reconductible art. 25-15
  if (type === 'garage' || type === 'autre') return false;  // régime libre
  return true;  // nu (3/6 ans) + meublé (1 an)
}

/**
 * Évalue la complétude de l'inventaire mobilier d'un bail.
 * @param {object} mobilier  bail.mobilier (objet avec clés booléennes)
 * @returns {{ count: number, total: number, complete: boolean, missing: string[] }}
 */
export function getMobilierCompletion(mobilier) {
  const safe = (mobilier && typeof mobilier === 'object') ? mobilier : {};
  let count = 0;
  const missing = [];
  for (const key of MOB_CATEGORY_KEYS) {
    if (safe[key]) count++;
    else missing.push(key);
  }
  return {
    count,
    total: MOB_CATEGORY_KEYS.length,
    complete: count === MOB_CATEGORY_KEYS.length,
    missing
  };
}

/**
 * Vrai si un bail meublé est juridiquement valide (11/11 catégories décret 2015-981).
 * À défaut, le contrat peut être requalifié en bail nu (art. 25-4 loi 89-462).
 */
export function isMobilierLegallyComplete(bail) {
  if (!bail || !isBailFurnished(bail.type)) return true;  // pas de mobilier requis
  return getMobilierCompletion(bail.mobilier).complete;
}
