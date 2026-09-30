import { describe, it, expect } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedInDoc } from '../public/sign/manifest.js';
import { dataUrlToBytes, stampSignature, paraphePagesFor, readingPlanFor } from '../public/sign/stamp.js';

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

describe('readingPlanFor (document défilant)', () => {
  it('cases de paraphe du signataire en % de la page + dernière page du BAIL (annexes au-delà)', async () => {
    const doc = await makeDoc(5);   // 2 pages de bail + page de garde + 2 pages d'annexes
    embedInDoc(doc, {
      v: 1, totalPages: 5,
      anchors: [
        { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
        { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30 },
        { sigId: 'bailleur-0', kind: 'paraphe', page: 2, x: 15, y: 279.5, w: 70, h: 14 }
      ]
    });
    const plan = readingPlanFor(doc, { sigId: 'loc-0' });
    expect(plan.paraphes.map((a) => a.page)).toEqual([1]);            // dédupliqué
    expect(plan.paraphes[0].left).toBeCloseTo(125 / 210);
    expect(plan.paraphes[0].top).toBeCloseTo(279.5 / 297);
    expect(plan.signatures.map((a) => a.page)).toEqual([2]);
    expect(plan.lastBailPage).toBe(2);                                // ancre la plus basse, tous signataires
    expect(plan.pageCount).toBe(5);
  });
  it('ancres hors page ignorées ; aucune ancre pour ce signataire → listes vides', async () => {
    const doc = await makeDoc(2);
    embedInDoc(doc, { v: 1, totalPages: 2, anchors: [
      { sigId: 'bailleur-0', kind: 'paraphe', page: 1, x: 15, y: 279.5, w: 70, h: 14 },
      { sigId: 'loc-0', kind: 'paraphe', page: 9, x: 125, y: 279.5, w: 70, h: 14 }
    ] });
    const plan = readingPlanFor(doc, { sigId: 'loc-0' });
    expect(plan.paraphes).toEqual([]);
    expect(plan.signatures).toEqual([]);
    expect(plan.lastBailPage).toBe(1);
  });
  it('annexes DÉCLARÉES par l\'app (manifeste.annexes) : 1re page d\'annexe respectée + liste restituée', async () => {
    const doc = await makeDoc(6);
    const annexes = { from: 4, items: [{ label: 'DPE', statut: 'joint', docName: 'dpe.pdf', from: 5, to: 6 }, { label: 'Électricité', statut: 'hors_app' }] };
    embedInDoc(doc, { v: 1, totalPages: 6, annexes, anchors: [
      { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
      { sigId: 'loc-0', kind: 'signature', page: 3, x: 110, y: 210, w: 90, h: 30 }
    ] });
    const plan = readingPlanFor(doc, { sigId: 'loc-0' });
    expect(plan.lastBailPage).toBe(3);
    expect(plan.annexes.items.map((i) => i.statut)).toEqual(['joint', 'hors_app']);
  });
  it('le manifeste PRÉVAUT : ancres jusqu\'à la page 2, annexes à partir de la page 4 → bail = pages 1-3', async () => {
    const doc = await makeDoc(6);
    embedInDoc(doc, { v: 1, totalPages: 6, annexes: { from: 4, items: [{ label: 'DPE', statut: 'joint', from: 5, to: 6 }] }, anchors: [
      { sigId: 'loc-0', kind: 'signature', page: 2, x: 110, y: 210, w: 90, h: 30 }
    ] });
    expect(readingPlanFor(doc, { sigId: 'loc-0' }).lastBailPage).toBe(3);
  });
  it('annexes.from incohérent (avant une ancre) : ignoré, déduction par les ancres', async () => {
    const doc = await makeDoc(4);
    embedInDoc(doc, { v: 1, totalPages: 4, annexes: { from: 2, items: [] }, anchors: [
      { sigId: 'loc-0', kind: 'signature', page: 3, x: 110, y: 210, w: 90, h: 30 }
    ] });
    expect(readingPlanFor(doc, { sigId: 'loc-0' }).lastBailPage).toBe(3);
  });
  it("ordre de lecture : sigStart = 1re page de signature, annexStart = 1re page après la dernière case", async () => {
    const doc = await makeDoc(8);   // bail 1-3 (3 = signatures), annexes 4-8
    embedInDoc(doc, { v: 1, totalPages: 8, annexes: { from: 6, items: [] }, anchors: [
      { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
      { sigId: 'loc-0', kind: 'paraphe', page: 2, x: 125, y: 279.5, w: 70, h: 14 },
      { sigId: 'bailleur-0', kind: 'signature', page: 3, x: 15, y: 210, w: 90, h: 30 },
      { sigId: 'loc-0', kind: 'signature', page: 3, x: 110, y: 210, w: 90, h: 30 }
    ] });
    const plan = readingPlanFor(doc, { sigId: 'loc-0' });
    expect(plan.sigStart).toBe(3);
    expect(plan.lastAnchorPage).toBe(3);
    expect(plan.annexStart).toBe(4);   // annexes du bail (4-5) ET DDT (6-8) : tout ce qui suit la dernière case
    expect(plan.lastBailPage).toBe(5); // inchangé (compat)
  });
  it('aucune page après la dernière case → annexStart 0', async () => {
    const doc = await makeDoc(2);
    embedInDoc(doc, { v: 1, totalPages: 2, anchors: [{ sigId: 'loc-0', kind: 'signature', page: 2, x: 110, y: 210, w: 90, h: 30 }] });
    const plan = readingPlanFor(doc, { sigId: 'loc-0' });
    expect(plan.annexStart).toBe(0);
    expect(plan.sigStart).toBe(2);
  });
  it('repli sans manifeste : toutes les pages sont du bail', async () => {
    const doc = await makeDoc(3);
    const plan = readingPlanFor(doc, { sigId: 'loc-0', side: 'locataire' });
    expect(plan.paraphes.map((a) => a.page)).toEqual([1, 2, 3]);
    expect(plan.lastBailPage).toBe(3);
  });
});

describe('stampSignature — un même paraphe apposé sur plusieurs pages', () => {
  it("n'embarque l'image qu'une fois (cache par image)", async () => {
    const doc = await makeDoc(3);
    embedInDoc(doc, { v: 1, totalPages: 3, anchors: [1, 2, 3].map((page) => ({ sigId: 'loc-0', kind: 'paraphe', page, x: 125, y: 279.5, w: 70, h: 14 })) });
    let embeds = 0; const orig = doc.embedPng.bind(doc); doc.embedPng = async (b) => { embeds++; return orig(b); };
    const res = await stampSignature(doc, { sigId: 'loc-0', signaturePngDataUrl: null, paraphesByPage: { 1: PNG_1x1, 2: PNG_1x1, 3: PNG_1x1 } }, { rgb });
    expect(res.stamped).toBe(3);
    expect(embeds).toBe(1);
  });
});
