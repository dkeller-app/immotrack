/**
 * core/doc-quittance.js — Générateur PUR de quittance de loyer / reçu partiel.
 *
 * `buildQuittanceDoc(input) -> {html, filename, status}` — AUCUNE dépendance à
 * `DB` ni au DOM global (pas de `window`, pas de `document`). Réutilisable par
 * l'app (namespace bail/quittances) ET par une page publique de génération
 * gratuite de quittance (aimant SEO).
 *
 * Contrat d'entrée `input` :
 * {
 *   bailleur:  { nom, type?, siege?, siren?, rcs?, gerant? },
 *   locataires: [{ nom, civilite?, ddn?, lieuNaiss? }],
 *   bien:      { adresse },
 *   periode:   { mois, annee },      // mois en toutes lettres FR ('avril'), année en nombre
 *   dateEmission, datePaiement,      // ISO YYYY-MM-DD
 *   montantDu:number, montantRecu:number,
 *   prorata?:  { jours, joursMois }  // optionnel, mention prorata intra-mois
 * }
 *
 * Fondation extraite de `_buildQuittanceHtml` (index.html) — voir Task 1/6 du
 * fil rouge « générateur de quittance public ». La convergence de l'app vers
 * ce module se fera dans une tâche ultérieure (DRY).
 */

import { escHtml, numToWords, fd, MOIS_FR } from './utils.js';

function fmtEUR(n) {
  if (n === null || n === undefined || isNaN(n)) return '–';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/** Slugifie une chaîne pour usage sûr dans un nom de fichier : minuscules,
 *  accents retirés, tout caractère hors [a-z0-9] réduit à un tiret unique,
 *  tirets de tête/queue supprimés. */
// Plage Unicode des diacritiques combinants (U+0300-U+036F), construite via
// codes pour éviter d'embarquer des caractères combinants bruts en source.
const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
function slugify(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Dérive le libellé de période "du 01/MM/AAAA au <dernier jour>/MM/AAAA" depuis {mois, annee}. */
function derivePeriodeLabel(periode) {
  const moisIdx = MOIS_FR.indexOf(String(periode && periode.mois || '').toLowerCase());
  const annee = parseInt(periode && periode.annee, 10) || new Date().getFullYear();
  if (moisIdx < 0) return (periode && periode.mois) || '–';
  const debut = new Date(annee, moisIdx, 1);
  const fin = new Date(annee, moisIdx + 1, 0);
  return 'du ' + debut.toLocaleDateString('fr-FR') + ' au ' + fin.toLocaleDateString('fr-FR');
}

const CSS = `
@page{size:A4;margin:1.8cm 2cm}
*{box-sizing:border-box}
body{font-family:'Times New Roman',serif;font-size:11.5pt;color:#111;line-height:1.45;max-width:700px;margin:0 auto}
h1{font-size:16pt;text-align:center;font-weight:bold;margin:0 0 14px;text-decoration:underline}
h2{font-size:11.5pt;font-weight:bold;margin:12px 0 4px;text-decoration:underline}
p{margin:6px 0}
.total-row{display:flex;align-items:baseline;margin:4px 0;border-top:2px solid #111;padding-top:3px}
.total-row .lab{min-width:220px;font-weight:bold}
.total-row .dots{flex:1;border-bottom:1px dotted #555;margin:0 6px;height:1em}
.total-row .val{font-weight:bold;font-size:12pt}
.mention{font-size:9.5pt;color:#444;margin-top:12px;font-style:italic;border-top:1px solid #ccc;padding-top:8px}
.sign-area{margin-top:20px;display:flex;justify-content:flex-end}
.sign-box{text-align:center;width:220px;border-top:1px solid #333;padding-top:6px;font-size:11pt}
`;

/**
 * Construit le document de quittance (ou reçu partiel) au format HTML complet.
 * @param {object} input — voir contrat d'entrée en tête de fichier.
 * @returns {{html:string, filename:string, status:'complet'|'partiel'|'non-paye'}}
 */
export function buildQuittanceDoc(input) {
  input = input || {};
  const bailleur = input.bailleur || {};
  const locataires = Array.isArray(input.locataires) && input.locataires.length ? input.locataires : [{ nom: '–' }];
  const bien = input.bien || {};
  const periode = input.periode || {};
  const montantDu = Number(input.montantDu) || 0;
  const montantRecu = Number(input.montantRecu) || 0;
  const prorata = input.prorata || null;

  const estComplet = montantRecu >= montantDu - 0.01;
  const estPartiel = !estComplet && montantRecu > 0;
  const status = estComplet ? 'complet' : (estPartiel ? 'partiel' : 'non-paye');
  // Une quittance atteste un paiement REÇU (art. 21 loi 89-462). Sans paiement,
  // le document ne peut pas s'intituler "QUITTANCE DE LOYER" (risque légal :
  // remise d'une fausse quittance) — titre neutre à la place.
  const titre = estPartiel
    ? 'REÇU DE PAIEMENT PARTIEL'
    : (status === 'non-paye' ? "AVIS D'ÉCHÉANCE — LOYER NON ACQUITTÉ" : 'QUITTANCE DE LOYER');

  const periodeLabel = derivePeriodeLabel(periode);
  const adresseBien = bien.adresse || '–';

  const bailleurLine = [
    escHtml(bailleur.nom || '–'),
    bailleur.type ? escHtml(bailleur.type) : '',
    bailleur.siege ? 'dont le siège social est situé ' + escHtml(bailleur.siege) : '',
    bailleur.siren ? 'immatriculée sous le numéro ' + escHtml(bailleur.siren) + (bailleur.rcs ? ' RCS ' + escHtml(bailleur.rcs) : '') : '',
    bailleur.gerant ? 'représentée par ' + escHtml(bailleur.gerant) + ' en sa qualité de Gérant' : ''
  ].filter(Boolean).join(', ');

  const locatairesHtml = locataires.map(l => {
    const civ = l.civilite ? escHtml(l.civilite) + ' ' : '';
    let line = civ + escHtml(l.nom || '–');
    if (l.ddn) line += ', né' + (l.civilite === 'Mme' ? 'e' : '') + ' le ' + escHtml(fd(l.ddn));
    if (l.lieuNaiss) line += ' à ' + escHtml(l.lieuNaiss);
    line += ', demeurant ' + escHtml(adresseBien);
    return '<p style="margin:0 0 4px">' + line + '&nbsp;;</p>';
  }).join('');

  const montantDuLettres = numToWords(montantDu);
  const montantRecuLettres = numToWords(montantRecu);
  const datePayFmt = escHtml(input.datePaiement ? fd(input.datePaiement) : '–');
  const dateEmissionFmt = escHtml(input.dateEmission ? fd(input.dateEmission) : fd(new Date().toISOString().slice(0, 10)));

  const enteteHtml = `
<h2>1. Le Bailleur</h2>
<p>${bailleurLine}&nbsp;;</p>
<h2>2. Le(s) Locataire(s)</h2>
${locatairesHtml}`;

  let corpsHtml;
  if (status === 'non-paye') {
    corpsHtml = `
<h1>${titre}</h1>
${enteteHtml}
<p style="margin-top:20px;color:#dc3545;font-weight:bold">Aucun paiement enregistré pour la période ${escHtml(periodeLabel)}.<br>
Ce document ne peut être remis au locataire à titre de quittance.</p>
<div class="mention">Conformément à l'article 21 de la loi n°89-462 du 6 juillet 1989 tendant à améliorer les rapports locatifs, le bailleur transmet gratuitement une quittance au locataire qui en fait la demande, dès lors que le paiement est intégralement reçu.</div>`;
  } else if (status === 'partiel') {
    const solde = montantDu - montantRecu;
    corpsHtml = `
<h1>${titre}</h1>
${enteteHtml}
<p style="margin-top:10px">Je, soussigné(e) le Bailleur du logement sis <b>${escHtml(adresseBien)}</b>, déclare avoir reçu le <b>${datePayFmt}</b> du locataire, la somme partielle de <b>${fmtEUR(montantRecu)}</b> – <em>${escHtml(montantRecuLettres)}</em>, au titre de la période <b>${escHtml(periodeLabel)}</b>.</p>
<div class="total-row"><span class="lab">Somme reçue</span><span class="dots"></span><span class="val">${fmtEUR(montantRecu)}</span></div>
<p>Solde restant dû&nbsp;: <b>${fmtEUR(solde)}</b>.</p>
<div class="mention" style="border:1.5px solid #b8860b;background:#fffbf0;padding:12px;border-radius:4px">
  <b>Ce reçu ne vaut pas quittance.</b> Il ne libère pas le locataire de son obligation de payer le solde restant dû, conformément à l'article 21 de la loi n°89-462 du 6 juillet 1989.
</div>
<p style="margin-top:12px">Le ${dateEmissionFmt}</p>
<div class="sign-area"><div class="sign-box">_______________<br>Le(s) Bailleur(s)</div></div>`;
  } else {
    const prorataMention = (prorata && prorata.jours && prorata.joursMois)
      ? `<p style="margin:8px 0;font-size:10.5pt;color:#555;font-style:italic">Loyer calculé au prorata de ${escHtml(String(prorata.jours))} jours d'occupation sur ${escHtml(String(prorata.joursMois))} jours du mois (entrée ou sortie intra-mois — loi du 6 juillet 1989).</p>`
      : '';
    corpsHtml = `
<h1>${titre}</h1>
${enteteHtml}
<p style="margin-top:10px">Je, soussigné(e) le Bailleur du logement sis <b>${escHtml(adresseBien)}</b>, déclare avoir reçu le <b>${datePayFmt}</b> du locataire, la somme de <b>${fmtEUR(montantDu)}</b> – <em>${escHtml(montantDuLettres)}</em>, au titre de la période <b>${escHtml(periodeLabel)}</b>.</p>
${prorataMention}
<div class="total-row"><span class="lab">Total des sommes payées</span><span class="dots"></span><span class="val">${fmtEUR(montantRecu)}</span></div>
<p>J'en donne quittance sous réserve du bon encaissement de cette somme.</p>
<p style="margin-top:12px">Le ${dateEmissionFmt}</p>
<div class="sign-area"><div class="sign-box">_______________<br>Le(s) Bailleur(s)</div></div>
<div class="mention">La présente quittance est établie conformément à l'article 21 de la loi n°89-462 du 6 juillet 1989 tendant à améliorer les rapports locatifs. Elle annule tous les reçus qui auraient pu être établis précédemment en cas de paiement partiel du montant du présent terme. Elle est à conserver par le locataire.</div>`;
  }

  const moisSlug = slugify(periode.mois || 'periode') || 'periode';
  const anneeSlug = slugify(String(periode.annee || ''));
  const filename = `quittance-${moisSlug}${anneeSlug ? '-' + anneeSlug : ''}.pdf`;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${escHtml(titre)}</title><style>${CSS}</style></head><body>${corpsHtml}</body></html>`;

  return { html, filename, status };
}
