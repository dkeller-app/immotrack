# CAT-MAPPING-2044 — Mapping catégories perso → lignes 2044 (prérequis fiscal)

**Priorité : P1 (bloquant fiscal sur données réelles)** · Taille : L · Statut : ⬜ À cadrer

## Problème (découvert en testant REPORTING-BAILLEUR sur données réelles)

Tous les rapports fiscaux de l'app — **déclaration 2044**, **Bilan annuel**, **onglet Finances** —
mappent les mouvements aux lignes CERFA 2044 **par le nom EXACT des catégories standard**
(`STD_CATEGORIES`, ex. `Loyers encaissés` → 211, `Taxe foncière (et taxes annexes)` → 227…).

Or `_stdCategoryByName(nom)` ne consulte **que** la constante `STD_CATEGORIES`, et `DB.categories`
n'est qu'une **liste de noms** (aucun champ `ligne2044`, aucun mapping). Donc **toute catégorie
perso/legacy est non mappée** → comptée 0 dans le résultat foncier.

### Preuve (données réelles user, sandbox, 2026)
173 mouvements, catégories toutes `≠STD` :
`Loyers`(60), `Prêt`(28), `Charges`(17), `Charges Communes SCI`(14), `Assurances PNO`(13),
`Assurances GLI`(10), `Travaux / Réno`(7), `Gestion`(6), `Divers`(6), `Charges ND`(6),
`Remb GLI`(4), `Cautions`(2).
→ Compte de résultat Finances/Bilan/2044 = **0 €** alors que « argent à récupérer » = 447 922 €
(ce dernier marche car calculé sur les **baux**, pas les catégories).

Seules `Loyers` et `Charges` ont un alias legacy (`_isLoyerCategory`, `_isChargeRecupCategory`) ;
toutes les autres sont invisibles pour le moteur 2044.

## Scope à cadrer

1. **Modèle** : passer `DB.categories` de `string[]` à des objets `{nom, ligne2044, type}` (ou table
   de correspondance séparée `DB.catMapping`), pour que chaque catégorie perso porte sa ligne 2044.
2. **UI mapping** : écran « Catégories » où l'utilisateur assigne une ligne 2044 (liste déroulante des
   lignes officielles) à chacune de ses catégories. Choix prédéfini (suggestions) + ajout libre.
3. **Suggestion auto (non destructive)** : proposer un mapping par heuristique (`Prêt`→250,
   `Gestion`→221, `Travaux*`→224, `Assurance*`→223, `Loyers`→211, `Charges*`→229/227…) que
   l'utilisateur **valide/corrige** — jamais appliqué en silence (chiffres fiscaux).
4. **Migration / Import** : à l'import JSON et pour les bases existantes, déclencher le mapping
   (assistant) si des catégories non mappées sont détectées.
5. **Moteur** : `_compute2044`, `_finChargeBuckets`, `_finLoyersHC`, `_computeBilanAnnuel` consomment
   la liste EFFECTIVE (STD + perso mappées), pas seulement `STD_CATEGORIES`.

## Hors scope
- Ne PAS auto-mapper en silence (risque de déclaration fausse).
- REPORTING-BAILLEUR (Finances) est fonctionnel sur données correctement catégorisées ; ce sujet
  est un **prérequis amont** pour qu'il (et le 2044/Bilan) serve sur des données réelles.

## Lien
- Découvert pendant : `REPORTING-BAILLEUR` (test données réelles user, 2026-06-08).
- Touche : `_stdCategoryByName` (3995), `_compute2044` (legal-2044.js), `_finChargeBuckets`/`_finLoyersHC`
  (index-test*.html), `_computeBilanAnnuel` (legal-bilan.js), écran Catégories (Paramètres).
