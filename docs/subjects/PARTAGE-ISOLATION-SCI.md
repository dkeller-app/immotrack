# Partage par SCI — isolation Storage · Realtime · membres (rapport de chantier)

**Date** : 2026-09-17 · **Type** : sécurité (isolation multi-tenant intra-espace, anti-élévation)
**Branche** : `feat/partage-isolation-sci` (worktree `Immo-wt-partage-secu`, base `origin/main` `7088789` v15.633)
**Spec** : `docs/superpowers/specs/2026-09-17-partage-isolation-sci-design.md`

## 1. Objectif

Lever le verrou écrit dans `supabase/migrations/0030_p1_partage_sci_rls.sql` l. 34-41 (« NE PAS créer de membre scopé · NE PAS activer le partage » tant que Storage et Realtime restent filtrés au niveau espace). Un membre **scopé** (`espace_members.full_espace=false` + octroi `entite_membre` sur UNE SCI) ne doit ni lister/télécharger les fichiers d'une autre SCI, ni recevoir ses données par Realtime/re-pull. Un membre **plein** (`full_espace=true`) continue de tout voir.

## 2. État réel de la base hébergée (lu dans `pg_policies` le 2026-09-17, pas déduit des fichiers)

| Surface | Policy en prod | Origine | Verdict |
|---|---|---|---|
| `storage.objects` bucket `espace-files` (SELECT/INSERT/UPDATE/DELETE) | `has_entite_access` / `has_entite_write( safe_uuid(seg1), safe_uuid(seg2) )` | 0031 | **par-SCI** — le commentaire de 0030 est périmé |
| `realtime.messages` canal `espace:<id>` (SELECT + INSERT) | `is_full_member(...)` | 0048 | scopé **exclu** du canal (ni signal, ni présence) |
| 12 tables métier + `candidats` | `has_entite_access/write` sur l'entité de la ligne (résolveurs SECURITY DEFINER) | 0030 / 0034 / 0037 / 0042 | par-SCI |
| `espace_config` | SELECT `is_full_member` + RPC `espace_config_scoped` filtrée serveur | 0043 / 0044 | par-SCI |
| `espace_config_private`, `audit_log` SELECT, `invitations` | `is_full_member` / `is_full_manager` | 0035 / 0047 / 0032 | membres pleins seulement |
| `entite_membre` SELECT | `is_full_manager OR user_id = auth.uid()` | 0029 | un scopé ne voit que ses octrois |
| **`espace_members` SELECT** | **`is_member(espace_id)`** | 0003 | **FUITE** : un scopé lit toute la liste (user_id, rôle, `full_espace`, `invite_email`) |

Toutes les fonctions d'autorisation (`is_member`, `is_full_member`, `is_full_manager`, `has_entite_access`, `has_entite_write`, `entite_of_*`, `espace_config_scoped`) sont `SECURITY DEFINER` avec `search_path=''` (vérifié `pg_proc.proconfig`). `safe_uuid` n'est pas DEFINER (inutile : pure fonction de parsing, `search_path=''`).

**Realtime — ce qui transite** : le broadcast `changed` a un payload vide (`supabase-entry.js` l. 1049) ; le récepteur déclenche `_repullSoon()` (l. 1317) qui rejoue `fetchTable` sous RLS. Aucune donnée métier ne passe par Realtime. L'isolation dépend donc uniquement des RLS des tables re-pull, toutes par-SCI (tableau ci-dessus, prouvé §4). Le client ne s'abonne qu'au canal de l'espace propre (`esp.espaceId`, espace « mine » d'abord) → aucun `CHANNEL_ERROR` pour un scopé sur un espace tiers ; il est rafraîchi au retour de focus (`REPULL_STALE_MS`).

**Storage — convention de chemin** (client `__immoCloudUpload` + `__immoEntiteUuid`, `supabase-entry.js` l. 372-418 ; `index.html` l. 7116-7156 et 8337) : `<espace_id>/<entite_id>/files/<clé>` pour un fichier rattaché à une SCI ; `<espace_id>/_orphelin/files/<clé>` si la SCI n'est pas résolue ; `<espace_id>/files/<clé>` = legacy d'avant 0031. Le 2e segment est parsé par `safe_uuid` → NULL pour `files` / `_orphelin` → visible des membres pleins seulement (fail-closed pour un scopé). **Le chemin encode déjà la SCI : aucune décision d'architecture n'était à prendre.**

Inventaire prod (service-role, comptage seul) : 6 espaces · 8 membres dont **1 scopé actif** (1 `entite_membre`) · Storage : **275 fichiers par-SCI · 53 legacy · 10 orphelins · 0 autre**.

## 3. Livré

1. **Migration `0050_espace_members_select_scope.sql`** (idempotente) : `members_select` = `is_full_member(espace_id) OR user_id = (select auth.uid())`. Membre plein inchangé ; scopé ne lit que sa ligne (suffisant pour `resolveEspaces` au boot, `supabase-boot.js` l. 151). Écritures inchangées (owner). Aucun helper impacté (tous DEFINER).
2. **`supabase/tests/sim/0050-espace-members-scope.sim.mjs`** : simulation SQL en une transaction (`set local role authenticated` + `request.jwt.claims`), **ROLLBACK systématique**, exécutable avant et après déploiement.
3. **`supabase/tests/p1-partage-isolation-scope.test.mjs`** : suite Vitest à trois utilisateurs réels sur le projet hébergé (Alice plein · Bob scopé lecture SCI-A · Carol scopée gestionnaire SCI-A).
4. **`scripts/db-run.mjs`** : runner pg versionné (mode `migrate` = applique + enregistre la version dans `supabase_migrations.schema_migrations`), remplaçant le script de scratchpad utilisé pour 0038→0049.
5. Aucune ligne du monolithe ni des modules `js/` modifiée → pas de bump de version (précédent : commits de traçabilité 0048/0049).

## 4. Preuve d'isolation

### 4.1 Simulation SQL 0050 (rollback) — exécutée le 2026-09-17 sur la base hébergée
```
AVANT : members_select USING = is_member(espace_id)
  --  Bob (scopé) voit TOUTE la liste (3 lignes) = fuite documentée, 0050 pas encore appliquée
APRÈS 0050 : members_select USING = (is_full_member(espace_id) OR (user_id = ( SELECT auth.uid() AS uid)))
  OK  Bob (scopé) ne voit QUE sa ligne
  OK  Bob ne voit PAS l'email de Carol
  OK  Carol (scopée) ne voit QUE sa ligne
  OK  Alice (owner PLEIN) voit toujours les 3 membres (non-régression)
  OK  Un lecteur PLEIN (full_espace=true, lecture_seule) voit les 4 membres
  OK  Bob (scopé) ne voit toujours que sa ligne après ajout du 4e membre
ROLLBACK — espace de simulation persisté ? non (0 ligne)
SIM 0050 OK
```

### 4.2 Suite Vitest deux-utilisateurs — 2026-09-17, base hébergée, **avant** déploiement de 0050 : 30 passés / 2 échoués attendus
| Bloc | Assertions | Résultat |
|---|---|---|
| RE-PULL via `createSupabaseAdapter.fetchTable` (12 tables) + `baux_evenements` direct + `fetchConfig` RPC | Bob reçoit SCI-A, jamais SCI-B ; Alice reçoit les deux ; config filtrée | ✅ 14/14 |
| STORAGE `list(<espace>)` | Bob ne voit que le dossier SCI-A (ni SCI-B, ni `files/`, ni `_orphelin/`) ; Alice voit les 4 | ✅ |
| STORAGE `list(<espace>/<SCI-B>/files)` | vide pour Bob, non vide pour Alice | ✅ |
| STORAGE `createSignedUrl` | SCI-B refusé à Bob ; SCI-A accordé **et** téléchargé (HTTP 200, contenu identique) | ✅ |
| STORAGE `download` legacy + orphelin | refusés à Bob, accordés à Alice | ✅ |
| STORAGE `remove` / `move` / `copy` SCI-B par Carol | rien supprimé / déplacé / copié, fichier intact (vérifié service-role) | ✅ |
| STORAGE upload par URL signée vers SCI-B par Carol | refusé, rien n'atterrit | ✅ |
| STORAGE `remove` SCI-A par Carol | fonctionne (non-régression écriture octroyée) | ✅ |
| REALTIME `espace:<A>` | Alice SUBSCRIBED · Bob DENIED · Carol DENIED · Bob SUBSCRIBED sur son espace propre | ✅ 4/4 |
| `espace_members` | Bob / Carol ne voient que leur ligne | ❌ **3 lignes vues = fuite confirmée avec de vrais utilisateurs** (passe après 0050) |
| `espace_members` | Alice voit les 3 · Bob retrouve ses 2 espaces au boot | ✅ |

Suite unitaire `npx vitest run` : 4053 passés, 1 fichier en échec **préexistant sur origin/main** (`__tests__/helpers/biens-surfaces.test.js`, `TypeError: Failed to fetch` — dépend du réseau, sans lien avec ce chantier).

## 5. Déploiement (process réel)

- Le suivi CLI (`npx supabase migration list --db-url …`) ne connaît en **remote** que 0001→0037 (sans 0033). Les migrations 0033 et 0038→0049 ont été appliquées directement par un runner pg (`db-run.mjs`, scratchpad d'une session précédente, commits `1787ac2` / `812c7bf` « déjà appliquée en prod DB via db-run.mjs ») **sans** enregistrement dans `schema_migrations`. → **`supabase db push` est interdit** en l'état (il rejouerait des `create table` non idempotents).
- Procédure pour 0050, depuis `Desktop\Immo` (là où vit `.env`), après **GO Didier** :
  ```bash
  node scripts/db-run.mjs migrate supabase/migrations/0050_espace_members_select_scope.sql
  ```
  puis preuve : `node supabase/tests/sim/0050-espace-members-scope.sim.mjs` (doit dire « 0050 déjà appliquée ») et `npm run test:rls` (suite complète, non-régression `rls-isolation` / `p1-invitations` / `p1-partage-sci`).
- Réalignement optionnel du suivi CLI (hors périmètre, à faire une fois) : `npx supabase migration repair --status applied 0033 0038 0039 0040 0041 0042 0043 0044 0046 0047 0048 0049 --db-url …`.

## 6. Reste / hors périmètre (documenté, non fait)

1. **Fichiers legacy** : 53 `<espace>/files/…` + 10 `_orphelin` en prod restent invisibles d'un scopé (fail-closed voulu). Avant d'ouvrir une SCI dont les PDF/photos datent d'avant 0031, il faut les re-ranger sous `<espace>/<entite_id>/files/` (rename `storage.objects.name` + mise à jour des clés stockées dans les blobs DB). Chantier de données séparé.
2. `espaces` SELECT `is_member` : un scopé lit le nom de l'espace (nécessaire) mais aussi les colonnes abonnement (`plan_id`, `subscription_status`, `stripe_customer_id`…). Pas une donnée de SCI ; à restreindre par colonnes si l'on ouvre le partage à des tiers non familiers.
3. `audit_log` INSERT `is_member` : un scopé peut insérer une ligne d'audit (append-only, `user_id` forcé par trigger, lecture réservée aux pleins). Pollution possible, pas de fuite.
4. Le commentaire « GAP SÉCURITÉ CONNU » de 0030 l. 34-41 est périmé ; on ne réécrit pas une migration appliquée — l'en-tête de 0050 et ce rapport font foi.
5. Smoke utilisateur (3 formats) + parcours partage réel Didier ↔ membre scopé après déploiement.
