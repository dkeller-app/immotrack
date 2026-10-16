# FINANCES-SUIVI-V2 — le suivi des loyers unique, repris sur main (16/10/2026)

**Branche** : `feat/finances-suivi-v2` (part de main v15.754, fusionne main) · **Version provisoire** : v15.757 · **Migration SQL** : 0056 (NON appliquée) · **Migration de données** : préparée hors dépôt, non appliquée.
**Remplace** : la branche `feat/finances-suivi-unique` (jamais intégrée, main périmé). On en a repris les décisions et les surfaces ; on a écarté son second moteur (`suivi-loyers.js`).
**Décisions** : `RETOURS-2026-10-05.md` (lot E), décisions Didier 05/10 et 06/10 (Q1 à Q4, branche `feat/finances-suivi-unique`, `docs/subjects/FINANCES-SUIVI-UNIQUE*.md`), 16/10 (D1 « dont charges en retard » dans la ligne unique, D2 champ « retenue pour loyer », D4 KPI = somme des retards).

## Le moteur (un seul)
- `_computeDetteBail` (js/core/finances-monthly.js), étendu : position du bail à la fin de chaque mois (avance OU retard), règlements sans virement (`retenueLoyer` = `bail.dgRetenueLoyer`, manques acceptés), arrondi < 1 € cumulé, rattachement des virements par `_bailDuPaiement` (entre deux baux : le plus proche, « à confirmer » ; le choix `mv.bailDebut` fait foi).
- `_computeSuiviLot` (tous les baux d'un lot) ; `_positionLot` (position d'un lot à la fin d'un mois ; un locataire parti reste visible l'année civile de son départ, son avance est « à rendre ») ; `_friseLot` (bandeau).
- `_loyerArrearsPass` (js/core/loyer-du-mois.js) : `reglement`, `remise` (ordre H-1, plafonnés, jamais une avance), `seuilArrondi`, ouverture posée à son mois.
- App : `_finSuiviLot` (app-part2) assemble les entrées une fois (mémoïsé). La passe fiscale (2044, cash-flow) est inchangée — instantané fiscal réécrit sur main 1fc276c5, identique au centime.

## Les lecteurs
Finances (`_finMonthly` : `suivi` injecté ; ligne unique « Avance / retard des locataires », colonne Année = dernier mois exigible ; fenêtre `_finFenetre`), KPI Recouvrement (somme des retards), Accueil (bulle Impayés, pilotage), onglet Loyers, relance (bail en place), quittances (au centime ; remise dite), restitution (`_rgClotureImpayes`, avant retenue), régularisation (provision d'un mois soldé par un manque non réclamée), Mouvements (alertes « à qui ? » / « il manque »).

## Ordre de déploiement
1. `node scripts/db-run.mjs migrate` (0056) — AVANT le client (sinon le type `manque_accepte` est refusé à l'envoi).
2. Client v15.757.
3. Migration de données Ferrette (`mockups/FINANCES-SUIVI-V2/migrations-donnees/migrer-ferrette.mjs dry` puis `commit`), par Didier.

## Hors de cette branche
Écrans du dépôt détenu (maquette `mockups/FINANCES-SUIVI-V2/depot/`, en attente de Didier) ; mention GLI (Q4) ; « Sans bailleur » n'est plus sélectionnable dans Finances (pastilles de gauche seulement).
