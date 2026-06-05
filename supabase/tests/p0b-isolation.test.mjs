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

describe('P0-B — immutabilité de espace_id (anti-kidnapping cross-tenant, SEV-1)', () => {
  it('même en service-role, on ne peut PAS déplacer une ligne vers un autre espace', async () => {
    // Le trigger freeze_espace_id (0009) s'applique même au service_role (bypassrls ne
    // contourne pas les triggers). Pour chaque table semée, tenter de réécrire espace_id
    // vers l'espace de Bob → doit lever ESPACE_ID_IMMUTABLE. Générique : couvre toutes les
    // tables de BUSINESS_TABLES au fil de l'extension de seedChain (T2-T5).
    const { adminClient } = await import('./helpers/clients.mjs')
    const admin = adminClient()
    for (const table of BUSINESS_TABLES) {
      const { data: rows } = await admin.from(table).select('id').eq('espace_id', espaceA).limit(1)
      if (!rows || rows.length === 0) continue   // table non encore semée à ce stade
      const { error } = await admin.from(table)
        .update({ espace_id: espaceB }).eq('id', rows[0].id)
      expect(error, `${table} doit refuser le changement d'espace_id`).not.toBeNull()
      expect(error.message, table).toMatch(/ESPACE_ID_IMMUTABLE/)
    }
  })
})

describe('P0-B — intégrité référentielle forte (FK composite + CHECK)', () => {
  it('FK composite : référence parent/enfant cohérente dans le même espace = autorisée', async () => {
    // Garde de non-régression : le cas nominal (logement → entité du MÊME espace) doit passer.
    // L'incohérence cross-espace est testée juste en dessous via service-role.
    const { error } = await clientA.from('logements').insert({
      espace_id: espaceA, ref: `X-${RUN}`, entite_id: idsA.entite, immeuble_id: idsA.immeuble,
    }).select()
    expect(error).toBeNull()
  })

  it('FK composite bloque l\'incohérence parent/enfant même en service-role (bypass RLS)', async () => {
    // service_role contourne la RLS mais PAS les FK : on tente d'insérer un logement dont
    // (entite_id, espace_id) ne correspond à aucune entité → violation de clé étrangère.
    const { adminClient } = await import('./helpers/clients.mjs')
    const admin = adminClient()
    const { error } = await admin.from('logements').insert({
      espace_id: espaceB,            // espace de Bob…
      ref: `KIDNAP-${RUN}`,
      entite_id: idsA.entite,        // … mais entité d'Alice → (entite_id, espace_id) introuvable
    })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/violates foreign key|logements_entite_fk/i)
  })

  it('CHECK mouvements : « qui » ne peut pas viser un logement ET une entité', async () => {
    const { error } = await clientA.from('mouvements').insert({
      espace_id: espaceA, date_mouvement: '2026-02-01', libelle: 'Double cible',
      logement_id: idsA.logement, entite_id: idsA.entite, debit: 10,
    })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/mouvements_qui_exclusif|violates check/i)
  })

  it('unicité : un 2ᵉ bail courant actif sur le même logement est refusé', async () => {
    const { error } = await clientA.from('baux').insert({
      espace_id: espaceA, logement_id: idsA.logement, type_bail: 'nu', hc: 999,
    })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/baux_one_active_per_logement|duplicate key/i)
  })

  it('unicité : une 2ᵉ quittance sur le même (logement, mois) est refusée', async () => {
    const { error } = await clientA.from('quittances').insert({
      espace_id: espaceA, logement_id: idsA.logement, mois: '2026-01', hc: 1, ch: 1,
    })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/quittances_logement_mois_unique|duplicate key/i)
  })

  it('versioning : un UPDATE incrémente version et rafraîchit updated_at', async () => {
    const before = await clientA.from('entites').select('version, updated_at').eq('id', idsA.entite).single()
    await clientA.from('entites').update({ siren: '123456789' }).eq('id', idsA.entite)
    const after = await clientA.from('entites').select('version, updated_at').eq('id', idsA.entite).single()
    expect(Number(after.data.version)).toBe(Number(before.data.version) + 1)
    expect(new Date(after.data.updated_at).getTime())
      .toBeGreaterThanOrEqual(new Date(before.data.updated_at).getTime())
  })
})

describe('P0-B — policies d\'écriture EFFECTIVES (preuve has_role, pas seulement isolation SELECT)', () => {
  // Pourquoi ce bloc : les tests « écriture isolée » plus haut (Bob ne voit pas → 0 ligne touchée)
  // passeraient MÊME si la policy UPDATE/DELETE était « using(true) », car le scan d'un UPDATE est
  // borné par la policy SELECT (Bob ne voit déjà aucune ligne d'Alice). Ils prouvent l'isolation
  // SELECT, pas le contrat d'écriture. Ici Carol est lecture_seule MAIS membre actif : elle VOIT
  // les lignes d'Alice. Un échec d'écriture ne peut donc venir QUE de la policy d'écriture
  // elle-même (with check / using = has_role['owner','gestionnaire']). C'est la preuve manquante.

  it('Carol (lecture_seule) ne peut PAS INSERT dans son propre espace', async () => {
    const { error } = await clientC.from('entites')
      .insert({ espace_id: espaceA, nom: 'Carol interdite' })
    expect(error).not.toBeNull()                          // with check has_role(espaceA,…) faux
    expect(error.message).toMatch(/row-level security|violates/i)
  })

  it('Carol (lecture_seule) ne peut PAS UPDATE une entité VISIBLE de son espace', async () => {
    const { data, error } = await clientC.from('entites')
      .update({ siren: '000000000' }).eq('id', idsA.entite).select()
    expect(error).toBeNull()                              // pas une erreur : 0 ligne éligible
    expect(data).toEqual([])                              // using(has_role) faux → aucune ligne modifiée
  })

  it('Carol (lecture_seule) ne peut PAS DELETE une entité VISIBLE de son espace', async () => {
    const { data, error } = await clientC.from('entites')
      .delete().eq('id', idsA.entite).select()
    expect(error).toBeNull()
    expect(data).toEqual([])                              // using(has_role) faux → aucune ligne supprimée
  })

  it('Bob (writer de SON espace) ne peut PAS INSERT dans l\'espace d\'Alice', async () => {
    const { error } = await clientB.from('entites')
      .insert({ espace_id: espaceA, nom: 'injection cross-tenant' })
    expect(error).not.toBeNull()                          // with check has_role(espaceA,…) faux pour Bob
    expect(error.message).toMatch(/row-level security|violates/i)
  })
})
