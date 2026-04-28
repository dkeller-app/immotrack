# BUG-IRL-001 — Lettre IRL : "date anniversaire du bail" est faux, c'est le mois

**Status** : ⬜ À faire · **Prio** : P0 · **Taille** : XS
**Détecté** : 2026-04-28
**Lié à** : IRL-LETTRE-REVISION (livré v13.x)

## Contexte
Le template de la lettre de révision IRL contient la mention :
> "date anniversaire du bail, soit le 15 juin 2026"

C'est juridiquement **inexact**. La révision IRL s'applique au **mois anniversaire** du bail, pas à un jour anniversaire précis. Cette mention pourrait être attaquée.

## Scope
- [ ] Trouver la string template dans le code (probablement IRL-LETTRE-REVISION)
- [ ] Remplacer "date anniversaire du bail, soit le 15 juin 2026" par "mois anniversaire du bail, soit juin 2026" (ou formulation équivalente)
- [ ] Vérifier les autres mentions de date anniversaire dans le code

## Décisions à prendre
- [ ] Formulation exacte : "mois anniversaire du bail (juin 2026)" vs "à la date anniversaire (mois de juin 2026)"

## Notes utilisateur
> 💬 2026-04-28 : "lettre IRL : **date anniversaire du bail, soit le 15 juin 2026**. il faut changer cette mention elle est fausse c'est le mois anniversaire qui est pris en compte"

## Journal
- 2026-04-28 : créé · P0 car erreur juridique sur courrier officiel
