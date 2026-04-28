# DRIVE-2F — Optimistic Concurrency Control (OCC) au file level

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (4-5h)
**Lié à** : DRIVE-2H (architecture cible), DRIVE-2B (timestamps déjà livrés)
**Bloquant** : V1 commercial multi-users (race conditions sur write)

## Contexte

Phase 2B (livré v13.18) protège les modifs locales **au LOAD** : si Drive contient une version plus ancienne, local est préservé + toast warning.

**MAIS Phase 2B ne protège PAS au WRITE** :
```
10:00:00  User A modifie bail X (loyer 600 → 650)
10:00:30  User A save Drive  → Drive bail X = version A
10:01:00  User B (sans avoir reload) modifie bail X (loyer 600 → 700)
10:01:30  User B save Drive  → écrase A car PATCH brutal sans check
                            → Version A perdue silencieusement
```

`_driveSaveOneEntity` fait `PATCH file?uploadType=media` qui écrase le fichier sans lire son contenu actuel.

## Scope

### Phase 2F-1 : check version avant write
- [ ] Stocker `_driveFileVersions[fileId] = modifiedTime` à chaque load réussi
- [ ] Avant `_driveSaveOneEntity` : GET `?fields=modifiedTime` du fichier
- [ ] Comparer `currentModifiedTime !== _driveFileVersions[fileId]` → conflit détecté

### Phase 2F-2 : retry avec reload+merge
- [ ] En cas de conflit :
  1. Recharger le fichier entity (full GET)
  2. Merge avec local via `_mergeEntityPayload` (timestamp-aware Phase 2B)
  3. Retry write
- [ ] Limite : 3 retries max pour éviter loop infini
- [ ] Si 3 retries échouent : toast erreur + pas de save → user reload manuel

### Phase 2F-3 : alternative If-Match ETag (plus robuste)
- [ ] Investigation Drive API v3 : support `If-Match: ETag` sur PATCH ?
- [ ] Si OUI → migrer vers If-Match (plus atomique que comparaison modifiedTime)
- [ ] Drive renvoie 412 Precondition Failed si conflit → trigger retry

### Phase 2F-4 : fichier global aussi
- [ ] Même logique pour `_driveSaveGlobal` (et user/shared après DRIVE-2H)
- [ ] Stocker `_driveGlobalFileVersion` séparément

### Phase 2F-5 : tests
- [ ] Simuler conflit : 2 navigateurs avec même session Drive, modifier la même entité, save quasi-simultané
- [ ] Vérifier qu'aucune modif n'est perdue après retry

## Décisions à prendre

- [ ] **modifiedTime vs ETag** : choix dépend du support Drive API v3 (à investiguer)
- [ ] **Stratégie en cas d'échec après 3 retries** : abandon + erreur OU forcer write quand même ?
  - **Reco** : abandon + bouton "Forcer push (risque écrasement)" déjà dispo via Phase 2D
- [ ] **Retry intervalle** : immédiat ? backoff exponentiel ?
  - **Reco** : immédiat (latence < 1s par retry, ok)

## Prompt de démarrage de session

```
On attaque DRIVE-2F.
Lis : BACKLOG.md, docs/subjects/DRIVE-2F.md, docs/subjects/DRIVE-2H.md (si fait avant).

Prérequis : DRIVE-2H doit être livré d'abord (architecture stable).

Workflow :
1. Investiguer support Drive API v3 If-Match ETag
2. Décider modifiedTime vs ETag
3. Implémenter en 4 sous-phases (2F-1 à 2F-4)
4. Tests conflit simulé multi-browsers

Estimation : 4-5h.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite réflexion architecture multi-users dans session pilotage
