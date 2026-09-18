// Runner pg : applique un fichier SQL (migration) ou une requête à la base Supabase HÉBERGÉE.
// C'est le process RÉEL d'application des migrations depuis 0038 (le suivi CLI `supabase migration list`
// ne connaît en remote que 0001→0037 hors 0033 ; `supabase db push` rejouerait 0033 + 0038→0049 → refus).
// Après application d'une migration, on ENREGISTRE sa version dans supabase_migrations.schema_migrations
// (mode `migrate`) pour garder le suivi CLI cohérent. Rien d'autre n'est modifié.
//
// Usage :
//   node scripts/db-run.mjs migrate supabase/migrations/0050_xxx.sql   → applique + enregistre la version
//   node scripts/db-run.mjs file    <chemin.sql>                        → applique sans enregistrer
//   node scripts/db-run.mjs query   "select ..."                        → requête ad hoc (lecture/diagnostic)
// Lit SUPABASE_DB_URL dans .env (racine). Ne jamais lancer sans avoir relu le SQL : c'est la PROD.
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import pg from 'pg'
config({ quiet: true })

const mode = process.argv[2], arg = process.argv[3]
if (!['migrate', 'file', 'query'].includes(mode) || !arg) {
  console.error('usage: node scripts/db-run.mjs migrate|file|query <chemin.sql|sql>'); process.exit(1)
}
if (!process.env.SUPABASE_DB_URL) { console.error('SUPABASE_DB_URL introuvable dans .env'); process.exit(1) }
const sql = mode === 'query' ? arg : readFileSync(arg, 'utf8')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  const res = await client.query(sql)
  for (const r of (Array.isArray(res) ? res : [res])) {
    console.log(r.command || '', r.rowCount ?? '', r.rows && r.rows.length ? JSON.stringify(r.rows) : '')
  }
  if (mode === 'migrate') {
    const version = (basename(arg).match(/^(\d{4})_/) || [])[1]
    if (!version) throw new Error('nom de migration attendu : NNNN_nom.sql')
    const name = basename(arg).replace(/^\d{4}_/, '').replace(/\.sql$/, '')
    await client.query('insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict (version) do nothing', [version, name])
    console.log('schema_migrations <- version', version)
  }
  console.log('OK')
} catch (e) {
  console.error('ERREUR:', e.message); process.exit(1)
} finally { await client.end() }
