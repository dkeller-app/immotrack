// relay/src/otp.js — Module PUR OTP (vérification d'identité par code 6 chiffres).
// Aucune dépendance Worker/réseau → testable seul. Réutilise crypto-utils (sha256 + constant-time).
import { sha256hex, timingSafeEqualStr } from './crypto-utils.js';

const CODE_LEN = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;   // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

// Code à 6 chiffres, CSPRNG uniforme (rejection sampling → pas de biais modulo).
export function generateCode() {
  const max = 10 ** CODE_LEN;                          // 1_000_000
  const limit = Math.floor(0xFFFFFFFF / max) * max;    // plus grand multiple de max ≤ 2^32
  const buf = new Uint32Array(1);
  let n;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
  return String(n % max).padStart(CODE_LEN, '0');
}

// Hash lié à la session (anti rainbow-table générique) : sha256(sessionId:code).
export async function hashCode(sessionId, code) {
  return sha256hex(new TextEncoder().encode(`${sessionId}:${String(code).trim()}`));
}

// Compare (constant-time) un code saisi au hash stocké. Refuse les entrées non-string / hash absent.
export async function verifyCode(sessionId, input, storedHash) {
  if (!storedHash || typeof input !== 'string') return false;
  return timingSafeEqualStr(await hashCode(sessionId, input), storedHash);
}

// L'état OTP d'un signataire est-il exploitable (présent, non expiré, tentatives restantes) ?
export function otpUsable(otp, now) {
  return !!(otp && otp.hash && now <= otp.expiresAt && (otp.attempts || 0) < OTP_MAX_ATTEMPTS);
}
