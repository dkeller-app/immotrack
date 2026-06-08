// One-shot : purge les espaces/users de TEST orphelins (@example.test) accumulés par les
// anciens démontages (avant la primitive purge_espace). Réutilisable. NE touche QUE les
// emails de test (aucune donnée réelle — l'import tenant #1 est P0-E, pas encore fait).
// À lancer : node supabase/tests/_cleanup-orphans.mjs
import 'dotenv/config'
import pg from 'pg'
import { adminClient } from './helpers/clients.mjs'

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

// 1) espaces dont le créateur est un user de test → purge (logique purge_espace inline en
//    connexion privilégiée : mêmes GUC d'échappatoire, même ordre que la fonction 0023).
const { rows: espaces } = await c.query(`
  select e.id from public.espaces e
  join auth.users u on u.id = e.created_by
  where u.email like '%@example.test'`)
console.log(`Espaces de test à purger : ${espaces.length}`)
for (const { id } of espaces) {
  await c.query('begin')
  await c.query(`set local app.bypass_immutable = 'on'`)
  await c.query(`set local app.bypass_owner_guard = 'on'`)
  await c.query(`delete from public.baux_evenements where espace_id = $1`, [id])
  await c.query(`update public.baux set amends_id = null where espace_id = $1 and amends_id is not null`, [id])
  await c.query(`delete from public.espaces where id = $1`, [id])
  await c.query('commit')
}

// 2) users de test résiduels (dont membres non-créateurs).
const { rows: users } = await c.query(`select id, email from auth.users where email like '%@example.test'`)
console.log(`Users de test à supprimer : ${users.length}`)
await c.end()

const admin = adminClient()
let ok = 0
for (const u of users) {
  const { error } = await admin.auth.admin.deleteUser(u.id)
  if (error) console.warn(`  ! ${u.email}: ${error.message}`)
  else ok++
}
console.log(`Users supprimés : ${ok}/${users.length}. Nettoyage terminé.`)
