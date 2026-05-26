# ARCHI-FICHES-UNIFIED — Audit + split définitif des fiches Immeuble / Bien / Bail / Locataire

**Status** : ⬜ Audit livré 2026-05-26 · décisions à arbitrer · **Prio** : P1 · **Taille** : XL (~15-20h cumulés sur 3-4 sessions dédiées)
**Détecté** : 2026-05-25 (BUG-CRITIQUES BUG 4 — « bcp d'infos redondantes entre immeuble et bien »)
**Remplace / consolide** : `ARCHI-IMM-LOG-DEDUP.md` · `ARCHI-DB-DOUBLONS.md` (Phase 4b restante) · `NAV-LOGEMENT-BAIL-CLARIF.md`

## Justification (4 critères pré-vol)

1. **Cible** : tous bailleurs — déduplication = saisie unique + 0 désync + UX claire
2. **Règles** : pas de patch — refonte propre transverse (cf `feedback_no_compromise`)
3. **Justifications** :
   - 🧑 Cas user 2026-05-25 (BUG 4) : « bcp d'infos redondantes »
   - 💻 Audit code 2026-05-26 : **~40 champs doublonnés** entre Bien et Bail (legacy v13, palliatif `_syncLogToBail` v14.16) + **3 champs doublonnés** entre Immeuble et Bien
   - 📋 Backlog : 3 sujets connexes (ARCHI-DB-DOUBLONS Phase 4b restant, ARCHI-IMM-LOG-DEDUP à attaquer, NAV-LOGEMENT-BAIL-CLARIF Option B validée)
4. **5 vues 360°** : technique (schéma propre) · UX (saisie unique) · données (intégrité, single source of truth) · juridique (immutabilité bail signé via snapshot) · cycle de vie (modif propagée, EDL ↔ bail ↔ logement)

---

## 1. Audit exhaustif des 4 entités (2026-05-26)

### 1.1 IMMEUBLE — `DB.entites[i].immeubles[j]` (8-11 champs)

| Champ | Type | Note |
|---|---|---|
| `id` | UUID | identifiant unique |
| `nom` | string | clé d'identité, requis |
| `adr` | string | adresse postale **complète** (rue + CP + ville) |
| `annee` | number | année construction (ou 0) |
| `periodeConstr` | string énum | « Avant 1949 », « 1949–1974 », etc. |
| `regimeJuridique` | string énum | « Copropriété » / « Monopropriété » |
| `valeurEstimee` | number € | estimation marché |
| `travaux` | string | description travaux réalisés |
| `montantTravaux` | number € | montant travaux |
| `notes` | string | notes libres |
| `driveFolderId` | string\|null | lien Drive (DRIVE-ARBORESCENCE) |

### 1.2 BIEN (Logement) — `DB.logements[]` (52 champs, dont ~20 legacy bail)

**Identité (5)** : `id`, `ref`, `entity` (FK), `imm` (FK), `type` (T2/T3/Local…), `typeUsage` (v14.15 : habitation-nu|habitation-meuble|mobilite|etudiant|garage|local-pro|autre)

**Localisation propre au bien (3)** : `adr`, `etage`, `surf`

**Description physique (5)** : `npp`, `piecesDesc`, `partiesCommunes`, `locauxPrivatifs`, `annexes`

**Juridique & réglementaire (7)** : `typeHabitat`, `regimeJuridique`, `periodeConstr`, `numFiscal`, `tantiemes`, `numLot`/`lot`, `compteCharges` (v14.61)

**DPE (sous-objet, 6 champs)** : `dpe.classe`, `dpe.ges`, `dpe.date`, `dpe.an`, `dpe.valConv`, `dpe.valEner`

**Risques (sous-objet, 6 champs)** : `etatRisques.erp`, `.plomb`, `.amiante`, `.elec`, `.gaz`, `.bruit`

**Équipements (sous-objets)** : `chauffage{elec,gaz,coll,autre,label}`, `ecs{elec,gaz,coll,label}`, `mobilier[]` (v14.15)

**Legacy bail courant — À RETIRER Phase 4 (9)** : `hc`, `ch`, `dg`, `irl`, `debut`, `fin`, `locataire`, `tel`, `mail`

**Système (4)** : `_modifiedAt`, `_deleted`, `_deletedAt`, `driveFolders`

### 1.3 BAIL — `DB.baux[ref]` (68 champs, dont ~30 legacy bien)

**Identité (3)** : `ref` (FK → log.ref), `entity` (FK), `nom` (legacy copie de locataires[0].nom)

**Type et régime (4)** : `type` (v15.191 BAIL-TYPES : nu|meuble|etudiant|mobilite|garage|autre), `typeContrat` (initial/renouvellement), `modalitePaiement` (terme_echu/echeoir), `destinationLocaux` (habitation/mixte)

**Conditions financières (4)** : `hc`, `ch`, `dg`, `fiscal`

**Dates et IRL (4)** : `debut`, `fin`, `irl`, `jpay`

**Zone tendue / encadrement art. 17 (7)** : `zoneTendue`, `encadrementLoyers`, `premiereLoc`, `dernierLoyerPrec`, `loyerRefMajore`, `complementLoyer`, `complementJustif`

**Mandataire / garant / caution (5)** : `withMandataire`, `garant`/`garant2` (legacy), `adrGarant`/`adrGarant2`, `villeGarant`/`villeGarant2`, `plafondCaution`

**Locataires (1 array)** : `locataires[]` (cf 1.4)

**Travaux & précédent (3)** : `travaux_inter_loc`, `precedentLoc`, `precedentLoyerDetail`

**Mobilier (1 obj, v15.192)** : `mobilier{11 catégories + details}`

**Administratif (4)** : `notes`, `quittAutoGen`, `villeSignature`, `signataires`

**Clôture (6)** : `finEffective`, `finMotif`, `locNouvelleAdr`, `dgRestitue`, `dgRetenu`, `finNotes`, `cloture`

**Signature & audit (1 obj)** : `signatures{mode, signedAt, bailSnapshot, …}`

**LEGACY redondant (À RETIRER Phase 4) — ~30 champs** :
- Bien : `adrBien`, `ftype`, `etage`, `surf`, `npp`, `piecesDesc`, `partiesCommunes`, `locauxPrivatifs`, `typeHabitat`, `regimeJuridique`, `periodeConstr`, `numFiscal`, `annexes`, `lot`
- Chauffage : `chauffElec/Gaz/Fioul/Bois/PoeleBois/PoeleGran/Insert/Cheminee/Clim/Coll/Autre`, `chauff` (synthèse)
- ECS : `ecsElec/Gaz/Coll`, `ecs` (synthèse)
- Diagnostics : `dpe`, `ges`, `dpeDate`, `diag`, `diagSoc`, `erp`, `plomb`, `amiante`, `elec`, `gaz`, `bruit`
- Équipements : `equipCuisine`, `equipSanitaires`, `techInfo`, `depensesEnergie`

**Système (3)** : `_modifiedAt`, `_archivedAt`, `_archivedAuto`

### 1.4 LOCATAIRE — `bail.locataires[]` (8-9 champs)

| Champ | Type | Note |
|---|---|---|
| `civilite` | enum | M./Mme/M. et Mme |
| `nom` | string | requis |
| `prenom` | string | legacy, optionnel |
| `ddn` | date | naissance |
| `lieuNaiss` | string | |
| `tel` | string | |
| `email` | string | |
| `adressePrecedente` | string | v13.23 |
| `adressePrecedenteSameAsFirst` | boolean | v13.23 propagation |

---

## 2. Doublons exhaustifs détectés (audit 2026-05-26)

### 2.1 Doublons Immeuble ↔ Bien (3, cf BUG-CRITIQUES-2026-05-25 BUG 4)

| Champ | Stocké sur | Décision proposée |
|---|---|---|
| **Adresse** | `log.adr` (complet) ET `imm.adr` (complet) | **Immeuble** porte rue + CP + ville. **Bien** ne porte que `etage` + `numApt` éventuel. Helper `_logResolveAddress(log)` retourne « 15 rue X — Apt 3B, 5e étage » via concat. |
| **Période construction** | `log.periodeConstr` ET `imm.periodeConstr` | **Immeuble** unique source. Bien hérite par référence. Cas exceptionnel d'extension/surélévation : pas pertinent (rare, ignoré). |
| **Régime juridique** | `log.regimeJuridique` ET `imm.regimeJuridique` | **Immeuble** unique source (« Copropriété » / « Monopropriété » est une propriété de l'immeuble entier, jamais d'un lot isolé). |

### 2.2 Doublons Bien ↔ Bail (~35, cf ARCHI-DB-DOUBLONS Phase 4b restante)

| Catégorie | Champs concernés | État | Décision |
|---|---|---|---|
| **Identité bien** | adrBien, ftype, etage, surf, npp, piecesDesc, partiesCommunes, locauxPrivatifs, annexes, lot | Phase 3b v14.16 : palliatif `_syncLogToBail` synchronise log → bail | **Retirer du bail. Bail lit `_readLogForBail(bail, log)`** (helper v14.17.2) → enrichi avec API legacy compat |
| **Juridique bien** | typeHabitat, regimeJuridique, periodeConstr, numFiscal | Idem | Idem |
| **Chauffage** | 11 booléens chauffXxx + chauffAutre + chauff (synthèse) | Idem | Bien porte `chauffage{}`, bail lit via helper |
| **ECS** | 3 booléens ecsElec/Gaz/Coll + ecs (synthèse) | Idem | Bien porte `ecs{}`, bail lit via helper |
| **Diagnostics** | dpe, ges, dpeDate, dpeAn, erp, plomb, amiante, elec, gaz, bruit + dpeValConv, dpeValEner | Idem | Bien porte `dpe{}` + `etatRisques{}`, bail lit via helper. **Snapshot signature** fige (immutabilité légale) |
| **Équipements** | equipCuisine, equipSanitaires, techInfo, depensesEnergie | Bail seul actuellement | **À déplacer vers bien.equipements{}** (champs à créer) |

### 2.3 Doublons Bien ↔ Bail courant (~9, cf ARCHI-DB-DOUBLONS Phase 4 cleanup)

Champs sur `log` qui dupliquent le bail courant (palliatif pour listings rapides) :

| Champ log | Réf bail | Helper de remplacement |
|---|---|---|
| `log.locataire` | `bail.locataires[0].nom` | `getCurrentTenant(log.ref).nom` |
| `log.tel` | `bail.locataires[0].tel` | `getCurrentTenant(log.ref).tel` |
| `log.mail` | `bail.locataires[0].email` | `getCurrentTenant(log.ref).email` |
| `log.debut` | `bail.debut` | `getCurrentBailFor(log.ref).debut` |
| `log.fin` | `bail.fin` | idem |
| `log.dg` | `bail.dg` | idem |
| `log.hc` | `bail.hc` | `getCurrentRent(log.ref).hc` |
| `log.ch` | `bail.ch` | `getCurrentRent(log.ref).ch` |
| `log.irl` | `bail.irl` | `getCurrentBailFor(log.ref).irl` |

Tous les helpers existent depuis **v14.14** (ARCHI-DB-DOUBLONS Phase 2). **Phase 4 cleanup** = suppression définitive de ces 9 champs sur log + refacto des ~79 sites de lecture.

### 2.4 Doublons Bail ↔ Locataire (legacy garant)

| Champ legacy bail | Doublon avec |
|---|---|
| `bail.garant` (string nom) | structure `locataires[]` n'a pas de section `garants[]` séparée — refacto possible mais hors scope actuel |
| `bail.adrGarant` | idem |
| `bail.villeGarant` | idem |

Décision : **garder le legacy garant tel quel** (peu de doublon réel, code stable). Future refonte si besoin → `bail.garants[]` parallèle à `bail.locataires[]`.

---

## 3. Schéma cible définitif (source unique de vérité)

```
┌─────────────────────────────────────────────────────────────────┐
│ ENTITÉ (DB.entites[]) — BAILLEUR (perso / SCI / SARL / …)       │
│  ├── id, nom, type (statut juridique), siren, rcs               │
│  ├── siege (adresse bailleur), gerant                           │
│  ├── iban, bic, logo, mandataire?                               │
│  ├── coGestionnaires[] (Drive partage)                          │
│  └── immeubles[] (collection embedded)                          │
└─────────────────────────────────────────────────────────────────┘
                              │ owns
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ IMMEUBLE (ent.immeubles[]) — LE BÂTIMENT                        │
│  ├── id, nom                                                     │
│  ├── adr (rue + CP + ville)         ◄── SOURCE UNIQUE           │
│  ├── periodeConstr / annee          ◄── SOURCE UNIQUE           │
│  ├── regimeJuridique (copro/mono)   ◄── SOURCE UNIQUE           │
│  ├── syndic? (à ajouter cf BAILLEUR-FORM-RICHE)                 │
│  ├── nbLots? (info copropriété)                                 │
│  ├── equipementsCommuns? (ascenseur, gardien, interphone…)      │
│  └── travaux, montantTravaux, valeurEstimee, notes              │
└─────────────────────────────────────────────────────────────────┘
                              │ contient
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ BIEN / LOGEMENT (DB.logements[]) — LE LOT                       │
│  ├── ref, imm (FK), entity (FK)                                 │
│  ├── etage, numApt?, type (T2/T3/garage/…)                      │
│  ├── typeUsage (habitation-nu/meuble/etudiant/…)                │
│  ├── surf, npp, piecesDesc, partiesCommunes, locauxPrivatifs    │
│  ├── annexes, lot (n° copro), tantiemes, numFiscal              │
│  ├── dpe{classe, ges, date, an, valConv, valEner}               │
│  ├── etatRisques{erp, plomb, amiante, elec, gaz, bruit}         │
│  ├── chauffage{elec, gaz, coll, autre, label}                   │
│  ├── ecs{elec, gaz, coll, label}                                │
│  ├── equipements{cuisine, sanitaires, techInfo, depensesAn}     │
│  │   ◄── À CRÉER (déplacement bail → bien)                      │
│  ├── mobilier[]? (si typeUsage meublé/étudiant/mobilité)        │
│  ├── photos[]?, annonce?                                         │
│  ├── archived, _modifiedAt, _deleted, driveFolders              │
│  │                                                               │
│  │ ❌ RETIRÉS Phase 4 ARCHI-DB-DOUBLONS :                       │
│  │    hc, ch, dg, irl, debut, fin, locataire, tel, mail         │
│  │    → remplacés par helpers getCurrentXxx(ref)                │
│  │                                                               │
│  │ 🚫 Hérités de l'immeuble parent (lecture seule) :            │
│  │    _logResolveAddress(log) → imm.adr + log.etage             │
│  │    _logResolvePeriodeConstr(log) → imm.periodeConstr         │
│  │    _logResolveRegimeJuridique(log) → imm.regimeJuridique     │
└─────────────────────────────────────────────────────────────────┘
                              │ peut avoir N baux dans le temps
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ BAIL (DB.baux[ref]) — LE CONTRAT JURIDIQUE                      │
│  ├── ref (FK → log.ref), entity (FK)                            │
│  ├── type (nu/meuble/etudiant/mobilite/garage/autre)            │
│  ├── typeContrat, modalitePaiement, destinationLocaux           │
│  ├── locataires[] (cf bloc Locataire)                           │
│  ├── garant, garant2, adrGarant, plafondCaution (legacy mainte) │
│  ├── debut, fin, irl, jpay                                      │
│  ├── hc, ch, dg, fiscal                                          │
│  ├── zoneTendue{premiereLoc, dernierLoyerPrec, loyerRefMajore…} │
│  ├── travaux_inter_loc, precedentLoc, precedentLoyerDetail      │
│  ├── notes, quittAutoGen, villeSignature, signataires           │
│  ├── signatures{mode, signedAt, bailSnapshot{…}}                │
│  │     ↑ FIGE l'état du bail + log au moment signature          │
│  ├── cloture{finEffective, finMotif, dgRestitue, dgRetenu, …}   │
│  ├── _modifiedAt, _archivedAt, _archivedAuto                    │
│  │                                                               │
│  │ ❌ RETIRÉS Phase 4 ARCHI-DB-DOUBLONS (~30 champs) :          │
│  │    adrBien, ftype, etage, surf, npp, piecesDesc, …           │
│  │    chauffXxx (11), ecsXxx (3), dpe, ges, dpeDate, erp, …    │
│  │    equipCuisine, equipSanitaires, techInfo, depensesEnergie  │
│  │    → remplacés par _readLogForBail(bail, log)                │
│  │                                                               │
│  │ 🚫 Hérités lecture via _readLogForBail :                     │
│  │    dpe/ges/etatRisques/chauffage/ecs/equipements/surf/etage… │
└─────────────────────────────────────────────────────────────────┘
                              │ a N locataires (parties)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LOCATAIRE (bail.locataires[i]) — UNE PERSONNE                   │
│  ├── civilite, nom, prenom?, ddn, lieuNaiss                     │
│  ├── tel, email                                                  │
│  ├── adressePrecedente, adressePrecedenteSameAsFirst (v13.23)   │
│  └── (profession, employeur, revenus → futur dossier locataire) │
└─────────────────────────────────────────────────────────────────┘
                              │ associé à
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ EDL (DB.edl[]) — DOCUMENT CONTRADICTOIRE                        │
│  ├── id, logement (FK → log.ref), date, type (Entrée/Sortie)    │
│  ├── pieces[], compteurs{}, chauffage{}, technologies{}, cles[] │
│  ├── daaf{}, mobilier{enabled, elements[], details}             │
│  │   ◄── v15.205 inventaire mobilier contradictoire             │
│  ├── signatures{bailleur, locataire, signedAt, edlSnapshot}     │
│  └── _modifiedAt, _deleted                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Décisions à arbitrer (CDC user)

### Bloc A — Immeuble ↔ Bien (3 décisions)

- [ ] **A1** : `imm.adr` complète (rue + CP + ville) **OU** `imm.adr` rue + `imm.codePostal` + `imm.ville` séparés ? → **recommandé : séparés** (parsing PDF/lettres + autoCompletion adresses)
- [ ] **A2** : maintenir `log.adr` comme override (cas rare bâtiment avec entrées multiples) ou suppression brute ? → **recommandé : suppression**, le bien porte juste `etage` + `numApt` éventuel
- [ ] **A3** : où vivent les **équipements communs** (ascenseur, gardien, interphone, digicode) ? → **immeuble** (logique : ils servent tous les lots)

### Bloc B — Bien ↔ Bail (3 décisions)

- [ ] **B1** : confirmer suppression définitive Phase 4 des **9 champs legacy log → bail courant** (`log.locataire/tel/mail/debut/fin/hc/ch/dg/irl`) ? → **recommandé : OUI**, helpers `getCurrentXxx` opérationnels depuis v14.14
- [ ] **B2** : confirmer suppression définitive Phase 4 des **~30 champs legacy bail → bien** (`bail.adrBien/ftype/etage/surf/dpe/ges/erp/…`) ? → **recommandé : OUI**, `_readLogForBail` opérationnel depuis v14.17.2 (palliatif `_syncLogToBail` à retirer)
- [ ] **B3** : déplacer les **4 équipements bail-only** (`equipCuisine/equipSanitaires/techInfo/depensesEnergie`) vers `log.equipements{}` ? → **recommandé : OUI**

### Bloc C — UX navigation (4 décisions, cf NAV-LOGEMENT-BAIL-CLARIF)

- [ ] **C1** : sidebar = **Bien** (vue par défaut = logements groupés par immeuble) + **Locataires** (vue transversale échéances + candidats + comm) + **EDL** (conservé) ? → **Option B validée par user 2026-05-17**
- [ ] **C2** : modale « Modifier bien » avec **encart « 🏛 Hérité de l'immeuble » en lecture seule** + lien « Modifier dans l'immeuble » ? → **recommandé : OUI**
- [ ] **C3** : wizard bail tab « Le bien » déjà en read-only (Phase 4a v14.17) → **conserver** ?
- [ ] **C4** : suppression de l'encart legacy « Bail courant » dans modale logement Phase 3a (`bail.hc/ch/dg/locataire`) maintenant que `getCurrentXxx` existe ? → **recommandé : OUI**
- [ ] **C5** : page Locataires — tris disponibles + affichage **groupé par immeuble** (défaut, comme page Bien) ou **liste plate** (alphabétique) ? → **proposé : groupé par défaut, toggle Affichage « Groupé / Liste plate »**, persisté localStorage. Tris : Immeuble (défaut) / Alphabétique A→Z / Échéance bail / Montant loyer. Retour user 2026-05-26.

### Bloc D — Règle UX transverse (1 décision)

- [ ] **D1** : **« choix prédéfini + ajout libre toujours »** — partout où on propose des choix (checkboxes, dropdowns, équipements, catégories…), il DOIT y avoir une zone d'ajout manuel libre en complément. Retour user 2026-05-26 : « quand tu mets des choix (type équipements communs) il faut toujours pouvoir ajouter manuellement ».
  - **Sites concernés** (audit à faire) : équipements communs immeuble, chauffage bien/bail, ECS, types de chauffage EDL, motifs fin de bail, catégories mouvements, technologies (fibre/ADSL), équipements sanitaires, etc.
  - **Pattern UI standardisé** : bloc checkboxes/options + sous le bloc → input texte « + Autre (préciser) » + bouton « + Ajouter » → l'ajout devient un badge cliquable (✕ pour supprimer) accumulé en dessous.
  - **Persistance** : chaque entité stocke une clé `customXxx[]` parallèle aux flags booléens (ex : `imm.equipementsCommuns.customs = ['Toit-terrasse', 'Local poussettes']`).

---

## 5. Plan d'exécution proposé (3-4 sessions, ~15-20h)

### Session 1 — CDC + décisions (1h)
- Validation user des décisions A1-A3, B1-B3, C1-C4 (cf §4)
- Capture des édge cases (overrides, anciennes données pré-migration)
- ⏸️ **STOP user** avant Session 2

### Session 2 — Refonte Immeuble↔Bien (~4-6h, 2 commits)

**Commit 1 (~2h)** — Schéma immeuble enrichi :
- Ajouter `imm.codePostal`, `imm.ville`, `imm.syndic`, `imm.nbLots`, `imm.equipementsCommuns{ascenseur, gardien, …}` (selon A1, A3)
- Migration auto au boot : split `imm.adr` (regex « rue ; CP ; ville »)
- Modale Immeuble enrichie avec ces nouveaux champs
- Tests : migration adresse SCI Dupont demo + retro-compat

**Commit 2 (~2-4h)** — Bien hérite de l'immeuble :
- Helpers `_logResolveAddress(log)`, `_logResolvePeriodeConstr(log)`, `_logResolveRegimeJuridique(log)` (retourne override bien sinon immeuble)
- Modale Logement Phase 3a : retire champs `adr` complète, `periodeConstr`, `regimeJuridique` (passe en encart lecture « 🏛 Hérité »)
- Modale Logement : ajoute `etage` + `numApt` séparés
- Migration : si `log.adr === imm.adr` → vide log.adr (le bien hérite). Sinon → conserver override.
- Sites de lecture (~30 dans PDF + listings) : utiliser les helpers
- Tests : modif adresse immeuble propage automatiquement aux baux

### Session 3 — Cleanup ARCHI-DB-DOUBLONS Phase 4b (~6-8h, 1 commit gros)

**Phase 4b refacto code** (déjà préparée par `_readLogForBail` enrichi v14.17.2) :
- Migrer les ~149 sites de lecture `bail.X` (champs bien) vers `_readLogForBail(bail, log).X`
- Migrer les ~79 sites de lecture `log.X` (champs bail courant) vers `getCurrentXxx(ref).X`
- Suppression définitive des ~30 champs bail legacy + 9 champs log legacy
- Suppression `_syncLogToBail` (devient obsolète)
- Suppression encart legacy modale logement
- Suppression scope : 5 fonctions PDF (`previewBailData`, `previewBailDataV2`, `genBailHTML`, `exportBailWord`, `genPDFNative`) + listings (`rBaux`, `rMv`, `rDash`, `rEDLList`, `rQuit`) + fiches 360°
- Tests intégrés OBLIGATOIRES : 3 PDF bails (DEMO nu signé / meublé non signé / historique archivé) — comparer rendu pixel-near
- Drive sync round-trip après migration

### Session 4 — UX sidebar + UI (~3-4h, 2 commits)

**Commit 1 (~2h)** — Refonte sidebar (NAV-LOGEMENT-BAIL-CLARIF Option B) :
- Renommer onglet **Baux & Locataires** → **Locataires** (vue transversale)
- Hub **Biens** → vue par défaut = Logements groupés par immeuble (cf UX-GROUP-BY-IMMEUBLE)
- Onglet EDL conservé tel quel

**Commit 2 (~2h)** — Mockup-first puis implémentation pages :
- Mockups A/B/C × 3 formats pour : page Bien (vue logements groupés), page Locataires (échéances + pipeline candidats + boutons ✉ Écrire)
- Validation user
- Implémentation

---

## 6. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Régression PDF bail (149 sites de lecture migrés) | **Élevé** — bails utilisés en prod | Tests pixel-near sur 3 bails de référence + bailSnapshot fige les bails signés (immutabilité) |
| Désync historique des baux clôturés | Moyen | bailSnapshot doit être figé pour tous les baux signés avant migration |
| Migration adresse échoue partiellement (regex split CP/ville imparfait) | Moyen | Migration conservatrice : si split incertain → laisser l'adresse complète sur l'immeuble + log.adr vide (l'override n'est créé que si vraiment différent) |
| Drive sync cassé | Moyen | Backup auto pré-migration + tests round-trip post-migration |
| Utilisateur perd l'override d'adresse bien | Faible | Migration idempotente : si `log.adr !== imm.adr` → conserver l'override |
| Wizard bail confus pendant transition | Faible | Phase 4a v14.17 déjà lecture seule, juste le contenu change |

---

## 7. Coordination avec autres sujets

| Sujet | Statut | Lien |
|---|---|---|
| **ARCHI-DB-DOUBLONS** | Phases 1-3a-3b-4a-4b fondation ✅ v14.x | Englobé dans ARCHI-FICHES-UNIFIED Session 3 |
| **ARCHI-IMM-LOG-DEDUP** | Audit à faire | Englobé dans Session 1 (CDC) + Session 2 |
| **NAV-LOGEMENT-BAIL-CLARIF** | Option B validée 2026-05-17 | Englobé dans Session 4 |
| **WIZARD-CREATION-SEQUENTIEL** | À faire | Coordonné avec Session 4 (flow immeuble → bien → bail) |
| **BAILLEUR-FORM-RICHE** | Backlog | Session 2 ajoute `imm.syndic` / coordonné |
| **UX-GROUP-BY-IMMEUBLE** | À faire | Session 4 — vue Logements groupés par immeuble |
| **FICHES-PARITE-360** | À faire | Bénéficie de l'audit ARCHI-FICHES-UNIFIED |
| **LOG-CANDIDATS** | À faire | Pipeline candidats dans onglet Locataires (Session 4) |
| **BAIL-TYPES Phase B** | ✅ v15.191→v15.206 | Indépendant, déjà livré |

---

## 8. Bilan estimé

| Session | Coût | Livrable |
|---|---|---|
| **1** — CDC + décisions | ~1h | Doc CDC arbitré (A1-A3, B1-B3, C1-C4) |
| **2** — Immeuble↔Bien | ~4-6h | 2 commits (schéma immeuble + helpers bien hérite) |
| **3** — Cleanup bail↔bien | ~6-8h | 1 commit gros (149 sites migrés, 39 champs supprimés) |
| **4** — UX sidebar | ~3-4h | 2 commits (sidebar + mockup-first pages) |
| **TOTAL** | **~15-20h** | **5-6 commits, ~3-4 sessions dédiées** |

**Gain attendu** :
- Suppression de **~40 champs doublons** → DB plus légère (~10-15% de réduction sur les payloads Drive)
- Saisie unique par champ → 0 désync possible
- UX claire : « le mur » (Bien) vs « la personne » (Locataires) vs « le contrat » (Bail)
- Code maintenu plus simple : 0 `_syncLogToBail`, 0 _migration legacy

---

## 9. Notes utilisateur

> 💬 2026-05-25 (BUG-CRITIQUES BUG 4) : « il y a bcp d'infos redondantes entre immeuble et bien (adresse, année de construction, régime juridique…) »
>
> 💬 2026-05-25 (BUG 3.B) : « on a bcp d'infos dans biens qui sont liés au locataire »
>
> 💬 2026-05-17 (NAV) : « dans la sidebar, logements = baux » + « je ferais un onglet bien où on a la visu de tous les logements »
>
> 💬 2026-05-17 (NAV) : « il faut quelque chose d'intuitif (pas une redite de la même chose) »
>
> 💬 2026-05-26 : « tu continues avec mes remarques de redondance entre bail logement and co ? tu fais un audit complet et une proposition de split »

---

## 10. Journal

- 2026-05-26 : **Audit complet livré** (4 entités × 130+ champs catalogués). Inventaire exhaustif des doublons : 3 Immeuble↔Bien + ~35 Bien↔Bail + 9 Bien↔Bail-courant + quelques garant. Schéma cible défini. Plan 4 sessions / ~15-20h. CDC user requis (12 décisions A1-A3 / B1-B3 / C1-C4). Englobe 3 sujets antérieurs : ARCHI-IMM-LOG-DEDUP + ARCHI-DB-DOUBLONS Phase 4b + NAV-LOGEMENT-BAIL-CLARIF.
- 2026-05-26 : **Mockup HTML interactif livré** (`mockups/ARCHI-FICHES-UNIFIED/mockup.html`) — 6 vues switchables (schéma général, sidebar refondue, modale Immeuble enrichie, modale Bien allégée, page Bien groupée par immeuble, page Locataires). Standalone, responsive, design system ImmoTrack.
- 2026-05-26 : **2 retours user sur le mockup** :
  - **Règle UX transverse D1** : « quand tu mets des choix (type équipements communs) il faut toujours pouvoir ajouter manuellement » → ajout de la décision D1 (« choix prédéfini + ajout libre toujours »). Pattern standardisé documenté. Sites concernés à auditer.
  - **Décision C5** : page Locataires doit pouvoir trier par immeuble (et avoir un mode groupé) OU alphabétique. Vue groupée par immeuble proposée comme défaut (cohérence avec page Bien). Tris : Immeuble / Alphabétique / Échéance / Loyer. Affichage Groupé / Liste plate. Persistance localStorage.
  - Mockup mis à jour : équipements communs avec ajout libre + badges, chauffage avec ajout libre, page Locataires avec barre de tri + affichage groupé par défaut.
