# BUG-SIGN-REFRESH-FICHE — Fiche logement 360 figée après signature bailleur-seul

- **Code** : BUG-SIGN-REFRESH-FICHE
- **Catégorie** : Bug (UX / refresh)
- **Priorité / Taille** : P0 ressenti (bloquant pour l'user) / XS
- **Statut** : ✅ Livré PROD v15.256 (2026-06-04)
- **Gravité réelle** : cosmétique (aucune perte de données — les signatures sont bien persistées)

## Symptôme (rapporté par l'user)

Après avoir signé un bail **« juste bailleur »** (mode `bailleur-seul`, signature partielle) **depuis l'onglet « 📜 Bail » de la fiche logement 360**, aucun bouton n'apparaissait :

> « je viens de signer un bail juste bailleur et je ne peux plus rien faire. Je n'ai plus le moyen de faire signer un locataire ni d'annuler !!!! et non plus d'envoyer par mail ! »

Puis :

> « les autres boutons viennent d'apparaitre. après sortie et retour »

→ les boutons (« ✍️ Le locataire signe », annuler, envoyer par mail) ne revenaient qu'après **fermeture / réouverture** de la fiche.

## Cause racine

La signature se déroule dans une **popup** (le générateur PDF + wizard signature s'exécute dans `window.open`). À la sauvegarde, la popup :

1. écrit **directement** `window.opener.DB.baux[ref].signatures = sigData` (elle **ne passe pas** par `saveBail()`) ;
2. rafraîchit l'UI de l'opener en appelant **uniquement** `window.opener.rBaux()` — la page *liste* des Baux.

Or `rBaux()` ne re-rend que la liste, **pas la fiche 360 ouverte** (`#log-fiche-content`). La fiche gardait donc son rendu précédent : `_renderLogFichePanelBail` avait calculé `partial = false` (bail pas encore signé), donc le bouton « ✍️ Le locataire signe » n'était jamais dans le DOM. Tant qu'on ne re-render pas la fiche, il n'apparaît pas → fermer/rouvrir force le re-render et résout.

C'est le **seul chemin de mutation d'un bail** qui contournait le helper centralisé `_refreshAfterMutation()` (justement parce que c'est du code popup sérialisé, pas une fonction `saveXxx`).

## Correctif

Ajout d'**une ligne** dans le bloc de sauvegarde de la popup, juste après l'appel `rBaux()` :

```js
'if(typeof window.opener._refreshAfterMutation==="function")window.opener._refreshAfterMutation();'
```

`_refreshAfterMutation()` (helper **REFRESH-LIVE**, v14.28) bascule sur `currentPage` et re-rend la fiche ouverte (`rLogFiche` / `rImmFiche` / `rEntFiche` / `rBiens`). Il est déjà câblé dans **19 sites** de mutation dont `saveBail`. C'est **exactement le même bug et le même correctif** que `resetBailSignatures` (v15.203), dont le commentaire décrivait déjà le symptôme « seul `rBaux()` était re-rendue → impression que rien ne se passe ».

**Aucun helper custom ajouté** : une première ébauche (`refreshLogFicheIfOpen`, calquée sur le pattern plus ancien de la clôture v15.14) a été **écartée** car elle réinventait une version plus étroite du helper canonique (solution passable). On réutilise le helper existant (DRY + cohérence + plus robuste : couvre aussi imm/ent/biens).

## Vérification

- **Ordre confirmé** : le DB write (`DB.baux[ref].signatures` + `_modifiedAt`) et `saveDB()` s'exécutent **avant** le refresh → `rLogFiche()` relit des signatures fraîches.
- **No-op propre** depuis la liste Baux (`currentPage==='baux'` → le `switch` n'a pas de cas `baux` ; le `rBaux()` existant gère déjà la liste ; pas de double-refresh, pas de throw).
- **Audit `superpowers:code-reviewer`** (2 passes : ébauche helper custom puis approche canonique retenue) → **0 finding**, parité prod/sandbox byte-identique.
- Propagé sandbox (`index-test.html`) → prod (`index.html`) + bump version 4 emplacements + `sw.js` CACHE_VER → **v15.256**.

## Fichiers touchés

- `index.html` : 1 ligne (+ commentaire) dans le bloc popup de `previewBailData` ; bump v15.256 (title, `<em>`, footer landing, `IMMOTRACK_VERSION`).
- `index-test.html` : même ligne (+ commentaire), parité.
- `sw.js` : `CACHE_VER = 'immotrack-v15.256'`.

## Note de branche

Fix développé sur branche dédiée `bug-sign-refresh-fiche` (worktree `Immo-bug-sign-refresh`), base main v15.250, pour ne pas télescoper la session parallèle active sur `main` (V3-REFONTE-ASSURANCES / BUG-BAIL-ANNEXES-DUP). Pendant le dev, `main` a avancé à v15.255 (et v15.251 a été consommé par BUG-BAIL-ANNEXES-DUP). La branche a donc été **rebasée sur `origin/main` (v15.255)**, re-bumpée en **v15.256** (collision v15.251 résolue au rebase : 4 lignes de version dans `index.html` + bloc BACKLOG « Livré récemment » fusionné en gardant les deux entrées), puis poussée directement sur `main` en fast-forward — sans jamais toucher le worktree `main` (dont `index-test.html` était sale côté session parallèle). Le `CACHE_VER` de `sw.js`, resté à v15.250 côté prod, est rattrapé à v15.256 par ce livrable.
