// relay/src/ai/fake.js — FOURNISSEUR SIMULÉ du socle IA (tests, développement, démonstration).
//
// Il ne doit JAMAIS servir en production : il n'est actif que si AI_PROVIDER = "fake" (variable posée
// par les tests, jamais dans wrangler.toml). Il imite le contrat du vrai fournisseur :
//   - transcrire : renvoie une transcription fixe (la vraie transcription Whisper de la cuisine du
//     12/10, avec ses erreurs) — l'audio n'est pas analysé ;
//   - structurer('edl-piece') : un analyseur à règles (mots-clés, petit dictionnaire de corrections).
// Ses résultats ne mesurent PAS la qualité d'un modèle : ils font tourner la chaîne de bout en bout
// et donnent une base de comparaison. La mesure réelle se fait avec la clé (scripts/eval-edl.mjs).
import { normaliser } from './texte.js';

export const FAKE_TRANSCRIPTION = [
  { start: 0.9, end: 10.2, text: 'porte blanche vitrée en bois avec du bois aussi autour, un frigo congélateur et' },
  { start: 12.2, end: 24.3, text: 'frigo bonneta gris, un plan de travail avec trois tiroirs, four à vapeur bonneta avec machine à café' },
  { start: 24.3, end: 37.3, text: "car l'âge de sol en ciment, en faillance, vasque évier style ancien avec rayures, deux placards," },
  { start: 37.3, end: 47.7, text: 'un de la vaisselle, une plaque de cuisson avec rayures, placard en haut, il faut compter le' },
  { start: 47.7, end: 53.9, text: 'nom de placard, un point lumineux, des prises,' },
];
export const FAKE_TEXTE = FAKE_TRANSCRIPTION.map((s) => s.text).join(' ');

// Corrections connues des erreurs de transcription (entendu → compris). `doute` = interprétation.
const CORRECTIONS = [
  { re: /car l'[aâ]ge/i, compris: 'carrelage' },
  { re: /faillance/i, compris: 'faïence' },
  { re: /un de la vaisselle/i, compris: 'un lave-vaisselle', doute: true },
  { re: /(le )?nom de placards?/i, compris: 'le nombre de placards' },
];

// Mots-clés par élément (motif sur le NOM normalisé de l'élément → motifs sur le texte normalisé).
// L'ordre compte : le plus spécifique d'abord.
const MOTS = [
  [/meubles? hauts?/, [/placards? (en )?hauts?/, /placards? en haut/, /meubles? hauts?/]],
  [/meubles? bas/, [/placards?/, /meubles? bas/]],
  [/lave vaisselle/, [/lave vaisselle/]],
  [/prise internet|rj45/, [/prise internet/, /rj45/, /prise reseau/]],
  [/prises? electrique/, [/prises?/]],
  [/plan de travail/, [/plan de travail/]],
  [/plaques? de cuisson/, [/plaques?/, /cuisson/, /induction/, /vitroceramique/]],
  [/refrigerateur/, [/frigo/, /refrigerateur/, /congelateur/]],
  [/robinetterie/, [/robinet/, /mitigeur/]],
  [/^evier/, [/evier/, /vasque/]],
  [/credence/, [/credence/, /faience/]],
  [/hotte/, [/hotte/]],
  [/^four$/, [/\bfour\b/]],
  [/^sol$/, [/\bsol\b/, /carrelage/, /parquet/, /lino/, /moquette/]],
  [/plinthes?/, [/plinthes?/]],
  [/^murs?$/, [/\bmurs?\b/, /peinture/]],
  [/plafond/, [/plafond/]],
  [/fenetres?/, [/fenetres?/]],
  [/volets?|stores?/, [/volets?/, /stores?/]],
  [/^portes?/, [/\bportes?\b/]],
  [/radiateur/, [/radiateurs?/, /thermostat/, /chauffage/]],
  [/interrupteurs?/, [/interrupteurs?/]],
  [/eclairage/, [/point lumineux/, /lumiere/, /luminaire/, /eclairage/, /plafonnier/, /suspension/, /ampoule/]],
  [/vmc|aeration/, [/vmc/, /aeration/, /ventilation/]],
];

const ETATS = [
  [/\bneuf\b|\bneuve\b/, 'Neuf'],
  [/\bbon etat\b|\btres bon\b/, 'Bon état'],
  [/mauvais etat|\bcasse|\bfele|\babime|hors service|ne fonctionne pas/, 'Mauvais état'],
  [/etat d'?usage|\busee?s?\b|\busure\b|\brayures?\b|\btraces?\b|\btaches?\b/, "État d'usage"],
  [/\babsente?s?\b|\bmanque\b/, 'Absent'],
];

function motsElement(el) {
  const n = normaliser(el.nom);
  for (const [re, mots] of MOTS) if (re.test(n)) return mots;
  const w = n.split(' ').find((x) => x.length >= 4);
  return w ? [new RegExp(`\\b${w}`)] : [];
}

function corriger(brut) {
  let t = brut; const faites = [];
  for (const c of CORRECTIONS) {
    const m = c.re.exec(t);
    if (m) { faites.push({ entendu: m[0], compris: c.compris, doute: !!c.doute }); t = t.replace(c.re, c.compris); }
  }
  return { t, faites };
}

// Découpe la transcription en « mentions » (morceaux de texte BRUT, donc citables mot pour mot).
// L'élément dont le mot-clé reconnu est le plus long (le plus spécifique) : « placard en haut » →
// Meubles hauts, pas Meubles bas.
function elementDe(texteNorm, elements) {
  let best = null, lg = 0;
  for (const e of elements) {
    if (e.note) continue;
    for (const re of motsElement(e)) { const m = re.exec(texteNorm); if (m && m[0].length > lg) { best = e; lg = m[0].length; } }
  }
  return best;
}

function mentions(texte, elements) {
  const out = [];
  for (const morceau of texte.split(/,|;|\.|\bet\b/)) {
    const brut = morceau.trim();
    if (!brut) continue;
    // « plat » = brut sans accents ni majuscules, MÊME longueur que le brut (positions réutilisables).
    const plat = brut.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/^il faut/.test(plat) || plat.length !== brut.length) { out.push(brut); continue; }
    // Repères : mot-clé d'élément, ou déclencheur de correction (rattaché à l'élément du mot corrigé).
    const reperes = [];
    for (const e of elements) {
      if (e.note) continue;
      for (const re of motsElement(e)) {
        const m = new RegExp(re.source, 'g'); let x;
        while ((x = m.exec(plat))) { reperes.push({ pos: x.index, el: e }); if (!x[0]) m.lastIndex++; }
      }
    }
    for (const c of CORRECTIONS) {
      const m = c.re.exec(brut);
      if (m) reperes.push({ pos: m.index, el: elementDe(normaliser(c.compris), elements) });
    }
    reperes.sort((a, b) => a.pos - b.pos);
    // Coupe seulement quand l'élément CHANGE (deux mots du même élément restent ensemble).
    const coupes = []; let cur;
    for (const r of reperes) {
      if (!r.el) continue;
      if (cur && r.el !== cur && r.pos > 0 && plat[r.pos - 1] === ' ') coupes.push(r.pos);
      cur = r.el;
    }
    const pts = [0, ...coupes, brut.length];
    for (let i = 0; i < pts.length - 1; i++) { const s = brut.slice(pts[i], pts[i + 1]).trim(); if (s) out.push(s); }
  }
  return out;
}

const ARTICLES = /^(un|une|des|le|la|les|du|de la|en)\s+/i;
function phrase(s) {
  const t = s.replace(ARTICLES, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.') : '';
}

export function fauxEdlPiece(input) {
  const elements = input.elements || [];
  const parId = new Map();
  const corrections = [];
  let dernier = null;
  for (const brut of mentions(input.texte || '', elements)) {
    const { t, faites } = corriger(brut);
    faites.forEach((f) => { if (!corrections.some((c) => c.entendu === f.entendu)) corrections.push({ entendu: f.entendu, compris: f.compris }); });
    const n = normaliser(t);
    let el = null;
    if (!/^il faut|^a verifier/.test(n)) {
      el = elementDe(n, elements);
    }
    if (!el && dernier && /^(il faut|a verifier|en |avec )/.test(n)) el = dernier;   // suite de la mention précédente
    if (!el) continue;
    dernier = el;
    const p = parId.get(el.id) || { elementId: el.id, etat: null, justification: null, obs: [], sources: [], aVerifier: null };
    const etat = ETATS.find(([re]) => re.test(n));
    if (etat && !p.etat) { p.etat = etat[1]; p.justification = `Mot entendu : « ${n.match(etat[0])[0].trim()} ».`; }
    if (/^il faut compter/.test(n)) p.aVerifier = 'Nombre à compter.';
    else if (faites.some((f) => f.doute)) p.aVerifier = 'Interprétation de la transcription à vérifier.';
    else p.obs.push(phrase(t));
    p.sources.push(brut);
    parId.set(el.id, p);
  }
  const propositions = [...parId.values()].map((p) => ({
    elementId: p.elementId, etat: p.etat,
    observation: p.obs.filter(Boolean).join(' ') || (p.aVerifier ? p.aVerifier : null),
    source: p.sources[0], justification: p.justification, aVerifier: p.aVerifier,
  }));
  return { propositions, aAjouter: [], compteurs: fauxCompteurs(input.texte || ''), corrections };
}

// Compteurs dictés : « compteur électrique 12 345 », « heures creuses 6789 », « eau froide 456,3 »…
function fauxCompteurs(texte) {
  const out = []; const vus = new Set();
  const re = /(num[ée]ro (?:du )?compteur (?:de )?(?:gaz|[ée]lectrique|d'eau froide|d'eau chaude)|compteur [ée]lectrique|[ée]lectricit[ée]|heures? creuses|heures? pleines|eau froide|eau chaude|gaz)\D{0,12}?(\d[\d\s]*(?:[.,]\d+)?)/gi;
  let m;
  while ((m = re.exec(texte))) {
    const lib = normaliser(m[1]);
    let cle = null;
    if (lib.startsWith('numero')) cle = lib.includes('gaz') ? 'gaz-num' : lib.includes('chaude') ? 'eau-c-num' : lib.includes('froide') ? 'eau-f-num' : 'elec-num';
    else if (lib.includes('creuses')) cle = 'elec-hc';
    else if (lib.includes('pleines') || lib.includes('electri')) cle = 'elec-hp';
    else if (lib.includes('froide')) cle = 'eau-f';
    else if (lib.includes('chaude')) cle = 'eau-c';
    else if (lib.includes('gaz')) cle = 'gaz';
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    out.push({ cle, valeur: m[2].trim(), source: m[0].trim(), aVerifier: cle.endsWith('-num') ? 'Numéro dicté : vérifier sur le compteur.' : null });
  }
  return out;
}
