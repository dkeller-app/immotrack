# Photos EDL — orientation respectée + agrandies — design

> **Statut : DESIGN validé** (mockup `mockups/edl-photos/`, option **A « Contenir »** retenue par le user 2026-06-30 ; PDF 3/ligne ~55 mm).
> Lié à `project_cloud_cutover_finition` (Polish EDL #7). App Propryo, vanilla JS mono-fichier `index.html` + `css/main.css`.

## Objectif
Afficher les photos d'état des lieux (EDL) **dans leur orientation réelle** (portrait ET paysage) et **plus grandes**, à l'écran comme dans le PDF généré — sans jamais rogner (les photos servent de **preuve légale**).

## Diagnostic (confirmé)
- **Les pixels sont corrects.** Le viewer plein écran (`_showEDLPhotoLightbox`, déjà en `object-fit:contain`) montre les portraits bien droits → **pas de problème d'orientation EXIF, pas de souci de capture/stockage**. Test user : « bien en portrait » au clic.
- **« Toujours en paysage » = forme de la boîte.** Les vignettes sont dans des boîtes paysage fixes (`48×38`, `38×30`, `48×48`) avec `object-fit:cover` → une photo portrait y est rognée en bandeau horizontal → elle *paraît* couchée.
- **PDF : même cause.** `pdf.addImage(src,'JPEG',x,y,35,26)` force chaque photo dans 35×26 mm sans respecter le ratio → portraits écrasés, et trop petites.

## Décision retenue — Option A « Contenir »
Boîte **carrée** + photo **entière** dedans (`contain`), agrandie, partout. Portrait et paysage ont la **même surface** (l'un remplit la hauteur, l'autre la largeur), avec de fines bandes neutres pour les hors-format. **Rien n'est coupé.** Alternatives écartées : B « ratio réel » (grille en escalier, pagination PDF délicate), C « recadrage » (rogne les bords = perte de preuve).

**Périmètre = pur affichage.** Aucune modification du pipeline de capture, du stockage, du viewer plein écran, ni de la structure des données. Les photos déjà prises (y compris anciennes Drive) bénéficient du fix sans retraitement.

## 1. À l'écran — 4 emplacements de rendu
Tous les `<img>` de vignette EDL passent d'un style inline `width:…;height:…;object-fit:cover` à une **classe CSS commune** `.edl-thumb` (DRY : une seule règle pour les 4 sites).

| Emplacement | Fonction / ligne | Style actuel à remplacer |
|---|---|---|
| Pièces (éléments) | `_edlPhotoCell()` — `index.html:27918` | `width:48px;height:38px;object-fit:cover;border-radius:3px;border:1px solid var(--bor)` |
| Clés / accès | `_th()` dans `_edlRedrawCles` — `index.html:28999` | `width:38px;height:30px;object-fit:cover;…` |
| Compteurs + DAAF | `_edlCptRenderThumbs()` — `index.html:29259` | `width:38px;height:30px;object-fit:cover;…` |
| Mobilier | `_ph()` dans `_edlMobRender()` — `index.html:27550` | `width:48px;height:48px;object-fit:cover;…` |

Dans chaque template string, remplacer l'attribut `style="…"` de l'`<img>` par `class="edl-thumb"` (en conservant `src`, `onclick`, `title`/`alt`).

**Nouvelle règle CSS** (à ajouter dans `css/main.css`, additive, utilise les tokens existants → compatible re-skin) :
```css
.edl-thumb{
  width:96px; height:96px;            /* ≈2× l'actuel ; carré = surface égale portrait/paysage */
  object-fit:contain;                 /* photo entière, jamais rognée */
  background:var(--bg);               /* fines bandes neutres pour les hors-format */
  border:1px solid var(--bor);
  border-radius:6px;
  cursor:pointer; display:block;
}
@media (max-width:640px){ .edl-thumb{ width:72px; height:72px; } }  /* responsive mobile */
```
- **Clic → lightbox existante inchangée** (`_showEDLPhotoLightbox`, déjà correcte).
- **Responsive** : 96 px PC/tablette, 72 px mobile. Les vignettes vivent dans des conteneurs `flex-wrap` (pièces = colonnes Entrée/Sortie d'un tableau, mobilier = flex) → elles passent à la ligne. À **vérifier en test** que les tableaux Pièces/Clés ne débordent pas en mobile (le tableau EDL est déjà la zone serrée ; scroll horizontal acceptable au pire).

## 2. Dans le PDF — `generateEDLPdfNative(edl)` (`index.html:28061`)
Unité = mm. Page A4 : `M=MR=MT=15, MB=18, CW=180`. Pagination via `newPageIfNeeded(y, needed)` (`index.html:28074`).

### Helper commun (DRY) — placement « contain » dans une cellule carrée
Avant chaque `addImage`, calculer le ratio réel via `pdf.getImageProperties(src)` → `{width, height}`, puis adapter à une cellule carrée `CELL` :
```
const props = pdf.getImageProperties(src);
const r = props.width / props.height;          // >1 paysage, <1 portrait
let dw = CELL, dh = CELL;
if (r >= 1) dh = CELL / r; else dw = CELL * r;  // contain
const dx = (CELL - dw) / 2, dy = (CELL - dh) / 2;  // centrage
pdf.addImage(src, 'JPEG', x + dx, y + dy, dw, dh);
```
(Le fond blanc de la page fait office de « bande neutre » — aucune boîte à dessiner ; option : fin liseré gris autour de la cellule pour la lisibilité, à trancher au plan.)

### Pièces & clés (`index.html:28252-28284` et `28309-28337`)
- `PHOTO_W=35, PHOTO_H=26, GAP=3`, 4/ligne → **`CELL=55, GAP=4`, 3/ligne** (`perRow = floor((CW+GAP)/(CELL+GAP)) = floor(184/59) = 3`).
- `x = M + col*(CELL+GAP)` ; hauteur de rangée = `CELL + LEGENDE(~3.5) + GAP`.
- `newPageIfNeeded(y, CELL + 6)` **avant chaque rangée** (les photos plus grandes peuvent pousser sur une 2ᵉ page — accepté par le user).
- Légende sous la photo (`pdf.text`, Helvetica 6 pt) : conservée, `maxWidth: CELL`.

### Mobilier (`index.html:28466-28504`)
- `thumbW=28, thumbH=22, gap=2, perRow=3` (Entrée à `x=M`, Sortie à `x=M+100`) → cellule **carrée ~30 mm**, même disposition Entrée/Sortie côte à côte, `perRow` recalculé pour tenir dans chaque demi-largeur (~85 mm) → **2/ligne par côté**. Même helper « contain ».

### Source des pixels (inchangée)
`_photoCache[idbKey]` (rempli par `_edlPreloadPhotos` : cache → IndexedDB → Storage cloud). Le PDF lit la même source que l'écran.

## 3. Ne change PAS
Pipeline de capture/compression (orientation déjà correcte ; MAX 1600 px, JPEG 0.8), stockage IndexedDB/Storage, viewer plein écran, structure des données EDL, tout le reste du PDF (en-têtes, compteurs, signatures, pagination).

## Cas limites / erreurs
- **⚠️ Disponibilité `getImageProperties`** : le plan DOIT confirmer que la fonction existe dans le jsPDF inliné du projet. Si absente → capturer `naturalWidth/naturalHeight` au préchargement (`_edlPreloadPhotos`, qui charge déjà chaque image) et mémoriser le ratio à côté du dataURL dans `_photoCache` (ou une map parallèle), puis l'utiliser pour le calcul contain.
- **Ratio indisponible / src vide** : repli sur l'ancien comportement (placer en `CELL×CELL` plein) plutôt que planter la génération PDF — ne jamais avorter le document pour une photo.
- **Photo absente du cache** (cloud non récupéré) : comportement existant de `_edlPreloadPhotos` inchangé (placeholder/saut).
- **Très nombreuses photos** : la pagination `newPageIfNeeded` ajoute autant de pages que nécessaire (comportement voulu).

## Vérification
- `check-inline-js` 5/0. Pas de demo-data auto-injectée.
- **Écran** : tester les 4 emplacements (pièces, clés, compteurs, mobilier) en **PC / tablette / mobile** avec photos portrait ET paysage → orientation correcte, ~2× plus grandes, rien rogné, clic = lightbox OK.
- **PDF** : générer un **vrai PDF EDL** contenant des portraits et des paysages → cellules ~55 mm 3/ligne, ratio respecté, débordement propre sur 2ᵉ page.
- **Audit `superpowers:code-reviewer`** obligatoire (touche le générateur PDF légal de l'EDL).
- Bump version (5 emplacements + `sw.js`).

## Hors scope
- Orientation EXIF / retraitement des photos existantes (inutile — pixels déjà corrects).
- Refonte de la grille en mosaïque (option B) ou recadrage intelligent (option C).
- Zoom/galerie avancée dans le viewer (déjà suffisant).
