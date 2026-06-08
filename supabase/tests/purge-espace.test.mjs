import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import 'dotenv/config'
import { createUser, userClient, deleteUserByEmail, adminClient } from './helpers/clients.mjs'
import { seedChain } from './helpers/p0b-fixtures.mjs'
import { lockRow } from './helpers/p0c1-fixtures.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `purge-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }

let clientA, espaceA, idsA

function db() { return new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }) }

beforeAll(async () => {
  await createUser(A.email, A.pass)
  clientA = await userClient(A.email, A.pass)
  const { data: ea, error } = await clientA.rpc('create_espace', { p_nom: 'Espace purge' })
  if (error) throw error
  espaceA = ea.id
  idsA = await seedChain(clientA, espaceA)
  await lockRow(clientA, 'baux', idsA.bail)   // un signé verrouillé dans l'espace
})

afterAll(async () => {
  // au cas où le test de purge échoue, on tente quand même de nettoyer l'utilisateur.
  await deleteUserByEmail(A.email).catch(() => {})
})

describe('purge_espace — suppression dure d\'un tenant', () => {
  it('un client authentifié NON privilégié ne peut PAS appeler purge_espace', async () => {
    const { error } = await clientA.rpc('purge_espace', { p_espace_id: espaceA })
    expect(error).not.toBeNull()                    // EXECUTE révoqué pour authenticated
    expect(error.message).toMatch(/permission denied|not.*exist|function/i)
  })

  it('service_role purge l\'espace : membres + données métier (dont signé) supprimés', async () => {
    const before = await adminClient().from('baux').select('id', { count: 'exact', head: true }).eq('espace_id', espaceA)
    expect(before.count).toBeGreaterThanOrEqual(1)   // il y a bien un bail (verrouillé)

    const { error } = await adminClient().rpc('purge_espace', { p_espace_id: espaceA })
    expect(error).toBeNull()

    // tout a disparu : espace, membres, baux, edl, etc.
    const c = db(); await c.connect()
    try {
      for (const t of ['espaces', 'espace_members', 'baux', 'edl', 'logements', 'entites', 'baux_evenements']) {
        const col = t === 'espaces' ? 'id' : 'espace_id'
        const { rows } = await c.query(`select count(*)::int as n from public.${t} where ${col} = $1`, [espaceA])
        expect(rows[0].n, `${t} doit être vide après purge`).toBe(0)
      }
    } finally { await c.end() }

    // l'utilisateur devient supprimable (plus d'espace qui le référence via created_by).
    await expect(deleteUserByEmail(A.email)).resolves.not.toThrow()
  })
})
