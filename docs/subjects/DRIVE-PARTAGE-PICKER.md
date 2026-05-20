# DRIVE-PARTAGE-PICKER — Partage avec un tiers via Google Picker (Option E)

**Status** : 🔄 Code livré v15.135 (gaté, additif) · ⚠️ **Prérequis user + test 2 comptes requis** · **Prio** : P1
**Remplace** : le workaround « Drive partagé » de BUG-DRIVE-PARTAGE-TIERS (qui NE marchait PAS — Marion restait en lecture seule).

## Problème (constaté réel)
Didier partage son dossier ImmoTrack avec Marion (accès Éditeur Drive natif). Marion ouvre l'app,
se connecte → elle peut **lire** mais **pas enregistrer** (lecture seule).

## Cause
Scope OAuth `drive.file` = l'app ne peut écrire que les fichiers que **son** instance a créés pour
l'utilisateur connecté. Les fichiers ImmoTrack ont été créés par l'app de **Didier** → l'app de
Marion ne peut pas les écrire, même avec un accès Drive natif. Limitation structurelle Google.

## Décision (2026-05-20)
Option E (Google Picker) retenue vs Option A (scope `drive` complet). Raisons :
- garde le scope `drive.file` **minimal** (sécurité = argument commercial),
- ne rend PAS la future vérification Google plus dure (`drive` complet = audit CASA payant),
- statut app confirmé : **Production / Externe / non vérifiée** → les scopes restreints marchent
  déjà (avertissement "app non validée" + plafond 100 users), donc pas d'attente de vérif.

## Principe
Marion **sélectionne** le dossier ImmoTrack partagé via le Google Picker → ce geste **octroie** à
son app l'accès `drive.file` (lecture+écriture) à CE dossier et son contenu. On stocke l'id du
dossier (`localStorage._drvSharedRootId`) qui devient la **racine Drive** de l'app pour elle.

## Implémentation v15.135 (100% additive, gatée sur `_drvSharedRootId`)
- Constantes : `DRIVE_PICKER_API_KEY` (à remplir), `DRIVE_PROJECT_NUMBER='580411013113'`.
- `_drvEnsurePicker` (charge `apis.google.com/js/api.js` + `gapi.load('picker')`).
- `_drvOpenSharedFolderPicker` (ouvre le Picker, vue Dossiers, SUPPORT_DRIVES) + `_drvPickerCallback`
  (stocke `_drvSharedRootId`/Name, override `_immoRootFolderId`, relance un pull manuel).
- `_drvClearSharedFolder` (oublie le dossier, retour Drive perso).
- `_getImmoRootFolder` : retourne `_drvSharedRootId` si présent (sinon comportement perso INCHANGÉ).
- `_driveLoadEntityFiles` + `_driveLoadGlobal` : si dossier partagé → recherche scopée
  `'{id}' in parents` + `supportsAllDrives&includeItemsFromAllDrives&corpora=allDrives`.
- Helper `_drvSAD()` (= `&supportsAllDrives=true` si dossier partagé, sinon vide) appliqué aux
  GET/PATCH/POST des fichiers entité + global (couvre aussi les vrais Drive partagés / Team Drives).
- UI : Paramètres → section « 🤝 Dossier partagé (co-gestion) » avec bouton « Sélectionner un
  dossier partagé » + « Revenir à mon Drive perso » + statut.
- **Usage solo strictement inchangé** (rien ne se déclenche sans `_drvSharedRootId`). Bloc Picker
  vérifié syntaxiquement OK, 915 tests Vitest OK.

## ⚠️ Prérequis utilisateur (à faire dans Google Cloud Console, projet 580411013113)
1. **Activer l'API Picker** : APIs et services → Bibliothèque → chercher « Google Picker API » → Activer.
2. **Créer une clé API** : APIs et services → Identifiants → Créer des identifiants → Clé API.
   (Optionnel mais recommandé : restreindre la clé à l'API Picker + au domaine de l'app.)
3. Coller la clé dans `const DRIVE_PICKER_API_KEY='...'` (index.html) + bumper.

## Test requis (2 comptes)
1. Didier partage le dossier ImmoTrack (Drive) avec le compte de Marion (accès Éditeur).
2. Marion ouvre l'app, se connecte (son compte), Paramètres → « Sélectionner un dossier partagé »
   → choisit le dossier de Didier → doit pouvoir LIRE puis MODIFIER + ENREGISTRER.
3. Vérifier qu'une modif de Marion remonte chez Didier (et inversement).

## Limites connues
- Drive partagé / Team Drive : le `supportsAllDrives` est posé, mais non testé — à valider.
- Conflits d'écriture simultanée 2 personnes : voir DRIVE-2F (OCC) si besoin de durcir.

## Journal
- 2026-05-20 : créé. Cause = scope drive.file. Option E (Picker) retenue. Code v15.135 livré (gaté, additif). Prérequis clé API + test 2 comptes côté user.
