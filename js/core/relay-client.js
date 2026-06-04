// js/core/relay-client.js
// Client du relais Cloudflare pour les candidatures en ligne (lien candidat).
// Helpers PURS (testés) + wrappers réseau (fetchImpl injectable). Aucune dépendance
// DOM. La config {base, appKey} est fournie par l'appelant (index.html lit
// localStorage via _lsKey). Le ownerToken (capacité bailleur) n'est jamais loggé
// ni placé dans une URL. Exposé sur window par js/main.js.

const EXP_DAYS_ALLOWED = [7, 14, 30];

/** Retire les slashs finaux d'une base URL. '' si vide. */
export function normalizeBase(base) {
  return String(base || '').trim().replace(/\/+$/, '');
}

/** URL publique de dépôt pour le candidat. */
export function buildCandidatUrl(base, linkId) {
  return `${normalizeBase(base)}/d/${encodeURIComponent(String(linkId || ''))}`;
}

/** true si la config relais est exploitable. */
export function relayConfigured(cfg) {
  return !!(cfg && normalizeBase(cfg.base) && String(cfg.appKey || '').trim());
}

/** Construit et valide le corps d'une invitation. Lève si logRef vide / expDays invalide. */
export function buildInvitationPayload({ logRef, bienLabel, loyer, message, expDays } = {}) {
  if (!String(logRef || '').trim()) throw new Error('logRef requis');
  const exp = expDays == null ? 14 : Number(expDays);
  if (!EXP_DAYS_ALLOWED.includes(exp)) throw new Error('expDays invalide (7, 14 ou 30)');
  return {
    logRef: String(logRef),
    bienLabel: String(bienLabel || ''),
    loyer: Number(loyer) || 0,
    message: String(message || ''),
    expDays: exp
  };
}

/**
 * Mappe le résultat relais (dossier soumis) vers un *partial* candidat (à passer à
 * _nouveauCandidat). Pur. Renomme : identite.adresseActuelle → adressePrecedente ;
 * garant.lieuNaiss → garant.lieu. source:'lien', statut:'recu', piecesCompletes:false
 * (le bailleur vérifie ensuite). AUCUN score (recalculé via _calculConfiance).
 */
export function _relayDossierVersCandidat(result, ctx = {}) {
  const d = (result && result.dossier) || {};
  const id = d.identite || {};
  const si = d.situation || {};
  const g = d.garant || null;
  return {
    logRef: ctx.logRef || (result && result.logRef) || '',
    entity: ctx.entity || '',
    source: 'lien',
    statut: 'recu',
    civilite: id.civilite || '',
    nom: id.nom || '',
    prenom: id.prenom || '',
    ddn: id.ddn || '',
    lieuNaiss: id.lieuNaiss || '',
    tel: id.tel || '',
    email: id.email || '',
    adressePrecedente: id.adresseActuelle || id.adressePrecedente || '',
    revenus: Number(si.revenus) || 0,
    employeur: si.employeur || '',
    contrat: si.contrat || '',
    garant: g && String(g.nom || '').trim()
      ? { nom: g.nom || '', adresse: g.adresse || '', ddn: g.ddn || '', lieu: g.lieuNaiss || g.lieu || '' }
      : null,
    piecesCompletes: false,
    dateCreation: (result && result.submittedAt) || new Date().toISOString()
  };
}

// ── Réseau ──────────────────────────────────────────────────────────────────
async function jsonOrThrow(res) {
  if (!res.ok) {
    let detail = ''; try { detail = (await res.json()).error || ''; } catch (_) {}
    throw new Error(`relay ${res.status}${detail ? ' ' + detail : ''}`);
  }
  return res.json();
}

/** Crée une invitation (rôle bailleur). → { linkId, candidatUrl, ownerToken, expiresAt }. */
export async function relayCreateInvitation(cfg, input, fetchImpl = fetch) {
  const payload = buildInvitationPayload(input);
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/candidatures`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.appKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return jsonOrThrow(res);
}

/** Lit le dossier soumis. 409 (pas encore soumis) → { _status: 409 } (non bloquant). */
export async function relayFetchResult(cfg, linkId, ownerToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}/result`, {
    headers: { 'X-Owner-Token': ownerToken }
  });
  if (res.status === 409) return { _status: 409 };
  return jsonOrThrow(res);
}

/** Télécharge une pièce. → { bytes: Uint8Array, contentType }. */
export async function relayFetchPiece(cfg, linkId, pieceId, ownerToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}/piece/${pieceId}`, {
    headers: { 'X-Owner-Token': ownerToken }
  });
  if (!res.ok) throw new Error(`relay piece ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType: res.headers.get('content-type') || 'application/octet-stream' };
}

/** Demande de complément (D13) : remet le lien en 'open' + note. */
export async function relayReopen(cfg, linkId, ownerToken, note, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}/reopen`, {
    method: 'POST', headers: { 'X-Owner-Token': ownerToken, 'content-type': 'application/json' },
    body: JSON.stringify({ note: String(note || '') })
  });
  return jsonOrThrow(res);
}

/** Révoque le lien (inutilisable immédiatement). */
export async function relayRevoke(cfg, linkId, ownerToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}/revoke`, {
    method: 'POST', headers: { 'X-Owner-Token': ownerToken }
  });
  return jsonOrThrow(res);
}

/** Purge (accusé de réception après rapatriement dans l'app). */
export async function relayPurge(cfg, linkId, ownerToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/candidatures/${linkId}`, {
    method: 'DELETE', headers: { 'X-Owner-Token': ownerToken }
  });
  return jsonOrThrow(res);
}

/** Test de connexion (Réglages). Vérifie base + APP_KEY d'un coup. → { ok:true } ou lève. */
export async function relayPing(cfg, fetchImpl = fetch) {
  const res = await fetchImpl(`${normalizeBase(cfg.base)}/api/ping`, {
    headers: { Authorization: `Bearer ${cfg.appKey}` }
  });
  return jsonOrThrow(res);
}
