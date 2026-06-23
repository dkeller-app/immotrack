# Import bancaire — « compléter pas à pas » (Flux B) — design

**Date** : 2026-06-23 · **Chantier** : V3-REFONTE-LOYERS / Chantier C (import → liste → compléter)
**Mockup validé** : `mockup-import-stepbystep.html` (déployé github.io, Flux B retenu, visuel OK user 2026-06-23)
**Sensibilité** : 🔴 fiscale (l'affectation pilote la 2044) → **audit agent `code-reviewer` obligatoire avant prod**
**Méthode** : mockup-first ✅ fait · **sandbox-first** (`index-test*.html` d'abord) · bump version · responsive 3 formats

---

## 1. Problème

À la sortie du wizard d'import bancaire, l'utilisateur doit affecter chaque mouvement. Aujourd'hui
(`_bankRenderReviewBody` → `_bankLineRow` → `_bankLineAffEditor`, `index.html:46057-46167`) :

- l'éditeur s'ouvre **inline sous la ligne** (`padding:4px 12px 14px 25px`) → cramé sur ~⅓ d'écran,
  on doit déplier/replier chaque ligne pour voir/saisir les infos ;
- **aucun enchaînement** : pas de « valider cette opération → ouvrir la suivante », pas de progression.

Retour user 2026-06-23 (verbatim) : « un pop up plus grand », voir « intitulé / nature de l'opération /
logement ou sci ou immeuble », « un bouton valider l'opération et ça ouvre la suivante », « step by step ».

## 2. Décision (validée user)

**Flux B — Liste + grande fenêtre enchaînée.** On **garde** la liste à onglets existante
(À compléter / Reconnus / Doublons) ; cliquer une ligne — ou « ▶ Compléter pas à pas » — ouvre une
**grande fenêtre dédiée** « Renseigner ce mouvement », avec **enchaînement** : Valider l'opération →
la suivante s'ouvre (compteur N/total, ← Précédent, Passer, barre de progression, écran de fin).

Flux A (assistant plein écran sans liste) **écarté** : perte de la vue d'ensemble.

## 3. Insight clé — on RÉUTILISE, on ne reconstruit pas

La fenêtre du mockup (`renderAff`/`destHtml`/combo/split) est une **ré-implémentation** de blocs qui
**existent déjà** et tournent aujourd'hui *inline* dans l'import. À réutiliser tels quels :

| Bloc app existant | Rôle | Réf. |
|---|---|---|
| `_catBtn(id,tgt,curVal)` + `_catPk*` | picker catégorie (icônes + popup groupé) | `index.html:14654`, `14736` |
| `_affRender` / `_affZone` (`_affState`/`_affHooks`) | affectation pilotée par catégorie, 3 niveaux SCI/immeuble/logement, picker logement scopé+cherchable, badge destination 2044/régul/compteur | utilisé `_bankInitAff` `index.html:46195` |
| `_affOnCatChange` | reset niveau/cible au changement de catégorie | `46216` |
| `_bankSplitLine(i)` → `ov-sp-mv` (`_spMvRows` multi-sens signé, équilibre net) | découper (relevé gérance / prêt / CAF) | `index.html:46169` |
| `_bankIdxByState()` → `{todo, ok, dup}` | état des lignes | `index.html:45896` |
| `_bankLineDone`, `_bankSyncAff`, `_bankUpdateImportBtn`, `_bankReviewedOk` (A7) | classification, sync, gate import | `45877`, `46204`, `46231` |
| Liste à onglets `_bankRenderReviewBody` | overview + onglets | `index.html:46057` |

**Ce qui est NOUVEAU (le seul code à écrire) = présentation + navigation** :
1. un **conteneur grande fenêtre** « Renseigner ce mouvement » qui héberge le MÊME `_affZone` en grand
   (au lieu du déplié inline) ;
2. un **contrôleur de marche** (file ordonnée + position + valider/suivant/précédent/passer) ;
3. **barre de progression** (compteur N/total + pastilles) ;
4. **écran de fin** ;
5. recâblage : la ligne de liste **ouvre la fenêtre** au lieu de déplier inline.

## 4. Architecture cible

### 4.1 La fenêtre « Renseigner ce mouvement »
Un overlay app standard (même patron que les modales `ov-*`, design = `affectation.html` validé) :

- **En-tête** : titre (« Renseigner » si `todo`, « Vérifier » si `ok`) + **barre de progression**
  (compteur `N / total` + pastilles done/cur) + pilule source (🏦 Import banque · relevé · date) +
  puce périmètre du compte (🏢 immeuble) — réutilise le scope compte déjà géré.
- **Bandeau état** : `📝 À renseigner` (ambre) ou `✨ Reconnu (xx%) — vérifie/corrige` (vert).
- **Corps** : Date · **Catégorie** (`_catBtn`, pilote tout) · **Libellé/intitulé** (`_bankRenameLine`) ·
  Débit/Crédit · bascule **Affecter** / **Découper** · **zone `_affZone`** (la question ciblée +
  badge destination) · `<details>` Autres options (n° facture, justificatif, récurrence).
  - **À compléter sans suggestion = catégorie VIDE** (placeholder « — Choisir — »), bouton Valider
    **bloqué** tant qu'aucune catégorie n'est choisie. (Respecte « pas de reconnu sans affectation ».)
  - **Découper** → `_bankSplitLine(curId)` (modal `ov-sp-mv` existant, multi-sens).
- **Pied** : ← Précédent (désactivé en pos 0) · Passer · **Valider l'opération →** (ou « Valider et
  terminer ✓ » en dernière position).

### 4.2 Contrôleur de marche (nouvelles fonctions `_bankWalk*`)
- `_bankWalkStart(kind)` — `kind ∈ {'todo','ok','all'}` ; construit `_bankWalkList` =
  `_bankIdxByState().todo` (non exclues, non done) puis `.ok` selon `kind` ; ouvre position 0.
- `_bankWalkOpen(pos)` — pose `_bankWalkPos`, `_bankOpen=id`, initialise l'affectation
  (`_bankInitAff` existant), rend la fenêtre.
- `_bankWalkValidate()` — `_bankSyncAff(id)` (existant) + marque la ligne complétée → `goNext`.
- `_bankWalkPrev()` / `_bankWalkSkip()` / `goNext()` — navigation ; fin → écran de fin.
- Clic sur une ligne de liste (`_bankLineRow`) : `kind='all'`, position = index de la ligne cliquée.

### 4.3 Liste (modif minime de l'existant)
- `_bankRenderReviewBody` : remplacer l'**auto-déplié inline** (`_bankOpen` + `_bankLineAffEditor`
  sous la ligne) par : ligne **toujours repliée** (rendu actuel `_bankLineRow` déjà lisible — icône +
  libellé + montant + chips catégorie/bien/source, livré v15.343) + **clic = ouvre la fenêtre**.
  L'éditeur inline `_bankLineAffEditor` est **retiré du flux liste** (sa logique migre dans la fenêtre).
- Ajouter le CTA **« ▶ Compléter pas à pas »** (ambre) quand il reste des `todo`, et
  **« 👁️ Revoir les reconnus »** quand tout est complété.

### 4.4 Reconnus & gate d'import (A7) — simplifié par la marche
La marche fait **passer par chaque reconnu** → on peut marquer `_bankReviewedOk=true` dès que la file
des `ok` a été parcourue, ce qui **débloque** `_bankImportConfirm` (`_bankUpdateImportBtn`, `46231`).
Conserve le gate existant ; l'écran de fin propose « Importer N mouvement(s) » = `_bankImportConfirm`.

### 4.5 Doublons
Inchangés : onglet Doublons + `_bankExcludeLine`/`_bankKeepDup` existants. Clic sur une ligne doublon
ouvre la petite fenêtre « Doublon détecté » (garder exclu / importer quand même), **hors marche**.

## 5. Flux de données

```
fichier → _bankImportFileLoaded → _bankImportLines[] (todo/ok/dup via _bankIdxByState)
   liste (onglets)  ──clic ligne / « Compléter pas à pas » ──▶  fenêtre Renseigner (pos N/total)
   fenêtre: _catBtn → _affOnCatChange → _affRender (_affZone)  | Découper → _bankSplitLine (ov-sp-mv)
   Valider → _bankSyncAff(id) (écrit suggestedCat/Qui/Imm/Cc + _sp) → goNext
   fin → _bankReviewedOk=true → _bankImportConfirm → DB.mouvements (audit-trail _source:'bank_import')
```

Aucun nouveau modèle de données. La fenêtre lit/écrit les **mêmes champs** que l'éditeur inline
(`line.suggestedCat/suggestedQui/suggestedImm/suggestedCc/_sp/libelle`).

## 6. Cas limites
- **Ligne déjà découpée** (`line._sp`) : la fenêtre affiche le découpage (lecture + « Modifier ») via
  `_bankSplitLine` ; Valider conserve `_sp`.
- **Modal split par-dessus la fenêtre** : `ov-sp-mv` s'ouvre au-dessus ; à sa fermeture, retour à la
  fenêtre sur le même mouvement (re-render).
- **Passer** : avance sans marquer complété ; la ligne reste `todo` (import restera bloqué) — voulu.
- **Précédent** sur pos 0 : désactivé.
- **Fermer la fenêtre en cours de marche** : retour à la liste, état conservé (rien de perdu).
- **Catégorie `special` (Prêt capital, Divers)** : badge « Hors 2044 » ; pas de plantage de niveau.

## 7. Responsive (3 formats — non négociable)
- **PC/Tablette** : overlay centré, fenêtre ~820 px.
- **Téléphone** : bottom-sheet plein largeur ; pied en colonne (Valider pleine largeur) ; la barre de
  progression reste visible (compteur + pastilles compactées).

## 8. Tests
- **Vitest** (logique pure extractible) : ordre de marche `_bankWalkList` (todo puis ok, exclut dup +
  exclues), `goNext`/`prev`/positions, gate `_bankReviewedOk` après parcours des `ok`. Réutilise/àjoute
  dans `__tests__/helpers/bank-import.test.js`.
- **Smoke navigateur (Claude Preview, sandbox)** : ouvrir l'import démo, « Compléter pas à pas »,
  catégorie vide bloque, prêt/gérance équilibrés via split, écran de fin, import. 0 erreur console.
- **Non-régression** : suite bank-import existante verte ; le 2044 n'est pas touché (mêmes champs).

## 9. Découpage proposé (entrée du plan d'implémentation)
- **Phase 1 — Fenêtre hôte** : overlay « Renseigner ce mouvement » hébergeant `_affZone` + `_catBtn`
  en grand ; liste ouvre la fenêtre (clic) au lieu du déplié inline ; Valider = `_bankSyncAff` + close.
  Sandbox-first. Smoke test.
- **Phase 2 — Enchaînement** : contrôleur `_bankWalk*` (file, compteur N/total, Valider→suivant,
  Précédent, Passer, barre de progression) + CTA « Compléter pas à pas ». Tests Vitest nav.
- **Phase 3 — Reconnus + fin** : marche couvre les `ok` (→ `_bankReviewedOk`), écran de fin + bouton
  importer ; doublons inchangés.
- **Phase 4 — Responsive + polish + audit** : 3 formats (bottom-sheet mobile), revue visuelle user,
  **audit agent `code-reviewer` (fiscal)**, bump version (4 spots + sw.js), port prod après OK user.

## 10. Hors scope (rappel — déjà tranché ailleurs)
- Refonte du split mono→multi-sens : **déjà livrée** (V3 Phase 4, `_bankSplitLine`/`_spMvRows`).
- Compte = périmètre (scope par compte) : déjà géré dans `_affZone` (réutilisé tel quel).
- Auto-détection virement interne / échéancier de prêt : sujets détachés `FEAT-VIR-INTERNE`,
  `FEAT-PRET-ECHEANCIER`.
