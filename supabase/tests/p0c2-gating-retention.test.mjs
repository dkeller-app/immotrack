import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import 'dotenv/config'
import { createUser, userClient, deleteUserByEmail } from './helpers/clients.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p0c2-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }

let clientA, espaceA

function db() {
  return new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
}

beforeAll(async () => {
  await createUser(A.email, A.pass)
  clientA = await userClient(A.email, A.pass)
  const { data: ea, error } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P0C2' })
  if (error) throw error
  espaceA = ea.id
})

afterAll(async () => {
  // ⚠️ Fuite de tenant de test CONNUE (cf. P0-C1 audit) : deleteUserByEmail ne supprime pas
  // l'espace (espaces.created_by NO ACTION + protect_last_owner). Le correctif robuste = la
  // primitive de suppression d'espace, planifiée en tâche dédiée. 1 user/run, inoffensif ici.
  await deleteUserByEmail(A.email)
})

describe('P0-C2 — catalogue plans (global, data-driven)', () => {
  it('la table plans existe avec le palier « free » plancher', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(`select id, limite_biens, limite_membres from public.plans where id = 'free'`)
      expect(rows.length).toBe(1)
      expect(rows[0].limite_biens).toBe(1)
      expect(rows[0].limite_membres).toBe(1)
    } finally { await c.end() }
  })

  it('le palier « beta » est illimité (limites NULL) avec features.all', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(`select limite_biens, features from public.plans where id = 'beta'`)
      expect(rows[0].limite_biens).toBeNull()
      expect(rows[0].features.all).toBe(true)
    } finally { await c.end() }
  })

  it('plans est en RLS FORCE avec ≥1 policy (conforme check:rls)', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(
        `select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
                (select count(*) from pg_policy p where p.polrelid = c.oid) as npol
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname='public' and c.relname='plans'`)
      expect(rows[0].enabled).toBe(true)
      expect(rows[0].forced).toBe(true)
      expect(Number(rows[0].npol)).toBeGreaterThanOrEqual(1)
    } finally { await c.end() }
  })

  it('un membre authentifié PEUT lire le catalogue mais NE PEUT PAS l\'écrire', async () => {
    const { data: read } = await clientA.from('plans').select('id')
    expect(read.map(r => r.id).sort()).toEqual(['beta', 'free'])
    const { error: wErr } = await clientA.from('plans')
      .insert({ id: `hack-${RUN}`, nom: 'pirate' })
    expect(wErr).not.toBeNull()                       // aucune policy insert pour authenticated
    expect(wErr.message).toMatch(/row-level security|violates/i)
  })
})
