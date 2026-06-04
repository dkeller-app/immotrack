import { describe, it, expect, afterAll } from 'vitest'
import { createUser, userClient, deleteUserByEmail } from './helpers/clients.mjs'

const EMAIL = 'p0a-smoke@example.test'
const PASS = 'Test-Passw0rd!smoke'

describe('connectivité projet Supabase EU', () => {
  afterAll(async () => { await deleteUserByEmail(EMAIL) })

  it('crée un user et ouvre une session authentifiée', async () => {
    const user = await createUser(EMAIL, PASS)
    expect(user.id).toBeTruthy()
    const client = await userClient(EMAIL, PASS)
    const { data } = await client.auth.getUser()
    expect(data.user.email).toBe(EMAIL)
  })
})
