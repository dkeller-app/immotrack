# Fil rouge de signature unifié — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les 3 boutons de signature du bail par un point d'entrée unique → écran de présence (présentiel/distance/ne signe pas) → signature présentielle **chacun son tour** (un signataire à la fois, jamais de double paraphe) → envoi auto des liens aux distants — en réutilisant 100 % des mécaniques existantes.

**Architecture :** Une couche d'orchestration mince par-dessus l'existant. La modale de présence existe déjà (`openRemoteSignModal`) ; le wizard de signature (`startSignatureWizardV2` + `prerenderPDFPages` + `genPDFNative` + `_wizV2PersistSignatures`) existe déjà. On ajoute (a) un helper pur `buildSignaturePlan`, (b) un filtre « solo signataire » + une file de présentiels **dans la popup** de signature, (c) un orchestrateur qui lit la matrice, lance la popup avec la file, puis envoie les liens aux distants via le relais existant. Le bail-signature est un **document légal opposable** : audit `superpowers:code-reviewer` obligatoire avant livraison.

**Tech Stack :** Vanilla JS (monolithe `index.html` ~52k lignes, code de la popup de signature construit par concaténation `+'...'`), helpers globaux testables (`js/helpers/*.global.js` + Vitest dans `__tests__/helpers/`), Service Worker (`sw.js`), relais Cloudflare Worker (déjà déployé). Vérif syntaxe : `node scripts/check-inline-js.mjs` + parse du JS runtime popup assemblé.

**Contexte codebase (le worker doit le savoir) :**
- Le générateur de signature s'exécute dans une **popup `window.open`** ; tout son JS est une chaîne assemblée par `+'...'` dans `index.html` (bloc `var scripts = '<script>' ... +'<\/script>';`), écrite dans la popup. La popup rappelle l'app via `window.opener`.
- Les variables injectées dans la popup sont sérialisées ainsi (chercher le bloc autour de `var _AUTO_SIGN=`) :
  `+'var _AUTO_SIGN='+JSON.stringify(!!opts.autoSign)+';'`
- Le wizard filtre ses signataires via `_wizV2GetSigs()` selon `window._wizSignWithLocataires` (false=bailleur(s), true=tous, `_wizV2Phase2`=locataire(s)).
- La persistance `_wizV2PersistSignatures()` **fusionne** déjà (`Object.assign`) les signatures — un signataire à la fois est donc supporté nativement.
- État fiche : `const sigSign = bail.signatures && bail.signatures.signedAt; const complet = sigSign && sigMode!=='bailleur-seul'; const partial = sigSign && sigMode==='bailleur-seul';` (index.html:38154-38157).

**Spec :** `docs/superpowers/specs/2026-07-02-bail-signature-fil-rouge-unifie-design.md`
**Référence UX :** `mockups/BAIL-SIGN-UNIFIE/index.html` (validé).

**Règles de livraison (non négociables) :**
- Travailler directement sur `index.html` (pas de sandbox — décision user).
- Après CHAQUE modif : `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`) + parse du JS runtime popup assemblé (script fourni Task 0).
- Bump version 5 emplacements + `sw.js` à la livraison (Task 8).
- Audit `superpowers:code-reviewer` obligatoire avant de dire « prêt à tester » (Task 9).
- `origin/main` bouge vite (sessions parallèles) : rebaser + re-bumper au-dessus de la version courante avant push (Task 8/9).

---

## Task 0 : Outil de vérification du JS runtime popup

**Files:**
- Create: `scripts/verif-popup.cjs`

Le `check-inline-js.mjs` valide le JS de `index.html` mais **pas** le JS assemblé qui tourne dans la popup. Cet outil assemble la chaîne `scripts` et la `new Function()`-parse.

- [ ] **Step 1: Créer le script**

```js
// scripts/verif-popup.cjs — assemble le <script> de la popup de signature et le parse.
const fs = require('fs');
const path = process.argv[2] || 'index.html';
const src = fs.readFileSync(path, 'utf8');
const a = src.indexOf("var scripts = '<script>'");
if (a < 0) { console.error('MARKER var scripts NOT FOUND'); process.exit(2); }
const rhsStart = a + 'var scripts = '.length;
const endTok = "+'<\\/script>';";
const e = src.indexOf(endTok, rhsStart);
if (e < 0) { console.error('END TOKEN NOT FOUND'); process.exit(2); }
const rhs = src.slice(rhsStart, e) + "+'<\\/script>'";
const scope = new Proxy({
  JSON,
  opts: { remoteSign:false, autoPhase2:false, autoSign:true, signQueue:['bailleur-1'], distants:[] },
  bail: { locataires: [], signatures: null },
  window: { BailSignSigid: { buildRemoteSigIdMap: () => [] } },
}, { has: () => true, get: (t,k) => (k in t) ? t[k] : '0' });
let full;
try { full = (new Function('scope','with(scope){ return ('+rhs+'); }'))(scope); }
catch (err) { console.error('ASSEMBLY FAILED:', err.message); process.exit(1); }
const inner = full.replace(/^<script>/,'').replace(/<\/script>$/,'');
try { new Function(inner); console.log('POPUP RUNTIME JS: PARSE OK ('+inner.length+' chars)'); }
catch (err) { console.error('POPUP RUNTIME JS: PARSE ERROR →', err.message); process.exit(1); }
```

- [ ] **Step 2: Vérifier qu'il tourne sur le fichier actuel**

Run: `node scripts/verif-popup.cjs`
Expected: `POPUP RUNTIME JS: PARSE OK (…chars)`

- [ ] **Step 3: Commit**

```bash
git add scripts/verif-popup.cjs
git commit -m "Outil : verif-popup.cjs (parse du JS runtime de la popup de signature)"
```

---

## Task 1 : Helper pur `buildSignaturePlan` (présentiels ordonnés + distants)

**But :** extraire la logique « matrice → plan de signature » en fonction pure testable (règle DRY + TDD). L'orchestrateur (Task 5) et les tests l'utilisent.

**Files:**
- Create: `js/helpers/bail-sign-plan.global.js`
- Test: `__tests__/helpers/bail-sign-plan.test.js`

Suivre le patron du helper global existant `js/helpers/bail-sign-sigid.global.js` (exporte sur `window.BailSignSigid` ET `module.exports`).

- [ ] **Step 1: Écrire le test qui échoue**

```js
// __tests__/helpers/bail-sign-plan.test.js
import { describe, it, expect } from 'vitest';
import { buildSignaturePlan } from '../../js/helpers/bail-sign-plan.global.js';

const mk = (o) => Object.assign({ id:'x', role:'bailleur', nom:'X', mode:'pres', email:'' }, o);

describe('buildSignaturePlan', () => {
  it('ordonne les présentiels bailleur(s) puis locataire(s)', () => {
    const p = buildSignaturePlan([
      mk({ id:'loc-1', role:'locataire', nom:'Jean', mode:'pres' }),
      mk({ id:'bailleur-1', role:'bailleur', nom:'DK', mode:'pres' }),
    ]);
    expect(p.presentiels.map(s => s.id)).toEqual(['bailleur-1', 'loc-1']);
  });
  it('sépare distants et exclut les "no"', () => {
    const p = buildSignaturePlan([
      mk({ id:'bailleur-1', role:'bailleur', mode:'pres' }),
      mk({ id:'bailleur-2', role:'bailleur', mode:'no' }),
      mk({ id:'loc-1', role:'locataire', mode:'dist', email:'a@b.fr' }),
    ]);
    expect(p.presentiels.map(s => s.id)).toEqual(['bailleur-1']);
    expect(p.distants.map(s => s.id)).toEqual(['loc-1']);
    expect(p.hasSigners).toBe(true);
  });
  it('hasSigners=false si tout le monde en "no"', () => {
    const p = buildSignaturePlan([ mk({ mode:'no' }) ]);
    expect(p.hasSigners).toBe(false);
    expect(p.presentiels).toEqual([]);
    expect(p.distants).toEqual([]);
  });
  it('préserve l’ordre d’entrée entre signataires de même rôle', () => {
    const p = buildSignaturePlan([
      mk({ id:'bailleur-2', role:'bailleur', mode:'pres' }),
      mk({ id:'bailleur-1', role:'bailleur', mode:'pres' }),
    ]);
    expect(p.presentiels.map(s => s.id)).toEqual(['bailleur-2', 'bailleur-1']);
  });
});
```

- [ ] **Step 2: Lancer le test → échec attendu**

Run: `npx vitest run __tests__/helpers/bail-sign-plan.test.js`
Expected: FAIL (`Cannot find module '.../bail-sign-plan.global.js'`).

- [ ] **Step 3: Écrire l'implémentation minimale**

```js
// js/helpers/bail-sign-plan.global.js
// Pur : transforme la matrice de présence en plan de signature.
// signers[] : { id, role:'bailleur'|'locataire', nom, mode:'pres'|'dist'|'no', email }
// → { presentiels:[...ordonnés bailleur→locataire], distants:[...], hasSigners:bool }
(function (root) {
  var ROLE_ORDER = { bailleur: 0, locataire: 1 };
  function buildSignaturePlan(signers) {
    var active = (signers || []).filter(function (s) { return s && s.mode !== 'no'; });
    var presentiels = active
      .filter(function (s) { return s.mode === 'pres'; })
      .map(function (s, i) { return { s: s, i: i }; })
      .sort(function (a, b) {
        var ra = ROLE_ORDER[a.s.role] != null ? ROLE_ORDER[a.s.role] : 9;
        var rb = ROLE_ORDER[b.s.role] != null ? ROLE_ORDER[b.s.role] : 9;
        return ra - rb || a.i - b.i;          // ordre légal, stable
      })
      .map(function (x) { return x.s; });
    var distants = active.filter(function (s) { return s.mode === 'dist'; });
    return { presentiels: presentiels, distants: distants, hasSigners: active.length > 0 };
  }
  root.BailSignPlan = { buildSignaturePlan: buildSignaturePlan };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildSignaturePlan: buildSignaturePlan };
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Lancer le test → succès attendu**

Run: `npx vitest run __tests__/helpers/bail-sign-plan.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Charger le helper dans `index.html`**

Trouver la balise qui charge `js/helpers/bail-sign-sigid.global.js` (chercher `bail-sign-sigid.global.js`) et ajouter juste après :

```html
<script src="js/helpers/bail-sign-plan.global.js"></script>
```

- [ ] **Step 6: Vérifier + commit**

Run: `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`)

```bash
git add js/helpers/bail-sign-plan.global.js __tests__/helpers/bail-sign-plan.test.js index.html
git commit -m "Helper : buildSignaturePlan (matrice présence → présentiels ordonnés + distants) + tests"
```

---

## Task 2 : Filtre « solo signataire » + file de présentiels dans la popup

**But :** permettre au wizard de n'afficher les pads que d'**un** signataire à la fois, piloté par une file injectée. C'est le cœur du « chacun son tour ».

**Files:**
- Modify: `index.html` (bloc popup `var scripts`)

- [ ] **Step 1: Injecter la file dans la popup**

Repérer la ligne (chercher `var _AUTO_SIGN=`) :
```
    +'var _AUTO_SIGN='+JSON.stringify(!!opts.autoSign)+';'
```
Ajouter juste après :
```
    +'var _BAIL_SIGN_QUEUE='+JSON.stringify((opts&&opts.signQueue)||null)+';' /* fil rouge : sigIds présentiels ordonnés (chacun son tour) */
    +'var _BAIL_SIGN_DISTANTS='+JSON.stringify((opts&&opts.distants)||[])+';' /* fil rouge : signataires distants à relayer après */
```

- [ ] **Step 2: Ajouter le filtre solo dans `_wizV2GetSigs`**

Repérer la fonction popup `_wizV2GetSigs` (chercher `function _wizV2GetSigs`). Elle contient un enchaînement de filtres se terminant par `return sigs;`. Insérer, juste avant `return sigs;`, un filtre solo prioritaire :
```
    +  'if(window._wizV2SoloSigner){sigs=sigs.filter(function(s){return (s.id||"")===window._wizV2SoloSigner;});}'
```
(Le filtre solo, s'il est actif, prime sur le filtrage par rôle : un seul signataire rendu.)

- [ ] **Step 3: Initialiser la file au démarrage**

Repérer, dans `startSignatureWizardV2` (popup), le bloc `else{` non-phase2 qui contient (après le fix v15.421) :
```
    +    'window._wizSignWithLocataires=false;'
```
Le remplacer par :
```
    /* fil rouge — si une file de présentiels est injectée, on signe chacun son tour :
       le 1er signataire est isolé via _wizV2SoloSigner ; sinon repli bailleur-seul (legacy). */
    +    'if(_BAIL_SIGN_QUEUE&&_BAIL_SIGN_QUEUE.length){window._wizV2SignQueue=_BAIL_SIGN_QUEUE.slice();window._wizV2SignPos=0;window._wizV2SoloSigner=window._wizV2SignQueue[0];window._wizSignWithLocataires=true;}'
    +    'else{window._wizV2SoloSigner=null;window._wizSignWithLocataires=false;}'
```
(`_wizSignWithLocataires=true` + `_wizV2SoloSigner` défini ⇒ `_wizV2GetSigs` part de « tous » puis réduit au solo — l'ordre des filtres le garantit.)

- [ ] **Step 4: Vérifier syntaxe (les deux gardes)**

Run: `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`)
Run: `node scripts/verif-popup.cjs` (attendu `PARSE OK`)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Signature : filtre solo signataire + file de présentiels injectée dans la popup"
```

---

## Task 3 : Avance dans la file (chacun son tour) + mode dérivé des signataires

**But :** après qu'un présentiel a signé, passer au suivant dans la même popup ; ne finaliser (PDF + handoff) qu'après le dernier. Le `mode` persisté doit refléter QUI a signé (pas les vieux flags).

**Files:**
- Modify: `index.html` (popup : `_wizV2Next` branche finale, `_wizV2PersistSignatures`)

- [ ] **Step 1: Mode dérivé des finales dans `_wizV2PersistSignatures`**

Repérer, dans `_wizV2PersistSignatures` (popup), le bloc de calcul du mode (chercher `mode="bailleur-seul"`). Aujourd'hui il déduit le mode de `_wizV2Phase2`/`_wizSignWithLocataires`. Le rendre robuste : dériver de la présence d'une signature locataire dans les finales cumulées.

Remplacer le bloc :
```
    +  '}else if(window._wizSignWithLocataires){'
    +    'mode="avec-locataire";'
    +    'signedBailleurAt=sigBaseISO;'
    +    'signedLocataireAt=sigBaseISO;'
    +  '}else{'
    +    'mode="bailleur-seul";'
    +    'signedBailleurAt=sigBaseISO;'
    +    'signedLocataireAt=undefined;'
    +  '}'
```
par (dérive du contenu des finales — inclut la signature qu'on vient de fusionner) :
```
    /* fil rouge — mode dérivé des signataires effectivement signés (finales), robuste au « chacun son tour » */
    +  '}else{'
    +    'var _finKeys=Object.keys(Object.assign({},window._wizV2FinalSignatures||{},window._wizV2PendingFinal||{}));'
    +    'var _hasLoc=_finKeys.some(function(k){return /^loc/i.test(k);});'
    +    'var _hasBail=_finKeys.some(function(k){return /bailleur|gerant|g\\u00e9rant/i.test(k);});'
    +    'mode=_hasLoc?"avec-locataire":"bailleur-seul";'
    +    'signedBailleurAt=_hasBail?sigBaseISO:(oldSig.signedBailleurAt||oldSig.signedAt);'
    +    'signedLocataireAt=_hasLoc?sigBaseISO:oldSig.signedLocataireAt;'
    +  '}'
```
(Note : `window._wizV2PendingFinal` est le jeu de signatures fraîches capturées à la validation finale — voir Step 2 : il est fusionné dans `_wizV2FinalSignatures` juste avant l'appel à persist, donc `_wizV2FinalSignatures` suffit ; le `Object.assign` défensif couvre l'ordre d'exécution.)

- [ ] **Step 2: Avancer la file au lieu de finaliser (branche finale de `_wizV2Next`)**

Repérer, dans `_wizV2Next` (popup), la branche `if(cur>pages.length){ ... }` — après la validation `if(!allSigned||!allLu){...return;}` et la fusion `window._wizV2FinalSignatures=Object.assign(...)`, se trouve (après fix v15.421) :
```
    +    'if(typeof _BAIL_REMOTE_SIGN!=="undefined"&&_BAIL_REMOTE_SIGN){'
    +      'genPDFNative();'
    +    '}else{'
    +      '_wizV2PersistSignatures();'
    +      'genPDFNative();'
    +    '}'
    +    'return;'
```
Le remplacer par :
```
    /* fil rouge — file de présentiels : on persiste la signature du signataire courant,
       puis s'il en reste, on passe au suivant DANS LA MÊME popup (chacun son tour).
       Seul le dernier déclenche genPDFNative + handoff. Le mode remote reste inchangé. */
    +    'if(typeof _BAIL_REMOTE_SIGN!=="undefined"&&_BAIL_REMOTE_SIGN){'
    +      'genPDFNative();'
    +    '}else if(window._wizV2SignQueue&&window._wizV2SignPos<window._wizV2SignQueue.length-1){'
    +      '_wizV2PersistSignatures();'                         /* fusionne la sig du signataire courant */
    +      'window._wizV2SignPos++;'
    +      'window._wizV2SoloSigner=window._wizV2SignQueue[window._wizV2SignPos];'
    +      'window._wizV2Current=1;'                            /* le suivant reparcourt le document */
    +      '_wizV2ShowHandoff(window._wizV2SignQueue[window._wizV2SignPos-1],window._wizV2SoloSigner);'
    +    '}else{'
    +      '_wizV2PersistSignatures();'
    +      'genPDFNative();'
    +    '}'
    +    'return;'
```

- [ ] **Step 3: Écran de transition « au tour de X » (popup)**

Ajouter, à côté des autres fonctions popup `_wizV2*` (par ex. juste après `_wizV2Render`), une fonction d'inter-signataire. Elle affiche qui vient de signer et qui suit, puis relance le rendu page 1 pour le solo suivant.
```
    +'function _wizV2ShowHandoff(prevSigId,nextSigId){'
    +  'var ov=document.getElementById("wizV2-overlay");if(!ov)return;'
    +  'var nm=function(id){var s=_SIGS.filter(function(x){return x.id===id;})[0];return s?s.nomCourt:id;};'
    +  'ov.innerHTML="<div class=\\"wizV2-card\\" style=\\"text-align:center;padding:34px 18px\\">"'
    +    '+"<div style=\\"font-size:44px\\">\\u2705</div>"'
    +    '+"<h2 style=\\"margin:8px 0 4px\\">"+nm(prevSigId)+" a sign\\u00e9</h2>"'
    +    '+"<p style=\\"color:#475569\\">Passez l\\u2019appareil au signataire suivant.</p>"'
    +    '+"<div style=\\"background:#dcfce7;border:1px solid #bbf7d0;color:#14532d;border-radius:8px;padding:12px;font-weight:600;margin:14px auto;max-width:320px\\">\\ud83d\\udd8a\\ufe0f Au tour de : "+nm(nextSigId)+"</div>"'
    +    '+"<button class=\\"btn-wiz\\" onclick=\\"window._wizV2Current=1;_wizV2Render();_wizV2ScrollTop();\\" style=\\"background:#ff5a3c;color:#fff\\">"+nm(nextSigId)+" est pr\\u00eat \\u2192 continuer</button>"'
    +  '+"</div>";'
    +  '_wizV2ScrollTop();'
    +'}'
```
(Note : réutilise `_SIGS`, `_wizV2Render`, `_wizV2ScrollTop`, la classe `wizV2-card` et `.btn-wiz` déjà présents dans la popup. Corail `#ff5a3c` = accent charte.)

- [ ] **Step 4: Vérifier syntaxe (deux gardes)**

Run: `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`)
Run: `node scripts/verif-popup.cjs` (attendu `PARSE OK`)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Signature : chacun son tour — avance dans la file + écran de transition + mode dérivé des finales"
```

---

## Task 4 : Orchestrateur `_confirmBailSignatureFlow` (matrice → présentiels puis distants)

**But :** à la confirmation de l'écran de présence, construire le plan et lancer la signature présentielle (popup avec file), puis relayer les distants.

**Files:**
- Modify: `index.html` (app principale, près de `_confirmRemoteSignSend`)

- [ ] **Step 1: Écrire l'orchestrateur**

Insérer une nouvelle fonction juste avant `function _confirmRemoteSignSend(ref)` (index.html ~7245). Elle réutilise la lecture DOM de la matrice (mêmes ids `bsd-bsign-i`/`bsd-bdist-i`/`bsd-bemail-i`, `bsd-presentiel-i`/`bsd-email-i` que `_confirmRemoteSignSend`) et le helper `buildSignaturePlan`.

```js
// Fil rouge unifié : lit la matrice de présence (modale ov-send-b), construit le plan,
// lance la signature présentielle (chacun son tour) puis relaie les distants.
function _confirmBailSignatureFlow(ref) {
  const bail = DB.baux[ref];
  const log = DB.logements.find(l => l.ref === ref);
  if (!bail) { showToast('Bail introuvable', 'err'); return; }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 1) Lire la matrice → liste de signataires {id, role, nom, mode, email}
  const signers = [];
  const bSigners = (typeof _bailBailleurSigners === 'function') ? _bailBailleurSigners(bail) : [];
  const bSigidMap = (window.BailSignSigid && window.BailSignSigid.buildBailleurSigIdMap)
    ? window.BailSignSigid.buildBailleurSigIdMap(bSigners) : bSigners.map((_, i) => 'bailleur-' + (i + 1));
  for (let i = 0; i < bSigners.length; i++) {
    const signEl = document.getElementById('bsd-bsign-' + i);
    const distEl = document.getElementById('bsd-bdist-' + i);
    const emailEl = document.getElementById('bsd-bemail-' + i);
    const isSign = !signEl || signEl.checked;
    const isDist = !!(distEl && distEl.checked);
    const mode = !isSign ? 'no' : (isDist ? 'dist' : 'pres');
    const email = emailEl ? emailEl.value.trim() : (bSigners[i].email || '');
    if (mode === 'dist' && !emailRe.test(email)) {
      showToast('Email invalide pour ' + (bSigners[i].nom || ('Co-gérant ' + (i + 1))), 'err', 5000);
      if (emailEl) { emailEl.classList.add('err'); emailEl.focus(); } return;
    }
    signers.push({ id: bSigidMap[i] || ('bailleur-' + (i + 1)), role: 'bailleur', nom: bSigners[i].nom || ('Co-gérant ' + (i + 1)), mode, email });
  }
  const locs = _bsdLocataires(bail);
  for (let i = 0; i < locs.length; i++) {
    const presEl = document.getElementById('bsd-presentiel-' + i);
    const emailEl = document.getElementById('bsd-email-' + i);
    const isPres = !!(presEl && presEl.checked);
    const email = emailEl ? emailEl.value.trim() : ((locs[i] && locs[i].email) || '');
    const mode = isPres ? 'pres' : 'dist';
    if (mode === 'dist' && !emailRe.test(email)) {
      showToast('Email invalide pour ' + ((locs[i] && locs[i].nom) || ('Locataire ' + (i + 1))), 'err', 5000);
      if (emailEl) { emailEl.classList.add('err'); emailEl.focus(); } return;
    }
    signers.push({ id: 'loc-' + (i + 1), role: 'locataire', nom: (locs[i] && locs[i].nom) || ('Locataire ' + (i + 1)), mode, email });
  }

  // 2) Plan
  const plan = window.BailSignPlan.buildSignaturePlan(signers);
  if (!plan.hasSigners) { showToast('Au moins un signataire requis', 'err', 5000); return; }

  // 3) Persister les modes co-gérants (comme _confirmRemoteSignSend), pour buildBailStructure/D2a.
  bail.bailleurSign = signers.filter(s => s.role === 'bailleur')
    .map(s => s.mode === 'no' ? { mode: 'no' } : (s.mode === 'dist' ? { mode: 'dist', email: s.email } : { mode: 'pres' }));
  saveBail(ref);

  // 4) Fermer la modale de présence.
  if (typeof closeM === 'function') closeM('ov-send-b');

  // 5) S'il y a des présentiels → popup de signature avec la file ; sinon → relais direct.
  window.__bailSignPendingDistants = { ref, distants: plan.distants };
  if (plan.presentiels.length) {
    previewBailData(bail, log, ref, { signQueue: plan.presentiels.map(s => s.id), distants: plan.distants });
    // L'envoi des distants est déclenché après retour de la popup (Task 5).
  } else if (plan.distants.length) {
    _sendDistantsAfterSignature(ref);   // Task 5
  }
}
```

- [ ] **Step 2: Vérifier syntaxe + commit**

Run: `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`)

```bash
git add index.html
git commit -m "Signature : orchestrateur _confirmBailSignatureFlow (matrice → présentiels + distants)"
```

---

## Task 5 : Envoi des distants après la signature présentielle

**But :** quand la popup se ferme après la signature des présentiels, envoyer les liens aux distants restants via le relais existant.

**Files:**
- Modify: `index.html` (app principale + hook de fin de popup)

- [ ] **Step 1: Fonction d'envoi des distants (réutilise le relais)**

`_confirmRemoteSignSend(ref)` lit la matrice depuis le DOM de la modale — ici la modale est fermée. On ajoute une fonction qui envoie à partir de l'état persisté (`bail.bailleurSign` déjà posé + distants mémorisés). Insérer près de `_confirmRemoteSignSend` :

```js
// Fil rouge : après la signature présentielle, relaie les distants mémorisés.
// Réutilise la chaîne d'envoi bas-niveau de _confirmRemoteSignSend (extraite si besoin),
// sans relire le DOM (modale fermée). Si aucun distant, no-op.
function _sendDistantsAfterSignature(ref) {
  const ctx = window.__bailSignPendingDistants;
  if (!ctx || ctx.ref !== ref || !ctx.distants || !ctx.distants.length) return;
  // Réutilise _confirmRemoteSignSend en mode « sans DOM » : les modes bailleur sont déjà dans
  // bail.bailleurSign ; les emails/présentiel locataires sont déjà dans bail.locataires.
  // → appeler la primitive d'envoi existante avec la liste des distants.
  _bsRelaySendForDistants(ref, ctx.distants);   // voir Step 2
  window.__bailSignPendingDistants = null;
}
```

- [ ] **Step 2: Extraire la primitive d'envoi de `_confirmRemoteSignSend` (DRY)**

`_confirmRemoteSignSend` fait aujourd'hui : (a) lecture DOM matrice, (b) construction session relais + emails. Extraire (b) dans `_bsRelaySendForDistants(ref, distants)` — la partie « crée la session, envoie le 1er lien, met à jour `bail.signatures.remoteSession` » — et faire que `_confirmRemoteSignSend` l'appelle après sa lecture DOM. Ainsi l'orchestrateur et l'ancien chemin partagent la même primitive (aucune copie).

Concrètement : repérer dans `_confirmRemoteSignSend` (après la boucle de lecture des locataires, là où il construit la session relais et appelle le relais — chercher `remoteSession` / l'appel réseau relais dans cette fonction) et déplacer ce bloc dans une nouvelle fonction `_bsRelaySendForDistants(ref, distants)` prenant la liste des distants au lieu de la relire du DOM. Laisser `_confirmRemoteSignSend` construire `distants` depuis le DOM puis déléguer.

> ⚠️ Cette extraction touche le cœur du relais (légal). L'implémenteur DOIT lire l'intégralité de `_confirmRemoteSignSend` (index.html ~7245-7400) avant d'extraire, et préserver exactement le comportement de l'ancien bouton « Envoyer » (testé Task 7). Ne pas deviner la forme de la session relais — la copier telle quelle dans la primitive.

- [ ] **Step 3: Déclencher l'envoi au retour de la popup**

La popup, après `genPDFNative` du dernier signataire, fait un handoff vers l'opener puis se ferme. Repérer le point où l'opener est notifié de la fin (chercher `window.opener._refreshAfterMutation` dans le bloc de handoff post-`genPDFNative`, ou le `window.close()` de la popup). Après le refresh, l'opener doit tenter l'envoi des distants :

Dans l'app principale, ajouter à la fin de `_refreshAfterMutation` (ou dans le hook de fin de signature existant) un appel idempotent :
```js
if (window.__bailSignPendingDistants) { _sendDistantsAfterSignature(window.__bailSignPendingDistants.ref); }
```
(Idempotent : `_sendDistantsAfterSignature` remet `__bailSignPendingDistants=null` après envoi.)

- [ ] **Step 4: Vérifier + commit**

Run: `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`)
Run: `node scripts/verif-popup.cjs` (attendu `PARSE OK`)

```bash
git add index.html
git commit -m "Signature : envoi des distants après la signature présentielle (primitive relais extraite, DRY)"
```

---

## Task 6 : Point d'entrée unique sur la fiche (3 boutons → 1)

**Files:**
- Modify: `index.html:38200-38202` (boutons fiche) + nouvelle fonction `openBailSignatureFlow`

- [ ] **Step 1: Nouvelle fonction d'entrée**

Ajouter près de `previewBailSignRef` (index.html ~19192) :
```js
// Point d'entrée UNIQUE de la signature : ouvre l'écran de présence (matrice réutilisée).
function openBailSignatureFlow(ref) {
  const bail = DB.baux[ref];
  if (!bail) { showToast('Bail introuvable', 'err'); return; }
  openRemoteSignModal(ref);   // la modale ov-send-b sert d'écran de présence (re-titrée Task 7)
}
```

- [ ] **Step 2: Remplacer les 3 boutons par 1**

Remplacer les lignes 38200-38202 :
```
          ${!sigSign?`<button class="btn bs bb" onclick="previewBailSignRef('${refSafe}')" ...>✍️ Signer le bail</button>`:''}
          ${partial?`<button class="btn bs bb" onclick="previewBailLocataireRef('${refSafe}')" ...>✍️ Le locataire signe</button>`:''}
          ${(bail.signatures&&bail.signatures.remoteSession)?_renderRemoteSignBadge(bail,refSafe):((!complet)?`<button class="btn bs bb" onclick="openRemoteSignModal('${refSafe}')" ...>📨 Envoyer en signature</button>`:'')}
```
par :
```
          ${!complet?`<button class="btn bs bb" onclick="openBailSignatureFlow('${refSafe}')" style="background:#16a34a;color:#fff" title="Signer le bail : présentiel, à distance, ou les deux — chacun son tour">✍️ Signer le bail</button>`:''}
          ${(bail.signatures&&bail.signatures.remoteSession)?_renderRemoteSignBadge(bail,refSafe):''}
```
(Le bouton unique s'affiche tant que le bail n'est pas complet ; le badge `remoteSession` reste en complément quand une session distante est en cours. Les boutons PDF/Partage lignes 38203-38205 sont conservés.)

- [ ] **Step 3: Vérifier + commit**

Run: `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`)

```bash
git add index.html
git commit -m "Signature : point d'entrée unique sur la fiche (3 boutons → 1 « Signer le bail »)"
```

---

## Task 7 : Re-titrer la modale + brancher le bouton de confirmation sur l'orchestrateur

**Files:**
- Modify: `index.html` (`openRemoteSignModal` : titre + bouton confirm)

- [ ] **Step 1: Re-titrer la modale de présence**

Dans `openRemoteSignModal`, remplacer le titre `📨 Envoyer pour signature · étape 1/2` (chercher `bsd-title`) par `✍️ Signer le bail — qui signe, et comment ?`. Idem la mise à jour de titre dans `_remoteSignStep` (`'📨 Envoyer pour signature · étape ' + n + '/2'`) → conserver le compteur d'étape mais adapter le libellé.

- [ ] **Step 2: Brancher le bouton de confirmation sur l'orchestrateur**

Dans `openRemoteSignModal`, le bouton `#bsd-confirm` appelle aujourd'hui `_confirmRemoteSignSend('${ref}')` (index.html ~7150). Le rebrancher sur l'orchestrateur :
```
onclick="_confirmBailSignatureFlow('${ref}')"
```
Le libellé du bouton : adapter selon l'étape (Task 5 gère présentiels vs distants). Laisser « Continuer → » à l'étape 1 et « ✍️ Signer / envoyer » à l'étape 2 (le bouton `#bsd-confirm`).

- [ ] **Step 3: Vérifier que l'ancien bouton « Envoyer » n'existe plus comme entrée directe**

Run: `grep -n "openRemoteSignModal('" index.html`
Attendu : plus aucun `onclick=... openRemoteSignModal` dans la fiche bail (seul `openBailSignatureFlow` y appelle, en interne). Les éventuels autres appelants (relance session) restent valides.

- [ ] **Step 4: Vérifier + commit**

Run: `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`)

```bash
git add index.html
git commit -m "Signature : modale re-titrée « qui signe, et comment ? » + confirm → orchestrateur"
```

---

## Task 8 : Non-régression + reprise + bump version

**Files:**
- Modify: `index.html`, `sw.js`

- [ ] **Step 1: Vérifier la reprise (bail partiellement signé)**

Manuel (déployé — cf. Task 9) : signer un présentiel, fermer, rouvrir « Signer le bail » → l'écran de présence ré-affiche l'état ; les déjà-signés apparaissent non ré-signables. Vérifier qu'`openRemoteSignModal` ne bloque pas un bail `bailleur-seul` (garde ligne ~7065 : `signedAt && mode!=='bailleur-seul'` → OK, autorise la reprise).

- [ ] **Step 2: Non-régression envoi distant seul**

Vérifier que le chemin « tout le monde à distance » (aucun présentiel) appelle bien `_sendDistantsAfterSignature` → `_bsRelaySendForDistants` et produit la même `remoteSession` qu'avant (comparer à un envoi via l'ancien flux sur un bail témoin).

- [ ] **Step 3: Non-régression reload avec-locataire**

Ouvrir un bail signé en `avec-locataire` (ancien mode) → « Aperçu bail » regénère le PDF sans erreur (le reload lit `_SAVED_SIGNATURES.mode`).

- [ ] **Step 4: Bump version (5 emplacements + sw.js)**

Bumper UNIQUEMENT les emplacements d'affichage vers la version courante d'`origin/main` + 1 (vérifier d'abord la version courante, cf. Task 9) :
`<title>Propryo vX</title>` · `<em>vX</em>` · `const IMMOTRACK_VERSION = 'X'` · le récap diag `Propryo vX — Récap` · `sw.js` `CACHE_VER = 'immotrack-vX'`. **Ne pas** toucher les commentaires-features `vX.Y`.

- [ ] **Step 5: Vérifier + commit**

Run: `node scripts/check-inline-js.mjs` (attendu `5 | errors : 0`)
Run: `node scripts/verif-popup.cjs` (attendu `PARSE OK`)
Run: `npx vitest run __tests__/helpers/bail-sign-plan.test.js` (attendu PASS)

```bash
git add index.html sw.js
git commit -m "Signature : fil rouge unifié — non-régression + bump vX"
```

---

## Task 9 : Audit légal obligatoire + livraison

**Files:** aucun (revue + push)

- [ ] **Step 1: Audit `superpowers:code-reviewer`**

Dispatcher un agent `superpowers:code-reviewer` sur le diff complet. Points à vérifier explicitement :
1. **Chaîne présentiels** : matrice → plan → file popup → chacun son tour → persistance fusionnée → mode dérivé correct (bailleur-seul vs avec-locataire vs complet).
2. **Chaîne distants** : primitive relais extraite = comportement identique à l'ancien « Envoyer » (aucune régression de la session relais / emails).
3. **Intégrité légale** : aucun bail marqué signé avec PDF incomplet ; aucune signature perdue ; ordre légal bailleur→locataire respecté ; exclusion co-gérant (`no`) sans bloc §18 = voulue (feature D2a).
4. **Intégrité structurelle popup** : file/handoff/solo-filter laissent le JS runtime équilibré.
5. **Reprise** : bail partiel rouvert → pas de double signature ni d'écrasement de signatures acquises.
6. **Non-régression** : reload avec-locataire, relance session expirée.

- [ ] **Step 2: Corriger les findings, re-vérifier (syntaxe + popup + tests), re-auditer si findings critiques.**

- [ ] **Step 3: Livraison (fusion main + déploiement)**

`git fetch origin` → si `origin/main` a avancé, rebaser et **re-bumper** au-dessus de la version courante (les sessions parallèles bumpent vite). Push fast-forward `git push origin <branche>:main` (jamais de force, jamais de clobber). Vérifier le déploiement live (`curl` du `<title>` sur l'URL github.io).

- [ ] **Step 4: Mettre à jour le mockup/spec si le comportement livré diverge, et signaler à l'utilisateur le scénario de test.**

---

## Self-review du plan

- **Couverture spec** : §2 fil rouge → Tasks 3/6/7 · §3 réutilisation → Tasks 1/4/5 (helper + orchestrateur + primitive relais) · §4.1 entrée unique → Task 6 · §4.2 filtre solo → Task 2 · §4.3 orchestrateur → Tasks 4/5 · §4.2 chacun son tour → Task 3 · §5 préservation → Tasks 5/8 (non-régression) · §8 cas limites → Tasks 3/8 · §9 tests → Tasks 0/1/9. ✅
- **Type/nom cohérents** : `buildSignaturePlan` (Task 1) utilisé Task 4 ; `_wizV2SoloSigner`/`_wizV2SignQueue`/`_wizV2SignPos` (Task 2) utilisés Task 3 ; `_confirmBailSignatureFlow` (Task 4) branché Task 7 ; `_sendDistantsAfterSignature`/`_bsRelaySendForDistants` (Task 5) appelés Tasks 4/5 ; `openBailSignatureFlow` (Task 6) branché Task 6 ; `_BAIL_SIGN_QUEUE`/`_BAIL_SIGN_DISTANTS` (Task 2) lus Task 3. ✅
- **Zones à haut risque** (signalées) : Task 5 Step 2 (extraction primitive relais légale — lire tout `_confirmRemoteSignSend` avant) ; Task 3 Step 1 (mode dérivé). Audit Task 9 couvre.
