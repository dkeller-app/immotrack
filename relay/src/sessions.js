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

// Marque la vérification d'email côté serveur (autorité : §5 #2 anti-transfert).
// Horodatage posé par le relais, jamais par le client → preuve fiable du clic sur le lien unique.
export async function recordEmailVerified(env, sessionId) {
  const session = await getMeta(env, sessionId);
  if (!session) throw new Error('session-not-found');
  const signer = session.signers[session.currentIndex];
  if (!signer) throw new Error('signer-not-found');
  if (!signer.emailVerifiedAt) {
    signer.emailVerifiedAt = new Date().toISOString();
    await putMeta(env, sessionId, session);
  }
  return session;
}

// OTP : pose le code (hashé) envoyé au signataire courant ; les tentatives repartent à 0.
export async function recordOtpSent(env, sessionId, hash, expiresAt) {
  const session = await getMeta(env, sessionId);
  if (!session) throw new Error('session-not-found');
  const signer = session.signers[session.currentIndex];
  if (!signer) throw new Error('signer-not-found');
  signer.otp = { hash, expiresAt, attempts: 0 };
  await putMeta(env, sessionId, session);
  return session;
}

// OTP : marque l'identité vérifiée (autorité serveur) ; pose aussi emailVerifiedAt (l'OTP prouve
// l'email) et consomme le code (hash → null, plus rejouable).
export async function recordOtpVerified(env, sessionId) {
  const session = await getMeta(env, sessionId);
  if (!session) throw new Error('session-not-found');
  const signer = session.signers[session.currentIndex];
  if (!signer) throw new Error('signer-not-found');
  signer.otpVerifiedAt = new Date().toISOString();
  signer.otpChannel = 'email';
  if (!signer.emailVerifiedAt) signer.emailVerifiedAt = signer.otpVerifiedAt;
  if (signer.otp) signer.otp.hash = null;
  await putMeta(env, sessionId, session);
  return session;
}

// OTP : incrémente le compteur de tentatives échouées du signataire courant.
export async function recordOtpAttempt(env, sessionId) {
  const session = await getMeta(env, sessionId);
  if (!session) throw new Error('session-not-found');
  const signer = session.signers[session.currentIndex];
  if (signer && signer.otp) {
    signer.otp.attempts = (signer.otp.attempts || 0) + 1;
    await putMeta(env, sessionId, session);
  }
  return session;
}

// N'accepte que les champs attendus de la preuve client (acte de volonté + horodatages).
// Tout le reste est ignoré ; les chaînes sont bornées pour éviter l'enflure du KV.
function sanitizeClientProof(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
  return {
    signerName: str(raw.signerName, 200),
    consentElectronic: raw.consentElectronic === true,
    luApprouve: raw.luApprouve === true,
    openedAt: str(raw.openedAt, 40),
    readCompletedAt: str(raw.readCompletedAt, 40)
  };
}

export async function recordSignature(env, sessionId, { signedBytes, proof, clientProof }) {
  const session = await getMeta(env, sessionId);
  if (!session) throw new Error('session-not-found');
  if (session.status === 'completed') throw new Error('session already completed');

  const idx = session.currentIndex;
  const signer = session.signers[idx];
  signer.statut = 'done';
  const client = sanitizeClientProof(clientProof);
  signer.proof = {
    ip: proof.ip,
    userAgent: proof.userAgent,
    signedAt: proof.signedAt,
    pdfSha256: await sha256hex(signedBytes),
    // Autorité serveur (posé par recordEmailVerified) — pas de confiance au client.
    emailVerifiedAt: signer.emailVerifiedAt || null,
    // Acte de volonté + horodatages d'étape capturés côté client (null si absent).
    signerName: client ? client.signerName : null,
    consentElectronic: client ? client.consentElectronic : null,
    luApprouve: client ? client.luApprouve : null,
    openedAt: client ? client.openedAt : null,
    readCompletedAt: client ? client.readCompletedAt : null
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
