# ImmoTrack — Backlog & Pilotage

> **Hub central de pilotage du projet.** Tu n'as PAS besoin de l'ouvrir manuellement.
> Au démarrage de chaque session Claude, je lis ce fichier et je te montre la TodoWrite à jour.
>
> **Workflow** :
> - Tu notes tes remarques dans le chat → je les classe ici + commit
> - Tu dis "où en est-on" → je relis ce fichier et rafraîchis la TodoWrite
> - Tu dis "on attaque [SUJET]" → je te donne le prompt de démarrage de la session sujet
>
> **Légende** :
> - **Priorité** : P0 critique · P1 forte · P2 moyenne · P3 faible
> - **Taille** : XS (<1h) · S (1-3h) · M (3-8h) · L (1-3j) · XL (>3j)
> - **Statut** : ⬜ À faire · ⏳ En attente · 🔄 En cours · ✅ Livré · 🚫 Abandonné

---

## 📑 Vue par onglet (pour travailler onglet par onglet)

> Permet de regrouper tous les sujets d'un même onglet pour les traiter en une session.
> Codes triés par priorité décroissante au sein de chaque onglet.

| Onglet | Codes (prio) |
|---|---|
| 📊 **Dashboard** | DASH-PROFILES ⏳ (P1, Phase 1 livrée — attente validation) · BUG-DASH-001 (P1) · DASH-KPI-HC (P2) · DASH-V2 🔄 (P2) |
| 📜 **Bail** | V3-REFONTE-BAIL 🔄 (P2) · BAIL-CLAUSES-PERSO (P2) · BAIL-TYPES (P2) · BAIL-PARAPHE-PLACEHOLDER (P3) · BAIL-NAMESPACE-MIGRATION (P3) |
| 🏢 **Logement / Équipement** | **FICHES-PARITE-360 🔥 (P1, ~27h)** · LOG-FICHE-360 🔄 (P1, Phase 2) · BUG-LOG-001 (P2) · BUG-EQUIP-FILTER (P2) · BUG-HC-GARDE-FOU (P2) · V3-REFONTE-EQUIP (P2) · LOG-PHOTOS (P2) · LOG-ANNONCE (P2) · LOG-DG-LABEL (P3) — *NAV-RESTRUCTURE + LOG-LISTE-CARDS + LOG-ARCHIVE livrés v14.2 ✅ · LOG-FICHE-360 Bloc A (drill + onglet Bail) livré v14.13 ✅* |
| 🏛️ **Entité / Immeuble** | ENT-SAVE-IMM (P2) |
| 💰 **Mouvements** | V3-REFONTE-LOYERS (P2) · MVT-SCIND-CAT (P2) · MVT-RECURRENT (P2) · MVT-SCIND-LIMIT (P3) |
| 🧾 **Quittances** | V3-REFONTE-QUIT (P2) · QUIT-EMAIL (P2) · AVIS-ECHEANCE (P2) · RAPPEL-IMPAYE (P2) |
| ⚡ **Charges / Régul** | BUG-CHARGE-001 (P1) · V3-REFONTE-REGUL (P2) · CHARGE-REGLES (P2) |
| 📈 **IRL** | V3-REFONTE-IRL (P2) — *BUG-IRL-001 + IRL-VALIDATION + IRL-DPE-FG livrés v13.30/31/33 ✅* |
| 📋 **EDL** | EDL-VALIDATION-AVOCAT (P1) · EDL-TEMPLATE-PER-LOG (P2, ~6h) · EDL-DELEGUE-EXPORT (P2) · EDL-DELEGUE-IMPORT (P2) |
| 🛡️ **MRH** | MRH-AUTO-LOC (P2) |
| 🔧 **Travaux / Entretien / PJ** | DOC-PJ (P2) · TRAV-SUIVI (P2) |
| 🤝 **Associés** | ASSO-PARTAGE (P2) |
| ⚙️ **Architecture / V3 / Sécu** | AUDIT-GLOBAL (P1) · SECU-INNERHTML (P1) · ARCHI-DB-DOUBLONS (P1) ⏳ · V3-VISUEL (P2) · BUG-UI-DARK-MODAL (P2) · V3-REFONTE-PARAMS (P2) |
| 💾 **Drive sync** | DRIVE-ARBORESCENCE 🔄 (P1) · DRIVE-2H (P1) · DRIVE-2F (P1) · DRIVE-2G (P1) · DRIVE-2K ⚠️ englobé (P2) · DRIVE-2I (P2) · DRIVE-2J (P3) |
| 🏛️ **Légal / Fiscal** | LEGAL-2044 (P1) · LEGAL-BILAN-ANNUEL (P1) · LEGAL-2072 (P3) |
| 📥 **Import** | IMPORT-EXCEL-LOG (P2) · IMPORT-CONCURRENTS (P2) |
| 🌐 **Agence / SaaS** | AGENCE-GESTION (P3) · AGENCE-CRG (P3) · AGENCE-HONORAIRES (P3) · SIGN-EIDAS (P3) · PORTAIL-LOC (P3) · SAAS-MULTIUSERS (P3) |
| 📈 **Stratégie / Business** | BIZPLAN-V2 🔄 (P2) — *BIZPLAN-STRATEGIE ✅ Livré 2026-04-30 (5 docs `docs/strategie/`)* |
| 📱 **Mobile / PWA / Offline** | MOBILE-AUDIT-ONGLETS (P1) · MOBILE-PWA-OFFLINE (P2) |

---

## 🔥 Priorité immédiate — bugs critiques

> **🚨 2 chantiers de fond bloquants pour V1 commerciale (à attaquer en sessions dédiées)** :
> - **ARCHI-DB-DOUBLONS** (P1, ~12-15h) — refonte structurelle séparation log (bien) / bail (contrat). [docs/subjects/ARCHI-DB-DOUBLONS.md](docs/subjects/ARCHI-DB-DOUBLONS.md). Phase 1 CDC à attaquer en premier (~2h, dialogue décisions UX).
> - **FICHES-PARITE-360** (P1, ~27h) — parité totale onglets ↔ fiches 360° (logement, immeuble, bailleur). [docs/subjects/FICHES-PARITE-360.md](docs/subjects/FICHES-PARITE-360.md). 8 sessions phasées par ROI.
>
> **Ordre obligatoire** : ARCHI-DB-DOUBLONS Phases 1+2 livré AVANT de démarrer FICHES-PARITE-360, sinon double refacto sur les helpers `_renderXForLog(ref)`.

| Code | Sujet | Prio | Taille | Statut | Détail |
|---|---|---|---|---|---|
| BUG-IRL-001 | Lettre IRL : "date anniversaire du bail" est faux, c'est le mois | P0 | XS | ✅ Livré v13.30 | commit 661d0e7 · "date anniversaire, soit le 15 juin 2026" → "mois anniversaire (juin 2026)" + helper _dfm |
| BUG-CHARGE-001 | Régularisation des charges ne fonctionne pas | P1 | M | ⬜ À faire | [docs/subjects/BUG-CHARGE-001.md](docs/subjects/BUG-CHARGE-001.md) · à diagnostiquer |
| BUG-DASH-001 | Dashboard : prendre les baux en vigueur dans le mois choisi | P1 | M | ⬜ À faire | [docs/subjects/BUG-DASH-001.md](docs/subjects/BUG-DASH-001.md) |
| BUG-BAIL-002 | Bail : seule la 1re signature garant apparaît si 2 garants | P1 | S | ✅ Obsolète 2026-04-29 | [docs/subjects/BUG-BAIL-002.md](docs/subjects/BUG-BAIL-002.md) · vérifié par utilisateur : 2 actes cautionnement bien générés (1 par garant) avec page-break + sig dédiée. Bug résolu par refonte UI dynamique garants. |
| BUG-BAIL-003 | Bail multi-bailleurs : 2e signature bailleur capturée mais absente du PDF | P1 | XS | ✅ Livré v13.19 | [docs/subjects/BUG-BAIL-003.md](docs/subjects/BUG-BAIL-003.md) · commit eca0faa · ✅ testé OK 2026-04-29 (bail Ferrette ARSLAN/HARNIST 2 sigs visibles) |
| BUG-BAIL-PARAPHES-MULTI | Bail multi-bailleurs/locataires : 1 seul paraphe sur N signataires dans footer PDF | P1 | XS | ✅ Livré v13.36 | commit 36f20e2 · `drawParaphesFooter` accepte arrays · genPDFNative collecte en arrays par sig.id · helper `drawCol` trace N sous-cadres côte à côte (label pluriel si N>1) · sigs finales déjà OK (it. par sig.id) |
| BUG-DRIVE-OVERWRITE | **P0 perte de données** : signature bail offline écrasée silencieusement par sync Drive | P0 | S | ✅ Livré v13.38 | commit c6980dc · Cause : wizard signature popup écrivait `bail.signatures = sigData` sans `_stamp(bail)` → `_modifiedAt` non MAJ → `_drvWins` faisait gagner Drive → signature wiped + push DB sans sig = perte définitive. **3 fixes** : (1) stamp dans wizard 2 paths · (2) protection signature au merge `_mergeEntityPayload` (jamais d'écrasement silencieux d'une sig locale par un Drive sans sig) · (3) alerte utilisateur via `_driveSigProtected` + bouton "Restaurer backup" dans toast conflit |
| BUG-DRIVE-DISCONNECT | **P0 sauvegarde silencieusement perdue** : token Drive expire à 1h sans alerte | P0 | M | ✅ Livré v13.41 | commit d616669 · OAuth GIS browser-only n'a pas de refresh token. **5 leviers** : (A) refresh proactif T-5min via `_scheduleProactiveTokenRefresh` · (B) refresh à `visibilitychange` au retour de tab · (C) modale obligatoire `#ov-drive-disconnected` avec NB modifs en attente + bouton reconnecter + warning risque · (D) FAB rouge clignotant `@keyframes drive-fab-pulse` quand expiré · (E) silent re-grant au startup si `_driveLastSync` existe. Reprompt 5min après "Plus tard". 9 triggers de modale documentés. |
| IRL-VALIDATION | IRL : enveloppe couleur + valider envoi + valider IRL + popup mois anniversaire | P1 | M | ✅ Livré v13.33 | refonte v13.33 (v13.32 rejeté : encart dans lettre = bricolage). Enveloppe 3 états (gris/orange/rouge/vert) dans cellule actions + boutons "Valider envoi" et "💶 Valider IRL" cohérents tous états + popup `#ov-irl-rappel` mois anniversaire (login 1×/jour + ouverture onglet IRL 1×/session) + dashboard alerts enrichies + lettre PDF nettoyée (zéro encart validation) |
| IRL-DPE-FG | IRL : pas de révision si bail en DPE F ou G (loi Climat 2021) | P1 | S | ✅ Livré v13.31 | commit 625638c · 4 surfaces (computeIRLRevision + rIRL + genIRLLetter + applyIRL) · DPE F/G bloque dur, DPE manquant alerte popup, DPE >10 ans warning |
| BUG-LOG-001 | Logement : référence non modifiable après création | P2 | XS | ⬜ À faire | [docs/subjects/BUG-LOG-001.md](docs/subjects/BUG-LOG-001.md) |
| BUG-EQUIP-FILTER | Onglet Équipements : filtre exclut logements vacants | P2 | XS | ⬜ À faire | Hérité de v12.36 · à voir dans refonte Équipements |
| BUG-HC-GARDE-FOU | Garde-fou saisie HC : alerte si valeur aberrante | P2 | XS | ⬜ À faire | Hérité de v2 · ratio HC/médiane > 10 ou seuil absolu |
| BUG-UI-DARK-MODAL | Mode sombre : fond modale trop transparent (texte page derrière visible) | P2 | XS | ⬜ À faire | [docs/subjects/BUG-UI-DARK-MODAL.md](docs/subjects/BUG-UI-DARK-MODAL.md) · capture wizard Bail F-001 · à fixer dans V3-VISUEL ou avant |

---

## 🔴 P1 — Légal / Fiscal (bloquant commercialisation)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
| 14 | LEGAL-2044 | Aide déclaration 2044 — mapping catégories → lignes fiscales | P1 | L | ⬜ À faire | Critères 7.1/7.2 — ImmoTrack seul sans cette feature vs concurrents · CDC requis avant code |
| 15 | LEGAL-BILAN-ANNUEL | Bilan annuel par entité PDF | P1 | M | ⬜ À faire | Critère 7.5 — pré-requis fiscal |
| 38 | EDL-VALIDATION-AVOCAT | Validation légale template EDL par avocat (bail habitation) | P1 | XS | ⬜ À faire | Décret 2016-382 · clés (nombre+destination), réf EDL entrée dans sortie, comparatif pièce par pièce |
| 32 | ARCHI-DB-DOUBLONS | Refonte architecture DB — séparer log (bien physique) et bail (contrat), bidirectionnel | P1 | XL (~12-15h, ~3-4h restantes) | 🔄 **Phases 1+2+3a+3b+4a+4b fondation ✅ livrées v14.17.2** · Phase 4b refacto ⬜ session dédiée | [docs/subjects/ARCHI-DB-DOUBLONS.md](docs/subjects/ARCHI-DB-DOUBLONS.md) · **Phases livrées** : 1 CDC `ae73859`, 2 data `511faf3` v14.14, 3a UI tabs `5d7097f` v14.15, 3b sync étendu `17426cf` v14.16, 4a wizard readonly `5fd2ca0` v14.17, fix bouton `230a7fd` v14.17.1, **4b fondation `1a42721` v14.17.2** (`_readLogForBail` enrichi expose API legacy aplatie : adrBien/ftype/dpe/ges/erp/plomb/chauff/ecsLabel/etc.). **Phase 4b complète = ~3-4h** session dédiée future avec tests bail PDF obligatoires : refacto manuelle 149 sites dans 5 fonctions PDF (previewBailData l.12260, previewBailDataV2 l.10961, genBailHTML l.13947, exportBailWord l.13875, genPDFNative l.13570) + listings (rBaux/rMv/rDash/rEDLList/rQuit) + suppression 33 champs obsolètes + suppression `_syncLogToBail`. Pattern : `const bLog = _readLogForBail(bail, log); bail.X` → `bLog.X`. |

---

## 🔴 P1 — Sécu / Architecture (bloquant commercialisation)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| **FICHES-PARITE-360** 🔥 | **Parité totale onglets ↔ fiches 360° (logement / immeuble / bailleur) — single source of truth** | **P1** | **XL (~27h, ~23h restantes)** | 🔄 **Session 1 ✅ Compta riche logement livrée v14.18** · 7 sessions restantes | [docs/subjects/FICHES-PARITE-360.md](docs/subjects/FICHES-PARITE-360.md) · **Session 1 commit `a2ae89c` v14.18** : sous-onglet 💰 Comptabilité fiche logement (KPIs annuels + cash-flow SVG 12 barres + listes compactes mouvements/quittances/IRL filtrées par ref+année + sélecteur année + boutons "+ Mvt"/"+ Quittance"). Helpers factorisables `_renderComptaKPIsForLog`, `_renderComptaCashFlowChart`, `_renderMvForLog`, `_renderQuitForLog`, `_renderIrlForLog`. **Sessions restantes par ROI** : 2 Plan d'occupation Gantt immeuble (~3h, killer feature), 3 EDL fiche logement + EDL-TEMPLATE-PER-LOG (~7h), 4 Compteurs + graphique conso (~2h), 5 Entretien équipements+assurances+agenda (~2h), 6 Documents agrégés (~1h), 7 Performance + compta bailleur (~5h), 8 Plan immeuble charges communes+travaux (~3h). |
| AUDIT-GLOBAL | Audit global avant V3 (sécu XSS, perf, code quality, OAuth, PWA) | P1 | M | ⬜ À faire | Étape 1 V3 transition · agent Explore + skills review/security-review · cf `project_v3_transition.md` |
| SECU-INNERHTML | Sites `innerHTML=` non échappés restants (~107 occurrences, 10 wrappés) | P1 | M | ⬜ À faire | Renders tableaux/cartes/modales onglets baux-hist, mv, quit, ass, etc. · à traiter au fil refonte onglet par onglet · l.7310 dash-alerts non-escapable |
| MOBILE-AUDIT-ONGLETS | Audit + correctifs UX mobile onglet par onglet (irréprochable sur téléphone) | P1 | L | 🔄 Phase 1+2 livrées v14.11/14.12 | [docs/subjects/MOBILE-AUDIT-ONGLETS.md](docs/subjects/MOBILE-AUDIT-ONGLETS.md) · **Phase 1 (v14.11)** : anti-zoom iOS Safari global (font-size:16px <768px). **Phase 2 (v14.12)** : refonte EDL liste cards + formulaire modal plein écran + compteurs/clés cards verticales + signatures empilées + footer sticky. **Phase 3 restante** : Bail wizard mobile, form Logement/Immeuble, form IRL, modals générales (padding, height 100dvh). **Phase 4 polish** : touch targets 44px partout, scroll-margin, test PWA standalone, espacement vertical pouce. Breakpoints standardisés : <480 / <768 / <1024. |
| LOG-FICHE-360 | Vue 360° consolidée par bien (Phase 2 sous-onglets Documents/EDL/Compta/Compteurs/Entretien) | P1 | M | 🔄 Phase 1 livrée v14.2 | [docs/subjects/LOG-FICHE-360.md](docs/subjects/LOG-FICHE-360.md) · Phase 1 livrée commit `1036bdf` (route + header + onglet Général) · Phase 2 à planifier en session dédiée — stub ergonomique des 5 sous-onglets déjà en place |
| DASH-PROFILES | Dashboards par lentille (Propriétaire / Financier / Gestionnaire / Fiscal / Investisseur / Échéances / Prévisionnel / Patrimoine + Custom) | P1 | XL | ⏳ Phase 1 livrée — attente validation | [docs/subjects/DASH-PROFILES.md](docs/subjects/DASH-PROFILES.md) · **Phase 1 aperçu livrée 2026-05-01** : [DASH-PROFILES-SPEC.md](docs/strategie/DASH-PROFILES-SPEC.md) + 8 mockups HTML cliquables [dashboard-mockups/](docs/strategie/dashboard-mockups/index.html) · Reco V1 (4 lentilles : Propriétaire+Financier+Fiscale+Échéances, ~12 j-h) vs V2 (4 lentilles + Custom, ~26 j-h) · 6 questions ouvertes à arbitrer · Phase 2 implémentation après validation utilisateur |

---

## 🔴 Drive sync — bloquant V1 commercial multi-users

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| DRIVE-2H | Re-architecture fichiers Drive (par-user vs partagé vs référentiel) | P1 | M | ⬜ À faire | À faire EN PREMIER (base de 2F/2G) · [docs/subjects/DRIVE-2H.md](docs/subjects/DRIVE-2H.md) |
| DRIVE-2F | Optimistic Concurrency Control (OCC) au file level | P1 | M | ⬜ À faire | Après 2H · [docs/subjects/DRIVE-2F.md](docs/subjects/DRIVE-2F.md) · **REMINDER** : v14.0 push immédiat = "last writer wins" trivial → 2 devices simultanés = écrasement silencieux. OCC via `If-Match: etag` Drive header empêcherait l'écrasement → toast conflit + merge manuel. CRITIQUE pour multi-user (cf user feedback 2026-05-01) |
| DRIVE-2G | Awareness UI (qui édite quoi) | P1 | S | ⬜ À faire | Couche UX · [docs/subjects/DRIVE-2G.md](docs/subjects/DRIVE-2G.md) |
| DRIVE-ARBORESCENCE | Arborescence Drive Entité/Immeuble/Logement/[9 sous-dossiers métier] + sync bidirectionnel | P1 | L | 🔄 Phase A livrée v14.20 (`528eafe` + `03cd686`) · B/D/E restantes | [docs/subjects/DRIVE-ARBORESCENCE.md](docs/subjects/DRIVE-ARBORESCENCE.md) · session dédiée démarrée 2026-05-01, interrompue 2026-05-02 pour UNDO-OP urgent, reprise prévue après · **Phase A livrée v14.20** : helpers `_drvImmoTrackRoot` / `_drvEnsureEntityFolder` / `_drvEnsureImmeubleFolder` / `_drvEnsureLogementTree` (parallélisation 9 sous-dossiers) / `_drvRenameFolder` / `_drvTrashFolder` ; hooks save/del Ent/Imm/Log fire-and-forget · Sous-dossiers : 📋 EDL, 📜 Bail, 📄 Documents, 🖼️ Photos, 🧾 Quittances, 📈 IRL, 🛡️ MRH, 🔧 Travaux, ⚡ Charges · Reste Phase B (helper `_drvUploadDoc` app→Drive) + Phase D (UI Paramètres « Réorganiser ») + Phase E (sync pilotage final) · englobe/remplace DRIVE-2K · à coupler avec DOC-PJ et LOG-PHOTOS |

---

## 🟠 P2 — V3 visuelle harmonisée (= "design", étape 2 V3)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| V3-VISUEL | Appliquer design system v2 à TOUTES les pages (formulaires, tableaux, modales, cartes, typo, hover/focus, mode sombre, responsive) | P2 | L | ⬜ À faire | Structure inchangée, juste visuel · cf `project_v3_transition.md` étape 2 · ~3-5 sessions · **Principe directeur** : constance visuelle non-négociable sur toute l'app — chaque nouveau composant/page doit déjà appliquer la cible (cf mémoire `feedback_design_consistency.md`) |

## 🟠 P2 — V3 fonctionnelle onglet par onglet (étape 3 V3)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| V3-REFONTE-BAIL | Refonte fonctionnelle Bail (en cours sur plusieurs sessions) | P2 | L | 🔄 En cours | Phase 3a-d, wizard, signature, snapshot livrés. Reste : polish + types + PDF natif (cf sujets dédiés) |
| V3-REFONTE-LOYERS | Refonte fonctionnelle onglet Loyers/Mouvements | P2 | M | ⬜ À faire | 2e priorité après Bail (cf `project_v3_transition.md`) |
| V3-REFONTE-QUIT | Refonte fonctionnelle onglet Quittances | P2 | M | ⬜ À faire | 3e priorité |
| V3-REFONTE-REGUL | Refonte fonctionnelle onglet Régularisation | P2 | M | ⬜ À faire | 4e priorité · couvre BUG-CHARGE-001 + CHARGE-REGLES |
| V3-REFONTE-IRL | Refonte fonctionnelle onglet IRL | P2 | M | ⬜ À faire | 5e priorité · couvre IRL-VALIDATION |
| V3-REFONTE-PARAMS | Refonte fonctionnelle onglet Paramètres/Référentiel | P2 | M | ⬜ À faire | 6e priorité |
| V3-REFONTE-EQUIP | Refonte fonctionnelle onglet Équipements | P2 | M | ⬜ À faire | 7e priorité · inclut BUG-EQUIP-FILTER |
| DASH-V2 | Refonte dashboard 7 phases (one-screen ~900px) | P2 | XL | 🔄 En cours | v2 livré · cahier v2 avril 2026 · cf `project_immotrack.md` + `project_dashboard_onescreen.md` · 7 phases au total |

## 🟠 P2 — Bail (chantiers spécifiques planifiés)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| BAIL-PRINT-POLISH | Polish Bail (paraphes / en-têtes nav / cautionnement / logo entité / UX éditeur template) | P2 | M | ✅ Livré v13.05-13.29 | Points 1+6 obsolètes (source unique v13.05) · 2+3 cautionnement print v13.25-27 · 4 logo entité v13.28 · 5 UX éditeur template (mode lecture + mode avancé toggle) v13.29 |
| BAIL-PDF-NATIF | Refonte PDF Bail natif (pdf.text/pdf.rect + signatures + emplacements vides) | P2 | L | ✅ Livré v13.24 | Phase A-B-C livrées sessions 2026-04-26/27 · Phase D Notice arrêté 2015 livrée v13.24 commit 064c4c6 · cf `project_bail_pdf_native.md` |
| BAIL-TRAVAUX-INTERLOC | Champ "Travaux réalisés depuis précédent locataire" manquant dans le formulaire | P2 | XS | ✅ Livré v13.23 | commit 529e261 · textarea + visibilité conditionnelle (zone tendue/encadrement/<18 mois) |
| BAIL-LOC-ADR-PREC | Adresse précédente par locataire (au lieu d'un champ unique concaténé) | P2 | S | ✅ Livré v13.23 | commit 529e261 · 1 input par locataire + checkbox "même adresse" + migration legacy |
| BAIL-CLAUSES-PERSO | Clauses particulières personnalisables par entité (ou bail) — section "16 bis" injectée auto | P2 | S | ⬜ À faire | [docs/subjects/BAIL-CLAUSES-PERSO.md](docs/subjects/BAIL-CLAUSES-PERSO.md) · liste de {titre, contenu} dans entite.customClauses · injection HTML/PDF/Word · ~1-2h |
| BAIL-TYPES | Ajout 5 types bail (meublé/garage/mobilité/étudiant + Autre) | P2 | L | ⬜ À faire | 5 sous-phases A-E · cf `project_bail_types.md` · session dédiée après PDF natif |

## 🟠 P2 — Détectés en usage (par onglet)

| Code | Sujet | Prio | Taille | Statut | Détail |
|---|---|---|---|---|---|
| **Dashboard** | | | | | |
| DASH-KPI-HC | KPI occupation/rendement brut basés sur loyer HC, drill TTC | P2 | S | ⬜ À faire | [docs/subjects/DASH-KPI-HC.md](docs/subjects/DASH-KPI-HC.md) |
| **Mouvements** | | | | | |
| MVT-SCIND-CAT | Ajouter catégorie au scindage de ligne | P2 | S | ⬜ À faire | [docs/subjects/MVT-SCIND-CAT.md](docs/subjects/MVT-SCIND-CAT.md) |
| MVT-RECURRENT | Mouvements récurrents (assurance, prêt) avec récurrence configurable | P2 | M | ⬜ À faire | [docs/subjects/MVT-RECURRENT.md](docs/subjects/MVT-RECURRENT.md) |
| **Charges** | | | | | |
| CHARGE-REGLES | Règles répartition charges (chauffage 30/70, eau compteur) | P2 | M | ⬜ À faire | [docs/subjects/CHARGE-REGLES.md](docs/subjects/CHARGE-REGLES.md) |
| **Entité** | | | | | |
| ENT-SAVE-IMM | Modifier entité : Enregistrer entité sauve aussi l'immeuble en saisie | P2 | S | ⬜ À faire | [docs/subjects/ENT-SAVE-IMM.md](docs/subjects/ENT-SAVE-IMM.md) |
| **MRH** | | | | | |
| MRH-AUTO-LOC | MRH : récupérer auto le locataire selon logement | P2 | S | ⬜ À faire | [docs/subjects/MRH-AUTO-LOC.md](docs/subjects/MRH-AUTO-LOC.md) |
| **Logement** | | | | | |
| LOG-PHOTOS | Photos illustratives sur la fiche logement (galerie permanente) | P2 | M | ⬜ À faire | [docs/subjects/LOG-PHOTOS.md](docs/subjects/LOG-PHOTOS.md) · réutiliser pattern EDL-PHOTOS-IDXDB · couple avec LOG-ANNONCE · alimenterait l'image principale des cartes Biens (placeholder actuel) et le hero de LOG-FICHE-360 |
| LOG-ANNONCE | Bouton "Générer annonce de location" pour logements vacants | P2 | M | ⬜ À faire | [docs/subjects/LOG-ANNONCE.md](docs/subjects/LOG-ANNONCE.md) · différenciant marché vs Rentila/BailFacile |
| **Travaux / PJ** | | | | | |
| DOC-PJ | Pouvoir ajouter des PJ (factures, CR entretien, photos) | P2 | M | ⬜ À faire | [docs/subjects/DOC-PJ.md](docs/subjects/DOC-PJ.md) |
| TRAV-SUIVI | Suivi entretien / travaux avec calendrier | P2 | L | ⬜ À faire | [docs/subjects/TRAV-SUIVI.md](docs/subjects/TRAV-SUIVI.md) · CDC requis |
| **Courriers / Templates** | | | | | |
| DOC-CIVILITE | Reprendre civilité du locataire dans formules de politesse | P2 | XS | ✅ Livré v13.23 | commit 529e261 · helpers _civSalut/_civConge incluent maintenant les noms ("Madame ARSLAN, Monsieur HARNIST,") |
| **Associés** | | | | | |
| ASSO-PARTAGE | Refonte du fonctionnement du partage entre associés | P2 | L | ⬜ À faire | [docs/subjects/ASSO-PARTAGE.md](docs/subjects/ASSO-PARTAGE.md) · CDC requis |

---

## 🟠 P2 — Fonctionnel (concurrence / standards marché)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
|  | EDL-TEMPLATE-PER-LOG | Template EDL personnalisable par logement (labels enrichis + on/off pièces+éléments + custom) — héritage auto vers nouveaux EDL | P2 | M (~6h) | ⬜ À faire | [docs/subjects/EDL-TEMPLATE-PER-LOG.md](docs/subjects/EDL-TEMPLATE-PER-LOG.md) · proposé par session parallèle 2026-05-02 · intégré planning LOG-FICHE-360 Phase 2 (Bloc C, sous-onglet 6 ou 7e de la fiche) · spec validée avec 2 réserves mineures (id stable + UX placeholder) · zone code propre côté EDL_TPL/openNewEDL · session parallèle peut coder en parallèle sans conflit |
| 16 | EDL-DELEGUE-EXPORT | EDL délégué : export HTML offline pour tiers | P2 | L | ⬜ À faire | Critères 2.15+16.5 · différenciant total absent de TOUS les concurrents |
| 17 | EDL-DELEGUE-IMPORT | EDL délégué : import JSON + statut À valider | P2 | M | ⬜ À faire | Critère 2.16 · complémentaire du point 16 |
| 18 | IMPORT-EXCEL-LOG | Import Excel logements/locataires (template SheetJS) | P2 | M | ⬜ À faire | Critères 14.1+14.2 · onboarding · SheetJS déjà embarqué |
| 19 | QUIT-EMAIL | Envoi email quittances au locataire | P2 | M | ⬜ À faire | Critère 3.3 · standard chez tous concurrents |
| 20 | AVIS-ECHEANCE | Avis d'échéance avant paiement | P2 | S | ⬜ À faire | Critère 3.7 · manque vs Qalimo/Rentila/BailFacile |
| 21 | RAPPEL-IMPAYE | Rappel automatique locataire (impayé) | P2 | M | ⬜ À faire | Critère 4.12 · standard marché |
|  | IMPORT-CONCURRENTS | Migration depuis solutions concurrentes (Rentila / BailFacile / Qalimo / etc.) | P2 | L | ⬜ À faire | [docs/subjects/IMPORT-CONCURRENTS.md](docs/subjects/IMPORT-CONCURRENTS.md) · CDC requis · onboarding clé pour commercialisation |
|  | BIZPLAN-STRATEGIE | Étude de marché + business plan + positionnement + effort déploiement (B2C + B2B pro) | P2 | L | ✅ Livré 2026-04-30 | 5 livrables dans `docs/strategie/` : [BIZPLAN](docs/strategie/BIZPLAN.md) · [CARTE_POSITIONNEMENT](docs/strategie/CARTE_POSITIONNEMENT.md) · [PROJECTIONS](docs/strategie/PROJECTIONS.md) · [PLAN_ACTIONS](docs/strategie/PLAN_ACTIONS.md) · [EFFORT_DEPLOIEMENT](docs/strategie/EFFORT_DEPLOIEMENT.md) |
|  | BIZPLAN-V2 | Pitch commercial CGP + plan attaque opérationnel + CDC technique (V2 dossier) | P2 | XL | 🔄 En cours | [docs/subjects/BIZPLAN-V2.md](docs/subjects/BIZPLAN-V2.md) · 11 livrables (2 pptx + xlsx + pdf one-pager + 7 md/docx) sur 2-3 sessions dédiées · 4 décisions archi figées (Capacitor V1.1, PWA installable, 3 niveaux souveraineté, soft-block) · cible CGP/vendeurs |

---

## 🔵 P3 — Petits sujets / nice-to-have

| Code | Sujet | Prio | Taille | Statut | Détail |
|---|---|---|---|---|---|
| BAIL-A-ECHOIR | Bail : "à échoir" par défaut | P3 | XS | ✅ Livré v13.23 | commit 529e261 · data DEMO modalitePaiement de "terme_echu" → "echeoir" |
| MVT-SCIND-LIMIT | Mouvements : limite scindage ligne ? | P3 | XS | ⬜ À faire | [docs/subjects/MVT-SCIND-LIMIT.md](docs/subjects/MVT-SCIND-LIMIT.md) · investigation |
| LOG-DG-LABEL | Logement : label "DG" explicite (Dépôt de Garantie) | P3 | XS | ⬜ À faire | [docs/subjects/LOG-DG-LABEL.md](docs/subjects/LOG-DG-LABEL.md) |
| BAIL-PARAPHE-PLACEHOLDER | Bail : supprimer le texte "à compléter" dans cadre paraphe locataire | P3 | XS | ⬜ À faire | [docs/subjects/BAIL-PARAPHE-PLACEHOLDER.md](docs/subjects/BAIL-PARAPHE-PLACEHOLDER.md) |
| BAIL-NAMESPACE-MIGRATION | Retirer alias globaux Bail.* — migration onclick inline → addEventListener | P3 | XL | ⏳ En attente | [docs/subjects/BAIL-NAMESPACE-MIGRATION.md](docs/subjects/BAIL-NAMESPACE-MIGRATION.md) · ~35 onclick bail à migrer + event delegation pour les renders dynamiques · 3-4 jours · pas avant V3-VISUEL et V3-REFONTE-BAIL terminés |

---

## 🔵 P3 — Module agence + SaaS (CDC requis avant tout code)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
| 25 | AGENCE-GESTION | Module agence : gestion pour compte de tiers (mandants) | P3 | XL | ⬜ À faire | Critères 11.2-11.6 · rupture modèle données · CDC requis |
| 26 | AGENCE-CRG | Module agence : relevé de gérance mensuel (CRG) | P3 | XL | ⬜ À faire | Critère 11.3 · cœur métier admin de biens |
| 27 | AGENCE-HONORAIRES | Module agence : honoraires gestion paramétrables | P3 | L | ⬜ À faire | Critère 11.4 · % loyer + forfait |
| 28 | LEGAL-2072 | Liasse 2072 SCI IR | P3 | XL | ⬜ À faire | Critère 7.3 · seul ImmobilierLoyer le propose · différenciant SCI |
| 29 | SIGN-EIDAS | Signature électronique eIDAS (via prestataire) | P3 | L | ⬜ À faire | Critère 13.6 · valeur légale renforcée vs canvas |
| 30 | PORTAIL-LOC | Portail locataire (accès en ligne lecture) | P3 | XL | ⬜ À faire | Critère 12.7 · nécessite SaaS |
| 31 | SAAS-MULTIUSERS | Multi-utilisateurs + rôles (SaaS) | P3 | XL | ⬜ À faire | Critères 16.1+16.2 · backend nécessaire · CDC architecture SaaS requis |

---

## 🟡 V1+ post-commercialisation Drive

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| DRIVE-2K | Arborescence Drive par dossier entité (JSON+Baux+EDL ensemble pour partage simple) | P2 | M | ⬜ À faire | [docs/subjects/DRIVE-2K.md](docs/subjects/DRIVE-2K.md) · à combiner avec DRIVE-2H |
| DRIVE-2I | Audit log + history Drive | P2 | S | ⬜ À faire | Pour support client · [docs/subjects/DRIVE-2I.md](docs/subjects/DRIVE-2I.md) |
| DRIVE-2J | Field-level conflict resolution | P3 | M | ⬜ À faire | Nice-to-have · [docs/subjects/DRIVE-2J.md](docs/subjects/DRIVE-2J.md) |

---

## ✅ Livré récemment

### BUG-DEL-FICHE-360 + UX-IMM-MODAL — session 2026-05-02 (~1h15, 2 commits, v14.26 + v14.27)
| Code | Sujet | Note |
|---|---|---|
| BUG-DEL-FICHE-360 | Fix régression UX post-UNDO-OP : `delLog`/`delImm`/`delEnt`/`delBail` ne fermaient plus la modale d'édition ni ne quittaient la fiche 360° de l'élément supprimé. Ajout `closeM('ov-X')` + `closeXFiche()` conditionnel **avant** le `_undoOp` (préserve Ctrl+Z) | v14.26 · [docs/subjects/BUG-DEL-FICHE-360.md](docs/subjects/BUG-DEL-FICHE-360.md) |
| UX-IMM-MODAL | Modale immeuble rendue **autonome** (« 1 création = 1 bulle ») : section Immeubles retirée de `ov-ent`, hidden `imm-ent-id` ajouté à `ov-imm`, refacto `addImmForm/editImm/delImm/saveImm` avec `entIdOverride`, `openNewImm`/`_confirmImmPicker` n'ouvrent plus `ov-ent` intermédiaire, bouton « + Immeuble » sur fiche bailleur 360°, menu ⋮ carte building enfin opérationnel (kind prioritaire sur ref) | v14.27 · [docs/subjects/BUG-DEL-FICHE-360.md](docs/subjects/BUG-DEL-FICHE-360.md) (volet 2) |

### UNDO-OP — session 2026-05-02 (~3h, 4 commits, v14.21 → v14.24)
| Code | Sujet | Note |
|---|---|---|
| UNDO-OP Phase 1 | Cœur stack RAM 20 niveaux + helpers `_undoOp`/`_undoUndo`/`_undoClear` + hook saveDB symétrique (`_undoOnSaveDB` pré + `_undoOnSaveDBSuccess` post) + init aux 2 sites loadDB + flag `_undoSuppressCapture` anti-récursion | v14.21 · commit `07e591a` |
| UNDO-OP Phase 2 | UI : CSS `#fab-undo` bottom-left (responsive 52px mobile) + `_undoUIInit` injection FAB au boot + listener Ctrl+Z global avec guard `_inEditableField` (laisse undo natif des inputs/textarea) + helper `_undoToast(message, type)` pour bouton « ↶ Annuler » 8s inline | v14.22 · commit `9b9cf3f` |
| UNDO-OP Phase 3 | 11 wrappers `_undoOp` sur les suppressions critiques avec libellés explicites : delLog, delImm, delEnt, delMv, delBail, delBailHist, delAss, delMrh, delIRL, delQuit, delEDL · Drive trash garde hors du `_undoOp` (cf spec Q6b : V1 corbeille manuelle 30j) | v14.23 · commit `bb1f23d` |
| UNDO-OP Phase 4 | Multi-device safety : flag `_drivePullChangedDB` + helper `_drvMark()` → 24 instrumentations dans `_mergeEntityPayload` + 2 dans `_mergeGlobalPayload` (mouvements globaux uniquement) ; `_driveLoadEntityFiles` vide la stack undo après pull avec modifs externes via `_undoClear('drive_pull')` + toast info | v14.24 · commit `4c5b4f5` |

### Vue Biens (Qalimo-like) — session 2026-05-01 (~6h, 5 commits, v14.1 → v14.2)
| Code | Sujet | Note |
|---|---|---|
| NAV-RESTRUCTURE | Sortir Biens + Bailleurs du Référentiel → 2 onglets sidebar dédiés (section Patrimoine) ; Référentiel renommé Paramètres ; redirects legacy | v14.2 · commit `aaf1e54` |
| LOG-LISTE-CARDS Phase 1 | Grid responsive cartes immeubles 4/3/2/1 cols + toggle Immeubles↔Logements + ratio occupation visuel + image placeholder + agrégation période/loyer total | v14.2 · commit `df7b66f` |
| LOG-LISTE-CARDS Phase 2 | Toolbar : recherche live + popovers Filtrer (bailleur/statut/type) et Trier (6 critères) + export CSV 15 colonnes + badge filtres actifs + auto-fermeture popovers | v14.2 · commit `a4bed74` |
| LOG-ARCHIVE | Soft-delete réversible + champs `archived`/`archivedAt` + tabs Actifs/Archivés avec compteurs + menu dropdown ⋮ (Voir/Modifier/Archiver-Restaurer/Supprimer) + bloc archivage si bail actif + style is-archived + migration ciblée 5 selects de création | v14.2 · commit `7070fb3` |
| LOG-FICHE-360 Phase 1 | Vue full-page route `#log-fiche-{ref}` (deeplink + back/forward + boot) + hero (placeholder photos + badges) + onglet Général (panneaux Locataire actuel + Conditions du bail) + 5 sous-onglets stubbés "À venir" | v14.2 · commit `1036bdf` |

### Drive sync — session 2026-04-28 (~5h, 7 commits, v13.12 → v13.18)
| # | Code | Sujet | Note |
|---|---|---|---|
| | DRIVE-2A | Payload entity étendu (5 collections supplémentaires) + fichier global | v13.12 · commit 815e22f |
| | DRIVE-2A-bis | Protection démo + restore intelligent par type | v13.13 · commit 8b2992b |
| | DRIVE-2A-ter | Fix 83 mouvements globaux non sync | v13.14 · commit 26d4ce5 |
| | DRIVE-2A-quater | Bouton UI cleanup Dupont | v13.15 · commit 5dd53b9 |
| | DRIVE-2A-quinquies | trashed=false sur queries Drive | v13.16 · commit 284c794 |
| | DRIVE-2C | Backup pré-sync localStorage + bouton Restaurer | v13.17 · commit ec52ae4 |
| | DRIVE-2D | Force push depuis device source | v13.17 · commit ec52ae4 |
| | DRIVE-2B | Timestamps `_modifiedAt` + merge timestamp-aware | v13.18 · commit 619f8ff |
| | DRIVE-2E | Toast warning sur conflit détecté au load | v13.18 · commit 619f8ff |

### Bail — sessions avril 2026 (v12.50 → v13.24)

| Code | Sujet | Note |
|---|---|---|
| BAIL-PDF-NATIF | Phase D Notice arrêté 29 mai 2015 intégrée au PDF natif | v13.24 · commit 064c4c6 · Phases A-C livrées avant (genPDFNative + helpers PDF_NATIVE) |
| BAIL-A-ECHOIR | Modalité paiement "à échoir" par défaut (data DEMO) | v13.23 · commit 529e261 |
| BAIL-TRAVAUX-INTERLOC | Champ travaux d'amélioration entre 2 locataires | v13.23 · commit 529e261 |
| DOC-CIVILITE | Civilité + nom dans formules de politesse | v13.23 · commit 529e261 |
| BAIL-LOC-ADR-PREC | Adresse précédente par locataire + checkbox "même" | v13.23 · commit 529e261 |
| BUG-BAIL-003 | Multi-bailleurs : N cadres signature au lieu d'un seul | v13.19 · commit eca0faa |
| BAIL-WIZARD | Wizard 4 étapes Bail | v12.44-50 |
| BAIL-3a | Extraction namespace BailDocument | v12.52 |
| BAIL-3b | Conversion ES5 → ES6 (partielle, var → const) | v12.53-55 |
| BAIL-3c | Magic strings → constantes | SKIPPED |
| BAIL-3d | Namespace global Bail.* (~45 entrées) | v12.56 |
| BAIL-WIZARD-V2 | Wizard signature mobile-first (paraphes, jsPDF natif, page-par-page) | v12.59-66 |
| BAIL-PDF-INLINE | jsPDF + html2canvas inlinés (CORS file://) | v12.68 |
| BAIL-PDF-UTF8-FIX | URL.createObjectURL(Blob) au lieu de atob() | v12.70 |
| BAIL-SIGNATURE-PERSIST | Persistance signatures DB + workflow signé/reset | v13.02-05 |
| BAIL-SIGNATURE-MODES | 2 modes nets + persist robuste + état partiel-bailleur | v13.04-05 |
| BAIL-CARTE-ACTIONS | Actions épurées + fix previewBail signed state + MIME Word | v13.06 |
| BAIL-MODIFIER-SIMPLIFIE | Retire Export Word + rename Acte garant → Aperçu garant | v13.07 |
| BAIL-WORKFLOW-LOCATAIRE | Workflow signature différée in-app | v13.08 |
| BAIL-DRIVE-PDF-SIGNE | Drive upload PDF signé automatique après wizard | v13.09 |
| BAIL-SNAPSHOT | Snapshot signé + Voir bail signé + highlight diff Aperçu | v13.10-11 |
| BUG-BAIL-003 | Multi-bailleurs : PDF rend N cadres signature (1 par bailleur) | v13.19 · commit eca0faa |
| BAIL-CARTE-MODIFIER-ACTIF | Modifier bail toujours actif même bilatéral signé | v13.20 · commit 78e706f |
| BAIL-HIGHLIGHTS-FIX | Backfill snapshot + locataires/garants + Voir signé honnête | v13.21 · commit 17101d6 |

### IRL — session 2026-04-29 (6 commits, v13.30 → v13.35)
| Code | Sujet | Note |
|---|---|---|
| BUG-IRL-001 | Lettre IRL : "date anniversaire" → "mois anniversaire" | v13.30 · commit 661d0e7 |
| IRL-DPE-FG | Pas de révision si DPE F/G + warning DPE manquant/expiré | v13.31 · commit 625638c · 4 surfaces |
| IRL-VALIDATION (v13.32 rejeté) | 1ère version dans popup lettre — rejetée par utilisateur | v13.32 · commit 458c05a · "encart vert s'imprime, on valide dans la lettre = bricolage" |
| IRL-VALIDATION (v13.33 final) | Refonte propre : enveloppe 3 états + boutons cohérents + popup mois anniversaire | v13.33 · commit 5207b70 · helpers `_irlLettreState` / `_irlEnvelopeBtn` / `_collectIRLRappels` / `_renderIRLRappelModal` · modal `#ov-irl-rappel` · cellule actions homogène + lettre PDF nettoyée |
| IRL-DESIGN-POLISH | Refonte design tableau IRL + responsive complet (PC/tablette/mobile) | v13.34 · commit 73cc3d2 · fix bugs colonnes décalées (10 cellules→9) sur DPE manquant/F-G/index manquant · badges unifiés `.irl-badge` + barre d'état colorée à gauche de chaque ligne · layout `.irl-calc-grid` 1024/900/600px · table-to-cards sur mobile (data-label sur tous les `<td>`) · boutons full-width tap-friendly sur mobile |
| BUG-IRL-RESET | Reset IRL ne restaurait pas le loyer (compound inflation à chaque cycle) | v13.35 · commit 01bf664 · `resetIRLApply` consulte `irlHistorique`, restaure `log.hc = entry.ancienHC` + retire l'entrée. Confirm dialog contextualisé. Gère apply / skipIRL / pas d'entrée trouvée |

### EDL — session avril 2026
| # | Code | Sujet | Note |
|---|---|---|---|
| 33 | EDL-PHOTOS-IDXDB | Photos IndexedDB + Drive auto-sync | `immotrack_photos` IDB |
| 34 | EDL-CPT-COMPARATIF | Comparatif compteurs entrée/sortie dans PDF | 2 colonnes systématiques |
| 35 | EDL-PDF-7COL | PDF 7 colonnes toujours (sortie vides + fond bleu) | format comparatif systématique |
| 36 | EDL-CPT-PHOTOS | Photos compteurs (1 par relevé, entrée + sortie) | 8 clés `compteursPhotos` |
| 37 | EDL-PHOTOS-SIZE | Photos max-height 120px, col commentaires réduite | éviter débordement |
| 39 | EDL-PARAPHES | Paraphes supprimés du PDF (signature unique en bas) | décret 2016-382 |
| 41 | IRL-LETTRE-REVISION | Lettre révision IRL : mentions légales art. 17-1 loi 89-462 | adresse, date bail, INSEE série 001515333, LRAR |

### Dashboard v2 — sessions avril 2026 (Phases 1-7 livrées)
| Code | Sujet | Note |
|---|---|---|
| DASH-V2-PHASE1-7 | Dashboard v2 — 7 phases livrées et validées | v12.27 + correctifs Progression annuelle v12.28-32 |
| DASH-V2-CHARTS | Composants `_mkSparkline`, `_mkMultiLineChart`, `_kpiBody`, `_kpiDelta` | en place |
| DASH-V2-DRILL | Drill-down entité/immeuble/logement avec sous-lignes par segment | v12.28-32 |
| DASH-V2-MARKERS | Markers verticaux "changement de bail" sur chart cumulatif | v12.28-32 |

---

## 📝 Remarques en attente de classement

> Espace libre pour les remarques que tu me dis dans le chat avant que je les classifie ailleurs.
> Ex : "le total quittance est faux quand TVA" → je l'ajoute ici si je ne sais pas où le ranger immédiatement.

(vide pour le moment)

---

## 📌 Décisions structurantes (journal)

### 2026-05-01 — Refonte vue Biens (parité Qalimo/BailFacile/Smovin) — v14.2
- Sidebar : nouvelle section **Patrimoine** entre Vue d'ensemble et Locataires (Biens + Bailleurs)
- Référentiel renommé en **Paramètres** (terme standard)
- Vue Biens en cartes (immeubles par défaut, toggle vers logements) avec toolbar complète (recherche/filtres/tri/export CSV) et tabs Actifs/Archivés
- Fiche bien dédiée full-page (route `#log-fiche-{ref}`, header + onglet Général en Phase 1, 5 sous-onglets stubbés pour Phase 2)
- Soft-delete réversible avec règle **bloque l'archivage tant qu'un bail est actif** (cohérence métier)
- Décisions par défaut prises faute de validation utilisateur en cours de session : Bailleurs en sidebar dédiée (Option A), Immeubles par défaut, route dédiée pour fiche 360, placeholder image en attendant LOG-PHOTOS
- Restant : LOG-PHOTOS (image principale réelle), LOG-FICHE-360 Phase 2 (sous-onglets riches Documents/EDL/Compta/Compteurs/Entretien)

### 2026-04-29 — Principe directeur : constance visuelle / design system
- Toute modification UI (formulaires, modales, tableaux, popups, lettres/PDF, dashboard) doit respecter le **design system** existant et **conserver la cohérence visuelle sur toutes les pages**
- Couleurs : variables CSS uniquement, pas de hex localisé · Typo + espacements cohérents · Mode sombre testé · Responsive 3 formats
- Si nouveau composant nécessaire → l'ajouter au design system, pas en one-shot
- Référence : mémoire `feedback_design_consistency.md`
- Sujet associé pour mise en cohérence globale rétroactive : `V3-VISUEL`

### 2026-04-28 — Vue par onglet pour pilotage
- Ajout d'une section "📑 Vue par onglet" en tête de BACKLOG → permet de travailler onglet par onglet (1 session = 1 onglet, tous sujets traités d'un coup)
- TodoWrite réorganisée par onglet en mode pilotage

### 2026-04-28 — IRL : gel pour DPE F/G (loi Climat 2021)
- IRL-DPE-FG ajouté : pas de révision possible si bail en DPE F ou G (loi 2021-1104, art. 23, applicable depuis le 24/08/2022)
- Bloque la révision dur (pas d'override) car la loi est claire ; doit s'appliquer même aux baux antérieurs

### 2026-04-28 — Migration depuis concurrents
- IMPORT-CONCURRENTS : sujet onboarding clé pour la commercialisation
- Approche : template ImmoTrack standard + mappers par concurrent (Rentila, BailFacile, Qalimo, ImmobilierLoyer, Smovin, etc.)
- CDC requis : choisir top 3 concurrents prioritaires

### 2026-04-28 — 18 remarques utilisateur classées
- Bugs P0/P1 : BUG-IRL-001, BUG-CHARGE-001, BUG-DASH-001, BUG-BAIL-002, IRL-VALIDATION
- Features P2 : DASH-KPI-HC, MVT-SCIND-CAT, MVT-RECURRENT, MRH-AUTO-LOC, ENT-SAVE-IMM, DOC-CIVILITE, ASSO-PARTAGE, DOC-PJ, TRAV-SUIVI, CHARGE-REGLES
- Petits P3 : BAIL-A-ECHOIR, MVT-SCIND-LIMIT, LOG-DG-LABEL

### 2026-04-28 — Système de pilotage backlog
- Ce fichier `BACKLOG.md` + `docs/subjects/*.md` + mémoire `project_pilotage.md`
- Slash command `/pilotage` pour démarrer/reprendre toute session
- Workflow : tout passe par le chat Claude, jamais d'édition manuelle MD

### 2026-04-28 — Architecture Drive sync
- Choix : 1 fichier global + N entity files (par-entité)
- **Décision V1 commercial** : le fichier global SERA DÉCOUPÉ (DRIVE-2H) en `user-{userId}.json` + `entity-{entityId}-shared.json` + `global-ref.json`

### 2026-04-26 — Génération PDF Bail natif
- Choix : pdf.text/pdf.rect natif (pas html2canvas) avec emplacements vides locataire pour Acrobat
- Plan en 3 sessions ~10h
- Référence : `project_bail_pdf_native.md`

### 2026-04-26 — V3 transition (3 étapes séquentielles)
- **Étape 1** : Audit global (sécu, perf, code quality)
- **Étape 2** : V3 visuelle harmonisée (toutes pages, structure inchangée) ← "design"
- **Étape 3** : Refonte fonctionnelle onglet par onglet (priorité Bail)

### 2026-04-25 — Types de bail
- 5 types à ajouter : meublé, garage, mobilité, étudiant, Autre
- 5 phases A-E · DG par type validé (Q4) · phasing par-phase 1 commit + retest
- Référence : `project_bail_types.md`

### 2026-04-27 — Pas de solution passable
- Règle non négociable : refonte complète plutôt que compromis temporaire, planifier en session dédiée si trop gros
- Référence : mémoire `feedback_no_compromise.md`
