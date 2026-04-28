# DRIVE-2I — Audit log + history Drive

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S (2-3h)
**Lié à** : DRIVE-2H, DRIVE-2F, DRIVE-2G
**Priorité** : V1+ (post-commercialisation, support client)

## Contexte

Pour le support client en SaaS (et le debug d'incidents type session 2026-04-28 où des données ont été écrasées), il faut un **audit log** qui trace :
- Qui a modifié quoi quand
- Permettre la restitution "qui a écrit ce loyer 600 → 650 ?"
- Permettre un rollback granulaire d'une modification précise

## Scope

### Phase 2I-1 : append-only log
- [ ] Fichier Drive `immotrack-audit-{entityId}.json` (par entité partagée)
- [ ] Format : array d'entrées append-only :
  ```json
  {
    "ts": "2026-04-28T10:00:00.123Z",
    "userId": "didier@gmail.com",
    "userName": "Didier",
    "action": "update", // create | update | delete
    "objectType": "bail",
    "objectId": "F-001",
    "fields": ["hc", "ch"], // champs modifiés (option)
    "beforeHash": "sha256...", // hash de l'objet avant
    "afterHash": "sha256...",  // hash après
    "deviceType": "desktop"
  }
  ```
- [ ] Append à chaque save (chaque fonction de save UI hookée Phase 2B)
- [ ] Pas de PII détaillé (juste les champs modifiés, pas leur contenu) pour RGPD léger

### Phase 2I-2 : visualisation
- [ ] Page Référentiel → Entité → onglet "Historique"
- [ ] Liste chronologique des modifs avec filtres (par user, par objet, par date)
- [ ] Recherche : "qui a modifié bail F-001 le 28/04 ?"

### Phase 2I-3 : limite de taille
- [ ] Rotation : si fichier audit > 1 Mo, archive en `immotrack-audit-{entityId}-{YYYYMM}.json`
- [ ] Garder 12 mois d'historique en ligne, archiver le reste

## Décisions à prendre

- [ ] **Granularité** : par-objet ou par-champ ?
  - **Reco** : par-objet avec liste des champs modifiés (équilibre simplicité/info)
- [ ] **Hash before/after** : SHA256 ou juste un version number ?
  - **Reco** : SHA256 court (16 premiers caractères) pour identifier visuellement les versions
- [ ] **Audit du fichier global aussi ?** (ex: changement template bail entité-shared)
  - **Reco** : OUI dans le même fichier audit avec `objectType: "global.templates"`

## Prompt de démarrage de session

```
On attaque DRIVE-2I.
Lis : BACKLOG.md, docs/subjects/DRIVE-2I.md.

Prérequis : DRIVE-2H + 2G livrés (userId disponible).

Workflow :
1. Confirme granularité (objet vs champ)
2. Implémente l'append à chaque save (hook dans les 9 fonctions saveBail/saveMv/etc)
3. Page UI Historique
4. Tests rotation taille

Estimation : 2-3h.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite réflexion observabilité commerciale dans session pilotage
