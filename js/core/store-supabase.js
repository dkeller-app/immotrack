// js/core/store-supabase.js — Backend Supabase du `Store` (P3) : hydratation + écriture.
//
// HYDRATE : reconstruit l'objet `DB` LEGACY (forme exacte) depuis les tables (`legacy_raw`)
//   + `espace_config.data`. → l'app charge depuis Supabase sans réécrire ses lectures.
// ÉCRITURE : upsert(coll, rec) / remove(coll, rec) → mapping legacy→ligne (store-mapping) +
//   INSERT/UPDATE par ligne avec CONCURRENCE OPTIMISTE par `version` (jamais de perte
//   silencieuse — un UPDATE périmé renvoie `conflict`, à l'app de re-hydrater).
//
// Dépendances INJECTÉES → testable offline ET branchable sur pg/supabase-js :
//   fetchTable(name) → Promise<Array<{ legacy_raw, id?, version? }>>
//     ⚠️ DOIT exclure les soft-deleted (deleted_at IS NOT NULL).
//   fetchConfig()    → Promise<object>   (espace_config.data, ou {})
//   writer = { insert(table,row)→newVer|null, update(table,id,row,expVer)→newVer|null,
//              softDelete(table,id,expVer)→newVer|null }   (null = CONFLIT : id déjà présent
//              côté serveur OU version périmée).
//     ⚠️ SQL réel OBLIGATOIRE (anti-perte silencieuse, anti-résurrection, §7/D20) :
//       insert     = `INSERT … ON CONFLICT (id) DO NOTHING RETURNING version` (0 ligne→null=conflit,
//                    ne JAMAIS écraser une ligne existante → l'app re-hydrate puis UPDATE). null
//                    couvre AUSSI un conflit sur un autre index unique (ex. quittances (logement,mois)) :
//                    le binding mappe tout unique_violation 23505 → null (fail-closed, jamais un throw).
//       update     = `UPDATE … SET … WHERE id=? AND version=? AND deleted_at IS NULL RETURNING version`
//                    (0 ligne→null : version périmée OU tombstone → pas de résurrection).
//                    Ne réécrit jamais created_by / legacy_id (provenance immuable post-création).
//       softDelete = `UPDATE … SET deleted_at=now() WHERE id=? AND version=? AND deleted_at IS NULL RETURNING version`.
//     NB (audit Minor) : un insert→null peut signaler une ligne TOMBSTONE (soft-deleted, donc
//       exclue de fetchTable / absente de _versions) occupant déjà l'id déterministe (ex. ref
//       recréée) → conflit FAIL-CLOSED (jamais d'écrasement ni de résurrection). Le caller P3
//       résout (un-delete ou fetch version), ce n'est pas un défaut de sécurité de ce module.
//   detUuid(...parts), espaceId, ownerId : ctx du mapping (cf. store-mapping.js).
//
// ⚠️ Collections portées par la CONFIG (espace_config), pas par une table : en plus de la
//   vraie config (params/categories/irlTable/templates/nid/flags), `assurances` (≠ `mrh`),
//   `candidats`, `auditTrail`, `compteursReleves`. NE PAS les ajouter à ARRAY_TABLES.
import { mapToRow } from './store-mapping.js'

const ARRAY_TABLES = {
  entites: 'entites', logements: 'logements', baux_historique: 'baux_historique',
  mouvements: 'mouvements', quittances: 'quittances', edl: 'edl', documents: 'documents',
  assurances: 'mrh', agenda: 'agenda',
}
const norm = s => String(s == null ? '' : s).trim().toLowerCase()
// collection legacy → table Supabase (mrh = la table assurances ; sinon identique).
const tableOf = coll => (coll === 'mrh' ? 'assurances' : coll)

// collections legacy adossées à une TABLE (à NE PAS remettre dans le blob config espace_config).
// SOURCE UNIQUE : store-sync importe ce set pour son exclusion config (anti-drift, cf. test d'égalité).
export const TABLE_COLLECTIONS = new Set([...Object.values(ARRAY_TABLES), 'baux', 'immeubles'])
// + `_modifiedAt` (horodatage interne, changerait à chaque save → churn config inutile). Aligné ETL.
const CONFIG_EXCLUDED = new Set([...TABLE_COLLECTIONS, '_modifiedAt'])
// 🔐 Params LOCAL-USER : par-appareil, JAMAIS synchronisés dans espace_config (lue par tout membre via
// is_member → un membre scopé lirait le SECRET `bailSignAppKey`). Symétrique du strip Drive `_buildGlobalPayload`.
// Ces clés sont gardées en localStorage côté app et restaurées après hydrate (cf __immoSetDB).
export const LOCAL_USER_PARAM_KEYS = ['coGestionnaires', 'imRootFolderId', 'edlDriveFolderId', 'bailSignRelayUrl', 'bailSignAppKey']
const stripLocalUserParams = cfg => {
  if (cfg && cfg.params && typeof cfg.params === 'object') {
    const p = {}
    for (const [k, v] of Object.entries(cfg.params)) if (!LOCAL_USER_PARAM_KEYS.includes(k)) p[k] = v
    cfg.params = p   // nouvel objet : ne mute PAS le DB.params vivant
  }
  return cfg
}
// extrait le sous-ensemble CONFIG (complément des tables) → ce qui va dans espace_config.data.
const extractConfig = db => {
  const out = {}
  for (const [k, v] of Object.entries(db || {})) if (!CONFIG_EXCLUDED.has(k)) out[k] = v
  return stripLocalUserParams(out)
}

export function createSupabaseStore({ fetchTable, fetchConfig, writer, writeConfig, detUuid, espaceId, ownerId }) {
  if (typeof fetchTable !== 'function' || typeof fetchConfig !== 'function')
    throw new Error('createSupabaseStore: fetchTable et fetchConfig (fonctions) requis')

  let _db = null
  const _versions = new Map()   // uuid de ligne → version courante (concurrence optimiste)
  const captureVersions = rows => { for (const r of rows) if (r && r.id != null && r.version != null) _versions.set(r.id, r.version) }

  async function hydrate() {
    const db = {}
    for (const [table, coll] of Object.entries(ARRAY_TABLES)) {
      const rows = await fetchTable(table)
      db[coll] = rows.map(r => r && r.legacy_raw).filter(lr => lr != null)
      captureVersions(rows)
    }
    const bauxRows = await fetchTable('baux')
    db.baux = {}
    for (const r of bauxRows) { const lr = r && r.legacy_raw; if (!lr) continue; const { __key, ...rec } = lr; if (__key != null) db.baux[__key] = rec }
    captureVersions(bauxRows)
    captureVersions(await fetchTable('immeubles'))   // versions seules (collection re-imbriquée dans entites)

    // config (+ collections non-tablées) ; GARDE : ne JAMAIS écraser une collection métier.
    const cfg = (await fetchConfig()) || {}
    for (const [k, v] of Object.entries(cfg)) {
      if (TABLE_COLLECTIONS.has(k)) { console.warn('[SupabaseStore] clé config ignorée (collision collection métier) : ' + k); continue }
      db[k] = v
    }
    _db = db
    return db
  }

  function attach(db) { _db = db; return db }

  // resolvers FK construits depuis le DB EN MÉMOIRE courant (reflète les ajouts récents).
  // INCLUT les tombstones À DESSEIN : lors d'une suppression EN CASCADE (parent + enfants
  // tombstonés ensemble par l'app), le `remove` de l'enfant doit pouvoir résoudre le parent pour
  // que `mapToRow` calcule le `row.id` de l'enfant et émette le softDelete. Exclure les tombstones
  // ferait renvoyer null à mapToRow → remove `skipped` → SUPPRESSION PERDUE (enfant resté vivant
  // côté serveur). L'anti-résurrection à l'UPDATE est déjà garantie par le garde `deleted_at IS NULL`.
  function buildResolvers() {
    const db = _db || {}
    const entiteByNom = new Map(), immeubleByNom = new Map(), logementByRef = new Map(), documentByLegacy = new Map()
    for (const e of (db.entites || [])) {
      if (e && e.nom) entiteByNom.set(norm(e.nom), detUuid('entite', norm(e.nom)))
      for (const im of (Array.isArray(e && e.immeubles) ? e.immeubles : [])) if (im && im.nom) immeubleByNom.set(norm(im.nom), detUuid('immeuble', norm(im.nom)))
    }
    for (const l of (db.logements || [])) if (l && l.ref) logementByRef.set(norm(l.ref), detUuid('logement', norm(l.ref)))
    for (const d of (db.documents || [])) if (d && d.id != null) documentByLegacy.set(String(d.id), detUuid('document', String(d.id)))
    return { entiteByNom, immeubleByNom, logementByRef, documentByLegacy }
  }
  const ctx = () => ({ espaceId, ownerId, detUuid, ...buildResolvers() })

  // upsert : INSERT si ligne inconnue, sinon UPDATE gardé par la version trackée.
  // Renvoie { status: 'inserted'|'updated'|'conflict'|'skipped', id?, version? }.
  async function upsert(legacyColl, rec) {
    const table = tableOf(legacyColl)
    const row = mapToRow(table, rec, ctx())
    if (!row) return { status: 'skipped' }
    if (_versions.has(row.id)) {
      const nv = await writer.update(table, row.id, row, _versions.get(row.id))
      if (nv == null) return { status: 'conflict', id: row.id }   // version périmée → l'app re-hydrate
      _versions.set(row.id, nv)
      return { status: 'updated', id: row.id, version: nv }
    }
    // INSERT fail-closed : si l'id existe déjà côté serveur (ligne non trackée — mouvements
    // paginés, gap Realtime, autre onglet), writer.insert renvoie null → CONFLIT (jamais
    // d'écrasement silencieux ni de LWW). L'app re-hydrate → la ligne sera alors trackée → UPDATE.
    const nv = await writer.insert(table, row)
    if (nv == null) return { status: 'conflict', id: row.id }
    _versions.set(row.id, nv)
    return { status: 'inserted', id: row.id, version: nv }
  }

  // remove : soft-delete gardé par version (jamais de DELETE physique). Opération DESTRUCTIVE
  // → on REFUSE si la version est inconnue (ligne non hydratée) plutôt que de deviner.
  async function remove(legacyColl, rec) {
    const table = tableOf(legacyColl)
    const row = mapToRow(table, rec, ctx())
    if (!row) return { status: 'skipped' }
    if (!_versions.has(row.id)) return { status: 'conflict', id: row.id }   // version inconnue → re-hydrater d'abord
    const nv = await writer.softDelete(table, row.id, _versions.get(row.id))
    if (nv == null) return { status: 'conflict', id: row.id }
    _versions.set(row.id, nv)
    return { status: 'deleted', id: row.id, version: nv }
  }

  // persistConfig : écrit le sous-ensemble CONFIG (complément des tables) dans espace_config.data.
  // Un seul blob jsonb par espace (pas de concurrence par ligne — l'espace_config a sa propre version
  // côté table mais le contenu est remplacé en entier). Faible volume, faible fréquence de conflit.
  async function persistConfig(db = _db) {
    if (typeof writeConfig !== 'function') throw new Error('persistConfig: writeConfig (binding) requis')
    await writeConfig(extractConfig(db || {}))
    return { status: 'config-written' }
  }

  return { hydrate, attach, upsert, remove, persistConfig, buildResolvers }
}
