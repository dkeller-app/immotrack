// js/core/store-multi.js — STORE MULTI-ESPACE (vue unifiée associé abonné).
//
// Agrège N stores par-espace (1 par espace : l'espace PROPRE de l'utilisateur + les espaces TIERS où il a
// des SCI octroyées). Chaque store par-espace garde SON adapter + SON detUuid(ownerId) + SA map de versions.
//
// - hydrate() : hydrate chaque espace, FUSIONNE dans un seul DB (chaque enregistrement taggé `_espaceId`),
//   la CONFIG (params/templates/catégories…) ne vient QUE de l'espace propre (jamais celle d'un autre owner).
// - upsert/remove(coll, rec) : ROUTE vers le store de `rec._espaceId` (sinon l'espace propre = défaut D2).
//   Avant de router, on RAFRAÎCHIT la vue (résolveurs) de ce store depuis le DB vivant filtré par espace →
//   les ids déterministes sont calculés avec le BON detUuid (celui du propriétaire de l'espace cible).
// - persistConfig(db) : écrit la config UNIQUEMENT dans l'espace propre (un scopé n'écrit pas la config d'un
//   autre — la RLS le refuse de toute façon).
//
// Cas dégénéré N=1 (un seul espace) : équivaut au mono-espace actuel (1 store, pas de collision, tag inerte).
//
// Interface IDENTIQUE à createSupabaseStore (hydrate/upsert/remove/persistConfig) → branchable sur store-sync
// sans le modifier. Le tag `_espaceId` est porté par les enregistrements legacy (non synchronisé : exclu par
// le mapping qui ne lit que les champs connus ; cf. mapToRow). Décisions D1/D2/D3 : cf. spec store-multi-espace.

import { TABLE_COLLECTIONS } from './store-supabase.js'

export function createMultiStore({ espaces, makeStore, getDB }) {
  if (!Array.isArray(espaces) || !espaces.length) throw new Error('createMultiStore: espaces requis')
  const stores = espaces.map(e => ({ espaceId: e.espaceId, ownerId: e.ownerId, mine: !!e.mine, store: makeStore(e.espaceId, e.ownerId) }))
  const own = stores.find(s => s.mine) || stores[0]
  const byId = new Map(stores.map(s => [s.espaceId, s]))

  // Collections legacy keyées par OBJET (pas un tableau). `baux` = { logementRef: bail }.
  const tagArr = (arr, eid) => { if (Array.isArray(arr)) for (const it of arr) if (it && typeof it === 'object') it._espaceId = eid; return arr }

  async function hydrate() {
    const merged = {}
    const ownConfig = {}
    for (const s of stores) {
      const db = (await s.store.hydrate()) || {}
      for (const [k, v] of Object.entries(db)) {
        if (k === 'baux' && v && typeof v === 'object') {
          merged.baux = merged.baux || {}
          for (const [ref, bail] of Object.entries(v)) {
            if (bail && typeof bail === 'object') bail._espaceId = s.espaceId
            // D1 (collision de réf inter-espaces, rare) : on désambiguïse la clé du 2e espace.
            const key = (ref in merged.baux) ? ref + '@@' + s.espaceId : ref
            merged.baux[key] = bail
          }
        } else if (Array.isArray(v) && TABLE_COLLECTIONS.has(k)) {
          // collection adossée à une TABLE par-SCI (RLS-scopée) → fusionner + tagger de TOUS les espaces.
          if (k === 'entites') for (const e of v) { if (e && typeof e === 'object') { e._espaceId = s.espaceId; tagArr(e.immeubles, s.espaceId) } }
          else tagArr(v, s.espaceId)
          merged[k] = (merged[k] || []).concat(v)
        } else if (s.mine) {
          // CONFIG (params/categories/templates…) ET collections legacy portées par la config (assurances/
          // auditTrail…, des TABLEAUX mais PAS table-backées) : UNIQUEMENT l'espace propre — jamais la config
          // d'un autre owner (anti-fuite : la RLS expose espace_config à tout membre scopé, cf. volet 3).
          ownConfig[k] = v
        }
      }
    }
    Object.assign(merged, ownConfig)
    return merged
  }

  // Construit, depuis le DB vivant (fusionné), la VUE filtrée d'UN espace (records taggés cet espace) pour
  // que les résolveurs FK du store cible soient à jour (nouveaux enregistrements inclus) et corrects (bon
  // namespace). Seules les collections lues par buildResolvers comptent : entites (+ immeubles), logements,
  // documents — mais on filtre tout par sûreté.
  function _viewFor(espaceId, live) {
    const v = {}
    const L = live || {}
    for (const [k, val] of Object.entries(L)) {
      if (k === 'baux' && val && typeof val === 'object') {
        v.baux = {}
        for (const [ref, bail] of Object.entries(val)) if (bail && bail._espaceId === espaceId) v.baux[(ref.split('@@')[0])] = bail
      } else if (Array.isArray(val)) {
        v[k] = val.filter(it => it && it._espaceId === espaceId)
      }
    }
    return v
  }

  function _route(rec) {
    const s = (rec && rec._espaceId && byId.get(rec._espaceId)) || own
    // rafraîchit les résolveurs du store cible depuis le DB vivant filtré (sinon un enregistrement créé
    // après l'hydrate ne serait pas résolu, ou le serait avec le mauvais detUuid).
    try { if (typeof getDB === 'function' && typeof s.store.attach === 'function') s.store.attach(_viewFor(s.espaceId, getDB())) } catch (e) {}
    return s.store
  }

  async function upsert(coll, rec) { return _route(rec).upsert(coll, rec) }
  async function remove(coll, rec) { return _route(rec).remove(coll, rec) }
  async function persistConfig(db) { return own.store.persistConfig(db) }   // config = espace propre uniquement

  return { hydrate, upsert, remove, persistConfig, stores }
}
