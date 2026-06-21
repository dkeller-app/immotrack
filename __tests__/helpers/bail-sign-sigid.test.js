import { describe, it, expect } from 'vitest';
import { buildRemoteSigIdMap, buildBailleurSigIdMap, relayComputeSigId } from './bail-sign-sigid.js';

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

describe('buildBailleurSigIdMap (D2a — bailleur à distance)', () => {
  it('tous distants → bailleur-0, bailleur-1, …', () => {
    expect(buildBailleurSigIdMap([{}, {}])).toEqual(['bailleur-0', 'bailleur-1']);
  });
  it('présentiel → null, ne consomme pas de rang', () => {
    expect(buildBailleurSigIdMap([{ presentiel: true }, {}])).toEqual([null, 'bailleur-0']);
  });
  it('exclu (ne signe pas) → null, ne consomme pas de rang', () => {
    expect(buildBailleurSigIdMap([{}, { exclu: true }, {}])).toEqual(['bailleur-0', null, 'bailleur-1']);
  });
  it('présentiel + exclu mêlés → rangs distants séquentiels', () => {
    expect(buildBailleurSigIdMap([{ presentiel: true }, { exclu: true }, {}, {}]))
      .toEqual([null, null, 'bailleur-0', 'bailleur-1']);
  });
  it('liste vide / non-array → []', () => {
    expect(buildBailleurSigIdMap([])).toEqual([]);
    expect(buildBailleurSigIdMap(undefined)).toEqual([]);
  });
});

describe('alignement combiné bailleurs+locataires avec computeSigId relais', () => {
  it('[bailleur, bailleur, loc, loc] distants → bailleur-0, bailleur-1, loc-0, loc-1', () => {
    const bailleurs = [{}, {}];
    const locataires = [{}, {}];
    const bMap = buildBailleurSigIdMap(bailleurs);
    const lMap = buildRemoteSigIdMap(locataires);
    // Liste relais = bailleurs distants PUIS locataires distants (ordre validé : bailleurs d'abord).
    const remote = [
      ...bailleurs.filter(b => !(b && (b.presentiel || b.exclu))).map(() => ({ role: 'bailleur' })),
      ...locataires.filter(l => !(l && l.presentiel)).map(() => ({ role: 'locataire' }))
    ];
    expect(bMap[0]).toBe(relayComputeSigId(remote, 0)); // bailleur-0
    expect(bMap[1]).toBe(relayComputeSigId(remote, 1)); // bailleur-1
    expect(lMap[0]).toBe(relayComputeSigId(remote, 2)); // loc-0
    expect(lMap[1]).toBe(relayComputeSigId(remote, 3)); // loc-1
  });
});
