# THEME-FANCY — Thèmes "fancy" premium (presets visuels au-delà des couleurs)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (~4-6h + itérations mockups)
**Détecté** : 2026-05-17 (user, retour de Marion : « il faudrait un mode de couleur vraiment fancy fancy ! marion me dit que ce n'est pas assez fancy »)
**Lié à** : système thèmes existant (Paramètres > Thème, 10 vars CSS) · feedback_design_consistency · feedback_mockup_first · dashboard V4 (déjà fonts Inter + JetBrains Mono)

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs — un visuel premium = perception de qualité (clé pour la V1 commerciale + différenciation)
2. **Règles** : design consistency (les thèmes restent cohérents) + mockup-first (proposer des directions AVANT de coder) + lisibilité/a11y préservées
3. **Justifications** :
   - 🧑 Cas user 2026-05-17 (Marion, testeuse) : « ce n'est pas assez fancy »
   - 💻 Code existant : système thèmes = light/dark + 10 color pickers (Paramètres > Thème). Pas de presets premium ni d'effets visuels.
   - 📋 Backlog : V3-VISUEL P2 (cohérence visuelle globale) — ce sujet l'enrichit
4. **5 vues 360°** : commercial (perception qualité = argument de vente) + UX (plaisir d'usage) + technique (presets CSS)

## Constat

Le système de thèmes actuel (`THEME_DEFAULTS` / `THEME_LABELS`, Paramètres > Thème) permet de changer 10 variables CSS une par une (fond, cartes, bordures, textes, accent, succès, erreur, alerte). C'est **fonctionnel mais basique** :
- ❌ Pas de **presets** prêts à l'emploi (l'user doit régler 10 couleurs à la main)
- ❌ Pas d'**effets visuels** (gradients, glassmorphism, ombres profondes, glow)
- ❌ Rendu "plat" → perçu comme "pas fancy"

## Ce que "fancy" peut vouloir dire (à cadrer en mockups)

« Fancy » est subjectif → **mockup-first obligatoire**. Directions à explorer (mockups A/B/C/D) :

| Direction | Caractéristiques | Risque |
|---|---|---|
| **A — Glassmorphism** | cartes en verre dépoli (backdrop-blur), transparences, profondeur | lisibilité sur fond chargé |
| **B — Gradient mesh** | dégradés doux sur headers/hero/KPIs, accents colorés | peut vite faire "too much" |
| **C — Dark premium néon** | fond très sombre + accents glow (néon subtil), contraste élevé | fatigue visuelle si mal dosé |
| **D — Pastel élégant** | palette douce, ombres soft, arrondis généreux, typographie soignée | moins "waouh" mais intemporel |

→ Probablement un **mix** : presets nommés (ex « Émeraude », « Nuit », « Aurore », « Sable ») combinant palette + effets dosés.

## Au-delà des couleurs : les ingrédients du "fancy"

- **Gradients** maîtrisés (hero, boutons primaires, KPIs) — pas partout
- **Ombres douces multi-couches** (profondeur, élévation des cartes)
- **Glassmorphism** ciblé (modales, topbar)
- **Glow/accent lumineux** sur éléments clés (boutons, badges actifs)
- **Micro-animations** (transitions hover, apparition cartes) — déjà partiellement là
- **Typographie** (Inter + JetBrains Mono déjà en place V4) — exploiter les poids/tailles
- **Rayons & espacements** généreux et cohérents

## Scope (proposé)

### Phase 0 — Mockups directions (mockup-first, OBLIGATOIRE) (~itératif)
- Générer 4 directions visuelles (A/B/C/D) en mockups HTML statiques
- × 3 formats (PC / tablette / téléphone)
- Sur les écrans clés : dashboard, fiche bien, liste IRL (avec intercalaires)
- Tester dans un vrai navigateur (pas la zone preview)
- **Validation explicite user + Marion** avant de coder
- Outil possible : skill `theme-factory` pour générer/styliser

### Phase 1 — Presets de thèmes nommés (~2h)
- Étendre `THEME_DEFAULTS` en `THEME_PRESETS` : N presets (palette + effets)
- UI Paramètres > Thème : galerie de presets cliquables (vignettes) + « personnaliser »
- Garder la personnalisation manuelle (10 vars) en mode avancé

### Phase 2 — Couche d'effets visuels (~2-3h)
- Variables CSS pour effets : `--shadow-soft`, `--blur-glass`, `--gradient-hero`, `--glow-accent`
- Appliquer aux composants clés (cartes, hero, boutons, topbar, modales)
- Activables par preset (un preset "plat" reste possible pour les sobres)

### Phase 3 — A11y + perf + responsive (~1h)
- Contraste WCAG AA préservé sur tous les presets (vérif texte/fond)
- `prefers-reduced-motion` respecté (désactive les animations)
- Pas de coût perf (blur/gradients = GPU, mesurer)
- Responsive 3 formats

### Phase 4 — Tests + persistance (~30min)
- Preset persisté localStorage (cohérent avec `immotrack_theme`)
- Tests : application preset, fallback, contraste minimal

## Décisions à arbitrer

- [ ] **D1** : quelle(s) direction(s) retenir après mockups (A/B/C/D ou mix) ?
- [ ] **D2** : combien de presets (3 / 5 / 8) et lesquels ?
- [ ] **D3** : effets activés par défaut ou opt-in (certains users préfèrent sobre) ?
- [ ] **D4** : "fancy" jusqu'où ? (équilibre waouh vs sérieux — c'est un outil de gestion, pas un jeu)

## Décisions user 2026-05-17 (après 1er mockup 4 directions)

> 💬 « on vient déjà de faire une refonte complète du visuel. Je veux bien refaire mais je veux des agents au top du design marketing and co avec des mockups de haut niveau »
> 💬 « j'aime bien cette barre en haut par exemple » (capture : barre de contexte Émeraude — bulles entités + sélecteur période)
> 💬 « par contre attention, les graphiques il faut garder les règles and co (couleur, données…) à chaque fois je passe bcp de temps à remettre en ordre »

**Décisions** :
1. **Refonte visuelle assumée** (Option B), MAIS exige des **mockups de haut niveau** produits avec le meilleur du design (agents/skills design : frontend-design, theme-factory, canvas-design ; éventuellement dispatch d'agents spécialisés pour explorer des directions marketing premium).
2. ✅ **Barre de contexte validée** : la topbar Émeraude (bulles entités + sélecteur période) plaît → la garder comme acquis dans la direction visuelle (et c'est le sujet NAV-FILTRE-ENTITE-GLOBAL).
3. 🛑 **CONTRAINTE GRAPHIQUES NON NÉGOCIABLE** : toute refonte DOIT préserver les conventions graphiques (couleur dynamique vert=positif/rouge=négatif selon le signe, données réelles + axes/baseline, couleurs métier). Le user perd du temps à remettre en ordre à chaque refonte → c'est gravé dans `feedback_sparkline_context`. Un thème change le FOND/surfaces/accents UI, PAS la sémantique couleur des données.

## Garde-fou

⚠️ ImmoTrack reste un **outil de gestion sérieux** (légal, fiscal, argent). Le "fancy" doit rehausser la perception de qualité **sans** nuire à la lisibilité ni faire gadget. Cohérence design system maintenue. Un preset sobre/pro reste disponible.

⚠️ **Refonte récente déjà faite** (dashboard V4) → ne pas refaire une refonte de plus sans un cap design clairement supérieur, validé sur mockups de haut niveau AVANT tout code. Pas de énième itération moyenne.

⚠️ **Graphiques** : cf `feedback_sparkline_context` (règle renforcée 2026-05-17). Tester explicitement les cas négatifs (cash-flow rouge) après tout restylage.

## Notes utilisateur

> 💬 2026-05-17 : « dernier point, il faudrait une mode de couleur vraiment fancy fancy ! marion me dit que ce n'est pas assez fancy »
> 💬 2026-05-17 : « on vient déjà de faire une refonte complète du visuel. Je veux bien refaire mais je veux des agents au top du design marketing and co avec des mockups de haut niveau »
> 💬 2026-05-17 : « j'aime bien cette barre en haut par exemple » (barre de contexte Émeraude)
> 💬 2026-05-17 : « attention, les graphiques il faut garder les règles and co (couleur, données…) à chaque fois je passe bcp de temps à remettre en ordre »

## Journal

- 2026-05-17 : créé · retour testeuse Marion « pas assez fancy » · système thèmes actuel = 10 color pickers basiques, pas de presets ni effets · mockup-first obligatoire (4 directions A/B/C/D : glassmorphism / gradient mesh / dark néon / pastel élégant) · presets nommés + couche d'effets CSS · garde-fou : rester un outil sérieux lisible, preset sobre conservé
- 2026-05-17 : **1er mockup livré** (`mockups/theme-fancy/index.html`, 4 directions Émeraude/Nuit/Aurore/Ardoise). User : refonte assumée MAIS veut des mockups de **haut niveau** (agents design top). **Barre de contexte validée** (acquis). **Contrainte graphiques** gravée (couleur signe + données préservées, cf `feedback_sparkline_context`). Refonte V4 déjà faite récemment → exiger un cap design supérieur avant code.
