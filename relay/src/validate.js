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

export const MAX_PIECE_BYTES = 20 * 1024 * 1024; // 20 Mo (cf. design : sous la limite KV 25 Mio)

const ALLOWED_PIECE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// Magic bytes : %PDF / JPEG (FF D8 FF) / PNG (89 50 4E 47).
function detectKind(bytes) {
  if (bytes.byteLength >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  if (bytes.byteLength >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg';
  if (bytes.byteLength >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
  return null;
}

export function validatePieceUpload(bytes, contentType) {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_PIECE_TYPES.includes(ct)) return { ok: false, reason: 'bad-content-type' };
  if (bytes.byteLength > MAX_PIECE_BYTES) return { ok: false, reason: 'too-large' };
  const kind = detectKind(bytes);
  if (!kind) return { ok: false, reason: 'bad-format' };
  if ((kind === 'pdf' && ct !== 'application/pdf') ||
      (kind === 'jpeg' && ct !== 'image/jpeg') ||
      (kind === 'png' && ct !== 'image/png')) {
    return { ok: false, reason: 'content-type-mismatch' };
  }
  return { ok: true, kind };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validation serveur du dossier candidat (en plus du client). Champs d'identité
// obligatoires (D2). La situation/garant sont optionnels au niveau transport ;
// la complétude « métier » est gérée à l'étape submit + côté app (scoring).
export function validateDossier(dossier) {
  if (!dossier || typeof dossier !== 'object' || !dossier.identite || typeof dossier.identite !== 'object') {
    return { ok: false, reason: 'identite-missing' };
  }
  const i = dossier.identite;
  const req = ['civilite', 'nom', 'prenom', 'ddn', 'tel', 'email'];
  for (const f of req) {
    if (typeof i[f] !== 'string' || i[f].trim() === '') {
      return { ok: false, reason: `${f}-missing` };
    }
  }
  if (!EMAIL_RE.test(i.email.trim())) return { ok: false, reason: 'bad-email' };
  return { ok: true };
}

export function validateCandidatureMeta(meta) {
  if (!meta || typeof meta !== 'object') return { ok: false, reason: 'bad-meta' };
  if (typeof meta.logRef !== 'string' || meta.logRef.trim() === '' || meta.logRef.trim().length > 200) return { ok: false, reason: 'bad-logref' };
  if (![7, 14, 30].includes(meta.expDays)) return { ok: false, reason: 'bad-expdays' };
  return { ok: true };
}
