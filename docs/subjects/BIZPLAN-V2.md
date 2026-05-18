# BIZPLAN-V2 — Dossier commercial + plan d'attaque opérationnel

**Status** : 🔄 En cours (depuis 2026-05-01) · **Prio** : P2 · **Taille** : XL (12-15 h sur 2-3 sessions dédiées)
**Détecté** : 2026-05-01
**Lié à** : BIZPLAN-STRATEGIE ✅ (v1 livré 2026-04-30) · IMPORT-CONCURRENTS · SAAS-MULTIUSERS

## Contexte

La v1 du BIZPLAN (livrée 2026-04-30, 5 livrables markdown dans `docs/strategie/`) est un bon **dossier d'analyse** mais ne suffit pas pour :
- **Vendre le projet** à un partenaire commercial (CGP, EC, GLI, agences)
- **Savoir où attaquer en premier** sur la partie commerciale (calendrier exécutable)
- **Onboarder un freelance dev backend** (V1.5 multi-users + V2 backend EU)

→ La v2 produit le **dossier commercial + plan d'attaque opérationnel + matériaux ready-to-delegate**.

## 4 décisions architecturales figées (validées 2026-05-01)

### 1. App mobile = Capacitor V1.1 (décembre 2026)
- Wrapper Capacitor : 1 codebase HTML+JS → builds iOS + Android
- Distribution App Store + Play Store (visibilité prospects)
- Effort : 6-8 j-h Didier · 500 € comptes stores (Apple 99 $/an + Google 25 $)
- PAS de natif Swift+Kotlin (sur-ingénierie pour V1)

### 2. PC = PWA installable (pas Electron)
- L'utilisateur installe ImmoTrack via "Ajouter à l'écran d'accueil" Chrome/Edge
- Compatible PC, Mac, Linux, iPad, Chromebook (pas de build Electron)
- Argument commercial : "Compatible TOUS appareils sans installation lourde"

### 3. Stockage = stratégie 3 niveaux de souveraineté
| Niveau | V1 (oct 2026) | V1.5 (déc 2026) | V2 (Q1 2027) |
|---|---|---|---|
| 🆓 **Local-first** : IndexedDB + export JSON | ✅ | – | – |
| 💼 **Sync souverain** : Drive perso | ✅ | + WebDAV (Infomaniak FR, Nextcloud) | – |
| 🏛️ **Cloud ImmoTrack EU** : backend Postgres EU + multi-users | – | – | ✅ (cible CGP/SCI multi) |

### 4. Facturation = forfait + soft-block client (pas de comptage backend V1)
- Plans : 0 € (1 lot freemium) / 9,90 € (2-10 lots) / 19,90 € (11-30 lots) / Cloud EU 14,90-24,90 €
- Soft-block popup à l'ajout du logement N+1 du plan : "veuillez upgrader"
- Confiance présumée (3-5 % fraude max observée chez Rentila/BailFacile/Smartloc)
- Si fraude > 10 % post-launch : bascule vers micro-backend "beacon" (1 j-h dev) en V1.5

## 3 décisions de scope v2 (validées 2026-05-01)

### A. Cible deck = partenaires/CGP/vendeurs (pas investisseurs)
- **CGP** = priorité 1 (effet levier × 50-200 par signature)
  - ~6 500 CGP indépendants FR (ANACOFI 2024) + 10 000 si on inclut bancaires
  - Modèle commission : 30 % première année (≈ 36 €/an Investisseur, 60 €/an SCI) + cobranding
- **Vendeurs/agents commerciaux indé** = priorité 2
- **EC + notaires + GLI** = priorité 3
- **Investisseurs** = exclu de la cible v2 (pre-seed Q1 2027 = option, pas obligatoire)

### B. 2 pitches distincts (validé)
- **`PITCH_COMMERCIAL.pptx`** : démarchage CGP/EC/partenaires (12-15 slides : problème → solution → ROI partenariat → timeline → CTA)
- **`PRESENTATION_INTERNE.pptx`** : roadmap visuelle + état produit + timeline + équipe (15-20 slides) — pour Didier + futurs collaborateurs

### C. CDC technique = backend V1.5 multi-users + V2 backend EU (validé)
- Pas le freelance front (Didier le fait seul)
- Le freelance backend = celui qui débloque la cible CGP/SCI multi → priorité 1
- Spec : architecture multi-users, stack, API REST, sync, auth, schemas DB Postgres EU

## Livrables v2 (11 docs)

| # | Livrable | Format | Description |
|---|---|---|---|
| 1 | `PITCH_COMMERCIAL.pptx` | PowerPoint | Démarchage CGP/EC/partenaires (12-15 slides) |
| 2 | `PRESENTATION_INTERNE.pptx` | PowerPoint | Roadmap + timeline + état produit (15-20 slides) |
| 3 | `ONE_PAGER.pdf` | PDF A4 | Recto/verso dense pour 1er contact partenaire |
| 4 | `PLAN_COMMERCIAL_V2.md` + `.docx` | Markdown + Word | Channel CGP prioritaire (cibles + commission) · calendrier 30 articles SEO (titres + mots-clés + volume) · plan LinkedIn 12 sem · plan PR + scripts presse · beta-testeurs SCI/pro · Product Hunt J-30→J+30 · referral · A/B pricing |
| 5 | `MODELE_FINANCIER.xlsx` | Excel | Dynamique scénario-able (curseurs ARPU/churn/CAC/conv) avec recalcul auto bas/médian/haut |
| 6 | `CDC_TECHNIQUE.md` + `.docx` | Markdown + Word | Architecture V1.5 multi-users + V2 backend EU (stack, API, schemas, jalons) pour onboarder freelance dev |
| 7 | `BRIEFS_CREA.md` + `.docx` | Markdown + Word | Brief identité visuelle complet · brief landing 5 sections · brief onboarding wizard "first 5 min" · brief 30 articles SEO · brief 10 tutos vidéos |
| 8 | `SWOT_CONCURRENTS.md` | Markdown | Analyse SWOT × 8 concurrents (Rentila, BailFacile, Smartloc, Qalimo, Gererseul, ImmobilierLoyer, Smovin, Septeo/Crypto) |
| 9 | `TAM_SAM_SOM.md` | Markdown | Chiffrage marché rigoureux : Total Addressable / Serviceable Addressable / Serviceable Obtainable Market avec sources |
| 10 | `PLAN_ACTIONS_v2.md` | Markdown | Révision PLAN_ACTIONS v1 avec accélération + Capacitor V1.1 + WebDAV V1.5 + Cloud EU V2 + channel CGP intégré |
| 11 | `PROJECTIONS_v2.md` | Markdown | Révision PROJECTIONS v1 avec ARPU bonifié plan Cloud EU (14,90/24,90 €) + impact channel CGP sur acquisition |

→ **Tous livrés dans `docs/strategie/v2/`**.
→ **Conversion automatique markdown → docx pour ouverture Word** (déjà testée v1).
→ **Beta-testeurs SCI/pro** : plan d'acquisition from scratch (5 canaux + scripts) + Didier active ses contacts perso en parallèle.

## Effort estimé

12-15 h sur **2-3 sessions dédiées** :
- **Session 1** (5-6 h) : recherches web complémentaires (CGP marché, levées concurrents v2, partenariats benchmarks) + production livrables 1+2+3 (pitches + one-pager) + 8+9 (SWOT + TAM/SAM/SOM)
- **Session 2** (5-6 h) : production livrables 4+10+11 (plan commercial v2 + révisions plan actions + projections) + livrable 5 (modèle financier Excel dynamique)
- **Session 3** (3-4 h) : production livrables 6+7 (CDC technique + briefs créa) + relecture cohérence + commit final

## Prompt de démarrage de session (à coller dans une nouvelle session Claude Code)

```
Session dédiée : production v2 du dossier BIZPLAN ImmoTrack — pitch commercial + plan d'attaque opérationnel.

Contexte préalable validé :
- v1 livré 2026-04-30 (5 docs markdown dans docs/strategie/) — bon début mais pas suffisant pour vendre/exécuter
- 4 décisions architecturales figées :
  1. App mobile = Capacitor V1.1 décembre 2026 (pas natif)
  2. PC = PWA installable (pas Electron)
  3. Stockage = 3 niveaux souveraineté : Local-first → Drive/WebDAV → Cloud EU multi-users
  4. Facturation = forfait + soft-block client (pas comptage backend V1)
- Cible v2 = partenaires CGP (priorité 1) / vendeurs (priorité 2) / EC notaires GLI (priorité 3) — PAS investisseurs
- 2 pitches distincts (commercial CGP + présentation interne)
- CDC technique = freelance backend V1.5 multi-users + V2 backend EU (pas freelance front)
- Beta-testeurs SCI/pro = plan acquisition from scratch + Didier ajoute ses contacts en cours de session

À lire AVANT toute production (dans cet ordre) :
1. docs/subjects/BIZPLAN-V2.md (ce fichier — scope complet figé)
2. docs/strategie/BIZPLAN.md (v1 — synthèse à enrichir)
3. docs/strategie/CARTE_POSITIONNEMENT.md (v1 — concurrence + 12 ⭐)
4. docs/strategie/PROJECTIONS.md + PLAN_ACTIONS.md + EFFORT_DEPLOIEMENT.md (v1 — bases à réviser)
5. ImmoTrack_Comparatif_Concurrents_2026.xlsx (skill xlsx)
6. BACKLOG.md (état produit avril 2026)

Périmètre = 11 livrables (cf docs/subjects/BIZPLAN-V2.md §Livrables) :
1. PITCH_COMMERCIAL.pptx (skill pptx)
2. PRESENTATION_INTERNE.pptx (skill pptx)
3. ONE_PAGER.pdf (skill canvas-design ou pdf)
4. PLAN_COMMERCIAL_V2.md + .docx (channel CGP + 30 articles SEO + LinkedIn + PR + beta-testeurs + PH + referral + A/B pricing)
5. MODELE_FINANCIER.xlsx (skill xlsx — curseurs scénarios)
6. CDC_TECHNIQUE.md + .docx (backend V1.5 + V2 EU)
7. BRIEFS_CREA.md + .docx (identité + landing + onboarding + 30 SEO + 10 tutos)
8. SWOT_CONCURRENTS.md (× 9 concurrents — Rentila, BailFacile, Smartloc, Qalimo, Gererseul, ImmobilierLoyer, Smovin, Septeo/Crypto, **+ LocataireCloud (audit 2026-05-18)**)
9. TAM_SAM_SOM.md (chiffrage rigoureux)
10. PLAN_ACTIONS_v2.md (révision avec accélération + Capacitor + WebDAV + CGP)
11. PROJECTIONS_v2.md (révision avec ARPU bonifié Cloud EU + impact CGP)

Tous dans docs/strategie/v2/.

Méthodologie (non négociable) :
- Rigueur factuelle : citer toutes sources (URL, INSEE, communiqués). "Estimation" + base d'estimation si pas source fiable.
- Pas de bullshit corporate (éviter "synergie", "écosystème", "innovation disruptive"). Concret, chiffré.
- Confronter hypothèses : pour chaque reco, 2-3 alternatives écartées + POURQUOI.
- Effort réaliste : Didier solo + freelance backend dès sept 2026 = capacité ~10-12 j-h/mois utiles dev.
- Outils web : WebFetch/WebSearch pour pricing concurrents, marché CGP ANACOFI, partenariats benchmarks. NE PAS INVENTER.
- Skills : pptx pour decks, xlsx pour modèle financier dynamique, docx pour conversions, canvas-design pour one-pager.
- Sortie en français.

Workflow suggéré (3 sessions) :
- Session 1 (5-6 h) : recherches web (CGP marché, levées concu v2, benchmarks partenariats) + livrables 1+2+3+8+9
- Session 2 (5-6 h) : livrables 4+5+10+11
- Session 3 (3-4 h) : livrables 6+7 + relecture cohérence + commit final + update BACKLOG (BIZPLAN-V2 → ✅ Livré)

En sortie de chaque session : commit `BIZPLAN-V2 : session N livree (X livrables)` + résumé final 5 bullets max + liens vers livrables.
```

## Concurrent #9 — LocataireCloud (locataire.live) — ajouté 2026-05-18

Audit complet : cf [docs/subjects/WATCH-LOCATAIRELIVE.md](WATCH-LOCATAIRELIVE.md).

**Identité** : SaaS français, sortie bêta avril 2026, fondateur solo (40+ lots gérés, 15 ans), pricing lifetime 347 € × 50 places + futur SaaS 9,90-49,90 €/mois, cible bailleurs + agences.

**Velocity inquiétante** : 26 features roadmap publique T2 2026 → T1 2027 (6 livrées + 3 en cours + 17 prévues). IA conversationnelle T2 2026, app mobile native T4 2026, mandats agence T3 2026 (= attaque cible CGP **2 trimestres avant** ImmoTrack V2 Q1-Q3 2027).

**Avantages ImmoTrack vs LocataireCloud** :
- Posture souveraine (Drive perso, vs cloud SaaS centralisé)
- Bail PDF natif + snapshot signé highlight diff
- EDL conforme décret 2016-382 + photos compteurs 7 colonnes
- EDL délégué offline export/import ⭐
- IRL DPE F/G blocking (loi Climat) déjà livré v13.30-33
- Pas de DSP2 = différenciant "souverain" (vs DSP2 chez eux)

**Manques ImmoTrack vs LocataireCloud** :
- Espace locataire (eux livré, nous V2)
- IA conversationnelle (eux T2 2026)
- Colocation native (eux livré, nous en cours BAIL-TYPES)
- Place de marché annonces (eux livré, nous pas prévu)
- 16 outils SEO gratuits (eux en place, nous rien)
- Multi-utilisateurs + mandats agence (eux T3 2026, nous V2 Q1-Q3 2027)

## 6 implications stratégiques (intégrées au scope v2)

### 1. Founder Edition lifetime (FOUNDER-EDITION P1 créé)
Bootstrap acquisition early adopters : 249 € × 100 places, vente juillet-oct 2026, +24 900 € cash up-front + 100 évangélistes. Cf [FOUNDER-EDITION.md](FOUNDER-EDITION.md).
**Impact PITCH_COMMERCIAL.pptx** : slide "Founder Edition" early access.

### 2. Outils SEO gratuits (OUTILS-SEO-GRATUITS P2 créé)
Page /outils avec 15 calculateurs dont 4 ⭐ différenciants (2044 preview / cession LMP-LMNP / loyer marché CLAMEUR / DPE plan rénov). 8-10 j-h Q3 2026 avant launch. Cf [OUTILS-SEO-GRATUITS.md](OUTILS-SEO-GRATUITS.md).
**Impact PLAN_COMMERCIAL_V2.md** : section "acquisition SEO" enrichie avec roadmap calculateurs.

### 3. Module IA souveraine V1.5 (IA-COPILOTE P2 créé)
4 modules : recherche sémantique Ctrl+K + copilote dashboard + catégorisation mouvements + suggestions clauses bail. Posture "100 % browser, 0 data envoyée à OpenAI". 9-15 j-h V1.5 Q1 2027. Cf [IA-COPILOTE.md](IA-COPILOTE.md).
**Impact PRESENTATION_INTERNE.pptx + PITCH_COMMERCIAL.pptx** : slide "IA souveraine" (différenciant vs LocataireCloud).

### 4. Monitoring permanent (WATCH-LOCATAIRELIVE P2 créé)
Cadence trimestrielle fetch /roadmap + diff + alerte si livraison majeure. Cf [WATCH-LOCATAIRELIVE.md](WATCH-LOCATAIRELIVE.md).
**Impact PLAN_ACTIONS_v2.md** : ajout slot trimestriel "veille concurrence".

### 5. Accélération PORTAIL-LOC (intégrer dans PLAN_ACTIONS_v2)
LocataireCloud a livré "Espace locataire complet" mars 2026. ImmoTrack a PORTAIL-LOC en V2 Q1 2027 → **basculer en V1.5 déc 2026** pour parité commerciale.
**Impact PLAN_ACTIONS_v2.md** : remonter PORTAIL-LOC de V2 → V1.5.

### 6. Colocation native (intégrer dans BAIL-TYPES)
LocataireCloud claim "aucun outil FR ne le fait à ce niveau" sur colocation. ImmoTrack BAIL-TYPES doit explicitement inclure le cas "bail commun colocation + quittances ventilées".
**Impact CDC_TECHNIQUE.md** : préciser spec colocation dans la phase BAIL-TYPES.

## Audit visuel comparatif — 2026-05-18 (LocataireCloud vs ImmoTrack v15.73)

Audit complet réalisé 2026-05-18 sur 19 captures (11 LocataireCloud desktop+mobile + 8 ImmoTrack v15.73 partagées par utilisateur). Sauvegarde captures : `docs/strategie/audit-visuel-locataire-live/`.

### Stack technique LocataireCloud identifié
Next.js 14+ App Router + Vercel + Tailwind + shadcn/ui + fonts Montserrat / Instrument Sans / Fraunces (serif display). Light mode forcé.

### Verdict produit applicatif

| Dimension | Verdict |
|---|---|
| Produit applicatif (Dashboard 3 profils / Wizard Bail paraphes / Cycle IRL 6 états / EDL conforme) | 🟢 **ImmoTrack v15.73 devant LocataireCloud** |
| Identité visuelle | 🟢 Équivalente (light + verts + pastels) |
| Site vitrine externe | 🔴 LocataireCloud devant (ImmoTrack en a aucun) |
| Calculateurs SEO gratuits | 🔴 LocataireCloud devant (16 outils) → couvert par OUTILS-SEO-GRATUITS |
| Roadmap publique | 🔴 LocataireCloud devant |
| Pricing visible | 🔴 LocataireCloud devant → couvert par FOUNDER-EDITION |

### 3 différenciants visuels à PUSHER dans le pitch CGP

1. **Wizard bail paraphes page-par-page + pédagogie §18 + "Lu et approuvé"** → aucun concurrent n'a ça
2. **Cockpit conformité "Climat pluvieux"** profil Gestionnaire → vue 5-secondes du parc, unique
3. **Cycle IRL 6 états avec CTAs contextuels** → gestion fine des cas réels (bail trop récent, indice INSEE absent, révision imminente, à valider et envoyer)

### Audit mobile v15.73 (10 captures)

- 🟢 **7 écrans OK** : Accueil Premium, Biens, Baux, EDL, Régul, IRL, Wizard Bail (paraphes + signatures finales)
- 🔴 **2 BUGS P0 fonctionnels** : menu "Plus" mobile inopérant + sélecteur profil dashboard inaccessible mobile → sujets dédiés `BUG-MOBILE-MENU-PLUS` + `BUG-MOBILE-DASH-PROFILES`
- 🔴 **1 layout critique** : table Pilotage parc 7 colonnes tronquée mobile
- 🟠 **3 layouts moyens** : table Loyers libellés tronqués, tabs tronqués, Hero Gestionnaire titre 3 lignes
- **Effort total Phase 5 polish mobile** : **5-7 j-h** → géré dans `MOBILE-AUDIT-ONGLETS` Phase 5

### Décisions confirmées 2026-05-18

- [x] **FOUNDER-EDITION option (b) validée** : 249 € × 100 places, annonce juillet 2026, +24,9 K€ cash up-front + 100 évangélistes
- [x] **Commit findings audit visuel + audit mobile** : 11 captures LocataireCloud + 2 BUGS P0 mobile + Phase 5 polish identifiée
- [x] **Priorité** : utilisateur finit ses sprints en cours avant lancement session BIZPLAN-V2 dédiée

## Notes utilisateur

> 💬 2026-04-30 : "je vois que c'est un bon début de BP. Par contre cela ne suffit pas pour vendre le projet ou savoir où attaquer en premier pour la partie commerciale. Tu fais un v2 plus poussée ?"
> 💬 2026-05-01 : "il faut que la V2 arrive vite. Je pense que c'est le moyen le plus efficace de se développer. (...) il faut attaquer les CGP ou vendeur pour faire connaître la solution. (...) Un pitch commercial. Il faudra aussi un CDC pour continuer à développer. Je veux un pitch aussi de présentation (ppt ?) avec timeline."
> 💬 2026-05-01 : "on démarre avec google et on fera évoluer" (validation stratégie 3 niveaux souveraineté)
> 💬 2026-05-18 : "https://www.locataire.live comme concurrent sérieux. tu fais un audit ?" → audit livré + 4 sujets réactionnels créés (FOUNDER-EDITION P1, WATCH-LOCATAIRELIVE P2, OUTILS-SEO-GRATUITS P2, IA-COPILOTE P2)

## Journal

- 2026-05-01 : créé · scope figé · 4 décisions architecturales validées (Capacitor, PWA installable, 3 niveaux souveraineté, soft-block) · 3 décisions scope validées (2 pitches, CDC backend, plan beta from scratch) · prompt de démarrage prêt-à-coller
- 2026-05-18 : ajout concurrent #9 LocataireCloud (audit complet livré) · 4 sujets réactionnels créés (FOUNDER-EDITION P1, WATCH-LOCATAIRELIVE P2, OUTILS-SEO-GRATUITS P2, IA-COPILOTE P2) · 6 implications stratégiques intégrées au scope v2 (Founder Edition, outils SEO, IA souveraine, monitoring, accélération PORTAIL-LOC, colocation native)
- 2026-05-18 (suite) : **audit visuel comparatif livré** sur 19 captures (11 LocataireCloud + 8 ImmoTrack v15.73 partagées par utilisateur) · stack LocataireCloud identifié (Next.js + Vercel + shadcn/ui + Fraunces) · 3 différenciants visuels ImmoTrack identifiés pour pitch CGP (wizard bail · cockpit conformité · cycle IRL 6 états) · **audit mobile** révèle 7/10 écrans OK + 2 BUGS P0 (`BUG-MOBILE-MENU-PLUS` + `BUG-MOBILE-DASH-PROFILES`) + 4 layouts (Phase 5 polish 5-7 j-h dans `MOBILE-AUDIT-ONGLETS`) · **FOUNDER-EDITION option (b) validée** par utilisateur 249 € × 100 places · session BIZPLAN-V2 dédiée reportée après finition sprints utilisateur en cours
