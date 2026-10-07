import { describe, it, expect } from 'vitest'
import { createMultiStore, inferEspaceOf, inferRattachementOf } from '../../js/core/store-multi.js'
import { createStoreSync } from '../../js/core/store-sync.js'
import { createSupabaseStore } from '../../js/core/store-supabase.js'

// Incident 05/10/2026 (fusion SCI SMARTOSAURUS) : un associé gestionnaire d'une SCI TIERCE (espace B,
// celui de la co-gérante) créait mouvements (import bancaire), documents et rappels d'agenda sur les
// lots de cette SCI → tout partait dans SON espace (A, défaut D2), invisible de B et rattaché à rien.
// Un enregistrement NEUF doit vivre dans l'espace de la fiche à laquelle il se rattache.

// DB fusionné tel que le produit createMultiStore.hydrate : A = espace propre, B = SCI tierce.
const dbFusionne = () => ({
  entites: [
    { nom: 'Didier Keller', _espaceId: 'A', immeubles: [{ nom: 'Strasbourg', _espaceId: 'A' }] },
    { nom: 'SCI SMARTOSAURUS', _espaceId: 'B', immeubles: [{ nom: 'Ferrette', _espaceId: 'B' }] },
  ],
  logements: [
    { ref: 'RDC gauche', entity: 'Didier Keller', _espaceId: 'A' },
    { ref: 'Ferrette - 101', entity: 'SCI SMARTOSAURUS', imm: 'Ferrette', _espaceId: 'B' },
    { ref: 'FERRETTE 001', entity: 'SCI SMARTOSAURUS', imm: 'Ferrette', _espaceId: 'B' },
  ],
  mouvements: [{ id: 10, qui: 'Ferrette - 101', date: '2026-07-01', _espaceId: 'B' }],
})

describe('inferEspaceOf — espace d\'un enregistrement neuf d\'après son rattachement (pur)', () => {
  const db = dbFusionne()

  it('mouvements : lot, SCI (SCI:nom), puis immeuble', () => {
    expect(inferEspaceOf('mouvements', { qui: 'Ferrette - 101' }, db)).toBe('B')
    expect(inferEspaceOf('mouvements', { qui: 'ferrette 001 ' }, db)).toBe('B')              // nom normalisé
    expect(inferEspaceOf('mouvements', { qui: 'SCI:SCI SMARTOSAURUS', imm: '' }, db)).toBe('B')
    expect(inferEspaceOf('mouvements', { qui: '', imm: 'Ferrette' }, db)).toBe('B')        // prêt, assurance, EDF…
    expect(inferEspaceOf('mouvements', { qui: 'RDC gauche' }, db)).toBe('A')
    expect(inferEspaceOf('mouvements', { qui: '', imm: '' }, db)).toBe(null)               // aucun lien → D2
    expect(inferEspaceOf('mouvements', { qui: 'Texte libre', imm: 'Ferrette' }, db)).toBe('B') // qui inconnu → immeuble
  })

  it('documents : par type de parent (logement, bail, immeuble, entité, mouvement, mrh)', () => {
    expect(inferEspaceOf('documents', { parentType: 'logement', parentRef: 'Ferrette - 101' }, db)).toBe('B')
    expect(inferEspaceOf('documents', { parentType: 'bail', parentRef: 'FERRETTE 001@@B' }, db)).toBe('B')
    expect(inferEspaceOf('documents', { parentType: 'immeuble', parentRef: 'Ferrette' }, db)).toBe('B')
    expect(inferEspaceOf('documents', { parentType: 'entite', parentRef: 'SCI SMARTOSAURUS' }, db)).toBe('B')
    expect(inferEspaceOf('documents', { parentType: 'mouvement', parentId: 10 }, db)).toBe('B')
    expect(inferEspaceOf('documents', { parentType: 'mrh', parentRef: '', logRef: 'FERRETTE 001' }, db)).toBe('B')
    expect(inferEspaceOf('documents', { parentType: 'logement', parentRef: 'RDC gauche' }, db)).toBe('A')
  })

  it('mouvement parent NEUF (non tagué) : déduit à son tour depuis son propre rattachement', () => {
    const d = dbFusionne(); d.mouvements.push({ id: 11, qui: 'FERRETTE 001' })
    expect(inferEspaceOf('documents', { parentType: 'mouvement', parentId: 11 }, d)).toBe('B')
  })

  it('agenda, quittances, edl, mrh, candidats, baux, historique, journal, logements, immeubles', () => {
    expect(inferEspaceOf('agenda', { logement: 'Ferrette - 101' }, db)).toBe('B')
    expect(inferEspaceOf('agenda', { immeuble: 'Ferrette' }, db)).toBe('B')
    expect(inferEspaceOf('agenda', { entite: 'SCI SMARTOSAURUS' }, db)).toBe('B')
    expect(inferEspaceOf('quittances', { logement: 'Ferrette - 101', entity: 'SCI SMARTOSAURUS' }, db)).toBe('B')
    expect(inferEspaceOf('edl', { logement: 'FERRETTE 001' }, db)).toBe('B')
    expect(inferEspaceOf('mrh', { logement: 'FERRETTE 001' }, db)).toBe('B')
    expect(inferEspaceOf('candidats', { logRef: '', entity: 'SCI SMARTOSAURUS' }, db)).toBe('B')
    expect(inferEspaceOf('baux', { __key: 'Ferrette - 101' }, db)).toBe('B')
    expect(inferEspaceOf('baux_historique', { ref: 'Ferrette - 101' }, db)).toBe('B')
    expect(inferEspaceOf('baux_evenements', { ref: 'Ferrette - 101@@B' }, db)).toBe('B')
    expect(inferEspaceOf('logements', { ref: 'Ferrette - 105', entity: 'SCI SMARTOSAURUS' }, db)).toBe('B')
    const d = dbFusionne(); const neuf = { nom: 'Ferrette annexe' }; d.entites[1].immeubles.push(neuf)
    expect(inferEspaceOf('immeubles', neuf, d)).toBe('B')                                   // par l'objet parent
    expect(inferEspaceOf('immeubles', { nom: 'X', __entiteNom: 'SCI SMARTOSAURUS' }, db)).toBe('B')
  })

  it('une SCI neuve vit dans l\'espace propre ; collection inconnue / entrée vide → null', () => {
    expect(inferEspaceOf('entites', { nom: 'SCI SMARTOSAURUS' }, db)).toBe(null)
    expect(inferEspaceOf('inconnue', { qui: 'Ferrette - 101' }, db)).toBe(null)
    expect(inferEspaceOf('mouvements', null, db)).toBe(null)
    expect(inferEspaceOf('mouvements', { qui: 'Ferrette - 101' }, null)).toBe(null)
  })

  it('homonymie : un lot présent dans deux espaces → indécidable (null), sans retomber sur l\'immeuble', () => {
    const d = dbFusionne(); d.logements.push({ ref: 'Ferrette - 101', entity: 'Didier Keller', _espaceId: 'A' })
    expect(inferEspaceOf('mouvements', { qui: 'Ferrette - 101', imm: 'Ferrette' }, d)).toBe(null)
  })

  it('un homonyme NON tagué (créé en session = espace propre) rend le lien indécidable', () => {
    const d = dbFusionne(); d.logements.push({ ref: 'Ferrette - 101', entity: 'SCI SMARTOSAURUS' })
    expect(inferEspaceOf('agenda', { logement: 'Ferrette - 101' }, d)).toBe(null)
  })

  it('un homonyme TOMBSTONÉ ne décide jamais (l\'ancienne copie privée supprimée)', () => {
    const d = dbFusionne()
    d.logements.push({ ref: 'Ferrette - 101', entity: 'SCI SMARTOSAURUS', _espaceId: 'A', _deleted: true })
    d.entites.push({ nom: 'SCI SMARTOSAURUS', _espaceId: 'A', _deleted: true, immeubles: [{ nom: 'Ferrette', _espaceId: 'A' }] })
    expect(inferEspaceOf('mouvements', { qui: 'Ferrette - 101' }, d)).toBe('B')
    expect(inferEspaceOf('mouvements', { qui: '', imm: 'Ferrette' }, d)).toBe('B')        // immeuble d'une SCI morte ignoré
  })
})

// Store par-espace espionné (hydrate = copie profonde du DB fourni ; écritures enregistrées).
function fakeStore(hydrateDb) {
  const calls = { upsert: [], remove: [] }
  return {
    calls,
    async hydrate() { return JSON.parse(JSON.stringify(hydrateDb)) },
    async upsert(coll, rec) { calls.upsert.push([coll, rec]); return { status: 'inserted', version: 1 } },
    async remove(coll, rec) { calls.remove.push([coll, rec]); return { status: 'deleted', version: 2 } },
    async archive() { return { status: 'archived', version: 3 } },
    async persistConfig() {},
    attach() {},
  }
}

async function setupSync(propreSup = {}) {
  const storeA = fakeStore({
    entites: [{ nom: 'Didier Keller', immeubles: [{ nom: 'Strasbourg' }] }],
    logements: [{ ref: 'RDC gauche', entity: 'Didier Keller' }],
    mouvements: [], documents: [], agenda: [], baux: {}, ...propreSup,
  })
  const storeB = fakeStore({
    entites: [{ nom: 'SCI SMARTOSAURUS', immeubles: [{ nom: 'Ferrette' }] }],
    logements: [{ ref: 'Ferrette - 101', entity: 'SCI SMARTOSAURUS', imm: 'Ferrette' }],
    mouvements: [{ id: 10, qui: 'Ferrette - 101', date: '2026-07-01' }], documents: [], agenda: [], baux: {},
  })
  let live = {}
  const multi = createMultiStore({
    espaces: [{ espaceId: 'A', ownerId: 'oA', mine: true }, { espaceId: 'B', ownerId: 'oB', mine: false }],
    makeStore: id => (id === 'A' ? storeA : storeB),
    getDB: () => live,
  })
  live = await multi.hydrate()
  const sync = createStoreSync({ store: multi, getDB: () => live })
  sync.seed(live)
  return { live, sync, multi, storeA, storeB }
}

describe('store-sync + multi-espace — un enregistrement NEUF part dans l\'espace de sa SCI', () => {
  it('cas SMARTOSAURUS : import bancaire, document de lot, rappel → espace B ; dépense perso → espace A', async () => {
    const { live, sync, storeA, storeB } = await setupSync()
    live.mouvements.push(
      { id: 101, qui: 'Ferrette - 101', imm: 'Ferrette', date: '2026-09-02', cr: 760 },   // loyer
      { id: 102, qui: '', imm: 'Ferrette', date: '2026-09-05', db: 2537.52 },             // échéance de prêt
      { id: 103, qui: 'SCI:SCI SMARTOSAURUS', imm: '', date: '2026-09-08', db: 15.9 },    // frais bancaires
      { id: 104, qui: 'RDC gauche', date: '2026-09-10', db: 30 },                         // perso
    )
    live.documents.push({ id: 201, parentType: 'logement', parentRef: 'Ferrette - 101', name: 'DPE.pdf' })
    live.agenda.push({ id: 301, logement: 'Ferrette - 101', titre: 'Révision IRL' })
    await sync.flush(live)
    const ids = (s, coll) => s.calls.upsert.filter(([c]) => c === coll).map(([, r]) => r.id).sort()
    expect(ids(storeB, 'mouvements')).toEqual([101, 102, 103])
    expect(ids(storeA, 'mouvements')).toEqual([104])
    expect(ids(storeB, 'documents')).toEqual([201])
    expect(ids(storeB, 'agenda')).toEqual([301])
    expect(storeA.calls.upsert.filter(([c]) => c !== 'mouvements')).toEqual([])
    // le tag est posé sur la SOURCE vivante (routage, résolveurs FK et vue par-espace le revoient)
    expect(live.mouvements.find(m => m.id === 101)._espaceId).toBe('B')
    expect(live.mouvements.find(m => m.id === 104)._espaceId).toBeUndefined()            // propre : D2 inchangé
  })

  it('le flush suivant est stable : aucun ré-envoi, aucun remove', async () => {
    const { live, sync, storeA, storeB } = await setupSync()
    live.mouvements.push({ id: 101, qui: 'Ferrette - 101', date: '2026-09-02' })
    await sync.flush(live)
    const avant = [storeA.calls.upsert.length, storeB.calls.upsert.length]
    await sync.flush(live)
    expect([storeA.calls.upsert.length, storeB.calls.upsert.length]).toEqual(avant)
    expect(storeA.calls.remove).toEqual([])
    expect(storeB.calls.remove).toEqual([])
  })

  it('logement NEUF dans la SCI tierce, puis son loyer : les deux partent dans B', async () => {
    const { live, sync, storeA, storeB } = await setupSync()
    live.logements.push({ ref: 'Ferrette - 105', entity: 'SCI SMARTOSAURUS', imm: 'Ferrette' })
    live.mouvements.push({ id: 120, qui: 'Ferrette - 105', date: '2026-10-01', cr: 500 })
    await sync.flush(live)
    expect(storeB.calls.upsert.map(([c, r]) => c + ':' + (r.ref || r.id))).toEqual(['logements:Ferrette - 105', 'mouvements:120'])
    expect(storeA.calls.upsert).toEqual([])
  })

  it('un enregistrement DÉJÀ tagué n\'est jamais re-routé (les 51 mouvements du 05/10 restent où ils sont)', async () => {
    const { live, sync, storeA, storeB } = await setupSync({ mouvements: [{ id: 900, qui: 'Ferrette - 101', date: '2026-10-03' }] })
    const m = live.mouvements.find(x => x.id === 900)
    expect(m._espaceId).toBe('A')                 // hydraté depuis l'espace propre
    m.cat = 'Loyers encaissés'                     // simple édition
    await sync.flush(live)
    expect(storeA.calls.upsert.map(([, r]) => r.id)).toEqual([900])
    expect(storeB.calls.upsert).toEqual([])
    expect(storeB.calls.remove).toEqual([])
  })

  it('mono-espace (store sans inferEspace) : comportement inchangé', async () => {
    const calls = []
    const store = { upsert: async (c, r) => { calls.push([c, r]); return { status: 'inserted' } }, remove: async () => ({ status: 'deleted' }) }
    const db = { entites: [{ nom: 'SCI A', immeubles: [] }], logements: [{ ref: 'F-1', entity: 'SCI A' }], mouvements: [], baux: {} }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed(db)
    db.mouvements.push({ id: 1, qui: 'F-1', date: '2026-01-01' })
    await sync.flush(db)
    expect(calls.map(([c, r]) => c + ':' + r.id)).toEqual(['mouvements:1'])
    expect(db.mouvements[0]._espaceId).toBeUndefined()
  })
})

describe('contre-audit 06/10/2026 — corrections', () => {
  it('inferRattachementOf renvoie aussi la SCI de rattachement (pour le contrôle d\'écriture)', () => {
    const db = dbFusionne()
    expect(inferRattachementOf('mouvements', { qui: 'Ferrette - 101' }, db)).toEqual({ espace: 'B', entite: 'SCI SMARTOSAURUS' })
    expect(inferRattachementOf('agenda', { immeuble: 'Ferrette' }, db)).toEqual({ espace: 'B', entite: 'SCI SMARTOSAURUS' })
    expect(inferRattachementOf('documents', { parentType: 'mouvement', parentId: 10 }, db)).toEqual({ espace: 'B', entite: 'SCI SMARTOSAURUS' })
  })

  it('M2 — pièce d\'un candidat : suit l\'espace du candidat parent (même sans logRef)', () => {
    const db = dbFusionne(); db.candidats = [{ id: 'c1', entity: 'SCI SMARTOSAURUS', _espaceId: 'B' }, { id: 'c2', entity: 'SCI SMARTOSAURUS' }]
    expect(inferEspaceOf('documents', { parentType: 'candidat', parentId: 'c1', logRef: null }, db)).toBe('B')
    expect(inferEspaceOf('documents', { parentType: 'candidat', parentId: 'c2', logRef: null }, db)).toBe('B')   // candidat neuf
  })

  it('I1 — SCI tierce en LECTURE SEULE : rien n\'est routé vers elle (défaut D2, pas de refus RLS en boucle)', () => {
    const mk = peutEcrire => createMultiStore({
      espaces: [{ espaceId: 'A', ownerId: 'oA', mine: true }, { espaceId: 'B', ownerId: 'oB', mine: false, peutEcrire }],
      makeStore: () => fakeStore({}), getDB: () => ({}),
    })
    const db = dbFusionne()
    expect(mk(nom => nom === 'SCI SMARTOSAURUS').inferEspace('agenda', { logement: 'Ferrette - 101' }, db)).toBe('B')
    expect(mk(() => false).inferEspace('agenda', { logement: 'Ferrette - 101' }, db)).toBe(null)
    expect(mk(undefined).inferEspace('agenda', { logement: 'Ferrette - 101' }, db)).toBe('B')        // pas de contrôle fourni
    expect(mk(() => true).inferEspace('agenda', { logement: 'RDC gauche' }, db)).toBe(null)          // espace propre
  })

  it('B1 — mouvement NEUF + sa PJ sur un lot de B (gestionnaire scopé) : converge, sans boucle 42501/23503', async () => {
    // Serveur factice par espace : RLS de entite_of_document('mouvement') (la ligne du mouvement doit exister
    // dans l'espace) + FK dure mouvements_pj_fk (pj_document_id → document existant). Vrais store-supabase.
    const tables = { A: new Map(), B: new Map() }
    const T = (esp, t) => { if (!tables[esp].has(t)) tables[esp].set(t, new Map()); return tables[esp].get(t) }
    const writer = esp => ({
      async insert(table, row) {
        const t = T(esp, table); if (t.has(row.id)) return null
        if (esp === 'B' && table === 'documents' && row.parent_type === 'mouvement' && !T(esp, 'mouvements').has(row.parent_id)) throw new Error('42501 RLS documents')
        if (table === 'mouvements' && row.pj_document_id && !T(esp, 'documents').has(row.pj_document_id)) throw new Error('23503 mouvements_pj_fk')
        t.set(row.id, { row, version: 1 }); return 1
      },
      async update(table, id, row, v) { const c = T(esp, table).get(id); if (!c || c.version !== v) return null; c.version++; c.row = row; return c.version },
      async softDelete() { return null },
    })
    const seed = {
      A: { entites: [{ legacy_raw: { nom: 'Didier Keller', immeubles: [] } }], logements: [] },
      B: { entites: [{ legacy_raw: { nom: 'SCI SMARTOSAURUS', immeubles: [{ nom: 'Ferrette' }] } }], logements: [{ legacy_raw: { ref: 'Ferrette - 101', entity: 'SCI SMARTOSAURUS', imm: 'Ferrette' } }] },
    }
    let live = {}
    const multi = createMultiStore({
      espaces: [{ espaceId: 'A', ownerId: 'oA', mine: true }, { espaceId: 'B', ownerId: 'oB', mine: false, peutEcrire: n => n === 'SCI SMARTOSAURUS' }],
      makeStore: (esp, owner) => createSupabaseStore({
        fetchTable: async name => (seed[esp][name] || []), fetchConfig: async () => ({}), writer: writer(esp),
        detUuid: (...p) => owner + ':' + p.join('|'), espaceId: esp, ownerId: owner,
      }),
      getDB: () => live,
    })
    live = await multi.hydrate()
    const sync = createStoreSync({ store: multi, getDB: () => live, retryBaseMs: 0 })
    sync.seed(live)
    live.documents = live.documents || []; live.mouvements = live.mouvements || []
    live.documents.push({ id: 7, parentType: 'mouvement', parentId: 70, name: 'facture.pdf' })
    live.mouvements.push({ id: 70, qui: 'Ferrette - 101', imm: 'Ferrette', date: '2026-10-01', db: 120, pjId: 7 })
    const s1 = await sync.flush(live)
    expect(s1.errors.map(e => e.coll)).toEqual(['documents'])              // 1er flush : seule la PJ attend son mouvement
    expect(T('B', 'mouvements').has('oB:mouvement|70')).toBe(true)          // le mouvement est écrit, chez B
    const s2 = await sync.flush(live)
    expect(s2.errors).toEqual([])                                           // 2e flush : la PJ passe
    expect(T('B', 'documents').has('oB:document|7')).toBe(true)
    expect(tables.A.size).toBe(0)                                           // rien dans l'espace propre
    expect(T('B', 'mouvements').get('oB:mouvement|70').row.legacy_raw.pjId).toBe(7)   // la PJ reste liée (legacy_raw)
  })
})
