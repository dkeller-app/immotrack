# CHARGES-COMMUNES — Compteurs collectifs immeuble + répartition charges récupérables

**Status** : ✅ **Phase 1 livrée v14.59** · **Prio** : P1 · **Taille** : M (~3h Phase 1, 8h total estimé)
**Détecté** : 2026-05-07
**Lié à** : FICHES-PARITE-360 Session 8 · LOG-FICHE-COMPTEURS (v14.56) · BUG-CHARGE-001 (régul à refondre)

## Demande utilisateur

> 💬 « Pour les compteurs, je me dis qu'il faut qu'on fasse quelque chose de bien pour le suivi des charges et que ça facilite le travail de division des factures (eau, électricité) qui sont à diviser en fonction de la consommation de chacun. »
> 💬 (validation design) « 1 : on met les 2 options. 2 il faut pouvoir mixer. L'eau sera sûrement au réel (sous compteur) et l'électricité à la division par exemple »

## Contexte légal

**Loi 89-462 art. 23** : les charges récupérables auprès du locataire sont définies par décret 87-713. Elles doivent être justifiées chaque année dans la régularisation, par tout document utile (factures, contrats d'entretien, etc.).

**Méthodes de répartition autorisées** :
- Si compteur individuel divisionnaire → conso réelle (toujours préféré)
- Sinon : tantièmes de copropriété, surface (m²), forfait conventionnel

## Vision globale (3 phases prévues, 8h total)

| Phase | Sujet | Coût | Statut |
|---|---|---|---|
| **Phase 1** | Compteurs collectifs immeuble + saisie + tableau quote-part auto | ~3h | ✅ **v14.59** |
| Phase 2 | Section « Quote-part charges immeuble » sur fiche logement | ~2h | ⬜ À venir |
| Phase 3 | Régularisation enrichie (auto-calcul + PDF récap loi 1989 art. 23) | ~3h | ⬜ À venir |

## Phase 1 livrée (v14.59)

### A. Sous-onglet « ⚡ Charges communes » sur fiche immeuble

3ᵉ sous-onglet de la fiche immeuble (après Logements, Plan d'occupation).

**Banner pédagogique** au top : récapitule les bases de répartition disponibles pour cet immeuble (total tantièmes saisis, total surfaces, nombre de sous-compteurs, forfait toujours dispo).

**Empty state** si aucun compteur : message + CTA « + Premier compteur collectif ».

### B. CRUD compteur collectif

**Stockage** : `ent.immeubles[i].compteursCollectifs[]` (sub-collection imm).

```js
{
  id: 'cc_TIMESTAMP_RAND',
  nom: 'Eau froide générale',
  type: 'eau-f' | 'eau-c' | 'elec' | 'gaz' | 'autre',
  numCompteur: 'CPT-12345',
  fournisseur: 'SAUR',
  cleRepartition: 'tantiemes' | 'surface' | 'sous-compteurs' | 'forfait',
  forfaitParts: { 'F-101': 30, 'F-102': 40, ... },  // si forfait
  releves: [{ id, date, value, notes }],
  factures: [{ id, dateFacture, datePeriode, montant, conso, notes }],
  _modifiedAt: ISO
}
```

**5 types de compteurs** disponibles (réutilise palette LOG-FICHE-COMPTEURS) :
- 💧 Eau froide générale (m³)
- 🚿 Eau chaude générale (m³)
- ⚡ Électricité parties communes (kWh)
- 🔥 Gaz collectif (m³)
- 📊 Autre

**Helpers CRUD** :
- `openNewCcForImm(entId, immId)` : nom + type + clé + n° + fournisseur (V1 prompts)
- `editCcForImm(entId, immId, ccIdx)` : édition
- `delCcForImm(entId, immId, ccIdx)` : suppression avec confirmation
- `addCcReleve(entId, immId, ccIdx)` : nouveau relevé (date + valeur + notes)
- `addCcFacture(entId, immId, ccIdx)` : nouvelle facture (date + période + montant + conso + notes)
- `viewCcReleves` / `viewCcFactures` : alert listing (V1)

### C. Calcul de quote-part par logement (`_calcCcQuotePart`)

Helper central qui calcule la quote-part d'un logement sur un compteur collectif selon la clé. Retourne :
```js
{ ratio: 0.187, methode: 'tantiemes', denomLabel: '187 / 1000 tantièmes', exclu: false }
```

**4 méthodes implémentées** :

#### Tantièmes (`'tantiemes'`)
```
ratio = log.tantiemes / sum(allLogs.tantiemes)
```
Exclu si `log.tantiemes` non renseigné.

#### Surface (`'surface'`)
```
ratio = log.surf / sum(allLogs.surf)
```
Exclu si surface non renseignée.

#### Sous-compteurs (`'sous-compteurs'`)
```
conso(log) = dernier_releve - premier_releve  // sur le type matching
ratio = conso(log) / sum(conso(allLogs))
```
Mapping type compteur collectif → type compteur logement :
- `eau-f` → `eau-f`
- `eau-c` → `eau-c`
- `elec` → `elec-hp` (HP par défaut)
- `gaz` → `gaz`

Réutilise `_collectCompteurReleves(ref)` (v14.56).

#### Forfait (`'forfait'`)
```
ratio = forfaitParts[log.ref] / sum(forfaitParts)
```
Parts en valeurs libres (% ou points) — la fonction normalise.

### D. Card par compteur

Pour chaque compteur collectif :

**Header** : icône colorée + nom + clé répartition + boutons modif/suppr.

**3 KPIs** :
- 💶 Facturé année courante (somme des `factures.montant`)
- 📊 Conso année courante (`dernier - 1er` relevé de l'année, avec rebornage si relevé hors année)
- 📐 Reste à imputer (= facturé - somme quotes-parts) : si > 0.5 €, KPI rouge → indique des logements exclus du calcul

**Boutons** : `+ Relevé`, `+ Facture`, `Voir relevés`, `Voir factures`

**Tableau quote-part par logement** :
| Logement | Quote-part (%) | Base de calcul | Montant année |
|---|---|---|---|
| F-101 (Pierre Dupont) | 18.7% | 187 / 1000 tantièmes | 92,40 € |
| F-102 (Marie Durand) | 26.0% | 65 / 250 m² | 128,80 € |
| F-103 (Vacant) | — | Tantièmes non renseignés | — *(exclu)* |

Lignes exclues affichées en italique grisé.

### E. Champ `tantiemes` ajouté à la modale logement

Dans le tab Description, après Période de construction et N° fiscal :
```
[Tantièmes (millièmes) copro]   [Nº lot copro (optionnel)]
```

+ banner pédagogique : « Les tantièmes servent à calculer la quote-part… Modifiable par compteur dans la fiche immeuble. »

Sauvé dans `log.tantiemes` (entier) et `log.numLot` (string).

### F. CSS

- `.cc-grid` : flex column gap 14
- `.cc-card` : réutilise `.logf-cpt-card`
- `.cc-table-wrap` : container avec overflow-x pour responsive
- `.cc-table` : table compacte avec hover row + classe `.num` pour aligner droite
- `.cc-row-exclu` : opacity 0.5 + italic pour les logements exclus
- Responsive 768 : font-size réduit + padding réduit

## Critères d'acceptance Phase 1

- [x] Sous-onglet « ⚡ Charges communes » activé sur fiche immeuble
- [x] CRUD compteur collectif (création/édition/suppression)
- [x] 5 types : eau-f, eau-c, elec, gaz, autre
- [x] 4 clés de répartition fonctionnelles : tantiemes, surface, sous-compteurs, forfait
- [x] Mix possible : 1 compteur par clé (eau au réel, élec aux tantièmes, etc.)
- [x] Saisie relevés (date + valeur + notes)
- [x] Saisie factures (date + période + montant + conso + notes)
- [x] Tableau auto-calculé quote-part par logement (ratio + base + montant € année courante)
- [x] Lignes exclues affichées en grisé italique avec raison (« Tantièmes non renseignés », « Pas de conso relevée », etc.)
- [x] Banner pédagogique avec stats bases dispo (total tantièmes, surfaces, nb logements)
- [x] Champ `log.tantiemes` saisi dans modale logement (tab Description)
- [x] KPI « Reste à imputer » alerte rouge si > 0.5 € (logements exclus)
- [x] Responsive 768px (table compacte)

## Limites Phase 1 / TODO Phase 2-3

- **CRUD via prompts** : V1 minimale. Si volume justifie, refaire en vraie modale `#ov-cc` avec formulaire structuré, validation, photos relevés, PDF facture, etc.
- **Pas de quote-part sur la fiche logement** : Phase 2 ajoutera une section « Quote-part charges immeuble » sur le sous-onglet Compteurs du logement, listant les compteurs immeuble parents + montant cumulé année.
- **Pas de régularisation auto** : Phase 3 enrichira l'onglet Régul existant avec auto-calcul depuis les compteurs collectifs + comparaison provisions versées + PDF récap loi 1989 art. 23.
- **Pas de mouvement auto** : à la régul, créer auto un mouvement crédit/débit pour chaque logement.
- **Forfait : éditeur de parts manquant** : il faut éditer manuellement `cc.forfaitParts` via console pour l'instant. À refaire en UI Phase 2.
- **Sous-compteurs : conso = total période** : la V1 utilise `dernier - premier` relevé ; pour les calculs annuels, il faudrait borner sur l'année. À enrichir Phase 3.

## Workflow utilisateur (état actuel v14.59)

1. Sur fiche logement → modale Modifier → tab Description → renseigner **Tantièmes** (ex : 187)
2. Sur fiche immeuble → sous-onglet **⚡ Charges communes** → **+ Premier compteur collectif**
3. Saisir « Eau froide générale » + type `eau-f` + clé `tantiemes`
4. Cliquer **+ Facture** → saisir une facture trimestrielle (250 €, période 2026-Q1)
5. Voir le tableau auto-calculé : F-101 (187 tantièmes) → 46,75 € sur la facture de 250 €
6. Idem pour autres compteurs avec clé différente : élec parties communes en `surface`, eau de l'immeuble en `sous-compteurs` (si compteurs divisionnaires saisis)

## Phase 1.5 livrée (v14.60) — Single source of truth = DB.mouvements

### Question utilisateur

> 💬 « donc si je comprends bien, dans loyers et mouvements j'indique charges pour l'immeuble et le décompte se fera pas les clés de répartition que je mets ? comment on fait le lien entre la ligne de charges dans loyers et mouvements et les clés de répartition ? »

### Décision : Option A (validée par utilisateur)

> 💬 « ok A »

**Architecture finale** : `DB.mouvements` = unique source de vérité. Le compteur collectif **lit** les mouvements liés via `mv.compteurCcId === cc.id`. Plus de double saisie, plus de duplication, cohérence garantie.

### Changements v14.60

#### 1. Champ `compteurCcId` ajouté à la modale mouvement (`#ov-mv`)
- Select `#mv-cc` masqué par défaut, **affiché dynamiquement** quand `#mv-imm` contient un immeuble qui a au moins un compteur collectif
- Helper `_mvSyncCcSelect(keepValue)` : peuple le select avec les compteurs de l'immeuble courant, restaure la valeur passée en édition
- Hooks `oninput="_mvSyncCcSelect()"` et `onchange="_mvSyncCcSelect()"` sur `#mv-imm` pour sync live
- Saisi dans `saveMv` : `compteurCcId: v('mv-cc') || ''`
- Restauré dans `openEditMv(id)` : `_mvSyncCcSelect(m.compteurCcId || '')`
- Reset dans `openNewMv()` : `_mvSyncCcSelect()` (immeuble vide → masque)

#### 2. Refonte `_ccTotalFactureYear(cc, year)` (single source)
```js
return (DB.mouvements||[]).filter(_isAlive)
  .filter(m => m.compteurCcId === cc.id)
  .filter(m => (m.date||'').startsWith(String(yr)))
  .reduce((s,m) => s + (+m.db||0), 0);
```

#### 3. Helper `_ccMouvementsForCc(cc, year)`
Liste les mouvements liés (drill-down) — utilisée par `viewCcMouvements` et le KPI nb.

#### 4. Nouveaux helpers `openNewMvForCc(ccId, immNom)` et `viewCcMouvements(ccId)`
- `openNewMvForCc` : ouvre la modale Nouveau mouvement avec immeuble + compteur pré-remplis. L'utilisateur n'a plus qu'à saisir date/libellé/montant/cat.
- `viewCcMouvements` : alert listing des mouvements liés, avec date / libellé / montant / cat / facture. Pour modifier → onglet Loyers & Mouvements.

#### 5. UI cards refondue
**Avant Phase 1** :
```
[+ Relevé]  [+ Facture]  [3 relevés]  [5 factures]
```
**Après Phase 1.5** :
```
[+ Relevé]  [+ Facture (mouvement)]  [3 relevés]  [↗ 5 mouvements liés]
```
- « + Facture » → désormais `openNewMvForCc()` (crée un mouvement bancaire pré-lié, single source)
- Compteur de factures → compteur de **mouvements liés** (`nbMvLies` calculé via `_ccMouvementsForCc`)

#### 6. Migration douce `_migrateCcFacturesToMouvements()`
Appelée au boot (loadDB section migrations) :
- Parcourt tous les `cc.factures[]` existants
- Crée un mouvement dans `DB.mouvements` avec :
  ```js
  { date: f.dateFacture, lib: `Facture ${cc.nom} · ${f.datePeriode}`,
    imm: im.nom, cat: catFromType(cc.type), db: f.montant,
    compteurCcId: cc.id, _migratedFromCcFacture: true }
  ```
- Vide `cc.factures = []` après migration
- Anti-double-migration : skip si un mouvement avec même `compteurCcId + date + montant` existe déjà
- Mapping type → catégorie : eau-f/eau-c → 'Eau' (ou 'Charges' fallback), elec → 'Électricité', gaz → 'Gaz', autre → 'Charges'

### Schéma final v14.60

```
┌──────────────────────────────────────────────────────────┐
│ DB.mouvements[] (SINGLE SOURCE OF TRUTH)                 │
│   { date, lib, imm, cat, qui, db, cr, fac,              │
│     compteurCcId: 'cc_xxx' }  ← lien vers compteur      │
└──────────────────────────────────────────────────────────┘
              ▲                            │
              │                            │ (lecture)
              │ (saisie/édition)           ▼
   ┌──────────┴──────────┐         ┌──────────────────────────┐
   │  Onglet Mouvements  │         │ Fiche imm → ⚡ Charges    │
   │  (modale #ov-mv     │         │  - Compteur card         │
   │   avec select cc)   │         │  - KPI auto-calculés     │
   └─────────────────────┘         │  - Tableau quote-part    │
              ▲                    └──────────────────────────┘
              │
              │ (création pré-remplie)
              │
   ┌──────────┴──────────────────┐
   │  Bouton "+ Facture" sur     │
   │  card compteur collectif    │
   │  (openNewMvForCc)           │
   └─────────────────────────────┘
```

### Workflow utilisateur final

**Saisie initiale** :
1. Tu crées le compteur collectif sur la fiche immeuble (1 fois)
2. Tu déclares la clé de répartition (tantiemes / surface / sous-compteurs / forfait)

**Saisie courante** :
- **Option A** : depuis la fiche immeuble → bouton « + Facture (mouvement) » → modale mouvement pré-remplie avec immeuble + compteur lié
- **Option B** : depuis l'onglet Loyers & Mouvements → modale mouvement → renseigner immeuble → le select « Compteur collectif lié » apparaît automatiquement → choisir le compteur

**Lecture / régularisation** :
- Le tableau quote-part se met à jour seul à chaque mouvement ajouté/modifié/supprimé
- L'année courante (et les autres) est lisible via les KPIs

**Modification** :
- Édition mouvement → l'onglet Mouvements (single source) → le compteur reflète instantanément

**Suppression** :
- Suppression mouvement → disparait du compteur + du tableau quote-part automatiquement

### Critères d'acceptance Phase 1.5

- [x] Champ `compteurCcId` ajouté à la modale mouvement
- [x] Select compteur dynamique selon immeuble (masqué si pas d'immeuble ou pas de compteur sur cet immeuble)
- [x] Persistance dans `saveMv`
- [x] Restauration dans `openEditMv`
- [x] Reset dans `openNewMv`
- [x] `_ccTotalFactureYear` lit `DB.mouvements` au lieu de `cc.factures`
- [x] `_ccMouvementsForCc(cc, year)` helper drill-down
- [x] `openNewMvForCc(ccId, immNom)` ouvre modale pré-remplie depuis card compteur
- [x] `viewCcMouvements(ccId)` alert listing
- [x] UI cards : « + Facture (mouvement) » + « ↗ N mouvements liés » remplacent ancienne UI
- [x] Migration douce `_migrateCcFacturesToMouvements()` au boot
- [x] Idempotente (skip si déjà migré, anti-doublon par cc+date+montant)
- [x] Mapping type → catégorie cohérent avec catégories existantes

## Journal

- 2026-05-07 : créé · Phase 1 livrée v14.59 · sous-onglet Charges communes sur fiche immeuble · CRUD compteur collectif (CC_TYPES, CC_REPARTITION_LABELS) · helper `_calcCcQuotePart` 4 clés (tantiemes, surface, sous-compteurs, forfait) · CRUD relevés + factures (V1 prompts) · tableau quote-part auto-calculé par logement · banner pédagogique avec stats bases dispo · KPI « Reste à imputer » alerte rouge · champ `log.tantiemes` ajouté modale logement (tab Description) · CSS `.cc-grid` / `.cc-table` / `.cc-row-exclu` · responsive 768
- 2026-05-07 : Phase 1.5 livrée v14.60 · question utilisateur sur le lien Mouvements ↔ Compteurs collectifs · choix Option A (single source DB.mouvements) · refonte vue compteur lecture-only depuis DB.mouvements · champ `mv.compteurCcId` saisi dans modale mouvement · helpers `_mvSyncCcSelect`, `openNewMvForCc`, `viewCcMouvements`, `_migrateCcFacturesToMouvements` · migration douce idempotente au boot · UI cards refondue (« + Facture (mouvement) » + « ↗ N mouvements liés »)
- 2026-05-07 : Phase 2-3 à planifier (~5h restant) : quote-part fiche logement + régul enrichie avec auto-calcul + PDF récap loi 1989

---

## Phase 2 livrée (v14.61) — Modélisation complète + part bailleur

### Décisions utilisateur (audit complet)

> 💬 « Pour les compteurs, je me dis qu'il faut qu'on fasse quelque chose de bien… »
> 💬 « divisé par le nombre de lots au prorata des jours d'occupation »
> 💬 « il faudrait une coche pour dire si le logement est compté dans la répartition »
> 💬 « j'ai un compteur qui a 2 sous-compteurs pour 2 logements dans mon immeuble sur 5 »
> 💬 « chauffage collectif : une partie au tantième et l'autre partie à la consommation réelle »
> 💬 « la part bailleur lors des vacances on n'en a pas encore parlé »

### 5 cas couverts

| Cas | Champ | Comportement |
|---|---|---|
| 1. Tous logements, 1 clé simple | `cleRepartition` ∈ {tantiemes, surface, proportionnel, forfait} | Ratio × prorata jours |
| 2. Sous-ensemble logements (compteur ne dessert pas tous) | `scope: [logRefs]` | Restriction stricte au scope |
| 3. Sous-compteurs partiels (mix réel + fallback) | `cleRepartition: 'sous-compteurs'` + `fallbackRepartition: 'tantiemes'\|...` | Réel pour ceux avec compteur, fallback sur le reste pour ceux sans |
| 4. Composite (chauffage 30/70) | `cleRepartition: 'composite'` + `composition: [{ratio: 0.3, cle: 'tantiemes'}, {ratio: 0.7, cle: 'sous-compteurs'}]` | Chaque ligne calculée séparément, sommée |
| Défaut sans règle | (pas de `compteurCcId` sur mvt) | 1/N × prorata jours sur logements `compteCharges=true` |

### Part bailleur (vacances)

Pendant les périodes de vacance, la quote-part théorique du logement reste à la **charge du bailleur** (perte de vacance). Calculé séparément avec dimension `isBailleur: true`.

Exemple : F-101 (200/1000 millièmes), facture 1000 € sur l'année, vacant 6 mois :
- Locataire : 1000 × 0.2 × (181/365) = **99,18 €**
- Bailleur : 1000 × 0.2 × (184/365) = **100,82 €** 🟠

### Champ `log.compteCharges`

Coche dans la modale logement (tab Description) :
- **Default `true`** : tous les logements existants comptent dans la répartition
- **Décocher** pour les garages, caves, parkings isolés qui ne supportent pas les charges immeuble
- Migration automatique au boot : tous les logements sans valeur → `true`

### Helper `_calcCcRepartition(im, cc, allLogs, montant, periodFrom, periodTo)`

API unifiée qui retourne :
```js
{
  parts: [
    { ref, log, montant, methode, isBailleur, occJours, locataire, debut, fin, denomLabel, exclu, raison }
    // 1 entrée par logement × segment temporel (locataire ou vacance)
  ],
  totaux: {
    montantFacture, totalLocataires, totalBailleur, totalNonImpute
  }
}
```

Implémentation :
- `_ccLogsInScope(cc, allLogs)` : filtre selon scope + compteCharges
- `_ccConsoLogPeriod(log, type, from, to)` : conso bornée sur la période (relevés EDL + manuels)
- `_ccLogOccupations(log, from, to)` : segments locataires + vacances avec `isBailleur` flag
- `_ccApplyCleSimple(cle, montant, logs, cc, im)` : 5 clés simples (tantiemes/surface/proportionnel/forfait + fallback)
- `_ccApplySousCompteurs(montant, logs, cc, im, from, to)` : hybride réel + fallback pour sous-compteurs partiels
- Boucle composition : applique chaque ligne séparément, somme par logement

### Pop-up info au save mouvement

`_mvShowChargeRepartitionInfo(m)` détecte 3 cas et affiche un toast :
- **Avec compteurCcId** : récap clé + alertes pré-requis manquants (tantièmes, surfaces, parts forfait, relevés sous-compteurs)
- **Sans règle ni qui** : « Charge répartie 1/N × prorata jours sur X logement(s) (Y exclus) »
- **Avec qui** : pas de message (charge directe)

### Hero immeuble enrichi

Le KPI « Logements » affiche désormais `8/6 ⚖` (8 logements actifs, 6 dans répartition charges). Tooltip détaillé.

### Préparation Reporting bailleur (v14.64) et 2044 (v14.65)

Migration automatique : `DB.catConfig[cat].recuperable` et `.deductible2044` ajoutés (default null) sur toutes les catégories existantes. Permet de paramétrer plus tard sans casser l'existant.

### Mode test isolé (livraison parallèle)

Helper `_isTestMode` détecte si `index-test.html` ou `?sandbox=1`. Si actif :
- Préfixe `_test_` sur tout localStorage → DB isolée prod
- Drive auto-connect désactivé
- Bandeau orange permanent en haut + boutons « 🎲 Charger dataset démo » / « 🗑 Reset DB test »
- Dataset démo = 1 SCI · 1 immeuble · 4 logements (dont 1 garage exclu, 1 vacant) · 2 baux · 12 mvts loyers + 2 charges

`regen-test.bat` permet de re-générer la copie après chaque release prod.

### Critères d'acceptance Phase 2 v14.61

- [x] Champ `log.compteCharges` (default true, migration auto)
- [x] Coche dans modale logement (tab Description) avec banner pédagogique
- [x] Clé `proportionnel` (1/N) ajoutée à `CC_REPARTITION_LABELS`
- [x] Champ `cc.scope` saisi via prompt (refs séparées par virgule)
- [x] Champ `cc.fallbackRepartition` saisi via prompt si clé = 'sous-compteurs'
- [x] Champ `cc.composition` initialisé à `[]` (édition manuelle V1, UI Phase 3)
- [x] Helper `_calcCcRepartition` avec 5 cas + part bailleur + scope + composition + fallback
- [x] Helpers internes `_ccLogsInScope`, `_ccConsoLogPeriod`, `_ccLogOccupations`, `_ccApplyCleSimple`, `_ccApplySousCompteurs`
- [x] Pop-up info au save mouvement (`_mvShowChargeRepartitionInfo`)
- [x] Hero immeuble : N logements / N compte-charges
- [x] `DB.catConfig` enrichi avec `recuperable` + `deductible2044` (default null)
- [x] Mode test : `_isTestMode`, `_lsKey`, bandeau, dataset démo, Drive désactivé
- [x] `index-test.html` créé + `regen-test.bat` pour synchro

### Limites Phase 2 (Phase 3 à venir)

- **CRUD via prompts** : V1 fonctionnelle. Phase 3 → vraie modale `#ov-cc` avec UI structurée.
- **Édition `cc.composition`** : à éditer via console JS pour V1. Phase 3 → UI dédiée.
- **Tableau quote-part de la card compteur** : utilise encore `_calcCcQuotePart` (vue annuelle simple). Phase 3 → utiliser `_calcCcRepartition` pour décomposition locataire/bailleur.
- **Régul** : utilise encore l'ancien `computeRegul`. Phase 3 → refonte avec `_calcCcRepartition`.

## Journal

- 2026-05-07 (suite) : Phase 2 livrée v14.61 · 5 cas couverts (clé simple + scope + sous-compteurs partiels + composite + défaut 1/N×prorata) · part bailleur (vacances) modélisée avec `isBailleur` · helper unifié `_calcCcRepartition(im, cc, allLogs, montant, periodFrom, periodTo)` · champ `log.compteCharges` (coche + migration default true) · clé `proportionnel` · champs `cc.scope`/`cc.fallbackRepartition`/`cc.composition` · pop-up info au save mouvement · hero immeuble enrichi · préparation `DB.catConfig.recuperable`/`deductible2044` · MODE TEST isolé livré en parallèle (`_isTestMode`, `_lsKey`, bandeau orange, dataset démo, Drive désactivé, `index-test.html` + `regen-test.bat`)
