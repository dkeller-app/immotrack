// Test d'INTÉGRATION du boot (js/app/supabase-boot.js) contre le VRAI Postgres : prouve la chaîne
// complète login → résolution espace → hydrate → modif locale → sync ligne-par-ligne → re-hydrate.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createBoot } from '../../js/app/supabase-boot.js'
import { makeDetUuid } from '../../js/core/det-uuid.js'
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

  it('logout FLUSHE les modifs en attente avant de déconnecter (pas de perte)', async () => {
    const boot = createBoot(anonClient())
    await boot.loginEmail(U.email, U.pass)
    const esp = await boot.resolveEspace('Espace Boot')
    let DB = {}
    boot.wireStore({ ...esp, getDB: () => DB, schedule: null })
    DB = await boot.hydrate(); boot.seed(DB)
    DB.entites = [...(DB.entites || []), { nom: 'SCI Logout', immeubles: [] }]
    await boot.logout()                    // doit flusher SCI Logout AVANT signOut

    // re-login frais → la modif a bien été persistée (sinon elle aurait été perdue au logout)
    const boot2 = createBoot(anonClient())
    await boot2.loginEmail(U.email, U.pass)
    const esp2 = await boot2.resolveEspace('Espace Boot')
    let DB3 = {}
    boot2.wireStore({ ...esp2, getDB: () => DB3, schedule: null })
    DB3 = await boot2.hydrate()
    expect((DB3.entites || []).some(e => e.nom === 'SCI Logout')).toBe(true)
  })

  it('2c SAUVEGARDE : saveDB→markDirty→scheduler→flush persiste dans le cloud (re-hydrate le voit)', async () => {
    const boot = createBoot(anonClient())
    await boot.loginEmail(U.email, U.pass)
    const esp = await boot.resolveEspace('Espace Boot')
    let liveDB = null, captured = null
    // scheduler qui CAPTURE le flush (comme le debounce de l'entry, mais déclenché à la main ici)
    boot.wireStore({ ...esp, getDB: () => liveDB, schedule: (fn) => { captured = fn } })
    const db = await boot.hydrate()
    liveDB = db; boot.seed(db)                      // câblage 2c : getDB lit liveDB, baseline = hydraté
    // l'app modifie le DB EN PLACE puis appelle saveDB → (garde) → window.__immoMarkDirty → markDirty
    db.entites = [...(db.entites || []), { nom: 'SCI Sync2C', immeubles: [] }]
    boot.markDirty()                                 // → schedule(fn) → captured = fn (pas encore flushé)
    expect(typeof captured).toBe('function')
    const summary = await captured()                 // le debounce arrive à échéance → flush cloud
    expect(summary.upserts).toContainEqual({ coll: 'entites', key: 'sci sync2c' })
    expect(summary.conflicts).toEqual([])
    // re-hydrate frais → la modif est bien dans le cloud
    const boot2 = createBoot(anonClient())
    await boot2.loginEmail(U.email, U.pass)
    const esp2 = await boot2.resolveEspace('Espace Boot')
    let DB4 = {}; boot2.wireStore({ ...esp2, getDB: () => DB4, schedule: null })
    DB4 = await boot2.hydrate()
    expect((DB4.entites || []).some(e => e.nom === 'SCI Sync2C')).toBe(true)
  })

  it('BASCULE : modifier une ligne PRÉ-EXISTANTE (style ETL, même namespace) → UPDATE même id, AUCUN doublon', async () => {
    const boot = createBoot(anonClient())
    await boot.loginEmail(U.email, U.pass)
    const esp = await boot.resolveEspace('Espace Boot')
    // pré-insère "SCI Pre" comme l'aurait fait l'ETL : id = makeDetUuid(ownerId)('entite','sci pre')
    const preId = makeDetUuid(esp.ownerId)('entite', 'sci pre')
    const cli = anonClient(); await cli.auth.signInWithPassword({ email: U.email, password: U.pass })
    const ins = await cli.from('entites').insert({ id: preId, espace_id: esp.espaceId, nom: 'SCI Pre', legacy_raw: { nom: 'SCI Pre', immeubles: [], siren: null } })
    expect(ins.error).toBeNull()

    let DB = {}
    boot.wireStore({ ...esp, getDB: () => DB, schedule: null })
    DB = await boot.hydrate(); boot.seed(DB)
    const pre = (DB.entites || []).find(e => e.nom === 'SCI Pre')
    expect(pre).toBeTruthy()
    pre.siren = '123456789'                // modif d'un champ NON-identité → même id → UPDATE
    const summary = await boot.flush()
    expect(summary.upserts).toContainEqual({ coll: 'entites', key: 'sci pre' })

    const check = await cli.from('entites').select('id, version, legacy_raw').eq('espace_id', esp.espaceId).ilike('nom', 'SCI Pre')
    expect(check.data.length).toBe(1)                          // AUCUN doublon
    expect(check.data[0].id).toBe(preId)                       // même ligne
    expect(Number(check.data[0].version)).toBeGreaterThan(1)   // UPDATE (pas ré-insertion)
    expect(check.data[0].legacy_raw.siren).toBe('123456789')   // modif persistée + jsonb objet
  })
})
