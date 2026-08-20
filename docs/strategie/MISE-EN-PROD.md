# Mise en production & commercialisation — décisions et étapes

> Figé le 2026-08-19 après validation Didier dans le chat (règle : valider puis figer).
> Remplace, pour la partie « passage en prod », la roadmap périmée de [PLAN_ACTIONS.md](PLAN_ACTIONS.md) (avril 2026).

## 1. Décisions validées (19/08/2026)

| Sujet | Décision | Note |
|---|---|---|
| **Domaine** | `propryo.fr` — **acheté par Didier avant le 31/08/2026** | Bloqueur n°1 : débloque Resend (SPF/DKIM) → confirmation d'inscription, OTP signature, invitations bêta, email support |
| **Forme juridique** | **Micro-entreprise (AE)** — à confirmer avec le comptable | Bascule SASU envisagée au seuil (~2 000-2 500 € MRR). Le jour de la bascule : formaliser l'apport du logiciel à la société |
| **Paiement** | **Stripe** (conditionné au statut AE) | En franchise de TVA, pas de TVA à facturer → Stripe (~1,5-2,9 % + 0,25 €) plus simple et moins cher que Paddle (5 %). Re-évaluer Paddle si passage en société assujettie ou ouverture Europe |
| **Business plan** | Réécriture destinée à **démontrer l'ambition du projet, sa faisabilité et son potentiel concret** | Pas un dossier bancaire formaté : un dossier de conviction. Réécriture lancée dès la grille tarifaire validée |
| **Synchro bancaire (DSP2) — DÉCIDÉE 19/08 soir** | **Incluse dès Investisseur, T1 2027** (pas d'add-on — Rentila l'inclut même en gratuit, Qalimo dans tous ses plans) · Essentiel = import par relevé · **dogfood T4 2026 à 0 €** (Enable Banking Restricted, comptes Didier CM+CA) · coûts provisionnés au modèle en placeholders (forfait + par compte) | **Action : lancer la Phase 0 de [BANK-API-AUTO-IMPORT](../subjects/BANK-API-AUTO-IMPORT.md)** (comptes Enable Banking + sandbox Bridge, devis, DPA) — grille 9,90/19,90 **maintenue** (réexamen calibration janv. 2027) |
| **Fondateurs & offre de lancement — 20/08** | **FIGÉ : 10-15 bêta-testeurs proches = statut « Fondateur » gratuit À VIE** (nominatif, non transférable, plafond 15, tous plans ≤ Patrimoine) · **Offre de lancement retenue : tarif garanti à vie pour tout abonnement 2026** (prix bloqué, zéro démarque — l'essai 30 j fait le dérisquage) · l'« early bird −50 % / 100 premiers » du plan d'avril est **écarté** (jamais validé par Didier, trop cher, ancre un prix cassé) | Statut Fondateur + verrou tarifaire cohorte 2026 à intégrer au CDC PLANS-QUOTAS-ESSAI |
| **Cogestion — FIGÉE 19/08 soir** | **1 co-gestionnaire inclus dans tout plan payant** · sièges supplémentaires **2,99 €/mois** · **gratuit si le co-gestionnaire a son propre compte payant ≥ Investisseur (9,90 €)** | Boucle virale interne aux SCI (chaque associé est poussé à avoir son compte). À intégrer au CDC PLANS-QUOTAS-ESSAI (gating des sièges) |
| **Essai + parrainage + apporteurs — FIGÉS 19/08 soir** | **Essai 30 jours** toutes fonctions, **sans carte bancaire**, retombée automatique sur le plan Gratuit à J+30 (aucune donnée perdue) · **Parrainage client** : 1 mois offert au parrain par filleul devenu payant (cumulable) + 1 mois au filleul · **Apporteurs d'affaires : commission 30 % de la 1re année** (sur encaissé, paiement trimestriel sur facture, minimum 50 €, contrat simple SANS mandat) — **2 volets** : commission (CGP, vendeurs de biens, agents — SIREN requis) OU avantage 100 % reversé au client (notaire, expert-comptable : 6 mois offerts au filleul) · filleul d'un prescripteur : 3 mois offerts (remplace l'essai) | Contrat type apporteur à ajouter au forfait avocat. ⚠️ **Chantier app requis avant lancement : PLANS-QUOTAS-ESSAI** (l'app n'a aucune notion de plan aujourd'hui) — CDC à écrire : matrice de gating (Gratuit = bail + quittance + EDL, 1 lot ; import/Finances/signature = payant), état d'essai, retombée Gratuit, webhooks Stripe, application côté serveur (RLS) pas seulement UI |
| **Pricing — GRILLE FIGÉE 19/08** | **Gratuit** (1 lot, documents : bail + EDL + quittance, PDF illimités — objectif = faire du flux) · **Essentiel 2,99 €/mois** (1 lot, tout Propryo) · **Investisseur 9,90 €/mois** (jusqu'à **5 lots** — arbitrage Didier vs les 10 du BP d'avril, aligné sur la structure du marché : Smartloc 2-4, Qalimo 2-6, BailFacile 1-5) · **Patrimoine 19,90 €/mois** (jusqu'à 30 lots + **partage SCI multi-utilisateurs**) · au-delà de 30 / agences : « nous contacter ». **Annuel = 2 mois offerts** : 29 € / 99 € / 199 € | La page Tarifs raconte le 19,90 comme « SCI/Patrimoine + partage », pas « le 6e lot coûte 10 € ». Prix concurrents re-vérifiés à l'étape 4 (données d'avril) |

## 2. Étapes (ordre validé)

| # | Étape | Qui | Quand | Dépend de |
|---|---|---|---|---|
| 1 | Achat `propryo.fr` (+ `.com` si dispo) | Didier | avant 31/08 | — |
| 2 | RDV comptable → confirmation AE, immatriculation | Didier | début sept. | — |
| 3 | Branchement Resend sur le domaine (confirmation d'inscription + emails transactionnels) — chantier code | pilotage | sept. | 1 |
| 4 | Site `propryo.fr` : landing (base mockup `mockups/golden-circle-landing/`) + Tarifs + FAQ + mentions légales · app sur `app.propryo.fr` (CNAME, chantier dédié : PWA/service worker + redirect auth Supabase suivent le domaine) | pilotage | sept. | 1, grille tarifaire |
| 5 | Légal & RGPD : CGU, CGV, politique de confidentialité, registre, DPA Supabase/Resend (~3 000 € avocat). Plus lourd que le BP d'avril : on héberge désormais des données de tiers (locataires, candidats + pièces) | Didier (avocat) + pilotage (textes in-app) | contact début sept. | 2 |
| 6 | Bêta privée 10-30 testeurs (allowlist admin livrée v15.406, brief `docs/marketing/`) | Didier + pilotage | sept. | 3, 5 minimum vital, smokes en attente, E2E partage Didier↔Marion |
| 7 | Paiement Stripe branché + support (Crisp) + monitoring (Sentry, cf [PROD-MONITORING-CI](../subjects/PROD-MONITORING-CI.md)) + analytics (Plausible) | pilotage | fin sept.-oct. | 2, grille figée |
| 8 | **Lancement public ~14/10/2026** | Didier | octobre | 1-7 |
| 9 | Réécriture du business plan « présentation » | pilotage | dès grille figée | grille tarifaire |

## 3. Réécriture du BP — ce qui change vs avril 2026

1. **Rebrand Propryo** + WHY = la simplicité (« gérer son parc doit être simple et ne pas me donner un deuxième métier »), pas la 2044.
2. **Architecture réelle** : Supabase EU multi-tenant (RLS) — la section « aucune donnée chez nous / Drive » est fausse et la posture RGPD est à réécrire (on héberge, y compris des données de tiers).
3. **Différenciants réels absents du BP** : signature du bail à distance par relais (en prod), OTP email (construit, inerte), fil rouge import d'acte notarié → création du bien, partage SCI multi-utilisateurs **en V1** (le BP le classait V2-2027).
4. **Roadmap recalée** : V1 light 31/08 → bêta sept. → lancement ~14/10. Le plan Q2/Q3 d'avril est obsolète.
5. **Projections rebasées** sur la grille tarifaire validée et la date de lancement réelle (ajout du palier 2,99 € : recalcul de l'ARPU pondéré).

## 4. Points ouverts

- [x] ~~Grille tarifaire détaillée~~ — **FIGÉE 19/08** (cf tableau §1).
- [ ] Confirmation AE par le comptable (seuils micro/franchise TVA à jour — les seuils ont bougé en 2025, à faire vérifier par le comptable).
- [ ] Format présentable du BP (deck/PDF) — le dossier source est [BIZPLAN-PROPRYO.md](BIZPLAN-PROPRYO.md) (livré 19/08, remplace BIZPLAN.md d'avril) ; version présentation à produire sur demande.

## 5. Notes de risque

- **TVA au changement de statut** : les prix affichés en franchise de TVA sont « tout compris ». À la bascule SASU assujettie, 9,90 € affiché contiendra ~1,65 € de TVA → marge −17 % ou hausse de prix. À anticiper dans les CGV (prix « TTC le cas échéant »).
- **Délais incompressibles** : vérification DNS/DKIM (24-72 h), avocat (2-4 semaines), immatriculation AE (quelques jours). D'où le lancement des étapes 1-2-5 en parallèle dès maintenant.
