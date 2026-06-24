# Sauvegarde de sécurité (export local incrémental) — design

> **Statut : DESIGN validé sur mockup** (`mockups/sauvegarde/`, « ok très bien » 2026-06-24).
> Lié à `project_cloud_cutover_finition` (Chantier 3 SAUVEGARDE). App Propryo, vanilla JS mono-fichier
> `index.html`, cloud-only Supabase.

## Objectif
Offrir à l'utilisateur une **sauvegarde locale de sécurité** : une copie, sur son ordinateur, des **données
(JSON), documents et photos** générés **depuis la dernière sauvegarde** (incrémental), dans un **dossier de
son choix**, à une **cadence longue configurable** (jour / semaine / mois / manuel). C'est un **filet** : l'app
conserve déjà 100 % des données sur Supabase. La sauvegarde protège le cas extrême (perte de compte, copie
hors-ligne, portabilité).

## Décisions validées
| # | Décision |
|---|----------|
| D1 | **Adaptatif à l'appareil** (réalité technique, pas un choix esthétique) : l'écriture-dossier (File System Access) n'existe que sur **navigateur de bureau Chromium**. |
| D2 | **Cadence longue configurable** : Jour / **Semaine (défaut)** / Mois / Manuel. C'est de la sécu, pas un miroir temps-réel. |
| D3 | **JSON = snapshot COMPLET** à chaque sauvegarde (point de restauration) ; **documents/photos = incrémentaux** (nouveaux depuis la dernière fois, car volumineux). |
| D4 | **Mobile/tablette = AUCUNE sauvegarde** : message « se fait depuis un PC (Chrome/Edge) ». |
| D5 | **Nommage horodaté** : ZIP et snapshots JSON nommés **date + heure** : `propryo-sauvegarde-AAAA-MM-JJ_HHhMM.zip` / `donnees-AAAA-MM-JJ_HHhMM.json`. |
| D6 | **Hors périmètre** : les ~176 photos EDL restées sur Google Drive (non re-migrées vers Storage) ne sont PAS sauvegardables (absentes du cloud Propryo). Signalé à l'utilisateur. |

## Détection appareil / capacité (3 modes)
Au chargement (Réglages → Données → Sauvegarde) :
- **Mobile/tablette** (`matchMedia('(pointer:coarse)')` + largeur, OU absence de `showDirectoryPicker` sur petit écran) → **mode MESSAGE** : encart « 💻 Sauvegarde depuis un PC », aucune action.
- **PC, `window.showDirectoryPicker` disponible** (Chrome/Edge) → **mode DOSSIER** : choisir un dossier, mémorisé, écriture auto silencieuse.
- **PC, sans `showDirectoryPicker`** (Firefox/Safari) → **mode ZIP** : produit un `.zip` téléchargé (proposé/manuel, jamais silencieux — un download ne peut pas être automatique sans geste).

## Comportement par mode
### Mode DOSSIER (PC Chromium) — le vrai « auto »
1. **Setup** : bouton « 📁 Choisir un dossier… » → `showDirectoryPicker()` → on obtient un `FileSystemDirectoryHandle`, **persisté dans IndexedDB** (les handles sont sérialisables via IndexedDB ; la permission est re-demandée au besoin via `handle.queryPermission`/`requestPermission`).
2. **Au chargement de l'app** : si un dossier est mémorisé ET (`now - lastBackupAt >= fréquence`) ET il y a du nouveau depuis `lastBackupAt` → **écriture silencieuse** (toast « ✓ Sauvegarde effectuée »). Si la permission a été révoquée → bandeau « clique pour ré-autoriser le dossier ».
3. **Manuel** : bouton « 💾 Sauvegarder maintenant » toujours dispo.
4. **Structure écrite dans le dossier** (accumulation) :
   - `donnees-AAAA-MM-JJ_HHhMM.json` (snapshot COMPLET du DB — historisé, un par sauvegarde).
   - `documents/<clé>.<ext>` et `photos/<clé>.<ext>` : les fichiers **nouveaux depuis lastBackupAt** (append, jamais de réécriture/suppression → immuable côté sauvegarde).
   - `manifeste.json` : `{ derniereSauvegarde, frequence, fichiersSauvegardes: [clés], versionsJson: [noms] }` — mis à jour à chaque fois.

### Mode ZIP (PC Firefox/Safari) — proposé
1. Pas de dossier mémorisable → pas de silencieux.
2. **Au chargement** : si fréquence écoulée + nouveau → **bandeau** « 🛟 Sauvegarde recommandée — dernière il y a N j · X nouveaux éléments » + bouton « Sauvegarder » (+ « Plus tard »).
3. « Sauvegarder » → construit un `.zip` (⚠️ **JSZip ABSENT du projet** → à **inliner** comme les libs PDF, OU un writer ZIP « stored » minimal maison : les PDF/photos étant déjà compressés, le stockage sans compression suffit ; **le plan tranche** entre les deux) contenant `donnees.json` (snapshot complet) + `documents/` + `photos/` (nouveaux depuis lastBackupAt) + `manifeste.json`, nommé `propryo-sauvegarde-AAAA-MM-JJ_HHhMM.zip`, téléchargé.

### Mode MESSAGE (mobile/tablette)
Encart informatif, aucune action. « Tes données restent en sécurité sur le cloud en attendant. »

## Incrémental — source de vérité
- `lastBackupAt` (ISO) stocké dans **`DB.params` (synchronisé) OU localStorage par-appareil** → ⚠️ décision : la sauvegarde est PAR-APPAREIL (le dossier est local) donc `lastBackupAt` + le handle vivent en **localStorage/IndexedDB par-appareil** (pas dans DB.params synchronisé — sinon deux PC se marcheraient dessus). Reco : **par-appareil** (clé `immo_backup_*`).
- **« Nouveau depuis lastBackupAt »** : énumérer les enregistrements du DB porteurs d'un fichier Storage (documents `cloudKey`/`idbKey`, photos EDL, baux `cloudPdfKey`/`certRef.cloudPdfKey`…) dont l'horodatage de création/maj > `lastBackupAt`. Pour chacun : récupérer le blob via `window.__immoCloudFileUrl(clé)` → `fetch` → écrire. Le **JSON** est toujours complet (pas de calcul d'incrément).
- **Compteur « N nouveaux éléments »** = nombre de fichiers à sauvegarder + (optionnel) flag « données modifiées ».

## UI (cf. mockup `mockups/sauvegarde/`)
Carte Réglages → Données → « 🛟 Sauvegarde de sécurité » : choix dossier (mode dossier) / bouton zip (mode zip) / message (mobile) · sélecteur fréquence (segment) · « Dernière sauvegarde : … » · « N nouveaux depuis » · pastille état (À jour / Mode zip) · bouton « Sauvegarder maintenant » · « Changer de dossier » · « Ouvrir le dossier » (après écriture) · barre de progression pendant l'écriture (« photos 41/64 »). Bandeau de proposition à l'ouverture (mode zip / dossier non configuré). Responsive : mobile = encart message.

## Erreurs / cas limites
- Permission dossier révoquée → bandeau de ré-autorisation, pas de crash.
- `fetch` d'un blob Storage échoue → on saute ce fichier, on le journalise, on le re-tentera à la prochaine (il reste « nouveau » tant que non écrit → tracker les clés réussies dans le manifeste/localStorage).
- Quota disque / écriture échoue → toast d'erreur, sauvegarde marquée non complète (`lastBackupAt` PAS avancé si échec partiel critique).
- Aucun nouveau + JSON inchangé → « rien à sauvegarder » (ne pas créer de fichier vide).

## Sécurité / vie privée
La sauvegarde contient TOUTES les données de l'utilisateur → **strictement locale** (dossier/zip sur SA machine). Aucun envoi externe. Pas de credentials/clés dans le JSON (déjà exclus de l'export existant — réutiliser `exportJSON`/`rgpdExportPortable` qui filtrent les secrets).

## Réutilisation (DRY)
- Le **snapshot JSON** : réutiliser la logique de `exportJSON()` (l.46550) / `rgpdExportPortable()` (filtre secrets) plutôt que recoder la sérialisation du DB.
- L'accès aux blobs Storage : `window.__immoCloudFileUrl(clé)` + `fetch` (déjà utilisé partout).
- Les helpers : `_downloadBlobAs` (ajouté au lot certificat) pour le zip.

## Hors scope (v1)
- **Restauration des DONNÉES** : déjà couverte par l'import JSON existant (`importJSON`, input `#import-json-file` l.1131) — un `donnees-*.json` de sauvegarde est réimportable tel quel. **Restauration des FICHIERS** (re-téléverser documents/photos d'une sauvegarde vers Storage) = hors scope v1, sujet dédié si besoin.
- Chiffrement de la sauvegarde, sauvegarde cloud-tierce (Drive/Dropbox), versionnage avancé.

## Vérification
- `check-inline-js` 5/0 · responsive PC/tablette/téléphone · mode dossier testé Chrome/Edge (écriture réelle), mode zip testé Firefox, message testé sur mobile.
- Pas de demo-data auto-injectée. Audit `code-reviewer` (manipule les données + fichiers légaux).
