import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, deleteUserByEmail } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

// ════════════════════════════════════════════════════════════════════════════
// P1 — INVITATIONS (migration 0032). Flux : Alice (manager plein) crée une invitation avec des
// grants par périmètre {entite_id, mode} → Bob ouvre le token → accept_invitation → membre SCOPÉ
// avec EXACTEMENT ces octrois (mode→rôle). Anti-escalade : seul un manager crée ; l'invité ne passe
// QUE le token (pas de grants forgés) ; révoquée/expirée/déjà-utilisée refusées ; grants validés.
// ════════════════════════════════════════════════════════════════════════════

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p1inv-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }  // owner plein
const B = { email: `p1inv-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }  // invité
const C = { email: `p1inv-carol-${RUN}@example.test`, pass: 'Test-Passw0rd!C' }  // tiers + autre espace

let clientA, clientB, clientC, bobId
let espaceA, entA, entB, logA, logB
let otherEspace, otherEnt

beforeAll(async () => {
  await createUser(A.email, A.pass)
  const bob = await createUser(B.email, B.pass); bobId = bob.id
  await createUser(C.email, C.pass)
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  clientC = await userClient(C.email, C.pass)

  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: `Inv-${RUN}` })
  if (e1) throw e1; espaceA = ea.id
  const ins = async (table, row) => {
    const { data, error } = await clientA.from(table).insert({ espace_id: espaceA, ...row }).select('id').single()
    if (error) throw new Error(`${table}: ${error.message}`); return data.id
  }
  entA = await ins('entites', { nom: `SCI-A-${RUN}` })
  entB = await ins('entites', { nom: `SCI-B-${RUN}` })
  logA = await ins('logements', { entite_id: entA, ref: `LA-${RUN}`, type: 'appartement', surface: 40 })
  logB = await ins('logements', { entite_id: entB, ref: `LB-${RUN}`, type: 'appartement', surface: 50 })

  // Espace SÉPARÉ (de Carol) → tester que les grants ne peuvent pas viser une entité d'un autre tenant.
  const { data: eo, error: e2 } = await clientC.rpc('create_espace', { p_nom: `Other-${RUN}` })
  if (e2) throw e2; otherEspace = eo.id
  const { data: oe, error: e3 } = await clientC.from('entites')
    .insert({ espace_id: otherEspace, nom: `Other-${RUN}` }).select('id').single()
  if (e3) throw e3; otherEnt = oe.id
})

afterAll(async () => {
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(C.email, [otherEspace])
  await deleteUserByEmail(B.email)
})

async function createInvite(grants, opts = {}) {
  const { data, error } = await clientA.from('invitations')
    .insert({ espace_id: espaceA, grants, ...opts }).select('token, id').single()
  if (error) throw new Error(`createInvite: ${error.message}`)
  return data
}

describe('P1-INV — création (RLS manager) + validation des grants', () => {
  it('Alice (manager plein) crée une invitation', async () => {
    const inv = await createInvite([{ entite_id: entA, mode: 'ecriture' }])
    expect(inv.token).toBeTruthy()
  })
  it('Bob (non-membre) ne peut PAS créer d\'invitation', async () => {
    // Double blocage : (1) RLS insert exige is_full_manager(espaceA) = faux ; (2) le trigger de
    // validation tourne dans le contexte de Bob qui ne VOIT pas entA (non-membre) → l'entité paraît
    // « hors espace ». Les deux refusent → on vérifie le REFUS, quel que soit le chemin/message.
    const { error } = await clientB.from('invitations')
      .insert({ espace_id: espaceA, grants: [{ entite_id: entA, mode: 'ecriture' }] })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates|GRANT_ENTITE_NOT_IN_ESPACE/i)
  })
  it('grants vide refusé', async () => {
    const { error } = await clientA.from('invitations').insert({ espace_id: espaceA, grants: [] })
    expect(error?.message).toMatch(/GRANTS_EMPTY/)
  })
  it('mode invalide refusé', async () => {
    const { error } = await clientA.from('invitations')
      .insert({ espace_id: espaceA, grants: [{ entite_id: entA, mode: 'admin' }] })
    expect(error?.message).toMatch(/GRANT_MODE_INVALID/)
  })
  it('entité d\'un AUTRE espace refusée (anti cross-tenant)', async () => {
    const { error } = await clientA.from('invitations')
      .insert({ espace_id: espaceA, grants: [{ entite_id: otherEnt, mode: 'ecriture' }] })
    expect(error?.message).toMatch(/GRANT_ENTITE_NOT_IN_ESPACE/)
  })
  it('un membre PLEIN qui accepte → ALREADY_FULL_MEMBER, et n\'est PAS dégradé en scopé', async () => {
    const inv = await createInvite([{ entite_id: entA, mode: 'lecture' }])
    const { error } = await clientA.rpc('accept_invitation', { p_token: inv.token })
    expect(error?.message).toMatch(/ALREADY_FULL_MEMBER/)
    // preuve qu'Alice reste PLEINE : elle écrit toujours SCI-B (qu'aucun grant ne couvrait)
    const { data, error: e2 } = await clientA.from('logements').update({ surface: 52 }).eq('id', logB).select('id')
    expect(e2).toBeNull()
    expect(data.map(r => r.id)).toEqual([logB])
  })
})

describe('P1-INV — acceptation crée EXACTEMENT les octrois (mode→rôle)', () => {
  let token
  beforeAll(async () => {
    const inv = await createInvite([
      { entite_id: entA, mode: 'ecriture' },
      { entite_id: entB, mode: 'lecture' },
    ])
    token = inv.token
  })
  it('preview (avant accept) renvoie espace + grants enrichis', async () => {
    const { data, error } = await clientB.rpc('invitation_preview', { p_token: token })
    expect(error).toBeNull()
    expect(data.espace_nom).toContain('Inv-')
    expect(data.grants.length).toBe(2)
    expect(data.status).toBe('pending')
    expect(data.grants.map(g => g.entite_nom).every(Boolean)).toBe(true)
  })
  it('Bob accepte → membre scopé, voit SCI-A ET SCI-B', async () => {
    const { data, error } = await clientB.rpc('accept_invitation', { p_token: token })
    expect(error).toBeNull()
    expect(data).toBe(espaceA)
    const { data: ents } = await clientB.from('entites').select('id').in('id', [entA, entB])
    expect(new Set(ents.map(r => r.id))).toEqual(new Set([entA, entB]))
  })
  it('Bob ÉCRIT SCI-A (ecriture→gestionnaire)', async () => {
    const { data, error } = await clientB.from('logements').update({ surface: 41 }).eq('id', logA).select('id')
    expect(error).toBeNull()
    expect(data.map(r => r.id)).toEqual([logA])
  })
  it('Bob NE peut PAS écrire SCI-B (lecture→lecture_seule : 0 ligne)', async () => {
    const { data, error } = await clientB.from('logements').update({ surface: 51 }).eq('id', logB).select()
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
  it('Bob (scopé) ne peut PAS créer d\'invitation (is_full_manager faux)', async () => {
    const { error } = await clientB.from('invitations')
      .insert({ espace_id: espaceA, grants: [{ entite_id: entA, mode: 'ecriture' }] })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/row-level security|violates/i)
  })
  it('idempotent : Bob ré-accepte → ok, même espace', async () => {
    const { data, error } = await clientB.rpc('accept_invitation', { p_token: token })
    expect(error).toBeNull()
    expect(data).toBe(espaceA)
  })
  it('Carol ne peut PAS réutiliser le token déjà accepté', async () => {
    const { error } = await clientC.rpc('accept_invitation', { p_token: token })
    expect(error?.message).toMatch(/ALREADY_USED/)
  })
  it('ré-accept ne RÉÉCRIT PAS un rôle restreint par le manager après coup', async () => {
    // Alice abaisse Bob sur SCI-A : gestionnaire → lecture_seule
    const { error: eUpd } = await clientA.from('entite_membre')
      .update({ role: 'lecture_seule' }).eq('espace_id', espaceA).eq('entite_id', entA).eq('user_id', bobId)
    expect(eUpd).toBeNull()
    // Bob ré-accepte le vieux token (status='accepted' → court-circuit, aucun ré-octroi)
    const { error: eRe } = await clientB.rpc('accept_invitation', { p_token: token })
    expect(eRe).toBeNull()
    // la restriction TIENT : Bob ne peut plus écrire logA (0 ligne)
    const { data } = await clientB.from('logements').update({ surface: 42 }).eq('id', logA).select()
    expect(data).toEqual([])
  })
})

describe('P1-INV — refus : inconnue / révoquée / expirée', () => {
  it('token inconnu refusé', async () => {
    const { error } = await clientB.rpc('accept_invitation', { p_token: `nope-${RUN}` })
    expect(error?.message).toMatch(/INVITATION_NOT_FOUND/)
  })
  it('invitation révoquée refusée', async () => {
    const inv = await createInvite([{ entite_id: entA, mode: 'lecture' }])
    await clientA.from('invitations').update({ status: 'revoked' }).eq('id', inv.id)
    const { error } = await clientC.rpc('accept_invitation', { p_token: inv.token })
    expect(error?.message).toMatch(/INVITATION_REVOKED/)
  })
  it('invitation expirée refusée', async () => {
    const inv = await createInvite([{ entite_id: entA, mode: 'lecture' }], { expires_at: '2000-01-01T00:00:00Z' })
    const { error } = await clientC.rpc('accept_invitation', { p_token: inv.token })
    expect(error?.message).toMatch(/INVITATION_EXPIRED/)
  })
})
