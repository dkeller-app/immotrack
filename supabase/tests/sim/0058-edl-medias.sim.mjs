// Simulation SQL TRANSACTIONNELLE de la migration 0058 (médias d'état des lieux, EDL-VIDEO-IA).
// Une seule transaction, ROLLBACK systématique : rien n'est persisté. Chaque action « en tant que » est jouée
// dans un SAVEPOINT puis annulée (patron de 0057-incidents.sim.mjs).
//
// Acteurs : Alice = owner PLEIN · Carol = SCOPÉE gestionnaire de SCI-A (aucun droit sur SCI-B).
// Vérifie :
//   (1) RLS par SCI : Carol voit / écrit les médias de SCI-A, pas ceux de SCI-B ;
//   (2) avant signature : une prise se supprime (refaire une prise) ;
//   (3) la signature de l'EDL SCELLE ses médias ; un média enregistré après la signature est scellé à l'insertion ;
//   (4) média scellé : suppression refusée (même par Alice), champs de preuve figés, scellé irréversible,
//       échéance : jamais avant signature + 3 ans, jamais avancée ; gel : prolongation seulement ;
//   (5) STORAGE : l'objet d'un média scellé ne s'efface ni ne s'écrase ; un objet ordinaire, si ;
//   (6) edl_medias_a_purger : interdite aux utilisateurs ; à échéance, la ligne scellée devient supprimable ;
//   (7) contraintes : chemin hors espace / hors files/vid_ refusé, empreinte malformée refusée.
// Usage : DOTENV_CONFIG_PATH=../Immo/.env node supabase/tests/sim/0058-edl-medias.sim.mjs   (lit SUPABASE_DB_URL)
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
const MIG = loadMigration('0058_edl_medias.sql')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), carol: randomUUID() }
const MAIL = k => 'sim0058-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()
const E = { A: randomUUID(), B: randomUUID() }, I = { A: randomUUID(), B: randomUUID() }, L = { A: randomUUID(), B: randomUUID() }
const EDL = { A: randomUUID(), B: randomUUID() }
const H = 'a'.repeat(64)
const chemin = (s, k) => `${espace}/${E[s]}/files/vid_${k}_${RUN}.webm`

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
// Même chose, mais la modification RESTE (savepoint relâché) : pour enchaîner des étapes.
async function asUserGarde (uid, sql, params) {
  await q('savepoint sg')
  try {
    await q('set local role authenticated')
    await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
      [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
    const r = await q(sql, params)
    await q('reset role')
    await q('release savepoint sg')
    return { ok: true, rows: r.rows }
  } catch (e) {
    await q('rollback to savepoint sg')
    return { ok: false, code: e.code, msg: e.message }
  }
}

let failed = false
const check = (label, cond, detail) => { console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : ' -- ' + detail)); if (!cond) failed = true }
const INS = 'insert into public.edl_medias (id, espace_id, logement_id, edl_id, storage_path, mime, octets, duree_s, sha256, piece, prise) values ($1,$2,$3,$4,$5,\'video/webm\',7100000,59,$6,\'Cuisine\',1) returning id, signed_at, purge_apres'

try {
  await q('begin')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0058', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  for (const s of ['A', 'B']) {
    await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [E[s], espace, 'SCI-' + s + '-' + RUN])
    await q('insert into public.immeubles (id, espace_id, entite_id, nom) values ($1,$2,$3,$4)', [I[s], espace, E[s], 'Imm-' + s + '-' + RUN])
    await q("insert into public.logements (id, espace_id, entite_id, immeuble_id, ref) values ($1,$2,$3,$4,$5)", [L[s], espace, E[s], I[s], 'SIM58-' + s + '-' + RUN])
    await q("insert into public.edl (id, espace_id, logement_id, type_edl, date_edl) values ($1,$2,$3,'Entrée',current_date)", [EDL[s], espace, L[s]])
  }
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.A, U.carol])

  const avant = await q("select to_regclass('public.edl_medias') as t")
  check('AVANT 0058 : la table n\'existe pas', avant.rows[0].t === null, JSON.stringify(avant.rows))

  await q(MIG)
  console.log('APRÈS 0058 :')
  // Même requête que scripts/check-rls-coverage.mjs, DANS la transaction (la table n'existe qu'ici).
  const cov = await q(`select c.relname as t, c.relrowsecurity as e, c.relforcerowsecurity as f,
      (select count(*) from pg_policy p where p.polrelid = c.oid) as n
    from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'`)
  const fautifs = cov.rows.filter(r => !r.e || !r.f || Number(r.n) < 1).map(r => r.t)
  const em = cov.rows.find(r => r.t === 'edl_medias')
  check('couverture RLS : edl_medias forcée avec 4 politiques, aucune table publique sans RLS', fautifs.length === 0 && em && em.f && Number(em.n) === 4, JSON.stringify({ fautifs, em }))

  // (1) RLS par SCI
  const MA = randomUUID(), MB = randomUUID()
  const c1 = await asUserGarde(U.carol, INS, [MA, espace, L.A, EDL.A, chemin('A', 'a1'), H])
  check('Carol enregistre une prise dans SCI-A', c1.ok, JSON.stringify(c1))
  const c2 = await asUser(U.carol, INS, [randomUUID(), espace, L.B, EDL.B, chemin('B', 'b0'), H])
  check('Carol ne peut PAS enregistrer dans SCI-B (42501)', !c2.ok && c2.code === '42501', JSON.stringify(c2))
  const a1 = await asUserGarde(U.alice, INS, [MB, espace, L.B, EDL.B, chemin('B', 'b1'), H])
  check('Alice (pleine) enregistre dans SCI-B', a1.ok, JSON.stringify(a1))
  const r1 = await asUser(U.carol, 'select id from public.edl_medias where espace_id = $1', [espace])
  check('Carol voit la prise de SCI-A seulement', r1.ok && r1.rows.length === 1 && r1.rows[0].id === MA, JSON.stringify(r1))

  // (2) avant signature : une prise se supprime
  const d0 = await asUser(U.carol, 'delete from public.edl_medias where id = $1 returning id', [MA])
  check('avant signature : Carol supprime sa prise (refaire une prise)', d0.ok && d0.rows.length === 1, JSON.stringify(d0))
  const tot = await asUser(U.alice, 'update public.edl_medias set purge_apres = current_date where id = $1 returning purge_apres', [MA])
  check('avant signature : une échéance peut être posée', tot.ok && tot.rows.length === 1, JSON.stringify(tot))

  // (3) scellé : la signature de l'EDL A scelle la prise ; échéance relevée au plancher
  await q('update public.edl_medias set purge_apres = current_date where id = $1', [MA])
  await q('update public.edl set signed_at = now() where id = $1', [EDL.A])
  const sc = await q('select signed_at, purge_apres, (purge_apres >= (current_date + interval \'3 years\' - interval \'1 day\')::date) as plancher from public.edl_medias where id = $1', [MA])
  check('signature de l\'EDL : la prise est scellée', sc.rows[0].signed_at !== null, JSON.stringify(sc.rows))
  check('… et son échéance relevée à signature + 3 ans (aucune purge anticipée)', sc.rows[0].plancher === true, JSON.stringify(sc.rows))
  const MA2 = randomUUID()
  const c3 = await asUserGarde(U.carol, INS, [MA2, espace, L.A, EDL.A, chemin('A', 'a2'), H])
  check('prise envoyée APRÈS la signature : scellée dès l\'insertion', c3.ok && c3.rows[0].signed_at !== null, JSON.stringify(c3))

  // (4) média scellé
  const d1 = await asUser(U.alice, 'delete from public.edl_medias where id = $1 returning id', [MA])
  check('scellée : Alice ne peut PAS la supprimer (0 ligne, RLS)', d1.ok && d1.rows.length === 0, JSON.stringify(d1))
  const d2 = await asUser(U.alice, "select 1", [])
  check('(contrôle) session utilisateur active', d2.ok, JSON.stringify(d2))
  const u1 = await asUser(U.alice, 'update public.edl_medias set sha256 = $2 where id = $1', [MA, 'b'.repeat(64)])
  check('scellée : empreinte figée (MEDIA_EDL_SCELLE)', !u1.ok && /MEDIA_EDL_SCELLE/.test(u1.msg), JSON.stringify(u1))
  const u2 = await asUser(U.alice, 'update public.edl_medias set signed_at = null where id = $1', [MA])
  check('scellée : le scellé ne se retire pas', !u2.ok && /MEDIA_EDL_SCELLE/.test(u2.msg), JSON.stringify(u2))
  const u3 = await asUser(U.alice, "update public.edl_medias set purge_apres = purge_apres - 10 where id = $1", [MA])
  check('scellée : l\'échéance ne recule pas', !u3.ok, JSON.stringify(u3))
  const u4 = await asUser(U.alice, "update public.edl_medias set purge_apres = purge_apres + 400, gel_jusquau = current_date + 2000, gel_motif = 'litige' where id = $1 returning id", [MA])
  check('scellée : report de l\'échéance et gel (litige) permis', u4.ok && u4.rows.length === 1, JSON.stringify(u4))
  const u5 = await asUser(U.alice, 'update public.edl_medias set purge_apres = null where id = $1 returning id', [MA])
  check('scellée : « conserver » (échéance retirée) permis', u5.ok && u5.rows.length === 1, JSON.stringify(u5))
  const u6 = await asUser(U.alice, 'update public.edl_medias set purge_apres = current_date + 30 where id = $1', [MA2])
  check('scellée : échéance avant signature + 3 ans refusée (23514)', !u6.ok && u6.code === '23514', JSON.stringify(u6))

  // (5) STORAGE
  const OBJ = 'insert into storage.objects (bucket_id, name, owner, metadata) values (\'espace-files\', $1, $2, \'{}\'::jsonb) returning name'
  const objScelle = chemin('A', 'a1')
  const objLibre = `${espace}/${E.A}/files/ph_libre_${RUN}`
  const o1 = await asUserGarde(U.carol, OBJ, [objScelle, U.carol])
  const o2 = await asUserGarde(U.carol, OBJ, [objLibre, U.carol])
  check('storage : Carol dépose les objets dans SCI-A (insertion inchangée)', o1.ok && o2.ok, JSON.stringify({ o1, o2 }))
  const s1 = await asUser(U.alice, 'update storage.objects set metadata = \'{"x":1}\'::jsonb where bucket_id = \'espace-files\' and name = $1 returning name', [objScelle])
  check('storage : l\'objet d\'un média scellé ne s\'écrase pas (0 ligne)', (s1.ok && s1.rows.length === 0) || (!s1.ok), JSON.stringify(s1))
  const s2 = await asUser(U.alice, 'update storage.objects set metadata = \'{"x":1}\'::jsonb where bucket_id = \'espace-files\' and name = $1 returning name', [objLibre])
  check('storage : un objet ordinaire se met à jour', s2.ok && s2.rows.length === 1, JSON.stringify(s2))
  const s4 = await asUser(U.alice, 'delete from storage.objects where bucket_id = \'espace-files\' and name = $1 returning name', [objLibre])
  const s3 = await asUser(U.alice, 'delete from storage.objects where bucket_id = \'espace-files\' and name = $1 returning name', [objScelle])
  if (s4.ok) {
    check('storage : un objet ordinaire s\'efface (contrôle : la suppression SQL est permise ici)', s4.rows.length === 1, JSON.stringify(s4))
    check('storage : l\'objet d\'un média scellé ne s\'efface pas (0 ligne)', s3.ok && s3.rows.length === 0, JSON.stringify(s3))
  } else {
    console.log('  --  suppression SQL directe de storage.objects bloquée par Supabase (' + s4.msg + ') : garde vérifiée par la définition des politiques ci-dessous')
  }
  const pol = await q("select policyname, qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('espace-files: delete par entité', 'espace-files: update par entité')")
  check('storage : politiques delete et update portent la garde media_edl_protege', pol.rows.length === 2 && pol.rows.every(r => /media_edl_protege/.test(r.qual)), JSON.stringify(pol.rows))
  const pf = await asUser(U.alice, 'select public.media_edl_protege($1) as p, public.media_edl_protege($2) as l', [objScelle, objLibre])
  check('media_edl_protege : vrai pour le scellé, faux pour l\'ordinaire', pf.ok && pf.rows[0].p === true && pf.rows[0].l === false, JSON.stringify(pf))

  // (6) purge
  const p1 = await asUser(U.alice, 'select * from public.edl_medias_a_purger(10)', [])
  check('edl_medias_a_purger interdite aux utilisateurs (42501)', !p1.ok && p1.code === '42501', JSON.stringify(p1))
  await q("set local app.bypass_immutable = 'on'")
  // Vieillir la prise : signée il y a 4 ans, échéance hier (plancher signature + 3 ans respecté).
  await q("update public.edl_medias set signed_at = now() - interval '4 years', purge_apres = current_date - 1, gel_jusquau = null where id = $1", [MA2])
  await q("set local app.bypass_immutable = 'off'")
  const p2 = await q('select id from public.edl_medias_a_purger(10)')
  check('à échéance : la prise apparaît dans la liste de purge', p2.rows.some(r => r.id === MA2), JSON.stringify(p2.rows))
  const p3 = await q('delete from public.edl_medias where id = $1 returning id', [MA2])
  check('à échéance : la ligne scellée se supprime (tâche serveur)', p3.rows.length === 1, JSON.stringify(p3.rows))
  const p4 = await asUser(U.alice, 'select 1', [])
  check('(contrôle)', p4.ok, '')
  let refus = null
  try { await q('savepoint pz'); await q('delete from public.edl_medias where id = $1', [MA]); await q('release savepoint pz') } catch (e) { refus = e; await q('rollback to savepoint pz') }
  check('avant échéance : même le rôle propriétaire de la base ne supprime pas une prise scellée', refus && /MEDIA_EDL_SCELLE/.test(refus.message), String(refus && refus.message))

  // (7) contraintes
  const k1 = await asUser(U.alice, INS, [randomUUID(), espace, L.A, EDL.A, `${randomUUID()}/${E.A}/files/vid_x.webm`, H])
  check('chemin hors de l\'espace refusé (23514)', !k1.ok && k1.code === '23514', JSON.stringify(k1))
  const k2 = await asUser(U.alice, INS, [randomUUID(), espace, L.A, EDL.A, `${espace}/${E.A}/files/ph_x.jpg`, H])
  check('chemin qui n\'est pas une vidéo d\'EDL refusé (23514)', !k2.ok && k2.code === '23514', JSON.stringify(k2))
  const k3 = await asUser(U.alice, INS, [randomUUID(), espace, L.A, EDL.A, chemin('A', 'k3'), 'XYZ'])
  check('empreinte malformée refusée (23514)', !k3.ok && k3.code === '23514', JSON.stringify(k3))
  const k4 = await asUser(U.alice, 'update public.edl_medias set espace_id = $2 where id = $1', [MB, randomUUID()])
  check('espace_id gelé', !k4.ok, JSON.stringify(k4))
} finally {
  try { await q('rollback') } catch (e) {}
  await client.end()
}
console.log(failed ? '\nÉCHEC' : '\nTOUT OK (rollback : rien de persisté)')
process.exit(failed ? 1 : 0)
