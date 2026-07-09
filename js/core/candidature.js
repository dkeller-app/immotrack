// js/core/candidature.js
// Pure helpers candidature locataire (LOG-CANDIDATS). Aucun DOM, aucun effet de bord.
// Testés par __tests__/helpers/candidature.test.js. Exposés sur window via js/main.js.

/**
 * Message pré-rempli pour la demande de complément partagée (réutilisé par la popup
 * de partage). Rassure le candidat : son dépôt précédent est conservé.
 * @param {string} note - ce qui manque (peut être vide)
 * @param {string} bienLabel - libellé du bien (peut être vide)
 * @returns {string} message multi-lignes
 */
export function buildComplementShareMessage(note, bienLabel) {
  const bien = String(bienLabel || '').trim();
  const cible = bien ? ('votre dossier de location pour ' + bien) : 'votre dossier de location';
  const manque = String(note || '').trim();
  return 'Bonjour,\n\n'
    + 'Merci de compléter ' + cible + '.\n\n'
    + (manque ? ('Élément(s) à compléter : ' + manque + '\n\n') : '')
    + 'Votre dépôt précédent est conservé : reprenez simplement le dépôt via votre lien sécurisé ci-dessous.\n\n'
    + 'Conformément au RGPD, vos données ne sont utilisées que pour l\'étude de votre candidature, ne sont communiquées qu\'au propriétaire, et sont supprimées sous 30 jours si votre dossier n\'est pas retenu (droits d\'accès, de rectification et de suppression sur simple demande).\n\n'
    + 'Bien cordialement.';
}

/**
 * Pièces requises pour un dossier de location (décret n°2015-1437). Ce sont les
 * catégories des documents GED, alignées sur le formulaire de dépôt relais. Le garant
 * n'est PAS requis (le candidat peut n'en avoir aucun).
 */
export const PIECES_REQUISES = ['identite', 'domicile', 'situation', 'ressources'];

/**
 * Score de complétude des pièces (0-20) déduit des documents RÉELLEMENT fournis :
 * 5 points par catégorie requise présente (4 × 5 = 20). Pur — l'appelant rassemble les
 * catégories depuis DB.documents. Le garant, non requis, n'entre pas dans ce score.
 * @param {string[]} categoriesPresentes - catégories des documents du candidat (ex. ['identite','ressources'])
 * @returns {number} 0..20
 */
export function piecesScoreFromCategories(categoriesPresentes) {
  const set = new Set((Array.isArray(categoriesPresentes) ? categoriesPresentes : []).map(s => String(s || '')));
  const n = PIECES_REQUISES.filter(k => set.has(k)).length;
  return n * 5;
}

/**
 * Score "Confiance" 0-100, transparent, critères de solvabilité légaux uniquement
 * (jamais discriminatoire). Voir spec §9.
 * Barème : ratio revenus/loyer ≥3×→35 / ≥2.5×→20 / ≥2×→10 · contrat CDI→25 / CDD→10
 *          · garant présent→20 · pièces fournies→0-20. Plafonné à 100.
 * Complétude des pièces : si `piecesPts` (0-20) est fourni (déduit des documents réels
 * via piecesScoreFromCategories), il fait foi ; sinon repli sur le flag déclaratif
 * `piecesCompletes` (candidat saisi à la main / module non chargé) → 20.
 * Le RIB n'entre PAS dans le score : ce n'est ni un indicateur de solvabilité ni une
 * pièce de sélection autorisée (décret 2015-1437 ; art. 22-2 loi du 6 juillet 1989 —
 * l'autorisation de prélèvement ne peut être exigée). Il est collecté à la signature du bail.
 * @param {object} cand - candidat (revenus, contrat, garant, piecesCompletes)
 * @param {number} loyerHC - loyer hors charges du logement visé (pour le ratio)
 * @param {number} [piecesPts] - complétude des pièces 0-20 (documents réels) ; optionnel
 * @returns {number} score entier 0-100
 */
/**
 * Le candidat dispose-t-il d'une garantie ? Garant physique (nom renseigné) OU garantie Visale
 * (caution d'État Action Logement, n° de visa renseigné). Les deux valent le même crédit au score
 * (une seule fois). Pur — réutilisé par _calculConfiance, _confBreakdown et la fiche.
 * @param {object} cand
 * @returns {boolean}
 */
export function candHasGarantie(cand) {
  if (!cand || typeof cand !== 'object') return false;
  const garant = !!(cand.garant && String(cand.garant.nom || '').trim());
  const visale = !!(cand.visale && String(cand.visale.visaId || '').trim());
  return garant || visale;
}

export function _calculConfiance(cand, loyerHC = 0, piecesPts) {
  if (!cand || typeof cand !== 'object') return 0;
  let score = 0;
  const revenus = Number(cand.revenus) || 0;
  const loyer = Number(loyerHC) || 0;
  if (loyer > 0 && revenus > 0) {
    const ratio = revenus / loyer;
    if (ratio >= 3) score += 35;
    else if (ratio >= 2.5) score += 20;
    else if (ratio >= 2) score += 10;
  }
  if (cand.contrat === 'CDI') score += 25;
  else if (cand.contrat === 'CDD') score += 10;
  if (candHasGarantie(cand)) score += 20;
  if (Number.isFinite(piecesPts)) score += Math.max(0, Math.min(20, piecesPts));
  else if (cand.piecesCompletes) score += 20;
  return Math.min(100, score);
}

/** Mappe un candidat vers un objet locataire du bail (forme getBailLocs/renderBailLocs). */
export function _candidatVersLocataire(cand) {
  const empty = { civilite: '', nom: '', ddn: '', lieuNaiss: '', tel: '', email: '', adressePrecedente: '' };
  if (!cand || typeof cand !== 'object') return empty;
  const nomComplet = [cand.nom, cand.prenom].map(s => String(s || '').trim()).filter(Boolean).join(' ');
  return {
    civilite: cand.civilite || '',
    nom: nomComplet,
    ddn: cand.ddn || '',
    lieuNaiss: cand.lieuNaiss || '',
    tel: cand.tel || '',
    email: cand.email || '',
    adressePrecedente: cand.adressePrecedente || ''
  };
}

/** Mappe le garant d'un candidat vers la forme garant du bail, ou null si absent. */
export function _candidatVersGarant(cand) {
  const g = cand && cand.garant;
  if (!g || !String(g.nom || '').trim()) return null;
  return { nom: g.nom || '', adresse: g.adresse || '', ddn: g.ddn || '', lieu: g.lieu || '' };
}

/** Construit un candidat avec valeurs par défaut. partial écrase les défauts. */
export function _nouveauCandidat(partial = {}) {
  const now = new Date().toISOString();
  const id = partial.id || ('cand_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  return {
    id, ref: partial.ref || id,
    logRef: partial.logRef || '',
    entity: partial.entity || '',
    source: partial.source || 'manuel',
    civilite: partial.civilite || '', nom: partial.nom || '', prenom: partial.prenom || '',
    ddn: partial.ddn || '', lieuNaiss: partial.lieuNaiss || '',
    tel: partial.tel || '', email: partial.email || '',
    adressePrecedente: partial.adressePrecedente || '',
    dateDebutSouhaitee: partial.dateDebutSouhaitee || '',
    revenus: Number(partial.revenus) || 0,
    employeur: partial.employeur || '',
    contrat: partial.contrat || '',
    garant: partial.garant || null,
    visale: partial.visale || null,
    piecesCompletes: partial.piecesCompletes || false,
    statut: partial.statut || 'recu',
    confianceScore: Number(partial.confianceScore) || 0,
    piecesVerifiees: partial.piecesVerifiees || false,
    notes: partial.notes || '',
    bailRef: partial.bailRef || '',
    dateCreation: partial.dateCreation || now,
    _modifiedAt: now,
    _archived: partial._archived || false
  };
}

/**
 * Retourne une nouvelle liste de documents où ceux rattachés au candidat candId
 * sont re-pointés vers le bail (parentType 'bail', parentRef = bailRef, logRef).
 * Les autres documents sont renvoyés inchangés. Pur — l'appelant réaffecte DB.documents.
 */
export function _migrerDocsCandidatVersBail(documents, candId, bailRef, logRef) {
  if (!Array.isArray(documents)) return [];
  const now = new Date().toISOString();
  return documents.map(d => {
    if (d && d.parentType === 'candidat' && String(d.parentId) === String(candId)) {
      return { ...d, parentType: 'bail', parentRef: String(bailRef),
               logRef: logRef != null ? String(logRef) : d.logRef, _modifiedAt: now };
    }
    return d;
  });
}

/**
 * Filtre la liste : retire les candidats 'refuse' dont _modifiedAt dépasse
 * joursRetention (défaut 30, D11). Renvoie les candidats CONSERVÉS. Pur — l'appelant
 * tombstonne en prod les supprimés pour la sync Drive.
 */
export function _purgeCandidatsRefuses(candidats, nowMs, joursRetention = 30) {
  if (!Array.isArray(candidats)) return [];
  const seuil = joursRetention * 24 * 60 * 60 * 1000;
  return candidats.filter(c => {
    if (!c || c.statut !== 'refuse') return true;
    const ts = c._modifiedAt ? Date.parse(c._modifiedAt) : 0;
    return (nowMs - ts) < seuil;
  });
}

/**
 * Décide si un pull automatique des candidatures doit partir maintenant.
 * @param {number|null} lastPullTs - timestamp (ms) du dernier pull, 0/null si jamais
 * @param {number} now - Date.now()
 * @param {number} intervalMs - délai mini entre 2 pulls (défaut 180000 = 3 min)
 * @param {boolean} hasActiveLinks - existe-t-il ≥1 lien à rapatrier
 * @returns {boolean}
 */
export function shouldAutoPull(lastPullTs, now, intervalMs = 180000, hasActiveLinks = false) {
  if (!hasActiveLinks) return false;
  if (!lastPullTs) return true;
  return (now - lastPullTs) >= intervalMs;
}

/** Nombre de candidatures non lues (vu === false), hors supprimées/archivées. */
export function countUnreadCandidats(candidats) {
  if (!Array.isArray(candidats)) return 0;
  return candidats.filter(c => c && c.vu === false && !c._deleted && !c._archived).length;
}

/** Texte du toast d'arrivée de nouveaux dossiers. */
export function nouveauDossierToast(newNames) {
  const names = (Array.isArray(newNames) ? newNames : []).map(s => String(s || '').trim()).filter(Boolean);
  const n = names.length;
  if (n === 0) return '📩 Nouveau dossier reçu';
  if (n === 1) return '📩 Nouveau dossier reçu : ' + names[0];
  return '📩 Nouveau dossier reçu : ' + names[0] + ' et ' + (n - 1) + ' autre' + (n - 1 > 1 ? 's' : '');
}

/** Texte du toast de mise à jour d'un dossier déjà déposé (ré-ouverture candidat / complément). */
export function majDossierToast(updatedNames) {
  const names = (Array.isArray(updatedNames) ? updatedNames : []).map(s => String(s || '').trim()).filter(Boolean);
  const n = names.length;
  if (n === 0) return '📝 Dossier mis à jour';
  if (n === 1) return '📝 Dossier mis à jour : ' + names[0];
  return '📝 Dossiers mis à jour : ' + names[0] + ' et ' + (n - 1) + ' autre' + (n - 1 > 1 ? 's' : '');
}

/**
 * Décide quoi faire d'une soumission relais lors du pull, vu l'état déjà connu du lien.
 * Gère la ré-ouverture candidat : un lien déjà 'collected' est re-tiré, mais on ne (re)importe
 * que si la soumission a changé (horodatage `submittedAt` différent), sinon on boucle.
 * Pur — testé. L'appelant gère les effets (import, persistance du baseline).
 *
 * @param {object} link - lien candidat ({ status, _lastSubmittedAt, candId })
 * @param {string} submittedAt - horodatage de soumission renvoyé par le relais
 * @param {string|null} candStatut - statut du candidat lié (pour stopper après décision)
 * @returns {'import'|'skip'|'baseline'}
 *   - 'import'   : (ré)importer + NOTIFIER le bailleur (nouvelle soumission ou maj détectée)
 *   - 'skip'     : ne rien faire (déjà importée, ou décision déjà prise)
 *   - 'baseline' : lien collecté hérité sans horodatage suivi (ex. importé avant le suivi) →
 *                  (ré)importer les données + pièces MAIS SANS notifier, et adopter `submittedAt`
 *                  comme référence. Évite une fausse notif rétroactive tout en ne perdant pas
 *                  une éventuelle ré-ouverture candidat survenue avant la 1re prise de référence.
 */
export function repullDecision(link, submittedAt, candStatut) {
  if (!link) return 'import';
  if (link.status !== 'collected') return 'import'; // 'active' → flux normal (1ère soumission / complément D13)
  if (candStatut === 'refuse' || candStatut === 'converti' || candStatut === 'valide') return 'skip'; // décision prise → fige (même un lien hérité, avant baseline)
  if (link._lastSubmittedAt == null) return 'baseline'; // hérité d'avant le suivi des ré-ouvertures
  if (submittedAt && submittedAt === link._lastSubmittedAt) return 'skip'; // même soumission, déjà importée
  return 'import';
}

/**
 * Loyer attendu d'un logement pour scorer un candidat (ratio revenus/loyer), en cascade.
 * Pur — l'appelant rassemble les données depuis DB. Ordre validé : logement → ancien
 * locataire (dernier bail courant/historique avec un loyer) → loyer saisi à l'invitation.
 *
 * @param {object} src
 * @param {number} src.logHC      - loyer HC du logement (log.hc), source de vérité
 * @param {Array<{hc:number,fin?:string,locataire?:string}>} src.baux - baux courant + historiques du logement
 * @param {number} src.linkLoyer  - loyer saisi à l'invitation (link.loyer)
 * @returns {{loyer:number, source:'logement'|'ancien'|'invitation'|'manquant', locataire:(string|null)}}
 */
export function loyerAttenduForLog({ logHC = 0, baux = [], linkLoyer = 0 } = {}) {
  if (Number(logHC) > 0) return { loyer: Number(logHC), source: 'logement', locataire: null };
  const withHc = (Array.isArray(baux) ? baux : []).filter(b => b && Number(b.hc) > 0);
  if (withHc.length) {
    // Le plus récent fait foi : un bail en cours (sans 'fin') prime ; sinon tri par fin décroissante.
    withHc.sort((a, b) => String(b.fin || '9999').localeCompare(String(a.fin || '9999')));
    return { loyer: Number(withHc[0].hc), source: 'ancien', locataire: withHc[0].locataire || null };
  }
  if (Number(linkLoyer) > 0) return { loyer: Number(linkLoyer), source: 'invitation', locataire: null };
  return { loyer: 0, source: 'manquant', locataire: null };
}
