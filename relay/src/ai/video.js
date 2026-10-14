// relay/src/ai/video.js — INTERRUPTEUR de l'état des lieux FILMÉ (chantier EDL-VIDEO-IA).
//
// Décision Didier (14/10/2026) : la bêta tourne sur les offres GRATUITES (Supabase Free : 1 Go au total,
// 50 Mo par fichier ; Workers Free : 10 ms de CPU par requête). La vidéo s'ouvrira avec les premiers
// clients payants. Donc :
//   - AI_VIDEO absente (ou ≠ "true") = vidéo ÉTEINTE : /ai/status annonce video.actif=false, la tâche
//     `edl-photos` répond 503 video_disabled, l'app masque « Filmer la pièce ». La dictée ne change pas.
//   - ACTIVATION = passer les offres payantes, puis poser les variables (aucun redéploiement de code) :
//       AI_VIDEO = "true"
//       AI_VIDEO_FILE_MAX_BYTES = "209715200"   (200 Mo, Supabase Pro ; défaut 50 Mo = plan gratuit)
//       AI_QUOTA_IMAGES = "2000"                (images analysées par compte et par jour)
//     (wrangler.toml [vars] ou tableau de bord Cloudflare → Variables.)
// La vidéo n'est jamais envoyée au relais : seulement des IMAGES tirées sur le téléphone (8 par appel au
// plus, limite Mistral) et le son de la dictée (route /ai/transcribe inchangée). Le fichier vidéo part
// directement de l'app vers le stockage Supabase de l'espace (RLS par SCI).
import { fournisseurActif } from './provider.js';

export const VIDEO_DEFAUTS = Object.freeze({
  fichierMaxOctets: 50 * 1024 * 1024,   // plan gratuit Supabase : 50 Mo par fichier
  priseMaxSec: 180,                      // 3 min par prise (décision 14/10)
  imagesParAppel: 8,                     // documentation Mistral vision : 8 images par requête au plus
  imageMaxCaracteres: 400 * 1024,        // une image en data URL (≈ 300 Ko de JPEG)
  jsonMaxOctets: 4 * 1024 * 1024,        // corps /ai/structure d'un appel `edl-photos` (8 images + texte)
});

const vrai = (v) => String(v == null ? '' : v).trim().toLowerCase() === 'true';
const entier = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

/** La vidéo est-elle ouverte ? Il faut l'interrupteur ET un fournisseur d'IA actif. */
export function videoActif(env) {
  return vrai(env && env.AI_VIDEO) && !!fournisseurActif(env);
}

/** Ce que /ai/status annonce à l'app (l'app ne devine rien : elle applique ces limites). */
export function annonceVideo(env, imagesJour) {
  const actif = videoActif(env);
  return {
    actif,
    fichierMaxOctets: entier(env && env.AI_VIDEO_FILE_MAX_BYTES, VIDEO_DEFAUTS.fichierMaxOctets),
    priseMaxSec: VIDEO_DEFAUTS.priseMaxSec,
    imagesParAppel: VIDEO_DEFAUTS.imagesParAppel,
    imagesJour,
  };
}
