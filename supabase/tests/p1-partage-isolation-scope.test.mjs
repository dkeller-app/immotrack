import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, adminClient, deleteUserByEmail } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'
import { createSupabaseAdapter } from '../../js/core/store-supabase-adapter.js'

// ════════════════════════════════════════════════════════════════════════════
// ISOLATION PAR-SCI DU PARTAGE — preuve à DEUX utilisateurs (chantier 2026-09-17, lève le verrou 0030:34-41).
//   • Alice = owner PLEIN (full_espace=true) → voit TOUT (SCI-A + SCI-B, fichiers legacy/orphelins, membres).
//   • Bob   = membre SCOPÉ (full_espace=false), octroi LECTURE sur SCI-A seulement.
//   • Carol = membre SCOPÉ, octroi GESTIONNAIRE sur SCI-A seulement.
// Ce fichier COMPLÈTE p1-partage-sci.test.mjs (tables + download/upload) sur les surfaces qui n'y étaient
// pas prouvées : Storage list / URL signée / remove / move / copy / upload signé, Realtime (canal espace),
// RE-PULL via le VRAI adaptateur client (createSupabaseAdapter.fetchTable = ce que l'app rejoue après un
// broadcast « changed »), et la liste des membres (migration 0050).
// Tourne contre le projet hébergé (.env) : les assertions « 0050 » exigent que 0050 y soit appliquée.
// ════════════════════════════════════════════════════════════════════════════

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `iso-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `iso-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }
const C = { email: `iso-carol-${RUN}@example.test`, pass: 'Test-Passw0rd!C' }
const BUCKET = 'espace-files'

let clientA, clientB, clientC, admin
let espaceA, espaceB   // espaceB = espace PROPRE de Bob (il y est owner plein → non-régression Realtime)
let bobId, carolId
let SA, SB             // ids semés dans SCI-A / SCI-B (chez Alice)
let pathA, pathB, pathLegacy, pathOrph
const body = Buffer.from(`pdf-iso-${RUN}`)

// Tables que l'app RE-PULL par l'adaptateur (store-supabase.js ARRAY_TABLES + baux + immeubles ; toutes
// portent legacy_raw). Chaque table est semée dans les 2 SCIs pour que l'assertion « aucune ligne SCI-B »
// ait quelque chose à filtrer. baux_evenements (pas de legacy_raw, hors adaptateur) est testée en SELECT direct.
const PULLED_TABLES = ['entites', 'immeubles', 'logements', 'baux', 'baux_historique',
  'mouvements', 'quittances', 'edl', 'documents', 'assurances', 'agenda', 'candidats']

async function seedSci (client, espaceId, sciNom) {
  const tag = `${sciNom}-${RUN}`.slice(0, 20)
  const ids = {}
  const ins = async (table, row) => {
    const { data, error } = await client.from(table).insert({ espace_id: espaceId, ...row }).select('id').single()
    if (error) throw new Error(`seed ${table} (${sciNom}): ${error.message}`)
    return data.id
  }
  ids.entites   = await ins('entites',   { nom: sciNom })
  ids.immeubles = await ins('immeubles', { entite_id: ids.entites, nom: `Imm ${tag}` })
  ids.logements = await ins('logements', { entite_id: ids.entites, immeuble_id: ids.immeubles, ref: `F-${tag}`, type: 'appartement', surface: 40, loyer_hc_ref: 600, charges_ref: 50 })
  ids.baux      = await ins('baux', { logement_id: ids.logements, type_bail: 'nu', hc: 600, ch: 50, dg: 600, jour_paiement: 1, date_debut: '2026-01-01', locataires: [{ nom: 'Martin' }] })
  ids.baux_evenements = await ins('baux_evenements', { bail_id: ids.baux, type_evenement: 'revision_loyer', date_evenement: '2026-02-01' })
  ids.baux_historique = await ins('baux_historique', { logement_id: ids.logements, entite_id: ids.entites, archived_auto: true, bail_snapshot: { ref: `F-${tag}`, hc: 550 } })
  ids.mouvements = await ins('mouvements', { date_mouvement: '2026-01-15', libelle: 'Loyer', logement_id: ids.logements, categorie: 'loyer', credit: 650 })
  ids.quittances = await ins('quittances', { logement_id: ids.logements, mois: '2026-01', hc: 600, ch: 50, date_paiement: '2026-01-05' })
  ids.edl        = await ins('edl', { type_edl: 'Entrée', date_edl: '2026-01-01', logement_id: ids.logements, pieces: [] })
  ids.documents  = await ins('documents', { name: 'bail.pdf', mime: 'application/pdf', size: 10, parent_type: 'logement', parent_id: ids.logements })
  ids.assurances = await ins('assurances', { logement_id: ids.logements, compagnie: 'AXA', num_contrat: `C-${tag}`, prime: 100 })
  ids.agenda     = await ins('agenda', { logement_id: ids.logements, titre: 'Visite', date_evt: '2026-03-01' })
  ids.candidats  = await ins('candidats', { logement_id: ids.logements, legacy_raw: { nom: 'Cand', logRef: `F-${tag}` } })
  return ids
}

// Abonnement à un canal privé : 'SUBSCRIBED' dès succès, sinon 'DENIED' au timeout (un refus RLS n'atteint
// JAMAIS SUBSCRIBED ; un CHANNEL_ERROR transitoire sur websocket froide peut précéder un SUBSCRIBED).
function trySubscribe (client, topic, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const ch = client.channel(topic, { config: { private: true } })
    let done = false
    const finish = (s) => { if (done) return; done = true; try { client.removeChannel(ch) } catch {} ; resolve(s) }
    const t = setTimeout(() => finish('DENIED'), timeoutMs)
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(t); finish('SUBSCRIBED') } })
  })
}

beforeAll(async () => {
  admin = adminClient()
  await createUser(A.email, A.pass)
  const bob = await createUser(B.email, B.pass); bobId = bob.id
  const carol = await createUser(C.email, C.pass); carolId = carol.id
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  clientC = await userClient(C.email, C.pass)
  for (const c of [clientA, clientB, clientC]) { const { data } = await c.auth.getSession(); c.realtime.setAuth(data.session.access_token) }

  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice ISO' }); if (e1) throw e1; espaceA = ea.id
  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Espace Bob ISO' }); if (e2) throw e2; espaceB = eb.id

  SA = await seedSci(clientA, espaceA, `SCI-A-${RUN}`)
  SB = await seedSci(clientA, espaceA, `SCI-B-${RUN}`)

  // Bob = scopé LECTURE SCI-A ; Carol = scopée GESTIONNAIRE SCI-A (posés par Alice, manager plein).
  for (const [uid, role, mail] of [[bobId, 'lecture_seule', B.email], [carolId, 'gestionnaire', C.email]]) {
    const { error: em } = await clientA.from('espace_members').insert({ espace_id: espaceA, user_id: uid, role: 'lecture_seule', invite_status: 'active', full_espace: false, invite_email: mail })
    if (em) throw em
    const { error: eg } = await clientA.from('entite_membre').insert({ espace_id: espaceA, entite_id: SA.entites, user_id: uid, role })
    if (eg) throw eg
  }

  // Fichiers : SCI-A, SCI-B, LEGACY (<espace>/files/), ORPHELIN (<espace>/_orphelin/files/). Semés en service-role.
  pathA      = `${espaceA}/${SA.entites}/files/isoA_${RUN}.pdf`
  pathB      = `${espaceA}/${SB.entites}/files/isoB_${RUN}.pdf`
  pathLegacy = `${espaceA}/files/isoLeg_${RUN}.pdf`
  pathOrph   = `${espaceA}/_orphelin/files/isoOrph_${RUN}.pdf`
  for (const p of [pathA, pathB, pathLegacy, pathOrph]) {
    const { error } = await admin.storage.from(BUCKET).upload(p, body, { contentType: 'application/pdf', upsert: true })
    if (error) throw new Error(`seed storage ${p}: ${error.message}`)
  }
})

afterAll(async () => {
  try { await admin.storage.from(BUCKET).remove([pathA, pathB, pathLegacy, pathOrph, `${espaceA}/${SA.entites}/files/stolen_${RUN}.pdf`, `${espaceA}/${SB.entites}/files/signedHack_${RUN}.pdf`]) } catch {}
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(B.email, [espaceB])
  await deleteUserByEmail(C.email)
})

// ── 1) RE-PULL via le VRAI adaptateur client (ce que l'app rejoue après « changed » / retour de focus) ──
describe('RE-PULL (createSupabaseAdapter.fetchTable) — un scopé SCI-A ne reçoit AUCUNE ligne SCI-B', () => {
  for (const table of PULLED_TABLES) {
    it(`${table} : Bob reçoit SCI-A et jamais SCI-B ; Alice reçoit les deux`, async () => {
      const rowsB = await createSupabaseAdapter(clientB, espaceA).fetchTable(table)
      const idsB = rowsB.map(r => r.id)
      expect(idsB, `${table} SCI-B fuit vers Bob`).not.toContain(SB[table])
      expect(idsB, `${table} SCI-A absent pour Bob`).toContain(SA[table])
      const idsA = (await createSupabaseAdapter(clientA, espaceA).fetchTable(table)).map(r => r.id)
      expect(idsA).toContain(SA[table]); expect(idsA).toContain(SB[table])
    })
  }
  it('baux_evenements (SELECT direct, via bail → logement) : Bob ne voit que SCI-A', async () => {
    const { data, error } = await clientB.from('baux_evenements').select('id').eq('espace_id', espaceA)
    expect(error).toBeNull()
    const ids = data.map(r => r.id)
    expect(ids).toContain(SA.baux_evenements); expect(ids).not.toContain(SB.baux_evenements)
  })
  it('fetchConfig (RPC espace_config_scoped) : Bob ne reçoit que les clés de sa SCI', async () => {
    const { error } = await admin.from('espace_config').upsert({ espace_id: espaceA, data: {
      categories: ['loyer'],
      irlHistorique: [{ ref: `F-SCI-A-${RUN}`.slice(0, 22), nouveauHC: 1 }, { ref: `F-SCI-B-${RUN}`.slice(0, 22), nouveauHC: 2 }],
    } }, { onConflict: 'espace_id' })
    expect(error).toBeNull()
    const cfg = await createSupabaseAdapter(clientB, espaceA).fetchConfig()
    const refs = (cfg.irlHistorique || []).map(x => x.ref)
    expect(refs.some(r => r.startsWith('F-SCI-B'))).toBe(false)
    expect(cfg.categories).toEqual(['loyer'])
  })
})

// ── 2) STORAGE : list / URL signée / remove / move / copy / upload signé ────────────────────────────────
describe('STORAGE — surfaces non couvertes par p1-partage-sci (list, signed URL, remove, move, copy)', () => {
  it('list(<espace>) : Bob ne voit QUE le dossier de SCI-A (ni SCI-B, ni files/, ni _orphelin/)', async () => {
    const { data, error } = await clientB.storage.from(BUCKET).list(espaceA, { limit: 100 })
    expect(error).toBeNull()
    const names = (data || []).map(x => x.name)
    expect(names).toContain(SA.entites)
    expect(names).not.toContain(SB.entites)
    expect(names).not.toContain('files')
    expect(names).not.toContain('_orphelin')
  })
  it('list(<espace>/<SCI-B>/files) : vide pour Bob ; non vide pour Alice', async () => {
    const { data: db } = await clientB.storage.from(BUCKET).list(`${espaceA}/${SB.entites}/files`, { limit: 100 })
    expect(db).toEqual([])
    const { data: da } = await clientA.storage.from(BUCKET).list(`${espaceA}/${SB.entites}/files`, { limit: 100 })
    expect((da || []).map(x => x.name)).toContain(`isoB_${RUN}.pdf`)
  })
  it('list(<espace>) : Alice (plein) voit SCI-A, SCI-B, files/ ET _orphelin/', async () => {
    const { data } = await clientA.storage.from(BUCKET).list(espaceA, { limit: 100 })
    const names = (data || []).map(x => x.name)
    for (const n of [SA.entites, SB.entites, 'files', '_orphelin']) expect(names).toContain(n)
  })
  it('createSignedUrl(SCI-B) refusé à Bob ; createSignedUrl(SCI-A) accordé ET téléchargeable', async () => {
    const { data: dB, error: eB } = await clientB.storage.from(BUCKET).createSignedUrl(pathB, 60)
    expect(dB && dB.signedUrl).toBeFalsy(); expect(eB).not.toBeNull()
    const { data: dA, error: eA } = await clientB.storage.from(BUCKET).createSignedUrl(pathA, 60)
    expect(eA).toBeNull(); expect(dA.signedUrl).toBeTruthy()
    const res = await fetch(dA.signedUrl)
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe(body.toString())
  })
  it('download(_orphelin) et download(legacy) refusés à Bob ; accordés à Alice', async () => {
    for (const p of [pathOrph, pathLegacy]) {
      const { data } = await clientB.storage.from(BUCKET).download(p); expect(data, `Bob ${p}`).toBeNull()
      const { data: da, error } = await clientA.storage.from(BUCKET).download(p); expect(error, `Alice ${p}`).toBeNull(); expect(da).not.toBeNull()
    }
  })
  it('remove(SCI-B) par Carol (gestionnaire SCI-A) : rien de supprimé, le fichier existe toujours', async () => {
    const { data } = await clientC.storage.from(BUCKET).remove([pathB])
    expect(data || []).toEqual([])
    const { data: still } = await admin.storage.from(BUCKET).download(pathB)
    expect(still).not.toBeNull()
  })
  it('move(SCI-B → SCI-A) par Carol refusé ; le fichier SCI-B reste en place', async () => {
    const dest = `${espaceA}/${SA.entites}/files/stolen_${RUN}.pdf`
    const { error } = await clientC.storage.from(BUCKET).move(pathB, dest)
    expect(error).not.toBeNull()
    const { data: still } = await admin.storage.from(BUCKET).download(pathB); expect(still).not.toBeNull()
    const { data: moved } = await admin.storage.from(BUCKET).download(dest); expect(moved).toBeNull()
  })
  it('copy(SCI-B → SCI-A) par Carol refusé (pas de lecture source)', async () => {
    const dest = `${espaceA}/${SA.entites}/files/stolen_${RUN}.pdf`
    const { error } = await clientC.storage.from(BUCKET).copy(pathB, dest)
    expect(error).not.toBeNull()
    const { data: copied } = await admin.storage.from(BUCKET).download(dest); expect(copied).toBeNull()
  })
  it('upload par URL signée dans SCI-B par Carol : refusé (création ou envoi), rien n\'atterrit', async () => {
    const p = `${espaceA}/${SB.entites}/files/signedHack_${RUN}.pdf`
    const { data, error } = await clientC.storage.from(BUCKET).createSignedUploadUrl(p)
    if (!error && data && data.token) {
      const { error: e2 } = await clientC.storage.from(BUCKET).uploadToSignedUrl(p, data.token, body)
      expect(e2).not.toBeNull()
    } else {
      expect(error).not.toBeNull()
    }
    const { data: landed } = await admin.storage.from(BUCKET).download(p); expect(landed).toBeNull()
  })
  it('remove(SCI-A) par Carol (gestionnaire SCI-A) fonctionne (non-régression écriture octroyée)', async () => {
    const p = `${espaceA}/${SA.entites}/files/carolTmp_${RUN}.pdf`
    const { error: eu } = await clientC.storage.from(BUCKET).upload(p, body, { contentType: 'application/pdf' }); expect(eu).toBeNull()
    const { data } = await clientC.storage.from(BUCKET).remove([p])
    expect((data || []).length).toBe(1)
  })
})

// ── 3) REALTIME : un scopé ne rejoint PAS le canal de l'espace partagé (0048) ─────────────────────────
describe('REALTIME — canal espace:<id> (migration 0048)', () => {
  it('Alice (owner plein) PEUT s\'abonner à espace:<espaceA>', async () => {
    expect(await trySubscribe(clientA, `espace:${espaceA}`)).toBe('SUBSCRIBED')
  }, 15000)
  it('Bob (scopé lecture) NE PEUT PAS s\'abonner à espace:<espaceA>', async () => {
    expect(await trySubscribe(clientB, `espace:${espaceA}`)).toBe('DENIED')
  }, 20000)
  it('Carol (scopée gestionnaire) NE PEUT PAS s\'abonner à espace:<espaceA>', async () => {
    expect(await trySubscribe(clientC, `espace:${espaceA}`)).toBe('DENIED')
  }, 20000)
  it('Bob PEUT s\'abonner au canal de SON espace propre (non-régression)', async () => {
    expect(await trySubscribe(clientB, `espace:${espaceB}`)).toBe('SUBSCRIBED')
  }, 15000)
})

// ── 4) MEMBRES : un scopé ne lit que SA ligne (migration 0050) ───────────────────────────────────────
describe('espace_members — liste des membres (migration 0050)', () => {
  it('Bob (scopé) ne voit QUE sa propre ligne, jamais l\'email de Carol', async () => {
    const { data, error } = await clientB.from('espace_members').select('user_id, invite_email').eq('espace_id', espaceA)
    expect(error).toBeNull()
    expect(data.map(r => r.user_id)).toEqual([bobId])
    expect(data.some(r => r.invite_email === C.email)).toBe(false)
  })
  it('Carol (scopée) ne voit QUE sa propre ligne', async () => {
    const { data } = await clientC.from('espace_members').select('user_id').eq('espace_id', espaceA)
    expect(data.map(r => r.user_id)).toEqual([carolId])
  })
  it('Alice (owner plein) voit les 3 membres (non-régression écran Partage & accès)', async () => {
    const { data } = await clientA.from('espace_members').select('user_id').eq('espace_id', espaceA)
    expect(data.map(r => r.user_id).sort()).toEqual([bobId, carolId, (await clientA.auth.getUser()).data.user.id].sort())
  })
  it('Bob retrouve ses espaces au boot (resolveEspaces = ses propres lignes) : espace propre + espace partagé', async () => {
    const { data } = await clientB.from('espace_members').select('espace_id, full_espace').eq('user_id', bobId).eq('invite_status', 'active')
    expect(data.map(r => r.espace_id).sort()).toEqual([espaceA, espaceB].sort())
  })
})
