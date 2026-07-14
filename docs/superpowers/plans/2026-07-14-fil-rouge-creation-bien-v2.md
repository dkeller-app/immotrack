# Fil rouge « Ajouter un bien » v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un fil rouge de création de bien qui enchaîne les modales EXISTANTES une à la fois (bailleur → immeuble → logement → bail), avec un fil d'Ariane persistant, démarrable de partout, stoppable partout, sans rien réinventer.

**Architecture:** Deux modules **purs** testables — `parcours-bien-model` (restauré, complétude/arbre) et un nouveau **conducteur** `fil-rouge-conductor` (machine à états : transitions + fil d'Ariane). `index.html` n'est que du **câblage mince** : il traduit les actions du conducteur en appels aux vraies fonctions (`openNewEnt`/`saveEnt`, `addImmForm`/`saveImm`, `openNewLog`/`saveParamLog`, `openActeImport`/`_acteApply`, `openBail`, `delImm`/`delLog`), pose des **hooks post-save gardés** (inertes hors fil rouge), attache le fil d'Ariane aux modales existantes, et ajoute les points d'entrée.

**Tech Stack:** Vanilla JS (monolithe `index.html`), Vitest (modules purs `__tests__/helpers/`), mirrors `window.*` via `tools/sync-helpers-global-mirrors.mjs`, PWA `sw.js`.

**Base:** worktree `feat/fil-rouge-bien-v2` sur `origin/main` (`fd55c31`, v15.473). Spec : `docs/superpowers/specs/2026-07-14-fil-rouge-creation-bien-v2-design.md`. Mockup de référence (jetable) : `mockups/fil-rouge-creation-bien-v2/index.html`.

> **⚠ Ancrage des edits `index.html`** : `origin/main` bouge vite → les numéros de ligne dérivent. Ancrer chaque edit par la **signature de fonction** ou une **chaîne unique voisine** (données dans chaque tâche), pas par numéro de ligne absolu. Re-`grep` avant chaque insertion.

> **⚠ Sandbox-first** ([[feedback_sandbox_first]]) : chaque modif `index.html` est miroir dans `index-test.html` (Task 10). Aucune auto-injection démo ([[feedback_no_demo_autoinject]]).

---

## File Structure

- `__tests__/helpers/parcours-bien-model.js` — **restauré** (modèle pur complétude/arbre, 15 tests).
- `__tests__/helpers/parcours-bien-model.test.js` — **restauré**.
- `js/helpers/parcours-bien-model.global.js` — **restauré** (mirror `window.ParcoursBienModel`).
- `__tests__/helpers/fil-rouge-conductor.js` — **NOUVEAU** module pur (machine à états + fil d'Ariane).
- `__tests__/helpers/fil-rouge-conductor.test.js` — **NOUVEAU** tests.
- `js/helpers/fil-rouge-conductor.global.js` — **NOUVEAU** mirror `window.FilRougeConductor` (généré).
- `tools/sync-helpers-global-mirrors.mjs` — **modifié** (2 entrées).
- `index.html` — **modifié** (câblage : conducteur, hooks post-save, fil d'Ariane, « et ensuite », récap, continuité, entrées, CSS).
- `index-test.html` — **modifié** (miroir).
- `sw.js` — **modifié** (`CACHE_VER`).

---

## Task 1 : Restaurer le module pur `parcours-bien-model`

**Files:**
- Create: `__tests__/helpers/parcours-bien-model.js`, `__tests__/helpers/parcours-bien-model.test.js`, `js/helpers/parcours-bien-model.global.js`
- Modify: `tools/sync-helpers-global-mirrors.mjs`

- [ ] **Step 1 : Restaurer les 3 fichiers depuis la branche v1**

```bash
git checkout feat/fil-rouge-creation-bien -- \
  __tests__/helpers/parcours-bien-model.js \
  __tests__/helpers/parcours-bien-model.test.js \
  js/helpers/parcours-bien-model.global.js
```

- [ ] **Step 2 : Ré-enregistrer l'entrée du mirror dans le générateur**

Ouvrir `tools/sync-helpers-global-mirrors.mjs`, vérifier/ajouter l'entrée `parcours-bien-model` (mêmes exports que la branche v1). Puis régénérer :

```bash
node tools/sync-helpers-global-mirrors.mjs
```
Expected: régénère `js/helpers/parcours-bien-model.global.js` sans diff inattendu.

- [ ] **Step 3 : Vérifier les tests du module**

Run: `npx vitest run __tests__/helpers/parcours-bien-model.test.js`
Expected: **15 passed**.

- [ ] **Step 4 : Commit**

```bash
git add __tests__/helpers/parcours-bien-model.js __tests__/helpers/parcours-bien-model.test.js js/helpers/parcours-bien-model.global.js tools/sync-helpers-global-mirrors.mjs
git commit -m "Fil rouge v2 : restaure le module pur parcours-bien-model (15 tests) depuis la branche v1"
```

---

## Task 2 : Module pur `fil-rouge-conductor` (machine à états) — TDD

Le conducteur ne détient AUCUNE donnée patrimoine (elle vit dans `DB`). Il gère : l'ordre des étapes, la transition sur événement, et les descripteurs du fil d'Ariane à partir d'un contexte fourni.

**Files:**
- Create: `__tests__/helpers/fil-rouge-conductor.js`
- Test: `__tests__/helpers/fil-rouge-conductor.test.js`

- [ ] **Step 1 : Écrire les tests (échouent)**

`__tests__/helpers/fil-rouge-conductor.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { STEPS, entryStep, advance, breadcrumb } from './fil-rouge-conductor.js';

describe('fil-rouge-conductor — entrée', () => {
  it('« + Ajouter un bien » démarre au bailleur', () => { expect(entryStep('bien')).toBe('ent'); });
  it('import acte démarre au logement (bailleur+immeuble pré-remplis)', () => { expect(entryStep('acte')).toBe('log'); });
  it('continuité après bailleur créé → immeuble', () => { expect(entryStep('continue-ent')).toBe('imm'); });
  it('continuité après immeuble créé → logement', () => { expect(entryStep('continue-imm')).toBe('log'); });
  it('entrée inconnue → bailleur par défaut', () => { expect(entryStep('???')).toBe('ent'); });
});

describe('fil-rouge-conductor — transitions (auto-avance)', () => {
  it('bailleur enregistré → immeuble', () => { expect(advance('ent','saved')).toBe('imm'); });
  it('immeuble enregistré → logement', () => { expect(advance('imm','saved')).toBe('log'); });
  it('logement enregistré → et ensuite', () => { expect(advance('log','saved')).toBe('next'); });
  it('et ensuite : autre logement → logement', () => { expect(advance('next','addLog')).toBe('log'); });
  it('et ensuite : autre immeuble → immeuble', () => { expect(advance('next','addImm')).toBe('imm'); });
  it('et ensuite : terminer → bien prêt', () => { expect(advance('next','finish')).toBe('done'); });
  it('bien prêt : créer le bail → bail', () => { expect(advance('done','createBail')).toBe('bail'); });
  it('événement inconnu → on reste sur place', () => { expect(advance('log','wat')).toBe('log'); });
  it('retour arrière explicite', () => { expect(advance('imm','back')).toBe('ent'); expect(advance('log','back')).toBe('imm'); });
});

describe('fil-rouge-conductor — fil d’Ariane', () => {
  it('4 maillons, bailleur en cours au départ', () => {
    const b = breadcrumb({ step:'ent' });
    expect(b.map(c=>c.key)).toEqual(['ent','imm','log','bail']);
    expect(b[0].state).toBe('cur');
    expect(b[1].state).toBe('todo');
  });
  it('bailleur fait + immeuble en cours', () => {
    const b = breadcrumb({ step:'imm', entName:'SCI du Château' });
    expect(b[0].state).toBe('done'); expect(b[0].label).toBe('SCI du Château');
    expect(b[1].state).toBe('cur');
  });
  it('logement en cours porte la réf du dernier lot', () => {
    const b = breadcrumb({ step:'log', entName:'SCI', immName:'12 rue', lastLogRef:'F-102', logCount:1 });
    expect(b[2].state).toBe('cur'); expect(b[2].label).toBe('F-102');
  });
  it('au bien prêt, logement fait et bail en cours', () => {
    const b = breadcrumb({ step:'done', entName:'SCI', immName:'12 rue', lastLogRef:'F-102', logCount:2 });
    expect(b[2].state).toBe('done'); expect(b[2].label).toBe('F-102 +1');
    expect(b[3].state).toBe('cur');
  });
  it('bail fait → dernier maillon done', () => {
    const b = breadcrumb({ step:'bail', bailDone:true, entName:'SCI', immName:'12', lastLogRef:'F-1', logCount:1 });
    expect(b[3].state).toBe('done');
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run __tests__/helpers/fil-rouge-conductor.test.js`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Écrire le module**

`__tests__/helpers/fil-rouge-conductor.js` :

```js
// Conducteur pur du fil rouge « Ajouter un bien ». AUCUNE dépendance DOM ni données.
// Ne gère que la NAVIGATION (étapes) et le FIL D'ARIANE. La donnée vit dans DB.

export const STEPS = ['ent', 'imm', 'log', 'next', 'done', 'bail'];

// Étape de départ selon le point d'entrée.
export function entryStep(kind) {
  switch (kind) {
    case 'acte': return 'log';          // acte : bailleur+immeuble pré-remplis, on confirme le lot
    case 'continue-ent': return 'imm';  // continuité après un bailleur créé hors fil
    case 'continue-imm': return 'log';  // continuité après un immeuble créé hors fil
    case 'bien':
    default: return 'ent';
  }
}

// Transition sur événement. Retourne l'étape suivante (ou l'étape courante si non géré).
const _T = {
  ent:  { saved: 'imm' },
  imm:  { saved: 'log', back: 'ent' },
  log:  { saved: 'next', back: 'imm' },
  next: { addLog: 'log', addImm: 'imm', finish: 'done' },
  done: { createBail: 'bail' },
  bail: { back: 'done' },
};
export function advance(step, event) {
  const row = _T[step];
  return (row && row[event]) || step;
}

// Descripteurs du fil d'Ariane (4 maillons). ctx = {step, entName, immName, lastLogRef, logCount, bailDone}
export function breadcrumb(ctx) {
  const c = ctx || {};
  const step = c.step || 'ent';
  const has = { ent: !!c.entName, imm: !!c.immName };
  const logCur = step === 'log' || step === 'next';
  const logDone = step === 'done' || step === 'bail';
  const logLabel = (c.lastLogRef)
    ? (c.lastLogRef + (c.logCount > 1 ? ' +' + (c.logCount - 1) : ''))
    : 'Logement';
  return [
    { key: 'ent', icon: '👤', state: has.ent ? 'done' : (step === 'ent' ? 'cur' : 'todo'), label: c.entName || 'Bailleur' },
    { key: 'imm', icon: '🏛', state: has.imm ? 'done' : (step === 'imm' ? 'cur' : 'todo'), label: c.immName || 'Immeuble' },
    { key: 'log', icon: '🏠', state: logDone ? 'done' : (logCur ? 'cur' : 'todo'), label: logLabel },
    { key: 'bail', icon: '✍', state: c.bailDone ? 'done' : ((step === 'done' || step === 'bail') ? 'cur' : 'todo'), label: 'Bail' },
  ];
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run __tests__/helpers/fil-rouge-conductor.test.js`
Expected: **PASS** (tous verts).

- [ ] **Step 5 : Commit**

```bash
git add __tests__/helpers/fil-rouge-conductor.js __tests__/helpers/fil-rouge-conductor.test.js
git commit -m "Fil rouge v2 : conducteur pur (machine à états + fil d'Ariane) + tests TDD"
```

---

## Task 3 : Mirror global du conducteur

**Files:**
- Modify: `tools/sync-helpers-global-mirrors.mjs`
- Create (généré): `js/helpers/fil-rouge-conductor.global.js`

- [ ] **Step 1 : Ajouter l'entrée dans le générateur**

Dans `tools/sync-helpers-global-mirrors.mjs`, ajouter une entrée qui expose `STEPS, entryStep, advance, breadcrumb` sous `window.FilRougeConductor` (même forme que l'entrée `parcours-bien-model`). Copier le motif de cette entrée voisine.

- [ ] **Step 2 : Générer**

Run: `node tools/sync-helpers-global-mirrors.mjs`
Expected: crée `js/helpers/fil-rouge-conductor.global.js` exposant `window.FilRougeConductor`.

- [ ] **Step 3 : Vérifier syntaxe du mirror**

Run: `node --check js/helpers/fil-rouge-conductor.global.js`
Expected: OK.

- [ ] **Step 4 : Commit**

```bash
git add tools/sync-helpers-global-mirrors.mjs js/helpers/fil-rouge-conductor.global.js
git commit -m "Fil rouge v2 : mirror window.FilRougeConductor"
```

---

## Task 4 : `index.html` — charger les mirrors + état + fil d'Ariane (DOM + CSS)

**Files:** Modify `index.html`

- [ ] **Step 1 : Inclure les deux mirrors**

Ancrer sur la balise `<script src=...parcours-bien-model...>` si présente (restaurée en Task 1) ; sinon, à côté des autres `<script src="js/helpers/...global.js">`. Ajouter :

```html
<script src="js/helpers/parcours-bien-model.global.js"></script>
<script src="js/helpers/fil-rouge-conductor.global.js"></script>
```
Vérifier qu'il n'y a pas de doublon de la ligne parcours-bien-model.

- [ ] **Step 2 : Ajouter le nœud du fil d'Ariane (unique, réutilisé)**

Juste avant `</body>` (ou près des autres overlays), ajouter le conteneur unique déplacé dans la modale active :

```html
<div id="fr-bread" class="fr-bread" hidden></div>
```

- [ ] **Step 3 : CSS du fil d'Ariane**

Dans le `<style>` principal, ajouter (accent/tokens du design system Propryo déjà définis : `--acc`, `--bor`, etc.) :

```css
.fr-bread{display:flex;align-items:center;gap:0;overflow-x:auto;padding:10px 16px;border-bottom:1px solid var(--bor);background:linear-gradient(180deg,#fff,#fcfdff);scrollbar-width:none}
.fr-bread::-webkit-scrollbar{display:none}
.fr-crumb{display:flex;align-items:center;gap:7px;font:700 11.5px 'Inter',sans-serif;color:var(--t3,#9098a8);background:var(--sur2,#f7f8fa);border:1.5px solid var(--bor);border-radius:22px;padding:5px 12px 5px 7px;max-width:180px;flex-shrink:0}
.fr-crumb .d{width:19px;height:19px;border-radius:50%;background:#eef1f6;color:#9098a8;display:flex;align-items:center;justify-content:center;font:800 9.5px 'Inter';flex-shrink:0}
.fr-crumb .l{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fr-crumb.done{color:#15803d;background:#f0fdf4;border-color:#bbf7d0}
.fr-crumb.done .d{background:#16a34a;color:#fff}
.fr-crumb.cur{color:#c2410c;background:#fff7ed;border-color:#fdba74;box-shadow:0 0 0 3px rgba(255,90,60,.1)}
.fr-crumb.cur .d{background:var(--acc);color:#fff}
.fr-seg{flex:0 0 20px;height:3px;border-radius:3px;background:var(--bor);margin:0 -4px}
.fr-seg.done{background:linear-gradient(90deg,#16a34a,#4ade80)}
.fr-seg.cur{background:linear-gradient(90deg,#16a34a,var(--acc))}
```

- [ ] **Step 4 : Vérifier l'inline JS**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add index.html
git commit -m "Fil rouge v2 : mirrors chargés + nœud/CSS du fil d'Ariane"
```

---

## Task 5 : `index.html` — conducteur (état + dispatch + attache du fil d'Ariane)

Ajouter, dans un `<script>` de logique (près des autres fonctions du parcours), le cœur du câblage. **`_frMode` faux par défaut → tout est inerte hors fil rouge.**

**Files:** Modify `index.html`

- [ ] **Step 1 : Ajouter l'état et les helpers du conducteur**

```js
// ── Fil rouge « Ajouter un bien » v2 — conducteur (câblage mince des modales existantes) ──
let _frMode = false;                 // faux hors parcours : tous les hooks sont inertes
let _frStep = null;
let _frCtx = { entId: null, immName: null, bailDone: false };

function _frCurEnt() { return (DB.entites || []).find((e) => +e.id === +_frCtx.entId) || null; }
function _frCurImmLogs() {
  const ent = _frCurEnt(); if (!ent) return [];
  return (DB.logements || []).filter((l) => l && !l._deleted && l.entity === ent.nom && (!_frCtx.immName || l.imm === _frCtx.immName));
}
function _frLastLogRef() { const ls = _frCurImmLogs(); return ls.length ? ls[ls.length - 1].ref : null; }

// Rendu du fil d'Ariane (via le module pur) — attaché à la modale active
function _frRenderBread() {
  const ent = _frCurEnt();
  const crumbs = window.FilRougeConductor.breadcrumb({
    step: _frStep, entName: ent ? ent.nom : '', immName: _frCtx.immName || '',
    lastLogRef: _frLastLogRef(), logCount: _frCurImmLogs().length, bailDone: _frCtx.bailDone,
  });
  let h = '';
  crumbs.forEach((c, i) => {
    if (i > 0) { const prev = crumbs[i - 1].state, seg = prev === 'done' ? (c.state === 'cur' ? 'cur' : 'done') : ''; h += '<span class="fr-seg ' + seg + '"></span>'; }
    h += '<span class="fr-crumb ' + c.state + '"><span class="d">' + (c.state === 'done' ? '✓' : escHtml(c.icon)) + '</span><span class="l">' + escHtml(c.label) + '</span></span>';
  });
  el('fr-bread').innerHTML = h;
}

// Attache le nœud #fr-bread en tête de la modale active (une seule barre, déplacée)
function _frAttachBread(modalId) {
  const bread = el('fr-bread'); if (!bread) return;
  const modal = document.getElementById(modalId); if (!modal) return;
  const box = modal.querySelector('.m-head, .modal-head, header') || modal.firstElementChild;
  if (box && box.parentNode) box.parentNode.insertBefore(bread, box.nextSibling);
  bread.hidden = false;
  _frRenderBread();
}
function _frDetachBread() { const b = el('fr-bread'); if (b) b.hidden = true; }
```

> **⚠ À confirmer au vrai clic (spec §5)** : le sélecteur `.m-head, .modal-head, header` doit matcher l'en-tête réel de `#ov-ent`/`#ov-imm`/`#ov-log`. Grep ces modales dans `index.html` pour trouver leur classe d'en-tête et ajuster le sélecteur. Si l'insertion casse le layout, replier sur une barre flottante `position:fixed` au-dessus de la modale.

- [ ] **Step 2 : Ouverture d'une étape (traduit une étape → appel de la vraie modale)**

```js
function _frOpenStep(step) {
  _frStep = step;
  const ent = _frCurEnt();
  if (step === 'ent') { openNewEnt(); _frAttachBread('ov-ent'); }
  else if (step === 'imm') { if (ent) addImmForm(ent.id); _frAttachBread('ov-imm'); }
  else if (step === 'log') {
    openNewLog(); setLogModalTab('ident');
    if (ent && el('log-entity')) { el('log-entity').value = ent.nom; refreshLogImmSelect(); }
    if (_frCtx.immName && el('log-imm')) el('log-imm').value = _frCtx.immName;
    _frAttachBread('ov-log');
  }
  else if (step === 'next') _frOpenNext();
  else if (step === 'done') _frOpenDone();
  else if (step === 'bail') _frOpenBailStep();
}

// Démarrage du fil (point d'entrée neutre)
function _frStart(kind) {
  _frMode = true; _frCtx = { entId: null, immName: null, bailDone: false };
  _frOpenStep(window.FilRougeConductor.entryStep(kind || 'bien'));
}
function _frClose() { _frMode = false; _frStep = null; _frDetachBread(); if (typeof _refreshAfterMutation === 'function') _refreshAfterMutation(); }
```

- [ ] **Step 3 : Vérifier l'inline JS**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add index.html
git commit -m "Fil rouge v2 : conducteur (état + _frOpenStep + attache fil d'Ariane)"
```

---

## Task 6 : `index.html` — hooks post-save gardés (auto-avance)

Poser un hook **inerte hors fil rouge** en fin de succès des vraies fonctions de save. **Ne rien changer d'autre dans ces fonctions.**

**Files:** Modify `index.html`

- [ ] **Step 1 : Hook après `saveEnt`**

Repérer la fin de `saveEnt()` (après le `saveDB()`/fermeture modale, quand l'entité est créée). Juste avant son `return`/accolade finale, insérer :

```js
  if (typeof _frAfterSave === 'function') _frAfterSave('ent');
```

- [ ] **Step 2 : Hook après `saveImm`**

Idem en fin de `saveImm()` :

```js
  if (typeof _frAfterSave === 'function') _frAfterSave('imm');
```

- [ ] **Step 3 : Hook après `saveParamLog`**

Idem en fin de `saveParamLog()` (chemin succès, logement créé) :

```js
  if (typeof _frAfterSave === 'function') _frAfterSave('log');
```

- [ ] **Step 4 : Hook après `_acteApply`**

En fin de `_acteApply()` (entité `ent` créée + saveDB), insérer :

```js
  if (typeof _frAfterActe === 'function') _frAfterActe(ent);
```

- [ ] **Step 5 : Implémenter `_frAfterSave` / `_frAfterActe` (auto-avance OU continuité)**

Ajouter près du conducteur :

```js
// Hook post-save : en fil rouge → auto-avance ; hors fil rouge → carte de continuité (voie B)
function _frAfterSave(kind, objOverride) {
  // capter l'objet créé pour le contexte
  if (kind === 'ent') { const e = objOverride || _frLastCreatedEnt(); if (e) _frCtx.entId = e.id; }
  if (kind === 'imm') { const nm = objOverride || _frLastCreatedImmName(); if (nm) _frCtx.immName = nm; }
  if (_frMode) {
    _frOpenStep(window.FilRougeConductor.advance(_frStep, 'saved'));
  } else {
    _frOfferContinue(kind);   // voie B : proposé, jamais forcé
  }
}
function _frAfterActe(ent) {
  if (!ent) return;
  if (_frMode) { _frCtx.entId = ent.id; _frCtx.immName = _frFirstImmName(ent); _frOpenStep('log'); }
  else { _frCtx = { entId: ent.id, immName: _frFirstImmName(ent), bailDone: false }; _frOfferContinue('acte'); }
}
// helpers de capture (à ajuster aux structures réelles ; ne PAS recréer la donnée)
function _frLastCreatedEnt() { const es = (DB.entites || []).filter((e) => e && !e._deleted); return es.length ? es[es.length - 1] : null; }
function _frLastCreatedImmName() { const e = _frCurEnt(); const ims = e && (e.immeubles || []).filter((i) => i && !i._deleted); return ims && ims.length ? ims[ims.length - 1].nom : null; }
function _frFirstImmName(ent) { const ims = (ent.immeubles || []).filter((i) => i && !i._deleted); return ims.length ? ims[0].nom : null; }
```

> **⚠ Capture de contexte** : `_frLastCreatedEnt`/`_frLastCreatedImmName` sont des heuristiques « dernier créé ». Au build, préférer récupérer l'ID/nom **retourné** par les modales si `saveEnt`/`saveImm` exposent l'objet (grep). Sinon, garder l'heuristique mais **vérifier au vrai clic** que le bon bailleur/immeuble est ciblé.

- [ ] **Step 6 : Vérifier l'inline JS**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 7 : Commit**

```bash
git add index.html
git commit -m "Fil rouge v2 : hooks post-save gardés (auto-avance en fil rouge, sinon continuité)"
```

---

## Task 7 : `index.html` — écran « et ensuite ? », « Bien prêt » (récap) et relais bail

Réutilise `parcours-bien-model` pour l'état ; réutilise `openBail` pour le bail. Ces écrans sont de **petits overlays du fil** (pas les modales de création). Ils réutilisent les styles/composants existants (boutons `.btn.bp`, etc.).

**Files:** Modify `index.html`

- [ ] **Step 1 : Markup des 3 écrans du fil**

Ajouter un overlay `#ov-fr` (réutilise la classe `.ov` + composants existants) contenant trois panneaux `data-fr="next|done|bail"` + le `#fr-bread` attachable. (Structure calquée sur le mockup `mockups/fil-rouge-creation-bien-v2/index.html` : `after`, `recap`, `bail-mock`, `choices`, `stop-hint`.) Coller le markup depuis le mockup **en remplaçant les handlers par les vraies fonctions** ci-dessous.

- [ ] **Step 2 : `_frOpenNext` / `_frOpenDone` / `_frOpenBailStep`**

```js
function _frOpenNext() {
  _frStep = 'next'; _frShowFr('next'); _frAttachBread('ov-fr'); _frRenderBread();
  el('fr-next-imm').textContent = _frCtx.immName ? ('dans ' + _frCtx.immName) : '';
  el('fr-next-title').textContent = 'Logement ' + (_frLastLogRef() || '') + ' ajouté';
}
function _frNextChoice(ev) { // 'addLog' | 'addImm' | 'finish'
  _frOpenStep(window.FilRougeConductor.advance('next', ev));
}
function _frOpenDone() {
  _frStep = 'done'; _frShowFr('done'); _frAttachBread('ov-fr'); _frRenderBread();
  _frRenderRecap();
}
function _frRenderRecap() {
  const ent = _frCurEnt(); if (!ent) { el('fr-recap').innerHTML = ''; return; }
  const alive = { ...ent, immeubles: (ent.immeubles || []).filter((im) => im && !im._deleted) };
  const logs = (DB.logements || []).filter((l) => l && !l._deleted);
  const tree = window.ParcoursBienModel.buildParcoursTree(alive, logs.map(_frNormLog));
  // rendu récap : bailleur > immeubles > logements + pastille complétude + bouton ✍ Bail (openBail)
  // (réutilise le rendu de complétude du module ; boutons bail → _frOpenBailStep(ref))
  el('fr-recap').innerHTML = _frRecapHtml(tree, ent);
}
function _frOpenBailStep(ref) {
  _frStep = 'bail'; _frShowFr('bail'); _frAttachBread('ov-fr'); _frRenderBread();
  el('fr-bail-log').innerHTML = _frRentableOptions(ref);
}
function _frConfirmBail() {
  const ref = el('fr-bail-log') ? el('fr-bail-log').value : null;
  _frCtx.bailDone = true;
  _frClose();
  openBail(ref);   // ← RELAIS vers le wizard bail EXISTANT
}
```

> `_frNormLog` = même normalisation que la v1 (`surf`/`hc`/`dpe`-objet → forme du modèle). `_frRecapHtml`/`_frRentableOptions`/`_frShowFr` = petits helpers de rendu (échapper via `escHtml`/`_attr`). `_frRentableOptions` liste les logements dont l'identité est complète (via `parcours-bien-model.logementCompleteness`).

- [ ] **Step 3 : Sortie « Plus tard — c'est gardé » sur CHAQUE panneau du fil**

Chaque panneau (`next`/`done`/`bail`) ET la modale active portent un bouton `onclick="_frClose()"` « Plus tard — c'est gardé » + la croix ✕. À « Bien prêt » : « Terminer sans bail » (`_frClose`) vs « Créer le bail » (`_frOpenBailStep`). **Aucun gate bloquant.**

- [ ] **Step 4 : Vérifier l'inline JS**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add index.html
git commit -m "Fil rouge v2 : écrans « et ensuite »/« bien prêt »/bail (relais openBail), stoppable partout"
```

---

## Task 8 : `index.html` — carte de continuité (voie B)

**Files:** Modify `index.html`

- [ ] **Step 1 : Markup de la carte de continuité**

Ajouter un toast/carte `#fr-cont` (réutilise les composants de toast existants si présents ; sinon markup calqué sur le mockup `.cont`) avec titre, sous-titre, [Plus tard] / [Continuer →].

- [ ] **Step 2 : `_frOfferContinue`**

```js
function _frOfferContinue(kind) {
  const map = {
    ent: ['Bailleur créé', 'Continuer vers l’immeuble ?', () => _frContinueFrom('continue-ent')],
    imm: ['Immeuble ajouté', 'Continuer vers le logement ?', () => _frContinueFrom('continue-imm')],
    acte: ['Acte importé', 'Continuer vers le logement ?', () => _frContinueFrom('acte')],
    log: ['Logement créé', 'Voir le bien prêt ?', () => _frContinueFrom('done-direct')],
  };
  const m = map[kind]; if (!m) return;
  el('fr-cont-title').textContent = '✓ ' + m[0];
  el('fr-cont-sub').textContent = m[1];
  el('fr-cont-go').onclick = () => { _frHideCont(); m[2](); };
  el('fr-cont').classList.add('show');
}
function _frContinueFrom(kind) {
  _frMode = true;
  if (kind === 'done-direct') { _frOpenStep('done'); return; }
  _frOpenStep(window.FilRougeConductor.entryStep(kind));
}
function _frHideCont() { el('fr-cont').classList.remove('show'); }
```

> `_frCtx` doit déjà pointer sur l'objet créé (posé par `_frAfterSave`/`_frAfterActe` avant l'offre). Vérifier au vrai clic que « Continuer » ouvre la bonne étape avec le bon bailleur/immeuble.

- [ ] **Step 3 : Vérifier l'inline JS**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 4 : Commit**

```bash
git add index.html
git commit -m "Fil rouge v2 : carte de continuité (déclencheur depuis une action normale)"
```

---

## Task 9 : `index.html` — points d'entrée « + Ajouter un bien » partout

**Files:** Modify `index.html`

- [ ] **Step 1 : Rebrancher l'entrée de l'onglet Biens**

Repérer `openBiensAdd()` (le bouton `#biens-add-btn`). En mode « biens », remplacer le corps par un démarrage du fil : `_frStart('bien')`. **Ne pas** casser les modes « bailleurs »/« immeubles » (qui restent `openNewEnt`/`addImmForm`).

- [ ] **Step 2 : CTA Accueil**

Ajouter sur l'Accueil (près du hero/onboarding existant) un bouton `.btn.bp` « + Ajouter un bien » `onclick="_frStart('bien')"` + « 📜 Importer un acte » `onclick="openActeImport()"` (l'acte passe par la continuité voie B).

- [ ] **Step 3 : Boutons sur fiches bailleur / immeuble / logement**

Ajouter un bouton « + Ajouter un bien » `onclick="_frStart('bien')"` (neutre) sur les fiches (bailleur, immeuble, logement). Les boutons contextuels existants (`+ Immeuble` sur fiche bailleur, etc.) restent inchangés et déclenchent la **continuité** via les hooks (voie B).

- [ ] **Step 4 : Vérifier l'inline JS**

Run: `node scripts/check-inline-js.mjs`
Expected: 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add index.html
git commit -m "Fil rouge v2 : « + Ajouter un bien » partout (Accueil, Biens, fiches) + acte"
```

---

## Task 10 : Miroir sandbox + bump version + sw.js

**Files:** Modify `index-test.html`, `index.html`, `sw.js`

- [ ] **Step 1 : Reporter le diff dans `index-test.html`**

Reporter **byte-identique** les blocs ajoutés (mirrors `<script>`, `#fr-bread`+CSS, conducteur, hooks, écrans du fil, continuité, entrées) dans `index-test.html`, en respectant ses gardes `_isTestMode`/clé `_test_immotrack_v4`. **Ne pas** auto-injecter le dataset démo.

- [ ] **Step 2 : Bump version**

Prendre le **numéro libre au-dessus de l'`origin/main` courant** (re-`grep` `IMMOTRACK_VERSION` sur `origin/main` juste avant). Mettre à jour dans `index.html` : `<title>`, `<em>` footer, `IMMOTRACK_VERSION`, ligne Récap DDT. Et `CACHE_VER` dans `sw.js`.

- [ ] **Step 3 : Vérifs**

Run: `node scripts/check-inline-js.mjs` → 0 erreur
Run: `node --check sw.js` → OK

- [ ] **Step 4 : Commit**

```bash
git add index.html index-test.html sw.js
git commit -m "Fil rouge v2 : miroir index-test.html + bump vX.Y + CACHE_VER"
```

---

## Task 11 : Vérification au VRAI CLIC + gates + audit

**Files:** aucun (vérification) — corrections éventuelles → commits ciblés

- [ ] **Step 1 : Gates automatiques**

Run: `node scripts/check-inline-js.mjs` → 0 erreur
Run: `npx vitest run` → suite verte (dont `parcours-bien-model` 15 + `fil-rouge-conductor`)
Run: `node --check sw.js` → OK

- [ ] **Step 2 : Test au VRAI CLIC (déployer un aperçu et piloter l'UI)**

Servir `index-test.html` (sandbox) et piloter par de **vrais clics** ([[feedback_test_navigateur_deploiement]], [[feedback_modify_verify]]) :
- « + Ajouter un bien » (Accueil, Biens, fiche bailleur, fiche immeuble, fiche logement) → le fil démarre au bailleur.
- Chaîne complète : bailleur → **auto** immeuble → **auto** logement → « et ensuite » → bien prêt → **✍ créer le bail** (relais `openBail`).
- **Vérifier l'empilement** : à chaque passage, **un seul** overlay `.ov` visible (pas de superposition — le bug n°1 de la v1).
- Multi-ajout : « un autre logement ici », « un autre immeuble ».
- **Voie B** : créer un bailleur depuis l'onglet Bailleurs (bouton normal) → carte de continuité → Continuer → immeuble.
- **Import acte** depuis Logement → continuité → logement pré-rempli.
- **Sortie partout** : « Plus tard — c'est gardé » à chaque écran → ferme, données conservées, rien perdu.
- **Rien d'obligatoire** : « Terminer sans bail » fonctionne ; s'arrêter au milieu conserve ce qui est fait.
- Fil d'Ariane visible et cohérent (fait/en cours) sur les 3 formats (PC/tablette/mobile).

**NE PAS** « vérifier » par injection de données ni appel direct de fonctions.

- [ ] **Step 3 : DRY — non-recopie**

Vérifier que le diff `index.html` **n'ajoute aucun champ de formulaire** bailleur/immeuble/logement (grep des `<input id="en-…">`/`#imm-…`/`#log-…` : inchangés). Le fil n'appelle que l'existant.

- [ ] **Step 4 : Audit `superpowers:code-reviewer`**

Dispatcher l'agent `superpowers:code-reviewer` sur le diff complet vs `origin/main` ([[feedback_audits_par_agents]]). Corriger les défauts bloquants AVANT de dire « prêt à tester ». Re-run gates après corrections.

- [ ] **Step 5 : Coordination `.index-queue`**

Inscrire la branche `feat/fil-rouge-bien-v2` dans `C:\Users\Did_K\Desktop\Immo\.index-queue\QUEUE.md` (statut ✅ prêt) selon `docs/INDEX-COMMIT-PROTOCOL.md` ([[feedback_index_commit_coordination]]). Intégration `index.html` sur `main` = session maître.

- [ ] **Step 6 : Mémoire**

Mettre à jour `project_fil_rouge_creation_bien.md` (v2 construite + audit + version) — statut temps réel ([[feedback_pilotage_realtime]]).

---

## Notes de couverture (self-review)

- **Empilement (bug #1)** → Task 5/7 (un overlay à la fois, jamais de coquille) + Task 11 Step 2 (vérif réelle).
- **Patrimoine vide (bug #2)** → n/a : plus d'arbre d'accueil ; le fil ouvre direct la modale bailleur (Task 5).
- **Porte séparée (bug #3)** → Task 6/8 (hooks post-save + continuité voie B).
- **Fil continu jusqu'au bail** → Task 2 (breadcrumb 4 maillons) + Task 7 (relais `openBail`).
- **Stoppable partout / rien d'obligatoire** → Task 7 Step 3 + Task 11 Step 2.
- **DRY** → Tasks 5-9 (appels aux vraies fonctions) + Task 11 Step 3.
- **Sandbox/version/gates/audit** → Tasks 10-11.
