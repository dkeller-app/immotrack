// Simulation SQL TRANSACTIONNELLE de la migration 0063 (appartenance aux espaces, écriture de la config,
// droits EXECUTE). Une seule transaction, ROLLBACK systématique : rien n'est persisté. Chaque action « en
// tant que » est jouée dans un SAVEPOINT puis annulée (patron 0057-incidents.sim.mjs).
//
// Acteurs : Alice = owner PLEIN de l'espace A · Bob = owner de SON espace B (autre compte) · Carol = membre
// SCOPÉE de SCI-A1 dans l'espace A · Dave = connecté sans espace.
// Prouve AVANT 0063 le défaut (un owner inscrit un autre compte comme membre plein actif de son espace, sans
// son consentement), puis APRÈS : écriture directe refusée, révocation (DELETE) conservée, create_espace et
// accept_invitation intacts, invitation_preview toujours appelable sans connexion, config écrite par le seul
// membre plein gestionnaire, justificatif d'un mouvement mixte caché au scopé, EXECUTE retiré à anon (y
// compris pour une fonction créée APRÈS la migration).
//
// Usage : SIM_DB_URL=postgres://… node supabase/tests/sim/0063-appartenance-durcissement.sim.mjs
//   (sinon DOTENV_CONFIG_PATH=../Immo/.env : lit SUPABASE_DB_URL ; transaction annulée de bout en bout).
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
config(process.env.DOTENV_CONFIG_PATH ? { quiet: true, path: process.env.DOTENV_CONFIG_PATH } : { quiet: true })

function loadMigration (name) {
  const raw = readFileSync(new URL('../../migrations/' + name, import.meta.url), 'utf8')
  const sql = raw.split(/\r?\n/).filter(l => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n')
  const noComments = sql.split(/\r?\n/).map(l => l.replace(/--.*$/, '')).join('\n')
  if (/\bcommit\b\s*;/i.test(noComments)) throw new Error('COMMIT résiduel dans ' + name + ' : simulation refusée')
  return sql
}
const MIG = loadMigration('0063_appartenance_durcissement.sql')

const url = process.env.SIM_DB_URL || process.env.SUPABASE_DB_URL
const local = /localhost|127\.0\.0\.1/.test(url || '')
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), bob: randomUUID(), carol: randomUUID(), dave: randomUUID() }
const MAIL = k => 'sim0063-' + k + '-' + RUN + '@example.test'
const EA = randomUUID(), EB = randomUUID()
const S = { A1: randomUUID(), A2: randomUUID() }
const L = { A1: randomUUID(), A2: randomUUID() }

async function asUser (uid, sql, params, role = 'authenticated') {
  await q('savepoint su')
  try {
    await q('set local role ' + role)
    if (uid) {
      await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
        [JSON.stringify({ sub: uid, role: 'authenticated', email: MAIL(Object.keys(U).find(k => U[k] === uid)) }), uid])
    }
    const r = await q(sql, params)
    return { ok: true, rows: r.rows }
  } catch (e) {
    return { ok: false, code: e.code, msg: e.message }
  } finally {
    await q('rollback to savepoint su')
  }
}
// Variante qui GARDE l'effet (release au lieu de rollback).
async function asUserKeep (uid, sql, params) {
  await q('savepoint sk')
  try {
    await q('set local role authenticated')
    await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
      [JSON.stringify({ sub: uid, role: 'authenticated', email: MAIL(Object.keys(U).find(k => U[k] === uid)) }), uid])
    const r = await q(sql, params)
    await q('reset role')
    await q('release savepoint sk')
    return { ok: true, rows: r.rows }
  } catch (e) {
    await q('rollback to savepoint sk')
    return { ok: false, code: e.code, msg: e.message }
  }
}

let failed = false
const check = (label, cond, detail) => { console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : ' -- ' + detail)); if (!cond) failed = true }
const INS_MEMBRE = "insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'gestionnaire','active',true) returning id"

try {
  await q('begin')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3), ($4,$5,$6)', [EA, 'Espace A SIM 0063', U.alice, EB, 'Espace B SIM 0063', U.bob])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($3,$4,'owner','active',true), ($1,$5,'lecture_seule','active',false)", [EA, U.alice, EB, U.bob, U.carol])
  for (const s of ['A1', 'A2']) {
    await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [S[s], EA, 'SCI-' + s + '-' + RUN])
    await q('insert into public.logements (id, espace_id, entite_id, ref) values ($1,$2,$3,$4)', [L[s], EA, S[s], 'SIM63-' + s + '-' + RUN])
  }
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [EA, S.A1, U.carol])
  // Mouvement MIXTE hérité (logement de SCI-A1 + immeuble de SCI-A2) et son justificatif, posés hors RLS.
  const IA2 = randomUUID()
  await q('insert into public.immeubles (id, espace_id, entite_id, nom) values ($1,$2,$3,$4)', [IA2, EA, S.A2, 'Imm-A2-' + RUN])
  const MV = randomUUID(), DOCMV = randomUUID()
  await q("insert into public.mouvements (id, espace_id, logement_id, immeuble_id, date_mouvement) values ($1,$2,$3,$4,current_date)", [MV, EA, L.A1, IA2])
  await q("insert into public.documents (id, espace_id, name, parent_type, parent_id) values ($1,$2,'facture.pdf','mouvement',$3)", [DOCMV, EA, MV])

  console.log('AVANT 0063 :')
  const av1 = await asUser(U.bob, INS_MEMBRE, [EB, U.alice])
  check('défaut prouvé : Bob inscrit Alice comme membre PLEIN actif de SON espace, sans consentement', av1.ok, JSON.stringify(av1))
  const av2 = await asUser(U.carol, 'select id from public.documents where id = $1', [DOCMV])
  check('défaut prouvé : Carol (scopée SCI-A1) voit le justificatif du mouvement mixte', av2.ok && av2.rows.length === 1, JSON.stringify(av2))

  await q(MIG)
  console.log('APRÈS 0063 :')
  // (1) appartenance
  const m1 = await asUser(U.bob, INS_MEMBRE, [EB, U.alice])
  check('Bob ne peut PLUS inscrire Alice dans son espace (42501)', !m1.ok && m1.code === '42501', JSON.stringify(m1))
  const m2 = await asUser(U.alice, INS_MEMBRE, [EA, U.dave])
  check('Alice (owner) ne peut PLUS inscrire Dave directement (42501)', !m2.ok && m2.code === '42501', JSON.stringify(m2))
  const m3 = await asUser(U.alice, "update public.espace_members set full_espace = true, role = 'gestionnaire' where espace_id = $1 and user_id = $2 returning id", [EA, U.carol])
  check('Alice ne peut PLUS élargir Carol en membre plein (42501)', !m3.ok && m3.code === '42501', JSON.stringify(m3))
  const m4 = await asUser(U.carol, "update public.espace_members set full_espace = true where espace_id = $1 and user_id = $2 returning id", [EA, U.carol])
  check('Carol ne peut pas s\'élargir elle-même (42501)', !m4.ok && m4.code === '42501', JSON.stringify(m4))
  const m5 = await asUser(U.alice, 'delete from public.espace_members where espace_id = $1 and user_id = $2 returning id', [EA, U.carol])
  check('révocation conservée : Alice retire Carol (DELETE)', m5.ok && m5.rows.length === 1, JSON.stringify(m5))
  const m6 = await asUser(U.bob, 'delete from public.espace_members where espace_id = $1 and user_id = $2 returning id', [EA, U.carol])
  check('Bob ne peut pas retirer un membre de l\'espace A (0 ligne)', m6.ok && m6.rows.length === 0, JSON.stringify(m6))
  const m7 = await asUser(U.dave, 'select public.create_espace($1) as id', ['Espace de Dave'])
  check('create_espace fonctionne toujours (compte neuf)', m7.ok && m7.rows.length === 1 && !!m7.rows[0].id, JSON.stringify(m7))

  // accept_invitation : Alice invite Dave sur SCI-A2, Dave accepte.
  const inv = await asUserKeep(U.alice, "insert into public.invitations (espace_id, grants, invite_email, created_by, expires_at) values ($1, $2::jsonb, $3, $4, now() + interval '7 days') returning token", [EA, JSON.stringify([{ entite_id: S.A2, mode: 'lecture' }]), MAIL('dave'), U.alice])
  check('Alice crée une invitation', inv.ok, JSON.stringify(inv))
  const tok = inv.ok ? inv.rows[0].token : 'x'
  const pv = await asUser(null, 'select public.invitation_preview($1) as p', [tok], 'anon')
  check('invitation_preview appelable SANS connexion (anon)', pv.ok, JSON.stringify(pv))
  const acc = await asUserKeep(U.dave, 'select public.accept_invitation($1) as r', [tok])
  check('accept_invitation fonctionne toujours', acc.ok, JSON.stringify(acc))
  const mem = await q('select role, full_espace, invite_status from public.espace_members where espace_id = $1 and user_id = $2', [EA, U.dave])
  check('… Dave devient membre SCOPÉ actif en lecture seule', mem.rows.length === 1 && mem.rows[0].full_espace === false && mem.rows[0].role === 'lecture_seule' && mem.rows[0].invite_status === 'active', JSON.stringify(mem.rows))

  // (2) espace_config : membre plein gestionnaire seulement
  const c1 = await asUser(U.alice, "insert into public.espace_config (espace_id, data) values ($1, '{\"k\":1}'::jsonb) on conflict (espace_id) do update set data = excluded.data returning espace_id", [EA])
  check('Alice (pleine) écrit la config', c1.ok && c1.rows.length === 1, JSON.stringify(c1))
  await q("update public.espace_members set role = 'gestionnaire' where espace_id = $1 and user_id = $2", [EA, U.dave])
  const c2 = await asUser(U.dave, "insert into public.espace_config (espace_id, data) values ($1, '{\"k\":2}'::jsonb) on conflict (espace_id) do update set data = excluded.data returning espace_id", [EA])
  check('Dave (scopé, rôle gestionnaire) ne peut PAS écrire la config de l\'espace', !c2.ok && c2.code === '42501', JSON.stringify(c2))

  // (3) justificatif d'un mouvement mixte
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'lecture_seule','active',false) on conflict (espace_id, user_id) do update set invite_status = 'active', full_espace = false", [EA, U.carol])
  const d1 = await asUser(U.carol, 'select id from public.documents where id = $1', [DOCMV])
  check('Carol (scopée SCI-A1) ne voit PLUS le justificatif du mouvement mixte', d1.ok && d1.rows.length === 0, JSON.stringify(d1))
  const d2 = await asUser(U.alice, 'select id from public.documents where id = $1', [DOCMV])
  check('… Alice (pleine) le voit toujours', d2.ok && d2.rows.length === 1, JSON.stringify(d2))
  const MV2 = randomUUID(), DOC2 = randomUUID()
  await q("insert into public.mouvements (id, espace_id, logement_id, date_mouvement) values ($1,$2,$3,current_date)", [MV2, EA, L.A1])
  await q("insert into public.documents (id, espace_id, name, parent_type, parent_id) values ($1,$2,'quittance.pdf','mouvement',$3)", [DOC2, EA, MV2])
  const d3 = await asUser(U.carol, 'select id from public.documents where id = $1', [DOC2])
  check('… Carol voit le justificatif d\'un mouvement cohérent de SCI-A1', d3.ok && d3.rows.length === 1, JSON.stringify(d3))

  // (4) EXECUTE
  const ex = await q(`select f, has_function_privilege('anon', f, 'EXECUTE') anon, has_function_privilege('authenticated', f, 'EXECUTE') auth
    from unnest(array['public.is_member(uuid)','public.has_role(uuid, public.espace_role[])','public.is_full_member(uuid)',
      'public.is_full_manager(uuid)','public.has_entite_access(uuid, uuid)','public.has_entite_write(uuid, uuid)',
      'public.espace_plan(uuid)','public.espace_has_feature(uuid, text)','public.is_app_admin()','public.create_espace(text)',
      'public.entite_of_document(uuid, text, uuid)']) f`)
  check('anon n\'exécute plus aucun helper (11 fonctions)', ex.rows.every(r => r.anon === false), JSON.stringify(ex.rows.filter(r => r.anon)))
  check('authenticated les exécute toujours', ex.rows.every(r => r.auth === true), JSON.stringify(ex.rows.filter(r => !r.auth)))
  const ip = await q("select has_function_privilege('anon', 'public.invitation_preview(text)', 'EXECUTE') a")
  check('invitation_preview reste ouverte à anon', ip.rows[0].a === true, JSON.stringify(ip.rows))
  await q('create function public.sim0063_future() returns int language sql as $$ select 1 $$')
  const fu = await q("select has_function_privilege('anon', 'public.sim0063_future()', 'EXECUTE') anon, has_function_privilege('authenticated', 'public.sim0063_future()', 'EXECUTE') auth")
  check('fonction FUTURE : pas d\'EXECUTE pour anon, EXECUTE pour authenticated', fu.rows[0].anon === false && fu.rows[0].auth === true, JSON.stringify(fu.rows))

  // (5) policies 0038
  const pol = await q("select policyname, roles::text r from pg_policies where tablename in ('beta_allowlist','app_admins') order by 1")
  check('policies 0038 restreintes à authenticated', pol.rows.length === 2 && pol.rows.every(r => r.r === '{authenticated}'), JSON.stringify(pol.rows))
  const ad = await asUser(U.alice, 'select public.is_app_admin() a')
  check('is_app_admin() toujours appelable par un connecté', ad.ok && ad.rows[0].a === false, JSON.stringify(ad))
} finally {
  try { await q('rollback') } catch (e) {}
  await client.end()
}
console.log(failed ? '\nÉCHEC' : '\nTOUT OK (rollback : rien de persisté)')
process.exit(failed ? 1 : 0)
