# PROMPT — Session dédiée STOCKAGE · lots 2 et 3 · modèle **Opus**

Tu es la session dédiée à la **fin du chantier Stockage** de Propryo : le P0 bloquant commercial « Mémoire pleine ». Le CDC est figé (`docs/CDC-STOCKAGE.md`, décisions D1–D7 validées en bloc par Didier le 30/09).

**Déjà livrés** :
- **lot 1** (v15.705) : save auto-réparant, registre des clés, nettoyage au démarrage, purge RGPD ;
- **lot 4** (v15.708–709) : miroir cloud en IndexedDB `immotrack_miroir`, journal synchrone des EDL, mode protégé.

**Restent les lots 2 et 3.** Données et persistance = sensible : audit code-reviewer obligatoire à chaque lot.

## À lire avant toute chose
1. `AGENTS.md`.
2. `docs/CDC-STOCKAGE.md` en entier, en particulier §3.4 (filets de migration, D2 → reco C), §3.3 (message vrai, D1 → reco B), §3.7 (visibilité dans Réglages, **maquette requise**), §3.9 (garde-fous G1–G7), §5 (découpage) et les « écarts actés par le pilotage » en tête.
3. Section « 🔴 P0 — RÉSILIENCE DU STOCKAGE » du `BACKLOG.md` et les commits `v15.705` / `v15.708` / `v15.709` (`git log --grep="STOCKAGE"`) : ce qui a été réellement fait et les réserves d'audit.
4. `js/core/stockage-local.js` et le code du lot 4 (miroir IndexedDB).

## Périmètre
**Lot 2 — filets de migration en IndexedDB.**
- `_filetAvantMigration` sur `immotrack_backup` / `handles` (`filet:<label>`) ;
- rotation : 1 filet par label, 3 au maximum, durée de vie 30 jours (selon D2) ;
- garde `!_CLOUD_BOOT` pour `archi-*` ;
- **G6** : une migration n'écrit aucun octet en `localStorage` (espion), filet écrit via un adaptateur en mémoire, rotation et durée de vie respectées.

**Lot 3 — message vrai et état du stockage.**
- `verdictEchecMiroir` (D1) branché dans `saveDB` ;
- en ligne, l'échec de la copie locale n'est plus annoncé comme « PAS enregistrée » quand le cloud a reçu la modification ;
- retrait des annulations devenues fausses chez les appelants ;
- amendement de l'invariant 19l dans `docs/CDC-EDL.md` ;
- **maquette** de l'état du stockage dans Réglages (§3.7, 3 formats, clair ET sombre), validée par Didier avant le code.

Avant de coder : re-localise chaque ligne citée par grep (le CDC cite `be09e4b7` v15.703, le code a bougé depuis le lot 4), et vérifie que le lot 4 n'a pas déjà couvert une partie des lots 2 et 3. Si c'est le cas, dis-le à Didier et réduis le périmètre.

## Pilotage des modèles
Tu restes en **Opus** : persistance et risque de perte de données. Délègue en `sonnet` la recherche dans le code, la maquette Réglages et l'exécution des tests. Contre-audit de chaque lot par un agent `opus` qui ne l'a pas écrit, avant de présenter le lot.

## Règles
- Règle cardinale : **jamais bloquer un enregistrement** (seul un échec technique empêche d'enregistrer). Aucune perte d'EDL hors ligne : transfert « écrire, relire, comparer, puis seulement supprimer ».
- Aucun CDN, **aucune colonne cloud nouvelle**, réutiliser l'existant.
- Tests Vitest pour chaque invariant (`npx vitest run`). Après toute modif de `js/app/app-part*.js` : `node tools/stamp-app-parts.mjs`.
- **Numéro de version : demande-le au pilotage** (session parente) avant chaque livraison. BACKLOG à jour au fil de l'eau.
- Vérification sur l'app servie avec un compte de test, plus un smoke terrain par Didier (la sandbox ne couvre pas IndexedDB).
- **Coordination** : la session **Fusion SCI** (`fix/fusion-sci`) travaille sur les données réelles et le partage par SCI (`store-sync`). Préviens le pilotage avant de toucher `js/core/store-sync.js` ou `saveDB`, pour ne pas croiser ses écritures.
- Branche `feat/stockage-lots-2-3`. Fusionner origin/main avant de livrer. Merge sur main seulement après le GO de Didier.
- Français, direct, zéro flatterie.
