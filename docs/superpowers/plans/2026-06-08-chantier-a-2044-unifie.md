# Chantier A — 2044 moteur unifié & juste — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Faire de `js/core/legal-2044.js` (module testé) **l'unique** moteur de calcul 2044 de l'app, alimentant à la fois le panneau « Récap/CSV » et le wizard PDF par entité, avec des **chiffres justes en prod** (fix ligne 230 + câblage complet du périmètre).

**Architecture :** Aujourd'hui prod a **deux** moteurs 2044 divergents : (1) le module `_compute2044(mouvements, STD_CATEGORIES, opts)` (correct, ~30 tests Vitest) consommé par le panneau, et (2) un `function _compute2044(ent, year, activeLogs)` **inline** (index.html:29650) consommé par le wizard « 📋 Wizard 2044 » par entité (parcours + mapping + impression PDF). L'inline est hoisté en global → il crée `window._compute2044`, que `js/main.js:199` écrase ensuite avec la version module → **collision de noms** : à l'exécution le wizard appelle le module avec les mauvais arguments → `ent.filter is not a function` → **le bouton plante**. On unifie en : (a) faisant gagner au module les 2 capacités que seul l'inline possède (détail des mouvements par ligne pour le PDF, mapping des catégories custom), (b) écrivant un **adaptateur UI** qui reshape la sortie module vers la forme `byLine` attendue par le rendu wizard + `_print2044`, (c) **supprimant** l'inline. Plus le port en prod du chemin panneau déjà validé en sandbox (fix ligne 230 + builder d'options complet).

**Tech Stack :** Vanilla JS, module ES6 (`js/core/legal-2044.js`), Vitest (`__tests__/helpers/legal-2044.test.js`), monolithe `index.html` (prod) + `index-test.html` (sandbox). `npm test` lance Vitest.

**Garde-fous gravés applicables (NON négociables) :**
- **Sandbox-first** : toute la nouveauté (Phase 2) se construit et se valide dans `index-test.html`. On ne touche `index.html` (prod) qu'après le **« OK » explicite** du user (gate à chaque phase prod).
- **Modif fiscale → audit `superpowers:code-reviewer` OBLIGATOIRE** avant de dire au user que c'est prêt à tester. Mes audits propres (Vitest+grep) ne suffisent pas.
- **TDD** pour toute logique du moteur (module) : test rouge → code minimal → vert.
- **Bump version** `v15.X` (title l.6 + footer l.57 d'`index.html`) à chaque phase livrée en prod. Version courante : **v15.258**.
- **Commit index.html sérialisé** : si une ouvrière tourne en parallèle, passer par `.index-queue/QUEUE.md` (protocole `docs/INDEX-COMMIT-PROTOCOL.md`). En pilotage solo, commit direct sur main OK.
- **modify+verify** : après chaque modif, grep des symboles + sites collatéraux (index.html ET index-test.html) avant de demander un test.

**Périmètre de référence (états actuels constatés dans le code) :**
- `index.html:3969` → ligne 230 `type:'charge'` ❌ (bug). `index-test.html:3904` → `type:'deduction'` ✅.
- `index.html:43193` `_legal2044BuildOpts` → **incomplet** (ne passe que `{yr,from,to,entityNom,refs}`) ❌. `index-test.html:42851` → **complet** (`+imms,nbLocaux,partBailleur225`) ✅.
- Module `js/core/legal-2044.js` → gère déjà `deduction` (l.94-101), `imm` (l.51), forfait 222 (l.108), partBailleur 225 (l.116), skip compteur collectif (l.70). **Correct, partagé prod+sandbox.**
- Inline mort-vivant `function _compute2044(ent,year,activeLogs)` : `index.html:29650`, `index-test.html:29000`. Appelé par `openWizard2044` (render step 3) + `_print2044`. Table de libellés UI `LIGNES_2044` (index.html:29557) → **reste** (métadonnées libellé/desc, pas un moteur). Mapping custom : `_default2044Mapping`/`_get2044Mapping` (index.html:29603/29631) → **reste** (alimente l'UI de mapping + sera passé en `opts.mapping`).

---

## File Structure

| Fichier | Responsabilité | Nature du changement |
|---|---|---|
| `js/core/legal-2044.js` | Moteur unique 2044 (agrégation + recap + CSV) | **Additif** : `opts.detail` (détail mvts par ligne) + `opts.mapping` (catégories custom). Partagé prod+sandbox. Aucune rupture des appelants existants. |
| `__tests__/helpers/legal-2044.test.js` | Tests Vitest du moteur | Ajout de tests (détail, mapping) + 1 test garde-fou « ligne 230 = deduction » lisant les 2 HTML. |
| `index-test.html` (sandbox) | App de validation | Phase 2 : adaptateur `_legal2044WizardData` + opts wizard + rewire `openWizard2044`/`_print2044` + **suppression** inline `_compute2044`. (Phase 1 déjà présente.) |
| `index.html` (prod) | App réelle | Phase 1 : fix ligne 230 + port builder complet. Phase 2 : port adaptateur + rewire + suppression inline. **Après OK user.** Bump version. |

---

## PHASE 1 — Panneau 2044 juste en prod (port sandbox→prod déjà validé)

> Le sandbox est la **référence validée** (ligne 230 + builder complet). Phase 1 = porter en prod + verrou anti-régression. **Touche `index.html` → gate OK user obligatoire avant les Tasks 1.2/1.3.**

### Task 1.1 : Test garde-fou « ligne 230 = deduction » (les 2 HTML)

**Files:**
- Test: `__tests__/helpers/legal-2044.test.js` (ajout d'un `describe` en fin de fichier)

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à la fin de `__tests__/helpers/legal-2044.test.js` :

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

describe('STD_CATEGORIES inline — ligne 230 typée deduction (anti-régression fiscale)', () => {
  // La ligne 230 (régul provisions copro N-1) DOIT se soustraire des charges (notice 2044 :
  // 240 = (221..229) − 230). Si elle est typée 'charge' elle s'AJOUTE → ~×2 d'erreur.
  // Ce test lit les deux HTML pour empêcher une régression silencieuse côté données inline.
  for (const file of ['index.html', 'index-test.html']) {
    it(`${file} : la catégorie ligne 230 est type:'deduction'`, () => {
      const html = readFileSync(resolve(repoRoot, file), 'utf8');
      // Cible la ligne du tableau STD_CATEGORIES qui porte ligne2044:'230'
      const m = html.match(/\{[^{}]*ligne2044:\s*'230'[^{}]*\}/);
      expect(m, `entrée ligne2044:'230' introuvable dans ${file}`).toBeTruthy();
      expect(m[0]).toMatch(/type:\s*'deduction'/);
    });
  }
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- legal-2044`
Expected: FAIL sur `index.html : la catégorie ligne 230 est type:'deduction'` (prod = `type:'charge'`). `index-test.html` PASSE déjà.

### Task 1.2 : Fix donnée ligne 230 en prod ⚠️ touche `index.html` (gate OK user)

**Files:**
- Modify: `index.html:3969`

- [ ] **Step 1 : Appliquer le fix**

Remplacer dans `index.html:3969` :

```js
  { nom: 'Régularisation provisions copro N-1',             ligne2044:'230', type:'charge',  icon:'↩️', editable:false, deletable:false, std:true },
```
par :
```js
  { nom: 'Régularisation provisions copro N-1',             ligne2044:'230', type:'deduction', icon:'↩️', editable:false, deletable:false, std:true },
```

- [ ] **Step 2 : Lancer le test, vérifier le vert**

Run: `npm test -- legal-2044`
Expected: PASS (les 2 HTML verts) + tous les tests du moteur restent verts.

### Task 1.3 : Porter le builder d'options complet en prod ⚠️ touche `index.html`

**Files:**
- Modify: `index.html:43193-43198` (fonction `_legal2044BuildOpts`)

- [ ] **Step 1 : Remplacer le builder incomplet par la version sandbox complète**

Remplacer le corps de `_legal2044BuildOpts()` dans `index.html` (actuellement l.43193-43198, qui ne renvoie que `{yr, from, to, entityNom, refs}`) par la version identique à `index-test.html:42851-42889` :

```js
function _legal2044BuildOpts() {
  const yr = v('legal-2044-year') || String(new Date().getFullYear() - 1);
  const entityNom = v('legal-2044-ent') || '';
  const from = yr + '-01-01', to = yr + '-12-31';

  const aliveLogs = (DB.logements||[]).filter(l => _isAlive(l) && !l.archived);
  const scopeLogs = entityNom ? aliveLogs.filter(l => l.entity === entityNom) : aliveLogs;
  const refs = scopeLogs.map(l => l.ref);
  const nbLocaux = scopeLogs.length;

  let imms = [];
  if (entityNom) {
    const ent = (DB.entites||[]).find(e => _isAlive(e) && e.nom === entityNom);
    imms = ent ? (ent.immeubles||[]).filter(_isAlive).map(i => i.nom) : [];
  }

  let partBailleur225 = 0;
  try {
    if (typeof computeRegul === 'function') {
      const regul = computeRegul(from, to);
      Object.values(regul.bailleur || {}).forEach(b => {
        if (!entityNom || imms.includes(b.imm)) partBailleur225 += b.total || 0;
      });
    }
  } catch (e) { console.warn('[_legal2044BuildOpts] partBailleur', e); }
  partBailleur225 = Math.round(partBailleur225 * 100) / 100;

  return { yr, from, to, entityNom, refs, imms, nbLocaux, partBailleur225 };
}
```

- [ ] **Step 2 : Vérifier la cohérence des symboles consommés**

Run (Grep) dans `index.html` : confirmer que `_isAlive`, `computeRegul`, `v(`, `DB.entites`, `DB.logements` existent bien (ils sont utilisés ailleurs en prod). Aucun nouveau symbole introuvable.

- [ ] **Step 3 : Vérif manuelle navigateur (sandbox d'abord puis prod après OK)**

Ouvrir le panneau Légal → « 📊 Calculer + voir le récap » pour une entité avec une taxe foncière posée au niveau immeuble (`qui=''`+`imm`). Vérifier qu'elle apparaît désormais en ligne 227, que la ligne 222 (forfait) et 225 (part bailleur) sont présentes. Console : 0 erreur.

- [ ] **Step 4 : Commit + bump version (après OK user pour la prod)**

```bash
git add __tests__/helpers/legal-2044.test.js index.html
git commit -m "Chantier A Phase 1 : 2044 panneau juste en prod (fix ligne 230 deduction + builder opts complet) v15.259"
```
Et bump `index.html` l.6 `<title>ImmoTrack v15.259</title>` + l.57 `<em>v15.259</em>`.

---

## PHASE 2 — Moteur unifié : brancher le wizard PDF sur le module (sandbox-first → prod)

> Toute la Phase 2 se construit et se valide d'abord dans **`index-test.html`**. Les changements du **module** (`js/core/legal-2044.js`, Tasks 2.1-2.2) sont **additifs** (opt-in) et partagés : ils n'altèrent aucun appelant existant. Le port prod (Task 2.8) se fait **après OK user**.

### Task 2.1 : Module — détail des mouvements par ligne (`opts.detail`)

**Files:**
- Modify: `js/core/legal-2044.js` (fonction `_compute2044`)
- Test: `__tests__/helpers/legal-2044.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter un `describe` :

```js
describe('_compute2044 — opts.detail (détail mouvements par ligne pour le PDF)', () => {
  const STD = STD_CATEGORIES; // défini en haut du fichier de test
  it('sans detail : pas de mvtsByLigne', () => {
    const r = _compute2044([{ date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 }], STD);
    expect(r.mvtsByLigne).toBeUndefined();
  });
  it('detail:true → mvtsByLigne[ligne] liste {id,date,lib,montant} signé par type', () => {
    const mvts = [
      { id: 1, date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000, lib: 'Loyer janv', qui: 'F-001' },
      { id: 2, date: '2026-02-10', cat: 'Frais de gestion / honoraires', db: 50, lib: 'Honoraires', qui: 'F-001' },
      { id: 3, date: '2026-03-10', cat: 'Régularisation provisions copro N-1', db: 300, lib: 'Régul', qui: 'F-001' }
    ];
    const r = _compute2044(mvts, STD, { detail: true });
    expect(r.mvtsByLigne['211']).toEqual([{ id: 1, date: '2026-01-15', lib: 'Loyer janv', montant: 1000 }]);
    expect(r.mvtsByLigne['221']).toEqual([{ id: 2, date: '2026-02-10', lib: 'Honoraires', montant: 50 }]);
    // 230 (deduction) : montant = db − cr = 300 (positif), la soustraction est gérée dans le total
    expect(r.mvtsByLigne['230']).toEqual([{ id: 3, date: '2026-03-10', lib: 'Régul', montant: 300 }]);
  });
  it('detail:true n\'affecte pas les totaux', () => {
    const mvts = [{ date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 }];
    const a = _compute2044(mvts, STD).resultatFoncier;
    const b = _compute2044(mvts, STD, { detail: true }).resultatFoncier;
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npm test -- legal-2044`
Expected: FAIL (`mvtsByLigne` undefined).

- [ ] **Step 3 : Implémenter (additif) dans `js/core/legal-2044.js`**

Dans `_compute2044`, après `const { ... } = opts;` ajouter `detail = false` à la déstructuration. Initialiser `const mvtsByLigne = detail ? {} : null;`. Dans la boucle `forEach(m => {...})`, juste après avoir calculé `amt` et `lignes[ligne] += amt` pour chaque branche (recette/charge/interet/deduction), pousser le détail :

```js
// ... dans chaque branche, après lignes[ligne] += amt :
if (detail) {
  if (!mvtsByLigne[ligne]) mvtsByLigne[ligne] = [];
  mvtsByLigne[ligne].push({ id: m.id, date: m.date, lib: m.lib, montant: amt });
}
```

Le plus simple : factoriser en sortant `amt` du `if/else` puis pousser une fois. Refactor de la cascade :

```js
let amt = 0, bucket = null;
if (std.type === 'recette') { amt = (m.cr||0)-(m.db||0); totalRecettes += amt; bucket = 'recette'; }
else if (std.type === 'charge') { amt = (m.db||0)-(m.cr||0); totalCharges += amt; }
else if (std.type === 'interet') { amt = (m.db||0)-(m.cr||0); totalInterets += amt; }
else if (std.type === 'deduction') { amt = (m.db||0)-(m.cr||0); totalCharges -= amt; }
else { /* type inconnu : ignore */ comptes[ligne]--; return; }
lignes[ligne] += amt;
if (detail) { (mvtsByLigne[ligne] || (mvtsByLigne[ligne] = [])).push({ id: m.id, date: m.date, lib: m.lib, montant: amt }); }
comptes[ligne]++;
```

> ⚠️ Conserver **exactement** la sémantique de signe existante (recette: cr−db ; charge/interet/deduction: db−cr ; deduction soustrait du total). Le refactor ne doit changer aucun total — c'est garanti par le test 2.1 step 1 (« n'affecte pas les totaux ») + les ~30 tests existants.

Dans le `return {...}`, ajouter conditionnellement : `...(detail ? { mvtsByLigne } : {}),`.

- [ ] **Step 4 : Lancer, vérifier le vert (TOUS les tests)**

Run: `npm test -- legal-2044`
Expected: PASS, y compris les ~30 tests existants (aucune régression de total).

- [ ] **Step 5 : Commit**

```bash
git add js/core/legal-2044.js __tests__/helpers/legal-2044.test.js
git commit -m "Chantier A Phase 2 : moteur 2044 — opts.detail (détail mvts par ligne)"
```

### Task 2.2 : Module — mapping des catégories custom (`opts.mapping`)

**Files:**
- Modify: `js/core/legal-2044.js`
- Test: `__tests__/helpers/legal-2044.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

```js
describe('_compute2044 — opts.mapping (catégories custom → ligne 2044)', () => {
  const STD = STD_CATEGORIES;
  it('une cat custom mappée via opts.mapping est agrégée (type déduit de la ligne)', () => {
    const mvts = [
      { date: '2026-01-15', cat: 'Honoraires comptable perso', db: 120, qui: 'F-001' }, // custom → 221 (charge)
      { date: '2026-02-15', cat: 'Loyer Airbnb', cr: 800, qui: 'F-001' }                // custom → 211 (recette)
    ];
    const r = _compute2044(mvts, STD, { mapping: { 'Honoraires comptable perso': '221', 'Loyer Airbnb': '211' } });
    expect(r.lignes['221']).toBe(120);
    expect(r.lignes['211']).toBe(800);
    expect(r.nonMappes).toHaveLength(0);
  });
  it('cat custom mappée sur 250 → comptée en intérêts', () => {
    const r = _compute2044([{ date: '2026-03-01', cat: 'Intérêts prêt SCI', db: 300 }], STD,
      { mapping: { 'Intérêts prêt SCI': '250' } });
    expect(r.lignes['250']).toBe(300);
    expect(r.totalInterets).toBe(300);
  });
  it('cat custom mappée sur 230 → soustraite des charges', () => {
    const r = _compute2044([
      { date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 },
      { date: '2026-03-01', cat: 'Régul perso', db: 200 }
    ], STD, { mapping: { 'Régul perso': '230' } });
    expect(r.lignes['230']).toBe(200);
    expect(r.totalCharges).toBe(-200);
  });
  it('cat custom NON présente dans mapping → toujours nonMappes', () => {
    const r = _compute2044([{ id: 9, date: '2026-01-15', cat: 'Truc', db: 50 }], STD, { mapping: { 'Autre': '221' } });
    expect(r.nonMappes).toHaveLength(1);
  });
  it('STD_CATEGORIES prime sur opts.mapping (mapping ne s\'applique qu\'aux non-STD)', () => {
    // 'Loyers encaissés' est STD (211 recette) ; un mapping tordu ne doit pas la déplacer
    const r = _compute2044([{ date: '2026-01-15', cat: 'Loyers encaissés', cr: 1000 }], STD,
      { mapping: { 'Loyers encaissés': '221' } });
    expect(r.lignes['211']).toBe(1000);
    expect(r.lignes['221']).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npm test -- legal-2044`
Expected: FAIL (customs tombent en nonMappes).

- [ ] **Step 3 : Implémenter (additif)**

Dans `js/core/legal-2044.js`, ajouter `mapping = null` à la déstructuration d'`opts`. Ajouter un helper de typage par ligne (au-dessus de la boucle) :

```js
// Type 2044 déduit d'un numéro de ligne (pour les catégories custom mappées via opts.mapping).
const _typeFromLigne = (ln) => {
  if (ln === '211' || ln === '212' || ln === '213' || ln === '214') return 'recette';
  if (ln === '250') return 'interet';
  if (ln === '230') return 'deduction';
  return 'charge'; // 221..229, 224bis, 228...
};
```

Dans la boucle, remplacer le bloc `if (!std) { ...nonMappes... return; }` par : si pas de `std`, tenter `opts.mapping` ; si une ligne y est trouvée, fabriquer un `std` synthétique `{ ligne2044, type: _typeFromLigne(ligne2044) }` et continuer le traitement normal ; sinon → nonMappes comme avant :

```js
let std = catByName.get(m.cat);
if (!std && mapping && mapping[m.cat]) {
  const ln = mapping[m.cat];
  if (ln) std = { ligne2044: ln, type: _typeFromLigne(ln) };
}
if (!std) {
  if ((m.cr || 0) > 0 || (m.db || 0) > 0) {
    nonMappes.push({ id: m.id, date: m.date, lib: m.lib, cat: m.cat, cr: m.cr || 0, db: m.db || 0, qui: m.qui });
  }
  return;
}
```

> Note : `catByName` est construit à partir de `stdCategories` → un cat STD garde toujours son `std` figé ; `opts.mapping` ne s'applique QUE si `catByName.get(m.cat)` est absent. (Garantit le test « STD prime ».)

- [ ] **Step 4 : Lancer, vérifier le vert (TOUS les tests)**

Run: `npm test -- legal-2044`
Expected: PASS intégral.

- [ ] **Step 5 : Commit**

```bash
git add js/core/legal-2044.js __tests__/helpers/legal-2044.test.js
git commit -m "Chantier A Phase 2 : moteur 2044 — opts.mapping (catégories custom)"
```

### Task 2.3 : Sandbox — options wizard `_legal2044WizardOpts(ent, year)`

**Files:**
- Modify: `index-test.html` (ajouter la fonction près de l'ancien wizard, ~l.29750)

- [ ] **Step 1 : Écrire la fonction (mirror du builder panneau, scopé sur un `ent` objet)**

```js
// Options 2044 pour le wizard PDF (entité objet + année). Mirror de _legal2044BuildOpts
// (panneau) mais scopé sur un ent précis, + mapping custom + detail pour le PDF.
function _legal2044WizardOpts(ent, year) {
  const yr = parseInt(year);
  const from = `${yr}-01-01`, to = `${yr}-12-31`;
  const entityNom = ent.nom;
  const aliveLogs = (DB.logements||[]).filter(l => _isAlive(l) && !l.archived && l.entity === entityNom);
  const refs = aliveLogs.map(l => l.ref);
  const nbLocaux = aliveLogs.length;
  const imms = (ent.immeubles||[]).filter(_isAlive).map(i => i.nom);
  let partBailleur225 = 0;
  try {
    if (typeof computeRegul === 'function') {
      const regul = computeRegul(from, to);
      Object.values(regul.bailleur || {}).forEach(b => {
        if (imms.includes(b.imm)) partBailleur225 += b.total || 0;
      });
    }
  } catch (e) { console.warn('[_legal2044WizardOpts] partBailleur', e); }
  partBailleur225 = Math.round(partBailleur225 * 100) / 100;
  // Mapping custom : on ne passe QUE les catégories non-STD (le module fige les STD).
  const fullMap = _get2044Mapping();
  const mapping = {};
  Object.keys(fullMap).forEach(cat => { if (!_isStdCategory(cat) && fullMap[cat]) mapping[cat] = fullMap[cat]; });
  return { yr: String(yr), from, to, entityNom, refs, imms, nbLocaux, partBailleur225, mapping, detail: true };
}
```

- [ ] **Step 2 : Vérifier les symboles**

Grep dans `index-test.html` : `_isAlive`, `computeRegul`, `_get2044Mapping`, `_isStdCategory` existent. ✅ (vus aux l.3986/29631/4010 équivalents).

### Task 2.4 : Sandbox — adaptateur `_legal2044WizardData(ent, year)`

**Files:**
- Modify: `index-test.html` (juste après `_legal2044WizardOpts`)

- [ ] **Step 1 : Écrire l'adaptateur (sortie = forme `byLine` attendue par le rendu + `_print2044`)**

```js
// Adaptateur : appelle le MOTEUR UNIQUE (module) et reshape sa sortie vers la forme
// historique { byLine, totaux, resultat, deficitDeductible, mapping, mvtsCount } que
// consomment le rendu wizard (step 3) et _print2044. Remplace l'ancien _compute2044 inline.
function _legal2044WizardData(ent, year) {
  const opts = _legal2044WizardOpts(ent, year);
  const result = window._compute2044(DB.mouvements || [], STD_CATEGORIES, opts);

  // byLine à partir des métadonnées UI (LIGNES_2044) + lignes/mvtsByLigne du moteur.
  const byLine = {};
  LIGNES_2044.forEach(l => {
    byLine[l.num] = {
      num: l.num, libelle: l.libelle, type: l.type,
      total: result.lignes[l.num] || 0,
      mvts: (result.mvtsByLigne && result.mvtsByLigne[l.num]) ? result.mvtsByLigne[l.num].slice() : []
    };
  });
  byLine['___'] = { num: '—', libelle: 'Non mappé (à ajuster dans le wizard)', type: 'unmapped', total: 0, mvts: [] };
  (result.nonMappes || []).forEach(nm => {
    byLine['___'].mvts.push({ id: nm.id, date: nm.date, lib: nm.lib, montant: (nm.db||0)-(nm.cr||0), cat: nm.cat });
    byLine['___'].total += (nm.db||0)-(nm.cr||0);
  });

  // Détail d'affichage des 2 lignes synthétiques (total déjà compté par le moteur via opts).
  if (opts.nbLocaux > 0 && byLine['222']) {
    byLine['222'].mvts.push({ date: '', lib: `Forfait 20 €/local × ${opts.nbLocaux}`, montant: opts.nbLocaux * 20, auto: true, motif: 'Notice 2044 § 222' });
  }
  let partBailleurInjectee = opts.partBailleur225 || 0;
  try {
    if (typeof computeRegul === 'function' && partBailleurInjectee) {
      const regul = computeRegul(opts.from, opts.to);
      Object.values(regul.bailleur || {}).forEach(b => {
        if (opts.imms.includes(b.imm)) {
          (b.segments || []).forEach(seg => byLine['225'].mvts.push({
            date: seg.date, lib: seg.lib, montant: seg.montant, auto: true, motif: seg.motif, cc: seg.cc
          }));
        }
      });
    }
  } catch (e) { console.warn('[_legal2044WizardData] partBailleur seg', e); }

  // Totaux selon notice (le moteur fait déjà 240 = (221..229) − 230).
  const recettes215 = result.totalRecettes;
  const charges240 = result.totalCharges;
  const interets250 = result.totalInterets;
  const resultat = result.resultatFoncier;
  const deficitHorsInt = recettes215 - charges240;
  const deficitDeductible = (deficitHorsInt < 0) ? Math.max(deficitHorsInt, -10700) : 0;
  const mvtsCount = result.mvtsByLigne
    ? Object.values(result.mvtsByLigne).reduce((s, a) => s + a.length, 0)
    : 0;

  return {
    byLine,
    totaux: { recettes215, charges240, interets250, partBailleurInjectee },
    resultat, deficitDeductible,
    mapping: opts.mapping, mvtsCount
  };
}
```

> ⚠️ **Pas de double-compte** : le moteur a déjà ajouté forfait 222 et partBailleur 225 aux totaux via `opts.nbLocaux`/`opts.partBailleur225`. L'adaptateur n'ajoute QUE le **détail d'affichage** de ces 2 lignes (jamais au `total`). Le `byLine['225'].total` vient de `result.lignes['225']` (déjà cumulé).

### Task 2.5 : Sandbox — rewire le wizard + suppression de l'inline

**Files:**
- Modify: `index-test.html` (appels dans `openWizard2044` render step 3 ≈ l.29137/29143 + `_print2044` ≈ l.29359)
- Delete: `index-test.html` — `function _compute2044(ent, year, activeLogs)` (≈ l.29000-29097)

- [ ] **Step 1 : Remplacer les 3 appels à l'inline par l'adaptateur**

Dans `index-test.html`, remplacer chaque `const data = _compute2044(ent, _wiz2044.year, activeLogs);` (2 occurrences dans le render, ≈29137/29143) et `const data = _compute2044(ent, year, activeLogs);` (dans `_print2044`, ≈29359) par :

```js
const data = _legal2044WizardData(ent, _wiz2044.year); // (render) — l'adaptateur recalcule activeLogs en interne
```
et pour `_print2044` :
```js
const data = _legal2044WizardData(ent, year);
```
(supprimer la ligne `const activeLogs = ...` devenue inutile dans `_print2044` si elle ne sert plus qu'au header ; sinon la garder uniquement pour `activeLogs.length` du header).

- [ ] **Step 2 : Supprimer la fonction inline `_compute2044`**

Supprimer entièrement le bloc `function _compute2044(ent, year, activeLogs) { ... }` (commentaire d'en-tête inclus, ≈ `index-test.html:28990-29097`). **Ne PAS** supprimer `LIGNES_2044`, `_default2044Mapping`, `_get2044Mapping` (toujours utilisés par l'UI/adaptateur).

- [ ] **Step 3 : Vérifier qu'aucun appel orphelin ne subsiste**

Run (Grep) dans `index-test.html` : `\b_compute2044\s*\(` → ne doit RESTER que `window._compute2044(` (panneau + adaptateur). Aucune référence à `_compute2044(ent` ou bare `_compute2044(`.
Run (Grep) : `LIGNES_2044` → encore référencé par le rendu + `_print2044` (OK). `_wiz2044` → intact (UI). 

- [ ] **Step 4 : Lancer la suite Vitest complète**

Run: `npm test`
Expected: PASS intégral (la suppression inline ne touche aucun test ; le module est couvert).

### Task 2.6 : Sandbox — vérification manuelle navigateur (real browser)

- [ ] **Step 1 : Servir le sandbox** (http-server, car modules ES6) et charger le dataset démo via le bouton manuel (jamais d'auto-injection).
- [ ] **Step 2 : Wizard** : ouvrir une entité → « 📋 Wizard 2044 » → parcourir les 4 étapes. Vérifier : aucun crash (la collision est éliminée), les montants par ligne s'affichent, le mapping custom (étape 2) fonctionne.
- [ ] **Step 3 : Cohérence des deux UI** : pour la même entité/année, comparer les totaux du **wizard** (215/240/250/résultat) avec ceux du **panneau** « 📊 Récap ». **Ils doivent être identiques** (preuve du moteur unique).
- [ ] **Step 4 : PDF** : « 🖨️ Imprimer / PDF » → le récap s'ouvre, tableaux par ligne + détail des mouvements présents, ligne 230 affichée en déduction, déficit éventuel correct.
- [ ] **Step 5 : Console** : 0 erreur. Capturer les valeurs pour le compte-rendu au user.

### Task 2.7 : Audit fiscal par agent `superpowers:code-reviewer` (OBLIGATOIRE)

- [ ] **Step 1 : Dispatcher l'agent** sur le diff Phase 2 (`js/core/legal-2044.js` + adaptateur/rewire `index-test.html`), en lui demandant explicitement de vérifier : (a) aucune régression de total vs l'ancien inline (signes recette/charge/interet/deduction), (b) pas de double-compte forfait 222 / partBailleur 225, (c) ligne 240 = (221..229) − 230, (d) déficit plafonné 10 700 €, (e) le mapping custom n'écrase jamais une catégorie STD, (f) parité wizard ↔ panneau.
- [ ] **Step 2 : Traiter les findings** (corriger en TDD si bug logique). Ne PAS annoncer « prêt à tester » au user tant que l'agent n'est pas PASSANT.

### Task 2.8 : Port prod `index.html` ⚠️ APRÈS OK USER + bump version

**Files:**
- Modify: `index.html` (ajouter `_legal2044WizardOpts` + `_legal2044WizardData`, rewire les 3 appels ≈ l.29787/29793/30009, supprimer inline `_compute2044` l.29650-29748)
- Modify: `index.html` l.6 + l.57 (version)

- [ ] **Step 1 : Demander le OK explicite** au user (gate sandbox→prod). Présenter : ce qui change, le fait que le bouton Wizard repassera fonctionnel, parité des chiffres.
- [ ] **Step 2 : Porter** les fonctions + le rewire + la suppression inline, à l'identique du sandbox validé. Adapter les numéros de ligne (prod : appels 29787/29793/30009, inline 29650-29748).
- [ ] **Step 3 : modify+verify** : Grep `index.html` `\b_compute2044\s*\(` → ne reste que `window._compute2044(`. Aucun orphelin.
- [ ] **Step 4 : Bump version** : `<title>ImmoTrack v15.260</title>` (l.6) + `<em>v15.260</em>` (l.57).
- [ ] **Step 5 : Vitest complet** `npm test` → vert.
- [ ] **Step 6 : Commit**

```bash
git add index.html
git commit -m "Chantier A Phase 2 : 2044 wizard PDF branché sur le moteur module unique (suppression inline + adaptateur) v15.260"
```

- [ ] **Step 7 : Mettre à jour BACKLOG.md + journal `docs/subjects/V3-REFONTE-LOYERS.md`** (statut Chantier A livré, version, commit) — temps réel.

---

## Self-Review (couverture spec)

- **Fix ligne 230 prod** → Task 1.1 (garde) + 1.2 ✅
- **Module lit m.imm / 225 / 222** → déjà dans le module ; câblage prod via builder complet Task 1.3 ✅
- **Dédup du « wizard inline mort »** → reclassé : il n'était **pas mort** mais cassé par collision ; unifié sur le module (Tasks 2.1-2.8) sans perte de feature (PDF + mapping conservés) ✅
- **Bump version** → Phase 1 v15.259, Phase 2 v15.260 ✅
- **TDD** → Tasks 1.1, 2.1, 2.2 (rouge→vert) ✅
- **Audit agent obligatoire** → Task 2.7 ✅
- **Sandbox-first → prod gate** → Phase 1 gate (1.2/1.3), Phase 2 tout en sandbox puis port 2.8 après OK ✅

**Risques / points de vigilance :**
- Le refactor de la cascade de signes dans le module (Task 2.1) est le seul endroit qui touche des totaux existants → couvert par les ~30 tests + test « n'affecte pas les totaux ». Si un test existant casse → STOP, c'est une régression de signe.
- `mvtsCount` change légèrement de définition (mvts mappés vs tous les mvts en scope) → impact purement cosmétique (texte « X mouvements considérés » du PDF). Acceptable.
- Décision conservée : le mapping custom (`opts.mapping`) est préservé pour « zéro feature perdue ». Si le user préfère simplifier (customs → « à classer manuellement » comme le panneau), Task 2.2 + la partie mapping de 2.3 peuvent sauter — à confirmer si on veut alléger.
