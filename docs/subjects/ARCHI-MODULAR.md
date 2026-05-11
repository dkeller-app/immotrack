# ARCHI-MODULAR — Refonte modulaire du monolithe index.html

**Status** : ⏳ Décision stratégie validée 2026-05-11 — Stratégie 2 (ES modules natifs sans bundler). Planifié Sprint 2 · **Prio** : P1 · **Taille** : L (6-9 j-h après confirmation audit)
**Détecté** : 2026-05-05
**Lié à** : AUDIT-GLOBAL (Phase 7 = analyse de faisabilité de ce sujet) · V3-VISUEL · ARCHI-DB-DOUBLONS · BIZPLAN

## Contexte
Demande utilisateur 2026-05-05 :
> 💬 « le fichier HTML devient trop gros. Dans une optique de déploiement future, ne faut-il pas créer des sous-parties par onglet ou autre plutôt qu'un code d'une seule traite ? »

Réalité au 2026-05-05 :
- `index.html` = **30 083 lignes** (HTML + CSS + JS dans un seul fichier vanilla)
- Pas de bundler, pas de framework, pas de build step
- Avantage actuel : déploiement = 1 fichier statique, fonctionne offline, robustesse extrême
- Inconvénients : maintenance difficile, parsing lourd au boot, pas de tests unitaires possibles, embarquement junior dev compliqué, perception "amateur" par investisseurs/acquéreurs

→ Pour la V1 commerciale (Q4 2026, cf BIZPLAN), il devient probablement nécessaire de moduler l'app sans pour autant introduire un framework lourd qui casserait le offline-first.

## Pré-requis
**Ne pas attaquer ce sujet avant d'avoir** :
1. Livré `AUDIT-GLOBAL` (rapport Phase 7 de faisabilité modulaire)
2. Validé la stratégie cible avec l'utilisateur (3 options évaluées dans le rapport)

Sans le rapport, on s'engage sur une refonte aveugle = très risqué.

## Stratégies candidates (à arbitrer après AUDIT-GLOBAL)

### Stratégie 1 — Status quo (rester monolithe)
- **Coût** : 0 j-h
- **Bénéfice** : aucune régression
- **À retenir si** : l'audit conclut que le monolithe est gérable ≤ 50k lignes et que les vrais problèmes sont ailleurs (sécu, perf ciblée)

### Stratégie 2 — ES modules natifs sans bundler
- **Coût estimé** : 5-8 j-h (audit aura un chiffrage précis)
- **Architecture cible** :
  ```
  index.html                 ← coquille HTML+CSS+bootstrap (~5k lignes)
  js/
  ├── core/
  │   ├── db.js              ← IndexedDB, localStorage, _stamp, _modifiedAt
  │   ├── drive.js           ← OAuth, sync, helpers _drv*
  │   ├── utils.js           ← formatters, dates, math
  │   └── design.js          ← variables CSS, helpers UI
  ├── tabs/
  │   ├── dashboard.js       ← #p-dashboard + KPIs + lentilles DASH-PROFILES
  │   ├── biens.js           ← #p-biens + LOG-LISTE-CARDS
  │   ├── log-fiche.js       ← LOG-FICHE-360
  │   ├── bailleurs.js       ← #p-bailleurs
  │   ├── baux.js            ← #p-baux + wizard + signature
  │   ├── locataires.js
  │   ├── mouvements.js      ← #p-mv
  │   ├── quittances.js      ← #p-quit
  │   ├── irl.js
  │   ├── edl.js             ← + EDL wizard photos
  │   ├── charges.js
  │   ├── mrh.js
  │   ├── travaux.js
  │   └── parametres.js
  ├── components/
  │   ├── signature-canvas.js
  │   ├── modal.js
  │   ├── toast.js
  │   ├── document-uploader.js  ← cf DRIVE-ARBORESCENCE
  │   └── kpi-tile.js
  └── main.js                ← bootstrap : import core, register tabs
  ```
- **Bénéfices** : maintenance, lazy-load par onglet (import dynamique), tests unitaires possibles
- **Inconvénients** : N requêtes au lieu de 1, mais HTTP/2 multiplexing rend ça acceptable
- **Compatibilité** : 100% navigateurs modernes (ES modules natifs supportés depuis 2017)

### Stratégie 3 — Bundler Vite
- **Coût estimé** : 8-15 j-h (audit aura un chiffrage précis)
- **Architecture cible** : même que Stratégie 2, mais avec `vite.config.js` qui produit un bundle optimisé
- **Bénéfices supplémentaires** :
  - Minification + tree-shaking → bundle final plus léger
  - HMR (Hot Module Replacement) en dev → DX très améliorée
  - Optimisation auto des assets (images, fonts)
  - Lazy-loading + code-splitting auto
- **Inconvénients** :
  - Build step à maintenir (CI/CD)
  - Risque "build cassé" un jour
  - Plus complexe pour debug en prod

## Critères de décision

| Critère | Status quo | ES modules | Vite |
|---|---|---|---|
| Effort initial | 0 j-h | 5-8 j-h | 8-15 j-h |
| Maintenabilité long terme | ❌ | ✅ | ✅ |
| Embarquement futurs devs | ❌ | ✅ | ✅ |
| Perf perçue (boot) | ❌ | 🟡 ok | ✅ |
| Robustesse déploiement | ✅ | ✅ | 🟡 dépend du build |
| Compatibilité offline-first | ✅ | ✅ | ✅ (avec PWA) |
| Compatibilité Drive sync | ✅ | ✅ | ✅ |
| Tests unitaires | ❌ | 🟡 manuel | ✅ Vitest natif |
| Crédibilité commerciale | ❌ | 🟡 | ✅ |

## Scope phasé (si stratégie 2 ou 3 retenue)

### Phase 0 — Préparation (avant code)
- [ ] Validation stratégie par utilisateur (rapport AUDIT-GLOBAL Phase 7 lu)
- [ ] Validation calendrier (avant ou après V1 commerciale ?)
- [ ] Backup complet `index.html` (git tag `pre-modular-v14.X`)
- [ ] CI minimal (test que `index.html` charge bien après chaque commit) si pas déjà en place

### Phase 1 — Extraction du `core` (~1-2 j)
- [ ] Extraire `core/db.js` (helpers DB, IndexedDB)
- [ ] Extraire `core/drive.js` (sync, OAuth, helpers `_drv*`)
- [ ] Extraire `core/utils.js` (formatters, dates, math)
- [ ] Extraire `core/design.js` (variables CSS si pas inline)
- [ ] `index.html` continue à fonctionner avec imports

### Phase 2 — Extraction des `components` (~1-2 j)
- [ ] Modal, toast, signature-canvas, kpi-tile, document-uploader
- [ ] Chaque composant a son propre fichier + ses styles scoped si possible

### Phase 3 — Extraction onglet par onglet (~3-8 j)
- [ ] 1 onglet = 1 commit. Tester après chaque commit.
- [ ] Ordre suggéré (du plus indépendant au plus connecté) :
  1. paramètres (peu de deps)
  2. mrh (autonome)
  3. irl (autonome)
  4. edl (gros, mais autonome)
  5. travaux
  6. charges
  7. quittances
  8. mouvements
  9. baux (deps DocumentUploader, signature)
  10. locataires (deps baux)
  11. bailleurs (deps biens)
  12. log-fiche (deps biens, baux, edl, mouvements)
  13. biens (deps tout)
  14. dashboard (deps tout, dernier)

### Phase 4 — Lazy-load (Vite seulement)
- [ ] `import('./tabs/dashboard.js')` dynamique au clic onglet
- [ ] Pré-chargement intelligent (idle callback)
- [ ] Mesure perf avant/après

### Phase 5 — Tests + déploiement
- [ ] Tests manuels exhaustifs (toutes les UX critiques)
- [ ] Bench perf (boot time, parse time)
- [ ] Déploiement progressif (canary release, rollback prêt)

## Décisions à prendre (après audit)
- [ ] Stratégie 1, 2 ou 3 ?
- [ ] Avant ou après V1 commerciale Q4 2026 ?
- [ ] Recrutement dev junior pour aider sur le découpage onglet par onglet ?
- [ ] Garder `index.html` comme fichier coquille ou renommer `app.html` ?
- [ ] Si Vite : Vercel ou Cloudflare Pages comme cible (les 2 supportent)

## Risques majeurs

1. **Casser des références implicites** : globals JS qui se réfèrent les unes aux autres sans imports explicites
   - Mitigation : phase 1 (core) en premier, ne jamais avancer sans tester
2. **Régression UX** : un onglet qui ne charge plus correctement
   - Mitigation : 1 onglet = 1 commit + test manuel exhaustif
3. **Perte de robustesse offline** : le `import()` dynamique nécessite réseau pour charger un onglet jamais visité offline
   - Mitigation : préchargement à l'idle, ou fallback embed pour les onglets critiques
4. **Maintien parallèle** : tant que la migration n'est pas finie, on a des risques de divergence
   - Mitigation : migration séquentielle rapide (≤ 2 semaines)

## Notes utilisateur
> 💬 2026-05-05 : "faire un prompt pour audit complet du code et optimisation du code : nettoyage des patchs, remarques sans valeurs ... le fichier HTML devient trop gros. Dans une optique de déploiement future, ne faut-il pas créer des sous-parties par onlget ou autre plutot qu'un code d'une seule traite ?"

## Journal
- 2026-05-05 : créé · pre-requis = rapport AUDIT-GLOBAL Phase 7 de faisabilité, 3 stratégies candidates documentées, scope phasé en 5 phases ordonnées
