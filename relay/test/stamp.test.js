import { describe, it, expect } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedInDoc } from '../public/sign/manifest.js';
import { dataUrlToBytes, stampSignature, paraphePagesFor } from '../public/sign/stamp.js';

// 1×1 PNG transparent valide.
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function makeDoc(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]); // A4 pt
  return doc;
}

describe('dataUrlToBytes', () => {
  it('décode un data URL PNG en octets', () => {
    const bytes = dataUrlToBytes(PNG_1x1);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
  });
});

describe('paraphePagesFor', () => {
  it('liste les pages à parapher du sigId (manifeste, dédupliquées + triées)', async () => {
    const doc = await makeDoc(2);
    embedInDoc(doc, {
      v: 1, totalPages: 2,
      anchors: [
        { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30 },
        { sigId: 'loc-0', kind: 'paraphe', page: 2, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'bailleur-0', kind: 'paraphe', page: 1, x: 15, y: 279.5, w: 70, h: 14 }
      ]
    });
    expect(paraphePagesFor(doc, { sigId: 'loc-0' })).toEqual([1, 2]);
    expect(paraphePagesFor(doc, { sigId: 'bailleur-0' })).toEqual([1]);
  });
  it('repli : toutes les pages quand pas de manifeste', async () => {
    const doc = await makeDoc(3);
    expect(paraphePagesFor(doc, { sigId: 'loc-0', side: 'locataire' })).toEqual([1, 2, 3]);
  });
});

describe('stampSignature (manifeste, deux tracés distincts)', () => {
  it('appose la signature une fois + un paraphe distinct par page', async () => {
    const doc = await makeDoc(2);
    embedInDoc(doc, {
      v: 1, totalPages: 2,
      anchors: [
        { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30, luApprouve: true },
        { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'loc-0', kind: 'paraphe', page: 2, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'bailleur-0', kind: 'signature', page: 2, x: 15, y: 210, w: 90, h: 30 }
      ]
    });
    const before = (await doc.save()).length;
    const res = await stampSignature(doc, {
      sigId: 'loc-0',
      signaturePngDataUrl: PNG_1x1,
      paraphesByPage: { 1: PNG_1x1, 2: PNG_1x1 },
      mentionLines: ['Signé électroniquement', 'par Jean Dupont (locataire)']
    }, { rgb });
    expect(res.stamped).toBe(3); // 1 signature + 2 paraphes (pas l'ancre bailleur-0)
    const after = (await doc.save()).length;
    expect(after).toBeGreaterThan(before);
  });

  it('saute une ancre paraphe sans image de page correspondante', async () => {
    const doc = await makeDoc(2);
    embedInDoc(doc, {
      v: 1, totalPages: 2,
      anchors: [
        { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'loc-0', kind: 'paraphe', page: 2, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30 }
      ]
    });
    const res = await stampSignature(doc, {
      sigId: 'loc-0', signaturePngDataUrl: PNG_1x1,
      paraphesByPage: { 1: PNG_1x1 }, mentionLines: [] // page 2 non paraphée
    }, { rgb });
    expect(res.stamped).toBe(2); // paraphe p1 + signature p2
    expect(res.skipped).toBe(1); // paraphe p2 sans image
  });

  it('ignore une ancre dont la page dépasse le document', async () => {
    const doc = await makeDoc(1);
    embedInDoc(doc, {
      v: 1, totalPages: 1,
      anchors: [{ sigId: 'loc-0', kind: 'paraphe', page: 9, x: 125, y: 279.5, w: 70, h: 14 }]
    });
    const res = await stampSignature(doc, {
      sigId: 'loc-0', signaturePngDataUrl: PNG_1x1, paraphesByPage: { 9: PNG_1x1 }, mentionLines: []
    }, { rgb });
    expect(res.stamped).toBe(0);
    expect(res.skipped).toBe(1);
  });
});

describe('stampSignature (repli sans manifeste)', () => {
  it('tamponne totalPages paraphes (un par page) + 1 signature', async () => {
    const doc = await makeDoc(3);
    const res = await stampSignature(doc, {
      sigId: 'loc-0', side: 'locataire',
      signaturePngDataUrl: PNG_1x1,
      paraphesByPage: { 1: PNG_1x1, 2: PNG_1x1, 3: PNG_1x1 },
      mentionLines: ['x']
    }, { rgb });
    expect(res.stamped).toBe(4); // 3 paraphes + 1 signature
    expect(res.usedFallback).toBe(true);
  });
});
