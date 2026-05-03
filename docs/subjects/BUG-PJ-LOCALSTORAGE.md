# BUG-PJ-LOCALSTORAGE — PJ documents mouvements gonflent localStorage (quota)

**Status** : ⬜ À faire · **Prio** : **P1** · **Taille** : M (~3-5h)
**Détecté** : 2026-05-03 (utilisateur en conditions réelles)
**Lié à** : MVT-DOC-PJ (v14.19 livré) · EDL-PHOTOS-IDXDB (livré, pattern à réutiliser) · DOC-PJ (sujet futur, à aligner)

## Symptôme utilisateur
> 💬 2026-05-03 : « j'ai enregistré des images / documents dans mouvements et j'ai eu ce message [⚠️ Stockage plein — sauvegarde Drive recommandée] »

Capture : toast d'avertissement après ajout de PJ dans plusieurs mouvements.

## Cause racine

Implémentation v14.19 (PJ document attaché aux mouvements via `_mvDocLoad`) **stocke le binaire en base64 directement dans `DB.mouvements[i].pj.dataB64`** (cf `_mvDocPending` l.9669+).

Conséquences :
- Chaque PJ image 1-2 Mo gonfle `DB` de 1.3-2.6 Mo (base64 = +33% vs binaire)
- Quota navigateur `localStorage` = **5-10 Mo selon navigateur** (Chrome ~10 Mo, Safari plus strict)
- 4-5 mouvements avec PJ image suffisent à atteindre la limite
- `saveDB()` catch silencieusement le `QuotaExceededError` et toast warn, mais **la DB ne se persiste plus en localStorage** → seul Drive sync continue
- Si user ferme tab AVANT push Drive (debounce 800ms) → **perte des dernières modifs locales**

## Comparaison avec le pattern correct (EDL photos)

`EDL-PHOTOS-IDXDB` (v13.x livré) utilise **IndexedDB** (`immotrack_photos` store, helpers `_idbPut`/`_idbGet`/`_idbKey` ~l.16670) :
- Le binaire base64 est stocké en IndexedDB sous une `idbKey` courte (ex `ph_1714745234123_a3b4c5`)
- La DB ne stocke que la **référence `idbKey`** (~30 octets) + les métadonnées (nom, date, mime, driveFileId)
- IndexedDB autorise plusieurs **centaines de Mo** par origine — pas de quota court terme
- Pattern fonctionnel, robuste, déjà éprouvé

## Scope (3 phases)

### Phase 1 — Migrer le stockage des nouvelles PJ vers IndexedDB (~1.5h)
- [ ] Adapter `_mvDocLoad(input)` (~l.9670) : au lieu de `dataB64: e.target.result` direct, faire `idbKey = _idbKey()` + `_idbPut(idbKey, base64)` puis stocker `_mvDocPending = { name, mime, idbKey, size }` (sans `dataB64`)
- [ ] Adapter `_mvDocOpenInWindow(pj)` et `_mvDocViewById(id)` : si `pj.idbKey`, faire `_idbGet(pj.idbKey)` pour récupérer la base64 avant d'afficher (avec fallback au champ `dataB64` legacy pour rétrocompat)
- [ ] Adapter `saveMv` pour stocker `m.pj = { name, mime, idbKey, size }` au lieu de `{ name, mime, dataB64, size }`
- [ ] Adapter `_buildEntityPayload` mouvements : préserver `idbKey` dans le payload Drive **+ pousser le binaire IDB sur Drive** (pour cross-device, comme EDL photos via `_drvUploadJpeg`)
- [ ] **Tests** : ajouter une PJ image 5 Mo sur un mouvement → vérifier que DB n'augmente que de ~30 octets + IDB contient la nouvelle entrée
- [ ] **Commit** « v14.X : BUG-PJ-LOCALSTORAGE Phase 1 — PJ mouvements migrées en IndexedDB »

### Phase 2 — Migration des PJ existantes en base64 → IndexedDB (~1h)
- [ ] Helper `_mvMigratePjToIdb()` qui scanne `DB.mouvements`, pour chaque `m.pj?.dataB64` : créer une `idbKey`, `_idbPut(idbKey, dataB64)`, remplacer dans la DB par `m.pj = { name, mime, idbKey, size }`
- [ ] Lancer la migration auto au boot SI au moins une `m.pj.dataB64` détectée → toast info « X PJ migrées vers IndexedDB (allègement DB) »
- [ ] **Tests** : reload sur DB qui contient déjà des PJ legacy → migration auto + DB allégée + PJ encore visualisables
- [ ] **Commit** « v14.X+1 : BUG-PJ-LOCALSTORAGE Phase 2 — migration auto PJ legacy vers IDB »

### Phase 3 — Cross-device : push/pull binaires PJ via Drive (~1.5h)
- [ ] Réutiliser le pattern EDL photos (`_drvUploadJpeg` + fallback download via `_downloadPhotoFromDrive`)
- [ ] À l'upload PJ : aussi pousser le binaire vers Drive (sous-dossier dédié ou via `_drvUploadDoc(logRef, 'documents', file)` Phase B v14.35 → réutilisation directe **!**)
- [ ] À l'affichage PJ depuis un device qui n'a pas le binaire en IDB local : fallback download depuis Drive via `m.pj.driveFileId`
- [ ] **Tests** : ajouter PJ sur PC → ouvrir sur téléphone → PJ visible (download IDB depuis Drive transparent)
- [ ] **Commit** « v14.X+2 : BUG-PJ-LOCALSTORAGE Phase 3 — sync cross-device PJ via Drive »

> **Note couplage** : Phase 3 peut réutiliser `_drvUploadDoc` du DRIVE-ARBORESCENCE Phase B v14.35 — la PJ d'un mouvement lié à un logement irait dans `📄 Documents/` du logement. Cela aligne le stockage avec le reste du pilotage.

## Tests manuels (validation)

1. Ajouter PJ image 5 Mo sur un mouvement → toast NE DEVRAIT PAS apparaître ✓
2. Ajouter 10 PJ images 1 Mo chacune → toast NE DEVRAIT PAS apparaître ✓
3. Reload après PJ ajoutées → la PJ s'affiche correctement (récupérée depuis IDB) ✓
4. DB legacy avec PJ base64 → migration auto au boot + toast info + PJ toujours visualisables ✓
5. PJ ajoutée sur PC → ouvrir téléphone (cross-device) → PJ visible (Drive download fallback) ✓
6. Reset base depuis localStorage → PJ disparues (cohérent, IDB liée à l'origine) ✓

## Workaround court terme (si bug bloquant utilisateur)

En attendant la livraison, l'utilisateur peut :
1. Vérifier que Drive a bien sauvé (FAB ✓ vert) avant de fermer l'onglet
2. Supprimer manuellement les PJ les plus lourdes via l'UI mouvement (icône 🗑 sur la PJ)
3. Recharger l'app pour ré-importer la DB depuis Drive (sans les PJ purgées si push Drive a déjà eu lieu après suppression)

## Notes utilisateur
> 💬 2026-05-03 : symptôme remonté en conditions réelles, EDL urgent même jour (pas bloqué car photos EDL sont déjà en IDB depuis v13.x — confirmé)

## Journal
- 2026-05-03 : créé suite à toast quota localStorage chez utilisateur après ajout de PJ images sur plusieurs mouvements · cause racine identifiée : `m.pj.dataB64` en base64 dans DB au lieu de IndexedDB · pattern correct existe déjà (EDL photos `_idbPut`/`_idbGet`) · session dédiée à planifier
