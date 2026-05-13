# SEPA-PRELEVEMENTS — Prélèvements SEPA automatiques

**Status** : ⬜ À faire — REPORTÉ V2 SaaS 2026-05-13 · **Prio** : V2 SaaS · **Taille** : L (8-12h V2)

## ⚠️ Verdict honnête 2026-05-13
Filtre 4 critères : 2/4 V1 (V1 = juste fichier XML manuel à déposer à la banque = peu de gain user). Vraie valeur seulement V2 SaaS avec Open Banking. Reporté V2 SaaS — pas V1.
**Détecté** : 2026-05-13 (capture Qalimo V2 onglet Pilotage > Prélèvements)
**Lié à** : PILOTAGE-MATRICIEL · BAILLEUR-FORM-RICHE (ICS) · SAAS-MULTIUSERS (V2 backend)

## Contexte
Capture Qalimo V2 — sous-onglet "Prélèvements" dans Pilotage. Permet au bailleur de **prélever automatiquement les loyers** chez les locataires qui ont signé un mandat SEPA.

⚠️ **Nécessite Backend léger pour V2 SaaS** (génération XML SEPA pain.008 + transmission banque). En V1 offline : seulement génération du fichier SEPA téléchargeable que le bailleur dépose manuellement à sa banque.

## Référence Qalimo V2

**Sous-onglet Prélèvements** avec :
- Filtres : Statut / Nom / Biens
- 2 cartes actions :
  - **Éditer le fichier de prélèvement** : « Permet d'éditer le fichier de prélèvement à transmettre à votre banque afin de prélever le loyer de vos locataires qui ont signé un mandat de prélèvement »
  - **Consulter l'historique des prélèvements** : « Retrouvez les fichiers de prélèvements déjà édités ainsi que les bordereaux associés reprenant l'ensemble des informations »
- Tableau par locataire : Tout sélectionner / Solde / Paiement / Montant à prélever

## Cadre légal & technique SEPA

- **Norme XML** : ISO 20022 pain.008.001.02 (SEPA Direct Debit Core ou B2B)
- **ICS** (Identifiant Créancier SEPA) : numéro unique attribué par la banque du bailleur (cf champ dans BAILLEUR-FORM-RICHE)
- **RUM** (Référence Unique de Mandat) : 1 par locataire, généré par le bailleur
- **Mandat SEPA** : signé physiquement ou électroniquement par le locataire (loi Hamon eIDAS pour signature électronique = SIGN-EIDAS V3)
- **Délais** :
  - **CORE FRST** (1ère présentation) : préavis 5 jours
  - **CORE RCUR** (récurrent) : préavis 2 jours
  - **B2B** : préavis 1 jour (entre entreprises uniquement)
- **Limite rejet** : 13 mois pour CORE (locataire peut révoquer), 1 mois pour B2B

## Scope

### Phase 1 — Modèle de données SEPA (~1h)
- Champ `bail.mandatSEPA` : `{rum, dateSignature, type: 'CORE'|'B2B', iban, bic, signataire, statut: 'actif'|'revoque'|'expire'}`
- `bail.entity.ics` (déjà prévu BAILLEUR-FORM-RICHE)
- `DB.prelevements[]` : `{id, bailRef, montant, dateEcheance, sequence: 'FRST'|'RCUR'|'FNAL'|'OOFF', statut, xmlFile, dateGeneration}`

### Phase 2 — UI gestion mandats SEPA (~2-3h)
- Dans fiche bail : section "Mandat SEPA"
- Bouton "Créer un mandat SEPA" → PDF template à imprimer/signer locataire OU signature électronique (V3 SIGN-EIDAS)
- Champ saisie RUM (auto-généré format `IMMOTRACK-{entityId}-{bailRef}-{ts}`)
- Upload mandat signé scanné → stockage Drive (cf DRIVE-ARBORESCENCE)
- Statut visible : Actif / Révoqué / Expiré

### Phase 3 — Génération fichier SEPA XML (~3-4h)
- Helper `_genSEPAFile(prelevements, entity, dateExecution)` :
  - Output : string XML pain.008.001.02 conforme
  - 1 fichier = N prélèvements (1 par locataire éligible)
  - Sequence auto : FRST si 1er mandat, RCUR ensuite
- Tests Vitest dans `__tests__/helpers/sepa.test.js` (15+ cas avec validation contre schéma ISO 20022)
- Pas d'API banque V1 (fichier téléchargé en .xml, dépôt manuel par bailleur dans son portail bancaire)

### Phase 4 — UI génération + historique (~2h)
- Bouton "Éditer fichier de prélèvement" :
  - Modale : sélection date d'exécution + locataires éligibles (cochés par défaut si mandat actif + dette du mois)
  - Aperçu fichier XML
  - Bouton "Générer + Télécharger XML"
  - Log dans audit-trail (cf AUDIT-TRAIL livré v14.89)
- Bouton "Consulter historique" :
  - Liste des fichiers SEPA déjà générés (date, nb prélèvements, montant total)
  - Re-download possible
  - Bordereau PDF associé (récap par locataire)

### Phase 5 — Bulk update mouvements après prélèvement (~1h)
- Après dépôt du XML par bailleur dans sa banque : bouton "Marquer comme exécuté" par fichier SEPA
- Création auto des mouvements "Encaissement loyer SEPA" pour chaque prélèvement réussi
- Gestion rejet : bouton "Marquer rejet" par ligne → création mouvement "Rejet prélèvement" + frais bancaires

### Phase 6 — V2 SaaS : automatisation complète (~+5j-h V2)
- Intégration directe API banque via Open Banking / DSP2 (Bridge, Tink, Powens, Budget Insight)
- Génération + transmission auto fichier SEPA
- Réconciliation auto encaissements bancaires
- → V2 commerciale SaaS uniquement (nécessite agrément AISP)

## Décisions à prendre
- [ ] **V1 limité au téléchargement** (bailleur dépose manuellement à sa banque) OU attendre V2 SaaS pour Open Banking ?
  - Recommandation : **V1 téléchargement XML** (utile pour mandataires Hoguet sans attendre V2)
- [ ] **Type SEPA** : Core uniquement ou Core + B2B ?
  - Recommandation : **Core seul V1** (couvre 99% des cas particuliers + SCI), B2B V2 si module commercial
- [ ] **Mandat signature** : papier scanné V1, électronique eIDAS V3 ?
  - Recommandation : papier V1, e-signature V3 (lien SIGN-EIDAS)

## Différenciant marché
| Solution | Prélèvements SEPA |
|---|---|
| Rentila | ❌ |
| BailFacile | partial (mandats) |
| Qalimo V2 | ⭐ génération XML + historique |
| ICS / Crypto (pro) | ✅ complet |
| **ImmoTrack après SEPA-PRELEVEMENTS V1** | parité Qalimo V2 (téléchargement XML) |
| **ImmoTrack V2 SaaS** | Open Banking auto |

## Notes utilisateur
> 💬 2026-05-13 : capture Qalimo V2 sous-onglet Prélèvements

## Journal
- 2026-05-13 : créé · cible mandataire Hoguet + bailleur multi-baux qui veulent automatiser encaissements
