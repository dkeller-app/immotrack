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

## Vision user (2026-06-05) — « le top »

> « Intégrer un tableau d'amortissement qu'on gère avec une règle sur un prêt, et que ça découpe au fur et à mesure avec le bon ratio amortissement / intérêt. »

Décodage et points de design qui en découlent :
- **Le prêt est l'objet maître** : on le paramètre une fois (capital, taux, durée, date de 1ʳᵉ échéance, assurance) → l'app **génère le tableau d'amortissement complet** (une ligne par mois : part capital, part intérêts, part assurance, capital restant dû).
- **« Au fur et à mesure » = par date d'échéance** : le ratio **capital/intérêts n'est pas constant** — au début du prêt l'échéance est surtout des **intérêts** (très déductibles), à la fin surtout du **capital** (non déductible). À chaque échéance importée, l'app prend **la ligne du tableau correspondant au mois de l'échéance** et découpe le prélèvement avec **ce** ratio-là, pas un ratio moyen.
- **« Une règle sur un prêt »** = un découpage **déterministe** attaché au prêt, déclenché quand une échéance reconnue arrive. ⚠️ Ne pas confondre avec une « règle d'auto-catégorisation devinée » (interdite par garde-fou) : ici les montants sont **calculés exactement**, pas devinés. L'utilisateur garde la main (peut ajuster une échéance qui a varié — taux révisable, remboursement anticipé).
- **Bénéfice 2044** : les **intérêts (ligne 250)** — souvent la plus grosse déduction d'un bailleur financé — sont captés au centime, automatiquement, chaque mois.
- **Cas à prévoir** : prêt à taux révisable (le tableau change), remboursement anticipé partiel (re-génération), modulation d'échéance, assurance dégressive vs constante, premier/dernier mois prorata.

## Points d'attention
- **À vérifier en début de session** : un modèle de prêt existe-t-il déjà dans l'app ? (Grep `pret`/`loan`/`amortissement`/`emprunt`.)
- S'articule avec MVT-RECURRENT (mouvements récurrents assurance/prêt).
- Vérifier le fléchage CERFA exact de l'**assurance emprunteur** (250 vs 223) — réserve soulevée par l'audit fiscal, à confirmer.

## Prompt de démarrage (à compléter en session dédiée)
À cadrer : structure de données du prêt + échéancier, calcul d'amortissement (mensualités constantes), UI de saisie du prêt, reconnaissance de l'échéance à l'import, propagation au découpage.
