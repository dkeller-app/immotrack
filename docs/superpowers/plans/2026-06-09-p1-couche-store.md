# P1 — Couche `Store` (seam de persistance) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Introduire **un point d'accès unique** à la persistance des données (`Store`), sur lequel toute hydratation/écriture transite, **adossé au localStorage actuel** — **zéro changement de comportement**, entièrement testé. C'est le *seam* qui rendra la bascule Supabase (P3) chirurgicale au lieu de toucher 47 000 lignes.

**Architecture :** `DB` (objet global en mémoire) **reste le cache synchrone** : les lectures UI (`DB.xxx`) ne changent pas. On extrait un module ES `js/core/store.js` (même pattern que `js/core/relay-client.js`) qui possède : (1) `hydrate()` = ce que fait `initDB()` aujourd'hui (lire localStorage → `DB`) ; (2) `persist()` = ce que fait `saveDB()` (sérialiser `DB` → localStorage + Drive-dirty + audit-flush + undo) ; (3) une **API par collection** `upsert(coll, rec)` / `remove(coll, id)` que les ~30 helpers `save<X>` appelleront — en P1 elle mute `DB` + persiste (comportement actuel), en P3 elle écrira par ligne dans Supabase. `saveDB()`/`initDB()` deviennent de **fines façades** déléguant au `Store` (les 159 appels `saveDB()` restent inchangés). Aucune régression : la suite Vitest existante + le chargement de l'app le prouvent.

**Tech Stack :** vanilla JS ES modules (`js/core/`), Vitest (`__tests__/`), sandbox-first (`index-test.html`). Pas de Supabase en P1 (P1 = refacto pur adossé localStorage).

**Périmètre / non-périmètre :**
- **Dans P1** : module `Store`, façade `saveDB`/`initDB`, API par collection, **routage des 9 collections cœur** (`entites`, `immeubles`, `logements`, `documents`, `mouvements`, `quittances`, `baux`, `baux_historique`, `edl`) via `Store.upsert/remove` dans leurs helpers `save<X>`. Tests + 0 régression.
- **Hors P1 (→ P3)** : toute écriture réelle Supabase ; le branchement Supabase derrière `Store` ; le cache/Realtime/concurrence `version` côté serveur. Les collections de config (params, categories, irlTable…) restent en persist whole-blob en P1 (routage par-ligne non requis tant qu'elles ne basculent pas).

---

## Contexte de référence (lu et vérifié)
- `index.html` : `saveDB()` (l.5696) sérialise tout `DB` → `localStorage.setItem(KEY)` + `_markDriveDirty()` + `_auditFlushPending()` + hooks undo (`_undoOnSaveDB`/`_undoOnSaveDBSuccess`). **159 appels** dans l'app. `initDB()` (l.4819) hydrate depuis localStorage. `KEY` = `immotrack_v4` (ou `_test_immotrack_v4` en sandbox).
- ~30 helpers `save<X>` (`saveBail` 16207, `saveMv` 13192, `saveQuit` 23600, `saveEDL` 27514, `saveImm` 39525, `saveEnt` 39683, `saveMrh` 20374, `saveAss` 20300, `saveCandidat` 14399, etc.) : mutent `DB.<coll>` puis appellent `saveDB()`.
- `_auditLog(action, entityType, entityId, entityRef, before, after, source)` (l.5734) : trace déjà chaque mutation par entité → réutilisable pour le diff par-ligne en P3.
- Précédent d'extraction module : `js/core/relay-client.js` (déjà testé sous `__tests__/helpers/relay-client.test.js`) → même structure pour `store.js`.
- Spec maîtresse §3 (cache working-set), §6 (flux lecture/écriture), §7 (concurrence `version`) : `docs/superpowers/specs/2026-06-04-strategie-persistance-multitenant-design.md`. Mémoire epic : `project_persistance_multitenant.md` (décision archi propre 2026-06-09).

## Décisions de conception (tranchées)
1. **`DB` reste le cache synchrone en mémoire** — on ne réécrit PAS les lectures `DB.xxx` (47k lignes). Le seam est la **persistance + l'hydratation**, pas la lecture.
2. **`saveDB()`/`initDB()` deviennent des façades** déléguant au `Store` → les 159 appels existants restent valides (zéro churn d'appelants pour la persistance whole-blob).
3. **API par collection** `Store.upsert(coll, record)` / `Store.remove(coll, id)` introduite + **branchée dans les 9 helpers cœur** → en P1 elle fait « muter `DB` + `persist()` » (comportement identique), mais elle EST le point où P3 écrira par ligne dans Supabase. Pas de réécriture des 159 appels bruts (migrés au fil de P3).
4. **Module ES `js/core/store.js`** importable par `index.html` ET testable en Vitest (pattern `relay-client.js`). Les dépendances globales (`localStorage`, `KEY`, hooks Drive/undo/audit) sont **injectées** (config) pour rester testable hors navigateur.
5. **Sandbox-first** : tout passe par `index-test.html` ; on ne touche `index.html` prod qu'après « OK » explicite (règle gravée). **Bump de version** à chaque livraison.

## File Structure
- **Create** `js/core/store.js` — module `Store` (hydrate/persist/upsert/remove), dépendances injectées.
- **Create** `__tests__/helpers/store.test.js` — tests unitaires (round-trip hydrate/persist, upsert/remove, no-op sémantique vs saveDB).
- **Modify** `index.html` — `initDB()` délègue à `Store.hydrate()` ; `saveDB()` délègue à `Store.persist()` ; init du `Store` (injection des deps) au boot ; routage des 9 helpers `save<X>` cœur via `Store.upsert/remove`.
- **Modify** `index-test.html` — répercuter (sandbox-first) avant `index.html`.

---

### Task 1 : Module `Store` + tests (adossé localStorage, isolé)

**Files:** Create `js/core/store.js` ; Create `__tests__/helpers/store.test.js`

- [ ] **Step 1 — Écrire le test d'abord (TDD).** `__tests__/helpers/store.test.js` : un `Store` créé avec un faux backend (Map en mémoire simulant localStorage) +
  - `hydrate()` renvoie l'objet DB parsé depuis le backend (ou un DB vide par défaut si absent) ;
  - `persist(db)` sérialise `db` dans le backend ET appelle les hooks injectés (`onDirty`, `onAuditFlush`, `onUndo`) ;
  - `upsert('entites', rec)` insère/met à jour la ligne par `id` dans `db.entites` puis persiste ;
  - `remove('entites', id)` pose le tombstone (`_deleted`/`_deletedAt`) **selon la sémantique actuelle** puis persiste ;
  - round-trip : `persist` puis `hydrate` redonne la même donnée.
- [ ] **Step 2 — Lancer le test → rouge** (`store.js` n'existe pas). `npm test -- store`.
- [ ] **Step 3 — Écrire `js/core/store.js`** : `export function createStore({ backend, key, hooks })` où `backend` = `{getItem,setItem}` (localStorage en prod, Map en test), `hooks` = `{ onDirty, onAuditFlush, onUndoBefore, onUndoAfter }`. Implémenter `hydrate/persist/upsert/remove` en reproduisant EXACTEMENT la sémantique de `saveDB()` (ordre des hooks : undoBefore → auditFlush → setItem → onDirty → undoAfter) — lire `index.html:5696-5722` pour l'ordre exact.
- [ ] **Step 4 — Lancer le test → vert.** `npm test -- store`.
- [ ] **Step 5 — Commit** (sandbox/infra, pas index.html) : `git add js/core/store.js __tests__/helpers/store.test.js && git commit`.

### Task 2 : Brancher `saveDB`/`initDB` sur `Store` (sandbox d'abord) — 0 régression

**Files:** Modify `index-test.html` (puis `index.html` après OK)

- [ ] **Step 1 —** Dans `index-test.html` : importer `createStore`, l'instancier au boot avec `backend=localStorage`, `key=KEY`, et les hooks pointant vers `_markDriveDirty`/`_auditFlushPending`/`_undoOnSaveDB`/`_undoOnSaveDBSuccess`.
- [ ] **Step 2 —** Réécrire `saveDB()` comme **façade** : `return Store.persist(DB)`. Réécrire l'hydratation d'`initDB()` pour utiliser `Store.hydrate()` (en conservant le reste d'initDB : valeurs par défaut, migrations `_migratedArchi*`, etc.).
- [ ] **Step 3 — Vérifier 0 régression** : `npm run test:run` (suite Vitest existante verte) + charger `index-test.html` dans un vrai navigateur (preview), créer/éditer une entité/bail/mouvement, recharger → données persistées identiques. Vérifier l'audit-trail + l'undo + le flag Drive-dirty inchangés.
- [ ] **Step 4 — Commit sandbox.** Demander le test visuel utilisateur. Après « OK » → répercuter dans `index.html`, re-vérifier, **bump version**, commit (file index-commit si maître/ouvrière selon protocole).

### Task 3 : Router les 9 helpers `save<X>` cœur via `Store.upsert/remove`

**Files:** Modify `index-test.html` (puis `index.html`)

- [ ] **Step 1 —** Pour chacun des helpers des 9 collections cœur (entites→`saveEnt`, immeubles→`saveImm`, logements→`saveLogInline`/inline, documents, mouvements→`saveMv`, quittances→`saveQuit`, baux→`saveBail`, baux_historique, edl→`saveEDL`) : remplacer le motif « muter `DB.<coll>` + `saveDB()` » par un appel `Store.upsert('<coll>', record)` / `Store.remove('<coll>', id)`. **Comportement identique** (l'API fait muter+persister en P1). Conserver `_auditLog` aux mêmes points.
- [ ] **Step 2 —** Tests : étendre `store.test.js` pour chaque collection (upsert crée/maj par id, remove pose le tombstone). Vérifier les invariants métier conservés (1 bail courant par logement, etc. — restent gérés par le code appelant, le Store ne fait que persister).
- [ ] **Step 3 —** 0 régression : suite Vitest + test visuel sandbox (parcours quotidien : ajouter loyer, générer quittance, éditer bail). Puis `index.html` après OK + bump.
- [ ] **Step 4 — Commit.**

### Task 4 : Audit `superpowers:code-reviewer` (RÈGLE GRAVÉE) + clôture
- [ ] Suite Vitest complète verte + test visuel sandbox validé.
- [ ] Audit `superpowers:code-reviewer` sur `store.js` + les diffs index : vérifier (1) **sémantique de `persist` strictement identique** à l'ancien `saveDB` (ordre hooks, gestion quota, retour) → 0 régression ; (2) `upsert/remove` respectent la sémantique de mutation/tombstone existante ; (3) le `Store` est **prêt pour le swap Supabase** (frontière async claire, pas de couplage localStorage en dur hors backend injecté) ; (4) testabilité (deps injectées). Itérer jusqu'à PASSANT.
- [ ] MAJ mémoire (`project_persistance_multitenant.md` : P1 livré, seam `Store` en place). Clôture + annoncer que P3 (bascule Supabase derrière `Store`) est désormais chirurgicale.

---

## Self-Review
- **Seam correct ?** Oui : `saveDB`/`initDB` sont les 2 frontières de persistance (159 + 1 appels), `DB` reste le cache lecture → on ne touche pas les lectures. ✓
- **0 régression garanti ?** `persist` reproduit `saveDB` à l'identique (ordre hooks lu en `index.html:5696`), suite Vitest + test visuel sandbox, sandbox-first avant prod. ✓
- **Prépare P3 proprement ?** L'API `upsert/remove` par collection + `_auditLog` (diff before/after) = les points exacts où P3 écrira par ligne dans Supabase. Pas de hack, pas de whole-blob imposé. ✓
- **Commercialisation ?** Module ES réutilisable, testable, frontière nette — base saine pour multi-tenant/Realtime. ✓
- **Placeholders ?** L'extraction exacte de la sémantique `saveDB`/`initDB` est référencée par ligne ; l'implémenteur lit le contexte réel avant d'extraire (refacto de monolithe → grounding obligatoire, pas de code inventé).
