# DRIVE-ARBORESCENCE — Arborescence Drive hiérarchique avec sync bidirectionnel

**Status** : ✅ Livré v14.20 + v14.35-36 (Phases A + B + D — Phase C lazy scan reportée à un sujet séparé) · **Prio** : P1 · **Taille** : L (1-3 jours, indépendant de DRIVE-2H/2F/2G)
**Détecté** : 2026-05-01
**Lié à** : DRIVE-2H · DRIVE-2K (englobé/remplacé) · DOC-PJ · LOG-PHOTOS · EDL-PHOTOS-IDXDB · EDL-PDF-DRIVE · BUG-DRIVE-RESURRECTION (v14.30-32 — pattern tombstone réutilisé pour DB.documents)

## Résumé livraison
- **v14.20** (commits `528eafe` + `03cd686`) Phase A : helpers `_drvImmoTrackRoot` / `_drvEnsureEntityFolder` / `_drvEnsureImmeubleFolder` / `_drvEnsureLogementTree` (parallélisation 9 sous-dossiers `Promise.all`) / `_drvRenameFolder` / `_drvTrashFolder` ; hooks fire-and-forget dans saveEnt/saveImm/saveParamLog/delEnt/delImm/delLog (création/renommage/trash avec confirms)
- **v14.35** (commit `7997ce2`) Phase B : helper `_drvUploadDoc(logRef, category, file)` avec compression image > 2 Mo + refus > 10 Mo ; nommage `{cat}_{ISO}_{file}.{ext}` ; collection plate `DB.documents = []` (option B) avec propagation Drive bidirectionnelle (`_buildEntityPayload` + merge + cascade entité)
- **v14.36** (commit `0d7928a`) Phase D : section UI Paramètres « Stockage Drive » avec compteur dynamique (X / Y biens avec arborescence créée), bouton « 🔄 Réorganiser mon Drive » (chunks de 3 paralléles, idempotent), bouton « 📂 Ouvrir mon dossier ImmoTrack dans Drive »
- **Phase C reportée** : sync Drive→app lazy scan à l'ouverture de LOG-FICHE-360 — sujet séparé (utilisateur a explicitement sauté Phase C dans le brief). À traiter quand DOC-PJ ou LOG-PHOTOS exposeront l'UI consommatrice de `_drvUploadDoc`.

## Contexte
Demande utilisateur 2026-05-01 :
> 💬 « pour enregistrement drive je propose l'architecture suivante : entité / immeuble / logement / sous-dossiers (EDL, documents (DPE and co), bail ...) l'idée est de permettre à l'utilisateur d'enregistrer les documents via l'app ou directement sur le drive dans le bon dossier. il faut donc créer tous les dossiers (même vide) de l'architecture. »

Aujourd'hui les fichiers Drive d'ImmoTrack sont éparpillés (PDF baux, EDL, photos, quittances) sans structure cohérente lisible par l'utilisateur. Cette refonte structure Drive comme un classeur métier où l'utilisateur peut soit utiliser l'app, soit gérer ses fichiers directement sur Drive.

## Architecture cible

```
ImmoTrack/
└── {Entité — ex "SCI Dupont"} /
    └── {Immeuble — ex "12 rue de la Gare"} /
        └── {Logement — ex "F-001 (T2 RDC)"} /
            ├── 📋 EDL/                  ← entrée, sortie, photos compteurs
            ├── 📜 Bail/                 ← bail signé, snapshots, cautionnement
            ├── 📄 Documents/            ← DPE, diagnostics, règlement copro, acte propriété
            ├── 🖼️ Photos/               ← photos illustratives bien (cf LOG-PHOTOS)
            ├── 🧾 Quittances/           ← quittances mensuelles générées
            ├── 📈 IRL/                  ← lettres révision + accusés réception
            ├── 🛡️ MRH/                  ← contrats assurance, attestations
            ├── 🔧 Travaux/              ← devis, factures, CR intervention
            └── ⚡ Charges/               ← régularisations annuelles, justificatifs
```

**Règles** :
- 9 sous-dossiers créés systématiquement à la création d'un logement, **même vides**
- Cohérent avec la sidebar app (chaque sous-dossier = 1 onglet de la fiche logement, cf `LOG-FICHE-360` Phase 2)
- Indivision = 1 entité unique (1 dossier `Entité/`), pas de doublon par associé

## Scope

### Phase A — Création arborescence (P1/M)
- [ ] À la création d'une **entité** : créer `ImmoTrack/{Entité}/`
- [ ] À la création d'un **immeuble** : créer `{Entité}/{Immeuble}/` (jamais de logement direct sous entité)
- [ ] À la création d'un **logement** : créer `{Immeuble}/{Logement}/` + les **9 sous-dossiers vides**
- [ ] Batch + parallélisation API Drive (9 sous-dossiers = 9 calls minimum, à paralléliser via `Promise.all`)
- [ ] Stocker les `folderId` Drive en DB sur chaque entité/immeuble/logement
- [ ] **Renommage** : si l'utilisateur renomme une entité/immeuble/logement, renommer le dossier Drive correspondant (Drive `files.update` avec `name`)
- [ ] **Suppression hard** : si l'utilisateur supprime un logement, supprimer le dossier Drive (avec confirmation forte)
- [ ] **Archivage** (LOG-ARCHIVE livré) : déplacer dans un sous-dossier `ImmoTrack/_Archives/{date}/` ou laisser en place avec préfixe `[Archivé]` ?

### Phase B — Sync bidirectionnel (MUST V1)
**Sens 1 — App → Drive** (déjà partiellement en place pour EDL/Bail) :
- [ ] Drag-drop d'un fichier dans une fiche bien → upload Drive dans le bon sous-dossier (`EDL/`, `Bail/`, `Documents/`...)
- [ ] Convention de nommage standardisée : `{Type}_{Date}_{Titre}.{ext}` (ex `DPE_2023-06-15_DPE_initial.pdf`)
- [ ] Métadonnées en DB : `{driveFileId, driveFolderId, name, size, mimeType, uploadedAt, category}`

**Sens 2 — Drive → App** (NOUVEAU — must V1) :
- [ ] **Scan** des sous-dossiers au login (1×/session) ou à l'ouverture d'une fiche bien (lazy)
- [ ] Pour chaque fichier trouvé en Drive mais absent de la DB → l'ajouter en DB + l'afficher dans la fiche bien
- [ ] **Catégorisation auto** :
  - Le sous-dossier détermine la catégorie (`Documents/` = "doc général", `EDL/` = "edl", `Bail/` = "bail")
  - L'utilisateur peut requalifier à la main via un dropdown
- [ ] **Suppression Drive** : si un fichier disparaît de Drive (utilisateur l'a supprimé manuellement) → supprimer la référence en DB (ou tombstone si on veut garder l'historique de référence)

### Phase C — Affichage dans l'app (Phase 2 LOG-FICHE-360)
**Différencié par type MIME** :

| Type fichier | Vue dans l'app |
|---|---|
| **PDF** (bail, EDL, DPE) | Card avec icône PDF + titre + taille + date upload + bouton "Ouvrir dans Drive" (ouvre nouvel onglet) |
| **Image** (JPG, PNG) | Miniature ~80×80 px → lightbox au clic (cohérent `LOG-PHOTOS`) + bouton "Ouvrir dans Drive" en option |
| **Word / Excel** | Card avec icône + titre → ouvre Drive |
| **Autre** | Card icône générique + titre → ouvre Drive |

**Pas de preview PDF inline** : Drive PDF viewer est plus performant que ce qu'on pourrait faire en iframe. Décision arbitrée 2026-05-01.

### Phase D — Migration & cleanup (V1 only)
- [ ] **Pas de migration auto** : on repart de zéro (décision utilisateur 2026-05-01)
- [ ] Bouton "🔄 Réorganiser mon Drive" dans Paramètres : recréer toute l'arborescence + déplacer les fichiers existants identifiés (à charge utilisateur de classer le résiduel)
- [ ] Documenter dans la FAQ comment l'utilisateur peut faire le classement initial manuellement

## Décisions à prendre / arbitrer en cours

| Question | Default |
|---|---|
| **Scan Drive : eager (login) vs lazy (ouverture fiche)** | Lazy → moins d'API calls, mais découverte différée. Acceptable pour V1 |
| **Versioning** : si DPE refait, écraser ou garder N+1 ? | Garder les 2 (Drive natif gère les versions, mais l'app affiche la plus récente avec lien "Voir versions précédentes") |
| **Archivage logement** : déplacer dossier Drive ou laisser en place ? | Laisser en place (pas de mouvement Drive, juste flag `archived` en DB) |
| **Renommage entité = renommage dossier Drive** | Oui, mais avec confirmation utilisateur (impact si fichiers ouverts ailleurs) |
| **Convention nommage fichiers app→Drive** | `{Type}_{Date}_{Titre}.{ext}` standardisé |
| **Quota / limite taille fichier** | Pas de limite imposée par ImmoTrack (Drive a sa propre limite). Compresser images > 5 Mo |

## Lien avec sujets existants

| Sujet | Impact |
|---|---|
| **DRIVE-2H** (P1/M) — re-architecture fichiers Drive (par-user/shared/référentiel) | **Complémentaire** : DRIVE-2H = couche technique (scope user vs shared), DRIVE-ARBORESCENCE = couche métier (entité/immeuble/logement). À séquencer : DRIVE-2H d'abord (architecture des fichiers JSON DB), puis DRIVE-ARBORESCENCE (architecture des dossiers documents) |
| **DRIVE-2K** (P2/M) — arborescence par entité dans Drive | **Englobé / remplacé** : DRIVE-ARBORESCENCE est l'extension naturelle (descend jusqu'au logement + sous-dossiers métier). Marquer DRIVE-2K comme dépassé, fusionner |
| **DOC-PJ** (P2/M) — pièces jointes génériques | **Implémentation pratique** : DOC-PJ = l'UI drag-drop, DRIVE-ARBORESCENCE = le stockage. Les 2 sont complémentaires, à attaquer ensemble |
| **LOG-PHOTOS** (P2/M) — galerie photos logement | **Foyer trouvé** : photos stockées dans `Photos/` du logement, miniatures app + lightbox au clic |
| **EDL-PHOTOS-IDXDB** (✅ Livré) | **À aligner** : actuellement photos EDL en IndexedDB + Drive ailleurs. À migrer vers `EDL/photos/` du logement (Phase D) |
| **EDL-PDF-DRIVE** (✅ Livré v14.10.3) | **À aligner** : actuellement PDF EDL upload Drive root. À déplacer dans `EDL/` du logement (Phase D) |
| **LOG-FICHE-360** Phase 2 (sous-onglets) | **Cohérence directe** : les 5 sous-onglets futurs (Documents/EDL/Compta/Compteurs/Entretien) lisent dans les sous-dossiers Drive correspondants |

## Indivisions / SCI / propriétaire unique — **Option A validée 2026-05-01**
- **Propriétaire unique** : 1 entité = 1 dossier
- **SCI** : 1 entité = 1 dossier (les associés sont des notations internes, pas des dossiers Drive séparés)
- **Indivision** : 1 entité unique = 1 dossier (au même titre qu'une SCI) — **Option A confirmée par utilisateur**. Pas de doublon par associé. Les associés sont des notations internes à l'entité d'indivision.

→ Si l'app ne gère pas encore le concept d'indivision en tant que type d'entité (à vérifier), c'est une note pour `ASSO-PARTAGE` (refonte partage entre associés) qui devra exposer ce type lors de sa session dédiée.

## Notes utilisateur
> 💬 2026-05-01 : "pour enregistrement drive je propose l'architecture suivante : entité / immeuble / logement / sous-dossiers (EDL, documents (DPE and co), bail ...). L'idée est de permettre à l'utilisateur d'enregistrer les documents via l'app ou directement sur le drive dans le bon dossier."
> 💬 2026-05-01 : "ok pour tous ces dossiers pour le moment. On ajustera en fonction de l'évolution de l'app"
> 💬 2026-05-01 : "[bidirectionnel] = un must"
> 💬 2026-05-01 : "Dans l'app on voit juste le titre du document et le lien vers le drive pour ouvrir non ?"
> 💬 2026-05-01 : "[migration] on repart de 0"
> 💬 2026-05-01 : "indivision option A" → 1 entité d'indivision = 1 dossier Drive unique (pas de doublon par associé)

## Journal
- 2026-05-01 : créé · 9 sous-dossiers validés, sync bidirectionnel must V1, affichage différencié PDF (lien Drive) vs images (miniatures), pas de migration (zéro), DRIVE-2K englobé/remplacé
- 2026-05-01 : décision indivision **Option A confirmée** — 1 entité d'indivision = 1 dossier Drive unique (au même titre qu'une SCI), pas de doublon par associé
- 2026-05-02 : ✅ Phase A livrée v14.20 — création arborescence + helpers + hooks save/del Ent/Imm/Log
- 2026-05-02 : interruption pour UNDO-OP urgent (v14.21-24) puis BUG-DRIVE-RESURRECTION P0 (v14.30-32)
- 2026-05-03 : ✅ Phase B livrée v14.35 — helper `_drvUploadDoc` + `DB.documents` + propagation Drive bidirectionnelle + cascade tombstone entité
- 2026-05-03 : ✅ Phase D livrée v14.36 — UI Paramètres « Stockage Drive » avec bouton Réorganiser + lien ouvrir folder
- 2026-05-03 : Phase C reportée à un sujet futur (sync Drive→app lazy scan) — sera utile quand DOC-PJ ou LOG-PHOTOS exposeront l'UI drag-drop consommatrice de `_drvUploadDoc`. Pas bloquant pour V1 car les helpers d'upload + arborescence sont en place.
