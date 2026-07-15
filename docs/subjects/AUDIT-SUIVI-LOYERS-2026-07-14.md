# AUDIT COMPLET — Suivi des loyers / retard / dû / IRL (2026-07-14)

**Code audité :** `origin/main` (worktree `C:/tmp/wt-finbuild`, commit `23ff73d`).
**Méthode :** lecture directe de la chaîne complète + 4 agents d'exploration ciblés + audit indépendant
`superpowers:code-reviewer` (16 constats) + **reproduction seedée Node sur les VRAIS modules prod**
(harness `repro-fric.mjs`, importe `js/core/utils.js`, `loyer-statut.js`, `finances-monthly.js` sans les modifier).
**Aucun code touché.** Livrable d'audit = ce document. Les propositions (partie B) attendent ta validation.

---

## PARTIE A — L'AUDIT

## 1. Le modèle du loyer dans le temps : où vit le loyer d'un mois donné

### 1.1 Les 5 magasins et qui les écrit

| Magasin | Contenu | Écrit par |
|---|---|---|
| `DB.logements[].hc/ch` | loyer/charges **COURANTS** du lot (miroir du bail actif) | `saveBail` (19532), `applyIRL` (24853), `_applyPendingIRLRevisions` (24900), batch pilotage `_pilConfirmBulkMajIrl` (45874), `saveLoyerBien`/`saveParamLog` (bien vacant), imports (41277, 51253) |
| `DB.baux[ref]` (objet par ref) | le bail actif : `debut`, `fin` contractuelle, `finEffective` si clôturé, `hc/ch` **courants** | `saveBail` (19515), `applyIRL` (24856), `_applyPendingIRLRevisions` (24903), `_syncLogToBail` (42806, miroir log→bail à chaque save logement) |
| `DB.baux_historique[]` | baux passés, `hc/ch` **figés à l'archivage** | `saveBailClore` (10692, pose `finEffective` ✅) et `archiverBail` (19549, **ne pose PAS `finEffective`** ⚠) |
| `DB.irlHistorique[]` | révisions IRL `{date, ref, ancienHC, nouveauHC, dateRevision, dateApplication, pendingApply, action}` | `applyIRL` (24834), `skipIRL` (renonciation), batch (45880, **schéma divergent**), tombstones par `resetIRLApply` |
| `DB.mouvements[]` | paiements : **un seul montant global** `cr` (hc+ch confondus), cat 211, `qui`=ref | saisie, import bancaire, auto-générateurs |

### 1.2 Comment le dû d'un mois est reconstruit (chaîne unique en théorie)

```
_finBailHcChAt(qui, ym)                    index.html:48236 — borné 1er versement (_finLotStartMi 48227)
  → _getActiveBailHcChProratedSplit        index.html:12024
    → _getAllBailsForLog(ref)              index.html:11868 — bail courant + baux_historique (filtre .ref)
    → _loyerProrataMoisSplit               js/core/utils.js:312 — Σ des baux qui CHEVAUCHENT le mois, prorata jours
      → bail COURANT : hc = _loyerHCAtDate(log, date, irlHistorique)   utils.js:247
      → bail ARCHIVÉ : hc = bail.hc figé
      → ch = bail.ch (TOUJOURS courant pour le bail actif — aucun historique de charges)
```

`_loyerHCAtDate` : dernière entrée `irlHistorique` avec `dateRevision <= date` → `nouveauHC` ;
avant la 1re entrée → son `ancienHC` ; **aucune entrée → `log.hc` COURANT** (le fallback fatal).

### 1.3 Où ça se désynchronise (les trous structurels)

1. **Le loyer d'un mois passé n'est stocké NULLE PART.** Il est re-déduit à chaque affichage de
   (`log.hc` courant − les entrées `irlHistorique`). Toute lacune de l'historique = projection
   rétroactive du loyer courant sur tout le passé.
2. **`saveBail` change `hc/ch` sans AUCUNE trace** (19515+19532) : corriger un loyer via « Modifier
   bail », re-signer, changer la provision → rétroactif immédiat sur tous les mois du bail.
3. **Batch IRL pilotage** (45874) : met à jour `log.hc` **mais pas `DB.baux[ref].hc`** (désync
   log≠bail), et pose `dateRevision = date du jour` au lieu de l'anniversaire, schéma d'entrée
   non conforme (`action:'applique_bulk'`, pas de `dateApplication/pendingApply`).
4. **Bouton « 🗑 Effacer » l'historique IRL** (ligne 528) : `DB.irlHistorique=[]` — hard delete
   GLOBAL sans tombstones → tout le passé de tous les lots recalculé au loyer courant, et les
   entrées ressuscitent partiellement au prochain merge cloud.
5. **Charges : zéro historique.** `_chargesAtDate` (utils.js:275) est un stub jamais appelé ;
   `bail.ch` courant s'applique à tous les mois passés du bail actif. Toute modif de provision
   est rétroactive et **irrécupérable** (aucune trace de l'ancienne valeur).
6. **`baux_historique` à double clé morte** : les baux n'ont qu'un champ `.ref`, mais 3 sites
   filtrent sur `.logement` qui n'existe pas → **no-op silencieux** : `_findBailForDate` (9115,
   drill « locataire de l'époque »), `_loyerAttenduForCand` (17623), transitions quittance (27419).
7. **Tombstones non filtrés** : `_getAllBailsForLog` (11885) inclut les baux_historique
   `_deleted` (qui gardent `ref/debut`) → baux fantômes hc=0 sans `fin` (= couvre 9999) qui
   polluent `_finLotNomAt`, `_buildBailSegments`, le fallback de `_getLogementStartIso`.
8. **Doublon inline `_loyerHCAtDate`** (index.html:4330) resté en ref STRICTE — en http la
   version module tolérante l'écrase via `main.js:199`, en `file://` et pendant la fenêtre de
   boot c'est la stricte qui tourne.

## 2. Cause racine de « Fric en retard depuis mars » — REPRODUITE

### 2.1 Le mécanisme (P0 n°1) : l'IRL validée en retard est enregistrée RÉTROACTIVE

- `computeIRLRevision` (23914) : `dateRevision = anniversaire du bail de l'ANNÉE COURANTE`.
- `applyIRL` (24802) : si l'anniversaire est déjà passé → « application immédiate » : `log.hc`
  et `baux.hc` muent AUJOURD'HUI, mais l'entrée d'historique porte `dateRevision = l'anniversaire
  passé` (ex. 1er mars).
- `_loyerHCAtDate` applique donc le loyer révisé **à partir de mars**, alors que Fric a été
  quittancé et a payé l'ancien loyer de mars à juin.

**Reproduction (harness Node, modules prod réels)** — bail au 1er mars, 500+50 €, IRL +1,03 %
validée le 20 juin, Fric paie 550 €/mois toute l'année :

```
CAS 1 — IRL validée le 20 juin, anniversaire 1er mars
  janv  dû 550.00 · payé 550.00 · écart  0.00
  févr  dû 550.00 · payé 550.00 · écart  0.00
  mars  dû 555.15 · payé 550.00 · écart −5.15   ← dû réécrit a posteriori
  avr   dû 555.15 · payé 550.00 · écart −5.15
  mai   dû 555.15 · payé 550.00 · écart −5.15
  juin  dû 555.15 · payé 550.00 · écart −5.15
  juil  dû 555.15 · payé 550.00 · écart −5.15
  → Drill « cause du retard de CHARGES » : mars −5.15 · avr −5.15 · mai −5.15 · juin −5.15 · juil −5.15
  → Suivi des loyers : solde −25.75 € → pastille « ↓ retard »
  → Quittance de MARS re-imprimée aujourd'hui : 555.15 € (émise/payée à l'époque : 550.00 €)
```

C'est le motif exact : **un retard de ~5 €/mois « depuis mars »** (mars = anniversaire du bail,
et aussi le libellé « suivi depuis mars » de la table pilotage, 45749, = début de fenêtre de
suivi, PAS début du retard — les deux se superposent et rendent le message illisible).

Détail piquant confirmé par la repro : la cascade sert le LOYER d'abord → le manque de 5,15 €
atterrit dans le **retard de CHARGES** (drill orange « charges »), pas dans le retard de loyer.
Le popup « cause du retard » raconte donc une histoire fausse (des charges impayées) pour un
écart né d'une révision IRL.

**Double faute :**
- (a) *Incohérence interne* : le confirm d'`applyIRL` promet « le loyer actuel reste appliqué
  jusqu'à [l'anniversaire] » pour le futur, mais réécrit le dû du PASSÉ.
- (b) *Faute légale* : depuis ALUR (art. 17-1, loi 89-462), la révision prend effet **à compter
  de la demande du bailleur**, jamais rétroactivement à l'anniversaire. Le modèle actuel
  sur-facture rétroactivement — indéfendable face à un locataire.

### 2.2 Les 3 autres vecteurs du même symptôme (reproduits aussi)

| Cas | Déclencheur | Résultat reproduit |
|---|---|---|
| CAS 2 | Historique IRL vide (bouton 🗑, hc modifié via `saveBail`, entrée legacy sans `dateRevision`) | dû = loyer courant sur TOUTE l'année → retard fantôme depuis janvier |
| CAS 3 | Ref d'entrée désynchronisée (« ` f-001 ` ») | rattrapé par la ref tolérante module (23ff73d) mais PAS par l'inline strict (file://, boot) |
| CAS 5 | « Nouveau bail » sur logement occupé : `archiverBail` (19549) archive **sans poser `finEffective`** → l'ancien bail (fin contractuelle future ou vide) chevauche le nouveau | **dû DOUBLÉ** : févr/mars/avr = 1 095 € au lieu de 570 € — retard fantôme massif attribué à l'ancien locataire |

## 3. Cohérence dû ↔ quittance ↔ Suivi des loyers ↔ Finances : NON

Quatre surfaces, **quatre dûs différents** :

| Surface | Dû utilisé | Borné 1er versement | Tolérance <10 | Moteur d'imputation |
|---|---|---|---|---|
| **Finances P&L v2** (`_finBailHcChAt` 48236, `_finMonthly`) | prorata + IRL historisée | **OUI** (1er versement du lot) | **OUI** (`graceLast`) | cascade au mois de réception (`_computeLoyerChargeAlloc/Arrears`) |
| **Suivi des loyers** (modale + strip, `_suiviLoyerStrip` 8727) | prorata + IRL | **NON** | **NON** | pool annuel chronologique (`_computeLoyerStatut`) |
| **Accueil** (donut, `_v4ComputeLotStatus` 8672) | idem strip | **NON** | **NON** | idem strip |
| **Fiche/pilotage** (`_pilCumulLocataire` 45644) | prorata + IRL | **3e règle** : `max(bail.debut, 1er mouvement de TOUTE LA BASE — même d'un autre lot !)` | **NON** | cumul fenêtré |
| **Quittance** (`_buildQuittanceHtml` 27369) | `q.hc/q.ch` **figés au bail COURANT à la création** (27252, 27351, 27666 — sans `_loyerHCAtDate`, contrairement à ce que promet l'en-tête de `quittances-actives.js`), puis **écrasés à l'affichage** par `_loyerProrataMois` (27423-27434) | **NON** | n/a | n/a |

Conséquences concrètes :
- **La quittance n'est pas un document immuable** : re-imprimer la quittance de mars APRÈS la
  révision IRL affiche 555,15 € alors qu'elle a été émise (et payée) à 550 € — le « dû = ce que
  la quittance facture » est violé dans les deux sens.
- La quittance construit sa liste de baux avec le filtre mort `.logement` (27419) → sur un mois
  de transition de bail elle proratise un ENSEMBLE DE BAUX DIFFÉRENT de Finances.
- Le seul endroit qui applique la tolérance début de mois en dehors de Finances est le hero
  Accueil (`_computeImpayes` 12668). Du 1 au 9, Suivi/Accueil/fiche crient « retard » pendant
  que le P&L dit à jour — la résurrection inversée du constat 45.
- `received` : Finances compte net `cr−db` (48260, 48986), le Suivi ne compte que `cr>0`
  (8746) → un avoir/remboursement 211 crée un retard côté Finances, invisible côté Suivi.

## 4. Incohérences ENTRE les changements récents (v15.466→478)

1. **Bornage 1er versement (Finances) jamais reporté sur Suivi/Accueil/fiche** → 3 politiques de
   démarrage. Le fix v15.47x a créé la divergence qu'il voulait tuer, ailleurs.
2. **Bornage × cascade `monthHasDue`** se neutralisent : locataire entré en janvier, 1er paiement
   en mars couvrant janv+févr+mars → dû janv/févr = 0 (bornés) → les 2 mois de rattrapage
   deviennent une « avance » fantôme bleue ; symétriquement un locataire qui n'a JAMAIS payé ses
   premiers mois n'a AUCUN retard côté Finances (dû=0 avant 1er versement) alors que la règle
   « zéro paiement = pire retard » (activeLots, 48327) voulait exactement l'inverse.
3. **Retard résidu × avance « pas de pull-back »** (reproduit CAS 6) : 2 loyers payés en janvier,
   rien en février → le P&L affiche EN MÊME TEMPS « avance 550 € » (janv, bleu) et « retard
   550 € » (févr, orange), pendant que le Suivi dit « à jour ». C'est le scénario FONDATEUR du
   moteur (en-tête de loyer-statut.js) qui contredit ses propres sous-lignes. La note UI
   « l'avance bascule sur les mois suivants » (48418) promet un netting qui n'existe pas.
4. **`_finLotNomAt` × tombstones × archives sans clôture** : le tombstone (ref/debut conservés,
   pas de fin → couvre 9999) matche en premier → nom vide → fallback locataire COURANT = la
   régression exacte que le fix 2026-07-14 devait corriger ; et dans le CAS 5 (dû doublé), le
   drill attribue le trou à l'ANCIEN locataire.
5. **Ref tolérante inachevée** : module tolérant (23ff73d) mais inline 4330 strict, création
   logement 19521 stricte (réserves connues), et `_getActiveBailHcChProratedSplit` (12025)
   matche les logements sans `_isAlive`.
6. **Tolérance début de mois** appliquée dans le module Finances + drills (49027) mais pas dans
   les surfaces qui portent la pastille rouge (Suivi/Accueil).

## 5. Trous du modèle + données déjà cassées

### Trous (au-delà de ceux du §1.3)
- **Révision sans date d'application vraie** : `dateRevision` = anniversaire année courante même
  si validée des mois plus tard ; entrée batch avec `dateRevision = td()` ; entrées à
  `dateRevision:''` possibles (`applyIRL` si `rev.dateRevision` absent) → silencieusement
  exclues du calcul = historique vide.
- **Changement de locataire sans clôture** : `archiverBail` n'écrit pas `finEffective` → 
  chevauchement (CAS 5). Seul le chemin « Clôturer bail » est propre.
- **Bail échu en tacite reconduction** : `fin` contractuelle passée → dû = 0 (utils.js:336)
  → un locataire reconduit qui cesse de payer est INVISIBLE partout (le reste de l'app
  modélise pourtant la reconduction : pills « Reconduit », `_bailFinEffective`).
- **`_applyPendingIRLRevisions`** : si `log.hc ≠ ancienHC` (loyer édité entre-temps) la révision
  reste `pendingApply` à vie, silencieusement (24895) ; date UTC vs `_isoLocal` (24886).
- **`_getLogementStartIso`** (11905) scanne les mouvements sans filtre `_deleted` (mitigé : les
  writers de tombstones strippent `cat/cr`, mais c'est une garantie par accident).
- **Aucun historique visible/corrigeable** : l'utilisateur ne peut ni voir ni corriger le loyer
  d'une période — exactement ce que tu demandes et qui n'existe pas.

### Données déjà cassées (dans TA base) — à traiter au moment du fix
1. **Entrées `irlHistorique` avec `dateRevision` = anniversaire passé** (créées par `applyIRL`
   tardif — le cas Fric) : la date d'effet enregistrée est fausse (légalement = date de la
   demande). Réparable : on connaît `date` (jour du clic) et `dateRevision` — un script de
   migration peut re-dater l'effet, MAIS il faut d'abord trancher la sémantique (partie B, Q1).
2. **Entrées batch** (`action:'applique_bulk'`) : `dateRevision` = jour du clic (par accident,
   c'est la bonne sémantique post-ALUR !), mais `DB.baux[ref].hc` jamais mis à jour → détecter
   les `log.hc ≠ baux.hc` et resynchroniser.
3. **Baux archivés sans `finEffective`** (`_archivedAuto:true`) : les tronquer à
   `debut du bail suivant − 1 jour` (reconstruction déterministe possible).
4. **hc modifiés via `saveBail` sans trace** : indétectable a posteriori, SAUF via les quittances
   émises (montants figés à la création) et les paiements réels — c'est la seule mémoire de ce
   qui était facturé. Un assistant de reconstruction (« ton historique de loyer, déduit des
   quittances/paiements — corrige et valide ») est la seule voie honnête.
5. Le garde-fou boot (52096) détecte `log.hc ≠ _loyerHCAtDate(today)` mais ne corrige rien et ne
   couvre pas la désync `log.hc ≠ baux.hc`.

### Sévérités (synthèse code-reviewer + repro)

| # | Constat | Sévérité |
|---|---|---|
| C1 | IRL appliquée en retard → dû rétroactif → faux retard (Fric) | **P0 — reproduit** |
| C2 | Avance >1 mois → retard + avance fantômes simultanés au P&L, Suivi contradictoire | **P0 — reproduit** |
| C3 | Bouton 🗑 efface l'historique IRL (hard delete global) → tout le passé au loyer courant | **P0** |
| C4 | Re-bail sans clôture → baux chevauchants → dû doublé, imputé à l'ancien locataire | **P0 — reproduit** |
| C5 | 3 règles de bornage du début de suivi (Finances/Suivi/fiche) | P1 |
| C6 | Bornage × monthHasDue : rattrapages requalifiés en avances, premiers impayés invisibles | P1 |
| C7 | Tacite reconduction (fin passée) → dû 0 → impayés invisibles | P1 |
| C8 | Charges et hc hors-IRL rétroactifs (aucun historique, `saveBail` sans trace) | P1 |
| C9 | Tolérance <10 sur 2 surfaces sur 5 | P1 |
| C10-C11 | Tombstones non filtrés + filtre `.logement` mort (3 sites no-op) | P1 |
| C12 | `cr−db` vs `cr>0` entre Finances et Suivi | P1 |
| C13-C16 | Inline strict/boot, `_isAlive` manquant, edge cases IRL pending, N-1 hero ≠ tableau | P2 |

---

## PARTIE B — PROPOSITIONS (design, pas patch — EN ATTENTE DE TA VALIDATION)

Le fil conducteur : **le loyer d'un mois doit être une donnée, pas une déduction.** Aujourd'hui
chaque affichage re-déduit le passé depuis l'état courant ; chaque écriture non tracée réécrit
l'histoire. La refonte propose UNE source de vérité + UN moteur + la cohérence dû=quittance.

### B1. Socle : le « barème de loyer » historisé par lot (nouvelle collection)

`DB.loyerBareme[]` : périodes `{ref, debut, fin|null, hc, ch, source: 'bail'|'irl'|'manuel'|'regul-ch',
bailDebut, note}` — append-only avec tombstones (sync cloud OK).

- **Toutes** les écritures de loyer passent par lui : `saveBail` (création + modif), `applyIRL`,
  batch, clôture, édition manuelle. Une modif de `hc` ou `ch` SANS période = impossible par
  construction (fini le rétroactif silencieux ; les charges deviennent historisées, C8 réglé).
- Le dû d'un mois = lecture du barème × occupation (baux/prorata). `_loyerHCAtDate` et le stub
  `_chargesAtDate` deviennent des lectures du barème. `irlHistorique` reste pour la traçabilité
  IRL (lettres, renonciations) mais ne pilote plus le dû.
- **Migration** : script qui reconstruit le barème depuis l'existant (bail.debut→hc/ch initiaux
  + entrées irlHistorique datées + baux archivés figés) + **écran de validation** : c'est le
  « VRAI historique visible et corrigeable » que tu demandes — table par lot, périodes
  éditables, alertes sur les incohérences détectées (§5 données cassées).

### B2. Les règles métier gravées, appliquées par UN seul résolveur

Un unique `duMois(ref, ym)` (module pur, testé) consommé par les 5 surfaces (P&L, Suivi,
Accueil, fiche, quittance) avec LES MÊMES politiques :
- **Départ du suivi = 1er versement du lot** (ta règle), fallback début de bail SI aucun
  paiement historique ET bail toujours actif — et le rattrapage d'entrée (C6) réintégré :
  les mois entre début de bail et 1er versement sont dus (pas une avance), le bornage ne
  s'applique qu'aux millésimes antérieurs au suivi.
- **Tolérance <10** appliquée (ou pas) au même endroit pour tout le monde.
- **Netting avance↔retard** : une avance disponible couvre les mois dus suivants AVANT de
  laisser naître un « retard » (fin du retard+avance simultanés, C2). P&L par mois = résidu,
  annuel = somme (ta règle, conservée).
- **Clôture obligatoire au re-bail** : `archiverBail` pose `finEffective = veille du nouveau
  bail` (C4), tombstones filtrés partout (`_isAlive`), suppression des 3 filtres `.logement`
  morts (C11), ref tolérante partout (inline compris).
- **Tacite reconduction** : bail courant non clôturé = dû continue après la `fin` contractuelle
  (C7) — la fin qui compte pour le dû est `finEffective|clôture`, pas la fin papier.

### B3. Cohérence dû = quittance (ta règle n°5)

La quittance émise **fige** `{hc, ch, total, periode}` définitivement (plus de recalcul à
l'affichage, 27423) et le montant figé vient du MÊME `duMois()`. Le dû d'un mois QUITTANCÉ = le
montant de sa quittance (le résolveur lit la quittance émise en priorité). Une révision
postérieure ne réécrit jamais un mois quittancé → un « retard » ne peut plus naître d'un
recalcul. Re-imprimer ≠ re-calculer.

### B4. La décision légale à trancher AVEC toi (Q1 — bloquante pour la migration)

**Quand une révision IRL validée en retard prend-elle effet ?**
- **Option 1 (légale post-ALUR, recommandée)** : à la **date de la demande** (envoi lettre /
  clic). Aucun recalcul du passé, jamais. Les entrées existantes type Fric sont re-datées à leur
  `date` de clic par la migration → les faux retards disparaissent.
- **Option 2 (ancien monde, pré-2014)** : rétroactif à l'anniversaire — c'est le comportement
  actuel, illégal pour les baux d'habitation post-ALUR ; à écarter sauf cas très particuliers
  (baux commerciaux, hors périmètre actuel).
- Reste un sous-choix Option 1 : effet au jour exact (prorata intra-mois) ou au 1er du mois
  suivant (simple, lisible sur quittance). Mon penchant : **1er du mois suivant la demande** —
  simplicité (le WHY), zéro prorata surprise sur quittance.

### B5. Chantier proposé (ordre, TDD, mockup-first)

| Étape | Contenu | Taille |
|---|---|---|
| 1 | Décision Q1 + moteur `duMois()` pur + netting avance/retard (TDD, remplace les 4 moteurs) | 1 session |
| 2 | `loyerBareme` + branchement des writers (saveBail/applyIRL/batch/clôture) + fixes C4/C10/C11 | 1 session |
| 3 | Migration + **écran « Historique des loyers »** (mockups A/B/C × 3 formats d'abord) | 1 session |
| 4 | Quittance figée + dû=quittance + rebranchement des 5 surfaces sur le résolveur unique | 1 session |

Chaque étape : test rouge d'abord, audit code-reviewer avant « prêt à tester », bump version,
BACKLOG à jour. La base 2044 à l'encaissement (Σ 211 brut) n'est touchée par RIEN de tout ça
(le split dû/imputation est en aval de l'encaissement).

---

*Harness de repro : `_import/repro-audit-suivi-loyers.mjs` (CAS 0-6, importe les modules prod du
worktree `C:/tmp/wt-finbuild`). Rejouer : `node _import/repro-audit-suivi-loyers.mjs`.*
