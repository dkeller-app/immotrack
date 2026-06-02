# FEAT-GEORISQUES-ERP Phase 2 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher la date du PDF ERRIAL « État des Risques » sur la ligne ERP du DDT (validité 6 mois), rendre l'ERP binaire (valide/expiré), et afficher un message de régénération ERRIAL — dans l'onglet Diagnostics (bandeau) et au moment de générer le bail (encart dans la modale de blocage existante).

**Architecture:** 4 modifications inline dans `index-test.html` (moteur `_diag*` / `_logDiag*` existant), aucun nouveau module ni dépendance. Le module pur de détection (`__tests__/helpers/georisques-erp-detector.js` + miroir global) n'est PAS touché.

**Tech Stack:** Vanilla JS monolithique (fichier unique), pdf.js (déjà chargé), pas de build.

**Particularité de ce codebase :** les fonctions modifiées sont des fonctions UI inline d'un fichier HTML monolithique — il n'existe pas de tests unitaires Vitest pour elles (seul le module pur en a, et il est inchangé). La vérification par tâche = **syntaxe** (`node --check` sur le bloc extrait) + **grep d'ancrage**. La validation fonctionnelle finale = **test visuel manuel** (vrai navigateur) + **audit code-reviewer obligatoire**. C'est volontaire : on ne fabrique pas de faux tests unitaires sur du DOM inline.

**Spec de référence :** `docs/superpowers/specs/2026-06-02-georisques-erp-phase2-design.md`
**Mockup validé :** `mockups/georisques-erp/alerte-validite-erp.html`

---

## Structure des fichiers

- **Modifier uniquement :** `C:\Users\Did_K\Desktop\Immo\index-test.html` (sandbox).
- **Mettre à jour en fin de course :** `BACKLOG.md` + `docs/subjects/FEAT-GEORISQUES-ERP.md` (statut/journal).
- **Ne PAS toucher :** `index.html` (PROD, synchro différée), `__tests__/helpers/*`, `js/main.js` (WIP autre session), `sw.js`.

Ordre des tâches : 1 (statut binaire) → 2-3 (extraction + application date) → 4-5 (bandeau Diagnostics) → 6 (encart modale bail) → 7 (bump + vérifs + BACKLOG + commit) → 8 (audit code-reviewer).

---

### Task 1 : ERP binaire dans `_diagStatut` (Décision 1)

**Files:**
- Modify: `index-test.html` (fonction `_diagStatut`, ~ligne 32058-32072)

- [ ] **Step 1 : Appliquer l'édition**

Ancrer sur les 3 dernières lignes de `_diagStatut` et insérer la garde ERP avant le `return` final :

old_string :
```js
  const sixM = 1000*60*60*24*30*6;
  const threshold = diagKey === 'dpe' ? sixM*2 : sixM;
  return (expTs - refTs) <= threshold ? 'expirebientot' : 'valide';
```
new_string :
```js
  const sixM = 1000*60*60*24*30*6;
  const threshold = diagKey === 'dpe' ? sixM*2 : sixM;
  // ERP : binaire valide/expiré — la validité (6 mois) = le seuil « bientôt »,
  // on neutralise l'état intermédiaire (FEAT-GEORISQUES-ERP Phase 2, décision 1).
  if (diagKey === 'erp') return 'valide';
  return (expTs - refTs) <= threshold ? 'expirebientot' : 'valide';
```

- [ ] **Step 2 : Vérifier l'ancrage**

Run (Grep) : pattern `if \(diagKey === 'erp'\) return 'valide';` dans `index-test.html`.
Expected : 1 occurrence, dans `_diagStatut`. (On est dans la branche « non expiré » car `_estDiagExpire` a déjà renvoyé `expire` ligne 32064.)

- [ ] **Step 3 : Pas de régression sur `_ddtComplet`**

Run (Grep) : pattern `out.expires.push|out.manquants.push` → confirmer que `_ddtComplet` ne réagit qu'à `expire`/`manquant` (jamais `expirebientot`). Aucune édition. C'est cohérent : un ERP `valide` ne bloque pas, un ERP `expire` bloque déjà.

---

### Task 2 : Extraire la date « Établi le » du PDF ERRIAL (Décision A — extraction)

**Files:**
- Modify: `index-test.html` (fonction `_logDiagExtractSuggestions`, ~ligne 35465-35506)

- [ ] **Step 1 : Ajouter le bloc d'extraction `erpDate`**

Insérer juste après la conversion de la date globale (avant la section CABINET) :

old_string :
```js
  if (_dm) date = _dm[3] + '-' + _dm[2].padStart(2, '0') + '-' + _dm[1].padStart(2, '0');

  // ── CABINET / diagnostiqueur : footer « X | … N°SIREN » ou « réalisé … par X ».
```
new_string :
```js
  if (_dm) date = _dm[3] + '-' + _dm[2].padStart(2, '0') + '-' + _dm[1].padStart(2, '0');

  // ── ERP / ERRIAL : date « Établi le JJ/MM/AAAA » (propre à l'État des Risques, distincte de la
  //    date de repérage des autres diagnostics → ne pollue jamais les autres lignes). Même validation
  //    calendaire que la date globale (FEAT-GEORISQUES-ERP Phase 2).
  let erpDate = '', erpDateRaw = '', erpDateSrc = '';
  const _erpM = Tn.match(/[ée]tabli\s+le\s+([0-3]?\d\/[01]?\d\/20\d{2})/i);
  if (_erpM) {
    const _ecm = _erpM[1].match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
    if (_ecm) {
      const _ed = +_ecm[1], _emo = +_ecm[2], _ey = +_ecm[3];
      const _edt = new Date(Date.UTC(_ey, _emo - 1, _ed));
      if (_ed >= 1 && _ed <= 31 && _emo >= 1 && _emo <= 12
          && _edt.getUTCFullYear() === _ey && _edt.getUTCMonth() === _emo - 1 && _edt.getUTCDate() === _ed) {
        erpDateRaw = _erpM[1];
        erpDate = _ey + '-' + _ecm[2].padStart(2, '0') + '-' + _ecm[1].padStart(2, '0');
        erpDateSrc = _erpM[0].replace(/\s+/g, ' ').trim();
      }
    }
  }

  // ── CABINET / diagnostiqueur : footer « X | … N°SIREN » ou « réalisé … par X ».
```

- [ ] **Step 2 : Étendre l'objet de retour**

old_string :
```js
  return { date, dateRaw, dateSrc, cabinet, cabinetSrc, results, ambiguous };
```
new_string :
```js
  return { date, dateRaw, dateSrc, erpDate, erpDateRaw, erpDateSrc, cabinet, cabinetSrc, results, ambiguous };
```

- [ ] **Step 3 : Vérifier l'ancrage**

Run (Grep) : pattern `erpDate, erpDateRaw, erpDateSrc` → 1 occurrence (le return). Pattern `[ée]tabli\\s\+le` → 1 occurrence (le regex). `Tn` est bien défini plus haut dans la même fonction (normalisation des séparateurs de date).

---

### Task 3 : Appliquer la date ERP à la seule ligne `erp` (Décision A — application)

**Files:**
- Modify: `index-test.html` (fonction `_logDiagApplySuggestions`, ~ligne 36356-36361)

- [ ] **Step 1 : Préférer `erpDate` pour la clé `erp`**

old_string :
```js
    // DATE (globale au DDT combiné) — uniquement si vide.
    if (sug.date && !String(info.date || '').trim() && !entry.date) {
      info.date = sug.date;
      entry.date = { src: sug.dateSrc, name: srcName || '' };
      n++;
    }
```
new_string :
```js
    // DATE — pour l'ERP, préférer la date « Établi le » propre à l'ERRIAL ; sinon date globale du
    // DDT combiné. Uniquement si le champ est vide (FEAT-GEORISQUES-ERP Phase 2).
    const _dForKey   = (key === 'erp' && sug.erpDate) ? sug.erpDate   : sug.date;
    const _dSrcForKey = (key === 'erp' && sug.erpDate) ? sug.erpDateSrc : sug.dateSrc;
    if (_dForKey && !String(info.date || '').trim() && !entry.date) {
      info.date = _dForKey;
      entry.date = { src: _dSrcForKey, name: srcName || '' };
      n++;
    }
```

- [ ] **Step 2 : Vérifier l'ancrage**

Run (Grep) : pattern `_dForKey` dans `index-test.html` → 3 occurrences (2 déclarations + 2 usages = en fait 4 ; vérifier ≥ 3 et toutes dans `_logDiagApplySuggestions`). La boucle `coveredKeys.forEach` couvre `erp` dès que `coverage.erp` est vrai (détecté par `_logDiagScanText`). Le badge « ✨ à vérifier », le tableau, valider/effacer sont réutilisés tels quels.

---

### Task 4 : CSS du bandeau ERP expiré (Décision C — styles)

**Files:**
- Modify: `index-test.html` (fonction `_logDiagEnsureCSS`, bloc CSS ~ligne 32172-32176)

- [ ] **Step 1 : Ajouter les règles `.logdiag-erp-banner`**

Ancrer sur la dernière règle `.logdiag-review` et ajouter le bandeau après (couleurs fixes, comme `.logdiag-review` et `.erp-detail.req` existants — pas d'override sombre pour rester fidèle au pattern app) :

old_string :
```css
    .logdiag-review .btn.logdiag-rev-validate{background:#f59e0b;border-color:#d97706;color:#fff}
```
new_string :
```css
    .logdiag-review .btn.logdiag-rev-validate{background:#f59e0b;border-color:#d97706;color:#fff}
    .logdiag-erp-banner{margin-bottom:14px;display:flex;gap:12px;align-items:flex-start;border-radius:8px;padding:11px 13px;background:#fef2f2;border:1px solid #fca5a5;border-left:4px solid #dc2626;color:#7f1d1d}
    .logdiag-erp-banner .big{font-size:24px;line-height:1;flex:none}
    .logdiag-erp-banner h4{margin:0 0 3px;font-size:13.5px;font-weight:800}
    .logdiag-erp-banner p{margin:0;font-size:12px;line-height:1.5}
    .logdiag-erp-banner .renew{display:inline-flex;align-items:center;gap:6px;margin-top:9px;font-size:12px;font-weight:700;border-radius:8px;padding:7px 14px;cursor:pointer;border:1px solid #b91c1c;background:#dc2626;color:#fff;text-decoration:none}
    .logdiag-erp-banner .renew:hover{background:#b91c1c}
```

- [ ] **Step 2 : Vérifier l'ancrage**

Run (Grep) : pattern `logdiag-erp-banner` → 7 occurrences en CSS (à ce stade ; la fonction de rendu en ajoutera à la Task 5).

---

### Task 5 : Rendu du bandeau ERP expiré dans l'onglet Diagnostics (Décision C — rendu)

**Files:**
- Modify: `index-test.html` (fonction `_logDiagRenderTab`, calcul ~ligne 36736 + injection ~ligne 36741)

- [ ] **Step 1 : Calculer le bandeau (juste après le bloc `reviewHtml`)**

`synth` et `today` sont déjà définis en haut de `_logDiagRenderTab` (lignes 36570-36571) ; `_diagStatut`, `_diagGet`, `_diagDateExpiration` sont globaux.

old_string :
```js
        <button type="button" class="btn" onclick="_logDiagSuggestToggleSrc()">📄 ${_logDiagSrcOpen?'Masquer':'Voir'} les phrases source</button>
      </div>
    </div>` : '';

  body.innerHTML = `
```
new_string :
```js
        <button type="button" class="btn" onclick="_logDiagSuggestToggleSrc()">📄 ${_logDiagSrcOpen?'Masquer':'Voir'} les phrases source</button>
      </div>
    </div>` : '';

  // FEAT-GEORISQUES-ERP Phase 2 — bandeau d'alerte si l'ERP est EXPIRÉ (binaire : pas de « bientôt »).
  let erpAlertHtml = '';
  if (typeof _diagStatut === 'function' && _diagStatut('erp', synth, today) === 'expire') {
    const _erpInfo = (typeof _diagGet === 'function') ? _diagGet(synth, 'erp') : null;
    const _erpExp  = (typeof _diagDateExpiration === 'function') ? _diagDateExpiration('erp', _erpInfo) : null;
    const _fr = iso => { const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
    erpAlertHtml = `
    <div class="logdiag-erp-banner">
      <span class="big">🛑</span>
      <div>
        <h4>État des Risques expiré</h4>
        <p>L'ERP de ce logement est <b>périmé${_erpExp?` depuis le ${_fr(_erpExp)}`:''}</b> (validité 6 mois, Art. L.125-5 C. env.). Régénérez-le <b>gratuitement, sans diagnostiqueur</b>, puis redéposez le PDF ci-dessus pour mettre la date à jour.</p>
        <a class="renew" href="https://errial.georisques.gouv.fr/" target="_blank" rel="noopener">↻ Régénérer sur ERRIAL (gratuit)</a>
      </div>
    </div>`;
  }

  body.innerHTML = `
```

- [ ] **Step 2 : Injecter le bandeau dans le template (après `reviewHtml`)**

old_string :
```js
    ${uploadHtml}
    ${detectHtml}
    ${reviewHtml}
    <div class="logmod-info-banner">
```
new_string :
```js
    ${uploadHtml}
    ${detectHtml}
    ${reviewHtml}
    ${erpAlertHtml}
    <div class="logmod-info-banner">
```

- [ ] **Step 3 : Vérifier l'ancrage**

Run (Grep) : pattern `erpAlertHtml` → 3 occurrences (déclaration, affectation, injection). Pattern `\$\{erpAlertHtml\}` → 1 occurrence.

---

### Task 6 : Encart ERP→ERRIAL dans la modale de blocage du bail (Décision D)

**Files:**
- Modify: `index-test.html` (fonction `_ddtShowIncompletModal`, ~ligne 32340-32365)

- [ ] **Step 1 : Construire l'encart (après la définition de `liExpires`)**

old_string :
```js
    const liExpires = ddt.expires.map(k => {
      const e = _diagCatalogEntry(k);
      return `<li>${e?.icon||''} <strong>${escHtml(e?.label||k)}</strong> — diagnostic expiré, à renouveler</li>`;
    }).join('');
```
new_string :
```js
    const liExpires = ddt.expires.map(k => {
      const e = _diagCatalogEntry(k);
      return `<li>${e?.icon||''} <strong>${escHtml(e?.label||k)}</strong> — diagnostic expiré, à renouveler</li>`;
    }).join('');
    // FEAT-GEORISQUES-ERP Phase 2 — encart de régénération gratuite si l'ERP est expiré/manquant.
    const erpFlag = ddt.expires.includes('erp') ? 'expiré' : (ddt.manquants.includes('erp') ? 'manquant' : '');
    const erpEncart = erpFlag ? `
      <div style="margin-top:14px;display:flex;gap:12px;align-items:flex-start;border-radius:10px;padding:12px 14px;background:#fef2f2;border:1px solid #fca5a5;border-left:4px solid #dc2626;color:#7f1d1d">
        <div style="font-size:24px;line-height:1">🛑</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:13.5px;margin-bottom:3px">État des Risques ${erpFlag} — régénération gratuite</div>
          <div style="font-size:12px;line-height:1.5">Contrairement aux autres diagnostics, vous le <strong>régénérez vous-même, gratuitement, sans diagnostiqueur</strong> sur ERRIAL (Art. L.125-5 C. env.).</div>
          <a href="https://errial.georisques.gouv.fr/" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;margin-top:9px;font-size:12px;font-weight:700;border-radius:8px;padding:7px 14px;border:1px solid #b91c1c;background:#dc2626;color:#fff;text-decoration:none">↻ Régénérer sur ERRIAL (gratuit)</a>
        </div>
      </div>` : '';
```

- [ ] **Step 2 : Injecter l'encart entre les listes et la note « 💡 »**

old_string :
```js
        ${liExpires ? `<div style="margin-bottom:8px;font-weight:600;color:#7f1d1d">⏰ Diagnostics expirés :</div><ul style="margin:0 0 10px 22px;padding:0">${liExpires}</ul>` : ''}
      </div>
      <div class="mu sm" style="margin-top:8px;padding:8px 12px;background:var(--sur2);border-radius:var(--rl);font-size:11.5px;line-height:1.5">
```
new_string :
```js
        ${liExpires ? `<div style="margin-bottom:8px;font-weight:600;color:#7f1d1d">⏰ Diagnostics expirés :</div><ul style="margin:0 0 10px 22px;padding:0">${liExpires}</ul>` : ''}
      </div>
      ${erpEncart}
      <div class="mu sm" style="margin-top:8px;padding:8px 12px;background:var(--sur2);border-radius:var(--rl);font-size:11.5px;line-height:1.5">
```

- [ ] **Step 3 : Vérifier l'ancrage**

Run (Grep) : pattern `erpEncart` → 2 occurrences (déclaration + injection). Les boutons « Continuer quand même » (`_ddtForceOverride`) et « Mettre à jour » (`_ddtGoFix`) ne sont pas touchés.

---

### Task 7 : Bump version + vérifications + BACKLOG + commit

**Files:**
- Modify: `index-test.html` (4 spots version : lignes 6, 57, 3454, 3514)
- Modify: `BACKLOG.md`, `docs/subjects/FEAT-GEORISQUES-ERP.md`

- [ ] **Step 1 : Bump `15.253` → `15.254` (4 spots)**

Édition `replace_all` n'est PAS sûre (le `15.253` apparaît dans des commentaires/historique). Faire 4 éditions ciblées :
- Ligne 6 : `<title>ImmoTrack v15.253</title>` → `v15.254`
- Ligne 57 : `<em>v15.253</em>` → `<em>v15.254</em>`
- Ligne 3454 : `ImmoTrack v15.253` → `ImmoTrack v15.254`
- Ligne 3514 : `const IMMOTRACK_VERSION = '15.253';` → `'15.254';`

- [ ] **Step 2 : Vérification syntaxe inline**

Run : `node scripts/check-inline-js.mjs index-test.html`
Expected : `4|0` (4 blocs script, 0 erreur).

- [ ] **Step 3 : Suite Vitest (non-régression module pur)**

Run : `npx vitest run`
Expected : tous verts (44 tests). Le module pur n'a pas changé → aucune raison de casser.

- [ ] **Step 4 : Grep de cohérence finale**

Run (Grep) sur `index-test.html` : `15\.254` → 4 occurrences. `logdiag-erp-banner` → ≥ 8 (CSS + rendu). `errial.georisques.gouv.fr` → ≥ 3 nouveaux usages (bandeau + encart bail + panneau existant).

- [ ] **Step 5 : Mettre à jour BACKLOG.md + sujet (temps réel)**

Dans `BACKLOG.md` : passer la ligne FEAT-GEORISQUES-ERP à « Phase 2 livrée (sandbox) v15.254 », ajouter le commit. Dans `docs/subjects/FEAT-GEORISQUES-ERP.md` : journal d'avancement Phase 2 (les 4 changements + état sandbox + reste = test visuel user + synchro PROD différée).

- [ ] **Step 6 : Commit (fichiers nommés UNIQUEMENT)**

```bash
git add index-test.html BACKLOG.md docs/subjects/FEAT-GEORISQUES-ERP.md
git commit -m "FEAT-GEORISQUES-ERP Phase 2 : validité ERP 6 mois + régénération ERRIAL (v15.254)

- _diagStatut : ERP binaire (valide/expiré, plus de 'expire bientôt')
- extraction date 'Établi le' du PDF ERRIAL → suggestion ✨ sur la ligne ERP
- bandeau rouge dans l'onglet Diagnostics si ERP expiré + CTA ERRIAL
- encart ERP→ERRIAL dans la modale de blocage du bail (ov-ddt-incomplet)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
**Ne jamais `git add -A`** ni stager les fichiers WIP de l'autre session (`js/main.js`, etc.).

---

### Task 8 : Audit code-reviewer OBLIGATOIRE (avant tout « prêt à tester »)

**Files:** aucun (revue).

- [ ] **Step 1 : Dispatch agent `superpowers:code-reviewer`**

Lui fournir : le spec (`docs/superpowers/specs/2026-06-02-georisques-erp-phase2-design.md`), le diff du commit Task 7, et les points sensibles à challenger :
- la date « Établi le » ERRIAL ne pollue-t-elle jamais une autre ligne (DPE/plomb/gaz) ? (clé `erp` uniquement)
- la garde `erp` dans `_diagStatut` ne casse-t-elle aucun autre appelant (`_ddtComplet`, actions prioritaires ligne 22954, agenda ligne 10280, dashboard 12099) ?
- robustesse de l'extraction `Établi le` aux quirks pdf.js (espaces, séparateurs `.`/`/`, dates impossibles).
- pas d'écriture aveugle : la date reste « ✨ à vérifier » jusqu'à validation user.
- immutabilité : aucune écriture sur un bail signé.

- [ ] **Step 2 : Corriger les findings éventuels, re-vérifier (Steps Task 7.2-7.4), re-commit si besoin.**

- [ ] **Step 3 : Seulement après audit vert → annoncer « prêt à tester » à l'utilisateur** avec la check-list des 4 cas visuels du spec (suggestion date, valide sans bandeau, expiré + bandeau, blocage bail + encart) à tester dans son vrai navigateur.

---

## Self-review du plan

- **Couverture spec :** Décision 1 → Task 1 ; Décision A (extraction + application) → Tasks 2-3 ; Décision 2 (bandeau) → Tasks 4-5 ; Décision 3 (encart bail) → Task 6 ; vérifs + versioning + audit → Tasks 7-8. ✅ Toutes les sections du spec ont une tâche.
- **Placeholders :** aucun — chaque step de code montre l'old_string/new_string exact.
- **Cohérence des noms :** `erpDate`/`erpDateRaw`/`erpDateSrc` (Task 2) ↔ `sug.erpDate`/`sug.erpDateSrc` (Task 3) ; `erpAlertHtml` (Task 5) ; `erpEncart`/`erpFlag` (Task 6) ; classe `.logdiag-erp-banner` (Task 4 CSS ↔ Task 5 rendu). Cohérent.
- **PROD non touchée :** confirmé, `index.html` hors scope (synchro différée).
