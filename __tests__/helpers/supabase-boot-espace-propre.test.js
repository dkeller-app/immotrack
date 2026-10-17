// Durcissement de l'appartenance (avant bêta) : l'espace « propre » d'un compte est celui qu'il a CRÉÉ
// (`espaces.created_by === uid`), jamais un espace où une ligne de membre plein a été posée par un tiers.
// Avant : `mine = full_espace === true` → un compte inscrit comme membre plein dans l'espace d'un autre se
// retrouvait avec DEUX espaces « propres » et le premier rendu (ordre non garanti) recevait sa config et
// ses nouveaux enregistrements.
import { describe, it, expect } from 'vitest'
import { createBoot } from '../../js/app/supabase-boot.js'

function fakeClient ({ uid = 'moi', members, espaces }) {
  const calls = { order: [] }
  const query = (table) => {
    const q = {
      select: () => q, eq: () => q, in: () => q,
      order: (col, opts) => { calls.order.push([table, col, opts && opts.ascending]); return q },
      then: (ok) => ok(table === 'espace_members' ? { data: members, error: null }
        : table === 'espaces' ? { data: espaces, error: null }
          : { data: [], error: null }),
    }
    return q
  }
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: uid } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: uid } } } }),
    },
    from: (t) => query(t),
    rpc: async () => ({ data: null, error: null }),
  }
  return { client, calls }
}

describe('resolveEspaces — espace propre = espace créé par le compte', () => {
  it('une appartenance PLEINE posée par un tiers ne rend pas son espace « propre »', async () => {
    const { client } = fakeClient({
      members: [
        { espace_id: 'e-tiers', full_espace: true },   // rendu en premier
        { espace_id: 'e-moi', full_espace: true },
      ],
      espaces: [
        { id: 'e-tiers', created_by: 'autre', nom: 'Espace du tiers', created_at: '2026-01-01T00:00:00Z' },
        { id: 'e-moi', created_by: 'moi', nom: 'Mon patrimoine', created_at: '2026-06-01T00:00:00Z' },
      ],
    })
    const list = await createBoot(client).resolveEspaces()
    const mine = list.filter(e => e.mine)
    expect(mine.map(e => e.espaceId)).toEqual(['e-moi'])
    expect(list[0].espaceId).toBe('e-moi')            // l'espace propre d'abord, quel que soit l'ordre rendu
    expect(list.find(e => e.espaceId === 'e-tiers').mine).toBe(false)
  })

  it('un espace créé par le compte mais où il n\'est plus membre plein n\'est pas « propre »', async () => {
    const { client } = fakeClient({
      members: [{ espace_id: 'e-moi', full_espace: false }],
      espaces: [{ id: 'e-moi', created_by: 'moi', nom: 'X', created_at: '2026-01-01T00:00:00Z' }],
    })
    const list = await createBoot(client).resolveEspaces()
    expect(list[0].mine).toBe(false)
  })

  it('plusieurs espaces créés par le compte : un seul « propre », le plus ancien, choix stable', async () => {
    const members = [{ espace_id: 'e-recent', full_espace: true }, { espace_id: 'e-ancien', full_espace: true }]
    const espaces = [
      { id: 'e-recent', created_by: 'moi', nom: 'B', created_at: '2026-06-01T00:00:00Z' },
      { id: 'e-ancien', created_by: 'moi', nom: 'A', created_at: '2026-01-01T00:00:00Z' },
    ]
    const a = await createBoot(fakeClient({ members, espaces }).client).resolveEspaces()
    const b = await createBoot(fakeClient({ members: [...members].reverse(), espaces: [...espaces].reverse() }).client).resolveEspaces()
    expect(a.filter(e => e.mine).map(e => e.espaceId)).toEqual(['e-ancien'])
    expect(b.filter(e => e.mine).map(e => e.espaceId)).toEqual(['e-ancien'])
  })

  it('les appartenances sont lues dans un ordre déterministe', async () => {
    const { client, calls } = fakeClient({
      members: [{ espace_id: 'e-moi', full_espace: true }],
      espaces: [{ id: 'e-moi', created_by: 'moi', nom: 'X', created_at: '2026-01-01T00:00:00Z' }],
    })
    await createBoot(client).resolveEspaces()
    expect(calls.order.some(([t]) => t === 'espace_members')).toBe(true)
  })

  it('cas nominal inchangé : un seul espace, créé par le compte → propre', async () => {
    const { client } = fakeClient({
      members: [{ espace_id: 'e1', full_espace: true }],
      espaces: [{ id: 'e1', created_by: 'moi', nom: 'Mon patrimoine', created_at: '2026-01-01T00:00:00Z' }],
    })
    const list = await createBoot(client).resolveEspaces()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ espaceId: 'e1', ownerId: 'moi', mine: true })
  })
})
