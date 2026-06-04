import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON || !SERVICE) {
  throw new Error('Variables .env manquantes (SUPABASE_URL / ANON / SERVICE_ROLE).')
}

// Client service-role : bypass RLS. Réservé au SETUP/TEARDOWN des tests (jamais une assertion d'isolation).
export function adminClient() {
  return createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Crée (ou recrée) un utilisateur de test confirmé. Retourne l'objet user.
export async function createUser(email, password) {
  const admin = adminClient()
  // idempotent : supprime un éventuel reliquat d'un run précédent
  await deleteUserByEmail(email)
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user
}

// Client authentifié AS un utilisateur réel : ses requêtes passent par la RLS.
export async function userClient(email, password) {
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

export async function deleteUserByEmail(email) {
  const admin = adminClient()
  let page = 1
  // l'API admin pagine ; on cherche l'email puis on supprime (cascade espaces via FK on delete)
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find(x => x.email === email)
    if (u) { await admin.auth.admin.deleteUser(u.id) ; return }
    if (data.users.length < 200) return
    page++
  }
}
