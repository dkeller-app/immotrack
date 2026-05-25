# BUG-DELETE-BRUT-NO-TOMBSTONE — Audit des suppressions brutes sans tombstone

**Status** : ⬜ À investiguer · **Prio** : P1 · **Taille** : S (~1-2h investigation, M si fix)
**Détecté** : 2026-05-25 par user (cas SCI Dupont via cleanupDupontLocal)
**Lié à** : BUG-DRIVE-RESURRECTION (v14.30-32), BUG-DEMO-INJECTION (✅ v15.166)

## Problème

Cas user 2026-05-25 : le bouton « Supprimer SCI Dupont locale » (`cleanupDupontLocal`)
faisait `DB.entites = DB.entites.filter(x => x.nom !== dupontName)` — suppression
brute sans tombstone. Conséquence : entité disparaît localement mais réapparaît
au prochain pull Drive (car le payload push n'itère que les entités ALIVE → tombstone
jamais propagé sur Drive → la version live sur Drive ramène l'entité au pull).

✅ **Fix immédiat** : bouton + fonction retirés en v15.166. L'utilisateur passe par
`delEnt(id)` sur la fiche entité, qui crée un vrai tombstone + cascade + propage.

⚠️ **Question ouverte** : y a-t-il d'autres `filter(...)` qui suppriment des données
sans tombstone et qui pourraient causer la même résurrection sur d'autres types
d'objets (logements, baux, mouvements, assurances, MRH, quittances, EDLs) ?

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs multi-device (la majorité = PC + téléphone minimum)
2. **Règles** : ne rien casser de plus, investigation pure d'abord
3. **Justifications** :
   - 🧑 Cas user 2026-05-25 (frustration légitime : « je n'arriverai pas non plus à supprimer d'autres infos demain »)
   - 💻 Code suspect : pattern `filter(x => ...)` sans tombstone détecté dans cleanupDupontLocal — possible répétition
   - 📋 Backlog : BUG-DRIVE-RESURRECTION (v14.30) couvrait delEnt mais pas forcément tous les chemins de suppression
4. **5 vues 360°** : technique (sync) + UX (frustration) + commercial (V1 livrable) + cycle de vie (multi-device) + data integrity (résurrection silencieuse = bug pernicieux)

## Investigation à mener (sans toucher au code)

### Phase 1 — Audit grep (~30 min)

Grep tous les sites qui mutent `DB.{collection}` avec `filter()` ou `splice()` :

```
grep -n "DB\.\(entites\|logements\|baux\|baux_historique\|mouvements\|quittances\|assurances\|mrh\|edl\|agenda\|documents\|irlHistorique\|equipements\)\s*=\s*[^[]" index.html
grep -n "DB\.\w*\.splice\|delete DB\.\w*\[" index.html
```

Pour chaque hit, vérifier :
- Est-ce un delete user-facing (vs init/migration interne) ?
- Y a-t-il création de tombstone (`_deleted: true`, `_modifiedAt`) avant le filter ?
- saveDB() est-il appelé après ?
- L'objet est-il référencé dans `_buildEntityPayload` (donc dans le push Drive) ?

### Phase 2 — Liste les fonctions de suppression user-facing (~20 min)

Référentiel actuel (à compléter) :
| Fonction | Ligne | Méthode | Tombstone ? | Propage Drive ? |
|---|---|---|---|---|
| delEnt | 32711 | cascade tombstone | ✅ | ✅ |
| delLog | 32332 | ? | ? | ? |
| delImm | 32573 | ? | ? | ? |
| delBail | 13775 | ? | ? | ? |
| delMv | 12333 | ? | ? | ? |
| delAss | 17739 | ? | ? | ? |
| delMrh | 17795 | ? | ? | ? |
| delQuit | 20944 | ? | ? | ? |
| delEDL | 24519 | ? | ? | ? |
| delIRL | 19047 | ? | ? | ? |
| delBailHist | 12930 | ? | ? | ? |
| delCcForImm | 28338 | ? | ? | ? |
| delCat | 32884 | ? | ? | ? |
| delRule | 33387 | ? | ? | ? |
| delPieceEDL | 33629 | filter | ❌ probable | ? |
| delElemEDL | 33638 | splice | ❌ | ? |
| _undoOp wrappers | divers | varie | ? | ? |

### Phase 3 — Test scénario user (~30 min)

Pour chaque fonction suspecte :
1. Créer un objet (ex: un logement de test)
2. Le supprimer via la fonction concernée
3. Vérifier en console DB.{collection} : tombstone OU absence ?
4. Push Drive (FAB ☁️)
5. Reload page → pull Drive
6. Vérifier si l'objet revient

## Décision attendue

Selon les résultats du grep + tests :
- **Cas 1** : tout va bien sauf cleanupDupontLocal (déjà fixé) → clôture du sujet
- **Cas 2** : 1-2 fonctions suspectes → fixes ciblés (~1h)
- **Cas 3** : pattern systémique (plusieurs sites) → refacto centralisé via helper `_tombstoneDelete(collection, predicate)` (~3h)

## Notes user

> 💬 2026-05-25 : « je me suis connecté avec mon pc et impossible de me débarrasser des données de démo ... on a un problème de gestion de sauvegarde. ça veut dire que demain je n'arriverai pas non plus à supprimer d'autres infos »

Inquiétude légitime. L'audit ci-dessus vise à vérifier que ce n'est pas vrai
(suppressions générales OK) ou à corriger si c'est le cas.

## Journal

- 2026-05-25 : créé suite au fix BUG-DEMO-INJECTION v15.166. Bug confirmé sur
  `cleanupDupontLocal` (retiré). Audit des autres chemins à mener pour confirmer
  ou écarter le risque général sur les vraies données.
