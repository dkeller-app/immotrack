# BAIL-CHARGES-DETAIL — Clarifier les charges récupérables détaillées dans le bail

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (3-5h)
**Détecté** : 2026-05-13
**Lié à** : BAIL-CLAUSES-PERSO · CHARGE-REGLES · BUG-CHARGE-001 (livré v14.82) · V3-REFONTE-BAIL

## Contexte
Demande utilisateur 2026-05-13 :
> 💬 « il serait bien de pouvoir clarifier ce qu'il y a dans les charges dans le bail (eau froide, eau chaude, entretien des communs ... à développer) »

Aujourd'hui le bail mentionne probablement seulement un montant global de charges (champ `bail.ch`). C'est **insuffisant légalement** : le décret 87-713 du 26 août 1987 (modifié) **liste précisément** les charges récupérables auprès du locataire et impose au bailleur de les détailler.

→ Le bail doit lister **explicitement** ce qui est inclus dans les charges, sinon en cas de litige, le locataire peut réclamer le remboursement des charges non listées.

## Cadre légal — Décret 87-713 du 26 août 1987

Liste exhaustive des charges récupérables (4 grandes catégories) :

### A. Eau et énergie
- Eau froide (consommation + abonnement compteur si individuel)
- Eau chaude collective (production + distribution)
- Combustibles chauffage collectif (gaz, fioul, électricité, granulés)
- Entretien chaudière collective
- Ramonage conduits collectifs

### B. Ascenseur et monte-charge
- Électricité de fonctionnement
- Exploitation (entretien courant, contrats maintenance, réparations courantes)
- ⚠️ Hors : grosses réparations, mise aux normes

### C. Parties communes intérieures et extérieures
- Électricité parties communes (éclairage, prises)
- Entretien parties communes (nettoyage, produits)
- Entretien espaces verts (tonte, taille, désherbage)
- Entretien voirie privée
- Évacuation ordures ménagères (taxe ou redevance)

### D. Impôts et taxes (récupérables)
- Taxe d'enlèvement des ordures ménagères (TEOM)
- Taxe de balayage

### ❌ NON récupérables (à exclure)
- Grosses réparations art. 606 Code civil (toiture, façades, gros œuvre)
- Honoraires de syndic (sauf cas particulier)
- Frais de personnel (gardien sauf si conditions remplies)
- Travaux d'amélioration

## Scope

### Phase 1 — UI éditeur bail : sélection détaillée des charges (~2h)
Dans le wizard bail / modifier bail, ajouter une section "Détail des charges récupérables" avec **checkboxes** :

**Eau et énergie** :
- [ ] Eau froide
- [ ] Eau chaude collective
- [ ] Chauffage collectif (combustible)
- [ ] Entretien chaudière collective
- [ ] Ramonage collectif

**Ascenseur** :
- [ ] Électricité ascenseur
- [ ] Entretien ascenseur

**Parties communes** :
- [ ] Électricité parties communes
- [ ] Entretien parties communes
- [ ] Entretien espaces verts
- [ ] Entretien voirie privée
- [ ] Évacuation ordures ménagères

**Taxes** :
- [ ] TEOM (taxe enlèvement ordures ménagères)
- [ ] Taxe de balayage

**Autre / précision** : texte libre

### Phase 2 — Génération PDF bail (~1-2h)
- Section "Article X — Charges récupérables" dans le PDF/Word du bail
- Lister chaque case cochée avec le libellé légal exact
- Mention « Conformément au décret 87-713 du 26 août 1987 modifié, les charges suivantes sont récupérables auprès du locataire : ... »
- Si case "Autre / précision" → ajouter en note

### Phase 3 — Lien avec régularisation (~1h)
- Lors du calcul de la régul (CHARGE-REGLES), filtrer les mouvements catégorisés "charges" pour ne récupérer QUE ce qui est listé dans `bail.chargesDetail`
- Empêche le bailleur de récupérer une charge non prévue au bail (protection légale)
- Alerte UI si tentative : « Cette charge n'est pas listée dans le bail, vous ne pouvez pas la récupérer »

### Phase 4 — Tests Vitest (~30min)
- Helper `_chargesRecuperablesAuBail(bail)` → liste des libellés cochés
- Helper `_estChargeRecuperable(catMouvement, bail)` → booléen
- Tests cas : bail vide, bail avec toutes, bail avec sélection partielle, fallback

## Décisions à prendre
- [ ] **Migration baux existants** : par défaut, tout coché ? OU forcer l'utilisateur à ressaisir au prochain édit du bail ?
  - Recommandation : tout coché par défaut + bannière info « Veuillez vérifier la liste détaillée des charges »
- [ ] **Bail meublé** : règles identiques ? OUI (même décret 87-713)
- [ ] **Bail commercial** : règles différentes (non concerné V1, V2 si module commercial)
- [ ] **UI placement** : nouvel onglet "Charges" dans wizard bail OU sous-section dans onglet "Bail" actuel ?

## Différenciant marché
| Solution | Détail charges au bail |
|---|---|
| Rentila | Champ texte libre |
| BailFacile | Liste checkbox basique |
| Qalimo | Section dédiée structurée |
| **ImmoTrack actuel** | Montant global seul |
| **ImmoTrack après BAIL-CHARGES-DETAIL** | Liste légalement conforme + protection régul |

## Notes utilisateur
> 💬 2026-05-13 : "il serait bien de pouvoir clarifier ce qu'il y a dans les charges dans le bail (eau froide, eau chaude, entretien des communs ... à développer)"

## Journal
- 2026-05-13 : créé · couvre décret 87-713 + protection régul + génération PDF conforme
