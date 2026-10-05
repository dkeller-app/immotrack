# PROMPT — Session dédiée RÈGLES DE CLASSEMENT DES MOUVEMENTS · modèle **Sonnet** orchestrateur (agents adaptés, voir « Pilotage des modèles »)

Tu es la session dédiée à la **refonte des règles de classement** de l'import bancaire de Propryo (vanilla JS, code dans `js/app/app-part{1,2,3}.js`, logique pure dans `js/core/bank-import.js` **et sa copie générée** `js/helpers/bank-import.global.js`, v15.711). Tu travailles **avec Didier, en direct**. Il juge les règles actuelles « très mauvaises » : on repense **comment elles se créent, se stockent et s'appliquent**.

## À lire avant toute chose
1. `AGENTS.md` (règles non négociables du repo).
2. `docs/subjects/RETOURS-2026-10-05.md` — **lot D (D1 à D6)**, diagnostic du 05/10 ancré fichier:ligne.
3. `docs/CDC-IMPORT.md`, `docs/CDC-DESIGN-MOUVEMENTS.md`.

## Ce qui ne va pas (vérifié dans le code le 05/10, à re-vérifier sur main)
- **Modèle** : `DB.importRules[] {pattern, sens, compte, cat, qui, imm, compteurCcId, bailleurDuCompte}`, **sans identifiant**. La règle est retrouvée **par son motif** (`_bankRuleIdxOf`, `app-part2.js:27919`) : avec deux règles au même motif, « modifier la règle » peut ouvrir celle d'un autre compte. Aucun contrôle de doublon, et suppression par tombstone indexé sur le motif.
- **Application** : seulement à l'import (`_bankImportFinalizePreview`, ~27114 ; `_bankReclassify`, ~28549), en sautant les lignes `_userEdited` / `_reviewed`. Créer la règle depuis la ligne marque cette ligne « retouchée » (`_bankSyncAff`, 28302), donc **la ligne source n'est jamais reclassée**. Les **mouvements en base ne le sont jamais** non plus.
- **« Mémoriser la règle »** affiché sans condition (28142). Un second clic crée un doublon.
- **Périmètre** :
  - `compte` vide = tous les comptes (c'est la valeur par défaut hors import) ;
  - l'aperçu teste les mouvements de tous les comptes comme s'ils appartenaient au compte courant (`bank-import.js:930-934`) ;
  - dans la fenêtre règle, les listes logements, immeubles, SCI et compteurs ne sont jamais filtrées par le bailleur du compte (`_affPkListHtml`, `app-part1.js:12063`) ;
  - la « Proposition — locataire reconnu » parcourt tous les baux de toutes les entités (`_bankBauxContext`, 27079).
- **Aperçu non décochable**, sans exception ni condition de montant. Cas réel : motif « SARAR », un virement de travaux de 4 583,03 € classé en charges récupérables avec des virements de 150 €.
- **Mot-clé deviné** (`_bankSuggestPattern` : le plus long mot du libellé), donc des motifs trop larges (« ICARUS », « ELECTRICITE »). Aucune création de règle depuis un mouvement enregistré (fiche `ov-mv`).
- **Pas de catégorie « Prêt — Assurance emprunteur »** : elle n'apparaît que dans la description de la ligne 250, cachée du sélecteur (`STD_CATEGORIES`, `app-part1.js:370-403`).

## Déroulé (1 phase = 1 commit, tester avant la suivante)
1. **Comprendre ensemble** : schéma « une règle : où elle vit, quand elle s'applique, à quoi ». Didier tranche, **une question à la fois avec ta recommandation** :
   - la règle appartient-elle toujours à un compte, donc à un bailleur ?
   - l'application aux mouvements en base se fait-elle sur confirmation et peut-elle s'annuler ?
   - une ligne décochée devient-elle une exception mémorisée ?
   - quelles conditions de montant (exact, plage) ?
   - la fiscalité de l'assurance emprunteur : ligne 250 ?
2. **Maquette** (`mockups/REGLES-REFONTE/`, 3 formats, clair ET sombre), validée avant code :
   - création depuis n'importe quel mouvement ;
   - motif choisi en cliquant les mots du libellé ;
   - aperçu à lignes décochables ;
   - listes filtrées par le bailleur du compte ;
   - pastille « ✓ règle enregistrée » à la place du bouton ;
   - écran « Mes règles » : utilisations, doublons, test d'un libellé.
3. **Modèle et migration** (module `js/core/` pur et testé) : identifiant stable, compte obligatoire (migration des règles sans compte : demander à Didier), exceptions, conditions de montant, dédoublonnage, tombstone par identifiant. Mettre à jour `bank-import.js` **et** `bank-import.global.js`.
4. **Application** : ligne source et lignes de l'import immédiatement, puis mouvements en base sur confirmation, avec annulation (un seul bloc d'annulation). Jamais d'écrasement d'un classement fait à la main sans le dire.
5. **Périmètre** : filtrage par le bailleur du compte partout (règle, fenêtre de vérification, proposition de locataire), avec « voir tout » explicite. Catégorie « Prêt — Assurance emprunteur ».
6. **Branchement de l'interface** selon la maquette, puis smoke sur téléphone, tablette et PC.

## Pilotage des modèles (session lancée en **Sonnet**, niveau adapté à chaque tâche)
Tu es l'orchestrateur. Tu ne fais toi-même que le dialogue avec Didier, la synthèse et les petites tâches. Le reste, tu le délègues avec l'outil `Agent` et son paramètre `model`, selon ce barème :

| Tâche | Modèle |
|---|---|
| Recherche dans le code, cartographie, lancer les tests, tamponner, mettre à jour la copie `bank-import.global.js` | `sonnet` |
| Maquettes HTML, branchement d'interface selon une maquette validée, catégorie assurance emprunteur | `sonnet` |
| **Modèle de règle et migration** des règles existantes (identifiant, compte obligatoire, exceptions, dédoublonnage, tombstones, synchro cloud), application aux mouvements en base avec annulation | `opus` |
| Contre-audit avant livraison (agent qui n'a pas écrit le code) | `opus` |

- Chaque délégation reçoit un brief autonome : fichiers, décisions déjà prises, résultat attendu. Tu **vérifies** le rendu (tests verts, diff relu) avant de le présenter.
- La session peut rester en Sonnet du début à la fin. Exception : si l'arbitrage sur la migration des règles existantes devient délicat (données réelles de Didier), propose-lui `/model opus` le temps de cette discussion.

## Règles
- Pas de code avant la maquette validée. Vitest pour chaque helper pur (`npx vitest run`).
- Après toute modif de `js/app/app-part*.js` : `node tools/stamp-app-parts.mjs`. Bump de version à chaque livraison, BACKLOG à jour au fil de l'eau (`Pilotage : …`).
- Toute modif d'entité synchronisée : `_stamp(entity)`, tombstone, propagation cloud vérifiée.
- Contre-audit indépendant (voir le barème) avant de dire « livré ».
- Français, direct, zéro flatterie.
- Branche dédiée (`feat/regles-refonte`), merge sur main seulement après le GO de Didier.
- Coordination : la session **Finances** touche les loyers encaissés (catégorie 211). Ne pas modifier `js/core/finances-monthly.js`, `loyer-du-mois.js` ni `loyer-statut.js`.
