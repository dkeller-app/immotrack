import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { encode, decode, readFromDoc, embedInDoc, SENTINEL } from '../public/sign/manifest.js';

const sample = {
  v: 1,
  totalPages: 2,
  anchors: [
    { sigId: 'loc-0', kind: 'signature', page: 2, x: 120, y: 210, w: 90, h: 30, luApprouve: true },
    { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 }
  ]
};

describe('encode/decode', () => {
  it('fait un aller-retour fidèle', () => {
    const s = encode(sample);
    expect(s.startsWith(SENTINEL)).toBe(true);
    expect(decode(s)).toEqual(sample);
  });
  it('supporte les accents (UTF-8)', () => {
    const m = { v: 1, totalPages: 1, anchors: [], note: 'éàü' };
    expect(decode(encode(m))).toEqual(m);
  });
  it('retourne null sur chaîne non préfixée ou corrompue', () => {
    expect(decode('hello world')).toBeNull();
    expect(decode(SENTINEL + '!!!pas-du-base64-valide')).toBeNull();
    expect(decode('')).toBeNull();
    expect(decode(undefined)).toBeNull();
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
  it('readFromDoc retourne null si pas de manifeste', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(readFromDoc(reloaded)).toBeNull();
  });
});
