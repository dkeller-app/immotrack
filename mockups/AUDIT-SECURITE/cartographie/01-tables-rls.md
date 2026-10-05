# 01 - Cartographie tables / RLS / helpers / triggers (etat final apres migration 0055)

Source : `supabase/migrations/0001..0055*.sql` (54 fichiers ; **0045 n'existe pas**, la numerotation saute de 0044 a 0046). Toutes lues dans l'ordre.
Convention de references : `NNNN:L` = fichier de migration `NNNN_*.sql`, ligne L (numerotation du fichier). Cartographie factuelle, aucun jugement.

Notation : `W` = `array['owner','gestionnaire']::public.espace_role[]`. `authenticated` = `TO authenticated`.
Les migrations ne contiennent AUCUN `GRANT ... ON TABLE`, `ALTER DEFAULT PRIVILEGES`, `CREATE VIEW`, `CREATE SEQUENCE`, `CREATE SCHEMA`, ni `ALTER PUBLICATION`. Les privileges de table de `anon`/`authenticated` sont donc ceux des defaults Supabase (non visibles dans les migrations), sauf `0047:79`.

---------------------------------------------------------------------------------------------------

## 1. Tableau des tables

23 tables `public` (+ politiques sur `storage.objects` et `realtime.messages`, tables des schemas Supabase). Aucun schema `private`.

| # | Table | Creee en | Colonne(s) d'isolation | ENABLE RLS | FORCE RLS | GRANT/REVOKE notables sur la table |
|---|---|---|---|---|---|---|
| 1 | `espaces` | 0001:7 | `id` (= espace) | oui, 0003:4 | oui, 0003:5 | aucun |
| 2 | `espace_members` | 0001:23 | `espace_id` (+ `user_id`, `full_espace` ajoute 0029:110-111) | oui, 0003:6 | oui, 0003:7 | aucun |
| 3 | `entites` | 0008:12 | `espace_id`, `id` (entite = ligne elle-meme) | oui, 0008:79 (boucle) | oui, 0008:80 | aucun |
| 4 | `immeubles` | 0008:47 | `espace_id`, `entite_id` | oui, 0008:79 | oui, 0008:80 | aucun |
| 5 | `logements` | 0010:8 | `espace_id`, `entite_id`, `immeuble_id` | oui, 0010:92 | oui, 0010:93 | aucun |
| 6 | `documents` | 0010:59 | `espace_id` + polymorphe `(parent_type, parent_id)` (pas de FK) | oui, 0010:92 | oui, 0010:93 | aucun |
| 7 | `mouvements` | 0011:7 | `espace_id`, `entite_id`, `logement_id`, `immeuble_id` | oui, 0011:93 | oui, 0011:94 | aucun |
| 8 | `quittances` | 0011:51 | `espace_id`, `entite_id`, `logement_id` | oui, 0011:93 | oui, 0011:94 | aucun |
| 9 | `baux` | 0012:9 | `espace_id`, `entite_id`, `logement_id` | oui, 0012:94 | oui, 0012:95 | aucun |
| 10 | `baux_historique` | 0012:59 | `espace_id`, `entite_id`, `logement_id` | oui, 0012:94 | oui, 0012:95 | aucun |
| 11 | `edl` | 0013:7 | `espace_id`, `logement_id` | oui, 0013:50 | oui, 0013:51 | aucun |
| 12 | `baux_evenements` | 0017:6 | `espace_id`, `bail_id` | oui, 0017:40 | oui, 0017:41 | aucun |
| 13 | `plans` | 0018:7 | AUCUNE (catalogue global, pas d'espace_id) | oui, 0018:34 | oui, 0018:35 | aucun |
| 14 | `espace_config` | 0027:13 | `espace_id` (PK) | oui, 0027:33 | oui, 0027:34 | aucun |
| 15 | `assurances` | 0028:11 | `espace_id`, `logement_id` | oui, 0028:78 | oui, 0028:79 | aucun |
| 16 | `agenda` | 0028:37 | `espace_id`, `entite_id`, `immeuble_id`, `logement_id` | oui, 0028:78 | oui, 0028:79 | aucun |
| 17 | `entite_membre` | 0029:173 | `espace_id`, `entite_id`, `user_id` | oui, 0029:296 | oui, 0029:297 | aucun |
| 18 | `invitations` | 0032:21 | `espace_id` | oui, 0032:91 | oui, 0032:92 | aucun |
| 19 | `candidats` | 0034:17 | `espace_id`, `entite_id`, `logement_id` | oui, 0034:46 | oui, 0034:47 | aucun |
| 20 | `espace_config_private` | 0035:15 | `espace_id` (PK) | oui, 0035:31 | oui, 0035:32 | aucun |
| 21 | `beta_allowlist` | 0038:6 | AUCUNE (cle = `email`, table globale) | oui, 0038:30 | oui, **0049:13** (non force entre 0038 et 0049) | aucun |
| 22 | `app_admins` | 0038:17 | AUCUNE (cle = `user_id`, table globale) | oui, 0038:31 | oui, **0049:14** | aucun |
| 23 | `audit_log` | 0047:22 | `espace_id` | oui, 0047:62 | oui, 0047:63 | `revoke update, delete, truncate on public.audit_log from authenticated, anon` (0047:79) |

Autres objets portant des politiques (RLS geree par Supabase, pas par les migrations) :
- `storage.objects` : 4 politiques finales (0031), bucket `espace-files` (voir section 7). Commentaire 0024:27 : "storage.objects a deja la RLS activee par Supabase".
- `realtime.messages` : 2 politiques finales (0048) (section 6).
- `auth.users` : aucune politique, mais 1 trigger ajoute (0038:73).

Tables par colonne d'isolation :
- `espace_id` direct : toutes sauf `espaces` (`id`), `plans`, `beta_allowlist`, `app_admins`.
- Scope par entite (SCI) dans la politique : `entites`, `immeubles`, `logements`, `documents`, `mouvements`, `quittances`, `baux`, `baux_historique`, `edl`, `baux_evenements`, `assurances`, `agenda`, `candidats` (+ `storage.objects`).
- Scope par espace (membre / membre plein / manager) : `espaces`, `espace_members`, `espace_config`, `espace_config_private`, `entite_membre`, `invitations`, `audit_log`.

Colonnes de sante des plans/abonnement sur `espaces` (0019:5-13) : `plan_id`, `subscription_source`, `subscription_status`, `trial_ends_at`, `stripe_customer_id`, `comp_reason`, `comp_granted_by`, `comp_granted_at`.
Colonnes de retention (0021) ajoutees a `baux`, `edl`, `quittances`, `baux_historique` : `retention_class`, `legal_basis`, `retention_until`.
Colonnes de verrou : `baux` (0015:5-9 : `locked`, `content_hash`, `signature_source`, `amends_id`), `edl` (0016:5-8 : `locked`, `content_hash`, `signature_source`).
Colonne `legacy_raw jsonb` (0026:21) sur : entites, immeubles, logements, documents, mouvements, quittances, baux, baux_historique, edl ; puis `espace_config` (0027:16), `assurances`/`agenda` (0028), `candidats` (0034:23), `baux_evenements` (0054:21).

---------------------------------------------------------------------------------------------------

## 2. Politiques en vigueur par table (etat final)

Toutes sont `PERMISSIVE` (defaut) ; aucune politique `RESTRICTIVE` dans les migrations. Sauf mention, `TO authenticated`.

### 2.1 `espaces`
| Nom | Cmd | Roles | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|---|
| espaces_select | SELECT | authenticated | `public.is_member(id)` | - | 0003:10 |
| espaces_update | UPDATE | authenticated | `public.has_role(id, array['owner','gestionnaire']::public.espace_role[])` | idem | 0003:19 |
| espaces_delete | DELETE | authenticated | `public.has_role(id, array['owner']::public.espace_role[])` | - | 0003:24 |
Historique : `espaces_insert` (INSERT, `with check (created_by = (select auth.uid()))`) cree 0003:15, **droppee 0006:48** -> aucune politique INSERT ; creation uniquement via RPC `create_espace` (SECURITY DEFINER).

### 2.2 `espace_members`
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| members_select | SELECT | `public.is_full_member(espace_id) or user_id = (select auth.uid())` | - | **0050:28** (remplace `is_member(espace_id)` de 0003:29, drop 0050:26) |
| members_insert | INSERT | - | `public.has_role(espace_id, array['owner']::public.espace_role[])` | 0003:33 |
| members_update | UPDATE | `public.has_role(espace_id, array['owner']::public.espace_role[]) and user_id is distinct from (select auth.uid())` | `public.has_role(espace_id, array['owner']::public.espace_role[])` | 0003:38 |
| members_delete | DELETE | `public.has_role(espace_id, array['owner']::public.espace_role[]) and user_id is distinct from (select auth.uid())` | - | 0003:44 |

### 2.3 `entites`
Historique : 4 politiques uniformes (is_member / has_role W) creees 0008:81-87 ; **toutes droppees et recreees 0030:135-138 / 140-156**.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| entites_select | SELECT | `public.has_entite_access(espace_id, id)` | - | 0030:140 |
| entites_insert | INSERT | - | `public.is_full_manager(espace_id)` | 0030:146 |
| entites_update | UPDATE | `public.has_entite_write(espace_id, id)` | `public.has_entite_write(espace_id, id)` | 0030:149 |
| entites_delete | DELETE | `public.is_full_manager(espace_id)` | - | 0030:154 |

### 2.4 `immeubles`
Historique : 0008:81-87 (uniformes) -> remplacees 0030:159-162 / 164-176.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| immeubles_select | SELECT | `public.has_entite_access(espace_id, entite_id)` | - | 0030:164 |
| immeubles_insert | INSERT | - | `public.has_entite_write(espace_id, entite_id)` | 0030:167 |
| immeubles_update | UPDATE | `public.has_entite_write(espace_id, entite_id)` | idem | 0030:170 |
| immeubles_delete | DELETE | `public.has_entite_write(espace_id, entite_id)` | - | 0030:174 |

### 2.5 `logements`
Historique : 0010:96-103 (uniformes) -> 0030:179-196 (has_entite_*) -> **0052:123-135 (_all)**.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| logements_select | SELECT | `public.has_entite_access_all(espace_id, entite_id, null, immeuble_id)` | - | 0052:124 |
| logements_insert | INSERT | - | `public.has_entite_write_all(espace_id, entite_id, null, immeuble_id)` | 0052:129 |
| logements_update | UPDATE | `public.has_entite_write_all(espace_id, entite_id, null, immeuble_id)` | idem | 0052:131 |
| logements_delete | DELETE | `public.has_entite_write_all(espace_id, entite_id, null, immeuble_id)` | - | 0052:134 |

### 2.6 `documents`
Historique : 0010:96-103 (uniformes) -> 0030:375-392.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| documents_select | SELECT | `public.has_entite_access(espace_id, public.entite_of_document(espace_id, parent_type, parent_id))` | - | 0030:380 |
| documents_insert | INSERT | - | `public.has_entite_write(espace_id, public.entite_of_document(espace_id, parent_type, parent_id))` | 0030:383 |
| documents_update | UPDATE | `has_entite_write(espace_id, entite_of_document(espace_id, parent_type, parent_id))` | idem | 0030:386 |
| documents_delete | DELETE | `has_entite_write(espace_id, entite_of_document(espace_id, parent_type, parent_id))` | - | 0030:390 |
Contrainte `documents_parent_type_check` : 0010:69 -> 0026:27-30 -> **0040:26-32** (10 types : mouvement, immeuble, logement, entite, bail, assurance, mrh, equipement, quittance, candidat).

### 2.7 `mouvements`
Historique : 0011:97-104 -> 0030:279-296 (coalesce entite/logement) -> 0037:12-39 (+ immeuble) -> **0052:108-120 (_all)**.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| mouvements_select | SELECT | `public.has_entite_access_all(espace_id, entite_id, logement_id, immeuble_id)` | - | 0052:109 |
| mouvements_insert | INSERT | - | `public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id)` | 0052:114 |
| mouvements_update | UPDATE | `has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id)` | idem | 0052:116 |
| mouvements_delete | DELETE | `has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id)` | - | 0052:119 |

### 2.8 `quittances`, `baux`, `baux_historique`, `candidats` (memes expressions, cree en boucle `DO $pol$`, 0052:76-90)
Historique : quittances/baux/baux_historique : uniformes P0-B (0011:97 / 0012:98) -> 0030 (coalesce entite/logement) -> **0052:79-88**. candidats : cree 0034:49-61 (coalesce) -> **0052:79-88**.
Pour chaque `<t>` :
| Nom | Cmd | USING | WITH CHECK |
|---|---|---|---|
| `<t>_select` | SELECT | `public.has_entite_access_all(espace_id, entite_id, logement_id, null)` | - |
| `<t>_insert` | INSERT | - | `public.has_entite_write_all(espace_id, entite_id, logement_id, null)` |
| `<t>_update` | UPDATE | `public.has_entite_write_all(espace_id, entite_id, logement_id, null)` | idem |
| `<t>_delete` | DELETE | `public.has_entite_write_all(espace_id, entite_id, logement_id, null)` | - |
Def. finale : 0052:81 (select), 85 (insert), 86 (update), 87 (delete) ; boucle sur `['baux','baux_historique','quittances','candidats']` (0052:79).

### 2.9 `baux_evenements`
Historique : 0017:43-50 (uniformes) -> 0030:239-256. 0054 ne touche pas aux politiques.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| baux_evenements_select | SELECT | `public.has_entite_access(espace_id, public.entite_of_bail(espace_id, bail_id))` | - | 0030:244 |
| baux_evenements_insert | INSERT | - | `public.has_entite_write(espace_id, public.entite_of_bail(espace_id, bail_id))` | 0030:247 |
| baux_evenements_update | UPDATE | `has_entite_write(espace_id, entite_of_bail(espace_id, bail_id))` | idem | 0030:250 |
| baux_evenements_delete | DELETE | `has_entite_write(espace_id, entite_of_bail(espace_id, bail_id))` | - | 0030:254 |

### 2.10 `edl`
Historique : 0013:54-61 -> 0030:299-316.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| edl_select | SELECT | `public.has_entite_access(espace_id, public.entite_of_logement(espace_id, logement_id))` | - | 0030:304 |
| edl_insert | INSERT | - | `public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id))` | 0030:307 |
| edl_update | UPDATE | `has_entite_write(espace_id, entite_of_logement(espace_id, logement_id))` | idem | 0030:310 |
| edl_delete | DELETE | `has_entite_write(espace_id, entite_of_logement(espace_id, logement_id))` | - | 0030:314 |

### 2.11 `assurances`
Historique : 0028:81-88 -> 0030:319-336.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| assurances_select | SELECT | `public.has_entite_access(espace_id, public.entite_of_logement(espace_id, logement_id))` | - | 0030:324 |
| assurances_insert | INSERT | - | `public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id))` | 0030:327 |
| assurances_update | UPDATE | `has_entite_write(espace_id, entite_of_logement(espace_id, logement_id))` | idem | 0030:330 |
| assurances_delete | DELETE | `has_entite_write(espace_id, entite_of_logement(espace_id, logement_id))` | - | 0030:334 |

### 2.12 `agenda`
Historique : 0028:81-88 -> 0030:340-372 (coalesce entite/logement/immeuble) -> **0052:93-105 (_all)**.
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| agenda_select | SELECT | `public.has_entite_access_all(espace_id, entite_id, logement_id, immeuble_id)` | - | 0052:94 |
| agenda_insert | INSERT | - | `public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id)` | 0052:99 |
| agenda_update | UPDATE | `has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id)` | idem | 0052:101 |
| agenda_delete | DELETE | `has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id)` | - | 0052:104 |

### 2.13 `plans`
| Nom | Cmd | USING | WITH CHECK | Def. |
|---|---|---|---|---|
| plans_select | SELECT | `true` | - | 0018:38 |
Aucune politique INSERT/UPDATE/DELETE (0018:40-41, ecriture reservee service_role).

### 2.14 `espace_config`
| Nom | Cmd | USING | WITH CHECK | Def. finale |
|---|---|---|---|---|
| espace_config_select | SELECT | `public.is_full_member(espace_id)` | - | **0043:167** (remplace `is_member(espace_id)` de 0027:36, drop 0043:166) |
| espace_config_insert | INSERT | - | `public.has_role(espace_id, W)` | 0027:38 (boucle 0027:32) |
| espace_config_update | UPDATE | `public.has_role(espace_id, W)` | `public.has_role(espace_id, W)` | 0027:40 |
| espace_config_delete | DELETE | `public.has_role(espace_id, W)` | - | 0027:42 |
La lecture "scopee" passe par la RPC `espace_config_scoped` (0051:23).

### 2.15 `espace_config_private` (0035)
| Nom | Cmd | USING | WITH CHECK | Def. |
|---|---|---|---|---|
| ecp_select | SELECT | `public.is_full_member(espace_id)` | - | 0035:34 |
| ecp_insert | INSERT | - | `public.is_full_manager(espace_id)` | 0035:36 |
| ecp_update | UPDATE | `public.is_full_manager(espace_id)` | `public.is_full_manager(espace_id)` | 0035:38 |
| ecp_delete | DELETE | `public.is_full_manager(espace_id)` | - | 0035:40 |

### 2.16 `entite_membre` (0029)
| Nom | Cmd | USING | WITH CHECK | Def. |
|---|---|---|---|---|
| entite_membre_select | SELECT | `public.is_full_manager(espace_id) or user_id = (select auth.uid())` | - | 0029:301 |
| entite_membre_insert | INSERT | - | `public.is_full_manager(espace_id)` | 0029:308 |
| entite_membre_update | UPDATE | `public.is_full_manager(espace_id)` | `public.is_full_manager(espace_id)` | 0029:313 |
| entite_membre_delete | DELETE | `public.is_full_manager(espace_id)` | - | 0029:317 |

### 2.17 `invitations` (0032) - noms entre guillemets
| Nom | Cmd | USING | WITH CHECK | Def. |
|---|---|---|---|---|
| "invitations: select manager" | SELECT | `public.is_full_manager(espace_id)` | - | 0032:94 |
| "invitations: insert manager" | INSERT | - | `public.is_full_manager(espace_id) and created_by = (select auth.uid())` | 0032:96 |
| "invitations: update manager" | UPDATE | `public.is_full_manager(espace_id)` | `public.is_full_manager(espace_id)` | 0032:98 |
| "invitations: delete manager" | DELETE | `public.is_full_manager(espace_id)` | - | 0032:101 |

### 2.18 `beta_allowlist` (0038) - **politique SANS clause TO** (donc role PUBLIC)
| Nom | Cmd | Roles | USING | WITH CHECK | Def. |
|---|---|---|---|---|---|
| beta_allowlist_admin_all | ALL | (aucun TO = public) | `public.is_app_admin()` | `public.is_app_admin()` | 0038:34-35 |

### 2.19 `app_admins` (0038) - **politique SANS clause TO**
| Nom | Cmd | Roles | USING | WITH CHECK | Def. |
|---|---|---|---|---|---|
| app_admins_self_read | SELECT | (aucun TO = public) | `user_id = auth.uid()` (non enveloppe dans `(select ...)`) | - | 0038:38-39 |
Aucune politique d'ecriture (0038:37 "ecriture = service_role only").

### 2.20 `audit_log` (0047)
| Nom | Cmd | USING | WITH CHECK | Def. |
|---|---|---|---|---|
| audit_log_select | SELECT | `public.is_full_member(espace_id)` | - | 0047:66 |
| audit_log_insert | INSERT | - | `public.is_member(espace_id)` | 0047:72 |
Aucune politique UPDATE/DELETE (0047:76) + `revoke update, delete, truncate ... from authenticated, anon` (0047:79).

### 2.21 `storage.objects` -> section 7 ; `realtime.messages` -> section 6.

Couverture des commandes (final) :
- CRUD complet : espace_members, entites, immeubles, logements, documents, mouvements, quittances, baux, baux_historique, edl, baux_evenements, espace_config, assurances, agenda, entite_membre, invitations, candidats, espace_config_private.
- Sans INSERT : `espaces`. SELECT seul : `plans`, `app_admins`. SELECT+INSERT : `audit_log`. ALL (public) : `beta_allowlist`.

---------------------------------------------------------------------------------------------------

## 3. Helpers utilises dans les politiques et triggers (definitions FINALES)

Colonnes : signature | SECURITY | search_path | volatilite | def. finale | corps.

### 3.1 Helpers d'appartenance
| Fonction | Sec. | search_path | Volat. | Def. finale | Corps (resume) |
|---|---|---|---|---|---|
| `is_member(p_espace_id uuid) returns boolean` (sql) | DEFINER | `''` | STABLE | 0002:6 | `exists` ligne `espace_members` avec `user_id = (select auth.uid())`, `invite_status='active'` pour l'espace. Ignore `full_espace`. |
| `has_role(p_espace_id uuid, p_roles espace_role[])` (sql) | DEFINER | `''` | STABLE | 0002:24 | idem + `m.role = any(p_roles)`. Ignore `full_espace`. |
| `is_full_member(p_espace_id uuid)` (sql) | DEFINER | `''` | STABLE | 0029:123 | `exists` membre actif avec `full_espace = true`. |
| `is_full_manager(p_espace_id uuid)` (sql) | DEFINER | `''` | STABLE | 0029:144 | membre actif, `full_espace = true`, `role in ('owner','gestionnaire')`. |
| `has_entite_access(p_espace_id uuid, p_entite_id uuid)` (sql) | DEFINER | `''` | STABLE | **0053:45** (orig. 0029:243) | `is_full_member(espace)` OU (`p_entite_id` non null ET `is_member(espace)` ET ligne `entite_membre` (espace, entite, `auth.uid()`), tout role). |
| `has_entite_write(p_espace_id uuid, p_entite_id uuid)` (sql) | DEFINER | `''` | STABLE | **0053:66** (orig. 0029:269) | `is_full_manager(espace)` OU (entite non null ET `is_member` ET `entite_membre.role='gestionnaire'`). |
| `has_entite_access_all(p_espace_id, p_entite_id, p_logement_id, p_immeuble_id)` (sql) | **INVOKER** | `''` | STABLE | 0052:56 | `is_full_member` OU (au moins un rattachement non null ET `has_entite_access` sur CHAQUE rattachement non null, via `entite_of_logement`/`entite_of_immeuble`). |
| `has_entite_write_all(p_espace_id, p_entite_id, p_logement_id, p_immeuble_id)` (sql) | **INVOKER** | `''` | STABLE | 0052:37 | `is_full_manager` OU (au moins un rattachement ET `has_entite_write` sur chaque rattachement non null). |
| `is_app_admin()` (sql) | DEFINER | `''` | STABLE | 0038:23 | `exists (select 1 from public.app_admins where user_id = auth.uid())` (non enveloppe). |
| `safe_uuid(p text) returns uuid` (plpgsql) | INVOKER | `''` | IMMUTABLE | 0024:7 | `p::uuid`, `exception when others then null`. |

### 3.2 Resolveurs d'entite (tous sql, DEFINER, `search_path=''`, STABLE ; versions finales en 0053 : l'entite n'est renvoyee que si l'appelant y a acces via `has_entite_access`, sinon NULL)
| Fonction | Def. finale | Corps (resume) |
|---|---|---|
| `entite_of_logement(p_espace_id, p_logement_id)` | 0053:89 (orig. 0030:50) | `logements.entite_id` pour (id, espace) ET `has_entite_access(espace, l.entite_id)`. |
| `entite_of_immeuble(p_espace_id, p_immeuble_id)` | 0053:103 (orig. 0030:65) | idem sur `immeubles`. |
| `entite_of_bail(p_espace_id, p_bail_id)` | 0053:117 (orig. 0030:81) | `coalesce(b.entite_id, l.entite_id)` (left join logement) non null ET acces a l'entite du bail ET a celle du logement. |
| `entite_of_document(p_espace_id, p_parent_type text, p_parent_id)` | 0053:137 (0030:100 -> 0042:33 -> 0053) | `case parent_type` : entite (avec has_entite_access) ; immeuble/logement/bail via resolveurs ; mouvement = coalesce(entite_id, of_logement, of_immeuble) filtre par has_entite_access ; assurance/mrh/equipement/quittance/candidat -> `entite_of_logement(parent_id)` ; sinon NULL. |

### 3.3 Helpers de config scopee
| Fonction | Sec. | Def. finale | Corps (resume) |
|---|---|---|---|
| `ref_logement_accessible(p_espace_id, p_ref text) returns boolean` (sql, STABLE, `''`) | DEFINER | **0053:172** (0043:35) | Existe un logement de l'espace dont `lower(btrim(ref))` = ref ET acces entite, ET aucun logement de meme ref normalisee (blancs supprimes) sans acces. |
| `nom_immeuble_accessible(p_espace_id, p_nom text)` | DEFINER | **0053:192** (0043:54) | meme logique sur `immeubles.nom`. |
| `espace_config_scoped(p_espace_id uuid) returns jsonb` (plpgsql, STABLE, `''`) | DEFINER | **0051:23** (0043:73 -> 0044:20 -> 0051) | non-membre -> null ; pas de config -> `{}` ; membre plein -> blob integral `espace_config.data` ; scope -> objet neuf avec seulement irlHistorique, loyerBareme, assurances, compteursReleves, equipements, emailsSent, regulValidations filtres par accessibilite. |

### 3.4 RPC / fonctions metier
| Fonction | Sec. | search_path | Volat. | Def. finale | Corps (resume) | EXECUTE |
|---|---|---|---|---|---|---|
| `create_espace(p_nom text) returns public.espaces` (plpgsql) | DEFINER | `''` | VOLATILE | 0004:5 | exige `auth.uid()`; insere espace + `espace_members` (owner, active). | revoke public + grant authenticated (0004:33-34) ; anon non revoque explicitement |
| `accept_invitation(p_token text) returns uuid` (plpgsql) | DEFINER | `''` | VOLATILE | **0053:226** (0032:106) | `select ... where token = p_token for update` ; statut revoked/accepted/expire ; controle email du compte si `invite_email` ; refuse si deja membre plein ; Reactive (upsert) en `full_espace=false, role='lecture_seule'` ; purge `entite_membre` dormants ; cree `entite_membre` d'apres `grants` ; marque l'invitation acceptee. | revoke public + grant authenticated (0053:302-303) |
| `invitation_preview(p_token text) returns jsonb` (plpgsql) | DEFINER | `''` | VOLATILE | 0032:168 | renvoie nom espace + grants (avec nom d'entite) + statut + expired pour un token, ou null. | revoke public + grant authenticated (0032:197-198) ; anon non revoque (0053:212-214 commentaire : "reste tel quel, appele AVANT connexion") |
| `purge_espace(p_espace_id uuid) returns void` | DEFINER | `''` | VOLATILE | 0023:44 | pose GUC `app.bypass_immutable` et `app.bypass_owner_guard` en local, supprime `baux_evenements`, met `baux.amends_id = null`, `delete from espaces` (cascade). Pas de controle d'appelant. | `revoke ... from public, anon, authenticated` + `grant to service_role` (0023:73-74) |
| `purge_mon_espace(p_espace_id uuid, p_confirm_nom text) returns void` | DEFINER | `''` | VOLATILE | 0041:13 | exige `auth.uid()` owner actif (`espace_members.role='owner'`, sans test `full_espace`) ; nom exact de l'espace ; puis `perform purge_espace`. | `revoke ... from public, anon, authenticated` + `grant to authenticated` (0041:54-55) |
| `espace_plan(p_espace_id uuid) returns public.plans` (sql) | DEFINER | `''` | STABLE | 0020:12 | `plans.*` joint a `espaces.plan_id`. Pas de verif d'appartenance. | `revoke from anon` (0022:30) ; pas de `revoke from public` ni grant explicite |
| `espace_has_feature(p_espace_id uuid, p_feature text) returns boolean` | DEFINER | `''` | STABLE | 0022:16 (0020:26) | lit `espace_plan(...).features ->> p_feature` dans un set de valeurs vraies. Pas de verif d'appartenance. | `revoke from anon` (0022:31) |
| `hook_restrict_signup(event jsonb) returns jsonb` | DEFINER | `''` | STABLE | 0039:6 | lit `beta_allowlist` pour `event->'user'->>'email'`, renvoie erreur 403 si absent. | `grant to supabase_auth_admin`; `revoke from authenticated, anon, public` (0039:28-29) |

### 3.5 Fonctions de trigger
| Fonction | Sec. | search_path | Volat. | Def. finale | Corps (resume) |
|---|---|---|---|---|---|
| `touch_row()` | INVOKER | `''` | VOLATILE | 0006:34 (0005:2 sans search_path) | `new.updated_at := now(); new.version := old.version + 1`. |
| `protect_last_owner()` | DEFINER | `''` | VOLATILE | 0023:9 (0005:23) | refuse update/delete du dernier owner actif (`LAST_OWNER_PROTECTED`), sauf GUC `app.bypass_owner_guard='on'`. |
| `members_freeze_identity()` | INVOKER | `''` | VOLATILE | 0007:6 (0006:14) | refuse changement de `espace_id` / `user_id` sur `espace_members`. |
| `freeze_espace_id()` | INVOKER | `''` | VOLATILE | 0009:19 | refuse changement de `espace_id` (`ESPACE_ID_IMMUTABLE`). |
| `prevent_locked_mutation()` | INVOKER | `''` | VOLATILE | **0055:28** (0014:19) | bypass si GUC `app.bypass_immutable='on'` ; DELETE d'une ligne `locked` refuse ; UPDATE d'une ligne `locked` refuse sauf, pour `baux` uniquement, transition `archived false->true` avec toutes les autres colonnes identiques (hors archived/updated_at/version). |
| `entite_membre_freeze_identity()` | INVOKER | `''` | VOLATILE | 0029:207 | refuse changement de espace_id / entite_id / user_id. |
| `invitations_validate_grants()` | INVOKER | `''` | VOLATILE | 0032:43 | `grants` doit etre un tableau non vide ; `mode in ('ecriture','lecture')` ; `entite_id` uuid appartenant a l'espace de l'invitation. |
| `audit_log_stamp()` | INVOKER (explicite) | `''` | VOLATILE | 0047:44 | force `new.user_id := auth.uid(); new.ts := now()`. |
| `invitation_to_allowlist()` | DEFINER | `''` | VOLATILE | 0038:43 | si `new.invite_email` non vide : insere dans `beta_allowlist` (`on conflict (email) do nothing`) source `invitation`. |
| `beta_mark_registered()` | DEFINER | `''` | VOLATILE | 0038:64 | met `registered_at = now()` dans `beta_allowlist` pour l'email du nouvel `auth.users`. |

Aucune des fonctions de trigger n'a de `revoke`/`grant` explicite (hors celles listees plus haut).
Fonctions avec `GRANT EXECUTE TO authenticated` + `REVOKE ALL FROM PUBLIC` mais **sans `REVOKE ... FROM anon` dans les migrations** : `is_member` (0002:21-22), `has_role` (0002:40-41), `create_espace` (0004:33-34), `is_full_member` (0029:138-139), `is_full_manager` (0029:160-161), `has_entite_access` (0029:262-263, non repris en 0053), `has_entite_write` (0029:289-290), `accept_invitation` (0053:302-303), `invitation_preview` (0032:197-198).
`is_app_admin()` : `grant execute ... to authenticated` seulement (0038:27), pas de `revoke from public/anon`.
`safe_uuid` : aucun grant/revoke dans les migrations.
Fonctions avec `REVOKE ... FROM anon` : `espace_plan`, `espace_has_feature` (0022:30-31) ; `purge_espace`, `purge_mon_espace` ; `hook_restrict_signup` ; `entite_of_logement/immeuble/bail/document`, `ref_logement_accessible`, `nom_immeuble_accessible`, `espace_config_scoped` (0053:215-221) ; `has_entite_write_all`, `has_entite_access_all` (0052:138-139).
Note 0053:212 : `has_entite_access` / `has_entite_write` ne figurent pas dans la liste des revoke anon de 0053:215-221.

---------------------------------------------------------------------------------------------------

## 4. Triggers (etat final)

| Table | Trigger | Evenement | Fonction | Securite fonction | Fichier:ligne |
|---|---|---|---|---|---|
| espaces | trg_touch_espaces | BEFORE UPDATE FOR EACH ROW | touch_row | INVOKER | 0005:13 |
| espace_members | trg_touch_espace_members | BEFORE UPDATE | touch_row | INVOKER | 0005:17 |
| espace_members | trg_protect_last_owner | BEFORE UPDATE OR DELETE | protect_last_owner | DEFINER | 0005:52 |
| espace_members | trg_members_freeze_identity | BEFORE UPDATE | members_freeze_identity | INVOKER | 0006:29 |
| entites | trg_touch_entites | BEFORE UPDATE | touch_row | INVOKER | 0008:42 |
| entites | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0009:37 (boucle) |
| immeubles | trg_touch_immeubles | BEFORE UPDATE | touch_row | INVOKER | 0008:68 |
| immeubles | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0009:37 |
| logements | trg_touch_logements | BEFORE UPDATE | touch_row | INVOKER | 0010:54 |
| logements | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0010:95 |
| documents | trg_touch_documents | BEFORE UPDATE | touch_row | INVOKER | 0010:81 |
| documents | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0010:95 |
| mouvements | trg_touch_mouvements | BEFORE UPDATE | touch_row | INVOKER | 0011:46 |
| mouvements | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0011:96 |
| quittances | trg_touch_quittances | BEFORE UPDATE | touch_row | INVOKER | 0011:82 |
| quittances | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0011:96 |
| baux | trg_touch_baux | BEFORE UPDATE | touch_row | INVOKER | 0012:54 |
| baux | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0012:97 |
| baux | trg_prevent_locked_mutation | BEFORE UPDATE OR DELETE | prevent_locked_mutation (version 0055) | INVOKER | 0015:38 |
| baux_historique | trg_touch_baux_historique | BEFORE UPDATE | touch_row | INVOKER | 0012:83 |
| baux_historique | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0012:97 |
| edl | trg_touch_edl | BEFORE UPDATE | touch_row | INVOKER | 0013:39 |
| edl | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0013:53 |
| edl | trg_prevent_locked_mutation | BEFORE UPDATE OR DELETE | prevent_locked_mutation | INVOKER | 0016:22 |
| baux_evenements | trg_touch_baux_evenements | BEFORE UPDATE | touch_row | INVOKER | 0017:29 |
| baux_evenements | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0017:42 |
| plans | trg_touch_plans | BEFORE UPDATE | touch_row | INVOKER | 0018:22 |
| espace_config | trg_touch_espace_config | BEFORE UPDATE | touch_row | INVOKER | 0027:22 |
| espace_config | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0027:35 |
| assurances | trg_touch_assurances | BEFORE UPDATE | touch_row | INVOKER | 0028:33 |
| assurances | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0028:80 |
| agenda | trg_touch_agenda | BEFORE UPDATE | touch_row | INVOKER | 0028:68 |
| agenda | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0028:80 |
| entite_membre | trg_touch_entite_membre | BEFORE UPDATE | touch_row | INVOKER | 0029:195 |
| entite_membre | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0029:200 |
| entite_membre | trg_entite_membre_freeze_identity | BEFORE UPDATE | entite_membre_freeze_identity | INVOKER | 0029:226 |
| invitations | trg_invitations_validate_grants | BEFORE INSERT OR UPDATE | invitations_validate_grants | INVOKER | 0032:76 |
| invitations | trg_touch_invitations | BEFORE UPDATE | touch_row | INVOKER | 0032:80 |
| invitations | trg_freeze_espace_id_invitations | BEFORE UPDATE | freeze_espace_id | INVOKER | 0032:84 |
| invitations | trg_invitation_to_allowlist | AFTER INSERT | invitation_to_allowlist | DEFINER | 0038:57 |
| candidats | trg_touch_candidats | BEFORE UPDATE | touch_row | INVOKER | 0034:38 |
| candidats | trg_freeze_espace_id | BEFORE UPDATE | freeze_espace_id | INVOKER | 0034:41 |
| espace_config_private | trg_touch_espace_config_private | BEFORE UPDATE | touch_row | INVOKER | 0035:23 |
| espace_config_private | trg_freeze_espace_id_ecp | BEFORE UPDATE | freeze_espace_id | INVOKER | 0035:26 |
| audit_log | trg_audit_log_stamp | BEFORE INSERT | audit_log_stamp | INVOKER | 0047:57 |
| auth.users | trg_beta_mark_registered | AFTER INSERT | beta_mark_registered | DEFINER | 0038:73 |

Tables SANS aucun trigger : `beta_allowlist`, `app_admins`.
Tables sans trigger `freeze_espace_id` (ou equivalent) : `espaces` (pas d'espace_id), `plans`, `beta_allowlist`, `app_admins`, `audit_log` (aucun UPDATE possible) ; `espace_members` a `members_freeze_identity` a la place.
Ordre : le commentaire 0055:19-21 indique que `trg_prevent_locked_mutation` s'execute avant `trg_touch_baux` (ordre alphabetique des triggers). Les triggers `trg_freeze_espace_id` etc. s'executent aussi dans l'ordre alphabetique des noms.
Aucun trigger ne gele `created_by` / `created_at`, ni `espaces.plan_id` / `subscription_*` / `stripe_customer_id` / `comp_*`, ni `espace_members.full_espace` / `role`, ni `invitations.token` / `status`. Aucun trigger de quota (0018:2-3, 0019:2, 0020:3 : hook sans enforcement).
Gardes en dehors de triggers : CHECKs `baux_locked_provenance_chk` (0015:17), `baux_immotrack_hash_chk` (0015:25), `baux_signature_source_chk` (0015:12), `edl_*` equivalents (0016:10-20), `mouvements_qui_exclusif` (0011:37), `baux_amends_fk` ON DELETE RESTRICT (0015:32), `baux_evenements_bail_fk` ON DELETE RESTRICT (0017:22).
Echappatoires GUC (session) : `app.bypass_immutable` (0014:9 / lu 0055:34), `app.bypass_owner_guard` (0023:20) ; poses par `purge_espace` (0023:52-53).

---------------------------------------------------------------------------------------------------

## 5. Vues, tables sans RLS / sans politique, sequences, colonnes exposees

- **Vues** : aucune (`CREATE VIEW` absent des 54 migrations). **Vues materialisees** : aucune.
- **Sequences** : aucune (toutes les PK sont `uuid default gen_random_uuid()` ou `text`/`uuid` naturel ; `plans.id text`, `beta_allowlist.email text`, `espace_config.espace_id uuid`).
- **Schemas** : aucun schema `private` ni autre schema applicatif cree ; tout est dans `public` (+ `storage.buckets` insert, `storage.objects`/`realtime.messages` politiques, trigger sur `auth.users`).
- **Tables `public` SANS RLS** : aucune dans l'etat final (23/23 ENABLE).
- **Tables `public` SANS FORCE RLS** : aucune dans l'etat final (23/23 FORCE ; `beta_allowlist` et `app_admins` forcees seulement en 0049).
- **Tables SANS aucune politique** : aucune (toutes ont >= 1 politique). Tables avec politique(s) incompletes : voir couverture en section 2 (pas d'INSERT sur `espaces`, pas d'ecriture sur `plans` et `app_admins`, pas d'UPDATE/DELETE sur `audit_log`).
- **Fonctions `public` exposees via PostgREST RPC** (schema public, sans revoke anon dans les migrations) : voir fin de section 3.5.
- **Colonnes notables (factuel)** :
  - `invitations.token` (text unique, `default gen_random_uuid()::text`, 0032:24), lisible par les managers pleins via `invitations: select manager`.
  - `espaces.stripe_customer_id`, `plan_id`, `subscription_*`, `comp_*` (0019:5-13) : lisibles par tout membre actif (`espaces_select` = `is_member(id)`), modifiables par owner/gestionnaire via `espaces_update` (pas de restriction de colonne, pas de trigger).
  - `entites.iban`, `bic`, `signature`, `logo`, `email_envoi` (0008:23-27) ; `baux.signatures`, `locataires`, `garants` (0012) ; `edl.signatures` (0013:25) ; `legacy_raw` (jsonb verbatim) ; `candidats.legacy_raw` (garant embarque, 0034:9).
  - `espace_config.data` / `espace_config_private.data` (jsonb libres) ; secrets historiques scrubes en 0033 (`bailSignAppKey`...) et deplaces en 0036 (`auditTrail`, `candidatLinks`, `params.bankAccounts`, `params.userProfile`).
  - `audit_log.user_name`, `client_ts`, `diff`, `entity_id` (libres, fournis par le client ; `user_id` et `ts` forces par trigger).
  - `beta_allowlist.email` (liste des emails autorises), `app_admins.user_id`.
  - `espace_members.invite_email`, `full_espace`, `role` ; `entite_membre.role`.

---------------------------------------------------------------------------------------------------

## 6. Realtime

- **Publication `supabase_realtime`** : AUCUNE instruction `ALTER PUBLICATION`/`CREATE PUBLICATION` dans les migrations. Aucune table n'est donc ajoutee a la publication par les migrations (postgres_changes non configure ici ; ajout eventuel via dashboard non visible). Les commentaires 0048:9-12 indiquent un usage Broadcast `changed` (payload vide) et Presence sur un canal prive `espace:<espace_id>`.
- **Politiques `realtime.messages`** (etat final, 0048) :
  | Nom | Cmd | Roles | USING / WITH CHECK | Def. |
  |---|---|---|---|---|
  | "realtime: lecture canal espace membre plein" | SELECT | authenticated | USING `public.is_full_member( public.safe_uuid( split_part(realtime.topic(), ':', 2) ) )` | 0048:31-33 |
  | "realtime: diffusion canal espace membre plein" | INSERT | authenticated | WITH CHECK `public.is_full_member( public.safe_uuid( split_part(realtime.topic(), ':', 2) ) )` | 0048:35-37 |
  Historique : 0025:8-14 creait `"realtime: lecture canal espace membre"` et `"realtime: diffusion canal espace membre"` avec `public.is_member(...)` ; **droppees 0048:27-28**, remplacees par is_full_member. Pas de politique UPDATE/DELETE.
- Le topic doit avoir la forme `espace:<uuid>` ; tout topic dont le 2e segment n'est pas un uuid -> `safe_uuid` null -> `is_full_member(null)` (false).

---------------------------------------------------------------------------------------------------

## 7. Storage

- **Bucket** : `espace-files`, `public = false` (0024:21-23, `insert into storage.buckets (id, name, public) ... on conflict (id) do nothing`). Aucun `file_size_limit` ni `allowed_mime_types` renseigne dans les migrations. Aucun autre bucket cree.
- **Convention de chemin** (0031:9-14) : `<espace_id>/<entite_id>/files/<cle>` ; `<espace_id>/_orphelin/files/<cle>` ; legacy `<espace_id>/files/<cle>`. `safe_uuid(seg2)` -> NULL pour `files` / `_orphelin` / non-uuid.
- **Politiques finales sur `storage.objects`** (toutes `TO authenticated`, 0031) :
  | Nom | Cmd | USING | WITH CHECK | Def. |
  |---|---|---|---|---|
  | "espace-files: lecture par entité" | SELECT | `bucket_id = 'espace-files' and public.has_entite_access( public.safe_uuid(split_part(name,'/',1)), public.safe_uuid(split_part(name,'/',2)) )` | - | 0031:38-46 |
  | "espace-files: insert par entité" | INSERT | - | `bucket_id = 'espace-files' and public.has_entite_write( safe_uuid(split_part(name,'/',1)), safe_uuid(split_part(name,'/',2)) )` | 0031:49-57 |
  | "espace-files: update par entité" | UPDATE | `bucket_id = 'espace-files' and public.has_entite_write( safe_uuid(seg1), safe_uuid(seg2) )` | idem | 0031:59-74 |
  | "espace-files: delete par entité" | DELETE | `bucket_id = 'espace-files' and public.has_entite_write( safe_uuid(seg1), safe_uuid(seg2) )` | - | 0031:76-84 |
  (seg1 = `split_part(name,'/',1)`, seg2 = `split_part(name,'/',2)`.)
- **Historique (remplacees)** : 0024:28-58 creait `"espace-files: lecture membre"` (`is_member(safe_uuid(seg1))`), `"espace-files: insert writer"`, `"espace-files: update writer"`, `"espace-files: delete writer"` (`has_role(safe_uuid(seg1), W)`) ; **droppees 0031:32-35**.
- Effet des helpers : un membre plein passe `has_entite_access(espace, NULL)` (donc chemins legacy/orphelin lisibles) ; un scope exige une entite non NULL octroyee ET membre actif (0053:45). Les objets Storage ne sont pas supprimes par `purge_espace` / `purge_mon_espace` (0041:10-11).
- Aucune politique sur `storage.buckets`, aucune politique pour un autre bucket.

---------------------------------------------------------------------------------------------------

## Resume (<= 15 lignes)

1. 23 tables `public` ; toutes ENABLE + FORCE RLS dans l'etat final (beta_allowlist et app_admins forcees seulement en 0049) ; 0 table sans politique ; 0 vue ; 0 sequence ; 0 schema `private` ; aucune ALTER PUBLICATION.
2. Politiques additionnelles sur `storage.objects` (4, par entite) et `realtime.messages` (2, membre plein) ; 1 bucket prive `espace-files` sans limite de taille/mime.
3. Migration 0045 absente de la numerotation.
4. Politiques SANS clause TO (role PUBLIC) : `beta_allowlist_admin_all` (ALL, 0038:34) et `app_admins_self_read` (SELECT, 0038:38).
5. `espaces` : aucune politique INSERT (droppee 0006:48) ; `espaces_update` (owner/gestionnaire) sans restriction de colonne : `plan_id`, `subscription_*`, `stripe_customer_id`, `comp_*` non proteges par trigger ; `espaces_select` = `is_member` (inclut les membres scopes).
6. `espace_members` : `members_update` WITH CHECK sans la condition `user_id is distinct from auth.uid()` presente dans USING ; `members_insert` ne contraint ni `role` ni `full_espace` ; pas de trigger sur `full_espace`/`role`.
7. `espace_config` : SELECT = `is_full_member` mais INSERT/UPDATE/DELETE = `has_role(W)` (ignore `full_espace`) ; `audit_log_insert` = `is_member` alors que SELECT = `is_full_member`.
8. Pas de REVOKE anon (apres `revoke from public`) sur `is_member`, `has_role`, `create_espace`, `is_full_member`, `is_full_manager`, `has_entite_access`, `has_entite_write`, `accept_invitation`, `invitation_preview` ; `is_app_admin` et `safe_uuid` : aucun revoke ; `espace_plan`/`espace_has_feature` n'ont pas de verification d'appartenance (revoke anon seulement).
9. Aucun GRANT/REVOKE de table sauf `0047:79` (revoke update/delete/truncate sur `audit_log` pour authenticated et anon) ; privileges de table = defaults Supabase non visibles.
10. `has_entite_access_all` / `has_entite_write_all` (0052) sont INVOKER ; les autres helpers de politique sont DEFINER avec `search_path=''` ; `touch_row`/triggers INVOKER avec `search_path=''`.
11. `invitations.token` stocke en clair (uuid text), expiration par defaut 7 jours depuis 0053:224 ; `purge_mon_espace` verifie `role='owner'` sans `full_espace` ; `app.bypass_immutable` / `app.bypass_owner_guard` = echappatoires GUC de session.
12. Aucun trigger ne gele `created_by`/`created_at` ; verrous de signature sur `baux` et `edl` uniquement (baux_historique, baux_evenements, quittances non verrouilles).
