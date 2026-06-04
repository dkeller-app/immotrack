import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, deleteUserByEmail } from './helpers/clients.mjs'

const A = { email: 'p0a-alice@example.test', pass: 'Test-Passw0rd!A' }
const B = { email: 'p0a-bob@example.test',   pass: 'Test-Passw0rd!B' }
// Carol = propriétaire en gestion déléguée (rôle 'proprietaire', D13) dans l'espace d'Alice.
const C = { email: 'p0a-carol@example.test', pass: 'Test-Passw0rd!C' }

let clientA, clientB, clientC
let espaceA, espaceB        // ids
let memberA_id              // id de la ligne membership owner d'Alice
let carolId                 // user_id de Carol

beforeAll(async () => {
  await createUser(A.email, A.pass)
  await createUser(B.email, B.pass)
  const carol = await createUser(C.email, C.pass)
  carolId = carol.id
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  clientC = await userClient(C.email, C.pass)

  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Patrimoine Alice' })
  if (e1) throw e1
  espaceA = ea.id
  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Patrimoine Bob' })
  if (e2) throw e2
  espaceB = eb.id

  const { data: mem } = await clientA.from('espace_members').select('id').eq('espace_id', espaceA).single()
  memberA_id = mem.id

  // Alice (owner) invite Carol comme 'proprietaire' actif dans SON espace (members_insert exige owner → OK).
  const { error: e3 } = await clientA.from('espace_members')
    .insert({ espace_id: espaceA, user_id: carolId, role: 'proprietaire', invite_status: 'active' })
  if (e3) throw e3
})

afterAll(async () => {
  await deleteUserByEmail(A.email)  // cascade espaces/members via FK
  await deleteUserByEmail(B.email)
  await deleteUserByEmail(C.email)
})

describe('lecture isolée', () => {
  it('Alice voit son espace', async () => {
    const { data } = await clientA.from('espaces').select('*').eq('id', espaceA)
    expect(data).toHaveLength(1)
  })
  it('Bob ne voit PAS l\'espace d\'Alice', async () => {
    const { data } = await clientB.from('espaces').select('*').eq('id', espaceA)
    expect(data).toHaveLength(0)   // RLS filtre, pas d'erreur : juste 0 ligne
  })
  it('Bob ne voit PAS les membres de l\'espace d\'Alice', async () => {
    const { data } = await clientB.from('espace_members').select('*').eq('espace_id', espaceA)
    expect(data).toHaveLength(0)
  })
  it('un SELECT large ne fuit que ses propres espaces', async () => {
    const { data } = await clientB.from('espaces').select('id')
    expect(data.map(r => r.id)).toEqual([espaceB])
  })
})

describe('écriture isolée', () => {
  it('Bob ne peut pas modifier l\'espace d\'Alice', async () => {
    const { data, error } = await clientB.from('espaces').update({ nom: 'piraté' }).eq('id', espaceA).select()
    expect(error).toBeNull()        // pas d'erreur SQL...
    expect(data).toHaveLength(0)    // ...mais 0 ligne touchée (RLS)
    const { data: check } = await clientA.from('espaces').select('nom').eq('id', espaceA).single()
    expect(check.nom).toBe('Patrimoine Alice')   // intact
  })
  it('Bob ne peut pas supprimer l\'espace d\'Alice', async () => {
    const { data } = await clientB.from('espaces').delete().eq('id', espaceA).select()
    expect(data).toHaveLength(0)
    const { data: check } = await clientA.from('espaces').select('id').eq('id', espaceA)
    expect(check).toHaveLength(1)   // toujours là
  })
  it('Bob ne peut pas s\'inviter dans l\'espace d\'Alice', async () => {
    const { error } = await clientB.from('espace_members')
      .insert({ espace_id: espaceA, user_id: (await clientB.auth.getUser()).data.user.id, role: 'owner', invite_status: 'active' })
    expect(error).not.toBeNull()    // with check de members_insert refuse → erreur RLS
  })
})

describe('rôle proprietaire (gestion déléguée, D13)', () => {
  it('Carol (proprietaire) VOIT l\'espace dont elle est membre', async () => {
    const { data } = await clientC.from('espaces').select('*').eq('id', espaceA)
    expect(data).toHaveLength(1)   // consultation : EDL/docs/quittances/baux suivront en P0-B
  })
  it('Carol ne voit QUE son espace (pas celui de Bob)', async () => {
    const { data } = await clientC.from('espaces').select('id')
    expect(data.map(r => r.id)).toEqual([espaceA])
  })
  it('Carol ne peut PAS modifier l\'espace (lecture seule)', async () => {
    const { data } = await clientC.from('espaces').update({ nom: 'renommé' }).eq('id', espaceA).select()
    expect(data).toHaveLength(0)   // pas owner/gestionnaire → 0 ligne touchée
    const { data: check } = await clientA.from('espaces').select('nom').eq('id', espaceA).single()
    expect(check.nom).toBe('Patrimoine Alice')
  })
  it('Carol ne peut PAS gérer les membres (inviter quelqu\'un)', async () => {
    const { error } = await clientC.from('espace_members')
      .insert({ espace_id: espaceA, invite_email: 'x@example.test', role: 'lecture_seule', invite_status: 'pending' })
    expect(error).not.toBeNull()   // members_insert exige owner → refus RLS
  })
})

describe('anti auto-escalade & dernier owner', () => {
  it('Alice ne peut pas changer son propre rôle', async () => {
    const { data } = await clientA.from('espace_members')
      .update({ role: 'lecture_seule' }).eq('id', memberA_id).select()
    expect(data).toHaveLength(0)    // members_update exclut sa propre ligne → 0 ligne
  })
  it('on ne peut pas supprimer le dernier owner (via service-role, bypass RLS)', async () => {
    // Le trigger protège même hors RLS : on tente en service-role pour isoler le trigger.
    const { adminClient } = await import('./helpers/clients.mjs')
    const admin = adminClient()
    const { error } = await admin.from('espace_members').delete().eq('id', memberA_id)
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/LAST_OWNER_PROTECTED/)
  })
})
