// _setpass.mjs — définit le mot de passe de didierkeller@gmail.com SANS email (via l'API admin).
// USAGE :  node _setpass.mjs "le-mot-de-passe-que-tu-veux"   (min 6 caractères)
// Le mot de passe est un ARGUMENT (jamais écrit dans ce fichier). La clé service_role vient de .env.
// → après usage, SUPPRIME ce fichier :  del _setpass.mjs
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const EMAIL = 'didierkeller@gmail.com'
const pass = process.argv[2]
if (!pass || pass.length < 6) {
  console.error('Usage : node _setpass.mjs "mot-de-passe-min-6-caracteres"')
  process.exit(1)
}
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let uid = null, page = 1
for (;;) {
  const { data, error } = await a.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error('listUsers:', error.message); process.exit(1) }
  const u = data.users.find(x => x.email === EMAIL)
  if (u) { uid = u.id; break }
  if (data.users.length < 200) break
  page++
}
if (!uid) { console.error('Utilisateur', EMAIL, 'introuvable'); process.exit(1) }

const { error } = await a.auth.admin.updateUserById(uid, { password: pass })
console.log(error ? '✗ ' + error.message : '✓ Mot de passe défini pour ' + EMAIL + ' (uid ' + uid + '). Tu peux te connecter avec.')
