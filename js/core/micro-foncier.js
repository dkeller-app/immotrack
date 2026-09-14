/**
 * MICRO-FONCIER — aide au choix de régime pour la location NUE (art. 32 CGI).
 *
 * Sources d'État : article 32 du CGI (Légifrance, LEGIARTI000048847610) + doctrine
 * BOFiP BOI-RFPI-DECLA-10. Vérifiés le 2026-09-14.
 *   - Régime de plein droit si revenu brut foncier annuel du foyer ≤ 15 000 €.
 *   - Abattement forfaitaire de 30 % représentatif de TOUTES les charges (aucune autre déduction).
 *   - Déclaration directe sur la 2042 (case micro-foncier 4BE) — pas de 2044.
 *   - Location NUE uniquement (le meublé relève des BIC).
 *
 * ⚠ L'app NE PEUT PAS vérifier : les régimes spéciaux qui excluent le micro (monuments
 * historiques, nue-propriété, Besson/Robien/Borloo/Périssol, Malraux, parts de SCI louant nu),
 * ni les revenus fonciers du foyer perçus hors Propryo. Ce module produit donc une SUGGESTION
 * (« piste à explorer ») sous conditions, jamais une affirmation d'éligibilité — sauf le cas
 * loyers > 15 000 € où le réel est certainement obligatoire.
 *
 * Module pur (aucun accès DB / DOM) : l'appelant fournit le brut foncier et les charges réelles
 * déductibles (typiquement `_compute2044().totalRecettes` et `totalCharges + totalInterets`).
 */

export const MF_SEUIL = 15000;      // € — revenu brut foncier annuel (foyer)
export const MF_ABATTEMENT = 0.30;  // 30 % forfaitaire

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Évalue le régime le plus favorable pour la location nue.
 * @param {object} p
 * @param {number} p.loyersNus       Revenu BRUT foncier annuel (recettes nues, hors meublé).
 * @param {number} p.chargesReelles  Charges réelles déductibles (charges + intérêts d'emprunt).
 * @returns {{
 *   statut:'na'|'reel_obligatoire'|'micro_piste'|'reel_avantageux',
 *   eligibleSeuil:boolean, loyersNus:number, chargesReelles:number, chargesPct:number,
 *   seuil:number, abattementTaux:number, microAbattement:number,
 *   microImposable:number, reelImposable:number, microAvantageux:boolean, gain:number
 * }}
 */
export function evaluerMicroFoncier(p) {
  const loyersNus = Math.max(0, num(p && p.loyersNus));
  const chargesReelles = Math.max(0, num(p && p.chargesReelles));

  const base = {
    loyersNus, chargesReelles, seuil: MF_SEUIL, abattementTaux: MF_ABATTEMENT,
    chargesPct: loyersNus > 0 ? Math.round((chargesReelles / loyersNus) * 100) : 0,
  };

  // Rien à déclarer
  if (loyersNus <= 0) {
    return { statut: 'na', eligibleSeuil: false, ...base,
      microAbattement: 0, microImposable: 0, reelImposable: 0, microAvantageux: false, gain: 0 };
  }

  const microImposable = Math.round(loyersNus * (1 - MF_ABATTEMENT)); // loyers × 0,70
  const microAbattement = Math.round(loyersNus * MF_ABATTEMENT);      // 30 %
  const reelImposable = Math.round(loyersNus - chargesReelles);
  // Le micro est ≤ au réel quand charges ≤ 30 % des loyers (égalité → micro, car plus simple : pas de 2044).
  const microAvantageux = chargesReelles <= loyersNus * MF_ABATTEMENT;
  const gain = reelImposable - microImposable; // assiette économisée par le micro (positif si micro gagne)

  const eligibleSeuil = loyersNus <= MF_SEUIL;

  let statut;
  if (!eligibleSeuil) statut = 'reel_obligatoire';        // affirmation sûre : le foyer dépasse 15 000 €
  else if (microAvantageux) statut = 'micro_piste';       // suggestion sous conditions
  else statut = 'reel_avantageux';

  return { statut, eligibleSeuil, ...base,
    microAbattement, microImposable, reelImposable, microAvantageux, gain };
}
