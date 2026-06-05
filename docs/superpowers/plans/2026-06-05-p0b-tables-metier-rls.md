# P0-B — Tables métier cœur + RLS + intégrité référentielle — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porter les 9 collections métier « cœur » d'ImmoTrack (entités, immeubles, logements, documents, mouvements, quittances, baux, baux_historique, EDL) en tables Postgres multi-tenant, isolées par RLS forcée et garanties par l'intégrité référentielle déclarative, sur le socle P0-A.

**Architecture :** Chaque table métier porte `espace_id` (estampillé non nul, dénormalisé jusqu'aux feuilles, §17-3). La cohérence parent/enfant est garantie par **clé étrangère composite** `(parent_id, espace_id) → parent(id, espace_id)` — déclarative, vérifiée par Postgres, active même sous `service_role` (§17-4). Modélisation **hybride** validée avec le porteur : colonnes réelles + FK pour tout ce qui relie les tables (espace, entité, immeuble, logement, montants, dates, statuts, verrous de signature) ; le détail imbriqué auto-contenu (gérants, pièces/éléments d'un EDL, mobilier, descriptif, signatures-images, snapshots) reste en `jsonb`. Isolation par RLS **FORCE** + 4 policies par commande réutilisant `is_member` / `has_role` de P0-A, appliquées uniformément via une boucle DDL (zéro divergence entre tables). Soft-delete via `deleted_at` partout (§17-9), versioning via `version bigint` + trigger `touch_row()` réutilisé (§17-8).

**Tech Stack :** Supabase hébergé EU (Postgres 17.6), migrations SQL append-only poussées via `supabase db push`, tests d'isolation Vitest + `@supabase/supabase-js` (clients authentifiés réels → passent par la RLS) + `pg` (introspection schéma). Garde CI `check:rls` (scan automatique de toutes les tables `public`).

---

## Décisions de modélisation (déjà tranchées, ne pas re-questionner)

1. **Imbrication → Hybride.** Colonnes réelles + FK pour les liens inter-tables, montants, dates, statuts, verrous de signature ; `jsonb` pour le détail imbriqué auto-contenu. *Validé en séance.*
2. **Immeubles → table dédiée.** Sortis de l'entité (aujourd'hui imbriqués) car référencés partout (`logement.imm`, `mouvements.imm`). `uuid` + `espace_id` + FK composite vers l'entité. *Validé en séance.*
3. **Identifiants → `uuid` PK** (`gen_random_uuid()`). L'ancien id numérique `nid()` (et la clé `ref` du dict `baux`) est conservé en colonne `legacy_id` / `legacy_ref` `text` pour le mapping au ré-import (P0-E). Aucune logique métier ne dépend de `legacy_id`.
4. **FK polymorphes normalisées.** `mouvements.qui` (`logement.ref` *xor* `'SCI:'+entité.nom`) → deux FK exclusives `logement_id` / `entite_id` + CHECK d'exclusivité. `documents.parent` (`'mouvement'|'immeuble'`) reste polymorphe (`parent_type` + `parent_id`, **pas** de FK dure — exception documentée ; cohérence `espace_id` garantie par RLS, validation d'existence repoussée à un trigger P0-C si besoin).
5. **Politique de suppression.** `espace_id → espaces(id) ON DELETE CASCADE` sur **chaque** table (offboarding d'un tenant = purge atomique de l'espace). Toutes les FK parent **intra-espace** sont en `NO ACTION` (RESTRICT) : impossible de supprimer physiquement un parent qui a des enfants → zéro perte silencieuse de dossiers (comptabilité). L'usage normal = soft-delete (`deleted_at`).
6. **`created_by uuid default auth.uid()`** nullable (référence `auth.users`). Sous client authentifié → l'appelant ; sous `service_role` (import P0-E) → `null` (renseigné explicitement à l'import).

**EXCLU de P0-B (→ P0-C)** : immutabilité du bail/EDL signé (triggers sur `signed_at`), rétention/purge programmée, plans d'abonnement & gating. Les colonnes `signed_at` / `signed_*_at` sont **créées** dès P0-B (pour que P0-C n'ait qu'à brancher le trigger), mais aucune contrainte d'immutabilité n'est posée ici.

---

## File Structure

**Migrations** (append-only, ne JAMAIS modifier 0001-0007 déjà poussées) :

- Create `supabase/migrations/0008_p0b_entites_immeubles.sql` — tables `entites` + `immeubles`, FK composite, RLS, index.
- Create `supabase/migrations/0009_p0b_logements_documents.sql` — tables `logements` + `documents`.
- Create `supabase/migrations/0010_p0b_mouvements_quittances.sql` — tables `mouvements` + `quittances`.
- Create `supabase/migrations/0011_p0b_baux.sql` — tables `baux` + `baux_historique`.
- Create `supabase/migrations/0012_p0b_edl.sql` — table `edl`.

**Tests** :

- Create `supabase/tests/p0b-schema.test.mjs` — introspection : existence table, FORCE RLS, ≥4 policies, colonnes socle, unique `(id, espace_id)`, par table.
- Create `supabase/tests/p0b-isolation.test.mjs` — preuve d'isolation cross-tenant + rejet FK composite cross-espace + CHECK d'exclusivité `mouvements`.
- Create `supabase/tests/helpers/p0b-fixtures.mjs` — `seedChain(client, espaceId)` : sème une chaîne complète (entité→immeuble→logement→document→mouvement→quittance→bail→historique→EDL) et renvoie les ids ; `BUSINESS_TABLES` (liste ordonnée).

**Aucune modification de** `index.html`, `BACKLOG.md`, ni d'aucun fichier hors `supabase/` + le plan : la couche Store JS (lecture/écriture des tables) est P1-P2, hors P0-B.

---

## Préambule technique (rappels P0-A, à appliquer à chaque tâche)

**Pousser une migration (non interactif, mot de passe jamais loggé)** — depuis la racine du repo :

```bash
DBURL=$(node -e "const fs=require('fs');const m=fs.readFileSync('.env','utf8').match(/^SUPABASE_DB_URL=(.*)$/m);process.stdout.write(m[1].trim())")
npx supabase db push --db-url "$DBURL" --yes
```

**Lancer les tests d'isolation** : `npm run test:rls`
**Garde de couverture RLS** : `npm run check:rls` (échoue si une table `public` n'a pas FORCE RLS + ≥1 policy)

**Conventions reprises de P0-A** (à respecter à l'identique) :
- `version bigint not null default 1` ; `created_at`/`updated_at timestamptz not null default now()` ; `deleted_at timestamptz` (nullable) ; `created_by uuid default auth.uid() references auth.users(id)`.
- Trigger versioning : `before update ... for each row execute function public.touch_row();` (fonction définie en 0005, durcie `search_path=''` en 0006 — **réutilisée telle quelle**).
- Helpers RLS : `public.is_member(espace_id)` (membre actif) et `public.has_role(espace_id, array['owner','gestionnaire']::public.espace_role[])` (droits d'écriture).
- `pg.Client` : toujours `ssl: { rejectUnauthorized: false }`.
- Emails de test **uniques par run** (suffixe `RUN`) — voir helper existant `supabase/tests/helpers/clients.mjs` et le pattern de `rls-isolation.test.mjs`.

**Bloc RLS standard (réutilisé dans CHAQUE migration, adapté à la liste de tables de la migration).** Appliquer FORCE RLS + les 4 policies identiques par boucle DDL garantit l'uniformité (aucune table ne peut diverger ou être oubliée — l'audit cross-tenant l'exige) :

```sql
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array[ /* tables de CETTE migration */ ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
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

> Règle métier RLS uniforme pour toutes les tables métier : **lecture** = tout membre actif (`is_member`, inclut `lecture_seule` et `proprietaire`/D13) ; **écriture** (insert/update/delete) = `owner` + `gestionnaire` uniquement. Le soft-delete passe par un UPDATE de `deleted_at` (couvert par la policy update) ; la policy delete couvre la suppression physique (rare, réservée owner/gestionnaire).

---

## Task 1 : Tables `entites` + `immeubles` + harnais de test

**Files:**
- Create: `supabase/migrations/0008_p0b_entites_immeubles.sql`
- Create: `supabase/tests/helpers/p0b-fixtures.mjs`
- Create: `supabase/tests/p0b-schema.test.mjs`
- Create: `supabase/tests/p0b-isolation.test.mjs`

- [ ] **Step 1 : Écrire le harnais fixtures (incomplet pour l'instant, étendu à chaque tâche)**

Create `supabase/tests/helpers/p0b-fixtures.mjs` :

```js
// Liste ordonnée des tables métier P0-B (ordre = dépendances FK ascendantes).
// Étendue tâche par tâche ; les tests itèrent dessus.
export const BUSINESS_TABLES = [
  'entites',
  'immeubles',
]

// Sème une chaîne métier complète DANS un espace donné, via un client authentifié
// (owner/gestionnaire de l'espace → autorisé par la RLS). Renvoie les ids créés.
// Étendue tâche par tâche au fil de l'ajout des tables.
export async function seedChain(client, espaceId) {
  const tag = espaceId.slice(0, 8)
  const ids = {}
  const ins = async (table, row) => {
    const { data, error } = await client.from(table)
      .insert({ espace_id: espaceId, ...row }).select('id').single()
    if (error) throw new Error(`seed ${table}: ${error.message}`)
    return data.id
  }
  ids.entite   = await ins('entites',   { nom: `Entité ${tag}` })
  ids.immeuble = await ins('immeubles', { entite_id: ids.entite, nom: `Imm ${tag}` })
  return ids
}
```

- [ ] **Step 2 : Écrire le test de schéma (échouera : tables absentes)**

Create `supabase/tests/p0b-schema.test.mjs` :

```js
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
           select array_agg(att.attname order by att.attname)
           from unnest(con.conkey) as k
           join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
         ) = array['espace_id','id']`, [name])
    return {
      exists: meta.rowCount === 1,
      row: meta.rows[0],
      cols: new Set(cols.rows.map(r => r.column_name)),
      hasIdEspaceUnique: uniq.rowCount >= 1,
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
      it('colonnes socle (espace_id/version/created_at/updated_at/deleted_at)', async () => {
        const { cols } = await inspect(table)
        for (const col of ['espace_id', 'version', 'created_at', 'updated_at', 'deleted_at'])
          expect(cols.has(col), `${table}.${col}`).toBe(true)
      })
      it('contrainte unique (id, espace_id) pour FK composite', async () => {
        expect((await inspect(table)).hasIdEspaceUnique).toBe(true)
      })
    })
  }
})
```

- [ ] **Step 3 : Lancer le test, vérifier qu'il échoue**

Run : `npm run test:rls -- p0b-schema`
Expected : FAIL — `entites`/`immeubles` n'existent pas (`exists` = false).

- [ ] **Step 4 : Écrire la migration 0008**

Create `supabase/migrations/0008_p0b_entites_immeubles.sql` :

```sql
-- P0-B — Tâche 1/6 : tables métier socle « entités » + « immeubles ».
-- Modélisation hybride (validée porteur) : colonnes+FK pour les liens, jsonb pour le détail imbriqué.
-- Immeubles = table dédiée (référencés partout : logement.imm, mouvements.imm).
-- Invariants §17 appliqués à chaque table métier :
--   §17-3 espace_id non nul ; §17-4 FK composite (parent_id, espace_id) ;
--   §17-5 index composite (espace_id, …) ; §17-6 FORCE RLS + policies ;
--   §17-8 version+updated_at via touch_row() (0005) ; §17-9 soft-delete deleted_at.
-- Suppression : espace_id ON DELETE CASCADE (offboarding) ; FK parent intra-espace NO ACTION.
-- pgcrypto (gen_random_uuid) déjà activé en 0001.

-- ── entités ──────────────────────────────────────────────────────────────────
create table public.entites (
  id              uuid primary key default gen_random_uuid(),
  espace_id       uuid not null references public.espaces(id) on delete cascade,
  legacy_id       text,                                  -- ancien id numérique nid() (mapping P0-E)
  nom             text not null check (length(trim(nom)) > 0),
  type            text,                                  -- SCI, SARL, nom propre…
  siren           text,
  rcs             text,
  gerant          text,                                  -- gérant principal (affichage)
  gerants         jsonb not null default '[]'::jsonb,    -- liste des gérants (détail auto-contenu)
  siege           text,
  iban            text,
  bic             text,
  email_envoi     text,
  signature       jsonb,                                 -- dataURL signature + méta
  logo            text,                                  -- dataURL logo
  drive_folder_id text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  version         bigint not null default 1,
  created_by      uuid default auth.uid() references auth.users(id),
  constraint entites_id_espace_unique unique (id, espace_id)  -- requis pour FK composite enfant
);

create index entites_by_espace on public.entites (espace_id);
create unique index entites_nom_unique
  on public.entites (espace_id, lower(nom)) where deleted_at is null;

create trigger trg_touch_entites
  before update on public.entites
  for each row execute function public.touch_row();

-- ── immeubles ──────────────────────────────────────────────────────────────────
create table public.immeubles (
  id          uuid primary key default gen_random_uuid(),
  espace_id   uuid not null references public.espaces(id) on delete cascade,
  entite_id   uuid not null,
  legacy_id   text,
  nom         text not null check (length(trim(nom)) > 0),
  adresse     text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     bigint not null default 1,
  created_by  uuid default auth.uid() references auth.users(id),
  constraint immeubles_id_espace_unique unique (id, espace_id),
  -- §17-4 : l'immeuble et son entité parente vivent dans le MÊME espace (déclaratif)
  constraint immeubles_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id)
);

create index immeubles_by_espace_entite on public.immeubles (espace_id, entite_id);

create trigger trg_touch_immeubles
  before update on public.immeubles
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['entites','immeubles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
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

- [ ] **Step 5 : Pousser la migration**

Run (cf. préambule) :
```bash
DBURL=$(node -e "const fs=require('fs');const m=fs.readFileSync('.env','utf8').match(/^SUPABASE_DB_URL=(.*)$/m);process.stdout.write(m[1].trim())")
npx supabase db push --db-url "$DBURL" --yes
```
Expected : `Applying migration 0008_p0b_entites_immeubles.sql...` puis succès.

- [ ] **Step 6 : Relancer le test de schéma, vérifier qu'il passe**

Run : `npm run test:rls -- p0b-schema`
Expected : PASS pour `entites` et `immeubles` (existe, RLS forcée + 4 policies, colonnes socle, unique (id, espace_id)).

- [ ] **Step 7 : Écrire le test d'isolation cross-tenant (harnais Alice/Bob/Carol + assertions par table)**

Create `supabase/tests/p0b-isolation.test.mjs` :

```js
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
```

- [ ] **Step 8 : Lancer le test d'isolation, vérifier qu'il passe**

Run : `npm run test:rls -- p0b-isolation`
Expected : PASS — Bob ne voit/ne touche rien chez Alice ; Carol lit mais ne touche rien.

- [ ] **Step 9 : Vérifier la garde CI de couverture RLS**

Run : `npm run check:rls`
Expected : `✅ Couverture RLS OK — N table(s) public, toutes protégées.` (N inclut désormais `entites`, `immeubles`).

- [ ] **Step 10 : Commit**

```bash
git add supabase/migrations/0008_p0b_entites_immeubles.sql \
        supabase/tests/helpers/p0b-fixtures.mjs \
        supabase/tests/p0b-schema.test.mjs \
        supabase/tests/p0b-isolation.test.mjs
git commit -m "$(cat <<'EOF'
P0-B T1 : tables entites + immeubles (RLS forcée + FK composite + harnais tests)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 : Tables `logements` + `documents`

**Files:**
- Create: `supabase/migrations/0009_p0b_logements_documents.sql`
- Modify: `supabase/tests/helpers/p0b-fixtures.mjs`

- [ ] **Step 1 : Étendre le harnais fixtures (le test de schéma échouera pour les nouvelles tables)**

Modify `supabase/tests/helpers/p0b-fixtures.mjs` — étendre `BUSINESS_TABLES` et `seedChain` :

```js
export const BUSINESS_TABLES = [
  'entites',
  'immeubles',
  'logements',
  'documents',
]
```

Dans `seedChain`, après la ligne `ids.immeuble = ...`, ajouter :

```js
  ids.logement = await ins('logements', {
    entite_id: ids.entite, immeuble_id: ids.immeuble, ref: `F-${tag}`,
    type: 'appartement', surface: 42, loyer_hc_ref: 700, charges_ref: 100,
  })
  ids.document = await ins('documents', {
    name: 'bail.pdf', mime: 'application/pdf', size: 12345,
    parent_type: 'immeuble', parent_id: ids.immeuble,
  })
```

- [ ] **Step 2 : Lancer le test de schéma, vérifier qu'il échoue pour les nouvelles tables**

Run : `npm run test:rls -- p0b-schema`
Expected : FAIL — `logements` et `documents` n'existent pas encore.

- [ ] **Step 3 : Écrire la migration 0009**

Create `supabase/migrations/0009_p0b_logements_documents.sql` :

```sql
-- P0-B — Tâche 2/6 : tables « logements » + « documents ».
-- logement.entity (string nom) → entite_id FK ; logement.imm (string) → immeuble_id FK.
-- Champs bail courant dénormalisés legacy → legacy_bail jsonb (fidélité ré-import, déprécié).
-- documents.parent polymorphe ('mouvement'|'immeuble') → parent_type+parent_id SANS FK dure
--   (exception documentée ; cohérence espace_id par RLS).

-- ── logements ──────────────────────────────────────────────────────────────────
create table public.logements (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  legacy_id     text,
  ref           text not null check (length(trim(ref)) > 0),  -- clé métier "F-001"
  entite_id     uuid not null,
  immeuble_id   uuid,
  type          text,
  type_usage    text,
  surface       numeric,
  etage         text,
  num_apt       text,
  adresse       text,
  npp           text,
  pieces_desc   jsonb,
  tantiemes     text,
  lot           text,
  num_fiscal    text,
  loyer_hc_ref  numeric,
  charges_ref   numeric,
  chauffage     jsonb,
  ecs           jsonb,
  diagnostics   jsonb,
  equipements   jsonb,
  mobilier      jsonb,
  presentation  jsonb,
  drive_folders jsonb,
  legacy_bail   jsonb,    -- anciens champs bail courant (locataire/hc/ch/dg/irl) — fidélité ré-import
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       bigint not null default 1,
  created_by    uuid default auth.uid() references auth.users(id),
  constraint logements_id_espace_unique unique (id, espace_id),
  constraint logements_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id),
  constraint logements_immeuble_fk foreign key (immeuble_id, espace_id)
    references public.immeubles (id, espace_id)
);

create unique index logements_ref_unique
  on public.logements (espace_id, ref) where deleted_at is null;
create index logements_by_espace_entite   on public.logements (espace_id, entite_id);
create index logements_by_espace_immeuble on public.logements (espace_id, immeuble_id);

create trigger trg_touch_logements
  before update on public.logements
  for each row execute function public.touch_row();

-- ── documents ──────────────────────────────────────────────────────────────────
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  legacy_id     text,
  name          text,
  mime          text,
  size          bigint,
  idb_key       text,                -- ancienne clé IndexedDB (binaire migré vers Storage en P0-D)
  storage_path  text,                -- futur chemin objet Supabase Storage
  drive_file_id text,
  parent_type   text check (parent_type in ('mouvement','immeuble')),
  parent_id     uuid,                -- polymorphe : pas de FK dure (exception documentée)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       bigint not null default 1,
  created_by    uuid default auth.uid() references auth.users(id),
  constraint documents_id_espace_unique unique (id, espace_id)
);

create index documents_by_espace_parent on public.documents (espace_id, parent_type, parent_id);

create trigger trg_touch_documents
  before update on public.documents
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['logements','documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
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

- [ ] **Step 4 : Pousser la migration**

Run :
```bash
DBURL=$(node -e "const fs=require('fs');const m=fs.readFileSync('.env','utf8').match(/^SUPABASE_DB_URL=(.*)$/m);process.stdout.write(m[1].trim())")
npx supabase db push --db-url "$DBURL" --yes
```
Expected : `Applying migration 0009_p0b_logements_documents.sql...` puis succès.

- [ ] **Step 5 : Relancer schéma + isolation, vérifier qu'ils passent**

Run : `npm run test:rls -- p0b`
Expected : PASS — les 4 tables (`entites`, `immeubles`, `logements`, `documents`) passent schéma + isolation.

- [ ] **Step 6 : Garde CI**

Run : `npm run check:rls`
Expected : `✅ Couverture RLS OK` (inclut `logements`, `documents`).

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/0009_p0b_logements_documents.sql supabase/tests/helpers/p0b-fixtures.mjs
git commit -m "$(cat <<'EOF'
P0-B T2 : tables logements + documents (FK composite entité/immeuble, RLS forcée)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 : Tables `mouvements` + `quittances`

**Files:**
- Create: `supabase/migrations/0010_p0b_mouvements_quittances.sql`
- Modify: `supabase/tests/helpers/p0b-fixtures.mjs`

- [ ] **Step 1 : Étendre le harnais fixtures**

Modify `supabase/tests/helpers/p0b-fixtures.mjs` :

```js
export const BUSINESS_TABLES = [
  'entites',
  'immeubles',
  'logements',
  'documents',
  'mouvements',
  'quittances',
]
```

Dans `seedChain`, après `ids.document = ...`, ajouter :

```js
  ids.mouvement = await ins('mouvements', {
    date_mouvement: '2026-01-15', libelle: 'Loyer janvier',
    logement_id: ids.logement, categorie: 'loyer', credit: 800,
    pj_document_id: ids.document,
  })
  ids.quittance = await ins('quittances', {
    logement_id: ids.logement, entite_id: ids.entite, mois: '2026-01',
    hc: 700, ch: 100, date_paiement: '2026-01-05',
    payment_matched_mvt_id: ids.mouvement,
  })
```

- [ ] **Step 2 : Lancer le test de schéma, vérifier qu'il échoue pour les nouvelles tables**

Run : `npm run test:rls -- p0b-schema`
Expected : FAIL — `mouvements`/`quittances` absentes.

- [ ] **Step 3 : Écrire la migration 0010**

Create `supabase/migrations/0010_p0b_mouvements_quittances.sql` :

```sql
-- P0-B — Tâche 3/6 : tables « mouvements » + « quittances ».
-- mouvements.qui polymorphe (logement.ref XOR 'SCI:'+entité.nom) → 2 FK exclusives + CHECK.
-- mouvements.pjId → pj_document_id FK composite vers documents.
-- quittances : 1 par (logement, mois) actif (unique partiel).

-- ── mouvements ──────────────────────────────────────────────────────────────────
create table public.mouvements (
  id             uuid primary key default gen_random_uuid(),
  espace_id      uuid not null references public.espaces(id) on delete cascade,
  legacy_id      text,
  date_mouvement date not null,
  libelle        text,
  immeuble_id    uuid,
  categorie      text,
  logement_id    uuid,                       -- « qui » = un logement…
  entite_id      uuid,                       -- … OU une SCI (entité), jamais les deux
  debit          numeric not null default 0,
  credit         numeric not null default 0,
  facture        text,
  compteur_cc_id text,                       -- ref legacy compteur charges communes
  pj_document_id uuid,                        -- pièce jointe (justificatif)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  version        bigint not null default 1,
  created_by     uuid default auth.uid() references auth.users(id),
  constraint mouvements_id_espace_unique unique (id, espace_id),
  constraint mouvements_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id),
  constraint mouvements_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id),
  constraint mouvements_immeuble_fk foreign key (immeuble_id, espace_id)
    references public.immeubles (id, espace_id),
  constraint mouvements_pj_fk foreign key (pj_document_id, espace_id)
    references public.documents (id, espace_id),
  -- « qui » cible AU PLUS une entité métier (logement xor SCI)
  constraint mouvements_qui_exclusif check (
    not (logement_id is not null and entite_id is not null)
  )
);

create index mouvements_by_espace_date     on public.mouvements (espace_id, date_mouvement);
create index mouvements_by_espace_logement on public.mouvements (espace_id, logement_id);
create index mouvements_by_espace_entite   on public.mouvements (espace_id, entite_id);

create trigger trg_touch_mouvements
  before update on public.mouvements
  for each row execute function public.touch_row();

-- ── quittances ──────────────────────────────────────────────────────────────────
create table public.quittances (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  legacy_id     text,
  logement_id   uuid not null,
  entite_id     uuid,
  locataire     text,                         -- snapshot du nom locataire à l'émission
  mois          text not null,                -- 'AAAA-MM'
  hc            numeric not null default 0,
  ch            numeric not null default 0,
  date_paiement date,
  date_quittance date,
  payment_matched_mvt_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       bigint not null default 1,
  created_by    uuid default auth.uid() references auth.users(id),
  constraint quittances_id_espace_unique unique (id, espace_id),
  constraint quittances_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id),
  constraint quittances_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id),
  constraint quittances_mvt_fk foreign key (payment_matched_mvt_id, espace_id)
    references public.mouvements (id, espace_id)
);

create unique index quittances_logement_mois_unique
  on public.quittances (espace_id, logement_id, mois) where deleted_at is null;
create index quittances_by_espace_logement on public.quittances (espace_id, logement_id);

create trigger trg_touch_quittances
  before update on public.quittances
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['mouvements','quittances'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
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

- [ ] **Step 4 : Pousser la migration**

Run :
```bash
DBURL=$(node -e "const fs=require('fs');const m=fs.readFileSync('.env','utf8').match(/^SUPABASE_DB_URL=(.*)$/m);process.stdout.write(m[1].trim())")
npx supabase db push --db-url "$DBURL" --yes
```
Expected : `Applying migration 0010_p0b_mouvements_quittances.sql...` puis succès.

- [ ] **Step 5 : Relancer schéma + isolation**

Run : `npm run test:rls -- p0b`
Expected : PASS pour les 6 tables.

- [ ] **Step 6 : Garde CI**

Run : `npm run check:rls`
Expected : `✅ Couverture RLS OK`.

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/0010_p0b_mouvements_quittances.sql supabase/tests/helpers/p0b-fixtures.mjs
git commit -m "$(cat <<'EOF'
P0-B T3 : tables mouvements + quittances (qui polymorphe normalisé, FK PJ + paiement)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 : Tables `baux` + `baux_historique`

**Files:**
- Create: `supabase/migrations/0011_p0b_baux.sql`
- Modify: `supabase/tests/helpers/p0b-fixtures.mjs`

- [ ] **Step 1 : Étendre le harnais fixtures**

Modify `supabase/tests/helpers/p0b-fixtures.mjs` :

```js
export const BUSINESS_TABLES = [
  'entites',
  'immeubles',
  'logements',
  'documents',
  'mouvements',
  'quittances',
  'baux',
  'baux_historique',
]
```

Dans `seedChain`, après `ids.quittance = ...`, ajouter :

```js
  ids.bail = await ins('baux', {
    logement_id: ids.logement, entite_id: ids.entite, type_bail: 'nu',
    hc: 700, ch: 100, dg: 700, jour_paiement: 1, date_debut: '2026-01-01',
    locataires: [{ nom: 'Dupont', prenom: 'Jean' }],
  })
  ids.bailHist = await ins('baux_historique', {
    logement_id: ids.logement, entite_id: ids.entite, archived_auto: true,
    bail_snapshot: { ref: `F-${tag}`, type: 'nu', hc: 650 },
  })
```

- [ ] **Step 2 : Lancer le test de schéma, vérifier qu'il échoue pour les nouvelles tables**

Run : `npm run test:rls -- p0b-schema`
Expected : FAIL — `baux`/`baux_historique` absentes.

- [ ] **Step 3 : Écrire la migration 0011**

Create `supabase/migrations/0011_p0b_baux.sql` :

```sql
-- P0-B — Tâche 4/6 : tables « baux » (bail courant) + « baux_historique » (archives).
-- Dict JS baux[ref] → table avec 1 bail courant par logement (unique partiel actif).
-- Verrous de signature extraits en colonnes (signed_at, signed_*_at) → P0-C branche
--   l'immutabilité dessus ; AUCUNE contrainte d'immutabilité posée ici.
-- Détail imbriqué (locataires, garants, mobilier, descriptif, irl_historique, signatures-images,
--   snapshots) → jsonb. baux_historique = enregistrement figé → bail_snapshot jsonb.

-- ── baux (bail courant) ──────────────────────────────────────────────────────────
create table public.baux (
  id                  uuid primary key default gen_random_uuid(),
  espace_id           uuid not null references public.espaces(id) on delete cascade,
  legacy_ref          text,                    -- ancienne clé du dict baux[ref]
  logement_id         uuid not null,
  entite_id           uuid,
  type_bail           text check (type_bail in ('nu','meuble','etudiant','mobilite','garage','autre')),
  hc                  numeric,
  ch                  numeric,
  dg                  numeric,
  jour_paiement       int,
  date_debut          date,
  date_fin            date,
  date_fin_effective  date,
  locataires          jsonb not null default '[]'::jsonb,
  garants             jsonb,
  mobilier            jsonb,
  descriptif          jsonb,                   -- adrBien/ftype/surf
  irl                 jsonb,
  irl_historique      jsonb not null default '[]'::jsonb,
  signed_at           timestamptz,             -- verrou (immutabilité branchée en P0-C)
  signed_bailleur_at  timestamptz,
  signed_locataire_at timestamptz,
  signatures          jsonb,                   -- mode, nbParaphes, dataURLs, bailSnapshot, edlSnapshot, driveWebViewLink
  cloture             jsonb,
  quitt_auto_gen      boolean not null default false,
  notes               text,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  version             bigint not null default 1,
  created_by          uuid default auth.uid() references auth.users(id),
  constraint baux_id_espace_unique unique (id, espace_id),
  constraint baux_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id),
  constraint baux_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id)
);

-- un seul bail courant (non archivé, non supprimé) par logement — reflète baux[ref]
create unique index baux_one_active_per_logement
  on public.baux (espace_id, logement_id) where deleted_at is null and archived = false;
create index baux_by_espace_logement on public.baux (espace_id, logement_id);

create trigger trg_touch_baux
  before update on public.baux
  for each row execute function public.touch_row();

-- ── baux_historique (archives figées) ─────────────────────────────────────────────
create table public.baux_historique (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  legacy_ref    text,
  logement_id   uuid,
  entite_id     uuid,
  archived_at   timestamptz not null default now(),
  archived_auto boolean not null default false,
  bail_snapshot jsonb not null,               -- copie figée du bail à l'archivage (auto-contenu)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       bigint not null default 1,
  created_by    uuid default auth.uid() references auth.users(id),
  constraint baux_hist_id_espace_unique unique (id, espace_id),
  constraint baux_hist_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id),
  constraint baux_hist_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id)
);

create index baux_hist_by_espace_logement on public.baux_historique (espace_id, logement_id);
create index baux_hist_by_espace_archived on public.baux_historique (espace_id, archived_at);

create trigger trg_touch_baux_historique
  before update on public.baux_historique
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['baux','baux_historique'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
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

- [ ] **Step 4 : Pousser la migration**

Run :
```bash
DBURL=$(node -e "const fs=require('fs');const m=fs.readFileSync('.env','utf8').match(/^SUPABASE_DB_URL=(.*)$/m);process.stdout.write(m[1].trim())")
npx supabase db push --db-url "$DBURL" --yes
```
Expected : `Applying migration 0011_p0b_baux.sql...` puis succès.

- [ ] **Step 5 : Relancer schéma + isolation**

Run : `npm run test:rls -- p0b`
Expected : PASS pour les 8 tables.

- [ ] **Step 6 : Garde CI**

Run : `npm run check:rls`
Expected : `✅ Couverture RLS OK`.

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/0011_p0b_baux.sql supabase/tests/helpers/p0b-fixtures.mjs
git commit -m "$(cat <<'EOF'
P0-B T4 : tables baux + baux_historique (1 bail courant/logement, verrous signature en colonnes)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 : Table `edl`

**Files:**
- Create: `supabase/migrations/0012_p0b_edl.sql`
- Modify: `supabase/tests/helpers/p0b-fixtures.mjs`

- [ ] **Step 1 : Étendre le harnais fixtures**

Modify `supabase/tests/helpers/p0b-fixtures.mjs` :

```js
export const BUSINESS_TABLES = [
  'entites',
  'immeubles',
  'logements',
  'documents',
  'mouvements',
  'quittances',
  'baux',
  'baux_historique',
  'edl',
]
```

Dans `seedChain`, après `ids.bailHist = ...`, ajouter (puis `return ids`) :

```js
  ids.edl = await ins('edl', {
    type_edl: 'Entrée', date_edl: '2026-01-01', logement_id: ids.logement,
    identite: { locataire: 'Jean Dupont', bailleur: 'SCI Test' },
    pieces: [{ nom: 'Séjour', elements: [{ libelle: 'Murs', etatE: 'bon', obsE: '', photosE: [] }] }],
  })
```

> Note : `edl_photos` n'est PAS une table — les binaires restent dans IndexedDB (migrés vers Supabase Storage en P0-D). Les métadonnées photo (`name`, `idbKey`, `ts`, `synced`, `driveFileId`) vivent dans le `jsonb` `pieces[].elements[].photosE/photosS`.

- [ ] **Step 2 : Lancer le test de schéma, vérifier qu'il échoue pour `edl`**

Run : `npm run test:rls -- p0b-schema`
Expected : FAIL — `edl` absente.

- [ ] **Step 3 : Écrire la migration 0012**

Create `supabase/migrations/0012_p0b_edl.sql` :

```sql
-- P0-B — Tâche 5/6 : table « edl » (états des lieux entrée/sortie).
-- Détail profondément imbriqué (pieces[].elements[].{etatE,obsE,photosE[],etatS,…}, compteurs,
--   chauffage, technologies, clés, daaf, mobilier) → jsonb (modélisation hybride validée).
-- Verrou de signature signed_at extrait en colonne → P0-C branche l'immutabilité.
-- edl_photos : binaires hors-base (IndexedDB → Storage P0-D) ; métadonnées dans pieces jsonb.

create table public.edl (
  id               uuid primary key default gen_random_uuid(),
  espace_id        uuid not null references public.espaces(id) on delete cascade,
  legacy_id        text,
  type_edl         text check (type_edl in ('Entrée','Sortie')),
  date_edl         date,
  logement_id      uuid not null,
  identite         jsonb,                       -- {locataire, bailleur} (snapshot)
  pieces           jsonb not null default '[]'::jsonb,
  compteurs        jsonb,
  compteurs_sortie jsonb,
  compteurs_photos jsonb,
  chauffage        jsonb,
  technologies     jsonb,
  cles             jsonb,
  daaf             jsonb,
  mobilier         jsonb,
  signed_at        timestamptz,                 -- verrou (immutabilité branchée en P0-C)
  signatures       jsonb,                       -- bailleur, locataire, edlSnapshot
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  version          bigint not null default 1,
  created_by       uuid default auth.uid() references auth.users(id),
  constraint edl_id_espace_unique unique (id, espace_id),
  constraint edl_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id)
);

create index edl_by_espace_logement on public.edl (espace_id, logement_id);
create index edl_by_espace_type     on public.edl (espace_id, type_edl);

create trigger trg_touch_edl
  before update on public.edl
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['edl'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
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

- [ ] **Step 4 : Pousser la migration**

Run :
```bash
DBURL=$(node -e "const fs=require('fs');const m=fs.readFileSync('.env','utf8').match(/^SUPABASE_DB_URL=(.*)$/m);process.stdout.write(m[1].trim())")
npx supabase db push --db-url "$DBURL" --yes
```
Expected : `Applying migration 0012_p0b_edl.sql...` puis succès.

- [ ] **Step 5 : Relancer schéma + isolation (les 9 tables)**

Run : `npm run test:rls -- p0b`
Expected : PASS pour les 9 tables (schéma + isolation).

- [ ] **Step 6 : Garde CI**

Run : `npm run check:rls`
Expected : `✅ Couverture RLS OK`.

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/0012_p0b_edl.sql supabase/tests/helpers/p0b-fixtures.mjs
git commit -m "$(cat <<'EOF'
P0-B T5 : table edl (détail imbriqué jsonb, verrou signature en colonne)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 : Tests d'intégrité forte (FK composite cross-espace + CHECK) + audit + clôture

Cette tâche ajoute les preuves d'intégrité que la simple isolation ne couvre pas, puis passe la **règle gravée d'audit** (`superpowers:code-reviewer` obligatoire avant tout « prêt à tester » sur RLS/migrations).

**Files:**
- Modify: `supabase/tests/p0b-isolation.test.mjs`

- [ ] **Step 1 : Ajouter les tests d'intégrité référentielle (échoueront si écrits avant 0008-0012 ; ici toutes les migrations sont poussées → on vérifie le comportement)**

Modify `supabase/tests/p0b-isolation.test.mjs` — ajouter à la fin du fichier (après le dernier `describe`) :

```js
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
```

- [ ] **Step 2 : Lancer toute la suite P0-B, vérifier qu'elle passe**

Run : `npm run test:rls`
Expected : PASS — toute la suite (P0-A + P0-B schéma/isolation/intégrité) au vert.

> Si le test « FK composite bloque l'incohérence » échoue parce que Supabase renvoie un message différent, ajuster la regex sur le message réel (`error.message` / `error.details`) — ne PAS relâcher l'assertion (`error).not.toBeNull()` reste obligatoire).

- [ ] **Step 3 : Garde CI finale**

Run : `npm run check:rls`
Expected : `✅ Couverture RLS OK — N table(s) public, toutes protégées.`

- [ ] **Step 4 : Commit des tests d'intégrité**

```bash
git add supabase/tests/p0b-isolation.test.mjs
git commit -m "$(cat <<'EOF'
P0-B T6 : tests d'intégrité forte (FK composite cross-espace, CHECK, unicité, versioning)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5 : AUDIT code-reviewer (RÈGLE GRAVÉE — bloquant avant tout « prêt à tester »)**

Dispatcher l'agent `superpowers:code-reviewer` sur l'ensemble P0-B. Prompt de l'agent (autonome, il n'a pas le contexte de cette session) :

> Audite la livraison P0-B d'ImmoTrack : les migrations `supabase/migrations/0008`→`0012` (9 tables métier Postgres multi-tenant) et leurs tests `supabase/tests/p0b-*.{test.mjs}` + `helpers/p0b-fixtures.mjs`. Le socle P0-A (espaces, espace_members, is_member/has_role, FORCE RLS) est déjà audité PASSANT — lis `supabase/migrations/0001`→`0007` pour le contexte. Risque n°1 = **fuite cross-tenant** : vérifie que CHAQUE table métier a FORCE RLS + policies select=`is_member(espace_id)` / write=`has_role(espace_id, owner+gestionnaire)`, que `espace_id` est NOT NULL partout, que les FK parent/enfant sont **composites** `(parent_id, espace_id)` (cohérence d'espace garantie même sous service_role), et qu'aucun chemin (FK polymorphe `documents.parent`, `mouvements.qui`, jsonb) ne permet de référencer ou lire une ligne d'un autre espace. Vérifie aussi : soft-delete `deleted_at` cohérent, `version`/`touch_row` branchés, index composites `(espace_id, …)`, et que les colonnes `signed_at` existent sans contrainte d'immutabilité (celle-ci est explicitement repoussée à P0-C). Signale tout SEV-1/2/3 avec le correctif. Rends un verdict PASSANT / NON-PASSANT.

- [ ] **Step 6 : Traiter les findings d'audit (le cas échéant)**

Pour chaque finding NON trivial : créer une **nouvelle** migration append-only (`0013_…`, jamais modifier 0008-0012 poussées) + un test de non-régression, pousser, re-tester, puis **re-auditer** jusqu'au verdict PASSANT. Tant que l'audit n'est pas PASSANT, **ne pas** annoncer « prêt à tester » au porteur.

- [ ] **Step 7 : Mettre à jour le BACKLOG (temps réel — règle gravée)**

Inscrire P0-B comme livré dans `C:\Users\Did_K\Desktop\Immo\BACKLOG.md` (statut + commits + note « audit code-reviewer PASSANT »). ⚠️ `BACKLOG.md` est souvent édité par d'autres sessions : faire un `git diff BACKLOG.md` d'abord, n'ajouter QUE la ligne P0-B, ne pas écraser le travail en cours d'autrui (cf. règle de coordination index/backlog).

- [ ] **Step 8 : Annonce de clôture**

Annoncer au porteur : P0-B prêt à tester — 9 tables métier isolées, intégrité référentielle déclarative prouvée, audit code-reviewer PASSANT. Preuve exécutable : `npm run test:rls` + `npm run check:rls`. Rappeler les exclusions (immutabilité signé / rétention / gating → P0-C) et l'étape suivante (P0-C, ou synchronisation git des commits locaux au point de coordination).

---

## Notes d'exécution & risques connus

- **Sync git différée.** Comme en P0-A, `main` distante peut être en avance (sessions concurrentes) et l'arbre de travail contenir des fichiers d'autres sessions. Committer les fichiers `supabase/` de façon ciblée (`git add` fichier par fichier), ne PAS `git add -A`. La synchro (`pull --rebase` + `push`) se fait au point de coordination, pas unilatéralement.
- **`auth.uid()` en DEFAULT.** Sous `service_role` (import P0-E) `auth.uid()` renvoie `null` → `created_by` nullable (OK). À l'import, renseigner `created_by` explicitement avec l'owner de l'espace.
- **FK polymorphe `documents.parent`.** Pas de FK dure (parent peut être un mouvement OU un immeuble). La cohérence `espace_id` est garantie par la RLS ; une validation d'existence du parent (trigger) pourra être ajoutée en P0-C si l'audit l'exige.
- **`mouvements.qui` neutre autorisé.** Le CHECK n'autorise PAS (logement ET entité) ensemble, mais autorise (aucun des deux) — mouvement au niveau espace (ex. frais généraux). Conforme au modèle JS.
- **Ordre des migrations = ordre des dépendances FK.** 0008 (entités, immeubles) → 0009 (logements ⇒ entité+immeuble, documents) → 0010 (mouvements ⇒ logement/entité/document, quittances ⇒ logement/mouvement) → 0011 (baux) → 0012 (edl). Ne pas réordonner.
- **Pas de cycle FK au niveau base.** `mouvements.pj_document_id → documents` est une vraie FK ; `documents.parent_id → mouvements` est polymorphe sans FK → aucune dépendance circulaire à casser.

## Self-Review (effectuée à la rédaction)

- **Couverture spec §17** : §17-3 (espace_id NOT NULL partout ✓), §17-4 (FK composite (id, espace_id) ✓), §17-5 (index composites (espace_id,…) ✓), §17-6 (FORCE RLS + 4 policies/table via boucle + garde CI ✓), §17-8 (version + touch_row ✓), §17-9 (deleted_at + soft-delete ✓). §17-10/11/21 (immutabilité), §17-12 (rétention), §17-13/22 (gating) **explicitement exclus → P0-C** (colonnes `signed_*` posées en prévision).
- **Placeholders** : aucun « TBD/à compléter » ; tout le SQL et le code de test sont complets et exécutables.
- **Cohérence des noms** : `BUSINESS_TABLES` / `seedChain` définis en T1, étendus de façon additive en T2-T5 ; noms de colonnes/contraintes constants entre migrations et tests (`*_id_espace_unique`, `*_fk`, `mouvements_qui_exclusif`, `baux_one_active_per_logement`, `quittances_logement_mois_unique`).
- **Fidélité au modèle réel** : schémas dérivés de l'inventaire terrain (entites/logements/baux dict-par-ref/baux_historique/mouvements.qui polymorphe/quittances/edl imbriqué/documents) — pas d'invention de champs ; legacy conservé (`legacy_id`, `legacy_ref`, `legacy_bail`).
