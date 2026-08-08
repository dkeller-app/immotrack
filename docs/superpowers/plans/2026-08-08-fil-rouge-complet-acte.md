# Fil rouge COMPLET (acte → rapprochement → complétion 100 % → baux) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Souder l'import d'acte au fil rouge : rapprochement immeuble (nouveau), création directe depuis l'écran vérif (fini le récap), transition vers un fil de complétion accordéon (tâches + %) jusqu'à tous les baux, avec pause/reprise persistée.

**Architecture:** Logique pure dans `__tests__/helpers/*` (TDD, mirrors `js/helpers/*.global.js` regénérés) ; câblage mince dans `index.html` (fonctions `_acte*`/`_fr*` existantes étendues, écrans rendus dans `#ov-fr`). Aucun formulaire recopié — tous les boutons ouvrent les écrans existants.

**Tech Stack:** Vanilla JS inline (index.html v15.494), modules purs ESM testés Vitest, mirrors globals générés par `tools/sync-helpers-global-mirrors.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-08-fil-rouge-complet-acte-design.md` · **Contrat visuel:** `mockups/fil-rouge-complet/index.html`

⚠️ Règles transverses (chaque task) : `index.html` reste **CRLF** ; ne JAMAIS éditer les `*.global.js` à la main (regénérer puis normaliser les lignes vides : `sed -i 's/^[ \t]\+$//' js/helpers/<fichier>.global.js` puis vérifier `file js/helpers/*.global.js` reste sans BOM) ; les numéros de ligne cités = v15.494 (`b26240e`) — re-localiser par grep avant chaque édition.

---

### Task 0: Worktree depuis origin/main

**Files:** aucun (setup)

- [ ] **Step 1: Créer le worktree**

```bash
cd C:/Users/Did_K/Desktop/Immo
git fetch origin
git worktree add ../Immo-wt-filrouge-complet -b feat/fil-rouge-complet origin/main
cd ../Immo-wt-filrouge-complet
npm ci 2>/dev/null || npm install
```

- [ ] **Step 2: Vérifier l'état de départ**

Run: `git log -1 --oneline` → doit être `origin/main` (v15.494 `b26240e` ou plus récent — si plus récent, re-vérifier au grep chaque ancre citée ici).
Run: `npx vitest run` → suite verte (≈2168 tests ; 1 échec CRLF pré-existant toléré s'il est documenté dans BACKLOG).

- [ ] **Step 3: Serveur de test**

Ajouter (ou réutiliser) une entrée `.claude/launch.json` `wt-filrouge-complet` → `npx http-server C:/Users/Did_K/Desktop/Immo-wt-filrouge-complet -p 8812 -c-1 --silent`. Toutes les vérifs « vrai clic » se font sur `http://127.0.0.1:8812/index.html`.

---

### Task 1: Module pur `acte-rapprochement` (match immeuble par adresse)

**Files:**
- Create: `__tests__/helpers/acte-rapprochement.js`
- Create: `__tests__/helpers/acte-rapprochement.test.js`
- Modify: `tools/sync-helpers-global-mirrors.mjs` (registre du mirror)
- Generated: `js/helpers/acte-rapprochement.global.js`

- [ ] **Step 1: Écrire les tests qui échouent**

```js
// __tests__/helpers/acte-rapprochement.test.js
import { describe, it, expect } from 'vitest';
import { canonAdresse, matchImmeuble } from './acte-rapprochement.js';

const ENT = { nom: 'SCI DK PATRIMOINE', immeubles: [
  { id: 'i1', nom: '16 r. des Tilleuls — Mulhouse', adr: '16 r. des Tilleuls', codePostal: '68100', ville: 'Mulhouse' },
  { id: 'i2', nom: '14-16 rue des Tilleuls', adr: '14-16 rue des Tilleuls', codePostal: '68100', ville: 'Mulhouse' },
  { id: 'i3', nom: '8 avenue Foch', adr: '8 av. Foch', codePostal: '68100', ville: 'Mulhouse' },
] };

describe('canonAdresse', () => {
  it('normalise casse, accents, abréviations de voie et espaces', () => {
    expect(canonAdresse('16 R.  des Tilleuls')).toEqual({ num: '16', voie: 'rue des tilleuls' });
    expect(canonAdresse('16 rue des Tilleuls')).toEqual({ num: '16', voie: 'rue des tilleuls' });
    expect(canonAdresse('8 Av. Foch')).toEqual({ num: '8', voie: 'avenue foch' });
    expect(canonAdresse('12 Bd de la Marne')).toEqual({ num: '12', voie: 'boulevard de la marne' });
  });
  it('gère plage de numéros et absence de numéro', () => {
    expect(canonAdresse('14-16 rue des Tilleuls')).toEqual({ num: '14-16', voie: 'rue des tilleuls' });
    expect(canonAdresse('rue des Tilleuls')).toEqual({ num: '', voie: 'rue des tilleuls' });
  });
});

describe('matchImmeuble', () => {
  it('identique : même n° + voie + ville après canon (abréviations comprises)', () => {
    const r = matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' });
    expect(r[0]).toMatchObject({ imm: ENT.immeubles[0], idx: 0, strength: 'identique' });
  });
  it('proche : même voie + ville, numéro différent ou plage', () => {
    const r = matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' });
    expect(r.some(m => m.imm.id === 'i2' && m.strength === 'proche')).toBe(true);
  });
  it('tri fort→faible, autres voies exclues', () => {
    const r = matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' });
    expect(r.map(m => m.strength)).toEqual(['identique', 'proche']);
    expect(r.some(m => m.imm.id === 'i3')).toBe(false);
  });
  it('ville différente ⇒ aucun match ; entité vide/nulle ⇒ []', () => {
    expect(matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: 'Colmar' })).toEqual([]);
    expect(matchImmeuble(null, { adr: 'x', ville: 'y' })).toEqual([]);
    expect(matchImmeuble({ immeubles: [] }, { adr: '16 rue des Tilleuls', ville: 'Mulhouse' })).toEqual([]);
  });
  it("la ville peut arriver collée au CP (champ vérif « 68100 Mulhouse »)", () => {
    const r = matchImmeuble(ENT, { adr: '16 rue des Tilleuls', ville: '68100 Mulhouse' });
    expect(r[0].strength).toBe('identique');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run __tests__/helpers/acte-rapprochement.test.js`
Expected: FAIL (« Cannot find module './acte-rapprochement.js' »)

- [ ] **Step 3: Implémenter**

```js
// __tests__/helpers/acte-rapprochement.js
// Rapprochement immeuble pour l'import d'acte : match par adresse normalisée,
// DANS une entité donnée (les liens app sont par NOM → rattacher = pointer un
// immeuble de CETTE entité). Jamais de décision automatique : on renvoie des
// candidats triés, l'UI fait choisir.
const VOIE_ABBR = [
  [/\br\.?\b/g, 'rue'], [/\bav\.?\b/g, 'avenue'], [/\bbd\.?\b/g, 'boulevard'],
  [/\bpl\.?\b/g, 'place'], [/\bimp\.?\b/g, 'impasse'], [/\bch\.?\b/g, 'chemin'],
  [/\bsq\.?\b/g, 'square'], [/\ball\.?\b/g, 'allee'], [/\bfg\b/g, 'faubourg'],
];

function strip(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[–—]/g, '-').replace(/[.,;]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** '16 R. des Tilleuls' → {num:'16', voie:'rue des tilleuls'} */
export function canonAdresse(adr) {
  let s = strip(adr);
  for (const [re, full] of VOIE_ABBR) s = s.replace(re, full);
  s = s.replace(/\s+/g, ' ').trim();
  const m = s.match(/^(\d+(?:\s*-\s*\d+)?(?:\s?(?:bis|ter|quater))?)\s+(.*)$/);
  if (m) return { num: m[1].replace(/\s*-\s*/, '-'), voie: m[2].trim() };
  return { num: '', voie: s };
}

function canonVille(v) {
  // tolère « 68100 Mulhouse » (champ ville de l'écran vérif) : on retire un CP en tête
  return strip(v).replace(/^\d{5}\s*/, '');
}

/**
 * @param {object|null} entite  entité effective (dupEntity choisi) — {immeubles:[]}
 * @param {{adr:string, ville:string}} cible  adresse extraite/éditée de l'acte
 * @returns {{imm:object, idx:number, strength:'identique'|'proche'}[]} fort→faible
 */
export function matchImmeuble(entite, cible) {
  if (!entite || !Array.isArray(entite.immeubles) || !entite.immeubles.length) return [];
  const c = canonAdresse(cible && cible.adr);
  const cv = canonVille(cible && cible.ville);
  if (!c.voie || !cv) return [];
  const out = [];
  entite.immeubles.forEach((imm, idx) => {
    if (imm && imm._deleted) return;
    const ia = canonAdresse(imm.adr || imm.nom);
    const iv = canonVille(imm.ville);
    if (!ia.voie || ia.voie !== c.voie || iv !== cv) return;
    if (ia.num && c.num && ia.num === c.num) out.push({ imm, idx, strength: 'identique' });
    else out.push({ imm, idx, strength: 'proche' });
  });
  return out.sort((a, b) => (a.strength === 'identique' ? 0 : 1) - (b.strength === 'identique' ? 0 : 1));
}
```

- [ ] **Step 4: Vérifier que ça passe**

Run: `npx vitest run __tests__/helpers/acte-rapprochement.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Générer le mirror + brancher le script**

1. Ouvrir `tools/sync-helpers-global-mirrors.mjs`, ajouter au registre (même forme que `parcours-bien-model`) : source `__tests__/helpers/acte-rapprochement.js` → global `window.ActeRapprochement` → `js/helpers/acte-rapprochement.global.js`.
2. `node tools/sync-helpers-global-mirrors.mjs` puis normaliser : `sed -i 's/^[ \t]\+$//' js/helpers/acte-rapprochement.global.js`.
3. Dans `index.html`, à côté des `<script src="js/helpers/parcours-bien-model.global.js">` (~l. 3841) ajouter : `<script src="js/helpers/adresse-parser.global.js"></script>` s'il n'y est pas déjà et `<script src="js/helpers/acte-rapprochement.global.js"></script>`.
4. Vérifier dans le navigateur (8812) : console → `window.ActeRapprochement.matchImmeuble` est une fonction.

- [ ] **Step 6: Gates + commit**

Run: `npx vitest run && node scripts/check-inline-js.mjs`
```bash
git add __tests__/helpers/acte-rapprochement.* tools/sync-helpers-global-mirrors.mjs js/helpers/acte-rapprochement.global.js index.html
git commit -m "Fil rouge complet 1/8 : module pur acte-rapprochement (match immeuble par adresse canon, 8 tests)"
```

---

### Task 2: Conducteur — étapes `transition` et `completion`

**Files:**
- Modify: `__tests__/helpers/fil-rouge-conductor.js` (STEPS + advance)
- Modify: `__tests__/helpers/fil-rouge-conductor.test.js`
- Generated: `js/helpers/fil-rouge-conductor.global.js`

- [ ] **Step 1: Tests qui échouent**

Ajouter au fichier de test existant :

```js
describe('étapes transition/completion (fil complet acte)', () => {
  it('STEPS contient transition et completion', () => {
    expect(STEPS).toContain('transition');
    expect(STEPS).toContain('completion');
  });
  it("advance('transition','continue') → completion ; ('transition','later') → null (fermeture)", () => {
    expect(advance('transition', 'continue')).toBe('completion');
    expect(advance('transition', 'later')).toBe(null);
  });
  it("advance('completion','close') → null", () => {
    expect(advance('completion', 'close')).toBe(null);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run __tests__/helpers/fil-rouge-conductor.test.js` → FAIL.

- [ ] **Step 3: Implémenter** — dans `fil-rouge-conductor.js` : `STEPS = ['start','ent','imm','log','next','done','bail','transition','completion']` ; dans `advance`, ajouter :

```js
if (step === 'transition') return event === 'continue' ? 'completion' : null;
if (step === 'completion') return null;
```

(Ne PAS toucher les transitions existantes — les tests existants les verrouillent.)

- [ ] **Step 4: Run** la suite conducteur → PASS (19 tests existants + 3).

- [ ] **Step 5: Mirror + gates + commit**

```bash
node tools/sync-helpers-global-mirrors.mjs && sed -i 's/^[ \t]\+$//' js/helpers/fil-rouge-conductor.global.js
npx vitest run && node scripts/check-inline-js.mjs
git add __tests__/helpers/fil-rouge-conductor.* js/helpers/fil-rouge-conductor.global.js
git commit -m "Fil rouge complet 2/8 : conducteur — étapes transition/completion"
```

---

### Task 3: Module pur — `completionModel` (tâches + %)

**Files:**
- Modify: `__tests__/helpers/parcours-bien-model.js` (nouvel export)
- Modify: `__tests__/helpers/parcours-bien-model.test.js`
- Generated: `js/helpers/parcours-bien-model.global.js`

- [ ] **Step 1: Tests qui échouent** (ajouter au test existant)

```js
import { completionModel } from './parcours-bien-model.js';

const ENT2 = { id: 'e1', nom: 'SCI DK', gerants: [], gerant: '', emailEnvoi: '', iban: '' };
const IMM2 = { id: 'i1', nom: '16 rue des Tilleuls', adr: '16 rue des Tilleuls', ville: 'Mulhouse', annee: 0, valeurEstimee: 0, equipementsCommuns: { customs: [] } };
const LOGS2 = [
  { ref: 'A', imm: '16 rue des Tilleuls', type: 'T2', surf: 34, hc: 650, numFiscal: '', dpe: null },          // occupé bail repris
  { ref: 'B', imm: '16 rue des Tilleuls', type: 'T1', surf: 28, hc: 500, numFiscal: '', dpe: null },          // vacant louable
  { ref: 'C', imm: '16 rue des Tilleuls', type: '',   surf: 0,  hc: 0,   numFiscal: '', dpe: null, vacantAssume: true }, // vacant assumé
];
const BAUX2 = { A: { ref: 'A', source: { import: 'acte' }, reprisVerifie: false } };

describe('completionModel', () => {
  const m = completionModel({ entite: ENT2, immeuble: IMM2, logements: LOGS2, bauxActifs: BAUX2 });
  it('nœuds = bailleur, immeuble, puis chaque logement (ordre du fil)', () => {
    expect(m.nodes.map(n => n.kind)).toEqual(['ent', 'imm', 'log', 'log', 'log']);
  });
  it('bailleur : identité done (nom posé), gérant/coordonnées/IBAN todo', () => {
    const t = m.nodes[0].tasks;
    expect(t.find(x => x.id === 'identite').status).toBe('done');
    expect(t.find(x => x.id === 'gerant').status).toBe('todo');
    expect(t.find(x => x.id === 'iban').status).toBe('todo');
  });
  it("immeuble : adresse done, année/valeur/équipements todo", () => {
    const t = m.nodes[1].tasks;
    expect(t.find(x => x.id === 'adresse').status).toBe('done');
    expect(t.find(x => x.id === 'annee').status).toBe('todo');
  });
  it('log A (bail repris non vérifié) : tâche bail = warn verifier-repris', () => {
    const t = m.nodes[2].tasks.find(x => x.id === 'bail');
    expect(t.status).toBe('warn');
    expect(t.action).toBe('verifier-repris');
  });
  it('log B (vacant louable) : tâche bail = todo creer-bail ; numFiscal = warn', () => {
    const t = m.nodes[3].tasks.find(x => x.id === 'bail');
    expect(t.status).toBe('todo');
    expect(t.action).toBe('creer-bail');
    expect(m.nodes[3].tasks.find(x => x.id === 'numFiscal').status).toBe('warn');
  });
  it('log C (vacantAssume) : tâche bail done, mais caractéristiques todo (type/surface vides)', () => {
    expect(m.nodes[4].tasks.find(x => x.id === 'bail').status).toBe('done');
    expect(m.nodes[4].tasks.find(x => x.id === 'caracteristiques').status).toBe('todo');
  });
  it('pct global cohérent (done/total, arrondi) et badges', () => {
    const done = m.nodes.flatMap(n => n.tasks).filter(t => t.status === 'done').length;
    const tot = m.nodes.flatMap(n => n.tasks).length;
    expect(m.pct).toBe(Math.round(done / tot * 100));
    expect(m.nodes[2].badge).toBe('loue');
    expect(m.nodes[3].badge).toBe('vac');
  });
  it('bail repris vérifié + tout rempli ⇒ nœud full', () => {
    const full = completionModel({
      entite: { ...ENT2, gerant: 'D. Keller', emailEnvoi: 'x@y.z', iban: 'FR76...' },
      immeuble: { ...IMM2, annee: 1971, valeurEstimee: 285000, equipementsCommuns: { customs: [], ascenseur: true } },
      logements: [{ ...LOGS2[0], numFiscal: '123', dpe: { classe: 'D' } }],
      bauxActifs: { A: { ref: 'A', source: { import: 'acte' }, reprisVerifie: true } },
    });
    expect(full.pct).toBe(100);
    expect(full.nodes.every(n => n.full)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** → FAIL (`completionModel` non exporté).

- [ ] **Step 3: Implémenter** (dans `parcours-bien-model.js`, à côté de `buildParcoursTree`) :

```js
/**
 * Modèle du fil de complétion (écran accordéon). PUR : tout arrive en données.
 * @param {object} p {entite, immeuble, logements[], bauxActifs:{ref:bail}}
 * @returns {{nodes:[{kind,id,name,sub,badge,full,tasks:[{id,label,detail,status,action}]}], pct:number}}
 */
export function completionModel({ entite, immeuble, logements, bauxActifs }) {
  const ent = entite || {}, imm = immeuble || {}, logs = logements || [], baux = bauxActifs || {};
  const T = (id, label, done, opts) => ({ id, label, detail: (opts && opts.detail) || '', status: done ? 'done' : ((opts && opts.warn) ? 'warn' : 'todo'), action: (opts && opts.action) || null });
  const nodes = [];

  nodes.push({ kind: 'ent', id: ent.id || null, name: ent.nom || 'Bailleur', sub: 'Bailleur', badge: null, tasks: [
    T('identite', 'Identité', !!(ent.nom || '').trim(), { detail: 'nom, forme, SIREN' }),
    T('gerant', 'Gérant / représentant légal', !!(((ent.gerants || []).length) || (ent.gerant || '').trim()), { detail: 'requis sur les baux' }),
    T('coordonnees', 'Coordonnées', !!(ent.emailEnvoi || '').trim(), { detail: 'email d’envoi' }),
    T('iban', 'IBAN', !!(ent.iban || '').trim(), { detail: 'quittances & appels de loyer' }),
  ] });

  const eq = imm.equipementsCommuns || {};
  const hasEq = Object.keys(eq).some(k => k !== 'customs' && eq[k]) || ((eq.customs || []).length > 0);
  nodes.push({ kind: 'imm', id: imm.id || null, name: imm.nom || 'Immeuble', sub: [imm.ville].filter(Boolean).join(' '), badge: null, tasks: [
    T('adresse', 'Adresse', !!((imm.adr || '').trim() && (imm.ville || '').trim())),
    T('valeur', 'Prix / valeur estimée', _num(imm.valeurEstimee) > 0),
    T('annee', 'Année de construction', _num(imm.annee) > 0, { detail: 'absente des actes — viendra du DPE' }),
    T('equipements', 'Équipements communs', hasEq),
  ] });

  logs.forEach(l => {
    const bail = baux[l.ref] || null;
    const repris = !!(bail && bail.source && bail.source.import === 'acte');
    let bailTask;
    if (bail && repris && !bail.reprisVerifie) bailTask = T('bail', 'Vérifier le bail repris', false, { warn: true, action: 'verifier-repris', detail: 'état civil, loyer, clauses' });
    else if (bail) bailTask = T('bail', 'Bail en place', true);
    else if (l.vacantAssume) bailTask = T('bail', 'Vacant assumé', true, { detail: 'bail à créer plus tard si besoin' });
    else bailTask = T('bail', 'Créer le bail', false, { action: 'creer-bail', detail: 'wizard bail existant' });
    nodes.push({ kind: 'log', id: l.ref, name: l.ref, sub: [l.type, l.surf ? (l.surf + ' m²') : ''].filter(Boolean).join(' · '),
      badge: bail ? 'loue' : 'vac',
      tasks: [
        T('caracteristiques', 'Caractéristiques', canCreateLogement({ ref: l.ref, type: l.type, surface: _num(l.surf) })),
        T('numFiscal', 'N° fiscal du logement', !!(l.numFiscal || '').toString().trim(), { warn: true, detail: 'obligatoire depuis 2024' }),
        T('dpe', 'DPE', !!(l.dpe && (l.dpe.classe || l.dpe.lettre || l.dpe.note))),
        bailTask,
      ] });
  });

  nodes.forEach(n => { n.full = n.tasks.every(t => t.status === 'done'); });
  const all = nodes.flatMap(n => n.tasks);
  const pct = all.length ? Math.round(all.filter(t => t.status === 'done').length / all.length * 100) : 100;
  return { nodes, pct };
}
```

Note : `T(..., { warn: true })` ⇒ warn seulement quand PAS done (le ternaire l'assure). `_num` et `canCreateLogement` existent déjà dans ce module.

- [ ] **Step 4: Run** `npx vitest run __tests__/helpers/parcours-bien-model.test.js` → PASS (26 existants + 8).

- [ ] **Step 5: Mirror + gates + commit**

```bash
node tools/sync-helpers-global-mirrors.mjs && sed -i 's/^[ \t]\+$//' js/helpers/parcours-bien-model.global.js
npx vitest run && node scripts/check-inline-js.mjs
git add __tests__/helpers/parcours-bien-model.* js/helpers/parcours-bien-model.global.js
git commit -m "Fil rouge complet 3/8 : completionModel (taches par fiche + % global, 8 tests)"
```

---

### Task 4: Rapprochement immeuble dans l'écran vérif (bandeau + picker inline)

**Files:**
- Modify: `index.html` — `_acteRenderVerif` (41259), `_acteCollectVerif` (41554), état `_acteDraft`

- [ ] **Step 1: Wrapper inline + recalcul**

Près de `_acteFindDupEntity` (41176), ajouter :

```js
/** Candidats immeuble existants pour l'adresse de l'acte, DANS l'entité effective (dupEntity). */
function _acteFindDupImm() {
  const d = _acteDraft; if (!d || !d.dupEntity || !window.ActeRapprochement) return [];
  const im = d.immeuble || {};
  return window.ActeRapprochement.matchImmeuble(d.dupEntity, { adr: im.adr || '', ville: [im.cp, im.ville].filter(Boolean).join(' ') });
}
```

État : `_acteDraft.dupImmeuble = null | { immId }` (choix user). Initialiser à `null` au reset du wizard (`openActeImport`, 41072) et à chaque relance d'extraction (41164, à côté de `dupEntity`).

- [ ] **Step 2: Bandeau + picker inline dans `_acteRenderVerif`**

Dans `_acteRenderVerif`, juste APRÈS la section Immeuble existante (repérer la fin du bloc `acte-sec` Immeuble), insérer le rendu :

```js
  // ── Rapprochement immeuble (NOUVEAU — miroir du bandeau bailleur, picker INLINE : pas de 2e overlay)
  const dupImms = _acteFindDupImm();
  if (dupImms.length) {
    const chosen = d.dupImmeuble && d.dupImmeuble.immId;
    html += `<div class="acte-dup" id="acte-dup-imm">
      <div class="acte-dup-h">🏛 Un immeuble existant ressemble à cette adresse</div>
      <p>Ajouter les lots de l'acte <b>dans un immeuble existant</b> de ${escHtml(d.dupEntity.nom)}, ou créer un immeuble séparé ? Rien n'est automatique — c'est toi qui tranches.</p>`;
    dupImms.forEach(c => {
      html += `<label class="acte-pick"><input type="radio" name="acte-imm-pick" value="${escHtml(String(c.imm.id))}" ${chosen === c.imm.id ? 'checked' : ''} onchange="_actePickImm(this.value)">
        <b>${escHtml(c.imm.nom)}</b> <span class="why">${c.strength === 'identique' ? 'adresse identique' : 'adresse proche'}</span></label>`;
    });
    html += `<label class="acte-pick"><input type="radio" name="acte-imm-pick" value="" ${!chosen ? 'checked' : ''} onchange="_actePickImm('')">
      ➕ Créer un nouvel immeuble « ${escHtml((d.immeuble && d.immeuble.adr) || '')} »</label>
      <div class="why">Si tu rattaches : les lots s'ajoutent aux logements existants (réfs uniques garanties). Rien n'est fusionné ni écrasé.</div>
    </div>`;
  }
```

Handler + style :

```js
function _actePickImm(immId) { if (_acteDraft) _acteDraft.dupImmeuble = immId ? { immId } : null; }
```

CSS (bloc des styles `acte-*`) : `.acte-pick{display:flex;align-items:center;gap:8px;padding:6px 2px;font-size:12.5px;cursor:pointer}` (réutiliser les couleurs du `.acte-dup` existant).

⚠️ Le user peut ÉDITER l'adresse dans l'écran vérif : le handler `change` des champs immeuble (chercher où `_acteFieldBlock('acte-f-*')` collecte — `_acteCollectVerif`) doit invalider le choix (`_acteDraft.dupImmeuble = null`) et re-render le bandeau si l'adresse change.

- [ ] **Step 3: Vérif vrai clic**

Sur 8812, avec un compte de test contenant déjà `SCI …` + un immeuble : importer un acte (ou piloter `_acteDraft` de test PUIS re-cliquer les vrais boutons de l'écran vérif) dont l'adresse matche → bandeau visible, radios cliquables, choix conservé, édition d'adresse → bandeau recalculé. Console 0 erreur.

- [ ] **Step 4: Gates + commit**

```bash
node scripts/check-inline-js.mjs && npx vitest run
git add index.html
git commit -m "Fil rouge complet 4/8 : rapprochement immeuble — bandeau + picker inline dans la verif acte"
```

---

### Task 5: `_acteApply` — brancher le rattachement immeuble

**Files:**
- Modify: `index.html` — `_acteApply` §2 (41696-41724)

- [ ] **Step 1: Remplacer la création inconditionnelle**

Le bloc actuel commence par `// ── 2. IMMEUBLE — toujours créé, rattaché à l'entité.` et construit `const im = { id: nid(), ... }`. Le remplacer par :

```js
    // ── 2. IMMEUBLE — rattaché au choix user (dupImmeuble) sinon créé.
    const im0 = d.immeuble || {};
    const immNom = ((im0.adr || '').trim() || (im0.ville || '').trim() || 'Immeuble importé');
    let im = null, immCreated = false;
    if (d.dupImmeuble && d.dupImmeuble.immId) {
      im = (ent.immeubles || []).find(x => x && x.id === d.dupImmeuble.immId && !x._deleted) || null;
    }
    if (im) {
      // Rattachement : rien n'est écrasé — on complète nbLots + trace l'import dans les notes.
      const _prevNbLots = im.nbLots, _prevNotes = im.notes, _prevMod = im._modifiedAt;
      im.nbLots = (Number(im.nbLots) || 0) + ((d.logements || []).length || 0);
      im.notes = [(im.notes || '').trim(), "Lots ajoutés depuis l'acte « " + (d.fileName || 'acte.pdf') + " » le " + new Date().toLocaleDateString('fr-FR') + '.'].filter(Boolean).join('\n');
      if (typeof _stamp === 'function') _stamp(im);
      _rollback.push(() => { im.nbLots = _prevNbLots; im.notes = _prevNotes; im._modifiedAt = _prevMod; });
      if (typeof _auditLog === 'function') _auditLog('update', 'immeuble', im.id, ent.nom + '/' + im.nom + ' (lots acte)');
    } else {
      // …bloc de création EXISTANT inchangé (notesParts, const im = {...}, _auditLog create,
      //  _createdIds.add, ent.immeubles.push, rollback splice) — le coller ici tel quel,
      //  en remplaçant `const im =` par `im =` et en ajoutant `immCreated = true;` à la fin.
    }
```

⚠️ Tout ce qui suit (§3 logements, baux repris, annexes, succès) utilise déjà `im.nom` / `im` — vérifier au grep dans la fonction qu'aucune ligne ne suppose `immCreated` (le `_created` du succès affiche `immNom` : utiliser `im.nom`). Le bump `_stamp(ent)` existant (post-push) ne doit tourner que si `immCreated` (sinon l'entité n'a pas changé structurellement — le rattachement stamp déjà l'immeuble).

- [ ] **Step 2: Vérif vrai clic (le scénario du mockup)**

Compte de test : entité existante + immeuble « 16 r. des Tilleuls » avec 2 logements. Importer l'acte de test (16 rue des Tilleuls) → choisir « rattacher » → créer → vérifier dans l'app : PAS de nouvel immeuble, les nouveaux lots apparaissent sous l'immeuble existant, réfs uniques, baux repris posés, `nbLots` incrémenté. Refaire en choisissant « créer un nouvel immeuble » → comportement d'avant intact. Annuler un import (quota/rollback non testable ici — vérifier au moins que 2 imports successifs ne dupliquent rien).

- [ ] **Step 3: Gates + commit**

```bash
node scripts/check-inline-js.mjs && npx vitest run
git add index.html
git commit -m "Fil rouge complet 5/8 : _acteApply rattache les lots a l'immeuble existant choisi (jamais auto)"
```

---

### Task 6: Fusion récap → vérif (création directe)

**Files:**
- Modify: `index.html` — `_acteSetStep` (41083), `_acteNextStep`/`_actePrevStep` (41613-41622), `_acteRenderVerif` (synthèse), markup stepper `#acte-stepper` + étape `recap` de `#acte-body`, `_acteRenderRecap` (41560-41611)

- [ ] **Step 1: Stepper 2 jalons + navigation**

- Markup : dans `#acte-stepper`, supprimer le jalon `data-s="recap"` ; renommer le jalon `verif` en « Vérification & création ». Supprimer le bloc `.acte-step[data-step="recap"]` de `#acte-body`.
- `_acteSetStep` : `order = ['depot','verif']` ; `s==='succes'` → `curIdx=2` ; libellés : en `verif`, `next.textContent = '✓ Tout est bon — créer'` et `hint.textContent = "Rien n'est écrit avant ce clic."` ; supprimer les branches `recap`.
- `_acteNextStep` :

```js
function _acteNextStep() {
  if (_acteStep === 'verif') { _acteCollectVerif(); _acteApply(); }
}
```

- `_actePrevStep` : supprimer la branche `recap`.
- Supprimer `_acteRenderRecap` (et son CSS s'il devient orphelin) — grep `_acteRenderRecap|acte-recap` pour ne laisser aucune référence morte.

- [ ] **Step 2: Synthèse en bas de vérif**

À la FIN du html de `_acteRenderVerif` (après les annexes), ajouter la ligne de synthèse (recalculée à chaque render — `_acteRenderVerif` est rappelée après chaque changement structurel) :

```js
  const nbRent = anns.filter(a => (a.mode || 'rattacher') === 'bien').length;   // réutiliser les variables locales déjà calculées pour les annexes
  const nbAtt = anns.filter(a => (a.mode || 'rattacher') === 'rattacher').length;
  const nbRepris = (d.logements || []).filter(l => l.occ && l.occ.on).length;   // adapter au vrai nom du flag occupation dans _acteDraft (grep « occ » dans _acteCollectVerif)
  html += `<div class="acte-synth"><b>À la création :</b>
    <span class="pill">${d.dupEntity ? '🔗 bailleur rattaché' : '✚ 1 bailleur'}</span>
    <span class="pill">${(d.dupImmeuble && d.dupImmeuble.immId) ? '🔗 immeuble existant' : '✚ 1 immeuble'}</span>
    <span class="pill">✚ ${(d.logements || []).length + nbRent} bien(s)</span>
    ${nbRepris ? `<span class="pill">🔑 ${nbRepris} bail(aux) repris</span>` : ''}
    ${nbAtt ? `<span class="pill">🔗 ${nbAtt} annexe(s) rattachée(s)</span>` : ''}</div>`;
```

CSS : `.acte-synth{display:flex;gap:8px;flex-wrap:wrap;align-items:center;border:1px solid var(...);border-radius:10px;padding:9px 12px;margin-top:10px;font-size:12px}` + `.acte-synth .pill{...}` (reprendre les tokens des tags du récap supprimé).

- [ ] **Step 3: Vérif vrai clic** — wizard entier : dépôt → vérif (éditer, toggler, supprimer/ajouter un logement — la synthèse suit) → « ✓ Tout est bon — créer » → création directe (plus d'écran récap). « ‹ Retour » en vérif → dépôt. 0 erreur console.

- [ ] **Step 4: Gates + commit**

```bash
node scripts/check-inline-js.mjs && npx vitest run
git add index.html
git commit -m "Fil rouge complet 6/8 : creation directe depuis la verif (etape recap supprimee, synthese + CTA)"
```

---

### Task 7: Transition + écran complétion accordéon + relais écrans existants

**Files:**
- Modify: `index.html` — `_frAfterActe` (44097), `_frShowFr` (44162), `_frInstallCloseHook` (44019), `_frAfterSave` (44077), nouveaux `_frShowTransition`-helpers `_fr*`

- [ ] **Step 1: `_frAfterActe` → transition**

```js
function _frAfterActe(ent, immName){
  if(!ent) return;
  _frCtx={entId:ent.id,immName:immName||null,bailDone:false,bailRef:null,created:_frActeCreated(ent,immName)};
  _frSetCompletionState(ent.id, immName);            // Task 8 — pose l'état de reprise
  if(_frMode){ closeM('ov-acte'); _frOpenStep('transition'); }
  else { _frOfferContinue('acte'); }
}
```

(La branche hors-fil garde la carte de continuité existante.)

- [ ] **Step 2: Écran `transition` dans `_frShowFr`**

Ajouter une branche (avant le `else if(kind==='next')`) :

```js
  } else if(kind==='transition'){
    const c=_frCtx.created||{}, nbLog=(c.logs||[]).length;
    body.innerHTML='<div class="fr-after"><div class="fr-chk">✓</div><h3>Patrimoine créé — le fil continue</h3>'
      +'<p>'+escHtml(String(nbLog))+' bien(s) posé(s) par l’acte. Le fil rouge t’emmène maintenant compléter chaque fiche à 100 % — bailleur, immeuble, chaque bien, chaque bail.</p><div class="fr-choices">'
      +'<div class="fr-choice log" onclick="_frOpenStep(window.FilRougeConductor.advance(\'transition\',\'continue\'))"><span class="ic">🧭</span><div class="tx"><b>Continuer — compléter à 100 %</b><s>le fil te guide fiche par fiche, dans l’ordre</s></div><span class="chev">›</span></div>'
      +'<div class="fr-choice fin" onclick="_frClose()"><span class="ic">🕊</span><div class="tx"><b>Plus tard — c’est gardé</b><s>tout est enregistré · le fil t’attendra sur la page Biens</s></div><span class="chev">›</span></div>'
      +'</div></div>';
    foot.innerHTML='<span class="fr-grow"></span><span class="fr-hint" style="margin:0">Rien d’obligatoire — tu peux t’arrêter à tout moment.</span>';
```

- [ ] **Step 3: Écran `completion` (accordéon)**

État module-scope : `let _frCompOpen = null;` (index du nœud ouvert manuellement). Helpers + branche :

```js
function _frCompModel(){
  const ent = DB.entites.find(e=>e.id===_frCtx.entId); if(!ent) return null;
  const imm = (ent.immeubles||[]).find(i=>i.nom===_frCtx.immName) || null;
  const logs = (DB.logements||[]).filter(l=>!l._deleted && l.entity===ent.nom && (!imm || l.imm===imm.nom));
  const bauxActifs = {}; logs.forEach(l=>{ const b=_bienActiveBail(l.ref); if(b) bauxActifs[l.ref]=b; });
  return { ent, imm, model: window.ParcoursBienModel.completionModel({entite:ent, immeuble:imm, logements:logs, bauxActifs}) };
}
function _frCompAction(action, ref){
  // chaque action OUVRE L'ÉCRAN EXISTANT ; le retour au fil est géré par le close-hook / _frAfterSave
  if(action==='ent'){ openNewEnt(_frCtx.entId); return; }
  if(action==='imm'){ const ent=DB.entites.find(e=>e.id===_frCtx.entId); const idx=(ent.immeubles||[]).findIndex(i=>i.nom===_frCtx.immName); if(idx>=0) editImm(idx, ent.id); return; }
  if(action==='log'){ openNewLog(ref); return; }
  if(action==='creer-bail'){ _frClose_KEEPSTATE(); openBail(ref); return; }       // voir Step 5
  if(action==='verifier-repris'){ _frClose_KEEPSTATE(); openBail(ref); return; }
  if(action==='vacant-assume'){ const l=DB.logements.find(x=>x.ref===ref); if(l){ l.vacantAssume=true; if(typeof _stamp==='function')_stamp(l); saveDB(); } _frShowFr('completion'); return; }
  if(action==='repris-ok'){ const b=DB.baux[ref]; if(b){ b.reprisVerifie=true; if(typeof _stamp==='function')_stamp(b); saveDB(); } _frShowFr('completion'); return; }
}
```

Branche de rendu (structure = mockup écran 4 ; classes `fr-comp-*` nouvelles, tokens design system) :

```js
  } else if(kind==='completion'){
    const cm=_frCompModel();
    if(!cm){ _frClose(); return; }
    const {model}=cm; const firstInc=model.nodes.findIndex(n=>!n.full);
    const open=(_frCompOpen!=null && _frCompOpen>=0)?_frCompOpen:firstInc;
    if(model.pct===100) _frClearCompletionState();                       // Task 8
    let h='<div class="fr-comp-hero"><div class="top"><span class="big">🧭</span><div><h4>Configuration du patrimoine</h4>'
      +'<div class="sub">'+escHtml(cm.ent.nom)+(cm.imm?(' · '+escHtml(cm.imm.nom)):'')+' — pause quand tu veux : c’est gardé.</div></div>'
      +'<span class="pct">'+model.pct+'%</span></div><div class="bar"><i style="width:'+model.pct+'%"></i></div></div>';
    h+='<div class="fr-comp-wrap"><div class="fr-comp-line"><i style="height:'+model.pct+'%"></i></div>';
    model.nodes.forEach((n,i)=>{
      const isOpen=i===open&&!n.full, here=i===firstInc;
      const badge=n.badge==='loue'?'<span class="fr-comp-badge loue">🔑 Loué</span>':n.badge==='vac'?'<span class="fr-comp-badge vac">🏠 Vacant</span>':'';
      h+='<div class="fr-comp-node"><div class="fr-comp-dot '+(n.full?'done':(here?'here':''))+'">'+(n.full?'✓':(i+1))+'</div>'
        +'<div class="fr-comp-card '+(isOpen?'here':'closed')+'"><div class="h" onclick="_frCompToggle('+i+')">'
        +'<b>'+escHtml(n.name)+'</b><span class="meta">'+escHtml(n.sub||'')+'</span>'
        +'<span class="sp">'+badge+(here&&!n.full?'<span class="fr-comp-here">tu es ici</span>':'')
        +'<span class="fr-comp-gauge '+(n.full?'full':'part')+'">'+n.tasks.filter(t=>t.status==='done').length+'/'+n.tasks.length+'</span><span class="chev">›</span></span></div>';
      if(isOpen){
        h+='<div class="fr-comp-open">';
        n.tasks.forEach(t=>{
          const ico=t.status==='done'?'✓':(t.status==='warn'?'!':'○');
          let act='';
          if(t.status!=='done'&&t.action==='creer-bail') act='<button class="fr-prim sm" onclick="event.stopPropagation();_frCompAction(\'creer-bail\',\''+escHtml(_attr(n.id))+'\')">✍️ Créer le bail</button>'
            +'<button class="fr-ghost sm" onclick="event.stopPropagation();_frCompAction(\'vacant-assume\',\''+escHtml(_attr(n.id))+'\')">Vacant assumé</button>';
          if(t.status!=='done'&&t.action==='verifier-repris') act='<button class="fr-prim sm" onclick="event.stopPropagation();_frCompAction(\'verifier-repris\',\''+escHtml(_attr(n.id))+'\')">📋 Ouvrir le bail</button>'
            +'<button class="fr-ghost sm" onclick="event.stopPropagation();_frCompAction(\'repris-ok\',\''+escHtml(_attr(n.id))+'\')">✓ Vérifié</button>';
          h+='<div class="fr-comp-task"><span class="st '+t.status+'">'+ico+'</span><div class="tx"><b>'+escHtml(t.label)+'</b>'+(t.detail?'<span>'+escHtml(t.detail)+'</span>':'')+'</div><span class="go">'+act+'</span></div>';
        });
        const openAct=n.kind==='ent'?'ent':(n.kind==='imm'?'imm':'log');
        h+='</div><div class="fr-comp-act"><button class="fr-prim sm" onclick="_frCompAction(\''+openAct+'\',\''+escHtml(_attr(n.id||''))+'\')">Compléter la fiche →</button></div>';
      }
      h+='</div></div>';
    });
    h+='<div class="fr-comp-node fr-comp-end"><div class="fr-comp-dot">'+(model.pct===100?'🎉':'🏁')+'</div>'
      +(model.pct===100?'100 % — configuration terminée.':'Quand tout est vert : bailleur, immeuble, biens et baux à 100 %.')+'</div></div>';
    body.innerHTML=h;
    foot.innerHTML='<button class="fr-later" onclick="_frClose()">Plus tard — c’est gardé</button><span class="fr-grow"></span>'
      +(model.pct===100?'<button class="fr-prim" onclick="_frClose()">Terminer — voir mes biens</button>':'');
```

+ `function _frCompToggle(i){ _frCompOpen = (_frCompOpen===i)? -1 : i; _frShowFr('completion'); }` (reset `_frCompOpen=null` à l'entrée en complétion). CSS `fr-comp-*` : reprendre les tokens des classes `fr-*` existantes (bloc CSS du fil, chercher `.fr-choice`) + le langage visuel du mockup (timeline verticale, dots, jauges).

- [ ] **Step 4: Retour au fil après un écran existant**

- `_frAfterSave` (44077) : dans la branche `_frMode`, si `_frStep==='completion'` → NE PAS `advance` ; simplement `_frShowFr('completion')` (recalcul).
- `_frInstallCloseHook` (44019) : le wrapper couvre `ov-ent/ov-imm/ov-log/ov-acte`. Ajouter : si `_frMode && _frStep==='completion'` et la modale fermée ∈ {ov-ent, ov-imm, ov-log} et plus rien d'ouvert → rouvrir `_frShowFr('completion')` au lieu de relâcher `_frMode` (annulation = retour au fil, pas sortie).

- [ ] **Step 5: Relais bail sans empilement**

`openBail` ouvre la grosse modale bail : fermer `#ov-fr` d'abord SANS perdre l'état :

```js
function _frClose_KEEPSTATE(){ closeM('ov-fr'); /* _frMode reste vrai, _frCtx intact */ }
```

Ajouter l'id de la modale bail (grep `openBail` 18499 → `openM('ov-…')` pour trouver l'id exact) à la liste du close-hook avec le même comportement qu'au Step 4 : fermeture (annulation OU save) en `_frStep==='completion'` → rouvrir la complétion. Après création réelle d'un bail, `_bienActiveBail(ref)` devient non-null ⇒ la tâche passe done au recalcul (pas de flag à poser).

- [ ] **Step 6: Vérif vrai clic** — scénario complet sur 8812 : import acte → créer → transition → « Continuer » → accordéon (1 seul nœud ouvert, « tu es ici ») → « Compléter la fiche → » ouvre la fiche bailleur EXISTANTE → save → retour au fil, tâche verte, nœud replié si plein, suivant ouvert → « ✍️ Créer le bail » → wizard bail réel → fermer → retour fil → « ✓ Vérifié » sur un bail repris → % monte. À chaque étape : UN SEUL overlay visible, 0 erreur console.

- [ ] **Step 7: Gates + commit**

```bash
node scripts/check-inline-js.mjs && npx vitest run && node --check sw.js
git add index.html
git commit -m "Fil rouge complet 7/8 : transition post-acte + ecran completion accordeon (ecrans existants relies)"
```

---

### Task 8: Persistance + bandeau de reprise (page Biens)

**Files:**
- Modify: `index.html` — helpers `_frSetCompletionState`/`_frClearCompletionState`/`_frStartCompletion`, `rBiens` (34024)

- [ ] **Step 1: État persisté**

```js
function _frSetCompletionState(entId, immName){ if(!DB.params) DB.params={}; DB.params.frCompletion={entId, immName, dismissed:false}; saveDB(); }
function _frClearCompletionState(){ if(DB.params && DB.params.frCompletion){ delete DB.params.frCompletion; saveDB(); } }
function _frStartCompletion(entId, immName){ _frHideCont(); _frMode=true; _frCompOpen=null; _frCtx={entId, immName:immName||null, bailDone:false, bailRef:null, created:_frResetCreated()}; _frOpenStep('completion'); }
```

(`DB.params` transite déjà par `espace_config` → synchronisé cloud, aucun changement d'allowlist.)

- [ ] **Step 2: Bandeau dans `rBiens`**

En tête du rendu de `rBiens` (34024, avant la liste), si `DB.params.frCompletion && !dismissed` : calculer le % via le même chemin que `_frCompModel` (extraire un helper `_frCompPct(entId, immName)` qui renvoie `null` si entité/immeuble introuvables — dans ce cas purger l'état) ; si `pct < 100` :

```js
  const fc = DB.params && DB.params.frCompletion;
  if (fc && !fc.dismissed) {
    const pct = _frCompPct(fc.entId, fc.immName);
    if (pct == null) { _frClearCompletionState(); }
    else if (pct < 100) {
      h += `<div class="fr-resume"><span class="ic">🧭</span><div class="tx"><b>Fil rouge en cours — ${escHtml(fc.immName || '')}</b>
        <s>${pct}% — il reste des fiches à compléter. Reprends où tu t'étais arrêté.</s>
        <div class="bar"><i style="width:${pct}%"></i></div></div>
        <button class="btn bp sm" onclick="_frStartCompletion('${escHtml(_attr(fc.entId))}','${escHtml(_attr(fc.immName || ''))}')">Reprendre →</button>
        <button class="fr-later" onclick="DB.params.frCompletion.dismissed=true;saveDB();rBiens()">Masquer</button></div>`;
    } else { _frClearCompletionState(); }
  }
```

CSS `.fr-resume` : reprendre le mockup écran 6 (bordure accent, fond halo, mini-barre).

- [ ] **Step 3: Vérif vrai clic** — depuis la transition, « Plus tard » → page Biens montre le bandeau avec le vrai % ; recharger la page (F5) → bandeau toujours là (persisté) ; « Reprendre → » rouvre l'accordéon au premier nœud incomplet ; « Masquer » → disparu, re-F5 → toujours masqué ; terminer tout à 100 % → bandeau ET état purgés.

- [ ] **Step 4: Gates + commit**

```bash
node scripts/check-inline-js.mjs && npx vitest run
git add index.html
git commit -m "Fil rouge complet 8/8 : pause/reprise persistee (DB.params.frCompletion) + bandeau page Biens"
```

---

### Task 9: Vérification finale, audit, bump, intégration

**Files:**
- Modify: `index.html` (version ×3 + Récap DDT), `sw.js` (`CACHE_VER`)

- [ ] **Step 1: Parcours COMPLET au vrai clic, données réalistes** — rejouer le scénario du mockup de bout en bout (acte 3 logements + annexes, 2 baux repris) : porte → acte → rapprochements bailleur ET immeuble → « ✓ Tout est bon — créer » → transition → complétion accordéon → bail créé sur le vacant → « Vacant assumé » sur le parking → pause/reprise (F5 inclus) → 100 % → bandeau purgé. Vérifier aussi : (a) le fil MANUEL v15.494 intact (choix « Saisir à la main » → chaîne complète) ; (b) import acte HORS fil (si un chemin l'ouvre encore) → carte de continuité inchangée ; (c) un seul overlay à tout instant ; (d) 0 erreur console partout.

- [ ] **Step 2: Bump version** — n° libre au-dessus d'`origin/main` du moment : `<title>`, `<em>` footer, `IMMOTRACK_VERSION` (3850), ligne Récap DDT, `CACHE_VER` dans `sw.js`.

- [ ] **Step 3: Gates finales**

```bash
node scripts/check-inline-js.mjs   # 0 erreur
npx vitest run                      # suite verte (+ ~19 nouveaux tests)
node --check sw.js
file index.html                     # vérifier CRLF conservé
```

- [ ] **Step 4: Audit `superpowers:code-reviewer`** — brief explicite : vérifier la MÉCANIQUE **ET la FIDÉLITÉ au mockup** `mockups/fil-rouge-complet/index.html` écran par écran (décisions user : vérif complète éditable, pas d'étape récap, accordéon un nœud ouvert, reprise persistée), plus DRY (aucun formulaire recopié), rollback `_acteApply` avec rattachement, XSS (`escHtml`/`_attr` sur tout rendu). Corriger tout Critique/Important avant de continuer.

- [ ] **Step 5: Commit final + intégration** — s'inscrire dans `.claude/worktrees/../.index-queue/QUEUE.md` si présente ([[feedback_index_commit_coordination]]) ; rebase sur `origin/main` frais (conflits attendus : lignes de version uniquement) ; re-gates ; push via la session maître ; BACKLOG.md mis à jour immédiatement (statut + version + commit `Pilotage : …`).

---

## Self-review (fait à l'écriture)

- Couverture spec : D1→Task 1, D2→Task 4, D3→Task 6, D4→Task 7 (Steps 1-2), D5→Tasks 3+7, D6→Task 8 ; garde-fous §6→Tasks 0/9. ✔
- Types cohérents : `completionModel` renvoie `{nodes, pct}` consommé tel quel par `_frCompModel`/`_frShowFr('completion')` ; `dupImmeuble={immId}` posé Task 4, lu Task 5. ✔
- Points à re-vérifier au build (ancres v15.494 susceptibles d'avoir bougé) : nom exact du flag occupation dans `_acteDraft.logements[i]` (Task 6 synthèse), id de la modale bail (Task 7 Step 5), variables locales annexes dans `_acteRenderVerif` (Task 6). Ces vérifs sont des grep, pas des inventions.
