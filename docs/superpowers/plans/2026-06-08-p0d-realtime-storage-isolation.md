# P0-D — Isolation Realtime + Storage par espace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que les deux canaux que la RLS Postgres **ne couvre pas automatiquement** — **Realtime** et **Storage** — sont isolés par espace, avec preuve cross-tenant. (Auth email/mot de passe est déjà opérationnel ; Google SSO = config dashboard différée, hors scope.)

**Architecture :** Un même invariant qu'en RLS métier : « membre de l'espace de cette ressource ? ». Pour **Storage**, on crée un bucket privé `espace-files` et des policies sur `storage.objects` ancrées sur le **premier segment du chemin** de l'objet (`<espace_id>/…`) — lecture = `is_member`, écriture = `has_role(owner|gestionnaire)`. Pour **Realtime**, on active l'autorisation par RLS sur `realtime.messages` : un client ne peut s'abonner/diffuser sur un **canal privé** `espace:<espace_id>` que s'il est membre de cet espace. Un helper `safe_uuid()` parse sans lever le segment de chemin / le topic. On réutilise `is_member`/`has_role` (P0-A) — zéro divergence. Les preuves sont des **tests cross-tenant** (Alice membre d'espaceA, Bob d'espaceB) : Bob ne lit/écrit ni les fichiers ni le canal d'Alice.

**Tech Stack :** PostgreSQL 17.6 (Supabase EU) — schémas `storage` + `realtime`, migrations SQL append-only ; tests Vitest + `@supabase/supabase-js` (client Storage HTTP + client Realtime websocket) + `pg`. Repo PUBLIC → aucun secret commité.

**Hors scope (explicite) :**
- **Google SSO** : nécessite une app OAuth Google Cloud (client ID/secret) + activation du provider dans le dashboard Supabase — action utilisateur, pas une migration. Différé (sans doc pour l'instant, choix utilisateur 2026-06-08).
- **Consommation applicative** de Realtime/Storage (abonnement live, upload UI, URLs signées dans l'app) = P3. Ici on pose et on **prouve** l'isolation ; le câblage `index.html` viendra plus tard.
- **TTL des URLs signées** = convention applicative (`createSignedUrl(path, <court>)`) au moment de servir un fichier ; pas une policy DB. Documenté, pas implémenté ici.

---

## Contexte de référence

- **Spec §16 risques** (ligne 337) : « La RLS ne couvre PAS Realtime ni Storage par défaut : policy Realtime privée par espace + policy Storage par préfixe `espace_id/` ancré + URL signée TTL court ; **tests cross-tenant dédiés** (§17-15/16). »
- **Invariant §17-15** (Realtime) : « la RLS Postgres ne s'applique pas automatiquement aux canaux Realtime — un client peut s'abonner au `topic` d'un autre tenant. Channels **privés** + policy `realtime.messages` par espace, **testée par un cas cross-tenant**. »
- **Invariant §17-16** (Storage) : « policy `storage.objects` sur le chemin `espace_id/…` (préfixe **ancré**, pas un simple nom de bucket) + **URL signée à TTL court** + test cross-tenant. »
- **Spec §10** (ligne 191) : « Source de vérité = Supabase Storage, bucket par espace, RLS, URLs signées temporaires, EU. » (On implémente un **bucket unique privé + isolation par préfixe `espace_id/` ancré** — équivalent sécurité au « bucket par espace » et plus simple à exploiter ; l'ancrage dans la policy est ce que l'invariant 16 exige explicitement.)
- **Briques réutilisées** (NE PAS redéfinir) : `public.is_member(uuid)`, `public.has_role(uuid, espace_role[])` (`0002`). Convention rôles d'écriture : `array['owner','gestionnaire']::public.espace_role[]`.
- **Helpers de test** : `clients.mjs` (`createUser`, `userClient`, `adminClient`, `deleteUserByEmail`) ; `teardown.mjs` (`teardownOwner`).
- **Numérotation migrations** : dernière = `0023`. P0-D = **`0024`** (Storage) + **`0025`** (Realtime).
- **`check:rls`** ne vérifie que le schéma `public` → `storage.objects`/`realtime.messages` (autres schémas) **n'affectent pas** le compte (reste 13 tables).

## Décisions de conception (tranchées)

1. **Bucket unique privé `espace-files` + isolation par préfixe ancré**, pas un bucket par espace (un bucket par tenant ne scale pas — limites de buckets — et l'invariant 16 exige l'ancrage *dans la policy*, ce que le préfixe `<espace_id>/` fait). Le bucket est **privé** (`public=false`) → tout accès passe par la RLS + URLs signées.
2. **Ancrage = premier segment du chemin** : `split_part(name,'/',1)` = `<espace_id>`. Parsé via `public.safe_uuid()` (renvoie NULL si non-uuid → `is_member(NULL)=false` → refus) pour ne jamais lever sur un chemin malformé.
3. **Realtime via canaux privés + RLS `realtime.messages`** : topic = `espace:<espace_id>`. La policy autorise SELECT (recevoir) + INSERT (diffuser) si membre de l'espace du topic. C'est l'« Realtime Authorization » Supabase (GA).
4. **Lecture = `is_member`, écriture = `has_role(owner|gestionnaire)`** — strictement aligné sur la RLS métier (P0-A/B). Pas de divergence de modèle.
5. **Tests cross-tenant obligatoires** (la policy seule est déclarative ; seul un test prouve l'enforcement). Storage = HTTP (fiable) ; Realtime = websocket (timeouts généreux).

## File Structure

- **Create** `supabase/migrations/0024_p0d_storage_isolation.sql` — helper `safe_uuid` + bucket `espace-files` + 4 policies `storage.objects`.
- **Create** `supabase/migrations/0025_p0d_realtime_isolation.sql` — policies `realtime.messages` (SELECT + INSERT) par topic d'espace.
- **Create** `supabase/tests/p0d-storage.test.mjs` — preuve cross-tenant Storage (A écrit/lit son préfixe ; B ne voit/écrit pas celui d'A ; B écrit le sien).
- **Create** `supabase/tests/p0d-realtime.test.mjs` — preuve cross-tenant Realtime (A s'abonne au canal privé d'espaceA = SUBSCRIBED ; B = CHANNEL_ERROR).

---

### Task 1 : Isolation Storage (migration 0024) + test cross-tenant

**Files:**
- Create: `supabase/migrations/0024_p0d_storage_isolation.sql`
- Create: `supabase/tests/p0d-storage.test.mjs`

- [ ] **Step 1 : Écrire la migration 0024**

Create `supabase/migrations/0024_p0d_storage_isolation.sql` :

```sql
-- P0-D — Tâche 1/3 : isolation Storage par espace (§16, invariant 16).
-- La RLS Postgres ne couvre PAS Storage par défaut → on pose des policies sur
-- storage.objects ANCRÉES sur le 1er segment du chemin (<espace_id>/…). Bucket privé
-- unique 'espace-files' (public=false → tout accès via RLS + URLs signées).

-- Parse uuid tolérant : NULL si non-uuid (jamais d'exception en évaluation de policy).
create or replace function public.safe_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- Bucket privé (idempotent). public=false → pas d'accès anonyme, tout passe par la RLS.
insert into storage.buckets (id, name, public)
values ('espace-files', 'espace-files', false)
on conflict (id) do nothing;

-- Policies sur storage.objects, ancrées sur le 1er segment du chemin = espace_id.
-- Lecture = membre ; écriture (insert/update/delete) = owner|gestionnaire.
-- storage.objects a déjà la RLS activée par Supabase ; on ajoute les policies.
create policy "espace-files: lecture membre"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'espace-files'
    and public.is_member( public.safe_uuid( split_part(name, '/', 1) ) )
  );

create policy "espace-files: insert writer"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'espace-files'
    and public.has_role( public.safe_uuid( split_part(name, '/', 1) ), array['owner','gestionnaire']::public.espace_role[] )
  );

create policy "espace-files: update writer"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_role( public.safe_uuid( split_part(name, '/', 1) ), array['owner','gestionnaire']::public.espace_role[] )
  )
  with check (
    bucket_id = 'espace-files'
    and public.has_role( public.safe_uuid( split_part(name, '/', 1) ), array['owner','gestionnaire']::public.espace_role[] )
  );

create policy "espace-files: delete writer"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_role( public.safe_uuid( split_part(name, '/', 1) ), array['owner','gestionnaire']::public.espace_role[] )
  );
```

- [ ] **Step 2 : Pousser la migration**

Run: `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`
Expected: succès, helper + bucket + 4 policies créés. (Si une policy du même nom existe déjà d'un essai précédent, l'erreur l'indiquera → adapter avec `drop policy if exists` en tête, append-only.)

- [ ] **Step 3 : Écrire le test cross-tenant Storage**

Create `supabase/tests/p0d-storage.test.mjs` :

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient, adminClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p0d-st-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `p0d-st-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }
const BUCKET = 'espace-files'

let clientA, clientB, espaceA, espaceB
const pathA = () => `${espaceA}/alice-${RUN}.txt`

beforeAll(async () => {
  await createUser(A.email, A.pass)
  await createUser(B.email, B.pass)
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P0D-ST' })
  if (e1) throw e1; espaceA = ea.id
  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Espace Bob P0D-ST' })
  if (e2) throw e2; espaceB = eb.id
})

afterAll(async () => {
  // retirer les objets de test du bucket (Storage n'est pas lié aux espaces par FK).
  await adminClient().storage.from(BUCKET).remove([pathA(), `${espaceB}/bob-${RUN}.txt`]).catch(() => {})
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(B.email, [espaceB])
})

describe('P0-D — isolation Storage par espace (préfixe ancré)', () => {
  it('Alice (writer) PEUT uploader dans son préfixe espaceA/', async () => {
    const { error } = await clientA.storage.from(BUCKET).upload(pathA(), Buffer.from('contenu Alice'), {
      contentType: 'text/plain', upsert: true,
    })
    expect(error).toBeNull()
  })

  it('Bob NE VOIT PAS les fichiers du préfixe d\'Alice (list)', async () => {
    const { data, error } = await clientB.storage.from(BUCKET).list(espaceA)
    expect(error).toBeNull()
    expect(data).toEqual([])                         // RLS select : Bob non membre d'espaceA
  })

  it('Bob NE PEUT PAS télécharger un fichier du préfixe d\'Alice', async () => {
    const { data, error } = await clientB.storage.from(BUCKET).download(pathA())
    expect(data).toBeNull()                          // refus RLS → pas de contenu
    expect(error).not.toBeNull()
  })

  it('Bob NE PEUT PAS uploader dans le préfixe d\'Alice (with check has_role faux)', async () => {
    const { error } = await clientB.storage.from(BUCKET).upload(`${espaceA}/intrusion-${RUN}.txt`, Buffer.from('x'), {
      contentType: 'text/plain',
    })
    expect(error).not.toBeNull()                     // violation RLS
  })

  it('Bob PEUT uploader dans SON propre préfixe espaceB/ (non-régression)', async () => {
    const { error } = await clientB.storage.from(BUCKET).upload(`${espaceB}/bob-${RUN}.txt`, Buffer.from('contenu Bob'), {
      contentType: 'text/plain', upsert: true,
    })
    expect(error).toBeNull()
  })
})
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:rls -- p0d-storage`
Expected: 5 `it` PASSENT (Alice écrit son préfixe ; Bob ne voit/télécharge/écrit pas celui d'Alice ; Bob écrit le sien).

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0024_p0d_storage_isolation.sql supabase/tests/p0d-storage.test.mjs
git commit -m "$(cat <<'EOF'
P0-D T1 : isolation Storage par espace (préfixe ancré) + test cross-tenant

Bucket privé espace-files + policies storage.objects ancrées sur le 1er segment
du chemin (<espace_id>/…) : lecture=is_member, écriture=has_role. Helper safe_uuid
(parse tolérant). Preuve cross-tenant : Bob ne voit/télécharge/écrit pas le préfixe
d'Alice, écrit le sien. Invariant 16.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2 : Isolation Realtime (migration 0025) + test cross-tenant

**Files:**
- Create: `supabase/migrations/0025_p0d_realtime_isolation.sql`
- Create: `supabase/tests/p0d-realtime.test.mjs`

- [ ] **Step 1 : Écrire la migration 0025**

Create `supabase/migrations/0025_p0d_realtime_isolation.sql` :

```sql
-- P0-D — Tâche 2/3 : isolation Realtime par espace (§16, invariant 15).
-- La RLS ne couvre PAS Realtime par défaut → un client pourrait s'abonner au topic d'un
-- autre tenant. On active l'autorisation par RLS sur realtime.messages : un canal PRIVÉ
-- 'espace:<espace_id>' n'est lisible/diffusable que par un membre de cet espace.
-- realtime.topic() renvoie le topic du canal courant. safe_uuid (0024) parse le segment.

-- SELECT = recevoir les messages du canal ; INSERT = diffuser sur le canal.
create policy "realtime: lecture canal espace membre"
  on realtime.messages for select to authenticated
  using ( public.is_member( public.safe_uuid( split_part(realtime.topic(), ':', 2) ) ) );

create policy "realtime: diffusion canal espace membre"
  on realtime.messages for insert to authenticated
  with check ( public.is_member( public.safe_uuid( split_part(realtime.topic(), ':', 2) ) ) );
```

> **Note testeur :** `realtime.messages` a normalement déjà la RLS activée par Supabase (Realtime Authorization). Si `npx supabase db push` échoue sur un droit (`must be owner of table messages`), c'est que le rôle de migration ne possède pas `realtime.messages` : exécuter alors le `create policy` via une connexion `pg` `service_role`/postgres directe (comme le delta des grants en T1 de la primitive purge), et committer quand même le fichier `0025` (source de vérité pour un rebuild). Vérifier la faisabilité AVANT d'écrire le test.

- [ ] **Step 2 : Pousser la migration (ou appliquer le delta en pg si droit insuffisant)**

Run: `npx supabase db push --db-url "$SUPABASE_DB_URL" --yes`
Expected: succès (policies créées). Sinon, voir la note ci-dessus.

- [ ] **Step 3 : Écrire le test cross-tenant Realtime**

Create `supabase/tests/p0d-realtime.test.mjs` :

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createUser, userClient } from './helpers/clients.mjs'
import { teardownOwner } from './helpers/teardown.mjs'

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const A = { email: `p0d-rt-alice-${RUN}@example.test`, pass: 'Test-Passw0rd!A' }
const B = { email: `p0d-rt-bob-${RUN}@example.test`,   pass: 'Test-Passw0rd!B' }

let clientA, clientB, espaceA, espaceB

// Tente de s'abonner à un canal privé ; résout le statut terminal (SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT).
function trySubscribe(client, topic, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const ch = client.channel(topic, { config: { private: true } })
    const done = (status) => { try { client.removeChannel(ch) } catch {} ; resolve(status) }
    const t = setTimeout(() => done('TIMED_OUT'), timeoutMs)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(t); done(status)
      }
    })
  })
}

beforeAll(async () => {
  await createUser(A.email, A.pass)
  await createUser(B.email, B.pass)
  clientA = await userClient(A.email, A.pass)
  clientB = await userClient(B.email, B.pass)
  const { data: ea, error: e1 } = await clientA.rpc('create_espace', { p_nom: 'Espace Alice P0D-RT' })
  if (e1) throw e1; espaceA = ea.id
  const { data: eb, error: e2 } = await clientB.rpc('create_espace', { p_nom: 'Espace Bob P0D-RT' })
  if (e2) throw e2; espaceB = eb.id
})

afterAll(async () => {
  await teardownOwner(A.email, [espaceA])
  await teardownOwner(B.email, [espaceB])
})

describe('P0-D — isolation Realtime par espace (canaux privés)', () => {
  it('Alice PEUT s\'abonner au canal privé de SON espace', async () => {
    const status = await trySubscribe(clientA, `espace:${espaceA}`)
    expect(status).toBe('SUBSCRIBED')
  }, 15000)

  it('Bob NE PEUT PAS s\'abonner au canal privé de l\'espace d\'Alice', async () => {
    const status = await trySubscribe(clientB, `espace:${espaceA}`)
    expect(status).toBe('CHANNEL_ERROR')             // autorisation RLS refusée
  }, 15000)

  it('Bob PEUT s\'abonner au canal privé de SON espace (non-régression)', async () => {
    const status = await trySubscribe(clientB, `espace:${espaceB}`)
    expect(status).toBe('SUBSCRIBED')
  }, 15000)
})
```

- [ ] **Step 4 : Lancer le test**

Run: `npm run test:rls -- p0d-realtime`
Expected: 3 `it` PASSENT (Alice s'abonne à son canal ; Bob refusé sur celui d'Alice ; Bob OK sur le sien).

> **Si le websocket est environnementalement instable** (TIMED_OUT non déterministe en CI/headless) : augmenter le timeout, vérifier que Realtime est activé sur le projet, et si vraiment impossible à fiabiliser, documenter la limite + prouver la LOGIQUE de la policy via `pg` (poser `request.jwt.claims` + `realtime.topic` en `set local` et évaluer `is_member(safe_uuid(...))` pour A membre vs B non-membre). Le websocket reste la preuve recherchée ; le fallback pg prouve au moins l'expression d'autorisation.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0025_p0d_realtime_isolation.sql supabase/tests/p0d-realtime.test.mjs
git commit -m "$(cat <<'EOF'
P0-D T2 : isolation Realtime par espace (canaux privés) + test cross-tenant

Policies realtime.messages : un canal privé espace:<id> n'est lisible/diffusable
que par un membre (is_member du topic). Preuve cross-tenant websocket : Bob refusé
(CHANNEL_ERROR) sur le canal d'Alice, OK sur le sien. Invariant 15.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3 : Suite complète + audit code-reviewer (RÈGLE GRAVÉE) + mémoire + clôture

- [ ] **Step 1 : Suite complète + check:rls**

Run: `npm run test:rls` → tout vert (P0-A/B/C1/C2/purge + P0-D Storage + Realtime).
Run: `npm run check:rls` → ✅ 13 tables (storage/realtime hors schéma public, pas d'impact).

- [ ] **Step 2 : AUDIT `superpowers:code-reviewer` (bloquant)**

Dispatcher un agent `superpowers:code-reviewer` sur `0024` + `0025` + `p0d-storage.test.mjs` + `p0d-realtime.test.mjs`. Brief : vérifier (1) que les policies Storage sont **ancrées** sur le 1er segment du chemin (pas seulement le bucket) et qu'un non-membre ne peut ni lire/lister/télécharger ni écrire un préfixe d'autrui ; (2) que `safe_uuid` ne lève jamais (chemin/topic malformé → NULL → refus, pas d'erreur) ; (3) que les policies Realtime autorisent un canal `espace:<id>` au seul membre (SELECT+INSERT) et qu'un non-membre est refusé ; (4) qu'aucune policy n'est permissive (`using(true)`) ni ne laisse une faille `anon` ; (5) lecture=`is_member` / écriture=`has_role` cohérent avec la RLS métier ; (6) que les tests prouvent réellement l'enforcement cross-tenant (pas un faux-positif : list vide car non-membre = la bonne raison ; CHANNEL_ERROR = refus d'autorisation). Itérer jusqu'à **PASSANT**.

Expected: rapport **PASSANT**.

- [ ] **Step 3 : Mémoire**

`project_persistance_multitenant.md` : ajouter **P0-D (Realtime + Storage) ✅ LIVRÉ** (migrations `0024`/`0025` : bucket privé `espace-files` + policies `storage.objects` ancrées préfixe + policies `realtime.messages` canal privé par espace + helper `safe_uuid` ; tests cross-tenant Storage + Realtime ; audit PASSANT ; **Google SSO différé** = action dashboard utilisateur ; consommation app + URLs signées TTL = P3). Mettre à jour `Reste à faire` : **Google SSO** (config dashboard, quand l'utilisateur voudra) + **P0-E** (import tenant #1, ⚠️ reset DB password avant). Répercuter `MEMORY.md`.

- [ ] **Step 4 : Clôture**

Annoncer : P0-D (isolation Realtime + Storage) livré + audit PASSANT, suite complète verte. Rappeler que **rien n'est à tester côté app** (infra ; consommation = P3) et que **Google SSO reste à configurer par toi** (dashboard, quand tu veux — je rédigerai le pas-à-pas sur demande). Prochaine grande étape : **P0-E** (import des données réelles, avec reset du mot de passe DB d'abord).

---

## Self-Review

**1. Couverture invariants 15/16 :** Storage ancré préfixe + cross-tenant (T1) ; Realtime canal privé + cross-tenant (T2). ✓
**2. Hors scope assumé :** Google SSO (action utilisateur), consommation app + TTL URLs signées (P3). Documenté, pas bâclé. ✓
**3. Cohérence symboles :** `safe_uuid` (0024) réutilisé par 0025 ; `is_member`/`has_role` réutilisés ; `teardownOwner` pour le démontage (pas d'orphelin) ; objets Storage nettoyés explicitement en afterAll (Storage non lié aux espaces par FK). ✓
**4. Risques identifiés :** droit d'ownership sur `realtime.messages` (fallback pg documenté) ; flakiness websocket (timeouts + fallback logique pg documenté). ✓
