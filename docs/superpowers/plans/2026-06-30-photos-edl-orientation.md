# Photos EDL — orientation respectée + agrandies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les photos d'EDL dans leur orientation réelle (portrait ET paysage) et plus grandes, à l'écran et dans le PDF, sans jamais rogner — option A « contenir » (boîte carrée + `object-fit:contain`).

**Architecture:** Pur affichage, zéro changement de données/capture/stockage. Écran = une classe CSS commune `.edl-thumb` (carré, contain, responsive) remplaçant 4 styles inline. PDF = placement « contain » dans une cellule carrée, le ratio réel étant pré-mesuré au chargement des photos (le jsPDF inliné n'a PAS `getImageProperties`).

**Tech Stack:** Vanilla JS mono-fichier `index.html`, `css/main.css`, jsPDF inliné (`window.jspdf.jsPDF`), tests Vitest pour la seule logique pure extraite.

---

## File Structure

- **`css/main.css`** — ajout d'UNE règle `.edl-thumb` (+ media-query mobile). Additive, utilise les tokens existants.
- **`index.html`** — (a) 4 `<img>` de vignette EDL : style inline → `class="edl-thumb"` ; (b) `_photoCache` voisin `_photoRatio` + mesure des ratios dans `_edlPreloadPhotos` ; (c) helper `_pdfContain` ; (d) 3 blocs du générateur `generateEDLPdfNative` (pièces, clés, mobilier) repointés sur cellule carrée + contain ; (e) bump version.
- **`sw.js`** — bump `CACHE_VER`.

> ⚠️ **Coordination index.html** : le générateur PDF (~L28424) et le re-skin (autre session) touchent index.html. Rebaser sur `origin/main` avant push, FF, re-bump si collision (cf. protocole habituel). Les lignes ci-dessous dérivent ; **ancrer chaque edit sur la chaîne exacte**, pas sur le numéro.

---

### Task 1: Classe CSS `.edl-thumb` (écran)

**Files:**
- Modify: `css/main.css` (append en fin de fichier)

- [ ] **Step 1: Ajouter la règle CSS**

Append à la fin de `css/main.css` :

```css
/* ── Vignettes photos EDL (orientation respectée + agrandies, option A « contenir ») ──
   Carré = surface égale portrait/paysage ; object-fit:contain = photo entière, jamais rognée.
   Remplace les anciens styles inline 48×38 / 38×30 / 48×48 + object-fit:cover. */
.edl-thumb{
  width:96px; height:96px;
  object-fit:contain;
  background:var(--bg);
  border:1px solid var(--bor);
  border-radius:6px;
  cursor:pointer;
  display:block;
}
@media (max-width:640px){ .edl-thumb{ width:72px; height:72px; } }
```

- [ ] **Step 2: Vérifier que les tokens existent**

Run: `grep -nE "^\s*--bg\s*:|^\s*--bor\s*:" css/main.css | head`
Expected: au moins une définition de `--bg` et `--bor` (sinon, remplacer `var(--bg)` par `var(--sur)` et `var(--bor)` par `#e2e5ea`).

- [ ] **Step 3: Commit**

```bash
git add css/main.css
git commit -m "Photos EDL : classe .edl-thumb (carre contain responsive)"
```

---

### Task 2: Écran — 4 vignettes utilisent `.edl-thumb`

**Files:**
- Modify: `index.html` (4 `<img>` : pièces, compteurs, clés, mobilier)

> Chaque `<img>` garde `src`, `onclick`, `title`/`alt` ; seul `style="…"` devient `class="edl-thumb"`.

- [ ] **Step 1: Pièces (éléments)** — remplacer

```
<img src="${_photoCache[ph.idbKey]||ph.data||''}" style="width:48px;height:38px;object-fit:cover;border-radius:3px;border:1px solid var(--bor);cursor:pointer" onclick="edlViewPhoto(${pi},${ei},'${side}',${phi})" title="${escHtml(ph.name||'')}${ph._source?' ['+ph._source+' '+fd(ph._sourceDate)+']':''}">
```

par

```
<img src="${_photoCache[ph.idbKey]||ph.data||''}" class="edl-thumb" onclick="edlViewPhoto(${pi},${ei},'${side}',${phi})" title="${escHtml(ph.name||'')}${ph._source?' ['+ph._source+' '+fd(ph._sourceDate)+']':''}">
```

- [ ] **Step 2: Clés** — remplacer

```
<img src="${_photoCache[ph.idbKey]||ph.data||''}" style="width:38px;height:30px;object-fit:cover;border-radius:3px;border:1px solid var(--bor);cursor:pointer" onclick="edlCleViewPhoto(${i},${phi},'${side}')" title="${escHtml(ph.name||'')}">
```

par

```
<img src="${_photoCache[ph.idbKey]||ph.data||''}" class="edl-thumb" onclick="edlCleViewPhoto(${i},${phi},'${side}')" title="${escHtml(ph.name||'')}">
```

- [ ] **Step 3: Compteurs + DAAF** — remplacer

```
<img src="${_photoCache[ph.idbKey]||ph.data||''}" style="width:38px;height:30px;object-fit:cover;border-radius:3px;border:1px solid var(--bor);cursor:pointer" onclick="edlCptViewPhoto('${key}',${phi})" title="${escHtml(ph.name||'')}">
```

par

```
<img src="${_photoCache[ph.idbKey]||ph.data||''}" class="edl-thumb" onclick="edlCptViewPhoto('${key}',${phi})" title="${escHtml(ph.name||'')}">
```

- [ ] **Step 4: Mobilier** — remplacer (chaîne concaténée, guillemets simples)

```
'<img src="' + escHtml(_photoCache[ph.idbKey] || '') + '" alt="" onclick="edlMobViewPhoto(' + idx + ',\'' + side + '\',' + phi + ')" style="width:48px;height:48px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #ddd;display:block">'
```

par

```
'<img src="' + escHtml(_photoCache[ph.idbKey] || '') + '" alt="" class="edl-thumb" onclick="edlMobViewPhoto(' + idx + ',\'' + side + '\',' + phi + ')">'
```

- [ ] **Step 5: Vérifier qu'il ne reste aucun `object-fit:cover` sur une vignette EDL**

Run: `grep -nE "object-fit:cover" index.html | grep -iE "edlView|edlCle|edlCpt|edlMob"`
Expected: aucune ligne (les 4 sites sont migrés).

- [ ] **Step 6: Syntaxe JS inline**

Run: `node scripts/check-inline-js.mjs`
Expected: `Inline JS blocks valid : 5 | errors : 0`

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Photos EDL : 4 vignettes (pieces/cles/compteurs/mobilier) -> .edl-thumb"
```

---

### Task 3: PDF — infrastructure ratio (le jsPDF inliné n'a pas getImageProperties)

**Files:**
- Modify: `index.html` (`_photoCache` decl, `_edlPreloadPhotos`, nouveau helper `_pdfContain`)

> Le générateur PDF a besoin du ratio réel de chaque photo pour la « contenir » sans la déformer. On le pré-mesure au chargement (les dataURL sont déjà décodées dans `_photoCache`).

- [ ] **Step 1: Déclarer le cache de ratios** — sous la déclaration de `_photoCache`

Remplacer :

```
let _photoCache={}; // idbKey → dataURL (cache mémoire, reconstruit à chaque ouverture EDL)
```

par :

```
let _photoCache={}; // idbKey → dataURL (cache mémoire, reconstruit à chaque ouverture EDL)
let _photoRatio={}; // idbKey → largeur/hauteur réelle (pour « contenir » dans le PDF sans déformer)
```

- [ ] **Step 2: Mesurer les ratios à la fin de `_edlPreloadPhotos`** — juste avant l'accolade fermante de la fonction (après le bloc Étape 2 cloud, ligne `}` finale de `_edlPreloadPhotos`)

Insérer, avant le `}` qui ferme `async function _edlPreloadPhotos(edlRec){ … }` :

```javascript
  // Étape 3 : mesurer le ratio réel (w/h) de chaque photo en cache → placement « contain » dans le PDF.
  await Promise.all(allPhotos.map(ph => new Promise(res => {
    const k = ph.idbKey; const src = _photoCache[k];
    if (!k || !src || _photoRatio[k]) return res();
    const im = new Image();
    im.onload = () => { if (im.naturalWidth && im.naturalHeight) _photoRatio[k] = im.naturalWidth / im.naturalHeight; res(); };
    im.onerror = () => res();
    im.src = src;
  })));
```

- [ ] **Step 3: Ajouter le helper `_pdfContain`** — juste avant `async function generateEDLPdfNative(edl) {`

```javascript
// Place une photo de ratio donné DANS une cellule carrée `cell` (mm) sans la déformer (contain),
// centrée. ratio = largeur/hauteur. Repli plein si ratio inconnu (ne jamais planter le PDF).
function _pdfContain(ratio, cell){
  if (!ratio || !isFinite(ratio) || ratio <= 0) return { dw: cell, dh: cell, dx: 0, dy: 0 };
  let dw = cell, dh = cell;
  if (ratio >= 1) dh = cell / ratio; else dw = cell * ratio;
  return { dw, dh, dx: (cell - dw) / 2, dy: (cell - dh) / 2 };
}
```

- [ ] **Step 4: Syntaxe JS inline**

Run: `node scripts/check-inline-js.mjs`
Expected: `Inline JS blocks valid : 5 | errors : 0`

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Photos EDL PDF : pre-mesure ratio (_photoRatio) + helper _pdfContain"
```

---

### Task 4: PDF — pièces & clés en cellule carrée 55 mm, 3/ligne, contain

**Files:**
- Modify: `index.html` (bloc photos pièces + bloc photos clés de `generateEDLPdfNative`)

- [ ] **Step 1: Pièces** — remplacer le bloc

```javascript
      const PHOTO_W = 35, PHOTO_H = 26, GAP = 3;
      const perRow = Math.floor((CW + GAP) / (PHOTO_W + GAP));
      let col = 0;
      for (const {ph, side, elem} of piecePhotos) {
        const src = _photoCache[ph.idbKey] || ph.data;
        if (!src) continue;
        const x = M + col * (PHOTO_W + GAP);
        if (col === 0) y = newPageIfNeeded(y, PHOTO_H + 6);
        try {
          pdf.addImage(src, 'JPEG', x, y, PHOTO_W, PHOTO_H);
          pdf.setFont('helvetica','normal').setFontSize(6).setTextColor(120);
          pdf.text(`${elem.slice(0,20)} (${side})`, x, y+PHOTO_H+2.5, {maxWidth: PHOTO_W});
        } catch(e) { console.warn('[edl pdf] addImage fail', e); }
        col++;
        if (col >= perRow) {
          col = 0;
          y += PHOTO_H + 6;
        }
      }
      if (col > 0) y += PHOTO_H + 6;
```

par

```javascript
      const CELL = 55, GAP = 4;
      const perRow = Math.floor((CW + GAP) / (CELL + GAP)); // 3
      let col = 0;
      for (const {ph, side, elem} of piecePhotos) {
        const src = _photoCache[ph.idbKey] || ph.data;
        if (!src) continue;
        const x = M + col * (CELL + GAP);
        if (col === 0) y = newPageIfNeeded(y, CELL + 6);
        try {
          const f = _pdfContain(_photoRatio[ph.idbKey], CELL);
          pdf.addImage(src, 'JPEG', x + f.dx, y + f.dy, f.dw, f.dh);
          pdf.setFont('helvetica','normal').setFontSize(6).setTextColor(120);
          pdf.text(`${elem.slice(0,20)} (${side})`, x, y+CELL+2.5, {maxWidth: CELL});
        } catch(e) { console.warn('[edl pdf] addImage fail', e); }
        col++;
        if (col >= perRow) {
          col = 0;
          y += CELL + 6;
        }
      }
      if (col > 0) y += CELL + 6;
```

- [ ] **Step 2: Clés** — remplacer le bloc

```javascript
      const PHK_W = 35, PHK_H = 26, GAPK = 3;
      const perRowK = Math.floor((CW + GAPK) / (PHK_W + GAPK));
      let colK = 0;
      for (const {ph, type, side} of allClePhotos) {
        const src = _photoCache[ph.idbKey] || ph.data;
        if (!src) continue;
        const x = M + colK * (PHK_W + GAPK);
        if (colK === 0) y = newPageIfNeeded(y, PHK_H + 6);
        try {
          pdf.addImage(src, 'JPEG', x, y, PHK_W, PHK_H);
          pdf.setFont('helvetica','normal').setFontSize(6).setTextColor(120);
          pdf.text(`${(type||'').slice(0,18)} (${side})`, x, y+PHK_H+2.5, {maxWidth: PHK_W});
        } catch(e) { console.warn('[edl pdf] addImage clé fail', e); }
        colK++;
        if (colK >= perRowK) { colK = 0; y += PHK_H + 6; }
      }
      if (colK > 0) y += PHK_H + 6;
```

par

```javascript
      const PHK_CELL = 55, GAPK = 4;
      const perRowK = Math.floor((CW + GAPK) / (PHK_CELL + GAPK)); // 3
      let colK = 0;
      for (const {ph, type, side} of allClePhotos) {
        const src = _photoCache[ph.idbKey] || ph.data;
        if (!src) continue;
        const x = M + colK * (PHK_CELL + GAPK);
        if (colK === 0) y = newPageIfNeeded(y, PHK_CELL + 6);
        try {
          const f = _pdfContain(_photoRatio[ph.idbKey], PHK_CELL);
          pdf.addImage(src, 'JPEG', x + f.dx, y + f.dy, f.dw, f.dh);
          pdf.setFont('helvetica','normal').setFontSize(6).setTextColor(120);
          pdf.text(`${(type||'').slice(0,18)} (${side})`, x, y+PHK_CELL+2.5, {maxWidth: PHK_CELL});
        } catch(e) { console.warn('[edl pdf] addImage clé fail', e); }
        colK++;
        if (colK >= perRowK) { colK = 0; y += PHK_CELL + 6; }
      }
      if (colK > 0) y += PHK_CELL + 6;
```

- [ ] **Step 3: Syntaxe JS inline**

Run: `node scripts/check-inline-js.mjs`
Expected: `Inline JS blocks valid : 5 | errors : 0`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Photos EDL PDF : pieces & cles en cellule carree 55mm 3/ligne (contain, ratio respecte)"
```

---

### Task 5: PDF — mobilier en cellule carrée ~30 mm, 2/ligne par côté, contain

**Files:**
- Modify: `index.html` (bloc photos mobilier de `generateEDLPdfNative`)

> Disposition Entrée gauche / Sortie droite conservée. Demi-largeur ~85 mm → 2 cellules de 30 mm par rangée.

- [ ] **Step 1: Hauteur réservée** — remplacer

```javascript
        const _maxPh = Math.max(phE.length, phS.length);
        const _rowsNeeded = Math.ceil(_maxPh / 3);
        const _heightNeeded = 5 + 3 + _rowsNeeded * (22 + 2) + 4 + 2; // titre + label + rangées photos + gap
```

par

```javascript
        const _maxPh = Math.max(phE.length, phS.length);
        const _rowsNeeded = Math.ceil(_maxPh / 2); // 2 photos par ligne par côté
        const _heightNeeded = 5 + 3 + _rowsNeeded * (30 + 3) + 4 + 2; // titre + label + rangées photos + gap
```

- [ ] **Step 2: Dessin des vignettes** — remplacer

```javascript
          const thumbW = 28, thumbH = 22, gap = 2, perRow = 3;
          for (let pi = 0; pi < photos.length; pi++) {
            const ph = photos[pi];
            if (!ph || !ph.idbKey) continue;
            const b64 = _photoCache[ph.idbKey] || (await _idbGet(ph.idbKey).catch(() => null));
            if (!b64) continue;
            _photoCache[ph.idbKey] = b64;
            const col = pi % perRow, row = Math.floor(pi / perRow);
            const px = xStart + col * (thumbW + gap), pyt = py + row * (thumbH + gap);
            try { pdf.addImage(b64, 'JPEG', px, pyt, thumbW, thumbH); } catch(e) {}
          }
```

par

```javascript
          const CELLM = 30, gap = 3, perRow = 2;
          for (let pi = 0; pi < photos.length; pi++) {
            const ph = photos[pi];
            if (!ph || !ph.idbKey) continue;
            const b64 = _photoCache[ph.idbKey] || (await _idbGet(ph.idbKey).catch(() => null));
            if (!b64) continue;
            _photoCache[ph.idbKey] = b64;
            const col = pi % perRow, row = Math.floor(pi / perRow);
            const px = xStart + col * (CELLM + gap), pyt = py + row * (CELLM + gap);
            const f = _pdfContain(_photoRatio[ph.idbKey], CELLM);
            try { pdf.addImage(b64, 'JPEG', px + f.dx, pyt + f.dy, f.dw, f.dh); } catch(e) {}
          }
```

- [ ] **Step 3: Avance Y finale** — remplacer

```javascript
        const maxPhotos = Math.max(phE.length, phS.length);
        const rowsNeeded = Math.ceil(maxPhotos / 3);
        y += 3 + rowsNeeded * (22 + 2) + 4;
```

par

```javascript
        const maxPhotos = Math.max(phE.length, phS.length);
        const rowsNeeded = Math.ceil(maxPhotos / 2);
        y += 3 + rowsNeeded * (30 + 3) + 4;
```

- [ ] **Step 4: Vérifier qu'il ne reste aucune dimension photo figée dans le PDF EDL**

Run: `grep -nE "PHOTO_W|PHOTO_H|PHK_W|PHK_H|thumbW|thumbH" index.html`
Expected: aucune ligne dans `generateEDLPdfNative` (toutes remplacées par CELL/PHK_CELL/CELLM + `_pdfContain`).

- [ ] **Step 5: Syntaxe JS inline**

Run: `node scripts/check-inline-js.mjs`
Expected: `Inline JS blocks valid : 5 | errors : 0`

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Photos EDL PDF : mobilier en cellule carree 30mm 2/ligne par cote (contain)"
```

---

### Task 6: Bump version + vérification finale + audit

**Files:**
- Modify: `index.html` (4 occurrences de version), `sw.js` (`CACHE_VER`)

- [ ] **Step 1: Repérer la version courante**

Run: `grep -m1 "IMMOTRACK_VERSION" index.html`
Note la version `15.X`. La cible = `15.(X+1)`.

- [ ] **Step 2: Bumper index.html (4 occurrences) + sw.js**

```bash
# Remplacer 15.OLD par 15.NEW (les 4 occurrences index.html + CACHE_VER sw.js)
sed -i 's/15\.OLD/15.NEW/g' index.html
sed -i 's/immotrack-v15\.OLD/immotrack-v15.NEW/' sw.js
```
Expected après : `grep -c "15\.NEW" index.html` → `4` ; `grep -c "15\.OLD" index.html` → `0`.

- [ ] **Step 3: Vérification syntaxe + suite**

Run: `node scripts/check-inline-js.mjs`
Expected: `Inline JS blocks valid : 5 | errors : 0`

Run: `npx vitest run`
Expected: suite verte (les 3 échecs pré-existants `legal-2044`×2 + `bank-import` hors périmètre ; aucun nouvel échec).

- [ ] **Step 4: Commit**

```bash
git add index.html sw.js
git commit -m "Photos EDL : bump v15.NEW (orientation+taille livre)"
```

- [ ] **Step 5: Audit code-reviewer (OBLIGATOIRE — touche le générateur PDF légal)**

Dispatcher un agent `superpowers:code-reviewer` sur le diff complet de la branche : vérifier (a) les 4 vignettes écran respectent l'orientation sans rogner, responsive ; (b) `_pdfContain` correct (centrage, repli ratio inconnu) ; (c) `_photoRatio` bien peuplé avant la génération PDF (preload `await` avant `generateEDLPdfNative`) ; (d) pagination `newPageIfNeeded` cohérente avec les nouvelles hauteurs (CELL+6, mobilier 30+3) ; (e) aucune régression sur le reste du PDF ; (f) aucune donnée/photo modifiée. Corriger les findings, re-auditer jusqu'à PASS.

- [ ] **Step 6: Vérification visuelle (sur l'app déployée — le fetch cloud des photos marche en prod)**

Après push + déploiement github.io :
- Écran : ouvrir un EDL avec photos **portrait ET paysage** → vignettes ~2× plus grandes, orientation correcte, rien rogné, en **PC / tablette / mobile** (les 4 emplacements). Clic = lightbox OK.
- PDF : générer un **vrai PDF EDL** mixte → cellules ~55 mm 3/ligne (pièces/clés), mobilier 30 mm, ratios respectés, débordement propre sur 2ᵉ page.

- [ ] **Step 7: Intégration**

Rebaser sur `origin/main`, push FF (re-bump si collision de version), cf. protocole index.html habituel.

---

## Notes de vérification (TDD)

La logique modifiée est du **rendu DOM/CSS et de la génération PDF inline** dans `index.html` — non couverte par Vitest dans ce projet (seuls les modules `js/core/*.js` le sont). La seule logique potentiellement pure (`_pdfContain`, ~4 lignes de calcul « contain ») reste inline car fortement couplée au générateur PDF ; elle est couverte par la **génération d'un vrai PDF** (Step 6) + l'**audit code-reviewer** (Step 5). Garde-fous intégrés : `_pdfContain` ne plante jamais (repli plein si ratio inconnu), `addImage` reste dans `try/catch`, le préchargement échoué n'avorte pas la génération.
