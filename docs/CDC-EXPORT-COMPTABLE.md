# CDC — Export « Dossier comptable (.zip) »

> Cadre de mise en œuvre. **Aucune décision de fond n'est rouverte** : les 5 points ci-dessous
> sont figés (Didier, 28/08). Ce CDC les met en musique et cadre les points techniques.
> Mockup de référence : [`dossier-comptable-mockup.html`](dossier-comptable-mockup.html).
> Audit des briques : [`00-AUDIT-BRIQUES.md`](00-AUDIT-BRIQUES.md).
>
> **Statut : VALIDÉ Didier 28/08 — FIGÉ.** Worktree `Immo-wt-export-compta` (branche
> `feat/export-compta`) créé, feu vert code donné. Intégration `main` = pilotage uniquement,
> après audit `superpowers:code-reviewer`.

---

## 1. Objet

Produire, en **un seul fichier .zip**, l'ensemble des **écritures comptables** (déjà générées par
l'app) **et** les **justificatifs** (factures PDF/image attachées aux mouvements), **reliés** entre eux,
pour transmission à l'expert-comptable. Zéro perte, navigation écriture → facture immédiate.

Bouton **📦 Dossier comptable (.zip)** dans l'onglet **Finances › Exports**, à côté de l'Export FEC.

---

## 2. Emplacement UI

Carte existante `#exp-card-fec` (`index.html:1412`). Réorganisation minimale (cf. mockup §1) :

- Le **Dossier comptable** devient le **bouton primaire** de la carte (il emballe FEC + journal +
  grand livre + factures). Un seul primaire corail par vue (règle charte).
- Les 3 exports unitaires actuels (`downloadFEC` / `downloadJournal` / `downloadGrandLivre`)
  restent **inchangés**, présentés en dessous en « exports séparés » (boutons secondaires).
- **Sélecteurs propres au Dossier** : deux champs `date` (début / fin) + un select **Bailleur**
  (= entité). Ils ne réutilisent PAS le `#compta-year` du FEC (défaut différent, cf. §3.5).

Aucune autre page touchée.

---

## 3. Les 5 décisions figées — mise en œuvre

### 3.1 Nom du ZIP
`Dossier-comptable_<Bailleur>_<AAAA-MM-JJ>.zip`
- `<Bailleur>` = nom d'entité sélectionné, slugifié (espaces → `-`, caractères hors `[A-Za-z0-9-]`
  retirés). Si **Tous** → `Tous-bailleurs`.
- `<AAAA-MM-JJ>` = **date d'extraction** = jour de génération (`new Date()`), **pas** la période.
- Cette même date d'extraction figure **en tête de `index.csv`** (ligne de commentaire, cf. §4.4).

### 3.2 Arborescence
```
Dossier-comptable_<Bailleur>_<date>.zip
├─ ecritures/
│   ├─ FEC.txt
│   ├─ journal.csv
│   ├─ grand-livre.csv
│   └─ index.csv
└─ factures/
    └─ <Bailleur> - <Lot>/
        └─ <AAAA-MM-JJ>_<categorie>_<montant>.<ext>
```
Factures **regroupées par `<Bailleur> - <Lot>`** (un sous-dossier par couple bailleur+lot).
Nom de fichier facture : `AAAA-MM-JJ` (date du mouvement) `_` catégorie slugifiée `_` montant
(entier ou `montant` sans séparateur de milliers, `.` → rien ou `-`), extension = **vrai type**
du fichier (`.pdf`, `.jpg`, `.png`…) déduit du `doc.mime` / `doc.name`, jamais forcé en `.pdf`.

### 3.3 Lien écriture ↔ facture
La colonne **`PieceRef`** du FEC (aujourd'hui `'M'+e.num`, `export-comptable.js:137`) est remplie
avec le **nom du fichier facture** (ex. `2026-06-02_assurance-pno_142.pdf`).
- Mouvement **sans** facture → `PieceRef` conserve `'M'+num` (le FEC exige un `PieceRef` non vide ;
  DGFiP l'accepte). `index.csv` marque alors `facture : ABSENTE` (§4.4).
- Les **deux** lignes d'une écriture (partie double, même `num`) portent le **même** `PieceRef`.

### 3.4 Factures manquantes (mouvement sans PJ)
- Listées dans `index.csv` : colonne `facture` = `ABSENTE`, colonnes `piece_ref` / `fichier` = `—`.
- **Récap avant download** (cf. mockup §2) : compteur « N mouvements, N factures, N manquantes » +
  liste dépliable des manquantes (date · catégorie · montant · Bailleur - Lot).

### 3.5 Périmètre
- **Défaut = année civile en cours** : `from = <année en cours>-01-01`, `to = …-12-31`
  (⚠️ différent du FEC seul qui reste sur N-1 — c'est voulu).
- **Deux sélecteurs début/fin** (`<input type="date">`) pour ajuster librement.
- **Filtre par entité** identique à l'Export FEC : réutilise `_comptaBuildOpts`-like
  (`entityNom` + `refs` = logements de l'entité). « Tous » = pas de filtre entité.

---

## 4. Contenu détaillé

### 4.1 `ecritures/FEC.txt` · `journal.csv` · `grand-livre.csv`
Générés **tels quels** par `_toFEC` / `_journalToCsv` / `_grandLivreToCsv` sur les écritures de
`_buildEcritures(DB.mouvements, STD_CATEGORIES, {from,to,entityNom,refs})`. Seul `_toFEC` évolue
(cf. §5.2). BOM UTF-8 conservé comme les exports actuels (`_comptaDownload`).

### 4.2 `factures/` — remplissage
Pour chaque mouvement **en scope et mappé** (même filtre `inScope` que `_buildEcritures`) qui porte
une PJ (`m.pjId` ou legacy `m.pj.dataB64`) : récupérer le binaire (§5.1), déterminer
`<Bailleur> - <Lot>`, nommer le fichier (§3.2), l'ajouter aux `entries` du zip.

### 4.3 Résolution `<Bailleur> - <Lot>`
- **Bailleur** = `logement.entity` du logement du mouvement (via `m.qui` = ref logement).
- **Lot** = `logement.ref` (ou libellé court si présent).
- **Mouvement global** (`m.qui === 'SCI:'+entityNom`, sans lot) → sous-dossier
  `<Bailleur> - _general`.

### 4.4 `ecritures/index.csv`
En-tête = 1 ligne de commentaire datée, puis colonnes :

| colonne | contenu |
|---|---|
| `ecriture_num` | `GL` + num padded (aligné sur `EcritureNum` du FEC) |
| `date` | date du mouvement |
| `bailleur` | entité |
| `lot` | ref logement (ou `_general`) |
| `categorie` | catégorie du mouvement |
| `libelle` | libellé du mouvement |
| `montant` | montant TTC (format FR `,`) |
| `piece_ref` | **= `PieceRef` du FEC** (nom de fichier, ou `—` si absente) |
| `fichier` | chemin relatif dans le zip (`factures/…`), ou `—` |
| `facture` | `présente` \| `ABSENTE` |

Ligne 1 : `# date d'extraction : AAAA-MM-JJ · bailleur : <…> · période : <from> → <to>`.
Échappement CSV identique aux helpers existants (`export-comptable.js:158`).

---

## 5. Points techniques cadrés (à coder au chantier, pas ici)

### 5.1 Récupération asynchrone des octets — 3 voies
Réutiliser la chaîne éprouvée (`_mvDocOpenById`, `index.html:16259`) :
1. `_idbGet(doc.idbKey)` — cache IndexedDB local ;
2. sinon `_downloadPhotoFromDrive(null, doc.idbKey, doc.cloudKey)` — Supabase Storage
   (cross-appareil), re-`_idbPut` au passage ;
3. sinon legacy `m.pj.dataB64`.

Le binaire arrive en **data URL** → conversion `Uint8Array` via `atob` (regex existante
`^data:([^;]+);base64,(.*)$`, `index.html:16450`). Un binaire introuvable (cache vide **et** cloud
absent) ne bloque pas : le mouvement bascule **ABSENTE** (compté comme manquant), l'export continue.

**UX asynchrone (décision) :**
- **Récap d'abord, sans fetch.** Le comptage (N mouvements / N avec PJ / N manquantes) se fait sur
  les **métadonnées** (`DB.documents` : présence d'`idbKey`/`cloudKey`), donc **instantané**.
- **Barre de progression ensuite**, seulement au « Télécharger » : fetch binaire fichier par
  fichier via `_backupSetProgress('Récupération des factures…', i, N)` (réutilisé de la Sauvegarde).
- Bouton **Annuler** pendant l'assemblage (drapeau d'annulation, comme `_backupRunning`).

### 5.2 Extension de `_toFEC` (DRY, pas de fork)
Ajouter un 3ᵉ argument optionnel `pieceRefByNum` (map `num → nom de fichier`) :
- absent (export FEC standalone) → comportement **inchangé** (`'M'+e.num`) ;
- présent (Dossier comptable) → `PieceRef = pieceRefByNum[e.num] || ('M'+e.num)`.

Le builder Dossier construit cette map en parallèle (num d'écriture ↔ mouvement ↔ nom de fichier).
Pour lier `num` ↔ mouvement, exposer depuis `_buildEcritures` une correspondance `num → mvt`
(petit ajout : renvoyer aussi un index, ou accepter un callback). **Le `num` reste séquentiel et
identique** entre `_buildEcritures` et le builder Dossier (même filtre, même ordre).

### 5.3 Garde-fou taille
`storedZip` = offsets 32-bit → `_BK_ZIP64_LIMIT ≈ 3,8 Go` (`index.html:57108`). Réutiliser le test
existant (`index.html:57188`) : accumuler `total += bytes.length` pendant le fetch ; si
`total + bytes.length > _BK_ZIP64_LIMIT` → **stop propre** + message orientant vers un périmètre
plus étroit (un seul bailleur / période réduite) ou la Sauvegarde mode dossier sur PC (cf. mockup §4).
En pratique le filtre par bailleur ramène presque toujours sous la limite.

### 5.4 Collisions de noms de fichiers
Deux factures même date + catégorie + montant dans le **même** `<Bailleur> - <Lot>` → suffixer
`_2`, `_3`… (dédoublonnage local au sous-dossier). Slugification stricte du nom
(`[\x00-\x1f\\/]` retirés, cf. `_attachmentDriveName`, `attachments.js:174`).

### 5.5 Download final
`storedZip(entries)` → `_downloadBlobAs(new Blob([u8],{type:'application/zip'}), '<nom §3.1>')`
(`index.html:8211`, déjà partout). `_auditLog('export','dossier_comptable',…)` comme les autres exports.

---

## 6. Réutilisation vs. nouveau

| Élément | Statut |
|---|---|
| `_buildEcritures` / `_buildGrandLivre` / `_journalToCsv` / `_grandLivreToCsv` | réutilisés tels quels |
| `_toFEC` | **+1 argument optionnel** (`pieceRefByNum`) — rétrocompatible |
| Résolution PJ + fetch binaire 3 voies | réutilisés (`_mvDocOpenById` / `_idbGet` / `_downloadPhotoFromDrive`) |
| `storedZip` / `crc32` / garde-fou `_BK_ZIP64_LIMIT` | réutilisés tels quels |
| `_backupSetProgress` / `_downloadBlobAs` | réutilisés tels quels |
| **Builder `dossier-comptable`** (arbre + nommage + index.csv + map num→fichier) | **nouveau** (module `js/core/`, testable Vitest) |
| Câblage UI (bouton + période + récap + progress + garde-fou) | **nouveau** (mocké ici) |

---

## 7. Flux UX complet
1. Onglet Finances › Exports → carte Export comptable.
2. Période pré-remplie (année civile en cours) + bailleur → clic **📦 Dossier comptable (.zip)**.
3. **Récap instantané** : compteurs + manquantes dépliables + taille estimée (§3.4).
4. **Télécharger** → **barre de progression** (fetch factures) ; Annuler possible.
5. Si dépassement taille → **arrêt propre** orienté (§5.3).
6. Sinon → `storedZip` → **téléchargement du .zip** + toast + `_auditLog`.

---

## 8. Contraintes gravées à respecter
- **Aucun CDN runtime** — pas de JSZip, `storedZip` maison suffit ([[project_no_runtime_cdn]]).
- **Aucune nouvelle colonne cloud** — on lit `DB.documents` / IndexedDB / Storage existants.
- **`index.html` reste CRLF** (tooling reflippe LF → casse parité data-defaults).
- **Ton neutre** (infinitif, termes génériques) dans toute la copie UI ([[feedback_ton_neutre_generique]]).
- **Audit `superpowers:code-reviewer`** obligatoire avant « prêt à tester » ([[feedback_audits_par_agents]]).

---

## 9. Tests attendus (Vitest, module builder)
- Nommage zip (bailleur slug, date extraction, `Tous-bailleurs`).
- Arbre `factures/<Bailleur> - <Lot>/` + `_general` pour mouvements globaux.
- Nommage facture (extension réelle, collisions `_2`).
- `index.csv` : en-tête daté, colonnes, `ABSENTE` pour mouvement sans PJ.
- `pieceRefByNum` : `_toFEC` sans map = `'M'+num` (non-régression) ; avec map = nom de fichier.
- Garde-fou : au-delà de la limite → stop, pas de zip corrompu.
- Alignement `num` `_buildEcritures` ↔ builder (même ordre/filtre).

---

## 10. Hors périmètre V1
- Lettrage FEC (`EcritureLet`) — reste vide comme aujourd'hui.
- Compression réelle (méthode 8) — `stored` suffit (PDF/JPEG déjà compressés).
- Export multi-bailleurs en plusieurs .zip d'un coup — V1 = un périmètre à la fois.
- ZIP64 (> 3,8 Go) — hors limite, orienté vers périmètre plus étroit.
