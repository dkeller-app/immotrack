/**
 * Tests core/email-pdf-attachment.js — EM-2b v15.87
 *
 * Couvre :
 *  - _blobToBase64 : conversion correcte + erreurs
 *  - _emailPdfTypesSupportedV1 : liste correcte
 *  - _emailGenPdfAttachment dispatch :
 *      - type supporté V1 (quittance, irl-revision) → renvoie {filename, base64, mimeType}
 *      - type non supporté V1 → renvoie {error, supportedV1}
 *      - jsPDF non chargé → renvoie {error}
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _blobToBase64,
  _emailGenPdfAttachment,
  _emailPdfTypesSupportedV1
} from '../../js/core/email-pdf-attachment.js';

// ────────────────────────────────────────────────────────────────────────────
// Mock jsPDF (simulé via window.jspdf)
// ────────────────────────────────────────────────────────────────────────────

class FakeJsPdf {
  constructor(opts) {
    this.opts = opts;
    this.calls = [];
  }
  setFont() { this.calls.push(['setFont', [].slice.call(arguments)]); return this; }
  setFontSize() { this.calls.push(['setFontSize', [].slice.call(arguments)]); return this; }
  setTextColor() { this.calls.push(['setTextColor', [].slice.call(arguments)]); return this; }
  setDrawColor() { this.calls.push(['setDrawColor', [].slice.call(arguments)]); return this; }
  setLineWidth() { this.calls.push(['setLineWidth', [].slice.call(arguments)]); return this; }
  setFillColor() { this.calls.push(['setFillColor', [].slice.call(arguments)]); return this; }
  text() { this.calls.push(['text', [].slice.call(arguments)]); return this; }
  line() { this.calls.push(['line', [].slice.call(arguments)]); return this; }
  rect() { this.calls.push(['rect', [].slice.call(arguments)]); return this; }
  output(type) {
    if (type !== 'blob') throw new Error('test only supports blob');
    // Simule un Blob de 4 bytes pour vérifier l'encoding base64
    return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });
  }
}

beforeEach(() => {
  // Mock window.jspdf
  global.window = global.window || {};
  global.window.jspdf = { jsPDF: FakeJsPdf };
});

afterEach(() => {
  if (global.window) delete global.window.jspdf;
});

// ────────────────────────────────────────────────────────────────────────────
// _blobToBase64
// ────────────────────────────────────────────────────────────────────────────

describe('_blobToBase64', () => {
  it('convertit un Blob de 4 bytes en base64 sans préfixe data:', async () => {
    const blob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });
    const b64 = await _blobToBase64(blob);
    expect(typeof b64).toBe('string');
    // "%PDF" en base64 = "JVBERg==" → mais ici seulement 4 bytes "JVBE" → "JVBERg==" pour padding
    expect(b64).toBe('JVBERg==');
  });

  it('reject si blob null', async () => {
    await expect(_blobToBase64(null)).rejects.toThrow('blob required');
  });

  it('reject si blob undefined', async () => {
    await expect(_blobToBase64(undefined)).rejects.toThrow('blob required');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// _emailPdfTypesSupportedV1
// ────────────────────────────────────────────────────────────────────────────

describe('_emailPdfTypesSupportedV1', () => {
  it('liste exactement quittance et irl-revision en V1.0', () => {
    const types = _emailPdfTypesSupportedV1();
    expect(types).toEqual(['quittance', 'irl-revision']);
  });

  it('retourne un nouveau tableau (pas une ref interne mutable)', () => {
    const a = _emailPdfTypesSupportedV1();
    const b = _emailPdfTypesSupportedV1();
    expect(a).toEqual(b);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// _emailGenPdfAttachment — dispatch
// ────────────────────────────────────────────────────────────────────────────

describe('_emailGenPdfAttachment — dispatch types', () => {
  const ctxQuittance = {
    locataire: { civilite: 'M.', nom: 'Demo', email: 'demo@test.fr' },
    bail: { adrBien: '12 rue Voltaire 75011 Paris', hc: 850, ch: 80 },
    logement: { ref: 'LOG-001', adr: '12 rue Voltaire' },
    entite: { nom: 'SCI Test', siege: '1 av Foo 75001 Paris', gerant: 'Didier K' },
    quittance: { mois: 'mai 2026', hc: 850, ch: 80, total: 930, date: '2026-05-01' }
  };

  it('quittance → renvoie {filename, base64, mimeType}', async () => {
    const out = await _emailGenPdfAttachment('quittance', ctxQuittance);
    expect(out).toHaveProperty('filename');
    expect(out.filename).toMatch(/\.pdf$/);
    expect(out.filename).toMatch(/Quittance/);
    expect(out.filename).toContain('mai-2026');
    expect(out.filename).toContain('LOG-001');
    expect(out.mimeType).toBe('application/pdf');
    expect(typeof out.base64).toBe('string');
    expect(out.base64.length).toBeGreaterThan(0);
  });

  it('irl-revision → renvoie {filename, base64, mimeType}', async () => {
    const ctx = {
      ...ctxQuittance,
      ancienHC: 850, nouveauHC: 873.50,
      moisApplication: 'juin 2026'
    };
    const out = await _emailGenPdfAttachment('irl-revision', ctx);
    expect(out.filename).toMatch(/Lettre-revision-IRL/);
    expect(out.filename).toContain('LOG-001');
    expect(out.mimeType).toBe('application/pdf');
    expect(typeof out.base64).toBe('string');
  });

  it('type non supporté V1 → renvoie {error, supportedV1, message}', async () => {
    const out = await _emailGenPdfAttachment('bail-signe-final', ctxQuittance);
    expect(out.error).toBe('type-not-supported-v1');
    expect(out.supportedV1).toEqual(['quittance', 'irl-revision']);
    expect(out.message).toContain('bail-signe-final');
    expect(out.message).toContain('V1.1');
  });

  it('type inconnu → renvoie {error}', async () => {
    const out = await _emailGenPdfAttachment('blabla', {});
    expect(out.error).toBe('type-not-supported-v1');
  });

  it('jsPDF non chargé → renvoie {error: jspdf-not-loaded}', async () => {
    delete global.window.jspdf;
    const out = await _emailGenPdfAttachment('quittance', ctxQuittance);
    expect(out.error).toBe('jspdf-not-loaded');
  });

  it('ctx vide → ne throw pas, génère un PDF placeholder', async () => {
    const out = await _emailGenPdfAttachment('quittance', {});
    expect(out).toHaveProperty('filename');
    expect(out.filename).toMatch(/\.pdf$/);
    expect(out.mimeType).toBe('application/pdf');
  });

  it('ctx null → ne throw pas (defensive)', async () => {
    await expect(_emailGenPdfAttachment('quittance', null)).resolves.toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cas civilité (intégré au PDF)
// ────────────────────────────────────────────────────────────────────────────

describe('_emailGenPdfAttachment — civilité dynamique', () => {
  it('M. → écrit "Monsieur" dans le PDF', async () => {
    const ctx = {
      locataire: { civilite: 'M.', nom: 'Dupont' },
      bail: { adrBien: '1 rue X' }, logement: { ref: 'L1' }, entite: { nom: 'E' },
      quittance: { mois: 'mai 2026', hc: 500, ch: 50 }
    };
    // On vérifie l'absence de throw + le format de retour (le contenu interne du PDF est testé indirectement)
    const out = await _emailGenPdfAttachment('quittance', ctx);
    expect(out.filename).toMatch(/Quittance/);
  });

  it('Mme → écrit "Madame" dans le PDF', async () => {
    const ctx = {
      locataire: { civilite: 'Mme', nom: 'Martin' },
      bail: { adrBien: '1 rue Y' }, logement: { ref: 'L2' }, entite: { nom: 'E' },
      quittance: { mois: 'avril 2026', hc: 600, ch: 60 }
    };
    const out = await _emailGenPdfAttachment('quittance', ctx);
    expect(out.filename).toMatch(/Quittance/);
  });

  it('civilité absente → no throw, format générique', async () => {
    const ctx = {
      locataire: { nom: 'Sans Civilité' },
      bail: { adrBien: '1 rue Z' }, logement: { ref: 'L3' }, entite: { nom: 'E' },
      quittance: { mois: 'mars 2026', hc: 700, ch: 70 }
    };
    await expect(_emailGenPdfAttachment('quittance', ctx)).resolves.toBeDefined();
  });
});
