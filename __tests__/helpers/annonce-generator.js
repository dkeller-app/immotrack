/**
 * Module annonce-generator — annonce de location CONFORME (chantier ANNONCES, CDC validé 29/09/2026)
 *
 * Remplace le générateur LOG-ANNONCE (v15.207) : 4 tons « storytelling », format SMS et banques de
 * phrases lisant log.presentation / log.quartier (plus jamais saisis) sont RETIRÉS (décision D2).
 * Le moteur ne lit QUE des données saisies : une ligne dont la donnée est vide est omise, jamais
 * inventée (l'ancien moteur écrivait « douche italienne » et « cuisine équipée » par défaut).
 *
 * Module PUR : l'appelant résout ce qui dépend de l'app et le passe en argument —
 *   dpe          ← _diagGet(log,'dpe')                         { classe, ges, depensesEnergie, anneePrix }
 *   composition  ← BiensPieces.designationPieces(pieces)       « Séjour, Cuisine, 1 chambre, … »
 *   periode      ← _periodeLegale(periodeConstr, annee)        'Avant 1949' | 'De 1949 à 1997' | 'Après 1997' | ''
 *   pieces       ← PIECES_REQUISES (js/core/candidature.js)    ['identite','domicile','situation','ressources']
 *   mandataire   ← un mandataire est configuré (Référentiel)   booléen
 *
 * Mentions : libellés VERBATIM des textes (mockups/ANNONCES/AUDIT.md partie 2) —
 *   arrêté du 21 avril 2022 (art. 2-1 loi 89-462), arrêté du 10 janvier 2017 art. 4 (mandataire),
 *   CCH L126-33 / R126-21 à R126-24, arrêté du 22 décembre 2021, C. env. R125-25.
 * Donnée manquante → marqueur « [… à compléter] » dans le texte (D3 : rien n'est bloqué).
 */

// ═══════════════════════════════════════════════════════════════
// Libellés imposés par les textes (ne pas reformuler)
// ═══════════════════════════════════════════════════════════════
export const TXT_GEORISQUES = 'Les informations sur les risques auxquels ce bien est exposé sont disponibles sur le site Géorisques : www.georisques.gouv.fr';
export const TXT_DEPENSES = 'Montant estimé des dépenses annuelles d\'énergie pour un usage standard : ';
export const TXT_EXCESSIF = 'Logement à consommation énergétique excessive : ';
export const TXT_HCL = 'honoraires charge locataire';

/** Usages hors loi 89-462 (garage, box, parking, local pro, autre). */
export const USAGES_HORS_HABITATION = Object.freeze(['garage', 'local-pro', 'autre']);
/** Usages meublés : bail meublé, bail mobilité (meublé par définition), bail étudiant. */
export const USAGES_MEUBLES = Object.freeze(['habitation-meuble', 'mobilite', 'etudiant']);

/** Libellés des catégories de pièces autorisées (décret n° 2015-1437), clés = PIECES_REQUISES. */
export const PIECES_LIBELLES = Object.freeze({
  identite: 'une pièce d\'identité',
  domicile: 'un justificatif de domicile',
  situation: 'un justificatif de situation professionnelle',
  ressources: 'un ou plusieurs justificatifs de ressources'
});

const GARANTIES_LIBELLES = Object.freeze({
  caution_solidaire: 'caution solidaire',
  visale: 'Visale',
  gli: 'garantie loyers impayés (GLI)',
  garant_perso: 'garant personnel'
});

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ═══════════════════════════════════════════════════════════════
// Helpers de lecture et de formatage
// ═══════════════════════════════════════════════════════════════
const _s = (x) => String(x == null ? '' : x).trim();
const _rempli = (x) => _s(x) !== '';

/** Nombre saisi ou null (champ vide ≠ 0 : un 0 saisi est une valeur). */
export function nombre(x) {
  if (!_rempli(x)) return null;
  const n = Number(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** 1580 → « 1 580 », 812.7 → « 812,70 ». Espace simple (copier-coller sans surprise). */
export function montant(n) {
  const v = Number(n) || 0;
  const entier = Math.round(v * 100) % 100 === 0;
  const [ent, dec] = (entier ? Math.round(v).toString() : v.toFixed(2)).split('.');
  const groupes = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? groupes + ',' + dec : groupes;
}

export function estHorsHabitation(log) {
  return USAGES_HORS_HABITATION.indexOf(_s(log && log.typeUsage)) >= 0;
}

export function estMeuble(log) {
  return USAGES_MEUBLES.indexOf(_s(log && log.typeUsage)) >= 0;
}

/** « 2e étage », « rez-de-chaussée », « niveau -1 » ; '' si inexploitable. */
export function etageLabel(etage) {
  const e = _s(etage);
  if (!e) return '';
  if (/^(rdc|rez)/i.test(e)) return 'rez-de-chaussée';
  if (/^-\s*\d+/.test(e)) return 'niveau ' + e.replace(/\s+/g, '');
  const n = parseInt(e, 10);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'rez-de-chaussée';
  return (n === 1 ? '1er' : n + 'e') + ' étage';
}

/** Commune + arrondissement (Paris, Lyon, Marseille — art. L. 2511-3 CGCT) depuis le code postal. */
export function communeLabel(imm, log) {
  const ville = _s(imm && imm.ville);
  if (!ville) return '';
  const cp = _s(imm && imm.codePostal);
  const v = ville.toLowerCase();
  let n = null;
  if (/^paris/.test(v) && /^750\d\d$/.test(cp)) n = +cp.slice(3);
  else if (/^lyon/.test(v) && /^6900\d$/.test(cp)) n = +cp.slice(4);
  else if (/^marseille/.test(v) && /^130\d\d$/.test(cp)) n = +cp.slice(3);
  if (n && n >= 1 && n <= 20) return ville.replace(/\s+\d.*$/, '') + ' ' + (n === 1 ? '1er' : n + 'e') + ' arrondissement';
  return ville;
}

/** '2026-11-01' → « 1er novembre 2026 ». */
export function dateFr(iso) {
  const m = _s(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const j = +m[3], mo = +m[2];
  if (mo < 1 || mo > 12 || j < 1 || j > 31) return '';
  return (j === 1 ? '1er' : String(j)) + ' ' + MOIS[mo - 1] + ' ' + m[1];
}

function _liste(arr) {
  const a = arr.filter(Boolean);
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1];
}

function _periodeTexte(periode) {
  switch (_s(periode)) {
    case 'Avant 1949': return 'avant 1949';
    case 'De 1949 à 1997': return 'entre 1949 et 1997';
    case 'Après 1997': return 'après 1997';
    default: return '';
  }
}

function _estMaison(log, imm) {
  return _s(imm && imm.typeHabitat) === 'Maison individuelle' || /^maison/i.test(_s(log && log.type));
}

/** « Appartement T2 », « Maison T4 », « Studio » — le type saisi prime s'il nomme déjà la nature. */
export function natureBien(log, imm) {
  const type = _s(log && log.type);
  if (estHorsHabitation(log)) return type || 'Local';
  if (/^(studio|maison|appartement|duplex|triplex|loft|chambre)/i.test(type)) return type.charAt(0).toUpperCase() + type.slice(1);
  const nature = _estMaison(log, imm) ? 'Maison' : 'Appartement';
  return type ? nature + ' ' + type : nature;
}

// ═══════════════════════════════════════════════════════════════
// Titre
// ═══════════════════════════════════════════════════════════════
export function genererTitre(log, imm) {
  log = log || {}; imm = imm || {};
  const surf = nombre(log.surf);
  const ext = log.exterieurs || {};
  const premierExt = ext.balcon && ext.balcon.present ? 'balcon'
    : ext.terrasse && ext.terrasse.present ? 'terrasse'
    : ext.loggia && ext.loggia.present ? 'loggia'
    : ext.jardin_privatif && ext.jardin_privatif.present ? 'jardin' : '';
  const parts = [natureBien(log, imm)];
  if (surf) parts.push(montant(surf) + ' m²');
  if (!estHorsHabitation(log)) {
    if (estMeuble(log)) parts.push('meublé');
    if (premierExt) parts.push('avec ' + premierExt);
  }
  const commune = communeLabel(imm, log);
  return parts.join(' ') + (commune ? ' — ' + commune : '');
}

// ═══════════════════════════════════════════════════════════════
// Description (uniquement des données saisies)
// ═══════════════════════════════════════════════════════════════
const CUISINE_LIBELLES = [['four', 'four'], ['plaques', 'plaques de cuisson'], ['hotte', 'hotte'],
  ['lave_vaisselle', 'lave-vaisselle'], ['micro_ondes', 'micro-ondes'], ['frigo', 'réfrigérateur']];
const SANITAIRES_LIBELLES = [['bain', 'baignoire'], ['douche', 'douche'], ['wc_separe', 'WC séparé'],
  ['lave_linge', 'lave-linge'], ['seche_linge', 'sèche-linge']];
const ANNEXES_LIBELLES = [['cave', 'cave'], ['grenier', 'grenier'], ['parking', 'parking'], ['garage', 'garage'],
  ['buanderie', 'buanderie'], ['cellier', 'cellier'], ['localVelos', 'local vélos'], ['atelier', 'atelier']];

function _extLibelle(nom, o) {
  const s = nombre(o && o.surface);
  return s && s > 0 ? nom + ' de ' + montant(s) + ' m²' : nom;
}

export function genererDescription(log, imm, ctx) {
  log = log || {}; imm = imm || {}; ctx = ctx || {};
  const lignes = [];
  const surf = nombre(log.surf);
  const etage = etageLabel(log.etage);

  if (estHorsHabitation(log)) {
    let l = natureBien(log, imm) + (surf ? ' de ' + montant(surf) + ' m²' : '');
    if (etage) l += ' au ' + etage;
    if (_rempli(log.numApt)) l += ', n° ' + _s(log.numApt);
    lignes.push(l + '.');
  } else {
    const maison = _estMaison(log, imm);
    const ec = imm.equipementsCommuns || {};
    const periode = _periodeTexte(ctx.periode);
    let l = natureBien(log, imm) + (surf ? ' de ' + montant(surf) + ' m²' : '');
    if (maison) {
      if (periode) l += ', construite ' + periode;
    } else {
      if (etage) l += ' au ' + etage;
      if (ec.ascenseur) l += ' avec ascenseur';
      const copro = _s(imm.regimeJuridique) === 'Copropriété';
      if (copro) l += ', dans une copropriété' + (periode ? ' construite ' + periode : '');
      else if (periode) l += ', dans un immeuble construit ' + periode;
    }
    lignes.push(l + '.');

    if (_rempli(ctx.composition)) lignes.push('Composition : ' + _s(ctx.composition) + '.');

    const eq = log.equipements || {};
    const cu = eq.cuisine || {};
    const cuListe = CUISINE_LIBELLES.filter(([k]) => cu[k]).map(([, v]) => v)
      .concat((Array.isArray(cu.customs) ? cu.customs : []).map(_s).filter(Boolean));
    if (cu.equipee || cuListe.length) lignes.push('Cuisine' + (cu.equipee ? ' équipée' : '') + (cuListe.length ? ' : ' + cuListe.join(', ') : '') + '.');
    const sa = eq.sanitaires || {};
    const saListe = SANITAIRES_LIBELLES.filter(([k]) => sa[k]).map(([, v]) => v);
    if (saListe.length) lignes.push('Sanitaires : ' + saListe.join(', ') + '.');

    const ext = log.exterieurs || {};
    const extListe = [
      ext.balcon && ext.balcon.present && _extLibelle('balcon', ext.balcon),
      ext.terrasse && ext.terrasse.present && _extLibelle('terrasse', ext.terrasse),
      ext.loggia && ext.loggia.present && 'loggia',
      ext.jardin_privatif && ext.jardin_privatif.present && _extLibelle('jardin privatif', ext.jardin_privatif)
    ].filter(Boolean);
    if (extListe.length) lignes.push((extListe.length > 1 ? 'Extérieurs : ' : 'Extérieur : ') + extListe.join(', ') + '.');

    const an = log.annexes || {};
    const anListe = ANNEXES_LIBELLES.filter(([k]) => an[k] && an[k].present).map(([k, v]) => {
      if (k === 'parking' && an.parking.type === 'box') return 'box';
      return v;
    }).concat((Array.isArray(an.customs) ? an.customs : []).map(_s).filter(Boolean));
    if (anListe.length) lignes.push((anListe.length > 1 ? 'Annexes : ' : 'Annexe : ') + anListe.join(', ') + '.');

    if (eq.technologies && eq.technologies.fibre) lignes.push('Fibre optique.');
  }

  const fin = [];
  const li = log.locationInfo || {};
  const dispo = dateFr(li.disponibilite);
  if (dispo) fin.push(_s(li.disponibilite) <= _s(ctx.aujourdhui) ? 'Disponible immédiatement.' : 'Disponible le ' + dispo + '.');
  if (!estHorsHabitation(log)) {
    const gar = (Array.isArray(li.garanties_acceptees) ? li.garanties_acceptees : [])
      .map(k => GARANTIES_LIBELLES[k]).filter(Boolean);
    if (gar.length) fin.push('Garanties acceptées : ' + gar.join(' ou ') + '.');
  }
  return lignes.join('\n') + (fin.length ? '\n\n' + fin.join('\n') : '');
}

// ═══════════════════════════════════════════════════════════════
// Mentions obligatoires + contrôle
// ═══════════════════════════════════════════════════════════════
const MANQUE = (quoi) => '[' + quoi + ' à compléter]';

function _depensesTexte(dep) {
  let d = _s(dep).replace(/\.$/, '');
  if (d && !/\ban\b/i.test(d)) d += ' par an';
  return d;
}

function _anneesTexte(annees) {
  const a = _s(annees).replace(/\.$/, '');
  if (!a) return '';
  return /[,;]|\bet\b/.test(a)
    ? 'Prix moyens des énergies indexés sur les années ' + a + '.'
    : 'Année de référence des prix de l\'énergie : ' + a + '.';
}

/**
 * Construit les mentions ET la liste de contrôle, dans l'ordre du CDC §3.3 / §4.
 * @returns {{ lignes: {key:string, texte:string, manquant:boolean, fort?:boolean}[],
 *             controle: {key:string, label:string, etat:'ok'|'ko'|'na'|'warn', detail:string, cible:string}[] }}
 */
export function genererMentions(log, imm, ctx) {
  log = log || {}; imm = imm || {}; ctx = ctx || {};
  const hors = estHorsHabitation(log);
  const meuble = estMeuble(log);
  const dpe = ctx.dpe || {};
  const lignes = [];
  const controle = [];
  const C = (key, label, etat, detail, cible) => controle.push({ key, label, etat, detail: detail || '', cible: cible || '' });

  const hc = nombre(log.loyerHcRef);
  const ch = nombre(log.chargesRef);
  const dg = nombre(log.dgRef);
  const modalite = _s(log.chargesModalite);

  // ── Loyer (1°) ──
  if (hc == null) {
    lignes.push({ key: 'loyer', texte: 'Loyer : ' + MANQUE('loyer'), manquant: true, fort: true });
    C('loyer', hors ? 'Loyer' : 'Loyer charges comprises', 'ko', 'loyer non renseigné', 'loyer');
  } else if (hors) {
    lignes.push({ key: 'loyer', texte: 'Loyer : ' + montant(hc) + ' € par mois' + (ch ? ' + charges ' + montant(ch) + ' € par mois' : ''), manquant: false, fort: true });
    C('loyer', 'Loyer', 'ok', montant(hc) + ' € par mois', 'loyer');
  } else {
    const total = hc + (ch || 0);
    lignes.push({ key: 'loyer', texte: 'Loyer : ' + montant(total) + ' € par mois' + (ch ? ' charges comprises' : ''), manquant: false, fort: true });
    C('loyer', 'Loyer charges comprises', 'ok', montant(total) + ' € par mois', 'loyer');
  }

  // ── Charges + modalité (2°) — habitation ──
  if (!hors) {
    if (ch === 0) {
      lignes.push({ key: 'charges', texte: 'Charges : aucune', manquant: false });
      C('charges', 'Charges et modalité', 'ok', 'aucune charge', 'identite');
    } else if (ch == null) {
      lignes.push({ key: 'charges', texte: 'Charges : ' + MANQUE('montant des charges'), manquant: true });
      C('charges', 'Charges et modalité', 'ko', 'montant non renseigné', 'loyer');
    } else {
      const mod = modalite === 'forfait' ? 'forfait' : modalite === 'provision' ? 'provision avec régularisation annuelle' : '';
      lignes.push({ key: 'charges', texte: 'Charges : ' + montant(ch) + ' € par mois — ' + (mod || MANQUE('modalité des charges')), manquant: !mod });
      C('charges', 'Charges et modalité', mod ? 'ok' : 'ko', mod ? montant(ch) + ' € · ' + (modalite === 'forfait' ? 'forfait' : 'provision') : 'modalité non renseignée', 'identite');
    }
  }

  // ── Meublé (5°) ──
  if (!hors) {
    if (meuble) { lignes.push({ key: 'meuble', texte: 'Location meublée', manquant: false }); C('meuble', 'Location meublée', 'ok', 'oui', ''); }
    else C('meuble', 'Meublé', 'na', 'location vide', '');
  }

  // ── Dépôt de garantie (4°) ──
  if (dg == null) {
    if (!hors) {
      lignes.push({ key: 'dg', texte: 'Dépôt de garantie : ' + MANQUE('montant'), manquant: true });
      C('dg', 'Dépôt de garantie', 'ko', 'non renseigné', 'identite');
    }
  } else if (dg === 0) {
    if (!hors) { lignes.push({ key: 'dg', texte: 'Dépôt de garantie : aucun', manquant: false }); C('dg', 'Dépôt de garantie', 'ok', 'aucun', 'identite'); }
  } else {
    lignes.push({ key: 'dg', texte: 'Dépôt de garantie : ' + montant(dg) + ' €', manquant: false });
    let etat = 'ok', detail = montant(dg) + ' €';
    if (!hors && hc) {
      const usage = _s(log.typeUsage);
      if (usage === 'mobilite') { etat = 'warn'; detail += ' — aucun dépôt en bail mobilité (art. 25-17)'; }
      else if (meuble && dg > 2 * hc) { etat = 'warn'; detail += ' — au-delà de 2 mois de loyer (art. 25-6)'; }
      else if (!meuble && dg > hc) { etat = 'warn'; detail += ' — au-delà d\'1 mois de loyer (art. 22)'; }
    }
    C('dg', 'Dépôt de garantie', etat, detail, 'identite');
  }

  // ── Honoraires (arr. 2022 6° ; arr. 2017 4-I-6°) ──
  const hEdl = nombre(log.honorairesEdlRef);
  if (!hors && hEdl && hEdl > 0) {
    lignes.push({ key: 'honorairesEdl', texte: 'Honoraires d\'état des lieux à la charge du locataire : ' + montant(hEdl) + ' € TTC', manquant: false });
    C('honorairesEdl', 'Honoraires d\'état des lieux', 'ok', montant(hEdl) + ' € TTC', 'identite');
  } else if (!hors) {
    C('honorairesEdl', 'Honoraires d\'état des lieux', 'na', 'aucun renseigné', 'identite');
  }
  if (ctx.mandataire) {
    const hcl = nombre(log.honorairesHclRef);
    if (hcl == null) {
      if (!hors) {
        lignes.push({ key: 'hcl', texte: MANQUE('montant TTC') + ' ' + TXT_HCL, manquant: true });
        C('hcl', 'Honoraires charge locataire', 'ko', 'mandataire configuré — montant non renseigné', 'identite');
      }
    } else {
      lignes.push({ key: 'hcl', texte: montant(hcl) + ' € TTC ' + TXT_HCL, manquant: false });
      C('hcl', 'Honoraires charge locataire', 'ok', montant(hcl) + ' € TTC', 'identite');
    }
  }

  // ── Surface (8°) ──
  const surf = nombre(log.surf);
  const libSurf = hors ? 'Surface' : 'Surface habitable';
  if (surf && surf > 0) {
    lignes.push({ key: 'surface', texte: libSurf + ' : ' + montant(surf) + ' m²', manquant: false });
    C('surface', libSurf, 'ok', montant(surf) + ' m²', 'identite');
  } else {
    lignes.push({ key: 'surface', texte: libSurf + ' : ' + MANQUE('surface'), manquant: true });
    C('surface', libSurf, 'ko', 'non renseignée', 'identite');
  }

  // ── Commune (7°) ──
  const commune = communeLabel(imm, log);
  if (commune) {
    lignes.push({ key: 'commune', texte: 'Commune : ' + commune, manquant: false });
    C('commune', /arrondissement/.test(commune) ? 'Commune + arrondissement' : 'Commune', 'ok', commune, 'immeuble');
  } else {
    lignes.push({ key: 'commune', texte: 'Commune : ' + MANQUE('commune'), manquant: true });
    C('commune', 'Commune', 'ko', 'non renseignée', 'immeuble');
  }

  // ── DPE : classes (L126-33, R126-21/22) ──
  const classe = _s(dpe.classe).toUpperCase();
  const ges = _s(dpe.ges).toUpperCase();
  const garage = _s(log.typeUsage) === 'garage';
  if (classe && ges) {
    lignes.push({ key: 'dpe', texte: 'Classe énergie : ' + classe + ' · Classe climat : ' + ges, manquant: false });
    C('dpe', 'Classes énergie et climat', 'ok', classe + ' · ' + ges, 'dpe');
  } else if (garage) {
    C('dpe', 'DPE', 'na', 'non concerné — non chauffé (R126-15 f)', 'dpe');
  } else {
    const quoi = !classe && !ges ? 'classes énergie et climat' : !classe ? 'classe énergie' : 'classe climat';
    lignes.push({ key: 'dpe', texte: 'Classe énergie : ' + (classe || MANQUE(quoi)) + (classe ? ' · Classe climat : ' + (ges || MANQUE('classe climat')) : ''), manquant: true });
    C('dpe', 'Classes énergie et climat', 'ko', 'DPE non renseigné', 'dpe');
  }

  // ── Habitation seulement : F/G (R126-24) + dépenses (R126-23) ──
  if (!hors) {
    if (classe === 'F' || classe === 'G') {
      lignes.push({ key: 'excessif', texte: TXT_EXCESSIF + 'classe ' + classe + '.', manquant: false });
      C('excessif', 'Mention classe ' + classe, 'ok', 'ajoutée', '');
    }
    const dep = _depensesTexte(dpe.depensesEnergie);
    const ann = _anneesTexte(dpe.anneePrix);
    if (dep && ann) {
      lignes.push({ key: 'depenses', texte: TXT_DEPENSES + dep + '. ' + ann, manquant: false });
      C('depenses', 'Dépenses d\'énergie + années des prix', 'ok', dep.replace(/^entre\s+/i, '') + ' · ' + _s(dpe.anneePrix), 'dpe');
    } else {
      const quoi = !dep && !ann ? 'montant et années de référence des prix' : !dep ? 'montant' : 'années de référence des prix';
      lignes.push({ key: 'depenses', texte: TXT_DEPENSES + (dep ? dep + '. ' : '') + MANQUE(quoi), manquant: true });
      C('depenses', 'Dépenses d\'énergie + années des prix', 'ko', 'à compléter : ' + quoi, 'dpe');
    }
  }

  // ── Géorisques (R125-25) — toujours (D10) ──
  lignes.push({ key: 'georisques', texte: TXT_GEORISQUES, manquant: false });
  C('georisques', 'Géorisques', 'ok', 'phrase ajoutée', '');

  return { lignes, controle };
}

// ═══════════════════════════════════════════════════════════════
// Pièces du dossier (décret n° 2015-1437 — liste limitative)
// ═══════════════════════════════════════════════════════════════
export function genererDossier(pieces) {
  const libs = (Array.isArray(pieces) ? pieces : []).map(k => PIECES_LIBELLES[k]).filter(Boolean);
  if (!libs.length) return '';
  return 'Pièces demandées (liste autorisée, décret n° 2015-1437) : ' + libs.join(', ') + '.\n'
    + 'Le dossier peut être constitué sur DossierFacile, service public gratuit.';
}

// ═══════════════════════════════════════════════════════════════
// Orchestrateur
// ═══════════════════════════════════════════════════════════════
/**
 * @param {object} args { log, imm, dpe, composition, periode, pieces, mandataire, includeDossier, aujourdhui }
 * @returns {{ mode:'habitation'|'hors-habitation', titre:string, description:string,
 *   blocTitre:string, mentions:object[], controle:object[], dossier:string, manquantes:number, texte:string }}
 */
export function genererAnnonce(args) {
  const a = args || {};
  const log = a.log || {}; const imm = a.imm || {};
  const hors = estHorsHabitation(log);
  const ctx = { dpe: a.dpe || {}, composition: a.composition || '', periode: a.periode || '', mandataire: !!a.mandataire, aujourdhui: a.aujourdhui || '' };
  const titre = genererTitre(log, imm);
  const description = genererDescription(log, imm, ctx);
  const { lignes, controle } = genererMentions(log, imm, ctx);
  const dossier = (!hors && a.includeDossier !== false) ? genererDossier(a.pieces) : '';
  const manquantes = controle.filter(c => c.etat === 'ko').length;
  const texte = [description, lignes.map(l => l.texte).join('\n'), dossier].filter(s => _rempli(s)).join('\n\n');
  return {
    mode: hors ? 'hors-habitation' : 'habitation',
    titre, description,
    blocTitre: hors ? 'Informations' : 'Mentions obligatoires',
    mentions: lignes, controle, dossier, manquantes, texte
  };
}
