# Carte de positionnement & analyse concurrentielle ImmoTrack — avril 2026 (métriques sociétés rafraîchies juillet 2026)

> Livrable 2/5 du dossier BIZPLAN-STRATEGIE.
> Source quantitative principale : `ImmoTrack_Comparatif_Concurrents_2026.xlsx` (149 critères, 9 outils, scorecard pondérée) + onglet **Sociétés** ajouté 2026-07.
> Sources qualitatives : sites éditeurs, Trustpilot, presse spécialisée (sources listées en fin de doc).
> **📊 Benchmark sociétés (CA, users, levées, effectifs, roadmap) daté 2026-07-07 : [BENCHMARK-CONCURRENCE-2026-07.md](BENCHMARK-CONCURRENCE-2026-07.md).** Les blocs « **Société (juil. 2026)** » ci-dessous en sont l'extrait sourcé.

---

## 1. Lecture rapide — où en est ImmoTrack

| Métrique | Valeur | Signal |
|---|---|---|
| Score pondéré comparatif (149 critères) | **54,7 %** | dernière place du panel — couverture brute insuffisante |
| Critères ✅ Oui complet | 62 | base solide niveau bail / EDL / IRL / dashboard |
| Critères ⭐ Différenciants exclusifs | **12** | seul outil du panel à en avoir (tous les autres : 0) |
| Critères 🟡 Partiel | 9 | à finir, pas à inventer |
| Critères 🔵 Roadmap | 12 | dont 2044/2072/portail loc/multi-users |
| Critères ❌ Absents | 51 | dont multi-users, email, eIDAS, mobile natif, DSP2 |

**Conclusion immédiate** : ImmoTrack n'est PAS l'outil le plus complet du marché aujourd'hui (Crypto/Septeo et LOCKimmo plafonnent à 86,2 %, Qalimo à 71,1 %, Gererseul à 67,8 %), mais c'est le seul du panel à avoir 12 critères exclusifs. La stratégie doit donc être **"focus sur les différenciants exclusifs + combler le minimum vital"**, pas "rattraper la couverture totale".

---

## 2. Cadrage du panel concurrent

### 2.1 — Périmètre

Le marché de la gestion locative en France se divise en **trois familles distinctes** qu'on confond souvent :

| Famille | Acteurs | Modèle | Cible |
|---|---|---|---|
| **B2C SaaS particuliers** | Rentila, BailFacile, Smartloc, Qalimo, Gererseul, ImmobilierLoyer, Smovin | Abonnement 5–30 €/mois | Bailleurs perso 1–20 logements, SCI familiales |
| **B2B SaaS pro (admin biens / syndic)** | Septeo (ADB, Crypto, ICS), LOCKimmo, Powimo (Seiitra), Vilogi, Even, Hektor (transaction) | Devis 80–300 €/mois/utilisateur | Agences, admins de biens, syndics |
| **Agences digitales** (≠ logiciel) | Manda, Imodirect, Hellio | % du loyer (5–8 %) ou €/m² | Bailleurs voulant déléguer 100 % |

**ImmoTrack se positionne en B2C SaaS particuliers**, avec un sous-segment cible "SCI familiale + investisseur 2–10 logements". L'analyse concurrentielle se concentre donc sur cette famille (8 acteurs principaux), avec un panorama B2B en référentiel pour comprendre la consolidation du marché et l'option d'extension V2.

### 2.2 — État de consolidation du marché

Donnée structurante pour la stratégie 2026–2027 :

- **Septeo Group** (Montpellier) : CA 2024 = **420 M€ (+20 %)**, objectif 2025 ~500 M€, **valorisation > 3,5 Md€**. Actionnariat Hg (majoritaire) + Téthys Invest + GIC (11/2024) + **Bpifrance (04/2025)**. Acquisitions INCH (10/2025) + **stp.one Allemagne (>500 M€, plus grosse à date)**. Vise **> 1 Md€ de revenus 2030**. ⚠️ **« Crypto » n'appartient PAS à Septeo mais à Orisha** — le pôle immo Septeo = **Septeo ADB / SPI** (3 200 agences, >950 K lots locatifs + >1,98 M lots syndic gérés). Trustpilot 1,6–1,9/5 (satisfaction basse). (Sources : entreprises-occitanie, hgcapital, MySweetImmo, Wikipédia)
- **Manda** (ex-Hello Syndic + Flatlooker) : **21 M€ (05/2023) + 43 M€ (02/2024) Naxicap** (structure LBO), 40 000 clients à la fusion, **5 acquisitions 2024 + ~15 visées 2025** (roll-up de syndics). CA ex-Hello Syndic 2024 = 4,34 M€ mais **RN −11,7 M€ (cash burn élevé)**, capitaux propres sous la moitié du capital. Objectif 200→1 300 salariés en 5 ans. (Source : Maddyness, societe.com)
- **VILOGI** : SAS créée 2010, CA confidentiel, **RN 2024 = 144 K€**, croissance déclarée **+47 % 2024** (build-up : rachats MIP Alpes + AGLI). ~1 200–1 500 clients, ~12 000 users simultanés, 10–19 salariés. IA + sync bancaire Bridge. (Source : Journal de l'Agence, Immo Matin, societe.com)
- **LOCKimmo** : SARL créée 2006 (Oise, pas Montpellier), **CA 2023 = 1,79 M€ (+26,5 %), RN ~438 K€ — bootstrapped rentable**, ~1 200 clients, ~15 salariés. Refonte LOCKimmo.IO 2023 + IA. (Source : manageo, Immo Matin)
- **BailFacile** : SAS créée 2017, CA non publié (« rentable fin 2024 »), **100 000+ bailleurs**, levée non tranchée (bootstrap probable — capital 10 K€, détention 100 % fondateurs), ~50 salariés estim, Trustpilot 4,5–4,6 (2 500+ avis). (Source : Pappers, societe.com)
- **Rentila** : **éditeur bulgare (Rentila ltd, pas d'entité FR)**, créé 2008, 50 000 bailleurs / 200 000 biens, autofinancé, aucune levée. (Source : rentila.com/about)
- **Smartloc / ImmobilierLoyer** : deux **bootstrap rentables** (Smartloc CA 2024 761 K€ / RN +141 K€ ; ImmobilierLoyer RN +177 K€) → **preuve qu'un SaaS gestion locative B2C FR peut être rentable sans levée**. (Source : societe.com)
- **Imodirect** : 500 K€ levés en 2018 (post-création). (Source : CFNEWS)

**Lecture** : le marché B2B est en consolidation rapide et **bien capitalisée** (Septeo valo 3,5 Md€, Manda LBO Naxicap, Indy 86 M€) — mais **l'argent et le M&A sont concentrés côté pro/syndic, pas côté bailleur particulier**. Le marché B2C pur reste **fragmenté, bootstrap et sans leader dominant** (Rentila = plus grosse base mais low-cost/étranger ; Qalimo = notation record mais société de 18 mois ; Gérer Seul = base solide mais SARL artisanale). C'est la fenêtre d'entrée pour ImmoTrack. **Course à l'IA généralisée 2025-2026** (Rentila, BailFacile, LOCKimmo, Vilogi, Qalimo) → l'IA devient une commodité, pas un différenciant.

---

## 3. Fiches concurrents B2C (panel principal)

> Format unifié : positionnement / pricing / cible / USP / faiblesses / score / signaux faibles. Les chiffres "estimation" sont signalés.

### 3.1 — Rentila

- **Positionnement** : leader B2C accessible / freemium agressif
- **Pricing** : gratuit (1 lot, 2 baux, 2 locataires) → 8 €/mois max
- **Cible** : bailleur particulier 1–10 logements, débutant en gestion
- **USP** : prix imbattable, base utilisateurs énorme (50 000 bailleurs / 200 000 biens), rapprochement bancaire DSP2, comptabilité de base, locations saisonnières
- **Faiblesses** : interface vieillissante, support limité, pas de SCI avancée, pas de différenciants techniques ; **éditeur étranger (pas d'entité FR)**
- **Score Scorecard** : 63,1 % (3e du panel B2C)
- **Société (juil. 2026)** : **Rentila ltd** (société **bulgare**, immat. BG 203572574, Sofia — aucun établissement France) · créée **2008** · 50 000 bailleurs / 200 000 biens · **autofinancée, aucune levée** · effectifs « taille humaine » (non publiés) · CA non publié · Trustpilot 4,2–4,7/5 (~100 avis)
- **Pricing 2026** : Gratuit (1 bien) → **Silver 49 €/an** (2–5 biens) → **Gold 99 €/an** (illimité). E-signature + connexion bancaire + assistant IA inclus tous plans.
- **Sources** : [rentila.com/about](https://www.rentila.com/about), [rentila.com/pricing](https://www.rentila.com/pricing), [fr.trustpilot.com/rentila](https://fr.trustpilot.com/review/www.rentila.com)

### 3.2 — BailFacile

- **Positionnement** : "outil pro accessible" / cible jeune investisseur
- **Pricing** : 9,90 €/mois entrée, 19,90 €/mois multi-biens
- **Cible** : investisseur 1–5 logements, néo-bailleur, focus LMNP/LMP
- **USP** : très bon SEO content (blog dense), UX moderne, signature électronique intégrée, support juridique
- **Faiblesses** : pas de SCI avancée, pas de mandat Hoguet, comparatif fonctionnel moyen (55 % score) ; **opacité financière (CA non publié)**
- **Score Scorecard** : 55,0 %
- **Société (juil. 2026)** : **BAILFACILE SAS** (SIREN 827 909 078), créée **23/02/2017** par **Thibaud & Valentin Fily** (détention 100 % via holdings) · capital 10 K€ · **100 000+ bailleurs** (350 K abonnés newsletter) · **CA non publié** (« rentable fin 2024 ») · **levée non tranchée** (narratif bootstrap dominant ; 1 agrégateur cite 14,5 M€ non corroboré → à traiter comme « aucune levée confirmée de façon fiable ») · ~50 salariés (estim) · Trustpilot 4,5–4,6/5 (2 500+ avis)
- **Pricing 2026** : **9,99 €/mois/bien** (annuel) · 12,99 € mensuel · signature électronique illimitée incluse. **Assistant IA (clauses de bail tracées) depuis fin 2025.**
- **Sources** : [bailfacile.fr/tarifs](https://www.bailfacile.fr/tarifs), [pappers.fr/bailfacile](https://www.pappers.fr/entreprise/bailfacile-827909078), [societe.com/bailfacile](https://www.societe.com/societe/bailfacile-827909078.html)

### 3.3 — Smovin

- **Positionnement** : SaaS belge en expansion FR/BE/multi-pays
- **Pricing** : 4–8 €/bien/mois selon plan, 2 biens gratuits, devis au-delà 30 biens
- **Cible** : bailleur europhone 1–30 logements, multi-pays
- **USP** : facturation auto, multi-devises, app mobile, levée de fonds substantielle (montant non public)
- **Faiblesses** : conformité fiscale française imparfaite (pas 2044 ni 2072), score 55 % (= BailFacile) ; **fondamentaux financiers fragiles**
- **Score Scorecard** : 55,0 %
- **Société (juil. 2026)** : **SMOVIN SA** (Belgique, BE 0649.610.582), créée **03/03/2016** · filiale FR SIREN 899 002 810 · **CA 2023 = 889 K€** mais **RN −264 K€ (2024), pertes chroniques, fonds propres négatifs** (pertes en réduction) · **~1,4 M€ levés (2019–2020)** dont prêt Région wallonne, rien depuis · ~8,5 ETP (en baisse depuis 13) · 800+ investisseurs · **seul acteur VC du panel B2C** · Capterra ~7,4/10
- **Pricing 2026** : **5 €/bien/mois** (Standard) · Pro/Enterprise/Premium sur devis. **Expansion France = cible affichée.**
- **Sources** : [smovin.app/tarifs](https://www.smovin.app/fr-be/tarifs/), [companyweb.be/smovin](https://www.companyweb.be/), [lavenir.net/smovin](https://www.lavenir.net/cnt/dmf20200129_01438265/immobilier-importante-levee-de-fonds-pour-la-start-up-smovin)

### 3.4 — Qalimo

- **Positionnement** : meilleure UX/notation du marché
- **Pricing** : gratuit (1 bien) → ~5–15 €/bien/mois (formules "Investisseur" 2–6 biens, "Patrimoine" 7+)
- **Cible** : investisseur 1–10 logements, primo-utilisateur
- **USP** : 5/5 Google + 4,9/5 Trustpilot (record du marché), synchro bancaire DSP2, quittance auto sur paiement détecté, candidatures locataires intégrées, signature électronique
- **Faiblesses** : pas de différenciants exclusifs, pas de SCI avancée, scorecard 71,1 % mais 0 ⭐ ; **société très jeune (18 mois) et petite base**
- **Score Scorecard** : **71,1 % (1er du B2C)**
- **Société (juil. 2026)** : **QALIMO SAS** (SIREN 983 757 865), créée **12/01/2024** seulement · capital 1 110 € · **0 salarié** au registre · fondée par **Nicolas Thomas** (ex-huissier ~10 ans) + un dev · **6 500 bailleurs** revendiqués (≈10× plus petit que Rentila/Gérer Seul) · **aucune levée** · CA non publié (1er exercice) · **Trustpilot 4,9/5** (~89 avis, record marché)
- **Pricing 2026** : **Starter 4,90 €/bien/mois** (1–7 biens) · **Pro 343 €/an** (7–40) · Business/Enterprise sur devis. Add-ons : e-signature 2,90 €, LRAR 8,50 €, compta fiscale dès 399 €.
- **Lecture** : notation record mais **antériorité de 18 mois** — la traction est réelle mais la solidité (base, effectifs, ancienneté) reste à prouver dans le temps.
- **Sources** : [qalimo.fr/tarif](https://www.qalimo.fr/tarif/), [pappers.fr/qalimo](https://www.pappers.fr/entreprise/qalimo-983757865), [trustpilot.com/qalimo](https://www.trustpilot.com/review/qalimo.fr)

### 3.5 — Smartloc

- **Positionnement** : pure SaaS gestion + GLI intégrée
- **Pricing** : 6,50 €/mois (Zen, 1 bien, trim) → 7 €/mois (Zen+, annuel) → 12,50 € (2–4 biens) → 20 € (5–15 biens)
- **Cible** : investisseur 1–15 logements voulant un tout-en-un avec assurance loyer impayé
- **USP** : comparateur GLI intégré (dès 2,55 % loyer via Insured), vérif dossier locataire IA, app mobile native (4,7/5 store), créée 2012 (légitimité)
- **Faiblesses** : pas de SCI avancée, fiscalité limitée, scorecard 55 %
- **Score Scorecard** : 55,0 %
- **Société (juil. 2026)** : **GINZA SAS** (nom commercial Smartloc, SIREN 751 750 548), créée **30/05/2012** · capital 20 K€ · **CA 2024 = 761 K€ (+27 %), RN +141 K€ — bootstrap rentable** · aucune levée · 3–5 salariés · Google ~4,4/5. ⚠️ Ne pas confondre avec la SARL homonyme « Smartloc » à Bordeaux (sans lien).
- **Pricing 2026** : **Zen 6,50 €/mois** (1 bien) · Multi 12,50 € (2–4) · Investisseur 20 € (5–15). **GLI via courtier Insured dès 2,55 %** du loyer.
- **Sources** : [smartloc.fr/tarifs](https://www.smartloc.fr/tarifs), [societe.com/ginza](https://www.societe.com/societe/ginza-751750548.html)

### 3.6 — Gererseul

- **Positionnement** : challenger SCI / accompagnement humain
- **Pricing** : 9,75 €/mois (117 €/an) pour 1 bien, dégressif au-delà
- **Cible** : SCI / propriétaire qui veut un appui fiscal humain
- **USP** : **42 435 propriétaires / 48 123 lots**, 4,7/5 Trustpilot (543 avis — plus grosse base d'avis du B2C), acteur historique, rapprochement bancaire, **fiscaliste + accompagnement humain inclus**, gestion SCI avancée
- **Faiblesses** : pas d'application mobile native (web responsive seulement), interface "vieille école", pas de différenciants techniques rares
- **Score Scorecard** : 67,8 % (2e du B2C)
- **Société (juil. 2026)** : **GERERSEUL.COM SARL** (SIREN 513 148 023), créée **2009** (⚠️ pas 2007 comme indiqué précédemment) · capital 23,5 K€ · dirigeant **Patrick Chappey** · 3–5 salariés · **seul CA publié = 2010 (159 K€)**, rien depuis · **aucune levée** (SARL autofinancée) · ORIAS (intermédiaire assurance)
- **Pricing 2026** : **Garage dès 5 €/mois** · **Appartement 14,90 €/mois** · −15 % dès le 3e bien · essai 15 j.
- **Sources** : [gererseul.com](https://www.gererseul.com/), [societe.com/gererseul](https://www.societe.com/societe/gererseul-com-513148023.html), [trustpilot.com/gererseul](https://www.trustpilot.com/review/www.gererseul.com)

### 3.7 — ImmobilierLoyer

- **Positionnement** : seul outil B2C avec liasse 2072 SCI IR intégrée
- **Pricing** : 7,70 €/mois (1–3 lots annuel = 92,40 €/an), 9,50 €/mois mensuel, 12,50 €/mois (2–4 logements), option SCI 5 €/mois supplémentaires
- **Cible** : SCI familiale, comptable amateur, bailleur 1–10 logements
- **USP** : **liasse 2072 SCI IR (différenciant exclusif sur ce panel)**, bilan annuel par entité, suivi compte associés, distribution bénéfices, exports fiscaux 2044
- **Faiblesses** : interface 2010, app à télécharger (pas full web), pas d'app mobile, pas de différenciants UX
- **Score Scorecard** : 57,7 %
- **Société (juil. 2026)** : **SUPSOFT SAS** (SIREN 824 197 677), créée **14/12/2016** · capital 1 K€, Valbonne (06) · dirigeant Benoit Maire · **RN 2024 = 177 K€ (vs 135 K€ 2023) — bootstrap rentable** · aucune levée · éditeur artisanal (très petite structure) · Google ~5/5 (200+ avis) · « conçu/hébergé en France »
- **Pricing 2026** : abonnement annuel **dès 88,80 €/an** (1–3 locations) → **jusqu'à 1 017,60 €/an** (illimité) · options SCI + gérance pro · essai 30 j.
- **Sources** : [immobilierloyer.com/acheter](https://www.immobilierloyer.com/acheter.php), [societe.com/supsoft](https://www.societe.com/societe/supsoft-824197677.html)

### 3.8 — Itsmycoaching

> Hors scorecard (plus marginal). Acteur "ressource pédagogique" plus que SaaS pur. Pricing modèle conseil. Faible threat sur le périmètre cible.

---

## 4. Fiches concurrents B2B (référentiel + option V2)

### 4.1 — Septeo Group (Septeo ADB / SPI)

> ⚠️ **Correction juil. 2026 :** « **Crypto** » (La Solution Crypto) appartient à **ORISHA** (Orisha Real Estate), **PAS à Septeo** — le pôle immo Septeo = **Septeo ADB** (logiciels **SPI** : Gestion Locative / Syndic / Saisonnière) + Netty, Modelo, Kinaxia, INCH. La filiation « ICS » n'a pas pu être confirmée par source primaire. Le Scorecard 86,2 % avait été attribué à « Crypto/Septeo » : à re-ventiler (Crypto = Orisha) lors du prochain passage de la grille fonctionnelle.

- **Positionnement** : **leader marché B2B FR**, suite tout-en-un agences/notaires/avocats/admin biens
- **Pricing** : sur devis (~119 € HT/mois entrée immo, majoritairement sur devis)
- **Cible** : agences immobilières (3 200 cabinets ADB clients), syndics, transaction
- **USP** : couverture exhaustive, intégration suite Septeo, R&D ~100 M€ 2025, labo IA « Brain »
- **Société (juil. 2026)** : **SEPTEO GROUP SAS** (SIREN 934 859 240, topco 11/2024), groupe créé **2013** Montpellier · **CA groupe 2024 = 420 M€ (+20 %)**, objectif 2025 ~500 M€ · **valorisation > 3,5 Md€** · actionnariat **Hg (majoritaire) + Téthys Invest + GIC + Bpifrance (04/2025)** · ~3 100 salariés (dont 220 Septeo ADB immo) · immo : **>950 K lots locatifs + >1,98 M lots syndic** gérés · **Trustpilot 1,6–1,9/5 (« Mauvais »)**
- **Stratégie** : consolidation acquisitive (INCH 10/2025, **stp.one Allemagne >500 M€**), vise **> 1 Md€ revenus 2030**
- **Faiblesses** : prix prohibitif pour bailleurs particuliers, complexité onboarding, image "lourd"/corporate, **satisfaction client immo très basse (angle différenciant support/stabilité pour ImmoTrack)**
- **Sources** : [septeo-adb.fr](https://www.septeo-adb.fr/), [entreprises-occitanie.com](https://www.entreprises-occitanie.com/), [hgcapital.com/septeo](https://hgcapital.com/insights/septeo-la-success-story), [mysweetimmo.com/septeo-inch](https://www.mysweetimmo.com/2025/10/28/immobilier-septeo-muscle-son-offre-adb-avec-le-rachat-dinch/), [realestate.orisha.com/crypto](https://realestate.orisha.com/nos-solutions/crypto/)

### 4.2 — LOCKimmo

- **Positionnement** : challenger Septeo, modulaire
- **Pricing** : sur devis, plans Standard / Pro / Enterprise / Premium
- **Cible** : agences indépendantes
- **USP** : modulaire (gestion loc / syndic / transaction / location saisonnière / travaux), depuis 2006
- **Score Scorecard** : 86,2 %
- **Société (juil. 2026)** : **LOCKIMMO.COM SARL** (SIREN 492 291 489), créée **12/09/2006** · capital 103 K€, **Mouy (Oise)** — pas Montpellier · dirigeant Julien Dourlen · **CA 2023 = 1,79 M€ (+26,5 %), RN ~438 K€ — bootstrap rentable** · ~1 200 clients · ~15 salariés · aucune levée · Google 4,7/5 (195 avis). Refonte **LOCKimmo.IO** (2023) + IA (génération d'annonces, sync bancaire, module travaux).
- **Sources** : [lockimmo.com](https://www.lockimmo.com/), [manageo.fr/lockimmo](https://www.manageo.fr/entreprises/492291489.html), [immomatin.com](https://www.immomatin.com/logiciels/actualite/logiciel-immobilier-lockimmo-affiche-une-forte-croissance-de-son-activite.html)

### 4.3 — Powimo (Seiitra)

- **Positionnement** : tout-en-un syndic + gestion locative + comptabilité
- **Pricing** : sur devis
- **USP** : claim "#1 syndic du marché" (à vérifier vs ICS), plateforme intégrée
- **Sources** : [seiitra.com/powimo](https://www.seiitra.com/solutions/logiciel-syndic/), [realestate.orisha.com/powimo](https://realestate.orisha.com/nos-solutions/powimo-le-logiciel-integre-pour-la-gestion-locative-et-syndic/)

### 4.4 — Hektor (La Boîte Immo)

- **Positionnement** : leader transaction (≠ gestion locative pure)
- **Métriques** : 8 500 agences, 45 000 utilisateurs
- **Cible** : agents immobiliers transaction
- **Faible recouvrement avec ImmoTrack** (transaction ≠ gestion locative)
- **Source** : [la-boite-immo.com](https://www.la-boite-immo.com/)

### 4.5 — VILOGI / Even / ICS

- **VILOGI** : SaaS syndic + GL full web. **VILOGI SAS** (SIREN 528 341 571), créée **2010**, Paris · CA confidentiel, **RN 2024 = 144 K€**, croissance déclarée **+47 % 2024** (build-up : rachats **MIP Alpes + AGLI** en 2024) · ~1 200–1 500 clients, ~12 000 users simultanés, 10–19 salariés · IA générative + OCR factures + **sync bancaire Bridge** + app B2B2C « VILOGI & Me ». **Fort chevauchement avec les briques IA/DSP2 explorées par ImmoTrack.** Trustpilot 3,2/5 (1 avis, non significatif).
- **Even** : éditeur syndic
- **ICS** : leader syndic copro (cf étude USH 2022 : 114 répondants, 1er du panel)
- **Sources** : [vilogi.com](https://www.vilogi.com/), [societe.com/vilogi](https://www.societe.com/societe/vilogi-528341571.html), [journaldelagence.com](https://www.journaldelagence.com/1409173-dans-un-marche-tendu-la-gestion-locative-et-le-syndic-deviennent-des-leviers-de-revenus-recurrents-samuel-essaka-ekedi-vilogi), [union-habitat.org/etude-syndic](https://www.union-habitat.org/sites/default/files/articles/pdf/2022-04/ush-etude_logiciels_copropriete.pdf)

### 4.6 — Manda (agence digitale)

- **Positionnement** : ≠ logiciel SaaS, agence physique digitalisée
- **Pricing** : **gestion locative 4,9 % TTC/mois** (min 29 €) · mise en location 80 % du 1er loyer · GLI 2,5 %
- **Modèle** : fusion **Hello Syndic (2017) + Flatlooker (2016) le 22/02/2024**. **21 M€ (05/2023) + 43 M€ (02/2024) Naxicap** (LBO). **5 acquisitions 2024 + ~15 visées 2025** (roll-up de syndics). 40 000 clients à la fusion. Objectif 200→1 300 salariés en 5 ans.
- **Santé financière (juil. 2026)** : entité ex-Hello Syndic **CA 2024 = 4,34 M€ mais RN −11,7 M€** (cash burn du roll-up, capitaux propres sous la moitié du capital) — **modèle brûle-cash, à surveiller**. Trustpilot ~3,2/5 (~3 100 avis, polarisés).
- **Threat sur ImmoTrack** : indirect (capture le bailleur qui *veut déléguer*, pas celui qui *veut un outil*)
- **Source** : [maddyness.com/manda-rachats](https://www.maddyness.com/2024/10/28/la-proptech-manda-continue-de-grandir-et-annonce-de-nouveaux-rachats/), [societe.com/manda-ex-hello-syndic](https://www.societe.com/societe/manda-ex-hello-syndic-828499897.html)

### 4.7 — Imodirect

- **Pricing** : 11–15 €/m² + GLI 2,5 % loyer collecté
- **Modèle** : agence digitale créée 2018, 500 K€ levés
- **Threat sur ImmoTrack** : indirect (idem Manda)
- **Source** : [imodirect.com/tarif](https://www.imodirect.com/tarif), [cfnews.net/imodirect](https://www.cfnews.net/L-actualite/Capital-innovation/Operations/1er-tour/Imodirect-forfaitise-son-premier-tour-255491)

---

## 4bis. Panel fiscalité immobilière (spécialistes 2044 / SCI / LMNP) — ajouté juil. 2026

> Panel distinct, issu de l'audit [AUDIT-CONCURRENCE-FISCAL.md](AUDIT-CONCURRENCE-FISCAL.md). Enjeu : identifier qui est **frontal** sur la cible fiscale ImmoTrack = **le 2044 foncier nu du bailleur particulier en direct**. Détail sourcé dans [BENCHMARK-CONCURRENCE-2026-07.md](BENCHMARK-CONCURRENCE-2026-07.md) §3.

| Acteur | Société | Créé | CA / levées | Cible fiscale | 2044 nu direct ? | Prix repère | Note |
|---|---|---|---|---|---|---|---|
| **Déclaration-Foncier.fr** | KIPDEV SAS (884 120 890) | 2020 | CA confidentiel (<700 K€), aucune levée | **2044 foncier nu du particulier uniquement** | ✅ **Oui — pré-rempli case/case (PDF), cœur unique.** Pas d'EDI, pas LMNP/SCI | 19 € one-shot / 39 €/an | non trouvée |
| **Ownily** | incubé Crédit Mutuel Arkéa | 2020 | non publié | SCI (IR/IS) + LMNP | ✅ Oui mais **via SCI** (liasse 2072+2044, EDI-TDFC inclus) | 84–325 €/an | Trustpilot 4/5 (33 avis) |
| **Qlower** | QLOWER PATRIMOINE SAS (903 122 984) | 2021 | 565 K€ (Crowdcube 04/2024), 18 pers, ~10 K users | LMNP + SCI + nu (open banking) | ⚠️ 2044/2042 + EDI annoncés, case-par-case non documenté | 239 €/an | Google 4,6/5 |
| **Indy** (ex-Georges) | INDY.FR SAS (820 648 830) | 2016 | **~30,5 M€ (2024), ~86 M€ levés** | Cœur BIC/BNC + SCI + LMNP | ⚠️ 2044 **seulement via SCI**, ne cible pas le nu direct | freemium + ~24 €/mois | Trustpilot 4,8/5 (~14 K avis) |

**Lecture stratégique** :
- **Frontal exact** : **Déclaration-Foncier.fr** est le seul dédié au 2044 nu du particulier — micro-structure bootstrap, très low-cost (19–39 €), **mais fragile** (pas d'EDI, pas d'avis, société minuscule). C'est le **benchmark prix/simplicité** le plus proche de la cible ImmoTrack.
- **Frontal élargi** : **Ownily** produit la 2044 avec EDI, mais son entrée est la **SCI**, pas le bailleur nu en direct ; produit perçu comme stagnant.
- **Menaces latentes** (force de frappe, mais pas frontaux aujourd'hui) : **Indy** (mastodonte 86 M€, 4,8/5 sur 14 K avis, mais cœur BIC/BNC) et **Qlower** (open banking, app mobile, JEI).
- → Le créneau **2044 nu + traçabilité ligne-à-pièce** (cf audit fiscal) **reste peu couvert et défendable**.

---

## 5. Carte de positionnement 2D

### 5.1 — Axes retenus

- **Axe X (horizontal)** : **profil utilisateur** — solo perso (1–5 logements) ↔ pro (admin biens / agence)
- **Axe Y (vertical)** : **richesse fonctionnelle** (proxy = score Scorecard pondéré sur 149 critères) — entrée de gamme ↔ couverture pro

Le **prix** est traité comme couleur/taille de point (cf §5.3) plutôt qu'axe, car il est très corrélé à la richesse fonctionnelle.

### 5.2 — Carte (vue ASCII)

```
                                RICHESSE FONCTIONNELLE
                                         ↑
                                    100% │
                                         │
                                         │       ⬛ Septeo ADB / SPI
                                     90% │       (86,2 % · sur devis)
                                         │       ⬛ LOCKimmo
                                         │       (86,2 % · sur devis)
                                         │
                                     80% │
                                         │           ⬛ Powimo
                                         │           (n/a · pro syndic)
                                         │
                                     70% │     ● Qalimo (71,1 % · 5–15 €)
                                         │     ● Gererseul (67,8 % · 9,75 €)
                                         │
                                     60% │ ● Rentila (63,1 % · 0–8 €)
                                         │     ● ImmobilierLoyer (57,7 % · 7,70 €)
                                         │     ● BailFacile (55,0 % · 9,90 €)
                                         │     ● Smovin (55,0 % · 4–8 €)
                                         │     ● Smartloc (55,0 % · 6,50 €)
                                         │
                                     55% │  ⭐ ImmoTrack (54,7 % · 12 ⭐ exclusifs)
                                         │      ↗ trajectoire cible V1 = ~70 % + 12 ⭐
                                         │
                                     45% │
                                         │
                                         │                                                     PROFIL
                                          ────┼────────┼──────────┼──────────┼──────────────→
                                            SOLO    SOLO+SCI    PRO+        PRO
                                           1 bien   2-10 biens   <30 biens  agence
                                                                            multi-mandant

  ● = B2C SaaS abonnement     ⬛ = B2B SaaS pro (sur devis)     ⭐ = ImmoTrack
```

### 5.3 — Lecture

- **Quadrant solo / richesse haute (zone visée par ImmoTrack)** : actuellement Qalimo et Gererseul dominent. Les deux ont un Scorecard 67–71 % mais **0 différenciant exclusif**. C'est la zone d'attaque la plus crédible pour ImmoTrack.
- **Quadrant solo / prix bas** : Rentila domine en volume (50 000 bailleurs). Pas la même cible ni la même promesse.
- **Quadrant pro / richesse haute** : Septeo & LOCKimmo ont une couverture 86 % mais à un prix 10× supérieur. ImmoTrack ne doit PAS attaquer ce quadrant en V1 (rupture modèle données + exigences différentes).
- **Vide stratégique repéré** : pas d'acteur B2C avec **richesse fonctionnelle ≥ 70 % ET différenciants exclusifs ≥ 5 ET prix < 15 €/mois**. C'est la promesse-cible d'ImmoTrack V1.

### 5.4 — Trajectoire cible V1 (Q4 2026)

ImmoTrack doit passer de **(54,7 %, 12 ⭐)** à **(~70 %, 12 ⭐ + 4 nouveaux)** en 6 mois (avril → octobre 2026), en livrant les manques pré-V1 listés au §3 d'EFFORT_DEPLOIEMENT.md.

Les **gains de score les plus impactants** (pour passer de 55 % à 70 %) sont mécaniquement :
- **+2,4 points** : LEGAL-2044 (3 critères 7.1/7.2/7.7)
- **+1,3 point** : LEGAL-BILAN-ANNUEL (2 critères 7.5/7.7)
- **+1,3 point** : QUIT-EMAIL + AVIS-ECHEANCE + RAPPEL-IMPAYE (3 critères 3.3/3.7/4.12)
- **+1,3 point** : IMPORT-EXCEL-LOG + IMPORT-CONCURRENTS (2 critères 14.1/14.3)
- **+0,7 point** : SECU-INNERHTML implicite (qualité, ne change pas le score brut mais évite le red flag commercial)
- **+1,7 point** : EDL-DELEGUE-EXPORT/IMPORT (déjà partiel → complet, +2 critères différenciants)
- **+0,7 point** : BAIL-TYPES (1 critère 1.11/1.13)

Total accessible : ~9 points → **64–66 %** réaliste à V1, avec 2 différenciants exclusifs supplémentaires confirmés (EDL délégué offline complet).

Pour atteindre 70 % il faudrait ajouter **multi-users (V2 Q1 2027)** + **portail locataire (V2 Q2 2027)**.

---

## 6. Forces différenciantes ImmoTrack — analyse de défensibilité

> Ce qui rend ImmoTrack unique sur le panel. Les 12 ⭐ Scorecard.

| # | Différenciant exclusif | Défensible ? | Pourquoi |
|---|---|---|---|
| ⭐1 | EDL délégué — export HTML offline pour tiers (2.15+16.5) | **Forte** | Personne n'a fait ça (un EDL "embarquable" sans réseau pour qu'un tiers — agent, cousin, ami — fasse l'EDL et renvoie un fichier JSON). Modèle à breveter cas d'usage si possible. |
| ⭐2 | Import JSON EDL délégué + statut "à valider" (2.16) | **Forte** | Complète #1, écosystème offline. |
| ⭐3 | EDL entrée depuis sortie + photos différenciées (2.4+2.9) | **Moyenne** | Différenciation UX sur cas existants ; concurrents peuvent copier. |
| ⭐4 | Paraphes canvas HiDPI + restore print (2.12+1.9) | **Moyenne** | Détail technique, copiable mais requiert effort. |
| ⭐5 | Synchro photos Drive auto au save/print (2.14) | **Forte** | Architecture file-based + Drive sync optionnel = posture RGPD différenciée. |
| ⭐6 | Aperçu lettre IRL inline (5.5) | **Faible** | UX, copiable. |
| ⭐7 | Tableau de trésorerie / cash-flow (4.11) | **Moyenne** | Différenciant face à BailFacile/Smartloc, présent chez Gererseul/Crypto. |
| ⭐8 | Dashboard one-screen ~900 px haut (8.3) | **Moyenne** | Cahier v2 avril 2026 livré, contraine forte tenue dans le temps. |
| ⭐9 | Rapprochement auto loyer/paiement (4.6) | **Forte** | Fait sans Open Banking DSP2 (manuel CSV). Différenciation = "souverain" (pas de DSP2 invasive). |
| ⭐10 | Personnalisation templates HTML éditable (1.5+13.4) | **Forte** | Mode lecture + mode avancé toggle (v13.29) = unique sur le panel. |
| ⭐11 | Zéro compte requis (15.5) | **Forte (philosophie)** | Posture "vos données chez vous" — argument RGPD béton. |
| ⭐12 | Snapshot signé + highlight diff (v13.10/11) | **Moyenne** | Inédit en B2C, copiable mais effort important. |

**Conclusion défensibilité** : 6/12 différenciants ont une défensibilité forte. Le pack **EDL délégué offline + Drive sync RGPD + zéro compte** forme une triade cohérente et difficile à copier rapidement (architecture).

---

## 7. Faiblesses ImmoTrack — analyse de criticité

> Manques par criticité commerciale. Croisé avec BACKLOG.md.

### 7.1 — 🔴 Critiques (bloquent commercialisation)

| Manque | Code BACKLOG | Pourquoi bloquant |
|---|---|---|
| Aide 2044 + bilan annuel | LEGAL-2044, LEGAL-BILAN-ANNUEL | TOUS les concurrents l'ont. Sans ça, on n'est pas crédible "tout-en-un" pour un investisseur. |
| Validation légale EDL avocat | EDL-VALIDATION-AVOCAT | Pas commercialisable sans relecture pro du template (responsabilité éditeur). |
| Sécu XSS (innerHTML) | SECU-INNERHTML | App publique = vraie CVE potentielle. Audit obligatoire. |
| Audit global pré-V3 | AUDIT-GLOBAL | Idem, dette de sécu non documentée = risque commercial. |
| Architecture DB doublons | ARCHI-DB-DOUBLONS | Pas bloquant V1 mais bloquant V2 multi-users. |
| Drive sync re-archi | DRIVE-2H/2F/2G | Si Drive sync conservé, OCC + awareness UI obligatoires pour multi-devices. |

### 7.2 — 🟠 Standards marché manquants (≠ bloquant mais perte de deals)

| Manque | Code | Présent chez |
|---|---|---|
| Envoi email quittance | QUIT-EMAIL | Tous concurrents |
| Avis d'échéance | AVIS-ECHEANCE | Qalimo, Rentila, BailFacile |
| Rappel impayé auto | RAPPEL-IMPAYE | Standard marché |
| Import Excel onboarding | IMPORT-EXCEL-LOG | Tous |
| Import depuis concurrent | IMPORT-CONCURRENTS | Standard onboarding |
| Bail meublé / mobilité / étudiant | BAIL-TYPES | Tous (sauf garage) |
| Open Banking DSP2 | (n/a) | Qalimo, Rentila, Smartloc — peut être différenciant inversé "no DSP2 = souverain" |

### 7.3 — 🔵 Moyennement critiques (V2)

- Multi-users + rôles (SAAS-MULTIUSERS)
- Portail locataire (PORTAIL-LOC)
- Signature eIDAS (SIGN-EIDAS)
- App mobile native iOS/Android
- Liasse 2072 SCI IR (LEGAL-2072) — différenciant face à ImmobilierLoyer

---

## 8. Synthèse stratégique

### 8.1 — Positionnement-cible 1 phrase

> **ImmoTrack = le seul outil de gestion locative B2C qui combine couverture fonctionnelle pro (~70 %), différenciants techniques exclusifs (EDL délégué offline, Drive RGPD, zéro compte), et prix accessible (< 15 €/mois), pour le bailleur particulier 2–10 logements et les SCI familiales qui veulent rester maîtres de leurs données.**

### 8.2 — Cible V1 (Q4 2026)

- **Persona principal** : "le bailleur autonome 35–55 ans" — 2 à 10 logements, souvent en SCI familiale, gère sans agence, geek-friendly mais pas développeur, soucieux de ses données
- **Persona secondaire** : "l'investisseur en route" — 1er ou 2e bien, vient de Rentila ou BailFacile, cherche à monter en gamme sans payer Crypto
- **Persona V2** : "la mini-SCI 5–20 lots" — admin de biens informel familial / petit gestionnaire indépendant

### 8.3 — Positionnement vs concurrents directs

| Concurrent | Risque pour ImmoTrack | Argumentaire de différenciation |
|---|---|---|
| Qalimo | **Élevé** (UX + score) | EDL délégué + Drive RGPD + SCI plus poussée + prix |
| Gererseul | **Moyen** | Modernité UX + différenciants techniques + offline-first |
| Rentila | **Faible** | Cible différente (low-cost vs pro accessible) |
| BailFacile | **Moyen** | Couverture fonctionnelle supérieure dès V1 + RGPD souverain |
| ImmobilierLoyer | **Moyen** (sur SCI) | Modernité + différenciants ; à terme combler 2072 |
| Smartloc | Faible | Pas le même angle (Smartloc = GLI, ImmoTrack = autonomie outil) |
| Smovin | Faible | Smovin moins focus France fiscal |

---

## 9. Sources

### Comparatif quantitatif
- `ImmoTrack_Comparatif_Concurrents_2026.xlsx` — 149 critères, 9 outils, scorecard pondérée + **onglet Sociétés** (métriques ajoutées juil. 2026)
- **[BENCHMARK-CONCURRENCE-2026-07.md](BENCHMARK-CONCURRENCE-2026-07.md)** — benchmark sociétés daté 2026-07-07 (CA, users, levées, effectifs, roadmap, sources ligne à ligne)

### Panel fiscalité (ajouté juil. 2026)
- Déclaration-Foncier.fr / KIPDEV : [declaration-foncier.fr](https://declaration-foncier.fr/), [pappers KIPDEV](https://www.pappers.fr/entreprise/kipdev-884120890)
- Ownily : [ownily.fr/tarifs](https://www.ownily.fr/tarifs)
- Qlower : [qlower.com](https://www.qlower.com/), [pappers QLOWER PATRIMOINE](https://www.pappers.fr/entreprise/qlower-patrimoine-903122984)
- Indy : [indy.fr/prix](https://www.indy.fr/prix/), [getlatka.com/georgestech](https://getlatka.com/companies/georgestech)

### Concurrents B2C
- Rentila : [rentila.com](https://www.rentila.com/), [bailpdf.com/rentila](https://bailpdf.com/gestion-locative/rentila), [lafabriquedunet.fr](https://www.lafabriquedunet.fr/logiciel/rentila), [capterra.com/rentila](https://www.capterra.com/p/205374/Rentila/)
- BailFacile : [bailfacile.fr](https://www.bailfacile.fr/), [pappers.fr/bailfacile](https://www.pappers.fr/entreprise/bailfacile-827909078), [jaimelesstartups.fr/bailfacile](https://www.jaimelesstartups.fr/bailfacile-redaction-bail/)
- Smovin : [smovin.app](https://www.smovin.app/), [capterra.com/smovin](https://www.capterra.com/p/177288/Smovin/), [lavenir.net/smovin](https://www.lavenir.net/cnt/dmf20200129_01438265/immobilier-importante-levee-de-fonds-pour-la-start-up-smovin)
- Qalimo : [qalimo.fr](https://www.qalimo.fr/), [appvizer.fr/qalimo](https://www.appvizer.fr/operations/gestion-locative/qalimo)
- Smartloc : [smartloc.fr](https://www.smartloc.fr/), [investis.fr/smartloc](https://www.investis.fr/smartloc), [bailpdf.com/smartloc](https://bailpdf.com/gestion-locative/smartloc)
- Gererseul : [gererseul.com](https://www.gererseul.com/), [investissement-locatif-avis.fr/gererseul](https://investissement-locatif-avis.fr/gererseul-avis-2/), [rentilot.fr/gererseul](https://www.rentilot.fr/avis/gererseul/)
- ImmobilierLoyer : [immobilierloyer.com](https://www.immobilierloyer.com/)

### Concurrents B2B
- Septeo : [septeo-adb.fr](https://www.septeo-adb.fr/), [lejournaldesentreprises.com/septeo](https://www.lejournaldesentreprises.com/breve/le-groupe-septeo-prevoit-de-recruter-350-personnes-en-2025-2116198), [mysweetimmo.com/septeo-inch](https://www.mysweetimmo.com/2025/10/28/immobilier-septeo-muscle-son-offre-adb-avec-le-rachat-dinch/)
- LOCKimmo : [lockimmo.com](https://www.lockimmo.com/), [appvizer.fr/lockimmo](https://www.appvizer.fr/construction/agence-immobiliere/lockimmo)
- Powimo : [seiitra.com/powimo](https://www.seiitra.com/solutions/logiciel-syndic/), [realestate.orisha.com/powimo](https://realestate.orisha.com/nos-solutions/powimo-le-logiciel-integre-pour-la-gestion-locative-et-syndic/)
- Hektor : [la-boite-immo.com](https://www.la-boite-immo.com/)
- VILOGI : [vilogi.com](https://www.vilogi.com/)
- Manda : [manda.fr](https://www.manda.fr/), [maddyness.com/manda-rachats](https://www.maddyness.com/2024/10/28/la-proptech-manda-continue-de-grandir-et-annonce-de-nouveaux-rachats/)
- Imodirect : [imodirect.com/tarif](https://www.imodirect.com/tarif), [cfnews.net/imodirect](https://www.cfnews.net/L-actualite/Capital-innovation/Operations/1er-tour/Imodirect-forfaitise-son-premier-tour-255491)
- Étude USH 2022 syndic : [union-habitat.org](https://www.union-habitat.org/sites/default/files/articles/pdf/2022-04/ush-etude_logiciels_copropriete.pdf)

### Marché
- INSEE Parc logements 2024 : [insee.fr/8251576](https://www.insee.fr/fr/statistiques/8251576)
- INSEE Parc logements 2025 : [insee.fr/8640662](https://www.insee.fr/fr/statistiques/8640662)
- INSEE Propriétaires-Locataires : [insee.fr/2569374](https://www.insee.fr/fr/statistiques/2569374?sommaire=2587886), [insee.fr/4277733](https://www.insee.fr/fr/statistiques/4277733?sommaire=4318291)
- INSEE 24 % ménages détiennent 68 % logements : [insee.fr/5432517](https://www.insee.fr/fr/statistiques/5432517?sommaire=5435421)
- Rental Property Mgmt SW Market mondial : [verifiedmarketreports.com](https://www.verifiedmarketreports.com/product/rental-property-management-software-market/)
- Septeo CA 2024 : [touleco.fr](https://www.touleco.fr/Septeo-prevoit-d-investir-40-millions-d-euros-en-R-D-en-2024,41952)
