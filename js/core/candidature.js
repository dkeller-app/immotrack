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
    + 'Bien cordialement.';
}

/**
 * Score "Confiance" 0-100, transparent, critères de solvabilité légaux uniquement
 * (jamais discriminatoire). Voir spec §9.
 * Barème : ratio revenus/loyer ≥3×→35 / ≥2.5×→20 / ≥2×→10 · contrat CDI→25 / CDD→10
 *          · garant présent→20 · pièces complètes→20. Plafonné à 100.
 * Le RIB n'entre PAS dans le score : ce n'est ni un indicateur de solvabilité ni une
 * pièce de sélection autorisée (décret 2015-1437 ; art. 22-2 loi du 6 juillet 1989 —
 * l'autorisation de prélèvement ne peut être exigée). Il est collecté à la signature du bail.
 * @param {object} cand - candidat (revenus, contrat, garant, piecesCompletes)
 * @param {number} loyerHC - loyer hors charges du logement visé (pour le ratio)
 * @returns {number} score entier 0-100
 */
export function _calculConfiance(cand, loyerHC = 0) {
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
  if (cand.garant && String(cand.garant.nom || '').trim()) score += 20;
  if (cand.piecesCompletes) score += 20;
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
 *   - 'import'   : (ré)importer cette soumission (nouvelle ou modifiée)
 *   - 'skip'     : ne rien faire (déjà importée, ou décision déjà prise)
 *   - 'baseline' : lien collecté hérité sans horodatage suivi → adopter `submittedAt`
 *                  comme référence SANS notifier (évite une fausse notif rétroactive)
 */
export function repullDecision(link, submittedAt, candStatut) {
  if (!link) return 'import';
  if (link.status !== 'collected') return 'import'; // 'active' → flux normal (1ère soumission / complément D13)
  if (link._lastSubmittedAt == null) return 'baseline'; // hérité d'avant le suivi des ré-ouvertures
  if (submittedAt && submittedAt === link._lastSubmittedAt) return 'skip'; // même soumission, déjà importée
  if (candStatut === 'refuse' || candStatut === 'converti' || candStatut === 'valide') return 'skip'; // décision prise
  return 'import';
}
