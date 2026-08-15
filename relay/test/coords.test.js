import { describe, it, expect } from 'vitest';
import { mmToPt, rectFromJsPdf, fallbackAnchors, PDF_NATIVE } from '../public/sign/coords.js';

const A4_H_PT = 841.8897637795275; // 297mm en pt

describe('mmToPt', () => {
  it('convertit mm → pt (72/25.4)', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
    expect(mmToPt(0)).toBe(0);
  });
});

describe('rectFromJsPdf', () => {
  it('flippe Y (haut-gauche → bas-gauche) et convertit en pt', () => {
    const r = rectFromJsPdf({ x: 10, y: 20, w: 30, h: 40 }, A4_H_PT);
    expect(r.x).toBeCloseTo(mmToPt(10), 6);
    expect(r.width).toBeCloseTo(mmToPt(30), 6);
    expect(r.height).toBeCloseTo(mmToPt(40), 6);
    expect(r.y).toBeCloseTo(A4_H_PT - mmToPt(60), 6);
  });
});

describe('fallbackAnchors', () => {
  it('produit un paraphe par page côté locataire + une signature en dernière page', () => {
    const anchors = fallbackAnchors({ sigId: 'loc-0', side: 'locataire', totalPages: 3 });
    const paraphes = anchors.filter((a) => a.kind === 'paraphe');
    const sigs = anchors.filter((a) => a.kind === 'signature');
    expect(paraphes).toHaveLength(3);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].page).toBe(3);
    expect(paraphes[0].x).toBe(125);
    expect(paraphes.every((a) => a.sigId === 'loc-0')).toBe(true);
  });
  it('met la colonne paraphe bailleur à gauche (x=15)', () => {
    const anchors = fallbackAnchors({ sigId: 'bailleur-0', side: 'bailleur', totalPages: 1 });
    expect(anchors.find((a) => a.kind === 'paraphe').x).toBe(15);
  });
});
