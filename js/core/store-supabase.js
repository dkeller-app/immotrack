// js/core/store-supabase.js — Backend Supabase du `Store` (P3).
//
// hydrate() : reconstruit l'objet `DB` LEGACY (forme exacte attendue par l'app) à partir
//   des tables Supabase, via la colonne `legacy_raw` (copie verbatim de l'enregistrement
//   d'origine posée à l'import P0-E) + `espace_config.data` (collections de config).
//   → l'app peut charger depuis Supabase sans réécrire ses lectures.
//
// Dépendances INJECTÉES (fetchTable, fetchConfig) → testable offline (mock) ET branchable
//   sur un vrai client (supabase-js ou pg) en fournissant les fetchers réels.
//   fetchTable(name) → Promise<Array<{ legacy_raw: object|null }>>
//   fetchConfig()    → Promise<object>   (espace_config.data, ou {})
//
// La direction ÉCRITURE (persist/upsert legacy→tables par ligne, concurrence `version`)
//   viendra ensuite ; ce module ne fait que l'hydratation pour l'instant.

// table Supabase → nom de collection legacy dans DB (assurances revient à `mrh`).
const ARRAY_TABLES = {
  entites: 'entites',
  logements: 'logements',
  baux_historique: 'baux_historique',
  mouvements: 'mouvements',
  quittances: 'quittances',
  edl: 'edl',
  documents: 'documents',
  assurances: 'mrh',
  agenda: 'agenda',
}
// `immeubles` n'est PAS hydratée séparément : les entités legacy contiennent déjà leur
// tableau `immeubles` imbriqué dans leur legacy_raw.

export function createSupabaseStore({ fetchTable, fetchConfig }) {
  if (typeof fetchTable !== 'function' || typeof fetchConfig !== 'function')
    throw new Error('createSupabaseStore: fetchTable et fetchConfig (fonctions) requis')

  async function hydrate() {
    const db = {}

    // collections-tableaux : legacy_raw → tableau (forme legacy exacte).
    for (const [table, coll] of Object.entries(ARRAY_TABLES)) {
      const rows = await fetchTable(table)
      db[coll] = rows.map(r => r && r.legacy_raw).filter(lr => lr != null)
    }

    // baux : MAP keyée par la clé d'origine (ref du logement), stockée dans legacy_raw.__key.
    const bauxRows = await fetchTable('baux')
    db.baux = {}
    for (const r of bauxRows) {
      const lr = r && r.legacy_raw
      if (!lr) continue
      const { __key, ...rec } = lr
      if (__key != null) db.baux[__key] = rec
    }

    // collections de config (params, categories, irlTable, templates…) depuis espace_config.
    const cfg = (await fetchConfig()) || {}
    for (const [k, v] of Object.entries(cfg)) db[k] = v

    return db
  }

  return { hydrate }
}
