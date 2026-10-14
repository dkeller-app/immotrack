// relay/src/ai/tasks/edl-photos.js — tâche « choisir les photos d'une pièce filmée » (EDL-VIDEO-IA).
//
// Entrée : des IMAGES tirées de la vidéo sur le téléphone (jamais la vidéo), 8 au plus par appel, et la
// liste des éléments de la pièce (avec, si connu, l'instant où l'élément a été cité à voix haute).
// Sortie : pour chaque élément VISIBLE, 1 à 3 images et le cadre qui l'entoure, plus un constat visuel
// bref. Principe « l'IA lit, la loi décide » (décision Didier 14/10) : l'image ne propose JAMAIS d'état
// ni de responsabilité — l'état vient de la voix (tâche edl-piece) et reste une décision humaine.
// Rien de ce qui sort d'ici n'est écrit dans l'EDL : l'app présente des photos à garder ou écarter.
// Tâche « vidéo » : refusée (503 video_disabled) tant que l'interrupteur AI_VIDEO est éteint.
import { texteBorne, normaliser } from '../texte.js';
import { VIDEO_DEFAUTS } from '../video.js';

export const nom = 'edl-photos';
export const video = true;                                  // soumise à l'interrupteur AI_VIDEO
export const JSON_MAX = VIDEO_DEFAUTS.jsonMaxOctets;        // plafond propre à la tâche (images en base64)
export const DELAI_MS = 45000;                              // 8 images : plus long qu'une structuration texte

export const LIMITES = {
  elementsMax: 120,
  nomMax: 120,
  imagesMax: VIDEO_DEFAUTS.imagesParAppel,
  imageMax: VIDEO_DEFAUTS.imageMaxCaracteres,
  instantMax: 3600,          // s (une prise dure 3 min ; marge pour plusieurs prises mises bout à bout)
  imagesParElement: 3,
  vuMax: 200,
  cadreMin: 0.04,            // un cadre plus petit que 4 % du côté n'est pas une photo exploitable
};

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const DATA = /^data:image\/(jpeg|webp|png);base64,([A-Za-z0-9+/]+={0,2})$/;
// Mots d'état (EDL_ETATS) et de responsabilité : un constat visuel qui les contient est retiré.
const INTERDITS = [/\bneuf\b|\bneuve\b/, /bon etat/, /etat d.?usage/, /mauvais etat/, /\busure normale\b/, /\bdegradation\b/, /\bvetuste\b/, /\bresponsab/, /\ba la charge\b/, /\bimputable\b/];

const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ── Entrée (navigateur → relais) ─────────────────────────────────────────────────────────────────
export function validerEntree(input) {
  if (!input || typeof input !== 'object') return { ok: false, raison: 'entree' };
  const piece = texteBorne(input.piece, LIMITES.nomMax) || 'Pièce';
  const mode = input.mode === 'sortie' ? 'sortie' : 'entree';
  if (!Array.isArray(input.elements) || !input.elements.length) return { ok: false, raison: 'elements' };
  if (input.elements.length > LIMITES.elementsMax) return { ok: false, raison: 'elements_trop_nombreux' };
  const vus = new Set();
  const elements = [];
  for (const e of input.elements) {
    if (!e || typeof e !== 'object') return { ok: false, raison: 'element' };
    const id = String(e.id == null ? '' : e.id);
    const n = texteBorne(e.nom, LIMITES.nomMax);
    if (!ID.test(id) || !n || vus.has(id)) return { ok: false, raison: 'element' };
    vus.add(id);
    const cite = nombre(e.citeVers);
    elements.push({ id, nom: n, note: !!e.note, citeVers: cite != null && cite >= 0 && cite <= LIMITES.instantMax ? Math.round(cite * 10) / 10 : null });
  }
  if (!Array.isArray(input.images) || !input.images.length) return { ok: false, raison: 'images' };
  if (input.images.length > LIMITES.imagesMax) return { ok: false, raison: 'images_trop_nombreuses' };
  const ivus = new Set();
  const images = [];
  for (const im of input.images) {
    if (!im || typeof im !== 'object') return { ok: false, raison: 'image' };
    const id = String(im.id == null ? '' : im.id);
    const t = nombre(im.t);
    if (!ID.test(id) || ivus.has(id) || t == null || t < 0 || t > LIMITES.instantMax) return { ok: false, raison: 'image' };
    if (typeof im.data !== 'string' || im.data.length > LIMITES.imageMax || !DATA.test(im.data)) return { ok: false, raison: 'image_format' };
    ivus.add(id);
    images.push({ id, t: Math.round(t * 10) / 10, data: im.data });
  }
  return { ok: true, input: { piece, mode, elements, images } };
}

// ── Messages envoyés au modèle (texte + images) ──────────────────────────────────────────────────────
export function messages(input) {
  const system = [
    "Tu aides à illustrer le BROUILLON d'un état des lieux de location en France. Tu reçois des images",
    "tirées d'une vidéo filmée dans une pièce, chacune avec un identifiant et son instant (secondes).",
    'Un humain choisira les photos à garder : tu proposes, tu ne décides pas.',
    '',
    'Règles impératives :',
    "1. N'utilise QUE les éléments de la liste fournie, désignés par leur `id`. Un élément qui n'est pas",
    '   clairement visible sur au moins une image n\'apparaît PAS dans la réponse. Ne devine jamais.',
    "2. Pour chaque élément visible : 1 à 3 images (les plus nettes, l'élément entier si possible) et le",
    "   cadre qui l'entoure : x, y, l, h entre 0 et 1 (origine en haut à gauche de l'image).",
    "3. `vu` : constat visuel bref et factuel (matière, couleur, défaut VISIBLE : rayure, trace, éclat),",
    "   ou null. JAMAIS d'état (neuf, bon état, état d'usage, mauvais état), JAMAIS de responsabilité,",
    "   d'usure « normale » ni de coût. Pas d'appréciation, pas de supposition.",
    "4. `citeVers` (si présent) = instant où l'élément a été nommé à voix haute : un indice, pas une règle.",
    "5. Les objets personnels de l'occupant (vaisselle, plantes, bouteilles, petit électroménager posé,",
    '   meubles non fixés) ne sont pas des éléments : ne les décris pas.',
    "6. `personnes` : identifiants des images où une personne est visible (rien d'autre à son sujet).",
    'Réponds uniquement par le JSON demandé.',
  ].join('\n');
  const contenu = [{
    type: 'text',
    text: JSON.stringify({
      piece: input.piece,
      etatDesLieux: input.mode === 'sortie' ? 'sortie' : 'entrée',
      elements: input.elements.filter((e) => !e.note).map((e) => (e.citeVers != null ? { id: e.id, nom: e.nom, citeVers: e.citeVers } : { id: e.id, nom: e.nom })),
      images: input.images.map((im) => ({ id: im.id, t: im.t })),
    }),
  }];
  for (const im of input.images) {
    contenu.push({ type: 'text', text: `Image ${im.id} (t = ${im.t} s)` });
    contenu.push({ type: 'image_url', image_url: im.data });
  }
  return [{ role: 'system', content: system }, { role: 'user', content: contenu }];
}

// ── Schéma JSON strict ─────────────────────────────────────────────────────────────────────────────
const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const N = { type: 'number' };
export const jsonSchema = obj({
  elements: { type: 'array', items: obj({
    elementId: { type: 'string' },
    images: { type: 'array', items: obj({ imageId: { type: 'string' }, x: N, y: N, l: N, h: N }) },
    vu: { type: ['string', 'null'] },
  }) },
  personnes: { type: 'array', items: { type: 'string' } },
});

// ── Sortie (modèle → relais → navigateur) ──────────────────────────────────────────────────────────
// Ce qui ne respecte pas les règles est ÉCARTÉ (compté dans `rejets`, sans contenu), jamais corrigé.
const arr3 = (v) => Math.round(v * 1000) / 1000;
export function cadreValide(c) {
  const x = nombre(c && c.x), y = nombre(c && c.y), l = nombre(c && c.l), h = nombre(c && c.h);
  if (x == null || y == null || l == null || h == null) return null;
  const eps = 0.002;
  if (x < -eps || y < -eps || l < LIMITES.cadreMin || h < LIMITES.cadreMin || x + l > 1 + eps || y + h > 1 + eps) return null;
  const xx = Math.max(0, x), yy = Math.max(0, y);
  return { x: arr3(xx), y: arr3(yy), l: arr3(Math.min(l, 1 - xx)), h: arr3(Math.min(h, 1 - yy)) };
}
export function vuAdmis(vu) {
  const v = texteBorne(vu, LIMITES.vuMax);
  if (!v) return null;
  const n = normaliser(v);
  return INTERDITS.some((re) => re.test(n)) ? null : v;
}

export function validerSortie(raw, input) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  if (raw.elements != null && !Array.isArray(raw.elements)) return { ok: false };
  if (raw.personnes != null && !Array.isArray(raw.personnes)) return { ok: false };
  const parId = new Map(input.elements.map((e) => [e.id, e]));
  const parImage = new Map(input.images.map((im) => [im.id, im]));
  let rejets = 0;
  const elements = [];
  const vus = new Set();
  for (const e of raw.elements || []) {
    const el = e && parId.get(String(e.elementId));
    if (!el || el.note || vus.has(el.id)) { rejets++; continue; }
    const images = [];
    const ivus = new Set();
    for (const im of Array.isArray(e.images) ? e.images : []) {
      const src = im && parImage.get(String(im.imageId));
      const cadre = src && cadreValide(im);
      if (!src || !cadre || ivus.has(src.id) || images.length >= LIMITES.imagesParElement) { rejets++; continue; }
      ivus.add(src.id);
      images.push({ imageId: src.id, t: src.t, cadre });
    }
    let vu = null;
    if (e.vu != null) { vu = vuAdmis(e.vu); if (!vu) rejets++; }
    if (!images.length) { rejets++; continue; }   // pas de photo = pas de proposition d'image
    vus.add(el.id);
    elements.push({ elementId: el.id, images, vu });
  }
  const personnes = [...new Set((raw.personnes || []).map(String).filter((id) => parImage.has(id)))];
  return { ok: true, data: { elements, personnes }, rejets };
}
