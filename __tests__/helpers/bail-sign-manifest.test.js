// __tests__/helpers/bail-sign-manifest.test.js
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { encode, decode, readFromDoc, embedInDoc, SENTINEL } from './bail-sign-manifest.js';

const sample = { v: 1, totalPages: 2, anchors: [
  { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30, luApprouve: true },
  { sigId: 'loc-0', kind: 'paraphe',   page: 1, x: 125, y: 279.5, w: 70, h: 14 }
] };

describe('encode/decode', () => {
  it('round-trip', () => {
    expect(encode(sample).startsWith(SENTINEL)).toBe(true);
    expect(decode(encode(sample))).toEqual(sample);
  });
  it('UTF-8', () => {
    const m = { v: 1, totalPages: 1, anchors: [], note: 'éàü' };
    expect(decode(encode(m))).toEqual(m);
  });
  it('decode défensif → null', () => {
    for (const bad of ['hello world', SENTINEL + '!!!pas-base64', '', undefined]) {
      expect(decode(bad)).toBeNull();
    }
  });
});

describe('embedInDoc/readFromDoc (persistance octets)', () => {
  it('survit à un save/load pdf-lib', async () => {
    const doc = await PDFDocument.create();
    doc.addPage(); doc.addPage();
    embedInDoc(doc, sample);
    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(readFromDoc(reloaded)).toEqual(sample);
  });
  it('null si pas de manifeste', async () => {
    const doc = await PDFDocument.create(); doc.addPage();
    const bytes = await doc.save();
    expect(readFromDoc(await PDFDocument.load(bytes))).toBeNull();
  });
});
