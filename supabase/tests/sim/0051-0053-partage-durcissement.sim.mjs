// Simulation SQL TRANSACTIONNELLE des migrations 0051 (config scopée en allowlist), 0052 (cohérence
// d'écriture par rattachement) et 0053 (durcissements : casse des refs, résolveurs-oracles, appartenance
// active, invitations). Une seule transaction, ROLLBACK systématique : rien n'est persisté.
// Chaque action « en tant que » un utilisateur est jouée dans un SAVEPOINT puis annulée (une violation RLS
// avorte la transaction sinon, et un insert « réussi » ne doit pas polluer la mesure suivante).
//
// Acteurs : Alice = owner PLEIN · Carol = SCOPÉE gestionnaire de SCI-A (aucun droit sur SCI-B) ·
//           Dave = compte tiers (invitations).
// Trois mesures : ÉTAT ACTUEL → après 0051+0052 → après 0053. Les failles constatées « avant » sont
// affichées (preuve), les vérifications portent sur l'état final.
// Usage : node supabase/tests/sim/0051-0053-partage-durcissement.sim.mjs   (lit SUPABASE_DB_URL dans .env)
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
config({ quiet: true })

function loadMigration (name) {
  const raw = readFileSync(new URL('../../migrations/' + name, import.meta.url), 'utf8')
  const sql = raw.split(/\r?\n/).filter(l => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n')
  // Garde-fou : aucun COMMIT résiduel (ex. « commit; -- x ») ne doit survivre, il validerait la simulation.
  const noComments = sql.split(/\r?\n/).map(l => l.replace(/--.*$/, '')).join('\n')
  if (/\bcommit\b\s*;/i.test(noComments)) throw new Error('COMMIT résiduel dans ' + name + ' : simulation refusée')
  return sql
}
const MIG = ['0051_espace_config_scoped_allowlist.sql', '0052_partage_write_coherence.sql', '0053_partage_durcissement.sql'].map(loadMigration)

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), carol: randomUUID(), dave: randomUUID() }
const MAIL = k => 'sim0051-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()
const E = { A: randomUUID(), B: randomUUID() }, I = { A: randomUUID(), B: randomUUID() }, L = { A: randomUUID(), B: randomUUID() }
const REF = { A: 'SIM-A-' + RUN, B: 'SIM-B-' + RUN }
const STALE = randomUUID()   // ligne d'agenda à l'entite_id PÉRIMÉE : entité SCI-A mais logement de SCI-B (cas réel : 190 en prod)

// Joue une requête EN TANT QUE uid, dans un savepoint toujours annulé. `pre` = SQL joué AVANT en rôle
// d'origine (fixtures propres au cas, annulées avec le savepoint). Renvoie { ok, rows, code, msg }.
async function asUser (uid, sql, params, { email, pre, post } = {}) {
  await q('savepoint su')
  try {
    if (pre) for (const [s, p] of pre) await q(s, p)
    await q('set local role authenticated')
    await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
      [JSON.stringify({ sub: uid, role: 'authenticated', email: email || '' }), uid])
    const r = await q(sql, params)
    let postRows
    if (post) { await q('reset role'); postRows = (await q(post[0], post[1])).rows }   // contrôle en rôle d'origine (hors RLS)
    return { ok: true, rows: r.rows, post: postRows }
  } catch (e) {
    return { ok: false, code: e.code, msg: e.message }
  } finally {
    await q('rollback to savepoint su')
  }
}

let failed = false
const check = (label, cond, detail) => { console.log((cond ? '  OK  ' : '  KO  ') + label + (cond ? '' : ' -- ' + detail)); if (!cond) failed = true }

const INS = {
  baux: 'insert into public.baux (espace_id, entite_id, logement_id, type_bail, hc, ch, dg, jour_paiement, date_debut, locataires) values ($1,$2,$3,\'nu\',600,50,600,1,\'2026-01-01\',\'[{"nom":"Sim"}]\'::jsonb)',
  quittances: 'insert into public.quittances (espace_id, entite_id, logement_id, mois, hc, ch, date_paiement) values ($1,$2,$3,\'2026-01\',600,50,\'2026-01-05\')',
  candidats: 'insert into public.candidats (espace_id, entite_id, logement_id, legacy_raw) values ($1,$2,$3,\'{"nom":"Sim"}\'::jsonb)',
  baux_historique: 'insert into public.baux_historique (espace_id, entite_id, logement_id, archived_auto, bail_snapshot) values ($1,$2,$3,true,\'{"hc":1}\'::jsonb)',
}
const INS_AGENDA = 'insert into public.agenda (espace_id, entite_id, logement_id, immeuble_id, titre, date_evt) values ($1,$2,$3,$4,\'Sim\',\'2026-03-01\')'
const INS_MVT = 'insert into public.mouvements (espace_id, entite_id, logement_id, immeuble_id, date_mouvement, libelle, categorie, debit) values ($1,$2,$3,$4,\'2026-01-15\',\'Sim\',\'frais\',10)'
const INS_LOG = "insert into public.logements (espace_id, entite_id, immeuble_id, ref, type, surface, loyer_hc_ref, charges_ref) values ($1,$2,$3,$4,'appartement',30,500,40)"
const INS_INVIT = 'insert into public.invitations (espace_id, token, grants, invite_email, created_by) values ($1,$2,$3::jsonb,$4,$5)'

async function measure (phase) {
  console.log(phase + ' :')
  const o = {}
  const cfg = await asUser(U.carol, 'select public.espace_config_scoped($1) as c', [espace])
  o.cfg = cfg.ok ? (cfg.rows[0].c || {}) : null
  o.cfgKeys = o.cfg ? Object.keys(o.cfg).sort() : ['ERR ' + cfg.msg]
  for (const t of Object.keys(INS)) {
    o['forge_' + t] = (await asUser(U.carol, INS[t], [espace, E.A, L.B])).ok      // entité A + logement de B
    o['legit_' + t] = (await asUser(U.carol, INS[t], [espace, E.A, L.A])).ok      // tout en A
    o['viaLog_' + t] = (await asUser(U.carol, INS[t], [espace, null, L.A])).ok    // entité NULL, logement A
  }
  o.forge_agenda_imm = (await asUser(U.carol, INS_AGENDA, [espace, E.A, null, I.B])).ok
  o.forge_agenda_log = (await asUser(U.carol, INS_AGENDA, [espace, null, L.A, I.B])).ok
  o.legit_agenda     = (await asUser(U.carol, INS_AGENDA, [espace, null, L.A, I.A])).ok
  o.orphan_agenda    = (await asUser(U.carol, INS_AGENDA, [espace, null, null, null])).ok
  o.forge_mvt_imm    = (await asUser(U.carol, INS_MVT, [espace, E.A, null, I.B])).ok          // entité A + immeuble de B
  o.legit_mvt        = (await asUser(U.carol, INS_MVT, [espace, null, L.A, I.A])).ok
  o.forge_logement   = (await asUser(U.carol, INS_LOG, [espace, E.A, I.B, 'SIM-X-' + RUN])).ok // logement A sous immeuble de B
  o.legit_logement   = (await asUser(U.carol, INS_LOG, [espace, E.A, I.A, 'SIM-Y-' + RUN])).ok
  o.alice_bail_B     = (await asUser(U.alice, INS.baux, [espace, E.B, L.B])).ok
  o.alice_agenda_orphan = (await asUser(U.alice, INS_AGENDA, [espace, null, null, null])).ok
  const acfg = await asUser(U.alice, 'select public.espace_config_scoped($1) as c', [espace])
  o.aliceCfgKeys = acfg.ok ? Object.keys(acfg.rows[0].c || {}).sort() : []
  // F4 — résolveurs-oracles
  const orB = await asUser(U.carol, 'select public.entite_of_logement($1,$2) as e, public.entite_of_immeuble($1,$3) as i', [espace, L.B, I.B])
  o.oracleB = orB.ok ? (orB.rows[0].e || orB.rows[0].i) : 'ERR'
  const orA = await asUser(U.carol, 'select public.entite_of_logement($1,$2) as e', [espace, L.A])
  o.resolveA = orA.ok ? orA.rows[0].e : 'ERR'
  // m2 — appartenance révoquée mais octroi entite_membre encore présent
  const rev = await asUser(U.carol, 'select count(*)::int as n from public.logements where espace_id = $1', [espace],
    { pre: [["update public.espace_members set invite_status = 'revoked' where espace_id = $1 and user_id = $2", [espace, U.carol]]] })
  o.revokedSees = rev.ok ? rev.rows[0].n : 'ERR'
  // F6 — invitations
  const tok = 'sim-tok-' + RUN
  const grants = JSON.stringify([{ entite_id: E.A, mode: 'lecture' }])
  const mk = mail => [[INS_INVIT, [espace, tok, grants, mail, U.alice]]]
  o.inv_wrong_email = (await asUser(U.dave, 'select public.accept_invitation($1) as e', [tok], { email: MAIL('dave'), pre: mk('quelquun-dautre-' + RUN + '@example.test') })).ok
  o.inv_right_email = (await asUser(U.dave, 'select public.accept_invitation($1) as e', [tok], { email: MAIL('dave').toUpperCase(), pre: mk(MAIL('dave')) })).ok
  o.inv_no_email    = (await asUser(U.dave, 'select public.accept_invitation($1) as e', [tok], { email: MAIL('dave'), pre: mk(null) })).ok
  // ré-activation d'une ANCIENNE ligne « plein gestionnaire » révoquée via une invitation lecture
  const react = await asUser(U.dave,
    'select public.accept_invitation($1) as e', [tok],
    { email: MAIL('dave'), post: ['select full_espace, role::text as role, invite_status::text as st from public.espace_members where espace_id = $1 and user_id = $2', [espace, U.dave]], pre: [...mk(MAIL('dave')), ["insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'gestionnaire','revoked',true)", [espace, U.dave]]] })
  o.reactivated = react.ok ? (react.post[0] || {}) : { err: react.msg }
  // lecture fail-closed : ligne à rattachements incohérents (entité A + logement B)
  const st = await asUser(U.carol, 'select count(*)::int as n from public.agenda where id = $1', [STALE])
  o.staleSeenByCarol = st.ok ? st.rows[0].n : 'ERR'
  const stA = await asUser(U.alice, 'select count(*)::int as n from public.agenda where id = $1', [STALE])
  o.staleSeenByAlice = stA.ok ? stA.rows[0].n : 'ERR'
  // M2 — octroi DORMANT (gestionnaire SCI-B) d'un ancien membre révoqué, ré-activé par une invitation lecture SCI-A
  const dorm = await asUser(U.dave, 'select public.accept_invitation($1) as e', [tok], {
    email: MAIL('dave'),
    pre: [...mk(MAIL('dave')),
      ["insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'lecture_seule','revoked',false)", [espace, U.dave]],
      ["insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.B, U.dave]]],
    post: ["select (entite_id = $3) as est_sci_a, role::text as role from public.entite_membre where espace_id = $1 and user_id = $2", [espace, U.dave, E.A]] })
  o.dormant = dorm.ok ? dorm.post : [{ err: dorm.msg }]
  // m2 — rouvrir SON lien déjà accepté après expiration = no-op (pas « expirée »)
  const idem = await asUser(U.dave, 'select public.accept_invitation($1) as e', [tok], {
    email: MAIL('dave'),
    pre: [["insert into public.invitations (espace_id, token, grants, invite_email, created_by, status, accepted_by, accepted_at, expires_at) values ($1,$2,$3::jsonb,$4,$5,'accepted',$6,now() - interval '10 days', now() - interval '3 days')", [espace, tok, grants, MAIL('dave'), U.alice, U.dave]]] })
  o.idemAfterExpiry = idem.ok
  const def = await q("select column_default from information_schema.columns where table_schema='public' and table_name='invitations' and column_name='expires_at'")
  o.expiresDefault = def.rows[0].column_default

  console.log('   config vue par Carol            :', o.cfgKeys.join(', ') || '(vide)')
  console.log('   trace de SCI-B dans sa config   :', o.cfg && JSON.stringify(o.cfg).includes(REF.B) ? 'OUI' : 'non')
  console.log('   écritures forgées acceptées     :', Object.entries(o).filter(([k, v]) => k.startsWith('forge_') && v === true).map(([k]) => k.slice(6)).join(', ') || '(aucune)')
  console.log('   oracle entité de SCI-B          :', o.oracleB ? 'révélée' : 'NULL')
  console.log('   Carol révoquée voit logements   :', o.revokedSees)
  console.log('   ligne périmée (entité A+logement B) vue par Carol :', o.staleSeenByCarol, '| octrois après ré-activation :', JSON.stringify(o.dormant), '| ré-ouverture après expiration :', o.idemAfterExpiry)
  console.log('   invitation acceptée mauvais mail:', o.inv_wrong_email, '| ré-activation :', JSON.stringify(o.reactivated), '| défaut expires_at :', o.expiresDefault)
  return o
}

try {
  await q('begin')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0051', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  for (const s of ['A', 'B']) {
    await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [E[s], espace, 'SCI-' + s + '-' + RUN])
    await q('insert into public.immeubles (id, espace_id, entite_id, nom) values ($1,$2,$3,$4)', [I[s], espace, E[s], 'Imm-' + s + '-' + RUN])
    await q("insert into public.logements (id, espace_id, entite_id, immeuble_id, ref, type, surface, loyer_hc_ref, charges_ref) values ($1,$2,$3,$4,$5,'appartement',40,600,50)", [L[s], espace, E[s], I[s], REF[s]])
  }
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.A, U.carol])
  // F2 — ce que Carol (gestionnaire SCI-A) peut légitimement créer : un logement de SCI-A dont la ref est
  // une VARIANTE DE CASSE de celle de SCI-B, et un immeuble HOMONYME (casse différente) de celui de SCI-B.
  await q("insert into public.logements (espace_id, entite_id, immeuble_id, ref, type, surface, loyer_hc_ref, charges_ref) values ($1,$2,$3,$4,'appartement',20,300,20)", [espace, E.A, I.A, REF.B.toLowerCase()])
  await q('insert into public.immeubles (espace_id, entite_id, nom) values ($1,$2,$3)', [espace, E.A, ('Imm-B-' + RUN).toUpperCase()])
  await q("insert into public.agenda (id, espace_id, entite_id, logement_id, titre, date_evt) values ($1,$2,$3,$4,'Perime','2026-05-01')", [STALE, espace, E.A, L.B])
  await q('insert into public.espace_config (espace_id, data) values ($1,$2)', [espace, JSON.stringify({
    categories: ['loyer'],
    importRules: [{ pattern: 'LOCATAIRE SECRET', qui: 'autre' }],
    templates: { bail: 'modele prive' },
    bailEvents: [{ ref: 'autre', hcAvant: 800, hcApres: 820 }],
    params: { mandataire: { nom: 'Secret' }, bankPending: { c1: [{ libelle: 'VIR SECRET', montant: 900 }] } },
    zzzCleInconnue: [{ x: 1 }],
    irlHistorique: [{ ref: REF.A, nouveauHC: 1 }, { ref: REF.B, nouveauHC: 2 }],
    loyerBareme: [{ ref: REF.A, hc: 600 }, { ref: REF.B, hc: 800 }],
    equipements: { [REF.A]: { x: 1 }, [REF.B]: { x: 2 } },
    regulValidations: { ['Imm-A-' + RUN + '|2025-01|2025-12']: { ok: 1 }, ['Imm-B-' + RUN + '|2025-01|2025-12']: { ok: 1 } },
    irlLettres: [{ x: 1 }],
  })])

  const s0 = await measure('ÉTAT ACTUEL (avant 0051/0052/0053)')
  await q(MIG[0]); await q(MIG[1])
  const s1 = await measure('APRÈS 0051 + 0052')
  await q(MIG[2])
  const s2 = await measure('APRÈS 0053')

  console.log('Vérifications (état final) :')
  const leakKeys = ['categories', 'importRules', 'templates', 'bailEvents', 'params', 'zzzCleInconnue', 'irlLettres']
  const perSci = ['irlHistorique', 'loyerBareme', 'assurances', 'compteursReleves', 'equipements', 'emailsSent', 'regulValidations']
  check('0051 : aucune clé hors allowlist pour Carol (dès 0051)', !s1.cfgKeys.some(k => leakKeys.includes(k)) && !s2.cfgKeys.some(k => leakKeys.includes(k)), s2.cfgKeys.join(','))
  check('0051 : seules des clés par-SCI sont renvoyées', s2.cfgKeys.every(k => perSci.includes(k)), s2.cfgKeys.join(','))
  check('0051 : Carol reçoit bien la ref SCI-A (non-régression)', s2.cfg && s2.cfg.irlHistorique.some(x => x.ref === REF.A) && REF.A in s2.cfg.equipements, JSON.stringify(s2.cfg))
  check('0051 : Alice (plein) reçoit toujours le blob intégral', ['importRules', 'params', 'zzzCleInconnue', 'irlLettres'].every(k => s2.aliceCfgKeys.includes(k)), s2.aliceCfgKeys.join(','))
  check('0053-A : variante de casse / immeuble homonyme → AUCUNE trace de SCI-B dans la config de Carol', s2.cfg && !JSON.stringify(s2.cfg).includes(REF.B) && !JSON.stringify(s2.cfg).includes('Imm-B-'), JSON.stringify(s2.cfg))
  for (const t of Object.keys(INS)) {
    check('0052 : ' + t + ' forgé (entité A + logement B) REFUSÉ', s2['forge_' + t] === false, 'accepté')
    check('0052 : ' + t + ' légitime accepté (entité A + logement A, et logement A seul)', s2['legit_' + t] === true && s2['viaLog_' + t] === true, 'refusé')
  }
  check('0052 : agenda forgé (entité A + immeuble B) et (logement A + immeuble B) REFUSÉS', s2.forge_agenda_imm === false && s2.forge_agenda_log === false, 'accepté')
  check('0052 : agenda légitime accepté ; sans rattachement refusé à une scopée', s2.legit_agenda === true && s2.orphan_agenda === false, JSON.stringify([s2.legit_agenda, s2.orphan_agenda]))
  check('0052 : mouvement forgé (entité A + immeuble B) REFUSÉ ; légitime accepté', s2.forge_mvt_imm === false && s2.legit_mvt === true, JSON.stringify([s2.forge_mvt_imm, s2.legit_mvt]))
  check('0052 : logement de SCI-A sous un immeuble de SCI-B REFUSÉ ; légitime accepté', s2.forge_logement === false && s2.legit_logement === true, JSON.stringify([s2.forge_logement, s2.legit_logement]))
  check('0052 : Alice (manager plein) écrit toujours sur SCI-B et sans rattachement (comportement P0)', s2.alice_bail_B === true && s2.alice_agenda_orphan === true, 'refusé')
  check('0052 : LECTURE fail-closed — ligne à entite_id périmée (entité A + logement B) invisible de Carol, visible d\'Alice', s2.staleSeenByCarol === 0 && s2.staleSeenByAlice === 1, JSON.stringify([s2.staleSeenByCarol, s2.staleSeenByAlice]))
  check('0053-B : résolveur → NULL pour une ligne de SCI-B (plus d\'oracle)', !s2.oracleB, String(s2.oracleB))
  check('0053-B : résolveur → entité pour une ligne de SCI-A (non-régression)', s2.resolveA === E.A, String(s2.resolveA))
  check('0053-C : appartenance révoquée → plus aucun logement visible malgré l\'octroi restant', s2.revokedSees === 0, String(s2.revokedSees))
  check('0053-D : invitation nominative refusée à un autre email', s2.inv_wrong_email === false, 'acceptée')
  check('0053-D : invitation nominative acceptée par le bon email (insensible à la casse) ; sans email = lien porteur OK', s2.inv_right_email === true && s2.inv_no_email === true, JSON.stringify([s2.inv_right_email, s2.inv_no_email]))
  check('0053-D : ré-activation d\'une ancienne ligne « plein gestionnaire » → SCOPÉE lecture_seule', s2.reactivated.full_espace === false && s2.reactivated.role === 'lecture_seule' && s2.reactivated.st === 'active', JSON.stringify(s2.reactivated))
  check('0053-D : octroi DORMANT purgé à la ré-activation (il ne reste que lecture_seule sur SCI-A)', s2.dormant.length === 1 && s2.dormant[0].est_sci_a === true && s2.dormant[0].role === 'lecture_seule', JSON.stringify(s2.dormant))
  check('0053-D : rouvrir son lien déjà accepté après expiration = no-op', s2.idemAfterExpiry === true, String(s2.idemAfterExpiry))
  check('0053-D : expires_at par défaut = 7 jours', /7 days/.test(String(s2.expiresDefault)), String(s2.expiresDefault))
} catch (e) {
  failed = true
  console.error('  KO  exception :', e.message)
} finally {
  try { await q('rollback') } catch (e) {}
  const { rows } = await q('select count(*)::int as n from public.espaces where id = $1', [espace])
  const { rows: fn } = await q("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'has_entite_write_all'")
  console.log('ROLLBACK — espace de simulation persisté ?', rows[0].n === 0 ? 'non (0 ligne)' : 'OUI — ANOMALIE')
  await client.end()
  if (rows[0].n !== 0) failed = true
  console.log('          — has_entite_write_all présent en base après rollback ?', fn[0].n === 0 ? 'non (migrations non appliquées)' : 'oui (déjà déployée)')
}
console.log(failed ? 'SIM 0051-0053 ECHEC' : 'SIM 0051-0053 OK')
process.exit(failed ? 1 : 0)
