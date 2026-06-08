import { config } from 'dotenv'
import pg from 'pg'
config({ quiet: true })

const SQL = `
  select c.relname as table_name,
         c.relrowsecurity as rls_enabled,
         c.relforcerowsecurity as rls_forced,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
`

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const { rows } = await client.query(SQL)
await client.end()

const offenders = rows.filter(r => !r.rls_enabled || !r.rls_forced || Number(r.policies) < 1)
if (offenders.length) {
  console.error('❌ Tables sans RLS forcée + ≥1 policy :')
  for (const o of offenders)
    console.error(`   - ${o.table_name} (enabled=${o.rls_enabled}, forced=${o.rls_forced}, policies=${o.policies})`)
  process.exit(1)
}
console.log(`✅ Couverture RLS OK — ${rows.length} table(s) public, toutes protégées.`)
