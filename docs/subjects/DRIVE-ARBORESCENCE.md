# DRIVE-ARBORESCENCE — Arborescence Drive hiérarchique avec sync bidirectionnel

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : L (1-3 jours, en couplage avec DRIVE-2H)
**Détecté** : 2026-05-01
**Lié à** : DRIVE-2H · DRIVE-2K · DOC-PJ · LOG-PHOTOS · EDL-PHOTOS-IDXDB · EDL-PDF-DRIVE

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

## Indivisions / SCI / propriétaire unique
- **Propriétaire unique** : 1 entité = 1 dossier
- **SCI** : 1 entité = 1 dossier (les associés sont des notations internes, pas des dossiers Drive séparés)
- **Indivision** : 1 entité unique = 1 dossier (au même titre qu'une SCI). Si l'app ne gère pas encore les indivisions, c'est une note pour `ASSO-PARTAGE` (refonte partage entre associés)

## Notes utilisateur
> 💬 2026-05-01 : "pour enregistrement drive je propose l'architecture suivante : entité / immeuble / logement / sous-dossiers (EDL, documents (DPE and co), bail ...). L'idée est de permettre à l'utilisateur d'enregistrer les documents via l'app ou directement sur le drive dans le bon dossier."
> 💬 2026-05-01 : "ok pour tous ces dossiers pour le moment. On ajustera en fonction de l'évolution de l'app"
> 💬 2026-05-01 : "[bidirectionnel] = un must"
> 💬 2026-05-01 : "Dans l'app on voit juste le titre du document et le lien vers le drive pour ouvrir non ?"
> 💬 2026-05-01 : "[migration] on repart de 0"

## Journal
- 2026-05-01 : créé · 9 sous-dossiers validés, sync bidirectionnel must V1, affichage différencié PDF (lien Drive) vs images (miniatures), pas de migration (zéro), DRIVE-2K englobé/remplacé
