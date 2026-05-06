# LOG-FICHE-EDL — Sous-onglet 📋 États des lieux + EDL-TEMPLATE-PER-LOG

**Status** : ✅ **Livré v14.57** · **Prio** : P1 · **Taille** : M (~3h)
**Détecté** : 2026-05-06
**Lié à** : LOG-FICHE-360 Phase 2 · FICHES-PARITE-360 Session 3 · EDL-TEMPLATE-PER-LOG (sujet jumeau)

## Demande utilisateur

> 💬 « enchaine » (continuation Session 3 EDL après Compteurs)

## Vision

Sous-onglet 📋 États des lieux sur la fiche logement, avec :
- **Liste des EDL** filtrés sur le logement (entrée + sortie), tri DESC par date
- **Bouton + EDL Entrée** / **+ EDL Sortie** pré-rempli sur le logement
- **Template par logement** (EDL-TEMPLATE-PER-LOG) : sauvegarder la structure des pièces+éléments comme template réutilisable au prochain bail
- Cards riches avec statut signature, badges Drive PDF, actions (Modifier / PDF / Drive / Sauv. template / Supprimer)

## Architecture

### Sous-onglet EDL fiche logement

#### Helper `_edlStats(edl)` — réutilisable
Calcule les compteurs visibles sur les cards :
- `nbPieces` : nombre de pièces
- `nbElem` : somme des éléments dans toutes les pièces
- `nbCles` : nombre de clés
- `nbPhotos` : somme photos entrée + sortie

#### Helper `_edlSignatureStatus(edl)`
Retourne `{ kind, label, cls }` :
- `complet` : ✓ Signé (bailleur + locataire + signedAt)
- `partial` : ⚠ Bailleur signé (locataire en attente)
- `none` : ○ Non signé

#### Render `_renderLogFichePanelEDL(log, ref)`
1. Header : titre + 3 boutons CTA (+ EDL Entrée / + EDL Sortie / ↗ Onglet EDL)
2. Bandeau template (actif ou inactif)
3. Empty state si aucun EDL avec CTA + EDL Entrée
4. Sinon, liste de cards EDL en flex column

#### Card EDL
- Bordure gauche colorée (vert pour Entrée, orange pour Sortie)
- Header : type (badge coloré), date, locataire, statut signature
- Meta : nb pièces, éléments, clés, photos
- Actions : ✏️ Modifier · 📥 PDF · ☁️/📂 Drive · 🗐 Sauv. template · 🗑

### Bouton + Nouvel EDL pré-rempli

#### Helper `openNewEDLForLog(ref, type)`
1. `openNewEDL()` — réinitialise la modale
2. `setTimeout 80ms` (laisse le DOM init)
3. Set `#edl-log` (select logement) + dispatch event change → `onEDLLogChange()` pré-remplit auto le locataire / adresse depuis le bail courant
4. Set radios `#edl-type-entree` / `#edl-type-sortie` selon `type` + appel `edlTypeChange()`
5. Si template existe : `setTimeout 120ms` puis confirm2() de chargement → `loadLogEDLTemplate(ref)`

### EDL-TEMPLATE-PER-LOG

Stockage : `log.edlTemplate = { pieces, cles, _modifiedAt, _sourceEDLId }`

Structure :
- `pieces[]` : array de `{ nom, elements: [{ nom, etatE:'', obsE:'', photosE:[], etatS:'', obsS:'', photosS:[] }] }`
- `cles[]` : array de `{ nom, qty, photos:[], photosS:[] }`
- Les valeurs (état, obs, photos) sont **vides** dans le template — on garde juste la STRUCTURE.

#### Helper `saveLogEDLTemplateFromEDL(edlId)`
Bouton « 🗐 Sauv. template » sur chaque card EDL :
1. Confirme si template existe déjà (avec stats anciens vs nouveaux)
2. Clone les `pieces` en effaçant les valeurs (état, obs, photos)
3. Clone les `cles` (juste noms + qty)
4. Stocke dans `log.edlTemplate`
5. `_stamp(log)` + `saveDB()` + `rLogFiche()` + toast

#### Helper `loadLogEDLTemplate(ref)`
Charge le template dans la modale EDL ouverte :
- Reset `_edlP` et `_edlCles` **in-place** (pour préserver les références JS internes)
- Push les pieces/cles du template (deep clone)
- `_edlRenderAll()` pour re-render

#### Helper `viewLogEDLTemplate(ref)`
Affiche le contenu du template via `alert()` (V1 simple) :
```
Template EDL pour F-101
MAJ : 06/05/2026

📦 Cuisine :
  · Évier
  · Plaque cuisson
  · Hotte
📦 Salon :
  · Sol
  · Mur
  · Plafond
🔑 Clés :
  · Clé entrée x2
```

#### Helper `clearLogEDLTemplate(ref)`
Supprime le template avec confirmation (les EDL existants ne sont pas affectés).

### Bandeau template dans le panel EDL

**Si template actif** :
```
🗐 Template EDL personnalisé pour ce logement
   3 pièces · 12 éléments · MAJ 06/05/2026
                                                 [👁 Voir] [✕ Supprimer template]
```

**Si pas de template** (état pédagogique) :
```
🗐 Aucun template EDL pour ce logement
   À la création d'un EDL, sauvegardez la structure
   des pièces/éléments comme template pour ne pas
   tout re-saisir au prochain locataire.
```

## Architecture finale fiche logement (9 sous-onglets actifs)

```
📋 Général · 📜 Bail · 💰 Comptabilité · 🛡 Conformité · 📅 Agenda · 📁 Documents · ⚡ Compteurs · 📋 États des lieux
```

**FICHES-PARITE-360 fiche logement = COMPLET** (Sessions 1+3+4+5+6 livrées).

## CSS responsive

- **Desktop ≥ 1280** : cards EDL en column flex, actions en row wrap, bandeau template en row
- **Tablette/mobile ≤ 768** : actions card en column (boutons full-width), bandeau template en column
- **Mobile ≤ 600** : header card flex-wrap, locataire prend 100% de la ligne

## Critères d'acceptance

- [x] Sous-onglet « 📋 États des lieux » activé (sortie du « À venir »)
- [x] Liste des EDL filtrés sur le logement, tri DESC par date
- [x] Cards : bordure colorée par type, header (type/date/loc/sig), meta (pièces/élem/clés/photos), actions
- [x] Statut signature : Signé (vert) / Bailleur signé (orange) / Non signé (gris)
- [x] Boutons CTA : + EDL Entrée, + EDL Sortie (opacity réduite si pas d'entrée), ↗ Onglet EDL
- [x] `openNewEDLForLog(ref, type)` ouvre modale, pré-remplit logement (déclenche onEDLLogChange) + radio type + edlTypeChange
- [x] Bandeau template avec 2 états (actif / inactif)
- [x] `saveLogEDLTemplateFromEDL(edlId)` clone structure d'un EDL en effaçant les valeurs
- [x] `loadLogEDLTemplate(ref)` charge le template dans modale EDL ouverte (in-place reset)
- [x] À la création d'un nouvel EDL : si template existe, confirm2() de chargement automatique
- [x] `viewLogEDLTemplate(ref)` affiche le contenu via alert
- [x] `clearLogEDLTemplate(ref)` supprime avec confirmation
- [x] Empty state si aucun EDL avec CTA explicatif (loi 1989 art. 3-2)
- [x] Responsive 3 breakpoints (PC / tablette / mobile)
- [x] Dark mode OK

## Limites connues

- **`viewLogEDLTemplate` via alert()** : V1 minimale. Si volume justifie, refaire en modale dédiée avec édition.
- **Pas de versioning du template** : on écrase à chaque save. Pourrait être utile de garder un historique pour revenir en arrière.
- **Pas de partage de templates inter-logements** : si l'utilisateur a 5 T2 identiques, il doit sauver 5 templates. Un système « template commun par type/immeuble » serait utile (Session 8 immeuble).
- **Bouton Sauv. template par card** : si l'utilisateur a 10 EDL pour un même logement, il y a 10 boutons identiques. Acceptable mais redondant.

## Journal

- 2026-05-06 : créé · helper `_renderLogFichePanelEDL(log, ref)` avec liste EDL + bandeau template + cards riches · helpers `_edlStats` et `_edlSignatureStatus` réutilisables · helper `openNewEDLForLog(ref, type)` pré-remplit logement (via dispatchEvent change pour déclencher onEDLLogChange) + radio type · EDL-TEMPLATE-PER-LOG : `saveLogEDLTemplateFromEDL` (clone structure en effaçant valeurs), `loadLogEDLTemplate` (in-place reset _edlP/_edlCles), `viewLogEDLTemplate`, `clearLogEDLTemplate` · CTA + EDL Entrée/Sortie selon contexte · bandeau template avec 2 états · CSS .logf-edl-* + .logf-edl-tpl-* + responsive · livré v14.57
