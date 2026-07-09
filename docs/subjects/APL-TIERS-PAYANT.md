# APL-TIERS-PAYANT — la CAF n'est pas comptée dans le loyer (faux « partiels »)

> User 2026-07-09 : « j'ai des locataires en partiel alors que la CAF a payé le reste. »

## Diagnostic (vérifié dans le code — factuel)
Le moteur `_computeLoyerStatut` compte **tout** crédit « Loyers encaissés » rattaché au lot (`qui===ref`),
quel que soit l'émetteur → un versement CAF **compterait** s'il était catégorisé loyer + rattaché au lot.
Il ne l'est pas parce que :
1. `_bankMatchHeuristic` (js/core/bank-import.js:279-353) matche les loyers par **nom du locataire** ;
   un virement CAF ne porte pas le nom du locataire → « à classer » (aucun mot-clé CAF).
2. Aucun champ APL sur le bail → l'app ne connaît pas la part CAF ni le mode (tiers payant).

Le moteur est correct ; le trou est en amont.

## Solution = À DÉCIDER AVEC L'UTILISATEUR
NE RIEN concevoir seul. Questions ouvertes avant tout design : mode de versement réel (tiers payant ?),
état actuel des virements CAF dans SES données, niveau souhaité (juste compter le virement vs modéliser
l'APL), impacts fiscal/quittance. → dialogue + mockup-first ensuite.

## Statut
⬜ À cadrer avec l'utilisateur. Lié à [[SUIVI-LOYERS-SOURCE-UNIQUE]].
