# Audit complet — toutes les actions en attente (2026-05-25)

**Pourquoi ce document** : tu as demandé un audit exhaustif pour vérifier qu'il ne manque rien. J'ai parcouru les **~130 sujets** du backlog et je suis honnête : **j'avais oublié plusieurs choses importantes dans le Paquet 1B**. Voici la photo complète.

---

## 📊 Statistiques globales

- **~ 130 sujets** au total
- **~ 50 livrés** ✅ (énorme travail accompli)
- **~ 12 en cours** 🔄
- **~ 60 à faire** ⬜
- **~ 8 en attente / reportés** ⏳

---

## 🚨 BLOC A — Bugs encore ouverts (vraiment urgents)

**J'avais oublié de les mentionner dans le Paquet 1B.** Voici ce qui reste à corriger :

### Bugs P0 (critiques)

| Sujet | Description | Effort |
|---|---|---|
| **BUG-ENT-RENAME-CASCADE** | Perte fonctionnelle au renommage d'entité — à corriger en session dédiée | M |
| **BUG-IRL-001** | Bug IRL P0 (à investiguer si toujours d'actualité) | XS |

### Bugs P1 (importants)

| Sujet | Description | Effort |
|---|---|---|
| **BUG-CHARGE-001** | Régul de charges KO | M |
| **BUG-DASH-001** | Bug dashboard (élargi 2026-05-01) | M |
| **BUG-BAIL-003** | Bug bail | XS (10-15 min) |
| **BUG-DELETE-BRUT-NO-TOMBSTONE** | Suppression sans tombstone (risque pollution sync) | S |
| **BUG-PJ-LOCALSTORAGE** | Bug PJ / localStorage | M |
| **BUG-LOG-FICHE-DIAG-MERGE** | Diag fiche logement | S |

→ **À vérifier**: certains sont peut-être déjà fixés sans mise à jour du statut. À mon prochain pass, je propose qu'on en confirme l'état réel.

---

## 🔄 BLOC B — Chantiers en cours (à finir avant d'attaquer du neuf)

### Architecture (ton terrain actuel)
- **ARCHI-FICHES-UNIFIED** : Session 1 CDC livrée 2026-05-27, 12 décisions arbitrées, **implémentation à dérouler**
- **MODALE-LOGEMENT-CONSOLIDATION** : Phase B (mockup validé 2026-05-29, implémentation à démarrer)
- **BAIL-TYPES** : Phase A+B livrées (v15.191-195), reste Phase C/D/E

### Communication
- **EMAIL-SMTP-CONNECT** : Phase 1+2 livrée v15.80, reste Phase 3 (PJ Drive) + Phase 4 (Microsoft Graph)
- **BAIL-SIGNATURE-DISTANCE** : Session 1 brainstorming livré, mockup à raffiner

### Drive / Cross-device
- **DRIVE-CONFIANCE-UX** : Étape B + A0 livrées (v15.114, v15.116), reste suite
- **WATCH-LOCATAIRELIVE** : monitoring permanent depuis 2026-05-18

### Dashboards
- **DASH-REFONTE-GLOBALE-V4** : en cours, XL (1 session longue)
- **FICHES-PARITE-360** : Session 1 livrée v14.18 (compta riche), reste **7 sessions**

### Stratégie / business
- **BIZPLAN-V2** : en cours depuis 2026-05-01
- **FOUNDER-EDITION** : décision 2026-05-18 (249€ × 100 places), setup à faire

---

## ⬜ BLOC C — Sujets P1 à faire que j'avais OUBLIÉ dans le Paquet 1B

**Je m'en excuse, c'étaient les principaux oublis** :

### Pipeline candidats (important pour Locataires)
- **LOG-CANDIDATS** (P1, L 5-8h) — pipeline de candidats sur les biens vacants. Devrait s'intégrer dans l'onglet **Locataires** que tu viens de livrer.

### IRL / Légal
- **IRL-DPE-FG** (P1, S) — gel IRL si DPE F/G (loi Climat)
- **IRL-VALIDATION** (P1, M) — validation des révisions

### Bail
- **BAIL-CHARGES-DETAIL** (P1, M 3-5h) — détail des charges dans bail
- **SIGN-BAIL-LIEN** (P1 V1.1, L 12-15h) — signature bail par lien distant (couplé BAIL-SIGNATURE-DISTANCE)

### Drive (fondations sync multi-device)
- **DRIVE-2H** (P1, M 4-6h) — re-architecture fichiers Drive
- **DRIVE-2F** (P1, M 4-5h) — Optimistic Concurrency Control
- **DRIVE-2G** (P1, S 3-4h) — Awareness UI

### Charges / Régul
- **CHARGES-COMMUNES** Phase 2+ — déjà bien avancé

### Email
- **AUDIT-EMAIL-FLOW-COMPLET** (P1, S 1h) — bloquant si bug v15.80 persiste

### Tests / monitoring
- **TEST-E2E-PLAYWRIGHT** (P1 V1.1, L 10-15h setup)
- **PROD-MONITORING-CI** (P1 V1.1, S 2-3h)
- **CODE-CLEANUP-AUDIT** (P1, L 6-10h)

### Logement
- **LOG-FICHE-360 Phase 2** (sous-onglets riches) — à planifier

---

## ✅ BLOC D — Tout ce que tu as déjà livré récemment (pour mémoire)

Tu peux respirer, c'est énorme :

**Architecture**
- ARCHI-DB-DOUBLONS, MODALE-LOGEMENT-CONSOLIDATION Phase A, ARCHI-FICHES-UNIFIED Sessions 1-4

**Onglets et UX**
- NAV-RESTRUCTURE, LOG-LISTE-CARDS, LOG-ARCHIVE, BAILLEUR-DIAGNOSTICS-DDT
- EQUIP-CONTROLES-PERIODIQUES, IRL-REVISION-UX-FIX, LEGAL-DPE-INTERDICTION-LOCATION
- PILOTAGE-MATRICIEL, USER-PROFILE-FILTERS, DASH-PROFILES, GANTT-OCCUPATION, GANTT-PREAVIS
- VACANCE-VIZ, CHARGES-COMMUNES Phase 1

**Bugs**
- BUG-IRL-APERCU-LETTRE, BUG-DRIVE-RESURRECTION, BUG-DRIVE-SAVELOOP, BUG-MOBILE-MENU-PLUS, BUG-MOBILE-DASH-PROFILES, BUG-SW-CACHE-JS, BUG-LOCATAIRE-CONCAT, BUG-IMM-FICHE-TOMBSTONE, BUG-DEL-FICHE-360, BUG-BIENS-TABS-FILTER, BUG-BANK-IMPORT-DEDUP

**Email**
- EMAIL-AUTO, EMAIL-ONGLET-PERMANENT, EMAIL-MODAL-UX-REFONTE, EMAIL-FROM-PAR-ENTITE, EMAIL-SMTP-CONNECT (Phase 1+2), DOC-CIVILITE

**Mobile**
- MOBILE-AUDIT-ONGLETS, BUG-MOBILE-MENU-PLUS, BUG-MOBILE-DASH-PROFILES

**Import bancaire**
- BANK-INTEGRATION V1, BANK-IMPORT-V2 (Phases A-F)

**Drive / sync**
- DRIVE-ARBORESCENCE (Phases A+B+D), UNDO-OP

**Logement fiches**
- LOG-FICHE-360 Phase 1, LOG-FICHE-COMPTEURS, LOG-FICHE-CONFORMITE-AGENDA, LOG-FICHE-EDL, LOG-FICHE-ENTRETIEN-DOCS, LOG-ANNONCE

**Stratégie**
- BIZPLAN-STRATEGIE

---

## ⬜ BLOC E — Tous les P2 / P3 (peut attendre)

### Onglets et UX (P2)
- **NAV-FILTRE-ENTITE-GLOBAL** (Chantier A du Paquet 1) — P1 en réalité
- **NAV-LOGEMENT-BAIL-CLARIF** (sous-titres groupes)
- **WIZARD-CREATION-SEQUENTIEL** (Chantier C du Paquet 1) — P1 en réalité
- **V3-REFONTE-ASSURANCES** (déplacer dans fiches)
- **V3-REFONTE-PARAMS-EXPORT-IMPORT** — P1 en réalité
- **V3-VISUEL** (cohérence visuelle globale)
- **UX-GROUP-BY-IMMEUBLE** Phase 4 (9 onglets restants)

### V1 commerciale (P1)
- **DEMO-DATA-JSON** + **ONBOARDING-PREMIERE-CONNEXION** + **APP-DEMO-SEPAREE** (Paquet 2)
- **STRIPE-PAYWALL-V1** (à compléter)

### Bail
- **BAIL-CLAUSES-PERSO**, **BAIL-LOC-ADR-PREC**, **BAIL-PARAPHE-PLACEHOLDER**, **BAIL-TRAVAUX-INTERLOC**, **BAIL-A-ECHOIR**, **BAIL-NAMESPACE-MIGRATION**

### Mouvements / charges
- **MVT-RECURRENT**, **MVT-SCIND-CAT**, **MVT-SCIND-LIMIT**, **CHARGE-REGLES**, **MRH-AUTO-LOC**

### Communication
- **EMAIL-COMPOSER-GMAIL** (P1 en réalité, le composer Gmail)
- **EMAIL-ENVOI-DEPUIS-COMMUNICATION** (wizard envoi PULL)
- **EMAIL-OAUTH-INCREMENTAL**
- **TEMPLATES-EMAILS-PARAMS** (P2, M-L 8-12h)
- **AGENDA-GOOGLE-SYNC** (sync calendrier)
- **CARNET-ADRESSE** (P3 mais utile en Locataires)

### Confort
- **LOG-NOTES**, **LOG-PHOTOS**, **LOG-DG-LABEL**
- **DASH-KPI-HC**
- **BUG-UI-DARK-MODAL**, **BUG-DELIMM-CASCADE**, **BUG-ENT-ORPHANS-CLEANUP**, **BUG-LOG-001**
- **DOC-PJ**, **TRAV-SUIVI**, **EDL-TEMPLATE-PER-LOG**
- **IMPORT-CONCURRENTS**

### Drive (suite)
- **DRIVE-2I**, **DRIVE-2J**, **DRIVE-2K**
- **DRIVE-PARTAGE-PICKER** (en attente retest Marion v15.142)

### Architecture / archi
- **ARCHI-IMM-LOG-DEDUP** (P1, M-L) — déduplication infos Immeuble/Bien
- **ARCHI-MODULAR** (stratégie ES modules natifs validée)
- **IMM-FICHE-SOUS-ONGLETS**, **ASSO-PARTAGE**, **BAILLEUR-FORM-RICHE**

### Mobile
- **MOBILE-PWA-OFFLINE**

### Stratégie / IA / V2
- **IA-COPILOTE** (P2, L), **IA-V2** (V2 post-commercialisation)
- **SAAS-PRICING-TIERS**, **SEPA-PRELEVEMENTS** (V2 SaaS)
- **THEME-FANCY** (EN DERNIER)
- **VEILLE-QALIMO-V2**, **OUTILS-SEO-GRATUITS**

### Tests / outillage
- **TOOLING-MOCKUP-DEVICE-TOGGLE** (dette technique)
- **PARAM-BAILLEUR-AUTOMATISATIONS**

---

## 🎯 Synthèse honnête : ce que j'avais oublié

Mes oublis principaux dans Paquet 1B :

1. **Tous les bugs P0/P1 encore ouverts** (BLOC A) — j'avais zappé qu'il y en a 8 sur la table
2. **LOG-CANDIDATS** (pipeline candidats) — devrait clairement s'intégrer dans Locataires
3. **DRIVE-2F/2G/2H** — fondations de sync multi-device (importantes si tu veux pousser le partage)
4. **SIGN-BAIL-LIEN** + **BAIL-SIGNATURE-DISTANCE** — gros chantier signature distance
5. **TEST-E2E-PLAYWRIGHT** + **PROD-MONITORING-CI** + **CODE-CLEANUP-AUDIT** — l'hygiène technique avant V1 commerciale
6. **AUDIT-EMAIL-FLOW-COMPLET** — bloquant potentiel
7. **TEMPLATES-EMAILS-PARAMS** — pour customiser tes modèles email
8. **FICHES-PARITE-360** — 7 sessions restantes !
9. **STRIPE-PAYWALL-V1** + **FOUNDER-EDITION** — V1 commerciale concrète

---

## 📋 Plan d'attaque consolidé (corrigé)

### 🔴 Tranche prioritaire 0 — Bugs encore ouverts
Vérifier l'état réel des bugs P0/P1 listés au BLOC A (peut-être déjà fixés sans mise à jour). Ceux qui restent → fix. ~3-6h selon ce qui reste.

### 🟠 Tranche 1 — Finir les chantiers en cours
- ARCHI-FICHES-UNIFIED implémentation
- MODALE-LOGEMENT-CONSOLIDATION Phase B
- BAIL-TYPES Phase C/D/E
- EMAIL-SMTP-CONNECT Phase 3+4

→ Tu es déjà dedans. Continue.

### 🟡 Tranche 2 — Paquet 1 (UX cibles)
- Barre globale (NAV-FILTRE-ENTITE-GLOBAL) ~5-7h
- Wizard création séquentiel ~4-6h
- Quick wins onglets (renommer Loyers, défaut Biens, sous-titres) ~3h

### 🟢 Tranche 3 — Paquet 1B (refontes moyennes)
- Supprimer Assurances (V3-REFONTE-ASSURANCES) ~3-4h
- Refonte Import 3 sous-tabs (V3-REFONTE-PARAMS-EXPORT-IMPORT) ~3-4h
- Séparer Sauvegarde / Export ~2-3h
- Audit Paramètres ~1h

### 🔵 Tranche 4 — Communication / contact
- EMAIL-COMPOSER-GMAIL ~5-7h
- LOG-CANDIDATS (pipeline) ~5-8h
- CARNET-ADRESSE ~4-6h
- AGENDA-GOOGLE-SYNC ~4-5h
- TEMPLATES-EMAILS-PARAMS ~8-12h

### 🟣 Tranche 5 — Fondations sync multi-device
- DRIVE-2H ~4-6h
- DRIVE-2F ~4-5h
- DRIVE-2G ~3-4h

### ⚪ Tranche 6 — V1 commerciale
- DEMO-DATA-JSON ~3-5h
- ONBOARDING-PREMIERE-CONNEXION ~5-8h
- APP-DEMO-SEPAREE ~3-6h
- STRIPE-PAYWALL-V1 + FOUNDER-EDITION
- TEST-E2E-PLAYWRIGHT ~10-15h
- PROD-MONITORING-CI ~2-3h
- CODE-CLEANUP-AUDIT ~6-10h

### 🌟 Tranche 7 — Bail / signature distance
- BAIL-SIGNATURE-DISTANCE + SIGN-BAIL-LIEN ~12-15h

### 🎨 Tranche 8 — Design final
- THEME-FANCY (en dernier, dispatch agents design)

---

## ⏱ Total honnête

Si on additionne tout ce qui reste en P0/P1/P2 (en excluant V2 et P3) :

**~ 130 à 170 heures de dev** pour atteindre une V1 commerciale **vraiment complète**.

C'est dense, mais l'app a un **socle solide** (50+ sujets livrés). Le reste est essentiellement de la **finition et de la commercialisation**.

---

## ✅ Maintenant, le mockup

Maintenant que tu as la photo complète, je peux refaire un mockup qui intègre :
- La barre globale (Chantier A)
- Les onglets cibles (Bien / Locataires livré / Mouvements / Communications / EDL / etc.)
- Le wizard de création (Chantier C)
- Le composer Gmail (popup flottante)
- Le pipeline candidats dans Locataires
- Et l'éradication d'Assurances de la sidebar

→ Confirme-moi : **on garde toutes les tranches** ou tu veux que je **focus le mockup** uniquement sur ce qui te plait pour démarrer ?
