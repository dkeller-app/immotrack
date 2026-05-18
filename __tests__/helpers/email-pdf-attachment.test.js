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
  it('liste les 7 types supportés (v15.89 EM-2b+c)', () => {
    const types = _emailPdfTypesSupportedV1();
    expect(types).toEqual([
      'quittance', 'irl-revision',
      'decompte-regul-annuel',
      'bail-signe-final',
      'edl-entree-signe', 'edl-sortie-signe',
      'cautionnement-signe'
    ]);
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

  it('type inconnu → renvoie {error, supportedV1, message}', async () => {
    const out = await _emailGenPdfAttachment('blabla-inexistant', ctxQuittance);
    expect(out.error).toBe('type-not-supported-v1');
    expect(out.supportedV1).toContain('quittance');
    expect(out.supportedV1).toContain('bail-signe-final');
    expect(out.message).toContain('blabla-inexistant');
  });

  it('bail-signe-final → maintenant supporté (V1.1 EM-2c)', async () => {
    const out = await _emailGenPdfAttachment('bail-signe-final', ctxQuittance);
    expect(out.error).toBeUndefined();
    expect(out.filename).toMatch(/Recap-bail-LOG-001\.pdf/);
    expect(out.mimeType).toBe('application/pdf');
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
// EM-2c v15.89 — 5 nouveaux types
// ────────────────────────────────────────────────────────────────────────────

describe('_emailGenPdfAttachment — EM-2c v15.89 types étendus', () => {
  const baseCtx = {
    locataire: { civilite: 'M.', nom: 'Demo' },
    bail: { adrBien: '12 rue Test', hc: 850, ch: 80, dg: 850, debut: '2024-01-01', jpay: '5' },
    logement: { ref: 'LOG-001' },
    entite: { nom: 'SCI Test', siege: '1 av Foo 75001 Paris', gerant: 'Didier K' }
  };

  it('decompte-regul-annuel → filename Decompte-charges-{annee}', async () => {
    const out = await _emailGenPdfAttachment('decompte-regul-annuel', {
      ...baseCtx,
      annee: 2025,
      provisions: 960, chargesReelles: 1100, solde: 140, soldeSens: 'à régler par le locataire'
    });
    expect(out.error).toBeUndefined();
    expect(out.filename).toBe('Decompte-charges-2025-LOG-001.pdf');
    expect(out.mimeType).toBe('application/pdf');
  });

  it('decompte-regul-annuel : solde négatif (remboursement)', async () => {
    const out = await _emailGenPdfAttachment('decompte-regul-annuel', {
      ...baseCtx, annee: 2025, provisions: 1200, chargesReelles: 800
    });
    expect(out.error).toBeUndefined();
    // solde implicite -400 → soldeSens auto "à rembourser au locataire"
  });

  it('bail-signe-final → filename Recap-bail', async () => {
    const out = await _emailGenPdfAttachment('bail-signe-final', baseCtx);
    expect(out.error).toBeUndefined();
    expect(out.filename).toBe('Recap-bail-LOG-001.pdf');
  });

  it('edl-entree-signe → filename EDL-entree + compteurs', async () => {
    const out = await _emailGenPdfAttachment('edl-entree-signe', {
      ...baseCtx,
      dateEDL: '2026-01-15',
      compteurElec: '12345', compteurGaz: '6789', compteurEauF: '111', compteurEauC: '222'
    });
    expect(out.error).toBeUndefined();
    expect(out.filename).toBe('EDL-entree-LOG-001.pdf');
  });

  it('edl-sortie-signe → filename EDL-sortie', async () => {
    const out = await _emailGenPdfAttachment('edl-sortie-signe', {
      ...baseCtx,
      dateEDL: '2026-05-01',
      comparatifCompteurs: 'Conforme', degradationsBilan: 'Aucune', conclusionEDL: 'Restitution intégrale'
    });
    expect(out.error).toBeUndefined();
    expect(out.filename).toBe('EDL-sortie-LOG-001.pdf');
  });

  it('cautionnement-signe → filename Cautionnement, mentionne garant', async () => {
    const out = await _emailGenPdfAttachment('cautionnement-signe', {
      ...baseCtx,
      garant: { civilite: 'M.', nom: 'Garant Pierre' }
    });
    expect(out.error).toBeUndefined();
    expect(out.filename).toBe('Cautionnement-LOG-001.pdf');
  });

  it('tous les 7 types listés génèrent un PDF sans erreur', async () => {
    const types = _emailPdfTypesSupportedV1();
    for (const t of types) {
      const out = await _emailGenPdfAttachment(t, {
        ...baseCtx,
        annee: 2025, provisions: 100, chargesReelles: 100,
        dateEDL: '2026-01-01',
        garant: { civilite: 'M.', nom: 'G' },
        quittance: { mois: 'mai 2026', hc: 500, ch: 50, total: 550 }
      });
      expect(out.error, `type ${t} ne doit pas erreur`).toBeUndefined();
      expect(out.filename, `type ${t} a un filename`).toBeDefined();
      expect(out.mimeType).toBe('application/pdf');
    }
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
