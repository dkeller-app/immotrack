// js/core/candidature.js
// Pure helpers candidature locataire (LOG-CANDIDATS). Aucun DOM, aucun effet de bord.
// Testés par __tests__/helpers/candidature.test.js. Exposés sur window via js/main.js.

/**
 * Score "Confiance" 0-100, transparent, critères de solvabilité légaux uniquement
 * (jamais discriminatoire). Voir spec §9.
 * @param {object} cand - candidat (revenus, contrat, garant, piecesCompletes, ribFourni)
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
    if (ratio >= 3) score += 30;
    else if (ratio >= 2.5) score += 20;
    else if (ratio >= 2) score += 10;
  }
  if (cand.contrat === 'CDI') score += 25;
  else if (cand.contrat === 'CDD') score += 10;
  if (cand.garant && String(cand.garant.nom || '').trim()) score += 20;
  if (cand.piecesCompletes) score += 15;
  if (cand.ribFourni) score += 10;
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
    revenus: Number(partial.revenus) || 0,
    employeur: partial.employeur || '',
    contrat: partial.contrat || '',
    garant: partial.garant || null,
    piecesCompletes: partial.piecesCompletes || false,
    ribFourni: partial.ribFourni || false,
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
