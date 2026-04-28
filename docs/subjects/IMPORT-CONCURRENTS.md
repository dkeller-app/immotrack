# IMPORT-CONCURRENTS — Migration des données depuis solutions concurrentes

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : L
**Détecté** : 2026-04-28
**Lié à** : IMPORT-EXCEL-LOG

## Contexte
Question utilisateur : **"Comment migrer les données des solutions concurrentes ?"**

Pour la commercialisation, l'onboarding d'un nouvel utilisateur venant d'un concurrent (Rentila, Qalimo, BailFacile, ImmobilierLoyer, Smovin, Lockimmo, etc.) doit être facile sinon il ne migre pas.

Approche typique :
1. **Template Excel ImmoTrack standard** (déjà prévu dans `IMPORT-EXCEL-LOG`) avec colonnes normalisées (entité, immeuble, logement, locataire, bail, mouvement, charge…)
2. **Mappers concurrent → template ImmoTrack** : pour chaque concurrent supporté, un mapper qui transforme leur export (CSV / Excel / JSON) en notre template
3. **Doc utilisateur "Comment migrer depuis X"** : pour chaque concurrent, un guide pas-à-pas (où exporter dans leur app, comment uploader dans ImmoTrack)

## Scope
- [ ] **Étape 0 — CDC** : choisir la liste des concurrents prioritaires à supporter (top 3 marché ?) → Rentila, BailFacile, Qalimo ?
- [ ] **Étape 1** : Définir/finaliser le template ImmoTrack standard (cf IMPORT-EXCEL-LOG, déjà partiellement fait)
- [ ] **Étape 2** : Pour chaque concurrent supporté :
  - [ ] Identifier leur format d'export (CSV, Excel, JSON, ou via API)
  - [ ] Écrire un mapper de leur format vers notre template
  - [ ] Documenter "Comment exporter mes données depuis [concurrent]"
- [ ] **Étape 3** : UI dédiée "Migrer depuis un concurrent" avec sélecteur (Rentila / Qalimo / BailFacile / Excel custom / JSON ImmoTrack)
- [ ] **Étape 4** : Validation post-import (rapport de ce qui a été importé, erreurs, doublons)
- [ ] **Étape 5** : Marketing : page publique "Comment passer de [X] à ImmoTrack"

## Décisions à prendre
- [ ] **Quels concurrents** supporter en priorité ? (Rentila + BailFacile + Qalimo en top 3 ?)
- [ ] **Source des formats** : exports utilisateur (les concurrents proposent-ils des exports ?) ou via API publique (rare) ou via demande RGPD (toujours possible mais lent) ?
- [ ] **Périmètre** : tout migrer (entités, baux, mouvements historiques, photos EDL) ou juste l'essentiel (entités + baux actifs) ?
- [ ] **Volumétrie** : limites (10k mouvements ? 1k logements ?) → impact perf

## Concurrents identifiés (cf `ImmoTrack_Comparatif_Concurrents_2026.xlsx`)
- Rentila
- BailFacile
- Qalimo
- ImmobilierLoyer
- Smovin
- Lockimmo
- Gererseul
- Itsmycoaching

## Notes utilisateur
> 💬 2026-04-28 : "comment migrer les données des solutions concurrentes ?"

## Journal
- 2026-04-28 : créé · CDC requis (priorisation concurrents) avant tout code
