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

export async function putOriginalPdf(env, sid, bytes) {
  await env.PDF_BUCKET.put(originalKey(sid), bytes, {
    httpMetadata: { contentType: 'application/pdf' }
  });
}

export async function getOriginalPdf(env, sid) {
  return env.PDF_BUCKET.get(originalKey(sid));
}

export async function putSignedPdf(env, sid, bytes) {
  await env.PDF_BUCKET.put(signedKey(sid), bytes, {
    httpMetadata: { contentType: 'application/pdf' }
  });
}

export async function getSignedPdf(env, sid) {
  return env.PDF_BUCKET.get(signedKey(sid));
}
