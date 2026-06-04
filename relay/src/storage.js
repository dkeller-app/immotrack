export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 jours

const metaKey = (sid) => `session:${sid}`;
const originalKey = (sid) => `original/${sid}.pdf`;
const signedKey = (sid) => `signed/${sid}.pdf`;

export async function putMeta(env, sid, obj) {
  await env.SESSIONS_KV.put(metaKey(sid), JSON.stringify(obj), {
    expirationTtl: SESSION_TTL_SECONDS
  });
}

export async function getMeta(env, sid) {
  const raw = await env.SESSIONS_KV.get(metaKey(sid));
  return raw ? JSON.parse(raw) : null;
}

// Les PDF (original + signé) sont stockés dans la même boîte KV que les métadonnées,
// PAS dans R2 : l'activation de R2 chez Cloudflare exige une carte bancaire, qu'on refuse
// pour rester 100 % gratuit. Une valeur KV peut faire jusqu'à 25 Mio ; on plafonne l'upload
// à 20 Mo (validate.js), donc ça tient largement (un bail = quelques centaines de Ko).
// Même TTL de 14 j que les métadonnées → purge automatique cohérente.
// Les getters renvoient directement un ArrayBuffer (ou null si absent/expiré).
export async function putOriginalPdf(env, sid, bytes) {
  await env.SESSIONS_KV.put(originalKey(sid), bytes, {
    expirationTtl: SESSION_TTL_SECONDS
  });
}

export async function getOriginalPdf(env, sid) {
  return env.SESSIONS_KV.get(originalKey(sid), { type: 'arrayBuffer' });
}

export async function putSignedPdf(env, sid, bytes) {
  await env.SESSIONS_KV.put(signedKey(sid), bytes, {
    expirationTtl: SESSION_TTL_SECONDS
  });
}

export async function getSignedPdf(env, sid) {
  return env.SESSIONS_KV.get(signedKey(sid), { type: 'arrayBuffer' });
}

// Purge complète d'une session (D12 : relais éphémère).
// On supprime la meta EN PREMIER : la session devient immédiatement introuvable
// (requireOwner gate sur la meta) même si une suppression PDF échoue ensuite.
// Échec partiel = acceptable : le TTL 14 j nettoie les clés orphelines (purge best-effort côté app).
export async function deleteSession(env, sid) {
  await env.SESSIONS_KV.delete(metaKey(sid));
  await Promise.all([
    env.SESSIONS_KV.delete(originalKey(sid)),
    env.SESSIONS_KV.delete(signedKey(sid))
  ]);
}

// ── Candidature (dossier locataire en ligne) ──
// Même boîte KV que la signature. Métadonnées + dossier dans une valeur ;
// chaque pièce dans sa propre valeur (1 pièce = 1 valeur, ≤ 20 Mo, cf. validate.js).
// TTL = durée de validité choisie + grâce de 7 j (backstop si l'app ne purge jamais).
export const CANDIDATURE_GRACE_SECONDS = 7 * 24 * 60 * 60;
export function candidatureTtl(expDays) {
  return expDays * 24 * 60 * 60 + CANDIDATURE_GRACE_SECONDS;
}

const candKey = (lid) => `cand:${lid}`;
const candPieceKey = (lid, pid) => `cand-piece/${lid}/${pid}`;

export async function putCand(env, lid, obj, ttlSeconds) {
  await env.SESSIONS_KV.put(candKey(lid), JSON.stringify(obj), { expirationTtl: ttlSeconds });
}
export async function getCand(env, lid) {
  const raw = await env.SESSIONS_KV.get(candKey(lid));
  return raw ? JSON.parse(raw) : null;
}
export async function delCand(env, lid) {
  await env.SESSIONS_KV.delete(candKey(lid));
}
export async function putPiece(env, lid, pid, bytes, ttlSeconds) {
  await env.SESSIONS_KV.put(candPieceKey(lid, pid), bytes, { expirationTtl: ttlSeconds });
}
export async function getPiece(env, lid, pid) {
  return env.SESSIONS_KV.get(candPieceKey(lid, pid), { type: 'arrayBuffer' });
}
export async function delPiece(env, lid, pid) {
  await env.SESSIONS_KV.delete(candPieceKey(lid, pid));
}
