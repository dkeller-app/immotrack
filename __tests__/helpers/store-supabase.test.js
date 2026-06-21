import { describe, it, expect } from 'vitest'
import { createSupabaseStore } from '../../js/core/store-supabase.js'

// fetchTable/fetchConfig injectés (mock) → on teste la RECONSTRUCTION de la forme legacy,
// sans dépendre de Supabase. legacy_raw = l'enregistrement d'origine verbatim.
function mockBackend(tables, config) {
  return {
    fetchTable: async (name) => (tables[name] || []).map(lr => ({ legacy_raw: lr })),
    fetchConfig: async () => config || {},
  }
}

describe('SupabaseStore.hydrate — reconstruit le DB legacy depuis les tables', () => {
  it('collections tableaux : entites/logements/mouvements… via legacy_raw', async () => {
    const s = createSupabaseStore(mockBackend({
      entites: [{ id: 1, nom: 'A', immeubles: [{ nom: 'Imm1' }] }],
      logements: [{ id: 10, ref: 'F-1' }, { id: 11, ref: 'F-2' }],
      mouvements: [{ id: 100, lib: 'Loyer' }],
    }, {}))
    const db = await s.hydrate()
    expect(db.entites).toEqual([{ id: 1, nom: 'A', immeubles: [{ nom: 'Imm1' }] }])  // immeubles RE-NESTÉS (déjà dans legacy_raw)
    expect(db.logements.map(l => l.ref)).toEqual(['F-1', 'F-2'])
    expect(db.mouvements[0].lib).toBe('Loyer')
  })

  it('baux : reconstruit la MAP keyée par ref (depuis __key), sans polluer avec __key', async () => {
    const s = createSupabaseStore(mockBackend({
      baux: [{ __key: 'F-1', ref: 'F-1', hc: 700 }, { __key: 'F-2', ref: 'F-2', hc: 500 }],
    }, {}))
    const db = await s.hydrate()
    expect(Object.keys(db.baux).sort()).toEqual(['F-1', 'F-2'])
    expect(db.baux['F-1']).toEqual({ ref: 'F-1', hc: 700 })   // __key retiré
  })

  it('table assurances → collection legacy `mrh` (pas `assurances`)', async () => {
    const s = createSupabaseStore(mockBackend({ assurances: [{ id: 1, compagnie: 'AXA' }] }, {}))
    const db = await s.hydrate()
    expect(db.mrh).toEqual([{ id: 1, compagnie: 'AXA' }])
    // NB : `db.assurances` (collection legacy distincte, vide) vient de la CONFIG, pas de cette
    // table → testée séparément ci-dessous. Sans config (mock {}), elle est absente : normal.
  })

  it('collections portées par la config (assurances/candidats/auditTrail/compteursReleves)', async () => {
    const s = createSupabaseStore(mockBackend({ assurances: [{ id: 1 }] }, {
      assurances: [], candidats: [{ id: 9 }], auditTrail: [{ a: 1 }], compteursReleves: { 0: {} },
    }))
    const db = await s.hydrate()
    // la table assurances → mrh ; la collection legacy `assurances` (config) reste vide et présente
    expect(db.mrh).toEqual([{ id: 1 }])
    expect(db.assurances).toEqual([])
    expect(db.candidats).toEqual([{ id: 9 }])
    expect(db.auditTrail).toEqual([{ a: 1 }])
  })

  it('GARDE (audit #2) : une clé config homonyme d\'une collection métier ne l\'écrase PAS', async () => {
    const s = createSupabaseStore(mockBackend(
      { mouvements: [{ id: 1, lib: 'vrai' }], entites: [{ id: 1, nom: 'vraie' }] },
      { mouvements: [{ id: 99, lib: 'pirate' }], entites: 'corrompu', params: { ok: 1 } },
    ))
    const db = await s.hydrate()
    expect(db.mouvements).toEqual([{ id: 1, lib: 'vrai' }])   // table gagne, config ignorée
    expect(db.entites).toEqual([{ id: 1, nom: 'vraie' }])
    expect(db.params).toEqual({ ok: 1 })                      // vraie config passe
  })

  it('config (espace_config.data) fusionnée : params/categories/irlTable…', async () => {
    const s = createSupabaseStore(mockBackend({}, { params: { theme: 'dark' }, categories: ['loyer'], irlTable: { '2026T1': 100 } }))
    const db = await s.hydrate()
    expect(db.params.theme).toBe('dark')
    expect(db.categories).toEqual(['loyer'])
    expect(db.irlTable['2026T1']).toBe(100)
  })

  it('lignes sans legacy_raw ignorées (robustesse)', async () => {
    const s = createSupabaseStore({
      fetchTable: async (n) => n === 'logements' ? [{ legacy_raw: { ref: 'F-1' } }, { legacy_raw: null }] : [],
      fetchConfig: async () => ({}),
    })
    const db = await s.hydrate()
    expect(db.logements).toEqual([{ ref: 'F-1' }])
  })

  it('DB vide (espace neuf) → collections vides, pas d\'exception', async () => {
    const s = createSupabaseStore(mockBackend({}, {}))
    const db = await s.hydrate()
    expect(db.entites).toEqual([]); expect(db.baux).toEqual({})
  })
})

// writer mock = simule la couche DB (Map table→id→{row,version}) avec concurrence par version.
function mockWriter() {
  const tbl = new Map()
  const T = n => { if (!tbl.has(n)) tbl.set(n, new Map()); return tbl.get(n) }
  return {
    _tbl: tbl, inserts: [], updates: [], deletes: [],
    // INSERT fail-closed : null si l'id existe déjà (ON CONFLICT DO NOTHING RETURNING version).
    async insert(table, row) { const t = T(table); if (t.has(row.id)) return null; t.set(row.id, { row, version: 1 }); this.inserts.push([table, row.id]); return 1 },
    // UPDATE gardé par version ET deleted_at IS NULL (anti-résurrection §7/D20).
    async update(table, id, row, expVer) { const c = T(table).get(id); if (!c || c.version !== expVer || c.row.deleted_at) return null; c.version++; c.row = row; this.updates.push([table, id, c.version]); return c.version },
    async softDelete(table, id, expVer) { const c = T(table).get(id); if (!c || c.version !== expVer) return null; c.version++; c.row = { ...c.row, deleted_at: 'x' }; this.deletes.push([table, id]); return c.version },
  }
}
const detUuid = (...p) => 'uuid:' + p.join('|')
function storeWith(writer, db) {
  const s = createSupabaseStore({
    fetchTable: async () => [], fetchConfig: async () => ({}),
    writer, detUuid, espaceId: 'ESP', ownerId: 'OWN',
  })
  s.attach(db)
  return s
}

describe('SupabaseStore.upsert/remove — écriture + concurrence par version', () => {
  it('upsert d\'un nouvel enregistrement → insert + version trackée', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    const r = await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A', surf: 42 })
    expect(r.status).toBe('inserted')
    expect(w.inserts).toContainEqual(['logements', 'uuid:logement|f-1'])
  })

  it('upsert existant → update avec la version trackée, version bumpée', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })          // insert (v1)
    const r = await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A', surf: 50 })  // update
    expect(r.status).toBe('updated'); expect(r.version).toBe(2)
  })

  it('upsert STALE (version périmée côté serveur) → conflit, PAS de perte silencieuse', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })   // v1, trackée=1
    // un autre client bump la version côté serveur (v2) → notre version trackée (1) est périmée
    w._tbl.get('logements').get('uuid:logement|f-1').version = 5
    const r = await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A', surf: 99 })
    expect(r.status).toBe('conflict')   // surfacé, l'app doit re-hydrater
  })

  it('upsert non-mappable (FK non résolue) → skipped, aucune écriture', async () => {
    const w = mockWriter()
    const s = storeWith(w, { entites: [], logements: [] })
    const r = await s.upsert('logements', { id: 1, ref: 'X', entity: 'Inconnue' })
    expect(r.status).toBe('skipped'); expect(w.inserts.length).toBe(0)
  })

  it('collection legacy `mrh` → table `assurances`', async () => {
    const w = mockWriter()
    const s = storeWith(w, { entites: [], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] })
    await s.upsert('mrh', { id: 3, logement: 'F-1', compagnie: 'AXA' })
    expect(w.inserts).toContainEqual(['assurances', 'uuid:assurance|3'])
  })

  it('remove → soft-delete avec garde de version', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })
    const r = await s.remove('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })
    expect(r.status).toBe('deleted')
    expect(w.deletes).toContainEqual(['logements', 'uuid:logement|f-1'])
  })

  // ── trous trouvés par l'audit (NON-PASSANT → corrigés) ──────────────────────
  it('CRITICAL : id existant en base mais NON tracké → conflit, PAS d\'écrasement silencieux', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    // ligne présente côté serveur (v5) mais jamais hydratée → _versions vide
    w._tbl.set('logements', new Map([['uuid:logement|f-1', { row: { hc: 700 }, version: 5 }]]))
    const r = await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A', surf: 99 })
    expect(r.status).toBe('conflict')                                               // jamais 'inserted'
    expect(w._tbl.get('logements').get('uuid:logement|f-1').version).toBe(5)          // intacte
  })

  it('anti-résurrection : UPDATE sur une ligne soft-deleted → conflit', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })
    await s.remove('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })             // soft-deleted
    const r = await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A', surf: 1 })
    expect(r.status).toBe('conflict')                                               // pas de résurrection
  })

  it('remove d\'une ligne NON trackée → conflit (refus, pas de delete deviné)', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    const r = await s.remove('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })
    expect(r.status).toBe('conflict'); expect(w.deletes.length).toBe(0)
  })

  it('remove STALE (version périmée) → conflit', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })
    w._tbl.get('logements').get('uuid:logement|f-1').version = 9
    const r = await s.remove('logements', { id: 10, ref: 'F-1', entity: 'SCI A' })
    expect(r.status).toBe('conflict')
  })

  it('réutilisation d\'un id TOMBSTONE (soft-deleted, non hydraté) → conflit fail-closed, tombstone intact', async () => {
    const w = mockWriter()
    const db = { entites: [{ id: 1, nom: 'SCI A' }], logements: [{ id: 10, ref: 'F-1', entity: 'SCI A' }] }
    const s = storeWith(w, db)
    // un logement supprimé (tombstone) occupe déjà l'id déterministe ; exclu de fetchTable → _versions vide
    w._tbl.set('logements', new Map([['uuid:logement|f-1', { row: { deleted_at: 'x' }, version: 3 }]]))
    const r = await s.upsert('logements', { id: 10, ref: 'F-1', entity: 'SCI A', surf: 5 })
    expect(r.status).toBe('conflict')
    expect(w._tbl.get('logements').get('uuid:logement|f-1').row.deleted_at).toBe('x')   // tombstone intact
  })
})

describe('SupabaseStore.persistConfig — écrit le sous-ensemble CONFIG (complément des tables) dans espace_config', () => {
  it('split partagé/privé : writeConfig = partagé (hors tables/_modifiedAt/clés privées) ; writeConfigPrivate = privé', async () => {
    let written = null, writtenPriv = null
    const s = createSupabaseStore({
      fetchTable: async () => [], fetchConfig: async () => ({}),
      writeConfig: async (data) => { written = data; return true },
      writeConfigPrivate: async (data) => { writtenPriv = data; return true },
      writer: mockWriter(), detUuid, espaceId: 'ESP', ownerId: 'OWN',
    })
    s.attach({
      entites: [{ nom: 'A' }], logements: [{ ref: 'F' }], baux: { 'F': {} }, mouvements: [{ id: 1 }],
      quittances: [], edl: [], documents: [], baux_historique: [], mrh: [{ id: 2 }], agenda: [{ id: 3 }],
      candidats: [{ id: 9 }], _modifiedAt: 'x',   // candidats = TABLE désormais → exclu du blob
      params: { devise: 'EUR', bankAccounts: [{ iban: 'X' }], userProfile: { n: 'P' } },
      categories: ['Loyer'], irlTable: { 2026: 100 }, assurances: [{ id: 1, type: 'PNO' }],   // assurances BAILLEUR = config (pas de table)
      auditTrail: [{ a: 1 }], candidatLinks: { L: 't' },
    })
    const r = await s.persistConfig()
    // table-backées (dont candidats) + _modifiedAt EXCLUS du blob partagé
    for (const k of ['entites', 'logements', 'baux', 'mouvements', 'quittances', 'edl', 'documents', 'baux_historique', 'mrh', 'agenda', 'candidats', '_modifiedAt'])
      expect(written[k]).toBeUndefined()
    // clés PRIVÉES exclues du blob PARTAGÉ (anti-fuite)
    expect(written.auditTrail).toBeUndefined(); expect(written.candidatLinks).toBeUndefined()
    expect(written.params).toEqual({ devise: 'EUR' })   // bankAccounts/userProfile retirés du partagé
    // config PARTAGÉE conservée
    expect(written.categories).toEqual(['Loyer']); expect(written.irlTable).toEqual({ 2026: 100 })
    expect(written.assurances).toEqual([{ id: 1, type: 'PNO' }])
    // blob PRIVÉ = clés propriétaire-privé
    expect(writtenPriv.auditTrail).toEqual([{ a: 1 }]); expect(writtenPriv.candidatLinks).toEqual({ L: 't' })
    expect(writtenPriv.params).toEqual({ bankAccounts: [{ iban: 'X' }], userProfile: { n: 'P' } })
    expect(r.status).toBe('config-written')
  })

  it('config sans clé privée → writeConfigPrivate PAS appelé (membre scopé : pas de refus RLS)', async () => {
    let privCalled = false
    const s = createSupabaseStore({
      fetchTable: async () => [], fetchConfig: async () => ({}),
      writeConfig: async () => true,
      writeConfigPrivate: async () => { privCalled = true; return true },
      writer: mockWriter(), detUuid, espaceId: 'ESP', ownerId: 'OWN',
    })
    s.attach({ baux: {}, logements: [], params: { devise: 'EUR' }, categories: ['Loyer'] })
    await s.persistConfig()
    expect(privCalled).toBe(false)
  })

  it('sans writeConfig injecté → throw explicite (le binding doit le fournir)', async () => {
    const s = createSupabaseStore({ fetchTable: async () => [], fetchConfig: async () => ({}), writer: mockWriter(), detUuid, espaceId: 'ESP', ownerId: 'OWN' })
    s.attach({ params: { x: 1 } })
    await expect(s.persistConfig()).rejects.toThrow()
  })
})

describe('SupabaseStore.buildResolvers — INCLUT les tombstones (remove en cascade doit résoudre le row.id)', () => {
  it('un parent _deleted RESTE résolvable → un remove d\'enfant en cascade peut calculer son row.id et softDeleter', () => {
    const s = storeWith(mockWriter(), {
      entites: [{ nom: 'Morte', _deleted: true, immeubles: [{ nom: 'ImmDeMorte', _deleted: true }] }],
      logements: [{ ref: 'L-DEL', _deleted: true }],
      documents: [{ id: 2, _deleted: true }],
    })
    const r = s.buildResolvers()
    // tombstonés mais RÉSOLVABLES : sinon mapToRow(enfant)→null → remove skipped → suppression perdue
    expect(r.entiteByNom.has('morte')).toBe(true)
    expect(r.immeubleByNom.has('immdemorte')).toBe(true)
    expect(r.logementByRef.has('l-del')).toBe(true)
    expect(r.documentByLegacy.has('2')).toBe(true)
  })
})
