// relay/src/ai/texte.js — outils de texte du socle IA (purs, sans dépendance).
//
// Sert au garde-fou anti-invention : un extrait « entendu » renvoyé par le modèle n'est accepté que
// s'il figure VRAIMENT dans la transcription. On compare des formes normalisées (minuscules, sans
// accents, ponctuation et espaces écrasés) pour ne pas rejeter un extrait correct à une virgule près.

export function normaliser(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Vrai si `extrait` (normalisé, non vide, au moins 2 caractères utiles) est contenu dans `texte`.
// Garde-fou : au moins 6 caractères utiles, et comparaison sur des FRONTIÈRES DE MOTS seulement — un
// modèle qui invente ne peut pas « citer » un mot-outil (« de », « le ») ni un morceau de mot.
export const EXTRAIT_MIN = 6;
export function contientExtrait(texte, extrait) {
  const e = normaliser(extrait);
  if (e.length < EXTRAIT_MIN) return false;
  return (' ' + normaliser(texte) + ' ').includes(' ' + e + ' ');
}

// Chaîne non vide, nettoyée, d'au plus `max` caractères — sinon null (jamais de coupe : un texte trop
// long est une sortie anormale, on l'écarte plutôt que de la tronquer).
export function texteBorne(s, max) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t && t.length <= max ? t : null;
}
