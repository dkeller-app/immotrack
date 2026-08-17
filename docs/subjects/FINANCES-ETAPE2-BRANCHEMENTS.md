# FINANCES — étape 2 : cartographie des points de branchement

> Produite le 17/08/2026 par agent, sur `index.html` (55 554 lignes) après livraison du socle
> (`js/core/finances-scope.js`, `js/core/finances-window.js`, invariant I-1 — tous dans `main`, **non branchés**).
> Vérifié : `grep` des noms d'API des 2 modules dans `index.html` + `js/**` → **0 occurrence** (orphelins confirmés).
> Spec : `docs/CDC-FINANCES.md` §1 (périmètre), §2 (fenêtres), §11 (ordre de chantier).

## A — Périmètre → remplacé par `finances-scope.js`

**Définitions à retirer** (bloc contigu `index.html:50356-50404`) : `_finActiveEnt` (50359) · `_finActiveImm` (50371) · `_finEntScope` (50377) · `_finScopeWeight` (50397) · `_finInScope` (50404, **code mort : 0 appelant**).

**Sites d'appel `_finScopeWeight` (8 + 1 injection)** : 50647 (`rFinances`, échéances de prêt) · 50824 (`_finLoyersHC`) · 50858 (`_finChargeBuckets`) · **50891 (`_finMonthly` — injection par référence dans `_computeFinancesMonthly`, LE point d'injection du moteur mensuel)** · 51347 et 51365 (`_finDrillLigne`) · 51407 (closure `sumYear`) · 51549 (`_finLotMonthsMap`).

**Sites d'appel `_finEntScope` (7)** : 12055 (`_heroCashflowSeries`, immeuble forcé à `''`) · 12093 (`_dashCfReel`, idem) · **50538 (`rFinances` — scope canonique)** · 51117 · 51305 · 51588 · 51629.
`_finActiveEnt()` hors de ces couples : 9241 (`rAccueil`) · 48731 (`_impayesOpenVue`) · 49711 (import bancaire) · 51215 · 51803.

**Filtrages « maison » à supprimer (constat C7, 12 emplacements)** : 50536, 50537, 50552, **50573 (`scopedLogs` — ne filtre même pas `_deleted`)**, 50607, 50683, 51696, **51721 (`_finRegulAFaire` — oublie `_deleted`)**, 51725, 51726, 50496, 12076 (réimplémentation complète de `_finScopeWeight` dans le fallback `file://`).
Convention `'SCI:'` manipulée hors du module : 51313, 51393, 51566, 51574, 12076. Lectures directes des champs du scope : 51534 (`scope.refs`), 51393-51394 (`scope.immFilter`, `scope.nbImm`).

**Sélecteur `#fin-imm`** (ancrage de `buildScopeCatalog`) : lecture 50372 · reset DOM 50537 · **construction de la liste 50683 — le `.filter(Boolean)` fait disparaître les lots sans immeuble : c'est exactement le panier « Sans immeuble » manquant** · `<select>` 50684-50686 (masqué si moins de 2 immeubles) · injection 50756. Hôte : 1122-1123, entrée de rendu 8117.

## B — Fenêtres → remplacé par `finances-window.js`

**`lastMonth` recalculé 9 fois** (même expression, variable différente) : 50719 · 50817 · 50968 · 51119 · 51344 · 51592 · 51633 · 12060/12095 · 33867 (fiche entité). Chaîne vers le moteur : `_finMonthly` (50885-50898) → `window._computeFinancesMonthly`.

**`_finRegulAFaire(yr, entNom, immNom, lastMonth)`** — définition `index.html:51706` (et non ~50641 comme l'annonçait le CDC), paramètre implémenté 51711-51715, **jamais passé** par ses 2 seuls appelants (50599, 50618) → le régul est toujours calculé sur l'**année civile pleine**, et l'incohérence remonte dans le héro et le P&L via `S.recuperer.regul` (50632) et `resultatNetN1` (50619). ✅ constat du CDC confirmé.

**8 filtres `startsWith(année)` sans borne mensuelle** : 50646 · 50823 · 50857 · 51346 · 51363 · 51406 · 51548 · 51537 (`for mm=1..12` en dur). **3 fonctions mélangent deux fenêtres en interne** : `_finLoyersHC` (50823 année pleine vs 50836 mois échus), `_finDrillLigne` (51346/51358), `_finLotMonthsMap` (51548/51559). `_finIrlSousIndexation` (51693-51702) n'a **aucune** fenêtre (projection ×12 quelle que soit l'année). Encore une implémentation en objets `Date` bornée au **jour** : 50576-50594.

**Comparatif N-1** : alignés → 50970, 50720, 12099. **Désalignés** → 50564 (`_finLoyersHC` recalcule 12 mois sur N-1 : compare N partiel à N-1 complet), 50615 (`_finChargeBuckets`, aucune borne), 50618 (régul), 50911 (legacy), 51419 (`sumYear`, année pleine). Consommateurs d'affichage du delta : 50619, 50626-50627, 50705, 50728-50734, 51032, 51058, 51071, 50974, 51439-51443.

**Libellé de période** : source unique 51034, rendu 51085 ; fragments dupliqués 51033, 51046, 51050, 51053, 51093 ; libellé legacy concurrent 50923 ; bandeau « exercice en cours » 50762 (**ne dit pas jusqu'à quel mois**).

**Sélecteur `#fin-year`** : lecture/défaut `cy` 50528-50530 · options 4 ans glissants 50679-50680 · rendu 50757-50758. **Trois défauts d'exercice contradictoires** : `cy` (50530) contre `cy-1` (50495 `_finCollect`, 51253 `_finCreditYr`, 51802 `_finOpen2044Previsu`).

## Synthèse

8 appels de pondération + 7 de scope + 12 filtrages maison + 5 manipulations de `'SCI:'` · 9 recalculs de borne · 8 filtres annuels sans borne · 3 défauts d'exercice divergents · 1 fonction morte (`_finInScope`) · 1 paramètre implémenté jamais passé (`_finRegulAFaire`).

⚠️ **Piège d'étape 2 signalé par le chantier** : `_computeFinancesMonthly` recalcule `graceLast` depuis le `lastMonth` reçu — lui passer la fenêtre de **constat** ferait sauter la tolérance du mois courant et apparaître un **retard fantôme**. Le retard doit suivre la fenêtre d'**exigibilité**.
