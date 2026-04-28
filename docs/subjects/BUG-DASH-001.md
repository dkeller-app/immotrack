# BUG-DASH-001 — Dashboard : prendre les baux en vigueur dans le mois choisi

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M
**Détecté** : 2026-04-28
**Lié à** : DASH-V2 · V3-REFONTE-LOYERS

## Contexte
Quand l'utilisateur sélectionne un mois dans le dashboard, les KPIs (occupation, loyers, rendement) doivent se baser sur les **baux qui étaient en vigueur ce mois-là**, pas sur les baux actuellement en cours. Un bail terminé avant le mois sélectionné ne doit plus compter ; un bail nouveau démarrant après le mois sélectionné ne doit pas non plus compter.

À ce jour, la sélection de mois ne filtre pas correctement la temporalité des baux dans les agrégats.

## Scope
- [ ] Identifier tous les sites qui calculent des KPIs sur la période (occupation, rendement, loyers attendus, charges, mouvements)
- [ ] Pour chaque site, filtrer les baux par `dateDebut <= dernierJourDuMois && (dateFin == null || dateFin >= premierJourDuMois)`
- [ ] Tester sur un cas avec entrée/sortie locataire en milieu de mois (occupation au prorata ?)
- [ ] Décider : occupation au prorata ou booléen mois (à confirmer avec utilisateur)

## Décisions à prendre
- [ ] Occupation : au jour près (prorata) ou booléen "occupé pendant tout/partie du mois" ?
- [ ] Rendement brut sur le mois : loyer attendu (prorata si entrée/sortie partielle) ou loyer encaissé ?

## Notes utilisateur
> 💬 2026-04-28 : "Tableau de bord : attention, il faut prendre les baux qui étaient en vigueur dans le choix du mois"

## Journal
- 2026-04-28 : créé
