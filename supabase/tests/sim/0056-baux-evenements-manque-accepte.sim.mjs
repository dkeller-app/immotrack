// Simulation SQL TRANSACTIONNELLE de la migration 0056 (type 'manque_accepte' du journal des baux).
// Une seule transaction, ROLLBACK systématique : rien n'est persisté. Chaque action « en tant que » est
// jouée dans un SAVEPOINT puis annulée (même patron que 0054-baux-evenements-journal.sim.mjs).
// PRÉREQUIS : base où 0054 et 0055 sont déjà appliquées (colonnes legacy_raw / legacy_id / bail_debut,
// archivage d'un bail signé).
//
// Acteurs : Alice = owner PLEIN · Carol = SCOPÉE gestionnaire de SCI-A (aucun droit sur SCI-B).
// Vérifie : (1) avant 0056 le type 'manque_accepte' est refusé (preuve que la migration est nécessaire,
// et que l'ordre de déploiement migration → client est obligatoire) ; (2) après : Alice écrit un manque
// accepté sur un bail SIGNÉ VERROUILLÉ sans toucher sa ligne, et sur un bail signé ARCHIVÉ (locataire
// parti, retenue sur dépôt) ; (3) les types existants ('modification', 'avenant', 'autre') restent
// acceptés, un type inconnu reste refusé ; (4) Carol écrit/lit sur SCI-A seulement (RLS par entité
// inchangée) ; (5) annulation = suppression douce gardée par version (deleted_at, version attendue),
// une version périmée ne touche rien ; (6) la ligne du bail signé reste immuable.
// Usage : node supabase/tests/sim/0056-baux-evenements-manque-accepte.sim.mjs   (lit SUPABASE_DB_URL dans .env)
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
const MIG = loadMigration('0056_baux_evenements_manque_accepte.sql')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), carol: randomUUID() }
const MAIL = k => 'sim0056-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()
const E = { A: randomUUID(), B: randomUUID() }, I = { A: randomUUID(), B: randomUUID() }, L = { A: randomUUID(), B: randomUUID() }
const B = { A: randomUUID(), B: randomUUID(), Aold: randomUUID() }
const REF = { A: 'SIM56-A-' + RUN, B: 'SIM56-B-' + RUN }

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

const INS_EVT = "insert into public.baux_evenements (espace_id, bail_id, type_evenement, date_evenement, legacy_id, bail_debut, legacy_raw) values ($1,$2,$3,'2026-10-06',$4,$6::date,$5::jsonb) returning id, version"
// Forme stockée côté app (js/core/manque-accepte.js nouveauManque) : l'objet entier voyage dans legacy_raw.
const raw = (ref, id, bailDebut) => JSON.stringify({ id, type: 'manque_accepte', ref, bailDebut, ym: '2026-08', montant: 20, motif: 'panne électrique', date: '2026-10-06', _modifiedAt: '2026-10-06T08:00:00.000Z' })

try {
  await q('begin')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0056', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  for (const s of ['A', 'B']) {
    await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [E[s], espace, 'SCI-' + s + '-' + RUN])
    await q('insert into public.immeubles (id, espace_id, entite_id, nom) values ($1,$2,$3,$4)', [I[s], espace, E[s], 'Imm-' + s + '-' + RUN])
    await q("insert into public.logements (id, espace_id, entite_id, immeuble_id, ref, type, surface, loyer_hc_ref, charges_ref) values ($1,$2,$3,$4,$5,'appartement',40,600,50)", [L[s], espace, E[s], I[s], REF[s]])
  }
  // SCI-A : un ancien bail signé puis ARCHIVÉ (locataire parti), puis le bail courant signé. SCI-B : bail courant signé.
  const insBail = "insert into public.baux (id, espace_id, entite_id, logement_id, type_bail, hc, ch, dg, jour_paiement, date_debut, locataires) values ($1,$2,$3,$4,'nu',600,50,600,1,$5::date,'[{\"nom\":\"Sim\"}]'::jsonb)"
  const signer = "update public.baux set locked = true, content_hash = $2, signature_source = 'immotrack' where id = $1"
  await q(insBail, [B.Aold, espace, E.A, L.A, '2024-01-01'])
  await q(signer, [B.Aold, 'b'.repeat(64)])
  await q('update public.baux set archived = true where id = $1', [B.Aold])   // 0055 : seule écriture permise
  for (const s of ['A', 'B']) {
    await q(insBail, [B[s], espace, E[s], L[s], '2025-01-01'])
    await q(signer, [B[s], 'a'.repeat(64)])
  }
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.A, U.carol])
  const versionBailA = (await q('select version from public.baux where id = $1', [B.A])).rows[0].version

  console.log('AVANT 0056 :')
  const avant = await asUser(U.alice, INS_EVT, [espace, B.A, 'manque_accepte', 'mqa_av_' + RUN, raw(REF.A, 'mqa_av_' + RUN, '2025-01-01'), '2025-01-01'])
  check("type 'manque_accepte' refusé avant 0056 (preuve : migration AVANT le client)", !avant.ok && avant.code === '23514', avant.code + ' ' + avant.msg)

  await q(MIG)
  console.log('APRÈS 0056 :')
  const a1 = await asUser(U.alice, INS_EVT, [espace, B.A, 'manque_accepte', 'mqa_1_' + RUN, raw(REF.A, 'mqa_1_' + RUN, '2025-01-01'), '2025-01-01'])
  check('Alice (owner) écrit un manque accepté sur le bail signé verrouillé de SCI-A', a1.ok, a1.msg)
  const a2 = await asUser(U.alice, INS_EVT, [espace, B.Aold, 'manque_accepte', 'mqa_old_' + RUN, raw(REF.A, 'mqa_old_' + RUN, '2024-01-01'), '2024-01-01'])
  check('Alice écrit un manque accepté sur le bail signé ARCHIVÉ (locataire parti)', a2.ok, a2.msg)
  for (const t of ['modification', 'avenant', 'autre']) {
    const r = await asUser(U.alice, INS_EVT, [espace, B.A, t, t + '_' + RUN, raw(REF.A, t + '_' + RUN, '2025-01-01'), '2025-01-01'])
    check("type existant '" + t + "' toujours accepté", r.ok, r.msg)
  }
  const a3 = await asUser(U.alice, INS_EVT, [espace, B.A, 'inconnu', 'x_' + RUN, raw(REF.A, 'x_' + RUN, '2025-01-01'), '2025-01-01'])
  check('type inconnu toujours refusé (CHECK)', !a3.ok && a3.code === '23514', a3.code + ' ' + a3.msg)

  // Entrées persistées (dans la transaction) pour les lectures : une par SCI.
  const evA = (await q(INS_EVT, [espace, B.A, 'manque_accepte', 'mqaA_' + RUN, raw(REF.A, 'mqaA_' + RUN, '2025-01-01'), '2025-01-01'])).rows[0]
  await q(INS_EVT, [espace, B.B, 'manque_accepte', 'mqaB_' + RUN, raw(REF.B, 'mqaB_' + RUN, '2025-01-01'), '2025-01-01'])
  const lectA = await asUser(U.alice, "select legacy_id, legacy_raw, type_evenement from public.baux_evenements where espace_id = $1 and type_evenement = 'manque_accepte' order by legacy_id", [espace])
  check('Alice lit les 2 manques, legacy_raw intact (motif, montant, ym)', lectA.ok && lectA.rows.length === 2 && lectA.rows[0].legacy_raw.motif === 'panne électrique' && lectA.rows[0].legacy_raw.montant === 20 && lectA.rows[0].legacy_raw.ym === '2026-08', JSON.stringify(lectA))

  const c1 = await asUser(U.carol, INS_EVT, [espace, B.A, 'manque_accepte', 'c1_' + RUN, raw(REF.A, 'c1_' + RUN, '2025-01-01'), '2025-01-01'])
  check('Carol (scopée SCI-A) écrit un manque sur le bail de SCI-A', c1.ok, c1.msg)
  const c2 = await asUser(U.carol, INS_EVT, [espace, B.B, 'manque_accepte', 'c2_' + RUN, raw(REF.B, 'c2_' + RUN, '2025-01-01'), '2025-01-01'])
  check('Carol ne peut PAS écrire sur le bail de SCI-B (RLS par entité)', !c2.ok, 'accepté')
  const c3 = await asUser(U.carol, "select legacy_id from public.baux_evenements where espace_id = $1 and type_evenement = 'manque_accepte'", [espace])
  check('Carol ne lit que SCI-A', c3.ok && c3.rows.length === 1 && c3.rows[0].legacy_id === 'mqaA_' + RUN, JSON.stringify(c3))

  // (5) Annulation = suppression douce gardée par version (forme de store-supabase softDelete).
  const SOFT = 'update public.baux_evenements set deleted_at = now() where id = $1 and version = $2 and deleted_at is null returning version'
  const perime = await asUser(U.alice, SOFT, [evA.id, Number(evA.version) + 7])
  check('annulation avec une version PÉRIMÉE : 0 ligne (concurrence optimiste)', perime.ok && perime.rows.length === 0, JSON.stringify(perime))
  const annule = await asUser(U.alice, SOFT, [evA.id, evA.version])
  check('annulation (deleted_at) avec la bonne version : 1 ligne', annule.ok && annule.rows.length === 1, JSON.stringify(annule))

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
