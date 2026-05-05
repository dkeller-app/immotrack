# BUG-BIENS-TABS-FILTER — Onglet Bailleurs ne filtre pas Tous/Archivés

**Status** : ✅ Livré v14.54 · 2026-05-05
**Prio** : P2 · **Taille** : XS (~30 min réels)
**Détecté** : 2026-05-05 (session DASH-PROFILES + ENT-CASCADE)
**Lié à** : `LOG-ARCHIVE` (livré v14.2) · `LOG-LISTE-CARDS` (livré v14.2)

## Symptôme
Sur la page Biens, le toggle haut "Tous mes biens" / "Biens archivés" doit filtrer le contenu. **MAIS** :
- Mode **Logements** : OK, filtre correctement le pool (`_archivedLogements()` vs `_activeLogements()`)
- Mode **Immeubles** : OK aussi (les immeubles sont groupés depuis `filtered` qui dérive du pool)
- Mode **Bailleurs** : **KO** — affiche les 3 bailleurs identiques quel que soit le tab actif

## Root cause
Dans `rBiens()` (ligne 21033), le code court-circuite la logique de pool pour le mode Bailleurs :
```js
// v14.3 PATRIMOINE-NAV-UNIFY : mode Bailleurs = render dédié sur DB.entites
// Le tab Actifs/Archivés ne s'applique pas aux bailleurs (les entités n'ont pas de cycle de vie soft-delete)
if(_biensViewMode === 'bailleurs') {
  return _renderBiensModeBailleurs(wrap, cnt);
}
```

Le commentaire dit "le tab ne s'applique pas aux bailleurs" — choix v14.3 cohérent à l'époque (les entités n'ont pas de flag `archived`). Mais résultat UX : les 3 cards Bailleurs affichent les mêmes données dans les 2 vues, ce qui rend le toggle confus.

## Fix v14.54 (option B retenue avec utilisateur)

3 options proposées à l'utilisateur :
- **A** : Cacher l'onglet Bailleurs (et Immeubles) sur "Biens archivés"
- **B** ✅ : Filtrer Bailleurs/Immeubles pour ne montrer que ceux ayant ≥1 bien archivé
- **C** : Note au backlog → fix séparé

Implémentation :
- `_renderBiensModeBailleurs()` : si `_biensTab === 'archives'`, filtre `ents` pour ne garder que ceux dans `_entsWithArchived()` (Set des entity ayant ≥1 logement archivé). Compteurs `totalEnts` et `nbBiens` adaptés au scope. Empty state spécifique "Aucun bailleur n'a de bien archivé" + bouton retour.
- `_renderBailleurCard(ent, isArchivedTab)` : nouveau paramètre `isArchivedTab`. Le pool `myLogs` filtre par `l.archived` ou `!l.archived` selon scope.
- Libellé compteur : "X bailleurs · N biens **actif**(s)" ou "**archivé**(s)" selon tab.

Mode Immeubles : pas de modif, déjà filtré correctement par `pool` (via `_archivedLogements()` ligne 21038).

## Tests manuels
1. Vue Tous mes biens / Bailleurs → 3 cards (Didier Keller, SCI DD2AMELEVIERES, SCI SMARTOSAURUS)
2. Bascule Biens archivés (count 0) / Bailleurs → empty state "Aucun bailleur n'a de bien archivé"
3. Archiver 1 logement de SCI DD2AMELEVIERES → bascule archives → 1 card SCI DD2AMELEVIERES + count "1 bailleur · 1 bien archivé"

## Journal
- 2026-05-05 : détecté pendant session ENT-CASCADE par utilisateur ("quand je navigue sur onglet bailleurs entre tous mes biens et biens archivés, je vois toujours les 3 bailleurs"). Fix livré v14.54 dans la foulée. Option B (filtrage cohérent) retenue.
