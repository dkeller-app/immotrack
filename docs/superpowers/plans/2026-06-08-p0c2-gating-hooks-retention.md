# P0-C2 — Crochets d'abonnement (gating) + colonnes de rétention — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser en base les **crochets** de gating d'abonnement (table `plans` data-driven, colonnes d'abonnement sur `espaces`, helper de résolution des droits) et les **colonnes de rétention** légale — **sans aucun enforcement** (les triggers de quota, l'intégration Stripe et les écrans d'upsell restent en P5).

**Architecture :** Une table de **catalogue global** `plans` (non multi-tenant : pas d'`espace_id`) porte les quotas (`limite_biens`/`limite_membres`/`limite_stockage_mo`, `NULL`=illimité) et les `features` (jsonb). On y sème `free` (palier plancher) et `beta` (illimité, mode bêta actuel) dès la migration. `espaces` reçoit les colonnes d'abonnement (`plan_id` FK→`plans`, `subscription_source ∈ {stripe,trial,comp}`, `subscription_status` couvrant le spectre Stripe, `trial_ends_at`, `stripe_customer_id`, et l'audit `comp_*`). Un helper SQL `espace_plan(espace_id)` **résout le plan effectif** d'un espace (lecture seule, utilisé plus tard par les triggers de quota P5). Enfin, les tables légalement concernées (`baux`, `edl`, `quittances`, `baux_historique`) reçoivent `retention_class` / `legal_basis` / `retention_until` qui **piloteront** l'effacement sélectif RGPD (moteur de purge = P5). Aucun trigger ne bloque quoi que ce soit ici : ce sont des fondations pour éviter un retrofit.

**Tech Stack :** PostgreSQL 17.6 (Supabase hébergé EU), migrations SQL append-only `supabase/migrations/` poussées via `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`, tests Vitest + `pg` (assertions schéma/seed/helper) + `@supabase/supabase-js` (preuve RLS du catalogue). Repo PUBLIC → aucun secret commité.

---

## Contexte de référence (à lire avant de commencer)

- **Spec maîtresse §12** « Gating / entitlements par abonnement » : `docs/superpowers/specs/2026-06-04-strategie-persistance-multitenant-design.md` lignes 232-271. **Point clé ligne 271** : « les *hooks* de schéma (`espace.plan_id`, table `plans`, helper de check) sont prévus **dès P0** […] ; l'enforcement réel (triggers) + Stripe + écrans d'upsell arrivent en **P5**. »
- **Spec §11** « Sécurité & RGPD » lignes 217-228 (rétention sélective ligne 222) ; **§9** ligne 183 (durées : bail/EDL/quittances = bail + 3 ans, gestion déléguée +5 ans ; caution 3 ans ; candidature ≤ 3 mois).
- **Invariants §17** : **12** (`retention_class` + `legal_basis` + `retention_until` par donnée concernée) ; **13** (table `plans` data-driven + statut Stripe→entitlement ; `source ∈ {stripe,trial,comp}` précédence `comp` ; client Stripe rattaché à l'espace ; dédup webhook par `event.id` ; quota **à l'INSERT uniquement** ; dépassement → blocage création + lock, jamais destruction).
- **Schéma existant** (NE PAS recréer) :
  - `espaces` (`0001`) : `id`, `nom`, `created_at`, `updated_at`, `version`, `created_by`. RLS posée en `0003`. Triggers `trg_touch_espaces` (`0005`).
  - Tables métier `baux`/`edl`/`quittances`/`baux_historique` (`0011`/`0012`/`0013`) avec socle `version`/`created_at`/`updated_at`/`deleted_at`/`created_by` + RLS FORCE + 4 policies.
  - `public.touch_row()` (`0005`), `public.is_member(uuid)` / `public.has_role(uuid, espace_role[])` (`0002`).
- **Garde CI** `scripts/check-rls-coverage.mjs` : exige pour CHAQUE table `public` de type `r` → `rls_enabled AND rls_forced AND ≥1 policy`. ⇒ `plans` (catalogue global) **doit** être en RLS FORCE avec **≥1 policy** (une policy SELECT suffit).
- **Numérotation migrations** : dernière = `0017`. P0-C2 démarre à **`0018`** et s'arrête à `0021`.

## Décisions de conception (déjà tranchées — ne pas rouvrir)

1. **HOOKS UNIQUEMENT, zéro enforcement.** Aucun trigger de quota, aucune intégration Stripe, aucun écran d'upsell. Le helper `espace_plan` existe (pour que l'app puisse lire les droits et que P5 branche les triggers) mais **rien ne l'appelle pour bloquer**. Les colonnes de rétention existent mais **aucun moteur de purge** ne tourne. (§12 l.271, choix utilisateur de scinder P0-C.)
2. **`plans` = catalogue GLOBAL, pas une table tenant.** Pas d'`espace_id`. Lisible par tout utilisateur authentifié (afficher les paliers/limites côté UI) ; **écriture réservée** au back-office admin → en P0, aucune policy d'écriture pour `authenticated` (les écritures passent par `service_role`, qui contourne la RLS ; un RPC admin viendra plus tard). Cela satisfait `check:rls` (RLS FORCE + 1 policy SELECT).
3. **La précédence `comp` est une invariante d'ÉCRITURE (P5), pas de lecture.** Le helper `espace_plan` lit simplement `espaces.plan_id → plans`. La règle « le webhook Stripe ne downgrade jamais un `comp` » sera implémentée côté webhook en P5 ; elle est documentée mais pas codée ici (pas de webhook en P0).
4. **`plan_id` par défaut = `'free'`** (palier plancher toujours présent → la résolution des droits ne casse jamais), et **backfill** des `espaces` existants à `'free'`. Les octrois `beta`/`comp` sont explicites (mis par le back-office / l'import), pas un défaut de schéma. (Sans enforcement, la valeur par défaut n'a aucun effet bloquant en P0 ; on choisit le plancher sûr.)
5. **Colonnes de rétention sur les 4 tables nommées par l'invariant 12** : `baux`, `edl`, `quittances`, `baux_historique`. PAS sur `documents` (polymorphe, mixte) ni sur des tables `candidatures`/`cautions` (inexistantes en P0) → différé. Valeurs `retention_class` extensibles via CHECK.
6. **Migrations append-only**, une par préoccupation, pour rester lisibles et auditables.

## File Structure

- **Create** `supabase/migrations/0018_p0c2_plans.sql` — table `plans` + seed `free`/`beta` + RLS FORCE + policy SELECT.
- **Create** `supabase/migrations/0019_p0c2_espaces_abonnement.sql` — colonnes d'abonnement sur `espaces` + CHECKs + défaut `plan_id='free'` + backfill.
- **Create** `supabase/migrations/0020_p0c2_helper_espace_plan.sql` — helpers `espace_plan(uuid)` + `espace_has_feature(uuid,text)`.
- **Create** `supabase/migrations/0021_p0c2_retention.sql` — colonnes `retention_class`/`legal_basis`/`retention_until` + CHECKs + défauts sur `baux`/`edl`/`quittances`/`baux_historique`.
- **Create** `supabase/tests/p0c2-gating-retention.test.mjs` — assertions schéma/seed (via `pg`), résolution du helper, preuve RLS du catalogue (via supabase-js : membre lit le catalogue, ne peut pas l'écrire).
- **No change** : `scripts/check-rls-coverage.mjs` (on vérifie juste qu'il passe : 13 tables protégées).

---

### Task 1 : Table `plans` + seed + RLS (migration 0018)

**Files:**
- Create: `supabase/migrations/0018_p0c2_plans.sql`
- Create: `supabase/tests/p0c2-gating-retention.test.mjs`

- [ ] **Step 1 : Écrire la migration 0018**

Create `supabase/migrations/0018_p0c2_plans.sql` :

```sql
-- P0-C2 — Tâche 1/5 : catalogue GLOBAL des paliers d'abonnement (§12-1, invariant 13).
-- HOOK seulement : aucun trigger de quota ici (enforcement = P5). Table NON multi-tenant
-- (pas d'espace_id) : c'est un catalogue lisible par tous les authentifiés ; l'écriture
-- est réservée au back-office (service_role / futur RPC admin) → aucune policy d'écriture
-- pour authenticated. RLS FORCE + 1 policy SELECT = conforme à check:rls.

create table public.plans (
  id                 text primary key,            -- 'free','solo','co_detenteur','agence','beta'...
  nom                text not null,
  limite_biens       int,                         -- unité de quota = logement ; NULL = illimité
  limite_membres     int,                         -- NULL = illimité
  limite_stockage_mo bigint,                       -- en Mo ; NULL = illimité
  features           jsonb not null default '{}'::jsonb,
  prix_cents         int,                          -- prix mensuel en centimes ; NULL = non commercialisé
  devise             text not null default 'EUR',
  actif              boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            bigint not null default 1
);

create trigger trg_touch_plans
  before update on public.plans
  for each row execute function public.touch_row();

-- Seed AVANT la RLS (DML de migration sous rôle privilégié). Deux paliers indispensables :
--   - 'free' : plancher TOUJOURS présent (sinon la résolution des droits casse à l'expiration
--     d'un trial, §12-6) — solo 1 bien / 1 membre.
--   - 'beta' : mode actuel (§12-7), illimité, toutes features.
insert into public.plans (id, nom, limite_biens, limite_membres, limite_stockage_mo, features, prix_cents) values
  ('free', 'Gratuit',       1,    1,    100,  '{}'::jsonb,                              0),
  ('beta', 'Bêta illimité', null, null, null, '{"all": true}'::jsonb,                   null);

alter table public.plans enable row level security;
alter table public.plans force  row level security;

-- Catalogue lisible par tout authentifié (UI : afficher paliers/limites/upsell).
create policy plans_select on public.plans
  for select to authenticated using (true);
-- AUCUNE policy insert/update/delete pour authenticated : écriture réservée au back-office
-- (service_role contourne la RLS ; un RPC admin viendra en P5).
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`
Expected: succès, `0018` appliquée (table + 2 lignes seed + RLS FORCE + policy SELECT).

- [ ] **Step 3 : Écrire le squelette du test + assertions catalogue**

Create `supabase/tests/p0c2-gating-retention.test.mjs` :

```js
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
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:rls -- p0c2`
Expected: les 4 `it` du bloc « catalogue plans » PASSENT.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0018_p0c2_plans.sql supabase/tests/p0c2-gating-retention.test.mjs
git commit -m "$(cat <<'EOF'
P0-C2 T1 : catalogue global plans (data-driven) + seed free/beta + RLS

Table plans (quotas + features jsonb), non multi-tenant, lisible par tout
authentifié, écriture réservée back-office. Seed « free » (plancher) + « beta »
(illimité). HOOK seulement : aucun trigger de quota (enforcement P5).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 : Colonnes d'abonnement sur `espaces` (migration 0019)

**Files:**
- Create: `supabase/migrations/0019_p0c2_espaces_abonnement.sql`
- Test: `supabase/tests/p0c2-gating-retention.test.mjs` (ajout bloc « abonnement espaces »)

- [ ] **Step 1 : Écrire la migration 0019**

Create `supabase/migrations/0019_p0c2_espaces_abonnement.sql` :

```sql
-- P0-C2 — Tâche 2/5 : crochets d'abonnement sur espaces (§12-4, invariant 13).
-- HOOK seulement : aucun trigger ne lit ces colonnes pour bloquer (enforcement P5).
-- Append-only : ne modifie pas 0001.

alter table public.espaces
  add column plan_id             text not null default 'free' references public.plans(id),
  add column subscription_source text,                    -- 'stripe' | 'trial' | 'comp'
  add column subscription_status text,                    -- spectre Stripe (nullable)
  add column trial_ends_at       timestamptz,
  add column stripe_customer_id  text,                    -- client Stripe RATTACHÉ À L'ESPACE (invariant 13)
  add column comp_reason         text,
  add column comp_granted_by     uuid references auth.users(id),
  add column comp_granted_at     timestamptz;

-- source ∈ {stripe, trial, comp} (invariant 13). NULL autorisé (espace sans abonnement défini).
alter table public.espaces
  add constraint espaces_subscription_source_chk
  check (subscription_source is null or subscription_source in ('stripe','trial','comp'));

-- spectre de statuts Stripe à mapper explicitement (§12-4) — documenté au niveau schéma.
alter table public.espaces
  add constraint espaces_subscription_status_chk
  check (subscription_status is null or subscription_status in (
    'trialing','active','incomplete','incomplete_expired','past_due','unpaid','canceled','paused'));

-- backfill des espaces déjà créés (P0-A/B/C1) : plancher « free » (le default ne couvre
-- que les futures lignes). Sûr : aucun enforcement en P0, donc aucun effet bloquant.
update public.espaces set plan_id = 'free' where plan_id is null;
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`
Expected: succès. (Le `default 'free'` + le backfill garantissent `plan_id` non nul partout ; les espaces existants référencent une ligne `plans` valide.)

- [ ] **Step 3 : Ajouter le bloc de test « abonnement espaces »**

Dans `supabase/tests/p0c2-gating-retention.test.mjs`, après le bloc « catalogue plans », ajouter :

```js
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
        c.query(`update public.espaces set subscription_status = 'inventé' where id = $1`, [espaceA])
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
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:rls -- p0c2`
Expected: blocs « catalogue plans » + « abonnement espaces » PASSENT.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0019_p0c2_espaces_abonnement.sql supabase/tests/p0c2-gating-retention.test.mjs
git commit -m "$(cat <<'EOF'
P0-C2 T2 : crochets d'abonnement sur espaces (plan_id/source/status/stripe/comp)

Colonnes plan_id (FK plans, défaut free + backfill), subscription_source ∈
{stripe,trial,comp}, subscription_status (spectre Stripe), trial_ends_at,
stripe_customer_id (rattaché à l'espace), audit comp_*. HOOK seulement.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 : Helper de résolution des droits `espace_plan` (migration 0020)

**Files:**
- Create: `supabase/migrations/0020_p0c2_helper_espace_plan.sql`
- Test: `supabase/tests/p0c2-gating-retention.test.mjs` (ajout bloc « helper »)

- [ ] **Step 1 : Écrire la migration 0020**

Create `supabase/migrations/0020_p0c2_helper_espace_plan.sql` :

```sql
-- P0-C2 — Tâche 3/5 : helpers de résolution des droits (§12-3, invariant 13, §17-13).
-- HOOK seulement : ces fonctions LISENT le plan effectif d'un espace ; AUCUN trigger ne
-- les appelle pour bloquer en P0 (les triggers de quota à l'INSERT arrivent en P5 et
-- s'appuieront dessus → zéro retrofit). SECURITY DEFINER + search_path='' (pattern is_member).
--
-- Note précédence comp (invariant 13) : « comp prime sur Stripe » est une invariante
-- d'ÉCRITURE (le webhook P5 ne réécrit jamais le plan_id/source d'un espace source='comp').
-- Côté LECTURE, le plan effectif est simplement espaces.plan_id → plans : pas de cas
-- particulier ici.

-- Plan effectif d'un espace (ligne plans complète). NULL si espace introuvable.
create or replace function public.espace_plan(p_espace_id uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.espaces e
  join public.plans p on p.id = e.plan_id
  where e.id = p_espace_id;
$$;

-- Une feature booléenne du plan effectif (false si absente/espace introuvable).
create or replace function public.espace_has_feature(p_espace_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((public.espace_plan(p_espace_id)).features ->> p_feature)::boolean, false);
$$;
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`
Expected: succès, deux fonctions créées.

- [ ] **Step 3 : Ajouter le bloc de test « helper »**

Dans `supabase/tests/p0c2-gating-retention.test.mjs`, après le bloc « abonnement espaces », ajouter :

```js
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
      // feature résolue depuis features jsonb
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
})
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:rls -- p0c2`
Expected: blocs « catalogue » + « abonnement » + « helper » PASSENT.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0020_p0c2_helper_espace_plan.sql supabase/tests/p0c2-gating-retention.test.mjs
git commit -m "$(cat <<'EOF'
P0-C2 T3 : helper de résolution des droits espace_plan + espace_has_feature

Résolveur SECURITY DEFINER (search_path='') du plan effectif d'un espace, sur
lequel les triggers de quota P5 s'appuieront (zéro retrofit). HOOK : aucun
appel bloquant en P0. Précédence comp = invariante d'écriture (P5), pas lecture.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4 : Colonnes de rétention (migration 0021)

**Files:**
- Create: `supabase/migrations/0021_p0c2_retention.sql`
- Test: `supabase/tests/p0c2-gating-retention.test.mjs` (ajout bloc « rétention »)

- [ ] **Step 1 : Écrire la migration 0021**

Create `supabase/migrations/0021_p0c2_retention.sql` :

```sql
-- P0-C2 — Tâche 4/5 : colonnes de rétention légale (§9 l.183, §11 l.222, invariant 12).
-- HOOK seulement : ces colonnes PILOTERONT l'effacement sélectif RGPD ; AUCUN moteur de
-- purge ne tourne en P0 (P5). Posées sur les 4 tables nommées par l'invariant 12
-- (bail/EDL/quittances + baux_historique archivé). PAS sur documents (polymorphe) ni sur
-- candidatures/cautions (tables inexistantes en P0) → différé.
-- Append-only : ne modifie pas 0011/0012/0013.

do $ret$
declare t text;
begin
  foreach t in array array['baux','edl','quittances','baux_historique'] loop
    execute format($f$
      alter table public.%I
        add column retention_class text not null default 'bail_plus_3ans',
        add column legal_basis      text not null default 'obligation_legale',
        add column retention_until  timestamptz
    $f$, t);

    -- classes de rétention extensibles (invariant 12). Couvre bail+3/5 ans, caution 3 ans,
    -- candidature 3 mois, et 'autre' pour l'extension.
    execute format($f$
      alter table public.%I add constraint %I
        check (retention_class in
          ('bail_plus_3ans','bail_plus_5ans','caution_3ans','candidature_3mois','autre'))
    $f$, t, t || '_retention_class_chk');

    -- base légale (RGPD art. 6). 'obligation_legale' par défaut (rétention bail).
    execute format($f$
      alter table public.%I add constraint %I
        check (legal_basis in
          ('obligation_legale','execution_contrat','consentement','interet_legitime'))
    $f$, t, t || '_legal_basis_chk');
  end loop;
end
$ret$;
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`
Expected: succès, 3 colonnes + 2 CHECKs ajoutés sur chacune des 4 tables (les lignes existantes prennent les défauts `bail_plus_3ans` / `obligation_legale`, qui satisfont les CHECKs).

- [ ] **Step 3 : Ajouter le bloc de test « rétention »**

Dans `supabase/tests/p0c2-gating-retention.test.mjs`, après le bloc « helper », ajouter :

```js
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

  it('le CHECK refuse une retention_class hors liste', async () => {
    const c = db(); await c.connect()
    try {
      // on insère un espace+bail minimal en service_role pour tester le CHECK sans RLS.
      await expect(
        c.query(`update public.baux set retention_class = 'pour_toujours' where espace_id = $1`, [espaceA])
      ).rejects.toThrow(/retention_class_chk|violates check/i)
      // NB : 0 ligne baux dans espaceA → l'UPDATE ne touche rien et NE lève PAS. On teste donc
      // le CHECK sur une valeur via une insertion ciblée ci-dessous à la place.
    } finally { await c.end() }
  })
})
```

> **Note d'implémentation pour le testeur :** le dernier `it` ci-dessus est fragile (un `UPDATE` qui ne touche aucune ligne ne lève pas le CHECK). **Remplace-le** par un test qui crée réellement une ligne puis tente la valeur interdite. Comme `espaceA` n'a pas de bail semé dans cette suite, le plus simple est de semer une chaîne minimale en `service_role` via `pg` (insert `entites`→`logements`→`baux` avec `espace_id=espaceA`, en fournissant `created_by`=l'id d'Alice), puis :
> ```js
> await expect(
>   c.query(`update public.baux set retention_class = 'pour_toujours' where id = $1`, [bailId])
> ).rejects.toThrow(/retention_class_chk|violates check/i)
> ```
> Récupère l'id d'Alice via `select id from auth.users where email = $1`. Pense à nettoyer la chaîne semée en fin de test (ou laisse la fuite connue l'emporter). Si semer une chaîne complète est trop lourd, teste plutôt le CHECK directement sur `baux_historique` qui n'exige qu'`espace_id` + `bail_snapshot` (insert minimal), puis l'`update` interdit sur cette ligne. **Garde un test qui prouve réellement le rejet d'une classe invalide.**

- [ ] **Step 4 : Lancer le test + la garde de couverture**

Run: `npm run test:rls -- p0c2`
Expected: tous les blocs P0-C2 PASSENT (catalogue, abonnement, helper, rétention).

Run: `npm run check:rls`
Expected: ✅ — 13 tables protégées (`plans` incluse).

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0021_p0c2_retention.sql supabase/tests/p0c2-gating-retention.test.mjs
git commit -m "$(cat <<'EOF'
P0-C2 T4 : colonnes de rétention RGPD (retention_class/legal_basis/retention_until)

Hook d'effacement sélectif (invariant 12) sur baux/edl/quittances/baux_historique
+ CHECKs extensibles. AUCUN moteur de purge (P5). check:rls vert (13 tables).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5 : Suite complète + audit code-reviewer (RÈGLE GRAVÉE) + clôture

**Files:**
- Test: `supabase/tests/p0c2-gating-retention.test.mjs` (finalisé)
- Modify: `C:\Users\Did_K\.claude\projects\C--Users-Did-K-Desktop-Immo\memory\project_persistance_multitenant.md` + `MEMORY.md`

- [ ] **Step 1 : Lancer la suite RLS COMPLÈTE + la garde**

Run: `npm run test:rls`
Expected: P0-A + P0-B + P0-C1 + P0-C2 tous verts, aucun rouge.

Run: `npm run check:rls`
Expected: ✅ 13 tables protégées.

- [ ] **Step 2 : AUDIT `superpowers:code-reviewer` (RÈGLE GRAVÉE — bloquant)**

Dispatcher un agent `superpowers:code-reviewer` sur l'ensemble P0-C2 (migrations `0018`→`0021` + `p0c2-gating-retention.test.mjs`). Brief : vérifier (1) que `plans` (table globale sans `espace_id`) n'introduit AUCUNE fuite — un `authenticated` lit le catalogue mais ne peut RIEN écrire ; (2) que les helpers `espace_plan`/`espace_has_feature` (SECURITY DEFINER) ne sont pas une surface d'escalade (search_path='', pas d'effet de bord, ne renvoient que des données de catalogue) ; (3) que les CHECKs (`subscription_source`, `subscription_status`, `retention_class`, `legal_basis`) sont cohérents et validés contre les lignes existantes ; (4) que le défaut `plan_id='free'` + backfill ne casse pas la FK ni les espaces existants ; (5) que **rien n'enforce** (pas de trigger de quota, pas de purge) — conforme au scope « hooks seulement » ; (6) que les tests prouvent réellement les comportements (pas de faux-positif type UPDATE qui ne touche aucune ligne). Itérer jusqu'à **PASSANT** (0 Critical/Important). Corriger en migration append-only (`0022+`) si faille schéma, en test seul si seule la preuve manque.

Expected: rapport **PASSANT**.

- [ ] **Step 3 : Mettre à jour le suivi epic (mémoire)**

Modifier `project_persistance_multitenant.md` : ajouter **P0-C2 ✅ LIVRÉ** (migrations `0018`→`0021` : catalogue `plans` + seed free/beta, colonnes abonnement sur `espaces`, helpers `espace_plan`/`espace_has_feature`, colonnes rétention sur 4 tables ; HOOKS seulement, enforcement→P5 ; tests verts ; `check:rls` 13 tables ; audit PASSANT). Mettre à jour `## Reste à faire` : retirer P0-C2, garder **primitive de suppression d'espace** (toujours à planifier) → **P0-D** (Auth/Realtime/Storage) → **P0-E** (import tenant #1, ⚠️ reset DB password avant). Répercuter une ligne courte dans `MEMORY.md`.

- [ ] **Step 4 : Clôture**

Annoncer : P0-C2 livré (crochets d'abonnement + colonnes de rétention), audit PASSANT, suite RLS complète verte, `check:rls` 13 tables. Rappeler que **rien n'est à tester côté app** (infra base, `index.html` non touché) et que **rien n'enforce encore** : quotas/Stripe/upsell + moteur de purge rétention = P5 ; le câblage UI viendra avec l'intégration app. Rappeler les deux pistes ouvertes : **primitive de suppression d'espace** (planifiée) puis **P0-D**.

---

## Self-Review (relecture finale du plan vs spec)

**1. Couverture §12 / invariants 12-13 (périmètre HOOKS) :**
- Table `plans` data-driven + seed `free` (plancher §12-6) + `beta` (§12-7) → T1. ✓
- `espace.plan_id` + `subscription_source ∈ {stripe,trial,comp}` + spectre `subscription_status` + `stripe_customer_id` rattaché à l'espace + audit `comp_*` → T2. ✓ (invariant 13)
- Helper de check (`espace_plan`/`espace_has_feature`) → T3. ✓ (§12-3, §17-13)
- Colonnes rétention `retention_class`/`legal_basis`/`retention_until` → T4. ✓ (invariant 12)
- **Hors scope (P5), explicitement non implémenté** : triggers de quota à l'INSERT, intégration/webhook Stripe + dédup `event.id` + réconciliation cron, écrans d'upsell, moteur de purge rétention, précédence `comp` côté écriture. Conforme §12 l.271. ✓

**2. Placeholders :** aucun « TBD ». Le seul point laissé au jugement du testeur (le test du CHECK `retention_class`) est explicitement décrit avec deux implémentations concrètes + l'exigence « garder un test qui prouve réellement le rejet ».

**3. Cohérence des types/symboles :** `plans.id` (text) référencé par `espaces.plan_id` (text) ; `espace_plan` retourne `public.plans` ; `touch_row` réutilisée (pas redéfinie) ; `check:rls` attend RLS FORCE + ≥1 policy sur `plans` (fourni). ✓

**4. Scope :** strictement les crochets + rétention. Aucun enforcement. La fuite de tenant de test est documentée (renvoi à la primitive de suppression dédiée), pas re-traitée ici. ✓
