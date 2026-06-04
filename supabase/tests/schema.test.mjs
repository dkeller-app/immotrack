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
