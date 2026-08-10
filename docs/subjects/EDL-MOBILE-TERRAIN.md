# EDL-MOBILE-TERRAIN — EDL sur le terrain (mobile) : autosave, footer, pull-to-refresh, offline

**Status** : ⬜ À faire · **Prio** : **P1 (risque de perte de données en usage réel)** · **Taille** : M-L
**Détecté** : 2026-08-08 (user en conditions réelles, EDL entrée FERRETTE 001 sur iPhone, app github.io v15.494)
**Lié à** : MOBILE-PWA-OFFLINE (offline formel P2) · EDL-AUDIT-CRITIQUE (refonte v14.38-44) · project_hotfix_auth_irl (BUG-AUTH-BOUNCE v15.457) · BUG-LOGIN-DOUBLE (session persistée v15.470)

---

## Constats user (2026-08-08, capture iPhone)

> 💬 « EDL : ne s'enregistre pas tout seul. »
> 💬 « visu téléphone non ok. boutons trop gros prennent toute la place. »
> 💬 « Si scroll (type mise à jour) l'EDL est perdu avec page de connexion. »
> 💬 « Comment faire si pas de réseau pendant un EDL ? »

Contexte terrain : l'EDL se fait DEBOUT, téléphone en main, dans le logement (parfois cave/parking sans réseau). C'est LE cas d'usage mobile n°1 de l'app. Toute perte de saisie en cours d'EDL avec le locataire présent est inacceptable (impact légal + crédibilité).

---

## Diagnostic (ancré code origin/main v15.494)

### 1. Pas d'autosave — l'EDL ne vit qu'en mémoire jusqu'au clic 💾

- Le formulaire EDL = globales mémoire (`_edlP`, `_edlCles`, `_edlCptPhotos`, …), persistées **uniquement** au clic « 💾 Enregistrer » (`saveEDL()`).
- `beforeunload` (index.html:52649) ne sauvegarde qu'en **harnais de test** — en mode cloud, rien.
- Grep `autosave|draft|brouillon` : aucun mécanisme de brouillon EDL n'existe.
- → Tout reload/crash/navigation = saisie en cours perdue intégralement.

### 2. Footer mobile : 4 boutons qui mangent l'écran

- Markup : `#ov-edl .m-foot` = 4 boutons (Annuler · 📥 Télécharger PDF · ☁️ Enregistrer le PDF · 💾 Enregistrer) — index.html:3799-3803.
- CSS mobile (css/main.css:2833-2843) : footer sticky, `Enregistrer` pleine largeur + autres en `flex:1 1 calc(50% - 4px)`. **Mais le rendu réel iPhone montre 3 boutons empilés pleine largeur** → footer + bottom-nav ≈ 40 % du viewport, le formulaire n'a plus de place.
- À investiguer : pourquoi le 50 % ne s'applique pas (breakpoint du @media ? wrap du texte ? Firefox iOS ?) — puis **refonte mockup-first** (règle feedback_mockup_first) : ex. « Enregistrer » seul en primaire + actions secondaires dans un menu ⋯, hauteur compacte.

### 3. Pull-to-refresh = perte totale + page de connexion

- **Aucune règle `overscroll-behavior`** dans index.html/css → sur mobile, tirer la page vers le bas (geste natif) **recharge l'app** → point 1 : l'EDL en mémoire est perdu.
- En plus, le reload retombe sur la **page de connexion** alors que la session est persistée depuis v15.470 (`persistSession:true`, `storageKey` déterministe, supabase-entry.js:154). À reproduire et élucider : Firefox iOS (capture) ? reload pendant `controllerchange` SW (index.html:52736) ? localStorage partitionné/nettoyé par iOS ?
- Fix évident côté geste : `overscroll-behavior-y: none` (ou `contain`) sur `html/body` + sur la modale EDL scrollable — le pull-to-refresh n'a aucun sens dans une app-formulaire. Mais l'autosave (point 1) reste la vraie ceinture de sécurité.

### 4. Offline pendant un EDL : aujourd'hui ça tient TANT QU'ON NE FERME PAS

État actuel réel :
- `sw.js` = network-first avec fallback cache → le **shell** de l'app peut se charger offline (si déjà visité).
- Mode cloud : données en mémoire + Supabase. `store-sync.js` a un **retry backoff** (2 s → 60 s) sur les écritures échouées — **en mémoire seulement, pas de queue persistée**.
- Donc : offline en cours d'EDL → on peut continuer à saisir et « Enregistrer » (DB mémoire), le push Supabase sera retenté au retour du réseau **si l'onglet reste ouvert**. Fermeture/reload avant retour réseau = modifs perdues.
- Réponse courte à donner au user en attendant le chantier : **ne pas fermer l'onglet, ne pas recharger ; au retour du réseau la sync repart seule**. Fragile → à formaliser.
- Chevauche MOBILE-PWA-OFFLINE Phase 1 (queue de sync explicite + indicateur online/offline) : le volet « écritures persistées offline » devient prioritaire pour l'EDL.

---

## Plan proposé (à valider)

### Phase 1 — Blindage anti-perte (P0 du sujet, S-M)
- [ ] **Draft EDL persistant** : snapshot throttlé de l'état EDL (`_edlP`/`_edlCles`/`_edlCptPhotos`/champs formulaire) vers IndexedDB/localStorage à chaque modification (input/photo/état). Clé par EDL (id ou logement+type).
- [ ] **Restauration** : à l'ouverture de l'app / de la modale, si draft plus récent que la DB → bandeau « Reprendre l'EDL en cours ? » (reprend ou jette, jamais silencieux).
- [ ] **`overscroll-behavior-y: none`** sur html/body + conteneur scrollable de `#ov-edl` → plus de reload par pull-to-refresh.
- [ ] Purge du draft après `saveEDL()` réussi + push sync OK.

### Phase 2 — Footer mobile compact (S, mockup-first)
- [ ] Repro + cause du rendu empilé pleine largeur (breakpoint/Firefox iOS).
- [ ] Mockups A/B/C × 3 formats (règle) : primaire « 💾 Enregistrer » + secondaires repliées (menu ⋯ ou icônes), hauteur cible ≤ 60 px + bottom-nav masquée quand modale EDL ouverte ?
- [ ] Validation user AVANT code.

### Phase 3 — Offline formel EDL (M, coordonné avec MOBILE-PWA-OFFLINE)
- [ ] Indicateur online/offline visible dans la modale EDL (« hors ligne — saisie conservée sur l'appareil »).
- [ ] Queue d'écritures persistée (survit au reload) ou, a minima, le draft Phase 1 comme filet + re-push au boot.
- [ ] Photos offline : vérifier le chemin IndexedDB photos sans réseau (upload différé).

### Investigation parallèle — page de connexion après reload
- [ ] Repro sur l'iPhone du user (navigateur exact — capture = Firefox iOS ?), logs console au boot.
- [ ] Vérifier `currentUser()` au boot vs storageKey présent ; interaction SW `controllerchange` reload.
- [ ] Si session réellement perdue sur iOS : sujet dédié (P1 — le même reload qui perd l'EDL fait re-loguer).

---

### Complément constats (2026-08-08 après-midi — contexte PANNE Supabase, cf P0-SUPABASE-PAUSE)

5. **« Si déconnexion on perd tout »** — confirmé et aggravé par la panne : la page de connexion vue après le pull-to-refresh du matin était probablement DÉJÀ la panne Supabase (session impossible à rafraîchir → écran login). Le draft persistant Phase 1 doit survivre AUSSI à un état déconnecté : le brouillon se stocke sur l'appareil AVANT toute considération de session/cloud, et se restaure après re-login.
6. **« Photos prises non enregistrées sur le téléphone ! il faut une possibilité de faire ça »** — demande explicite : les photos EDL prises via l'app doivent pouvoir être conservées côté téléphone. Options à trancher en design Phase 1/3 : (a) input capture natif = la photo passe par l'app SANS entrer dans la pellicule (comportement iOS standard) → proposer un bouton « Enregistrer sur l'appareil » (Web Share API / téléchargement) par photo ou par EDL ; (b) a minima les photos restent en IndexedDB local (déjà le cas une fois reçues par l'app) et l'écran doit le DIRE (« conservée sur l'appareil, envoi cloud en attente »).

## Notes utilisateur

> 💬 2026-08-08 matin : « EDL : ne s'enregistre pas tout seul. visu téléphone non ok. boutons trop gros prennent toute la place. Si scroll (type mise à jour) l'EDL est perdu avec page de connexion. Comment faire si pas de réseau pendant un EDL ? »
> 💬 2026-08-08 après-midi : « EDL : ne s'enregistre pas tout seul. si déconnexion on perd tout ! photos prises non enregistrées sur le téléphone ! il faut une possibilité de faire ça. […] EDL pas dispo sur compte de Marion alors que c'est partagé ! » (⚠ le point Marion est à RE-TESTER après restauration Supabase — peut être un symptôme de la panne, sinon ouvrir un bug partage dédié)

## Journal

- 2026-08-08 : créé après remontée user en conditions réelles (EDL FERRETTE 001 sur iPhone). Diagnostic 4 points ancré dans origin/main v15.494 (pas d'autosave · CSS footer 2833 · zéro overscroll-behavior · retry sync non persisté). Plan 3 phases + 1 investigation session. Aucun code touché.
- 2026-08-08 (suite) : 2 constats ajoutés (draft doit survivre à la déconnexion · sauvegarde des photos sur le téléphone = exigence explicite). Découverte majeure : la « page de connexion » et les erreurs du jour = **panne Supabase projet en pause** ([P0-SUPABASE-PAUSE](P0-SUPABASE-PAUSE.md)) — l'investigation « login après reload » reste ouverte mais devra être re-testée APRÈS restauration du projet.
