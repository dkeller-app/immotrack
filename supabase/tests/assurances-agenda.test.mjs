import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import 'dotenv/config'
import { createUser, userClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'
import { seedChain } from './helpers/p0b-fixtures.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `aa-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `aa-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }
const TABLES = ['assurances', 'agenda']

let clientA, clientB, espaceA, espaceB, idsA
const db = () => new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })

beforeAll(async () => {
  await createUser(A.email, A.pass); await createUser(B.email, B.pass)
  clientA = await userClient(A.email, A.pass); clientB = await userClient(B.email, B.pass)
  const a = await clientA.rpc('create_espace', { p_nom: 'Espace Alice AA' }); if (a.error) throw a.error; espaceA = a.data.id
  const b = await clientB.rpc('create_espace', { p_nom: 'Espace Bob AA' });   if (b.error) throw b.error; espaceB = b.data.id
  idsA = await seedChain(clientA, espaceA)   // entité/immeuble/logement…
})

afterAll(async () => {
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(B.email, [espaceB])
})

describe('assurances + agenda — schéma & RLS', () => {
  for (const t of TABLES) {
    it(`${t} : RLS FORCE + ≥4 policies + freeze (conforme check:rls)`, async () => {
      const c = db(); await c.connect()
      try {
        const { rows } = await c.query(
          `select c.relrowsecurity en, c.relforcerowsecurity fo,
                  (select count(*) from pg_policy p where p.polrelid=c.oid) np,
                  (select count(*) from pg_trigger g where g.tgrelid=c.oid and g.tgname='trg_freeze_espace_id') frz
           from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname=$1`, [t])
        expect(rows[0].en).toBe(true); expect(rows[0].fo).toBe(true)
        expect(Number(rows[0].np)).toBeGreaterThanOrEqual(4)
        expect(Number(rows[0].frz)).toBe(1)
      } finally { await c.end() }
    })
  }
})

describe('assurances + agenda — isolation cross-tenant', () => {
  it('Alice (writer) crée une assurance + un événement agenda dans son espace', async () => {
    const { error: e1 } = await clientA.from('assurances').insert({
      espace_id: espaceA, logement_id: idsA.logement, compagnie: 'AXA', echeance: '2026-12', prime: 180, locataire: 'Dupont',
    })
    expect(e1).toBeNull()
    const { error: e2 } = await clientA.from('agenda').insert({
      espace_id: espaceA, logement_id: idsA.logement, titre: 'Révision loyer', date_evt: '2026-07-01', categorie: 'loyer', done: false,
    })
    expect(e2).toBeNull()
  })

  it('Bob NE VOIT NI assurance NI agenda d\'Alice', async () => {
    for (const t of TABLES) {
      const { data } = await clientB.from(t).select('id').eq('espace_id', espaceA)
      expect(data).toEqual([])
    }
  })

  it('Bob NE PEUT PAS écrire dans l\'espace d\'Alice (refus RLS)', async () => {
    const r1 = await clientB.from('assurances').insert({ espace_id: espaceA, compagnie: 'hack' })
    expect(r1.error).not.toBeNull()
    expect(r1.error.code === '42501' || /row-level security/i.test(r1.error.message)).toBe(true)
    const r2 = await clientB.from('agenda').insert({ espace_id: espaceA, titre: 'hack' })
    expect(r2.error).not.toBeNull()
    expect(r2.error.code === '42501' || /row-level security/i.test(r2.error.message)).toBe(true)
  })

  it('FK composite : une assurance vers un logement d\'un AUTRE espace est refusée (service-role)', async () => {
    const { adminClient } = await import('./helpers/clients.mjs')
    const { error } = await adminClient().from('assurances').insert({
      espace_id: espaceB, logement_id: idsA.logement,   // logement d'Alice dans l'espace de Bob → introuvable
    })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/violates foreign key|assurances_logement_fk/i)
  })
})
