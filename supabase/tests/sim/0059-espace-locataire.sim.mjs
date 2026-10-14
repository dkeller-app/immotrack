// Simulation SQL TRANSACTIONNELLE de la migration 0059 (ESPACE LOCATAIRE). Une seule transaction, ROLLBACK
// systématique : rien n'est persisté. Chaque action « en tant que » est jouée dans un SAVEPOINT puis annulée
// (même patron que 0057-incidents.sim.mjs).
//
// Acteurs : Alice = owner PLEIN · Carol = SCOPÉE gestionnaire de SCI-A · Dave = connecté ordinaire (aucun espace) ·
// Relais = identité technique (ligne el_relais). Locataires : Camille (A0) et Léo (A1) colocataires du bail BA
// (SCI-A, lot 1) ; Zoé (A2) bail BA2 (SCI-A, autre lot) ; Yann (AB) bail BB (SCI-B).
// Vérifie l'ISOLATION : un locataire ne lit ni n'écrit rien d'un autre locataire (même bail), d'un autre lot, d'une
// autre SCI, après révocation ou expiration ; un connecté ordinaire et l'anonyme sont refusés ; le propriétaire ne
// peut ni lire les empreintes ni forger l'accord ; un associé scopé ne publie pas hors de sa SCI.
// Usage : DOTENV_CONFIG_PATH=../Immo/.env node supabase/tests/sim/0059-espace-locataire.sim.mjs   (lit SUPABASE_DB_URL)
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import { randomUUID, createHash, randomBytes } from 'node:crypto'
import pg from 'pg'
config(process.env.DOTENV_CONFIG_PATH ? { quiet: true, path: process.env.DOTENV_CONFIG_PATH } : { quiet: true })

function loadMigration (name) {
  const raw = readFileSync(new URL('../../migrations/' + name, import.meta.url), 'utf8')
  const sql = raw.split(/\r?\n/).filter(l => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n')
  const noComments = sql.split(/\r?\n/).map(l => l.replace(/--.*$/, '')).join('\n')
  if (/\bcommit\b\s*;/i.test(noComments)) throw new Error('COMMIT résiduel dans ' + name + ' : simulation refusée')
  return sql
}
const MIG = loadMigration('0059_espace_locataire.sql')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), carol: randomUUID(), dave: randomUUID(), relais: randomUUID() }
const MAIL = k => 'sim0059-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()
const E = { A: randomUUID(), B: randomUUID() }
const L = { A1: randomUUID(), A2: randomUUID(), B: randomUUID() }
const B = { A: randomUUID(), A2: randomUUID(), B: randomUUID() }
const jeton = () => randomBytes(32).toString('base64url')
const h = t => createHash('sha256').update(t).digest('hex')
const T = { A0: jeton(), A1: jeton(), A2: jeton(), B: jeton() }
const H = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, h(v)]))
const IP = 'abcdef0123456789'

async function asUser (uid, sql, params, role = 'authenticated') {
  await q('savepoint su')
  try {
    await q('set local role ' + role)
    if (uid) {
      await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
        [JSON.stringify({ sub: uid, role: 'authenticated' }), uid])
    }
    const r = await q(sql, params)
    return { ok: true, rows: r.rows }
  } catch (e) {
    return { ok: false, code: e.code, msg: e.message }
  } finally {
    await q('rollback to savepoint su')
  }
}
// Variante qui GARDE l'effet (release au lieu de rollback) : pour construire l'état du scénario.
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
const R = (fn, args) => asUser(U.relais, `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)
const RK = (fn, args) => asUserKeep(U.relais, `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)
const val = res => (res.ok && res.rows[0]) ? res.rows[0].r : undefined
const EMET = 'select public.el_acces_emettre($1,$2,$3,$4) as r'
const DOC = 'insert into public.locataire_documents (espace_id, bail_id, bail_debut, cle, type_doc, titre, storage_path) values ($1,$2,$3,$4,$5,$6,$7) returning id'

try {
  await q('begin')
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0059', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  for (const s of ['A', 'B']) await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [E[s], espace, 'SCI-' + s + '-' + RUN])
  await q("insert into public.logements (id, espace_id, entite_id, ref, adresse) values ($1,$2,$3,$4,'8 rue des Lilas')", [L.A1, espace, E.A, 'SIM59-A1-' + RUN])
  await q('insert into public.logements (id, espace_id, entite_id, ref) values ($1,$2,$3,$4)', [L.A2, espace, E.A, 'SIM59-A2-' + RUN])
  await q('insert into public.logements (id, espace_id, entite_id, ref) values ($1,$2,$3,$4)', [L.B, espace, E.B, 'SIM59-B-' + RUN])
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.A, U.carol])
  const BAIL = "insert into public.baux (id, espace_id, logement_id, entite_id, date_debut, locataires) values ($1,$2,$3,$4,'2025-09-01',$5::jsonb)"
  await q(BAIL, [B.A, espace, L.A1, E.A, '[{"nom":"Camille","email":"Camille@Example.test"},{"nom":"Léo"}]'])
  await q(BAIL, [B.A2, espace, L.A2, E.A, '[{"nom":"Zoé"}]'])
  await q(BAIL, [B.B, espace, L.B, E.B, '[{"nom":"Yann"}]'])

  await q(MIG)
  console.log('APRÈS 0059 :')
  const cov = await q(`select c.relname, c.relrowsecurity, c.relforcerowsecurity, (select count(*) from pg_policy p where p.polrelid = c.oid) as n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind = 'r'`)
  const trous = cov.rows.filter(r => !r.relrowsecurity || !r.relforcerowsecurity || Number(r.n) < 1)
  check('couverture RLS : toutes les tables public forcées avec ≥ 1 politique', trous.length === 0, JSON.stringify(trous))

  // ── Émission (propriétaire) ──
  const eA0 = await asUserKeep(U.alice, EMET, [B.A, 0, 'Camille', H.A0])
  const eA1 = await asUserKeep(U.alice, EMET, [B.A, 1, 'Léo', H.A1])
  const eA2 = await asUserKeep(U.alice, EMET, [B.A2, 0, 'Zoé', H.A2])
  const eB = await asUserKeep(U.alice, EMET, [B.B, 0, 'Yann', H.B])
  check('Alice émet 4 accès (2 colocataires, autre lot, autre SCI)', [eA0, eA1, eA2, eB].every(x => x.ok), JSON.stringify([eA0, eA1, eA2, eB]))
  const A = { A0: eA0.rows[0].r, A1: eA1.rows[0].r, A2: eA2.rows[0].r, B: eB.rows[0].r }
  const c1 = await asUser(U.carol, EMET, [B.A2, 0, 'Zoé', h(jeton())])
  check('Carol (scopée A) renouvelle par émission un accès de SCI-A', c1.ok, JSON.stringify(c1))
  const c2 = await asUser(U.carol, EMET, [B.B, 0, 'Yann', h(jeton())])
  check('Carol ne peut PAS émettre pour SCI-B (42501)', !c2.ok && c2.code === '42501', JSON.stringify(c2))
  const d1 = await asUser(U.dave, EMET, [B.A, 0, 'X', h(jeton())])
  check('Dave (connecté ordinaire) ne peut PAS émettre (42501)', !d1.ok && d1.code === '42501', JSON.stringify(d1))
  const bad = await asUser(U.alice, EMET, [B.A, 0, 'Camille', 'pas-une-empreinte'])
  check('empreinte mal formée refusée (22023)', !bad.ok && bad.code === '22023', JSON.stringify(bad))

  // ── Lecture des empreintes / forge de l'accord ──
  const j1 = await asUser(U.alice, 'select * from public.locataire_acces_jeton', [])
  check('Alice ne peut PAS lire les empreintes (42501)', !j1.ok && j1.code === '42501', JSON.stringify(j1))
  const f1 = await asUser(U.alice, 'update public.locataire_acces set accord_quittance_le = now() where id = $1', [A.A0])
  check("Alice ne peut PAS forger l'accord du locataire (42501)", !f1.ok && f1.code === '42501', JSON.stringify(f1))
  const f2 = await asUser(U.alice, "update public.locataire_acces set fin_bail = '2026-08-31' where id = $1 returning id", [A.A0])
  check('Alice pose la fin de bail (colonne autorisée)', f2.ok && f2.rows.length === 1, JSON.stringify(f2))
  const s1 = await asUser(U.carol, 'select id from public.locataire_acces where espace_id = $1', [espace])
  check('Carol voit les 3 accès de SCI-A, pas celui de SCI-B', s1.ok && s1.rows.length === 3 && !s1.rows.some(r => r.id === A.B), JSON.stringify(s1))
  const s2 = await asUser(U.dave, 'select id from public.locataire_acces', [])
  check('Dave ne voit aucun accès', s2.ok && s2.rows.length === 0, JSON.stringify(s2))

  // ── Fonctions locataire : réservées à l'identité du relais ──
  const r0 = await R('el_ouvrir', [H.A0, IP])
  check('avant inscription du relais : refus (42501)', !r0.ok && r0.code === '42501', JSON.stringify(r0))
  await q('insert into public.el_relais (user_id) values ($1)', [U.relais])
  const o1 = val(await R('el_ouvrir', [H.A0, IP]))
  check('relais : el_ouvrir(Camille) actif, phase complet, nom et logement', o1 && o1.actif === true && o1.phase === 'complet' && o1.locataire === 'Camille' && o1.logement === '8 rue des Lilas', JSON.stringify(o1))
  const o2 = val(await R('el_ouvrir', [h(jeton()), IP]))
  check('jeton inconnu : { actif:false } sans aucune donnée', o2 && o2.actif === false && Object.keys(o2).length === 1, JSON.stringify(o2))
  const dv = await asUser(U.dave, 'select public.el_ouvrir($1,$2)', [H.A0, IP])
  check('Dave appelle el_ouvrir avec une empreinte VALIDE : refus (42501)', !dv.ok && dv.code === '42501', JSON.stringify(dv))
  const an = await asUser(null, 'select public.el_ouvrir($1,$2)', [H.A0, IP], 'anon')
  check('anonyme : refus (42501)', !an.ok && an.code === '42501', JSON.stringify(an))
  const al = await asUser(U.alice, 'select public.el_documents($1,$2)', [H.A0, IP])
  check('Alice (propriétaire) appelle une fonction locataire : refus (42501)', !al.ok && al.code === '42501', JSON.stringify(al))

  const ct0 = val(await R('el_contact', [H.A0, IP])), ct1 = val(await R('el_contact', [H.A1, IP]))
  check("el_contact : l'e-mail du colocataire de CET accès seulement (Léo n'en a pas)", ct0 && ct0.email === 'camille@example.test' && ct1 && ct1.email === null, JSON.stringify({ ct0, ct1 }))
  // ── Documents ──
  const pA = espace + '/' + E.A + '/files/qt_sim_a.pdf', pA2 = espace + '/' + E.A + '/files/qt_sim_a2.pdf', pB = espace + '/' + E.B + '/files/qt_sim_b.pdf'
  const dA = await asUserKeep(U.alice, DOC, [espace, B.A, '2025-09-01', 'quittance:2026-09', 'quittance', 'Quittance de septembre 2026', pA])
  const dA2 = await asUserKeep(U.alice, DOC, [espace, B.A2, '2025-09-01', 'quittance:2026-09', 'quittance', 'Quittance A2', pA2])
  const dB = await asUserKeep(U.alice, DOC, [espace, B.B, '2025-09-01', 'quittance:2026-09', 'quittance', 'Quittance B', pB])
  check('Alice publie un document par bail', dA.ok && dA2.ok && dB.ok, JSON.stringify([dA, dA2, dB]))
  const D = { A: dA.rows[0].id, A2: dA2.rows[0].id, B: dB.rows[0].id }
  const cp1 = await asUser(U.carol, DOC, [espace, B.B, '2025-09-01', 'quittance:2026-10', 'quittance', 'X', pB])
  check('Carol ne publie PAS sur un bail de SCI-B (42501)', !cp1.ok && cp1.code === '42501', JSON.stringify(cp1))
  const cp2 = await asUser(U.carol, DOC, [espace, B.A, '2025-09-01', 'quittance:2026-10', 'quittance', 'X', pB])
  check("Carol ne publie PAS, sur un bail de SCI-A, un FICHIER de SCI-B (42501)", !cp2.ok && cp2.code === '42501', JSON.stringify(cp2))
  const cp3 = await asUser(U.alice, DOC, [espace, B.A, '2025-09-01', 'quittance:2026-11', 'quittance', 'X', randomUUID() + '/' + E.A + '/files/autre.pdf'])
  check("chemin d'un autre espace refusé (23514)", !cp3.ok && cp3.code === '23514', JSON.stringify(cp3))
  const ldA0 = val(await R('el_documents', [H.A0, IP])), ldA1 = val(await R('el_documents', [H.A1, IP]))
  const ldA2 = val(await R('el_documents', [H.A2, IP])), ldB = val(await R('el_documents', [H.B, IP]))
  check('Camille et Léo voient le document commun du bail, et lui seul', ldA0.length === 1 && ldA0[0].id === D.A && ldA1.length === 1 && ldA1[0].id === D.A, JSON.stringify({ ldA0, ldA1 }))
  check('Zoé (autre lot) et Yann (autre SCI) ne voient que le leur', ldA2.length === 1 && ldA2[0].id === D.A2 && ldB.length === 1 && ldB[0].id === D.B, JSON.stringify({ ldA2, ldB }))
  check('la liste des documents ne contient pas le chemin de stockage', !JSON.stringify(ldA0).includes('/files/'), JSON.stringify(ldA0))
  const fx1 = val(await R('el_fichier', [H.A0, IP, 'document', D.B, null]))
  check("Camille ne peut PAS ouvrir le document de SCI-B (null)", fx1 === null, JSON.stringify(fx1))
  const ouv = await asUserKeep(U.relais, 'select public.el_fichier($1,$2,$3,$4,$5) as r', [H.A0, IP, 'document', D.A, null])
  check('Camille ouvre son document : chemin renvoyé', ouv.ok && ouv.rows[0].r && ouv.rows[0].r.path === pA, JSON.stringify(ouv))
  const st1 = await asUser(U.relais, 'select public.el_objet_ouvert($1, $2) as r', [pA, 'lecture'])
  const st2 = await asUser(U.relais, 'select public.el_objet_ouvert($1, $2) as r', [pB, 'lecture'])
  const st3 = await asUser(U.dave, 'select public.el_objet_ouvert($1, $2) as r', [pA, 'lecture'])
  check('stockage : le relais lit le chemin ouvert, pas un autre ; Dave non', val(st1) === true && val(st2) === false && val(st3) === false, JSON.stringify({ st1, st2, st3 }))
  // Politique RÉELLE du seau (storage.objects) : objets présents pour A et B ; le relais ne lit que le chemin ouvert.
  await q("insert into storage.objects (bucket_id, name) values ('espace-files', $1), ('espace-files', $2)", [pA, pB])
  const so1 = await asUser(U.relais, 'select name from storage.objects where bucket_id = $1 and name = any($2)', ['espace-files', [pA, pB]])
  check("storage.objects : le relais ne voit QUE l'objet ouvert", so1.ok && so1.rows.length === 1 && so1.rows[0].name === pA, JSON.stringify(so1))
  const so2 = await asUser(U.dave, 'select name from storage.objects where bucket_id = $1 and name = any($2)', ['espace-files', [pA, pB]])
  check('storage.objects : Dave ne voit rien', so2.ok && so2.rows.length === 0, JSON.stringify(so2))
  await q("update public.locataire_ouvertures set jusqu_au = now() - interval '1 second' where storage_path = $1", [pA])
  const st4 = await asUser(U.relais, 'select public.el_objet_ouvert($1, $2) as r', [pA, 'lecture'])
  check('ouverture expirée (60 s passées) : lecture refusée', val(st4) === false, JSON.stringify(st4))
  const ret = await asUserKeep(U.alice, 'update public.locataire_documents set retire_le = now() where id = $1 returning id', [D.A2])
  const ldA2b = val(await R('el_documents', [H.A2, IP]))
  check('document retiré : invisible', ret.ok && ldA2b.length === 0, JSON.stringify({ ret, ldA2b }))
  const gel = await asUser(U.alice, 'update public.locataire_documents set bail_id = $2 where id = $1', [D.A, B.B])
  check('rattachement d\'un document gelé (42501)', !gel.ok && gel.code === '42501', JSON.stringify(gel))

  // ── Accord ──
  const ac = val(await RK('el_accord', [H.A0, IP, true, 'v1', false]))
  check('Camille donne son accord (horodaté)', ac && ac.donne_le && ac.version === 'v1', JSON.stringify(ac))
  const vu = await asUser(U.alice, 'select accord_quittance_le from public.locataire_acces where id = $1', [A.A0])
  check("l'accord est visible côté propriétaire", vu.ok && vu.rows[0].accord_quittance_le, JSON.stringify(vu))
  const vu2 = await asUser(U.alice, 'select accord_quittance_le from public.locataire_acces where id = $1', [A.A1])
  check("l'accord de Camille ne vaut pas pour Léo", vu2.ok && vu2.rows[0].accord_quittance_le === null, JSON.stringify(vu2))

  // ── Signalements ──
  const dep = val(await RK('el_depot', [H.A0, IP, 'jpg']))
  const prefA0 = espace + '/' + E.A + '/files/el-' + A.A0 + '-'
  check('ticket de dépôt : chemin imposé sous le préfixe de Camille', dep && dep.path.startsWith(prefA0) && dep.path.endsWith('.jpg'), JSON.stringify(dep))
  const stD = await asUser(U.relais, 'select public.el_objet_ouvert($1, $2) as r', [dep.path, 'depot'])
  check('stockage : dépôt autorisé sous ticket', val(stD) === true, JSON.stringify(stD))
  const so3 = await asUser(U.relais, "insert into storage.objects (bucket_id, name) values ('espace-files', $1) returning name", [dep.path])
  const so4 = await asUser(U.relais, "insert into storage.objects (bucket_id, name) values ('espace-files', $1) returning name", [prefA0 + randomUUID() + '.jpg'])
  check('storage.objects : dépôt du relais accepté sous ticket, refusé hors ticket', so3.ok && !so4.ok, JSON.stringify({ so3, so4 }))
  const photo = JSON.stringify([{ path: dep.path, nom: 'photo.jpg', mime: 'image/jpeg' }])
  const sg1 = await R('el_signaler', [H.A1, IP, 'cuisine', 'fuite_eau', 'importante', 'Fuite sous évier', photo])
  check("Léo ne peut PAS joindre la photo déposée par Camille (23514)", !sg1.ok && sg1.code === '23514', JSON.stringify(sg1))
  const sg2 = await RK('el_signaler', [H.A0, IP, 'cuisine', 'fuite_eau', 'importante', 'Fuite sous évier', photo])
  check('Camille signale un incident avec photo', sg2.ok && sg2.rows[0].r, JSON.stringify(sg2))
  const SG = sg2.rows[0].r
  const lsA1 = val(await R('el_signalements', [H.A1, IP]))
  const lsA0 = val(await R('el_signalements', [H.A0, IP]))
  check('Léo ne voit pas le signalement de Camille ; Camille le voit (Signalé)', lsA1.length === 0 && lsA0.length === 1 && lsA0[0].statut === 'signale', JSON.stringify({ lsA0, lsA1 }))
  const vB = await asUser(U.carol, 'select id from public.locataire_signalements where id = $1', [SG])
  check("Carol (SCI-A) voit le signalement côté propriétaire", vB.ok && vB.rows.length === 1, JSON.stringify(vB))
  // Import au registre (par l'app) + qualification interne : JAMAIS visible du locataire.
  await q("insert into public.incidents (id, espace_id, entite_id, logement_id, legacy_id, statut, legacy_raw) values ($1,$2,$3,$4,'1739000000001','en_cours',$5::jsonb)",
    [randomUUID(), espace, E.A, L.A1, JSON.stringify({ statutDates: { signale: '2026-10-14T08:00:00Z', en_cours: '2026-10-15T09:00:00Z' }, verdict: { payeur: 'locataire', regle: 'R1' }, payeurRetenu: 'locataire', artisan: { nom: 'Plombier' } })])
  const imp = await asUserKeep(U.alice, "update public.locataire_signalements set incident_legacy_id = '1739000000001', importe_le = now() where id = $1 returning id", [SG])
  const lsA0b = val(await R('el_signalements', [H.A0, IP]))
  const txt = JSON.stringify(lsA0b)
  check('après import : statut « en cours » et dates du registre', imp.ok && lsA0b[0].statut === 'en_cours' && lsA0b[0].dates.en_cours, txt)
  check('jamais verdict, payeur, artisan ni règle côté locataire', !/verdict|payeur|artisan|R1|Plombier/.test(txt), txt)
  const fxS1 = val(await R('el_fichier', [H.A1, IP, 'signalement', SG, 0]))
  const fxS0 = val(await R('el_fichier', [H.A0, IP, 'signalement', SG, 0]))
  check('photo du signalement : Léo non, Camille oui', fxS1 === null && fxS0 && fxS0.path === dep.path, JSON.stringify({ fxS0, fxS1 }))

  // ── Messages ──
  const m1 = await RK('el_message_envoyer', [H.A0, IP, 'Bonjour', '[]', SG])
  check('Camille écrit au bailleur', m1.ok && m1.rows[0].r, JSON.stringify(m1))
  const MSGI = 'insert into public.locataire_messages (acces_id, auteur, corps) values ($1,$2,$3) returning id'
  const m2 = await asUserKeep(U.alice, MSGI, [A.A0, 'bailleur', 'Un plombier passe jeudi.'])
  check('Alice répond (auteur bailleur)', m2.ok, JSON.stringify(m2))
  const m3 = await asUser(U.alice, MSGI, [A.A0, 'locataire', 'faux'])
  check('Alice ne peut PAS écrire au nom du locataire (42501)', !m3.ok && m3.code === '42501', JSON.stringify(m3))
  const m4 = await asUser(U.carol, MSGI, [A.B, 'bailleur', 'hors SCI'])
  check('Carol ne peut PAS écrire dans un fil de SCI-B (42501)', !m4.ok && m4.code === '42501', JSON.stringify(m4))
  const lmA1 = val(await R('el_messages', [H.A1, IP])), lmA0 = val(await R('el_messages', [H.A0, IP]))
  check('fil privé : Léo ne voit rien, Camille voit ses 2 messages', lmA1.length === 0 && lmA0.length === 2, JSON.stringify({ lmA0, lmA1 }))
  const piecesB = JSON.stringify([{ path: espace + '/' + E.B + '/files/el-' + A.B + '-' + randomUUID() + '.pdf', nom: 'x.pdf' }])
  const m5 = await R('el_message_envoyer', [H.A0, IP, 'pièce volée', piecesB, null])
  check("pièce jointe d'un autre accès refusée (23514)", !m5.ok && m5.code === '23514', JSON.stringify(m5))
  const m6 = await R('el_message_envoyer', [H.A1, IP, 'lien', '[]', SG])
  check("Léo ne peut PAS rattacher un message au signalement de Camille (23514)", !m6.ok && m6.code === '23514', JSON.stringify(m6))

  // ── Révocation, renouvellement ──
  const rv = await asUserKeep(U.alice, 'select public.el_acces_revoquer($1)', [A.A1])
  const oRev = val(await R('el_ouvrir', [H.A1, IP])), dRev = val(await R('el_documents', [H.A1, IP]))
  check('révoqué : lien inactif, aucun document', rv.ok && oRev.actif === false && dRev === null, JSON.stringify({ rv, oRev, dRev }))
  const crv = await asUser(U.carol, 'select public.el_acces_revoquer($1)', [A.B])
  check('Carol ne peut PAS révoquer un accès de SCI-B (42501)', !crv.ok && crv.code === '42501', JSON.stringify(crv))
  const HN = h(jeton())
  const rn = await asUserKeep(U.alice, 'select public.el_acces_renouveler($1,$2) as r', [A.A1, HN])
  const oOld = val(await R('el_ouvrir', [H.A1, IP])), oNew = val(await R('el_ouvrir', [HN, IP]))
  check("renouvelé : l'ancien lien reste inactif, le nouveau ouvre le MÊME accès (Léo)", rn.ok && rn.rows[0].r === A.A1 && oOld.actif === false && oNew.actif === true && oNew.locataire === 'Léo', JSON.stringify({ rn, oOld, oNew }))

  // ── Phases (D4) et expiration ──
  await q("update public.locataire_acces set fin_bail = current_date - 30, comptes_clos_le = null where id = $1", [A.A0])
  const pD = val(await R('el_ouvrir', [H.A0, IP]))
  const sgD = await R('el_signaler', [H.A0, IP, 'cuisine', 'autre', 'faible', 'Après départ', '[]'])
  const msD = await R('el_message_envoyer', [H.A0, IP, 'Dépôt de garantie ?', '[]', null])
  check('après la fin du bail : phase départ, signalement fermé, messages ouverts', pD.phase === 'depart' && !sgD.ok && /el:ferme/.test(sgD.msg) && msD.ok, JSON.stringify({ pD, sgD, msD }))
  await q("update public.locataire_acces set comptes_clos_le = current_date - 10 where id = $1", [A.A0])
  const pDoc = val(await R('el_ouvrir', [H.A0, IP]))
  const msDoc = await R('el_message_envoyer', [H.A0, IP, 'encore', '[]', null])
  const ldDoc = val(await R('el_documents', [H.A0, IP]))
  check('après la clôture : documents seuls (messages fermés, documents lisibles)', pDoc.phase === 'documents' && !msDoc.ok && Array.isArray(ldDoc) && ldDoc.length === 1, JSON.stringify({ pDoc, msDoc, ldDoc }))
  await q("update public.locataire_acces set comptes_clos_le = current_date - 200 where id = $1", [A.A0])
  const pFin = val(await R('el_ouvrir', [H.A0, IP])), dFin = val(await R('el_documents', [H.A0, IP]))
  check('clôture + 6 mois dépassés : lien inactif', pFin.actif === false && dFin === null, JSON.stringify({ pFin, dFin }))
  await q("update public.locataire_acces set fin_bail = current_date - 450, comptes_clos_le = null where id = $1", [A.A0])
  const pCap = val(await R('el_ouvrir', [H.A0, IP]))
  check('plafond fin + 14 mois sans clôture : lien inactif', pCap.actif === false, JSON.stringify(pCap))
  const rnFin = await asUser(U.alice, 'select public.el_acces_renouveler($1,$2)', [A.A0, h(jeton())])
  check('renouveler un accès dont la période est terminée : refusé', !rnFin.ok && /el:periode-terminee/.test(rnFin.msg), JSON.stringify(rnFin))
  // Ligne de bail réutilisée par une autre location (bail non signé remplacé), fin non posée : prudence → inactif.
  await q("update public.baux set date_debut = '2027-01-01' where id = $1", [B.A2])
  const pReu = val(await R('el_ouvrir', [H.A2, IP]))
  check('ligne de bail réutilisée par une autre location : lien inactif', pReu.actif === false, JSON.stringify(pReu))

  // ── Limite de débit ──
  const rl = await asUser(U.relais, "select public.el_ouvrir(md5(g::text) || md5(g::text || 'x'), 'feedfacecafebeef') from generate_series(1, 25) g", [])
  check('plus de 20 jetons invalides par heure et par IP : el:limite', !rl.ok && /el:limite/.test(rl.msg), JSON.stringify(rl))
} finally {
  try { await q('rollback') } catch (e) {}
  await client.end()
}
console.log(failed ? '\nÉCHEC' : '\nTOUT OK (rollback : rien de persisté)')
process.exit(failed ? 1 : 0)
