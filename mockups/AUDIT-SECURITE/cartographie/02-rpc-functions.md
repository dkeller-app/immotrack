# 02 - Cartographie des fonctions SQL / RPC (factuel, sans jugement final)

Sources lues : `supabase/migrations/0001..0055` (54 fichiers ; **0045 absent** de la suite), `supabase/config.toml`, appels `.rpc(` dans `js/` (hors vendor) et `relay/src/`.
Aucune migration ne contient `ALTER DEFAULT PRIVILEGES`, `ALTER FUNCTION`, `DROP FUNCTION`, ni `GRANT ... ON ALL FUNCTIONS`. Aucune fonction n'est créée dans un autre schéma que `public` (hors triggers sur `auth.users`, qui pointent des fonctions `public`).
Schémas exposés PostgREST (`config.toml:13`) : `["public","graphql_public"]` ; `extra_search_path = ["public","extensions"]` (l.15). `auto_expose_new_tables` est commenté (l.23).

## Convention de lecture des droits EXECUTE (important)
- Postgres accorde EXECUTE à PUBLIC par défaut. Les migrations 0023/0053 (commentaires) affirment que Supabase accorde AUSSI par défaut des GRANT explicites à `anon`, `authenticated`, `service_role` sur les fonctions de `public` ; `REVOKE ... FROM PUBLIC` ne les retire donc pas. Ce comportement par défaut n'est PAS visible dans les migrations (il vient de la plateforme) : il est noté "anon (défaut Supabase)" ci-dessous et doit être confirmé sur l'instance réelle (hors périmètre de cette cartographie, lecture de fichiers seule).
- Colonne "anon" : `REVOKE explicite` = un revoke from anon existe dans les migrations ; `non révoqué` = aucun revoke anon dans les migrations (donc anon garde l'EXECUTE par défaut plateforme) ; `PUBLIC non révoqué` = ni PUBLIC ni anon révoqués.
- "PostgREST" = fonction dans `public` donc joignable par `/rest/v1/rpc/<nom>` si EXECUTE est accordé au rôle appelant. Les fonctions `RETURNS trigger` figurent dans `public` mais ne sont pas appelables comme RPC utile (Postgres refuse un appel direct d'une fonction trigger).

## 1. Tableau de toutes les fonctions (état final)

Légende : DEF = SECURITY DEFINER, INV = SECURITY INVOKER (défaut si non précisé), SP = `SET search_path`. Toutes les fonctions ont `SP = ''` (vide) sauf mention.

### 1a. Fonctions DEFINER appelables comme RPC (non trigger)

| Fonction(signature) | Définition finale | Sécurité / SP / Langage | GRANT/REVOKE (fichier:ligne) | anon | PostgREST |
|---|---|---|---|---|---|
| `is_member(p_espace_id uuid) -> boolean` | 0002:6 | DEF / '' / sql stable | REVOKE ALL from public 0002:21 ; GRANT authenticated 0002:22 | non révoqué (défaut Supabase) | oui |
| `has_role(p_espace_id uuid, p_roles espace_role[]) -> boolean` | 0002:24 | DEF / '' / sql stable | REVOKE ALL public 0002:40 ; GRANT authenticated 0002:41 | non révoqué | oui |
| `create_espace(p_nom text) -> espaces` | 0004:5 | DEF / '' / plpgsql | REVOKE ALL public 0004:33 ; GRANT authenticated 0004:34 | non révoqué (lève AUTH_REQUIRED si auth.uid() null) | oui |
| `espace_plan(p_espace_id uuid) -> plans` | 0020:12 | DEF / '' / sql stable | aucun revoke public ; REVOKE anon 0022:30 ; aucun GRANT explicite | **PUBLIC non révoqué** (anon révoqué seulement en explicite, PUBLIC reste) | oui |
| `espace_has_feature(p_espace_id uuid, p_feature text) -> boolean` | 0022:16 (remplace 0020:26) | DEF / '' / sql stable | aucun revoke public ; REVOKE anon 0022:31 ; aucun GRANT explicite | **PUBLIC non révoqué** | oui |
| `purge_espace(p_espace_id uuid) -> void` | 0023:44 | DEF / '' / plpgsql | REVOKE public, anon, authenticated 0023:73 ; GRANT service_role 0023:74 | REVOKE explicite | oui (service_role seul) |
| `is_full_member(p_espace_id uuid) -> boolean` | 0029:123 | DEF / '' / sql stable | REVOKE ALL public 0029:138 ; GRANT authenticated 0029:139 | non révoqué | oui |
| `is_full_manager(p_espace_id uuid) -> boolean` | 0029:144 | DEF / '' / sql stable | REVOKE ALL public 0029:160 ; GRANT authenticated 0029:161 | non révoqué | oui |
| `has_entite_access(p_espace_id uuid, p_entite_id uuid) -> boolean` | 0053:45 (remplace 0029:243) | DEF / '' / sql stable | REVOKE ALL public 0029:262 ; GRANT authenticated 0029:263 (inchangés par 0053) | non révoqué | oui |
| `has_entite_write(p_espace_id uuid, p_entite_id uuid) -> boolean` | 0053:66 (remplace 0029:269) | DEF / '' / sql stable | REVOKE ALL public 0029:289 ; GRANT authenticated 0029:290 | non révoqué | oui |
| `entite_of_logement(p_espace_id uuid, p_logement_id uuid) -> uuid` | 0053:89 (0030:50) | DEF / '' / sql stable | REVOKE ALL public 0030:62 ; GRANT authenticated 0030:63 ; REVOKE anon 0053:215 | REVOKE explicite | oui |
| `entite_of_immeuble(p_espace_id uuid, p_immeuble_id uuid) -> uuid` | 0053:103 (0030:65) | DEF / '' / sql stable | idem 0030:77-78 ; REVOKE anon 0053:216 | REVOKE explicite | oui |
| `entite_of_bail(p_espace_id uuid, p_bail_id uuid) -> uuid` | 0053:117 (0030:81) | DEF / '' / sql stable | idem 0030:95-96 ; REVOKE anon 0053:217 | REVOKE explicite | oui |
| `entite_of_document(p_espace_id uuid, p_parent_type text, p_parent_id uuid) -> uuid` | 0053:137 (0042:33, 0030:100) | DEF / '' / sql stable | REVOKE ALL public + GRANT authenticated 0042:63-64 ; REVOKE anon 0053:218 | REVOKE explicite | oui |
| `ref_logement_accessible(p_espace_id uuid, p_ref text) -> boolean` | 0053:172 (0043:35) | DEF / '' / sql stable | 0043:50-51 ; REVOKE anon 0053:219 | REVOKE explicite | oui |
| `nom_immeuble_accessible(p_espace_id uuid, p_nom text) -> boolean` | 0053:192 (0043:54) | DEF / '' / sql stable | 0043:69-70 ; REVOKE anon 0053:220 | REVOKE explicite | oui |
| `espace_config_scoped(p_espace_id uuid) -> jsonb` | 0051:23 (0043:73, 0044:20) | DEF / '' / plpgsql stable | REVOKE ALL public + GRANT authenticated 0051:92-93 ; REVOKE anon 0053:221 | REVOKE explicite | oui |
| `accept_invitation(p_token text) -> uuid` | 0053:226 (0032:106) | DEF / '' / plpgsql | REVOKE ALL public + GRANT authenticated 0053:302-303 (et 0032:163-164) | non révoqué (voulu : 0053 l.38-39 "restent tels quels") ; lève AUTH_REQUIRED si auth.uid() null | oui |
| `invitation_preview(p_token text) -> jsonb` | 0032:168 (jamais redéfinie) | DEF / '' / plpgsql | REVOKE ALL public + GRANT authenticated 0032:197-198 | non révoqué ; commentaire 0053 : "l'aperçu est appelé AVANT connexion" (l'appel client est fait avant login, supabase-entry.js:719-721,847) | oui |
| `is_app_admin() -> boolean` | 0038:23 | DEF / '' / sql stable | GRANT authenticated 0038:27 ; **aucun REVOKE** | **PUBLIC non révoqué** | oui |
| `purge_mon_espace(p_espace_id uuid, p_confirm_nom text) -> void` | 0041:13 | DEF / '' / plpgsql | REVOKE public, anon, authenticated 0041:54 ; GRANT authenticated 0041:55 | REVOKE explicite | oui |
| `hook_restrict_signup(event jsonb) -> jsonb` | 0039:6 | DEF / '' / plpgsql stable | GRANT supabase_auth_admin 0039:28 ; REVOKE authenticated, anon, public 0039:29 | REVOKE explicite | oui mais seul supabase_auth_admin peut l'exécuter |

### 1b. Fonctions INVOKER non-trigger

| Fonction | Définition finale | Sécurité / SP / Langage | GRANT/REVOKE | anon | PostgREST |
|---|---|---|---|---|---|
| `has_entite_write_all(p_espace_id, p_entite_id, p_logement_id, p_immeuble_id uuid) -> boolean` | 0052:37 | INV / '' / sql stable | REVOKE ALL public 0052:53 ; GRANT authenticated 0052:54 ; REVOKE anon 0052:138 | REVOKE explicite | oui |
| `has_entite_access_all(idem) -> boolean` | 0052:56 | INV / '' / sql stable | 0052:72-73 ; REVOKE anon 0052:139 | REVOKE explicite | oui |
| `safe_uuid(p text) -> uuid` | 0024:7 | INV / '' / plpgsql immutable | aucun grant/revoke | **PUBLIC non révoqué** | oui (pur : cast uuid tolérant) |

### 1c. Fonctions trigger (RETURNS trigger) - aucun GRANT/REVOKE dans les migrations (EXECUTE PUBLIC par défaut)

| Fonction | Définition finale | Sécurité / SP / Langage | Branchée sur |
|---|---|---|---|
| `touch_row()` | 0006:34 | INV / '' / plpgsql | BEFORE UPDATE de ~toutes les tables métier (trg_touch_*) |
| `members_freeze_identity()` | 0007:6 | INV / '' / plpgsql | espace_members (espace_id, user_id immuables) |
| `protect_last_owner()` | 0023:9 (0005:23) | **DEF** / '' / plpgsql | espace_members BEFORE UPDATE/DELETE ; bypass GUC `app.bypass_owner_guard` |
| `freeze_espace_id()` | 0009:19 | INV / '' / plpgsql | tables métier BEFORE UPDATE |
| `prevent_locked_mutation()` | 0055:28 (0014:19) | INV / '' / plpgsql | baux (0015), edl (0016) ; bypass GUC `app.bypass_immutable` ; 0055 autorise archived false->true seul |
| `entite_membre_freeze_identity()` | 0029:207 | INV / '' / plpgsql | entite_membre |
| `invitations_validate_grants()` | 0032:43 | INV / '' / plpgsql | invitations BEFORE INSERT/UPDATE |
| `invitation_to_allowlist()` | 0038:43 | **DEF** / '' / plpgsql | invitations AFTER INSERT (trg_invitation_to_allowlist) |
| `beta_mark_registered()` | 0038:64 | **DEF** / '' / plpgsql | **auth.users** AFTER INSERT (trg_beta_mark_registered) |
| `audit_log_stamp()` | 0047:44 | INV (explicite) / '' / plpgsql | audit_log BEFORE INSERT |

Fonctions supersédées (ne sont plus l'état final) : is_member etc. inchangées ; `touch_row` 0005:2 (sans SP) -> 0006:34 ; `members_freeze_identity` 0006:14 -> 0007:6 ; `protect_last_owner` 0005:23 -> 0023:9 ; `espace_has_feature` 0020:26 -> 0022:16 ; `has_entite_access/write` 0029 -> 0053 ; resolvers 0030/0042 -> 0053 ; `ref_logement_accessible/nom_immeuble_accessible` 0043 -> 0053 ; `espace_config_scoped` 0043 -> 0044 -> 0051 ; `accept_invitation` 0032 -> 0053 ; `prevent_locked_mutation` 0014 -> 0055.

**Fonctions DEFINER sans `SET search_path` : AUCUNE** (toutes les fonctions listées, DEFINER ou non, ont `set search_path = ''`). Voir la vérification en fin de document.

## 2. Fonctions SECURITY DEFINER : corps résumé et contrôles

Aucune ne contient `EXECUTE` / `format()` de SQL dynamique (voir section 2z). Les `execute format(...)` des migrations sont dans des blocs `DO` de migration (création de triggers/policies), pas dans des fonctions stockées.

**is_member / has_role / is_full_member / is_full_manager** (0002, 0029) : `select exists` sur `espace_members` avec `user_id = auth.uid()`, `invite_status='active'` (+ `full_espace=true`, + `role in ('owner','gestionnaire')` pour manager ; `role = any(p_roles)` pour has_role). Paramètre appelant : `p_espace_id` (et `p_roles`). Contrôle : appartenance de l'appelant (auth.uid()). Lecture seule, renvoie un booléen ; n'expose aucune donnée tierce, mais permet à tout appelant de tester sa propre appartenance à un espace arbitraire (uuid).

**create_espace(p_nom)** (0004) : exige auth.uid() non null et nom non vide ; INSERT `espaces(nom, created_by=auth.uid())` puis INSERT `espace_members(role='owner', active)` ; renvoie la ligne `espaces`. Param appelant : `p_nom` seulement (pas d'id d'espace). Pas de limite de nombre d'espaces visible dans le corps.

**espace_plan / espace_has_feature** (0020, 0022) : lecture `espaces JOIN plans` pour `p_espace_id` ; **aucun contrôle d'appartenance** (pas d'auth.uid()). Renvoie la ligne `plans` complète (catalogue global) / un booléen de feature pour n'importe quel uuid d'espace fourni. Donne indirectement : existence d'un espace (NULL si introuvable) et son plan_id. Appelable par PUBLIC/anon (cf. tableau).

**purge_espace(p_espace_id)** (0023) : pose `app.bypass_immutable='on'` et `app.bypass_owner_guard='on'` (set_config local) ; `DELETE baux_evenements WHERE espace_id`, `UPDATE baux SET amends_id=null`, `DELETE espaces WHERE id` (cascade FK sur membres + données). Param : `p_espace_id`. **Aucun contrôle auth.uid()/rôle dans le corps** : l'autorisation repose uniquement sur le GRANT (service_role seul, 0023:73-74). Ne touche pas Storage (0041 l.10-12).

**purge_mon_espace(p_espace_id, p_confirm_nom)** (0041) : (1) refuse si `auth.uid()` null ou si l'appelant n'est pas `owner` actif de `p_espace_id` dans `espace_members` (`PURGE_NOT_OWNER`) ; (2) lit `espaces.nom`, compare `btrim(nom) = btrim(p_confirm_nom)` sinon `PURGE_CONFIRM_MISMATCH` ; (3) `perform public.purge_espace(p_espace_id)` (exécuté avec les droits du owner de la fonction). Params appelant : id d'espace + nom confirmé. Suppression dure de tout l'espace. Rôle exigé : owner (le rôle `gestionnaire` ne suffit pas).

**accept_invitation(p_token)** (0053) : exige auth.uid() ; `SELECT ... FROM invitations WHERE token = p_token FOR UPDATE` ; refuse revoked ; si accepted : idempotent pour le même user sinon INVITATION_ALREADY_USED ; refuse expirée ; si `invite_email` renseigné, doit égaler `lower(btrim(auth.users.email))` du compte (lit `auth.users.email` de l'appelant seulement) ; refuse si déjà membre plein actif ; si pas membre actif : `DELETE entite_membre` de ce user dans l'espace ; `INSERT espace_members(role='lecture_seule', active, full_espace=false) ON CONFLICT DO UPDATE (active, full_espace=false, role=lecture_seule)` ; boucle sur `grants` JSON de la ligne invitation (pas de l'appelant) -> `INSERT entite_membre`, puis `UPDATE invitations SET status='accepted'`. Param appelant : `p_token` uniquement (jeton porteur, uuid 122 bits, `invitations.token` default gen_random_uuid()::text). Retourne `espace_id`. Expiration par défaut 7 j (0053:224) pour les nouvelles invitations ; `expires_at` NULL possible = sans expiration. Limite documentée 0053:l.31-36 : confirmation d'email désactivée (config.toml:226 `enable_confirmations=false`).

**invitation_preview(p_token)** (0032:168) : SELECT invitation par token ; si introuvable renvoie NULL ; sinon lit `espaces.nom` et `entites.nom` (pour chaque entite_id des grants) et renvoie jsonb `{espace_nom, grants:[{entite_id, mode, entite_nom}], status, expired}`. **Aucun contrôle auth.uid()** : quiconque détient le token (et a EXECUTE : PUBLIC/anon par défaut) reçoit nom de l'espace, uuids et noms des entités concernées. Ne renvoie pas `invite_email` ni `created_by`. Oracle d'existence de token (NULL vs objet).

**is_app_admin()** (0038) : `exists(select 1 from app_admins where user_id = auth.uid())`. Aucun paramètre appelant. Booléen.

**espace_config_scoped(p_espace_id)** (0051) : si `NOT is_member(p_espace_id)` -> NULL ; lit `espace_config.data` ; si `is_full_member` -> renvoie le blob INTÉGRAL ; sinon (scopé) construit un objet neuf ne contenant que 7 clés filtrées (irlHistorique, loyerBareme, assurances, compteursReleves, equipements, emailsSent, regulValidations) via `ref_logement_accessible` / `nom_immeuble_accessible`. Param appelant : `p_espace_id`. Autorisation : appartenance active. Lit uniquement `espace_config` (+ `logements`/`immeubles` via helpers). Ne lit pas auth.users ; peut contenir des données PII dans le blob (ex. emailsSent) selon le contenu. Pas de SQL dynamique.

**ref_logement_accessible / nom_immeuble_accessible** (0053) : `exists` sur `logements` (par `lower(btrim(ref))`) / `immeubles` (par nom) de `p_espace_id` avec `has_entite_access(...)`, ET `not exists` de ligne homonyme (regexp blancs) non accessible. Param : espace + ref/nom. Booléen ; utilise auth.uid() via has_entite_access.

**has_entite_access / has_entite_write** (0053) : `is_full_member`/`is_full_manager` OU (entité non NULL ET `is_member` ET ligne `entite_membre` pour auth.uid(), `role='gestionnaire'` pour write). Booléens.

**entite_of_logement / entite_of_immeuble / entite_of_bail / entite_of_document** (0053) : renvoient `entite_id` du logement/immeuble/bail/parent de document de l'espace fourni, **seulement si** `has_entite_access(p_espace_id, entite)` est vrai pour l'appelant, sinon NULL (0053 corrige l'oracle d'énumération F4). Params : espace + id de ligne (+ parent_type text). Pas d'écriture.

**hook_restrict_signup(event jsonb)** (0039) : lit `event->'user'->>'email'`, normalisé lower/trim ; si vide -> erreur 400 ; `SELECT exists FROM beta_allowlist WHERE email = v_email` ; si absent -> erreur 403 ; sinon `{}`. Lecture seule (stable). Pas de contrôle d'auth.uid() (appelé avant création du compte).

**Triggers DEFINER** :
- `protect_last_owner` (0023:9) : compte les owners actifs restants de l'espace dans `espace_members` ; lève LAST_OWNER_PROTECTED ; bypass si GUC `app.bypass_owner_guard='on'` (posé par purge_espace seulement ; non settable via PostgREST).
- `invitation_to_allowlist` (0038:43) : AFTER INSERT sur `invitations` ; si `invite_email` non vide : lit `auth.users.email` du créateur (`created_by`) et INSERT dans `beta_allowlist(email=lower(trim(invite_email)), source='invitation', invited_by_email=<email du créateur>)` ON CONFLICT DO NOTHING. L'email inviteur est stocké dans `beta_allowlist.invited_by_email` (lisible seulement par app admin via RLS `is_app_admin()`, `select ... invited_by_email` côté admin UI supabase-entry.js:700).
- `beta_mark_registered` (0038:64) : AFTER INSERT sur `auth.users` ; `UPDATE beta_allowlist SET registered_at = now() WHERE email = lower(trim(new.email)) AND registered_at IS NULL`.

### 2z. SQL dynamique
Recherche `execute`/`format(` : dans les fonctions stockées, seul `format('%s id=%s ...')` dans `prevent_locked_mutation` (0014/0055) pour le texte `detail` d'un `raise exception` (concaténation de message, pas d'exécution SQL). **Aucune fonction stockée n'utilise `EXECUTE`**. `execute format(...)` n'apparaît que dans des blocs `DO` de migration (0009:~33-40, 0010:95, 0011:96, 0012:97, 0013:53, 0017:42, 0027:35, 0028:80, 0052, etc.).

### 2y. Renvoi de données d'autres utilisateurs
- Aucune fonction ne renvoie des emails de `auth.users` à l'appelant. `accept_invitation` lit `auth.users.email` de l'appelant lui-même uniquement (comparaison interne). `invitation_to_allowlist` lit l'email du créateur de l'invitation et l'écrit dans `beta_allowlist.invited_by_email` (table restreinte à `is_app_admin()`). 
- `invitation_preview` renvoie noms d'espace/entités à tout détenteur du token.
- `espace_config_scoped` renvoie le blob de config de l'espace (peut contenir PII selon contenu) aux membres.
- `espace_plan` renvoie la ligne `plans` (catalogue) pour tout uuid d'espace.

## 3. Hooks d'auth et allowlist bêta

- **Définition du hook** : `public.hook_restrict_signup(event jsonb)` (0039:6), DEF, `SET search_path=''`, STABLE. EXECUTE : accordé à `supabase_auth_admin` (0039:28) ; révoqué à `authenticated, anon, public` (0039:29).
- **Branchement** : **PAS dans `config.toml`** : le bloc `[auth.hook.before_user_created]` est commenté (config.toml:278-281, uri exemple `pg-functions://postgres/auth/before-user-created-hook`, qui ne désigne pas `hook_restrict_signup`). Le commentaire de 0039 (l.3) dit "Activation = dashboard Supabase (Auth -> Hooks)". L'activation réelle sur l'instance hébergée n'est donc pas vérifiable depuis le dépôt.
- **Contexte config locale** : `enable_signup = true` (config.toml:176 et 221 pour email), `enable_anonymous_sign_ins = false` (l.178), `enable_confirmations = false` (email, l.226), `minimum_password_length = 6` (l.182), `jwt_expiry = 3600` (l.165). `[auth.hook.custom_access_token]` commenté (l.284).
- **Allowlist** (0038) : table `beta_allowlist(email pk, source, added_by, invited_by_email, invitation_id, registered_at)` ; RLS enable (0038) + FORCE (0049) ; policy `beta_allowlist_admin_all` FOR ALL using/with check `is_app_admin()`. Table `app_admins(user_id)` : policy `app_admins_self_read` select `user_id = auth.uid()` ; aucune policy d'écriture (écriture = service_role).
- **Alimentation** : (a) admin via client (`supabase-entry.js:700-713` select/insert/delete sur beta_allowlist, protégé par RLS is_app_admin) ; (b) automatique par trigger `trg_invitation_to_allowlist` : tout INSERT d'invitation avec `invite_email` ajoute cet email à l'allowlist (la création d'invitation est permise à tout `is_full_manager` de son espace, policy "invitations: insert manager" 0032) ; (c) `trg_beta_mark_registered` sur `auth.users` marque `registered_at`.
- **Exécutable par** : le hook n'est pas appelable par clients ; `is_app_admin` : authenticated + PUBLIC (cf. tableau) ; `invitation_to_allowlist` et `beta_mark_registered` sont des fonctions trigger sans revoke (EXECUTE PUBLIC par défaut, non appelables directement).

## 4. Appels client `rpc(...)`

| Fichier:ligne | Fonction | Paramètres passés | Contexte |
|---|---|---|---|
| js/app/supabase-entry.js:694 | `is_app_admin` | aucun | `_isAppAdmin()`, client authentifié |
| js/app/supabase-entry.js:847 | `invitation_preview` | `{ p_token: token }` (token = `?invite=` de l'URL) | dans `acceptInviteFlow`, appelé à l'init AVANT login (l.719-721) ; try/catch |
| js/app/supabase-entry.js:859 | `accept_invitation` | `{ p_token: token }` | après authentification de l'invité |
| js/app/supabase-entry.js:1631 | `purge_mon_espace` | `{ p_espace_id: esp.espaceId, p_confirm_nom: confirmNom }` | `window.__immoPurgeEspace`, nom saisi par l'utilisateur |
| js/app/supabase-boot.js:147 | `create_espace` | `{ p_nom: defaultName }` (défaut 'Mon patrimoine') | `resolveEspace()` si aucun espace n'est visible |
| js/core/store-supabase-adapter.js:53 | `espace_config_scoped` | `{ p_espace_id: espaceId }` | `fetchConfig()` |

- `relay/src/` : **aucun `.rpc(`** ni appel `/rest/v1/rpc/` ; le relais ne contient que `requireSupabaseUser` (index.js:71) qui vérifie le JWT Supabase (`SUPABASE_URL`, clé publique ES256) - aucun appel de fonction SQL.
- Fonctions SQL appelables mais **sans appel client** : `is_member`, `has_role`, `is_full_*`, `has_entite_*`, `entite_of_*`, `*_accessible`, `espace_plan`, `espace_has_feature`, `purge_espace`, `safe_uuid`, `hook_restrict_signup` (utilisées par les policies RLS/Storage/Realtime ou le service). `espace_plan/espace_has_feature` : aucune policy ni trigger ne les appelle (0020 l.4 : "HOOK seulement").

## 5. Zones demandées en évidence

- **Purge** : `purge_espace(uuid)` 0023:44 (service_role seul, aucun contrôle interne) ; `purge_mon_espace(uuid,text)` 0041:13 (authenticated, owner actif + nom exact). Les deux ne nettoient pas Storage. GUC de bypass : `app.bypass_immutable` (0014/0055) et `app.bypass_owner_guard` (0023:9), posés par `set_config(..., true)` dans `purge_espace`. Le commentaire 0014 affirme que ces GUC ne sont pas settables via PostgREST ; leur lecture dans les triggers utilise `current_setting(..., true)` (missing_ok).
- **Invitations** : table `invitations` (0032) RLS FORCE, CRUD réservé à `is_full_manager` ; `accept_invitation` (0053:226) ; `invitation_preview` (0032:168) ; trigger `invitations_validate_grants` (0032:43) vérifie que chaque `entite_id` du JSON appartient à l'espace ; `expires_at` défaut 7 j (0053:224) ; liaison optionnelle à l'email du compte (0053) ; le trigger 0038 ajoute `invite_email` à l'allowlist.
- **Verrous** (0014-0016) : `prevent_locked_mutation` (0055:28) refuse UPDATE/DELETE de toute ligne `locked` de `baux`/`edl` ; seule exception 0055 : `baux` `archived false->true` sans autre colonne changée ; bypass GUC `app.bypass_immutable='on'`. Fonction INVOKER, non RPC.
- **Plans/quotas** (0018-0022) : tables `plans`, colonnes d'abonnement `espaces` (0019), rétention (0021) ; fonctions seulement `espace_plan` et `espace_has_feature` (DEF, lecture sans contrôle d'appartenance, PUBLIC non révoqué). Aucune fonction d'application de quota n'existe dans 0001-0055.
- **audit_log** (0047) : fonction `audit_log_stamp` INVOKER force `user_id=auth.uid()` et `ts=now()` ; policies : select `is_full_member`, insert `is_member` ; aucune policy update/delete + `REVOKE update, delete, truncate FROM authenticated, anon` (0047 dernier statement).
- **Archivage baux signés** (0055) : pas de nouvelle RPC ; réécriture de `prevent_locked_mutation` (voir ci-dessus) ; l'archivage est un UPDATE ordinaire soumis à la RLS écriture par entité.

## Vérification (grep sur les migrations)
- Chaque `create or replace function` (liste complète) est suivi d'un `set search_path = ''` : 0002, 0004, 0005(DEF), 0006, 0007, 0009, 0014, 0020, 0022, 0023, 0024, 0029, 0030, 0032, 0038, 0039, 0041, 0042, 0043, 0044, 0047, 0051, 0052, 0053, 0055. Exception : les versions *supersédées* `touch_row` (0005:2) et `members_freeze_identity` (0006:14), sans search_path, remplacées par 0006:34 / 0007:6.
- Le bloc "Statut" ci-dessus est issu de grep de `language|security|set search_path` sur tous les fichiers.
