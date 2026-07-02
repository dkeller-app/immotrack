# NAV-BIENS-SIMPLIFICATION — Onglet Biens : trop de sous-onglets (Bailleur / Immeuble / Logement), simplifier « type iPhone »

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (mockup-first)
**Détecté** : 2026-07-02 (user, test app réelle)
**Lié à** : FLOW-CREATION-BIEN (même chantier), NAV-RESTRUCTURE ✅ v14.2, IMM-FICHE-SOUS-ONGLETS, FICHES-PARITE-360

## Contexte

> 💬 2026-07-02 : *« revoir tous les onglets dans logement, il y a trop de sous-onglets (bailleur, immeuble, logement). Il faut être sharp et intuitif (type iphone) »*

L'onglet Biens expose 3 niveaux (Bailleur / Immeuble / Logement) en sous-onglets parallèles alors que c'est une **hiérarchie** (bailleur possède immeuble contient logement). Résultat : navigation à tiroirs, on ne sait pas où cliquer.

## Direction (à explorer en mockups)

- Une **vue unique hiérarchique** : liste des biens groupée bailleur → immeuble → lots (le pattern groupement existe déjà : LOG-LISTE-CARDS groupe par bailleur ; UX-GROUP-BY-IMMEUBLE fournit les intercalaires).
- Le détail (fiche bailleur / fiche immeuble / fiche 360 logement) s'ouvre par **drill-down** depuis la vue unique, plus par sous-onglets permanents.
- Benchmark « type iPhone » : 1 liste, 1 recherche, 1 bouton « + » (= FLOW-CREATION-BIEN), zéro chrome inutile.

## Décisions à prendre

- D1 : supprime-t-on complètement les sous-onglets ou garde-t-on un toggle de vue (par bailleur / par immeuble) ?
- D2 : où atterrissent les actions aujourd'hui portées par les sous-onglets (archiver bailleur, éditer immeuble…) → dans les fiches drill-down ?

## Règles gravées applicables

- Mockup-first (A/B/C × 3 formats × drill-downs)
- Ancrer dans l'app réelle : lire `rBiens`/`_renderBiensModeBailleurs` AVANT de mocker
- DRY : réutiliser les groupements existants

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : sujet créé en session pilotage (triage retours test user). À designer dans la même session que FLOW-CREATION-BIEN (chantier Biens).
