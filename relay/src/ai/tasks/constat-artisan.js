// relay/src/ai/tasks/constat-artisan.js — tâche « tirer un CONSTAT NEUTRE de ce que l'artisan a constaté et fait ».
//
// Entrée : ce que l'artisan a dit ou écrit après l'intervention (transcription Voxtral ou texte), l'élément et la
// description du signalement. Sortie : un constat parmi les 6 du CDC, l'ampleur, un résumé des travaux et l'extrait
// de ses propres mots qui le justifie (vérifié mot pour mot dans le texte, sinon écarté). L'artisan CONFIRME ou change
// le constat ; il ne voit jamais la répartition : c'est le moteur qui-paie.js qui l'établit, et le propriétaire qui
// valide (« l'IA lit, la loi décide »).
import { texteBorne, contientExtrait, normaliser } from '../texte.js';
import { CONSTATS, AMPLEURS, SOUS_TYPES_EXTERIEURE } from '../../../../js/core/incident-circuit.js';

export const nom = 'constat-artisan';
export const DELAI_MS = 25000;
export const LIMITES = { texteMax: 6000, contexteMax: 600, resumeMax: 600, citationMax: 240 };
const INTERDITS = [/\bresponsab/, /\ba la charge\b/, /\bimputables?\b/, /\bqui paie\b/];

export function validerEntree(input) {
  if (!input || typeof input !== 'object') return { ok: false, raison: 'entree' };
  const texte = typeof input.texte === 'string' ? input.texte.trim() : '';
  if (texte.length < 3) return { ok: false, raison: 'texte_vide' };
  if (texte.length > LIMITES.texteMax) return { ok: false, raison: 'texte_trop_long' };
  return { ok: true, input: { texte, element: texteBorne(input.element, LIMITES.contexteMax) || '', description: texteBorne(input.description, LIMITES.contexteMax) || '' } };
}

export function messages(input) {
  const system = [
    "Tu aides un ARTISAN à résumer une intervention dans un logement loué en France. Il a dit ce qu'il a constaté et fait.",
    'Tu proposes ; il confirmera ou changera.',
    '',
    'Règles impératives :',
    '1. `constat` : UNE clé de la liste des constats, celle qui correspond à ses mots. Si rien ne permet de choisir,',
    '   « usure » n\'est PAS un choix par défaut : prends la clé la plus fidèle et laisse `citation` à null.',
    '2. `sousType` : seulement pour « exterieure » : « tiers » (un voisin, une personne) ou « evenement » (intempérie) ;',
    '   sinon null. `ampleur` : « petite » (petite pièce, réglage léger), « complet » (élément entier remplacé) ou',
    '   « entretien » (nettoyage, détartrage, ramonage, réglage) ; null si ce n\'est pas dit.',
    '3. `resume` : les travaux réalisés, 1 à 2 phrases neutres, sans « je » ni « vous », sans montant.',
    '4. `citation` : un extrait COPIÉ MOT POUR MOT de ses paroles qui justifie le constat, ou null.',
    '5. JAMAIS de responsabilité ni de « qui paie » : seulement ce qui a été constaté.',
    'Réponds uniquement par le JSON demandé.',
  ].join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({
    paroles: input.texte, signalement: { element: input.element, description: input.description },
    constats: CONSTATS, ampleurs: AMPLEURS, sousTypes: SOUS_TYPES_EXTERIEURE,
  }) }];
}

const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
export const jsonSchema = obj({
  constat: { type: 'string', enum: CONSTATS.map((c) => c.k) },
  sousType: { type: ['string', 'null'] },
  ampleur: { type: ['string', 'null'] },
  resume: { type: 'string' },
  citation: { type: ['string', 'null'] },
});

export function validerSortie(raw, input) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  if (!CONSTATS.some((c) => c.k === raw.constat)) return { ok: false };
  let rejets = 0;
  const sousType = raw.constat === 'exterieure' ? (SOUS_TYPES_EXTERIEURE.some((s) => s.k === raw.sousType) ? raw.sousType : 'tiers') : null;
  const ampleur = AMPLEURS.some((a) => a.k === raw.ampleur) ? raw.ampleur : null;
  if (raw.ampleur != null && !ampleur) rejets++;
  let resume = texteBorne(raw.resume, LIMITES.resumeMax);
  if (resume && INTERDITS.some((re) => re.test(normaliser(resume)))) { resume = null; rejets++; }
  let citation = texteBorne(raw.citation, LIMITES.citationMax);
  if (citation && !contientExtrait(input.texte, citation)) { citation = null; rejets++; }   // garde-fou anti-invention
  return { ok: true, rejets, data: { constat: raw.constat, sousType, ampleur, resume: resume || '', citation } };
}
