// Helpers locaux P0-C1 (immutabilité du signé). NE modifie pas clients.mjs / p0b-fixtures.mjs.
// Le démontage des espaces de test passe désormais par teardown.mjs (primitive purge_espace).

// Hash factice : en P0-C1 la base ne CALCULE pas le hash, elle le stocke et le fige.
// Le vrai SHA-256 du snapshot est calculé côté client (couche app, plus tard).
export const FAKE_HASH = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'

// Verrouille un bail/edl déjà semé : passage locked false → true (autorisé par le trigger).
// signature_source obligatoire si locked (CHECK) ; content_hash obligatoire si 'immotrack'.
export async function lockRow(client, table, id, { source = 'immotrack', hash = FAKE_HASH } = {}) {
  const patch = { locked: true, signature_source: source, signed_at: new Date().toISOString() }
  if (source === 'immotrack') patch.content_hash = hash
  const { data, error } = await client.from(table).update(patch).eq('id', id).select().single()
  if (error) throw new Error(`lockRow ${table}: ${error.message}`)
  return data
}
