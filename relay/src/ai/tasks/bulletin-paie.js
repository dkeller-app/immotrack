// relay/src/ai/tasks/bulletin-paie.js — tâche « lire un bulletin de salaire » (VERIF-DOCUMENTS lot 3).
//
// L'IA LIT, les règles décident : le modèle de lecture de documents (Mistral OCR, annotations structurées) recopie les
// montants et les dates ; il ne calcule rien et ne juge rien. Les règles de cohérence (Code du travail R3243-1, arrêté du
// 25/02/2016) sont appliquées ENSUITE, dans l'app, par js/core/regles-bulletin.js. Chaque valeur reste corrigeable.
//
// Entrée : { type: 'bulletin' | 'contrat', images: [ 1 image ] } — UNE page (page 1 du bulletin ou du contrat de travail),
// rendue en JPEG dans le navigateur du propriétaire : rien d'autre que cette page n'est envoyé (minimisation).
// Soumise à l'interrupteur AI_OCR (src/ai/ocr.js) : éteinte tant que le point d'accès UE n'a pas été vérifié.
import { texteBorne } from '../texte.js';

export const nom = 'bulletin-paie';
export const images = true;
export const ocr = true;
export const JSON_MAX = 1200 * 1024;
export const DELAI_MS = 45000;
export const LIMITES = { imagesMax: 1, imageMax: 1100 * 1024, texteMax: 120, montantMax: 1000000 };
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
    '`netSocial` = « montant net social ». `netAvantImpot` = « net à payer avant impôt sur le revenu ».',
    '`impotBase`, `impotTaux` (en %), `impotMontant` = impôt sur le revenu prélevé à la source.',
    '`netAPayer` = net payé au salarié (après impôt). `netImposable` = net imposable du mois.',
    '`cumulNetImposable` = cumul annuel du net imposable s\'il figure.'].join('\n');
}

const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const SN = { type: ['string', 'null'] }, NN = { type: ['number', 'null'] }, B = { type: 'boolean' };
export const SCHEMA_BULLETIN = obj({
  lisible: B, periode: SN, salarie: SN, employeur: SN, siret: SN, dateEntree: SN,
  brut: NN, netSocial: NN, netAvantImpot: NN, impotBase: NN, impotTaux: NN, impotMontant: NN, netAPayer: NN, netImposable: NN, cumulNetImposable: NN,
});
export const SCHEMA_CONTRAT = obj({ lisible: B, salarie: SN, employeur: SN, siret: SN, dateDebut: SN, typeContrat: SN });
export function schema(input) { return input.type === 'contrat' ? SCHEMA_CONTRAT : SCHEMA_BULLETIN; }
export const jsonSchema = SCHEMA_BULLETIN;
// Le registre attend `messages` : pour une tâche OCR, l'unique message est la consigne (non utilisée par /v1/ocr).
export function messages(input) { return [{ role: 'user', content: consigne(input) }]; }

const montant = (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMITES.montantMax ? Math.round(v * 100) / 100 : null);
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null);
const siret = (v) => { const s = typeof v === 'string' ? v.replace(/[\s.]/g, '') : ''; return /^\d{14}$/.test(s) ? s : null; };

export function validerSortie(raw, input) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  let rejets = 0;
  const garde = (brut, propre) => { if (brut != null && brut !== '' && propre == null) rejets++; return propre; };
  if (input && input.type === 'contrat') {
    const data = { lisible: raw.lisible !== false,
      salarie: texteBorne(raw.salarie, LIMITES.texteMax), employeur: texteBorne(raw.employeur, LIMITES.texteMax), siret: garde(raw.siret, siret(raw.siret)),
      dateDebut: garde(raw.dateDebut, date(raw.dateDebut)), typeContrat: texteBorne(raw.typeContrat, 40) };
    return { ok: true, rejets, data };
  }
  const periode = typeof raw.periode === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.periode) ? raw.periode : null;
  const taux = typeof raw.impotTaux === 'number' && raw.impotTaux >= 0 && raw.impotTaux <= 60 ? Math.round(raw.impotTaux * 100) / 100 : null;
  const data = {
    lisible: raw.lisible !== false, periode: garde(raw.periode, periode),
    salarie: texteBorne(raw.salarie, LIMITES.texteMax), employeur: texteBorne(raw.employeur, LIMITES.texteMax),
    siret: garde(raw.siret, siret(raw.siret)), dateEntree: garde(raw.dateEntree, date(raw.dateEntree)),
    impotTaux: garde(raw.impotTaux, taux),
  };
  for (const k of ['brut', 'netSocial', 'netAvantImpot', 'impotBase', 'impotMontant', 'netAPayer', 'netImposable', 'cumulNetImposable']) data[k] = garde(raw[k], montant(raw[k]));
  return { ok: true, rejets, data };
}
