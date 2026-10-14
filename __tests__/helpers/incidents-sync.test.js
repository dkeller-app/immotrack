/**
 * TRAVAUX : QUI PAIE ? — lot c : la collection `incidents` dans la synchro cloud (migration 0057).
 *
 *   S-1  mapper : rattachements logement / immeuble / SCI, statut, date, incident complet en legacy_raw.
 *   S-2  pièce du dossier de preuves (parentType 'incident') : parent_id = ligne incident.
 *   S-3  câblage : table, collection synchronisée AVANT documents, collection taguée hors ligne,
 *        exclue du blob de config partagé.
 *   S-4  routage multi-espaces : un incident (et sa pièce) suit l'espace de son bien.
 *   S-5  migration : RLS forcée, 4 politiques « _all » sur les 3 rattachements, statut contrôlé,
 *        contrainte des pièces élargie à 'incident', branche entite_of_document gardée.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapToRow, MAPPED_COLLECTIONS } from '../../js/core/store-mapping.js'
import { SYNCED_COLLECTIONS } from '../../js/core/store-sync.js'
import { TABLE_COLLECTIONS } from '../../js/core/store-supabase.js'
import { COLLECTIONS_TAGUEES } from '../../js/core/offline-boot.js'
import { inferRattachementOf } from '../../js/core/store-multi.js'
import { _planErasure } from '../../js/core/rgpd.js'
import { createSupabaseStore } from '../../js/core/store-supabase.js'
import { createStoreSync } from '../../js/core/store-sync.js'
import { mouvementsRattachables } from '../../js/core/incidents.js'
import { renameLogementRef } from '../../js/core/rename-logement.js'
import { renameImmeubleRefs } from '../../js/core/rename-immeuble.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ctx = () => ({
  espaceId: 'ESP', ownerId: 'OWN',
  detUuid: (...p) => p.join(':'),
  entiteByNom: new Map([['sci les hauts', 'ent-1']]),
  immeubleByNom: new Map([['résidence les tilleuls', 'imm-1']]),
  logementByRef: new Map([['t2 altkirch', 'log-1']]),
})
const inc = (x = {}) => ({ id: 41, logRef: 'T2 Altkirch', imm: 'Résidence Les Tilleuls', entity: 'SCI Les Hauts', creeLe: '2026-10-13T09:12:00.000Z', statut: 'en_cours', element: 'ballon', verdict: { payeur: 'bailleur', regle: 'R4' }, ...x })

describe('S · incidents dans la synchro', () => {
  it('S-1 mapper : rattachements, statut, date, legacy_raw complet', () => {
    const row = mapToRow('incidents', inc(), ctx())
    expect(row).toMatchObject({ id: 'incident:41', legacy_id: '41', entite_id: 'ent-1', immeuble_id: 'imm-1', logement_id: 'log-1', statut: 'en_cours', date_signalement: '2026-10-13', espace_id: 'ESP' })
    expect(JSON.parse(JSON.stringify(row.legacy_raw)).verdict).toEqual({ payeur: 'bailleur', regle: 'R4' })
  })
  it('S-1 partie commune (sans logement) : rattachée à l\'immeuble ; statut inconnu → null ; références inconnues → null', () => {
    const row = mapToRow('incidents', inc({ logRef: '', statut: 'bizarre', imm: 'Inconnu', entity: 'Autre' }), ctx())
    expect(row).toMatchObject({ logement_id: null, immeuble_id: null, entite_id: null, statut: null })
    expect(mapToRow('incidents', inc({ logRef: '' }), ctx())).toMatchObject({ logement_id: null, immeuble_id: 'imm-1' })
  })
  it('S-2 pièce du dossier de preuves : parent_id = ligne incident', () => {
    const row = mapToRow('documents', { id: 900, parentType: 'incident', parentId: 41, logRef: 'T2 Altkirch', name: 'devis.pdf' }, { ...ctx(), documentByLegacy: new Map() })
    expect(row.parent_type).toBe('incident')
    expect(row.parent_id).toBe('incident:41')
  })
  it('S-3 câblage : table, synchronisée avant documents, taguée hors ligne', () => {
    expect(MAPPED_COLLECTIONS).toContain('incidents')
    expect(TABLE_COLLECTIONS.has('incidents')).toBe(true)
    expect(SYNCED_COLLECTIONS).toContain('incidents')
    expect(SYNCED_COLLECTIONS.indexOf('incidents')).toBeLessThan(SYNCED_COLLECTIONS.indexOf('documents'))
    expect(COLLECTIONS_TAGUEES).toContain('incidents')
  })
  it('S-4 routage : un incident et sa pièce suivent l\'espace du bien (logement > immeuble > SCI)', () => {
    const db = {
      entites: [{ nom: 'SCI Les Hauts', _espaceId: 'B', immeubles: [{ nom: 'Résidence Les Tilleuls', _espaceId: 'B' }] }, { nom: 'Perso', _espaceId: 'A', immeubles: [] }],
      logements: [{ ref: 'T2 Altkirch', entity: 'SCI Les Hauts', imm: 'Résidence Les Tilleuls', _espaceId: 'B' }],
      incidents: [{ id: 41, logRef: 'T2 Altkirch', _espaceId: 'B' }],
    }
    expect(inferRattachementOf('incidents', { logRef: 'T2 Altkirch' }, db)).toEqual({ espace: 'B', entite: 'SCI Les Hauts' })
    expect(inferRattachementOf('incidents', { logRef: '', imm: 'Résidence Les Tilleuls' }, db)).toEqual({ espace: 'B', entite: 'SCI Les Hauts' })
    expect(inferRattachementOf('documents', { parentType: 'incident', parentId: 41 }, db)).toEqual({ espace: 'B', entite: 'SCI Les Hauts' })
  })
  it('S-4 RGPD : le registre est conservé, le locataire anonymisé', () => {
    const db = { logements: [{ ref: 'T2' }], baux: {}, incidents: [{ id: 1, logRef: 'T2', signaleParNom: 'Camille' }, { id: 2, logRef: 'F1' }] }
    const ops = _planErasure(db, 'T2').operations.filter((o) => o.collection === 'incidents')
    expect(ops).toEqual([expect.objectContaining({ type: 'anonymize', entityId: 1, fields: ['signaleParNom', 'description', 'elementLibre'] })])
  })
})

describe('S-5 · migration 0057 (texte)', () => {
  const sql = readFileSync(resolve(root, 'supabase/migrations/0057_incidents.sql'), 'utf8').replace(/--.*$/gm, '')
  it('RLS activée et forcée, 4 politiques par SCI sur les 3 rattachements', () => {
    expect(sql).toMatch(/alter table public\.incidents enable row level security/)
    expect(sql).toMatch(/alter table public\.incidents force\s+row level security/)
    for (const op of ['select', 'insert', 'update', 'delete']) expect(sql).toMatch(new RegExp(`create policy incidents_${op} on public\\.incidents for ${op}`))
    expect((sql.match(/has_entite_(access|write)_all\(espace_id, entite_id, logement_id, immeuble_id\)/g) || []).length).toBe(5)
    expect(sql).not.toMatch(/using \(\s*true\s*\)/i)
  })
  it('FK composites anti-kidnapping, triggers, statut contrôlé', () => {
    for (const t of ['entites', 'immeubles', 'logements']) expect(sql).toMatch(new RegExp(`references public\\.${t}\\s*\\(id, espace_id\\)`))
    expect(sql).toMatch(/execute function public\.touch_row\(\)/)
    expect(sql).toMatch(/execute function public\.freeze_espace_id\(\)/)
    expect(sql).toMatch(/statut in \('signale', 'en_cours', 'resolu'\)/)
  })
  it('pièces : contrainte élargie (strictement) à incident, résolveur gardé par has_entite_access', () => {
    const c = sql.match(/add constraint documents_parent_type_check[\s\S]*?\)\s*\);/)[0]
    for (const t of ['mouvement', 'immeuble', 'logement', 'entite', 'bail', 'assurance', 'mrh', 'equipement', 'quittance', 'candidat', 'incident']) expect(c).toContain(`'${t}'`)
    const br = sql.slice(sql.indexOf("when 'incident'"), sql.indexOf('else null'))
    expect(br).toMatch(/from public\.incidents inc/)
    expect(br).toMatch(/inc\.espace_id = p_espace_id/)
    // Garde sur CHAQUE rattachement (comme la ligne incident) — relecture Fable I4
    expect(br).toMatch(/where public\.has_entite_access_all\(p_espace_id, x\.e, x\.l, x\.i\)/)
  })
})

describe('S-6 · front déployé AVANT la migration 0057 (relecture Fable C1)', () => {
  const mkStore = (echec) => {
    const ecrits = []
    const store = createSupabaseStore({
      fetchTable: async (n) => { if (n === echec) throw new Error('relation "public.incidents" does not exist'); return [] },
      fetchConfig: async () => ({}),
      writer: { insert: async (table, row) => { ecrits.push(table + ':' + row.parent_type); return 1 }, update: async () => 2, softDelete: async () => 2 },
      detUuid: (...p) => p.join(':'), espaceId: 'E', ownerId: 'O',
    })
    return { store, ecrits }
  }
  it('table absente : incidents et pièces « incident » DIFFÉRÉS, les autres écritures passent', async () => {
    const { store, ecrits } = mkStore('incidents')
    await store.hydrate()
    expect(await store.upsert('incidents', { id: 1, logRef: '', imm: '' })).toEqual({ status: 'deferred' })
    expect(await store.upsert('documents', { id: 2, parentType: 'incident', parentId: 1 })).toEqual({ status: 'deferred' })
    expect(await store.remove('incidents', { id: 1 })).toEqual({ status: 'deferred' })
    expect((await store.upsert('documents', { id: 3, parentType: 'mouvement', parentId: 9 })).status).toBe('inserted')
    expect(ecrits).toEqual(['documents:mouvement'])
  })
  it('table présente : rien de différé', async () => {
    const { store } = mkStore(null)
    await store.hydrate()
    expect((await store.upsert('incidents', { id: 1, logRef: '', imm: '' })).status).toBe('inserted')
  })
  it("store-sync : un différé n'est ni une erreur ni un réessai (pas de backoff), et repart plus tard", async () => {
    const plan = []
    let dispo = false
    const store = { upsert: async (c) => (c === 'incidents' && !dispo ? { status: 'deferred' } : { status: 'inserted' }), remove: async () => ({ status: 'deleted' }) }
    const DB = { incidents: [{ id: 1 }], mouvements: [{ id: 5, date: '2026-10-16', qui: 'T2', db: 10 }] }
    const sync = createStoreSync({ store, getDB: () => DB, schedule: (fn, o) => plan.push(o), sealSigned: false })
    const s1 = await sync.flush()
    expect(s1.deferred).toEqual([{ coll: 'incidents', key: '1' }])
    expect(s1.errors).toEqual([]); expect(s1.skipped).toEqual([])
    expect(plan.filter((o) => o && o.retryDelayMs != null)).toEqual([])
    expect(s1.upserts.map((u) => u.coll)).toEqual(['mouvements'])
    dispo = true
    const s2 = await sync.flush()
    expect(s2.upserts.map((u) => u.coll)).toEqual(['incidents'])
  })
})

describe('S-7 · rattacher un mouvement : même espace seulement (relecture Fable I2)', () => {
  it("un logement homonyme d'une autre SCI ne propose pas ses mouvements", () => {
    const inc = { id: 7, logRef: 'T2', creeLe: '2026-10-13' }
    const mv = [{ id: 1, qui: 'T2', db: 100, date: '2026-10-14' }, { id: 2, qui: 'T2', db: 100, date: '2026-10-14', _espaceId: 'B' }]
    expect(mouvementsRattachables(mv, inc, { espaceId: null }).map((m) => m.id)).toEqual([1])
    expect(mouvementsRattachables(mv, inc, { espaceId: 'B' }).map((m) => m.id)).toEqual([2])
    expect(mouvementsRattachables(mv, inc).map((m) => m.id).sort()).toEqual([1, 2])
  })
})

describe('S-8 · renommer un bien ou un immeuble : le registre suit (relecture I4)', () => {
  it('logement : incidents (logRef) et pièces de leur dossier ; immeuble : parties communes (imm)', () => {
    const db = { logements: [{ ref: 'T2', imm: 'Tilleuls' }], baux: {}, incidents: [{ id: 1, logRef: 'T2', imm: 'Tilleuls' }, { id: 2, logRef: '', imm: 'Tilleuls' }],
      documents: [{ id: 9, parentType: 'incident', parentId: 1, logRef: 'T2' }] }
    renameLogementRef(db, 'T2', 'T2 bis', { stamp: (x) => x })
    expect(db.incidents[0].logRef).toBe('T2 bis')
    expect(db.documents[0].logRef).toBe('T2 bis')
    renameImmeubleRefs(db, 'Tilleuls', 'Les Tilleuls', { stamp: (x) => x })
    expect(db.incidents.map((i) => i.imm)).toEqual(['Les Tilleuls', 'Les Tilleuls'])
  })
})
