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
