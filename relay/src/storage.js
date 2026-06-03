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
