# Partage par SCI — isolation Storage + Realtime + membres (levée du verrou 0030)

**Date** : 2026-09-17 · **Chantier sécurité** (V1 Light, préalable « blindage Partage SCI »)
**Base build** : worktree `Immo-wt-partage-secu`, branche `feat/partage-isolation-sci` depuis `origin/main` (`7088789`, v15.633).
**Rapport détaillé** : `docs/subjects/PARTAGE-ISOLATION-SCI.md`.

## 1. Constat (vérifié en prod, pas supposé)

L'en-tête de la migration 0030 (l. 34-41) documente un trou : Storage (0024) et Realtime (0025) filtrés au niveau ESPACE → un membre scopé lit les fichiers de toutes les SCIs. Ce commentaire est **périmé** : lecture directe de `pg_policies` sur la base hébergée (2026-09-17) :

| Surface | Policy en prod | Migration | Verdict |
|---|---|---|---|
| Storage `espace-files` | `has_entite_access/has_entite_write(seg1=espace, seg2=entité)` | 0031 | Par-SCI ✅ |
| Realtime `espace:<id>` | `is_full_member(...)` SELECT + INSERT | 0048 | Scopé exclu ✅ (payload `changed` vide, donnée par re-pull RLS) |
| Tables métier (13) + candidats + config | `has_entite_access/write` par ligne, RPC `espace_config_scoped` | 0030/0034/0037/0042/0043 | Par-SCI ✅ |
| `espace_members` SELECT | `is_member(espace_id)` | 0003 | **FUITE** : un scopé lit toute la liste (user_id, rôle, `invite_email`) ❌ |

Le chemin Storage encode déjà la SCI (`<espace>/<entite_id>/files/<clé>`, client `__immoCloudUpload` + `__immoEntiteUuid`). **Aucune décision d'architecture n'est nécessaire.**

## 2. Décision

- **Migration 0050** : `members_select` = `is_full_member(espace_id) OR user_id = auth.uid()`. Membre plein inchangé ; scopé ne voit que sa ligne (suffit au boot `resolveEspaces`). Idempotente.
- **Realtime** : design conservé (scopé hors canal, poll au focus). Pas de canal par-SCI : le broadcast ne porte aucune donnée, l'isolation repose sur les RLS des tables, prouvées.
- **Storage** : 0031 conservé. Fichiers legacy `<espace>/files/` (53 en prod) et `_orphelin` (10) restent membres-pleins-only (fail-closed). Le re-rangement sous leur SCI est un **chantier de données séparé**, préalable à l'ouverture d'une SCI dont les fichiers datent d'avant 0031.
- **Zéro modification du monolithe** (`index.html` intouché → pas de bump de version, précédent `812c7bf`).

## 3. Preuve d'isolation (deux utilisateurs réels)

1. `supabase/tests/sim/0050-espace-members-scope.sim.mjs` : transaction pg avec ROLLBACK ; mesure avant (fuite : 3 lignes vues par Bob), applique 0050, mesure après (1 ligne), Alice + lecteur plein voient tout. Zéro effet sur la base.
2. `supabase/tests/p1-partage-isolation-scope.test.mjs` (Vitest, projet hébergé) : Alice plein / Bob scopé lecture SCI-A / Carol scopée gestionnaire SCI-A. Re-pull des 13 tables via le **vrai** `createSupabaseAdapter.fetchTable` (aucune ligne SCI-B pour Bob) · `fetchConfig` filtré · Storage `list` racine (Bob ne voit que le dossier SCI-A), `list` SCI-B vide, `createSignedUrl` SCI-B refusé / SCI-A téléchargeable, legacy + orphelin refusés, `remove`/`move`/`copy`/upload signé vers SCI-B refusés (fichier intact) · Realtime : Bob/Carol DENIED sur `espace:<A>`, Alice SUBSCRIBED, Bob SUBSCRIBED sur son propre espace · `espace_members` (0050).

## 4. Déploiement (process réel, documenté)

Depuis 0038 les migrations sont appliquées par un runner pg (ex-`db-run.mjs` de scratchpad) **sans** enregistrement dans `supabase_migrations.schema_migrations` (remote connu : 0001→0037 sauf 0033). `supabase db push` rejouerait 0033 + 0038→0049 → **ne pas l'utiliser**. Versionné ici : `scripts/db-run.mjs` (`migrate` = applique + enregistre la version). GO Didier requis avant `node scripts/db-run.mjs migrate supabase/migrations/0050_espace_members_select_scope.sql`, puis re-run de la suite Vitest.

## 5. Hors périmètre (documenté, pas fait)

- Re-rangement des 53 fichiers legacy + 10 orphelins sous leur SCI.
- `espaces` SELECT `is_member` : un scopé voit le nom de l'espace + colonnes abonnement (plan). Pas une donnée de SCI ; à traiter par colonnes si besoin.
- `audit_log` INSERT `is_member` : un scopé peut insérer une ligne d'audit (append-only, user_id forcé par trigger, lecture réservée aux pleins). Pollution possible, pas de fuite.
- Réalignement du suivi CLI (`supabase migration repair --status applied 0033 0038 … 0049`).

## 6. Addendum 2026-09-18 — après les deux audits adversariaux

Le §1 ci-dessus classait `espace_config` et les tables métier « par-SCI ✅ ». Les audits ont montré que c'était faux sur deux points, reproduits depuis :

- **Config** : la RPC `espace_config_scoped` filtrait 8 clés et renvoyait le reste (denylist). → migration **0051** (allowlist : objet neuf, 7 clés par-SCI filtrées, rien d'autre pour un scopé).
- **Écritures** : `coalesce(entite_id, entité du logement, …)` laissait une gestionnaire scopée rattacher une ligne à un logement/immeuble d'une autre SCI. → migration **0052** (`has_entite_write_all` : droit exigé sur chaque rattachement non NULL).
- **Durcissements** : variante de casse des refs, résolveurs-oracles (+ `anon`), octroi survivant à la révocation, invitations au porteur éternelles. → migration **0053**.

Décision inchangée sur Storage et Realtime (déjà étanches, confirmé par les deux audits). Reste hors périmètre, à traiter en lot client dédié : la cohérence `legacy_raw` ↔ colonnes à l'hydrate (préalable à un octroi « écriture » pour un tiers non de confiance). Détail et preuves : `docs/subjects/PARTAGE-ISOLATION-SCI.md`.
