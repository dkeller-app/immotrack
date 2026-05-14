# Audit technique — Stack SaaS V2 ImmoTrack

> **Auteur** : Architecte logiciel senior (audit indépendant)
> **Date** : 2026-05-14
> **Contexte** : passage d'un monolithe vanilla JS ~33k lignes (single-user, localStorage + Drive sync) à un SaaS multi-tenant FR ciblant bailleurs Solo / Gestionnaires Hoguet / Pro.
> **Effort dispo** : ~230 h sur 5–6 mois, dev solo, marges serrées.
> **Note sur les sources** : WebSearch a été refusé dans cet environnement. Les sources directement consultées sont citées (`nextjs.org/blog`, `vercel.com/docs/limits` — données récupérées le 2026-05-14). Le reste s'appuie sur les release notes publiques et l'état de l'art au Q1 2026. Les chiffres « marché » sont annotés comme estimations quand non sourcés.

---

## 1. Verdict en une page (TL;DR)

| Question | Réponse courte |
|---|---|
| La stack proposée est-elle viable ? | **Oui, mais avec 4 ajustements obligatoires** (cf. §7). |
| Tient-elle 100 tenants payants ? | Oui, sans modification majeure. |
| Tient-elle 500 tenants payants ? | Oui, si RLS bien indexé + monitoring requêtes. |
| Tient-elle 5 000 tenants payants ? | **Non sans refonte partielle** : DB sharding ou passage à un compute dédié (RDS / pgEdge / Aurora), sortie de Vercel Hobby/Pro vers Pro+ ou self-host. |
| Effort réaliste de migration vs 230 h ? | **Big-bang impossible. Strangler fig recommandé sur 6–9 mois, ~350–450 h** — il y a 120 h de sous-estimation systémique dans le plan initial. |
| Top 3 risques | (1) RLS Postgres sur jointures profondes à 5k+ tenants ; (2) Vercel cold-start + lock-in pricing ; (3) DPA US (Clerk, Vercel, Resend, PostHog) qui s'empilent et fragilisent la posture RGPD. |
| Top 3 économies | Better Auth self-host à la place de Clerk (~85 €/mois économisés à 500 tenants) ; Resend → Brevo/Postmark EU ; PostHog Cloud EU ou self-host. |

---

## 2. Maturité 2026 de chaque brique

### 2.1 Next.js 15 App Router — **Périmé, partir directement sur Next.js 16**

**Source : `nextjs.org/blog/next-16` consulté 2026-05-14.**

Au 2026-05-14, la dernière version stable est **Next.js 16.2 (sortie 2026-03-25)**. Démarrer un projet greenfield sur **Next.js 15** en mai 2026 serait une erreur technique :

| Critère | Next.js 15 | Next.js 16.2 |
|---|---|---|
| Bundler | Turbopack beta | **Turbopack stable**, 2–5× builds, 10× HMR |
| Caching | `experimental.dynamicIO` / PPR flags | **Cache Components stable** (`"use cache"`), `updateTag()`, `refresh()` |
| React | 19.0 | **React 19.2** stable (View Transitions, `useEffectEvent`) |
| Compiler | Optionnel/experimental | **React Compiler 1.0 stable** |
| Middleware | `middleware.ts` Edge | **`proxy.ts` Node.js runtime** (plus prévisible pour SaaS) |
| Node minimum | 18.18 | 20.9 LTS |

**Recommandation** : démarrer en Next.js 16.2. Le seul argument pour rester en 15 serait un blocage de lib tierce, ce qui ne s'applique pas ici. Migration 15→16 plus tard coûterait 8–20 h pour rien.

**Point de vigilance** : Cache Components change le modèle mental (« opt-in caching » au lieu de l'implicite Next 13/14). Bien comprendre **avant** d'écrire les pages, sinon ré-architecture à mi-parcours.

### 2.2 TypeScript + Tailwind + shadcn/ui — **Solide, choix sain**

Aucune réserve. shadcn/ui (composants copy-paste, Radix UI sous-jacent) reste l'écosystème dominant React/Next en 2026 pour les SaaS B2B et a l'avantage de **ne pas être une dépendance** (le code est dans le repo, donc pas de risque de breaking change auto). Tailwind v4 (engine Rust, depuis fin 2024) est mature.

### 2.3 Next.js Server Actions + tRPC — **Choix en doublon, à arbitrer**

C'est un point que je conteste dans la stack proposée. **Server Actions ET tRPC font le même job** (typer un appel client→serveur sans REST/OpenAPI). Les utiliser ensemble crée :
- Deux conventions parallèles pour le futur Didier (lequel utiliser quand ?)
- Une dépendance tRPC inutile si Server Actions suffisent
- Une complexité de routing client (form-action vs query/mutation tRPC)

**Recommandation** :
- **Option A (préférée)** : Server Actions partout pour les mutations + simples `async` Server Components pour la lecture. Pas de tRPC. C'est la direction « officielle » Vercel/React 19 et c'est plus simple pour un solo dev.
- **Option B** : tRPC partout (si une app mobile native React Native arrive plus tard, tRPC est plus portable). Mais on perd les bénéfices App Router (cache granulaire).

Pour ImmoTrack (web + PWA, pas de mobile natif prévu), **Option A**. Économie : ~25 h sur la durée du projet (moins de plomberie).

### 2.4 PostgreSQL Neon + Drizzle + RLS — **Bon en intention, plusieurs pièges**

#### Neon

**Forces 2026** :
- Compute serverless (autoscale, scale-to-zero) → coût bas pour 0–200 tenants
- Branching (DB par PR) → DX excellente
- Région EU `eu-central-1` (Frankfurt) disponible depuis 2023, plus `eu-west` (Dublin)
- Plan Launch ~19 $/mois couvre 0,5 vCPU + 10 GB stockage, suffisant pour MVP

**Faiblesses / pièges** :
- **Cold-start de la DB compute** : 200–800 ms après idle (typiquement après 5 min). Sur un cron qui touche la DB à 4h du matin, ça passe ; sur le premier hit utilisateur après une période calme, on l'oublie souvent et on accuse Vercel.
- **Pas de Paris** : pour un argument commercial « 100 % France », c'est un manque. Frankfurt reste RGPD-OK (transferts intra-UE), mais des prospects Hoguet pointilleux peuvent demander Paris.
- **Pricing à l'échelle** : à 5 000 tenants avec compute actif H24, on quitte le serverless et on paie ~500–1 200 $/mois pour un endpoint dédié — à ce stade, **AWS RDS Postgres EU** ou **Scaleway Managed DB Paris** deviennent compétitifs et déjà éprouvés.

**Alternatives à connaître** :

| Provider | Région EU | Tarif entrée | Particularités |
|---|---|---|---|
| **Neon** | Frankfurt, Dublin | 19 $/mois | Serverless, branching, scale-to-zero |
| **Supabase** | Paris (`eu-west-3`), Frankfurt | 25 $/mois | DB + Auth + Storage + Realtime intégrés, RLS first-class |
| **Scaleway Managed Postgres** | Paris, Amsterdam | ~15 €/mois (DEV-S) | Souveraineté FR, support FR, pas serverless |
| **AWS RDS / Aurora Serverless v2 EU** | Paris, Frankfurt | ~50 $/mois min | Mature, vendor-locked AWS |
| **PlanetScale** | EU Frankfurt | 39 $/mois | **MySQL** (incompatible Drizzle/Postgres ici), pas de RLS natif |

**Recommandation Neon vs Supabase** : **Supabase mérite reconsidération sérieuse**. Pour ImmoTrack :
- **Pour Supabase** : Auth + DB + Storage + RLS dans un seul vendor EU (Paris dispo), conformité RGPD claire (BPA EU), économie de Clerk (~25 $/mois early stage). RLS est leur cœur de métier — meilleur tooling (policies UI, debug).
- **Contre Supabase** : moins de scale-to-zero magic, vendor lock-in plus marqué (auth schema), moins « cool » dans la com mais plus pragmatique.

Pour un dev solo qui doit livrer en 230 h, **Supabase réduit la surface d'intégration de 3 vendors à 1**. C'est sous-estimé dans la stack initiale.

#### Drizzle ORM

**État 2026** (basé sur tracking jusqu'à Q1 2026) :
- Pas encore de 1.0 officielle (`0.36.x` au Q1 2026), mais **API stabilisée** et largement adoptée.
- Drizzle Kit (migrations) **a connu plusieurs incidents** sur les migrations complexes (cycles FK, renames de colonnes), tracked dans GitHub issues : il faut **toujours relire le SQL généré** avant `drizzle-kit push`. Pas de migration automatique en prod sans review.
- Pas d'équivalent à Prisma Studio aussi mature (`drizzle-studio` existe mais plus rudimentaire).

**Drizzle vs Prisma 2026** :

| Critère | Drizzle | Prisma |
|---|---|---|
| Type safety | Excellent, inférence directe du schema | Excellent, génération de client |
| Perf | **2–3× plus rapide** que Prisma sur queries simples (pas de rust engine en proxy) | Améliorée mais reste +30–80 ms overhead |
| Bundle | Très léger (tree-shakeable) | Lourd (driver Rust embarqué) |
| Edge runtime | ✅ Excellent (postgres-js, neon-http) | ⚠️ Mieux qu'avant mais reste contraint |
| Migrations | DIY, SQL généré à relire | Prisma Migrate plus carré, plus opinionated |
| RLS | Manuel (rien d'aidant) | Manuel (extensions community) |
| Maturité | 0.36, breaking changes possibles | 6.x, plus stable |
| DX studio | Basique | Excellent |

**Verdict** : Drizzle est le bon choix pour un Vercel/Next 16 / Edge-friendly stack. Mais **prévoir 10–15 h de R&D migrations** pour mettre en place un workflow safe (drizzle-kit generate + review humaine + apply manuel en prod, **pas** push direct). Ne **jamais** activer `drizzle-kit push` sur prod, c'est pour le dev.

#### Row-Level Security (RLS) multi-tenant

**C'est le risque architectural #1 de la stack.** RLS est élégant pour la sécurité (impossibilité physique de leaker un tenant), mais **scale mal** sur Postgres si :
1. Les **policies utilisent des sous-requêtes** au lieu d'une comparaison directe sur une colonne indexée (`tenant_id = current_setting('app.tenant_id')::uuid`).
2. **Pas d'index composite** `(tenant_id, ...)` sur les tables chaudes (`baux`, `quittances`, `appels_loyers`).
3. Les **jointures multi-tables** ne propagent pas le filtre RLS (Postgres optimizer parfois capricieux, surtout sur les hash joins).
4. Le `SET LOCAL app.tenant_id` est oublié dans une transaction → soit erreur, soit (pire) accès no-rows silencieux.

**Plafond observé en pratique sur Postgres 16 + RLS bien fait** :
- < 1 000 tenants × 100 lots : aucune préoccupation.
- 1 000–10 000 tenants : OK si index composite systématique et `pg_stat_statements` monitoré.
- > 10 000 tenants ou queries analytics cross-tenant : RLS devient un frein. Soit on bypass RLS pour les jobs admin (rôle `superadmin` avec `BYPASSRLS`), soit on shard.

**Recommandation impérative** :
- Décider dès le début si **toutes** les tables ont une colonne `tenant_id` (modèle « shared schema ») ou si on sépare par schema/DB (modèle « bridge » / « silo »). Pour 100–5 000 tenants Solo/Gestionnaire, **shared schema + tenant_id + RLS** est le bon défaut.
- Écrire les policies avec **fonction `STABLE`** wrappant `current_setting()` pour permettre au planner de cacher.
- Mettre en place dès le sprint 1 un **test d'isolation tenant** automatisé en CI : « user A ne peut jamais voir bail de tenant B » sur chaque endpoint.

### 2.5 Auth : Clerk vs Better Auth — **Clerk est trop cher trop tôt, et c'est un risque RGPD**

#### Clerk

- Hébergement principal aux **US**. Data residency EU disponible **uniquement sur le plan Enterprise** (sans tarif public, négocié — typiquement 250–2 000 €/mois selon le volume).
- Sur les plans Pro/Free, les données utilisateurs (emails, tokens, sessions, métadonnées) **transitent et résident aux US**.
- DPA disponible, conformité Data Privacy Framework (DPF) US-EU **mais** : 
  - Le DPF est attaqué juridiquement (Schrems III en cours), précédent défavorable possible.
  - Pour des **données de bailleurs FR avec IBAN, infos locataires**, un DPO peut refuser. C'est exactement la cible Hoguet (gestionnaires pro avec OBLIGATION RGPD stricte).
- **Coût** : ~25 $/mois jusqu'à 10 000 MAU puis $0.02/MAU. Pour 5 000 tenants actifs ≈ 100–300 $/mois (acceptable mais évitable).

#### Better Auth

État Q1 2026 (release 1.0 atteinte fin 2025, ~30k stars GitHub) :
- **Self-hosted**, donc 100 % EU si la DB est EU.
- Schema posé dans **votre Postgres** (excellent : un seul DPA, celui du provider DB).
- Multi-tenant orgs natif, plugins MFA/passkeys/social, bcrypt/argon2.
- Plus jeune que NextAuth/Auth.js mais a dépassé en DX et en cadence de release.
- Très bien intégré avec Drizzle + Next 16.

**Coût** : 0 €. Effort d'intégration : **comparable à Clerk** (~15–25 h) sur une stack Drizzle, car Better Auth utilise vos tables.

#### Comparatif

| Critère | Clerk Pro | Better Auth self-host |
|---|---|---|
| Coût @ 500 tenants | ~25–100 $/mois | 0 € (réutilise Postgres) |
| Data residency EU | Enterprise only | ✅ natif (votre DB) |
| DPA chain | Clerk + Vercel + Neon | Neon (ou Supabase) seul |
| MFA, passkeys, social | ✅ inclus | ✅ inclus |
| Org / multi-tenant | ✅ first-class | ✅ first-class |
| UI ready-made (sign-in, profile) | ✅ excellent (gain temps initial) | ⚠️ à composer avec shadcn/ui |
| Lock-in | Fort (migration douloureuse) | Faible (votre schema) |
| Maturité | Très haute | 1.0 stable, communauté active |

**Recommandation forte** : **Better Auth**, sauf si la priorité absolue est de gagner les 15 h initiales sur les composants UI sign-in (Clerk fait gagner ~10–15 h sur le bootstrap mais coûte sur tout le reste). Pour le profil commercial Hoguet (RGPD non négociable), **Better Auth est la bonne réponse**.

Alternative médiane : **Supabase Auth** (si on prend Supabase pour la DB), équivalent fonctionnel à Better Auth + UI hostée optionnelle.

### 2.6 Vercel hosting EU edge — **OK pour MVP, frein à terme**

**Source : `vercel.com/docs/limits` consulté 2026-05-14.**

**Forces** :
- Déploiement zero-config, preview deploys, DX inégalée.
- Région EU disponible (`fra1` Frankfurt, `cdg1` Paris).
- Fluid compute (depuis 2025) règle une partie des problèmes de cold-start sur Functions.

**Faiblesses chiffrées (depuis vercel.com/docs/limits)** :
- **Function max duration Hobby** : 60 s. **Pro** : 300 s. → OK pour 99 % des cas mais **génération PDF lourde de bail (40 pages avec signatures + flatten) peut dépasser 60 s** en charge. À tester.
- **Hobby** : 1 build concurrent, 100 GB transfer/mois. **Pro** : 12 concurrent, 1 TB transfer/mois, puis facturation à l'usage.
- **Pro** : invocations Function 0,60 $/M au-dessus de 1M offert. Pour un SaaS qui fait ~30 req/lot/mois × 5 000 lots × 500 tenants = ~75M invocations/mois → **~45 $/mois invocations seules** (gérable).
- **WebSockets non supportés en natif sur Vercel Functions.** Si une feature realtime (push notif quittance arrivée, sync multi-device) devient prioritaire, il faut un service tiers (Pusher, Ably, Supabase Realtime).
- **Logs runtime** : 1 h Hobby, 1 jour Pro, 3 jours Enterprise. **Pour un SaaS B2B en compliance, c'est trop court** — il faut un log drain vers Sentry/Datadog/Better Stack (coût additionnel ~10–30 $/mois).
- **Lock-in** : Vercel facture la « Fast Data Transfer » et les « Edge Requests » en plus du compute. À 5 000 tenants, attendre **300–800 €/mois Vercel seul**. Plan B (Cloudflare Pages + Hyperdrive, ou self-host sur Hetzner avec Coolify) doit être prévu dès le départ — pas migré dans la panique.

**Recommandation** :
- MVP → 100 tenants : Vercel Pro (20 $/mois + usage).
- 100–1 000 tenants : Vercel Pro avec monitoring serré du surcoût Fast Data Transfer.
- 1 000+ tenants : **arbitrer Vercel Pro+ vs Cloudflare Workers/Pages vs self-host**. Coût Vercel devient le 2e ou 3e poste après bancaire Bridge.

### 2.7 Email transactionnel : Resend — **À substituer**

**Resend est US-hosted.** Pour un SaaS FR avec données personnelles dans les emails (quittances avec adresse locataire, infos bail), c'est un sous-traitant US de plus. Le DPF couvre mais c'est encore une chaîne fragile.

**Alternatives EU** :

| Provider | Région | Tarif entrée | Notes |
|---|---|---|---|
| **Brevo** (ex-Sendinblue) | FR (Paris HQ) | 9 €/mois 20k emails | API correcte, conformité native FR |
| **Postmark** | US/EU available | 15 $/mois 10k emails | DX excellente, EU region payante |
| **Mailjet** | FR/EU | 17 €/mois 15k emails | FR, mais DX moins moderne |
| **OVH Email Pro / Scaleway Transactional Email** | FR | À l'usage | Souveraineté max, DX limitée |

**Recommandation** : **Brevo** pour le pragmatisme FR (interface FR, support FR, conformité native, prix imbattable au MVP). Resend reste joli en DX mais ne vaut pas le risque DPA.

### 2.8 Queue / Cron — **OK avec une réserve**

Vercel Cron (jusqu'à 100 crons/projet sur tous les plans) + Upstash Redis (Frankfurt EU) pour les jobs queue/dedup → c'est l'archi standard 2026.

**Réserve** : Upstash est basé aux US (HQ) mais leurs régions de données sont EU. DPA disponible. C'est acceptable. Alternative souveraine : **Redis sur Scaleway Paris** (~10 €/mois) si on veut éviter encore un vendor US dans la chaîne.

Pour les **jobs longs** (génération PDF bail, OCR pièces locataires, sync Bridge bancaire) : Vercel Functions à 300 s peuvent suffire **au début**, mais prévoir un **worker dédié hors-Vercel** dès 500 tenants (BullMQ + Redis sur un petit VPS Hetzner à 5 €/mois, ou Inngest/Trigger.dev en SaaS si on veut zéro ops).

### 2.9 Paiements SaaS : Stripe + Stripe Billing — **OK, aucune réserve**

Standard incontesté. Stripe Ireland (Dublin) couvre l'EU avec DPA, factures EU-compliantes. Stripe Tax gère la TVA FR automatiquement. Coût ~1.5 % + 0.25 € / transaction. Pas d'alternative crédible à ce stade pour un solo dev FR.

### 2.10 Intégration bancaire DSP2 : Bridge (Powens) — **OK mais cher pour MVP**

- Bridge (Powens, acteur FR) ~150 €/mois entrée + frais variables → **réservé au plan Pro 50+ lots** dans la grille tarifaire.
- Pour le plan Solo (1–3 lots) et le plan Gestionnaire (10–50 lots), la fonctionnalité « rapprochement bancaire auto » n'est pas indispensable à V2 → la sortir du périmètre MVP fait économiser 150 € × 6 mois = 900 € de runway.
- Alternative : **GoCardless Open Banking** (UK/EU) pour le débit SEPA + lecture compte, ~même prix, écosystème plus européen.
- **Recommandation** : Bridge en feature flag « Pro only » et retardé jusqu'à 50 tenants payants. Ne pas câbler avant.

### 2.11 Signature électronique eIDAS : Yousign — **OK, leader FR**

Yousign (FR) — eIDAS Advanced + Qualified disponibles, conformité native FR. ~25 €/mois entrée. Pas d'alternative aussi bien positionnée FR + dev solo (DocuSign trop cher, DocuSeal self-host pas eIDAS-qualified).

À mettre en feature flag « Pro » également (signature locataire = différenciant payant).

### 2.12 Monorepo : Turborepo — **Probablement inutile pour ce projet**

Turborepo n'a de sens que si vous avez **plusieurs apps/packages** réutilisables (app web + app mobile + landing + admin). Pour ImmoTrack à 230 h, vous aurez **une seule app Next.js**. Turborepo ajoute de la complexité (rootless, remote cache, build configs).

**Recommandation** : **un seul repo Next.js**, sans Turborepo. Si plus tard une seconde app arrive, ajouter Turborepo prend 1 journée. Économie : ~5–8 h de bootstrap + zéro friction sur le solo workflow.

### 2.13 Monitoring : Sentry + PostHog — **OK avec optimisations**

- **Sentry EU** (région `de`) disponible depuis 2022, DPA EU, conforme. Plan Team ~26 $/mois.
- **PostHog Cloud EU** (Frankfurt) ou PostHog self-host (excellent pour souveraineté). Plan Cloud EU ~0$/mois jusqu'à 1M events, puis 0.000248 $/event. Pour 500 tenants × 5 events/jour ≈ 75k events/mois → gratuit.

Recommandation **PostHog self-host** quand on atteindra 1M events/mois (~5 000 tenants actifs), sinon Cloud EU est très bien.

### 2.14 Chiffrement IBAN : pgsodium — **Trop confidentiel, alternative recommandée**

**pgsodium** est une extension Postgres pour chiffrement transparent (Transparent Column Encryption). Faiblesses 2026 :
- Maintenance limitée (le mainteneur principal a réduit son activité fin 2024).
- Supabase qui en était sponsor a annoncé fin 2024 son **passage à Vault + pgcrypto** pour les nouvelles installations.
- Compatibilité Neon : pgsodium **n'est pas dans la liste des extensions supportées par Neon** (à reconfirmer, mais c'était le cas Q4 2025).

**Alternative recommandée** :
- **Application-level encryption** avec libsodium (Node) ou Web Crypto API : on chiffre l'IBAN côté Node avant insert, KMS-géré (clé maître stockée dans Vercel Env vars ou AWS KMS / Scaleway KMS). Pattern simple, audité, portable entre providers DB.
- Stocker IBAN comme `BYTEA` (ciphertext + nonce) + un index sur un hash HMAC séparé si recherche par IBAN nécessaire.

Coût : 0 €. Effort : ~6–10 h pour faire un wrapper propre + rotation de clé documentée.

---

## 3. Points de blocage techniques identifiés

### Bloc 1 — Conformité RGPD : chaîne de sous-traitants US

**État de la stack initiale** :

| Brique | Hébergement par défaut | EU compliant ? |
|---|---|---|
| Vercel | US/EU edge mais control plane US | Partiel (DPF) |
| Clerk Pro | US | DPF, mais data US |
| Neon | EU si choisi (Frankfurt) | ✅ |
| Resend | US | DPF |
| Upstash | EU si choisi | ✅ |
| Stripe Ireland | EU | ✅ |
| Yousign | FR | ✅ |
| Sentry | EU si choisi | ✅ |
| PostHog | EU si choisi | ✅ |

**Problème** : pour un argument commercial « 100 % FR/EU souverain » (Hoguet, mairie, GLI), vous avez **3 maillons US** (Vercel, Clerk, Resend). Le DPF tient juridiquement aujourd'hui (mai 2026) mais reste sous menace Schrems III.

**Recommandation produit/legal** :
- Communiquer « EU-resident data » (vrai) plutôt que « 100 % souverain » (faux).
- Substitutions souveraines pour l'argument fort Hoguet : **Brevo** au lieu de Resend, **Better Auth** au lieu de Clerk → reste Vercel comme seul maillon US (contrôle plane).
- Documenter un **registre RGPD** (registre des traitements + sous-traitants) dès le sprint 1, pas en fin.

### Bloc 2 — RLS Postgres à l'échelle

Voir §2.4. Risque réel à partir de 1 000–10 000 tenants si non préparé. Solutions :
- Index composite `(tenant_id, …)` systématique sur toutes les tables.
- Audit `EXPLAIN ANALYZE` en CI sur les 20 queries chaudes.
- Plan B documenté : passer à 1 schema/tenant si > 5 000 tenants Pro (peu probable).

### Bloc 3 — Vercel cold-start

Fluid compute (2025) a réduit le problème mais pas éliminé. **Première requête après idle peut prendre 800 ms–2 s.** Pour un SaaS B2B où le bailleur ouvre l'app 2× par semaine, c'est perçu comme « l'app est lente ». 

**Mitigations** :
- Cron de keep-warm (cher en invocations, ~5 $/mois) → ne couvre que les routes critiques.
- Cache statique agressif pour le dashboard (Cache Components Next 16 aide).
- Edge runtime pour les routes lecture pure → 50–150 ms cold-start au lieu de 800 ms.

### Bloc 4 — Drizzle migrations en prod

Pas un blocage si discipline. Workflow obligatoire :
1. Local : `drizzle-kit generate` → SQL dans `/migrations`
2. Review humaine du SQL généré
3. Commit
4. CI : applique sur DB de staging
5. Manuel : `drizzle-kit migrate` sur prod après tests sur staging

**Jamais `drizzle-kit push` sur prod.** Mettre un guard dans `package.json` (script de prod ne contient pas `push`).

### Bloc 5 — Clerk DPA EU

Si vous gardez Clerk : **demander explicitement DPA EU + SCCs (Standard Contractual Clauses)** avant le premier client Hoguet. Si refus ou plan Enterprise required → bascule vers Better Auth (cf. §2.5). Anticiper, pas réagir.

### Bloc 6 — pgsodium maturité

Voir §2.14. **Substituer par application-level encryption.**

---

## 4. Risques de scaling chiffrés

| Métrique | 100 tenants | 500 tenants | 5 000 tenants |
|---|---|---|---|
| **Coût infra mensuel** estimé | ~100 € (sans Bridge) / 250 € (avec) | ~250 € / 400 € | **~800–1 500 €** / 1 000–1 700 € |
| **Goulot DB** | Aucun | RLS à surveiller, index OK | RLS jointures lourdes — plan B |
| **Goulot Vercel** | Aucun | Fast Data Transfer monte | **Surcoût net 300–600 €/mois** |
| **Goulot Bridge** | NA (feature flag) | NA si <50 utilisations | 150 € + variable, OK |
| **Goulot Clerk Pro** | OK | OK | 100 $/mois MAU, OK |
| **Risque migration** | Faible | Modéré | **Élevé : refonte DB sharding probable** |

**Conclusion scaling** :
- **0–500 tenants** : stack OK telle quelle (avec ajustements §7).
- **500–2 000 tenants** : stack OK si Better Auth + monitoring serré + log drain externe.
- **2 000–5 000 tenants** : **migration partielle obligatoire** — soit Postgres dédié (Aurora, RDS, Scaleway), soit sortie de Vercel, soit les deux. À planifier dès qu'on atteint 1 500 tenants.
- **> 5 000 tenants** : architecture cible probable : Cloudflare Pages/Workers EU + Postgres Aurora EU + Better Auth + queue dédiée Inngest.

---

## 5. Stratégie de migration depuis le monolithe vanilla JS

### 5.1 Trois options évaluées

| Option | Effort | Risque | Délai live |
|---|---|---|---|
| **Big-bang** (réécriture complète, migration data en un coup) | 350–500 h | **Élevé** : impossible de tester en prod incrémentalement | 6–9 mois |
| **Strangler fig** (V2 nouvelle app, V1 reste en parallèle, migration tenant-par-tenant) | 300–400 h | **Modéré** : double maintien temporaire, mais retour arrière possible | MVP 4 mois, full 9 mois |
| **From scratch sans import** (V2 part vide, V1 abandonnée) | 250–350 h | **Faible techniquement, élevé business** : perte des données existantes utilisateurs | 4 mois |

### 5.2 Recommandation : **Strangler fig avec import opt-in**

**Justification** :
- ImmoTrack V1 a un seul utilisateur réel à ce jour (Didier). Le risque « perte d'utilisateurs » est nul.
- **Mais** la V1 est productive et contient des données réelles validées par l'usage. C'est précieux pour qualifier la V2.
- Le strangler fig permet d'extraire **un module à la fois** (Bail → Quittances → Charges → Dashboard) plutôt que tout réécrire.

### 5.3 Plan de migration ImmoTrack V1 → V2

**Phase 0 — Setup (40 h)**
- Next.js 16 + Drizzle + Postgres EU + Better Auth + Stripe sandbox
- shadcn/ui setup, layout principal
- CI Vitest (réutilise les 713 tests existants comme spec test bed)
- Schema DB : design des 8–12 tables core (`tenants`, `users`, `entites`, `lots`, `baux`, `quittances`, `appels_loyers`, `versements`, `documents`, `audit_log`)

**Phase 1 — Import V1 (30 h)**
- Endpoint d'import `/migrate/import` qui accepte le **JSON localStorage V1** et le mappe vers les tables V2.
- Réutilisation des fixtures Vitest comme cas test d'import.
- Tool CLI Node : `npm run migrate:from-v1 -- input.json` pour le développeur.
- **Phase 1 ne propose pas d'UI**, c'est un outil interne pour bootstrap les 1–3 premiers clients.

**Phase 2 — Module Bail (60 h)**
- CRUD bail + types meublé/garage/mobilité/étudiant
- Génération document Word/PDF (réutiliser l'existant V1 ou repartir natif Next + PDF.js / pdf-lib)
- Tests bail E2E avec Playwright

**Phase 3 — Module Quittances + Versements (40 h)**

**Phase 4 — Dashboard V2 (réutilisation des mockups existants) (40 h)**
- Réutiliser les phases dashboard V1 (`project_immotrack.md`)

**Phase 5 — Multi-tenant + billing (40 h)**
- Stripe checkout + portal
- RLS policies sur toutes les tables
- Test d'isolation tenant en CI

**Phase 6 — Onboarding + landing + docs (30 h)**
- Page marketing FR (Next 16 static)
- Onboarding flow (création entité, premier lot, premier bail)
- Aide en ligne

**Phase 7 — Beta + premiers clients (30 h)**
- Yousign signature
- Brevo emails transactionnels
- Sentry alerting
- Plan Gestionnaire/Pro features (signature, multi-utilisateurs)

**Total réaliste : ~310 h sans Bridge, ~350 h avec.**

### 5.4 Confrontation avec les 230 h disponibles

Le budget **230 h est insuffisant de ~30–50 %** pour un V2 sérieux multi-tenant. Trois leviers pour cadrer :

| Levier | Économie |
|---|---|
| Sortir Bridge bancaire de V2 → V2.5 | -40 h |
| Sortir Yousign de V2 → V2.5 | -15 h |
| Sortir Turborepo | -8 h |
| Server Actions only (pas tRPC) | -25 h |
| Better Auth au lieu de double-config Clerk EU | ~~0~~ (équivalent en effort, gain en posture RGPD) |
| Pas de PWA offline V2 (V1 le fait, mais V2 SaaS peut être online-only au début) | -20 h |
| MVP avec 1 type de bail (nu) au lieu des 5 | -25 h |

**Total économie possible : ~133 h** → projet rentre dans 230 h **si** on accepte ces coupes.

**Mon arbitrage de senior** :
- **À garder absolument** : Bail nu + meublé (les 2 obligatoires), Quittances, Dashboard, Multi-tenant + Stripe, Brevo emails, RLS, Better Auth, tests d'isolation.
- **À reporter V2.5** : Bail mobilité/étudiant/garage, Bridge bancaire, Yousign, PWA offline, PostHog avancé, observability monitoring.
- **À supprimer** : Turborepo, tRPC (Server Actions only), pgsodium (app-level encryption à la place).

**Budget cible avec ces arbitrages : 240–260 h.** Reste +10–30 h hors-budget, à absorber sur les semaines tampon. C'est tendu mais réaliste.

---

## 6. Tableau comparatif synthèse stack initiale vs stack auditée

| Brique | Stack initiale | Stack auditée recommandée | Économie / Bénéfice |
|---|---|---|---|
| Framework | Next.js 15 | **Next.js 16.2** | Stabilité, perf, pas de migration ultérieure |
| Backend API | Server Actions + tRPC | **Server Actions only** | -25 h, simplicité |
| ORM | Drizzle | Drizzle ✅ | OK (avec workflow migrations strict) |
| DB | Neon EU | **Supabase EU Paris OU Neon EU** | Supabase = 1 vendor de moins ; Neon = scale-to-zero |
| Multi-tenant | RLS | RLS ✅ avec index composite + tests CI | OK avec discipline |
| Auth | Clerk | **Better Auth self-host** | -25 à -100 €/mois selon scale, RGPD meilleur |
| Chiffrement IBAN | pgsodium | **Application-level (libsodium + KMS)** | Portable, mature, indépendant DB |
| Hosting | Vercel EU | Vercel EU ✅ (avec plan B Cloudflare documenté) | OK avec vigilance coûts |
| Email | Resend | **Brevo** | -50 % coût, FR-souverain |
| Queue/Cron | Vercel Cron + Upstash | Vercel Cron + Upstash ✅ (ou Scaleway Redis) | OK |
| Paiements | Stripe | Stripe ✅ | OK |
| Bancaire DSP2 | Bridge ~150 €/mois | **Différé V2.5, feature flag Pro** | -900 € sur 6 mois |
| Signature | Yousign | **Différé V2.5, feature flag Pro** | -150 € sur 6 mois |
| Monorepo | Turborepo | **Aucun (single repo)** | -8 h |
| Monitoring | Sentry + PostHog | Sentry EU + PostHog Cloud EU | OK |

**Steady state coût V2 MVP (100 tenants payants)** :
- Stack initiale : ~250 €/mois (sans Bridge) → ~400 €/mois (avec)
- Stack auditée : **~120 €/mois (sans Bridge)** → ~270 €/mois (avec, mais Bridge retardé)
- **Économie : ~130 €/mois de runway pendant la phase fragile 0–500 tenants** (= 780 € sur 6 mois).

---

## 7. Recommandations finales

### 7.1 Stack cible recommandée

1. **Frontend** : Next.js **16.2** + TypeScript + Tailwind v4 + shadcn/ui
2. **Backend** : Next.js Server Actions (PAS tRPC, PAS Turborepo)
3. **DB** : **Supabase EU Paris** (préféré pour solo dev) ou Neon EU Frankfurt (préféré pour scale-to-zero) + Drizzle ORM + RLS avec index composite tenant_id
4. **Auth** : **Better Auth self-host** (table dans Postgres) — Clerk seulement si vous ne pouvez vraiment pas budgéter les 15 h supplémentaires UI
5. **Hosting** : Vercel Pro EU + log drain vers Sentry, plan B Cloudflare Pages documenté
6. **Email** : **Brevo** (FR)
7. **Queue/Cron** : Vercel Cron + Upstash Redis EU
8. **Paiements** : Stripe + Stripe Billing
9. **Bancaire** : **Bridge en feature flag Pro, retardé V2.5**
10. **Signature** : **Yousign en feature flag Pro, retardé V2.5**
11. **Chiffrement IBAN** : **app-level libsodium + KMS**, pas pgsodium
12. **Monitoring** : Sentry EU + PostHog Cloud EU

### 7.2 Modifications critiques à appliquer dès le sprint 1

1. **Démarrer en Next.js 16.2**, pas 15.
2. **Choisir Auth dès le bootstrap** (Better Auth) — pas de prototype Clerk « on verra plus tard ».
3. **Schema DB avec `tenant_id` partout** dès la première table, RLS activé immédiatement.
4. **Test d'isolation tenant en CI** (Vitest ou Playwright) **avant** le premier code métier.
5. **Wrapper KMS pour chiffrement** créé sprint 1, pas en fin.
6. **Registre RGPD** (notion / google docs / md dans le repo) tenu en parallèle, pas en rattrapage.

### 7.3 Verdict final

| Question | Réponse |
|---|---|
| Stack viable pour 100 tenants ? | **Oui** avec stack auditée. Stack initiale OK mais sous-optimale. |
| Stack viable pour 500 tenants ? | **Oui** avec stack auditée + monitoring serré + audit RLS @ 300 tenants. |
| Stack viable pour 5 000 tenants ? | **Oui avec refactor partiel** (DB dédiée + arbitrage Vercel) qu'il faut planifier dès 1 500 tenants. Pas un blocage architectural, juste une étape de scaling normale. |
| Coût initial sous-estimé ? | Oui : ~125 €/mois steady state estimé devient ~120 €/mois avec stack auditée (économie Clerk/Resend compense Supabase) — **mais Vercel Pro à 20 $/mois fait monter à ~140 €/mois dès qu'on dépasse Hobby**, ce qui sera immédiat avec un SaaS. |
| Effort 230 h réaliste ? | **Non, 310–350 h sans coupes.** Avec coupes recommandées (Bridge/Yousign/PWA/types bail différés), **240–260 h** réalistes. **Communiquer dès maintenant qu'il faut soit +30 % de temps soit -30 % de scope.** |

### 7.4 Garde-fous non négociables

- ✅ **Test d'isolation tenant** en CI avant la première feature métier
- ✅ **Drizzle migrations** : workflow `generate` → review → `migrate`, jamais `push` en prod
- ✅ **Index composite `(tenant_id, ...)` sur 100 % des tables business** dès création
- ✅ **Application-level encryption IBAN** dès la première écriture en DB
- ✅ **DPA signés et archivés** pour chaque sous-traitant avant le premier client payant
- ✅ **Backup PITR DB activé** (Neon/Supabase l'incluent dans le plan payant, vérifier dès jour 1)
- ✅ **Plan B hosting (Cloudflare ou self-host) documenté** dès dépassement 500 tenants

---

## 8. Sources & limites du présent audit

### Sources directement consultées (2026-05-14)

- [Next.js 16 release notes](https://nextjs.org/blog/next-16) — Vercel, publié 2025-10-21, consulté 2026-05-14
- [Next.js blog](https://nextjs.org/blog) — confirmation Next.js 16.2 stable (2026-03-25)
- [Vercel limits documentation](https://vercel.com/docs/limits) — last_updated 2026-03-02, consulté 2026-05-14

### Sources que je n'ai pas pu valider en direct (WebSearch refusé dans l'environnement)

- Tarifs précis Neon / Supabase / Clerk / Resend / Brevo en mai 2026 → données basées sur Q1 2026, marge d'erreur ±15 %
- Releases Drizzle ORM post-Q1 2026
- Status Schrems III / DPF EU-US à fin Q1 2026
- Benchmarks RLS Postgres 16/17 à très grande échelle multi-tenant

**Pour combler ces zones d'ombre avant décision finale**, recommandation : 2–3 heures de validation tarifs directs (sites éditeurs) et une lecture de la doc Supabase RLS multi-tenant.

### Notes de méthode

- Cet audit est volontairement critique. Les choix « par défaut hype » (Clerk, Resend, Turborepo, tRPC + Server Actions) sont **bons pour un solo dev qui n'a pas de contraintes RGPD ni de budget tendu**. Ce n'est pas votre cas.
- La stack initiale n'est pas mauvaise. Elle est **optimisée pour un démo SaaS B2C US**, pas pour un SaaS immobilier B2B FR sous contrainte RGPD et budget serré. Les ajustements proposés alignent la stack avec la cible commerciale réelle.
