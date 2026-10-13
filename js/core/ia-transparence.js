/**
 * js/core/ia-transparence.js — TRANSPARENCE ET RGPD du socle IA (chantier EDL-VOIX-IA, lot A2).
 *
 * Source UNIQUE des textes qui disent à l'utilisateur ce que fait l'IA :
 *   - la mention portée par chaque proposition (AI Act, art. 50 : en vigueur depuis le 2/08/2026) ;
 *   - la notice de première utilisation (finalité, fournisseur, sort de l'enregistrement) ;
 *   - la mention discrète du PDF signé (décision Didier 13/10, seulement si une proposition a été acceptée) ;
 *   - le marquage lisible par machine (`iaE` / `iaS` sur l'élément, `compteursIA` sur l'EDL).
 *
 * ┌─ RÉTENTION ZÉRO — CONSTANTE UNIQUE ────────────────────────────────────────────────────────────┐
 * │ RETENTION_ZERO = true : Didier a décidé (13/10) d'activer la rétention zéro chez Mistral. La     │
 * │ notice dit alors « le fournisseur ne conserve rien ». TANT QUE l'activation n'est pas confirmée  │
 * │ sur le compte Mistral (facturation à l'usage + rétention zéro + refus de l'entraînement, cf.     │
 * │ rapport du chantier), passer cette constante à false : la notice dit alors « 30 jours au plus    │
 * │ pour la détection des abus ». Aucun autre texte n'est à toucher.                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 * Ton neutre (charte M-13) : infinitif, générique, ni « tu » ni « vous ».
 */

export const RETENTION_ZERO = true;

export const FOURNISSEUR = 'Mistral AI';

/** Sur chaque proposition (AI Act art. 50). */
export const MENTION_PROPOSITION = 'Proposé par l’IA, à vérifier';

/** Bandeau en tête de l'écran des propositions. */
export const BANDEAU_PROPOSITIONS = {
  titre: 'Proposé par l’IA, à vérifier.',
  texte: 'Rien n’est inscrit dans l’état des lieux sans validation, élément par élément.',
};

/** Pied du PDF signé, seulement si au moins une proposition a été acceptée (décision 13/10). */
export const MENTION_PDF = 'Observations préparées avec une aide à la dictée (IA), relues et validées par les parties.';

/** Ce que dit la notice du fournisseur, selon la rétention effectivement activée. */
export function phraseConservationFournisseur(retentionZero = RETENTION_ZERO) {
  return retentionZero
    ? `${FOURNISSEUR} ne conserve ni l’enregistrement ni le texte (rétention zéro) et ne s’en sert pas pour entraîner ses modèles.`
    : `${FOURNISSEUR} garde les échanges 30 jours au plus pour détecter les abus, puis les supprime, et ne s’en sert pas pour entraîner ses modèles.`;
}

/**
 * Notice de première utilisation (affichée une fois par compte, relisible ensuite).
 * Renvoie { titre, sousTitre, intro, sections:[{icone, titre, texte}] } — du texte brut, échappé à l'affichage.
 */
export function notice({ retentionZero = RETENTION_ZERO } = {}) {
  return {
    titre: 'Dicter la pièce',
    sousTitre: 'Avant la première utilisation',
    intro: 'Commenter la pièce à voix haute : le texte est transcrit, puis une IA propose un état et une observation pour chaque élément cité. Rien n’est inscrit sans validation, élément par élément.',
    sections: [
      { icone: 'shield', titre: 'Qui traite la dictée', texte: `${FOURNISSEUR}, société française, serveurs dans l’Union européenne, sous-traitant de Propryo.` },
      { icone: 'trash', titre: 'Ce qui est conservé', texte: `L’enregistrement n’est pas conservé : il est envoyé, transcrit, puis supprimé de l’appareil et du serveur de Propryo. La transcription reste sur l’appareil le temps de la relecture, puis est effacée. Seul le texte validé entre dans l’état des lieux. ${phraseConservationFournisseur(retentionZero)}` },
      { icone: 'info', titre: 'Prévenir les personnes présentes', texte: 'Avant de dicter, prévenir le locataire ou toute personne présente que la pièce est décrite à voix haute et analysée par une IA. Éviter de citer des informations personnelles (noms, santé, opinions).' },
      { icone: 'sparkle', titre: 'L’IA peut se tromper', texte: `Chaque proposition porte la mention « ${MENTION_PROPOSITION} ». L’état des lieux reste contradictoire et signé par les deux parties.` },
    ],
  };
}

/** Marque lisible par machine posée sur un élément inscrit depuis une proposition. */
export function marqueIA({ etat, obs, modele, maintenant = new Date() }) {
  return { etat: !!etat, obs: !!obs, at: maintenant.toISOString(), modele: String(modele || '') };
}

/** L'EDL porte-t-il au moins une valeur inscrite depuis une proposition de l'IA ? (→ mention du PDF) */
export function edlAAideIA(edl) {
  if (!edl || typeof edl !== 'object') return false;
  const marque = (m) => !!(m && (m.etat || m.obs));
  for (const p of edl.pieces || []) {
    for (const x of (p && p.elements) || []) {
      if (marque(x && x.iaE) || marque(x && x.iaS)) return true;
    }
  }
  const c = edl.compteursIA;
  return !!(c && typeof c === 'object' && Object.keys(c).length);
}
