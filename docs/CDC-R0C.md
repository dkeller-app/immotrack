# CDC R0-C — Dette de restitution du dépôt = maître Finances (option B) — FIGÉ 30/09/2026 (GO Didier)

> **Décisions Didier 30/09 (recos en bloc)** : Q1 le dû part du **début du bail** (aligner le maître sur `_debutSuivi`) · Q2 **oui, maître calculé par bail** (lot 4) · Q3 fin du dû = **date de fin effective, sinon date de sortie + avertissement visible** · Q4 paiements hors dates du bail = **rattachement par la date du paiement, étendu sur la vacance voisine** · Q5 trop-perçu de loyer à la sortie = **ajouté au virement de restitution, ligne séparée visible**. Pilotage : Q6 supprimer `_listerImpayesActifs` · Q7 sujet séparé (provision comptée versée sur mois partiellement payé) · Q8 relance hors R0-C + test d'écart dès le lot 1. Lot 2 = **maquette « dette non calculable » validée AVANT code**. Preuves : `mockups/R0C/preuve-*.mjs`.
>
> **Décisions Didier 01/10 → 05/10 (remplacent Q1 d'origine)** : PAS de tolérance « Loyers » hérité dans le moteur (données normalisées à part) · **le dû ne part JAMAIS avant l'entrée en jouissance du bailleur actuel** (Ferrette acheté loué en mars 2026), jamais d'une absence de relevés ; plus de borne « 1er janvier de l'année du 1er versement » · **ANTÉRIORITÉ** : maquette `mockups/R0C/MAQUETTE-ANTERIORITE.html` **VALIDÉE 05/10** — (a) date d'achat dans la fiche immeuble `immeuble.dateAcquisition`, exception possible par logement · (b) données existantes : début de suivi PROVISOIRE = 1er loyer encaissé, marqué « à confirmer » (aucun chiffre ne bouge à la mise en service) · (c) exercices déjà déclarés NON figés en V1, bandeau d'alerte si un chiffre d'exercice déclaré change · solde d'ouverture par bail `bail.anteriorite` (arriéré/avance à la date de début de suivi). Restitution (lot 2) : maquette + lettre VALIDÉES 01/10, sans IBAN, « ni renonciation » gardée. Détail chiffré : `mockups/R0C/DECISIONS-Q1.md`.

# R0-C option B : la restitution du dépôt lit la dette dans le maître Finances

> Plan chiffré, **aucun code applicatif écrit**. Ancrages relevés sur `main` @ `1ed0e835` (v15.705) ;
> branche rejetée @ `63f16ef7` (worktree `Immo-wt-r0c`). Les numéros de ligne de `index.html` bougent
> (le fichier a changé pendant l'étude) : on se repère aux noms de fonction.
> Preuves exécutables (lecture seule) : `mockups/R0C/preuve-double-comptage.mjs` et
> `mockups/R0C/preuve-egalite.mjs` (`node mockups/R0C/<fichier>`).
> Base de tests : 6 fichiers maître/DG, 151 tests verts (lancés depuis `Immo-wt-avenant-lot3`, modules
> identiques à `1ed0e835`, parce que `Desktop\Immo` n'a pas de `node_modules`).

---

## 1. Le mécanisme du double comptage (prouvé)

### Ce que fait le maître

Le maître calcule les **exercices un par un**. Pour chaque lot, il porte d'un exercice à l'autre une
**position d'ouverture**, qu'il place dans le mois de **janvier**.

| Étape | Où | Ce qui se passe |
|---|---|---|
| a | `js/core/finances-monthly.js:195-208` | collecte des loyers (ligne 211) de **tous les mois antérieurs à l'exercice**, depuis `_suiviStartYm` (1ᵉʳ mouvement de loyer de la base) |
| b | `finances-monthly.js:219-229` `_openingOf(q)` | rejoue le netting sur **tout ce passé** : dette cumulée au 31/12 N-1 (loyer, charges) ou avance |
| c | `js/core/loyer-du-mois.js:336-340` | cette dette est semée dans les files **à l'index 0**, donc en janvier |
| d | `loyer-du-mois.js:417-421` | le résidu est rattaché à son mois d'origine. Si l'ouverture n'est pas recouvrée, elle reste **en janvier** : `retardMois[0].loyer` porte toute la dette antérieure |
| e | `finances-monthly.js:264-285` | `byLot[ref].months[0].loyerRetard` = dette propre de janvier **+ tout l'arriéré des exercices précédents** |

Invariant du maître (commentaire `finances-monthly.js:257-259`) : pour un exercice, **Σ des mois =
dette ouverte à la fin de la période**. C'est une position cumulée, pas un flux.

### Ce que faisait la branche rejetée

`_rgClotureImpayes` (`index.html@63f16ef7:26132-26155`) appelle `_finMonthly(y)` pour **chaque
exercice** de la vie du bail, concatène les `months`, puis `arriereLoyerSurPeriode`
(`gestion-dg-impayes.js@63f16ef7:133-146`) **somme `loyerRetard` sur tous ces mois**.

Elle additionne donc des **positions de fin d'exercice**, et deux effets se cumulent :

1. **Ouverture répétée.** La dette de l'année Y est comptée en Y, puis de nouveau dans le janvier de
   Y+1, puis dans celui de Y+2, et ainsi de suite.
2. **Rattrapage ignoré.** Les mois de Y sont figés tels qu'ils étaient au 31/12 de Y. Un arriéré de Y
   réglé en Y+1 reste compté par le calcul de Y.

### Exemples chiffrés (sortie réelle de `preuve-double-comptage.mjs`)

Hypothèses : loyer 700 € HC + 50 € de charges, virement de 750 € le 5 de chaque mois, aujourd'hui le
30/09/2026.

| Cas | Σ `loyerRetard` par exercice (2024 / 2025 / 2026) | Branche rejetée | Dette réelle (netting continu) |
|---|---|---|---|
| **A** · bail 01/2024 → 06/2026, **mars 2024 impayé** | 700 / 700 (janv. 25) / 700 (janv. 26) | **2 100 €** | **700 €** → comptée 3 fois |
| **B** · même impayé, **réglé en février 2025** (virement de 1 500 €) | 700 / 0 / 0 | **700 €** | **0 €** → 700 € fantômes |
| **C** · rotation : le locataire 1 (2024) part avec nov. et déc. impayés ; le locataire 2 (01/2025 → 06/2026) paie tout, plus un double virement de 750 € en mars 2025 | 1 400 / 650 (janv. 25) / 650 (janv. 26) | **1 300 €** retenus au locataire 2 | locataire 2 : **0 € de dette, 750 € de trop-perçu** ; locataire 1 : 1 400 € de loyer + 100 € de charges |

Le cas C met au jour un **troisième défaut**, qui est dans le maître lui-même. L'ouverture est calculée
**par lot**, pas par bail (`_openingOf(q)`, où `q` est le lot). Le trop-perçu du locataire 2 rembourse
donc, dans l'ordre d'ancienneté, la dette du locataire 1. Les 650 € restants sont alors facturés au
locataire 2 : c'est la question **Q2**.

---

## 2. L'extension du maître

### Une seule fonction, dans le module maître

```js
// js/core/finances-monthly.js : même module, mêmes briques, mêmes injections que _computeFinancesMonthly
export function _computeDetteBail({ ref, bail:{debut, fin}, mouvements, catLigne, loyerDue, today })
  → { loyer, charge, avance, mois:[{ym, duHC, duCH, encaisse, loyerRetard, chargeRetard, avance}],
      from, to, graceLast }
```

**Définition exacte**

- **Mois calculés** : de `ym(bail.debut)` à `min(ym(fin), dernier mois exigible)`. Le dernier mois
  exigible est `computeExigibiliteWindow({today})` de `finances-window.js`, c'est-à-dire **la même
  borne que Finances**, tolérance avant le 10 incluse (`graceLast`).
- **Dû du mois** : `loyerDue(ym)` = `duMois(ctx, ym, { segmentDebut: bail.debut })`.
  - C'est une option **à ajouter** à `duMois` (`loyer-du-mois.js:140`) : on ne garde que le segment
    d'occupation de **ce** bail, après la troncature C4.
  - On en tire un prorata au jour, le barème historisé (IRL, I-1) et la fin tronquée à `fin`.
- **Encaissé du mois** : Σ (`cr − db`) des mouvements dont `qui === ref` et `catLigne(cat).ligne2044
  === '211'`, rangés par mois de date.
  - C'est le **même prédicat** que le maître (`finances-monthly.js:144-155`, alias M-1 compris via
    `_finCatLigne`), avec un poids de 1 (`_finScopeWeight(null)`).
  - Le dépôt de garantie (catégorie `special`, sans ligne 2044) et la catégorie « DG utilisé »
    (213) **n'entrent jamais**.
  - Le collecteur doit être **extrait et partagé** avec `_openingOf` (pré-passe) et la collecte de
    l'exercice, pour qu'il n'en existe qu'une implémentation.
- **Calcul** : `_computeLoyerNetting(mois, graceLast, null)` (`loyer-du-mois.js:452`), c'est-à-dire la
  cascade du maître. **Aucune ouverture n'est jamais semée** : le passé du bail est **dans** le
  calcul, il n'est pas reporté.
- **Sorties** :
  - `loyer` = `loyerArrear`, la seule valeur retenue sur le dépôt ;
  - `charge` = `chargeArrear`, exposée mais **non retenue** : elle relève de la régularisation ;
  - `avance` = trop-perçu restant.

**Pourquoi c'est « le maître, étendu », et pas un 4ᵉ moteur** : mêmes injections (`catLigne`,
`loyerDue`), même cascade, même fenêtre, même module. Le prototype confirme l'égalité au centime avec
Finances sur 3 cas à un seul bail (`preuve-egalite.mjs`) :

- entrée le 15/03, IRL 700 → 720 au 01/03/2025, paiements partiels : loyer 940 / charges 161,29, identique au maître ;
- rattrapages répartis sur plusieurs exercices : 520 / 120, identique ;
- loyer payé d'avance le 28/12 : 0 / 0, identique.

### Les cas limites

| Cas | Traitement | Fondement |
|---|---|---|
| Ouverture N-1 | prise **une fois** si le bail a commencé avant l'exercice (son passé fait partie du calcul), **jamais** s'il a commencé pendant l'exercice (rien avant l'entrée). Jamais la dette d'un autre bail | décision Didier 30/09 ; cas A, B, C |
| Bornes du dû | **au jour** : prorata de `duMois` à l'entrée et à la sortie | code existant `loyer-du-mois.js:21` (prorata, loi du 6/07/1989) |
| Bornes des encaissements | **au mois** (mois de la date), comme le maître | parité avec le maître |
| Bail commencé en cours d'année | 1ᵉʳ mois = mois d'entrée, proratisé ; aucune ouverture | ci-dessus |
| IRL en cours de bail | barème historisé ; test I-1 obligatoire sur la nouvelle surface | CDC I-1 |
| Charges | exclues de la retenue (`charge` exposée seulement) | décision Didier, CDC Charges |
| Dette inconnue (module absent) | `null` ≠ 0 : `impayeIndisponible`, rien n'est retenu, l'écran le dit. On n'empêche **jamais** d'enregistrer | branche rejetée (à garder) ; règle « jamais bloquer » |
| Plusieurs baux successifs | chaque bail est calculé seul. La cohérence avec le chiffre du lot dans Finances dépend de **Q2** | cas C |
| Début du dû, fin du dû, encaissements hors bornes, trop-perçu | **pas tranchés par la loi ni par le CDC** | Q1, Q3, Q4, Q5 |

---

## 3. Les surfaces (grep exhaustif @ `1ed0e835`)

### A. À rebrancher (lot 2) : elles lisent aujourd'hui `_loyerEtatLot`, pas le maître

| Surface | Lit aujourd'hui | Lira |
|---|---|---|
| `_calculerSoldeDG` (`js/core/gestion-dg-impayes.js:119-144`), via `window._calculerSoldeDG` (`js/main.js:680`) | `_rgClotureImpayes(ref, bail.debut, fin)` : `_loyerEtatLot` (fenêtre `_debutSuivi`, prédicat `_isLoyerCategory` à 8 catégories, R0-D), repli `_calculerLoyerImpayeCumule`. **Borne fausse** `:137` : `bail.fin` passe avant `dateSortie` ; un bail en tacite reconduction s'arrête donc à sa fin papier | `window._finDetteBail(bail).loyer` ; `null` ⇒ `impayeIndisponible` ; **plus de repli** |
| `_rgClotureCompute` (`index.html:29007`) : panneau de clôture régul (`_rgClotureLocataire`, `:29028`, libellé `:29093` « Loyers **&amp; charges** » alors qu'il n'y a que du loyer), qui alimente `_rgApplyRetenue` | `_rgClotureImpayes(entry.ref, entry.debutOcc, entry.finOcc)`. Ces bornes viennent de `computeRegul.clipBail` (`:29750`) : **coupées à la fenêtre de régul** (l'année), et **décalées d'un jour** par `toISOString()` en UTC (vérifié : `2026-03-01` devient `2026-02-28` en Europe/Paris) | `_finDetteBail(entry.bail).loyer`, bornes **du bail** ; libellé « Loyers impayés (hors charges, voir régularisation) » |
| `_rgApplyRetenue` (`:29188`, appel `:29200`) | `_calculerSoldeDG(entry.bail)` | inchangé, suit `_calculerSoldeDG` |
| `_dgOpenRestitution` (`:56681`, appel `:56690`, affichage `:56770` « Loyers impayés cumulés ») · `_dgRestitRecalc` (`:56812`, appel `:56823`) · `_dgConfirmerRestitution` (`:56853`, appel `:56876`, journal d'audit `:56914`) : **l'acte et le virement** | `_calculerSoldeDG(DB.baux[ref])` | idem, plus l'affichage de l'état « dette non calculable » (maquette), et `impayeIndisponible` écrit dans le journal d'audit |
| Points d'entrée : assistant de départ (`:29302`), `hl-foot` (`:44504`) | `_dgOpenRestitution(ref)`, par **ref** | inchangé. **Contrainte** : `_finDetteBail` prend un **bail**, jamais une ref, pour qu'un rebail ne fasse jamais calculer la dette du nouveau locataire |

### B. Code mort une fois les lots 2 et 3 faits

- **Copies en ligne** `index.html:30937` `_calculerLoyerImpayeCumule`, `:30953` `_calculerSoldeDG` et
  `:31006` `_listerImpayesActifs` : masquées par `js/main.js`, divergentes, et porteuses de la formule
  I-1. Suppression (la branche rejetée l'avait déjà faite).
- **Module** : `_calculerLoyerImpayeCumule` (`gestion-dg-impayes.js:213-228`).
- `_rgClotureImpayes` (`index.html:28955`) : remplacée par `_finDetteBail`.
- `_listerImpayesActifs` (module `:325+`, `main.js:269/729`, tests `gestion-dg-impayes.test.js:313-382`) :
  **aucun appelant d'interface**, formule I-1. Voir **Q6**.

### C. Ne lisent pas cette dette : aucun changement

- `_departEstimDu` (`:29481`), utilisé par l'assistant (`:29437`) et « À traiter » (`:13847`) : ne
  garde que les charges ; le `c.impayes` qu'il calcule est ignoré (dépense perdue, sans effet sur le
  résultat).
- `_rgOpenDecompteEstimatif` (`:29142`) : n'affiche pas `impayes`.
- Modèle d'e-mail `solde-tout-compte` (`js/core/email-compose.js:748`) : `{{loyerImpaye}}` n'est
  **rempli par aucun code** (saisie manuelle).
- Utilisateurs de `_loyerEtatLot` qui rendent un **verdict de mois** (quittance, dates), pas une dette
  de départ : `_loyerPayeDuMois` `:13308`, `_creerQuittance` `:31243`, `_buildQuittanceHtml` `:31328`,
  `_lyEditerQuittances` `:32503`, `_lyRecuPartiel` `:32523`, `_qeSetLot` `:32753`, `_qeRail` `:32761`,
  `_qeAPaiement` `:32804`, `_qeRender` `:32850`, `_qeRenderPickList` `:33192`, `_renderEtat12Mois` `:44224`.

### D. Même nature de dette, autre moteur : hors R0-C, à arbitrer (Q8)

`_lyRelance` (`:32579`, montant du courrier de relance et de la **mise en demeure**) et `_lyEtatLot`
(`:31700`, retard de l'onglet Loyers) lisent `retardLot(_loyerEtatLot)`, c'est-à-dire le moteur
concurrent n°3 de l'audit. Ce montant est loyer **plus** provisions, ce qui est normal en cours de bail.

---

## 4. Tests prévus

1. **Unitaires `_computeDetteBail`**, écrits avant le code et vus rouges :
   - cas A, B et C du §1 (A = 700, B = 0, C : locataire 2 = 0 avec 750 d'avance) ;
   - entrée et sortie en milieu de mois (prorata) ;
   - IRL (barème construit par `periodeInitialeBail` + `appliquerNouvellePeriode`, jamais à la main) ;
   - charges impayées exclues de `loyer` et présentes dans `charge` ;
   - DG encaissé sur le lot sans effet ;
   - catégorie alias M-1 comptée ;
   - `graceLast` le 5 du mois courant ;
   - bail sans `fin` (ouvert jusqu'à aujourd'hui) ;
   - données absentes : `null` ≠ 0.
2. **Harnais d'égalité** `__tests__/helpers/dette-bail-egalite.test.js` :
   - ≥ 200 jeux générés par un PRNG à graine fixe : début du bail de 2021 à 2026 à un jour
     quelconque, 0 à 3 révisions IRL réelles, paiements exacts, partiels, absents, doublés, en retard
     d'un ou plusieurs exercices, payés le 28/12 ;
   - assertion au centime : `_computeDetteBail(...).loyer === Σ _computeFinancesMonthly(annéeCourante).byLot[ref].months.loyerRetard`,
     et de même pour `charge` / `chargeRetard`, sur les lots à **un bail** ;
   - lots à **plusieurs baux** : avant le lot 4, un test **épingle** l'écart du cas C (nommé, chiffré) ;
     après le lot 4, l'assertion devient Σ des baux = chiffre du lot.
3. **Non-régression du maître** :
   - instantané figé **avant** le lot 1 de `_computeFinancesMonthly` (months, annual, byLot) sur les
     jeux des 6 fichiers existants, puis égalité profonde **après** l'extraction du collecteur ;
   - les 151 tests existants restent verts ;
   - `finances-ouverture-arriere.test.js:61` : Σ byLot = P&L.
4. **Invariant I-1** : ajout de la surface « retenue sur dépôt » à `surfacesSocle`
   (`__tests__/helpers/finances-invariant-i1.js:90`). C'est précisément le trou nommé par l'audit.
5. **`_calculerSoldeDG`** : reprise des tests « disponible / indisponible / zéro réel » de la branche
   rejetée ; les 2 tests qui validaient `1950 = 3 × 650` sont réécrits.
6. **Vérification que `window.X` existe** (règle `feedback_window_property_proof`) :
   `window._computeDetteBail` est exposé par `main.js`, et `_finDetteBail` est une déclaration de
   fonction (pas un `const`).
7. **App réelle** (`?sandbox=1`, Edge headless CDP) :
   - `ACCORD_FINANCES_DEPOT` : pour tout lot à un bail du jeu, retenue = Σ `_finMonthly(annéeCourante).byLot[ref]` `loyerRetard` ;
   - écran de restitution sur 3 formats (PC, tablette, téléphone), mode sombre compris ;
   - 0 erreur console.

---

## 5. Découpage en lots (1 lot = 1 commit, worktree dédié, audit `superpowers:code-reviewer` obligatoire à chaque lot)

| Lot | Contenu | Effort | Risque |
|---|---|---|---|
| **0** | Réponses de Didier à Q1-Q8 (conditionnent les lots 1 et 4) | Didier, environ 20 min | n/a |
| **1** | Module maître : `_computeDetteBail`, option `segmentDebut` de `duMois`, collecteur 211 partagé avec `_openingOf`, exposition dans `main.js`. Tests §4.1, 4.2, 4.3, 4.4 et 4.6. **Aucun écran touché** | 1,5 j + 0,5 j d'audit = **2 j** | **Moyen** : touche le module maître ; couvert par l'instantané avant/après |
| **2** | Maquette de l'état « dette non calculable » et du libellé « Loyers impayés (hors charges) » (validation GO). Puis `_finDetteBail(bail)` en ligne (mémo `_dbGen`), rebranchement de `_calculerSoldeDG`, `_rgClotureCompute`, `_rgApplyRetenue` et des 3 écrans de restitution, suppression de `_rgClotureImpayes` et des copies en ligne. Tests §4.5 et 4.7 | 0,25 j de maquette + 2 j + 0,5 j d'audit = **2,75 j** | **Élevé** : acte opposable et virement |
| **3** | Code mort : `_calculerLoyerImpayeCumule` du module ; `_listerImpayesActifs` selon Q6 ; tests associés | 0,5 j + 0,25 j d'audit = **0,75 j** | Faible |
| **4** *(si Q2 = oui)* | Maître : netting et ouverture **par bail** dans `_computeFinancesMonthly` (le chiffre du lot devient Σ des baux, et le trop-perçu du locataire suivant n'éteint plus la dette du précédent). Harnais §4.2 sur plusieurs baux | 2,5 j + 0,5 j d'audit = **3 j** | **Élevé** : change des chiffres de Finances sur les lots qui ont changé de locataire |

**Total : 5,5 j (lots 1-3), 8,5 j avec le lot 4.** Chaque lot incrémente la version et met à jour
BACKLOG.md au moment de la livraison.

---

## 6. Ce qu'on garde de `feat/r0c-retenue-dg`, et ce qu'on jette

**On garde** (à réappliquer sur HEAD, les lignes ont bougé) :

- le drapeau `impayeIndisponible` et la distinction `null` ≠ 0 dans `_calculerSoldeDG`, avec ses 4 tests ;
- la suppression des 3 copies en ligne mortes et divergentes (109 lignes) ;
- la réécriture des 2 tests qui validaient la formule I-1 ;
- le scénario de vérification dans l'app (bail 700 → 850 au 1ᵉʳ juillet ; ancienne formule 10 920 contre 9 300).

**On jette** :

- `arriereLoyerSurPeriode`, son export `window` (`main.js`) et ses 8 tests : sommer des positions
  cumulées, c'est la cause même du défaut ;
- la boucle `_finMonthly(y)` par exercice dans `_rgClotureImpayes` ;
- les bornes `bail.finEffective || bail.fin || dateSortie`, qui bornent un bail reconduit à sa fin papier ;
- le passage des bornes coupées à la fenêtre de régul ;
- les bumps de version v15.645, périmés.

---

## QUESTIONS pour Didier (rien n'est tranché par la loi ou le CDC)

**Q1 · Quand commence le dû d'un bail ?**
- Le maître fait démarrer un lot à son **1ᵉʳ versement** (`_finBailHcChAt`, via `_getLogementStartIso`,
  `index.html:13105`, qui passe en plus par `_isLoyerCategory` à 8 catégories, R0-D).
- `_loyerEtatLot` part du **début du bail, borné au 1ᵉʳ janvier de l'année du 1ᵉʳ versement**
  (`_debutSuivi`, C6).
- Conséquence : le 1ᵉʳ locataire d'un lot qui n'a pas payé ses premiers mois a **une dette invisible
  dans Finances**.
- Options : (a) entrée du bail stricte, au risque de dettes fantômes sur les baux repris ou importés
  tard ; (b) règle `_debutSuivi` appliquée aussi au maître ; (c) statu quo « 1ᵉʳ versement ».
- Reco : (b). Le maître change alors, et Finances et la restitution restent égales.

**Q2 · Faut-il segmenter le maître par bail (lot 4) ?**
- Aujourd'hui le trop-perçu d'un nouveau locataire éteint la dette de l'ancien, dans Finances (cas C).
- Sans le lot 4, la restitution (par bail) et Finances (par lot) diffèrent sur les lots qui ont changé
  de locataire.
- Reco : oui.

**Q3 · Quelle date ferme le dû quand `finEffective` n'est pas encore saisie au moment de la restitution ?**
- L'art. 15-I de la loi 89-462 rend le locataire redevable du loyer **pendant tout le préavis** s'il a
  donné congé (sauf relocation anticipée), et seulement **au prorata de l'occupation** si le congé
  vient du bailleur. La remise des clés (`depart.dateSortie`) n'est donc pas forcément la fin du dû.
- Options : (a) `finEffective`, sinon `dateSortie` avec un avertissement visible ; (b) fin de préavis
  calculée par `conge.js` ; (c) demander la date à l'écran.
- Reco : (a). Aucune borne silencieuse sur « aujourd'hui ».

**Q4 · Encaissements hors des bornes du bail**
- Les mouvements ne portent **aucun identifiant de locataire**.
- Trois situations : le loyer de janvier payé le 28/12, **avant l'entrée** ; un arriéré réglé **après
  la sortie** ; le **mois de transition** entre deux baux.
- Options : (a) bornes strictes au mois d'entrée et au mois de sortie ; (b) étendre sur la vacance
  adjacente (aucun autre occupant, donc sans ambiguïté), et au mois de transition, attribuer selon la
  date du paiement par rapport à la date de bascule ; (c) pointage manuel.
- Reco : (b), avec l'affichage des encaissements attribués hors période.

**Q5 · Trop-perçu de loyer à la sortie**
- La fonction renvoie `avance`. Faut-il l'**ajouter au virement de restitution**, ou seulement
  l'afficher comme information ?
- Ce n'est pas une somme de dépôt au sens de l'art. 22, mais elle est due au locataire.

**Q6 · `_listerImpayesActifs`**
- Aucun appelant, formule I-1. Supprimer (reco) ou rebrancher ?

**Q7 · Signal, hors R0-C : un trou dans « charges exclues »**
- `computeRegul` compte comme provision versée **tout mois qui a reçu un paiement**, multiplié par
  `bail.ch` **actuel** (`index.html:29818`).
- Un mois payé partiellement (loyer soldé, provision non versée) n'apparaît donc **ni** dans la dette
  **ni** dans la régul, et une hausse de provision est appliquée au passé (I-1).
- Reco : un sujet séparé, qui ferait lire à la régul les `provisions` de la cascade du maître.
- Même famille : le décalage d'un jour de `clipBail` en UTC.

**Q8 · Le montant de relance et de mise en demeure (`_lyRelance`) entre-t-il dans R0-C ?**
- Reco : non, parce que le moteur des quittances produit des dates par mois que le maître ne produit
  pas. On ajoute seulement, au lot 1, un test de parité qui **mesure** l'écart.
- Le rebranchement irait dans le lot « Finances = onglet maître ».
