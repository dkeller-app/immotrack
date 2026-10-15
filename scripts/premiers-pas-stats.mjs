// Statistiques de mise en route de la bêta (docs/CDC-PREMIERS-PAS.md §5) — LECTURE SEULE.
// Compte ce qui existe : chaque compte inscrit de la liste d'accès bêta, son espace propre, et la progression
// enregistrée dans espace_config_private.data.params.premiersPas (aucun nombre de testeurs figé).
// Les comptes opposés à la mesure (case décochée dans Mon profil) ne sont comptés que dans « opposition ».
//
// Usage :
//   node scripts/premiers-pas-stats.mjs              → testeurs ajoutés par l'admin + invités inscrits
//   node scripts/premiers-pas-stats.mjs --testeurs   → testeurs ajoutés par l'admin seulement
//   node scripts/premiers-pas-stats.mjs --detail     → une ligne par compte en plus du résumé
// Lit SUPABASE_DB_URL dans .env (racine), comme scripts/db-run.mjs. N'écrit rien.
import { config } from 'dotenv'
import pg from 'pg'
import { statsPremiersPas } from '../js/core/premiers-pas.js'
config({ quiet: true })

const args = new Set(process.argv.slice(2))
if (!process.env.SUPABASE_DB_URL) { console.error('SUPABASE_DB_URL introuvable dans .env'); process.exit(1) }

const SQL = `
  select b.email, b.source, b.registered_at as inscrit_le,
         (select p.data -> 'params' -> 'premiersPas'
            from public.espaces e
            join public.espace_config_private p on p.espace_id = e.id
           where e.created_by = u.id
           order by e.created_at asc limit 1) as pp
    from public.beta_allowlist b
    join auth.users u on lower(u.email) = lower(b.email)
   where b.registered_at is not null
     ${args.has('--testeurs') ? "and b.source = 'admin'" : ''}
   order by b.registered_at`

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query('begin read only')
  const { rows } = await client.query(SQL)
  await client.query('rollback')
  const lignes = rows.map((r) => ({ email: r.email, inscritLe: r.inscrit_le ? new Date(r.inscrit_le).toISOString() : null, pp: r.pp || null }))
  const s = statsPremiersPas(lignes)
  console.log(JSON.stringify(s, null, 2))
  if (args.has('--detail')) {
    for (const l of lignes) {
      const pp = l.pp || {}
      const faites = Object.entries(pp.etapes || {}).filter(([, v]) => v && !v.avant).map(([k]) => k)
      console.log([l.email, (pp.visite && pp.visite.etat) || '—', pp.mesure === false ? 'opposition' : faites.join(',') || '—', pp.termineLe || ''].join(' | '))
    }
  }
} catch (e) {
  console.error('ERREUR:', e.message); process.exit(1)
} finally { await client.end() }
