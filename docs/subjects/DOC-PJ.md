# DOC-PJ — Pouvoir ajouter des pièces jointes (factures, CR entretien)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M
**Détecté** : 2026-04-28
**Lié à** : TRAV-SUIVI · DRIVE-2H · **🔗 DRIVE-ARBORESCENCE Phase C** (à coupler — voir ci-dessous)

> **🔗 COUPLAGE OBLIGATOIRE — DRIVE-ARBORESCENCE Phase C** (sync Drive→app lazy scan)
>
> Quand on attaque DOC-PJ, on traite **EN MÊME TEMPS** la Phase C reportée de DRIVE-ARBORESCENCE :
> - **Côté upload (déjà prêt v14.35)** : utiliser `_drvUploadDoc(logRef, category, file)` qui gère compression + nommage + push Drive + métadonnées dans `DB.documents`
> - **Côté scan (à implémenter)** : helper `_drvScanLogementFolders(logRef)` qui liste les fichiers de chaque sous-dossier Drive du logement (`files.list` avec parent=folderId), compare avec `DB.documents`, ajoute en DB les fichiers Drive absents (catégorie déduite du sous-dossier parent) et supprime/tombstone les références DB pour les fichiers absents de Drive (suppression manuelle utilisateur depuis Drive web)
> - **Trigger lazy scan** : à l'ouverture de `LOG-FICHE-360` (sous-onglet Documents) — pas au login pour éviter les appels API massifs
> - **Toast découverte** : « X documents découverts dans Drive ajoutés à votre fiche »
>
> Sans ce couplage, le drag-drop côté app fonctionne mais les dépôts manuels de l'utilisateur dans Drive web ne sont jamais détectés → bidirectionnel cassé. Cf [docs/subjects/DRIVE-ARBORESCENCE.md](DRIVE-ARBORESCENCE.md) journal 2026-05-03.

## Contexte
Aujourd'hui pas de système global de PJ. L'utilisateur veut pouvoir attacher des **fichiers** (PDF facture, photo CR d'intervention, devis, etc.) à différentes entités :
- Mouvements (facture pour un travaux)
- Travaux/entretien (CR d'intervention, photos avant/après, devis)
- Logements (DPE, plans, ERP)
- Bail / EDL (déjà partiellement, pour les photos EDL)
- Charges (facture du syndic, contrat chaudière)

## Scope
- [ ] Concevoir un système générique d'attachement (table `pj` avec fk parent + type parent + url Drive ?)
- [ ] Réutiliser l'infra Drive existante (upload, get) — pas de IndexedDB ici, Drive direct
- [ ] UI : bouton "+ Ajouter PJ" sur chaque fiche (mouvement, travaux, logement, charge)
- [ ] Liste des PJ avec preview (image) ou lien (PDF/Word)
- [ ] Suppression + remplacement

## Décisions à prendre
- [ ] Storage : Drive direct (URL) ou IndexedDB local + sync ?
- [ ] Quotas / limites taille fichier ?
- [ ] Versioning : remplacer ou garder les versions précédentes ?

## Notes utilisateur
> 💬 2026-04-28 : "pouvoir ajouter des PJ (facture ou CR pour les entretiens par exemple)"

## Journal
- 2026-04-28 : créé
