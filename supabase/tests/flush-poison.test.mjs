// Test d'INTÉGRATION « 2 appareils » contre le VRAI Postgres — rejoue le POISON du 12/07/2026
// (audit AUDIT-SYNC-CLOUD-2026-07-12, cause C-A) et prouve le FLUSH BLINDÉ (P1.2) :
//
//   Le 12/07 en prod : UN insert `documents` refusé par le CHECK parent_type (23514) faisait
//   THROW `_doFlush` entier → les REMOVES et la CONFIG, placés APRÈS dans le flush, n'étaient
//   JAMAIS tentés. Une seule ligne poison = sync 100 % morte une journée entière, en silence
//   (perte réelle : attestations + révision IRL Fric). La migration 0040 a élargi le CHECK aux
//   types réellement émis, mais le CLIENT restait fragile à N'IMPORTE QUEL refus serveur.
//
//   Ici : l'appareil A pousse dans LE MÊME flush un poison (parent_type inconnu → 23514, le CHECK
//   le refuse toujours — c'est voulu, fail-closed schéma), une SUPPRESSION et une modif CONFIG.
//   Contrat blindé : le poison est un échec PAR ENREGISTREMENT (summary.errors), la suppression
//   et la config PASSENT, et l'appareil B les voit en re-hydratant.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createBoot } from '../../js/app/supabase-boot.js'
import { createUser } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const U = { email: `poison-${RUN}@example.test`, pass: 'Test-Passw0rd!P' }
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

// un « appareil » = un boot complet (client dédié, login, wireStore, hydrate, seed) — comme l'app.
async function device() {
  const boot = createBoot(anonClient())
  await boot.loginEmail(U.email, U.pass)
  const esp = await boot.resolveEspace('Espace Poison')
  let DB = {}
  boot.wireStore({ espaceId: esp.espaceId, ownerId: esp.ownerId, getDB: () => DB, schedule: null })
  DB = await boot.hydrate()
  boot.seed(DB)
  return { boot, DB, esp }
}

let espaceId = null

beforeAll(async () => { await createUser(U.email, U.pass) })
afterAll(async () => { if (espaceId) await teardownOwner(U.email, [espaceId]) })

describe('FLUSH BLINDÉ — rejeu du poison du 12/07 sur 2 appareils (vrai Postgres)', () => {
  it('appareil A : état initial propre (entité + logement + mouvement + config) poussé sans échec', async () => {
    const A = await device()
    espaceId = A.esp.espaceId
    A.DB.entites = [{ nom: 'SCI Poison', immeubles: [] }]
    A.DB.logements = [{ id: 1, ref: 'P-1', entity: 'SCI Poison' }]
    A.DB.mouvements = [{ id: 100, qui: 'P-1', date: '2026-07-01', montant: 500 }]
    A.DB.params = { ...(A.DB.params || {}), devise: 'EUR' }
    const s = await A.boot.flush()
    expect(s.errors).toEqual([])
    expect(s.conflicts).toEqual([])
    expect(s.upserts.length).toBeGreaterThanOrEqual(3)
    expect(s.config).toBe('written')
  })

  it('POISON 12/07 rejoué : dans le MÊME flush, le document refusé (23514) est isolé — la SUPPRESSION et la CONFIG passent', async () => {
    const A = await device()   // appareil A « du 12/07 » (hydrate l'état posé au test précédent)
    expect(A.DB.mouvements.some(m => m.id === 100)).toBe(true)

    // le POISON : parent_type inconnu du CHECK documents_parent_type_check (même classe d'erreur
    // que le 12/07 : violation 23514 côté Postgres → l'adapter writer.insert THROW)
    A.DB.documents = [...(A.DB.documents || []), { id: 999, name: 'poison.pdf', parentType: 'type-inconnu-poison', parentRef: 'P-1' }]
    // la SUPPRESSION du jour (celle qui n'est JAMAIS partie le 12/07) — tombstone EN PLACE, comme l'app
    A.DB.mouvements = A.DB.mouvements.map(m => m.id === 100 ? { ...m, _deleted: true, _deletedAt: '2026-07-12T10:00:00Z' } : m)
    // la modif CONFIG du jour (l'étape config est en DERNIER dans _doFlush — jamais atteinte le 12/07)
    A.DB.params = { ...(A.DB.params || {}), devise: 'USD' }

    const s = await A.boot.flush()
    // le poison est un échec PAR ENREGISTREMENT, pas un abort global
    expect(s.errors).toHaveLength(1)
    expect(s.errors[0]).toMatchObject({ op: 'upsert', coll: 'documents', key: '999' })
    expect(s.errors[0].message).toMatch(/check|23514/i)
    // la suppression et la config ont SURVÉCU au poison (le cœur du bug du 12/07)
    expect(s.removes).toContainEqual({ coll: 'mouvements', key: '100' })
    expect(s.config).toBe('written')
  })

  it('appareil B : re-hydrate → voit la suppression + la config, PAS le poison ; le poison reste retenté côté A', async () => {
    const B = await device()
    expect((B.DB.mouvements || []).some(m => m.id === 100)).toBe(false)   // la suppression est ARRIVÉE au cloud
    expect(B.DB.params && B.DB.params.devise).toBe('USD')                  // la config est ARRIVÉE au cloud
    expect((B.DB.documents || []).some(d => d.id === 999)).toBe(false)     // le poison n'a PAS été inséré

    // côté A (nouveau boot, même rôle) : le poison resté local est RETENTÉ au flush suivant (baseline
    // non avancé) → toujours en erreur isolée, jamais un abort. Guérison = corriger/supprimer le record.
    const A2 = await device()
    A2.DB.documents = [...(A2.DB.documents || []), { id: 999, name: 'poison.pdf', parentType: 'type-inconnu-poison', parentRef: 'P-1' }]
    const s2 = await A2.boot.flush()
    expect(s2.errors).toHaveLength(1)
    expect(s2.errors[0].coll).toBe('documents')
  })

  it('onAuthChange (P1.1 session morte) : le callback reçoit (session, evt) — SIGNED_OUT à la déconnexion', async () => {
    const boot = createBoot(anonClient())
    const events = []
    boot.onAuthChange((session, evt) => events.push({ evt, hasSession: !!session }))
    await boot.loginEmail(U.email, U.pass)
    await boot.logout()
    // l'émission est asynchrone → petite attente bornée
    for (let i = 0; i < 20 && !events.some(e => e.evt === 'SIGNED_OUT'); i++) await new Promise(r => setTimeout(r, 100))
    expect(events.some(e => e.evt === 'SIGNED_IN' && e.hasSession)).toBe(true)
    expect(events.some(e => e.evt === 'SIGNED_OUT' && !e.hasSession)).toBe(true)
  })
})
