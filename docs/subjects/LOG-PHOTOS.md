# LOG-PHOTOS — Photos illustratives sur la fiche logement

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M
**Détecté** : 2026-05-01
**Lié à** : DOC-PJ · LOG-ANNONCE · EDL-PHOTOS-IDXDB (livré, mêmes patterns IndexedDB) · **🔗 DRIVE-ARBORESCENCE Phase C** (à coupler — voir ci-dessous)

> **🔗 COUPLAGE OBLIGATOIRE — DRIVE-ARBORESCENCE Phase C** (sync Drive→app lazy scan)
>
> Quand on attaque LOG-PHOTOS, on traite **EN MÊME TEMPS** la Phase C reportée de DRIVE-ARBORESCENCE :
> - **Côté upload (déjà prêt v14.35)** : utiliser `_drvUploadDoc(logRef, 'photos', file)` qui gère la compression image > 2 Mo (canvas resize 1600px max + jpeg 0.8) + nommage + push Drive + métadonnées dans `DB.documents`
> - **Côté scan (à implémenter)** : helper `_drvScanLogementFolders(logRef)` qui liste les fichiers du sous-dossier `🖼️ Photos/` du logement Drive (`files.list` avec parent=folderId), compare avec `DB.documents` (filtre `category==='photos'`), ajoute en DB les photos Drive absentes et supprime/tombstone les références DB pour les photos absentes de Drive
> - **Trigger lazy scan** : à l'ouverture de la galerie photos sur `LOG-FICHE-360`
> - **Affichage** : miniatures inline + lightbox au clic (cohérent EDL-PHOTOS) + bouton « Ouvrir dans Drive » optionnel
>
> Sans ce couplage, le drag-drop côté app fonctionne mais les photos déposées manuellement par l'utilisateur dans Drive web ne sont jamais affichées dans l'app → bidirectionnel cassé. Cf [docs/subjects/DRIVE-ARBORESCENCE.md](DRIVE-ARBORESCENCE.md) journal 2026-05-03.

## Contexte
Aujourd'hui, les photos sont rattachées à l'EDL (entrée + sortie + compteurs, déjà livré v13.x avec IDB `immotrack_photos`). Mais la **fiche logement** n'a pas de galerie photos propre.

Besoin : pouvoir attacher au logement des **photos illustratives permanentes** :
- Photos de présentation (façade, séjour, cuisine, salle de bain, chambres)
- Plan du logement
- Photos pour les annonces de relocation (cf `LOG-ANNONCE`)
- DPE / diagnostics scannés
- Acte de propriété, règlement copro

Différence vs `DOC-PJ` (PJ génériques sur mouvements/travaux) : les **photos logement** sont durables, illustratives, réutilisables (annonces, comparatifs).

## Scope
- [ ] Modèle : table/champ `logement.photos` (array de `{id, url, label, ordre, dateAjout}`)
- [ ] Réutiliser l'infra IndexedDB existante (`immotrack_photos` / `_idbPut/_idbGet`) — ne pas dupliquer
- [ ] Sync Drive auto (cf EDL-PHOTOS-IDXDB pattern)
- [ ] UI fiche logement : section "Photos" avec :
  - [ ] Drag-drop upload multi-fichiers
  - [ ] Réordonnancement (drag handle)
  - [ ] Label éditable par photo (ex "Façade Nord", "Séjour", "Salle de bain")
  - [ ] Suppression
  - [ ] Aperçu lightbox
- [ ] Compression côté client (max 1920px largeur, 80% JPEG) — éviter saturer le Drive
- [ ] Limite : 20 photos par logement par défaut, configurable

## Décisions à prendre
- [ ] Limite taille fichier (5 MB ? 10 MB ? compression auto si > X) ?
- [ ] Stockage : IndexedDB local + Drive sync, OU Drive direct (URL stockée seule) ? → Suivre pattern EDL-PHOTOS-IDXDB pour cohérence
- [ ] Catégoriser les photos (illustration / plan / DPE / autre) ou liste plate avec labels libres ? → Liste plate avec labels suffit en V1, catégories en V2 si besoin
- [ ] Réutilisables dans EDL ? Bouton "Importer depuis fiche logement" lors de l'EDL ?

## Notes utilisateur
> 💬 2026-05-01 : "pouvoir ajouter des photos dans la fiche du bien"

## Journal
- 2026-05-01 : créé · à coupler avec LOG-ANNONCE (les photos servent aussi l'annonce auto)
