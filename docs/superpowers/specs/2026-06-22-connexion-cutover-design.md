# Chantier 1 — CONNEXION (cutover Supabase propre) — design

> **Statut : DESIGN validé sur mockup.** Mockup `mockups/connexion-cutover/` (charte Propryo, variante A retenue,
> thème Clair par défaut). Lié à `project_cloud_cutover_finition` (Chantier 1), `project_persistance_multitenant`.
> Date : 2026-06-22.

## Objectif
Finir proprement la bascule sur Supabase côté **connexion / coque d'app** : l'app devient **cloud-only** (Supabase
= seule persistance), la connexion Google **Drive est débranchée**, le mot de passe est **redemandé à chaque
ouverture**, la marque devient **Propryo**, et la **déconnexion** devient explicite via un menu Compte.

## Décisions validées (mockup + user)
| # | Décision | Détail |
|---|----------|--------|
| D1 | **Débrancher Drive entièrement** | Retirer toute la connexion + l'UI + le code Drive. **Les données sur Google Drive ne sont PAS supprimées** — l'app cesse seulement de s'y connecter. |
| D2 | **Re-saisie mdp à chaque chargement** | Pas de session persistante (`persistSession:false`). Conséquence acceptée : le bouton Retour ramène au login. |
| D3 | **Rebrand Propryo COMPLET** | Tout le visible : `<title>`, logo barre latérale, modales, pied, sw.js (PWA), + les ~80 mentions texte « ImmoTrack ». |
| D4 | **Menu Compte — variante A** | Dans le **pied de la barre latérale** (là où le compte vit déjà), popover remontant : nom, email, **espace actif**, Paramètres, Thème, **Se déconnecter** (rouge). Mobile = bottom-sheet. |
| D5 | **Retirer le bandeau bleu** | Supprimer `injectSyncBanner` (legacy, déjà off) + `_showUpdateBanner` (« un autre appareil a modifié »). |
| D6 | **Thème par défaut Clair** | Conserve le toggle Clair/Sombre persistant (charte). |

## Architecture : dual-mode → cloud-only (le cœur du chantier)
Aujourd'hui l'app est **bi-mode** : un flag `immo_use_supabase` (+ `?supabase=`) choisit au boot entre **legacy
(Drive/localStorage)** et **cloud (Supabase)** ([index.html:36-39]). Le branchement `_immoCloudActive()` est testé
à **20+ sites** (chaque site a un bras Drive et un bras cloud : ouverture PDF bail/EDL, upload pièces jointes,
photos, etc.). Cible = **cloud-only** : `_immoCloudActive()` devient toujours vrai (ou disparaît), le bras legacy
de chaque site est retiré, le boot legacy + l'échappatoire « Revenir au mode local » (`_cloudModeRollback`,
[index.html:6092-6119]) sont supprimés. **C'est le gros du travail** (pas l'écran de login, qui est déjà fait).

> ⚠️ La page de connexion réelle est **déjà** la landing Propryo plein écran (`js/app/supabase-entry.js`,
> `injectOverlay`/`brand`). Le « chantier login » se réduit à **nettoyer la copy** (mentions Drive / « bac à
> sable / test ») et retirer le flux sandbox (`renderProof`, `?sandbox=1`, `immo_fullapp_once`).

## Décomposition en lots (ordre conseillé)
Chaque lot = livrable testable indépendant. Les lots touchant `index.html` passent par le **protocole de file
d'attente** (`docs/INDEX-COMMIT-PROTOCOL.md`) + bump de version (5 emplacements).

### Lot A — Cloud-only (retrait du bi-mode + bras legacy)
- Boot : forcer cloud, retirer la branche legacy + le flag `immo_use_supabase` ([index.html:36-39]) et
  `?supabase=`. `_immoCloudActive()` → constante vraie, puis supprimer les bras `!_immoCloudActive()` aux 20+ sites.
- Retirer `_cloudModeRollback` + boutons « Revenir au mode local » ([index.html:6092-6119], entry `injectSyncBanner`).
- **Risque principal** : un bras legacy retiré ne doit pas casser le bras cloud (qui reste). Site par site, test après.

### Lot B — Débrancher Drive (UI + OAuth + code)
Retirer (références du map d'exploration) :
- `#readonly-banner` (offline Drive) [index.html:56-60] ; `#drive-fab` [1335-1337] + `_updateDriveFab` [~48961].
- Modale `#ov-drive-connect` [3716-3806] + `connectDrive()` [~48880].
- Section Réglages « Stockage Drive » [1091-1132] ; export/import Drive [1190-1194] ; lien DPA Drive [1210].
- EDL → Drive : `uploadEDLPDFToDrive` / bouton [3702, 27227-27228] (cloud génère déjà via Storage).
- OAuth/GIS : init `google.accounts.oauth2` [~48793], `requestAccessToken` [~48895], Picker `gapi.load` [~50858],
  scripts CDN GSI/gapi [~50844].
- Nettoyer les fonctions de sync Drive devenues mortes une fois les appelants retirés.

### Lot C — Connexion : re-saisie + nettoyage copy
- `persistSession:false` ([supabase-entry.js:94]) → mdp redemandé à chaque chargement.
- Retirer le flux sandbox : `renderProof` (« bac à sable / Drive pas touché » [505-518]), `?sandbox=1`,
  `immo_fullapp_once`. Nettoyer toute mention « Drive » / « test » dans la copy du login.
- ⚠️ **Le Google SSO de connexion** (`loginGoogle`, Supabase auth) est **distinct de Google Drive** : il reste
  tel quel (c'est une méthode d'auth, pas la connexion Drive qu'on débranche). Vérifier qu'il fonctionne avec
  `persistSession:false` (la session post-redirect est établie en mémoire pour le chargement courant).

### Lot D — Menu Compte / Déconnexion (variante A)
- Enrichir le pied sidebar `_renderSidebarUserFooter` ([index.html:~7629-7644]) : bloc compte cliquable →
  popover remontant (nom, email, **espace actif** via `window.__immoCloudInfo`, Paramètres → `go('params')`,
  Thème, **Se déconnecter**). Mobile : bottom-sheet (sidebar masquée).
- **Déconnexion** : exposer un hook (ex. `window.__immoLogout`) câblé sur `api.logout()` (entry) + `location.reload()`.
- Fermeture au clic extérieur ; accessible (focus, Échap).

### Lot E — Rebrand Propryo complet + retrait bandeau bleu
- `<title>` [6], logo sidebar [65-69], modales, pied legacy, **sw.js** (nom de cache/branding PWA), ~80 mentions
  texte « ImmoTrack » → « Propryo ». Logo = pavé encre + point corail + wordmark Schibsted Grotesk (déjà dans `brand()`).
- Retirer `_showUpdateBanner` (bandeau bleu Realtime) [entry:544-561] — la synchro live reste, sans bandeau bleu
  (ou remplacée par une pastille discrète charte si besoin, à trancher au lot ; par défaut : suppression simple).

## Le cas des 176 photos EDL Drive-only
Après débranchement, les **176 photos EDL qui n'existaient QUE sur Drive** ne s'affichent plus dans l'app (elles
**restent sur le Drive** de l'utilisateur, non supprimées). Décision user : acceptable. Re-importation vers
Supabase Storage = **chantier séparé** (non couvert ici). Les EDL eux-mêmes (4 lignes) + les 60 fichiers déjà dans
Storage restent intacts.

## Ancres à préserver (ne pas casser)
- Auth : `#imsb-left`, formulaire `#imsb-form` (`#imsb-email`/`#imsb-pass`/`#imsb-submit`/`#imsb-error`/`#imsb-forgot`),
  `wireLoginForm`, flux `acceptInviteFlow` (invitations partage SCI).
- Store/Supabase : tout le pipeline `supabase-boot`/`supabase-entry`/store (intact ; seul `persistSession` change).
- Le partage SCI (multi-espace livré) ne doit pas régresser (le menu Compte affiche l'espace actif).

## Contraintes
- **`index.html` est contendu** (sessions parallèles) → lots A/B/D/E via file d'attente + bump version.
- **Non-régression cloud** : chaque retrait d'un bras legacy doit laisser le bras cloud strictement intact.
- **Responsive** (PC/tablette/téléphone) + a11y pour le menu Compte (règle projet).
- **Audit `code-reviewer`** des lots sensibles (retrait bi-mode = transverse) avant « prêt ».

## Risques
- Retrait du bi-mode = chirurgie large sur `index.html` : risque de casser un chemin cloud en retirant un bras
  legacy. Mitigation : lot A site-par-site, vérif après chaque groupe.
- Débranchement Drive : des fonctions de sync peuvent rester appelées ailleurs → grep des appelants avant retrait.
- `persistSession:false` : vérifier que le rechargement post-login (hydrate) et le flux invitation marchent encore.

## Hors scope
- Re-migration des 176 photos EDL Drive→Storage (chantier séparé).
- Chantier 3 SAUVEGARDE (export / rétention preuves légales).
- Re-skin complet des thèmes de l'app sur la charte (mentionné dans `charte-graphique-propryo.md` étape 2 — séparé).

## Vérification
- Vitest (suite complète) verte ; `check-inline-js` (5 | errors:0).
- Manuel : login (mdp redemandé), aucune trace Drive dans l'UI, menu Compte A (PC + mobile), Déconnexion,
  rebrand visible partout, pas de bandeau bleu.
- Audit `code-reviewer` du lot A (transverse).
