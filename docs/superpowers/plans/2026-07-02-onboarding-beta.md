# Onboarding bêta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ouvrir l'app à des bêta-testeurs autorisés (inscription self-service gardée par une allowlist, verrou = hook Supabase « Before User Created »), chacun avec son espace, pouvant inviter des partenaires — tout gratuit.

**Architecture:** Verrou côté serveur Auth via un hook Postgres (aucun worker, `service_role` jamais exposée). Une seule table `beta_allowlist` alimentée par le super-admin (testeurs) ET par un trigger à la création d'invitation (partenaires). Hook + RLS = double verrou. UI : formulaire d'inscription débridé + écran admin (mockup-first) + facturation « gratuit bêta ».

**Tech Stack:** Postgres (migrations SQL, appliquées via Node-pg/REST service_role — canal ETL existant), Supabase Auth Hooks (config dashboard), vanilla JS (`index.html` + `js/app/supabase-entry.js`).

**Spec:** `docs/superpowers/specs/2026-07-02-onboarding-beta-design.md`.

> ⚠️ **Ordre imposé** : Phase A (backend) d'abord — testable seule (Didier peut gérer l'allowlist en SQL en attendant l'écran). Phase B (câblage léger). Phase C (écran admin = NOUVELLE UI → **mockup validé par l'utilisateur AVANT de coder**, règle mockup-first non négociable). Phase D (bump + audit + push).
> ⚠️ **Coordination index.html** : rebaser sur `origin/main` avant push, FF, re-bump si collision (protocole habituel). Ancrer les edits sur les chaînes exactes, pas les numéros de ligne.

---

## PHASE A — Backend (verrou serveur, testable sans UI)

### Task 1 : Migration 0038 — allowlist + super-admin + trigger

**Files:**
- Create: `supabase/migrations/0038_beta_onboarding.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- Onboarding bêta : allowlist d'inscription + super-admin global + auto-ajout des invités.
-- Dépend de 0001 (espaces/espace_members), 0032 (invitations). Le hook d'inscription est en 0039.
begin;

-- ── Allowlist : seuls ces emails peuvent créer un compte (vérifié par le hook 0039) ──
create table public.beta_allowlist (
  email         text primary key,                 -- normalisé lower(trim())
  source        text not null default 'admin',    -- 'admin' | 'invitation'
  added_by      uuid references auth.users(id),
  invitation_id uuid references public.invitations(id) on delete set null,
  created_at    timestamptz not null default now(),
  registered_at timestamptz                        -- rempli quand le compte est créé (hook)
);

-- ── Super-admins globaux (≠ owner d'espace) : accès à l'écran admin bêta ──
create table public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Helper : l'appelant est-il super-admin ? SECURITY DEFINER pour lire app_admins malgré la RLS.
create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_app_admin() to authenticated;

-- ── RLS ──
alter table public.beta_allowlist enable row level security;
alter table public.app_admins     enable row level security;

-- beta_allowlist : lecture/écriture réservées au super-admin (l'auto-ajout invité passe par le trigger SECURITY DEFINER).
create policy beta_allowlist_admin_all on public.beta_allowlist
  for all using (public.is_app_admin()) with check (public.is_app_admin());

-- app_admins : chacun peut lire SA ligne (pour résoudre __immoIsAdmin) ; écriture = service_role only (aucune policy write).
create policy app_admins_self_read on public.app_admins
  for select using (user_id = auth.uid());

-- ── Auto-ajout de l'email d'un partenaire invité à l'allowlist ──
-- Le testeur crée une invitation avec invite_email → l'email devient autorisé (le hook le laissera passer).
create or replace function public.invitation_to_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.invite_email is not null and length(trim(new.invite_email)) > 0 then
    insert into public.beta_allowlist (email, source, added_by, invitation_id)
    values (lower(trim(new.invite_email)), 'invitation', new.created_by, new.id)
    on conflict (email) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_invitation_to_allowlist
  after insert on public.invitations
  for each row execute function public.invitation_to_allowlist();

commit;
```

- [ ] **Step 2 : Vérifier la syntaxe SQL localement (parse only)**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/0038_beta_onboarding.sql','utf8'); if(!/begin;[\s\S]*commit;/.test(s)) throw new Error('pas de transaction'); console.log('OK 0038', s.length, 'chars')"`
Expected: `OK 0038 …`

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/0038_beta_onboarding.sql
git commit -m "Beta onboarding : migration 0038 (allowlist + app_admins + trigger invitation->allowlist)"
```

---

### Task 2 : Migration 0039 — hook « Before User Created »

**Files:**
- Create: `supabase/migrations/0039_hook_before_user_created.sql`

- [ ] **Step 1 : Écrire la migration** (patron officiel Supabase, adapté à l'allowlist)

```sql
-- Hook « Before User Created » : refuse toute inscription dont l'email n'est pas dans beta_allowlist.
-- Doc : https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
-- Dépend de 0038 (beta_allowlist). Activation = dashboard Supabase (Auth → Hooks), voir Task 4.
begin;

create or replace function public.hook_restrict_signup(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := lower(trim(event->'user'->>'email'));
  v_ok    boolean;
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Email manquant.', 'http_code', 400));
  end if;
  select exists (select 1 from public.beta_allowlist where email = v_email) into v_ok;
  if not v_ok then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Cet email n''est pas encore autorisé pour la bêta Propryo.', 'http_code', 403));
  end if;
  -- Autorisé : marque l'inscription (best-effort) et laisse passer.
  update public.beta_allowlist set registered_at = now()
    where email = v_email and registered_at is null;
  return '{}'::jsonb;
end;
$$;

-- Le hook est appelé par le rôle Auth ; il ne doit PAS être exécutable par les rôles clients.
grant execute on function public.hook_restrict_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup(jsonb) from authenticated, anon, public;

commit;
```

- [ ] **Step 2 : Vérifier la syntaxe SQL (parse only)**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/0039_hook_before_user_created.sql','utf8'); if(!/hook_restrict_signup/.test(s)||!/supabase_auth_admin/.test(s)) throw new Error('contenu manquant'); console.log('OK 0039')"`
Expected: `OK 0039`

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/0039_hook_before_user_created.sql
git commit -m "Beta onboarding : migration 0039 (hook Before-User-Created = gate allowlist)"
```

---

### Task 3 : Appliquer les migrations + seeder le super-admin

**Files:** aucun (opérations DB via le canal ETL service_role existant — `SUPABASE_DB_URL` dans `.env`, `npm i pg` déjà présent).

- [ ] **Step 1 : Appliquer 0038 puis 0039** (via Node-pg, comme les ETL précédents)

Run (adapter le petit script d'application des migrations déjà utilisé pour 0034/0037) : exécuter le contenu de `0038_beta_onboarding.sql` puis `0039_hook_before_user_created.sql`, puis `insert into schema_migrations` si la table de suivi existe.
Expected: aucune erreur ; `beta_allowlist`, `app_admins`, `hook_restrict_signup`, trigger `trg_invitation_to_allowlist` créés.

- [ ] **Step 2 : Seeder le super-admin (Didier) par email**

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'didierkeller@gmail.com'
on conflict (user_id) do nothing;
```
Expected: `select count(*) from public.app_admins` → **1**. Si **0** → l'utilisateur n'existe pas encore côté Auth : le créer/first-login d'abord, puis re-seeder. **Ne pas continuer tant que app_admins ≠ 1** (sinon écran admin invisible).

- [ ] **Step 3 : Vérifier le gating (test manuel DB)**

```sql
-- email hors allowlist → le hook renvoie une erreur
select public.hook_restrict_signup('{"user":{"email":"inconnu@x.com"}}'::jsonb);   -- attendu : {"error":{...403}}
insert into public.beta_allowlist(email) values ('testeur@x.com');
select public.hook_restrict_signup('{"user":{"email":"testeur@x.com"}}'::jsonb);   -- attendu : {}
delete from public.beta_allowlist where email = 'testeur@x.com';
```
Expected: 1er appel = objet `error` 403 ; 2e = `{}`.

---

### Task 4 : Activer le hook dans le dashboard (ÉTAPE UTILISATEUR)

**Files:** aucun (config projet hébergé `xcbtashflclswyiyvfgn`).

- [ ] **Step 1 : Didier active le hook** — Dashboard Supabase → Authentication → Hooks → **Before User Created** → type **Postgres** → schéma `public`, fonction `hook_restrict_signup`. (Je fournis le pas-à-pas + captures attendues.)

- [ ] **Step 2 : CONFIRMER la disponibilité (décision D8)** — Si le hook « Before User Created » **n'apparaît pas** dans le dashboard (offre non compatible) → **STOP** : basculer sur le plan B worker (spec séparée). Ne pas coder la Phase C tant que le hook n'est pas actif et testé.

- [ ] **Step 3 : Test bout-en-bout** — Tenter une inscription (via console ou l'app une fois la Phase B faite) avec un email hors allowlist → **refusée** ; avec un email ajouté → **acceptée** + espace vide auto.

---

## PHASE B — Câblage client léger (pas de nouvelle UI à designer)

### Task 5 : Résoudre `__immoIsAdmin` + exposer `window.__immoAdmin`

**Files:**
- Modify: `js/app/supabase-entry.js` (bloc api ~230-264 pour l'API ; `onLoggedIn` ~410-465 pour la résolution)

- [ ] **Step 1 : Ajouter les helpers admin dans le bloc api** (à côté de `_createInvite`/`_revokeMember`, avant `window.__immoPartage`)

```javascript
  // ── Admin bêta (super-admin global) : gestion de l'allowlist d'inscription ──
  async function _isAppAdmin () {
    const { data, error } = await client.rpc('is_app_admin')
    if (error) return false
    return data === true
  }
  async function _listAllowlist () {
    const { data, error } = await client.from('beta_allowlist')
      .select('email, source, created_at, registered_at').order('created_at', { ascending: false })
    if (error) return { error: error.message }
    return { rows: data || [] }
  }
  async function _addAllowedEmail (email) {
    const e = String(email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { error: 'Email invalide.' }
    const { error } = await client.from('beta_allowlist')
      .insert({ email: e, source: 'admin' })
    if (error) return { error: /duplicate|unique/i.test(error.message) ? 'Cet email est déjà autorisé.' : error.message }
    return { ok: true, email: e }
  }
  async function _removeAllowedEmail (email) {
    const { error } = await client.from('beta_allowlist').delete().eq('email', String(email || '').trim().toLowerCase())
    if (error) return { error: error.message }
    return { ok: true }
  }
  window.__immoAdmin = { isAppAdmin: _isAppAdmin, listAllowlist: _listAllowlist, addEmail: _addAllowedEmail, removeEmail: _removeAllowedEmail }
```

- [ ] **Step 2 : Résoudre le flag admin au login** (dans `onLoggedIn`, là où `window.__immoCloudInfo` est posé — vers L461)

Ajouter, après l'assignation de `__immoCloudInfo` :
```javascript
    try { window.__immoIsAdmin = await api.isAppAdminSafe() } catch (e) { window.__immoIsAdmin = false }
```
et exposer `isAppAdminSafe` = `_isAppAdmin` dans l'objet `api` retourné (chercher le `return { ... }` de la factory api et y ajouter `isAppAdminSafe: _isAppAdmin`).

- [ ] **Step 3 : Vérif**

Run: `node scripts/check-inline-js.mjs` → `5 | errors : 0` (ce fichier est un module `.js`, mais lancer quand même le check global). Run: `grep -c "__immoAdmin" js/app/supabase-entry.js` → ≥1.

- [ ] **Step 4 : Commit**

```bash
git add js/app/supabase-entry.js
git commit -m "Beta onboarding : API admin allowlist (__immoAdmin) + resolution __immoIsAdmin au login"
```

---

### Task 6 : Invitation — email du partenaire OBLIGATOIRE

**Files:**
- Modify: `js/app/supabase-entry.js:231-246` (`_createInvite`)
- Modify: `index.html` (popup d'invitation — champ email rendu requis)

- [ ] **Step 1 : Exiger l'email dans `_createInvite`** — remplacer

```javascript
    const row = { espace_id: _cloudEspaceId, grants: clean }
    if (inviteEmail) row.invite_email = inviteEmail
```
par
```javascript
    const em = String(inviteEmail || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { error: 'Email du partenaire requis (il sera autorisé à s\'inscrire).' }
    const row = { espace_id: _cloudEspaceId, grants: clean, invite_email: em }
```

- [ ] **Step 2 : Rendre le champ email requis dans le popup d'invitation** (index.html) — localiser le champ email de la popup d'invitation (`grep -n "invite" index.html` autour de l'appel `__immoPartage.createInvite`) et : ajouter `required`, un libellé « Email du partenaire (obligatoire) », et bloquer l'envoi si vide côté UI avec un message.

- [ ] **Step 3 : Vérif**

Run: `node scripts/check-inline-js.mjs` → `5 | errors : 0`.

- [ ] **Step 4 : Commit**

```bash
git add js/app/supabase-entry.js index.html
git commit -m "Beta onboarding : invitation exige l'email du partenaire (alimente l'allowlist via trigger)"
```

---

### Task 7 : Facturation → « Gratuit pendant la bêta »

**Files:**
- Modify: `index.html:49374-49391` (bloc `billing`, affichage seul)

- [ ] **Step 1 : Remplacer le calcul + encart chiffré** par un encart neutre. Remplacer le bloc `const billing = '...'` (et le calcul `writePartners/billed/cost/meterPct` s'il n'est plus utilisé ailleurs — vérifier) par :

```javascript
  const partners = members.filter(m => !m.isOwner);
  const writePartners = partners.filter(m => (m.grants || []).some(g => g.mode === 'ecriture')).length;
  const billing = '<div style="background:var(--sur2,rgba(16,185,129,.08));border:1px solid rgba(16,185,129,.25);border-radius:var(--rl);padding:14px 16px;margin-bottom:16px">'
    + '<div style="font-weight:700;color:var(--t1);font-size:13.5px">🎁 Gratuit pendant la bêta</div>'
    + '<div class="sm mu" style="margin-top:3px">Invitations illimitées — lecture et écriture offertes. '
    +   writePartners + ' partenaire' + (writePartners > 1 ? 's' : '') + ' en écriture actuellement.</div>'
    + '</div>';
```

- [ ] **Step 2 : Vérifier qu'aucune référence morte** — Run: `grep -n "PARTAGE_ADDON" index.html`. S'il ne reste QUE la définition de la constante (plus d'usage), la laisser (inoffensive) ou la commenter. Aucune autre régression.

- [ ] **Step 3 : Vérif + commit**

Run: `node scripts/check-inline-js.mjs` → `5 | errors : 0`.
```bash
git add index.html
git commit -m "Beta onboarding : encart facturation -> Gratuit pendant la beta"
```

---

### Task 8 : Débrider le formulaire d'inscription (front-door)

**Files:**
- Modify: `js/app/supabase-entry.js:687-692` (handler `#imsb-signup`) + réutilise le rendu form de `acceptInviteFlow`

> Réutilise les composants d'auth existants (`.imsb-*`, form email+mdp) → **pas de nouveau design** (même langage visuel que login/invite). Une bascule « mode inscription » du panneau `#imsb-left`.

- [ ] **Step 1 : Remplacer le handler informatif** par une bascule vers un formulaire d'inscription (email + mot de passe ≥ 6). Au submit : `api.signUpEmail(email, pass)` → si erreur renvoyée par le hook (message 403 « pas encore autorisé ») l'afficher tel quel via `showError` ; si succès → `api.loginEmail(email, pass)` → l'app boote (espace vide auto). Réutiliser le markup du formulaire d'invitation (`acceptInviteFlow`, ~L349-376) comme gabarit (DRY).

- [ ] **Step 2 : Vérif** — Run: `node scripts/check-inline-js.mjs` → `5 | errors : 0`. Vérifier qu'aucun autre appelant du message « inscription arrive bientôt » ne subsiste : `grep -n "arrive bientôt" js/app/supabase-entry.js` → 0.

- [ ] **Step 3 : Commit**

```bash
git add js/app/supabase-entry.js
git commit -m "Beta onboarding : formulaire d'inscription debride (gate = hook cote serveur)"
```

---

## PHASE C — Écran admin bêta (NOUVELLE UI → mockup-first)

### Task 9 : Mockup écran « Gérer les accès bêta » + validation utilisateur (CHECKPOINT)

**Files:**
- Create: `mockups/beta-admin/index.html`

- [ ] **Step 1 : Construire le mockup** (charte Propryo, tokens, 3 formats PC/tablette/mobile + post-clic) : carte Réglages « 🎫 Accès bêta » — liste des emails autorisés (email · source admin/invitation · statut inscrit ✓/en attente) + champ « ajouter un email » + bouton retirer + état vide. Déployer sur github.io (`mockups/beta-admin/`, `git add -f`).

- [ ] **Step 2 : VALIDATION UTILISATEUR** — donner le lien `https://dkeller-app.github.io/immotrack/mockups/beta-admin/`. **Ne pas coder l'écran tant que l'utilisateur n'a pas validé.** (Règle mockup-first non négociable.)

---

### Task 10 : Implémenter l'écran admin (après validation du mockup)

**Files:**
- Modify: `index.html` (nouvelle carte Réglages `rParamsBetaAdmin`, gardée par `window.__immoIsAdmin`, appelée depuis le rendu Réglages ; utilise `window.__immoAdmin`)

- [ ] **Step 1 : Écran + gating** — Ajouter `rParamsBetaAdmin()` (calqué sur `rParamsPartage`) : n'affiche la carte que si `window.__immoIsAdmin === true`. Liste via `__immoAdmin.listAllowlist()`, ajoute via `addEmail`, retire via `removeEmail`, rafraîchit. Rendre selon le mockup validé.
- [ ] **Step 2 : Point d'entrée** — brancher `rParamsBetaAdmin()` dans le rendu de la page Réglages (à côté de la carte Partage), masqué pour les non-admins.
- [ ] **Step 3 : Vérif** — `node scripts/check-inline-js.mjs` → `5 | errors : 0`. Tester : compte admin voit la carte ; compte non-admin ne la voit pas (et la RLS refuse même si l'UI était forcée).
- [ ] **Step 4 : Commit**

```bash
git add index.html
git commit -m "Beta onboarding : ecran admin 'Gerer les acces beta' (gate __immoIsAdmin + RLS)"
```

---

## PHASE D — Livraison

### Task 11 : Bump + vérification finale + audit + push

- [ ] **Step 1 : Bump version** — repérer `IMMOTRACK_VERSION` courant, bumper +1 sur les 4 occurrences `index.html` + `sw.js` CACHE_VER (`sed 's/15\.OLD/15.NEW/g'`). Vérifier `grep -c "15\.NEW" index.html` = 4.
- [ ] **Step 2 : Vérif** — `node scripts/check-inline-js.mjs` → `5 | errors : 0` ; `npx vitest run` → suite verte (3 échecs pré-existants `legal-2044`×2 + `bank-import` hors périmètre).
- [ ] **Step 3 : AUDIT `superpowers:code-reviewer` OBLIGATOIRE** (auth/sécurité) sur le diff complet : hook (refus correct, pas de faille d'échappement email, `security definer`+search_path), RLS `beta_allowlist`/`app_admins` (un testeur ne lit/écrit pas l'allowlist ; non-admin ne voit pas l'écran ET la table refuse), trigger invitation→allowlist (SECURITY DEFINER, pas d'escalade), formulaire signup (message d'erreur du hook bien affiché, pas de contournement), aucune régression du flux d'invitation existant. Corriger jusqu'à PASS.
- [ ] **Step 4 : Intégration** — commit bump, rebase sur `origin/main`, push FF (re-bump si collision).
- [ ] **Step 5 : Test utilisateur** (sur l'app déployée) : (a) Didier ajoute un email dans l'écran admin ; (b) ce testeur s'inscrit → OK + espace vide ; (c) un email non autorisé → refusé ; (d) un testeur invite un partenaire (email requis) → le partenaire s'inscrit via le lien → OK.

---

## Self-Review (writing-plans)

- **Couverture spec** : allowlist+hook (T1/T2), super-admin+RLS (T1), trigger invite→allowlist (T1), application+seed (T3), dashboard hook + confirmation D8 (T4), API admin + `__immoIsAdmin` (T5), invite email requis (T6), facturation gratuite (T7), signup débridé (T8), écran admin mockup-first (T9/T10), bump+audit (T11). ✓
- **Placeholders** : `15.OLD/NEW` = paramètres de bump explicités (repérage en Step 1). Le popup d'invitation (T6 Step 2) et le point d'entrée Réglages (T10 Step 2) sont localisés par `grep` car ancres UI non figées — pas un TBD, une instruction de localisation.
- **Cohérence types** : `__immoAdmin.{isAppAdmin,listAllowlist,addEmail,removeEmail}` + `window.__immoIsAdmin` + `is_app_admin()`/`hook_restrict_signup`/`beta_allowlist`/`app_admins` cohérents T1→T11.
- **Sécurité** : hook = `security definer` + grant `supabase_auth_admin` + revoke public ; RLS double-verrou ; `service_role` jamais côté client ; audit obligatoire T11.
