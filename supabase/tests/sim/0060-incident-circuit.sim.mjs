// Simulation SQL TRANSACTIONNELLE de la migration 0060 (CIRCUIT D'UN INCIDENT). Une seule transaction, ROLLBACK
// systématique : rien n'est persisté. Chaque action « en tant que » est jouée dans un SAVEPOINT puis annulée
// (même patron que 0059-espace-locataire.sim.mjs). 0059 doit déjà être appliquée (sinon elle est jouée d'abord).
//
// Acteurs : Alice = owner PLEIN · Carol = SCOPÉE gestionnaire de SCI-A · Dave = connecté ordinaire (aucun espace) ·
// Relais = identité technique (ligne el_relais, remplacée le temps de la transaction).
// Vérifie : émission du lien artisan (droits, rattachements déduits de l'incident, photos bornées à la SCI), frontière
// de la page artisan (rien d'autre que la demande et ses dépôts, chemins cachés), plafond décidé par la base, réponse
// du propriétaire, expiration et révocation, carnet par SCI, suivi du locataire (entreprise, créneau, accord exprès,
// résultat seulement après publication), imputation IA au propriétaire.
// Usage : DOTENV_CONFIG_PATH=../Immo/.env node supabase/tests/sim/0060-incident-circuit.sim.mjs   (lit SUPABASE_DB_URL)
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
const MIG = loadMigration('0060_incident_circuit.sql')

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = (s, p) => client.query(s, p)

const RUN = Date.now().toString(36)
const U = { alice: randomUUID(), carol: randomUUID(), dave: randomUUID(), relais: randomUUID() }
const MAIL = k => 'sim0060-' + k + '-' + RUN + '@example.test'
const espace = randomUUID()
const E = { A: randomUUID(), B: randomUUID() }
const L = { A: randomUUID(), B: randomUUID() }
const B = { A: randomUUID(), B: randomUUID() }
const jeton = () => randomBytes(32).toString('base64url')
const h = t => createHash('sha256').update(t).digest('hex')
const IP = 'abcdef0123456789'
const INC = { A: '101', B: '202', MORT: '303' }

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
const R = (fn, args) => asUser(U.relais, call(fn, args), args)
const RK = (fn, args) => asUserKeep(U.relais, call(fn, args), args)
const val = res => (res.ok && res.rows[0]) ? res.rows[0].r : undefined
const EMET = call('ar_acces_emettre', new Array(10).fill(0))
const photo = (seg2, ext = 'jpg') => ({ path: `${espace}/${seg2}/files/el-${randomUUID()}-${randomUUID()}.${ext}`, nom: 'photo' })
const demande = (photos) => ({ titre: 'Fuite sous l\'évier', description: 'Goutte à goutte', adresse: '8 rue des Lilas', locataire: 'Camille', telephone: '', photos })

try {
  await q('begin')
  if (!(await q("select to_regclass('public.locataire_acces') as t")).rows[0].t) {
    console.log('0059 absente : jouée d\'abord dans la transaction')
    await q(loadMigration('0059_espace_locataire.sql'))
  }
  for (const [k, id] of Object.entries(U)) {
    await q("insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at) values ($1,$2,'authenticated','authenticated','00000000-0000-0000-0000-000000000000',now(),now())", [id, MAIL(k)])
  }
  await q('insert into public.espaces (id, nom, created_by) values ($1,$2,$3)', [espace, 'Espace SIM 0060', U.alice])
  await q("insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace) values ($1,$2,'owner','active',true), ($1,$3,'lecture_seule','active',false)", [espace, U.alice, U.carol])
  for (const s of ['A', 'B']) await q('insert into public.entites (id, espace_id, nom) values ($1,$2,$3)', [E[s], espace, 'SCI-' + s + '-' + RUN])
  await q("insert into public.logements (id, espace_id, entite_id, ref, adresse) values ($1,$2,$3,$4,'8 rue des Lilas'), ($5,$2,$6,$7,'1 rue B')", [L.A, espace, E.A, 'SIM60-A-' + RUN, L.B, E.B, 'SIM60-B-' + RUN])
  await q("insert into public.entite_membre (espace_id, entite_id, user_id, role) values ($1,$2,$3,'gestionnaire')", [espace, E.A, U.carol])
  await q("insert into public.baux (id, espace_id, logement_id, entite_id, date_debut, locataires) values ($1,$2,$3,$4,'2025-09-01','[{\"nom\":\"Camille\"}]'::jsonb), ($5,$2,$6,$7,'2025-09-01','[{\"nom\":\"Yann\"}]'::jsonb)", [B.A, espace, L.A, E.A, B.B, L.B, E.B])
  const INCI = 'insert into public.incidents (espace_id, legacy_id, entite_id, logement_id, statut, legacy_raw, deleted_at) values ($1,$2,$3,$4,$5,$6,$7)'
  await q(INCI, [espace, INC.A, E.A, L.A, 'signale', { id: 101, statutDates: { signale: '2026-10-14T18:42:00Z' } }, null])
  await q(INCI, [espace, INC.B, E.B, L.B, 'signale', { id: 202 }, null])
  await q(INCI, [espace, INC.MORT, E.A, L.A, 'signale', { id: 303 }, new Date().toISOString()])
  // Identité technique du relais : remplacée le temps de la transaction (ligne unique de 0059).
  if ((await q('select count(*)::int as n from public.el_relais')).rows[0].n) await q('update public.el_relais set user_id = $1', [U.relais])
  else await q('insert into public.el_relais (user_id) values ($1)', [U.relais])

  await q(MIG)
  console.log('APRÈS 0060 :')
  const cov = await q(`select c.relname, c.relrowsecurity, c.relforcerowsecurity, (select count(*) from pg_policy p where p.polrelid = c.oid) as n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where ns.nspname = 'public' and c.relkind = 'r'`)
  const trous = cov.rows.filter(r => !r.relrowsecurity || !r.relforcerowsecurity || Number(r.n) < 1)
  check('couverture RLS : toutes les tables public forcées avec ≥ 1 politique', trous.length === 0, JSON.stringify(trous))

  // ── Carnet (artisans) : par SCI ──
  const ART = 'insert into public.artisans (espace_id, legacy_id, entite_id, legacy_raw) values ($1,$2,$3,$4) returning id'
  const a1 = await asUserKeep(U.alice, ART, [espace, '1', E.A, { nom: 'Plomberie Weber', notePrivee: 'Ponctuel' }])
  await asUserKeep(U.alice, ART, [espace, '2', E.B, { nom: 'Serrurerie B' }])
  const a2 = await asUser(U.carol, ART, [espace, '3', E.B, { nom: 'X' }])
  const a3 = await asUser(U.carol, 'select legacy_raw->>\'nom\' as n from public.artisans where espace_id = $1', [espace])
  const a4 = await asUser(U.dave, 'select id from public.artisans where espace_id = $1', [espace])
  check('carnet : Alice écrit ; Carol (scopée A) ne crée rien dans B, ne lit que A (note privée comprise) ; Dave ne voit rien',
    a1.ok && !a2.ok && a3.ok && a3.rows.length === 1 && a3.rows[0].n === 'Plomberie Weber' && a4.ok && a4.rows.length === 0, JSON.stringify({ a1, a2, a3, a4 }))

  // ── Émission du lien (propriétaire) ──
  const T1 = jeton(), H1 = h(T1)
  const pA = photo(E.A)
  const e1 = await asUserKeep(U.alice, EMET, [espace, INC.A, null, 'Plomberie Weber', 'Contact@Weber.test', '06 39 98 45 67', 'plomberie', 300, demande([pA]), H1])
  check('Alice émet le lien de Plomberie Weber (incident de SCI-A, plafond 300)', e1.ok, JSON.stringify(e1))
  const ACC = val(e1)
  const ro = (await q('select entite_id, logement_id, artisan_email, plafond_ttc from public.artisan_acces where id = $1', [ACC])).rows[0]
  check('rattachements DÉDUITS de l\'incident ; e-mail normalisé ; plafond figé', ro.entite_id === E.A && ro.logement_id === L.A && ro.artisan_email === 'contact@weber.test' && Number(ro.plafond_ttc) === 300, JSON.stringify(ro))
  const c1 = await asUser(U.carol, EMET, [espace, INC.A, null, 'Autre', null, null, 'plomberie', 0, demande([]), h(jeton())])
  const c2 = await asUser(U.carol, EMET, [espace, INC.B, null, 'Autre', null, null, 'plomberie', 0, demande([]), h(jeton())])
  const d1 = await asUser(U.dave, EMET, [espace, INC.A, null, 'Autre', null, null, 'plomberie', 0, demande([]), h(jeton())])
  check('Carol (scopée A) émet pour SCI-A, pas pour SCI-B (42501) ; Dave refusé (42501)', c1.ok && !c2.ok && c2.code === '42501' && !d1.ok && d1.code === '42501', JSON.stringify({ c1, c2, d1 }))
  const mort = await asUser(U.alice, EMET, [espace, INC.MORT, null, 'X', null, null, null, 0, demande([]), h(jeton())])
  const inconnu = await asUser(U.alice, EMET, [espace, '999', null, 'X', null, null, null, 0, demande([]), h(jeton())])
  check('incident supprimé ou inconnu : même refus (pas d\'oracle)', !mort.ok && mort.code === '42501' && !inconnu.ok && inconnu.code === '42501', JSON.stringify({ mort, inconnu }))
  const pX = await asUser(U.alice, EMET, [espace, INC.A, null, 'X', null, null, null, 0, demande([photo(E.B)]), h(jeton())])
  const pAutreEsp = await asUser(U.alice, EMET, [espace, INC.A, null, 'X', null, null, null, 0, demande([{ path: randomUUID() + '/' + E.A + '/files/x-' + randomUUID() + '.jpg' }]), h(jeton())])
  const pOrphC = await asUser(U.carol, EMET, [espace, INC.A, null, 'X', null, null, null, 0, demande([photo('_orphelin')]), h(jeton())])
  const pOrphA = await asUser(U.alice, EMET, [espace, INC.A, null, 'X', null, null, null, 0, demande([photo('_orphelin')]), h(jeton())])
  const pTrav = await asUser(U.alice, EMET, [espace, INC.A, null, 'X', null, null, null, 0, demande([{ path: espace + '/' + E.A + '/files/../' + E.B + '/files/x.jpg' }]), h(jeton())])
  check('photos : une autre SCI, un autre espace, « .. » refusés (23514) ; sans SCI : membre plein seulement',
    !pX.ok && pX.code === '23514' && !pAutreEsp.ok && !pOrphC.ok && pOrphA.ok && !pTrav.ok, JSON.stringify({ pX, pAutreEsp, pOrphC, pOrphA, pTrav }))
  const pl = await asUser(U.alice, EMET, [espace, INC.A, null, 'X', null, null, null, -1, demande([]), h(jeton())])
  const em = await asUser(U.alice, EMET, [espace, INC.A, null, 'X', 'pas-un-mail', null, null, 0, demande([]), h(jeton())])
  check('plafond négatif (22023) et e-mail invalide refusés', !pl.ok && pl.code === '22023' && !em.ok, JSON.stringify({ pl, em }))

  // ── Lectures et écritures directes du propriétaire ──
  const j1 = await asUser(U.alice, 'select * from public.artisan_acces_jeton', [])
  const u1 = await asUser(U.alice, 'update public.artisan_acces set plafond_ttc = 99999 where id = $1', [ACC])
  const u2 = await asUser(U.alice, 'insert into public.artisan_depots (acces_id, espace_id, type_depot, storage_path, mime, statut) values ($1,$2,$3,$4,$5,$6)', [ACC, espace, 'devis', espace + '/' + E.A + '/files/ar-' + ACC + '-' + randomUUID() + '.pdf', 'application/pdf', 'accepte'])
  const s1 = await asUser(U.carol, 'select id from public.artisan_acces where espace_id = $1', [espace])
  const s2 = await asUser(U.dave, 'select id from public.artisan_acces', [])
  check('empreintes illisibles ; aucune écriture directe (plafond, faux devis) ; Carol lit les liens de A ; Dave rien',
    !j1.ok && !u1.ok && u1.code === '42501' && !u2.ok && s1.ok && s1.rows.length === 1 && s2.ok && s2.rows.length === 0, JSON.stringify({ j1, u1, u2, s1, s2 }))

  // ── Page de l'artisan (identité du relais seulement) ──
  const r0 = await asUser(U.alice, call('ar_ouvrir', [0, 0]), [H1, IP])
  check('un connecté ordinaire (même propriétaire) ne peut pas appeler ar_ouvrir (42501)', !r0.ok && r0.code === '42501', JSON.stringify(r0))
  const o1 = val(await R('ar_ouvrir', [H1, IP]))
  check('ar_ouvrir : actif, entreprise, bailleur, plafond, demande', o1 && o1.actif === true && o1.artisan === 'Plomberie Weber' && /^SCI-A-/.test(o1.bailleur) && Number(o1.plafond_ttc) === 300 && o1.demande.adresse === '8 rue des Lilas', JSON.stringify(o1))
  check('ar_ouvrir : photos sans leur chemin, ni e-mail ni téléphone de l\'artisan, ni incident', o1 && JSON.stringify(o1).indexOf(espace) === -1 && o1.demande.photos.length === 1 && o1.demande.photos[0].index === 0 && !('artisan_email' in o1), JSON.stringify(o1))
  const o2 = val(await R('ar_ouvrir', [h(jeton()), IP]))
  check('jeton inconnu : « inactif », aucune donnée', o2 && o2.actif === false && Object.keys(o2).length === 1, JSON.stringify(o2))
  const f1 = val(await RK('ar_fichier', [H1, IP, 'demande', 0, null]))
  const f2 = val(await R('ar_fichier', [H1, IP, 'demande', 3, null]))
  const f3 = val(await R('ar_fichier', [H1, IP, 'document', null, randomUUID()]))
  check('photo de la demande ouverte par son rang ; rang absent ou source inconnue : rien', f1 && f1.path === pA.path && f2.absent === true && f3.absent === true, JSON.stringify({ f1, f2, f3 }))
  const st1 = await asUser(U.relais, call('ar_objet_ouvert', [0, 0]), [pA.path, 'lecture'])
  const st2 = await asUser(U.alice, call('ar_objet_ouvert', [0, 0]), [pA.path, 'lecture'])
  check('stockage : le relais lit le chemin ouvert ; un autre compte non', val(st1) === true && val(st2) === false, JSON.stringify({ st1, st2 }))

  // ── Dépôts : devis sous / au-dessus du plafond, facture, photo ──
  const depot = async (ext) => { const d = val(await RK('ar_depot', [H1, IP, ext])); await RK('ar_depot_fin', [H1, IP, d.path, 'b'.repeat(64), 2048]); return d.path }
  const pre = espace + '/' + E.A + '/files/ar-' + ACC + '-'
  const dv1 = await depot('pdf'), dv2 = await depot('pdf'), fac = await depot('jpg'), ph = await depot('png')
  check('ticket de dépôt : chemin imposé sous la SCI de l\'incident', dv1.startsWith(pre) && ph.startsWith(pre), dv1)
  const doc1 = val(await RK('ar_document', [H1, IP, 'devis', dv1, 'Devis D-298', 118, 'D-298']))
  const doc2 = val(await RK('ar_document', [H1, IP, 'devis', dv2, 'Devis D-311', 1180, 'D-311']))
  const doc3 = await R('ar_document', [H1, IP, 'facture', fac, 'Facture', null, null])
  const doc4 = val(await RK('ar_document', [H1, IP, 'facture', fac, 'Facture', 118, 'F-1042']))
  const doc5 = val(await RK('ar_document', [H1, IP, 'photo', ph, 'Joint usé', 50, null]))
  const doc6 = await R('ar_document', [H1, IP, 'devis', pre + randomUUID() + '.pdf', 'X', 10, null])
  const doc7 = await R('ar_document', [H1, IP, 'devis', dv1, 'Doublon', 10, null])
  check('devis 118 € ≤ plafond 300 € : accepté automatiquement ; 1 180 € : en attente (décidé par la base)', doc1.statut === 'auto_accepte' && doc2.statut === 'en_attente', JSON.stringify({ doc1, doc2 }))
  check('facture sans montant refusée (22023) ; facture et photo enregistrées (montant d\'une photo ignoré)', !doc3.ok && doc3.code === '22023' && doc4.statut === null && doc5 && doc5.id, JSON.stringify({ doc3, doc4, doc5 }))
  check('chemin non déposé sous ticket, ou déjà enregistré : refusé', !doc6.ok && !doc7.ok, JSON.stringify({ doc6, doc7 }))
  const dPhoto = (await q('select montant_ttc, entite_id from public.artisan_depots where id = $1', [doc5.id])).rows[0]
  check('dépôt : montant d\'une photo nul, rattachement copié du lien', dPhoto.montant_ttc === null && dPhoto.entite_id === E.A, JSON.stringify(dPhoto))
  const o3 = val(await R('ar_ouvrir', [H1, IP]))
  check('l\'artisan voit ses 4 dépôts et leurs statuts', o3.depots.length === 4 && o3.depots.some(d => d.statut === 'en_attente'), JSON.stringify(o3.depots))

  // ── Réponse du propriétaire ──
  const de1 = await asUser(U.dave, call('ar_devis_decider', [0, 0]), [doc2.id, true])
  const de2 = await asUserKeep(U.carol, call('ar_devis_decider', [0, 0]), [doc2.id, true])
  const de3 = await asUser(U.alice, call('ar_devis_decider', [0, 0]), [doc2.id, false])
  const de4 = await asUser(U.alice, call('ar_devis_decider', [0, 0]), [doc1.id, false])
  check('devis au-dessus du plafond : Dave refusé ; Carol (écriture sur A) accepte ; pas de seconde décision ; un devis automatique ne se re-décide pas',
    !de1.ok && val(de2) === 'accepte' && !de3.ok && /ar:deja-decide/.test(de3.msg) && !de4.ok, JSON.stringify({ de1, de2, de3, de4 }))

  // ── Créneau et constat ──
  const sam = (await q("select (current_date + ((6 - extract(isodow from current_date)::int + 7) % 7) + 7)::date as d")).rows[0].d
  const lun = (await q("select (current_date + ((8 - extract(isodow from current_date)::int) % 7) + 7)::date as d")).rows[0].d
  const cr1 = await RK('ar_creneau', [H1, IP, sam, '08:00', '10:00'])
  const cr2 = await R('ar_creneau', [H1, IP, sam, '10:00', '08:00'])
  const cs1 = await RK('ar_constat', [H1, IP, 'usure', null, 'petite', 'Joint et collier changés'])
  const cs2 = await R('ar_constat', [H1, IP, 'faute', null, 'petite', null])
  check('créneau proposé ; heures inversées refusées ; constat neutre enregistré ; constat hors liste refusé', val(cr1) === true && !cr2.ok && val(cs1) === true && !cs2.ok, JSON.stringify({ cr1, cr2, cs1, cs2 }))
  const ia1 = val(await R('ar_ia_autorise', [H1, IP]))
  check('IA du lien artisan : imputée au compte qui a émis le lien (Alice)', ia1 && ia1.proprietaire === U.alice, JSON.stringify(ia1))

  // ── Locataire : signalement enrichi, suivi, créneau, résultat ──
  const TL = jeton(), HL = h(TL)
  await asUserKeep(U.alice, call('el_acces_emettre', [0, 0, 0, 0]), [B.A, 0, 'Camille', HL])
  const sg = await RK('el_signaler', [HL, IP, 'cuisine', 'fuite_eau', 'importante', 'Fuite sous l\'évier', '[]', { resume: 'Fuite goutte à goutte', element: 'canalisation' }, true, '06 39 98 12 34', 'Code 4719B', 'Matins'])
  const SIG = val(sg)
  const sgOld = await R('el_signaler', [HL, IP, 'cuisine', 'fuite_eau', 'faible', 'Ancien appel (7 paramètres)', '[]'])
  const sgTel = (await q('select tel_partage, telephone, ia->>\'element\' as el from public.locataire_signalements where id = $1', [SIG])).rows[0]
  check('el_signaler : aide de l\'IA, accord et téléphone, accès, présences ; ancien appel à 7 paramètres toujours accepté',
    SIG && sgTel.tel_partage === true && sgTel.telephone === '06 39 98 12 34' && sgTel.el === 'canalisation' && sgOld.ok && val(sgOld), JSON.stringify({ sg, sgOld, sgTel }))
  const sgNon = val(await RK('el_signaler', [HL, IP, 'cuisine', 'autre', 'faible', 'Sans accord', '[]', null, false, '0611111111', null, null]))
  const tNon = (await q('select tel_partage, telephone from public.locataire_signalements where id = $1', [sgNon])).rows[0]
  check('sans accord : le téléphone n\'est PAS enregistré (D13)', tNon.tel_partage === false && tNon.telephone === null, JSON.stringify(tNon))
  await q('update public.locataire_signalements set incident_legacy_id = $1, importe_le = now() where id = $2', [INC.A, SIG])
  const ls1 = val(await R('el_signalements', [HL, IP])).find(s => s.id === SIG)
  check('suivi : entreprise et créneau visibles ; aucun résultat ni verdict avant publication', ls1.intervention && ls1.intervention.entreprise === 'Plomberie Weber' && ls1.intervention.creneau.debut === '08:00' && ls1.resultat === null && JSON.stringify(ls1).indexOf('118') === -1, JSON.stringify(ls1))
  const cf1 = await R('el_creneau_confirmer', [HL, IP, SIG, false])
  const cf2 = await RK('el_creneau_confirmer', [HL, IP, SIG, true])
  check('créneau un samedi : accord exprès exigé (art. 7 e) ; avec l\'accord : confirmé', !cf1.ok && /el:accord-requis/.test(cf1.msg) && val(cf2) === true, JSON.stringify({ cf1, cf2 }))
  await RK('ar_creneau', [H1, IP, lun, '08:00', '10:00'])
  const cf3 = val(await RK('el_creneau_confirmer', [HL, IP, SIG, false]))
  const cfx = (await q('select creneau_confirme_le, creneau_accord_expres from public.artisan_acces where id = $1', [ACC])).rows[0]
  check('nouveau créneau un lundi : la confirmation précédente est annulée, puis reconfirmée sans accord exprès', cf3 === true && cfx.creneau_confirme_le && cfx.creneau_accord_expres === false, JSON.stringify({ cf3, cfx }))
  const cfA = await asUser(U.alice, 'update public.artisan_acces set creneau_confirme_le = now() where id = $1', [ACC])
  check('le propriétaire ne peut pas confirmer à la place du locataire (42501)', !cfA.ok && cfA.code === '42501', JSON.stringify(cfA))
  const pub0 = await asUser(U.alice, 'update public.locataire_signalements set ia = null where id = $1', [SIG])
  const pub1 = await asUserKeep(U.alice, 'update public.locataire_signalements set resultat = $1, resultat_publie_le = now() where id = $2 returning id', [{ payeur: 'locataire', montantTtc: 118 }, SIG])
  const pub2 = await asUser(U.dave, 'update public.locataire_signalements set resultat = $1, resultat_publie_le = now() where id = $2 returning id', [{ payeur: 'bailleur' }, SIG])
  const ls2 = val(await R('el_signalements', [HL, IP])).find(s => s.id === SIG)
  check('publication : Alice publie le résultat (colonne autorisée), ne touche pas à l\'aide de l\'IA ; Dave non ; le locataire voit le résultat',
    !pub0.ok && pub1.ok && pub1.rows.length === 1 && (!pub2.ok || pub2.rows.length === 0) && ls2.resultat && ls2.resultat.montantTtc === 118, JSON.stringify({ pub0, pub1, pub2, ls2 }))
  const ial = val(await R('el_ia_autorise', [HL, IP]))
  check('IA du lien locataire : imputée au compte qui a émis le lien (Alice)', ial && ial.proprietaire === U.alice, JSON.stringify(ial))

  // ── Renouvellement, validation, expiration, révocation ──
  const T2 = jeton()
  const e2 = await asUserKeep(U.alice, EMET, [espace, INC.A, null, 'plomberie weber', null, null, 'plomberie', 450, demande([pA]), h(T2)])
  const oOld = val(await R('ar_ouvrir', [H1, IP])), oNew = val(await R('ar_ouvrir', [h(T2), IP]))
  check('renouveler (même incident, même entreprise) : même lien, nouvel accès ; l\'ancien jeton cesse', val(e2) === ACC && oOld.actif === false && oNew.actif === true && Number(oNew.plafond_ttc) === 450 && oNew.depots.length === 4, JSON.stringify({ e2, oOld, oNew }))
  const H2 = h(T2)
  const v1 = await asUserKeep(U.alice, call('ar_acces_valider', [0]), [ACC])
  check('validation finale : fin du lien = validation + 30 jours', v1.ok && Math.abs(new Date(val(v1)) - (Date.now() + 30 * 864e5)) < 120e3, JSON.stringify(v1))
  const cs3 = await R('ar_constat', [H2, IP, 'casse', null, 'petite', null])
  check('après validation : le constat n\'est plus modifiable par l\'artisan (el:ferme)', !cs3.ok && /el:ferme/.test(cs3.msg), JSON.stringify(cs3))
  await q("update public.artisan_acces set valide_le = now() - interval '31 days' where id = $1", [ACC])
  const oExp = val(await R('ar_ouvrir', [H2, IP]))
  await q("update public.artisan_acces set valide_le = null, emis_le = now() - interval '91 days' where id = $1", [ACC])
  const oMax = val(await R('ar_ouvrir', [H2, IP]))
  await q("update public.artisan_acces set emis_le = now() where id = $1", [ACC])
  check('expiration : validation + 30 jours dépassés, ou émission + 90 jours : lien inactif', oExp.actif === false && oMax.actif === false, JSON.stringify({ oExp, oMax }))
  await q('update public.incidents set deleted_at = now() where espace_id = $1 and legacy_id = $2', [espace, INC.A])
  const oSup = val(await R('ar_ouvrir', [H2, IP]))
  await q('update public.incidents set deleted_at = null where espace_id = $1 and legacy_id = $2', [espace, INC.A])
  const ctc = val(await asUser(U.alice, call('ar_acces_contact', [0, 0]), [ACC, H2]))
  const ctcFaux = val(await asUser(U.alice, call('ar_acces_contact', [0, 0]), [ACC, h(jeton())]))
  check('incident supprimé : lien inactif ; contact du lien (e-mail du relais) lu par le propriétaire, refusé avec un autre jeton', oSup.actif === false && ctc && ctc.email === null && ctcFaux === null, JSON.stringify({ oSup, ctc, ctcFaux }))
  const rv = await asUserKeep(U.carol, call('ar_acces_revoquer', [0]), [ACC])
  const oRv = val(await R('ar_ouvrir', [H2, IP]))
  const lsRv = val(await R('el_signalements', [HL, IP])).find(s => s.id === SIG)
  check('révocation : lien inactif, l\'entreprise disparaît du suivi du locataire', rv.ok && oRv.actif === false && lsRv.intervention === null, JSON.stringify({ rv, oRv, lsRv }))

  // ── Limite des jetons invalides (table partagée avec 0059) ──
  const rl0 = await asUserKeep(U.relais, "select count(public.ar_ouvrir(md5(g::text) || md5(g::text || 'x'), 'feedfacecafebe60')) as n from generate_series(1, 20) g", [])
  const rl = await R('ar_ouvrir', [h(jeton()), 'feedfacecafebe60'])
  check('20 jetons invalides depuis une IP, puis : el:limite', rl0.ok && !rl.ok && /el:limite/.test(rl.msg), JSON.stringify({ rl0, rl }))
} finally {
  try { await q('rollback') } catch (e) {}
  await client.end()
}
console.log(failed ? '\nÉCHEC' : '\nTOUT OK (rollback : rien de persisté)')
process.exit(failed ? 1 : 0)
