# Synthèse comparative — Triple audit SaaS V2

> Croisée des 3 audits (`SAAS-V2-AUDIT-TECH.md`, `SAAS-V2-AUDIT-LEGAL.md`, `SAAS-V2-AUDIT-BUSINESS.md`)
> Date : 2026-05-14
> Auteur : synthèse Claude après audits indépendants

---

## TL;DR — 1 écran

| Dimension | Verdict | Niveau d'alerte |
|---|---|---|
| **Stack technique** | OK avec 5 ajustements | 🟢 |
| **Cadre légal/RGPD** | Faisable, 14 actions obligatoires + 15-25 k€ juridique | 🟠 |
| **Viabilité business** | GO **conditionnel à pivot** B2B Hoguet + hybride V1/V2 | 🔴 |
| **Effort 230h dispo** | Insuffisant : tech dit 240-350h, business dit 600-1200h | 🔴 |
| **Différenciant marché** | "Simplicité + UX 1 écran" **ne tient pas** vs Qalimo V2 | 🔴 |
| **Recommandation finale** | Pas de pivot brutal SaaS V2 maintenant. Stratégie hybride. | 🟠 |

---

## 1. Points d'alignement total (3 agents d'accord)

### 1.1 — Clerk doit sauter
- **Légal** : Clerk USA = bloqueur Schrems II, DPA EU absent
- **Tech** : Better Auth (self-hosted EU, 0€ fixe) > Clerk
- **Business** : Clerk hidden cost à +10K MAU = 800€/mois → marge brute ruinée

→ **Décision : Better Auth (ou Supabase Auth EU)**. Non négociable.

### 1.2 — Resend doit sauter
- **Légal** : Resend = US, transferts hors-UE à justifier au cas par cas
- **Tech** : Brevo (EU pure) > Resend
- **Business** : différenciation "données EU" = argument B2B Hoguet majeur

→ **Décision : Brevo**. Non négociable.

### 1.3 — RLS Postgres viable jusqu'à ~5 000 tenants
- **Tech** : tient si discipline (index composites + tests CI multi-tenant)
- **Légal** : précédent Optical Center 250 k€ pour fuite multi-tenant → tests obligatoires
- **Business** : 5 000 tenants = MRR 100-150 k€/mois (très au-dessus de l'objectif 3 ans 580 k€ ARR)

→ **OK Neon + Drizzle + RLS**, mais investir 8-15h dans tests CI cross-tenant.

### 1.4 — Bridge/Powens en agrégation pure uniquement
- **Légal** : agrégation = pas d'agrément ACPR. Initiation virement = PSP (100-300 k€) ou EME mandataire.
- **Business** : Bridge = +0,15-0,30€/compte connecté → marge variable à modéliser
- **Tech** : OK technique mais report V2.5 recommandé (couper 30-50h)

→ **Décision : agrégation read-only, jamais initiation virement V2. Bridge reportable V2.5.**

---

## 2. Contradictions à arbitrer

### 2.1 — Effort dispo (230h) : insuffisant, mais de combien ?

| Source | Estimation | Hypothèse |
|---|---|---|
| Tech | **240-260h** (avec coupes Bridge/Yousign/PWA/bail-types V2.5) | Migration strangler fig sur monolithe existant |
| Tech | **310-350h** (plan complet) | Sans coupes |
| Business | **600-1200h** (sur 12 mois) | Inclut commercialisation, SEO, support, KYC entreprise, juridique, comptabilité, marketing |

**Écart** : facteur 2-5×. Pourquoi ?
- L'audit tech ne compte QUE le code.
- L'audit business compte code + go-to-market + acquisition + support.

→ **À trancher avec toi** : 230h = budget DEV uniquement, ou budget TOTAL (dev + marketing + support + admin) ?

### 2.2 — Pivot brutal vs stratégie hybride

| Source | Recommandation |
|---|---|
| Tech | OK pivot SaaS V2 si effort réaliste + ajustements stack |
| Légal | Faisable légalement mais 15-25 k€ + DPIA + 3-5 mois calendaires avant lancement |
| Business | **🔴 STOP**. "Stack Next.js + Clerk + Bridge détruit le différenciant n°1 (Drive sync souverain)". Recommandation : **V1 = vanilla JS + Stripe paywall + Drive optionnel (court terme) ; V2 multi-tenant ciblé Hoguet uniquement Q4 2027** |

**C'est la contradiction majeure**. Le business agent challenge le pivot lui-même, pas juste son exécution.

Arguments business contre le pivot maintenant :
- Différenciation "données chez l'utilisateur (Drive)" = argument unique vs Rentila/Qalimo
- Qalimo V2 (4,9/5 Trustpilot, automatisations centralisées, 22 tutos vidéo) écrase le pitch "simplicité"
- 230h vs 600-1200h réels → bloqué 12+ mois sans revenu
- Pendant ce temps : zéro acquisition, zéro feedback marché

Arguments pro-pivot (du brief initial) :
- Bug Drive partage tiers (Marion ne voit pas tout) = limitation dure du modèle actuel
- Multi-tenant = nécessaire pour vendre aux gestionnaires Hoguet
- 230h estimé sur 5-6 mois → si insuffisant, on reste sur V1 plus longtemps avec un V2 progressif

→ **À trancher avec toi**. Options détaillées section 4.

### 2.3 — Cible prioritaire : B2C particulier ou B2B Hoguet ?

| Source | Recommandation |
|---|---|
| Tech | Pas d'avis (technique-neutre) |
| Légal | Hoguet = SaaS éditeur pur, pas d'agrément, mais CGU spécifiques |
| Business | **B2B Hoguet = océan bleu** (10 000 cabinets 10-50 lots, peu d'outils dédiés). B2C particulier = saturé (Rentila + BailFacile + Qalimo + Excel/ChatGPT) |

→ **Recommandation forte : prioriser B2B Hoguet en V2, garder B2C en V1 sous-monétisé (paywall léger)**.

### 2.4 — Pricing

| Source | Tier Solo | Tier Gestionnaire | Tier Pro |
|---|---|---|---|
| BIZPLAN interne actuel | 9,90 € | 19,90 € | – |
| Business recommandé | **14,90 €** | **29,90 € / user** | **89 € / user** |
| Impact ARPU | +50% Solo | +50% Gest. | nouveau tier |
| ARR projeté 3 ans | 580 k€ médian | (vs 300 k€ BIZPLAN) | +93% |

→ **Décision : adopter le pricing recalibré** (sauf si test marché remet en cause).

---

## 3. Risques cachés à connaître

### Légal
- **DPIA obligatoire** (4/9 critères CNIL cochés) — 3-7 k€ DPO externe, 4-6 semaines incompressibles
- **Caution solidaire = Yousign QES** (~5€/sig) sinon annulation jurisprudentielle
- **Upload pièces locataire** doit respecter décret 2015-1437 (liste blanche) → blocage technique sinon 5 000€/cas CNIL
- **RC Pro Cyber 1 M€ obligatoire** avant 1er client payant

### Tech
- **Vercel = seul maillon US** une fois Clerk + Resend remplacés → mention "données EU" mensongère si Vercel pas en région EU
- **pgsodium maturité limite** → app-level encryption + KMS externe (AWS KMS Paris ou OVHcloud)
- **Next.js 16 stable Q2 2026** → viser direct sinon dépréciation 12 mois après V2 launch

### Business
- **Saturation SEO** : Rentila + BailFacile + Qalimo trustent les top 5 mots-clés depuis 4+ ans → CAC réel 55€ (vs 25€ BIZPLAN, ×2,2)
- **Banques en distribution gratuite** : CIC/CM/BNP poussent leurs propres outils gestion locative → risque commoditization
- **Cycle vente B2B Hoguet : 3-9 mois** → trésorerie tendue première année

---

## 4. Options de décision pour toi

### Option A — Pivot brutal SaaS V2 (plan initial)
- Stack ajustée : Next.js 16 + Better Auth + Brevo + Neon + Drizzle + Stripe + Bridge (V2.5) + Yousign (V2.5)
- Effort : 240-260h dev + 360-940h marketing/support/admin
- Cash-out : 43 k€ (15-25 k€ juridique + 18 k€ infra/outils année 1)
- Risque : 12+ mois sans revenu, différenciant marché flou
- **Verdict 3 agents** : 🟠 Tech OK, 🟠 Légal OK, 🔴 Business NON

### Option B — Hybride pragmatique (recommandation business)
**Phase 1 (Q3-Q4 2026)** : Monétiser le V1 vanilla JS existant
- Ajouter Stripe paywall light → freemium 1 lot / payant 14,90€/mois illimité
- Garder Drive sync optionnel (différenciant)
- Effort : 30-50h
- Revenus possibles dès mois 3
- Premier feedback marché réel
- Capital pour financer V2

**Phase 2 (Q4 2027)** : V2 multi-tenant ciblée Hoguet uniquement
- Stack complète Next.js + Better Auth + Neon + Bridge
- Effort : 240-260h dev quand V1 finance
- Lancement avec premiers clients gestionnaires acquis via V1 freemium
- **Verdict 3 agents** : 🟢 Tech OK, 🟢 Légal OK, 🟢 Business OK

### Option C — Pause stratégique (3 mois)
- Pas de code, pas de pivot
- Réelles validations : entretiens 10 gestionnaires Hoguet ("est-ce que vous achèteriez ça à X €/mois ?")
- Validation pricing + différenciants AVANT effort
- Coût : 0 €, mais 230h consacrées à user research
- **Verdict 3 agents** : 🟢 Tech OK, 🟢 Légal OK, 🟢 Business "même mieux que Option B au démarrage"

---

## 5. Checklist actionnable avant TOUTE ligne de code

Que tu prennes A, B ou C, ces 8 items sont des **pré-requis non négociables** :

- [ ] **1. Choisir entre A / B / C** (décision user)
- [ ] **2. Valider la stack ajustée** : Better Auth, Brevo, Next.js 16, Server Actions only (pas tRPC), app-level encryption (pas pgsodium)
- [ ] **3. Confirmer hébergement Vercel EU** (Frankfurt/Paris) ou basculer OVHcloud / Scaleway
- [ ] **4. DPIA + DPO externe** : devis 3 prestataires (3-7 k€)
- [ ] **5. RC Pro Cyber 1 M€** : devis 3 assureurs (Hiscox, AXA, Allianz) (~800-2000€/an)
- [ ] **6. CGU/CGV NTIC** : avocat spécialisé (5-10 k€)
- [ ] **7. Valider tarifs 2026** sur Neon + Brevo + Better Auth + Bridge + Stripe (2-3h direct check sites)
- [ ] **8. Entretiens 10 gestionnaires Hoguet** : confirmer pricing 29,90€/user + besoins réels (option C ou en parallèle B)

---

## 6. Ma recommandation

Si je devais voter à ta place : **Option B (hybride)** avec Option C en parallèle.

Pourquoi :
1. **Le V1 existe** : monétiser maintenant = revenu + feedback marché = financement V2
2. **Le pivot brutal détruit le différenciant Drive** sans le remplacer par mieux côté Qalimo V2
3. **230h sont précieuses** : les mettre dans V1 paywall + 10 entretiens client = ROI immédiat. Les mettre dans V2 from scratch = 12 mois sans revenu, risque concurrence
4. **Hoguet B2B est un océan bleu réel** mais ils n'achèteront PAS un produit V0 from scratch sans références. Il faut d'abord 50-100 utilisateurs V1 payants comme proof.
5. **Le bug Drive partage tiers** se règle en V1 différemment : passer Marion en mode "user invité" via Drive shared drive (pas l'app) ou "Pro" tier avec 2 users.

Schéma : V1 monétisé 12-18 mois → V2 Hoguet lancée avec traction → meilleur pari risque/reward.

---

## 7. Annexes — Liens

- `SAAS-V2-AUDIT-TECH.md` — Audit stack + migration + scaling
- `SAAS-V2-AUDIT-LEGAL.md` — RGPD + Hoguet + ALUR + DSP2 + eIDAS
- `SAAS-V2-AUDIT-BUSINESS.md` — TAM/SAM + concurrence + pricing + projections
