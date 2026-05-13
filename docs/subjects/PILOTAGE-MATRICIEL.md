# PILOTAGE-MATRICIEL — Vue multi-baux centralisée (parité Qalimo V2 onglet Pilotage)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : L (8-12h)
**Détecté** : 2026-05-13 (capture Qalimo V2 onglet Pilotage avec 4 sous-onglets)
**Lié à** : DASH-PROFILES · PARAM-BAILLEUR-AUTOMATISATIONS · BAILLEUR-DIAGNOSTICS-DDT · EMAIL-AUTO

## Contexte
Capture Qalimo V2 — nouvel onglet "Pilotage" entre Candidats et Finances. C'est une **vue d'opérateur** qui complète le dashboard (vue globale agrégée) avec une **matrice locataire × actions** = très efficace pour un gestionnaire qui suit N baux en parallèle.

## Référence Qalimo V2 — Onglet Pilotage

**4 sous-onglets internes** :

### 1. Suivi comptable
Tableau par locataire avec colonnes :
- **Tout sélectionner** (checkbox bulk action)
- **Locataire** (nom + bien : « PARZYBOK FELD CINDY [IRL] · FREYMING - 001 - RDC devant »)
- **DG** (versé/dû : ex « 600/600€ »)
- **Solde** (cumul impayés négatif rouge : ex « -620€ », « -1040€ », « -2050€ »)
- **N colonnes mensuelles** (mai 2026, avril 2026, mars 2026, février 2026...) avec montant payé/dû par mois
- Filtres haut : Statut / Nom / Biens
- Bouton primaire **"Mettre à jour les loyers"** (action bulk = appliquer révisions IRL en masse)

### 2. Suivi documents
Tableau par locataire avec **5 colonnes documents** (icônes) :
- **Bail** : Signé ●vert / Non signé
- **État des lieux** : Signé ●vert / Manquant
- **Assurance** : Valide ●vert / Expiré ●rouge / Absent +
- **Entretien chauffage** : Absent + ●rouge (cliquer pour demander)
- **Cautionnement** : Absent + ●rouge / Signé

→ Vue d'un coup d'œil de la **conformité documentaire** de tous les baux. Très utile avant V1 commerciale.

### 3. Automatisations
Tableau par locataire avec **8 toggles individuels** (override par bail des paramètres bailleur) :
1. Quittance de loyer
2. Avis d'échéance
3. Révision de loyer
4. Assurance locataire
5. Entretien chauffage
6. Résiliation du bail
7. Impayé de loyer
8. Alerte virement

→ Pattern : automatisations héritées du bailleur (cf PARAM-BAILLEUR-AUTOMATISATIONS) mais **override possible par bail individuel** via cette vue centralisée.

### 4. Prélèvements (renvoi sujet SEPA-PRELEVEMENTS séparé)
- Éditer le fichier de prélèvement (SEPA XML pain.008)
- Consulter l'historique des prélèvements
- Tableau locataire avec Solde / Paiement / Montant à prélever
- Tout sélectionner (bulk)

## Pourquoi cet onglet est puissant

- **Vue d'opérateur** : un gestionnaire de 10+ baux peut tout monitorer d'un coup
- **Bulk actions** : "Mettre à jour les loyers" en 1 clic pour tous les baux concernés (révision IRL annuelle)
- **Alertes visuelles** : badges rouge "Expiré"/"Absent +" sautent aux yeux
- **Override granulaire** : automatisations héritées du bailleur mais ajustables par bail
- **Cible pro/mandataire** : différenciant SaaS commercial pour Hoguet

## Scope

### Phase 1 — Nouvel onglet sidebar "Pilotage" (~30min)
- Position : entre "Candidats" (LOG-CANDIDATS) et "Mouvements" dans la sidebar
- Route `#p-pilotage`
- Page avec 4 sous-onglets internes (tabs internes type Qalimo)

### Phase 2 — Sous-onglet "Suivi comptable" (~3h)
- Tableau dynamique par locataire (tri par solde décroissant par défaut)
- Colonnes :
  - Checkbox bulk
  - Nom locataire + bien (cliquable → LOG-FICHE-360)
  - DG : versé/dû avec couleur si incomplet (récupéré depuis `bail.dgPaid` vs `bail.dg`)
  - Solde global (somme impayés depuis début bail)
  - N=4 dernières colonnes mensuelles (montant attendu vs reçu avec icône ✓/✗)
- Filtres : Statut (Impayé / À jour / Avec retard / DG incomplet) + Nom + Biens (multi-select)
- Bouton primaire **"Mettre à jour les loyers"** :
  - Modale : sélection mois cible + indice IRL à appliquer
  - Aperçu : N baux concernés × nouveau loyer calculé (helper `_loyerHCAtDate` déjà livré)
  - Bouton "Confirmer" → bulk update avec log audit-trail (cf AUDIT-TRAIL livré v14.89)
- Bulk actions sur les locataires cochés : Envoyer rappel impayé (cf EMAIL-AUTO), Générer quittance, etc.

### Phase 3 — Sous-onglet "Suivi documents" (~2-3h)
- Tableau locataire × 5 colonnes documents
- Pour chaque cellule :
  - **Vert** si présent + valide
  - **Orange** si présent mais expire < 60j (assurance MRH par ex)
  - **Rouge** si expiré ou absent
  - Bouton "+" si absent → ouvre modale upload/demande
- Filtres : Statut docs (Tous OK / Au moins 1 manque / Avec expiré)
- Bouton primaire "Exporter rapport conformité" (PDF synthèse)

### Phase 4 — Sous-onglet "Automatisations" override par bail (~2h)
- Tableau locataire × 8 toggles
- Au load : toggles préselectionnés depuis `bail.entity.automatisations` (hérités du bailleur)
- Si user override : stocké dans `bail.automatisations` (override sélectif)
- Icône "héritage" si toggle = valeur bailleur, icône "override" si différent
- Bouton "Réinitialiser au défaut bailleur" par bail
- Couplé avec PARAM-BAILLEUR-AUTOMATISATIONS (panneau bailleur global)

### Phase 5 — Sous-onglet "Prélèvements" stub (~30min)
- Stub minimal V1 : "Bientôt disponible — nécessite SEPA mandats"
- Lien vers sujet SEPA-PRELEVEMENTS (V2 SaaS)
- Pas de logique en V1

### Phase 6 — Tests Vitest + responsive (~2h)
- `__tests__/helpers/pilotage.test.js` :
  - `_soldeLocataire(bail, mouvements, dateRef)` cumul impayés
  - `_statutDocLocataire(bail, type)` retourne {color, label, action}
  - `_bulkMajLoyers(baux, indiceIRL, dateApplication)` simulation + génération mouvements
- UI responsive : tableau scrollable horizontal mobile + sticky 1ère colonne nom (cf MOBILE-AUDIT-ONGLETS)

## Décisions à prendre
- [ ] **Onglet sidebar position** : entre Candidats et Mouvements OU dédier section "Suivi" séparée ?
  - Recommandation : entre Candidats et Mouvements (parité Qalimo)
- [ ] **Bulk action "Mettre à jour les loyers"** : application stricte sur tous baux cochés OU exclure ceux en gel DPE F/G (cf IRL-DPE-FG livré) ?
  - Recommandation : **exclure auto** les gels DPE avec message clair (déjà géré côté `computeIRLRevision`)
- [ ] **Vue tableau dense** : OK desktop mais mobile ?
  - Recommandation : version mobile = cartes verticales 1 locataire = 1 carte avec 5 indicateurs colorés

## Différenciant marché
| Solution | Vue Pilotage matriciel |
|---|---|
| Rentila | ❌ |
| BailFacile | partial (vue solde global) |
| Qalimo V2 | ⭐ onglet dédié 4 sous-onglets |
| ICS / Crypto (pro) | ✅ (cible pro) |
| **ImmoTrack après PILOTAGE-MATRICIEL** | parité Qalimo + bulk update IRL exclusion DPE F/G auto |

## Notes utilisateur
> 💬 2026-05-13 : captures Qalimo V2 onglet Pilotage (4 sous-onglets : Suivi comptable / Suivi documents / Automatisations / Prélèvements)

## Journal
- 2026-05-13 : créé · vue matricielle multi-baux = différenciant pro Qalimo V2, P1 pour cible gestionnaire pro/mandataire Hoguet
