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

## 🔥 Sprint email UX & cache PWA (insert 2026-05-18, P0 dans le marathon)

> **Découvert pendant test v15.84** : la modale email envoie bien via Gmail API MAIS :
> 1. **PDF non attaché auto** (PJ « à joindre manuellement » dans la modale)
> 2. **UX modale dégueu** (overflow mobile, hiérarchie boutons cassée, pas d'aff. FROM)
> 3. **Service Worker cache les modules JS** sans invalidation → user voit ancien `email-modal.js`
> 4. **Templates non personnalisables** + civilité non reprise du bail
>
> **Décision user 2026-05-18** : « on enregistre tout ça pour un sprint ». Sprint à insérer **avant 19C** car cache SW = bloquant pour livraison de toutes les futures fixes.
>
> | Lot | Sujet | Prio | Taille | Statut |
> |---|---|---|---|---|
> | EM-1 | [BUG-SW-CACHE-JS](docs/subjects/BUG-SW-CACHE-JS.md) — fix cache SW (bumper CACHE_VER + network-first pour JS) | **P0** | XS | ✅ Livré v15.85 |
> | EM-2a | [EMAIL-MODAL-UX-REFONTE](docs/subjects/EMAIL-MODAL-UX-REFONTE.md) — refonte HTML modale variant A (FROM bar + PJ card + note légale repliable + footer 2 rangs mobile) | P1 | M | ✅ Livré v15.86 |
> | EM-2b | [EMAIL-MODAL-UX-REFONTE](docs/subjects/EMAIL-MODAL-UX-REFONTE.md) — PJ PDF auto-générée (quittance + IRL V1.0) | P1 | M | ✅ Livré v15.87 + fix lazy load jsPDF v15.88 |
> | EM-2c | PJ auto types restants (régul + bail + EDL ent/sort + cautionnement) | P2 | M | ✅ Livré v15.89 (5 nouveaux types) |
> | EM-2d | Refonte PJ quittance avec rendu officiel (html2canvas du `_buildQuittanceHtml`) | P1 | M | ✅ Livré v15.91 → étendu IRL v15.111 + décompte v15.113. **Bail signé / EDL ent-sort / Cautionnement** restent en text-natif jsPDF sobre (à embellir V1.x si besoin user) |
> | BUG-QUITTANCE-PRORATA | Quittance entrée/sortie mi-mois marquée "Reçu partiel" alors que paiement prorata correct (loi 89-462) | P1 | XS | ✅ Livré v15.94 + fix robustesse v15.95 |
> | EM-2e | Quittance redesign visuel (3 mockups A/B/C v3 dont C-Qonto) | P1 | S | 🚫 **Abandonné** — user a rejeté toutes variantes Qonto (« tu modifies les documents »). Rendu officiel Times NR restauré v15.102. Mockups conservés dans `mockups/quittance-redesign/` pour historique. |
> | EM-2f | Bug pagination multi-page PJ PDF (overlap massif quittance/IRL/décompte sur 2 pages) | P1 | XS | ✅ Livré v15.110 (algo position page N corrigé) |
> | EM-2g | Embellir PJ bail signé / EDL ent-sort / Cautionnement (passer en HTML + html2canvas si user le souhaite) | P3 | S | ⬜ Reporté V1.x — user 2026-05-19 « on a perdu trop de temps, on fera plus tard ». Text-natif jsPDF acceptable en V1. |
> | BUG-IRL-INVALID-DATE | Corps de mail IRL affichait « Application : à compter du mois de Invalid Date » (rev.dateRevision déjà Date object) | P1 | XS | ✅ Livré v15.112 |
> | EM-5 | [EMAIL-FROM-PAR-ENTITE](docs/subjects/EMAIL-FROM-PAR-ENTITE.md) — envoyer depuis l'adresse de l'entité (send-as Gmail aliases) | P1 | S | ✅ Livré v15.92 + fix popup + auto-CC v15.93 |
> | EM-3 | [DOC-CIVILITE](docs/subjects/DOC-CIVILITE.md) — civilité dynamique dans templates (M./Mme du bail) | P2 | XS | ✅ Livré v15.90 |
> | EM-4 | [TEMPLATES-EMAILS-PARAMS](docs/subjects/TEMPLATES-EMAILS-PARAMS.md) — éditeur templates dans Paramètres | P2 | M-L | ⬜ À faire (post EM-2) |

---

## 🔥 Marathon V1 propre — Sprint 19 + 20 (décision 2026-05-16 : Drive avant partage)

> **12 lots indépendants · 24-35h total · prompts détaillés clé en main** :
> **[docs/strategie/SPRINT-19-20-MARATHON-V1-PROPRE-PROMPTS.md](docs/strategie/SPRINT-19-20-MARATHON-V1-PROPRE-PROMPTS.md)** 👈 fichier maître
>
> **Décision user 2026-05-16** : finir bugs UX visibles (Sprint 19) PUIS fondations Drive solides (Sprint 20) AVANT le partage granulaire V1. Pas de patch vite fait sur fondations bancales.
>
> **Ordre strict** : 19A → 19I (UI bugs) → 20A → 20C (Drive solide) → Sprint 21 PARTAGE-GRANULAIRE V1 (~6-8h, à spec'er ensuite)
>
> | Lot | Sujet | Prio | Taille | Statut |
> |---|---|---|---|---|
> | 19A | BUG-IRL-APERCU-LETTRE-V15 | P1 | S | ✅ Livré v15.74 + v15.75 |
> | 19B | EMAIL-ONGLET-PERMANENT | P1 | S | ✅ Livré v15.79 |
> | 19C | BUG-EQUIP-INTERV-FEEDBACK | P1 | S | ✅ Livré v15.164 |
> | 19D | V3-REFONTE-NAV-ONGLETS (Loyers→Mouvements + décisions) | P1 | M | ⬜ À faire |
> | 19E | V3-REFONTE-IMPORTS-UI (3 sous-tabs) | P1 | M | ⬜ À faire |
> | 19F | IRL-RAPPEL-MAJ-INSEE | P2 | S | ⬜ À faire |
> | 19G | V3-REFONTE-ASSURANCES (cards) | P2 | M | ⬜ À faire |
> | 19H | V3-REFONTE-EDL-CARDS | P2 | M | ⬜ À faire |
> | 19I | V3-REFONTE-PARAMS-AUDIT (input user requis) | P2 | S | ⬜ À faire |

---

## 📑 Vue par onglet (pour travailler onglet par onglet)

> Permet de regrouper tous les sujets d'un même onglet pour les traiter en une session.
> Codes triés par priorité décroissante au sein de chaque onglet.

| Onglet | Codes (prio) |
|---|---|
| 📊 **Dashboard** | DASH-PROFILES ⏳ (P1, Phase 1 v2 livrée — 4 onglets, attente validation finale) · BUG-DASH-001 (P1) · BUG-DASH-SPARK-COLOR ✅ v15.49 (cash-flow vert/rouge par segment) · DASH-KPI-HC (P2) — *DASH-REFONTE-GLOBALE-V4 ✅ Livré sandbox v15.36 (CP1-4, attente validation user pour propagation prod) · DASH-V2 ✅ fusionné dans DASH-REFONTE-GLOBALE-V4* |
| 📜 **Bail** | BAIL-CHARGES-DETAIL (P1) · V3-REFONTE-BAIL 🔄 (P2) · BAIL-CLAUSES-PERSO (P2) · BAIL-TYPES (P2) · BAIL-PARAPHE-PLACEHOLDER (P3) · BAIL-NAMESPACE-MIGRATION (P3) |
| 🏢 **Logement / Équipement** | **BUG-LOCATAIRE-CONCAT ✅ Code fixé v15.115 (P0, corruption nom multi-locataires stoppée — réparation données manuelle à faire user)** · LOG-CANDIDATS (P1, pipeline lien partagé) · **FICHES-PARITE-360 🔥 (P1, ~27h)** · LOG-FICHE-360 🔄 (P1, Phase 2) · BUG-LOG-001 (P2) · BUG-EQUIP-FILTER (P2) · BUG-HC-GARDE-FOU (P2) · V3-REFONTE-EQUIP (P2) · LOG-PHOTOS (P2) · LOG-ANNONCE ✨ (P2, enrichi 2026-05-15 mode "qui fait rêver" type Leboncoin) · LOG-DG-LABEL (P3) — *NAV-RESTRUCTURE + LOG-LISTE-CARDS + LOG-ARCHIVE livrés v14.2 ✅ · LOG-FICHE-360 Bloc A livré v14.13 ✅ · BAILLEUR-DIAGNOSTICS-DDT ✅ Livré v15.05+v15.06 (Sprint 7+7B) · EQUIP-CONTROLES-PERIODIQUES ✅ Livré v15.08 (Sprint 9, 6 phases)* |
| 🏛️ **Entité / Immeuble** | PARAM-BAILLEUR-AUTOMATISATIONS (P1) · IMM-FICHE-SOUS-ONGLETS (P2) · BAILLEUR-FORM-RICHE (P2) · ENT-SAVE-IMM (P2) — *BUG-ENT-RENAME-CASCADE livré v14.51 ✅ · BUG-ENT-ORPHANS-CLEANUP livré v14.52-53 ✅* |
| 💰 **Mouvements** | V3-REFONTE-LOYERS (P2) · MVT-SCIND-CAT (P2) · MVT-RECURRENT (P2) · MVT-SCIND-LIMIT (P3) |
| 🧾 **Quittances** | V3-REFONTE-QUIT (P2) · QUIT-EMAIL (P2) · AVIS-ECHEANCE (P2) · RAPPEL-IMPAYE (P2) — *EMAIL-AUTO ✅ Livré sandbox v14.97 (3 cas intégrés : quittance + IRL + régul)* |
| ⚡ **Charges / Régul** | BUG-CHARGE-001 (P1) · V3-REFONTE-REGUL (P2) · CHARGE-REGLES (P2) |
| 📈 **IRL** | V3-REFONTE-IRL (P2) — *BUG-IRL-001 + IRL-VALIDATION + IRL-DPE-FG livrés v13.30/31/33 ✅* |
| 📋 **EDL** | EDL-VALIDATION-AVOCAT (P1) · EDL-TEMPLATE-PER-LOG (P2, ~6h) · EDL-DELEGUE-EXPORT (P2) · EDL-DELEGUE-IMPORT (P2) |
| 🛡️ **MRH** | MRH-AUTO-LOC (P2) |
| 🔧 **Travaux / Entretien / PJ** | DOC-PJ (P2) · TRAV-SUIVI (P2) |
| 🤝 **Associés** | ASSO-PARTAGE (P2) |
| ⚙️ **Architecture / V3 / Sécu** | AUDIT-GLOBAL 🔄 (P1, élargi audit+nettoyage+modularité) · ARCHI-MODULAR (P1, en attente AUDIT) · SECU-INNERHTML (P1) · ARCHI-DB-DOUBLONS (P1) ⏳ · V3-VISUEL (P2) · BUG-UI-DARK-MODAL (P2) · V3-REFONTE-PARAMS (P2) — *USER-PROFILE-FILTERS ✅ Livré v15.04 (Sprint 6 V1.1) · PILOTAGE-MATRICIEL ✅ Livré v15.07 (Sprint 8) · BANK-INTEGRATION V1 ✅ Livré v15.07* |
| 💾 **Drive sync** | **DRIVE-CONFIANCE-UX ✅ Résolu v15.114→134 (P0)** : 9 bugs boucle/perte (B v114 · offline-first A0 v116 · timeout v117 · boucle save v118 · boucle pull v120-121 · re-stamp signature v122 · ping-pong onglets v123 · boucle pull→push v124 · spam toast v125 · migration idempotente v127) **+ page de connexion plein écran** (design confiance v129 · polices app v130 · affichée avant dashboard v131 · pas de flash pendant connexion v132 · **boot gate anti-flash accueil v133** · **A5 aide diagnostic VPN/Opera v134**). *Panneau "État Drive" (C) ✅ couvert par l'existant (FAB statut live + Paramètres Stockage Drive + Export restaurer) — non reconstruit. Thème sombre page connexion écarté (choix A).* · DRIVE-ARBORESCENCE 🔄 (P1) · DRIVE-2H (P1) · DRIVE-2F (P1) · DRIVE-2G (P1) · DRIVE-2K ⚠️ englobé (P2) · DRIVE-2I (P2) · DRIVE-2J (P3) |
| 🏛️ **Légal / Fiscal** | LEGAL-2044 (P1) · LEGAL-BILAN-ANNUEL (P1) · LEGAL-2072 (P3) — *LEGAL-DPE-INTERDICTION-LOCATION ✅ Livré v15.05 (Sprint 7) : blocage strict bail si DPE interdit loi Climat 2021* |
| 📥 **Import** | IMPORT-EXCEL-LOG (P2) · IMPORT-CONCURRENTS (P2) |
| 🌐 **Agence / SaaS** | AGENCE-GESTION (P3) · AGENCE-CRG (P3) · AGENCE-HONORAIRES (P3) · SIGN-EIDAS (P3) · PORTAIL-LOC (P3) · SAAS-MULTIUSERS (P3) · **SAAS-PRICING-TIERS (P2, ~3-5h)** — *gating modules par abonnement, build sur l'infra USER-PROFILE-FILTERS livrée v15.04* |
| 🤖 **IA / Pro Connect V2** | **IA-V2 🔮 (V2 post-commercialisation, ~15-25h)** — *opt-in payant Pro Connect ~5€/mois · 5 use cases prioritaires : OCR DPE/diagnostics · OCR factures travaux · OCR justifs candidat · annonce LLM-generated · classification auto Drive · 4 secondaires V2.5 · 5 écartés (conseil fiscal/analyse EDL/prédiction loyer = risque juridique). Pas en V1.1 (zéro coût récurrent)* |
| 📈 **Stratégie / Business** | FOUNDER-EDITION (P1) · WATCH-LOCATAIRELIVE 🔄 (P2) · OUTILS-SEO-GRATUITS (P2) · IA-COPILOTE (P2) · VEILLE-QALIMO-V2 (P2) · BIZPLAN-V2 🔄 (P2) — *BIZPLAN-STRATEGIE ✅ Livré 2026-04-30 (5 docs `docs/strategie/`)* |
| 📱 **Mobile / PWA / Offline** | BUG-MOBILE-MENU-PLUS ✅ v15.142 (bottom-sheet) · BUG-MOBILE-DASH-PROFILES ✅ v15.140 · **MOBILE-AUDIT-ONGLETS ✅ CLÔTURÉ v15.140-148** (audit 375px : 0 overflow · touch targets ≥40px · affordance scroll · toutes tables denses en cartes : Loyers, Pilotage ×3, Assurances) · MOBILE-PWA-OFFLINE (P2) |

---

## 🎯 Vision produit V1 commerciale (audit 2026-05-07)

> **ImmoTrack = SaaS universel de gestion immobilière** — cible : particulier solo + gestionnaire pro. Tout statut juridique (particulier / SCI / SAS / LMP/LMNP / mandataire Hoguet). Toute pratique comptable (autonome / Excel / logiciel pro / expert-comptable).

### 🚫 Règle UX non négociable — Pas de jargon ni d'acronyme dans l'UI
**Captée 2026-05-14 (Sprint 9, après livraison BAILLEUR-DIAGNOSTICS-DDT v15.05-v15.06)** :
> 💬 « c'est quoi DDT ? si je ne sais pas ça ne sera pas clair dans app non plus. pas mettre de raccourci comme ça »

**Règle** : aucun acronyme métier dans les libellés UI **visibles** au bailleur particulier solo. Le terme complet en français courant doit toujours être utilisé. Acronymes uniquement tolérés :
- Dans le **bail signé / PDF juridique** (où c'est cité par la loi, ex `Dossier de Diagnostic Technique (DDT)` art. 3-3 loi 89-462) — le terme complet + abréviation = pratique standard juridique
- Dans le **code interne** (commentaires JS, codes de sujet `BAILLEUR-DIAGNOSTICS-DDT`)

Liste vivante des termes complets à utiliser dans l'UI :
| À éviter | À utiliser dans l'UI |
|---|---|
| DDT | « Diagnostics » / « Dossier de diagnostic technique » |
| DPE F/G | « DPE classé F ou G » |
| MRH | « Assurance habitation » (locataire) / « PNO » → « Assurance propriétaire non occupant » |
| EDL | « État des lieux » |
| CRG | « Compte rendu de gérance » |
| CREP | « Constat de risque d'exposition au plomb » |
| SCI / SAS | OK (statuts juridiques courants) |
| IRL | OK (terme contractuel cité dans bail) |

Fix v15.08 : tous les libellés DDT visibles user → « Diagnostics » / « Dossier de diagnostic technique » en clair.

### Roadmap par phase

| Phase | Contenu | Coût | Bloqueur ? |
|---|---|---|---|
| **V1.0** | Charges récup + reporting bailleur + 2044 (en cours v14.61-65) | ~10h | Tous |
| **V1.1** | Gestion pro indispensable (mandat + CRG + FEC + audit + DG + impayés + RGPD) | ~30h | Pro Hoguet, V1 commerciale |
| **V1.2** | Compléments sectoriels (TVA / amortissement / encadrement loyer / sinistres / travaux) | ~20h | Selon profils |
| **V2** | SaaS multi-utilisateurs (rôles + portail bailleur + portail locataire + notifs) | ~45h | Refonte data model |
| **V3** | Différenciants premium (OCR / comparateur / signature eIDAS) | ~25h | Nice-to-have |

### V1.0 — En cours (charges + reporting bailleur + 2044)

| # | Code | Sujet | Coût | Statut |
|---|---|---|---|---|
| 1 | CHARGES-COMMUNES Phase 1 | Compteurs collectifs immeuble + saisie + tableau quote-part | 3h | ✅ v14.59 |
| 2 | CHARGES-COMMUNES Phase 1.5 | Single source DB.mouvements + lien mv.compteurCcId | 1h | ✅ v14.60 |
| 3 | CHARGES-COMMUNES Phase 2 | Modélisation 5 cas + part bailleur + scope/composition/fallback | 1h30 | 🔄 v14.61 |
| 4 | CHARGES-COMMUNES Phase 3 | Régul enrichie + card part bailleur + PDF récap loi 1989 | 2h30 | ⬜ v14.62-63 |
| 5 | REPORTING-BAILLEUR | Sous-onglet Compta globale + vue mensuelle + CSV | 3h | ⬜ v14.64 |
| 6 | LEGAL-2044 | Wizard 2044 + mapping catégories → lignes + PDF | 3-4h | ⬜ v14.65 |

### V1.1 — Gestion pro (~30h, ordre par dépendance)

| # | Code | Sujet | Coût | Prio | Bloqueur |
|---|---|---|---|---|---|
| 0 | **EMAIL-SMTP-CONNECT** | Envoi direct d'emails depuis l'app via Gmail API OAuth (leverage OAuth Drive existant). Fallback `mailto:` pour non-Google. Phase 2 Microsoft Graph V1.2 | ~6-8h | **P1** | OAuth Drive existant (v13.41), vérification Google Console scope `gmail.send` (~2-6 sem) · [docs/subjects/EMAIL-SMTP-CONNECT.md](docs/subjects/EMAIL-SMTP-CONNECT.md) · différenciant marché (envoi depuis adresse du bailleur, pas `noreply@`) |
| 0.b | **AUDIT-EMAIL-FLOW-COMPLET** | Audit transverse post v15.80 — bug user « aucun bouton ne fonctionne dans la modale » + régression bouton 📧 fiche bail (retiré v15.16) | ~1h | **P1** | [docs/subjects/AUDIT-EMAIL-FLOW-COMPLET.md](docs/subjects/AUDIT-EMAIL-FLOW-COMPLET.md) · diagnostic cache SW vs régression code · inventaire 6 points d'entrée email · décision : remettre bouton 📧 fiche bail v15.81 |
| 0.c | **SIGN-BAIL-LIEN** | Signature électronique du bail aller-retour locataire (Yousign Free 3 sig/mois gratuit). Différenciant majeur vs Rentila/BailFacile/Qalimo payants | ~12-15h | **P1** | [docs/subjects/SIGN-BAIL-LIEN.md](docs/subjects/SIGN-BAIL-LIEN.md) · 4 phases : module Yousign + UI bail + email locataire + récup signé Drive · eIDAS Simple (suffisant bail habitation loi 89-462) |
| 1 | **AUDIT-TRAIL** | Journal modifications (qui/quand/quoi) | ✅ Livré v14.89 (Sprint 3A) | 🔥 P0 | `js/core/audit-trail.js` (5820 B, 5 exports + tests Vitest 30 tests). Hook dans `saveDB` via `_auditFlushPending()`. Entries auto sur `saveBail/delBail/saveEnt/delEnt/saveParamLog/delLog/saveMv`. `DB.auditTrail` array avec cap soft 10k entrées (prune oldest 5000). Sync Drive auto via payload standard. UI Paramètres "Journal d'activité" reportée Sprint 4 polish (données déjà exportables programmatiquement via `_auditToCsv`). |
| 2 | **GESTION-MANDAT** | Mandat de gestion + honoraires + reversement bailleur | 5h | 🔥 P0 | Hoguet (carte T) — **Reporté V1.1** (UX complexe : signature mandat + revoiur honoraires + interaction CRG mensuel) |
| 3 | **GESTION-CRG** | Compte Rendu de Gestion automatisé (PDF + Drive) | 6h | 🔥 P0 | Réglementaire mandataire — **Reporté V1.1** (le Bilan annuel v14.92 fournit déjà le récap annuel) |
| 4 | **EXPORT-COMPTABLE** | FEC + journal + grand livre (formats Sage/EBP/Quadra) | ✅ Livré v14.93 (Sprint 3E) | 🔥 P0 | `js/core/export-comptable.js` (9 KB, 5 exports : `_buildEcritures`, `_buildGrandLivre`, `_toFEC`, `_journalToCsv`, `_grandLivreToCsv`). Mapping comptes 706000/411000/615200/616000/622000/635110/661100/etc. sur catégories LEGAL-2044. **FEC format DGFiP** : 18 colonnes tab-séparé conforme arrêté 29 juillet 2013. **Journal général + grand livre** : CSV avec solde progressif + totaux. UI dans p-export : 3 boutons (FEC / journal / grand livre). 20 tests Vitest (partie double équilibre débit=crédit, mapping comptes, format FEC YYYYMMDD + virgule décimale FR, escape tab/newline). |
| 5 | **GESTION-DG** | Suivi caution / restitution / retenues justifiées | 3h | P1 | Légal (1m/2m délai) |
| 6 | **GESTION-IMPAYE** | Pré-contentieux : mise en demeure + commandement de payer | 4h | P1 | Business critical |
| 7 | **RGPD-COMPLIANCE** | Registre traitement + durée conservation + droit oubli | ✅ Livré v14.91 (Sprint 3D) | 🔥 P0 | `docs/legal/RGPD-REGISTRE.md` (registre art. 30 RGPD avec 4 traitements documentés + droits art. 15-22) + `docs/legal/DPA-GOOGLE-DRIVE.md` (analyse sous-traitant). `js/core/rgpd.js` (9 KB, 4 exports : `_findPersonalDataForRef`, `_generateGdprExport`, `_planErasure`, `_isEraseEligible`). UI dans p-export : carte "🔒 RGPD" avec sélecteur logement + 3 boutons (rapport données art. 15 / export portabilité art. 20 / plan effacement art. 17). 18 tests Vitest. Politique prescription civile 3 ans appliquée à `_isEraseEligible`. **Exécution effective de l'effacement** reportée V1.1 (nécessite UX double-confirm + cascade audit). |

### V1.2 — Compléments sectoriels (~20h)

| # | Code | Sujet | Coût | Profil concerné |
|---|---|---|---|---|
| 1 | GESTION-TVA | Régime BIC / meublé pro / paramétrage TVA | 5h | SCI IS, LMP, commercial |
| 2 | AMORTISSEMENT-LMNP | Table amortissement + dotations annuelles | 4h | LMNP/LMP |
| 3 | ENCADREMENT-LOYER | Vérif au bail (zones tendues : Paris/Lille/Bordeaux/etc.) | 3h | Zones tendues |
| 4 | GESTION-SINISTRE | Déclaration → suivi → indemnisation | 3h | Tous |
| 5 | GESTION-TRAVAUX | Workflow devis → ordre → facture → contrôle | 5h | Gestionnaires actifs |

### V2 — SaaS multi-utilisateurs (~45h)

| # | Code | Sujet | Coût |
|---|---|---|---|
| 1 | MULTI-USER | Rôles (admin/gestionnaire/bailleur/locataire) + permissions + cloisonnement | 15h |
| 2 | PORTAIL-BAILLEUR | Lecture seule + emails auto + CRG en ligne | 10h |
| 3 | PORTAIL-LOCATAIRE | Quittances en ligne + paiement Stripe/SEPA | 15h |
| 4 | NOTIFICATIONS | Email/SMS auto (échéances, IRL, CRG) | 5h |

### V3 — Différenciants premium (~25h)

| # | Code | Sujet | Coût |
|---|---|---|---|
| 1 | OCR-FACTURE | Extraction auto montant/date depuis PDF/photo | 5h |
| 2 | COMPARATEUR-LOYER | Benchmark zone (data SeLoger/Pap) | 6h |
| 3 | PORTAIL-VISITE | Agenda visites + pré-dossier locataire | 8h |
| 4 | SIGN-EIDAS | Signature électronique conforme bail (loi Hamon) | 5h |

---

## 🔥 Priorité immédiate — bugs critiques

> **🚨 2 chantiers de fond bloquants pour V1 commerciale (à attaquer en sessions dédiées)** :
> - **ARCHI-DB-DOUBLONS** (P1, ~12-15h) — refonte structurelle séparation log (bien) / bail (contrat). [docs/subjects/ARCHI-DB-DOUBLONS.md](docs/subjects/ARCHI-DB-DOUBLONS.md). Phase 1 CDC à attaquer en premier (~2h, dialogue décisions UX).
> - **FICHES-PARITE-360** (P1, ~27h) — parité totale onglets ↔ fiches 360° (logement, immeuble, bailleur). [docs/subjects/FICHES-PARITE-360.md](docs/subjects/FICHES-PARITE-360.md). 8 sessions phasées par ROI.
>
> **Ordre obligatoire** : ARCHI-DB-DOUBLONS Phases 1+2 livré AVANT de démarrer FICHES-PARITE-360, sinon double refacto sur les helpers `_renderXForLog(ref)`.

| Code | Sujet | Prio | Taille | Statut | Détail |
|---|---|---|---|---|---|
| DASH-REFONTE-GLOBALE-V4 | **🔥 Refonte visuelle globale dashboard + sidebar + audit dark 14 onglets** (V4 Stripe narrative) | P1 | XL | 🔄 En cours (session dédiée) | [docs/subjects/DASH-REFONTE-GLOBALE-V4.md](docs/subjects/DASH-REFONTE-GLOBALE-V4.md) · décision user 2026-05-15 d'abandonner le sprint-par-sprint pour refonte en bloc · 4 checkpoints visuels (CP1 fondations+sidebar+dédupli bandeau · CP2 cockpit Hero V4 · CP3 cash-flow Bloomberg + 5 KPIs sparklines · CP4 dash-ent-cards + audit dark 14 onglets + responsive 3 formats) · sandbox v15.36 · fusionne Phase B Étape A (v15.33) + Sprint 1 bandeau (v15.35) qui étaient des livraisons hybrides moches |
| BUG-IRL-001 | Lettre IRL : "date anniversaire du bail" est faux, c'est le mois | P0 | XS | ✅ Livré v13.30 | commit 661d0e7 · "date anniversaire, soit le 15 juin 2026" → "mois anniversaire (juin 2026)" + helper _dfm |
| BUG-CHARGE-001 | Régularisation des charges ne fonctionne pas | P1 | M | ✅ Livré v14.82 + résiduel v15.04 (Sprint 6) | **Cause racine** : `computeRegul` filtrait `m.cat==='Loyers'`/`'Charges'` strict (legacy v14.59). Avec v14.78 LEGAL-2044, l'utilisateur tagge `'Loyers encaissés'`, `'Provisions pour charges de copropriété'` → plus aucun match → provisions = 0, charges = 0, solde faux. **Fix v14.82** : helpers `_isLoyerCategory` / `_isChargeRecupCategory` qui matchent legacy + LEGAL-2044 (211 recettes + 229/230 charges récup). 12 sites supplémentaires mis à jour (dashboard widgets, KPI, quittances, alertes). **Tests Vitest** : 19 nouveaux dans `__tests__/helpers/charges.test.js` (compat legacy + modern + mix). **Résiduel v15.04** : 6 sites supplémentaires détectés par audit Explore (`_buildRevDrill` l.5627, `_getLogementStartIso` l.5771, `_buildProgDrill` l.5892, `_buildRdtDrill` l.6542, KPI Immeuble l.7281, sparkline rendement l.7343) → grep final = 0 occurrence résiduelle. |
| BUG-DASH-SPARK-COLOR | **Régression V4** : sparklines/aires du dashboard restent vertes même quand valeurs négatives. Avant V4 : couleur dynamique vert si positif / rouge si négatif. | P2 | S | ✅ Livré v15.49 (cash-flow uniquement) | `sumSeries12 >= 0 ? --pos : --neg` appliqué dans `_renderDashV4Premium` cash-flow sparkline (stroke + gradient + lastPt). Mag/Rdt/DG sparklines restent neutres (CTA) car always positifs en pratique. |
| BUG-DASH-001 | Dashboard : prendre les baux en vigueur dans le mois choisi | P1 | M | ✅ Phase 1+2 v14.83 + résiduel v15.04 (Sprint 6) | **Helpers temporels** `_bailEstActifAt`, `_loyerHCAtDate`, `_chargesAtDate` ajoutés dans index-test.html (ligne 5985) — adaptés au schéma réel `DB.irlHistorique` (pas `bail.revisions[]`). **Test Vitest** `dashboard-temporel.test.js` : 19 tests (5 scénarios complets dont le cas user "mai 2024 vs fév 2025"). **Application** dashboard : refonte `_getActiveBailHcCh` qui consultait `bail.hc` brut (montant courant post-révisions IRL) → utilise désormais `_loyerHCAtDate` pour bail courant + monthIso passé. Dimension 1 (baux par période) déjà gérée via `_getAllBailsForLog`. **Résiduel v15.04** : fix de `_buildProgDrill` (l.5892) qui faisait encore `m.cat !== 'Loyers'` → couvert par la conversion `_isLoyerCategory` du Sprint 6. **Phase 3 optionnelle** : refacto complet rDash/buildDashWidget reportée à Sprint 2A (refacto fns monstres 892 lignes). |
| BUG-BAIL-002 | Bail : seule la 1re signature garant apparaît si 2 garants | P1 | S | ✅ Obsolète 2026-04-29 | [docs/subjects/BUG-BAIL-002.md](docs/subjects/BUG-BAIL-002.md) · vérifié par utilisateur : 2 actes cautionnement bien générés (1 par garant) avec page-break + sig dédiée. Bug résolu par refonte UI dynamique garants. |
| BUG-BAIL-003 | Bail multi-bailleurs : 2e signature bailleur capturée mais absente du PDF | P1 | XS | ✅ Livré v13.19 | [docs/subjects/BUG-BAIL-003.md](docs/subjects/BUG-BAIL-003.md) · commit eca0faa · ✅ testé OK 2026-04-29 (bail Ferrette ARSLAN/HARNIST 2 sigs visibles) |
| BUG-BAIL-PARAPHES-MULTI | Bail multi-bailleurs/locataires : 1 seul paraphe sur N signataires dans footer PDF | P1 | XS | ✅ Livré v13.36 | commit 36f20e2 · `drawParaphesFooter` accepte arrays · genPDFNative collecte en arrays par sig.id · helper `drawCol` trace N sous-cadres côte à côte (label pluriel si N>1) · sigs finales déjà OK (it. par sig.id) |
| BUG-DRIVE-OVERWRITE | **P0 perte de données** : signature bail offline écrasée silencieusement par sync Drive | P0 | S | ✅ Livré v13.38 | commit c6980dc · Cause : wizard signature popup écrivait `bail.signatures = sigData` sans `_stamp(bail)` → `_modifiedAt` non MAJ → `_drvWins` faisait gagner Drive → signature wiped + push DB sans sig = perte définitive. **3 fixes** : (1) stamp dans wizard 2 paths · (2) protection signature au merge `_mergeEntityPayload` (jamais d'écrasement silencieux d'une sig locale par un Drive sans sig) · (3) alerte utilisateur via `_driveSigProtected` + bouton "Restaurer backup" dans toast conflit |
| BUG-DRIVE-DISCONNECT | **P0 sauvegarde silencieusement perdue** : token Drive expire à 1h sans alerte | P0 | M | ✅ Livré v13.41 | commit d616669 · OAuth GIS browser-only n'a pas de refresh token. **5 leviers** : (A) refresh proactif T-5min via `_scheduleProactiveTokenRefresh` · (B) refresh à `visibilitychange` au retour de tab · (C) modale obligatoire `#ov-drive-disconnected` avec NB modifs en attente + bouton reconnecter + warning risque · (D) FAB rouge clignotant `@keyframes drive-fab-pulse` quand expiré · (E) silent re-grant au startup si `_driveLastSync` existe. Reprompt 5min après "Plus tard". 9 triggers de modale documentés. |
| IRL-VALIDATION | IRL : enveloppe couleur + valider envoi + valider IRL + popup mois anniversaire | P1 | M | ✅ Livré v13.33 | refonte v13.33 (v13.32 rejeté : encart dans lettre = bricolage). Enveloppe 3 états (gris/orange/rouge/vert) dans cellule actions + boutons "Valider envoi" et "💶 Valider IRL" cohérents tous états + popup `#ov-irl-rappel` mois anniversaire (login 1×/jour + ouverture onglet IRL 1×/session) + dashboard alerts enrichies + lettre PDF nettoyée (zéro encart validation) |
| IRL-DPE-FG | IRL : pas de révision si bail en DPE F ou G (loi Climat 2021) | P1 | S | ✅ Livré v13.31 | commit 625638c · 4 surfaces (computeIRLRevision + rIRL + genIRLLetter + applyIRL) · DPE F/G bloque dur, DPE manquant alerte popup, DPE >10 ans warning |
| BUG-PJ-LOCALSTORAGE | **PJ mouvements gonflent localStorage** (quota 5-10 Mo) | **P1** | M | ✅ Livré v14.99 (Sprint 5A) | **Architecture 3 tiers unifiée** : localStorage (métadonnées `DB.documents[]`) + IndexedDB (binaire idbKey) + Drive (canonique). Module `js/core/attachments.js` (4.5 KB, 7 exports). Helpers inline : `_attachmentSaveForMouvement`, `_drvUploadAttachmentBackground` (fire&forget), `_mvPjResolve`, `_migratePjMouvementsToAttachments` (auto boot, idempotent). `saveMv` async + tombstone si remplacement. Rétro-compat lecture `m.pj.dataB64` legacy. **Limite 2 MB → 10 MB**. **Tests Vitest** : 28 nouveaux (validation, build, match/resolve, migration plan, orphans). Total 18 fichiers / 365 tests. Phase 2-3-4 (DOC-PJ généralisé, LOG-PHOTOS, Drive lazy scan) reportées V1.1. |
| BUG-ENT-RENAME-CASCADE | Renommage entité ne propage pas vers logements/baux/quittances → KPIs dashboard à 0 après rename | P0 | XS | ✅ Livré v14.51 | commit ee48bad · `saveEnt()` cascade sur 5 collections (logements / baux / baux_historique / quittances / mouvements globaux SCI:nom) + normalisation Unicode à la saisie (em-dash U+2014 / en-dash U+2013 / NBSP → ASCII safe) · toast "Entité renommée — N rattachement(s) propagé(s)" |
| BUG-ENT-ORPHANS-CLEANUP | Détection + nettoyage des rattachements orphelins (logements pointant vers entités supprimées ou renommées) | P2 | S | ✅ Livré v14.52-53 | [docs/subjects/BUG-ENT-ORPHANS-CLEANUP.md](docs/subjects/BUG-ENT-ORPHANS-CLEANUP.md) · Phase 1 v14.52 commit 7e209a5 (audit boot + toast warning + console.warn détaillée) · Phase 2 v14.53 commit 79b93bc (modale Paramètres "Maintenance — Rattachements orphelins" avec UI 1-clic Rattacher / Supprimer, réutilise cascade rename de saveEnt) · Phase 3 fuzzy-match auto = standby (pas urgent) |
| BUG-BIENS-TABS-FILTER | Page Biens / mode Bailleurs : toggle Tous/Archivés affichait les mêmes 3 cards dans les 2 vues | P2 | XS | ✅ Livré v14.54 | [docs/subjects/BUG-BIENS-TABS-FILTER.md](docs/subjects/BUG-BIENS-TABS-FILTER.md) · commit ae7b24b · `_renderBiensModeBailleurs` filtre sur `_entsWithArchived()` quand `_biensTab==='archives'` + `_renderBailleurCard(ent, isArchivedTab)` compte selon scope · empty state "Aucun bailleur n'a de bien archivé" + libellé "N biens **actif**(s)" / "**archivé**(s)" |
| BUG-LOG-001 | Logement : référence non modifiable après création | P2 | XS | ⬜ À faire | [docs/subjects/BUG-LOG-001.md](docs/subjects/BUG-LOG-001.md) · reporté Sprint 1E (UX cascade nécessite design dédié) |
| BUG-EQUIP-FILTER | Onglet Équipements : filtre exclut logements vacants | P2 | XS | ✅ Livré v14.84 (Sprint 1E) | Retrait du filtre `l.locataire` dans `rEquipements` (3 sites : sélecteur immeuble, sélecteur logement, liste). Les vacants sont maintenant inclus avec label "Vacant" dans le selectbox. |
| BUG-HC-GARDE-FOU | Garde-fou saisie HC : alerte si valeur aberrante | P2 | XS | ✅ Livré v14.84 (Sprint 1E) | `saveParamLog` confirme avant écriture si : HC > 50 000 €/mois (excessif) OU CH > HC (anormal). Helper `_validateHC` testé via Vitest (19 tests). |
| DB-CORRUPT-FALLBACK | DB corrompue : alerte + backup + restore Drive | P2 | XS | ✅ Livré v14.84 (Sprint 1E) | `initDB` détecte JSON parse échoué → backup du payload corrompu localStorage (`KEY_corrupt_backup_*`) + toast erreur 12s + ouvre modale restore Drive si user avait Drive. Avant : fallback silencieux. |
| BUG-UI-DARK-MODAL | Mode sombre : fond modale trop transparent (texte page derrière visible) | P2 | XS | ⬜ À faire | [docs/subjects/BUG-UI-DARK-MODAL.md](docs/subjects/BUG-UI-DARK-MODAL.md) · capture wizard Bail F-001 · à fixer dans V3-VISUEL ou avant |

---

## 🔴 P1 — Légal / Fiscal (bloquant commercialisation)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
| 14 | LEGAL-2044 | Aide déclaration 2044 — mapping catégories → lignes fiscales | P1 | L | ✅ Livré v14.90 (Sprint 3B) | `js/core/legal-2044.js` (11 KB, 3 exports : `_compute2044`, `_format2044Recap`, `_2044ToCsv`). Agrégation des mouvements par ligne 2044 (211, 213, 221-230, 250) en réutilisant STD_CATEGORIES v14.78. UI dans onglet Export : carte "Aide déclaration 2044" avec selecteurs année + entité + bouton récap + bouton télécharger CSV. Helpers exposés à window. Tests Vitest 15 : aggregate, période, scope entité, tombstones, special, custom non-mappé, comptes, arrondi, null-safe, format texte récap, CSV escape, avertissement déficit. **Hors scope V1** : déficit foncier complexe (limite 10 700€, report 10 ans), liasse 2072 SCI IS (sujet LEGAL-2072 P3). |
| 15 | LEGAL-BILAN-ANNUEL | Bilan annuel par entité PDF | P1 | M | ✅ Livré v14.92 (Sprint 3C) | `js/core/legal-bilan.js` (9 KB, 2 exports : `_computeBilanAnnuel`, `_formatBilanTexte`). Réutilise `_compute2044` pour la structure fiscale + ajoute KPIs métier (taux occupation, manque à gagner, détail par logement). UI dans p-export : carte "📊 Bilan annuel" avec selecteurs année + entité + bouton "Générer". Sortie texte ASCII multilignes prête à copier/imprimer. 10 tests Vitest. **PDF natif** reporté à Sprint 4 polish (le récap texte est imprimable via navigateur Ctrl+P). |
| 38 | EDL-VALIDATION-AVOCAT | Validation légale template EDL par avocat (bail habitation) | P1 | XS | ⬜ À faire | Décret 2016-382 · clés (nombre+destination), réf EDL entrée dans sortie, comparatif pièce par pièce |
| 32 | ARCHI-DB-DOUBLONS | Refonte architecture DB — séparer log (bien physique) et bail (contrat), bidirectionnel | P1 | XL (~12-15h, ~3-4h restantes) | 🔄 **Phases 1+2+3a+3b+4a+4b fondation ✅ livrées v14.17.2** · Phase 4b refacto ⬜ session dédiée | [docs/subjects/ARCHI-DB-DOUBLONS.md](docs/subjects/ARCHI-DB-DOUBLONS.md) · **Phases livrées** : 1 CDC `ae73859`, 2 data `511faf3` v14.14, 3a UI tabs `5d7097f` v14.15, 3b sync étendu `17426cf` v14.16, 4a wizard readonly `5fd2ca0` v14.17, fix bouton `230a7fd` v14.17.1, **4b fondation `1a42721` v14.17.2** (`_readLogForBail` enrichi expose API legacy aplatie : adrBien/ftype/dpe/ges/erp/plomb/chauff/ecsLabel/etc.). **Phase 4b complète = ~3-4h** session dédiée future avec tests bail PDF obligatoires : refacto manuelle 149 sites dans 5 fonctions PDF (previewBailData l.12260, previewBailDataV2 l.10961, genBailHTML l.13947, exportBailWord l.13875, genPDFNative l.13570) + listings (rBaux/rMv/rDash/rEDLList/rQuit) + suppression 33 champs obsolètes + suppression `_syncLogToBail`. Pattern : `const bLog = _readLogForBail(bail, log); bail.X` → `bLog.X`. |

---

## 🔴 P1 — Sécu / Architecture (bloquant commercialisation)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| **FICHES-PARITE-360** 🔥 | **Parité totale onglets ↔ fiches 360° (logement / immeuble / bailleur) — single source of truth** | **P1** | **XL (~27h, ~23h restantes)** | 🔄 **Session 1 ✅ Compta riche logement livrée v14.18** · 7 sessions restantes | [docs/subjects/FICHES-PARITE-360.md](docs/subjects/FICHES-PARITE-360.md) · **Session 1 commit `a2ae89c` v14.18** : sous-onglet 💰 Comptabilité fiche logement (KPIs annuels + cash-flow SVG 12 barres + listes compactes mouvements/quittances/IRL filtrées par ref+année + sélecteur année + boutons "+ Mvt"/"+ Quittance"). Helpers factorisables `_renderComptaKPIsForLog`, `_renderComptaCashFlowChart`, `_renderMvForLog`, `_renderQuitForLog`, `_renderIrlForLog`. **Sessions restantes par ROI** : 2 Plan d'occupation Gantt immeuble (~3h, killer feature), 3 EDL fiche logement + EDL-TEMPLATE-PER-LOG (~7h), 4 Compteurs + graphique conso (~2h), 5 Entretien équipements+assurances+agenda (~2h), 6 Documents agrégés (~1h), 7 Performance + compta bailleur (~5h), 8 Plan immeuble charges communes+travaux (~3h). |
| AUDIT-GLOBAL | Audit + nettoyage actif + analyse faisabilité modularité (index.html = 30 083 lignes au 2026-05-05) | P1 | L | ✅ Livré v14.81 (Sprint 1B) | Phases 1-5+7 audit lecture livrées (commits `15c1aee`, `5084b70`). Phase 6 nettoyage console.log : audit montre **104 console.* tous diagnostics opérationnels utiles** (Drive sync, OAuth, EDL, migrations, ARCHI) → aucun TEST/DEBUG oublié, codebase déjà propre. Pas de fix nécessaire — clos. Estim initiale du rapport AUDIT-CODE (60-70 à supprimer) revue à 0. |
| ARCHI-MODULAR | Refonte modulaire monolithe index.html (ES modules natifs) | P1 | XL | 🔄 Phases 0+1a+1b+2 livrées v14.85→88 (Sprint 2 marathon partiel) | [docs/strategie/ARCHI-MODULAR-FAISABILITE.md](docs/strategie/ARCHI-MODULAR-FAISABILITE.md) · **Stratégie 2 ES modules natifs**. Tag rollback `pre-modular-sprint2`. **Livré dans Sprint 2 marathon** : Phase 0 v14.85 (CSS extrait dans `css/main.css`, -3434 lignes index-test.html), Phase 1a v14.86 (`core/utils.js` 16 helpers purs : sanitize + validation + DPE + classification + temporels), Phase 1b v14.87 (`core/idb.js` 5 helpers IndexedDB + 10 tests), Phase 2 v14.88 (`components/toast.js` + `components/modal.js` + 13 tests). Source unique de vérité pour 26 helpers via re-export depuis `__tests__/helpers/*.js`. Pattern shadow (inline + module) idempotent. **Reporté post-V1** : Phase 1c db.js + Phase 1d drive.js (objet DB mutable global + OAuth state nécessitent refacto en profondeur), Phase 3 migration onglets (30+ fonctions globales par onglet via onclick inline, prérequis BAIL-NAMESPACE-MIGRATION 3-4j), Phase 4 cleanup. **Pré-requis dev** : http-server sur port 8766. |
| SECU-INNERHTML | Sites `innerHTML=` non échappés restants — XSS V1 bloquant | P1 | M | 🔄 Phase 1 livrée v14.80 (Sprint 1A) | Phase 1 (commit `2bf8d1f`) : helpers _esc/_h/_raw + 16 tests Vitest + 10 lots fixes sites HAUT-RISQUE (fillMvQui, drillEntOps, rAlertsSection, rParamsPieces XSS onclick critique, _irlBaseCells, IRL histo, ass/mrh/quit tbody, régul cards/doc, ent.logo). Inventaire `docs/audit/SECU-INNERHTML-INVENTAIRE.md`. **Phase 2 restant** : ~30 sites `onclick="X('${l.ref}')"` IRL/baux à migrer vers data-attributes (en Sprint 1B). |
| MOBILE-AUDIT-ONGLETS | Audit + correctifs UX mobile onglet par onglet (irréprochable sur téléphone) | P1 | L | 🔄 Phase 1+2+3+4 règles CSS livrées v14.11→14.95 | [docs/subjects/MOBILE-AUDIT-ONGLETS.md](docs/subjects/MOBILE-AUDIT-ONGLETS.md) · **Phase 1 v14.11** : anti-zoom iOS Safari. **Phase 2 v14.12** : refonte EDL. **Phase 3+4 v14.95 (Sprint 3H)** : règles CSS génériques dans `css/main.css` (~80 lignes ajoutées) — touch targets 44px partout (buttons, inputs, selects), inputs font-size 16px (renforce anti-zoom iOS), modales plein écran 100dvh + m-foot sticky avec safe-area-inset-bottom iPhone, scroll-margin-top 60px pour anchors, tbl-wrap overflow scroll horizontal, form-grid → 1 col mobile, toast centré bas mobile, sidebar burger sur <480px, dark mode preserve. **Validation visuelle reportée Sprint 4 polish** (nécessite test 320/390/428 px par utilisateur). |
| LOG-FICHE-360 | Vue 360° consolidée par bien (Phase 2 sous-onglets Documents/EDL/Compta/Compteurs/Entretien) | P1 | M | 🔄 Phase 1 livrée v14.2 | [docs/subjects/LOG-FICHE-360.md](docs/subjects/LOG-FICHE-360.md) · Phase 1 livrée commit `1036bdf` (route + header + onglet Général) · Phase 2 à planifier en session dédiée — stub ergonomique des 5 sous-onglets déjà en place |
| DASH-PROFILES | Dashboard 4 onglets (Propriétaire 1-écran / Gestionnaire ops / Complet = prod / Custom = mode édition) | P1 | M | ⏳ Phase 2 reportée Sprint 4 marathon (validation visuelle nécessaire) | Phase 1 v2 livrée (mockups + spec). **Phase 2 implémentation 4.5 j-h non livrée dans cette session marathon** : nécessite validation visuelle 320/390/768/1280 px qui ne peut être faite en autonomie sans preview navigateur réel. Reportée à une session dédiée user avec validation lentille par lentille. 3 décisions D1-D3 toujours à arbitrer (persist user/device, custom layout séparé, vue détaillée modale/onglet). |

---

## 🔴 Drive sync — multi-utilisateurs / partage

> **🧪 TEST EN ATTENTE (à rappeler à l'user)** : valider **DRIVE-PARTAGE-PICKER** avec un 2e compte (Marion) — Didier partage son dossier ImmoTrack (Éditeur), Marion ouvre l'app, Paramètres → Partage → « Sélectionner un dossier partagé » → choisit le dossier → doit pouvoir **enregistrer**. Tant que non validé : ne pas construire DRIVE-2F (prématuré).

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| **DRIVE-PARTAGE-PICKER** | Partage tiers via Google Picker (l'associé écrit dans le dossier partagé, scope drive.file gardé) | **P1** | M | ✅ **Code livré v15.135-137** · 🧪 **test 2 comptes en attente** | [docs/subjects/DRIVE-PARTAGE-PICKER.md](docs/subjects/DRIVE-PARTAGE-PICKER.md) · clé API Picker en place · UI dans Paramètres → Partage · **résout le vrai problème** (Marion ne pouvait pas écrire — workaround "Drive partagé" du doc était faux). |
| DRIVE-2F | Optimistic Concurrency Control (OCC) — anti-écrasement 2 writers simultanés | P1 | M | ⬜ **Après validation PARTAGE-PICKER** | [docs/subjects/DRIVE-2F.md](docs/subjects/DRIVE-2F.md) · filet de sécurité une fois que 2 personnes (Didier+Marion) écrivent les mêmes fichiers. ⚠ touche le chemin de save critique (fraîchement stabilisé) → à faire avec prudence + test 2 comptes. Prématuré tant que le partage n'est pas validé. |
| DRIVE-2H | Re-architecture fichiers par-user vs partagé | P1→**V2** | M | 🔵 **Reclassé V2 multi-tenant** | Le split per-user n'est utile qu'en multi-tenant (V2 PostgreSQL Q4 2027). Pour 2-3 users co-gestion, le partage Picker suffit (ils partagent tout, c'est voulu). [docs/subjects/DRIVE-2H.md](docs/subjects/DRIVE-2H.md) |
| DRIVE-2G | Awareness UI (qui édite quoi) | P1→**V2** | S | 🔵 **Reclassé V2** | Présence temps-réel = confort multi-user, redondant avec le backend V2. [docs/subjects/DRIVE-2G.md](docs/subjects/DRIVE-2G.md) |
| DRIVE-2I / 2J | Audit log Drive · merge field-level | P2/P3→**V2** | — | 🔵 **Reclassés V2** | Nice-to-have, couverts/refaits par le multi-tenant V2. |
| DRIVE-ARBORESCENCE | Arborescence Drive Entité/Immeuble/Logement/[9 sous-dossiers métier] + sync bidirectionnel | P1 | L | ✅ Phases A + B + C + D livrées | Phase A v14.20 (arborescence), Phase B v14.35 (`_drvUploadDoc` + `DB.documents`), Phase D v14.36 (UI Stockage Drive), **Phase C v15.02 Sprint 5D : lazy scan Drive→app**. Helpers `_drvListFolderFiles` (files.list API), `_drvScanLogementFolders(logRef, [categories])` (multi-catégories), `_drvMergeScanResults(scan, logRef)` (ajoute nouveaux fichiers + tombstone ceux supprimés côté Drive web), `_drvLazyScanLogement(logRef)` (orchestration + throttle 30s + toast + audit-trail). Trigger : à l'entrée des sous-onglets `documents` ou `photos` de LOG-FICHE-360 (setTimeout 200ms). **13 tests Vitest** dédiés (`drive-scan.test.js`) couvrant additions/tombstones/multi-cat/edge-cases. Englobe DRIVE-2K. |

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
| LOG-PHOTOS | Photos illustratives sur la fiche logement (galerie permanente) | P2 | M | ✅ Livré v15.01 (Sprint 5C) | Sous-onglet **📷 Photos** dans LOG-FICHE-360. Grid 3 cols responsive (auto-fill 180px). Thumbnails IDB lazy-load (lazy="lazy" + setTimeout post-render). **Upload multiple** (input file `multiple` accept image/*) avec compression auto > 2 Mo. **Lightbox plein écran** : nav Prev/Next + Escape + clic outside. **Photo de couverture** : toggle ⭐/☆ marque `doc.isCover=true`, démarque les autres du logement. Stockage `DB.documents` { parentType:'logement', category:'photos' } + IDB + Drive `🖼️ Photos/`. Réutilise `_attachmentSaveForEntity` v15.00 + `_attachmentLoadBinary`. **Couverture dans cards Biens** : reportée V1.1 (nécessite chargement async des thumbnails dans render synchrone). |
| LOG-ANNONCE | Bouton "Générer annonce de location" pour logements vacants — **enrichi 2026-05-15 mode "qui fait rêver" type Leboncoin** | P2 | M (4-6h) + L si LLM | ⬜ À faire | [docs/subjects/LOG-ANNONCE.md](docs/subjects/LOG-ANNONCE.md) · différenciant marché vs Rentila/BailFacile · **Phase 2** : banque phrases évocatrices + adjectifs auto (surface/étage/expo/DPE) + mise en page sections balisées (Le bien / Les atouts / Le quartier / Pratique) + tri photos intelligent (couverture lumineuse → extérieur → séjour → cuisine → chambres → bains → annexes) + bandeau DPE F/G honnête · **Phase 4 V2** : LLM Claude API / OpenAI optionnel (Pro Connect, ~0.01€/annonce) · garde-fou anti-mensonge (case "j'ai vérifié l'exactitude" avant export PDF/copie) |
| **Travaux / PJ** | | | | | |
| DOC-PJ | Pouvoir ajouter des PJ (factures, CR entretien, photos) | P2 | M | 🔄 **Phase 1 quasi-livrée v15.155-158** | [docs/subjects/DOC-PJ.md](docs/subjects/DOC-PJ.md) · **Drive v15.155** : tout DB.documents → Drive (dossier général hors-logement + rattrapage reconnexion). **PJ manuelle ajoutée** sur fiches Logement(déjà) + Entité + Immeuble + modales Assurance/MRH + Équipement (v15.156-158). Charges = couvert (Immeuble docs + mvt). **Reste** : Bail (modale wizard, reporté) + **Phase 2 : archivage AUTO des PDF générés** (quittance/IRL/régul/EDL/bail). 🔗 Phase C scan Drive→app toujours future. |
| TRAV-SUIVI | Suivi entretien / travaux avec calendrier | P2 | L | ⬜ À faire | [docs/subjects/TRAV-SUIVI.md](docs/subjects/TRAV-SUIVI.md) · CDC requis |
| **Courriers / Templates** | | | | | |
| DOC-CIVILITE | Reprendre civilité du locataire dans formules de politesse | P2 | XS | ✅ Livré v13.23 | commit 529e261 · helpers _civSalut/_civConge incluent maintenant les noms ("Madame ARSLAN, Monsieur HARNIST,") |
| BUG-EMAIL-PROPOSAL-IRL | Modale "Proposition de mail" IRL : boutons inactifs + salutation incorrecte (adresse au lieu du locataire) + date "Invalid Date" | P2 | S | ⏳ En attente sprint mail | [docs/subjects/BUG-EMAIL-PROPOSAL-IRL.md](docs/subjects/BUG-EMAIL-PROPOSAL-IRL.md) · détecté 2026-05-17 user · à traiter dans Sprint 19B EMAIL-ONGLET-PERMANENT |
| BUG-BANK-IMPORT-DEDUP | Import bancaire : doublons à l'import car `_bankDedup` actuel sur date+montant cassé si user édite après import | P1 | S | ✅ Livré v15.78 | [docs/subjects/BUG-BANK-IMPORT-DEDUP.md](docs/subjects/BUG-BANK-IMPORT-DEDUP.md) · commit `5cb8e3a` · fingerprinting stable (FNV-1a + DJB2 16 chars hex) sur ligne brute CSV/OFX (priorité FITID en OFX) · `_bankDedup` 2 stratégies cascade (fingerprint priorité + fallback legacy) · migration paresseuse OFX legacy · Vitest 811 → 837 (+26 tests dont CRITIQUE post-modification) · différenciant marché vs Rentila/BailFacile/Qalimo |
| BANK-IMPORT-V2 | Refonte import : **pointeur de progression par compte** (au lieu du dédup heuristique qui cassait sur CAF scindée + loyer décalé manuellement). Identification auto OFX (ACCTID) / CSV (hash en-têtes), modal compte 1re fois, modal 1er import 3 choix (date / tout / sélection), pointeur incrémental (slice après fingerprint) + fallback heuristique, UI Paramètres « 🏦 Mes comptes » (renommer/reset/supprimer). | P1 | M | ✅ Livré v15.160-163 | [docs/subjects/BANK-IMPORT-V2.md](docs/subjects/BANK-IMPORT-V2.md) · 6 phases A-F livrées · 21 nouveaux tests Vitest (924 → 936) · code review pre-release (fix bug grammaire + refacto fragile details.open → 4e radio + safety dispatcher) · **à valider en prod sur workflow bancaire réel** |
| **UX transverse** | | | | | |
| UX-GROUP-BY-IMMEUBLE | Tri visuel par immeuble avec séparateurs / headers — règle transverse tous onglets listant logements (IRL, Loyers, Quittances, EDL, Assurances, Équipements, Régul, Travaux…) | P2 | M (~3-5h) ou S (IRL seul) | 🔄 IRL livré v15.76 + drill-downs v15.77 · 9 onglets restants | [docs/subjects/UX-GROUP-BY-IMMEUBLE.md](docs/subjects/UX-GROUP-BY-IMMEUBLE.md) · IRL : groupage + headers collapsibles + KPI condensés + persist localStorage + 3 drill-downs (lots/alerts/compta) via modale unifiée · propagation onglet par onglet au fil V3-REFONTE-* |
| TOOLING-MOCKUP-DEVICE-TOGGLE | Toggle device fiable dans les mockups responsive (5 tentatives échouées 2026-05-17 → solution actuelle = DevTools F12) | P2 | S | ⏳ Dette technique | [docs/subjects/TOOLING-MOCKUP-DEVICE-TOGGLE.md](docs/subjects/TOOLING-MOCKUP-DEVICE-TOGGLE.md) · à reprendre en session dédiée tooling |
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
|  | IMPORT-CONCURRENTS | Migration depuis solutions concurrentes (Rentila / BailFacile / Qalimo / etc.) | P2 | L | 🔄 Structure livrée v14.94 (Sprint 3G) | `js/core/import-concurrents.js` (8 KB, 3 exports : `_mapRentila`, `_mapBailFacile`, `_mergeImport`). Mappers basés sur schémas publics : Rentila JSON (biens/locataires/baux/paiements), BailFacile XLSX (3 onglets Logements/Baux/Paiements). Politique merge : skip si ref existante (pas d'écrasement) + dédup mouvements par signature date+ref+montant. 18 tests Vitest. **UI reportée Sprint 4 polish** : nécessite exemples réels (fichiers anonymisés exportés par utilisateurs Rentila/BailFacile) pour ajuster les mappers aux formats exacts. Qalimo/ImmobilierLoyer/Smovin hors scope V1. |
|  | BIZPLAN-STRATEGIE | Étude de marché + business plan + positionnement + effort déploiement (B2C + B2B pro) | P2 | L | ✅ Livré 2026-04-30 | 5 livrables dans `docs/strategie/` : [BIZPLAN](docs/strategie/BIZPLAN.md) · [CARTE_POSITIONNEMENT](docs/strategie/CARTE_POSITIONNEMENT.md) · [PROJECTIONS](docs/strategie/PROJECTIONS.md) · [PLAN_ACTIONS](docs/strategie/PLAN_ACTIONS.md) · [EFFORT_DEPLOIEMENT](docs/strategie/EFFORT_DEPLOIEMENT.md) |
|  | BIZPLAN-V2 | Pitch commercial CGP + plan attaque opérationnel + CDC technique (V2 dossier) | P2 | XL | 🔄 En cours | [docs/subjects/BIZPLAN-V2.md](docs/subjects/BIZPLAN-V2.md) · 11 livrables (2 pptx + xlsx + pdf one-pager + 7 md/docx) sur 2-3 sessions dédiées · 4 décisions archi figées (Capacitor V1.1, PWA installable, 3 niveaux souveraineté, soft-block) · cible CGP/vendeurs · **+ concurrent #9 LocataireCloud ajouté 2026-05-18** |
|  | WATCH-LOCATAIRELIVE | Monitoring trimestriel concurrent LocataireCloud (locataire.live) | P2 | XS | 🔄 En cours | [docs/subjects/WATCH-LOCATAIRELIVE.md](docs/subjects/WATCH-LOCATAIRELIVE.md) · audit initial 2026-05-18 · 26 features roadmap publique · pricing lifetime 347 € × 50 places + futur SaaS 9,90-49,90 € · IA conv T2 2026 + app mobile native T4 + mandats agence T3 → menace cible CGP 2 trimestres avant V2 ImmoTrack |
|  | OUTILS-SEO-GRATUITS | Page /outils avec 10-15 calculateurs immobiliers (acquisition SEO V1 pre-launch) | P2 | L | ⬜ À faire | [docs/subjects/OUTILS-SEO-GRATUITS.md](docs/subjects/OUTILS-SEO-GRATUITS.md) · réaction LocataireCloud (16 calculateurs gratuits) · 4 calculateurs ⭐ différenciants (2044 preview / cession LMP-LMNP / loyer marché CLAMEUR / DPE plan rénov) · 8-10 j-h + 500 € HT rédactionnel · cible Q3 2026 |
|  | IA-COPILOTE | Module IA léger souverain (recherche sémantique Ctrl+K + copilote dashboard + catégorisation + clauses bail) | P2 | L | ⬜ À faire | [docs/subjects/IA-COPILOTE.md](docs/subjects/IA-COPILOTE.md) · parité concurrentielle LocataireCloud agent IA T2 2026 · 4 modules · posture "IA souveraine 100 % browser" (transformers.js + WebLLM Phi-3 opt-in) · 9-15 j-h V1.5 Q1 2027 |
|  | FOUNDER-EDITION | Pricing lifetime 249 € × 100 places acquisition early adopters pré-launch | P1 | S | 🔄 **Option (b) validée 2026-05-18** | [docs/subjects/FOUNDER-EDITION.md](docs/subjects/FOUNDER-EDITION.md) · réaction LocataireCloud (347 € × 50 places) · décision (b) 249 € × 100 places = 24 900 € cash up-front + 100 évangélistes · annonce juillet 2026 · setup 1,5 j-h Stripe + tag DB |
|  | BUG-MOBILE-MENU-PLUS | **P0 bug fonctionnel mobile** : menu "Plus" bottom nav ne s'ouvre pas → 12 fonctions sur 16 inaccessibles mobile | P0 | S | ✅ **Livré v15.140** | [docs/subjects/BUG-MOBILE-MENU-PLUS.md](docs/subjects/BUG-MOBILE-MENU-PLUS.md) · "Plus" ouvre la sidebar overlay + backdrop (tap=ferme), garantit rendu sidebar V4 · commit 68b5fa9 · ⚠️ test device user à confirmer |
|  | BUG-MOBILE-DASH-PROFILES | **P0 bug fonctionnel mobile** : sélecteur profil dashboard (Solo/Premium/Gestionnaire) inaccessible mobile | P0 | XS | ✅ **Livré v15.140** | [docs/subjects/BUG-MOBILE-DASH-PROFILES.md](docs/subjects/BUG-MOBILE-DASH-PROFILES.md) · pills mode dashboard-only (plus sur Accueil) · mode "Solo" supprimé (redondant page Accueil) → migration 'solo'→'premium' · "Tableau de bord" réapparaît dans sidebar · commit 68b5fa9 |

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
| 32 | **IA-V2** 🔮 | Module IA opt-in "Pro Connect" : OCR DPE/diagnostics + OCR factures + OCR justifs candidat + annonce LLM + classification Drive auto | V2 | L (15-25h) | ⬜ V2 post-commercialisation | [docs/subjects/IA-V2.md](docs/subjects/IA-V2.md) · 5 use cases prio + 4 secondaires + 5 écartés (risque juridique) · tier payant ~5€/mois SaaS · zéro coût récurrent ImmoTrack V1 · différenciant majeur marché FR (Rentila/BailFacile/Qalimo = aucun OCR) |

---

## 🟡 V1+ post-commercialisation Drive

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| DRIVE-2K | Arborescence Drive par dossier entité (JSON+Baux+EDL ensemble pour partage simple) | P2 | M | ⬜ À faire | [docs/subjects/DRIVE-2K.md](docs/subjects/DRIVE-2K.md) · à combiner avec DRIVE-2H |
| DRIVE-2I | Audit log + history Drive | P2 | S | ⬜ À faire | Pour support client · [docs/subjects/DRIVE-2I.md](docs/subjects/DRIVE-2I.md) |
| DRIVE-2J | Field-level conflict resolution | P3 | M | ⬜ À faire | Nice-to-have · [docs/subjects/DRIVE-2J.md](docs/subjects/DRIVE-2J.md) |

---

## 🔄 En cours

### Phase B — Refonte UX dashboard wahoo (agent design v2 en background)
> Mockup v1 noté 6/10 par user (sobre ≈ coloré, solo ≈ pro, scroll non respecté, pas de Gestionnaire). Agent design v2 lancé avec brief enrichi : Boursorama (couleurs) + Deliveroo (UX action-oriented), 3 profils × 3 thèmes = 9 mockups, contrainte dure 1 écran 1440×900 sans scroll, info en 1-2 clics max.
>
> **Output attendu** : `docs/strategie/dashboard-mockups/v2-refonte-2026-05-15.html` + plan markdown. Cible note ≥ 9/10.
>
> Implémentation Phase B code en attente validation visuelle des mockups.

### Phase C — Audit navigation + onglets par profil (audit livré, implé en attente)
> Audit complet livré : [NAV-AUDIT-PROFILS.md](docs/subjects/NAV-AUDIT-PROFILS.md). Verdict par onglet (Garder/Reclassifier/Refondre/Sortir-top-nav) + sidebar cible Solo (5) / Gestionnaire (10) / Pro (10+ multi-portfolio).
>
> 6 sous-sprints C1-C6 identifiés (22-40h total) : nav adaptative profils · scinder Import patrimoine/comptable · sortir EDL/IRL/Régul du top-nav · refonte Agenda · décision Assurances · fusion Paramètres+Export.
>
> Pré-requis avant code : validation mockup Phase B + brief user clarifié pour Agenda (C4) et Assurances (C5).

---

## ✅ Livré récemment

### 19C BUG-EQUIP-INTERV-FEEDBACK ✅ — Reset filtres + scroll/highlight après save intervention (v15.164, 2026-05-25)
> **Bug** : après save d'une intervention équipement, si un filtre immeuble/logement actif ne matchait pas le logement de la nouvelle intervention → user voyait « Aucun logement trouvé » → impression que le save avait échoué.
>
> **Fix** (`saveEquipIntervention` l.34227 + `rEquipements` l.33959) :
> - Reset `equip-f-imm` + `equip-f-log` AVANT le re-render → garantit que la ligne fraîchement saisie est dans le scope
> - Toast étendu : mention « (filtres réinitialisés) » uniquement si filtres étaient actifs
> - Scroll + highlight vert 2s de la ligne via `tr[data-equip-key="${ref}__${key}"]` (attribut composite ajouté au template), `CSS.escape()` pour refs avec caractères spéciaux
>
> **Commit** `a0744f2`. Bump v15.164 (5 places + sw.js).

### DASH-REFONTE-GLOBALE-V4 ✅ — Refonte V4 Stripe complète (sandbox v15.37) — session 2026-05-15/16 (~7h cumulées)
> **Refonte visuelle COMPLÈTE** alignée sur mockup `docs/strategie/dashboard-mockups/galerie-finale-sans-surcharge.html` (variant V4 Stripe, l.947-1136).
>
> Suite à retour user (capture CP1-4 jugée hybride) : abandon des patches incrémentaux → réécriture complète du dashboard + sidebar V4 Stripe.
>
> **Fonts** : ajout Inter (400-800) + JetBrains Mono (400-600) en plus de Manrope existant.
>
> **CSS** : ~480 lignes ajoutées dans `main.css` scopées `body[data-dash-v4="on"]` (préfixe classes `.v4s-*`). Activé uniquement quand `DB.params.dashRenderV === 'v2'`.
>
> **Sidebar V4** (`_renderSidebarV4`) : logo "ImmoTrack" + badge PREMIUM · 4 carrés entités top 3 + bouton "+" · nav compacte avec 16 items (icones SVG Feather-style) + badges count (Logements / Locataires / Loyers) · sections "Comptabilité" et "Réglages" · footer avatar DK + nom + sous-titre.
>
> **Dashboard V4** (`_renderDashV4`) — 5 sections :
> 1. **Coach IA** : eyebrow + h2 "Priorisation {Mois Année}" + 3 cards horizontales (todos dédupliqués par type via `_TODO_TYPE_META`) + CTA "DÉMARRER →".
> 2. **Narrate** : phrase narrative discrète avec deltas dynamiques (montant + delta vs mois-1 + % collecté réel + restant).
> 3. **Row1** : Hero jauge demi-cercle SVG (pctCollecte) + Cash-flow 12 mois (sparkline area gradient + 3 mini-KPIs YTD) + Sujets à traiter (top 3 priorisés).
> 4. **Row2** : 5 KPIs Bloomberg row (Occupation·MAG / Rendement / DG / Charges·Loyers / vs mois-1).
> 5. **Entview** : par entité, header + KPIs + immeubles avec lots colorés (ok/warn/vac).
>
> **Helpers métier intacts** : `_computeUnifiedTodo`, `_TODO_TYPE_META`, `_heroCashflowSeries`, `_mkSparkline`, `_buildHeroDrill`, `_buildFluxDrill`, `_isLoyerCategory`, `_computeImpayes`, `_isAlive`. 23 drill-downs `_DD[*]` préservés (hero, flux, occ, rdt, donut, dg, todo-unified accessibles).
>
> **Bugs fixés en cours de session** :
> - `objMens × 12` quand "Toute l'année" (avant : "8 250 € sur 1 706 €" — bug annuel vs mensuel).
> - Narrate "100 % collecté" en dur remplacé par `pctCollecte` réel + restant.
> - Delta % cash-flow et "vs mois-1" : clamp si `prevCf` < 10% du courant (évite "+5213 %" aberrant) → bascule sur delta absolu €.
> - Label "vs N-1" → "vs Mars 2026" (label dynamique partout).
>
> **Comportement** :
> - V4 Stripe activé automatiquement quand `dashRenderV='v2'` + thème dark (force thème dark via `_applyStoredPrefs`).
> - Sidebar legacy (sections collapsibles + entités épinglées CP1) masquée via CSS quand v2 actif.
> - Pages autres que dashboard intactes (navigation `go(page)` préservée).
>
> **Vérification visuelle** (preview_eval sur http-server local) :
> - data-dash-v4="on" ✓ · thème dark ✓ · v15.37 ✓
> - Sidebar : logo + carrés entités + 16 nav items + footer ✓
> - Dashboard : coach (2 cards) + narrate (40% collecté + restant) + row1 (hero/cash/sjt) + row2 (5 KPIs) + entview (4 lots colorés) ✓
> - Fonts Inter + JetBrains Mono chargées ✓
> - Console : aucune erreur runtime ✓
>
> **Sujet à jour** : règle "Pas de jauge SVG géante" du `DASH-REFONTE-GLOBALE-V4.md` **abandonnée** au profit du mockup (jauge demi-cercle conservée). Sujet à mettre à jour en V3-VISUEL.
>
> **À valider** : capture user pour propagation prod `index.html`. **Sujet** : [DASH-REFONTE-GLOBALE-V4.md](docs/subjects/DASH-REFONTE-GLOBALE-V4.md).
>
> **Reports V3-VISUEL** : suppression `.cockpit-v2/.cockpit-v4` orphelins (anciennes versions CP2-3), nettoyage code mort `top/maxV/rows` dans widget `donut` v1 (10 lignes harmless), nettoyage widgets v1 legacy (`occ`, `rdt`, `donut`, `dg`, `flux`) qui ne sont plus appelés en mode V4 (utilisés seulement si dashRenderV revient à 'v1'), audit dark des 3 backgrounds `#fff` résiduels (modales/print).
>
> ──────────────────────────────────────────────────────────────────────
> **Historique** (workflow CP fractionné abandonné mi-session) :

### DASH-REFONTE-GLOBALE-V4 ✅ historique CP1-4 — Refonte globale dashboard + sidebar (sandbox v15.36) — session 2026-05-15 (~4h)
> **CP1 + CP2 + CP3 + CP4 livrés en bloc sandbox** `index-test.html` (master, sandbox-first). Décision user (mi-session) : abandon des checkpoints intermédiaires invalidables → enchaînement complet.
>
> **CP1 — Fondations** :
> - Thème dark forcé par défaut quand `DB.params.dashRenderV === 'v2'` et aucune préf user explicite (`_applyStoredPrefs`). Préf user respectée si déjà set.
> - Sidebar V4 : sections collapsibles individuellement (chevron + click titre, état persisté `immotrack_sb_sections_collapsed`) · entités épinglées top 3 par revenus annuels (clic = filtre dashboard) · footer DK (avatar + nom + lien Paramètres). No-op si `dashRenderV !== 'v2'`.
> - Bandeau Priorisation dédupliqué par `type` dans `_renderTopBandeauPrio` (ex. 3× "MRH manquante" → "Assurances × 3"). CSS responsive : `line-clamp: 2` + `nowrap` retiré.
> - Widget "À TRAITER" retiré du grid v2 par défaut : `DASH_DEFAULT_LAYOUT.todo-unified.visible = false` + ajout dans `hide` Sets `proprio`/`gestion`. Drill `_DD['todo-unified']` préservé via bandeau CTA. Hero passe `col: 12`.
>
> **CP2 — Cockpit Hero V4 Stripe narrative** :
> - `_heroV2` réécrit : jauge SVG 220×220 **supprimée** → format narrative (eyebrow + titre `8 250 € reçus sur 8 250 € attendus · 100 %` + sous-titre delta absolu € + barre progress horizontale fine + 4 satellites Recettes/Charges/Cash-flow/Occupation).
> - **Fix bug** : label `vs N-1` remplacé par `vs Mars 2026` (label dynamique mois-1 partout). Pill delta `cv4-sat-delta` avec couleur + flèche.
> - CSS `.cockpit-v4` ajouté (140 lignes). `.cockpit-v2` orphelin conservé (inerte) → cleanup en V3-VISUEL.
>
> **CP3 — Cash-flow 12 mois Bloomberg + 5 KPIs sparklines** :
> - Widget `flux` : sparkline passe de 6 à 12 mois + axe X mois 1-lettre (J F M A M J J A S O N D) + baseline 0 pointillée + ligne moyenne pointillée + delta `vs Mars 2026` sous le Net.
> - Widgets KPI Bloomberg (`occ`, `rdt`, `donut`, `dg`) : eyebrow JetBrains Mono uppercase + valeur grosse Manrope 24px + delta couleur + sparkline 12 mois inline (rdt + donut).
> - **`donut` renommé "Charges / loyers"** : ratio % charges/loyers + delta pts vs mois-1 + sparkline 12 mois du ratio. Drill `_DD['donut']` garde le détail catégories intact.
> - Helpers `_kpiMonthlySeries`, `_mkSparkline`, `_isLoyerCategory`, `_buildFluxDrill`/`_buildOccDrill`/`_buildRdtDrill` **intacts**.
>
> **CP4 — Suppression doublons + audit dark + responsive** :
> - **Bouton "9 actions requises"** (`#dash-alert-pill`) : conditionné `display:none` en v2 (redondant avec bandeau Priorisation top).
> - **Widget `context-bar` simplifié** en v2 : retire la salutation (déjà dans bandeau) → reste date + pills entité/période.
> - **Audit dark 14 onglets** : couverture suffisante (46 rules `[data-theme="dark"]` + 31 media queries déjà en place). 3 backgrounds hard-coded `#fff` résiduels (probablement modales/print) → audit fin reporté en V3-VISUEL.
> - **`dash-ent-cards` refonte V4 narrative reportée en V3-VISUEL** : decision pragmatique — code map() complexe (l.5357+), risque élevé de casser la logique métier pour gain visuel modéré (cards actuelles fonctionnelles, juste denses). Note ajoutée ci-dessous.
> - Responsive 3 formats (1440 / 1024 / 375) : couverture media queries existante préservée.
>
> Helpers métier intacts globalement. 23 drill-downs `_DD[*]` préservés (14 chemins visibles via grep + chaînages internes).
>
> **À valider** : capture user → propagation prod `index.html`. **Sujet** : [DASH-REFONTE-GLOBALE-V4.md](docs/subjects/DASH-REFONTE-GLOBALE-V4.md). **Code mort résiduel** : variables `top/maxV/rows` dans widget `donut` (10 lignes harmless, à nettoyer en V3-VISUEL).

### v15.21 quick win UX — retrait bouton « Mettre à jour les loyers » Pilotage — session 2026-05-15 (~5 min)
> User : *« Mettre à jour les loyers ? quel est l'utilité ? »*. Bouton retiré du Pilotage (révision IRL reste accessible via l'onglet Révision IRL + cas par cas par bail). Fonction `_pilOpenBulkMajIrl()` conservée @deprecated.

### Phase D spec — STRIPE-PAYWALL-V1 (doc 30-50h estimé) — session 2026-05-15
> Spec complète Stripe paywall V1 vanilla JS : modèle économique 4 tiers (Free 1 lot · Solo 14,90€ · Co-gestion 19,90€ · Gestionnaire 29,90€/user · Pro 89€/user), architecture sans backend (Stripe Payment Links + Customer Portal + 1 cloud function proxy auth), roadmap implé D0-D5.
>
> **Doc** : [STRIPE-PAYWALL-V1.md](docs/subjects/STRIPE-PAYWALL-V1.md). Implé après Phase B/C alignées et validation pricing par entretiens Phase E.

### Phase E spec — ENTRETIENS-HOGUET (sourcing + script + templates) — session 2026-05-15
> Plan complet 10 entretiens gestionnaires Hoguet 10-50 lots : objectifs (pricing 29,90€/user + différenciants + décision V2), méthodologie 30 min visio, plan d'entretien minute par minute, templates messages LinkedIn/email/forum, tableau suivi Google Sheet, coût estimé 630€.
>
> **Doc** : [ENTRETIENS-HOGUET.md](docs/subjects/ENTRETIENS-HOGUET.md). Sourcing à démarrer en parallèle Phase D dev. Livrable final = décision V2 GO/PIVOT/NO-GO.

### Phase A3 — BUG-DRIVE-PARTAGE-TIERS (workaround V1 documenté) — session 2026-05-15 (~15 min, doc only)
> User : *« j'ai donné accès à un tiers et elle n'a pas toutes les infos et ne peut pas enregistrer »*. Cause structurelle : OAuth `drive.file` ne permet pas d'écrire dans un fichier créé par un autre user, même si Drive natif autorise l'édition.
>
> 4 options évaluées (synthèse SaaS V2). **Option D retenue** : Drive partagé Google (anciennement Team Drive) → tous les membres sont propriétaires effectifs → OAuth `drive.file` autorise lecture+écriture pour Marion. **Zéro modif app**, 30 min setup user.
>
> Procédure pas-à-pas dans le doc sujet. Fix structurel multi-tenant = Phase D / V2 Q4 2027.
>
> **Doc sujet** : [BUG-DRIVE-PARTAGE-TIERS.md](docs/subjects/BUG-DRIVE-PARTAGE-TIERS.md). Note Phase D : tier « Co-gestion » à ~19€/mois pour formaliser commercialement le partage.

### Phase A2 — BUG-POPUP-QUITTANCE (régression v15.10) — session 2026-05-15 (~30 min, v15.20)
> User : *« J'ai enregistré un mouvement... Je n'ai pas eu le pop up (v14.63) »*. En réalité régression v15.10 Sprint 11 : auto-gen boot + matching auto silencieux faisaient que la quittance existait DÉJÀ au moment du saveMv → l'ancien code passait dans la branche `_exists = true` → toast inutile au lieu du popup.
>
> **Fix** : si toggle bail `quittAutoGen` actif → TOUJOURS proposer popup (créer OU ouvrir). Message différencié. Filtre `_deleted` ajouté (tombstone-safe).
>
> **Doc sujet** : [BUG-POPUP-QUITTANCE.md](docs/subjects/BUG-POPUP-QUITTANCE.md). Validation manuelle requise.

### Phase A1 — BUG-PRORATA-DASH (fix calculs loyer intra-mois) — session 2026-05-15 (~3h, v15.19)
> **Bug bloquant pour monétisation V1**. Locataire entré mi-mois (1-15) marqué « impayé » dans dashboard alors qu'il avait payé son prorata. Cause : `_getActiveBailHcCh` testait au 15 du mois et retournait le loyer plein → cassait `_computeImpayes`, `_computeExpectedRent`, `_buildProgDrill`.
>
> **Fix** : nouveau helper `_loyerProrataMois(log, yr, mi, bails, irlHist)` testable (loi 6 juillet 1989 + jurisprudence Cass. 3e civ.). Gère entrée mi-mois, sortie mi-mois, transition de 2 baux mi-mois, révisions IRL pour bail courant vs `bail.hc` figé pour bail historique clos. Wrapper inline `_getActiveBailHcChProrated`. Les 3 callsites de calcul d'attendu refactorés (hero impayés, attendu vs encaissé, progression annuelle).
>
> **Tests Vitest** : 713 → **744** (+31 nouveaux, zéro régression). 7 tests scénario user reproductible (cas Marion entrée 10/03).
>
> **Doc sujet** : [BUG-PRORATA-DASH.md](docs/subjects/BUG-PRORATA-DASH.md).
>
> **Reste à valider visuellement par user** dans `index-test.html` avant promotion vers `index.html`.

### Sprints 14-15-16-17 V1.1 + Fixes UX — session 2026-05-14 (~2h, v15.14 → v15.17)
> **Clôture du marathon V1.1**. Sprint 14 IMPORT-EXCEL-LOG déjà livré (template + import existants). Sprint 15 mobile = RAS (39 media queries en place depuis Sprint 3H v14.95). Sprint 16 cleanup Hub Communications (marqué @deprecated suite retour user "communication dans bail n'a aucune logique"). Sprint 17 polish UX → **reporté à l'audit onglet par onglet** vu les retours utilisateur sur la direction globale.

**3 retours utilisateur critiques traités v15.14-v15.17** :
- v15.14 : 4 fixes UX (bug clôture bail, refonte cartes quittances, alertes remontées, section DG dédiée fiche bail)
- v15.15 : rollback alertes remontées (« 1b c'est vraiment de la merde »)
- v15.16 : retrait Hub Communications + Historique communications de la fiche bail (« communication dans bail n'a aucune logique »)
- v15.17 : Hub Communications JS marqué @deprecated (code conservé pour audit)

**Audit onglet par onglet planifié post-marathon** : suite aux retours user multiples sur direction globale ("plein de rajouts peu compréhensibles qui complexifient tout"), audit ensemble pour décider quoi garder/cacher/virer dans tous les ajouts Sprints 6-13.

| Sprint | Statut | Détail |
|---|---|---|
| 14 IMPORT-EXCEL-LOG | ✅ Déjà livré | `genImportTemplate` + `handleImportRef` existants (6 onglets xlsx) |
| 15 Mobile | ✅ RAS code | Viewport + 39 media queries déjà OK |
| 16 Cleanup | ✅ Hub Comm @deprecated | Bouton fiche bail retiré v15.16 · appels DG/impayés retirés v15.16 · code JS conservé en lecture seule pour audit |
| 17 Polish UX | ⏳ Reporté audit | À traiter onglet par onglet avec user |

**Bilan marathon V1.1 complet (Sprints 6-17)** :

| Sprint | Versions | Livré | Effort |
|---|---|---|---|
| 6 | v15.04 | USER-PROFILE-FILTERS | ~4h |
| 7+7B | v15.05-06 | LEGAL-DPE-INTERDICTION + DIAGNOSTICS-DDT | ~7h |
| 8 | v15.07 | PILOTAGE-MATRICIEL + BANK-INTEGRATION V1 | ~12h |
| 9 | v15.08 | EQUIP-CONTROLES-PERIODIQUES | ~5.5h |
| 10 | v15.09 | EMAIL-AUTO extension | ~4h |
| 11 | v15.10/11 | IRL-REVISION-UX-FIX + Quittances actives | ~8h |
| 12 | v15.12 | Gestion DG & Impayés | ~6h |
| 13 | v15.13 | DASH-PROFILES Phase 2 | ~3h |
| 14-17 | v15.14-17 | Fixes UX + cleanup | ~2h |
| **Total** | **v15.04 → v15.17** | **11 sujets P1/P2 + 13 modules core/** | **~52h** |

**Tests Vitest** : 713 passants (vs 378 avant marathon → +335 nouveaux tests, 26 fichiers, zéro régression).

**Prochaine étape** : audit onglet par onglet ensemble (post-marathon).

---

### Sprint 13 V1.1 — DASH-PROFILES Phase 2 (4 onglets dashboard par persona) — session 2026-05-14 (~3h, v15.13)
> Sprint 13 du marathon V1.1. **Sujet DASH-PROFILES Phase 2 ✅ clos** : implémentation des 4 onglets dashboard (Propriétaire / Gestionnaire / Complet / Custom) avec persist `DB.params.dashTab` et presets densifiés par persona. **Aucun concurrent (Rentila/BailFacile/Qalimo/Smovin) ne fait ça** — argument marketing premium pricing.

| Code | Sujet | Note |
|---|---|---|
| DASH-PROFILES Phase 2 | ✅ Livré (~3h). **Phases 2a-2f** : Onglets en haut du dashboard avec 4 vues (🏠 Propriétaire / 🛠 Gestionnaire / 📊 Complet / ✦ Custom). Persist `DB.params.dashTab` (décision D1=B : par-utilisateur, sync Drive). Helper `setDashTab(tab, e)` + `_currentDashTab()`. **Presets densifiés** dans `DASH_TAB_PRESETS` : Propriétaire = vue 1-écran finance (cache agenda+gestion), Gestionnaire = vue ops (cache KPIs finance lourds, garde À-faire/agenda/vacances/impayés). Complet = défaut/saved layout, Custom = layout utilisateur drag-drop (décision D2=B). Drill-down par bien via `dash-ent-cards` existant → fiche logement 360° (décision D3=A). Migration douce `initDB()` default `'proprio'`. | v15.13 · [docs/subjects/DASH-PROFILES.md](docs/subjects/DASH-PROFILES.md) |
| Tests Vitest | **713 toujours passants** (refactor purement UI, pas de nouvelle logique testable). 26 fichiers de tests. Zéro régression. | |

**Différenciant marché** :
- Rentila/BailFacile/Qalimo/Smovin/ImmobilierLoyer : **aucun n'a de dashboard par persona**
- ImmoTrack v15.13 : ⭐ unique sur le marché B2C/SCI · 4 vues qui s'adaptent au cas d'usage du moment

**Sandbox-first** respecté. Bump v15.12 → v15.13.

---

### Sprint 12 V1.1 — Gestion DG & Impayés — session 2026-05-14 (~6h, v15.12)
> Sprint 12 du marathon V1.1. **2 blocs livrés** : Gestion DG (tracking + restitution avec calcul délai légal auto) + Gestion Impayés avancée (vue centralisée + plan d'apurement + procédure judiciaire 5 étapes). Bonus : fix UX Sprint 11 v15.11 (cartes IRL compactes + bouton Fermer discret + bouton "+ Règle" import bank).

| Code | Sujet | Note |
|---|---|---|
| Gestion DG (Bloc A) | ✅ Livré (~3h). Module `js/core/gestion-dg-impayes.js` (8 KB, 8 exports) + shadow inline. **Helpers purs** : `_dgStatut` (6 états : manquant/partiel/complet/a_restituer/restitue/en_retard) · `_calculerDelaiRestitution` (1 mois si EDL sortie sans dégradation, 2 mois sinon loi 89-462 art. 22 ALUR 2014) · `_calculerSoldeDG` (DG versé - retenues - loyers impayés cumulés). **UI** : modale `#ov-dg-restitution` avec calcul auto-recalculé live + détail retenues + IBAN + date · alertes dashboard graduées (J-30 / J-7 / J+0 / J+1+ retard avec pénalité 10%/mois loi ALUR) + alertes DG manquant/partiel pendant bail. | v15.12 |
| Gestion Impayés avancée (Bloc B) | ✅ Livré (~3h). **Helpers** : `_planApurementStatut` (a_jour/retard/termine/aucun avec retardJours) · `_procedureJudiciaireEtat` (5 états : mise_en_demeure / commandement_payer / assignation / jugement / cloturee) · `_listerImpayesActifs` (agrégation tri par avancement procédure puis ancienneté). **UI** : bouton "💰 Impayés actifs" dans Pilotage matriciel → modale `#ov-impayes-vue` table récap + colonne statut coloré + modale `#ov-impayes-actions` (hub : email rappels + plan apurement + procédure) · modale `#ov-plan-apurement` saisie échéances avec checkbox payée + tracking · modale `#ov-procedure` 5 étapes datées (LRAR / commandement huissier / assignation tribunal / jugement / clôture) avec audit-trail. | v15.12 |
| Tests Vitest | **713 passants** (vs 679 Sprint 11 → +34 gestion-dg-impayes). 26 fichiers de tests. Zéro régression. | |

**Différenciant marché** :
- Rentila/BailFacile : 0 workflow DG · 0 procédure judiciaire trackée
- Qalimo V2 : tracking DG basique · partial procédure
- **ImmoTrack v15.12** : ⭐ délai légal DG auto-calculé (1/2 mois) selon EDL sortie + alertes pénalité 10%/mois + procédure judiciaire 5 étapes documentées avec audit-trail RGPD

**Sandbox-first** respecté. Bump v15.10 → v15.12 (v15.11 = fix UX intermédiaire).

---

### Sprint 11 V1.1 — IRL-REVISION-UX-FIX + Quittances actives — session 2026-05-14 (~8h, v15.10)
> Sprint 11 du marathon V1.1. **2 sujets P1 clos** : IRL-REVISION-UX-FIX (refonte UX cartes + bouton unique + logique temporelle stricte loi 89-462 art. 17-1) + Quittances actives (statut dynamique 7 états + matching paiement + escalade graduée 4 niveaux + génération auto mensuelle). Intégration EMAIL-AUTO Sprint 10 via les rappels d'escalade. **Différenciant marché majeur** : quittance mai 2026 = ancien loyer, quittance juin = nouveau (impossible avant v15.10 où `bail.hc` était muté direct).

| Code | Sujet | Note |
|---|---|---|
| IRL-REVISION-UX-FIX | ✅ Livré complet (~3.5h, Bloc A). **3 remarques utilisateur 2026-05-14 respectées** : (1) UX cartes cohérentes design system, (2) bouton unique "Valider et envoyer", (3) `bail.hc` jamais muté direct, `_loyerHCAtDate` consommateur. **Phases 1-6** : refonte rIRL() en grid 320px responsive · 4 statuts visuels colorés (À valider / Envoyée en attente / Appliquée / Gel DPE F/G) · modale `#ov-irl-valider` aperçu structuré · `applyIRL` rewrite avec `pendingApply` + `dateApplication` + cron boot `_applyPendingIRLRevisions` (vérif cohérence avant mutation) · section "📈 Historique des révisions IRL" dans LOG-FICHE-360 · audit migration baux existants (toast warning, pas de mutation auto). Toggle vue cartes↔tableau persisté localStorage. | v15.10 · [docs/subjects/IRL-REVISION-UX-FIX.md](docs/subjects/IRL-REVISION-UX-FIX.md) |
| Quittances actives | ✅ Livré complet (~4.5h, Bloc B). Sujet transversal (QUIT-EMAIL + AVIS-ECHEANCE + RAPPEL-IMPAYE intégrés). Module `js/core/quittances-actives.js` (5 KB, 5 exports) + shadow inline. **Statut dynamique 7 états** (`_statutQuittance`) : attendue / payée / partielle / impayée_J5 / impayée_J15 / impayée_J30 / mise_en_demeure. **Matching auto paiement** dans `saveMv` : nouveau mvt Loyers + qui=ref → association à `quittance.paymentMatchedMvtId`. **Escalade dashboard 4 niveaux** : alertes graduées avec lien direct vers l'email correspondant via templates Sprint 10 (avis-echeance / rappel-impaye-1 / rappel-impaye-2 / rappel-impaye-3). **Génération auto mensuelle** : toggle `DB.params.quittancesAutoGen` dans Paramètres + cron boot idempotent `_quittancesAutoGenAtBoot`. **33 nouveaux tests Vitest** dans `quittances-actives.test.js` (statut ×17 + matching ×6 + escalade ×6 + plan génération ×7). | v15.10 |
| Tests Vitest | **679 passants** (vs 646 Sprint 10 → +33 quittances-actives). 25 fichiers de tests. Zéro régression. | |

**Différenciant marché** :
- Rentila/BailFacile : génération manuelle + 0 suivi paiement automatique
- Qalimo V2 : génération auto + alerte impayé simple
- **ImmoTrack v15.10** : ⭐ logique temporelle stricte IRL (cohérent loi 89-462 art. 17-1) + 7 statuts dynamiques + matching auto + escalade 4 niveaux liée aux 29 templates email + génération auto idempotente

**Sandbox-first** respecté. Bump v15.09 → v15.10.

---

### Sprint 10 V1.1 — EMAIL-AUTO extension cycle locataire complet — session 2026-05-14 (~4h, v15.09)
> Sprint 10 du marathon V1.1. Sujet **EMAIL-AUTO** ✅ clos avec 29 types couvrant tout le cycle de vie du bail (signature → entrée → vie → fin → sortie) + **hub centralisé UX** (1 endroit > 19 boutons disséminés) + historique RGPD-compliant. Différenciant marché : aucun concurrent ne propose une telle granularité.

| Code | Sujet | Note |
|---|---|---|
| EMAIL-AUTO extension V1.1 | ✅ Livré (~4h). 19 nouveaux templates dans `js/core/email-compose.js` (29 types total vs 10 V1) avec variables interpolées, PJ + notes légales. Hub centralisé **"📧 Communications"** dans fiche logement onglet Bail : modal `#ov-comms-hub` groupe 29 types par 5 phases (Signature / Entrée / Vie du bail / Fin / Sortie) avec icônes, badges historique "✓ déjà envoyé". Prompts UI auto pour variables manquantes (dates EDL, IBAN, motifs, montants retenue DG). Helper `_buildEmailCtxFromRef(ref, extra)` factorise la construction du contexte. Section **"📧 Historique communications"** dans la fiche logement listant les 10 dernières communications (date, type, sujet, destinataire, statut). 21 nouveaux tests Vitest (62 total `email-compose.test.js`). 4 templates candidat-* reportés post LOG-CANDIDATS futur. | v15.09 · [docs/subjects/EMAIL-AUTO.md](docs/subjects/EMAIL-AUTO.md) |
| Tests Vitest | **646 passants** (vs 625 Sprint 9 → +21). 24 fichiers de tests. Zéro régression. | |

**Couverture cible atteinte** : 0 communication ad-hoc — toutes les communications bailleur ↔ locataire au cours du bail passent par les templates ImmoTrack avec historisation RGPD-compliant. **Hub centralisé** UX choisie vs boutons disséminés (1 endroit visible > scrolling cherche boutons).

**Différenciant marché** :
- Rentila/BailFacile : quittance + IRL templates basiques
- Qalimo V2 : ~8 templates standards
- ImmoTrack v15.09 : ⭐ **29 templates** couvrant 6 phases + variables interpolées + hub UX + historique automatique

**Sandbox-first** respecté. Bump v15.08 → v15.09.

---

### Sprint 9 V1.1 — EQUIP-CONTROLES-PERIODIQUES complet + fix jargon DDT — session 2026-05-14 (~5.5h, v15.08)
> Sprint 9 "Légal équipements" du marathon V1.1. Sujet **EQUIP-CONTROLES-PERIODIQUES** ✅ clos en 6 phases. **Différenciant juridique fort** : photo DAAF EDL = preuve juridique en cas d'incendie (aucun concurrent ne le fait). Capture en bonus de la **règle UX anti-jargon** suite au feedback "c'est quoi DDT ?".

| Code | Sujet | Note |
|---|---|---|
| EQUIP-CONTROLES-PERIODIQUES | ✅ Livré complet (~5h). 17 règles EQUIP_RULES (vs 12 avant) avec ECS gaz/thermo, climatisation > 12 kW, citerne fioul, VMC indiv info-only. condFn(bail, log) lit `log.equipements.*` pour les nouvelles règles. **Section UI "Configuration équipements"** dépliable dans chaque card onglet Équipements (5 champs + bloc DAAF dédié). **Article bail 11.1 bis** "Équipements spécifiques" auto-injecté avec liste personnalisée + mention DAAF obligatoire (loi 2010-238 R129-13). **Section EDL "🚨 Sécurité incendie — DAAF"** entre §1 et §2 compteurs : radio statut (présent/défaut/absent) + photo recommandée + warning juridique rouge si absent. Persistance `edl.daaf` + sync `log.equipements.daafPresent`. Migration douce `initDB()` 8 champs par défaut. Module `js/core/equipements.js` + 34 tests Vitest (_calculerProchainControle, _buildClauseEntretienItems, _isDaafCovered). | v15.08 · [docs/subjects/EQUIP-CONTROLES-PERIODIQUES.md](docs/subjects/EQUIP-CONTROLES-PERIODIQUES.md) |
| Fix jargon DDT (bonus session) | ✅ Tous les libellés UI "DDT" remplacés par "Diagnostics" / "Dossier de diagnostic technique" en clair (badges, modales, alertes dashboard, colonnes Pilotage, nom PDF, popup impression). DDT conservé uniquement dans le bail PDF signé (terme légal cité par loi 89-462). **Règle UX anti-jargon captée dans BACKLOG.md section Vision produit** avec tableau "À éviter / À utiliser" (DDT, DPE F/G, MRH, EDL, CRG, CREP, etc.). | v15.08 |
| Tests Vitest | **625 passants** (vs 591 Sprint 8 → +34 equipements). 24 fichiers de tests. Zéro régression. | |

**Différenciant marché** :
- Rentila/BailFacile/Qalimo : liste basique d'équipements + alertes basiques, **pas de photo DAAF EDL**
- ImmoTrack v15.08 : 5 catégories locataire auto-détectées + clauses bail générées + **photo DAAF EDL = preuve juridique post-incendie**

**Sandbox-first** respecté. Bump v15.07 → v15.08.

---

### Sprint 8 V1.1 — PILOTAGE-MATRICIEL complet + BANK-INTEGRATION V1 — session 2026-05-13/14 (~12h, v15.07)
> Sprint 8 "Pilotage & Bank" du marathon V1.1. **2 sujets P1 livrés intégralement en une session** (vision user "on ne fait pas à moitié"). PILOTAGE-MATRICIEL = différenciant pro Qalimo V2, BANK-INTEGRATION V1 = différenciant FR sans concurrence (Rentila/BailFacile/Qalimo ont aucun import bancaire dans le V1). 591 tests passants (+88 vs Sprint 7B).

| Code | Sujet | Note |
|---|---|---|
| PILOTAGE-MATRICIEL | ✅ Livré complet (~7h). Vue matricielle multi-baux gestionnaire pro, parité Qalimo V2. **6 phases** : (1) Onglet sidebar `🎛 Pilotage` + page 4 sous-onglets + route. (2) Suivi comptable — tableau locataire × DG + Solde cumulé + 4 mois M-3..M, bulk select + bouton `📈 Mettre à jour les loyers` avec exclusion auto gel DPE F/G + IRL N-1 manquant. Helpers `_pilSoldeLocataire`, `_pilBulkMajLoyersSimule`. (3) Suivi documents — tableau × 6 colonnes Bail/EDL/MRH/Chauffage/Caution/DDT avec badges colorés. Helper `_pilStatutDoc`. (4) Automatisations override par bail — 8 toggles avec héritage bailleur + override `bail.automatisations`, icône ⇧ si override, bouton reset. (5) Stub Prélèvements V1 (V2 SaaS). (6) Tests Vitest `pilotage.test.js` — **36 nouveaux tests** purs. Le tab Pilotage est masqué automatiquement pour profil solo/SCI via la matrice USER-PROFILE-FILTERS livrée Sprint 6 (`data-module="pilotage-matriciel"` → visible Pro/Mandataire uniquement). | v15.07 · [docs/subjects/PILOTAGE-MATRICIEL.md](docs/subjects/PILOTAGE-MATRICIEL.md) |
| BANK-INTEGRATION V1 | ✅ V1 CSV/OFX complet (~5h, **0€ coût récurrent**). Module `js/core/bank-import.js` (10 KB, 8 exports) + shadow inline complet pour mode file://. Parsers CSV (détection auto délimiteur ;/,/tab + champs guillemets) + OFX (SGML/XML standard) + amounts FR/EN + dates ISO/FR/OFX. Auto-détection colonnes par heuristiques. Matching auto par nom locataire ×3 chars + montant ≈ loyer attendu ±5€ + 8 mots-clés catégoriels (assurance/EDF/syndic/travaux/taxe foncière/emprunt/notaire/diagnostic). Dédup par fitid OFX exact (match certain) ou date ±3j + montant ±1€. UI : bouton `🏦 Importer banque` dans onglet Mouvements → modale upload+preview+correction+confirm avec selects catégorie/bail prélus + badges doublons + checkboxes par ligne. Persistance `DB.mouvements` avec `_source:'bank_import'` + audit-trail. **52 tests Vitest** dans `bank-import.test.js`. **V2 Saltedge backend** (Cloudflare Worker + OAuth DSP2 + KMS) explicitement reporté post-SAAS-MULTIUSERS (~50h, nécessite mode SaaS commercial avec Pro Connect +5€/mois). | v15.07 · [docs/subjects/BANK-INTEGRATION.md](docs/subjects/BANK-INTEGRATION.md) |
| Tests Vitest | **591 passants** (vs 503 Sprint 7B → +88 nouveaux : 36 pilotage + 52 bank-import). 23 fichiers de tests. Zéro régression. | |

**Différenciants marché v15.07** :
- Rentila/BailFacile : ❌ pas de vue matricielle pro · ❌ pas d'import bancaire
- Qalimo V2 : ⭐ vue Pilotage 4 sous-onglets · ✅ intégration bancaire (via Bridge/Linxo)
- ImmoTrack v15.07 : ⭐ parité Qalimo Pilotage + bulk IRL avec exclusion DPE auto · ⭐ import CSV/OFX V1 (0€, offline-first) + V2 Saltedge prête en architecture

**Sandbox-first** : `index-test.html` uniquement. Prod intacte.

---

### Sprint 7B V1.1 — BAILLEUR-DIAGNOSTICS-DDT Phases 2-3-4 (clôture du sujet) — session 2026-05-13 (~2.5h, v15.06)
> Continuation du Sprint 7 sur demande utilisateur (cohérence sujet). 3 phases complètes : récap DDT imprimable + PDF, bloquage bail soft (override "à mes risques"), alertes dashboard. **Sujet BAILLEUR-DIAGNOSTICS-DDT ✅ complet (5 phases en ~5h total)**.

| Code | Sujet | Note |
|---|---|---|
| BAILLEUR-DIAGNOSTICS-DDT Phase 2 | ✅ Récap DDT imprimable. Bouton `📎 Récap DDT` dans sous-onglet Diagnostics → modale `#ov-ddt-recap` avec page de garde (bailleur entité + logement + adresse + année construction) + tableau récap 9 diagnostics (icône + label + classe DPE + statut badge + détail date/expiration + diagnostiqueur) + cadre légal + 3 boutons : Fermer / 🖨 Imprimer (window.print sur popup) / 📄 Télécharger PDF (jsPDF + html2canvas multi-pages A4). Helper `_buildDdtRecapHTML(log)` print-friendly. **Limite explicite** : pas de concaténation des PDF source des diagnostics (sera fait en V2 avec pdf-lib si demandé) — chaque PJ reste dans Drive accessible séparément. | v15.06 |
| BAILLEUR-DIAGNOSTICS-DDT Phase 3 | ✅ Bloquage bail si DDT incomplet (override "à mes risques"). Intercepte `saveBail()` ligne ~10240 après le check DPE interdit strict. Si `_ddtComplet().complet=false` → modale orange `#ov-ddt-incomplet` (≠ rouge DPE interdit) listant les diagnostics manquants + expirés + 3 boutons : Annuler / **⚠ Continuer quand même** (force la sauvegarde + log audit-trail `_auditLog('override','bail',ref,'DDT_INCOMPLET_FORCE')` + flag `_skipDdtCheckOnce` consommé une fois) / **✦ Mettre à jour** (redirige fiche logement onglet Diagnostics). Override conscient et tracé = RGPD-compliant. Différent de LEGAL-DPE-INTERDICTION qui est strict (pas d'override). | v15.06 |
| BAILLEUR-DIAGNOSTICS-DDT Phase 4 | ✅ Alertes Conformité dashboard. Intégration dans `rAlertsSection()` du dashboard : 2 nouveaux types d'alertes (🏷 DDT incomplet — warn pour chaque logement loué avec `_ddtComplet` incomplet ; 🌡 DPE expire bientôt — info, anticipation rénovation 12 mois avant pour éviter gel IRL F/G). Liens cliquables qui ouvrent `openLogFiche(ref) + setLogFicheTab('diagnostics')` en 200ms. Compteur intégré au pill dashboard existant. | v15.06 |

**Différenciant marché total BAILLEUR-DIAGNOSTICS-DDT v15.05+v15.06** : DDT 9 diagnostics auto-détectés par contexte logement + récap imprimable PDF + bloquage bail avec override tracé + alertes dashboard intégrées. Aucun concurrent (Rentila/BailFacile/Qalimo) ne couvre cette parité bailleur pro.

**Tests Vitest** : 503 toujours passants (rien cassé) — Phases 2-4 sont UI + intégration, pas de nouveaux helpers purs à tester.

---

### Sprint 7 V1.1 — DPE & Différenciants (LEGAL-DPE-INTERDICTION-LOCATION + BAILLEUR-DIAGNOSTICS-DDT Phase 1+5) — session 2026-05-13 (~4.5h, v15.05)
> Sprint 7 "DPE & Différenciants" du marathon V1.1. Réponse à 2 trous légaux V1 critiques détectés à l'audit 360° : (1) absence de blocage strict bail si DPE interdit loi Climat 2021 → amende 15 000 € + nullité bail ; (2) absence d'UI pour les 9 diagnostics obligatoires bailleur (DDT loi 89-462 art. 3-3). Différenciant marché clair vs Rentila/BailFacile qui ne couvrent ni l'un ni l'autre.

| Code | Sujet | Note |
|---|---|---|
| LEGAL-DPE-INTERDICTION-LOCATION | ✅ Complet (~2h). Helper `_dpeInterditLocationAuDate(dpe, dateRef)` dans `js/core/utils.js` + inline shadow + exposition window via `js/main.js`. Calendrier loi Climat 2021-1104 art. 23 : G interdit 2025, F interdit 2028, E interdit 2034. Bloquage `saveBail()` ligne ~10230 : intercepte avant écriture DB → modale rouge `#ov-dpe-interdit` avec bandeau ⛔ + raison + calendrier + boutons "Annuler" / "Mettre à jour DPE" (redirige fiche logement). Override **impossible** (différent de DDT bloquage qui aura override "à mes risques" en Phase 3 BAILLEUR-DIAGNOSTICS-DDT). Couvre création + renouvellement (check sur `bail.debut`). Tests Vitest : 20 nouveaux dans `dpe.test.js` (DPE A-D jamais interdits ×4 + G 2025 ×3 + F 2028 ×3 + E 2034 ×2 + edge cases ×6 + calendrier expose ×2). | v15.05 · [docs/subjects/LEGAL-DPE-INTERDICTION-LOCATION.md](docs/subjects/LEGAL-DPE-INTERDICTION-LOCATION.md) |
| BAILLEUR-DIAGNOSTICS-DDT Phase 1+5 | 🔄 Phases 1+5 livrées (~2.5h). Module `js/core/diagnostics.js` (8 KB) + helpers inline shadow : catalogue 9 diagnostics (`DIAGS_CATALOG` : DPE/CREP/amiante/gaz/élec/ERP/termites/mérule/bruit) avec validité légale + référence texte + auto-détection applicabilité par contexte logement (CREP <1949, amiante <1997, gaz/élec >15 ans installation, ERP zone risques par défaut, termites/mérule/PEB sur déclaration). Helpers purs `_diagCatalogEntry`, `_diagGet` (rétrocompat champs flat DPE), `_estDiagApplicable`, `_diagDateExpiration` (string-based pour éviter bug timezone setMonth), `_estDiagExpire`, `_diagStatut` (6 statuts : valide/expirebientot/expire/na/inapplicable/manquant), `_ddtComplet`. UI : nouveau sous-onglet `🏷 Diagnostics` dans `LOG-FICHE-360` à côté de Conformité, badge DDT complet/incomplet en header, 9 cartes statut + section "Contexte logement" (année construction + installation gaz/élec + 4 cases zones réglementaires) + modale d'édition par diagnostic `#ov-diag-edit` avec champs spécifiques (DPE → classe + kWh ; CREP/amiante/termites/mérule → présence oui/non ; gaz/élec → conforme oui/non) + audit-trail sur save. Phases 2 (génération auto PDF DDT) + 3 (bloquage bail si DDT incomplet) + 4 (alertes dashboard lentille Conformité) reportées Sprint 8 V1.1 (~3-4h restants). Tests Vitest : 37 nouveaux dans `diagnostics.test.js` (catalogue + lookup + rétrocompat + applicabilité × 10 + dates + expire + statut + DDT complet). | v15.05 · [docs/subjects/BAILLEUR-DIAGNOSTICS-DDT.md](docs/subjects/BAILLEUR-DIAGNOSTICS-DDT.md) |
| Tests Vitest | 503 tests passants au total (vs 446 avant Sprint 7) — +57 nouveaux (20 DPE + 37 diagnostics). Zéro régression. 21 fichiers de tests. | |

**Différenciant marché** :
- Rentila/BailFacile : ❌ aucun blocage DPE interdit + ❌ pas d'UI DDT structurée
- Qalimo V2 : partial blocage DPE (warning sans blocage strict) + ❌ pas d'UI DDT auto-détectée par contexte
- ImmoTrack v15.05 : ⭐ blocage strict loi Climat (override impossible) + ⭐ DDT 9 diagnostics auto-détectés par âge logement et zone

**Sandbox-first respecté** : tout dans `index-test.html` uniquement. Prod intacte v14.99/15.00.

---

### Sprint 6 V1.1 — USER-PROFILE-FILTERS + résiduel BUG-CHARGE-001/BUG-DASH-001 — session 2026-05-13 (~4h, v15.04)
> Sprint 6 "Foundations Simplicité" du marathon V1.1. Réponse à la demande user 2026-05-13 « solution simple d'utilisation et UX améliorée + filtres d'activation ». Différenciant marché unique vs Qalimo/Rentila/BailFacile qui montrent tout à tous.

| Code | Sujet | Note |
|---|---|---|
| USER-PROFILE-FILTERS | 4 profils utilisateur (solo / sci_familiale / pro / mandataire) + matrice 15 modules + setup wizard 4 questions + UI Paramètres avec override toggles. **5 phases livrées** : (1) Modèle `DB.params.userProfile/modulesEnabled/profileWizardDone` + helpers `_calculateProfile`, `_isModuleEnabled` + wizard modal `#ov-profile-wizard` (4 questions : nb logements, statut, mandataire, compta) avec live preview du profil calculé. (2) Matrice 15 modules × 4 profils inline dans `_isModuleEnabled` (CORE 12 modules toujours actifs, SOLO_OFF 10 modules masqués pour particulier, SCI_OFF/PRO_OFF subset, mandataire = tout actif). (3) Sidebar dynamique : `data-module="..."` sur 14 tabs + `data-module-section="..."` sur 5 sections + helper `_renderSidebarFiltered()` qui masque tabs+sections vides. Trigger boot après `initDB()` + appel après save wizard. (4) Onglet Paramètres "👤 Profil utilisateur" + `rParamsProfile()` : badge profil actuel, récap réponses wizard, 14 toggles modules (override individuel par module), bouton réinit + bouton modifier profil. (5) Tests Vitest `profile.test.js` : 68 tests (calcul profil ×13 + matrice modules ×42 + overrides ×4 + edge cases ×3 + cohérence labels). Hook boot 2.5s : wizard auto au 1er load si `profileWizardDone === false`, skippable (default solo). | v15.04 · [docs/subjects/USER-PROFILE-FILTERS.md](docs/subjects/USER-PROFILE-FILTERS.md) |
| BUG-CHARGE-001 résiduel | 6 sites legacy `m.cat !== 'Loyers'` détectés par audit complet (Explore agent) non couverts par v14.82 Sprint 1C. Convertis vers `!_isLoyerCategory(m.cat)` pour matcher legacy + LEGAL-2044 'Loyers encaissés'. Sites : `_buildRevDrill` (l.5627), `_getLogementStartIso` (l.5771), `_buildProgDrill` (l.5892 — CRITIQUE DASHBOARD), `_buildRdtDrill` (l.6542), KPI Immeuble buildDashWidget (l.7281), Sparkline rendement (l.7343). Grep final : 0 occurrence résiduelle de `m.cat !== 'Loyers'` dans index-test.html. | v15.04 |
| BUG-DASH-001 résiduel | Fix couvert par la conversion de `_buildProgDrill` (ligne 5892) dans BUG-CHARGE-001 résiduel — c'était le site critique manquant pour que les baux en vigueur dans le mois sélectionné soient correctement reconnus avec catégories LEGAL-2044. | v15.04 |
| Tests Vitest | 446 tests passants au total (vs 378 avant Sprint 6) — ajout `profile.test.js` 68 tests. Zéro régression sur les 378 tests existants. | 20 fichiers tests |

**Vision "pas copier concurrent"** : Profils + filtres modules = différenciant unique sur le marché bailleur français. Rentila/BailFacile/Qalimo n'ont aucun système de personnalisation UX. Notion/Linear (SaaS référence) ont les presets workspace, mais pas appliqués à l'immobilier.

**Architecture extensible** : Les modules "à venir" (dashboard-lentilles, bailleurs-multi, candidats, travaux, pilotage-matriciel, export-fec, mandat-crg-sepa, audit-trail-ui, carnet-adresse, bank-integration) sont déjà dans la matrice + dans les toggles UI Paramètres avec mention "À venir Sprint X" — quand on les livre, ils s'activent automatiquement selon profil sans toucher le wizard.

---

### ENT-CASCADE-FIXES + BIENS-TABS — session 2026-05-05/06 (~2h, 4 commits, v14.51 → v14.54)
> Détectés pendant la session DASH-PROFILES Phase 1 v2 (mockups). Utilisateur a renommé entité bailleur "Perso — Didier Keller" → "Didier Keller" et tous ses KPIs sont passés à 0. Diagnostic systématique → 3 bugs corrigés en cascade.

| Code | Sujet | Note |
|---|---|---|
| BUG-ENT-RENAME-CASCADE | `saveEnt()` ne propageait pas le renommage entité vers `.entity` (logements/baux/baux_historique/quittances) ni `.qui` (mouvements globaux SCI:nom) → KPIs dashboard à 0 silencieusement après rename. Fix : cascade ~20 lignes dans saveEnt avec garde `prevNom !== ent.nom` + skip tombstones + `_modifiedAt` pour merge Drive timestamp-aware. **Bonus normalisation Unicode à la saisie** (em-dash U+2014 / en-dash U+2013 / NBSP → ASCII safe) pour éviter pièges invisibles à l'œil. | v14.51 · commit `ee48bad` · [docs/subjects/BUG-ENT-RENAME-CASCADE.md](docs/subjects/BUG-ENT-RENAME-CASCADE.md) |
| BUG-ENT-ORPHANS-CLEANUP Phase 1 | Audit boot des rattachements orphelins (5 collections) avec helper `_auditOrphans()` + toast warning 9s + console.warn détaillée par entité inconnue. Délai 2200ms après boot pour ne pas spammer. | v14.52 · commit `7e209a5` |
| BUG-ENT-ORPHANS-CLEANUP Phase 2 | Modale UI "🛠 Maintenance — Rattachements orphelins" dans Paramètres globaux. Pour chaque entité orpheline : sélecteur d'entité active + boutons Rattacher (cascade rename) ou Supprimer (tombstone). Réutilise même logique que saveEnt v14.51. Détecte aussi mouvements globaux `SCI:nom`. | v14.53 · commit `79b93bc` · [docs/subjects/BUG-ENT-ORPHANS-CLEANUP.md](docs/subjects/BUG-ENT-ORPHANS-CLEANUP.md) |
| BUG-BIENS-TABS-FILTER | Page Biens / mode Bailleurs : toggle Tous/Archivés affichait les 3 mêmes cards. Fix `_renderBiensModeBailleurs` filtre via `_entsWithArchived()` quand `_biensTab==='archives'` + `_renderBailleurCard(ent, isArchivedTab)` compte logements selon scope. Empty state "Aucun bailleur n'a de bien archivé" + libellé compteur "actif(s)" / "archivé(s)". | v14.54 · commit `ae7b24b` · [docs/subjects/BUG-BIENS-TABS-FILTER.md](docs/subjects/BUG-BIENS-TABS-FILTER.md) |

**Migration de la donnée user déjà cassée** : 3 records corrigés en console (1 logement Delle + 1 bail + 1 quittance) avant que le fix v14.51 soit poussé en prod, pour ne pas attendre.

**Outils session promus en repo principal** : `screenshot-mockups.js` (puppeteer générateur PNG mockups, réutilisable Phase 2 DASH-PROFILES + futurs aperçus), `launch.json` (config preview server `npx http-server`), `package.json` + `.gitignore` (`node_modules/` + worktrees).

**Règle pilotage codifiée** : "BACKLOG en temps réel" — mise à jour à chaque livraison, pas en fin de session. Ajoutée dans `docs/PILOTAGE.md` + mémoire user `feedback_pilotage_realtime.md`.

### DASH-PROFILES Phase 1 aperçu — session 2026-05-01/05 (~5h, 2 commits)
| Code | Sujet | Note |
|---|---|---|
| DASH-PROFILES Phase 1 v1 | 8 lentilles dashboard proposées (Propriétaire / Financier / Gestionnaire / Fiscale 2044 / Investisseur / Échéances / Prévisionnel / Patrimoine). Mockups HTML cliquables + spec MD + 18 screenshots. | commit `6749a76` (v1 abandonnée v2) |
| DASH-PROFILES Phase 1 v2 | Refonte après feedback user "paillettes" (Investisseur/Prévisionnel/Patrimoine) + "redondant" (Échéances). 4 onglets retenus (Propriétaire 1-écran refonte profonde + Gestionnaire amélioré absorbant Échéances + Complet = prod actuelle + Custom = mode édition). 6 lentilles archivées dans `_attic/`. Effort Phase 2 ramené ~38 j-h → ~4.5 j-h. | commit `6749a76` · [DASH-PROFILES-SPEC.md](docs/strategie/DASH-PROFILES-SPEC.md) · ⏳ attente validation finale + 3 décisions D1-D3 |

### GANTT-OCCUPATION — session 2026-05-03 (~3h, 1 commit, v14.45) 🔥 Killer feature
> Plan d'occupation Gantt 36 mois (24 passés + mois courant + 11 futurs) sur la fiche immeuble 360°. Killer feature différenciante vs Qalimo / BailFacile / Smovin. FICHES-PARITE-360 Session 2 livrée.

| Code | Sujet | Note |
|---|---|---|
| GANTT-OCCUPATION | Sous-onglet « 📅 Plan d'occupation » sur fiche immeuble : Gantt 36 mois, 1 ligne par logement, barres bail colorées par locataire (hash HSL déterministe → mémoire visuelle inter-vues), mini-strip occupation globale, marker AUJOURD'HUI vertical animé, hover bar → highlight cross-row du locataire (parcours dans l'immeuble), click → drill-in fiche logement, segments réalisé vs projection (rayures), stats footer 3 KPIs (taux occup 24m / durée bail moyenne / manque à gagner cumulé). Helpers `_tenantColor`, `_renderImmFichePlanGantt`, `_ganttHighlight`, `setImmFicheTab`. CSS responsive 3 breakpoints (PC ≥ 1280 / tablette 768-1279 / mobile ≤ 600). | v14.45 · [docs/subjects/GANTT-OCCUPATION.md](docs/subjects/GANTT-OCCUPATION.md) |

### EDL-AUDIT-CRITIQUE — session 2026-05-03/04 (~3h, 7 commits, v14.38 → v14.44) 🔥 P0
> Refonte module EDL après audit complet (7 bugs remontés + 7 bugs latents = 14 bugs identifiés). 12 sur 14 fixés. **Loin d'une solution pro → maintenant utilisable en prod.**

| Code | Sujet | Note |
|---|---|---|
| EDL-AUDIT-CRITIQUE Audit | Audit complet du module EDL : 14 bugs identifiés (7 remontés utilisateur + 7 latents détectés), plan en 6 phases. **Aucun patch pendant l'audit** | spec [docs/subjects/EDL-AUDIT-CRITIQUE.md](docs/subjects/EDL-AUDIT-CRITIQUE.md) · commit `ad65abb` |
| Phase 1 v14.38 | Refonte archi état EDL : helper `_edlResetGlobalState()` reset 5 globales en bloc + appels inconditionnels dans openNewEDL/openEditEDL + pattern in-place pour préserver les références JS sur 3 sites de réassignation directe (`_edlP`, `_edlCles`, `_edlCptPhotos`) | commit `32dac3f` · **Bug 6 cross-contamination photos** ✅ |
| Phase 2 v14.39 | Sync form/DB après edlSyncDrive : helper `_edlPropagateSyncedToForm` matche par idbKey et propage synced=true vers `_edlP`/`_edlCles`/`_edlCptPhotos` après chaque upload + mutex `_edlSyncing` empêche concurrence + bouton UI disable pendant sync | commit `734e33c` · **Bug 1 doublons + Bug 9 concurrence** ✅ |
| Phase 3 v14.40 | Migration arbo Drive Phase A : edlSyncDrive utilise `log.driveFolders.edl` (DRIVE-ARBORESCENCE Phase A v14.20) avec fallback `_drvEnsureLogementTree` pour logements legacy + remplace `el('edl-drive-path').value` runtime par résolution stable depuis `edl.logement → DB.logements` | commit `693ee82` · **Bug 5 ancien chemin + Bug 10 drive-path runtime** ✅ |
| Phase 4a v14.41 | iOS Safari camera fix : helper `_edlPickPhoto(onPhotos)` qui attache l'input file au DOM (off-screen invisible) avant `.click()` au lieu d'un noeud orphelin → onchange fire correctement après bouton « Utiliser » caméra native iPhone. Refactor des 3 fonctions photo (pièces / clés / compteurs) | commit `22dd2c6` · **Bug 2 photos perdues iPhone + Bug 7 photos compteurs** ✅ |
| Phase 4b v14.42 | EDL signé verrouillé : pattern `edlSnapshot` répliqué de bailSnapshot v13.10 (capture clone du record au moment de la 1re signature complète) + bandeau jaune `#edl-locked-banner` + class CSS `.edl-signed-locked` qui désactive inputs/textareas/select + bouton « 🔓 Réinitialiser signature » avec double-confirm + warning légal + saveEDL préserve les sigs originales si EDL signé en DB (anti-écrasement par canvas vide) | commit `aa99ad7` · **Bug 3 signature perdue à réouverture + Bug 8 race signature au save** ✅ |
| Phase 5 v14.43 | Wizard bail saveDB return check : Path 1 vérifie le retour de `window.opener.saveDB()`. Si `false` (mode readonly Drive token expiré) → ne marque PAS `ok=true` → bascule sur Path 2 (localStorage direct) qui écrit même en readonly + toast warn explicite. Logging détaillé console.warn | commit `a23e682` · **Bug 4 bail signature locataire échouée mais PDF OK** ✅ |
| Phase 6 v14.44 | Polish UX : suppression du reset agressif `_photoCache={}` dans openEditEDL (vidait le cache pour TOUS les EDL pré-chargés) + progress bar dans bouton sync Drive (texte « ⏹ Annuler (M/N…) ») + bouton « ⏹ Annuler sync » avec flag `_edlSyncCancelRequested` qui break la boucle d'upload entre 2 photos | commit `09d82b3` · **Bug 11 cache + Bug 13 progress bar + Bug 14 annulation** ✅ |
| Bugs reportés | Bug 12 tombstone photos individuelles (cohérence multi-device fine — pas critique V1, à traiter si résurrection observée) · possible suite Bug 4 si reproduit malgré fix v14.43 — fournir logs DevTools |


### DRIVE-ARBORESCENCE — sessions 2026-05-02/03 (~5h, 4 commits, v14.20 + v14.35-36)
| Code | Sujet | Note |
|---|---|---|
| DRIVE-ARBORESCENCE Phase A | Création arborescence `ImmoTrack/{Entité}/{Immeuble}/{Logement}/[9 sous-dossiers]` (📋 EDL, 📜 Bail, 📄 Documents, 🖼️ Photos, 🧾 Quittances, 📈 IRL, 🛡️ MRH, 🔧 Travaux, ⚡ Charges) ; helpers `_drvImmoTrackRoot`/`_drvEnsureEntityFolder`/`_drvEnsureImmeubleFolder`/`_drvEnsureLogementTree` (parallélisation `Promise.all` 9 sous-dossiers) + `_drvRenameFolder`/`_drvTrashFolder` ; hooks fire-and-forget dans saveEnt/saveImm/saveParamLog/delEnt/delImm/delLog avec confirms create/rename/trash | v14.20 · commits `528eafe` + `03cd686` |
| DRIVE-ARBORESCENCE Phase B | Helper `_drvUploadDoc(logRef, category, file)` : compression image > 2 Mo (canvas resize 1600px max + jpeg 0.8) + refus > 10 Mo + nommage `{cat}_{ISO}_{file}.{ext}` ; collection plate `DB.documents = []` (cohérent avec assurances/mrh/quittances) ; propagation Drive bidirectionnelle (`_buildEntityPayload` + merge par id avec `_drvWins`/`_drvMark` + cascade dans `_cascadeDeleteEntity`). Helper sans UI utilisable par DOC-PJ et LOG-PHOTOS futurs. | v14.35 · commit `7997ce2` |
| DRIVE-ARBORESCENCE Phase D | Section UI Paramètres « 🗂️ Stockage Drive — Arborescence ImmoTrack » avec compteur dynamique `X / Y biens avec arborescence` (couleur vert/orange/bleu selon couverture, warn si Drive déconnecté) + bouton « 🔄 Réorganiser mon Drive » (chunks de 3 paralléles, idempotent skip biens déjà arborescence, toast progress incrémental) + bouton « 📂 Ouvrir mon dossier ImmoTrack dans Drive » (nouvel onglet). Hook `_drvUpdateStorageStats` dans `rParams`. Touch targets ≥ 44px, mode sombre testé. | v14.36 · commit `0d7928a` |
| Phase C reportée | Sync Drive→app lazy scan à l'ouverture de LOG-FICHE-360 (détecter fichiers déposés manuellement dans Drive) — sujet futur, sera utile quand DOC-PJ ou LOG-PHOTOS exposeront l'UI consommatrice. Pas bloquant pour V1 car helpers d'upload + arborescence en place. | Sujet futur |

### BUG-DRIVE-RESURRECTION — session 2026-05-03 (~2h, 4 commits, v14.30 → v14.32) 🔥 P0
| Code | Sujet | Note |
|---|---|---|
| BUG-DRIVE-RESURRECTION Phase 1 | Helper `_isAlive` + 10 fonctions `delX` converties au pattern tombstone (delLog/Imm/Ent/Bail/BailHist/Mv/Quit/Ass/Mrh/IRL) — préserve les champs de filtrage (entity, logement, qui, ref) pour cohérence avec `_buildEntityPayload` | v14.30 · commit `3ed2ac0` |
| BUG-DRIVE-RESURRECTION Phase 2 | Helper `_alive(coll)` polyvalent + filtrage tombstones dans 12 renderers principaux + helpers `immeubles()`/`_activeLogements()` + 3 sites SCI options (préventif crash sur `e.type` manquant) + IRL dictionnaire mixte (typeof number || _isAlive) | v14.31 · commit `94b2b07` |
| BUG-DRIVE-RESURRECTION Phase 3 | Cas spécial entité multi-device : helper `_cascadeDeleteEntity(entNom, entityId)` qui tombstone récursivement tous les sous-objets liés (logements/baux/mvt/quit/edl/ass/mrh/historique) ; hook local dans `delEnt` (DANS le `_undoOp` pour que la snapshot pré-modif capture l'état complet et l'undo restaure tout en bloc) ; hook pull dans `_mergeEntityPayload` quand `payload.entity._deleted === true` (cascade côté pull + early return) ; push fichier Drive avec `entity._deleted:true` au top-level géré automatiquement par `_driveAutoSaveNow` qui itère sur tombstones | v14.32 · commit `f77bcd2` |
| Cause racine | 10 fonctions delX faisaient `filter()` ou `delete` direct → l'objet disparaissait localement, saveDB poussait sa version locale, mais le merge UNION du pull ré-injectait l'objet absent → résurrection silencieuse (et propagation suppression bloquée multi-device). Seul `delEDL` (v14.4 BUG-EDL-DELETE-NOSYNC) avait déjà le pattern tombstone. | Spec [docs/subjects/BUG-DRIVE-RESURRECTION.md](docs/subjects/BUG-DRIVE-RESURRECTION.md) · commit spec `fdda0ec` |

### VACANCE-VIZ — session 2026-05-03 (~1h30, 1 commit, v14.29)
| Code | Sujet | Note |
|---|---|---|
| VACANCE-VIZ | Visualisation manque à gagner sur fiche logement 360° : (a) bandeau status loué/vacant en haut (vert/rouge avec montant), (b) timeline 24 mois SVG (mois loué vs vacant, tooltips natifs), (c) refonte 4ᵉ KPI Compta « Vacance % » → « Manque à gagner -Y € » avec sub « X% vacance ». Réutilise `_getActiveBailHcCh` existant (fallback dernier bail = mémoire du loyer en vacance). Helpers factorisables : `_daysBetweenIso`, `_monthsBetweenIso`, `_getLastBailForLog`, `_getLastClosedBailEndIso`, `_renderLogFicheOccupationBanner`, `_renderLogFicheTimeline24`. | v14.29 · [docs/subjects/VACANCE-VIZ.md](docs/subjects/VACANCE-VIZ.md) |

### BUG-DEL-FICHE-360 + UX-IMM-MODAL + REFRESH-LIVE — sessions 2026-05-02/03 (~2h, 3 commits, v14.26 → v14.28)
| Code | Sujet | Note |
|---|---|---|
| BUG-DEL-FICHE-360 | Fix régression UX post-UNDO-OP : `delLog`/`delImm`/`delEnt`/`delBail` ne fermaient plus la modale d'édition ni ne quittaient la fiche 360° de l'élément supprimé. Ajout `closeM('ov-X')` + `closeXFiche()` conditionnel **avant** le `_undoOp` (préserve Ctrl+Z) | v14.26 · [docs/subjects/BUG-DEL-FICHE-360.md](docs/subjects/BUG-DEL-FICHE-360.md) |
| UX-IMM-MODAL | Modale immeuble rendue **autonome** (« 1 création = 1 bulle ») : section Immeubles retirée de `ov-ent`, hidden `imm-ent-id` ajouté à `ov-imm`, refacto `addImmForm/editImm/delImm/saveImm` avec `entIdOverride`, `openNewImm`/`_confirmImmPicker` n'ouvrent plus `ov-ent` intermédiaire, bouton « + Immeuble » sur fiche bailleur 360°, menu ⋮ carte building enfin opérationnel (kind prioritaire sur ref) | v14.27 · [docs/subjects/BUG-DEL-FICHE-360.md](docs/subjects/BUG-DEL-FICHE-360.md) (volet 2) |
| REFRESH-LIVE | Helper centralisé `_refreshAfterMutation()` injecté dans **19 sites** (saveParamLog, saveBail x2, saveMv, saveQuit, saveEnt, saveImm, saveAss, saveMrh + 10 del*). Création/édition/suppression désormais reflétées **instantanément** sur la fiche 360° courante (avant : page figée jusqu'au reload manuel) | v14.28 · [docs/subjects/BUG-DEL-FICHE-360.md](docs/subjects/BUG-DEL-FICHE-360.md) (volet 3) |

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

### 2026-05-10 — 🚨 AUDIT TRANSVERSAL POST-FIX = MANDATORY (pas optionnel)
- Citation user : *« tu me fatigues ! faire un audit suite au bug est mandatory pas optionnel ! »*
- Précédent : v14.79 j'avais présenté « c'est corrigé » sans audit transversal des call-sites. Le user a dû me demander 2 fois (« as-tu fait l'audit ? ») avant que je le fasse réellement.
- L'audit a révélé 2 bugs supplémentaires non fixés (ytdMvts L23049 + confirmSplitMvList L11434) — preuve directe de la nécessité de la règle.
- **Règle gravée** : à chaque fix, AVANT de dire « corrigé », exécuter les 6 étapes de `feedback_modify_verify.md` § « RÈGLE ABSOLUE ». Pas négociable.

### 2026-05-07 — 🛑 Modification + vérification TOUJOURS
- **Règle non négociable** captée après 6 itérations cassées en chaîne (v14.62→67 SANDBOX-MODE)
- Citation user : *« on vérifie tout ce qu'on a fait pour être sur que c'est bien fait ! […] modification + vérification toujour stoujours !! »*
- Avant CHAQUE bump et CHAQUE demande de test :
  1. Grep le symbole modifié → tous les sites collatéraux protégés ?
  2. Si user teste sur fichier dérivé (`index-test.html`) → copier le fix + vérifier la copie
  3. Si modif d'init/migration → penser au state localStorage déjà persisté (cleanup ou migration)
  4. Si nouvel écran vide → guider l'utilisateur (pas de "vide non guidé")
  5. Test mental Ctrl+F5 : "qu'est-ce que je vois et qu'est-ce que je dois faire ?"
- Référence : mémoire `feedback_modify_verify.md`

### 2026-05-07 — 🚀 Penser déploiement + commercialisation TOUJOURS
- **Règle non négociable** : ImmoTrack est destiné à être commercialisé (cf `project_commercialization.md`). Chaque feature doit être conçue pour le marché SaaS, pas juste pour le besoin perso.
- Citation user : *« il faut penser déploiement et commercialisation (à mettre dans le doc des règles !) »*
- 2 options à chaque conception :
  - **Option A — Complet** : tous statuts juridiques (particulier/SCI/SARL/LMP/LMNP/Hoguet) + tous profils + responsive 3 formats + propagation Drive
  - **Option B — Nécessaire + extensible** : minimum vital + mécanisme d'extension UI (bouton « + nouveau type » + stockage `DB.params.X[]`)
  - **Interdit Option C** : « pour mon besoin uniquement » sans extension UI → mur invisible avant le lancement commercial
- À la livraison d'une feature, marquer dans `docs/subjects/X.md` :
  - ✅ Statuts juridiques couverts · ✅ Profils utilisateurs · ✅ Mécanisme d'extension · ⚠ Hors scope
- Référence : mémoire `feedback_deploy_commercialize.md`

### 2026-05-07 — 🤐 Pas d'idées pour proposer · Si tu ne sais pas, dis-le
- **Règle non négociable** captée après proposition non motivée (charges propriétaires hors scope V1, inventées « pour avoir l'air complet »)
- Citation user : *« me propose pas des idées pour proposer. Si tu n'as pas d'idées tu ne dis rien. Idem si tu ne sais pas tu le dis : à noter dans les règles »*
- Une proposition n'est valide QUE si elle s'appuie sur 1 des 4 :
  1. Cas réel rencontré par le user (qu'il a explicité)
  2. Obligation légale citée précisément
  3. Référence dans le code existant qui appelle l'extension
  4. Référence dans `project_commercialization.md` ou `BACKLOG.md`
- Si aucun des 4 ne s'applique → **silence ou question**, pas de fluff
- Formulations autorisées : « Je ne sais pas » · « À confirmer » · « Hors de mon périmètre »
- Référence : mémoire `feedback_no_bullshit.md`
