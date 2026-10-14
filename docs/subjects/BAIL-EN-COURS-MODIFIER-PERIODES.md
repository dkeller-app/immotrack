# BAIL-EN-COURS-MODIFIER-PERIODES — Modifier / supprimer une période de l'historique du bail

**Statut** : 📐 Conception (aucun code écrit) · **Prio** : P1 · **Branche** : `feat/bail-en-cours` · **Rédigé** : 2026-10-06
**Origine** : RETOURS-2026-10-05 §C4 (« modification de bail avec une mauvaise date : ni modifier ni supprimer ») + journal du 06/10 (maquette finale).
**Maquettes validées** : `mockups/BAIL-EN-COURS/captures/periodes-historique|selection|modifier-{pc,tab,tel}-{light,dark}.png`
**Liés** : AUDIT-SUIVI-LOYERS (barème), HISTORIQUE-BAIL-ONGLET, BAIL-SIGNE-MODIFS (journal `baux_evenements`), IRL-REVISION (session « IRL & courriers », consommatrice de l'API), session Finances (propriétaire de `duMois`).

> Règle de Didier, appliquée partout ici : **on ne bloque jamais l'utilisateur : des alertes, pas de blocage.**
> Les seules limites sont des **bornes de saisie expliquées**, avec le geste qui permet d'aller plus loin (jamais un refus muet).

---

## 0. Ce qui existe aujourd'hui (lu dans le code)

| Élément | Où | Constat |
|---|---|---|
| Barème = source de vérité du dû | `js/core/loyer-bareme.js:1-17` | Période `{ref, debut, fin\|null, hc, ch, source, bailDebut, note, _deleted}`. **Pas d'identifiant** : une période se reconnaît à `(ref, bailDebut, debut)`. |
| Écrivain daté | `appliquerNouvellePeriode` `loyer-bareme.js:277-412` | Pose une période « à partir du » : coupe la période en vigueur (split + `_reprendreApres` l. 265), supersède à même début (tombstone `_remplaceePar` l. 358), supersède les continuations `source:'bail'` qu'elle recouvre (l. 390-405), se borne sur la prochaine **décision** (l. 313-317). |
| Couverture | `garantirCouvertureBail` l. 549, `_segmentsManquants` l. 464 | Comble les trous **avant** un horizon au tarif du bail, ne réécrit jamais l'existant. |
| saveBail | `synchroniserPeriodeBail` l. 523 → `_synchroniser` l. 621-632 | **La période ouverte `source:'bail'` suit le formulaire** (`bail.hc/ch`). Piège pour nous (voir §1.4). |
| Clôture | `cloturerBareme` l. 700 | Ramène les fins à la clôture ; tombstone `_annuleeParCloture`. **Aucun écrivain ne pose `source:'cloture'`** (seul l'en-tête l. 5 la cite). |
| Chapitre | `chapitrePour` l. 756 | Rattache une date au bon bail (courant ou clos). |
| Re-datage IRL | `redaterRevisionIRL` `js/core/bail-modif.js:93-152` | Déplace `debut` **en place** + recale `fin` de la précédente ; met à jour `irlHistorique.dateEffet`. Retrouve la période par `source==='irl' && debut===ancienEffet`. |
| Annulation IRL programmée | `annulerRevisionProgrammee` `js/core/irl-revision.js:81` | Tombstone de l'entrée IRL + `appliquerNouvellePeriode(… source:'bail', note:'Révision IRL programmée annulée')`. |
| Dû du mois | `duMois` `js/core/loyer-du-mois.js:145`, `_periodeAt` l. 59, `duMoisFromRaw` l. 249, `bailsFromRaw` l. 270 | Lecture seule pour nous. La quittance **n'entre plus** dans le dû (`app-part1.js:9130-9141`) → modifier une période change le dû d'un mois quittancé. |
| Payé imputé | `_loyerPayeDuMois` `app-part1.js:9244` | Seule porte du « payé du mois » (dû − résidu, cascade unique). |
| Dernier mois quittancé | `_dernierMoisQuittanceYm` `app-part1.js:24574` | Quittance `{logement, mois, hc, ch}` figée (`app-part2.js:633-645`). |
| Historique (pur) | `construireHistoriqueBail` `js/core/bail-historique.js:51` | Les périodes (l. 158-168) **ne portent pas leur clé** ; tombstones visibles seulement avec `_remplaceePar`/`_annuleeParCloture` (l. 135-156) ; carte `modif` pour toute période `manuel` (l. 169-174). |
| Rendu | `app-part2.js:13777` `_renderHistoBailSection`, bouton l. 13840, pastille `.hl-period` l. 13885-13893, cartes l. 13927+ (`modif` l. 13993, `periode-remplacee` l. 14005) | |
| Ancien geste | `openHistoCorrPeriode` l. 14164 / `_histoSaveCorrPeriode` l. 14171-14251, modale `index.html:5302-5323` | Date libre + fin optionnelle + `confirm2` sur mois quittancé ; écrit via `garantirCouvertureBail` + `appliquerNouvellePeriode` + `cloturerPeriodeParDebut`. **N'écrit aucun journal** (seulement `_auditLog`). |
| Cloud du barème | `store-supabase.js:263` `persistConfig`, adaptateur `store-supabase-adapter.js:61` | `loyerBareme`, `irlHistorique`, `bailEvents` vivent dans le **blob** `espace_config` : upsert du blob entier, **sans garde de version** → dernier écrivain gagne, **pas de fusion par élément** (hydrate `store-supabase.js:146-150` remplace la clé). Filtrage par SCI : migration 0044. |
| Journal cloud | `baux_evenements` (table, 0017 + 0054), mapper `store-mapping.js:181-189`, rattachement `store-sync.js:412` | **Une ligne par entrée, versionnée** : survit à la concurrence. Type inconnu → colonne `type_evenement='autre'`, l'objet complet reste dans `legacy_raw` (aucune migration). |

---

## 1. Opérations pures (module `js/core`, testable)

### 1.1 Où

**Nouveau module `js/core/bareme-edition.js`** (pur, sans DB, sans horloge), importé par `js/main.js` et exposé sur `window.BaremeEdition`.
Pourquoi pas dans `loyer-bareme.js` : ce fichier est partagé par saveBail, l'IRL, l'avenant et la migration, et chaque retouche y a coûté un audit (commentaires l. 241-412). Un module additif ne change **aucun** comportement existant ; il importe ce qu'il réutilise. `_veille`/`_lendemain` ne sont pas exportés : les recopier (3 lignes) plutôt que toucher l'export.

### 1.2 Identifier une période : la clé, pas l'index

L'index dans `DB.loyerBareme` n'est pas stable (blob réécrit par un autre appareil, tableau recopié par chaque écrivain). **Clé = `{ref, bailDebut, debut}`** sur les périodes vivantes.
- `cleDePeriode(p)` → `{ref: p.ref, bailDebut: ymd(p.bailDebut), debut: ymd(p.debut)}`.
- `trouverPeriode(periods, cle)` : vivante, ref tolérante (`_nr`), même `debut`, chapitre compatible (`bailDebut` absent = legacy, accepté comme `_memeChapitre` l. 205). Plusieurs candidates (stock corrompu) → **la dernière du tableau**, même règle que M7 (`__tests__/helpers/bareme-couverture-chapitre.test.js:239`).
- On **n'ajoute pas** de champ `id` aux périodes : `_reprendreApres` (l. 271) recopie l'objet entier, un `id` serait dupliqué par chaque split.

Le signataire de l'API accepte aussi un index (`idx`) pour les tests et le converti immédiatement en clé.

### 1.3 Contrats

Toutes les fonctions : entrée non mutée, sortie = nouveau tableau (copies), **aucun `Date.now()`** (horodatage `le`, `auteur`, `evtId` injectés par `opts`), résultat structuré :

```js
{ ok: true|false, change: bool, periods: [...], avant: periodeT|null, apres: periode|null,
  touchees: [{cle, champ, avant, apres}],   // voisines recalées (fin) ou absorbées
  avertissements: ['premiere-periode-date', 'absorbe-irl', 'trou-preexistant', ...],
  raison?: 'introuvable'|'date-invalide' }
```
`ok:false` = **seulement** une entrée inexploitable (période disparue entre l'affichage et l'enregistrement, date illisible). L'UI le dit et rafraîchit, elle ne « bloque » pas une décision métier.

#### `modifierPeriode(periods, cle, patch, opts)` — `patch = {debut?, hc?, ch?}`, `opts = {motif, le, auteur, evtId, finChapitre?}`

Soit T la période ciblée, P la vivante précédente **du même chapitre**, N la suivante.

1. **Montants** : `hc`/`ch` absents = inchangés ; `montantSaisi` (l. 66) → un champ vide n'est pas un zéro.
2. **Rien ne change** (même debut, mêmes montants) → `{ok:true, change:false}` (no-op, aucune trace).
3. **Nouvelle date `d'`** :
   - **Première période du chapitre** (`T.debut === bailDebut`) : la date **est** la date du bail → non modifiable ici. Le champ est grisé avec « La date de début de la 1ʳᵉ période est celle du bail — *Modifier le bail* » (lien). Si l'appelant force une autre date : ignorée + avertissement `premiere-periode-date` (jamais une période avant le bail : `appliquerNouvellePeriode` l. 297 l'interdit déjà).
   - **Reculer** (`d' > T.debut`) : borne haute = `T.fin` (une période ne peut pas commencer après sa propre fin ; au-delà, c'est « Supprimer », que la fenêtre propose dans le même message). P, si elle était contiguë (`P.fin === veille(T.debut)`), est **prolongée** : `P.fin = veille(d')` — c'est exactement l'alerte de la maquette (« le dû de septembre repasse de 720 € à 680 € »). Pas de P contiguë (trou préexistant) → avertissement `trou-preexistant`, on n'invente rien ; `garantirCouvertureBail(…, avantLe=d')` comble au tarif du bail **avec sa note** (« Complété : période non couverte… », l. 590).
   - **Avancer** (`d' < T.debut`) : borne basse = `bailDebut` (chapitre). Les périodes du chapitre **entièrement** comprises dans `[d', veille(T.debut)]` sont **absorbées** : tombstone `_absorbeePar:{cle T', le, evtId}` (visibles dans la timeline). Celle qui chevauche `d'` est **rognée** : `fin = veille(d')`. Une période `irl` absorbée → avertissement `absorbe-irl` (l'entrée `irlHistorique` reste, à annuler côté IRL — cf §4). Avancer jusqu'à `bailDebut` est permis : T devient la 1ʳᵉ période.
4. **Écriture de T** : T est tombstonée `_deleted:true, _modifieePar:{debut:d', hc', ch', le, auteur, evtId, motif}` ; une **nouvelle ligne** est poussée `{ref, bailDebut, debut:d', fin:T.fin, hc', ch', source:S', note:T.note, _edition:{evtId, de:T.source, le}, _modifiedAt:le}`.
   - `fin` reste celle de T (le chaînage avec N ne bouge pas : seule la date de **début** se modifie, c'est la maquette).
   - **Source S'** : `irl` reste `irl` (lien avec `irlHistorique`, que `redaterRevisionIRL` retrouve par `source==='irl'`, bail-modif.js:120) ; la **1ʳᵉ période** `bail` reste `bail` ; une autre période `bail` (continuation dérivée, complément de couverture) **devient `manuel`** — sinon `appliquerNouvellePeriode` la traiterait encore comme « dérivée » (l. 307) et la supersèderait en silence à la prochaine révision ; `manuel` reste `manuel`.
   - `note` d'origine conservée (motif de la **décision**) ; le motif de la **correction** va au journal et dans `_modifieePar`.
5. **Garantie de couverture** en sortie (`garantirCouvertureBail(out, bailDuChapitre, avantLe=min(d',T.debut))`) : no-op sur un barème complet (l. 529-531), filet sinon.

#### `supprimerPeriode(periods, cle, opts)`

- T tombstonée `_deleted:true, _supprimeePar:{le, auteur, evtId, motif, reprise:'precedente'|'suivante'|'bail'}`.
- **Les mois de T prennent le tarif de la période précédente** : P (contiguë, même chapitre) → `P.fin = T.fin` (si T était ouverte, P redevient ouverte). C'est le sens « annuler cette modification ».
- **Pas de P (T = 1ʳᵉ période)** : la suivante N n'est **pas** déplacée (déplacer N casserait son lien IRL) ; on pousse une ligne `{debut:T.debut, fin:T.fin, hc:N.hc, ch:N.ch, source:'bail', bailDebut, note:'Période supprimée — tarif de la période suivante', _edition}` → avertissement `premiere-periode-supprimee` (question ouverte Q2).
- **Ni P ni N** : rien n'est poussé ; `duMois` retombe sur le repli bail (l. 186-189) et `garantirCouvertureBail` repose la période du bail au tarif du formulaire. Avertissement `seule-periode` : « le loyer du bail (X €) s'appliquera ».
- **Période de clôture** (dernière du chapitre clos, `fin === finEffective`) : la fin de P **prend la fin de T**, donc ne dépasse jamais la clôture. Rien ne rouvre un bail clos.
- Idempotence : cible déjà tombstonée par `_supprimeePar` avec ce `evtId`, ou introuvable **et** état cible atteint → `{ok:true, change:false}`.

#### `ajouterPeriode(periods, nouvelle, opts)` (§5)
Fine enveloppe autour de **l'existant** : `garantirCouvertureBail(…, avantLe=debut)` puis `appliquerNouvellePeriode({…, source:'manuel'})` puis, si `fin` explicite, `cloturerPeriodeParDebut`. Exactement la séquence de `_histoSaveCorrPeriode` (`app-part2.js:14230-14245`), déplacée dans le module pour être testée et appelée par l'API. Ajoute `_edition`.

### 1.4 Ce qu'on réutilise, et pourquoi

| Fonction | Utilisée ? | Raison |
|---|---|---|
| `appliquerNouvellePeriode` | **Oui pour « Ajouter »**, **non pour « Modifier/Supprimer »** | Son modèle est « à partir du X, jusqu'à la prochaine décision » : il coupe et reprend (`_reprendreApres`), se borne sur la suivante, supersède les dérivées. Modifier la date de début d'une période existante est un autre geste (déplacer une frontière). Composer « tombstone T + appliquer à d' » produit, mesuré sur papier, des reprises parasites quand une décision se trouve entre `d'` et `T.debut`. Un algorithme explicite de 40 lignes est plus sûr et plus lisible. |
| `garantirCouvertureBail` | **Oui** (sortie de chaque opération) | Point d'entrée prévu pour les écrivains datés (commentaire l. 542-548) ; ne réécrit rien d'existant. |
| `synchroniserPeriodeBail` | **Non** | Réservée à saveBail ; sa branche « la période `bail` ouverte suit le formulaire » repeindrait les montants qu'on vient de corriger (régression I-1 mesurée, l. 542-547). **Conséquence** : après une modification de la période ouverte `bail`, l'orchestrateur **doit** recaler `bail.hc/ch` (§3.4), sinon le prochain saveBail l'annule. |
| `clampDateEffet` | **Non** pour la date saisie | Il *remonte en silence* la date hors des mois quittancés : c'est un blocage déguisé, contraire à la règle de Didier. Les mois quittancés deviennent une **alerte** (§2). On ne garde que la borne `debutBailIso`, appliquée par nos propres bornes. |
| `chapitrePour` | **Oui pour « Ajouter »** | Rattache la date au bon bail, même clos (l. 756). |
| `cloturerPeriodeParDebut` | Oui pour « Ajouter » avec fin | Inchangé. |
| `redaterRevisionIRL`, `annulerRevisionProgrammee` | **Appelées, jamais modifiées**, pour les périodes `irl` (§4) | Elles tiennent `irlHistorique` cohérent. |

### 1.5 Invariants garantis (et testés, §6)

- **I-A** aucun chevauchement entre périodes vivantes d'un même lot ;
- **I-B** couverture continue `[bailDebut, fin du chapitre]` si elle l'était en entrée ;
- **I-C** au plus **une** période ouverte par lot (`bareme-une-seule-periode-ouverte.test.js`) ;
- **I-D** localité (I-1) : `duMois` ne change **que** sur la fenêtre `[min(T.debut,d'), T.fin]` (modifier) ou `[T.debut, T.fin]` (supprimer) ;
- **I-E** rien ne disparaît sans trace : toute ligne vivante en entrée est soit vivante en sortie (fin éventuellement recalée), soit tombstonée **avec une raison** (`_modifieePar|_supprimeePar|_absorbeePar`) ;
- **I-F** déterminisme (mêmes entrées + même `opts` ⇒ même sortie) et **indépendance à l'ordre du tableau** (le blob réordonne : même `duMois` après mélange) ;
- **I-G** idempotence : rejouer la même opération (même `evtId`) ⇒ `change:false`.

---

## 2. Impact « avant / après » sans toucher aux moteurs

### 2.1 Calcul pur
`impactEdition({ref, bails, avant, apres, jusquAu})` dans `bareme-edition.js` :
- `bails` = `bailsFromRaw(ref, raw)` (lecture, `loyer-du-mois.js:270`) ;
- pour chaque mois `ym` de la fenêtre touchée (I-D), bornée à `jusquAu` = mois courant : `duMois({ref,bails,bareme:avant}, ym)` vs `duMois({…, bareme:apres}, ym)` — **import en lecture** de `duMois`, rien n'est modifié dans `loyer-du-mois.js` ;
- sortie : `[{ym, avant:{hc,ch,total}, apres:{…}, delta}]` (mois inchangés omis) + `futur:{des, total}` (« à partir du 01/10/2026 : 680 € / mois ») pour la partie au-delà du mois courant.

C'est le même `duMois` que `_duMoisLot` (`app-part1.js:9136`) : l'alerte affiche le chiffre que les écrans afficheront. Limite connue : quand une date de suivi est saisie, Finances lit `_finBailHcChAt` (`app-part1.js:9198-9214`) qui ne compte pas les mois d'avant l'achat ; l'alerte ignore donc les mois antérieurs à `_finLotSuivi(ref).date` quand elle existe.

### 2.2 Décorations côté app (lecture seule)
Pour chaque mois impacté, l'orchestrateur ajoute :
- **encaissé** : `_loyerPayeDuMois(ref, ym)` (état **avant** modification) ; `tropPercu = max(0, payé − apres.total)` ; `resteDu = max(0, apres.total − payé)` ;
- **quittance émise** : `DB.quittances` vivante `{logement:ref, mois}` (même normalisation que `_dernierMoisQuittanceYm`) → montant figé `hc+ch`.

### 2.3 Texte de l'alerte (non bloquante, encart `--warn-soft` de la maquette)
Une à trois lignes, la plus grave d'abord, puis « Tu peux enregistrer quand même. » :
- « Le dû de **septembre 2026** repasse de **720,00 €** à **680,00 €**. » (agrégé si > 3 mois : « 7 mois changent, de sept. 2026 à mars 2027 : −280,00 € au total ») ;
- « **40,00 €** déjà encaissés en trop : ils apparaîtront en **trop-perçu** (avance du locataire). » ;
- « La quittance de **septembre 2026** a été émise à **720,00 €** : elle n'est pas modifiée. Pense à en refaire une si besoin. » (aucun geste automatique : la quittance est un acte, `app-part2.js:623` « jamais de recalcul ») ;
- cas propres : `premiere-periode-date`, `absorbe-irl`, période d'avenant (« cette période vient de l'avenant n° X signé : le document signé ne change pas »), bail clos (« bail clos : la dette et la restitution du dépôt seront recalculées »).

L'alerte se recalcule à chaque changement de champ (`oninput` débouncé 250 ms — pas à chaque frappe sur la date, cf. RETOURS §C4 « un chiffre puis ça expulse » : on ne re-rend **que** l'encart, jamais la fenêtre).

---

## 3. Journal, timeline, cloud

### 3.1 L'événement
Écrit dans **`DB.baux_evenements`** (table cloud, une ligne versionnée par entrée — survit à la concurrence, contrairement au blob) :

```js
{ id: 'bper_' + uid, type: 'periode', action: 'modifiee'|'supprimee'|'ajoutee',
  ref, bailDebut, bailUid?, signedAt?, _espaceId?,          // rattachement (copiés du bail du chapitre)
  date: leIso, _modifiedAt: leIso, auteur, motif,
  avant: {debut, fin, hc, ch, source} | null,               // null pour 'ajoutee'
  apres: {debut, fin, hc, ch, source} | null,               // null pour 'supprimee'
  voisines: [{debut, champ:'fin', avant, apres}],           // P recalée / absorbées
  impact: {mois:[{ym, avant, apres}], tropPercu, quittances:['2026-09'] } }
```
- **Pas de migration** : le mapper (`store-mapping.js:184`) range `type:'periode'` en `type_evenement='autre'`, l'objet entier reste dans `legacy_raw`.
- Aucun consommateur existant ne le confond : `journalDuBail` ne prend que `type==='modification'` (`bail-modifications.js:344`) → jamais réappliqué sur le bail ; le registre ne prend que `'avenant'` ; `backup.js:129` et `normalisation-loyers.js:166` ignorent les entrées sans `pdfKey`/`changements`.
- `bailUid`/`signedAt`/`_espaceId` copiés du bail du chapitre à la création, pour que `_rattacherJournal` (`store-sync.js:412`) n'ait rien à deviner ; bail non signé ou sans uid → ligne historique du logement (comportement de toutes les entrées actuelles).
- `DB.bailEvents` **n'est pas** utilisé (blob, dernier écrivain gagne) ; `_auditLog('update','bareme',ref, …)` reste appelé comme aujourd'hui.

### 3.2 Les traces dans le barème
Les tombstones portent leur raison (`_modifieePar`, `_supprimeePar`, `_absorbeePar`) + `evtId`. Les lignes écrites portent `_edition:{evtId, de, le}` et `_modifiedAt`. Les champs `_` commençant par `_edition`/`_…Par` ne sont lus par aucun moteur (`_baremeOfLot` filtre `_deleted`, puis ne lit que `debut/fin/hc/ch`).

### 3.3 Timeline (`js/core/bail-historique.js`, notre module)
- Chaque `periode` produite (l. 161-168) reçoit `cle` (§1.2), `source` (déjà là), `premiere` (debut === bailDebut) et `editable` — l'UI n'a plus à deviner.
- Nouveaux événements, **un seul rendu par modification**, tirés des **tombstones** (même blob que le barème : si la modification survit, sa carte aussi) et enrichis par l'entrée de journal de même `evtId` quand elle existe (auteur, impact) :
  - `periode-modifiee` (depuis `_modifieePar`) : « Période du **01/09/2026** modifiée le 06/10/2026 : 720,00 € → 680,00 €, date 01/09 → 01/10. Motif : … » + `hl-move` avant → après ;
  - `periode-supprimee` (depuis `_supprimeePar`) : « La période de 720,00 € du 01/09/2026 a été supprimée ; ces mois reprennent le tarif de la période précédente (680,00 €). Motif : … » ;
  - `periode-absorbee` : une ligne « remplacée par la période avancée au … ».
- La carte `modif` (l. 169) n'est émise que pour une période **née** manuelle : `source==='manuel' && (!_edition || _edition.de==='manuel')`, sinon une continuation passée en `manuel` (§1.3-4) ferait apparaître une fausse « Modification du loyer ».
- Constat en passant (hors périmètre, à signaler) : la carte `periode-remplacee` affiche comme motif la **note de la ligne remplacée** (`bail-historique.js:148`), pas celle de la remplaçante.

### 3.4 Effets de bord orchestrés (app, pas le module)
`_bailPeriodeAppliquer(ref, op)` dans `app-part2.js`, à côté de `_histoSaveCorrPeriode` :
1. clone (`snap` du barème et du journal, comme `app-part1.js:23258`) → retour arrière si une étape lève ;
2. `DB.loyerBareme = r.periods` ; push de l'entrée de journal (`_stamp`) ;
3. **loyer vivant** : `p = periodeEnVigueurA(DB.loyerBareme, ref, aujourd'hui)` ; si `p` appartient au chapitre **courant** et diffère de `bail.hc/ch` → `bail.hc/ch = p.hc/ch` **et** `log.hc/ch` + `_pushLoyerTheoFromLive(log)` + `_stamp(log)` (même geste que l'avenant, `app-part1.js:22803-22807`, sinon `_syncLogToBail` remet l'ancien loyer). Sur un bail signé verrouillé, `hc`/`ch` sont dans `CHAMPS_BAIL` (`fin:true`) : `_journaliserVerrouilles` en fait une entrée `source:'auto'` (invisible dans la timeline) → propagé au cloud sans toucher la ligne signée ;
4. `saveDB()` → `markDirty` → flush (config + table) ; `rLogFiche()` ; toast « Période modifiée » ;
5. `_auditLog('update','bareme',ref, 'période '+avant.debut+' → '+…+' : '+motif)`.

### 3.5 Multi-appareils (le vrai risque)
Le blob `espace_config` est réécrit **en entier** sans garde de version (`store-supabase.js:260-272`). Appareil A modifie une période ; appareil B, pas encore rafraîchi, valide une révision IRL : le blob de B écrase celui de A, **la modification de A disparaît du barème** sans erreur. Ce risque existe déjà pour toute écriture du barème et de `irlHistorique` ; il n'est pas créé par ce chantier, mais il devient visible car l'utilisateur corrige précisément un montant.
- **Ce que la livraison garantit** : l'entrée `baux_evenements` (table, ligne versionnée) **survit** ; elle porte `apres`.
- **Détecteur (phase 6)** : `periodesNonAppliquees(journal, bareme)` pur — entrée `type:'periode'` la plus récente par clé, dont l'état `apres` n'est pas présent dans le barème vivant **et** aucune entrée postérieure ne la remplace. Bandeau dans l'historique : « Une modification de période faite le 06/10 sur un autre appareil n'apparaît pas : **Réappliquer** · Ignorer ». Le geste rejoue la même opération pure (idempotente) ; **jamais de rejeu automatique au démarrage** (l'historique du barème montre ce que coûtent les écrivains de boot, `loyer-bareme.js:241-246`).
- Fusion par élément du blob : hors périmètre (concerne toute la config) — à consigner au BACKLOG.
- Membres scopés : rien de nouveau, `loyerBareme` est déjà filtré par ref (0044), `baux_evenements` par entité du bail (RLS 0054).

---

## 4. Révisions IRL : on n'y touche pas, on leur laisse une API

### 4.1 Dans cette livraison
Une période `source:'irl'` est **sélectionnable** ; sa fenêtre affiche un bandeau « Cette période vient de la révision IRL validée le … » et :
- **Charges** : modifiables (la révision IRL ne porte que le loyer HC) ;
- **Loyer HC et date** : affichés, non saisissables ici, avec les gestes IRL existants : « Corriger la date d'effet » (`_histoIrlCorrOpen`, `app-part2.js:14092` → `redaterRevisionIRL`) et, si elle est programmée, « Annuler la révision » (`IrlRevision.annulerRevisionProgrammee`). Pas de blocage : le bon geste, au bon endroit, dans la même fenêtre.
- **Pourquoi** : changer `debut` ou `hc` d'une période `irl` sans toucher `irlHistorique` désynchronise `redaterRevisionIRL` (qui la retrouve par `debut===ancienEffet`) et `_applyPendingIRLRevisions` (`app-part1.js:25142`), qui au jour de l'effet pose `log.hc = nouveauHC` de l'historique IRL, pas du barème.

### 4.2 API stable pour la session « IRL & courriers »
Exposée par `js/main.js` (pur) et `app-part2.js` (orchestrateur) :

```js
// Pur (window.BaremeEdition) — aucun effet
BaremeEdition.cleDePeriode(p)                        → {ref, bailDebut, debut}
BaremeEdition.trouverPeriode(periods, cle)           → {idx, periode} | null
BaremeEdition.modifierPeriode(periods, cle, patch, opts)  → résultat §1.3
BaremeEdition.supprimerPeriode(periods, cle, opts)
BaremeEdition.ajouterPeriode(periods, nouvelle, opts)
BaremeEdition.impactEdition({ref, bails, avant, apres, jusquAu})

// Orchestrateur (écrit DB, journal, loyer vivant, saveDB)
window._bailPeriodeModifier(ref, cle, patch, motif, opts)   → {ok, change, evt, impact, avertissements}
window._bailPeriodeSupprimer(ref, cle, motif, opts)
window._bailPeriodeAjouter(ref, {debut, fin?, hc, ch}, motif, opts)
//  opts = { origine: 'ui'|'irl', autoriserIRL: false, sansSave: false, auteur }
```
- `origine:'irl'` + `autoriserIRL:true` : lève la restriction §4.1 (date et HC d'une période `irl` modifiables) — **la session IRL met elle-même à jour `irlHistorique`** dans le même tour, puis appelle avec `sansSave:true` et fait un seul `saveDB()`.
- Contrat figé : signature, forme du résultat, clé `{ref, bailDebut, debut}`, sources conservées. Toute évolution = paramètre optionnel nouveau.

---

## 5. Ajouter une période manquante

« ＋ Corriger une période » faisait aussi « ajouter ». Il disparaît (maquette). **Recommandation** : dans la barre de sélection (« Sélectionne la période à modifier »), un lien secondaire **« ＋ Ajouter une période »** qui ouvre **la même fenêtre** en mode ajout : date d'effet (libre), loyer HC, charges, motif, et un « jusqu'au » facultatif replié (« pour une période limitée, ex. remise de 3 mois »). Écriture via `ajouterPeriode` (= la séquence actuelle, §1.3), mêmes alertes d'impact. Une seule fenêtre, un seul écrivain, aucune nouvelle règle. *(Q1)*

---

## 6. Plan de code, tests, vérification, risques

### 6.1 Étapes (1 phase = 1 commit, tests verts à chaque fois)

| # | Contenu | Fichiers |
|---|---|---|
| 1 | Module pur : `cleDePeriode`, `trouverPeriode`, `modifierPeriode`, `supprimerPeriode`, `ajouterPeriode` + tests unitaires + fuzz | `js/core/bareme-edition.js` (nouveau), `__tests__/helpers/bareme-edition.test.js`, `__tests__/helpers/bareme-edition-fuzz.test.js` |
| 2 | Impact pur `impactEdition` + tests (cas maquette : 720 → 680 sept. 2026) | idem + `bareme-edition-impact.test.js` |
| 3 | Historique : `cle`/`premiere`/`editable` sur les périodes ; cartes `periode-modifiee|supprimee|absorbee` ; garde de la carte `modif` | `js/core/bail-historique.js`, `__tests__/helpers/bail-historique.test.js` |
| 4 | Exposition `window.BaremeEdition` | `js/main.js` (à côté de l. 565-590) |
| 5 | UI : bouton « ✏️ Modifier » (remplace l. 13840), mode sélection (puce radio sur chaque `.hl-period`, cartes non périodes atténuées, barre Annuler/Modifier, lien « ＋ Ajouter une période »), fenêtre « Modifier la période du JJ/MM/AAAA » (date, HC, charges, motif, encart d'alerte, « Supprimer cette période » → confirmation dans la fenêtre avec sa propre alerte). Sélection par **index dans un tableau de clés construit au rendu** (`data-pidx`), jamais de clé interpolée dans un `onclick` (échappement, cf. SECU-INNERHTML). Modale `ov-histo-corr` refaite dans `index.html:5302` | `js/app/app-part2.js`, `index.html`, `css/main.css` (variables uniquement) |
| 6 | Orchestrateur + API `_bailPeriodeModifier/Supprimer/Ajouter`, journal `baux_evenements`, recalage du loyer vivant, retrait de `openHistoCorrPeriode`/`_histoSaveCorrPeriode` (grep : aucun autre appelant) | `js/app/app-part2.js` |
| 7 | Détecteur d'écriture perdue (pur + bandeau) | `bareme-edition.js`, `app-part2.js` |
| 8 | `node tools/stamp-app-parts.mjs`, bump version (title + footer), BACKLOG + RETOURS-2026-10-05 journal | |

Les `js/app/app-part*.js` sont en **CRLF** dans la copie de travail : éditer sans convertir les fins de ligne.

### 6.2 Tests Vitest
**Unitaires** (`bareme-edition.test.js`) — barèmes construits avec les **vrais** écrivains (`periodeInitialeBail` + `appliquerNouvellePeriode`), jamais à la main, comme `finances-invariant-i1.js` :
- maquette : 680 (2023-09-01→2026-08-31, bail) + 720 (2026-09-01→, manuel). Reculer au 2026-10-01 → `duMois('2026-09')` = 680 ; 2026-10 = 720 ; tombstone `_modifieePar` ; P.fin = 2026-09-30 ;
- avancer au 2026-06-01 → P.fin = 2026-05-31 ; avancer jusqu'à `bailDebut` → P absorbée (`_absorbeePar`), T première ;
- montants seuls → nouvelle ligne, même `debut`/`fin`, `note` d'origine conservée ;
- 1ʳᵉ période : date forcée ignorée + avertissement ; montants modifiables, source `bail` gardée ;
- continuation `bail` éditée → `manuel` ; puis `appliquerNouvellePeriode` antérieure ne la supersède plus ;
- période `irl` : charges seules (UI) ; avec `autoriserIRL` le module accepte tout ;
- suppression : avec P (P prolongée, ouverte si T l'était) ; 1ʳᵉ période (ligne au tarif de N) ; seule période ; dernière d'un bail clos (fin = clôture, jamais au-delà) ;
- chapitre voisin intact (deux baux successifs, modifier le premier ne touche pas le second — même esprit que `bareme-couverture-chapitre.test.js:151`) ;
- `trouverPeriode` : ref tolérante, legacy sans `bailDebut`, doublons → la dernière ;
- idempotence et `change:false` ; entrée non mutée (`structuredClone` + `toEqual`).
- **Composition saveBail** : après modification de la période ouverte `bail` + recalage `bail.hc`, `synchroniserPeriodeBail` est un no-op (le piège §1.4).

**Fuzz léger** (`bareme-edition-fuzz.test.js`) : PRNG à graine fixe (mulberry32, graine écrite dans le test), 2 000 séquences de 2 à 6 gestes tirés parmi {saveBail = `synchroniserPeriodeBail`, popup = `garantirCouverture`+`appliquerNouvellePeriode` manuel, IRL = idem source `irl`, `modifierPeriode`, `supprimerPeriode`, `ajouterPeriode`, `cloturerBareme`}, dates au 1er ou en cours de mois sur 2023-2028. Après **chaque** geste : I-A (pas de chevauchement), I-B (couverture continue du chapitre courant), I-C (≤ 1 période ouverte), I-E (rien ne disparaît sans raison), I-F (mélanger le tableau ne change aucun `duMois` sur 72 mois). Après chaque geste d'édition : I-D (mois hors fenêtre inchangés, via `infractionsI1` de `finances-invariant-i1.js`) et I-G (rejouer = `change:false`). Un échec affiche la graine et la séquence.

**Historique** : `construireHistoriqueBail` rend une carte par modification, aucune carte pour une tombstone sans raison, `cle` présente et utilisable par `trouverPeriode`.

**Orchestrateur** : extrait par vm comme `__tests__/helpers/bail-en-cours-lot-a.test.js` — recalage `log.hc`/`bail.hc`, entrée de journal (forme, `type:'periode'`, mapping `type_evenement='autre'` via `mapToRow`), retour arrière si exception.

### 6.3 Vérification navigateur
Cas D-101 de la maquette (SCI Dupont de démo) et un lot à révision IRL programmée :
1. Modifier → puces sur les seules pastilles de période ; Annuler restaure l'écran ;
2. reculer 720 € au 01/10/2026 → alerte « septembre 720 → 680 », trop-perçu si encaissé, quittance de septembre signalée ; Enregistrer → bandeau « Loyer en vigueur » à jour, carte « Période modifiée », Finances et onglet Loyers de septembre à 680 ;
3. supprimer → 680 € reprend ; carte « Période supprimée » ;
4. période IRL → seules les charges se saisissent, liens IRL présents ;
5. « Modifier le bail » sans changement financier juste après → le barème ne bouge pas ;
6. rechargement + second navigateur connecté au même espace → même historique ;
7. **3 formats** (1280 / 768 / 390 px), **clair et sombre** ; puces ≥ 44 px, champs ≥ 16 px, pas de défilement horizontal ; saisie de la date chiffre par chiffre sans perte de focus.

### 6.4 Risques
| Risque | Parade |
|---|---|
| Écrasement du blob par un autre appareil (§3.5) | entrée en table + détecteur « Réappliquer » (phase 7) ; fusion par élément au BACKLOG |
| Prochain saveBail repeint la période corrigée | recalage `bail.hc/ch` + `log` (§3.4) + test de composition |
| Désynchronisation IRL | §4.1 : `hc`/date d'une période `irl` réservés aux gestes IRL tant que la session IRL n'a pas branché l'API |
| Quittance émise ≠ nouveau dû | alerte explicite ; aucune réémission automatique |
| Période issue d'un avenant signé modifiée | alerte (le document ne change pas). Repérage par `note` « Avenant n° » (`app-part1.js:22799-22800`) : fragile, à remplacer par un champ `origine` si la session Avenant l'accepte |
| `_remplaceePar` posé par une ancienne écriture et notre `_modifieePar` dans le même rail | deux types de cartes distincts, testés |
| Bail clos : dette, restitution du DG recalculées | alerte « bail clos » ; pas de recalcul automatique d'une restitution déjà faite |
| Date « en cours de mois » | acceptée (`duMois` proratise, l. 165-192) ; conseil « 1er du mois » dans l'alerte, comme `_histoIrlCorrSave` (`app-part2.js:14131`) |

---

## 7. Questions ouvertes pour Didier

1. **Ajouter une période manquante** : lien « ＋ Ajouter une période » dans la barre de sélection, qui ouvre la même fenêtre vide (avec un « jusqu'au » facultatif) ?
   *Recommandation : oui (§5). Une seule fenêtre et une seule règle, et le geste reste visible dès qu'on clique sur « Modifier ».*
2. **Supprimer la 1ʳᵉ période du bail** (celle qui commence à la date du bail) : ses mois prennent le tarif de la **période suivante**, ou bien la suppression renvoie à « Modifier le bail », puisque le loyer initial est celui du contrat ?
   *Recommandation : tarif de la suivante, avec alerte (« le loyer initial du bail était de X € ») : on ne bloque pas, et l'erreur typique est une période initiale en trop.*
3. **Périodes issues d'une révision IRL** : dans cette livraison, seules les charges se modifient. La date et le loyer passent par « Corriger la date d'effet » ou « Annuler la révision », jusqu'à ce que la session IRL branche l'API. D'accord ?
   *Recommandation : oui. Sinon la lettre IRL, l'historique IRL et le loyer appliqué au jour de l'effet divergeraient du barème.*

---

## Journal
- 2026-10-06 : conception rédigée (lecture seule du code : `loyer-bareme.js`, `bail-historique.js`, `bail-modif.js`, `irl-revision.js`, `loyer-du-mois.js`, `bail-modifications.js`, `store-supabase*.js`, `store-sync.js`, `store-mapping.js`, `app-part1/2.js`, `index.html`, maquettes `periodes-*`). Aucun code modifié.
