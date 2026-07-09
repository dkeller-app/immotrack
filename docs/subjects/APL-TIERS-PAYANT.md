# APL-TIERS-PAYANT — prise en compte des aides au logement (CAF/APL) versées au bailleur

> User 2026-07-09 : « tu ne prends pas en compte les paiements de la CAF ! j'ai des locataires en
> partiel alors que la CAF a payé le reste. » Cas TRÈS fréquent (grande part des locataires) → non
> négociable pour le SaaS.

## Diagnostic (vérifié dans le code)
Le moteur de statut (`_computeLoyerStatut`) compte **tout** crédit « Loyers encaissés » rattaché au lot
(`qui===ref`), quel que soit l'émetteur — donc un versement CAF **compterait** s'il était catégorisé
loyer + rattaché au lot. Il ne l'est pas parce que :
1. **Import** : `_bankMatchHeuristic` (js/core/bank-import.js:279-353) matche les loyers par **nom du
   locataire** ; un virement CAF (libellé « CAF », « CAISSE ALLOCATIONS FAMILIALES », montant = part
   APL ≠ loyer plein) ne matche pas → tombe en « à classer » (aucun mot-clé CAF dans les KEYWORDS).
2. **Aucun concept d'APL** sur le bail : l'app ne connaît ni le montant APL, ni le mode (tiers payant),
   ni la part locataire → impossible d'auto-rattacher ni de vérifier la couverture.
Résultat : la part CAF n'entre pas dans le total encaissé du lot → « partiel » à tort.
Le moteur est CORRECT ; le trou est en amont (reconnaissance import + modèle APL).

## Fiscal
APL en tiers payant = **recette locative** (le bailleur déclare le loyer plein, part APL incluse).
Catégoriser le versement CAF en « Loyers encaissés » (211) est donc juste comptablement ET fiscalement.

## Proposition (mockup-first)
1. **Champ APL sur le bail** : `bail.apl = { montant, tiersPayant: bool }` (part locataire = loyer − APL).
   Écran bail : bloc « Aide au logement (CAF/MSA) » sous le loyer.
2. **Import** : mot-clé CAF/MSA/allocation + montant ≈ APL d'un bail → suggère « Loyers encaissés » +
   rattache au lot (confiance haute si montant = APL connue). Sinon « à classer » avec indice « CAF ? ».
3. **Suivi des loyers** : la case du mois montre le **split** (part locataire + part CAF) ; un mois est
   « payé » si locataire+CAF ≥ dû (fini le faux partiel). Le moteur ne change pas (dû = loyer plein,
   les deux versements comptent).
4. **CRG / quittance** : mention part APL (utile agence + locataire).

## Statut
⬜ À faire (P1 — bloquant crédibilité SaaS). Mockup-first (bail + import + case Suivi). Dépend du moteur
unique (Phases A-B faites). Lié à [[SUIVI-LOYERS-SOURCE-UNIQUE]].
