# DRIVE-PARTAGE-PICKER — Partage avec un tiers via Google Picker (Option E)

**Status** : ⏸️ **EN ATTENTE retest Marion v15.142** (confirmer le code/raison d'erreur exact via le toast rouge enrichi) · Plan archi « 1 fichier/user » validé par user, prêt à coder dès confirmation · **Prio** : P1
**Reprise** : quand Marion a reteste en v15.142 → lire la raison du 403 → lancer la phase 1 du plan (cf section « PLAN RETENU »).
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

## ⚠️ RÉSULTAT TEST 2 COMPTES (2026-05-21) — Option E semble INSUFFISANTE
Test réel Didier + Marion (clé API Picker fournie `AIza…njA4`, v15.141) :
- Marion se connecte avec son compte Google ✓ (OAuth OK).
- Elle voit les données de Didier (« Bonjour Didier ») → donc le **pull a fonctionné** (lecture du dossier partagé OK).
- Mais la **sauvegarde échoue** : bulles de retry ×3 puis échec.

**Diagnostic** : ses entités locales portent les `driveFileId` créés par l'app de **Didier**. Au save,
`_driveSaveOneEntity` fait un `PATCH` sur CES fichiers → refusé. Le scope `drive.file` n'autorise pas
l'écriture sur des fichiers créés par une AUTRE instance d'app, **même** quand le dossier parent a été
sélectionné via le Picker (le Picker octroie l'accès au dossier — lister/créer dedans — mais pas le
droit de modifier les fichiers pré-existants d'un autre compte). **= la limitation `drive.file` persiste
malgré le Picker.** L'hypothèse « le Picker octroie l'écriture sur tout le contenu » (ligne 23-25) est donc
fausse pour les fichiers créés par un tiers.

**Action v15.142** : message d'erreur Drive enrichi (`_drvErrMsg`, code HTTP + raison Google + indice
accès Éditeur) pour confirmer le 403/raison exacte au prochain test.

**Pistes de vrai fix (décision à prendre, pas un quick fix)** :
- **(P1) Architecture « 1 jeu de fichiers par utilisateur »** : Marion ne PATCH jamais les fichiers de Didier ;
  son app écrit SES propres fichiers entité (`immotrack-entity-{id}__{userHash}.json`) dans le dossier partagé,
  et le merge lit TOUS les fichiers du dossier (union multi-fichiers + LWW par `_modifiedAt`). Reste en `drive.file`.
  Refacto moyenne (save = create-own + jamais patch-foreign ; load = agréger N fichiers par entité).
- **(P2) Scope `drive` complet** : simple côté code mais coût vérif Google CASA + argument sécurité commercial perdu.
- **(V2) Backend** : la vraie solution multi-tenant (PostgreSQL), hors scope court terme.

## PLAN RETENU (2026-05-21, décision user) — Archi « 1 jeu de fichiers par utilisateur »
Chaque app instance écrit UNIQUEMENT ses propres fichiers, ne modifie JAMAIS ceux d'un autre compte.
Le merge actuel est DÉJÀ compatible (LWW par sous-objet, par id/ref) → l'essentiel du travail est côté SAVE.

**Insight clé (simplifie tout)** : pas besoin de détecter qui possède un fichier. Stratégie SAVE =
« PATCH le fichier connu ; si 403 → ce n'est pas le mien → je crée MON propre fichier tagué et j'écris
dedans désormais ». Didier (propriétaire) continue à patcher ses fichiers untagged existants (PATCH 200,
zéro migration). Marion (associée) reçoit 403 sur les fichiers de Didier → bascule sur ses propres fichiers.

### Phases
1. **userTag stable** : `_drvUserTag()` = hash court (~6 hex) de `_userEmail` (déjà capté par `_fetchUserInfo`).
   Fallback = id d'install localStorage si email absent. Stable cross-device pour un même compte (les 2
   devices de Marion partagent SON fichier).
2. **Save entité** (`_driveSaveOneEntity`) :
   - Tracking `_myEntityFileIds = {entityId: fileId}` en localStorage (NON contaminé par le merge,
     contrairement à `ent.driveFileId`).
   - id = `_myEntityFileIds[entityId] || ent.driveFileId`. Si id → PATCH. Si PATCH 200 → mémorise id comme mien.
     Si 403 (pas le mien) ou 404 (supprimé) → POST `immotrack-entity-{entityId}__{tag}.json` → mémorise nouvel id.
   - Ne JAMAIS écrire via `ent.driveFileId` en aveugle.
3. **Save global** (`_driveSaveGlobal`) : même logique, `immotrack-global__{tag}.json`, tracking `_myGlobalFileId`
   (avec fallback PATCH legacy `_driveGlobalFileId` → si 403, créer le mien).
4. **Load** : déjà OK pour entités (`name contains 'immotrack-entity-'` capte les tagués). Pour le global :
   passer la recherche de `name='immotrack-global.json'` à `name contains 'immotrack-global'` + merger TOUS
   les globaux trouvés (union templates/params/categories ; LWW si conflit).
5. **Merge** : ne plus contaminer `ent.driveFileId` (le laisser informatif read-only ; le save n'en dépend plus).
   Vérifier convergence tombstones cross-user (suppression Marion → tombstone dans SON fichier → merge LWW
   propage à Didier au pull ; au save suivant de Didier son fichier contient aussi le tombstone → converge).
6. **Tests** : Vitest sur (a) la logique de choix de fichier au save (PATCH connu vs création tagué sur 403),
   (b) merge multi-fichiers même entité (Didier édite logA, Marion édite logB → les 2 survivent), (c) tombstone
   cross-user. Sandbox-first ; Drive désactivé en test → tester les fonctions pures de merge/选fichier.

### Risques
- **Données Drive = zone à risque** (cf marathon loops/perte de données). Refacto phase par phase, diff+commit,
  test à chaque étape, sandbox d'abord. Ne PAS toucher index.html prod avant validation.
- Doublons transitoires (untagged orphelin) si un compte change d'email : acceptable (merge LWW dédoublonne par id/ref).

## Journal
- 2026-05-20 : créé. Cause = scope drive.file. Option E (Picker) retenue. Code v15.135 livré (gaté, additif). Prérequis clé API + test 2 comptes côté user.
- 2026-05-21 : **test 2 comptes KO** (cf section ci-dessus) — pull OK mais save 403 (drive.file ne peut pas modifier les fichiers de Didier). Option E insuffisante en l'état. Diagnostic enrichi v15.142. Décision archi requise (piste P1 « 1 jeu de fichiers par user » recommandée).
