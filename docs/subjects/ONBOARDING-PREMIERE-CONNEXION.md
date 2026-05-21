# ONBOARDING-PREMIERE-CONNEXION — Accueil + tour guidé (step-by-step et/ou vidéo)

**Status** : ⬜ À faire · **Prio** : P1 (clé adoption V1 commerciale) · **Taille** : M (~5-8h)
**Détecté** : 2026-05-17 (user : « j'ai besoin d'un accueil première connexion pour expliquer les différents onglets et comment ça marche (soit step by step soit vidéo voir les 2 !) »)
**Lié à** : DEMO-DATA-JSON (s'appuie dessus) · USER-PROFILE-FILTERS ✅ v15.04 (setup profil 1ʳᵉ ouverture) · NAV-* (refonte nav) · commercialisation V1

## Justification (4 critères pré-vol)

1. **Cible** : nouveaux utilisateurs (prospects/clients) qui découvrent l'app — réduire le « effet page blanche » + temps avant 1ʳᵉ valeur
2. **Règles** : non bloquant (skippable), rejouable, accessible, responsive 3 formats
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 : « accueil première connexion pour expliquer les onglets et comment ça marche »
   - 💻 Code existant : USER-PROFILE-FILTERS a déjà un setup wizard 1ʳᵉ ouverture (choix profil) → l'onboarding s'enchaîne après
   - 📋 Backlog : nécessaire pour V1 commerciale (un outil de gestion = courbe d'apprentissage à accompagner)
4. **5 vues 360°** : commercial (adoption/rétention) + UX (découverte guidée) + support (moins de questions)

## Objectif

À la **première connexion**, accueillir l'utilisateur et lui expliquer les onglets + le fonctionnement, via **2 modalités complémentaires** (user veut « les 2 ! ») :
1. **Tour guidé step-by-step** (tooltips séquentiels qui pointent chaque onglet/zone)
2. **Vidéo(s)** explicatives (présentation générale + tutos courts par fonction)

## Composants

### A — Écran d'accueil 1ʳᵉ connexion (~1.5h)
- Après le setup profil (USER-PROFILE-FILTERS), un écran de bienvenue :
  - « Bienvenue dans ImmoTrack 👋 »
  - 3 choix : **▶ Tour guidé** · **🎬 Voir la vidéo** · **🧪 Charger des données de démo** (cf DEMO-DATA-JSON) · **Passer**
- Détecté via flag `DB.params.onboardingDone` (ne s'affiche qu'une fois, rejouable depuis l'aide)

### B — Tour guidé step-by-step (~3h)
- Tooltips séquentiels pointant les éléments clés (lib type Shepherd.js / Driver.js, ou maison léger)
- Étapes (adaptées à la nav cible) :
  1. **Barre de contexte** (bulles entités + période) — « filtrez toute l'app par SCI/période »
  2. **Bien** — « vos logements groupés par immeuble »
  3. **Locataires** — « baux, échéances, contact »
  4. **Mouvements** — « loyers + dépenses + import bancaire »
  5. **Communication** — « quittances, IRL, relances »
  6. **Dashboard** — « votre pilotage en un coup d'œil »
- Boutons Suivant/Précédent/Passer, barre de progression
- Rejouable + navigation au clavier (a11y)

### C — Vidéos (~1-2h intégration, hors production vidéo)
- Lecteur vidéo intégré (modal) : 1 vidéo de présentation (2-3 min) + tutos courts par fonction (30-60s)
- Hébergement : YouTube/Vimeo non-listé OU fichiers locaux/Drive
- ⚠️ **Production des vidéos = à faire par l'utilisateur** (script/tournage). Le sujet couvre l'INTÉGRATION du lecteur, pas la création du contenu.
- Centre d'aide : liste des vidéos accessibles à tout moment (pas seulement 1ʳᵉ connexion)

### D — Centre d'aide permanent (~1h)
- Bouton « ? Aide » accessible partout
- Rejouer le tour guidé · revoir les vidéos · FAQ courte
- Lien vers la doc / contact support

## Scope par phases

| Phase | Contenu | Effort |
|---|---|---|
| 1 | Écran accueil 1ʳᵉ connexion + flag onboardingDone | ~1.5h |
| 2 | Tour guidé step-by-step (tooltips séquentiels) | ~3h |
| 3 | Lecteur vidéo intégré + centre d'aide | ~2h |
| 4 | Tests + responsive 3 formats + a11y | ~1h |

## Décisions à arbitrer

- [ ] **D1** : lib tour guidé externe (Shepherd/Driver.js) ou composant maison léger (cohérence design + zéro dépendance) ?
  - → Reco : maison léger (l'app est vanilla, garder la cohérence + pas de dette dépendance)
- [ ] **D2** : vidéos hébergées où (YouTube non-listé / Vimeo / Drive / local) ?
- [ ] **D3** : le tour guidé s'appuie sur les **données démo** (DEMO-DATA-JSON) ou fonctionne sur base vide aussi ?
  - → Reco : proposer « charger démo » au début du tour pour que les écrans soient remplis
- [ ] **D4** : ordre setup → onboarding (profil USER-PROFILE-FILTERS d'abord, puis bienvenue) — confirmer l'enchaînement

## Dépendances

- **DEMO-DATA-JSON** : le tour guidé est bien plus parlant sur des données remplies → faire DEMO-DATA d'abord (ou en parallèle)
- **Refonte NAV** : le tour guidé doit pointer la **nav cible** (Bien/Locataires/Communication…) → idéalement après la refonte nav, sinon re-faire les étapes

## Notes utilisateur

> 💬 2026-05-17 : « j'ai aussi besoin d'un accueil première connexion pour expliquer les différents onglets et comment ça marche (soit step by step soit vidéo voir les 2 !) »

## Journal

- 2026-05-17 : créé · onboarding 1ʳᵉ connexion = écran bienvenue + tour guidé step-by-step (tooltips séquentiels) + vidéos intégrées + centre d'aide permanent · les 2 modalités (step + vidéo) demandées · s'appuie sur DEMO-DATA-JSON · production vidéos = à faire par user (le sujet couvre l'intégration) · idéalement après refonte nav (pointer la nav cible)
