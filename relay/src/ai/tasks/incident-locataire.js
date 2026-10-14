// relay/src/ai/tasks/incident-locataire.js — tâche « aider le locataire à décrire un problème » (CIRCUIT D'UN INCIDENT).
//
// Entrée : ce que le locataire a dit ou écrit (texte, transcription Voxtral), ses réponses aux questions déjà posées, et
// au plus 3 photos (images réduites sur le téléphone). Sortie : un RÉSUMÉ neutre et ce que l'on en déduit (pièce, type de
// problème, élément et nature du registre, urgence), et AU PLUS DEUX questions simples s'il manque une information
// utile à l'intervention (ex. « l'eau coule-t-elle en continu ? »). Jamais de cause, de faute, de responsabilité, de coût
// ni de « qui paie » : la cause n'est établie qu'à la fin, sur le constat de l'artisan (CDC docs/CDC-INCIDENT-CIRCUIT.md).
// Le locataire relit et corrige tout avant l'envoi.
import { texteBorne, normaliser } from '../texte.js';
import { PIECES, PROBLEMES } from '../../../../js/core/espace-locataire.js';
import { ELEMENTS, NATURES, URGENCES } from '../../../../js/core/qui-paie.js';

export const nom = 'incident-locataire';
export const images = true;                       // compte dans le quota d'images
export const JSON_MAX = 1536 * 1024;              // 3 images réduites + texte
export const DELAI_MS = 30000;

export const LIMITES = { texteMax: 3000, imagesMax: 3, imageMax: 400 * 1024, resumeMax: 600, questionMax: 160, choixMax: 60, reponseMax: 200 };
const DATA = /^data:image\/(jpeg|webp|png);base64,([A-Za-z0-9+/]+={0,2})$/;
// Mots de cause ou de responsabilité : un résumé qui en contient est écarté (on garde le texte du locataire).
export const INTERDITS = [/\bfautes?\b/, /\bresponsab/, /\ba la charge\b/, /\bimputables?\b/, /\bnegligen/, /\bvetuste/, /\bqui paie\b/, /\bpayer\b/, /\bcout\b/, /\bfacture/];

const CLES = (l) => l.map((x) => x.k);
export function validerEntree(input) {
  if (!input || typeof input !== 'object') return { ok: false, raison: 'entree' };
  const texte = typeof input.texte === 'string' ? input.texte.trim() : '';
  if (texte.length < 3) return { ok: false, raison: 'texte_vide' };
  if (texte.length > LIMITES.texteMax) return { ok: false, raison: 'texte_trop_long' };
  const reponses = [];
  for (const r of Array.isArray(input.reponses) ? input.reponses.slice(0, 2) : []) {
    const q = texteBorne(r && r.q, LIMITES.questionMax), a = texteBorne(r && r.r, LIMITES.reponseMax);
    if (q && a) reponses.push({ q, r: a });
  }
  const imgs = [];
  for (const im of Array.isArray(input.images) ? input.images : []) {
    if (imgs.length >= LIMITES.imagesMax) return { ok: false, raison: 'images_trop_nombreuses' };
    if (typeof im !== 'string' || im.length > LIMITES.imageMax || !DATA.test(im)) return { ok: false, raison: 'image_format' };
    imgs.push(im);
  }
  return { ok: true, input: { texte, reponses, images: imgs } };
}

export function messages(input) {
  const system = [
    "Tu aides un LOCATAIRE à signaler un problème dans son logement en France, pour qu'un artisan puisse intervenir.",
    'Tu reçois ce qu\'il a dit ou écrit, ses éventuelles réponses à tes questions et des photos. Il relira tout.',
    '',
    'Règles impératives :',
    '1. `resume` : 1 à 3 phrases NEUTRES et factuelles, au présent, sans « je » ni « vous » : ce qui se passe, où,',
    '   depuis quand si c\'est dit, ce qui a déjà été fait (eau coupée…). Rien d\'inventé.',
    '2. JAMAIS de cause, de faute, de responsabilité, d\'usure « normale », de vétusté, de coût ni de qui paie.',
    '3. `piece`, `probleme`, `element`, `nature` : une clé des listes fournies ; si ce n\'est pas clair, « autre ».',
    '4. `urgence` : « urgente » si de l\'eau coule sans pouvoir l\'arrêter, odeur de gaz, plus du tout d\'électricité,',
    '   plus de chauffage en hiver ou porte d\'entrée qui ne ferme plus ; « importante » si un équipement ne marche',
    '   plus ou si un dégât peut s\'aggraver ; sinon « faible ». `urgences` : les clés des urgences en cours, ou [].',
    '5. `questions` : AU PLUS DEUX questions très simples, chacune avec 2 à 4 réponses courtes, SEULEMENT si une',
    '   information manque pour intervenir (ex. « L\'eau coule-t-elle en continu ? »). Aucune question si des',
    '   réponses sont déjà fournies ou si tout est clair.',
    'Réponds uniquement par le JSON demandé.',
  ].join('\n');
  const contenu = [{ type: 'text', text: JSON.stringify({
    dit: input.texte, reponses: input.reponses,
    listes: {
      pieces: PIECES.map((p) => ({ k: p.k, lbl: p.lbl })), problemes: PROBLEMES.map((p) => ({ k: p.k, lbl: p.lbl })),
      elements: ELEMENTS.map((e) => ({ k: e.k, lbl: e.lbl })), natures: NATURES.map((n) => ({ k: n.k, lbl: n.lbl })),
      urgences: URGENCES.map((u) => ({ k: u.k, lbl: u.lbl })),
    },
  }) }];
  input.images.forEach((im, i) => { contenu.push({ type: 'text', text: `Photo ${i + 1}` }); contenu.push({ type: 'image_url', image_url: im }); });
  return [{ role: 'system', content: system }, { role: 'user', content: contenu }];
}

const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const S = { type: 'string' };
export const jsonSchema = obj({
  resume: S, piece: S, probleme: S, element: S, nature: S, urgence: { type: 'string', enum: ['faible', 'importante', 'urgente'] },
  urgences: { type: 'array', items: S },
  questions: { type: 'array', items: obj({ question: S, choix: { type: 'array', items: S } }) },
});

export const resumeAdmis = (r) => { const t = texteBorne(r, LIMITES.resumeMax); if (!t) return null; const n = normaliser(t); return INTERDITS.some((re) => re.test(n)) ? null : t; };

export function validerSortie(raw, input) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  let rejets = 0;
  const cle = (liste, v, def) => { if (CLES(liste).includes(v)) return v; if (v != null && v !== def) rejets++; return def; };
  let resume = resumeAdmis(raw.resume);
  if (!resume) { rejets++; resume = texteBorne(input.texte, LIMITES.resumeMax) || input.texte.slice(0, LIMITES.resumeMax); }
  const urgence = ['faible', 'importante', 'urgente'].includes(raw.urgence) ? raw.urgence : 'importante';
  const urgences = [...new Set((Array.isArray(raw.urgences) ? raw.urgences : []).filter((u) => CLES(URGENCES).includes(u)))];
  const questions = [];
  if (!input.reponses.length) {
    for (const q of Array.isArray(raw.questions) ? raw.questions : []) {
      const question = texteBorne(q && q.question, LIMITES.questionMax);
      const choix = (Array.isArray(q && q.choix) ? q.choix : []).map((c) => texteBorne(c, LIMITES.choixMax)).filter(Boolean).slice(0, 4);
      if (!question || choix.length < 2 || questions.length >= 2 || INTERDITS.some((re) => re.test(normaliser(question)))) { rejets++; continue; }
      questions.push({ question, choix });
    }
  } else if (Array.isArray(raw.questions) && raw.questions.length) rejets++;
  const data = {
    resume, piece: cle(PIECES, raw.piece, 'autre'), probleme: cle(PROBLEMES, raw.probleme, 'autre'),
    element: cle(ELEMENTS, raw.element, 'autre'), nature: cle(NATURES, raw.nature, 'autre'),
    urgence: urgences.length && urgence === 'faible' ? 'importante' : urgence, urgences, questions,
  };
  return { ok: true, rejets, data };
}
