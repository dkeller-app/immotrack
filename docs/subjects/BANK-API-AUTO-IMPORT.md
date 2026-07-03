# BANK-API-AUTO-IMPORT — Étude décisionnelle : sync bancaire AUTOMATIQUE via API (DSP2/AISP) sur Supabase

**Status** : 📋 ÉTUDE (aucune ligne de code app) · **Prio** : P1 (post-bascule cloud) · **Taille** : XL (~45-60 h backend)
**Rédigé** : 2026-06-24 · **Demande** : note A10 (`AUDIT-FINANCES-IMPORT-2026-06-22.md`) — « connexion bancaire en DIRECT via API »
**Remplace/actualise** : `BANK-INTEGRATION.md` (étude 2026-05-13 qui supposait un Cloudflare Worker — l'angle neuf ici = **on a déjà Supabase**)
**Lié à** : BANK-INTEGRATION (V1 CSV/OFX livré) · BANK-IMPORT-V2 (walk « compléter pas à pas » v15.351) · SEPA-PRELEVEMENTS · SAAS-MULTIUSERS · `project_cloud_cutover_finition`

> ⚠️ **Cette étude est ancrée sur le code de PROD `origin/main` (v15.351)**, pas sur le clone local (241 commits en retard). Les n° de ligne cités le sont contre `origin/main`.

---

## 0. Niveau de confiance des sources (transparence)

La veille marché a été menée par recherche multi-sources + vérification adversariale (3 votes/claim). **La recherche a été interrompue par une limite de session** : une partie des prix est restée non vérifiée. Chaque affirmation ci-dessous est balisée :

- ✅ **Vérifié** (source primaire ou ≥2 sources concordantes citées)
- ⚠️ **À confirmer** (source unique/secondaire, ou vérification interrompue) → **action Phase 0**
- ❌ **Réfuté** (un point que beaucoup croient vrai mais qui est faux en 2026)

**Règle du projet respectée** : aucun prix n'est inventé. Quand le prix est « sur devis », c'est écrit tel quel.

---

## 1. Résumé décisionnel (TL;DR)

| Décision | Recommandation | Confiance |
|---|---|---|
| **Architecture** | **A — Tout-Supabase** (Edge Functions + Vault + pg_cron/webhook + Realtime). Pas de Cloudflare/Vercel. | ✅ faisabilité confirmée |
| **Agrégateur dogfood (tes comptes)** | **Enable Banking** — tier « Restricted Production » gratuit, self-serve, limité aux comptes que tu lies toi-même. | ⚠️ couverture FR + conditions à confirmer Phase 0 |
| **Agrégateur scale (5-10 bêta → SaaS)** | **Bridge/Powens** (français, ACPR, meilleure couverture FR, webhooks, **prouvé par un concurrent**) **OU** Enable Banking en production contractuelle (continuité = zéro re-intégration). Décision finale au vu des devis. | ⚠️ prix sur devis |
| **Réutilisation** | **100 % de la chaîne existante** (`_bankDedup` → `_bankMatchHeuristic` → walk → `_bankImportConfirm` → 2044). On ajoute une *source* d'alimentation, on ne refait pas l'aval. | ✅ |
| **Coffre à tokens** | Tokens OAuth en **colonne chiffrée RLS service-role-only** (ou Vault) ; **secret client de l'agrégateur en Edge Function secrets**, jamais en base ni au front. | ✅ |
| **Conformité** | Dogfood (tes comptes) = quasi zéro contrainte. Bêta/SaaS (tiers) = **arrangement agent/distributeur sous la licence du prestataire + DPA + consentement nommant le prestataire**. | ✅ cadre / ⚠️ contrat à négocier |

**Le vrai livrable de cette étude = la §7 (liste exhaustive des points manquants) + la §9 (plan par phases).**

### ✅ Décisions arbitrées 2026-06-24 (avec le user)

- [x] **Architecture = A (tout-Supabase)** — Edge Functions + Vault + pg_cron/webhook + Realtime, pas de Cloudflare/Vercel.
- [~] **Agrégateur** : Enable Banking en dogfood mais **couverture partielle** (CM+CA gratuits ; **BNP/Hello Bank absents du Control Panel** au 2026-06-24). → Scale = Bridge/Powens ou Linxo (couvrent BNP), via couche d'abstraction `BankProvider`. **Fork ouvert** : (A) dogfood gratuit partiel CM+CA + Hello Bank au passage payant, ou (B) payer dès le dogfood sur un provider couvrant BNP. À trancher.
- [ ] **Modèle de prix client = à trancher APRÈS les devis Phase 0** (bundle vs add-on Pro Connect non figé).
- [x] **Prochaine action = lancer la Phase 0** (cadrage fournisseur : comptes, couverture, devis, DPA).

---

## 2. Vulgarisation (pour décider en connaissance de cause)

Tu es dev front vanilla JS ; ces 6 mots reviennent partout, voici ce qu'ils veulent dire **concrètement pour ImmoTrack**.

- **DSP2** = la loi européenne (2018) qui dit : pour lire un compte bancaire par programme, fini le scraping, il faut passer par une API officielle et un **agrément**. On ne peut pas y couper.
- **AISP** (*Account Information Service Provider*) = le statut réglementé pour **lire** comptes + transactions. Le **PISP** (initier des **paiements**) est un autre statut — hors scope ici (ce serait pour prélever les loyers, sujet jumeau SEPA-PRELEVEMENTS).
- **Agrégateur** = une boîte qui **a déjà l'agrément AISP** et te loue son API (Bridge/Powens, Enable Banking, Saltedge…). Tu te branches dessus → tu n'as pas à devenir AISP toi-même (ce qui coûterait 100-300 k€ + 6-12 mois — **écarté définitivement**, cf `BANK-INTEGRATION.md`).
- **OAuth (le flux de connexion)** = quand l'utilisateur clique « Connecter ma banque », il part sur l'écran de l'agrégateur puis sur **sa** banque où il tape ses identifiants (**jamais chez nous**). La banque renvoie un **token** = un laissez-passer « ImmoTrack peut lire ce compte ».
- **Edge Function** = un petit bout de code serveur (Deno/TypeScript) **hébergé par Supabase**, déclenché par une URL. C'est « la façon Supabase » d'avoir du back sans louer un autre serveur. C'est là que vit le secret client (jamais au front).
- **Vault / secret chiffré** = le coffre où on range les tokens, **chiffré au repos**, illisible depuis le navigateur.
- **Webhook vs polling** = soit la banque/agrégateur **te prévient** quand il y a du nouveau (webhook = push), soit **tu vas voir** régulièrement (polling). Les deux sont faisables dans Supabase.

**Le point dur, l'unique raison qu'il faille un backend** : le secret client (le « mot de passe » d'ImmoTrack vis-à-vis de l'agrégateur) **ne doit jamais sortir côté navigateur**. Un site statique github.io ne peut pas le garder secret. → il faut un bout de serveur. **Supabase fournit déjà ce bout de serveur.**

---

## 3. État des lieux (vérifié dans le code prod `origin/main`)

### 3.1 La chaîne d'import qui existe déjà (à réutiliser, règle DRY)

Le flux CSV/OFX V1 est complet et abouti (UX « compléter pas à pas » livrée v15.351) :

```
fichier CSV/OFX
  → _bankParseCSV / _bankParseOFX            (js/core/bank-import.js)
  → _bankNormalizeCSV → lignes {date,libelle,debit,credit,signedAmount,_fingerprint}
  → _bankDedup(newLines, DB.mouvements)      (dédup par _fingerprint / fitid, fallback date±3j+montant±1€)
  → _bankMatchHeuristic(line, {baux,…})      (nom locataire+montant → Loyers+ref bail ; mots-clés → catégorie)
  → revue « compléter pas à pas » :          fenêtre #ov-bank-mv, _bankWalkGoto/Render/Done/Skip
  → _bankImportConfirm()                     (index.html:45329) → écrit dans DB.mouvements
  → _bankImportRecap() → aperçu 2044         (recettes 211/213, charges 221-229, intérêts 250…)
  → _catLigne2044(cat) / _stdCategoryByName  (la catégorie retombe sur une ligne 2044)
```

**Conséquence directe** : l'auto-import ne doit **rien réinventer en aval**. Il doit produire les **mêmes objets `line`** que les parsers CSV/OFX, puis appeler **exactement** `_bankDedup` → `_bankMatchHeuristic` → walk → `_bankImportConfirm`. L'API n'est qu'une **nouvelle source** branchée en amont de la même tuyauterie. *(C'est la règle [[feedback_dry_reuse_no_copy]] : on factorise, on ne recopie pas.)*

### 3.2 Ce que `_bankImportConfirm` persiste réellement (`origin/main:45329`)

L'objet mouvement écrit côté client porte : `date, lib, cat, qui, imm, db, cr, fac, compteurCcId, _source:'bank_import', _importedAt`, et (1re part seulement) `fitid`, `_fingerprint`, `_bankAccountId`.

### 3.3 Comment le Store mappe vers Postgres (`origin/main:js/core/store-mapping.js:75`)

```js
mouvements(o, ctx) → { id, legacy_id, date_mouvement, libelle, immeuble_id, categorie,
                       logement_id, entite_id, debit, credit, facture, compteur_cc_id,
                       pj_document_id, ...base(o) }
base(o) = { espace_id, created_by, legacy_raw: <objet client entier en JSONB> }
```

→ **Trou n°1** : les champs bancaires (`_fingerprint`, `fitid`, `_bankAccountId`, `_source`) **survivent dans `legacy_raw` (JSONB fourre-tout)** mais **sans colonne typée → non indexables, non contraignables en UNIQUE**. Pour une sync auto **idempotente** (ne jamais ré-insérer une transaction déjà rapatriée même si l'app tourne 2× le cron), il faut un **identifiant de transaction stable de l'agrégateur en colonne dédiée + index unique**.

### 3.4 Modèle compte bancaire actuel

`DB.params.bankAccounts[]` = `{id, label, type, identifiers[], lastImport}` — stocké dans **`espace_config_private`** (table miroir RLS `is_full_member` lecture / `is_full_manager` écriture ; **un membre scopé n'y a aucun accès** — migrations 0035/0036). Bien rangé pour des **métadonnées**, mais **pas une table typée** pour joindre tokens ↔ comptes ↔ mouvements côté serveur.

### 3.5 Backend Supabase

- Schéma à la migration **0037**. Tables métier isolées par `espace_id` + RLS FORCE (`mouvements` = migration 0011).
- **Aucune Edge Function n'existe encore** (`supabase/functions/` vide) → backend bancaire = **greenfield**.
- Brique privée déjà là : `espace_config_private` (le bon patron de confidentialité à étendre pour les tokens).

---

## 4. Marché AISP 2026 — matrice de décision

> Les **prix sont majoritairement « sur devis »** chez les acteurs B2B (Bridge, Tink, Saltedge) : c'est un fait, pas une lacune de l'étude. Les chiffres publics fiables sont rares en 2026.

| Agrégateur | Tier gratuit / d'entrée 2026 | Couverture FR (CM, Hello Bank/BNP, CA) | Webhooks | Statut & héberg. | Verdict ImmoTrack |
|---|---|---|---|---|---|
| **GoCardless Bank Account Data** (ex-Nordigen) | ❌ **Fermé aux nouveaux comptes depuis juillet 2025** (existants conservés : 50 banques/mois, 4 sync/j). ✅ | Oui (EEA/PSD2) ✅ | — | AISP EU ✅ | **Écarté** : impossible de s'inscrire en 2026. *(C'est pourtant ce qu'utilise Qalimo — inscrits avant la fermeture.)* |
| **Enable Banking** | ✅ **« Restricted Production » GRATUIT, self-serve, limité aux comptes que tu lies toi-même** (= remplaçant du free tier Nordigen, « le plus indie-friendly »). Production complète = contrat + KYB. ⚠️ | ⚠️ **PARTIEL** : CM + CA OK, mais **BNP/Hello Bank NON visibles au Control Panel** (test user 2026-06-24) alors que la doc FR liste BNP → tier restreint limité et/ou Hello Bank non exposé comme ASPSP distinct. | À confirmer ⚠️ | AISP EU ⚠️ | ⭐ Dogfood **partiel gratuit** (CM+CA) ; Hello Bank au passage payant. |
| **Bridge / Powens** | Sandbox dev gratuit ✅ ; **production sur devis** (sales-gated). ⚠️ | Meilleure couverture FR du marché ✅ | ✅ **push** (`CONNECTION_SYNCED`/`ACCOUNT_SYNCED`), recommande webhooks > polling, sync de fond 24h. ✅ | **Établissement de paiement agréé ACPR (code 16948), français.** ✅ | ⭐ **Candidat SCALE** (bêta → SaaS). Réf. marché. |
| **Linxo Connect** (Crédit Agricole) | Sur devis ⚠️ | 95 % FR (réf. ancienne étude) ⚠️ | À confirmer | AISP FR (ACPR) ✅ | Alternative FR sérieuse. **Co-utilisé par Qalimo** avec GoCardless. |
| **Saltedge** | Usage-based, **sur devis**, pas de tier fixe public 2026. ⚠️ | Global incl. FR ⚠️ | À confirmer | AISP EU ✅ | Plan B si Bridge/Enable bloquent. |
| **Tink** (Visa) | Entreprise, sur devis ⚠️ | EU/FR ⚠️ | À confirmer | AISP EU ✅ | Surdimensionné pour un éditeur solo. |
| **TrueLayer** | Sandbox ; sur devis ⚠️ | ~80 % FR (réf. ancienne étude) ⚠️ | À confirmer | AISP UK/EU ✅ | Focus UK, écarté FR. |
| **Fintecture** | Par usage (PISP) | — | — | EP FR | **PISP** (paiement), hors scope lecture. Pour SEPA-PRELEVEMENTS. |

### Recommandation chiffrée (2 temps, **provider-agnostique grâce à une couche d'abstraction**)

1. **Dogfood (toi, 0 €)** → **Enable Banking Restricted Production**. Tu branches Crédit Mutuel / Hello Bank / Crédit Agricole, gratuitement, sans contrat, et tu valides **toute la chaîne** sync→affectation→2044 sur tes vraies données.
2. **Scale (5-10 bêta → SaaS)** → **Bridge/Powens** (français, ACPR, couverture FR n°1, webhooks, prouvé par Qalimo-like) **ou** Enable Banking en production contractuelle (avantage : **zéro re-intégration** si la couche d'abstraction est bien faite). Tranché au vu des **devis Phase 0**.

> 🛡 **Anti-lock-in** : on code contre **une interface maison** (`BankProvider` : `connectUrl()`, `exchangeCode()`, `listTransactions()`, `refreshConsent()`), pas contre le SDK d'un agrégateur. Swapper Enable→Bridge plus tard = réécrire 1 adaptateur, pas la chaîne. *(Déjà préconisé dans l'ancienne étude « abstraction API maison ».)*

### Note 360° concurrence — **Qalimo**

Confirmé par leurs mentions légales RGPD : Qalimo agrège via **GoCardless + Linxo** (le « Linkso » de leur texte = coquille pour **Linxo Connect**). **Synchro bancaire incluse dans tous les plans**, pas en option payante (4,90 €/bien/mois jusqu'à 6 biens ; 34,30 €/mois 7-25 biens). → enseignement **pricing** : facturer la connexion bancaire en supplément peut paraître chiche face à un concurrent qui l'inclut (cf §8).

---

## 5. Architecture — A (tout-Supabase) vs B (hybride)

### 5.1 Archi A — **Tout-Supabase** (recommandée) ✅ faisabilité confirmée

```
[Front github.io statique]
   │  1. clic "Connecter ma banque"  (appel authentifié JWT)
   ▼
[Edge Function  bank-connect]  ── secret client (Edge Function secret, jamais au front) ──┐
   │  2. renvoie l'URL de consentement de l'agrégateur                                     │
   ▼                                                                                       │
[Agrégateur AISP] ──3. OAuth──> [Banque de l'utilisateur] ──4. il s'authentifie chez SA banque
   │  5. redirect avec "code"                                                              │
   ▼                                                                                       │
[Edge Function  bank-callback] ──6. échange code→token, CHIFFRE, écrit──────────────────► [Postgres]
                                                                            bank_connections (token chiffré, RLS service-role)
   ┌─────────────────────────────────────────────────────────────────────────────────────┘
   │  7a. pg_cron + pg_net : POST périodique          7b. (ou) webhook agrégateur → Edge Function bank-webhook
   ▼
[Edge Function  bank-sync] ──8. pull transactions (avec token déchiffré côté serveur)
   │  9. normalise au format `line` → _bankDedup → _bankMatchHeuristic → insert mouvements (idempotent: external_tx_id unique)
   ▼
[Postgres mouvements]  ──10. Realtime (canal privé espace_id)──► [Front] les nouveaux mvts arrivent dans la fenêtre de revue
```

**Briques Supabase mobilisées** (toutes natives, **vérifié docs Supabase**) :
- **Edge Functions (Deno)** pour OAuth + sync. ✅
- **Secret client** dans les **Edge Function secrets** (`supabase secrets set`), pas en base. ✅
- **Tokens** dans une **colonne chiffrée** d'une table privée, **RLS lisible par le service_role uniquement** (l'Edge Function), pas par le front ; chiffrement au repos via **Vault** (AEAD/libsodium ✅) ou pgcrypto.
- **Planification** : `pg_cron` + `pg_net` (`cron.schedule()` + `net.http_post()`) invoquent `bank-sync` périodiquement — **fréquence jusqu'à la minute**. ✅ *(ou webhook si l'agrégateur pousse → Bridge le fait ✅)*
- **Realtime** (déjà isolé par `espace_id`, migration 0025) pour rafraîchir le front.

**Coût** : **agrégateur seul** (0 € dogfood Enable Banking ; sur devis au scale) **+ Supabase déjà payé**. **Zéro 2e fournisseur.**

### 5.2 Archi B — **Hybride** (Supabase + Cloudflare Worker / Vercel)

Le back OAuth/tokens/polling vit sur Cloudflare/Vercel ; Supabase = base + Realtime. C'est l'archi de l'ancienne étude (écrite **avant** qu'on ait Supabase).

| Critère | A — Tout-Supabase | B — Hybride |
|---|---|---|
| Nb fournisseurs | 1 (Supabase) | 2 (+ Cloudflare/Vercel) |
| Coffre à secrets | 1 (Supabase) | 2 (à synchroniser) |
| Tokens ↔ données | **collés** (même base, même RLS `espace_id`) | séparés (token chez CF, data chez Supabase) |
| Surface d'attaque / ops | minimale | doublée |
| Planification | pg_cron natif ✅ | CF Cron (très mûr) ✅ |
| Coût infra add. | **0 €** | ~5-20 €/mois + complexité |
| Courbe d'apprentissage | Deno Edge Functions (tu fais déjà du SQL) | Workers + un 2e écosystème |

**Verdict : A.** Tu possèdes déjà Postgres + RLS + Auth + Vault + cron + Realtime dans **un seul outil que tu administres déjà** (migrations, RLS). Mettre les tokens **à côté** des données qu'ils protègent (même RLS `espace_id`) est plus sûr et plus simple. Le seul coût d'entrée = apprendre les Edge Functions Deno, mineur. B ne se justifierait que si Supabase plafonnait (timeouts Edge Functions sur de gros volumes) — non bloquant à l'échelle 5-10, à re-tester au scale.

---

## 6. Sécurité & conformité

### 6.1 Où vivent les secrets

| Secret | Emplacement | Lisible par |
|---|---|---|
| **Secret client agrégateur** (1 pour toute l'app) | **Edge Function secrets** (`supabase secrets set`) | Edge Functions uniquement (jamais base, jamais front) |
| **Token OAuth par utilisateur/compte** | colonne chiffrée de `bank_connections`, RLS **service_role only** (+ Vault/pgcrypto au repos) | l'Edge Function `bank-sync` (service_role), **jamais le front, jamais un membre même plein** |
| **Métadonnées compte** (label, IBAN masqué) | table `bank_accounts` ou `espace_config_private` | membre plein (RLS `is_full_member`) |

→ **Trou n°2** : le coffre à tokens (`bank_connections`) **n'existe pas** ; RLS dédiée plus stricte que `espace_config_private` (qui est lisible par tout membre plein — **trop ouvert pour un token bancaire actif**). Les tokens doivent être **inaccessibles au client**, point.

### 6.2 DSP2 — ré-consentement : **la règle a changé en 2026** ✅

- ❌ **Réfuté** : « il faut se reconnecter tous les 90 jours ». Ce n'est plus le défaut.
- ✅ **L'EBA a amendé les RTS : renouvellement du SCA pour l'accès AISP porté de 90 → 180 jours**, et **nouvelle exemption SCA *obligatoire*** : les banques **ne doivent plus** redemander d'authentification forte quand le client consulte ses comptes via un AISP (sous conditions). [EBA Final Report on RTS amendment]
- **Implication UX** : re-connexion **2×/an** au lieu de 4×, moins de friction. On garde quand même l'UX « consentement expiré / se reconnecter » + un **rappel email J-? avant les 180 jours** (réutilise l'infra OTP/Resend déjà staffée, [[project_bail_otp_email]]).
- **Horizon** : **DSP3 / PSR** sont en cours (textes ~2026, application ultérieure) → re-vérifier au moment du build.

### 6.3 Modèle « agent / distributeur » — le piège à éviter ✅

- ✅ **Confirmé** : sous DSP2, l'**institution agréée (le prestataire) reste pleinement responsable** des services rendus par son agent, et **le contrat avec le client final doit nommer l'agent comme agissant pour le compte du prestataire**. [FCA — Agency models under PSD2]
- ❌ **Réfuté (important)** : « je suis juste un prestataire technique, donc pas besoin d'agrément/arrangement ». **Faux.** Dès qu'on **fournit le service AIS à des tiers** (les bêta-testeurs, les clients), il faut un **vrai arrangement contractuel sous la licence de l'agrégateur** (modèle agent/distributeur) + le consentement client conforme.
- **Conséquence pour le phasage (clé)** :
  - **Dogfood = tes propres comptes** → tu es l'utilisateur final qui consent à **tes** données. **Contrainte réglementaire quasi nulle.** ✅ (raison de plus de commencer là)
  - **Bêta (tiers) + SaaS** → il faut **l'arrangement agent + DPA + consentement nommant le prestataire**. C'est un **jalon Phase 4**, négocié avec l'agrégateur retenu.

### 6.4 RGPD

- Données bancaires = **sensibles**. Agrégateurs AISP = hébergement EU + **DPA fourni** (à exiger et lire en Phase 0). ⚠️ à obtenir par fournisseur.
- **Minimisation** : ne stocker que ce qui nourrit la 2044 (date, libellé, montant, id transaction). Pas besoin de tout l'historique brut côté ImmoTrack.
- **Rétention** : aligner sur les colonnes `retention_*` déjà posées (P0-C2) + droit à l'effacement (purge_espace existe, migration 0023).
- **Re-consentement = droit de retrait** : déconnecter un compte doit **supprimer le token** (révocation côté agrégateur + delete en base).

---

## 7. 🎯 LISTE EXHAUSTIVE DES POINTS MANQUANTS (le vrai but de l'étude)

Tout ce qui manque pour passer du CSV manuel à la sync auto. **8 blocs.**

### A. Backend / infra (greenfield — rien n'existe)
1. Créer le dossier `supabase/functions/` + pipeline de déploiement (`supabase functions deploy`). **Aucune Edge Function n'existe aujourd'hui.**
2. Edge Function `bank-connect` (génère l'URL de consentement, état anti-CSRF).
3. Edge Function `bank-callback` (échange `code` → token, chiffre, persiste).
4. Edge Function `bank-sync` (pull transactions, normalise, dédup, insert).
5. (Si webhook) Edge Function `bank-webhook` (vérifie la signature de l'agrégateur, déclenche sync).
6. Job `pg_cron` + `pg_net` pour appeler `bank-sync` (quotidien suffit : sync de fond agrégateur = 24h).
7. Gestion **erreurs/retries** (banque indispo, token expiré, rate-limit agrégateur) + journal.
8. **Couche d'abstraction `BankProvider`** (anti-lock-in) : 1 interface, N adaptateurs (EnableBanking, Bridge…).

### B. Auth / OAuth
9. Enregistrer l'**application** chez l'agrégateur (client_id/secret, **redirect URI** = URL de l'Edge Function `bank-callback`).
10. Gérer **sandbox vs production** (2 jeux de credentials).
11. Stocker l'**état OAuth** (anti-CSRF) le temps de l'aller-retour (table courte ou JWT signé).
12. Rattacher le compte connecté au **bon `espace_id`** (le user est authentifié Supabase → JWT → espace).

### C. Sécurité
13. Table **`bank_connections`** avec token **chiffré**, RLS **service_role-only** (plus stricte que `espace_config_private`).
14. Secret client en **Edge Function secrets** (vérifier qu'il n'apparaît **jamais** dans un bundle front — grep CI).
15. Chiffrement au repos : **Vault** (AEAD/libsodium ✅) ou `pgcrypto`. ⚠️ Trancher Vault vs pgcrypto (statut pgsodium/Vault à confirmer — docs Supabase, Phase 0).
16. Révocation propre d'un token à la déconnexion (appel agrégateur + delete).

### D. Conformité / légal
17. **DPA** signé avec l'agrégateur retenu (héberg. EU). ⚠️
18. **Arrangement agent/distributeur** sous la licence AISP du prestataire (déclenché à la Phase bêta, pas au dogfood). ⚠️
19. **Flux de consentement** conforme : nommer le prestataire, durée 180 j, retrait possible.
20. Mentions légales / politique de confidentialité ImmoTrack à compléter (lister le sous-traitant AISP — comme Qalimo le fait).
21. Re-vérifier **DSP3/PSR** au moment du build (calendrier mouvant).

### E. Modèle de données (migrations Supabase)
22. **Nouvelle table `bank_connections`** (`espace_id, provider, provider_item_id, token_chiffré, consent_expires_at, status, created_by`).
23. **Nouvelle table `bank_accounts`** typée (`espace_id, connection_id, label, iban_masque, provider_account_id, last_sync_at, solde`) — ou extension de `espace_config_private.bankAccounts`. **Trancher** : table typée recommandée pour les jointures serveur.
24. **Colonnes sur `mouvements`** : `external_tx_id text` (id transaction stable agrégateur) **+ index UNIQUE `(espace_id, external_tx_id)`** (idempotence sync), `bank_connection_id uuid`, `source text` (promouvoir `_source` en colonne).
25. Étendre **`store-mapping.js`** : mapper ces nouveaux champs (aujourd'hui ils tomberaient dans `legacy_raw`, non indexable — **Trou n°1**).
26. **Migration de rapprochement** : une transaction d'API peut correspondre à un mouvement déjà importé en CSV → réutiliser `_bankDedup` (fingerprint) **+** matcher sur `external_tx_id`.

### F. Intégration à la chaîne existante (réutilisation)
27. **Adapter `BankProvider.listTransactions()` → format `line`** (`{date,libelle,debit,credit,signedAmount,…}`) identique à `_bankNormalizeCSV`/`_bankParseOFX`. **C'est le seul vrai code « nouveau » côté métier.**
28. Brancher **`_bankDedup`** (déjà robuste, fingerprint) — clé API = `external_tx_id`.
29. Brancher **`_bankMatchHeuristic`** tel quel (nom locataire+montant, mots-clés).
30. Faire atterrir les nouvelles lignes dans la **fenêtre de revue « compléter pas à pas »** (`#ov-bank-mv`, `_bankWalk*`) — l'utilisateur valide/complète comme pour un CSV.
31. `_bankImportConfirm` réutilisé pour l'écriture → **mapping 2044 inchangé** (`_catLigne2044` / `_stdCategoryByName`).
32. **Périmètre par compte** : un `bank_account` → un périmètre (logement/SCI) par défaut, comme le `_bankAccountId` actuel.

### G. UX (écran « Mes banques »)
33. Écran **« Mes banques »** : liste comptes connectés, **solde**, **statut consentement** (actif / expire le JJ/MM / expiré), bouton **« Reconnecter »**.
34. Bouton **« Connecter une banque »** → flux OAuth.
35. **Coexistence CSV ↔ API** : les deux sources alimentent la même chaîne ; éviter les doublons (un compte connecté en API ne devrait plus être importé en CSV → garde-fou).
36. **Notification** de nouveaux mouvements (toast/badge) + rappel **J-? avant expiration 180 j** (email Resend).
37. Onboarding : expliquer en clair « tes identifiants restent chez ta banque ».
38. **Responsive** PC/tablette/téléphone (règle projet) + design system.

### H. Pricing / commercialisation
39. Décider **bundle (inclus) vs add-on « Pro Connect »** (cf §8).
40. **Breakeven** vs coût agrégateur (à recalculer avec les devis Phase 0).
41. Facturation à l'usage (compteur de comptes connectés actifs par espace).
42. Positionnement vs Qalimo (qui **inclut** la synchro).

---

## 8. Commercialisation

- **Donnée concurrente** : Qalimo **inclut** la synchro bancaire dans tous ses plans (pas de premium séparé). Facturer un « Pro Connect » à part risque de paraître chiche.
- **Coût réel à répercuter** : inconnu tant que les **devis Phase 0** ne sont pas obtenus (Bridge/Enable = sur devis). L'ancienne étude tablait sur 30-280 €/mois **tout compris** ; à l'échelle 5-10 c'est l'ordre de grandeur d'un petit forfait + variable par compte.
- **3 modèles possibles** (à trancher après devis) :
  1. **Bundle** dans un plan « Pro/Investisseur » (aligné Qalimo) — le plus lisible.
  2. **Add-on Pro Connect** +X €/mois — segmente, mais friction d'achat.
  3. **Hybride** : 1 banque incluse, comptes supplémentaires en add-on.
- **Breakeven** (à recalculer) : si coût agrégateur ≈ Y €/compte connecté/mois, le prix client doit couvrir Y + marge. À 5-10 bêta = **0 € facturé** (Enable Banking gratuit) → le coût ne démarre qu'à la bascule production.

---

## 9. Plan par phases (≈ 45-60 h backend, hors délais externes)

| Phase | Contenu | Estimation | Bloquants externes |
|---|---|---|---|
| **0 — Cadrage fournisseur & conformité** | Créer compte **Enable Banking** (Restricted Production, gratuit) **+** sandbox **Bridge** en parallèle. **Vérifier la couverture de tes 3 banques** (CM, Hello Bank, CA). Obtenir/lire **DPA** + conditions **agent/distributeur** + grilles de **prix** (devis). Trancher Vault vs pgcrypto. | ~3-5 h + délais | Devis, KYB |
| **1 — Socle backend mono-tenant (tes comptes)** | Migration : `bank_connections` + `bank_accounts` + colonnes `mouvements` (`external_tx_id` unique, `bank_connection_id`, `source`). Edge Functions `bank-connect` + `bank-callback`. Secret client en Edge secrets. Token chiffré RLS service-role. **Test : connecter TON Crédit Mutuel, voir le token rangé, illisible au front.** | ~12-16 h | — |
| **2 — Rapatriement + injection chaîne** | Adaptateur `BankProvider.listTransactions()` → format `line`. Edge Function `bank-sync` → `_bankDedup` (clé `external_tx_id`) → `_bankMatchHeuristic` → insert idempotent. Front : Realtime → nouvelles lignes dans la fenêtre **« compléter pas à pas »** → `_bankImportConfirm` → **2044 inchangée**. | ~10-14 h | — |
| **3 — Écran « Mes banques » + planif + re-consentement** | Écran connecter/solde/statut 180 j/reconnecter. `pg_cron`+`pg_net` (sync quotidien) ou webhook (Bridge). Notif nouveaux mvts + rappel email J-? (Resend). Coexistence CSV/API (garde-fou doublons). Responsive + design system. | ~10-14 h | — |
| **4 — Ouverture 5-10 bêta + conformité** | Bascule provider en **production contractuelle** (KYB + DPA + arrangement agent). Flux de consentement nommant le prestataire. RLS multi-tenant déjà en place. **Audit `superpowers:code-reviewer` obligatoire** (sujet sensible : tokens + données bancaires). | ~6-10 h | Contrat agent, DPA |
| **5 — Commercialisation** | Palier tarifaire (bundle vs Pro Connect), compteur d'usage, breakeven recalculé. Migration provider si nécessaire (la couche d'abstraction le permet). | selon offre | Pricing |

**Jalon de validation dogfood (fin Phase 3)** : tu connectes tes 3 banques, les mouvements arrivent seuls, tu les valides dans la même UX que le CSV, et l'aperçu 2044 tombe juste — **le tout à 0 €**.

---

## 10. Questions ouvertes à trancher (Phase 0)

1. ⚠️ **Enable Banking = couverture partielle** : le user ne voit ni BNP ni Hello Bank au Control Panel (2026-06-24), CM+CA OK. → dogfood gratuit possible sur CM+CA uniquement ; BNP/Hello Bank exigent un provider payant (Bridge/Powens/Linxo). Fork A/B à trancher.
2. ⚠️ **Prix production** Bridge/Powens vs Enable Banking (devis) → choix scale + breakeven.
3. ⚠️ **Vault vs pgcrypto** pour le token au repos (statut pgsodium/Vault à confirmer dans les docs Supabase).
4. ⚠️ **Webhook (Bridge) vs polling pg_cron (Enable)** : dépend du provider scale retenu.
5. ⚠️ **Modèle de prix** client (bundle vs add-on) au vu du coût réel.
6. 🔁 Re-vérifier **DSP3/PSR** au démarrage du build (le calendrier réglementaire bouge).

---

## 11. Sources (vérifiées)

- DSP2 90→180 j + exemption SCA obligatoire : [EBA — Final Report, amendment to RTS](https://www.eba.europa.eu/publications-and-media/press-releases/eba-publishes-final-report-amendment-its-technical-standards) ✅ · [Projective Group](https://www.projectivegroup.com/psd2-alert-authentication-period-for-account-information-services-extended-to-180-days/) · [Vixio](https://www.vixio.com/insights/pc-90-becomes-180-eba-makes-key-sca-change)
- Modèle agent : [FCA — Agency models under PSD2](https://www.fca.org.uk/firms/agency-models-under-psd2) ✅
- Webhooks : [Bridge docs](https://docs.bridgeapi.io/docs/webhooks) · [Powens docs](https://docs.powens.com/documentation/integration-guides/webhooks) ✅
- Powens agréé ACPR : [Powens Security & Compliance](https://www.powens.com/fr/security-compliance/) ✅
- GoCardless AISP + fermeture nouveaux comptes : [GoCardless dev](https://developer.gocardless.com/bank-account-data/overview) ✅ · [Actual Budget](https://actualbudget.org/docs/advanced/bank-sync/gocardless/) · [forum InvoiceNinja](https://forum.invoiceninja.com/t/gocardless-nordigen-service-no-longer-available-alternative-needed/22576) ✅
- Enable Banking free tier : [OpenBankingCompare 2026](https://www.openbankingcompare.com/blog/best-open-banking-api-providers-for-developers-2026) ⚠️ secondaire · couverture FR : [Enable Banking — Open Banking Specifics in France](https://enablebanking.com/docs/markets/fr/) ✅ (CM, CA, BNP/Hello Bank, SG, LBP, LCL, BP, CE)
- Supabase planification : [Schedule Functions](https://supabase.com/docs/guides/functions/schedule-functions) · [Cron](https://supabase.com/docs/guides/cron) ✅
- Supabase Vault : [Vault docs](https://supabase.com/docs/guides/database/vault) ✅ (AEAD/libsodium)
- Supabase secrets Edge Functions : [Managing config / secrets](https://supabase.com/docs/guides/local-development/managing-config) ✅
- DSP3/PSR : [Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/cedd39c6/psd3-and-psr-from-provisional-agreement-to-2026-readiness) · [Worldline](https://worldline.com/en/home/main-navigation/resources/blogs/2026/the-scope-and-timeline-are-locked-in-for-psd3-and-psr-what-should-psps-know)
- Qalimo (agrégateurs) : [Mentions légales Qalimo](https://www.qalimo.fr/mentions-legales/) ✅ · [Tarifs Qalimo](https://www.qalimo.fr/tarif/)

---

## 12. Journal

- **2026-06-24** : créé. Étude décisionnelle pour la sync bancaire auto (note A10). **Repivot majeur vs `BANK-INTEGRATION.md`** : (1) **archi tout-Supabase** confirmée faisable (Edge Functions + Vault + pg_cron/webhook + Realtime), Cloudflare plus nécessaire ; (2) **GoCardless fermé aux nouveaux comptes** → dogfood gratuit via **Enable Banking** (Restricted Production), scale via **Bridge/Powens** ; (3) **DSP2 90→180 j** (EBA) + exemption SCA obligatoire ; (4) **réutilisation 100 %** de la chaîne `_bankDedup`→`_bankMatchHeuristic`→walk→`_bankImportConfirm`→2044 ; (5) liste exhaustive de **42 points manquants** + plan 6 phases (~45-60 h). Cadre dogfood (tes comptes, conformité quasi nulle, 0 €) → bêta (arrangement agent + DPA). Veille marché partielle (limite de session) : prix majoritairement sur devis = à obtenir en Phase 0.
