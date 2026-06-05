import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, deleteUserByEmail } from './helpers/clients.mjs'
import { BUSINESS_TABLES, seedChain } from './helpers/p0b-fixtures.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p0b-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `p0b-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }
const C = { email: `p0b-carol-${RUN}@example.test`, pass: 'Test-Passw0rd!C' }  // lecture_seule chez Alice

let clientA, clientB, clientC
let espaceA, espaceB
let idsA   // ids de la chaîne semée chez Alice

beforeAll(async () => {
  await createUser(A.email, A.pass)
  await createUser(B.email, B.pass)
  const carol = await createUser(C.email, C.pass)
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  clientC = await userClient(C.email, C.pass)

  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P0B' })
  if (e1) throw e1; espaceA = ea.id
  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Espace Bob P0B' })
  if (e2) throw e2; espaceB = eb.id

  // Carol = lecture_seule active dans l'espace d'Alice
  const { error: e3 } = await clientA.from('espace_members')
    .insert({ espace_id: espaceA, user_id: carol.id, role: 'lecture_seule', invite_status: 'active' })
  if (e3) throw e3

  idsA = await seedChain(clientA, espaceA)
})

afterAll(async () => {
  await deleteUserByEmail(A.email)   // cascade espace + lignes métier via espace_id ON DELETE CASCADE
  await deleteUserByEmail(B.email)
  await deleteUserByEmail(C.email)
})

describe('P0-B — lecture isolée par table', () => {
  for (const table of BUSINESS_TABLES) {
    it(`Bob ne voit AUCUNE ligne de ${table} de l'espace d'Alice`, async () => {
      const { data } = await clientB.from(table).select('id').eq('espace_id', espaceA)
      expect(data).toEqual([])
    })
    it(`Carol (lecture_seule) VOIT les lignes de ${table} de l'espace d'Alice`, async () => {
      const { data } = await clientC.from(table).select('id').eq('espace_id', espaceA)
      expect(data.length).toBeGreaterThanOrEqual(1)
    })
  }
})

describe('P0-B — écriture isolée par table', () => {
  for (const table of BUSINESS_TABLES) {
    it(`Bob ne peut pas modifier les lignes de ${table} d'Alice (0 ligne touchée)`, async () => {
      const { data, error } = await clientB.from(table)
        .update({ updated_at: new Date().toISOString() }).eq('espace_id', espaceA).select()
      expect(error).toBeNull()
      expect(data).toEqual([])
    })
    it(`Carol (lecture_seule) ne peut pas modifier ${table} (0 ligne touchée)`, async () => {
      const { data, error } = await clientC.from(table)
        .update({ updated_at: new Date().toISOString() }).eq('espace_id', espaceA).select()
      expect(error).toBeNull()
      expect(data).toEqual([])
    })
  }
})
