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

describe('P0-C1 — résiliation via baux_evenements : le signé n\'est PAS muté', () => {
  it('un événement « resiliation » se crée sans toucher la ligne signée verrouillée', async () => {
    // idsA.bail est verrouillé (bloc baux). On capture son état AVANT, on crée l'événement,
    // on relit APRÈS : version + updated_at + locked inchangés.
    const before = await clientA.from('baux')
      .select('version, updated_at, signed_at, locked').eq('id', idsA.bail).single()

    const { error: evErr } = await clientA.from('baux_evenements').insert({
      espace_id: espaceA, bail_id: idsA.bail, type_evenement: 'resiliation',
      date_evenement: '2026-06-30', motif: 'Congé locataire',
    })
    expect(evErr).toBeNull()   // INSERT d'un enfant N'EST PAS bloqué par le trigger du signé

    const after = await clientA.from('baux')
      .select('version, updated_at, signed_at, locked').eq('id', idsA.bail).single()
    expect(after.data.version).toBe(before.data.version)         // pas de bump → pas d'UPDATE
    expect(after.data.updated_at).toBe(before.data.updated_at)
    expect(after.data.locked).toBe(true)

    // état « résilié » = dérivé de la présence d'un événement resiliation.
    const { data: evs } = await clientA.from('baux_evenements')
      .select('id').eq('bail_id', idsA.bail).eq('type_evenement', 'resiliation')
    expect(evs.length).toBeGreaterThanOrEqual(1)
  })

  it('on ne peut PAS supprimer un bail qui porte des événements (ON DELETE RESTRICT)', async () => {
    // Bail non verrouillé pour isoler la FK (le trigger lèverait sinon en premier).
    const lg = await clientA.from('logements').insert({
      espace_id: espaceA, ref: `LEV-${RUN}`, entite_id: idsA.entite, immeuble_id: idsA.immeuble,
    }).select('id').single()
    const b = await clientA.from('baux').insert({
      espace_id: espaceA, logement_id: lg.data.id, type_bail: 'nu', hc: 700,
    }).select('id').single()
    await clientA.from('baux_evenements').insert({
      espace_id: espaceA, bail_id: b.data.id, type_evenement: 'conge', date_evenement: '2026-07-01',
    })
    const { error } = await clientA.from('baux').delete().eq('id', b.data.id).select()
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/violates foreign key|baux_evenements_bail_fk/i)
  })
})

describe('P0-C1 — invariants transverses (§9 l.180-184)', () => {
  it('le trigger ne s\'applique QU\'à la ligne signée : INSERT de quittance/mouvement OK', async () => {
    // idsA.logement porte idsA.bail (verrouillé). Créer un enfant qui le référence doit PASSER.
    const { error: qErr } = await clientA.from('quittances').insert({
      espace_id: espaceA, logement_id: idsA.logement, entite_id: idsA.entite,
      mois: '2026-09', hc: 700, ch: 100,
    })
    expect(qErr).toBeNull()
    const { error: mErr } = await clientA.from('mouvements').insert({
      espace_id: espaceA, date_mouvement: '2026-09-05', libelle: 'Loyer sept',
      logement_id: idsA.logement, categorie: 'loyer', credit: 800,
    })
    expect(mErr).toBeNull()
  })

  it('pas de hard-delete d\'un logement portant un bail signé (FK parent NO ACTION)', async () => {
    // idsA.logement est référencé par idsA.bail (verrouillé) → suppression refusée.
    const { error } = await clientA.from('logements').delete().eq('id', idsA.logement).select()
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/violates foreign key/i)
  })

  it('échappatoire admin : avec app.bypass_immutable=on, un UPDATE du signé passe (import P0-E)', async () => {
    // Prouve (a) que le verrou est levable par une session DB privilégiée (idempotence import,
    // §9 l.284) et (b) que SANS le GUC, même le service_role est bloqué (triggers non bypassés).
    const admin = adminClient()
    const { error: blocked } = await admin.from('baux').update({ notes: 'x' }).eq('id', idsA.bail).select()
    expect(blocked).not.toBeNull()                         // service_role SANS GUC → bloqué
    expect(blocked.message).toMatch(/ROW_LOCKED_IMMUTABLE/)

    const pg = (await import('pg')).default
    const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
    await c.connect()
    try {
      await c.query('begin')
      await c.query(`set local app.bypass_immutable = 'on'`)
      const r = await c.query(`update public.baux set notes = 'import-ok' where id = $1`, [idsA.bail])
      expect(r.rowCount).toBe(1)                            // AVEC GUC → autorisé
      await c.query('commit')
    } finally { await c.end() }
  })
})
