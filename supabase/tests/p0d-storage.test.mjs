import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, adminClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p0d-st-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `p0d-st-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }
const BUCKET = 'espace-files'

let clientA, clientB, espaceA, espaceB
const pathA = () => `${espaceA}/alice-${RUN}.txt`

beforeAll(async () => {
  await createUser(A.email, A.pass)
  await createUser(B.email, B.pass)
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P0D-ST' })
  if (e1) throw e1; espaceA = ea.id
  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Espace Bob P0D-ST' })
  if (e2) throw e2; espaceB = eb.id
})

afterAll(async () => {
  // retirer les objets de test du bucket (Storage n'est pas lié aux espaces par FK).
  await adminClient().storage.from(BUCKET).remove([pathA(), `${espaceB}/bob-${RUN}.txt`]).catch(() => {})
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(B.email, [espaceB])
})

describe('P0-D — isolation Storage par espace (préfixe ancré)', () => {
  it('Alice (writer) PEUT uploader dans son préfixe espaceA/', async () => {
    const { error } = await clientA.storage.from(BUCKET).upload(pathA(), Buffer.from('contenu Alice'), {
      contentType: 'text/plain', upsert: true,
    })
    expect(error).toBeNull()
  })

  it('Bob NE VOIT PAS les fichiers du préfixe d\'Alice (list)', async () => {
    const { data, error } = await clientB.storage.from(BUCKET).list(espaceA)
    expect(error).toBeNull()
    expect(data).toEqual([])                         // RLS select : Bob non membre d'espaceA
  })

  it('Bob NE PEUT PAS télécharger un fichier du préfixe d\'Alice', async () => {
    const { data, error } = await clientB.storage.from(BUCKET).download(pathA())
    expect(data).toBeNull()                          // refus RLS → pas de contenu
    expect(error).not.toBeNull()
  })

  it('Bob NE PEUT PAS uploader dans le préfixe d\'Alice (with check has_role faux)', async () => {
    const { error } = await clientB.storage.from(BUCKET).upload(`${espaceA}/intrusion-${RUN}.txt`, Buffer.from('x'), {
      contentType: 'text/plain',
    })
    expect(error).not.toBeNull()                     // violation RLS
  })

  it('Bob PEUT uploader dans SON propre préfixe espaceB/ (non-régression)', async () => {
    const { error } = await clientB.storage.from(BUCKET).upload(`${espaceB}/bob-${RUN}.txt`, Buffer.from('contenu Bob'), {
      contentType: 'text/plain', upsert: true,
    })
    expect(error).toBeNull()
  })
})
