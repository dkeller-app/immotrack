# Candidature locataire (app-side) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Candidats" pipeline to ImmoTrack — a new `DB.candidats[]` collection, a Candidats tab, a candidate detail/pipeline view with transparent "Confiance" scoring, and one-click conversion of a validated candidate into a pre-filled bail with zero re-typing.

**Architecture:** Pure, testable helpers live in a new ES6 module `js/core/candidature.js` (imported + window-exposed by `js/main.js`, TDD with Vitest). All UI (sidebar item, `#p-candidats` page, fiche, modals) is added **inline** in `index-test.html` first (sandbox), then propagated to `index.html` (prod) only after explicit user OK. The conversion reuses the existing bail wizard (`openBail`/`renderBailLocs`/`renderBailGarants`/`saveBail`); pieces reuse the GED (`_attachmentSaveForEntity`, `parentType:'candidat'`); the new collection is registered in the Drive sync pipeline (`_buildEntityPayload` / merge / cascade).

**Tech Stack:** Vanilla JS (ES6 modules + inline), Vitest (node env, pure-helper tests only), IndexedDB (binary pieces), localStorage (`DB`), Google Drive sync.

---

## Scope of THIS plan vs. the online link

This plan delivers the **app-side** candidature feature, which works **standalone**: the bailleur creates a candidate manually (or one arrives later via the online link), scores/triages them, and converts the validated one into a bail. It has **no dependency on the Cloudflare relay**.

**Explicitly out of scope here** (→ a separate plan, written once the relay *foundation* of `docs/superpowers/plans/2026-06-02-bail-signature-relais.md` has landed): the public `dossier.html` page, the candidature module/routes on the relay, the "Inviter un candidat" link generation, and dossier retrieval at sync. Reason: writing no-placeholder code for relay routes against modules that don't exist yet would be fragile. The data model built here (`DB.candidats[]`, `source:'lien'`) is **forward-compatible** with that link — a dossier arriving from the relay just becomes a `candidat` with `source:'lien'`.

Spec of record: `docs/superpowers/specs/2026-06-02-candidature-locataire-design.md`.

---

## Workflow rules baked into this plan (non-negotiable, from project memory)

1. **Mockup-first** — Phase 1 produces validated mockups (A/B/C × PC/tablette/téléphone × all post-click artifacts) and **hard-gates** on explicit user approval before any UI code. Pure helpers (Phase 2, non-visual) may proceed in parallel.
2. **Sandbox-first** — all UI lands in `index-test.html` first; `index.html` (prod) is touched only in Phase 8 after the user's explicit "OK".
3. **No demo auto-inject** — never call `_loadDemoDataset()` from `initDB()`; do not seed `DB.candidats` with sample data.
4. **Agent audit for sensitive work** — Drive sync changes (Phase 3) and the conversion/document-migration (Phase 6) MUST be reviewed by a `superpowers:code-reviewer` agent before being declared ready to test.
5. **Version bump** — Phase 8 bumps `v15.X` in `index.html` (title + footer) and the commit message.
6. **BACKLOG real-time** — update `BACKLOG.md` + `docs/subjects/LOG-CANDIDATS.md` when the feature lands (Phase 8).

---

## File Structure

| File | Responsibility | Created / Modified |
|---|---|---|
| `js/core/candidature.js` | Pure helpers: scoring, candidat→locataire/garant mapping, candidat factory, doc-migration, RGPD purge. No DOM, no side effects. | **Create** |
| `__tests__/helpers/candidature.test.js` | Vitest unit tests for every helper above. | **Create** |
| `js/main.js` | Import the new helpers and expose them on `window` (so inline `onclick`/render code can call them). | Modify (~lines 36-156) |
| `index-test.html` | All UI + wiring: `initDB` collection, sidebar item, `#p-candidats` page + routing, `rCandidats()`, fiche/modals, conversion, Drive sync registration, RGPD purge call site. | Modify (sandbox) |
| `index.html` | Same edits as `index-test.html`, propagated in Phase 8 after user OK + version bump. | Modify (prod, Phase 8) |
| `mockups/candidature/*.html` | Static validated mockups (Phase 1). | **Create** |
| `BACKLOG.md`, `docs/subjects/LOG-CANDIDATS.md` | Status update on landing. | Modify (Phase 8) |

> **Helper duplication note:** ImmoTrack uses a documented "pattern shadow" — some pure helpers are defined both in `js/core/*` and inline in `index.html` because inline `onclick` can run before the module loads. The candidature helpers are only ever called from render code that runs **after** navigation (i.e. after `js/main.js` has loaded and exposed `window._...`), so we define them **once** in `js/core/candidature.js` and rely on the window-exposed versions. Do **not** duplicate the helper bodies inline.

---

## Phase 1 — Mockups + validation gate (BLOCKING)

> No UI code is written until the user approves these mockups in a real browser. This phase is interactive/visual, not TDD — that is the one justified deviation from the TDD loop (the project treats mockups as browser-validated artifacts).

### Task 1.1: Produce the candidature mockups

**Files:**
- Create: `mockups/candidature/candidats-tab.html` (variants A/B/C of the table)
- Create: `mockups/candidature/fiche-candidat.html`
- Create: `mockups/candidature/post-clic.html` (all post-click artifacts)

- [ ] **Step 1: Build the three mockup files**

Each file MUST:
- Reuse the ImmoTrack design system (copy the CSS variables/tokens and component classes — `.inp`, `.btn`, `.card`, `.tab`, badges — from `index.html`'s `<style>`; do not invent new visual language). Reference: project memory "Constance visuelle + design system".
- Render at **3 widths**: PC (~1280px), tablette (~800px), téléphone (~380px). Use side-by-side frames or a width toggle in the same file.

`candidats-tab.html` — **3 variants (A/B/C)** of the Candidats list, columns: **Nom · Bien · Date début souhaitée · Statut · Revenus déclarés · Garant · Confiance**. Include the **Actifs / Archivés** tabs, the primary **"+ Ajouter un candidat"** button and the secondary **"Inviter un candidat"** button (the latter visually present but noted "lien en ligne — phase suivante"). The Confiance column shows a 0-100 score + a green/orange/red voyant + a "déclaratif" badge.

`fiche-candidat.html` — the candidate detail view: identity block, situation (revenus/employeur/contrat), garant, pieces list, the **statut pipeline** (Reçu → En cours → Validé/Refusé → Converti) with action buttons, the scoring breakdown with its **transparency tooltip**, the **"pièces vérifiées" toggle**, and the **"Créer le bail à partir de ce candidat"** button (shown only when Validé).

`post-clic.html` — every post-click artifact: the **"Ajouter un candidat" modal** (manual form: identity nom+prenom, ddn, lieuNaiss, tél, email, adresse précédente, situation, garant, contrat with **liste + champ libre**), the **"Inviter un candidat" modal** (choose the bien when launched from the tab), the **scoring tooltip** popover, the **"demander un complément" dialog**, the **refus confirmation + courtesy-email** dialog, the **conversion confirmation** dialog, and toasts.

- [ ] **Step 2: Open each mockup in a real browser at all 3 widths**

Run (Windows): `start mockups/candidature/candidats-tab.html` (repeat for the others), or open via the local server if one is used. Verify layout holds at PC/tablette/téléphone with no overflow/clipping. Reference: project memory "Mockup-first … Tester dans vrai navigateur, pas zone preview Claude".

- [ ] **Step 3: Commit the mockups**

```bash
git add mockups/candidature/
git commit -m "Candidature : mockups onglet + fiche + post-clic (A/B/C × 3 formats)"
```

### Task 1.2: User validation gate

- [ ] **Step 1: Present the mockups to the user and request a decision**

Ask the user, for the tab, which variant (A / B / C), and collect any change requests on the fiche, modals, and post-click artifacts.

- [ ] **Step 2: STOP until explicit approval**

Do not start Phase 4+ (UI) until the user explicitly approves. Apply requested changes and re-validate if needed. (Phases 2-3, pure helpers + sync, may proceed in parallel since they are non-visual.)

---

## Phase 2 — Pure helpers (TDD) in `js/core/candidature.js`

> Run tests with `npm run test:run` (once) or `npm test` (watch). Env is node, no DOM. Import pattern: the test imports directly from the module.

### Task 2.1: Scoring — `_calculConfiance`

**Files:**
- Create: `js/core/candidature.js`
- Test: `__tests__/helpers/candidature.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// __tests__/helpers/candidature.test.js
import { describe, it, expect } from 'vitest';
import {
  _calculConfiance, _candidatVersLocataire, _candidatVersGarant,
  _nouveauCandidat, _migrerDocsCandidatVersBail, _purgeCandidatsRefuses
} from '../../js/core/candidature.js';

describe('_calculConfiance', () => {
  it('ratio >= 3 + CDI + garant + pièces complètes + RIB = 100', () => {
    const c = { revenus: 3000, contrat: 'CDI', garant: { nom: 'Papa' }, piecesCompletes: true, ribFourni: true };
    expect(_calculConfiance(c, 1000)).toBe(100);
  });
  it('ratio entre 2.5 et 3 = 20 pts de ratio', () => {
    const c = { revenus: 2700, contrat: 'Autre', garant: null };
    expect(_calculConfiance(c, 1000)).toBe(20);
  });
  it('ratio entre 2 et 2.5 = 10 pts', () => {
    expect(_calculConfiance({ revenus: 2200 }, 1000)).toBe(10);
  });
  it('ratio < 2 = 0 pt de ratio', () => {
    expect(_calculConfiance({ revenus: 1500 }, 1000)).toBe(0);
  });
  it('CDD = 10, CDI = 25', () => {
    expect(_calculConfiance({ contrat: 'CDD' }, 0)).toBe(10);
    expect(_calculConfiance({ contrat: 'CDI' }, 0)).toBe(25);
  });
  it('garant compte seulement si nom non vide', () => {
    expect(_calculConfiance({ garant: { nom: '  ' } }, 0)).toBe(0);
    expect(_calculConfiance({ garant: { nom: 'Tante' } }, 0)).toBe(20);
  });
  it('loyer 0 ou revenus 0 → pas de points de ratio, pas de crash', () => {
    expect(_calculConfiance({ revenus: 0, contrat: 'CDI' }, 1000)).toBe(25);
    expect(_calculConfiance({ revenus: 3000, contrat: 'CDI' }, 0)).toBe(25);
  });
  it('entrée nulle → 0', () => {
    expect(_calculConfiance(null, 1000)).toBe(0);
  });
  it('plafonné à 100', () => {
    const c = { revenus: 99999, contrat: 'CDI', garant: { nom: 'X' }, piecesCompletes: true, ribFourni: true };
    expect(_calculConfiance(c, 1)).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- candidature`
Expected: FAIL — `Failed to resolve import "../../js/core/candidature.js"`.

- [ ] **Step 3: Write the minimal implementation**

```javascript
// js/core/candidature.js
// Pure helpers candidature locataire (LOG-CANDIDATS). Aucun DOM, aucun effet de bord.
// Testés par __tests__/helpers/candidature.test.js. Exposés sur window via js/main.js.

/**
 * Score "Confiance" 0-100, transparent, critères de solvabilité légaux uniquement
 * (jamais discriminatoire). Voir spec §9.
 * @param {object} cand - candidat (revenus, contrat, garant, piecesCompletes, ribFourni)
 * @param {number} loyerHC - loyer hors charges du logement visé (pour le ratio)
 * @returns {number} score entier 0-100
 */
export function _calculConfiance(cand, loyerHC = 0) {
  if (!cand || typeof cand !== 'object') return 0;
  let score = 0;
  const revenus = Number(cand.revenus) || 0;
  const loyer = Number(loyerHC) || 0;
  if (loyer > 0 && revenus > 0) {
    const ratio = revenus / loyer;
    if (ratio >= 3) score += 30;
    else if (ratio >= 2.5) score += 20;
    else if (ratio >= 2) score += 10;
  }
  if (cand.contrat === 'CDI') score += 25;
  else if (cand.contrat === 'CDD') score += 10;
  if (cand.garant && String(cand.garant.nom || '').trim()) score += 20;
  if (cand.piecesCompletes) score += 15;
  if (cand.ribFourni) score += 10;
  return Math.min(100, score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- candidature`
Expected: PASS for the `_calculConfiance` describe block (other imports still unresolved → those describes fail; that is expected until Task 2.2-2.5 add the exports).

- [ ] **Step 5: Commit**

```bash
git add js/core/candidature.js __tests__/helpers/candidature.test.js
git commit -m "Candidature : helper _calculConfiance (scoring transparent) + tests"
```

### Task 2.2: Mapping — `_candidatVersLocataire` and `_candidatVersGarant`

**Files:**
- Modify: `js/core/candidature.js`
- Test: `__tests__/helpers/candidature.test.js`

- [ ] **Step 1: Add the failing tests**

```javascript
describe('_candidatVersLocataire', () => {
  it('fusionne nom + prenom en `nom` complet et passe les autres champs', () => {
    const c = { civilite: 'Mme', nom: 'Durand', prenom: 'Alice', ddn: '1990-05-01',
                lieuNaiss: 'Lyon', tel: '0600000000', email: 'a@b.fr', adressePrecedente: '1 rue X' };
    expect(_candidatVersLocataire(c)).toEqual({
      civilite: 'Mme', nom: 'Durand Alice', ddn: '1990-05-01', lieuNaiss: 'Lyon',
      tel: '0600000000', email: 'a@b.fr', adressePrecedente: '1 rue X'
    });
  });
  it('prenom manquant → nom seul, pas d\'espace en trop', () => {
    expect(_candidatVersLocataire({ nom: 'Durand' }).nom).toBe('Durand');
  });
  it('entrée nulle → objet locataire vide bien formé', () => {
    expect(_candidatVersLocataire(null)).toEqual({
      civilite: '', nom: '', ddn: '', lieuNaiss: '', tel: '', email: '', adressePrecedente: ''
    });
  });
});

describe('_candidatVersGarant', () => {
  it('garant avec nom → objet garant aligné bail {nom, adresse, ddn, lieu}', () => {
    const c = { garant: { nom: 'Papa Durand', adresse: '2 rue Y', ddn: '1960-01-01', lieu: 'Paris' } };
    expect(_candidatVersGarant(c)).toEqual({ nom: 'Papa Durand', adresse: '2 rue Y', ddn: '1960-01-01', lieu: 'Paris' });
  });
  it('pas de garant ou nom vide → null', () => {
    expect(_candidatVersGarant({ garant: null })).toBeNull();
    expect(_candidatVersGarant({ garant: { nom: '  ' } })).toBeNull();
    expect(_candidatVersGarant({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:run -- candidature`
Expected: FAIL — `_candidatVersLocataire is not a function` (export missing).

- [ ] **Step 3: Implement**

```javascript
// Append to js/core/candidature.js

/** Mappe un candidat vers un objet locataire du bail (forme getBailLocs/renderBailLocs). */
export function _candidatVersLocataire(cand) {
  const empty = { civilite: '', nom: '', ddn: '', lieuNaiss: '', tel: '', email: '', adressePrecedente: '' };
  if (!cand || typeof cand !== 'object') return empty;
  const nomComplet = [cand.nom, cand.prenom].map(s => String(s || '').trim()).filter(Boolean).join(' ');
  return {
    civilite: cand.civilite || '',
    nom: nomComplet,
    ddn: cand.ddn || '',
    lieuNaiss: cand.lieuNaiss || '',
    tel: cand.tel || '',
    email: cand.email || '',
    adressePrecedente: cand.adressePrecedente || ''
  };
}

/** Mappe le garant d'un candidat vers la forme garant du bail, ou null si absent. */
export function _candidatVersGarant(cand) {
  const g = cand && cand.garant;
  if (!g || !String(g.nom || '').trim()) return null;
  return { nom: g.nom || '', adresse: g.adresse || '', ddn: g.ddn || '', lieu: g.lieu || '' };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:run -- candidature`
Expected: PASS for `_candidatVersLocataire` and `_candidatVersGarant`.

- [ ] **Step 5: Commit**

```bash
git add js/core/candidature.js __tests__/helpers/candidature.test.js
git commit -m "Candidature : mapping candidat → locataire/garant du bail + tests"
```

### Task 2.3: Factory — `_nouveauCandidat`

**Files:**
- Modify: `js/core/candidature.js`
- Test: `__tests__/helpers/candidature.test.js`

- [ ] **Step 1: Add the failing test**

```javascript
describe('_nouveauCandidat', () => {
  it('applique les valeurs par défaut et un id', () => {
    const c = _nouveauCandidat();
    expect(c.statut).toBe('recu');
    expect(c.source).toBe('manuel');
    expect(c._archived).toBe(false);
    expect(typeof c.id).toBe('string');
    expect(c.id.length).toBeGreaterThan(0);
    expect(c.confianceScore).toBe(0);
    expect(c.garant).toBeNull();
  });
  it('les champs fournis écrasent les défauts', () => {
    const c = _nouveauCandidat({ nom: 'X', logRef: 'F-001', source: 'lien', statut: 'enCours' });
    expect(c.nom).toBe('X');
    expect(c.logRef).toBe('F-001');
    expect(c.source).toBe('lien');
    expect(c.statut).toBe('enCours');
  });
  it('deux appels donnent des id différents', () => {
    expect(_nouveauCandidat().id).not.toBe(_nouveauCandidat().id);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:run -- candidature`
Expected: FAIL — `_nouveauCandidat is not a function`.

- [ ] **Step 3: Implement**

```javascript
// Append to js/core/candidature.js

/** Construit un candidat avec valeurs par défaut. partial écrase les défauts. */
export function _nouveauCandidat(partial = {}) {
  const now = new Date().toISOString();
  const id = partial.id || ('cand_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  return {
    id, ref: partial.ref || id,
    logRef: partial.logRef || '',
    entity: partial.entity || '',
    source: partial.source || 'manuel',
    civilite: partial.civilite || '', nom: partial.nom || '', prenom: partial.prenom || '',
    ddn: partial.ddn || '', lieuNaiss: partial.lieuNaiss || '',
    tel: partial.tel || '', email: partial.email || '',
    adressePrecedente: partial.adressePrecedente || '',
    revenus: Number(partial.revenus) || 0,
    employeur: partial.employeur || '',
    contrat: partial.contrat || '',
    garant: partial.garant || null,
    piecesCompletes: partial.piecesCompletes || false,
    ribFourni: partial.ribFourni || false,
    statut: partial.statut || 'recu',
    confianceScore: Number(partial.confianceScore) || 0,
    piecesVerifiees: partial.piecesVerifiees || false,
    notes: partial.notes || '',
    bailRef: partial.bailRef || '',
    dateCreation: partial.dateCreation || now,
    _modifiedAt: now,
    _archived: partial._archived || false
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:run -- candidature`
Expected: PASS for `_nouveauCandidat`.

- [ ] **Step 5: Commit**

```bash
git add js/core/candidature.js __tests__/helpers/candidature.test.js
git commit -m "Candidature : factory _nouveauCandidat + tests"
```

### Task 2.4: Document migration — `_migrerDocsCandidatVersBail`

**Files:**
- Modify: `js/core/candidature.js`
- Test: `__tests__/helpers/candidature.test.js`

- [ ] **Step 1: Add the failing test**

```javascript
describe('_migrerDocsCandidatVersBail', () => {
  const docs = [
    { id: 1, parentType: 'candidat', parentId: 'cand_A', name: 'cni.pdf', logRef: null },
    { id: 2, parentType: 'candidat', parentId: 'cand_B', name: 'autre.pdf', logRef: null },
    { id: 3, parentType: 'bail', parentRef: 'F-009', name: 'bail.pdf', logRef: 'F-009' }
  ];
  it('re-pointe seulement les docs du candidat ciblé vers le bail', () => {
    const out = _migrerDocsCandidatVersBail(docs, 'cand_A', 'F-001', 'F-001');
    const a = out.find(d => d.id === 1);
    expect(a.parentType).toBe('bail');
    expect(a.parentRef).toBe('F-001');
    expect(a.logRef).toBe('F-001');
    expect(out.find(d => d.id === 2).parentType).toBe('candidat'); // intact
    expect(out.find(d => d.id === 3).parentRef).toBe('F-009');     // intact
  });
  it('comparaison d\'id tolérante au type (string vs number)', () => {
    const d = [{ id: 9, parentType: 'candidat', parentId: 42 }];
    expect(_migrerDocsCandidatVersBail(d, '42', 'F-1', 'F-1')[0].parentType).toBe('bail');
  });
  it('entrée non-array → []', () => {
    expect(_migrerDocsCandidatVersBail(null, 'x', 'y', 'z')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:run -- candidature`
Expected: FAIL — `_migrerDocsCandidatVersBail is not a function`.

- [ ] **Step 3: Implement**

```javascript
// Append to js/core/candidature.js

/**
 * Retourne une nouvelle liste de documents où ceux rattachés au candidat candId
 * sont re-pointés vers le bail (parentType 'bail', parentRef = bailRef, logRef).
 * Les autres documents sont renvoyés inchangés. Pur — l'appelant réaffecte DB.documents.
 */
export function _migrerDocsCandidatVersBail(documents, candId, bailRef, logRef) {
  if (!Array.isArray(documents)) return [];
  const now = new Date().toISOString();
  return documents.map(d => {
    if (d && d.parentType === 'candidat' && String(d.parentId) === String(candId)) {
      return { ...d, parentType: 'bail', parentRef: String(bailRef),
               logRef: logRef != null ? String(logRef) : d.logRef, _modifiedAt: now };
    }
    return d;
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:run -- candidature`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/core/candidature.js __tests__/helpers/candidature.test.js
git commit -m "Candidature : migration documents candidat → bail + tests"
```

### Task 2.5: RGPD purge — `_purgeCandidatsRefuses`

**Files:**
- Modify: `js/core/candidature.js`
- Test: `__tests__/helpers/candidature.test.js`

- [ ] **Step 1: Add the failing test**

```javascript
describe('_purgeCandidatsRefuses', () => {
  const now = Date.parse('2026-06-02T00:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  it('supprime un refusé plus vieux que 30 j, garde un refusé récent', () => {
    const cands = [
      { id: 'old', statut: 'refuse', _modifiedAt: new Date(now - 31 * day).toISOString() },
      { id: 'new', statut: 'refuse', _modifiedAt: new Date(now - 10 * day).toISOString() }
    ];
    const kept = _purgeCandidatsRefuses(cands, now, 30).map(c => c.id);
    expect(kept).toEqual(['new']);
  });
  it('ne touche jamais les non-refusés même très anciens', () => {
    const cands = [{ id: 'v', statut: 'valide', _modifiedAt: new Date(now - 999 * day).toISOString() }];
    expect(_purgeCandidatsRefuses(cands, now, 30)).toHaveLength(1);
  });
  it('entrée non-array → []', () => {
    expect(_purgeCandidatsRefuses(null, now)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:run -- candidature`
Expected: FAIL — `_purgeCandidatsRefuses is not a function`.

- [ ] **Step 3: Implement**

```javascript
// Append to js/core/candidature.js

/**
 * Filtre la liste : retire les candidats 'refuse' dont _modifiedAt dépasse
 * joursRetention (défaut 30, D11). Renvoie les candidats CONSERVÉS. Pur — l'appelant
 * tombstonne en prod les supprimés pour la sync Drive.
 */
export function _purgeCandidatsRefuses(candidats, nowMs, joursRetention = 30) {
  if (!Array.isArray(candidats)) return [];
  const seuil = joursRetention * 24 * 60 * 60 * 1000;
  return candidats.filter(c => {
    if (!c || c.statut !== 'refuse') return true;
    const ts = c._modifiedAt ? Date.parse(c._modifiedAt) : 0;
    return (nowMs - ts) < seuil;
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:run -- candidature`
Expected: PASS — the whole `candidature.test.js` suite is green now.

- [ ] **Step 5: Commit**

```bash
git add js/core/candidature.js __tests__/helpers/candidature.test.js
git commit -m "Candidature : purge RGPD des refusés (30j) + tests"
```

### Task 2.6: Expose helpers via `js/main.js`

**Files:**
- Modify: `js/main.js` (import block ~36-78, window-expose block ~130-156)

- [ ] **Step 1: Add the import**

After the existing `import { ... } from './core/utils.js';` block, add:

```javascript
import {
  _calculConfiance, _candidatVersLocataire, _candidatVersGarant,
  _nouveauCandidat, _migrerDocsCandidatVersBail, _purgeCandidatsRefuses
} from './core/candidature.js';
```

- [ ] **Step 2: Add the window exposure**

In the window-expose section, add:

```javascript
window._calculConfiance = _calculConfiance;
window._candidatVersLocataire = _candidatVersLocataire;
window._candidatVersGarant = _candidatVersGarant;
window._nouveauCandidat = _nouveauCandidat;
window._migrerDocsCandidatVersBail = _migrerDocsCandidatVersBail;
window._purgeCandidatsRefuses = _purgeCandidatsRefuses;
```

- [ ] **Step 3: Verify the module parses (no test runner for js/main.js — syntax check)**

Run: `node --check js/main.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "Candidature : expose les helpers candidature sur window (js/main.js)"
```

---

## Phase 3 — Data collection + Drive sync registration (SANDBOX, then agent audit)

> All edits in `index-test.html`. A new collection that isn't registered in the Drive pipeline will silently fail to sync — this phase is sensitive and ends with a mandatory agent review.

### Task 3.1: Initialize `DB.candidats` in `initDB()`

**Files:**
- Modify: `index-test.html` — `initDB()`, in the collection-defaults block (the run of `if (!DB.xxx) DB.xxx = [];`, around the `if (!DB.edl) DB.edl = [];` line)

- [ ] **Step 1: Add the default**

Locate the block of collection initializers in `initDB()` (search for `if (!DB.edl) DB.edl = [];`) and add immediately after it:

```javascript
  if (!DB.candidats) DB.candidats = []; // LOG-CANDIDATS — pipeline candidatures
```

Do NOT add any sample/demo candidate. (Memory: no demo auto-inject.)

- [ ] **Step 2: Verify in the sandbox console**

Open `index-test.html` in a browser. In the console run: `DB.candidats` → expected `[]` (not `undefined`).

- [ ] **Step 3: Commit**

```bash
git add index-test.html
git commit -m "Candidature : DB.candidats[] initialisé dans initDB (sandbox)"
```

### Task 3.2: Register candidats in the entity Drive payload (`_buildEntityPayload`)

**Files:**
- Modify: `index-test.html` — `_buildEntityPayload(ent)` (filters around line ~41053-41108; documents filter ~41078; return object ~41101-41109)

- [ ] **Step 1: Add the candidats filter**

Inside `_buildEntityPayload`, alongside the other `const xxx = (DB.xxx || []).filter(...)` lines, add:

```javascript
  const candidats = (DB.candidats || []).filter(c => c && c.entity === nom);
  const candIds = new Set(candidats.map(c => c.id));
```

- [ ] **Step 2: Include candidat documents in the documents filter**

In the `const documents = (DB.documents || []).filter(d => { ... })` block, add a clause (next to the other `if (d.parentType === ...)` lines):

```javascript
    if (d.parentType === 'candidat' && candIds.has(d.parentId)) return true;
```

- [ ] **Step 3: Add `candidats` to the returned payload**

In the `return { version: 3, ... documents };` object, add `candidats,` to the property list.

- [ ] **Step 4: Verify syntax**

Run: `node --check index-test.html` is not valid (HTML). Instead, open `index-test.html` in the browser and confirm no console parse error on load, then in console: `typeof _buildEntityPayload === 'function'` → `true`.

- [ ] **Step 5: Commit**

```bash
git add index-test.html
git commit -m "Candidature : sync Drive — candidats + docs candidat dans _buildEntityPayload"
```

### Task 3.3: Merge candidats on Drive pull (`_mergeEntityPayload`)

**Files:**
- Modify: `index-test.html` — the entity merge function (search for `_mergeEntityPayload`, where each collection from the payload is merged into `DB`)

- [ ] **Step 1: Read the merge function first**

Search `index-test.html` for `_mergeEntityPayload` (or the function that consumes `payload.logements`, `payload.baux`, etc.). Identify the exact merge idiom used for an **array collection keyed by `id` with `_modifiedAt` arbitration** (mirror whatever `assurances`/`mrh` use — they are the closest analogues: entity-scoped arrays).

- [ ] **Step 2: Add candidats merge mirroring the assurances/mrh pattern**

Add a block that merges `payload.candidats` into `DB.candidats` using the same id-keyed, `_modifiedAt`-wins logic (and tombstone respect) as the sibling array collections. Example shape (adapt to the exact local idiom found in Step 1):

```javascript
  // LOG-CANDIDATS — merge des candidatures (array entity-scoped, arbitrage _modifiedAt)
  if (Array.isArray(payload.candidats)) {
    if (!DB.candidats) DB.candidats = [];
    payload.candidats.forEach(remote => {
      if (!remote || !remote.id) return;
      const i = DB.candidats.findIndex(c => c && c.id === remote.id);
      if (i < 0) { DB.candidats.push(remote); return; }
      const local = DB.candidats[i];
      if (!local._modifiedAt || (remote._modifiedAt && remote._modifiedAt >= local._modifiedAt)) {
        DB.candidats[i] = remote;
      }
    });
  }
```

> Adapt this to the real merge helper if the codebase already has a generic `_mergeArrayById(localArr, remoteArr)` — reuse it instead of hand-rolling, to stay DRY.

- [ ] **Step 3: Verify**

In the sandbox console, confirm `typeof _mergeEntityPayload === 'function'` → `true` and no parse error on load.

- [ ] **Step 4: Commit**

```bash
git add index-test.html
git commit -m "Candidature : sync Drive — merge des candidats au pull (sandbox)"
```

### Task 3.4: Tombstone candidats on entity cascade delete (`_cascadeDeleteEntity`)

**Files:**
- Modify: `index-test.html` — `_cascadeDeleteEntity` (around line ~41143-41197; `tombstone` = `_tombstoneObj`)

- [ ] **Step 1: Add the cascade loop**

After the existing cascade loops (e.g. assurances/mrh), add:

```javascript
  (DB.candidats || []).forEach((c, i) => {
    if (c && !c._deleted && c.entity === entNom) {
      DB.candidats[i] = tombstone({ id: c.id, entity: c.entity });
      count++;
    }
  });
```

- [ ] **Step 2: Verify**

In the sandbox console: `typeof _cascadeDeleteEntity === 'function'` → `true`, no parse error.

- [ ] **Step 3: Commit**

```bash
git add index-test.html
git commit -m "Candidature : sync Drive — tombstone candidats au cascade delete entité"
```

### Task 3.5: Agent audit of the Drive sync changes (MANDATORY)

- [ ] **Step 1: Dispatch a `superpowers:code-reviewer` agent**

Brief it: review the candidats Drive-sync changes in `index-test.html` (Tasks 3.2-3.4) against the existing pattern for an entity-scoped array collection (e.g. `assurances`/`mrh`). Verify: (a) `candidats` is filtered by entity and included in `_buildEntityPayload` return; (b) candidat documents are included via `parentType:'candidat'` + `candIds`; (c) the merge respects `_modifiedAt` arbitration and tombstones (no resurrection — ref. BUG-DRIVE-RESURRECTION); (d) cascade delete tombstones candidats; (e) no orphan documents after entity delete. Report any gap or divergence from the sibling-collection pattern.

- [ ] **Step 2: Apply fixes the agent flags, re-commit if needed**

Do not proceed to Phase 4 until the agent's review is clean.

---

## Phase 4 — Candidats tab UI (SANDBOX) — gated on Phase 1 approval

> Reuses the validated mockup variant. Vitest does not cover DOM/UI; verification is manual in the sandbox browser.

### Task 4.1: Sidebar nav item

**Files:**
- Modify: `index-test.html` — sidebar, right after the "Locataires" item (`data-module="baux"`, around line ~87-88)

- [ ] **Step 1: Insert the nav item**

Immediately after the `<div class="ni" data-module="baux" ...> ... Locataires</div>` line, add:

```html
<div class="ni" data-module="candidats" data-tip="Candidats — candidatures & conversion en bail" onclick="go('candidats',this)"><span class="ico">👤</span><span class="ni-label"> Candidats</span></div>
```

- [ ] **Step 2: Verify**

Reload `index-test.html`; the "Candidats" item appears in the sidebar between Locataires and Assurances. Clicking it currently shows nothing (page added next) — that is expected.

- [ ] **Step 3: Commit**

```bash
git add index-test.html
git commit -m "Candidature : item sidebar Candidats (sandbox)"
```

### Task 4.2: Page container `#p-candidats` + routing

**Files:**
- Modify: `index-test.html` — page sections (near the `#p-baux` / `#p-assurances` page divs) and the `go()` router maps `titles` (~5601) + `renders` (~5625)

- [ ] **Step 1: Add the page container**

Near the other `<div class="page" id="p-...">` sections (e.g. after `#p-baux`), add:

```html
<div class="page" id="p-candidats">
  <div class="flex-b mb12">
    <h2 style="margin:0">Candidats</h2>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="openInviteCandidat()">Inviter un candidat</button>
      <button class="btn bp" onclick="openAddCandidat()">+ Ajouter un candidat</button>
    </div>
  </div>
  <div class="tabs" id="candidats-tabs">
    <div class="tab act" data-tab="actifs" onclick="setCandidatsTab('actifs',this)">Actifs</div>
    <div class="tab" data-tab="archives" onclick="setCandidatsTab('archives',this)">Archivés</div>
  </div>
  <div id="candidats-grid"></div>
</div>
```

(Match the exact tab class names used by `#p-baux`; adjust if the codebase uses a different tab markup.)

- [ ] **Step 2: Register the title**

In the `titles` map inside `go()` (~5601), add: `candidats:'Candidats',`.

- [ ] **Step 3: Register the renderer**

In the `renders` map (~5625), add: `candidats:rCandidats,` (with default tab reset, mirroring how `baux` resets its tab if needed):

```javascript
  candidats:()=>{ _candidatsTab = _candidatsTab || 'actifs'; rCandidats(); },
```

- [ ] **Step 4: Verify**

Reload; click Candidats → the page shows the header, the two buttons, the tabs, and an empty grid. `rCandidats`/`openAddCandidat`/`openInviteCandidat`/`setCandidatsTab` are defined in the next tasks — until then clicking buttons errors; that is expected.

- [ ] **Step 5: Commit**

```bash
git add index-test.html
git commit -m "Candidature : page #p-candidats + routing (titre + render) (sandbox)"
```

### Task 4.3: `rCandidats()` table renderer + tabs

**Files:**
- Modify: `index-test.html` — add `rCandidats()`, `setCandidatsTab()`, and a module-level `_candidatsTab` near the other render functions (e.g. after `rBaux`)

- [ ] **Step 1: Implement the renderer + tab switch**

```javascript
let _candidatsTab = 'actifs';
function setCandidatsTab(tab, elTab){
  _candidatsTab = tab;
  document.querySelectorAll('#candidats-tabs .tab').forEach(t=>t.classList.remove('act'));
  if(elTab) elTab.classList.add('act');
  rCandidats();
}
function _confianceVoyant(score){
  if(score>=70) return '<span class="b-ok">●</span>';
  if(score>=40) return '<span class="b-warn">●</span>';
  return '<span class="b-err">●</span>';
}
function rCandidats(){
  const grid = el('candidats-grid'); if(!grid) return;
  const wantArchived = _candidatsTab === 'archives';
  const list = (DB.candidats||[]).filter(c=>c && !c._deleted && !!c._archived === wantArchived);
  if(!list.length){ grid.innerHTML = '<div class="mu" style="padding:24px;text-align:center">Aucun candidat '+(wantArchived?'archivé':'actif')+'.</div>'; return; }
  const stLabel = { recu:'Candidature reçue', enCours:'Dossier en cours', valide:'Validé', refuse:'Refusé', converti:'Converti en locataire' };
  const rows = list.map(c=>{
    const log = (DB.logements||[]).find(l=>l && l.ref===c.logRef);
    const bien = log ? (log.ref+(log.adr?(' — '+log.adr):'')) : (c.logRef||'—');
    const score = Number(c.confianceScore)||0;
    const dec = c.piecesVerifiees ? '' : ' <span class="mu sm">(déclaratif)</span>';
    return `<tr onclick="openFicheCandidat('${c.id}')" style="cursor:pointer">
      <td>${escHtml((c.nom||'')+' '+(c.prenom||'')).trim()||'—'}</td>
      <td>${escHtml(bien)}</td>
      <td>${escHtml(c.dateDebutSouhaitee||'—')}</td>
      <td>${escHtml(stLabel[c.statut]||c.statut||'—')}</td>
      <td>${(Number(c.revenus)||0).toLocaleString('fr-FR')} €</td>
      <td>${c.garant && (c.garant.nom||'').trim() ? 'Oui' : 'Non'}</td>
      <td>${_confianceVoyant(score)} ${score}/100${dec}</td>
    </tr>`;
  }).join('');
  grid.innerHTML = `<table class="tbl">
    <thead><tr><th>Nom</th><th>Bien</th><th>Date début</th><th>Statut</th><th>Revenus</th><th>Garant</th><th>Confiance</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}
```

(Use the table/badge classes the project already ships — `.tbl`, `.b-ok/.b-warn/.b-err`, `.mu`, `.sm`. If the validated mockup chose a card layout instead, render that markup here instead of a `<table>`.)

- [ ] **Step 2: Verify with a hand-made candidate**

In the sandbox console:
```javascript
DB.candidats.push(_nouveauCandidat({ nom:'Test', prenom:'Alice', logRef:(DB.logements[0]||{}).ref, revenus:2800, contrat:'CDI', statut:'recu' }));
saveDB(); rCandidats();
```
Expected: one row in the Actifs tab; switching to Archivés shows the empty state. (Delete the test candidate afterward: `DB.candidats=[]; saveDB(); rCandidats();`.)

- [ ] **Step 3: Commit**

```bash
git add index-test.html
git commit -m "Candidature : rCandidats() tableau + tabs Actifs/Archivés (sandbox)"
```

### Task 4.4: "Ajouter un candidat" + "Inviter un candidat" modals (manual)

**Files:**
- Modify: `index-test.html` — add `openAddCandidat()`, `saveCandidat()`, `openInviteCandidat()` and their modal markup (mirror an existing simple modal, e.g. the assurance modal)

- [ ] **Step 1: Add the modal markup**

Add an overlay/modal (`id="ov-candidat"`) reproducing the validated mockup form: bien selector (`id="cand-logref"` populated from vacant logements), civilité, nom, prénom, ddn, lieu de naissance, tél, email, adresse précédente, revenus, employeur, contrat (`<select>` listing CDI/CDD/Freelance/Etudiant/Retraite/Autre **plus** a free-text input when "Autre" — the gravée "choix + ajout libre" rule), garant (nom/adresse/ddn/lieu), and `piecesCompletes`/`ribFourni` checkboxes. Use the same modal scaffolding (`.ov`, `.modal`, `.m-head`, `.m-body`, `.m-foot`) as a sibling modal.

- [ ] **Step 2: Implement open/save**

```javascript
function _logementsVacants(){
  // Un logement est vacant s'il n'a pas de bail actif (occupation dérivée).
  return (DB.logements||[]).filter(l=>l && !l._deleted && !(DB.baux[l.ref] && !DB.baux[l.ref].cloture));
}
function openAddCandidat(){
  el('cand-edit-id').value='';
  // peupler le select des biens (vacants), reset des champs...
  const sel = el('cand-logref');
  if(sel) sel.innerHTML = '<option value="">— choisir un bien —</option>' +
    _logementsVacants().map(l=>`<option value="${escHtml(l.ref)}">${escHtml(l.ref+(l.adr?(' — '+l.adr):''))}</option>`).join('');
  ['cand-civ','cand-nom','cand-prenom','cand-ddn','cand-lieu','cand-tel','cand-email','cand-adrprec','cand-revenus','cand-employeur','cand-contrat','cand-gnom','cand-gadr','cand-gddn','cand-glieu'].forEach(id=>{ if(el(id)) el(id).value=''; });
  ['cand-pieces','cand-rib'].forEach(id=>{ if(el(id)) el(id).checked=false; });
  openM('ov-candidat');
}
function saveCandidat(){
  const logRef = v('cand-logref');
  const log = (DB.logements||[]).find(l=>l && l.ref===logRef);
  const garantNom = v('cand-gnom').trim();
  const cand = _nouveauCandidat({
    id: v('cand-edit-id')||undefined,
    logRef, entity: log ? (log.entity||'') : '',
    source:'manuel',
    civilite:v('cand-civ'), nom:v('cand-nom').trim(), prenom:v('cand-prenom').trim(),
    ddn:v('cand-ddn'), lieuNaiss:v('cand-lieu'), tel:v('cand-tel'), email:v('cand-email'),
    adressePrecedente:v('cand-adrprec'),
    revenus:pf('cand-revenus'), employeur:v('cand-employeur'), contrat:v('cand-contrat'),
    garant: garantNom ? { nom:garantNom, adresse:v('cand-gadr'), ddn:v('cand-gddn'), lieu:v('cand-glieu') } : null,
    piecesCompletes: el('cand-pieces')?.checked||false,
    ribFourni: el('cand-rib')?.checked||false
  });
  if(!cand.nom){ showToast('Nom requis','err'); return; }
  cand.confianceScore = _calculConfiance(cand, log ? (Number(log.hc)||0) : 0);
  const editId = v('cand-edit-id');
  if(editId){ const i=DB.candidats.findIndex(c=>c.id===editId); if(i>=0){ cand.dateCreation=DB.candidats[i].dateCreation; DB.candidats[i]=cand; } }
  else DB.candidats.push(cand);
  _stamp(cand);
  if(typeof _auditLog==='function') _auditLog(editId?'update':'create','candidat',cand.id,cand.nom);
  saveDB(); closeM('ov-candidat'); rCandidats();
  showToast('Candidat enregistré','ok');
}
function openInviteCandidat(){
  // V1 sans relais : explique que le lien en ligne arrive avec la phase relais ;
  // propose la saisie manuelle en attendant. (Le vrai lien = plan online.)
  showToast('Lien en ligne : disponible avec le module relais (phase suivante). Pour l’instant : « + Ajouter un candidat ».','info',6000);
}
```

> `openM`/`closeM`/`v`/`pf`/`el`/`showToast`/`_stamp`/`_auditLog` are existing globals. Confirm the exact names by grepping a sibling modal before wiring.

- [ ] **Step 3: Verify**

Reload; "+ Ajouter un candidat" opens the modal, the bien select lists vacant logements, saving creates a row with a computed Confiance score. Edit re-opens with values (implement edit-population if the mockup requires it).

- [ ] **Step 4: Commit**

```bash
git add index-test.html
git commit -m "Candidature : modales ajouter/inviter candidat + saveCandidat (sandbox)"
```

### Task 4.5: Re-render hooks

**Files:**
- Modify: `index-test.html` — wherever candidate data mutates outside `rCandidats` (e.g. after Drive merge completes), call `rCandidats()` if `#p-candidats` is active

- [ ] **Step 1: Add a guarded refresh after sync merge**

Find where the UI is refreshed after a Drive pull (search for the post-merge refresh, near `rBaux()` calls in the sync success path) and add a guarded call:

```javascript
  if (document.getElementById('p-candidats')?.classList.contains('act')) rCandidats();
```

- [ ] **Step 2: Verify + commit**

Reload, confirm no errors.
```bash
git add index-test.html
git commit -m "Candidature : refresh rCandidats après merge sync (sandbox)"
```

---

## Phase 5 — Fiche candidat: pipeline + scoring display + pieces

### Task 5.1: `openFicheCandidat()` detail view

**Files:**
- Modify: `index-test.html` — add `openFicheCandidat(id)` + modal markup (`id="ov-fiche-candidat"`), mirroring the validated fiche mockup

- [ ] **Step 1: Implement the fiche**

Render: identity, situation, garant, the **statut pipeline** with action buttons (Task 5.2), the **scoring breakdown + tooltip** (Task 5.3), the **pieces list** (Task 5.4), and a **"Créer le bail à partir de ce candidat"** button enabled only when `statut==='valide'` (wires to Phase 6 `convertCandidatToBail(id)`). Pull the candidate via `(DB.candidats||[]).find(c=>c.id===id)`.

- [ ] **Step 2: Verify + commit**

Click a row → fiche opens with the candidate's data.
```bash
git add index-test.html
git commit -m "Candidature : fiche candidat (openFicheCandidat) (sandbox)"
```

### Task 5.2: Statut transitions + complément

**Files:**
- Modify: `index-test.html` — add `setCandidatStatut(id, statut)` and `demanderComplementCandidat(id)`

- [ ] **Step 1: Implement transitions**

```javascript
function setCandidatStatut(id, statut){
  const c=(DB.candidats||[]).find(x=>x.id===id); if(!c) return;
  c.statut=statut; _stamp(c);
  if(typeof _auditLog==='function') _auditLog('update','candidat',id,'statut='+statut);
  saveDB(); rCandidats(); if(el('ov-fiche-candidat')?.classList.contains('act')) openFicheCandidat(id);
}
function demanderComplementCandidat(id){
  // V1 sans relais : marque "en cours" + note. (Relance en ligne = plan online, D13.)
  const c=(DB.candidats||[]).find(x=>x.id===id); if(!c) return;
  c.statut='enCours'; _stamp(c); saveDB();
  showToast('Statut « En cours » — la relance en ligne du candidat arrivera avec le module relais.','info',6000);
  openFicheCandidat(id);
}
```

Refus (`setCandidatStatut(id,'refuse')`) should optionally offer the courtesy email (D10) — wire to the existing EMAIL-AUTO flow if present, else just a toast noting the template will be available. Do not auto-send.

- [ ] **Step 2: Verify + commit**

Buttons move the candidate through Reçu→En cours→Validé/Refusé; the fiche and table reflect it.
```bash
git add index-test.html
git commit -m "Candidature : transitions de statut + demande de complément (sandbox)"
```

### Task 5.3: Scoring display + tooltip + "pièces vérifiées" toggle

**Files:**
- Modify: `index-test.html` — in `openFicheCandidat`, render the score breakdown + transparency tooltip + the toggle handler `toggleCandidatPiecesVerifiees(id)`

- [ ] **Step 1: Implement the toggle + recompute**

```javascript
function toggleCandidatPiecesVerifiees(id){
  const c=(DB.candidats||[]).find(x=>x.id===id); if(!c) return;
  c.piecesVerifiees=!c.piecesVerifiees; _stamp(c); saveDB();
  openFicheCandidat(id); rCandidats();
}
```

The fiche shows the score with the tooltip text from spec §9 ("Score basé sur revenus, contrat, garant et complétude du dossier. Aide à la décision, pas un verdict. Données déclaratives tant que les pièces ne sont pas vérifiées.") and the "déclaratif" badge whenever `!c.piecesVerifiees`. Recompute the displayed score with `_calculConfiance(c, log?.hc)` so it stays live.

- [ ] **Step 2: Verify + commit**

Tooltip readable; toggling "pièces vérifiées" removes the "déclaratif" badge.
```bash
git add index-test.html
git commit -m "Candidature : affichage score + tooltip transparence + toggle pièces vérifiées (sandbox)"
```

### Task 5.4: Pieces upload (GED, `parentType:'candidat'`)

**Files:**
- Modify: `index-test.html` — in the fiche, a pieces list + upload calling `_attachmentSaveForEntity`

- [ ] **Step 1: Wire upload + list**

Upload uses the existing attachment flow (mirror how another fiche uploads, e.g. assurance/mouvement), with the parent:

```javascript
await _attachmentSaveForEntity(
  { type:'candidat', id:c.id, ref:c.id, logRef:c.logRef||null, category:'documents' },
  fileData
);
```

List the candidate's docs via `(DB.documents||[]).filter(d=>d.parentType==='candidat' && String(d.parentId)===String(c.id))`, reusing the existing doc-row/preview/delete components.

- [ ] **Step 2: Verify + commit**

Upload a PDF on a candidate fiche → it appears in the list and persists across reload (IndexedDB).
```bash
git add index-test.html
git commit -m "Candidature : pièces jointes candidat via GED (parentType candidat) (sandbox)"
```

---

## Phase 6 — Conversion candidat → bail (SANDBOX, then agent audit)

### Task 6.1: `convertCandidatToBail()` — open the bail wizard pre-filled

**Files:**
- Modify: `index-test.html` — add `convertCandidatToBail(id)` and a module-level `let _pendingCandidatConv = null;` near `openBail`

- [ ] **Step 1: Implement**

```javascript
let _pendingCandidatConv = null;
function convertCandidatToBail(id){
  const c=(DB.candidats||[]).find(x=>x.id===id); if(!c){ showToast('Candidat introuvable','err'); return; }
  if(c.statut!=='valide'){ showToast('Le candidat doit être « Validé » avant conversion','warn'); return; }
  if(!c.logRef){ showToast('Aucun bien associé à ce candidat','err'); return; }
  const log=(DB.logements||[]).find(l=>l && l.ref===c.logRef);
  closeM('ov-fiche-candidat');
  openBail(null);                                   // wizard vierge
  if(el('b-ref')) el('b-ref').value = c.logRef;     // sélecteur logement
  if(el('b-entity') && log && log.entity) el('b-entity').value = log.entity;
  renderBailLocs([ _candidatVersLocataire(c) ]);    // mapping identité 1:1
  const g=_candidatVersGarant(c);
  renderBailGarants(g ? [g] : []);
  _pendingCandidatConv = id;                         // hook pour saveBail (Task 6.2)
  showToast('Bail pré-rempli depuis le candidat — complétez loyer, dates et clauses.','ok',5000);
}
```

The fiche's "Créer le bail à partir de ce candidat" button calls `convertCandidatToBail(c.id)`.

- [ ] **Step 2: Verify**

On a Validé candidate, click convert → the bail wizard opens with the bien selected, the locataire row pre-filled (nom = "Nom Prénom"), and the garant if any.

- [ ] **Step 3: Commit**

```bash
git add index-test.html
git commit -m "Candidature : convertCandidatToBail — ouvre le bail pré-rempli (sandbox)"
```

### Task 6.2: Finalize on bail save (hook in `saveBail`)

**Files:**
- Modify: `index-test.html` — `saveBail()`, at the success tail (after `showToast('Bail enregistré','ok');`, ~line 15216) — and add `_finalizeCandidatConversion`

- [ ] **Step 1: Add the finalize call at the end of `saveBail()`**

Immediately after `showToast('Bail enregistré','ok'); suggestSave('Bail');`, add:

```javascript
  if (_pendingCandidatConv) { _finalizeCandidatConversion(_pendingCandidatConv, ref); _pendingCandidatConv = null; }
```

Also reset `_pendingCandidatConv = null;` at the start of `openBail` for any path that opens a non-conversion bail, to avoid a stale finalize. (Add `_pendingCandidatConv = null;` as the first line of `openBail`.)

- [ ] **Step 2: Implement `_finalizeCandidatConversion`**

```javascript
function _finalizeCandidatConversion(candId, bailRef){
  const c=(DB.candidats||[]).find(x=>x.id===candId); if(!c) return;
  const log=(DB.logements||[]).find(l=>l && l.ref===bailRef);
  const logRef = log ? log.ref : (c.logRef||null);
  // 1) migrer les pièces candidat → bail (helper pur, testé Task 2.4)
  DB.documents = _migrerDocsCandidatVersBail(DB.documents||[], candId, bailRef, logRef);
  // 2) archiver le candidat
  c.statut='converti'; c._archived=true; c.bailRef=bailRef; _stamp(c);
  if(typeof _auditLog==='function') _auditLog('update','candidat',candId,'converti → bail '+bailRef);
  saveDB();
  rCandidats();
  showToast('Candidat converti en locataire — bail '+bailRef+' créé.','ok',5000);
}
```

> Occupation: no extra step — `saveBail()` already updates `DB.logements[ref]` (locataire, dates, loyer) and "Loué" is derived from the active bail's presence (spec §8).

- [ ] **Step 3: Verify the full loop in the sandbox**

Create a candidate (Validé), convert, fill the bail's required fields (loyer/dates), save. Expect: bail created (`DB.baux[ref]`), candidate now `statut:'converti'`, `_archived:true`, `bailRef` set, present in the **Archivés** tab; any candidate pieces now have `parentType:'bail'`; the logement shows as occupied/loué in the Locataires view.

- [ ] **Step 4: Commit**

```bash
git add index-test.html
git commit -m "Candidature : finalisation conversion au save du bail (migration pièces + archive) (sandbox)"
```

### Task 6.3: Agent audit of the conversion + document migration (MANDATORY)

- [ ] **Step 1: Dispatch a `superpowers:code-reviewer` agent**

Brief it: review `convertCandidatToBail`, the `saveBail` hook, and `_finalizeCandidatConversion` in `index-test.html`. Verify: (a) no candidate data is lost in the mapping (identity + garant); (b) `_pendingCandidatConv` cannot leak into a normal bail save (reset on `openBail`); (c) document migration re-points only the right candidate's docs and doesn't orphan IndexedDB blobs; (d) the candidate is archived (not deleted) and the link `bailRef`/audit-trail is preserved; (e) idempotency if save is clicked twice. Report gaps.

- [ ] **Step 2: Apply fixes, re-commit. Do not proceed until clean.**

---

## Phase 7 — RGPD purge wiring

### Task 7.1: Call `_purgeCandidatsRefuses` at startup with tombstoning

**Files:**
- Modify: `index-test.html` — a startup/maintenance point (after `initDB`, where other periodic cleanups run; search for existing purge/maintenance calls)

- [x] **Step 1: Implement the prod wrapper that tombstones purged refusés**

```javascript
function _purgeCandidatsRefusesProd(){
  if(!Array.isArray(DB.candidats) || !DB.candidats.length) return;
  const now = Date.now();
  const kept = _purgeCandidatsRefuses(DB.candidats, now, 30); // helper pur (Task 2.5)
  if(kept.length === DB.candidats.length) return; // rien à purger
  const keptIds = new Set(kept.map(c=>c.id));
  let changed=false;
  DB.candidats = DB.candidats.map(c=>{
    if(c && !c._deleted && c.statut==='refuse' && !keptIds.has(c.id)){
      changed=true;
      return _tombstoneObj({ id:c.id, entity:c.entity }); // tombstone pour sync Drive
    }
    return c;
  });
  if(changed) saveDB();
}
```

Call `_purgeCandidatsRefusesProd();` once at startup (after DB is loaded), guarded so it runs only in non-sandbox prod sync context if appropriate (sandbox has Drive disabled — tombstoning is harmless there, so an unconditional call is acceptable). Confirm `_tombstoneObj` is the correct global name by grepping.

- [x] **Step 2: Verify**

In the sandbox console, create a `refuse` candidate with `_modifiedAt` 31 days ago, run `_purgeCandidatsRefusesProd()`, confirm it becomes a tombstone and disappears from the Archivés list.

- [x] **Step 3: Commit**

```bash
git add index-test.html
git commit -m "Candidature : purge RGPD 30j des refusés au démarrage (tombstone) (sandbox)"
```

### Task 7.2: RGPD register note

**Files:**
- Modify: `docs/legal/RGPD-REGISTRE.md` (if present — confirm path)

- [x] **Step 1: Add a treatment entry**

Add a "Candidatures locataires" treatment line: finalité (sélection locataire), données (identité, revenus, garant, pièces décret 2015-1437), base légale (mesures précontractuelles), durée (refusés purgés à 30 j ; retenus → cycle de vie du bail), destinataires (bailleur ; relais = sous-traitant pour le lien en ligne — à compléter au plan online).

- [x] **Step 2: Commit**

```bash
git add docs/legal/RGPD-REGISTRE.md
git commit -m "Candidature : RGPD — entrée registre traitement candidatures"
```

---

## Phase 8 — Propagate to prod + version bump + backlog

> Only after the user's explicit "OK" on the sandbox (memory: sandbox-first, prod after OK).

### Task 8.1: Run the full test suite

- [ ] **Step 1: Run all tests**

Run: `npm run test:run`
Expected: all green, including the new `candidature.test.js` (the prior total was ~1385; expect that plus the new candidature tests).

### Task 8.2: Propagate `index-test.html` → `index.html`

**Files:**
- Modify: `index.html` — apply the identical edits from Phases 3-7 (initDB collection, sidebar item, page + routing, `rCandidats`, modals, fiche, conversion + `saveBail` hook, purge call)

- [ ] **Step 1: Apply each sandbox edit to prod**

Mirror every `index-test.html` change into `index.html` at the corresponding location. Verify the prod line anchors (the agents found prod-specific lines: initDB ~4554, sidebar ~87, `go` maps ~5601/5625, `saveBail` ~15074, `_buildEntityPayload` ~41048, `_cascadeDeleteEntity` ~41143). Apply carefully — these line numbers drift.

- [ ] **Step 2: Bump the version**

In `index.html`, increment the version (title `<title>` and footer) from the current `v15.X` to the next `v15.(X+1)`. (Memory: bump version on every delivered feature.)

- [ ] **Step 3: Smoke-test prod (real data namespace)**

Open `index.html`, confirm: Candidats tab renders, an existing entity's data still loads, no console error, Drive sync still builds payload (`_buildEntityPayload` returns `candidats`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "v15.X : Candidature locataire (app-side) — pipeline candidats + conversion bail"
```

### Task 8.3: Update BACKLOG + subject (pilotage)

**Files:**
- Modify: `BACKLOG.md`, `docs/subjects/LOG-CANDIDATS.md`

- [ ] **Step 1: Update statuses**

In `BACKLOG.md`, mark LOG-CANDIDATS app-side as livré v15.X (note the online link remains pending the relay foundation). In `docs/subjects/LOG-CANDIDATS.md`, add a journal entry (app-side delivered, helpers + onglet + fiche + conversion + scoring + RGPD purge; online link = separate plan).

- [ ] **Step 2: Commit**

```bash
git add BACKLOG.md docs/subjects/LOG-CANDIDATS.md
git commit -m "Pilotage : LOG-CANDIDATS app-side livré v15.X (lien en ligne = plan suivant)"
```

---

## Self-Review (completed against the spec)

**Spec coverage:**
- §3 architecture (reuse relay) → online part explicitly deferred to a second plan; app-side here is forward-compatible (`source:'lien'`). ✓
- §4 D2 mapping 1:1 → Task 2.2 `_candidatVersLocataire` (+ spec corrected to `ddn`/`lieuNaiss`). ✓
- §4 D3 situation not carried to bail → mapping deliberately omits revenus/employeur/contrat. ✓
- §4 D5 pieces in `DB.documents` `parentType:'candidat'` + migrate → Task 5.4 + Task 2.4/6.2. ✓
- §4 D6 conversion via wizard → Phase 6. ✓
- §4 D7 transparent legal-only scoring → Task 2.1 + Task 5.3. ✓
- §4 D8 déclaratif until verified → Task 5.3 toggle + badge. ✓
- §4 D9 tab between Locataires/Mouvements + fiche bien section → Task 4.1 (tab). **Gap:** the "Candidats section on the vacant-logement fiche" (LOG-FICHE-360) is not a task here. Resolution: it belongs to LOG-FICHE-360's fiche; tracked as a cross-reference, not built in this plan (noted below).
- §4 D10 refus courtesy email → Task 5.2 (optional, not auto). ✓
- §4 D11 RGPD purge 30j → Phase 7. ✓
- §4 D12 three entry points → manual add (Task 4.4) here; annonce + online-link entry points depend on the online plan (deferred). The data model carries `source` to support all three. ✓ (partial by design)
- §4 D13 complément → Task 5.2 (V1 = status + note; online re-notify in the online plan). ✓ (partial by design)
- §5 data model → Phase 2 + Task 3.1. ✓
- §9 scoring table → Task 2.1 tests encode every row. ✓
- §11 RGPD → Phase 7. ✓
- §6 `dossier.html`, §10 invite-link, §3 relay module → **out of scope (online plan)**, stated up front. ✓

**Deferred-by-design (not gaps):** `dossier.html`, relay candidature routes, real link generation, annonce entry point, online re-notify for complément. These require the relay foundation; a follow-up plan covers them.

**Cross-reference (not a gap in this plan):** D9's "Candidats section on the vacant-logement fiche" is a LOG-FICHE-360 surface; when that fiche is built/extended, add a section listing `(DB.candidats||[]).filter(c=>c.logRef===ref && !c._archived)` with a link to `openFicheCandidat`. Recorded here so it isn't lost.

**Placeholder scan:** No "TODO/TBD/handle errors" placeholders; every code step shows real code. UI steps that mirror existing components instruct to grep the sibling for exact global names (justified: those names are stable but must be confirmed against the live file at execution).

**Type/name consistency:** `_calculConfiance`, `_candidatVersLocataire`, `_candidatVersGarant`, `_nouveauCandidat`, `_migrerDocsCandidatVersBail`, `_purgeCandidatsRefuses` used identically across Phase 2 (def), js/main.js (expose), and Phases 4-7 (call). Candidat fields (`ddn`, `lieuNaiss`, `garant.{nom,adresse,ddn,lieu}`, `piecesCompletes`, `ribFourni`, `statut`, `_archived`, `bailRef`) consistent between the factory, the scoring inputs, the mapping outputs (matching `renderBailLocs`/`renderBailGarants`), and `saveBail`'s `b-ref`. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-02-candidature-app.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
