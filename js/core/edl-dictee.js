/**
 * js/core/edl-dictee.js — LOGIQUE PURE de la dictée d'EDL (chantier EDL-VOIX-IA, lots B1 à B3).
 *
 * Ce module décide QUOI envoyer à l'IA pour une pièce, et (lot B2) COMMENT une proposition acceptée
 * s'écrit dans les champs EXISTANTS de l'élément — sans jamais toucher un EDL signé, l'entrée signée
 * en mode sortie, ni l'état d'une ligne « note ». Aucune dépendance au DOM.
 */
import { estNote } from './edl-relecture.js';

export const MODES = Object.freeze({ ENTREE: 'entree', SORTIE: 'sortie' });

/** Entrée de la tâche « edl-piece » pour la pièce `piece` ({ nom, elements:[{ nom }] }). */
export function entreePiece(piece, sortie) {
  const elements = [];
  ((piece && piece.elements) || []).forEach((x, i) => {
    const nom = String((x && x.nom) || '').replace(/\s+/g, ' ').trim();
    if (nom) elements.push({ id: String(i), nom, note: estNote(nom) });
  });
  return { piece: String((piece && piece.nom) || 'Pièce').trim() || 'Pièce', mode: sortie ? MODES.SORTIE : MODES.ENTREE, elements };
}

/** Entrée pour la dictée des relevés (aucun élément : seuls les compteurs sont attendus). */
export function entreeCompteurs(sortie) {
  return { piece: 'Compteurs', mode: sortie ? MODES.SORTIE : MODES.ENTREE, elements: [] };
}

/** Noms affichés pendant l'enregistrement (aide-mémoire). */
export function nomsElements(piece) {
  return ((piece && piece.elements) || []).map((x) => String((x && x.nom) || '').trim()).filter(Boolean);
}
