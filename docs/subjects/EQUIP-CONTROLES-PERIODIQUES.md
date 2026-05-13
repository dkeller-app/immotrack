# EQUIP-CONTROLES-PERIODIQUES — Équipements à entretien périodique LOCATAIRE

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (4-6h)
**Détecté** : 2026-05-13 (régression onglet Équipements) · **Re-cadré 2026-05-13** : focus obligations LOCATAIRE uniquement
**Lié à** : V3-REFONTE-EQUIP · BAILLEUR-DIAGNOSTICS-DDT (jumeau côté bailleur) · BAIL-CLAUSES-PERSO · CHARGE-REGLES · TRAV-SUIVI · DASH-PROFILES (lentille Échéances)

## Contexte
Demande utilisateur 2026-05-13 :
> 💬 « dans équipements tu n'as pas pris ma remarque en compte pour remettre tous les équipements qui donne lieu à un controle périodique (tu te démerdes tu as supprimé tu retrouves et tu cherches le légal !) »

Re-cadrage 2026-05-13 par utilisateur :
> 💬 « les autres catégories sont des obligations bailleur pas locataire. il faut les gérer mais autrement »

**Distinction clé** :
- **CE sujet (EQUIP-CONTROLES-PERIODIQUES)** = obligations LOCATAIRE pendant le bail : entretien récurrent à sa charge
- **Sujet jumeau (BAILLEUR-DIAGNOSTICS-DDT)** = obligations BAILLEUR avant entrée locataire : Dossier Diagnostic Technique (DPE, CREP, amiante, gaz, élec, ERP, termites)

## Scope

### Cadre légal — Obligations LOCATAIRE
Liste des entretiens à charge du locataire pendant le bail (décret 87-712 du 26 août 1987 modifié — réparations locatives) :

| Équipement | Obligation locataire | Texte légal | Récupérable côté bailleur ? |
|---|---|---|---|
| **Chaudière gaz/fioul/bois ≥ 4 kW** | Entretien annuel | Art. R224-31 Code env. + décret 2009-649 | Oui si bailleur fait + facture (charges récup) |
| **PAC > 4 kW** | Entretien annuel ou biennal selon fluide | Décret 2010-349 + arrêté 15/10/2009 | Idem chaudière |
| **Conduit de fumée / poêle / insert** | Ramonage annuel | RSDD département + Code assurances | Oui si bailleur fait + facture |
| **Climatisation > 12 kW** | Inspection 2 ans | Décret 2010-349 | Idem |
| **VMC individuelle** | Nettoyage bouches | RSDD | Locataire (VMC collective = bailleur cf BAILLEUR-DIAGNOSTICS) |
| **Citerne fioul individuelle** | Contrôle 5 ans + nettoyage 5 ans | Arrêté 1 juillet 2004 | Locataire si individuelle |
| **DAAF détecteur fumée** | **Entretien (pile)** | Loi 2010-238 + arrêté 5 fév 2013 | Pile = locataire, installation = bailleur |

### DAAF — Cas particulier (instruction utilisateur explicite 2026-05-13)
> 💬 « DAAF : il faut bien indiquer au locataire de la faire dans le bail mais pas de rappel et il faut l'avoir dans EDL et prendre une photo non négociable (en cas d'un incendie pour prouver que c'était bien présent) »

Donc pour DAAF :
- **PAS d'alerte récurrente** dans le dashboard (entretien à la charge locataire, pas le bailleur)
- **Mention obligatoire au bail** (clause type fixe rappelant l'obligation entretien pile au locataire)
- **OBLIGATOIRE dans wizard EDL entrée** : checkbox "DAAF présent" + photo (non bloquant mais fortement recommandé) → preuve juridique en cas d'incendie

## Scope

### Phase 1 — Refonte onglet Équipements wizard bien (~2h)
Restructurer en sections thématiques **focus locataire** avec **case "présent" + date dernier contrôle + date prochain contrôle (calculée auto)** :

**1. Chauffage** (présence + type)
- Type : Électrique / Gaz / Fioul / Bois-Granulés / PAC / Collectif / Autre
- Si Gaz/Fioul/Bois/PAC → **Date dernier entretien** + Prochain (auto +12 mois)
- Prestataire (texte libre)
- Note : « Entretien à la charge du locataire (récupérable si fait par bailleur) »

**2. Conduit de fumée / ramonage**
- Présence cheminée / poêle / insert (oui/non)
- Si oui → **Date dernier ramonage** + Prochain (auto +12 mois)

**3. VMC**
- Type : Aucune / Individuelle / Collective
- Si individuelle → entretien locataire (nettoyage bouches)
- Si collective → renvoyer vers BAILLEUR-DIAGNOSTICS-DDT (immeuble)

**4. Eau chaude sanitaire**
- Type : Électrique / Gaz / Thermodynamique / Solaire / Collective / Autre
- Si Gaz/Thermodynamique → date dernier entretien

**5. Climatisation** (si > 12 kW)
- Présence + Date dernière inspection + Prochaine (auto +24 mois)

**6. Citerne fioul individuelle** (si chauffage fioul)
- Date dernier contrôle + Prochaine inspection (auto +60 mois)

**7. DAAF détecteur fumée**
- **Présent oui/non**
- Date installation (info bailleur, pas alerté)
- ⚠️ Pas d'alerte récurrente
- Lien vers wizard EDL pour photo (cf Phase 4)

**8. Annexes** (existant, garder)
- Description libre (cave, grenier, parking, etc.)

→ Toutes les sections "diagnostics bailleur" (DPE, CREP, gaz, élec, ERP, termites, amiante) sont **gérées dans BAILLEUR-DIAGNOSTICS-DDT** (sujet jumeau), pas ici.

### Phase 2 — Clauses bail générées auto (~1h)
Dans le PDF bail, section "Article XX — Entretien à la charge du locataire" :
- Liste auto des équipements présents avec leur fréquence d'entretien locataire
- Mention obligatoire DAAF (texte type loi 2010-238) :
  > « Le présent logement est équipé d'un détecteur de fumée. Conformément à l'article R129-13 du Code de la construction et de l'habitation, l'entretien de cet équipement, notamment le remplacement de la pile, incombe au locataire. »
- Mention chaudière/PAC obligation entretien annuel à charge locataire

### Phase 3 — Alertes dashboard lentille Échéances (~1h)
- Lentille Échéances (DASH-PROFILES) → catégorie "🔧 Contrôles équipements locataire" :
  - Chaudière entretien annuel (alerte 30j avant prochaine échéance)
  - Ramonage annuel (alerte 30j avant)
  - PAC entretien (alerte 30j avant)
  - Climatisation inspection (alerte 60j avant)
  - Citerne fioul (alerte 6 mois avant)
- ⚠️ DAAF **NON inclus** dans les alertes (instruction user)

### Phase 4 — DAAF dans wizard EDL entrée (~30min)
- Dans wizard EDL entrée, **section dédiée "Sécurité incendie"** :
  - Checkbox "DAAF détecteur de fumée présent" (à cocher)
  - **Champ photo obligatoire** si coché (fortement recommandé, pas bloquant)
  - Pré-renseigner si déjà dans logement.equipements.daaf
  - Auto-sync vers logement.equipements.daaf (date constat = date EDL)
- ⚠️ Bouton "Sauter" possible mais avec warning rouge « Risque juridique en cas d'incendie sans preuve d'installation »

### Phase 5 — Tests Vitest (~30min)
- `_calculerProchainControle(equipement, dateDernier, frequenceMois)` → cas chaudière (12), PAC (12/24), citerne (60)
- `_clauseLocataire(logement.equipements)` → string de la clause bail générée
- Tests cas : équipement absent, date manquante, fréquence biennale

### Phase 6 — Migration baux existants (~30min)
- Champ `logement.equipements` enrichi avec rétrocompatibilité
- Migration silencieuse au boot : convertir ancien `chauffage` simple en nouvelle structure

## Décisions arbitrées 2026-05-13
- [x] **VMC collective immeuble** : géré dans BAILLEUR-DIAGNOSTICS-DDT (sujet jumeau créé)
- [x] **Alerte DAAF** : 0 alerte (instruction user, pile à charge locataire)
- [x] **Bouton "Sauter photo DAAF" dans EDL** : autorisé avec warning rouge (user validé)

## Différenciant marché
| Solution | Équipements locataire + DAAF EDL photo |
|---|---|
| Rentila | Liste basique, pas de DAAF EDL |
| BailFacile | Liste + alertes, pas de photo obligatoire |
| Qalimo | Vue dédiée, pas de DAAF preuve photo |
| **ImmoTrack actuel** | 3 champs (régression) |
| **ImmoTrack après EQUIP-CONTROLES-PERIODIQUES** | 7 catégories locataire + clauses bail auto + photo DAAF EDL = **différenciant juridique** |

## Notes utilisateur
> 💬 2026-05-13 : "dans équipements tu n'as pas pris ma remarque en compte pour remettre tous les équipements qui donne lieu à un controle périodique"
> 💬 2026-05-13 : "DAAF détecteur fumée : il faut bien indiquer au locataire de la faire dans le bail mais pas de rappel et il faut l'avoir dans EDL et prendre une photo non négociable (en cas d'un incendie pour prouver que c'était bien présent)"
> 💬 2026-05-13 : "les autres catégories sont des obligations bailleur pas locataire. il faut les gérer mais autrement"

## Journal
- 2026-05-13 : créé · inventaire légal exhaustif
- 2026-05-13 : re-cadré → focus obligations LOCATAIRE uniquement. Obligations bailleur extraites dans sujet jumeau BAILLEUR-DIAGNOSTICS-DDT. DAAF cas particulier (clause bail + EDL photo, pas d'alerte récurrente).
