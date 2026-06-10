// js/core/store-supabase-adapter.js — Binding supabase-js du Store Supabase.
// Fournit { fetchTable, fetchConfig, writer } à createSupabaseStore(...), branché sur un
// client supabase-js (l'app authentifiée, ou service_role en test).
//
// ⚠️ Implémente VERBATIM le contrat de concurrence de store-supabase.js (sinon réintroduit
//    la perte silencieuse / la résurrection que l'audit a fait corriger) :
//    - fetchTable EXCLUT les soft-deleted (deleted_at IS NULL) et PAGINE (PostgREST plafonne à
//      1000 lignes/requête → une table volumineuse serait tronquée silencieusement sinon).
//    - insert     = upsert ON CONFLICT (id) DO NOTHING → version si inséré, null si CONFLIT.
//                   « Conflit » = id déjà pris OU violation d'un AUTRE index unique (ex. quittances
//                   (logement,mois)) : tout 23505 → null (FAIL-CLOSED, jamais d'écrasement ni de
//                   throw d'un conflit attendu ; l'app re-hydrate puis résout).
//    - update     = WHERE id=? AND version=? AND deleted_at IS NULL → version (post-trigger) si
//                   1 ligne, null sinon (version périmée OU tombstone → pas de résurrection).
//                   Ne réécrit JAMAIS id / version / created_by / legacy_id (provenance immuable).
//    - softDelete = WHERE id=? AND version=? AND deleted_at IS NULL → version si 1 ligne, null sinon
//                   (idempotent : un 2e soft-delete n'écrase pas l'horodatage de suppression).
//    (touch_row bumpe version à chaque UPDATE → la version renvoyée est la NOUVELLE.)

const PAGE_DEFAULT = 1000   // limite PostgREST par défaut

export function createSupabaseAdapter(client, espaceId, opts = {}) {
  const pageSize = opts.pageSize || PAGE_DEFAULT

  // Lecture paginée : boucle .range() jusqu'à une page incomplète (anti-troncature silencieuse).
  async function fetchTable(name) {
    const out = []
    for (let off = 0; ; off += pageSize) {
      const { data, error } = await client.from(name)
        .select('id, version, legacy_raw').eq('espace_id', espaceId).is('deleted_at', null)
        .order('id', { ascending: true }).range(off, off + pageSize - 1)
      if (error) throw new Error('fetchTable ' + name + ': ' + error.message)
      if (!data || data.length === 0) break
      out.push(...data)
      if (data.length < pageSize) break
    }
    return out
  }

  async function fetchConfig() {
    const { data, error } = await client.from('espace_config')
      .select('data').eq('espace_id', espaceId).maybeSingle()
    if (error) throw new Error('fetchConfig: ' + error.message)
    return (data && data.data) || {}
  }

  const writer = {
    // ON CONFLICT (id) DO NOTHING. Tout conflit unique (id OU autre index) → null (jamais d'écrasement).
    async insert(table, row) {
      const { data, error } = await client.from(table)
        .upsert(row, { onConflict: 'id', ignoreDuplicates: true }).select('version')
      if (error) {
        if (error.code === '23505') return null   // unique_violation (id OU 2e index) = CONFLIT attendu → fail-closed
        throw new Error('insert ' + table + ': ' + error.message)
      }
      return data && data.length ? data[0].version : null
    },
    // UPDATE gardé par version + deleted_at IS NULL. 0 ligne → null (périmé/tombstone).
    // Ne touche jamais à la PK, la version (touch_row gère), ni la provenance (created_by/legacy_id).
    async update(table, id, row, expectedVersion) {
      const { id: _pk, version: _v, created_by: _cb, legacy_id: _lid, ...set } = row
      const { data, error } = await client.from(table)
        .update(set).eq('id', id).eq('version', expectedVersion).is('deleted_at', null).select('version')
      if (error) throw new Error('update ' + table + ': ' + error.message)
      return data && data.length ? data[0].version : null
    },
    // Soft-delete gardé par version + deleted_at IS NULL (idempotent, jamais de DELETE physique).
    async softDelete(table, id, expectedVersion) {
      const { data, error } = await client.from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id).eq('version', expectedVersion).is('deleted_at', null).select('version')
      if (error) throw new Error('softDelete ' + table + ': ' + error.message)
      return data && data.length ? data[0].version : null
    },
  }

  return { fetchTable, fetchConfig, writer }
}
