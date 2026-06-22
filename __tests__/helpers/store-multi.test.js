import { describe, it, expect } from 'vitest'
import { createMultiStore } from '../../js/core/store-multi.js'

// Store espionné : hydrate renvoie une COPIE du db fourni (le merge tague les objets → ne pas polluer la
// source) ; upsert/remove/persistConfig/attach enregistrent leurs appels pour vérifier le routage.
function makeFakeStore(hydrateDb) {
  const calls = { upsert: [], remove: [], persistConfig: 0, attach: [] }
  return {
    calls,
    async hydrate() { return JSON.parse(JSON.stringify(hydrateDb)) },
    async upsert(coll, rec) { calls.upsert.push([coll, rec]) },
    async remove(coll, rec) { calls.remove.push([coll, rec]) },
    async persistConfig() { calls.persistConfig++ },
    attach(view) { calls.attach.push(view) },
  }
}

// Deux espaces : A = propre (mine), B = tiers (SCI octroyée). Collisions volontaires de réf logement et de
// clé baux ('L1') + une config tierce (params/assurances 'cfgB') qui ne doit JAMAIS fuiter de B vers le merge.
function setup() {
  const storeA = makeFakeStore({
    entites: [{ nom: 'SCI A', immeubles: [{ nom: 'IA' }] }],
    logements: [{ ref: 'L1', loyer: 700 }],
    mouvements: [{ id: 1, lib: 'Loyer A' }],
    baux: { L1: { ref: 'L1', hc: 700 } },
    candidats: [{ id: 11, nom: 'CandA' }],
    mrh: [{ id: 'mA', compagnie: 'AXA' }],
    params: { theme: 'dark' },
    assurances: [{ id: 'cfgA' }],   // collection legacy portée par la CONFIG (PAS table-backée)
    auditTrail: [{ a: 1 }],
  })
  const storeB = makeFakeStore({
    entites: [{ nom: 'SCI B', immeubles: [{ nom: 'IB' }] }],
    logements: [{ ref: 'L1', loyer: 500 }],   // collision de réf avec A
    mouvements: [{ id: 2, lib: 'Loyer B' }],
    baux: { L1: { ref: 'L1', hc: 500 } },     // collision de clé avec A
    candidats: [{ id: 22, nom: 'CandB' }],
    params: { theme: 'light' },               // config d'un AUTRE owner → ne doit PAS écraser
    assurances: [{ id: 'cfgB' }],             // config tierce → ne doit PAS fuiter
  })
  let live = {}
  const multi = createMultiStore({
    espaces: [{ espaceId: 'A', ownerId: 'oA', mine: true }, { espaceId: 'B', ownerId: 'oB', mine: false }],
    makeStore: (espaceId) => (espaceId === 'A' ? storeA : storeB),
    getDB: () => live,
  })
  return { multi, storeA, storeB, setLive: (db) => { live = db } }
}

describe('createMultiStore — fusion multi-espace', () => {
  it('fusionne les collections par-SCI (tables) et tague _espaceId, immeubles nested compris', async () => {
    const db = await setup().multi.hydrate()
    expect(db.entites).toHaveLength(2)
    expect(db.entites.map(e => e._espaceId).sort()).toEqual(['A', 'B'])
    expect(db.entites.find(e => e.nom === 'SCI A').immeubles[0]._espaceId).toBe('A')
    expect(db.logements).toHaveLength(2)
    expect(db.logements.every(l => l._espaceId)).toBe(true)
    expect(db.mouvements.map(m => m._espaceId).sort()).toEqual(['A', 'B'])
    expect(db.candidats).toHaveLength(2)            // candidats = table par-SCI → fusionné
    expect(db.mrh).toHaveLength(1)                  // mrh (table assurances) : seulement A
    expect(db.mrh[0]._espaceId).toBe('A')
  })

  it('baux : collision de réf désambiguïsée par @@espaceId (own garde la clé nue), chaque bail tagué', async () => {
    const db = await setup().multi.hydrate()
    expect(Object.keys(db.baux).sort()).toEqual(['L1', 'L1@@B'])
    expect(db.baux.L1._espaceId).toBe('A')
    expect(db.baux.L1.hc).toBe(700)
    expect(db.baux['L1@@B']._espaceId).toBe('B')
    expect(db.baux['L1@@B'].hc).toBe(500)
  })

  it('config (params + collections config-borne) vient UNIQUEMENT de l\'espace propre — pas de fuite tierce', async () => {
    const db = await setup().multi.hydrate()
    expect(db.params).toEqual({ theme: 'dark' })       // pas 'light' (B ignoré)
    expect(db.assurances).toEqual([{ id: 'cfgA' }])    // config-borne (≠ table) → own only
    expect(db.auditTrail).toEqual([{ a: 1 }])
    expect(JSON.stringify(db)).not.toContain('cfgB')   // rien de la config de B
  })

  it('upsert/remove routent vers le store de rec._espaceId + rafraîchissent ses résolveurs (attach)', async () => {
    const { multi, storeA, storeB, setLive } = setup()
    setLive({ logements: [{ ref: 'L1', _espaceId: 'B' }] })
    await multi.upsert('logements', { ref: 'L9', _espaceId: 'B' })
    expect(storeB.calls.upsert).toHaveLength(1)
    expect(storeA.calls.upsert).toHaveLength(0)
    expect(storeB.calls.attach).toHaveLength(1)
    expect(storeB.calls.attach[0].logements).toEqual([{ ref: 'L1', _espaceId: 'B' }])
    await multi.remove('mouvements', { id: 1, _espaceId: 'A' })
    expect(storeA.calls.remove).toHaveLength(1)
    expect(storeB.calls.remove).toHaveLength(0)
  })

  it('upsert SANS _espaceId route vers l\'espace propre (défaut D2)', async () => {
    const { multi, storeA, storeB } = setup()
    await multi.upsert('logements', { ref: 'L9' })
    expect(storeA.calls.upsert).toHaveLength(1)
    expect(storeB.calls.upsert).toHaveLength(0)
  })

  it('persistConfig écrit uniquement dans l\'espace propre', async () => {
    const { multi, storeA, storeB } = setup()
    await multi.persistConfig({ params: { x: 1 } })
    expect(storeA.calls.persistConfig).toBe(1)
    expect(storeB.calls.persistConfig).toBe(0)
  })

  it('N=1 (un seul espace) : équivaut au mono — pas de suffixe de clé, config présente, écritures routées', async () => {
    const storeA = makeFakeStore({
      entites: [{ nom: 'SCI A' }], logements: [{ ref: 'L1' }], baux: { L1: { ref: 'L1' } }, params: { theme: 'dark' },
    })
    const multi = createMultiStore({
      espaces: [{ espaceId: 'A', ownerId: 'oA', mine: true }], makeStore: () => storeA, getDB: () => ({}),
    })
    const db = await multi.hydrate()
    expect(Object.keys(db.baux)).toEqual(['L1'])     // pas de suffixe @@
    expect(db.params).toEqual({ theme: 'dark' })
    expect(db.entites[0]._espaceId).toBe('A')
    await multi.upsert('logements', { ref: 'L2' })
    expect(storeA.calls.upsert).toHaveLength(1)
  })

  it('B1 — la vue de l\'espace PROPRE inclut les enregistrements NEUFS non tagués (les tiers, non)', async () => {
    const { multi, storeA, storeB, setLive } = setup()
    setLive({ logements: [
      { ref: 'L1', _espaceId: 'A' },   // hydraté (tagué propre)
      { ref: 'LNEUF' },                // créé par l'app → PAS de tag
      { ref: 'L1', _espaceId: 'B' },   // tiers
    ] })
    await multi.upsert('mouvements', { id: 1, _espaceId: 'A' })
    expect(storeA.calls.attach.at(-1).logements.map(l => l.ref).sort()).toEqual(['L1', 'LNEUF'])
    await multi.upsert('mouvements', { id: 2, _espaceId: 'B' })
    expect(storeB.calls.attach.at(-1).logements.map(l => l.ref)).toEqual(['L1'])   // jamais le neuf non tagué
  })

  it('B1 (bout-en-bout) — mouvement sur un logement NEUF non tagué : INSÉRÉ, pas skippé (comme le mono)', async () => {
    // Store qui RÉSOUT la FK comme le vrai mapToRow : un mouvement n'est inséré que si son logement parent
    // figure dans la dernière vue attachée ; sinon "skipped" (mapToRow renvoie null). Avant le fix B1, le
    // logement neuf non tagué était exclu de la vue → skip en boucle = perte de sync silencieuse.
    let view = {}
    const store = {
      skipped: [], inserted: [],
      async hydrate() { return { logements: [], mouvements: [] } },
      attach(v) { view = v || {} },
      async upsert(coll, rec) {
        if (coll === 'mouvements' && !(view.logements || []).some(l => l.ref === rec.logementRef)) { store.skipped.push(rec); return { status: 'skipped' } }
        store.inserted.push(rec); return { status: 'inserted' }
      },
      async remove() {}, async persistConfig() {},
    }
    let live = {}
    const multi = createMultiStore({ espaces: [{ espaceId: 'A', ownerId: 'oA', mine: true }], makeStore: () => store, getDB: () => live })
    await multi.hydrate()
    live = { logements: [{ ref: 'LNEUF' }], mouvements: [] }                  // l'app crée un logement (non tagué)
    const r = await multi.upsert('mouvements', { id: 1, logementRef: 'LNEUF' })   // puis un mouvement dessus (défaut propre)
    expect(r.status).toBe('inserted')
    expect(store.skipped).toHaveLength(0)
  })

  it('I4 — own itéré en premier quel que soit l\'ordre passé : le bail PROPRE garde la clé nue', async () => {
    const storeB = makeFakeStore({ baux: { L1: { ref: 'L1', hc: 500 } } })   // tiers
    const storeA = makeFakeStore({ baux: { L1: { ref: 'L1', hc: 700 } } })   // propre
    const multi = createMultiStore({
      espaces: [{ espaceId: 'B', ownerId: 'oB', mine: false }, { espaceId: 'A', ownerId: 'oA', mine: true }],  // own EN SECOND
      makeStore: (id) => (id === 'A' ? storeA : storeB), getDB: () => ({}),
    })
    const db = await multi.hydrate()
    expect(db.baux.L1._espaceId).toBe('A')         // le propre garde la clé nue malgré l'ordre
    expect(db.baux.L1.hc).toBe(700)
    expect(db.baux['L1@@B']._espaceId).toBe('B')   // le tiers est suffixé
  })

  it('I2 — écriture baux : la clé désambiguïsée @@ est ramenée à la réf nue pour le store cible', async () => {
    const { multi, storeB } = setup()
    await multi.upsert('baux', { __key: 'L1@@B', ref: 'L1', hc: 500, _espaceId: 'B' })
    expect(storeB.calls.upsert).toHaveLength(1)
    expect(storeB.calls.upsert[0][1].__key).toBe('L1')   // réf NUE, jamais 'L1@@B'
    await multi.remove('baux', { __key: 'L1@@B', ref: 'L1', _espaceId: 'B' })
    expect(storeB.calls.remove[0][1].__key).toBe('L1')
    // hors collision : la clé nue passe inchangée
    await multi.upsert('baux', { __key: 'L9', ref: 'L9', _espaceId: 'B' })
    expect(storeB.calls.upsert[1][1].__key).toBe('L9')
  })
})
