# Fil rouge « Ajouter un bien » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen guided wizard (« coquille ») `#ov-parcours-bien` that chains **bailleur → immeuble(s) → logement(s) → bien prêt** by **reusing the existing creation modals unchanged**, with the acte-de-vente import as the phase-1 entry point and a completeness-tracked patrimoine tree supporting multi-add + delete.

**Architecture:** The coquille is a NEW `.ov` overlay in `index.html` that **orchestrates** — it never recopies a form. Each step **calls the existing opener** (`openActeImport`, `openNewEnt`, `addImmForm`, `openNewLog`, `openBail`) which opens its own modal *on top* of the coquille; on save, a single **guarded post-save hook** (`_pbAfterSave`) returns control to the coquille and re-renders its tree from `DB`. All tree/completeness/summary logic lives in a **pure, Vitest-tested helper module** `parcours-bien-model` (mirrored to a `window` global via the established pattern). Zero change to the legal-sensitive bail wizard beyond calling `openBail(ref)`.

**Tech Stack:** Vanilla JS monolith (`index.html`), ES-module helper + generated IIFE global mirror (`tools/sync-helpers-global-mirrors.mjs`), Vitest, Claude_Preview MCP for browser verification, `superpowers:code-reviewer` audit before hand-off.

---

## Grounding map (verified against `origin/main` @ v15.456, worktree `Immo-wt-filrouge`)

**These line numbers are indicative — re-confirm with Grep before editing; the executor must not trust them blindly.**

| Concern | Identifier | Line | Notes |
|---|---|---|---|
| Bailleur store | `DB.entites[]` | — | each has `.id` (`nid()`), `.nom`, `.immeubles[]` |
| Bailleur open | `openNewEnt(id)` | 42872 | `id` optional = edit |
| Bailleur save | `saveEnt()` | 43242 | overlay `#ov-ent` (3127) |
| Immeuble store | `ent.immeubles[]` | — | nested; NOT a top-level table |
| Immeuble open | `addImmForm(entIdOverride)` / `openNewImm()` | 42963 / 31085 | sets parent context |
| Immeuble save | `saveImm()` | 43101 | reads hidden `#imm-ent-id` (parent bailleur id); `#imm-nom` required |
| Immeuble derive | `immeubles()` | 6378 | distinct `l.imm` — label helper only |
| Logement store | `DB.logements[]` | — | `.ref` (unique), `.entity` (nom bailleur), `.imm` (nom immeuble) |
| Logement open | `openNewLog(ref)` | 41883 | overlay `#ov-log` (2217) |
| Logement save | `saveParamLog()` | 42641 | close via `_closeLogGuarded()` |
| Logement tabs | `setLogModalTab('ident'\|'desc'\|'diag'\|'equip'\|'presentation')` | — | panes `#logmod-ident/desc/diag/equip/presentation` |
| Logement required `*` | `#log-ref`, `#log-typeUsage`, `#log-entity`, `#log-imm` | 2234-2250 | `refreshLogImmSelect()` cascades entity→immeuble |
| Acte import open | `openActeImport()` | 40351 | stepper `#acte-stepper` (3046), steps depot/loading/verif/recap/succes |
| Acte step nav | `_acteSetStep(s)` | 40362 | seeds logements `_acteSeedLogements()` (40479), dedup entity `_acteFindDupEntity` (40455) |
| Bail relais | `openBail(ref, opts)` | 18085 | opens `#ov-bail` (1437) preselected on logement `ref` |
| Bail steps | `goBailStep(n)` | 10387 | `saveBail()` (19177), `closeBailWizard()` (10440) |
| Overlay show/hide | `openM(id)` / `closeM(id)` | 6371 / 6372 | remove/add `hidden` class |
| Misc | `el(id)` (6288), `nid()` (6289), `showToast` (6362), `saveDB()` (5991) | — | — |
| Helper pattern | `js/helpers/log-immeuble-resolver.global.js` + `__tests__/helpers/*.js` + `tools/sync-helpers-global-mirrors.mjs` | 3731 | precedent to follow |

**Mockup (validated 2026-07-11):** `C:/Users/Did_K/Desktop/Immo/mockups/fil-rouge-creation-bien/index.html`
**Spec:** `docs/superpowers/specs/2026-07-09-fil-rouge-creation-bien-design.md`

---

## File Structure

- **Create** `__tests__/helpers/parcours-bien-model.js` — pure logic: tree build, completeness, creation gate, summary. One responsibility: the parcours data model. No DOM.
- **Create** `__tests__/helpers/parcours-bien-model.test.js` — Vitest unit tests for the above.
- **Create (generated)** `js/helpers/parcours-bien-model.global.js` — IIFE mirror exposing `window.ParcoursBienModel`, produced by `tools/sync-helpers-global-mirrors.mjs`.
- **Modify** `index.html`:
  - Add `<script src="js/helpers/parcours-bien-model.global.js">` next to the other helper globals (~line 3731).
  - Add the coquille overlay markup `#ov-parcours-bien` (near the other `.ov` overlays, e.g. after `#ov-imm` ~3260).
  - Add the coquille CSS (in the main `<style>`).
  - Add the orchestration functions (`openParcoursBien`, `_pbGoStep`, `_pbRenderTree`, `_pbImportActe`, `_pbAddImmeuble`, `_pbAddLogement`, `_pbAfterSave`, `_pbOpenBail`, `_pbClose`) in the script region near the other creation functions (~42800).
  - Add the guarded post-save hook call at the tail of `saveEnt`, `saveImm`, `saveParamLog` (one guarded line each).
  - Wire entry points: Biens `+` button, Accueil CTA, onboarding CTA.
  - Version bump (title, footer `<em>`, `IMMOTRACK_VERSION`, `Récap`) + `CACHE_VER` in `sw.js`.

---

## Task 1: Pure model — creation gate (`canCreateLogement`)

**Files:**
- Create: `__tests__/helpers/parcours-bien-model.js`
- Test: `__tests__/helpers/parcours-bien-model.test.js`

- [ ] **Step 1: Write the failing test**

```js
// __tests__/helpers/parcours-bien-model.test.js
import { describe, it, expect } from 'vitest';
import { canCreateLogement } from './parcours-bien-model.js';

describe('canCreateLogement — Identité obligatoire (décision user 2026-07-11)', () => {
  const full = { ref: 'F-102', typeUsage: 'habitation-nu', entity: 'SCI du Château', imm: '12 rue du Château' };

  it('accepte quand les 4 champs requis sont présents', () => {
    expect(canCreateLogement(full)).toEqual({ ok: true, missing: [] });
  });

  it('refuse si la référence manque', () => {
    const r = canCreateLogement({ ...full, ref: '  ' });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('ref');
  });

  it('refuse si le type d’usage manque', () => {
    expect(canCreateLogement({ ...full, typeUsage: '' }).missing).toContain('typeUsage');
  });

  it('refuse si l’entité ou l’immeuble manque', () => {
    const r = canCreateLogement({ ...full, entity: '', imm: '' });
    expect(r.missing).toEqual(expect.arrayContaining(['entity', 'imm']));
  });

  it('tolère null/undefined en entrée', () => {
    expect(canCreateLogement(null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/helpers/parcours-bien-model.test.js`
Expected: FAIL — `Cannot find module './parcours-bien-model.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// __tests__/helpers/parcours-bien-model.js
// Modèle pur du fil rouge « Ajouter un bien ». Aucune dépendance DOM.
// Décision user 2026-07-11 : Identité obligatoire pour créer un logement.

const _s = (v) => (v == null ? '' : String(v)).trim();

/** Champs requis pour créer un logement (les `*` de l'onglet Identité de #ov-log). */
export const LOG_REQUIRED = ['ref', 'typeUsage', 'entity', 'imm'];

export function canCreateLogement(fields) {
  const f = fields || {};
  const missing = LOG_REQUIRED.filter((k) => _s(f[k]) === '');
  return { ok: missing.length === 0, missing };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/helpers/parcours-bien-model.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add __tests__/helpers/parcours-bien-model.js __tests__/helpers/parcours-bien-model.test.js
git commit -m "feat(fil-rouge): parcours model — canCreateLogement (Identité obligatoire)"
```

---

## Task 2: Pure model — completeness (`logementCompleteness`, `immeubleCompleteness`)

**Files:**
- Modify: `__tests__/helpers/parcours-bien-model.js`
- Test: `__tests__/helpers/parcours-bien-model.test.js`

Completeness drives the tree pill `À compléter` (ambre) → `Complet` (vert). A logement is `complet` when required identity is present AND the optional tabs have at least their key fields (`surface`, `loyer` from Description; `dpe` from Diagnostics). An immeuble is `complet` when it has an address.

- [ ] **Step 1: Write the failing test**

```js
// append to __tests__/helpers/parcours-bien-model.test.js
import { logementCompleteness, immeubleCompleteness } from './parcours-bien-model.js';

describe('logementCompleteness', () => {
  const base = { ref: 'F-102', typeUsage: 'habitation-nu', entity: 'SCI', imm: '12 rue' };

  it('a-completer quand seule l’identité est remplie (onglets optionnels vides)', () => {
    const r = logementCompleteness(base);
    expect(r.level).toBe('a-completer');
    expect(r.missing).toEqual(expect.arrayContaining(['surface', 'loyer', 'dpe']));
  });

  it('complet quand identité + surface + loyer + dpe sont remplis', () => {
    const r = logementCompleteness({ ...base, surface: 44, loyer: 508, dpe: 'D' });
    expect(r.level).toBe('complet');
    expect(r.missing).toEqual([]);
  });

  it('a-completer (jamais complet) si l’identité manque', () => {
    expect(logementCompleteness({ surface: 44, loyer: 508, dpe: 'D' }).level).toBe('a-completer');
  });
});

describe('immeubleCompleteness', () => {
  it('complet dès qu’une adresse est présente', () => {
    expect(immeubleCompleteness({ nom: '12 rue', adr: '12 rue du Château' }).level).toBe('complet');
  });
  it('a-completer sans adresse', () => {
    expect(immeubleCompleteness({ nom: '12 rue', adr: '' }).level).toBe('a-completer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/helpers/parcours-bien-model.test.js`
Expected: FAIL — `logementCompleteness is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// append to __tests__/helpers/parcours-bien-model.js

/** Champs « clés » des onglets optionnels qui font passer un logement à `complet`. */
export const LOG_OPTIONAL_KEY = ['surface', 'loyer', 'dpe'];

export function logementCompleteness(log) {
  const l = log || {};
  if (!canCreateLogement(l).ok) {
    // identité incomplète → toujours à compléter, on liste tout ce qui reste
    const missing = [...canCreateLogement(l).missing, ...LOG_OPTIONAL_KEY.filter((k) => _num(l[k]) === '')];
    return { level: 'a-completer', missing };
  }
  const missing = LOG_OPTIONAL_KEY.filter((k) => _num(l[k]) === '');
  return { level: missing.length ? 'a-completer' : 'complet', missing };
}

export function immeubleCompleteness(imm) {
  const adr = _s((imm || {}).adr);
  return adr ? { level: 'complet', missing: [] } : { level: 'a-completer', missing: ['adr'] };
}

// `surface`/`loyer` numériques : 0 ou vide = manquant ; `dpe` textuel.
function _num(v) {
  if (v === 0) return ''; // 0 non renseigné
  return _s(v);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/helpers/parcours-bien-model.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add __tests__/helpers/parcours-bien-model.js __tests__/helpers/parcours-bien-model.test.js
git commit -m "feat(fil-rouge): parcours model — completeness logement/immeuble"
```

---

## Task 3: Pure model — tree build + summary (`buildParcoursTree`, `parcoursSummary`)

**Files:**
- Modify: `__tests__/helpers/parcours-bien-model.js`
- Test: `__tests__/helpers/parcours-bien-model.test.js`

The coquille renders a tree `bailleur → immeubles[] → logements[]` from the live DB, scoped to one bailleur. `buildParcoursTree` groups the bailleur's logements under its immeubles (by `l.imm === imm.nom`), including immeubles with no logement yet and a synthetic `— Sans immeuble —` bucket for logements whose `imm` matches none.

- [ ] **Step 1: Write the failing test**

```js
// append to __tests__/helpers/parcours-bien-model.test.js
import { buildParcoursTree, parcoursSummary } from './parcours-bien-model.js';

describe('buildParcoursTree', () => {
  const entite = { id: 1, nom: 'SCI du Château', immeubles: [
    { id: 11, nom: '12 rue du Château', adr: '12 rue du Château' },
    { id: 12, nom: '5 av. Gare', adr: '' },
  ]};
  const logements = [
    { ref: 'F-102', entity: 'SCI du Château', imm: '12 rue du Château', surface: 44, loyer: 508, dpe: 'D' },
    { ref: 'F-103', entity: 'SCI du Château', imm: '12 rue du Château' },
    { ref: 'X-1',  entity: 'Autre SCI',      imm: 'ailleurs' },        // hors scope bailleur
    { ref: 'Z-9',  entity: 'SCI du Château', imm: 'immeuble fantôme' },// imm inconnu → sans immeuble
  ];

  it('groupe les logements du bailleur sous ses immeubles', () => {
    const tree = buildParcoursTree(entite, logements);
    expect(tree.bailleur.nom).toBe('SCI du Château');
    const imm1 = tree.immeubles.find((i) => i.nom === '12 rue du Château');
    expect(imm1.logements.map((l) => l.ref)).toEqual(['F-102', 'F-103']);
    expect(imm1.completeness.level).toBe('complet');
    expect(imm1.logements[0].completeness.level).toBe('complet');   // F-102
    expect(imm1.logements[1].completeness.level).toBe('a-completer'); // F-103
  });

  it('inclut les immeubles sans logement', () => {
    const tree = buildParcoursTree(entite, logements);
    const imm2 = tree.immeubles.find((i) => i.nom === '5 av. Gare');
    expect(imm2.logements).toEqual([]);
    expect(imm2.completeness.level).toBe('a-completer'); // pas d'adresse
  });

  it('range les logements à immeuble inconnu dans « — Sans immeuble — »', () => {
    const tree = buildParcoursTree(entite, logements);
    const orphan = tree.immeubles.find((i) => i.nom === '— Sans immeuble —');
    expect(orphan.logements.map((l) => l.ref)).toEqual(['Z-9']);
    expect(orphan.synthetic).toBe(true);
  });

  it('exclut les logements d’un autre bailleur', () => {
    const tree = buildParcoursTree(entite, logements);
    const allRefs = tree.immeubles.flatMap((i) => i.logements.map((l) => l.ref));
    expect(allRefs).not.toContain('X-1');
  });
});

describe('parcoursSummary', () => {
  it('compte immeubles (réels) et logements, et liste les logements à louer', () => {
    const entite = { id: 1, nom: 'SCI', immeubles: [{ id: 11, nom: 'A', adr: 'a' }] };
    const logements = [
      { ref: 'A-1', entity: 'SCI', imm: 'A', locataire: '' },
      { ref: 'A-2', entity: 'SCI', imm: 'A', locataire: 'Dupont' },
    ];
    const s = parcoursSummary(buildParcoursTree(entite, logements));
    expect(s.nbImmeubles).toBe(1);       // le bucket synthétique ne compte pas
    expect(s.nbLogements).toBe(2);
    expect(s.logementsALouer.map((l) => l.ref)).toEqual(['A-1']); // sans locataire
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/helpers/parcours-bien-model.test.js`
Expected: FAIL — `buildParcoursTree is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// append to __tests__/helpers/parcours-bien-model.js

const ORPHAN_LABEL = '— Sans immeuble —';

export function buildParcoursTree(entite, allLogements) {
  const ent = entite || { nom: '', immeubles: [] };
  const logs = (allLogements || []).filter((l) => l && l.entity === ent.nom);
  const immList = (ent.immeubles || []).map((im) => ({
    id: im.id,
    nom: im.nom,
    adr: im.adr || '',
    raw: im,
    completeness: immeubleCompleteness(im),
    logements: logs
      .filter((l) => (l.imm || '') === im.nom)
      .map(_decorateLog),
  }));
  // orphelins : logement dont `imm` ne matche aucun immeuble connu
  const known = new Set((ent.immeubles || []).map((im) => im.nom));
  const orphans = logs.filter((l) => !known.has(l.imm || '')).map(_decorateLog);
  if (orphans.length) {
    immList.push({ id: null, nom: ORPHAN_LABEL, adr: '', raw: null, synthetic: true,
      completeness: { level: 'a-completer', missing: [] }, logements: orphans });
  }
  return { bailleur: { id: ent.id, nom: ent.nom }, immeubles: immList };
}

function _decorateLog(l) {
  return { ...l, completeness: logementCompleteness(l) };
}

export function parcoursSummary(tree) {
  const t = tree || { immeubles: [] };
  const realImms = t.immeubles.filter((i) => !i.synthetic);
  const allLogs = t.immeubles.flatMap((i) => i.logements);
  return {
    nbImmeubles: realImms.length,
    nbLogements: allLogs.length,
    logementsALouer: allLogs.filter((l) => !_str(l.locataire)),
  };
}

function _str(v) { return _s(v); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/helpers/parcours-bien-model.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add __tests__/helpers/parcours-bien-model.js __tests__/helpers/parcours-bien-model.test.js
git commit -m "feat(fil-rouge): parcours model — buildParcoursTree + parcoursSummary"
```

---

## Task 4: Generate the `window` global mirror

**Files:**
- Create (generated): `js/helpers/parcours-bien-model.global.js`
- Modify: `index.html` (add `<script>` tag)

- [ ] **Step 1: Inspect the sync tool to learn the convention**

Run: `node -e "console.log(require('fs').readFileSync('tools/sync-helpers-global-mirrors.mjs','utf8').slice(0,2000))"`
Expected: shows how modules are listed (an array/map of helper basenames). Confirm whether new helpers must be registered there.

- [ ] **Step 2: Register the new helper if required**

If the tool has an explicit list, add `'parcours-bien-model'` to it (Edit the array). If it auto-discovers `__tests__/helpers/*.js`, skip.

- [ ] **Step 3: Run the sync tool**

Run: `node tools/sync-helpers-global-mirrors.mjs`
Expected: writes `js/helpers/parcours-bien-model.global.js` exposing `window.ParcoursBienModel = { canCreateLogement, logementCompleteness, immeubleCompleteness, buildParcoursTree, parcoursSummary, LOG_REQUIRED, LOG_OPTIONAL_KEY }`.

- [ ] **Step 4: Verify the pattern-shadow test passes**

Run: `npx vitest run` (the repo has a test asserting each helper has a matching global mirror).
Expected: PASS — no "missing mirror" failure for `parcours-bien-model`.

- [ ] **Step 5: Add the script tag in index.html**

Find the helper-globals block (~line 3731, near `log-immeuble-resolver.global.js`) and add:

```html
<script src="js/helpers/parcours-bien-model.global.js"></script>
```

- [ ] **Step 6: Commit**

```bash
git add js/helpers/parcours-bien-model.global.js tools/sync-helpers-global-mirrors.mjs index.html
git commit -m "feat(fil-rouge): global mirror window.ParcoursBienModel + script tag"
```

---

## Task 5: Coquille markup + CSS (`#ov-parcours-bien`)

**Files:**
- Modify: `index.html` (overlay markup near other `.ov`; CSS in main `<style>`)

The coquille is a full-screen `.ov` overlay with a 3-step rail (Démarrer · Patrimoine · Bien prêt) and three panes. Reuse the app's overlay show/hide (`openM`/`closeM`) so it composes with existing modals opening on top. Structure mirrors the validated mockup but uses the app's design tokens.

- [ ] **Step 1: Add the overlay markup**

Insert after the `#ov-imm` overlay (locate: `Grep '<div class="ov hidden" id="ov-imm"'`, insert after its closing `</div>`):

```html
<!-- Fil rouge « Ajouter un bien » — coquille plein écran (orchestration, aucun form recopié) -->
<div class="ov hidden" id="ov-parcours-bien">
  <div class="modal pb-shell" style="max-width:940px">
    <div class="m-head">
      <h3>Ajouter un bien</h3>
      <button class="m-close" onclick="_pbClose()" title="Fermer (ce qui est créé est gardé)">✕</button>
    </div>
    <div class="pb-rail" id="pb-rail">
      <div class="pb-step act" data-i="0" onclick="_pbGoStep(0)"><span class="n">1</span><span class="lbl">Démarrer</span></div>
      <div class="pb-step" data-i="1" onclick="_pbGoStep(1)"><span class="n">2</span><span class="lbl">Patrimoine</span></div>
      <div class="pb-step" data-i="2" onclick="_pbGoStep(2)"><span class="n">✓</span><span class="lbl">Bien prêt</span></div>
    </div>
    <div class="m-body pb-body">
      <!-- Étape 1 : Démarrer (acte en phase 1) -->
      <div class="pb-pane act" data-i="0">
        <h4 class="pb-h">Comment on démarre ?</h4>
        <p class="pb-lead">Si tu viens d'acheter, importe l'acte de vente : il pré-remplit le bailleur, l'immeuble et le lot. Sinon, saisis à la main.</p>
        <div class="pb-start">
          <button class="pb-way hero" onclick="_pbImportActe()">
            <span class="ic">📄</span><b>Importer l'acte de vente</b>
            <s>Pré-remplit bailleur, immeuble et lot. Réutilise l'import déjà dans l'app.</s>
            <span class="tag">Le plus rapide</span>
          </button>
          <button class="pb-way" onclick="_pbStartManual()">
            <span class="ic">✍️</span><b>Saisir à la main</b>
            <s>Choisir/créer le bailleur, puis ajouter immeubles et logements.</s>
          </button>
        </div>
      </div>
      <!-- Étape 2 : Patrimoine (arbre + boutons +) -->
      <div class="pb-pane" data-i="1">
        <h4 class="pb-h">Le patrimoine de ce bailleur</h4>
        <p class="pb-lead">Clique une ligne pour ouvrir sa fiche complète. La pastille <b>À compléter</b> indique ce qu'il reste.</p>
        <div id="pb-tree"><!-- rendu par _pbRenderTree() --></div>
      </div>
      <!-- Étape 3 : Bien prêt -->
      <div class="pb-pane" data-i="2">
        <div id="pb-done"><!-- rendu par _pbRenderDone() --></div>
      </div>
    </div>
    <div class="m-foot pb-foot">
      <button class="btn bs" onclick="_pbClose()">Plus tard — garder ce qui est fait</button>
      <span style="flex:1"></span>
      <button class="btn bs" id="pb-back" onclick="_pbGoStep(_pbStep-1)" style="display:none">‹ Retour</button>
      <button class="btn bp" id="pb-next" onclick="_pbGoStep(_pbStep+1)">Continuer ›</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add the CSS**

In the main `<style>` block, append (reuse existing tokens `--acc`, `--pos`, `--warn`, `--bor`, etc. — confirm token names with `Grep '\-\-acc' index.html | head`):

```css
.pb-shell{display:flex;flex-direction:column;max-height:88vh}
.pb-rail{display:flex;padding:12px 4px;border-bottom:1px solid var(--bor)}
.pb-step{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;font:600 11px Inter;color:var(--t3);cursor:pointer;position:relative}
.pb-step .n{width:26px;height:26px;border-radius:50%;background:var(--sur3,#eef1f6);display:flex;align-items:center;justify-content:center;font:700 12px Inter}
.pb-step.act{color:var(--t1)}.pb-step.act .n{background:var(--acc);color:#fff}
.pb-step.done .n{background:var(--pos);color:#fff}
.pb-body{flex:1;overflow-y:auto}
.pb-pane{display:none}.pb-pane.act{display:block}
.pb-start{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.pb-way{border:1.5px solid var(--bor);border-radius:12px;padding:18px;cursor:pointer;background:var(--sur,#fff);text-align:center;font:inherit}
.pb-way.hero{border-color:var(--acc);background:rgba(255,90,60,.05)}
.pb-way .ic{font-size:28px;display:block}
.pb-way b{display:block;margin:8px 0 4px}.pb-way s{display:block;text-decoration:none;font-size:11.5px;color:var(--t2)}
.pb-way .tag{display:inline-block;margin-top:8px;font:700 10px Inter;background:var(--acc);color:#fff;border-radius:10px;padding:2px 9px}
.pb-tree{border:1px solid var(--bor);border-radius:12px;overflow:hidden}
.pb-bail{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--sur2,#f6f7f9);border-bottom:1px solid var(--bor)}
.pb-imm-head{display:flex;align-items:center;gap:8px;padding:10px 14px 10px 20px;cursor:pointer;border-bottom:1px solid var(--bor2,#eef0f4)}
.pb-logs{padding:0 14px 10px 34px;display:flex;flex-direction:column;gap:6px}
.pb-log{display:flex;align-items:center;gap:8px;background:var(--sur2,#f6f7f9);border:1px solid var(--bor2,#eef0f4);border-radius:8px;padding:7px 11px;cursor:pointer;font-size:12px}
.pb-pill{font:700 9.5px Inter;border-radius:9px;padding:2px 7px;white-space:nowrap}
.pb-pill.ok{background:#dcfce7;color:#166534}.pb-pill.todo{background:#fef3c7;color:#92400e}
.pb-del{background:none;border:none;color:var(--t3);cursor:pointer;font-size:14px}
.pb-add{background:none;border:1.5px dashed var(--bor);border-radius:8px;padding:6px 12px;font:600 11.5px Inter;color:var(--acc);cursor:pointer}
.pb-addimm{width:100%;border:none;border-top:1px dashed var(--bor);padding:11px;font:700 13px Inter;color:var(--acc);cursor:pointer;background:var(--sur,#fff)}
@media(max-width:720px){.pb-start{grid-template-columns:1fr}.pb-step .lbl{display:none}}
```

- [ ] **Step 3: Verify markup renders (browser)**

Start preview (`immotrack-sandbox`), navigate to the worktree build, run in console: `openM('ov-parcours-bien')` → the coquille appears with the 3-step rail and step 1's two cards.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(fil-rouge): coquille #ov-parcours-bien markup + CSS"
```

---

## Task 6: Coquille state + navigation + tree render (`openParcoursBien`, `_pbGoStep`, `_pbRenderTree`)

**Files:**
- Modify: `index.html` (script region ~42800, near `openNewEnt`)

- [ ] **Step 1: Add the coquille controller**

```js
// ── Fil rouge « Ajouter un bien » — orchestration (réutilise les modales existantes) ──
let _pbStep = 0;
let _pbEntId = null;   // bailleur courant du parcours (id dans DB.entites)
let _pbActive = false; // vrai tant que la coquille est ouverte (arme le hook post-save)

function openParcoursBien(opts) {
  opts = opts || {};
  _pbActive = true;
  _pbEntId = opts.entId != null ? opts.entId : null;
  openM('ov-parcours-bien');
  _pbGoStep(opts.step != null ? opts.step : 0);
}

function _pbClose() {
  _pbActive = false;
  closeM('ov-parcours-bien');
  if (typeof _refreshAfterMutation === 'function') _refreshAfterMutation();
}

function _pbGoStep(i) {
  if (i < 0 || i > 2) return;
  _pbStep = i;
  document.querySelectorAll('#ov-parcours-bien .pb-pane').forEach((p) => p.classList.toggle('act', +p.dataset.i === i));
  document.querySelectorAll('#ov-parcours-bien .pb-step').forEach((s) => {
    const si = +s.dataset.i;
    s.classList.toggle('act', si === i);
    s.classList.toggle('done', si < i);
  });
  el('pb-back').style.display = i > 0 ? '' : 'none';
  el('pb-next').style.display = i < 2 ? '' : 'none';
  if (i === 1) _pbRenderTree();
  if (i === 2) _pbRenderDone();
}

function _pbCurrentEnt() {
  return (DB.entites || []).find((e) => +e.id === +_pbEntId) || null;
}

function _pbRenderTree() {
  const ent = _pbCurrentEnt();
  const host = el('pb-tree');
  if (!ent) { host.innerHTML = '<p class="pb-lead">Choisis d’abord un bailleur.</p>'
    + '<button class="pb-addimm" onclick="_pbChooseBailleur()">+ Choisir / créer le bailleur</button>'; return; }
  const tree = window.ParcoursBienModel.buildParcoursTree(ent, DB.logements || []);
  const immsHtml = tree.immeubles.map((im) => {
    const logs = im.logements.map((l) => {
      const p = l.completeness.level === 'complet'
        ? '<span class="pb-pill ok">Complet</span>' : '<span class="pb-pill todo">À compléter</span>';
      return '<div class="pb-log" onclick="if(!event.target.closest(\'.pb-del\'))_pbEditLog(\'' + _attr(l.ref) + '\')">'
        + '<b>' + escHtml(l.ref) + '</b>'
        + '<span style="color:var(--t3);font-size:11px">' + escHtml(_pbLogMeta(l)) + '</span>'
        + p
        + '<span style="flex:1"></span>'
        + '<button class="pb-del" title="retirer" onclick="event.stopPropagation();_pbRemoveLog(\'' + _attr(l.ref) + '\')">✕</button>'
        + '</div>';
    }).join('');
    const immPill = im.completeness.level === 'complet'
      ? '<span class="pb-pill ok">Complet</span>' : '<span class="pb-pill todo">À compléter</span>';
    const delImm = im.synthetic ? '' :
      '<button class="pb-del" title="retirer l’immeuble" onclick="event.stopPropagation();_pbRemoveImm(' + im.id + ')">✕</button>';
    const headClick = im.synthetic ? '' : ' onclick="_pbEditImm(' + im.id + ')"';
    return '<div class="pb-imm">'
      + '<div class="pb-imm-head"' + headClick + '>🏛 <b>' + escHtml(im.nom) + '</b>' + immPill
      + '<span style="flex:1"></span>' + delImm + '</div>'
      + '<div class="pb-logs">' + logs
      + '<button class="pb-add" onclick="_pbAddLogement(' + (im.synthetic ? 'null' : '\'' + _attr(im.nom) + '\'') + ')">+ Ajouter un logement</button>'
      + '</div></div>';
  }).join('');
  host.innerHTML = '<div class="pb-tree">'
    + '<div class="pb-bail"><b>' + escHtml(ent.nom) + '</b>'
    + '<span style="flex:1"></span>'
    + '<button class="btn bs" onclick="_pbChooseBailleur()">Changer</button></div>'
    + immsHtml
    + '<button class="pb-addimm" onclick="_pbAddImmeuble()">+ Ajouter un immeuble</button>'
    + '</div>';
}

function _pbLogMeta(l) {
  const bits = [];
  if (l.typeUsage) bits.push(String(l.typeUsage).split('-')[0]);
  if (l.surface) bits.push(l.surface + ' m²');
  if (l.loyer) bits.push(l.loyer + ' €');
  return bits.join(' · ') || 'à compléter';
}
function _attr(s) { return String(s).replace(/'/g, "\\'"); }
```

- [ ] **Step 2: Verify in browser**

With the worktree build in preview and a demo dataset loaded (button « 🎲 Charger dataset démo » — never auto-inject), console:
```js
openParcoursBien({ entId: DB.entites[0].id, step: 1 });
```
Expected: the tree shows the bailleur, its immeubles, its logements with `Complet`/`À compléter` pills.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(fil-rouge): coquille controller + tree render from DB"
```

---

## Task 7: Reuse the bailleur & immeuble modals (`_pbChooseBailleur`, `_pbAddImmeuble`, `_pbEditImm`, `_pbAddLogement`, `_pbEditLog`) + post-save hook

**Files:**
- Modify: `index.html` — orchestration functions + one guarded line at the tail of `saveEnt` (43242), `saveImm` (43101), `saveParamLog` (42641)

The rule: **call the existing opener, let its modal open on top of the coquille, and after its save re-render the tree.** No form is recopied. The bridge is `_pbAfterSave(kind, obj)`, invoked by a single guarded branch appended to each existing save (guard = `if (_pbActive)`), so behaviour is unchanged when the parcours is closed.

- [ ] **Step 1: Add the orchestration functions**

```js
function _pbChooseBailleur() {
  // réutilise la modale entité existante ; à l'enregistrement, _pbAfterSave('ent', ent) capte l'id
  openNewEnt();          // #ov-ent (création). Édition d'un existant : openNewEnt(id).
}

function _pbAddImmeuble() {
  const ent = _pbCurrentEnt();
  if (!ent) { showToast('Choisis d’abord un bailleur', 'err'); return _pbChooseBailleur(); }
  addImmForm(ent.id);    // #ov-imm avec parent bailleur pré-armé (#imm-ent-id)
}
function _pbEditImm(immId) {
  const ent = _pbCurrentEnt(); if (!ent) return;
  const idx = (ent.immeubles || []).findIndex((im) => +im.id === +immId);
  if (idx < 0) return;
  addImmForm(ent.id);
  if (el('imm-edit-id')) el('imm-edit-id').value = idx;  // bascule le form en édition de l'immeuble idx
  _immFillForm && _immFillForm(ent.immeubles[idx]);       // si un remplisseur existe ; sinon addImmForm gère l'idx
}

function _pbAddLogement(immNom) {
  const ent = _pbCurrentEnt();
  if (!ent) { showToast('Choisis d’abord un bailleur', 'err'); return; }
  openNewLog();                       // #ov-log, onglet Identité
  setLogModalTab('ident');
  if (el('log-entity')) { el('log-entity').value = ent.nom; refreshLogImmSelect(); }
  if (immNom && el('log-imm')) el('log-imm').value = immNom;   // immeuble pré-sélectionné
}
function _pbEditLog(ref) {
  openNewLog(ref);                    // ouvre le logement existant (réf) sur ses onglets
  setLogModalTab('ident');
}
```

- [ ] **Step 2: Add the post-save bridge**

```js
// Pont : appelé UNIQUEMENT quand le parcours est actif, à la fin des saves existants.
function _pbAfterSave(kind, obj) {
  if (!_pbActive) return;
  if (kind === 'ent' && obj && obj.id != null) _pbEntId = obj.id;  // 1er bailleur créé → devient le courant
  // La modale enfant s'est fermée via son propre flux ; on revient à l'étape Patrimoine.
  if (_pbStep < 1) _pbGoStep(1); else _pbRenderTree();
}
function _pbRemoveImm(immId) {
  const ent = _pbCurrentEnt(); if (!ent) return;
  if (!confirm2('Retirer cet immeuble du bailleur ?')) return;
  ent.immeubles = (ent.immeubles || []).filter((im) => +im.id !== +immId);
  saveDB(); _pbRenderTree();
}
function _pbRemoveLog(ref) {
  if (!confirm2('Retirer ce logement ?')) return;
  DB.logements = (DB.logements || []).filter((l) => l.ref !== ref);
  saveDB(); _pbRenderTree();
}
```

> NOTE for the executor: `_pbRemoveImm`/`_pbRemoveLog` here do a **hard filter** for the mockup-equivalent behaviour. Before shipping, check whether the app uses soft-delete/tombstones for immeubles/logements (search `_deleted`, `archived`, `_isAlive`, tombstone). If so, route removal through the existing delete function (e.g. the one behind the fiche « Supprimer ») to preserve Drive/cloud tombstone propagation — see memory `feedback_wrapping_context`. Do NOT introduce a second deletion path.

- [ ] **Step 3: Append the guarded hook to each existing save**

At the **tail** of `saveEnt()` (after it has created the entité and closed `#ov-ent`), add:

```js
  if (typeof _pbAfterSave === 'function' && _pbActive) _pbAfterSave('ent', ent /* the entité just saved */);
```

At the tail of `saveImm()` (after `ent.immeubles` is updated and modal closed):

```js
  if (typeof _pbAfterSave === 'function' && _pbActive) _pbAfterSave('imm', im);
```

At the tail of `saveParamLog()` (after the logement is written to `DB.logements` and modal closed):

```js
  if (typeof _pbAfterSave === 'function' && _pbActive) _pbAfterSave('log', /* the logement object */);
```

> The executor must READ each save's tail first (variable names for the saved object differ: `ent`, `im`, and the logement local in `saveParamLog`) and confirm the modal-close + redirect already happened before this line, so the hook only re-renders the coquille — see memory `feedback_modify_verify` and `feedback_wrapping_context`.

- [ ] **Step 4: Verify the guard is inert when parcours is closed**

Run: `node scripts/check-inline-js.mjs` → PASS (no syntax error).
Browser: with the coquille CLOSED, create a bailleur/immeuble/logement the normal way → behaviour identical to before (hook is skipped because `_pbActive` is false). Confirm via `preview_snapshot` that the normal redirect still happens.

- [ ] **Step 5: Verify the reuse flow end-to-end (browser)**

`openParcoursBien({})` → step 1 « Saisir à la main » → create a bailleur via the real `#ov-ent` → returns to step 2 with the bailleur → `+ Ajouter un immeuble` (real `#ov-imm`) → save → tree shows it → `+ Ajouter un logement` (real `#ov-log`, Identité) → save → logement appears with `À compléter`. Confirm `DB.entites`/`DB.logements` actually contain the new records (`preview_eval`).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(fil-rouge): reuse ent/imm/log modals via guarded _pbAfterSave hook"
```

---

## Task 8: Acte-de-vente in phase 1 (`_pbImportActe`, `_pbStartManual`)

**Files:**
- Modify: `index.html` — orchestration + a guarded return hook from the acte « recap/succes » step

The acte import (`openActeImport`, `#acte-stepper`) already creates the entité + immeuble + logement(s) on validation. In the parcours, launching it from step 1 must, on completion, set `_pbEntId` to the entité it created/matched and land on step 2.

- [ ] **Step 1: Add the launchers**

```js
function _pbStartManual() { _pbGoStep(1); }

function _pbImportActe() {
  // réutilise l'import acte existant ; à la fin, _pbAfterActe capte l'entité créée
  openActeImport();
}
```

- [ ] **Step 2: Read the acte completion path**

Run: `Grep '_acteSetStep' index.html` and read `_acteRenderVerif`/the "recap → succes" transition + where the entité/logements are persisted (search the validate/confirm handler that calls `saveDB()` inside the acte flow). Identify the entité object it produces or matches (`_acteFindDupEntity`).

- [ ] **Step 3: Add a guarded return hook at the acte's persist point**

At the point where the acte flow has committed the entité + logements (just before showing the `succes` step), append:

```js
  if (typeof _pbAfterActe === 'function' && _pbActive) _pbAfterActe(/* the entité created/matched */);
```

And define:

```js
function _pbAfterActe(ent) {
  if (!_pbActive || !ent) return;
  _pbEntId = ent.id;
  // l'acte a déjà fermé son stepper ; on ramène le user sur l'arbre pré-rempli
  _pbGoStep(1);
  showToast('Acte importé — bailleur, immeuble et lot pré-remplis', 'success');
}
```

- [ ] **Step 4: Verify (browser)**

`openParcoursBien({})` → « Importer l'acte de vente » → run through the acte stepper with a sample PDF (or the acte flow's manual path) → on completion the coquille shows step 2 with the imported bailleur + immeuble + lot, lot pill `À compléter`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(fil-rouge): acte de vente en phase 1 (relais openActeImport + retour arbre)"
```

---

## Task 9: « Bien prêt » step — summary + bail relais (`_pbRenderDone`, `_pbOpenBail`)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the done renderer + bail relais**

```js
function _pbRenderDone() {
  const ent = _pbCurrentEnt();
  const host = el('pb-done');
  if (!ent) { host.innerHTML = '<p class="pb-lead">Rien de créé pour l’instant.</p>'; return; }
  const tree = window.ParcoursBienModel.buildParcoursTree(ent, DB.logements || []);
  const s = window.ParcoursBienModel.parcoursSummary(tree);
  const cards = s.logementsALouer.map((l) =>
    '<div class="pb-log"><b>' + escHtml(l.ref) + '</b>'
    + '<span style="color:var(--t3);font-size:11px">à louer</span><span style="flex:1"></span>'
    + '<button class="btn bp" onclick="_pbOpenBail(\'' + _attr(l.ref) + '\')">✍ Créer le bail</button></div>'
  ).join('') || '<p class="pb-lead">Aucun logement à louer pour l’instant.</p>';
  host.innerHTML = '<div style="text-align:center">'
    + '<div style="font-size:38px">🎉</div>'
    + '<h3>Patrimoine enregistré</h3>'
    + '<p class="pb-lead">Bailleur <b>' + escHtml(ent.nom) + '</b> · '
    + s.nbImmeubles + ' immeuble(s) · ' + s.nbLogements + ' logement(s)</p>'
    + '<div style="max-width:560px;margin:12px auto;display:flex;flex-direction:column;gap:7px">' + cards + '</div>'
    + '<button class="btn bp" onclick="_pbFinish()">Terminer — voir mes biens</button>'
    + '</div>';
}

function _pbOpenBail(ref) {
  // Relais vers le wizard Bail EXISTANT (deux wizards distincts, zéro couplage légal).
  openBail(ref);   // #ov-bail préselectionné sur le logement `ref` (index.html:18085)
}

function _pbFinish() {
  const ref = null; _pbClose();
  if (typeof go === 'function') go('biens');   // ou la page liste des biens ; confirmer l'id de page
}
```

- [ ] **Step 2: Verify (browser)**

From a tree with ≥1 logement « à louer », go to step 3 → summary counts match the tree → « Créer le bail » opens `#ov-bail` on that logement (`goBailStep(1)` visible) → closing the bail wizard returns to the app; « Terminer » closes the coquille and navigates to Biens.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(fil-rouge): étape Bien prêt — récap + relais openBail"
```

---

## Task 10: Entry points (Biens « + », Accueil CTA, onboarding)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Wire the Biens « + » button**

Locate the current « + » / « Nouveau logement » action on the Biens page (`Grep 'openNewLog(' index.html` and `Grep 'Nouveau' index.html` around the Biens page header). Change its `onclick` to `openParcoursBien({})`. Keep the direct `openNewLog()` reachable from a fiche (do not remove it — the parcours is the guided path, not the only path).

- [ ] **Step 2: Wire the Accueil CTA**

In the onboarding/empty-state renderer (`_renderDashOnboarding` ~10543, or `_dashGoImpayes` neighbourhood), add/point a primary CTA « Ajouter un bien » → `openParcoursBien({})`.

- [ ] **Step 3: Verify (browser)**

Click the Biens « + » → coquille opens at step 1. On a fresh DB (no demo), the Accueil « Ajouter mon premier bien » → coquille opens.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(fil-rouge): points d'entrée Biens + / Accueil CTA"
```

---

## Task 11: Responsive (3 formats) + full-flow verification

**Files:**
- Modify: `index.html` (CSS tweaks only if needed)

- [ ] **Step 1: Verify PC / tablette / téléphone**

Use `preview_resize` presets desktop / tablet / mobile:
- Rail readable; on mobile labels hide (`.pb-step .lbl{display:none}`), cards stack (`.pb-start` 1 col).
- Child modals (`#ov-ent`/`#ov-imm`/`#ov-log`/`#ov-bail`) open on top and remain usable at 375px.

- [ ] **Step 2: Full happy path, real records**

Drive the entire flow via preview (manual path + acte path), asserting with `preview_eval` that `DB.entites`, `ent.immeubles`, `DB.logements` hold the created objects and that the completeness pills match `logementCompleteness`.

- [ ] **Step 3: Guard/regression check**

With the coquille never opened, create bailleur/immeuble/logement normally → confirm identical behaviour (hooks inert). Run full `npx vitest run` — only the 3 known-unrelated pre-existing failures (bank-import + legal-2044) may remain; `parcours-bien-model` tests PASS.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(fil-rouge): responsive 3 formats + verif flux complet"
```

---

## Task 12: Version bump + gates + code-reviewer audit

**Files:**
- Modify: `index.html` (version strings), `sw.js` (`CACHE_VER`)

- [ ] **Step 1: Bump version**

Increment the version in `index.html` `<title>`, footer `<em>`, `IMMOTRACK_VERSION`, and the `Récap` string, plus `CACHE_VER` in `sw.js` (memory `feedback_versioning`). Use the next free number above prod v15.456 (coordinate with `.index-queue` if other sessions touch `index.html` — memory `feedback_index_commit_coordination`).

- [ ] **Step 2: Run all gates**

```bash
node scripts/check-inline-js.mjs
npx vitest run
```
Expected: inline JS OK; vitest green except the 3 known-unrelated failures.

- [ ] **Step 3: MANDATORY code-reviewer audit**

Dispatch `superpowers:code-reviewer` on the diff (this is a transverse change touching creation + a legal-adjacent relais — memory `feedback_audits_par_agents` makes this non-negotiable). Focus the reviewer on: (a) the guarded hooks not altering existing save behaviour, (b) no second deletion path (tombstone integrity), (c) the bail relais only *launching* `openBail` with no coupling to the legal zone, (d) `l.entity`/`l.imm` linking consistency, (e) no demo auto-injection introduced.

- [ ] **Step 4: Address findings, re-audit if needed, then commit**

```bash
git add index.html sw.js
git commit -m "feat(fil-rouge): bump vX.Y + audit code-reviewer PASSANT"
```

- [ ] **Step 5: Update BACKLOG + spec status (real-time pilotage)**

Mark the subject delivered in `BACKLOG.md` with version + commit, and flip the spec `Statut` to « livré » (memory `feedback_pilotage_realtime`).

---

## Self-Review (done at plan-writing time)

**Spec coverage:** acte phase 1 (Task 8) ✓ · multi-immeuble/logement + « + » (Task 6/7) ✓ · suppression symétrique ✕ (Task 7) ✓ · « comment on complète » = fiche à onglets + pastille (Task 2/6/7) ✓ · Identité obligatoire (Task 1, enforced by reusing `saveParamLog`'s own required-field validation — the gate is the real form's `*`, and `canCreateLogement` mirrors it for pill logic) ✓ · relais bail (Task 9) ✓ · entry points (Task 10) ✓ · responsive (Task 11) ✓ · DRY reuse (Tasks 7–9, no form recopied) ✓.

**Open items the executor MUST resolve against live code (not placeholders — verification duties):**
1. Exact saved-object variable names at the tail of `saveEnt`/`saveImm`/`saveParamLog` (Task 7 Step 3).
2. Whether immeuble/logement deletion must go through an existing tombstone path (Task 7 Step 2 NOTE).
3. The acte flow's exact persist point + entité object to pass to `_pbAfterActe` (Task 8 Step 2–3).
4. The Biens-page « + » current handler and the Accueil onboarding CTA host (Task 10).
5. Design-token names (`--sur`, `--sur2`, `--sur3`, `--bor2`) — confirm and fall back to literals if absent (Task 5).

**Type consistency:** `ParcoursBienModel` surface used identically across tasks (`buildParcoursTree`, `parcoursSummary`, `logementCompleteness`, `canCreateLogement`). Tree node shape (`{bailleur, immeubles:[{id,nom,adr,synthetic?,completeness,logements:[{...,completeness}]}]}`) consistent between Task 3 (producer) and Task 6/9 (consumers).
