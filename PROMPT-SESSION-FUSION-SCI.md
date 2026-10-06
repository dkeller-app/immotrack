# PROMPT — Session dédiée FUSION DES DEUX « SCI SMARTOSAURUS » · modèle **Opus**

Tu es la session dédiée à la **fusion de deux bailleurs homonymes** dans les **données réelles** de Didier (Propryo, vanilla JS + Supabase). C'est un P0 : on touche aux données de production, en partie dans l'espace partagé de Marion (co-gérante). Prudence maximale, tout en lecture seule tant que Didier n'a pas validé un plan exact.

## À lire avant toute chose
1. `AGENTS.md`.
2. `BACKLOG.md`, section **« 🔴 P0 — FUSION DE DEUX SCI HOMONYMES »** (incident, cause vérifiée, décision option B du 28/09, contraintes, discriminants de récupération).
3. Le garde-fou anti-doublon déjà livré en v15.692 (section MAIN v15.692 du BACKLOG).
4. La branche `feat/partage-isolation-sci` (migrations 0050 à 0053, partage par SCI, RLS) : dis à Didier si elle est déjà dans main ou à intégrer. Elle conditionne les droits d'écriture entre espaces.
5. `docs/subjects/RETOURS-2026-10-05.md` (contexte : Ferrette 101/102/103 appartiennent à cette SCI).

## Ce qu'on sait
- Deux bailleurs « SCI SMARTOSAURUS » désignent la même SCI réelle (SIREN 994 086 379). L'un est dans l'**espace partagé de Marion**, l'autre est une **copie privée de Didier**. Leurs logements Ferrette sont en double (6 + 6).
- Les jointures se font **par nom** (`l.entity === e.nom`). Un renommage en cascade a rendu les deux jeux indiscernables par le nom. ⚠️ **Ne jamais renommer pour revenir en arrière.**
- Discriminants pour les séparer : `_espaceId`, l'horodatage identique posé par la cascade (`_modifiedAt`), le journal d'audit (`_auditLog update entite`).
- **Décision de Didier : option B.** Une seule SCI, et les logements dédoublonnés. Recommandation du pilotage : la survivante est la SCI de l'espace partagé (vue par Didier et Marion) ; Didier confirme sur pièces.

## Déroulé (rien n'est écrit en base avant l'étape 4)
1. **Diagnostic en lecture seule** (Supabase MCP `execute_sql` en SELECT uniquement, ou export fourni par Didier). Pour chaque enregistrement (entités, logements, baux, baux_historique, baux_evenements, EDL, quittances, mouvements, documents, photos, règles d'import, comptes bancaires) : quel espace, quelle copie, quels doublons. Pour chaque paire de logements, le **survivant est celui qui porte le bail ou l'EDL signé**.
2. **Rapport** `mockups/FUSION-SCI/DIAGNOSTIC.md` : tableau paire par paire (survivant, absorbé, ce qui est rapatrié), puis ce qui reste ambigu. Questions à Didier, une à la fois, avec ta recommandation.
3. **Plan exact** `mockups/FUSION-SCI/PLAN.md` : chaque écriture, dans l'ordre. Sauvegarde complète avant toute écriture (export JSON horodaté). Uniquement des tombstones (`_deleted`), jamais de suppression dure. Baux et EDL signés verrouillés : on ne les réécrit pas, on rattache les autres pièces à eux. **Rien chez Marion effacé.** Plan de retour arrière. → **GO explicite de Didier.**
4. **Exécution** : script idempotent et testé (`scripts/` ou module `js/core/` pur avec tests Vitest sur une copie des données), lancé par Didier ou avec son accord pas à pas. Vérification après coup : comptes par table, vue de Didier, vue de Marion.
5. **Correctifs structurels** à proposer, pas à coder dans cette session sauf GO : jointures par nom bornées à `_espaceId`, puis identifiant stable du bailleur (ARCHI-DB-DOUBLONS).

## Pilotage des modèles
Tu restes en **Opus** : toute la session porte sur des données réelles. Délègue en `sonnet` uniquement la recherche dans le code (où se fait chaque jointure par nom, quelles tables portent `entity`) et l'exécution des tests. Contre-audit du plan et du script par un agent `opus` qui ne les a pas écrits, **avant** le GO.

## Règles
- Aucune écriture en base, aucune migration sans GO explicite. Jamais `supabase db push` : passer par `node scripts/db-run.mjs migrate`.
- Ne pas modifier l'app (`js/app/`) dans cette session, sauf correctif validé par Didier.
- Coordination : les sessions Bail en cours, Finances et Règles travaillent en parallèle sur le code. Toi, tu travailles sur les données. Préviens le pilotage avant toute exécution, pour qu'aucune session ne teste sur les données à ce moment-là.
- Branche `fix/fusion-sci` pour les documents et scripts.
- Français, direct, zéro flatterie.
