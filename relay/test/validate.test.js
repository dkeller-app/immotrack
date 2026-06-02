import { describe, it, expect } from 'vitest';
import { validatePdfUpload, MAX_PDF_BYTES } from '../src/validate.js';

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

function makeBytes(magic, size) {
  const b = new Uint8Array(size);
  b.set(magic, 0);
  return b;
}

describe('validatePdfUpload', () => {
  it('accepte un PDF valide (magic %PDF, taille ok, content-type pdf)', () => {
    const bytes = makeBytes(PDF_MAGIC, 1000);
    const res = validatePdfUpload(bytes, 'application/pdf');
    expect(res.ok).toBe(true);
  });

  it('rejette si les magic bytes ne sont pas %PDF', () => {
    const bytes = makeBytes(new Uint8Array([0x00, 0x01, 0x02, 0x03]), 1000);
    const res = validatePdfUpload(bytes, 'application/pdf');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not-pdf');
  });

  it('rejette si trop volumineux', () => {
    const bytes = makeBytes(PDF_MAGIC, MAX_PDF_BYTES + 1);
    const res = validatePdfUpload(bytes, 'application/pdf');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('too-large');
  });

  it('rejette un content-type non pdf', () => {
    const bytes = makeBytes(PDF_MAGIC, 1000);
    const res = validatePdfUpload(bytes, 'image/png');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('bad-content-type');
  });
});
