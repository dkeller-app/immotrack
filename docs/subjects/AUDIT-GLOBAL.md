# AUDIT-GLOBAL — Audit global + nettoyage + analyse modularité (avant V3)

**Status** : ⏳ Phases 1-5+7 livrées 2026-05-11 (Phase 6 nettoyage actif reportée) · **Prio** : P1 · **Taille** : L (1-2 jours, élargi 2026-05-05)
**Lié à** : `project_v3_transition.md` (étape 1), `project_commercialization.md`, V3-VISUEL, SECU-INNERHTML, **ARCHI-MODULAR**
**Bloquant** : V3 visuelle (devrait être fait avant pour prioriser intelligemment) + ARCHI-MODULAR (le rapport de faisabilité oriente la refonte)

## ⚠️ Consigne fichiers index.html / index-test.html (mise à jour 2026-05-07)

Au 2026-05-07 : `index.html` (prod) et `index-test.html` (sandbox/bac à sable) sont **identiques** (4.4 MB / 31 190 lignes).

**Règle workflow (cf mémoire `feedback_sandbox_first.md`)** :
- Toute modif se fait d'abord dans `index-test.html`
- `index.html` (prod) ne reçoit les modifs **qu'après validation explicite de l'utilisateur**

**Application pour cette session AUDIT** :
- **Phases 1-5 + 7 (lecture)** : analyser `index.html` ou `index-test.html` (identiques aujourd'hui, peu importe)
- **Phase 6 (nettoyage actif)** :
  1. Modifier UNIQUEMENT `index-test.html`
  2. Bumper version dans `index-test.html`
  3. Tester ouverture `index-test.html` après chaque catégorie nettoyée
  4. 1 commit par catégorie de nettoyage avec mention "(sandbox)"
  5. ❌ **NE PAS toucher** `index.html` pendant cette session
  6. À la fin : produire un rapport listant les modifs faites pour que l'utilisateur valide la bascule vers prod
  7. **Bascule sandbox → prod** : commit séparé après validation utilisateur, en dehors du scope de cette session AUDIT

**Vérification après chaque commit Phase 6** :
- `diff index.html index-test.html` indique les modifs en attente de validation user
- L'utilisateur teste sur `index-test.html`
- Quand il valide, on bascule vers `index.html` dans une session de merge dédiée

## Contexte

`index.html` fait **30 083 lignes** au 2026-05-05 (vs ~17000 prévu initialement). Le monolithe devient un problème pour :
- **Maintenance** : difficile de comprendre l'architecture pour un dev junior ou un futur recrutement
- **Performance** : tout chargé au boot (parsing JS lourd au démarrage), pas de lazy-load par onglet
- **Sécurité** : ~107 sites `innerHTML=` non échappés (XSS)
- **Commercialisation V1** : un monolithe 30k lignes effraie les acquéreurs / investisseurs / développeurs

Avant d'attaquer V3-VISUEL puis V3-REFONTE-* onglet par onglet, faire un état des lieux complet de l'app + nettoyage safe + analyse de faisabilité modulaire pour :
- Cartographier le monofichier
- Inventaire pages/onglets et leur état UX
- Identifier + **nettoyer** zones de duplication / dead code / scope leaks / patches inutiles / console.log oubliés
- Repérer les vulnérabilités sécu (XSS, OAuth, PWA)
- Mesurer la perf (rendus, DB ops, Drive sync)
- **Recommander une stratégie de modularisation** (sans bundler / ES modules natifs / bundler Vite)

Output : 2 rapports priorisés (`docs/strategie/AUDIT-CODE.md` + `docs/strategie/ARCHI-MODULAR-FAISABILITE.md`) + commits de nettoyage safe.

## Scope

### Phase Audit-1 : cartographie code
- [ ] Architecture du monofichier (sections, fonctions principales, namespaces)
- [ ] Inventaire des pages/onglets (`#p-*` divs) et de leur état UX
- [ ] Liste des helpers réutilisables vs code spécifique
- [ ] Conventions de naming respectées ou pas (camelCase, PascalCase, magic strings)

### Phase Audit-2 : sécurité
- [ ] **XSS** : auditer les ~107 occurrences `innerHTML=` (10 wrappés en v12.33-40, le reste à classifier)
  - Renders tableaux/cartes/modales : `baux-hist-tbody`, `mv-tbody`, `quit-tbody`, `ass-tbody`, `mrh-tbody`, `edl-tbody`, etc.
  - Sites injection contrôlée vs sites avec input user
- [ ] **Injection** : localStorage (DB → JSON.parse), Drive (payload non vérifié)
- [ ] **OAuth** : flow Google Identity Services, expiration token, refresh, scopes
- [ ] **PWA** : SW cache, version bump, fallback offline

### Phase Audit-3 : performance
- [ ] Pages "lourdes" (rendu) : dashboard (déjà profilé), autres ?
- [ ] DB operations : `filter` massifs, indexation manuelle ?
- [ ] Drive sync : taille payloads, latence réseau, race conditions (cf DRIVE-2F)
- [ ] localStorage taille (DB JSON ~700 Ko vu, limite 5-10 Mo)

### Phase Audit-4 : code quality
- [ ] Duplication (helpers communs à extraire ?)
- [ ] Dead code (fonctions non appelées, branches mortes)
- [ ] Scope leaks (variables globales involontaires)
- [ ] Conventions ES5 vs ES6 (var/const/let, function/arrow)

### Phase Audit-5 : rapport priorisé
- [ ] Output : `docs/strategie/AUDIT-CODE.md` avec :
  - Top 5 risques sécu (avec code:line)
  - Top 5 quick wins perf
  - Top 10 dettes techniques classées par effort/impact
  - Liste exhaustive des patches inutiles (commentaires `// FIX`, `// TODO`, `// HACK` avec contexte)
  - Liste des `console.log` / `console.error` / `debugger` oubliés
  - Liste des fonctions mortes (jamais appelées)
  - Liste des duplications majeures (extraire helper recommandé)
  - Recommandations pour V3-VISUEL et V3-REFONTE

### Phase Audit-6 : nettoyage actif (commits safe)
**Objectif** : effectuer les nettoyages **non-comportementaux** identifiés en Audit-1→4. Pas de refacto fonctionnel — uniquement les opérations sûres.

Catégories de nettoyage **autorisées dans cette phase** (1 commit par catégorie) :
- [ ] **`console.log` / `console.warn` / `debugger` oubliés** (sauf ceux dans `_drv*` qui sont diagnostics utiles)
- [ ] **Commentaires obsolètes** : `// TODO 2024-...`, `// FIX patch v12.x`, `// HACK temporaire`
- [ ] **Code mort prouvé** : fonctions définies jamais appelées (vérifier grep zéro occurrence + cf indexer)
- [ ] **Variables inutilisées** : déclarées et jamais lues (linter manuel)
- [ ] **Imports / globals inutiles** : helpers définis et jamais utilisés
- [ ] **Duplications strictes** : 2+ blocs identiques → extraire helper (uniquement si trivial, sinon en backlog ARCHI-DEDUP)
- [ ] **Magic strings standardisables** : extraire en const partagées (limité, pas de gros refacto)
- [ ] **Indentation / formatting** : si inconsistant et que ça aide à la lisibilité (sans formatter auto qui changerait tout)

Catégories **HORS scope cette phase** (renvoyer en backlog dédié) :
- ❌ Refonte fonction lourde (>200 lignes) → sujet backlog dédié
- ❌ Changement de signature publique de fonction (impact en chaîne)
- ❌ `innerHTML` → `textContent` ou template (renvoi à `SECU-INNERHTML`)
- ❌ Migration ES5→ES6 systématique (renvoi à sujet dédié)
- ❌ Modularisation (renvoi à `ARCHI-MODULAR`)

Workflow obligatoire : 1 commit par catégorie + tester l'app après chaque commit (fonctionne en local + dashboard charge + onglets navigables).

### Phase Audit-7 : analyse de faisabilité modulaire
**Objectif** : produire `docs/strategie/ARCHI-MODULAR-FAISABILITE.md` qui répond à la question : faut-il découper `index.html` en modules ?

Contenu du rapport :
- [ ] **Métriques actuelles** :
  - Nombre de lignes par section (HTML / CSS / JS) avec graphique répartition
  - Top 20 fonctions les plus longues
  - Top 20 fonctions les plus appelées (= candidats core)
  - Tableau "fonction → onglet appelant" pour identifier les frontières
- [ ] **3 stratégies évaluées** (forces/faiblesses/coûts) :
  1. **Status quo** (rester monolithe) : OK si <50k lignes, simplicité déploiement
  2. **ES modules natifs sans bundler** : 1 fichier JS par onglet + 1 core.js, `<script type="module">`. Pas de build, déploiement Vercel/Cloudflare statique
  3. **Bundler Vite** (ou esbuild/Rollup) : minification + tree-shaking + lazy-load + HMR. Build step à maintenir.
- [ ] **Recommandation chiffrée** :
  - Coût migration en jours-homme par stratégie
  - Risque de régression
  - Bénéfices concrets (perf chiffrée, maintenance, embarquement futurs devs)
  - Compatibilité avec Drive sync, IndexedDB, OAuth GIS, PWA
- [ ] **Plan de découpage proposé** (si stratégie 2 ou 3 retenue) :
  - Ossature `js/core/` (DB, Drive, helpers, utils, design system) → ~5000-8000 lignes
  - Onglets `js/tabs/` : 1 module par onglet (`dashboard.js`, `baux.js`, `edl.js`, etc.) → 13 modules ~1500-3000 lignes chacun
  - Composants `js/components/` (modales, FichesPourBien, signature canvas, etc.)
  - Diagramme de dépendances entre modules
  - Commande de migration progressive (1 onglet à la fois, parallèle au refactor)
- [ ] **Décisions à arbitrer par utilisateur** (à inclure dans le rapport) :
  - Stratégie cible (1, 2 ou 3)
  - Calendrier (avant V1 commerciale Q4 2026 ou après V1 ?)
  - Recrutement éventuel d'un dev junior pour assister le découpage

## Outils

- **Agent Explore** (Claude Code) pour cartographier rapidement
- **Slash commands** : `/review` (code review), `/security-review` (sécu)
- **Skill frontend-design** pour analyse UI

## Décisions à prendre

- [ ] Faire l'audit en 1 session 5h ou en 5 sessions 1h (par phase) ?
  - **Reco** : 1 session 3-5h pour avoir une vision globale cohérente
- [ ] Inclure ou non un audit accessibilité (a11y) ?
  - **Reco** : OUI sinon ça remontera plus tard, prefers-reduced-motion / contrast déjà en place sur dashboard

## Prompt de démarrage de session

```
On attaque AUDIT-GLOBAL.
Lis : BACKLOG.md, docs/subjects/AUDIT-GLOBAL.md, project_v3_transition.md.

Workflow :
1. Confirme le scope (5 phases d'audit)
2. Lance l'agent Explore pour la cartographie (Phase Audit-1)
3. Lance /security-review pour Phase Audit-2
4. Audit perf manuel + skill frontend-design pour UI
5. Output : docs/audit-2026-04.md priorisé

Estimation : 3-5h en session dédiée.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite vérification mémoire `project_v3_transition.md` (j'avais oublié l'étape 1 audit dans le BACKLOG initial)
- 2026-05-05 : scope élargi (Phase 6 nettoyage + Phase 7 analyse modulaire)
- 2026-05-07 : ajout consigne sandbox-first (Phase 6 sur index-test uniquement)
- 2026-05-11 : **Phases 1-5 + 7 livrées en session pilotage**. 2 rapports produits :
  - `docs/strategie/AUDIT-CODE.md` (cartographie, sécu 157 innerHTML, perf, code quality, top recommandations)
  - `docs/strategie/ARCHI-MODULAR-FAISABILITE.md` (3 stratégies évaluées, reco Stratégie 2 ES modules natifs en Q1 2027 post-V1)
  - **Phase 6 reportée** : 2011 lignes uncommitted dans `index*.html` empêchent un nettoyage propre. Pré-requis : commit propre des features v14.63→v14.76 avant. Plan détaillé dans AUDIT-CODE.md section Phase 6.
