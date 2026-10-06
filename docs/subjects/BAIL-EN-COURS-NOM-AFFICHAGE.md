# BAIL-EN-COURS-NOM-AFFICHAGE : nom d'affichage du logement (`log.libelle`)

**Statut** : 📐 Conception (rien n'est codé) · **Prio** : P1 · **Branche** : `feat/bail-en-cours`
**Origine** : RETOURS-2026-10-05, point B3 (GO Didier le 2026-10-05, maquettes validées le 2026-10-06)
**Maquettes** : `mockups/BAIL-EN-COURS/captures/nom-fiche-{pc,tab,tel}-{light,dark}.png` et `nom-liste-*.png` (script `shoot2.mjs`)
**Liés** : `js/core/rename-logement.js` (renommage de la référence, inchangé) · C5 (tri `_natCmp`) · SECU-INNERHTML

---

## 0. Ce qui est décidé

- `logement.ref` reste **la clé technique**. Elle sert de jointure partout, et `canRenameLogement` (`js/core/rename-logement.js:17-25`) la bloque dès qu'un bail ou un EDL est signé.
- On ajoute **`log.libelle`**, le nom affiché. Il est libre, modifiable à tout moment, même avec un bail signé. S'il est vide, l'écran affiche la référence.
- Maquette de la fiche d'édition (onglet Identité) : sous « Référence * (clé technique, ne change jamais) », on ajoute le champ « Nom affiché (modifiable à tout moment — vide : la référence est affichée) », avec l'aide « Libellé d'écran uniquement. Les documents (bail, quittances, lettres) gardent la référence et l'adresse. » Quand la référence est verrouillée, le bouton « ✏️ Renommer » est remplacé par « 🔒 Verrouillée : bail signé ».
- Maquette de la liste : le titre de la carte est le libellé, avec « Réf. D-101 » en petit dessous. Une carte sans libellé reste inchangée (la référence sert de titre et la ligne « Réf. » n'est pas affichée).

**Règle d'or** : le libellé est **un texte d'écran, jamais une donnée**. Il n'entre dans aucune clé, aucune jointure, aucun attribut `onclick`/`data-*`/`value`, aucun document légal, aucun export technique, ni dans le snapshot ou l'empreinte d'un bail signé.

---

## 1. Inventaire des affichages et helper unique

### 1.1 Helper proposé (une seule source)

Le module pur `__tests__/helpers/log-label.js` est copié en `js/helpers/log-label.global.js` (`window.LogLabel`) par `tools/sync-helpers-global-mirrors.mjs`. C'est le même patron que `log-immeuble-resolver`. Il fonctionne en `file://`, sans module ES.

```js
// Pur : ne lit jamais DB. `log` = un enregistrement de DB.logements.
normaliserLibelle(raw, ref)  // trim, espaces fusionnés, caractères de contrôle retirés, 60 max ; '' si vide ou égal à la ref (sans tenir compte de la casse)
libelle(log)                 // log.libelle normalisé, sinon log.ref, sinon ''
libelleEtRef(log)            // "Studio RDC gauche · D-101" si libellé, sinon "D-101"
correspond(log, q)           // recherche : libellé OU ref (minuscules, sans accents)
comparer(a, b)               // tri : _natCmp(libelle(a), libelle(b)) || _natCmp(a.ref, b.ref)
```

Wrappers applicatifs (dans `app-part1.js`, à côté de `_natCmp` l. 6270) :

```js
_logLabel(x)     // x = ref (string) OU logement → texte affichable (non échappé)
_logLabelRef(x)  // forme mixte « Nom · réf »
```

**Résolution toujours par la référence** : quand `x` est un objet, le wrapper relit `x.ref` (suffixe `@@espace` retiré) dans `DB.logements` (vivant de préférence, puis archivé ou tombstone). S'il trouve `x._espaceId`, il le prend en compte. Il ne lit **jamais** `x.libelle` sur l'objet reçu. Raison : plusieurs objets « lignes » portent à la fois `ref` et un `libelle` qui n'est pas celui du logement :
- `app-part2.js:1793` : l'item du ruban IRL vaut `{ ref, libelle: locataire + ' · bail du …' }` ;
- `mouvements.libelle` est la colonne cloud de `m.lib` (`js/core/store-mapping.js`, mapper `mouvements`) ;
- les lignes d'import bancaire ont un `libelle` (`js/helpers/bank-import.global.js`) ;
- `annonce-generator.global.js:319` utilise aussi un `libelle`.

Une ref inconnue (`'SCI:…'`, saisie libre, logement supprimé et purgé) renvoie **la chaîne reçue**, sans erreur. Le coût est une recherche linéaire sur `DB.logements` (quelques centaines au plus), négligeable même sur la matrice. Pas de cache, donc rien à invalider.

**Échappement** : le helper renvoie du texte brut. On applique `escHtml(_logLabel(x))` à chaque site `innerHTML`, comme pour tout le reste. Sur un site `textContent`, `confirm2` ou `showToast` texte, on n'échappe pas.

### 1.2 Règle d'usage

| Contexte | Ce qu'on affiche | Appel |
|---|---|---|
| Écran : titre, carte, ligne de liste, matrice, toast, en-tête de modale | nom | `_logLabel(x)` |
| Choix d'un logement (`<select>`, sélecteur, case à cocher), confirmation destructive, consigne « sélectionne X » | nom + réf | `_logLabelRef(x)` |
| Document remis à un tiers (bail, avenant, congé, quittance, relance, lettre IRL, décompte, EDL, cautionnement, récap DDT), nom de fichier, export, journal d'audit, clé, console | **référence** | `log.ref` (inchangé) |
| Valeur technique (`value=`, `data-ref=`, `onclick`, `autoKey`, clé de Map) | **référence** | inchangé, `_lyQ(ref)` |

La ref brute ne contient jamais `< > " ' & \``, car le format est contrôlé (`saveParamLog`, `app-part2.js:22460-22464` ; `REF_RE` dans `rename-logement.js:3`). Le libellé, lui, accepte **tout caractère**. Il doit donc toujours passer par `escHtml` en HTML, et ne jamais aller dans du JS inline.

### 1.3 (a) Écrans qui doivent afficher le NOM (`_logLabel`)

Fichiers `js/app/app-part1.js` (P1) et `js/app/app-part2.js` (P2). Les numéros de ligne datent du 2026-10-06 ; il faut re-grepper avant de coder.

**Biens, liste et cartes (maquette `nom-liste`)**
- P2:9426 `_renderLogementCardFlat` : `titleEsc` alimente le titre PC (9467, + `title=`) et le titre téléphone (9448). Ajouter la ligne « Réf. D-101 » (`.mu.sm`) uniquement si un libellé existe.
- P2:9190/9242 `_renderBuildingBlockA` : `.log-row-a-ref`. Afficher le nom et la réf en petit.
- P2:9536 `_renderLogementsGroupedPhone` : il délègue à `_renderLogementCardFlat`, seul le tri est à changer (§3).
- P2:10962 `rBiens` : le compteur ne change pas. La recherche est dans `_filterAndSortLogs` (§3).

**Fiche logement**
- P2:11052 `openLogFiche` : barre du haut `imm — ref` → `imm — nom`.
- P2:17379, 17394 `rLogFiche` : fil d'Ariane → nom.
- P2:17399 `rLogFiche` : `<h1>` = `imm — ref` → `imm — nom`, avec « Réf. X » en suffixe discret si libellé (cas mixte, cf. (c)).
- P2:17283 `_renderLogFichePhHero` : `.logf-ph-ref` → nom (et réf en petit si libellé).
- P2:17327 `rLogFiche` : le message « Le bien « X » n'existe pas » **reste ref** (le logement n'existe pas, donc pas de libellé).

**Pilotage / matrice / À traiter**
- P1:7769, 7772 `_renderPilMatrice` : cellule et carte téléphone → nom. Les attributs `data-pillot` (7768, 7772) **restent ref**.
- P1:7840 `_pilOpenListe` : `i.nom || i.ref` → `i.nom || _logLabel(i.ref)`. `data-pilgo` reste ref.
- P1:7879 `_pilOpenFiche` : en-tête de la feuille → nom.

**Tableau de bord, détails et widgets** (P1)
- 8832 `_buildRevDrill`, 8947 `_buildOccDrill`, 9451 `_buildProgDrill`, 8259 `_gmbiAfficher`.
- Widgets `cat` : 10950, 10967, 10994, 11004, 11011, 11023, 11027, 11038, 11041, 11052, 11056, 11452, 11458, 11462, 11483. Plusieurs injectent `l.ref`/`it.ref` **sans `escHtml`** (10950, 10994…). Il faut ajouter `escHtml` en passant au nom.

**Loyers, quittances, IRL** (P2 sauf mention)
- 1274 `_lyDpeBlock`, 1296 toast `_lyDpeRapide`, 1337 `_lyRow`, 1498 `_lyLigneDecision`, 1612/1630 `_irlAnnulerProgrammee`, 1644/1645 `_lyQuittancesDuMois`, 1721/1730 `_lyPanneauSuivi`, 1844/1856/1868 `_lyFriseRuban` (le `x.libelle` voisin est le **locataire**, ne pas confondre), 26624/26638 `_lyTousLoyersHtml`.
- Quittance express : 2306 `_qeRender`, 2597 `_qeRenderPickList` (liste de choix, voir (c)), 2621.
- IRL : 2881/2896 toasts lettre, 2941 `_renderIRLRappelModal` (aujourd'hui sans `escHtml`), P1:24827 `_gfOuvrir`, P1:24908/24958 `applyIRL`, P1:25169 `_applyPendingIRLRevisions` (alertes gel), P1:25203/25208 `skipIRL`, P1:25248-25285 `resetIRLApply` (code mort selon RETOURS C4, à aligner quand même ou à supprimer), P2:14094/14111 `_histoIrlCorrOpen`, P2:14199 `_histoSaveCorrPeriode`.
- `js/core/irl-preview.js:56` : le `label` est construit avec `l.ref`. Ajouter un paramètre optionnel de libellé ou faire le rendu côté app.

**Bail (écrans)** (P1)
- 5395 `openRemoteSignModal` (bandeau côté bailleur), 8140 `openBailClore`, 8228 toast, 13744 `_bauxHistCardPhone`, 13771 `rBauxHistorique` (sans `escHtml`), 13804 titre bail archivé, 15282 `openLoyerBienModal`, 15435 `openFicheCandidat`, 15724 `rBaux` (`.meta-b`), 15996 titre `openBail`, 16988 toast `terminerBail`, 17043 toast `delBail`, 17396 `_openBailValidModal`, 17857 `_baremeCloturerLot`.

**Départ, DG, régularisation, compteurs, EDL, équipements, agenda**
- P1 : 25531 `_rgDetailLocHtml`, 25851 `_rgClotureLocataire`, 26152 `_departDeclarer`, 26250 `_departRenderStepper`, 26413 `_rgShowGlobal` (en-têtes de colonnes), 26475/26492 `_rgShowGlobalPhone`, 26987 `rRegul`, 27190 `_regRenderPhone`.
- P2 : 26322 `_dgOpenRestitution`, 26839 `_procedureSave`, 32433 `_antRender`, 16567 `openCompteursInitModal`, 16672 `openCompteurReleve`, 16978/17007/17073/17092 (template EDL), 3891 `edlOpenView`, 3981 `edlOpenGallery`, 4011 `rEDLList`, 4037/4039 `_edlListMore`, 4112 `openEditEDL`, 5615 `_edlRenderLogCard`, 25559 `rEquipements` (sans `escHtml`), 25042 `_agendaEvtCard`, 25219 `_agendaEvtCardPhone`, 25343 `openDayDetail` (pastille 🏠 de l'événement : `e.logement` → nom).

**Immeuble (fiche)** (P2)
- 11784 Gantt `_renderImmFichePlanGantt`, 12601 `_renderImmFichePanelCharges`, 12747 `openCcFormModal` (libellé de case ; `value` 12746 reste ref).

**Mouvements, banque, règles, finances**
- P1:13388 `_mvAffLabel` (colonne « Qui »), P1:11687 `_showEntModal`, P1:12319 `_affLogBtn`, P2:24686 `rParamsRules`, P2:27659 `_bankDupMvAff`, P2:28200 `_bankProposPanelHtml`.
- P2:30544 `_finDrillNomLot` : son repli `l.locataire || l.ref` devient `l.locataire || _logLabel(l)`. 5 appelants, via `_finLotNomAt` (30553).
- `js/helpers/bank-import.global.js:1088` (« dû du mois de » + `c.ref`) : **hors périmètre** (bank-import interdit à cette passe), reste en ref. Écart connu et acceptable.

**Divers**
- P2:10413/10414 `_legal2044PerimetreHtml` (écran), P2:22015/22022 `openAnnonce`, P2:23523 `_frShowFr`, P2:23797 `_frRecapHtml`, P2:8101/8114 toasts archivage/restauration, P2:22714 toast suppression, P1:15809 et 15899 (`openNewBailChoix`, `copyBailFrom`, voir (c)).

### 1.4 (b) Ce qui doit RESTER la référence

**Documents légaux et lettres (le libellé ne doit jamais y figurer)**
- Bail : `genBailHTML` P1:23735, `buildBailStructure` P1:18377, `previewBailDataV2` P1:18357 (`<title>Bail V2 — ref`), `exportBailWord` P1:22379/22423, `buildReprisBail` P2:20238.
- Avenant / congé : P1:22588 `_avenantDocPageHtml`, P1:23570 `_congeDocHtml`, `js/core/avenant.js`, `js/core/conge.js`.
- Quittance / relance / IRL : P2:876/881 `_buildQuittanceHtml`, P2:2032/2034 `_buildRelanceHtml`, P2:2787 `_buildIRLLetterHtml`, `genIRLLetter` P2:2808.
- Décomptes : P1:27297/27326/27329 `_buildDecompteHtml`, P1:25931 `_rgOpenDecompteEstimatif`. Les motifs de `_findCcById` (P1:26731/26739/26777) finissent dans les décomptes, donc ref.
- EDL : P2:6321 `generateEDLPdfNative` (pied de page PDF), P2:6496 `downloadEDLPdfNative` (texte de partage), P2:6548 `_edlSharePhotos`.
- Cautionnement : `genActeCautionnementDoc` P2:24418. Récap DDT : P2:15304 `_buildDdtRecapHTML`, P2:15539 `_ddtRecapPDF`.
- Pied commun : `js/helpers/doc-template.global.js:233` (`opts.ref`), `_docPage` P1:3521.
- Noms de fichiers PDF joints aux e-mails : `js/core/email-pdf-attachment.js` 263, 361, 444, 505, 574, 646, 705, 742, 833.
- Fiscal : `js/core/legal-2044.js:241/244`, `js/core/legal-bilan.js:447`, aperçu 2044 P2:30866/30867 `_fin2044PrevisuHtml`.

**Exports et traces**
- `exportBiensCSV` P2:9636-9642 : la colonne `Ref` reste. On **ajoute** une colonne « Nom affiché » juste après (seul changement d'export).
- RGPD : P2:31765 `rgpdShowDataReport`, P2:31792 `rgpdExportPortable`. Le JSON contient le logement entier, libellé compris, ce qui est normal.
- Journal d'audit : P1:25119 `_auditLog(... ref, `${ref} · …`)`, P2:20441 `_acteApply`.
- Import : P3:137 `_importRefParse`, P2:19959 `_acteRenderLogements` (on saisit des références).
- Console : P1:3272, P3:1192.

**Clés techniques (ne jamais toucher)**
- `autoKey` agenda : P1:2161, 2193, 2221, 2244, 2294, 2326 ; P1:16999/17000 ; P2:25779/25784.
- `onclick` / `data-*` / `value` : P1:4381-4400 `_renderRemoteSignBadge`, P1:14060-14081 `openBailMenu`, P2:1272/1277, P2:25461 `data-equip-key`, P2:13763 (clé d'accordéon).
- Titres d'agenda **stockés** : P1:2171, 2178, 2200, 2228, 2246, 2296, 2333. Ce sont des chaînes persistées et synchronisées. Y mettre le libellé les rendrait périmées à chaque renommage. Elles restent en ref ; seule la pastille 🏠 affiche le nom (cf. (a) et question 3).
- Modale « Renommer la référence » : P2:21260/21263, elle parle de la référence.
- Titre de la modale d'édition « Modifier : D-101 » : P2:21309. La maquette validée le garde.

### 1.5 (c) Cas mixtes « Nom · réf » (`_logLabelRef`)

Dans ces écrans, l'utilisateur doit **identifier sans ambiguïté**, et deux libellés peuvent être identiques (§3).

- **Listes de choix « Logement »** : texte = `_logLabelRef(l)` (+ locataire comme aujourd'hui), `value` = ref.
  - P1 : 12137 `fillMvQui`, 12362/12363 `_affPkListHtml`, 14332 `rCandidats`, 14412 `_fillCandLogSelect`, 14529 `_invBienCtxHtml`, 16005 `openBail`, 15809 `openNewBailChoix`, 13798 `openBailHist`, 24083 `openAss` et 24196 `openMrh`.
  - Pour `openAss` et `openMrh`, `fillSel` (P1:3797-3800) **n'échappe rien**. Il faut passer `l => escHtml(...)` en `labFn`, sinon le libellé ouvre une faille XSS.
  - P2 : 2597 `_qeRenderPickList`, 3989 `rEDLList` (filtre), 4190 `_edlFill`, 12521 `_renderImmRelevesLogements`, 23777 `_frRentableOptions`, 24959 `initAgendaFilters`, 25418 `rEquipements`, 25718 `openEquipIntervention`, 25851 `openAgendaEvt`, 31744 `_rgpdRefreshSelect`.
- **Confirmations destructives** (supprimer, archiver, clôturer, réinitialiser les signatures) :
  - P2 : 8094/8107 (archiver/restaurer), 22684/22695 `delLog` (le libellé `_undoOp` fait partie du texte affiché) ;
  - P1 : 8201 `saveBailClore`, 8298-8315 `resetBailSignatures`, 16965 `terminerBail`, 17013/17014/17020 `delBail`, 17521 `saveBail` (« le logement X a déjà un bail actif »).
- **Consignes qui renvoient à une liste de choix** : P2:2487 `_qeEnregistrerPaiement` (« Sélectionne « X » ») et P2:14268 `_renderLogFichePanelCompta` (« Pensez à sélectionner « X » »). Le texte doit être **identique** à celui de l'option, donc `_logLabelRef`.
- **Fiche** : P2:17399 `<h1>` (nom + « Réf. X » en suffixe), P2:17480 `_renderLogFichePanelGeneral` (ligne « Référence » conservée + nouvelle ligne « Nom affiché » si renseigné), P2:3900 `_edlViewBodyHtml` (consultation d'EDL à l'écran : nom · réf).
- **Copie de bail** : P1:15899 `copyBailFrom` (« X (archivé) »).

**Volume** : environ 110 sites (a), 60 (b) laissés tels quels, 35 (c). Inventaire produit par grep des motifs `escHtml(*.ref|logement|logRef|qui)`, `${*.ref}`, `esc(*.ref)`, `fillSel(…ref)`, `textContent = …ref`. Avant de coder, il faut re-grepper aussi `e(x.ref)` et `esc(lig.ref)`, car des alias d'échappement locaux existent.

---

## 2. Persistance et synchronisation

| Couche | Où vit `logements` | Effet de `libelle` |
|---|---|---|
| Local | `DB.logements` dans le blob localStorage (+ miroir local) | Champ ajouté tel quel. |
| Cloud | **Table `logements`** (mapper `js/core/store-mapping.js:89-93`), **pas** `espace_config` | Pas de colonne typée nécessaire. `base()` (l. 54) pousse l'enregistrement entier dans `legacy_raw`, et l'hydrate reconstruit `DB.logements` depuis `legacy_raw` (`js/core/store-supabase.js:137`). |
| Détection de changement | `sig = JSON.stringify(rec)` (`js/core/store-sync.js:101`) | Une modification du libellé seul est bien poussée. |
| Horodatage | `saveParamLog` appelle `_stamp(log)` (`app-part2.js:22631`) puis `saveDB()` | Rien à ajouter tant que le libellé ne s'édite que dans cette modale. Toute autre édition (future édition en ligne) doit appeler `_stamp(log)`. |

**Pas de migration SQL.** Une colonne `libelle` typée ne servirait qu'aux requêtes SQL, et aucune n'en a besoin. L'ajouter imposerait le même interrupteur que `COLONNES_CLAUSES_BAIL_0046` (PostgREST refuse une colonne inconnue : PGRST204, l. 40-52). Ce serait un risque sans bénéfice.

- **Tombstones** : le libellé vit sur l'enregistrement, mais `delLog` ne le recopie PAS dans le tombstone (minimisation des données voulue, contre-audit 2026-10-06 : le tombstone ne garde que l'identité technique). À la résurrection (`saveParamLog`, `wasTombstone`, l. ~22495), le formulaire réécrit le champ, comme les autres.
- **Fusion** : dernier écrit gagnant **par enregistrement** (`_modifiedAt`), comme tous les champs du logement. Deux appareils qui modifient l'un le libellé, l'autre la surface en même temps : le dernier `_stamp` gagne pour tout le logement. C'est le comportement actuel de tous les champs, rien de spécifique ici.
- **Renommage de la référence** (`rename-logement.js`) : le libellé est sur le même objet et suit sans rien faire. `validateNewRef` ne le regarde pas, et c'est voulu.
- **Bail signé (confirmé dans le code)** :
  - le libellé n'est **pas** dans `CHAMPS_BAIL` (`js/core/bail-modifications.js:24`), donc aucune entrée dans `baux_evenements` ;
  - il n'est **pas** dans le snapshot figé : liste blanche explicite de `_captureBailSnapshot` (`app-part2.js:8319-8350`) et de la capture de la fenêtre de signature (`app-part1.js:21343-21358`) ;
  - il n'est **pas** dans l'empreinte légale : `bailLegalContent` (`js/core/bail-content-hash.js`) hashe les termes du bail + `bailSnapshot` ;
  - `_syncLogToBail` (`app-part2.js:22389`) ne recopie que `adr/type/etage/surf`.
  
  **À garder ainsi** : ne jamais ajouter `libelle` à ces listes ; un test le verrouille (§5).
- **Dossiers Drive** (DRIVE-ARBORESCENCE) : le nom de dossier dérive de `ref/type/etage/entity/imm` (`prevSnapshot`, `saveParamLog`). Le libellé **ne déclenche pas** de renommage de dossier.
- **Partage SCI / invités** : la RLS `logements` filtre par entité. Un membre qui voit la ligne voit `legacy_raw`, donc le libellé. Un membre en écriture peut le modifier, comme tout autre champ du logement. La config scopée (`loyerBareme`, etc.) est indexée par `ref` (`supabase/migrations/0053_partage_durcissement.sql:182-187`) : non concernée.
- **Règle « on retire des écrans, jamais des données »** : `saveParamLog` est aussi appelé par le parcours guidé (`_frSetVal('log-ref', …)`, `app-part2.js:23416`). L'écriture doit être conditionnelle : `if (el('log-libelle')) log.libelle = …`, sinon un écran sans le champ effacerait le libellé.

---

## 3. Unicité, validation, recherche, tri

- **Doublons autorisés** : deux « Garage » dans deux immeubles, c'est normal. La référence reste l'identifiant unique. Les écrans de choix et les confirmations affichent « Nom · réf » (1.5), donc deux libellés identiques restent distinguables.
- **Normalisation** (`normaliserLibelle`) : trim, espaces multiples fusionnés, caractères de contrôle retirés (`\u0000-\u001F\u007F`), **60 caractères** max (même plafond que la ref, `maxlength="60"` sur l'input). On stocke `''` si le résultat est vide ou égal à la ref (sans tenir compte de la casse), ce qui évite un libellé fantôme. À l'enregistrement, on supprime la clé (`delete log.libelle`) plutôt que de stocker `''`, pour éviter un changement inutile du JSON.
- **Aucune restriction de caractères** : apostrophes et guillemets sont utiles (« Studio de l'angle »). La sécurité vient de l'échappement à l'affichage (`escHtml`), pas du filtrage à la saisie. D'où l'interdiction formelle en JS inline (`onclick`, `_lyQ`).
- **Recherche** : nom **et** ref, sur les 4 sites qui filtrent du texte :
  - `_filterAndSortLogs` (P2:9606-9614) ;
  - `_affPkListHtml` (P1:12348) ;
  - `rBaux` (P1:15585) ;
  - `_qeRenderPickList` (P2:2590).
  
  On ajoute `l.libelle` à la liste des champs comparés (via `LogLabel.correspond`).
- **Tri** : on trie sur **ce qu'on voit**, `LogLabel.comparer` = `_natCmp(nom) || _natCmp(ref)`, avec `_natCmp` (P1:6270). Sites à basculer :
  - P2 : 9157, 9184 (`localeCompare` non numérique, déjà signalé en C5), 9305, 9536, 9624, 9631 ;
  - P1 : 12361 ;
  - P1:26385 et 26874 (régularisation, `localeCompare` brut) : à vérifier, aligner s'il s'agit d'un ordre d'affichage.
  
  Le tri « immeuble puis logement » (P2:9631) est conservé : `_natCmp(a.imm, b.imm) || LogLabel.comparer(a, b)`.

---

## 4. Risques et pièges

1. **Le libellé utilisé comme clé.** Toute comparaison `=== ref`, `DB.baux[...]`, `.find(l => l.ref === x)` qui recevrait le libellé échouerait **en silence** (logement « introuvable », bail vide). Les cas typiques sont :
   - un `<select>` dont on ne changerait que le texte : `value` doit rester `l.ref` ;
   - `this.dataset.ref` (P1:12362) ;
   - `data-pillot` / `data-pilgo` (P1:7768-7841) ;
   - les `onclick="…('${_lyQ(l.ref)}')"`.
   
   Garde-fou : on ne remplace **jamais** `l.ref` par `_logLabel(l)` dans un attribut. On n'habille que le **texte** entre balises.
2. **Une variable réutilisée.** Plusieurs fonctions calculent `const titleEsc = escHtml(l.ref)` puis l'emploient à la fois en texte et dans `title=""` (P2:9426/9467). Le passage au nom est sans danger. Mais `refEsc` (P1:15625, P2:9190) est aussi accompagné de `refEscJs` (pour `onclick`) : ne modifier **que** `refEsc`.
3. **Le faux ami `libelle`.** `_nomLotAffiche` (P1:8904) renvoie le **locataire**, pas le nom du logement. `x.libelle` dans le ruban IRL (P2:1793/1844) est le locataire + date du bail. `mouvements.libelle` en base est le libellé bancaire. Les wrappers ne lisent `libelle` qu'**après** résolution dans `DB.logements` (§1.1). Ne pas renommer `_nomLotAffiche` dans cette passe (hors sujet), mais ne jamais l'appeler pour le logement.
4. **XSS.**
   - `fillSel` (P1:3797) n'échappe pas.
   - Plusieurs sites injectent `l.ref` brut, sans risque aujourd'hui grâce au format contrôlé de la ref : P1:10950-11056, 11452, 13771 ; P2:2941, 25559.
   
   En y mettant le libellé, chacun doit recevoir `escHtml`. C'est le point de revue n°1 (SECU-INNERHTML).
5. **Une recherche par texte affiché.** Une consigne du type « sélectionne « X » » (P2:2487, 14268) doit afficher exactement le texte de l'option. Une recherche qui ne couvrirait que la ref ne trouverait pas un logement que l'utilisateur ne connaît que par son nom.
6. **Les documents.** Glisser `_logLabel` dans `_buildQuittanceHtml`, `genBailHTML`, `_docPage`… ferait apparaître un surnom interne (« Studio de mamie ») sur un acte juridique. Un test statique l'interdit (§5).
7. **Les titres d'agenda persistés** contiennent la ref en dur (P1:2171-2333). Si on y mettait le libellé, ils deviendraient faux après chaque renommage du libellé, et `agendaAutoSync` réécrirait les titres (churn de synchro). Ils restent en ref.
8. **Le multi-espace.** Deux espaces partagés peuvent contenir la même ref : les baux sont alors indexés `ref@@espaceId` (`js/core/store-multi.js:53`). Le wrapper retire `@@…` et honore `_espaceId` quand il est fourni, sinon il prend le premier trouvé. Le seul cas ambigu, deux espaces avec la même ref et des libellés différents, reste purement cosmétique.
9. **Les tests existants** qui comparent du HTML rendu contenant la ref : ils restent verts tant que le libellé est vide, puisque le comportement est alors strictement identique. C'est une propriété à vérifier explicitement.

---

## 5. Plan de code, tests, vérification

### 5.1 Étapes (1 étape = 1 commit, bump de version à chaque livraison)

1. **Helper pur et miroir.**
   - Créer `__tests__/helpers/log-label.js` (les 5 fonctions du §1.1) avec `log-label.test.js`.
   - Ajouter l'entrée dans `tools/sync-helpers-global-mirrors.mjs`, générer `js/helpers/log-label.global.js`.
   - Ajouter la balise `<script defer>` dans `index.html` (près de `log-immeuble-resolver`, l. ~4495), puis lancer `node tools/stamp-app-parts.mjs`.
   - Ajouter les wrappers `_logLabel` / `_logLabelRef` dans `app-part1.js` près de `_natCmp`, avec un repli local si `window.LogLabel` est absent.
2. **Saisie** (maquette `nom-fiche`).
   - `index.html:2562` : nouveau `.fg` « Nom affiché » sous la ligne Référence, avec `id="log-libelle"`, `maxlength="60"`, `autocomplete="off"` et la phrase d'aide de la maquette. Le libellé de la référence devient « Référence * (clé technique, ne change jamais) ».
   - `openNewLog` (P2:21306) : `setV('log-libelle', log.libelle)` en édition, `''` en création. Le bloc `log-ref-rename-wrap` (P2:21322) affiche « 🔒 Verrouillée : bail signé » quand `window._renameLogement?.canRename(DB, ref).ok === false` ; sans module (file://), on garde le bouton actuel.
   - `saveParamLog` (P2:22458) : écriture conditionnelle normalisée (§2, §3).
3. **Biens : liste, cartes, tri, recherche** (maquette `nom-liste`).
   - `_renderLogementCardFlat`, `_renderBuildingBlockA`, `_renderLogementsGroupedPhone` ;
   - `_filterAndSortLogs` : recherche + tri ;
   - `exportBiensCSV` : colonne « Nom affiché ».
4. **Fiche logement et immeuble** : `openLogFiche`, `rLogFiche`, `_renderLogFichePhHero`, `_renderLogFichePanelGeneral`, Gantt, charges, `openCcFormModal`.
5. **Pilotage, tableau de bord, finances** : `_renderPilMatrice`, `_pilOpenListe`, `_pilOpenFiche`, les détails `_build*Drill`, les widgets `cat`, `_finDrillNomLot`.
6. **Listes de choix** (1.5) : les ~22 `<select>` et sélecteurs en `_logLabelRef`, `fillSel` échappé, les 4 recherches.
7. **Le reste des écrans (a)** : Loyers/IRL, Bail, Départ/Régul/DG, EDL, Équipements/Agenda, Mouvements/Banque, toasts et confirmations (c).
8. **Pilotage** : `BACKLOG.md` + journal de RETOURS-2026-10-05 (B3 livré).

Ne pas toucher : `js/core/finances-monthly.js`, `loyer-du-mois.js`, `loyer-statut.js`, `bank-import.js` (et son miroir `js/helpers/bank-import.global.js`).

### 5.2 Tests Vitest

**`__tests__/helpers/log-label.test.js` (pur)**
- `libelle` : renvoie le libellé ; vide, `null`, espaces seuls ou égal à la ref → ref ; pas de ref → `''`.
- `normaliserLibelle` : trim, fusion des espaces, retrait de `\u0000`/`\n`, coupe à 60, égalité avec la ref insensible à la casse → `''`, `<script>` conservé tel quel (l'échappement se fait à l'affichage).
- `libelleEtRef` : « Nom · REF » si libellé, « REF » sinon.
- `correspond` : trouve par libellé, par ref, sans casse ni accents (« rez-de-chaussee » trouve « rez-de-chaussée »).
- `comparer` : « Apt 2 » < « Apt 10 » ; deux libellés égaux → départage par ref ; mélange avec et sans libellé.

**`__tests__/helpers/log-label-app.test.js` (vrai code extrait par vm, patron de `bail-en-cours-lot-a.test.js`)**
- `_logLabel('D-101')` avec `DB.logements=[{ref:'D-101',libelle:'Studio'}]` → « Studio » ; `_logLabel('SCI:X')` → « SCI:X » ; `_logLabel('D-101@@esp2')` → résout D-101.
- `_logLabel({ ref:'D-101', libelle:'Pierre Demo · bail du …' })` (un objet qui n'est pas un logement) → « Studio », jamais le `libelle` de l'objet.
- `_renderLogementCardFlat` : sans libellé, HTML identique à l'actuel (non-régression) ; avec un libellé `<img onerror>`, la sortie est échappée et l'`onclick` contient toujours la ref.
- `saveParamLog` simulé sans `#log-libelle` dans le DOM → le libellé existant est conservé.

**Garde-fous statiques (`__tests__/helpers/log-label-gardefous.test.js`)**
- **Aucun document n'utilise le libellé** : on extrait le corps de `genBailHTML`, `buildBailStructure`, `previewBailDataV2`, `exportBailWord`, `buildReprisBail`, `_avenantDocPageHtml`, `_congeDocHtml`, `_buildQuittanceHtml`, `_buildRelanceHtml`, `_buildIRLLetterHtml`, `genIRLLetter`, `_buildDecompteHtml`, `_rgOpenDecompteEstimatif`, `generateEDLPdfNative`, `downloadEDLPdfNative`, `genActeCautionnementDoc`, `_buildDdtRecapHTML`, `_docPage`, `_fin2044PrevisuHtml`. On parcourt aussi les fichiers `js/core/email-pdf-attachment.js`, `avenant.js`, `conge.js`, `legal-2044.js`, `legal-bilan.js` et `js/helpers/doc-template.global.js`. Ni `_logLabel`, ni `LogLabel.`, ni `.libelle` (sur un logement) ne doivent y apparaître.
- **Bail signé imperméable** : `CHAMPS_BAIL` n'a pas de clé `libelle`. La liste blanche de `_captureBailSnapshot` et la chaîne de capture de la fenêtre de signature (P1:21348) ne contiennent pas `libelle`. `bailLegalContent({...bail})` donne le même hash, que `log.libelle` change ou non.
- **Jamais dans un attribut** : regex sur `app-part*.js` interdisant `_logLabel(` dans `value="`, `data-`, `onclick=` et `_lyQ(_logLabel`.
- **Synchro** : `mapToRow('logements', {…, libelle:'X'}, ctx).legacy_raw.libelle === 'X'`, et aucune colonne `libelle` n'est émise.

### 5.3 Vérification navigateur (`?sandbox=1`, jeu démo `_loadDemoDataset`)

1. D-101 avec bail signé : ouvrir « Modifier » → la référence est grisée avec « 🔒 Verrouillée », saisir « Studio rez-de-chaussée gauche », enregistrer → toast OK, aucune entrée dans l'historique du bail, empreinte du bail inchangée (console : `bail.signatures.contentHashTerms`).
2. Liste Biens : titre = nom + « Réf. D-101 » ; D-102 sans libellé est inchangé. Vérifier la recherche « studio » et « D-101 », puis le tri A→Z et Z→A.
3. Fiche D-101 : barre du haut, fil d'Ariane, `<h1>`, en-tête téléphone. Puis la matrice Pilotage et « À traiter ».
4. Listes de choix : nouveau mouvement, assurance, MRH, EDL, agenda → « Studio rez-de-chaussée gauche · D-101 », et l'enregistrement rattache bien à D-101 (contrôler `m.qui === 'D-101'`).
5. Documents : quittance, lettre IRL, avenant, aperçu du bail, PDF EDL → **aucune** occurrence du libellé, la ref et l'adresse sont présentes.
6. Libellé `"><img src=x onerror=alert(1)>` → affiché tel quel partout, aucune alerte, liste de choix assurance comprise.
7. Vider le libellé → retour à la ref partout. Saisir un libellé égal à la ref → rien n'est stocké (`'libelle' in log === false`).
8. Synchro cloud : modifier le libellé sur l'appareil A et recharger l'appareil B → libellé présent. Membre SCI scopé : voit le libellé.
9. Trois formats (1280 / 768 / 390), clair et sombre : titre long sur 2 lignes maximum avec ellipse, aucun défilement horizontal, champ en 16 px sur téléphone.

---

## 6. Questions ouvertes pour Didier

1. **Libellés en double** : autoriser sans rien dire (deux « Garage » dans deux immeubles), ou afficher une alerte non bloquante quand le même nom existe déjà chez le même bailleur ? **Reco : autoriser sans alerte**, car la référence reste unique et les listes de choix affichent « Nom · réf ».
2. **Listes de choix et confirmations** : « Studio rez-de-chaussée gauche · D-101 » (nom + réf) ou le nom seul ? **Reco : nom + réf**. Seule cette forme distingue deux noms identiques, et elle permet de retrouver un logement par l'un ou l'autre. Les cartes, la matrice et les fiches gardent le nom seul, comme sur la maquette.
3. **Titres d'agenda automatiques et objets d'e-mail** (« Préparer révision IRL — D-101 ») : garder la référence ? **Reco : oui**. Ce sont des textes enregistrés et envoyés. Le libellé y deviendrait faux à chaque changement de nom. La pastille 🏠 de l'événement affichera, elle, le nom.

## Journal
- 2026-10-06 : conception rédigée (lecture seule du code : inventaire par grep sur `js/app/app-part{1,2,3}.js`, `js/core`, `js/helpers`, `store-mapping`, `store-sync`, `store-supabase`, `bail-content-hash`, `bail-modifications`, `rename-logement`, migrations 0043/0053). Aucun code modifié.
