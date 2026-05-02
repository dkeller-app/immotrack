# ARCHI-DB-DOUBLONS — Refonte architecture DB : séparer log (bien physique) et bail (contrat juridique)

**Status** : 🔄 Phases 1+2+**3a (UI tabs internes)** ✅ livrées v14.15 · Phase 3b (refacto reads/writes PDF) ⬜ prête · **Prio** : P1 · **Taille** : XL (~12-15h, ~5-7h restantes)
**Détecté** : 2026-04-23 (initial) · enrichi 2026-05-02 (audit bidirectionnel + CDC)
**Lié à** : LOG-FICHE-360 Phase 2 · FICHES-PARITE-360 (prérequis) · BAIL-NAMESPACE-MIGRATION · BAIL-TYPES (lien fort via log.typeUsage) · V3-VISUEL · LOG-PHOTOS · EDL-TEMPLATE-PER-LOG (parallèle, hors scope ARCHI)

## Contexte

ImmoTrack stocke aujourd'hui des **doublons bidirectionnels** entre les objets `log` (DB.logements) et `bail` (DB.baux). Conceptuellement, un bail est un contrat juridique (parties + conditions + durée + signatures) et un logement est un bien physique (adresse + surface + équipements + DPE). La duplication actuelle est un **héritage de simplicité** : pour générer un bail PDF, on a regroupé toutes les infos sur le bail au lieu de cross-référencer.

Le défaut est d'autant plus visible quand :
1. L'utilisateur crée un nouveau bail → ressaisie du bien (alors qu'il existe)
2. Modification du DPE sur un bail → pas propagée aux autres baux du même bien
3. Modification du logement → désynchronisation possible avec le bail courant
4. Confusion UX : « pourquoi je modifie le DG dans le formulaire bien ? »

Fix provisoire en place : `_syncLogToBail(ref, log)` (~ligne 16660) propage les modifs log → bail courant. Mais c'est un pansement, pas une solution.

## Diagnostic — Doublons bidirectionnels actuels

### A. Champs **bien physique** stockés à tort sur le bail

Visibles dans le wizard bail étape "Le bien" (capture utilisateur 2026-05-02) :

| Champ bail | Devrait être uniquement sur log |
|---|---|
| `adrBien` | `log.adr` |
| `ftype` | `log.type` |
| `etage` | `log.etage` |
| `surf` | `log.surf` |
| `npp` (nb pièces principales) | `log.npp` (à créer) |
| `piecesDesc` | `log.piecesDesc` (à créer) |
| `partiesCommunes` | `log.partiesCommunes` (à créer) |
| `locauxPrivatifs` | `log.locauxPrivatifs` (à créer) |
| `typeHabitat` | `log.typeHabitat` (à créer) |
| `regimeJuridique` | `log.regimeJuridique` (à créer) |
| `chauffage[]` | `log.chauffage[]` (à créer) |
| `annexes` | `log.annexes` (à créer) |
| `dpeClasse`, `dpeDate`, `dpeValConv`, `dpeValEner`, `dpeAn` | `log.dpe.*` (à créer en sous-objet) |
| `gesClasse` | `log.dpe.ges` |
| `erp`, `plomb`, `amiante`, `elec`, `gaz`, `bruit` | `log.etatRisques.*` (à créer en sous-objet) |

### B. Champs **bail (contrat)** stockés à tort sur le logement

Visibles dans le formulaire logement (capture utilisateur 2026-05-02) :

| Champ log | Devrait être uniquement sur bail |
|---|---|
| `locataire` | `bail.locataires[0].nom` |
| `tel` | `bail.locataires[0].tel` |
| `mail` | `bail.locataires[0].email` |
| `debut` | `bail.debut` |
| `fin` | `bail.fin` |
| `dg` | `bail.dg` |
| `irl` | `bail.irl` |
| `hc` | `bail.hc` |
| `ch` | `bail.ch` |

Ces champs correspondent au "bail courant" actif sur le logement. Aujourd'hui ils sont copiés sur log pour faciliter les listings (carte logement avec locataire visible directement), mais c'est de la dénormalisation.

## Décisions CDC arbitrées (2026-05-02)

Synthèse des 8 questions/réponses lors de la session Phase 1 (CDC) :

| Q | Décision | Rationale |
|---|---|---|
| Q1 | **A** : Wizard bail étape "Le bien" devient **lecture seule** + bouton "Modifier le bien" qui ouvre la modale logement | Affiche pour validation visuelle + permet correction sans re-saisie. Garde le repère wizard 4 étapes. |
| Q2 | **B** : Modale logement refondue avec **tabs internes** : `Identité / Description / DPE / Risques / Équipements` | Pattern existe déjà dans l'app (modale Bail wizard, onglet Référentiel). Formulaire compartimenté lisible. |
| **Q2bis** | **Tab "Équipements" inclut sous-section Mobilier** (visible si bail meublé/étudiant/mobilité) | Lié à BAIL-TYPES (génération annexe inventaire obligatoire loi 89-462 art. 25-1). Synergie possible avec EDL-TEMPLATE-PER-LOG. |
| Q3 | **A** : **Suppression brute** des champs bail dupliqués sur log (`log.locataire`, `log.dg`, etc.). Helpers `getCurrentBailFor()`, `getCurrentTenant()`, `getCurrentRent()` partout. | Single source of truth strict. Pas de désync possible. `_syncLogToBail()` devient obsolète. Performance impact négligeable (~5ms total même sur 50 logements). |
| Q4 | **B** : Migration **hard** + backup auto + toast utilisateur explicite. 4 backups distincts (1 par phase). | Pattern DRIVE-2C existant. 1 utilisateur principal (testeur). Pas de double maintenance pendant 3 versions. |
| **Q4bis** | **Champ `log.typeUsage`** (NEW) avec 7 valeurs : `habitation-nu`/`habitation-meuble`/`mobilite`/`etudiant`/`garage`/`local-pro`/`autre`. Override possible via `bail.typeBail`. | Source de vérité du type sur le **bien** (le bien détermine quels baux possibles). Lien fort avec BAIL-TYPES (templates PDF) et BAIL-MOBILIER (annexe inventaire). |
| Q5 | **A** : Étendre `bailSnapshot` avec **deep copy de log** à la signature. Helper `_readLogForBail(bail, log)` retourne snapshot.log si signé sinon log dynamique. | Immutabilité légale du bail signé. Volume négligeable (~75 KB par snapshot). Compatible avec le mécanisme de "Réinitialiser signatures" pour avenant. |
| Q6 | **A** : EDL **hors scope** ARCHI. Couvert par EDL-TEMPLATE-PER-LOG (P2/M, ~6h, session parallèle). | Snapshot EDL est conceptuellement légitime (instantané à date T). EDL-TEMPLATE-PER-LOG cible la centralisation du template (matériaux, équipements). Codable en parallèle (zones distinctes). |
| Q7 | **A** : Migration **auto au boot**, idempotente (`DB._migratedArchiV1`), avec backup automatique + toast explicite. | Robuste, transparent. Toast informe de l'assomption "le bien n'a pas été modifié post-signature sans ré-signer". Backup permet rollback complet en cas de problème. |
| Q8 | **OK** : Ordre 4 phases : CDC → Migration data + getters → Refacto code reads/writes → Cleanup champs obsolètes | Logique de dépendance : data avant code, lecture migrée avant suppression. Rollback possible à chaque phase via backup. |

### Précisions importantes des décisions

- **Bail vivant ≠ bail figé** :
  - `bail.X` (vivant) = modifiable. IRL appliqué change `bail.hc`, modifs locataire (mail, tel) propagent.
  - `bail.signatures.bailSnapshot` (figé) = immutable, ce qui a été signé. Le PDF "Voir bail signé" lit là-dedans.
  - `log.X` (vivant) = modifiable. DPE refait, équipement ajouté.
  - `bail.signatures.bailSnapshot.log` (figé) = état du bien à la signature, immutable.
- **IRL appliqué** : `bail.hc` change (nouveau loyer pour les futurs mouvements/quittances), **mais** `bailSnapshot.hc` reste l'ancien.
- **Avenant nécessaire** (ex: prolongation, changement loyer hors IRL) → ré-signature = nouveau snapshot. Mécanisme "Réinitialiser signatures" déjà en place v13.x.

## Audit code détaillé (2026-05-02)

### Sites de lecture par catégorie

| Catégorie | Pattern | Sites | Critique |
|---|---|---|---|
| bail.X (champs bien dupliqués sur bail) | regex `bail\.(dpeClasse\|surf\|etage\|chauffage\|...)` | **85** | DPE 3 / ERP+co 26 / surf+etage 16 / autres ~40 |
| log.X (champs bail dupliqués sur log) | regex `log\.(locataire\|hc\|ch\|dg\|...)` | **79** | locataire 24 / debut+fin 13 / hc+ch+dg+irl 42 |
| log.X (champs bien dejà sur log, partiel) | regex `log\.(dpeClasse\|surf\|adr\|...)` | **25** | Champs partiellement présents |
| bailSnapshot | regex `bailSnapshot\|signatures\.bailSnapshot` | **9** | Critique pour immutabilité |
| **Total à migrer** | | **~165** | |

### Fonctions PDF impactées (toutes reçoivent `log` déjà en paramètre — bonne nouvelle)

| Fonction | Ligne | Risque migration | Action Phase 3 |
|---|---|---|---|
| `previewBailData(bail, log, ref, opts)` | 11982 | **Élevé** — gros morceau | Lecture via `_readLogForBail(bail, log)` |
| `previewBailDataV2(bail, log, ref)` | 10961 | Moyen | idem |
| `genBailHTML(bail, log, ref, ent, locs, ...)` | 13947 | **Élevé** — template Word légal | idem |
| `exportBailWord(bail, log, ref)` | 13875 | Moyen | idem |
| `genPDFNative` (string template) | 13570 | **Élevé** — PDF natif texte sélectionnable | idem |

### Champs à CRÉER sur log (n'existent pas aujourd'hui)

| Champ | Type | Origine | Note |
|---|---|---|---|
| `log.typeUsage` | string enum | NEW Q4bis | 7 valeurs (cf décisions). Cardinal pour la fiche bien. |
| `log.npp` | int | bail.npp | Nb pièces principales |
| `log.piecesDesc` | string | bail.piecesDesc | Description pièces |
| `log.partiesCommunes` | string | bail.partiesCommunes | |
| `log.locauxPrivatifs` | string | bail.locauxPrivatifs | Annexes privatives (cave, parking) |
| `log.typeHabitat` | string | bail.typeHabitat | |
| `log.regimeJuridique` | string | bail.regimeJuridique | |
| `log.chauffage` | string[] | bail.chauffage[] | Array : électrique, gaz, fioul, bois, poêle bois, poêle granulés |
| `log.annexes` | string | bail.annexes | Texte libre |
| `log.mobilier` | object[] | NEW Q2bis | `[{piece, items: [{nom, qty, etat}]}]` — visible si typeUsage meublé/étudiant/mobilité |
| `log.dpe` | sous-objet | bail.dpe* (4 champs) | `{classe, date, valConv, valEner, an, ges}` |
| `log.etatRisques` | sous-objet | bail.erp/plomb/... (6 champs) | `{erp, plomb, amiante, elec, gaz, bruit}` |

### Champs à RETIRER (Phase 4 cleanup)

**Sur log** : `locataire`, `tel`, `mail`, `debut`, `fin`, `dg`, `irl`, `hc`, `ch` (9 champs, ~79 sites de lecture migrés)

**Sur bail** : `adrBien`, `ftype`, `surf`, `etage`, `npp`, `piecesDesc`, `partiesCommunes`, `locauxPrivatifs`, `typeHabitat`, `regimeJuridique`, `chauffage`, `annexes`, `dpeClasse`, `dpeDate`, `dpeValConv`, `dpeValEner`, `dpeAn`, `gesClasse`, `erp`, `plomb`, `amiante`, `elec`, `gaz`, `bruit` (24 champs, ~85 sites de lecture migrés)

### Helpers à créer

| Helper | Signature | Phase | Description |
|---|---|---|---|
| `getCurrentBailFor(ref)` | → bail \| null | 2 | Bail actif sur log.ref (non clôturé) |
| `getCurrentTenant(ref)` | → locataire \| null | 2 | `bail.locataires[0]` du bail actif |
| `getCurrentRent(ref)` | → `{hc, ch, total}` \| null | 2 | Loyer du bail actif |
| `_captureBailSnapshot(ref, bail, log)` | mutation bail.signatures.bailSnapshot | 2 | Étend snapshot avec deep copy log |
| `_readLogForBail(bail, log)` | → log object | 2 | Snapshot.log si signé, log dynamique sinon |
| `_migrateArchiV1IfNeeded()` | mutation DB | 2 | Migration auto au boot, idempotente |
| `_backupBeforeMigration(label)` | side-effect localStorage | 2 | Pattern DRIVE-2C existant |

## Plan détaillé Phases 2-4

### Phase 2 — Migration data + getters (~3-4h, 1 commit)

**Output** : nouvelle version v14.X avec data migrée mais code legacy fonctionnel.

1. Schéma data : ajouter les 12 nouveaux champs/sous-objets sur log (~30 min)
2. Implémenter les 7 helpers (`getCurrentBailFor`, etc.) (~1h)
3. Migration auto au boot : `_migrateArchiV1IfNeeded()` (~1h)
   - Backup auto via DRIVE-2C pattern
   - Pour chaque bail signé : enrichir `bailSnapshot.log` (deep copy log actuel)
   - Pour chaque log : copier les champs bien depuis bail courant si absents
   - Pour chaque log : déduire `log.typeUsage` depuis `bail.typeContrat` (`'meuble'` → `'habitation-meuble'`, sinon `'habitation-nu'`)
   - Marqueur `DB._migratedArchiV1 = true`
4. Toast utilisateur explicite (~15 min)
5. **NE PAS retirer encore les anciens champs** (compat code legacy intact)
6. Tests : `DB.logements[0].dpe` non-null, `getCurrentTenant('F-001').nom` retourne le bon locataire (~30 min)

### Phase 3 — Refacto code reads/writes (~6-8h, splittable en 2 commits)

#### Phase 3a — UI formulaires (~3h, 1 commit)

1. Modale logement (`#ov-log` ~ligne 3420) : refonte avec tabs internes
   - Tab Identité : ref, type, **typeUsage** (NEW), imm, etage, surf, adresse
   - Tab Description : npp, piecesDesc, partiesCommunes, locauxPrivatifs, typeHabitat, regimeJuridique
   - Tab DPE : sous-objet `dpe.{classe, date, valConv, valEner, an, ges}` (caché si typeUsage = garage)
   - Tab Risques : sous-objet `etatRisques.{erp, plomb, amiante, elec, gaz, bruit}` (caché si typeUsage = garage)
   - Tab Équipements : chauffage[], annexes, **mobilier[]** (visible si typeUsage meublé/étudiant/mobilité)
2. Wizard bail étape "Le bien" (`#ov-bail` ~ligne 2996) : lecture seule + bouton "Modifier le bien" → openNewLog(ref)
3. Conditional rendering pour les tabs cachés (typeUsage = garage)
4. Tests : édition complète d'un bien sur tous les tabs, sauvegarde, vérif data

#### Phase 3b — Reads/writes PDF + listings (~4-5h, 1 commit)

1. Migrer les ~85 sites `bail.X` (champs bien) vers `_readLogForBail(bail, log).X` (~2h)
2. Migrer les ~79 sites `log.X` (champs bail) vers `getCurrentBailFor(ref).X` ou `getCurrentTenant(ref).X` (~2h)
3. Fonctions PDF : `previewBailData`, `previewBailDataV2`, `genBailHTML`, `exportBailWord`, `genPDFNative` toutes adaptées
4. Listings (`rBaux`, `rMv`, `rDash`, `rEDLList`, `rQuit`, fiches 360°) : remplacer reads
5. Wizard bail (étapes Personnes/Conditions/Finaliser) : lecture log via getters au lieu de bail.X pour pré-remplissage
6. **Tests intégrés obligatoires** :
   - 3 PDF bails (1 nu signé, 1 meublé non signé, 1 historique) — comparer rendu avant/après
   - Aperçu HTML bail courant
   - Voir bail signé (lit depuis `bailSnapshot.log`)
   - Modif log.dpe.classe → vérif PDF signé garde l'ancienne, PDF non signé reflète la nouvelle
   - Drive sync round-trip après migration
   - IRL DPE F/G : lit depuis `log.dpe.classe`
   - EDL création : adresse, surface, type lus via log
   - Quittance mensuelle : locataire et loyer lus via getters

### Phase 4 — Cleanup champs obsolètes (~1-2h, 1 commit)

1. Suppression définitive des 9 champs sur log + 24 champs sur bail
2. Suppression `_syncLogToBail()` (devient obsolète)
3. Vérif aucun read résiduel via grep des patterns `bail\.dpeClasse\|...` et `log\.locataire\|...`
4. Suppression marqueur `_migratedArchiV1` (migration terminée)
5. Tests intégrés finaux : génération bail tous types, EDL, quittance, IRL, dashboard, drive sync round-trip
6. Suppression aussi des fonctions intermédiaires si plus utilisées

## Cible architecturale

```
log (DB.logements[i]) — BIEN PHYSIQUE PERSISTANT
 ├── ref, imm, entity (référencement)
 ├── adr, etage, type, surf
 ├── npp, piecesDesc, partiesCommunes, locauxPrivatifs
 ├── typeHabitat, regimeJuridique
 ├── chauffage[], annexes
 ├── dpe { classe, date, valConv, valEner, an, ges }
 ├── etatRisques { erp, plomb, amiante, elec, gaz, bruit }
 ├── archived, archivedAt (LOG-ARCHIVE)
 ├── _modifiedAt, _stamp (Drive sync)
 └── notes

bail (DB.baux[ref]) — CONTRAT JURIDIQUE LIÉ AU BIEN
 ├── ref → log.ref (référence au bien)
 ├── entity → log.entity (snapshot bailleur au moment du bail)
 ├── locataires[] (parties)
 ├── garants[]
 ├── debut, fin, finEffective, finMotif
 ├── hc, ch, dg, jpay, fiscal, irl, modalitePaiement
 ├── typeContrat, premiereLoc
 ├── notes
 ├── signatures { mode, signedAt, bailleur, locataire, drive*, ... }
 ├── bailSnapshot (figé à la signature, contient COPIE des champs log nécessaires au PDF)
 ├── cloture, _archivedAt (cycle de vie)
 └── _modifiedAt, _stamp (Drive sync)
```

**Vues dérivées (computed, pas stockées)** :
- `getCurrentBailFor(ref)` : retourne le bail actif sur ce log (DB.baux[ref] non clôturé)
- `getCurrentTenant(ref)` : retourne `bail.locataires[0]` du bail actif
- `getCurrentRent(ref)` : retourne `bail.hc + bail.ch` du bail actif

## Plan de migration en 3 phases

### Phase 1 — CDC + audit code (~2h, prérequis)
- Lister exhaustivement les sites de lecture/écriture pour chaque champ dupliqué
- Décision UX : qui est la source de vérité pour chaque champ ?
- Décision UX : quoi faire des champs `log.locataire/tel/mail/...` actuels (suppression brutale ou getters dérivés ?)
- Décision UX : wizard bail étape "Le bien" devient lecture seule + lien vers fiche bien ? Ou on supprime l'étape ?
- Décision data : migration douce (champs en double pendant N versions) ou hard (cut-off avec backup) ?
- Liste exhaustive des sites à migrer, classés par criticité

### Phase 2 — Migration data + getters (~3-4h)
- Ajouter les nouveaux champs sur `log` (`log.npp`, `log.dpe`, `log.etatRisques`, etc.)
- Migration idempotente au boot : si `bail.X` existe et `log.X` n'existe pas → copier vers log
- Ajouter helpers `getCurrentBailFor(ref)`, `getCurrentTenant(ref)`, `getCurrentRent(ref)`
- Conserver les anciens champs sur log + bail pour compat pendant transition

### Phase 3 — Refacto code lecture/écriture (~6-8h)
- Wizard bail étape "Le bien" : lecture seule sourcée depuis log, bouton "Modifier le bien" → openNewLog
- Formulaire logement : ajouter les nouveaux champs (DPE, état des risques, équipements) en édition
- Sites de lecture (~191 selon audit initial) : migrer du bail vers log pour les champs bien
- Sites de lecture du log pour les champs bail (locataire/dates/loyer) : remplacer par `getCurrentTenant(ref)` etc.
- Génération PDF bail : utiliser `bailSnapshot` pour les baux signés (immutabilité), log pour les baux non signés (vue dynamique)
- Suppression progressive des anciens champs après vérif aucune lecture restante

### Phase 4 — Cleanup + tests (~1-2h)
- Suppression des champs dupliqués anciens
- Suppression de `_syncLogToBail()` (plus nécessaire)
- Tests intégraux : création bail wizard / modification log / génération PDF natif et HTML / EDL / quittances / IRL

## Edge cases

| Cas | Comportement attendu |
|---|---|
| Bail signé puis utilisateur modifie le DPE du bien | Le bail signé garde l'ancien DPE via `bailSnapshot` (immutabilité légale) ; les nouveaux baux héritent du nouveau DPE |
| Logement sans bail courant | Les champs « bail courant » du log sont vides ; les listings affichent `'Vacant'` |
| 2 baux successifs sur le même bien (1 historique + 1 courant) | log.locataire/dates reflètent le bail courant uniquement ; l'historique est dans bail_historique |
| Migration data échoue partiellement | Backup automatique avant migration, bouton "Rollback" |
| Multi-locataires | `bail.locataires[]` avec `[0]` = principal pour les listings |
| Bail prolongé / renouvelé | Nouveau bail créé, ancien archivé ; log.dates pointe sur le nouveau via getter |

## Risques et mitigations

| Risque | Mitigation |
|---|---|
| Régression PDF bail (template lit ~30 sites) | Tests manuels exhaustifs sur baux DEMO + DEMO-F2 + Ferrette + tous les baux historiques |
| Désync historique des baux clôturés | bailSnapshot doit être figé pour tous les baux signés avant migration |
| Drive sync cassé | Push complet log + bail avant migration, vérif round-trip après |
| Utilisateur perd des données du bail courant | Migration idempotente : si log.X existe, ne pas l'écraser ; ajouter seulement si manquant |
| Wizard bail UX confuse pendant transition | Étape "Le bien" en lecture seule + label "Saisi depuis la fiche du bien" + bouton modifier |

## Volume estimé

| Phase | Coût | Risque |
|---|---|---|
| Phase 1 — CDC + audit code | ~2h | Bas |
| Phase 2 — Migration data + getters | ~3-4h | Moyen |
| Phase 3 — Refacto code lecture/écriture | ~6-8h | **Élevé** (génération PDF) |
| Phase 4 — Cleanup + tests | ~1-2h | Moyen |
| **TOTAL** | **~12-15h** | **Élevé** |

= 2-3 sessions dédiées

## Tests post-implémentation (checklist)

- [ ] Création bail wizard depuis F-001 : étape "Le bien" lecture seule, données pré-remplies depuis log
- [ ] Modification surf du logement F-001 : se reflète dans le bail courant (mais pas dans le bail signé via bailSnapshot)
- [ ] Génération PDF bail natif : tous les champs bien lus depuis log, pas régression
- [ ] Génération PDF bail Word : idem
- [ ] Bail signé bilatéralement : modifier log.dpeClasse → le bail signé garde l'ancienne via snapshot
- [ ] Ouvrir un bail historique archivé : doit afficher les valeurs au moment de l'archivage
- [ ] Wizard signature mobile : étapes inchangées
- [ ] Drive sync round-trip : push après migration, pull autre device, vérif data identique
- [ ] EDL création : adresse, surface, type, étage lus depuis log
- [ ] Quittance mensuelle : locataire et loyer lus depuis bail courant
- [ ] IRL : DPE F/G lu depuis log (pas bail) — ferme le bug latent

## Coordination

- **Pré-requis** : aucune autre refonte structurelle en cours (BAIL-NAMESPACE-MIGRATION peut attendre)
- **Bloque** : LOG-FICHE-360 Phase 2 (parité onglets) gagnerait à passer après — sinon double refacto
- **Conflit code** : génération PDF bail (zone large), wizard bail, formulaire logement
- **Pendant la session** : pas d'autre commit qui touche `DB.logements` ou `DB.baux` en parallèle

## Journal

- 2026-04-23 : créé (initial, dans BACKLOG.md uniquement)
- 2026-05-02 (matin) : enrichi avec audit bidirectionnel détaillé (champs bien sur bail + champs bail sur log) + plan de migration 4 phases + tests post-implémentation. Doc séparé créé.
- 2026-05-02 (soir) : **Phase 1 (CDC) livrée** — décisions Q1-Q8 arbitrées en dialogue avec utilisateur. Audit code complété (165 sites + 5 fonctions PDF). Champs à créer/retirer documentés. Plan détaillé Phases 2-4 prêt à coder. **Q4bis ajouté** : `log.typeUsage` (7 valeurs) + lien fort BAIL-TYPES (mobilier annexe). **Q2bis ajouté** : tab Mobilier dans formulaire logement (visible si meublé/étudiant/mobilité).
- 2026-05-02 (soir) : **Phase 3a livrée v14.15** commit `5d7097f` (~3h, +444/-42 lignes)
  - Modale logement (#ov-log) refondue avec 5 tabs internes : Identité / Description / DPE / Risques / Équipements
  - 40+ champs accessibles dont les 12 nouveaux champs Phase 2 (typeUsage, npp, piecesDesc, partiesCommunes, locauxPrivatifs, typeHabitat, regimeJuridique, periodeConstr, lot, numFiscal, sous-objets dpe/etatRisques/chauffage/ecs, mobilier)
  - **Mobilier dynamique** (Q2bis) : tab Équipements section "Inventaire mobilier" visible uniquement si `typeUsage in [habitation-meuble, etudiant, mobilite]` — builder add/remove de lignes (pièce + nom + qty + état)
  - Encart legacy dans tab Identité : champs bail courant (loyer/locataire/dates) conservés avec avertissement "modifs recommandées depuis l'onglet Bail" (suppression Phase 4)
  - Encart info dans wizard bail étape "Le bien" : bouton "Modifier le bien dans sa fiche" → ouvre openNewLog(ref) (refonte lecture seule complète prévue Phase 3b)
  - Helpers : setLogModalTab, _logModalSyncMobilierVisibility, _logMobilier* (Add/Remove/Update/Render)
  - Refonte openNewLog : pré-fill complet des 40+ champs avec defaults safe sur sous-objets
  - Refonte saveParamLog : sauvegarde 5 tabs avec sous-objets, mobilier filtré (rows vides retirées)
  - CSS .logmod-* ajouté : tabs responsive overflow-x mobile, panes avec animation fadeIn, sections séparées par border-top, info-banner accent bleu, mobilier-row en grid
- 2026-05-02 (soir) : **Phase 2 livrée v14.14** commit `511faf3` (~3h, +216 lignes)
  - 5 helpers publics : `getCurrentBailFor`, `getCurrentTenant`, `getCurrentRent`, `_captureBailSnapshot`, `_readLogForBail`
  - 1 helper backup : `_backupBeforeMigration` (pattern DRIVE-2C)
  - Migration auto `_migrateArchiV1IfNeeded()` hookée dans `initDB()` avant `saveDB()` final
  - 12 nouveaux champs créés sur log (typeUsage, npp, piecesDesc, partiesCommunes, locauxPrivatifs, typeHabitat, regimeJuridique, periodeConstr, annexes, lot, numFiscal, chauffage{}, ecs{}, mobilier[], dpe{}, etatRisques{})
  - Migration idempotente : enrichissement à chaque boot (robustesse imports JSON cross-device + nouveaux logements créés entre phases), backup + toast UNE SEULE FOIS au premier run via marqueur `DB._migratedArchiV1`
  - Champ ECS (eau chaude sanitaire) ajouté en plus du CDC initial — présent dans le seed bail (chauffElec/Gaz/Coll/Autre + ecsElec/Gaz/Coll/label), copié pour cohérence
  - Tests passés : `DB._migratedArchiV1` true, sous-objets dpe/etatRisques/chauffage/ecs/mobilier remplis sur DEMO-F2, `getCurrentTenant('DEMO-F2')` retourne MARTIN Jean, `getCurrentRent('DEMO-F2')` retourne `{hc:620, ch:55, total:675}`, localStorage backup créé, toast affiché au 1er boot, silencieux aux suivants
  - **Code legacy intact** : aucun ancien champ supprimé, fonctions PDF non touchées (Phase 3)
