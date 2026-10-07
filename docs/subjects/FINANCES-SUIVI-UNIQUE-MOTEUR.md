# FINANCES-SUIVI-UNIQUE — conception du moteur unique de suivi des loyers

**Statut** : 📐 conception, **aucun code écrit** (06/10/2026) · branche `feat/finances-suivi-unique`
**Entrées** : `FINANCES-SUIVI-UNIQUE.md` (décisions 05/10 et 06/10) · `RETOURS-2026-10-05.md` lot E · `AUDIT-SUIVI-LOYERS-2026-07-14.md` C2/C12 · `CDC-FINANCES.md` §0bis, I-1, H-1, T-1, T-5 · `CDC-KPI.md:451` · `CDC-R0C.md` · maquette validée `mockups/FINANCES-SUIVI-V2/` (locale, non versionnée).
**Mesures** : prototype jetable (scratchpad, non versionné) passé sur l'export réel du 05/10, aujourd'hui = 05/10/2026. Les chiffres cités en §F viennent de ce passage.

---

## A. État des lieux : trois moteurs, une question

### A.1 Ce qu'ils font

| | ① Finances `_computeFinancesMonthly` | ② Loyers `etatMoisLot` (via `_loyerEtatLot`) | ③ Bandeau `_computeLoyerStatut` (via `_suiviLoyerStrip`) |
|---|---|---|---|
| Fichier | `js/core/finances-monthly.js:30` | `js/core/loyers-mois.js:105`, câblé `app-part1.js:9014` | `js/core/loyer-statut.js:30`, câblé `app-part1.js:6866` |
| Unité | **lot** (`mv.qui`) `:238` | **lot** | **lot** |
| Dû | `loyerDue` injecté = `_finBailHcChAt` (`app-part2.js:29435`) → `duMois` | `_duMoisLot` → `duMois` (`loyer-du-mois.js:140`) | `_getActiveBailHcChProrated` → `duMois` ; futur = `log.hc+log.ch` **actuel** (`loyer-statut.js:47`) |
| Début du suivi | **mois du 1er versement du lot**, toutes années (`_getLogementStartIso` `app-part1.js:8860`, borné `app-part2.js:29441`) | `_debutSuivi` : début du bail, borné au **1er janvier** de l'année du 1er versement (`loyer-du-mois.js:290-295`) | 1er janvier de l'année affichée |
| Reçu | 211 net `cr−db` × poids de périmètre (`:148-155`) | **`cr>0` seulement** (`app-part1.js:9036`) — C12 | `cr>0`, total annuel sans date (`app-part1.js:6885-6887`) |
| Imputation | **deux passes** : retard = `_computeLoyerNetting` compensé (`:264`) ; avance + rattrapage = `_computeLoyerChargeAlloc` **non compensé** (`:251-256`, `loyer-statut.js:146`) | `_loyerArrearsPass` compensé (`loyers-mois.js:107`) | pool annuel au plus ancien mois, aucun report d'année (`loyer-statut.js:42-58`) |
| Passé | ouverture N-1 **par lot** rejouée puis semée en janvier (`:195-229`, `loyer-du-mois.js:336-346`) | toute la fenêtre `_debutSuivi` → aujourd'hui | aucun |
| Sortie | P&L + `byLot[ref].months[]` = **résidu attribué au mois d'origine** (`:257-269`) ; annuel = Σ | verdict par mois (soldé, reste, paiements datés), reste, avance | frise 12 cases + solde annuel |
| Tolérance < 10 | `graceLast` lié à `dueMonth` (`:87`) | option `graceLast` | non |

### A.2 Ce qui produit le cas Arslan (Ferrette - 101)
Reproduit par `docs/subjects/FINANCES-SUIVI-UNIQUE/repro-arslan-101.mjs` : ① 323,01 € de retard **et** 476,99 € d'avance la même année ; ② 1 723,01 € (janvier et février dus alors que l'immeuble est acheté en mars) ; ③ −1 723,01 €. Les causes : compensation **par lot** (le loyer d'avril de l'ancien locataire, 303,33 €, est remboursé par les virements d'Arslan) ; retenue de 303 € sur le dépôt invisible (aucun mouvement, seulement `finNotes`) ; avance non compensée dans ① ; trois débuts de suivi différents.

### A.3 Appelants à rebrancher (grep exhaustif, `js/app` + `js/core`)

| Moteur | Appelant | Ce qu'il lit |
|---|---|---|
| ① `_finMonthly` (`app-part2.js:29532`) | `rFinances` `:29310`, `_finRenderPLv2` `:29568` (3 sous-lignes `:29597-29602`, charges `:29621`), `_finRatio` `:29059`, `_finVizSeries` `:29076`, `_finRenderViz` `:29105`, `_finDrillRetard` `:30272` | P&L + `byLot` |
| ① via `byLot` | `_computeImpayes` `app-part1.js:9818` (bulle Accueil, pilotage `_pilCollectFamilles` `:6903`, matrice `_renderPilMatrice` `:7587`, `_pilLotLigne` `:7436`, téléphone `_renderAccueilPhone` `:7132`), `_lyTousLoyersHtml` chip `app-part2.js:26386-26398` | `annual.retard`, `annual.avance`, `solde`, `months[]` |
| ① cash (non concerné) | `_heroCashflowSeries` `app-part1.js:8469`, `_dashCfReel` `:8515` | P&L seul |
| `_computeLoyerChargeAlloc` hors module | `_finLoyersHC` `app-part2.js:29446`, `_finDrillLigne` `:30003`, `_finDrillAvance` `:30325` | avance non compensée |
| ② `_loyerEtatLot` | `_lyEtatLot` `app-part2.js:1069`, `_lyRelance` `:1949` (+ `retardLot`, `lignesRelance`), `_creerQuittance` `:602`, `_buildQuittanceHtml` `:652`, `delQuit` `:1006`, `_lyEditerQuittances` `:1873`, `_lyRecuPartiel` `:1893`, `_qeSetLot` `:2122`, `_qeRail` `:2131`, `_qeAPaiement` `:2174`, `_qeRender` `:2210`, `_qeRenderPickList` `:2558`, `_renderEtat12Mois` `:13595`, `_renderLogFichePhStrip` `:17138`, `_loyerPayeDuMois` `app-part1.js:9062`, `_rgN1Charges` `:25175`, `_rgClotureImpayes` `:25191` → `_calculerSoldeDG` (`js/core/gestion-dg-impayes.js:129-135`, restitution du dépôt) ; `js/core/quittance-editeur.js:53` (`moisRailLot`) | verdict mois, reste, dates |
| ③ `_suiviLoyerStrip` | `_v4ComputeLotStatus` `app-part1.js:6805`, `_lyTousLoyersHtml` frise `app-part2.js:26400` ; `_loyerSoldeAjuste` `app-part1.js:7462`, `js/core/pilotage-familles.js:115` | frise + solde |
| Exposition | `js/main.js:104, 108, 246-247, 496, 518-543, 659-666` | `window.*` |

**`_computeDetteBail` n'existe pas dans le code** : il n'apparaît que dans `docs/CDC-R0C.md:74` (lot 1 jamais livré) et `BACKLOG.md:217`. `mockups/R0C/` n'est pas dans le dépôt. Aucun `immeuble.dateAcquisition` ni `bail.anteriorite` dans `js/` (décision 05/10, non codée).

---

## B. API proposée — `js/core/suivi-loyers.js` (nouveau module, pur)

### B.1 Pourquoi un nouveau module, et sur quel socle
- **Socle conservé** : `duMois` (dû historisé, prorata, troncature C4, I-1) et `_loyerArrearsPass` (`loyer-du-mois.js:321` : cascade H-1, report d'avance, ouverture, fragments datés → « quel virement a payé quel mois »). C'est déjà le cœur de ② et du retard de ①. **On ne réécrit pas l'imputation, on change son unité (bail) et on supprime les passes concurrentes.**
- **Pas dans `finances-monthly.js`** (où le CDC R0-C plaçait `_computeDetteBail`) : ce module est le P&L (prêt, 2044, charges récupérables). Le suivi est consommé par 5 surfaces dont 4 hors Finances ; `finances-monthly.js` l'importera comme les autres. Ce n'est pas un 4ᵉ moteur : il **remplace** `_openingOf` + le netting par lot de ①, `etatMoisLot` de ② et `_computeLoyerStatut` de ③.
- **`_computeDetteBail` du CDC R0-C = `detteBail(suiviBail(...))`** (exporté sous ce nom pour le lot 2 de R0-C). Le lot 4 de R0-C (« maître par bail ») est réalisé par ce chantier.
- La passe fiscale `_computeLoyerChargeAlloc` (loyers HC / provisions à l'encaissement, base 2044) **reste inchangée** : décision 3, « le loyer encaissé 2044 reste le reçu réel ».

### B.2 Extensions de `loyer-du-mois.js` (rétro-compatibles, options absentes ⇒ sortie identique)
1. `duMois(ctx, ym, { bailDebut })` : ne compte que le segment d'occupation du bail commençant à `bailDebut`, **après** troncature C4 (`_occupation` `:109-128`). Invariant : Σ des baux = `duMois` du lot.
2. `_loyerArrearsPass(months, opts)` gagne :
   - `months[i].remise` : **manque accepté** du mois. Appliqué **après** l'argent du mois, dans l'ordre H-1, plafonné à la dette ; ne crée jamais d'avance ; n'entre pas dans `received`.
   - `opts.seuilArrondi` (défaut 0, le module suivi passe 1) : en fin de mois, une avance ou une dette totale strictement inférieure au seuil est soldée, avec une trace `{type:'arrondi', montant signé}`. Règle de la maquette validée (« 0,32 € de trop, ignoré (moins de 1 €) ») et de la décision 2 (303 contre 303,33).
   - `perMonth[i]` enrichi : `courant {loyer, charge}` (reste dû propre au mois), `anterieur {loyer, charge, depuisIdx}` (dette des mois précédents encore ouverte), `remiseAppliquee`, `arrondi`. Calculé depuis les files existantes : aucun changement d'arithmétique.
   - `sources[].kind` : `'virement' | 'dg' | 'gli'` recopié dans `imputations` (la carte dit « retenu sur le dépôt »).

### B.3 Entrées (toutes injectées, aucune lecture de `DB`, aucune horloge)

```js
// Un lot tel que l'app l'assemble (normalisation = bailsFromRaw étendu à la clé de bail).
LotIn = {
  ref,
  baux: [{ cle /* ref|debut[|_bailUid] */, debut, fin, finEffective, archive, hc, ch, noms,
           ouverture?: { loyer, charge, avance },          // bail.anteriorite (décision 05/10), absent ⇒ rien
           dg?: { verse, retenuAutres, restitue, penalite, date } }],   // restitution enregistrée
  bareme,                                   // DB.loyerBareme (filtré par duMois)
  paiements: [{ id, date, montant /* cr−db */, kind: 'virement'|'gli' }],  // collecteur unique, §B.5
  manques:   [{ id, bailCle, ym, montant, motif, date, _deleted }],         // §D
  debutSuivi: { date: 'YYYY-MM-DD', source: 'acquisition'|'logement'|'provisoire' },
}
Opts = { today, dueYm /* fenêtre d'exigibilité, finances-window.js */, graceLast, seuilArrondi: 1 }
```

### B.4 Sorties

```js
suiviLot(lotIn, opts) → SuiviLot = {
  ref, debutSuivi,
  baux: [SuiviBail],
  mois: { [ym]: { solde, retard, avance, bauxActifs: [cle] } },  // Σ des SEULS baux actifs au mois
  horsPeriode: [{ mvId, date, montant, bailCle, regle: 'vacance-avant'|'vacance-apres'|'plus-proche' }],
}
SuiviBail = {
  cle, ref, debut, fin, sorti /* fin < 1er jour du mois regardé */, noms,
  mois: [BailMois],                                // de debutSuivi à aujourd'hui (au-delà de la fin si paiement tardif)
  position: { retardLoyer, retardCharge, avance, solde },   // au dernier mois exigible
  traces: [{ type: 'arrondi'|'dg'|'gli'|'manque', ym, montant, ref }],
}
BailMois = {
  ym, du: { hc, ch, total }, exigible,
  recu,                                    // argent daté de ce mois attribué à ce bail
  imputations: [{ mvId, date, kind, montant, poste: 'loyer'|'charge' }],   // qui a payé CE mois (avance antérieure comprise)
  courant: { loyer, charge },              // manque propre au mois → « Juillet : il manque X »
  anterieur: { loyer, charge, depuis },    // → « reste dû des mois précédents : X (depuis …) »
  retard, avance, solde,                   // position de fin de mois : solde = avance − retard ; jamais retard ET avance
  manque: { id, montant, motif, date } | null, arrondi,
  paye /* courant == 0 */, soldeQuittance /* compat peutQuittancer */,
}
suiviPerimetre(lots: SuiviLot[], ym) → {           // la case du tableau ET la fenêtre unique
  ym, solde /* Σ lots, signé — valeur de la case */, retard, avance,
  enRetard: [Carte], enAvance: [Carte], aJour: [{ ref, noms }], sortis: [Carte],  // triés par montant décroissant
  phrase: { nbRetard, nbAvance, nbManques },
}
Carte = { ref, bailCle, noms, du, recu, imputations, courant, anterieur, manque, solde }
```

Adaptateurs de compatibilité (pour brancher sans casser, supprimés en fin de chantier) :
`versByLot(suiviLot, annee)` → forme `byLot` actuelle ; `versEtatMoisLot(suiviBail)` → forme `etatMoisLot` (`list`, `byYm`, `paiements`, `datePaiement`) pour `peutQuittancer`, `moisProposables`, `datePaiementMois`, `mentionDateRecu`, `moisRailLot` ; `lignesRelanceBail(suiviBail, {toleranceActive})` ; `detteBail(suiviBail)` → `{loyer, charge, avance}` (= `_computeDetteBail`).

### B.5 Collecteur unique des paiements
`collecterPaiements(mouvements, { ref, catLigne, isGli })` : `qui` = ref (tolérant `_nr`), ligne 211 par `catLigne` (alias M-1 compris, comme `_finCatLigne`), **`cr − db`** (fin de C12 : ② ne comptait que `cr>0`), tombstones filtrés, `kind:'gli'` seulement si Q4 = oui. Le dépôt (catégorie `special`) n'y entre jamais. Le P&L garde son propre filtre de périmètre (poids SCI) : le suivi est **par lot entier** (poids 1), le périmètre ne fait que choisir les lots.

---

## C. Algorithme d'imputation

### C.1 Pas à pas (par lot)
1. **Baux** : vivants, triés, **tronqués** (l'ancien finit la veille du suivant, C4). Fin = `finEffective`, sinon fin papier si archivé, sinon ouverte (tacite reconduction, C7).
2. **Début du suivi** du lot `S` : `immeuble.dateAcquisition` / exception logement quand R0-C antériorité sera livré ; **en attendant, 1er jour du mois du 1er loyer encaissé**, marqué `provisoire` (« à confirmer », décision 05/10 b). Au mois, pas au jour : un 1er loyer reçu le 09/03 paie mars entier. Sans aucun paiement : début du bail ouvert (zéro paiement = pire retard).
3. **Segment de chaque bail** = [max(début du bail, S), fin]. Un bail entièrement antérieur à `S` est ignoré.
4. **Attribution des paiements par date bancaire** (au jour) : au bail dont le segment contient la date ; hors de tout segment → règle de vacance (Q3, reco : le bail le plus proche dans le temps), tracée dans `horsPeriode`.
5. **Règlements sans virement** (comptés comme encaissés sur le bail, jamais comme mouvement 211) :
   - retenue sur dépôt = `dgPaid||dg − dgRetenu − (dgRestitueMontant ?? dgRestitue) + dgPenaliteArt22`, datée de la fin effective ; formule dérivée des champs écrits par `_dgConfirmerRestitution` (`app-part2.js:26279-26287`) et de l'ancien champ `dgRestitue` présent dans l'export. À remplacer par un champ explicite `bail.dgRetenueLoyer` écrit à la restitution (R0-C lot 2) ;
   - indemnité GLI si Q4 = oui.
6. **Passe par bail** (`_loyerArrearsPass`, `carry:true`), mois par mois de `S` à aujourd'hui : `pool = report d'avance + reçu du mois` →
   **1** loyer du mois → **2** charges du mois → **3** arriérés de loyer, plus vieux d'abord → **4** arriérés de charges → **5** reliquat = avance reportée (H-1, `CDC-FINANCES.md:246`). Puis manque accepté du mois (même ordre, plafonné). Puis arrondi < 1 €.
   Mois non exigibles (> `dueYm`) : dû compté **s'il est payé**, manque neuf ignoré (`graceLast`, règle existante). Ouverture `bail.anteriorite` semée au 1er mois (option `opening` existante, `:336-346`).
7. **Lot / périmètre** : la case d'un mois = Σ des soldes des baux **actifs** ce mois-là (un bail sorti n'entre plus dans le lot ; il part dans `sortis`, décision 2). Colonne Année = position au dernier mois exigible (maquette 01 : année = −20 €, pas Σ des mois → exception assumée à T-1).

### C.2 Cas Arslan, au centime
**Ancien bail** (700 HC, 0 charges, fin effective 13/04/2026). Suivi provisoire : 1er loyer le 09/03 → mars.

| Mois | Dû | Reçu / règlement | Imputation | Fin de mois |
|---|---|---|---|---|
| mars | 700,00 | 09/03 : 700,00 | loyer 700,00 | 0 |
| avril | 700 × 13/30 = **303,33** | retenue dépôt 303,00 (700 − 150 − 247) | loyer 303,00 | dette 0,33 < 1 € → **soldée, trace « arrondi 0,33 € »** → 0 |

Bail sorti à partir de mai, reliquat 0 : rien n'apparaît nulle part.

**Bail Arslan** (760 HC + 20 charges, début 03/05/2026).

| Mois | Dû | Reçu (date bancaire) | Imputation H-1 | Fin de mois (case) |
|---|---|---|---|---|
| mai | 710,97 + 18,71 = **729,68** (29/31) | 04/05 : 730,00 | loyer 710,97 · charges 18,71 · reliquat 0,32 | avance 0,32 < 1 € → **trace « arrondi »** → **0** |
| juin | 780,00 | 02/06 : 780 · 27/06 : 780 | 02/06 → loyer 760, charges 20 ; 27/06 reporté | **+780,00** (avance) |
| juillet | 780,00 | — | avance du 27/06 → loyer 760, charges 20 | **0** (« payé d'avance le 27/06 ») |
| août | 780,00 | 05/08 : 760,00 | loyer 760 · charges 0 | **−20,00** (charges) → manque accepté 20 (« panne électrique », 05/08) → **0** |
| septembre | 780,00 | 01/09 : 780 | loyer 760, charges 20 | 0 (sans le geste : « ✅ septembre payé · ⚠ reste dû des mois précédents : 20 (depuis août) », −20) |
| octobre | 780,00 | 02/10 : 780 | loyer 760, charges 20 | 0 |

Résultat : retard du lot **0** (KPI 323,01 → 0 ; onglet Loyers 1 723,01 → 0) ; avance 0 au 05/10 ; la ligne d'écart vaut 0 / 0 / +780 / 0 / −20 / −20 / −20 de avril à octobre sans le geste, et 0 partout sauf juin (+780) avec le geste. Identique à la maquette 01 (`data-b` : août −20, sept. +29,90 = +49,90 [Ferrette - 104] − 20, oct. −20).
Contrôle prototype : sans l'arrondi mensuel, août vaut −19,68 (les 0,32 de mai reportés) ; la règle « < 1 € » est donc nécessaire pour retrouver le −20 de la maquette.

### C.3 Lot à dette ancienne (loyer du mois payé + reste dû)
Bail 650 + 10, dû 660/mois. Février : 538 reçu → loyer 538, manque 112 loyer + 10 charges = **122**. Mars → juillet : 660 reçus chaque mois → chaque mois paie **d'abord son propre loyer et ses charges** (1, 2), il ne reste rien pour l'arriéré (3, 4).
Carte de juillet : « Loyer attendu 660 · Reçu 660 (virement du …) · ✅ juillet : payé · ⚠ reste dû des mois précédents : 122 (depuis février) · [Accepter le manque] (montant pré-rempli 122) ». `courant = 0`, `anterieur = {loyer 112, charge 10, depuis 2026-02}`. La relance réclame les mêmes 122 € (lignes : loyer de février 112, provisions de février 10).

---

## D. « Manque accepté »

**Où** : une entrée du journal du bail `DB.baux_evenements`, `type: 'manque_accepte'`. Raisons :
- concurrence **ligne par ligne** gardée par version (`store-sync.js:82`), alors que le blob de configuration (où vit `loyerBareme`) est réécrit en entier, dernier écrivain gagnant (`store-supabase.js:260-262`) : deux appareils perdraient un geste ;
- RLS par entité déjà en place (`entite_of_bail`, 0030/0053), alors qu'une clé de configuration devrait être ajoutée à la liste blanche des membres limités à une SCI (`0051_espace_config_scoped_allowlist.sql:45-55`) ;
- même sens que le journal : « événement rattaché au bail, sans toucher le bail » (en-tête de 0054) ;
- les lecteurs existants filtrent par type : `journalDuBail` ne réapplique que `type === 'modification'` (`bail-modifications.js:340`), `backup.js:129` que `'avenant'`. La purge et l'export RGPD par lot l'incluent déjà (`rgpd.js:48`) ; c'est voulu, car le motif est du texte libre.

**Champs** : `{ id: 'mqa_' + uid, type: 'manque_accepte', ref, bailDebut, bailUid?, ym, montant, motif /* obligatoire, trim ≠ '' */, date /* du geste */, auteur?, _modifiedAt, _deleted?, _espaceId? }`. Clé = `id`. `date_evenement` = `date`.
**Synchro** : `store-mapping.js:174-181` mappe tout type inconnu en `'autre'` et garde l'objet entier dans `legacy_raw`, **donc ça fonctionne sans SQL**. Pour la lisibilité côté serveur : migration additive `0056` qui ajoute `'manque_accepte'` à la contrainte (même modèle que 0054) et liste blanche du mappeur, **migration déployée avant le client** (sinon le contrôle refuse l'insertion). Le rattachement `bail_id` d'un bail archivé suit le chemin des avenants (`_rattacherJournal`, `store-sync.js:405-415` : même logement, même début).
**Écriture (app)** : `_undoOp('Accepter le manque', …)` → push → `_stamp(e)` → `_auditLog('manque-accepte', 'bail', ref, …)` → `saveDB({ quoi: 'manque' })` → `_refreshAfterMutation()`. **Annulation** = tombstone (`_deleted: true` + `_stamp`) : l'envoi passe par la suppression douce gardée par version. Une nouvelle acceptation crée un **nouvel id**, jamais de résurrection.
**Garde-fous** : `_appReadOnly` (`app-part3.js:346`, testé comme `app-part2.js:2950`) ; hors ligne, `saveDB` refuse toute écriture non étiquetée (`app-part1.js:2539-2542`) : le geste est refusé avec le message existant, on ne l'ajoute pas à la liste blanche hors ligne. Sandbox (`_isTestMode`, `app-part1.js:159-169`) : clé localStorage séparée, aucun cas particulier. Montant > dette du mois pré-remplie : refusé à la saisie ; plafonné dans le moteur (défense en profondeur).
**Effet sur le calcul** : `remise` du mois `ym` du bail (§B.2). Il solde le retard affiché, la relance, le KPI et la quittançabilité du mois. Il **ne modifie ni le bail, ni le barème, ni les mouvements**. Il n'est jamais un encaissement : 2044, cash-flow et passe fiscale sont inchangés (preuve par l'instantané, §F). Si le locataire paie ensuite ce qu'il devait, ce paiement devient de l'avance : le geste est daté et reste annulable.
**Trace visible** : carte « ✅ Soldé : manque de 20 € accepté (panne électrique · 05/08) [Annuler] », frise du bail dans la fiche, journal d'audit.
**Livré en P2 (sans écran)** : helpers purs `js/core/manque-accepte.js` (`validerManque`, `nouveauManque`, `annulerManque`, `trouverManque`, `bailDuManque`, `rattachementManque`, `manquesDuLot` → format exact de `suiviLot({manques})`, rattachement = celui de `lotDepuisDb`), exposés sur `window.ManqueAccepte` ; écriture app `_manqueAccepter({ref, bailDebut, ym, montant, motif, date, dette})` / `_manqueAnnuler(id)` (`app-part1.js`) — `dette` (ce qui manque sur le mois, pré-rempli par l'écran P4) est le plafond **obligatoire** ; `store-sync._rattacherJournal` recale le manque sur la ligne du bail vivant de même début avant son 1er envoi (comme un avenant ; bail archivé : uid de création conservé) ; mappeur + migration `0056` (non appliquée) + simulation `supabase/tests/sim/0056-*`. **Ordre de déploiement : migration 0056 AVANT le client.**
**Livré en P4 (v15.713, écrans)** : fenêtre unique « avance / retard » (`_finFenetre`, `app-part2.js`) et alerte « loyer incomplet » de Mouvements, mise en forme pure `js/core/suivi-fenetre.js` (`modeleFenetre`, `cibleManque`, `indexMouvementsLot`, `controlerSaisie`). **Mois du geste** (`cibleManque`) : le mois REGARDÉ, plafond = sa dette de fin de mois (courant + antérieur, ce que la carte affiche ; la remise H-1 solde d'abord le mois puis la dette ancienne, les mois passés gardent leur retard — I-1) ; sous la tolérance du 10, le mois PRÉCÉDENT (sinon la remise viserait d'abord le loyer pas encore dû) ; locataire parti : le DERNIER mois de son bail (le moteur ignore un manque hors des mois du bail). Depuis Mouvements : le mois que le virement a payé et qui reste incomplet (`residu` > 0), plafond = ce reste.
**Livré en P5 (v15.714, lecteurs)** : `_loyerEtatLot(ref, {graceLast, baux})` (app-part1.js) n'a plus de moteur : il lit le suivi de Finances (`_finSuiviLot`, sans tolérance pour les quittances, avec pour le retard affiché) via `versEtatLot` (forme etatMoisLot d'un lot, bail par bail ; `baux:'visibles'` = baux actifs + parti visible, la case de Finances). Relance par bail (`_lyRelance(ref, bailCle)` → `lignesRelanceBail`, courrier adressé au locataire du bail). Quittance d'un mois soldé par un manque accepté : `remiseRecue` (suiviLot, rattachée au mois qu'elle solde) → `ligne.remise` → `q.remise` figée à l'émission et à la réédition ; total = dû − remise, mention « Remise accordée : X € (motif) ». Restitution : `_rgClotureImpayes(ref, from, to, bailDebut)` → `detteBailAvantDepot` (dette de loyer du bail SANS la retenue sur son dépôt : jamais comptée deux fois). **Régularisation non modifiée** : `computeRegul` (app-part1.js, bloc « Provisions ») compte la provision d'un mois dès qu'un loyer y est encaissé (au `bail.ch` actuel) ; le manque d'août d'Elise n'est donc pas réclamé (provision comptée versée), mais un mois SANS encaissement soldé par un manque verrait sa provision réclamée, et juillet (payé d'avance le 27/06) l'est déjà à tort (défaut CDC-R0C 290-294). Correctif = lire les provisions dans le suivi, sujet R0-C.
**Livré en P6 (v15.715, bandeau / Accueil / Pilotage)** : adaptateur pur `versFrise(suivi, annee, {monthlyFull})` (forme historique de la frise : `months[{mi, cls, recu, attendu, due}]`, `solde`, `curMo`… + `retard`, `avance`, `solde` par mois) ; une case = position de fin de mois du lot (baux actifs + parti visible l'année affichée) : `imp` (loyer du mois manquant et retard ≥ dû du mois), `warn` (manque partiel ou mois payé portant une dette ancienne), `ok`, `avance`, `vac` (`horsSuivi` avant le 1er loyer encaissé), `avenir` (mois non échu, ou mois courant non payé sous la tolérance du 10) ; solde = position au dernier mois exigible = `byLot.solde`. `_suiviLoyerStrip` → `_finSuiviLot` + `versFrise` ; `_v4ComputeLotStatus` porte `retard` (vue année = position) et la dette d'un parti sur un lot vide ; bandeau : lots loués + lots dont seul un parti doit encore ; `pilotagePay` : membre de la bulle → `neg` même hors bail (matrice == bulle, Q2). `suiviLot` expose `graceLast` (additif). Bulle, KPI de recouvrement, matrice, téléphone : déjà sur `byLot` (P3), vérifiés au centime.
**Livré en P7 (v15.716, suppression du code mort)** : retirés `_computeLoyerStatut`, `_computeLoyerCumul`, `_loyerSoldeAjuste`, `_loyerChipVerdict`, `_loyerSplitCascade`, `_computeLoyerArrears` (loyer-statut.js, qui ne garde que `_computeLoyerChargeAlloc`, `_loyerTodayLocal`, `_loyerToleranceActive`, `_LOYER_TOLERANCE_JOUR`), `etatMoisLot` (loyers-mois.js), `_debutSuivi` et `_computeLoyerNetting` (loyer-du-mois.js), leurs expositions `window.*` (main.js) et, dans finances-monthly.js, le repli « ancien netting » (`_openingOf`, pré-exercice, tolérance recalculée, byLot par frise). Sans `suivi` injecté : retard / avanceLot / ecart / byLot / lotsEnRetard = 0 / vide, passe fiscale intacte (≥ 300 jeux identiques à la copie figée). Copie figée des anciens moteurs : `docs/subjects/FINANCES-SUIVI-UNIQUE/legacy/*.mjs` (utilisée par snapshot-avant.mjs, compare-moteurs.mjs, repro-arslan-101.mjs ; non chargée par l'app). `loyer-statut.js` garde son nom (module réduit : la passe fiscale y vit) ; `_loyerArrearsPass` garde l'option `carry:false` (testée, plus appelée par l'app).
**Livré en P8 (v15.717, contre-audit final + décisions sans écran)** :
- **Arrondi** : `seuilArrondi` = plafond CUMULÉ par passe (= par bail) : Σ |arrondis| < 1 €. Choisi plutôt que « seulement en fin de bail » parce que le cas mai d'Elise (0,32 € d'avance sur un bail EN COURS) doit rester soldé (maquette : août −20, pas −19,68). Les arrondis portent leurs `cibles` (mois d'origine de la dette soldée) → `BailMois.arrondiRecu` → `versEtatMoisLot` le verse dans `remise` (motif `MOTIF_ARRONDI`) : la quittance d'avril de l'ancien locataire atteste 303 € (reçus), plus 303,33. Une avance abandonnée (< 1 €) ne crée pas de remise : la quittance dit le loyer du mois, jamais plus que reçu.
- **Q3** : `horsPeriode[]` porte `avantCle` / `apresCle` ; `indexAConfirmer` / `texteQ3` (suivi-fenetre.js) ; alerte Mouvements `_mvQ3Info` (même index mémoïsé que l'alerte P4) / `_mvQ3Alerte` / `_mvQ3Geste` (app-part2.js) ; écriture `_mvQ3Choisir(id, cle)` (app-part1.js, patron `_manqueAccepter`, `saveDB({quoi:'attribution'})`). Le choix (`mv.bailCle`) fait foi ; clé retrouvée malgré la casse de la référence ou une ligne cloud `|uid` posée après le choix (seul bail du même logement et du même début). Synchro : le mouvement entier voyage dans `legacy_raw` (aller-retour testé).
- **Début de suivi provisoire** : `mentionDebutSuivi(suivi)` (seulement si un bail commence avant le début du suivi) → carte de la fenêtre, ligne du bandeau « Tous les loyers » + légende. Sur l'export : 19 lots sur 26.
- **Manques** : `BailMois.manques[]` (un id par geste, part appliquée répartie dans l'ordre des gestes) ; `manque.id` n'est plus jamais composite (`null` + `ids` s'il y en a plusieurs).
- **Parti avec avance** : `mois[ym].partisAvance` / `aRendre` (même règle d'année que la dette), `suiviPerimetre().aRendre`, groupe « À rendre » de la fenêtre, HORS de la case (I-d intact).
- **Restitution** : `restitutionEnregistree(bail)` exportée (suivi + assistant de départ) ; `_rgApplyRetenue` écrit `dgRestitueMontant` (0 compris). Effet de bord voulu : la frise du bail montre « Restitution du dépôt de garantie — enregistrée · date manquante » tant que le virement n'est pas daté.
- **Échec de calcul d'un lot** : `_finSuiviLot` mémorise l'échec (`_finSuiviEchec`), `console.error` avec le lot, alerte « Calcul indisponible » dans la fenêtre, puce « calcul indisponible » dans le bandeau.
Tests : `__tests__/helpers/finances-suivi-p8.test.js` (35, vus en échec avant correction : 29 rouges sur af186da).

**Migration des données** : aucune (aucun manque n'existe). Le contournement passé « Corriger une période » (baisse du barème) n'est pas converti, car on ne sait pas le distinguer d'une vraie correction.

---

## E. Compatibilité et migration (strangler)

### E.1 Chemin
1. **Instantané avant** : sorties actuelles de ①②③ et P&L fiscal sur l'export réel et sur les jeux des tests existants (JSON figé).
2. **Construire à côté** : `suivi-loyers.js` + extensions B.2, aucune surface touchée. Le script de comparaison (§F.2) tourne sur l'export.
3. **Brancher les lecteurs un par un** sur les adaptateurs (`versByLot`, `versEtatMoisLot`), un commit par famille, avec le diff expliqué à chaque fois.
4. **Supprimer** : `_openingOf` et le netting par lot de ①, `_computeLoyerStatut`, `_computeLoyerCumul`, `_suiviLoyerStrip`, `_finDrillAvance`, la règle `_finLotStartMi`/`_getLogementStartIso` pour le dû, `_debutSuivi`, les 3 sous-lignes, puis les adaptateurs.

### E.2 Ce qui peut casser
| Zone | Risque | Garde |
|---|---|---|
| KPI / Accueil / Pilotage | `annual.retard` change de nature (Σ des résidus → position de fin de période) ; les lots dont le locataire est sorti quittent la bulle (Q2) | `impayes-perimetre.test.js`, `r0-source-unique.test.js` réécrits sur l'adaptateur ; égalité bulle = Finances = onglet Loyers |
| Relances / mise en demeure | `_lyRelance(ref)` prend un lot ; il faut le bail (locataire sorti) | même source que la carte, test d'égalité au centime |
| Quittances | `peutQuittancer` sur un mois soldé par un manque accepté (Q1) ; les mois avant le début de suivi deviennent « hors suivi » | `quittance-editeur.test.js`, `loyers-dates-imputation.test.js` via `versEtatMoisLot` |
| Restitution du dépôt | `_calculerSoldeDG` lit `_rgClotureImpayes` → `_loyerEtatLot` (`gestion-dg-impayes.js:129-135`) | rebranchée sur `detteBail().loyer` (R0-C lot 2) ; la retenue lue comme règlement ne doit pas se compter deux fois (`dgRestitue` n'est pas une dette) |
| Régularisation | `computeRegul` compte la provision d'un mois payé au `bail.ch` actuel (`CDC-R0C.md:290-294`) ; un manque accepté sur les charges sera réclamé à la régul (Q1) | hors périmètre, à signaler |
| 2044 / P&L fiscal | aucun (passe fiscale intouchée) | instantané : `loyersHC`, `provisions`, `base2044` identiques au centime |
| Performance | calcul sur toute la vie du bail à chaque rendu | mémoïsation `_dbGen` + jour (patron `_loyerEtatLot` `app-part1.js:9018-9023`) ; budget mesuré en P3 |

### E.3 Tests existants qui changent, et pourquoi (réécrits, jamais supprimés en douce)
| Test | Ce qu'il encode | Pourquoi il change |
|---|---|---|
| `finances-monthly.test.js:194` | retard mensuel = **résidu du mois d'origine**, annuel = Σ (décision 13/07) | maquette validée le 06/10 : « solde du bail à fin de mois » (−20 répété en sept. et oct.). Réécrit en position + test du résidu conservé pour la cause (`courant`/`anterieur`) |
| `finances-monthly.test.js:211` | « l'avance d'un lot ne masque pas le retard d'un autre, jamais sur le net » | la case est désormais **nette** (maquette : +29,90 = +49,90 − 20) ; le KPI retard reste Σ des retards, jamais net → l'assertion passe sur `retard`, on ajoute `solde` net |
| `finances-bylot.test.js:83, :90` | `annual.avance` = Σ des avances non compensées ; Σ des mois = annuel | avance compensée (position) ; Σ reste vrai pour dû et encaissé, pas pour les positions |
| `finances-ouverture-arriere.test.js` (6) | ouverture N-1 **par lot** via `_openingOf` | calcul sur la vie du bail ; mêmes scénarios, mêmes chiffres attendus sur un bail unique, assertion via le nouveau moteur. Ajout du cas C de R0-C (dette d'un ancien bail jamais imputée au suivant) |
| `loyer-du-mois.test.js:276-293` (`_debutSuivi`) | début = bail, borné au 1er janvier (C6) | décisions 01/10 et 05/10 : jamais avant l'entrée en jouissance ; début provisoire = 1er loyer. Réécrit sur `debutSuivi` injecté + test « source provisoire » |
| `loyer-statut.test.js` (`_computeLoyerStatut`, `_computeLoyerCumul`) | pool annuel sans report | moteur supprimé ; scénarios portés sur `suiviLot` (frise du bandeau), puis tests du module retirés **avec** le module |
| `loyers-mois.test.js` | verdict par lot | conservé tel quel via `versEtatMoisLot` (contrat identique) ; ajout du cas « 2 baux sur le lot » |
| `finances-etape2-invariants.test.js:219` | sous-ligne rattrapage | **inchangé** côté moteur (champ fiscal conservé) ; seul l'affichage de la sous-ligne disparaît |
| `arriere-ouverture.test.js` | option `opening` | **inchangé** : sert à `bail.anteriorite` |

---

## F. Plan de tests

### F.1 Vitest (nouveaux fichiers `__tests__/helpers/suivi-loyers*.test.js`, `manque-accepte.test.js`)
Unitaires (écrits avant le code, vus en échec) :
1. **Arslan** : tableau C.2 au centime (2 baux, prorata 29/31, avance juin → juillet, août −20, arrondis 0,32 et 0,33 tracés, retenue de 303 sur le dépôt), avec et sans le geste.
2. **Ancien locataire** : sa dette n'entre jamais dans le lot suivant (cas C de R0-C : 1 400 € loyer + 100 € charges sur le bail 1, 0 € et 750 € d'avance sur le bail 2).
3. **Manque accepté** : solde le mois ; plafond ; aucune avance créée ; annulation ⇒ sortie identique à l'avant (égalité profonde) ; tombstone ignoré ; geste sur la dette ancienne.
4. **Avance sur 2 mois et plus** : 3 loyers payés en janvier → février et mars soldés, jamais retard et avance ensemble ; imputations datées du virement de janvier.
5. **Prorata** d'entrée et de sortie, et transition intra-mois (Σ des baux = `duMois` du lot).
6. **Locataire sorti** : reliquat dans `sortis`, hors `mois[ym].solde` du lot ; paiement tardif après la sortie attribué à son bail.
7. **Colocataires** : 2 virements de 2 payeurs le même mois → un seul bail, `imputations` de 2 lignes.
8. **2 baux qui se chevauchent** sur un lot : troncature C4, aucun dû doublé.
9. **Lot vacant** : aucun dû ; paiement en vacance → règle Q3, tracé `horsPeriode`.
10. **Mouvement sans lot** : ignoré par le suivi, visible en `nonAffecte` (H-2).
11. **Paiement en deux fois** (dans le mois ; à cheval 28/05 + 03/06).
12. **Lot à dette ancienne** (C.3) : `courant = 0`, `anterieur = 122 depuis février`, relance = 122.
13. **`cr − db`** : un avoir 211 réduit le reçu (C12).
14. **Tolérance < 10** : manque neuf du mois courant ignoré, dette ancienne visible.
15. **Ouverture** `bail.anteriorite` (arriéré et avance).
16. **Début de suivi** : aucun dû avant `debutSuivi` ; `source: 'provisoire'` rendu.

Invariants « property-style » (PRNG à graine fixe, ≥ 300 jeux : 1 à 3 baux, entrées et sorties à jour quelconque, 0 à 2 révisions IRL par le vrai chemin `periodeInitialeBail` + `appliquerNouvellePeriode`, paiements exacts, partiels, absents, doublés, d'avance, tardifs, manques aléatoires) :
- I-a jamais `retard > 0` et `avance > 0` sur un bail le même mois ;
- I-b conservation : Σ imputations + avance finale + arrondis = Σ paiements + règlements ; Σ imputations ≤ Σ dû ;
- I-c Σ baux = `duMois(lot)` chaque mois ; aucun dû hors segment ni avant `debutSuivi` ;
- I-d Σ cartes de la fenêtre = valeur de la case = Σ lots ; colonne Année = position au dernier mois exigible ;
- I-e ordre H-1 : dans chaque mois, aucune charge du mois imputée avant que le loyer du mois soit couvert, aucun arriéré avant le mois courant, arriérés loyer avant charges, plus vieux d'abord ;
- I-f I-1 : `surfacesSocle` (`finances-invariant-i1.js:90`) + surfaces « case », « carte », « relance », « dette de bail » → aucun mois figé ne bouge après l'IRL d'août ;
- I-g relance = carte = KPI du bail au centime ;
- I-h fiscal : `loyersHC`, `provisions`, `base2044` du P&L identiques à l'instantané avant chantier ;
- I-i un manque n'a aucun effet hors de son bail et de ses mois ≥ `ym`.
Câblage (tests de source, patron `*-cablage.test.js`) : plus aucun appel à `_computeLoyerStatut`, `_openingOf`, `_finDrillAvance` ; `window.suiviLot` exposé par `main.js`.

### F.2 Preuve sur les données réelles
Script versionné `docs/subjects/FINANCES-SUIVI-UNIQUE/compare-moteurs.mjs <export.json> [aujourdhui]` (lecture seule, aucune donnée versionnée) : pour chaque lot, ①②③ face au nouveau moteur (retard des baux actifs, avance, reliquat des sortis, arrondis, règlements). **Chaque écart doit recevoir un code de cause, sinon le script échoue** : `DEBUT_SUIVI`, `PAR_BAIL`, `AVANCE_NON_COMPENSEE`, `CR_DB`, `ARRONDI`, `DG`, `HORS_PERIODE`, `BANDEAU_ANNUEL`, `GLI`. Lancé à chaque phase ; sortie collée dans le message de commit.

Premier passage du prototype (export du 05/10, 26 lots) :
- **23 lots** : retard nouveau = retard Finances au centime (un seul bail, début au 1er versement dans les deux cas).
- **Avance + retard simultanés dans Finances sur 8 lots** (`AVANCE_NON_COMPENSEE`, défaut C2 / lot E), par exemple F-201 : retard 430 et avance 430 ; D-106 : 1 522,72 et 317,28. Nouveau moteur : avance 0 sur ces 8 lots.
- **Ferrette - 101** : 323,01 → 0 (`PAR_BAIL` + `DG` + `ARRONDI` + manque).
- **F-Local** : 750 de retard du lot → 750 dans « locataires sortis » (bail fini le 31/08, aucun bail actif).
- **FERRETTE 001** : Finances 0 / +404,90 → bail actuel +494,90 (le 495 € du 16/07, 2 jours avant l'entrée, est probablement un dépôt classé en loyer : question ouverte de la maquette) ; ancien bail : reliquat de 90 € (1er au 6 juin), le dépôt ayant été retenu en entier en `dgRetenu`. Le +404,90 de la maquette = 494,90 − 90, c'est-à-dire l'ancien calcul par lot.
- **Onglet Loyers** plus haut que Finances sur 17 lots (`DEBUT_SUIVI` : janvier contre 1er versement ; `CR_DB` sur F-002 ; `HORS_PERIODE` sur F-001, virement du 05/02 avant le bail) : D-104 4 783,44 → 2 983,44 ; Ferrette - Bar, 102, 103, 104 → 0.
- **Ferrette - 104** : +49,90 fin septembre (réel), consommé en octobre → 0.
- **D-105** : 5 378,76 dans tous les moteurs, alors que la maquette compte l'indemnité GLI du 20/05 (1 209,25 €) comme reçue → Q4.

---

## G. Découpage (1 phase = 1 commit testable, version bumpée, BACKLOG mis à jour à la livraison)

| # | Contenu | Test de sortie | Jours |
|---|---|---|---|
| P0 | Instantané avant (①②③ + fiscal) + `compare-moteurs.mjs` | script vert sur l'export, sorties figées | 0,5 |
| P1 | `suivi-loyers.js` + extensions B.2 (`duMois` `bailDebut`, `remise`, `seuilArrondi`, `courant`/`anterieur`), exposé dans `main.js`. **Aucun écran** | F.1 1-16 + invariants, 100 % des tests existants verts | 2 |
| P2 | Entité manque accepté : helpers purs, mappeur + migration 0056 + simulation SQL (modèle `supabase/tests/sim/0054-*`), écriture/annulation dans l'app (sans UI) | `manque-accepte.test.js`, test de synchro (`store-sync.test.js`) | 1 |
| P3 | Finances : `_finMonthly` injecte baux/manques/règlements ; `finances-monthly.js` lit le suivi pour retard/écart/`byLot` ; ligne unique « Avance / retard du lot » ; Année = position ; mois récent à gauche (graphique) ; un seul sélecteur de bailleur. Tests E.3 réécrits | invariants I-d, I-h ; navigateur 3 formats, clair et sombre | 2 |
| P4 | Fenêtre unique (remplace `_finDrillRetard`/`_finDrillAvance`), geste « Accepter le manque » + Annuler, alerte dans Mouvements | maquette 02/03 reproduite ; 3 formats ; touch ≥ 44 px, inputs 16 px | 2 |
| P5 | Onglet Loyers, relances, quittances, fiche logement via `versEtatMoisLot` ; `_lyRelance` par bail ; `_calculerSoldeDG` → `detteBail` (en commun avec R0-C lot 2) | I-g ; tests quittance verts | 1,5 |
| P6 | Bandeau « Tous les loyers » + Accueil/KPI/Pilotage sur le suivi | bulle = Finances = Loyers au centime | 1 |
| P7 | Code mort (§E.1 4) et adaptateurs ; tests du code supprimé retirés dans le même commit | câblage ; compare-moteurs sans code non expliqué | 0,5 |

**Total ≈ 10,5 j** (+ audit `superpowers:code-reviewer` à chaque phase, environ 0,25 j). Sandbox d'abord (`?sandbox=1`), `node tools/stamp-app-parts.mjs` après toute modification de `app-part*.js`.

**Risques principaux**
1. **Beaucoup de chiffres bougent en même temps** (Finances, Loyers, Accueil) : début de suivi provisoire, fin des avances fantômes, sortie des locataires partis. Parade : `compare-moteurs` avec une cause par écart, bandeau « à confirmer » sur le début de suivi provisoire, livraison par familles (P3 → P6).
2. **Attribution par bail sur des données anciennes** : paiements en vacance (Q3) et retenue sur dépôt **déduite** de champs ambigus (`dgRetenu` mêle réparations et régul ; deux noms `dgRestitue`/`dgRestitueMontant`). Cela touche l'acte de restitution, qui est opposable. Parade : trace `horsPeriode`/`dg` visible, champ explicite écrit dès R0-C lot 2.
3. **Changement de nature de `byLot`** (résidu → position), lu par environ 15 appelants : parade par l'adaptateur `versByLot`, mémoïsation, tests E.3 réécrits avant le branchement.

---

## H. Questions pour Didier (ce qui change l'affichage) et signalements

**Q1 · Sur quoi porte un manque accepté : loyer ou charges ?** Avec H-1, le manque d'août d'Arslan (760 reçus sur 780) tombe sur les **charges** (provision de 20 €). Conséquences : (a) la future régularisation lira « 20 € de provision non versée » et les réclamera ; (b) la quittance d'août : le mois est-il quittançable, et pour quel montant ?
*Reco* : le geste solde ce qui reste, dans l'ordre H-1, sans rien réimputer (2044 inchangée) ; la régularisation traite un manque accepté sur les charges comme une **provision abandonnée** (pas réclamée) ; la quittance d'août est émise pour le montant reçu (760 €) avec la mention « remise accordée : 20 € (motif) ». Le reçu reste conforme à l'art. 21.

**Q2 · Où voir la dette d'un locataire parti, et compte-t-elle dans « Impayés » ?** La décision 2 la sort du lot. Exemples réels : F-Local 750 €, FERRETTE 001 90 €.
*Reco* : groupe « LOCATAIRES SORTIS » dans la fenêtre (après « En avance »), une ligne dans l'onglet Loyers, et **comptée** dans la bulle Impayés de l'Accueil avec la mention « parti ». Elle reste hors de la case du lot et hors de la ligne d'écart de Finances.

**Q3 · Un virement reçu pendant une vacance entre deux baux, à qui ?** Cas réels : FERRETTE 001, 732 € les 16/07, deux jours avant l'entrée du nouveau locataire (l'ancien est parti le 06/06) ; F-001, 620 € le 05/02, avant un bail qui commence le 14/03. La règle R0-C Q4 (b) « vacance voisine » ne tranche pas quand il y a deux voisins.
*Reco* : le bail **le plus proche dans le temps** (FERRETTE 001 → nouveau locataire), avant le premier bail → premier bail, après le dernier → dernier bail. Toujours tracé (« reçu avant l'entrée »), avec l'exception manuelle « ce virement paie… » prévue le 05/10, à livrer plus tard.

**Q4 · Une indemnité GLI règle-t-elle la dette du locataire ?** Elle est classée en 213 (recette diverse, `app-part1.js:369`), donc aujourd'hui elle ne réduit aucun retard : D-105 affiche 5 378,76 € dans les 3 moteurs. La maquette validée la compte pourtant comme « reçu » (20/05, 1 209,25 €).
*Reco* : oui, comme règlement du bail (même mécanique que la retenue sur dépôt), libellé « réglé par l'assurance (GLI) ». Elle reste en 213 pour la 2044 et n'entre pas dans la relance au locataire, puisque l'assureur est subrogé.

**Signalement 1 — retenue sur dépôt et 2044.** La décision 2 la compte encaissée sur le bail sorti, mais elle n'existe dans aucun mouvement, donc la 2044 l'ignore. Une somme conservée sur le dépôt en paiement de loyers impayés est en principe une recette imposable de l'année où elle est imputée (à vérifier au BOFiP avant d'agir ; je ne l'ai pas confirmé). Ce chantier ne touche pas la 2044 : sujet séparé à ouvrir (lien avec R0-C lot 2).

**Signalement 2 — trois règles validées qui contredisent des règles écrites.** (a) La colonne Année de la ligne d'écart est une position, pas la somme des mois (exception à T-1, `CDC-FINANCES.md:172`) ; (b) la case est nette entre lots (+29,90 en septembre), alors que `CDC-KPI.md:451` dit « jamais retard ET avance simultanés » pour un lot et que le test `finances-monthly.test.js:211` interdit le net. Ma lecture : la règle vaut **par bail**, et le KPI de retard reste non net ; (c) le début de suivi provisoire au 1er loyer encaissé (décision 05/10 b) rend invisibles les impayés d'entrée de bail antérieurs au 1er virement (C6, D-104 : 1 800 € de janvier à mars) jusqu'à ce que la date d'acquisition soit saisie. C'est conforme à la décision, à condition d'afficher « à confirmer ».


---

## I. Décisions de Didier sur les questions du §H (06/10/2026) — VALIDÉES

- **Q1 (manque accepté)** : le geste solde ce qui manque, sans réimputer ; **quittance émise pour le montant reçu** (ex. 760 €) avec la mention « remise accordée : X € (motif) » ; la régularisation de charges ne réclame pas un manque accepté sur les charges (provision abandonnée).
- **Q2 (locataire parti)** : sa dette est **figée au mois de son départ** ; elle reste **visible pendant l'année civile de son départ** (mois suivants de cette année, colonne Année, fenêtre, bulle Impayés, avec la mention « parti »), puis **disparaît de toute visualisation à partir du 1er janvier suivant**. *Précision du 06/10 : l'année qui compte est l'**année affichée** (celle du mois regardé), pas l'année du jour : regarder l'année du départ montre toujours la dette (un bilan 2025 ne change pas le 01/01/2026) ; regarder toute autre année ne la montre pas.* Elle reste consultable seulement sur le bail de l'ancien locataire (calcul de la retenue sur dépôt). **Pas de groupe « Locataires sortis »** dans la fenêtre au-delà de cette règle.
- **Q3 (virement entre deux baux)** : **on demande à l'utilisateur** (alerte dans Mouvements : ancien locataire / nouveau locataire / ce n'est pas du loyer → reclasser). Tant qu'il n'a pas répondu : bail le plus proche dans le temps, marqué « à confirmer ». Choix mémorisé sur le mouvement (synchronisé).
- **Q4 (GLI)** : l'indemnité **ne réduit pas la dette du locataire** (l'assurance couvre, le locataire doit toujours). Le retard et la relance gardent leur montant ; mention visible « couvert par la GLI : X € » (carte du lot, fenêtre, bail). Reste en recette diverse pour la 2044. **La bulle « Impayés » de l'Accueil continue de compter la dette même si elle est couverte par la GLI.**
- **Signalement 1 (retenue sur dépôt et 2044)** : sujet séparé à ouvrir, hors de ce chantier (à vérifier au BOFiP).
