import { describe, it, expect } from 'vitest'
import { createStoreSync } from '../../js/core/store-sync.js'

// ════════════════════════════════════════════════════════════════════════════
// D1b — RÉADOPTION du tag d'espace (BUG-PARTAGE-EDL-ESPACE-TIERS, incident du 18/07).
//
// Cas réel : Didier (membre scopé gestionnaire de la SCI chez Marion) ouvre l'EDL de l'espace
// TIERS puis le ré-enregistre. saveEDL RECONSTRUIT l'objet (`DB.edl[i] = record`) → le tag
// `_espaceId` posé à l'hydrate est PERDU. Le diff D1 voyait alors :
//   • clé `id@@espace-tiers` disparue du courant → softDelete routé chez le TIERS (l'octroi
//     gestionnaire l'autorise) = l'EDL de Marion détruit (tombstone isolé du 18/07 09:16) ;
//   • clé nue apparue → upsert routé espace PROPRE (D2), mapToRow ne résout pas la ref → skipped.
// Destruction silencieuse, aucune copie nulle part. Même classe de risque pour toute collection
// dont l'éditeur REMPLACE l'objet (saveEnt remplace l'entité, DB.baux[ref] = {...}, etc.).
//
// Correctif : au flush, un record VIVANT non tagué dont la clé NUE correspond à un UNIQUE record
// TAGUÉ du baseline est LE MÊME record (réédité par un flux qui a reconstruit l'objet) → il
// ré-adopte ce tag AVANT le diff. Règles de sûreté :
//   • un record déjà tagué n'est JAMAIS retagué ;
//   • clé nue déjà connue NON taguée au baseline → record propre (D2 inchangé, mono-espace inerte) ;
//   • 2+ espaces candidats (homonymie réelle sur la même clé) → ambigu : PAS de devinette (D2).
// ════════════════════════════════════════════════════════════════════════════

function mockStore() {
  const calls = []
  return {
    calls,
    upsert: async (coll, rec, opts) => { calls.push({ op: 'upsert', coll, rec, opts }); return { status: 'inserted' } },
    remove: async (coll, rec) => { calls.push({ op: 'remove', coll, rec }); return { status: 'deleted' } },
  }
}

const baseMulti = () => ({
  entites: [
    { nom: 'SCI PROPRE', _espaceId: 'ESP_OWN', immeubles: [] },
    { nom: 'SMARTOSAURUS', _espaceId: 'ESP_TIERS', immeubles: [] },
  ],
  logements: [
    { ref: 'F-1', entity: 'SCI PROPRE', _espaceId: 'ESP_OWN' },
    { ref: 'FERRETTE 001', entity: 'SMARTOSAURUS', _espaceId: 'ESP_TIERS' },
  ],
  mouvements: [],
  baux: {},
  edl: [
    { id: 1784120562200, logement: 'FERRETTE 001', type: 'Entrée', date: '2026-07-15', _espaceId: 'ESP_TIERS', pieces: [] },
  ],
})

describe('D1b — réadoption du tag d\'espace au flush (record reconstruit sans _espaceId)', () => {
  it('INCIDENT 18/07 : EDL tiers ré-enregistré par remplacement d\'objet → UPSERT routé au tiers, AUCUN remove', async () => {
    const store = mockStore()
    const db = baseMulti()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // saveEDL : reconstruit le record de zéro (mêmes id/logement, contenu édité, SANS _espaceId)
    db.edl[0] = { id: 1784120562200, logement: 'FERRETTE 001', type: 'Entrée', date: '2026-07-15', pieces: [{ nom: 'Séjour', elements: [] }] }
    const s = await sync.flush()
    const rm = store.calls.filter(c => c.op === 'remove')
    expect(rm, 'aucun softDelete ne doit partir (le record existe toujours)').toEqual([])
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'edl')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId, 'le tag du baseline doit être ré-adopté → écriture routée au tiers').toBe('ESP_TIERS')
    expect(up[0].rec.pieces.length).toBe(1)
    expect(s.removes).toEqual([])
  })

  it('re-save à contenu identique (objet reconstruit) : JAMAIS de remove ; au pire un upsert idempotent routé au tiers', async () => {
    const store = mockStore()
    const db = baseMulti()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // reconstruction à contenu identique, tag perdu. La signature de diff est sensible à l'ordre
    // JSON (contrat « sur-envoi sûr ») → un upsert idempotent est acceptable ; l'invariant dur est
    // ZÉRO remove et un routage au BON espace.
    db.edl[0] = { id: 1784120562200, logement: 'FERRETTE 001', type: 'Entrée', date: '2026-07-15', pieces: [] }
    await sync.flush()
    expect(store.calls.filter(c => c.op === 'remove')).toEqual([])
    for (const c of store.calls.filter(x => x.coll === 'edl')) {
      expect(c.op).toBe('upsert')
      expect(c.rec._espaceId).toBe('ESP_TIERS')
    }
  })

  it('delEDL d\'un record tiers (tombstone reconstruit sans tag) : le remove part avec le rec BASELINE tagué (régression gardée)', async () => {
    const store = mockStore()
    const db = baseMulti()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // delEDL : DB.edl[idx] = { id, _deleted:true, logement } — tombstone SANS tag
    db.edl[0] = { id: 1784120562200, _deleted: true, logement: 'FERRETTE 001' }
    await sync.flush()
    const rm = store.calls.filter(c => c.op === 'remove' && c.coll === 'edl')
    expect(rm.length).toBe(1)
    expect(rm[0].rec._espaceId, 'remove routé par le rec baseline (tagué tiers)').toBe('ESP_TIERS')
  })

  it('un VRAI nouveau record non tagué (clé inconnue du baseline) reste non tagué → espace propre (D2)', async () => {
    const store = mockStore()
    const db = baseMulti()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.edl.push({ id: 999000111, logement: 'F-1', type: 'Entrée', date: '2026-08-01', pieces: [] })
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'edl')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBeUndefined()
  })

  it('AMBIGUÏTÉ (même clé taguée dans 2 espaces) : pas de devinette, le record reconstruit reste non tagué', async () => {
    const store = mockStore()
    const db = baseMulti()
    db.edl.push({ id: 1784120562200, logement: 'Ferrette - 001', type: 'Entrée', date: '2026-07-15', _espaceId: 'ESP_OWN', pieces: [] })
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // reconstruction du record tiers : 2 candidats baseline (ESP_TIERS + ESP_OWN, même id) → ambigu
    db.edl[0] = { id: 1784120562200, logement: 'FERRETTE 001', type: 'Entrée', date: '2026-07-15', pieces: [{ nom: 'X', elements: [] }] }
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'edl')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId, 'ambigu → D2 (comportement antérieur), jamais une devinette cross-espace').toBeUndefined()
  })

  it('clé nue déjà connue NON taguée au baseline (record propre créé en session) : jamais retagué', async () => {
    const store = mockStore()
    const db = baseMulti()
    db.edl.push({ id: 555, logement: 'F-1', type: 'Entrée', date: '2026-08-01', pieces: [] })   // créé en session, jamais tagué
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.edl[1] = { id: 555, logement: 'F-1', type: 'Entrée', date: '2026-08-01', pieces: [{ nom: 'Y', elements: [] }] }
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'edl')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBeUndefined()
  })

  it('OWNER cloud (N=1, records tagués espace PROPRE à l\'hydrate) : ré-enregistrer SON EDL ré-adopte le tag propre — ni remove, ni conflit éternel (edl non REVIVABLE)', async () => {
    // Depuis v15.483, même à N=1 l'hydrate tague tout avec l'espace propre → AVANT le fix, toute
    // édition d'EDL par REMPLACEMENT d'objet (saveEDL) partait en remove(clé@@own) + upsert(clé nue)
    // en conflit d'id → EDL soft-deleted au cloud + retry éternel (edl exclu du chemin revive).
    const store = mockStore()
    const db = {
      entites: [{ nom: 'SCI A', _espaceId: 'ESP_OWN', immeubles: [] }],
      logements: [{ ref: 'F-1', entity: 'SCI A', _espaceId: 'ESP_OWN' }],
      mouvements: [], baux: {},
      edl: [{ id: 42, logement: 'F-1', type: 'Entrée', _espaceId: 'ESP_OWN', pieces: [] }],
    }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.edl[0] = { id: 42, logement: 'F-1', type: 'Entrée', pieces: [{ nom: 'Séjour', elements: [] }] }
    await sync.flush()
    expect(store.calls.filter(c => c.op === 'remove')).toEqual([])
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'edl')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBe('ESP_OWN')
  })

  it('MONO-ESPACE (aucun tag nulle part) : réadoption inerte, comportement strictement inchangé', async () => {
    const store = mockStore()
    const db = { entites: [{ nom: 'SCI A', immeubles: [] }], logements: [{ ref: 'F-1', entity: 'SCI A' }], mouvements: [], baux: {}, edl: [{ id: 1, logement: 'F-1', type: 'Entrée', pieces: [] }] }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.edl[0] = { id: 1, logement: 'F-1', type: 'Entrée', pieces: [{ nom: 'Z', elements: [] }] }
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'edl')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBeUndefined()
    expect(store.calls.filter(c => c.op === 'remove')).toEqual([])
  })

  it('BAUX : valeur du dict remplacée sans tag (clé stable) → l\'écriture ré-adopte le tag du baseline (jamais routée espace propre)', async () => {
    const store = mockStore()
    const db = baseMulti()
    db.baux = { 'FERRETTE 001': { entity: 'SMARTOSAURUS', hc: 500, ch: 50, _espaceId: 'ESP_TIERS' } }
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.baux['FERRETTE 001'] = { entity: 'SMARTOSAURUS', hc: 520, ch: 50 }   // remplacement d'objet, tag perdu
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'baux')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBe('ESP_TIERS')
    expect(store.calls.filter(c => c.op === 'remove')).toEqual([])
  })

  it('ENTITES : saveEnt remplace l\'objet (renommage exclu) → l\'entité TIERS rééditée ré-adopte son tag', async () => {
    const store = mockStore()
    const db = baseMulti()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.entites[1] = { nom: 'SMARTOSAURUS', siren: '842000000', immeubles: [] }   // reconstruit sans tag
    await sync.flush()
    const up = store.calls.filter(c => c.op === 'upsert' && c.coll === 'entites')
    expect(up.length).toBe(1)
    expect(up[0].rec._espaceId).toBe('ESP_TIERS')
    expect(store.calls.filter(c => c.op === 'remove')).toEqual([])
  })

  it('le tag ré-adopté est DURABLE sur le record VIVANT (toutes collections, y compris énumérées par copie) — résolveurs/_viewFor le revoient', async () => {
    const store = mockStore()
    const db = baseMulti()
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.edl[0] = { id: 1784120562200, logement: 'FERRETTE 001', type: 'Entrée', date: '2026-07-15', pieces: [{ nom: 'S', elements: [] }] }
    db.entites[1] = { nom: 'SMARTOSAURUS', siren: '842', immeubles: [] }
    await sync.flush()
    expect(db.edl[0]._espaceId, 'source edl retaguée durablement').toBe('ESP_TIERS')
    expect(db.entites[1]._espaceId, 'source entité retaguée durablement (collection énumérée par copie)').toBe('ESP_TIERS')
  })

  it('IMMEUBLES imbriqués sous une entité tiers remplacée : entité ET immeubles ré-adoptent le tag → upserts routés tiers, zéro remove', async () => {
    const store = mockStore()
    const db = baseMulti()
    db.entites[1].immeubles = [{ nom: 'RES DU PARC', _espaceId: 'ESP_TIERS', adr: 'a' }]
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // saveEnt : remplacement complet, entité + immeubles reconstruits sans tag
    db.entites[1] = { nom: 'SMARTOSAURUS', siren: '842', immeubles: [{ nom: 'RES DU PARC', adr: 'b' }] }
    await sync.flush()
    expect(store.calls.filter(c => c.op === 'remove')).toEqual([])
    const upImm = store.calls.filter(c => c.op === 'upsert' && c.coll === 'immeubles')
    expect(upImm.length).toBe(1)
    expect(upImm[0].rec._espaceId).toBe('ESP_TIERS')
  })

  it('AMBIGUÏTÉ destructrice fermée (réserve 1 audit) : entités HOMONYMES dans 2 espaces + saveEnt → le remove@@espace est SUSPENDU (fail-safe), jamais poussé', async () => {
    // Config prod réelle : SMARTOSAURUS existe chez Didier (archive) ET chez Marion. saveEnt sur
    // l'une des deux → record non tagué, 2 candidats → pas d'adoption (pas de devinette de routage),
    // MAIS aucune des deux lignes ne doit être supprimée au cloud : le remove est suspendu tant que
    // le jumeau vivant non résolu existe (convergence à la prochaine re-hydrate).
    const store = mockStore()
    const db = baseMulti()
    db.entites.push({ nom: 'SMARTOSAURUS', _espaceId: 'ESP_OWN', siren: '111', immeubles: [] })   // homonyme espace propre
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    db.entites[1] = { nom: 'SMARTOSAURUS', siren: '842', immeubles: [] }   // rebuild de la version TIERS, tag perdu
    await sync.flush()
    expect(store.calls.filter(c => c.op === 'remove'), 'aucun remove ne doit partir (ni Marion ni Didier)').toEqual([])
  })

  it('la SUSPENSION ne bloque pas une VRAIE suppression : tombstone en place (tag préservé) d\'un homonyme → le remove part normalement', async () => {
    const store = mockStore()
    const db = baseMulti()
    db.entites.push({ nom: 'SMARTOSAURUS', _espaceId: 'ESP_OWN', siren: '111', immeubles: [] })
    const sync = createStoreSync({ store, getDB: () => db })
    sync.seed()
    // delEnt tombstone EN PLACE (mutation, tag préservé) de la version ESP_OWN — pas de jumeau non tagué
    db.entites[2] = { ...db.entites[2], _deleted: true }
    await sync.flush()
    const rm = store.calls.filter(c => c.op === 'remove' && c.coll === 'entites')
    expect(rm.length).toBe(1)
    expect(rm[0].rec._espaceId).toBe('ESP_OWN')
  })

  it('markDirty/_hasPendingRemoves : un record tiers reconstruit sans tag n\'est PAS un remove pendable (pas de flush immédiat parasite)', async () => {
    const store = mockStore()
    const db = baseMulti()
    const scheduled = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => scheduled.push(opts) })
    sync.seed()
    db.edl[0] = { id: 1784120562200, logement: 'FERRETTE 001', type: 'Entrée', date: '2026-07-15', pieces: [{ nom: 'S', elements: [] }] }
    sync.markDirty()
    expect(scheduled.length).toBe(1)
    expect(scheduled[0] && scheduled[0].immediate, 'pas de fausse détection de suppression').toBeFalsy()
  })

  it('markDirty en AMBIGUÏTÉ (homonymes 2 espaces, rebuild sans tag) : le remove suspendu n\'est pas non plus un remove pendable', async () => {
    const store = mockStore()
    const db = baseMulti()
    db.entites.push({ nom: 'SMARTOSAURUS', _espaceId: 'ESP_OWN', siren: '111', immeubles: [] })
    const scheduled = []
    const sync = createStoreSync({ store, getDB: () => db, schedule: (fn, opts) => scheduled.push(opts) })
    sync.seed()
    db.entites[1] = { nom: 'SMARTOSAURUS', siren: '842', immeubles: [] }
    sync.markDirty()
    expect(scheduled.length).toBe(1)
    expect(scheduled[0] && scheduled[0].immediate).toBeFalsy()
  })
})
