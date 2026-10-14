// Simulation SQL TRANSACTIONNELLE de la migration 0057 (registre des incidents, TRAVAUX : QUI PAIE ?).
// Une seule transaction, ROLLBACK systématique : rien n'est persisté. Chaque action « en tant que » est
// jouée dans un SAVEPOINT puis annulée (même patron que 0055-baux-archivage-signe.sim.mjs).
//
// Acteurs : Alice = owner PLEIN · Carol = SCOPÉE gestionnaire de SCI-A (aucun droit sur SCI-B).
// Vérifie :
//   (1) AVANT 0057 : une pièce jointe de type 'incident' est refusée (preuve que la migration est nécessaire) ;
//   (2) APRÈS : Alice crée des incidents dans SCI-A et SCI-B ; Carol ne VOIT que SCI-A ;
//   (3) Carol écrit dans SCI-A, pas dans SCI-B ; un incident à rattachements MÉLANGÉS (logement A + SCI B) refusé ;
//   (4) partie commune (immeuble seul) : SCI-A visible de Carol, SCI-B non ; aucun rattachement → Alice seule ;
//   (5) statut contrôlé (23514) ; espace_id gelé ;
//   (6) pièce 'incident' : Carol l'ajoute à un incident de SCI-A, pas de SCI-B ; ne voit pas celles de SCI-B ;
//   (7) les types de pièce existants restent acceptés (non-régression de la contrainte).
// Usage : DOTENV_CONFIG_PATH=../Immo/.env node supabase/tests/sim/0057-incidents.sim.mjs   (lit SUPABASE_DB_URL)
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
const MIG = loadMigration('0057_incidents.sql')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), carol: randomUUID() }
const MAIL = k => 'sim0057-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()
const E = { A: randomUUID(), B: randomUUID() }, I = { A: randomUUID(), B: randomUUID() }, L = { A: randomUUID(), B: randomUUID() }
const INC = { A: randomUUID(), B: randomUUID(), PCA: randomUUID(), PCB: randomUUID(), NUL: randomUUID() }

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
const INS = 'insert into public.incidents (id, espace_id, entite_id, immeuble_id, logement_id, statut, date_signalement, legacy_raw) values ($1,$2,$3,$4,$5,$6,current_date,$7::jsonb) returning id'
const DOC = "insert into public.documents (id, espace_id, name, parent_type, parent_id) values ($1,$2,'devis.pdf',$3,$4) returning id"

try {
  await q('begin')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0057', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  for (const s of ['A', 'B']) {
    await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [E[s], espace, 'SCI-' + s + '-' + RUN])
    await q('insert into public.immeubles (id, espace_id, entite_id, nom) values ($1,$2,$3,$4)', [I[s], espace, E[s], 'Imm-' + s + '-' + RUN])
    await q("insert into public.logements (id, espace_id, entite_id, immeuble_id, ref) values ($1,$2,$3,$4,$5)", [L[s], espace, E[s], I[s], 'SIM57-' + s + '-' + RUN])
  }
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.A, U.carol])

  console.log('AVANT 0057 :')
  const av = await asUser(U.alice, DOC, [randomUUID(), espace, 'incident', randomUUID()])
  check('pièce de type incident REFUSÉE avant 0057 (preuve du défaut)', !av.ok && av.code === '23514', JSON.stringify(av))

  await q(MIG)
  console.log('APRÈS 0057 :')
  // Données gardées (créées en tant que propriétaire de la base, hors RLS) pour les lectures.
  await q(INS, [INC.A, espace, E.A, I.A, L.A, 'signale', '{"element":"ballon"}'])
  await q(INS, [INC.B, espace, E.B, I.B, L.B, 'en_cours', '{"element":"vitre"}'])
  await q(INS, [INC.PCA, espace, null, I.A, null, 'signale', '{"element":"toiture"}'])
  await q(INS, [INC.PCB, espace, null, I.B, null, 'signale', '{"element":"toiture"}'])
  await q(INS, [INC.NUL, espace, null, null, null, 'signale', '{"element":"autre"}'])
  const docA = randomUUID(), docB = randomUUID()
  await q(DOC, [docA, espace, 'incident', INC.A])
  await q(DOC, [docB, espace, 'incident', INC.B])

  // (2) lecture
  const ra = await asUser(U.alice, 'select id from public.incidents where espace_id = $1', [espace])
  check('Alice (pleine) voit les 5 incidents', ra.ok && ra.rows.length === 5, JSON.stringify(ra))
  const rc = await asUser(U.carol, 'select id from public.incidents where espace_id = $1', [espace])
  const vus = new Set((rc.rows || []).map(r => r.id))
  check('Carol voit SCI-A (logement + partie commune), pas SCI-B ni l\'incident sans rattachement',
    rc.ok && vus.size === 2 && vus.has(INC.A) && vus.has(INC.PCA), JSON.stringify(rc))

  // (3) écriture
  const w1 = await asUser(U.carol, INS, [randomUUID(), espace, E.A, I.A, L.A, 'signale', '{}'])
  check('Carol crée un incident dans SCI-A', w1.ok, JSON.stringify(w1))
  const w2 = await asUser(U.carol, INS, [randomUUID(), espace, E.B, I.B, L.B, 'signale', '{}'])
  check('Carol ne peut PAS créer dans SCI-B (42501)', !w2.ok && w2.code === '42501', JSON.stringify(w2))
  const w3 = await asUser(U.carol, INS, [randomUUID(), espace, E.B, null, L.A, 'signale', '{}'])
  check('rattachements MÉLANGÉS (logement A + SCI B) refusés', !w3.ok && w3.code === '42501', JSON.stringify(w3))
  const w4 = await asUser(U.carol, INS, [randomUUID(), espace, null, null, null, 'signale', '{}'])
  check('Carol ne peut PAS créer un incident sans rattachement (fail-closed)', !w4.ok && w4.code === '42501', JSON.stringify(w4))
  const u1 = await asUser(U.carol, "update public.incidents set statut = 'resolu' where id = $1 returning id", [INC.B])
  check('Carol ne peut PAS modifier un incident de SCI-B (0 ligne)', u1.ok && u1.rows.length === 0, JSON.stringify(u1))
  const u2 = await asUser(U.carol, "update public.incidents set statut = 'resolu' where id = $1 returning version", [INC.A])
  check('Carol modifie un incident de SCI-A (version +1 par touch_row)', u2.ok && u2.rows.length === 1 && Number(u2.rows[0].version) === 2, JSON.stringify(u2))
  const u3 = await asUser(U.carol, 'update public.incidents set entite_id = $2, logement_id = $3, immeuble_id = $4 where id = $1 returning id', [INC.A, E.B, L.B, I.B])
  check('Carol ne peut PAS déplacer un incident de SCI-A vers SCI-B', !u3.ok && u3.code === '42501', JSON.stringify(u3))
  const d1 = await asUser(U.carol, 'delete from public.incidents where id = $1 returning id', [INC.B])
  check('Carol ne peut PAS supprimer un incident de SCI-B (0 ligne)', d1.ok && d1.rows.length === 0, JSON.stringify(d1))

  // (5) contraintes
  const s1 = await asUser(U.alice, INS, [randomUUID(), espace, E.A, I.A, L.A, 'perdu', '{}'])
  check('statut hors liste refusé (23514)', !s1.ok && s1.code === '23514', JSON.stringify(s1))
  const f1 = await asUser(U.alice, 'update public.incidents set espace_id = $2 where id = $1', [INC.A, randomUUID()])
  check('espace_id gelé (freeze_espace_id)', !f1.ok, JSON.stringify(f1))

  // (6) pièces du dossier de preuves
  const p1 = await asUser(U.carol, DOC, [randomUUID(), espace, 'incident', INC.A])
  check('Carol ajoute une pièce à un incident de SCI-A', p1.ok, JSON.stringify(p1))
  const p2 = await asUser(U.carol, DOC, [randomUUID(), espace, 'incident', INC.B])
  check('Carol ne peut PAS ajouter une pièce à un incident de SCI-B (42501)', !p2.ok && p2.code === '42501', JSON.stringify(p2))
  const p3 = await asUser(U.carol, 'select id from public.documents where id = any($1)', [[docA, docB]])
  check('Carol voit la pièce de SCI-A, pas celle de SCI-B', p3.ok && p3.rows.length === 1 && p3.rows[0].id === docA, JSON.stringify(p3))

  // (6 bis) relecture Fable I4 : incident à rattachements MÉLANGÉS (SCI A + logement de SCI B), créé par un
  // membre plein — Carol (scopée A) ne doit voir NI l'incident NI ses pièces ; pièce orpheline : fail-closed.
  const INC_MIX = randomUUID(), DOC_MIX = randomUUID()
  await q(INS, [INC_MIX, espace, E.A, null, L.B, 'signale', '{}'])
  await q(DOC, [DOC_MIX, espace, 'incident', INC_MIX])
  const x1 = await asUser(U.carol, 'select id from public.incidents where id = $1', [INC_MIX])
  const x2 = await asUser(U.carol, 'select id from public.documents where id = $1', [DOC_MIX])
  check("rattachements mélangés : Carol ne voit ni l'incident ni sa pièce", x1.ok && x1.rows.length === 0 && x2.ok && x2.rows.length === 0, JSON.stringify({ x1, x2 }))
  const x3 = await asUser(U.alice, 'select id from public.documents where id = $1', [DOC_MIX])
  check('… Alice (pleine) voit la pièce', x3.ok && x3.rows.length === 1, JSON.stringify(x3))
  const o1 = await asUser(U.carol, DOC, [randomUUID(), espace, 'incident', randomUUID()])
  check('pièce rattachée à un incident inexistant : refusée pour Carol (fail-closed)', !o1.ok && o1.code === '42501', JSON.stringify(o1))

  // (7) non-régression de la contrainte des pièces
  const n1 = await asUser(U.alice, DOC, [randomUUID(), espace, 'candidat', L.A])
  const n2 = await asUser(U.alice, DOC, [randomUUID(), espace, 'equipement', L.A])
  check('types existants (candidat, equipement) toujours acceptés', n1.ok && n2.ok, JSON.stringify({ n1, n2 }))
  const n3 = await asUser(U.alice, DOC, [randomUUID(), espace, 'travaux', L.A])
  check('type inconnu toujours refusé (23514)', !n3.ok && n3.code === '23514', JSON.stringify(n3))
} finally {
  try { await q('rollback') } catch (e) {}
  await client.end()
}
console.log(failed ? '\nÉCHEC' : '\nTOUT OK (rollback : rien de persisté)')
process.exit(failed ? 1 : 0)
