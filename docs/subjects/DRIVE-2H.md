# DRIVE-2H — Re-architecture fichiers Drive (par-user vs partagé)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (4-6h)
**Lié à** : DRIVE-2F (OCC), DRIVE-2G (awareness), `project_commercialization.md`
**Bloquant** : V1 commercial multi-users

## Contexte

Aujourd'hui, après Phase 2A-E :
- `immotrack-entity-{entityId}.json` : par entité, partageable via permissions Drive
- `immotrack-global.json` : **mélange** config par-user (mandataire, dashLayout) et données partagées (templates bail, catégories, piecesEDL)

Problème pour le multi-users :
- Si User A et User B partagent l'entité SCI Dupont, ils partagent **AUSSI** leur config perso (mandataire, layout dashboard) → casse l'UX et la confidentialité
- Les templates bail sont par-entité (custom par SCI) mais aujourd'hui dans le global → cohérence cassée

## Scope

### Phase 2H-1 : décision architecture
- [ ] Brainstorming arborescence cible (voir proposition ci-dessous)
- [ ] Validation par utilisateur

### Phase 2H-2 : implémentation
- [ ] Créer 3 types de fichiers Drive :
  - `immotrack-user-{userId}.json` (par-user, dans Drive perso) :
    - `params.mandataire`
    - `params.dashLayout`
    - `params.dashMigrationV2Prompted`
    - `agendaLastSync`
    - `nid` (compteur par-user)
    - importRules (par-user)
  - `immotrack-entity-{entityId}.json` (par-entité, partagé) — INCHANGÉ structure mais devient pure-données
  - `immotrack-entity-{entityId}-shared.json` (par-entité, partagé) :
    - `templates.bail` (template bail spécifique à l'entité)
    - `categories` (catégories de mouvements custom par-entité)
    - `piecesEDL` (pièces EDL custom par-entité)
    - `catConfig` (config catégories par-entité)
  - `immotrack-global-ref.json` (référentiel global, lecture seule pour la plupart) :
    - `irlTable` (officielles INSEE)
    - `edlTemplates` (référence)
- [ ] Refactor `_buildGlobalPayload` → split en `_buildUserPayload` + `_buildEntitySharedPayload` + `_buildGlobalRefPayload`
- [ ] Refactor `_mergeGlobalPayload` → split en 3 merges correspondants
- [ ] Refactor `_driveLoadGlobal` → load des 3 fichiers
- [ ] Refactor `_driveSaveGlobal` → save des 3 fichiers
- [ ] Migration des données existantes : à la 1re sync v13.19, lire l'ancien `immotrack-global.json` et splitter dans les 3 nouveaux

### Phase 2H-3 : tests
- [ ] Tester avec 2 comptes Google Drive (1 entité partagée)
- [ ] Vérifier qu'un user ne voit pas la config perso de l'autre
- [ ] Vérifier que les modifs templates de l'entité sont propagées aux 2 users

## Décisions à prendre

- [ ] **Templates bail : par-entité ou par-user ?**
  - Par-entité : tous les users qui partagent l'entité voient le même template (cohérent)
  - Par-user : chacun a son template custom même sur entité partagée (flexible mais incohérent)
  - **Reco** : par-entité (dans `entity-{entityId}-shared.json`)

- [ ] **Migration auto vs prompt utilisateur ?**
  - Auto : transparent mais risque de perte si bug
  - Prompt : "On va découper ton fichier global en 3, OK ?"
  - **Reco** : auto avec backup pré-sync (Phase 2C déjà en place)

- [ ] **Format `entity-{entityId}-shared.json` : 1 fichier séparé ou inclus dans `entity-{entityId}.json` ?**
  - Séparé : plus modulaire mais 2 fichiers par entité
  - Inclus : 1 seul fichier mais le payload entity grossit
  - **Reco** : inclus dans `entity-{entityId}.json` (ajoute champs `_shared.templates`, `_shared.categories`, etc.)

## Prompt de démarrage de session

```
On attaque DRIVE-2H.
Lis : BACKLOG.md, docs/subjects/DRIVE-2H.md, project_commercialization.md.

Workflow :
1. Confirme le scope avec moi (3 décisions à prendre dans le doc)
2. Propose un plan d'implémentation détaillé en sous-phases
3. Code en sous-phases, commit après chaque sous-phase
4. Tests multi-comptes Drive en fin

Estimation : 4-6h en session dédiée.
Important : Phase 2C (backup pré-sync) doit être déclenché AVANT toute migration.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite réflexion architecture multi-users dans session pilotage
