# PILOTAGE — Refonte de l'écosystème (Compréhension)

**Date** : 2026-07-16 · **Base** : `origin/main` v15.494 · **Auteur** : session pilotage
**Statut** : étape 1/4 du process validé par l'utilisateur — **Compréhension → Idées d'amélioration → Cahier des charges → Mockup (Fable)**
**Références amont** : `docs/subjects/AUDIT-PILOTAGE-SUIVI-GESTIONNAIRE-2026-07-16.md` (audit R1-R4)

> Ce document fige la **compréhension partagée** avant tout mockup. Il ne propose PAS encore de solution détaillée (ça vient au cahier des charges). Il dit : où on en est, ce que l'utilisateur veut, ce qui reste à trancher.

---

## 1. Le besoin (mots de l'utilisateur)

> « On empile les choses actuellement : premium avec des infos de gestion, gestionnaire pas loin du suivi, premium et gestionnaire avec un sélecteur différent… »

Puis, cible explicite (17/07) :
- Un onglet **Tableau de bord** avec des **KPI**.
- Un onglet **Finances** avec le **P&L**.
- Un onglet **Suivi** qui **reprend l'onglet Gestionnaire** (dont le suivi des documents + le suivi des loyers).
- L'onglet **Automatisations** → devrait plutôt aller dans **Réglages**.
- **Un fil rouge** : *« On rentre dans Gestionnaire pour voir les actions, ensuite les KPI pour une visu macro, ensuite Finances pour une visu micro. »*
- **Finances** doit **aussi** se retrouver dans **Loyers & mouvements** (« j'intègre un mouvement, je veux voir ce que ça donne »).
- **« Calcul derrière non ok, il faudra les revoir ! »** (les KPI ne sont pas justes).

---

## 2. État actuel (l'existant, dans le code)

### 2.1 La structure d'onglets réelle
Le groupe **Pilotage** (`_NAV_GROUPS`) a 3 sous-pages, rendues en barre de sous-onglets : **Tableau de bord** (`#p-dashboard`) · **Finances** (`#p-finances`) · **Suivi** (`#p-pilotage`).

- **Tableau de bord** (`#p-dashboard`) porte encore le **sélecteur Premium ↔ Gestionnaire** (`_v4SetMode`, `DB.params.dashV4Mode`, défaut `premium`). C'est le doublon de sélecteur que l'utilisateur pointe.
  - **Premium** (`_renderDashV4Premium`) : hero encaissement + cash-flow 12 mois + **bulles d'actions** (« 8 actions pour finir le mois », « 8 sujets à traiter ») + rangée de tuiles KPI (occupation, rendement, DG, charges/loyers, loyers année).
  - **Gestionnaire** (`_renderDashV4Gestionnaire`) : **matrice de conformité par lot** (« Pilotage parc » : Lot/Loyer/Bail/DPE/Ass./IRL/Quittance).
- **Finances** (`#p-finances`) : le P&L / reporting bailleur (`_renderDashV4`/reporting — résultat net, compte de résultat N/N-1, ratios, drill).
- **Suivi** (`#p-pilotage`) : `_setPilotageTab` → 4 sous-onglets **Suivi comptable** (`_rPilCompta`) · **Suivi documents** (`_rPilDocs`) · **Automatisations** (`_rPilAutom`) · **Prélèvements** (stub sans renderer).

### 2.2 Les recouvrements confirmés (audit R1-R4, rappel)
- **R1 — matrice de conformité EN DOUBLE.** La matrice « Gestionnaire » du Tableau de bord (`_renderDashV4Gestionnaire`) et la matrice « Suivi documents » de l'onglet Suivi (`_rPilDocs` + `_pilStatutDoc`) sont **deux implémentations séparées** de la même grille, avec des **verdicts qui divergent** (ex. Bail « OK » côté Gestionnaire = échéance ; « Non signé » côté Suivi docs = signatures). → **C'est le doublon que l'utilisateur soupçonnait** (« je pense que c'est similaire, à auditer »). **Réponse : OUI, à fusionner.**
- **R3 — 2 destinations « suivi des loyers ».** `_dashGoImpayes` (→ page Quittances filtrée « impayée ») vs `_impayesOpenVue` (→ modale strip 12 mois). Deux portes pour la même intention.
- **R4 — 2 sélecteurs.** Pills Premium/Gestionnaire (sur le TdB) ⟂ sous-onglets de Suivi. Indépendants, se chevauchent sémantiquement.
- **Moteur de dette** : consolidé sur `duMois()` (résolveur unique, étape 4 BARÈME-LOYER v15.489). Reste des reliquats (`_calculerLoyerImpayeCumule` pour DG+compteur KPI ; `_pilSoldeLocataire` mort).

### 2.3 Les KPI et leurs problèmes (inventaire — capture user 17/07)
Rendus par `_renderDashV4Premium`. Constat visuel + première localisation code :

| KPI (tuile) | Valeur observée | Diagnostic |
|---|---|---|
| **Encaissement du mois** (hero) | « **0,00 € sur 3 240 € · 0 lot payé / 6** » | 🔴 FAUX. `totalLoyersRecu`/`_nbPaidReal` = 0 alors que des loyers sont perçus. À relier au **découplage quittance v15.493** (la quittance sort du calcul) + lecture du « reçu ». `hero` de `_renderDashV4Premium`. |
| **Charges / loyers** | « **N/C** — 0 € / 0 € » | 🔴 FAUX. `ratioCh === null` → charges non calculées (catégorisation/bucket manquant). |
| **Cash-flow 12 mois** | Recettes YTD 15 913 · CF YTD −9 298 · Charges YTD −25 211 | 🟠 à vérifier (cohérence recettes/charges/CF). |
| **Occupation** | 100 % (6/6, entité MAG) | 🟢 plausible mais scope = 1 entité (MAG) → vérifier le calcul multi-entités. |
| **Rendement brut** | 9,7 % (sur 460 000 €, 1 immeuble) | 🟠 à vérifier (assiette = valeur du bien ?). |
| **Dépôts de garantie** | 3 065 € (5 contrats, moy. 613 €) | 🟠 à vérifier vs `_calculerSoldeDG`. |
| **Loyers 2026** | 13 465 € encaissé / 18 290 € attendu (74 %) | 🟠 à recouper avec l'encaissement du mois (incohérent avec le « 0 € » ci-dessus). |
| **Bulles d'actions** (« 8 actions », « 8 sujets ») | Assurances ×6, Plomb expiré, Révision IRL | ⚠️ **recoupent Gestionnaire** → à DÉPLACER dans Suivi (décision user). |

> **Verdict KPI** : au moins **2 tuiles factuellement fausses** (encaissement, charges/loyers) + incohérences internes (encaissement mois vs loyers année). Un **audit formule-par-formule** est nécessaire (phase Idées d'amélioration). Ce n'est PAS un simple habillage : les sources de calcul sont à revoir.

---

## 3. La cible validée (17/07)

**Fil rouge = zoom progressif : ACTIONS → MACRO → MICRO.**

```
   SUIVI                 TABLEAU DE BORD          FINANCES
 (ex-Gestionnaire)          (KPI macro)          (P&L micro)
  « que dois-je faire ? » → « comment je vais ? » → « le détail chiffré »
```

| Onglet | Rôle cible | Change |
|---|---|---|
| **Suivi** | reprend **Gestionnaire** : **actions à traiter** + **matrice de conformité UNIFIÉE** (fusion Gestionnaire + Suivi documents) + **suivi des loyers détaillé** | reçoit les bulles d'actions (retirées du TdB) ; une seule matrice de conformité |
| **Tableau de bord** | **KPI macro purs** (vue d'ensemble juste) | **retire les bulles d'actions** ; **corrige les KPI faux** ; supprime le sélecteur Premium/Gestionnaire |
| **Finances** | **P&L micro** | exposé **aussi dans « Loyers & mouvements »** (voir l'impact d'un nouveau mouvement) |
| ~~Automatisations~~ | → **Réglages** | sort du pilotage (c'est de la config) |

**Disparaît** : le sélecteur pills **Premium/Gestionnaire** (son contenu « Gestionnaire » devient l'onglet **Suivi**) ; le chemin mort `_renderDashV4Solo` ; le sous-onglet stub « Prélèvements ».

### 3.1 Décisions tranchées (les 3 questions ouvertes)
1. **Suivi documents ≈ matrice Gestionnaire ?** → **OUI** (R1 confirmé). **Fusion en UNE matrice de conformité** dans Suivi, source de verdict unique (`_pilStatutDoc`).
2. **Suivi des loyers, on l'intègre où ?** → **Détail dans Suivi** (relancer = une action) + **KPI macro « encaissé / impayés » sur le Tableau de bord qui DRAILLE vers Suivi**. Un seul écran détaillé + un indicateur macro qui y mène (= fil rouge). Résout aussi R3 (fin des 2 destinations).
3. **Automatisations → Réglages ?** → **OUI**.

---

## 4. Ce qui reste à faire (avant le cahier des charges)

1. **Audit des formules KPI** (« calcul derrière non ok ») — tuile par tuile : encaissement du mois, charges/loyers, cash-flow, occupation, rendement, DG, loyers année. Nommer la source, la formule, le bug, la correction. *(Un agent a été lancé puis coupé par la limite de session ; à reprendre.)*
2. **Cartographie fine de la fusion R1** — quelles colonnes garde la matrice unifiée (Gestionnaire ajoute Loyer/DPE/IRL/Quittance ; Suivi docs ajoute EDL/Chauffage/Caution), quel verdict par colonne.
3. **Où branche `Finances` dans « Loyers & mouvements »** (vue embarquée ? lien ? recalcul live après ajout d'un mouvement ?).
4. **Liste des « actions » du fil rouge** (ce que Suivi/Gestionnaire pousse : assurances, diagnostics, IRL, impayés, fins de bail…) et leur priorisation.

---

## 5. Symboles clés (code, origin/main — noms stables)

**Onglets / rendu**
- `_v4SetMode` / `DB.params.dashV4Mode` — sélecteur Premium/Gestionnaire (à SUPPRIMER)
- `_renderDashV4Premium` — Tableau de bord actuel (KPI + hero + bulles d'actions)
- `_renderDashV4Gestionnaire` — matrice conformité (→ devient Suivi)
- `_setPilotageTab` / `_rPilCompta` / `_rPilDocs` / `_rPilAutom` — onglet Suivi actuel
- `_pilStatutDoc` — helper verdict conformité (source unique cible)

**KPI (à auditer)**
- `_renderDashV4Premium` : hero encaissement (`totalLoyersRecu`, `_nbPaidReal`, `objMens`) ; tuiles (`rdtTheo`, `ratioCh`)
- `_calculerSoldeDG` — dépôts de garantie
- `duMois()` (`js/core/loyer-du-mois.js`) — résolveur de dû unique (déjà branché)

**Entrées « suivi loyers » (à unifier)**
- `_dashGoImpayes` (→ Quittances filtrées) · `_impayesOpenVue` (→ modale strip)

---

## 6. Process & modèle
- **Compréhension (ce doc) → Idées d'amélioration → Cahier des charges → Mockup.**
- **Opus** pour compréhension / idées / cahier (analyse/archi). **Fable** pour cracher les mockups une fois le cahier validé.
- Règle gravée rappelée (incident nav 17/07) : **aucun choix visuel — même une couleur — ne part en prod sans mockup validé.**
