// Liste ordonnée des tables métier P0-B (ordre = dépendances FK ascendantes).
// Étendue tâche par tâche ; les tests itèrent dessus.
export const BUSINESS_TABLES = [
  'entites',
  'immeubles',
]

// Sème une chaîne métier complète DANS un espace donné, via un client authentifié
// (owner/gestionnaire de l'espace → autorisé par la RLS). Renvoie les ids créés.
// Étendue tâche par tâche au fil de l'ajout des tables.
export async function seedChain(client, espaceId) {
  const tag = espaceId.slice(0, 8)
  const ids = {}
  const ins = async (table, row) => {
    const { data, error } = await client.from(table)
      .insert({ espace_id: espaceId, ...row }).select('id').single()
    if (error) throw new Error(`seed ${table}: ${error.message}`)
    return data.id
  }
  ids.entite   = await ins('entites',   { nom: `Entité ${tag}` })
  ids.immeuble = await ins('immeubles', { entite_id: ids.entite, nom: `Imm ${tag}` })
  return ids
}
