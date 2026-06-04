import { describe, it, expect } from 'vitest'
import pg from 'pg'
import 'dotenv/config'

async function tableExists(name) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const r = await c.query(
      `select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [name])
    return r.rowCount === 1
  } finally { await c.end() }
}

describe('schéma fondation', () => {
  it('table espaces existe', async () => { expect(await tableExists('espaces')).toBe(true) })
  it('table espace_members existe', async () => { expect(await tableExists('espace_members')).toBe(true) })
})

async function funcExists(name) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const r = await c.query(
      `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname=$1`, [name])
    return r.rowCount >= 1
  } finally { await c.end() }
}

describe('helpers d\'appartenance', () => {
  it('is_member existe', async () => { expect(await funcExists('is_member')).toBe(true) })
  it('has_role existe',  async () => { expect(await funcExists('has_role')).toBe(true) })
})

async function rlsForced(name) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const r = await c.query(
      `select relrowsecurity, relforcerowsecurity,
              (select count(*) from pg_policy p where p.polrelid=c.oid) as npol
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname=$1`, [name])
    const row = r.rows[0]
    return row && row.relrowsecurity && row.relforcerowsecurity && Number(row.npol) >= 4
  } finally { await c.end() }
}

describe('RLS forcée + policies', () => {
  it('espaces : RLS forcée + ≥4 policies',        async () => { expect(await rlsForced('espaces')).toBe(true) })
  it('espace_members : RLS forcée + ≥4 policies', async () => { expect(await rlsForced('espace_members')).toBe(true) })
})

describe('RPC create_espace', () => {
  it('create_espace existe', async () => { expect(await funcExists('create_espace')).toBe(true) })
})

async function triggerExists(name) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    const r = await c.query(`select 1 from pg_trigger where tgname=$1 and not tgisinternal`, [name])
    return r.rowCount >= 1
  } finally { await c.end() }
}

describe('invariants triggers', () => {
  it('trigger dernier-owner sur espace_members', async () =>
    { expect(await triggerExists('trg_protect_last_owner')).toBe(true) })
  it('trigger version/updated_at sur espaces', async () =>
    { expect(await triggerExists('trg_touch_espaces')).toBe(true) })
})
