# BIZPLAN ImmoTrack — Dossier décisionnel V1 commerciale

> **Document principal du dossier BIZPLAN-STRATEGIE.**
> 4 documents annexes : [CARTE_POSITIONNEMENT.md](CARTE_POSITIONNEMENT.md) · [EFFORT_DEPLOIEMENT.md](EFFORT_DEPLOIEMENT.md) · [PROJECTIONS.md](PROJECTIONS.md) · [PLAN_ACTIONS.md](PLAN_ACTIONS.md)
> Daté avril 2026. Échéance lancement V1 visée : 14 octobre 2026.

---

## Sommaire

1. [Contexte & Vision](#1-contexte--vision)
2. [Étude de marché](#2-étude-de-marché)
3. [Analyse concurrentielle (B2C + B2B)](#3-analyse-concurrentielle-b2c--b2b)
4. [Positionnement-cible](#4-positionnement-cible)
5. [Proposition de valeur](#5-proposition-de-valeur)
6. [Modèle économique](#6-modèle-économique)
7. [Go-to-market](#7-go-to-market)
8. [Roadmap synthèse](#8-roadmap-synthèse)
9. [Effort de déploiement & ressources](#9-effort-de-déploiement--ressources)
10. [Décisions à valider](#10-décisions-à-valider)

---

## 1. Contexte & Vision

### 1.1 — Ce qu'est ImmoTrack aujourd'hui (avril 2026)

ImmoTrack est une **application web vanilla JS** (HTML+JS+IndexedDB+Drive sync optionnel) de gestion locative immobilière, **utilisée en production par son créateur Didier Keller depuis ~2 ans**. Le code source est un monolithe HTML, environ 30 000+ lignes, couvrant 14 onglets fonctionnels :

- 📊 Dashboard (refonte v2 livrée, contrainte one-screen ~900 px)
- 📜 Bail (wizard + signature + snapshot signé + types meublé/garage… en cours)
- 🏢 Logement / Équipement
- 🏛️ Entité / Immeuble (multi-SCI)
- 💰 Mouvements (loyers + charges)
- 🧾 Quittances (auto-quittance + civilité par locataire)
- ⚡ Charges / Régularisation
- 📈 IRL (révision + lettre + DPE F/G blocking + popup mois anniversaire)
- 📋 EDL (entrée + sortie + photos + comparatif 7 colonnes)
- 🛡️ MRH / Assurances
- 🔧 Travaux / Entretien (à compléter)
- 🤝 Associés (à refondre)
- ⚙️ Paramètres + Drive sync (file-based, par-user + par-entité)
- 📤 Export

**Score Scorecard interne** : 54,7 % de couverture sur 149 critères concurrence — **dernière place du panel**, MAIS **12 critères différenciants exclusifs (les autres : 0)**.

### 1.2 — Vision long terme (3 ans)

> **Devenir le 1er outil de gestion locative B2C en France pour les bailleurs particuliers et SCI familiales qui veulent un outil pro sans agence ni dépendance, en gardant la souveraineté de leurs données.**

Cap commercial à 3 ans (scénario médian, cf [PROJECTIONS.md](PROJECTIONS.md)) :
- 3 200 clients payants
- ARR 540 K€
- EBITDA 144 K€ (38 %)
- Valorisation potentielle 1,6–2,7 M€ à revente

### 1.3 — Pourquoi commercialiser maintenant

| Signal | Lecture |
|---|---|
| Le produit est **mature en usage perso** (~2 ans en prod sans data loss) | Le risque de bug critique en prod est gérable |
| Le **comparatif quantitatif** révèle 12 différenciants exclusifs durables | Le moat est réel, pas un argument marketing |
| Le **marché est en consolidation B2B (Septeo, Manda)** mais reste fragmenté côté B2C | Fenêtre d'entrée nette avant qu'un consolidateur ne fasse pareil en B2C |
| Le **cadre réglementaire 2026 (loi Climat DPE F/G, déclaration 2044)** crée une demande logicielle | Tailwind réglementaire |
| Didier dispose d'environ **15–18 j-h/mois** + ~12 mois d'avance produit | Capacité d'exécution réaliste pour livrer V1 d'ici Q4 2026 |
| Croissance marché logiciels gestion locative mondial : **CAGR 8,6 %** ($10,5 → 21,8 Md$ d'ici 2033) | Marché porteur sur la décennie |

**Conclusion** : la fenêtre est ouverte, le produit est près, les 12 ⭐ différenciants sont défendables. Reporter au-delà de Q4 2026 = laisser entrer un concurrent sur la même thèse.

---

## 2. Étude de marché

### 2.1 — Taille du marché en France

#### Parc locatif privé (cible primaire ImmoTrack)

| Métrique | Valeur 2025 | Source |
|---|---|---|
| Part du parc privé locatif (résidences principales) | **22,8 %** | INSEE Focus 359, 1er janv. 2025 |
| Volume estimé (sur ~30 M résidences principales) | **~6,8 M logements** | INSEE Focus 332/359 |
| Part SCI dans logements en location | **12 %** | INSEE — France, portrait social |
| Volume estimé logements détenus en SCI (location) | **~820 K logements** | dérivé |
| Croissance part bailleurs privés depuis 1997 | +0,9 point | INSEE |

**Marché total adressable français** : ~6,8 M logements gérés par ~2 à 3 M de bailleurs particuliers + SCI familiales (estim, INSEE 24 % des ménages détiennent 68 % des logements possédés).

#### Marché logiciels gestion locative

| Métrique | Valeur | Source |
|---|---|---|
| Marché mondial Rental Property Mgmt SW 2024 | $10,47 Md | Verified Market Reports |
| Projection 2033 | $21,76 Md | – |
| CAGR 2024–2033 | **8,6 %** | – |
| Part France du marché SaaS européen | 12,5 % | tool-advisor.fr |
| Croissance VILOGI 2024 (proxy growth marché FR) | **+47 %** | businesscoot SaaS |
| CA Septeo Group 2024 (logiciels juridique+immo) | 420 M€ (+20 %) | Le Journal des Entreprises |

#### Marché B2C français adressable estimé

Sur ~6,8 M logements locatifs privés, on estime que **20–25 % sont gérés via un logiciel SaaS** (le reste : Excel personnel, agence physique, gestion manuelle).
- Marché B2C SaaS gestion locative FR (estim) : **~1,5 M logements gérés via logiciel**
- À ARPU moyen 8 €/mois × 12 = **~145 M€ de marché annuel adressable**
- Concurrents B2C cumulés : Rentila (200 K biens), Gererseul (42 K users × ~3 logements estim = ~120 K biens), Qalimo / BailFacile / Smartloc / autres : ~150 K biens estim cumul = **~470 K biens captés** sur ~1,5 M → **~30 % de pénétration logicielle**

**Conclusion** : 1 M de logements potentiellement adressables ne sont pas encore digitalisés. C'est un marché en cours de digitalisation, pas un marché captif à voler aux concurrents.

### 2.2 — Tendances réglementaires 2025–2026 (tailwinds)

| Tendance | Impact | Opportunité ImmoTrack |
|---|---|---|
| **Loi Climat 2021** : interdiction location DPE G (2025), F (2028), E (2034) | Bailleurs forcés de connaître DPE + plan rénov | IRL-DPE-FG ✅ déjà livré v13.31 |
| **Encadrement loyers** zones tendues élargies | Nécessité formules de calcul automatiques | déjà pris en compte (BAIL-TRAVAUX-INTERLOC) |
| **Déclaration 2044 / 2072** complexification | Demande de mapping fiscal automatique | LEGAL-2044 + LEGAL-2072 — différenciants |
| **Open Banking DSP2** maturité | Standardisation rapprochement bancaire | À l'inverse, posture "pas de DSP2" peut être différenciante (souverain) |
| **RGPD + souveraineté numérique** | Angoisse hébergement données / GAFAM | Drive sync + zéro compte = ⭐ différenciant majeur |

### 2.3 — Tendances comportementales

| Tendance | Source/Lecture |
|---|---|
| Augmentation du DIY immobilier (gérer sans agence) | +200 % de recherches Google "gérer seul" depuis 2019 (estimation) |
| Investisseurs locatifs jeunes (25–40 ans) | base BailFacile, Smartloc — 60 % < 45 ans (estim sites) |
| SCI familiale en hausse | +12 % création SCI 2020–2024 (estim, croisement INSEE/Insee Focus) |
| Demande mobile native | Smartloc 4,7/5 store ; Gererseul absent — segment ouvert |

---

## 3. Analyse concurrentielle (B2C + B2B)

> Synthèse — le détail est dans [CARTE_POSITIONNEMENT.md](CARTE_POSITIONNEMENT.md).

### 3.1 — Trois familles distinctes

| Famille | Acteurs principaux | Modèle | Cible commune |
|---|---|---|---|
| **B2C SaaS particuliers** | Rentila, BailFacile, Smartloc, Qalimo, Gererseul, ImmobilierLoyer, Smovin | Abonnement 5–30 €/mois | Bailleurs perso 1–20 logements + SCI |
| **B2B SaaS pro** | Septeo (ICS, Crypto, ADB), LOCKimmo, Powimo, Vilogi, Hektor | Devis 80–300 €/mois/utilisateur | Agences, syndics, admin de biens |
| **Agences digitales** | Manda, Imodirect, Hellio | % loyer 5–8 % ou €/m² | Bailleurs voulant déléguer 100 % |

ImmoTrack se positionne en **B2C SaaS particuliers** (V1), avec extension **B2B agence pilote V2** (Q3 2027).

### 3.2 — Hiérarchie des concurrents B2C par couverture (Scorecard 149 critères)

| # | Outil | Score pondéré | Différenciants ⭐ | Pricing entrée (€/mois) | Trustpilot |
|---|---|---|---|---|---|
| 1 | Qalimo | **71,1 %** | 0 | 0–5 | 4,9/5 (record) |
| 2 | Gererseul | 67,8 % | 0 | 9,75 | 4,8/5 |
| 3 | Rentila | 63,1 % | 0 | 0–8 | 4,5/5 |
| 4 | ImmobilierLoyer | 57,7 % | 0 | 7,70 | n/a |
| 5 | BailFacile | 55,0 % | 0 | 9,90 | n/a |
| 5 | Smartloc | 55,0 % | 0 | 6,50 | n/a |
| 5 | Smovin | 55,0 % | 0 | 4–8 | n/a |
| 8 | **ImmoTrack** | **54,7 %** | **12** ⭐ | **0 / 9,90 / 19,90 (proposé)** | – |

**Lecture** : ImmoTrack arrive 8e en couverture brute, mais c'est le seul du panel avec des différenciants exclusifs identifiés. La trajectoire-cible V1 = **65–70 % de couverture + 12 ⭐ + 4 nouveaux différenciants**.

### 3.3 — Hiérarchie B2B (référentiel + cible V2)

| Outil | Score | Pricing | Cible | Stratégie 2024–2026 |
|---|---|---|---|---|
| Septeo Crypto/ICS/ADB | 86,2 % | sur devis | Agences, admin biens | Consolidation : 8 acquisitions 2024, vise 1 Md€ revenus 2030 |
| LOCKimmo | 86,2 % | sur devis | Agences indép. | Modulaire (gestion / syndic / transaction) |
| Powimo (Seiitra) | n/a | sur devis | Tout-en-un syndic+GL | "Claim #1 syndic" |
| VILOGI | n/a | abonnement | Syndic full web | +47 % croissance 2024 |
| Hektor (La Boîte Immo) | n/a | abonnement | Transaction (≠ GL) | 8 500 agences, 45 K users |
| Manda (digital agency) | – | 5,9 % loyer | Bailleur voulant déléguer | 9+15 acquisitions, 43 M€ Naxicap |

**Lecture** : Le B2B est en consolidation rapide (Septeo + Manda). ImmoTrack ne doit PAS attaquer ce segment en V1. La cible V2 (Q3 2027) = "petit gestionnaire / mini-agence familiale 5–30 logements" = niche entre B2C et B2B où aucun acteur n'est dominant.

### 3.4 — Positionnement carte 2D (résumé)

```
                                                Richesse fonctionnelle
                                                       ↑
                                              Septeo Crypto ⬛   LOCKimmo ⬛
                                              (86,2 % · sur devis)
                                  
                            Qalimo ●  Gererseul ●
                            (71,1 % · 5–15 €) (67,8 % · 9,75 €)
                            
                  Rentila ●  ImmobilierLoyer ●  BailFacile ●  Smartloc ●  Smovin ●
                  (63,1 %)    (57,7 %)            (55 % · 9,90 €)
                  
            ⭐ ImmoTrack (54,7 % + 12 ⭐ exclusifs · 0–19,90 €)
                    ↗ trajectoire V1 = 65–70 % + 16 ⭐
                                                       │
   ─────────────────────────────────────────────────────→ profil utilisateur
   solo 1 bien     SCI 2-10        pro <30        pro agence
```

**Vide stratégique repéré** : pas d'acteur B2C avec couverture ≥ 70 % + différenciants exclusifs ≥ 5 + prix < 15 €/mois. → C'est la promesse-cible d'ImmoTrack V1.

---

## 4. Positionnement-cible

### 4.1 — Phrase de positionnement

> **ImmoTrack = le seul outil de gestion locative B2C qui combine couverture fonctionnelle pro (~70 %), différenciants techniques exclusifs (EDL délégué offline, Drive RGPD souverain, zéro compte requis), et prix accessible (< 20 €/mois max), pour le bailleur particulier 2–10 logements et les SCI familiales qui veulent rester maîtres de leurs données.**

### 4.2 — Personas

| Persona | Description | % portefeuille V1 cible | Plan ciblé |
|---|---|---|---|
| **Bailleur autonome** | 35–55 ans, 2–10 logements, SCI familiale, geek-friendly, soucieux de ses données | 60 % | Investisseur 9,90 € |
| **Investisseur en route** | 25–45 ans, 1er ou 2e bien, vient de Rentila/BailFacile, monte en gamme | 25 % | Solo gratuit → Investisseur |
| **SCI familiale étendue** | 50–70 ans, 5–25 lots, gestion patrimoniale familiale, sensible compta SCI | 15 % | SCI/Patrimoine 19,90 € |

### 4.3 — Forces différenciantes à pousser commercialement

Les **6/12 différenciants à défensibilité forte** (cf [CARTE_POSITIONNEMENT.md §6](CARTE_POSITIONNEMENT.md)) :

1. **EDL délégué offline export+import** ⭐⭐ — argument viral : "faites faire l'EDL par votre cousin / agent / sœur sans connexion, récupérez le JSON"
2. **Drive sync RGPD souverain** ⭐ — argument différenciation : "vos données restent chez vous"
3. **Rapprochement auto loyer/paiement sans DSP2** ⭐ — argument souveraineté : "pas besoin de connecter votre banque"
4. **Templates HTML personnalisables (mode lecture + mode avancé)** ⭐ — argument expert : "votre bail à votre image, pas un PDF figé"
5. **Zéro compte requis** ⭐ — argument minimaliste : "pas de cloud captif"
6. **Snapshot signé + highlight diff** — argument confiance : "votre bail signé reste intact, les modifs ultérieures sont visibles"

Plus 6 différenciants à défensibilité moyenne (paraphes HiDPI, EDL pré-rempli, dashboard one-screen, aperçu IRL inline, tableau cash-flow, comparateur EDL 7 colonnes).

### 4.4 — Faiblesses à combler avant V1 (synthèse)

| Catégorie | Manques bloquants | Effort total V1 |
|---|---|---|
| 🔴 Sécurité / qualité | AUDIT-GLOBAL, SECU-INNERHTML, EDL-VALIDATION-AVOCAT | 4,2 j-h |
| 🔴 Légal / fiscal | LEGAL-2044, LEGAL-BILAN-ANNUEL | 4,5 j-h |
| 🟠 Standards marché | QUIT-EMAIL, AVIS-ECHEANCE, RAPPEL-IMPAYE, IMPORT-EXCEL-LOG, IMPORT-CONCURRENTS, BAIL-TYPES | 10,5 j-h |
| 🔵 Onboarding & UX | V3-VISUEL, V3-REFONTE × 6 onglets | 13 j-h |
| 🔵 Drive sync re-archi | DRIVE-2H, DRIVE-2F, DRIVE-2G | 3,5 j-h |
| **TOTAL effort pré-V1** | | **~52 j-h** (cf [EFFORT_DEPLOIEMENT.md](EFFORT_DEPLOIEMENT.md)) |

---

## 5. Proposition de valeur

### 5.1 — Value Proposition Canvas (synthèse)

#### Tâches du client (jobs to be done)

- Encaisser les loyers de mes biens sans erreurs
- Sortir un bail conforme rapidement quand un nouveau locataire arrive
- Faire un EDL en sortie en respectant le décret 2016-382 (sans risque de litige)
- Réviser l'IRL légalement (sans rater la fenêtre + sans réviser à tort si DPE F/G)
- Préparer ma déclaration 2044 (et 2072 si SCI IR)
- Garder un historique exploitable pour 10 ans (audit, vente, succession)
- Ne pas dépendre d'une agence physique ni d'un cloud étranger

#### Pains du client

- Outils existants : trop simples (Excel, Rentila gratuit) OU trop complexes / chers (Crypto, Lockimmo)
- Agence : 5–10 % du loyer = cher + perte de contrôle
- Risque de litige EDL si délégation à un tiers (l'autre partie peut contester ce qui n'est pas signé)
- Anxiété fiscale 2044 / 2072 (mauvais mapping = redressement)
- Anxiété DPE (évolution loi Climat F/G/E)
- Anxiété données : "et si Rentila ferme demain, je perds tout ?"

#### Gains du client

- Un outil qui couvre 70 % des cas, gratuit pour 1 bien
- EDL délégué qui produit un JSON signé par les deux parties + traçable
- Drive sync personnel = sauvegarde automatique chez l'utilisateur
- Snapshot signé des baux = preuve juridique inaltérable
- Mapping fiscal qui calcule les valeurs prêtes à reporter
- Indicateurs DPE intégrés (plus de risque de réviser un F/G illégalement)

### 5.2 — Slogan et tagline candidates

| Slogan | Note |
|---|---|
| *Gérer votre parc locatif avec la rigueur d'un pro, sans dépendre de personne* | claim positionnement complet |
| *L'outil de gestion locative qui ne capture pas vos données* | claim souveraineté |
| *Tous les indispensables. Aucun cloud captif.* | claim minimaliste |
| *Votre parc, vos données, vos règles.* | claim pourquoi changer |

→ Recommandation : **"Tous les indispensables. Aucun cloud captif."** (souveraineté + simplicité), avec sous-titre "Gestion locative pour bailleurs autonomes 1–30 logements."

### 5.3 — Argumentaires comparatifs (5 leviers commerciaux)

| Si concurrent attaqué | Argument ImmoTrack |
|---|---|
| Rentila ("trop simple") | "ImmoTrack a tous les détails de Rentila + EDL délégué + dashboard pro + fiscal" |
| BailFacile ("similaire") | "Au même prix, plus de fonctions exclusives (EDL, snapshot, Drive RGPD)" |
| Qalimo ("meilleur Trustpilot") | "Qalimo n'a aucune fonction exclusive — ImmoTrack en a 12. À choisir entre confort UX et souveraineté + outils pros, ImmoTrack" |
| Gererseul ("fiscaliste humain") | "Gererseul a 17 ans + accompagnement humain. ImmoTrack a la modernité UX + EDL délégué + offline. Complémentaires" |
| Septeo / LOCKimmo ("pro") | "10× moins cher, focalisé sur les bailleurs particuliers, vos données restent chez vous" |
| Manda / agence physique | "Vous gardez le contrôle + 90 % d'économies vs honoraires agence" |

---

## 6. Modèle économique

### 6.1 — Comparaison des 4 modèles candidats

| Modèle | Rentabilité 3 ans | Risque | Lecture |
|---|---|---|---|
| **A. SaaS pur** (9,90/19,90 €/mois) | ARR 540 K€ médian | Bas | **Recommandé** |
| **B. Freemium agressif** (1 bien gratuit illimité + payant 2+ biens) | ARR 540 K€ + 30–40 % volume bonus | Moyen (cannibalisation freemium) | **Recommandé combiné avec A** |
| **C. License one-shot** (149 €/an + maintenance 49 €/an) | ARR équivalent mais churn élevé | Haut (concurrence SaaS écrase) | Écarté |
| **D. Hybride SaaS + EDL pay-per-use** (9,90 € + EDL délégué 9 €/utilisation) | ARR 540 K€ + ~5 % bonus EDL | Moyen | Compatible avec A+B |

**Recommandation finale** : **Modèle A + B + D combinés**.
- A : abonnement standard
- B : freemium 1 bien complet (≠ Rentila bridé) — capte la masse
- D : EDL délégué pay-per-use 9 € — produit d'appel viral

### 6.2 — Pricing détaillé recommandé

| Plan | Limite | Prix mensuel | Prix annuel (–17 %) | Cible |
|---|---|---|---|---|
| 🆓 **Solo Découverte** | 1 logement, fonctions de base, freemium illimité | **0 €** | – | acquisition + conversion 15 % |
| 💼 **Investisseur** | 2–10 logements, multi-entités, EDL délégué, snapshot signé, fiscal complet | **9,90 €/mois** | **99 €/an** | cible primaire |
| 🏛️ **SCI/Patrimoine** | 11–30 logements, multi-SCI, clauses perso, mandataire Hoguet, 2072 SCI (V2) | **19,90 €/mois** | **199 €/an** | cible secondaire SCI |
| 🏢 **Agence Pro** (V2 Q3 2027) | mandants, CRG, honoraires, multi-users, portail loc | **49,90 €/mois/user** | **499 €/an/user** | cible V2 |

#### Produits d'appel
- EDL délégué pay-per-use : **9 € HT / EDL généré** (non-abonnés)
- Pack template bail premium : 19 € HT (one-shot)
- Partenariat GLI/MRH/EC : 5–15 % rétrocession (revenus complémentaires)

#### Justification pricing
- 9,90 € = **aligné BailFacile** (vu comme le standard moderne sur le panel)
- 19,90 € = **aligné BailFacile multi** + Smartloc Investisseur 20 €
- Freemium 1 bien plus généreux que Rentila (Rentila bride à 2 baux/2 locataires) = **argument marketing fort**
- EDL pay-per-use 9 € = **différenciant exclusif viral** (pas de concurrent ne peut copier rapidement)

### 6.3 — Ratios SaaS du modèle

| Métrique | Hypothèse | Bench |
|---|---|---|
| ARPU moyen pondéré | 11,40 €/mois | – |
| CAC moyen pondéré (60 % SEO + 40 % paid) | 25 € | bench 30–60 €, sain |
| LTV brut (avec churn 5 %) | 228 € | – |
| LTV net (marge 80 %) | 182 € | – |
| LTV/CAC | **7,3** | sain dès > 3 |
| Payback CAC | **2,7 mois** | sain dès < 12 |
| Marge brute | **80 %** | bench SaaS B2C : 70 %+ |
| Marge EBITDA cruise (2028+) | **38 %** | bench SaaS niche : 25–40 % |

→ Modèle **fundable** (toutes les métriques au vert dès scénario médian).

### 6.4 — Coûts variables (COGS) ventilés

| Poste | Pour 1 client/mois | Note |
|---|---|---|
| Paddle MoR (5 %) | 0,57 € (sur 11,40 €) | – |
| Email transactionnel (Resend) | 0,02 € | quittances + rappels mensuels |
| Storage / CDN | 0,01 € | négligeable, Cloudflare gratuit |
| Sentry / Plausible | 0,02 € | – |
| Support (4 j-h/mois × 60 €/h pour 250 clients) | ~1 €/client | 100/250 clients pivot |
| **Total COGS** | **~1,60 €** soit **14 %** | – |

→ Marge brute confirmée à 80–86 %.

### 6.5 — Comparaison concurrents (rappel)

| Outil | Plan entrée (€/mois) | Plan multi (€/mois) | ImmoTrack vs |
|---|---|---|---|
| Rentila | 0–8 | 8 | + cher mais beaucoup plus complet |
| Smartloc | 6,50 | 12,50–20 | similaire prix, ImmoTrack + différencié |
| BailFacile | 9,90 | 19,90 | **identique** — ImmoTrack + différencié + freemium |
| Qalimo | 0–5 | 5–15 | ImmoTrack + cher mais > sur fiscal+SCI+Drive |
| Gererseul | 9,75 | 9,75+ | similaire prix, ImmoTrack moderne UX |
| ImmobilierLoyer | 7,70 | 12,50 | ImmoTrack + cher mais 2072 SCI à venir |

---

## 7. Go-to-market

### 7.1 — Stratégie d'acquisition (mix 60 % organique / 40 % paid)

#### A. SEO Content (canal principal)

Investir dans le contenu autour des **questions à intention forte** :
- "calcul IRL 2026 + lettre type"
- "déclaration 2044 SCI / explications"
- "modèle bail meublé / mobilité / étudiant 2026"
- "EDL conforme décret 2016-382 + photos compteurs"
- "DPE F G interdiction location 2025 2028"
- "comparatif Rentila vs BailFacile vs ImmoTrack"

Cible **30 articles avant lancement + 12/an post-lancement** = ~80 articles à 6 mois post-lancement.

#### B. Paid Ads (acquisition initiale)

- **Meta Ads** (Facebook + Instagram) : ciblage "investissement locatif", "SCI", 25–55 ans, propriétaires fonciers — 200–400 €/mois
- **Google Ads** long-tail : "logiciel SCI", "déclaration 2044", "EDL gratuit" — 200–400 €/mois
- LinkedIn Ads : **PAS** en V1 (CPC > 5 € pour B2C = ROI faible). Réserver V2 pour cible agences.

#### C. Communautés & PR

- **r/vosfinances** (Reddit FR) : 200 K membres, présence non-spammy
- **r/ImmobilierFR** + r/dividendes
- **Forums BailPDF, Investis, Rentilot** — articles invités possibles
- **LinkedIn perso Didier** : 2–3 posts/semaine retraçant le build in public
- **Product Hunt** + **Indie Hackers** au lancement (jour J + 1)

#### D. Partenariats (effet levier)

- **Notaires + experts-comptables** : démarcher 50 cabinets d'EC spécialisés immo, leur fournir un compte gratuit pour qu'ils recommandent à leurs clients SCI
- **Influenceurs investissement immobilier** YouTube (canal saturé mais quelques niches : "Le Coin du SCI", "Olivier le Patrimoine") — 2–3 partenariats vidéos sponsorisées (300–800 € chacun)
- **Hellio + Insured** (GLI) : revente croisée (commission)

### 7.2 — Onboarding & conversion

- **Wizard premier-démarrage** : guide en 5 étapes (créer entité → ajouter logement → ajouter bail → premier mouvement → premier EDL)
- **Import depuis concurrents** (IMPORT-CONCURRENTS) : 3 mappers V1 (Rentila, BailFacile, Qalimo) → réduit le coût de switch
- **Tutos vidéos courts YouTube** (3–5 min, 10 vidéos) : produits avant lancement (cf §C.1 EFFORT_DEPLOIEMENT)
- **Trial-free** : pas d'essai limité 14 jours mais **freemium illimité 1 bien**, pression conversion = "ajoutez votre 2e bien" → upgrade

### 7.3 — Pricing introduction (early bird)

- **Code EARLYBIRD2026** : 50 % off première année pour les 100 premiers clients sur Investisseur (49 €/an au lieu de 99 €/an)
- Validité 14 oct – 30 nov 2026
- Non cumulable avec discount annuel

### 7.4 — Funnel cible (scénario médian, fin 2026)

```
Visiteurs uniques mois 3 (déc 2026)  → 12 000   (SEO + ads + RS)
                ↓ inscription freemium 6 % conversion
Inscrits freemium                     → 720
                ↓ activation (ajout 1 bien) 70 %
Activés                               → 504
                ↓ conversion payant 30 % (sur activés)
Clients payants nouveaux               → 150 (cible MRR 1 600 €)
                ↓ churn 5 %/mois
Net actifs                             → 150
```

### 7.5 — Sales / sales-led activation (V2)

À partir de Q2 2027 (V2 multi-users), bascule partielle vers **sales-led pour le segment SCI/Patrimoine** :
- Démos 1-to-1 sur calendly
- Outbound LinkedIn ciblé "SCI familiale + 5 lots"
- Webinars trimestriels saisonniers (déclaration mai, IRL automne)

---

## 8. Roadmap synthèse

> Détail trimestre par trimestre dans [PLAN_ACTIONS.md](PLAN_ACTIONS.md). Récap ici.

### Vue 18 mois (Q2 2026 → Q4 2027)

| Trimestre | Phase | Livrables produit clés | Jalons commerciaux | MRR cible |
|---|---|---|---|---|
| **Q2 2026** | Fondation | AUDIT, SECU, LEGAL-2044, BUG fix P1 | Setup juridique, domaine, début identité | – |
| **Q3 2026** | Finitions | V3-VISUEL, EDL délégué, BAIL-TYPES, IMPORT-CONCURRENTS, Drive 2H/F/G | Beta privée 30–50 utilisateurs, CGU/CGV | – |
| **Q4 2026** | **🚀 Lancement V1** | Recette + hotfix + V3-REFONTE finitions | **Public 14 oct**, ads, content, 150 clients | **1 600 €** |
| **Q1 2027** | Consolidation | ARCHI-DB-DOUBLONS, SAAS-MULTIUSERS phase 1, LEGAL-2072 | Salon FNAIM/IDIS, GLI partenariats | 3 100 € |
| **Q2 2027** | V2 multi-users | SAAS-MULTIUSERS phases 2–3, PORTAIL-LOC phase 1 | Recrutement freelance dev | 5 000 € |
| **Q3 2027** | Module agence pilote | AGENCE-GESTION + CRG + HONORAIRES + API + eIDAS | Démarchage 50 agences, salon RENT | 6 600 € |
| **Q4 2027** | Optimisation | App mobile (Capacitor), MRH-AUTO-LOC, MVT-RECURRENT | **BREAK-EVEN cumulé**, customer success freelance | 8 300 € |

### Vue 36 mois (jusqu'à Q4 2029)

| Période | Phase | Cap commercial (médian) |
|---|---|---|
| 2028 | Maturité produit + extension EU | 1 800 clients fin 2028 · MRR 23 000 € · ARR 277 K€ |
| 2029 | Scale + décision sortie | 3 200 clients fin 2029 · MRR 45 000 € · ARR 540 K€ · EBITDA 144 K€ |

---

## 9. Effort de déploiement & ressources

> Détail complet dans [EFFORT_DEPLOIEMENT.md](EFFORT_DEPLOIEMENT.md). Synthèse ici.

### 9.1 — Récap effort 18 mois

| Poste | Effort (j-h Didier) | Cash-out (€ HT) |
|---|---|---|
| Pré-V1 technique (manques bloquants + standards) | 52 j-h | 1 500 € (avocat EDL) |
| V2 multi-users + portail loc (6 mois) | 30 j-h | 6 200 € (freelance dev + avocat) |
| Module agence pilote V2 (3 mois) | 20 j-h | 6 000 € (freelance dev) |
| Infrastructure + DevOps | 5 j-h | 1 200 € an 1 |
| Support client | 8 init + 4/mois | 720 €/an |
| Légal & RGPD | 3 j-h | 3 000 € |
| Marketing & lancement an 1 | 19 j-h | 8 500 € |
| Comptabilité / facturation | 3 j-h | 1 860 €/an |
| **Total 18 mois** | **~140 j-h dev + ~50 j-h hors** | **~30 000 € cash-out** |

### 9.2 — Capacité Didier

- Capacité réelle : 15–18 j-h/mois (avec maintenance + commercial + support en parallèle)
- 18 mois × 15 j-h/mois = 270 j-h théorique → 140 dev + 50 hors-dev = **190 j-h utilisés** = **70 % de capacité** → **réaliste sans recrutement permanent**
- Recommandation : **freelance dev junior dès Q2 2027** pour libérer Didier sur backend V2 + démarchage

### 9.3 — Recrutements échelonnés

| Profil | Quand | Coût annuel | Justification |
|---|---|---|---|
| Rédacteur SEO immobilier (freelance) | Sept 2026 | 4 800 € (1 jour/sem) | content engine post-launch |
| Designer UI/UX freelance (sprints) | Q3 2026 + Q1 2027 | 3 000–6 000 € sprint | identité + V3-VISUEL renfort + portail loc V2 |
| Dev junior front (freelance / alternant) | Q2 2027 | 24 K€/an alternant ou 60 K€/an freelance pleins | libère Didier vers backend V2 + agence |
| Customer success (freelance puis CDI) | Q4 2027 puis Q3 2028 | 4 800 € puis 32 K€/an CDI | indispensable > 300 clients payants |

### 9.4 — Cash-out total cumulé

| Période | Cash-out cumul | Cash cumul (avec revenus médian) |
|---|---|---|
| Q4 2026 (lancement) | 11 500 € | –11 100 € |
| Q4 2027 (break-even) | 30 000 € | +5 100 € |
| Q4 2028 | 75 000 € | +166 000 € |
| Q4 2029 | 180 000 € | +540 000 € |

→ Cash maximum à investir avant break-even = **~30 K€** sur 18 mois → **bootstrappable** sans levée.
Levée pre-seed (200–300 K€) recommandée seulement si scénario haut confirmé Q1 2027.

---

## 10. Décisions à valider

Le dossier est conçu pour permettre à Didier de prendre les décisions ci-dessous en autonomie. Chaque case à cocher peut être amendée avant lancement V1.

### 10.1 — Décisions de fond (impact projet)

- [ ] **Pricing final** : confirmer 9,90 € / 19,90 € (recommandé) — alternative 7,90 € / 14,90 € pour pénétration plus rapide ?
- [ ] **Freemium** : 1 bien gratuit illimité (recommandé) OU essai 14 jours seulement ?
- [ ] **Modèle économique** : SaaS pur (A) OU SaaS + freemium + EDL pay-per-use (A+B+D recommandé) ?
- [ ] **Cible V1** : B2C particuliers + SCI familiales (recommandé) OU intégrer agences pilotes dès V1 (risque de dispersion) ?
- [ ] **Géographie V1** : France seule (recommandé) OU ouverture FR+BE (Smovin) dès V1 ?
- [ ] **Drive sync conservé V1** : oui (recommandé pour différenciant RGPD) OU retirer pour simplifier ?
- [ ] **Levée pre-seed** : à activer Q1 2027 si scénario haut confirmé (option) OU bootstrap pur scénario médian (recommandé) ?

### 10.2 — Décisions opérationnelles (impact calendrier)

- [ ] **Statut juridique** : AE pour V1 (plafond 36,8 K€ BNC) puis bascule SASU OU SASU dès création ?
- [ ] **Stripe vs Paddle** : Paddle MoR recommandé V1 (gestion TVA EU automatique)
- [ ] **Sous-traitance SEO** : recruter rédacteur freelance dès septembre 2026 (recommandé) OU faire soi-même ?
- [ ] **Domaine** : immotrack.fr OU immotrack.app OU autre — décision avant 30 mai 2026
- [ ] **Date lancement V1** : 14 octobre 2026 (mardi de Toussaint = trafic max) OU autre ?
- [ ] **Salon FNAIM / IDIS / RENT** : présence Q1 2027 (1 500 €) recommandée OU à reporter ?

### 10.3 — Décisions SAV / commercialisation

- [ ] **Support téléphonique** : pas avant 200+ clients payants (recommandé)
- [ ] **SLA réponse** : 24 h ouvrées chat/email V1 (recommandé)
- [ ] **Programme early bird** : 50 % off 1re année 100 premiers clients (recommandé) OU programme alternatif ?
- [ ] **Plan agence V2** : 49,90 €/mois/user OU pricing custom par cabinet ?

### 10.4 — Décisions stratégiques long terme

- [ ] **Sortie 2029** : viser revente Septeo/Manda (2,7 M€ médian) OU continuer scale series A (1 Md€ visé Septeo en 2030 = comparable bench) ?
- [ ] **Open source partiel** : garder propriétaire (recommandé) OU OSS avec offre managée (modèle Plausible) pour différenciation ?

---

## Annexes

### A. Validation des hypothèses (où le risque est-il ?)

| Hypothèse | Niveau de confiance | Source de validation |
|---|---|---|
| Marché 6,8 M logements privés FR | **Haute** | INSEE Focus 359 |
| Croissance marché SW gestion locative 8,6 % CAGR | Moyenne | Verified Market Reports (mondial, pas FR pur) |
| Conversion freemium 15 % | **Moyenne** | benchmark SaaS niche pro 5–25 % |
| Churn 5 %/mois | Moyenne–Haute | bench B2C SaaS immo 3–8 % |
| Acquisition 100/mois en cruise | **Faible** | dépend qualité content + ads, à calibrer 3 mois post-launch |
| Pricing 9,90 € viable | Haute | aligné BailFacile en production |
| 12 ⭐ différenciants défensibles 18 mois | **Moyenne** | si Septeo lance B2C, durée à raccourcir |

### B. Ce qui n'est pas dans ce dossier

Ce dossier ne couvre **pas** :
- Le détail des templates juridiques (CGU, CGV, DPA) — à produire avec avocat T3 2026
- Le détail technique du backend V2 — à produire en CDC séparé Q1 2027
- Le détail UX/UI de la landing page — à produire avec designer Q3 2026
- Le pricing du module agence V2 — à finaliser après pilote Q3 2027

### C. Sources & bibliographie

#### Marché
- INSEE Parc logements 2024 : [insee.fr/8251576](https://www.insee.fr/fr/statistiques/8251576)
- INSEE Parc logements 2025 : [insee.fr/8640662](https://www.insee.fr/fr/statistiques/8640662)
- INSEE Propriétaires-Locataires : [insee.fr/2569374](https://www.insee.fr/fr/statistiques/2569374), [insee.fr/4277733](https://www.insee.fr/fr/statistiques/4277733)
- INSEE 24 % ménages détiennent 68 % logements : [insee.fr/5432517](https://www.insee.fr/fr/statistiques/5432517)
- Rental Property Mgmt SW Market mondial : [verifiedmarketreports.com](https://www.verifiedmarketreports.com/product/rental-property-management-software-market/)
- Marché SaaS France : [tool-advisor.fr](https://tool-advisor.fr/blog/chiffres-logiciels-saas/), [businesscoot.com](https://www.businesscoot.com/fr/etude/le-marche-du-software-as-a-service-france)

#### Concurrents B2C
- Rentila : [rentila.com](https://www.rentila.com/), [bailpdf.com/rentila](https://bailpdf.com/gestion-locative/rentila), [lafabriquedunet.fr](https://www.lafabriquedunet.fr/logiciel/rentila)
- BailFacile : [bailfacile.fr](https://www.bailfacile.fr/), [pappers.fr/bailfacile](https://www.pappers.fr/entreprise/bailfacile-827909078)
- Smovin : [smovin.app](https://www.smovin.app/), [capterra.com/smovin](https://www.capterra.com/p/177288/Smovin/)
- Qalimo : [qalimo.fr](https://www.qalimo.fr/), [appvizer.fr/qalimo](https://www.appvizer.fr/operations/gestion-locative/qalimo)
- Smartloc : [smartloc.fr](https://www.smartloc.fr/), [investis.fr/smartloc](https://www.investis.fr/smartloc)
- Gererseul : [gererseul.com](https://www.gererseul.com/), [investissement-locatif-avis.fr/gererseul](https://investissement-locatif-avis.fr/gererseul-avis-2/)
- ImmobilierLoyer : [immobilierloyer.com](https://www.immobilierloyer.com/)

#### Concurrents B2B
- Septeo : [septeo-adb.fr](https://www.septeo-adb.fr/), [lejournaldesentreprises.com/septeo](https://www.lejournaldesentreprises.com/breve/le-groupe-septeo-prevoit-de-recruter-350-personnes-en-2025-2116198), [mysweetimmo.com/septeo-inch](https://www.mysweetimmo.com/2025/10/28/immobilier-septeo-muscle-son-offre-adb-avec-le-rachat-dinch/)
- LOCKimmo : [lockimmo.com](https://www.lockimmo.com/), [appvizer.fr/lockimmo](https://www.appvizer.fr/construction/agence-immobiliere/lockimmo)
- Powimo : [seiitra.com/powimo](https://www.seiitra.com/solutions/logiciel-syndic/)
- Hektor : [la-boite-immo.com](https://www.la-boite-immo.com/)
- VILOGI : [vilogi.com](https://www.vilogi.com/)
- Manda : [manda.fr](https://www.manda.fr/), [maddyness.com/manda-rachats](https://www.maddyness.com/2024/10/28/la-proptech-manda-continue-de-grandir-et-annonce-de-nouveaux-rachats/)
- Imodirect : [imodirect.com/tarif](https://www.imodirect.com/tarif)
- Étude USH 2022 syndic : [union-habitat.org](https://www.union-habitat.org/sites/default/files/articles/pdf/2022-04/ush-etude_logiciels_copropriete.pdf)

#### Internes
- `ImmoTrack_Comparatif_Concurrents_2026.xlsx` (149 critères, 9 outils, scorecard pondérée)
- `BACKLOG.md` (état du produit avril 2026)
- `docs/subjects/BIZPLAN-STRATEGIE.md` (cadrage du sujet)
- Mémoire `project_commercialization.md`

---

**Fin du dossier BIZPLAN.**
Le dossier complet (5 livrables) totalise environ 2 500 lignes markdown soit ~25 pages imprimées en monospace 10 pt. Suffisant pour un dossier décisionnel autonome.
