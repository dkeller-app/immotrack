import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import 'dotenv/config'
import { createUser, userClient, deleteUserByEmail } from './helpers/clients.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p0c2-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }

let clientA, espaceA

function db() {
  return new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
}

beforeAll(async () => {
  await createUser(A.email, A.pass)
  clientA = await userClient(A.email, A.pass)
  const { data: ea, error } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P0C2' })
  if (error) throw error
  espaceA = ea.id
})

afterAll(async () => {
  // ⚠️ Fuite de tenant de test CONNUE (cf. P0-C1 audit) : deleteUserByEmail ne supprime pas
  // l'espace (espaces.created_by NO ACTION + protect_last_owner). Le correctif robuste = la
  // primitive de suppression d'espace, planifiée en tâche dédiée. 1 user/run, inoffensif ici.
  await deleteUserByEmail(A.email)
})

describe('P0-C2 — catalogue plans (global, data-driven)', () => {
  it('la table plans existe avec le palier « free » plancher', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(`select id, limite_biens, limite_membres from public.plans where id = 'free'`)
      expect(rows.length).toBe(1)
      expect(rows[0].limite_biens).toBe(1)
      expect(rows[0].limite_membres).toBe(1)
    } finally { await c.end() }
  })

  it('le palier « beta » est illimité (limites NULL) avec features.all', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(`select limite_biens, features from public.plans where id = 'beta'`)
      expect(rows[0].limite_biens).toBeNull()
      expect(rows[0].features.all).toBe(true)
    } finally { await c.end() }
  })

  it('plans est en RLS FORCE avec ≥1 policy (conforme check:rls)', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(
        `select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
                (select count(*) from pg_policy p where p.polrelid = c.oid) as npol
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname='public' and c.relname='plans'`)
      expect(rows[0].enabled).toBe(true)
      expect(rows[0].forced).toBe(true)
      expect(Number(rows[0].npol)).toBeGreaterThanOrEqual(1)
    } finally { await c.end() }
  })

  it('un membre authentifié PEUT lire le catalogue mais NE PEUT PAS l\'écrire', async () => {
    const { data: read } = await clientA.from('plans').select('id')
    expect(read.map(r => r.id).sort()).toEqual(['beta', 'free'])
    const { error: wErr } = await clientA.from('plans')
      .insert({ id: `hack-${RUN}`, nom: 'pirate' })
    expect(wErr).not.toBeNull()                       // aucune policy insert pour authenticated
    expect(wErr.message).toMatch(/row-level security|violates/i)
  })
})

describe('P0-C2 — colonnes d\'abonnement sur espaces', () => {
  it('un espace nouvellement créé a plan_id = « free » par défaut', async () => {
    const { data } = await clientA.from('espaces').select('plan_id, subscription_source').eq('id', espaceA).single()
    expect(data.plan_id).toBe('free')
    expect(data.subscription_source).toBeNull()
  })

  it('le CHECK refuse une subscription_source hors {stripe,trial,comp}', async () => {
    const c = db(); await c.connect()
    try {
      await expect(
        c.query(`update public.espaces set subscription_source = 'bitcoin' where id = $1`, [espaceA])
      ).rejects.toThrow(/espaces_subscription_source_chk|violates check/i)
    } finally { await c.end() }
  })

  it('le CHECK refuse un subscription_status inconnu de Stripe', async () => {
    const c = db(); await c.connect()
    try {
      await expect(
        c.query(`update public.espaces set subscription_status = 'invente' where id = $1`, [espaceA])
      ).rejects.toThrow(/espaces_subscription_status_chk|violates check/i)
    } finally { await c.end() }
  })

  it('plan_id référence une ligne plans réelle (FK)', async () => {
    const c = db(); await c.connect()
    try {
      await expect(
        c.query(`update public.espaces set plan_id = 'plan_inexistant' where id = $1`, [espaceA])
      ).rejects.toThrow(/violates foreign key/i)
    } finally { await c.end() }
  })
})

describe('P0-C2 — helper de résolution des droits (espace_plan / espace_has_feature)', () => {
  it('espace_plan résout « free » par défaut (limite_biens = 1)', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(`select (public.espace_plan($1)).id as id,
                                              (public.espace_plan($1)).limite_biens as biens`, [espaceA])
      expect(rows[0].id).toBe('free')
      expect(rows[0].biens).toBe(1)
    } finally { await c.end() }
  })

  it('après bascule sur « beta », espace_plan résout illimité (limite_biens NULL)', async () => {
    const c = db(); await c.connect()
    try {
      await c.query(`update public.espaces set plan_id = 'beta', subscription_source = 'comp' where id = $1`, [espaceA])
      const { rows } = await c.query(`select (public.espace_plan($1)).id as id,
                                              (public.espace_plan($1)).limite_biens as biens`, [espaceA])
      expect(rows[0].id).toBe('beta')
      expect(rows[0].biens).toBeNull()
      const { rows: f } = await c.query(`select public.espace_has_feature($1, 'all') as all_feat`, [espaceA])
      expect(f[0].all_feat).toBe(true)
      // remettre free pour ne pas perturber d'autres assertions éventuelles
      await c.query(`update public.espaces set plan_id = 'free', subscription_source = null where id = $1`, [espaceA])
    } finally { await c.end() }
  })

  it('espace_has_feature renvoie false pour une feature absente', async () => {
    const c = db(); await c.connect()
    try {
      const { rows } = await c.query(`select public.espace_has_feature($1, 'feature_bidon') as f`, [espaceA])
      expect(rows[0].f).toBe(false)
    } finally { await c.end() }
  })

  it('espace_has_feature NE LÈVE PAS sur une valeur de feature non-booléenne (renvoie false)', async () => {
    // durcissement post-audit (0022) : avant, ('{"x":"maybe"}' ->> 'x')::boolean levait.
    const c = db(); await c.connect()
    try {
      await c.query(`insert into public.plans (id, nom, features)
                     values ('p0c2_tmp_badfeat', 'tmp', '{"weird":"maybe"}'::jsonb)`)
      await c.query(`update public.espaces set plan_id = 'p0c2_tmp_badfeat' where id = $1`, [espaceA])
      const { rows } = await c.query(`select public.espace_has_feature($1, 'weird') as f`, [espaceA])
      expect(rows[0].f).toBe(false)                 // ne lève pas → renvoie false
    } finally {
      // restaurer AVANT de supprimer le plan (FK), puis nettoyer la ligne temporaire.
      await c.query(`update public.espaces set plan_id = 'free' where id = $1`, [espaceA])
      await c.query(`delete from public.plans where id = 'p0c2_tmp_badfeat'`)
      await c.end()
    }
  })
})

describe('P0-C2 — colonnes de rétention (hook RGPD, invariant 12)', () => {
  const RETENTION_TABLES = ['baux', 'edl', 'quittances', 'baux_historique']

  for (const t of RETENTION_TABLES) {
    it(`${t} porte retention_class / legal_basis / retention_until avec défauts`, async () => {
      const c = db(); await c.connect()
      try {
        const { rows } = await c.query(
          `select column_name, column_default
           from information_schema.columns
           where table_schema='public' and table_name=$1
             and column_name in ('retention_class','legal_basis','retention_until')`, [t])
        const cols = Object.fromEntries(rows.map(r => [r.column_name, r.column_default]))
        expect(Object.keys(cols).sort()).toEqual(['legal_basis', 'retention_class', 'retention_until'])
        expect(cols.retention_class).toMatch(/bail_plus_3ans/)
        expect(cols.legal_basis).toMatch(/obligation_legale/)
      } finally { await c.end() }
    })
  }

  it('le CHECK refuse une retention_class hors liste (insert réel rejeté, rien persisté)', async () => {
    const c = db(); await c.connect()
    try {
      await expect(
        c.query(`insert into public.baux_historique (espace_id, bail_snapshot, retention_class)
                 values ($1, '{}'::jsonb, 'pour_toujours')`, [espaceA])
      ).rejects.toThrow(/retention_class_chk|violates check/i)
    } finally { await c.end() }
  })

  it('le CHECK refuse une legal_basis hors liste (insert réel rejeté, rien persisté)', async () => {
    const c = db(); await c.connect()
    try {
      await expect(
        c.query(`insert into public.baux_historique (espace_id, bail_snapshot, legal_basis)
                 values ($1, '{}'::jsonb, 'parce_que')`, [espaceA])
      ).rejects.toThrow(/legal_basis_chk|violates check/i)
    } finally { await c.end() }
  })
})
