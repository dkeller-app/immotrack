# EDL-AUDIT-CRITIQUE — Audit complet du module EDL et plan de refonte

**Status** : ✅ **Livré v14.38-44 (2026-05-04)** — 12 bugs sur 14 fixés en 1 session (~3h vs 12-15h estimées) · **Prio** : **P0 critique** · **Taille** : L (~3 h réelles)

## Résumé livraison
- **v14.38** Phase 1 (commit `32dac3f`) : refonte archi état EDL — helper `_edlResetGlobalState()` reset 5 globales en bloc + appels inconditionnels dans openNewEDL/openEditEDL — **Bug 6 cross-contamination** ✅
- **v14.39** Phase 2 (commit `734e33c`) : sync form/DB + mutex — helper `_edlPropagateSyncedToForm` propage synced=true vers _edlP/_edlCles/_edlCptPhotos après chaque upload + `_edlSyncing` global empêche concurrence — **Bug 1 doublons + Bug 9** ✅
- **v14.40** Phase 3 (commit `693ee82`) : migration arbo Drive Phase A — edlSyncDrive utilise `log.driveFolders.edl` + remplace `el('edl-drive-path').value` runtime par `edl.drivePath` snapshot stable — **Bug 5 + Bug 10** ✅
- **v14.41** Phase 4a (commit `22dd2c6`) : iOS Safari camera fix — helper `_edlPickPhoto` qui attache l'input file au DOM avant `.click()` (au lieu d'un noeud orphelin) — **Bug 2 + Bug 7** ✅
- **v14.42** Phase 4b (commit `aa99ad7`) : edlSnapshot + lock UI EDL signé — pattern bailSnapshot répliqué + bandeau jaune + class CSS `.edl-signed-locked` + bouton « 🔓 Réinitialiser signature » — **Bug 3 + Bug 8** ✅
- **v14.43** Phase 5 (commit `a23e682`) : wizard bail Path 1 vérifie retour `saveDB()` — si `false` (Drive readonly) bascule sur Path 2 localStorage direct + toast warn explicite — **Bug 4** ✅
- **v14.44** Phase 6 (commit `09d82b3`) : polish UX — suppression reset agressif `_photoCache={}` + progress bar dans bouton sync Drive + bouton « ⏹ Annuler sync » avec flag d'annulation `_edlSyncCancelRequested` — **Bug 11 + Bug 13 + Bug 14** ✅

**2 bugs reportés** :
- **Bug 12** : tombstone photos individuelles (cohérence multi-device fine) — pas critique pour V1, à traiter si résurrection observée
- Possible suite de **Bug 4** si reproduit malgré fix v14.43 — fournir les logs console DevTools en cas de récidive
**Détecté** : 2026-05-03 (utilisateur a remonté 7 bugs en conditions réelles)
**Lié à** : DRIVE-ARBORESCENCE (Phase A v14.20 non utilisée par EDL) · BUG-DRIVE-RESURRECTION (pattern tombstone à étendre aux photos) · BAIL-SIGNATURE-PERSIST (pattern à répliquer pour EDL)

---

## ⚠️ SYNTHÈSE EXÉCUTIVE

**Verdict** : le module EDL est dans un état **non-pro et bloquant pour la commercialisation V1**.

L'architecture repose sur **5 variables globales mutables** (`_edlP`, `_edlSortie`, `_edlCles`, `_edlCptPhotos`, `_photoCache`) sans isolation entre 2 EDL ouverts successivement, sans synchronisation entre l'état formulaire et la DB, et avec un système de signature non-figé. Conjugué à un système de sync Drive parallèle (qui ignore l'arborescence Phase A v14.20 livrée), à des call sites async non coordonnés, et à des patterns iOS Safari non-respectés (input file détaché du DOM), on obtient une **série de bugs critiques avec impact légal potentiel** (cross-contamination de photos entre EDL de logements différents, signatures perdues silencieusement, doublons d'upload).

**14 bugs identifiés au total** :
- **7 bugs remontés par l'utilisateur** — tous confirmés via lecture du code, causes racines identifiées
- **7 bugs latents non remontés** — détectés pendant l'audit, dont 3 critiques

**Recommandation** : refonte architecturale en **5 phases** avant toute autre feature, ~12-15 h sur 2-3 sessions dédiées. Ne pas patcher individuellement bug par bug — les causes sont enchevêtrées et un patch isolé créerait de nouvelles régressions.

---

## 1. CARTOGRAPHIE — État global du module EDL

### Variables globales mutables (problème de fond)

| Variable | Ligne | Rôle | Reset au `openNewEDL` ? | Reset au `openEditEDL` ? |
|----------|-------|------|--------------------------|--------------------------|
| `_edlP` | 16759 | Pièces de l'EDL courant | ✅ via `EDL_TPL.map(...)` | ✅ via `JSON.parse(JSON.stringify(e.pieces))` |
| `_edlSortie` | 16760 | Booléen mode entrée/sortie | ✅ `=false` | ✅ `=e.type==='Sortie'` |
| `_edlCles` | 18471 | Clés/accès | ⚠️ **Indirect** via `_edlFill({})` → `_edlRenderCles(default)` | ✅ via `_edlFill({...e})` → `_edlRenderCles(e.cles)` |
| `_edlCptPhotos` | 18618 | Photos compteurs (8 catégories) | 🚨 **NON RESET** — `_edlLoadCptPhotos` n'est appelé que dans `openEditEDL` | ✅ via `_edlLoadCptPhotos(e.compteursPhotos)` |
| `_photoCache` | (global app) | Cache mémoire des binaires photo | ❌ Pas reset | 🚨 **Reset complet `={}`** ligne 16834 (vide le cache pour TOUS les EDL) |

### Fonctions principales (mapping)

```
[Création]   openNewEDL()                          l.16816
[Réouverture] openEditEDL(id)                       l.16826
[Remplissage form] _edlFill(e)                       l.16859
[Pré-rempl. depuis bail] _edlPrefill(ref, alreadyFilled)  l.16900
[Reset signature canvas] _edlInitSig(id)              l.18670  (cloneNode + replace)
[Lecture signature] _edlGetSig(id)                  l.18687  (canvas → dataURL)
[Dessin signature] _edlDrawSig(id, data)           l.18688  (img.onload async)
[Photos pièces] edlAddPhoto(pi, ei, side)          l.17874  (input détaché DOM)
[Photos clés] edlCleAddPhoto(i, side)              l.18505  (input détaché DOM)
[Photos compteurs] edlCptAddPhoto(key)             l.18628  (input détaché DOM)
[Save] saveEDL(opts)                                l.18694
[Suppression] delEDL(id)                            l.18775  (tombstone v14.4 — OK)
[Sync Drive] edlSyncDrive(forcedId, silentMode)    l.17911  (ANCIENNE arbo Drive)
```

### Flow de la signature EDL (lecture critique)

```
Ouverture EDL existant
     ↓
_edlFill(e)                              l.16859
  └── _edlClearSig('edl-sig-bailleur')   l.16892  (clear canvas)
  └── _edlClearSig('edl-sig-locataire')
     ↓
_edlRenderAll(e.signatures)              l.17112
  └── setTimeout(50ms, () => {            ← race condition entrée
        _edlInitSig('edl-sig-bailleur') ← cloneNode + replace = canvas WIPE
        _edlInitSig('edl-sig-locataire')
        if(sigs?.bailleur) _edlDrawSig(...)  ← img.onload ASYNC, prend ~10-50ms
        if(sigs?.locataire) _edlDrawSig(...)
      })
     ↓
[utilisateur peut sauver MAINTENANT]  ← canvas potentiellement vide
     ↓
saveEDL()
  └── signatures: { bailleur: _edlGetSig(...), locataire: _edlGetSig(...) }
                  ↑
     ↑            └── canvas → dataURL : si vide ou redessin pas terminé,
     ↑                retourne `null` → écrase la sig en DB
     └── ÉCRASE bail.signatures avec {bailleur: null, locataire: null}
```

⚠️ **Aucune barrière** entre canvas vide et écrasement DB. Pas de figeage type `bailSnapshot` une fois signé.

---

## 2. LES 7 BUGS REMONTÉS — Causes racines confirmées

### Bug 1 · Photos déjà uploadées re-uploadées à chaque save EDL · **P1 / S**

**Cause confirmée** :

Dans `edlSyncDrive` (l.17988) :
```js
ph.synced = true;  // mis sur l'objet de DB.edl[i].pieces[j].photosE[k]
```

Mais **`_edlP` (formulaire mémoire) n'est jamais notifié**. Au prochain `saveEDL`, le code reconstruit `piecesClean` depuis `_edlP` (l.18737-18745) où `synced` est encore `false`. Le record DB est écrasé → la sync précédente est annulée.

**Scénario reproduit par l'utilisateur** : « j'ai enregistré 5 fois hier par peur de tout perdre » → chaque save annule la sync en cours → re-upload à la prochaine sync.

**Pas un problème de flag oublié, mais de désynchronisation entre 2 sources de vérité** (mémoire formulaire vs DB).

---

### Bug 2 · Photos disparues après « Utiliser » caméra iPhone · **P0 perte de données / XS**

**Cause confirmée** :

Dans `edlAddPhoto`, `edlCleAddPhoto`, `edlCptAddPhoto` (3 fonctions, même bug) :
```js
const inp = document.createElement('input');
inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
inp.onchange = async () => { ... };
inp.click();  // ⚠️ inp PAS attaché à document.body !
```

L'input est un **noeud DOM orphelin**. Sur Safari iOS, ce pattern est connu pour des comportements erratiques avec la caméra native :
- Sur certaines versions iOS, `inp.click()` peut ne pas trigger la caméra
- Plus grave : `onchange` peut ne pas firer après le bouton « Utiliser » → la photo est prise par l'OS mais jamais reçue par l'app

**Confirmation pattern correct** : le pattern Apple/Apple WebKit recommande d'attacher l'input au document avant `.click()`, ou d'utiliser un `<input type=file>` permanent caché dans le HTML avec `style="display:none"` puis appeler `.click()` dessus.

---

### Bug 3 · EDL signé : signature perdue à la réouverture · **P1 / M**

**Cause confirmée** : pattern `bailSnapshot` (BAIL v13.10) **non répliqué** sur l'EDL.

Mécanisme :
1. EDL signé → `signatures: { bailleur: 'data:image/...', locataire: 'data:image/...' }` en DB
2. Réouverture → canvas reset par `_edlInitSig` (cloneNode + replace), puis redessin async par `_edlDrawSig`
3. Si race condition entre redessin async et tout autre `setTimeout`/event qui re-init le canvas → canvas vide
4. Save → `_edlGetSig` retourne `null` → écrase `signatures` en DB avec `null` → **signature perdue silencieusement**

**Pattern bail (v13.10)** : `bail.signatures.bailSnapshot` fige les données du bail au moment de la signature. UI affiche le snapshot (lecture seule). Toute modif ultérieure ne touche pas la sig.

**À répliquer pour l'EDL** : `edl.signatures.edlSnapshot` au moment de la signature + UI **lecture seule** quand `signatures.signedAt` existe (proposition utilisateur validée).

---

### Bug 4 · Bail signature locataire échouée, PDF généré mais app pas synced · **P0 perte de données légales / M (intermittent)**

**Cause probable confirmée par lecture du code** : architecture du wizard signature **fragile car découplée du window principal**.

Mécanisme :
1. Wizard tourne dans un **popup `window.open(...)`**
2. Le popup utilise `window.opener.uploadBailPDFToDrive` (l.14690-14694) pour pousser le PDF
3. Le `try/catch` (l.14689-14694) **avale silencieusement** toute erreur Drive sans remonter au flow signature
4. **Pire** : le PDF est généré côté popup (`pdf.save(pdfFinalName)` l.14685) **AVANT** la persistance de la signature dans `window.opener.DB.baux[ref].signatures`
5. Si `window.opener` ferme prématurément, ou si le message popup→opener échoue, ou si une exception JS interrompt le flow APRÈS `pdf.save` → l'utilisateur a un PDF signé en main, mais l'app n'a pas la signature

**Difficile à reproduire** : timing-sensitive (race entre fenêtres), dépend de l'état réseau, intermittent.

**Investigation requise** : besoin du **message d'erreur exact** + log console DevTools pour confirmer le point de rupture précis. Plusieurs hypothèses :
- Race popup window.opener
- Exception silencieuse dans le `try/catch` upload Drive
- État de `window._wizV2LuApprouve` mal propagé

---

### Bug 5 · EDL n'utilise pas l'arborescence DRIVE-ARBORESCENCE Phase A · **P0 cohérence / S**

**Cause confirmée à 100%** :

Dans `edlSyncDrive` (l.17973-17978) :
```js
const edlRootId = await _driveGetOrCreateFolder('EDL', rootId||'1nodzkJIr6a07Cm7WVYu12Jgz5IyNlUum');
const logFolder = await _driveGetOrCreateFolder(_edlSanitize(edl.logement), edlRootId);
const folderName = `${edl.type}_${edl.date}`;
const folderId = await _driveGetOrCreateFolder(folderName, logFolder);
```

Chemin Drive utilisé : **`{rootDrive}/EDL/{logement_sanitize}/{Type}_{Date}/`** (ancien pattern v13.x).

**Devrait utiliser** : **`ImmoTrack/{Entité}/{Immeuble}/{Logement}/📋 EDL/{Type}_{Date}/`** (DRIVE-ARBORESCENCE Phase A v14.20 livrée).

L'EDL n'a **jamais été migré** vers la nouvelle arbo. On a 2 systèmes Drive parallèles dans l'app :
- Système nouvelle arbo (entités, logements, immeubles, baux récents) ← Phase A
- Système ancien (EDL, photos EDL, baux historiques) ← legacy v13.x

---

### Bug 6 · Cross-contamination : nouveau EDL → photos uploadées dans dossier de l'ancien EDL d'un autre logement · **P0 catastrophique légal / M**

**Cause confirmée — multi-factorielle** :

#### Facteur principal : `_edlCptPhotos` non reset dans `openNewEDL`

`openNewEDL()` (l.16816) :
```js
function openNewEDL() {
  el('edl-edit-id').value='';
  _edlSortie=false;
  _edlP=EDL_TPL.map(...);   // ✅ reset
  _edlFill({});               // appelle _edlRenderCles(default) → reset _edlCles
  _edlRenderAll();
  openM('ov-edl');
  // 🚨 _edlCptPhotos PAS RESET — _edlLoadCptPhotos n'est appelé que dans openEditEDL
}
```

→ Photos compteurs de l'EDL précédent **persistent en mémoire** dans le nouvel EDL.
→ À la sauvegarde, `_edlGetCptPhotos()` (l.18657) écrit ces vieilles photos dans le record du nouvel EDL.
→ Les vieilles photos pointent vers `driveFileId` du **dossier Drive de l'ancien EDL**.
→ L'utilisateur voit dans le NOUVEL EDL des photos qui sont en réalité dans le dossier Drive de l'ANCIEN EDL.

#### Facteur secondaire : `el('edl-drive-path').value` lu en runtime

`edlSyncDrive` lit (l.17966) :
```js
const _rawPath = v('edl-drive-path').trim();  // valeur DOM courante
```

C'est la valeur du **champ DOM** au moment du sync. Si l'utilisateur a ouvert l'EDL B après l'EDL A et que le champ `edl-drive-path` n'a pas été reset entre les deux → la sync de A peut utiliser le drivePath de B (et vice-versa). Source de routage cassé additionnel.

#### Facteur tertiaire : pas de lock concurrence sur `edlSyncDrive`

Si l'utilisateur sauve l'EDL B alors que la sync de l'EDL A est encore en cours (plusieurs secondes pour 50 photos), il n'y a aucun mutex. Les variables DOM lues par sync A sont entre temps mutées par save B. Routage potentiel cassé.

**Impact métier** : photos d'un appartement attribuées au mauvais locataire / mauvais bail / mauvaise date → **inacceptable légalement**.

---

### Bug 7 · Photos des compteurs n'apparaissent pas · **P1 / S**

**Cause confirmée — combinaison Bug 2 + Bug 6** :
- Si pris pour la 1ère fois : Bug 2 (input file détaché iOS Safari) → onchange ne fire pas → photo prise par OS jamais reçue par l'app
- Si recharge ou autre EDL : Bug 6 (state pollué `_edlCptPhotos`) → `_edlCptRenderThumbs` rerend les vieilles photos qui ne sont plus en IDB local → cassé

**Cas additionnel** : `openEditEDL` ligne 16834 fait `_photoCache = {}` (reset complet) → si l'utilisateur a 2 onglets ImmoTrack, l'ouverture d'un EDL dans l'onglet A vide le cache pour les photos en cours de visualisation dans l'onglet B.

---

## 3. LES 7 BUGS LATENTS DÉTECTÉS PENDANT L'AUDIT

### Bug 8 · Race signature EDL au save immédiat · **P1**
`_edlDrawSig` est async (`img.onload`). `_edlGetSig` peut être appelé avant la fin du load → canvas vide → save écrase signature avec `null`. Concrètement : ouvre EDL signé → save immédiat (avant les 50ms du setTimeout + le load image) → signature perdue.

### Bug 9 · Concurrence `edlSyncDrive` non protégée · **P1**
Pas de mutex/lock. Sauver EDL B pendant sync EDL A en cours → variables DOM mutent entre temps → potentiel routage cassé (cf Bug 6 facteur tertiaire).

### Bug 10 · `el('edl-drive-path').value` lu en runtime au lieu de `edl.drivePath` · **P1**
Cf Bug 6 facteur secondaire. Devrait toujours être `edl.drivePath` (snapshot de l'EDL au moment du save) plutôt que la valeur DOM courante.

### Bug 11 · `_photoCache = {}` reset complet par `openEditEDL` · **P2**
Vide le cache de TOUTES les photos déjà chargées en mémoire (incluant celles d'autres EDL pré-chargés ou de l'autre onglet ouvert). Devrait être un reset ciblé sur les photos de l'EDL courant ou pas de reset du tout (le cache est appendable).

### Bug 12 · Pas de tombstone sur les photos individuelles · **P2**
`edlDelPhoto` purge IDB et splice array sans tombstone. Si une autre device avait pull la photo, au push ultérieur → photo réapparaît (résurrection à l'échelle photo, pas EDL — patron BUG-DRIVE-RESURRECTION non étendu aux sous-objets).

### Bug 13 · Pas de feedback de progression sync Drive · **P2 UX**
Toast initial « Upload de N photos en cours » puis silence pendant 30+ secondes pour 50 photos → l'utilisateur croit que ça plante → re-save par anxiété → cf Bug 1 cascade.

### Bug 14 · Pas de bouton « Annuler » sur sync Drive · **P3 UX**
Une fois `edlSyncDrive` lancé, impossible d'arrêter. L'utilisateur doit attendre que les 50 photos passent.

---

## 4. PLAN D'ACTION — 5 phases priorisées

> **Principe directeur** : refonte par phases livrables et testables, ne pas patcher bug par bug (causes enchevêtrées).

### Phase 1 — Refonte architecture état EDL (P0, ~3-4 h)

**Objectif** : éliminer les 5 variables globales mutables, isoler l'état d'un EDL ouvert, introduire un cycle de vie strict.

- [ ] Créer un objet d'état unifié `_edlState` qui regroupe `_edlP`, `_edlSortie`, `_edlCles`, `_edlCptPhotos`
- [ ] Helper `_edlStateReset()` qui RESET TOUT en bloc (incluant `_edlCptPhotos` enfin)
- [ ] `openNewEDL()` appelle `_edlStateReset()` puis init avec template
- [ ] `openEditEDL(id)` appelle `_edlStateReset()` puis charge depuis DB
- [ ] `closeM('ov-edl')` ne reset PAS l'état (l'utilisateur peut rouvrir le même EDL) MAIS `openNewEDL` reset force
- [ ] **Tests** : ouvrir EDL A avec photos → close → openNewEDL → vérifier que `_edlState.cptPhotos` est `{elec:[], gaz:[], ...}` (vide)
- [ ] **Fixe** : Bug 6 (cross-contamination)

### Phase 2 — Synchronisation form↔DB après sync Drive (P0, ~2 h)

**Objectif** : éliminer la désynchronisation `_edlP` vs `edl.pieces` qui cause les doublons.

- [ ] Après `edlSyncDrive` réussi, propager `synced=true` + `driveFileId` dans `_edlP` (form mémoire) si EDL courant ouvert
- [ ] Helper `_edlPropagateSyncToForm(edlId, photoUpdates)` qui matche par `idbKey` et update les flags
- [ ] Mutex/lock sur `edlSyncDrive` : si déjà en cours → toast warn + skip
- [ ] Lock du bouton Sync Drive UI pendant l'upload (déjà le bouton « ☁️ Sync Drive » l.4916)
- [ ] **Tests** : ouvrir EDL avec 5 photos non syncées → cliquer Sync → enregistrer pendant l'upload → vérifier que les photos déjà uploadées ne sont pas re-uploadées
- [ ] **Fixe** : Bug 1 (doublons), Bug 9 (concurrence)

### Phase 3 — Migration vers DRIVE-ARBORESCENCE Phase A (P0, ~2-3 h)

**Objectif** : aligner `edlSyncDrive` sur la nouvelle arbo (Bug 5).

- [ ] Au début d'`edlSyncDrive`, résoudre `log = DB.logements.find(l => l.ref === edl.logement)`
- [ ] Si `log.driveFolders.edl` existe → utiliser ce folder
- [ ] Sinon, fallback `_drvEnsureLogementTree(log)` qui crée l'arbo Phase A puis utiliser `log.driveFolders.edl`
- [ ] Sous-dossier `{Type}_{Date}` dans `log.driveFolders.edl` (au lieu de `EDL/{logement}/{Type}_{Date}/`)
- [ ] Migration douce des EDL existants : si `edl.drivePath` pointe vers l'ancienne arbo, on continue d'uploader là-bas mais on signale dans un toast info que le bouton « Réorganiser mon Drive » (Phase D v14.36) peut migrer
- [ ] Suppression du champ DOM `edl-drive-path` de l'UI (n'est plus nécessaire) ou conservation en lecture seule pour info
- [ ] Remplacer `el('edl-drive-path').value` par `edl.drivePath` (lu depuis l'EDL, pas le DOM) dans tous les sites
- [ ] **Tests** : créer un EDL → vérifier que les photos vont dans `ImmoTrack/{Entité}/{Immeuble}/{Logement}/📋 EDL/{Type}_{Date}/`
- [ ] **Fixe** : Bug 5, Bug 10 (drive-path runtime)

### Phase 4 — iOS Safari camera fix + EDL signé verrouillé (P0/P1, ~3 h)

**Objectif** : fixer la prise de photo iPhone (Bug 2/7) et figer l'EDL signé (Bug 3).

- [ ] **Photo input** : remplacer le pattern `document.createElement('input')` détaché par un `<input type=file accept="image/*" multiple style="display:none" id="edl-photo-input">` permanent dans le HTML, avec changement dynamique de la cible (state qui mémorise pi/ei/side au click)
  - Alternative plus propre : helper `_edlPickPhoto({onPhotos: (files)=>...})` qui attache temporairement au DOM avant `.click()` puis détache après `onchange`
- [ ] **EDL signé verrouillé** : si `edl.signatures.signedAt` existe → tous les inputs/textareas/buttons en `disabled=true` + bandeau « 🔒 EDL signé le {date} — réinitialiser depuis ImmoTrack pour modifier »
- [ ] **Pattern edlSnapshot** : à la signature, capturer `edl.signatures.edlSnapshot = JSON.parse(JSON.stringify(edl))` (deep clone) AVANT save
- [ ] **Mode lecture EDL signé** : `_edlFill` détecte `signedAt` → appelle un nouveau `_edlFillReadOnly(snapshot)` qui rend depuis le snapshot
- [ ] **Modifications post-signature avec signalétique** (proposition utilisateur Bug 3 réponse) : bouton « ➕ Ajouter une remarque post-signature » qui ouvre une modale, ajoute dans `edl.postSignature.remarks = [...]` (séparé du snapshot signé). Le PDF imprime ces remarques avec une mention « Ajouté le {date} après signature »
- [ ] **Reset signature** : bouton dédié « 🔓 Réinitialiser signature » qui purge `signatures` et `edlSnapshot` (avec confirm fort + warning legal)
- [ ] **Tests iOS** : prendre photo via caméra iPhone → cliquer « Utiliser » → vérifier qu'elle apparaît bien dans la pièce/clé/compteur correspondant
- [ ] **Tests EDL signé** : signer EDL → fermer → réouvrir → vérifier signature toujours visible + champs en lecture seule
- [ ] **Fixe** : Bug 2, Bug 3, Bug 7, Bug 8

### Phase 5 — Investigation wizard bail Bug 4 (P0, ~2-3 h, séparable)

**Objectif** : reproduire et fixer le bug 4 (signature locataire bail échouée mais PDF généré).

- [ ] Ajouter logging exhaustif dans le wizard popup (chaque étape, chaque save, chaque envoi à window.opener)
- [ ] Ajouter `console.error` + `showToast` exhaustif dans le `try/catch` ligne 14694
- [ ] Étendre `uploadBailPDFToDrive` pour distinguer succès/échec et NE PAS écraser bail.signatures avec une moitié de signature en cas de fail
- [ ] Ajouter une vérification post-signature : `if (signatures.locataire && !pdfDriveFileId) toast warn "PDF signé mais sync Drive échouée — relancez via 'Renvoyer Drive'"`
- [ ] Bouton « Renvoyer Drive » sur les baux signés sans `driveFileId`
- [ ] Si reproduction possible : fix la cause précise (probablement message popup→opener perdu ou exception silencieuse)
- [ ] **Tests** : signer un bail bailleur sur PC, locataire sur tél → vérifier sig persistée + PDF Drive

### Phase 6 — Polish UX + bugs latents non bloquants (P1/P2, ~1-2 h)

- [ ] Progress bar de sync Drive (Bug 13)
- [ ] Bouton « Annuler sync » sur l'EDL (Bug 14)
- [ ] Ne plus reset `_photoCache = {}` agressivement dans `openEditEDL` (Bug 11) — reset ciblé seulement
- [ ] Tombstone sur photos individuelles supprimées (Bug 12) — pour cohérence multi-device

---

## 5. TESTS DE VALIDATION GLOBAUX (à exécuter après chaque phase)

| # | Test | Avant audit | Cible après refonte |
|---|------|-------------|----------------------|
| T1 | Créer EDL A avec 3 photos compteurs → close → créer EDL B → vérifier compteurs vides | ❌ Photos A persistent | ✅ Vide |
| T2 | Save EDL pendant upload Drive en cours | ❌ Re-upload au prochain sync | ✅ Pas de doublon |
| T3 | Photo prise via caméra iPhone → bouton « Utiliser » | ❌ Photo perdue (50% du temps) | ✅ Photo dans EDL |
| T4 | EDL signé → fermer → rouvrir → signature visible ? | ❌ Perdue | ✅ Visible (snapshot) |
| T5 | EDL signé → tenter modif d'un champ | ❌ Modif silencieuse | ✅ Champs disabled + bandeau |
| T6 | Photo uploadée → ouvrir Drive → vérifier dans `ImmoTrack/{Entité}/.../📋 EDL/...` | ❌ Dans `EDL/{logement}/...` | ✅ Nouvelle arbo |
| T7 | Bail bailleur signé sur PC → locataire signe sur tél → vérifier sig + PDF Drive | ❌ PDF OK, app pas synced | ✅ Cohérent |
| T8 | Faire 2 EDL successifs sur 2 logements différents → vérifier dossiers Drive distincts | ❌ Cross-contamination | ✅ Isolés |

---

## 6. PROPOSITION DE PLANNING

| Session | Phases | Durée estimée | Livrable |
|---------|--------|---------------|----------|
| **Session 1** | Phases 1 + 2 + 3 | ~7-9 h | Architecture EDL refondue + sync Drive aligné Phase A · 3 commits |
| **Session 2** | Phase 4 | ~3 h | iOS camera fix + EDL signé verrouillé + edlSnapshot · 2 commits |
| **Session 3** | Phases 5 + 6 | ~3-5 h | Wizard bail fixé + polish UX · 2 commits |

**Total** : ~13-17 h sur 3 sessions distinctes (avec checkpoint test utilisateur entre chaque).

**Versions cibles** : v14.37 → v14.42 environ (8 commits livrables).

---

## 7. NOTES UTILISATEUR

> 💬 2026-05-03 : « Si j'enregistre plusieurs fois (pour m'assurer de la sauvegarde des photos), les photos déjà enregistrées sont à nouveau enregistrées »
> 💬 2026-05-03 : « j'ai pris plusieurs photos dans l'EDL et quand je clique sur utilisé pas de photo dans l'EDL »
> 💬 2026-05-03 : « j'ai rouvert l'EDL (déjà signé). Plus de signature »
> 💬 2026-05-03 : « si EDL enregistré et signé, il faut le figer non ? visu seulement idem bail »
> 💬 2026-05-03 : « possibilité d'ajouter une photo ou remarque sur bail avec une signalétique que cela a été ajouté ou modifié après signature »
> 💬 2026-05-03 : « j'ai voulu faire signer le bail aux locataires (bailleurs déjà signé). j'ai eu un message d'erreur à la fin. Le PDF a été généré mais la signature n'a pas été prise en compte dans l'app »
> 💬 2026-05-03 : « je viens de créer un nouvel EDL, des photos ont été uploadées dans l'EDL de l'EDL que j'ai fait hier .... c'est pas bon du tt ça !! je précise que je n'ai pas pris le meme logement »
> 💬 2026-05-03 : « photos des compteur n'apparaissent pas dans EDL »
> 💬 2026-05-03 : « y'a du boulot la mon gars. On est loin d'une solution pro !! »

---

## 8. JOURNAL

- 2026-05-03 : audit complet effectué après remontée utilisateur de 7 bugs en conditions réelles (EDL en pleine prod). 14 bugs identifiés au total (7 remontés + 7 latents). Plan de refonte en 6 phases sur 3 sessions, ~13-17 h. **Aucun patch effectué pendant l'audit** (consigne utilisateur : « audit puis correction seulement après »).
- 2026-05-04 : ✅ **Livré v14.38-44** en **1 session de ~3 h** (vs 12-15 h estimées). 12 bugs sur 14 fixés. Approche pragmatique : pas de refonte radicale en classe d'isolation, mais helper `_edlResetGlobalState()` qui reset les globales **en place** (préserve les références JS, modifications minimales). Pattern in-place sur 3 sites de réassignation directe (`_edlP`, `_edlCles`, `_edlCptPhotos`) pour préserver la cohérence. Pattern `edlSnapshot` répliqué de bailSnapshot v13.10. iOS camera fix via helper `_edlPickPhoto` qui attache au DOM. Migration arbo Drive avec backfill `_drvEnsureLogementTree` pour les logements legacy. Wizard bail : check du retour de saveDB pour empêcher la perte silencieuse en mode readonly Drive. **2 bugs reportés** (Bug 12 tombstone photos, possible suite Bug 4). Tests visuels à exécuter par utilisateur avant validation finale.
