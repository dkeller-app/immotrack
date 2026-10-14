// relay/src/ai/ocr.js — INTERRUPTEUR de la lecture de documents (VERIF-DOCUMENTS lot 3 : bulletins de salaire).
//
// Décision Didier (14/10/2026) : lecture par Mistral OCR (annotations structurées), sur le POINT D'ACCÈS UE
// (api.eu.mistral.ai : traitement dans l'Union européenne), brique REPORTÉE si /v1/ocr n'y est pas servi.
// Faute de clé dans le chantier, la disponibilité n'a pas pu être vérifiée : la brique est livrée ÉTEINTE.
//   - AI_OCR absente (ou ≠ "true") : /ai/status annonce ocr.actif=false, la tâche bulletin-paie répond 503
//     ocr_disabled, l'app n'affiche pas « Lire les bulletins avec l'IA ». 2D-Doc et indices ne changent pas.
//   - ACTIVATION : 1) `node relay/scripts/verif-ocr-ue.mjs` (clé copiée dans le presse-papiers) confirme que le
//     point d'accès UE sert le modèle d'OCR et répond sur une page synthétique ; 2) demander la rétention zéro
//     à Mistral ; 3) poser AI_OCR = "true" (wrangler.toml [vars] ou tableau de bord, sans redéploiement de code).
// Le point d'accès est imposé côté relais : MISTRAL_OCR_BASE_URL, par défaut https://api.eu.mistral.ai — jamais le
// point d'accès mondial pour des pièces de candidats.
import { fournisseurActif, OCR_BASE_UE, OCR_MODELE } from './provider.js';
export { OCR_BASE_UE, OCR_MODELE };

/** La lecture de documents est-elle ouverte ? Il faut l'interrupteur ET un fournisseur d'IA actif. */
export function ocrActif(env) {
  return String((env && env.AI_OCR) || '').trim().toLowerCase() === 'true' && !!fournisseurActif(env);
}
export function annonceOcr(env) { return { actif: ocrActif(env) }; }
