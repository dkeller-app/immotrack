# EQUIP-CONTROLES-PERIODIQUES — Inventaire complet équipements à contrôle périodique légal

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (4-6h)
**Détecté** : 2026-05-13 (régression onglet Équipements détectée)
**Lié à** : V3-REFONTE-EQUIP · BUG-EQUIP-FILTER · TRAV-SUIVI · DASH-PROFILES (lentille Échéances)

## Contexte
Demande utilisateur 2026-05-13 (avec capture onglet Équipements logement D-102) :
> 💬 « dans équipements tu n'as pas pris ma remarque en compte pour remettre tous les équipements qui donne lieu à un controle périodique (tu te démerdes tu as supprimé tu retrouves et tu cherches le légal !) »

### Constat capture 2026-05-13
L'onglet Équipements actuel ne contient que :
- **CHAUFFAGE** : Électrique / Gaz / Collectif + Autre/précision + Description complète
- **EAU CHAUDE SANITAIRE** : Chauffe-eau électrique / Chaudière gaz / Collective + Description
- **ANNEXES** : Description libre

→ **Régression** : beaucoup d'équipements à contrôle périodique légal manquent (entretien obligatoire annuel/biannuel/quinquennal). Il faut tous les remettre + ajouter le suivi des dates de contrôle pour alerter l'utilisateur.

## Cadre légal — Inventaire exhaustif

### A. CHAUFFAGE (obligation annuelle ou biennale)
| Équipement | Obligation | Texte légal |
|---|---|---|
| Chaudière gaz, fioul, bois ≥ 4 kW | **Entretien annuel** | Art. R224-31 à R224-41 Code env. + décret 2009-649 |
| Chaudière électrique | Pas d'entretien obligatoire | — |
| PAC (pompe à chaleur) > 4 kW | **Entretien annuel** (ou biennal selon fluide frigorigène) | Décret 2010-349 + arrêté 15/10/2009 |
| Conduit de fumée (cheminée, poêle, insert) | **Ramonage annuel** | RSDD département + Code des assurances |
| VMC | **Vérification triennale** (collectif) | Arrêté 31 oct 2005 |
| Climatisation > 12 kW | **Inspection périodique 2 ans** | Décret 2010-349 |
| Citerne fioul individuelle | **Contrôle quinquennal** + nettoyage 5 ans | Arrêté 1 juillet 2004 |

### B. EAU
| Équipement | Obligation | Texte légal |
|---|---|---|
| Chauffe-eau électrique | Pas d'obligation entretien (mais recommandé vidange annuelle) | — |
| Chauffe-eau gaz | **Entretien annuel** (intégré dans entretien chaudière si commune) | idem chaudière |
| Chauffe-eau thermodynamique | **Entretien biennal** | Décret 2020-912 |
| Adoucisseur d'eau | Pas d'obligation légale (recommandé annuel) | — |
| Disconnecteur | Contrôle annuel si installé | RSDD |

### C. SÉCURITÉ (obligations bail location)
| Équipement | Obligation | Texte légal |
|---|---|---|
| **Détecteur de fumée DAAF** | **Installation obligatoire** + pile à entretenir | Loi 2010-238 + arrêté 5 février 2013 |
| Détecteur CO (monoxyde) | Recommandé si combustion (non obligatoire mais sécurité) | — |
| Extincteur | Pas obligatoire en logement (sauf RSDD spécifique) | — |
| Garde-corps / balcon | **État conservation à vérifier** | DTU 39-4 + RSDD |

### D. ASCENSEUR (collectif)
| Équipement | Obligation | Texte légal |
|---|---|---|
| Ascenseur | **Maintenance contractuelle** (mensuel ou bimestriel) + **Contrôle technique 5 ans** | Décret 2004-964 + arrêté 18 nov 2004 |
| Monte-charge | Idem ascenseur | idem |

### E. DIAGNOSTICS OBLIGATOIRES BAIL (validités)
| Diagnostic | Validité | Cible | Texte légal |
|---|---|---|---|
| **DPE** (perf énergétique) | **10 ans** | Tous logements | Loi 2010-788 + décret 2020-1610 |
| **CREP** (plomb) | **1 an** si présence / **illimité** si absence | Logement avant 1949 | Art. L1334-5 à L1334-9 Code santé |
| **État amiante (DAPP/DTA)** | **Illimité** si absence | Permis avant 1er juillet 1997 | Art. R1334-15 à R1334-29 |
| **État installation gaz** | **6 ans** | Installation >15 ans | Art. L134-6 |
| **État installation élec** | **6 ans** | Installation >15 ans | Art. L134-7 |
| **État risques (ERP)** | **6 mois** | Zone à risques | Art. L125-5 |
| **Termites / parasitaire** | **6 mois** | Zone à arrêté préfectoral | Art. L133-6 |
| **Bruit aérien** | Illimité si non concerné | Zone aéroport | Art. L112-11 Code urb. |
| **Mérule** | À déclarer si zone concernée | Zone à arrêté préfectoral | Art. L133-7 |

### F. ANNEXES (description / état)
- Cave, grenier, parking, place stationnement, garage, jardin privatif, terrasse
- Pas de contrôle périodique légal mais utile pour bail (clauses annexes)

## Scope

### Phase 1 — Refonte onglet Équipements wizard bien (~2-3h)
Restructurer en sections thématiques avec **case "présent" + date dernier contrôle + date prochain contrôle (calculée auto)** :

**1. Chauffage**
- [ ] Type : Électrique / Gaz / Fioul / Bois-Granulés / PAC / Collectif / Autre
- Date dernier entretien : [DATE]
- Prochain entretien : auto (= dernier + 12 mois si obligatoire)
- Prestataire (texte libre)

**2. Conduit de fumée / ramonage**
- [ ] Présence cheminée / poêle / insert
- Date dernier ramonage
- Prochain ramonage : auto +12 mois

**3. VMC**
- [ ] Présence + type (simple flux / double flux)
- Date dernière vérification
- Prochaine vérification : auto +36 mois (si collectif)

**4. Eau chaude sanitaire**
- [ ] Type : Électrique / Gaz / Thermodynamique / Solaire / Collective / Autre
- Date dernier entretien (si gaz ou thermodynamique)

**5. Climatisation / PAC réversible** (si > 12 kW)
- [ ] Présence
- Date dernière inspection
- Prochaine : auto +24 mois

**6. Citerne fioul** (si fioul)
- Date dernier contrôle
- Prochaine inspection : auto +60 mois

**7. Sécurité incendie**
- [ ] DAAF installé (présomption oui pour bail)
- Date installation / dernier remplacement pile

**8. Ascenseur** (immeuble uniquement, pas logement)
- → géré au niveau Immeuble, pas Logement

**9. Diagnostics bail (validité)**
- DPE : classe + date diag + validité 10 ans
- CREP plomb : présent O/N + date + validité 1 an si présence
- Amiante : présent O/N + date
- Gaz : conforme O/N + date + validité 6 ans
- Élec : conforme O/N + date + validité 6 ans
- ERP : date + validité 6 mois
- Termites : si applicable
- Bruit aérien : si applicable

**10. Annexes** (existant, garder)
- Description libre

### Phase 2 — Alertes dashboard + agenda (~1-2h)
- Lentille Échéances DASH-PROFILES (déjà recommandée V1) → ajouter catégorie "🔧 Contrôles équipements" avec :
  - Entretien chaudière (alerte 30j avant)
  - Ramonage (alerte 30j avant)
  - Diagnostic gaz/élec (alerte 6 mois avant expiration)
  - DPE (alerte 12 mois avant les 10 ans)
  - CREP plomb (alerte 1 mois avant si présent)
- Helper `_equipementsAControlerSous(jours)` → liste des équipements à contrôler dans les N jours

### Phase 3 — Tests Vitest (~30min)
- `_calculerProchainControle(equipement, dateDernier)` → cas chaudière (12 mois), PAC (12 mois), citerne (60 mois), DPE (120 mois)
- `_estDiagExpire(diag, dateRef)` pour les 7 diagnostics bail
- Tests cas : date manquante, équipement absent, double frequence (entretien biennal)

### Phase 4 — Migration baux existants (~30min)
- Champ `logement.equipements` enrichi (rétrocompatible)
- Migration silencieuse au boot : convertir l'ancien `chauffage` simple en nouvelle structure
- Sans casser la prod

### Phase 5 — Génération PDF bail (~1h)
- Section "Article XX — Équipements et diagnostics" dans le PDF bail
- Liste des équipements présents + leurs prochaines échéances
- Diagnostics avec date validité (loi 89-462 art. 3-3 + décret 2002-120)

## Décisions à prendre
- [ ] **Niveau d'obligation user** : forcer la saisie de TOUS les équipements pertinents ou laisser optionnel ?
  - Recommandation : laisser optionnel + bannière "Équipements à risque : X manquants" sur fiche logement
- [ ] **Bail commercial** : règles différentes (V2 si module commercial)
- [ ] **Ascenseur** : géré au niveau Immeuble (1 ascenseur = N logements) ou Logement ?
  - Recommandation : Immeuble (cf IMM-FICHE-360 sous-onglet Équipements collectifs)

## Différenciant marché
| Solution | Équipements + contrôles |
|---|---|
| Rentila | Liste basique sans suivi |
| BailFacile | Liste + alertes basiques |
| Qalimo | Vue dédiée avec calendrier |
| ICS / Crypto (pro) | Module Entretien complet |
| **ImmoTrack actuel** | 3 champs (régression) |
| **ImmoTrack après EQUIP-CONTROLES-PERIODIQUES** | 10 catégories + alertes automatiques + génération PDF |

## Notes utilisateur
> 💬 2026-05-13 : "dans équipements tu n'as pas pris ma remarque en compte pour remettre tous les équipements qui donne lieu à un controle périodique (tu te démerdes tu as supprimé tu retrouves et tu cherches le légal !)"
> 💬 capture : actuellement réduit à Chauffage / ECS / Annexes (régression vs versions antérieures)

## Journal
- 2026-05-13 : créé · inventaire légal exhaustif fait (10 catégories + 9 diagnostics avec textes légaux) · à mettre en œuvre Sprint V1.1
