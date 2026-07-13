import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createUser, userClient, deleteUserByEmail, adminClient } from './helpers/clients.mjs'
import { seedChain } from './helpers/p0b-fixtures.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

// RESET-CLOUD UX — purge_mon_espace (migration 0041) : la purge user-facing est GARDÉE
// côté serveur. Adversarial : anon, étranger, membre non-owner, owner d'un AUTRE espace,
// mauvais nom → tous REFUSÉS sans rien supprimer ; seul owner + nom exact purge.

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `purgeme-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }   // owner espace A
const B = { email: `purgeme-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }   // owner espace B (étranger à A)
const C = { email: `purgeme-carol-${RUN}@example.test`, pass: 'Test-Passw0rd!C' }   // membre NON-owner de A

const NOM_A = 'Espace à purger'   // accents + espaces : la confirmation est exacte, btrim seulement

let clientA, clientB, clientC, espaceA, espaceB

async function countEspace(espaceId) {
  const { count } = await adminClient().from('espaces').select('id', { count: 'exact', head: true }).eq('id', espaceId)
  return count
}

beforeAll(async () => {
  const [, bUser, cUser] = await Promise.all([createUser(A.email, A.pass), createUser(B.email, B.pass), createUser(C.email, C.pass)])
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  clientC = await userClient(C.email, C.pass)

  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: NOM_A })
  if (e1) throw e1
  espaceA = ea.id
  await seedChain(clientA, espaceA)   // données métier réelles dans A (la purge doit tout emporter)

  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Espace Bob' })
  if (e2) throw e2
  espaceB = eb.id

  // Carol = membre ACTIF de A mais PAS owner (lecture_seule, espace entier).
  const { error: e3 } = await clientA.from('espace_members')
    .insert({ espace_id: espaceA, user_id: cUser.id, role: 'lecture_seule', invite_status: 'active', full_espace: true })
  if (e3) throw e3
}, 60000)

afterAll(async () => {
  await teardownOwner(B.email, [espaceB]).catch(() => {})
  await teardownOwner(A.email, [espaceA]).catch(() => {})
  await deleteUserByEmail(C.email).catch(() => {})
})

describe('purge_mon_espace — gardes serveur (0041)', () => {
  it('anon (pas de JWT) ne peut PAS appeler la RPC', async () => {
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await anon.rpc('purge_mon_espace', { p_espace_id: espaceA, p_confirm_nom: NOM_A })
    expect(error).not.toBeNull()   // EXECUTE révoqué pour anon
    expect(await countEspace(espaceA)).toBe(1)
  })

  it('un authentifié ÉTRANGER à l\'espace est refusé, même avec le nom exact', async () => {
    const { error } = await clientB.rpc('purge_mon_espace', { p_espace_id: espaceA, p_confirm_nom: NOM_A })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/PURGE_NOT_OWNER/)
    expect(await countEspace(espaceA)).toBe(1)
  })

  it('un MEMBRE actif non-owner (lecture_seule) est refusé', async () => {
    const { error } = await clientC.rpc('purge_mon_espace', { p_espace_id: espaceA, p_confirm_nom: NOM_A })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/PURGE_NOT_OWNER/)
    expect(await countEspace(espaceA)).toBe(1)
  })

  it('cross-espace : l\'owner de A ne peut PAS purger l\'espace de B', async () => {
    const { error } = await clientA.rpc('purge_mon_espace', { p_espace_id: espaceB, p_confirm_nom: 'Espace Bob' })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/PURGE_NOT_OWNER/)
    expect(await countEspace(espaceB)).toBe(1)
  })

  it('owner avec un nom INEXACT (casse) → PURGE_CONFIRM_MISMATCH, rien supprimé', async () => {
    const { error } = await clientA.rpc('purge_mon_espace', { p_espace_id: espaceA, p_confirm_nom: 'espace à purger' })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/PURGE_CONFIRM_MISMATCH/)
    expect(await countEspace(espaceA)).toBe(1)
  })

  it('owner avec un nom vide/null → PURGE_CONFIRM_MISMATCH', async () => {
    const { error } = await clientA.rpc('purge_mon_espace', { p_espace_id: espaceA, p_confirm_nom: '' })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/PURGE_CONFIRM_MISMATCH/)
    const { error: e2 } = await clientA.rpc('purge_mon_espace', { p_espace_id: espaceA, p_confirm_nom: null })
    expect(e2).not.toBeNull()
    expect(e2.message).toMatch(/PURGE_CONFIRM_MISMATCH/)
    expect(await countEspace(espaceA)).toBe(1)
  })

  it('owner + nom exact (btrim : espaces autour tolérés) → espace + membres + données SUPPRIMÉS', async () => {
    const { error } = await clientA.rpc('purge_mon_espace', { p_espace_id: espaceA, p_confirm_nom: `  ${NOM_A} ` })
    expect(error).toBeNull()
    const admin = adminClient()
    for (const t of ['espaces', 'espace_members', 'entites', 'logements', 'baux']) {
      const col = t === 'espaces' ? 'id' : 'espace_id'
      const { count } = await admin.from(t).select(col, { count: 'exact', head: true }).eq(col, espaceA)
      expect(count, `${t} doit être vide après purge`).toBe(0)
    }
  })
})
