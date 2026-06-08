# Candidature relance + inbox — Implementation Plan (T13b / T13c / T13d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la candidature en ligne exploitable sans surveillance — demande de complément via popup de partage (réutilise le moteur d'invitation), rapatriement automatique des dépôts, et notification « nouveau dossier » (bandeau accueil + pastille nav + toast + pill liste).

**Architecture:** Tout dans le sandbox `index-candidature-test.html` (propagation prod = Task 16, séparée). 3 helpers purs ajoutés à `js/core/candidature.js` (testés Vitest) + miroir inline dans l'IIFE candidat du sandbox (pattern « duplication intentionnelle » déjà en place ; l'exposition `js/main.js` est différée à Task 16). Les composants UI réutilisent les fonctions de partage de l'invitation (`_invShare*`, `_invToggleQr`, `_invCopy`) et la fonction de pull existante (`_relayPullCandidatures`).

**Tech Stack:** Vanilla JS (ES module pour `js/core/*`, IIFE inline dans le HTML), Vitest, tokens CSS de `css/main.css`.

**Spec de référence:** `docs/superpowers/specs/2026-06-05-candidature-relance-inbox-design.md`
**Mockups validés:** `mockups/candidature/relance-complement.html` (Variante A · 2 étapes) · `mockups/candidature/notif-inbox.html` (Variante A · Bandeau dédié)

---

## Contraintes d'exécution (gravées — à respecter à chaque task)

- **Sandbox-first** : on ne touche QUE `index-candidature-test.html`, `js/core/candidature.js`, `__tests__/helpers/candidature.test.js`. **Aucune** modif de `index.html` (prod), `js/main.js`, `sw.js`, `BACKLOG.md` ici. La propagation prod + `js/main.js` exposure + bump = **Task 16**.
- **Commits** : `git add` par **chemin explicite uniquement** (jamais `git add -A`/`.`/`git add` du repo entier). Vérifier le diff avant commit. Le hook repo auto-push sur origin/main (comportement configuré) — c'est normal pour ces fichiers (les miens).
- **Réutilisation, pas réinvention** : partage = `_invShare*` existants ; pull = `_relayPullCandidatures` existant.
- **Serveur de test** : http-server déjà lancé sur le port 8080 (background). Tester dans le **vrai navigateur** : `http://localhost:8080/index-candidature-test.html`.
- **Secrets** : `ownerToken`/`linkId` jamais dans une URL ni loggés. Le lien partagé est l'URL candidat publique (`_buildCandidatUrl(base, linkId)`), pas le lien capability.

---

## File Structure

| Fichier | Responsabilité | Tasks |
|---|---|---|
| `js/core/candidature.js` | Helpers purs (ajout : `buildComplementShareMessage`, `shouldAutoPull`, `countUnreadCandidats`, `nouveauDossierToast`) | T13b, T13c, T13d |
| `__tests__/helpers/candidature.test.js` | Tests Vitest des helpers ci-dessus | T13b, T13c, T13d |
| `index-candidature-test.html` | Sandbox : miroir inline des helpers + orchestration UI (popup complément, scheduler auto-pull, surfaces de notif) + CSS | T13b, T13c, T13d |

**Ancres réelles vérifiées (sandbox, 2026-06-05) :**
- IIFE helpers candidat : `_nouveauCandidat` 14186, exports `window._calculConfiance = …` 14226-14231, fin IIFE `})();` **14232**.
- Fonctions de partage invitation : `_invRenderStep2` 14555, `_invCopy` 14582, `_invShareText` 14589, `_invShareEmail` 14590, `_invShareSms` 14594, `_invShareWhatsApp` 14595, `_invToggleQr` 14596 (lit `el('inv-qr-wrap')`). Modale partagée : `ov-invite-candidat`, corps `inv-body`, titre `inv-title`, pied `inv-foot`.
- `_relayPullCandidatures` 14621-14692 (retour actuel `{imported, errors}`).
- `demanderComplementCandidat` 14773-14808 ; `_complementLocal` 14811-14817.
- `openFicheCandidat` 14826.
- `rCandidats` 14279 ; cellule nom 14331 ; ligne `<tr onclick=…>` 14330.
- `go()` 6006 ; render candidats `candidats:()=>{ _candidatsTab = _candidatsTab || 'actifs'; rCandidats(); }` **6050**.
- Accueil HTML : `#v4h-hero` 138, `.v4h-row1` 139, dans `#p-accueil` 136. `rAccueil` 6791, `_renderAccueil` 6822.
- Nav desktop : `.ni[data-module="candidats"]` 89. Bottom nav mobile : bouton « Plus » `data-page="more"` 1270. More-sheet grid 1283-1297 (**pas d'entrée Candidats** → à ajouter). `_moreGo` 6123.
- `showToast(msg, type='', dur=2800, extraHTML='')` 5934. `_buildCandidatUrl` (window) ; `_relayReopen` (window) ; `_relayCfg` ; `_relayConfigured` ; `_stamp`.
- Tokens CSS confirmés dans `css/main.css` : `--blu --red --grn --ora --t1 --t2 --t3 --bg-info --sur2 --bor --rl`.

---

## Task T13b: Demande de complément via popup de partage

Remplace la branche « en ligne » de `demanderComplementCandidat` (aujourd'hui `prompt()` + copie presse-papier) par une popup **2 étapes** (note → reopen relais → repartage du lien existant via Email/SMS/WhatsApp/QR), en réutilisant la modale `ov-invite-candidat` et les fonctions `_invShare*`. La branche « candidat manuel » (note interne, sans réseau) est conservée.

**Files:**
- Modify: `js/core/candidature.js` (ajout export `buildComplementShareMessage`)
- Test: `__tests__/helpers/candidature.test.js`
- Modify: `index-candidature-test.html` (miroir inline + réécriture `demanderComplementCandidat` + 4 fonctions de rendu)

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `__tests__/helpers/candidature.test.js`, et ajouter `buildComplementShareMessage` à la ligne d'import en tête (ligne 3-6) :

```js
// import en tête → ajouter buildComplementShareMessage à la liste importée

describe('buildComplementShareMessage', () => {
  it('inclut le bien et la note de complément', () => {
    const m = buildComplementShareMessage('Avis d\'imposition page 2', 'T2 — rue des Lilas');
    expect(m).toContain('T2 — rue des Lilas');
    expect(m).toContain('Avis d\'imposition page 2');
    expect(m).toMatch(/conserv/i); // rassure : dépôt précédent conservé
  });
  it('reste correct sans note', () => {
    const m = buildComplementShareMessage('', 'Studio Foch');
    expect(m).toContain('Studio Foch');
    expect(m).not.toMatch(/Élément\(s\) à compléter/);
  });
  it('reste correct sans bien (libellé générique)', () => {
    const m = buildComplementShareMessage('RIB', '');
    expect(typeof m).toBe('string');
    expect(m).toContain('RIB');
    expect(m).toContain('votre dossier de location');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/helpers/candidature.test.js`
Expected: FAIL — `buildComplementShareMessage is not a function` / import non résolu.

- [ ] **Step 3: Implement the pure helper**

Ajouter à `js/core/candidature.js` (après `_calculConfiance`, avant `_candidatVersLocataire`, n'importe où dans le module) :

```js
/**
 * Message pré-rempli pour la demande de complément partagée (réutilisé par la popup
 * de partage). Rassure le candidat : son dépôt précédent est conservé.
 * @param {string} note - ce qui manque (peut être vide)
 * @param {string} bienLabel - libellé du bien (peut être vide)
 * @returns {string} message multi-lignes
 */
export function buildComplementShareMessage(note, bienLabel) {
  const bien = String(bienLabel || '').trim();
  const cible = bien ? ('votre dossier de location pour ' + bien) : 'votre dossier de location';
  const manque = String(note || '').trim();
  return 'Bonjour,\n\n'
    + 'Merci de compléter ' + cible + '.\n\n'
    + (manque ? ('Élément(s) à compléter : ' + manque + '\n\n') : '')
    + 'Votre dépôt précédent est conservé : reprenez simplement le dépôt via votre lien sécurisé ci-dessous.\n\n'
    + 'Bien cordialement.';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/helpers/candidature.test.js`
Expected: PASS (tous les `buildComplementShareMessage` verts).

- [ ] **Step 5: Mirror the helper inline in the sandbox IIFE**

Dans `index-candidature-test.html`, dans l'IIFE candidat, juste **avant** la ligne `window._calculConfiance = _calculConfiance;` (ligne 14226), insérer la définition + après les autres `window.` (vers 14231) l'exposition :

Insérer la fonction (avant 14226) :
```js
  function buildComplementShareMessage(note, bienLabel) {
    const bien = String(bienLabel || '').trim();
    const cible = bien ? ('votre dossier de location pour ' + bien) : 'votre dossier de location';
    const manque = String(note || '').trim();
    return 'Bonjour,\n\n'
      + 'Merci de compléter ' + cible + '.\n\n'
      + (manque ? ('Élément(s) à compléter : ' + manque + '\n\n') : '')
      + 'Votre dépôt précédent est conservé : reprenez simplement le dépôt via votre lien sécurisé ci-dessous.\n\n'
      + 'Bien cordialement.';
  }
```
Et ajouter l'exposition à côté des autres (après `window._purgeCandidatsRefuses = _purgeCandidatsRefuses;`, ligne 14231) :
```js
  window.buildComplementShareMessage = buildComplementShareMessage;
```

- [ ] **Step 6: Rewrite `demanderComplementCandidat` + add the 4 render functions**

Dans `index-candidature-test.html`, **remplacer entièrement** la fonction `demanderComplementCandidat` (14773-14808) par le bloc ci-dessous. `_complementLocal` (14811-14817) est **conservé tel quel** (réutilisé par la branche manuelle et le fallback).

```js
// Demande de complément (D13/T13b). Candidat « lien en ligne » → popup 2 étapes
// (note → réouverture du relais → repartage du lien existant), réutilise la modale
// d'invitation + les fonctions _invShare*. Candidat manuel → note interne (sans réseau).
async function demanderComplementCandidat(id){
  const c = (DB.candidats||[]).find(x=>x && x.id===id); if(!c) return;
  const link = c.linkId ? (DB.candidatLinks||[]).find(l=>l && l.id===c.linkId && !l._archived) : null;
  const enLigne = !!(c.source==='lien' && link && link.ownerToken);
  const log = (DB.logements||[]).find(l=>l && l.ref===c.logRef);
  const bienLabel = log ? (log.ref+(log.imm?(' — '+log.imm):'')) : (c.logRef||'');
  // On réutilise _invState (lu par _invShare*/_invCopy/_invToggleQr) + la modale ov-invite-candidat.
  _invState = {
    mode:'complement', candId:id, enLigne,
    bienLabel, logRef:c.logRef, loyer: log?(Number(log.hc)||0):0,
    fixed:true, message:'', link:null
  };
  _complRenderStep1();
  openM('ov-invite-candidat');
}

function _complCandCtxHtml(){
  return '<div class="bien-ctx"><div class="ico">🏠</div><div>'
    + '<div class="nm">' + escHtml(_invState.bienLabel || '—') + '</div>'
    + '<div class="meta">Demande de complément · le dossier déjà déposé est conservé</div>'
    + '</div></div>';
}

function _complRenderStep1(){
  const body = el('inv-body'); if(!body) return;
  if(el('inv-title')) el('inv-title').textContent = 'Demander un complément';
  const enLigne = _invState.enLigne;
  body.innerHTML = _complCandCtxHtml()
    + '<div class="fg"><label>Que manque-t-il ?</label>'
    + '<textarea class="inp" id="compl-note" rows="4" style="resize:vertical" placeholder="Ex. Avis d\'imposition page 2 illisible, justificatif de domicile manquant…">Merci de compléter votre dossier (pièce manquante).</textarea></div>'
    + (enLigne
        ? '<div class="info-box" style="background:var(--bg-success,rgba(22,163,74,.10));border-color:rgba(22,163,74,.3)">✓ <b>Dossier conservé</b> — le candidat complète en ligne via son lien existant ; ses pièces déjà déposées ne sont pas perdues.</div>'
        : '<div class="info-box" style="background:var(--bg-warning,rgba(234,88,12,.12));border-color:rgba(234,88,12,.35)">⚠ <b>Candidat saisi manuellement</b> — aucun lien en ligne à partager. La note ci-dessus est enregistrée en interne (statut « En cours »).</div>');
  const foot = el('inv-foot');
  if(foot) foot.innerHTML = '<button class="btn bs" onclick="closeM(\'ov-invite-candidat\')">Annuler</button>'
    + (enLigne
        ? '<button class="btn bp" id="compl-go-btn" onclick="_complReopen()">Rouvrir &amp; partager →</button>'
        : '<button class="btn bp" onclick="_complSaveManual()">Enregistrer la note</button>');
}

function _complSaveManual(){
  const note = (v('compl-note')||'').trim();
  const id = _invState.candId;
  const c = (DB.candidats||[]).find(x=>x && x.id===id); if(!c) return;
  closeM('ov-invite-candidat');
  _complementLocal(c, id, note);
}

async function _complReopen(){
  const id = _invState.candId;
  const c = (DB.candidats||[]).find(x=>x && x.id===id); if(!c) return;
  const link = c.linkId ? (DB.candidatLinks||[]).find(l=>l && l.id===c.linkId && !l._archived) : null;
  if(!link || !link.ownerToken){ showToast('Lien introuvable','err'); return; }
  const note = (v('compl-note')||'').trim();
  const cfg = (typeof _relayCfg==='function') ? _relayCfg() : null;
  if(!window._relayConfigured || !window._relayConfigured(cfg)){
    showToast('Relais non configuré (Réglages → 🔗 Relais candidatures).','warn'); return;
  }
  const btn = el('compl-go-btn'); if(btn){ btn.disabled=true; btn.textContent='Réouverture…'; }
  try{
    await window._relayReopen(cfg, link.id, link.ownerToken, note);
  }catch(e){
    // 404/410 = lien expiré (TTL) ou révoqué → plus de canal en ligne, bascule local.
    console.warn('[relay] reopen', link.id, e);
    link.status='done'; if(typeof _stamp==='function') _stamp(link); else link._modifiedAt=Date.now();
    closeM('ov-invite-candidat');
    showToast('Le lien en ligne a expiré : note enregistrée en interne (le candidat ne peut plus compléter en ligne).','warn',7000);
    _complementLocal(c, id, note);
    return;
  }
  // Succès : ré-arme le pull + repasse « En cours » + note.
  link.status='active'; if(typeof _stamp==='function') _stamp(link); else link._modifiedAt=Date.now();
  c.statut='enCours'; c.complementNote=note; _stamp(c);
  try{ if(typeof _auditLog==='function') _auditLog('update','candidat',id,'complément demandé (lien rouvert + partagé)'); }catch(e){}
  saveDB(); if(typeof rCandidats==='function') rCandidats();
  if(el('ov-fiche-candidat') && !el('ov-fiche-candidat').classList.contains('hidden')) openFicheCandidat(id);
  // Prépare _invState pour les fonctions de partage (URL candidat publique, jamais le ownerToken).
  const url = window._buildCandidatUrl ? window._buildCandidatUrl(cfg.base, link.id) : '';
  _invState.link = { id: link.id, url, expiresAt: link.expiresAt };
  _invState.message = buildComplementShareMessage(note, _invState.bienLabel);
  _complRenderStep2();
}

function _complRenderStep2(){
  const body = el('inv-body'); if(!body || !_invState.link) return;
  if(el('inv-title')) el('inv-title').textContent = 'Lien à renvoyer au candidat';
  const url = _invState.link.url;
  const exp = _invState.link.expiresAt ? new Date(_invState.link.expiresAt).toLocaleDateString('fr-FR') : '—';
  body.innerHTML =
      '<div class="steps"><div class="stp done"><span class="n">✓</span>Note</div><div class="bar"></div><div class="stp act"><span class="n">2</span>Partager</div></div>'
    + _complCandCtxHtml()
    + '<div class="fg"><label>Lien du candidat</label><div class="linkbox">'
    +   '<div class="url ok" id="inv-url">' + escHtml(url) + '</div>'
    +   '<button class="btn bp" onclick="_invCopy()">📋 Copier</button></div></div>'
    + '<div class="fg"><label>Partager par</label><div class="chans">'
    +   '<div class="chan" onclick="_invShareEmail()"><span class="ci">✉️</span><span class="cl">Email</span></div>'
    +   '<div class="chan" onclick="_invShareSms()"><span class="ci">💬</span><span class="cl">SMS</span></div>'
    +   '<div class="chan" onclick="_invShareWhatsApp()"><span class="ci">🟢</span><span class="cl">WhatsApp</span></div>'
    +   '<div class="chan" onclick="_invToggleQr()"><span class="ci">⬛</span><span class="cl">QR code</span></div>'
    +   '</div></div>'
    + '<div id="inv-qr-wrap" class="hidden" style="text-align:center;margin-top:12px"></div>'
    + '<div class="info-box">📩 Le dépôt du candidat est <b>rouvert</b>. Dès qu\'il complète, le dossier réapparaît dans Candidats (rapatriement auto). Lien valable jusqu\'au <b>' + exp + '</b>.</div>';
  const foot = el('inv-foot');
  if(foot) foot.innerHTML = '<button class="btn bp" onclick="closeM(\'ov-invite-candidat\'); if(typeof rCandidats===\'function\') rCandidats();">Terminé</button>';
}
```

- [ ] **Step 7: Manual visual test in the real browser**

Run (si le serveur n'est pas déjà lancé) : `npx http-server -p 8080 -c-1` (sinon réutiliser le background existant).
Ouvrir : `http://localhost:8080/index-candidature-test.html`
Vérifier :
1. Candidat **en ligne** → fiche → « 📩 Demander un complément » → popup étape 1 (note + bandeau vert « dossier conservé »).
2. « Rouvrir & partager » → étape 2 : lien + Email/SMS/WhatsApp/QR fonctionnent (QR s'affiche/se masque). Le statut passe « En cours », la note apparaît dans la fiche (bannière complément D13).
3. Candidat **manuel** → popup étape 1 (bandeau orange) → « Enregistrer la note » → statut « En cours », aucun appel réseau, toast « aucune relance en ligne ».
Expected: les 3 scénarios OK, aucune erreur console.

- [ ] **Step 8: Commit**

```bash
git add js/core/candidature.js __tests__/helpers/candidature.test.js index-candidature-test.html
git commit -m "feat(candidature): T13b — demande de complément via popup de partage (sandbox)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task T13c: Rafraîchissement automatique des dépôts (auto-pull)

Rapatrie les dépôts en arrière-plan : à l'ouverture de l'onglet Candidats, au retour de focus de la fenêtre, et toutes les ~3 min — uniquement s'il existe ≥1 lien `active`. Décision encapsulée dans le helper pur `shouldAutoPull` (TDD).

**Files:**
- Modify: `js/core/candidature.js` (ajout export `shouldAutoPull`)
- Test: `__tests__/helpers/candidature.test.js`
- Modify: `index-candidature-test.html` (miroir inline + scheduler + 3 déclencheurs)

- [ ] **Step 1: Write the failing test**

Ajouter à `__tests__/helpers/candidature.test.js` (et `shouldAutoPull` à l'import en tête) :

```js
describe('shouldAutoPull', () => {
  const I = 180000; // 3 min
  it('pas de lien actif → jamais de pull', () => {
    expect(shouldAutoPull(0, 1_000_000, I, false)).toBe(false);
    expect(shouldAutoPull(null, 1_000_000, I, false)).toBe(false);
  });
  it('jamais pull + liens actifs → pull', () => {
    expect(shouldAutoPull(0, 1_000_000, I, true)).toBe(true);
    expect(shouldAutoPull(null, 1_000_000, I, true)).toBe(true);
  });
  it('intervalle non écoulé → pas de pull', () => {
    expect(shouldAutoPull(1_000_000, 1_000_000 + 60_000, I, true)).toBe(false);
  });
  it('intervalle écoulé → pull', () => {
    expect(shouldAutoPull(1_000_000, 1_000_000 + 200_000, I, true)).toBe(true);
  });
  it('borne exacte (now-last === interval) → pull', () => {
    expect(shouldAutoPull(1_000_000, 1_000_000 + I, I, true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/helpers/candidature.test.js`
Expected: FAIL — `shouldAutoPull is not a function`.

- [ ] **Step 3: Implement the pure helper**

Ajouter à `js/core/candidature.js` :

```js
/**
 * Décide si un pull automatique des candidatures doit partir maintenant.
 * @param {number|null} lastPullTs - timestamp (ms) du dernier pull, 0/null si jamais
 * @param {number} now - Date.now()
 * @param {number} intervalMs - délai mini entre 2 pulls (défaut 180000 = 3 min)
 * @param {boolean} hasActiveLinks - existe-t-il ≥1 lien à rapatrier
 * @returns {boolean}
 */
export function shouldAutoPull(lastPullTs, now, intervalMs = 180000, hasActiveLinks = false) {
  if (!hasActiveLinks) return false;
  if (!lastPullTs) return true;
  return (now - lastPullTs) >= intervalMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/helpers/candidature.test.js`
Expected: PASS.

- [ ] **Step 5: Mirror inline + add scheduler in the sandbox**

Dans `index-candidature-test.html`, IIFE candidat : ajouter la fonction avant `window._calculConfiance` (14226) et l'exposition après `window.buildComplementShareMessage` :
```js
  function shouldAutoPull(lastPullTs, now, intervalMs, hasActiveLinks){
    if(intervalMs == null) intervalMs = 180000;
    if(!hasActiveLinks) return false;
    if(!lastPullTs) return true;
    return (now - lastPullTs) >= intervalMs;
  }
```
```js
  window.shouldAutoPull = shouldAutoPull;
```

Puis ajouter le scheduler **juste après** la fonction `_relayPullCandidatures` (après sa `}` de fin, ligne 14692) :
```js
// ═══ AUTO-PULL (T13c) — rapatriement en arrière-plan, sans bouton ═══
// 3 déclencheurs : ouverture onglet Candidats · retour de focus · intervalle 3 min.
// Conditionné par shouldAutoPull (≥1 lien actif + intervalle écoulé). Anti-chevauchement.
let _autoPullInFlight = false;
let _autoPullLastTs = 0;
let _autoPullTimer = null;
const _AUTO_PULL_INTERVAL = 180000; // 3 min
async function _autoPullCandidatures(trigger){
  if(_autoPullInFlight) return;
  const hasActive = (DB.candidatLinks||[]).some(l => l && !l._archived && l.status === 'active');
  if(!shouldAutoPull(_autoPullLastTs, Date.now(), _AUTO_PULL_INTERVAL, hasActive)) return;
  _autoPullInFlight = true;
  try{ await _relayPullCandidatures({ silent:true }); _autoPullLastTs = Date.now(); }
  catch(e){ console.warn('[relay] auto-pull '+(trigger||''), e); }
  finally{ _autoPullInFlight = false; }
}
function _startAutoPullTimer(){
  if(_autoPullTimer) return;
  _autoPullTimer = setInterval(function(){ _autoPullCandidatures('interval'); }, _AUTO_PULL_INTERVAL);
}
(function _initAutoPull(){
  try{
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible') _autoPullCandidatures('focus');
    });
    _startAutoPullTimer();
  }catch(e){}
})();
```

- [ ] **Step 6: Wire the "open Candidats tab" trigger in `go()`**

Dans `index-candidature-test.html`, ligne 6050, remplacer :
```js
candidats:()=>{ _candidatsTab = _candidatsTab || 'actifs'; rCandidats(); },
```
par :
```js
candidats:()=>{ _candidatsTab = _candidatsTab || 'actifs'; rCandidats(); _autoPullCandidatures('open'); },
```

- [ ] **Step 7: Manual visual test in the real browser**

Ouvrir `http://localhost:8080/index-candidature-test.html`, relais configuré + ≥1 lien actif.
1. Déposer un dossier côté relais (lien candidat), **sans** cliquer « Actualiser ».
2. Quitter l'onglet navigateur puis revenir (focus) → après retour, le dossier apparaît dans Candidats (refresh silencieux, **pas** de toast « X rapatriés »).
3. Console : `_autoPullCandidatures('focus')` ne lance pas 2 pulls rapprochés (intervalle respecté). Vérifier `window.shouldAutoPull(0, Date.now(), 180000, false) === false`.
Expected: rapatriement auto OK, silencieux, sans double pull.

- [ ] **Step 8: Commit**

```bash
git add js/core/candidature.js __tests__/helpers/candidature.test.js index-candidature-test.html
git commit -m "feat(candidature): T13c — auto-pull des dépôts (ouverture + focus + 3 min) (sandbox)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task T13d: Notification « nouveau dossier reçu »

Bandeau accueil dédié (Variante A) + pastille compteur (sidebar desktop + « Plus » mobile + entrée More-sheet) + toast d'arrivée + pill « ● Nouveau » dans la liste. Flag `vu` par candidat (créé par pull → `false`, fiche ouverte → `true`). Étend `_relayPullCandidatures` pour retourner `{imported, created, updated, errors, newNames}`.

**Files:**
- Modify: `js/core/candidature.js` (ajout exports `countUnreadCandidats`, `nouveauDossierToast`)
- Test: `__tests__/helpers/candidature.test.js`
- Modify: `index-candidature-test.html` (miroir inline + extension pull + flag `vu` + surfaces + CSS + HTML banner/nav)

- [ ] **Step 1: Write the failing test**

Ajouter à `__tests__/helpers/candidature.test.js` (et les 2 noms à l'import en tête) :

```js
describe('countUnreadCandidats', () => {
  it('compte uniquement vu === false, non supprimés, non archivés', () => {
    const list = [
      { id:'a', vu:false },
      { id:'b', vu:true },
      { id:'c' },                       // vu undefined (ancien) → pas compté
      { id:'d', vu:false, _deleted:true },
      { id:'e', vu:false, _archived:true },
      { id:'f', vu:false }
    ];
    expect(countUnreadCandidats(list)).toBe(2); // a + f
  });
  it('liste vide / invalide → 0', () => {
    expect(countUnreadCandidats([])).toBe(0);
    expect(countUnreadCandidats(null)).toBe(0);
  });
});

describe('nouveauDossierToast', () => {
  it('aucun nom → message générique', () => {
    expect(nouveauDossierToast([])).toMatch(/Nouveau dossier reçu/);
  });
  it('un nom', () => {
    expect(nouveauDossierToast(['Marie Dupont'])).toContain('Marie Dupont');
  });
  it('deux noms → « et 1 autre »', () => {
    const t = nouveauDossierToast(['Marie Dupont','Karim Benali']);
    expect(t).toContain('Marie Dupont');
    expect(t).toContain('1 autre');
  });
  it('trois noms → « et 2 autres »', () => {
    expect(nouveauDossierToast(['A','B','C'])).toContain('2 autres');
  });
  it('ignore les noms vides', () => {
    expect(nouveauDossierToast(['', null, 'Léa'])).toContain('Léa');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/helpers/candidature.test.js`
Expected: FAIL — `countUnreadCandidats` / `nouveauDossierToast` undefined.

- [ ] **Step 3: Implement the pure helpers**

Ajouter à `js/core/candidature.js` :

```js
/** Nombre de candidatures non lues (vu === false), hors supprimées/archivées. */
export function countUnreadCandidats(candidats) {
  if (!Array.isArray(candidats)) return 0;
  return candidats.filter(c => c && c.vu === false && !c._deleted && !c._archived).length;
}

/** Texte du toast d'arrivée de nouveaux dossiers. */
export function nouveauDossierToast(newNames) {
  const names = (Array.isArray(newNames) ? newNames : []).map(s => String(s || '').trim()).filter(Boolean);
  const n = names.length;
  if (n === 0) return '📩 Nouveau dossier reçu';
  if (n === 1) return '📩 Nouveau dossier reçu : ' + names[0];
  return '📩 Nouveau dossier reçu : ' + names[0] + ' et ' + (n - 1) + ' autre' + (n - 1 > 1 ? 's' : '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/helpers/candidature.test.js`
Expected: PASS (toute la suite candidature verte).

- [ ] **Step 5: Mirror inline in the sandbox IIFE**

Dans `index-candidature-test.html`, IIFE candidat, avant `window._calculConfiance` (14226) :
```js
  function countUnreadCandidats(candidats){
    if(!Array.isArray(candidats)) return 0;
    return candidats.filter(c => c && c.vu === false && !c._deleted && !c._archived).length;
  }
  function nouveauDossierToast(newNames){
    const names = (Array.isArray(newNames)?newNames:[]).map(s=>String(s||'').trim()).filter(Boolean);
    const n = names.length;
    if(n===0) return '📩 Nouveau dossier reçu';
    if(n===1) return '📩 Nouveau dossier reçu : '+names[0];
    return '📩 Nouveau dossier reçu : '+names[0]+' et '+(n-1)+' autre'+(n-1>1?'s':'');
  }
```
Et exposer (après `window.shouldAutoPull`) :
```js
  window.countUnreadCandidats = countUnreadCandidats;
  window.nouveauDossierToast = nouveauDossierToast;
```

- [ ] **Step 6: Add the banner host in the accueil HTML**

Dans `index-candidature-test.html`, entre la ligne 138 (`<div class="v4h-hero" id="v4h-hero"></div>`) et la ligne 139 (`<div class="v4h-row1">`), insérer :
```html
        <div id="cand-inbox-banner"></div>
```

- [ ] **Step 7: Add a Candidats entry (with badge) to the More-sheet**

Dans `index-candidature-test.html`, dans `.more-grid` (après la ligne 1285 `Locataires & Baux`), insérer :
```html
      <button type="button" class="more-it" onclick="_moreGo('candidats')"><span class="more-ic">👤</span><span>Candidats <span id="more-candidats-badge" class="more-badge" style="display:none"></span></span></button>
```

- [ ] **Step 8: Add CSS (banner, pastille, pill) in the sandbox `<style>`**

Dans `index-candidature-test.html`, ajouter ce bloc à la fin du dernier `<style>` du `<head>` (ou juste avant `</style>` du bloc principal) :
```css
/* ── T13d notification candidatures ── */
.cand-inbox{display:flex;align-items:center;gap:14px;background:var(--bg-info,rgba(59,126,246,.10));border:1.5px solid rgba(59,126,246,.3);border-radius:var(--rl,14px);padding:14px 16px;margin:0 0 16px}
.cand-inbox .ci-ic{width:40px;height:40px;border-radius:10px;background:var(--blu,#3b7ef6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.cand-inbox .ci-tx{flex:1;min-width:0}
.cand-inbox .ci-tx .s{font-size:12.5px;color:var(--t2,#5a6e87);margin-top:1px}
.cand-inbox .ci-x{background:transparent;border:none;color:var(--t3,#9aabbf);font-size:17px;cursor:pointer;padding:4px 6px;flex-shrink:0}
@media(max-width:560px){
  .cand-inbox{flex-wrap:wrap;gap:8px 12px;align-items:flex-start}
  .cand-inbox .ci-ic{width:34px;height:34px;font-size:17px}
  .cand-inbox .ci-tx{flex:1 1 0}
  .cand-inbox .ci-x{order:3}
  .cand-inbox .btn{order:4;flex:1 1 100%;width:100%}
}
.ni-pastille{margin-left:auto;background:var(--red,#dc2626);color:#fff;font-size:10.5px;font-weight:700;min-width:18px;height:18px;padding:0 5px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center}
.v4-bn-badge{position:absolute;top:2px;right:calc(50% - 20px);background:var(--red,#dc2626);color:#fff;font-size:9px;font-weight:700;min-width:15px;height:15px;padding:0 3px;border-radius:8px;display:flex;align-items:center;justify-content:center}
.more-badge{background:var(--red,#dc2626);color:#fff;font-size:10px;font-weight:700;min-width:16px;height:16px;padding:0 4px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-left:4px}
.cand-new-pill{background:var(--blu,#3b7ef6);color:#fff;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;margin-left:6px;vertical-align:middle;white-space:nowrap}
tr.cand-row-new td{background:linear-gradient(90deg,rgba(59,126,246,.06),transparent 60%)}
```

- [ ] **Step 9: Add the surface-render functions in the sandbox**

Dans `index-candidature-test.html`, ajouter **après** le scheduler auto-pull (après l'IIFE `_initAutoPull`, vers la fin du bloc auto-pull) :
```js
// ═══ NOTIFICATION (T13d) — surfaces : bandeau accueil + pastilles nav + dismiss ═══
function _renderCandInboxBanner(){
  const host = el('cand-inbox-banner'); if(!host) return;
  const unread = (DB.candidats||[]).filter(c => c && c.vu === false && !c._deleted && !c._archived);
  const n = unread.length;
  if(n <= 0){ host.innerHTML = ''; return; }
  const names = unread.slice(0,3).map(c => ((c.prenom||'')+' '+(c.nom||'')).trim() || 'Candidat');
  const extra = n > names.length ? (' +'+(n - names.length)) : '';
  host.innerHTML = '<div class="cand-inbox">'
    + '<div class="ci-ic">📩</div>'
    + '<div class="ci-tx"><b>' + n + ' nouveau' + (n>1?'x':'') + ' dossier' + (n>1?'s':'') + ' de candidature reçu' + (n>1?'s':'') + '</b>'
    +   '<div class="s">' + escHtml(names.join(' · ') + extra) + ' — déposé' + (n>1?'s':'') + ' via lien en ligne. Cliquez pour vérifier et traiter.</div></div>'
    + '<button class="btn bp bb" onclick="go(\'candidats\')">Voir les dossiers →</button>'
    + '<button class="ci-x" title="Marquer comme vu" onclick="_candMarkAllSeen()">✕</button>'
    + '</div>';
}
function _renderInboxSurfaces(){
  let n = 0;
  try{ n = countUnreadCandidats(DB.candidats||[]); }catch(e){ n = 0; }
  // Sidebar desktop
  const ni = document.querySelector('.ni[data-module="candidats"]');
  if(ni){
    let b = ni.querySelector('.ni-pastille');
    if(n > 0){ if(!b){ b = document.createElement('span'); b.className = 'ni-pastille'; ni.appendChild(b); } b.textContent = n; }
    else if(b){ b.remove(); }
  }
  // Bottom-nav mobile « Plus »
  const plus = document.querySelector('.v4-bnav .v4-bn[data-page="more"]');
  if(plus){
    let b = plus.querySelector('.v4-bn-badge');
    if(n > 0){ if(!b){ b = document.createElement('span'); b.className = 'v4-bn-badge'; plus.appendChild(b); } b.textContent = n; }
    else if(b){ b.remove(); }
  }
  // Entrée More-sheet
  const mb = el('more-candidats-badge');
  if(mb){ if(n > 0){ mb.textContent = n; mb.style.display = ''; } else { mb.textContent = ''; mb.style.display = 'none'; } }
  // Bandeau accueil
  _renderCandInboxBanner();
}
function _candMarkAllSeen(){
  let changed = false;
  (DB.candidats||[]).forEach(c => { if(c && c.vu === false){ c.vu = true; _stamp(c); changed = true; } });
  if(changed) saveDB();
  _renderInboxSurfaces();
}
```

- [ ] **Step 10: Extend `_relayPullCandidatures` (created/updated/newNames + flag vu + notification)**

Dans `index-candidature-test.html`, dans `_relayPullCandidatures` :

(a) Après `let imported = 0, errors = 0;` (14629), ajouter :
```js
  let created = 0, updated = 0; const newNames = [];
```

(b) Dans la branche `if (isNew) {` (14640-14644), après `DB.candidats.push(cand);`, ajouter :
```js
        cand.vu = false; // T13d : non lu jusqu'à ouverture de la fiche
        created++; newNames.push(((cand.prenom||'')+' '+(cand.nom||'')).trim() || 'Candidat');
```

(c) Dans la branche `else {` (complément, 14645-14653), après le `_auditLog('update', …)`, ajouter :
```js
        updated++;
```

(d) Remplacer le bloc final (14684-14691) :
```js
  if (imported > 0 || errors > 0) saveDB();
  if (imported > 0 && typeof rCandidats === 'function') rCandidats();
  if (!opts.silent) {
    if (imported > 0) showToast(imported + ' dossier' + (imported > 1 ? 's' : '') + ' rapatrié' + (imported > 1 ? 's' : ''), 'ok');
    else if (errors > 0) showToast('Aucun nouveau dossier (' + errors + ' erreur' + (errors > 1 ? 's' : '') + ')', 'warn');
    else showToast('Aucun nouveau dossier déposé', 'ok');
  }
  return { imported, errors };
```
par :
```js
  if (imported > 0 || errors > 0) saveDB();
  if (imported > 0 && typeof rCandidats === 'function') rCandidats();
  try{ _renderInboxSurfaces(); }catch(e){}
  if (created > 0) {
    // Notification d'arrivée — toujours (auto-pull silencieux compris).
    showToast(nouveauDossierToast(newNames), 'ok', 5000);
  } else if (!opts.silent) {
    if (imported > 0) showToast(imported + ' dossier' + (imported > 1 ? 's' : '') + ' actualisé' + (imported > 1 ? 's' : '') + ' (complément)', 'ok');
    else if (errors > 0) showToast('Aucun nouveau dossier (' + errors + ' erreur' + (errors > 1 ? 's' : '') + ')', 'warn');
    else showToast('Aucun nouveau dossier déposé', 'ok');
  }
  return { imported, created, updated, errors, newNames };
```

- [ ] **Step 11: Mark `vu = true` on fiche open**

Dans `index-candidature-test.html`, dans `openFicheCandidat` (14826), juste après la garde `if(!c || !body){ … return; }` (14829), ajouter :
```js
  if(c.vu === false){ c.vu = true; _stamp(c); saveDB(); try{ _renderInboxSurfaces(); }catch(e){} }
```

- [ ] **Step 12: Add the "● Nouveau" pill + row class in `rCandidats`**

Dans `index-candidature-test.html`, dans `rCandidats` (14330-14331) :

(a) Remplacer l'ouverture de ligne 14330 :
```js
    return `<tr onclick="if(typeof openFicheCandidat==='function')openFicheCandidat('${c.id}')" style="cursor:pointer">
```
par :
```js
    return `<tr class="${c.vu===false?'cand-row-new':''}" onclick="if(typeof openFicheCandidat==='function')openFicheCandidat('${c.id}')" style="cursor:pointer">
```

(b) Remplacer la cellule nom 14331 (le fragment `<div class="nm">${escHtml(nomComplet)}${lien}</div>`) par :
```js
<div class="nm">${escHtml(nomComplet)}${lien}${c.vu===false?' <span class="cand-new-pill">● Nouveau</span>':''}</div>
```

- [ ] **Step 13: Refresh surfaces on every navigation + on accueil render**

Dans `index-candidature-test.html` :

(a) Dans `go()`, juste avant la `}` finale (après `if(renders[page]) renders[page]();`, ligne 6068), ajouter :
```js
  try{ _renderInboxSurfaces(); }catch(e){}
```

(b) Dans `rAccueil` (6791), après l'appel à `_renderAccueil(ctx)` (repérer la ligne `_renderAccueil(...)` dans le corps de `rAccueil`), ajouter :
```js
  try{ _renderInboxSurfaces(); }catch(e){}
```

- [ ] **Step 14: Manual visual test in the real browser**

Ouvrir `http://localhost:8080/index-candidature-test.html`.
1. Déposer 2 dossiers via le relais puis « Actualiser les dépôts » (ou laisser l'auto-pull) → **toast** « 📩 Nouveau dossier reçu : … et 1 autre », **pastille « 2 »** sur Candidats (sidebar), **bandeau** sur l'Accueil (icône + noms + bouton + ✕), **pills « ● Nouveau »** + lignes surlignées dans la liste.
2. Ouvrir une fiche → la pastille passe à « 1 », le pill de ce candidat disparaît, le bandeau se met à jour.
3. Cliquer ✕ du bandeau → bandeau disparaît, pastille à 0, pills effacés.
4. **Mobile** (DevTools < 560px) : bandeau en repli vertical (bouton pleine largeur) ; pastille sur « Plus » ; entrée Candidats visible dans le More-sheet avec badge.
Expected: 4 scénarios OK, aucune erreur console.

- [ ] **Step 15: Run the full test suite**

Run: `npx vitest run __tests__/helpers/candidature.test.js`
Expected: PASS (tous les helpers candidature, anciens + nouveaux).

- [ ] **Step 16: Commit**

```bash
git add js/core/candidature.js __tests__/helpers/candidature.test.js index-candidature-test.html
git commit -m "feat(candidature): T13d — notification nouveau dossier (bandeau accueil + pastilles + toast + pill) (sandbox)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Suite (hors de ce plan)

Après T13b/T13c/T13d validés visuellement :
- **Task 14** — registre RGPD : documenter l'auto-pull (rapatriement automatisé, aucune donnée nouvelle).
- **Task 15 (GATE)** — audit agent obligatoire couvrant les 3 composants (fréquence/RGPD de l'auto-pull, non-fuite de capability au repartage).
- **Task 16** — propagation prod : reporter ces edits dans `index.html` + ajouter les 4 helpers à l'import + exposition `js/main.js` + bump version + BACKLOG. Requiert l'OK explicite user.

---

## Self-Review

**1. Spec coverage**
- §3 Composant A (popup partage 2 étapes, reopen, manuel sans réseau, fallback expiré) → **T13b** (Steps 6-7) ✅
- §4 Composant B (3 déclencheurs, `shouldAutoPull`, garde-fous, silencieux) → **T13c** ✅
- §5 Composant C (bandeau A + pastille desktop/mobile/more-sheet + toast + pill + flag `vu` + extension retour pull) → **T13d** ✅
- §6 ordre T13b→T13c→T13d, sandbox-first → respecté ✅

**2. Placeholder scan** : aucun TBD/TODO ; tout le code est complet (helpers, renders, edits ancrés). ✅

**3. Type consistency**
- `shouldAutoPull(lastPullTs, now, intervalMs, hasActiveLinks)` : même signature test (Step 1) / helper (Step 3) / inline (Step 5) / appel scheduler (`shouldAutoPull(_autoPullLastTs, Date.now(), _AUTO_PULL_INTERVAL, hasActive)`). ✅
- `countUnreadCandidats(candidats)` / `nouveauDossierToast(newNames)` : signatures cohérentes test/helper/inline/appels. ✅
- `_relayPullCandidatures` retour `{imported, created, updated, errors, newNames}` : `created`/`newNames` produits (Step 10b) et consommés (toast Step 10d + `nouveauDossierToast`). ✅
- Flag `vu` : posé `false` au pull (10b), lu par `countUnreadCandidats`/`_renderCandInboxBanner`/pills, mis `true` à l'ouverture fiche (Step 11) et au dismiss (Step 9). Backward-compat : anciens candidats `vu === undefined` → non comptés. ✅
- `_renderInboxSurfaces` défini Step 9, appelé Steps 9/10d/11/13. `_renderCandInboxBanner` défini Step 9, appelé par `_renderInboxSurfaces`. ✅
- IDs DOM : `cand-inbox-banner` (Step 6 ↔ Step 9), `more-candidats-badge` (Step 7 ↔ Step 9), `inv-qr-wrap` (réutilisé Step 6 `_complRenderStep2` ↔ `_invToggleQr` existant). ✅
