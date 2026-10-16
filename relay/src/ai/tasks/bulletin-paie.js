// relay/src/ai/tasks/bulletin-paie.js — tâche « lire un bulletin de salaire » (VERIF-DOCUMENTS lot 3 ; REGLES-PAIE).
//
// L'IA LIT, les règles décident : le modèle de lecture de documents (Mistral OCR, annotations structurées) recopie les
// montants et les dates ; il ne calcule rien et ne juge rien. Les règles de cohérence (Code du travail R3243-1, arrêté du
// 25/02/2016, taux Urssaf 2026, BOSS) sont appliquées ENSUITE, dans l'app, par js/core/regles-bulletin.js, derrière un
// garde-fou de lecture (une erreur de lecture ne produit jamais de constat). Chaque valeur reste corrigeable.
//
// Entrée : { type: 'bulletin' | 'contrat', images: [ 1 image ] } — UNE page (page 1 du bulletin ou du contrat de travail),
// rendue en JPEG dans le navigateur du propriétaire (PDF rendu en image, ou photo) : rien d'autre n'est envoyé.
// Soumise à l'interrupteur AI_OCR (src/ai/ocr.js) : éteinte tant que le point d'accès UE n'a pas été vérifié.
//
// REGLES-PAIE (16/10/2026) : schéma étendu (salaire de base, heures, taux horaire, total des cotisations salariales,
// lignes de cotisations, lignes entre le total et le net, cumul brut). Prix inchangé : l'OCR annoté est facturé à la page.
// Contrôles de sortie ajoutés : au plus LIGNES_MAX lignes (au-delà : `lignesTronquees`), SIRET à clé de contrôle valide,
// et chaque nombre de l'annotation doit figurer dans le texte reconnu de la page (sinon : null, compté dans `rejets`).
// Le texte reconnu ne sert qu'à ce contrôle : il n'est ni renvoyé ni journalisé.
import { texteBorne } from '../texte.js';

export const nom = 'bulletin-paie';
export const images = true;
export const ocr = true;
export const JSON_MAX = 1200 * 1024;
export const DELAI_MS = 45000;
export const LIMITES = { imagesMax: 1, imageMax: 1100 * 1024, texteMax: 120, libelleMax: 80, montantMax: 1000000, lignesMax: 40, autresMax: 8 };
const DATA = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export function validerEntree(input) {
  if (!input || typeof input !== 'object') return { ok: false, raison: 'entree' };
  const type = input.type === 'contrat' ? 'contrat' : input.type === 'bulletin' ? 'bulletin' : null;
  if (!type) return { ok: false, raison: 'type' };
  if (!Array.isArray(input.images) || input.images.length !== 1) return { ok: false, raison: 'images' };
  const im = input.images[0];
  if (typeof im !== 'string' || im.length > LIMITES.imageMax || !DATA.test(im)) return { ok: false, raison: 'image_format' };
  return { ok: true, input: { type, images: [im] } };
}

const COMMUN = [
  'Recopier les valeurs telles qu\'elles sont écrites sur le document. Ne rien calculer, ne rien déduire, ne rien corriger.',
  'Une valeur absente, coupée ou illisible = null. Montants : nombres en euros (point décimal, sans espace ni symbole).',
  'Dates : AAAA-MM-JJ. SIRET : 14 chiffres sans espace. `lisible` = false si les montants principaux ne se lisent pas.',
];
/** Consigne de l'annotation (document_annotation_prompt). */
export function consigne(input) {
  if (input.type === 'contrat') {
    return ['Document : première page d\'un contrat de travail français.', ...COMMUN,
      '`dateDebut` = date d\'entrée ou de début du contrat. `typeContrat` = CDI, CDD, intérim, apprentissage… tel qu\'écrit.'].join('\n');
  }
  return ['Document : bulletin de salaire (fiche de paie) français.', ...COMMUN,
    '`periode` = mois de paie au format AAAA-MM. `dateEntree` = date d\'entrée du salarié si elle figure.',
    '`heures`, `tauxHoraire`, `salaireBase` = ligne « salaire de base » : nombre d\'heures, taux horaire, montant (null si la ligne ne porte pas d\'heures).',
    '`brut` = salaire brut du mois. `totalCotisations` = total des cotisations et contributions à la charge du salarié (part salariale).',
    '`lignes` = chaque ligne de cotisation ou de contribution qui a un montant à la charge du salarié, dans l\'ordre du bulletin : libellé tel qu\'écrit, base, taux salarial en %, montant salarial (négatif s\'il est imprimé négatif). 40 lignes au plus ; ne pas inclure les lignes sans part salariale.',
    '`autresLignes` = lignes situées entre le total des cotisations et le net à payer avant impôt (titres-restaurant, remboursement de transport, avantage en nature, acompte…) : libellé et montant tels qu\'imprimés.',
    '`netSocial` = « montant net social ». `netAvantImpot` = « net à payer avant impôt sur le revenu ».',
    '`impotBase`, `impotTaux` (en %), `impotMontant` = impôt sur le revenu prélevé à la source.',
    '`netAPayer` = net payé au salarié (après impôt). `netImposable` = net imposable du mois.',
    '`cumulBrut`, `cumulNetImposable` = cumuls de l\'année (colonne « cumul » ou « année », jamais celle du mois), s\'ils figurent.'].join('\n');
}

const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const SN = { type: ['string', 'null'] }, NN = { type: ['number', 'null'] }, B = { type: 'boolean' };
const LIGNE = obj({ libelle: SN, base: NN, taux: NN, montant: NN });
const AUTRE = obj({ libelle: SN, montant: NN });
export const SCHEMA_BULLETIN = obj({
  lisible: B, periode: SN, salarie: SN, employeur: SN, siret: SN, dateEntree: SN,
  heures: NN, tauxHoraire: NN, salaireBase: NN,
  brut: NN, totalCotisations: NN, lignes: { type: 'array', items: LIGNE }, autresLignes: { type: 'array', items: AUTRE },
  netSocial: NN, netAvantImpot: NN, impotBase: NN, impotTaux: NN, impotMontant: NN, netAPayer: NN, netImposable: NN,
  cumulBrut: NN, cumulNetImposable: NN,
});
export const SCHEMA_CONTRAT = obj({ lisible: B, salarie: SN, employeur: SN, siret: SN, dateDebut: SN, typeContrat: SN });
export function schema(input) { return input.type === 'contrat' ? SCHEMA_CONTRAT : SCHEMA_BULLETIN; }
export const jsonSchema = SCHEMA_BULLETIN;
// Le registre attend `messages` : pour une tâche OCR, l'unique message est la consigne (non utilisée par /v1/ocr).
export function messages(input) { return [{ role: 'user', content: consigne(input) }]; }

const borne = (v, min, max, dec) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10 ** dec) / 10 ** dec : null);
const montant = (v) => borne(v, -LIMITES.montantMax, LIMITES.montantMax, 2);
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null);
/** SIRET : 14 chiffres et clé de Luhn (La Poste, SIREN 356000000 : somme des chiffres multiple de 5). Une erreur de
 *  lecture d'un chiffre (ou deux chiffres voisins inversés) rend la clé invalide : la valeur est écartée. */
export function siretValide(d) {
  if (!/^\d{14}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 14; i++) { let n = +d[13 - i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } s += n; }
  if (s % 10 === 0) return true;
  return d.startsWith('356000000') && d.split('').reduce((t, c) => t + +c, 0) % 5 === 0;
}
const siret = (v) => { const s = typeof v === 'string' ? v.replace(/[\s.]/g, '') : ''; return siretValide(s) ? s : null; };

/** Nombres présents dans le texte reconnu (formats français et anglais, milliers par espace ou point), en valeur absolue. */
export function nombresDuTexte(texte) {
  const out = new Set(); const t = String(texte || '').replace(/[\u00A0\u2007\u2009\u202F]/g, ' ');
  const ajout = (x) => { if (Number.isFinite(x)) out.add(Math.round(Math.abs(x) * 10000) / 10000); };
  const lire = (tok) => {
    let s = tok;
    if (/,\d+$/.test(s)) { s = s.replace(/[ .]/g, '').replace(',', '.'); ajout(+s); return; }
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) { ajout(+s.replace(/\./g, '')); ajout(+s.replace(/\.(?=\d{3}$)/, '').replace(/\./g, '')); ajout(parseFloat(s)); return; }
    ajout(+s.replace(/ /g, ''));
  };
  const RE = /\d{1,3}(?:[ .]\d{3})+(?:,\d+|\.\d{1,2}(?!\d))?|\d+(?:[.,]\d+)?/g; let m;
  while ((m = RE.exec(t))) { lire(m[0]); for (const p of m[0].split(' ')) if (p) lire(p); }
  return out;
}

/** Libellé de ligne : borné ; écarté s'il porte une longue suite de chiffres (NIR, IBAN…) — jamais stocké. */
const libelle = (v) => { const t = texteBorne(v, LIMITES.libelleMax); return t && t.replace(/\D/g, '').length >= 13 ? null : t; };

export function validerSortie(raw, input, ctx) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  let rejets = 0;
  const garde = (brut, propre) => { if (brut != null && brut !== '' && propre == null) rejets++; return propre; };
  if (input && input.type === 'contrat') {
    const data = { lisible: raw.lisible !== false,
      salarie: texteBorne(raw.salarie, LIMITES.texteMax), employeur: texteBorne(raw.employeur, LIMITES.texteMax), siret: garde(raw.siret, siret(raw.siret)),
      dateDebut: garde(raw.dateDebut, date(raw.dateDebut)), typeContrat: texteBorne(raw.typeContrat, 40) };
    return { ok: true, rejets, data };
  }
  // Contrôle de présence dans le texte reconnu (seulement si le fournisseur l'a fourni).
  // Texte FOURNI (Mistral) : contrôle, même vide (aucun nombre retrouvé → tout montant non nul écarté). Texte ABSENT
  // (fournisseur simulé) : pas de contrôle.
  const texte = ctx && typeof ctx.texte === 'string' ? nombresDuTexte(ctx.texte) : null;
  const vu = (x) => (x == null || x === 0 || !texte ? x : (texte.has(Math.round(Math.abs(x) * 10000) / 10000) ? x : null));
  const nb = (v, f) => garde(v, vu(f(v)));
  const periode = typeof raw.periode === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.periode) ? raw.periode : null;
  const data = {
    lisible: raw.lisible !== false, periode: garde(raw.periode, periode),
    salarie: texteBorne(raw.salarie, LIMITES.texteMax), employeur: texteBorne(raw.employeur, LIMITES.texteMax),
    siret: garde(raw.siret, siret(raw.siret)), dateEntree: garde(raw.dateEntree, date(raw.dateEntree)),
    impotTaux: nb(raw.impotTaux, (v) => borne(v, 0, 60, 2)),
    heures: nb(raw.heures, (v) => borne(v, 0, 400, 2)), tauxHoraire: nb(raw.tauxHoraire, (v) => borne(v, 0, 1000, 4)),
  };
  for (const k of ['salaireBase', 'brut', 'totalCotisations', 'netSocial', 'netAvantImpot', 'impotBase', 'impotMontant', 'netAPayer', 'netImposable', 'cumulBrut', 'cumulNetImposable']) data[k] = nb(raw[k], montant);
  const L = Array.isArray(raw.lignes) ? raw.lignes : [];
  if (L.length > LIMITES.lignesMax) data.lignesTronquees = true;
  data.lignes = L.slice(0, LIMITES.lignesMax).filter((l) => l && typeof l === 'object' && !Array.isArray(l)).map((l) => ({
    libelle: libelle(l.libelle), base: nb(l.base, montant), taux: nb(l.taux, (v) => borne(v, -100, 100, 4)), montant: nb(l.montant, montant),
  }));
  const A = Array.isArray(raw.autresLignes) ? raw.autresLignes : [];
  data.autresLignes = A.slice(0, LIMITES.autresMax).filter((l) => l && typeof l === 'object' && !Array.isArray(l)).map((l) => ({ libelle: libelle(l.libelle), montant: nb(l.montant, montant) }));
  if (A.length > LIMITES.autresMax) data.autresTronquees = true;
  return { ok: true, rejets, data };
}
