# IMPORT-EXCEL-LOG — Refonte template Excel d'import (multi-onglets à renvois = pas intuitif)

**Status** : ⬜ À faire (V1 template livrée, refonte demandée) · **Prio** : P2 · **Taille** : M
**Lié à** : V3-REFONTE-IMPORTS-UI (19E), IMPORT-CONCURRENTS

## Contexte

V1 existante : `genImportTemplate` + `handleImportRef` (6 onglets xlsx, livré Sprint 14).

> 💬 2026-07-02 : *« import / données : revoir tout le fichier excel. pas possible d'avoir plusieurs onglets qui se rappellent. c'est pas intuitif »*

Le template à 6 onglets avec références croisées entre onglets (le logement référence l'immeuble par nom, etc.) est trop complexe pour un non-technicien : il faut connaître l'ordre de remplissage et recopier des clés exactes entre onglets.

## Direction (à explorer)

- **Option A — feuille unique dénormalisée** : 1 ligne = 1 logement avec colonnes bailleur/immeuble répétées ; l'import déduplique et crée la hiérarchie automatiquement. Simple à remplir, tolérant.
- **Option B — wizard in-app** : moins d'Excel, plus d'écrans guidés (recoupe FLOW-CREATION-BIEN pour la saisie unitaire ; l'Excel ne sert que l'import en masse).
- Validation à l'import avec rapport clair (lignes ignorées + pourquoi), pas d'échec silencieux.
- Coordonner avec V3-REFONTE-IMPORTS-UI (19E) pour l'UI de l'onglet Import.

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : fichier sujet créé en session pilotage (le code existait dans BACKLOG sans doc). Retour user capté : multi-onglets à renvois rejeté.
