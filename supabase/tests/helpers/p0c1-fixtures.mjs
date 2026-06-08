// Helpers locaux P0-C1 (immutabilité du signé). NE modifie pas clients.mjs / p0b-fixtures.mjs.
import pg from 'pg'
import 'dotenv/config'

// Hash factice : en P0-C1 la base ne CALCULE pas le hash, elle le stocke et le fige.
// Le vrai SHA-256 du snapshot est calculé côté client (couche app, plus tard).
export const FAKE_HASH = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'

// Verrouille un bail/edl déjà semé : passage locked false → true (autorisé par le trigger).
// signature_source obligatoire si locked (CHECK) ; content_hash obligatoire si 'immotrack'.
export async function lockRow(client, table, id, { source = 'immotrack', hash = FAKE_HASH } = {}) {
  const patch = { locked: true, signature_source: source, signed_at: new Date().toISOString() }
  if (source === 'immotrack') patch.content_hash = hash
  const { data, error } = await client.from(table).update(patch).eq('id', id).select().single()
  if (error) throw new Error(`lockRow ${table}: ${error.message}`)
  return data
}

// PURGE les artefacts VERROUILLÉS (baux/edl/événements) d'un jeu d'espaces, pour qu'ils
// ne fassent plus échouer un démontage ultérieur (le trigger prevent_locked_mutation
// lèverait sur le DELETE d'un signé). On lève ce trigger via app.bypass_immutable
// (settable seulement depuis une session DB privilégiée — jamais depuis PostgREST).
//
// Ordre FK-correct (les FK RESTRICT ne sont PAS bypassées par le GUC, seuls les triggers
// le sont) : événements d'abord, puis on casse les self-FK amends_id, puis baux, puis edl.
//
// ⚠️ LIMITE CONNUE (défaut pré-existant, hors P0-C1) : ce helper NE supprime PAS l'espace
// ni l'utilisateur. deleteUserByEmail (appelé ensuite en afterAll) ne suffit PAS à un
// nettoyage complet : `espaces.created_by → auth.users` est en NO ACTION et le trigger
// protect_last_owner (0005) refuse la suppression cascadée du dernier owner. Résultat :
// des espaces/users de test restent orphelins sur la base partagée. Le correctif robuste
// = une primitive de suppression d'espace (offboarding tenant) — planifié en tâche dédiée,
// PAS patché ici (cf. audit code-reviewer P0-C1, 2026-06-08).
export async function purgeLockedArtefacts(espaceIds) {
  const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    await c.query('begin')
    await c.query(`set local app.bypass_immutable = 'on'`)
    // baux_evenements n'existe qu'à partir de la migration 0017 (Task 5) ; garde tolérante
    // pour que afterAll soit propre dès Task 2.
    const ev = await c.query(`select to_regclass('public.baux_evenements') as t`)
    if (ev.rows[0].t) {
      await c.query(`delete from public.baux_evenements where espace_id = any($1::uuid[])`, [espaceIds])
    }
    await c.query(`update public.baux set amends_id = null where espace_id = any($1::uuid[])`, [espaceIds])
    await c.query(`delete from public.baux where espace_id = any($1::uuid[])`, [espaceIds])
    await c.query(`delete from public.edl  where espace_id = any($1::uuid[])`, [espaceIds])
    await c.query('commit')
  } catch (e) {
    await c.query('rollback')
    throw e
  } finally {
    await c.end()
  }
}
