# MODALE-LOGEMENT-CONSOLIDATION — Refonte modale Logement + Wizard Bail + cohérence bail↔logement

**Status** : 🔄 En cours (Phase B — mockup validé 2026-05-29, implémentation à démarrer) · **Prio** : P0 (UX cassée, retours user multiples) · **Taille** : XL (~9-10 h sur 5 phases)
**Détecté** : 2026-05-29 · **Sujet créé** : 2026-05-29 (transition de session)
**Lié à** : ARCHI-FICHES-UNIFIED Session 1 (décisions B2 + C4 verrouillées mais partiellement implémentées) · ARCHI-DB-DOUBLONS Phase 4b (149 sites lecture migrer) · LOG-ANNONCE (onglet Présentation) · BAIL-TYPES (champ log.typeUsage existant)

## Contexte

Session précédente (2026-05-29) sur l'app ImmoTrack a accumulé :
- Bug A racine non vu pendant 8 commits (CSS rendue dans template literal JS au lieu de stylesheet) — **fix v15.230 validé audit agent**
- Violation `feedback_audits_par_agents.md` 3 fois consécutives (v15.227, v15.228, v15.229)
- Décisions ARCHI-FICHES-UNIFIED Session 1 partiellement implémentées (B2 et C4 trop brutales ou incomplètes)
- Wizard Bail re-demande tout ce qui existe sur le bien → frustration user majeure

Le user demande à reprendre proprement dans une **nouvelle session** avec règles strictement respectées.

## 🔴 Bugs en attente (pas fixés à fin session 2026-05-29)

### Bug B-A — Encart « 🏛 Hérité » affiche wrong immeuble

**Symptôme** : User sélectionne « Morschwiller-le-bas » dans dropdown immeuble (modale Nouveau logement onglet Identité). L'encart hérité affiche les données de « Delle » (« 16 rue saint Nicolas, 90100 DELLE »).

**Hypothèse principale (audit code-reviewer 2026-05-29)** : **donnée DB corrompue** — `imm.nom='Morschwiller-le-bas'` mais `imm.adr='16 rue saint Nicolas'`, `imm.codePostal='90100'`, `imm.ville='DELLE'` (origine : migration v15.212 split adresse appliquée sur donnée déjà bancale, ou Drive merge conflict).

**Diagnostic à faire** : demander au user d'ouvrir F12 → Console → reproduire le bug → lire la sortie `[_logRefreshInherited] {entNom, immNom, immTrouvé, adresseAffichée}` (instrumentation v15.227).

**Code instrumenté** : `index.html:34481-34488` (console.debug).

### Bug B-B — Première connexion à ImmoTrack échoue

**Symptôme** : Lors de la première tentative d'ouverture de l'app, la connexion (Drive OAuth ?) échoue. Le user doit fermer/rouvrir et se reconnecter une deuxième fois pour que ça marche.

**Diagnostic à faire** : tracer le flow OAuth GIS initial. Probable : token init asynchrone non attendu, ou race condition entre SW activation et OAuth init.

**Pistes** : `_driveTokenValid()` / `_silentReGrantAtStartup` (v13.41 BUG-DRIVE-DISCONNECT) / `_scheduleProactiveTokenRefresh`.

## 📋 Toutes les remarques user 2026-05-29 (exhaustives)

### Modale Logement — incohérences UX

| ID | Remarque verbatim user | Problème |
|---|---|---|
| **ML-1** | « on a enlevé bail du logement mais on peut peut etre garder un **loyer et charges théorique** non ? sinon quand il est **vacant à la création** on fait comment ? » | Décision C4 (v15.228) trop brutale. Cas vacant à création perdu : pas moyen de noter le loyer prévu sur le bien avant qu'un bail soit créé. |
| **ML-2** | « pourquoi il n'y a plus tous les **équipements** ? comment on fait pour **gérer après** ? » | Onglet Équipements = chauffage / ECS / annexes / mobilier. **Manque** : cuisine, sanitaires, technologies, extérieurs (qui sont dans onglet Présentation séparé). Éparpillement. |
| **ML-3** | « **annexe on se répète** » | Doublon : champ « Locaux accessoires à usage privatif (cave, parking, garage…) » dans onglet Description **+** champ « Description des annexes » dans onglet Équipements. Même contenu. |
| **ML-4** | « pourquoi **2 endroits pour diagnostique** and co ? **pour moi supprimer l'onglet** » | Onglet « Diagnostics » dans fiche logement 360° **+** onglets « DPE » et « Risques » dans modale Logement. User veut **supprimer les onglets DPE+Risques de la modale Logement** (rester sur fiche 360°). |
| **ML-5** | « on peut avoir des **checks box plutôt que d'écrire** ? on peut **reporter directement sur EDL** comme ça » | Annexes en texte libre (« Cave, 2 parkings, jardin privatif ») → demande des **checkboxes structurées** (Cave / Grenier / Jardin / Parking / Garage / Box / Loggia / Buanderie / …). Bénéfice : auto-report sur EDL. |
| **ML-6** | « on **n'oublie pas l'ajout manuel** » | Règle D1 ARCHI-FICHES-UNIFIED rappelée explicitement : checkboxes + zone d'ajout libre toujours (custom + persistance via `customs[]`). |
| **ML-7** | « **pourquoi les infos ne sont pas reprises automatiquement** ? » | Les équipements / annexes saisies sur le bien devraient être reportées automatiquement sur l'EDL d'entrée (création des sections correspondantes). |

### Wizard Bail — gros décalage avec le logement

| ID | Remarque verbatim user | Problème |
|---|---|---|
| **WB-1** | « **gros décalage entre bail et logement ... et rien de repris** !! » | Wizard Bail re-demande tout ce qui existe déjà sur le logement (description pièces, parties communes, locaux accessoires, chauffage, annexes, DPE, GES, risques…). Décision B2 verrouillée Session 1 (« suppression définitive des ~30 champs legacy bail → bien ») non implémentée. |
| **WB-2** | « pourquoi **type bail pas repris de logement si déjà demandé dans logement** ? » | `log.typeUsage` (nu / meublé / étudiant / mobilité / garage / local-pro) existe sur le bien. Wizard Bail Conditions re-demande sans pré-remplir. |
| **WB-3** | « **régime fiscale utile** ? » (placeholder « ex: Location nue IS ») | User questionne l'utilité de ce champ. À évaluer : supprimer ou repenser. |
| **WB-4** | « **pourquoi encore classe DPE dans bail** ?? » | Onglet « Finaliser » du wizard re-demande Classe DPE, Classe GES, Date DPE, Date diagnostic, Plomb, Amiante, Électricité, Gaz, Bruit, ERP, Société diagnostic. **TOUT est sur le bien**, le wizard ne devrait QUE l'afficher en lecture seule. |
| **WB-5** | Screenshots wizard Bail onglet « Le bien » : Description pièces (placeholder vide), Parties communes (placeholder vide), Locaux accessoires (placeholder vide), Chauffage checkboxes **TOUS DÉCOCHÉS**, Annexes (placeholder vide) | Tous ces champs devraient être **auto-remplis** depuis log + permettre override exceptionnel. Régression majeure de B2. |
| **WB-5b** | Capture user 2026-05-29 (après transition) : wizard Bail / onglet « Le bien » → tous les champs en **gris-saumon + vides** sauf Adresse / Surface / Étage (3 champs portés par log). Bandeau « Modifier le bien dans sa fiche » présent. | **Double régression critique** : la décision B2 a été appliquée à moitié (grisage UI + bandeau renvoi vers fiche bien) **MAIS** : (a) les champs `descriptionPieces / partiesCommunes / locauxAccessoires / chauffage / annexes` n'existent pas sur log → impossibles à remplir nulle part, (b) Le wizard n'auto-remplit donc rien d'autre que les 3 champs basiques. **Conséquence** : aucun bail PDF complet générable. **Phase 4 monte en P0 bloquant**. |

### Méta — règles violées dans la session précédente

| ID | Règle | Violations |
|---|---|---|
| **M-1** | `feedback_audits_par_agents.md` — tout livrable sensible DOIT passer par agent code-reviewer AVANT de dire au user « tu peux tester » | Violée 3 fois consécutives (v15.227, v15.228, v15.229). Corrigée par audit v15.230. |
| **M-2** | `feedback_modify_verify.md` — modifications + vérification (grep symboles + scope HTML/JS/CSS + sites collatéraux) avant de croire qu'une modif est appliquée | Violée → Bug A racine pendant 8 commits (CSS dans string JS au lieu de stylesheet). |
| **M-3** | `feedback_mockup_first.md` — mockup-first × 3 formats × tous artefacts post-clic AVANT toute ligne de code | À respecter strictement pour la refonte à venir. |
| **M-4** | Sweeping rename markers historiques (v15.229 → v15.230) | Anti-pattern (casse git blame). À ne plus reproduire. Audit agent l'a noté. |

## ✅ Décisions Phase B validées (mockup 2026-05-29) — source de vérité

Mockup validé : `mockups/MODALE-LOGEMENT-CONSOLIDATION/mockup.html` (3 vues × 3 formats). Le user a dit « ok on peut modifier… tu modifies ce qu'on vient de valider » → **scope = exactement ce mockup**, pas plus.

Modale Logement = **5 onglets** : 📋 Identité / 📐 Description / 🔧 Équipements / 🏷 Diagnostics / 📢 Présentation.

**Plan d'implémentation phasé** : [docs/superpowers/plans/2026-05-29-modale-logement-consolidation-phaseB.md](../superpowers/plans/2026-05-29-modale-logement-consolidation-phaseB.md) (8 phases B1→B8, sandbox-first + audit par phase). Ce plan **supersède** la « Plan d'attaque (5 phases) » ci-dessous, partiellement périmée (Phase 3 disait diagnostics sur fiche 360°, contredit par D-B2).

| ID | Décision | Détail technique |
|---|---|---|
| **D-B1** | **Bâti → immeuble** | `type d'habitat` / `période de construction` / `régime juridique` deviennent des propriétés de l'IMMEUBLE, hérités (lecture seule) dans la modale logement. `imm-periodeConstr` (idx.html:2692) et `imm-regimeJuridique` (:2704) existent ; **`imm-typeHabitat` à AJOUTER** (absent). Retirer `log-typeHabitat`/`log-regimeJuridique`/`log-periodeConstr` (:1938-1956) de la saisie. **Cas « pas d'immeuble lié »** (`log.imm` vide, maison autonome) → ces 3 champs redeviennent éditables sur le logement (fallback). |
| **D-B2** ⚠️ | **Diagnostics : édition DANS la modale, drop DDT 360° par-logement** | **REVIREMENT vs ML-4.** ML-4 disait « supprimer onglets DPE+Risques de la modale, rester sur fiche 360° ». Le user a changé d'avis : « il faut cliquer 10 fois… on le fait une fois et hop » → on fait l'INVERSE : 1 onglet « Diagnostics » groupé dans la MODALE (fill once), on **drop l'écran DDT 360° par-logement**. On GARDE le moteur (`_diagStatut`/`_diagDateExpiration`/`_ddtComplet`) + la **génération du récap DDT imprimable joint au bail** (loi 89-462 art. 3-3, sous peine de nullité). |
| **D-B3** | **Source unique `log.diagnostics`** | Collision active à résorber : `log.dpe` est **string** côté DDT (`_diagSave` idx:31913, `_diagGet` :31613-14, affichage :33807) MAIS **objet** `{classe,ges,date,…}` côté modale saveLog (:35267-70). Idem `log.etatRisques` (:35275). → tout fusionner dans `log.diagnostics[key]` + migration boot + retrocompat lecture. Migration L26966-26980 (backfill depuis bail) à réviser. |
| **D-B4** | **Conso énergie €/an avec le DPE** | Nouveau `log.dpe.depensesEnergie` (ou `log.diagnostics.dpe.depensesEnergie`). Migration depuis `bail.depensesEnergie` (idx:1646, BAIL-only aujourd'hui). Affiché dans onglet Diagnostics > Détail DPE. |
| **D-B5** | **Régime fiscal retiré du bail** | `b-fiscal` (idx:1473) = texte libre mort : lu seulement en affichage (:33858), aucun doc/clause/calcul (moteur fiscal réel = `legal-2044.js`, indépendant). Juridiquement non obligatoire. → supprimer champ + lectures/écritures (:13347, :14075, :15275) + mappings (:13976, :14273). |
| **D-B6** | **Jour de paiement par défaut = 5** | (au lieu de 1). `b-jpay`. |
| **D-B7** | **Équipements consolidés** | Onglet 🔧 Équipements regroupe chauffage + ECS + **cuisine/sanitaires/technologies/extérieurs** (aujourd'hui noyés dans Présentation). Clés conservées (`log.equipements.*`, `log.exterieurs`) → l'annonce continue de lire. Checkboxes + **zone d'ajout libre `customs[]`** (règle D1 gravée). |
| **D-B8** | **Annexes : 1 seul bloc structuré + checkboxes** | Fin du doublon « Locaux accessoires » + « Annexes privatives » (ML-3). Checkboxes (Cave/Grenier/Parking/Garage/Box/Buanderie/Cellier/Local vélos/Atelier) + champ n° d'identification + ajout libre `customs[]`. (Auto-report EDL = Phase 5, **HORS scope mockup validé**.) |
| **D-B9** | **Loyer/charges théoriques restaurés** | Onglet 📢 Présentation > section Conditions : `log.loyerHcRef` / `log.chargesRef` / `log.dgRef` + IRL réf + date dispo (réponse ML-1 « cas vacant à la création »). Repris comme défaut à la création du bail. **Modèle (B1-a re-tranchée 2026-05-29) : théorique alimenté PAR le bail (push), jamais lu en fallback `log.hc` (pull interdit).** Q1=a écriture à chaque enregistrement de bail (brouillon compris) ; Q2=b la révision IRL met aussi à jour le théorique ; Q3=a le bail écrase une valeur manuelle ; garde = ne pousser qu'une valeur non vide. Migration : laissés vides au boot. |
| **D-B10** | **Mise en valeur = champs structurés (sans IA)** | Présentation : exposition/vue/luminosité/calme/caractère + proximité (min) + services → alimentent le générateur d'annonce (banques de phrases + PRNG seedé, règle anti-mensonge). |
| **D-B11** | **Suivi expiration → Agenda** | Nouvelle source `cat:'DIAG'` dans `agendaAutoSync()` (idx:4926), rappels `[90,30,7]`, expiration calculée via `_diagDateExpiration()`. Bouton « ✓ Fait ». |
| **D-B12** | **Rappels dashboard → actions prioritaires EXISTANTES** | Diagnostics expirés = nouvel item `type:'diag'` (rouge) dans `_computeUnifiedTodo()` (idx:9844). **PAS de nouvelle carte** (consigne user « tu touches pas au dashboard »). Respecter principe anti-doublon Agenda↔À-traiter (:9895) : À-traiter = expirés (action requise) ; Agenda = à-venir. + rappel au login (pattern `_checkIRLRappelsAuLogin()`). |
| **D-B13** | **Wizard Bail 4→3 étapes** | Personnes (locataires **+ garants + tél/email**) / Conditions (DG auto, date fin auto, IRL auto, type bail hérité de `log.typeUsage`, jpay 5) / Récapitulatif (bien + diagnostics hérités, **lecture seule** via `_readLogForBail`/`_lbFill`). |

**HORS scope du mockup validé** (ne pas implémenter dans cette passe) : Phase 5 auto-report EDL · Bug B-A (immeuble hérité wrong) · Bug B-B (1ère connexion OAuth) · tout redesign du design system / autres pages.

## 🗺️ Plan d'attaque (5 phases, ~9-10 h)

### Phase 0 — Brainstorming + sujet doc + mockup-first (~3-4 h, **CETTE SESSION**)

**Étape 0.1 — Capture (déjà fait : ce document)**

**Étape 0.2 — Brainstorming décisions à arbitrer (~30 min, avec user)**

Questions à poser :
1. **Onglets cible de la modale Logement** — combien ? quels noms ? (proposition : Identité / Caractéristiques / Équipements / Conditions / Notes — soit 5 au lieu de 6)
2. **Suppression onglets DPE + Risques** : confirmé sur fiche 360° uniquement ? + ajout encart en lecture seule dans Identité de la modale (pour info au user qui modifie le bien) ?
3. **Restauration Loyer/Charges/DG/IRL théoriques** sur le bien : nouvel encart ou onglet dédié ?
4. **Régime fiscal** wizard Bail : supprimer ? Repenser comme dropdown enum ?
5. **Champs auto-remplis bail ← bien** : liste exhaustive + override autorisé ou bloqué (si bail signé : immutabilité légale → bloqué) ?
6. **Schéma DB** : `log.loyerHcRef` / `log.chargesRef` / `log.dgRef` / `log.irlRef` (noms distincts du legacy `log.hc/ch/dg/irl`) ?
7. **Annexes checkboxes** : liste exhaustive (Cave / Grenier / Jardin privatif / Parking / Garage / Box / Loggia / Buanderie / Local vélos / Terrasse / Atelier / Cellier / autres ?) + n° d'identification par item (ex : Parking n°4) ?
8. **Auto-report sur EDL** : déclencheur (à la création EDL ? au save logement ?) + UX (toast info « 5 annexes reportées sur l'EDL ») ?

**Étape 0.3 — Mockup-first (~2-3 h)**

`mockups/MODALE-LOGEMENT-CONSOLIDATION/mockup.html` standalone interactif :
- Modale Logement refondue avec nouveaux onglets × 3 formats PC/tablette/téléphone
- Encart Loyer théo + IRL réf
- Annexes en checkboxes + custom
- Wizard Bail allégé (champs auto-remplis affichés en lecture seule avec mention « hérité du bien »)
- Onglet Finaliser wizard : DPE/risques en lecture seule
- Popup confirmation auto-report EDL
- Tous artefacts post-clic
- **STOP user pour validation**

### Phase 1 — Bug B-B authentification première connexion (~30-60 min) — **P0**

Investigation OAuth GIS + token init + race condition SW. Fix + audit agent.

### Phase 2 — Schéma DB + champs théoriques + champs "bien" manquants (~1h30) — **P0 bloquant**

- Ajouter `log.loyerHcRef`, `log.chargesRef`, `log.dgRef`, `log.irlRef` (migration boot defensive si absent)
- **Ajouter les champs « bien » historiquement portés par bail mais absents de log** (cf WB-5b) :
  - `log.descriptionPieces` (entrée, séjour, chambres…)
  - `log.partiesCommunes` (cave, grenier, parking partagés…)
  - `log.locauxAccessoires` (cave n°12, parking n°4… — sera refondu en checkboxes Phase 3 mais migration immédiate)
  - `log.chauffageType` + `log.chauffageMode` (déjà sur log via LOG-ANNONCE ? à vérifier)
  - `log.annexes[]` (déjà sur log via LOG-ANNONCE ? à vérifier)
  - `log.equipementsNeuf` (si présent sur bail)
- Migration : si `log.hc` existe mais pas `log.loyerHcRef`, copier en théorique (à confirmer avec user)
- Migration : si un `bail.descriptionPieces` existe sur un bail signé, **ne pas écraser** ; pour bails non signés ou champs vides log, copier depuis bail courant le plus récent
- Audit agent obligatoire (toute migration schéma = sensible Drive sync)

### Phase 3 — Consolidation modale Logement (~2 h) — **P1**

- Suppression onglets DPE + Risques (passe par fiche 360° uniquement)
- Fusion équipements (cuisine + sanitaires + technologies + extérieurs depuis Présentation vers Équipements)
- Annexes en checkboxes structurées + customs (règle D1)
- Déduplication annexes (1 seul endroit)
- Présentation ne contient que mise en valeur + quartier (LOG-ANNONCE)
- Restauration encart loyer théo + IRL réf (onglet Identité ou onglet dédié selon mockup validé)
- Audit agent

### Phase 4 — Wizard Bail pré-rempli + lecture seule pour ce qui vient du bien (~3 h, **SENSIBLE PDF**) — **P0 bloquant** (cf WB-5b)

**Constat capture user 2026-05-29** : wizard Bail onglet « Le bien » affiche les champs `Type de location / Description pièces / Locaux accessoires / Parties communes / Nb pièces principales / chauffage / annexes` **grisés + vides**. Bandeau « Modifier le bien dans sa fiche » présent mais inutile car les champs n'existent pas sur log (cf Phase 2 qui doit les ajouter avant).

- Onglet « Le bien » : auto-remplir TOUS les champs depuis log (description pièces, parties communes, locaux accessoires, type usage, nb pièces, chauffage, annexes, équipements) via `_readLogForBail`
- Onglet « Conditions » : auto-remplir Loyer HC, Charges, DG, IRL depuis `log.loyerHcRef` etc.
- Onglet « Conditions » : auto-remplir Type de bail depuis `log.typeUsage`
- Onglet « Conditions » : évaluer suppression « Régime fiscal » (décision user)
- Onglet « Finaliser » : DPE / GES / risques en **lecture seule** (lus depuis log via `_readLogForBail`)
- **UX du grisage** : retirer le grisage visuel si champ correctement pré-rempli depuis log ; garder le grisage **uniquement** sur bail signé (immutabilité légale) ; sinon afficher en éditable normal avec petit pictogramme « 🏛 hérité du bien » + lien « Modifier sur la fiche du bien »
- **Immutabilité légale** : si bail signé (`bail.signatures.signedAt`), les valeurs sont figées via `bailSnapshot` (déjà implémenté F1/G2/H1/I1/I2). Pas de régression possible.
- Audit code-reviewer agent **OBLIGATOIRE** (PDF bail légal opposable)

### Phase 5 — Report équipements / annexes sur EDL (~1-2 h) — **P2**

- Au save logement : flag « EDL à mettre à jour » si annexes/équipements modifiés
- À la création / ouverture EDL d'entrée : popup « 5 annexes (Cave / 2 Parkings / Jardin / …) à reporter automatiquement sur cet EDL ? [Oui / Non] »
- Si Oui : crée les sections correspondantes dans l'EDL (1 page par annexe avec champs « État entrée » à cocher)
- Audit agent

## ⚠️ Discipline non-négociable pour cette refonte

1. **Audit `superpowers:code-reviewer` agent OBLIGATOIRE entre chaque commit** (règle gravée `feedback_audits_par_agents.md`)
2. **Mockup-first** AVANT toute ligne de code (règle `feedback_mockup_first.md`)
3. **Sandbox-first** : modif dans `index-test.html` d'abord, puis sync vers `index.html` après « OK » user (règle `feedback_sandbox_first.md`)
4. **Vérification scope** : avant d'ajouter du CSS, confirmer qu'il est dans `css/main.css` ou dans `<style>` du `<head>` réel, **pas** dans un template literal JS (apprentissage Bug A v15.221-230)
5. **No sweeping rename** des markers historiques (apprentissage v15.230)
6. **BACKLOG en temps réel** : mettre à jour BACKLOG.md immédiatement après chaque commit (règle `feedback_pilotage_realtime.md`)
7. **Bump versions 5 endroits** : title, em footer, ImmoTrack v label, IMMOTRACK_VERSION, sw.js CACHE_VER (+ `?v=` cache buster sur main.css si modifié)

## Notes utilisateur (verbatim)

> 2026-05-29 : « pourquoi il n'y a plus tous les équipements ? comment on fait pour gérer après ? on a enlevé bail du logement mais on peut peut etre garder un loyer et charges théorique non ? sinon quand il est vacant à a création on fait comment ? »
>
> 2026-05-29 : « pourquoi 2 endroits pour diagnostique and co ? pour moi supprimer l'onglet. on peut avoir des checks box plutot que d'écrire ? on peut reporter directement sur EDL comme ça. on n'oublie pas l'ajout manuel. pouruqoi les infos ne sont pas reprises automatiquement ? »
>
> 2026-05-29 : « annexe on se répéte »
>
> 2026-05-29 : « pourquoi type bail pas repris de logement si djà demandé dans logement ? régime fiscale utile ? gros décalage entre bail et logement ... et rien de repris !! pourquoi encore classe DPE dans bail ?? »
>
> 2026-05-29 : « première connexion à immotrack échoue, on doit se connecter 2 fois »
>
> 2026-05-29 : « on démarrerait pas une nouvelle session avec des règles qui sont suivis et tout ? »

## Journal

- **2026-05-29** : Sujet créé en transition de session. Toutes les remarques user 2026-05-29 captées exhaustivement (ML-1 à WB-5 + Bugs B-A B-B + méta M-1 à M-4). Plan 5 phases proposé. Prochaine session démarre par Phase 0 (brainstorming décisions + mockup-first).
- **2026-05-29 — Phase A hotfix livrée (v15.231)** : réparation chirurgicale des 2 régressions qui cassaient le bail après la consolidation modale Logement.
  - **CAUSE A** — `_syncLogToBail` écrasait inconditionnellement les financiers/dates/entité du bail avec des valeurs `log` souvent `undefined` (les inputs legacy ayant été retirés de la modale, décision C4). Fix : garde `if(log.X) bail.X = log.X` sur hc/ch/dg/debut/fin/entity → ne propage que les valeurs réellement présentes, ne reset plus à vide.
  - **CAUSE B** — wizard bail + 3 générateurs PDF (genPDFNative / previewBailData / genBailHTML) lisaient `bail.X` pour les champs **bien** (npp, piecesDesc, locauxPrivatifs, partiesCommunes, chauff, numFiscal, ecs) sans fallback → champs bien vides dans le PDF (capture #2 : financiers OK, champs bien vides). Fix : fallback `bail.X || _lbFill.X` où `_lbFill = _readLogForBail(bail,log)` SAUF bail signé (`_lbFill={}` → doc re-rendu byte-identique = immutabilité légale préservée).
  - **Périmètre** : openBail (~14075), genPDFNative (~15468), previewBailData (~16743), genBailHTML (~18774, hoist `_lbHtml`/`_lbFill` + reuse ADRESSE_BIEN). Propagé index.html ET index-test.html (vérif : 41 accès `_lbFill.X` identiques, 4 déclarations, 3 refs `_lbHtml`).
  - **Audit** : agent `superpowers:code-reviewer` → verdict SHIP (0 P0/P1), a confirmé l'immutabilité du bail signé préservée. 2 follow-ups P2 reportés (backfill baux archivés · faux-positif diff-highlight).
  - **Phase B** (refonte mockup-first complète des modales Logement/Bail/Immeuble) reste à faire — c'est le scope principal de ce sujet.
- **2026-05-29 — suite : ARCHI-DB-DOUBLONS Phase 4b COMPLÈTE livrée v15.232** (sujet voisin, cf [ARCHI-DB-DOUBLONS.md](ARCHI-DB-DOUBLONS.md)) : la **cause racine** des régressions Phase A (duplication bail↔bien + cache `_syncLogToBail`) est désormais **résorbée à la source**. Le logement est la source unique du bien ; le bloc « bien » de `_syncLogToBail` est supprimé (le hotfix CAUSE A reste pertinent pour les financiers/dates qui, eux, restent propagés avec garde). Les fallbacks CAUSE B `bail.X || _lbFill.X` sont conservés et complétés (annexes/equip/chauffage enrichis, 3 bugs d'affichage corrigés, immutabilité bail signé re-auditée). Ceci ne ferme PAS la Phase B (refonte UX mockup-first), qui reste le scope principal de ce sujet.
- **2026-05-29 — Phase B mockup VALIDÉ + décisions captées** : mockup `mockups/MODALE-LOGEMENT-CONSOLIDATION/mockup.html` itéré (modale 5 onglets, wizard 3 étapes, vue Agenda DIAG) puis validé par le user (« ok on peut modifier… tu modifies ce qu'on vient de valider »). 13 décisions D-B1→D-B13 figées (cf section « ✅ Décisions Phase B validées »). **Revirement notable D-B2** : contrairement à ML-4 (diagnostics sur fiche 360°), le user veut désormais les éditer DANS la modale (fill once) et drop l'écran DDT 360° par-logement — on garde le moteur de calcul + le récap imprimable joint au bail. Vue « dashboard » du mockup retirée sur consigne « tu touches pas au dashboard » : les diagnostics expirés alimentent les **actions prioritaires existantes** (`_computeUnifiedTodo`). Prochaine étape : plan d'implémentation phasé (writing-plans) puis exécution sandbox-first + audit code-reviewer par phase.
- **2026-06-01 — Phase B2 CODÉE SANDBOX (v15.234, `index-test.html` uniquement)** : un seul onglet « 🏷 Diagnostics » dans la modale Logement (tableau groupé, fill once), lecture/écriture sur `log.diagnostics` = **source canonique éditable unique**. Suppression des onglets DPE + Risques de la modale ET de l'écran DDT 360° par-logement. Moteur de calcul conservé intégralement (`_DIAGS_CATALOG_INLINE` + helpers `_diagStatut`/`_ddtComplet`/…) + récap imprimable DDT joint au bail conservé (`_ddtRecapOpen`).
  - **Architecture dérivation** : `log.dpe` (obj classe/ges/date/an/valConv/valEner) + `log.dpeDate` + `log.etatRisques` (strings erp/plomb/amiante/elec/gaz/bruit) deviennent des **projections déterministes** régénérées au commit par `_logDiagCommitToLog(log)` — car le bail légal les lit (`_readLogForBail` → `_lbFill.*`). **Immutabilité bail signé préservée** : le snapshot gelé `bail.signatures.bailSnapshot.log` n'est JAMAIS muté par B2 (B2 ne touche que le `log` vivant) ; la gate DDT à signature lit le canonique `log.diagnostics`.
  - **Modèle brouillon** `_logDiagDraft` (miroir de `_logModalMobilierDraft`) : respecte le bouton Annuler, commit uniquement dans saveParamLog. Deep-links DPE/Risques/DDT repointés vers `openLogModalOnTab(ref,'diag')`.
  - **Audit** : agent `superpowers:code-reviewer` → architecture saine, invariant légal respecté. 1 finding bloquant **B2-1** (filtre `hasData` traitait tout booléen `false` comme « pas de donnée » → `presence:false` Absence et `conforme:false` Anomalies sans date silencieusement perdus au save) → **corrigé** (seul `na:false` = défaut) + **test unitaire node 8/8 OK**. B2-2/B2-3 acceptables. Bug UX auto-détecté (ligne marquée N/A disparaissait) corrigé : partition par applicabilité intrinsèque `e.isApplicable(synth)`.
  - **PROD `index.html` + `sw.js` PAS encore touchés** (sandbox-first non négociable). EN ATTENTE TEST VISUEL user sur `index-test.html`. Reste ensuite : sync PROD + bump `sw.js` CACHE_VER, puis B8→B3→B4→B5→B6→B7.
- **2026-06-01 — Phase B2 v2 : refonte UX validée par mockup, découpée en 3 sous-phases** (mockup `mockups/MODALE-LOGEMENT-CONSOLIDATION/diagnostics-redesign.html`, **variante B « tableau clarifié »** choisie par le user). Décisions captées : (1) jargon clarifié (libellé clair + sigle technique + bulle d'aide « ? ») car le user ne connaissait pas « CREP » ; (2) bouton « Aperçu récap DDT » retiré (synthèse déjà dans le bail) ; (3) **upload documents-first** (zone de dépôt PDF EN HAUT pour attirer les dépôts) ; (4) **DPE auto-fetch ADEME** dès qu'un n° est détecté (pas de bouton dans le cas courant, bouton fallback pour PDF scannés) ; (5) **lecture PDF native** (regex via `pdfjsLib` déjà embarqué) → pré-remplissage « suggéré · à vérifier » ; (6) 2 pop-ups de garde : adresse DPE ≠ logement, données ADEME ≠ document. Faisabilité validée empiriquement sur 3 vrais documents (2 diagnostiqueurs) : n° DPE extractible (format national stable), classe DPE jamais dans le texte (image → ADEME obligatoire), 1 PDF = N diagnostics (bundle plomb+amiante+élec+DPE). API `data.ademe.fr/.../dpe03existant/lines` : gratuite, sans clé, CORS `*` confirmé → fetch navigateur direct, sans backend.
  - **Sous-phase B2 v2-a CODÉE SANDBOX (v15.235, `index-test.html` uniquement)** — UI pure, risque le plus faible :
    - **Libellés clarifiés** : nouvelle map UI-only `_DIAG_UI_META` (séparée du catalogue moteur `_DIAGS_CATALOG_INLINE` pour ne pas casser les 37 tests Vitest) → chaque diag = nom clair + chip sigle (ex « Plomb » + « CREP ») + bulle « ? » (tooltip CSS `:hover::after`) + ligne d'aide.
    - **Documents-first** : zone de dépôt PDF EN HAUT de l'onglet, réutilise `_renderAttachmentSection({parentType:'logement', parentId:log.id, category:'documents'})` (même bucket que la fiche 360°, liste unifiée). Logement neuf (sans id) → placeholder « enregistre d'abord ».
    - **Bouton « 📎 Aperçu récap DDT » retiré** (`_ddtRecapOpen` reste défini, encore utilisé par la modale `ov-ddt-recap` ailleurs).
    - Détail DPE (GES/conso/dépenses) déplacé en **sous-ligne** du tableau · lignes **colorées par statut** · CSS injecté une fois (`#logdiag-css`, namespacé `.logdiag-*`, transform cartes `@media(max-width:560px)`).
    - **Vérif** : 37 tests Vitest diagnostics OK · parse JS des 4 blocs `<script>` OK · **audit agent `superpowers:code-reviewer` → 0 BLOCKER** (projection bail `_logDiagCommitToLog` byte-identique confirmée, XSS escapé, chemin `log===null` OK, prod intacte). 3 warnings mineurs visuels (tooltip hover-only sur mobile → la ligne d'aide prend le relais ; clipping possible du tooltip dans le conteneur `overflow-x`).
    - **B2 v2-a VALIDÉ VISUELLEMENT** (2026-06-01, screenshot user : PDF bundle déposé apparaît bien dans « Documents de diagnostic (1) »). Le « rien ne s'affiche » initial = attente de pré-remplissage (= B2 v2-c, pas encore codé) — comportement normal.
  - **Sous-phase B2 v2-b CODÉE SANDBOX (v15.236, `index-test.html` uniquement)** — récup DPE ADEME, sensible :
    - **API** : open-data ADEME `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?qs=numero_dpe:"…"` — gratuite, **sans clé**, CORS `*`, fetch navigateur direct (pas de backend). Schéma + valeurs vérifiés en live (curl) avant de coder.
    - **UI** : sur la sous-ligne « 🌡 Détail DPE », champ **N° DPE ADEME** (`_logDiagSetField('dpe','numeroDpe',…)`, sans re-render) + bouton **« ⬇ Récupérer ADEME »** (`#logdiag-ademe-btn`, `_logDiagFetchAdeme()`).
    - **Mapping** : `etiquette_dpe`→classe énergie · `etiquette_ges`→classe GES · `conso_5_usages_par_m2_ep` (énergie **primaire** = figure du label DPE, pas `_ef`)→conso · `cout_total_5_usages`→dépenses (`« X € »`, le label porte déjà « (€/an) ») · `date_etablissement_dpe`→date réalisée.
    - **2 garde-fous** (confirm natif, jamais de blocage dur) : (1) **adresse** ADEME ≠ logement — `_logDiagResolvedLogAddress()` (override `log.adr` > héritée immeuble via `LogImmResolver`) vs `adresse_ban`, heuristique `_logDiagAddrMismatch` (CP différents OU recouvrement de mots < 0,34) ; (2) **données** ADEME ≠ saisie existante (liste des deltas champ par champ). Annuler ⇒ aucun écrasement.
    - **Robustesse** : HTTP≠200 / résultat vide / JSON KO / réseau KO tous catchés + toast ; bouton ré-activé (`finally` + garde `btn.isConnected` après re-render). `numeroDpe` persiste canonique (`log.diagnostics.dpe`) + round-trip réouverture (deep-clone init). Vérifié : **pas de CSP**, **SW `sw.js` passe-through cross-origin**.
    - **Vérif** : 37 tests Vitest OK · parse 4 blocs `<script>` OK · **audit agent `superpowers:code-reviewer` → 0 BLOCKER** (XSS escapé/whitelist A–G, bail signé immuable, popups corrects, robustesse réseau, mapping EP correct, persistance round-trip, prod intacte ; 1 suggestion format dépenses appliquée).
    - **B2 v2-b VALIDÉ VISUELLEMENT** (2026-06-01, « ok » user) → autorise B2 v2-c.
  - **Sous-phase B2 v2-c1 CODÉE SANDBOX (v15.237, `index-test.html` uniquement)** — lecture auto des PDF de diagnostic, fragile (sous-phase « cœur fiable ») :
    - **Décomposition** : c1 = cœur FIABLE (chargement pdfjs + extraction texte + **extraction N° DPE format strict** + ADEME auto + bandeau Détection indicatif) ; c2 (à décider après test c1) = extraction par-diagnostic fragile des dates/résultats avec badges « ✨ suggéré · à vérifier ». Respecte « pas de solution passable » : seul le N° DPE (format national strict, fiable) pilote une écriture de donnée ; la couverture par mots-clés est **purement informative, n'écrit JAMAIS de résultat de diagnostic**.
    - **pdfjs main-window** : `_ensurePdfjsLoaded()` charge `_BAIL_PDF_LIBS.pdfjs` (base64 inline → blob via Uint8Array byte-exact) dans la **fenêtre principale** (jamais chargé avant — seulement dans les child windows d'aperçu bail). Worker via `GlobalWorkerOptions.workerSrc` = blob URL **gardée vivante** (révoquer casserait pdfjs). Promesse de chargement mémorisée (`_pdfjsLoadPromise`) → 2 dépôts rapprochés ne chargent pas le script 2× (NB-1) ; oubliée en cas d'échec pour réessai.
    - **Extraction** : `_logDiagExtractPdfText(dataUrl)` (dataURL `_attachmentLoadBinary` → bytes → `pdfjsLib.getDocument` → `getTextContent`, plafonné ≤30 pages / 200 Ko mémoire). `_logDiagScanText(text)` : N° DPE via `/\b(\d{4}[A-Z]\d{7}[A-Z])\b/` (vérifié sur 12 n° réels) + couverture indicative par mots-clés sans accents (dpe/crep/amiante/elec/gaz/erp/termites/merule/bruit).
    - **Flux** : `_logDiagOnPdfUploaded(doc)` (fire-and-forget, try/catch) → si N° DPE trouvé **ET champ vide** → `D.dpe.numeroDpe = …` + re-render + **`_logDiagFetchAdeme()` automatique** (les 2 garde-fous B2v2-b s'appliquent). Si PDF sans texte (scanné/image) → toast « saisis le N° à la main ». **Bandeau « 🤖 Détection automatique »** (`_logDiagDetectBannerHtml`) en haut de l'onglet : N° DPE détecté + chips des diagnostics probablement couverts (filtrés aux docs encore présents, non supprimés).
    - **Hook** : gated dans `_handleAttachmentUpload` **sans dépendance DOM** (l'input peut être détaché après `_attachmentRefresh`) : `doc.mime==='application/pdf' && parentType==='logement' && category==='documents' && _logDiagDraft.logId===parentId`. `_logDiagDocScans` réinit dans `_logDiagInitDraft` (anti-fuite entre logements). CSS `.logdiag-detect*` injecté dans `_logDiagEnsureCSS`.
    - **Vérif** : 37 tests Vitest OK · parse 4 blocs `<script>` OK · **audit agent `superpowers:code-reviewer` → 0 BLOCKER** (pdfjs main-window correct + pas de collision `window.jspdf`/`pdfjsLib`, worker non révoqué, base64 byte-exact, dataURL strip OK, coverage jamais écrite dans `diag`, DPE auto-fill seulement si vide, pas de mutation bail signé, XSS escapé, fire-and-forget non bloquant, page cap mémoire, gate DOM-indépendant, anti-fuite d'état ; NB-1 race + NB-3 `console.warn` appliqués, NB-2/NB-4 sans effet).
    - **Fix v15.238 (2026-06-01, retour test user « ça ne fonctionne pas pour élec gaz et autre »)** : la couverture indicative ne détectait que le DPE. Cause : `_logDiagScanText` normalisait seulement les accents et matchait des **ancres multi-mots à espaces** (`'installation interieure d electricite'`), or pdf.js tokenise le texte de façon imprévisible (« d'électricité » peut sortir « d ' electricite », « inté rieure », sauts de ligne) → les ancres à espaces ne matchaient jamais. **Correctif** : normalisation **compacte** = `toLowerCase().normalize('NFD')` + retrait diacritiques + `replace(/[^a-z0-9]+/g,'')` (ponctuation, apostrophes droites/typo ET espaces retirés) ; ancres collées calquées sur les titres légaux (`installationinterieuredelectricite`, `installationinterieuredegaz`, `etatdesrisques`…). Insensible à la tokenisation. **Vérif** : test node 20 cas (titres réels majuscules/accents, apostrophes `'`/`'`, mots coupés par pdf.js, anti-faux-positif « chauffage gaz » d'un DPE ne coche pas gaz) → 20/20 ; 37 Vitest OK ; syntaxe OK ; **audit `superpowers:code-reviewer` → 0 BLOCKER** (compactage = bonne réponse structurelle, plage diacritiques U+0300–U+036F correcte, scope isolé, `merule`/`amiante` sans faux-positif, ERP/CREP non-bare donc pas de piège substring, ~4.5 ms sur cap 200 Ko, pas de ReDoS).
    - **B2 v2-c1 ✅ VALIDÉ VISUELLEMENT** (2026-06-01, screenshot user sur DDT combiné réel « plomb + amiante + élec + DPE ») : N° DPE `2568E1285086E` détecté → ADEME a rempli classe C / GES A / conso 155 / dépenses 1133 € / date 15/04/2025 / statut Valide ; bandeau « 🤖 Détection automatique » affiche correctement DPE · Plomb (CREP) · Amiante · Électricité (pas de Gaz car absent du PDF → fix élec/gaz v15.238 confirmé sur document réel, et pas de faux-positif gaz).
  - **2026-06-01 — Phase B2 v2-c2 : analyse empirique de faisabilité (verdict, scope à décider).** Déclencheur : retour user « pas de récupération » = il attend le **pré-remplissage des champs** date/résultat/cabinet de chaque diagnostic (c1 ne fait qu'un bandeau indicatif + DPE/ADEME). Analyse de 2 vrais cabinets (extractions `pdftotext -enc UTF-8`, encodage propre) :
    - **Cabinet 1 — DDT combiné « SL Diag-Conseils »** (plomb + amiante + élec + DPE) : possède une **page de synthèse** « Conclusion » (l.34-36) qui énonce le résultat en clair, **phrase unique** : « il n'a pas été repéré de revêtements contenant du plomb » (→ plomb absence) · « il n'a pas été repéré de matériaux et produits susceptibles de contenir de l'amiante » (→ amiante absence) · « L'installation intérieure d'électricité ne comporte aucune anomalie » (→ élec conforme). Footer cabinet récurrent (51×) « SL Diag-Conseils | … | N°SIREN : 817669286 ». Dates : « Date du repérage : 01/04/2025 » ET « Rapport du : 15/04/2025 » (deux dates).
    - **Cabinet 2 — ERP « Media Immo »** : structure totalement différente (en-tête « Réalisé en commande par Media Immo », « Date de réalisation 07/10/2025 », résultat = liste EXPOSÉ/NON EXPOSÉ ; en interne l'app n'a besoin que de « établi » + date).
    - **PIÈGE élec/gaz décisif** (l.2560) : le **formulaire à cases** « 5. Conclusion » contient les DEUX formulations (« ne comporte aucune anomalie. » ET « comporte une ou des anomalies. ») côte à côte ; pdf.js **perd la coche** → impossible de trancher depuis ce formulaire. ⇒ ne lire le résultat élec/gaz QUE depuis une formulation **non ambiguë** (page de synthèse à phrase unique), sinon laisser **vide**.
    - **Verdict fiabilité champ-par-champ** : Résultat élec/gaz = 🟢 bonne SI synthèse / ⚠️ refuser si formulaire à cases · Résultat plomb/amiante = 🟡 moyenne (conservateur) · Date = ⚠️ ambiguë (3 libellés selon cabinet) · Cabinet = 🟡 présent mais format propre à chaque cabinet · ERP = date suffit · DPE = ✅ déjà via ADEME (autoritaire).
    - **Design retenu (« pas de solution passable » → prudent, blank-on-doubt)** : pré-remplissage en **« ✨ suggéré · à vérifier »**, jamais committé sans confirmation user, **phrase source affichée** pour vérif en un coup d'œil ; remplir le RÉSULTAT uniquement sur formulation non ambiguë (refuser les formulaires à cases double-option). Phase **sensible** (DDT joint au bail, nullité art. 3-3) → **mockup-first + audit `superpowers:code-reviewer` obligatoires** avant tout « tu peux tester ».
    - **EN ATTENTE décision user** : scope c2 (prudent dates+cabinet+résultat-non-ambigu vs complet avec détection coche) puis mockup → plan → code → audit. Sync PROD (index.html + bump `sw.js` CACHE_VER) différée jusqu'à validation B2 v2 complète.
  - **2026-06-01 — Décisions user c2 captées** (mockup `mockups/MODALE-LOGEMENT-CONSOLIDATION/diagnostics-c2-suggere.html` validé) : scope **prudent** (date + cabinet + résultat non-ambigu, blank-on-doubt) · flux **« les deux »** (bandeau de revue global ✓ tout valider / ✗ tout effacer + ✓/✗ inline par champ) · résultat-auto **« oui comme au mockup »** (pré-rempli sur formulation non ambiguë) · à l'enregistrement les suggestions sont **enregistrées mais marquées ✨ « à vérifier »** (badge persiste dans le tableau via marqueur `_sg`).
  - **Sous-phase B2 v2-c2 CODÉE SANDBOX (v15.240, puis fix v15.241, `index-test.html` uniquement)** — moteur d'extraction « suggéré · à vérifier », **phase sensible (légale)** :
    - Moteur conservateur porté dans l'app (`_logDiagExtractSuggestions` / `_logDiagApplySuggestions`) : DATE libellé-ancrée (globale au DDT combiné) · CABINET (footer SIREN ou « réalisé par ») · RÉSULTAT plomb/amiante = ABSENCE seulement · élec/gaz conforme/anomalie via phrase **isolée** (garde bidirectionnelle `_logDiagHasStandalone` anti-formulaire à cases) · sinon **vide + note « à saisir »**.
    - UX : input ambre + badge ✨ + ✓ valider / ✗ effacer + phrase source repliable (par champ) ; bandeau de revue global. Marqueur persistant `_sg` (liste des champs non vérifiés) **ISOLÉ** : exclu de `hasData`, ignoré par la projection bail (`_logDiagDeriveRisqueString` → `etatRisques`/`dpe`), jamais porté du brouillon (redérivé au commit), absent du snapshot signé → n'atteint jamais le bail. Saisie/choix manuel = validation → retire le badge.
    - **Vérif moteur** : identité de sortie prouvée vs banc d'essai validé, sur DDT combiné réel SL Diag-Conseils → date 01/04/2025, cabinet SL Diag-Conseils, crep=abs, amiante=abs, elec=conf ; garde anti-formulaire OK dans les 2 sens. 37/37 Vitest.
    - **🛡 AUDIT `superpowers:code-reviewer` (obligatoire, phase légale)** → a trouvé 1 **BLOCKER** : suggestions appliquées à un diag **non applicable** (ex amiante/plomb sur bâti post-1997/1949, MASQUÉ du tableau) → fausse valeur « Absence » filait dans l'annexe DDT / le bail **sans badge ✨ visible**. **Corrigé v15.241** : (1) gate à l'application (filtre `coveredKeys` par `isApplicable === false`, aligné sur la partition du rendu ; `null`/contexte inconnu conservé car diag affiché) ; (2) auto-cicatrisation au rendu (efface valeur + badge d'une suggestion non validée devenue masquée après changement de contexte) — corrige aussi le décompte du bandeau (M1).
    - **🛡 RE-AUDIT** → **B1 CLOSED, M1 CLOSED, aucune régression** (16 assertions + test de fuite commit-path prouvant que la fausse « Absence » n'atteint plus l'annexe ; Vitest complet 1264/1264). Items LOW restants (acceptés) : L1 re-déposer un PDF peut re-proposer un champ effacé (action explicite) · L2 badge cabinet visuellement périmé jusqu'au prochain rendu (cosmétique).
    - **Fix v15.242 (2026-06-01, retour test user « les dates ne sont pas reprises »)** : le champ date restait vide sur le DDT réel (cabinet + résultat OK, date KO). Cause diagnostiquée **empiriquement** (pdfjs-dist installé en dev, extraction du texte EXACT vu en navigateur) : pdf.js **intercale une réf interne ENTRE le libellé et la date** (« Date du repérage : 25/RAPP/6363_p03 01/04/2025 ») et insère des espaces autour des séparateurs → le regex serré `\s*:?\s*` cassait (cabinet/résultats passaient car normalisation compacte). **Correctif** : normalisation des séparateurs espacés (`Tn`) + fenêtre « bruit » tolérante `[^\n]{0,40}?` (sans franchir un saut de ligne) avant la 1re date valide + ISO paddé robuste aux jours/mois 1 chiffre. Vérifié sur le texte pdf.js RÉEL (01/04/2025 → 2025-04-01 propagé crep/amiante/elec) + 6 sondes. **Audit `superpowers:code-reviewer`** → **0 BLOCKER** (correct + sûr à re-tester), mais 2 chemins de fausse date latents signalés : MEDIUM (date étrangère intercalée par un libellé concurrent type « Rapport du : 15/04/2025 ») + LOW (pas de validation calendaire → `39/19/2025` ⇒ « Invalid Date »).
    - **Durcissement v15.243 (2026-06-01, suite recommandations audit, avant toute promotion PROD — protège l'annexe légale)** : la fenêtre « bruit » est désormais **capturée** (groupe 1) → on **rejette** une date étrangère si un libellé concurrent (`rapport|édition|émission|facture|commande|devis`) la précède dans la fenêtre (MEDIUM), et on **valide la plage calendaire** (jour 1-31 / mois 1-12) avant d'accepter — date impossible ⇒ ignorée (LOW). Boucle `exec` globale par libellé : une date étrangère en tête ne bloque plus une date valide plus loin sous un autre libellé. **Vérif** : 12/12 sondes (réel toujours 2025-04-01 · MEDIUM rejetée · « étrangère puis valide » → bonne date · 39/19, 32/05, 12/13, 00/05 toutes rejetées) · 37/37 Vitest · parse JS OK.
    - **Date validée par le user** (« c'est bon ») → diagnostic du « ça ne fonctionne pas » : reproduction du **pipeline EXACT** (pdf.js embarqué décodé = `3.11.174` = lib de test ; caps 30 pages / 200 Ko reproduits ; mêmes regex) → la date `01/04/2025` EST extraite. Le « ne marche pas » initial = version en cache (sandbox network-first mais SW/onglet périmé possible). Code prouvé correct sur le vrai pipeline.
    - **🛡 AUDIT PRÉ-PROD `superpowers:code-reviewer` de B2 COMPLET (a+b+c1+c2)** → **0 BLOCKER** (snapshot signé jamais muté ; `_sg` isolé ; gate applicabilité cohérent apply↔render ; XSS échappé ; garde-fous ADEME ; extraction date robuste, pas de ReDoS). **Portable PROD côté code** (aucune réf test/démo/console.log parasite). **1 MEDIUM (M1)** : une valeur auto-suggérée NON validée (ex « Absence amiante ») était projetée dans `etatRisques` → annexe DDT du bail même sans revue user (l'annexe ne distinguait pas validé/suggéré). 2 LOW : L1 `31/02` roule via `new Date` ; L2 pas de cap binaire avant `atob`.
    - **Correctif v15.244 (option A choisie — la plus sûre juridiquement, art. 3-3)** : (M1) `_setRisque` dans `_logDiagCommitToLog` **retire de la projection annexe** tout résultat/date encore marqué `_sg` (non vérifié) — la valeur reste dans `log.diagnostics` (badge réaffiché) mais l'annexe légale n'affirme jamais un fait non vérifié ; validé (✓) → `_sg` vidé → projeté normalement. Partiel géré (result `_sg` + date validée → « Réalisé le … » sans affirmer le résultat). (L1) rejet des dates inexistantes qui roulent via round-trip `Date.UTC`. (L2) borne le binaire (>14 M chars ≈ 10,5 Mo) avant `atob`. **Vérif** : 11/11 assertions (L1 : 29/02 bissextile OK, 29/02 non-bis / 31/02 / 31/04 rejetées ; option A : non vérifié → non projeté, validé → projeté, partiels corrects, cabinet `_sg` sans effet) · réel toujours 01/04/2025 · 37/37 Vitest · parse JS OK.
    - **🛡 RE-AUDIT `code-reviewer` de la projection v15.244 (option A) → PASSÉ** : **0 BLOCKER / 0 HIGH / 0 MEDIUM atteignable**. Vérdict explicite « **safe to port to PROD index.html as-is, YES** ». Les 4 points critiques validés : (1) le strip empêche toute fuite d'un fait non vérifié dans l'annexe pour TOUTES les combinaisons atteignables (result seul / date seule / les deux ; `na:true` inatteignable car la suggestion ne pose jamais `na`) ; (2) `Object.assign({},info)` isole bien la copie (props primitives) → `log.diagnostics` garde presence/conforme/date + `_sg` intacts ; (3) snapshot signé jamais touché (`_setRisque` n'écrit que le `log` mutable ; `_readLogForBail` lit `bailSnapshot.log` à part) ; (4) L1 round-trip UTC correct (29/02 bissextile OK), L2 cap binaire 14 M chars ≈ 10,5 Mo + throw capté gracieusement (toast, doc reste attaché). **1 LOW** : le garde `if(s)` pourrait préserver une string annexe périmée SI un champ validé redevenait « ✨ à vérifier » — **non atteignable** via l'UI actuelle (`_logDiagApplySuggestions` ne pré-remplit que les champs vides). **Traité par commentaire verrouillant l'invariant** (le `delete` suggéré régresserait la préservation legacy voulue §4 ; documenté + condition d'ajout future).
    - **➡️ Sync PROD EN ATTENTE** : `index.html` a des **modifs non committées d'une session // (Chantier A NAV-FILTRE-ENTITE-GLOBAL v15.234)** → ne PAS écrire B2 par-dessus du travail non committé. Sync PROD (port a/b/c1/c2 index-test→index + bump `sw.js` CACHE_VER) à déclencher après nettoyage de l'état git d'index.html + OK user explicite (sandbox-first).
- **2026-06-01 — Phase B8 CODÉE SANDBOX (v15.245, `index-test.html` uniquement)** — Suivi expiration diagnostics : Agenda + actions prioritaires + rappel login (plan items **D-B11 + D-B12**). Réutilise intégralement les helpers moteur audités (`_DIAGS_CATALOG_INLINE`, `_diagDateExpiration`, `_estDiagApplicable`, `_diagGet` fallback DPE legacy, `_diagStatut`). **PAS de nouvelle carte dashboard** (consigne « tu touches pas au dashboard »).
  - **(D-B11) Agenda** : nouvelle catégorie `AGENDA_CATS.DIAG` (`📋`, teal `#0d9488`). Bloc dans `agendaAutoSync()` : boucle **séparée** sur TOUS les logements non archivés (pas gated par un bail, contrairement aux autres events) → pour chaque diag applicable avec date + expiration calculable, event `cat:'DIAG'`, `rappels:[90,30,7]`, `autoKey=DIAG:{ref}:{key}:{annéeExp}`. **Idempotent** (Set `existing` + autoKey). **Purge des périmés** : tout event `auto && cat==='DIAG'` dont l'autoKey n'est plus dans `validDiagKeys` (date changée, diag supprimé, devenu non-applicable/na) est retiré — scopé `cat:'DIAG'` uniquement (n'affecte pas les autres autos), et un event « ✓ Fait » (`done:true`) à clé encore valide est **conservé**. Diags permanents (amiante/mérule/bruit, CREP sans plomb) → `_diagDateExpiration` null → **aucun event** (pas de renouvellement légal). `agendaAutoSync()` désormais aussi appelé dans `saveParamLog` (sinon un diag fraîchement saisi n'aurait d'event qu'au prochain boot).
  - **(D-B12) Actions prioritaires** : section dans `_computeUnifiedTodo()` → un diag dont `_diagStatut === 'expire'` (et seulement « expire », pas « expirebientot ») devient un item `type:'diag'`, `severity:'red'`, `score:88`, action « Mettre à jour » → `openLogModalOnTab(ref,'diag')`. **Anti-doublon respecté** : À-traiter = expirés (action requise) ; à-venir = Agenda seul (un diag qui expire dans le futur génère un event Agenda mais N'apparaît PAS dans À-traiter).
  - **(D-B12) Rappel login** : `_checkDiagRappelsAuLogin()` (calqué sur `_checkIRLRappelsAuLogin`) — toast-only, anti-spam 1/jour via sessionStorage `diagRappelShown`, skip si `_appReadOnly`/modale Drive ouverte ; compte les logements non archivés ayant ≥1 diag `expire`. Hook post-connexion à 3200 ms (après le check IRL à 2500 ms).
  - **Vérif** : test node dédié **30/30 OK** (`C:/tmp/test-b8-diag-agenda.js` — helpers répliqués verbatim : expiration par type de diag, création+idempotence, purge sur changement de date/suppression, `done` préservé, anti-doublon expiré↔à-venir, exclusion na/non-applicable, décompte login, fallback DPE legacy `log.dpeDate`) · **1319/1319 Vitest** · parse JS (seul bloc#0 base64 échoue, bénin) · grep des 6 symboles câblés. **B8 NON listée phase sensible** (pas d'audit code-reviewer obligatoire) → EN ATTENTE TEST VISUEL user sur `index-test.html`. Reste : B3→B4→B5→B6→B7.
