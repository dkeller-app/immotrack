# Projections financières ImmoTrack — 3 scénarios sur 3 ans

> Livrable 3/5 du dossier BIZPLAN-STRATEGIE.
> Horizon de projection : Q4 2026 (lancement V1) → Q4 2029.
> Toutes les projections sont en € HT. Toutes les hypothèses sont signalées.

---

## 0. Synthèse exécutive

| Scénario | Fin 2026 (V1) | Fin 2027 | Fin 2028 | Fin 2029 | Break-even mensuel |
|---|---|---|---|---|---|
| **🔻 Bas** (slow-burn) | 60 clients · 7 K€ ARR | 250 clients · 32 K€ ARR | 600 clients · 80 K€ ARR | 1 100 clients · 155 K€ ARR | atteint Q3 2027 |
| **▶ Médian** (cible) | 150 clients · 19 K€ ARR | 700 clients · 100 K€ ARR | 1 800 clients · 280 K€ ARR | 3 200 clients · 540 K€ ARR | atteint Q1 2027 |
| **🔺 Haut** (boost) | 350 clients · 49 K€ ARR | 1 600 clients · 240 K€ ARR | 4 000 clients · 660 K€ ARR | 7 500 clients · 1,3 M€ ARR | atteint Q4 2026 |

**Lecture** :
- Le scénario **médian = cible réaliste** (équivaut à 1,5 % du parc Gererseul à 3 ans, ou 0,3 % du parc Rentila — donc loin d'être agressif).
- Le scénario **bas** garde la viabilité du projet (Didier solo continue, profitabilité atteinte fin 2027) mais sans hyper-croissance.
- Le scénario **haut** suppose une levée pre-seed Q1 2027 (150–300 K€) et 1 recrutement dès mi-2027.

---

## 1. Hypothèses de modèle économique

### 1.1 — Pricing recommandé (à valider)

| Plan | Limite | Prix mensuel | Prix annuel (–17 %) | Cible |
|---|---|---|---|---|
| **🆓 Solo Découverte** | 1 logement, fonctions de base | **0 €** (gratuit illimité) | – | acquisition / freemium → conversion |
| **💼 Investisseur** | 2–10 logements, multi-entités, EDL délégué, snapshot signé, fiscal complet | **9,90 €/mois** | 99 €/an | cible primaire (60–70 % du portefeuille attendu) |
| **🏛️ SCI/Patrimoine** | 11–30 logements, multi-SCI, clauses perso, mandataire Hoguet, 2072 SCI (V2) | **19,90 €/mois** | 199 €/an | cible secondaire SCI (20–25 %) |
| **🏢 Agence Pro** (V2 dispo Q3 2027) | mandants, CRG, honoraires, multi-users, portail loc | **49,90 €/mois/utilisateur** | 499 €/an/user | cible V2 (5–10 %) |

**ARPU moyen pondéré V1 (sans agence)** :
- 65 % × 9,90 € + 25 % × 19,90 € + 10 % × 0 € = **~11,40 €/mois** (sur clients payants)
- Si on inclut les utilisateurs gratuits dans la base : ARPU global plus bas, mais c'est l'ARPU "client payant" qui pilote la modélisation.

**Hypothèse clé** : taux de conversion freemium → payant = **15 %** (benchmark SaaS B2C 5–25 % selon onboarding ; 15 % est conservateur).

### 1.2 — Produits d'appel (revenus complémentaires, à valider)

| Produit | Pricing | Fréquence | ARPU contribué |
|---|---|---|---|
| **EDL délégué offline** (pay-per-use, non-abonnés) | 9 € HT / EDL généré | 1 EDL / 50 visiteurs site/mois | ~3–5 €/mois sur 100 utilisateurs (négligeable V1, à industrialiser V2) |
| **Pack template bail premium** | 19 € HT | 1 % visiteurs | ~1 €/mois (négligeable) |
| **Partenariats** : commission GLI / MRH / expert-comptable | 5–15 % rétrocession partenaire | Si 5 % de la base souscrit GLI à 2,55 % du loyer × 700 €/mois × 12 mois = ~12 €/an | ~50 €/mois sur 600 clients (10 % de l'ARR) |

**Conclusion** : sur V1, modéliser uniquement l'abonnement. Produits d'appel = upside, pas dans le cas central.

### 1.3 — Coûts unitaires (CAC, COGS, churn)

| Métrique | Hypothèse retenue | Source |
|---|---|---|
| **CAC SEO/organic** | 12 € | benchmark SaaS B2C niche : 5–25 € |
| **CAC paid ads** (Meta + Google) | 45 € | benchmark : 30–60 € pour SaaS proptech |
| **Mix acquisition cible** | 60 % SEO/organic + 40 % paid | hypothèse réaliste avec content investi |
| **CAC moyen pondéré** | 0,6 × 12 + 0,4 × 45 = **25 €** | – |
| **Churn mensuel** | 5 % | benchmark SaaS B2C immo : 4–8 % (Gererseul/Rentila plutôt 3 %, BailFacile/Qalimo 6–8 %) |
| **Durée moyenne client** | 1 / 0,05 = **20 mois** | dérivé du churn |
| **LTV brut** (avant COGS) | 11,40 € × 20 = **228 €** | – |
| **Marge brute** (après hosting + Paddle 5 % + email) | ~80 % | hosting près de zéro, principal coût = Paddle MoR 5 % |
| **LTV net** | 228 × 0,80 = **~182 €** | – |
| **LTV / CAC ratio** | 182 / 25 = **7,3** | très bon (> 3 = sain, > 5 = excellent) |
| **Payback CAC** | 25 / (11,40 × 0,80) = **2,7 mois** | < 12 mois = sain |

---

## 2. Scénario médian (cible)

### 2.1 — Acquisition mensuelle de nouveaux clients payants

| Mois | Nouv. clients | Source |
|---|---|---|
| Oct 2026 (lancement) | 30 | early bird + LinkedIn perso + r/vosfinances |
| Nov 2026 | 35 | bouche-à-oreille + ads up |
| Déc 2026 | 40 | SEO commence à indexer |
| Q1 2027 | 60 / mois | content prend |
| Q2 2027 | 80 / mois | – |
| Q3 2027 | 90 / mois | – |
| Q4 2027 | 100 / mois | maturité content + comparatifs |
| 2028 (Q1–Q4) | 110 / mois moyen | – |
| 2029 (Q1–Q4) | 120 / mois moyen | – |

### 2.2 — Tableau ARR / cashflow

> Calcul : `ARR fin période = clients × ARPU × 12`. Churn appliqué mensuellement.

| Période | Clients (net après churn) | MRR (€) | ARR (€) | Coûts cumulés (€) | Cash-flow cumul (€) |
|---|---|---|---|---|---|
| Q4 2026 | 150 | 1 600 | 19 K€ | –11 500 | **–11 100** |
| Q1 2027 | 280 | 3 100 | 37 K€ | –15 700 | **–10 800** |
| Q2 2027 | 440 | 5 000 | 60 K€ | –20 200 | **–7 800** |
| Q3 2027 | 580 | 6 600 | 79 K€ | –24 800 | **–2 200** |
| **Q4 2027** | **700** | **8 300** | **100 K€** | **–29 800** | **+5 100** ← break-even cumulé |
| Q1 2028 | 920 | 10 800 | 130 K€ | –35 800 | +18 700 |
| Q2 2028 | 1 200 | 14 200 | 170 K€ | –42 800 | +44 800 |
| Q3 2028 | 1 480 | 17 600 | 211 K€ | –56 000 | +90 600 |
| Q4 2028 | 1 800 | 23 100 | 277 K€ | –74 000 | +166 000 |
| 2029 fin | 3 200 | 45 000 | 540 K€ | –180 000 | +540 000 cumul net |

### 2.3 — Compte de résultat simplifié médian

| Année | Revenus | COGS (20 %) | Charges fixes | Marketing | Salaires (recrut) | EBITDA | Marge |
|---|---|---|---|---|---|---|---|
| 2026 (3 mois) | 4 K€ | 1 K€ | 2 K€ | 3 K€ | 0 | **–2 K€** | – |
| 2027 | 60 K€ | 12 K€ | 8 K€ | 15 K€ | 0 | **+25 K€** | 42 % |
| 2028 | 175 K€ | 35 K€ | 14 K€ | 30 K€ | 30 K€ (1 freelance) | **+66 K€** | 38 % |
| 2029 | 380 K€ | 76 K€ | 20 K€ | 60 K€ | 80 K€ (2 recruts) | **+144 K€** | 38 % |

### 2.4 — Lecture

- Break-even cumulé Q4 2027, soit ~12 mois après lancement → **viable solo, sans levée**.
- Marge EBITDA stabilisée à ~38 % en cruise = standard SaaS B2C niche.
- À fin 2029, ARR de 540 K€ avec EBITDA 144 K€ → si revente : multiple typique 3–5× ARR pour SaaS proptech français = **valorisation 1,6–2,7 M€**.

---

## 3. Scénario bas (slow-burn)

### 3.1 — Hypothèses dégradées

- Conversion freemium → payant : **8 %** (vs 15 % médian)
- Acquisition mensuelle plafonne à **30/mois** en cruise (vs 100)
- Churn : **7 %/mois** (LTV brut 163 €, ratio 6,5 — encore sain)
- Paid ads : 200 €/mois max (budget contraint)

### 3.2 — Tableau ARR

| Période | Clients (net) | MRR (€) | ARR (€) | Cumulé cash |
|---|---|---|---|---|
| Q4 2026 | 60 | 600 | 7 K€ | –10 500 |
| Q4 2027 | 250 | 2 700 | 32 K€ | –4 000 |
| Q4 2028 | 600 | 6 700 | 80 K€ | +30 000 |
| Q4 2029 | 1 100 | 12 800 | 155 K€ | +95 000 |

### 3.3 — Lecture

- **Break-even cumulé fin 2028** (24 mois post-lancement).
- ARR fin 2029 = 155 K€, EBITDA ~30 K€ → projet survivable mais peu dynamique.
- Pas de recrutement.
- Stratégie possible si bas : **pivoter monétisation vers partenariats** (commission GLI/MRH/EC) qui peut représenter 30–40 % de l'ARR → bonification +30 K€/an.

---

## 4. Scénario haut (boost)

### 4.1 — Hypothèses dopées

- Conversion freemium → payant : **22 %** (excellent product-market fit)
- Levée **pre-seed 200 K€** en Q1 2027 (Naxicap-like, BPI Innovation, ou angels proptech)
- Recrutement dev junior + customer success dès Q2 2027
- Paid ads boostés : 1 500–3 000 €/mois
- Churn : **3 %/mois** (LTV brut 380 €, payback 1,4 mois)
- Lancement V2 (multi-users, agence) Q3 2027 — capture clientèle SCI familiale + petites agences

### 4.2 — Tableau ARR

| Période | Clients | MRR | ARR | Cash cumul (post-levée) |
|---|---|---|---|---|
| Q4 2026 | 350 | 4 100 | 49 K€ | –11 500 |
| Q1 2027 (levée) | 600 | 7 200 | 86 K€ | +180 000 (post-levée) |
| Q4 2027 | 1 600 | 20 000 | 240 K€ | +110 000 |
| Q4 2028 | 4 000 | 55 000 | 660 K€ | +250 000 |
| Q4 2029 | 7 500 | 110 000 | 1,32 M€ | +700 000 |

### 4.3 — Lecture

- ARR 1,3 M€ à 3 ans = équivalent à 30 % de la base utilisateurs Gererseul (42 K) ou 15 % Rentila (50 K).
- Valorisation potentielle Q4 2029 : 4–6× ARR = **5–8 M€**.
- Risques : épuisement (Didier doit pouvoir déléguer), perte du caractère "outil indé" qui fait le différenciant.
- Trajectoire la plus probable si **PMF démontré dès Q1 2027 (60+ clients/mois en organic)**.

---

## 5. Sensibilité — leviers principaux

### 5.1 — Tornade impact sur ARR fin 2027 (médian = 100 K€)

| Levier | Variation –20 % | Médian | Variation +20 % |
|---|---|---|---|
| Pricing ARPU (9,90 → 7,90 ou 11,90) | 80 K€ | 100 K€ | 120 K€ |
| Conversion freemium (15 → 12 ou 18 %) | 80 K€ | 100 K€ | 120 K€ |
| Churn (5 → 6 ou 4 %) | 84 K€ | 100 K€ | 122 K€ |
| Acquisition mensuelle | 80 K€ | 100 K€ | 120 K€ |

**Verdict** : modèle linéaire en ces 4 variables → focus sur **acquisition (= SEO + content)** car c'est le levier le plus actionnable, le pricing vient après.

### 5.2 — Risque-clé : entrée d'un acteur dominant low-cost

Si Septeo Group lançait une offre B2C à < 10 €/mois (peu probable mais à surveiller), ImmoTrack devrait :
1. Renforcer ses 12 ⭐ différenciants (EDL délégué = moat principal)
2. Pivoter prix vers 7,90 € + agressif sur SCI haut de gamme à 24,90 €
3. Accélérer V2 portail locataire pour glisser vers segments captifs

### 5.3 — Risque-clé : Rentila lance un freemium élargi

Rentila pousse déjà le low-cost. Si freemium gratuit étendu à 5 logements, la cible "investisseur 2–5" peut basculer.
**Mitigation** : positionner ImmoTrack solo sur "0 € **et** vraiment complet (EDL, dashboard, IRL, fiscal)" plutôt que se battre sur le prix payant.

---

## 6. Comparaison à benchmarks marché

### 6.1 — Pricing relatif

| Outil | Plan entrée (€/mois) | Plan multi (€/mois) | Trustpilot |
|---|---|---|---|
| Rentila | 0–8 | 8 | 4,5/5 |
| Smartloc | 6,50 | 12,50–20 | n/a |
| Qalimo | 0–5 | 5–15 | 4,9/5 |
| ImmobilierLoyer | 7,70 | 12,50 | n/a |
| BailFacile | 9,90 | 19,90 | n/a |
| Gererseul | 9,75 | 9,75+ | 4,8/5 |
| **ImmoTrack proposé** | **0** | **9,90 / 19,90** | – |

→ **Pricing aligné sur BailFacile** mais avec **freemium 1 bien plus généreux que Rentila** (vraiment complet, pas bridé). Argument commercial : "tout Rentila + plus, gratuit pour le premier bien".

### 6.2 — Métriques SaaS comparées (benchmarks internationaux)

| Métrique | Benchmark SaaS B2C niche | ImmoTrack médian projeté |
|---|---|---|
| Churn mensuel cible | 3–6 % | 5 % ✅ |
| LTV/CAC | > 3 | 7,3 ✅✅ |
| Payback CAC | < 12 mois | 2,7 mois ✅✅ |
| Marge brute | > 70 % | 80 % ✅ |
| Croissance MRR Y2 | > 100 % | +250 % ✅✅ |
| EBITDA cruise | 25–40 % | 38 % ✅ |

→ Toutes métriques au vert dès le scénario médian. Si exécuté, projet "fundable" même sans levée.

---

## 7. Scénario de revente / sortie

### 7.1 — Acquéreurs potentiels à 3 ans

| Acquéreur | Logique | Multiple ARR estimé |
|---|---|---|
| **Septeo Group** | extension B2C de leur ADB (déjà fait avec INCH) | 4–6× |
| **Manda** | acquisition produit pour client final | 3–5× |
| **Rentila / Gererseul** | consolidation B2C | 3–4× |
| **Naxicap, Apax, autre PE proptech** | build-up B2C + pro | 5–7× |

### 7.2 — Valorisation théorique

- Scénario médian fin 2029 (540 K€ ARR) : **1,6–2,7 M€** (3–5× ARR)
- Scénario haut fin 2029 (1,3 M€ ARR) : **5–8 M€** (4–6× ARR)

→ Le scénario médian seul amène déjà à un patrimoine pro de 1,6 M€+ après 3 ans, sans avoir besoin de lever ni de recruter en masse.

---

## 8. Décisions structurantes pour valider les projections

- [ ] **Pricing final** : confirmer 9,90 €/19,90 € OU passer à 7,90 €/14,90 € pour pénétration plus rapide ?
- [ ] **Freemium agressif** (1 bien gratuit illimité) OU essai 14 jours seulement ?
- [ ] **Annual discount** : 17 % (= 2 mois offerts) ou 25 % (= 3 mois offerts) ?
- [ ] **Acquisition primaire** : SEO (long mais durable) ou paid ads (court mais coûteux) ?
- [ ] **Partenariats GLI/MRH/EC** activés en V1 (revenus complémentaires) ou V2 ?
- [ ] **Levée pre-seed Q1 2027** : option à activer si scénario haut, à laisser fermée si médian ?
- [ ] **Statut** : auto-entrepreneur an 1 (plafond 36,8 K€ BNC) puis bascule SASU dès atteinte du seuil ?

---

## 9. Limites et précautions

- **Hypothèse acquisition mensuelle** : calibrée sur benchmarks BailFacile/Smartloc lancements (pas de chiffre public, estimation conservatrice).
- **Churn 5 %** : standard B2C SaaS niche, mais le marché immobilier français est très "fidèle" (un bailleur change peu d'outil) — possible que churn réel soit < 4 %.
- **Conversion freemium** : 15 % cible mais valeurs réelles très variables (Spotify ~50 %, Dropbox ~4 %, médian SaaS niche pro 15–25 %). Calibration via early adopters dans les 3 premiers mois critique.
- **Pricing unique sur le panel** : aucun concurrent ne combine "tout-en-un + prix accessible + souverain + différenciants". Test A/B nécessaire 9,90 € vs 12,90 € post-V1.

---

## Sources et benchmarks utilisés

- Rental Property Mgmt SW Market mondial : [verifiedmarketreports.com](https://www.verifiedmarketreports.com/product/rental-property-management-software-market/)
- Croissance VILOGI 2024 +47 % : [businesscoot.com SaaS](https://www.businesscoot.com/fr/etude/le-marche-du-software-as-a-service-france)
- Septeo CA 2024 : [touleco.fr](https://www.touleco.fr/Septeo-prevoit-d-investir-40-millions-d-euros-en-R-D-en-2024,41952)
- Rentila base utilisateurs : [bailpdf.com/rentila](https://bailpdf.com/gestion-locative/rentila), [lafabriquedunet.fr](https://www.lafabriquedunet.fr/logiciel/rentila)
- Gererseul base 42 000 : [gererseul.com](https://www.gererseul.com/), [investissement-locatif-avis.fr/gererseul](https://investissement-locatif-avis.fr/gererseul-avis-2/)
- Manda 43 M€ Naxicap : [maddyness.com/manda](https://www.maddyness.com/2024/02/22/proptech-hello-syndic-et-flatlooker-fusionnent-pour-donner-naissance-a-un-poids-lourd-de-limmobilier/)
- Imodirect 500 K€ premier tour : [cfnews.net/imodirect](https://www.cfnews.net/L-actualite/Capital-innovation/Operations/1er-tour/Imodirect-forfaitise-son-premier-tour-255491)
- INSEE parc locatif privé 2025 : [insee.fr/8640662](https://www.insee.fr/fr/statistiques/8640662)
- Comparatif quantitatif interne : `ImmoTrack_Comparatif_Concurrents_2026.xlsx`
