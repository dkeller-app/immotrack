// Simulation SQL TRANSACTIONNELLE de la migration 0055 (archivage d'un bail signé verrouillé).
// Une seule transaction, ROLLBACK systématique : rien n'est persisté. Chaque action « en tant que » est
// jouée dans un SAVEPOINT puis annulée (même patron que 0054-baux-evenements-journal.sim.mjs).
//
// Acteurs : Alice = owner PLEIN · Carol = SCOPÉE gestionnaire de SCI-A (aucun droit sur SCI-B).
// Vérifie :
//   (1) AVANT 0055 : archiver un bail verrouillé est refusé (preuve que la migration est nécessaire) ;
//   (2) APRÈS : Alice archive le bail signé de SCI-A (version +1, rien d'autre ne change) ;
//   (3) archiver EN MODIFIANT autre chose (loyer, legacy_raw, deleted_at) reste refusé ;
//   (4) désarchiver reste refusé ; DELETE et suppression logique restent refusés ;
//   (5) Carol (scopée SCI-A) archive SCI-A mais pas SCI-B (RLS par entité inchangée) ;
//   (6) le logement libéré accepte un NOUVEAU bail actif (index baux_one_active_per_logement) ;
//   (7) un EDL verrouillé reste immuable avec le MÊME message (IF imbriqué, pas d'erreur de champ) ;
//   (8) un bail NON verrouillé reste modifiable normalement.
// Usage : node supabase/tests/sim/0055-baux-archivage-signe.sim.mjs   (lit SUPABASE_DB_URL dans .env)
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
const MIG = loadMigration('0055_baux_archivage_signe.sql')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), carol: randomUUID() }
const MAIL = k => 'sim0055-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()
const E = { A: randomUUID(), B: randomUUID() }, I = { A: randomUUID(), B: randomUUID() }, L = { A: randomUUID(), B: randomUUID() }
const B = { A: randomUUID(), B: randomUUID() }
const B_LIBRE = randomUUID(), B_NOUVEAU = randomUUID(), EDL = randomUUID()
const REF = { A: 'SIM55-A-' + RUN, B: 'SIM55-B-' + RUN }

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
// Même chose, mais GARDE l'effet (release) : pour enchaîner une action sur l'état qu'elle produit.
async function asUserKeep (uid, sql, params) {
  await q('savepoint sk')
  try {
    await q('set local role authenticated')
    await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
      [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
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
const ARCH = 'update public.baux set archived = true where id = $1 returning version'
const version = async id => (await q('select version from public.baux where id = $1', [id])).rows[0].version

try {
  await q('begin')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0055', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  for (const s of ['A', 'B']) {
    await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [E[s], espace, 'SCI-' + s + '-' + RUN])
    await q('insert into public.immeubles (id, espace_id, entite_id, nom) values ($1,$2,$3,$4)', [I[s], espace, E[s], 'Imm-' + s + '-' + RUN])
    await q("insert into public.logements (id, espace_id, entite_id, immeuble_id, ref, type, surface, loyer_hc_ref, charges_ref) values ($1,$2,$3,$4,$5,'appartement',40,600,50)", [L[s], espace, E[s], I[s], REF[s]])
    await q("insert into public.baux (id, espace_id, entite_id, logement_id, type_bail, hc, ch, dg, jour_paiement, date_debut, locataires, legacy_ref, legacy_raw) values ($1,$2,$3,$4,'nu',600,50,600,1,'2025-01-01','[{\"nom\":\"Sim\"}]'::jsonb,$5,'{\"hc\":600}'::jsonb)", [B[s], espace, E[s], L[s], REF[s]])
    // Signature : bail verrouillé (transition false → true permise par 0014), comme sealSignedBaux côté client.
    await q("update public.baux set locked = true, content_hash = $2, signature_source = 'immotrack' where id = $1", [B[s], 'a'.repeat(64)])
  }
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.A, U.carol])
  // Témoins : un bail NON verrouillé (sur un 3e logement de SCI-A) et un EDL verrouillé.
  const L3 = randomUUID()
  await q("insert into public.logements (id, espace_id, entite_id, immeuble_id, ref) values ($1,$2,$3,$4,$5)", [L3, espace, E.A, I.A, 'SIM55-L3-' + RUN])
  await q("insert into public.baux (id, espace_id, entite_id, logement_id, hc) values ($1,$2,$3,$4,500)", [B_LIBRE, espace, E.A, L3])
  await q("insert into public.edl (id, espace_id, logement_id, type_edl) values ($1,$2,$3,'Entrée')", [EDL, espace, L.A])
  await q("update public.edl set locked = true, content_hash = $2, signature_source = 'immotrack' where id = $1", [EDL, 'b'.repeat(64)])

  console.log('AVANT 0055 :')
  const avant = await asUser(U.alice, ARCH, [B.A])
  check('archiver un bail signé verrouillé est REFUSÉ avant 0055 (preuve du défaut)', !avant.ok && /LOCKED/i.test(avant.msg), JSON.stringify(avant))

  await q(MIG)
  console.log('APRÈS 0055 :')
  const v0 = await version(B.A)
  const raw0 = (await q('select legacy_raw, hc, content_hash from public.baux where id = $1', [B.A])).rows[0]
  // (3) d'abord les refus (asUser annule tout) — sur la ligne encore NON archivée.
  const m1 = await asUser(U.alice, 'update public.baux set archived = true, hc = 999 where id = $1', [B.A])
  check('archiver + changer le loyer : REFUSÉ', !m1.ok && /LOCKED/i.test(m1.msg), JSON.stringify(m1))
  const m2 = await asUser(U.alice, "update public.baux set archived = true, legacy_raw = '{\"hc\":1}'::jsonb where id = $1", [B.A])
  check('archiver + réécrire legacy_raw : REFUSÉ', !m2.ok && /LOCKED/i.test(m2.msg), JSON.stringify(m2))
  const m3 = await asUser(U.alice, 'update public.baux set archived = true, deleted_at = now() where id = $1', [B.A])
  check('archiver + supprimer (deleted_at) : REFUSÉ', !m3.ok && /LOCKED/i.test(m3.msg), JSON.stringify(m3))
  const m4 = await asUser(U.alice, 'update public.baux set deleted_at = now() where id = $1', [B.A])
  check('suppression logique seule : REFUSÉE', !m4.ok && /LOCKED/i.test(m4.msg), JSON.stringify(m4))
  const m5 = await asUser(U.alice, 'update public.baux set hc = 999 where id = $1', [B.A])
  check('modifier le loyer seul : REFUSÉ (verrou intact)', !m5.ok && /LOCKED/i.test(m5.msg), JSON.stringify(m5))
  const c2 = await asUser(U.carol, ARCH, [B.B])
  check('Carol (scopée SCI-A) ne peut PAS archiver le bail de SCI-B (0 ligne)', c2.ok && c2.rows.length === 0, JSON.stringify(c2))
  const c1 = await asUser(U.carol, ARCH, [B.A])
  check('Carol (scopée SCI-A) peut archiver le bail de SCI-A', c1.ok && c1.rows.length === 1, JSON.stringify(c1))

  // (2) l'archivage réel, gardé pour la suite.
  const a1 = await asUserKeep(U.alice, ARCH, [B.A])
  check('Alice archive le bail signé de SCI-A', a1.ok && a1.rows.length === 1, JSON.stringify(a1))
  const apres = (await q('select archived, locked, version, legacy_raw, hc, content_hash, deleted_at from public.baux where id = $1', [B.A])).rows[0]
  check('archivé, toujours verrouillé, version +1', apres.archived === true && apres.locked === true && Number(apres.version) === Number(v0) + 1, JSON.stringify(apres))
  check('contenu signé intact (legacy_raw, loyer, empreinte, non supprimé)', JSON.stringify(apres.legacy_raw) === JSON.stringify(raw0.legacy_raw) && String(apres.hc) === String(raw0.hc) && apres.content_hash === raw0.content_hash && apres.deleted_at === null, JSON.stringify({ apres, raw0 }))

  // (4) sur la ligne archivée
  const d1 = await asUser(U.alice, 'update public.baux set archived = false where id = $1', [B.A])
  check('désarchiver : REFUSÉ', !d1.ok && /LOCKED/i.test(d1.msg), JSON.stringify(d1))
  const d2 = await asUser(U.alice, ARCH, [B.A])
  check('ré-archiver une ligne déjà archivée : REFUSÉ (pas de transition)', !d2.ok && /LOCKED/i.test(d2.msg), JSON.stringify(d2))
  const d3 = await asUser(U.alice, 'delete from public.baux where id = $1', [B.A])
  check('DELETE physique : REFUSÉ', !d3.ok && /LOCKED/i.test(d3.msg), JSON.stringify(d3))

  // (6) le logement est libéré : un nouveau bail actif y est accepté.
  const n1 = await asUser(U.alice, "insert into public.baux (id, espace_id, entite_id, logement_id, hc) values ($1,$2,$3,$4,650) returning id", [B_NOUVEAU, espace, E.A, L.A])
  check('nouveau bail ACTIF sur le logement libéré : accepté', n1.ok, JSON.stringify(n1))
  const n2 = await asUser(U.alice, "insert into public.baux (id, espace_id, entite_id, logement_id, hc) values ($1,$2,$3,$4,650) returning id", [randomUUID(), espace, E.B, L.B])
  check('… alors que le logement de SCI-B (bail signé NON archivé) le refuse toujours (index)', !n2.ok && n2.code === '23505', JSON.stringify(n2))

  // (7) EDL verrouillé : même refus, même message.
  const e1 = await asUser(U.alice, "update public.edl set type_edl = 'Sortie' where id = $1", [EDL])
  check('EDL verrouillé : UPDATE refusé avec ROW_LOCKED_IMMUTABLE (pas d\'erreur de champ)', !e1.ok && /ROW_LOCKED_IMMUTABLE/.test(e1.msg), JSON.stringify(e1))

  // (8) bail non verrouillé : inchangé.
  const l1 = await asUser(U.alice, 'update public.baux set hc = 510 where id = $1 returning hc', [B_LIBRE])
  check('bail NON verrouillé : toujours modifiable', l1.ok && l1.rows.length === 1, JSON.stringify(l1))
} finally {
  try { await q('rollback') } catch (e) {}
  await client.end()
}
console.log(failed ? '\nÉCHEC' : '\nTOUT OK (rollback : rien de persisté)')
process.exit(failed ? 1 : 0)
