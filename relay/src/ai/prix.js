// relay/src/ai/prix.js — GRILLE DE PRIX du fournisseur d'IA : SEUL endroit où vivent les prix (chantier CONSO-IA).
//
// Sert à ESTIMER le coût de chaque appel, en micro-euros, pour l'écran « Consommation IA » de l'administrateur. Ne
// décide de rien : les plafonds se comptent en unités (minutes, pages, demandes), pas en euros (migration 0062).
// Relevé le 16/10/2026 :
//   - https://docs.mistral.ai/inference/pricing : Voxtral Mini Transcribe 0,003 $/min ; Mistral Small 4 0,15 $ par
//     million de jetons d'entrée, 0,60 $ en sortie ; OCR 4.1 4 $ / 1 000 pages ;
//   - https://docs.mistral.ai/models/model-cards/mistral-small-4-0-26-03 : 0,15 $ / 0,6 $ par million de jetons ;
//   - lecture AVEC annotations (Document AI) : 5 $ / 1 000 pages — source secondaire
//     (https://productbuilder.net/models/mistral-ocr-4-1, relevé du 03/09/2026), à confirmer sur la première facture.
// Les images envoyées au modèle de structuration sont comptées par Mistral dans les jetons d'entrée (usage.prompt_tokens) :
// pas de prix à l'image. Changer de modèle (AI_MODEL_STRUCTURE…) ou de fournisseur = mettre à jour CETTE grille.
// Taux de conversion : la page de prix récupérée n'affiche que le dollar ; remplacer par les prix en euros de la
// première facture Mistral dès qu'elle est connue.
export const GRILLE_PRIX = Object.freeze({
  releve: '2026-10-16',
  devise: 'USD',
  eurParUsd: 0.87,
  transcriptionUsdParMinute: 0.003,
  structureUsdParMillionEntree: 0.15,
  structureUsdParMillionSortie: 0.6,
  ocrAnnotationUsdParPage: 0.005,
});

const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** Coût estimé d'un appel, en micro-euros (entier). Mesures absentes ou invalides = 0. */
export function coutMicroEur({ audioSec = 0, jetonsE = 0, jetonsS = 0, pages = 0 } = {}, g = GRILLE_PRIX) {
  const usd = (pos(audioSec) / 60) * g.transcriptionUsdParMinute
    + (pos(jetonsE) / 1e6) * g.structureUsdParMillionEntree
    + (pos(jetonsS) / 1e6) * g.structureUsdParMillionSortie
    + pos(pages) * g.ocrAnnotationUsdParPage;
  return Math.round(usd * g.eurParUsd * 1e6);
}
