# Bug 1 — Déposer les documents de diagnostic avant d'enregistrer le bien — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de déposer les PDF de diagnostic (DPE, CREP, ERP…) dans l'onglet Diagnostics d'un bien **pas encore enregistré** : lecture auto immédiate en mémoire, fichiers joints automatiquement à l'enregistrement.

**Architecture:** Pattern « buffer + flush » (déjà utilisé par l'import d'acte) : au dépôt sur un bien neuf, on bufferise le dataURL dans `_logDiagDraft.pendingDocs` (mémoire, jamais persisté seul) et on lance la lecture auto ; à `saveParamLog`, on rattache via `_attachmentSaveForEntity` (IDB-first + Drive en fond). Bien déjà enregistré = chemin actuel inchangé.

**Tech Stack:** Vanilla JS inline dans `index.html` (fonctions `_logDiag*`), `index-test.html` (sandbox, parité), `sw.js`. Pas d'extraction de module (on suit le style inline existant de l'onglet Diagnostics). Vérif : `scripts/check-inline-js.mjs` + grep + test visuel navigateur + audit `superpowers:code-reviewer`.

**Spec:** `docs/superpowers/specs/2026-06-10-bug1-depot-diagnostics-avant-enregistrement-design.md`

---

## File Structure

Tout le code vit dans **`index-test.html`** (sandbox, développement) puis est porté à l'identique dans **`index.html`** (prod). Aucun nouveau fichier. Fonctions touchées (localisées par `grep`, pas par n° de ligne — l'arbre bouge) :

| Fonction | Type | Rôle |
|---|---|---|
| `_logDiagInitDraft` | modif | ajoute `pendingDocs: []` au brouillon |
| `_logDiagOnPdfUploaded` | modif | accepte un buffer `{tmpId,dataB64,name}` OU un doc persisté |
| `_logDiagStageFile` | **nouveau** | dépôt sur bien neuf : bufferise + lecture auto |
| `_logDiagRemovePending` | **nouveau** | retire un fichier en attente |
| `_logDiagRenderTab` | modif | zone toujours visible ; bien neuf → staging + liste pendingDocs |
| `_logDiagDetectBannerHtml` | modif | reconnaît les `tmpId` en attente |
| `saveParamLog` | modif | flush des pendingDocs après save |
| `_closeLogGuarded` | **nouveau** | confirm si fermeture avec fichiers en attente |
| HTML `ov-log` ✕ + « Annuler » | modif | `closeM('ov-log')` → `_closeLogGuarded()` |

---

## Task 0: Worktree d'implémentation

**Files:** aucun (setup git).

- [ ] **Step 1: Créer le worktree off `origin/main` v15.268**

```bash
cd "C:/Users/Did_K/Desktop/Immo"
git fetch origin --quiet
git worktree add -b bug1-depot-avant-save "C:/Users/Did_K/Desktop/Immo-bug1" origin/main
cd "C:/Users/Did_K/Desktop/Immo-bug1"
git show origin/main:index.html | grep -m1 -oE "<title>ImmoTrack v15\.[0-9]+"   # doit afficher ≥ v15.268
```

Expected: worktree créé ; version ≥ 15.268. **Tout le reste se fait dans `C:/Users/Did_K/Desktop/Immo-bug1`.**

---

## Task 1: `pendingDocs` au modèle (sandbox)

**Files:** Modify `index-test.html` (fonction `_logDiagInitDraft`).

- [ ] **Step 1: Ajouter `pendingDocs: []` au brouillon**

Repérer la construction de `_logDiagDraft` dans `_logDiagInitDraft` :
```bash
grep -n "logId:  log ? (log.id != null" index-test.html
```
Dans l'objet `_logDiagDraft = { ... }`, ajouter la propriété juste après `logRef:` :
```js
    logRef: log ? (log.ref || '') : '',
    // Bug1 — PDF de diagnostic déposés sur un bien NEUF (pas encore d'id), bufferisés
    // jusqu'à l'enregistrement (flush dans saveParamLog). Toujours réinitialisé à l'ouverture.
    pendingDocs: [],
```

- [ ] **Step 2: Vérifier la syntaxe**

```bash
node scripts/check-inline-js.mjs
```
Expected: `Inline JS blocks valid : 5 | errors : 0`

- [ ] **Step 3: Commit**

```bash
git add index-test.html
git commit -m "feat(bug1): pendingDocs au brouillon diagnostics (sandbox)"
```

---

## Task 2: Généraliser `_logDiagOnPdfUploaded` (buffer OU doc persisté)

**Files:** Modify `index-test.html` (fonction `_logDiagOnPdfUploaded`).

- [ ] **Step 1: Remplacer le préambule de la fonction**

Repérer :
```bash
grep -n "async function _logDiagOnPdfUploaded" index-test.html
```
Remplacer le début (de `if (!doc...` jusqu'à la ligne `_logDiagApplySuggestions(...)` incluse) pour accepter les deux sources. Ancien :
```js
async function _logDiagOnPdfUploaded(doc) {
  if (!doc || !_logDiagDraft) return;
  try {
    const dataUrl = await _attachmentLoadBinary(doc);
    if (!dataUrl) return; // binaire indisponible : on n'affiche rien (le doc reste listé)
    await _ensurePdfjsLoaded();
    const text = await _logDiagExtractPdfText(dataUrl);
    const scan = _logDiagScanText(text);
    _logDiagDocScans[doc.id] = {
      name: doc.originalName || doc.name || 'document.pdf',
      textLen: scan.textLen, numeroDpe: scan.numeroDpe, coverage: scan.coverage
    };
    const nbSug = _logDiagApplySuggestions(text, scan.coverage, _logDiagDocScans[doc.id].name);
```
Nouveau :
```js
async function _logDiagOnPdfUploaded(src) {
  if (!src || !_logDiagDraft) return;
  try {
    // Bug1 — src peut être un doc PERSISTÉ (a .id + idbKey) ou un BUFFER en attente (a .dataB64 + .tmpId)
    const scanKey = (src.dataB64 != null) ? src.tmpId : src.id;
    const dataUrl = (src.dataB64 != null) ? src.dataB64 : await _attachmentLoadBinary(src);
    if (!dataUrl) return; // binaire indisponible : on n'affiche rien
    await _ensurePdfjsLoaded();
    const text = await _logDiagExtractPdfText(dataUrl);
    const scan = _logDiagScanText(text);
    _logDiagDocScans[scanKey] = {
      name: src.originalName || src.name || 'document.pdf',
      textLen: scan.textLen, numeroDpe: scan.numeroDpe, coverage: scan.coverage
    };
    const nbSug = _logDiagApplySuggestions(text, scan.coverage, _logDiagDocScans[scanKey].name);
```
Le reste de la fonction (détection N° DPE, ADEME, toasts, catch) est **inchangé** (n'utilise plus `doc.id` ailleurs).

- [ ] **Step 2: Vérifier qu'aucune autre référence à `doc.` ne subsiste dans la fonction**

```bash
awk '/async function _logDiagOnPdfUploaded/,/^}/' index-test.html | grep -n "doc\." || echo "OK aucune ref doc. résiduelle"
```
Expected: `OK aucune ref doc. résiduelle`

- [ ] **Step 3: Vérifier le site d'appel existant (bien existant)**

Le seul appel actuel est dans `_handleAttachmentUpload` : `_logDiagOnPdfUploaded(doc)` où `doc` est persisté (a `.id`, pas de `.dataB64`) → `scanKey = doc.id`, `dataUrl = _attachmentLoadBinary(doc)`. Comportement identique.
```bash
grep -n "_logDiagOnPdfUploaded(doc)" index-test.html
```
Expected: 1 occurrence (chemin bien existant, inchangé).

- [ ] **Step 4: Syntaxe + commit**

```bash
node scripts/check-inline-js.mjs   # 5 | 0
git add index-test.html
git commit -m "feat(bug1): _logDiagOnPdfUploaded accepte un buffer non persisté (sandbox)"
```

---

## Task 3: `_logDiagStageFile` + `_logDiagRemovePending` (nouveau)

**Files:** Modify `index-test.html` (insérer après `_logDiagOnPdfUploaded`).

- [ ] **Step 1: Ajouter les deux fonctions** (juste après la fin de `_logDiagOnPdfUploaded`)

```js
/** Bug1 — dépôt d'un fichier sur un bien NEUF (pas encore enregistré) : valide, bufferise
 *  dans le brouillon (jamais persisté seul), lance la lecture auto, re-render. */
async function _logDiagStageFile(input) {
  const f = input.files && input.files[0];
  if (!f || !_logDiagDraft) return;
  const maxSize = (typeof ATTACHMENT_DEFAULT_MAX_SIZE !== 'undefined') ? ATTACHMENT_DEFAULT_MAX_SIZE : 10*1024*1024;
  if (f.size > maxSize) {
    showToast('Fichier trop lourd : ' + (f.size/1024/1024).toFixed(2) + ' MB (max ' + (maxSize/1024/1024) + ' MB)', 'err', 6000);
    input.value = ''; return;
  }
  try {
    const dataB64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = () => reject(new Error('Lecture fichier échouée'));
      r.readAsDataURL(f);
    });
    const tmpId = 'pend_' + nid();
    if (!_logDiagDraft.pendingDocs) _logDiagDraft.pendingDocs = [];
    _logDiagDraft.pendingDocs.push({ tmpId, name: f.name, mime: f.type, size: f.size, dataB64 });
    input.value = '';
    showToast('📎 « ' + f.name + ' » prêt — joint à l\'enregistrement du bien.', 'ok', 3000);
    _logDiagRenderTab();
    if (f.type === 'application/pdf' && typeof _logDiagOnPdfUploaded === 'function') {
      _logDiagOnPdfUploaded({ tmpId, name: f.name, dataB64 }); // lecture auto (fire-and-forget)
    }
  } catch(e) {
    console.error('[_logDiagStageFile] échec', e);
    showToast('Échec lecture du fichier : ' + (e.message || 'erreur'), 'err', 6000);
  }
}

/** Bug1 — retire un fichier en attente (rien à supprimer côté Drive/IDB : pas encore persisté). */
function _logDiagRemovePending(tmpId) {
  if (!_logDiagDraft || !_logDiagDraft.pendingDocs) return;
  _logDiagDraft.pendingDocs = _logDiagDraft.pendingDocs.filter(d => d.tmpId !== tmpId);
  if (_logDiagDocScans) delete _logDiagDocScans[tmpId];
  _logDiagRenderTab();
}
```

- [ ] **Step 2: Syntaxe + symboles + commit**

```bash
node scripts/check-inline-js.mjs   # 5 | 0
grep -c "function _logDiagStageFile\|function _logDiagRemovePending" index-test.html   # 2
git add index-test.html
git commit -m "feat(bug1): _logDiagStageFile + _logDiagRemovePending (sandbox)"
```

---

## Task 4: `_logDiagRenderTab` — zone toujours visible + liste en attente

**Files:** Modify `index-test.html` (fonction `_logDiagRenderTab`, bloc `uploadHtml`).

- [ ] **Step 1: Remplacer le bloc `uploadHtml`**

Repérer :
```bash
grep -n "const logId  = _logDiagDraft.logId;" index-test.html
```
Remplacer tout le bloc `let uploadHtml; if(logId != null ...){...} else {...}` (la branche `else` = l'ancien message « Enregistre d'abord ») par :
```js
  const logId  = _logDiagDraft.logId;
  const logRef = _logDiagDraft.logRef || ref;
  let uploadHtml;
  if(logId != null && typeof _renderAttachmentSection === 'function') {
    // Bien existant : zone PJ persistée (inchangé)
    uploadHtml = `<div style="border:1px dashed var(--bor);border-radius:10px;padding:12px 14px;margin-bottom:14px;background:var(--sur2)">
      ${_renderAttachmentSection({ parentType:'logement', parentId:logId, parentRef:logRef, logRef:logRef, category:'documents', title:'📎 Documents de diagnostic', emptyText:'Dépose ici tes diagnostics — DPE, CREP (plomb), ERP, élec, gaz… (PDF ou image, 10 Mo max). Ils sont poussés sur Drive et proposés à l\'envoi avec le bail au locataire.' })}
      <div class="mu sm" style="font-size:10.5px;margin-top:8px;color:var(--t3);line-height:1.5">📨 Les PDF déposés sont stockés sur le Drive du logement (sous-dossier « Documents ») et proposés à l'envoi <b>avec le bail</b> au locataire. <em>🤖 Lecture auto : si le N° DPE figure dans le PDF, il est extrait et le DPE est récupéré via l'ADEME.</em></div>
    </div>`;
  } else {
    // Bug1 — bien NEUF : zone de staging (buffer + flush à l'enregistrement)
    const pend = _logDiagDraft.pendingDocs || [];
    const rows = pend.map(d => `
      <div class="att-item" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--sur);border:1px solid var(--bor);border-radius:6px">
        <span style="font-size:18px">${_attachmentIcon(d.mime)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escHtml(d.name)}">${escHtml(d.name)}</div>
          <div class="mu sm" style="font-size:11px">${_fmtSize(d.size)} · <span class="logdiag-sg-badge">⏳ à enregistrer</span></div>
        </div>
        <button type="button" class="btn br bb" onclick="_logDiagRemovePending('${String(d.tmpId).replace(/'/g,"\\'")}')" title="Retirer">✕</button>
      </div>`).join('');
    uploadHtml = `<div style="border:1px dashed var(--bor);border-radius:10px;padding:12px 14px;margin-bottom:14px;background:var(--sur2)">
      <div class="flex-b" style="align-items:center;margin-bottom:8px">
        <h4 style="margin:0;font-size:14px;color:var(--t1)">📎 Documents de diagnostic ${pend.length?`<span class="mu sm" style="font-weight:400">(${pend.length} en attente)</span>`:''}</h4>
        <label for="logdiag-stage-input" class="btn bs bb" style="cursor:pointer">+ Ajouter</label>
        <input type="file" id="logdiag-stage-input" accept="application/pdf,image/*" style="display:none" onchange="_logDiagStageFile(this)">
      </div>
      ${rows ? `<div class="att-list" style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${rows}</div>` : `<div class="logf-doc-empty" style="padding:12px;text-align:center;color:var(--t2);background:var(--sur);border-radius:6px">Dépose tes diagnostics — DPE, CREP, ERP, élec, gaz… (PDF ou image, 10 Mo max). Lus automatiquement et joints au bien à l'enregistrement.</div>`}
      <div class="mu sm" style="font-size:10.5px;margin-top:8px;color:var(--t3);line-height:1.5">📨 Joints au Drive du bien <b>à l'enregistrement</b>, proposés à l'envoi avec le bail. <em>🤖 Lecture auto : si le N° DPE figure dans le PDF, le DPE est récupéré via l'ADEME.</em></div>
    </div>`;
  }
```

- [ ] **Step 2: Syntaxe + commit**

```bash
node scripts/check-inline-js.mjs   # 5 | 0
git add index-test.html
git commit -m "feat(bug1): zone de dépôt visible + staging pour bien neuf (sandbox)"
```

---

## Task 5: Bandeau Détection reconnaît les fichiers en attente

**Files:** Modify `index-test.html` (fonction `_logDiagDetectBannerHtml`).

- [ ] **Step 1: Inclure les `tmpId` dans les ids « vivants »**

Repérer :
```bash
grep -n "const ids = Object.keys(scans).filter(id => live\[id\]);" index-test.html
```
Remplacer :
```js
  const live = (DB.documents || []).reduce((acc, d) => { if (d && !d._deleted) acc[d.id] = true; return acc; }, {});
  const ids = Object.keys(scans).filter(id => live[id]);
```
par :
```js
  const live = (DB.documents || []).reduce((acc, d) => { if (d && !d._deleted) acc[d.id] = true; return acc; }, {});
  // Bug1 — les scans des fichiers EN ATTENTE (bien neuf) ne sont pas encore dans DB.documents
  const pendLive = (_logDiagDraft && _logDiagDraft.pendingDocs || []).reduce((a, d) => { a[d.tmpId] = true; return a; }, {});
  const ids = Object.keys(scans).filter(id => live[id] || pendLive[id]);
```

- [ ] **Step 2: Syntaxe + commit**

```bash
node scripts/check-inline-js.mjs   # 5 | 0
git add index-test.html
git commit -m "feat(bug1): bandeau Détection reconnaît les fichiers en attente (sandbox)"
```

---

## Task 6: Flush des pendingDocs dans `saveParamLog`

**Files:** Modify `index-test.html` (fonction `saveParamLog`).

- [ ] **Step 1: Ajouter le flush à la fin de `saveParamLog`**

Repérer la dernière accolade de `saveParamLog` (juste après le bloc Drive `if (isNew) { _drvHookEnsureLogement(log); } else if ...`). Insérer **avant** le `}` final de la fonction :
```js
  // Bug1 — flush des PDF de diagnostic déposés sur un bien neuf (bufferisés dans le brouillon).
  // _attachmentSaveForEntity est IDB-first (binaire sûr immédiatement) + Drive en tâche de fond.
  (async () => {
    const pend = (typeof _logDiagDraft !== 'undefined' && _logDiagDraft && _logDiagDraft.pendingDocs)
      ? _logDiagDraft.pendingDocs.slice() : [];
    if (!pend.length) return;
    let ok = 0;
    for (const d of pend) {
      try {
        await _attachmentSaveForEntity(
          { type:'logement', id: log.id, ref: log.ref, logRef: log.ref, category:'documents' },
          { name: d.name, mime: d.mime, size: d.size, dataB64: d.dataB64 }
        );
        ok++;
      } catch(e) { console.error('[Bug1 flush PJ]', e); }
    }
    if (_logDiagDraft) _logDiagDraft.pendingDocs = [];
    try { saveDB(); } catch(e) {}
    if (ok < pend.length) showToast('⚠ ' + ok + '/' + pend.length + ' document(s) joint(s) — réessaie depuis la fiche pour le reste.', 'err', 7000);
    else showToast('📎 ' + ok + ' document' + (ok>1?'s':'') + ' joint' + (ok>1?'s':'') + ' au bien.', 'ok', 3000);
  })();
```

- [ ] **Step 2: Vérifier que le flush est bien DANS `saveParamLog`**

```bash
awk '/^function saveParamLog/,/^}/' index-test.html | grep -c "Bug1 — flush des PDF"   # 1
node scripts/check-inline-js.mjs   # 5 | 0
```

- [ ] **Step 3: Commit**

```bash
git add index-test.html
git commit -m "feat(bug1): flush des PDF en attente à l'enregistrement (sandbox)"
```

---

## Task 7: `_closeLogGuarded` + recâblage ✕/Annuler

**Files:** Modify `index-test.html` (nouvelle fonction + 2 attributs HTML `ov-log`).

- [ ] **Step 1: Ajouter `_closeLogGuarded`** (près de `saveParamLog` ou des helpers de la modale logement)

```js
/** Bug1 — fermeture de la modale logement : confirme si des PDF déposés non encore enregistrés
 *  seraient perdus. (Le chemin Enregistrer flush AVANT de fermer → pas concerné.) */
function _closeLogGuarded() {
  if (typeof _logDiagDraft !== 'undefined' && _logDiagDraft && _logDiagDraft.pendingDocs && _logDiagDraft.pendingDocs.length) {
    const n = _logDiagDraft.pendingDocs.length;
    const ok = confirm2(n + ' document' + (n>1?'s':'') + ' déposé' + (n>1?'s':'') + ' ne ser' + (n>1?'ont':'a') + ' pas enregistré' + (n>1?'s':'') + '.\nFermer quand même ?');
    if (!ok) return;
  }
  closeM('ov-log');
}
```

- [ ] **Step 2: Recâbler le ✕ et « Annuler » de `ov-log`**

```bash
grep -n 'onclick="closeM(.ov-log.)"' index-test.html
```
Pour le **✕** (dans `<div class="m-head">…<button class="m-close" onclick="closeM('ov-log')">✕</button>`) et le bouton **« Annuler »** (`<button class="btn bs" onclick="closeM('ov-log')">Annuler</button>`), remplacer `onclick="closeM('ov-log')"` par `onclick="_closeLogGuarded()"`. **Ne PAS** toucher les `closeM('ov-log')` à l'intérieur du JS (saveParamLog, delLog, flux après save) — eux doivent fermer sans confirm.

- [ ] **Step 3: Vérifier le recâblage**

```bash
grep -c 'onclick="_closeLogGuarded()"' index-test.html   # 2 (✕ + Annuler)
node scripts/check-inline-js.mjs   # 5 | 0
```

- [ ] **Step 4: Commit**

```bash
git add index-test.html
git commit -m "feat(bug1): confirm anti-perte à la fermeture (closeLogGuarded) (sandbox)"
```

---

## Task 8: Test visuel sandbox (vrai navigateur)

**Files:** aucun (validation).

- [ ] **Step 1: Ouvrir `index-test.html` dans un vrai navigateur** (pas la preview Claude), charger le dataset démo via le bouton manuel.

- [ ] **Step 2: Scénario bien NEUF** — Biens → + nouveau bien → onglet Diagnostics :
  - La zone « 📎 Documents de diagnostic » s'affiche (plus de message « Enregistre d'abord »).
  - Déposer un DPE PDF → toast « prêt », badge « ⏳ à enregistrer », bandeau 🤖 Détection apparaît, DPE pré-rempli (si N° + réseau).
  - ✕ sur un fichier → il disparaît.
  - **Annuler** avec un fichier en attente → confirm « … ne sera pas enregistré ». Annuler le confirm → reste ouvert.
  - Remplir réf + champs requis → **Enregistrer** → toast « X document(s) joint(s) ». Rouvrir le bien → onglet Diagnostics → les fichiers sont dans la zone persistée + DPE rempli.

- [ ] **Step 3: Non-régression bien EXISTANT** — ouvrir un bien déjà créé → onglet Diagnostics → dépôt persiste immédiatement (comportement actuel), pas de badge « ⏳ ».

- [ ] **Step 4: 3 formats (PC/tablette/téléphone) + light/dark** — la liste et le badge restent lisibles.

- [ ] **Step 5: STOP — validation user explicite** « ok ça marche » avant de porter en prod.

---

## Task 9: Port PROD (`index.html`) + bump version

**Files:** Modify `index.html` (mêmes changements qu'`index-test.html`), `sw.js`.

- [ ] **Step 1: Porter chaque changement** des Tasks 1–7 dans `index.html` (mêmes ancres `grep`). ⚠️ `index.html` a en plus `_closeBailWizardBg` etc., mais les fonctions `_logDiag*`, `saveParamLog`, `_renderAttachmentSection` et le HTML `ov-log` sont les mêmes. Le ✕/Annuler de `ov-log` en prod : mêmes `onclick="closeM('ov-log')"` → `_closeLogGuarded()`.

- [ ] **Step 2: Bump version** `15.268` → version libre suivante (vérifier `origin/main` au moment du port ; renuméroter si besoin). 4 spots `index.html` (`<title>`, `<em>`, landing `ImmoTrack vX`, `IMMOTRACK_VERSION`) + `sw.js` CACHE_VER.

- [ ] **Step 3: Vérifs parité + syntaxe**

```bash
node scripts/check-inline-js.mjs   # 5 | 0
node --check sw.js
grep -c "function _logDiagStageFile\|function _logDiagRemovePending\|function _closeLogGuarded" index.html   # 3
grep -c 'onclick="_closeLogGuarded()"' index.html   # 2
# parité : les blocs nouveaux doivent exister à l'identique dans les 2 fichiers
diff <(awk '/function _logDiagStageFile/,/^}/' index-test.html) <(awk '/function _logDiagStageFile/,/^}/' index.html) && echo "parité _logDiagStageFile OK"
```

- [ ] **Step 4: Commit**

```bash
git add index.html index-test.html sw.js
git commit -m "feat(bug1): port PROD — dépôt diagnostics avant enregistrement (vX.XXX)"
```

---

## Task 10: Audit `code-reviewer` + déploiement

**Files:** aucun (qualité + livraison).

- [ ] **Step 1: Audit obligatoire**

Dispatch agent `superpowers:code-reviewer` sur le diff prod (touche GED + Drive + `saveParamLog` = sensible). Corriger tout finding bloquant. Critères : pas de fuite mémoire (dataB64 vidé au flush), pas d'orphelin (annulation), flush idempotent, échec partiel géré, non-régression bien existant, sanitation `tmpId`/nom.

- [ ] **Step 2: Vitest** (non-régression globale)

```bash
npm run test:run   # vert (les modules ne changent pas)
```

- [ ] **Step 3: Inscrire en file + intégrer** selon `docs/INDEX-COMMIT-PROTOCOL.md` (push branche, FF/cherry-pick sur `main` après feu vert user), MAJ `.index-queue/QUEUE.md` + `BACKLOG.md`.

- [ ] **Step 4: Commit du spec + plan** (non commités jusqu'ici) dans le même lot.

```bash
git add docs/superpowers/specs/2026-06-10-bug1-depot-diagnostics-avant-enregistrement-design.md docs/superpowers/plans/2026-06-10-bug1-depot-diagnostics-avant-enregistrement.md
git commit -m "docs(bug1): spec + plan dépôt diagnostics avant enregistrement"
```

- [ ] **Step 5: Déploiement + test user prod** — purge SW, vérifier le scénario bien neuf sur le déployé.

- [ ] **Step 6: Cleanup worktree** (`git worktree remove` + `git worktree prune` + `rm -rf`).

---

## Self-Review (couverture spec)

- §2 Approche A → Tasks 1,3,4,6 ✓
- §3.1 pendingDocs → Task 1 ✓
- §3.2 zone toujours visible + wiring → Task 4 ✓
- §3.3 `_logDiagStageFile` → Task 3 ✓
- §3.4 `_logDiagOnPdfUploaded` généralisé → Task 2 ✓
- §3.5 banc détection tmpId → Task 5 ✓
- §3.6 `_logDiagRemovePending` → Task 3 ✓
- §3.7 flush saveParamLog → Task 6 ✓
- §3.8 `_closeLogGuarded` + recâblage → Task 7 ✓
- §4 UI badge variante C → Task 4 ✓
- §6 tests (intégration + visuel) → Tasks 8,10 ✓
- §7 sandbox-first + audit + version → Tasks 8,9,10 ✓
- Bien existant inchangé → Tasks 2(step3), 8(step3) ✓
