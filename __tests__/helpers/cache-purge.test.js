import { describe, it, expect } from 'vitest'
import { MIRROR_TAG_KEY, mirrorTag, classifyMirrorTag, listIdbOnlyBinaries, authStorageKeys } from '../../js/core/cache-purge.js'

// P1.3 — volet RGPD de l'audit sync cloud 2026-07-12 (cause C-C : miroir localStorage + IndexedDB
// jamais purgés → un révoqué garde une copie lisible à vie). Module PUR : la décision de purge est
// testée ici ; l'exécution (localStorage/indexedDB) vit dans supabase-entry.js (smoke test navigateur).

const U = '11111111-1111-1111-1111-111111111111'
const E = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('mirrorTag / classifyMirrorTag — tag {userId, espaceId} du miroir localStorage', () => {
  it('expose une clé de tag stable (contrat avec supabase-entry)', () => {
    expect(MIRROR_TAG_KEY).toBe('immotrack_v4_tag')
  })

  it('round-trip : le tag écrit au login est classé same pour le même couple user/espace', () => {
    expect(classifyMirrorTag(mirrorTag(U, E), U, E)).toBe('same')
  })

  it('un AUTRE utilisateur → other-user (purge inconditionnelle : données d\'autrui, RGPD)', () => {
    expect(classifyMirrorTag(mirrorTag(U, E), '22222222-2222-2222-2222-222222222222', E)).toBe('other-user')
  })

  it('même utilisateur, autre espace propre → other-espace (miroir périmé mais binaires du même user)', () => {
    expect(classifyMirrorTag(mirrorTag(U, E), U, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe('other-espace')
  })

  it('pas de tag (miroir d\'avant P1.3, ou jamais connecté) → untagged', () => {
    expect(classifyMirrorTag(null, U, E)).toBe('untagged')
    expect(classifyMirrorTag(undefined, U, E)).toBe('untagged')
    expect(classifyMirrorTag('', U, E)).toBe('untagged')
  })

  it('tag corrompu (JSON invalide / champs manquants) → untagged (fail-safe : jamais de throw)', () => {
    expect(classifyMirrorTag('{oops', U, E)).toBe('untagged')
    expect(classifyMirrorTag('42', U, E)).toBe('untagged')
    expect(classifyMirrorTag(JSON.stringify({ userId: U }), U, E)).toBe('untagged')
    expect(classifyMirrorTag(JSON.stringify({ espaceId: E }), U, E)).toBe('untagged')
  })
})

describe('authStorageKeys — clés localStorage du token de session à purger (BUG-LOGIN-DOUBLE)', () => {
  // persistSession:true fait vivre le token dans localStorage sous une clé DÉTERMINISTE (storageKey
  // explicite) → au logout ET au changement de compte, il DOIT partir (sinon un token valide reste
  // lisible sur la machine, aggravation RGPD au-delà du miroir). supabase-js peut aussi écrire un
  // `${storageKey}-code-verifier` (flux PKCE / Google SSO) → on purge les deux.
  it('renvoie la clé du token + la clé code-verifier PKCE', () => {
    expect(authStorageKeys('immo-supabase-auth')).toEqual(['immo-supabase-auth', 'immo-supabase-auth-code-verifier'])
  })

  it('fail-safe : storageKey absent/vide → [] (rien à purger, jamais throw)', () => {
    expect(authStorageKeys(null)).toEqual([])
    expect(authStorageKeys(undefined)).toEqual([])
    expect(authStorageKeys('')).toEqual([])
    expect(() => authStorageKeys(42)).not.toThrow()
    expect(authStorageKeys(42)).toEqual([])
  })
})

describe('listIdbOnlyBinaries — binaires vivants présents SEULEMENT en IndexedDB (pas de copie Storage)', () => {
  it('DB vide / null → [] (purge autorisée)', () => {
    expect(listIdbOnlyBinaries(null)).toEqual([])
    expect(listIdbOnlyBinaries({})).toEqual([])
  })

  it('documents : idbKey sans cloudKey = idb-only ; avec cloudKey, tombstoné ou sans idbKey = non listé', () => {
    const db = { documents: [
      { id: 1, idbKey: 'ph_a' },                          // idb-only → listé
      { id: 2, idbKey: 'ph_b', cloudKey: 'ESP/files/ph_b' }, // copie Storage → non
      { id: 3, idbKey: 'ph_c', _deleted: true },          // tombstone → non
      { id: 4 },                                          // pas de binaire local → non
    ] }
    expect(listIdbOnlyBinaries(db)).toEqual([{ kind: 'document', id: 1, idbKey: 'ph_a' }])
  })

  it('photos EDL : couvre pièces (E/S), clés (E/S), compteurs et mobilier — même périmètre que _edlPreloadPhotos', () => {
    const db = { edl: [{
      id: 9,
      pieces: [{ elements: [{ photosE: [{ idbKey: 'p1' }], photosS: [{ idbKey: 'p2', cloudKey: 'x' }] }] }],
      cles: [{ photos: [{ idbKey: 'p3' }], photosS: [{ idbKey: 'p4' }] }],
      compteursPhotos: { elec: [{ idbKey: 'p5' }], eauCS: [{ idbKey: 'p6', cloudKey: 'y' }] },
      mobilier: { elements: [{ photosE: [{ idbKey: 'p7' }], photosS: [] }] },
    }] }
    expect(listIdbOnlyBinaries(db).map(b => b.idbKey).sort()).toEqual(['p1', 'p3', 'p4', 'p5', 'p7'])
    expect(listIdbOnlyBinaries(db).every(b => b.kind === 'edl-photo' && b.id === 9)).toBe(true)
  })

  it('un EDL tombstoné n\'est pas parcouru (ses photos ne bloquent pas la purge)', () => {
    const db = { edl: [{ id: 9, _deleted: true, pieces: [{ elements: [{ photosE: [{ idbKey: 'p1' }] }] }] }] }
    expect(listIdbOnlyBinaries(db)).toEqual([])
  })

  it('robustesse : structures partielles / null ne throwent jamais', () => {
    const db = { documents: [null, {}], edl: [null, { id: 1 }, { id: 2, pieces: [null], cles: [null], compteursPhotos: null, mobilier: {} }] }
    expect(() => listIdbOnlyBinaries(db)).not.toThrow()
    expect(listIdbOnlyBinaries(db)).toEqual([])
  })
})
