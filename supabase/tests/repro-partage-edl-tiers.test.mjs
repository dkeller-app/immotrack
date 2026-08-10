// REPRO BUG-PARTAGE-EDL-ESPACE-TIERS (2026-08-08) — un membre invité SCOPÉ d'un espace partagé
// ne voit pas les EDL de cet espace dans l'app, alors que la base + RLS sont corrects.
//
// Ce test rejoue le VRAI chemin de boot de l'app (createBoot → resolveEspaces → wireStores →
// hydrate) contre le vrai Postgres, dans la configuration EXACTE de prod :
//   • M (≈ Marion)  = owner PLEIN de l'espace M, qui contient la SCI « SMART » (entité + immeuble +
//     logement FERRETTE-001 + bail + EDL Entrée du 15/07) ET une 2e SCI « PRIVEE » (avec son
//     logement + EDL) sur laquelle D n'a AUCUN octroi (contrôle anti-fuite).
//   • D (≈ Didier)  = owner de SON espace D qui contient une ARCHIVE HOMONYME (même nom de SCI,
//     même ref de logement — architecture inversée du 14/07) + membre SCOPÉ de l'espace M
//     (espace_members lecture_seule, full_espace=false) + octroi entite_membre GESTIONNAIRE sur
//     la SCI SMART de M (= la config prod vérifiée en base le 08/08).
//
// Attendu (DoD chantier) : au boot, D voit l'EDL de l'espace M (et les collections sœurs), dans
// la limite de ses octrois — et RIEN de la SCI non octroyée. Un échec ici = bug couche store.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createUser, userClient, adminClient, deleteUserByEmail } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'
import { createBoot } from '../../js/app/supabase-boot.js'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const M = { email: `edltiers-owner-${RUN}@example.test`,  pass: 'Test-Passw0rd!M' }   // owner espace partagé
const D = { email: `edltiers-membre-${RUN}@example.test`, pass: 'Test-Passw0rd!D' }   // membre scopé + archive homonyme

// Refs VOLONTAIREMENT identiques dans les 2 espaces (homonymie prod FERRETTE 001 / SMARTOSAURUS).
const SCI = `SMART-${RUN}`
const REF = `FERRETTE-001-${RUN}`
const SCI_PRIVEE = `PRIVEE-${RUN}`
const REF_PRIVEE = `PRIV-001-${RUN}`
const EDL_ID_TIERS = 1784120562200   // legacy id de l'EDL prod (Entrée 15/07)
const EDL_ID_ARCHIVE = 1700000000001 // EDL ancien dans l'archive de D (antérieur à l'inversion)
const EDL_ID_PRIVE = 1700000000002   // EDL de la SCI non octroyée (ne doit JAMAIS fuiter)

const noSchedule = () => {}          // les tests flush explicitement (pas de debounce)

function freshClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

// Boot app-fidèle d'un user : login → resolveEspaces → wireStores → hydrate. Renvoie {api, db, espaces}.
async function bootAs(creds) {
  const api = createBoot(freshClient())
  const r = await api.loginEmail(creds.email, creds.pass)
  if (!r.ok) throw new Error('login ' + creds.email + ': ' + r.error)
  const espaces = await api.resolveEspaces()
  let live = null
  api.wireStores({ espaces, getDB: () => live, schedule: noSchedule })
  const db = await api.hydrate()
  live = db
  api.seed(db)
  return { api, db, espaces, getLive: () => live }
}

// Sème une chaîne SCI complète dans le DB legacy vivant (mutation en place, comme l'app), puis flush.
function pushSci(db, { sci, ref, edlId, edlDate }) {
  db.entites.push({ nom: sci, type: 'SCI', immeubles: [{ nom: `Imm ${sci}`, __entiteNom: sci }] })
  db.logements.push({ ref, entity: sci, type: 'T2', surf: 42, locataire: 'Baysang' })
  db.baux[ref] = { entity: sci, hc: 500, ch: 50, dg: 500, jpay: 5, debut: '2026-07-18', locataires: [{ nom: 'Baysang' }] }
  db.edl.push({
    id: edlId, logement: ref, type: 'Entrée', date: edlDate, locataire: 'Baysang',
    pieces: [{ nom: 'Séjour', elements: [{ nom: 'Sol', etatE: 'Bon', obsE: '', photosE: [] }] }],
  })
}

let espaceM, espaceD, entiteSmartM

beforeAll(async () => {
  await createUser(M.email, M.pass)
  const dUser = await createUser(D.email, D.pass)

  // 1) Espace M (owner plein) : SCI SMART (partagée) + SCI PRIVEE (non octroyée), via le chemin app.
  const bootM = await bootAs(M)
  espaceM = bootM.espaces[0].espaceId
  pushSci(bootM.db, { sci: SCI, ref: REF, edlId: EDL_ID_TIERS, edlDate: '2026-07-15' })
  pushSci(bootM.db, { sci: SCI_PRIVEE, ref: REF_PRIVEE, edlId: EDL_ID_PRIVE, edlDate: '2026-07-10' })
  const sM = await bootM.api.flush()
  if (sM.errors && sM.errors.length) throw new Error('seed espace M : ' + JSON.stringify(sM.errors))
  if (sM.skipped && sM.skipped.length) throw new Error('seed espace M skipped : ' + JSON.stringify(sM.skipped))

  // 2) Espace D (le sien) : ARCHIVE homonyme (même SCI, même ref, EDL ancien), via le chemin app.
  //    (Semé AVANT le membership → resolveEspaces de D ne voit alors que son espace = mono.)
  const bootD0 = await bootAs(D)
  espaceD = bootD0.espaces[0].espaceId
  pushSci(bootD0.db, { sci: SCI, ref: REF, edlId: EDL_ID_ARCHIVE, edlDate: '2026-06-01' })
  const sD = await bootD0.api.flush()
  if (sD.errors && sD.errors.length) throw new Error('seed espace D : ' + JSON.stringify(sD.errors))

  // 3) D devient membre SCOPÉ de l'espace M + octroi GESTIONNAIRE sur la SCI SMART (config prod 08/08).
  const clientM = await userClient(M.email, M.pass)
  const { data: entRows, error: eEnt } = await clientM.from('entites')
    .select('id, nom').eq('espace_id', espaceM).eq('nom', SCI)
  if (eEnt) throw eEnt
  entiteSmartM = entRows[0].id
  const { error: eMem } = await clientM.from('espace_members')
    .insert({ espace_id: espaceM, user_id: dUser.id, role: 'lecture_seule', invite_status: 'active', full_espace: false })
  if (eMem) throw eMem
  const { error: eOct } = await clientM.from('entite_membre')
    .insert({ espace_id: espaceM, entite_id: entiteSmartM, user_id: dUser.id, role: 'gestionnaire' })
  if (eOct) throw eOct
}, 120000)

afterAll(async () => {
  await teardownOwner(M.email, [espaceM].filter(Boolean))
  await teardownOwner(D.email, [espaceD].filter(Boolean))
  await deleteUserByEmail(M.email)
  await deleteUserByEmail(D.email)
})

describe('BUG-PARTAGE-EDL-ESPACE-TIERS — boot du membre scopé (chemin app réel)', () => {
  let boot

  beforeAll(async () => { boot = await bootAs(D) }, 60000)

  it('resolveEspaces liste les 2 espaces, le propre en premier', () => {
    expect(boot.espaces.length).toBe(2)
    expect(boot.espaces[0].espaceId).toBe(espaceD)
    expect(boot.espaces[0].mine).toBe(true)
    expect(boot.espaces[1].espaceId).toBe(espaceM)
    expect(boot.espaces[1].mine).toBe(false)
  })

  it('★ SYMPTÔME PROD : l\'EDL de l\'espace tiers est présent dans DB.edl après hydrate', () => {
    const tiers = (boot.db.edl || []).find(e => e && e.id === EDL_ID_TIERS)
    expect(tiers, 'EDL du 15/07 (espace tiers) absent de DB.edl — bug reproduit').toBeTruthy()
    expect(tiers._espaceId).toBe(espaceM)
    expect(tiers.type).toBe('Entrée')
    // l'EDL de sa propre archive reste là aussi (pas d'absorption par homonymie)
    const archive = (boot.db.edl || []).find(e => e && e.id === EDL_ID_ARCHIVE)
    expect(archive).toBeTruthy()
    expect(archive._espaceId).toBe(espaceD)
  })

  it('la liste EDL (filtre UI rEDLList sans filtre entité/logement) contient l\'EDL tiers', () => {
    // réplique du filtre de rEDLList (index.html) : _edlActive = vivant (pas de tombstone),
    // pas de filtre entité (_activeEntity=null) ni logement (flog='') au premier affichage.
    const list = (boot.db.edl || []).filter(e => e && !e._deleted)
    expect(list.some(e => e.id === EDL_ID_TIERS)).toBe(true)
  })

  it('les collections sœurs du même chemin suivent : logement + bail + entité de l\'espace tiers présents', () => {
    const logs = (boot.db.logements || []).filter(l => l && l.ref === REF)
    expect(logs.length, '2 logements homonymes attendus (archive + tiers)').toBe(2)
    expect(new Set(logs.map(l => l._espaceId))).toEqual(new Set([espaceD, espaceM]))
    const ents = (boot.db.entites || []).filter(e => e && e.nom === SCI)
    expect(ents.length).toBe(2)
    // baux : dict keyé par ref → la collision D1 désambiguïse la clé du 2e espace (ref@@espaceId)
    const bailKeys = Object.keys(boot.db.baux || {}).filter(k => k === REF || k.startsWith(REF + '@@'))
    expect(bailKeys.length).toBe(2)
  })

  it('ANTI-FUITE : rien de la SCI non octroyée (entité, logement, EDL, bail)', () => {
    expect((boot.db.entites || []).some(e => e && e.nom === SCI_PRIVEE)).toBe(false)
    expect((boot.db.logements || []).some(l => l && l.ref === REF_PRIVEE)).toBe(false)
    expect((boot.db.edl || []).some(e => e && e.id === EDL_ID_PRIVE)).toBe(false)
    expect(Object.keys(boot.db.baux || {}).some(k => k.split('@@')[0] === REF_PRIVEE)).toBe(false)
  })

  it('contrôle owner : M voit ses 2 EDL (le partage ne casse rien côté propriétaire)', async () => {
    const bootM2 = await bootAs(M)
    const ids = (bootM2.db.edl || []).map(e => e && e.id)
    expect(ids).toContain(EDL_ID_TIERS)
    expect(ids).toContain(EDL_ID_PRIVE)
  }, 60000)
})

// ════════════════════════════════════════════════════════════════════════════
// INCIDENT 18/07 rejoué contre le vrai Postgres : le membre scopé RÉ-ENREGISTRE l'EDL tiers.
// saveEDL (index.html) reconstruit l'objet (`DB.edl[i] = record`) → tag `_espaceId` perdu.
// Avant le fix D1b : flush = softDelete chez l'owner (autorisé par l'octroi gestionnaire) +
// upsert routé espace propre skippé (ref irrésoluble) = EDL détruit partout.
// Après le fix : l'écriture ré-adopte le tag → UPDATE routé chez l'owner, l'EDL survit, édité.
// ════════════════════════════════════════════════════════════════════════════
describe('BUG-PARTAGE-EDL-ESPACE-TIERS — édition par remplacement d\'objet (incident du 18/07)', () => {
  it('le membre scopé ré-enregistre l\'EDL tiers (objet reconstruit sans tag) → l\'EDL SURVIT chez l\'owner, édité', async () => {
    const bootD = await bootAs(D)
    const idx = bootD.db.edl.findIndex(e => e && e.id === EDL_ID_TIERS)
    expect(idx).toBeGreaterThanOrEqual(0)
    const old = bootD.db.edl[idx]
    // réplique saveEDL : record reconstruit de zéro (id/logement/type conservés, contenu édité, SANS _espaceId)
    bootD.db.edl[idx] = {
      id: old.id, type: old.type, date: old.date, logement: old.logement, locataire: old.locataire,
      pieces: [...(old.pieces || []), { nom: 'Cuisine', elements: [{ nom: 'Évier', etatE: 'Bon', obsE: '', photosE: [] }] }],
      _modifiedAt: '2026-08-10T10:00:00.000Z',
    }
    const s = await bootD.api.flush()
    expect((s.removes || []).filter(r => r.coll === 'edl'), 'AUCUN softDelete edl ne doit partir').toEqual([])
    expect((s.errors || []), 'flush sans erreur').toEqual([])
    expect((s.upserts || []).some(u => u.coll === 'edl'), 'l\'édition part en upsert').toBe(true)

    // côté OWNER : l'EDL est toujours là, avec l'édition du membre scopé
    const bootM3 = await bootAs(M)
    const edlM = (bootM3.db.edl || []).find(e => e && e.id === EDL_ID_TIERS)
    expect(edlM, 'l\'EDL doit avoir SURVÉCU chez l\'owner').toBeTruthy()
    expect((edlM.pieces || []).some(p => p && p.nom === 'Cuisine'), 'l\'édition du scopé est propagée').toBe(true)

    // côté MEMBRE re-hydraté : une seule occurrence, taguée espace tiers (pas de copie dans son espace propre)
    const bootD2 = await bootAs(D)
    const copies = (bootD2.db.edl || []).filter(e => e && e.id === EDL_ID_TIERS)
    expect(copies.length).toBe(1)
    expect(copies[0]._espaceId).toBe(espaceM)
  }, 90000)
})
