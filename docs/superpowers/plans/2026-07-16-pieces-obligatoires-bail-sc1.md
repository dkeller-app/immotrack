# Pièces obligatoires du bail — SC1 (moteur de complétude) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Détecter et signaler, par bail, les pièces-fichiers obligatoires manquantes (DDT + règlement copro), sans bloquer la signature.

**Architecture:** Un module PUR `bail-required-docs.js` résout l'état de chaque pièce (`ok`/`miss`/`verify`/`na`) en croisant (a) l'applicabilité tri-état fournie par le catalogue diagnostics existant d'`index.html` et (b) les fichiers `DB.documents` tagués `requirementKeys[]`. Une fine couche d'`index.html` construit les entrées du moteur (réutilise `_estDiagApplicable`), affiche la checklist (variante C validée par mockup) et pose un bandeau non bloquant aux entrées de signature. La persistance réutilise le pipeline de pièces jointes existant ; seul le tag `requirement_keys` est nouveau (mapper + colonne Supabase).

**Tech Stack:** Vanilla JS ES module + mirror `window.*` (via `tools/sync-helpers-global-mirrors.mjs`), Vitest, Supabase (store-mapping/store-sync), monolithe `index.html`.

---

## Préambule d'exécution (règles gravées — lire avant de commencer)

- **Worktree depuis `origin/main`** : ce clone local est en retard sur `origin/main`. Créer un worktree neuf depuis `origin/main` (skill `using-git-worktrees`) et implémenter là. Ne jamais pousser `main` local.
- **index.html sérialisé** : une ouvrière ne pousse pas `index.html` sur `main` ; s'inscrire dans `.index-queue/QUEUE.md` (protocole `docs/INDEX-COMMIT-PROTOCOL.md`). Les tâches module/tests/migration (Tasks 1–4) sont indépendantes d'`index.html`.
- **index.html doit rester CRLF** (mémoire : le tooling le reflippe LF → casse la parité data-defaults). Vérifier les fins de ligne avant commit.
- **Sandbox-first** : toute modif UI passe d'abord par `index-test.html`, puis `index.html` après OK explicite user.
- **Audit obligatoire** : `superpowers:code-reviewer` sur le module + les hooks index.html AVANT « prêt à tester » (Task 8).
- **Mockup = spec visuelle** : `mockups/PIECES-OBLIGATOIRES-BAIL/index.html` (variante C). L'UI livrée doit s'y conformer.

---

## File Structure

- **Create** `__tests__/helpers/bail-required-docs.js` — module PUR, source de vérité (ES module). Une responsabilité : résoudre l'état des pièces obligatoires.
- **Create** `__tests__/helpers/bail-required-docs.test.js` — tests Vitest du module.
- **Generated** `js/helpers/bail-required-docs.global.js` — mirror `window.BailRequiredDocs` (via l'outil, NE PAS éditer à la main).
- **Modify** `js/core/store-mapping.js:54-61` — ajouter `requirement_keys` au mapper `documents()`.
- **Modify** `__tests__/helpers/store-mapping.test.js` — couvrir `requirement_keys`.
- **Create** `supabase/migrations/0033_documents_requirement_keys.sql` — colonne `requirement_keys jsonb`.
- **Modify** `index.html` — (a) adaptateur `_bailRequiredDocsFor(ref)`, (b) panneau checklist, (c) modale Joindre multi-couverture, (d) bandeau signature non bloquant, (e) `<script src>` du mirror.

---

## Task 1 : Module pur `bail-required-docs.js` + tests

**Files:**
- Create: `__tests__/helpers/bail-required-docs.js`
- Test: `__tests__/helpers/bail-required-docs.test.js`

Interface : `computeRequiredDocs({ diagApplicability, imm, log, documents }) → RequiredPiece[]`
- `diagApplicability` : `{ [key]: true | false | null }` — tri-état fourni par le caller (index.html via `_estDiagApplicable`). Le module n'itère QUE les clés présentes (le gating par type de bail est fait par le caller : garage/parking → pas de clés DDT).
- `imm` : `{ nbLots }` — copropriété inférée si `Number(nbLots) > 1`.
- `log` : `{ ref, conventionneAnah?, permisDeLouer? }`.
- `documents` : entrées `DB.documents` (chacune avec `requirementKeys?: string[]`, `_deleted?`).

`RequiredPiece = { key, label, legal, level, kind, state, why, files }`
- `state` : `'ok' | 'miss' | 'verify' | 'na'`
- Diagnostics : `false→na`, `null→verify`, `true→` (fichier tagué `key` présent ? `ok` : `miss`).
- `copro` : applicable si `imm.nbLots > 1` ; `anah`/`permis` : applicable si flag `true` (défaut absent → `na`).

- [ ] **Step 1 : Écrire le test qui échoue**

```js
// __tests__/helpers/bail-required-docs.test.js
import { describe, it, expect } from 'vitest'
import { computeRequiredDocs, PIECES_META } from './bail-required-docs.js'

const doc = (keys) => ({ id: 1, name: 'f.pdf', requirementKeys: keys })

describe('computeRequiredDocs — résolution d’état (pur)', () => {
  it('diagnostic applicable + fichier tagué → ok', () => {
    const r = computeRequiredDocs({
      diagApplicability: { dpe: true },
      imm: {}, log: { ref: 'F-1' }, documents: [doc(['dpe'])],
    })
    const dpe = r.find(p => p.key === 'dpe')
    expect(dpe.state).toBe('ok')
    expect(dpe.files.map(f => f.id)).toEqual([1])
  })

  it('diagnostic applicable sans fichier → miss', () => {
    const r = computeRequiredDocs({ diagApplicability: { gaz: true }, imm: {}, log: {}, documents: [] })
    expect(r.find(p => p.key === 'gaz').state).toBe('miss')
  })

  it('applicabilité null (champ décisif absent) → verify', () => {
    const r = computeRequiredDocs({ diagApplicability: { gaz: null }, imm: {}, log: {}, documents: [] })
    expect(r.find(p => p.key === 'gaz').state).toBe('verify')
  })

  it('applicabilité false → na', () => {
    const r = computeRequiredDocs({ diagApplicability: { crep: false }, imm: {}, log: {}, documents: [] })
    expect(r.find(p => p.key === 'crep').state).toBe('na')
  })

  it('un seul fichier à requirementKeys multiples satisfait plusieurs pièces', () => {
    const r = computeRequiredDocs({
      diagApplicability: { dpe: true, amiante: true, elec: true },
      imm: {}, log: {}, documents: [doc(['dpe', 'amiante', 'elec'])],
    })
    expect(r.filter(p => p.state === 'ok').map(p => p.key).sort()).toEqual(['amiante', 'dpe', 'elec'])
  })

  it('copropriété (nbLots>1) → règlement copro requis ; sinon na', () => {
    const yes = computeRequiredDocs({ diagApplicability: {}, imm: { nbLots: 8 }, log: {}, documents: [] })
    expect(yes.find(p => p.key === 'copro').state).toBe('miss')
    const no = computeRequiredDocs({ diagApplicability: {}, imm: { nbLots: 1 }, log: {}, documents: [] })
    expect(no.find(p => p.key === 'copro').state).toBe('na')
  })

  it('documents supprimés (_deleted) ne satisfont pas', () => {
    const r = computeRequiredDocs({
      diagApplicability: { dpe: true }, imm: {}, log: {},
      documents: [{ id: 9, requirementKeys: ['dpe'], _deleted: true }],
    })
    expect(r.find(p => p.key === 'dpe').state).toBe('miss')
  })

  it('chaque pièce porte label/legal/level depuis PIECES_META', () => {
    const r = computeRequiredDocs({ diagApplicability: { dpe: true }, imm: {}, log: {}, documents: [] })
    const dpe = r.find(p => p.key === 'dpe')
    expect(dpe.label).toBe(PIECES_META.dpe.label)
    expect(dpe.level).toBe('logement')
    expect(PIECES_META.copro.level).toBe('immeuble')
  })
})

describe('completenessCount — comptage (pur)', () => {
  it('ne compte que les pièces applicables (na exclus)', async () => {
    const { completenessCount } = await import('./bail-required-docs.js')
    const pieces = computeRequiredDocs({
      diagApplicability: { dpe: true, crep: false, gaz: true }, imm: {}, log: {},
      documents: [{ id: 1, requirementKeys: ['dpe'] }],
    })
    expect(completenessCount(pieces)).toEqual({ ok: 1, total: 2 }) // dpe ok, gaz miss ; crep na exclu
  })
})
```

- [ ] **Step 2 : Lancer le test — doit échouer**

Run: `npx vitest run __tests__/helpers/bail-required-docs.test.js`
Expected: FAIL — "Failed to resolve import './bail-required-docs.js'".

- [ ] **Step 3 : Écrire l'implémentation minimale**

```js
// __tests__/helpers/bail-required-docs.js
/**
 * Module bail-required-docs — moteur PUR de complétude des pièces obligatoires du bail (SC1).
 *
 * Ne ré-encode PAS les seuils légaux des diagnostics : l'applicabilité tri-état
 * (true/false/null) est fournie par le caller (index.html : `_estDiagApplicable`,
 * qui renvoie déjà null quand un champ décisif — année construction/installation —
 * manque). Le module traduit cette applicabilité en état de pièce et matche les
 * fichiers tagués `requirementKeys[]`. Les pièces non-diagnostic (règlement copro,
 * Anah, permis de louer) sont décidées ici depuis imm/log.
 *
 * Complétude = FICHIER réel (ou non applicable). Décision validée 2026-07-16.
 */

export const PIECES_META = {
  // Dossier de Diagnostic Technique (loi 89-462 art. 3-3) — niveau logement.
  dpe:     { label: 'DPE — Performance énergétique',      legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Toujours obligatoire',        negWhy: 'Non requis' },
  crep:    { label: 'Constat plomb (CREP)',               legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Construit avant 1949',       negWhy: 'Construit après 1949' },
  amiante: { label: 'État amiante',                       legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Construit avant 1997',       negWhy: 'Construit après 1997' },
  gaz:     { label: 'État installation gaz',              legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Installation > 15 ans',      negWhy: 'Installation ≤ 15 ans' },
  elec:    { label: 'État installation électrique',       legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Installation > 15 ans',      negWhy: 'Installation ≤ 15 ans' },
  erp:     { label: 'État des risques (ERP)',             legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Commune en zone à risque',   negWhy: 'Hors zone à risque' },
  bruit:   { label: 'Nuisances sonores aériennes',        legal: 'Art. 3-3 loi 89-462', level: 'logement', kind: 'diagnostic', posWhy: 'Zone d’exposition au bruit', negWhy: 'Hors zone PEB' },
  termites:{ label: 'État parasitaire (termites)',        legal: 'Art. L133-6',          level: 'logement', kind: 'diagnostic', posWhy: 'Zone à termites',           negWhy: 'Hors zone termites' },
  merule:  { label: 'Information mérule',                 legal: 'Art. L133-7',          level: 'logement', kind: 'diagnostic', posWhy: 'Zone à mérule',             negWhy: 'Hors zone mérule' },
  // Non-diagnostic.
  copro:   { label: 'Extrait règlement de copropriété',  legal: 'Loi 89-462',           level: 'immeuble', kind: 'file',       posWhy: 'Immeuble en copropriété',   negWhy: 'Hors copropriété' },
  anah:    { label: 'Convention Anah',                   legal: 'Convention Anah',      level: 'logement', kind: 'file',       posWhy: 'Logement conventionné',     negWhy: 'Non conventionné' },
  permis:  { label: 'Autorisation / permis de louer',   legal: 'Art. L634-1 CCH',      level: 'logement', kind: 'file',       posWhy: 'Zone permis de louer',      negWhy: 'Hors zone permis de louer' },
}

function filesFor(key, documents) {
  return (documents || []).filter(d =>
    d && !d._deleted && Array.isArray(d.requirementKeys) && d.requirementKeys.includes(key))
}

function pieceFrom(key, applicable, documents) {
  const meta = PIECES_META[key]
  const base = { key, label: meta.label, legal: meta.legal, level: meta.level, kind: meta.kind, files: [] }
  if (applicable === false) return { ...base, state: 'na', why: meta.negWhy }
  if (applicable === null || applicable === undefined) return { ...base, state: 'verify', why: 'À vérifier — champ manquant' }
  const files = filesFor(key, documents)
  return { ...base, state: files.length ? 'ok' : 'miss', why: meta.posWhy, files }
}

export function computeRequiredDocs({ diagApplicability = {}, imm = {}, log = {}, documents = [] } = {}) {
  const out = []
  // Diagnostics : uniquement les clés fournies par le caller (gating type de bail en amont).
  for (const key of Object.keys(diagApplicability)) {
    if (!PIECES_META[key]) continue
    out.push(pieceFrom(key, diagApplicability[key], documents))
  }
  // Non-diagnostic.
  const isCopro = Number(imm && imm.nbLots) > 1
  out.push(pieceFrom('copro', isCopro ? true : false, documents))
  out.push(pieceFrom('anah', log && log.conventionneAnah === true ? true : false, documents))
  out.push(pieceFrom('permis', log && log.permisDeLouer === true ? true : false, documents))
  return out
}

export function completenessCount(pieces) {
  const applicable = (pieces || []).filter(p => p.state !== 'na')
  return { ok: applicable.filter(p => p.state === 'ok').length, total: applicable.length }
}
```

- [ ] **Step 4 : Lancer le test — doit passer**

Run: `npx vitest run __tests__/helpers/bail-required-docs.test.js`
Expected: PASS (tous verts).

- [ ] **Step 5 : Commit**

```bash
git add __tests__/helpers/bail-required-docs.js __tests__/helpers/bail-required-docs.test.js
git commit -m "SC1 : moteur pur bail-required-docs (etat pieces + matching fichiers)"
```

---

## Task 2 : Générer le mirror global + inclure dans index.html

**Files:**
- Generated: `js/helpers/bail-required-docs.global.js`
- Modify: `index.html` (balise `<script src>` près des autres helpers, vers la ligne 3816)

- [ ] **Step 1 : Générer le mirror**

Run: `node tools/sync-helpers-global-mirrors.mjs`
Expected: crée/maj `js/helpers/bail-required-docs.global.js` exposant `window.BailRequiredDocs` (`computeRequiredDocs`, `completenessCount`, `PIECES_META`).

- [ ] **Step 2 : Vérifier l'export global**

Run: `node -e "require('./js/helpers/bail-required-docs.global.js'); console.log(typeof globalThis.BailRequiredDocs.computeRequiredDocs)"`
Expected: `function`

- [ ] **Step 3 : Inclure le script dans index.html**

Ajouter après la ligne existante `<script src="js/helpers/georisques-erp-detector.global.js"></script>` (≈ ligne 3813) :

```html
<script src="js/helpers/bail-required-docs.global.js"></script>
```

- [ ] **Step 4 : Vérifier fins de ligne CRLF conservées sur index.html**

Run: `file index.html` (ou vérifier via l'éditeur). Expected: CRLF inchangé.

- [ ] **Step 5 : Commit**

```bash
git add js/helpers/bail-required-docs.global.js index.html
git commit -m "SC1 : mirror global BailRequiredDocs + include index.html"
```

---

## Task 3 : Persistance cloud du tag — mapper `documents()`

**Files:**
- Modify: `js/core/store-mapping.js:54-61`
- Test: `__tests__/helpers/store-mapping.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `__tests__/helpers/store-mapping.test.js` (dans le `describe` principal) :

```js
it('documents : requirementKeys → requirement_keys (jsonb objet, pas string)', () => {
  const r = mapToRow('documents', { id: 900, name: 'ddt.pdf', parentType: 'logement', parentRef: 'F-1', logRef: 'F-1', requirementKeys: ['dpe', 'amiante'] }, ctx())
  expect(r.requirement_keys).toEqual(['dpe', 'amiante'])
})

it('documents : requirementKeys absent → [] (jamais null)', () => {
  const r = mapToRow('documents', { id: 901, name: 'x.pdf', parentType: 'logement', parentRef: 'F-1' }, ctx())
  expect(r.requirement_keys).toEqual([])
})
```

- [ ] **Step 2 : Lancer le test — doit échouer**

Run: `npx vitest run __tests__/helpers/store-mapping.test.js -t requirementKeys`
Expected: FAIL — `r.requirement_keys` is `undefined`.

- [ ] **Step 3 : Modifier le mapper**

Dans `js/core/store-mapping.js`, fonction `documents(o, ctx)`, ajouter la colonne dans l'objet retourné (juste avant `...base(o, ctx)`). `jb(...)` est le helper existant qui préserve l'objet pour jsonb :

```js
    return { id: ctx.detUuid('document', String(o.id)), legacy_id: String(o.id ?? ''), name: o.name ?? null, mime: o.mime ?? null, size: num(o.size), idb_key: o.idbKey ?? null, drive_file_id: o.driveFileId ?? null, parent_type: o.parentType ?? null, parent_id: pid, requirement_keys: jb(Array.isArray(o.requirementKeys) ? o.requirementKeys : []), ...base(o, ctx) }
```

- [ ] **Step 4 : Lancer les tests — doivent passer**

Run: `npx vitest run __tests__/helpers/store-mapping.test.js`
Expected: PASS (nouveaux + existants).

- [ ] **Step 5 : Commit**

```bash
git add js/core/store-mapping.js __tests__/helpers/store-mapping.test.js
git commit -m "SC1 : documents.requirement_keys dans le mapper (sync cloud du tag)"
```

---

## Task 4 : Migration Supabase — colonne `requirement_keys`

**Files:**
- Create: `supabase/migrations/0033_documents_requirement_keys.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- 0033_documents_requirement_keys.sql
-- SC1 Pièces obligatoires du bail : tag reliant un fichier aux pièces obligatoires
-- qu'il satisfait (un dossier de diagnostics couvre souvent DPE+plomb+amiante+gaz+élec).
alter table public.documents
  add column if not exists requirement_keys jsonb not null default '[]'::jsonb;

comment on column public.documents.requirement_keys is
  'Clés des pièces obligatoires du bail satisfaites par ce fichier (ex: ["dpe","amiante"]). Voir bail-required-docs.';
```

- [ ] **Step 2 : Vérifier la syntaxe SQL (dry parse)**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/0033_documents_requirement_keys.sql','utf8'); if(!/add column if not exists requirement_keys/.test(s)) throw new Error('KO'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3 : Vérifier qu'elle ne casse pas la suite de schéma existante**

Run: `npx vitest run supabase/tests/p0b-schema.test.mjs` (si la suite est jouable hors DB ; sinon noter « à appliquer sur staging »).
Expected: PASS ou, à défaut, migration appliquée manuellement sur l'instance de dev avant Task 8.

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/0033_documents_requirement_keys.sql
git commit -m "SC1 : migration 0033 documents.requirement_keys (jsonb)"
```

---

## Task 5 : Adaptateur + panneau checklist dans index.html (sandbox-first)

**Files:**
- Modify: `index-test.html` d'abord, puis `index.html` après OK user.

L'implémentation vit d'abord dans `index-test.html` (règle sandbox-first). Vérification par navigateur (pas de test unitaire DOM sur le monolithe).

- [ ] **Step 1 : Écrire l'adaptateur `_bailRequiredDocsFor(ref)`**

À placer près des fonctions diagnostics (après `_estDiagApplicable`, ≈ ligne 34526). Il construit les entrées du moteur en réutilisant l'applicabilité existante et en gérant le gating par type de bail.

```js
// SC1 — construit la liste des pièces obligatoires pour le bail d'un logement (ref = log.ref).
// Réutilise _estDiagApplicable (tri-état true/false/null) ; gate le DDT selon le type de bail.
const _DDT_KEYS_SC1 = ['dpe','crep','amiante','gaz','elec','erp','bruit','termites','merule'];
const _HABITATION_BAIL_TYPES = ['vide','meuble','meuble-etudiant','mobilite']; // pas garage/parking
function _bailRequiredDocsFor(ref) {
  const log = (DB.logements || []).find(l => l && l.ref === ref && !l._deleted);
  if (!log) return [];
  const bail = (DB.baux || {})[ref] || {};
  const imm = log.imm ? (DB.entites || []).flatMap(e => e.immeubles || []).find(i => i && i.nom === log.imm) : null;
  const bailType = String(bail.typeBail || 'vide');
  const isHabitation = _HABITATION_BAIL_TYPES.includes(bailType);
  const diagApplicability = {};
  if (isHabitation) {
    for (const k of _DDT_KEYS_SC1) diagApplicability[k] = _estDiagApplicable(k, log);
  } else {
    diagApplicability.dpe = _estDiagApplicable('dpe', log); // parking/garage : DPE seul si pertinent
  }
  const documents = (DB.documents || []).filter(d => d && !d._deleted &&
    ((d.parentType === 'logement' && (d.parentRef === ref || d.logRef === ref)) ||
     (d.parentType === 'immeuble' && imm && d.parentRef === imm.nom)));
  return window.BailRequiredDocs.computeRequiredDocs({ diagApplicability, imm: imm || {}, log, documents });
}
```

> NOTE : vérifier le vrai nom du champ type de bail (`bail.typeBail` vs autre) via `grep -n "typeBail\|type_bail\|typeContrat" index.html` et ajuster `bailType`/`_HABITATION_BAIL_TYPES` aux identifiants réels avant de coder.

- [ ] **Step 2 : Écrire le rendu `_renderRequiredDocsPanel(ref)`** (variante C du mockup)

Fonction qui produit le HTML du panneau (anneau `completenessCount`, groupes « À traiter » / « Jointes », `<details>` des `na`, pastilles de critère, actions Joindre/Vérifier/Voir). Reproduire le balisage et les classes du mockup `mockups/PIECES-OBLIGATOIRES-BAIL/index.html` (section `render()`), en réutilisant les styles/design-system de l'app. Monter le panneau dans la fiche logement, section bail (repérer le conteneur de la fiche 360 du logement via `grep -n "fiche.*logement\|renderLog.*Fiche\|log-fiche" index.html`).

- [ ] **Step 3 : Vérifier au navigateur**

Charger `index-test.html` via le preview, ouvrir un logement avec un bail, vérifier : anneau N/M correct, pièces `na` repliées, gaz/élec en « à vérifier » si année d'installation vide, pastilles de critère justes. Utiliser `read_page` + `read_console_messages` (0 erreur).

- [ ] **Step 4 : Commit (sandbox)**

```bash
git add index-test.html
git commit -m "SC1 : adaptateur + panneau checklist pieces obligatoires (sandbox)"
```

- [ ] **Step 5 : Porter sur index.html après OK user** (via `.index-queue`, CRLF préservé), puis commit `SC1 : panneau pieces obligatoires (prod)`.

---

## Task 6 : Modale Joindre avec multi-couverture (tag `requirementKeys`)

**Files:**
- Modify: `index-test.html` puis `index.html`.

- [ ] **Step 1 : Écrire la modale Joindre**

Reproduire la modale du mockup (drop-zone + cases « Ce document couvre : … » pré-cochées pour les diagnostics DDT + bouton « Joindre le dossier complet »). Le champ fichier réutilise le handler existant `_handleAttachmentUpload` [index.html:35169] pour le stockage (IndexedDB + Drive), avec `parentType:'logement'` (ou `'immeuble'` pour copro).

- [ ] **Step 2 : Étiqueter le fichier après upload**

À l'issue de l'upload, écrire `requirementKeys` sur l'entrée `DB.documents` créée, depuis les cases cochées, puis `saveDB()` :

```js
// doc = entrée DB.documents retournée par _attachmentSaveForEntity
doc.requirementKeys = Array.from(new Set(checkedKeys)); // ex: ['dpe','amiante','elec']
doc._modifiedAt = Date.now();
saveDB();
```

- [ ] **Step 3 : Vérifier au navigateur**

Joindre un « dossier complet » cochant DPE+amiante+élec → les 3 lignes passent `ok` avec la même source de fichier ; l'anneau se met à jour. Recharger la page → l'état persiste (IndexedDB). Vérifier `DB.documents` en console : `requirementKeys` présent.

- [ ] **Step 4 : Commit (sandbox puis prod comme Task 5)**

```bash
git add index-test.html
git commit -m "SC1 : modale Joindre multi-couverture (requirementKeys)"
```

---

## Task 7 : Bandeau signature non bloquant

**Files:**
- Modify: `index-test.html` puis `index.html`.

Points d'entrée : présentiel `previewBailData` [index.html:19343] et distance `_confirmRemoteSignSend` [index.html:6837].

- [ ] **Step 1 : Écrire le helper `_signatureMissingBanner(ref)`**

```js
// Retourne {miss:[labels], verify:[labels]} ou null si rien à signaler.
function _signaturePendingPieces(ref) {
  const pieces = _bailRequiredDocsFor(ref);
  const miss = pieces.filter(p => p.state === 'miss').map(p => p.label);
  const verify = pieces.filter(p => p.state === 'verify').map(p => p.label);
  return (miss.length || verify.length) ? { miss, verify } : null;
}
```

- [ ] **Step 2 : Brancher le bandeau (non bloquant) aux 2 entrées**

Avant de lancer le flux de signature, si `_signaturePendingPieces(ref)` non nul, afficher un bandeau (style du mockup `.sigbar`) listant les pièces `miss`/`verify` avec deux actions : « Compléter » (ouvre la checklist Task 5) et « Signer quand même » (poursuit le flux existant SANS blocage). Ne modifier en rien le chemin de signature quand l'utilisateur choisit « Signer quand même ».

- [ ] **Step 3 : Vérifier au navigateur**

Sur un bail avec pièces manquantes : cliquer « Signer le bail » → bandeau visible, « Signer quand même » poursuit normalement, « Compléter » ouvre la checklist. Sur un bail complet : aucun bandeau. Tester présentiel ET distance (`openRemoteSignModal`).

- [ ] **Step 4 : Commit (sandbox puis prod)**

```bash
git add index-test.html
git commit -m "SC1 : bandeau signature non bloquant (presentiel + distance)"
```

---

## Task 8 : Audit, smoke, versioning, backlog

**Files:**
- Modify: `index.html` (bump version title + footer), `BACKLOG.md`, mémoire pilotage.

- [ ] **Step 1 : Audit code-reviewer**

Dispatch `superpowers:code-reviewer` sur : le module `bail-required-docs.js`, le mapper modifié, et les hooks index.html (adaptateur, panneau, modale, bandeau). Corriger les findings AVANT de dire « prêt à tester ».

- [ ] **Step 2 : Gate complet des tests**

Run: `npx vitest run`
Expected: 2160+/2160+ verts (aucune régression).

- [ ] **Step 3 : Smoke navigateur bout-en-bout**

Sur `index.html` déployé (github.io) : logement réel en copro → checklist correcte, joindre un dossier multi-diagnostics, vérifier persistance sur 2ᵉ appareil (sync cloud `requirement_keys`), bandeau à la signature. Confirmer 0 erreur console.

- [ ] **Step 4 : Bump version + BACKLOG + mémoire**

Incrémenter `v15.xxx` dans `index.html` (title + footer). Mettre à jour `BACKLOG.md` (statut SC1 livré + version + commit `Pilotage : ...`). Mettre à jour la mémoire pilotage. Noter SC2 (envoi des pièces à la signature) comme chantier suivant.

- [ ] **Step 5 : Commit final**

```bash
git add -A
git commit -m "Pilotage : SC1 Pieces obligatoires du bail LIVRE v15.xxx — moteur + checklist + bandeau signature"
```

---

## Self-Review (couverture spec)

- **Décision 1 (type-de-bail-aware)** → Task 5 Step 1 (`_HABITATION_BAIL_TYPES`, gating DDT).
- **Décision 2 (avertir sans bloquer)** → Task 7 (bandeau non bloquant, « Signer quand même » ne touche pas le flux).
- **Décision 3 (complétude = fichier)** → Task 1 (state `ok` seulement si fichier tagué) + `completenessCount`.
- **Décision 4 (applicabilité champs existants + verify)** → Task 1 (`null→verify`) + Task 5 (`_estDiagApplicable`).
- **Décision 5 (1 PDF → N pièces)** → Task 1 (`filesFor` par `requirementKeys.includes`) + Task 6 (tagging multi-couverture).
- **Décision 6 (meublé n'ajoute rien)** → Task 5 (aucune pièce inventaire ; DDT identique habitation).
- **Composant 2 (persistance tag)** → Tasks 3 + 4 (mapper + migration + tests).
- **Composant 3 (checklist variante C)** → Task 5.
- **Composant 4 (bandeau signature)** → Task 7.
- **Stockage logement/immeuble** → Task 5 Step 1 (filtre documents par niveau) + Task 6 (parentType).

Types cohérents : `state ∈ {ok,miss,verify,na}`, `computeRequiredDocs`/`completenessCount`/`PIECES_META`/`_bailRequiredDocsFor`/`_signaturePendingPieces` nommés identiquement partout.
