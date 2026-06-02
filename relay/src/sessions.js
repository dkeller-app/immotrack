import { randomHex, sha256hex } from './crypto-utils.js';
import {
  putMeta, getMeta, putOriginalPdf, putSignedPdf, SESSION_TTL_SECONDS
} from './storage.js';

export async function createSession(env, { bailRef, pdfBytes, signers }) {
  const sessionId = randomHex(32); // 256 bits
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const orderedSigners = [...signers]
    .sort((a, b) => a.ordre - b.ordre)
    .map((s) => ({
      role: s.role,
      emailHash: s.emailHash,
      tel: s.tel || '',
      ordre: s.ordre,
      statut: 'pending'
    }));
  const session = {
    sessionId,
    bailRef,
    provider: 'native',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: 'pending',
    currentIndex: 0,
    signers: orderedSigners
  };
  await putOriginalPdf(env, sessionId, pdfBytes);
  await putMeta(env, sessionId, session);
  return { sessionId, session };
}

export async function loadSession(env, sessionId) {
  return getMeta(env, sessionId);
}

export async function recordSignature(env, sessionId, { signedBytes, proof }) {
  const session = await getMeta(env, sessionId);
  if (!session) throw new Error('session-not-found');
  if (session.status === 'completed') throw new Error('session already completed');

  const idx = session.currentIndex;
  const signer = session.signers[idx];
  signer.statut = 'done';
  signer.proof = {
    ip: proof.ip,
    userAgent: proof.userAgent,
    signedAt: proof.signedAt,
    pdfSha256: await sha256hex(signedBytes)
  };

  // Le PDF signé écrase l'original pour le prochain signataire (signature par-dessus)
  await putSignedPdf(env, sessionId, signedBytes);
  await putOriginalPdf(env, sessionId, signedBytes);

  const isLast = idx >= session.signers.length - 1;
  if (isLast) {
    session.status = 'completed';
  } else {
    session.currentIndex = idx + 1;
  }
  await putMeta(env, sessionId, session);
  return session;
}
