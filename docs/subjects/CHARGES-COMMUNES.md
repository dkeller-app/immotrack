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

## Journal

- 2026-05-07 : créé · Phase 1 livrée v14.59 · sous-onglet Charges communes sur fiche immeuble · CRUD compteur collectif (CC_TYPES, CC_REPARTITION_LABELS) · helper `_calcCcQuotePart` 4 clés (tantiemes, surface, sous-compteurs, forfait) · CRUD relevés + factures (V1 prompts) · tableau quote-part auto-calculé par logement · banner pédagogique avec stats bases dispo · KPI « Reste à imputer » alerte rouge · champ `log.tantiemes` ajouté modale logement (tab Description) · CSS `.cc-grid` / `.cc-table` / `.cc-row-exclu` · responsive 768
- 2026-05-07 : Phase 2-3 à planifier (~5h restant) : quote-part fiche logement + régul enrichie avec auto-calcul + PDF récap loi 1989
