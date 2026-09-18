// Simulation SQL TRANSACTIONNELLE de la migration 0050 (preuve d'isolation SANS modifier la base).
//
// Principe : une seule transaction, ROLLBACK systématique. On sème 3 utilisateurs + 1 espace + 3 membres
// (Alice = owner PLEIN, Bob + Carol = SCOPÉS), on mesure ce que Bob voit AVANT la migration (fuite attendue :
// 3 lignes = toute la liste), on applique 0050 dans la même transaction, on re-mesure (attendu : 1 ligne =
// la sienne), et Alice (plein) doit toujours voir les 3. L'identité est simulée comme PostgREST le fait :
// `set local role authenticated` + `request.jwt.claims` (auth.uid() lit ces GUC). Rien n'est persisté.
//
// Usage : node supabase/tests/sim/0050-espace-members-scope.sim.mjs   (lit SUPABASE_DB_URL dans .env)
// Sortie : « SIM 0050 OK » + code 0, sinon détail + code 1. Runnable AVANT et APRÈS déploiement (idempotent :
// après déploiement, la mesure « avant » vaut déjà 1 → signalée comme « déjà appliquée », pas comme échec).
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
config({ quiet: true })

const MIG = new URL('../../migrations/0050_espace_members_select_scope.sql', import.meta.url)
// begin/commit du fichier retirés : on est DÉJÀ dans la transaction de simulation (un `commit` interne
// validerait la migration pour de vrai — c'est exactement ce qu'on ne veut pas ici).
const migSql = readFileSync(MIG, 'utf8').split(/\r?\n/).filter(l => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const alice = randomUUID(), bob = randomUUID(), carol = randomUUID(), dave = randomUUID(), espace = randomUUID()
const claims = uid => JSON.stringify({ sub: uid, role: 'authenticated' })

// Lit espace_members EN TANT QUE `uid` (rôle authenticated + claims JWT), puis revient au rôle d'origine.
async function membersSeenBy (uid) {
  await q('set local role authenticated')
  await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [claims(uid), uid])
  const { rows } = await q('select user_id, invite_email from public.espace_members where espace_id = $1 order by user_id', [espace])
  await q('reset role')
  return rows
}

let failed = false
const check = (label, cond, detail) => {
  console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : ' -- ' + detail))
  if (!cond) failed = true
}

try {
  await q('begin')
  // Fixtures minimales (auth.users → triggers beta 0038 tolérants ; tout est annulé au rollback).
  for (const [id, mail] of [[alice, 'alice'], [bob, 'bob'], [carol, 'carol']]) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1, $2, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now())",
      [id, 'sim0050-' + mail + '-' + RUN + '@example.test'])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1, $2, $3)', [espace, 'Espace SIM 0050', alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace, invite_email) values ($1,$2,'owner','active',true,null), ($1,$3,'lecture_seule','active',false,$5), ($1,$4,'lecture_seule','active',false,$6)",
    [espace, alice, bob, carol, 'bob-' + RUN + '@example.test', 'carol-' + RUN + '@example.test'])

  const { rows: pol0 } = await q("select pg_get_expr(polqual, polrelid) as qual from pg_policy where polname = 'members_select' and polrelid = 'public.espace_members'::regclass")
  console.log('AVANT : members_select USING =', pol0[0] && pol0[0].qual)
  const before = await membersSeenBy(bob)
  if (before.length === 3) console.log('  --  Bob (scopé) voit TOUTE la liste (3 lignes) = fuite documentée, 0050 pas encore appliquée')
  else if (before.length === 1) console.log('  --  Bob ne voit déjà que sa ligne : 0050 déjà appliquée dans cette base')
  else check('mesure AVANT cohérente (3 ou 1 ligne)', false, 'vu ' + before.length)

  await q(migSql)
  const { rows: pol } = await q("select pg_get_expr(polqual, polrelid) as qual from pg_policy where polname = 'members_select' and polrelid = 'public.espace_members'::regclass")
  console.log('APRÈS 0050 : members_select USING =', pol[0] && pol[0].qual)

  const bobAfter = await membersSeenBy(bob)
  check('Bob (scopé) ne voit QUE sa ligne', bobAfter.length === 1 && bobAfter[0].user_id === bob, JSON.stringify(bobAfter))
  check("Bob ne voit PAS l'email de Carol", !bobAfter.some(r => r.invite_email && r.invite_email.startsWith('carol-')), JSON.stringify(bobAfter))
  const carolAfter = await membersSeenBy(carol)
  check('Carol (scopée) ne voit QUE sa ligne', carolAfter.length === 1 && carolAfter[0].user_id === carol, JSON.stringify(carolAfter))
  const aliceAfter = await membersSeenBy(alice)
  check('Alice (owner PLEIN) voit toujours les 3 membres (non-régression)', aliceAfter.length === 3, 'vu ' + aliceAfter.length)
  // Membre plein NON owner (lecteur plein, full_espace=true) : voit tout aussi (comportement P0 inchangé).
  // (On n'abaisse PAS Alice : protect_last_owner refuse de rétrograder le dernier owner.)
  await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1, $2, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now())",
    [dave, 'sim0050-dave-' + RUN + '@example.test'])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'lecture_seule','active',true)", [espace, dave])
  const fullReader = await membersSeenBy(dave)
  check('Un lecteur PLEIN (full_espace=true, lecture_seule) voit les 4 membres', fullReader.length === 4, 'vu ' + fullReader.length)
  const bobStill = await membersSeenBy(bob)
  check('Bob (scopé) ne voit toujours que sa ligne après ajout du 4e membre', bobStill.length === 1, 'vu ' + bobStill.length)
} catch (e) {
  failed = true
  console.error('  KO  exception :', e.message)
} finally {
  try { await q('rollback') } catch (e) {}
  const { rows } = await q('select count(*)::int as n from public.espaces where id = $1', [espace])
  console.log('ROLLBACK — espace de simulation persisté ?', rows[0].n === 0 ? 'non (0 ligne)' : 'OUI — ANOMALIE')
  if (rows[0].n !== 0) failed = true
  await client.end()
}
console.log(failed ? 'SIM 0050 ECHEC' : 'SIM 0050 OK')
process.exit(failed ? 1 : 0)
