import { describe, it, expect } from 'vitest'
import { createStoreSync, SYNCED_COLLECTIONS, summaryHasCloudWrites } from '../../js/core/store-sync.js'
import { mapToRow } from '../../js/core/store-mapping.js'
import { createSupabaseStore, TABLE_COLLECTIONS } from '../../js/core/store-supabase.js'

// ctx réel minimal pour valider le CONTRAT (le record enuméré doit être accepté par le vrai mapper).
const realCtx = () => ({
  espaceId: 'ESP', ownerId: 'OWN', detUuid: (...p) => 'uuid:' + p.join('|'),
  entiteByNom: new Map([['sci a', 'uuid:entite|sci a']]),
  immeubleByNom: new Map(), logementByRef: new Map([['f-1', 'uuid:logement|f-1']]), documentByLegacy: new Map(),
})

// Mock store : enregistre les appels upsert/remove et renvoie un statut configurable.
// Par défaut : upsert→{status:'inserted'}, remove→{status:'deleted'}. Override par (coll,key).
// Un override { throws: 'msg' } fait THROW l'appel (simule le POISON du 12/07 : CHECK 23514,
// RLS 42501, réseau… — l'adapter réel `writer.insert/update/softDelete` throw sur ces erreurs).
function mockStore(overrides = {}) {
  const calls = []
  const keyOf = (coll, rec) => coll + ':' + (rec.__key ?? rec.nom ?? rec.ref ?? rec.id)
  const reply = (op, coll, rec) => {
    const k = keyOf(coll, rec)
    if (overrides[k]) {
      if (overrides[k].throws) throw new Error(overrides[k].throws)
      return overrides[k]
    }
    return op === 'upsert' ? { status: 'inserted', id: k, version: 1 } : { status: 'deleted', id: k, version: 2 }
  }
  return {
    calls,
    upsert: async (coll, rec, opts) => { calls.push({ op: 'upsert', coll, rec, opts }); return reply('upsert', coll, rec) },
    remove: async (coll, rec) => { calls.push({ op: 'remove', coll, rec }); return reply('remove', coll, rec) },
  }
}

const baseDB = () => ({
  entites: [{ nom: 'SCI A', immeubles: [] }],
  logements: [{ ref: 'F-1', entity: 'SCI A' }],
  mouvements: [{ id: 1, qui: 'F-1', date: '2026-01-01' }],
  baux: {},
})

describe('createStoreSync — moteur de diff DB → upsert/remove (cœur Option C)', () => {
  it('après seed, un flush sans changement ne touche pas le store', async () => {
    const store = mockStore()
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    const summary = await sync.flush()
    expect(store.calls).toEqual([])
    expect(summary.upserts).toEqual([])
    expect(summary.removes).toEqual([])
  })

  it('VERROU LÉGAL : un bail verrouillé au baseline = jamais ré-upserté/supprimé ; la transition false→true POSE le verrou', async () => {
    const store = mockStore()
    const db = baseDB()
    db.baux = { F3: { hc: 700, signatures: { signedAt: '2026-01-01T00:00:00Z', signatureSource: 'immotrack', contentHashTerms: 'a'.repeat(64), locked: false } } }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()                                   // baseline : F3 NON verrouillé
    const bx = () => store.calls.filter(c => c.coll === 'baux').map(c => c.op + ':' + c.rec.__key)

    // (1) transition false→true → POSE le verrou : DOIT upserter (le baseline n'est pas encore verrouillé)
    db.baux.F3.signatures.locked = true
    await sync.flush()
    expect(bx()).toEqual(['upsert:F3'])

    // (2) F3 désormais verrouillé au baseline → une modif (illégitime) NE doit PAS ré-upserter (trigger refuserait)
    store.calls.length = 0
    db.baux.F3.hc = 999
    await sync.flush()
    expect(bx()).toEqual([])

    // (3) suppression d'un signé verrouillé → NE doit PAS remove
    store.calls.length = 0
    delete db.baux.F3
    await sync.flush()
    expect(bx()).toEqual([])
  })

  it('VERROU pièce 2 : un bail signé NON scellé (ex. présentiel : signedAt sans locked) est SCELLÉ au flush (empreinte + verrou) puis poussé, idempotent ensuite', async () => {
    const store = mockStore()
    const db = baseDB()
    // signé via une voie qui NE verrouille PAS (présentiel) : signedAt présent, ni locked ni contentHashTerms
    db.baux = { F3: { hc: 700, signatures: { signedAt: '2026-01-01T00:00:00Z', mode: 'avec-locataire', bailSnapshot: { log: { ref: 'F-1' } } } } }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()                                   // baseline : F3 PAS encore scellé
    await sync.flush()
    const sg = db.baux.F3.signatures
    expect(sg.locked).toBe(true)                  // scellé au flush
    expect(sg.signatureSource).toBe('immotrack')
    expect(sg.contentHashTerms).toMatch(/^[0-9a-f]{64}$/)
    expect(store.calls.filter(c => c.coll === 'baux').map(c => c.op)).toEqual(['upsert'])   // poussé UNE fois (pose le verrou)

    const h = sg.contentHashTerms
    store.calls.length = 0
    await sync.flush()
    expect(sg.contentHashTerms).toBe(h)           // jamais recalculé (immutabilité)
    expect(store.calls.filter(c => c.coll === 'baux')).toEqual([])   // déjà verrouillé → exclu (pièce 4)
  })

  it('VERROU pièce 2 — C1 (audit) : un bail PARTIELLEMENT signé (mode bailleur-seul) n\'est PAS verrouillé ; il l\'est quand le locataire signe (avec-locataire)', async () => {
    const store = mockStore()
    const db = baseDB()                           // baux: {}
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // le bailleur signe SEUL → signedAt présent MAIS locataire pas encore signé
    db.baux.F3 = { hc: 700, signatures: { signedAt: '2026-01-01T00:00:00Z', mode: 'bailleur-seul', bailSnapshot: { log: { ref: 'F-1' } } } }
    await sync.flush()
    expect(db.baux.F3.signatures.locked).toBeFalsy()                 // PARTIEL → JAMAIS verrouillé
    expect(db.baux.F3.signatures.contentHashTerms).toBeUndefined()
    expect(store.calls.filter(c => c.coll === 'baux').map(c => c.op)).toEqual(['upsert'])   // synchronisé (non verrouillé) — la Phase 2 reste possible

    // Phase 2 : le locataire signe → mode complet → MAINTENANT scellé + verrouillé
    store.calls.length = 0
    db.baux.F3.signatures.mode = 'avec-locataire'
    db.baux.F3.signatures.signedLocataireAt = '2026-01-02T00:00:00Z'
    await sync.flush()
    expect(db.baux.F3.signatures.locked).toBe(true)
    expect(db.baux.F3.signatures.contentHashTerms).toMatch(/^[0-9a-f]{64}$/)
    expect(store.calls.filter(c => c.coll === 'baux').map(c => c.op)).toEqual(['upsert'])   // re-poussé AVEC le verrou
  })

  it('un nouvel enregistrement → upsert(coll, rec) ; baseline mis à jour (2e flush = no-op)', async () => {
    const store = mockStore()
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.logements.push({ ref: 'F-2', entity: 'SCI A' })
    const s1 = await sync.flush()
    expect(store.calls.filter(c => c.op === 'upsert' && c.coll === 'logements').map(c => c.rec.ref)).toEqual(['F-2'])
    expect(s1.upserts).toContainEqual({ coll: 'logements', key: 'f-2' })
    store.calls.length = 0
    const s2 = await sync.flush()
    expect(store.calls).toEqual([])           // baseline à jour → rien à repousser
    expect(s2.upserts).toEqual([])
  })

  it('un enregistrement modifié → upsert', async () => {
    const store = mockStore()
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.logements[0].loyer = 750
    await sync.flush()
    expect(store.calls.filter(c => c.coll === 'logements')).toHaveLength(1)
    expect(store.calls[0].rec.loyer).toBe(750)
  })

  it('un enregistrement supprimé → remove(coll, ancien rec) ; baseline le retire', async () => {
    const store = mockStore()
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.mouvements = []
    const s1 = await sync.flush()
    const rem = store.calls.filter(c => c.op === 'remove' && c.coll === 'mouvements')
    expect(rem).toHaveLength(1)
    expect(rem[0].rec.id).toBe(1)              // l'ANCIEN rec (pour résoudre l'id de ligne)
    expect(s1.removes).toContainEqual({ coll: 'mouvements', key: '1' })
    store.calls.length = 0
    await sync.flush()
    expect(store.calls).toEqual([])            // déjà retiré du baseline
  })

  it('suppression par TOMBSTONE EN PLACE (_deleted:true, record reste dans la collection) → remove/softDelete, PAS upsert d\'une ligne vivante', async () => {
    const store = mockStore()
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()                                   // F-1 synchronisé vivant
    // l'app tombstone EN PLACE : le record RESTE dans la collection, gagne _deleted (sémantique réelle)
    db.logements[0] = { ...db.logements[0], _deleted: true, _deletedAt: '2026-06-11T00:00:00Z' }
    const s = await sync.flush()
    const ops = store.calls.filter(c => c.coll === 'logements')
    expect(ops).toHaveLength(1)
    expect(ops[0].op).toBe('remove')              // softDelete gardé par version, PAS un upsert qui ressuscite
    expect(s.removes).toContainEqual({ coll: 'logements', key: 'f-1' })
    expect(s.upserts).toEqual([])
  })

  it('RENOMMAGE logement (ref = clé d\'identité, mutée EN PLACE) : le remove vise l\'ANCIENNE ref, pas la nouvelle — sinon l\'ancienne ligne cloud survit = DOUBLON', async () => {
    const store = mockStore()
    const db = baseDB()                        // logements: [{ ref: 'F-1', entity: 'SCI A' }]
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()                                // baseline : F-1 synchronisé (uuid dérivé de la ref)
    db.logements[0].ref = 'F-9'                // renommage EN PLACE (comme renameLogementRef)
    await sync.flush()
    const up = store.calls.filter(c => c.coll === 'logements' && c.op === 'upsert')
    const rm = store.calls.filter(c => c.coll === 'logements' && c.op === 'remove')
    expect(up.map(c => c.rec.ref)).toEqual(['F-9'])   // insère le nouveau bien
    expect(rm).toHaveLength(1)
    expect(rm[0].rec.ref).toBe('F-1')                 // supprime l'ANCIEN (uuid F-1), pas F-9 — cœur du doublon
  })

  it('RENOMMAGE entité (nom = clé d\'identité, muté EN PLACE) : même garantie — le remove vise l\'ANCIEN nom', async () => {
    const store = mockStore()
    const db = baseDB()                        // entites: [{ nom: 'SCI A', immeubles: [] }]
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.entites[0].nom = 'SCI B'                // renommage entité EN PLACE
    await sync.flush()
    const up = store.calls.filter(c => c.coll === 'entites' && c.op === 'upsert')
    const rm = store.calls.filter(c => c.coll === 'entites' && c.op === 'remove')
    expect(up.map(c => c.rec.nom)).toEqual(['SCI B'])
    expect(rm).toHaveLength(1)
    expect(rm[0].rec.nom).toBe('SCI A')               // supprime l'ANCIENNE ligne, pas la nouvelle
  })

  it('RENOMMAGE : baux_historique.ref (dérive l\'uuid bailhist) muté EN PLACE → le remove vise l\'ANCIENNE ref (table de PREUVE, pas de doublon)', async () => {
    const store = mockStore()
    const db = { entites: [], logements: [], mouvements: [], baux: {}, baux_historique: [{ ref: 'F-1', logement: 'F-1', _archivedAt: '2026-01-01' }] }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()                                // baseline : archive F-1|2026-01-01 synchronisée
    db.baux_historique[0].ref = 'F-9'          // renommage EN PLACE (renameLogementRef mute .ref)
    await sync.flush()
    const up = store.calls.filter(c => c.coll === 'baux_historique' && c.op === 'upsert')
    const rm = store.calls.filter(c => c.coll === 'baux_historique' && c.op === 'remove')
    expect(up.map(c => c.rec.ref)).toEqual(['F-9'])   // insère l'archive re-clée
    expect(rm).toHaveLength(1)
    expect(rm[0].rec.ref).toBe('F-1')                 // supprime l'ANCIENNE archive (pas F-9)
  })

  it('record créé ET tombstoné avant tout sync (jamais synchronisé vivant) → ignoré (ni upsert ni remove)', async () => {
    const store = mockStore()
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.logements.push({ ref: 'F-7', entity: 'SCI A', _deleted: true })   // apparaît déjà tombstoné
    const s = await sync.flush()
    expect(store.calls.filter(c => c.rec && c.rec.ref === 'F-7')).toEqual([])
    expect(s.upserts).toEqual([]); expect(s.removes).toEqual([])
  })

  it('ordre parent→enfant : une nouvelle entité ET un nouveau logement → entité upsertée AVANT logement', async () => {
    const store = mockStore()
    const db = { entites: [], logements: [], mouvements: [], baux: {} }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.entites.push({ nom: 'SCI Neuve', immeubles: [] })
    db.logements.push({ ref: 'F-9', entity: 'SCI Neuve' })
    await sync.flush()
    const idxEnt = store.calls.findIndex(c => c.coll === 'entites')
    const idxLog = store.calls.findIndex(c => c.coll === 'logements')
    expect(idxEnt).toBeGreaterThanOrEqual(0); expect(idxLog).toBeGreaterThan(idxEnt)
  })

  it('conflit (store renvoie conflict) → reporté dans summary.conflicts, baseline NON mis à jour (retry au prochain flush)', async () => {
    const store = mockStore({ 'logements:F-3': { status: 'conflict', id: 'x' } })
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.logements.push({ ref: 'F-3', entity: 'SCI A' })
    const s1 = await sync.flush()
    expect(s1.conflicts).toContainEqual({ coll: 'logements', key: 'f-3' })
    expect(s1.upserts).toEqual([])
    // baseline non mis à jour → le prochain flush retente
    const s2 = await sync.flush()
    expect(store.calls.filter(c => c.coll === 'logements' && c.rec.ref === 'F-3')).toHaveLength(2)
    expect(s2.conflicts).toContainEqual({ coll: 'logements', key: 'f-3' })
  })

  it('skipped (FK non résolue, mapToRow null) → reporté dans summary.skipped, baseline NON mis à jour', async () => {
    const store = mockStore({ 'logements:F-4': { status: 'skipped' } })
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.logements.push({ ref: 'F-4', entity: 'Inconnue' })
    const s1 = await sync.flush()
    expect(s1.skipped).toContainEqual({ coll: 'logements', key: 'f-4' })
    const s2 = await sync.flush()              // retenté tant que non synced
    expect(store.calls.filter(c => c.rec.ref === 'F-4')).toHaveLength(2)
    expect(s2.skipped).toHaveLength(1)
  })

  it('immeubles imbriqués (entites[].immeubles) → upsert(\'immeubles\', rec) avec le nom de l\'entité parente', async () => {
    const store = mockStore()
    const db = { entites: [{ nom: 'SCI A', immeubles: [] }], logements: [], mouvements: [], baux: {} }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.entites[0].immeubles.push({ nom: 'Bat Nord', adresse: '1 rue X' })
    await sync.flush()
    const im = store.calls.filter(c => c.coll === 'immeubles')
    expect(im).toHaveLength(1)
    expect(im[0].rec.nom).toBe('Bat Nord'); expect(im[0].rec.__entiteNom).toBe('SCI A')   // champ attendu par le mapper
  })

  it('immeuble IMBRIQUÉ sous une entité tombstonée (delEnt ne marque PAS l\'immeuble) → remove/softDelete, PAS upsert zombie', async () => {
    const store = mockStore()
    const db = { entites: [{ nom: 'SCI A', immeubles: [{ nom: 'Bat Nord', adresse: '1 rue' }] }], logements: [], mouvements: [], baux: {} }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()                                   // immeuble synchronisé vivant
    // delEnt tombstone l'ENTITÉ en place mais préserve l'immeuble SANS _deleted (comportement réel)
    db.entites[0] = { ...db.entites[0], _deleted: true, immeubles: [{ nom: 'Bat Nord' }] }
    const s = await sync.flush()
    const ops = store.calls.filter(c => c.coll === 'immeubles')
    expect(ops).toHaveLength(1)
    expect(ops[0].op).toBe('remove')              // l'immeuble hérite de la suppression du parent (nesting) → softDelete
    expect(s.upserts.filter(u => u.coll === 'immeubles')).toEqual([])
  })

  it('baux (map clé=ref) → enuméré avec __key, upsert(\'baux\', {__key, ...})', async () => {
    const store = mockStore()
    const db = { entites: [], logements: [], mouvements: [], baux: {} }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.baux['F-1'] = { entity: 'SCI A', hc: 700 }
    await sync.flush()
    const b = store.calls.filter(c => c.coll === 'baux')
    expect(b).toHaveLength(1)
    expect(b[0].rec.__key).toBe('F-1'); expect(b[0].rec.hc).toBe(700)
  })

  it('baux_historique : clé alignée sur l\'identité du mapping (ref|_archivedAt), PAS sur id → aucune perte si id legacy dupliqué', async () => {
    const store = mockStore()
    const db = { entites: [], logements: [], mouvements: [], baux: {}, baux_historique: [] }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // deux archives DISTINCTES (ref/_archivedAt différents) mais même id legacy (un log d'archive n'a pas d'id unique)
    db.baux_historique.push({ id: 10, ref: 'F-1', _archivedAt: '2026-01-01' })
    db.baux_historique.push({ id: 10, ref: 'F-2', _archivedAt: '2026-02-01' })
    await sync.flush()
    const refs = store.calls.filter(c => c.coll === 'baux_historique').map(c => c.rec.ref).sort()
    expect(refs).toEqual(['F-1', 'F-2'])         // LES DEUX synchronisées (mapping → 2 lignes distinctes), aucune perdue
  })

  it('immeubles : le record enuméré est ACCEPTÉ par le vrai mapToRow (contrat __entiteNom, pas entity) — sinon skipped en boucle', async () => {
    const store = mockStore()
    const db = { entites: [{ nom: 'SCI A', immeubles: [] }], logements: [], mouvements: [], baux: {} }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.entites[0].immeubles.push({ nom: 'Bat Nord', adresse: '1 rue X' })
    await sync.flush()
    const rec = store.calls.find(c => c.coll === 'immeubles').rec
    const row = mapToRow('immeubles', rec, realCtx())
    expect(row).not.toBeNull()                       // null → store 'skipped' → immeubles JAMAIS synchronisés
    expect(row.entite_id).toBe('uuid:entite|sci a')
  })

  it('ordre FK : documents AVANT mouvements (FK DURE mouvements_pj_fk → documents)', async () => {
    const store = mockStore()
    const db = { entites: [], logements: [], mouvements: [], baux: {}, documents: [] }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.documents.push({ id: 500, parentType: 'logement', parentRef: 'F-1' })
    db.mouvements.push({ id: 600, qui: 'F-1', date: '2026-01-01', pjId: 500 })
    await sync.flush()
    const idxDoc = store.calls.findIndex(c => c.coll === 'documents')
    const idxMv = store.calls.findIndex(c => c.coll === 'mouvements')
    expect(idxDoc).toBeGreaterThanOrEqual(0); expect(idxMv).toBeGreaterThan(idxDoc)
  })

  it('CASCADE bout-en-bout (vrai Store + vrai mapToRow) : supprimer une entité (entité + enfants tombstonés) → softDelete RÉEL des enfants, PAS skipped', async () => {
    const softDeleted = []
    const versions = new Map([['uuid:entite|sci a', 3], ['uuid:immeuble|bat nord', 5], ['uuid:logement|f-1', 7]])
    const writer = {
      insert: async (t, row) => { versions.set(row.id, 1); return 1 },
      update: async (t, id, row, v) => { if (versions.get(id) !== v) return null; versions.set(id, v + 1); return v + 1 },
      softDelete: async (t, id, v) => { if (versions.get(id) !== v) return null; versions.set(id, v + 1); softDeleted.push({ t, id }); return v + 1 },
    }
    const backend = {
      fetchTable: async (name) => ({
        entites: [{ id: 'uuid:entite|sci a', version: 3, legacy_raw: { nom: 'SCI A', immeubles: [{ nom: 'Bat Nord' }] } }],
        immeubles: [{ id: 'uuid:immeuble|bat nord', version: 5, legacy_raw: { nom: 'Bat Nord', __entiteNom: 'SCI A' } }],
        logements: [{ id: 'uuid:logement|f-1', version: 7, legacy_raw: { id: 10, ref: 'F-1', entity: 'SCI A' } }],
      }[name] || []),
      fetchConfig: async () => ({}),
    }
    const store = createSupabaseStore({ ...backend, writer, detUuid: (...p) => 'uuid:' + p.join('|'), espaceId: 'ESP', ownerId: 'OWN' })
    const db = await store.hydrate()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // l'app supprime l'entité → tombstone entité + logement EN PLACE ; l'immeuble imbriqué N'est PAS
    // marqué par delEnt (bug réel) → store-sync doit quand même le supprimer (propagation du parent).
    db.entites[0]._deleted = true
    db.logements[0]._deleted = true
    const summary = await sync.flush()
    // les DEUX enfants softDeletés réellement (logement direct + immeuble imbriqué non marqué)
    expect(softDeleted.map(x => x.id)).toContain('uuid:logement|f-1')
    expect(softDeleted.map(x => x.id)).toContain('uuid:immeuble|bat nord')
    expect(summary.removes).toContainEqual({ coll: 'logements', key: 'f-1' })
    expect(summary.removes).toContainEqual({ coll: 'immeubles', key: 'bat nord' })
    expect(summary.skipped).toEqual([])
  })

  it('config (collections non-tablées) modifiée → store.persistConfig(db) une fois ; inchangée → aucun appel', async () => {
    let persistCount = 0
    const store = { ...mockStore(), persistConfig: async () => { persistCount++; return { status: 'config-written' } } }
    const db = { entites: [], logements: [], mouvements: [], baux: {}, params: { devise: 'EUR' }, categories: ['Loyer'] }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    await sync.flush()
    expect(persistCount).toBe(0)             // rien changé
    db.params.devise = 'USD'
    const s = await sync.flush()
    expect(persistCount).toBe(1)             // config changée → persistConfig
    expect(s.config).toBe('written')
    await sync.flush()
    expect(persistCount).toBe(1)             // baseline config à jour → plus d'appel
  })

  it('réentrance (audit C2) : flush() SÉRIALISE — jamais 2 _doFlush en parallèle (2 saves rapprochés)', async () => {
    let active = 0, maxActive = 0
    const store = {
      upsert: async () => { active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 15)); active--; return { status: 'inserted', version: 1 } },
      remove: async () => ({ status: 'deleted' }),
    }
    const db = { entites: [{ nom: 'A', immeubles: [] }], logements: [], mouvements: [], baux: {} }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed({ entites: [], logements: [], mouvements: [], baux: {} })   // baseline vide → A est nouveau
    const p1 = sync.flush()                       // flush 1 démarre (upsert lent)
    db.entites.push({ nom: 'B', immeubles: [] })  // 2e modif PENDANT le flush 1
    const p2 = sync.flush()                       // flush 2 demandé → DOIT attendre la fin du flush 1
    await Promise.all([p1, p2])
    expect(maxActive).toBe(1)                      // jamais 2 _doFlush (donc 2 upsert) concurrents
  })

  it('config : une collection TABLE-backée modifiée ne déclenche PAS persistConfig (c\'est le sync de table)', async () => {
    let persistCount = 0
    const store = { ...mockStore(), persistConfig: async () => { persistCount++; return { status: 'config-written' } } }
    const db = { entites: [], logements: [{ ref: 'F-1', entity: 'SCI A' }], mouvements: [], baux: {} }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.logements[0].loyer = 800              // changement d'une TABLE, pas de la config
    await sync.flush()
    expect(persistCount).toBe(0)
  })

  it('GARDE ANTI-DRIFT : SYNCED_COLLECTIONS (store-sync) ≡ TABLE_COLLECTIONS (store-supabase) — sinon perte silencieuse', () => {
    // une collection présente dans l'une mais pas l'autre tomberait entre sync-table et blob-config.
    expect(new Set(SYNCED_COLLECTIONS)).toEqual(TABLE_COLLECTIONS)
  })

  // ── P1.2 FLUSH BLINDÉ (audit sync cloud 2026-07-12, cause C-A) ─────────────────────────────
  // Bug réel du 12/07 : UN insert documents refusé (CHECK 23514) a fait throw _doFlush entier →
  // removes + config JAMAIS tentés, sync 100 % morte une journée, en silence. Contrat blindé :
  // un throw de store est un ÉCHEC PAR ENREGISTREMENT (summary.errors), jamais un abort global.

  it('POISON (12/07) : un upsert qui THROW n\'avorte plus le flush — autres upserts + removes + config TOUJOURS tentés, poison dans summary.errors', async () => {
    let persistCount = 0
    const store = { ...mockStore({ 'documents:66': { throws: 'insert documents: violates check constraint (23514)' } }), persistConfig: async () => { persistCount++; return { status: 'config-written' } } }
    const db = { ...baseDB(), documents: [], params: { devise: 'EUR' } }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.documents.push({ id: 66, parentType: 'mrh' })                 // le POISON
    db.logements.push({ ref: 'F-2', entity: 'SCI A' })               // un autre upsert sain
    db.mouvements = []                                               // une SUPPRESSION (perdue le 12/07)
    db.params.devise = 'USD'                                         // une modif CONFIG (perdue le 12/07)
    const s = await sync.flush()
    expect(s.errors).toContainEqual({ op: 'upsert', coll: 'documents', key: '66', message: expect.stringContaining('23514') })
    expect(s.upserts).toContainEqual({ coll: 'logements', key: 'f-2' })       // l'upsert sain est passé
    expect(s.removes).toContainEqual({ coll: 'mouvements', key: '1' })        // le remove est passé
    expect(s.config).toBe('written'); expect(persistCount).toBe(1)            // la config est passée
  })

  it('POISON : baseline NON avancé pour l\'enregistrement en échec → retenté au prochain flush ; les succès ne sont PAS re-poussés', async () => {
    const store = mockStore({ 'documents:66': { throws: 'boom' } })
    const db = { ...baseDB(), documents: [] }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.documents.push({ id: 66, parentType: 'mrh' })
    db.logements.push({ ref: 'F-2', entity: 'SCI A' })
    await sync.flush()
    store.calls.length = 0
    const s2 = await sync.flush()
    expect(store.calls.map(c => c.coll + ':' + (c.rec.id ?? c.rec.ref))).toEqual(['documents:66'])   // seul le poison est retenté
    expect(s2.errors).toHaveLength(1)
  })

  it('un remove qui THROW est isolé pareil : les autres removes + la config passent quand même', async () => {
    let persistCount = 0
    const store = { ...mockStore({ 'logements:F-1': { throws: 'softDelete logements: réseau' } }), persistConfig: async () => { persistCount++; return { status: 'config-written' } } }
    const db = { ...baseDB(), params: { devise: 'EUR' } }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.logements = []                                                // remove poison (throw)
    db.mouvements = []                                               // remove sain
    db.params.devise = 'USD'
    const s = await sync.flush()
    expect(s.errors).toContainEqual({ op: 'remove', coll: 'logements', key: 'f-1', message: expect.stringContaining('réseau') })
    expect(s.removes).toContainEqual({ coll: 'mouvements', key: '1' })
    expect(s.config).toBe('written'); expect(persistCount).toBe(1)
  })

  it('persistConfig qui THROW → summary.config = \'error\' + summary.errors, le flush ne throw PAS, config retentée au prochain flush', async () => {
    let persistCount = 0, fail = true
    const store = { ...mockStore(), persistConfig: async () => { persistCount++; if (fail) throw new Error('writeConfig: RLS'); return { status: 'config-written' } } }
    const db = { ...baseDB(), params: { devise: 'EUR' } }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.params.devise = 'USD'
    const s1 = await sync.flush()                                    // ne doit PAS rejeter
    expect(s1.config).toBe('error')
    expect(s1.errors).toContainEqual({ op: 'config', coll: 'config', key: 'espace_config', message: expect.stringContaining('RLS') })
    fail = false
    const s2 = await sync.flush()                                    // signature config non avancée → retry
    expect(persistCount).toBe(2)
    expect(s2.config).toBe('written')
  })

  it('SUPPRESSION = FLUSH IMMÉDIAT : markDirty avec un remove en attente → schedule({immediate:true}) (bypass du debounce 800 ms)', async () => {
    const store = mockStore()
    const db = baseDB()
    const sched = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => sched.push({ fn, opts }) })
    sync.seed()
    // modif SANS suppression → debounce normal (pas d'immediate)
    db.logements[0].loyer = 800
    sync.markDirty()
    expect(sched).toHaveLength(1)
    expect(sched[0].opts && sched[0].opts.immediate).toBeFalsy()
    // suppression par tombstone EN PLACE (sémantique réelle de l'app) → immediate
    db.mouvements[0] = { ...db.mouvements[0], _deleted: true }
    sync.markDirty()
    expect(sched).toHaveLength(2)
    expect(sched[1].opts).toMatchObject({ immediate: true })
    await sched[1].fn()
    expect(store.calls.filter(c => c.op === 'remove' && c.coll === 'mouvements')).toHaveLength(1)
  })

  it('markDirty : la suppression d\'un bail VERROUILLÉ au baseline ne déclenche PAS l\'immédiat (le flush ne ferait rien → anti-boucle)', async () => {
    const store = mockStore()
    const db = baseDB()
    db.baux = { F3: { hc: 700, signatures: { signedAt: '2026-01-01T00:00:00Z', signatureSource: 'immotrack', contentHashTerms: 'a'.repeat(64), locked: true } } }
    const sched = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => sched.push({ fn, opts }) })
    sync.seed()                                   // baseline : F3 verrouillé
    delete db.baux.F3
    sync.markDirty()
    expect(sched).toHaveLength(1)
    expect(sched[0].opts && sched[0].opts.immediate).toBeFalsy()
  })

  it('RETRY BACKOFF : un flush avec erreurs re-programme un flush via schedule({retryDelayMs}) — délai doublé à chaque échec, plafonné, remis à zéro au succès', async () => {
    const store = mockStore({ 'documents:66': { throws: 'boom' } })
    const db = { ...baseDB(), documents: [] }
    const sched = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => sched.push({ fn, opts }) })
    sync.seed()
    db.documents.push({ id: 66, parentType: 'mrh' })
    await sync.flush()
    expect(sched.at(-1).opts).toMatchObject({ retryDelayMs: 2000 })   // 1er échec → 2 s
    await sched.at(-1).fn()
    expect(sched.at(-1).opts).toMatchObject({ retryDelayMs: 4000 })   // 2e échec → 4 s
    for (let i = 0; i < 8; i++) await sched.at(-1).fn()               // …
    expect(sched.at(-1).opts.retryDelayMs).toBe(60000)                // plafonné à 60 s (l'onglet vit → on retente)
    // guérison : le poison disparaît (jamais monté → créé-puis-retiré = ignoré) → flush PROPRE → streak reset
    db.documents = []
    const before = sched.length
    await sched.at(-1).fn()
    expect(sched.length).toBe(before)                                 // flush PROPRE → aucun retry re-programmé
    // nouvel échec plus tard → le backoff repart à 2 s (streak remis à zéro par le succès)
    db.documents.push({ id: 66, parentType: 'mrh' })                  // le store throw toujours sur documents:66
    await sync.flush()
    expect(sched.at(-1).opts).toMatchObject({ retryDelayMs: 2000 })
  })

  it('(audit M6a) remove d\'ENFANT qui THROW : la chaîne de removes CONTINUE (ordre enfant→parent préservé, le parent est bien soft-deleté)', async () => {
    const store = mockStore({ 'logements:F-1': { throws: 'softDelete logements: réseau' } })
    const db = baseDB()                            // entites: SCI A (parent), logements: F-1 (enfant)
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // suppression en cascade : l'app tombstone parent + enfant ensemble
    db.entites[0] = { ...db.entites[0], _deleted: true }
    db.logements[0] = { ...db.logements[0], _deleted: true }
    const s = await sync.flush()
    const rms = store.calls.filter(c => c.op === 'remove')
    expect(rms.map(c => c.coll)).toEqual(['logements', 'entites'])    // enfant TENTÉ d'abord, parent ENSUITE malgré le throw
    expect(s.errors).toContainEqual({ op: 'remove', coll: 'logements', key: 'f-1', message: expect.stringContaining('réseau') })
    expect(s.removes).toContainEqual({ coll: 'entites', key: 'sci a' })   // le parent est bien parti (pas d'abort de chaîne)
    // l'enfant en échec est RETENTÉ au prochain flush (baseline non avancé)
    store.calls.length = 0
    const s2 = await sync.flush()
    expect(store.calls.filter(c => c.op === 'remove' && c.coll === 'logements')).toHaveLength(1)
    expect(s2.errors).toHaveLength(1)
  })

  it('(audit M6b) markDirty : getDB qui THROW pendant la détection de removes → repli DEBOUNCE normal (jamais de crash, jamais d\'immediate)', async () => {
    const store = mockStore()
    let boom = true
    const db = baseDB()
    const sched = []
    const sync = createStoreSync({ store, getDB: () => { if (boom) throw new Error('DB pas prêt'); return db }, schedule: (fn, opts) => sched.push({ fn, opts }) })
    sync.seed(db)                                  // seed avec db explicite (getDB piégé)
    expect(() => sync.markDirty()).not.toThrow()
    expect(sched).toHaveLength(1)                  // flush quand même programmé…
    expect(sched[0].opts && sched[0].opts.immediate).toBeFalsy()   // …en debounce normal (détection best-effort)
    boom = false                                   // au moment où le debounce tire, le DB est redevenu lisible
    await sched[0].fn()
  })

  it('RETRY : un conflit de version seul ne re-programme PAS (résolution = re-hydrate, P1 item 2 — retenter à l\'identique serait une boucle éternelle)', async () => {
    const store = mockStore({ 'logements:F-3': { status: 'conflict', id: 'x' } })
    const db = baseDB()
    const sched = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => sched.push({ fn, opts }) })
    sync.seed()
    db.logements.push({ ref: 'F-3', entity: 'SCI A' })
    const s = await sync.flush()
    expect(s.conflicts).toHaveLength(1)
    expect(sched.filter(c => c.opts && c.opts.retryDelayMs)).toHaveLength(0)
  })

  it('markDirty programme un flush via le scheduler injecté (debounce app)', async () => {
    const store = mockStore()
    const db = baseDB()
    let scheduled = null
    const sync = createStoreSync({ store, getDB: () => db, schedule: fn => { scheduled = fn } })
    sync.seed()
    db.logements.push({ ref: 'F-5', entity: 'SCI A' })
    sync.markDirty()
    expect(typeof scheduled).toBe('function')   // programmé, pas encore exécuté
    expect(store.calls).toEqual([])
    await scheduled()                            // le debounce arrive à échéance
    expect(store.calls.filter(c => c.rec.ref === 'F-5')).toHaveLength(1)
  })

  // ── P1.3 (chantier conflit→re-hydrate) — réserves M2/M4 de l'audit v15.460 ────────────────────

  it('M2 : un remove en CONFLIT permanent ne neutralise plus le debounce (markDirty redevient debounce normal tant que le conflit vit)', async () => {
    const store = mockStore({ 'mouvements:1': { status: 'conflict', id: 'x' } })
    const db = baseDB()
    const sched = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => sched.push({ fn, opts }) })
    sync.seed()
    db.mouvements[0] = { ...db.mouvements[0], _deleted: true }
    sync.markDirty()
    expect(sched.at(-1).opts).toMatchObject({ immediate: true })   // 1re détection → immédiat (P1.2 inchangé)
    const s = await sync.flush()
    expect(s.conflicts).toContainEqual({ coll: 'mouvements', key: '1' })
    // le remove reste en attente (baseline non avancé) MAIS sa dernière tentative fut un CONFLIT :
    // une modif utilisateur quelconque ne doit PLUS déclencher l'immédiat à chaque frappe (audit M2)
    db.logements[0].loyer = 900
    sync.markDirty()
    expect(sched.at(-1).opts && sched.at(-1).opts.immediate).toBeFalsy()
  })

  it('M2 : l\'exclusion est PAR CLÉ — un NOUVEAU remove en attente déclenche l\'immédiat malgré un autre remove en conflit', async () => {
    const store = mockStore({ 'mouvements:1': { status: 'conflict', id: 'x' } })
    const db = { ...baseDB(), quittances: [{ id: 7, mois: '2026-01' }] }
    const sched = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => sched.push({ fn, opts }) })
    sync.seed()
    db.mouvements[0] = { ...db.mouvements[0], _deleted: true }
    await sync.flush()                                             // remove mouvements:1 → conflit (exclu)
    db.quittances[0] = { ...db.quittances[0], _deleted: true }     // NOUVELLE suppression, clé différente
    sync.markDirty()
    expect(sched.at(-1).opts).toMatchObject({ immediate: true })
  })

  it('M2 : seed() (= re-hydratation) purge l\'exclusion — un remove re-tenté après re-hydrate redevient immédiat', async () => {
    const ov = { 'mouvements:1': { status: 'conflict', id: 'x' } }
    const store = mockStore(ov)
    const db = baseDB()
    const sched = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => sched.push({ fn, opts }) })
    sync.seed()
    db.mouvements[0] = { ...db.mouvements[0], _deleted: true }
    await sync.flush()                                             // conflit → clé exclue
    // re-hydratation : le serveur a toujours la ligne vivante → DB neuf, mouvement VIVANT
    const db2 = baseDB()
    sync.seed(db2)
    delete ov['mouvements:1']                                      // le conflit de version est résolu côté serveur
    db2.mouvements[0] = { ...db2.mouvements[0], _deleted: true }   // l'utilisateur re-supprime
    sync.markDirty()
    expect(sched.at(-1).opts).toMatchObject({ immediate: true })   // exclusion purgée par seed
  })

  it('M4 : summaryHasCloudWrites — vrai si le flush a réellement écrit (upserts/removes/config), faux si seulement erreurs/conflits/skipped', () => {
    const S = (o = {}) => ({ upserts: [], removes: [], conflicts: [], skipped: [], errors: [], ...o })
    expect(summaryHasCloudWrites(S({ upserts: [{ coll: 'logements', key: 'f-1' }] }))).toBe(true)
    expect(summaryHasCloudWrites(S({ removes: [{ coll: 'agenda', key: '3' }] }))).toBe(true)
    expect(summaryHasCloudWrites(S({ config: 'written' }))).toBe(true)
    // B-REBAIL : un flush qui ne fait QUE revivifier (relocation pure) doit AUSSI broadcaster, sinon le
    // bail revivifié ne redescend jamais sur les autres appareils (variante du bug qu'on corrige).
    expect(summaryHasCloudWrites(S({ revives: [{ coll: 'baux', key: 'f-1' }] }))).toBe(true)
    // poison isolé + vraie écriture dans le MÊME flush (cas M4 : le signal doit partir)
    expect(summaryHasCloudWrites(S({ upserts: [{ coll: 'agenda', key: '9' }], errors: [{ op: 'upsert', coll: 'documents', key: '66', message: 'boom' }] }))).toBe(true)
    expect(summaryHasCloudWrites(S({ errors: [{ op: 'upsert', coll: 'documents', key: '66', message: 'boom' }] }))).toBe(false)
    expect(summaryHasCloudWrites(S({ conflicts: [{ coll: 'baux', key: 'f3' }] }))).toBe(false)
    expect(summaryHasCloudWrites(S({ skipped: [{ coll: 'logements', key: 'f-9' }] }))).toBe(false)
    expect(summaryHasCloudWrites(S({ config: 'error' }))).toBe(false)
    expect(summaryHasCloudWrites(S())).toBe(false)
    expect(summaryHasCloudWrites(null)).toBe(false)
  })
})

// ── B-REBAIL-TOMBSTONE : émission de allowRevive + acceptation du statut 'revived' ─────────────────
// Le SIGNAL D'INTENTION vit ici (store-sync connaît le baseline). Un AJOUT FRAIS (clé absente du
// baseline = relocation OU record neuf) émet allowRevive:true → le store pourra ré-ouvrir un tombstone.
// Une ÉDITION (clé présente) émet allowRevive:false → jamais de revive (anti-résurrection, classe « Delle b »).
describe('createStoreSync — B-REBAIL : allowRevive (intention) + statut revived', () => {
  it('AJOUT FRAIS émet allowRevive:true ; ÉDITION émet allowRevive:false', async () => {
    const store = mockStore()
    const db = baseDB()                                   // baux: {} (vide au baseline)
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed(db)
    // ajout frais d'un bail : clé absente du baseline → relocation possible → allowRevive:true
    db.baux.F3 = { hc: 655 }
    await sync.flush()
    const add = store.calls.find(c => c.coll === 'baux' && c.rec.__key === 'F3')
    expect(add.opts && add.opts.allowRevive).toBe(true)
    // édition du même bail : clé présente au baseline → allowRevive:false (jamais de résurrection)
    db.baux.F3.hc = 700
    await sync.flush()
    const edits = store.calls.filter(c => c.coll === 'baux' && c.rec.__key === 'F3')
    expect(edits[1].opts.allowRevive).toBe(false)
  })

  it('un logement recréé (clé revenue au courant après suppression) émet allowRevive:true', async () => {
    const store = mockStore()
    const db = baseDB()                                   // logements: [{ ref: 'F-1' }] déjà au baseline
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed(db)
    // suppression (tombstone) → baseline retire F-1
    db.logements[0]._deleted = true
    await sync.flush()
    // recréation même ref (pendant cloud v15.262 : _deleted effacé) → clé revenue = ajout frais
    delete db.logements[0]._deleted
    db.logements[0].surf = 42
    await sync.flush()
    const recreate = store.calls.filter(c => c.op === 'upsert' && c.coll === 'logements' && c.rec.ref === 'F-1')
    expect(recreate[recreate.length - 1].opts.allowRevive).toBe(true)
  })

  it('le store renvoyant status:revived fait AVANCER le baseline (2e flush = no-op)', async () => {
    const store = mockStore({ 'baux:F3': { status: 'revived', id: 'uuid:bail|f3', version: 4 } })
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed(db)
    db.baux.F3 = { hc: 495 }
    const s1 = await sync.flush()
    expect(s1.revives).toContainEqual({ coll: 'baux', key: 'f3' })   // 'revived' = succès tracé À PART (distinct des upserts)
    expect(s1.upserts).toEqual([])                                   // pas noyé dans les upserts
    expect(s1.skipped).toEqual([])
    const n = store.calls.length
    await sync.flush()                                                // baseline avancé → rien à re-pousser
    expect(store.calls.length).toBe(n)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// D1 — FUSION MULTI-ESPACES SÛRE : désambiguïsation de la clé de diff par espace.
//
// Cas réel (PARTAGE SCI) : Marion partage « SMARTOSAURUS » à Didier qui garde une ARCHIVE
// FIGÉE homonyme (même nom de SCI, refs FERRETTE proches) dans SON espace. Le store multi-espace
// fusionne les deux copies dans un seul DB, chaque enregistrement taggé `_espaceId`. Les baux
// portaient déjà « ref@@espaceId » (store-multi hydrate) ; les collections adossées à une TABLE
// (entites/immeubles/logements) étaient keyées par la SEULE clé naturelle (norm(nom)/norm(ref))
// → deux espaces homonymes S'ÉCRASENT dans la Map baseline/snapshot du diff : la modif de l'un est
// PERDUE (l'autre le masque) et la suppression de l'un vise à tort la ligne de l'autre.
// Correctif : la clé de diff porte le tag d'espace quand il est présent (inerte à N=1 : mono-espace
// = aucun tag = clé nue = comportement inchangé).
// ════════════════════════════════════════════════════════════════════════════
describe('D1 — fusion multi-espaces : clé de diff désambiguïsée par _espaceId (homonymes SMARTOSAURUS)', () => {
  it('deux entités homonymes de 2 espaces sont suivies DISTINCTEMENT — modifier l’une déclenche SON seul upsert', async () => {
    const store = mockStore()
    const db = {
      entites: [
        { nom: 'SMARTOSAURUS', _espaceId: 'ESP_A', siren: '111', immeubles: [] },
        { nom: 'SMARTOSAURUS', _espaceId: 'ESP_B', siren: '222', immeubles: [] },
      ],
      logements: [], mouvements: [], baux: {},
    }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // modifier UNIQUEMENT l'entité de ESP_A
    db.entites[0].siren = '999'
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'entites')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBe('ESP_A')
    expect(up[0].rec.siren).toBe('999')
  })

  it('deux logements homonymes (FERRETTE-001 dans 2 espaces) : supprimer celui d’un espace ne supprime QUE le sien', async () => {
    const store = mockStore()
    const db = {
      entites: [{ nom: 'SMARTOSAURUS', _espaceId: 'ESP_A', immeubles: [] }, { nom: 'SMARTOSAURUS', _espaceId: 'ESP_B', immeubles: [] }],
      logements: [
        { ref: 'FERRETTE-001', entity: 'SMARTOSAURUS', _espaceId: 'ESP_A', surf: 40 },
        { ref: 'FERRETTE-001', entity: 'SMARTOSAURUS', _espaceId: 'ESP_B', surf: 41 },
      ],
      mouvements: [], baux: {},
    }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // tombstoner le logement de ESP_A (disparaît du courant vivant)
    db.logements[0]._deleted = true
    await sync.flush()
    const rm = store.calls.filter(c => c.op === 'remove' && c.coll === 'logements')
    expect(rm.length).toBe(1)
    expect(rm[0].rec._espaceId).toBe('ESP_A')
    // le logement de ESP_B ne doit JAMAIS être touché
    expect(store.calls.some(c => c.coll === 'logements' && c.rec._espaceId === 'ESP_B')).toBe(false)
  })

  it('immeubles homonymes de 2 espaces : suivis distinctement (modif de l’un = son seul upsert)', async () => {
    const store = mockStore()
    const db = {
      entites: [
        { nom: 'SMARTOSAURUS', _espaceId: 'ESP_A', immeubles: [{ nom: 'RES DU PARC', _espaceId: 'ESP_A', adr: 'a' }] },
        { nom: 'SMARTOSAURUS', _espaceId: 'ESP_B', immeubles: [{ nom: 'RES DU PARC', _espaceId: 'ESP_B', adr: 'b' }] },
      ],
      logements: [], mouvements: [], baux: {},
    }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.entites[0].immeubles[0].adr = 'a2'
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'immeubles')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBe('ESP_A')
  })

  it('N=1 (mono-espace, aucun tag _espaceId) : clé de diff NUE — comportement inchangé', async () => {
    const store = mockStore()
    const db = baseDB()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // modifier l'entité (sans tag) → 1 upsert, clé nue, pas de suffixe « @@ » nulle part
    db.entites[0].immeubles = []
    db.logements[0].surf = 50
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'logements')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBeUndefined()
    // aucune clé de résumé ne contient « @@ » (pas de désambiguïsation à N=1)
    const summary = await sync.flush()
    expect(JSON.stringify(summary)).not.toContain('@@')
  })
})
