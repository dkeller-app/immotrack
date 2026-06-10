// Test d'INTÉGRATION du binding supabase-js (store-supabase-adapter.js) contre le VRAI Postgres.
// C'est ici que vit la garantie de concurrence : prouve que les 3 écritures gardées par version
// se comportent fail-closed sur la vraie base (un INSERT/UPDATE mal écrit réintroduirait la perte
// silencieuse ou la résurrection que l'audit a fait corriger côté store-supabase.js).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createUser, userClient, adminClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'
import { createSupabaseAdapter } from '../../js/core/store-supabase-adapter.js'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `adapter-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `adapter-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }

let clientA, espaceA, adapter, idSentinel
let idLifecycle, idLive, idDupA, idDupB, idCB, idsPage
const baseRow = (id, nom) => ({ id, espace_id: espaceA, nom, legacy_raw: { nom, _src: 'adapter-test' } })

beforeAll(async () => {
  await createUser(A.email, A.pass)
  const userB = await createUser(B.email, B.pass)   // 2e user RÉEL → created_by sentinelle (FK auth.users)
  idSentinel = userB.id
  clientA = await userClient(A.email, A.pass)
  const a = await clientA.rpc('create_espace', { p_nom: 'Espace Adapter' }); if (a.error) throw a.error
  espaceA = a.data.id
  adapter = createSupabaseAdapter(clientA, espaceA)
  idLifecycle = randomUUID(); idLive = randomUUID()
  idDupA = randomUUID(); idDupB = randomUUID(); idCB = randomUUID()
  idsPage = [randomUUID(), randomUUID(), randomUUID()]
})

afterAll(async () => {
  await teardownOwner(A.email, [espaceA])
  const { deleteUserByEmail } = await import('./helpers/clients.mjs')
  await deleteUserByEmail(B.email)
})

describe('store-supabase-adapter — writer gardé par version (intégration Postgres)', () => {
  it('insert : id libre → renvoie la version 1', async () => {
    const v = await adapter.writer.insert('entites', baseRow(idLifecycle, 'Entité cycle'))
    expect(v).toBe(1)
  })

  it('insert : id DÉJÀ pris (autre writer) → null = CONFLIT (ON CONFLICT DO NOTHING, aucun écrasement)', async () => {
    const v = await adapter.writer.insert('entites', baseRow(idLifecycle, 'Tentative écrasement'))
    expect(v).toBeNull()
    const { data } = await clientA.from('entites').select('nom, version').eq('id', idLifecycle).single()
    expect(data.nom).toBe('Entité cycle'); expect(Number(data.version)).toBe(1)   // intacte, pas de LWW
  })

  it('insert : conflit sur un AUTRE index unique (nom) → null, PAS un throw (audit IMPORTANT-1)', async () => {
    expect(await adapter.writer.insert('entites', baseRow(idDupA, 'Nom Unique'))).toBe(1)
    // id NEUF mais nom dupliqué → viole entites_nom_unique, pas l'index id → doit rester fail-closed
    const v = await adapter.writer.insert('entites', baseRow(idDupB, 'Nom Unique'))
    expect(v).toBeNull()
    // la ligne d'origine est intacte, aucune 2e ligne créée
    const { data } = await clientA.from('entites').select('id').eq('espace_id', espaceA).ilike('nom', 'Nom Unique')
    expect(data.length).toBe(1); expect(data[0].id).toBe(idDupA)
  })

  it('update : version courante (1) → applique, renvoie la NOUVELLE version (2, bump touch_row)', async () => {
    const v = await adapter.writer.update('entites', idLifecycle, baseRow(idLifecycle, 'Entité cycle v2'), 1)
    expect(v).toBe(2)
    const { data } = await clientA.from('entites').select('nom').eq('id', idLifecycle).single()
    expect(data.nom).toBe('Entité cycle v2')
  })

  it('update : version PÉRIMÉE (1 alors que la base est à 2) → null = CONFLIT, ligne inchangée', async () => {
    const v = await adapter.writer.update('entites', idLifecycle, baseRow(idLifecycle, 'Écriture périmée'), 1)
    expect(v).toBeNull()
    const { data } = await clientA.from('entites').select('nom, version').eq('id', idLifecycle).single()
    expect(data.nom).toBe('Entité cycle v2'); expect(Number(data.version)).toBe(2)
  })

  it('update : ne réécrit PAS created_by (provenance préservée, audit IMPORTANT-2)', async () => {
    expect(await adapter.writer.insert('entites', baseRow(idCB, 'Provenance'))).toBe(1)
    // un autre user a créé la ligne → on force created_by sur lui (distinct de l'éditeur clientA)
    const setCb = await adminClient().from('entites').update({ created_by: idSentinel }).eq('id', idCB)
    expect(setCb.error).toBeNull()
    const { data: cur } = await clientA.from('entites').select('version').eq('id', idCB).single()   // touch_row a bumpé
    // l'éditeur (clientA) modifie la fiche → created_by NE DOIT PAS basculer sur lui
    const v = await adapter.writer.update('entites', idCB, baseRow(idCB, 'Provenance v2'), Number(cur.version))
    expect(v).toBe(Number(cur.version) + 1)
    const { data } = await adminClient().from('entites').select('created_by, nom').eq('id', idCB).single()
    expect(data.created_by).toBe(idSentinel); expect(data.nom).toBe('Provenance v2')
  })

  it('softDelete : version courante (2) → pose deleted_at, renvoie la version (3)', async () => {
    const v = await adapter.writer.softDelete('entites', idLifecycle, 2)
    expect(v).toBe(3)
    const { data } = await clientA.from('entites').select('deleted_at').eq('id', idLifecycle).single()
    expect(data.deleted_at).not.toBeNull()
  })

  it('update sur ligne SOFT-DELETED (anti-résurrection) → null, deleted_at PRÉSERVÉ', async () => {
    const v = await adapter.writer.update('entites', idLifecycle, baseRow(idLifecycle, 'Résurrection'), 3)
    expect(v).toBeNull()
    const { data } = await clientA.from('entites').select('deleted_at, nom').eq('id', idLifecycle).single()
    expect(data.deleted_at).not.toBeNull(); expect(data.nom).toBe('Entité cycle v2')
  })

  it('insert sur un id TOMBSTONE (soft-deleted) → null, la ligne RESTE supprimée (pas de résurrection)', async () => {
    const before = await clientA.from('entites').select('deleted_at').eq('id', idLifecycle).single()
    const v = await adapter.writer.insert('entites', baseRow(idLifecycle, 'Resurrection via insert'))
    expect(v).toBeNull()
    const { data } = await clientA.from('entites').select('deleted_at, nom').eq('id', idLifecycle).single()
    expect(data.deleted_at).toBe(before.data.deleted_at); expect(data.nom).toBe('Entité cycle v2')
  })
})

describe('store-supabase-adapter — fetchTable / fetchConfig (intégration Postgres)', () => {
  it('fetchTable : renvoie {id, version, legacy_raw} des lignes VIVANTES et EXCLUT les soft-deleted', async () => {
    const v = await adapter.writer.insert('entites', baseRow(idLive, 'Entité vivante'))
    expect(v).toBe(1)
    const rows = await adapter.fetchTable('entites')
    const live = rows.find(r => r.id === idLive)
    expect(live).toBeTruthy()
    expect(Number(live.version)).toBe(1)
    expect(live.legacy_raw.nom).toBe('Entité vivante')
    expect(rows.some(r => r.id === idLifecycle)).toBe(false)   // tombstone exclu
  })

  it('fetchTable PAGINE : pageSize=2 sur >2 lignes → renvoie TOUTES les vivantes (anti-troncature, IMPORTANT-3)', async () => {
    for (const id of idsPage) expect(await adapter.writer.insert('entites', baseRow(id, 'Page ' + id.slice(0, 6)))).toBe(1)
    const paged = createSupabaseAdapter(clientA, espaceA, { pageSize: 2 })
    const rows = await paged.fetchTable('entites')
    for (const id of idsPage) expect(rows.some(r => r.id === id)).toBe(true)
    // aucune troncature : autant que le COUNT direct des lignes vivantes
    const { count } = await clientA.from('entites').select('id', { count: 'exact', head: true })
      .eq('espace_id', espaceA).is('deleted_at', null)
    expect(rows.length).toBe(count)
    expect(rows.length).toBeGreaterThan(2)
  })

  it('fetchConfig : {} si aucune config, puis renvoie data après upsert', async () => {
    expect(await adapter.fetchConfig()).toEqual({})
    const up = await clientA.from('espace_config').upsert({ espace_id: espaceA, data: { params: { devise: 'EUR' } } })
    expect(up.error).toBeNull()
    expect(await adapter.fetchConfig()).toEqual({ params: { devise: 'EUR' } })
  })
})
