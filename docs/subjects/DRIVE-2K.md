# DRIVE-2K — Arborescence Drive par dossier entité (JSON + PDF bails + EDL ensemble)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (3-5h)
**Lié à** : DRIVE-2H (re-architecture fichiers JSON), BAIL-DRIVE-PDF-SIGNE (livré v13.09), EDL-PHOTOS-IDXDB (livré)
**À traiter idéalement** : avec DRIVE-2H ou juste après

## Contexte

Aujourd'hui les fichiers Drive sont éparpillés à plat :

```
[Drive root]/
├── ImmoTrack/                                  ← dossier principal
│   ├── immotrack-entity-{id}.json              ← JSON entité
│   └── (config global, etc.)
├── 1nodzkJIr6a07Cm7WVYu12Jgz5IyNlUum/          ← edlDriveFolderId hardcodé
│   ├── Baux/
│   │   └── F-001_BOULEY/Bail_signe.pdf
│   └── EDL/
│       └── F-001/Entrée_2026-04-08/photos.jpg
```

**Problème pour partage avec associé** : pour partager une entité avec un co-gérant / associé, il faut donner accès au JSON ET au dossier Baux ET au dossier EDL — 3 partages séparés. Risque d'oubli + UX mauvaise.

## Scope cible

```
[Drive root]/
└── ImmoTrack/
    ├── Entité 1 SCI/                                   ← 1 dossier par entité
    │   ├── immotrack-entity-{id}.json                  ← JSON dans le même dossier
    │   ├── (immotrack-entity-{id}-shared.json si DRIVE-2H)
    │   ├── Baux/
    │   │   ├── F-001_BOULEY/
    │   │   │   ├── Bail_signe_2026-04-27.pdf
    │   │   │   └── Acte_cautionnement_GARANT_2026-04-27.pdf
    │   │   └── F-002_DUPONT/
    │   ├── EDL/
    │   │   └── F-001/
    │   │       ├── Entrée_2026-04-08/photos.jpg
    │   │       └── Sortie_2029-01-25/photos.jpg
    │   ├── Quittances/
    │   │   └── 2026-04_F-001.pdf (futur)
    │   └── Lettres/
    │       └── Revision_IRL_F-001_2026-04.pdf (futur)
    ├── Entité 2 SCI/
    │   └── ...
    └── _global/
        ├── immotrack-user-{userId}.json (DRIVE-2H)
        └── immotrack-global-ref.json (DRIVE-2H)
```

**Avantage partage** : `share Entité 1 SCI/` → l'associé a accès à TOUT (JSON, bails, EDL, etc.) en un seul clic.

## Implémentation

### Phase 2K-1 : helper `_getEntityFolder(entityId)`
Crée/retrouve le dossier `ImmoTrack/{entityName}/`. Cache l'ID pour éviter les appels répétés.

### Phase 2K-2 : refactor `_driveSaveOneEntity`
Passe de :
```js
const rootId = await _getImmoRootFolder();
// upsert immotrack-entity-{id}.json dans rootId
```
À :
```js
const entityFolder = await _getEntityFolder(ent.entityId);
// upsert immotrack-entity-{id}.json dans entityFolder
```

### Phase 2K-3 : refactor `uploadBailPDFToDrive` (v13.09)
Passe de `[edlRootId]/Baux/{ref}_{loc}/` à `{entityFolder}/Baux/{ref}_{loc}/`.

### Phase 2K-4 : refactor EDL photos sync
Passe de `[edlRootId]/EDL/{logement}/{type}_{date}/` à `{entityFolder}/EDL/{logement}/{type}_{date}/`.

### Phase 2K-5 : migration des données existantes
Au 1er load après v13.X :
1. Détecter les anciens fichiers à plat (`immotrack-entity-*.json` directement dans `ImmoTrack/`)
2. Pour chaque entité, créer le dossier entité + déplacer le JSON
3. Identifier les anciens dossiers `[edlRootId]/Baux/F-XXX*` et `[edlRootId]/EDL/F-XXX*` → tenter de les déplacer vers les bons dossiers entité (mapping ref logement → entity)
4. Si ambigu : laisser à plat + toast user "Migration manuelle requise pour N fichiers"

### Phase 2K-6 : tests
- Sauver une entité → fichier dans le bon dossier
- Générer un PDF bail signé → uploadé dans `{entityFolder}/Baux/`
- Charger photos EDL → uploadées dans `{entityFolder}/EDL/`
- Partager `Entité 1 SCI/` avec un compte secondaire → vérifier que le secondaire voit le JSON + bails + EDL

## Décisions à prendre

- [ ] **Nom du dossier entité** : `{entityName}` (lisible) ou `entity-{entityId}` (stable mais opaque) ?
  - `{entityName}` : si user renomme l'entité, le dossier ne suit pas → désync. Fix : renommer le dossier au save si entity.nom a changé.
  - `entity-{entityId}` : stable mais l'utilisateur ne le reconnaît pas dans Drive UI.
  - **Reco** : `{entityName}` avec rename auto (UX prioritaire).

- [ ] **Migration auto vs prompt** :
  - Auto : transparent mais lourd au 1er load (bouger N fichiers Drive)
  - Prompt : "On va réorganiser Drive en dossiers par entité, OK ?"
  - **Reco** : prompt + bouton dans Paramètres "🔄 Réorganiser Drive" (control utilisateur)

- [ ] **Que faire des EDL/Baux orphelins** (logement supprimé, refs obsolètes) ?
  - Laisser à plat dans `_orphans/`
  - Supprimer (dangereux)
  - **Reco** : laisser dans `_orphans/`

- [ ] **DRIVE-2K seul ou combiné DRIVE-2H** ?
  - Seul : ~3-5h
  - Avec DRIVE-2H (refonte fichiers JSON par-user) : ~7-10h
  - **Reco** : combiné en 1 grosse session "refonte Drive complète" (cohérence, 1 seule migration utilisateur)

## Prompt de démarrage de session

```
On attaque DRIVE-2K (+ DRIVE-2H si combiné).
Lis : BACKLOG.md, docs/subjects/DRIVE-2K.md, docs/subjects/DRIVE-2H.md.

Workflow :
1. Confirme avec moi le scope (DRIVE-2K seul ou combiné DRIVE-2H ?)
2. Confirme les 4 décisions du doc
3. Propose un plan en sous-phases
4. Code en sous-phases, commit après chaque
5. Test multi-comptes Drive en fin

Estimation : 3-5h DRIVE-2K seul · 7-10h combiné DRIVE-2H.
Important : Phase 2C (backup pré-sync) doit être déclenché AVANT toute migration.
```

## Notes utilisateur

> 💬 2026-04-29 : "enregistrement des baux : enregistrer dans le même dossier que le fichier JSON ? Pour partage avec un associé (pour chaque entité : avoir un dossier avec le JSON, dossier bail, dossier EDL ...)"

## Journal

- 2026-04-29 : créé suite remarque utilisateur. Lié à DRIVE-2H (qui couvre splitting JSON par-user vs partagé). Recommandation : combiner les 2 sujets en une grosse session "refonte Drive complète".
