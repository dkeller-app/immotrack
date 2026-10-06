// Perf — resolveEspaces() réutilisait un 2e getUser() (aller-retour réseau) juste après celui du démarrage.
// Il réutilise désormais l'utilisateur VALIDÉ il y a < 15 s, mais SEULEMENT si la session locale active est bien
// la sienne (jamais le compte d'un autre après déconnexion / changement de compte).
import { describe, it, expect } from 'vitest'
import { createBoot } from '../../js/app/supabase-boot.js'

function fakeClient({ sessionUserId = 'u1', userId = 'u1' } = {}) {
  const calls = { getUser: 0, getSession: 0, from: [] }
  const rows = {
    espace_members: { data: [{ espace_id: 'e1', full_espace: true }], error: null },
    espaces: { data: [{ id: 'e1', created_by: userId, nom: 'Mon patrimoine' }], error: null },
  }
  const query = (table) => {
    const q = { select: () => q, eq: () => q, in: () => q, then: (ok) => ok(rows[table]) }
    return q
  }
  const client = {
    auth: {
      getUser: async () => { calls.getUser++; return { data: { user: { id: userId } }, error: null } },
      getSession: async () => { calls.getSession++; return { data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } } },
      signInWithPassword: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (t) => { calls.from.push(t); return query(t) },
    rpc: async () => ({ data: null, error: null }),
  }
  return { client, calls }
}

describe('createBoot — mémo de l’utilisateur validé pour resolveEspaces', () => {
  it('après currentUserOrError (getUser réseau), resolveEspaces ne refait PAS de getUser', async () => {
    const { client, calls } = fakeClient()
    const api = createBoot(client)
    await api.currentUserOrError()
    expect(calls.getUser).toBe(1)
    const espaces = await api.resolveEspaces()
    expect(espaces[0].espaceId).toBe('e1')
    expect(calls.getUser).toBe(1)                        // pas de 2e aller-retour
  })

  it('sans validation récente : resolveEspaces appelle getUser (comportement d’origine)', async () => {
    const { client, calls } = fakeClient()
    await createBoot(client).resolveEspaces()
    expect(calls.getUser).toBe(1)
  })

  it('après loginEmail : l’utilisateur vérifié par le serveur sert au resolveEspaces', async () => {
    const { client, calls } = fakeClient()
    const api = createBoot(client)
    await api.loginEmail('a@b.fr', 'x')
    await api.resolveEspaces()
    expect(calls.getUser).toBe(0)
  })

  it('MAUVAIS COMPTE : si la session locale active n’est plus celle du mémo, on revalide par getUser', async () => {
    const { client, calls } = fakeClient({ sessionUserId: 'autre-utilisateur' })
    const api = createBoot(client)
    await api.currentUserOrError()                       // mémo = u1
    await api.resolveEspaces()                           // session locale = « autre-utilisateur » → mémo refusé
    expect(calls.getUser).toBe(2)
  })

  it('déconnecté (pas de session locale) : le mémo est refusé aussi', async () => {
    const { client, calls } = fakeClient({ sessionUserId: null })
    const api = createBoot(client)
    await api.currentUserOrError()
    await api.resolveEspaces()
    expect(calls.getUser).toBe(2)
  })
})
