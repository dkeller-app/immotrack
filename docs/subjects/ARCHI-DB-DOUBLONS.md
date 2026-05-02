# ARCHI-DB-DOUBLONS — Refonte architecture DB : séparer log (bien physique) et bail (contrat juridique)

**Status** : ⏳ En attente — **CDC requis avant tout code** · **Prio** : P1 · **Taille** : XL (~12-15h)
**Détecté** : 2026-04-23 (initial) · enrichi 2026-05-02 (audit bidirectionnel)
**Lié à** : LOG-FICHE-360 Phase 2 · BAIL-NAMESPACE-MIGRATION · V3-VISUEL · LOG-PHOTOS

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
- 2026-05-02 : enrichi avec audit bidirectionnel détaillé (champs bien sur bail + champs bail sur log) + plan de migration 3 phases + tests post-implémentation. Doc séparé créé.
