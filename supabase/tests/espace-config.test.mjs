import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import 'dotenv/config'
import { createUser, userClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `cfg-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `cfg-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }

let clientA, clientB, espaceA, espaceB
const db = () => new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })

beforeAll(async () => {
  await createUser(A.email, A.pass); await createUser(B.email, B.pass)
  clientA = await userClient(A.email, A.pass); clientB = await userClient(B.email, B.pass)
  const a = await clientA.rpc('create_espace', { p_nom: 'Espace Alice CFG' }); if (a.error) throw a.error; espaceA = a.data.id
  const b = await clientB.rpc('create_espace', { p_nom: 'Espace Bob CFG' });   if (b.error) throw b.error; espaceB = b.data.id
})

afterAll(async () => {
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(B.email, [espaceB])
})

describe('espace_config — config par espace, isolée', () => {
  it('RLS FORCE + ≥4 policies (conforme check:rls)', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(
        `select c.relrowsecurity en, c.relforcerowsecurity fo,
                (select count(*) from pg_policy p where p.polrelid=c.oid) np
         from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relname='espace_config'`)
      expect(rows[0].en).toBe(true); expect(rows[0].fo).toBe(true)
      expect(Number(rows[0].np)).toBeGreaterThanOrEqual(4)
    } finally { await c.end() }
  })

  it('Alice (writer) écrit et relit SA config', async () => {
    const { error: e1 } = await clientA.from('espace_config')
      .insert({ espace_id: espaceA, data: { params: { theme: 'dark' }, categories: ['loyer'] } })
    expect(e1).toBeNull()
    const { data } = await clientA.from('espace_config').select('data').eq('espace_id', espaceA).single()
    expect(data.data.params.theme).toBe('dark')
  })

  it('Bob NE VOIT PAS la config d\'Alice', async () => {
    const { data } = await clientB.from('espace_config').select('*').eq('espace_id', espaceA)
    expect(data).toEqual([])
  })

  it('Bob NE PEUT PAS écrire dans la config d\'Alice', async () => {
    const { error } = await clientB.from('espace_config')
      .insert({ espace_id: espaceA, data: { hack: true } })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })

  it('Bob écrit SA propre config (non-régression)', async () => {
    const { error } = await clientB.from('espace_config')
      .insert({ espace_id: espaceB, data: { params: {} } })
    expect(error).toBeNull()
  })
})
