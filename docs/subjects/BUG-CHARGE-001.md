# BUG-CHARGE-001 — Régularisation des charges ne fonctionne pas

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M
**Détecté** : 2026-04-28
**Lié à** : V3-REFONTE-REGUL · CHARGE-REGLES

## Contexte
Le module de régularisation des charges (calcul du delta charges réelles vs provisions encaissées) ne fonctionne pas. Pas plus d'info pour le moment — à investiguer.

## Scope
- [ ] Reproduire : sélectionner une entité/logement, lancer la régul, voir ce qui plante
- [ ] Identifier symptôme : crash JS / résultat faux / écran vide / bouton inactif ?
- [ ] Selon le diagnostic : fix ciblé ou refonte (cf V3-REFONTE-REGUL)

## Décisions à prendre
- [ ] Si bug ciblé → fix immédiat
- [ ] Si refonte structurelle nécessaire → renvoi vers V3-REFONTE-REGUL et statu quo (alerte utilisateur)

## Notes utilisateur
> 💬 2026-04-28 : "régularisation des charges ne fonctionnent pas"

## Journal
- 2026-04-28 : créé · à diagnostiquer en priorité (bloque utilisateur final)
