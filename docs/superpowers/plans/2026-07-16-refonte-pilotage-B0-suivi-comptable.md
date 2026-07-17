# Refonte Pilotage — Phase B0 : Suivi comptable remis au validé

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou superpowers:executing-plans. Steps en cases (`- [ ]`).

**Goal:** Remettre la matrice « Suivi comptable » (onglet Pilotage) conforme à la maquette validée : fenêtre de mois **M-3…M**, colonne finale **solde cumulé signé** (« − 620 € »), et bouton **« Mettre à jour les loyers »** restauré.

**Architecture:** 3 changements d'affichage localisés dans `_rPilCompta()` + son thead HTML. Aucune nouvelle logique de calcul : le solde signé vient de `cum.cumul` (déjà produit par `_pilCumulLocataire` → `_computeLoyerCumul`, borné au début du suivi). Le bouton réutilise `_pilOpenBulkMajIrl()` (existant, @deprecated → réactivé). DRY : on ne touche à aucun moteur.

**Tech Stack:** HTML/CSS/JS inline `index.html` (worktree `C:/tmp/wt-visuel`, branche `feat/refonte-pilotage`), tokens `css/main.css`.

**Base :** `origin/main` ≥ v15.492. Spec : `docs/superpowers/specs/2026-07-16-refonte-pilotage-suivi-gestionnaire-design.md`.

⚠️ **Localiser par symbole, pas par ligne** (lignes ci-dessous = état v15.492, susceptibles de bouger). ⚠️ **`index.html` doit rester en CRLF** (le tooling le reflippe LF → casse la parité data-defaults). ⚠️ Sandbox `index-test.html` figée pré-v15.314 (ne contient pas `_rPilCompta` courant) → validation = déploiement github.io + smoke user, comme les features récentes.

---

### Task 1 : Fenêtre de mois M-2…M+1 → M-3…M

**Files:**
- Modify: `index.html` — thead `#pil-compta-mo1..4` (~729-732) + `_rPilCompta` header loop (~46302-46307) + cells loop (~46330-46333)

- [ ] **Step 1 : thead statique (libellés de repli)**

Remplacer les 4 `<th>` mensuels :
```html
              <th id="pil-compta-mo1" style="text-align:right">M-2</th>
              <th id="pil-compta-mo2" style="text-align:right">M-1</th>
              <th id="pil-compta-mo3" style="text-align:right">Mois</th>
              <th id="pil-compta-mo4" style="text-align:right">À venir</th>
```
par :
```html
              <th id="pil-compta-mo1" style="text-align:right">M-3</th>
              <th id="pil-compta-mo2" style="text-align:right">M-2</th>
              <th id="pil-compta-mo3" style="text-align:right">M-1</th>
              <th id="pil-compta-mo4" style="text-align:right">Mois</th>
```

- [ ] **Step 2 : boucle d'en-tête JS (offset + retrait de la flèche futur)**

Remplacer le bloc (commentaire inclus) :
```js
  // Headers : fenêtre M-2 → M+1 (inclut le mois À VENIR pour matérialiser une avance).
  for (let i = 0; i < 4; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + (i - 2), 1);
    const moHeader = el(`pil-compta-mo${i+1}`);
    if (moHeader) moHeader.textContent = _DMC[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2) + (i === 3 ? ' →' : '');
  }
```
par :
```js
  // Headers : fenêtre M-3 → M (maquette validée : les 4 derniers mois, pas de mois futur).
  for (let i = 0; i < 4; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + (i - 3), 1);
    const moHeader = el(`pil-compta-mo${i+1}`);
    if (moHeader) moHeader.textContent = _DMC[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2);
  }
```

- [ ] **Step 3 : boucle des cellules JS (même offset)**

Remplacer (commentaire inclus) :
```js
    // Cellules fenêtre M-2..M+1 via le moteur (strip mémoïsé, report géré, dû du bail de l'époque).
    const moCells = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + (i - 2), 1);
```
par :
```js
    // Cellules fenêtre M-3..M via le moteur (strip mémoïsé, report géré, dû du bail de l'époque).
    const moCells = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + (i - 3), 1);
```

- [ ] **Step 4 : vérifier la syntaxe inline**

Run: `node scripts/check-inline-js.mjs`
Expected: `Inline JS blocks valid : 5 | errors : 0`

- [ ] **Step 5 : commit**

```bash
git add index.html
git commit -m "REFONTE-PILOTAGE B0 : Suivi comptable fenetre M-3..M (au lieu de M-2..M+1)"
```

---

### Task 2 : Colonne finale — pastille verdict → solde cumulé signé

**Files:**
- Modify: `index.html` — bloc `cch` dans `_rPilCompta` (~46345-46350)

- [ ] **Step 1 : remplacer le rendu de la colonne « Cumul (±) »**

Remplacer :
```js
    // Cumul : la pastille unique (avance bleu / retard rouge / à jour vert).
    const cch = verdict.cls === 'retard'
      ? `<span style="background:#fcebeb;color:#a32d2d;font-weight:700;padding:3px 9px;border-radius:8px;white-space:nowrap">↓ ${fmt(verdict.montant)}${verdict.nMois >= 1 ? ' · ' + verdict.nMois + ' m' : ''}</span>`
      : verdict.cls === 'avance'
        ? `<span style="background:#e6f1fb;color:#185fa5;font-weight:700;padding:3px 9px;border-radius:8px;white-space:nowrap">↑ ${fmt(verdict.montant)}${verdict.nMois >= 1 ? ' · ' + verdict.nMois + ' m' : ''}</span>`
        : `<span style="background:#e1f5ee;color:#0f6e56;font-weight:700;padding:3px 9px;border-radius:8px;white-space:nowrap">✓ à jour</span>`;
```
par :
```js
    // Cumul : SOLDE SIGNÉ depuis le début du suivi (borné → fin du −63 050 € fantôme).
    // cum.cumul < 0 = retard (rouge), > 0 = avance (vert), ≈0 = à jour. Maquette validée.
    const _solde = Math.round((cum.cumul || 0) * 100) / 100;
    const _nM = verdict.nMois >= 1 ? ' · ' + verdict.nMois + ' m' : '';
    const cch = _solde < -0.5
      ? `<span style="background:#fcebeb;color:#a32d2d;font-weight:700;padding:3px 9px;border-radius:8px;white-space:nowrap" title="Retard cumulé depuis le début du suivi">− ${fmt(Math.abs(_solde))}${_nM}</span>`
      : _solde > 0.5
        ? `<span style="background:#e1f5ee;color:#0f6e56;font-weight:700;padding:3px 9px;border-radius:8px;white-space:nowrap" title="Avance cumulée depuis le début du suivi">+ ${fmt(_solde)}</span>`
        : `<span style="background:#e1f5ee;color:#0f6e56;font-weight:700;padding:3px 9px;border-radius:8px;white-space:nowrap">✓ à jour</span>`;
```

- [ ] **Step 2 : vérifier la syntaxe inline**

Run: `node scripts/check-inline-js.mjs`
Expected: `Inline JS blocks valid : 5 | errors : 0`

- [ ] **Step 3 : commit**

```bash
git add index.html
git commit -m "REFONTE-PILOTAGE B0 : colonne Cumul = solde signe (au lieu de pastille verdict)"
```

---

### Task 3 : Restaurer le bouton « Mettre à jour les loyers »

**Files:**
- Modify: `index.html` — panneau `#tp-pil-compta` (~721) + fonction `_pilOpenBulkMajIrl` (vérif, ~46389)

- [ ] **Step 1 : vérifier que `_pilOpenBulkMajIrl()` est fonctionnelle**

Lire `_pilOpenBulkMajIrl` (~46389) en entier. Confirmer qu'elle ouvre bien une modale de révision IRL groupée (sélection `_pilSelectedRefs` OU tous les baux filtrés) et n'appelle aucune fonction supprimée. Si un symbole manque, le noter et corriger dans ce step avant de câbler le bouton.

- [ ] **Step 2 : ajouter la barre d'action dans le panneau compta**

Remplacer :
```html
      <!-- Sous-panneau Compta -->
      <div class="tab-panel act" id="tp-pil-compta">
        <div class="tbl-wrap"><table class="tbl" id="pil-compta-tbl">
```
par :
```html
      <!-- Sous-panneau Compta -->
      <div class="tab-panel act" id="tp-pil-compta">
        <div class="flex-c mb12" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn bs" onclick="_pilOpenBulkMajIrl()" title="Réviser le loyer (IRL) des baux cochés — ou de tous les baux filtrés si aucun coché" style="font-size:12.5px">🔄 Mettre à jour les loyers</button>
        </div>
        <div class="tbl-wrap"><table class="tbl" id="pil-compta-tbl">
```

- [ ] **Step 3 : mettre à jour le commentaire de dépréciation (~696)**

Remplacer :
```html
          <!-- v15.21 : bouton "Mettre à jour les loyers" retiré (user : « quel est l'utilité ? »). La révision IRL reste accessible via l'onglet Révision IRL et au cas par cas dans chaque bail. Fonction _pilOpenBulkMajIrl conservée mais @deprecated. -->
```
par :
```html
          <!-- REFONTE-PILOTAGE B0 : bouton « Mettre à jour les loyers » RESTAURÉ dans le panneau Compta (#tp-pil-compta), câblé sur _pilOpenBulkMajIrl(). -->
```

- [ ] **Step 4 : retirer le tag @deprecated de `_pilOpenBulkMajIrl` (~46386)**

Remplacer le commentaire d'en-tête :
```js
// ─── Phase 2 : bulk update IRL ──────────────────────────────────────────────
// @deprecated v15.21 — bouton « Mettre à jour les loyers » retiré du Pilotage
// (user : « quel est l'utilité ? »). La révision IRL passe par l'onglet Révision
// IRL et au cas par cas par bail. Fonction conservée (au cas où on rebascule).
function _pilOpenBulkMajIrl() {
```
par :
```js
// ─── Bulk update IRL (RESTAURÉ REFONTE-PILOTAGE B0) ─────────────────────────
// Révise le loyer (IRL) des baux cochés dans le Suivi comptable, ou de tous les
// baux filtrés si aucun n'est coché. Bouton dans le panneau #tp-pil-compta.
function _pilOpenBulkMajIrl() {
```

- [ ] **Step 5 : vérifier la syntaxe inline**

Run: `node scripts/check-inline-js.mjs`
Expected: `Inline JS blocks valid : 5 | errors : 0`

- [ ] **Step 6 : commit**

```bash
git add index.html
git commit -m "REFONTE-PILOTAGE B0 : bouton « Mettre a jour les loyers » restaure (panneau Compta)"
```

---

### Task 4 : Bump version + gates + audit + livraison

**Files:**
- Modify: `index.html` (version ×4), `sw.js` (CACHE_VER)

- [ ] **Step 1 : bump version au n° libre**

`git fetch origin -q` puis lire la version d'`origin/main` (`git show origin/main:index.html | grep IMMOTRACK_VERSION`). Bumper `index.html` (title, `<em>`, `IMMOTRACK_VERSION`, ligne diag) + `sw.js` (CACHE_VER) à **origin+1**.

- [ ] **Step 2 : gates complets**

Run:
```bash
node scripts/check-inline-js.mjs        # 5 | 0
node --check sw.js                       # OK
node -e '...' # scan noncaractères U+FFFE/FFFF/FDD0-FDEF sur index.html + sw.js → CLEAN
```
Si Vitest disponible dans le repo principal : suite complète verte (aucune régression — B0 ne touche aucune logique pure).

- [ ] **Step 3 : audit `superpowers:code-reviewer` du diff B0**

Dispatcher l'agent `superpowers:code-reviewer` sur `git diff origin/main...HEAD`. Vérifier : `cum.cumul` est bien le solde SIGNÉ borné (pas un montant absolu) ; le sens (négatif=retard) est cohérent avec le tri `_pilGetFilteredRows` ; pas de régression sur les cellules mensuelles (offset −3 partout) ; `_pilOpenBulkMajIrl` fonctionnelle. **PASS 0 bloquant requis avant push.**

- [ ] **Step 4 : livraison**

```bash
git fetch origin -q
git rebase --autostash origin/main   # renum version si collision
git push origin HEAD:main            # ou file .index-queue/QUEUE.md si session maître active
```

- [ ] **Step 5 : BACKLOG + smoke user**

Mettre à jour `BACKLOG.md` (statut B0 livré + version + commit). Signaler à l'utilisateur : smoke test github.io (Pilotage > Suivi comptable) — fenêtre M-3…M, colonne solde signé « − X € / + X € », bouton « Mettre à jour les loyers » ouvre la révision groupée.

---

## Self-review

- **Couverture spec §3.2** : solde signé ✅ (Task 2), fenêtre M-3…M ✅ (Task 1), bouton bulk restauré ✅ (Task 3). Conservation locataire/DG/cellules/tri : intact (non modifié).
- **Placeholders** : aucun — tout le code avant/après est explicite.
- **Cohérence des symboles** : `cum.cumul` (déjà destructuré dans le `.map`), `verdict.nMois` (déjà présent), `_pilOpenBulkMajIrl` (existant), `fmt`, `_DMC` — tous réels dans le fichier.
- **Hors périmètre B0** (→ phases suivantes) : suppression du stub Prélèvements (B2), matrice Conformité (B1), point d'entrée unique (B3), alignement DG/KPI (B4). Le bouton « 📅 Suivi des loyers » (ligne 695 → `_impayesOpenVue`) reste tel quel pour l'instant (unifié en B3).
