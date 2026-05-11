/**
 * Helpers de classification des catégories pour régularisation des charges.
 * Sprint 1C — BUG-CHARGE-001
 *
 * Spec : la régul doit fonctionner aussi bien avec :
 *   - catégories legacy ('Loyers', 'Charges', 'Travaux', 'Assurance', 'Autre')
 *   - catégories standard LEGAL-2044 v14.78 ('Loyers encaissés', etc.)
 *   - catégories CUSTOM user
 *
 * Le bug : `m.cat==='Loyers'` filtre tout en strict → avec LEGAL-2044, plus rien ne match.
 */

/**
 * Référentiel mémoire des STD_CATEGORIES utilisé par les tests.
 * En production, on utilise STD_CATEGORIES de index.html.
 */
const STD_CATEGORIES_TEST = [
  { nom: 'Loyers encaissés', ligne2044: '211', type: 'recette' },
  { nom: 'Arriérés de loyers', ligne2044: '211', type: 'recette' },
  { nom: 'Provisions pour charges de copropriété', ligne2044: '229', type: 'charge' },
  { nom: 'Charges récupérables non récupérées', ligne2044: '225', type: 'charge' },
  { nom: 'Régularisation provisions copro N-1', ligne2044: '230', type: 'charge' },
  { nom: 'Travaux de réparation et d\'entretien', ligne2044: '224', type: 'charge' },
  { nom: 'Primes d\'assurance PNO', ligne2044: '223', type: 'charge' }
];

function _findStd(stdCats, nom) {
  return (stdCats || STD_CATEGORIES_TEST).find(c => c.nom === nom);
}

/**
 * Une catégorie compte comme "loyer encaissé" pour la provision charges.
 * - Legacy : 'Loyers'
 * - STD_CATEGORIES : ligne2044 = '211' + type = 'recette' (loyer ou arriéré)
 */
export function _isLoyerCategory(cat, stdCats = STD_CATEGORIES_TEST) {
  if (!cat) return false;
  if (cat === 'Loyers') return true; // legacy v14.59
  const std = _findStd(stdCats, cat);
  if (std && std.type === 'recette' && std.ligne2044 === '211') return true;
  return false;
}

/**
 * Une catégorie compte comme "charge récupérable" (à refacturer locataire via régul).
 * - Legacy : 'Charges'
 * - STD_CATEGORIES : 229 (provisions copro) + 230 (régul copro N-1)
 *   Note : 225 (charges récup non récupérées) = part bailleur uniquement, on l'exclut
 *   de la régul car par définition non refacturable au locataire.
 *   Travaux (224) et Honoraires (221) sont des charges du bailleur, pas récupérables.
 */
export function _isChargeRecupCategory(cat, stdCats = STD_CATEGORIES_TEST) {
  if (!cat) return false;
  if (cat === 'Charges') return true; // legacy v14.59
  const std = _findStd(stdCats, cat);
  if (std && (std.ligne2044 === '229' || std.ligne2044 === '230')) return true;
  return false;
}

/**
 * Compte le nombre de mouvements qui matchent un filtre catégorie.
 * Utile pour tests.
 */
export function _countMatching(mouvements, filterFn) {
  return (mouvements || []).filter(filterFn).length;
}
