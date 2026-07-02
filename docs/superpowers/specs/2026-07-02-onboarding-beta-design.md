# Onboarding bêta — inscription allowlist + invitations gratuites — design

> **Statut : DESIGN validé** (décisions prises en dialogue 2026-07-02). App Propryo, Supabase hébergé (`xcbtashflclswyiyvfgn`), site public `dkeller-app.github.io/immotrack/`. Lié à [[project_marketing_propryo_beta]] + [[project_partage_sci]] + [[project_cloud_cutover_finition]].

## Objectif
Permettre d'ouvrir l'app à des **bêta-testeurs** que Didier autorise (self-service gardé), chaque testeur ayant **son propre espace**, et pouvant **inviter des partenaires** (co-gestion) — **tout gratuit** pendant la bêta.

## État existant (confirmé par exploration)
- **Auto-provisionnement d'espace au 1er login MARCHE** : `resolveEspaces()` (`js/app/supabase-boot.js:72-91`) → 0 appartenance → RPC `create_espace` (`supabase/migrations/0004`). Un nouvel utilisateur obtient un espace vide « Mon patrimoine ».
- **`signUpEmail`** existe (`js/app/supabase-boot.js:24-28`), encapsule `client.auth.signUp`. **Un seul call-site réel** : `acceptInviteFlow` (`js/app/supabase-entry.js:366`). Le bouton d'inscription front-door est **bridé** (`supabase-entry.js:687-692`, affiche « inscription arrive bientôt »).
- **Invitations** : `_createInvite(grants, inviteEmail)` (`supabase-entry.js:230-246`, `inviteEmail` optionnel) → `client.from('invitations').insert` ; acceptation `accept_invitation` (`supabase/migrations/0032`). Écran « Partage & accès » (`rParamsPartage`).
- **Facturation = AFFICHAGE SEUL** (`index.html:49374-49391`) : calcule/affiche « 1er offert · +PARTAGE_ADDON €/mois » mais **ne bloque ni ne facture rien** (pas de Stripe).
- **`isOwner`** = propriétaire d'un espace (par-espace, `__immoCloudInfo.isOwner = user.id === esp.ownerId`). **Pas de notion de super-admin global.**

## Décisions validées
| # | Décision |
|---|----------|
| D1 | **Inscription self-service gardée par allowlist** : le testeur crée SON mot de passe ; seuls les emails autorisés passent. |
| D2 | **Verrou = hook Supabase natif « Before User Created »** (fonction Postgres) — [doc](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook). Refuse toute inscription dont l'email n'est pas dans l'allowlist. **Choisi contre le worker** (worker = infra externe + 2 branches relais divergentes à réconcilier + `service_role` à manipuler + casserait le flux d'invitation). Le hook garde l'inscription publique ON → inscription ET invitations continuent de marcher. |
| D3 | **Une seule allowlist** (`beta_allowlist`) alimentée par 2 sources : (a) le super-admin via l'écran admin (testeurs), (b) **auto** à la création d'une invitation (email du partenaire). Le hook ne vérifie qu'une source. |
| D4 | **Super-admin global** = table `app_admins(user_id)`, seedée avec le compte de Didier. Distinct de « owner d'espace ». |
| D5 | **Écran admin bêta in-app** « Gérer les accès bêta » (Réglages), visible **seulement** pour le super-admin. |
| D6 | **Invitation = email requis** (pour alimenter l'allowlist + le hook) → invite ciblée (meilleure sécu qu'un lien ouvert). |
| D7 | **Tout gratuit bêta** : l'encart facturation devient « Gratuit pendant la bêta » (copy only, aucune logique à défaire). |
| D8 | Repli : si le hook n'est pas dispo sur l'offre Supabase → plan B worker (documenté, non implémenté par défaut). |

## Architecture
```
Inscription front-door (testeur) :
  app (form email+mdp débridé) → client.auth.signUp
     → [HOOK before-user-created] email ∈ beta_allowlist ?  oui→crée / non→REFUS
     → loginEmail → resolveEspaces → espace vide auto

Invitation (partenaire) :
  testeur (Partage & accès, email requis) → insert invitations
     → [TRIGGER] upsert invite_email dans beta_allowlist
  partenaire → lien ?invite=token → acceptInviteFlow → signUp
     → [HOOK] email ∈ beta_allowlist (ajouté par le trigger) → OK
     → accept_invitation(token)
```

## Composants

### 1. Base de données (migrations 0038 + 0039)
- **`0038_beta_onboarding.sql`** :
  - Table `beta_allowlist(email text primary key, source text, added_by uuid, invitation_id uuid null, created_at timestamptz default now(), registered_at timestamptz null)`. Email stocké **en minuscules** (normalisé).
  - Table `app_admins(user_id uuid primary key references auth.users, created_at timestamptz default now())`. **Seed** : `insert into app_admins(user_id) values ('<uid de didierkeller@gmail.com>')` — l'uid est résolu à l'application (voir §Cas limites).
  - Helper `public.is_app_admin()` → `exists(select 1 from app_admins where user_id = auth.uid())` (SQL, stable).
  - RLS `beta_allowlist` : SELECT/INSERT/UPDATE/DELETE réservés à `is_app_admin()`. **Exception INSERT** pour l'auto-ajout via invitation → géré par le trigger `security definer` (pas de policy ouverte aux testeurs).
  - RLS `app_admins` : SELECT par l'utilisateur pour lui-même (`user_id = auth.uid()`) ; INSERT/UPDATE/DELETE `service_role` uniquement.
  - Colonne : rendre `invitations.invite_email` **NOT NULL** pour les nouvelles lignes (ou CHECK) — les invites bêta doivent porter un email. (Anciennes lignes tolérées.)
  - Trigger `on_invitation_created` (AFTER INSERT ON invitations, `security definer`) : si `NEW.invite_email` non null → `insert into beta_allowlist(email, source, invitation_id) values (lower(NEW.invite_email), 'invitation', NEW.id) on conflict (email) do nothing`.
- **`0039_hook_before_user_created.sql`** :
  - Fonction `public.hook_restrict_signup(event jsonb) returns jsonb` (`security definer`), selon le patron de la doc Supabase : extrait l'email de `event`, si `lower(email) not in (select email from beta_allowlist)` → retourne un objet `{"error": {...}}` (refus) ; sinon retourne `event` (autorise). Sur autorisation, marque `registered_at = now()` sur la ligne allowlist (best-effort).
  - Grants requis par le hook Supabase (rôle `supabase_auth_admin`) — cf. doc.

### 2. Config dashboard Supabase (action utilisateur, guidée)
- Activer le hook **« Before User Created »** → pointer sur `public.hook_restrict_signup`. (Authentication → Hooks.)
- Vérifier que l'inscription email est **activée** (le hook est le videur).
- ⚠️ Étape faite par Didier (je fournis le pas-à-pas) — pas manipulable en code.

### 3. Client (`index.html` + `js/app/`)
- **Débrider l'inscription** (`supabase-entry.js:687-692`) : remplacer le message par un vrai formulaire (email + mot de passe ≥ 6, confirmation) → `api.signUpEmail` → si refus hook, message clair « Cet email n'est pas encore autorisé pour la bêta — demande un accès à … ». Réutilise le rendu de `acceptInviteFlow` (DRY).
- **Invitation email requis** : `_createInvite` exige `inviteEmail` non vide ; l'écran popup d'invitation rend le champ email obligatoire.
- **Écran admin bêta** « Gérer les accès bêta » (nouvelle carte Réglages, `rParamsBetaAdmin`), visible seulement si super-admin (nouveau `window.__immoIsAdmin` résolu au login via `select is_app_admin()`), qui : liste `beta_allowlist` (email, source, inscrit ✓/✗), ajoute un email (insert), retire (delete). Réutilise les patrons de `rParamsPartage`/`__immoPartage`.
- **Facturation** (`index.html:49374-49391`) : remplacer l'encart chiffré par un encart neutre « 🎁 Gratuit pendant la bêta — invitations illimitées, lecture et écriture ». Garder le compteur de partenaires (informatif), retirer prix/`PARTAGE_ADDON`.
- Exposer `window.__immoAdmin = { listAllowlist, addEmail, removeEmail }` (miroir de `__immoPartage`) dans `supabase-entry.js`.

## Sécurité / vie privée
- Le videur est **côté serveur Auth** (hook) → non contournable, contrairement à un simple contrôle navigateur.
- `service_role` **jamais** manipulée côté client ni worker (c'est tout l'intérêt du hook).
- L'auto-ajout d'allowlist via invitation passe par un **trigger `security definer`** (pas de droit d'insert direct donné aux testeurs).
- Écran admin gardé par `is_app_admin()` **et** RLS (double verrou : cacher l'UI ne suffit pas, la table refuse aussi).
- Pas de vérification d'email (SMTP off) → un email autorisé peut être « faux » ; acceptable en bêta fermée (l'allowlist limite déjà qui entre). Vérif email = hors scope (nécessite SMTP).

## Cas limites / erreurs
- **Hook indisponible sur l'offre** (D8) : à l'activation, si le dashboard ne propose pas le hook → repli worker (spec séparée). On confirme AVANT d'implémenter le reste.
- **Résolution de l'uid super-admin pour le seed** : l'uid de `didierkeller@gmail.com` n'est pas connu à l'écriture de la migration. Le seed lira `auth.users` par email : `insert into app_admins(user_id) select id from auth.users where email = 'didierkeller@gmail.com' on conflict do nothing;` (exécuté via Node-pg/REST service_role comme les ETL précédents).
- **Lockout admin** : si le seed échoue (0 ligne), l'écran admin est invisible → vérifier `select * from app_admins` après migration. Fallback : insert manuel via SQL service_role.
- **Email déjà inscrit** : `signUp` renvoie « already registered » → bascule `loginEmail` (comportement existant conservé).
- **Casse (majuscules/espaces)** : normaliser l'email en `lower(trim(...))` partout (allowlist, hook, trigger, form).
- **Invitation sans email (anciennes)** : tolérées (NOT NULL seulement pour les nouvelles) ; le trigger ne fait rien si null.

## Vérification
- Migrations appliquées via Node-pg/REST service_role (canal ETL existant) + `test:rls` (allowlist : testeur ne lit/écrit pas ; super-admin oui) + test du trigger (invite → allowlist alimentée).
- Test hook : email hors allowlist → inscription REFUSÉE ; email dans allowlist → OK ; invité → OK.
- `check-inline-js` 5/0 · pas de demo-data auto-injectée · responsive écran admin (3 formats).
- **Audit `superpowers:code-reviewer` OBLIGATOIRE** (auth/sécurité : hook, RLS, trigger, super-admin) avant « prêt ».
- Bump version (5 emplacements + `sw.js`).

## Hors scope (v1 bêta)
- Facturation réelle / Stripe (tout gratuit pour l'instant).
- Vérification d'email (SMTP non configuré).
- Inscription totalement ouverte (on garde l'allowlist).
- Réconciliation des branches worker relais (non nécessaire avec le hook).
- Écran admin avancé (quotas, rôles multiples) — plus tard.
