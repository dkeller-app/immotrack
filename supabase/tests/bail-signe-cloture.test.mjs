// NON-RÉGRESSION (vrai Postgres, compte jetable) — BAIL SIGNÉ : vie, clôture, relocation, réinitialisation.
//
// Origine : défaut prouvé le 28/09 sur la base hébergée (1ʳᵉ version de ce fichier = la reproduction,
// cf. historique git « repro-bail-signe-cloture ») : une fois scellé, un bail signé n'était plus JAMAIS
// écrit — clôture, relocation, révision IRL, lien du PDF signé perdus EN SILENCE au rechargement ; le
// bail clôturé ressuscitait comme bail en cours ; le bail du locataire suivant ne montait jamais.
//
// Correctif (option B2, Didier 28/09) : migration 0055 (seul l'archivage est permis sur une ligne
// verrouillée) + store-sync (archivage avant envoi du successeur, ligne propre `_bailUid`, journal
// automatique de la vie du bail). ⚠ NÉCESSITE 0055 APPLIQUÉE en base (sinon l'archivage est refusé).
//
// Un « appareil » = un boot complet comme l'app (login, wireStore, hydrate, RÉAPPLICATION du journal —
// que l'app fait dans _applyDataDefaults —, seed).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { createBoot } from '../../js/app/supabase-boot.js'
import { reappliquerJournalBaux } from '../../js/core/bail-modifications.js'
import { createUser, adminClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const U = { email: `bail-signe-${RUN}@example.test`, pass: 'Test-Passw0rd!C' }
const anonClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

const ENT = 'SCI Repro'
const REF = 'Repro - 001', REF2 = 'Repro - 002'
const signe = (nom, debut) => ({
  entity: ENT, locataires: [{ nom }], hc: 600, ch: 40, dg: 600, debut, fin: '2028-01-01',
  signatures: { signedAt: debut + 'T10:00:00Z', mode: 'avec-locataire', bailSnapshot: { log: { ref: REF } } },
})
const MARTIN = { entity: ENT, locataires: [{ nom: 'Martin' }], hc: 650, ch: 40, dg: 650, debut: '2026-10-01', fin: '2029-10-01' }

async function device() {
  const boot = createBoot(anonClient())
  const r = await boot.loginEmail(U.email, U.pass)
  if (!r.ok) throw new Error('login: ' + r.error)
  const esp = await boot.resolveEspace('Espace Bail signé')
  let DB = {}
  boot.wireStore({ espaceId: esp.espaceId, ownerId: esp.ownerId, getDB: () => DB, schedule: null })
  DB = await boot.hydrate()
  reappliquerJournalBaux(DB.baux || {}, DB.baux_evenements || [])   // comme _applyDataDefaults (index.html)
  boot.seed(DB)
  return { boot, get DB() { return DB }, esp }
}
const rows = async (table, espaceId) => {
  const { data } = await adminClient().from(table).select('*').eq('espace_id', espaceId).order('created_at', { ascending: true })
  return data || []
}
const bx = s => ({ upserts: s.upserts.filter(x => x.coll === 'baux'), archives: s.archives.filter(x => x.coll === 'baux'), conflicts: s.conflicts, errors: s.errors, skipped: s.skipped })
// Geste EXACT de saveBailClore (index.html) — mêmes mutations, même ordre.
function cloturer(DB, ref, finEff, jour) {
  const bail = DB.baux[ref]
  Object.assign(bail, { finEffective: finEff, finMotif: 'Congé locataire', cloture: true, ref, _archivedAt: jour })
  if (!DB.baux_historique) DB.baux_historique = []
  DB.baux_historique.push({ ...bail })
  DB.baux[ref] = { ref, _deleted: true, _deletedAt: new Date().toISOString(), _archivedAt: jour }
  const log = DB.logements.find(l => l.ref === ref)
  if (log) { log.locataire = ''; log.fin = finEff }
}

let espaceId = null
beforeAll(async () => { await createUser(U.email, U.pass) })
afterAll(async () => { if (espaceId) await teardownOwner(U.email, [espaceId]) })

describe('BAIL SIGNÉ — vie, clôture, relocation (vrai Postgres, 0055 requise)', () => {
  let A
  it('1. signature → scellé, poussé verrouillé', async () => {
    A = await device()
    espaceId = A.esp.espaceId
    A.DB.entites = [{ nom: ENT, immeubles: [] }]
    A.DB.logements = [{ id: 1, ref: REF, entity: ENT, locataire: 'Dupont' }, { id: 2, ref: REF2, entity: ENT, locataire: 'Durand' }]
    A.DB.baux = { [REF]: signe('Dupont', '2025-01-01'), [REF2]: signe('Durand', '2025-02-01') }
    A.DB.baux_evenements = []
    const s = await A.boot.flush()
    expect(s.errors).toEqual([])
    const b = await rows('baux', espaceId)
    expect(b).toHaveLength(2)
    expect(b.every(r => r.locked && !r.archived)).toBe(true)
  })

  it('2. après scellement : lien du PDF + révision IRL → journal automatique → redescendent sur un 2ᵉ appareil', async () => {
    A.DB.baux[REF].signatures.cloudPdfKey = 'espace/x/bp_Repro_001.pdf'
    A.DB.baux[REF].hc = 612
    const s = await A.boot.flush()
    expect(s.errors).toEqual([]); expect(s.conflicts).toEqual([])
    expect(s.journalises).toHaveLength(1)
    expect(bx(s).upserts).toEqual([])                        // la ligne signée n'est pas réécrite
    const B = await device()
    expect(B.DB.baux[REF].signatures.cloudPdfKey).toBe('espace/x/bp_Repro_001.pdf')
    expect(B.DB.baux[REF].hc).toBe(612)
    const [row] = (await rows('baux', espaceId)).filter(r => r.legacy_ref === REF)
    expect(row.legacy_raw.hc).toBe(600)                      // contrat signé intact au cloud
  })

  it('3. clôture → ligne signée ARCHIVÉE (intacte) ; au rechargement, plus de bail en cours, l\'archive est là', async () => {
    cloturer(A.DB, REF, '2026-09-30', '2026-09-28')
    const s = await A.boot.flush()
    expect(s.errors).toEqual([]); expect(s.conflicts).toEqual([])
    expect(bx(s).archives).toEqual([{ coll: 'baux', key: REF.toLowerCase() }])
    const row = (await rows('baux', espaceId)).find(r => r.legacy_ref === REF)
    expect(row.archived).toBe(true); expect(row.locked).toBe(true); expect(row.deleted_at).toBeNull()
    expect(row.legacy_raw.locataires[0].nom).toBe('Dupont')
    const B = await device()
    expect(B.DB.baux[REF]).toBeUndefined()                    // ne ressuscite plus
    expect((B.DB.baux_historique || []).filter(h => h.ref === REF)).toHaveLength(1)
  })

  it('4. relocation → le bail Martin a SA ligne, et redescend sur un appareil frais', async () => {
    A.DB.baux[REF] = JSON.parse(JSON.stringify(MARTIN))
    A.DB.logements.find(l => l.ref === REF).locataire = 'Martin'
    const s = await A.boot.flush()
    expect(s.errors).toEqual([]); expect(s.conflicts).toEqual([]); expect(s.skipped).toEqual([])
    expect(bx(s).upserts).toEqual([{ coll: 'baux', key: REF.toLowerCase() }])
    const C = await device()
    expect(C.DB.baux[REF].locataires[0].nom).toBe('Martin')
    const lignes = (await rows('baux', espaceId)).filter(r => r.legacy_ref === REF)
    expect(lignes.map(r => [r.legacy_raw.locataires[0].nom, r.archived])).toEqual([['Dupont', true], ['Martin', false]])
  })

  it('5. relocation depuis un appareil FRAIS (qui n\'a jamais vu le bail archivé) → pas de conflit éternel', async () => {
    const D = await device()
    cloturer(D.DB, REF, '2027-03-31', '2027-03-31')
    D.DB.baux[REF] = { ...JSON.parse(JSON.stringify(MARTIN)), locataires: [{ nom: 'Petit' }], debut: '2027-04-01' }
    const s = await D.boot.flush()
    expect(s.errors).toEqual([]); expect(s.conflicts).toEqual([]); expect(s.skipped).toEqual([])
    const E = await device()
    expect(E.DB.baux[REF].locataires[0].nom).toBe('Petit')
  })

  it('6. réinitialiser les signatures d\'un bail scellé (décision II) → signé archivé, brouillon courant', async () => {
    const F = await device()
    delete F.DB.baux[REF2].signatures
    const s = await F.boot.flush()
    expect(s.errors).toEqual([]); expect(s.conflicts).toEqual([])
    const lignes = (await rows('baux', espaceId)).filter(r => r.legacy_ref === REF2)
    expect(lignes.map(r => [r.locked, r.archived])).toEqual([[true, true], [false, false]])
    const G = await device()
    expect(G.DB.baux[REF2].signatures).toBeUndefined()
    expect(G.DB.baux[REF2].locataires[0].nom).toBe('Durand')
  })

  it('7. deux archives du même logement le même jour → deux lignes (plus d\'écrasement)', async () => {
    const H = await device()
    H.DB.baux_historique.push({ ref: REF, _archivedAt: '2026-09-28', entity: ENT, locataires: [{ nom: 'Autre' }] })
    const s = await H.boot.flush()
    expect(s.errors).toEqual([])
    const hist = (await rows('baux_historique', espaceId)).filter(r => r.legacy_ref === REF && !r.deleted_at)
    expect(hist.length).toBeGreaterThanOrEqual(3)            // Dupont (28/09), Martin (31/03), + l'archive du même jour
    expect(new Set(hist.map(r => r.id)).size).toBe(hist.length)
  })
})
