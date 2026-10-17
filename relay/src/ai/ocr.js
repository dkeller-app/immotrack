// relay/src/ai/ocr.js — INTERRUPTEUR de la lecture de documents (VERIF-DOCUMENTS lot 3 : bulletins de salaire).
//
// Décision Didier (14/10/2026) : lecture par Mistral OCR (annotations structurées), sur le POINT D'ACCÈS UE
// (api.eu.mistral.ai : traitement dans l'Union européenne), brique REPORTÉE si /v1/ocr n'y est pas servi.
// ALLUMÉE le 16/10/2026 (AI_OCR = "true" dans relay/wrangler.toml) : point d'accès UE vérifié par
// `node relay/scripts/verif-ocr-ue.mjs`, rétention zéro activée sur le compte Mistral (points d'accès sans état :
// /v1/ocr, /v1/audio/transcriptions, /v1/chat/completions), entraînement désactivé, plafonds par compte (CONSO-IA).
//   - AI_OCR absente (ou ≠ "true") : /ai/status annonce ocr.actif=false, la tâche bulletin-paie répond 503
//     ocr_disabled, l'app n'affiche pas « Lire avec l'IA ». 2D-Doc et indices ne changent pas.
//   - AI_OCR = "true" ET fournisseur actif (MISTRAL_API_KEY, ou AI_PROVIDER="fake" en test) : lecture ouverte.
// Le point d'accès est imposé côté relais : MISTRAL_OCR_BASE_URL, par défaut https://api.eu.mistral.ai — jamais le
// point d'accès mondial pour des pièces de candidats.
import { fournisseurActif, OCR_BASE_UE, OCR_MODELE } from './provider.js';
export { OCR_BASE_UE, OCR_MODELE };

/** La lecture de documents est-elle ouverte ? Il faut l'interrupteur ET un fournisseur d'IA actif. */
export function ocrActif(env) {
  return String((env && env.AI_OCR) || '').trim().toLowerCase() === 'true' && !!fournisseurActif(env);
}
export function annonceOcr(env) { return { actif: ocrActif(env) }; }
