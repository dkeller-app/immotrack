// Test d'INTÉGRATION « re-location » contre le VRAI Postgres — rejoue EXACTEMENT le drame
// B-REBAIL-TOMBSTONE (bail Baysang/Ferrette-001 perdu, 12-14/07/2026) et prouve le chemin « revive ».
//
//   Le bug : l'id cloud d'un bail = detUuid('bail', ref-logement) → reloger un logement produit un id
//   qui COLLISIONNE avec le tombstone de l'ancien bail. Insert ON CONFLICT DO NOTHING → conflit éternel ;
//   update gardé deleted_at IS NULL → conflit éternel. Le nouveau bail ne monte JAMAIS (perte silencieuse).
//
//   Ici : appareil A crée le bail Misslin sur Ferrette-001, puis le termine (tombstone). Un appareil
//   FRAIS (hydrate qui exclut le tombstone = le cas prod réel du 13/07) crée le bail Baysang sur le même
//   logement → il doit être REVIVIFIÉ (ligne ré-ouverte, v+1), pas rejeté. L'appareil B le voit vivant.
//   + anti-résurrection : un appareil PÉRIMÉ qui ÉDITE l'ancien bail supprimé ailleurs reste en conflit
//   (jamais de résurrection — classe « Delle b »), et le verrou légal n'est pas approché (baux non signés).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createBoot } from '../../js/app/supabase-boot.js'
import { createUser, adminClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const U = { email: `revive-${RUN}@example.test`, pass: 'Test-Passw0rd!R' }
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const REF = 'Ferrette - 001'                          // le vrai logement reloué
const MISSLIN = { entity: 'SCI Ferrette', locataires: [{ nom: 'Misslin' }], hc: 655, ch: 30, dg: 655, debut: '2020-01-01', fin: '2026-01-01' }
const BAYSANG = { entity: 'SCI Ferrette', locataires: [{ nom: 'Baysang', prenom: 'Tiffany' }], hc: 495, ch: 30, dg: 495, debut: '2026-07-18', fin: '2032-07-17' }

// un « appareil » = un boot complet (client dédié, login, wireStore, hydrate, seed) — comme l'app.
async function device() {
  const boot = createBoot(anonClient())
  await boot.loginEmail(U.email, U.pass)
  const esp = await boot.resolveEspace('Espace Revive')
  let DB = {}
  boot.wireStore({ espaceId: esp.espaceId, ownerId: esp.ownerId, getDB: () => DB, schedule: null })
  DB = await boot.hydrate()
  boot.seed(DB)
  return { boot, DB, esp }
}

// lecture directe de la ligne bail (service role → hors RLS/soft-delete filter) pour inspecter deleted_at/version.
async function bailRow(espaceId) {
  const { data } = await adminClient().from('baux').select('id, version, deleted_at, legacy_raw')
    .eq('espace_id', espaceId).order('created_at', { ascending: true })
  return (data && data[0]) || null
}

let espaceId = null

beforeAll(async () => { await createUser(U.email, U.pass) })
afterAll(async () => { if (espaceId) await teardownOwner(U.email, [espaceId]) })

describe('B-REBAIL-TOMBSTONE — re-location Misslin→Baysang sur le VRAI Postgres', () => {
  it('appareil A : bail Misslin créé sur Ferrette-001 → poussé sans conflit (ligne vivante)', async () => {
    const A = await device()
    espaceId = A.esp.espaceId
    A.DB.entites = [{ nom: 'SCI Ferrette', immeubles: [] }]
    A.DB.logements = [{ id: 1, ref: REF, entity: 'SCI Ferrette' }]
    A.DB.baux = { [REF]: { ...MISSLIN } }
    const s = await A.boot.flush()
    expect(s.errors).toEqual([]); expect(s.conflicts).toEqual([])
    expect(s.upserts).toContainEqual({ coll: 'baux', key: REF.toLowerCase() })
    const row = await bailRow(espaceId)
    expect(row.deleted_at).toBeNull()
    expect(row.legacy_raw.locataires[0].nom).toBe('Misslin')
  })

  it('appareil A : fin du bail Misslin → tombstone poussé (ligne soft-deleted côté cloud)', async () => {
    const A = await device()                                  // ré-hydrate l'état vivant Misslin
    expect(A.DB.baux[REF]).toBeTruthy()
    A.DB.baux[REF] = { ...A.DB.baux[REF], _deleted: true, _deletedAt: '2026-07-12T10:00:00Z' }   // fin de bail = tombstone en place
    const s = await A.boot.flush()
    expect(s.errors).toEqual([])
    expect(s.removes).toContainEqual({ coll: 'baux', key: REF.toLowerCase() })
    const row = await bailRow(espaceId)
    expect(row.deleted_at).not.toBeNull()                     // le slot est un TOMBSTONE
  })

  it('🎯 appareil FRAIS : bail Baysang créé sur le même logement → REVIVIFIÉ (v+1), pas rejeté', async () => {
    const C = await device()                                  // session fraîche : hydrate EXCLUT le tombstone
    expect(C.DB.baux[REF]).toBeUndefined()                    // le bail supprimé n'est pas hydraté (cas prod 13/07)
    const tombstone = await bailRow(espaceId)
    C.DB.baux[REF] = { ...BAYSANG }                           // relocation : nouveau bail sur Ferrette-001
    const s = await C.boot.flush()
    expect(s.errors).toEqual([]); expect(s.conflicts).toEqual([]); expect(s.skipped).toEqual([])
    expect(s.revives).toContainEqual({ coll: 'baux', key: REF.toLowerCase() })   // 'revived' tracé À PART (distinct des upserts)
    expect(s.upserts).toEqual([])                                                // la relocation n'est PAS un upsert banal
    const row = await bailRow(espaceId)
    expect(row.id).toBe(tombstone.id)                         // MÊME ligne (même id déterministe)
    expect(row.deleted_at).toBeNull()                         // slot RÉ-OUVERT
    expect(Number(row.version)).toBe(Number(tombstone.version) + 1)   // v+1
    expect(row.legacy_raw.locataires[0].nom).toBe('Baysang')         // nouveau payload
    expect(row.legacy_raw.hc).toBe(495)
  })

  it('appareil B : re-hydrate → voit le bail Baysang VIVANT sur Ferrette-001 (redescend)', async () => {
    const B = await device()
    expect(B.DB.baux[REF]).toBeTruthy()
    expect(B.DB.baux[REF].locataires[0].nom).toBe('Baysang')
    expect(B.DB.baux[REF].hc).toBe(495)
  })

  it('ANTI-RÉSURRECTION : un appareil PÉRIMÉ qui édite un bail supprimé ailleurs reste en CONFLIT (pas de revive)', async () => {
    // appareil D hydrate quand Baysang est VIVANT (le bail est dans son baseline)
    const D = await device()
    expect(D.DB.baux[REF]).toBeTruthy()
    // un autre appareil supprime le bail entre-temps
    const A = await device()
    A.DB.baux[REF] = { ...A.DB.baux[REF], _deleted: true, _deletedAt: '2026-07-20T10:00:00Z' }
    const sDel = await A.boot.flush()
    expect(sDel.removes).toContainEqual({ coll: 'baux', key: REF.toLowerCase() })
    // D, périmé, ÉDITE l'ancien bail (prev défini au baseline → allowRevive:false) → conflit, jamais revive
    D.DB.baux[REF] = { ...D.DB.baux[REF], hc: 999 }
    const sEdit = await D.boot.flush()
    expect(sEdit.conflicts).toContainEqual({ coll: 'baux', key: REF.toLowerCase() })
    expect(sEdit.upserts).toEqual([])
    const row = await bailRow(espaceId)
    expect(row.deleted_at).not.toBeNull()                     // RESTE supprimé (pas de résurrection)
    expect(row.legacy_raw.hc).not.toBe(999)                   // l'édition périmée n'a pas écrasé
  })
})

// ── 2ᵉ cas ciblé : le PENDANT CLOUD de BUG-RECREATE-REF-TOMBSTONE (v15.262) sur une table SANS
// colonne `locked` (logements). Prouve que le chemin revive GÉNÉRIQUE (store.upsert) marche pour une
// clé naturelle recréée hors baux, et que l'absence de `.eq('locked')` ne casse rien en vrai Postgres.
const REFLOG = 'Lot-Recree-01'
async function logRowByRef(espaceId, ref) {
  const { data } = await adminClient().from('logements').select('id, version, deleted_at, legacy_raw')
    .eq('espace_id', espaceId).order('created_at', { ascending: true })
  return (data || []).find(r => r.legacy_raw && r.legacy_raw.ref === ref) || null
}

describe('B-REBAIL classe — logement recréé même ref (pendant cloud v15.262) sur le VRAI Postgres', () => {
  it('appareil A : logement créé → poussé (insert), puis supprimé → tombstone', async () => {
    const A = await device()
    A.DB.logements = [...(A.DB.logements || []), { id: 900, ref: REFLOG, entity: 'SCI Ferrette', surf: 30 }]
    const s1 = await A.boot.flush()
    expect(s1.errors).toEqual([])
    expect(s1.upserts).toContainEqual({ coll: 'logements', key: REFLOG.toLowerCase() })   // insert frais, PAS un revive
    expect(s1.revives).toEqual([])
    // suppression (tombstone en place)
    const A2 = await device()
    A2.DB.logements = A2.DB.logements.map(l => l.ref === REFLOG ? { ...l, _deleted: true, _deletedAt: '2026-07-14T10:00:00Z' } : l)
    const s2 = await A2.boot.flush()
    expect(s2.removes).toContainEqual({ coll: 'logements', key: REFLOG.toLowerCase() })
    expect((await logRowByRef(espaceId, REFLOG)).deleted_at).not.toBeNull()
  })

  it('🎯 appareil FRAIS : logement recréé même ref → REVIVIFIÉ (table sans colonne locked, v+1)', async () => {
    const C = await device()
    expect((C.DB.logements || []).some(l => l.ref === REFLOG)).toBe(false)   // le supprimé n'est pas hydraté
    const tombstone = await logRowByRef(espaceId, REFLOG)
    C.DB.logements = [...(C.DB.logements || []), { id: 901, ref: REFLOG, entity: 'SCI Ferrette', surf: 42 }]
    const s = await C.boot.flush()
    expect(s.errors).toEqual([]); expect(s.conflicts).toEqual([]); expect(s.skipped).toEqual([])
    expect(s.revives).toContainEqual({ coll: 'logements', key: REFLOG.toLowerCase() })   // ré-ouverture, pas rejet
    const row = await logRowByRef(espaceId, REFLOG)
    expect(row.id).toBe(tombstone.id)                        // MÊME ligne (id déterministe sur la ref)
    expect(row.deleted_at).toBeNull()                        // slot ré-ouvert
    expect(Number(row.version)).toBe(Number(tombstone.version) + 1)
    expect(row.legacy_raw.surf).toBe(42)                     // nouveau payload
  })
})
