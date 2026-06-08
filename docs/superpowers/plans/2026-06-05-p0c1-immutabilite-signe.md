# P0-C1 — Immutabilité légale du bail / EDL signé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre un bail / EDL **signé** juridiquement immuable en base (refus de tout `UPDATE`/`DELETE` de la ligne verrouillée), avec chaînage explicite des corrections (avenant `amends_id`, résiliation via `baux_evenements`), sans jamais détruire le signé par cascade, et en restant compatible avec l'import (P0-E).

**Architecture :** On ajoute aux tables existantes `baux` et `edl` (créées en P0-B, migrations `0012`/`0013`) trois colonnes de verrou — `locked`, `content_hash`, `signature_source` — et un **trigger Postgres unique** `prevent_locked_mutation()` (BEFORE UPDATE OR DELETE) qui lève une exception dès que `OLD.locked = true`. Le passage `false → true` (l'acte de verrouiller) reste autorisé ; une fois verrouillé, la ligne est figée. L'`INSERT` n'est jamais intercepté → un signé importé entre déjà verrouillé (import-aware). Une **échappatoire d'administration/import** via le GUC de session `app.bypass_immutable` (inaccessible à un client PostgREST) permet le ré-import idempotent (P0-E) et le démontage de test. La correction d'un signé passe par de **nouveaux artefacts** : avenant = nouveau bail portant `amends_id → original` (l'état « superseded » de l'original est **dérivé**, jamais muté) ; résiliation = ligne dans une nouvelle table `baux_evenements` (sans toucher le bail). Les FK pointant **vers** le signé sont `ON DELETE RESTRICT`.

**Tech Stack :** PostgreSQL 17.6 (Supabase hébergé EU), migrations SQL append-only `supabase/migrations/`, tests Vitest + `@supabase/supabase-js` (clients authentifiés réels) + `pg` (assertions schéma & échappatoire admin). Repo PUBLIC → aucun secret commité.

---

## Contexte de référence (à lire avant de commencer)

- **Spec maîtresse §9** « Immutabilité légale (bail / EDL signé) » : `docs/superpowers/specs/2026-06-04-strategie-persistance-multitenant-design.md` lignes 172-185.
- **Invariants §17** : **10** (`locked` + trigger refusant UPDATE/DELETE + conscient de l'import + hash de contenu), **11** (pas de cascade à travers un signé ; FK vers le signé `ON DELETE RESTRICT`), **21** (chaînage : `amends_id`, `baux_evenements`, `signature_source ∈ {immotrack, externe}` ; trigger sur la ligne signée seulement, jamais sur l'`INSERT` d'un enfant).
- **Tables cibles déjà en place** (NE PAS recréer) : `baux` (`0012`) et `edl` (`0013`) portent déjà `signed_at` (+ `signed_bailleur_at`/`signed_locataire_at` pour `baux`) et `signatures` jsonb, **sans aucune contrainte d'immutabilité**. C'est exactement le point d'accroche prévu.
- **Briques réutilisées** (NE PAS redéfinir) : `public.touch_row()` (`0005`, BEFORE UPDATE → `version`+`updated_at`), `public.freeze_espace_id()` / `trg_freeze_espace_id` (`0009`, `espace_id` immuable), `public.is_member(uuid)` / `public.has_role(uuid, espace_role[])` (`0002`). Pattern RLS uniforme des tables métier : `enable`+`force row level security`, 4 policies (SELECT=`is_member`, INSERT/UPDATE/DELETE=`has_role(espace_id, array['owner','gestionnaire']::public.espace_role[])`).
- **Numérotation migrations** : dernière = `0013`. P0-C1 démarre à **`0014`** et s'arrête à `0017`.
- **Modèle signature côté app** (pour cadrer le sens de `content_hash`, sans le câbler ici) : un bail est « signé » quand `bail.signatures.signedAt` existe ; `bail.signatures.bailSnapshot` (v13.10) fige la version signée. Le `content_hash` sera, plus tard (couche app), un SHA-256 du snapshot canonique calculé **côté client** à la signature et transmis au verrouillage. **En P0-C1, la base ne calcule pas le hash** : elle le stocke et le fige. Les tests utilisent une valeur de hash factice.

## Décisions de conception (déjà tranchées — ne pas rouvrir)

1. **« superseded » est dérivé, pas stocké.** Marquer l'original `superseded` par une colonne mutable impliquerait un `UPDATE` sur une ligne verrouillée → interdit. L'état est donc calculé : un bail est superseded ssi `EXISTS (SELECT 1 FROM baux b2 WHERE b2.amends_id = ce_bail.id AND b2.deleted_at IS NULL)`. De même « résilié » = présence d'un événement `type_evenement='resiliation'`. Aucune vue n'est créée en P0-C1 (YAGNI) ; les tests prouvent la dérivation par requête.
2. **Le trigger refuse UPDATE *et* DELETE** de la ligne verrouillée (spec §9 l.175). L'échappatoire `app.bypass_immutable` couvre l'import idempotent (spec l.284) **et** le démontage de test ; elle est inatteignable depuis PostgREST (un rôle `authenticated`/`anon` ne peut pas exécuter `SET app.*`), donc nulle faille applicative.
3. **Protection « parent »** (impossible de hard-delete un logement/entité portant un bail/EDL signé) : déjà assurée par les FK composites existantes `baux→logements` / `edl→logements` en `NO ACTION` (qui **bloquent** déjà la suppression du parent référencé). On **n'altère pas** ces FK (NO ACTION restreint déjà ; un DROP/ADD serait cosmétique et risqué) ; on **prouve** la protection par un test.
4. **Protection « vers le signé »** (`ON DELETE RESTRICT`, invariant 11) : portée par les **nouvelles** FK qui pointent vers `baux` — `baux.amends_id` (self-FK) et `baux_evenements.bail_id`.
5. **`edl`** reçoit `locked`/`content_hash`/`signature_source` + le trigger, mais **pas** `amends_id` ni `baux_evenements` (chaînage propre au bail).
6. **Cascade espace** : `baux.espace_id → espaces ON DELETE CASCADE` (P0-B) reste tel quel. Conséquence assumée et conforme à la loi : supprimer un espace qui porte un signé verrouillé **échoue** (le trigger lève sur le DELETE cascadé) tant qu'on n'a pas levé `app.bypass_immutable`. La gouvernance d'offboarding/rétention (qui décidera quand purger) relève de P0-C2 (colonnes de rétention) puis d'un flux d'offboarding ultérieur — **hors scope P0-C1**.

## File Structure

- **Create** `supabase/migrations/0014_p0c1_lock_function.sql` — fonction `prevent_locked_mutation()` (échappatoire GUC incluse). Aucune table touchée (fonction seule, comme `0009` introduit `freeze_espace_id`).
- **Create** `supabase/migrations/0015_p0c1_baux_lock.sql` — colonnes `locked`/`content_hash`/`signature_source`/`amends_id` sur `baux` + CHECKs + self-FK `amends_id` `ON DELETE RESTRICT` + trigger `trg_prevent_locked_mutation` sur `baux`.
- **Create** `supabase/migrations/0016_p0c1_edl_lock.sql` — colonnes `locked`/`content_hash`/`signature_source` sur `edl` + CHECKs + trigger `trg_prevent_locked_mutation` sur `edl`.
- **Create** `supabase/migrations/0017_p0c1_baux_evenements.sql` — table `baux_evenements` (résiliation et autres événements) + RLS FORCE + 4 policies + `trg_freeze_espace_id` + `trg_touch_baux_evenements` + FK `bail_id` `ON DELETE RESTRICT`.
- **Create** `supabase/tests/p0c1-immutabilite.test.mjs` — toutes les preuves comportementales (verrou UPDATE/DELETE, lock false→true OK, avenant/superseded, résiliation sans mutation, child-insert OK, parent-delete bloqué, échappatoire admin) avec démontage `pg` GUC-aware.
- **Create** `supabase/tests/helpers/p0c1-fixtures.mjs` — helpers locaux P0-C1 : `lockRow`, `purgeLockedArtefacts` (pg + `set local app.bypass_immutable='on'`), constante `FAKE_HASH`. (On ne touche pas `helpers/clients.mjs` ni `helpers/p0b-fixtures.mjs`.)
- **No change** : `scripts/check-rls-coverage.mjs` détecte automatiquement les tables `force row level security` ; `baux_evenements` y sera comptée. On vérifiera `npm run check:rls` ✅ en fin de plan (pas de modif du script attendue).

---

### Task 1 : Fonction `prevent_locked_mutation()` (migration 0014)

**Files:**
- Create: `supabase/migrations/0014_p0c1_lock_function.sql`
- Create: `supabase/tests/helpers/p0c1-fixtures.mjs`
- Create: `supabase/tests/p0c1-immutabilite.test.mjs`

- [ ] **Step 1 : Écrire la migration 0014 (fonction seule, pas encore branchée)**

Create `supabase/migrations/0014_p0c1_lock_function.sql` :

```sql
-- P0-C1 — Tâche 1/6 : fonction d'immutabilité légale du signé (§9, invariant 10).
-- Branchée comme trigger BEFORE UPDATE OR DELETE sur baux (0015) et edl (0016).
--
-- Règle : dès que OLD.locked = true, tout UPDATE/DELETE est refusé. Le passage
--   false → true (acte de verrouillage à la signature) reste autorisé. L'INSERT
--   n'est JAMAIS intercepté (trigger UPDATE/DELETE only) → un signé importé entre
--   déjà verrouillé (import-aware, §9 l.184).
--
-- Échappatoire admin/import : le GUC de session app.bypass_immutable = 'on' lève le
--   verrou pour CETTE session uniquement. Sert (a) au ré-import idempotent (§9 l.284)
--   et (b) au démontage de test. INACCESSIBLE depuis PostgREST : un rôle authenticated
--   / anon ne peut pas exécuter SET app.* ; current_setting(...) renvoie alors NULL
--   (missing_ok = true) → jamais 'on'. Seule une connexion DB privilégiée (service_role
--   en SQL direct, script d'import) peut l'activer. Pas une faille applicative.
--
-- search_path = '' homogène avec freeze_espace_id (0009) — pas de résolution de schéma
--   implicite (vecteur d'escalade classique d'un SECURITY DEFINER/trigger).

create or replace function public.prevent_locked_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.bypass_immutable', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.locked then
      raise exception 'ROW_LOCKED_IMMUTABLE'
        using detail = format('%s id=%s verrouille (signe) : DELETE refuse', tg_table_name, old.id);
    end if;
    return old;
  else  -- UPDATE
    if old.locked then
      raise exception 'ROW_LOCKED_IMMUTABLE'
        using detail = format('%s id=%s verrouille (signe) : UPDATE refuse', tg_table_name, old.id);
    end if;
    return new;
  end if;
end;
$$;
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push`
Expected: succès, `0014_p0c1_lock_function.sql` appliquée (fonction créée, aucune table modifiée).

- [ ] **Step 3 : Écrire les fixtures locales P0-C1**

Create `supabase/tests/helpers/p0c1-fixtures.mjs` :

```js
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

// Démontage GUC-aware : PURGE les artefacts verrouillés (baux/edl/événements) d'un
// jeu d'espaces, puis laisse le reste au cascade éprouvé de deleteUserByEmail (P0-B).
//
// Pourquoi pas un simple `delete from espaces` : (1) le trigger prevent_locked_mutation
// lèverait sur le DELETE cascadé d'un signé ; (2) le trigger protect_last_owner (0005)
// lèverait LAST_OWNER_PROTECTED sur le cascade d'espace_members. On contourne (1) via
// app.bypass_immutable (session DB privilégiée only), et on ÉVITE (2) en ne touchant
// PAS espaces/espace_members ici — c'est deleteUserByEmail (chemin P0-B prouvé) qui
// supprime ensuite l'utilisateur → cascade propre (plus aucune ligne verrouillée à choker).
//
// Ordre FK-correct (les FK RESTRICT ne sont PAS bypassées par le GUC, seuls les triggers
// le sont) : événements d'abord, puis on casse les self-FK amends_id, puis baux, puis edl.
export async function purgeLockedArtefacts(espaceIds) {
  const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    await c.query('begin')
    await c.query(`set local app.bypass_immutable = 'on'`)
    await c.query(`delete from public.baux_evenements where espace_id = any($1::uuid[])`, [espaceIds])
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
```

- [ ] **Step 4 : Écrire le squelette du test + 1ʳᵉ preuve (verrou UPDATE/DELETE sur baux)**

Create `supabase/tests/p0c1-immutabilite.test.mjs` :

```js
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
```

- [ ] **Step 5 : Lancer le test — il doit ÉCHOUER (colonnes/trigger absents)**

Run: `npm run test:rls -- p0c1`
Expected: ÉCHEC — `lockRow` lève `column "locked" does not exist` (les colonnes + le trigger arrivent en Task 2). C'est le rouge attendu avant Task 2.

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/0014_p0c1_lock_function.sql supabase/tests/helpers/p0c1-fixtures.mjs supabase/tests/p0c1-immutabilite.test.mjs
git commit -m "$(cat <<'EOF'
P0-C1 T1 : fonction prevent_locked_mutation + fixtures/test (rouge attendu)

Fonction d'immutabilité (BEFORE UPDATE/DELETE) avec échappatoire admin GUC
app.bypass_immutable. Test verrou baux + démontage GUC-aware. Colonnes/trigger
branchés en T2 → le test est rouge tant que `locked` n'existe pas.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 : Colonnes de verrou + trigger sur `baux` (migration 0015)

**Files:**
- Create: `supabase/migrations/0015_p0c1_baux_lock.sql`
- Test: `supabase/tests/p0c1-immutabilite.test.mjs` (déjà écrit en Task 1 ; passe au vert ici)

- [ ] **Step 1 : Écrire la migration 0015**

Create `supabase/migrations/0015_p0c1_baux_lock.sql` :

```sql
-- P0-C1 — Tâche 2/6 : verrou d'immutabilité sur baux (§9, invariants 10 & 21).
-- Append-only : ne modifie pas 0012. Ajoute les colonnes de verrou, les CHECKs de
-- cohérence, la self-FK amends_id (avenant) ON DELETE RESTRICT, et branche le trigger.

alter table public.baux
  add column locked           boolean not null default false,
  add column content_hash     text,
  add column signature_source text,
  add column amends_id        uuid;

-- signature_source ∈ {immotrack, externe} (invariant 21).
alter table public.baux
  add constraint baux_signature_source_chk
  check (signature_source is null or signature_source in ('immotrack','externe'));

-- Un bail verrouillé DOIT déclarer sa provenance (pas de verrou anonyme).
alter table public.baux
  add constraint baux_locked_provenance_chk
  check (not locked or signature_source is not null);

-- Un signé ImmoTrack DOIT porter un hash de contenu ; un signé 'externe' importé
-- peut ne pas en avoir (pas de faux hash d'origine, §9 l.181). Sur lignes non
-- verrouillées (P0-B existant : source NULL) la contrainte passe (NULL <> 'immotrack').
alter table public.baux
  add constraint baux_immotrack_hash_chk
  check (signature_source is distinct from 'immotrack' or content_hash is not null);

-- Avenant : nouveau bail portant amends_id → bail original (même espace). ON DELETE
-- RESTRICT (invariant 11) : on ne peut pas supprimer un bail référencé par un avenant.
-- FK composite (amends_id, espace_id) → baux(id, espace_id) : réutilise baux_id_espace_unique.
alter table public.baux
  add constraint baux_amends_fk foreign key (amends_id, espace_id)
    references public.baux (id, espace_id) on delete restrict;

create index baux_by_amends on public.baux (amends_id) where amends_id is not null;

-- Trigger d'immutabilité (fonction définie en 0014). BEFORE UPDATE OR DELETE.
create trigger trg_prevent_locked_mutation
  before update or delete on public.baux
  for each row execute function public.prevent_locked_mutation();
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push`
Expected: succès, colonnes + contraintes + trigger créés sur `baux`. (Les lignes P0-B existantes passent les CHECKs : `locked=false`, `signature_source` NULL.)

- [ ] **Step 3 : Lancer le test P0-C1 — le bloc « verrou (baux) » doit PASSER**

Run: `npm run test:rls -- p0c1`
Expected: les 4 `it` du bloc « verrou d'immutabilité (baux) » PASSENT (lock false→true OK ; UPDATE/DELETE verrouillé refusés ; bail non verrouillé modifiable).

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/0015_p0c1_baux_lock.sql
git commit -m "$(cat <<'EOF'
P0-C1 T2 : verrou d'immutabilité sur baux (locked/hash/source/amends_id + trigger)

Colonnes locked/content_hash/signature_source/amends_id, CHECKs de cohérence
(provenance obligatoire si verrouillé, hash obligatoire si immotrack), self-FK
amends_id ON DELETE RESTRICT, trigger prevent_locked_mutation. Bloc « verrou
(baux) » du test P0-C1 vert.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 : Colonnes de verrou + trigger sur `edl` (migration 0016)

**Files:**
- Create: `supabase/migrations/0016_p0c1_edl_lock.sql`
- Test: `supabase/tests/p0c1-immutabilite.test.mjs` (ajout d'un bloc « verrou (edl) »)

- [ ] **Step 1 : Écrire la migration 0016**

Create `supabase/migrations/0016_p0c1_edl_lock.sql` :

```sql
-- P0-C1 — Tâche 3/6 : verrou d'immutabilité sur edl (§9, invariant 10).
-- Append-only : ne modifie pas 0013. Même verrou que baux, SANS amends_id/baux_evenements
-- (chaînage juridique propre au bail).

alter table public.edl
  add column locked           boolean not null default false,
  add column content_hash     text,
  add column signature_source text;

alter table public.edl
  add constraint edl_signature_source_chk
  check (signature_source is null or signature_source in ('immotrack','externe'));

alter table public.edl
  add constraint edl_locked_provenance_chk
  check (not locked or signature_source is not null);

alter table public.edl
  add constraint edl_immotrack_hash_chk
  check (signature_source is distinct from 'immotrack' or content_hash is not null);

create trigger trg_prevent_locked_mutation
  before update or delete on public.edl
  for each row execute function public.prevent_locked_mutation();
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push`
Expected: succès, colonnes + contraintes + trigger créés sur `edl`.

- [ ] **Step 3 : Ajouter le bloc de test « verrou (edl) »**

Dans `supabase/tests/p0c1-immutabilite.test.mjs`, après le bloc `describe('P0-C1 — verrou d'immutabilité (baux)', …)`, ajouter :

```js
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
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:rls -- p0c1`
Expected: blocs « verrou (baux) » + « verrou (edl) » PASSENT (dont l'EDL externe verrouillé sans hash).

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0016_p0c1_edl_lock.sql supabase/tests/p0c1-immutabilite.test.mjs
git commit -m "$(cat <<'EOF'
P0-C1 T3 : verrou d'immutabilité sur edl (locked/hash/source + trigger)

Mêmes colonnes/CHECKs/trigger que baux, sans amends_id. Bloc « verrou (edl) »
du test P0-C1 vert, dont preuve qu'un EDL "externe" se verrouille sans hash.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4 : Chaînage avenant (`amends_id`) — « superseded » dérivé + RESTRICT

**Files:**
- Test: `supabase/tests/p0c1-immutabilite.test.mjs` (ajout d'un bloc « avenant »)
- *(Aucune migration : `amends_id` + FK posés en Task 2.)*

- [ ] **Step 1 : Ajouter le bloc de test « avenant / superseded »**

Dans `supabase/tests/p0c1-immutabilite.test.mjs`, ajouter après le bloc « verrou (edl) » :

```js
describe('P0-C1 — chaînage avenant (amends_id) : superseded dérivé, original protégé', () => {
  it('un avenant = nouveau bail amends_id → original ; original « superseded » dérivé', async () => {
    // idsA.bail est verrouillé (Task 1/2). On archive d'abord le bail courant pour libérer
    // l'unique partiel "1 bail actif par logement", puis on insère l'avenant.
    // (L'original verrouillé NE PEUT PAS être archivé via UPDATE — il l'est déjà signé ;
    //  on crée donc l'avenant sur un nouveau logement pour isoler la logique de chaînage.)
    const lg = await clientA.from('logements').insert({
      espace_id: espaceA, ref: `LAV-${RUN}`, entite_id: idsA.entite, immeuble_id: idsA.immeuble,
    }).select('id').single()
    const orig = await clientA.from('baux').insert({
      espace_id: espaceA, logement_id: lg.data.id, type_bail: 'nu', hc: 700, archived: true,
    }).select('id').single()
    // verrouiller l'original (signé)
    await lockRow(clientA, 'baux', orig.data.id)
    // avenant = nouveau bail courant pointant vers l'original
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
    // Cas isolé sur la FK (sans verrou) : original NON verrouillé mais amendé → DELETE bloqué
    // par la FK, pas par le trigger.
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
```

- [ ] **Step 2 : Lancer le test**

Run: `npm run test:rls -- p0c1`
Expected: bloc « chaînage avenant » PASSE (avenant créé, superseded dérivé = 1, DELETE de l'original amendé refusé par la FK).

- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/p0c1-immutabilite.test.mjs
git commit -m "$(cat <<'EOF'
P0-C1 T4 : preuve chaînage avenant (amends_id) — superseded dérivé + RESTRICT

Avenant = nouveau bail amends_id → original ; « superseded » est dérivé (jamais
muté sur le signé). DELETE d'un bail amendé refusé par la FK ON DELETE RESTRICT.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5 : Table `baux_evenements` (résiliation sans muter le signé) — migration 0017

**Files:**
- Create: `supabase/migrations/0017_p0c1_baux_evenements.sql`
- Test: `supabase/tests/p0c1-immutabilite.test.mjs` (ajout d'un bloc « résiliation »)

- [ ] **Step 1 : Écrire la migration 0017**

Create `supabase/migrations/0017_p0c1_baux_evenements.sql` :

```sql
-- P0-C1 — Tâche 5/6 : table baux_evenements (§9 l.178, invariant 21).
-- Résiliation / congé / révision = ÉVÉNEMENT rattaché au bail, SANS toucher la ligne
-- signée verrouillée. L'état « résilié » est dérivé de la présence d'un événement.
-- Pattern RLS/triggers strictement identique aux tables métier P0-B.

create table public.baux_evenements (
  id             uuid primary key default gen_random_uuid(),
  espace_id      uuid not null references public.espaces(id) on delete cascade,
  bail_id        uuid not null,
  type_evenement text not null
    check (type_evenement in ('resiliation','conge','renouvellement','revision_loyer','autre')),
  date_evenement date not null,
  motif          text,
  payload        jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  version        bigint not null default 1,
  created_by     uuid default auth.uid() references auth.users(id),
  constraint baux_evenements_id_espace_unique unique (id, espace_id),
  -- ON DELETE RESTRICT : on ne supprime pas un bail qui porte des événements (invariant 11).
  constraint baux_evenements_bail_fk foreign key (bail_id, espace_id)
    references public.baux (id, espace_id) on delete restrict
);

create index baux_evenements_by_espace_bail on public.baux_evenements (espace_id, bail_id);
create index baux_evenements_by_type on public.baux_evenements (espace_id, type_evenement);

create trigger trg_touch_baux_evenements
  before update on public.baux_evenements
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes P0-B) ───────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['baux_evenements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('create trigger trg_freeze_espace_id before update on public.%I for each row execute function public.freeze_espace_id()', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(espace_id))',
                   t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(espace_id, %s))',
                   t || '_insert', t, writers);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_role(espace_id, %s)) with check (public.has_role(espace_id, %s))',
                   t || '_update', t, writers, writers);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_role(espace_id, %s))',
                   t || '_delete', t, writers);
  end loop;
end
$rls$;
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push`
Expected: succès, table `baux_evenements` + RLS FORCE + 4 policies + triggers créés.

- [ ] **Step 3 : Ajouter le bloc de test « résiliation »**

Dans `supabase/tests/p0c1-immutabilite.test.mjs`, ajouter après le bloc « chaînage avenant » :

```js
describe('P0-C1 — résiliation via baux_evenements : le signé n\'est PAS muté', () => {
  it('un événement « resiliation » se crée sans toucher la ligne signée verrouillée', async () => {
    // idsA.bail est verrouillé (Task 1/2). On capture son état AVANT, on crée l'événement,
    // on relit APRÈS : version + updated_at + signed_at + locked inchangés.
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
```

- [ ] **Step 4 : Lancer le test + la garde de couverture RLS**

Run: `npm run test:rls -- p0c1`
Expected: bloc « résiliation » PASSE (événement créé sans bump de version/updated_at sur le signé ; DELETE d'un bail à événements refusé).

Run: `npm run check:rls`
Expected: ✅ — `baux_evenements` détectée comme protégée (12 tables au total).

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0017_p0c1_baux_evenements.sql supabase/tests/p0c1-immutabilite.test.mjs
git commit -m "$(cat <<'EOF'
P0-C1 T5 : table baux_evenements (résiliation sans muter le signé) + RLS

Événement rattaché au bail (FK ON DELETE RESTRICT) ; l'INSERT d'un enfant ne
bumpe pas la ligne signée. État « résilié » dérivé. RLS FORCE + 4 policies +
freeze/touch uniformes. check:rls vert (baux_evenements protégée).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6 : Preuves transverses (child-insert OK, parent-delete bloqué, échappatoire admin) + audit code-reviewer + clôture

**Files:**
- Test: `supabase/tests/p0c1-immutabilite.test.mjs` (dernier bloc « invariants transverses »)
- Modify: `C:\Users\Did_K\.claude\projects\C--Users-Did-K-Desktop-Immo\memory\project_persistance_multitenant.md`

- [ ] **Step 1 : Ajouter le bloc de test « invariants transverses »**

Dans `supabase/tests/p0c1-immutabilite.test.mjs`, ajouter en dernier bloc :

```js
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
```

- [ ] **Step 2 : Lancer toute la suite RLS (P0-A + P0-B + P0-C1) — tout vert**

Run: `npm run test:rls`
Expected: la suite complète PASSE (P0-A + P0-B 139 + nouveaux P0-C1). Aucun test rouge, aucun user de test laissé en base (démontage GUC-aware OK).

Run: `npm run check:rls`
Expected: ✅ 12 tables protégées.

- [ ] **Step 3 : Commit des preuves transverses**

```bash
git add supabase/tests/p0c1-immutabilite.test.mjs
git commit -m "$(cat <<'EOF'
P0-C1 T6 : preuves transverses (child-insert OK, parent-delete bloqué, bypass admin)

Le trigger ne touche que la ligne signée (quittance/mouvement enfants OK) ;
hard-delete d'un logement portant un signé refusé ; échappatoire app.bypass_immutable
prouvée (import P0-E) et service_role bloqué sans elle. Suite RLS complète verte.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4 : AUDIT `superpowers:code-reviewer` (RÈGLE GRAVÉE — bloquant)**

Dispatcher un agent `superpowers:code-reviewer` sur l'ensemble P0-C1 (migrations `0014`→`0017` + `p0c1-immutabilite.test.mjs` + `helpers/p0c1-fixtures.mjs`). Brief : vérifier (1) qu'aucun chemin applicatif (`authenticated`/`anon` via PostgREST) ne peut contourner le verrou ni activer `app.bypass_immutable` ; (2) que le trigger ne bloque jamais un `INSERT` d'enfant ; (3) la cohérence des CHECKs (verrou ⇒ provenance ; immotrack ⇒ hash) ; (4) l'absence de faille d'isolation cross-tenant introduite par `amends_id`/`baux_evenements` ; (5) que les tests prouvent réellement le comportement (pas de faux-positif type « 0 ligne touchée car invisible »). Itérer jusqu'à **PASSANT** (0 Critical/Important résiduel). Corriger en migration **append-only** (`0018+`) si une faille schéma est trouvée ; en test seul si seule la preuve manque.

Expected: rapport **PASSANT**.

- [ ] **Step 5 : Mettre à jour le suivi epic (mémoire, pas BACKLOG)**

Modifier `C:\Users\Did_K\.claude\projects\C--Users-Did-K-Desktop-Immo\memory\project_persistance_multitenant.md` :
- Dans `## État d'avancement P0`, ajouter une entrée **P0-C1 ✅ LIVRÉ** : migrations `0014`→`0017`, fonction `prevent_locked_mutation` (UPDATE/DELETE, échappatoire GUC `app.bypass_immutable`), colonnes `locked`/`content_hash`/`signature_source` sur `baux`+`edl`, `amends_id` (avenant, superseded dérivé), table `baux_evenements` (résiliation), CHECKs (provenance/hash), FK `ON DELETE RESTRICT` vers le signé, tests P0-C1 verts, `check:rls` 12 tables, audit code-reviewer PASSANT.
- Mettre à jour `## Reste à faire` : retirer l'immutabilité de P0-C, ne garder que **P0-C2** (gating : table `plans` data-driven + `espace.plan_id` + ligne `free` + helper de contrôle ; colonnes de rétention `retention_class`/`legal_basis`/`retention_until`), puis P0-D, P0-E (⚠️ réinitialiser le mot de passe DB Supabase avant l'import réel).

- [ ] **Step 6 : Clôture**

Annoncer à l'utilisateur : P0-C1 livré (immutabilité légale du signé), audit code-reviewer PASSANT, suite RLS complète verte. Rappeler qu'il n'y a **rien à tester manuellement côté app** (P0-C1 = infra base, ne touche pas `index.html`) ; le câblage UI (calcul du `content_hash` côté client, bouton « verrouiller à la signature ») viendra avec l'intégration app ultérieure. Proposer d'enchaîner sur **P0-C2** (gating hooks + colonnes de rétention).

---

## Self-Review (relecture finale du plan vs spec)

**1. Couverture spec §9 / invariants 10-11-21 :**
- Invariant 10 (`locked` + trigger UPDATE/DELETE + import-aware + hash) → Tasks 1-3. ✓ (import-aware = INSERT jamais intercepté + échappatoire GUC ; hash = colonne + CHECK immotrack⇒hash.)
- Invariant 11 (pas de cascade à travers le signé ; FK vers le signé `ON DELETE RESTRICT`) → `amends_id` (T2) + `baux_evenements.bail_id` (T5) en RESTRICT ; parent-delete bloqué prouvé (T6). ✓
- Invariant 21 (`amends_id`, `baux_evenements`, `signature_source ∈ {immotrack,externe}`, trigger sur la ligne signée seulement) → T2/T4/T5/T6. ✓
- §9 l.180 (quittance créée après signature non bloquée) → T6 child-insert. ✓
- §9 l.181 (signature externe sans faux hash) → CHECK + test EDL externe (T3). ✓
- §9 l.184 (import déjà verrouillé) → INSERT non intercepté + échappatoire (T1/T6). ✓

**2. Placeholders :** aucun « TBD/TODO » ; tout le SQL et tous les tests sont complets et exécutables.

**3. Cohérence des types/symboles :** `prevent_locked_mutation` (0014) référencée par `trg_prevent_locked_mutation` (0015/0016) ; `lockRow`/`FAKE_HASH`/`purgeLockedArtefacts` (fixtures) utilisés tels quels dans le test ; `baux_id_espace_unique` (0012) réutilisée par `baux_amends_fk` ; `touch_row`/`freeze_espace_id`/`is_member`/`has_role` réutilisées sans redéfinition. ✓

**4. Scope :** P0-C1 = immutabilité légale uniquement. Gating et rétention explicitement renvoyés à P0-C2. Offboarding/purge espace renvoyé hors P0-C1. ✓
