# Chiffrage de l'effort de déploiement ImmoTrack — V1 commerciale Q4 2026

> Livrable 5/5 du dossier BIZPLAN-STRATEGIE.
> Hypothèse de capacité Didier : **15–18 j-homme/mois max** (tâches dev + maintenance), donc **~95–115 j-h utiles entre avril 2026 et fin Q4 2026** (8 mois) — déduction faite du temps consacré à support client, marketing, comptabilité (~30–40 % du temps en phase commerciale active).
> Référentiel des tailles : XS < 1h ; S = 1–3h ; M = 3–8h ; L = 1–3j ; XL > 3j (cf BACKLOG.md).

---

## 0. Résumé exécutif

| Poste | Effort dev (j-h Didier) | Coût externe (€ HT) | Cash-out total V1 |
|---|---|---|---|
| **A. Pré-V1 technique (manques bloquants + standards marché)** | **52 j-h** | 1 500 € (avocat EDL) | 1 500 € |
| **B. Infrastructure & DevOps** | 5 j-h | 600 €/an init + ~20–80 €/mois | 1 200 € (an 1) |
| **C. Support client** | 8 j-h init + 4 j-h/mois | 0–60 €/mois (Crisp gratuit ou Plan Pro) | 720 €/an |
| **D. Légal & RGPD** | 3 j-h | 2 000–4 000 € (avocat init + DPA template) | 3 000 € |
| **E. Marketing & lancement** | 8 j-h site vitrine + 4 j-h/mois content | 1 500 € identité + 200–600 €/mois ads | 8 500 € (an 1) |
| **F. Facturation / comptabilité** | 3 j-h | Paddle 5 % CA + Pennylane 30 €/mois | variable, ~360–800 € fixe |
| **TOTAL** | **~73 j-h dev + ~10 j-h/mois récurrent** | | **~14 600 € cash-out V1 + récurrent** |

**Verdict** : V1 commerciale jouable Q4 2026 si Didier reste **focus dev jusqu'en septembre 2026**, puis bascule sur lancement octobre. Recrutement non requis pour V1 minimum viable, mais recommandé pour V2 (2027) — voir §7.

---

## A. Pré-V1 commerciale — manques bloquants techniques

### A.1 — 🔴 Bloquants critiques (sans ces livrables, pas de mise en production publique)

| Code | Sujet | Taille | Estim j-h | Notes |
|---|---|---|---|---|
| AUDIT-GLOBAL | Audit sécu/perf/code quality (Explore + skills review/security-review) | M | **1,5** | À faire avant tout. Identifie blocages cachés. |
| SECU-INNERHTML | Wrapper ~107 sites `innerHTML=` non échappés | M | **2,5** | Critique commercialisation : XSS avec données utilisateur. |
| EDL-VALIDATION-AVOCAT | Validation légale template EDL bail habitation | XS | **0,2** | Coût avocat ~1 000–1 500 € HT (pas du j-h Didier mais cash-out). |
| LEGAL-2044 | Aide déclaration 2044 + mapping cats → lignes fiscales | L | **3,5** | CDC requis (~1 j) + mapping (~1 j) + render PDF (~1 j) + tests (~0,5 j). |
| LEGAL-BILAN-ANNUEL | Bilan annuel par entité PDF | M | **1** | Pré-requis 2044, réutilise rendering. |
| BUG-CHARGE-001 | Régularisation des charges KO | M | **1** | Critique fonctionnel ; régularisation = feature centrale loi. |
| BUG-DASH-001 | Dashboard : baux en vigueur dans le mois choisi | M | **1** | Critique cohérence KPI. |
| ARCHI-DB-DOUBLONS | ⏳ Reportable post-V1 si fix `_syncLogToBail()` tient | XL | **(6)** | À NE PAS faire en V1. Fix provisoire suffit. Migration en V1.1 ou V2. |

**Sous-total bloquants critiques** : **10,7 j-h** (V1) + 1 500 € avocat. ARCHI-DB-DOUBLONS hors scope V1.

### A.2 — 🟠 Standards marché (sans, perte de deals face à Qalimo/Rentila/BailFacile)

| Code | Sujet | Taille | Estim j-h | Critère Scorecard |
|---|---|---|---|---|
| QUIT-EMAIL | Envoi email quittances locataire | M | **1** | 3.3 |
| AVIS-ECHEANCE | Avis d'échéance avant paiement | S | **0,5** | 3.7 |
| RAPPEL-IMPAYE | Rappel auto locataire (impayé) | M | **1** | 4.12 |
| IMPORT-EXCEL-LOG | Import Excel logements/locataires (template SheetJS) | M | **1** | 14.1+14.2 |
| IMPORT-CONCURRENTS | Mappers Rentila/BailFacile/Qalimo | L | **3** | 14.3 (CDC + 3 mappers + tests) |
| BAIL-TYPES | 5 types bail (meublé/garage/mobilité/étudiant + Autre) | L | **4** | 1.11+1.13 (5 sous-phases A–E) |
| BAIL-CLAUSES-PERSO | Clauses particulières par entité | S | **0,5** | UX bail |
| EDL-DELEGUE-EXPORT | Export HTML offline pour tiers (différenciant ⭐) | L | **3** | 2.15+16.5 ⭐ |
| EDL-DELEGUE-IMPORT | Import JSON + statut "à valider" | M | **1** | 2.16 ⭐ |

**Sous-total standards marché** : **15 j-h**.

### A.3 — Drive sync (si on conserve Drive en V1 — recommandé pour posture RGPD)

| Code | Sujet | Taille | Estim j-h | Notes |
|---|---|---|---|---|
| DRIVE-2H | Re-architecture fichiers Drive (par-user / partagé / référentiel) | M | **1,5** | Base obligatoire de 2F/2G. |
| DRIVE-2F | Optimistic Concurrency Control (OCC) au file level | M | **1,5** | Après 2H. Critique multi-devices. |
| DRIVE-2G | Awareness UI (qui édite quoi) | S | **0,5** | Couche UX. |
| DRIVE-2K | Arborescence par dossier entité | M | **(1)** | Nice-to-have V1, peut basculer V1.1. |

**Sous-total Drive** : **3,5 j-h V1** (DRIVE-2K reporté V1.1).

### A.4 — V3 visuel + refonte fonctionnelle onglet par onglet

| Code | Sujet | Taille | Estim j-h | Notes |
|---|---|---|---|---|
| V3-VISUEL | Design system v2 sur toutes pages | L | **6** | 5–8 sessions ≈ 6 j moyenne. |
| V3-REFONTE-LOYERS | Refonte fonctionnelle onglet Loyers/Mouvements | M | **1** | + couvre MVT-SCIND-CAT, MVT-RECURRENT |
| V3-REFONTE-QUIT | Refonte Quittances | M | **1** | + intègre QUIT-EMAIL livré ci-dessus |
| V3-REFONTE-REGUL | Refonte Régularisation | M | **1,5** | + couvre BUG-CHARGE-001 + CHARGE-REGLES |
| V3-REFONTE-IRL | Refonte IRL | M | **1** | + couvre IRL-VALIDATION (déjà v13.33) |
| V3-REFONTE-PARAMS | Refonte Paramètres | M | **1** | |
| V3-REFONTE-EQUIP | Refonte Équipements | M | **1** | + couvre BUG-EQUIP-FILTER |
| BUG-UI-DARK-MODAL | Modale dark mode | XS | **0,2** | À fixer dans V3-VISUEL. |
| DASH-V2 | Reste 7 phases Dashboard | XL | **(2)** | 4 phases livrées sur 7. |

**Sous-total V3** : **14,7 j-h** (DASH-V2 inclus partiel).

### A.5 — Récap pré-V1 technique

| Bloc | j-h |
|---|---|
| A.1 — Bloquants critiques | 10,7 |
| A.2 — Standards marché | 15,0 |
| A.3 — Drive sync | 3,5 |
| A.4 — V3 visuel + refonte | 14,7 |
| Buffer 15 % (régressions, polish) | 6,6 |
| Tests recette + corrections | 1,5 |
| **TOTAL pré-V1 technique** | **~52 j-h** |

À 15–18 j-h/mois en mode dev focus = **3 à 3,5 mois de dev pur** (mai → mi-août 2026 réaliste, en gardant 30 % du temps pour vérif/tests/maintenance).

### A.6 — Hors scope V1 (reporté V1.1 / V2)

| Code | Sujet | Pourquoi reporté |
|---|---|---|
| ARCHI-DB-DOUBLONS | XL, fix provisoire OK | ~6–10 j-h, refacturer en V1.1 |
| BAIL-NAMESPACE-MIGRATION | XL, ~3–4 j | reporté post-V3 |
| ASSO-PARTAGE | L, CDC requis | V2 |
| TRAV-SUIVI | L, CDC requis | V1.1 |
| DOC-PJ | M | V1.1 |
| Module agence (CRG, mandants, honoraires) | 3× XL = ~15 j | V2 (2027) |
| LEGAL-2072 SCI IR | XL | V2 différenciant |
| SAAS-MULTIUSERS | XL ~15–20 j | V2 (Q1 2027) |
| PORTAIL-LOC | XL ~10 j | V2 (Q2 2027) |
| SIGN-EIDAS | L ~3 j | V2 |

---

## B. Infrastructure & DevOps

### B.1 — Hypothèse architecturale V1

ImmoTrack reste une **PWA monolithique HTML+JS servie en CDN**, avec :
- IndexedDB local (DB utilisateur)
- Drive sync optionnel via Google OAuth
- **Pas de backend serveur en V1** (= économie majeure)

Pour V2 multi-users : ajout d'un backend (Node ou Go), DB PostgreSQL, auth (Auth0 ou roll-your-own), **chiffrage à part en §B.4**.

### B.2 — Hébergement V1 (sans backend)

| Poste | Choix recommandé | Coût | Justification |
|---|---|---|---|
| **CDN + hébergement** | **Cloudflare Pages** (gratuit) | 0 €/mois | gratuit jusqu'à 500 deploys/mois, illimité bande passante. Alternative : Vercel (gratuit hobby), Netlify. |
| **Domaine** | OVH (.fr ou .com) | 12–18 €/an | immotrack.fr ou .app à acheter avant lancement. |
| **DNS** | Cloudflare (gratuit) | 0 € | inclus avec Pages. |
| **HTTPS** | Auto Let's Encrypt | 0 € | inclus CDN. |
| **Email transactionnel** (quittances, rappels) | **Resend** ou Mailjet | 0 € jusqu'à 3 000/mois, puis ~10–25 €/mois | indispensable pour QUIT-EMAIL, AVIS-ECHEANCE, RAPPEL-IMPAYE. |
| **Storage assets** (templates, illustrations) | Cloudflare R2 ou GitHub | 0 € | volumes minimes. |

**Total init B.2** : 18 € (domaine).
**Total récurrent B.2** : 12–25 €/mois en cruise V1 (jusqu'à 100 utilisateurs actifs).

### B.3 — Observabilité, qualité, support

| Poste | Outil recommandé | Coût | Effort init |
|---|---|---|---|
| Monitoring erreurs JS | **Sentry** Free (5k err/mois) | 0 € | 0,3 j-h intégration |
| Analytics privacy-friendly | **Plausible** ou **Umami self-hosted** | 9 €/mois (Plausible) ou 0 € (self-hosted) | 0,2 j-h |
| Statuspage | **Instatus** Free | 0 € | 0,2 j-h |
| Backups Drive de l'utilisateur | (gérés par utilisateur via Google Drive) | 0 € | 0 |
| CI/CD (push → deploy) | **GitHub Actions** + Cloudflare Pages | 0 € | 0,5 j-h |
| **Tests automatisés** | **Playwright** (e2e) | 0 € | 2 j-h init + 0,5 j/release |

**Total effort init B.3** : ~3,5 j-h.
**Total récurrent B.3** : 0–9 €/mois.

### B.4 — Si V2 multi-users (chiffrage informatif)

| Poste | Choix | Coût |
|---|---|---|
| Backend Node + PostgreSQL | Render / Fly.io / Railway | 30–80 €/mois |
| Auth | Auth0 Free → Pro | 0–25 €/mois |
| Effort dev backend | SAAS-MULTIUSERS | 15–20 j-h (V2) |

### B.5 — Récap budget infra

- **An 1 (V1)** : 18 € + 12 mois × ~22 € = **~280 € cash-out**
- **An 2 (cruise + email transactionnel + backend V2)** : ~1 200–2 000 € cash-out (selon volume utilisateurs et choix backend)

---

## C. Support client

### C.1 — Outillage support

| Outil | Plan | Coût | Effort init |
|---|---|---|---|
| **Crisp Chat** ou **Tawk.to** (chat in-app) | Crisp Pro 25 €/mois ou Tawk gratuit | 0 ou 25 €/mois | 0,5 j-h intégration |
| Helpdesk + base connaissances | **Crisp Helpdesk** (inclus Pro) ou **HelpScout** | inclus ou 20 €/mois | 1 j-h création FAQ initiale |
| Email support | Forwarding contact@immotrack.fr | 0 € | 0,1 j-h |
| Tutos vidéos (10–15 vidéos onboarding) | Loom 12 €/mois ou OBS gratuit | 0–12 €/mois | **5 j-h** (script + tournage + montage 10 vidéos × 30 min ≈ 5 j) |
| Forum / communauté | Discord ou Discourse self-hosted | 0 € | 0,5 j-h init |

**Effort init C** : ~7 j-h.

### C.2 — Charge récurrente support

Hypothèse : 1 ticket / 25 utilisateurs / mois (ratio observable BailFacile / Gererseul). À 100 utilisateurs cible fin V1 = **4 tickets/mois**, ~30 min/ticket = 2 h/mois.
À 500 utilisateurs (cible année 1) = **20 tickets/mois**, ~10 h/mois (~1,3 j-h).
À 1 000 utilisateurs = ~3 j-h/mois.

**Récurrent C** : **2–4 j-h/mois en année 1**.

### C.3 — SLA recommandé

- Réponse email/chat sous 24 h ouvrées en V1
- Pas de support téléphonique avant 200+ utilisateurs payants (économie de 1–2 j-h/mois)

---

## D. Légal & compliance

### D.1 — Documents obligatoires V1

| Document | Approche | Coût | Effort Didier |
|---|---|---|---|
| **CGU (Conditions Générales d'Utilisation)** | Template adapté + relecture avocat | 800–1 200 € HT avocat | 0,5 j-h adaptation |
| **CGV (Conditions Générales de Vente)** | Si modèle SaaS payant | 800–1 200 € HT avocat | 0,5 j-h |
| **Mentions légales** | Self | 0 € | 0,2 j-h |
| **Politique de confidentialité (privacy policy)** | Template + audit avocat | inclus dans CGU | 0,3 j-h |
| **Registre RGPD** (article 30 RGPD) | Template CNIL + remplissage | 0 € | 0,5 j-h init + 0,1 j-h/an |
| **DPA / sous-traitants** (Google Drive, Resend, Sentry…) | Récup DPA standards éditeurs | 0 € | 0,5 j-h |
| **Information utilisateur RGPD** (in-app, banner cookies) | Implémenter banner conforme CNIL 2024 | 0 € | 0,5 j-h |
| **Validation EDL avocat** | EDL-VALIDATION-AVOCAT BACKLOG | 1 000–1 500 € HT | 0,2 j-h coordination |

**Sous-total init D** : **3 j-h Didier** + **2 600–4 200 € HT avocat** (estimer 3 000 € budget moyen).

### D.2 — Hébergement données

ImmoTrack en V1 stocke :
- IndexedDB **côté client** (= chez l'utilisateur, pas chez nous)
- Drive sync **chez l'utilisateur** (Google Workspace de l'utilisateur)
- **AUCUNE donnée utilisateur stockée par ImmoTrack en V1** = posture RGPD ultra-simple

→ Pas d'hébergement France obligatoire pour les données utilisateur (puisqu'on n'en stocke pas), sauf pour :
- Logs Sentry (configurer EU region : OK gratuit)
- Emails Resend (EU region : OK)

**Argumentaire commercial fort** : "Vos données restent chez vous, pas sur nos serveurs" (cf. différenciant ⭐11 / ⭐5).

### D.3 — Si bascule V2 multi-users / portail locataire

À ce moment-là, on stocke des données utilisateur côté serveur → DPO non obligatoire (< 250 employés ni traitement à grande échelle de données sensibles), mais :
- Hébergement EU obligatoire (CNIL conformité)
- DPA signé avec hébergeur (Render/Scaleway/OVH)
- Audit RGPD allégé : 1–2 j-h Didier + 1 000 € avocat ponctuel

### D.4 — Récap D

- **An 1** : ~3 j-h + 3 000 € HT cash-out
- **Récurrent** : ~0,5 j-h/an (mise à jour CGU annuelle, registre)

---

## E. Marketing & lancement

### E.1 — Site vitrine + landing pages

| Poste | Effort | Coût |
|---|---|---|
| Landing page (1 page, conversion-focused) | 3 j-h | 0 € (Astro/Vanilla) |
| Pages secondaires (Tarifs, Fonctionnalités, FAQ, Comparatif vs concurrents) | 3 j-h | 0 € |
| Domaine + DNS (déjà compté §B.2) | 0 j-h | 0 € |
| Hébergement (Cloudflare Pages) | 0 j-h | 0 € |

**Sous-total** : 6 j-h.

### E.2 — Identité visuelle

| Poste | Approche recommandée | Coût |
|---|---|---|
| Logo + charte couleurs | Designer freelance (Malt) sur 2–3 itérations | 800–1 500 € |
| Illustrations onboarding | unDraw (gratuit) ou Storyset | 0 € |
| Templates emails transactionnels | Designer même session | inclus 1 500 € |
| Screenshots produits propres | Self (capture + montage) | 0 € + 1 j-h |

**Sous-total identité** : **1 j-h + 1 500 € HT**.

### E.3 — Contenu SEO

L'outil de référence du concurrent BailFacile : **blog dense + comparatifs + guides fiscaux**. C'est leur premier canal acquisition.

| Poste | Volume cible avant lancement | Effort |
|---|---|---|
| Articles SEO "longue traîne" (calcul IRL, 2044, SCI, EDL...) | 30 articles × 1 500 mots × 2 h rédaction = 60 h | **8 j-h** |
| Articles "comparatif" (ImmoTrack vs Rentila, vs BailFacile, vs Qalimo) | 5 comparatifs × 3 h | 2 j-h |
| Pages fonctionnalités SEO | 10 pages × 1,5 h | 2 j-h |
| Tutos vidéos courts YouTube (3–5 min) | 10 vidéos (cf §C support) | (déjà compté) |

**Sous-total SEO** : **12 j-h init** + 1 article/semaine en cruise = **0,5 j-h/semaine = 2 j-h/mois**.

→ Recommandation : ne pas faire seul. Sous-traiter à un rédacteur SEO spécialisé immobilier (3 articles/mois × 100–150 € HT/article = **400 €/mois**).

### E.4 — Acquisition payante (paid ads)

Hypothèses budget bas (V1) :
- Meta Ads (Facebook + Instagram) : 200–400 €/mois
- Google Ads (long-tail "logiciel SCI", "déclaration 2044") : 200–400 €/mois
- LinkedIn Ads (CPC > 5 €/clic, ROI faible pour B2C — à éviter V1, garder V2 pour cible agences)

**Budget acquisition V1** : 400–800 €/mois sur 6 mois post-lancement = **2 400–4 800 €**.

### E.5 — Réseaux sociaux + partenariats

| Canal | Approche | Effort |
|---|---|---|
| YouTube (tutos + études cas) | 1 vidéo/mois | 1 j-h/vidéo |
| LinkedIn perso (Didier) + page entreprise | 2–3 posts/semaine | 0,3 j-h/semaine |
| Twitter/X | Annonces produit | 0,1 j-h/semaine |
| Partenariats notaires / experts-comptables | Démarchage perso | 1 j-h/mois |
| Posts r/vosfinances, forums BailFacile, etc. | Présence non-spammy | 0,2 j-h/semaine |

**Récurrent E.5** : ~3–4 j-h/mois.

### E.6 — Récap budget marketing

| Poste | Init (V1) | Récurrent (cruise) |
|---|---|---|
| Landing + vitrine | 6 j-h | – |
| Identité visuelle | 1 j-h + 1 500 € | – |
| SEO content | 12 j-h | 2 j-h/mois OU 400 €/mois (sous-traité) |
| Vidéos | (cf C.1, 5 j-h) | 1 j-h/mois |
| Paid ads | – | 400–800 €/mois (6 mois) |
| RS + partenariats | – | 3 j-h/mois |

**Total init E** : 19 j-h + 1 500 € HT (post-V1 plus exactement, septembre–octobre 2026).
**Cash-out E an 1 (post-lancement Q4)** : 1 500 € + 6 mois × 600 € ads + 6 mois × 400 € rédaction = **~7 500 €**.

---

## F. Comptabilité, facturation, paiement

### F.1 — Plateforme de paiement / facturation SaaS

| Option | Pro | Con | Coût |
|---|---|---|---|
| **Stripe** | leader, intégrations | TVA à gérer soi-même (mess EU) | 1,5 % + 0,25 € par transaction |
| **Paddle** | Merchant of Record (gère TVA EU automatiquement) | 5 % + 0,50 $ — plus cher | 5 % CA |
| **Lemon Squeezy** | MoR, prix entre Stripe/Paddle | écosystème plus jeune | 5 % + 0,50 $ |

**Recommandation** : **Paddle** pour V1 (pas envie de gérer TVA EU manuellement). Switch vers Stripe en V2 si volume > 5 000 €/mois (économie sur les frais).

### F.2 — Comptabilité

| Outil | Plan | Coût |
|---|---|---|
| **Pennylane** ou **Indy** | Pennylane Solo Pro 30 €/mois | 360 €/an |
| Expert-comptable | 1 200–2 000 €/an (bilan + déclarations) | 1 500 €/an estim |

**Total an 1** : ~1 860 €/an cash-out comptabilité.

### F.3 — Statut juridique

| Option | Pro | Con |
|---|---|---|
| **Auto-entrepreneur** | Simple, pas de TVA jusqu'au seuil 36 800 € BNC | Plafond serré, pas crédible vis-à-vis investisseurs |
| **EURL/SASU IS** | Crédible, scalable | Frais création ~500 €, comptable obligatoire, IS |

**Recommandation** : commencer en **AE** pour V1 (premiers 6–12 mois) tant que CA < 30 K€, basculer en **EURL ou SASU** quand ça décolle.

### F.4 — Effort Didier

- Création AE / société : 0,5 j-h
- Setup Pennylane + flux Paddle : 1 j-h
- Routine mensuelle compta : 0,5 j-h/mois
- Bilan annuel coordination expert-comptable : 1 j-h/an

**Total init F** : ~1,5 j-h + 500 € (création société si SASU).
**Récurrent F** : ~0,5 j-h/mois + ~155 €/mois (Pennylane + amortissement compta).

---

## G. Récapitulatif planning + cashflow

### G.1 — Calendrier V1 (avril 2026 → décembre 2026)

| Mois | Bloc dev | Bloc commercial | j-h dev | j-h hors-dev |
|---|---|---|---|---|
| **Avril 2026** (en cours) | finitions DASH-V2, polish bail, BIZPLAN | – | 12 | 3 |
| **Mai 2026** | A.1 + A.3 (Drive 2H/2F/2G + audit + sécu innerHTML) | enregistrement domaine, Pennylane setup | 14 | 1 |
| **Juin 2026** | LEGAL-2044 + LEGAL-BILAN-ANNUEL + bugs P1 | DPA + CGU avocat (kick-off) | 14 | 1 |
| **Juillet 2026** | BAIL-TYPES + IMPORT-CONCURRENTS + standards marché | identité visuelle freelance | 14 | 2 |
| **Août 2026** | V3-VISUEL (priorité) + EDL délégué export/import | – | 12 | 1 |
| **Septembre 2026** | V3-REFONTE-LOYERS/QUIT/IRL + tests recette | landing page, SEO content init (12 articles) | 8 | 5 |
| **Octobre 2026** | derniers polish + recette finale | LANCEMENT public + ads + tutos vidéos | 5 | 10 |
| **Nov–Déc 2026** | maintenance, support, polish post-launch | content + ads + LinkedIn outreach | 4/mois | 12/mois |
| **Total dev V1** | – | – | **~75 j-h** | – |
| **Total hors-dev V1** | – | – | – | **~37 j-h** |

→ **112 j-h utiles sur 9 mois = 12,4 j-h/mois moyen**, sous le seuil 15–18 j-h/mois → **réaliste solo**.

### G.2 — Cash-out V1 (avril → décembre 2026)

| Poste | Montant € HT |
|---|---|
| Domaine + email Resend (avr–déc) | ~150 € |
| Identité visuelle (logo, charte) | 1 500 € |
| Avocat (CGU, CGV, DPA, EDL valid) | 3 000 € |
| Création société (si SASU) | 500 € |
| Compta Pennylane (12 mois) | 360 € |
| Expert-comptable an 1 | 1 500 € |
| Marketing : ads (oct–déc, 3 mois × 600 €) | 1 800 € |
| Marketing : SEO sous-traité (oct–déc, 3 mois × 400 €) | 1 200 € |
| Outils support (Crisp Pro, Plausible, Loom) | 360 € |
| Buffer 10 % | 1 050 € |
| **TOTAL cash-out an 1** | **~11 500 € HT** |

### G.3 — Cash-out an 2 (V2 + cruise) — informatif

| Poste | Montant € HT |
|---|---|
| Récurrent infra (email, Sentry, Plausible) | 800 € |
| Récurrent compta (Pennylane + EC + URSSAF société) | 2 500 € |
| Marketing ads (12 mois × 600 €) | 7 200 € |
| Marketing SEO sous-traité (12 mois × 400 €) | 4 800 € |
| Backend V2 (hébergement Render + Auth0) | 600 € |
| Avocat ponctuel (multi-users, portail loc) | 1 200 € |
| **TOTAL cash-out an 2 hors recrutement** | **~17 100 € HT** |

---

## H. Recrutement — quand et qui

### H.1 — V1 (Q4 2026) : aucun recrutement requis

Didier solo gère dev + marketing + support. **MAIS** : plafond hard à ~200 utilisateurs payants (au-delà, support absorbe tout son temps).

### H.2 — V2 (2027) : recrutements à anticiper

| Profil | Quand | Coût annuel | Justification |
|---|---|---|---|
| **Rédacteur SEO immobilier** (freelance) | dès lancement V1 | 4 800 €/an (1 j/sem) | déjà compté §E.6 |
| **Designer UI/UX freelance ponctuel** (V3-VISUEL renforcé, V2 portail loc) | Q1 2027 | 3 000–6 000 € | sprint 4–6 jours |
| **Dev junior front (alternant ou freelance)** | Q2 2027, si > 300 utilisateurs payants | 24 000 €/an alternant ou 350 €/jour freelance | pour libérer Didier vers backend V2 / agence |
| **Ops support / customer success** | Q3 2027 si > 500 utilisateurs payants | 32 000 €/an | sinon support tue le dev |

**Seuil de basculement** : à partir de **300 utilisateurs payants**, recrutement freelance dev + freelance support quasi-obligatoire.

---

## I. Sensibilité : variantes de scénario

### I.1 — Scénario "minimum viable" (dérapage / pivot)

Si V1 ne décolle pas commercialement (< 50 clients payants à 6 mois post-launch) :
- Garder app gratuite + monétisation indirecte (partenariats GLI, MRH, expert-comptable)
- Effort dev pour maintenance ≈ 4 j-h/mois
- Pas de recrutement
- Cash-out an 2 réduit à ~5 000 €

### I.2 — Scénario "boost" (hyper-croissance)

Si V1 cartonne (> 200 clients payants à 6 mois) :
- Lever **150–300 K€ pre-seed** (Naxicap-like, BPI Innovation, business angels proptech)
- Recruter en avance : 1 dev + 1 support dès Q2 2027
- Cash-out an 2 : 80–120 K€

### I.3 — Scénario "agence pro V2" (B2B extension)

Coûts marginaux pour module agence :
- AGENCE-GESTION + CRG + HONORAIRES : ~15 j-h
- Infra dédiée (clients agences = données serveur) : 200 €/mois
- Démarchage agences (terrain) : 1 j-h/semaine
- Total : **+15 j-h dev + 8 000 € marketing dédié an 2**

---

## J. Risques techniques & mitigation

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| ARCHI-DB-DOUBLONS bug en prod | Moyenne | Haut | Fix `_syncLogToBail()` documenté + tests Playwright à ajouter |
| Drive sync conflits multi-devices | Haute | Moyen | DRIVE-2F (OCC) prioritaire avant V1 |
| Avocat EDL trouve une non-conformité | Moyenne | Moyen-haut | Buffer 1–2 j-h corrections post-validation |
| Audit XSS révèle des cas manquants | Haute | Haut | Buffer 2 j-h dans A.1 (déjà compté) |
| Backend V2 dépassement (multi-users) | Haute | Haut | Plan V2 détaillé requis avant code, pas avant Q1 2027 |
| Plafond AE atteint (36,8k€ BNC) | Faible an 1 | Moyen | Bascule SASU pré-emptive si CA > 25 K€ à mi-an 1 |

---

## K. Décisions structurantes à valider

- [ ] **Statut juridique** : AE → SASU dès création, ou bascule différée ?
- [ ] **Stripe vs Paddle** : confirmer Paddle V1 (TVA EU automatique)
- [ ] **Sous-traitance SEO** : recruter rédacteur dès août 2026 ou faire soi-même les premiers articles ?
- [ ] **Landing page** : Astro vs Vanilla vs WordPress (recommandation : Astro pour cohérence stack)
- [ ] **Domaine** : immotrack.fr OU immotrack.app OU autre — à acheter avant juin 2026
- [ ] **Drive sync** : conserver en V1 (différenciant RGPD) ou retirer (simplifier) ? Recommandation : **conserver**.
- [ ] **Pricing modèle** : voir PROJECTIONS.md — la décision pricing impacte le break-even du chiffrage.
