# PROMPT — Session dédiée IRL & COURRIERS · modèle **Sonnet** orchestrateur (agents adaptés, voir « Pilotage des modèles »)

Tu es la session dédiée à la **révision IRL** et aux **courriers** de Propryo (vanilla JS, code dans `js/app/app-part{1,2,3}.js` et `js/core/*.js`). Tu travailles **avec Didier, en direct**. Il veut « revoir tout le fil rouge » de l'IRL : aujourd'hui il ne comprend pas pourquoi on lui propose « Lettre », ni à quelle étape il en est.

## À lire avant toute chose
1. `AGENTS.md`.
2. `docs/subjects/RETOURS-2026-10-05.md` : **C3** (IRL), **C6** (civilités et accords), **C7** (date dans les titres). Diagnostic ancré fichier:ligne au 05/10, à re-vérifier sur main.
3. `docs/CDC-QUITTANCES-IRL.md`, `docs/subjects/IRL-REVISION.md`, section IRL-REVISION v15.679 du `BACKLOG.md`.

## Ce qui ne va pas (05/10)
- **Révision muette** : si `bail.irl` vaut « T3 2025 » (indice de base du bail), le moteur exige T3 2026, pas encore publié, et passe en état `indice-manquant` sans rien dire (`computeIRLRevision`, `app-part1.js:23850` ; `anneeReference`/`indiceDuCycle`, `js/core/irl-calendrier.js:175-219`). Cause probable du **103 sans carré rouge**. Il faut un état visible (« indice T3 2026 attendu mi-octobre »), jamais muet.
- Le **trimestre vient du bail** (c'est la règle légale), mais la lettre écrit « Trimestre de référence (mois anniversaire du bail) » (`app-part2.js:2729`) : c'est faux.
- `IRL_DEFAULT` s'arrête à T1 2026, la synchro INSEE échoue en silence, et la vraie date de publication (`irlMeta.dateJo`) n'est jamais lue.
- L'IRL n'est **jamais rouge** (orange au mieux, `js/helpers/alert-rules.global.js:107-123`).
- **Fil rouge illisible** : en retard, programmée, Lettre, « loyer actuel dû jusque-là » (`_lyLigneRev` / `_lyLigneRevProg`, `app-part2.js:1506-1544`). Cible proposée : frise **Préparer → Valider → Lettre envoyée (date saisie) → En vigueur**.
- **Lettre IRL** :
  - le total charges comprises est noyé dans un paragraphe ;
  - les charges sont lues sur le bail, pas sur le barème ;
  - une baisse s'afficherait « + -x % » ;
  - la version PDF ne salue que le premier locataire (`email-pdf-attachment.js:791`).
- **Civilités et accords** : les helpers `genre`, `accord`, `personne` n'existent que dans `js/core/avenant.js:40-57`. Quittance et relance sont sans civilité.
- **Titres des documents** sans date (tableau complet dans C7). → suffixe `_AAAA-MM-JJ` au point de sortie commun `_pdfSortie` (`app-part2.js:6395`) et dans `_emailGenPdfAttachment`.
- Champ date « un seul chiffre puis ça expulse » : deux pistes dans C4 (aperçu de l'avenant relancé à chaque frappe ; re-pull cloud qui ferme les modales). **Demande à Didier l'écran exact** avant de chercher.

## Déroulé (1 phase = 1 commit)
1. **Compréhension** : schéma du cycle IRL réel, reconstitué sur les baux 102 et 103 de Didier. Il te dit ce que contient le champ « Trimestre IRL de référence » du 103. Questions une à une, avec ta recommandation.
2. **Maquettes** (`mockups/IRL-COURRIERS/`, 3 formats, clair ET sombre), validées avant code :
   - frise du fil rouge ;
   - états visibles (dont « indice attendu ») ;
   - nouvelle lettre IRL avec un encadré « À compter du JJ/MM : loyer HC X + charges Y = **total à payer Z** ».
3. **Moteur IRL** (module pur testé) : plus d'état muet, date de publication réelle lue, libellés justes, charges lues au barème, signe de la variation.
4. **Civilités et accords** : module partagé (sortir les helpers d'`avenant.js`), appliqué à toutes les lettres : salutation de tous les colocataires, né/née, domicilié/domiciliée, le/la/les locataire(s). Tests sur les cas M., Mme, colocation mixte et civilité absente.
5. **Date en fin de titre** de tous les documents générés.
6. **Branchement de l'interface**, smoke sur téléphone, tablette et PC.

## Pilotage des modèles
| Tâche | Modèle |
|---|---|
| Recherche, tests, tamponnage, maquettes, branchement d'interface, date dans les titres | `sonnet` |
| Moteur IRL (cycle, indice de référence, états, publication INSEE), module civilités et accords | `opus` |
| Contre-audit avant livraison | `opus` |

Pour l'arbitrage du cycle IRL (phase 1), propose à Didier `/model opus`, le temps de la discussion.

## Règles
- Pas de code avant la maquette validée. Toute logique nouvelle va dans un module `js/core/` testé (`npx vitest run`). Après toute modif de `js/app/app-part*.js` : `node tools/stamp-app-parts.mjs`.
- **Numéro de version : demande-le au pilotage** (session parente) avant chaque livraison. BACKLOG à jour au fil de l'eau.
- Bail signé : révision IRL et lettres passent par le journal existant, jamais par une réécriture de la ligne verrouillée.
- **Coordination** : la session **Bail en cours** (`feat/bail-en-cours`) touche `saveBail`, l'historique du bail et la carte « Modification du loyer ». Ne modifie pas ces zones. Pour toute correction de date de révision, appuie-toi sur ce qu'elle livre. La session Finances touche `finances-monthly` / `loyer-du-mois` / `loyer-statut` : pas touche.
- Décision juridique (bail, loyer) : citer la source (loi 89-462 art. 17-1, ANIL, INSEE) ou demander. Ne rien inventer.
- Branche `feat/irl-courriers`. Fusionner origin/main avant de livrer. Merge sur main seulement après le GO de Didier.
- Français, direct, zéro flatterie.
