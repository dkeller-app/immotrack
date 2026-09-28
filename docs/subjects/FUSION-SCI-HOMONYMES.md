# P0 — Fusion de deux SCI homonymes (SCI SMARTOSAURUS, 28/09)

## Diagnostic (lecture seule, base hébergée)

- Espace partagé de Marion `2e5c49db…` : SCI `6afe1b64…`. Didier y est membre non plein
  (`lecture_seule`, `full_espace=false`) mais **gestionnaire** de la SCI (`entite_membre`) : il écrit sur elle.
- Espace privé de Didier `63bde261…` : copie `6617fc67…` (renommée) + `5186b35e…` (ancien nom, supprimée).
- La fusion n'existait que dans le client de Didier (jointures par nom sur deux espaces hydratés).
  En base, `entite_id`/`espace_id` séparaient tout : rien de perdu. 49 enregistrements tamponnés par la cascade.
- `trg_freeze_espace_id` sur 15 tables : une ligne ne change jamais d'espace. Les id sont
  `detUuid(owner de l'espace, collection, clé)` → « déplacer » = recréer avec l'id de l'espace cible.
- `content_hash` d'un bail ne hashe que les termes (ni id, ni espace, ni bailleur) → un bail signé recréé
  à l'identique garde son empreinte (vérifié à blanc sur le bail signé du 101).

## Décisions de Didier (28/09)

Une seule SCI, dans l'espace de Marion. On garde le bail Baysang (FERRETTE 001, chez Marion) et tout le
reste vient de la copie de Didier (le 101 réel est chez lui). Suppression du logement test « F » voulue.
Type « SCI IS ». Signature du gérant reprise de la copie de Didier.

## Réparation des données

Sauvegarde + scripts : `Desktop\Immo-SAUVEGARDE-FUSION-SCI-2026-09-28\`
(`backup-avant-fusion-*.json`, `fusion-sci.mjs dry|commit`, `fusion-sci-inverse.mjs dry|commit`).
Test à blanc OK : 6 logements, 6 baux dont 2 signés (empreintes identiques), 30 quittances,
33 mouvements, 3 EDL, 2 historiques, 32 agenda, 13 documents, 18 fichiers copiés, 0 manquant.
**Le `commit` a été refusé par le classifieur automatique de Claude Code : à lancer par Didier**
(ou autorisation explicite dans les réglages). 75 des 77 photos de l'EDL du 101 n'ont jamais été
montées au cloud (antérieur à l'incident).

## Garde-fou (worktree `Immo-wt-garde-fou-bailleur`, branche `fix/garde-fou-bailleur-doublon`, v15.688)

- `js/core/entite-doublon.js` (pur) + shadow inline dans index.html (test de non-divergence).
- `saveEnt` : donner un nom déjà porté par un autre bailleur → refus avant toute écriture ;
  nom inchangé + homonyme → enregistré avec avertissement ; même SIREN (SIRET compris), nouveau
  ou changé → confirmation.
- Cascade de renommage limitée à l'espace du bailleur quand un homonyme porte l'ancien nom.
- Import d'acte : même règle (`_acteFindDupEntity`), création forcée sous un nom existant refusée.
- 26 tests dont « renommer un bailleur avec le nom d'un autre est refusé ». Suite : 4 627 verts.
- Audit code-reviewer : passe 1 « À CORRIGER » → corrigé (4a83908) ; passe 2 : voir BACKLOG.

## À traiter par le pilotage (non codé ici)

1. **Jointures par nom** (`l.entity === e.nom`, `qui:'SCI:'+nom`, ~22 sites) : les cadrer par `_espaceId`,
   puis refonte vers un identifiant stable (ARCHI-DB-DOUBLONS).
2. **Ids legacy identiques entre espaces** : `openNewEnt`/`saveEnt` prennent le premier bailleur d'un id
   donné → un second bailleur de même id (autre espace) n'est pas éditable. Identifier par
   `(id, _espaceId)` ou `entityId`.
3. **Import référentiel** (`validateImportRef`) : rapprochement par nom exact, écrase le premier
   homonyme (éventuellement d'un autre espace), sans `_stamp` ni contrôle SIREN.
4. `_buildEntityPayload` filtre par nom même pour un bailleur supprimé : à vérifier.
5. Audit log : la suppression de « F » (logement de l'espace de Marion) a été journalisée dans l'espace
   de Didier.
6. Bail signé du 101 pointait une SCI supprimée (`5186…`) — même famille que « bail signé figé au cloud ».
