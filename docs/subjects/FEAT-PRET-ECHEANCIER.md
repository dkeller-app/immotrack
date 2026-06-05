# FEAT-PRET-ECHEANCIER — Échéancier de prêt : amortissement mémorisé + découpage auto

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M
**Détaché de** : V3-REFONTE-LOYERS (audit pré-prod 2026-06-05) · **Lié à** : MVT-RECURRENT

---

## Problème

Le user a **au moins un crédit immobilier** en cours. Sa mensualité apparaît sur le relevé en **une seule ligne** (ex. « ECH PRÊT 742 € »), mais elle mélange **trois destins fiscaux** :
- **Capital remboursé** → **non déductible** (catégorie `special`, hors résultat foncier) ;
- **Intérêts d'emprunt** → **déductibles, ligne 250** de la 2044 (souvent la plus grosse déduction d'un bailleur financé) ;
- **Assurance emprunteur** → déductible (rattachement CERFA à confirmer : 250 vs 223).

## Périmètre de CE sujet (la partie « lourde »)

La partie **simple** est déjà couverte par la refonte loyers : les **catégories** existent (capital `special` / intérêts 250 / assurance) et le user peut **découper manuellement** sa mensualité en 3 (montants saisis depuis son tableau d'amortissement). C'est all-débit, donc faisable même sans la refonte du split multi-sens.

Ce sujet ajoute l'**automatisation** :
- **Modèle d'échéancier de prêt** : montant, taux, durée, date de début, capital initial → génération du tableau d'amortissement (capital/intérêts/assurance par échéance).
- **Pré-remplissage automatique** du découpage chaque mois quand une échéance reconnue arrive dans l'import.
- Rattachement du prêt à un bien / immeuble / SCI (pour le niveau d'affectation 2044).

## Points d'attention
- **À vérifier en début de session** : un modèle de prêt existe-t-il déjà dans l'app ? (Grep `pret`/`loan`/`amortissement`/`emprunt`.)
- S'articule avec MVT-RECURRENT (mouvements récurrents assurance/prêt).
- Vérifier le fléchage CERFA exact de l'**assurance emprunteur** (250 vs 223) — réserve soulevée par l'audit fiscal, à confirmer.

## Prompt de démarrage (à compléter en session dédiée)
À cadrer : structure de données du prêt + échéancier, calcul d'amortissement (mensualités constantes), UI de saisie du prêt, reconnaissance de l'échéance à l'import, propagation au découpage.
