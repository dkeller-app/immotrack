# BUG-DRIVE-RESURRECTION — Suppressions ressuscitées au pull Drive

**Status** : 🔄 En cours (depuis 2026-05-03) · **Prio** : **P0 critique** · **Taille** : M (~3-4h)
**Détecté** : 2026-05-03 (utilisateur en conditions réelles post-livraison UNDO-OP)
**Lié à** : BUG-EDL-DELETE-NOSYNC (v14.4 — fix tombstone EDL, jamais étendu) · UNDO-OP (v14.21-24, fonctionne nativement avec tombstones) · DRIVE-2H (refonte par-user/shared, à venir)

## Contexte / symptômes utilisateur

> 💬 2026-05-03 : « j'ai supprimé les entités test et les logements. J'ai même fait des modifications sur d'autres sujets pour forcer les enregistrements. Quand je quitte l'app et reviens les entités supprimées apparaissent à nouveau. (...) Sur le téléphone je vois un bail archivé que j'ai supprimé par erreur hier sur PC. ceci est très frustrant ... »

Bug de **résurrection silencieuse** : toute suppression d'entité, immeuble, logement, bail, mouvement, quittance, assurance, MRH, IRL ou bail historique réapparaît au prochain pull Drive (au reload local OU à l'ouverture sur un autre device).

## Cause racine

10 fonctions `delX` font un `filter()` ou `delete` direct → l'objet disparaît de la DB locale, `saveDB()` pousse la version locale, puis :

1. **Au prochain pull du même device** : `_mergeEntityPayload(payload, fileId)` parcourt le payload Drive (qui est l'ancien fichier `immotrack-entity-{entityId}.json` pas encore re-pushé OU re-pushé sans la donnée mais ré-injecté par UNION) et fait `DB.X.push(...)` car l'objet est absent en local → **ressuscité**.
2. **Sur un autre device** : pareil. La logique merge fait UNION sans tombstone : un objet absent en local est forcément ajouté.

`delEDL` est la **seule fonction épargnée** car elle utilise un tombstone `{id, _deleted:true, _deletedAt, _modifiedAt}` au lieu de `splice` (fix v14.4 BUG-EDL-DELETE-NOSYNC). Le merge respecte ce tombstone car `_deleted` est un champ visible et le filter de rendu (`_edlActive`) le filtre.

**Cas spécial entité** : chaque entité = 1 fichier Drive séparé `immotrack-entity-{entityId}.json`. Quand on `delEnt`, la DB locale filtre l'entité **mais le fichier Drive reste vivant indéfiniment** sur Drive. Au prochain pull, le fichier est re-trouvé, parsé, et `DB.entites.push({...ent, driveFileId})` ressuscite l'entité.

## Décisions arbitrées (Q&A 2026-05-03)

| # | Question | Réponse | Justification |
|---|----------|---------|---------------|
| Q1 | Cas spécial `delEnt` (1 fichier Drive par entité) — comment propager la suppression ? | **B — flag `entity._deleted: true` au top-level du payload Drive** (fichier reste vivant, garbage collect manuel après 30j) | Évite la résurrection silencieuse si un device offline avait des modifs pré-suppression. Pas de risque de perte irréversible. |
| Q2 | Pour `delBailHist` (append-only) et `delIRL` (dictionnaire `DB.irlTable`) : tombstone aussi ou hard-delete ? | **B — tombstone universel partout** | Cohérence avec les autres collections. Sans tombstone, mêmes symptômes de résurrection. Pour `irlTable` dictionnaire : remplacer la valeur par `{_deleted:true, _modifiedAt}`. |

## Architecture cible

### Pattern tombstone universel (toutes collections SAUF EDL déjà fait)

À chaque `delX`, **au lieu de** `DB.X = DB.X.filter(o => o.id !== id)` ou `delete DB.X[k]`, **faire** :

```js
const oldObj = DB.X[idx]; // ou find par clé
DB.X[idx] = {                       // remplace par tombstone
  id: oldObj.id,                    // ou clé applicable
  _deleted: true,
  _deletedAt: new Date().toISOString(),
  _modifiedAt: new Date().toISOString(), // pour _drvWins
  // Préserver les champs nécessaires aux filtres _buildEntityPayload :
  entity: oldObj.entity,            // pour DB.baux, DB.quittances
  logement: oldObj.logement,        // pour DB.edl, DB.assurances, DB.mrh
  qui: oldObj.qui,                  // pour DB.mouvements
  ref: oldObj.ref,                  // pour DB.baux_historique
  // ... selon collection
};
```

Pour `DB.irlTable` (dictionnaire) : `DB.irlTable[key] = { _deleted: true, _modifiedAt: ... }`.

Pour `DB.entites` : tombstone interne **ET** push d'un payload Drive avec `entity._deleted: true`.

Pour `ent.immeubles[]` (sub-array dans entité) : tombstone dans l'array, propagé via le payload de l'entité parent.

### Filtrage dans les renderers

Helper centralisé (sur le modèle `_edlActive`) :

```js
function _isAlive(obj) { return obj && !obj._deleted; }
```

À appliquer dans **tous les renderers** qui itèrent les collections concernées : `rBaux`, `rBiens`, `rMv`, `rQuit`, `rAss`, `rIRL`, `rEntFiche`, `rImmFiche`, `rLogFiche`, etc.

Aussi dans **toutes les fonctions de calcul / agrégation** : KPIs, sparklines, exports CSV.

### Propagation bidirectionnelle dans `_mergeEntityPayload`

Adapter chaque bloc merge pour respecter le tombstone :
- **Drive a un tombstone, local a l'objet** → écraser le local par le tombstone (suppression distante propagée)
- **Local a un tombstone, Drive a l'objet** → conserver le local (suppression locale prioritaire après _drvWins)
- **Les deux ont tombstones** → garder le plus récent (`_modifiedAt`)
- **Les deux ont l'objet vivant** → comportement actuel (Drive wins ou local wins selon `_drvWins`)

### Cas spécial `delEnt`

1. Tombstone interne dans `DB.entites[idx] = {id, entityId, _deleted:true, _deletedAt, _modifiedAt}`
2. `_undoOp` wrap (UNDO-OP existant, sans changement)
3. **NOUVEAU** : push immédiat du payload Drive avec `entity._deleted: true` au top-level via une fonction dédiée `_driveSaveDeletedEntity(ent)` :
   ```js
   {
     version: 3,
     entityId: ent.entityId,
     updatedAt: ISO,
     entity: { entityId, _deleted: true, _deletedAt, _modifiedAt },
     // pas besoin des autres collections, l'entité est morte
   }
   ```
4. Au pull, `_mergeEntityPayload` voit `payload.entity._deleted === true` → tombstone l'entité locale + ne pull AUCUN sous-objet (logements/baux/etc. de cette entité doivent être tombstone aussi côté local).
5. Après 30 jours (Phase ultérieure) : bouton « 🧹 Vider corbeille Drive » dans Paramètres qui supprime effectivement les fichiers Drive avec `entity._deleted: true` ET `_deletedAt > 30j`.

### Garbage collection des tombstones

V1 : pas de purge automatique. Les tombstones restent dans la DB indéfiniment. Coût : quelques octets par tombstone, négligeable.

V2 (sujet futur `DRIVE-GC-TOMBSTONES`) : purge auto après 90 jours des tombstones (intra-objet ET fichiers Drive entité avec `entity._deleted`).

## Scope par phase

### Phase 1 — Tombstone universel sur 10 delX + helper `_isAlive` (P0/S, ~1.5 h)
- [ ] Helper global `_isAlive(o)` près de `_edlActive` (l.16619)
- [ ] Wrapper / réécrire les 10 fonctions delX pour pattern tombstone (delLog, delImm, delEnt, delBail, delBailHist, delMv, delQuit, delAss, delMrh, delIRL)
- [ ] Pour chaque fonction : préserver les champs nécessaires aux filtres de `_buildEntityPayload` (entity, logement, qui, ref selon collection)
- [ ] Garder les wrappers `_undoOp` existants (la snapshot pré-modif contient l'objet vivant, undo restore l'objet par-dessus le tombstone — fonctionne nativement)
- [ ] Garder les `closeM(...)` + `closeXFiche()` + `_refreshAfterMutation()` v14.26/28
- [ ] **Tests console** : `delLog('TEST')` → `DB.logements.find(l => l.ref==='TEST')._deleted === true` ; refresh → bien disparu de l'UI
- [ ] **Commit** « v14.30 : BUG-DRIVE-RESURRECTION Phase 1 — tombstone universel 10 delX »

### Phase 2 — Filtrage renderers + propagation merge bidirectionnel (P0/M, ~1.5-2 h)
- [ ] Audit exhaustif des renderers + agrégations + exports qui itèrent les collections concernées (grep `DB.logements`, `DB.baux`, `DB.mouvements`, etc.)
- [ ] Ajouter `.filter(_isAlive)` ou guard `if(_isAlive(o))` dans chaque site
- [ ] Adapter `_mergeEntityPayload` (l.23416+) pour les 4 cas tombstone : Drive→local, local→Drive, both, none
- [ ] Adapter `_buildEntityPayload` (l.23416) pour s'assurer que les tombstones sont inclus dans le payload push (déjà OK si on préserve `entity`/`logement`/etc., à vérifier)
- [ ] **Tests visuels** : suppression sur device A → reload device A : suppression persiste ; suppression sur device A → pull device B : suppression propagée sur B
- [ ] **Commit** « v14.31 : BUG-DRIVE-RESURRECTION Phase 2 — filtrage renderers + propagation merge bidir »

### Phase 3 — Cas spécial `delEnt` avec flag fichier Drive (P0/S, ~1 h)
- [ ] Helper `_driveSaveDeletedEntity(ent)` qui push un payload minimal avec `entity._deleted: true` au top-level
- [ ] Modifier `delEnt` pour appeler ce helper EN PLUS du tombstone interne (fire-and-forget si Drive déconnecté)
- [ ] Modifier `_mergeEntityPayload` pour détecter `payload.entity._deleted === true` au top → tombstone l'entité locale (et aussi tombstone tous les sous-objets en cascade : logements/baux/mouvements/etc. dont `entity===ent.nom` ou ref dans cet entité)
- [ ] **Tests multi-device** : delEnt sur PC → pull téléphone → entité ET tous ses logements/baux disparaissent du téléphone
- [ ] **Commit** « v14.32 : BUG-DRIVE-RESURRECTION Phase 3 — propagation suppression entité multi-device »

### Phase 4 — Sync pilotage final + leçon mémoire (~30 min)
- [ ] Update `BACKLOG.md` : nouvelle entrée « BUG-DRIVE-RESURRECTION ✅ Livré v14.30-32 » dans « Livré récemment »
- [ ] Update `docs/subjects/BUG-DRIVE-RESURRECTION.md` : status ✅ Livré + journal
- [ ] Sauvegarder en mémoire la leçon : « quand je wrappe une fonction (UNDO-OP, instrumentation), lire **tout le contexte UX** : close modal, redirect, refresh, propagation Drive — pas juste la mutation DB » (cf régression v14.26 BUG-DEL-FICHE-360 sur mes wrappers Phase 3)
- [ ] **Commit** « Pilotage : BUG-DRIVE-RESURRECTION livré v14.30-32 »

## Tests manuels (critères de validation)

1. **Reload même device** : supprimer entité → quitter app → revenir → entité reste supprimée ✓
2. **Multi-device** : supprimer logement sur PC → ouvrir app sur téléphone → logement disparu sur téléphone ✓
3. **Suppression entité multi-device** : delEnt sur PC → pull téléphone → entité ET tous ses logements/baux/mouvements disparus ✓
4. **Undo Ctrl+Z** : supprimer logement → Ctrl+Z → logement réapparaît ✓ (le tombstone est écrasé par l'objet original via la snapshot pré-modif)
5. **Concurrent edit** : modifier un bail sur tablette → supprimer le même bail sur PC → pull tablette : suppression PC gagne (tombstone PC `_modifiedAt` plus récent que la modif tablette) ✓
6. **EDL** : régression sur le pattern existant `_edlActive` ✗ (vérifier que rien n'est cassé)
7. **Exports CSV** : tombstones exclus ✓
8. **Sparklines / KPIs dashboard** : tombstones exclus ✓
9. **delIRL dictionnaire** : tombstone respecté par `rIRL` et `refreshAllIRL` ✓
10. **delBailHist** : entrée historique tombstone, propagée multi-device ✓

## Limites V1 (out-of-scope, V2)
- ❌ Garbage collection auto des tombstones (sujet futur `DRIVE-GC-TOMBSTONES`)
- ❌ Suppression effective des fichiers Drive entité après 30j (bouton manuel envisageable mais hors scope ici)
- ❌ Audit log des suppressions (DRIVE-2I)
- ❌ Field-level conflict resolution (DRIVE-2J)

## Notes utilisateur
> 💬 2026-05-03 : Q1=B (flag `_deleted` top-level fichier Drive entity, pas de suppression effective), Q2=B (tombstone universel y compris bailHist + IRL)

## Journal
- 2026-05-03 : créé suite à bug remonté en conditions réelles · brainstorm Q1B + Q2B finalisé · ready for plan
