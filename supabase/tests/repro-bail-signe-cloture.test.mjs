// REPRO (28/09) — BAIL SIGNÉ → CLÔTURE → RELOCATION contre le VRAI Postgres.
//
// Constat sur banc mock : un bail signé est scellé (locked) au flush ; ensuite store-sync ne le
// supprime JAMAIS (removes : `if (locked) continue`) et n'upserte JAMAIS rien sous la même clé
// (`prev.locked → continue`). Ce fichier rejoue les gestes EXACTS de l'app (saveBailClore,
// index.html ~11656 : archive + tombstone + log.locataire='') sur un compte jetable, puis
// observe ce que rend une ré-hydratation (= rechargement / 2ᵉ appareil).
//
// Ce test DÉCRIT l'état actuel (il documente le défaut) : ses assertions « 🐞 » passent tant que
// le défaut existe. Il sera réécrit en test de NON-régression avec le correctif.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createBoot } from '../../js/app/supabase-boot.js'
import { createUser, adminClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const U = { email: `repro-cloture-${RUN}@example.test`, pass: 'Test-Passw0rd!C' }
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const ENT = 'SCI Repro'
const REF = 'Repro - 001'
const KEY = REF.toLowerCase()
const DUPONT = {
  entity: ENT, locataires: [{ nom: 'Dupont', prenom: 'Jean' }], hc: 600, ch: 40, dg: 600,
  debut: '2025-01-01', fin: '2028-01-01',
  signatures: { signedAt: '2025-01-01T10:00:00Z', mode: 'avec-locataire', bailSnapshot: { log: { ref: REF } } },
}
const MARTIN = { entity: ENT, locataires: [{ nom: 'Martin', prenom: 'Lea' }], hc: 650, ch: 40, dg: 650, debut: '2026-10-01', fin: '2029-10-01' }

async function device() {
  const boot = createBoot(anonClient())
  const r = await boot.loginEmail(U.email, U.pass)
  if (!r.ok) throw new Error('login: ' + r.error)
  const esp = await boot.resolveEspace('Espace Repro Cloture')
  let DB = {}
  boot.wireStore({ espaceId: esp.espaceId, ownerId: esp.ownerId, getDB: () => DB, schedule: null })
  DB = await boot.hydrate()
  boot.seed(DB)
  return { boot, get DB() { return DB }, esp }
}
const bauxRows = async espaceId => {
  const { data } = await adminClient().from('baux')
    .select('id, version, deleted_at, archived, locked, content_hash, signature_source, legacy_raw')
    .eq('espace_id', espaceId).order('created_at', { ascending: true })
  return data || []
}
const histRows = async espaceId => {
  const { data } = await adminClient().from('baux_historique').select('id, deleted_at, legacy_raw').eq('espace_id', espaceId)
  return data || []
}
const bx = s => ({
  upserts: s.upserts.filter(x => x.coll === 'baux'), revives: s.revives.filter(x => x.coll === 'baux'),
  removes: s.removes.filter(x => x.coll === 'baux'), conflicts: s.conflicts.filter(x => x.coll === 'baux'),
  skipped: s.skipped.filter(x => x.coll === 'baux'), errors: s.errors.filter(x => x.coll === 'baux'),
})
// Geste EXACT de saveBailClore (index.html ~11656) — mutations dans le même ordre.
function cloturer(DB, ref, finEff) {
  const bail = DB.baux[ref]
  Object.assign(bail, { finEffective: finEff, finMotif: 'Congé locataire', locNouvelleAdr: '', dgRestitue: 600, dgRetenu: 0, finNotes: '', cloture: true, ref, _archivedAt: '2026-09-28' })
  if (!DB.baux_historique) DB.baux_historique = []
  DB.baux_historique.push({ ...bail })
  DB.baux[ref] = { ref, _deleted: true, _deletedAt: new Date().toISOString(), _modifiedAt: new Date().toISOString(), _archivedAt: '2026-09-28' }
  const log = DB.logements.find(l => l.ref === ref)
  if (log) { log.locataire = ''; log.fin = finEff }
}

let espaceId = null
const journal = []   // trace lisible, imprimée en fin de run
const note = (etape, obj) => { journal.push({ etape, ...obj }) }

beforeAll(async () => { await createUser(U.email, U.pass) })
afterAll(async () => {
  console.log('\n===== JOURNAL REPRO =====\n' + journal.map(j => JSON.stringify(j)).join('\n'))
  if (espaceId) await teardownOwner(U.email, [espaceId])
})

describe('REPRO — bail signé → clôture → relocation (vrai Postgres, compte jetable)', () => {
  let A
  it('1. appareil A : bail Dupont signé (présentiel) → scellé + poussé verrouillé', async () => {
    A = await device()
    espaceId = A.esp.espaceId
    A.DB.entites = [{ nom: ENT, immeubles: [] }]
    A.DB.logements = [{ id: 1, ref: REF, entity: ENT, locataire: 'Dupont Jean' }]
    A.DB.baux = { [REF]: JSON.parse(JSON.stringify(DUPONT)) }
    const s = await A.boot.flush()
    note('1-signature', { flush: bx(s), errors: s.errors })
    expect(s.errors).toEqual([])
    const rows = await bauxRows(espaceId)
    note('1-cloud', { rows: rows.map(r => ({ id: r.id, locked: r.locked, archived: r.archived, deleted: !!r.deleted_at, loc: r.legacy_raw.locataires[0].nom })) })
    expect(rows).toHaveLength(1)
    expect(rows[0].locked).toBe(true)
    expect(rows[0].signature_source).toBe('immotrack')
  })

  it('1b. appareil A : APRÈS le scellement, l\'archivage du PDF (cloudPdfKey/proof) et une révision IRL → 🐞 jamais montés', async () => {
    // __immoArchiveBailPdf (index.html ~7224) écrit ces champs APRÈS le saveDB de la signature ;
    // _applyPendingIRLRevisions (~26858) écrit DB.baux[ref].hc au boot.
    const sg = A.DB.baux[REF].signatures
    sg.cloudPdfKey = 'espace/x/bp_Repro_001.pdf'; sg.proof = { v: 1 }; sg.contentHash = 'f'.repeat(64)
    A.DB.baux[REF].hc = 612
    const s = await A.boot.flush()
    note('1b-apres-scellement', { flush: bx(s) })
    expect(bx(s).upserts).toEqual([]); expect(bx(s).conflicts).toEqual([]); expect(bx(s).errors).toEqual([])
    const B = await device()
    const b = B.DB.baux[REF]
    note('1b-rehydrate', { cloudPdfKey: b.signatures.cloudPdfKey ?? null, proof: b.signatures.proof ?? null, hc: b.hc })
    expect(b.signatures.cloudPdfKey).toBeUndefined()   // 🐞 le lien vers le PDF signé est perdu
    expect(b.hc).toBe(600)                             // 🐞 la révision IRL est perdue
    A.DB.baux[REF].hc = 600                            // remet A comme avant pour la suite du scénario
  })

  it('2. appareil A : clôture (geste saveBailClore) → 🐞 la ligne bail signée n\'est PAS retirée', async () => {
    cloturer(A.DB, REF, '2026-09-30')
    const s = await A.boot.flush()
    note('2-cloture', { flush: bx(s), histUpserts: s.upserts.filter(x => x.coll === 'baux_historique'), logUpserts: s.upserts.filter(x => x.coll === 'logements'), errors: s.errors })
    expect(s.errors).toEqual([])
    const rows = await bauxRows(espaceId)
    const hist = await histRows(espaceId)
    note('2-cloud', { baux: rows.map(r => ({ locked: r.locked, archived: r.archived, deleted: !!r.deleted_at, cloture: r.legacy_raw.cloture ?? null })), hist: hist.map(h => ({ deleted: !!h.deleted_at, cloture: h.legacy_raw.cloture })) })
    expect(bx(s).removes).toEqual([])                  // 🐞 aucun retrait tenté
    expect(bx(s).conflicts).toEqual([])                // 🐞 … et aucun signal
    expect(rows[0].deleted_at).toBeNull()              // 🐞 ligne bail vivante au cloud
    expect(rows[0].archived).toBe(false)
    expect(hist).toHaveLength(1)                       // l'archive, elle, est bien montée
  })

  it('3. appareil B frais (= rechargement) : 🐞 le bail signé revient comme bail COURANT', async () => {
    const B = await device()
    const b = B.DB.baux[REF]
    const log = (B.DB.logements || []).find(l => l.ref === REF)
    note('3-rehydrate', { bailCourant: b ? { loc: b.locataires[0].nom, cloture: b.cloture ?? null, finEffective: b.finEffective ?? null, locked: b.signatures && b.signatures.locked } : null, logLocataire: log && log.locataire, logFin: log && log.fin, nbHist: (B.DB.baux_historique || []).length })
    expect(b).toBeTruthy()                             // 🐞 ressuscité
    expect(b.cloture).toBeUndefined()                  // 🐞 sans trace de clôture
    expect((B.DB.baux_historique || []).length).toBe(1) // … À CÔTÉ de son archive (doublon)
    expect(log.locataire).toBe('')                     // incohérent : le logement se dit vacant
  })

  it('4. appareil A (même session) : relocation Martin → 🐞 JAMAIS poussée, aucun signal', async () => {
    A.DB.baux[REF] = JSON.parse(JSON.stringify(MARTIN))
    A.DB.logements.find(l => l.ref === REF).locataire = 'Martin Lea'
    const s = await A.boot.flush()
    note('4-relocation', { flush: bx(s), logUpserts: s.upserts.filter(x => x.coll === 'logements'), errors: s.errors })
    const f = bx(s)
    expect(f.upserts).toEqual([]); expect(f.revives).toEqual([])      // 🐞 rien d'écrit
    expect(f.conflicts).toEqual([]); expect(f.skipped).toEqual([]); expect(f.errors).toEqual([])   // 🐞 rien de signalé
    const rows = await bauxRows(espaceId)
    note('4-cloud', { baux: rows.map(r => ({ loc: r.legacy_raw.locataires[0].nom, locked: r.locked, deleted: !!r.deleted_at })) })
    expect(rows).toHaveLength(1)
    expect(rows[0].legacy_raw.locataires[0].nom).toBe('Dupont')
  })

  it('5. appareil C frais (rechargement / 2ᵉ appareil) : 🐞 Martin PERDU, Dupont ressuscité', async () => {
    const C = await device()
    const b = C.DB.baux[REF]
    const log = (C.DB.logements || []).find(l => l.ref === REF)
    note('5-rehydrate', { bailCourant: b ? b.locataires[0].nom : null, logLocataire: log && log.locataire })
    expect(b.locataires[0].nom).toBe('Dupont')        // 🐞 le bail du nouveau locataire a disparu
    expect(log.locataire).toBe('Martin Lea')           // … alors que le logement, lui, dit « Martin »
  })

  it('6. appareil C : même en re-clôturant puis en relouant depuis une session fraîche → 🐞 idem', async () => {
    const C = await device()
    cloturer(C.DB, REF, '2026-09-30')
    C.DB.baux[REF] = JSON.parse(JSON.stringify(MARTIN))
    const s = await C.boot.flush()
    note('6-reclot+reloc', { flush: bx(s), errors: s.errors })
    expect(bx(s).upserts).toEqual([]); expect(bx(s).revives).toEqual([]); expect(bx(s).conflicts).toEqual([])
    const hist = await histRows(espaceId)
    note('6-cloud', { nbHist: hist.length })
  })

  it('7. serveur : une 2ᵉ ligne ACTIVE sur le même logement est refusée (index baux_one_active_per_logement)', async () => {
    const [row] = await bauxRows(espaceId)
    const { data: full } = await adminClient().from('baux').select('*').eq('id', row.id).single()
    const { id: _i, version: _v, created_at: _c, updated_at: _u, locked: _l, content_hash: _h, signature_source: _s, ...rest } = full
    const { error } = await adminClient().from('baux').insert({ ...rest, id: '00000000-0000-4000-8000-0000000000aa', legacy_ref: REF })
    note('7-index', { code: error && error.code, message: error && error.message })
    expect(error && error.code).toBe('23505')
    // et le verrou refuse l'archivage (UPDATE archived=true) même en service_role
    const { error: e2 } = await adminClient().from('baux').update({ archived: true }).eq('id', row.id)
    note('7-archive', { message: e2 && e2.message })
    expect(e2 && e2.message).toMatch(/ROW_LOCKED_IMMUTABLE/)
  })
})
