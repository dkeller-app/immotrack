import { describe, it, expect } from 'vitest';
import { validatePdfUpload, validateSigners, MAX_PDF_BYTES, validatePieceUpload, validateDossier, validateCandidatureMeta, MAX_PIECE_BYTES } from '../src/validate.js';

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

const JPEG_MAGIC = new Uint8Array([0xFF, 0xD8, 0xFF]);
const PNG_MAGIC  = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
const PDFM       = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

describe('validatePieceUpload', () => {
  it('accepte un JPEG', () => expect(validatePieceUpload(makeBytes(JPEG_MAGIC, 500), 'image/jpeg').ok).toBe(true));
  it('accepte un PNG', () => expect(validatePieceUpload(makeBytes(PNG_MAGIC, 500), 'image/png').ok).toBe(true));
  it('accepte un PDF', () => expect(validatePieceUpload(makeBytes(PDFM, 500), 'application/pdf').ok).toBe(true));
  it('rejette un type inconnu (magic invalide)', () => {
    const r = validatePieceUpload(makeBytes(new Uint8Array([0,1,2,3]), 500), 'image/png');
    expect(r.ok).toBe(false); expect(r.reason).toBe('bad-format');
  });
  it('rejette un content-type non autorisé', () => {
    const r = validatePieceUpload(makeBytes(JPEG_MAGIC, 500), 'image/gif');
    expect(r.ok).toBe(false); expect(r.reason).toBe('bad-content-type');
  });
  it('rejette si trop volumineux (> 20 Mo)', () => {
    const r = validatePieceUpload(makeBytes(PDFM, MAX_PIECE_BYTES + 1), 'application/pdf');
    expect(r.ok).toBe(false); expect(r.reason).toBe('too-large');
  });
  it('rejette un content-type mensonger (PNG déclaré image/jpeg)', () => {
    const r = validatePieceUpload(makeBytes(PNG_MAGIC, 500), 'image/jpeg');
    expect(r.ok).toBe(false); expect(r.reason).toBe('content-type-mismatch');
  });
});

describe('validateDossier', () => {
  const ok = { identite: { civilite:'Mme', nom:'Moreau', prenom:'Camille', ddn:'1990-01-01', lieuNaiss:'Lyon', tel:'0600000000', email:'c@x.fr', adressePrecedente:'1 rue X' } };
  it('accepte un dossier identité complet', () => expect(validateDossier(ok).ok).toBe(true));
  it('rejette si identite absente', () => expect(validateDossier({}).reason).toBe('identite-missing'));
  it('rejette un email invalide', () => {
    const bad = { identite: { ...ok.identite, email:'pasunemail' } };
    expect(validateDossier(bad).reason).toBe('bad-email');
  });
  it('rejette un nom vide', () => {
    const bad = { identite: { ...ok.identite, nom:'  ' } };
    expect(validateDossier(bad).reason).toBe('nom-missing');
  });
});

describe('validateCandidatureMeta', () => {
  it('accepte une meta valide', () => expect(validateCandidatureMeta({ logRef:'L1', expDays:14 }).ok).toBe(true));
  it('rejette un logRef vide', () => expect(validateCandidatureMeta({ logRef:'', expDays:14 }).reason).toBe('bad-logref'));
  it('rejette un logRef trop long', () => expect(validateCandidatureMeta({ logRef:'x'.repeat(201), expDays:14 }).reason).toBe('bad-logref'));
  it('rejette un expDays hors {7,14,30}', () => expect(validateCandidatureMeta({ logRef:'L1', expDays:99 }).reason).toBe('bad-expdays'));
});
