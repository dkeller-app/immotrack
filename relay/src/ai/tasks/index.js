// relay/src/ai/tasks/index.js — registre des TÂCHES de structuration du socle IA.
// Ajouter une tâche (lecture de pièces de dossier, tri de photos d'incident…) = un module qui exporte
// { nom, validerEntree, messages, jsonSchema, validerSortie } + une ligne ici. Rien d'autre ne bouge.
import * as edlPiece from './edl-piece.js';
import * as edlPhotos from './edl-photos.js';
// Circuit d'un incident (migration 0060) : aide au signalement du locataire, constat de l'artisan, lecture de facture.
import * as incidentLocataire from './incident-locataire.js';
import * as constatArtisan from './constat-artisan.js';
import * as lectureFacture from './lecture-facture.js';
// Vérification des documents des candidats : lecture d'un bulletin de salaire / page 1 d'un contrat (OCR, interrupteur AI_OCR).
import * as bulletinPaie from './bulletin-paie.js';

// `video: true` sur une tâche = soumise à l'interrupteur AI_VIDEO (src/ai/video.js).
export const TACHES = Object.freeze({
  [edlPiece.nom]: edlPiece, [edlPhotos.nom]: edlPhotos,
  [incidentLocataire.nom]: incidentLocataire, [constatArtisan.nom]: constatArtisan, [lectureFacture.nom]: lectureFacture,
  [bulletinPaie.nom]: bulletinPaie,
});
// Tâches appelables depuis un LIEN PUBLIC (sans compte) : seulement celles-ci, par type de lien (src/ai/public.js).
export const TACHES_LIEN = Object.freeze({ el: [incidentLocataire.nom], ar: [constatArtisan.nom] });
// Plafond du corps d'une tâche à images (hors vidéo) : la plus grande des tâches concernées.
export const JSON_MAX_IMAGES = Math.max(...Object.values(TACHES).filter((t) => t.images && !t.video).map((t) => t.JSON_MAX || 0));

export function tache(nom) {
  return Object.prototype.hasOwnProperty.call(TACHES, nom) ? TACHES[nom] : null;
}
