# MODALE-LOGEMENT-CONSOLIDATION — Refonte modale Logement + Wizard Bail + cohérence bail↔logement

**Status** : ⬜ À démarrer dans nouvelle session · **Prio** : P0 (UX cassée, retours user multiples) · **Taille** : XL (~9-10 h sur 5 phases)
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
