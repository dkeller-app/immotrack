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

## 🔥 Priorité immédiate — bugs / amélio détectés en usage

| Code | Sujet | Prio | Taille | Statut | Détail |
|---|---|---|---|---|---|
| BUG-LOG-001 | Logement : référence non modifiable après création | P2 | XS | ⬜ À faire | [docs/subjects/BUG-LOG-001.md](docs/subjects/BUG-LOG-001.md) |
| BUG-EQUIP-FILTER | Onglet Équipements : filtre exclut logements vacants | P2 | XS | ⬜ À faire | Hérité de v12.36 · `equip-f-imm`/`equip-f-log` ne listent que occupés · à voir dans refonte Équipements |
| BUG-HC-GARDE-FOU | Garde-fou saisie HC : alerte si valeur aberrante | P2 | XS | ⬜ À faire | Hérité de v2 · ex 56 M€ → manque à gagner 674 M€ · ratio HC/médiane > 10 ou seuil absolu |

---

## 🔴 P1 — Légal / Fiscal (bloquant commercialisation)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
| 14 | LEGAL-2044 | Aide déclaration 2044 — mapping catégories → lignes fiscales | P1 | L | ⬜ À faire | Critères 7.1/7.2 — ImmoTrack seul sans cette feature vs concurrents · CDC requis avant code |
| 15 | LEGAL-BILAN-ANNUEL | Bilan annuel par entité PDF | P1 | M | ⬜ À faire | Critère 7.5 — pré-requis fiscal |
| 38 | EDL-VALIDATION-AVOCAT | Validation légale template EDL par avocat (bail habitation) | P1 | XS | ⬜ À faire | Décret 2016-382 · clés (nombre+destination), réf EDL entrée dans sortie, comparatif pièce par pièce |
| 32 | ARCHI-DB-DOUBLONS | Refonte architecture DB — supprimer doublons logements/baux | P1 | XL | ⏳ En attente | CDC requis avant refacto. Fix provisoire `_syncLogToBail()` en place. ~191 reads, 3 write sites à migrer |

---

## 🔴 P1 — Sécu / Architecture (bloquant commercialisation)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| AUDIT-GLOBAL | Audit global avant V3 (sécu XSS, perf, code quality, OAuth, PWA) | P1 | M | ⬜ À faire | Étape 1 V3 transition · agent Explore + skills review/security-review · cf `project_v3_transition.md` |
| SECU-INNERHTML | Sites `innerHTML=` non échappés restants (~107 occurrences, 10 wrappés) | P1 | M | ⬜ À faire | Renders tableaux/cartes/modales onglets baux-hist, mv, quit, ass, etc. · à traiter au fil refonte onglet par onglet · l.7310 dash-alerts non-escapable |

---

## 🔴 Drive sync — bloquant V1 commercial multi-users

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| DRIVE-2H | Re-architecture fichiers Drive (par-user vs partagé vs référentiel) | P1 | M | ⬜ À faire | À faire EN PREMIER (base de 2F/2G) · [docs/subjects/DRIVE-2H.md](docs/subjects/DRIVE-2H.md) |
| DRIVE-2F | Optimistic Concurrency Control (OCC) au file level | P1 | M | ⬜ À faire | Après 2H · [docs/subjects/DRIVE-2F.md](docs/subjects/DRIVE-2F.md) |
| DRIVE-2G | Awareness UI (qui édite quoi) | P1 | S | ⬜ À faire | Couche UX · [docs/subjects/DRIVE-2G.md](docs/subjects/DRIVE-2G.md) |

---

## 🟠 P2 — V3 visuelle harmonisée (= "design", étape 2 V3)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| V3-VISUEL | Appliquer design system v2 à TOUTES les pages (formulaires, tableaux, modales, cartes, typo, hover/focus) | P2 | L | ⬜ À faire | Structure inchangée, juste visuel · cf `project_v3_transition.md` étape 2 · ~3-5 sessions |

## 🟠 P2 — V3 fonctionnelle onglet par onglet (étape 3 V3)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| V3-REFONTE-BAIL | Refonte fonctionnelle Bail (en cours sur plusieurs sessions) | P2 | L | 🔄 En cours | Phase 3a-d, wizard, signature, snapshot livrés. Reste : polish + types + PDF natif (cf sujets dédiés) |
| V3-REFONTE-LOYERS | Refonte fonctionnelle onglet Loyers/Mouvements | P2 | M | ⬜ À faire | 2e priorité après Bail (cf `project_v3_transition.md`) |
| V3-REFONTE-QUIT | Refonte fonctionnelle onglet Quittances | P2 | M | ⬜ À faire | 3e priorité |
| V3-REFONTE-REGUL | Refonte fonctionnelle onglet Régularisation | P2 | M | ⬜ À faire | 4e priorité |
| V3-REFONTE-IRL | Refonte fonctionnelle onglet IRL | P2 | M | ⬜ À faire | 5e priorité |
| V3-REFONTE-PARAMS | Refonte fonctionnelle onglet Paramètres/Référentiel | P2 | M | ⬜ À faire | 6e priorité |
| V3-REFONTE-EQUIP | Refonte fonctionnelle onglet Équipements | P2 | M | ⬜ À faire | 7e priorité · inclut BUG-EQUIP-FILTER |
| DASH-V2 | Refonte dashboard 7 phases (one-screen ~900px) | P2 | XL | 🔄 En cours | v2 livré · cahier v2 avril 2026 · cf `project_immotrack.md` + `project_dashboard_onescreen.md` · 7 phases au total |

## 🟠 P2 — Bail (chantiers spécifiques planifiés)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| BAIL-PRINT-POLISH | Polish Bail (paraphes bas page, en-têtes nav, cautionnement, logo entité, UX éditeur template) | P2 | M | ⬜ À faire | cf `project_bail_print_polish.md` · session dédiée après 3d (3d livré) |
| BAIL-PDF-NATIF | Refonte PDF Bail natif (pdf.text/pdf.rect + signatures + emplacements vides Acrobat) | P2 | L | ⬜ À faire | cf `project_bail_pdf_native.md` · ~10h en 3 sessions · validé 2026-04-26 · prioritaire sur les autres types |
| BAIL-TYPES | Ajout 5 types bail (meublé/garage/mobilité/étudiant + Autre) | P2 | L | ⬜ À faire | 5 sous-phases A-E · cf `project_bail_types.md` · session dédiée après PDF natif |
| BAIL-NAMESPACE-MIGRATION | Retirer alias globaux Bail.* — migration onclick inline → addEventListener | P3 | XL | ⏳ En attente | Énorme chantier · pas avant V3 visuelle terminée · cf phase 3d notes |

---

## 🟠 P2 — Fonctionnel (concurrence / standards marché)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
| 16 | EDL-DELEGUE-EXPORT | EDL délégué : export HTML offline pour tiers | P2 | L | ⬜ À faire | Critères 2.15+16.5 · différenciant total absent de TOUS les concurrents |
| 17 | EDL-DELEGUE-IMPORT | EDL délégué : import JSON + statut À valider | P2 | M | ⬜ À faire | Critère 2.16 · complémentaire du point 16 |
| 18 | IMPORT-EXCEL-LOG | Import Excel logements/locataires (template SheetJS) | P2 | M | ⬜ À faire | Critères 14.1+14.2 · onboarding · SheetJS déjà embarqué |
| 19 | QUIT-EMAIL | Envoi email quittances au locataire | P2 | M | ⬜ À faire | Critère 3.3 · standard chez tous concurrents |
| 20 | AVIS-ECHEANCE | Avis d'échéance avant paiement | P2 | S | ⬜ À faire | Critère 3.7 · manque vs Qalimo/Rentila/BailFacile |
| 21 | RAPPEL-IMPAYE | Rappel automatique locataire (impayé) | P2 | M | ⬜ À faire | Critère 4.12 · standard marché |

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
| DRIVE-2I | Audit log + history Drive | P2 | S | ⬜ À faire | Pour support client · [docs/subjects/DRIVE-2I.md](docs/subjects/DRIVE-2I.md) |
| DRIVE-2J | Field-level conflict resolution | P3 | M | ⬜ À faire | Nice-to-have · [docs/subjects/DRIVE-2J.md](docs/subjects/DRIVE-2J.md) |

---

## ✅ Livré récemment

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

### Bail — sessions avril 2026 (v12.50 → v13.11)
| Code | Sujet | Note |
|---|---|---|
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
