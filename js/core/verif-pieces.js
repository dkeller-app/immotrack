// js/core/verif-pieces.js — VERIF-DOCUMENTS (v15.740 provisoire).
// Assemble les vérifications d'une pièce de candidature : code 2D-Doc (deux-d-doc.js), indices techniques
// (indices-pdf.js), et — lot 3 — lecture IA des bulletins (regles-bulletin.js). Produit :
//   • `verif` : l'objet stocké sur l'entrée DB.documents de la pièce (purgé avec elle par la purge v15.731) ;
//   • les CONSTATS de la carte « Points à vérifier » (format {code, icone, titre, detail, source, url, date}) ;
//   • l'ÉTAT affiché sous la pièce (libellé + phrase). Vert seulement pour « Signature 2D-Doc vérifiée » (fait cryptographique ;
//     « de la DGFiP » seulement pour un avis d'impôt signé par un certificat FPE* des autorités FR04 / FR06).
// Aucun score, aucun total, aucun classement ; vocabulaire factuel (jamais « faux », « fraude », « suspect »).
// Module pur. Testé par __tests__/helpers/verif-pieces.test.js.

import { ETAT, TYPES_DOCUMENT, TYPES_AVIS_IMPOT, SOURCE_2DDOC, champsConserves, comparerAvecTexte, identiteConcorde, familleDuType, referencesSvair, URL_SVAIR } from './deux-d-doc.js';
import { indicesTechniques } from './indices-pdf.js';
import { TYPES_BULLETIN as TB, TYPES_CONTRAT as TC } from './regles-bulletin.js';

export const VERSION_VERIF = 1;
/** Types de pièces (liste fermée du décret, pieces-candidature.js) */
export const TYPES_AVIS = Object.freeze(['I.D.1', 'II.E.1']);
export const TYPES_BULLETIN = TB;
export const TYPES_CONTRAT = TC;
const REESSAI_MS = 60 * 60 * 1000;     // une vérification reportée est retentée au plus une fois par heure

export const SOURCE_AVIS_2DDOC = {
  libelle: 'economie.gouv.fr, authenticité des justificatifs de revenus (13/05/2026)',
  url: 'https://www.economie.gouv.fr/particuliers/gerer-mon-argent/investir-dans-limmobilier/proprietaires-comment-vous-assurer-de-lauthenticite-des-justificatifs-de-revenus'
};
export const SOURCE_DECRET = { libelle: 'décret n° 2015-1437, annexe I, D', url: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000031444493' };
export { URL_SVAIR };

const fdate = (d) => { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? '' : `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`; };
const fheure = (d) => { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? '' : `${fdate(x)} à ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
const nombre = (v) => { const d = String(v || '').replace(/[^\d-]/g, ''); return d ? Number(d).toLocaleString('fr-FR').replace(/ /g, ' ') : String(v || ''); };

// LISTE BLANCHE des types lus (minimisation, registre RGPD : « pièce d'identité jamais lue ») : domicile, activité, ressources
// du candidat et de la caution — SAUF les pièces qui portent une photo ou l'identité d'une personne (cartes professionnelles,
// carte d'étudiant, identité du représentant d'une société caution). Pièce sans type : seulement dans les catégories
// domicile / situation / ressources du candidat (jamais dans « garant », où une pièce d'identité peut être déposée sans type).
const TYPES_EXCLUS = new Set(['I.C.5', 'I.C.7', 'II.B.2', 'II.D.5', 'VISALE']);
export function typeLu(pieceType, categorie) {
  const t = String(pieceType || '');
  if (!t) return ['domicile', 'situation', 'ressources'].includes(String(categorie || ''));
  if (TYPES_EXCLUS.has(t)) return false;
  return /^I\.(B|C|D)\.\d$/.test(t) || /^II\.(B|C|D|E)\.\d$/.test(t);
}
/** La pièce entre-t-elle dans les vérifications ? (liste blanche de types, PDF / JPEG / PNG seulement) */
export function pieceConcernee(doc) {
  if (!doc || doc._deleted || doc.parentType !== 'candidat') return false;
  if (doc.category === 'identite' || !typeLu(doc.pieceType, doc.category)) return false;
  return /^(application\/pdf|image\/jpeg|image\/png)$/i.test(String(doc.mime || ''));
}
/** LECTURE-PHOTOS (v15.751) : version du lecteur de photos. Une pièce lue AVANT, sans code trouvé, est relue une fois. */
export const LECTEUR_PHOTO = 1;
/** Faut-il (re)lancer l'analyse locale ? */
export function aAnalyser(doc, maintenant = Date.now()) {
  if (!pieceConcernee(doc)) return false;
  const v = doc.verif;
  if (!v || v.v !== VERSION_VERIF) return true;
  if (!v.illisible && !v.deuxDDoc && (v.lecteurPhoto || 0) < LECTEUR_PHOTO) return true;
  return !!v.reessayer && maintenant - Date.parse(v.le || 0) > REESSAI_MS;
}
/** Identité attendue sur la pièce : celle du garant pour les pièces du garant, sinon celle du candidat. */
export function identiteAttendue(doc, candidat) {
  const c = candidat || {};
  if (doc && (doc.category === 'garant' || /^II\./.test(String(doc.pieceType || '')))) {
    const g = c.garant || {}; return { nom: g.nom || '', prenom: g.prenom || '', qui: 'garant' };
  }
  return { nom: c.nom || '', prenom: c.prenom || '', qui: 'candidat' };
}
/** Années de revenus attendues pour « le dernier ou l'avant-dernier avis » à la date de réception. */
export function anneesAvisAttendues(recuLe) {
  const d = recuLe ? new Date(recuLe) : new Date(); const y = d.getUTCFullYear();
  // L'avis de l'année N (revenus N-1) est émis entre juillet et septembre : prudence, on l'attend à partir d'août.
  const dernier = d.getUTCMonth() >= 7 ? y - 1 : y - 2;
  return [dernier, dernier - 1, dernier + 1];   // +1 : avis émis tôt (dossier reçu en juillet)
}

const PRIO = { valide: 0, invalide: 1, non_verifiable: 2, illisible: 3 };
/** Le code DGFiP d'un avis d'impôt : certificat FPE* des autorités FR04 / FR06 (liste de confiance, 14/10/2026). */
export const estDgfip = (dd) => !!dd && ['FR04', 'FR06'].includes(dd.ac) && /^FPE\d$/.test(dd.certificat) && TYPES_AVIS_IMPOT.includes(dd.type);
const libelleMin = (t) => t.charAt(0).toLowerCase() + t.slice(1);
function nomsSignes(type, champs) {
  const v = (id) => ((champs || []).find((c) => c.id === id) || {}).valeur || '';
  const f = familleDuType(type);
  if (f === 'avis' || f === 'asdir') return [v('46'), v('48')].filter(Boolean);
  if (f === 'domicile') return [[v('12'), v('13')].join(' ').trim(), [v('16'), v('17')].join(' ').trim()].filter(Boolean);
  if (f === 'bulletin' || f === 'contrat') return [[v('12'), v('13')].join(' ').trim()].filter(Boolean);
  return [];
}

/**
 * Construit l'objet `verif` d'une pièce.
 * @param {object} p
 * @param {object} p.doc        entrée DB.documents
 * @param {object} p.candidat   entrée DB.candidats
 * @param {object} p.analyse    { illisible?, estPdf, codes:[string], texte, metadonnees, enregistrements, superpositions }
 * @param {Array}  p.resultats  sorties de verifier2DDoc, une par code lu (même ordre)
 * @param {Date|number} [p.maintenant]
 */
export function construireVerif({ doc, candidat, analyse, resultats, maintenant }) {
  const now = maintenant ? new Date(maintenant) : new Date();
  const a = analyse || {};
  const verif = { v: VERSION_VERIF, le: now.toISOString(), illisible: !!a.illisible, deuxDDoc: null, indices: null, constats: [], reessayer: false, lecteurPhoto: LECTEUR_PHOTO };
  if (a.illisible) return verif;
  if (a.estPdf) verif.indices = { metadonnees: a.metadonnees || {}, enregistrements: a.enregistrements || 0, superpositions: a.superpositions || [] };

  // Un DataMatrix qui n'est pas un 2D-Doc (code d'archivage, de La Poste…) n'est pas un « code 2D-Doc présent » : écarté.
  const lus = (resultats || []).filter((x) => x && x.code !== 'entete');
  const tries = lus.slice().sort((x, y) => (PRIO[x.etat] ?? 9) - (PRIO[y.etat] ?? 9));
  const r = tries[0] || null;
  if (r) {
    const h = r.entete || {};
    const champs = r.etat === ETAT.VALIDE ? champsConserves(h.type, r.champs) : [];
    const dd = { etat: r.etat, code: r.code, motif: r.motif, reessayer: !!r.reessayer, type: h.type || '', typeLibelle: TYPES_DOCUMENT[h.type] || 'document',
      ac: h.ac || '', certificat: h.certificat || '', dateSignature: h.dateSignature ? new Date(h.dateSignature).toISOString().slice(0, 10) : '',
      certificatValidite: r.certificat ? { du: r.certificat.du, au: r.certificat.au } : null, revocation: r.revocation || null,
      champs, comparaisons: [], identite: null, annee: '',
      autresNonConformes: r.etat === ETAT.VALIDE ? tries.filter((x) => x.etat === ETAT.INVALIDE).length : 0 };
    if (r.etat === ETAT.VALIDE) {
      dd.comparaisons = comparerAvecTexte(h.type, r.champs, a.texte);
      dd.nomsSignes = nomsSignes(h.type, r.champs);
      appliquerIdentite(doc, dd, candidat);
      if (TYPES_AVIS_IMPOT.includes(h.type)) dd.annee = ((r.champs || []).find((c) => c.id === '45') || {}).valeur || '';
      dd.svair = referencesSvair(h.type, r.champs);
    }
    verif.deuxDDoc = dd;
    verif.reessayer = dd.reessayer;
  }
  verif.constats = constatsDePiece(doc, verif, now);
  return verif;
}

/** Compare les noms signés à l'identité déclarée ACTUELLE (recalculé à l'affichage : un nom corrigé est pris en compte). */
function appliquerIdentite(doc, dd, candidat) {
  dd.identite = null; delete dd.identiteAttendue; delete dd.qui;
  const att = identiteAttendue(doc, candidat);
  const noms = dd.nomsSignes || [];
  if (!noms.length || !att.nom) return;
  const ok = noms.map((n) => identiteConcorde(n, att.nom, att.prenom));
  dd.identite = ok.some((x) => x === true) ? 'concorde' : ok.every((x) => x === null) ? null : 'differe';
  dd.identiteAttendue = [att.prenom, att.nom].filter(Boolean).join(' '); dd.qui = att.qui;
}
/**
 * Vérification à jour pour l'AFFICHAGE : identité comparée au dossier actuel et constats recalculés (type de pièce,
 * nom déclaré) à partir des seuls faits stockés — les textes et adresses des constats viennent toujours du code.
 */
export function actualiser(doc, verif, candidat, maintenant) {
  if (!verif) return verif;
  const v = Object.assign({}, verif);
  if (v.deuxDDoc) { v.deuxDDoc = Object.assign({}, v.deuxDDoc); if (v.deuxDDoc.etat === ETAT.VALIDE) appliquerIdentite(doc, v.deuxDDoc, candidat); }
  v.constats = pieceConcernee(doc) ? constatsDePiece(doc, v, maintenant) : [];
  return v;
}
const typeDiffere = (doc, dd) => !!dd && dd.etat === ETAT.VALIDE && TYPES_AVIS.includes(String(doc && doc.pieceType || '')) && !TYPES_AVIS_IMPOT.includes(dd.type);

const nomPiece = (doc) => `« ${(doc && (doc.originalName || doc.name)) || 'pièce'} »`;
const libelleTypePiece = (doc, dd) => TYPES_AVIS.includes(String(doc && doc.pieceType || '')) ? 'Avis d\'imposition' : (dd && dd.typeLibelle ? dd.typeLibelle.charAt(0).toUpperCase() + dd.typeLibelle.slice(1) : 'Pièce');

/** Constats d'une pièce, au format des « Points à vérifier ». */
export function constatsDePiece(doc, verif, maintenant) {
  const out = []; if (!verif || verif.illisible) return out;
  const dd = verif.deuxDDoc; const quand = 'le ' + fdate(verif.le);
  const estAvis = TYPES_AVIS.includes(String(doc && doc.pieceType || ''));
  const lib = libelleTypePiece(doc, dd);
  const src2d = { source: SOURCE_2DDOC.libelle + ' · contrôle sur l\'appareil', url: SOURCE_2DDOC.url, date: quand };
  if (dd && dd.etat === ETAT.INVALIDE) {
    out.push(Object.assign({ code: 'V2', icone: 'doc', titre: `${lib} ${nomPiece(doc)} : le code 2D-Doc ne correspond pas à sa signature.`,
      detail: `${dd.motif} La version PDF téléchargée depuis l'espace en ligne de l'administration porte un code lisible et signé.` }, src2d));
  } else if (dd && dd.etat !== ETAT.VALIDE && !dd.reessayer) {
    out.push(Object.assign({ code: 'V3', icone: 'minus', titre: `${lib} ${nomPiece(doc)} : code 2D-Doc présent, signature non vérifiable.`, detail: dd.motif }, src2d));
  } else if (!dd && estAvis) {
    out.push({ code: 'V4', icone: 'minus', titre: `Avis d'imposition ${nomPiece(doc)} : aucun code 2D-Doc lisible.`,
      detail: 'Depuis avril 2022, un code 2D-Doc est présent sur les avis d\'impôt sur le revenu (economie.gouv.fr) ; une photo floue, coupée ou une copie peut le rendre illisible. La version PDF téléchargée depuis l\'espace impots.gouv du titulaire porte le code. Une vérification manuelle reste possible sur le service de vérification des avis d\'impôt.',
      source: SOURCE_AVIS_2DDOC.libelle, url: SOURCE_AVIS_2DDOC.url, date: quand, svair: true });
  }
  if (dd && dd.etat === ETAT.VALIDE) {
    if (typeDiffere(doc, dd)) {
      out.push(Object.assign({ code: 'V8', icone: 'doc', titre: `Avis d'imposition ${nomPiece(doc)} : le code signé porte sur un autre type de document.`,
        detail: `Le code 2D-Doc de cette pièce est celui d'un document de type « ${libelleMin(dd.typeLibelle)} », alors que la pièce est classée « avis d'imposition ».` }, src2d));
    }
    if (dd.autresNonConformes) {
      out.push(Object.assign({ code: 'V2', icone: 'doc', titre: `${lib} ${nomPiece(doc)} : un autre code 2D-Doc de la pièce ne correspond pas à sa signature.`,
        detail: `${dd.autresNonConformes > 1 ? dd.autresNonConformes + ' autres codes lus' : 'Un autre code lu'} sur la pièce ne passe pas le contrôle de signature, alors qu'un code est valide.` }, src2d));
    }
    for (const c of dd.comparaisons || []) if (c.statut === 'absent') {
      out.push(Object.assign({ code: 'V5', icone: 'doc', titre: `${lib} ${nomPiece(doc)} : une donnée signée n'est pas retrouvée dans le texte du fichier.`,
        detail: `${c.libelle} inscrit dans le code signé : ${c.id === '41' ? nombre(c.signe) : c.signe}. Cette valeur n'apparaît pas dans le texte du fichier (couche texte du PDF).` }, src2d));
    }
    if (dd.identite === 'differe') {
      out.push(Object.assign({ code: 'V6', icone: 'doc', titre: `${lib} ${nomPiece(doc)} : le nom inscrit dans le code diffère de l'identité déclarée${dd.qui === 'garant' ? ' du garant' : ''}.`,
        detail: `Nom${dd.nomsSignes.length > 1 ? 's' : ''} dans le code signé : ${dd.nomsSignes.join(' · ')}. Identité déclarée : ${dd.identiteAttendue}. Un avis commun, un nom d'usage ou un changement d'état civil peut l'expliquer.` }, src2d));
    }
    if (TYPES_AVIS_IMPOT.includes(dd.type) && dd.annee && doc && doc.uploadedAt) {
      const attendues = anneesAvisAttendues(doc.uploadedAt);
      if (!attendues.includes(Number(dd.annee))) {
        out.push({ code: 'V7', icone: 'clock', titre: `Avis d'imposition ${nomPiece(doc)} : revenus de ${dd.annee}.`,
          detail: `Le décret n° 2015-1437 prévoit le dernier ou l'avant-dernier avis d'imposition. Pour une pièce reçue le ${fdate(doc.uploadedAt)}, il s'agit en principe des revenus ${attendues[0]} ou ${attendues[1]}.`,
          source: SOURCE_DECRET.libelle, url: SOURCE_DECRET.url, date: quand });
      }
    }
  }
  if (verif.indices) {
    for (const t of indicesTechniques(verif.indices)) out.push(Object.assign(t, { titre: `${nomPiece(doc)} : ${t.titre.charAt(0).toLowerCase()}${t.titre.slice(1)}`, date: quand }));
  }
  return out;
}

/**
 * État affiché sous la pièce. `positif` (vert) seulement pour une signature 2D-Doc vérifiée sans aucun écart.
 * @returns {{etat, libelle, phrase, positif:boolean, icone, detail:boolean}}
 */
export function etatAffiche(doc, verif) {
  if (!pieceConcernee(doc)) return { etat: 'aucun_controle', libelle: '', phrase: 'Pas de contrôle automatique pour ce type de pièce.', positif: false, icone: 'info', detail: false };
  if (!verif) return { etat: 'en_attente', libelle: 'Vérification en attente', phrase: 'contrôle fait à l\'ouverture de la fiche, sur l\'appareil.', positif: false, icone: 'clock', detail: false };
  if (verif.illisible) return { etat: 'illisible', libelle: 'Lecture impossible', phrase: 'le fichier n\'a pas pu être lu. Aucun constat.', positif: false, icone: 'minus', detail: false };
  const dd = verif.deuxDDoc; const nb = (verif.constats || []).length;
  const estAvis = TYPES_AVIS.includes(String(doc.pieceType || ''));
  if (dd && dd.etat === ETAT.VALIDE) {
    const ecarts = (verif.constats || []).filter((c) => ['V2', 'V5', 'V6', 'V8'].includes(c.code));
    const emetteur = estDgfip(dd) ? 'de la DGFiP' : `(autorité ${dd.ac}, certificat ${dd.certificat})`;
    const objet = `${libelleMin(dd.typeLibelle)} ${emetteur}${dd.annee ? ', revenus ' + dd.annee : ''}`;
    if (ecarts.length) return { etat: 'ecart', libelle: 'Écart relevé', phrase: `signature 2D-Doc vérifiée (${objet}), mais ${ecarts.length > 1 ? 'plusieurs points sont à vérifier' : 'un point est à vérifier'} : voir le détail.`, positif: false, icone: 'calc', detail: true };
    const morceaux = [objet];
    if ((dd.comparaisons || []).length) morceaux.push('données retrouvées dans le texte du fichier');
    else if (TYPES_AVIS_IMPOT.includes(dd.type)) {
      const rfr = (dd.champs || []).find((c) => c.id === '41');
      morceaux.push('montants imprimés non comparés (image ou PDF sans texte)' + (rfr && rfr.valeur ? ` ; revenu fiscal de référence signé : ${nombre(rfr.valeur)} €, à comparer avec la pièce` : ''));
    }
    if (dd.identite === 'concorde') morceaux.push(`nom identique à l'identité déclarée${dd.qui === 'garant' ? ' du garant' : ''}`);
    return { etat: 'signature_valide', libelle: 'Signature 2D-Doc vérifiée', phrase: morceaux.join(' ; ') + '.', positif: true, icone: 'seal', detail: true };
  }
  if (dd && dd.etat === ETAT.INVALIDE) return { etat: 'code_non_conforme', libelle: 'Code 2D-Doc non conforme', phrase: 'la signature ne correspond pas aux données du code.', positif: false, icone: 'doc', detail: true };
  if (dd && dd.reessayer) return { etat: 'reportee', libelle: 'Vérification reportée', phrase: dd.motif.replace(/ : vérification reportée\.$/, '.').replace(/^./, (x) => x.toLowerCase()), positif: false, icone: 'clock', detail: true };
  if (dd) return { etat: 'non_verifiable', libelle: 'Non vérifiable automatiquement', phrase: dd.motif.replace(/^./, (x) => x.toLowerCase()), positif: false, icone: 'minus', detail: true };
  if (estAvis) return { etat: 'non_verifiable', libelle: 'Non vérifiable automatiquement', phrase: 'aucun code 2D-Doc lisible. Vérification manuelle possible sur impots.gouv.', positif: false, icone: 'minus', detail: true };
  if (nb) return { etat: 'indice', libelle: 'Indice technique', phrase: `${verif.constats[0].titre.replace(/^« [^»]* » : /, '')} Il ne permet pas de conclure.`, positif: false, icone: 'doc', detail: true };
  return { etat: 'aucun_controle', libelle: '', phrase: verif.indices ? 'Aucun code 2D-Doc, aucun indice technique relevé.' : 'Aucun code 2D-Doc sur cette image.', positif: false, icone: 'info', detail: !!verif.indices };
}

/** Lignes de détail d'une vérification (pour la couche « Détail ») — données brutes, l'appelant échappe. */
export function detail(doc, verif) {
  const dd = verif && verif.deuxDDoc;
  return {
    piece: (doc && (doc.originalName || doc.name)) || '',
    le: verif ? fheure(verif.le) : '',
    etat: etatAffiche(doc, verif),
    deuxDDoc: dd ? {
      etat: dd.etat, motif: dd.motif, type: dd.typeLibelle, ac: dd.ac, certificat: dd.certificat, dateSignature: dd.dateSignature ? fdate(dd.dateSignature) : '',
      validite: dd.certificatValidite ? `du ${fdate(dd.certificatValidite.du)} au ${fdate(dd.certificatValidite.au)}` : '',
      revocation: dd.revocation ? `liste de révocation du ${fdate(dd.revocation.du)}, valable jusqu'au ${fdate(dd.revocation.au)}` : '',
      lignes: (dd.champs || []).map((c) => {
        const cmp = (dd.comparaisons || []).find((x) => x.id === c.id);
        return { libelle: c.libelle, valeur: c.id === '41' ? nombre(c.valeur) + ' €' : c.valeur, comparaison: cmp ? (cmp.statut === 'identique' ? 'Retrouvé dans le texte du fichier' : 'Non retrouvé dans le texte du fichier') : '' };
      }),
      identite: dd.identite === 'concorde' ? `Nom identique à l'identité déclarée${dd.qui === 'garant' ? ' du garant' : ''} (${dd.identiteAttendue}).` : dd.identite === 'differe' ? `Nom différent de l'identité déclarée (${dd.identiteAttendue}).` : '',
      svair: dd.svair || null, dgfip: estDgfip(dd)
    } : null,
    constats: (verif && verif.constats) || [],
    indices: verif && verif.indices ? verif.indices : null
  };
}

// ── Lot 3 : lecture IA des bulletins (règles dans regles-bulletin.js) ──
/** Pièce lue par l'IA : bulletin ou page 1 du contrat de travail (candidat ou garant), sinon null. */
export function typeLectureIa(doc) {
  const t = String((doc && doc.pieceType) || '');
  if (TYPES_BULLETIN.includes(t)) return 'bulletin';
  if (TYPES_CONTRAT.includes(t)) return 'contrat';
  return null;
}
/**
 * État affiché d'une pièce lue (ou à lire) par l'IA. `e` = sortie analyserBulletins().parPiece[id] ; `base` = état local
 * (etatAffiche). La signature 2D-Doc (vérifiée ou non conforme) reste prioritaire. `iaDispo` : bouton de lecture proposé.
 */
export function etatIa(doc, e, base, iaDispo) {
  if (base && (base.etat === 'signature_valide' || base.etat === 'code_non_conforme') && !(e && e.etat === 'ecart')) return base;
  const tag = ' (lu par l\'IA, à vérifier)';
  if (!e || e.etat === 'ia_non_lancee') {
    if (!iaDispo) return base;
    return { etat: 'ia_non_lancee', libelle: 'Lecture par l\'IA non lancée', phrase: base && base.etat === 'indice' ? base.phrase : 'aucune donnée envoyée tant que la lecture n\'est pas lancée.', positif: false, icone: 'sparkle', detail: !!(base && base.detail) };
  }
  if (e.etat === 'illisible') return { etat: 'illisible', libelle: 'Lecture impossible', phrase: 'la page n\'a pas pu être lue (photo floue ou coupée). Aucun constat.', positif: false, icone: 'minus', detail: true };
  if (e.etat === 'ia_erreur') return { etat: 'reportee', libelle: 'Lecture par l\'IA reportée', phrase: e.erreur === 'rendu' ? 'la page n\'a pas pu être préparée sur l\'appareil ; relancer plus tard.' : 'le service de lecture n\'a pas répondu ; relancer plus tard.', positif: false, icone: 'clock', detail: false };
  if (e.etat === 'ecart') {
    const c = e.constats[0]; const t = c ? c.titre.replace(/^Bulletin [^:]*: /, '') : '';
    return { etat: 'ecart', libelle: 'Écart relevé', phrase: (t ? t.replace(/\.$/, '') : 'une règle n\'est pas satisfaite') + (e.constats.length > 1 ? ', et d\'autres points' : '') + tag + '.', positif: false, icone: 'calc', detail: true };
  }
  if (e.etat === 'sans_ecart') return { etat: 'sans_ecart', libelle: 'Aucun écart relevé', phrase: `${e.regles.length} règle${e.regles.length > 1 ? 's' : ''} appliquée${e.regles.length > 1 ? 's' : ''} (calculs, cumuls, nom, employeur)${tag}.`, positif: false, icone: 'check', detail: true };
  return { etat: 'lu', libelle: 'Lu par l\'IA', phrase: typeLectureIa(doc) === 'contrat' ? 'employeur et date d\'entrée comparés aux bulletins (à vérifier).' : 'valeurs lues, à vérifier.', positif: false, icone: 'sparkle', detail: true };
}
