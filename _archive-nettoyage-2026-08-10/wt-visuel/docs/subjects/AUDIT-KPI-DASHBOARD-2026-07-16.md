# AUDIT DE COMPRÉHENSION — KPI du Tableau de bord (Premium)

> Read-only, aucune modification de code. Vérité terrain : `C:/tmp/wt-visuel` (origin/main, ~v15.494).
> Références `file:line` = `C:/tmp/wt-visuel/index.html` (inline ~53 000 lignes) + `js/core/loyer-du-mois.js`.
> Mode du dashboard = **Premium** (`_renderDashV4Premium`, index.html:9207). Dispatch : index.html:8833-8834.

---

## 0. Fait structurant : le dashboard est en VUE MOIS par défaut

`rDash()` force `dash-mois` au **mois courant** si l'utilisateur n'a jamais choisi (index.html:11015-11020).
Donc à l'ouverture, `mo = '07'` (juillet). Conséquence : **toutes les tuiles scopées au mois**
lisent juillet, qui en début de mois n'a encore **aucun mouvement de loyer importé** → 0.
Les tuiles scopées à l'**année** (YTD) ignorent `mo`. Ce mélange mois/année est la **cause dominante**
des « incohérences » signalées (0 % juillet vs 74 % année, N/C charges, deux montants de manque).

Deux moteurs de dû coexistent encore :
- **Moteur unifié** `duMois()` (`js/core/loyer-du-mois.js:102`) → exposé via `window.duMoisFromRaw`
  → `_duMoisLot` (index.html:12202) → `_getActiveBailHcChProrated` (12222) → `dueOfMonth` de
  `_suiviLoyerStrip` (8921). **La chaîne Hero / impayés / statut par lot est bien rebranchée dessus.**
- **Moteur legacy ad hoc** `_findBailForDate` (index.html:9283) → utilisé UNIQUEMENT par
  `_projectionLogement` (9832), qui alimente la tuile **Loyers 2026 (k5)** et les séries sparkline
  occupation/rendement. **Non rebranché sur `duMois`.**

---

## 1. Tableau des tuiles KPI

| Tuile KPI (libellé écran) | Fonction / variable (file:line) | Source de données réelle | Verdict | Bonne source si faux/suspect |
|---|---|---|---|---|
| **Hero ENCAISSEMENT JUILLET — donut 0 %, 0,00 €, 0 lot/6** | `_renderDashV4Premium` heroHtml (9436-9454) ; `pctCollecte` (9251) = `totalLoyersRecu`/`objMens` ; `_nbPaidReal` (9269-9273) | **Attendu** `objMens` = Σ `_suiviLoyerStrip(l,yr).months[mo-1].attendu` (9242-9249) → `duMois` ✓. **Reçu** `totalLoyersRecu` = Σ `mvs` (mouvements du MOIS sélectionné, cat loyer, cr>0) (9231-9232) — pas l'allocation du strip. `_nbPaidReal` via `_v4ComputeLotStatus`→strip. | **SUSPECT** | Le calcul est juste *pour sa définition* mais lit **juillet** (mois courant) : 0 mouvement importé → 0/3240 → 0 %. Deux défauts : (a) « reçu » vient des mouvements bruts du mois, pas de `months[mo].recu` (incohérent avec l'attendu) ; (b) **aucune tolérance début de mois** (contrairement à `_computeImpayes`). Corriger : reçu = `strip.months[mo].recu` + grâce mois courant, ou défaut vue Année. |
| **Narrate « Juillet : 0 sur 3 240 · ↓ −3 864,63 vs Juin · 6 relances »** | narrateParts (9423-9428) ; `deltaCr = totalCr − prevCr` (9261) ; `imp.count` (9266) | « 0 sur 3 240 » = `totalLoyersRecu`/`objMens` (loyers). « −3 864,63 vs Juin » = `DashCtx.mvTotals` **totalCr − prevCr** = TOUTES recettes (loyers + charges + DG + régul), pas les loyers. « 6 relances » = `_computeImpayes`. | **SUSPECT** | Sources **mélangées dans une même phrase** : le « sur 3 240 » est loyers-only, le « −3 864 vs Juin » est toutes-recettes, la « relance » est le solde annuel. Corriger : comparer loyers↔loyers (mois vs mois-1) pour le delta. |
| **CASH-FLOW 12 MOIS — RECETTES YTD 15 913 · CF YTD −9 298 · CHARGES YTD −25 211 + sparkline** | cashHtml (9534-9555) ; `_dashCfReel` (11797) ; sparkline `_heroCashflowSeries` (11752) | `_dashCfReel` → `_finMonthly` (48914) → `window._computeFinancesMonthly` (module, moteur **Finances** aligné 2044, `cashflowReel`). Recettes = loyersHC+provisions ; Charges = charges+récup ; CF = cashflowReel. **YTD, ignore `mo`.** | **JUSTE** | — (c'est le bon patron : un seul moteur partagé avec l'onglet Finances). |
| **8 SUJETS À TRAITER (carte) + 3 bulles coach du haut** | `items = _computeUnifiedTodo(ctx)` **calculé 1×** (9355) ; `top3` dédup par type (9358-9372) ; réutilisé par coachHtml (9392) ET sjtHtml (9565) | `_computeUnifiedTodo` (12617) : MRH/PNO (`AlertRules`), IRL (`AlertRules.irlClassifier`), régul, départs. Impayés & vacances volontairement **exclus** (12660, 12715). | **JUSTE (pas de doublon dans Premium)** | « 8 » = `items.length` ; les bulles = `top3` (3 types groupés). Même source, un calcul. Voir §2 pour la dédup inter-modes. |
| **OCCUPATION · MAG — 100 % 6/6 lots** | k1 (9685-9691) ; `DashCtx.occupationKpis(scopeLogs)` (9222) ; `magAn` (9682-9683) | Compte les logements avec `l.locataire`. MAG = Σ `hc` des lots **sans** locataire × 12. Pas de loyer encaissé. | **JUSTE** | — |
| **RENDEMENT BRUT — 9,7 %** | k2 (9700-9706) ; `rdtTheo` (9694) | `Σ occupiedLogs.hc × 12 / totalValue`. `totalValue` = Σ `imm.valeurEstimee + montantTravaux` (9587-9594). Utilise `l.hc` **courant** (pas le barème). | **JUSTE (snapshot)** | Rendement = photo prospective → `l.hc` courant acceptable. N/C si valeurs estimées non renseignées. |
| **DÉPÔTS DE GARANTIE — 3 065 € / 5 contrats** | k3 (9709-9716) | Σ `l.dg` où `l.locataire && l.dg>0`. | **JUSTE** | — |
| **CHARGES / LOYERS — N/C, 0 € / 0 €** | k4 (9793-9799) ; `loyersTot` (9719) ; `ratioCh` (9720) | `loyersTot` = Σ **`mvs`** (mouvements du MOIS, cat loyer, cr). `totalDb` = Σ débits du MOIS. Ratio = `totalDb/loyersTot`. Aucun loyer ce mois → `loyersTot=0` → **N/C** ; débits mois = 0 → 0 €/0 €. | **FAUX (source inadaptée)** | Scopé mois + mouvements bruts → toujours N/C en début de mois. Corriger : réutiliser `_dashCfReel` (charges & recettes YTD, moteur Finances) — mêmes chiffres que la carte cash-flow — ou l'attendu du strip, jamais les mouvements bruts d'un mois. |
| **LOYERS 2026 — 13 465 € encaissé sur 18 290 € · 74 % · écart −4 825 €** | k5 (10056-10065) ; `_projectionLogement` (9832-9918) ; `attenduEcoule`/`encaisseTotal` (9923-9935) ; `ecartAE`/`pctAE` (10057-10058) | **Moteur LEGACY** : `_findBailForDate` (9283, `l.hc/ch` du bail courant + fallback continuité), **PAS `duMois`**. `attenduEcoule` = attendu − reste futur ; `encaisseTotal` = Σ loyers encaissés YTD (mouvements bruts). | **FAUX (moteur divergent)** | Seule tuile de loyer **non rebranchée** sur `duMois`/barème → diverge du Hero et des impayés. Corriger : `attenduEcoule` = Σ `_suiviLoyerStrip(l,yr).attendu` (déjà = `duMois` cumulé mois échus) ; encaissé = `strip.recu`. Supprimer `_projectionLogement`/`_findBailForDate`. |

---

## 2. Les deux « montants de manque » divergents

| Montant écran | Fonction | Source | Portée |
|---|---|---|---|
| **« 6 impayés · 10 818,26 € en attente »** (alerte hero) | `_computeImpayes` (12849) ; `imp.totalDue` (9266) | `_suiviLoyerStrip` → **`duMois`** ; `_loyerSoldeAjuste` (tolérance mois courant) ; `_loyerChipVerdict` | **Solde négatif cumulé ANNÉE** par lot occupé (les lots en avance ne compensent pas). |
| **« Loyers 2026 · écart −4 825 € »** (tuile k5) | `_projectionLogement` (9832) | **`_findBailForDate`** (legacy) | **Net encaissé − attendu ÉCOULÉ**, tous lots (l'avance compense). |

Ils diffèrent pour **deux raisons cumulées** : (1) **moteurs différents** (`duMois`/barème vs
`_findBailForDate`) ; (2) **agrégations différentes** (Σ des soldes négatifs par lot, avec tolérance,
vs net global encaissé−attendu). Tant que k5 n'est pas rebranché sur le strip, les deux chiffres ne
peuvent pas se réconcilier.

---

## 3. Actions dupliquées (générateur unique + points d'affichage)

**Générateur unique** : `_computeUnifiedTodo(ctx)` — index.html:**12617**.
Émet MRH manquante/expirée, PNO, IRL applicable/à venir, régul à émettre, départs. Impayés et
vacances sont **exclus par choix** (commentaires 12660, 12715). S'appuie sur `window.AlertRules`
(source canonique testée) et `_TODO_TYPE_META` (index.html:**13249**) pour libellés + `meta.go`.

**Dans Premium : PAS de double calcul.** `items` est calculé **une fois** (9355) puis partagé par la
bulle coach du haut (`coachHtml`, 9392) et la carte « 8 sujets à traiter » (`sjtHtml`, 9565). Le « 8 »
= `items.length` ; les 3 bulles = `top3` (groupé par type). Même liste, deux présentations.

**Points d'affichage de `_computeUnifiedTodo` (recalcul par render, un par mode/surface)** :
- `_renderDashV4Premium` — index.html:9355 (coach + carte, 1 appel)
- `_renderDashV4Gestionnaire` — index.html:**10317** (compteur « À traiter » + météo) → **oui, le mode Gestionnaire recalcule la même liste**
- `_renderDashV4Solo` — index.html:10190
- `_renderAccueil` — index.html:8989
- Hero V2 / variantes — index.html:13063, 13263
- `_buildTodoDrill` (drill « todo-unified ») — index.html:12883
- `_renderDashV4Premium` (2e réf. de contrôle) — index.html:10190 relève de Solo

C'est le **même générateur** partout (pas de logique dupliquée), mais **recalculé** à chaque render de
mode. Un mémo par génération DB existe déjà pour `_suiviLoyerStrip` (8906-8911) ; `_computeUnifiedTodo`
n'est pas mémoïsé (cf. commentaire 25985 sur le cache de rendu).

---

## 4. Finances / P&L + hook mouvements

**Rendu P&L** : page `#p-finances` → routeur `go('finances')` (index.html:7825) → **`rFinances()`**
(index.html:**48547**) → `_finRenderPLv2` (48991, modèle B4 par défaut) / `_finRenderPL` (48933).
Moteur : **`_finMonthly`** (48914) → **`window._computeFinancesMonthly`** (module `js/core/`, aligné
2044 via `loyerDue: _finBailHcChAt`, `cashflowReel`, N-1 même période). Le calcul fiscal pur reste
**`window._compute2044`** (`js/core/legal-2044.js`, intouché — cf. spec 2026-07-16 : « la 2044 reste
intouchée »).

> Note : `_finMonthly` passe `loyerDue: _finBailHcChAt` (48922) — **pas** `_duMoisLot`. Le P&L fiscal
> a donc encore SON résolveur de dû (`_finBailHcChAt`), distinct de la chaîne dashboard `duMois`. À
> vérifier si la convergence des 5 surfaces sur `duMois` couvre bien le P&L (le commentaire 48922 dit
> « cascade cumulative dans le module »).

**Hook ajout / import de mouvements** : page `#p-loyers` (« Loyers & Mouvements ») → `go('loyers')`
(7816) → **`rMv()`** (via `loyers:()=>{initFilters();rMv();}`). Ajout manuel : bouton `+ Mouvement`
(index.html:308) → **`openNewMv()`** (index.html:**15156**) → modale `#ov-mv` → **`saveMv()`**
(index.html:**15738**). C'est le point d'entrée pour « voir l'impact P&L après saisie » : un mouvement
crédité de catégorie loyer alimente `totalLoyersRecu` (Hero, vue mois) et `encaisseTotal` (k5, YTD) ;
un débit alimente `_finMonthly`/charges (carte cash-flow + P&L Finances).

---

## 5. Résumé exécutif

- **KPI FAUX (source/moteur inadapté) : 2** — `Charges / Loyers` (k4, mouvements bruts du mois → N/C
  systématique en début de mois) et `Loyers 2026` (k5, moteur legacy `_findBailForDate` non rebranché
  sur `duMois`).
- **KPI SUSPECTS (bon moteur, mais portée/UX trompeuse) : 2** — Hero « Encaissement » (vue mois courant
  à 0 % en début de mois, « reçu » lu sur mouvements bruts au lieu de l'allocation du strip, pas de
  tolérance) et la phrase narrate (mélange loyers-only / toutes-recettes / solde annuel).
- **KPI JUSTES : Cash-flow YTD, Occupation, DG, Rendement** (4).
- **Actions : pas de doublon** dans Premium (1 calcul partagé) ; générateur unique `_computeUnifiedTodo`
  recalculé dans **6+ points d'affichage** (Premium, Gestionnaire, Solo, Accueil, HeroV2, drill).

**Cause dominante** : un **mélange de portées mois/année** (le dashboard s'ouvre en vue *mois courant*,
donc les tuiles mois-scopées lisent un juillet encore vide) **cumulé à deux moteurs de dû divergents** —
la chaîne Hero/impayés/statut est rebranchée sur `duMois`, mais **k5 (Loyers 2026) et k4 (Charges/Loyers)
ne le sont pas** (k5 = `_findBailForDate`, k4 = mouvements bruts). Réconciliation = (1) tuiles
loyers/charges toutes sur `duMois`/strip + moteur Finances, (2) « reçu » du Hero pris sur l'allocation du
strip, (3) décider d'une portée par défaut cohérente (année, ou mois avec grâce début de mois).
