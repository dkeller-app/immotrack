# REPORTING-BAILLEUR — Spec de port PROD (`index-test-finance.html` → `index.html`)

> **Pour la SESSION MAÎTRE** (intégratrice `index.html`). La feature Finances est validée user
> (« ok ça fonctionne ») + auditée `code-reviewer`. Elle vit dans **`index-test-finance.html`**
> (sandbox dédié). `index.html` (prod) n'en a **aucune trace**. Ce doc liste EXACTEMENT quoi porter.
>
> **Source de vérité = `index-test-finance.html`.** Méthode conseillée : `git diff index.html
> index-test-finance.html`, garder les hunks **Finances** ci-dessous, **ignorer** les hunks sandbox
> (section EXCLURE). Prod et sandbox partagent la même architecture nav/`_V4_NAV_ICONS`/
> `_v4FilterEnt`/`_projectionLogement` → insertions aux points analogues.

## 0. Déjà sur `main` (vérifier, aucune action sinon)
- `js/core/finances-summary.js` (module pur `_computeFinancesSummary`).
- `js/main.js` : `import` + `window._computeFinancesSummary = …` + symbole dans le checklist
  `__IMMOTRACK_MODULE_BOOTSTRAP__`. (Commits early, poussés avant le blocage de push.)

## 1. À AJOUTER dans `index.html` (la feature Finances)

Repères = `grep` dans `index-test-finance.html`. Points d'insertion prod entre parenthèses.

| # | Bloc | Repère (grep dans index-test-finance.html) | Insertion prod (index.html) |
|---|---|---|---|
| A | **CSS** `#p-finances …` (~90 lignes) + `#p-export .fin-hl` | `#p-finances .fin-top` | dans un `<style>` |
| B | **Conteneur page** `<div class="page" id="p-finances"><div id="fin-root">…</div></div>` | `id="p-finances"` | parmi les `.page` |
| C | **Item nav ACTIF** `<div class="v4s-a" onclick="go('finances',this)">…Finances</div>` (section Comptabilité, après `<h6>Comptabilité</h6>`) **+** clé `finances:` dans `_V4_NAV_ICONS` | `_V4_NAV_ICONS.finances`, `go('finances',this)` | `navHtml` (prod ~6603), `_V4_NAV_ICONS` (prod ~6510) |
| D | **Item nav statique `.ni`** `data-module="finances-hub"` (si la prod garde le menu .ni) | `finances-hub` | bloc `.ni` |
| E | **Wiring `go()`** : `finances:'Finances'` (titles) + `finances:()=>{ if(typeof rFinances==='function') rFinances(); }` (renders) | `finances:'Finances'` | maps `titles`/`renders` de `go()` |
| F | **Branche `_v4FilterEnt`** : cas `currentPage==='finances'` (filtre sur place, ne rebondit pas au dashboard) | `currentPage === 'finances'` | `_v4FilterEnt` (prod ~6681) |
| G | **Widget dashboard B** : dans `_projectionLogement` (prod ~7702) → branche vacant qui pose `reste`=mois futurs ; boucle `attenduEcoule`/`encaisseTotal` ; carte `k5` `v4s-k-ae` ; `_DD['loyers-ae']` | `attenduEcoule`, `v4s-k-ae`, `'loyers-ae'` | autour de `_projectionLogement` + assemblage `row2Html` |
| H | **Toutes les fonctions `_fin*`** (bloc, ~350 lignes) : `_finActiveEnt`, `_finEntScope`, `_finInScope`, `_ligne2044Type`, `_finCatLigne`, `_finSuggestLigne`, `_finUnmappedCats`, `_FIN_2044_OPTIONS`, `_finOpenCatMapping`, `_finSaveCatMapping`, `_finCollect`, `_finRatio`, `rFinances`, `_finLoyersHC`, `_finChargeBuckets`, `_finRenderPL`, `_finOpenParLogement`, `_finIrlSousIndexation`, `_finRegulAFaire`, `_finRenderLeaks`, `_finGoExport`, `_finRenderExports` | `function _finActiveEnt` … `function _finRenderExports` | dans le `<script>` principal |
| I | **IDs cartes export** `id="exp-card-2044"` / `exp-card-bilan` / `exp-card-fec` sur les cartes de la page Export (les passerelles Finances y scrollent) | `exp-card-2044` | page `#p-export` prod |

## 2. À EXCLURE (sandbox-only — NE PAS porter en prod)
- `_loadDemoDataset` + dataset démo (`entBis`, `SCI DEMO`/`SCI BIS`, mvts démo).
- Détection mode test (`_isTestMode`, `KEY=_test_*`, head-script `data-lpboot`, `path.includes('index-test')`).
- Bandeau sandbox (`_injectTestModeBanner`, bouton « Charger dataset démo », « Reset DB test »).
- ⚠️ **GARDER** en revanche : `DB.catMapping` + l'éditeur de correspondance (`_finCatLigne` etc.) — c'est une **feature prod**, pas du sandbox.

## 3. Vérifs post-port (maître, avant push `main`)
1. `npm run test:run` vert (1481+).
2. `grep` symboles présents : `rFinances`, `id="p-finances"`, `finances:'Finances'`, `_finCatLigne`, `v4s-k-ae`.
3. Charger prod (copie locale) → onglet Finances rend, widget dashboard rend, pas d'erreur console.
4. **Bump version** (title + footer `index.html` + `sw.js` CACHE_VER).
5. **Audit `code-reviewer` du diff prod** (figures fiscales — règle non négociable).

## 4. Coordination / dépendances
- **`DB.catMapping` est interim** → à faire converger avec l'éditeur unifié de **V3-REFONTE-LOYERS Chantier A** (cf `CAT-MAPPING-2044.md`). Si la session loyers livre son éditeur, il supersède celui-ci (garder le schéma `{cat: ligne2044}`).
- Figures auditées côté sandbox (dernier audit commit `0922ffd`) : récupérables 229/230 exclus du résultat net, split HC par bail, N/N-1 même base, scope entité aligné `_compute2044`.

## 5. État source (commits locaux sandbox, NON poussés — push origin bloqué par concurrence)
`b42d34c` (menu actif) → `183611b` (année+entité+2 SCI) → `ab62c47` (éditeur mapping) →
`0922ffd` (correctifs audit). Tout dans `index-test-finance.html`. Le maître porte vers `index.html`.
