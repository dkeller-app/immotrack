/**
 * core/conge.js — CONGÉ & RÉSILIATION du bail (loi n° 89-462 du 6 juillet 1989)
 *
 * PUR (sans DB / DOM). Ce module NE RÉÉCRIT PAS le texte des lettres : le corps de chaque acte
 * vient des modèles Propryo existants (`js/core/email-compose.js` via `window._emailCompose`).
 * Ici : calcul des préavis, conversion du corps de lettre en HTML `.pro-doc` (trame Propryo),
 * et le VERBATIM de l'article 15-II (reproduit à peine de nullité dans le congé pour vente).
 *
 * Cadre légal : congé bailleur art. 15-I (motifs reprise/vente/motif légitime, préavis 6 mois nu /
 * 3 mois meublé), art. 15-II (vente : droit de préemption), art. 15-III (locataire protégé) ;
 * congé locataire art. 12/15 (préavis 3 mois nu, 1 mois meublé ou cas réduits) ; résiliation
 * impayés clause résolutoire art. 24 ; résiliation amiable art. 1193 C. civ.
 *
 * Tests Vitest miroir : __tests__/helpers/conge.test.js
 */

// Motifs du congé bailleur (art. 15-I).
export const CONGE_MOTIFS = [
  { k: 'reprise', label: 'Reprise pour habiter', motifConge: 'reprise' },
  { k: 'vente', label: 'Vente du logement', motifConge: 'vente' },
  { k: 'legitime', label: 'Motif légitime et sérieux', motifConge: 'motif légitime et sérieux' }
];
// Bénéficiaires possibles d'une reprise (art. 15-I).
export const REPRISE_LIENS = ['le bailleur lui-même', 'son conjoint', 'son partenaire de PACS', 'son concubin notoire (depuis au moins 1 an)', 'un ascendant', 'un descendant', 'un ascendant ou descendant du conjoint / partenaire / concubin'];
// Cas de préavis RÉDUIT à 1 mois pour le locataire d'un bail nu (art. 15-I).
export const CONGE_CAS_REDUITS = [
  'Aucun (préavis plein)', 'Zone tendue', 'Mutation professionnelle', 'Perte d\'emploi',
  'Premier emploi', 'Nouvel emploi consécutif à une perte', 'Plus de 65 ans et état de santé',
  'Bénéficiaire du RSA', 'Bénéficiaire de l\'AAH', 'Attribution d\'un logement social', 'Victime de violences conjugales'
];

/**
 * Les CINQ alinéas de l'art. 15-II que la loi impose de reproduire « à peine de nullité dans chaque
 * notification » (dernière phrase du II : « Les termes des cinq alinéas précédents sont reproduits… »).
 * Copié VERBATIM depuis la version consolidée EN VIGUEUR (Légifrance, LEGIARTI000047900030).
 * Ne pas paraphraser : toute altération est une cause de nullité du congé pour vente.
 */
export const ART15_II_ALINEAS = [
  "Lorsqu'il est fondé sur la décision de vendre le logement, le congé doit, à peine de nullité, indiquer le prix et les conditions de la vente projetée. Le congé vaut offre de vente au profit du locataire : l'offre est valable pendant les deux premiers mois du délai de préavis. Les dispositions de l'article 46 de la loi n° 65-557 du 10 juillet 1965 fixant le statut de la copropriété des immeubles bâtis ne sont pas applicables au congé fondé sur la décision de vendre le logement.",
  "A l'expiration du délai de préavis, le locataire qui n'a pas accepté l'offre de vente est déchu de plein droit de tout titre d'occupation sur le local.",
  "Le locataire qui accepte l'offre dispose, à compter de la date d'envoi de sa réponse au bailleur, d'un délai de deux mois pour la réalisation de l'acte de vente. Si, dans sa réponse, il notifie son intention de recourir à un prêt, l'acceptation par le locataire de l'offre de vente est subordonnée à l'obtention du prêt et le délai de réalisation de la vente est porté à quatre mois. Le contrat de location est prorogé jusqu'à l'expiration du délai de réalisation de la vente. Si, à l'expiration de ce délai, la vente n'a pas été réalisée, l'acceptation de l'offre de vente est nulle de plein droit et le locataire est déchu de plein droit de tout titre d'occupation.",
  "Dans le cas où le propriétaire décide de vendre à des conditions ou à un prix plus avantageux pour l'acquéreur, le notaire doit, lorsque le bailleur n'y a pas préalablement procédé, notifier au locataire ces conditions et prix à peine de nullité de la vente. Cette notification est effectuée à l'adresse indiquée à cet effet par le locataire au bailleur ; si le locataire n'a pas fait connaître cette adresse au bailleur, la notification est effectuée à l'adresse des locaux dont la location avait été consentie. Elle vaut offre de vente au profit du locataire. Cette offre est valable pendant une durée d'un mois à compter de sa réception. L'offre qui n'a pas été acceptée dans le délai d'un mois est caduque.",
  "Le locataire qui accepte l'offre ainsi notifiée dispose, à compter de la date d'envoi de sa réponse au bailleur ou au notaire, d'un délai de deux mois pour la réalisation de l'acte de vente. Si, dans sa réponse, il notifie son intention de recourir à un prêt, l'acceptation par le locataire de l'offre de vente est subordonnée à l'obtention du prêt et le délai de réalisation de la vente est porté à quatre mois. Si, à l'expiration de ce délai, la vente n'a pas été réalisée, l'acceptation de l'offre de vente est nulle de plein droit."
];

function esc(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Convertit le corps d'un modèle de lettre (texte : paragraphes \n\n, sauts \n, gras **…**)
 * en HTML `.pro-doc`. Échappe TOUT le texte d'abord (anti-XSS : le corps contient des données
 * saisies — noms, montants), puis applique le formatage léger.
 */
export function letterToProDoc(body) {
  return String(body == null ? '' : body).trim().split(/\n\n+/)
    .filter(par => par.trim() !== '') // un token conditionnel vide (ex. clause préemption hors vente) ne laisse pas de <p> creux
    .map(par => {
      const h = esc(par).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return '<p>' + h + '</p>';
    }).join('');
}

/** Les 5 alinéas de l'art. 15-II en HTML `.pro-doc` (annexe du congé pour vente). */
export function art15IIProDoc() {
  return '<h3>Annexe — Article 15, II de la loi du 6 juillet 1989 (reproduction imposée à peine de nullité)</h3>' +
    ART15_II_ALINEAS.map(a => '<p style="font-size:9pt;color:#3c4658">' + esc(a) + '</p>').join('');
}

/** Préavis du congé bailleur (mois) : 3 si meublé (ou variantes), sinon 6. */
export function congeBailleurPreavisMois(typeBail) {
  return ['meuble', 'etudiant', 'mobilite'].indexOf(String(typeBail || '')) >= 0 ? 3 : 6;
}

/**
 * Préavis du congé locataire.
 * @param {{typeBail:string, casReduit:string}} o
 * @returns {{mois:number, reduit:boolean, sansJustif:boolean, label:string}}
 *   sansJustif=true pour la zone tendue (mention seule) ; sinon justificatif requis.
 */
export function congeLocatairePreavis(o) {
  o = o || {};
  const meuble = ['meuble', 'etudiant', 'mobilite'].indexOf(String(o.typeBail || '')) >= 0;
  const cas = String(o.casReduit || '');
  const casChoisi = cas && cas.indexOf('Aucun') !== 0;
  if (meuble) return { mois: 1, reduit: false, sansJustif: true, label: 'bail meublé (1 mois)' };
  if (casChoisi) return { mois: 1, reduit: true, sansJustif: cas === 'Zone tendue', label: cas };
  return { mois: 3, reduit: false, sansJustif: false, label: 'bail nu (3 mois)' };
}

/** Ajout de mois avec recadrage fin de mois (art. 641 CPC) — pour date de fin de préavis / d'effet. */
export function addMoisClamped(iso, m) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  d.setMonth(d.getMonth() + m);
  if (d.getDate() !== day) d.setDate(0);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Locataire protégé (art. 15-III) : > 65 ans à la date d'effet ET ressources sous plafond,
 *  sauf bailleur lui-même > 65 ans ou de ressources modestes. Renvoie l'alerte de nullité si protégé. */
export function locataireProtege(o) {
  o = o || {};
  const protege = !!o.plusDe65 && !!o.ressourcesFaibles;
  const exceptionBailleur = !!o.bailleurAgeOuModeste;
  const bloquant = protege && !exceptionBailleur;
  return { protege, exceptionBailleur, bloquant };
}
