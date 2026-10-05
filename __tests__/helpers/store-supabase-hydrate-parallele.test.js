// Perf — hydrate() lit ses ~14 sources (tables, baux, immeubles, config, config privée) EN PARALLÈLE : avant, chaque
// aller-retour réseau attendait le précédent (1 à 2 s de chargement après la connexion). Ce test verrouille :
//   1. la simultanéité (plusieurs lectures en vol en même temps) ;
//   2. un résultat IDENTIQUE au séquentiel (mêmes clés, même ordre) ;
//   3. les échecs : une lecture en erreur rejette toujours hydrate(), sauf le journal des baux (tolérant).
import { describe, it, expect } from 'vitest'
import { createSupabaseStore } from '../../js/core/store-supabase.js'

const attend = ms => new Promise(r => setTimeout(r, ms))

function backend({ rows = {}, delai = 15, echec = null } = {}) {
  const etat = { enVol: 0, max: 0, appels: [] }
  const lire = async (nom, valeur) => {
    etat.appels.push(nom); etat.enVol++; etat.max = Math.max(etat.max, etat.enVol)
    await attend(delai)
    etat.enVol--
    if (echec === nom) throw new Error('boom ' + nom)
    return valeur
  }
  return {
    etat,
    fetchTable: n => lire(n, (rows[n] || []).map(lr => ({ id: 'u-' + n, version: 3, legacy_raw: lr }))),
    fetchConfig: () => lire('config', { theme: 'sobre' }),
    fetchConfigPrivate: () => lire('config_privee', { iban: 'FR76' }),
  }
}

describe('hydrate() — lectures parallèles', () => {
  it('plusieurs lectures sont en vol en même temps (≥ 10), toutes les sources sont lues', async () => {
    const b = backend()
    await createSupabaseStore(b).hydrate()
    expect(b.etat.max).toBeGreaterThanOrEqual(10)
    for (const n of ['entites', 'logements', 'baux', 'immeubles', 'baux_evenements', 'config', 'config_privee']) expect(b.etat.appels).toContain(n)
  })

  it('durée ≈ une lecture, pas la somme (14 lectures de 15 ms < 120 ms)', async () => {
    const b = backend({ delai: 15 })
    const t0 = Date.now()
    await createSupabaseStore(b).hydrate()
    expect(Date.now() - t0).toBeLessThan(120)
  })

  it('le résultat est identique : mêmes clés dans le même ordre, config et config privée fusionnées', async () => {
    const b = backend({ rows: { entites: [{ id: 1, nom: 'A' }], logements: [{ ref: 'F-1' }], baux: [{ __key: 'F-1', hc: 700 }] } })
    const db = await createSupabaseStore(b).hydrate()
    expect(Object.keys(db).slice(0, 12)).toEqual(['entites', 'logements', 'baux_historique', 'mouvements', 'quittances', 'edl', 'documents', 'mrh', 'agenda', 'candidats', 'baux_evenements', 'baux'])
    expect(db.entites).toEqual([{ id: 1, nom: 'A' }])
    expect(db.baux).toEqual({ 'F-1': { hc: 700 } })
    expect(db.theme).toBe('sobre')
    expect(db.iban).toBe('FR76')
  })

  it('une lecture en erreur fait toujours échouer hydrate()', async () => {
    await expect(createSupabaseStore(backend({ echec: 'logements' })).hydrate()).rejects.toThrow('boom logements')
    await expect(createSupabaseStore(backend({ echec: 'config' })).hydrate()).rejects.toThrow('boom config')
    await expect(createSupabaseStore(backend({ echec: 'baux' })).hydrate()).rejects.toThrow('boom baux')
  })

  it('le journal des baux reste TOLÉRANT : son échec ne fait pas échouer hydrate()', async () => {
    const db = await createSupabaseStore(backend({ echec: 'baux_evenements' })).hydrate()
    expect(db.baux_evenements).toEqual([])
    expect(db.entites).toEqual([])
  })
})
