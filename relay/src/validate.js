export const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 Mo

export function validatePdfUpload(bytes, contentType) {
  if (contentType && !String(contentType).toLowerCase().includes('application/pdf')) {
    return { ok: false, reason: 'bad-content-type' };
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  const isPdf =
    bytes.length >= 4 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (!isPdf) {
    return { ok: false, reason: 'not-pdf' };
  }
  return { ok: true };
}

export function validateSigners(signers) {
  if (!Array.isArray(signers) || signers.length === 0) {
    return { ok: false, reason: 'no-signers' };
  }
  const seenOrdre = new Set();
  for (const s of signers) {
    if (!s || typeof s !== 'object') return { ok: false, reason: 'bad-signer' };
    if (typeof s.email !== 'string' || s.email.trim() === '') {
      return { ok: false, reason: 'bad-signer-email' };
    }
    if (typeof s.role !== 'string' || s.role.trim() === '') {
      return { ok: false, reason: 'bad-signer-role' };
    }
    if (!Number.isInteger(s.ordre)) {
      return { ok: false, reason: 'bad-signer-ordre' };
    }
    if (seenOrdre.has(s.ordre)) {
      return { ok: false, reason: 'duplicate-ordre' };
    }
    seenOrdre.add(s.ordre);
  }
  return { ok: true };
}
