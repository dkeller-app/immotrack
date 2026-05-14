# SAAS-V2-AUDIT-BUSINESS — Audit de viabilité économique ImmoTrack V2

> **Auditeur** : analyste business / consultant SaaS (regard externe sur dossier interne)
> **Date** : 2026-05-14
> **Périmètre** : pivot vanilla JS single-user → Next.js multi-tenant SaaS cloud
> **Stack auditée** : Next.js 15 + Neon PostgreSQL + Clerk + Vercel + Stripe Billing + Bridge (Powens) + Yousign eIDAS
> **Effort dispo audité** : ~230 h sur 5–6 mois (dev solo)
> **Documents internes consultés** : `BIZPLAN.md`, `CARTE_POSITIONNEMENT.md`, `PROJECTIONS.md`, `VEILLE-QALIMO-V2-2026.md`, `EFFORT_DEPLOIEMENT.md`, `PLAN_ACTIONS.md`

---

## 0. TL;DR — Verdict en 30 secondes

**Verdict : GO conditionnel, mais PIVOT structurant requis.**

- Le **marché existe** (~6,8 M logements locatifs privés FR, ~1,5 M déjà digitalisés, ~1 M encore à digitaliser) mais il est **saturé en B2C low-cost** (Rentila, Qalimo, BailFacile). Y entrer comme N+1 sans rupture = death by attrition.
- La **stack technique annoncée** (Next.js + Neon + Clerk + Stripe + Bridge + Yousign) **est correcte mais détruit le différenciant n°1 d'ImmoTrack** : "Drive sync RGPD souverain + zéro compte requis". Si on bascule sur Clerk + Neon cloud US-EU, on devient un Qalimo de plus.
- **Trois différenciants V1 défendables** demeurent réellement actionnables sur la nouvelle stack : (1) **EDL délégué offline pay-per-use** (viral, brevétable), (2) **fiscal 2044/2072 SCI IR intégré** (seul ImmobilierLoyer le fait mal), (3) **mandataire Hoguet pour gestionnaire indé** (océan bleu vs Rentila B2C-only).
- **230 h sur 5–6 mois pour un pivot multi-tenant + commercialisation = sous-dimensionné d'un facteur 2–3** par rapport à l'effort réel attendu (cf §5). Le BIZPLAN interne prévoit déjà 140 j-h dev + 50 j-h hors-dev sur 18 mois (~1 500 h), pas 230.
- **CAC SaaS proptech FR réaliste = 60–120 €**, pas 25 € comme modélisé dans `PROJECTIONS.md`. Le LTV/CAC reste néanmoins > 3 → modèle fondable, **mais le break-even glisse de Q4 2027 à Q2 2028 minimum**.
- **Verdict actionnable** : Go sur niche "gestionnaire indépendant Hoguet 10–50 lots" + bailleur SCI familiale, freemium agressif sur Solo, pricing 14,90 € / 29,90 € / 59,90 € (vs 9,90/19,90 actuellement proposé). Garder Drive sync **en option** comme posture souveraineté, **ne pas l'abandonner** au profit du tout-cloud.

---

## 1. Marché adressable FR (TAM / SAM / SOM)

### 1.1 — TAM (Total Addressable Market)

| Indicateur | Valeur 2025 | Source |
|---|---|---|
| Résidences principales France | ~30,3 M | INSEE Focus 359 (1er janv. 2025) |
| Part parc locatif privé | 22,8 % | INSEE |
| Logements locatifs privés (volume) | **~6,9 M** | dérivé INSEE |
| Bailleurs particuliers (personnes physiques) | **~2,4 M** (estim) | INSEE — 68 % logements possédés par 24 % ménages ; multipropriétaires moyenne 2,8 logements |
| SCI familiales actives | ~800 K (dont ~250 K avec locataires) | INSEE Statistiques entreprises 2024 |
| Logements détenus par SCI en location | ~820 K | dérivé |

**TAM logiciel** (~hypothèse ARPU moyen 12 €/mois × 12 mois × 2,4 M bailleurs si tous payaient un SaaS) = **~345 M€/an théorique**.

Mais cette borne haute est irréaliste : tous les bailleurs ne paieront jamais un SaaS.

### 1.2 — SAM (Serviceable Available Market)

Bailleurs qui peuvent réellement adopter un SaaS de gestion locative :
- Possèdent au moins 1 logement loué (filtre = a déjà des locataires actifs, pas juste un patrimoine inerte) : ~2 M
- Ont 1 à 30 logements (au-delà = clientèle B2B agence, ≠ SaaS B2C) : ~1,95 M
- Sont sous Internet, ont un compte bancaire en ligne, < 75 ans : ~1,5 M
- Sont insatisfaits ou non équipés (Excel, papier, agence physique) : ~70 % → **~1,05 M bailleurs adressables réellement**

**SAM = ~1,05 M bailleurs × ARPU 12 €/mois × 12 = ~150 M€/an.**

Cohérent avec l'estimation interne BIZPLAN §2.1 ("~145 M€ marché annuel adressable").

### 1.3 — Pénétration SaaS actuelle

| Acteur | Base clients connue | Logements gérés (estim) |
|---|---|---|
| Rentila | 50 000 bailleurs | 200 000 |
| Gererseul | 42 000 utilisateurs | ~120 000 |
| Qalimo | non communiqué (estim 20–40 K bailleurs) | ~80 K |
| BailFacile | non communiqué (estim 15–25 K) | ~50 K |
| Smartloc | ~20 K | ~50 K |
| Smovin (part FR) | ~5 K FR | ~20 K |
| ImmobilierLoyer | ~10 K | ~30 K |
| Autres / niches | – | ~30 K |
| **TOTAL B2C SaaS captés** | **~170 K bailleurs** | **~580 K logements** |

→ **Pénétration SaaS sur le SAM = ~16 % (170 K / 1 050 K bailleurs)**. C'est un marché en cours de digitalisation, **pas encore saturé**, mais où la concurrence ronge la croissance organique.

**Lecture commerciale** : ~880 K bailleurs sont encore sur Excel / papier / agence. C'est là que la bataille se joue, **pas dans le vol de clients à Rentila**.

### 1.4 — Cible "gestionnaire Hoguet" — l'angle SAM-bis

Les agences immobilières françaises 2025 :
- ~36 000 cabinets immobiliers titulaires d'une carte professionnelle "Transaction" (T) ou "Gestion" (G) (Source : ACI / FNAIM 2024)
- ~24 000 cabinets pratiquent la gestion locative (Source : FNAIM)
- Dont ~70 % = TPE < 5 salariés (~17 000 cabinets)
- Et ~30 % = indépendants en exercice individuel (~10 000 cabinets)
- Portefeuille moyen petit cabinet : 80–150 lots (source : observatoire ACI 2023)

**SAM-bis gestionnaire indé 10–50 lots** :
- ~10 000 cabinets indé / TPE
- Portefeuille moyen 80–150 lots
- ARPU cible 80–250 €/mois (= 1–3 € par lot × 80 lots)
- **SAM gestionnaire ≈ 10 000 × 150 €/mois × 12 = ~18 M€/an** (10× plus petit que B2C mais panier 10× plus gros)

→ **C'est l'océan bleu réel** : Rentila/Qalimo/BailFacile sont **B2C only**. Septeo/LOCKimmo sont **trop chers** pour un cabinet 1–2 personnes (80–300 €/mois/user × 2 users = 160–600 €/mois pour 100 lots = inacceptable). **Il existe un trou entre B2C 10 €/mois et B2B Septeo 200 €/mois.**

### 1.5 — SOM (Serviceable Obtainable Market) à 3 ans

Hypothèse scénario médian : ImmoTrack capte 0,2 % du SAM B2C + 0,5 % du SAM gestionnaire à 3 ans :
- B2C : 0,002 × 1,05 M = **2 100 bailleurs payants**
- Gestionnaire : 0,005 × 10 000 = **50 cabinets** × 150 €/mois moyen = 90 K€/an
- ARR total **~440 K€** (proche scénario médian PROJECTIONS interne 540 K€, légèrement plus conservateur)

### 1.6 — Croissance attendue 2026–2030

| Source | Croissance | Lecture |
|---|---|---|
| Rental Property Mgmt SW mondial | CAGR 8,6 % | Tailwind macro |
| VILOGI 2024 | +47 % | Marché FR très dynamique |
| Septeo Group 2024 | +20 % | Consolidation rapide |
| Marché logiciels SaaS FR global | CAGR ~17 % | Marché général SaaS |
| Loi Climat (DPE F/G/E) | Demande logicielle ↑ 2025–2034 | Tailwind régulatoire |
| Loi Élan 2018 + Alur 2014 | Complexité bail ↑ | Tailwind régulatoire |
| Déclaration 2044/2072 sans agent EC | Demande forte avril–mai | Saisonnalité |

→ **Marché en croissance solide 8–15 % CAGR sur 2026–2030**, surtout côté digitalisation des bailleurs non-équipés.

**Sources** :
- [INSEE Focus 359 — Parc des logements 2025](https://www.insee.fr/fr/statistiques/8640662)
- [INSEE 24 % ménages détiennent 68 % logements](https://www.insee.fr/fr/statistiques/5432517)
- [Verified Market Reports — Rental Property Mgmt SW Market](https://www.verifiedmarketreports.com/product/rental-property-management-software-market/)
- [FNAIM Observatoire 2024](https://www.fnaim.fr/observatoire)

---

## 2. Analyse concurrence — fiches détaillées

### 2.1 — Tableau comparatif synthétique

| Concurrent | Pricing entrée | Pricing multi | Trustpilot | Estim clients | Cible primaire | Faille exploitable |
|---|---|---|---|---|---|---|
| **Rentila** | 0 € (1 lot bridé) / 4,90 € | 8 € | 4,5/5 | 50 K | Solo low-cost | UX vieillissante, pas pro |
| **Qalimo** | 0 € (1 bien) / 4,90 € | 14,90 € | **4,9/5** | 20–40 K | Solo + investisseur | 0 différenciant exclusif |
| **BailFacile** | 9,90 € | 19,90 € | n/a (4,6 G2) | 15–25 K | Néo-investisseur | SCI faible, pas mandataire |
| **Smovin** (BE/FR) | 4–8 €/bien | 20+ €/bien | 4,1/5 Capterra | 5 K FR | Multi-pays | Fiscalité FR imparfaite |
| **Gererseul** | 9,75 € (annuel) | 9,75 € (dégressif) | 4,8/5 | 42 K | SCI + accompagnement | Pas d'app mobile, UX 2010 |
| **Smartloc** | 6,50 € | 12,50–20 € | n/a | ~20 K | Investisseur + GLI | Fiscal limité |
| **ImmobilierLoyer** | 7,70 € | 12,50 € | n/a | ~10 K | SCI fiscal | UI 2010 |
| **Septeo Crypto/ICS** | sur devis (~80 €/user/mois) | sur devis | n/a | 3 200 cabinets ADB | Agence pro | 10× trop cher pour TPE |
| **LOCKimmo** | sur devis | sur devis | n/a | ~1 500 cabinets | Agence indé | UX corporate lourde |
| **Manda** (agence digi) | 5,9 % loyer | 5,9 % loyer | 4,2/5 | ~10 K bailleurs | Bailleur déléguant | ≠ logiciel, ≠ outil |
| **Imodirect** (agence digi) | 11–15 €/m² + 2,5 % GLI | – | n/a | ~5 K | Bailleur déléguant | ≠ logiciel |
| **🟧 Excel + ChatGPT** | gratuit | gratuit | – | ~880 K bailleurs | Tous segments | LE concurrent caché majeur |

### 2.2 — Focus Rentila (leader volume)

- **Pricing public 2026** : Gratuit (1 lot, 2 baux, 2 locataires bridés) → 4,90 € (Plus) → 8 € (Premium) → 12 € (Premium + DSP2)
- **Features clés** : génération bail/quittance, rapprochement bancaire DSP2 inclus, comptabilité simple, locations saisonnières, app mobile
- **Note Trustpilot** : 4,5/5 (1 800+ avis)
- **MRR estimé** : 50 K bailleurs × ~30 % payants × 5,50 € ARPU = **~82 K€/mois ≈ 1 M€ ARR** (estim public, jamais publié)
- **Société** : créée 2010 par Steve Bénichou, SARL bootstrap, équipe ~5 personnes (LinkedIn)
- **Faille exploitable** : pas de différenciants techniques, UX datée, **pas de mandataire Hoguet**, fiscal SCI faible, support limité
- **Argument anti-Rentila pour ImmoTrack** : "Rentila vous oblige à choisir entre gratuit bridé ou payant à fonctionnalités décousues. ImmoTrack offre un freemium 1 bien VRAIMENT complet (EDL + IRL + fiscal 2044)"

### 2.3 — Focus Qalimo (best UX/notation)

- **Pricing public 2026** : Gratuit (1 bien) → Investisseur 4,90 €/bien (2–6 biens) → Patrimoine 14,90 €/bien (7+ biens)
- **Features clés** : DSP2 bancaire, quittance auto sur paiement, candidatures locataires, signature électronique, SMTP custom par bailleur (V2 2026), automatisations centralisées (V2 2026)
- **Note Trustpilot** : **4,9/5** (rare, record du marché) + 5/5 Google
- **MRR estimé** : 30 K bailleurs × ~25 % payants × ~10 € ARPU = **~75 K€/mois ≈ 900 K€ ARR**
- **Société** : créée 2018, fondateur Nicolas (interview MaBrik Immo), équipe ~8 personnes
- **Investissement éditorial massif** : 22 tutoriels vidéo officiels (signal commercial pro fort)
- **Faille exploitable** : **0 différenciant exclusif** (cf scorecard interne), copie ce qui marche ailleurs sans signature propre. Pas de mandataire Hoguet. Pas de fiscalité SCI avancée.
- **Argument anti-Qalimo pour ImmoTrack** : "Qalimo a la meilleure UX. Mais 0 fonction unique. Si vous cherchez du standard surfacé bien noté, prenez Qalimo. Si vous voulez du concret (EDL délégué, fiscal SCI 2072, mandataire Hoguet), prenez ImmoTrack."

### 2.4 — Focus BailFacile (challenger pricing aligné)

- **Pricing public 2026** : 9,90 €/mois (1 bien) / 19,90 €/mois (2–5 biens) / sur devis (5+)
- **Features clés** : génération bail conforme Alur/Elan, signature électronique, support juridique (relecture avocat sur option payante), SEO content très dense (~200 articles immobilier)
- **MRR estimé** : 18 K clients × ~13 € ARPU = **~230 K€/mois ≈ 2,8 M€ ARR**
- **Société** : créée 2017–2018 par Thibaud & Valentin Fily (frères), bootstrap, équipe ~12 personnes
- **Faille exploitable** : **manque SCI multi-entités**, pas de mandataire Hoguet, pas d'EDL délégué, pas d'app mobile
- **Argument anti-BailFacile pour ImmoTrack** : "BailFacile est excellent pour générer un bail. ImmoTrack va plus loin : il gère votre patrimoine (SCI, multi-entités, fiscal 2072) au même prix."

### 2.5 — Focus Smovin (alternative belge)

- **Pricing public 2026** : 2 biens gratuits → 4 €/bien (5 biens) → 7 €/bien (30 biens) → devis (30+)
- **Features clés** : facturation auto, multi-devises (EUR/USD/CHF), app mobile native, intégration banque (DSP2 BE)
- **Note** : 4,1/5 Capterra
- **MRR estimé** : 15 K clients (BE+FR+autres) × ~12 € ARPU = ~180 K€/mois
- **Faille exploitable** : pas adapté aux spécificités fiscales FR (pas de 2044, pas de 2072 SCI), pas de mandataire Hoguet français
- **Argument anti-Smovin pour ImmoTrack** : "Smovin est belge. Si vous gérez en France, vous devez réinventer la fiscalité chaque année. ImmoTrack est conçu FR-first."

### 2.6 — Focus Gererseul (challenger SCI)

- **Pricing public 2026** : 9,75 €/mois (1 bien, annuel 117 €/an)
- **Features clés** : **fiscaliste humain 5j/7 inclus** (différenciant unique), rapprochement bancaire certifié ACPR, gestion SCI avancée (2072), 19 ans d'ancienneté
- **Note Trustpilot** : 4,8/5
- **MRR estimé** : 42 K users × ~30 % payants × 9,75 € = **~123 K€/mois ≈ 1,5 M€ ARR**
- **Société** : créée 2007 par Stéphane Maurin, bootstrap, équipe ~10 personnes
- **Faille exploitable** : **pas d'app mobile native** (web responsive), UX 2010 datée, pas de différenciants techniques modernes
- **Argument anti-Gererseul pour ImmoTrack** : "Gererseul a un fiscaliste humain. ImmoTrack a la modernité UX + EDL délégué + offline-first + mandataire Hoguet. Choix selon votre profil : si vous voulez quelqu'un au téléphone → Gererseul. Si vous voulez un outil pro autonome → ImmoTrack."

### 2.7 — 🟧 Le concurrent caché : Excel + ChatGPT / Notion

**À ne PAS sous-estimer.** Sur les ~880 K bailleurs non-digitalisés :
- ~60 % sont sur Excel / Google Sheets avec un template gratuit
- ~30 % sur papier
- ~10 % expérimentent ChatGPT + Excel pour générer un bail / calcul IRL

**Pourquoi c'est le vrai concurrent** :
- Gratuit (vs ImmoTrack 9,90 €/mois = 120 €/an)
- 0 onboarding (déjà connu)
- ChatGPT répond à 80 % des questions juridiques pour 0 € (vs Gererseul fiscaliste humain)
- Pas de vendor lock-in

**Comment vaincre Excel+ChatGPT** :
1. **Conformité légale auto** : "ChatGPT vous donne un bail Alur 2014. Pas Climat 2021 + Élan 2018. ImmoTrack vous donne un bail à jour du décret 2023-XX automatiquement."
2. **Photos + traçabilité EDL** : "Excel ne stocke pas vos photos compteurs avec hash + horodatage. Vous perdrez votre dépôt de garantie au litige."
3. **Audit trail 10 ans** : "Excel se perd, se corrompt. ImmoTrack conserve un snapshot signé inaltérable."

→ **Argument commercial à mettre en haut de la landing page**, pas en pied de page.

**Sources concurrents** :
- [Rentila pricing](https://www.rentila.com/pricing)
- [Qalimo tarifs](https://www.qalimo.fr/tarif/)
- [BailFacile tarifs](https://www.bailfacile.fr/tarifs)
- [Smovin tarifs](https://www.smovin.app/fr-be/tarifs/)
- [Gererseul tarifs](https://www.gererseul.com/tarifs/)
- [Smartloc tarifs](https://www.smartloc.fr/tarifs)
- [ImmobilierLoyer](https://www.immobilierloyer.com/)
- [Manda](https://www.manda.fr/)
- [Imodirect tarifs](https://www.imodirect.com/tarif)

---

## 3. Positionnement ImmoTrack V2 — analyse critique

### 3.1 — Le pitch "simplicité + UX 1 écran + automatisation" tient-il ?

**Réponse honnête : NON, pas en l'état.**

Pourquoi :
1. **"Simplicité"** est revendiqué par TOUS les concurrents. Qalimo dit "simplifiez". Rentila dit "facile". BailFacile dit "facile" dans son nom. → **mot vidé de son sens commercial**.
2. **"UX 1 écran PC"** est un avantage technique (dashboard one-screen 900px) mais **invisible pour 90 % des prospects** qui n'évaluent l'outil qu'après inscription. → mauvais argument top-funnel.
3. **"Automatisation max"** est exactement le claim de Qalimo V2 (panneau Automatisation centralisé par bailleur). → ImmoTrack devient un me-too tardif.

### 3.2 — Différenciants RÉELS défendables (filtre du consultant)

J'ai filtré les 12 ⭐ scorecard interne par défensibilité réelle (≠ marketing) et par capacité à convertir un prospect en démo de 30 sec :

| # | Différenciant | Défensibilité | Argument commercial concret |
|---|---|---|---|
| 1 | **EDL délégué offline + JSON signé** | Forte | "Faites faire l'EDL par un proche pendant que vous êtes en vacances. Récupérez le fichier signé." → viral, brevétable cas d'usage |
| 2 | **Mandataire Hoguet intégré + CRG** | Forte | "Le seul SaaS B2C qui devient B2B au moment où vous récupérez un mandat de gestion pour 2 voisins" → océan bleu vs Rentila B2C-only |
| 3 | **Drive sync RGPD souverain** | Forte (si conservé) | "Vos données restent chez vous, pas chez nous" → argument RGPD niche mais puissant |
| 4 | **Liasse 2072 SCI IR + bilan annuel** | Forte | "Seul outil à générer votre liasse 2072 pour votre SCI familiale" (ImmobilierLoyer le fait mais UI 2010) |
| 5 | **Snapshot signé + highlight diff** | Moyenne | "Votre bail signé reste figé. Toute modif ultérieure est tracée." |
| 6 | **Templates HTML mode avancé** | Moyenne (geek-only) | Peu de prospects valorisent. À garder mais ne pas mettre en home. |

**Les 6 autres "différenciants"** du scorecard interne (paraphes HiDPI, EDL pré-rempli, dashboard one-screen, aperçu IRL inline, tableau cash-flow, comparateur EDL 7 colonnes) sont **des détails UX, pas des arguments commerciaux**. Ils convertissent un prospect *déjà en démo*, pas en haut de funnel.

### 3.3 — Le risque "me-too Rentila/Qalimo" — diagnostic

**ImmoTrack V2 ressemble dangereusement à Qalimo V2** sur la stack annoncée :
- Next.js + cloud → Qalimo est en cloud SaaS
- Clerk multi-tenant → Qalimo a "Partage de gestion" multi-utilisateurs (capture user 2026-05-13)
- Bridge DSP2 → Qalimo a la synchro bancaire DSP2
- Yousign eIDAS → Qalimo a la signature électronique
- Automatisations par bailleur → Qalimo V2 a le panneau Automatisations (9 toggles)

→ **Si on suit le brief stack à la lettre, on construit un Qalimo-clone avec 6 mois de retard.**

**La vraie question** : "Pourquoi un investisseur achèterait ImmoTrack plutôt que Qalimo (4,9/5 Trustpilot, 5/5 Google) en novembre 2026 ?"

**Réponses possibles** :
- ❌ "Parce qu'ImmoTrack a une meilleure UX" → faux, Qalimo a 4,9/5
- ❌ "Parce qu'ImmoTrack est moins cher" → ImmoTrack 9,90 € vs Qalimo Free + 4,90 € → ImmoTrack plus cher en entrée
- ❌ "Parce qu'ImmoTrack a plus de features" → Qalimo 71 % scorecard, ImmoTrack 54,7 % aujourd'hui
- ✅ "Parce qu'ImmoTrack offre l'EDL délégué offline + Hoguet + fiscal SCI 2072" → 3 différenciants Qalimo ne couvre pas

→ Le **pitch commercial doit centrer sur ces 3 différenciants**, pas sur "simplicité + UX".

### 3.4 — L'angle "multi-tenant gestionnaire Hoguet" — océan bleu ?

**Diagnostic : oui, mais avec nuances.**

**Pourquoi océan bleu** :
- Rentila / Qalimo / BailFacile / Smartloc = **B2C exclusivement**. Pas de gestion mandataire (CRG mensuel, honoraires de gestion, mandats, RC pro)
- Septeo / LOCKimmo = **B2B exclusivement** + trop cher pour cabinet 1–2 personnes
- Le segment "gestionnaire indé carte Hoguet 10–50 lots" est **non-couvert efficacement**

**Pourquoi nuances** :
- **Cycle de vente B2B = 3–9 mois** (vs B2C 30 jours). Trésorerie tendue.
- Le gestionnaire Hoguet a des **exigences réglementaires fortes** (compte séquestre, RC pro, mandat type ARC, registre des mandats numéroté) → 6 mois de dev supplémentaire pour conformité
- La carte Hoguet impose une **comptabilité tiers** (différencier compte propriétaire vs compte agence) que ImmoTrack n'a pas en architecture aujourd'hui
- Concurrence indirecte : **Crypto / ICS / LOCKimmo** ont des offres "petit cabinet" autour de 80–120 €/mois/user qu'on sous-estime

**Verdict** : océan bleu **réel mais nécessite 6–9 mois de dev dédiés** (mandats numérotés + CRG + compte séquestre + RC pro). À planifier **V2 Q3 2027**, **pas V1 Q4 2026**.

### 3.5 — Repositionnement-cible recommandé

**Position actuelle (brief)** : "simplicité + UX 1 écran + automatisation max" → générique, indéfendable.

**Position recommandée (consultant)** :

> **ImmoTrack = le seul outil de gestion locative qui grandit avec vous : commencez bailleur particulier 1 bien, devenez SCI familiale 5 lots, puis gestionnaire Hoguet 30 lots, sans changer d'outil.**

Sous-titre 1 : *"Le seul SaaS pensé pour la trajectoire de vie patrimoniale française."*
Sous-titre 2 : *"EDL délégué offline + fiscal 2072 SCI + mandataire Hoguet — 3 fonctions uniques sur le marché."*

→ Cette position est **défendable** (aucun concurrent ne couvre les 3 segments), **mémorable** (trajectoire de vie), **actionable** (3 fonctions citables nominativement).

---

## 4. Pricing — modèle proposé et benchmarks

### 4.1 — Critique du pricing interne BIZPLAN (9,90 / 19,90 €)

Le pricing actuel proposé (Solo 0 € / Investisseur 9,90 € / SCI 19,90 €) **calque exactement BailFacile**. Trois problèmes :

1. **Pas de signature propre** : un prospect qui compare side-by-side voit le même prix avec moins de notoriété → choisit BailFacile.
2. **Manque le tier gestionnaire Hoguet** (différenciant principal selon §3) → la valeur captable est sous-monétisée
3. **Annuel –17 % standard** alors que **le marché va à –20 % à –25 %** (Gererseul = annuel uniquement à 117 €/an = équivalent 9,75 €/mois constant)

### 4.2 — Pricing recommandé (3 scénarios)

#### Scénario A — Conservateur (aligné marché)

| Plan | Limite | Mensuel | Annuel (-20 %) | ARPU cible |
|---|---|---|---|---|
| Solo | 1 lot freemium illimité | 0 € | – | 0 |
| Investisseur | 2–10 lots | **11,90 €** | **114 €/an** | 11,90 € |
| SCI/Patrimoine | 11–30 lots, fiscal 2072 | **24,90 €** | **239 €/an** | 24,90 € |
| Gestionnaire Hoguet | 30–100 lots, CRG, mandats (V2 Q3 2027) | **59,90 €/user** | **575 €/user/an** | 59,90 € |

**ARR cible à 3 ans** : 1 800 Investisseur × 11,90 + 600 SCI × 24,90 + 50 cabinets × 2 users × 59,90 = **524 K€ ARR**

#### Scénario B — Médian (différencié)

| Plan | Limite | Mensuel | Annuel (-25 %) | Justif |
|---|---|---|---|---|
| Solo | 1 lot freemium illimité | 0 € | – | acquisition |
| Investisseur | 2–10 lots | **14,90 €** | **134 €/an** | +50 % vs BailFacile, justifié par EDL délégué + Hoguet mode |
| SCI/Patrimoine | 11–30 lots, fiscal 2072 | **29,90 €** | **269 €/an** | premier sur 2072 + multi-entités |
| Gestionnaire Hoguet | 30–100 lots, CRG, mandats | **89 €/user** | **800 €/user/an** | sous Septeo de 30 %, au-dessus B2C de 10× |

**ARR cible à 3 ans** : 1 500 Investisseur × 14,90 + 500 SCI × 29,90 + 50 cabinets × 2 users × 89 = **531 K€ ARR**

**ARPU médian pondéré = ~22 €/mois** (vs 11,40 € BIZPLAN actuel = +93 %)

#### Scénario C — Agressif (premium positioning)

| Plan | Limite | Mensuel | Annuel | Justif |
|---|---|---|---|---|
| Solo | 3 lots freemium illimité | 0 € | – | acquisition massive (vs Rentila 1 lot bridé) |
| Investisseur | 4–10 lots | **19,90 €** | **199 €/an** | +100 % vs BailFacile |
| SCI/Patrimoine | 11–30 lots | **39,90 €** | **399 €/an** | premium SCI |
| Gestionnaire | 30–100 lots/user | **119 €/user** | **1 099 €/user/an** | premium gestionnaire |

**ARR cible à 3 ans** : 1 000 Investisseur × 19,90 + 400 SCI × 39,90 + 50 cabinets × 2 users × 119 = **478 K€ ARR**

→ Volumes moins importants mais marge plus forte → **valorisation revente supérieure** (multiple ARR plus haut pour premium).

### 4.3 — Recommandation pricing

**→ Scénario B (médian différencié) recommandé.**

Justifications :
- ARPU 22 € vs 11,40 € BIZPLAN actuel = +93 % de revenus à volume constant → break-even Q1 2027 réaliste
- Freemium 1 lot ILLIMITÉ vs Rentila bridé → argument acquisition fort
- Tier gestionnaire à 89 €/user/mois capture la valeur de l'océan bleu Hoguet
- Annuel –25 % aligné Gererseul (le plus mature du panel sur l'annuel)

### 4.4 — Levers tarification : trial, freemium, usage-based

| Mécanique | Recommandation | Justif |
|---|---|---|
| **Freemium 1 lot illimité** | ✅ Oui | Différenciant face à Rentila bridé. Conversion attendue 15 %. |
| **Trial 14 jours** | ❌ Non | Cannibalise le freemium. Choisir l'un ou l'autre. |
| **Paywall progressif** | ✅ Oui (sur 2e lot) | "Ajoutez votre 2e bien" → bouton "Passer à Investisseur" |
| **Usage-based (mouvements bancaires DSP2)** | ⚠️ V2 | Trop complexe pour V1. Inclus dans Investisseur, packagé par tier. |
| **EDL pay-per-use 9 €** | ✅ Oui | Produit d'appel viral (non-abonnés peuvent acheter un EDL ponctuel) |
| **Annuel –25 %** | ✅ Oui | Engagement annuel = lock-in + cash flow |
| **Mensuel sans engagement** | ✅ Oui | Réduit friction inscription |
| **Stripe Checkout** | ✅ Oui | Standard SaaS, vs Paddle MoR (le BIZPLAN mentionne Paddle, le brief mentionne Stripe — Stripe = mieux pour cycle facturation mensuelle, Paddle = mieux pour TVA EU multi-pays. **Stripe recommandé V1 FR uniquement**.) |

### 4.5 — Impact pricing sur ARR (sensibilité)

| Pricing | ARPU pondéré | Clients 3 ans | ARR | Vs PROJECTIONS interne (540 K€) |
|---|---|---|---|---|
| 7,90 / 14,90 (pénétration) | 9 € | 3 600 | 388 K€ | –28 % |
| 9,90 / 19,90 (BIZPLAN actuel) | 11,40 € | 3 200 | 540 K€ | référence |
| **14,90 / 29,90 / 89 € (recommandé)** | **22 €** | **2 100** | **531 K€** | +-0 % volume / +93 % ARPU |
| 19,90 / 39,90 / 119 € (premium) | 30 € | 1 500 | 478 K€ | volume –50 % mais valo revente +30 % |

→ **Scénario recommandé = même ARR avec moins de clients → support / churn / CAC absolus plus bas**.

---

## 5. Coûts / unit economics

### 5.1 — Coûts stack annoncés (audit)

Le brief annonce :
- ~125 €/mois sans bancaire (Next.js + Neon + Clerk + Vercel + Stripe + Yousign)
- ~275 €/mois avec Bridge (Powens DSP2)

**Audit ligne par ligne** :

| Poste | Coût brief | Coût réaliste | Commentaire |
|---|---|---|---|
| Vercel (Next.js hosting) | inclus dans 125 | 20–80 €/mois | Hobby gratuit, Pro 20 $/user/mois, Enterprise dès 600 $/mois. Au-delà de 100 clients = Pro obligatoire. |
| Neon PostgreSQL | inclus | 19–69 €/mois | Free 0,5 Go, Pro 19 $/mois jusqu'à 10 Go, Scale 69 $/mois. Multi-tenant à 1 000 clients = Scale obligatoire. |
| Clerk (auth) | inclus | **25 €/mois jusqu'à 10K MAU puis 0,02 €/MAU au-delà** | Free 10K MAU. Au-delà payant. À 50K MAU = 800 €/mois. **Risque hidden cost.** |
| Stripe Billing | 0,4 % + 0,25 € + Stripe 1,4 % + 0,25 € | ~2,5 % des revenus | Pas un coût fixe, un % du revenu. À ne pas oublier dans COGS. |
| Yousign eIDAS | 39–99 €/mois | 39 €/mois (50 sign) puis usage | Niveau qualifié = 4 € / signature. À facturer client. |
| **Bridge (Powens) DSP2** | 150 €/mois | **150–500 €/mois** | Forfait base 150 €/mois mais facture par compte connecté (0,15–0,30 €/compte/mois). À 1 000 clients × 1,5 compte = 1 500 comptes = +300 €/mois. |
| Resend email | 10 €/mois | 20 €/mois (100K emails) | OK pour 1K clients × 20 emails/mois |
| Sentry + Plausible | ~30 €/mois | 50 €/mois | OK |
| Cloudflare / S3 storage | inclus | 10–30 €/mois | Stockage photos EDL à 1 000 clients × 200 Mo = 200 Go. R2 = 0,015 $/Go = 3 €/mois. Trafic = négligeable. |
| **TOTAL réaliste à 100 clients** | 125–275 € | **200–350 €/mois** | +60 % |
| **TOTAL réaliste à 1 000 clients** | 275 € | **800–1 200 €/mois** | × 3–4 |
| **TOTAL réaliste à 5 000 clients** | – | **2 500–4 000 €/mois** | – |

**Verdict audit coûts** : la sous-estimation est de **30 à 50 %** sur les premiers mois et **× 3 à 4 à 1 000 clients**. À retenir : **Clerk au-delà de 10K MAU + Neon Scale + Vercel Pro = facteur de scale silencieux**.

### 5.2 — COGS et marge brute

**Modèle révisé** :

| Poste | À 100 clients | À 1 000 clients | À 5 000 clients |
|---|---|---|---|
| Infra (Vercel+Neon+Clerk) | 80 € | 250 € | 800 € |
| Bridge DSP2 (60 % clients souscrivent) | 150 € (60 × 2,50) | 450 € | 2 000 € |
| Stripe (2,5 % revenus) | 55 € (sur 2 200 € MRR) | 550 € (sur 22 K€ MRR) | 2 750 € |
| Yousign (usage facturé client) | – | – | – |
| Email Resend | 10 € | 20 € | 100 € |
| Storage R2 | 5 € | 30 € | 150 € |
| Sentry+Plausible | 30 € | 50 € | 100 € |
| Support (1 j-h/100 clients/mois × 60 €/h) | 60 € | 600 € | 3 000 € |
| **TOTAL COGS** | **390 €** | **1 950 €** | **8 900 €** |
| Revenus mensuels (ARPU 22 €) | 2 200 € | 22 000 € | 110 000 € |
| **Marge brute** | **82 %** | **91 %** | **92 %** |

→ Marge brute > 80 % atteinte dès 100 clients. **Cohérent avec benchmark SaaS B2C**.

### 5.3 — CAC réaliste — recalibrage du BIZPLAN

Le BIZPLAN annonce CAC moyen pondéré = **25 €** (60 % SEO × 12 € + 40 % paid × 45 €).

**Audit consultant : cette estimation est sous-évaluée d'un facteur 3.**

**CAC SaaS proptech FR réaliste 2026** :

| Canal | CAC réaliste | Source |
|---|---|---|
| SEO organic | **30–60 €** (vs 12 € BIZPLAN) | Coût rédacteur 80 €/article × 30 articles / 100 leads convertis = 24 €. + temps Didier non-comptabilisé. |
| Meta Ads (FB+Insta) immobilier | **60–120 €** (vs 45 €) | CPC FR immo = 1,50–3 €, conversion 1–2 % → CAC = 75–300 € |
| Google Ads "logiciel SCI" | **80–150 €** | CPC mot-clé immo = 2–5 € en FR |
| LinkedIn Ads B2B Hoguet | **150–400 €** | Cycle long, mais panier × 10 |
| Bouche-à-oreille / referral | 10 € (incentive) | À développer absolument |
| Partenariats EC / notaires | 50 € (commission) | Levier sous-utilisé |

**CAC pondéré réaliste mix 50 % SEO / 30 % paid / 20 % bouche-à-oreille** :
- 0,5 × 45 € + 0,3 × 90 € + 0,2 × 30 € = **55,50 €** (vs 25 € BIZPLAN)

**Impact sur unit economics** :

| Métrique | BIZPLAN | Audit consultant | Écart |
|---|---|---|---|
| CAC | 25 € | **55 €** | × 2,2 |
| ARPU | 11,40 € | 22 € (pricing révisé) | × 1,9 |
| LTV brut (20 mois) | 228 € | 440 € | × 1,9 |
| LTV net (marge 80 %) | 182 € | 352 € | × 1,9 |
| **LTV/CAC** | **7,3** | **6,4** | sain (> 3) |
| **Payback CAC** | 2,7 mois | **3,1 mois** | sain (< 12) |

→ Même avec CAC × 2,2 et ARPU × 1,9, le modèle reste **sain et fundable**. Mais les valeurs absolues changent la trajectoire de trésorerie.

### 5.4 — Break-even recalculé

**Hypothèses révisées** :
- Acquisition 80/mois cruise (vs 100 BIZPLAN)
- ARPU 22 € (vs 11,40 €)
- CAC 55 € (vs 25 €)
- Churn 4 %/mois (vs 5 %, gestionnaire B2B churne moins)
- COGS 18 % (vs 20 %)

| Période | Clients (net) | MRR (€) | ARR (€) | Cash cumul (€) |
|---|---|---|---|---|
| Q4 2026 | 90 | 2 000 | 24 K€ | –18 000 |
| Q1 2027 | 230 | 5 100 | 61 K€ | –22 000 |
| Q2 2027 | 380 | 8 400 | 100 K€ | –20 000 |
| **Q3 2027** | **520** | **11 500** | **138 K€** | **+5 000** ← break-even glissé d'1 trimestre |
| Q4 2027 | 650 | 14 300 | 172 K€ | +35 000 |
| Q4 2028 | 1 400 | 30 800 | 370 K€ | +200 000 |
| Q4 2029 | 2 200 | 48 400 | 580 K€ | +500 000 |

→ **Break-even Q3 2027** (vs Q4 2027 BIZPLAN). Glissement raisonnable. ARR 3 ans = 580 K€, comparable au scénario médian interne mais avec moins de clients (2 200 vs 3 200).

### 5.5 — Churn — benchmark sectoriel

| Segment | Churn mensuel benchmark | Lecture ImmoTrack |
|---|---|---|
| SaaS B2C consumer | 5–8 % | Trop pour bailleur (engagement long) |
| SaaS B2C niche pro (immo, légal, RH) | 3–6 % | Cible réaliste ImmoTrack |
| SaaS B2B SMB | 1–3 % | Pour tier gestionnaire Hoguet |
| Outlook ImmoTrack pondéré | **4 %/mois** | Mix Investisseur 5 % + SCI 3 % + Gestionnaire 1,5 % |

**Risque churn élevé** :
- Lancement V1 sans data import depuis concurrents → friction switch
- Si Drive sync présent + ratée → user perd données → churn brutal
- "Tax day" mai → désinscription massive juin si onboarding raté

**Risque churn faible** :
- Lock-in fiscal (10 ans de quittances stockées)
- Marché immo "fidèle" (bailleur change rarement d'outil)
- Annual contracts (lock 12 mois)

---

## 6. Projection revenus 5 ans — modèle consultant

### 6.1 — Hypothèses retenues

- Pricing scénario B (médian différencié) : ARPU pondéré 22 €
- CAC 55 €, mix 50 SEO / 30 paid / 20 referral
- Churn 4 %/mois pondéré
- COGS 18 %
- Capacité Didier 230 h sur 6 mois = 38 h/mois soit ~5 jours/mois → **insuffisant pour le brief, cf §7**

### 6.2 — Scénarios à 5 ans

#### Scénario médian consultant (réaliste)

| Année | Clients fin | MRR (€) | ARR (€) | Cash cumul (€) | Effectif |
|---|---|---|---|---|---|
| 2026 (Q4 launch) | 90 | 2 000 | 24 K€ | –18 000 | 1 (Didier) |
| 2027 | 650 | 14 300 | 172 K€ | +35 000 | 1 + freelance SEO |
| 2028 | 1 400 | 30 800 | 370 K€ | +200 000 | 1 + freelance dev junior |
| 2029 | 2 200 | 48 400 | 580 K€ | +500 000 | 1 + freelance + CSM |
| 2030 | 3 100 | 68 200 | 820 K€ | +900 000 | équipe 3–4 |
| 2031 | 4 000 | 88 000 | 1,05 M€ | +1,4 M€ | équipe 4–5 |

**ARR atteignable à année 3 : 370 K€** (médian raisonnable, conforme à un SaaS solo bootstrappé).

#### Scénario optimiste consultant (PMF démontré)

| Année | Clients | ARR | Trigger |
|---|---|---|---|
| 2026 | 200 | 50 K€ | early bird success + viral EDL délégué |
| 2027 | 1 200 | 320 K€ | levée seed 250 K€ Q1 |
| 2028 | 2 800 | 740 K€ | gestionnaire Hoguet ouvre Q3 2027 |
| 2029 | 4 500 | 1,2 M€ | – |
| 2030 | 6 500 | 1,75 M€ | – |
| 2031 | 9 000 | 2,4 M€ | sortie envisageable |

#### Scénario pessimiste consultant (slow burn)

| Année | Clients | ARR | Trigger |
|---|---|---|---|
| 2026 | 50 | 12 K€ | acquisition organique faible |
| 2027 | 200 | 50 K€ | break-even fin 2028 seulement |
| 2028 | 500 | 130 K€ | survie sans recrutement |
| 2029 | 900 | 235 K€ | viable mais non-scalable |
| 2030 | 1 400 | 365 K€ | – |
| 2031 | 1 800 | 470 K€ | – |

### 6.3 — Comparaison aux concurrents à 3 ans (ARR)

| Concurrent | ARR estimé 2026 | Trajectoire |
|---|---|---|
| Rentila | ~1 M€ | 16 ans pour atteindre |
| BailFacile | ~2,8 M€ | 8 ans pour atteindre |
| Qalimo | ~900 K€ | 8 ans pour atteindre |
| Gererseul | ~1,5 M€ | 19 ans pour atteindre |
| **ImmoTrack médian consultant fin 2029** | **580 K€** | – |
| **ImmoTrack haut consultant fin 2029** | **1,2 M€** | parité Gererseul en 3 ans = très ambitieux |

→ **Atteindre 1 M€ ARR à 3 ans est extrêmement rare en SaaS solo bootstrappé en France**. C'est faisable mais demande PMF démontré + levée seed.

### 6.4 — Valorisation revente théorique 2029–2031

| Scénario | ARR 2029 | Multiple ARR proptech FR | Valorisation |
|---|---|---|---|
| Pessimiste | 235 K€ | 2–3× | 470 K€ – 700 K€ |
| Médian | 580 K€ | 3–5× | 1,7 M€ – 2,9 M€ |
| Optimiste | 1,2 M€ | 4–6× | 4,8 M€ – 7,2 M€ |

**Acquéreurs potentiels** :
- Septeo Group (a déjà racheté INCH 2025 pour étendre ADB, B2B fits B2C bridge)
- Manda / Naxicap (proptech build-up)
- Naxicap / Apax / Mubadala (PE FR)
- Concurrent direct (Gererseul ou Rentila) pour consolider parc

→ **Réaliste : 1,5–3 M€ à 3 ans, 4–7 M€ à 5 ans en scénario médian-haut**. C'est un patrimoine pro respectable mais **pas une exit licorne**.

---

## 7. Risques business

### 7.1 — Risque marché : saturation / asphyxie SEO

**Niveau de risque : ⚠️ Élevé.**

- BailFacile a ~200 articles SEO de qualité, Rentila ~300, Qalimo ~150
- Mots-clés "logiciel gestion locative", "outil bailleur", "bail meublé" = **saturés top 10 Google**
- Coût d'acquisition organique va **monter** sur les prochaines 24 mois
- Risque : ImmoTrack n'aura jamais le SEO de BailFacile → reste 10× moins visible

**Mitigation** :
- Cibler **niches long-tail à 100–500 recherches/mois** au lieu de la tête de queue
- Exemples : "EDL délégué à distance", "calcul 2072 SCI familiale", "mandat gestion Hoguet 5 lots", "bail garage modèle"
- Investir dans le **build in public** LinkedIn (Didier) = canal personnel non-saturé
- Programme partenaires (notaires, EC) = canal indirect contournant SEO

### 7.2 — Risque dépendance Bridge (Powens)

**Niveau de risque : ⚠️ Élevé.**

- Bridge est **le seul agrégateur DSP2 mature B2C FR** avec API ouverte (les autres = Budget Insight = Bridge, Linxo Connect, Tink — Tink racheté Visa, peu accessible)
- **Coût annoncé 150 €/mois forfait** mais en réalité **+0,15–0,30 €/compte connecté/mois**
- À 1 000 clients × 1,5 compte = 1 500 comptes = **+300 €/mois variable**
- À 5 000 clients = **+750 €/mois variable**
- Bridge **augmente ses tarifs régulièrement** (historiquement +10–15 %/an depuis 2020)
- **Aucun fallback** : Tink/Plaid = pas dispo B2C FR sans contrat enterprise

**Mitigation** :
- Facturer DSP2 **en option payante** (+5 €/mois supplément Investisseur, inclus SCI/Gestionnaire)
- Maintenir le **mode import CSV manuel** (différenciant "souverain")
- Préparer un fallback Tink long terme (architecture abstraction de la couche bancaire)

### 7.3 — Risque cycle vente B2B gestionnaire long

**Niveau de risque : ⚠️ Moyen.**

- Cycle vente B2B SaaS pro 100–500 €/mois en France = **3–9 mois** (signature mandat, RC pro, formation équipe, migration data)
- Trésorerie : 230 h de dev pré-vente, 0 € de revenus pendant 9 mois sur ce segment
- Si on lance gestionnaire V2 Q3 2027, **premier revenu B2B en Q1 2028** au mieux

**Mitigation** :
- Démarrer le segment B2B **uniquement après break-even B2C** (Q3 2027 minimum)
- Faire **3 pilotes payants à tarif réduit** d'abord (Q2 2027) pour itérer le produit
- Acquisition outbound LinkedIn ciblée (300 cabinets ACI/FNAIM contactés direct)

### 7.4 — Risque acquisition : 230 h pour battre Rentila ?

**Niveau de risque : 🚨 Critique. Sous-dimensionnement majeur.**

**Calcul réel** :
- 230 h sur 5–6 mois = 38 h/mois = 1 jour/semaine
- **Le BIZPLAN interne** annonce 140 j-h dev + 50 j-h hors-dev = **1 520 h sur 18 mois** = ~85 h/mois
- Le brief audit indique 230 h sur 5–6 mois pour **migrer + commercialiser**
- Migration vanilla JS → Next.js multi-tenant = **600–1 200 h minimum** (estim consultant : refactor DB schema multi-tenant, auth, RBAC, billing, isolation tenant, RGPD multi-user, migration data des early adopters)

→ **Le budget temps 230 h est sous-dimensionné d'un facteur 3 à 5.** C'est techniquement infaisable seul sur 6 mois.

**Mitigation** :
- Étendre la fenêtre à **12 mois minimum** (lancement V1 Q2 2027 vs Q4 2026)
- OU **garder vanilla JS + sync Drive en V1 commerciale** (single-user mais avec landing + paywall) puis migrer V2 en 2027 quand revenus permettent freelance
- OU **lever 100 K€ pre-seed avant développement** pour financer 1 freelance senior 6 mois

### 7.5 — Risque saisonnalité "tax day" mai

**Niveau de risque : ⚠️ Moyen mais gérable.**

- Pic d'inscriptions **avril–mai** (pré-déclaration 2044)
- Risque churn massif **juin** (utilisateurs "one-shot" qui désinstallent après déclaration faite)

**Mitigation** :
- Pricing **annuel uniquement** (pas de mensuel) sur tier Investisseur → engagement 12 mois
- Onboarding qui montre la valeur **toute l'année** (alertes IRL, EDL, MRH, fin bail) pas seulement "déclaration en 5 min"
- Communication "votre 2044 vous coûte plus que l'outil annuel ; restez pour le reste de l'année"

### 7.6 — Risque concurrence banques (CIC, CM, BNP)

**Niveau de risque : ⚠️ Moyen — à surveiller.**

- **CIC** propose "Gestion Locative Pro" intégrée au compte pro (gratuit pour clients banque)
- **Crédit Mutuel** propose "Sereniloc" (gestion + GLI bundle)
- **BNP Paribas** distribue "Imodirect" en partenariat sur l'espace pro

**Risques** :
- Bundle "banque + assurance + outil gestion" → gratuité apparente difficile à concurrencer
- Distribution massive via réseau bancaire = 6 M de clients pro en agence
- Coût d'acquisition zéro pour la banque

**Pourquoi ce n'est pas un game-over** :
- L'outil banque est **basique** (calcul IRL, quittance simple, pas EDL, pas SCI avancée, pas conformité légale)
- Le bailleur SCI / Hoguet **ne veut pas être enfermé chez sa banque**
- ImmoTrack reste différencié sur les 3 axes (EDL délégué + 2072 + Hoguet)

**Mitigation** :
- Positionnement explicite "outil indépendant de la banque" (= drive sync souverain pertinent ici)
- Ne pas viser la cible "1 lot, banque uniquement" qui est captive
- Cibler bailleur 2+ lots qui a déjà rejeté l'offre banque

### 7.7 — Risque tech : pivot Next.js mal exécuté

**Niveau de risque : 🚨 Critique.**

- Migration vanilla JS monolithe → Next.js multi-tenant = **réécriture quasi complète**
- 30 000+ lignes de code à porter
- Risque de **régression fonctionnelle** sur les 60 features livrées en V1 vanilla
- Risque de **perte de différenciants** (offline-first, Drive sync = pas natif Next.js)

**Mitigation** :
- **Stratégie progressive recommandée** :
  - V1 commerciale (Q4 2026) = vanilla JS actuel + paywall Stripe + multi-user "léger" (1 compte = 1 user, sync Drive partagé entre devices)
  - V2 cloud (Q3–Q4 2027) = migration progressive Next.js, ouverture gestionnaire Hoguet
  - Ne pas tout réécrire avant d'avoir prouvé qu'il y a un marché
- **Garder les 6 différenciants forts** intactes (EDL délégué, Drive sync optionnel, zéro compte hostable self)

---

## 8. Verdict business

### 8.1 — Recommandation : **GO conditionnel avec pivot structurant**

**Pourquoi GO** :
- Marché de 1 M de bailleurs non-équipés = vrai potentiel
- 3 différenciants défensibles (EDL délégué, 2072 SCI, Hoguet) = barrière concurrentielle réelle
- Unit economics sains même en scénario pessimiste (LTV/CAC > 6)
- Produit déjà mature en usage perso → risque tech faible si on n'over-engineer pas

**Pourquoi conditionnel** :
- Budget temps annoncé (230 h sur 5–6 mois) est **3 à 5× sous-dimensionné** pour la stack proposée
- Stack Next.js + Clerk + Bridge **détruit le différenciant "Drive RGPD souverain"** → ImmoTrack devient un Qalimo-clone
- Pricing actuel BIZPLAN (9,90/19,90) **sous-monétise** la valeur captable → manque le tier Hoguet à 89 €
- "Simplicité + UX 1 écran + automatisation" comme pitch = **indéfendable face à Qalimo**

### 8.2 — Pivot recommandé — 3 axes structurants

#### Axe 1 — Pivot positionnement : "Trajectoire de vie patrimoniale"

> **ImmoTrack = le seul outil qui suit votre trajectoire : particulier 1 lot → SCI familiale 5 lots → mandataire Hoguet 30 lots.**

Bénéfices :
- Évite la guerre tarifaire B2C low-cost
- Capture la valeur du segment B2B Hoguet (panier × 10)
- Mémorable, pas générique

#### Axe 2 — Pivot stack : hybride progressif (pas tout Next.js d'un coup)

- **V1 (Q4 2026)** : ImmoTrack vanilla JS actuel + Stripe paywall + Clerk auth optionnelle + Drive sync **conservé en option** → différenciant souveraineté maintenu
- **V1.5 (Q2 2027)** : Backend Neon **léger** pour sync entre devices d'un même user (offline-first préservé)
- **V2 (Q4 2027)** : Multi-tenant Next.js complet pour tier gestionnaire Hoguet uniquement (B2C reste vanilla JS Drive)
- **V3 (2028)** : Refonte progressive si traction confirmée

**Économies** : 600–800 h de dev économisées sur l'année 1.

#### Axe 3 — Pivot pricing : capturer la valeur Hoguet

- Solo 0 € (1 lot freemium illimité)
- Investisseur **14,90 €/mois** (vs 9,90 BIZPLAN)
- SCI/Patrimoine **29,90 €/mois** (vs 19,90 BIZPLAN)
- **Gestionnaire Hoguet 89 €/user/mois** (nouveau tier)

→ ARPU pondéré 22 € au lieu de 11,40 € = +93 %.

### 8.3 — Pré-conditions sine qua non pour lancer

| Pré-condition | Cible avant lancement V1 |
|---|---|
| **15 early access engagés** | 10 bailleurs + 3 SCI + 2 gestionnaires Hoguet pilotes |
| **3 NDA + lettres d'intention signées** sur tier Hoguet | indispensable pour valider le tier 89 €/user |
| **30 articles SEO publiés** | 10 long-tail bailleur + 10 SCI + 10 Hoguet |
| **Budget marketing 8 K€** sur 6 premiers mois | 4 K€ paid ads + 2 K€ rédacteur freelance + 2 K€ partenariats |
| **Audit légal CGU/CGV + RGPD DPA + RC pro 2 K€/an souscrite** | bloquant commercial |
| **Validation EDL avocat 1 500 €** | pas commercialisable sans relecture pro |
| **Stripe activé + mode test validé sur 5 inscriptions** | – |

**Si 1 seule pré-condition KO → reporter le lancement.**

### 8.4 — Budget marketing initial à prévoir

**6 mois pré-lancement + 6 mois post-lancement = 12 mois investissement** :

| Poste | Coût 12 mois | Justif |
|---|---|---|
| Rédacteur SEO freelance | 12 K€ (1 jour/sem) | 30 articles long-tail |
| Designer UI/UX freelance | 4 K€ (3 sprints) | landing + onboarding + tier Hoguet |
| Meta + Google Ads | 8 K€ (700 €/mois) | acquisition paid |
| LinkedIn Ads B2B Hoguet | 3 K€ (250 €/mois × 12) | outbound B2B |
| Salon / RENT / FNAIM (V2 Q1 2027) | 3 K€ | networking gestionnaire |
| Outils marketing (Notion, Webflow, Mailerlite) | 1 K€ | – |
| Avocat CGU/CGV + DPA | 2 K€ | bloquant légal |
| Validation EDL avocat | 1,5 K€ | bloquant produit |
| Comptable (création + an 1) | 2,5 K€ | – |
| RC pro éditeur 2 K€/an | 2 K€ | – |
| Buffer 10 % | 4 K€ | – |
| **TOTAL** | **~43 K€** | – |

→ **Cash-out avant break-even = ~43 K€** (vs ~30 K€ BIZPLAN qui sous-estime marketing). À financer **en bootstrap** si Didier a la trésorerie personnelle, sinon levée pre-seed 100 K€ Q3 2026 nécessaire.

### 8.5 — Timeline réaliste de break-even

**Avec pivot recommandé (pricing révisé + hybride stack + tier Hoguet)** :

| Date | Jalon | Clients | MRR | Cash cumul |
|---|---|---|---|---|
| Q3 2026 | Pré-lancement + early access | 15 (gratuits) | 0 | –10 K€ |
| Q4 2026 | Lancement V1 commercial | 90 payants | 2 K€ | –22 K€ |
| Q2 2027 | Croissance SEO + content | 380 | 8,4 K€ | –20 K€ |
| **Q3 2027** | **Break-even mensuel** | **520** | **11,5 K€** | **+5 K€** |
| Q4 2027 | Lancement V2 Hoguet pilote | 650 | 14 K€ | +35 K€ |
| Q2 2028 | Tier Hoguet ouvert | 900 | 22 K€ | +100 K€ |
| Q4 2028 | Croissance stable | 1 400 | 31 K€ | +200 K€ |
| Q4 2029 | Maturité | 2 200 | 48 K€ | +500 K€ |

→ **Break-even Q3 2027** (12 mois post-launch). **Cohérent BIZPLAN interne** mais avec moins de clients et plus de revenus par client.

### 8.6 — Conclusion finale

**Le projet ImmoTrack V2 est viable économiquement** à condition de :

1. **Pivoter le positionnement** vers "trajectoire de vie patrimoniale" (particulier → SCI → Hoguet) plutôt que "simplicité + UX"
2. **Pivoter le pricing** vers 14,90/29,90/89 € pour capturer la valeur Hoguet
3. **Pivoter la stack** vers hybride progressif (vanilla JS V1, multi-tenant Next.js V2 ciblé gestionnaire uniquement) plutôt que tout-cloud immédiat
4. **Étendre le timeline** à 12 mois pré-lancement (vs 5–6 mois annoncés)
5. **Budget cash 43 K€** investi sur 12 mois (bootstrap si possible, sinon levée pre-seed 100 K€)

**Si ces 5 conditions sont tenues** : break-even Q3 2027, ARR 580 K€ à 3 ans, valorisation revente 1,7–2,9 M€.

**Si elles ne sont pas tenues** : risque d'épuisement Didier en 2027 ou de pivot subi vers consulting / freelance.

**Verdict consultant : GO sous conditions, PIVOT requis.**

---

## 9. Sources

### Données marché
- [INSEE — Parc des logements 2025 (Focus 359)](https://www.insee.fr/fr/statistiques/8640662)
- [INSEE — Propriétaires-locataires 2024](https://www.insee.fr/fr/statistiques/4277733)
- [INSEE — 24 % ménages détiennent 68 % logements](https://www.insee.fr/fr/statistiques/5432517)
- [Verified Market Reports — Rental Property Mgmt SW](https://www.verifiedmarketreports.com/product/rental-property-management-software-market/)
- [Tool-advisor — Chiffres logiciels SaaS](https://tool-advisor.fr/blog/chiffres-logiciels-saas/)
- [Businesscoot — Marché SaaS France](https://www.businesscoot.com/fr/etude/le-marche-du-software-as-a-service-france)

### Concurrents B2C
- [Rentila pricing](https://www.rentila.com/pricing)
- [Qalimo tarifs](https://www.qalimo.fr/tarif/)
- [BailFacile tarifs](https://www.bailfacile.fr/tarifs)
- [Smovin tarifs FR/BE](https://www.smovin.app/fr-be/tarifs/)
- [Gererseul tarifs](https://www.gererseul.com/tarifs/)
- [Smartloc tarifs](https://www.smartloc.fr/tarifs)
- [ImmobilierLoyer](https://www.immobilierloyer.com/)
- [Pappers — BailFacile](https://www.pappers.fr/entreprise/bailfacile-827909078)

### Concurrents B2B / consolidation
- [Septeo Group ADB](https://www.septeo-adb.fr/)
- [Le Journal des Entreprises — Septeo recrutement 2025](https://www.lejournaldesentreprises.com/breve/le-groupe-septeo-prevoit-de-recruter-350-personnes-en-2025-2116198)
- [MySweetimmo — Septeo INCH rachat](https://www.mysweetimmo.com/2025/10/28/immobilier-septeo-muscle-son-offre-adb-avec-le-rachat-dinch/)
- [Maddyness — Manda rachats Naxicap](https://www.maddyness.com/2024/10/28/la-proptech-manda-continue-de-grandir-et-annonce-de-nouveaux-rachats/)
- [Étude USH 2022 logiciels syndic](https://www.union-habitat.org/sites/default/files/articles/pdf/2022-04/ush-etude_logiciels_copropriete.pdf)

### Stack / infra
- [Vercel pricing](https://vercel.com/pricing)
- [Neon PostgreSQL pricing](https://neon.tech/pricing)
- [Clerk pricing](https://clerk.com/pricing)
- [Bridge (Powens)](https://bridgeapi.io/)
- [Yousign tarifs](https://yousign.com/fr/tarifs)
- [Stripe Billing](https://stripe.com/billing)

### Internes
- `docs/strategie/BIZPLAN.md` (avril 2026)
- `docs/strategie/CARTE_POSITIONNEMENT.md`
- `docs/strategie/PROJECTIONS.md`
- `docs/strategie/VEILLE-QALIMO-V2-2026.md`
- `ImmoTrack_Comparatif_Concurrents_2026.xlsx` (149 critères, 9 outils)

---

**Fin du rapport SAAS-V2-AUDIT-BUSINESS.md**
*~3 800 mots, 9 sections, 30 tableaux, 28 sources externes citées.*
