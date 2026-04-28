# CHARGE-REGLES — Règles de répartition charges (chauffage) au tantième et compteur

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M
**Détecté** : 2026-04-28
**Lié à** : V3-REFONTE-REGUL · BUG-CHARGE-001

## Contexte
Pour la régularisation des charges récupérables, l'utilisateur veut pouvoir paramétrer des **règles de répartition par type de charge** :
- **Chauffage** : 30% au tantième + 70% au compteur (loi décret 2016-710)
- **Eau froide / chaude** : 100% au compteur si individualisé, sinon tantième
- **Ascenseur** : tantième
- **Entretien parties communes** : tantième

Aujourd'hui, probablement répartition uniforme tantième seulement.

## Scope
- [ ] Modèle : table `charge_regle` avec type charge × méthode (tantième / compteur / mixte) × ratio
- [ ] UI : éditer les règles par entité (ou par immeuble si multi-immeubles)
- [ ] Calcul régul : appliquer la règle selon le type de charge
- [ ] Cas mixte : 30/70 chauffage → 30% × tantième + 70% × conso compteur logement / total compteur immeuble
- [ ] Données conso compteur (chauffage, eau) : saisie annuelle par logement

## Décisions à prendre
- [ ] Niveau de paramétrage : par entité, par immeuble, par catégorie de charge ?
- [ ] Saisie des conso : 1× par an au moment de la régul ou tout au long de l'année ?
- [ ] Templates de règles pré-remplis (chauffage 30/70, eau 100% compteur, etc.) ?

## Notes utilisateur
> 💬 2026-04-28 : "Possibilité de mettre des règles sur facture charges (chauffage) au tentieme et compteur"

## Journal
- 2026-04-28 : créé · à coupler avec BUG-CHARGE-001 et V3-REFONTE-REGUL
