# Onglet Finances (analyse) + widget dashboard « Loyers attendu vs encaissé » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page d'analyse « Finances » (résultat net, compte de résultat, 3 ratios, argent à récupérer cliquable→opérationnel, passerelles 2044/FEC/Bilan) et remplacer le widget dashboard trompeur « Projection » par « Loyers : attendu vs encaissé », sans toucher au reste du dashboard.

**Architecture :** Tout le calcul lourd réutilise les fonctions existantes (`_computeBilanAnnuel`, `_compute2044`, `_listerImpayesActifs`, `computeIRLRevision`, `computeRegul`, helpers loyers). Le seul code « métier » neuf = un module pur d'arithmétique/ratios `js/core/finances-summary.js` (testé Vitest, exposé `window`). La page Finances est une fonction de rendu inline `rFinances()` qui orchestre ces appels et délègue l'arithmétique au module. Le widget dashboard réutilise les `attendu`/`realise` **déjà calculés** par `_projectionLogement` (pas de nouvelle logique) — simple changement de présentation + drill.

**Tech Stack :** Vanilla JS, monolithe `index-test.html` (~46 900 lignes, sandbox) + modules ESM `js/core/*.js` exposés sur `window` par `js/main.js`, tests Vitest (`__tests__/helpers/*.test.js`, `npm run test:run`).

---

## Contraintes de projet (non négociables — mémoire user)

1. **Sandbox-first** : TOUTES les modifs HTML vont dans `index-test.html`. On ne touche `index.html` (prod) **qu'après « OK » explicite** de l'utilisateur (dernière tâche du plan, gardée séparée).
2. **Dashboard 1 écran sans scroll** : contrainte dure. Le swap de widget ne change pas la hauteur (même emplacement `k5`). Aucun élément ajouté au dashboard sans validation hauteur.
3. **23 drill-downs préservés** : on remplace le contenu du drill `projection` ; on ne touche aucun autre `_DD[...]`.
4. **Réutiliser, ne pas réécrire** : `_computeBilanAnnuel`, `_compute2044`, `_listerImpayesActifs`, `computeIRLRevision`, `computeRegul`, `_loyerHCAtDate`, `_loyerProrataMois`, `_heroCashflowSeries`.
5. **Règle d'or navigation** : une alerte (impayé/IRL/régul/vacance) → page opérationnelle. Finances **chiffre** mais chaque ligne « argent à récupérer » route vers l'opérationnel ; jamais de cul-de-sac dans Finances.
6. **Comparaisons** : dashboard vs mois-1 ; Finances vs **N-1** (annuel).
7. **Figures financières sensibles** → **audit `superpowers:code-reviewer` obligatoire** avant de dire « prêt à tester ».
8. **Modify + verify** : après chaque modif, grep des sites collatéraux + vérifier que `index-test.html` reste syntaxiquement chargeable.
9. **Responsive 3 formats** : desktop 1440×900 / tablette 1024×768 / mobile 375×800 (le mockup validé fournit déjà le CSS responsive).
10. **Versioning** : bump `v15.X` (title + footer `index.html`) + message commit, uniquement à l'étape de wiring prod.
11. **INDEX-COMMIT-PROTOCOL** : ne pas pousser `index.html` sur main hors coordination ; voir `docs/INDEX-COMMIT-PROTOCOL.md` si sessions parallèles actives.

## Source de vérité visuelle

Mockup **validé user** 2026-06-05 : `mockups/finances/finances-tab.html`. La page Finances doit reproduire ses 4 sections dans l'ordre :
1. **fin-top** : hero « Résultat net · exercice N » (décomposition : Loyers HC encaissés − Charges propriétaire = Résultat net ; marge % ; ▲/▼ vs N-1) + 3 ratios (Recouvrement / Occupation / Poids des charges).
2. **Compte de résultat détaillé** : table `Poste | N | N-1 | Var. | % loyers`, groupes « Revenus locatifs » (loyers HC, provisions, total encaissé) et « Charges propriétaire » (intérêts d'emprunt, taxe foncière, travaux & entretien, honoraires & copro non récup., assurance PNO, total) + ligne « Résultat net ». Note « charges récupérables neutres » + lien « Voir par logement → ».
3. **Argent à récupérer · total €** : 4 lignes (Vacance → Biens · Impayé → Suivi loyers/quittances · IRL sous-indexés → Révision IRL · Régularisation → Régul), chacune cliquable vers l'opérationnel.
4. **Exports & déclaratif** : 3 entrées (Déclaration 2044 · Bilan annuel · Export FEC).

> **Note ratios :** le mockup validé montre **3 ratios** (Recouvrement / Occupation / Poids des charges) — pas le « rendement net » qui figurait dans la 1ʳᵉ version du texte de spec (il nécessiterait un prix d'acquisition non fiable dans les données). **On suit le mockup : 3 ratios.**

---

## Structure des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `js/core/finances-summary.js` | **Créer** | Module pur : arithmétique résultat net + 3 ratios + total à récupérer + var N-1. Aucune dépendance DOM/DB. |
| `__tests__/helpers/finances-summary.test.js` | **Créer** | Tests Vitest du module pur. |
| `js/main.js` | **Modifier** | Importer + exposer `window._computeFinancesSummary`. Additif, inerte pour prod tant que l'UI ne l'appelle pas. |
| `index-test.html` | **Modifier** | (a) swap widget `k5` projection → attendu/encaissé + drill ; (b) page `#p-finances` + nav + `titles`/`renders` + `rFinances()` + drill « par logement ». |
| `index.html` | **Modifier (DERNIÈRE tâche, après OK user)** | Reporter les mêmes modifs que `index-test.html` + bump version. |

---

## Repères de code (vérifiés ; les numéros de ligne peuvent dériver — toujours ré-ancrer par grep)

- `_projectionLogement` (arrow locale dans `_renderDashV4Premium`) ≈ L7591–7669. Retourne `{moisDebut, projection, attendu, realise, reste}`. **Contient déjà `attendu` et `realise`** = exactement « attendu vs encaissé ».
- Carte KPI `k5` (bouton projection) ≈ L7829–7835, assemblée L7837 : `const row2Html = '<section class="v4s-row2">' + k1 + k2 + k3 + k4 + k5 + '</section>';`
- Drill `_DD['projection'] = {title, html}` ≈ L7716–7799. Ouvert par `_openDD('projection')`.
- `_openDD(key)` ≈ L11990 : `const d=_DD[key]; if(!d)return; openDashDrill(d.title,d.html);`
- `go(page, elNav)` L5903–5966 : `titles` map L5918–5927, `renders` map L5942–5964. Pages = `<div class="page" id="p-XXX">`, toggle classe `.act`.
- Section sidebar « Finances » existante ≈ L97–101 (contient IRL + Régul) — c'est là qu'on ajoute l'entrée Finances.
- Gating profil : `_isModuleEnabled(moduleKey, profile, overrides)` L4200–4228 + `_renderSidebarFiltered()` L5729–5745 (lit `data-module`).
- `_computeBilanAnnuel(db, stdCategories, entityNom, year)` → `{entity, year, period, kpis:{totalRevenus,totalCharges,totalInterets,cashFlow,resultatFoncier,totalManqueAGagner,nbLogements,nbBauxHist,tauxOccupationGlobal}, fiscal, parLogement:[...], generatedAt}`. Exposé `window._computeBilanAnnuel`. **Per-entité** (boucler/ sommer si « toutes entités »).
- `_compute2044` (module) appelé via `window._compute2044(DB.mouvements, STD_CATEGORIES, opts)`.
- `_listerImpayesActifs(DB.logements, DB.baux, DB.mouvements)` → `[{ref, locataire, montantImpaye, ancienneteJours, statut, ...}]`.
- `computeIRLRevision(log)` → `{..., diff, nouveauHC, isApplicable, dejaApplique, insuffisant, pasEncoreApplicable}`.
- `computeRegul(from, to)` → map `{key → {ref, imm, provisions, charges, ...}}`.
- Handlers export existants : `openLegal2044()` L42473, `downloadFEC()` L42618, `openBilanAnnuel()` L42663 ; `rExport()` L42394 (peuple les selects via `_legal2044RefreshSelects`).
- Nav opérationnelle : `_dashGoImpayes()` L8595 (`go('quittances')` + filtre impayée) ; `go('irl',null)` ; `go('regul',null)` ; `go('biens',null)`.
- Pattern module→window : `js/main.js` import L65–67/69–71, exposition `window._X = _X;` L206–214, liste de contrôle L335–342.

---

# PARTIE A — Module pur `finances-summary.js` (TDD)

### Task A1 : Squelette du module + résultat net

**Files:**
- Create: `js/core/finances-summary.js`
- Test: `__tests__/helpers/finances-summary.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `__tests__/helpers/finances-summary.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { _computeFinancesSummary } from '../../js/core/finances-summary.js';

const baseInput = {
  loyersHC: 86800, provisions: 14200,
  charges: { interets: 11200, taxeFonciere: 9800, travaux: 6400, honoraires: 3100, assurance: 1600, autres: 0 },
  loyersHCN1: 83200, resultatNetN1: 51500,
  nbOcc: 12, nbTotal: 14,
  attenduHC: 88280, encaisseHC: 86800,
  recuperer: { vacance: 7660, impaye: 1480, irl: 1850, regul: 2200 }
};

describe('_computeFinancesSummary — résultat net', () => {
  it('résultat net = loyers HC − total charges propriétaire', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.totalCharges).toBe(32100);
    expect(r.resultatNet).toBe(54700);
  });
  it('marge nette = résultat net / loyers HC, arrondie au %', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.margePct).toBe(63);
  });
  it('variation vs N-1 en % signé, 1 décimale', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.varPct).toBeCloseTo(6.2, 1);
  });
  it('renvoie des nombres finis, jamais NaN, même avec entrées vides', () => {
    const r = _computeFinancesSummary({});
    expect(Number.isFinite(r.resultatNet)).toBe(true);
    expect(Number.isFinite(r.margePct)).toBe(true);
    expect(r.resultatNet).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm run test:run -- finances-summary`
Expected: FAIL — `Failed to resolve import "../../js/core/finances-summary.js"` (module inexistant).

- [ ] **Step 3 : Implémentation minimale**

Créer `js/core/finances-summary.js` :

```js
/**
 * core/finances-summary.js — Agrégation pure pour l'onglet Finances (REPORTING-BAILLEUR).
 *
 * AUCUNE logique métier nouvelle : reçoit des primitives déjà calculées par les
 * fonctions existantes (_computeBilanAnnuel, _compute2044, _listerImpayesActifs,
 * computeIRLRevision, computeRegul) et produit résultat net + ratios + total à
 * récupérer. Pure (pas de DOM, pas de DB) → testable Vitest.
 *
 * @param {Object} input
 * @param {number} input.loyersHC      Loyers hors charges encaissés sur l'exercice
 * @param {number} input.provisions    Provisions sur charges encaissées
 * @param {Object} input.charges       {interets,taxeFonciere,travaux,honoraires,assurance,autres}
 * @param {number} input.loyersHCN1    Loyers HC encaissés N-1
 * @param {number} input.resultatNetN1 Résultat net N-1
 * @param {number} input.nbOcc         Lots occupés
 * @param {number} input.nbTotal       Lots totaux
 * @param {number} input.attenduHC     Loyer HC attendu sur l'exercice (pour recouvrement)
 * @param {number} input.encaisseHC    Loyer HC effectivement encaissé
 * @param {Object} input.recuperer     {vacance,impaye,irl,regul}
 * @returns {Object} résultat agrégé
 */
export function _computeFinancesSummary(input) {
  const i = input || {};
  const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const loyersHC = n(i.loyersHC);
  const c = i.charges || {};
  const totalCharges = n(c.interets) + n(c.taxeFonciere) + n(c.travaux) + n(c.honoraires) + n(c.assurance) + n(c.autres);
  const resultatNet = loyersHC - totalCharges;
  const margePct = loyersHC > 0 ? Math.round(resultatNet / loyersHC * 100) : 0;
  const resultatNetN1 = n(i.resultatNetN1);
  const varPct = resultatNetN1 > 0 ? Math.round((resultatNet - resultatNetN1) / resultatNetN1 * 1000) / 10 : 0;
  return { loyersHC, provisions: n(i.provisions), totalEncaisse: loyersHC + n(i.provisions),
           totalCharges, resultatNet, margePct, resultatNetN1, varPct };
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm run test:run -- finances-summary`
Expected: PASS (4 tests du bloc « résultat net »).

- [ ] **Step 5 : Commit**

```bash
git add js/core/finances-summary.js __tests__/helpers/finances-summary.test.js
git commit -m "feat(finances): module pur _computeFinancesSummary — resultat net + marge + var N-1"
```

---

### Task A2 : Les 3 ratios (recouvrement / occupation / poids des charges)

**Files:**
- Modify: `js/core/finances-summary.js`
- Test: `__tests__/helpers/finances-summary.test.js`

- [ ] **Step 1 : Ajouter le test qui échoue**

Ajouter dans le fichier de test :

```js
describe('_computeFinancesSummary — ratios', () => {
  it('recouvrement = encaisseHC / attenduHC en %, 1 décimale', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.ratios.recouvrement).toBeCloseTo(98.3, 1); // 86800/88280
  });
  it('occupation = nbOcc / nbTotal en % entier', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.ratios.occupation).toBe(86); // 12/14
  });
  it('poids des charges = totalCharges / loyersHC en %, 1 décimale', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.ratios.poidsCharges).toBeCloseTo(37.0, 1); // 32100/86800
  });
  it('ratios bornés et sans division par zéro', () => {
    const r = _computeFinancesSummary({ nbTotal: 0, attenduHC: 0, loyersHC: 0 });
    expect(r.ratios.recouvrement).toBe(0);
    expect(r.ratios.occupation).toBe(0);
    expect(r.ratios.poidsCharges).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npm run test:run -- finances-summary`
Expected: FAIL — `Cannot read properties of undefined (reading 'recouvrement')` (pas de `ratios`).

- [ ] **Step 3 : Implémenter les ratios**

Dans `js/core/finances-summary.js`, juste avant le `return`, ajouter :

```js
  const attenduHC = n(i.attenduHC), encaisseHC = n(i.encaisseHC);
  const nbTotal = n(i.nbTotal), nbOcc = n(i.nbOcc);
  const ratios = {
    recouvrement: attenduHC > 0 ? Math.round(encaisseHC / attenduHC * 1000) / 10 : 0,
    occupation:   nbTotal > 0 ? Math.round(nbOcc / nbTotal * 100) : 0,
    poidsCharges: loyersHC > 0 ? Math.round(totalCharges / loyersHC * 1000) / 10 : 0
  };
```

Et ajouter `ratios` à l'objet retourné :

```js
  return { loyersHC, provisions: n(i.provisions), totalEncaisse: loyersHC + n(i.provisions),
           totalCharges, resultatNet, margePct, resultatNetN1, varPct, ratios };
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm run test:run -- finances-summary`
Expected: PASS (bloc résultat net + bloc ratios).

- [ ] **Step 5 : Commit**

```bash
git add js/core/finances-summary.js __tests__/helpers/finances-summary.test.js
git commit -m "feat(finances): 3 ratios (recouvrement/occupation/poids charges) + garde division par zero"
```

---

### Task A3 : Total « argent à récupérer »

**Files:**
- Modify: `js/core/finances-summary.js`
- Test: `__tests__/helpers/finances-summary.test.js`

- [ ] **Step 1 : Ajouter le test qui échoue**

```js
describe('_computeFinancesSummary — argent à récupérer', () => {
  it('total = somme des 4 postes (valeur absolue)', () => {
    const r = _computeFinancesSummary(baseInput);
    expect(r.aRecuperer.total).toBe(13190); // 7660+1480+1850+2200
    expect(r.aRecuperer.vacance).toBe(7660);
    expect(r.aRecuperer.impaye).toBe(1480);
    expect(r.aRecuperer.irl).toBe(1850);
    expect(r.aRecuperer.regul).toBe(2200);
  });
  it('postes manquants comptés comme 0', () => {
    const r = _computeFinancesSummary({ recuperer: { impaye: 500 } });
    expect(r.aRecuperer.total).toBe(500);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npm run test:run -- finances-summary`
Expected: FAIL — `Cannot read properties of undefined (reading 'total')`.

- [ ] **Step 3 : Implémenter**

Avant le `return`, ajouter :

```js
  const rec = i.recuperer || {};
  const aRecuperer = {
    vacance: n(rec.vacance), impaye: n(rec.impaye), irl: n(rec.irl), regul: n(rec.regul),
    total: n(rec.vacance) + n(rec.impaye) + n(rec.irl) + n(rec.regul)
  };
```

Ajouter `aRecuperer` à l'objet retourné (return final) :

```js
  return { loyersHC, provisions: n(i.provisions), totalEncaisse: loyersHC + n(i.provisions),
           totalCharges, resultatNet, margePct, resultatNetN1, varPct, ratios, aRecuperer };
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm run test:run -- finances-summary`
Expected: PASS (tous les blocs).

- [ ] **Step 5 : Commit**

```bash
git add js/core/finances-summary.js __tests__/helpers/finances-summary.test.js
git commit -m "feat(finances): total argent a recuperer (vacance+impaye+irl+regul)"
```

---

### Task A4 : Exposer le module sur `window` via `main.js`

**Files:**
- Modify: `js/main.js` (import ≈ L67, exposition ≈ L207, liste de contrôle ≈ L342)

- [ ] **Step 1 : Ajouter l'import**

Après le bloc `import { _computeBilanAnnuel, _formatBilanTexte } from './core/legal-bilan.js';` (≈ L65–67), ajouter :

```js
import {
  _computeFinancesSummary
} from './core/finances-summary.js';
```

- [ ] **Step 2 : Exposer sur window**

Après `window._formatBilanTexte = _formatBilanTexte;` (≈ L207), ajouter :

```js
// REPORTING-BAILLEUR — agrégat onglet Finances
window._computeFinancesSummary = _computeFinancesSummary;
```

- [ ] **Step 3 : Vérifier l'exposition**

Run: `node -e "import('./js/core/finances-summary.js').then(m=>console.log(typeof m._computeFinancesSummary))"`
Expected: `function`

- [ ] **Step 4 : Commit**

```bash
git add js/main.js
git commit -m "feat(finances): expose window._computeFinancesSummary depuis main.js"
```

---

# PARTIE B — Dashboard : swap widget `k5` projection → « Loyers attendu vs encaissé »

> Tout dans `index-test.html`. Le widget réutilise `attendu`/`realise` déjà renvoyés par `_projectionLogement`. **Pas de nouvelle math, pas de nouveau row** (même emplacement → 1 écran préservé).

### Task B1 : Remplacer la carte KPI `k5`

**Files:**
- Modify: `index-test.html` (carte `k5` ≈ L7829–7835)

- [ ] **Step 1 : Localiser le bloc actuel**

Run (grep d'ancrage) :
```
grep -n "v4s-k-projection" index-test.html
grep -n "row2Html = '<section class=\"v4s-row2\">'" index-test.html
```
Lire les ~60 lignes au-dessus de `k5` pour repérer les variables déjà disponibles dans le scope : `attendu`, `realise`, `projection`, `objAnnuel`, `ratioProj`, `ecartProj`, `projColor`, `fmt`, `esc`, `yr`. (Issues de l'agrégation `_projectionLogement` sur `scopeLogs` autour de L7670–7700.)

- [ ] **Step 2 : Repérer/établir les agrégats attendu vs encaissé**

Dans la boucle d'agrégation qui appelle `_projectionLogement(l)` (≈ L7675), vérifier qu'on cumule déjà `attenduTotal += p.attendu` et `realiseTotal += p.realise`. Si ces accumulateurs n'existent pas sous ces noms, les ajouter à côté de l'accumulation projection existante :

```js
// (dans la même boucle qui fait déjà const p = _projectionLogement(l);)
attenduTotalAE += (p.attendu || 0);
encaisseTotalAE += (p.realise || 0);
```

Déclarer `let attenduTotalAE = 0, encaisseTotalAE = 0;` juste avant la boucle. (Ne PAS retirer les accumulateurs de projection : le drill `projection` peut rester calculé ; on ne montre simplement plus la carte projection.)

- [ ] **Step 3 : Remplacer le HTML de la carte `k5`**

Remplacer le bloc `const k5 = '<button ... v4s-k-projection ...>' ... '</button>';` par :

```js
const ecartAE = encaisseTotalAE - attenduTotalAE;            // négatif = manque
const pctAE = attenduTotalAE > 0 ? Math.round(encaisseTotalAE / attenduTotalAE * 100) : 0;
const aeColor = (ecartAE >= 0) ? 'pos' : (pctAE >= 90 ? 'warn' : 'neg');
const k5 = '<button type="button" class="v4s-k v4s-k-ae" onclick="_openDD(\'loyers-ae\')" aria-label="Voir le détail attendu vs encaissé">'
  + '<div class="v4s-k-lab">Loyers ' + esc(yr) + '<span class="v4s-pill ' + aeColor + '">' + pctAE + ' %</span></div>'
  + '<div class="v4s-k-val ' + aeColor + '">' + (typeof fmt === 'function' ? fmt(encaisseTotalAE) : encaisseTotalAE) + '</div>'
  + '<div class="v4s-k-ctx">encaissé sur <strong style="color:var(--t1)">' + (typeof fmt === 'function' ? fmt(attenduTotalAE) : attenduTotalAE) + '</strong> attendu</div>'
  + '<div class="v4s-k-ft">Écart ' + (ecartAE >= 0 ? '+' : '') + (typeof fmt === 'function' ? fmt(ecartAE) : ecartAE) + '</div>'
  + '</button>';
```

(Le sparkline `projSpark` est retiré : « attendu vs encaissé » est un fait cumulé, pas une trajectoire — cohérent avec « aucun montant futur inventé ».)

- [ ] **Step 4 : Vérification visuelle**

Servir le sandbox : `npx http-server -p 8080 -c-1` puis ouvrir `http://localhost:8080/index-test.html`, charger des données (bouton « 🎲 Charger dataset démo » — JAMAIS d'auto-injection), aller au Tableau de bord.
Expected : la 5ᵉ carte de la rangée KPI affiche « Loyers <année> · X % », valeur = encaissé, contexte « encaissé sur Y attendu », footer « Écart ±Z ». La rangée tient sur la même ligne (pas de débordement). Le dashboard tient toujours sur 1 écran sans scroll en 1440×900.

- [ ] **Step 5 : Commit**

```bash
git add index-test.html
git commit -m "feat(dash): widget Loyers attendu vs encaisse en remplacement de Projection (sandbox)"
```

---

### Task B2 : Drill `loyers-ae` (opérationnel + bouton « Analyser dans Finances »)

**Files:**
- Modify: `index-test.html` (à côté de la définition `_DD['projection']` ≈ L7716–7799)

- [ ] **Step 1 : Ajouter la définition du drill**

Juste après le bloc `_DD['projection'] = {...};`, ajouter une nouvelle entrée `_DD['loyers-ae']`. Réutiliser les variables de scope (`attenduTotalAE`, `encaisseTotalAE`, `ecartAE`, `pctAE`, `fmt`, `yr`, `scopeLogs`). Contenu : explication de l'écart, orienté **action opérationnelle**, + bouton vers Finances.

```js
_DD['loyers-ae'] = {
  title: 'Loyers attendu vs encaissé — ' + yr,
  html: ''
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px">'
    +   '<div style="padding:16px 18px;background:var(--sur2);border-radius:12px;border:1px solid var(--bor)">'
    +     '<div style="font:700 10.5px/1 \'JetBrains Mono\',monospace;color:var(--t3);text-transform:uppercase;letter-spacing:.08em">Attendu</div>'
    +     '<div style="font:900 28px/1.1 \'Manrope\',sans-serif;color:var(--t1);margin-top:8px">' + fmt(attenduTotalAE) + '</div>'
    +   '</div>'
    +   '<div style="padding:16px 18px;background:var(--sur2);border-radius:12px;border:1px solid var(--bor)">'
    +     '<div style="font:700 10.5px/1 \'JetBrains Mono\',monospace;color:var(--t3);text-transform:uppercase;letter-spacing:.08em">Encaissé</div>'
    +     '<div style="font:900 28px/1.1 \'Manrope\',sans-serif;color:var(--t1);margin-top:8px">' + fmt(encaisseTotalAE) + '</div>'
    +   '</div>'
    +   '<div style="padding:16px 18px;background:var(--sur2);border-radius:12px;border:1px solid var(--bor)">'
    +     '<div style="font:700 10.5px/1 \'JetBrains Mono\',monospace;color:var(--t3);text-transform:uppercase;letter-spacing:.08em">Écart</div>'
    +     '<div style="font:900 28px/1.1 \'Manrope\',sans-serif;color:' + (ecartAE >= 0 ? 'var(--pos)' : 'var(--neg)') + ';margin-top:8px">' + (ecartAE >= 0 ? '+' : '') + fmt(ecartAE) + '</div>'
    +   '</div>'
    + '</div>'
    + '<div style="padding:14px;background:var(--sur2);border-radius:10px;border:1px solid var(--bor);font-size:12.5px;color:var(--t2);line-height:1.6;margin-bottom:16px">'
    +   'L\'écart entre attendu et encaissé vient surtout des <strong>impayés</strong>, des <strong>vacances</strong> et des <strong>loyers non révisés (IRL)</strong>. '
    +   'Pour <strong>agir</strong>, utilise les actions priorisées du tableau de bord (relances, indexation). '
    +   'Pour <strong>analyser</strong> l\'année (résultat net, charges, ratios) :'
    + '</div>'
    + '<div style="display:flex;justify-content:flex-end">'
    +   '<button type="button" onclick="closeDashDrill && closeDashDrill(); go(\'finances\', null);" '
    +     'style="padding:10px 16px;border-radius:10px;border:1px solid var(--acc);background:var(--acc);color:#fff;font-weight:700;cursor:pointer">Analyser dans Finances →</button>'
    + '</div>'
};
```

> Si le nom de la fonction de fermeture du drill diffère, l'ancrer : `grep -n "function closeDashDrill\|openDashDrill" index-test.html`. Si aucune fermeture explicite n'existe, retirer l'appel `closeDashDrill &&` et laisser juste `go('finances', null)`.

- [ ] **Step 2 : Retirer la carte projection morte du DOM (pas la logique)**

Vérifier qu'aucun autre endroit ne rend encore un bouton `_openDD('projection')` visible dans la rangée KPI :
```
grep -n "_openDD('projection')" index-test.html
```
Expected après B1 : 0 occurrence dans le rendu de carte (le `_DD['projection']` peut rester défini sans être affiché — inerte, n'enfreint pas « 23 drill-downs préservés »).

- [ ] **Step 3 : Vérification visuelle**

Recharger le dashboard, cliquer la carte « Loyers <année> ».
Expected : le drill s'ouvre avec Attendu / Encaissé / Écart + texte orienté action + bouton « Analyser dans Finances → ». Le clic du bouton ferme le drill et navigue vers la page Finances (qui sera créée Partie C). (À ce stade `go('finances')` peut être inerte tant que la page n'existe pas — testé pleinement en C.)

- [ ] **Step 4 : Commit**

```bash
git add index-test.html
git commit -m "feat(dash): drill loyers-ae operationnel + bouton vers Finances (sandbox)"
```

---

# PARTIE C — Page « Finances » (UI inline `rFinances`)

### Task C1 : Conteneur de page `#p-finances`

**Files:**
- Modify: `index-test.html` (à côté des autres `<div class="page" id="p-...">`, ex. après `#p-export` ou `#p-pilotage`)

- [ ] **Step 1 : Ajouter le conteneur vide**

Localiser un conteneur existant : `grep -n '<div class="page" id="p-export"' index-test.html`. Ajouter, au même niveau, un nouveau conteneur :

```html
    <div class="page" id="p-finances">
      <div id="fin-root"><!-- rempli par rFinances() --></div>
    </div>
```

- [ ] **Step 2 : Vérifier l'unicité de l'id**

Run: `grep -n 'id="p-finances"' index-test.html`
Expected : 1 seule occurrence.

- [ ] **Step 3 : Commit**

```bash
git add index-test.html
git commit -m "feat(finances): conteneur de page #p-finances (sandbox)"
```

---

### Task C2 : Câblage navigation (sidebar + titles + renders)

**Files:**
- Modify: `index-test.html` (sidebar ≈ L97–101 ; `titles` map ≈ L5927 ; `renders` map ≈ L5963)

- [ ] **Step 1 : Ajouter l'entrée sidebar**

Dans la section sidebar « Finances » (`grep -n 'data-module-section="finances"' index-test.html`), ajouter en **première** ligne de la section (avant IRL) :

```html
    <div class="ni" data-module="finances-hub" data-tip="Finances — résultat net, charges, ratios" onclick="go('finances',this)"><span class="ico">💶</span><span class="ni-label"> Finances</span></div>
```

- [ ] **Step 2 : Enregistrer le titre**

Dans l'objet `titles` de `go()` (`grep -n "params:'Paramètres',export:'Export" index-test.html`), ajouter l'entrée :

```js
    finances:'Finances',
```

- [ ] **Step 3 : Enregistrer le render hook**

Dans l'objet `renders` de `go()` (`grep -n "    export:rExport," index-test.html`), ajouter avant `export:rExport,` :

```js
    finances:()=>{ if (typeof rFinances === 'function') rFinances(); },
```

- [ ] **Step 4 : Gating profil (visible pour tous)**

Vérifier que `finances-hub` n'est dans AUCUNE liste OFF de `_isModuleEnabled` (`grep -n "SOLO_OFF\|SCI_OFF\|PRO_OFF" index-test.html`). L'analyse financière est utile à tous les profils → on la laisse activée partout (`return true` par défaut). Ne rien ajouter aux listes OFF.

- [ ] **Step 5 : Vérification**

Recharger ; cliquer « Finances » dans la sidebar.
Expected : la page `#p-finances` reçoit `.act` (les autres la perdent), le titre topbar = « Finances », pas d'erreur console (`rFinances` inexistant ⇒ guard `typeof` évite le crash, page vide pour l'instant).

- [ ] **Step 6 : Commit**

```bash
git add index-test.html
git commit -m "feat(finances): navigation sidebar + titles + renders pour page Finances (sandbox)"
```

---

### Task C3 : `rFinances()` — collecte des primitives + rendu hero + ratios

**Files:**
- Modify: `index-test.html` (définir `function rFinances()` près de `rExport`/`rPilotage`)

- [ ] **Step 1 : Helper de scope entité (réutilise l'existant)**

Ajouter, juste avant la future `rFinances`, un petit collecteur qui s'appuie sur `_computeBilanAnnuel` (per-entité) et somme sur toutes les entités si aucune n'est sélectionnée. Ancrer la façon dont le dashboard détermine l'entité active : `grep -n "activeEnt" index-test.html | head`.

```js
function _finCollect(year) {
  const yr = year || (new Date().getFullYear() - 1);
  const ents = (DB.entites || []).filter(e => e && !e._deleted);
  const bilans = [];
  if (typeof window._computeBilanAnnuel === 'function') {
    ents.forEach(e => { const b = window._computeBilanAnnuel(DB, STD_CATEGORIES, e.nom, yr); if (b) bilans.push(b); });
  }
  return { yr, bilans };
}
```

- [ ] **Step 2 : Écrire `rFinances()` — garde + hero + ratios**

```js
function rFinances() {
  const root = el('fin-root');
  if (!root) return;
  // Dégradation gracieuse (mode file:// : modules ESM non chargés) — comme la page Export
  if (typeof window._computeFinancesSummary !== 'function' || typeof window._computeBilanAnnuel !== 'function') {
    root.innerHTML = '<div class="card" style="padding:20px"><div class="ct">Analyse financière indisponible</div>'
      + '<p style="color:var(--t2);font-size:13px;margin-top:8px">Ouvre l\'application via le serveur local (http-server) pour activer les calculs financiers.</p></div>';
    return;
  }
  const yr = (new Date().getFullYear() - 1); // exercice clos par défaut ; sélecteur années en C6 optionnel
  const { bilans } = _finCollect(yr);
  // --- Agrégats portefeuille (somme des bilans entités) ---
  const sum = (k) => bilans.reduce((s,b)=> s + (b.kpis[k]||0), 0);
  const loyersHC   = bilans.reduce((s,b)=> s + (b.fiscal && b.fiscal.totaux ? (b.fiscal.totaux.recettes215||0) : 0), 0);
  const totalRevenus = sum('totalRevenus');
  const provisions = Math.max(0, totalRevenus - loyersHC);
  const totalCharges = sum('totalCharges');
  const totalInterets = sum('totalInterets');
  const nbOcc = bilans.reduce((s,b)=> s + Math.round((b.kpis.tauxOccupationGlobal||0)/100 * (b.kpis.nbLogements||0)), 0);
  const nbTotal = sum('nbLogements');
  const vacance = sum('totalManqueAGagner');
  // N-1
  const { bilans: bilansN1 } = _finCollect(yr - 1);
  const sumN1 = (k) => bilansN1.reduce((s,b)=> s + (b.kpis[k]||0), 0);
  const loyersHCN1 = bilansN1.reduce((s,b)=> s + (b.fiscal && b.fiscal.totaux ? (b.fiscal.totaux.recettes215||0) : 0), 0);
  const resultatNetN1 = loyersHCN1 - sumN1('totalCharges');
  // Postes opérationnels (réutilisent les fonctions existantes)
  const impayes = (typeof _listerImpayesActifs === 'function')
    ? _listerImpayesActifs(DB.logements||[], DB.baux||{}, DB.mouvements||[]) : [];
  const impayeTotal = impayes.reduce((s,r)=> s + (r.montantImpaye||0), 0);
  const irlTotal = _finIrlSousIndexation();   // défini en C5
  const regulTotal = _finRegulAFaire(yr);      // défini en C5
  const attenduHC = loyersHC + impayeTotal;    // encaissé + restant dû ≈ attendu HC
  // --- Synthèse pure ---
  const S = window._computeFinancesSummary({
    loyersHC, provisions,
    charges: _finChargeBuckets(yr),            // défini en C4
    loyersHCN1, resultatNetN1,
    nbOcc, nbTotal,
    attenduHC, encaisseHC: loyersHC,
    recuperer: { vacance, impaye: impayeTotal, irl: irlTotal, regul: regulTotal }
  });
  // --- Rendu hero + ratios ---
  const f = (typeof fmt === 'function') ? fmt : (x=>x+' €');
  const sign = S.varPct >= 0 ? '▲ +' : '▼ ';
  root.innerHTML =
    '<div class="fin-top">'
    + '<div class="hero">'
    +   '<div class="eyebrow">Résultat net · exercice ' + yr + '</div>'
    +   '<div class="big num ' + (S.resultatNet>=0?'pos':'neg') + '">' + (S.resultatNet>=0?'+':'') + f(S.resultatNet) + '</div>'
    +   '<div><span class="pill ' + (S.varPct>=0?'up':'down') + '">' + sign + Math.abs(S.varPct) + ' %</span> '
    +     '<span style="color:var(--t2);font-size:12.5px">vs ' + (yr-1) + ' (' + f(S.resultatNetN1) + ') · marge nette ' + S.margePct + ' %</span></div>'
    +   '<div class="decomp">'
    +     '<div class="it"><span class="k">Loyers encaissés (HC)</span><span class="v num">' + f(S.loyersHC) + '</span></div>'
    +     '<div class="it"><span class="k">− Charges propriétaire</span><span class="v num neg">' + f(S.totalCharges) + '</span></div>'
    +     '<div class="it"><span class="k">= Résultat net</span><span class="v num">' + f(S.resultatNet) + '</span></div>'
    +   '</div>'
    + '</div>'
    + '<div class="sideStack">'
    +   _finRatio('Recouvrement', S.ratios.recouvrement, '%', S.ratios.recouvrement>=95?'pos':(S.ratios.recouvrement>=85?'warn':'neg'), impayes.length + ' impayé' + (impayes.length>1?'s':''))
    +   _finRatio('Occupation', S.ratios.occupation, '%', 'acc', nbOcc + ' / ' + nbTotal + ' loués')
    +   _finRatio('Poids des charges', S.ratios.poidsCharges, '%', S.ratios.poidsCharges<=40?'pos':'warn', f(S.totalCharges) + ' / ' + f(S.loyersHC))
    + '</div>'
    + '</div>'
    + '<div id="fin-pl"></div>'        // compte de résultat (C4)
    + '<div id="fin-leaks"></div>'     // argent à récupérer (C5)
    + '<div id="fin-exports"></div>';  // passerelles (C6)
  _finRenderPL(yr, bilans, S);         // C4
  _finRenderLeaks(S, impayes);         // C5
  _finRenderExports();                 // C6
}

function _finRatio(label, val, unit, color, tip) {
  const colorVar = ({pos:'var(--pos)',neg:'var(--neg)',warn:'var(--warn)',acc:'var(--acc)'})[color] || 'var(--t1)';
  const pctW = Math.max(0, Math.min(100, val));
  return '<div class="ratio"><div class="rl">' + label + '</div>'
    + '<div class="rv num" style="color:' + colorVar + '">' + (String(val).replace('.', ',')) + ' ' + unit + '</div>'
    + '<div class="meter"><i style="width:' + pctW + '%;background:' + colorVar + '"></i></div>'
    + '<div class="rt">' + (tip||'') + '</div></div>';
}
```

> **Vérifier les noms** : `el`, `fmt`, `STD_CATEGORIES`, `DB.entites`, `DB.baux`, `DB.logements` existent globalement (`grep -n "function el(\|const STD_CATEGORIES\|let STD_CATEGORIES" index-test.html`). Si `fmt` n'existe pas sous ce nom, ancrer le formateur monétaire réel (`grep -n "function fmt" index-test.html`).

- [ ] **Step 3 : Ajouter le CSS de la page (depuis le mockup validé)**

Copier depuis `mockups/finances/finances-tab.html` les règles `.fin-top`, `.hero`, `.eyebrow`, `.big`, `.pill`, `.decomp`, `.sideStack`, `.ratio`, `.meter`, `.pl` (table), `.leakrow`, `.bridge`, `.sec-title`, `.note`, `.tot`, `.net`, `.grp`, et leurs `@media` (1080/760/420). Les coller dans une balise `<style>` du sandbox, **préfixées** par `#p-finances` pour ne pas polluer le reste (ex. `#p-finances .hero{...}`). Adapter les variables `--bg/--sur/--acc/...` si la page app utilise déjà des tokens : `grep -n "\-\-acc:\|\-\-pos:\|\-\-sur2:" index-test.html` — réutiliser les tokens existants plutôt que les redéclarer.

- [ ] **Step 4 : Vérification visuelle**

Recharger, dataset démo, page Finances.
Expected : hero « Résultat net · exercice <N> » + décomposition cohérente (loyers HC − charges = net), 3 ratios avec barres. Les chiffres doivent être cohérents avec ceux de la page Export/Bilan pour la même entité/année (recoupement manuel : ouvrir Export → Bilan annuel et comparer résultat foncier vs résultat net affiché — écart attendu = traitement HC vs total, à documenter).

- [ ] **Step 5 : Commit**

```bash
git add index-test.html
git commit -m "feat(finances): rFinances hero + 3 ratios via _computeFinancesSummary (sandbox)"
```

---

### Task C4 : Compte de résultat détaillé (table N vs N-1)

**Files:**
- Modify: `index-test.html` (ajouter `_finChargeBuckets`, `_finRenderPL`)

- [ ] **Step 1 : Buckets de charges (groupement de catégories existantes)**

Ajouter une fonction qui regroupe les mouvements débit de l'année en 5 postes, par catégorie. Ancrer les noms réels des catégories : `grep -n "interets\|Taxe foncière\|taxe-fonciere\|assurance\|PNO\|copro" index-test.html | head -30` et inspecter `STD_CATEGORIES`. Adapter le mapping ci-dessous aux libellés/clefs réels.

```js
function _finChargeBuckets(year) {
  const yr = String(year);
  const inYear = m => m && !m._deleted && m.date && m.date.startsWith(yr) && (m.db||0) > 0;
  const cat = m => (m.cat || '').toLowerCase();
  const b = { interets:0, taxeFonciere:0, travaux:0, honoraires:0, assurance:0, autres:0 };
  (DB.mouvements||[]).filter(inYear).forEach(m => {
    const c = cat(m), v = Number(m.db)||0;
    if (/int.r.t|emprunt/.test(c)) b.interets += v;
    else if (/fonci/.test(c)) b.taxeFonciere += v;
    else if (/travaux|entretien|r.paration/.test(c)) b.travaux += v;
    else if (/honoraire|copro|syndic|gestion/.test(c)) b.honoraires += v;
    else if (/assurance|pno|gli/.test(c)) b.assurance += v;
    else if (typeof _isChargeRecupCategory === 'function' && _isChargeRecupCategory(m.cat)) { /* récupérable: neutre, exclu */ }
    else b.autres += v;
  });
  return b;
}
```

> **Important honnêteté comptable** : exclure les **charges récupérables** (le locataire rembourse) du résultat net, via `_isChargeRecupCategory` (existe : `grep -n "_isChargeRecupCategory" index-test.html`). Le bucket `autres` ne doit contenir QUE des charges propriétaire non récupérables.

- [ ] **Step 2 : Rendu de la table**

```js
function _finRenderPL(yr, bilans, S) {
  const host = el('fin-pl'); if (!host) return;
  const f = (typeof fmt === 'function') ? fmt : (x=>x+'');
  const cur = _finChargeBuckets(yr), prev = _finChargeBuckets(yr-1);
  const provN1Bilan = bilans; // (déjà calculé en amont ; provisions N-1 dispo via _finCollect(yr-1) si besoin)
  const pctL = v => S.loyersHC>0 ? (Math.round(v/S.loyersHC*1000)/10).toString().replace('.', ',')+' %' : '—';
  const varPct = (a,b) => b>0 ? (a>=b?'+':'−')+Math.abs(Math.round((a-b)/b*1000)/10).toString().replace('.', ',')+' %' : '—';
  const row = (label, n, n1, neg) => '<tr><td>' + label + '</td>'
    + '<td class="num' + (neg?' neg':'') + '">' + f(n) + '</td>'
    + '<td class="num">' + f(n1) + '</td>'
    + '<td class="num">' + varPct(n,n1) + '</td>'
    + '<td class="pct">' + pctL(n) + '</td></tr>';
  host.innerHTML =
    '<div class="sec-title">Compte de résultat détaillé</div>'
    + '<div class="card"><div class="card-h"><h3>Du 01/01/' + yr + ' au 31/12/' + yr + '</h3>'
    +   '<span class="sub">montants réels · % = part des loyers</span></div>'
    + '<div class="tbl-scroll"><table class="pl"><thead><tr><th>Poste</th><th>' + yr + '</th><th>' + (yr-1) + '</th><th>Var.</th><th>% loyers</th></tr></thead><tbody>'
    +   '<tr class="grp"><td colspan="5">Revenus locatifs</td></tr>'
    +   row('Loyers hors charges encaissés', S.loyersHC, S.resultatNetN1 + 0, false).replace('class="num"','class="num"') // valeur N-1 loyers : voir note
    +   '<tr><td>Provisions sur charges encaissées</td><td class="num">' + f(S.provisions) + '</td><td class="num">—</td><td class="num">—</td><td class="pct">—</td></tr>'
    +   '<tr class="tot"><td>Total encaissé</td><td class="num">' + f(S.totalEncaisse) + '</td><td class="num">—</td><td class="num">—</td><td class="pct">—</td></tr>'
    +   '<tr class="grp"><td colspan="5">Charges propriétaire (non récupérables)</td></tr>'
    +   row("Intérêts d'emprunt", cur.interets, prev.interets, true)
    +   row('Taxe foncière', cur.taxeFonciere, prev.taxeFonciere, true)
    +   row('Travaux & entretien', cur.travaux, prev.travaux, true)
    +   row('Honoraires & copro non récup.', cur.honoraires, prev.honoraires, true)
    +   row('Assurance PNO', cur.assurance, prev.assurance, true)
    +   (cur.autres>0 ? row('Autres charges propriétaire', cur.autres, prev.autres, true) : '')
    +   '<tr class="tot"><td>Total charges propriétaire</td><td class="num neg">' + f(S.totalCharges) + '</td><td class="num">' + f(prev.interets+prev.taxeFonciere+prev.travaux+prev.honoraires+prev.assurance+prev.autres) + '</td><td class="num">—</td><td class="pct">' + (S.ratios.poidsCharges.toString().replace('.', ',')) + ' %</td></tr>'
    +   '<tr class="net"><td>Résultat net</td><td class="num">' + (S.resultatNet>=0?'+':'') + f(S.resultatNet) + '</td><td class="num">' + f(S.resultatNetN1) + '</td><td class="num">' + (S.varPct>=0?'+':'') + S.varPct.toString().replace('.', ',') + ' %</td><td class="pct">' + S.margePct + ' %</td></tr>'
    + '</tbody></table></div>'
    + '<div class="note">Les charges récupérables sont neutres (le locataire rembourse). Résultat net = loyers HC − vos charges. '
    +   '<span class="lnk" onclick="_finOpenParLogement(' + yr + ')">Voir par logement →</span></div>'
    + '</div>';
}
```

> **Note loyers HC N-1** : remplacer le placeholder `S.resultatNetN1 + 0` par la vraie valeur `loyersHCN1` — la passer dans `S` (ajouter `loyersHCN1` au retour de `_computeFinancesSummary` en Task A1 step 3, ou la stocker dans une variable de scope de `rFinances` et la transmettre à `_finRenderPL`). **Action concrète :** ajouter `loyersHCN1: n(i.loyersHCN1)` à l'objet retourné par `_computeFinancesSummary` (Task A1) et un test associé ; puis utiliser `S.loyersHCN1` ici.

- [ ] **Step 3 : Drill « par logement »**

```js
function _finOpenParLogement(yr) {
  const { bilans } = _finCollect(yr);
  const rows = [];
  bilans.forEach(b => (b.parLogement||[]).forEach(l => rows.push(l)));
  const f = (typeof fmt === 'function') ? fmt : (x=>x+'');
  const html = '<table class="pl"><thead><tr><th>Logement</th><th>Locataire</th><th>Revenus</th><th>Charges</th><th>Cash-flow</th><th>Occ.</th></tr></thead><tbody>'
    + rows.map(l => '<tr><td>' + (l.ref||'') + '</td><td>' + (l.locataire||'—') + '</td>'
        + '<td class="num">' + f(l.revenus||0) + '</td><td class="num neg">' + f(l.charges||0) + '</td>'
        + '<td class="num">' + f(l.cashFlow||0) + '</td><td class="num">' + (l.tauxOccupation||0) + ' %</td></tr>').join('')
    + '</tbody></table>';
  if (typeof openDashDrill === 'function') openDashDrill('Résultat par logement — ' + yr, html);
}
```

> Ancrer le nom réel de la modale de drill : `grep -n "function openDashDrill\|function openM\b\|openModal" index-test.html`. Utiliser le mécanisme de modale générique de l'app si `openDashDrill` n'est pas accessible hors dashboard.

- [ ] **Step 4 : Vérification visuelle**

Page Finances : la table compte de résultat s'affiche avec les 2 groupes, totaux, ligne « Résultat net » en évidence, colonnes N / N-1 / Var / % loyers. Cliquer « Voir par logement → » ouvre la modale détail.
Recoupement : `Total charges propriétaire` = somme des 5 postes ; `Résultat net` = `Loyers HC − Total charges`.

- [ ] **Step 5 : Commit**

```bash
git add index-test.html
git commit -m "feat(finances): compte de resultat detaille N vs N-1 + drill par logement (sandbox)"
```

---

### Task C5 : « Argent à récupérer » — 4 lignes routant vers l'opérationnel (règle d'or)

**Files:**
- Modify: `index-test.html` (ajouter `_finIrlSousIndexation`, `_finRegulAFaire`, `_finRenderLeaks`)

- [ ] **Step 1 : Agrégats IRL et régul (réutilisent les fonctions existantes)**

```js
function _finIrlSousIndexation() {
  if (typeof computeIRLRevision !== 'function') return 0;
  let total = 0;
  (DB.logements||[]).filter(l => l && !l._deleted && l.locataire).forEach(l => {
    const rev = computeIRLRevision(l);
    if (rev && rev.isApplicable && !rev.dejaApplique && rev.diff > 0) total += rev.diff * 12; // gain annuel
  });
  return Math.round(total);
}

function _finRegulAFaire(yr) {
  // Estime le total des régularisations N-1 non encore émises (réutilise computeRegul)
  if (typeof computeRegul !== 'function') return 0;
  try {
    const res = computeRegul((yr) + '-01-01', (yr) + '-12-31');
    let total = 0;
    Object.values(res || {}).forEach(r => {
      const solde = (Number(r.charges)||0) - (Number(r.provisions)||0); // charges > provisions = à récupérer
      if (solde > 0) total += solde;
    });
    return Math.round(total);
  } catch(e) { console.warn('[finances] regul', e); return 0; }
}
```

> Ancrer la signature réelle de `computeRegul` et les clefs de son retour (`provisions`, `charges`) : `grep -n "function computeRegul" index-test.html` puis lire le `return`.

- [ ] **Step 2 : Rendu des 4 lignes (chaque clic → page opérationnelle)**

```js
function _finRenderLeaks(S, impayes) {
  const host = el('fin-leaks'); if (!host) return;
  const f = (typeof fmt === 'function') ? fmt : (x=>x+'');
  const R = S.aRecuperer;
  const nbImp = (impayes||[]).length;
  const leak = (icon, title, sub, dest, amount, cls, onclick) =>
    '<div class="leakrow" onclick="' + onclick + '"><span class="ic">' + icon + '</span>'
    + '<span class="tx"><b>' + title + '</b><s>' + sub + '</s><span class="dest">' + dest + '</span></span>'
    + '<span class="am ' + cls + ' num">' + amount + '</span><span class="go">→</span></div>';
  host.innerHTML =
    '<div class="sec-title">Argent à récupérer · ' + f(R.total) + '</div>'
    + '<div class="card" style="padding:8px 8px">'
    +   leak('⏳','Vacance locative','manque à gagner sur lots vides','→ va dans Biens pour relouer','−'+f(R.vacance),'neg',"go('biens',null)")
    +   leak('🚩','Loyer impayé', nbImp + ' locataire' + (nbImp>1?'s':'') + ' en retard','→ va dans Suivi des loyers pour relancer', f(R.impaye),'neg',"_dashGoImpayes()")
    +   leak('📈','Loyers sous-indexés (IRL)','baux non révisés','→ va dans Révision IRL pour indexer','+'+f(R.irl)+'/an','pos',"go('irl',null)")
    +   leak('⚖️','Régularisation de charges','provisions < charges réelles','→ va dans Régularisation pour éditer','+'+f(R.regul),'warn',"go('regul',null)")
    + '</div>'
    + '<div class="note">⚠️ Règle d\'or : Finances <b>chiffre</b> l\'argent à récupérer, mais chaque ligne t\'envoie <b>agir sur la page opérationnelle</b> — jamais de cul-de-sac dans Finances.</div>';
}
```

- [ ] **Step 3 : Vérification (routing opérationnel = règle d'or)**

Page Finances → cliquer chaque ligne :
- Vacance → page Biens (`go('biens')`).
- Impayé → Suivi des loyers / Quittances filtrées impayées (`_dashGoImpayes()`).
- IRL → page Révision IRL (`go('irl')`).
- Régul → page Régularisation (`go('regul')`).
Expected : on quitte Finances vers la page opérationnelle à chaque clic. **Aucun** clic ne reste dans Finances.

- [ ] **Step 4 : Commit**

```bash
git add index-test.html
git commit -m "feat(finances): argent a recuperer (4 lignes) routant vers operationnel (regle d'or) (sandbox)"
```

---

### Task C6 : Passerelles exports (2044 / Bilan / FEC) vers la page Export

**Files:**
- Modify: `index-test.html` (ajouter `_finRenderExports`, `_finGoExport`)

> Décision ② (validée) : boutons **dans Finances** réutilisant les fonctions existantes ; **la page Export reste en parallèle**. Implémentation robuste = la passerelle **navigue vers Export** (qui peuple ses selects via `rExport()`/`_legal2044RefreshSelects`) et **scrolle/surligne** la carte cible. On ne duplique aucune logique de calcul.

- [ ] **Step 1 : Helper de navigation vers Export**

```js
function _finGoExport(anchorId) {
  go('export', null);
  setTimeout(() => {
    const target = anchorId && el(anchorId);
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior:'smooth', block:'center' });
      target.classList.add('fin-hl');
      setTimeout(()=> target.classList.remove('fin-hl'), 1800);
    }
  }, 150);
}
```

> Ancrer les vrais ids des cartes Export 2044 / Bilan / FEC : `grep -n "id=\"legal-2044-result\"\|id=\"bilan-result\"\|FEC\|legal-2044\|bilan-ent" index-test.html`. Utiliser l'id du **conteneur de carte** le plus proche (ex. une `.card` parente). Si les cartes n'ont pas d'id, ajouter `id="exp-card-2044"`, `id="exp-card-bilan"`, `id="exp-card-fec"` aux `.card` correspondantes dans `#p-export`.

- [ ] **Step 2 : Rendu des 3 passerelles**

```js
function _finRenderExports() {
  const host = el('fin-exports'); if (!host) return;
  const item = (icon, title, sub, anchor) =>
    '<a onclick="_finGoExport(\'' + anchor + '\')"><span class="ic">' + icon + '</span>'
    + '<span class="tx"><b>' + title + '</b><s>' + sub + '</s></span></a>';
  host.innerHTML =
    '<div class="sec-title">Exports &amp; déclaratif</div>'
    + '<div class="bridge">'
    +   item('🧾','Déclaration 2044','Revenus fonciers pré-remplis','exp-card-2044')
    +   item('📚','Bilan annuel','Synthèse comptable','exp-card-bilan')
    +   item('🗄️','Export FEC','Écritures comptables','exp-card-fec')
    + '</div>'
    + '<div class="note">Ces exports réutilisent les calculs déjà présents dans la page Export — Finances ne fait que les rassembler ici (pas de recalcul).</div>';
}
```

- [ ] **Step 3 : CSS highlight**

Ajouter au `<style>` du sandbox : `#p-export .fin-hl{outline:2px solid var(--acc);outline-offset:3px;transition:outline .2s;border-radius:12px}`.

- [ ] **Step 4 : Vérification**

Page Finances → cliquer « Déclaration 2044 » : navigue vers Export, scrolle et surligne la carte 2044. Idem Bilan et FEC. Les générateurs existants restent ceux d'Export (aucune duplication).

- [ ] **Step 5 : Commit**

```bash
git add index-test.html
git commit -m "feat(finances): passerelles 2044/Bilan/FEC vers page Export (highlight, sans duplication) (sandbox)"
```

---

# PARTIE D — Vérification, responsive, audit

### Task D1 : Suite Vitest complète

- [ ] **Step 1 : Lancer toute la suite**

Run: `npm run test:run`
Expected : PASS (la nouvelle suite `finances-summary` + aucune régression sur les suites existantes).

- [ ] **Step 2 : Commit (si ajustements)**

```bash
git add -A
git commit -m "test(finances): suite verte complete"
```

---

### Task D2 : Vérif intégrité sandbox + grep collatéraux

- [ ] **Step 1 : Pas d'auto-injection démo**

Run: `grep -n "_loadDemoDataset" index-test.html`
Expected : `_loadDemoDataset` n'est appelé QUE depuis le bouton manuel, JAMAIS depuis `initDB()` (règle non négociable). Si une référence est apparue dans `initDB`, la retirer.

- [ ] **Step 2 : Vérifier les symboles ajoutés**

Run :
```
grep -n "id=\"p-finances\"\|finances:'Finances'\|finances:()=>\|function rFinances\|_openDD('loyers-ae')\|v4s-k-ae" index-test.html
```
Expected : page (1), titre (1), render hook (1), rFinances (1), drill onclick (1), classe widget (1).

- [ ] **Step 3 : Chargeabilité**

Servir le sandbox et ouvrir la console : `npx http-server -p 8080 -c-1` → `http://localhost:8080/index-test.html`. Aucune erreur JS au boot, à la navigation Finances, ni au retour Dashboard.

- [ ] **Step 4 : Commit (si fix)**

```bash
git add index-test.html
git commit -m "fix(finances): integrite sandbox + nettoyage collateraux"
```

---

### Task D3 : Responsive 3 formats

- [ ] **Step 1 : Vérifier aux 3 tailles**

Dans le navigateur (DevTools responsive) : 1440×900 (desktop), 1024×768 (tablette), 375×800 (mobile).
Expected (cohérent avec le mockup) :
- Desktop : `fin-top` en 2 colonnes (hero + 3 ratios empilés).
- Tablette : ratios passent en grille horizontale, table compte de résultat scrollable horizontalement (`.tbl-scroll`).
- Mobile : tout en 1 colonne, lignes « argent à récupérer » lisibles, montants non tronqués.

- [ ] **Step 2 : Ajuster le CSS @media si nécessaire**, puis commit :

```bash
git add index-test.html
git commit -m "style(finances): responsive desktop/tablette/mobile (sandbox)"
```

---

### Task D4 : Audit code-reviewer (OBLIGATOIRE — figures financières)

- [ ] **Step 1 : Lancer l'agent d'audit**

Dispatcher l'agent `superpowers:code-reviewer` sur le diff complet (module `finances-summary.js` + tests + `main.js` + `index-test.html`), brief :
> Auditer l'exactitude des figures financières (résultat net = loyers HC − charges propriétaire non récupérables ; charges récupérables bien EXCLUES ; ratios sans division par zéro ; var N-1 ; cohérence avec `_computeBilanAnnuel`/`_compute2044`). Vérifier la règle d'or (chaque ligne « argent à récupérer » route vers l'opérationnel, jamais de cul-de-sac). Vérifier qu'aucune logique métier n'a été dupliquée vs les fonctions existantes. Vérifier la dégradation gracieuse en mode file://.

- [ ] **Step 2 : Corriger les findings**, puis commit :

```bash
git add -A
git commit -m "fix(finances): corrections post-audit code-reviewer"
```

- [ ] **Step 3 : STOP — ne pas dire « prêt à tester » avant audit vert.**

---

### Task D5 : Wiring PROD `index.html` (UNIQUEMENT après « OK » explicite user)

> **Gate sandbox-first.** Ne PAS exécuter cette tâche tant que l'utilisateur n'a pas validé le sandbox et dit « OK pour la prod ».

- [ ] **Step 1 : Reporter les modifs HTML dans `index.html`**

Appliquer à `index.html` exactement les mêmes éditions qu'à `index-test.html` (swap widget `k5` + drill `loyers-ae` ; conteneur `#p-finances` ; sidebar/`titles`/`renders`/`rFinances` + helpers + CSS `#p-finances`/`#p-export .fin-hl`). `js/main.js` + `js/core/finances-summary.js` sont déjà partagés (rien à reporter).

- [ ] **Step 2 : Bump version**

Dans `index.html` : `<title>ImmoTrack v15.258</title>` (L6) et footer `<em>v15.258</em>` (≈ L57). (Partir de la version courante `v15.257` → incrémenter.)

- [ ] **Step 3 : Vérifier la parité sandbox/prod**

Run: `grep -n "id=\"p-finances\"\|function rFinances\|v4s-k-ae" index.html`
Expected : mêmes symboles présents qu'en sandbox.

- [ ] **Step 4 : Coordination commit index.html**

Respecter `docs/INDEX-COMMIT-PROTOCOL.md` (file `.index-queue/QUEUE.md` si sessions parallèles). Puis commit :

```bash
git add index.html
git commit -m "feat(finances): onglet Finances + widget attendu/encaisse en prod — v15.258"
```

- [ ] **Step 5 : MAJ BACKLOG + sujet**

Mettre `BACKLOG.md` (ligne REPORTING-BAILLEUR) et `docs/subjects/REPORTING-BAILLEUR.md` en ✅ Livré v15.258 + commit `Pilotage : REPORTING-BAILLEUR livré v15.258`.

---

## Self-review (effectuée à l'écriture du plan)

- **Couverture spec** : ✅ widget attendu/encaissé (B1-B2), ✅ résultat net + marge + vs N-1 (A1, C3), ✅ compte de résultat (C4), ✅ 3 ratios — suit le mockup, pas 4 (A2, C3, note documentée), ✅ argent à récupérer cliquable→opérationnel (A3, C5), ✅ passerelles 2044/FEC/Bilan (C6), ✅ nav placement (C2), ✅ règle d'or (C5), ✅ comparaisons mois-1 (dashboard inchangé) / N-1 (Finances), ✅ audit code-reviewer (D4), ✅ sandbox-first (D5 gardée).
- **Écart spec assumé** : le **teaser dashboard** mentionné en Partie 3 de la spec est volontairement **omis** (la contrainte dure « 1 écran sans scroll » prime). Entrées Finances = item sidebar (C2) + bouton « Analyser dans Finances → » du drill widget (B2). **À surfacer au user.**
- **Placeholders** : un seul résiduel signalé explicitement (loyers HC N-1 dans `_finRenderPL` step 2) avec l'action concrète pour le résoudre (ajouter `loyersHCN1` au retour de `_computeFinancesSummary` + test). À traiter en Task C4/A1.
- **Cohérence des noms** : `_computeFinancesSummary` (module + window), `_finCollect/_finChargeBuckets/_finRatio/_finRenderPL/_finRenderLeaks/_finRenderExports/_finGoExport/_finIrlSousIndexation/_finRegulAFaire/_finOpenParLogement`, drill key `loyers-ae`, classe widget `v4s-k-ae`, page id `p-finances`, module key `finances-hub`. Cohérents entre tâches.
- **Risque d'ancrage** : les numéros de ligne dériveront ; chaque tâche fournit une commande `grep` d'ancrage. Vérifier les noms réels de `fmt`, `openDashDrill`/`closeDashDrill`, `STD_CATEGORIES`, libellés de catégories de charges, signature `computeRegul` AVANT d'éditer.
