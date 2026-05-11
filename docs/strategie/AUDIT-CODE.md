# AUDIT-CODE — Rapport d'audit ImmoTrack

**Date** : 2026-05-11
**Version analysée** : sandbox `index-test.html` v14.76+ (état uncommitted local)
**Auditeur** : session pilotage Claude (lecture seule)
**Scope** : 7 phases AUDIT-GLOBAL — *Phase 6 (nettoyage actif) reportée pour ne pas mélanger avec les 2011 lignes uncommitted en cours*

---

## 📊 Résumé exécutif

ImmoTrack v14.76 est un monolithe vanilla JS **fonctionnel et mature** (~32k lignes), avec une codebase **dense mais cohérente** sur les conventions (préfixes `r*`, `_drv*`, `_render*`). Les principaux risques pour la V1 commerciale sont **sécurité XSS** (157 sites `innerHTML=` non échappés) et **maintenabilité** (3 fonctions > 500 lignes, dont une de **1918 lignes**).

**Verdict** : modularisation **recommandée mais pas urgente** — le monolithe est gérable jusqu'à ~50k lignes avec discipline. La priorité absolue est la sécurité XSS avant toute mise en commercialisation.

| Indicateur | Valeur | Statut |
|---|---|---|
| Lignes totales | 31 699 | 🟡 borderline |
| CSS | ~3 700 lignes | 🟢 OK |
| JS | ~25 900 lignes en 3 blocs | 🟡 monolithe |
| Pages `#p-*` | 17 onglets | 🟢 cohérent |
| Fonctions top-level | 709 | 🟡 dense |
| Helpers Drive `_drv*` | 20 | 🟢 OK |
| **`innerHTML=`** | **157 occurrences** | 🔴 **risque XSS V1** |
| `console.log/warn/error` oubliés | 104 | 🟡 à trier |
| `TODO/FIXME/HACK` | 1 commentaire | 🟢 propre |
| `debugger` oublié | 0 | 🟢 propre |
| Style global | Vanilla JS ES5+, peu d'arrow functions top-level | 🟡 cohérent mais legacy |

---

## Phase 1 — Cartographie

### Structure générale

```
index-test.html (31 699 lignes)
├── <head> CSS principal : ~3 434 lignes (lignes 1-3530)
├── <body> HTML : 17 pages <div class="page" id="p-*"> (lignes 3531-4226)
│   ├── p-dashboard, p-agenda, p-import
│   ├── p-loyers, p-baux, p-assurances
│   ├── p-irl, p-equipements, p-regul, p-quittances, p-edl
│   ├── p-biens, p-log-fiche, p-imm-fiche, p-ent-fiche
│   └── p-params, p-export
├── Modales / overlays HTML : lignes 4226-5696
├── JS block 1 : 11 789 lignes (l. 5697-17486) → DB, helpers, baux, rendu
├── JS block 2 : 11 781 lignes (l. 17487-29268) → rendus, EDL, IRL, dashboard v2
└── JS block 3 : 2 371 lignes (l. 29269-31640) → bootstrap, init, event listeners
```

### Onglets identifiés (17)

| # | Page | Render fn | Note |
|---|---|---|---|
| 1 | `#p-dashboard` | `rDash` (210 lignes) | Cœur métier, DASH-V2 livré |
| 2 | `#p-agenda` | (intégré) | Vue calendrier |
| 3 | `#p-import` | (intégré) | Import Excel |
| 4 | `#p-loyers` | `rMv` | Mouvements financiers |
| 5 | `#p-baux` | `rBaux` | Liste baux |
| 6 | `#p-assurances` | `rAss` | PNO / MRH |
| 7 | `#p-irl` | `rIRL` | Révisions IRL |
| 8 | `#p-equipements` | (intégré) | Inventaire équipement |
| 9 | `#p-regul` | (via `p-regul-inner`) | Régularisation charges |
| 10 | `#p-quittances` | `rQuit` | Génération quittances |
| 11 | `#p-edl` | (multi-fn) | États des lieux |
| 12 | `#p-biens` | `rBiens` | Vue Qalimo livrée v14.2 |
| 13 | `#p-log-fiche` | `_renderLogFiche*` | Fiche 360° logement |
| 14 | `#p-imm-fiche` | `_renderImmFiche*` | Fiche 360° immeuble |
| 15 | `#p-ent-fiche` | `_renderEntFiche*` | Fiche 360° bailleur |
| 16 | `#p-params` | (multi-tab interne) | Paramètres + référentiel |
| 17 | `#p-export` | (intégré) | Export données |

### Conventions de naming (cohérentes)

- `r<NomOnglet>` → render principal d'un onglet (rDash, rMv, rBaux, rAss, rIRL, rQuit, rBiens)
- `_render<Composant>` → renders internes (sous-sections fiches 360°)
- `_drv*` → 20 helpers Drive (sync, OAuth, folders, files)
- `_idb*` → IndexedDB (photos EDL)
- `gen<X>` → générateurs PDF (genBailHTML, genIRLLetter, etc.)
- `save<X>` → persistance (saveDB, saveBail, saveMv, saveMrh, saveAss, etc.)
- `build<X>` → construction structurelle (buildDashWidget, buildBailStructure)
- `open<X>` → ouverture modale/fiche (openBail, openLogFiche)

**Verdict naming** : 🟢 cohérent. Pas de refactoring de naming nécessaire en priorité.

### Style code (ES5 vs ES6)

- 709 `function name() {}` top-level
- Seulement **4 arrow functions top-level** assignées à `const/let/var`
- → Migration ES5→ES6 partielle, encore beaucoup de patterns legacy
- Cf sujet `BAIL-NAMESPACE-MIGRATION` (P3/XL ⏳ en attente) qui couvre ce refactoring globalement

---

## Phase 2 — Sécurité

### 🔴 RISQUE CRITIQUE : XSS via innerHTML

**157 occurrences de `.innerHTML=`** dans le code (vs 107 il y a 2 semaines = **+50 sites récents non échappés**).

Cible **bloquante V1 commerciale** : tout site qui injecte une string contenant des données utilisateur (nom de bien, nom locataire, adresse, notes libres) est potentiellement vulnérable.

Cas typique exploitable :
```js
// Si un utilisateur saisit `<img src=x onerror=alert(1)>` comme nom de bien :
tbody.innerHTML = `<tr><td>${log.nom}</td></tr>` // ← XSS exécuté
```

**Action requise** (sujet `SECU-INNERHTML`, P1/M déjà en backlog) :
1. Audit ligne par ligne : pour chaque `innerHTML=`, est-ce que la string interpole **AU MOINS** une donnée utilisateur ?
2. Si OUI → remplacer par `textContent`, ou utiliser un helper d'échappement `_esc(s)` ou DOM API native (`createElement` + `textContent`)
3. Si NON (string littérale 100% statique) → laisser (faux positif)

**Estimation** : sur 157 sites, ~70-80% sont probablement à risque (interpolations `${...}` avec données DB). 4-6h de fix méthodique.

### 🟡 OAuth Google Identity Services

Flow GIS browser-only sans backend → pas de refresh token. Géré par `BUG-DRIVE-DISCONNECT` v13.41 (refresh proactif, modale reconnect, FAB rouge). 9 triggers documentés.

**Verdict** : 🟢 traité avec une qualité pro. Pas d'audit complémentaire requis sauf si on ouvre les scopes Drive (actuellement `drive.file`).

### 🟡 localStorage parsing

90 accès `localStorage` + 937 accès `DB.*` → tout passe par un parseur JSON. Si le JSON est corrompu (sync Drive défaillante par exemple), risque crash app au boot.

**Recommandation** : ajouter un try/catch + fallback dans `initDB()` (qui fait 334 lignes — large place). Sujet existant `DB-CORRUPT-FALLBACK` à créer en P2.

### 🟢 IndexedDB photos

20 helpers `_idb*`, sandboxés, pas d'input user direct. Pas de risque.

### 🟢 PWA / Service Worker

`sw.js` existe en root, à auditer dans `MOBILE-PWA-OFFLINE` (P2). Pas dans le scope V1.

---

## Phase 3 — Performance

### Pages lourdes en rendu

| Page | Fonction | Taille | Verdict |
|---|---|---|---|
| Dashboard | `rDash` | 210 lignes | 🟢 OK (DASH-V2 optimisé) |
| Dashboard widgets | `buildDashWidget` | **892 lignes** | 🟡 lourde à initialiser |
| Aperçu Bail | `previewBailData` | **1918 lignes** | 🔴 fonction démesurée |
| Régularisation | `computeRegul` | 200 lignes | 🟡 à vérifier (BUG-CHARGE-001 = bug fonctionnel) |
| Fiche immeuble Gantt | `_renderImmFichePlanGantt` | 433 lignes | 🟡 à profiler si lag perçu |

### Goulots probables

- **Filtres massifs** : 937 accès `DB.*` dans le code → beaucoup d'itérations `.filter()` sur les collections (mouvements 149 items dans le backup réel, baux 14 items, etc.). Pour 10k mouvements (cible V1), `.filter()` répétés peuvent peser.
  - Action : indexation manuelle au boot (`DB._byLog`, `DB._byEntity`) → cache invalide à `saveDB()`.
- **DB JSON localStorage** : ~700 Ko aujourd'hui dans le backup. Limite navigateur ~5-10 Mo. Marge confortable pour 12-24 mois.

### Quick wins identifiés

1. Lazy-load des modules PDF (jsPDF + html2canvas inlinés en base64 = ~750 Ko **chargés au boot même si pas utilisés**). Déclencher l'inline uniquement au 1er clic "Générer PDF".
2. Profiler `previewBailData` (1918 lignes) → probablement candidat à splitter.
3. Profiler `_extractVilleFromAdr` (511 lignes) → surdimensionné pour ce qu'il fait. Régexp à simplifier.

---

## Phase 4 — Code quality

### 4a. Patches inutiles / commentaires obsolètes

**1 commentaire `TODO/FIXME/HACK`** dans tout le fichier → 🟢 **propre** (vs typique 20-50 dans une codebase équivalente). À retirer en Phase 6 nettoyage.

### 4b. Console / debug oubliés

**104 occurrences `console.log/warn/error/info/debug`**.

**Classification recommandée pour Phase 6** :
- ✅ **À garder** (~30-40 estimé) : `console.warn`/`error` dans Drive sync, OAuth, IndexedDB, `_drv*` (diagnostics utiles en cas d'incident)
- ❌ **À supprimer** (~60-70 estimé) : `console.log` de développement (state, valeurs intermédiaires, "FIX v14.X applied", etc.)

**Action** : audit ligne par ligne en Phase 6 (lister chaque occurrence, décider garder/supprimer).

### 4c. Fonctions démesurées (candidates à refacto)

| Fonction | Lignes | Recommandation |
|---|---|---|
| `previewBailData` | **1918** | 🔴 Splitter en 4-6 sous-fonctions (header, body, signatures, footer, garants) |
| `buildDashWidget` | **892** | 🔴 1 widget = 1 sous-fonction (KPI, sparkline, drill, alerte) |
| `buildBailStructure` | **725** | 🔴 1 section bail = 1 sous-fonction |
| `_extractVilleFromAdr` | **511** | 🟡 Probablement sur-engineered, simplifier |
| `_isStdCategory` | **449** | 🟡 Probablement liste hardcodée géante, à externaliser en data |
| `_renderImmFichePlanGantt` | **433** | 🟡 Composant Gantt, candidat à extraire |
| `initDB` | **334** | 🟡 Bootstrap. Splitter en `initDB` + `_seedDemoData` + `_migrateSchema` |
| `_edlPropagateSyncedToForm` | 289 | 🟢 Acceptable |

**5 fonctions > 400 lignes** sur 709 total = 0.7%. Faible en absolu mais bloquent la lisibilité.

### 4d. Code mort

Analyse exhaustive non faite (requiert grep zéro de chaque fonction sur 709 → ~30 min auto par agent Explore). **Recommandation** : déléguer à un agent Explore en mode dédié (séparé de cette session).

### 4e. Duplications

Non analysé en détail. Indices :
- 17 onglets avec patterns `r<Onglet>` qui peuvent dupliquer des helpers de rendu (cf `_renderTbody`, etc.)
- Mêmes patterns de "render carte" probables entre `rBiens`, `rBaux`, `rAss` (Phase Patrimoine v14.2 a unifié mais pas vérifié)

### 4f. Magic strings

Non analysé en détail. À regarder : catégories de mouvement (`Loyers`, `Charges`, `Travaux`, `Assurances`, `Taxes`, `Honoraires`, `Autres`) sont déjà dans `categories` array du backup → bonne pratique. Vérifier les autres domaines (types bail, statuts, etc.).

---

## Phase 5 — Top recommandations priorisées

### 🔴 Bloquants V1 commerciale

| # | Action | Sujet backlog | Effort | Priorité |
|---|---|---|---|---|
| 1 | Fix XSS sur les 157 `innerHTML=` | `SECU-INNERHTML` (P1/M existant) | 4-6h | **P0** avant mise en prod publique |
| 2 | Splitter `previewBailData` (1918 lignes) | À créer : `BAIL-PREVIEW-REFACTO` | 3-4h | P1 |
| 3 | Splitter `buildDashWidget` (892 lignes) | À intégrer dans `DASH-PROFILES` Phase 2 | 2h | P1 |
| 4 | Fix `BUG-CHARGE-001` (régul charges KO) | `BUG-CHARGE-001` (P1/M existant) | 3-8h | P1 |

### 🟠 Quick wins

| # | Action | Effort | Impact |
|---|---|---|---|
| 5 | Lazy-load des PDF libs (jsPDF + html2canvas) | 2h | -750 Ko au boot |
| 6 | Simplifier `_extractVilleFromAdr` (511 → ~50 lignes) | 1-2h | Lisibilité |
| 7 | Externaliser `_isStdCategory` en data + lookup | 1-2h | Lisibilité |
| 8 | Try/catch fallback dans `initDB()` (localStorage corrompu) | 1h | Robustesse |

### 🟡 Phase 6 Nettoyage actif — à exécuter en session séparée

⚠️ **Phase 6 reportée** : les 2011 lignes uncommitted dans `index.html`/`index-test.html` (v14.63 → v14.76+) empêchent un nettoyage propre car les commits se mélangeraient. **Pré-requis : commit propre des features en cours d'abord**.

Une fois ce blocage levé, plan de nettoyage en 5 commits sur `index-test.html` uniquement (sandbox-first) :

| Commit | Catégorie | Estimation |
|---|---|---|
| 1 | Console.log de dev (60-70 occurrences à supprimer, ~30-40 à garder) | 1h |
| 2 | Le commentaire `TODO/FIXME/HACK` orphelin (1 occurrence à résoudre ou retirer) | 5 min |
| 3 | Branches mortes éventuelles | À identifier via Explore |
| 4 | Variables/imports inutilisés | À identifier via Explore |
| 5 | Magic strings → constantes (limité aux candidats triviaux) | À identifier |

### 🔵 Audit profond complémentaire (post-V1)

Délégations à l'agent Explore pour analyses exhaustives :
- Code mort exhaustif (fonctions jamais appelées)
- Duplications structurelles (blocs > 10 lignes répétés > 2 fois)
- Couplage entre onglets (matrice fonctions cross-tab)

---

## ⚠️ Blocages identifiés

1. **2011 lignes uncommitted** dans `index.html` ET `index-test.html` (v14.63 → v14.76+). Empêche Phase 6 propre. **Action utilisateur requise** : commit ces modifs avant d'attaquer le nettoyage.
2. **Pas de tests automatisés** historiquement → la Phase 6 nettoyage est plus risquée. Vitest setup (Sprint 1) ouvre la porte aux tests, mais couvrir 31k lignes nécessitera des stubs progressifs.
3. **Pas d'audit code mort** dans cette session → délégué à un agent Explore séparé (1-2h).

---

## 📚 Pour la suite

- **Rapport `ARCHI-MODULAR-FAISABILITE.md`** (Phase 7) : voir document jumeau
- **Sujet `AUDIT-GLOBAL`** : passe en partiellement livré (Phases 1-5 + 7 ✅, Phase 6 reportée)
- **Nouveaux sujets à créer** :
  - `BAIL-PREVIEW-REFACTO` (P1/M) — splitter `previewBailData` 1918 lignes
  - `DASH-WIDGET-REFACTO` (à intégrer DASH-PROFILES Phase 2)
  - `PERF-LAZY-PDF` (P2/S) — lazy-load PDF libs
  - `DB-CORRUPT-FALLBACK` (P2/XS) — try/catch initDB

---

**Date génération** : 2026-05-11
**Version sandbox auditée** : v14.76+ (2011 lignes uncommitted incluses dans l'analyse)
