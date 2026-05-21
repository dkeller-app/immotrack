# BUG-MOBILE-MENU-PLUS — Menu "Plus" bottom nav mobile ne fonctionne pas

**Status** : ✅ Livré v15.140 (commit 68b5fa9) · **Prio** : P0 · **Taille** : S (~1-2h fix + investigation)
**Détecté** : 2026-05-18 par utilisateur lors audit mobile v15.73
**Lié à** : MOBILE-AUDIT-ONGLETS Phase 5 polish · BIZPLAN-V2 audit mobile

## Contexte

Sur la version mobile (≤768 px), la bottom nav présente 5 onglets : Accueil / Dashboard / Loyers / Agenda / **Plus** (icône burger ☰).

**Le bouton "Plus" ne déclenche aucune action quand tapoté.** Conséquence : sur les 16 entrées de sidebar desktop (Accueil, Tableau de bord, Logements, Locataires, Loyers, Baux, Agenda, Équipements, Révision IRL, Régularisation, Reçus & Quittances, Assurances, États des lieux, Pilotage, Import-Données, Paramètres, Export), **seules 4 sont accessibles mobile**. 12 fonctions sur 16 deviennent inaccessibles → critique commercial.

## Reproduction

1. Ouvrir ImmoTrack v15.73 sur mobile (390 px iPhone 14)
2. Bottom nav visible avec 5 onglets
3. Tapoter sur "Plus" (5e onglet, icône ☰)
4. **Observé** : rien ne se passe
5. **Attendu** : drawer / panel s'ouvre listant les 12 autres fonctions

## Hypothèses techniques

- (a) Event handler `onclick` non câblé sur le bouton "Plus"
- (b) Drawer existe en DOM mais classe `.hidden` jamais retirée
- (c) Conflit z-index avec la bottom nav qui passe devant
- (d) Le drawer apparaît mais en bas, masqué par la bottom nav (height: 70px) — sans `bottom: 70px` sur le drawer
- (e) Touch event au lieu de click event sur iOS Safari (problème de propagation)

## Spec du fix proposé

### Comportement attendu

- Tap sur "Plus" → **drawer slide-up** depuis le bas
- Hauteur drawer : 60-80vh (laisse voir le contenu derrière en transparence légère)
- Header drawer : titre "Toutes les fonctionnalités" + bouton fermer ✕ à droite
- Grid 2-col d'icônes + labels pour les 12 fonctions :
  - 🏢 Logements
  - 👥 Locataires
  - 📜 Baux
  - ⚡ Équipements
  - 📈 Révision IRL
  - 💧 Régularisation
  - 🧾 Reçus & Quittances
  - 🛡️ Assurances
  - 📋 États des lieux
  - 🎯 Pilotage
  - 📥 Import / Données
  - ⚙️ Paramètres
  - 📤 Export / Sauvegarde
- Tap sur une icône → navigue vers l'onglet correspondant + ferme le drawer
- Backdrop semi-transparent (rgba(0,0,0,0.5)) derrière le drawer
- Tap backdrop = ferme le drawer
- Swipe-down sur le drawer = ferme le drawer
- Bouton "Plus" reste actif visuellement quand drawer ouvert (état "selected")

### Implémentation technique

1. **Audit code actuel** : grep `data-page="plus"` ou ID bouton Plus dans `index.html`
2. Vérifier event handler associé (probable `onclick="go('p-plus')"` cassé OU absent)
3. Soit créer un panel `#ov-mobile-more-drawer` avec 12 entrées en grid
4. Soit réutiliser la sidebar existante en mode "drawer slide-up" (refacto plus propre)
5. Tests :
   - Tap sur "Plus" → drawer s'ouvre
   - Tap sur chaque icône → bonne page chargée + drawer fermé
   - Tap backdrop → drawer fermé
   - Test 320 / 390 / 428 / 768 px

## Effort

- Investigation cause racine : 30 min
- Implémentation drawer 2-col grid : 1 h
- Tests 4 breakpoints + bug fixes : 30 min
- **Total : ~1,5 - 2 h**

## Décisions à prendre

- [ ] Drawer slide-up dédié OU réutilisation sidebar existante en mode slide-up ?
- [ ] Icônes emoji (cohérent style actuel) OU passage à set d'icônes SVG (cohérent shadcn-like) ?
- [ ] Affichage sélecteur profil dashboard (Solo / Premium / Gestionnaire) dans ce drawer aussi → couvre BUG-MOBILE-DASH-PROFILES ?

## Journal

- 2026-05-18 : créé · détecté lors audit mobile v15.73 par utilisateur · fix P0 prioritaire pour Sprint 5 polish mobile
- 2026-05-21 : **livré v15.140** (commit 68b5fa9). Approche retenue = réutilisation de la sidebar existante en overlay slide-up (option « réutilisation sidebar », plus propre qu'un drawer dédié). Le bouton "Plus" (`onclick="toggleSb()"`) appelait déjà `toggleSb` mais sans backdrop l'overlay semblait « ne rien faire ». Fix : nouvelles fonctions `_openMobileMenu()` / `_closeMobileMenu()` (toggleSb délègue) qui ajoutent un backdrop `#sb-backdrop` semi-transparent (tap = ferme), garantissent le rendu de la sidebar V4 (`_renderSidebarV4` si vide), et activent le bouton "Plus". `go()` ferme aussi le backdrop sur mobile. CSS : `#sb-backdrop` z-index 1400 (entre bottom nav 999 et sidebar 1500).
- 2026-05-21 : feedback user « plus en bas fait juste un ombrage gris mais rien de plus » → la sidebar restait invisible derrière le backdrop. **Fix v15.141** (commit 8b50617) après diagnostic via preview Chromium 375px : (1) `transform: translate3d(0,0,0) !important` sur `.sb-nav.open` = force une couche de compositing GPU (corrige le bug iOS Safari où un `position:fixed` ne se repeint pas après changement de classe) + `!important` défait toute règle CSS cache concurrente ; (2) z-index réaligné bottom nav 999 < backdrop 1900 < sidebar 2000 (la règle V4 `body[data-dash-v4="on"] .sb-nav`, spécificité supérieure, passe 1500→2000 !important). ⚠️ Test device réel iPhone utilisateur à confirmer.
