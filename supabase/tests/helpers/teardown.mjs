// Démontage de test propre, fondé sur la primitive serveur purge_espace (0023).
// Remplace l'ancienne approche (qui laissait espaces/users orphelins : espaces.created_by
// NO ACTION + protect_last_owner). NE touche pas clients.mjs.
import { adminClient, deleteUserByEmail } from './clients.mjs'

// Supprime intégralement un espace (membres + données métier, y compris signé) via la
// primitive serveur, en service_role.
export async function teardownEspace(espaceId) {
  if (!espaceId) return
  const { error } = await adminClient().rpc('purge_espace', { p_espace_id: espaceId })
  if (error) throw new Error(`purge_espace(${espaceId}): ${error.message}`)
}

// Démontage complet d'un propriétaire de test : purge ses espaces puis supprime l'utilisateur.
export async function teardownOwner(email, espaceIds = []) {
  for (const id of espaceIds) await teardownEspace(id)
  await deleteUserByEmail(email)
}
