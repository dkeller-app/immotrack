// relay/src/ai/tasks/edl-piece.js — tâche « structurer la dictée d'une pièce d'état des lieux ».
//
// Une TÂCHE du socle IA = { nom, validerEntree, messages, jsonSchema, validerSortie }. Le relais ne fait
// confiance ni à l'entrée (vient du navigateur) ni à la sortie (vient du modèle) : les deux sont
// validées ici. Principe produit : « l'IA lit, la loi décide » — le modèle ne peut renvoyer que des
// éléments de la liste fournie (ou des « éléments à ajouter » marqués comme tels), des états de
// EDL_ETATS, et chaque proposition doit citer un extrait qui figure VRAIMENT dans la transcription.
// Rien de ce qui sort d'ici n'est écrit dans l'EDL : le front présente des propositions que
// l'utilisateur accepte, modifie ou ignore une par une.
import { contientExtrait, normaliser, texteBorne } from '../texte.js';

// Copie EXACTE de EDL_ETATS (js/app/app-part2.js). Un test de l'app vérifie l'égalité des deux listes.
export const EDL_ETATS = ['Neuf', 'Bon état', "État d'usage", 'Mauvais état', 'Absent'];

// Champs compteurs existants de l'EDL (index.html, section #edl-step-compteurs).
export const COMPTEUR_CLES = ['elec-num', 'elec-hp', 'elec-hc', 'gaz-num', 'gaz', 'eau-c-num', 'eau-c', 'eau-f-num', 'eau-f'];
const COMPTEUR_NUM = new Set(['elec-num', 'gaz-num', 'eau-c-num', 'eau-f-num']);

export const LIMITES = {
  texteMax: 20000,       // caractères de transcription (≈ 30 min de parole)
  elementsMax: 120,
  nomMax: 120,
  observationMax: 400,
  sourceMax: 300,
  justificationMax: 200,
  verifierMax: 200,
  ajoutsMax: 10,
  correctionsMax: 20,
};

export const nom = 'edl-piece';

// ── Entrée (navigateur → relais) ─────────────────────────────────────────────────────────────────
export function validerEntree(input) {
  if (!input || typeof input !== 'object') return { ok: false, raison: 'entree' };
  const texte = typeof input.texte === 'string' ? input.texte.trim() : '';
  if (!texte) return { ok: false, raison: 'texte_vide' };
  if (texte.length > LIMITES.texteMax) return { ok: false, raison: 'texte_trop_long' };
  const piece = texteBorne(input.piece, LIMITES.nomMax) || 'Pièce';
  const mode = input.mode === 'sortie' ? 'sortie' : 'entree';
  if (!Array.isArray(input.elements)) return { ok: false, raison: 'elements' };
  if (input.elements.length > LIMITES.elementsMax) return { ok: false, raison: 'elements_trop_nombreux' };
  const vus = new Set();
  const elements = [];
  for (const e of input.elements) {
    if (!e || typeof e !== 'object') return { ok: false, raison: 'element' };
    const id = String(e.id == null ? '' : e.id);
    const n = texteBorne(e.nom, LIMITES.nomMax);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !n || vus.has(id)) return { ok: false, raison: 'element' };
    vus.add(id);
    elements.push({ id, nom: n, note: !!e.note });
  }
  return { ok: true, input: { piece, mode, elements, texte } };
}

// ── Messages envoyés au modèle ─────────────────────────────────────────────────────────────────────
export function messages(input) {
  const system = [
    "Tu prépares le BROUILLON d'un état des lieux de location en France à partir de la transcription",
    "d'un commentaire oral fait dans une pièce. Un humain relira et validera chaque ligne : tu proposes,",
    'tu ne décides pas.',
    '',
    'Règles impératives :',
    "1. N'utilise QUE les éléments de la liste fournie, désignés par leur `id`. Un élément cité qui n'est pas",
    '   dans la liste va dans `aAjouter` (jamais les objets personnels de l\'occupant : vaisselle, plantes,',
    '   bouteilles, petit électroménager posé, meubles non fixés).',
    `2. L'état est l'une de ces valeurs exactes : ${EDL_ETATS.map((e) => JSON.stringify(e)).join(', ')} — ou null.`,
    "   Propose un état seulement s'il est dit, ou clairement décrit (ex. « rayures » → État d'usage).",
    "   Dans ce cas `justification` dit en quelques mots ce qui fonde l'état. Sinon etat = null.",
    "   Ne devine jamais un état à partir de rien. Les éléments marqués note:true n'ont jamais d'état.",
    "3. `observation` : constat factuel, court, en français correct, sans invention ni appréciation.",
    '4. `source` : extrait COPIÉ MOT POUR MOT de la transcription (avec ses fautes) qui fonde la proposition.',
    "5. La transcription automatique contient des erreurs (« car l'âge » = carrelage, « faillance » =",
    '   faïence…) : corrige-les dans l\'observation et liste-les dans `corrections` (entendu mot pour mot →',
    '   compris). Si une interprétation est incertaine, dis-le dans `aVerifier`.',
    "6. Information à compléter (nombre à compter, marque inconnue) : la mettre dans `aVerifier`.",
    `7. Compteurs : si un index ou un numéro de compteur est dicté, une entrée dans \`compteurs\` avec \`cle\``,
    `   parmi ${COMPTEUR_CLES.join(', ')} (elec-hp si un seul index électrique) et \`valeur\` en chiffres.`,
    "8. N'écris aucune donnée personnelle (nom, santé, opinion) dans les observations.",
    "9. Un élément non cité n'apparaît PAS dans la réponse.",
    'Réponds uniquement par le JSON demandé.',
  ].join('\n');
  const user = JSON.stringify({
    piece: input.piece,
    etatDesLieux: input.mode === 'sortie' ? 'sortie' : 'entrée',
    elements: input.elements.map((e) => (e.note ? { id: e.id, nom: e.nom, note: true } : { id: e.id, nom: e.nom })),
    transcription: input.texte,
  });
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ── Schéma JSON strict demandé au modèle ───────────────────────────────────────────────────────────
const S = (t) => ({ type: t });
const SN = { type: ['string', 'null'] };
const ETAT = { type: ['string', 'null'], enum: [...EDL_ETATS, null] };
const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
export const jsonSchema = obj({
  propositions: { type: 'array', items: obj({ elementId: S('string'), etat: ETAT, observation: SN, source: S('string'), justification: SN, aVerifier: SN }) },
  aAjouter: { type: 'array', items: obj({ nom: S('string'), etat: ETAT, observation: SN, source: S('string'), justification: SN }) },
  compteurs: { type: 'array', items: obj({ cle: { type: 'string', enum: COMPTEUR_CLES }, valeur: S('string'), source: S('string'), aVerifier: SN }) },
  corrections: { type: 'array', items: obj({ entendu: S('string'), compris: S('string') }) },
});

// ── Sortie (modèle → relais → navigateur) ──────────────────────────────────────────────────────────
// Structure illisible → { ok:false }. Élément par élément : ce qui ne respecte pas les règles est
// ÉCARTÉ (compté dans `rejets`, sans contenu), jamais corrigé en douce.
export function normaliserValeurCompteur(cle, valeur) {
  if (typeof valeur !== 'string' && typeof valeur !== 'number') return null;
  const brut = String(valeur).replace(/[\s  ]/g, '');
  if (COMPTEUR_NUM.has(cle)) return /^[0-9A-Za-z][0-9A-Za-z-]{0,24}$/.test(brut) ? brut.toUpperCase() : null;
  const m = /^(\d{1,9})(?:[.,](\d{1,3}))?$/.exec(brut);
  if (!m) return null;
  return m[2] ? `${m[1]}.${m[2]}` : m[1];
}

function etatValide(etat, justification, estNote) {
  if (etat == null || estNote) return { etat: null, justification: null };
  if (!EDL_ETATS.includes(etat)) return null;                                  // valeur hors liste → rejet
  const j = texteBorne(justification, LIMITES.justificationMax);
  return j ? { etat, justification: j } : { etat: null, justification: null }; // état sans justification → retiré
}

export function validerSortie(raw, input) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  for (const k of ['propositions', 'aAjouter', 'compteurs', 'corrections']) {
    if (raw[k] != null && !Array.isArray(raw[k])) return { ok: false };
  }
  const texte = input.texte;
  const parId = new Map(input.elements.map((e) => [e.id, e]));
  const nomsExistants = new Set(input.elements.map((e) => normaliser(e.nom)));
  let rejets = 0;

  const propositions = [];
  const vus = new Set();
  for (const p of raw.propositions || []) {
    const el = p && parId.get(String(p.elementId));
    const source = p && texteBorne(p.source, LIMITES.sourceMax);
    if (!el || vus.has(el.id) || !source || !contientExtrait(texte, source)) { rejets++; continue; }
    const e = etatValide(p.etat, p.justification, el.note);
    if (!e) { rejets++; continue; }
    const observation = p.observation == null ? null : texteBorne(p.observation, LIMITES.observationMax);
    if (p.observation != null && !observation && String(p.observation).trim()) { rejets++; continue; }
    if (!e.etat && !observation) { rejets++; continue; }
    vus.add(el.id);
    propositions.push({
      elementId: el.id, etat: e.etat, observation, source, justification: e.justification,
      aVerifier: texteBorne(p.aVerifier, LIMITES.verifierMax),
    });
  }

  const aAjouter = [];
  for (const a of raw.aAjouter || []) {
    const n = a && texteBorne(a.nom, LIMITES.nomMax);
    const source = a && texteBorne(a.source, LIMITES.sourceMax);
    if (!n || nomsExistants.has(normaliser(n)) || !source || !contientExtrait(texte, source) || aAjouter.length >= LIMITES.ajoutsMax) { rejets++; continue; }
    const e = etatValide(a.etat, a.justification, false);
    if (!e) { rejets++; continue; }
    nomsExistants.add(normaliser(n));
    aAjouter.push({ nom: n, etat: e.etat, observation: texteBorne(a.observation, LIMITES.observationMax), source, justification: e.justification });
  }

  const compteurs = [];
  const clesVues = new Set();
  for (const c of raw.compteurs || []) {
    const cle = c && COMPTEUR_CLES.includes(c.cle) ? c.cle : null;
    const valeur = cle && normaliserValeurCompteur(cle, c.valeur);
    const source = c && texteBorne(c.source, LIMITES.sourceMax);
    if (!cle || !valeur || clesVues.has(cle) || !source || !contientExtrait(texte, source)) { rejets++; continue; }
    clesVues.add(cle);
    compteurs.push({ cle, valeur, source, aVerifier: texteBorne(c.aVerifier, LIMITES.verifierMax) });
  }

  const corrections = [];
  for (const k of raw.corrections || []) {
    const entendu = k && texteBorne(k.entendu, LIMITES.sourceMax);
    const compris = k && texteBorne(k.compris, LIMITES.nomMax);
    if (!entendu || !compris || !contientExtrait(texte, entendu) || corrections.length >= LIMITES.correctionsMax) { rejets++; continue; }
    corrections.push({ entendu, compris });
  }

  return { ok: true, data: { propositions, aAjouter, compteurs, corrections }, rejets };
}

// Vocabulaire d'aide à la transcription (« context_bias » Voxtral, activable par AI_CONTEXT_BIAS).
export const VOCABULAIRE = [
  'carrelage', 'faïence', 'crédence', 'plinthes', 'parquet', 'linoléum', 'moquette', 'plafond', 'huisserie',
  'vitrage', 'double vitrage', 'volet roulant', 'store', 'évier', 'vasque', 'robinetterie', 'mitigeur',
  'plan de travail', 'plaque de cuisson', 'induction', 'vitrocéramique', 'hotte aspirante', 'lave-vaisselle',
  'réfrigérateur', 'radiateur', 'thermostat', 'sèche-serviette', 'interrupteur', 'prise RJ45', 'VMC',
  'bouche d\'aération', 'baignoire', 'paroi de douche', 'chasse d\'eau', 'abattant', 'lave-mains',
  'éclat', 'fissure', 'fêlure', 'rayure', 'auréole', 'moisissure', 'état d\'usage', 'bon état', 'mauvais état',
];
