// Simulation SQL TRANSACTIONNELLE de la migration 0062 (CONSOMMATION IA : compteurs atomiques et plafonds par compte).
// Une seule transaction, ROLLBACK systématique : rien n'est persisté. Chaque action « en tant que » est jouée dans un
// SAVEPOINT (même patron que 0059 / 0060).
//
// Acteurs : Alice = propriétaire d'un espace (offre 'beta' après bascule) · Bob = connecté sans espace (offre 'free') ·
// Admin = ligne app_admins ajoutée le temps de la transaction · Relais = identité technique (el_relais, remplacée).
// Vérifie : couverture RLS, bascule des espaces et défaut 'beta', garde de l'abonnement (plan_id non modifiable par
// l'utilisateur), réservation sous plafond / refus au plafond / correction, frontière relais (42501 pour tout autre),
// bornes de ia_consigner, surcharges (valeurs propres, sans plafond, expirée), droits admin, ia_mon_usage, journal.
// Usage : DOTENV_CONFIG_PATH=../Immo/.env node supabase/tests/sim/0062-ia-conso-plafonds.sim.mjs   (lit SUPABASE_DB_URL)
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
const MIG = loadMigration('0062_ia_conso_plafonds.sql')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), bob: randomUUID(), carol: randomUUID(), admin: randomUUID(), relais: randomUUID() }
const MAIL = k => 'sim0062-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()

async function asUser (uid, sql, params, role = 'authenticated') {
  await q('savepoint su')
  try {
    await q('set local role ' + role)
    if (uid) await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
    const r = await q(sql, params)
    return { ok: true, rows: r.rows }
  } catch (e) {
    return { ok: false, code: e.code, msg: e.message }
  } finally {
    await q('rollback to savepoint su')
  }
}
async function asUserKeep (uid, sql, params) {
  await q('savepoint sk')
  try {
    await q('set local role authenticated')
    await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
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
const call = (fn, args) => `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`
const val = res => (res.ok && res.rows[0]) ? res.rows[0].r : undefined
const RES = (user, famille, est) => asUserKeep(U.relais, call('ia_reserver', [0, 0, 0]), [user, famille, est])
const CONS = (args) => asUserKeep(U.relais, call('ia_consigner', new Array(12).fill(0)), args)
const consArgs = (user, mois, famille, fonction, correction, extra = {}) => [user, mois, famille, fonction, correction,
  extra.appels ?? 1, extra.audio ?? 0, extra.pages ?? 0, extra.images ?? 0, extra.je ?? 0, extra.js ?? 0, extra.cout ?? 0]

try {
  await q('begin')
  if (!(await q("select to_regclass('public.el_relais') as t")).rows[0].t) throw new Error('0059 absente : la 0062 dépend de public.el_relais')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0062', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  if ((await q('select count(*)::int as n from public.el_relais')).rows[0].n) await q('update public.el_relais set user_id = $1', [U.relais])
  else await q('insert into public.el_relais (user_id) values ($1)', [U.relais])
  const avant = (await q("select count(*)::int as n from public.espaces where plan_id = 'free'")).rows[0].n
  const admins = (await q('select count(*)::int as n from public.app_admins')).rows[0].n

  await q(MIG)
  console.log('APRÈS 0062 :')
  const cov = await q(`select c.relname, c.relrowsecurity, c.relforcerowsecurity, (select count(*) from pg_policy p where p.polrelid = c.oid) as n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind = 'r'`)
  const trous = cov.rows.filter(r => !r.relrowsecurity || !r.relforcerowsecurity || Number(r.n) < 1)
  check('couverture RLS : toutes les tables public forcées avec ≥ 1 politique', trous.length === 0, JSON.stringify(trous))

  // ── Bascule D4 ──
  const apres = (await q("select count(*)::int as n from public.espaces where plan_id = 'free'")).rows[0].n
  const plA = (await q('select plan_id from public.espaces where id = $1', [espace])).rows[0].plan_id
  check('bascule : plus aucun espace à « free » (' + avant + ' basculés), celui d\'Alice à « beta »', apres === 0 && plA === 'beta', JSON.stringify({ avant, apres, plA }))
  const sur = (await q("select count(*)::int as n from public.ia_surcharges where sans_plafond and user_id in (select user_id from public.app_admins)")).rows[0].n
  check('administrateur(s) existant(s) : surcharge « sans plafond » (' + admins + ')', sur === admins, JSON.stringify({ sur, admins }))
  await q('insert into public.app_admins (user_id) values ($1)', [U.admin])

  // ── Garde de l'abonnement ──
  const g1 = await asUser(U.alice, "update public.espaces set plan_id = 'patrimoine_plus' where id = $1", [espace])
  const g2 = await asUser(U.alice, "update public.espaces set trial_ends_at = now() + interval '1 year' where id = $1", [espace])
  const g3 = await asUser(U.alice, "update public.espaces set nom = 'Renommé' where id = $1 returning nom", [espace])
  check('Alice ne change ni l\'offre ni l\'essai de son espace (42501), mais renomme toujours', !g1.ok && g1.code === '42501' && !g2.ok && g2.code === '42501' && g3.ok && g3.rows.length === 1, JSON.stringify({ g1, g2, g3 }))
  const g6 = await asUser(U.alice, 'update public.espaces set created_by = $2 where id = $1', [espace, U.bob])
  check('created_by (lien compte → offre) non modifiable (42501)', !g6.ok && g6.code === '42501', JSON.stringify(g6))
  const nb = (await q("select nom from public.plans where id = 'beta'")).rows[0].nom
  check('offre beta renommée « Bêta » (plafonnée)', nb === 'Bêta', nb)
  const esp2 = randomUUID()
  const g4 = await asUser(U.bob, "insert into public.espaces (id, nom, created_by, plan_id, subscription_source) values ($1, 'X', $2, 'patrimoine_plus', 'comp')", [esp2, U.bob])
  const g5 = await asUser(U.bob, "select (t.e).plan_id as plan_id, (t.e).subscription_source as src from (select public.create_espace('Espace de Bob') as e) t", [])
  check('création : insertion directe refusée (RLS) ; create_espace donne l\'offre par défaut « beta »', !g4.ok && g5.ok && g5.rows[0].plan_id === 'beta' && g5.rows[0].src === null, JSON.stringify({ g4, g5 }))
  const def = (await q("select column_default from information_schema.columns where table_schema='public' and table_name='espaces' and column_name='plan_id'")).rows[0].column_default
  check('défaut de colonne plan_id = beta', /'beta'/.test(def), def)

  // ── Frontière : seul le relais réserve et consigne ──
  const f1 = await asUser(U.alice, call('ia_reserver', [0, 0, 0]), [U.alice, 'dictee', 0])
  const f2 = await asUser(U.bob, call('ia_consigner', new Array(12).fill(0)), consArgs(U.bob, null, 'dictee', 'dictee', -100000))
  const f3 = await asUser(U.alice, 'insert into public.ia_compteurs (user_id, mois, famille, unites) values ($1, date_trunc(\'month\', now())::date, \'dictee\', 0)', [U.alice])
  const f4 = await asUser(null, call('ia_reserver', [0, 0, 0]), [U.alice, 'dictee', 0], 'anon')
  check('un connecté ordinaire ne réserve ni ne consigne (42501) ; aucune écriture directe ; anon refusé', !f1.ok && f1.code === '42501' && !f2.ok && f2.code === '42501' && !f3.ok && !f4.ok, JSON.stringify({ f1, f2, f3, f4 }))

  // ── Réservation, refus au plafond, correction (Bob, offre free : 10 min = 600 s, 8 pages) ──
  const r1 = val(await RES(U.bob, 'dictee', 500))
  const r2 = val(await RES(U.bob, 'dictee', 200))
  const r3 = val(await RES(U.bob, 'dictee', 1))
  check('dictée : 500 puis 200 réservés sous le plafond (600 s), le suivant est refusé (700 ≥ 600)',
    r1 && r1.ok && r1.plafond === 600 && r2 && r2.ok && r2.unites === 700 && r3 && r3.ok === false && r3.unites === 700, JSON.stringify({ r1, r2, r3 }))
  const mois = r1.mois
  const c1 = await CONS(consArgs(U.bob, mois, 'dictee', 'dictee', -400, { audio: 100, cout: 4333 }))
  const r4 = val(await RES(U.bob, 'dictee', 0))
  check('correction après l\'appel (−400) : compteur 300, la dictée repart', c1.ok && r4 && r4.ok && r4.unites === 300, JSON.stringify({ c1, r4 }))
  await RES(U.bob, 'dictee', 400)                                     // 300 → 700 : de nouveau au plafond
  const r30 = val(await RES(U.bob, 'dictee', 0))
  const r31 = val(await RES(U.bob, 'dictee', 1))
  check('au plafond, une estimation 0 (analyse d\'une dictée déjà transcrite) passe toujours ; 1 seconde de plus, non', r30 && r30.ok === true && r30.unites === 700 && r31 && r31.ok === false, JSON.stringify({ r30, r31 }))
  await CONS(consArgs(U.bob, mois, 'dictee', 'dictee', -400, { appels: 0 }))   // retour à 300
  const rc = val(await RES(U.carol, 'dictee', 0))
  check('Carol, invitée sans espace propre sur un espace beta : plafonds beta (18 000 s)', rc && rc.plafond === 18000, JSON.stringify(rc))
  const ren = r3.renouvellement
  check('renouvellement = 1er du mois suivant', typeof ren === 'string' && /-01$/.test(ren) && ren > mois, JSON.stringify(r3))
  let okP = 0
  for (let i = 0; i < 8; i++) { const r = val(await RES(U.bob, 'pieces', 1)); if (r && r.ok) okP++ }
  const p9 = val(await RES(U.bob, 'pieces', 1))
  check('pièces : 8 pages passent, la 9e est refusée', okP === 8 && p9 && p9.ok === false, JSON.stringify({ okP, p9 }))
  const v0 = val(await RES(U.bob, 'video', 8))
  check('vidéo : sans plafond mensuel (NULL), réservée', v0 && v0.ok && v0.plafond === null, JSON.stringify(v0))
  const a1 = val(await RES(U.alice, 'dictee', 0))
  check('Alice (offre beta) : plafond de dictée 300 min = 18 000 s', a1 && a1.ok && a1.plafond === 18000, JSON.stringify(a1))

  // ── Bornes de ia_consigner ──
  const b1 = await CONS(consArgs(U.bob, mois, 'dictee', 'pieces', 0))
  const b2 = await CONS(consArgs(U.bob, '2020-01-01', 'dictee', 'dictee', 0))
  const b3 = await CONS(consArgs(U.bob, mois, 'liens', 'locataire', 0, { appels: 999 }))
  const b4 = await CONS(consArgs(U.bob, mois, 'factures', 'factures', -1000000))
  const b5 = await CONS(consArgs(U.bob, mois, 'liens', 'artisan', 0, { cout: 50000000 }))
  check('consigner : fonction/famille incohérentes, vieux mois, valeurs hors bornes → 22023',
    [b1, b2, b3, b4, b5].every(x => !x.ok && x.code === '22023'), JSON.stringify({ b1, b2, b3, b4, b5 }))
  const b6 = await CONS(consArgs(U.bob, mois, 'liens', 'locataire', 0, { je: 1200, js: 300, images: 2, cout: 410 }))
  const b7 = await CONS(consArgs(U.bob, mois, 'liens', 'locataire', 0, { je: 100, js: 10, cout: 20 }))
  const jr = (await q("select appels, jetons_e, images, cout_micro_eur from public.ia_conso_jour where user_id = $1 and fonction = 'locataire'", [U.bob])).rows[0]
  check('mesures du jour cumulées (une ligne par compte, jour, fonction)', b6.ok && b7.ok && jr && jr.appels === 2 && Number(jr.jetons_e) === 1300 && jr.images === 2 && Number(jr.cout_micro_eur) === 430, JSON.stringify({ b6, b7, jr }))

  // ── Droits admin ──
  const d1 = await asUser(U.bob, call('ia_admin_conso', [0]), [null])
  const d2 = await asUser(U.bob, call('ia_admin_surcharge_maj', new Array(9).fill(0)), [U.bob, true, null, null, null, null, null, 'moi', null])
  const d3 = await asUser(U.bob, call('ia_admin_plafonds_maj', new Array(6).fill(0)), ['free', null, null, null, null, null])
  const d4 = await asUser(U.bob, 'select count(*)::int as n from public.ia_compteurs', [])
  const d5 = await asUser(U.bob, 'select count(*)::int as n from public.ia_surcharges', [])
  check('un non-admin : ni lecture admin, ni surcharge, ni plafonds (42501) ; tables vides pour lui',
    !d1.ok && d1.code === '42501' && !d2.ok && d2.code === '42501' && !d3.ok && d3.code === '42501' && d4.ok && d4.rows[0].n === 0 && d5.ok && d5.rows[0].n === 0, JSON.stringify({ d1, d2, d3, d4, d5 }))
  const ad = val(await asUser(U.admin, call('ia_admin_conso', [0]), [null]))
  const cb = ad && ad.comptes.find(c => c.user_id === U.bob)
  check('admin : consommation du mois, compte de Bob avec e-mail, offre free, compteurs et coût', ad && cb && cb.email === MAIL('bob') && cb.plafonds.offre === 'free' && cb.unites.pieces === 8 && Number(cb.cout) === 4763 && ad.par_fonction.length >= 2,
    JSON.stringify({ cb, pf: ad && ad.par_fonction }))

  // ── Surcharges ──
  const s1 = await asUserKeep(U.admin, call('ia_admin_surcharge_maj', new Array(9).fill(0)), [U.bob, false, 20, null, null, null, null, 'Testeur EDL', null])
  const r5 = val(await RES(U.bob, 'pieces', 1))
  const r6 = val(await RES(U.bob, 'dictee', 0))
  check('surcharge propre : dictée 20 min (1 200 s), pièces = valeur de l\'offre (8, toujours refusée)', s1.ok && r6 && r6.plafond === 1200 && r6.ok && r5 && r5.ok === false && r5.plafond === 8, JSON.stringify({ s1, r5, r6 }))
  await asUserKeep(U.admin, call('ia_admin_surcharge_maj', new Array(9).fill(0)), [U.bob, true, null, null, null, null, null, 'Sans plafond', null])
  const r7 = val(await RES(U.bob, 'pieces', 1))
  check('sans plafond : la 10e page passe', r7 && r7.ok && r7.plafond === null, JSON.stringify(r7))
  await asUserKeep(U.admin, call('ia_admin_surcharge_maj', new Array(9).fill(0)), [U.bob, true, null, null, null, null, null, 'Expirée', '2020-01-01'])
  const r8 = val(await RES(U.bob, 'pieces', 1))
  check('surcharge expirée : retour aux plafonds de l\'offre', r8 && r8.ok === false && r8.plafond === 8, JSON.stringify(r8))
  const s2 = await asUserKeep(U.admin, call('ia_admin_surcharge_retirer', [0]), [U.bob])
  const jn = (await q("select count(*)::int as n from public.ia_admin_journal where cible = $1", ['compte:' + U.bob])).rows[0].n
  check('surcharge retirée ; chaque changement inscrit au journal (4 lignes)', s2.ok && jn === 4, JSON.stringify({ s2, jn }))
  const s3 = await asUserKeep(U.admin, call('ia_admin_plafonds_maj', new Array(6).fill(0)), ['free', 12, 8, 10, 5, null])
  const s4 = await asUser(U.admin, call('ia_admin_plafonds_maj', new Array(6).fill(0)), ['inconnue', 1, 1, 1, 1, 1])
  const s5 = await asUser(U.admin, call('ia_admin_plafonds_maj', new Array(6).fill(0)), ['free', -1, 1, 1, 1, 1])
  const r9 = val(await RES(U.bob, 'dictee', 0))
  check('plafonds d\'offre modifiés sans redéployer (free : 12 min) ; offre inconnue et valeur négative refusées', s3.ok && !s4.ok && !s5.ok && r9 && r9.plafond === 720, JSON.stringify({ s3, s4, s5, r9 }))
  const pl = val(await asUser(U.admin, call('ia_admin_plafonds', []), []))
  check('admin : liste des offres et de leurs plafonds (6 offres au moins)', Array.isArray(pl) && pl.length >= 6 && pl.some(o => o.plan_id === 'beta'), JSON.stringify(pl))

  // ── Utilisateur : son usage ──
  const mu = val(await asUser(U.bob, call('ia_mon_usage', []), []))
  check('ia_mon_usage : offre, plafonds et compteurs de Bob, sans euros', mu && mu.plafonds.offre === 'free' && mu.unites.pieces === 9 && !JSON.stringify(mu).includes('cout'), JSON.stringify(mu))
  const mu2 = await asUser(null, call('ia_mon_usage', []), [], 'anon')
  check('ia_mon_usage refusé à anon', !mu2.ok, JSON.stringify(mu2))
  await asUserKeep(U.admin, call('ia_admin_surcharge_maj', new Array(9).fill(0)), [U.alice, false, 400, null, null, null, null, 'note interne confidentielle', null])
  const ma = val(await asUser(U.alice, call('ia_mon_usage', []), []))
  check('ia_mon_usage ne renvoie pas la note interne (motif) de l\'administrateur', ma && !JSON.stringify(ma).includes('confidentielle') && ma.plafonds.dictee === 24000, JSON.stringify(ma))
  const sel = await asUser(U.bob, 'select count(*)::int as n from public.ia_plafonds_offre', [])
  check('catalogue des plafonds lisible par un connecté (comme public.plans)', sel.ok && sel.rows[0].n >= 6, JSON.stringify(sel))
} catch (e) {
  console.error('ERREUR :', e.message); failed = true
} finally {
  try { await q('rollback') } catch (e) { /* rien */ }
  await client.end()
}
console.log(failed ? '\nÉCHEC' : '\nTOUT VERT (transaction annulée : rien n\'est persisté)')
process.exit(failed ? 1 : 0)
