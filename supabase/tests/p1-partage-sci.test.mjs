import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, adminClient, deleteUserByEmail } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

// ════════════════════════════════════════════════════════════════════════════
// P1 — Partage par SCI (scope intra-espace). Preuve d'étanchéité :
//   • Alice = owner PLEIN de l'espace → voit/écrit TOUT (SCI-A ET SCI-B).
//   • Bob   = membre SCOPÉ (full_espace=false) avec un octroi entite_membre sur SCI-A SEULEMENT.
//             → voit/écrit SCI-A ; ne voit/écrit RIEN de SCI-B (SELECT vide + write refusé).
//   • Carol = membre SCOPÉ gestionnaire de SCI-A → peut écrire SCI-A, pas SCI-B.
// On sème DEUX SCIs complètes (chaque table métier remplie sur chacune) pour couvrir toutes
// les voies de résolution d'entité (directe / via logement / via immeuble / via bail / document
// polymorphe). Démontage via purge_espace.
// ════════════════════════════════════════════════════════════════════════════

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p1sci-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }  // owner plein
const B = { email: `p1sci-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }  // scopé lecture SCI-A
const C = { email: `p1sci-carol-${RUN}@example.test`, pass: 'Test-Passw0rd!C' }  // scopé gestionnaire SCI-A

let clientA, clientB, clientC
let espaceA
let bobId, carolId
let A1, A2  // ids de la chaîne SCI-A et SCI-B (semées chez Alice)

// Sème une chaîne métier complète rattachée à UNE entité (SCI) donnée. Renvoie tous les ids.
async function seedSci(client, espaceId, sciNom) {
  const tag = `${sciNom}-${RUN}`.slice(0, 20)
  const ids = {}
  const ins = async (table, row) => {
    const { data, error } = await client.from(table)
      .insert({ espace_id: espaceId, ...row }).select('id').single()
    if (error) throw new Error(`seed ${table} (${sciNom}): ${error.message}`)
    return data.id
  }
  ids.entite   = await ins('entites',   { nom: sciNom })
  ids.immeuble = await ins('immeubles', { entite_id: ids.entite, nom: `Imm ${tag}` })
  ids.logement = await ins('logements', {
    entite_id: ids.entite, immeuble_id: ids.immeuble, ref: `F-${tag}`,
    type: 'appartement', surface: 42, loyer_hc_ref: 700, charges_ref: 100,
  })
  // document rattaché au logement (voie polymorphe parent_type='logement')
  ids.docLog = await ins('documents', {
    name: 'dpe.pdf', mime: 'application/pdf', size: 999,
    parent_type: 'logement', parent_id: ids.logement,
  })
  // document rattaché à l'entité (voie polymorphe parent_type='entite')
  ids.docEnt = await ins('documents', {
    name: 'kbis.pdf', mime: 'application/pdf', size: 111,
    parent_type: 'entite', parent_id: ids.entite,
  })
  // mouvement « qui = logement » → résolution via logement_id (entite_id reste NULL, CHECK oblige)
  ids.mvtLog = await ins('mouvements', {
    date_mouvement: '2026-01-15', libelle: 'Loyer', logement_id: ids.logement,
    categorie: 'loyer', credit: 800,
  })
  // mouvement « qui = SCI » → entite_id direct
  ids.mvtSci = await ins('mouvements', {
    date_mouvement: '2026-01-20', libelle: 'Compta SCI', entite_id: ids.entite,
    categorie: 'frais', debit: 50,
  })
  // mouvement « sur immeuble » → immeuble_id SEUL (entite_id + logement_id NULL) : résolution via
  // immeuble (correctif #3 — sinon fail-closed, invisible du scopé)
  ids.mvtImm = await ins('mouvements', {
    date_mouvement: '2026-01-25', libelle: 'Travaux immeuble', immeuble_id: ids.immeuble,
    categorie: 'travaux', debit: 200,
  })
  // document rattaché au mouvement-logement (voie polymorphe parent_type='mouvement' → logement)
  ids.docMvt = await ins('documents', {
    name: 'facture.pdf', mime: 'application/pdf', size: 222,
    parent_type: 'mouvement', parent_id: ids.mvtLog,
  })
  ids.quittance = await ins('quittances', {
    logement_id: ids.logement, mois: '2026-01', hc: 700, ch: 100, date_paiement: '2026-01-05',
  })
  ids.bail = await ins('baux', {
    logement_id: ids.logement, type_bail: 'nu', hc: 700, ch: 100, dg: 700,
    jour_paiement: 1, date_debut: '2026-01-01', locataires: [{ nom: 'Dupont' }],
  })
  ids.bailEvt = await ins('baux_evenements', {
    bail_id: ids.bail, type_evenement: 'revision_loyer', date_evenement: '2026-02-01',
  })
  ids.bailHist = await ins('baux_historique', {
    logement_id: ids.logement, entite_id: ids.entite, archived_auto: true,
    bail_snapshot: { ref: `F-${tag}`, hc: 650 },
  })
  ids.edl = await ins('edl', {
    type_edl: 'Entrée', date_edl: '2026-01-01', logement_id: ids.logement,
    pieces: [{ nom: 'Séjour', elements: [] }],
  })
  ids.assurance = await ins('assurances', {
    logement_id: ids.logement, compagnie: 'AXA', num_contrat: `C-${tag}`, prime: 120,
  })
  // agenda rattaché au logement (voie via logement_id)
  ids.agendaLog = await ins('agenda', {
    logement_id: ids.logement, titre: 'Visite', date_evt: '2026-03-01',
  })
  // agenda rattaché à l'immeuble (voie via immeuble_id)
  ids.agendaImm = await ins('agenda', {
    immeuble_id: ids.immeuble, titre: 'AG copro', date_evt: '2026-04-01',
  })
  // candidat « via logement » (logement_id) + candidat « via SCI » (entite_id direct) — 2 voies de scope
  ids.candLog = await ins('candidats', { logement_id: ids.logement, legacy_raw: { nom: 'CandLog', logRef: `F-${tag}` } })
  ids.candSci = await ins('candidats', { entite_id: ids.entite, legacy_raw: { nom: 'CandSci', entity: sciNom } })
  ids.ref = `F-${tag}`   // ref du logement (clé des blobs config per-SCI : irlHistorique/assurances/compteursReleves)
  return ids
}

beforeAll(async () => {
  await createUser(A.email, A.pass)
  const bob = await createUser(B.email, B.pass)
  const carol = await createUser(C.email, C.pass)
  bobId = bob.id; carolId = carol.id
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  clientC = await userClient(C.email, C.pass)

  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P1-SCI' })
  if (e1) throw e1; espaceA = ea.id

  A1 = await seedSci(clientA, espaceA, `SCI-A-${RUN}`)
  A2 = await seedSci(clientA, espaceA, `SCI-B-${RUN}`)

  // Bob = membre SCOPÉ (full_espace=false), octroi LECTURE sur SCI-A uniquement.
  const { error: e2 } = await clientA.from('espace_members')
    .insert({ espace_id: espaceA, user_id: bobId, role: 'lecture_seule', invite_status: 'active', full_espace: false })
  if (e2) throw e2
  const { error: e3 } = await clientA.from('entite_membre')
    .insert({ espace_id: espaceA, entite_id: A1.entite, user_id: bobId, role: 'lecture_seule' })
  if (e3) throw e3

  // Carol = membre SCOPÉ (full_espace=false), octroi GESTIONNAIRE sur SCI-A uniquement.
  const { error: e4 } = await clientA.from('espace_members')
    .insert({ espace_id: espaceA, user_id: carolId, role: 'lecture_seule', invite_status: 'active', full_espace: false })
  if (e4) throw e4
  const { error: e5 } = await clientA.from('entite_membre')
    .insert({ espace_id: espaceA, entite_id: A1.entite, user_id: carolId, role: 'gestionnaire' })
  if (e5) throw e5

  // D2 — blob espace_config PARTAGÉ (RLS is_member à l'origine → fuite vers le scopé). On y sème les 3
  // clés per-SCI (irlHistorique array {ref}, assurances bailleur array {logement}, compteursReleves objet
  // {ref:[]}) pour SCI-A ET SCI-B, plus une clé d'APP non per-SCI (categories). Un scopé SCI-A ne doit
  // recevoir QUE le sous-ensemble SCI-A + les clés d'app. Semé en service-role (bypass RLS).
  const _admin = adminClient()
  const { error: ecfg } = await _admin.from('espace_config').upsert({
    espace_id: espaceA,
    data: {
      categories: ['loyer', 'charges'],                        // clé d'APP (non per-SCI) → conservée pour tous
      irlHistorique: [
        { ref: A1.ref, date: '2026-01-01', nouveauHC: 700 },   // SCI-A
        { ref: A2.ref, date: '2026-01-01', nouveauHC: 800 },   // SCI-B
      ],
      assurances: [
        { id: 1, logement: A1.ref, compagnie: 'AXA-A' },       // SCI-A
        { id: 2, logement: A2.ref, compagnie: 'AXA-B' },       // SCI-B
      ],
      compteursReleves: {
        [A1.ref]: [{ id: 1, value: 111 }],                     // SCI-A
        [A2.ref]: [{ id: 2, value: 222 }],                     // SCI-B
      },
    },
  }, { onConflict: 'espace_id' })
  if (ecfg) throw ecfg
})

afterAll(async () => {
  // purge_espace supprime l'espace + membres + entite_membre (cascade) + données métier.
  await teardownOwner(A.email, [espaceA])
  await deleteUserByEmail(B.email)
  await deleteUserByEmail(C.email)
})

// Tables + l'id « SCI-A » et l'id « SCI-B » correspondant, pour itérer les assertions.
// Pour chaque table on prend une ligne représentative semée dans chaque SCI.
const TABLE_ROWS = [
  ['entites',          'entite'],
  ['immeubles',        'immeuble'],
  ['logements',        'logement'],
  ['baux',             'bail'],
  ['baux_evenements',  'bailEvt'],
  ['baux_historique',  'bailHist'],
  ['quittances',       'quittance'],
  ['edl',              'edl'],
  ['assurances',       'assurance'],
]

describe('P1 — Alice (owner PLEIN) voit TOUT (non-régression P0)', () => {
  for (const [table, key] of TABLE_ROWS) {
    it(`Alice voit la ligne SCI-A ET SCI-B de ${table}`, async () => {
      const ids = [A1[key], A2[key]]
      const { data, error } = await clientA.from(table).select('id').in('id', ids)
      expect(error).toBeNull()
      expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
    })
  }
  it('Alice voit les mouvements (logement + SCI + immeuble) de chaque SCI', async () => {
    const ids = [A1.mvtLog, A1.mvtSci, A1.mvtImm, A2.mvtLog, A2.mvtSci, A2.mvtImm]
    const { data } = await clientA.from('mouvements').select('id').in('id', ids)
    expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
  })
  it('Alice voit les documents (logement/entité/mouvement) des 2 SCIs', async () => {
    const ids = [A1.docLog, A1.docEnt, A1.docMvt, A2.docLog, A2.docEnt, A2.docMvt]
    const { data } = await clientA.from('documents').select('id').in('id', ids)
    expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
  })
  it('Alice voit les événements agenda (logement/immeuble) des 2 SCIs', async () => {
    const ids = [A1.agendaLog, A1.agendaImm, A2.agendaLog, A2.agendaImm]
    const { data } = await clientA.from('agenda').select('id').in('id', ids)
    expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
  })
  it('Alice voit les candidats (via logement + via SCI) des 2 SCIs', async () => {
    const ids = [A1.candLog, A1.candSci, A2.candLog, A2.candSci]
    const { data } = await clientA.from('candidats').select('id').in('id', ids)
    expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
  })
})

describe('P1 — Bob (SCOPÉ lecture SCI-A) VOIT SCI-A', () => {
  for (const [table, key] of TABLE_ROWS) {
    it(`Bob voit la ligne SCI-A de ${table}`, async () => {
      const { data, error } = await clientB.from(table).select('id').eq('id', A1[key])
      expect(error).toBeNull()
      expect(data.map(r => r.id)).toEqual([A1[key]])
    })
  }
  it('Bob voit les mouvements de SCI-A (via logement_id, entite_id ET immeuble_id — correctif #3)', async () => {
    const ids = [A1.mvtLog, A1.mvtSci, A1.mvtImm]
    const { data } = await clientB.from('mouvements').select('id').in('id', ids)
    expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
  })
  it('Bob voit les documents de SCI-A (parent logement/entité/mouvement)', async () => {
    const ids = [A1.docLog, A1.docEnt, A1.docMvt]
    const { data } = await clientB.from('documents').select('id').in('id', ids)
    expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
  })
  it('Bob voit l\'agenda de SCI-A (via logement ET via immeuble)', async () => {
    const ids = [A1.agendaLog, A1.agendaImm]
    const { data } = await clientB.from('agenda').select('id').in('id', ids)
    expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
  })
  it('Bob voit les candidats de SCI-A (via logement ET via entite_id)', async () => {
    const ids = [A1.candLog, A1.candSci]
    const { data } = await clientB.from('candidats').select('id').in('id', ids)
    expect(new Set(data.map(r => r.id))).toEqual(new Set(ids))
  })
})

describe('P1 — Bob (SCOPÉ SCI-A) ne voit RIEN de SCI-B (étanchéité SELECT)', () => {
  for (const [table, key] of TABLE_ROWS) {
    it(`Bob ne voit PAS la ligne SCI-B de ${table}`, async () => {
      const { data, error } = await clientB.from(table).select('id').eq('id', A2[key])
      expect(error).toBeNull()
      expect(data).toEqual([])
    })
  }
  it('Bob ne voit AUCUN mouvement de SCI-B (y compris immeuble-seul)', async () => {
    const ids = [A2.mvtLog, A2.mvtSci, A2.mvtImm]
    const { data } = await clientB.from('mouvements').select('id').in('id', ids)
    expect(data).toEqual([])
  })
  it('Bob ne voit AUCUN document de SCI-B (logement/entité/mouvement)', async () => {
    const ids = [A2.docLog, A2.docEnt, A2.docMvt]
    const { data } = await clientB.from('documents').select('id').in('id', ids)
    expect(data).toEqual([])
  })
  it('Bob ne voit AUCUN agenda de SCI-B', async () => {
    const ids = [A2.agendaLog, A2.agendaImm]
    const { data } = await clientB.from('agenda').select('id').in('id', ids)
    expect(data).toEqual([])
  })
  it('Bob ne voit AUCUN candidat de SCI-B (fuite #4 fermée)', async () => {
    const ids = [A2.candLog, A2.candSci]
    const { data } = await clientB.from('candidats').select('id').in('id', ids)
    expect(data).toEqual([])
  })
  it('un SELECT global table (sans filtre id) ne ramène AUCUNE ligne SCI-B pour Bob', async () => {
    // Filet : preuve qu'aucune ligne SCI-B ne fuit même sans cibler un id précis.
    for (const [table] of TABLE_ROWS) {
      const { data } = await clientB.from(table).select('id, espace_id').eq('espace_id', espaceA)
      const leaked = (data || []).map(r => r.id).filter(id => Object.values(A2).includes(id))
      expect(leaked, `${table} ne doit ramener aucune ligne SCI-B`).toEqual([])
    }
  })
})

describe('P1 — Bob (SCOPÉ LECTURE SCI-A) ne peut PAS écrire, même sur SCI-A', () => {
  it('Bob (lecture_seule sur SCI-A) ne peut PAS UPDATE un logement SCI-A (0 ligne touchée)', async () => {
    const { data, error } = await clientB.from('logements')
      .update({ surface: 99 }).eq('id', A1.logement).select()
    expect(error).toBeNull()
    expect(data).toEqual([])              // has_entite_write faux (rôle lecture_seule) → 0 ligne
  })
  it('Bob ne peut PAS INSERT un immeuble dans SCI-A', async () => {
    const { error } = await clientB.from('immeubles')
      .insert({ espace_id: espaceA, entite_id: A1.entite, nom: 'Interdit' })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })
})

describe('P1 — étanchéité ÉCRITURE cross-SCI (Carol gestionnaire SCI-A, jamais SCI-B)', () => {
  it('Carol peut UPDATE un logement de SCI-A (octroi gestionnaire)', async () => {
    const { data, error } = await clientC.from('logements')
      .update({ surface: 43 }).eq('id', A1.logement).select('id')
    expect(error).toBeNull()
    expect(data.map(r => r.id)).toEqual([A1.logement])
  })
  it('Carol peut INSERT un immeuble dans SCI-A', async () => {
    const { data, error } = await clientC.from('immeubles')
      .insert({ espace_id: espaceA, entite_id: A1.entite, nom: `Imm Carol ${RUN}` }).select('id')
    expect(error).toBeNull()
    expect(data.length).toBe(1)
  })
  it('Carol ne peut PAS UPDATE un logement de SCI-B (0 ligne touchée)', async () => {
    const { data, error } = await clientC.from('logements')
      .update({ surface: 1 }).eq('id', A2.logement).select()
    expect(error).toBeNull()
    expect(data).toEqual([])              // pas visible + has_entite_write faux pour SCI-B
  })
  it('Carol ne peut PAS INSERT un immeuble dans SCI-B (with check has_entite_write faux)', async () => {
    const { error } = await clientC.from('immeubles')
      .insert({ espace_id: espaceA, entite_id: A2.entite, nom: 'Injection SCI-B' })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })
  it('Carol ne peut PAS INSERT un mouvement rattaché à un logement de SCI-B', async () => {
    const { error } = await clientC.from('mouvements').insert({
      espace_id: espaceA, date_mouvement: '2026-05-01', libelle: 'Fuite',
      logement_id: A2.logement, debit: 1,
    })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })
  it('Carol ne peut PAS INSERT un candidat rattaché à un logement de SCI-B', async () => {
    const { error } = await clientC.from('candidats')
      .insert({ espace_id: espaceA, logement_id: A2.logement, legacy_raw: { nom: 'FuiteCand' } })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })
  it('Carol PEUT INSERT un candidat rattaché à un logement de SCI-A (gestionnaire)', async () => {
    const { data, error } = await clientC.from('candidats')
      .insert({ espace_id: espaceA, logement_id: A1.logement, legacy_raw: { nom: 'CandCarolA' } }).select('id')
    expect(error).toBeNull()
    expect(data.length).toBe(1)
  })
  it('Carol ne peut PAS DELETE le bail de SCI-B', async () => {
    const { data, error } = await clientC.from('baux').delete().eq('id', A2.bail).select()
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('P1 — Bob ne peut PAS s\'auto-octroyer SCI-B (anti-escalade)', () => {
  it('Bob (scopé) ne peut PAS INSERT dans entite_membre (is_full_manager faux)', async () => {
    const { error } = await clientB.from('entite_membre')
      .insert({ espace_id: espaceA, entite_id: A2.entite, user_id: bobId, role: 'gestionnaire' })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })
  it('Bob ne voit QUE son propre octroi (pas ceux de Carol)', async () => {
    const { data } = await clientB.from('entite_membre').select('id, user_id, entite_id')
    expect(data.every(r => r.user_id === bobId)).toBe(true)
    expect(data.map(r => r.entite_id)).toEqual([A1.entite])
  })
})

describe('P1 — immutabilité de l\'octroi (anti-redirection silencieuse)', () => {
  it('réaffecter entite_id d\'un octroi est REFUSÉ même en service-role (ENTITE_ID_IMMUTABLE)', async () => {
    const admin = adminClient()
    const { data: rows } = await admin.from('entite_membre')
      .select('id').eq('espace_id', espaceA).eq('user_id', bobId).limit(1)
    const { error } = await admin.from('entite_membre')
      .update({ entite_id: A2.entite }).eq('id', rows[0].id)
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/ENTITE_ID_IMMUTABLE/)
  })
  it('le rôle d\'un octroi reste modifiable (non-régression : seul le rôle change)', async () => {
    const admin = adminClient()
    const { data: rows } = await admin.from('entite_membre')
      .select('id, role').eq('espace_id', espaceA).eq('user_id', bobId).limit(1)
    const { error } = await admin.from('entite_membre')
      .update({ role: 'gestionnaire' }).eq('id', rows[0].id)
    expect(error).toBeNull()
    // remettre l'état initial pour ne pas perturber d'autres assertions éventuelles
    await admin.from('entite_membre').update({ role: rows[0].role }).eq('id', rows[0].id)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// P1 — STORAGE par-SCI (migration 0031). Preuve runtime que les FICHIERS sont cloisonnés :
//   chemin <espace>/<entite_id>/files/<clé>. Un scopé SCI-A lit/écrit SCI-A, jamais SCI-B ni legacy.
//   L'owner PLEIN lit tout (par-SCI + legacy). Seed via service-role (bypass RLS), lecture via clients RLS.
// ════════════════════════════════════════════════════════════════════════════
describe('P1 — étanchéité STORAGE cross-SCI (fichiers par-SCI, migration 0031)', () => {
  const BUCKET = 'espace-files'
  const body = Buffer.from(`pdf-${RUN}`)
  let pathA, pathB, pathLegacy
  beforeAll(async () => {
    const admin = adminClient()
    pathA      = `${espaceA}/${A1.entite}/files/p1a_${RUN}.pdf`   // SCI-A
    pathB      = `${espaceA}/${A2.entite}/files/p1b_${RUN}.pdf`   // SCI-B
    pathLegacy = `${espaceA}/files/p1leg_${RUN}.pdf`              // LEGACY (seg2='files' → safe_uuid NULL)
    for (const p of [pathA, pathB, pathLegacy]) {
      const { error } = await admin.storage.from(BUCKET).upload(p, body, { contentType: 'application/pdf', upsert: true })
      if (error) throw new Error(`seed storage ${p}: ${error.message}`)
    }
  })
  afterAll(async () => {
    await adminClient().storage.from(BUCKET).remove([pathA, pathB, pathLegacy])
  })

  it('Bob (scopé SCI-A) PEUT télécharger le fichier de SCI-A', async () => {
    const { data, error } = await clientB.storage.from(BUCKET).download(pathA)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })
  it('Bob NE PEUT PAS télécharger le fichier de SCI-B (fuite cross-SCI bloquée)', async () => {
    const { data } = await clientB.storage.from(BUCKET).download(pathB)
    expect(data).toBeNull()
  })
  it('Bob NE PEUT PAS télécharger un fichier LEGACY <espace>/files/ (seg2 non-uuid → membre plein only)', async () => {
    const { data } = await clientB.storage.from(BUCKET).download(pathLegacy)
    expect(data).toBeNull()
  })
  it('Alice (owner PLEIN) PEUT télécharger SCI-A, SCI-B ET legacy', async () => {
    for (const p of [pathA, pathB, pathLegacy]) {
      const { data, error } = await clientA.storage.from(BUCKET).download(p)
      expect(error, `Alice download ${p}`).toBeNull()
      expect(data, `Alice download ${p}`).not.toBeNull()
    }
  })
  it('Bob (lecture seule SCI-A) NE PEUT PAS uploader dans SCI-A', async () => {
    const { error } = await clientB.storage.from(BUCKET)
      .upload(`${espaceA}/${A1.entite}/files/hackB_${RUN}.pdf`, body, { contentType: 'application/pdf' })
    expect(error).not.toBeNull()
  })
  it('Carol (gestionnaire SCI-A) PEUT uploader dans SCI-A', async () => {
    const p = `${espaceA}/${A1.entite}/files/carol_${RUN}.pdf`
    const { error } = await clientC.storage.from(BUCKET).upload(p, body, { contentType: 'application/pdf' })
    expect(error).toBeNull()
    await adminClient().storage.from(BUCKET).remove([p])
  })
  it('Carol (gestionnaire SCI-A) NE PEUT PAS uploader dans SCI-B', async () => {
    const { error } = await clientC.storage.from(BUCKET)
      .upload(`${espaceA}/${A2.entite}/files/carolHack_${RUN}.pdf`, body, { contentType: 'application/pdf' })
    expect(error).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// P1 — VOLET 3 : config PROPRIÉTAIRE-PRIVÉ (espace_config_private, RLS is_full_member).
// auditTrail / candidatLinks / params.bankAccounts / params.userProfile sortis du blob partagé
// (is_member) → un membre SCOPÉ ne les lit NI ne les écrit. Un membre PLEIN (Alice owner) oui.
// ════════════════════════════════════════════════════════════════════════════
describe('P1 — espace_config_private : propriétaire-privé (membres pleins seulement)', () => {
  beforeAll(async () => {
    const { error } = await clientA.from('espace_config_private')
      .upsert({ espace_id: espaceA, data: { bankAccounts: [{ iban: `FR-${RUN}` }], auditTrail: [1, 2, 3] } }, { onConflict: 'espace_id' })
    if (error) throw new Error('seed espace_config_private: ' + error.message)
  })
  it('Alice (owner PLEIN) lit le blob privé', async () => {
    const { data, error } = await clientA.from('espace_config_private').select('data').eq('espace_id', espaceA).maybeSingle()
    expect(error).toBeNull()
    expect(data?.data?.bankAccounts?.length).toBe(1)
  })
  it('Bob (SCOPÉ) ne lit RIEN du blob privé (fuite bankAccounts/auditTrail fermée)', async () => {
    const { data, error } = await clientB.from('espace_config_private').select('data').eq('espace_id', espaceA)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
  it('Carol (SCOPÉ gestionnaire) ne lit RIEN non plus du blob privé', async () => {
    const { data } = await clientC.from('espace_config_private').select('data').eq('espace_id', espaceA)
    expect(data).toEqual([])
  })
  it('Bob (SCOPÉ) ne peut PAS écrire le blob privé (is_full_manager faux)', async () => {
    const { error } = await clientB.from('espace_config_private')
      .upsert({ espace_id: espaceA, data: { x: 1 } }, { onConflict: 'espace_id' })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// D3 — ÉCRITURE MEMBRE SCOPÉ : documents des parent_types 0040 (assurance/mrh/equipement/
//   quittance/candidat) résolus VIA LE LOGEMENT (migration 0042). Le mapper pose parent_id =
//   uuid du LOGEMENT concerné → entite_of_document(parent_type, parent_id) = entite_of_logement(logement).
//   AVANT 0042 : ces types donnaient entité NULL → has_entite_write faux → 42501 pour un scopé
//   (sync empoisonnée). Carol (gestionnaire SCI-A) doit pouvoir attacher sur un logement SCI-A,
//   JAMAIS sur SCI-B ; Bob (lecture SCI-A) ne peut pas écrire du tout. 'bail' (parent_id = uuid bail)
//   reste résolu par entite_of_bail — vérifié aussi.
// ════════════════════════════════════════════════════════════════════════════
describe('D3 — écriture membre scopé : documents types 0040 résolus via logement (migration 0042)', () => {
  const NEW_TYPES = ['assurance', 'mrh', 'equipement', 'quittance', 'candidat']
  const mkDoc = (parentType, parentId) => ({
    espace_id: espaceA, name: `${parentType}.pdf`, mime: 'application/pdf', size: 10,
    parent_type: parentType, parent_id: parentId,
  })

  for (const t of NEW_TYPES) {
    it(`Carol (gestionnaire SCI-A) PEUT INSERT un document parent_type='${t}' sur un logement de SCI-A`, async () => {
      const { data, error } = await clientC.from('documents').insert(mkDoc(t, A1.logement)).select('id')
      expect(error).toBeNull()
      expect(data.length).toBe(1)
    })
    it(`Carol ne peut PAS INSERT un document parent_type='${t}' sur un logement de SCI-B (with check faux)`, async () => {
      const { error } = await clientC.from('documents').insert(mkDoc(t, A2.logement))
      expect(error).not.toBeNull()
      expect(error.message).toMatch(/row-level security|violates/i)
    })
  }

  it("Carol PEUT INSERT un document parent_type='bail' sur un bail de SCI-A (résolveur entite_of_bail)", async () => {
    const { data, error } = await clientC.from('documents').insert(mkDoc('bail', A1.bail)).select('id')
    expect(error).toBeNull()
    expect(data.length).toBe(1)
  })
  it("Carol ne peut PAS INSERT un document parent_type='bail' sur un bail de SCI-B", async () => {
    const { error } = await clientC.from('documents').insert(mkDoc('bail', A2.bail))
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })

  it('Bob (lecture_seule SCI-A) ne peut PAS INSERT un document assurance, même sur SCI-A (write faux)', async () => {
    const { error } = await clientB.from('documents').insert(mkDoc('assurance', A1.logement))
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })

  it('parent_id NULL (candidat SCI-level sans logement) → entité NULL → INSERT refusé pour un scopé (fail-closed)', async () => {
    const { error } = await clientC.from('documents')
      .insert({ espace_id: espaceA, name: 'candSci.pdf', mime: 'application/pdf', size: 10, parent_type: 'candidat', parent_id: null })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })

  it('Bob (SCOPÉ SCI-A) VOIT un document assurance de SCI-A mais PAS de SCI-B (étanchéité SELECT via logement)', async () => {
    const admin = adminClient()
    const { data: dA, error: eA } = await admin.from('documents')
      .insert({ espace_id: espaceA, name: 'segA.pdf', parent_type: 'assurance', parent_id: A1.logement }).select('id').single()
    if (eA) throw new Error('seed docA: ' + eA.message)
    const { data: dB, error: eB } = await admin.from('documents')
      .insert({ espace_id: espaceA, name: 'segB.pdf', parent_type: 'assurance', parent_id: A2.logement }).select('id').single()
    if (eB) throw new Error('seed docB: ' + eB.message)
    const { data } = await clientB.from('documents').select('id').in('id', [dA.id, dB.id])
    expect(data.map(r => r.id)).toEqual([dA.id])   // SCI-A visible, SCI-B invisible
  })
})

// ════════════════════════════════════════════════════════════════════════════
// D2 — CONFIG SCOPÉE : le blob espace_config (RLS is_member) fuitait ENTIER au membre scopé
//   (irlHistorique/assurances bailleur/compteursReleves de TOUTES les SCIs — gap AUDIT §4).
//   Correctif SERVEUR (migration 0043) : (1) la SELECT brute passe à is_full_member → un scopé ne lit
//   PLUS le blob ; (2) l'RPC SECURITY DEFINER espace_config_scoped() renvoie le blob INTÉGRAL au membre
//   plein, et FILTRÉ (3 clés per-SCI réduites aux refs de logement accessibles) au membre scopé — les
//   clés d'app (categories…) restent servies. Filtrage CÔTÉ SERVEUR, jamais client.
// ════════════════════════════════════════════════════════════════════════════
describe('D2 — config scopée : espace_config filtré par SCI côté serveur (migration 0043)', () => {
  it('FUITE FERMÉE : Bob (scopé) ne peut PLUS lire le blob espace_config brut (SELECT is_full_member)', async () => {
    const { data, error } = await clientB.from('espace_config').select('data').eq('espace_id', espaceA)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
  it('Carol (scopé gestionnaire) ne peut PLUS lire le blob brut non plus', async () => {
    const { data } = await clientC.from('espace_config').select('data').eq('espace_id', espaceA)
    expect(data).toEqual([])
  })
  it('Alice (membre PLEIN) lit toujours le blob brut (non-régression)', async () => {
    const { data, error } = await clientA.from('espace_config').select('data').eq('espace_id', espaceA).maybeSingle()
    expect(error).toBeNull()
    expect(data?.data?.irlHistorique?.length).toBe(2)
  })

  it('RPC espace_config_scoped : Alice (PLEIN) reçoit le blob INTÉGRAL (SCI-A + SCI-B)', async () => {
    const { data, error } = await clientA.rpc('espace_config_scoped', { p_espace_id: espaceA })
    expect(error).toBeNull()
    expect(data.categories).toEqual(['loyer', 'charges'])
    expect(data.irlHistorique.map(e => e.ref).sort()).toEqual([A1.ref, A2.ref].sort())
    expect(data.assurances.map(e => e.logement).sort()).toEqual([A1.ref, A2.ref].sort())
    expect(Object.keys(data.compteursReleves).sort()).toEqual([A1.ref, A2.ref].sort())
  })

  for (const [who, getClient] of [['Bob (lecture)', () => clientB], ['Carol (gestionnaire)', () => clientC]]) {
    it(`RPC espace_config_scoped : ${who} (scopé SCI-A) reçoit UNIQUEMENT le sous-ensemble SCI-A + les clés d'app`, async () => {
      const { data, error } = await getClient().rpc('espace_config_scoped', { p_espace_id: espaceA })
      expect(error).toBeNull()
      // clés d'app (non per-SCI) conservées
      expect(data.categories).toEqual(['loyer', 'charges'])
      // irlHistorique : SCI-A seulement, SCI-B absent
      expect(data.irlHistorique.map(e => e.ref)).toEqual([A1.ref])
      // assurances bailleur : SCI-A seulement
      expect(data.assurances.map(e => e.logement)).toEqual([A1.ref])
      // compteursReleves : clé SCI-A seulement
      expect(Object.keys(data.compteursReleves)).toEqual([A1.ref])
      // étanchéité : la ref SCI-B n'apparaît NULLE PART dans le blob rendu
      expect(JSON.stringify(data)).not.toContain(A2.ref)
    })
  }
})
