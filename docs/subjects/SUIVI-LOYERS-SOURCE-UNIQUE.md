# SUIVI-LOYERS-SOURCE-UNIQUE — un seul moteur de statut de paiement pour toute l'app

> **Décision user 2026-07-08** (« propose une unification globale et pense au visuel ! » → « ok ») après
> l'audit [AUDIT-FINANCES-COHERENCE-2026-07-07.md](AUDIT-FINANCES-COHERENCE-2026-07-07.md) : 6 formules
> différentes répondent à « ce locataire est-il à jour ? », 5 surfaces sur 11 donnent un verdict faux sur
> le scénario banal « 2 mois payés en janvier, rien en février » (constats 4-9 et 40-45).

## Principe

Le moteur du **Suivi des loyers** (`_suiviLoyerStrip` : allocation chronologique du total encaissé sur
les mois dus + solde signé par locataire) devient **LA source unique**. Toutes les surfaces s'y branchent.
Langage visuel commun : pastille (✓ À jour / ↑ avance / ◐ partiel / ↓ retard), bande 12 mois, tooltip
expliquant le report (« février : couvert par l'avance de janvier »). Mockup validé (widget
`unification_statut_loyer_moteur_et_visuel`, session 2026-07-08).

Décisions gravées :
- **Compte = montant** : « N locataires en retard · X € » = Σ soldes négatifs PAR locataire (une formule).
- **Avances affichées à part** (chip bleue), jamais fusionnées dans « à récupérer ».
- **UNE règle de tolérance** début de mois (constante partagée, réf. `_computeImpayes` jour < 10),
  appliquée partout — fin du « 0 impayé sur l'Accueil, 14 sur Finances ».
- **Le compte de résultat Finances ne change pas** (vue trésorerie, correcte par définition).
- Quittance couverte par une avance = générable (loyer encaissé).

## Phases (1 phase = 1 livraison + audit code-reviewer)

| Ph | Contenu | Statut |
|---|---|---|
| A | **Moteur pur** : extraction de `_suiviLoyerStrip` en module `js/core/loyer-statut.js` (TDD Vitest, résolveurs injectés, zéro accès DB) + verdict pastille (seuils ±20 €) + constante de tolérance + **mémoïsation** par (ref, année, `_dbGen`, jour local) dans le wrapper. Zéro changement visuel. | ✅ v15.425 |
| B | Accueil + Tableau de bord : donut/hero/cartes lots branchés sur le moteur (cases mois AVEC report, pastilles, tooltip « couvert par avance »), `_computeImpayes` et `_v4ComputeLotStatus` deviennent des façades. Corrige constats 40-41-45. | ✅ v15.427 |
| C | Finances + navigation : widget « Loyers en retard » par locataire (compte = montant, avances à part), tous les clics impayés (Finances, Dashboard, Accueil) → modale Suivi des loyers ; bouton « 📅 Suivi des loyers » ajouté sur l'onglet Loyers/Quittances. Corrige constats 4-9, 22-24. | ⬜ |
| D | Quittances + Pilotage : `_statutQuittance` dérivé du mois couvert par l'allocation ; matrice compta = cases du Suivi. Corrige constats 42-43. | ⬜ |
| E | Régularisation : provisions dues = mois **couverts** par l'allocation (remplace `_moisSet` « mois ayant un paiement »). **Impact fiscal → audit renforcé.** Corrige constat 44 + C3/C4 de l'audit. | ⬜ |

## Journal

- 2026-07-08 : sujet créé, direction + mockup validés par user. Phase A démarrée.
- 2026-07-08 : **Phase A livrée v15.425**. TDD 20 tests verts. Audit code-reviewer PASSANT (parité
  algorithmique exacte vérifiée ligne à ligne) ; 3 correctifs d'audit appliqués : bump `_dbGen` dans
  `_backupRestoreApply` (cache non invalidé après restauration cloud — corrige aussi le trou hérité de
  `_departEstimCache`), date locale au lieu d'UTC (`_loyerTodayLocal`), jour local dans la clé de cache.
- 2026-07-08 : **Phase B livrée v15.427**. _v4ComputeLotStatus + _computeImpayes + jauge collecte Accueil
  = façades sur le moteur (report géré, _moisDebut supprimé ×2, tolérance partagée via _loyerSoldeAjuste :
  seul le mois courant est neutralisé avant le 10, les arriérés restent). Tooltip « couvert par avance ».
  + _loyerSoldeAjuste (module, 4 tests) + verrou test « régul hors pool loyers » (25 tests module).
  Décision complémentaire (question user régul) : 2 correctifs à venir — garde-fou import (nom locataire
  + montant ≠ loyer → ne plus suggérer Loyers ; ≈ solde de régul → « Divers (non déductible) ») + bouton
  « Marquer le règlement comme reçu » sur le décompte (patron acompte départ).
- 2026-07-09 : audit Phase B PASSANT (constats 40/41/45 confirmés corrigés, perf en gain, forme rétro-compat).
  Fix B1 appliqué avant push (mois futur = neutre : attendu 0, plus de « impayé » sur un mois non dû, jauge
  = attendu échu). À acter en Phase C (relevés d'audit) : tolérance sur donut/cartes, libellé hero
  « arriérés » vs « mois », harmonisation seuil warn mois/année, sémantique items, gauge vs donut (alloué/daté).

## Phase D-matrice — Pilotage « Suivi comptable » (design validé user 2026-07-09, mockups pilotage_matrice_complete + pilotage_avance)
- Cases = allocation du moteur (report géré), **fenêtre décalée pour inclure 1 mois à venir** (M-2..M+1)
  → une avance sur un mois futur est visible en bleu « ↑ payé d'avance ».
- **Dû du bail de l'époque** (IRL + prorata entrée) via `_getActiveBailHcChProrated` — plus de faux « ~ partiel ».
- **Cumul signé ±** = total encaissé − dû échu, **borné à `max(bail.debut, début du suivi)`** (début du suivi =
  1er mouvement de la base) → tue le −63 050 € fantôme SANS masquer les arriérés réels post-suivi (≠ `_moisDebut`).
  Nouveau helper pur `_computeLoyerCumul` (TDD). Chip = `_loyerChipVerdict(cumul)` (avance bleu / retard rouge / à jour vert).
- **DG « non suivi »** quand aucun versement DG enregistré (au lieu du 0,00 € rouge).
- Langage visuel = Suivi des loyers (cohérent Phase B).

- 2026-07-09 : **Phase D-matrice LIVRÉE v15.450**. `_computeLoyerCumul` (module, 9 tests TDD) + wrappers
  `_pilTrackingStartYm`/`_pilCumulLocataire` ; `_pilGetFilteredRows` + `_rPilCompta` = façades moteur.
  Fenêtre M-2..M+1 (avance visible en bleu sur le mois à venir), dû du bail de l’époque, cumul borné
  (fin du −63 050 € fantôme), DG « non suivi ». Vérifié preview : bail 2018 suivi 2026-01 → cumul 0 ;
  avance → +655 + mois à venir bleu ; DG non suivi. 34 tests module verts. Reste `_statutQuittance` (Phase D-quittances).
- 2026-07-09 : **audit Phase D-matrice PASSANT** (fantôme tué, faux partiels tués, 0 consommateur cassé,
  3 rouges orthogonaux confirmés). 3 correctifs appliqués → **v15.451** : (bug 1) `_pilCumulLocataire`
  `totalPaid` sans borne haute → une avance datée d'un mois futur compte, chip et case M+1 concordent ;
  (risque 2) DG « non suivi » seulement si le bail est antérieur au suivi, sinon DG dû-non-versé sur bail
  récent = alerte `⚠ 0 / X` (visible aussi dans le filtre dg_incomplet) ; (risque 3/perf) mémoïsation du
  cumul par (ref, `_dbGen`, jour) → plus de recalcul à chaque coche. Vérifié preview (3 scénarios).

## Phase — Cascade d'imputation loyer / charges / avance (règle validée user 2026-07-09)
Règle (source unique) : un encaissement 211 s'impute d'abord sur le **loyer HC** du mois, puis sur les
**charges** (provisions), puis — s'il reste — sur les **arriérés** (loyer d'abord, charges ensuite), et
**seul le reliquat APRÈS les dettes = loyer perçu d'avance** (imposable à l'encaissement, pas une provision).
Pas de prorata charges à part pour une entrée en cours de mois. « sans bail » (dû 0) → tout en loyer, jamais d'avance.

- 2026-07-09 : **v15.457** — 1re version cascade *per-paiement* (`_loyerSplitCascade`). Remplaçait le split au
  RATIO hc/(hc+ch). Correction user : l'avance était sur-évaluée (85 au lieu de 70 sur le scénario D1) car
  elle ne soldait pas d'abord l'arriéré de charge.
- 2026-07-12 : **v15.459 LIVRÉE** (`ac7acb4`) — cascade **CUMULATIVE par lot sur l'année**. Nouveau moteur pur
  `_computeLoyerChargeAlloc(months)` (loyer-statut.js) : chaque mois comble loyer+charges courants puis récupère
  les arriérés (loyer→charges), reliquat = avance. Recâblé : module `_computeFinancesMonthly` (collecte par
  (lot,mois) → passe cumulative, injection `loyerDue(qui,ym)→{hc,ch}`), `_finLoyersHC`, `_finMonthly`, drill
  provisions ; sous-ligne « ↳ dont loyer perçu d'avance » dans le P&L. **Invariant fiscal** : base 2044 officielle
  (`_compute2044`) reste le brut `(cr−db)`, jamais dépendante du split. Σ mois = annuel.
  Scénario user D1 (dû 500/30 ; jan-avr 530, mai 515, juin 615) → mai {500,15,0}, juin {570,45,70},
  annuel {HC 3070, prov 180, avance **70** — pas 85}. **65 tests verts**, **audit code-reviewer PASSANT**.
  Vérifié preview NATIF (chemin prod, sans injection) : `_finLoyersHC` = 3070/180/70, drill provisions +180,00 €.
  Fix au passage : import manquant `_computeLoyerChargeAlloc` dans main.js (aurait crashé les exports suivants
  en prod). Code mort retiré : `_finLoyerSplit`, `_finHcRatio`, `_bailActifAt`, param `hcRatio` du module, doublon d'export.

### Résidus audit v15.459 (non bloquants, à traiter à l'occasion)
- **R1 — avance cosmétique au passage d'année** : l'allocateur est borné à l'année civile (arriérés remis à 0
  au 1er janvier). Un locataire en retard fin N-1 qui se met à jour par un gros versement en janvier N verra ce
  rattrapage classé « ↳ loyer perçu d'avance » (sous-ligne gonflée). **Impact fiscal NUL** (le montant reste dans
  loyersHC ; base 2044 correcte). Fix éventuel : semer `loyerArrear`/`chargeArrear` depuis la position d'ouverture
  (`_computeLoyerCumul` fournit déjà le socle). Priorité basse (cosmétique).
- **R2 — parité `index-test.html`** : le sandbox a un onglet Finances architecturalement ANTÉRIEUR (son
  `_finLoyersHC` est encore au ratio, pas de `_finMonthly`/drill/module B4) — ce n'est pas un dérivé « à une modif
  près » mais un sous-système plus vieux. Ce chantier Finances a été validé via preview (données démo isolées) +
  app déployée, pas via `index-test.html`. Rétro-porter une seule fonction dans un sous-système divergent serait
  incohérent (violerait DRY). À reprendre si/quand le sandbox Finances est remis à niveau globalement.
