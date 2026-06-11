# Design — Bug 1 : déposer les documents de diagnostic AVANT d'enregistrer le bien

**Date** : 2026-06-10
**Statut** : design validé (user « ok » sur Approche A + mockup `mockups/diag-docs-pending/etat-en-attente.html` vu). Indicateur = variante C (minimal) + confirm anti-perte.
**Prio** : P2 · **Taille** : M
**Pré-requis livrés cette session** : v15.266 (fix libs PDF), v15.268 (clic-dehors ne ferme plus les modales — protège les fichiers en attente).

---

## 1. Problème

Dans l'onglet **🏷 Diagnostics** de la modale logement, pour un bien **neuf pas encore enregistré**, la zone de dépôt est remplacée par un message « Enregistre d'abord le logement… » (`_logDiagRenderTab`, gate `logId != null`). Cause : l'infra pièces jointes `_attachmentSaveForEntity` exige `parent.id != null`. L'utilisateur doit donc sauver le bien, rouvrir, puis déposer — friction signalée.

## 2. Décision — Approche A (validée)

Bufferiser les PDF en mémoire au dépôt, lire en auto immédiatement, et rattacher à l'enregistrement. **Précédent dans l'app** : l'import d'acte bufferise déjà `_acteDraft.fileDataB64` puis attache après création (spec import-acte D13). On réutilise ce pattern, on n'invente rien.

Pour un bien **déjà enregistré** : comportement actuel **inchangé** (persistance immédiate au dépôt).

## 3. Composants & flux

| # | Élément | Changement |
|---|---|---|
| 3.1 | `_logDiagInitDraft(log)` (~35866) | ajoute `pendingDocs: []` au brouillon. Réinit à chaque ouverture (jamais conservé entre modales). |
| 3.2 | `_logDiagRenderTab()` (~37974) | la zone de dépôt s'affiche **toujours** (plus de gate `logId`). Pour un bien neuf, l'`onchange` de l'input → `_logDiagStageFile(input)` au lieu de `_handleAttachmentUpload(...)`. Sous la zone, rend les `pendingDocs` (lignes `.att-item` + badge « ⏳ à enregistrer » + ✕). |
| 3.3 | `_logDiagStageFile(input)` **(nouveau)** | valide taille (`ATTACHMENT_DEFAULT_MAX_SIZE`) + mime ; lit le dataURL ; push `{tmpId, name, mime, size, dataB64}` dans `pendingDocs` ; lance la lecture auto sur le buffer ; re-render. |
| 3.4 | `_logDiagOnPdfUploaded` (~37862) | **généralisé** : accepte un `doc` persisté (→ `_attachmentLoadBinary`) **ou** un buffer `{dataB64, tmpId, name}` (→ dataB64 direct). Reste identique (pdf.js → scan → suggestions → N° DPE → ADEME). |
| 3.5 | Banc de détection (`_logDiagDocScans` / `_logDiagDetectBannerHtml` ~37900) | reconnaît les `tmpId` en attente (sinon les scans des fichiers staged seraient filtrés car absents de `DB.documents`). |
| 3.6 | `_logDiagRemovePending(tmpId)` **(nouveau)** | retire un fichier de `pendingDocs` + re-render (rien à supprimer côté Drive/IDB). |
| 3.7 | `saveParamLog()` (~39097) | après `log.id` acquis + `saveDB()` (et `_drvHookEnsureLogement` pour un bien neuf) : bloc async qui, pour chaque `pendingDocs`, appelle `_attachmentSaveForEntity({type:'logement', id:log.id, ref:log.ref, logRef:log.ref, category:'documents'}, {name,mime,size,dataB64})`. Try/catch non-bloquant (toast si échec partiel). Vide `pendingDocs`. |
| 3.8 | Fermeture `ov-log` | Aujourd'hui le ✕ (HTML ~2043) et « Annuler » (~2557) appellent **`closeM('ov-log')` direct**. On introduit `_closeLogGuarded()` : si `_logDiagDraft?.pendingDocs?.length` → `confirm2('N document(s) déposé(s) ne seront pas enregistrés. Fermer quand même ?')` (sinon on ne ferme pas) ; sinon `closeM('ov-log')`. On recâble ✕ + Annuler dessus. Le chemin **Enregistrer** (`saveParamLog`) flush AVANT le `closeM` → pas de confirm. |

> ⚠️ Timing du flush (§3.7) : `saveParamLog` fait `saveDB(); closeM('ov-log')` sur la même ligne (~39217). Le flush lit `_logDiagDraft.pendingDocs` et doit donc s'exécuter **avant** que le brouillon soit ré-initialisé par une réouverture — en pratique juste après `_logDiagCommitToLog(log)`/`saveDB()`. `closeM` ne vide pas `_logDiagDraft` (variable module), donc lire pendingDocs après `closeM` reste possible, mais on flush tôt par sûreté.

`_attachmentSaveForEntity` est **IDB-first** (binaire en IndexedDB immédiat, Drive en tâche de fond best-effort, ne requiert pas le dossier Drive pré-existant) → le flush est sûr dès que `log.id` existe.

## 4. UI (variante C, mockup validé)

Identique à l'existant ; chaque fichier en attente porte un badge ambre `⏳ à enregistrer` (style repris de `.logdiag-sg-badge`). Phrase d'info adaptée : « joints au Drive du bien à l'enregistrement ». Le bandeau 🤖 Détection s'affiche normalement (lecture auto sur les fichiers en attente).

## 5. Garde-fous

1. `pendingDocs` en mémoire only, jamais persisté seul → annulation/fermeture = **zéro orphelin**.
2. Cap taille + mime (PDF/image) comme l'upload normal.
3. Sanitation du nom de fichier (réutilise l'existant).
4. Bien existant : aucun changement (chemin `_handleAttachmentUpload` intact).
5. Confirm anti-perte sur fermeture avec fichiers en attente (§3.8).
6. RGPD : le PDF ne quitte pas le navigateur avant le flush ; ensuite suit la sync Drive normale.

## 6. Tests

- **Unitaire** (si logique extractible vers un helper ES6) : staging (push/remove), flush (mapping vers `_attachmentSaveForEntity`).
- **Intégration** : stage 2 PDF sur un bien neuf → `saveParamLog` → `DB.documents` contient 2 entrées `logement/documents` + le brouillon DPE rempli (N°→ADEME) committé via `_logDiagCommitToLog`. Non-régression : chemin bien existant (persistance immédiate) inchangé.
- **Visuel (vrai navigateur, 3 formats, light/dark)** : création d'un bien neuf → dépôt → lecture auto → badge « ⏳ » → Enregistrer → fichiers persistés ; Annuler avec fichiers en attente → confirm ; bien existant inchangé.

## 7. Process

- **Sandbox-first** : `index-test.html` d'abord (worktree off `origin/main` v15.268, jamais l'arbre partagé) ; parité prod après.
- **Audit `superpowers:code-reviewer` OBLIGATOIRE** avant test user (touche GED + Drive + `saveParamLog` = sensible).
- Bump version + `sw.js` CACHE_VER, inscription file `.index-queue/QUEUE.md`, MAJ BACKLOG temps réel.

## 8. Hors-scope (YAGNI)

- Généraliser le buffer-avant-save aux autres zones PJ (photos, fiche 360°) — on cible l'onglet Diagnostics (douleur signalée), design extensible.
- Lecture du contenu réel des risques depuis le PDF (sujet séparé, déjà discuté).
- Modification du DPE par l'import (ADEME autoritaire — inchangé).
