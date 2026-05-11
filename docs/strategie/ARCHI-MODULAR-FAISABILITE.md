# ARCHI-MODULAR — Rapport de faisabilité modulaire

**Date** : 2026-05-11
**Source** : audit AUDIT-GLOBAL Phase 7
**Décision attendue** : utilisateur valide la stratégie cible (1, 2 ou 3) après lecture

---

## 🎯 Question posée

> Faut-il découper `index.html` (31 699 lignes monolithe) en modules pour faire passer un cap à l'app ?

---

## 📐 Métriques actuelles

| Indicateur | Valeur |
|---|---|
| Lignes totales `index-test.html` | 31 699 |
| Section CSS principale | 3 434 lignes |
| Section HTML (body + modales) | ~2 200 lignes |
| Section JS (3 blocs concaténés) | ~25 900 lignes |
| Fonctions top-level | 709 |
| Helpers `_drv*` (Drive) | 20 |
| Helpers `_idb*` (IndexedDB) | ~10 |
| Pages `#p-*` (onglets) | 17 |
| Render functions `r<Onglet>` | 12 identifiées |
| Accès `DB.*` | 937 occurrences |
| Accès `localStorage` | 90 occurrences |

### Répartition fonctionnelle estimée (par modules logiques cibles)

| Module | Lignes estimées | Fonctions clés |
|---|---|---|
| **core/db** | ~600 | saveDB, loadDB, _stamp, _modifiedAt, initDB |
| **core/drive** | ~1500 | _drv* (20 fonctions), OAuth GIS, sync |
| **core/utils** | ~400 | dates, montants, formatters, parseurs |
| **core/idb** | ~300 | _idbPut, _idbGet, photos EDL |
| **components/modal** | ~400 | overlays, popups, toasts |
| **components/signature** | ~600 | canvas sig, paraphes |
| **components/charts** | ~500 | _mkSparkline, _mkMultiLineChart, donut SVG |
| **components/document-uploader** | (à créer) | DRIVE-ARBORESCENCE |
| **tabs/dashboard** | ~2 500 | rDash, buildDashWidget, KPIs |
| **tabs/biens** | ~1 200 | rBiens, cards, toolbar |
| **tabs/log-fiche** | ~1 800 | _renderLogFiche*, 6 sous-onglets |
| **tabs/imm-fiche** | ~1 000 | _renderImmFiche*, Gantt |
| **tabs/ent-fiche** | ~700 | _renderEntFiche* |
| **tabs/baux** | ~3 500 | rBaux, wizard, previewBailData (1918 lignes !) |
| **tabs/loyers** | ~1 200 | rMv, scindage |
| **tabs/quittances** | ~800 | rQuit, génération |
| **tabs/edl** | ~3 000 | EDL wizard, photos, PDF |
| **tabs/irl** | ~1 000 | rIRL, lettres, validation |
| **tabs/charges-regul** | ~900 | computeRegul, charges communes |
| **tabs/assurances** | ~500 | rAss, MRH |
| **tabs/equipements** | ~600 | inventaire |
| **tabs/agenda** | ~400 | calendrier |
| **tabs/import** | ~600 | SheetJS |
| **tabs/params** | ~1 200 | paramètres techniques |
| **TOTAL** | ~25 200 lignes JS | Cohérent avec ~25 900 mesurées (90% mappé) |

### Couplage observé

- **937 accès `DB.*`** : la DB est partagée par TOUS les onglets → reste en `core/db.js`
- **Préfixes cohérents** (`r<Onglet>`, `_render<Composant>`) : peu de spaghetti croisé
- **Helpers utilitaires** (`_dfm` dates, `_fmtMoney`, etc.) appelés depuis 5+ onglets → candidats `core/utils.js`
- **Renderers cross-tab** : `_renderTbody`, `_mkSparkline` réutilisés partout → `components/`
- **Navigation `go(tabId)`** : 34 occurrences → reste centralisée dans `main.js`

→ **Le couplage est gérable**. Pas de spaghetti incontrôlé. Bon candidat à découpage propre.

---

## 🎯 Les 3 stratégies évaluées

### Stratégie 1 — Status quo (rester monolithe)

| Critère | Évaluation |
|---|---|
| Effort | **0 j-h** |
| Risque régression | **Nul** |
| Bénéfice | Aucun |
| Compatibilité offline-first | ✅ Parfait |
| Compatibilité Drive sync | ✅ Parfait |
| Maintenabilité long terme | ❌ Difficile au-delà de 50k lignes |
| Embarquement futur dev | ❌ Compliqué (1 fichier 32k lignes) |
| Crédibilité commerciale | ❌ Perception "amateur" |
| Tests unitaires | ❌ Non réalisable sans extraction |

**À retenir si** :
- Tu n'as PAS l'intention de recruter un dev junior avant V2
- Tu acceptes une dette technique croissante
- Tu vises V1 commerciale rapidement et tu modulariseras post-V1

**Verdict** : OK comme **statu quo provisoire** entre V1 (Q4 2026) et V1.1 (~Q1 2027). À NE PAS retenir comme cible long-terme.

---

### Stratégie 2 — ES modules natifs sans bundler ⭐ RECOMMANDÉE

| Critère | Évaluation |
|---|---|
| Effort | **6-9 j-h** (1.5-2 semaines de session dédiée + tests) |
| Risque régression | **Moyen** (mitigeable par migration onglet-par-onglet) |
| Bénéfice | Maintenabilité ↑↑, embarquement junior ↑, tests unitaires possibles |
| Compatibilité offline-first | ✅ Parfait (modules ES bundlés au build implicite navigateur) |
| Compatibilité Drive sync | ✅ Parfait (`core/drive.js` extrait, API inchangée) |
| Compatibilité PWA / Service Worker | ✅ Parfait |
| Maintenabilité long terme | ✅ Excellent |
| Embarquement futur dev | ✅ Onglet par onglet, isolation claire |
| Crédibilité commerciale | ✅ Pro |
| Tests unitaires | ✅ Via Vitest (déjà setup Sprint 1) |
| Build step | ❌ AUCUN (pur ES6 natif) |
| HMR / Dev experience | 🟡 Pas de HMR (rechargement page) |

**Architecture cible** :
```
index.html  (~3 500 lignes : coquille HTML + CSS + bootstrap)
├── <link rel="stylesheet" href="css/main.css">
├── <link rel="stylesheet" href="css/theme.css">
├── ... pages HTML <div id="p-*"> ...
└── <script type="module" src="js/main.js"></script>

css/
├── main.css        ← 3 434 lignes extraites de <style>
└── theme.css       ← variables dark/light

js/
├── main.js                 ← bootstrap : import core, register tabs, go()
├── core/
│   ├── db.js               ← saveDB, loadDB, _stamp, initDB
│   ├── drive.js            ← OAuth, sync, _drv*
│   ├── idb.js              ← IndexedDB photos
│   └── utils.js            ← dates, montants, formatters
├── components/
│   ├── modal.js
│   ├── toast.js
│   ├── signature-canvas.js
│   ├── charts.js           ← _mkSparkline, donut, multi-line
│   ├── kpi-tile.js
│   └── document-uploader.js  ← cf DRIVE-ARBORESCENCE
└── tabs/
    ├── dashboard.js
    ├── biens.js
    ├── log-fiche.js
    ├── imm-fiche.js
    ├── ent-fiche.js
    ├── baux.js              ← Y inclut previewBailData (à splitter avant ou pendant)
    ├── loyers.js
    ├── quittances.js
    ├── edl.js
    ├── irl.js
    ├── charges-regul.js
    ├── assurances.js
    ├── equipements.js
    ├── agenda.js
    ├── import.js
    └── params.js
```

**Comment ça marche** :
- Pas de bundler, pas de build, pas de transpilation
- Le navigateur charge `<script type="module" src="js/main.js">`
- `main.js` fait des `import` qui chargent les modules à la demande
- **Lazy-load** possible via `import()` dynamique : un onglet ne se charge que si on clique dessus
- Compatible 100% navigateurs modernes (Chrome/Firefox/Safari/Edge depuis 2017)

**Mode `file://`** : ⚠️ les ES modules ne fonctionnent **pas** en `file://` sur Chrome/Firefox (CORS). Workaround : servir via `python -m http.server` ou `npx serve` en dev. **Pas bloquant** car la commercialisation passe par un hébergement (Vercel/Cloudflare).

**Phasage de migration** :
1. **Phase 0** (1 jour) — Préparation : extraire CSS dans `css/`, créer squelette `js/main.js`, commit propre
2. **Phase 1** (1-2 jours) — Extraire `core/` (db, drive, utils, idb) : zéro modification fonctionnelle
3. **Phase 2** (1 jour) — Extraire `components/` (modal, charts, signature, etc.)
4. **Phase 3** (3-4 jours) — Migrer les onglets 1 par 1 (du plus indépendant au plus connecté). Tester chaque commit.
5. **Phase 4** (0.5 jour) — Cleanup, vérif coverage tests, doc à jour

**Verdict** : ⭐ **Cette stratégie est la meilleure** pour ImmoTrack. Effort raisonnable (6-9 j-h), pas de complexité de build, parfaitement compatible avec l'écosystème offline-first / Drive sync existant, et débloque les tests unitaires.

---

### Stratégie 3 — Bundler Vite

| Critère | Évaluation |
|---|---|
| Effort | **10-15 j-h** (~2-3 semaines en session dédiée + tests + CI) |
| Risque régression | **Moyen-élevé** |
| Bénéfice | Stratégie 2 + minification + HMR + tree-shaking |
| Compatibilité offline-first | ✅ Avec Workbox/vite-plugin-pwa |
| Compatibilité Drive sync | ✅ Parfait |
| Build step | ⚠️ Maintenir vite.config.js + CI |
| HMR / Dev experience | ✅ Excellent |
| Crédibilité commerciale | ✅ Pro+++ |
| Tests unitaires | ✅ Vitest intégré natif |
| Déploiement | ✅ `npm run build` → dossier statique |

**Architecture cible** : identique à Stratégie 2, mais avec `vite.config.js` qui produit un bundle optimisé.

**Bénéfices supplémentaires vs Stratégie 2** :
- Bundle minifié = ~30-50% plus petit en réseau
- Code splitting automatique (1 onglet = 1 chunk)
- HMR pendant le dev = feedback < 1s
- Tree-shaking : élimine le code mort au build
- Optimisation auto des images

**Coûts supplémentaires** :
- Build step à maintenir
- Risque "build cassé" en CI
- Complexité debug en prod (sources maps)
- Apprentissage Vite pour Didier (mais OK, Vitest est déjà installé donc l'écosystème est connu)

**Verdict** : **Stratégie 3 = upgrade naturel de la 2**. Recommandée **après V1 commerciale**, quand le besoin de perf chiffrée justifie le build step. Pas avant.

---

## 🏆 Recommandation chiffrée

| Période | Stratégie recommandée | Pourquoi |
|---|---|---|
| **Maintenant → V1 commerciale (Q4 2026)** | **Stratégie 1 (statu quo)** | Pas le temps. Concentre-toi sur SECU-INNERHTML + LEGAL-2044 + DRIVE-ARBORESCENCE + bloquants V1 |
| **Post-V1 (Q1-Q2 2027)** | **Stratégie 2 (ES modules natifs)** ⭐ | Modulariser pour préparer le recrutement (V1.1 SaaS) sans engager un build step |
| **Post-V2 SaaS multi-users (Q3-Q4 2027)** | **Stratégie 3 (Vite)** | Quand le besoin de perf chiffrée et de CI/CD industriels devient critique |

---

## ⏱️ Coûts détaillés Stratégie 2 (option recommandée)

| Phase | Tâche | j-h |
|---|---|---|
| Phase 0 | Extraction CSS + bootstrap squelette | 1.0 |
| Phase 1.1 | `core/db.js` (saveDB, loadDB, _stamp) | 0.5 |
| Phase 1.2 | `core/drive.js` (20 helpers _drv* + OAuth) | 1.0 |
| Phase 1.3 | `core/utils.js` (formatters + dates) | 0.5 |
| Phase 1.4 | `core/idb.js` (photos EDL) | 0.3 |
| Phase 2.1 | `components/modal.js` + `toast.js` | 0.5 |
| Phase 2.2 | `components/signature-canvas.js` | 0.5 |
| Phase 2.3 | `components/charts.js` (sparkline, donut, multi-line) | 0.7 |
| Phase 3.1 | tabs/agenda.js (le plus simple) | 0.3 |
| Phase 3.2 | tabs/import.js + tabs/equipements.js | 0.5 |
| Phase 3.3 | tabs/assurances.js + tabs/mrh.js | 0.5 |
| Phase 3.4 | tabs/irl.js + tabs/loyers.js | 0.8 |
| Phase 3.5 | tabs/quittances.js + tabs/charges-regul.js | 0.7 |
| Phase 3.6 | tabs/edl.js (gros, autonome) | 1.2 |
| Phase 3.7 | tabs/baux.js (avec splitting previewBailData) | 1.5 |
| Phase 3.8 | tabs/biens.js + tabs/log-fiche.js + tabs/imm-fiche.js + tabs/ent-fiche.js | 1.5 |
| Phase 3.9 | tabs/dashboard.js (gros, dernier car deps tout) | 1.0 |
| Phase 4 | Cleanup + tests | 0.5 |
| **TOTAL** | | **~13 j-h** |

→ Estimation finale : **~2 semaines à plein temps**, ou **~6-8 semaines à mi-temps**. À planifier dans Q1 2027 après la stabilisation V1.

---

## ⚠️ Risques de Stratégie 2 et mitigations

| Risque | Mitigation |
|---|---|
| Casser des références globales implicites (ex `window.savBail = ...`) | Phase 1 (core) en premier, jamais avancer sans tester |
| Régression UX par migration partielle | 1 onglet = 1 commit + test manuel exhaustif + sandbox-first |
| Perte de robustesse offline (lazy-load nécessite réseau pour 1er chargement) | Préchargement à l'idle, ou fallback embed pour onglets critiques (dashboard, biens, baux) |
| Maintien parallèle (sandbox modulaire vs prod monolithe) | Migration séquentielle rapide (≤ 2 semaines), pas étalée |
| Compatibilité `file://` cassée | Doc claire : "Lancer via `npx serve` en dev". Pas bloquant pour utilisateur final hébergé |
| 2011 lignes uncommitted bloquent le démarrage | Pré-requis : commit propre des features v14.63→v14.76 avant la migration |

---

## 📋 Décisions à arbitrer par utilisateur

- [ ] **Stratégie retenue** : 1 (statu quo), 2 (ES modules) ou 3 (Vite) ?
- [ ] **Calendrier** : avant V1 commerciale (Q4 2026), juste après (Q1 2027), ou plus tard ?
- [ ] **Recrutement éventuel** d'un dev junior pour assister sur la migration ?
- [ ] **Garder `index.html`** comme nom du fichier coquille ou renommer en `app.html` ?
- [ ] **Hébergement cible** : Vercel, Cloudflare Pages, OVH, autre ? (impacte CI/CD si Vite retenu)

---

## 🎯 Recommandation finale

**Ne PAS attaquer la modularisation avant V1 commerciale.**

1. **Maintenant → Q4 2026** : Concentre-toi sur les bloquants V1 (SECU-INNERHTML, LEGAL-2044, DRIVE-ARBORESCENCE, BUG-CHARGE-001, MOBILE-AUDIT-ONGLETS, etc.)
2. **Q4 2026 → V1 livrée** : Stabilisation prod
3. **Q1 2027** : Lance la Stratégie 2 (ES modules natifs) — 2 semaines plein temps
4. **Q3 2027** : Si V2 SaaS multi-users → considérer upgrade vers Stratégie 3 (Vite) selon besoins perf

**Plan B si tu veux modulariser plus tôt** : extraire **uniquement** `core/db.js` + `core/drive.js` + `core/utils.js` (Phase 1) → 2-3 j-h, gain maintenance immédiat, sans toucher les onglets. Très bon ROI/risque.

---

**Date génération** : 2026-05-11
**Rapport jumeau** : `docs/strategie/AUDIT-CODE.md`
