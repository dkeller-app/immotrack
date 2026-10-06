// Perf — createMultiStore.hydrate() hydrate TOUS les espaces EN PARALLÈLE (mesuré en prod : un compte avec 2 espaces
// rechargeait deux fois d'affilée, temps de chargement doublé). La fusion reste dans l'ordre des stores :
// espace PROPRE d'abord (clé `baux` nue gardée pour lui), tags `_espaceId`, config uniquement de l'espace propre.
import { describe, it, expect } from 'vitest'
import { createMultiStore } from '../../js/core/store-multi.js'

const attend = ms => new Promise(r => setTimeout(r, ms))

function monde({ delais = {}, echec = null } = {}) {
  const etat = { enVol: 0, max: 0 }
  const donnees = {
    own:  { logements: [{ ref: 'F-1' }], baux: { 'F-1': { hc: 700 } }, params: { theme: 'sobre' }, entites: [{ nom: 'SCI A', immeubles: [{ nom: 'I1' }] }] },
    tiers: { logements: [{ ref: 'T-1' }], baux: { 'F-1': { hc: 999 }, 'T-1': { hc: 500 } }, params: { theme: 'AUTRE-OWNER' }, entites: [{ nom: 'SCI B', immeubles: [] }] },
  }
  const makeStore = (espaceId) => ({
    hydrate: async () => {
      etat.enVol++; etat.max = Math.max(etat.max, etat.enVol)
      await attend(delais[espaceId] ?? 20)
      etat.enVol--
      if (echec === espaceId) throw new Error('boom ' + espaceId)
      return structuredClone(donnees[espaceId])
    },
  })
  return { etat, makeStore }
}

// l'espace « tiers » est volontairement listé AVANT l'espace propre : l'ordre de fusion doit rester « propre d'abord »
const ESPACES = [{ espaceId: 'tiers', ownerId: 'o2', mine: false }, { espaceId: 'own', ownerId: 'o1', mine: true }]

describe('createMultiStore.hydrate — espaces en parallèle', () => {
  it('les espaces sont hydratés en même temps (2 lectures en vol)', async () => {
    const m = monde()
    await createMultiStore({ espaces: ESPACES, makeStore: m.makeStore, getDB: () => ({}) }).hydrate()
    expect(m.etat.max).toBe(2)
  })

  it('durée ≈ un espace, pas la somme (2 × 40 ms < 75 ms)', async () => {
    const m = monde({ delais: { own: 40, tiers: 40 } })
    const t0 = Date.now()
    await createMultiStore({ espaces: ESPACES, makeStore: m.makeStore, getDB: () => ({}) }).hydrate()
    expect(Date.now() - t0).toBeLessThan(75)
  })

  it('fusion identique : propre d’abord, baux désambiguïsé pour le tiers, tags, config du propre seulement', async () => {
    // même si le tiers répond EN PREMIER (délai court) et l'espace propre en dernier, l'ordre de fusion ne change pas
    const m = monde({ delais: { own: 40, tiers: 5 } })
    const db = await createMultiStore({ espaces: ESPACES, makeStore: m.makeStore, getDB: () => ({}) }).hydrate()
    expect(db.logements.map(l => l.ref)).toEqual(['F-1', 'T-1'])                     // propre d'abord
    expect(db.logements.map(l => l._espaceId)).toEqual(['own', 'tiers'])
    expect(db.baux['F-1'].hc).toBe(700)                                              // la clé nue appartient à l'espace PROPRE
    expect(db.baux['F-1@@tiers'].hc).toBe(999)                                       // collision désambiguïsée
    expect(db.baux['T-1'].hc).toBe(500)
    expect(db.params).toEqual({ theme: 'sobre' })                                    // config du seul espace propre
    expect(db.entites.map(e => e.nom)).toEqual(['SCI A', 'SCI B'])
    expect(db.entites[0].immeubles[0]._espaceId).toBe('own')
  })

  it('une erreur dans un espace fait échouer hydrate() (comme avant)', async () => {
    const m = monde({ echec: 'tiers' })
    await expect(createMultiStore({ espaces: ESPACES, makeStore: m.makeStore, getDB: () => ({}) }).hydrate()).rejects.toThrow('boom tiers')
  })

  it('un seul espace : comportement inchangé', async () => {
    const m = monde()
    const db = await createMultiStore({ espaces: [{ espaceId: 'own', ownerId: 'o1', mine: true }], makeStore: m.makeStore, getDB: () => ({}) }).hydrate()
    expect(db.logements).toEqual([{ ref: 'F-1', _espaceId: 'own' }])
    expect(db.baux['F-1'].hc).toBe(700)
  })
})
