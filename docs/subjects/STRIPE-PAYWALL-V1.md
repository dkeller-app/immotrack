# STRIPE-PAYWALL-V1 — Monétisation V1 vanilla JS (Phase D)

> **Statut** : ⏳ Spec rédigée 2026-05-15 · Implé en attente validation Phase B mockups + freeze nav Phase C
> **Prio** : P1 (premier revenu commercial) · **Taille** : L (30-50h selon options)

---

## Contexte

Décision pivot SaaS V2 → Option B (hybride). Monétiser le V1 vanilla JS existant **avant** de réécrire en Next.js multi-tenant V2 (Q4 2027).

Référence : audit business agent ([SAAS-V2-AUDIT-BUSINESS.md](../strategie/saas-v2-audits/SAAS-V2-AUDIT-BUSINESS.md)) recommandant pricing recalibré.

## Modèle économique (proposé)

### Tier Free — 1 lot
- Toutes les features sauf les premium
- Limite : 1 logement actif
- Drive sync **incluse** (différenciant marché)
- Pas de support
- Branding "Powered by ImmoTrack" en footer
- **Conversion** : passer payant dès le 2e bien

### Tier Solo — 14,90 €/mois (ou 149 €/an, -16%)
- Logements **illimités** pour un bailleur particulier
- Toutes features V1.1 actuelles
- Support email (48h)
- Pas de branding
- **Cible** : bailleur particulier 2-10 lots, ~95% du marché B2C

### Tier Co-gestion — 19,90 €/mois (ou 199 €/an)
- Tier Solo + workaround Drive partagé officialisé pour 1-2 tiers (conjoint, expert-comptable)
- Support prioritaire email (24h)
- **Cible** : couples bailleurs, bailleurs avec expert-comptable. *Différenciant : peu de concurrents proposent ça commercialement*.

### Tier Gestionnaire — 29,90 €/user/mois (ou 299 €/user/an)
- Tier Co-gestion + Pilotage matriciel + multi-bailleurs
- Support téléphone (heures ouvrées)
- **Cible** : pros Hoguet 10-50 lots. **Premier vrai pas vers SaaS V2 multi-tenant**.
- ⚠️ **Limite V1** : multi-bailleurs simulé via Drive partagé séparés. Pour vrai multi-tenant → V2.

### Tier Pro — 89 €/user/mois (sur devis pour > 5 users)
- Tier Gestionnaire + multi-portfolios (plusieurs cabinets clients)
- API d'export comptable
- Onboarding inclus (1h visio)
- **Cible** : agences/réseaux 50+ lots. À valider en entretiens Phase E avant launch.

### Projection ARR conservateur
- 100 utilisateurs Solo = 17 880 €/an
- 30 utilisateurs Co-gestion = 7 164 €/an
- 10 utilisateurs Gestionnaire × 2 users moyen = 7 176 €/an
- 5 utilisateurs Pro × 3 users = 16 020 €/an
- **Total Year 1** : ~48 000 €/an, breakeven coûts infra à 10-15 clients

## Architecture technique V1 (vanilla JS)

### Contrainte
On reste sur vanilla JS + localStorage + Drive sync. Pas de backend serveur custom (pas de Vercel/Neon avant V2). Stripe → webhook → ? Pas de backend pour recevoir le webhook.

### Solution : Stripe Customer Portal + check JWT au chargement
Architecture la plus simple possible :

1. **Stripe Checkout direct** (côté client)
   - Bouton "Souscrire 14,90€/mois" → redirige vers `https://buy.stripe.com/...` (Payment Links Stripe)
   - Pas d'API call, pas de backend
   - Stripe gère le formulaire de carte, la 3DS, la facturation

2. **Vérification au chargement de l'app**
   - À l'auth Google OAuth (déjà existante), récupérer l'email user
   - Faire un call Stripe API depuis le client : `GET https://api.stripe.com/v1/customers?email=...` (avec clé pub Stripe)
   - **⚠️ Problème** : clé pub Stripe ne peut PAS lire les customers (que créer paiements)
   - **Solution** : utiliser un proxy minimaliste (1 cloud function Vercel/Cloudflare Worker, 10 lignes, gratuit jusqu'à 100k/mois) qui :
     - Reçoit l'email + signature Google
     - Vérifie la signature
     - Query Stripe API avec clé secrète
     - Retourne `{ tier: 'free|solo|cogest|gest|pro', validUntil: ISO }`

3. **Gating UI selon tier**
   - À l'init de l'app : check tier → set `window.USER_TIER`
   - Chaque feature premium : `if(USER_TIER === 'free') { showUpgradeModal(); return; }`
   - Hard limit : 1 lot pour Free (compte à la création du 2e)

4. **Customer Portal Stripe**
   - Bouton "Gérer mon abonnement" dans Paramètres
   - Redirige vers `https://billing.stripe.com/p/login/...` (Customer Portal Stripe)
   - Stripe gère résiliation/upgrade/factures/changement de carte
   - **Zero code à maintenir** côté ImmoTrack

### Stack
- **Stripe Payment Links** (clic-droit dans dashboard Stripe, 0€ setup)
- **Stripe Customer Portal** (clic-droit, 0€ setup)
- **1 Cloud Function** (Cloudflare Workers gratuit ou Vercel Edge gratuit) : ~30 lignes JS pour proxy auth
- **Total dev** : 30-50h estimé

## Roadmap implé Phase D

### D0 — Préparation business (3-5h)
- Créer compte Stripe (FR, KYC inclus)
- Configurer 4 produits (Solo / Co-gestion / Gestionnaire / Pro) × 2 prix (mensuel / annuel) = 8 prix
- Générer 4 Payment Links
- Activer Customer Portal
- Page CGV/CGU à rédiger (avocat NTIC) → 5-10 k€ juridique (cf. audit légal)
- Page politique de confidentialité (CNIL conforme)

### D1 — Cloud function proxy (4-6h)
- Cloudflare Worker ou Vercel Edge
- Endpoint `POST /api/check-tier`
- Reçoit token Google → vérifie signature → query Stripe → return tier
- Cache 1h en Redis Upstash (optionnel) ou KV Cloudflare
- Domaine : `api.immotrack.app` (à acquérir si pas déjà)

### D2 — Intégration côté client (8-12h)
- Au boot : `await fetchUserTier()` → `window.USER_TIER`
- Stockage tier dans `DB.user.tier` + `DB.user.tierValidUntil`
- Fallback offline : si pas de réseau, garder tier persisté (grace period 7 jours)
- Si tier expire offline → mode dégradé (lecture seule, banner upgrade)

### D3 — Gating UI features (10-15h)
- Inventaire features par tier (cf. tableau Modèle économique ci-dessus)
- Helper `_checkTier('feature', requiredTier)` :
  - Si OK → action normale
  - Si KO → modal "Cette feature nécessite un abonnement [Tier]. Souscrire ?"
- Cibles gating (V1.1 actuelles) :
  - Free : limite 1 lot
  - Solo : illimité lots, **pas** de Pilotage matriciel
  - Co-gestion : Solo + Drive partagé documenté
  - Gestionnaire : multi-bailleurs basculé + Pilotage matriciel
  - Pro : multi-portfolio simulé

### D4 — Page Tarifs + Onboarding (4-6h)
- Nouvelle page `#p-pricing` accessible depuis sidebar bottom ("Passer Premium")
- Comparatif des 4 tiers + tableau features
- CTA pour chaque tier → Stripe Payment Link
- Email automatique post-paiement (via Stripe webhook → email Resend/Brevo)

### D5 — Tests + Mise en prod (5-8h)
- Test mode Stripe (cartes test 4242 4242 4242 4242)
- Test des 4 tiers + Customer Portal
- Test fallback offline
- Beta avec 5-10 users de l'entourage avant launch public
- Monitoring Sentry pour erreurs paiement

## Effort total estimé Phase D

| Bloc | Effort | Détail |
|---|---|---|
| D0 préparation | 3-5h | Stripe + CGV + politique conf |
| D1 cloud function | 4-6h | Proxy auth + cache |
| D2 client integration | 8-12h | Boot + persistance tier |
| D3 gating features | 10-15h | Modals + check feature |
| D4 page tarifs | 4-6h | UI marketing + onboarding |
| D5 tests + prod | 5-8h | Beta + monitoring |
| **Total** | **34-52h** | sur 2-3 mois part-time |

⚠️ **Hors scope D, à prévoir séparément** :
- Avocat NTIC pour CGV/CGU/politique conf : 5-10 k€, 2-3 semaines délai
- RC Pro Cyber 1 M€ : 800-2 000 €/an
- Domaine `immotrack.app` + hosting si pas déjà : ~50 €/an

## Risques business

- **CAC élevé en B2C immo** : audit business agent → 55 €/CAC réel vs 25 € BIZPLAN. LTV 18 mois × 14,90 = 268 € → LTV/CAC = 4,8 sain mais marge serrée.
- **Concurrence asphyxiante SEO** : Rentila + BailFacile + Qalimo dominent SERP depuis 4+ ans. Stratégie : NE PAS faire de SEO en V1, miser sur bouche-à-oreille + entretiens Hoguet (Phase E) + LinkedIn organique du fondateur.
- **Risque churn** : ImmoTrack 14,90 €/mois sans contrat → résiliation 1 clic. Cibler annuel (-16%) pour locker.
- **Risque réglementaire** : tier Gestionnaire à 29,90 € touche pros Hoguet → CGU spécifiques + RC Pro obligatoire. À vérifier qu'on ne devient pas nous-mêmes sous Hoguet (audit légal agent : statut « SaaS éditeur pur » suffit si pas de mandat de gestion).

## Pré-requis avant Phase D

1. ✅ Phase A1 + A2 + A3 livrées (bugs critiques V1 résolus)
2. ⏳ Phase B mockup wahoo validé + implémenté (UX premium = ↑ conversion)
3. ⏳ Phase C nav adaptative implémentée (sidebar Solo simplifiée = ↑ rétention)
4. ⏳ Brief CGV/CGU avocat NTIC démarré (parallèle au dev D)
5. ⏳ 10 entretiens Hoguet Phase E pour valider pricing Gestionnaire 29,90 €/user

## Décisions ouvertes (à valider user)

1. **Pricing final** : 14,90 / 19,90 / 29,90 / 89 retenu ou ajustement ?
2. **Annuel -16% (12 mois pour 10) ou -20% (12 pour 9,6) ?**
3. **Free limité à 1 lot ou 2 lots ?** (2 lots = plus permissif, attire plus, mais conversion ↓)
4. **Trial 14 ou 30 jours sur tier payant ?**
5. **Stratégie launch** : soft (50 users entourage) ou hard (Product Hunt + paid ads) ?
