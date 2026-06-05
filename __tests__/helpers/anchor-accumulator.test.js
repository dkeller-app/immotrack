// __tests__/helpers/anchor-accumulator.test.js
import { describe, it, expect } from 'vitest';
import { pushAnchor, makeAnchorAcc } from './anchor-accumulator.js';

describe('pushAnchor', () => {
  it('n’enregistre rien hors mode remoteSign', () => {
    const acc = makeAnchorAcc(false);
    pushAnchor(acc, { sigId: 'loc-0', kind: 'signature', page: 2, x: 15, y: 210, w: 90, h: 30 });
    expect(acc.anchors).toHaveLength(0);
  });
  it('enregistre en mode remoteSign avec tous les champs', () => {
    const acc = makeAnchorAcc(true);
    pushAnchor(acc, { sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 });
    expect(acc.anchors).toEqual([{ sigId: 'loc-0', kind: 'paraphe', page: 1, x: 125, y: 279.5, w: 70, h: 14 }]);
  });
  it('ignore un rect sans sigId (bloc non-signataire)', () => {
    const acc = makeAnchorAcc(true);
    pushAnchor(acc, { sigId: null, kind: 'signature', page: 1, x: 15, y: 210, w: 90, h: 30 });
    expect(acc.anchors).toHaveLength(0);
  });
});
