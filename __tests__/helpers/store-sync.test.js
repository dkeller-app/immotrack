import { describe, it, expect } from 'vitest'
import { createStoreSync, SYNCED_COLLECTIONS } from '../../js/core/store-sync.js'
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
function mockStore(overrides = {}) {
  const calls = []
  const keyOf = (coll, rec) => coll + ':' + (rec.__key ?? rec.nom ?? rec.ref ?? rec.id)
  const reply = (op, coll, rec) => {
    const k = keyOf(coll, rec)
    if (overrides[k]) return overrides[k]
    return op === 'upsert' ? { status: 'inserted', id: k, version: 1 } : { status: 'deleted', id: k, version: 2 }
  }
  return {
    calls,
    upsert: async (coll, rec) => { calls.push({ op: 'upsert', coll, rec }); return reply('upsert', coll, rec) },
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
})
