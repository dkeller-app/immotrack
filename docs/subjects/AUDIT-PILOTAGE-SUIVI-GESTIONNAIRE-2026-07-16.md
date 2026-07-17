# AUDIT — Écosystème « Pilotage / Suivi / mode Gestionnaire »

**Date** : 2026-07-16 · **Base auditée** : worktree `C:/tmp/wt-visuel` sur `origin/main` (prod déployée, HEAD `e95972d`, `index.html` = 53 062 lignes inline)
**Périmètre** : les 4 recouvrements demandés (R1-R4) + écart « validé ↔ actuel » de la matrice Suivi comptable.
**Nature** : audit comparatif technique (déduplication). Aucune archi UI proposée (viendra en mockup).

⚠️ Le brief a été rédigé depuis le clone stale (`Desktop\Immo`, 582 commits de retard). Plusieurs noms/branchements qu'il cite sont **périmés** : ils sont signalés « brief FAUX sur origin/main » ci-dessous.

---

## Résumé exécutif

- **4 recouvrements sur 4 CONFIRMÉS** (dont 3 avec des nuances importantes vs le brief).
- **Le point le plus grave = R1 (matrice de conformité dupliquée)** : la matrice « Pilotage parc » du Dashboard Gestionnaire (`_renderDashV4Gestionnaire`) et la matrice « Suivi documents » du Pilotage (`_rPilDocs`) sont **deux implémentations séparées** qui, pour les colonnes communes (Bail, Assurance hab., Diagnostics), appliquent des **critères de verdict différents** → les deux écrans peuvent afficher un statut **contradictoire** pour le même lot le même jour.
- **R2 (le point dur) est à réécrire** : les deux « helpers de dette divergents » que le brief oppose (`_pilSoldeLocataire` ↔ `_calculerLoyerImpayeCumule`) **ne pilotent plus les surfaces qu'il croit**. `_pilSoldeLocataire` est **du code mort** (0 appelant) ; `_calculerLoyerImpayeCumule` n'alimente **pas** la modale Impayés (elle sert la restitution DG + un compteur KPI). Les vraies surfaces de dette convergent déjà sur un résolveur commun **`_getActiveBailHcChProrated`** (consolidation « SUIVI-LOYERS-SOURCE-UNIQUE », v15.408) — mais ce résolveur **n'est PAS `duMois()`** et **ne lit PAS `DB.loyerBareme`**.
- **Convergence vers `duMois()` : NULLE.** `duMois()` (js/core/loyer-du-mois.js) a **0 occurrence dans index.html**. Les writers alimentent bien `DB.loyerBareme` (étape 2 livrée) mais **aucune surface ne lit le barème** : elles passent toutes par `_getActiveBailHcChProrated` → `_loyerProrataMois` (bail.hc/ch + IRL, pas le barème).
- Il reste donc, côté « dette/paiement », **4 moteurs vivants** (`_computeLoyerStatut`, `_computeLoyerCumul`, `_v4ComputeLotStatus`, `_computeLoyerArrears`) partageant 1 résolveur de dû (`_getActiveBailHcChProrated`), **+ 2 helpers naïfs legacy** (`_pilSoldeLocataire` mort, `_calculerLoyerImpayeCumule` vivant), **+ 1 moteur cible non branché** (`duMois()`).
- **R3 & R4 confirmés** : 2 destinations distinctes pour « les impayés », 2 sélecteurs indépendants qui se chevauchent sémantiquement.
- **Partie 2** : la matrice Suivi comptable actuelle rend l'ossature validée (DG, cumul, mois, tri par solde) mais **diffère sur 3 points** : fenêtre **M-2..M+1** au lieu de **M-3..M**, « Solde » remplacé par une **pastille verdict** (plus de montant signé), et **bouton « Mettre à jour les loyers » retiré**. Le brief de refonte `PILOTAGE-ONGLET-REFONTE.md` (« onglet à revoir complètement », P3, 02/07) **n'existe pas sur origin/main** — il vit uniquement dans la lignée du clone stale (commit `e899044`, non-ancêtre de HEAD).

---

## R1 — Matrice de conformité dupliquée — **CONFIRMÉ (nuancé)**

Deux matrices par-lot coexistent, **implémentées séparément**, avec des jeux de colonnes qui se recoupent partiellement et une **logique de statut divergente sur les colonnes communes**.

**Matrice A — « Pilotage parc » (Dashboard mode Gestionnaire)**
`_renderDashV4Gestionnaire` — `index.html:10215` · lignes matrice `10265-10328` · en-tête `10497`
Colonnes : **Lot · Loyer · Bail · DPE · Ass. hab. · IRL · Quit. · État**.
Logique de statut **inline, ad hoc** (aucun helper partagé) :
```
// index.html:10279  Bail : basé sur l.debut / l.fin + tacite reconduction
const dotBail = !l.debut ? wn : (_echu ? (_tacite ? wn : ko) : ok);
// index.html:10282  MRH : simple présence
const hasMrh = l.locataire && DB.mrh && DB.mrh.some(m => m.logement === l.ref);
```

**Matrice B — « Suivi documents » (onglet Pilotage)**
`_rPilDocs` — `index.html:46168` · cellules via helper `_pilStatutDoc` (`index.html:45786`)
Colonnes : **Locataire · Bail · EDL · Ass. hab. · Chauffage · Caution · Diagnostics**.
```
// index.html:46184
const s = _pilStatutDoc(bail, log, t, today);
// _pilStatutDoc('bail') → OK ssi bail.signatures.bailleur && .locataire (index.html:45797)
// _pilStatutDoc('mrh')  → gère l'échéance + seuil <60j (index.html:45805-45814)
```

**Divergence de verdict sur les colonnes communes** (même concept, deux calculs) :
| Colonne commune | Matrice A (Gestionnaire) | Matrice B (`_pilStatutDoc`) |
|---|---|---|
| Bail | échéance `l.fin` + tacite reconduction (`10277-10281`) | signatures présentes (`45797`) |
| Ass. hab. | présence dans `DB.mrh` (`10282`) | présence **+ expiration <60j** (`45805`) |
| Diagnostics | `l.dpe` renseigné oui/non (`10284`) | `_ddtComplet()` complet/manquants (`45834`) |

**Verdict** : CONFIRMÉ — c'est bien deux implémentations de la même idée (grille de conformité par lot), **pas un simple copier-coller** : les colonnes ne coïncident qu'à moitié et les critères des colonnes partagées divergent.
**Impact utilisateur** : un même lot peut apparaître « Bail OK » sur le Dashboard (bail non échu) et « Bail Non signé » dans Pilotage (signatures manquantes) — deux surfaces « officielles » qui se contredisent. Toute évolution de règle (ex. gel DPE) doit être répercutée à deux endroits, avec risque de drift.

---

## R2 — Deux helpers de calcul de dette divergents — **CONFIRMÉ sur l'existence des 2 helpers, MAIS le branchement décrit par le brief est FAUX sur origin/main**

### Ce que le brief affirme (issu du clone stale)
- « `_pilSoldeLocataire` = colonne *Solde cumulé* du Suivi comptable »
- « `_calculerLoyerImpayeCumule` = modale Impayés »

### Réalité sur origin/main
- **`_pilSoldeLocataire` (`index.html:45750`) = CODE MORT.** 0 appelant (seule autre occurrence = le commentaire d'en-tête `45697`). La colonne « Cumul » du Suivi comptable est en réalité calculée par **`_pilCumulLocataire`** (`index.html:45894`) → **`_computeLoyerCumul`** (`js/core/loyer-statut.js:97`) → dû via `_getActiveBailHcChProrated`. Cf. `_pilGetFilteredRows` `index.html:45942` et le rendu `_rPilCompta` `index.html:46005-46030` (pastille `verdict`).
- **`_calculerLoyerImpayeCumule` (`index.html:27222`) NE pilote PAS la modale Impayés.** La modale « Suivi des loyers » `_impayesOpenVue` (`index.html:46425`) utilise **`_suiviLoyerStrip`** (`index.html:8807`) → `_computeLoyerStatut`. `_calculerLoyerImpayeCumule` sert seulement : (a) la restitution DG `_calculerSoldeDG` `index.html:27242`, (b) le compteur KPI de baux en impayé `_listerImpayesActifs` `index.html:27295` (consommé `index.html:48277`).

### Les divergences des 2 helpers naïfs (demandées précisément)
Même formule de fond (`nbMois × loyer plat − Σ encaissé`), trois divergences réelles :

**(i) Filtre catégorie loyer**
```
// _pilSoldeLocataire  index.html:45763-45766  → filtre catégorie loyer
m.qui === ref && m.cr > 0 && _isLoyerCategory(m.cat)
// _calculerLoyerImpayeCumule  index.html:27233  → AUCUN filtre catégorie (tout crédit)
m.qui === ref && (m.cr||0) > 0
```
→ `_calculerLoyerImpayeCumule` déduit **charges, régul, remboursements** comme s'ils payaient le loyer ⇒ sous-estime la dette.

**(ii) Fallback `log.hc/ch` vs `bail.hc/ch`**
```
// _pilSoldeLocataire  index.html:45760  → repli sur le logement
(Number(bail.hc)||Number(log?.hc)||0) + (Number(bail.ch)||Number(log?.ch)||0)
// _calculerLoyerImpayeCumule  index.html:27230  → bail seul, pas de repli
(Number(bail.hc)||0) + (Number(bail.ch)||0)
```
→ un bail à hc/ch vides (données legacy) donne un dû **0** dans `_calculerLoyerImpayeCumule`, non nul dans `_pilSoldeLocataire`.

**(iii) Clip à 0 + `finEffective`**
```
// _pilSoldeLocataire  index.html:45756-45767  → SIGNÉ (négatif = trop-perçu), fin = bail.fin (pas de finEffective)
const fin = bail.fin ? new Date(bail.fin+'T23:59:59') : null; ... return Math.round((attendu-encaisses)*100)/100;
// _calculerLoyerImpayeCumule  index.html:27226-27235  → clip Math.max(0,...), fin = finEffective ?? fin ?? today
const fin = bail.finEffective ? ... : bail.fin ? ... : today; ... return Math.max(0, attendu-encaisse);
```
→ `_calculerLoyerImpayeCumule` ne peut jamais montrer une avance (bornée à 0) et **clôt sur `finEffective`** ; `_pilSoldeLocataire` renvoie un solde signé et ignore `finEffective`.

### Convergence vers `duMois()` — **NON, aucune**
- `duMois()` = `js/core/loyer-du-mois.js:99`. **0 occurrence dans index.html** (`grep -c duMois index.html` → 0).
- Aucun des deux helpers, ni les moteurs vivants, n'appelle `duMois()` ni ne lit `DB.loyerBareme`. Le résolveur de dû partagé par toutes les surfaces vivantes est `_getActiveBailHcChProrated` (`index.html:12106`) → `_loyerProrataMois` (`index.html:4372`), qui lit `_loyerHCAtDate` (IRL) + `bail.hc/ch` (`index.html:4404-4407`) — **pas le barème**.
- Les writers du barème SONT branchés (`_baremeCloturer`, `_baremeSynchroniserPeriodeBail`, `_baremeAppliquerNouvellePeriode`, `_baremeRecordRevision` — ex. `index.html:10783, 19638, 24949, 46155`) : `DB.loyerBareme` se remplit, mais **personne ne le relit**. Conforme à la note mémoire « surfaces PAS rebranchées → 0 impact visible ».

**Verdict R2** : CONFIRMÉ que 2 helpers naïfs divergents subsistent, avec les 3 divergences ci-dessus. **INFIRMÉ** que ce sont eux qui pilotent Suivi comptable et la modale Impayés. **`duMois()` n'est branché nulle part.**
**Impact utilisateur** : le risque « deux chiffres de dette qui ne collent pas » vient aujourd'hui surtout de `_calculerLoyerImpayeCumule` (charges comptées comme loyer, pas de filtre catégorie) qui alimente la **restitution DG** et un **compteur d'impayés** différents du verdict des matrices/strip. `_pilSoldeLocataire` est inoffensif (mort) mais pollue la lecture du code.

---

## R3 — Deux destinations « suivi des loyers » — **CONFIRMÉ**

- **`_dashGoImpayes()`** — `index.html:10867` : `go('quittances')` puis force le filtre `quit-f-statut = 'impayée'` + `rQuit()`. → **destination : la page Quittances filtrée « impayée »**. Déclencheurs : hero Dashboard (`9362`, `13357`), hub Finances (`13149`, `49456`).
- **`_impayesOpenVue()`** — `index.html:46425` : ouvre la **modale `ov-impayes-vue`** (bande 12 mois par locataire, moteur `_suiviLoyerStrip`). Déclencheur : bouton **« 📅 Suivi des loyers »** de l'en-tête Pilotage (`index.html:695`).

**Verdict** : CONFIRMÉ — deux points d'entrée, deux surfaces différentes (une **page filtrée** vs une **modale mois-par-mois**) pour la même intention « voir qui ne paie pas ». Nuance vs brief : le libellé actuel du bouton Pilotage est « Suivi des loyers » (pas « Impayés actifs »).
**Impact utilisateur** : l'utilisateur qui clique « impayés » depuis Finances atterrit sur Quittances ; depuis Pilotage, sur une modale. Deux modèles mentaux pour le même besoin.

---

## R4 — Deux sélecteurs qui troublent l'utilisateur — **CONFIRMÉ**

**(i) Pills Premium ↔ Gestionnaire** — `_v4SetMode` `index.html:8346`, état `DB.params.dashV4Mode` (défaut **`premium`**, lu `index.html:8738`). Rendu des pills `index.html:8306-8314`, **uniquement sur le Tableau de bord** (`if (showMode)` `8308`, commentaire « dashboard only »). Le mode `solo` a été retiré des pills (commentaire `8306`) mais le **chemin `_renderDashV4Solo` subsiste** (`index.html:8742`, code mort atteignable seulement si `dashV4Mode==='solo'` en base).

**(ii) 4 sous-onglets de l'onglet Pilotage** — `_setPilotageTab` `index.html:45704`, onglets déclarés `index.html:700-703` : **Suivi comptable** (`_rPilCompta` `45978`) · **Suivi documents** (`_rPilDocs` `46168`) · **Automatisations** (`_rPilAutom` `46225`) · **Prélèvements** (stub statique, aucun renderer — `rPilotage` `45737-45740` ne le traite pas).

Les deux sélecteurs sont **indépendants** (états distincts : `DB.params.dashV4Mode` vs variable module `_pilotageTab` `45701`) et vivent sur **deux pages différentes** (`#p-dashboard` vs `#p-pilotage`).

**Premium affiche-t-il de la gestion par lot ?** — **OUI, CONFIRMÉ.** `_renderDashV4Premium` `index.html:9117` calcule les KPI d'occupation (`nbTotal/nbVacants/pctOcc` `9132-9134`) et, dans le drill hero `_DD['hero']` (`9221-9262`), une **table par lot Logement · Locataire · Attendu · Reçu · Statut de paiement** via un **4e moteur de paiement** `_v4ComputeLotStatus` (`index.html:8752`, qui route lui aussi vers `_getActiveBailHcChProrated`, cf. `9219`). Premium mélange donc bien financier **et** entview gestion par lot.

**Verdict** : CONFIRMÉ. **Impact utilisateur** : le libellé « Gestionnaire » (pill Dashboard) et l'onglet « Pilotage » recouvrent la même promesse (« piloter mes baux »), plus les infos de gestion présentes dans Premium → 3 surfaces de pilotage se chevauchent (exactement ce que note `PILOTAGE-ONGLET-REFONTE` : « 3 surfaces de pilotage = probablement 1 de trop »).

---

## PARTIE 2 — Écart « validé (PILOTAGE-MATRICIEL) ↔ actuel » — matrice Suivi comptable

Source validée : `docs/subjects/PILOTAGE-MATRICIEL.md` (Phase 2, ✅ v15.07). Implémentation actuelle : `_rPilCompta` `index.html:45978` + `_pilGetFilteredRows` `45921`.

| Élément validé (PILOTAGE-MATRICIEL Phase 2 / journal l.137) | Actuel (origin/main) | Verdict |
|---|---|---|
| Checkbox bulk select | Présent (`46033`) | ✅ conforme |
| Locataire + bien (cliquable → fiche 360) | Présent (`46034-46036`) **+ « suivi depuis MMM AAAA »** (`46009`) | ✅ conforme (enrichi) |
| DG versé / dû, couleur si incomplet | Présent (`46020-46024`), 3 états (suivi / manquant rouge / non-suivi gris) | ✅ conforme (enrichi) |
| **Solde cumulé** (montant signé, « −620€ » rouge) | Remplacé par **pastille verdict** avance/retard/à-jour (`46026-46030`), montant absolu, **borné au début du suivi** (fin du « −63 050 € » fantôme) | ⚠️ **DIVERGENT** : plus de solde signé continu ; moteur `_computeLoyerCumul` (pas `_pilSoldeLocataire`) |
| **N=4 colonnes mensuelles = M-3 … M** (journal l.137) | **4 colonnes M-2 … M+1** (`46012-46017` : `today.getMonth()+(i-2)`) — le mois **futur M+1** remplace le plus ancien M-3 | ⚠️ **DIVERGENT** (fenêtre décalée +1 pour matérialiser l'avance) |
| Cellules colorées vert/orange/rouge selon payé/partiel/impayé | Présent (`_pilCell` `45995-46003`), + états `avance`/`avenir`/`hors bail` | ✅ conforme (enrichi) |
| Tri par solde décroissant (retard en tête) | Présent (`_pilGetFilteredRows` `45969` : tri par `cum.cumul`) | ✅ conforme |
| Bouton primaire **« Mettre à jour les loyers »** (bulk IRL) | **RETIRÉ** (v15.21, HTML `696`, fonction `_pilOpenBulkMajIrl` `46069` @deprecated). En-tête = « 📅 Suivi des loyers » → modale | ⚠️ **DIVERGENT (volontaire, décision user)** |
| Helper `_pilSoldeLocataire` (Solde) | **Mort** ; remplacé par `_pilCumulLocataire`/`_computeLoyerCumul` | ⚠️ divergent (refactor consolidation) |

**Verdict de l'écart** : l'**ossature validée est présente** (checkbox, locataire, DG, cumul, mois colorés, tri). Le « on est loin » de l'utilisateur porte, factuellement, sur **3 différences** : (1) la fenêtre de mois **M-2..M+1** au lieu de **M-3..M** (on ne voit plus M-3, on voit un mois futur) ; (2) le **« Solde » chiffré signé** est devenu une **pastille verdict** sans montant cumulé continu ; (3) le **bouton bulk « Mettre à jour les loyers » a disparu**. Les changements (2) et (bornage du suivi) résultent de la consolidation SUIVI-LOYERS-SOURCE-UNIQUE (corrige le « −63 050 € » fantôme) — techniquement justifiés, mais ils **s'éloignent de la maquette Qalimo validée**. À faire re-trancher par l'utilisateur en session mockup.

**`PILOTAGE-ONGLET-REFONTE.md`** : **INTROUVABLE sur origin/main.** Il a été créé le 02/07 dans le commit `e899044` (« triage retours test user »), mais ce commit est sur la branche `main` **du clone stale** et **n'est pas ancêtre de HEAD** (`git merge-base --is-ancestor e899044 HEAD` → NO). Contenu récupéré (git show) : *« onglet Pilotage à revoir complètement (pas prio) »*, P3, mockup-first, lié à DASH-ACTIONS-REFONTE, note explicitement *« 3 surfaces de pilotage = probablement 1 de trop »*. La refonte P3 n'a jamais été faite. Sur origin/main, seuls `PILOTAGE-MATRICIEL.md` et `docs/PILOTAGE.md` (méta-guide) existent.

---

## Recommandation de consolidation (déduplication technique uniquement)

1. **Un seul résolveur de dû mensuel → `duMois()`.** Rebrancher `_getActiveBailHcChProrated` / `_loyerProrataMois` sur `duMois()` (js/core/loyer-du-mois.js) — c'est l'étape 3/4 du chantier BARÈME-LOYER déjà planifiée. Aujourd'hui `duMois()` a 0 lecteur ; tant qu'il n'est pas branché, le barème historisé (`DB.loyerBareme`) est écrit mais jamais lu. Cible : `_computeLoyerStatut`, `_computeLoyerCumul`, `_v4ComputeLotStatus`, `_computeLoyerArrears` prennent tous leur `dueOfMonth` de `duMois()`.

2. **Un seul calcul de dette locataire.** Supprimer `_pilSoldeLocataire` (mort, `index.html:45750`). Remplacer `_calculerLoyerImpayeCumule` (`index.html:27222`) par le moteur signé/borné (`_computeLoyerCumul` + `_loyerChipVerdict`) pour ses 2 clients réels — restitution DG (`_calculerSoldeDG` `27238`) et compteur KPI (`_listerImpayesActifs` `27288`) — afin qu'ils cessent de compter charges/régul comme du loyer et s'alignent sur le verdict des matrices.

3. **Une seule matrice de conformité documentaire.** Faire consommer à la matrice « Pilotage parc » du Dashboard Gestionnaire (`_renderDashV4Gestionnaire` `10265-10328`) le helper unique `_pilStatutDoc` (`45786`) au lieu de sa logique de dots inline, pour que Bail/Assurance/Diagnostics rendent le **même verdict** que l'onglet Pilotage. Décider ensuite quel écran garde quelles colonnes (le Dashboard ajoute Loyer/DPE/IRL/Quittance ; Pilotage ajoute EDL/Chauffage/Caution) — question de périmètre, à trancher en mockup.

4. **Un seul point d'entrée « suivi des loyers ».** Unifier `_dashGoImpayes()` (`10867`, → page Quittances filtrée) et `_impayesOpenVue()` (`46425`, → modale strip) vers une destination unique, pour que « voir les impayés » mène toujours au même écran quel que soit le point de départ (hero, hub Finances, Pilotage).

5. **Nettoyage mort/stub** : retirer le chemin `_renderDashV4Solo` (`8742`, plus atteignable par UI) et le sous-onglet « Prélèvements » (stub sans renderer, `703`) ou le documenter comme placeholder assumé.

---

## Symboles clés (pour la session de refonte)

**Résolveurs de dû / dette**
- `duMois()` — `js/core/loyer-du-mois.js:99` — **cible unique, 0 lecteur aujourd'hui**
- `_debutSuivi` / `_loyerArrearsPass` / `_computeLoyerNetting` — `loyer-du-mois.js:174 / 201 / 251`
- `_computeLoyerStatut` — `js/core/loyer-statut.js:30`
- `_computeLoyerCumul` — `js/core/loyer-statut.js:97`
- `_computeLoyerArrears` — `js/core/loyer-statut.js:190` (délègue à `_loyerArrearsPass`)
- `_loyerChipVerdict` — `js/core/loyer-statut.js:203`
- `_getActiveBailHcChProrated` — `index.html:12106` → `_loyerProrataMois` `index.html:4372` (**résolveur partagé vivant, ne lit pas le barème**)
- `_v4ComputeLotStatus` — `index.html:8752`
- `_suiviLoyerStrip` — `index.html:8807`
- `_pilCumulLocataire` — `index.html:45894`
- `_pilSoldeLocataire` — `index.html:45750` — **MORT (0 appelant)**
- `_calculerLoyerImpayeCumule` — `index.html:27222` (clients : `_calculerSoldeDG` `27238`, `_listerImpayesActifs` `27288`)

**Matrices / surfaces Pilotage**
- `_setPilotageTab` — `index.html:45704` · `rPilotage` — `45723`
- `_rPilCompta` (Suivi comptable) — `index.html:45978` · rangs `_pilGetFilteredRows` `45921`
- `_rPilDocs` (Suivi documents) — `index.html:46168` · `_pilStatutDoc` `45786`
- `_rPilAutom` (Automatisations) — `index.html:46225` · `_pilAutomGet` `46212`
- `_impayesOpenVue` (modale Suivi loyers) — `index.html:46425`

**Dashboard V4**
- `_v4SetMode` — `index.html:8346` (défaut lu `8738`) · pills `8306-8314`
- `_renderDashV4Premium` — `index.html:9117` (drill par lot `_DD['hero']` `9221-9262`)
- `_renderDashV4Gestionnaire` — `index.html:10215` (matrice `10265-10328`, en-tête `10497`)
- `_dashGoImpayes` — `index.html:10867`

**Barème (writers branchés, lecture absente)**
- `_baremeCloturer` / `_baremeSynchroniserPeriodeBail` / `_baremeAppliquerNouvellePeriode` / `_baremeRecordRevision` — ex. `index.html:10783, 19638, 24949, 46155` · module `js/core/loyer-bareme.js`

**Docs**
- Validé : `docs/subjects/PILOTAGE-MATRICIEL.md`
- Refonte P3 : `PILOTAGE-ONGLET-REFONTE.md` — **absent d'origin/main** (uniquement dans le clone stale, commit `e899044`)
