// Test d'INTÉGRATION du boot (js/app/supabase-boot.js) contre le VRAI Postgres : prouve la chaîne
// complète login → résolution espace → hydrate → modif locale → sync ligne-par-ligne → re-hydrate.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createBoot } from '../../js/app/supabase-boot.js'
import { createUser, deleteUserByEmail } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const U = { email: `boot-${RUN}@example.test`, pass: 'Test-Passw0rd!B' }
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

let espaceId = null

beforeAll(async () => { await createUser(U.email, U.pass) })
afterAll(async () => { if (espaceId) await teardownOwner(U.email, [espaceId]); else await deleteUserByEmail(U.email) })

describe('boot — auth', () => {
  it('loginEmail : mauvais mot de passe → { ok:false, error }', async () => {
    const boot = createBoot(anonClient())
    const r = await boot.loginEmail(U.email, 'mauvais')
    expect(r.ok).toBe(false); expect(r.error).toBeTruthy()
  })
  it('loginEmail : identifiants valides → { ok:true, user }', async () => {
    const boot = createBoot(anonClient())
    const r = await boot.loginEmail(U.email, U.pass)
    expect(r.ok).toBe(true); expect(r.user.email).toBe(U.email)
  })
  it('createBoot : sans client → throw', () => {
    expect(() => createBoot(null)).toThrow()
  })
})

describe('boot — résolution espace + round-trip Store/Sync', () => {
  it('resolveEspace crée un espace si aucun, ownerId = created_by (namespace detUuid)', async () => {
    const boot = createBoot(anonClient())
    await boot.loginEmail(U.email, U.pass)
    const esp = await boot.resolveEspace('Espace Boot')
    expect(esp.espaceId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(esp.espaceNom).toBe('Espace Boot')
    const me = await boot.currentUser()
    expect(esp.ownerId).toBe(me.id)        // créateur = l'utilisateur courant
    espaceId = esp.espaceId
  })

  it('round-trip : login→wire→hydrate(vide)→ajout entité→flush→re-hydrate la voit', async () => {
    const boot = createBoot(anonClient())
    await boot.loginEmail(U.email, U.pass)
    const esp = await boot.resolveEspace('Espace Boot')   // idempotent : retrouve le même espace
    expect(esp.espaceId).toBe(espaceId)

    let DB = {}
    boot.wireStore({ espaceId: esp.espaceId, ownerId: esp.ownerId, getDB: () => DB, schedule: null })
    DB = await boot.hydrate()              // espace vide → collections vides
    boot.seed(DB)                          // baseline = état synchronisé courant
    expect((DB.entites || []).length).toBe(0)

    // modification locale (comme l'app : muter le DB en mémoire)
    DB.entites = [{ nom: 'SCI Boot', immeubles: [] }]
    const summary = await boot.flush()     // sync ligne-par-ligne
    expect(summary.upserts).toContainEqual({ coll: 'entites', key: 'sci boot' })
    expect(summary.conflicts).toEqual([])

    // re-hydrate (relit Supabase) → l'entité est persistée et revient à l'identique
    const DB2 = await boot.hydrate()
    expect((DB2.entites || []).some(e => e.nom === 'SCI Boot')).toBe(true)
  })
})
