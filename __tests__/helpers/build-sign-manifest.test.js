// __tests__/helpers/build-sign-manifest.test.js
import { describe, it, expect } from 'vitest';
import { buildSignManifest } from './build-sign-manifest.js';

describe('buildSignManifest', () => {
  it('stocke les ancres mm BRUTES (conversion mm→pt faite côté relais), garde sigId/kind/page/luApprouve', () => {
    const anchors = [
      { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 },
      { sigId: 'loc-0', kind: 'signature', page: 2, x: 15, y: 210, w: 90, h: 30, luApprouve: true }
    ];
    const m = buildSignManifest(anchors, 2);
    expect(m.v).toBe(1);
    expect(m.totalPages).toBe(2);
    expect(m.anchors).toHaveLength(2);
    // Aucune conversion : exactement les valeurs mm d'entrée (le relais convertira).
    const sig = m.anchors.find(a => a.kind === 'signature');
    expect(sig.x).toBe(15);
    expect(sig.y).toBe(210);
    expect(sig.w).toBe(90);
    expect(sig.h).toBe(30);
    expect(sig.luApprouve).toBe(true);
    expect(sig.sigId).toBe('loc-0');
    expect(sig.page).toBe(2);
    const par = m.anchors.find(a => a.kind === 'paraphe');
    expect(par.x).toBe(125);
    expect(par.y).toBe(279.5);
    expect(par.w).toBe(70);
    expect(par.h).toBe(14);
  });
  it('manifeste vide si pas d’ancres', () => {
    expect(buildSignManifest([]).anchors).toEqual([]);
  });
});
