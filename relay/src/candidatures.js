import { randomHex } from './crypto-utils.js';
import { putCand, getCand, delCand, putPiece, getPiece, delPiece, candidatureTtl } from './storage.js';

function ttlOf(c) { return candidatureTtl(c.expDays); }

export async function createCandidature(env, { logRef, bienLabel, loyer, message, expDays }) {
  const linkId = randomHex(32); // 256 bits, inguessable (D11)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expDays * 24 * 60 * 60 * 1000);
  const candidature = {
    linkId, logRef, bienLabel: bienLabel || '', loyer: Number(loyer) || 0,
    message: message || '', expDays,
    createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(),
    openedAt: null, submittedAt: null,
    status: 'open', dossier: null, pieces: [], complementNote: null
  };
  await putCand(env, linkId, candidature, ttlOf(candidature));
  return { linkId, candidature };
}

export async function loadCandidature(env, linkId) {
  return getCand(env, linkId);
}

export async function saveDossier(env, linkId, dossier) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  c.dossier = dossier;
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function addPiece(env, linkId, { categorie, filename, contentType, bytes }) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  const pieceId = randomHex(8);
  await putPiece(env, linkId, pieceId, bytes, ttlOf(c));
  c.pieces.push({
    pieceId, categorie: String(categorie || 'autre').slice(0, 40),
    filename: String(filename || 'piece').slice(0, 200),
    contentType, size: bytes.byteLength, uploadedAt: new Date().toISOString()
  });
  await putCand(env, linkId, c, ttlOf(c));
  return { pieceId, candidature: c };
}

export async function removePiece(env, linkId, pieceId) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  await delPiece(env, linkId, pieceId);
  c.pieces = c.pieces.filter((p) => p.pieceId !== pieceId);
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function markOpened(env, linkId) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  if (!c.openedAt) {
    c.openedAt = new Date().toISOString();
    await putCand(env, linkId, c, ttlOf(c));
  }
  return c;
}

export async function submitCandidature(env, linkId) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  c.status = 'submitted';
  c.submittedAt = new Date().toISOString();
  c.complementNote = null;
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function reopenForComplement(env, linkId, note) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  c.status = 'open';
  c.complementNote = typeof note === 'string' ? note.slice(0, 500) : null;
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function revokeCandidature(env, linkId) {
  const c = await getCand(env, linkId);
  if (!c) throw new Error('candidature-not-found');
  c.status = 'revoked';
  await putCand(env, linkId, c, ttlOf(c));
  return c;
}

export async function purgeCandidature(env, linkId) {
  const c = await getCand(env, linkId);
  if (c) { for (const p of c.pieces) await delPiece(env, linkId, p.pieceId); }
  await delCand(env, linkId);
}
