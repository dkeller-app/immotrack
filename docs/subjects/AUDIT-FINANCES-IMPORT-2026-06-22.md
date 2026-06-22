# Audit utilisateur — Finances / Import / Loyers (2026-06-22)

Liste capturée en session. **🐞 = bug** · **✨ = feature/UX** · **⚖️ = fiscal (prioritaire)**.
Légende statut : ⬜ à faire · 🔄 en cours · ✅ livré.

## A. Import bancaire (onglet Loyers → Importer banque)

| # | Item | Type | Statut |
|---|------|------|--------|
| A1 | Reconnaître qu'une ligne a été **scindée** (split) → ne pas la re-proposer à l'import (ex : versement gérance splitté en loyer + frais + APL). Dédup sur la ligne source d'un split. | 🐞 | ⬜ |
| A2 | Pouvoir **supprimer une ligne** dans l'aperçu d'import (ne pas l'importer du tout). | ✨ | ⬜ |
| A3 | Pouvoir **renommer le libellé** d'une ligne d'import. | ✨ | ⬜ |
| A4 | **Bouton « Valider »** explicite — l'import auto est dérangeant et source d'erreurs. Rien ne doit s'importer sans validation. | ✨ UX | ⬜ |
| A5 | **Ne pas classer en « Reconnus » sans affectation** (logement / immeuble / SCI). Ex : un mouvement de prêt apparaît en Reconnus sans immeuble. | 🐞 | ⬜ |
| A6 | **Expliquer / revoir** : les lignes validées dans « À compléter » basculent dans « Reconnus » (déroutant). | ✨ UX | ⬜ |
| A7 | **Bloquer l'import** tant que les « Reconnus » n'ont pas été vérifiés (avoir scrollé en bas de la liste). | ✨ | ⬜ |
| A8 | **Aperçu 2044 de fin d'import FAUX** : additionne recettes + charges au lieu de soustraire (ex : 2179,64 « + » 2121,16 = 4300,80 affiché ; correct ≈ 58). | ⚖️🐞 | ⬜ |
| A9 | **Règles d'import** : ne gère pas le couple **compte + intitulé** → une règle pour l'import compta reprend toujours une seule SCI. | 🐞 | ⬜ |

## B. Finances (reporting / 2044 / dashboard)

| # | Item | Type | Statut |
|---|------|------|--------|
| B1 | **Calcul d'enrichissement FAUX** : ajoute le capital amorti alors qu'il n'a pas été retiré du P&L → grosse différence Finances (22 916 €) vs Dashboard (37 154 €). À revoir clairement (cash-flow réel vs résultat comptable). | ⚖️🐞 | ⬜ (déjà analysé en session) |
| B2 | **360 k€ de loyers impayés** affichés dans « Argent à récupérer » → manifestement faux (cumul sur toute la durée des baux ?). | ⚖️🐞 | ⬜ |
| B3 | **Vacance locative** : passé ou projeté ? En Finances on ne doit prendre que la période **passée** de l'exercice. | 🐞 | ⬜ |
| B4 | **Visu 12 mois glissants** (cash-flow) — nouvelle visualisation à concevoir. | ✨ | ⬜ |
| B5 | **Année en cours par défaut** partout (sélecteur d'exercice). | 🐞/✨ | ⬜ |
| B6 | **SCI à plusieurs immeubles** : pouvoir filtrer sur **un seul immeuble**. | ✨ | ⬜ |
| B7 | Drill « Répartition par bien » : non ventilé (gérance) isolé + actionnable. | ✨ | ✅ v15.338 |

## C. Mouvements / Prêt

| # | Item | Type | Statut |
|---|------|------|--------|
| C1 | **Mouvements récurrents** (saisie manuelle) + warning « ce mouvement sera récurrent, ne pas réimporter le même ». | ✨ | ⬜ |
| C2 | **Import des tableaux d'amortissement** de prêt. | ✨ | ⬜ |

## D. Compteurs / Charges récupérables

| # | Item | Type | Statut |
|---|------|------|--------|
| D1 | Compteur **Ferrette - 101** impossible à supprimer ni modifier. | 🐞 | ⬜ |
| D2 | Compteurs : permettre un **calcul** (compteur général − sous-compteur = conso d'un logement). | ✨ | ⬜ |

## E. HORS finance/loyers → AUTRE SESSION

| # | Item | Domaine |
|---|------|---------|
| E1 | **Dépôt de garantie augmente lors d'une révision IRL** → supprimer la règle de remplissage auto de la case DG (le DG ne doit jamais bouger seul). | Logement / Bail (borderline IRL) |
| E2 | **Bail échu alors que renouvelé tacitement** → apparaît vacant. La tacite reconduction ne se fait-elle qu'une fois ? Revoir la logique de statut (échu / tacite / vacant). | Bail |
