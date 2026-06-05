// __tests__/helpers/bail-sign-coords.test.js
import { describe, it, expect } from 'vitest';
import { mmToPt, rectFromJsPdf, fallbackAnchors, PDF_NATIVE } from './bail-sign-coords.js';

const A4_H_PT = 841.8897637795275; // 297 mm en points

describe('mmToPt', () => {
  it('25.4 mm = 72 pt', () => { expect(mmToPt(25.4)).toBeCloseTo(72, 6); });
  it('0 mm = 0 pt', () => { expect(mmToPt(0)).toBe(0); });
});

describe('rectFromJsPdf (Y-flip)', () => {
  it('convertit et inverse Y', () => {
    const r = rectFromJsPdf({ x: 10, y: 20, w: 30, h: 40 }, A4_H_PT);
    expect(r.x).toBeCloseTo(mmToPt(10), 6);
    expect(r.width).toBeCloseTo(mmToPt(30), 6);
    expect(r.height).toBeCloseTo(mmToPt(40), 6);
    expect(r.y).toBeCloseTo(A4_H_PT - mmToPt(60), 6); // y+h = 60
  });
  it('cas signature référence {x:15,y:210,w:90,h:30}', () => {
    const r = rectFromJsPdf({ x: 15, y: 210, w: 90, h: 30 }, A4_H_PT);
    expect(r.x).toBeCloseTo(mmToPt(15), 6);
    expect(r.y).toBeCloseTo(A4_H_PT - mmToPt(240), 6);
  });
  it('cas paraphe référence {x:15,y:279.5,w:70,h:14}', () => {
    const r = rectFromJsPdf({ x: 15, y: 279.5, w: 70, h: 14 }, A4_H_PT);
    expect(r.y).toBeCloseTo(A4_H_PT - mmToPt(293.5), 6);
  });
});

describe('fallbackAnchors', () => {
  it('locataire : colonne droite x=125, signature sur dernière page', () => {
    const a = fallbackAnchors({ sigId: 'loc-0', side: 'locataire', totalPages: 3 });
    const paraphes = a.filter(x => x.kind === 'paraphe');
    const sig = a.find(x => x.kind === 'signature');
    expect(paraphes).toHaveLength(3);
    expect(paraphes[0].x).toBe(125);
    expect(sig.page).toBe(3);
    expect(a.every(x => x.sigId === 'loc-0')).toBe(true);
  });
  it('bailleur : colonne gauche x=15', () => {
    const a = fallbackAnchors({ sigId: 'bailleur-0', side: 'bailleur', totalPages: 1 });
    expect(a.find(x => x.kind === 'paraphe').x).toBe(15);
  });
});
