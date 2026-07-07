# SUIVI-LOYERS-SOURCE-UNIQUE — un seul moteur de statut de paiement pour toute l'app

> **Décision user 2026-07-08** (« propose une unification globale et pense au visuel ! » → « ok ») après
> l'audit [AUDIT-FINANCES-COHERENCE-2026-07-07.md](AUDIT-FINANCES-COHERENCE-2026-07-07.md) : 6 formules
> différentes répondent à « ce locataire est-il à jour ? », 5 surfaces sur 11 donnent un verdict faux sur
> le scénario banal « 2 mois payés en janvier, rien en février » (constats 4-9 et 40-45).

## Principe

Le moteur du **Suivi des loyers** (`_suiviLoyerStrip` : allocation chronologique du total encaissé sur
les mois dus + solde signé par locataire) devient **LA source unique**. Toutes les surfaces s'y branchent.
Langage visuel commun : pastille (✓ À jour / ↑ avance / ◐ partiel / ↓ retard), bande 12 mois, tooltip
expliquant le report (« février : couvert par l'avance de janvier »). Mockup validé (widget
`unification_statut_loyer_moteur_et_visuel`, session 2026-07-08).

Décisions gravées :
- **Compte = montant** : « N locataires en retard · X € » = Σ soldes négatifs PAR locataire (une formule).
- **Avances affichées à part** (chip bleue), jamais fusionnées dans « à récupérer ».
- **UNE règle de tolérance** début de mois (constante partagée, réf. `_computeImpayes` jour < 10),
  appliquée partout — fin du « 0 impayé sur l'Accueil, 14 sur Finances ».
- **Le compte de résultat Finances ne change pas** (vue trésorerie, correcte par définition).
- Quittance couverte par une avance = générable (loyer encaissé).

## Phases (1 phase = 1 livraison + audit code-reviewer)

| Ph | Contenu | Statut |
|---|---|---|
| A | **Moteur pur** : extraction de `_suiviLoyerStrip` en module `js/core/loyer-statut.js` (TDD Vitest, résolveurs injectés, zéro accès DB) + verdict pastille (seuils ±20 €) + constante de tolérance + **mémoïsation** par (ref, année, `_dbGen`) dans le wrapper. Zéro changement visuel. | 🔄 |
| B | Accueil + Tableau de bord : donut/hero/cartes lots branchés sur le moteur (cases mois AVEC report, pastilles, tooltip « couvert par avance »), `_computeImpayes` et `_v4ComputeLotStatus` deviennent des façades. Corrige constats 40-41-45. | ⬜ |
| C | Finances + navigation : widget « Loyers en retard » par locataire (compte = montant, avances à part), tous les clics impayés (Finances, Dashboard, Accueil) → modale Suivi des loyers ; bouton « 📅 Suivi des loyers » ajouté sur l'onglet Loyers/Quittances. Corrige constats 4-9, 22-24. | ⬜ |
| D | Quittances + Pilotage : `_statutQuittance` dérivé du mois couvert par l'allocation ; matrice compta = cases du Suivi. Corrige constats 42-43. | ⬜ |
| E | Régularisation : provisions dues = mois **couverts** par l'allocation (remplace `_moisSet` « mois ayant un paiement »). **Impact fiscal → audit renforcé.** Corrige constat 44 + C3/C4 de l'audit. | ⬜ |

## Journal

- 2026-07-08 : sujet créé, direction + mockup validés par user. Phase A démarrée.
