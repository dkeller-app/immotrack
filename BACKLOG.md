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

---

## 🔴 P1 — Légal / Fiscal (bloquant commercialisation)

| # | Code | Sujet | Prio | Taille | Statut | Note CDC |
|---|---|---|---|---|---|---|
| 14 | LEGAL-2044 | Aide déclaration 2044 — mapping catégories → lignes fiscales | P1 | L | ⬜ À faire | Critères 7.1/7.2 — ImmoTrack seul sans cette feature vs concurrents · CDC requis avant code |
| 15 | LEGAL-BILAN-ANNUEL | Bilan annuel par entité PDF | P1 | M | ⬜ À faire | Critère 7.5 — pré-requis fiscal |
| 38 | EDL-VALIDATION-AVOCAT | Validation légale template EDL par avocat (bail habitation) | P1 | XS | ⬜ À faire | Décret 2016-382 · clés (nombre+destination), réf EDL entrée dans sortie, comparatif pièce par pièce |
| 32 | ARCHI-DB-DOUBLONS | Refonte architecture DB — supprimer doublons logements/baux | P1 | XL | ⏳ En attente | CDC requis avant refacto. Fix provisoire `_syncLogToBail()` en place. ~191 reads, 3 write sites à migrer |

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
| 23 | BAIL-MEUBLE | Bail meublé (titre Ier bis loi 89-462 — LMNP) | P2 | M | ⬜ À faire | Critère 1.11 · marché LMNP significatif · cf [project_bail_types.md](memory) |

---

## 🟠 P2 — Bail / UX (chantiers en cours / planifiés)

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| BAIL-3d | Phase 3d Bail (extraction BailDocument + ES6 + namespace) | P2 | M | ⬜ À faire | cf mémoire `project_bail_phase3.md` |
| BAIL-PRINT-POLISH | Polish Bail (paraphes, en-têtes nav, cautionnement, logo, UX template) | P2 | M | ⬜ À faire | cf mémoire `project_bail_print_polish.md` · session dédiée après 3d |
| BAIL-PDF-NATIF | Refonte PDF Bail natif (pdf.text/pdf.rect + signatures + emplacements vides Acrobat) | P2 | L | ⬜ À faire | cf mémoire `project_bail_pdf_native.md` · ~10h en 3 sessions · validé 2026-04-26 |
| V3-TABS | Refonte onglets V3 (génération Word/PDF + namespace Bail) | P2 | M | ⬜ À faire | cf mémoire `project_v3_transition.md` |
| DASH-V2 | Refonte dashboard 7 phases (one-screen ~900px) | P2 | XL | ⬜ À faire | cf mémoires `project_immotrack.md` + `project_dashboard_onescreen.md` |

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

## 🔴 Drive sync — bloquant V1 commercial multi-users

| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| DRIVE-2H | Re-architecture fichiers Drive (par-user vs partagé vs référentiel) | P1 | M | ⬜ À faire | À faire EN PREMIER (base de 2F/2G) · [docs/subjects/DRIVE-2H.md](docs/subjects/DRIVE-2H.md) |
| DRIVE-2F | Optimistic Concurrency Control (OCC) au file level | P1 | M | ⬜ À faire | Après 2H · [docs/subjects/DRIVE-2F.md](docs/subjects/DRIVE-2F.md) |
| DRIVE-2G | Awareness UI (qui édite quoi) | P1 | S | ⬜ À faire | Couche UX · [docs/subjects/DRIVE-2G.md](docs/subjects/DRIVE-2G.md) |
| DRIVE-2I | Audit log + history Drive | P2 | S | ⬜ À faire | V1+ · [docs/subjects/DRIVE-2I.md](docs/subjects/DRIVE-2I.md) |
| DRIVE-2J | Field-level conflict resolution | P3 | M | ⬜ À faire | Nice-to-have · [docs/subjects/DRIVE-2J.md](docs/subjects/DRIVE-2J.md) |

---

## ✅ Livré récemment

### Drive sync — session 2026-04-28 (~5h, 7 commits)
| # | Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|---|
| | DRIVE-2A | Payload entity étendu (5 collections supplémentaires) + fichier global | P1 | M | ✅ Livré | v13.12 · commit 815e22f |
| | DRIVE-2A-bis | Protection démo + restore intelligent par type | P1 | S | ✅ Livré | v13.13 · commit 8b2992b |
| | DRIVE-2A-ter | Fix 83 mouvements globaux non sync | P1 | S | ✅ Livré | v13.14 · commit 26d4ce5 |
| | DRIVE-2A-quater | Bouton UI cleanup Dupont | P1 | XS | ✅ Livré | v13.15 · commit 5dd53b9 |
| | DRIVE-2A-quinquies | trashed=false sur queries Drive | P0 | XS | ✅ Livré | v13.16 · commit 284c794 |
| | DRIVE-2C | Backup pré-sync localStorage + bouton Restaurer | P1 | S | ✅ Livré | v13.17 · commit ec52ae4 |
| | DRIVE-2D | Force push depuis device source | P1 | S | ✅ Livré | v13.17 · commit ec52ae4 |
| | DRIVE-2B | Timestamps `_modifiedAt` + merge timestamp-aware | P1 | M | ✅ Livré | v13.18 · commit 619f8ff |
| | DRIVE-2E | Toast warning sur conflit détecté au load | P1 | XS | ✅ Livré | v13.18 · commit 619f8ff |

### EDL — session avril 2026
| # | Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|---|
| 33 | EDL-PHOTOS-IDXDB | Photos IndexedDB (persistance permanente) + Drive auto-sync | P0 | M | ✅ Livré | `immotrack_photos` IDB · _idbPut/_idbGet · auto-sync silencieux |
| 34 | EDL-CPT-COMPARATIF | Comparatif compteurs entrée/sortie dans PDF (avant/après) | P1 | S | ✅ Livré | printEDLById · 2 colonnes systématiques · cptRef depuis EDL entrée lié |
| 35 | EDL-PDF-7COL | PDF 7 colonnes toujours (sortie vides + fond bleu si PDF entrée) | P1 | S | ✅ Livré | format comparatif systématique · #f0f4f8 |
| 36 | EDL-CPT-PHOTOS | Photos compteurs (1 par relevé, entrée + sortie séparées) | P1 | S | ✅ Livré | compteursPhotos {elec,gaz,eauC,eauF,*S} · 8 clés |
| 37 | EDL-PHOTOS-SIZE | Photos max-height 120px, largeur auto, col commentaires réduite | P2 | XS | ✅ Livré | éviter débordement portrait/paysage |
| 39 | EDL-PARAPHES | Paraphes supprimés du PDF (signature unique en bas) | P0 | XS | ✅ Livré | _PARAPH_SCRIPT supprimé · décret 2016-382 |
| 41 | IRL-LETTRE-REVISION | Lettre révision IRL : mentions légales art. 17-1 loi 89-462 | P0 | S | ✅ Livré | adresse, date bail, clause révision, IRL INSEE série 001515333, LRAR, art. 17-1 |

### Bail — session avril 2026
| Code | Sujet | Prio | Taille | Statut | Note |
|---|---|---|---|---|---|
| BAIL-SNAPSHOT | Snapshot signé + highlight diff Aperçu | P1 | M | ✅ Livré | v13.10 + v13.11 · cf mémoire `project_bail_snapshot_highlight.md` |
| BAIL-WIZARD | Phase 2 wizard Bail | P1 | L | ✅ Livré | v12.50+ · cf mémoire `project_v3_transition.md` |

---

## 📝 Remarques en attente de classement

> Espace libre pour les remarques que tu me dis dans le chat avant que je les classifie ailleurs.
> Ex : "le total quittance est faux quand TVA" → je l'ajoute ici si je ne sais pas où le ranger immédiatement.

(vide pour le moment)

---

## 📌 Décisions structurantes (journal)

### 2026-04-28 — Architecture Drive sync
- Choix : 1 fichier global + N entity files (par-entité)
- **Décision V1 commercial** : le fichier global SERA DÉCOUPÉ (DRIVE-2H) en `user-{userId}.json` + `entity-{entityId}-shared.json` + `global-ref.json`
- Référence : voir [DRIVE-2H](docs/subjects/DRIVE-2H.md)

### 2026-04-28 — Système de pilotage backlog
- Choix : ce fichier `BACKLOG.md` + `docs/subjects/*.md` + mémoire `project_pilotage.md` qui pointe ici
- Workflow : tout passe par le chat Claude, jamais d'édition manuelle MD
- Sync sessions : sessions sujets commit dans `BACKLOG.md` à la fin

### 2026-04-26 — Génération PDF Bail natif
- Choix : pdf.text/pdf.rect natif (pas html2canvas) avec emplacements vides locataire pour Acrobat
- cf [BAIL-PDF-NATIF](docs/subjects/BAIL-PDF-NATIF.md) (à créer)

### 2026-04-27 — Pas de solution passable
- Règle non négociable : refonte complète plutôt que compromis temporaire, planifier en session dédiée si trop gros
- Référence : mémoire `feedback_no_compromise.md`
