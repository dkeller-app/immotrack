import { describe, it, expect } from 'vitest';
import { buildRemoteSigIdMap, relayComputeSigId } from './bail-sign-sigid.js';

describe('buildRemoteSigIdMap', () => {
  it('tous distants → loc-0, loc-1, …', () => {
    expect(buildRemoteSigIdMap([{}, {}])).toEqual(['loc-0', 'loc-1']);
  });
  it('un présentiel avant un distant → le distant reste loc-0 (pas loc-1)', () => {
    expect(buildRemoteSigIdMap([{ presentiel: true }, {}])).toEqual([null, 'loc-0']);
  });
  it('présentiel intercalé → rangs distants séquentiels, présentiel à null', () => {
    expect(buildRemoteSigIdMap([{}, { presentiel: true }, {}])).toEqual(['loc-0', null, 'loc-1']);
  });
  it('liste vide / non-array → []', () => {
    expect(buildRemoteSigIdMap([])).toEqual([]);
    expect(buildRemoteSigIdMap(undefined)).toEqual([]);
  });
});

describe('alignement avec computeSigId du relais (non-régression cross-composant B1)', () => {
  it('chaque sigId distant de la map == computeSigId(liste distants, rang)', () => {
    const locataires = [{ presentiel: true }, {}, { presentiel: true }, {}]; // distants aux index 1 et 3
    const map = buildRemoteSigIdMap(locataires);
    // Liste envoyée au relais = distants uniquement, role 'locataire', dans l'ordre.
    const remote = locataires.filter(l => !(l && l.presentiel)).map(() => ({ role: 'locataire' }));
    let r = 0;
    locataires.forEach((l, i) => {
      if (l && l.presentiel) { expect(map[i]).toBeNull(); return; }
      expect(map[i]).toBe(relayComputeSigId(remote, r)); // loc-0 puis loc-1
      r++;
    });
  });
});
