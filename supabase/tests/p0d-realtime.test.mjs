import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p0d-rt-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `p0d-rt-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }

let clientA, clientB, espaceA, espaceB

// Tente de s'abonner à un canal privé. Renvoie 'SUBSCRIBED' dès que l'abonnement aboutit,
// sinon 'DENIED' après le timeout. On N'abandonne PAS au premier CHANNEL_ERROR : sur une
// connexion websocket froide (1er abonnement de la suite), un CHANNEL_ERROR transitoire peut
// précéder le SUBSCRIBED ; le client retente tout seul. Un vrai refus d'autorisation, lui,
// n'atteint JAMAIS SUBSCRIBED → on conclut 'DENIED' au timeout. Distinction déterministe.
function trySubscribe(client, topic, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const ch = client.channel(topic, { config: { private: true } })
    let resolved = false
    const finish = (status) => { if (resolved) return; resolved = true; try { client.removeChannel(ch) } catch {} ; resolve(status) }
    const t = setTimeout(() => finish('DENIED'), timeoutMs)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(t); finish('SUBSCRIBED') }
      // CHANNEL_ERROR / TIMED_OUT : transitoires possibles → on attend (retries) ; le timeout tranche.
    })
  })
}

beforeAll(async () => {
  await createUser(A.email, A.pass)
  await createUser(B.email, B.pass)
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  // s'assurer que Realtime utilise bien le JWT de l'utilisateur (auth.uid() pour is_member).
  const { data: sa } = await clientA.auth.getSession()
  const { data: sb } = await clientB.auth.getSession()
  clientA.realtime.setAuth(sa.session.access_token)
  clientB.realtime.setAuth(sb.session.access_token)
  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P0D-RT' })
  if (e1) throw e1; espaceA = ea.id
  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Espace Bob P0D-RT' })
  if (e2) throw e2; espaceB = eb.id
})

afterAll(async () => {
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(B.email, [espaceB])
})

describe('P0-D — isolation Realtime par espace (canaux privés)', () => {
  it('Alice PEUT s\'abonner au canal privé de SON espace', async () => {
    const status = await trySubscribe(clientA, `espace:${espaceA}`)
    expect(status).toBe('SUBSCRIBED')
  }, 15000)

  it('Bob NE PEUT PAS s\'abonner au canal privé de l\'espace d\'Alice', async () => {
    const status = await trySubscribe(clientB, `espace:${espaceA}`)
    expect(status).toBe('DENIED')                    // n'atteint jamais SUBSCRIBED → refus RLS
  }, 20000)

  it('Bob PEUT s\'abonner au canal privé de SON espace (non-régression)', async () => {
    const status = await trySubscribe(clientB, `espace:${espaceB}`)
    expect(status).toBe('SUBSCRIBED')
  }, 15000)
})
