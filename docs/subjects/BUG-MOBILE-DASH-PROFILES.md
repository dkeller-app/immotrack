# BUG-MOBILE-DASH-PROFILES — Sélecteur profil dashboard inaccessible mobile

**Status** : ✅ Livré v15.140 (commit 68b5fa9) · **Prio** : P0 · **Taille** : XS (~30 min - 1 h fix)
**Détecté** : 2026-05-18 par utilisateur lors audit mobile v15.73
**Lié à** : DASH-PROFILES · MOBILE-AUDIT-ONGLETS Phase 5 polish · BIZPLAN-V2 audit mobile · BUG-MOBILE-MENU-PLUS (potentiellement combiné)

## Contexte

Sur desktop, ImmoTrack v15.73 présente un sélecteur de profil dashboard avec 3 pills :
- **🌱 Solo** : vue 1-écran pour bailleur particulier 1-3 logements
- **🏠 Premium** : vue complète gestionnaire 2-10 logements (par défaut chez utilisateur)
- **🛠️ Gestionnaire** : cockpit conformité pour CGP / SCI multi / pros

**Sur mobile, ce sélecteur n'est PAS VISIBLE.** L'utilisateur reste bloqué sur le profil défini par défaut (Gestionnaire dans le cas de l'utilisateur testant). Conséquence : un Bailleur classique qui ouvre ImmoTrack sur mobile voit le cockpit conformité (climat pluvieux, table pilotage parc, etc.) qui le perd au lieu de l'écran rassurant "Bonjour Didier, X actions en attente".

## Reproduction

1. Ouvrir ImmoTrack v15.73 sur mobile (390 px)
2. Aller sur l'onglet Tableau de bord
3. **Observé** : seul le sélecteur thème (☀️ / 🎨 / 🌙) est visible dans une pill compacte. Les 3 pills Solo/Premium/Gestionnaire sont absentes.
4. **Attendu** : pouvoir switcher entre les 3 profils dashboard mobile aussi (= parité fonctionnelle desktop)

## Hypothèses techniques

- (a) Sélecteur masqué via media query `@media (max-width: 768px) { display: none }` sans fallback
- (b) Sélecteur dans la sidebar gauche (escamotée en burger ☰) mais pas dans le menu Plus
- (c) Sélecteur dans le menu Plus qui ne fonctionne pas (= BUG-MOBILE-MENU-PLUS combiné)

## Spec du fix proposé

### Option A — Sélecteur en pills compactes dans le header (recommandée)

À <428 px : pills compactes 1 lettre dans le header :
```
[S] [P] [G]    (Solo / Premium / Gestionnaire)
```
- Highlight de la pill active (background coloré + icône emoji)
- Position : juste à droite du titre "Tableau de bord" dans le header
- Tap = switche le profil + persiste le choix dans localStorage

### Option B — Sélecteur dans le menu Plus

Ajouter une section "Mode" en haut du drawer "Plus" (cf BUG-MOBILE-MENU-PLUS) avec les 3 boutons radio empilés.

### Option C — Combiner les deux

A pour usage rapide (header), B pour découverte du concept (menu Plus avec descriptions).

### Implémentation technique

1. **Audit code actuel** : grep `data-profile=` ou ID des 3 pills profils dans `index.html`
2. Vérifier media query qui les masque mobile
3. Soit retirer la media query qui les masque (si elles ne sont juste pas pensées mobile)
4. Soit créer une variante mobile compacte (S/P/G)
5. Persistance : localStorage `_dashProfile` (déjà géré desktop a priori)

## Effort

- Investigation cause racine : 15 min
- Implémentation pills compactes mobile : 30 min
- Tests 4 breakpoints + persistance : 15 min
- **Total : ~30 min - 1 h**

## Décisions à prendre

- [ ] Option A (pills header) OU B (drawer Plus) OU C (les deux) ?
- [ ] Mémorisation profil : par device (localStorage) OU par compte utilisateur (Drive) ?
- [ ] Affichage initial nouveau utilisateur : Solo (rassurant) OU Premium (par défaut) ?

## Journal

- 2026-05-18 : créé · détecté lors audit mobile v15.73 par utilisateur · fix P0 prioritaire pour Sprint 5 polish mobile
- 2026-05-21 : 1re tentative v15.139 (pills compactes icônes-only visibles mobile) → a introduit une régression : les pills apparaissaient AUSSI sur la page Accueil (or ce sont des contrôles du Tableau de bord). Feedback user.
- 2026-05-21 : **livré v15.140** (commit 68b5fa9). Décisions tranchées avec l'utilisateur :
  - **Mode "Solo" supprimé** : redondant avec la nouvelle page Accueil (qui EST devenue la vue solo). Migration one-shot `DB.params.dashV4Mode === 'solo' → 'premium'`. Reste 2 pills : Premium / Gestionnaire.
  - **Pills mode = Tableau de bord UNIQUEMENT** (plus sur l'Accueil) : split de `showContextual` en `showMode` (dashboard only) et `showPeriod` (dashboard + accueil, inchangé) dans `_v4SyncTopbarFilters`.
  - **Effet de bord positif** : l'onglet "Tableau de bord" qui était caché de la sidebar en mode Solo (`_showDash`) réapparaît (toujours visible désormais), ce qui résout aussi le point user « je n'ai pas d'onglet tableau de bord dans la sidebar ».
