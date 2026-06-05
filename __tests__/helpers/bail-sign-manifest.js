// __tests__/helpers/bail-sign-manifest.js
// Manifeste d'ancres de signature. encode/decode PUR. readFromDoc/embedInDoc reçoivent
// un PDFDocument pdf-lib en paramètre (aucun import pdf-lib ici → testable + portable).
export const SENTINEL = 'ITSIGNv1:';

function toB64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encode(manifest) {
  return SENTINEL + toB64url(JSON.stringify(manifest));
}

export function decode(str) {
  if (typeof str !== 'string' || !str.startsWith(SENTINEL)) return null;
  try {
    return JSON.parse(fromB64url(str.slice(SENTINEL.length)));
  } catch {
    return null;
  }
}

export function readFromDoc(pdfDoc) {
  return decode(pdfDoc.getKeywords());
}

export function embedInDoc(pdfDoc, manifest) {
  pdfDoc.setKeywords([encode(manifest)]);
}
