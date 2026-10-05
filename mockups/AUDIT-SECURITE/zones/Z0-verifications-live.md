# Z0 — Vérifications live (Supabase prod `xcbtashflclswyiyvfgn`, SELECT uniquement, 2026-10-05)

Requêtes passées par le MCP Supabase en lecture seule (catalogues `pg_class`, `pg_proc`, `pg_policies`, `information_schema.triggers`, `storage.buckets`, `pg_publication_tables`, advisors). Aucune donnée métier lue ; `auth.users` lu en agrégats (comptes, dates) uniquement.

## Registre des migrations ≠ dépôt
`supabase_migrations` en prod : 0001→0032, 0034→0037, 0050→0055. **Absentes du registre : 0033, 0038→0049** (appliquées « à la main » d'après les commits « Traçabilité : … déjà appliquée en prod DB »). Les objets correspondants existent bien (audit_log + trigger `audit_log_stamp`, FORCE sur `beta_allowlist`/`app_admins`, policies realtime « membre plein », `hook_restrict_signup`, `beta_mark_registered`). → Risque de dérive : un `supabase db push` / reset rejouerait ou sauterait ces migrations. 🟡

## Tables (23, schéma public)
- Toutes `ENABLE` + `FORCE` RLS, toutes avec ≥1 policy. Aucune vue / vue matérialisée.
- **`anon` a les privilèges de table SELECT/INSERT (et par défaut UPDATE/DELETE) sur TOUTES les tables** (grants Supabase par défaut). La RLS (policies `TO authenticated`) est la seule barrière. Exceptions : `beta_allowlist_admin_all` et `app_admins_self_read` sont `TO public` (donc évaluées pour anon : `is_app_admin()` / `user_id = auth.uid()` → faux pour anon). Pas de fuite constatée, mais aucune défense en profondeur (REVOKE anon).

## Fonctions
- Toutes ont `search_path` figé (`''`, sauf `rls_auto_enable` = `pg_catalog`, fonction d'event trigger fournie par Supabase, non appelable en RPC).
- **Exécutables par `anon`** (confirmé live, `has_function_privilege`) : `accept_invitation`, `invitation_preview`, `create_espace`, `is_member`, `has_role`, `is_full_member`, `is_full_manager`, `has_entite_access`, `has_entite_write`, `espace_plan`, `espace_has_feature`, `is_app_admin`, `safe_uuid` + fonctions trigger (non appelables en RPC). **Contredit le rapport du 09/09** (« anon revoke-é partout », « espace_plan anon révoqué 0022 »).
- `purge_espace` : ni anon ni authenticated (service_role seul) ✅. `hook_restrict_signup` : ni anon ni authenticated ✅. `purge_mon_espace`, `espace_config_scoped`, `entite_of_*`, `*_accessible`, `has_entite_*_all` : authenticated seul ✅.
- Advisor Supabase : 16 × « anon peut exécuter une fonction SECURITY DEFINER », 24 × idem authenticated, 1 × **protection mots de passe fuités (HaveIBeenPwned) désactivée**.

## Policies clés (état prod)
- `espace_members` : INSERT/UPDATE/DELETE = `has_role(espace_id, owner)` ; UPDATE USING exclut sa propre ligne, WITH CHECK non ; SELECT = `is_full_member OR user_id = auth.uid()`. Trigger `members_freeze_identity` ne gèle que `espace_id` et `user_id` (pas `role`/`full_espace`). `protect_last_owner` BEFORE UPDATE/DELETE.
- `espaces` : SELECT `is_member(id)` ; UPDATE `has_role(id, owner|gestionnaire)` (USING = WITH CHECK, sans restriction de colonnes, **aucun trigger de gel** hormis `touch_row`) ; DELETE owner ; pas d'INSERT.
- `espace_config` : SELECT `is_full_member` ; INSERT/UPDATE/DELETE `has_role(owner|gestionnaire)` (**ignore `full_espace`**).
- `espace_config_private` : SELECT `is_full_member`, écriture `is_full_manager` ✅.
- `audit_log` : INSERT `is_member` ; SELECT `is_full_member` ; trigger BEFORE INSERT `audit_log_stamp` force `user_id := auth.uid()` et `ts := now()` ✅ (F19.2 corrigé côté serveur).
- `invitations` : toutes commandes `is_full_manager` ; INSERT exige `created_by = auth.uid()` ; triggers `invitations_validate_grants`, `invitation_to_allowlist` (AFTER INSERT → ajoute l'email invité à `beta_allowlist`).
- `baux` : `has_entite_*_all(espace_id, entite_id, logement_id, NULL)` ; triggers `prevent_locked_mutation` BEFORE UPDATE/DELETE (pas INSERT), `freeze_espace_id`.
- `accept_invitation` (prod) : compare `invite_email` à l'email du **compte** (`auth.users`), force `role='lecture_seule'`, `full_espace=false` y compris en ON CONFLICT → **INV-1 corrigé**. Usage unique (status accepted), expiration, révocation.

## Storage / Realtime
- Bucket `espace-files` privé, **`file_size_limit` NULL, `allowed_mime_types` NULL**.
- `storage.objects` : 4 policies « par entité » (0031) ✅ (STO-1 OK).
- `realtime.messages` : 2 policies « membre plein » (SELECT, INSERT) ✅ (RT-1 corrigé). Aucune table métier dans la publication `supabase_realtime` (postgres_changes non utilisé).

## Auth
- 6 comptes ; 0 non confirmé ; 0 anonyme ; dernier créé le 2026-08-27. 1 compte hors `beta_allowlist`, créé le 2026-06-12, **avant** la création de l'allowlist (2026-07-03) → n'indique pas un contournement. **L'activation du hook `before_user_created` n'est pas lisible en SQL** (réglage Auth du dashboard) → reste à confirmer par Didier (Auth → Hooks) ou par un essai d'inscription d'un email non allowlisté.
- `email_confirmed_at` renseigné pour tous : compatible avec `enable_confirmations=false` (Supabase auto-confirme) — le réglage prod n'est pas lisible en SQL.
