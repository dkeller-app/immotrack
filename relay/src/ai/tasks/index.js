// relay/src/ai/tasks/index.js — registre des TÂCHES de structuration du socle IA.
// Ajouter une tâche (lecture de pièces de dossier, tri de photos d'incident…) = un module qui exporte
// { nom, validerEntree, messages, jsonSchema, validerSortie } + une ligne ici. Rien d'autre ne bouge.
import * as edlPiece from './edl-piece.js';
import * as edlPhotos from './edl-photos.js';

// `video: true` sur une tâche = soumise à l'interrupteur AI_VIDEO (src/ai/video.js).
export const TACHES = Object.freeze({ [edlPiece.nom]: edlPiece, [edlPhotos.nom]: edlPhotos });

export function tache(nom) {
  return Object.prototype.hasOwnProperty.call(TACHES, nom) ? TACHES[nom] : null;
}
