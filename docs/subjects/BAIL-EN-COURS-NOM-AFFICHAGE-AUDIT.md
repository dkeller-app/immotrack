# Contre-audit B3 : nom d'affichage du logement (`log.libelle`)

**Périmètre** : `git diff 131651c HEAD` sur `feat/bail-en-cours` (commits 2f8b28a → a9611d9).
**Auditeur** : contre-auditeur indépendant, 2026-10-06. Je n'ai pas écrit ce code. Aucun fichier suivi n'a été modifié : les mutations ont été faites sur une copie `git archive` dans le scratchpad.
**Référence** : `docs/subjects/BAIL-EN-COURS-NOM-AFFICHAGE.md`, notamment la règle d'or du §0.

## Verdict : **À CORRIGER**

Je n'ai trouvé ni XSS, ni libellé dans une clé, une jointure, un `value`, un `data-*` ou un `onclick`. Aucun document légal n'est touché (bail, avenant, congé, quittance, relance, IRL, décompte, EDL PDF, cautionnement, DDT). Le bail signé reste imperméable au libellé. En revanche, le libellé sort dans **un document remis à un tiers**, le récap fiscal 2044 imprimé. Les tests promis par la conception pour `saveParamLog` n'existent pas, et un test du bail signé ne vérifie rien.

---

## Findings

### 🔴 1. Le libellé apparaît dans le récap 2044 imprimé, qui est remis à un tiers

- **Où** : `js/app/app-part2.js:10424-10425` (`_legal2044PerimetreHtml`) affiche `escHtml(_logLabel(e.ref))` et `escHtml(_logLabel(f.ref))`. Cette fonction est injectée telle quelle dans `_print2044` (`app-part2.js:10686` ; insertion `${_legal2044PerimetreHtml(data)}` vers la l. 10765). Le code commente lui-même ce document : « ce récapitulatif est remis à un tiers (comptable, centre des impôts) ».
- **Scénario** : un lot meublé D-104 porte le libellé « Studio de mamie ». L'utilisateur clique « Imprimer / PDF » sur le récap 2044. Le PDF remis au comptable affiche « 1 lot(s) meublé(s) EXCLU(S) … : Studio de mamie » au lieu de « D-104 ». C'est contraire à la règle d'or et au §1.4 de la conception (« Fiscal … : référence »). La conception classait cette fonction en (a) écran sans voir qu'elle est partagée avec l'impression.
- **Pourquoi aucun test ne l'attrape** : la liste `DOCUMENTS` de `log-label-gardefous.test.js` ne contient ni `_print2044` ni `_legal2044PerimetreHtml`.
- **Correctif** : ajouter un paramètre `_legal2044PerimetreHtml(data, { ecran: true })`, qui utilise `_logLabel` uniquement quand `ecran` est vrai (wizard étapes 3 et 4, l. 10645 et 10674). `_print2044` l'appelle sans option, donc avec la référence. Ajouter `_print2044` à `DOCUMENTS`, avec une assertion sur l'appel sans `ecran`.

### 🟠 2. `saveParamLog` n'a aucun test, contrairement à ce que prévoit le §5.2

- **Où** : la conception exige « `saveParamLog` simulé sans `#log-libelle` → le libellé existant est conservé ». Aucun test ne le fait (`grep saveParamLog __tests__` ne donne que `statut-vacant-depart` et `logp-partial`, qui ne parlent pas du libellé).
- **Preuve par mutation** : j'ai remplacé `if (el('log-libelle'))` par `if (true)` (`app-part2.js:22522`). Résultat : **78/78 verts**. Une régression qui effacerait silencieusement tous les libellés depuis un écran sans le champ ne serait pas détectée. Même constat pour la branche `delete log.libelle` (vide ou égal à la ref → clé supprimée) : aucun test.
- **Correctif** : extraire `saveParamLog` par vm, comme `log-label-app.test.js` le fait déjà. Couvrir 4 cas : (a) champ absent → libellé conservé ; (b) champ vide → `'libelle' in log === false` ; (c) libellé égal à la ref → clé absente ; (d) `_stamp(log)` appelé.

### 🟠 3. Le test « bailLegalContent : même contenu légal » ne vérifie rien

- **Où** : `__tests__/helpers/log-label-gardefous.test.js`, bloc `bailLegalContent`. `a` et `b` sont calculés sur le **même** objet `bail`, et `logAvec` n'est jamais passé à la fonction. L'assertion `a === b` est vraie par construction, quel que soit le code.
- **Scénario** : un futur `bailLegalContent` qui lirait `DB.logements[…].libelle` resterait vert.
- **Correctif** : soit supprimer ce test, puisque la vraie garantie vient de `CHAMPS_BAIL`, `_captureBailSnapshot` et de la fenêtre de signature (ces trois-là sont bien testés), soit tester l'empreinte de bout en bout. Dans ce second cas : snapshot capturé via `_captureBailSnapshot` extrait, avec un logement à libellé A puis B, et empreintes identiques.

### 🟡 4. `_short()` des finances coupe un libellé qui contient « · »

`app-part2.js:30466` : `_short` coupe au premier `' · '` de `nomLot()`, qui vaut désormais `_logLabel(l) + ' · ' + locataire` (l. 30284). Exemple : un libellé « Studio · RDC » donne la tuile « Studio ». Deux lots « Studio · RDC » et « Studio · 1er » deviennent indiscernables dans la « Répartition par bien » et dans les badges des mouvements. Avant, c'était impossible, parce que `REF_RE` interdit « · ». **Correctif** : faire renvoyer à `nomLot` un couple `{nom, loc}` et appeler `_short = r => nomLot(r).nom`, ou bien couper au **dernier** `' · '` quand un locataire existe.

### 🟡 5. Analyse du `subtitle` de `_computeUnifiedTodo` par motif de texte

- `app-part1.js:7095` : `nom = subtitle.split(' — ')[0]`. Un libellé qui contient « — » est tronqué.
- `app-part1.js:7107` : `hasDG = / DG /.test(subtitle)`. Le libellé est maintenant dans le subtitle (l. 9850). Un lot nommé « Lot DG 3 » en départ **sans** dépôt de garantie est donc classé en « dépôt à restituer » au lieu de « fin de bail ». Le risque existait déjà avec une ref à espaces, mais le libellé l'élargit.
- **Correctif** : porter un drapeau `hasDG` et la ref sur l'item, et ne plus analyser le texte affiché.

### 🟡 6. Le multi-espace ne tient pas compte de `_espaceId`, alors que le §1.1 le prévoit

`_logFindParRef` (`app-part1.js` ~l. 6280) retire `@@esp` et ignore `x._espaceId`. Les logements de tous les espaces sont concaténés dans `DB.logements` (`js/core/store-multi.js`, `tagArr`). Si deux espaces ont la même réf, la carte du logement de l'espace 2 (`_renderLogementCardFlat(l)`) affiche le libellé de l'espace 1. L'effet est cosmétique et rare, mais il s'écarte de la conception. **Correctif** : si `x._espaceId` est présent (ou le suffixe `@@esp`), préférer `z.ref === ref && z._espaceId === esp`.

### 🟡 7. Le texte d'une option est relu dans `_edlRenderLogCard`

`app-part2.js:5619` : quand le locataire est vide, l'occupant est déduit de `opt.text.split(' – ')`. L'option vaut maintenant « Nom · réf – Vacant ». Un libellé qui contient « – » produit une ligne 2 erronée (« B · D-101 – Vacant »). C'est cosmétique. **Correctif** : ne plus relire le texte de l'option et prendre `lg.locataire || 'Vacant'`.

### 🟡 8. Les listes « À traiter » de Pilotage affichent encore la réf pour les vacants

`app-part1.js:7081` : `src.vacant.push({ … nom: v.ref … })`. Dans `_pilOpenListe` (l. 7869), `i.nom || _logLabel(i.ref)` prend donc la réf. Même chose pour les impayés et fins de bail sans locataire (`it.locataire || it.ref`). **Correctif** : `nom: _logLabel(v.ref)`, ou ne pas renseigner `nom` quand il vaut la ref.

### 🟡 9. Sites listés par la conception mais non traités

Sur ces écrans, l'affichage n'est pas homogène (aucun risque, la réf reste affichée) :
- `_dgOpenRestitution` (`app-part2.js` ~l. 26354, `escHtml(ref)`) ;
- `_invBienCtxHtml` (`app-part1.js:14556`, liste de choix sans « Nom · réf ») ;
- `js/core/irl-preview.js:56`.

### 🟡 10. Caractères invisibles et bidi non filtrés

`normaliserLibelle` retire `\u0000-\u001F\u007F`, mais pas U+200B à U+200F ni U+202A à U+202E / U+2066 à U+2069. Un membre SCI qui a le droit d'écrire peut saisir un libellé avec RLO (U+202E). La confirmation de destruction « Supprimer le logement Nom · D-101 » afficherait alors la réf inversée, ou deux noms identiques en apparence. Cela affaiblit la garantie « Nom · réf identifie sans ambiguïté ». **Correctif** : ajouter `[​-‏‪-‮⁦-⁩﻿]` au filtre. Point accessoire : `.slice(0,60)` peut couper au milieu d'un emoji ; utiliser `Array.from(s).slice(0,60).join('')`.

### 🟡 11. Divers

- `exportBiensCSV` (`app-part2.js:9652` et suivantes) : le nouveau champ libre « Nom affiché » n'est pas neutralisé contre l'injection de formule (`=`, `+`, `-`, `@` en tête). Le risque existait déjà pour « Locataire ». Préfixer `'` dans `escCsv` si la valeur commence par `[=+\-@]`.
- `openNewLog` (`app-part2.js:21340`) affiche « 🔒 Verrouillée : bail signé » même quand le blocage vient d'un **EDL** signé (`code: 'edl-signe'`). Le `title` contient le bon message, mais le texte visible est faux. Utiliser `_g.code === 'edl-signe' ? 'EDL signé' : 'bail signé'`.
- `saveParamLog` sans module LogLabel (l. 22524) : le repli ne retire ni les caractères de contrôle ni le libellé égal à la ref. Un libellé « fantôme » peut donc être stocké en `file://` sans module. L'affichage le masque grâce à `_logNomRepli`, mais le JSON le garde.
- `delLog` (`app-part2.js:22709`) : le commentaire « le tombstone ne garde pas le libellé » contredit le §2 de la conception (« un logement supprimé le garde dans son tombstone »). Le code est plutôt meilleur (minimisation des données). Il faut mettre la conception à jour.
- Tri dans `_rgShowGlobal` (l. 26414) et `rRegul` (l. 26903) : `localeCompare` sans `numeric` (point C5 déjà connu). Utiliser `_logLabelCmp` ou `_natCmp`.
- Test de non-régression des cartes sans libellé : il vérifie seulement `>D-102</div>` et l'absence de « Réf. ». Le « HTML identique à l'actuel » demandé au §5.2 n'est pas vérifié (pas de capture de référence).

---

## Ce que j'ai vérifié et trouvé correct

1. **Contexte donnée (point 1)**
   - Aucune occurrence de `_logLabel` ou `_logLabelRef` dans `value=`, `data-*`, `onclick`, `_lyQ(…)`, `dataset`, `.value =`, `getElementById` ou une clé de Map. Vérifié par grep ciblé (`(onclick|value|data-…|title|aria-label)=…_logLabel`) : seul `title=` sort, en l. 26442, et il est échappé par `escHtml`, qui échappe `"` et `'`.
   - Les `refEsc` et `refEscJs` (`rBaux`, `_renderBuildingBlockA`) n'ont changé que dans leur partie texte.
   - `_affPkListHtml` garde `data-ref="escHtml(l.ref)"`.
   - Toutes les `<option>` gardent `value=ref`, et `sel.value = …` compare toujours des refs.
   - Je n'ai trouvé aucune relecture du texte d'une option pour en déduire une clé (`selectedOptions[0].text` absent). La seule relecture est en l. 5619, voir le finding 7.
2. **XSS (point 2)**
   - Chaque site `innerHTML` passe par `escHtml` ou un alias local `esc = escHtml`.
   - Les sinks en texte brut (`showToast`, `confirm2`, `confirm`, `textContent`, `fab.title`) sont sûrs : `showToast` fait `escHtml(msg)` (`app-part1.js:3756`), et `_undoOp` ne sert qu'au toast et au `title` posé par propriété DOM.
   - `_edlConsultShell` échappe son sous-titre. Le `subtitle` de `_computeUnifiedTodo` est échappé au rendu (l. 10224).
   - `fillSel` échappe désormais la valeur et le texte. C'est sans régression pour ses 6 appelants, car les labels ne sont pas pré-échappés, et c'est même une correction quand un nom d'entité contient `"`.
   - Les anciens sites qui injectaient la ref sans échappement (widgets `cat`, `rBauxHistorique`, `_renderIRLRappelModal`, `rEquipements`) sont maintenant échappés, locataire compris.
3. **Documents (point 3)**
   - Aucun `_logLabel`, `LogLabel` ou `log.libelle` dans les 21 générateurs listés, ni dans `js/core/*` (email-pdf-attachment, avenant, conge, legal-2044, legal-bilan, doc-template).
   - Les titres d'agenda stockés, `autoKey`, `_auditLog`, les noms de fichiers et les objets d'e-mail sont inchangés : un grep `mailto|subject|_auditLog|filename|autoKey|download` croisé avec `_logLabel` ne donne rien.
   - La seule exception est le finding 1 (2044 imprimé).
4. **Persistance et synchro (point 5)**
   - L'écriture est conditionnelle, normalisée, et fait `delete` si la valeur est vide ou égale à la ref.
   - `_stamp(log)` est toujours appelé en fin de `saveParamLog`.
   - `#log-libelle` ne s'ouvre que par `openNewLog`, qui le remplit (édition) ou le vide (création, y compris le parcours guidé `_frSubmitLog`). Il n'y a donc pas de libellé périmé recopié d'un autre logement.
   - Côté cloud, `legacy_raw` contient l'enregistrement entier. L'hydrate remplace l'objet (`store-supabase.js:137`), donc une clé supprimée se propage. Le `sig` JSON détecte le changement.
   - Renommage de la réf : le libellé suit, puisqu'il est sur le même objet.
5. **Bail signé (point 6)** : `CHAMPS_BAIL`, `_captureBailSnapshot`, la capture de la fenêtre de signature et `_syncLogToBail` ne contiennent pas `libelle`. Ce sont de vrais tests statiques, et la mutation est attrapée.
6. **Fonctions pures** : `normaliserLibelle`, `libelle`, `libelleEtRef`, `correspond` (repliement des accents par les vrais caractères U+0300 à U+036F) et `comparer` sont conformes au §1.1. Le miroir `.global.js` est identique au module.
7. **Mutations sur la copie du repo** (tests `log-label*`, 78 tests) :
   | Mutation | Résultat |
   |---|---|
   | `_logLabel` lit `x.libelle` de l'objet reçu | 🔴 2 tests rouges ✔ |
   | `onclick` de la carte construit avec `_lyQ(_logLabel(l))` | 🔴 4 rouges ✔ |
   | Titre de carte non échappé | 🔴 2 rouges ✔ |
   | `_logLabel` injecté dans `_buildQuittanceHtml` | 🔴 1 rouge ✔ |
   | `value` d'option = `_logLabel` (concaténation) | 🔴 1 rouge ✔ |
   | `fillSel` sans échappement | 🔴 1 rouge ✔ |
   | Garde `if (el('log-libelle'))` supprimée dans `saveParamLog` | **78/78 verts ✘** (finding 2) |
   | `data-ref` alimenté par une variable intermédiaire | **verts ✘** (limite connue d'un garde-fou ligne à ligne) |
8. **Suite complète** : `npx vitest run` donne 249 fichiers et 6152 tests verts. `git status` est propre après l'audit, à l'exception de ce fichier.

---

## Suivi des corrections (commits « B3 audit : … »)

| Finding | Statut | Détail |
|---|---|---|
| 🔴 1 récap 2044 imprimé | Corrigé | `_legal2044PerimetreHtml(data, { ecran: true })` : nom d'affichage seulement dans le wizard (étapes 3 et 4) ; `_print2044` → référence. `_print2044` ajouté à `DOCUMENTS`, test vm ecran/sans ecran (rouge par mutation). Recherche d'autres fonctions d'écran réutilisées en impression/export : aucune (seul `exportBiensCSV` mêle `_logLabel` et export, voulu : colonne « Nom affiché »). |
| 🟠 2 `saveParamLog` | Corrigé | Logique extraite en `_logLibelleDepuisFormulaire(log, ref, champPresent, valeur)`, testée avec et sans module (absent / vide / = réf / normalisation) + test statique de `if (el('log-libelle'))` et de `_stamp(log)`. Trois mutations rouges. |
| 🟠 3 test `bailLegalContent` | Corrigé | Supprimé (tautologique), justifié en commentaire. |
| 🟡 4 `_short` finances | Corrigé | `nomLotParts` renvoie `{nom, loc}` ; `_short` = nom seul. Aucun fichier `js/core/finances-*` touché. |
| 🟡 5 subtitle de `_computeUnifiedTodo` | Non traité | Trop invasif (consigne) : à faire en portant `hasDG` et la ref sur l'item. |
| 🟡 6 multi-espace | Corrigé | `_logFindParRef` préfère `_espaceId` / suffixe `@@espaceId`. |
| 🟡 7 `_edlRenderLogCard` | Corrigé | `lg.locataire \|\| 'Vacant'`, plus de relecture de `opt.text`. |
| 🟡 8 Pilotage vacants | Corrigé | `nom: _logLabel(...)` pour vacants, impayés et fins de bail sans locataire. |
| 🟡 9 sites non homogènes | Non traité (consigne) | Aucun risque, la référence reste affichée. |
| 🟡 10 invisibles / bidi / emoji | Corrigé | Module + miroir `.global.js` + repli de `saveParamLog` alignés. |
| 🟡 11 divers | Corrigé : neutralisation de formule (Locataire et Nom affiché seulement), mention « EDL signé », tris `_natCmp` (`_rgShowGlobal`, `rRegul`), repli de `saveParamLog` aligné, §2 de la conception (tombstone `delLog` sans libellé). Non traité : test de HTML identique des cartes sans libellé (pas de capture de référence). |

