# Chantier 1 — CONNEXION (cutover Supabase) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Étapes en `- [ ]`.

**Goal:** Rendre l'app cloud-only (Supabase seule persistance), débrancher Google Drive (données Drive intactes), redemander le mdp à chaque chargement, rebrand Propryo complet, menu Compte+Déconnexion (variante A), retrait du bandeau bleu.

**Architecture:** Spec `docs/superpowers/specs/2026-06-22-connexion-cutover-design.md`. 5 lots indépendants/testables. Lot C est **entry-only** (`js/app/supabase-entry.js`, hors `index.html` contendu) → exécuté en premier. Lots A/B/D/E touchent `index.html` → **protocole file d'attente** (`docs/INDEX-COMMIT-PROTOCOL.md`) + bump version (5 emplacements : `<title>` ~l.6, `<em>` footer ~l.69, footer legacy ~3812, `IMMOTRACK_VERSION` ~3880, `sw.js` CACHE_VER).

**Tech Stack:** vanilla JS, Supabase (@supabase/supabase-js via CDN), Vitest, `check-inline-js.mjs`.

**Ordre :** C (entry, sûr) → E-rebrand (cosmétique) → D (menu Compte) → A (cloud-only, le gros) → B (Drive mort après A). Banner bleu retiré dans E.

---

### Task C1 : persistSession:false (re-saisie mdp à chaque chargement)

**Files:** Modify `js/app/supabase-entry.js` (~l.89-95, `createClient(... auth:{...})`)

- [ ] **Step 1 — Modifier la config auth**
Remplacer `persistSession: true` par `persistSession: false` et retirer `storage` (inutile sans persistance). Garder `autoRefreshToken: true`, `detectSessionInUrl` (défaut true, requis pour SSO/reset/invite).
```js
auth: { persistSession: false, autoRefreshToken: true },
```
Mettre à jour le commentaire au-dessus (la session ne survit plus au rechargement → mdp redemandé ; le SSO/reset/invite établissent la session en mémoire pour le chargement courant).

- [ ] **Step 2 — Vérifier syntaxe** : `node --check js/app/supabase-entry.js` → OK.
- [ ] **Step 3 — Vitest** : `npx vitest run` → pas de régression côté Store (entry non couvert par les tests, mais aucune régression attendue).
- [ ] **Step 4 — Commit** : `git commit -m "Connexion C1 : persistSession:false (re-saisie mdp à chaque chargement)"`
- [ ] **Step 5 — Test user** : déployer, se reconnecter (mdp redemandé), recharger (re-login), vérifier hydrate OK. Filet : `immo_use_supabase=0` existe encore (jusqu'au lot A) si problème.

### Task C2 : nettoyer la copy du login (mentions Drive / bac à sable)

**Files:** Modify `js/app/supabase-entry.js` (`renderProof` ~l.495-518, `brand`/notes, flux `?sandbox=1`)

- [ ] **Step 1 — Auditer les appelants du flux sandbox**
`grep -nE "sandbox|renderProof|immo_fullapp_once|bac à sable" js/app/supabase-entry.js` → lister ce qui rend `renderProof` et si ce chemin est atteignable en mode cloud réel.
- [ ] **Step 2 — Retirer/nettoyer**
Si `renderProof` (écran « Voir dans l'app », mentions « bac à sable ISOLÉ », « ton appli de tous les jours (Drive) ») n'est plus pertinent en cloud-only : le supprimer + son câblage (`?sandbox=1`, `immo_fullapp_once`). Sinon, réécrire la copy sans aucune mention Drive/test.
- [ ] **Step 3 — node --check** → OK.
- [ ] **Step 4 — Commit** : `git commit -m "Connexion C2 : nettoyage copy login (retrait mentions Drive/sandbox)"`

### Task E1 : rebrand Propryo (index.html + sw.js) [FILE D'ATTENTE index.html + bump]

**Files:** Modify `index.html` (`<title>` ~l.6, logo sidebar ~l.65-69, modales, footer), `sw.js`

- [ ] **Step 1 — Recenser** : `grep -nc "ImmoTrack" index.html sw.js` ; lister les occurrences VISIBLES (titre, logo, en-têtes, footer, modales, libellés UI).
- [ ] **Step 2 — Remplacer** « ImmoTrack » → « Propryo » dans le visible (title, logo wordmark, footer, modales, ~80 libellés). Logo = pavé encre + point corail + Schibsted Grotesk (réutiliser le SVG de `brand()` de l'entry).
- [ ] **Step 3 — sw.js** : renommer le nom de cache + branding PWA → Propryo. Bumper `CACHE_VER`.
- [ ] **Step 4 — Bump version** (5 emplacements) + `check-inline-js` → `5 | errors : 0`.
- [ ] **Step 5 — File d'attente** : s'inscrire dans `.index-queue/QUEUE.md`, laisser le maître intégrer. Commit `Connexion E1 : rebrand Propryo complet (index.html + sw.js) v15.x`.

### Task E2 : retirer le bandeau bleu

**Files:** Modify `js/app/supabase-entry.js` (`_showUpdateBanner` ~l.544-561, `injectSyncBanner` ~l.563-590 + appelants)

- [ ] **Step 1 — Retirer `injectSyncBanner`** (legacy, déjà commenté) + son CSS + tout appel résiduel.
- [ ] **Step 2 — Retirer `_showUpdateBanner`** (bandeau bleu « un autre appareil a modifié ») + ses appels. La synchro Realtime reste (le canal continue d'émettre) mais SANS bandeau bleu ; si un signal visuel est souhaité plus tard → pastille charte (hors scope ici).
- [ ] **Step 3 — node --check** + Vitest → OK.
- [ ] **Step 4 — Commit** : `git commit -m "Connexion E2 : retrait du bandeau bleu (sync/update)"`

### Task D1 : menu Compte + Déconnexion (variante A) [FILE D'ATTENTE index.html + bump]

**Files:** Modify `index.html` (`_renderSidebarUserFooter` ~l.7629-7644, `_appUserName` ~l.7605-7624), `js/app/supabase-entry.js` (exposer hook logout)

- [ ] **Step 1 — Exposer un hook de déconnexion** (entry) : `window.__immoLogout = async () => { await api.logout(); location.reload() }` (après le wiring de `api`).
- [ ] **Step 2 — Enrichir le pied sidebar** (`_renderSidebarUserFooter`) : bloc compte cliquable → popover remontant (charte Propryo, cf mockup `mockups/connexion-cutover/` variante A) avec : nom (`_appUserName`), email + espace actif (`window.__immoCloudInfo`), « Paramètres » → `go('params')`, toggle Thème, « Se déconnecter » (rouge) → `window.__immoLogout()`.
- [ ] **Step 3 — Mobile** : bottom-sheet (sidebar masquée) ; fermeture clic-extérieur + Échap ; focus accessible.
- [ ] **Step 4 — Bump version** + `check-inline-js` (5|0) + responsive (PC/tablette/téléphone).
- [ ] **Step 5 — File d'attente** + commit `Connexion D1 : menu Compte + Déconnexion (variante A) v15.x`.

### Task A1 : cloud-only — forcer le mode cloud au boot [FILE D'ATTENTE index.html + bump]

**Files:** Modify `index.html` (boot ~l.36-39, `_immoCloudActive`, `_cloudModeRollback` ~l.6092-6119)

- [ ] **Step 1 — Boot** : retirer la branche legacy + le flag `immo_use_supabase` / `?supabase=` (~l.36-39). Le boot charge TOUJOURS le cloud (entry).
- [ ] **Step 2 — `_immoCloudActive()`** : faire renvoyer `true` constant (étape transitoire : on ne supprime pas encore les sites appelants).
- [ ] **Step 3 — Retirer** `_cloudModeRollback` + boutons « Revenir au mode local » (~l.6092-6119).
- [ ] **Step 4 — node --check / check-inline-js / Vitest** → OK. Bump version.
- [ ] **Step 5 — Audit `code-reviewer`** (transverse) AVANT prêt. File d'attente + commit `Connexion A1 : boot cloud-only (retrait flag + rollback) v15.x`.

### Task A2 : cloud-only — retirer les bras legacy aux sites `_immoCloudActive()` [FILE D'ATTENTE index.html + bump]

**Files:** Modify `index.html` (20+ sites)

- [ ] **Step 1 — Recenser** : `grep -n "_immoCloudActive" index.html` → liste exhaustive des sites.
- [ ] **Step 2 — Par groupe de sites** : retirer le bras `!_immoCloudActive()` (legacy/Drive), garder le bras cloud. Procéder par petits groupes (ouverture PDF bail/EDL, upload pièces jointes, photos…), vérifier après chaque groupe.
- [ ] **Step 3 — Après chaque groupe** : node --check / check-inline-js / Vitest ; commit `Connexion A2 : retrait bras legacy (<groupe>) vX`.
- [ ] **Step 4 — Quand tous les sites sont cloud-only** : supprimer `_immoCloudActive` (devenu inutile) ou le garder comme `()=>true` documenté.
- [ ] **Step 5 — Audit `code-reviewer`** final du retrait transverse. File d'attente pour chaque commit.

### Task B1 : débrancher Google Drive (UI + OAuth + code) [FILE D'ATTENTE index.html + bump]

**Files:** Modify `index.html` (refs Drive du map), retirer scripts CDN GSI/gapi

- [ ] **Step 1 — Retirer l'UI Drive** : `#readonly-banner` (~l.56-60), `#drive-fab` + `_updateDriveFab` (~l.1335-1337, ~48961), modale `#ov-drive-connect` + `connectDrive` (~l.3716-3806, ~48880), section Réglages « Stockage Drive » (~l.1091-1132), export/import Drive (~l.1190-1194), lien DPA Drive (~l.1210), EDL→Drive `uploadEDLPDFToDrive` (~l.3702, 27227-28).
- [ ] **Step 2 — Retirer OAuth/GIS** : init `google.accounts.oauth2` (~48793), `requestAccessToken` (~48895), Picker `gapi.load` (~50858), scripts CDN GSI/gapi (~50844).
- [ ] **Step 3 — Grep des appelants** avant chaque suppression de fonction de sync Drive (`_drv*`, `connectDrive`, `_driveTokenValid`…) → supprimer le code mort une fois les appelants partis.
- [ ] **Step 4 — node --check / check-inline-js / Vitest** + bump. Vérifier : aucune trace Drive dans l'UI, app cloud fonctionne.
- [ ] **Step 5 — Audit `code-reviewer`**. File d'attente + commit `Connexion B1 : débranchement Google Drive vX`.

---

## Self-review
- **Couverture spec** : D1→D6 couverts (D1 Drive=B1, D2 persistSession=C1, D3 rebrand=E1, D4 menu A=D1, D5 bandeau=E2, D6 thème clair=déjà défaut, conservé). ✓
- **Ancres auth** préservées (C1/C2 ne touchent pas `#imsb-form`/`acceptInviteFlow`). ✓
- **176 photos EDL** : conséquence documentée dans la spec (hors scope re-migration). ✓
- **index.html contendu** : tous les lots index.html passent par la file d'attente + bump. ✓
- **Audit code-reviewer** : prévu sur A (transverse) et B. ✓
- **Ordre** : C d'abord (sûr, entry-only) ; B après A (Drive mort une fois cloud-only). ✓
