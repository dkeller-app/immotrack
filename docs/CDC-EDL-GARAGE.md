# CDC — EDL garage / parking / box / stockage (droit commun) — VALIDÉ

_Figé le 2026-09-04. Validé par Didier (natures + rubriques + parcours). Lot 2 du chantier bail
garage. Source unique de vérité. Audit d'appui : cartographie du moteur EDL (session)._

## 0. Objet & périmètre

État des lieux **simplifié** (entrée / sortie) pour un emplacement loué en droit commun
(garage / parking / box / local de stockage), rattaché à un bail de type `garage`.

**Inclus** : modèle EDL réduit, parcours allégé, bascule automatique quand le bail est garage,
alignement des natures bail + EDL.
**Réutilisé tel quel (NON dupliqué)** : chaîne PDF native EDL, signature entrée/sortie, verrou
d'immutabilité de l'entrée signée, autosave, photos par élément, relecture.

## 1. Natures d'emplacement (bail ET EDL) — décision

**4 natures** : `place` (place de stationnement) · `box` · `garage` (garage individuel) ·
`stockage` (local de stockage). **« garage » est AJOUTÉ** au bail déployé (v15.586, qui n'avait que
place/box/stockage). Même jeu partout : `BAIL_GARAGE_NATURES = ['place','box','garage','stockage']`.
La nature identifie le bien (comme dans le bail) ; elle **ne change PAS** les rubriques de constat.

## 2. Rubriques du constat EDL — décision (liste Didier, exacte)

**Une seule liste, identique pour toutes les natures** :
`Porte · Serrure · Huisserie · Sol · Plafond · Toiture · Éclairage · Prise électrique`.
- **Ajout ET retrait** d'éléments libres (l'utilisateur retire p. ex. « Toiture » pour un box sous
  dalle, ou tout ce qui ne s'applique pas). Réutilise le « + Élément » et le retrait par ligne du
  moteur EDL existant.
- **Rien d'inventé** : pas de « n° d'emplacement », « délimitation », « marquage » en rubrique
  (le n° est un champ du bien/bail, pas une ligne de constat).
- États : les 5 existants `EDL_ETATS` (Neuf / Bon état / État d'usage / Mauvais état / Absent),
  couleurs et verdict inchangés.

## 3. Parcours (rail d'étapes) — allégé

Gardé : **Infos** (allégées) · **Moyens d'accès** (clés / bip / badge — remplace « Clés ») ·
**Constat** (les rubriques ci-dessus) · **Relecture** · **Observations + Signatures**.
Retiré pour un EDL garage : **Compteurs** (eau/élec/gaz) · **Détecteur de fumée (DAAF)** ·
**Mobilier** · **Chauffage / ECS / technologies**.
Infos allégées : retirées vs logement → surface habitable, nombre de pièces, type d'habitat,
ancien occupant.

**« Clé et bip »** : gérés dans l'étape **Moyens d'accès** (nombre remis), PAS en rubrique de constat.

## 4. Réutilisation du moteur (points d'accroche, audit)

- Le modèle EDL générique = `EDL_TPL` (`index.html:29929`), déversé par `openNewEDL`
  (`:30800`) / `openNewEDLForLog` (`:42648`). Un squelette « Cave / Garage » existe déjà dans
  `EDL_EXTRA` (`:30021`).
- L'EDL sait lire le bail via `DB.baux[ref]` ; `_edlPrefill` (`:30970`) lit déjà `bail.type`
  (`:31030`, pré-coche mobilier meublé) → point d'accroche symétrique pour le garage.
- Rail d'étapes = module testable `js/core/edl-steps.js` (`window.EdlSteps.buildSteps`).
- PDF natif EDL = `generateEDLPdfNative` (`:32150`), agnostique du contenu de `_edlP`.
- Verrou immutabilité = `_edlIsSigned` (`:33942`) + `edlSnapshot` (`saveEDL:34349`) — inchangés.

## 5. Implémentation (2 volets, worktree `feat/edl-garage`)

### Volet A — alignement bail (nature « garage »)
1. `__tests__/helpers/bail-garage.js` : `BAIL_GARAGE_NATURES += 'garage'` ; `getGarageTitle` →
   « CONTRAT DE LOCATION D'UN GARAGE » ; `getGarageDestinationUsage('garage')` (stationnement d'un
   véhicule et/ou remisage). Tests. Régénérer mirror.
2. `index.html` wizard : ajouter l'option `garage` au sélecteur `b-emplNature` ; mapping `objet` /
   `natureLabel` de la branche garage de `buildBailStructure` (via `resolveGarageNature`).

### Volet B — EDL garage
3. **Nouveau module testable** `js/core/edl-garage-model.js` (`window.EdlGarageModel`) :
   - `EDL_GARAGE_ELEMENTS = ['Porte','Serrure','Huisserie','Sol','Plafond','Toiture','Éclairage','Prise électrique']`.
   - `buildGarageEdlPieces()` → `[{ nom:<label nature>, elements:[{nom, etatE, obsE, photosE:[], etatS, obsS, photosS:[]}] }]` (1 bloc, éléments = la liste).
   - Tests Vitest (liste exacte, structure élément entrée+sortie).
4. `js/core/edl-steps.js` : `buildSteps({garage:true})` retire `compteurs`, `daaf`, `mobilier`
   (+ chauffage). Tests. Relabel « Clés » → « Moyens d'accès » quand garage. Régénérer mirror.
5. `index.html` bascule : dans `openNewEDLForLog` (`:42648`) — si `DB.baux[ref] && DB.baux[ref].type==='garage'`,
   déverser `window.EdlGarageModel.buildGarageEdlPieces()` dans `_edlP` au lieu de `EDL_TPL`, et
   passer le flag `garage` à `EdlSteps.buildSteps` + masquer les sections DOM logement
   (`#edl-step-compteurs`, `#edl-daaf-section`) via `_edlApplyStepVisibility`.
6. `generateEDLPdfNative` (`:32150`) : court-circuiter les sections vides (compteurs / DAAF /
   mobilier absents) pour ne pas imprimer d'en-têtes vides.
7. Ne PAS collecter chauffage/ECS/techno pour un EDL garage (`saveEDL:34263-34268`).

## 6. Contraintes (non négociables)
- Aucun CDN, aucune nouvelle colonne cloud. Champs EDL garage dans le blob existant.
- CRLF `index.html`. TDD sur les modules. Audit `superpowers:code-reviewer` avant « prêt à tester ».
- Bump version + BACKLOG. Smoke user 3 formats (entrée + sortie + PDF).
- Rétrocompat : un EDL logement existant est inchangé (bascule garage ne s'active que si
  `bail.type==='garage'`).
