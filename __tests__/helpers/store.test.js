import { describe, it, expect, vi } from 'vitest'
import { createStore } from '../../js/core/store.js'

// Faux backend en mémoire (simule localStorage) → teste le Store hors navigateur.
function fakeBackend(initial) {
  const m = new Map(initial ? Object.entries(initial) : [])
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _map: m }
}

describe('Store — seam de persistance (P1, adossé localStorage)', () => {
  it('createStore exige un backend {getItem,setItem} et une key', () => {
    expect(() => createStore({ key: 'k' })).toThrow()
    expect(() => createStore({ backend: fakeBackend() })).toThrow()
  })

  it('hydrate() renvoie null si rien en backend', () => {
    const s = createStore({ backend: fakeBackend(), key: 'k' })
    expect(s.hydrate()).toBeNull()
  })

  it('hydrate() renvoie null (pas d\'exception) si JSON illisible', () => {
    const s = createStore({ backend: fakeBackend({ k: '{pas du json' }), key: 'k' })
    expect(s.hydrate()).toBeNull()
  })

  it('persist() puis hydrate() = round-trip identique', () => {
    const s = createStore({ backend: fakeBackend(), key: 'k' })
    const db = { entites: [{ id: 1, nom: 'A' }], baux: { 'F-1': { ref: 'F-1' } } }
    s.persist(db)
    expect(s.hydrate()).toEqual(db)
  })

  it('persist() appelle les hooks dans le bon ordre (saveDB : undoBefore→auditFlush→setItem→dirty→undoAfter)', () => {
    const order = []
    const be = { getItem: () => null, setItem: () => order.push('set') }
    const s = createStore({ backend: be, key: 'k', hooks: {
      onUndoBefore: () => order.push('undoBefore'),
      onAuditFlush: () => order.push('auditFlush'),
      onDirty: () => order.push('dirty'),
      onUndoAfter: () => order.push('undoAfter'),
    } })
    s.persist({})
    expect(order).toEqual(['undoBefore', 'auditFlush', 'set', 'dirty', 'undoAfter'])
  })

  it('persist() capture l\'erreur de quota via onQuotaError (ne throw pas, comme saveDB)', () => {
    const onQuotaError = vi.fn()
    const be = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded') } }
    const s = createStore({ backend: be, key: 'k', hooks: { onQuotaError } })
    expect(() => s.persist({})).not.toThrow()
    expect(onQuotaError).toHaveBeenCalledOnce()
  })

  it('upsert() insère puis met à jour par id (collection array) + persiste', () => {
    const s = createStore({ backend: fakeBackend(), key: 'k' })
    const db = { entites: [] }; s.attach(db)
    s.upsert('entites', { id: 1, nom: 'A' })
    expect(db.entites).toEqual([{ id: 1, nom: 'A' }])
    s.upsert('entites', { id: 1, nom: 'A2' })
    expect(db.entites).toEqual([{ id: 1, nom: 'A2' }])
    expect(s.hydrate().entites[0].nom).toBe('A2')
  })

  it('upsert() gère une collection map keyée (baux[ref])', () => {
    const s = createStore({ backend: fakeBackend(), key: 'k' })
    const db = { baux: {} }; s.attach(db)
    s.upsert('baux', { ref: 'F-1', hc: 700 })
    expect(db.baux['F-1']).toEqual({ ref: 'F-1', hc: 700 })
  })

  it('remove() pose un tombstone en préservant les données (array)', () => {
    const s = createStore({ backend: fakeBackend(), key: 'k' })
    const db = { entites: [{ id: 1, nom: 'A' }] }; s.attach(db)
    s.remove('entites', 1)
    expect(db.entites[0]._deleted).toBe(true)
    expect(typeof db.entites[0]._deletedAt).toBe('string')
    expect(db.entites[0].nom).toBe('A')
  })

  it('remove() hard (tombstone:false) retire la ligne', () => {
    const s = createStore({ backend: fakeBackend(), key: 'k' })
    const db = { entites: [{ id: 1 }, { id: 2 }] }; s.attach(db)
    s.remove('entites', 1, { tombstone: false })
    expect(db.entites.map(r => r.id)).toEqual([2])
  })

  it('upsert/remove sans attach → erreur explicite', () => {
    const s = createStore({ backend: fakeBackend(), key: 'k' })
    expect(() => s.upsert('entites', { id: 1 })).toThrow()
    expect(() => s.remove('entites', 1)).toThrow()
  })
})
