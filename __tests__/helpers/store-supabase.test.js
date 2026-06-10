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

  it('table assurances → collection legacy `mrh`', async () => {
    const s = createSupabaseStore(mockBackend({ assurances: [{ id: 1, compagnie: 'AXA' }] }, {}))
    const db = await s.hydrate()
    expect(db.mrh).toEqual([{ id: 1, compagnie: 'AXA' }])
    expect(db.assurances).toBeUndefined()
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
