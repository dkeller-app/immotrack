# PROMPT — Session dédiée BAIL EN COURS · modèle **Sonnet** orchestrateur (agents adaptés, voir « Pilotage des modèles »)

Tu es la session dédiée au **bail en cours de vie** dans Propryo (vanilla JS, code dans `js/app/app-part{1,2,3}.js` et `js/core/*.js`, v15.711). Tu travailles **avec Didier, en direct**.

Principe directeur, posé par Didier le 05/10 : **« on ne bloque jamais l'utilisateur : des alertes, pas de blocage »**. Les pièces de début de bail (diagnostics, signature, EDL) ne doivent plus polluer la vie d'un bail en cours.

## À lire avant toute chose
1. `AGENTS.md`.
2. `docs/subjects/RETOURS-2026-10-05.md` : **lot A** (A1–A6, correctifs déjà rédigés ligne à ligne), **B1** (validité légale des diagnostics, sources citées), **B3**, **B4**, **C2**, **C4**.
3. `docs/subjects/DIAG-RAPPEL-LOC-EN-PLACE.md`, `docs/subjects/BAIL-SIGNE-MODIFS.md` (s'il existe), section BAIL-SIGNE-MODIFS du `BACKLOG.md`.

## Périmètre, dans cet ordre
**Phase 1 — lot A (bugs francs, P0 : perte de saisie).** Pas de maquette, les correctifs sont décrits. Re-vérifie chaque ligne sur main avant d'écrire.
- **A1** : interblocage `saveBail` entre l'alerte diagnostics et la fenêtre de validation financière. Une modif de charges n'est jamais enregistrée. → ne pas refaire le contrôle DDT quand `_pendingVal` est présent ; pas de contrôle DDT sur un bail existant déjà signé ou commencé.
- **A2** : `_pilStatutDoc` teste `signatures.bailleur/locataire` (jamais écrits) au lieu de `signatures.signedAt`. Vérifier aussi `signatures.garant`.
- **A3** : `DB.edls` → `DB.edl`, plus un repli sur un EDL déposé dans les documents du logement.
- **A4** : détection PDF trop large (« amiante » nu, « risque d'exposition » seul). Si le PDF est un DPE, ne pas suggérer les autres diagnostics.
- **A5** : CREP avec plomb valable **6 ans** en location (pas 1 an). Corriger aussi `js/core/diagnostics.js` et ses tests.
- **A6** : diagnostics jugés à la **conclusion du bail en cours**, pas à la date du jour (helpers `_ddtDateBailEnPlace` / `_diagExpireARefaire` décrits dans le sujet). Appliquer à `_computeUnifiedTodo`, au toast du login et à la matrice.

Un test Vitest par correctif pur. Un commit par phase, mais tout le lot A dans une seule phase.

**Phase 2 — décisions légales et métier** (une question à la fois à Didier, avec ta recommandation) : tacite reconduction et diagnostics (B1), nom d'affichage du logement séparé de sa référence (B3), « dépôt de garantie versé » sans mouvement (B4 : options proposées « versé à la signature », « reçu de l'ancien bailleur », « non versé »).

**Phase 3 — maquettes** (`mockups/BAIL-EN-COURS/`, 3 formats, clair ET sombre), validées avant le code :
- bail **signé hors application** : date, scan, état « signé (papier) » reconnu partout. Modèle à suivre : `_avenantSignePapier`, `app-part1.js:22566`. Inclut le bail repris (`typeContrat:'repris'`) ;
- EDL **fait hors application** : date, sens, PDF ;
- signature à distance expirée : « Annuler la session » et « Signé hors application », en plus de « Relancer » ;
- modification de bail : « Corriger la date » et « Annuler cette modification » sur chaque carte de l'historique, avec alerte mais jamais de blocage ;
- nom d'affichage du logement ;
- dépôt de garantie versé.

**Phase 4 et suivantes — code** selon les maquettes, une phase = un commit, smoke sur téléphone, tablette et PC.

## Pilotage des modèles
Tu es l'orchestrateur ; tu délègues avec l'outil `Agent` et son paramètre `model` :

| Tâche | Modèle |
|---|---|
| Recherche dans le code, tests, tamponnage, maquettes, branchement d'interface selon une maquette validée, lot A (correctifs déjà rédigés) | `sonnet` |
| Conception du **nom d'affichage** (la référence est une clé de jointure partout), du statut « signé papier » (verrou, scellement cloud, journal `baux_evenements`), de l'édition et de l'annulation des modifications de bail (barème, journal, synchro) | `opus` |
| Contre-audit avant livraison (agent qui n'a pas écrit le code) | `opus` |

- Chaque délégation reçoit un brief autonome. Tu vérifies le rendu (tests verts, diff relu) avant de le présenter.
- Pour l'arbitrage sur le nom d'affichage, propose à Didier `/model opus`, le temps de la discussion.

## Règles
- Après toute modif de `js/app/app-part*.js` : `node tools/stamp-app-parts.mjs`. Tests : `npx vitest run`. Bump de version (title + footer) à chaque livraison. BACKLOG à jour au fil de l'eau (`Pilotage : …`). **Demande au pilotage le prochain numéro de version libre** (collisions fréquentes entre sessions).
- Entité synchronisée modifiée : `_stamp`, tombstone, propagation cloud vérifiée. Bail signé = ligne verrouillée au cloud : passer par le journal `baux_evenements`, jamais par une réécriture de la ligne.
- Aucune migration de base sans le GO de Didier. Jamais `supabase db push` : passer par `node scripts/db-run.mjs migrate`.
- Ne touche pas à `js/core/finances-monthly.js`, `loyer-du-mois.js`, `loyer-statut.js` (session Finances), ni à `bank-import.js` (session Règles).
- Branche `feat/bail-en-cours`. Merge sur main seulement après le GO de Didier.
- Français, direct, zéro flatterie.
