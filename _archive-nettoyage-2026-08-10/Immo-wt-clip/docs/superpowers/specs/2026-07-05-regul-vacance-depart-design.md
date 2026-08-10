# Design — Charges post-départ d'un locataire → bailleur (vacance dans la régul)

**Date** : 2026-07-05 · **Statut** : à valider par l'utilisateur avant implémentation
**Contexte** : test user (locataire RADELET / D-003) — l'écran clôture affiche « sortie 31/12/2031 » (le terme du bail) au lieu de la sortie réelle 01/07/2026, et facture le partant sur l'année pleine.

## 1. Problème (précis)

Quand un locataire **déclare** son départ, la date de sortie est posée sur `bail.depart.dateSortie`, **mais le bail n'est pas encore archivé** (`bail.fin` reste le terme du bail). Le moteur `computeRegul` ne connaît pas `bail.depart.dateSortie` → il facture le partant **jusqu'au terme du bail**, pas jusqu'à sa sortie → **sur-facturation**, et la période de vacance post-départ n'est pas mise à la charge du bailleur.

Un premier correctif (branche `feat/depart-clip-occ`) borne l'**occupation** de l'entrée régul à `dateSortie` (`clipBail(bail.debut, bailEnd)` avec `bailEnd = min(bail.fin, dateSortie)`). Il corrige l'**estimation** (assistant) et l'**affichage** (`entry.fin`), et est **invariant-safe** (audité : aucune charge perdue/doublée). **Mais** l'audit a montré qu'il ne suffit pas : l'**attribution des charges réelles** ne suit pas sur 2 des 3 chemins.

## 2. État actuel des 3 chemins d'attribution (`computeRegul`, ~25666-25769)

| Chemin | Où va la charge post-départ (logement vacant après) | Correct ? |
|---|---|---|
| **(1) Compteur collectif** (`m.compteurCcId`, 25673) | `_calcCcRepartition` → `_ccLogOccupations` → **`_getAllBailsForLog`** (11619). Ce dernier prend `fin = finEffective \|\| fin` (11628) — **ignore `depart.dateSortie`** → pas de segment de vacance post-départ → tout reste sur le partant | ❌ |
| **(2) Charge directe** (`m.qui`, 25735) | `target = candidates.find(date∈[debutOcc,finOcc]) \|\| candidates[0]` (25738). Charge datée après la sortie → **retombe sur `candidates[0]` = le partant** | ❌ |
| **(3) Immeuble sans compteur** (`m.imm`, 25744) | split `coeff = occDays / totalOcc` (temps d'occupation dans l'immeuble). `partBailleur = m.db − Σparts` = **~0** (car totalOcc somme à 100 %). Mono-occupant → **100 % sur le partant** ; multi → redistribué aux **autres occupants** (pas au bailleur) | ❌ |

Le mécanisme **`_bailleurAdd`** (part bailleur / vacance, 2044) et **`_nonRepAdd`** (charges non réparties = à corriger) existent déjà. Le chemin (1) SAIT router la vacance vers `_bailleurAdd` (`p.isBailleur`, 25697) — mais seulement si `_ccLogOccupations` produit un segment de vacance, ce qui n'arrive pas pour un départ déclaré-non-archivé.

## 3. Fix proposé par chemin

### Chemin (1) — compteur : router la vacance post-départ vers le bailleur
La racine est **`_getAllBailsForLog`** (11628) qui ne borne pas à `dateSortie`. Deux options :
- **(1a) DRY à la racine** : `fin: (b.depart&&b.depart.dateSortie && (!b.fin||b.depart.dateSortie<b.fin)) ? b.depart.dateSortie : (b.finEffective||b.fin||null)`. Propre et global → `_ccLogOccupations` crée alors le segment de vacance → `isBailleur` → `_bailleurAdd`. ⚠️ **`_getAllBailsForLog` a ~13 consommateurs** (loyers dus, vacance, occupation, suivi loyers…) → tous verraient le partant finir à `dateSortie`. C'est cohérent (il ne doit plus rien après sa sortie) **mais impose un ré-audit de chaque consommateur**.
- **(1b) Scoped régul** : ne toucher que le chemin régul (passer une option / un `_getAllBailsForLog` variant qui borne à `dateSortie`), sans impacter les autres écrans. Plus sûr, moins DRY.

### Chemin (2) — charge directe : hors occupation → bailleur (pas `candidates[0]`)
`if(!target)` (charge datée hors de toute occupation candidate) → `_bailleurAdd(imm, {…, motif:'Charge postérieure au départ / logement vacant'})` au lieu de `candidates[0]`. Local, invariant-safe.

### Chemin (3) — immeuble prorata : introduire la vacance par logement
C'est le plus délicat. Aujourd'hui le split est **par temps d'occupation dans l'immeuble** (`occDays/totalOcc`), sans notion de vacance par logement. Deux niveaux :
- **(3a) Correction minimale (mono/partiel)** : borner la part de chaque logement à sa **fraction occupée de la fenêtre** — `coeff = occDays / totalDays` (dénominateur = durée de l'exercice, pas Σoccupations) — et router le **reste (vacance)** vers `_bailleurAdd`. Corrige le cas RADELET (mono-occupant partant : 182/365 → bailleur pour le reste). ⚠️ **Change les chiffres de TOUT logement partiellement occupé** (pas que les départs) : aujourd'hui un logement occupé 6 mois porte 100 % de sa part ; après, 50 % + 50 % bailleur. C'est plus juste, mais c'est un **changement de modèle**.
- **(3b) Statu quo path 3** : ne rien changer à path 3 (accepter que les charges immeuble-sans-compteur d'un mono-occupant partant restent sur lui). Moins correct mais zéro régression sur les autres logements.

## 4. Décisions à valider (utilisateur)

1. **Chemin 1** : (1a) DRY dans `_getAllBailsForLog` (+ ré-audit des ~13 consommateurs) ou (1b) scoped régul (plus sûr) ?
2. **Chemin 3** : (3a) refonte du split (temps → fraction fenêtre + vacance bailleur, change tous les logements partiellement occupés) ou (3b) statu quo (on ne corrige que compteur + direct) ?
3. **Le clip `computeRegul`** (déjà codé) : on le garde (il fixe l'estimation + l'affichage + prépare le terrain) ? Oui recommandé, **mais** il ne doit pas être déployé seul (incohérence en-tête « sortie 01/07 » vs charges de novembre) → à livrer avec les fixes attribution.
4. **Régression acompte à corriger** (introduite par le clip) : l'acompte daté après la sortie tombe hors `[debutOcc,finOcc]` → borner l'acompte à la fenêtre exercice pour l'entrée active (`_accTo = entry.isHistorique ? finOcc : window._regulTo`). **Obligatoire** avant tout déploiement du clip.

## 5. Invariant & tests
- **Invariant** : `Σ(charges locataires) + Σ(_bailleurAdd) + Σ(_nonRepAdd) == Σ(charges récupérables de la période)` — à vérifier au runtime sur chaque scénario.
- **Scénarios de test** : (a) partant mono-occupant, logement vacant après → part post-départ au bailleur ; (b) rotation (successeur) → split partant/successeur, pas de bailleur ; (c) sans départ → inchangé (non-régression) ; (d) charge directe post-départ → bailleur ; (e) compteur eau post-départ → bailleur ; (f) acompte daté post-sortie → bien crédité.
- **Audit `code-reviewer` obligatoire** (cœur fiscal) après implémentation.

## 6. Recommandation
- Chemin 1 : **(1b) scoped** d'abord (sûr), (1a) DRY plus tard si on veut la cohérence globale.
- Chemin 3 : **(3a)** si on veut la correction complète (c'est le cas RADELET), en assumant le changement de modèle + tests + audit. Sinon (3b) et on documente la limite.
- Garder le clip + corriger la régression acompte (#4) impérativement.

---

## 7. MODÈLE CIBLE VALIDÉ (post-investigation de fond, 2026-07-05)

### Décisions utilisateur
- Chemin compteur + entrées/sorties → **vrai travail** (pas un patch) : refonte du modèle d'occupation.
- Chemin immeuble sans compteur (copro) → **corriger la vacance** (fraction vacante au bailleur).
- L'investigation confirme : **NE PAS toucher `_getAllBailsForLog` à la racine** — 13 de ses 14 consommateurs veulent la fin CONTRACTUELLE (loyer attendu, timelines, occupation, split fiscal) ; seul le site régul (`_ccLogOccupations`, #13) doit refléter `dateSortie`. Le clip vit dans une couche **dédiée régul**.

### Cœur du diagnostic (« le brouillon »)
Les 3 chemins d'attribution n'utilisent PAS le même modèle d'occupation :
- **Compteur** : segments via `_ccLogOccupations`→`_getAllBailsForLog` (**ignore `dateSortie`**), MAIS gère la vacance→bailleur (`isBailleur`).
- **Direct** & **immeuble-prorata** : entrées `res` (clippées à `dateSortie` par le DEPART-CLIP), MAIS **aucune** vacance→bailleur.
→ deux vérités d'occupation dans `computeRegul` ; la vacance n'est gérée que par le compteur ; `partBailleur`/`totalNonImpute` calculés puis **jetés**.

### Cible : source d'occupation UNIQUE
**`_logOccupationSegments(ref, from, to)`** (fonction pure, testée) = généralisation de `_ccLogOccupations` + le clip `dateSortie`. Renvoie des segments couvrant `[from,to]` **sans trou ni chevauchement**, `Σ occDays == totalDays` :
```
[ {kind:'locataire', ref, from, to, occDays, loc, hc, ch},
  {kind:'vacant',    ref, from, to, occDays}   // → bailleur
  … ]
```
Règle de fin unique par bail : `finEff = dateSortie (si déclaré & < fin) sinon finEffective sinon fin` — réintroduite DANS ce helper (pas dans `_getAllBailsForLog`, réutilisé en amont = DRY).

Les 3 chemins consomment ce helper à l'identique :
- **Compteur** : `_calcCcRepartition` appelle `_logOccupationSegments` (au lieu de `_ccLogOccupations`) → le partant est enfin clippé + vacance post-sortie→bailleur.
- **Direct** : segment contenant `m.date` → `locataire` = ce locataire ; `vacant` → `_bailleurAdd`. **Supprimer le `|| candidates[0]`** qui réimpute au partant.
- **Immeuble sans compteur** : le traiter comme « compteur sans relevé » = clé de répartition (`proportionnel` 1/N par défaut, ou `surface`/`tantiemes`) × segments d'occupation ; segments `vacant`→bailleur ; **dénominateur = fenêtre (totalDays), plus `totalOcc`** → la fraction vacante retombe au bailleur.
→ chemins 1 et 3 deviennent la MÊME opération (clé × segments) ; le direct en est le cas à 1 logement.

### Invariant (à enforcer, par mouvement)
`Σ parts locataires + Σ part bailleur + Σ non-réparti == m.db` (±0,01). Reliquat → `_nonRepAdd`. Assertion de test sur chaque mouvement de charge.

### Impact fiscal à présenter
La refonte réattribue de la charge locataire → bailleur ⇒ **ligne 225 du 2044 (« charges récupérables non récupérées ») augmente, charge locataire baisse**. Impact réel → **diff avant/après sur données réelles + audit `code-reviewer`** (2044 + immutabilité des baux signés).

### Découpe livrable/auditable (sandbox-first `index-test.html`)
1. **Extraire `_logOccupationSegments`** (pur, testé) ; câbler d'abord SEULEMENT dans `_ccLogOccupations` (prouver l'équivalence + corriger le compteur du partant). Tests : entrée en cours d'année, sortie déclarée non archivée, rotation+vacance, mono-occupant partiel, aucun bail.
2. **Chemin direct** routé par segments (vacant→bailleur, suppression `|| candidates[0]`) + invariant.
3. **Chemin immeuble refondu** (clé × segments, dénominateur=fenêtre) — étape fiscalement sensible → **diff avant/après + audit dédié** (ligne 225).
4. **Invariant global** `Σ==m.db` enforced sur les 3 chemins + tests de régression + audit final.
5. *(optionnel, séparé)* réconcilier l'affichage fiche (`_bienActiveBail`) pour qu'un départ déclaré passé lise « vacant ».

Chaque étape : sandbox `index-test.html` → validation user → prod. Audit `code-reviewer` obligatoire aux étapes 3 et 4 (fiscal).

---

## 8. ÉTAT DE LIVRAISON (2026-07-11)

### ✅ Phase 1 LIVRÉE — module pur `logOccupationSegments` (TDD)
- **`js/core/occupation-segments.js`** (créé dans le clone `Desktop/Immo`, non commité) : `logOccupationSegments(bails, from, to)` + `finEffOccupation(bail)`.
  - Segments locataire/vacant sans trou ni chevauchement ; règle de fin `dateSortie→finEffective→fin` ; invariant `Σ occDays==totalDays` ; UTC (pas de décalage/DST).
- **`__tests__/helpers/occupation-segments.test.js`** : 10 tests (départ déclaré clippé, rotation ±trou, entrée en cours d'année, aucun bail, non-régression bail plein, règle de fin). **Tous verts.** Suite complète **1648 tests OK** (rien cassé).
- Fichiers **base-indépendants** (neufs), portables vers le worktree de livraison.

### Pattern de câblage (Phase 2) — confirmé en lisant index.html
Logique pure `js/core/X.js` → exposée à `window` via `js/main.js` → **réplique inline (shadow)** dans `index.html` pour le fallback `file://` (duplication assumée : cf. `rename-logement.js`, `legal-2044.js`, `group-by-imm.js`). Donc Phase 2 = :
1. `js/main.js` : `window.logOccupationSegments = …` + shadow inline dans index.html.
2. `_ccLogOccupations` (index.html ~34548) → devient un wrapper : construit `bails` (avec `dateSortie`) puis appelle `logOccupationSegments`. **Prouver l'équivalence** hors départ + corriger le partant.
3. Chemins directe / immeuble (computeRegul) → consomment les mêmes segments.
4. Invariant `Σ==m.db` + **audit `code-reviewer`** (fiscal 2044 l.225) + diff avant/après sur données réelles (RADELET).

⚠️ **Infra worktree** : les worktrees n'ont pas `node_modules` (seul `Desktop/Immo` l'a). Pour lancer Vitest sur le worktree de livraison → jonction/copie de `node_modules`, ou lancer les gates depuis le clone principal.

### ✅ Phase 2 CÂBLÉE + AUDITÉE (worktree `Immo-wt-regcalc`, off origin/main)
Les 4 chemins de `computeRegul` branchés sur le modèle occupation :
1. **Bail courant** clippé à `_finEffOccupation` (sortie déclarée) — pas au terme.
2. **Compteur** via `_ccLogOccupations`→`_logOccupationSegments` (shadow inline = module pur, 16 tests).
3. **Charge directe** hors occupation → `_bailleurAdd` (plus `candidates[0]`).
4. **Immeuble sans compteur** : dénominateur `N logements × fenêtre` (parts égales × occupation) ; fraction vacante → `_bailleurAdd`. Réconciliation exacte `totalLoc + partBailleur == m.db`.

**Audit `code-reviewer` (adversarial) : PASSANT** — aucun bug reproductible sur/sous-facturant à l'euro ; non-régression bit-à-bit confirmée quand tout est occupé (denom = ancien totalOcc) ; mono-occupant partant 100 %→prorata OK ; rotation = 1/N total ; logement 100 % vacant compté dans N → bailleur.

**2 correctifs IMPORTANT appliqués** :
- **#1** `_ccLogOccupations` lit désormais `dateSortie` top-level OU `depart.dateSortie` (aligné sur `_finEffOccupation`) → plus de SPOF silencieux sur eau/chauffage. Verrou : 6 tests contrat `finEffOccupation`.
- **#2** chemin compteur : reste d'arrondi réconcilié sur le bailleur → invariant `Σ == m.db` AU CENTIME (avant : dérive ~0,005×nbParts).

**Edge cases documentés (NON bloquants)** :
- #3 immeuble : +0,01 € possible si l'arrondi pousse `totalLoc > m.db` (`partBailleur` négatif jeté) — **= comportement ancien**, borné 1 cent.
- #4 `dateSortie ≥ terme` (locataire resté au-delà du terme, `fin` non avancé) → clip au terme, queue → bailleur = **sous-facture le locataire**. Dépend de si l'app avance `bail.fin` à la reconduction. Le spec suppose `dateSortie < terme`.
- #5 ✅ **TRANCHÉ par l'user (« on annualise TOUT et on proratise à la présence »)** : le chemin **charge directe** est passé du point-date au **même modèle annualisé-prorata** que compteur/immeuble (chaque occupant paie `occDays/totalDays × m.db`, fraction vacante du logement → bailleur, reste réconcilié). Les 3 chemins récurrents sont désormais **uniformes**. Non-régression : logement occupé toute l'année → 100 % à l'occupant (coeff=1). ⚠️ Ce chemin suit le pattern immeuble déjà audité SÛR — mais **à repasser dans l'audit du diff complet avant push**.
- #6 chevauchement de baux d'un même ref (donnée corrompue) → `Σ occDays > totalDays` → sur-facture ce logement. Préexistant, non couvert par la segmentation anti-chevauchement.

### ✅ Re-audit #2 (post-uniformisation directe) — 2 défauts trouvés + CORRIGÉS
- **I-1 (bug fidélité)** : chemins **directe ET immeuble** ne réconciliaient que le reste d'arrondi POSITIF (`> 0.005`) → quand l'arrondi dépasse (reste négatif, logement plein-occupé), il était jeté → **locataire sur-facturé 1-2 centimes, invariant cassé**. Le compteur, lui, corrigeait déjà les deux signes. **Corrigé** : garde `Math.abs(reste) >= 0.01` + reste négatif repris sur le bailleur, sur les DEUX chemins. **Prouvé Node** : balayage 0,01→1000 € × {3,5} occupants → **0 violation** (avant : 24,9 % / 40 %).
- **I-2** : chemin compteur, si `_calcCcRepartition` ne répartit rien (périmètre vide, clé/tantièmes à 0), ma réconciliation Fix #2 envoyait TOUTE la facture au bailleur (motif « arrondi ») sans gater la validation. **Corrigé** : si `repart.totaux.totalNonImpute` matériel → `_nonRepAdd` (bloque la validation via `hasTrou`) ; sinon résidu d'arrondi → bailleur.
- **Note transverse (non bloquant, préexistant)** : 2 moteurs d'occupation — compteur via `_logOccupationSegments` (UTC, curseur anti-chevauchement) ; directe/immeuble via le pool `res`/`clipBail` (heure locale, clips indépendants). Coïncident sur données propres (Jan-Déc, baux non chevauchants). Divergent si baux du même logement se chevauchent (donnée corrompue → sur-facture) ou bascule DST. Unification réelle = faire consommer `_logOccupationSegments` au pool (chantier séparé).

### Reste avant déploiement
- Consolider les fichiers modules (`js/core/occupation-segments.js`, `charge-exercice.js`) + expose `js/main.js` DANS `Immo-wt-regcalc` (aujourd'hui dans `Desktop/Immo`).
- Trancher #5 (directe prorata ou point-date).
- Bump version + **smoke test user sur RADELET dans l'app déployée** (avant/après réel) + gates 2044.

### ✅ Phase 2a LIVRÉE — câblage chemin COMPTEUR (worktree `Immo-wt-regcalc`, base 7628195 = 3 derrière origin/main)
- `js/main.js`/inline shadow : `_logOccupationSegments` + `_finEffOccupation` répliqués inline dans index.html (~35000), MÊME logique que le module pur.
- `_ccLogOccupations` (index.html ~35045) = **wrapper** : `_getAllBailsForLog` + injection `dateSortie` sur le bail COURANT (via `_findBailByRefTolerant`, sans toucher `_getAllBailsForLog`) → délègue à `_logOccupationSegments`.
- Vérifié Node (harness) : RADELET partant **100 % → 49,6 %** (prorata 181/365) + vacance→bailleur ; non-régression bail plein = 365 ; rotation OK ; invariant Σ==totalDays OK. Syntaxe `node --check` OK. `_calcCcRepartition` consomme déjà `montant × occDays/totalDays` = prorata annuel confirmé.
- `charge-exercice.js` : module pur prêt, **PAS encore câblé** dans computeRegul.

### ⏭️ Phase 2b À FAIRE — chemins DIRECTE + IMMEUBLE (le « pool » de computeRegul)
Les entrées `res` du pool (computeRegul ~26015) clippent le bail courant sur `bail.fin` (terme), PAS sur `depart.dateSortie` → même bug, côté directe/immeuble. Fix :
1. **Pool** (~26015) : `clipBail(bail.debut, _finEffOccupation(bail))` au lieu de `clipBail(bail.debut, bail.fin)` ; `fin: (_finEffOccupation(bail))||''`. (⚠ exposer `_finEffOccupation` avant computeRegul, ou le dupliquer.)
2. **Directe** (~26173) : `if(!target)` → `_bailleurAdd` au lieu de `|| candidates[0]`.
3. **Immeuble** (~26192) : `coeff = e.occDays / totalDays` (au lieu de `/ totalOcc`) + router le reste `(1−Σcoeff)×montant` vers `_bailleurAdd`. **FISCALEMENT SENSIBLE** : change tout logement partiellement occupé (pas que les départs) → **avant/après sur données réelles + audit code-reviewer obligatoire**.
4. Câbler `chargeExerciceShare` (rattachement période) dans le filtre `m.date>=from&&m.date<=to` de computeRegul.
5. Invariant `Σ==m.db` + audit final. Navigateur requis pour l'avant/après réel (indispo au moment du checkpoint).

### ✅ Phase 2 LIVRÉE — chemin COMPTEUR câblé (worktree `Immo-wt-regul`, base origin/main d32b345)
- `_getAllBailsForLog` (index.html ~11673) expose `dateSortie` (additif ; les 13 consommateurs l'ignorent).
- `_ccLogOccupations` (~34605) = **wrapper** sur réplique inline `_logOccupationSegments` + `_finEffOccupation` (copie verbatim du module testé).
- **Prouvé** : 16 tests verts (10 module + 6 **équivalence** nouveau≡ancien hors départ) ; runtime dans la vraie app → départ `181 loc + 184 bailleur`, bail plein `365` (non-régression) ; **0 nouvelle régression** (3 échecs pré-existants sur origin/main : bank-import + 2 legal-2044 → task `task_db574d14`).
- Non commité (worktree). `node_modules` = jonction depuis Desktop/Immo.

### Phase 3-4 — À FAIRE (chemins directe + immeuble) — cœur fiscal, large rayon
Découverte : `computeRegul` (index.html ~25609) bâtit ses entries avec **`clipBail(bail.debut, bail.fin)`** → **jusqu'au TERME, pas à `dateSortie`**. Donc :
1. **Clip des entries à la sortie réelle** : `clipBail(bail.debut, _finEffOccupation(bail))` (courant ~25636 + historique ~25648). ⚠️ RAYON : impacte provisions (~25674), estimation `_rgClotureCompute`, clôture, direct, immeuble.
2. **Chemin directe** (~25778/25797) : `candidates.find(m.date∈[debutOcc,finOcc]) || candidates[0]` → si aucun candidat ne contient `m.date` → **`_bailleurAdd`** (vacance), supprimer le fallback `candidates[0]`.
3. **Chemin immeuble** (~25810-25820) : `coeff = e.occDays / totalOcc` → **`/ totalDays`** (fenêtre) + router la fraction vacante restante vers `_bailleurAdd`.
4. **Régression acompte** (introduite par le clip) : acompte daté après la sortie tombe hors `[debutOcc,finOcc]` → borner `_accTo = entry.isHistorique ? finOcc : window._regulTo`.
5. **Invariant** `Σ loc + Σ bailleur + Σ nonRep == m.db` par mouvement.
6. **Gates** : Vitest + runtime + **diff avant/après sur données réelles (RADELET)** + **audit `code-reviewer` OBLIGATOIRE** (2044 l.225 + immutabilité signés) avant « prêt ».
