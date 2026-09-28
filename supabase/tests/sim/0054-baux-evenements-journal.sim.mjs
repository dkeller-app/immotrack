// Simulation SQL TRANSACTIONNELLE de la migration 0054 (journal des baux signés sur `baux_evenements`).
// Une seule transaction, ROLLBACK systématique : rien n'est persisté. Chaque action « en tant que » est
// jouée dans un SAVEPOINT puis annulée (même patron que 0051-0053-partage-durcissement.sim.mjs).
//
// Acteurs : Alice = owner PLEIN · Carol = SCOPÉE gestionnaire de SCI-A (aucun droit sur SCI-B).
// Vérifie : (1) avant 0054 le type 'modification' est refusé ; (2) après : Alice écrit/lit une entrée
// (legacy_raw, legacy_id, bail_debut) sur un bail SIGNÉ VERROUILLÉ sans toucher sa ligne ; (3) Carol
// écrit/lit sur SCI-A seulement (RLS par entité inchangée) ; (4) CHECK : 'avenant' accepté, type inconnu
// refusé ; (5) la ligne du bail signé reste immuable.
// Usage : node supabase/tests/sim/0054-baux-evenements-journal.sim.mjs   (lit SUPABASE_DB_URL dans .env)
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
config({ quiet: true })

function loadMigration (name) {
  const raw = readFileSync(new URL('../../migrations/' + name, import.meta.url), 'utf8')
  const sql = raw.split(/\r?\n/).filter(l => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n')
  const noComments = sql.split(/\r?\n/).map(l => l.replace(/--.*$/, '')).join('\n')
  if (/\bcommit\b\s*;/i.test(noComments)) throw new Error('COMMIT résiduel dans ' + name + ' : simulation refusée')
  return sql
}
const MIG = loadMigration('0054_baux_evenements_journal.sql')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), carol: randomUUID() }
const MAIL = k => 'sim0054-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()
const E = { A: randomUUID(), B: randomUUID() }, I = { A: randomUUID(), B: randomUUID() }, L = { A: randomUUID(), B: randomUUID() }
const B = { A: randomUUID(), B: randomUUID() }
const REF = { A: 'SIM54-A-' + RUN, B: 'SIM54-B-' + RUN }

async function asUser (uid, sql, params) {
  await q('savepoint su')
  try {
    await q('set local role authenticated')
    await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
      [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
    const r = await q(sql, params)
    return { ok: true, rows: r.rows }
  } catch (e) {
    return { ok: false, code: e.code, msg: e.message }
  } finally {
    await q('rollback to savepoint su')
  }
}

let failed = false
const check = (label, cond, detail) => { console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : ' -- ' + detail)); if (!cond) failed = true }

const INS_EVT = "insert into public.baux_evenements (espace_id, bail_id, type_evenement, date_evenement, legacy_id, bail_debut, legacy_raw) values ($1,$2,$3,'2026-09-28',$4,'2025-01-01',$5::jsonb) returning id"
const raw = (ref) => JSON.stringify({ id: 'bj_' + RUN, ref, bailDebut: '2025-01-01', type: 'modification', changements: [{ champ: 'tel', avant: '06', apres: '07' }] })

try {
  await q('begin')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0054', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  for (const s of ['A', 'B']) {
    await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [E[s], espace, 'SCI-' + s + '-' + RUN])
    await q('insert into public.immeubles (id, espace_id, entite_id, nom) values ($1,$2,$3,$4)', [I[s], espace, E[s], 'Imm-' + s + '-' + RUN])
    await q("insert into public.logements (id, espace_id, entite_id, immeuble_id, ref, type, surface, loyer_hc_ref, charges_ref) values ($1,$2,$3,$4,$5,'appartement',40,600,50)", [L[s], espace, E[s], I[s], REF[s]])
    await q("insert into public.baux (id, espace_id, entite_id, logement_id, type_bail, hc, ch, dg, jour_paiement, date_debut, locataires) values ($1,$2,$3,$4,'nu',600,50,600,1,'2025-01-01','[{\"nom\":\"Sim\"}]'::jsonb)", [B[s], espace, E[s], L[s]])
    // Signature : bail verrouillé (transition false → true permise par 0014), comme sealSignedBaux côté client.
    await q("update public.baux set locked = true, content_hash = $2, signature_source = 'immotrack' where id = $1", [B[s], 'a'.repeat(64)])
  }
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.A, U.carol])
  const versionBailA = (await q('select version from public.baux where id = $1', [B.A])).rows[0].version

  console.log('AVANT 0054 :')
  const avant = await asUser(U.alice, INS_EVT, [espace, B.A, 'modification', 'bj_' + RUN, raw(REF.A)])
  check("type 'modification' refusé avant 0054 (preuve que la migration est nécessaire)", !avant.ok, 'accepté')

  await q(MIG)
  console.log('APRÈS 0054 :')
  const a1 = await asUser(U.alice, INS_EVT + '', [espace, B.A, 'modification', 'bj_' + RUN, raw(REF.A)])
  check('Alice (owner) écrit une modification sur le bail signé verrouillé de SCI-A', a1.ok, a1.msg)
  const a2 = await asUser(U.alice, INS_EVT, [espace, B.B, 'avenant', 'av_' + RUN, raw(REF.B)])
  check("type 'avenant' accepté", a2.ok, a2.msg)
  const a3 = await asUser(U.alice, INS_EVT, [espace, B.A, 'inconnu', 'x_' + RUN, raw(REF.A)])
  check('type inconnu refusé (CHECK)', !a3.ok && a3.code === '23514', a3.code + ' ' + a3.msg)

  // Entrées persistées (dans la transaction) pour les lectures : une par SCI.
  await q(INS_EVT, [espace, B.A, 'modification', 'bjA_' + RUN, raw(REF.A)])
  await q(INS_EVT, [espace, B.B, 'modification', 'bjB_' + RUN, raw(REF.B)])
  const lectA = await asUser(U.alice, 'select legacy_id, legacy_raw, bail_debut::text as bd from public.baux_evenements where espace_id = $1 order by legacy_id', [espace])
  check('Alice lit les 2 entrées avec legacy_raw et bail_debut', lectA.ok && lectA.rows.length === 2 && lectA.rows[0].legacy_raw && lectA.rows[0].legacy_raw.type === 'modification' && lectA.rows[0].bd === '2025-01-01', JSON.stringify(lectA))

  const c1 = await asUser(U.carol, INS_EVT, [espace, B.A, 'modification', 'c1_' + RUN, raw(REF.A)])
  check('Carol (scopée SCI-A) écrit sur le bail de SCI-A', c1.ok, c1.msg)
  const c2 = await asUser(U.carol, INS_EVT, [espace, B.B, 'modification', 'c2_' + RUN, raw(REF.B)])
  check('Carol ne peut PAS écrire sur le bail de SCI-B (RLS par entité)', !c2.ok, 'accepté')
  const c3 = await asUser(U.carol, 'select legacy_id from public.baux_evenements where espace_id = $1', [espace])
  check('Carol ne lit que SCI-A', c3.ok && c3.rows.length === 1 && c3.rows[0].legacy_id === 'bjA_' + RUN, JSON.stringify(c3))

  const versionApres = (await q('select version from public.baux where id = $1', [B.A])).rows[0].version
  check("la ligne du bail signé n'a pas bougé (version inchangée)", String(versionApres) === String(versionBailA), versionBailA + ' -> ' + versionApres)
  const mut = await asUser(U.alice, 'update public.baux set hc = 999 where id = $1', [B.A])
  check('le bail signé reste immuable (ROW_LOCKED_IMMUTABLE)', !mut.ok && /LOCKED/i.test(mut.msg), mut.msg)
} finally {
  try { await q('rollback') } catch (e) {}
  await client.end()
}
console.log(failed ? '\nÉCHEC' : '\nTOUT OK (rollback : rien de persisté)')
process.exit(failed ? 1 : 0)
