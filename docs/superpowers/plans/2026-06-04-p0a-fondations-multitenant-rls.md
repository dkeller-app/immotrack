# P0-A — Fondations multi-tenant + preuve d'isolation (RLS) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le socle de partage/isolation d'ImmoTrack SaaS : tables `espaces` + `espace_members`, helper d'appartenance borné, RLS forcée par commande, RPC de création d'espace, invariant « dernier owner », garde CI de couverture RLS, et une suite de tests d'isolation cross-tenant qui **prouve** qu'un tenant ne voit jamais les lignes d'un autre.

**Architecture :** Backend Supabase hébergé en **région EU** (pas de Docker local). Le schéma est géré comme des **migrations SQL versionnées** dans `supabase/migrations/` (jamais de patch manuel via le dashboard). L'isolation est garantie **en base** par RLS `FORCE` + policies par commande, l'appartenance résolue par un helper `SECURITY DEFINER` borné (casse la récursion policy ↔ table). Les tests tournent depuis Node/Vitest via `@supabase/supabase-js` en se connectant comme **deux vrais utilisateurs** distincts (chemin RLS réel, pas de bypass).

**Tech Stack :** Supabase (Postgres + Auth + RLS), Supabase CLI (migrations, sans Docker), Node 24 + `@supabase/supabase-js` + `pg` + `dotenv`, Vitest (suite RLS dédiée, séparée de la suite de helpers purs).

**Périmètre exclu de P0-A** (→ sous-plans suivants) : les 19 tables métier + intégrité référentielle (**P0-B**), immutabilité légale bail/EDL signé + crochets d'abonnement (**P0-C**), config Auth email/Google + Realtime + Storage (**P0-D**), import du tenant #1 (**P0-E**).

**Règle gravée non négociable :** la RLS, les policies et les helpers de ce plan **DOIVENT** être audités par l'agent `superpowers:code-reviewer` (Tâche 10) **avant** toute annonce « prêt à tester ». La fuite cross-tenant est le risque n°1 (spec §11, §16).

---

## Structure des fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `supabase/config.toml` | Config projet CLI (project ref, non secret) | Créé par `supabase init` |
| `supabase/migrations/0001_espaces_membership.sql` | Tables `espaces`, `espace_members`, enums, index | Créer |
| `supabase/migrations/0002_membership_helpers.sql` | `is_member()`, `has_role()` (SECURITY DEFINER bornés) | Créer |
| `supabase/migrations/0003_rls_foundation.sql` | `FORCE RLS` + policies par commande | Créer |
| `supabase/migrations/0004_create_espace_rpc.sql` | RPC `create_espace()` (bootstrap atomique espace + owner) | Créer |
| `supabase/migrations/0005_invariants_triggers.sql` | Trigger dernier-owner + trigger `updated_at`/`version` | Créer |
| `supabase/tests/helpers/clients.mjs` | Fabriques de clients (admin/service + utilisateur) + create/cleanup users | Créer |
| `supabase/tests/connectivity.test.mjs` | Test fumée : le projet répond | Créer |
| `supabase/tests/rls-isolation.test.mjs` | **Preuve** d'isolation cross-tenant | Créer |
| `supabase/tests/vitest.rls.config.mjs` | Config Vitest dédiée (réseau, timeout long) | Créer |
| `scripts/check-rls-coverage.mjs` | Garde CI : échoue si une table `public` n'a pas RLS forcée + ≥1 policy | Créer |
| `.env` | Secrets (URL, clés, DB URL) — **gitignored** | Créer |
| `.env.example` | Modèle sans secret — commité | Créer |
| `.gitignore` | Ajouter `.env`, artefacts CLI Supabase | Modifier |
| `package.json` | devDeps `@supabase/supabase-js`, `pg`, `dotenv` + scripts `test:rls`, `check:rls` | Modifier |

**Décision de bornage des fichiers :** chaque migration a **une** responsabilité (tables / helpers / policies / RPC / triggers) pour que l'audit `code-reviewer` lise chaque préoccupation isolément. Les tests réseau vivent sous `supabase/tests/` (jamais dans `__tests__/`, qui reste la suite de helpers purs offline rapide).

---

## Tâche 1 : Outillage, projet EU & hygiène des secrets

**Files:**
- Create: `supabase/config.toml` (généré), `.env`, `.env.example`
- Modify: `.gitignore`

> **Contexte sécurité :** le repo GitHub est **public** (`.gitignore` le dit explicitement). La clé `service_role` et l'URL de connexion DB donnent un accès total **bypass RLS** → fuite totale si commitées. Elles vont **exclusivement** dans `.env` (gitignored). Seules les migrations (sans secret) et `config.toml` (project ref public) sont commitées.

- [ ] **Step 1 : Installer la CLI Supabase (sans Docker)**

Windows (PowerShell, via Scoop ou npm). Sans Docker — on ne lancera jamais `supabase start` ni `supabase test db` (qui exigent Docker) ; uniquement `init`, `link`, `db push`, `migration`.

```powershell
npm install -g supabase
supabase --version
```
Expected : un numéro de version s'affiche (ex. `2.x.x`).

- [ ] **Step 2 : Créer le projet Supabase en région EU**

Via le dashboard https://supabase.com/dashboard → New project → **Region = EU** (ex. *Central EU (Frankfurt)*). Noter : Project ref, l'URL `https://<ref>.supabase.co`, la clé `anon`, la clé `service_role`, et le mot de passe DB.

- [ ] **Step 3 : Initialiser et lier le dossier `supabase/`**

```powershell
supabase init
supabase login
supabase link --project-ref <PROJECT_REF>
```
Expected : `supabase/config.toml` créé ; `Finished supabase link.`

- [ ] **Step 4 : Écrire `.env` (secrets) et `.env.example` (modèle)**

`.env` (NE PAS commiter) :
```
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
SUPABASE_DB_URL=postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require
```

`.env.example` (commité, sans secret) :
```
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require
```

- [ ] **Step 5 : Durcir `.gitignore`**

Ajouter à `.gitignore` (après la section node) :
```
# ─── Secrets Supabase (repo public → JAMAIS commiter) ───
.env
.env.local
# ─── Artefacts CLI Supabase (générés, non versionnés) ───
supabase/.temp/
supabase/.branches/
```

- [ ] **Step 6 : Vérifier que les secrets ne sont pas suivis par git**

Run : `git status --porcelain` puis `git check-ignore .env`
Expected : `.env` n'apparaît **pas** dans `git status` ; `git check-ignore .env` retourne `.env` (donc bien ignoré).

- [ ] **Step 7 : Commit du socle outillage**

```powershell
git add supabase/config.toml .env.example .gitignore
git commit -m "P0-A: init Supabase EU + hygiène secrets (.env gitignored, repo public)"
```

---

## Tâche 2 : Harnais de test (deux vrais tenants) + config Vitest dédiée

**Files:**
- Modify: `package.json`
- Create: `supabase/tests/helpers/clients.mjs`, `supabase/tests/vitest.rls.config.mjs`, `supabase/tests/connectivity.test.mjs`

> **Pourquoi un harnais séparé :** la suite `__tests__/**` est offline/rapide (helpers purs, env `node`). Les tests RLS sont des tests d'**intégration réseau** contre le projet EU → suite + config séparées, sinon `npm run test:run` devient lent et dépendant du réseau.

- [ ] **Step 1 : Installer les dépendances de test**

```powershell
npm install -D @supabase/supabase-js pg dotenv
```
Expected : `package.json` liste les 3 paquets en `devDependencies`.

- [ ] **Step 2 : Ajouter les scripts npm**

Dans `package.json`, ajouter à `"scripts"` :
```json
"test:rls": "vitest run --config supabase/tests/vitest.rls.config.mjs",
"check:rls": "node scripts/check-rls-coverage.mjs"
```

- [ ] **Step 3 : Écrire la config Vitest dédiée**

`supabase/tests/vitest.rls.config.mjs` :
```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    include: ['supabase/tests/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 30000,   // réseau : un projet hébergé EU répond plus lentement qu'en local
    hookTimeout: 30000,
    fileParallelism: false // les tests partagent des users/espaces → exécution sérielle
  }
})
```

- [ ] **Step 4 : Écrire les fabriques de clients**

`supabase/tests/helpers/clients.mjs` :
```js
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON || !SERVICE) {
  throw new Error('Variables .env manquantes (SUPABASE_URL / ANON / SERVICE_ROLE).')
}

// Client service-role : bypass RLS. Réservé au SETUP/TEARDOWN des tests (jamais une assertion d'isolation).
export function adminClient() {
  return createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Crée (ou recrée) un utilisateur de test confirmé. Retourne l'objet user.
export async function createUser(email, password) {
  const admin = adminClient()
  // idempotent : supprime un éventuel reliquat d'un run précédent
  await deleteUserByEmail(email)
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user
}

// Client authentifié AS un utilisateur réel : ses requêtes passent par la RLS.
export async function userClient(email, password) {
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

export async function deleteUserByEmail(email) {
  const admin = adminClient()
  let page = 1
  // l'API admin pagine ; on cherche l'email puis on supprime (cascade espaces via FK on delete)
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find(x => x.email === email)
    if (u) { await admin.auth.admin.deleteUser(u.id) ; return }
    if (data.users.length < 200) return
    page++
  }
}
```

- [ ] **Step 5 : Test fumée de connectivité**

`supabase/tests/connectivity.test.mjs` :
```js
import { describe, it, expect, afterAll } from 'vitest'
import { createUser, userClient, deleteUserByEmail } from './helpers/clients.mjs'

const EMAIL = 'p0a-smoke@example.test'
const PASS = 'Test-Passw0rd!smoke'

describe('connectivité projet Supabase EU', () => {
  afterAll(async () => { await deleteUserByEmail(EMAIL) })

  it('crée un user et ouvre une session authentifiée', async () => {
    const user = await createUser(EMAIL, PASS)
    expect(user.id).toBeTruthy()
    const client = await userClient(EMAIL, PASS)
    const { data } = await client.auth.getUser()
    expect(data.user.email).toBe(EMAIL)
  })
})
```

- [ ] **Step 6 : Lancer le test fumée**

Run : `npm run test:rls`
Expected : PASS (1 test). Confirme que `.env`, le réseau, l'API Auth admin et la session anon fonctionnent.

- [ ] **Step 7 : Commit**

```powershell
git add package.json supabase/tests/helpers/clients.mjs supabase/tests/vitest.rls.config.mjs supabase/tests/connectivity.test.mjs
git commit -m "P0-A: harnais de test deux-tenants (Vitest + supabase-js) + fumée connectivité"
```

---

## Tâche 3 : Tables `espaces` + `espace_members`

**Files:**
- Create: `supabase/migrations/0001_espaces_membership.sql`

> Invariants visés (spec §17) : 1 (membership 1ʳᵉ classe, rôle par appartenance, statut d'invitation + email), 3 (`espace_id` estampillé), 5 (index composite par espace), 8 (colonne `version`).

- [ ] **Step 1 : Écrire l'assertion d'existence (échouera)**

Ajouter à un nouveau fichier `supabase/tests/schema.test.mjs` :
```js
import { describe, it, expect } from 'vitest'
import pg from 'pg'
import 'dotenv/config'

async function tableExists(name) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()
  try {
    const r = await c.query(
      `select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [name])
    return r.rowCount === 1
  } finally { await c.end() }
}

describe('schéma fondation', () => {
  it('table espaces existe', async () => { expect(await tableExists('espaces')).toBe(true) })
  it('table espace_members existe', async () => { expect(await tableExists('espace_members')).toBe(true) })
})
```

- [ ] **Step 2 : Lancer → vérifier l'échec**

Run : `npm run test:rls`
Expected : FAIL sur `schéma fondation` (`expected false to be true`) — les tables n'existent pas encore.

- [ ] **Step 3 : Écrire la migration des tables**

`supabase/migrations/0001_espaces_membership.sql` :
```sql
-- Fondation multi-tenant : conteneur de partage (espace) + appartenance.
-- Aucune table métier ici ; uniquement le socle d'isolation (spec §4, §17).

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Conteneur de partage + facturation + membres.
create table public.espaces (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (length(trim(nom)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 1,
  created_by  uuid not null references auth.users(id)
);

-- Rôle PAR appartenance (≠ par utilisateur). Extensible : ajouter une valeur d'enum.
-- 'proprietaire' (spec §4, D13, §17-1) : accès consultation d'un seul espace = propriétaire
-- en gestion déléguée par une agence. Posé DÈS P0 : rétro-ajouter un rôle = migration
-- d'enum + réécriture RLS. Lecture seule + jamais de gestion de membres (Tâche 5/8).
create type public.espace_role  as enum ('owner', 'gestionnaire', 'lecture_seule', 'proprietaire');
create type public.invite_status as enum ('pending', 'active', 'revoked');

create table public.espace_members (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,  -- null tant que l'invité n'a pas de compte
  invite_email  text,
  role          public.espace_role  not null default 'lecture_seule',
  invite_status public.invite_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       bigint not null default 1,
  -- au plus une appartenance par (espace, user) réel
  constraint espace_members_unique_user unique (espace_id, user_id),
  -- soit un membre réel (user_id), soit une invitation en attente (invite_email)
  constraint espace_members_user_or_email check (user_id is not null or invite_email is not null)
);

-- au plus une invitation pending par (espace, email)
create unique index espace_members_unique_pending_email
  on public.espace_members (espace_id, lower(invite_email))
  where invite_status = 'pending' and invite_email is not null;

-- la RLS filtre toujours par espace en premier (spec §17-5)
create index espace_members_by_espace on public.espace_members (espace_id);
create index espace_members_by_user   on public.espace_members (user_id) where user_id is not null;
```

- [ ] **Step 4 : Pousser la migration vers le projet EU**

Run : `supabase db push`
Expected : `Applying migration 0001_espaces_membership.sql...` puis `Finished supabase db push.`

- [ ] **Step 5 : Lancer → vérifier le succès**

Run : `npm run test:rls`
Expected : `schéma fondation` PASS (les 2 tables existent). (La connectivité reste PASS.)

- [ ] **Step 6 : Commit**

```powershell
git add supabase/migrations/0001_espaces_membership.sql supabase/tests/schema.test.mjs
git commit -m "P0-A: tables espaces + espace_members (membership 1re classe, version, index espace)"
```

---

## Tâche 4 : Helpers d'appartenance bornés (`is_member`, `has_role`)

**Files:**
- Create: `supabase/migrations/0002_membership_helpers.sql`
- Modify: `supabase/tests/schema.test.mjs`

> Invariants visés : §17-7 et §17-17. `SECURITY DEFINER` pour **casser la récursion** (une policy sur `espace_members` qui lit `espace_members` rappellerait sa propre policy à l'infini). Surface **minimale** : ne retourne qu'un booléen. `search_path=''` + `revoke from public` = pas de vecteur d'escalade.

- [ ] **Step 1 : Écrire l'assertion (échouera)**

Ajouter à `supabase/tests/schema.test.mjs` :
```js
async function funcExists(name) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()
  try {
    const r = await c.query(
      `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname=$1`, [name])
    return r.rowCount >= 1
  } finally { await c.end() }
}

describe('helpers d\'appartenance', () => {
  it('is_member existe', async () => { expect(await funcExists('is_member')).toBe(true) })
  it('has_role existe',  async () => { expect(await funcExists('has_role')).toBe(true) })
})
```

- [ ] **Step 2 : Lancer → échec**

Run : `npm run test:rls`
Expected : FAIL sur `helpers d'appartenance`.

- [ ] **Step 3 : Écrire la migration des helpers**

`supabase/migrations/0002_membership_helpers.sql` :
```sql
-- Helpers d'appartenance bornés (spec §17-7, §17-17).
-- SECURITY DEFINER : exécutés avec les droits du créateur → ne déclenchent PAS
-- la RLS de espace_members → cassent la récursion policy <-> table.
-- search_path='' : tout objet doit être schéma-qualifié (anti-hijack).

create or replace function public.is_member(p_espace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.espace_members m
    where m.espace_id = p_espace_id
      and m.user_id = (select auth.uid())
      and m.invite_status = 'active'
  );
$$;

revoke all on function public.is_member(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated;

create or replace function public.has_role(p_espace_id uuid, p_roles public.espace_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.espace_members m
    where m.espace_id = p_espace_id
      and m.user_id = (select auth.uid())
      and m.invite_status = 'active'
      and m.role = any(p_roles)
  );
$$;

revoke all on function public.has_role(uuid, public.espace_role[]) from public;
grant execute on function public.has_role(uuid, public.espace_role[]) to authenticated;
```

- [ ] **Step 4 : Pousser**

Run : `supabase db push`
Expected : `Applying migration 0002_membership_helpers.sql...` → `Finished`.

- [ ] **Step 5 : Lancer → succès**

Run : `npm run test:rls`
Expected : `helpers d'appartenance` PASS.

- [ ] **Step 6 : Commit**

```powershell
git add supabase/migrations/0002_membership_helpers.sql supabase/tests/schema.test.mjs
git commit -m "P0-A: helpers is_member/has_role (SECURITY DEFINER bornés, anti-récursion)"
```

---

## Tâche 5 : RLS `FORCE` + policies par commande

**Files:**
- Create: `supabase/migrations/0003_rls_foundation.sql`

> Invariants visés : §17-6 (`FORCE ROW LEVEL SECURITY`), §17-7 (policies **par commande** : SELECT/INSERT/UPDATE/DELETE distinctes ; lecture ≠ écriture), §18 (interdiction de modifier son **propre** rôle). La preuve d'isolation est en Tâche 8 ; ici on valide la **présence** des policies (la garde CI Tâche 9 l'automatisera).
>
> **Rôle `proprietaire` (D13) — aucune policy dédiée nécessaire au socle.** Les policies ci-dessous sont écrites en termes de rôles d'**écriture** explicites (`owner`/`gestionnaire`) ; un `proprietaire` n'est dans **aucune** liste d'écriture, donc il est automatiquement **lecture seule** : il passe `is_member()` (→ `*_select` OK) mais échoue `has_role([owner|gestionnaire])` (→ pas d'UPDATE espace, pas de gestion de membres). C'est exactement l'accès propriétaire voulu, **sans** ligne de code spécifique. La distinction fine `proprietaire` vs `lecture_seule` ne portera que sur les **tables métier** (quels objets il voit), en P0-B+ ; au socle, les deux sont des membres en lecture. La Tâche 8 le **prouve** par un test.

- [ ] **Step 1 : Écrire l'assertion de couverture (échouera)**

Ajouter à `supabase/tests/schema.test.mjs` :
```js
async function rlsForced(name) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()
  try {
    const r = await c.query(
      `select relrowsecurity, relforcerowsecurity,
              (select count(*) from pg_policy p where p.polrelid=c.oid) as npol
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname=$1`, [name])
    const row = r.rows[0]
    return row && row.relrowsecurity && row.relforcerowsecurity && Number(row.npol) >= 4
  } finally { await c.end() }
}

describe('RLS forcée + policies', () => {
  it('espaces : RLS forcée + ≥4 policies',        async () => { expect(await rlsForced('espaces')).toBe(true) })
  it('espace_members : RLS forcée + ≥4 policies', async () => { expect(await rlsForced('espace_members')).toBe(true) })
})
```

- [ ] **Step 2 : Lancer → échec**

Run : `npm run test:rls`
Expected : FAIL sur `RLS forcée + policies`.

- [ ] **Step 3 : Écrire la migration RLS**

`supabase/migrations/0003_rls_foundation.sql` :
```sql
-- Isolation tenant en base (spec §4, §11, §16, §17-6/7).
-- FORCE : s'applique même au propriétaire de la table. Seul service_role (bypassrls) échappe.

alter table public.espaces        enable row level security;
alter table public.espaces        force  row level security;
alter table public.espace_members enable row level security;
alter table public.espace_members force  row level security;

-- ── espaces ───────────────────────────────────────────────────────────────
create policy espaces_select on public.espaces
  for select to authenticated
  using ( public.is_member(id) );

-- L'insert direct sert seulement de garde ; le bootstrap réel passe par create_espace() (Tâche 6).
create policy espaces_insert on public.espaces
  for insert to authenticated
  with check ( created_by = (select auth.uid()) );

create policy espaces_update on public.espaces
  for update to authenticated
  using      ( public.has_role(id, array['owner','gestionnaire']::public.espace_role[]) )
  with check ( public.has_role(id, array['owner','gestionnaire']::public.espace_role[]) );

create policy espaces_delete on public.espaces
  for delete to authenticated
  using ( public.has_role(id, array['owner']::public.espace_role[]) );

-- ── espace_members ───────────────────────────────────────────────────────────
create policy members_select on public.espace_members
  for select to authenticated
  using ( public.is_member(espace_id) );

create policy members_insert on public.espace_members
  for insert to authenticated
  with check ( public.has_role(espace_id, array['owner']::public.espace_role[]) );

-- owner seulement, et JAMAIS sa propre ligne (anti auto-escalade de rôle, spec §18).
create policy members_update on public.espace_members
  for update to authenticated
  using      ( public.has_role(espace_id, array['owner']::public.espace_role[])
               and user_id is distinct from (select auth.uid()) )
  with check ( public.has_role(espace_id, array['owner']::public.espace_role[]) );

create policy members_delete on public.espace_members
  for delete to authenticated
  using ( public.has_role(espace_id, array['owner']::public.espace_role[])
          and user_id is distinct from (select auth.uid()) );
```

- [ ] **Step 4 : Pousser**

Run : `supabase db push`
Expected : `Applying migration 0003_rls_foundation.sql...` → `Finished`.

- [ ] **Step 5 : Lancer → succès**

Run : `npm run test:rls`
Expected : `RLS forcée + policies` PASS (les 2 tables : RLS forcée + 4 policies chacune).

- [ ] **Step 6 : Commit**

```powershell
git add supabase/migrations/0003_rls_foundation.sql supabase/tests/schema.test.mjs
git commit -m "P0-A: RLS FORCE + policies par commande (espaces, espace_members) + anti auto-escalade"
```

---

## Tâche 6 : RPC `create_espace()` (bootstrap atomique espace + owner)

**Files:**
- Create: `supabase/migrations/0004_create_espace_rpc.sql`

> **Problème résolu :** créer un espace puis sa 1ʳᵉ appartenance owner est un œuf-poule — la policy `members_insert` exige déjà d'être owner. La création passe donc par une **RPC `SECURITY DEFINER`** unique et transactionnelle (espace + membership owner), conforme au principe « écriture multi-lignes = une transaction serveur » (spec §7). Le client n'orchestre jamais ces 2 inserts séparément.

- [ ] **Step 1 : Écrire l'assertion (échouera)**

Ajouter à `supabase/tests/schema.test.mjs` :
```js
describe('RPC create_espace', () => {
  it('create_espace existe', async () => { expect(await funcExists('create_espace')).toBe(true) })
})
```

- [ ] **Step 2 : Lancer → échec**

Run : `npm run test:rls`
Expected : FAIL sur `RPC create_espace`.

- [ ] **Step 3 : Écrire la migration RPC**

`supabase/migrations/0004_create_espace_rpc.sql` :
```sql
-- Bootstrap atomique : crée l'espace ET l'appartenance owner active de l'appelant.
-- SECURITY DEFINER pour franchir members_insert (l'appelant n'est pas encore owner).
-- Transactionnel (fonction = une transaction) → jamais d'espace orphelin sans owner.

create or replace function public.create_espace(p_nom text)
returns public.espaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_espace public.espaces;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_nom is null or length(trim(p_nom)) = 0 then
    raise exception 'NOM_REQUIRED';
  end if;

  insert into public.espaces (nom, created_by)
  values (trim(p_nom), v_uid)
  returning * into v_espace;

  insert into public.espace_members (espace_id, user_id, role, invite_status)
  values (v_espace.id, v_uid, 'owner', 'active');

  return v_espace;
end;
$$;

revoke all on function public.create_espace(text) from public;
grant execute on function public.create_espace(text) to authenticated;
```

- [ ] **Step 4 : Pousser**

Run : `supabase db push`
Expected : `Applying migration 0004_create_espace_rpc.sql...` → `Finished`.

- [ ] **Step 5 : Lancer → succès**

Run : `npm run test:rls`
Expected : `RPC create_espace` PASS.

- [ ] **Step 6 : Commit**

```powershell
git add supabase/migrations/0004_create_espace_rpc.sql supabase/tests/schema.test.mjs
git commit -m "P0-A: RPC create_espace() (bootstrap atomique espace + membership owner)"
```

---

## Tâche 7 : Invariant « dernier owner » + triggers `updated_at`/`version`

**Files:**
- Create: `supabase/migrations/0005_invariants_triggers.sql`

> Invariants visés : §17-2 (un espace garde toujours ≥1 owner actif ; refus de supprimer/rétrograder le dernier owner) et §17-8 (`version` incrémentée + `updated_at` rafraîchi à chaque UPDATE — la concurrence optimiste s'appuie dessus en P2).

- [ ] **Step 1 : Écrire l'assertion (échouera)**

Ajouter à `supabase/tests/schema.test.mjs` :
```js
async function triggerExists(name) {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()
  try {
    const r = await c.query(`select 1 from pg_trigger where tgname=$1 and not tgisinternal`, [name])
    return r.rowCount >= 1
  } finally { await c.end() }
}

describe('invariants triggers', () => {
  it('trigger dernier-owner sur espace_members', async () =>
    { expect(await triggerExists('trg_protect_last_owner')).toBe(true) })
  it('trigger version/updated_at sur espaces', async () =>
    { expect(await triggerExists('trg_touch_espaces')).toBe(true) })
})
```

- [ ] **Step 2 : Lancer → échec**

Run : `npm run test:rls`
Expected : FAIL sur `invariants triggers`.

- [ ] **Step 3 : Écrire la migration triggers**

`supabase/migrations/0005_invariants_triggers.sql` :
```sql
-- §17-8 : rafraîchit updated_at et incrémente version à chaque UPDATE.
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger trg_touch_espaces
  before update on public.espaces
  for each row execute function public.touch_row();

create trigger trg_touch_espace_members
  before update on public.espace_members
  for each row execute function public.touch_row();

-- §17-2 : un espace conserve toujours ≥1 membre owner actif.
-- Refuse la suppression OU la rétrogradation/désactivation du DERNIER owner actif.
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
  -- l'ancien état comptait-il comme owner actif ?
  if old.role = 'owner' and old.invite_status = 'active' then
    -- le nouvel état reste-t-il owner actif ? (UPDATE qui ne touche pas owner → ok)
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

create trigger trg_protect_last_owner
  before update or delete on public.espace_members
  for each row execute function public.protect_last_owner();
```

- [ ] **Step 4 : Pousser**

Run : `supabase db push`
Expected : `Applying migration 0005_invariants_triggers.sql...` → `Finished`.

- [ ] **Step 5 : Lancer → succès**

Run : `npm run test:rls`
Expected : `invariants triggers` PASS.

- [ ] **Step 6 : Commit**

```powershell
git add supabase/migrations/0005_invariants_triggers.sql supabase/tests/schema.test.mjs
git commit -m "P0-A: triggers dernier-owner protégé + version/updated_at"
```

---

## Tâche 8 : Preuve d'isolation cross-tenant (le cœur)

**Files:**
- Create: `supabase/tests/rls-isolation.test.mjs`

> C'est **la** tâche qui démontre que l'objectif (« aucun tenant ne voit les lignes d'un autre ») est tenu **par la base**, via deux vrais utilisateurs sur le chemin RLS réel. Toute régression future sur les policies fera échouer cette suite.

- [ ] **Step 1 : Écrire la suite d'isolation complète**

`supabase/tests/rls-isolation.test.mjs` :
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, deleteUserByEmail } from './helpers/clients.mjs'

const A = { email: 'p0a-alice@example.test', pass: 'Test-Passw0rd!A' }
const B = { email: 'p0a-bob@example.test',   pass: 'Test-Passw0rd!B' }
// Carol = propriétaire en gestion déléguée (rôle 'proprietaire', D13) dans l'espace d'Alice.
const C = { email: 'p0a-carol@example.test', pass: 'Test-Passw0rd!C' }

let clientA, clientB, clientC
let espaceA, espaceB        // ids
let memberA_id              // id de la ligne membership owner d'Alice
let carolId                 // user_id de Carol

beforeAll(async () => {
  await createUser(A.email, A.pass)
  await createUser(B.email, B.pass)
  const carol = await createUser(C.email, C.pass)
  carolId = carol.id
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  clientC = await userClient(C.email, C.pass)

  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Patrimoine Alice' })
  if (e1) throw e1
  espaceA = ea.id
  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Patrimoine Bob' })
  if (e2) throw e2
  espaceB = eb.id

  const { data: mem } = await clientA.from('espace_members').select('id').eq('espace_id', espaceA).single()
  memberA_id = mem.id

  // Alice (owner) invite Carol comme 'proprietaire' actif dans SON espace (members_insert exige owner → OK).
  const { error: e3 } = await clientA.from('espace_members')
    .insert({ espace_id: espaceA, user_id: carolId, role: 'proprietaire', invite_status: 'active' })
  if (e3) throw e3
})

afterAll(async () => {
  await deleteUserByEmail(A.email)  // cascade espaces/members via FK
  await deleteUserByEmail(B.email)
  await deleteUserByEmail(C.email)
})

describe('lecture isolée', () => {
  it('Alice voit son espace', async () => {
    const { data } = await clientA.from('espaces').select('*').eq('id', espaceA)
    expect(data).toHaveLength(1)
  })
  it('Bob ne voit PAS l\'espace d\'Alice', async () => {
    const { data } = await clientB.from('espaces').select('*').eq('id', espaceA)
    expect(data).toHaveLength(0)   // RLS filtre, pas d'erreur : juste 0 ligne
  })
  it('Bob ne voit PAS les membres de l\'espace d\'Alice', async () => {
    const { data } = await clientB.from('espace_members').select('*').eq('espace_id', espaceA)
    expect(data).toHaveLength(0)
  })
  it('un SELECT large ne fuit que ses propres espaces', async () => {
    const { data } = await clientB.from('espaces').select('id')
    expect(data.map(r => r.id)).toEqual([espaceB])
  })
})

describe('écriture isolée', () => {
  it('Bob ne peut pas modifier l\'espace d\'Alice', async () => {
    const { data, error } = await clientB.from('espaces').update({ nom: 'piraté' }).eq('id', espaceA).select()
    expect(error).toBeNull()        // pas d'erreur SQL...
    expect(data).toHaveLength(0)    // ...mais 0 ligne touchée (RLS)
    const { data: check } = await clientA.from('espaces').select('nom').eq('id', espaceA).single()
    expect(check.nom).toBe('Patrimoine Alice')   // intact
  })
  it('Bob ne peut pas supprimer l\'espace d\'Alice', async () => {
    const { data } = await clientB.from('espaces').delete().eq('id', espaceA).select()
    expect(data).toHaveLength(0)
    const { data: check } = await clientA.from('espaces').select('id').eq('id', espaceA)
    expect(check).toHaveLength(1)   // toujours là
  })
  it('Bob ne peut pas s\'inviter dans l\'espace d\'Alice', async () => {
    const { error } = await clientB.from('espace_members')
      .insert({ espace_id: espaceA, user_id: (await clientB.auth.getUser()).data.user.id, role: 'owner', invite_status: 'active' })
    expect(error).not.toBeNull()    // with check de members_insert refuse → erreur RLS
  })
})

describe('rôle proprietaire (gestion déléguée, D13)', () => {
  it('Carol (proprietaire) VOIT l\'espace dont elle est membre', async () => {
    const { data } = await clientC.from('espaces').select('*').eq('id', espaceA)
    expect(data).toHaveLength(1)   // consultation : EDL/docs/quittances/baux suivront en P0-B
  })
  it('Carol ne voit QUE son espace (pas celui de Bob)', async () => {
    const { data } = await clientC.from('espaces').select('id')
    expect(data.map(r => r.id)).toEqual([espaceA])
  })
  it('Carol ne peut PAS modifier l\'espace (lecture seule)', async () => {
    const { data } = await clientC.from('espaces').update({ nom: 'renommé' }).eq('id', espaceA).select()
    expect(data).toHaveLength(0)   // pas owner/gestionnaire → 0 ligne touchée
    const { data: check } = await clientA.from('espaces').select('nom').eq('id', espaceA).single()
    expect(check.nom).toBe('Patrimoine Alice')
  })
  it('Carol ne peut PAS gérer les membres (inviter quelqu\'un)', async () => {
    const { error } = await clientC.from('espace_members')
      .insert({ espace_id: espaceA, invite_email: 'x@example.test', role: 'lecture_seule', invite_status: 'pending' })
    expect(error).not.toBeNull()   // members_insert exige owner → refus RLS
  })
})

describe('anti auto-escalade & dernier owner', () => {
  it('Alice ne peut pas changer son propre rôle', async () => {
    const { data } = await clientA.from('espace_members')
      .update({ role: 'lecture_seule' }).eq('id', memberA_id).select()
    expect(data).toHaveLength(0)    // members_update exclut sa propre ligne → 0 ligne
  })
  it('on ne peut pas supprimer le dernier owner (via service-role, bypass RLS)', async () => {
    // Le trigger protège même hors RLS : on tente en service-role pour isoler le trigger.
    const { adminClient } = await import('./helpers/clients.mjs')
    const admin = adminClient()
    const { error } = await admin.from('espace_members').delete().eq('id', memberA_id)
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/LAST_OWNER_PROTECTED/)
  })
})
```

- [ ] **Step 2 : Lancer la preuve**

Run : `npm run test:rls`
Expected : **toutes** les suites PASS (connectivité, schéma, helpers, RLS, RPC, triggers, **isolation cross-tenant**). C'est la preuve que l'isolation tient en base.

- [ ] **Step 3 : Commit**

```powershell
git add supabase/tests/rls-isolation.test.mjs
git commit -m "P0-A: preuve d'isolation cross-tenant (lecture/écriture/escalade/dernier owner)"
```

---

## Tâche 9 : Garde CI de couverture RLS

**Files:**
- Create: `scripts/check-rls-coverage.mjs`

> Invariant §17-6 : « toute nouvelle table sans RLS + ≥1 policy fait échouer le build ». Filet permanent : dès P0-B (19 tables), oublier une policy = échec CI, pas une fuite découverte en prod.

- [ ] **Step 1 : Écrire la garde**

`scripts/check-rls-coverage.mjs` :
```js
import 'dotenv/config'
import pg from 'pg'

const SQL = `
  select c.relname as table_name,
         c.relrowsecurity as rls_enabled,
         c.relforcerowsecurity as rls_forced,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
`

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
await client.connect()
const { rows } = await client.query(SQL)
await client.end()

const offenders = rows.filter(r => !r.rls_enabled || !r.rls_forced || Number(r.policies) < 1)
if (offenders.length) {
  console.error('❌ Tables sans RLS forcée + ≥1 policy :')
  for (const o of offenders)
    console.error(`   - ${o.table_name} (enabled=${o.rls_enabled}, forced=${o.rls_forced}, policies=${o.policies})`)
  process.exit(1)
}
console.log(`✅ Couverture RLS OK — ${rows.length} table(s) public, toutes protégées.`)
```

- [ ] **Step 2 : Lancer sur l'état courant → doit passer**

Run : `npm run check:rls`
Expected : `✅ Couverture RLS OK — 2 table(s) public, toutes protégées.`

- [ ] **Step 3 : Prouver que la garde détecte une table non protégée**

Créer une table de test sans RLS (manuellement, via une migration jetable **non commitée**) puis relancer la garde pour vérifier qu'elle échoue, puis supprimer la table.
```powershell
# table temporaire SANS rls, via psql distant ou éditeur SQL Supabase :
#   create table public._rls_canary (id int);
npm run check:rls   # doit afficher _rls_canary et sortir en code 1
# puis nettoyer :  drop table public._rls_canary;
```
Expected : exit code 1 + `_rls_canary` listée ; après `drop table`, `npm run check:rls` repasse au vert.

- [ ] **Step 4 : Commit**

```powershell
git add scripts/check-rls-coverage.mjs
git commit -m "P0-A: garde CI couverture RLS (échoue si table sans RLS forcée + policy)"
```

---

## Tâche 10 : Audit `code-reviewer` (RÈGLE GRAVÉE — avant toute annonce « prêt à tester »)

**Files:** aucune modification ; revue.

> Règle gravée (mémoire `feedback_audits_par_agents`) : tout schéma multi-tenant + RLS + triggers **DOIT** passer par l'agent `superpowers:code-reviewer` **avant** de dire que c'est prêt. La fuite cross-tenant est le risque n°1 (spec §11/§16). Mes audits propres (Vitest) ne suffisent jamais sur ce sujet.

- [ ] **Step 1 : Lancer l'agent code-reviewer**

Dispatcher un agent `superpowers:code-reviewer` sur les 5 migrations (`supabase/migrations/0001..0005`) + les policies + les helpers, en lui donnant le contexte : modèle « espace », spec §4/§7/§11/§16/§17 (invariants 1-8, 17), et la liste explicite à vérifier :
  - récursion policy ↔ `espace_members` réellement cassée par `is_member`/`has_role` (`SECURITY DEFINER`, `search_path=''`, `revoke from public`) ;
  - `FORCE RLS` effectif (pas seulement `ENABLE`) sur les 2 tables ;
  - policies **par commande** correctes (lecture ≠ écriture ; `with check` présent sur INSERT/UPDATE) ;
  - impossibilité d'auto-escalade de rôle et de suppression/rétrogradation du dernier owner ;
  - `create_espace` ne crée pas de surface d'écriture détournée ;
  - aucun chemin où un `authenticated` lit/écrit une ligne d'un espace dont il n'est pas membre actif ;
  - pas de fuite via `service_role` exposé côté client (vérifier que la clé service n'est utilisée que dans les helpers de test).

- [ ] **Step 2 : Corriger tout SEV-1/SEV-2 remonté**

Pour chaque finding, ajouter une **nouvelle migration** correctrice (jamais éditer une migration déjà poussée) + un test de non-régression dans `rls-isolation.test.mjs`, `supabase db push`, re-run `npm run test:rls`.

- [ ] **Step 3 : Re-run complet**

Run : `npm run test:rls && npm run check:rls`
Expected : tout vert.

- [ ] **Step 4 : Commit des corrections (si applicable) + clôture P0-A**

```powershell
git add supabase/migrations/ supabase/tests/
git commit -m "P0-A: corrections post-audit code-reviewer (isolation cross-tenant validée)"
```

Seulement **après** cet audit vert : annoncer P0-A « prêt à tester ».

---

## Auto-revue du plan (writing-plans)

**Couverture spec (P0-A) :** §4 modèle espace + D13 rôle `proprietaire` (gestion déléguée) → enum T3 + preuve lecture-seule T8 ; §7 écriture multi-lignes via RPC → Tâche 6 ; §17-1 membership 1ʳᵉ classe (+ enum `espace_role` à 4 valeurs) → T3 ; §17-2 dernier owner → T7 ; §17-5 index espace → T3 ; §17-6 FORCE RLS + garde CI → T5+T9 ; §17-7/17 helpers bornés + policies par commande → T4+T5 ; §17-8 version/updated_at → T7 ; §11/§16 audit RLS → T10. **Hors P0-A (assumé par P0-B…E) :** `espace_id` sur les tables métier (§17-3), cohérence parent/enfant (§17-4), soft-delete/tombstones (§17-9), immutabilité signé (§17-10/11/21), rétention (§17-12), plans/gating (§17-13/22), outbox (§17-14), Realtime/Storage (§17-15/16), RGPD/responsable (§17-23) — chacun renvoyé à son sous-plan.

**Placeholders :** aucun — chaque étape SQL/JS est complète et exécutable.

**Cohérence des noms (vérifiée) :** tables `espaces`/`espace_members` ; enums `espace_role`/`invite_status` ; fonctions `is_member`/`has_role`/`create_espace`/`touch_row`/`protect_last_owner` ; triggers `trg_touch_espaces`/`trg_touch_espace_members`/`trg_protect_last_owner` ; helpers JS `adminClient`/`createUser`/`userClient`/`deleteUserByEmail` ; scripts npm `test:rls`/`check:rls`. Tous utilisés de façon identique d'une tâche à l'autre.
