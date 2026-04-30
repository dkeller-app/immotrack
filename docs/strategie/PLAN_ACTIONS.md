# Plan d'actions ImmoTrack — roadmap trimestrielle Q2 2026 → Q4 2027

> Livrable 4/5 du dossier BIZPLAN-STRATEGIE.
> Articule les 5 livrables stratégiques avec le BACKLOG.md opérationnel.
> Hypothèse capacité Didier : 15–18 j-h/mois, jusqu'à 12 j-h/mois en mode dev focus pendant la phase de lancement Q4 2026.

---

## 0. Vue d'ensemble (1 page)

```
                   2026                          │              2027              │  2028+
┌─────────────────┬─────────────────┬───────────┼───────────────────────────────┼─────────
│   Q2 (T2 26)    │   Q3 (T3 26)    │  Q4 (T4)  │  Q1   │  Q2   │  Q3   │  Q4   │  
│ AVR  MAI  JUN   │ JUL  AOU  SEP   │ OCT  DEC  │ Jan-Mar│Avr-Jun│Jul-Sep│Oct-Dec│
├─────────────────┼─────────────────┼───────────┼────────┼───────┼───────┼───────┼─────────
│ AUDIT GLOBAL    │ V3-VISUEL       │ LANCEMENT │ Multi- │Portail│Module │Optim  │ V3
│ SECU innerHTML  │ V3-REFONTE x4   │  PUBLIC   │ users  │ loca- │ agence│ + API │ + EU
│ LEGAL-2044      │ EDL DELEGUE     │   V1      │  V2    │ taire │ pilote│ public│
│ DRIVE 2H/F/G    │ IMPORT CONCU    │           │   ↓    │  V2   │  V2   │       │
│ BAIL TYPES      │ Beta 30-50      │ 150 cli.  │ 350cli │700 cli│1k cli │1.4k   │ 3k+
│                 │                 │ MRR 1.6k€ │ MRR 4k │MRR 8k │MRR12k │MRR 17k│ MRR
└─────────────────┴─────────────────┴───────────┴────────┴───────┴───────┴───────┴─────────
   FONDATION         FINITIONS         LANCT      V2         V2 SUITE       SCALE
```

---

## Q2 2026 — Avril → Juin 2026 — **FONDATION (audit + sécu + fiscal)**

### Objectifs trimestre
- Lever les 3 dettes critiques bloquant la commercialisation : audit global, sécurité XSS, conformité fiscale
- Finir le sujet stratégique BIZPLAN (livré ce trimestre)
- Clore la phase 3d Bail (✅ déjà livré v13.05–13.29) et la phase IRL refonte (✅ déjà livré v13.30–13.33)

### Livrables produit
| Code BACKLOG | Sujet | Effort j-h | Mois cible |
|---|---|---|---|
| BIZPLAN-STRATEGIE | Étude marché + business plan (ce dossier) | 2 j-h | Avril ✅ |
| AUDIT-GLOBAL | Audit sécu/perf/code via Explore + skills review | 1,5 j-h | Mai |
| SECU-INNERHTML | Wrapper ~107 sites innerHTML non échappés | 2,5 j-h | Mai |
| BUG-CHARGE-001 | Régularisation des charges KO | 1 j-h | Mai |
| BUG-DASH-001 | Dashboard baux en vigueur | 1 j-h | Mai |
| LEGAL-2044 | Aide déclaration 2044 (CDC + mapping + render PDF) | 3,5 j-h | Juin |
| LEGAL-BILAN-ANNUEL | Bilan annuel par entité PDF | 1 j-h | Juin |
| EDL-VALIDATION-AVOCAT | Validation template EDL avocat | 0,2 j-h + 1 500 € | Juin |

**Total dev Q2** : ~13 j-h sur 3 mois (ratio 4,3 j-h/mois — laisse marge pour bug fixes hors plan)

### Jalons commerciaux Q2
- ✅ Domaine immotrack.fr / .app acheté avant le 30 avril (à arbitrer)
- 🟡 Création société (AE → SASU à valider) en mai
- 🟡 Premier contact avocat pour CGU/CGV/DPA en juin

### Cash-out Q2
- 18 € domaine + 30 € OVH email = 50 €
- Avocat EDL : 1 500 €
- Pennylane init : 30 €
- **Total Q2 : ~1 600 €**

### Risques et mitigation
- **Audit révèle des XSS critiques imprévues** → buffer 2 j-h prévu, sinon décaler livrables Q3 (V3-VISUEL ↓ 1 j-h)
- **CDC LEGAL-2044 prend plus de temps que prévu** (mapping fiscal complexe) → réduire scope V1 à mode "préparation" (afficher les valeurs prêtes à recopier dans 2044), plein mapping en V1.1

### Sortie Q2 — État du produit attendu
- 100 % conformité XSS et sécu de base
- Aide 2044 disponible (utilisable par Didier sur sa propre déclaration mai 2026 = bêta interne)
- Audit publié dans `docs/audit/` permettant aux investisseurs/utilisateurs de voir la rigueur

---

## Q3 2026 — Juillet → Septembre 2026 — **FINITIONS PRODUIT + BETA**

### Objectifs trimestre
- Compléter les 3 standards marché manquants (email, avis, rappel) + onboarding (import Excel + import concurrents) + différenciants exclusifs (EDL délégué)
- Livrer V3-VISUEL et 4 refontes fonctionnelles d'onglets
- **Lancer beta privée 30–50 utilisateurs** (août–septembre)
- Préparer le go-to-market V1

### Livrables produit
| Code BACKLOG | Sujet | Effort j-h | Mois cible |
|---|---|---|---|
| QUIT-EMAIL | Envoi email quittances | 1 j-h | Juillet |
| AVIS-ECHEANCE | Avis d'échéance | 0,5 j-h | Juillet |
| RAPPEL-IMPAYE | Rappel auto impayé | 1 j-h | Juillet |
| IMPORT-EXCEL-LOG | Import Excel template | 1 j-h | Juillet |
| IMPORT-CONCURRENTS | Mappers Rentila/BailFacile/Qalimo | 3 j-h | Juillet |
| BAIL-TYPES | 5 types bail (5 phases A–E) | 4 j-h | Juillet–Août |
| BAIL-CLAUSES-PERSO | Clauses particulières par entité | 0,5 j-h | Août |
| EDL-DELEGUE-EXPORT | Export HTML offline ⭐ | 3 j-h | Août |
| EDL-DELEGUE-IMPORT | Import JSON statut "à valider" ⭐ | 1 j-h | Août |
| DRIVE-2H | Re-archi fichiers Drive | 1,5 j-h | Août |
| DRIVE-2F | OCC file level | 1,5 j-h | Août |
| DRIVE-2G | Awareness UI | 0,5 j-h | Août |
| V3-VISUEL | Design system v2 toutes pages | 6 j-h | Août–Sept |
| V3-REFONTE-LOYERS | Refonte Loyers/Mouvements | 1 j-h | Sept |
| V3-REFONTE-QUIT | Refonte Quittances | 1 j-h | Sept |
| V3-REFONTE-REGUL | Refonte Régularisation | 1,5 j-h | Sept |
| V3-REFONTE-IRL | Refonte IRL | 1 j-h | Sept |

**Total dev Q3** : ~28 j-h sur 3 mois (ratio 9,3 j-h/mois — gros mois, focus dev)

### Jalons commerciaux Q3
- 🟡 **Recrutement 30 beta-testeurs** via :
  - LinkedIn perso (15)
  - r/vosfinances + r/ImmobilierFR (10)
  - Forum Gererseul / Dossier Familial (5)
- 🟡 **Outils de support** : Crisp Chat installé, FAQ initiale 20 articles, formulaire feedback
- 🟡 **Setup CGU/CGV/Privacy** finalisés avant beta (avocat livre fin juillet)
- 🟡 **Première identité visuelle** : brief designer Malt mi-juillet, livraison fin août
- 🟡 **Setup Stripe ou Paddle** + sandbox test
- 🟡 **Site vitrine landing v0** publié en septembre

### Cash-out Q3
- Avocat CGU/CGV/DPA : ~3 000 €
- Identité visuelle (logo + charte) : 1 500 €
- Pennylane (3 mois) : 90 €
- Crisp Pro (sept seul) : 25 €
- Sentry / Plausible : 30 €
- **Total Q3 : ~4 700 €**

### Risques et mitigation
- **V3-VISUEL dérape (UI plus complexe que prévu)** → couper V3-REFONTE-PARAMS et V3-REFONTE-EQUIP (les pousser Q4 ou V1.1)
- **Beta-testeurs introuvables** → attaquer plus tôt LinkedIn (juin) avec teasing
- **Avocat lent** → relancer dès le 15 juin pour livrer CGU avant le 31 juillet

### Sortie Q3 — État du produit attendu
- ImmoTrack V1 RC1 prêt à passer beta-test
- 30–50 beta-testeurs onboardés
- Backlog beta = ~50 issues à traiter

---

## Q4 2026 — Octobre → Décembre 2026 — **LANCEMENT PUBLIC V1**

### Objectifs trimestre
- **Lancer publiquement la V1** mi-octobre 2026
- Atteindre 150 clients payants à fin décembre (cf scénario médian PROJECTIONS.md)
- Mettre en place le moteur d'acquisition (SEO + paid ads + LinkedIn)

### Livrables produit
| Code BACKLOG | Sujet | Effort j-h | Mois cible |
|---|---|---|---|
| V3-REFONTE-PARAMS | Refonte Paramètres | 1 j-h | Oct |
| V3-REFONTE-EQUIP | Refonte Équipements | 1 j-h | Oct |
| BUG-UI-DARK-MODAL | Modale dark mode | 0,2 j-h | Oct |
| Recette finale V1 + corrections beta | – | 5 j-h | Oct |
| Hotfix post-launch | – | 4 j-h | Nov–Déc |
| Onboarding wizard / first-run UX polish | – | 2 j-h | Nov |

**Total dev Q4** : ~13 j-h sur 3 mois — bas, car focus commercial

### Jalons commerciaux Q4
- 🚀 **Lancement public 14 octobre 2026** (mardi de Toussaint = trafic max)
- 📣 **Annonce Product Hunt + Indie Hackers + LinkedIn perso** (jour J)
- 📣 **Article presse Maddyness, Immo2.pro, Immomatin, FrenchWeb** (jour J + 2)
- 📺 **10 tutos vidéo onboarding YouTube** (livrés avant lancement)
- 📝 **30 articles SEO publiés** (sept + oct dont 5 comparatifs)
- 💸 **Paid ads activés** : Meta + Google Ads, 600 €/mois
- 🤝 **Partenariats lancement** : 2–3 articles invités sur sites investissement-locatif (BailPDF, Rentilot, Investis)
- 🎁 **Early bird offer** : 50 % off première année pour les 100 premiers clients (Investisseur 49 €/an au lieu de 99 €/an)

### Cash-out Q4
- Marketing ads (3 mois × 600 €) : 1 800 €
- Rédacteur SEO (3 mois × 400 €) : 1 200 €
- Outils support (3 mois × 60 €) : 180 €
- Loom + outils production vidéo : 50 €
- Pennylane (3 mois) : 90 €
- Comptable bilan an 1 partial : 800 €
- **Total Q4 : ~4 100 €**

### Jalons clés à suivre (KPI hebdomadaire)
| Métrique | Cible mi-T4 | Cible fin T4 |
|---|---|---|
| Visiteurs uniques mensuels | 5 000 | 12 000 |
| Inscriptions freemium | 200 | 700 |
| Clients payants nets | 60 | **150** |
| MRR | 700 € | **1 600 €** |
| Churn mensuel | < 6 % | < 5 % |
| NPS | – | > 40 |
| Tickets support / utilisateur | – | < 0,1 / mois |

### Risques et mitigation
- **Bug critique post-launch** (régression sur fix bug ou XSS découvert tardivement) → buffer 4 j-h hotfix, équipe avocat sur standby pour communication crisis
- **Acquisition trop lente** (< 50 clients à mi-novembre) → activer plan B : doubler ads à 1 200 €/mois, démarchage personnalisé via LinkedIn + emails personnalisés
- **Plafond AE atteint** (CA mensuel > 3 000 €) → amorcer bascule SASU dès novembre

### Sortie Q4 — État attendu
- V1 publique stable en production
- 150 clients payants, MRR 1 600 €, ARR 19 K€
- Cashout cumul : ~14 500 € (sous budget plan ~15 K€)
- Décision-clé pré-V2 : confirmer ou amender le scénario (bas/médian/haut) avec données réelles

---

## Q1 2027 — Janvier → Mars 2027 — **CONSOLIDATION + V2 PRÉPARATION**

### Objectifs trimestre
- Atteindre 280 clients payants (médian) → MRR 3 100 €
- **Lancer le chantier V2 multi-users** (bloquer cible SCI familiale + petit gestionnaire)
- Consolider qualité produit (V3-REFONTE retardée + retour beta utilisateurs réels)

### Livrables produit
| Code BACKLOG | Sujet | Effort | Notes |
|---|---|---|---|
| ARCHI-DB-DOUBLONS | Refonte architecture DB (CDC + migration) | 8 j-h | pré-requis multi-users |
| SAAS-MULTIUSERS Phase 1 | Backend de base + auth + sync | 6 j-h | début |
| Hotfix utilisateurs réels (priorité) | – | 4 j-h | feedback beta + V1 |
| BAIL-NAMESPACE-MIGRATION | Retirer alias globaux | 3 j-h | pré-V2 propre |
| LEGAL-2072 SCI IR | Liasse 2072 SCI IR (différenciant) | 3 j-h | bonus, à arbitrer Q1/Q2 |

**Total dev Q1 2027** : ~24 j-h (8 j-h/mois — très ambitieux, peut nécessiter freelance)

### Jalons commerciaux Q1
- 🤝 **Partenariat GLI activé** (Insured ou autre) → revenus complémentaires + valeur produit
- 📈 **Premier audit SEO** (3 mois post-launch) → réajuster content
- 🎯 **Webinar mensuel "Optimiser sa déclaration 2044 avec ImmoTrack"** (saisonnier déclaration mai)
- 🎤 **Présence salon FNAIM ou IDIS** mars 2027 (~1 500 € budget)

### Cash-out Q1 2027
- Marketing courant (3 mois × 1 000 €) : 3 000 €
- Salon FNAIM/IDIS : 1 500 €
- Compta + outils : 750 €
- Avocat ponctuel multi-users (DPA mise à jour) : 800 €
- Backend hébergement (Render Pro 25 €) : 75 €
- **Total Q1 2027 : ~6 100 €**

### Décision-clé Q1
- **Levée pre-seed Q1 2027 ?** (option scénario haut)
  - Si MRR > 5 000 €/mois fin Q1 → courtiser angels proptech (Naxicap-like, BPI Innovation)
  - Si MRR < 3 000 €/mois → continuer bootstrap

---

## Q2 2027 — Avril → Juin 2027 — **V2 MULTI-USERS LIVRÉE**

### Objectifs trimestre
- Atteindre 440 clients payants → MRR 5 000 €
- **Livrer V2 multi-users** (cible SCI familiale + petit gestionnaire)
- Lancer le portail locataire (PORTAIL-LOC) en bêta

### Livrables produit
| Code | Sujet | Effort |
|---|---|---|
| SAAS-MULTIUSERS Phase 2 | Rôles + permissions + UI | 6 j-h |
| SAAS-MULTIUSERS Phase 3 | Migration base existante (opt-in) | 4 j-h |
| PORTAIL-LOC Phase 1 | Accès lecture locataire (quittances, IRL) | 5 j-h |
| Maintenance V1 + hotfix | – | 4 j-h |

**Total Q2 2027** : ~19 j-h — recrutement freelance dev junior conseillé (cf scénario médian)

### Recrutement Q2 2027
- **Dev front freelance** (350 €/jour × 5 jours/mois = 5 250 €/trimestre)
- Justification : libère Didier pour backend SAAS-MULTIUSERS et démarchage

### Cash-out Q2 2027
- Marketing : 3 000 €
- Freelance dev : 5 250 €
- Avocat ponctuel (portail loc DPA, hébergement EU) : 1 200 €
- **Total Q2 2027 : ~10 000 €**

---

## Q3 2027 — Juillet → Septembre 2027 — **MODULE AGENCE PILOTE + API**

### Objectifs trimestre
- Atteindre 580 clients payants → MRR 6 600 €
- **Lancer module Agence pilote** (B2B, ciblage 10–20 cabinets pilotes)
- Lancer API publique pour intégrations externes (notaires, EC)

### Livrables produit
| Code | Sujet | Effort |
|---|---|---|
| AGENCE-GESTION | Mandants + contrats gestion | 5 j-h |
| AGENCE-CRG | Relevé gérance mensuel | 5 j-h |
| AGENCE-HONORAIRES | Honoraires paramétrables | 3 j-h |
| API publique read | endpoints REST + auth API key | 4 j-h |
| SIGN-EIDAS | Signature électronique eIDAS via prestataire | 3 j-h |

**Total Q3 2027** : ~20 j-h

### Jalons commerciaux Q3
- 🎯 **Démarchage 50 agences indépendantes** (LinkedIn + emails ciblés)
- 🎁 **Plan Agence Early Adopter** : 39 €/mois 6 premiers mois (vs 49,90 € normal)
- 🎤 **Présence salon RENT** (sept 2027) — orienté pro

### Cash-out Q3 2027
- Marketing élargi (B2B = LinkedIn ads + démarchage) : 4 500 €
- Salon RENT : 2 000 €
- Freelance dev (pour finir agence pilote) : 6 000 €
- **Total Q3 2027 : ~13 000 €**

---

## Q4 2027 — Octobre → Décembre 2027 — **OPTIMISATION + PUBLIC ÉLARGI**

### Objectifs trimestre
- Atteindre 700 clients payants → MRR 8 300 €, ARR 100 K€
- **BREAK-EVEN cumulé atteint** (cf PROJECTIONS médian)
- Industrialisation customer success (1 freelance support à 4 h/jour)

### Livrables produit
| Code | Sujet | Effort |
|---|---|---|
| Optimisations performance (DB grosse, mobile lent) | – | 4 j-h |
| App mobile native iOS/Android (Capacitor wrapping) | M | 6 j-h |
| MRH-AUTO-LOC, ENT-SAVE-IMM, MVT-RECURRENT (P2 fonctionnel) | – | 4 j-h |
| DOC-PJ + TRAV-SUIVI (PJ et travaux) | – | 5 j-h |

**Total Q4 2027** : ~19 j-h

### Jalons commerciaux Q4
- 🚀 **App mobile lancée** (différenciant face à Gererseul qui n'en a pas)
- 🎯 **1 000 clients atteints fin décembre** (+ que cible médian ?)
- 📊 **Bilan année 1 commerciale** : décision V3 EU expansion ou consolidation FR

### Cash-out Q4 2027
- Marketing : 4 500 €
- Freelance dev : 6 000 €
- Freelance customer success (4 h/jour × 60 € × 2 mois) : 4 800 €
- **Total Q4 2027 : ~15 300 €**

---

## 2028 — Année 2 commerciale (vue agrégée)

### Objectifs annuels
- Atteindre 1 800 clients fin 2028 (médian) → MRR 23 000 €, ARR 277 K€
- EBITDA positif ~38 % (66 K€)
- Recrutement permanent : 1 dev junior + 1 customer success (CDI)

### Grands chantiers
- **API publique mature + marketplace intégrations** (notaires, EC, GLI partenaires)
- **Expansion EU** (Belgique → Suisse → Luxembourg) si market fit FR validé → adaptation legal/fiscal mineure pays par pays
- **Module agence v2** : multi-mandants, multi-utilisateurs agence, CRG avancé
- **PORTAIL-LOC v2** : signature loc, paiement loyer en ligne (intégration partenaire)

### Recrutements
- **Dev junior CDI** (alternant ou junior 24–32 K€/an) Q1 2028
- **Customer success CDI** (28–35 K€/an) Q3 2028

---

## 2029 — Année 3 commerciale (vue agrégée)

### Objectifs annuels
- 3 200 clients fin 2029 (médian) → MRR 45 000 €, ARR 540 K€
- EBITDA 38 % = 144 K€
- Décision **vente / poursuite** :
  - Vente : valorisation 1,6–2,7 M€ médian, 5–8 M€ haut
  - Poursuite : levée series A 1–2 M€ pour scaler EU + dev mobile natif full

---

## Ressources nécessaires par trimestre

| Trimestre | Didier (j-h) | Freelance dev | Freelance support | Avocat | Designer | Total cash-out |
|---|---|---|---|---|---|---|
| Q2 2026 | 13 dev + 3 hors | – | – | 1 500 € EDL | – | 1 600 € |
| Q3 2026 | 28 dev + 4 hors | – | – | 3 000 € CGU/CGV | 1 500 € identité | 4 700 € |
| Q4 2026 | 13 dev + 10 hors | – | – | – | – | 4 100 € |
| Q1 2027 | 24 dev + 6 hors | – | – | 800 € | – | 6 100 € |
| Q2 2027 | 14 dev + 5 hors | 5 250 € | – | 1 200 € | – | 10 000 € |
| Q3 2027 | 12 dev + 8 hors | 6 000 € | – | – | – | 13 000 € |
| Q4 2027 | 12 dev + 7 hors | 6 000 € | 4 800 € | – | – | 15 300 € |
| **TOTAL 8 trimestres** | **~120 j-h dev + ~43 j-h hors** | **17 250 €** | **4 800 €** | **6 500 €** | **1 500 €** | **~54 800 €** |

---

## Décisions structurantes attendues — synthèse calendrier

| Décision | Échéance | Note |
|---|---|---|
| Confirmer pricing 9,90 € / 19,90 € | 30 mai 2026 | bloque landing + identité |
| Acheter domaine + créer société | 30 juin 2026 | – |
| Statut juridique AE → SASU bascule | mi-2026 ou seuil 25 K€ CA | – |
| Stripe vs Paddle | sept 2026 | Paddle recommandé V1 |
| Drive sync conservé V1 | – | Recommandé : oui (RGPD) |
| Engager rédacteur SEO sous-traité | sept 2026 | 400 €/mois |
| Lancement public V1 | 14 octobre 2026 | bloque tous les autres |
| Bilan post-V1 + scénario validé | mars 2027 | bas/médian/haut |
| Levée pre-seed | déclencher si scénario haut | Q1–Q2 2027 |
| Recrutement freelance dev | Q2 2027 | – |
| Lancement V2 multi-users | juin 2027 | – |
| Lancement module agence pilote | sept 2027 | – |
| Décision vente / scale | T4 2029 | – |

---

## Lien avec les 4 autres livrables

- **CARTE_POSITIONNEMENT.md** §8.2 : la roadmap concrétise le positionnement-cible "B2C complet + souverain + EDL délégué".
- **EFFORT_DEPLOIEMENT.md** §G.1 : le calendrier ici est aligné avec celui de l'effort technique mois par mois.
- **PROJECTIONS.md** §2 : les jalons MRR/ARR ici reflètent le scénario médian.
- **BIZPLAN.md** : ce plan d'actions est repris en synthèse §8.
