// relay/src/ai/tasks/lecture-facture.js — tâche « lire une facture ou un devis » (CIRCUIT D'UN INCIDENT).
//
// Entrée : 1 ou 2 pages (images réduites dans le navigateur du propriétaire ; un PDF est d'abord rendu en image).
// Sortie : entreprise, SIRET, date, numéro, montants HT / TVA / TTC, lignes, résumé des travaux, et un constat PROBABLE
// parmi les 6 du CDC (ou null). Tout est « proposé par l'IA, à vérifier » : le propriétaire confirme chaque valeur ;
// le SIRET est ensuite vérifié dans l'annuaire officiel ; aucun montant n'entre dans Finances sans sa validation.
import { texteBorne } from '../texte.js';
import { CONSTATS } from '../../../../js/core/incident-circuit.js';

export const nom = 'lecture-facture';
export const images = true;
export const JSON_MAX = 1024 * 1024;
export const DELAI_MS = 40000;
export const LIMITES = { imagesMax: 2, imageMax: 450 * 1024, texteMax: 160, lignesMax: 20, travauxMax: 400, montantMax: 1000000 };
const DATA = /^data:image\/(jpeg|webp|png);base64,([A-Za-z0-9+/]+={0,2})$/;

export function validerEntree(input) {
  if (!input || typeof input !== 'object') return { ok: false, raison: 'entree' };
  const type = input.type === 'devis' ? 'devis' : 'facture';
  if (!Array.isArray(input.images) || !input.images.length) return { ok: false, raison: 'images' };
  if (input.images.length > LIMITES.imagesMax) return { ok: false, raison: 'images_trop_nombreuses' };
  for (const im of input.images) if (typeof im !== 'string' || im.length > LIMITES.imageMax || !DATA.test(im)) return { ok: false, raison: 'image_format' };
  return { ok: true, input: { type, images: input.images.slice() } };
}

export function messages(input) {
  const system = [
    `Tu lis ${input.type === 'devis' ? 'un DEVIS' : 'une FACTURE'} d'artisan (dépannage, réparation, entretien d'un logement en France).`,
    'Recopie les valeurs telles qu\'elles sont écrites ; un humain vérifiera chacune.',
    '',
    'Règles impératives :',
    '1. Montants en euros, nombres (point décimal). `montantTTC` = somme totale toutes taxes comprises à payer.',
    '   Une valeur absente ou illisible = null. N\'invente rien, ne calcule rien qui n\'est pas écrit.',
    '2. `siret` : 14 chiffres sans espace, ou null. `date` : AAAA-MM-JJ, ou null. `numero` : numéro du document.',
    '3. `travaux` : 1 à 2 phrases neutres sur ce qui a été fait (ou proposé pour un devis), sans « je » ni « vous ».',
    '4. `constatProbable` : une clé de la liste SI le document le dit clairement (ex. « remplacement joint usé » →',
    '   « usure » ; « suite à dégât des eaux » → « sinistre ») ; sinon null. Jamais de responsabilité.',
    'Réponds uniquement par le JSON demandé.',
  ].join('\n');
  const contenu = [{ type: 'text', text: JSON.stringify({ constats: CONSTATS }) }];
  input.images.forEach((im, i) => { contenu.push({ type: 'text', text: `Page ${i + 1}` }); contenu.push({ type: 'image_url', image_url: im }); });
  return [{ role: 'system', content: system }, { role: 'user', content: contenu }];
}

const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const SN = { type: ['string', 'null'] }, NN = { type: ['number', 'null'] };
export const jsonSchema = obj({
  entreprise: SN, siret: SN, date: SN, numero: SN, montantHT: NN, tva: NN, montantTTC: NN,
  lignes: { type: 'array', items: obj({ libelle: { type: 'string' }, montant: NN }) },
  travaux: SN, constatProbable: SN,
});

const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= LIMITES.montantMax ? Math.round(v * 100) / 100 : null);
export function validerSortie(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  let rejets = 0;
  const siret = typeof raw.siret === 'string' && /^\d{14}$/.test(raw.siret.replace(/\s/g, '')) ? raw.siret.replace(/\s/g, '') : null;
  if (raw.siret && !siret) rejets++;
  const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && !isNaN(Date.parse(raw.date)) ? raw.date : null;
  if (raw.date && !date) rejets++;
  const lignes = (Array.isArray(raw.lignes) ? raw.lignes : []).slice(0, LIMITES.lignesMax)
    .map((l) => ({ libelle: texteBorne(l && l.libelle, LIMITES.texteMax), montant: nombre(l && l.montant) })).filter((l) => l.libelle);
  const constatProbable = CONSTATS.some((c) => c.k === raw.constatProbable) ? raw.constatProbable : null;
  if (raw.constatProbable && !constatProbable) rejets++;
  const ttc = nombre(raw.montantTTC), ht = nombre(raw.montantHT), tva = nombre(raw.tva);
  // Cohérence élémentaire : un TTC inférieur au HT est une lecture fausse → écarté (le propriétaire saisit).
  const ttcOk = ttc != null && (ht == null || ttc + 0.01 >= ht) ? ttc : null;
  if (ttc != null && ttcOk == null) rejets++;
  return { ok: true, rejets, data: {
    entreprise: texteBorne(raw.entreprise, LIMITES.texteMax), siret, date, numero: texteBorne(raw.numero, 60),
    montantHT: ht, tva, montantTTC: ttcOk, lignes, travaux: texteBorne(raw.travaux, LIMITES.travauxMax), constatProbable,
  } };
}
