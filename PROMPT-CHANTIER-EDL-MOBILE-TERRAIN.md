# PROMPT CHANTIER — EDL-MOBILE-TERRAIN (P1, anti-perte de données)

> À coller tel quel dans une NOUVELLE session Claude Code ouverte sur `C:\Users\Did_K\Desktop\Immo`.

---

Tu attaques le chantier **EDL-MOBILE-TERRAIN** (P1) : blinder l'état des lieux fait au téléphone sur le terrain contre TOUTE perte de saisie, puis compacter le footer mobile. Le 2026-08-08, le user a perdu le travail d'un EDL réel en cours (pull-to-refresh → reload → page de connexion) — plus jamais ça.

## 0. Setup obligatoire

- **La vraie prod = `origin/main`** (v15.494+). Le clone `Desktop\Immo` est STALE : worktree frais depuis `origin/main` (skill `superpowers:using-git-worktrees`), jamais de push du main local.
- Lis d'abord : `docs/subjects/EDL-MOBILE-TERRAIN.md` (constats user + diagnostic ancré code du 08/08) · `docs/subjects/EDL-AUDIT-CRITIQUE.md` (architecture EDL, refonte v14.38-44 : globales `_edlP`/`_edlCles`/`_edlCptPhotos`, `_edlResetGlobalState`, `edlSnapshot`) · `docs/subjects/MOBILE-PWA-OFFLINE.md` (offline formel P2 — NE PAS l'absorber, juste rester compatible).

## 1. Diagnostic déjà fait (ne pas re-prouver)

1. **Aucun autosave** : l'EDL ouvert vit en mémoire (globales), persisté SEULEMENT au clic 💾 `saveEDL()`. Le `beforeunload` (index.html:52649) ne sauvegarde qu'en harnais de test — inerte en mode cloud. Grep `autosave|draft|brouillon` : rien pour l'EDL.
2. **Aucune règle `overscroll-behavior`** dans l'app → le geste natif « tirer vers le bas » recharge la page → saisie perdue.
3. **Footer EDL mobile** : `#ov-edl .m-foot` (index.html:3799-3803, 4 boutons) + CSS `css/main.css:2833-2843` (Enregistrer pleine largeur + autres 50 %) — **rendu réel iPhone = boutons empilés pleine largeur**, footer + bottom-nav ≈ 40 % du viewport. Cause du non-respect du 50 % à élucider (breakpoint ? wrap ? Firefox iOS ?).
4. **Offline** : sw.js network-first + fallback cache (shell OK offline) ; `store-sync.js` retry backoff EN MÉMOIRE seulement → fermer/recharger avant retour réseau = modifs cloud perdues.
5. Demande explicite user : pouvoir **conserver les photos EDL sur le téléphone** (l'input capture ne passe pas par la pellicule iOS) + statut visible « conservée sur l'appareil, envoi en attente ».

## 2. Périmètre de CETTE session

### Phase 1 — Blindage anti-perte (code, TDD, livrable n°1)
- **Draft EDL persistant** : snapshot de l'état complet du formulaire EDL (globales `_edlP`/`_edlCles`/`_edlCptPhotos` + champs DOM + signatures éventuelles) écrit en **IndexedDB** (pas localStorage : les photos base64 exploseraient le quota) à chaque mutation, throttlé (~2 s). Clé par EDL (id existant ou brouillon-nouveau par logement+type). Réutilise la couche IDB existante des photos (`js/core/attachments.js` / `_photoCache`) — DRY, pas de nouvelle lib.
- **Restauration** : à l'ouverture de la modale EDL (et au boot si un draft « orphelin » existe), si draft plus récent que la version DB → bandeau « ⚠️ Reprendre l'EDL en cours (non enregistré) ? [Reprendre] [Ignorer] » — jamais de restauration silencieuse, jamais de purge silencieuse.
- **Purge du draft** uniquement après `saveEDL()` réussi.
- **`overscroll-behavior-y: none`** sur `html, body` + le conteneur scrollable de `#ov-edl` → tue le pull-to-refresh. Vérifier qu'aucune page de l'app ne dépend de ce geste (il n'y a pas de refresh par geste voulu).
- Le draft doit survivre : reload, fermeture navigateur, déconnexion/re-login, et panne réseau/serveur (il est 100 % local, AVANT toute considération de session).
- **EDL signé** : le draft ne doit JAMAIS contourner le verrou `edlSnapshot`/`signedAt` (lecture seule) — un draft sur EDL verrouillé ne se restaure pas.

### Phase 2 — Footer mobile compact (MOCKUP-FIRST, pas de code UI avant validation)
- Repro + cause du rendu empilé (tester le @media réel, Firefox iOS UA).
- **Mockups A/B/C × PC/tablette/téléphone** (`feedback_mockup_first`) dans `Desktop\Immo\mockups\edl-mobile-footer\` (local, gitignoré, autonome double-clic) : primaire « 💾 Enregistrer » + secondaires repliés (menu ⋯ / icônes), hauteur cible ≤ 60 px, et proposer bottom-nav masquée quand la modale EDL est ouverte. Présenter au user, attendre validation EXPLICITE, coder ensuite seulement.
- Pendant que t'y es : statut de sync visible dans la modale (« 🔌 hors ligne — saisie conservée sur l'appareil » / « ☁️ synchronisé ») — fait partie du mockup.

### Phase 3 (HORS session — ne pas coder) : queue d'écritures persistée + photos offline complètes → chantier MOBILE-PWA-OFFLINE. Contente-toi de ne rien casser pour lui.

### Investigation parallèle (30 min max) — « page de connexion après reload »
La panne Supabase du 08/08 (projet en pause) explique l'épisode du user. MAIS vérifie quand même le chemin nominal : reload avec session persistée valide (`persistSession:true`, storageKey, supabase-entry.js:154) → l'app doit revenir SANS écran de login. Si un vrai bug apparaît (Firefox iOS, SW controllerchange), documente-le dans `docs/subjects/EDL-MOBILE-TERRAIN.md` — fix seulement si trivial, sinon sujet séparé.

## 3. Méthode imposée

- **TDD** (`superpowers:test-driven-development`) : la logique draft (sérialisation état, décision restaurer/ignorer, purge, garde EDL signé) = module pur `js/core/edl-draft.js` testé Vitest (pattern des autres `js/core/*`). Le câblage DOM reste dans index.html.
- **Sandbox-first** (`feedback_sandbox_first`) : ⚠️ `index-test.html` est FIGÉ v15.254 (ne contient pas le code EDL récent) — si le mirror est inapplicable, safety net = tests + audit + smoke déployé (comme les chantiers récents ; le documenter).
- **Wrapper = lire tout le contexte UX** (`feedback_wrapping_context`) : avant de hooker `saveEDL`/`openEditEDL`/`openNewEDL`/`closeM`, relire leurs call sites (reset globales v14.38, lock signé v14.42, `_edlPickPhoto` iOS v14.41).
- **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant « prêt à tester » (données légales EDL = catégorie sensible).
- **`index.html`** : CRLF préservé · bump version 5 spots (title + `<em>` + `IMMOTRACK_VERSION` + récap diag + `sw.js` CACHE_VER) · **jamais de push direct main** → file `C:\Users\Did_K\Desktop\Immo\.index-queue\QUEUE.md` (protocole `docs/INDEX-COMMIT-PROTOCOL.md`). ⚠️ D'autres chantiers (fil-rouge-complet, partage-edl) tournent peut-être en parallèle → la file gère l'ordre.
- **Backlog temps réel** (`feedback_pilotage_realtime`) : jalon livré = `docs/subjects/EDL-MOBILE-TERRAIN.md` + `BACKLOG.md` + commit `Pilotage : …` immédiat.
- Responsive 3 formats + design system + pas de solution passable (règles gravées).

## 4. Definition of done

1. Test : saisir un EDL (pièces + 2 photos + compteurs) → reload sauvage en plein milieu → rouvrir → « Reprendre ? » → TOUT est là (photos incluses).
2. Test : même scénario avec réseau coupé (DevTools offline) → même résultat ; au retour réseau + 💾, l'EDL part au cloud.
3. Pull-to-refresh neutralisé sur mobile (vérifier au vrai geste sur déploiement, pas seulement en emulation).
4. EDL signé : aucun draft ne contourne le verrou.
5. Suite Vitest complète verte (~2180+) · audit code-reviewer SÛR · mockups footer validés par le user AVANT le code Phase 2.
6. Smoke terrain final par le user sur SON iPhone (github.io, cache PWA bumpé).
