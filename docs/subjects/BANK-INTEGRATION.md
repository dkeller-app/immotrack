# BANK-INTEGRATION — Intégration comptes bancaires (étude de marché + pricing)

**Status** : ⬜ À faire — décision stratégique à arbitrer · **Prio** : P2 (V1) / P1 (V2 SaaS) · **Taille** : XL (refonte data + backend)
**Détecté** : 2026-05-13 (capture Qalimo V2 onglet Mes banques avec Crédit Mutuel connecté)
**Lié à** : ALERTE-VIREMENT-ENTRANT · SEPA-PRELEVEMENTS · MVT-RECURRENT · BUG-CHARGE-001 (livré) · SAAS-MULTIUSERS (V2)

## Contexte
Demande utilisateur 2026-05-13 :
> 💬 « il faut pouvoir charger directement les comptes bancaires. Faire une étude des possibilités et couts »

Référence Qalimo V2 — onglet "Mes banques" :
- Connecter un compte (Crédit Mutuel exemple)
- Affichage solde temps réel (6 246,54 €)
- Sous-onglets : Mes banques / Transactions / Paramètres
- Concept "Session expirée / Se reconnecter" = OAuth DSP2 (95 jours max)
- Bouton "Ajouter un compte bancaire" + "Ajouter un compte supplémentaire"

## Cadre réglementaire — DSP2 obligatoire

Depuis 2018, **toute connexion à un compte bancaire en EU passe par DSP2** (Directive sur les Services de Paiement v2). Plus de scraping autorisé.

Statuts régulés par l'ACPR (FR) ou équivalent EU :
- **AISP** (Account Information Service Provider) — lecture comptes + transactions
- **PISP** (Payment Initiation Service Provider) — initiation paiements/virements
- **CBPII** (Card-Based Payment Instrument Issuer) — cartes

→ Pour ImmoTrack (lecture comptes + soldes + transactions) : statut **AISP nécessaire**.

### 2 options stratégiques

**A. Devenir AISP soi-même** :
- Agrément ACPR France (6-12 mois procédure)
- Capital social ≥ 50 k€
- Équipe compliance + DPO + audit
- **Coût : 100-300 k€ setup + 50-100 k€/an compliance**
- → **ÉCARTÉ** pour ImmoTrack solo

**B. Utiliser un AISP existant comme prestataire** (modèle "agent")
- Ils ont l'agrément, ImmoTrack reste sous leur compliance
- Frais d'utilisation API
- **Modèle réaliste pour ImmoTrack V2 SaaS**

## Étude comparative des AISP majeurs (France, mai 2026)

### 1. ⭐ Bridge (Powens) — leader FR
**Profil** : Anciennement Budget Insight + Bridge fusion 2022 = Powens. Leader FR avec ~600 banques connectées.
- **Pricing public estimé** :
  - Setup : 0€ - 1000€ selon volumétrie
  - Mensuel : ~0,50-2€/compte connecté actif
  - Frais API : ~0,01€/appel (gratuit jusqu'à seuil)
  - Plans : Starter ~150€/mois (250 comptes), Growth ~500€/mois (1000 comptes), Enterprise sur devis
- **Couverture** : 100% banques FR + 90% banques EU
- **Features** : Solde + Transactions + Catégorisation auto + Initiation paiement (PISP)
- **Doc dev** : excellent (SDK JS/Python/PHP)
- **SLA** : 99,5% uptime garanti
- **RGPD** : hébergement France (Outscale OVH), DPA fourni
- **Site** : powens.com

### 2. Tink (Visa)
**Profil** : Acquis par Visa en 2022, scale-up EU.
- **Pricing public estimé** :
  - Sur devis exclusivement
  - Estimation marché : ~200-800€/mois fixe + variable
- **Couverture** : EU + UK
- **Features** : Solde + Transactions + Account Check + Payments
- **Doc dev** : bonne
- **Particulier** : focus B2B large, peut être surdimensionné pour bailleur solo

### 3. Linxo Connect (Crédit Agricole)
**Profil** : Détenu par Crédit Agricole depuis 2020.
- **Pricing public estimé** : 100-400€/mois selon plan
- **Couverture** : 95% banques FR
- **Features** : Solde + Transactions + Catégorisation
- **Avantage** : intégration native CA Pro si le bailleur est client
- **Site** : linxo.com/connect

### 4. Saltedge
**Profil** : Acteur EU/global, populaire chez les fintechs.
- **Pricing public** : à partir de **30€/mois** (Standard, 50 comptes) jusqu'à 199€+ (Business)
- **Couverture** : Global incl. FR + EU
- **Avantage** : pricing transparent, pas de minimum d'engagement
- **Site** : saltedge.com

### 5. Fintecture
**Profil** : Spécialiste paiement IBAN-to-IBAN (PISP).
- **Pricing** : ~10-50 centimes par initiation paiement
- **Focus** : PAYMENTS, pas agrégation pure
- **Intérêt** : pour SEPA-PRELEVEMENTS automatique (cf sujet jumeau)
- **Site** : fintecture.com

### 6. TrueLayer (UK)
**Profil** : Leader UK, agressif EU.
- **Pricing public estimé** : sur devis, plus cher que Saltedge
- **Couverture** : UK + EU
- **Particulier** : moins de banques FR couvertes (~80%)

### Comparatif synthèse

| AISP | Setup | Mensuel mini | Par compte | Couverture FR | Recommandation ImmoTrack |
|---|---|---|---|---|---|
| **Bridge/Powens** | 0€ | ~150€ | ~0,50€ | ⭐⭐⭐ 100% | **Recommandé V2** |
| Tink | sur devis | ~200€ | ~0,30€ | ⭐⭐ 80% | À étudier si scale international |
| Linxo Connect | 0€ | ~100€ | ~0,40€ | ⭐⭐⭐ 95% | Alternative FR solide |
| **Saltedge** | 0€ | **~30€** | ~0,30€ | ⭐⭐ 70% | **Recommandé MVP** (pricing transparent) |
| TrueLayer | sur devis | ~250€ | ~0,40€ | ⭐⭐ 80% | UK focus, écarté FR |
| Fintecture | 0€ | par usage | n/a | n/a | Pour SEPA paiements V3 |

→ **Recommandation 2 étapes** :
1. **MVP V2 SaaS** : Saltedge (30€/mois fixe, pricing transparent, pas d'engagement)
2. **Scale V2.1+** : migration Bridge/Powens si volumétrie >100 comptes connectés (meilleure couverture FR + features avancées)

## Architecture technique nécessaire

⚠️ **Une intégration AISP nécessite OBLIGATOIREMENT un backend** (l'OAuth bancaire ne marche pas en pur client offline-first → expose le client secret).

### Architecture cible V2 SaaS

```
[ImmoTrack frontend]
    ↓ POST /api/bank/connect
[Backend Cloudflare Worker / Vercel Edge]
    ↓ OAuth 2.0 redirect
[Agrégateur Saltedge/Bridge]
    ↓ OAuth flow utilisateur
[Banque utilisateur]
    ↓ tokens
[Backend] stocke tokens chiffrés (Vault / KMS)
    ↓ poll régulier ou webhook
[Database] mouvements bancaires + solde
    ↓
[ImmoTrack frontend] affiche
```

**Coût infra estimé** :
- Cloudflare Workers : ~5-20€/mois (généreux free tier)
- Stockage chiffré tokens : KMS AWS ~5€/mois
- Base données mouvements bancaires : PostgreSQL gérée 15-30€/mois (Neon, Supabase)
- **TOTAL infra : ~30-70€/mois** en plus de l'agrégateur AISP

### Coût total V2 SaaS

| Poste | Bas | Médian | Haut |
|---|---|---|---|
| Agrégateur (Saltedge MVP) | 30€ | 50€ | 100€ |
| Infra backend | 30€ | 50€ | 80€ |
| Compliance RGPD (avocat ponctuel) | 0€ amortisé | 50€ | 100€ |
| **Total mensuel** | **~60€** | **~150€** | **~280€** |

→ Si tarifés à l'utilisateur final : ~5-10€/mois supplémentaires par bailleur connecté justifie le coût.

## Alternative V1 — Sans agrégateur (réaliste short-term)

**Import CSV/OFX manuel** (offline-first compatible) :

### Scope V1 (~5-8h dev)
- Bouton "Importer mouvements bancaires" dans onglet Mouvements
- Support formats :
  - **CSV** générique (mapping colonnes) — toutes banques
  - **OFX** (Open Financial Exchange) — format standard reconnu par Crédit Mutuel, BNP, SG, LCL, CA, etc.
  - **CSV CAMT.053** (norme SEPA) — pour clients pros
- Mapping auto colonnes (date, libellé, débit, crédit, solde)
- **Matching auto** avec catégories ImmoTrack via heuristiques :
  - "VIR" + montant proche loyer attendu + nom locataire → catégorie "Loyers" + qui = ref logement
  - "PRELEV" + RUM connu → SEPA-PRELEVEMENTS
  - "ASSURANCE" + montant fixe → "Assurances"
  - "TRAVAUX" / "ENTRETIEN" + descripteur → "Travaux"
- Modale de validation : utilisateur confirme ou corrige les mappings
- Doublons : détection automatique (même date + montant + libellé sur ±3 jours)
- Persistance dans `DB.mouvements` (existant)

### Avantages V1
- **Coût 0€** (juste dev)
- Pas de backend nécessaire (compatible offline-first ImmoTrack)
- Pas de DSP2/AISP/agrément
- L'utilisateur garde le contrôle (export CSV depuis sa banque, dépose dans l'app)

### Limites V1
- Pas de mise à jour temps réel (utilisateur doit re-exporter périodiquement)
- Pas de solde temps réel
- Pas d'alerte virement entrant immédiate

## Recommandation chiffrée ImmoTrack

### Phase 1 — V1 (immédiat, ~5-8h dev)
**Import CSV/OFX manuel** — couvre 80% des cas d'usage pour 0€ de coût récurrent.

### Phase 2 — V2 SaaS (post-commercialisation, ~30-50h dev backend + 10h frontend)
**Intégration Saltedge** comme MVP. Pricing user-facing : +5€/mois "Pro Connect" optionnel.

### Phase 3 — V2.1+ (si scale >100 utilisateurs avec banque connectée)
**Migration vers Bridge/Powens** pour couverture FR maximale.

## Coût ROI

**V1 import CSV** :
- Investissement : ~1 jour dev
- Coût récurrent : 0€
- Bénéfice user : économie ~30 min/mois de saisie manuelle

**V2 Saltedge** :
- Investissement : ~5-7 jours dev backend + frontend
- Coût récurrent : 30-80€/mois
- Bénéfice user : économie 1-2h/mois + tranquillité + alertes temps réel
- **Pricing user** : +5€/mois = breakeven à 10 utilisateurs connectés

## Risques

| Risque | Sévérité | Mitigation |
|---|---|---|
| RGPD données bancaires | 🔴 Haute | Saltedge/Bridge sont AISP certifiés, hébergement EU, DPA fourni |
| Tokens bancaires fuités | 🔴 Haute | Stockage chiffré (KMS), pas exposé client |
| Session expirée 95j (DSP2) | 🟡 Moyenne | UX claire "Se reconnecter" + email rappel J-7 |
| Vendor lock-in agrégateur | 🟡 Moyenne | Abstraction API maison + tests Saltedge ET Bridge |
| Coût scale imprévisible | 🟡 Moyenne | Saltedge à 30€ MVP, migration Bridge si volumétrie |

## Décisions arbitrées 2026-05-13

- [x] **V1 CSV/OFX maintenant** (user validé "oui pour tes propositions")
- [x] **AISP cible V2 SaaS** : **Saltedge MVP** (~30€/mois), migration Bridge/Powens si scale >100 comptes
- [x] **Pricing user-facing** : supplément **"Pro Connect" 5€/mois** (segmentation pro vs amateur)
- [x] **Backend V2** : Cloudflare Workers (latency + free tier généreux)

## Différenciant marché

| Solution | Intégration bancaire |
|---|---|
| Rentila | ❌ |
| BailFacile | ❌ |
| Qalimo V2 | ✅ (vraisemblablement via Bridge ou Linxo) |
| ImmobilierLoyer | partial |
| Smovin | ✅ (BE/FR) |
| ICS / Crypto (pro) | ✅ |
| **ImmoTrack V1 (import CSV)** | partial |
| **ImmoTrack V2 SaaS (Saltedge)** | ✅ parité Qalimo |

## Notes utilisateur
> 💬 2026-05-13 : « il faut pouvoir charger directement les comptes bancaires. Faire une étude des possibilités et couts »

## Journal
- 2026-05-13 : créé · étude marché 6 AISP + reco 3 phases (V1 CSV, V2 Saltedge, V2.1+ Bridge) + chiffrage coûts mensuels 30-280€
