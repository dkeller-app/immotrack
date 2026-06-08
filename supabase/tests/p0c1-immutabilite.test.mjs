import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, deleteUserByEmail, adminClient } from './helpers/clients.mjs'
import { seedChain } from './helpers/p0b-fixtures.mjs'
import { lockRow, FAKE_HASH, purgeLockedArtefacts } from './helpers/p0c1-fixtures.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p0c1-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }

let clientA, espaceA, idsA

beforeAll(async () => {
  await createUser(A.email, A.pass)
  clientA = await userClient(A.email, A.pass)
  const { data: ea, error } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P0C1' })
  if (error) throw error
  espaceA = ea.id
  idsA = await seedChain(clientA, espaceA)   // bail (idsA.bail) + edl (idsA.edl) non verrouillés
})

afterAll(async () => {
  // L'espace contient des lignes verrouillées → purger les artefacts signés (bypass GUC,
  // session DB privilégiée) AVANT le cascade éprouvé de deleteUserByEmail.
  await purgeLockedArtefacts([espaceA])
  await deleteUserByEmail(A.email)
})

describe('P0-C1 — verrou d\'immutabilité (baux)', () => {
  it('verrouiller un bail (locked false → true) est AUTORISÉ', async () => {
    const row = await lockRow(clientA, 'baux', idsA.bail, { source: 'immotrack', hash: FAKE_HASH })
    expect(row.locked).toBe(true)
    expect(row.signature_source).toBe('immotrack')
    expect(row.content_hash).toBe(FAKE_HASH)
  })

  it('UPDATE d\'un bail verrouillé est REFUSÉ (ROW_LOCKED_IMMUTABLE)', async () => {
    const { error } = await clientA.from('baux').update({ hc: 12345 }).eq('id', idsA.bail).select()
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/ROW_LOCKED_IMMUTABLE/)
  })

  it('DELETE d\'un bail verrouillé est REFUSÉ (ROW_LOCKED_IMMUTABLE)', async () => {
    const { error } = await clientA.from('baux').delete().eq('id', idsA.bail).select()
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/ROW_LOCKED_IMMUTABLE/)
  })

  it('un bail NON verrouillé reste modifiable (non-régression)', async () => {
    // bail courant unique par logement déjà pris (idsA.bail) → on crée un 2ᵉ bail sur un autre logement.
    const lg2 = await clientA.from('logements').insert({
      espace_id: espaceA, ref: `L2-${RUN}`, entite_id: idsA.entite, immeuble_id: idsA.immeuble,
    }).select('id').single()
    const b2 = await clientA.from('baux').insert({
      espace_id: espaceA, logement_id: lg2.data.id, type_bail: 'nu', hc: 500,
    }).select('id').single()
    const { error } = await clientA.from('baux').update({ hc: 600 }).eq('id', b2.data.id)
    expect(error).toBeNull()
  })
})

describe('P0-C1 — verrou d\'immutabilité (edl)', () => {
  it('verrouiller un EDL (locked false → true) est AUTORISÉ', async () => {
    const row = await lockRow(clientA, 'edl', idsA.edl, { source: 'immotrack', hash: FAKE_HASH })
    expect(row.locked).toBe(true)
    expect(row.content_hash).toBe(FAKE_HASH)
  })

  it('UPDATE d\'un EDL verrouillé est REFUSÉ', async () => {
    const { error } = await clientA.from('edl').update({ date_edl: '2030-01-01' }).eq('id', idsA.edl).select()
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/ROW_LOCKED_IMMUTABLE/)
  })

  it('DELETE d\'un EDL verrouillé est REFUSÉ', async () => {
    const { error } = await clientA.from('edl').delete().eq('id', idsA.edl).select()
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/ROW_LOCKED_IMMUTABLE/)
  })

  it('un EDL signé "externe" peut être verrouillé SANS content_hash', async () => {
    const lg = await clientA.from('logements').insert({
      espace_id: espaceA, ref: `LE-${RUN}`, entite_id: idsA.entite, immeuble_id: idsA.immeuble,
    }).select('id').single()
    const e2 = await clientA.from('edl').insert({
      espace_id: espaceA, type_edl: 'Entrée', logement_id: lg.data.id,
    }).select('id').single()
    const { data, error } = await clientA.from('edl')
      .update({ locked: true, signature_source: 'externe' }).eq('id', e2.data.id).select().single()
    expect(error).toBeNull()
    expect(data.locked).toBe(true)
    expect(data.content_hash).toBeNull()
  })
})

describe('P0-C1 — chaînage avenant (amends_id) : superseded dérivé, original protégé', () => {
  it('un avenant = nouveau bail amends_id → original ; original « superseded » dérivé', async () => {
    // idsA.bail est verrouillé (bloc baux). On isole la logique de chaînage sur un nouveau
    // logement : original archivé + verrouillé, puis avenant courant pointant dessus.
    const lg = await clientA.from('logements').insert({
      espace_id: espaceA, ref: `LAV-${RUN}`, entite_id: idsA.entite, immeuble_id: idsA.immeuble,
    }).select('id').single()
    const orig = await clientA.from('baux').insert({
      espace_id: espaceA, logement_id: lg.data.id, type_bail: 'nu', hc: 700, archived: true,
    }).select('id').single()
    await lockRow(clientA, 'baux', orig.data.id)   // original signé/verrouillé
    const avenant = await clientA.from('baux').insert({
      espace_id: espaceA, logement_id: lg.data.id, type_bail: 'nu', hc: 750,
      amends_id: orig.data.id,
    }).select('id, amends_id').single()
    expect(avenant.error ?? null).toBeNull()
    expect(avenant.data.amends_id).toBe(orig.data.id)

    // « superseded » = dérivé : il existe un bail dont amends_id = original.
    const { data: succ } = await clientA.from('baux')
      .select('id').eq('amends_id', orig.data.id).is('deleted_at', null)
    expect(succ.length).toBe(1)
  })

  it('on ne peut PAS supprimer un bail référencé par un avenant (ON DELETE RESTRICT)', async () => {
    // Original NON verrouillé → le DELETE est bloqué par la FK, pas par le trigger.
    const lg = await clientA.from('logements').insert({
      espace_id: espaceA, ref: `LRES-${RUN}`, entite_id: idsA.entite, immeuble_id: idsA.immeuble,
    }).select('id').single()
    const orig = await clientA.from('baux').insert({
      espace_id: espaceA, logement_id: lg.data.id, type_bail: 'nu', hc: 700, archived: true,
    }).select('id').single()
    await clientA.from('baux').insert({
      espace_id: espaceA, logement_id: lg.data.id, type_bail: 'nu', hc: 750, amends_id: orig.data.id,
    }).select('id').single()
    const { error } = await clientA.from('baux').delete().eq('id', orig.data.id).select()
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/violates foreign key|baux_amends_fk/i)
  })
})
