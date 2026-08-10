import { describe, it, expect } from 'vitest'
import pg from 'pg'
import 'dotenv/config'
import { BUSINESS_TABLES } from './helpers/p0b-fixtures.mjs'

function db() {
  return new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
}

async function inspect(name) {
  const c = db(); await c.connect()
  try {
    const meta = await c.query(
      `select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
              (select count(*) from pg_policy p where p.polrelid = c.oid) as npol
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname=$1`, [name])
    const cols = await c.query(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name=$1`, [name])
    const uniq = await c.query(
      // ordre-indépendant : on mappe conkey → noms de colonnes, trié, et on compare
      // au jeu {espace_id, id}. (conkey est dans l'ordre de déclaration, pas alphabétique.)
      `select 1 from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname=$1 and con.contype='u'
         and (
           select array_agg(att.attname::text order by att.attname::text)
           from unnest(con.conkey) as k
           join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
         ) = array['espace_id','id']`, [name])
    const trg = await c.query(
      `select 1 from pg_trigger tg
       join pg_class cl on cl.oid = tg.tgrelid
       join pg_namespace n on n.oid = cl.relnamespace
       where n.nspname='public' and cl.relname=$1
         and tg.tgname='trg_freeze_espace_id' and not tg.tgisinternal`, [name])
    const touchTrg = await c.query(
      `select 1 from pg_trigger tg
       join pg_class cl on cl.oid = tg.tgrelid
       join pg_namespace n on n.oid = cl.relnamespace
       where n.nspname='public' and cl.relname=$1
         and tg.tgname = 'trg_touch_' || $1 and not tg.tgisinternal`, [name])
    const pols = await c.query(
      // texte effectif de chaque policy (USING + WITH CHECK) : sert à prouver qu'aucune
      // n'est permissive (« using(true) »), pas seulement qu'il y en a ≥4.
      `select pol.polcmd as cmd,
              coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') as qual,
              coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as withcheck
       from pg_policy pol
       join pg_class cl on cl.oid = pol.polrelid
       join pg_namespace n on n.oid = cl.relnamespace
       where n.nspname='public' and cl.relname=$1`, [name])
    return {
      exists: meta.rowCount === 1,
      row: meta.rows[0],
      cols: new Set(cols.rows.map(r => r.column_name)),
      hasIdEspaceUnique: uniq.rowCount >= 1,
      hasFreezeTrigger: trg.rowCount >= 1,
      hasTouchTrigger: touchTrg.rowCount >= 1,
      policies: pols.rows,
    }
  } finally { await c.end() }
}

describe('P0-B — schéma & RLS des tables métier', () => {
  for (const table of BUSINESS_TABLES) {
    describe(table, () => {
      it('existe', async () => { expect((await inspect(table)).exists).toBe(true) })
      it('RLS forcée + ≥4 policies', async () => {
        const { row } = await inspect(table)
        expect(row.enabled).toBe(true)
        expect(row.forced).toBe(true)
        expect(Number(row.npol)).toBeGreaterThanOrEqual(4)
      })
      it('colonnes socle (espace_id/version/created_at/updated_at/deleted_at/created_by)', async () => {
        const { cols } = await inspect(table)
        for (const col of ['espace_id', 'version', 'created_at', 'updated_at', 'deleted_at', 'created_by'])
          expect(cols.has(col), `${table}.${col}`).toBe(true)
      })
      it('contrainte unique (id, espace_id) pour FK composite', async () => {
        expect((await inspect(table)).hasIdEspaceUnique).toBe(true)
      })
      it('trigger trg_freeze_espace_id (espace_id immuable)', async () => {
        expect((await inspect(table)).hasFreezeTrigger).toBe(true)
      })
      it('trigger trg_touch_<table> (version + updated_at)', async () => {
        expect((await inspect(table)).hasTouchTrigger).toBe(true)
      })
      it('policies non permissives (chaque policy référence un garde is_member/has_role/has_entite_access/has_entite_write)', async () => {
        const { policies } = await inspect(table)
        expect(policies.length).toBeGreaterThanOrEqual(4)
        for (const p of policies) {
          // une policy « using(true) » / « with check(true) » serait une faille d'isolation :
          // on exige que CHAQUE policy s'appuie sur un garde — is_member/has_role (espace-level) OU
          // has_entite_access/has_entite_write (par-SCI, P1 — STRICTS : appellent is_full_member en interne).
          const guard = `${p.qual} ${p.withcheck}`
          expect(/is_member|has_role|is_full_member|is_full_manager|has_entite_access|has_entite_write/.test(guard), `${table} policy ${p.cmd} : « ${guard.trim()} »`).toBe(true)
        }
      })
    })
  }
})
