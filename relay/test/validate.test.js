import { describe, it, expect } from 'vitest';
import { validatePdfUpload, validateSigners, MAX_PDF_BYTES } from '../src/validate.js';

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

describe('validateSigners', () => {
  it('accepte une liste de signataires bien formée', () => {
    const res = validateSigners([
      { role: 'bailleur', email: 'g@sci.fr', tel: '', ordre: 1 },
      { role: 'locataire', email: 'loc@x.fr', tel: '', ordre: 2 }
    ]);
    expect(res.ok).toBe(true);
  });

  it('rejette une liste vide ou non-array', () => {
    expect(validateSigners([]).reason).toBe('no-signers');
    expect(validateSigners(undefined).reason).toBe('no-signers');
    expect(validateSigners('nope').reason).toBe('no-signers');
  });

  it('rejette un email manquant ou vide (anti emailHash("undefined"))', () => {
    expect(validateSigners([{ role: 'locataire', ordre: 1 }]).reason).toBe('bad-signer-email');
    expect(validateSigners([{ role: 'locataire', email: '   ', ordre: 1 }]).reason).toBe('bad-signer-email');
  });

  it('rejette un rôle manquant', () => {
    expect(validateSigners([{ email: 'a@b.fr', ordre: 1 }]).reason).toBe('bad-signer-role');
  });

  it('rejette un ordre non entier (anti tri NaN)', () => {
    expect(validateSigners([{ role: 'locataire', email: 'a@b.fr' }]).reason).toBe('bad-signer-ordre');
    expect(validateSigners([{ role: 'locataire', email: 'a@b.fr', ordre: 'x' }]).reason).toBe('bad-signer-ordre');
    expect(validateSigners([{ role: 'locataire', email: 'a@b.fr', ordre: 1.5 }]).reason).toBe('bad-signer-ordre');
  });

  it('rejette des ordres dupliqués (ordre de signature ambigu)', () => {
    const res = validateSigners([
      { role: 'bailleur', email: 'g@sci.fr', ordre: 1 },
      { role: 'locataire', email: 'loc@x.fr', ordre: 1 }
    ]);
    expect(res.reason).toBe('duplicate-ordre');
  });
});
