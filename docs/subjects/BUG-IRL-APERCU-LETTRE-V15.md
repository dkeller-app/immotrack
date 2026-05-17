# BUG-IRL-APERCU-LETTRE-V15 — Bouton "Aperçu lettre" IRL ne s'ouvre plus

**Status** : 🔄 En cours · **Prio** : P1 · **Taille** : S (1-2h)
**Détecté** : 2026-05-16 (user, Sprint 19A marathon V1 propre)
**Lié à** : IRL-VALIDATION ✅ v13.33, IRL-REVISION-UX-FIX ✅ v15.10, Sprint 19+20 marathon V1 propre

## Contexte

Sur l'onglet IRL (page `#p-irl`), le panneau **"Aperçu lettre"** (`#irl-letter-pane`) est masqué par défaut depuis v15.11 (gain d'espace écran). On l'ouvre via le bouton header `✉ Aperçu lettre` (`_irlToggleLetterPane()`).

**Le bug** : quand l'utilisateur clique sur ce bouton header, le panneau s'ouvre **vide** avec le message *« Cliquer sur 👁 Aperçu dans une carte pour afficher la lettre »*. Il faut alors faire un second clic sur une carte pour voir une lettre. C'est un workflow à 2 clics non intuitif — l'utilisateur attend qu'un clic sur "Aperçu lettre" lui montre **une lettre**.

## Audit du code v15.73

- `index.html:390` — bouton header `<button onclick="_irlToggleLetterPane()" id="irl-letter-toggle-btn">✉ Aperçu lettre</button>`
- `index.html:408-421` — panneau `#irl-letter-pane` avec slot `#pdf-irl-content` (cible d'injection lettre)
- `index.html:17613-17620` — `_irlToggleLetterPane()` : toggle simple `display:none` ↔ `display:''`
- `index.html:17623-17627` — `_irlPreviewWithPane(ref)` : wrapper utilisé depuis cards, dévoile le panneau si masqué + `previewIRLLetter(ref)`
- `index.html:19742-19754` — `previewIRLLetter(ref)` : `genIRLLetter(ref)` qui injecte la lettre dans `#pdf-irl-content`
- `index.html:17439+` — `computeIRLRevision(log)` retourne états dont 4 non-prévisualisables : pas de bail, DPE manquant, DPE F/G gelé, index IRL manquant. Le reste (révision calculée + bail < 1 an) est prévisualisable.

## Scope

- [ ] Module pur `js/core/irl-preview.js` :
  - `_irlIsPreviewable(rev)` : bool — rev valide ET pas dpeManquant/gelDpeFG/insuffisant
  - `_irlListPreviewableRefs(logements, computeRevisionFn)` : retourne `[{ref, label, isApplicable, dejaApplique, pasEncoreApplicable}]`
- [ ] Tests Vitest `__tests__/helpers/irl-preview.test.js`
- [ ] Patch `index.html` :
  - [ ] Bump v15.73 → v15.74 (title + footer)
  - [ ] HTML header panneau : ajouter `<select id="irl-letter-selector">` entre titre et boutons
  - [ ] Helpers inline `_irlPreviewableRefs()`, `_irlFirstPreviewableRef()`, `_irlRefreshSelector()`, `_irlOnSelectorChange()`
  - [ ] `_irlToggleLetterPane()` : à l'ouverture, si panneau vide → refresh selector + preview 1ère lettre valide
  - [ ] `_irlPreviewWithPane(ref)` : synchronise le selector avec ref cliquée

## Décisions

- **Sandbox vs prod** : direct `index.html` (décision user 2026-05-16 marathon)
- **Format selector** : `<select>` natif (a11y + responsive auto) avec optgroup "Calculée" / "Bail < 1 an" + 1 option "— Choisir un bail —" si aucune lettre n'a encore été demandée
- **Auto-load** : seulement si panneau est ouvert depuis une position fermée ET aucune lettre actuellement affichée. Évite d'écraser une lettre déjà ouverte par l'user.

## Prompt de démarrage de session

(Non applicable — sujet exécuté dans la session pilotage courante 2026-05-17.)

## Notes utilisateur

> 💬 2026-05-16 : *« le bouton aperçu lettre IRL ne s'ouvre plus »* (Sprint 19A marathon V1 propre)

## Journal

- 2026-05-16 : sujet annoncé dans le prompt marathon Sprint 19+20 (statut "⏸️ en pause, helpers/tests créés"), mais en réalité **aucun fichier n'a été créé** (vérification 2026-05-17 : `js/core/irl-preview.js` absent, tests absents, doc sujet absent, BACKLOG resté ⬜).
- 2026-05-17 : reprise from-scratch dans session pilotage. Direct prod (décision marathon).
