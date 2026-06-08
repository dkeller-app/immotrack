# Primitive de suppression d'espace (`purge_espace`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fournir une primitive serveur `purge_espace(uuid)` qui **supprime intégralement** un espace et toutes ses lignes (membres + données métier, y compris baux/EDL verrouillés), en franchissant de façon contrôlée les triggers protecteurs ; l'utiliser pour un **démontage de test propre** (fin des tenants orphelins) et la rendre disponible comme **primitive d'offboarding tenant**.

**Architecture :** Deux triggers protègent aujourd'hui les données : `prevent_locked_mutation` (refuse UPDATE/DELETE d'un signé, P0-C1) et `protect_last_owner` (refuse de retirer le dernier owner, P0-A). On dote `protect_last_owner` d'une **échappatoire d'administration** symétrique à celle de l'immutabilité (`app.bypass_owner_guard`, settable uniquement depuis une session DB privilégiée). La fonction `purge_espace` (SECURITY DEFINER, `EXECUTE` réservé à `service_role`) pose les deux GUC d'échappatoire en local, **casse d'abord les FK `ON DELETE RESTRICT`** qui pointent vers `baux` (`baux_evenements`, `amends_id` — sinon la cascade échoue car RESTRICT est vérifié immédiatement), puis fait `delete from espaces` : la cascade `espace_id → espaces` (CASCADE) supprime tout le reste, les triggers protecteurs honorant les GUC. Un helper de test partagé l'appelle (via `service_role`) avant `deleteUserByEmail`, et un nettoyage one-shot purge les orphelins déjà accumulés.

**Tech Stack :** PostgreSQL 17.6 (Supabase EU), migration SQL append-only `supabase/migrations/`, tests Vitest + `@supabase/supabase-js` (RPC `service_role`) + `pg`. Repo PUBLIC → aucun secret commité.

**Hors scope (explicite) :** l'**effacement sélectif RGPD** (droit à l'oubli d'un sujet tout en conservant le set signé sous rétention légale) est une mécanique distincte, pilotée par les colonnes `retention_*` (P0-C2) via un **moteur de purge → P5**. `purge_espace` est une **suppression DURE** d'un tenant entier (décision du responsable de traitement = le client ; nous = sous-traitant), pas l'effacement sélectif.

---

## Contexte de référence

- Triggers concernés : `public.protect_last_owner()` (`supabase/migrations/0005_invariants_triggers.sql`, BEFORE UPDATE OR DELETE sur `espace_members`, `LAST_OWNER_PROTECTED`) ; `public.prevent_locked_mutation()` (`0014`, échappatoire `app.bypass_immutable`).
- FK `ON DELETE RESTRICT` pointant vers `baux` (à neutraliser avant cascade) : `baux.amends_id` (`0015`), `baux_evenements.bail_id` (`0017`). Les FK composites P0-B (`(parent_id, espace_id)→parent`) sont `NO ACTION` (vérifiées en fin de statement → OK dans une cascade).
- Cascade en place : chaque table métier + `espace_members` a `espace_id → public.espaces(id) ON DELETE CASCADE`.
- Cause du leak (audit P0-C1) : `espaces.created_by → auth.users` est `NO ACTION` → on ne peut pas supprimer l'utilisateur tant que son espace existe ; et `protect_last_owner` bloque la suppression de l'espace. `purge_espace` supprime l'espace → l'utilisateur devient supprimable.
- Helpers de test : `supabase/tests/helpers/clients.mjs` exporte `adminClient()` (service_role), `createUser`, `userClient`, `deleteUserByEmail`.
- `service_role` est un rôle privilégié distinct de `authenticated`/`anon` ; un client PostgREST `authenticated` ne peut PAS exécuter `SET app.*` ni (après REVOKE) appeler `purge_espace`.
- **Numérotation migrations** : dernière = `0022`. Cette primitive = **`0023`**.

## Décisions de conception (tranchées)

1. **Échappatoire `protect_last_owner` via GUC `app.bypass_owner_guard`** (même patron que `app.bypass_immutable`) plutôt que `session_replication_role='replica'` : ce dernier désactive AUSSI les triggers RI (cascades FK) → il faudrait tout supprimer à la main. Le GUC laisse les cascades fonctionner et ne désactive QUE le garde owner. Inatteignable depuis PostgREST.
2. **`purge_espace` = SECURITY DEFINER, `EXECUTE` REVOKE FROM PUBLIC + GRANT TO service_role.** Jamais appelable par `authenticated`/`anon`. C'est la seule voie franchissant `protect_last_owner`.
3. **Neutraliser les RESTRICT avant la cascade** (delete `baux_evenements`, null `amends_id`) — RESTRICT est vérifié immédiatement, pas déféré comme NO ACTION ; sans ça la cascade depuis `espaces` échoue de façon non déterministe.
4. **Suppression DURE, non rétention-aware.** `purge_espace` ne consulte pas `retention_*` (c'est l'effacement sélectif RGPD = P5). Documenté.
5. **Retrofit de TOUS les suites de test** (p0a/p0b/p0c1/p0c2) vers un helper partagé `teardownEspace`, pour mettre fin aux fuites de façon uniforme + **nettoyage one-shot** des orphelins déjà présents.

## File Structure

- **Create** `supabase/migrations/0023_purge_espace.sql` — `protect_last_owner` v2 (échappatoire `app.bypass_owner_guard`) + fonction `purge_espace(uuid)` + grants.
- **Create** `supabase/tests/helpers/teardown.mjs` — `teardownEspace(espaceId)` (RPC `purge_espace` en service_role) + `teardownOwner(email, espaceIds)` (purge espaces puis `deleteUserByEmail`).
- **Create** `supabase/tests/purge-espace.test.mjs` — preuves : purge complète d'un espace (membres + signé) ; non-privilégié refusé.
- **Modify** `supabase/tests/helpers/p0c1-fixtures.mjs` — `purgeLockedArtefacts` devient inutile pour le démontage (remplacé par `teardownEspace`) ; on la conserve si d'autres tests s'en servent, sinon on la retire. (Voir T2.)
- **Modify** `supabase/tests/p0c1-immutabilite.test.mjs`, `supabase/tests/p0c2-gating-retention.test.mjs`, `supabase/tests/p0b-isolation.test.mjs`, et le(s) fichier(s) de test P0-A créant des espaces — `afterAll` appelle `teardownOwner`.
- **Create** `supabase/tests/_cleanup-orphans.mjs` — script one-shot (exécuté manuellement) purgeant les espaces/users de test orphelins (`@example.test`).

---

### Task 1 : Migration 0023 (échappatoire owner + `purge_espace`) + test dédié

**Files:**
- Create: `supabase/migrations/0023_purge_espace.sql`
- Create: `supabase/tests/helpers/teardown.mjs`
- Create: `supabase/tests/purge-espace.test.mjs`

- [ ] **Step 1 : Écrire la migration 0023**

Create `supabase/migrations/0023_purge_espace.sql` :

```sql
-- Primitive de suppression d'espace (offboarding tenant + démontage de test propre).
-- Append-only. SUPPRESSION DURE d'un tenant entier — distincte de l'effacement sélectif
-- RGPD (droit à l'oubli en conservant le signé sous rétention) qui relève du moteur de
-- purge piloté par retention_* (P5).

-- 1) Échappatoire d'administration pour protect_last_owner (symétrique à app.bypass_immutable
--    de 0014). Settable UNIQUEMENT depuis une session DB privilégiée (jamais PostgREST :
--    authenticated/anon ne peuvent pas SET app.*). Redéfinition à l'identique + garde en tête.
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_espace uuid := coalesce(old.espace_id, new.espace_id);
  v_remaining int;
begin
  -- échappatoire offboarding/admin : purge_espace pose ce GUC en local.
  if coalesce(current_setting('app.bypass_owner_guard', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if old.role = 'owner' and old.invite_status = 'active' then
    if tg_op = 'UPDATE' and new.role = 'owner' and new.invite_status = 'active' then
      return new;
    end if;
    select count(*) into v_remaining
    from public.espace_members
    where espace_id = v_espace
      and role = 'owner' and invite_status = 'active'
      and id <> old.id;
    if v_remaining = 0 then
      raise exception 'LAST_OWNER_PROTECTED';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- 2) purge_espace : supprime intégralement un espace. SECURITY DEFINER (s'exécute en
--    postgres → pose les GUC d'échappatoire et contourne la RLS). EXECUTE réservé à
--    service_role (jamais authenticated/anon).
create or replace function public.purge_espace(p_espace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- échappatoires (transaction-locales) pour les triggers protecteurs.
  perform set_config('app.bypass_immutable',   'on', true);
  perform set_config('app.bypass_owner_guard', 'on', true);

  -- Neutraliser les FK ON DELETE RESTRICT pointant vers baux AVANT la cascade
  -- (RESTRICT est vérifié immédiatement, pas déféré → casserait la cascade).
  delete from public.baux_evenements where espace_id = p_espace_id;
  update public.baux set amends_id = null where espace_id = p_espace_id and amends_id is not null;

  -- La cascade espace_id→espaces (ON DELETE CASCADE) supprime membres + données métier ;
  -- prevent_locked_mutation (0014) et protect_last_owner honorent les GUC ci-dessus.
  delete from public.espaces where id = p_espace_id;
end;
$$;

revoke execute on function public.purge_espace(uuid) from public;
grant  execute on function public.purge_espace(uuid) to service_role;
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`
Expected: succès, `0023` appliquée (fonctions remplacées/créées + grants).

- [ ] **Step 3 : Écrire le helper de démontage partagé**

Create `supabase/tests/helpers/teardown.mjs` :

```js
// Démontage de test propre, fondé sur la primitive serveur purge_espace (0023).
// Remplace l'ancienne approche (qui laissait espaces/users orphelins : espaces.created_by
// NO ACTION + protect_last_owner). NE touche pas clients.mjs.
import { adminClient, deleteUserByEmail } from './clients.mjs'

// Supprime intégralement un espace (membres + données métier, y compris signé) via la
// primitive serveur, en service_role.
export async function teardownEspace(espaceId) {
  if (!espaceId) return
  const { error } = await adminClient().rpc('purge_espace', { p_espace_id: espaceId })
  if (error) throw new Error(`purge_espace(${espaceId}): ${error.message}`)
}

// Démontage complet d'un propriétaire de test : purge ses espaces puis supprime l'utilisateur.
export async function teardownOwner(email, espaceIds = []) {
  for (const id of espaceIds) await teardownEspace(id)
  await deleteUserByEmail(email)
}
```

- [ ] **Step 4 : Écrire le test dédié**

Create `supabase/tests/purge-espace.test.mjs` :

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import 'dotenv/config'
import { createUser, userClient, deleteUserByEmail, adminClient } from './helpers/clients.mjs'
import { seedChain } from './helpers/p0b-fixtures.mjs'
import { lockRow } from './helpers/p0c1-fixtures.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `purge-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }

let clientA, espaceA, idsA

function db() { return new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }) }

beforeAll(async () => {
  await createUser(A.email, A.pass)
  clientA = await userClient(A.email, A.pass)
  const { data: ea, error } = await clientA.rpc('create_espace', { p_nom: 'Espace purge' })
  if (error) throw error
  espaceA = ea.id
  idsA = await seedChain(clientA, espaceA)
  await lockRow(clientA, 'baux', idsA.bail)   // un signé verrouillé dans l'espace
})

afterAll(async () => {
  // au cas où le test de purge échoue, on tente quand même de nettoyer l'utilisateur.
  await deleteUserByEmail(A.email).catch(() => {})
})

describe('purge_espace — suppression dure d\'un tenant', () => {
  it('un client authentifié NON privilégié ne peut PAS appeler purge_espace', async () => {
    const { error } = await clientA.rpc('purge_espace', { p_espace_id: espaceA })
    expect(error).not.toBeNull()                    // EXECUTE révoqué pour authenticated
    expect(error.message).toMatch(/permission denied|not.*exist|function/i)
  })

  it('service_role purge l\'espace : membres + données métier (dont signé) supprimés', async () => {
    const before = await adminClient().from('baux').select('id', { count: 'exact', head: true }).eq('espace_id', espaceA)
    expect(before.count).toBeGreaterThanOrEqual(1)   // il y a bien un bail (verrouillé)

    const { error } = await adminClient().rpc('purge_espace', { p_espace_id: espaceA })
    expect(error).toBeNull()

    // tout a disparu : espace, membres, baux, edl, etc.
    const c = db(); await c.connect()
    try {
      for (const t of ['espaces', 'espace_members', 'baux', 'edl', 'logements', 'entites', 'baux_evenements']) {
        const col = t === 'espaces' ? 'id' : 'espace_id'
        const { rows } = await c.query(`select count(*)::int as n from public.${t} where ${col} = $1`, [espaceA])
        expect(rows[0].n, `${t} doit être vide après purge`).toBe(0)
      }
    } finally { await c.end() }

    // l'utilisateur devient supprimable (plus d'espace qui le référence via created_by).
    await expect(deleteUserByEmail(A.email)).resolves.not.toThrow()
  })
})
```

- [ ] **Step 5 : Lancer le test**

Run: `npm run test:rls -- purge-espace`
Expected: 2 `it` PASSENT (non-privilégié refusé ; service_role purge tout + user supprimable).

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/0023_purge_espace.sql supabase/tests/helpers/teardown.mjs supabase/tests/purge-espace.test.mjs
git commit -m "$(cat <<'EOF'
purge_espace : primitive de suppression dure d'un tenant (offboarding + test)

Échappatoire admin app.bypass_owner_guard sur protect_last_owner (symétrique à
app.bypass_immutable) ; purge_espace (SECURITY DEFINER, EXECUTE service_role only)
neutralise les FK RESTRICT puis cascade depuis espaces. Helper teardownEspace/Owner.
Test : non-privilégié refusé, service_role purge tout (dont signé) + user supprimable.
Suppression DURE — l'effacement sélectif RGPD (retention_*) reste P5.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 : Retrofit des démontages de test (fin des fuites)

**Files:**
- Modify: `supabase/tests/p0c1-immutabilite.test.mjs`, `supabase/tests/p0c2-gating-retention.test.mjs`, `supabase/tests/p0b-isolation.test.mjs`, + le(s) test(s) P0-A créant des espaces.
- Modify: `supabase/tests/helpers/p0c1-fixtures.mjs` (retirer `purgeLockedArtefacts` si plus utilisée après retrofit).

- [ ] **Step 1 : Recenser les suites créant des espaces**

Run: `Grep` pour `create_espace` dans `supabase/tests/*.test.mjs` afin de lister tous les `afterAll` à retrofiter. Lire chaque `afterAll` concerné pour connaître les variables d'espace et d'email.

- [ ] **Step 2 : Retrofit `p0c1-immutabilite.test.mjs`**

Remplacer l'`afterAll` actuel (`purgeLockedArtefacts([espaceA])` + `deleteUserByEmail(A.email)`) par :
```js
import { teardownOwner } from './helpers/teardown.mjs'
// ...
afterAll(async () => {
  await teardownOwner(A.email, [espaceA])
})
```
Retirer l'import devenu inutile de `purgeLockedArtefacts` (garder `lockRow`, `FAKE_HASH`).

- [ ] **Step 3 : Retrofit `p0c2-gating-retention.test.mjs`**

Remplacer l'`afterAll` (`deleteUserByEmail(A.email)`) par `await teardownOwner(A.email, [espaceA])` + import `teardownOwner`.

- [ ] **Step 4 : Retrofit `p0b-isolation.test.mjs`**

L'`afterAll` supprime 3 users (A/B/C). Espaces : `espaceA` (Alice), `espaceB` (Bob), Carol n'a pas d'espace propre (membre de l'espace d'Alice). Remplacer par :
```js
import { teardownOwner } from './helpers/teardown.mjs'
// ...
afterAll(async () => {
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(B.email, [espaceB])
  await deleteUserByEmail(C.email)
})
```
(`teardownEspace(espaceA)` supprime aussi l'appartenance de Carol → `deleteUserByEmail(C.email)` passe.)

- [ ] **Step 5 : Retrofit la/les suite(s) P0-A** (selon le recensement Step 1). Même patron : `teardownOwner(email, [espaceId])` pour chaque propriétaire.

- [ ] **Step 6 : Vérifier la suite complète + l'absence de nouvelle fuite**

Run: `npm run test:rls`
Expected: tous verts (171+2 environ).

Vérifier qu'aucun nouvel orphelin n'est créé : compter les espaces de test AVANT/APRÈS un run (script du Step de Task 3, ou requête `pg` ad hoc) → le compte ne doit pas augmenter d'un run à l'autre.

- [ ] **Step 7 : Commit**

```bash
git add supabase/tests/p0c1-immutabilite.test.mjs supabase/tests/p0c2-gating-retention.test.mjs supabase/tests/p0b-isolation.test.mjs supabase/tests/helpers/p0c1-fixtures.mjs <fichiers P0-A>
git commit -m "$(cat <<'EOF'
tests : démontage via purge_espace (fin des tenants orphelins)

Tous les afterAll créant des espaces utilisent teardownOwner (purge_espace +
deleteUserByEmail). Plus aucun espace/user de test orphelin après un run.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 : Nettoyage one-shot des orphelins déjà accumulés

**Files:**
- Create: `supabase/tests/_cleanup-orphans.mjs` (script exécuté à la main, conservé pour réusage).

- [ ] **Step 1 : Écrire le script de nettoyage**

Create `supabase/tests/_cleanup-orphans.mjs` :

```js
// One-shot : purge les espaces/users de TEST orphelins (@example.test) accumulés par les
// anciens démontages. Réutilisable. NE touche QUE les emails de test (aucune donnée réelle
// — l'import tenant #1 est P0-E, pas encore fait). À lancer : node supabase/tests/_cleanup-orphans.mjs
import 'dotenv/config'
import pg from 'pg'
import { adminClient } from './helpers/clients.mjs'

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

// 1) espaces dont le créateur est un user de test → purge_espace (service_role) via SQL direct.
const { rows: espaces } = await c.query(`
  select e.id from public.espaces e
  join auth.users u on u.id = e.created_by
  where u.email like '%@example.test'`)
console.log(`Espaces de test à purger : ${espaces.length}`)
for (const { id } of espaces) {
  await c.query('begin')
  await c.query(`set local app.bypass_immutable = 'on'`)
  await c.query(`set local app.bypass_owner_guard = 'on'`)
  await c.query(`delete from public.baux_evenements where espace_id = $1`, [id])
  await c.query(`update public.baux set amends_id = null where espace_id = $1 and amends_id is not null`, [id])
  await c.query(`delete from public.espaces where id = $1`, [id])
  await c.query('commit')
}

// 2) users de test résiduels.
const { rows: users } = await c.query(`select id, email from auth.users where email like '%@example.test'`)
console.log(`Users de test à supprimer : ${users.length}`)
await c.end()
const admin = adminClient()
for (const u of users) {
  const { error } = await admin.auth.admin.deleteUser(u.id)
  if (error) console.warn(`  ! ${u.email}: ${error.message}`)
}
console.log('Nettoyage terminé.')
```

> **Note testeur :** on n'appelle pas la fonction `purge_espace` ici mais on **inline** sa logique en SQL (mêmes GUC + même ordre) parce que `_cleanup-orphans.mjs` ouvre une connexion `pg` privilégiée directe (plus simple que de router chaque espace via un RPC). Le résultat est identique.

- [ ] **Step 2 : Exécuter le nettoyage**

Run: `node supabase/tests/_cleanup-orphans.mjs` (avec `SUPABASE_DB_URL` chargé depuis `.env`).
Expected: log du nombre d'espaces purgés + users supprimés.

- [ ] **Step 3 : Vérifier qu'il ne reste aucun orphelin de test**

Run (via `pg`) : `select count(*) from public.espaces e join auth.users u on u.id=e.created_by where u.email like '%@example.test'` → **0** (hors d'éventuels runs en cours).
Run (via `pg`) : `select count(*) from auth.users where email like '%@example.test'` → 0 (idem).

- [ ] **Step 4 : Relancer la suite complète (régression)**

Run: `npm run test:rls` → tout vert. Re-vérifier le compte d'orphelins APRÈS le run : doit revenir à 0 (les nouveaux démontages purgent tout).

- [ ] **Step 5 : Commit**

```bash
git add supabase/tests/_cleanup-orphans.mjs
git commit -m "$(cat <<'EOF'
tests : script one-shot de purge des tenants de test orphelins

Purge les espaces/users @example.test accumulés par les anciens démontages
(via la logique purge_espace inline en pg privilégié). Réutilisable.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4 : Audit code-reviewer (RÈGLE GRAVÉE) + mémoire + clôture

- [ ] **Step 1 : Suite complète + check:rls**

Run: `npm run test:rls` → tout vert. Run: `npm run check:rls` → ✅ 13 tables (purge_espace est une fonction, pas une table ; aucun impact sur le compte).

- [ ] **Step 2 : AUDIT `superpowers:code-reviewer` (bloquant)**

Dispatcher un agent `superpowers:code-reviewer` sur `0023_purge_espace.sql` + `helpers/teardown.mjs` + `purge-espace.test.mjs` + `_cleanup-orphans.mjs` + les retrofits d'`afterAll`. Brief : vérifier (1) que `app.bypass_owner_guard` est **inatteignable** depuis un client PostgREST (comme `app.bypass_immutable`) et que `protect_last_owner` garde EXACTEMENT sa logique hors-bypass ; (2) que `purge_espace` n'est appelable que par `service_role` (REVOKE FROM PUBLIC + GRANT service_role) — un `authenticated` est refusé ; (3) que l'ordre de suppression (events → null amends_id → cascade) est correct et déterministe (pas de RESTRICT résiduel) ; (4) qu'aucune voie ne permet à un utilisateur normal de purger un espace dont il n'est pas owner, ni de poser les GUC ; (5) que `purge_espace` ne touche QUE l'espace ciblé (pas de fuite cross-espace) ; (6) que le script de nettoyage ne cible QUE les emails `@example.test`. Itérer jusqu'à **PASSANT**.

Expected: rapport **PASSANT**.

- [ ] **Step 3 : Mettre à jour la mémoire**

`project_persistance_multitenant.md` : ajouter **Primitive `purge_espace` ✅ LIVRÉE** (migration `0023`, échappatoire `app.bypass_owner_guard`, SECURITY DEFINER service_role-only, suppression dure d'un tenant ; démontages de test retrofités → fin des orphelins ; effacement sélectif RGPD reste P5). Retirer la « dette de test » de `Reste à faire`. Répercuter dans `MEMORY.md`. Mettre à jour le chip de tâche de fond (résolu) si pertinent.

- [ ] **Step 4 : Clôture**

Annoncer : primitive `purge_espace` livrée + audit PASSANT, démontages de test propres (orphelins purgés, plus de fuite), suite complète verte. Rappeler que l'effacement sélectif RGPD reste P5. Proposer d'enchaîner sur **P0-D** (Auth/Realtime/Storage).

---

## Self-Review

**1. Couverture du besoin :** primitive serveur de suppression dure (T1) + retrofit teardowns (T2) + nettoyage orphelins (T3) + audit (T4). La cause racine du leak (espaces non supprimables) est traitée à la source (`purge_espace`), pas contournée. ✓

**2. Sécurité :** `purge_espace` SECURITY DEFINER mais `EXECUTE` service_role-only ; `app.bypass_owner_guard` inatteignable depuis PostgREST (même garantie que `app.bypass_immutable`, déjà auditée PASSANT en P0-C1) ; `protect_last_owner` conserve sa logique hors-bypass. L'audit T4 le revérifie adversarialement. ✓

**3. Placeholders :** le recensement des tests P0-A (T2 Step 1) est laissé au testeur via Grep car les noms exacts dépendent de l'arborescence — mais le patron de retrofit est explicite et complet. Aucun autre TBD.

**4. Scope :** suppression dure uniquement ; effacement sélectif RGPD explicitement renvoyé à P5. Pas de sur-ingénierie (ni transfert d'ownership, ni anonymisation journal — ce sont des briques RGPD séparées, §11, non requises pour le besoin actuel). ✓
