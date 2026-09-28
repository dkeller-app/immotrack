// js/core/bail-modifications.js — Modifications d'un bail SIGNÉ (hors avenant). Module PUR, testé.
//
// POURQUOI (incident 28/09, bail Ferrette 101) : la ligne du bail signé est verrouillée au cloud
// (store-sync.js : un bail `locked` n'est plus jamais poussé) → « Modifier le bail » perdait tout au
// rechargement. Décision Didier : ENREGISTRER les modifications À CÔTÉ du bail (journal
// `DB.baux_evenements`, table cloud `baux_evenements`, migration 0054), les RÉAPPLIQUER sur le bail
// au chargement, et les montrer dans la timeline. Le document SIGNÉ (signatures.bailSnapshot, PDF
// archivé) ne change jamais.
//
// Une entrée de journal :
//   { id, ref, bailDebut, signedAt, date (ISO), auteur, type:'modification',
//     changements: [{ champ:'locataires.0.tel', libelle:'Téléphone de M. HARNIST', avant, apres }],
//     _espaceId? (copié du bail : routage vers l'espace du propriétaire en partage SCI) }

/** Bail signé par TOUTES les parties (même règle que le scellement cloud `sealSignedBaux`). */
export function bailSigneComplet(bail) {
  const s = bail && bail.signatures;
  return !!(s && s.signedAt && s.mode !== 'bailleur-seul');
}

// Champs SUIVIS (liste fermée : un champ interne ou gelé n'entre jamais dans le journal).
// Libellés = ceux du formulaire « Modifier le bail ». `fin: true` = porté AUSSI par le barème daté
// (loyer / charges / dépôt) : réappliqué, mais pas affiché dans la carte (le barème a déjà la sienne).
export const CHAMPS_BAIL = {
  type: { l: 'Type de bail' },
  typeContrat: { l: 'Type de contrat' },
  modalitePaiement: { l: 'Modalité de paiement' },
  destinationLocaux: { l: 'Destination des locaux' },
  zoneTendue: { l: 'Zone tendue' },
  encadrementLoyers: { l: 'Encadrement des loyers' },
  premiereLoc: { l: 'Situation lors de cette mise en location' },
  dernierLoyerPrec: { l: 'Dernier loyer HC du précédent locataire' },
  loyerRefMajore: { l: 'Loyer de référence majoré' },
  complementLoyer: { l: 'Complément de loyer' },
  complementJustif: { l: 'Justification du complément de loyer' },
  // JAMAIS BLOQUER (retour Didier 28/09) : un changement de PARTIE (garant, bailleur, co-signataires,
  // locataires) est ENREGISTRÉ comme le reste — le bail signé ne change pas, l'app rappelle qu'un
  // avenant est juridiquement nécessaire, l'utilisateur décide.
  garant: { l: 'Garant' },
  garant2: { l: '2ᵉ garant' },
  entity: { l: 'Bailleur' },
  signataires: { l: 'Signataires du bailleur' },
  adrGarant: { l: 'Adresse du garant' },
  ddnGarant: { l: 'Date de naissance du garant' },
  lieuGarant: { l: 'Lieu de naissance du garant' },
  adrGarant2: { l: 'Adresse du 2ᵉ garant' },
  ddnGarant2: { l: 'Date de naissance du 2ᵉ garant' },
  lieuGarant2: { l: 'Lieu de naissance du 2ᵉ garant' },
  visale: { l: 'Garantie Visale (n° de visa)' },
  withMandataire: { l: 'Mandataire' },
  plafondCaution: { l: 'Plafond de l\'engagement de caution' },
  hc: { l: 'Loyer HC', fin: true },
  ch: { l: 'Charges mensuelles', fin: true },
  dg: { l: 'Dépôt de garantie', fin: true },
  debut: { l: 'Date de début du bail' },
  fin: { l: 'Date de fin du bail' },
  irl: { l: 'Trimestre IRL de référence' },
  jpay: { l: 'Jour de paiement' },
  adrBien: { l: 'Adresse du bien' },
  ftype: { l: 'Type de location' },
  etage: { l: 'Étage' },
  surf: { l: 'Surface' },
  villeSignature: { l: 'Ville de signature' },
  depensesEnergie: { l: 'Dépenses énergétiques estimées' },
  precedentLoc: { l: 'Précédent locataire parti depuis' },
  precedentLoyerDetail: { l: 'Dernier loyer du précédent locataire' },
  travaux_inter_loc: { l: 'Travaux depuis le précédent locataire' },
  diag: { l: 'Date du diagnostic' },
  diagSoc: { l: 'Société de diagnostic' },
  notes: { l: 'Notes / conditions particulières' },
  quittanceDemandee: { l: 'Quittance demandée' },
  finEffective: { l: 'Date de fin effective' },
  finMotif: { l: 'Motif de fin' },
  locNouvelleAdr: { l: 'Nouvelle adresse du locataire' },
  dgRestitue: { l: 'Dépôt de garantie restitué' },
  dgRetenu: { l: 'Retenues sur le dépôt de garantie' },
  finNotes: { l: 'Notes de fin de bail' },
  natureEmplacement: { l: 'Nature de l\'emplacement' },
  locDomicile: { l: 'Adresse du locataire (domicile)' },
  emplNum: { l: 'N° d\'emplacement' },
  emplSurface: { l: 'Surface de l\'emplacement' },
  emplNiveau: { l: 'Niveau / localisation' },
  emplDesc: { l: 'Descriptif de l\'emplacement' },
  dureeGarageText: { l: 'Durée' },
  preavisGarage: { l: 'Préavis de résiliation' },
  garageIndexActive: { l: 'Indexation du loyer' },
  garageIndex: { l: 'Indice d\'indexation' },
  garageIndexBase: { l: 'Indice de base' },
  erpZoneRisque: { l: 'Zone à risque (ERP)' },
};
// Sous-champs d'un locataire suivis (le NOM compris : jamais bloqué, un avenant reste conseillé).
export const CHAMPS_LOCATAIRE = {
  nom: 'Nom', civilite: 'Civilité', ddn: 'Date de naissance', lieuNaiss: 'Lieu de naissance',
  tel: 'Téléphone', email: 'E-mail', adressePrecedente: 'Adresse précédente',
};

// Égalité « métier » : vide / null / absent sont identiques ; nombres comparés en nombre ;
// objets (visale) comparés par contenu. Évite les faux écarts (pf() rend 0 pour un champ vide…).
function _vide(v) { return v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => _vide(v[k]))); }
// Champs MONTANTS / NOMBRES : « 850 » et 850 identiques. Les autres restent du texte : un téléphone,
// un code postal ou un n° d'emplacement qui ne diffère que d'un zéro en tête EST une modification.
const CHAMPS_NUMERIQUES = new Set(['hc', 'ch', 'dg', 'dernierLoyerPrec', 'loyerRefMajore', 'complementLoyer', 'plafondCaution',
  'surf', 'depensesEnergie', 'dgRestitue', 'dgRetenu', 'jpay', 'emplSurface']);
function _norm(v, numerique) {
  if (_vide(v)) return '';
  if (typeof v === 'boolean') return v ? '1' : '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') { const t = v.trim(); return (numerique && /^-?\d+(?:[.,]\d+)?$/.test(t)) ? String(Number(t.replace(',', '.'))) : t; }
  return JSON.stringify(v);
}
export function memeValeur(a, b, champ) {
  const numerique = champ == null || CHAMPS_NUMERIQUES.has(String(champ).split('.').pop());
  // false et vide : même chose (case décochée = rien de saisi)
  const na = a === false ? '' : _norm(a, numerique), nb = b === false ? '' : _norm(b, numerique);
  // 0 face à vide : pf('') rend 0 → pas une modification
  if (numerique && ((na === '0' && nb === '') || (na === '' && nb === '0'))) return true;
  return na === nb;
}

// Liste de locataires réduite aux sous-champs suivis (aucune clé inconnue, aucun prototype).
function _locsPropres(arr) {
  return (Array.isArray(arr) ? arr : []).filter(l => l && typeof l === 'object').slice(0, 20).map(l => {
    const o = {};
    for (const k of Object.keys(CHAMPS_LOCATAIRE)) if (l[k] != null) o[k] = typeof l[k] === 'object' ? '' : l[k];
    if (l.adressePrecedenteSameAsFirst != null) o.adressePrecedenteSameAsFirst = !!l.adressePrecedenteSameAsFirst;
    return o;
  });
}

function _designation(loc) {
  const civ = loc && (loc.civilite === 'M.' || loc.civilite === 'Mme') ? loc.civilite + ' ' : '';
  return civ + String((loc && loc.nom) || '').trim();
}

/**
 * Changements entre le bail en vigueur (`prev`) et le bail enregistré (`next`), champs suivis seulement.
 * Locataires comparés PAR POSITION ; ajout / retrait → la liste entière (champ 'locataires').
 * @returns {Array<{champ, libelle, avant, apres, fin?:true}>}
 */
export function diffModificationsBail(prev, next) {
  const p = prev || {}, n = next || {}, out = [];
  for (const [k, def] of Object.entries(CHAMPS_BAIL)) {
    if (!(k in n)) continue;   // champ absent du formulaire (ex. champs garage d'un bail d'habitation)
    if (memeValeur(p[k], n[k], k)) continue;
    const c = { champ: k, libelle: def.l, avant: p[k] === undefined ? null : p[k], apres: n[k] === undefined ? null : n[k] };
    if (def.fin) c.fin = true;
    out.push(c);
  }
  const lp = Array.isArray(p.locataires) ? p.locataires : [], ln = Array.isArray(n.locataires) ? n.locataires : [];
  // Ajout / retrait d'un locataire : la LISTE entière est enregistrée (nettoyée à la réapplication).
  if (lp.length !== ln.length) {
    out.push({ champ: 'locataires', libelle: 'Locataires', avant: _locsPropres(lp), apres: _locsPropres(ln) });
    return out;
  }
  for (let i = 0; i < Math.min(lp.length, ln.length); i++) {
    for (const [k, lib] of Object.entries(CHAMPS_LOCATAIRE)) {
      if (memeValeur(lp[i] && lp[i][k], ln[i] && ln[i][k], k)) continue;
      out.push({ champ: 'locataires.' + i + '.' + k, libelle: lib + ' de ' + _designation(ln[i]),
        avant: lp[i] && lp[i][k] !== undefined ? lp[i][k] : null, apres: ln[i] && ln[i][k] !== undefined ? ln[i][k] : null });
    }
  }
  return out;
}

// Seuls les chemins SUIVIS sont réappliqués. Le journal vient de données partagées (cloud, SCI) :
// un chemin arbitraire pourrait réécrire le document signé (signatures.bailSnapshot…) ou polluer
// Object.prototype (__proto__). Liste fermée, vérifiée à la réapplication ; parties forcées en texte.
export function cheminAutorise(chemin) {
  const c = String(chemin || '');
  if (Object.prototype.hasOwnProperty.call(CHAMPS_BAIL, c)) return true;
  if (c === 'locataires') return true;   // liste entière (ajout / retrait), nettoyée par _poser
  const m = c.match(/^locataires\.(\d{1,2})\.([A-Za-z]+)$/);
  return !!(m && Object.prototype.hasOwnProperty.call(CHAMPS_LOCATAIRE, m[2]));
}

function _poser(obj, chemin, valeur) {
  if (!cheminAutorise(chemin)) return false;
  if (chemin === 'locataires') { obj.locataires = _locsPropres(valeur); return true; }
  // Parties : toujours du TEXTE (jamais un objet injecté par le journal partagé).
  if (chemin === 'entity' || chemin === 'garant' || chemin === 'garant2' || /^locataires\.\d+\.nom$/.test(chemin)) valeur = typeof valeur === 'string' ? valeur : '';
  if (chemin === 'signataires') { obj.signataires = (Array.isArray(valeur) ? valeur : []).filter(x => typeof x === 'string').slice(0, 20); return true; }
  const parts = String(chemin).split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (o[k] == null || typeof o[k] !== 'object') return false;   // locataire disparu : on n'invente rien
    o = o[k];
  }
  o[parts[parts.length - 1]] = valeur;
  return true;
}

/**
 * Entrées de journal qui concernent CE bail : même logement (clé nue), même signature (un bail
 * suivant sur le même logement a un autre `signedAt`), même espace. Triées par date croissante.
 */
export function journalDuBail(journal, cle, bail) {
  const ref = String(cle || '').split('@@')[0];
  const sAt = bail && bail.signatures && bail.signatures.signedAt;
  const esp = (bail && bail._espaceId) || null;
  return (Array.isArray(journal) ? journal : [])
    // Espace STRICT : l'entrée porte le tag de son bail (copié à la création, reposé à l'hydratation) ;
    // en mono-espace ni l'un ni l'autre n'est tagué. Jamais d'application croisée entre deux espaces.
    .filter(e => e && !e._deleted && e.type === 'modification' && e.ref === ref && sAt && e.signedAt === sAt
      && (e._espaceId || null) === esp)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

/**
 * Réapplique le journal sur les baux signés (au chargement). Idempotent : pose les valeurs `apres`
 * dans l'ordre des dates ; ne touche ni aux signatures ni au document signé.
 * @returns {number} nombre de baux modifiés
 */
export function reappliquerJournalBaux(baux, journal) {
  let n = 0;
  for (const [cle, bail] of Object.entries(baux || {})) {
    if (!bail || bail._deleted || !bailSigneComplet(bail)) continue;
    const entrees = journalDuBail(journal, cle, bail);
    if (!entrees.length) continue;
    for (const e of entrees) for (const c of (e.changements || [])) {
      if (!c || !c.champ || !_poser(bail, c.champ, c.apres)) continue;
      // Copies de premier niveau du 1ᵉʳ locataire tenues par saveBail (repli des lecteurs anciens).
      if (c.champ === 'locataires.0.ddn') bail.ddn = c.apres;
      if (c.champ === 'locataires.0.lieuNaiss') bail.lieuNaiss = c.apres;
      if (c.champ === 'locataires.0.nom') bail.nom = c.apres;
      if (c.champ === 'locataires') { const l0 = (bail.locataires || [])[0] || {}; bail.nom = l0.nom || ''; bail.ddn = l0.ddn || ''; bail.lieuNaiss = l0.lieuNaiss || ''; }
    }
    n++;
  }
  return n;
}

const _ENUMS = {
  type: { nu: 'Location vide', meuble: 'Meublé', etudiant: 'Étudiant', mobilite: 'Bail mobilité', garage: 'Garage / box / stockage', autre: 'Autre' },
  modalitePaiement: { echeoir: 'À échoir', echu: 'À terme échu' },
  typeContrat: { initial: 'Contrat initial' },
};
/** Valeur lisible pour la carte de la timeline (texte brut, à échapper par l'appelant). */
export function valeurLisible(champ, v) {
  if (_vide(v) || v === false) return '(vide)';
  if (v === true) return 'Oui';
  const cle = String(champ).split('.').pop();
  if (_ENUMS[cle] && _ENUMS[cle][v]) return _ENUMS[cle][v];
  if (cle === 'visale' && typeof v === 'object') return String(v.visaId || '(vide)');
  if (cle === 'locataires' && Array.isArray(v)) return v.map(l => _designation(l)).filter(Boolean).join(', ') || '(aucun)';
  if (Array.isArray(v)) return v.map(String).join(', ') || '(aucun)';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-'); return d + '/' + m + '/' + y; }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
