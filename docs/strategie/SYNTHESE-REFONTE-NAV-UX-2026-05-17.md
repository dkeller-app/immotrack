# Synthèse session pilotage — Refonte NAV + UX (2026-05-17)

> Bilan des sujets capturés en session pilotage. Vision : refonte cohérente de la navigation + UX d'ImmoTrack, onglet par onglet, vers la V1 commerciale.

## 🎯 Vision nav cible (avant → après)

### Sidebar actuelle (problèmes pointés)
```
🏠 Biens (hub : toggle Bailleurs/Immeubles/Logements, démarre sur Immeubles)
📋 Baux & Locataires       ← redondance perçue avec Logements
📋 EDL
🛡 Assurances              ← peu utile (1×/an), tableau brut
📊 Diagnostics             ← déjà déplacé vers fiche 360 (BUG-LOG-FICHE-DIAG-MERGE)
💰 Loyers & Mouvements     ← label trompeur
📥 Import                  ← 2 moteurs concurrents, "on mélange tout"
⚙️ Paramètres              ← obsolescence
💾 Sauvegarde/Export       ← backup et export mélangés
```

### Sidebar cible (vision construite aujourd'hui)
```
┌─ BARRE DE CONTEXTE GLOBALE (persistante, position fixe) ──────────────┐
│  [★ Toutes] [SD] [SS] [DK]  +        ◀ Mai 2026 ▶ / Année            │
│  filtre ENTITÉ (cascade réelle)       filtre PÉRIODE                  │
└───────────────────────────────────────────────────────────────────────┘

🏠 Bien            "le mur" : logements groupés par immeuble, état, DPE,
                   diagnostics, photos, PNO, bail en LECTURE
👥 Locataires      "la personne" : baux, échéances, candidats, contact
                   (mail/tél) + ✉ Écrire, GLI/MRH, bail en GESTION active
📧 Communication   vue transversale emails (historique + queue + modèles)
                   + envoi depuis l'onglet (wizard PULL)
📋 EDL             conservé (entrée dédiée)
💰 Mouvements      (ex "Loyers") tous les mouvements
📇 Carnet adresses contacts artisans/syndics/comptables (alimente Communication)
📥 Import          3 sous-tabs unifiés (Référentiel/Bancaire/Concurrents)
⚙️ Configuration   Paramètres + Sauvegarde (séparée d'Export)
```

## 📋 Sujets capturés aujourd'hui (par thème)

### 🧭 Refonte navigation (cœur de la session)
| Sujet | Prio | Essence |
|---|---|---|
| **NAV-FILTRE-ENTITE-GLOBAL** | P1/M | Barre de contexte globale : bulles entités + sélecteur mois/année persistants sur tous les onglets + cascade réelle (entité → ses logements seulement). Découple du `go('dashboard')` forcé. **Le plus structurant.** |
| **NAV-LOGEMENT-BAIL-CLARIF** | P2/S | Anti-redite Bien vs Locataires ("le mur" vs "la personne"). Onglet Bien centré logements groupés/immeuble. EDL conservé. Contact + ✉ dans Locataires. À intégrer Sprint 19D. |
| **UX-GROUP-BY-IMMEUBLE** | 🔄 IRL livré | Intercalaires immeuble. IRL fait (v15.76/77), 9 onglets restants (Phase 4). Se combine avec le filtre entité (Entité > Immeuble > Lot). |

### 📧 Communication
| Sujet | Prio | Essence |
|---|---|---|
| **EMAIL-ONGLET-PERMANENT** | ✅ v15.79 | Onglet Communication (lecture seule) livré |
| **EMAIL-ENVOI-DEPUIS-COMMUNICATION** | P2/M | Envoyer quittance/IRL/doc depuis Communication (wizard PULL), réutilise les générateurs existants. Vrai gain = envoi groupé mensuel |
| **CARNET-ADRESSE** | P3→**P2** | Re-priorisé : couplé à Communication pour écrire aux artisans/syndics depuis l'app |

### 💾 Zone données/admin
| Sujet | Prio | Essence |
|---|---|---|
| **V3-REFONTE-PARAMS-EXPORT-IMPORT** | P1/L | Chapeau : refondre Paramètres + Sauvegarde + Import (3 sprints séparés) |
| **BANK-IMPORT-XLSX** | P1/S | 2 moteurs d'import bancaire concurrents à unifier (onglet Import = xlsx OK / bouton Loyers = CSV/OFX). + Tâche #1 : ajouter xlsx au moteur Loyers |
| **BUG-BANK-IMPORT-DEDUP** | P1/S | Dédup par empreinte stable (fingerprint) — robuste même si user modifie une ligne après import |

### 📅 Intégrations
| Sujet | Prio | Essence |
|---|---|---|
| **AGENDA-GOOGLE-SYNC** | P2/M | Push auto continu de l'agenda vers Google Calendar (opt-in, scope calendar.events, file d'attente + idempotence) |

### 📝 Confort
| Sujet | Prio | Essence |
|---|---|---|
| **LOG-NOTES** | P2/S | Zone commentaires libres (sous-onglet Notes fiche 360°) |
| **V3-REFONTE-ASSURANCES** | P2/M | Retirer l'onglet, gérer dans les fiches (PNO→bien/immeuble, GLI/MRH→bail). Garder vue échéances |
| **THEME-FANCY** | P2/M | Presets visuels premium (mockup-first, retour Marion "pas assez fancy") |
| **LOG-ANNONCE** | P2/M | Enrichi mode "qui fait rêver" type Leboncoin |

### 🤖 V2
| Sujet | Prio | Essence |
|---|---|---|
| **IA-V2** | V2 | Module IA opt-in "Pro Connect" (OCR diagnostics/factures/justifs + annonce LLM + classification Drive) |

### 🔧 Infra
- **CI Vitest réparé** : 70 runs fail consécutifs résolus (cause = `cache:npm` + `npm ci` strict → Node 24 + `npm install`)

## 🗺 Ordre de traitement recommandé

1. **NAV-FILTRE-ENTITE-GLOBAL** (P1) — fondation : unifie tout le filtrage. À faire tôt car beaucoup d'onglets en dépendent.
2. **V3-REFONTE-PARAMS-EXPORT-IMPORT** (P1) — Import d'abord (2 moteurs + xlsx + dédup), puis Sauvegarde, puis Paramètres.
3. **NAV-LOGEMENT-BAIL-CLARIF** (Sprint 19D) — répartition Bien/Locataires (mockup-first).
4. **UX-GROUP-BY-IMMEUBLE Phase 4** — cascade 9 onglets restants.
5. **THEME-FANCY** — mockup-first, validation Marion.
6. **EMAIL-ENVOI-DEPUIS-COMMUNICATION** + **CARNET-ADRESSE** — cockpit communication complet.
7. **AGENDA-GOOGLE-SYNC** + **LOG-NOTES** + **V3-REFONTE-ASSURANCES** — confort.

## ⚠️ Règles transverses rappelées cette session

- **Mockup-first** : NAV-LOGEMENT-BAIL-CLARIF + THEME-FANCY = mockups A/B/C × 3 formats avant code
- **Anti-duplication** : Communication réutilise les générateurs (pas de re-codage)
- **Cascade réelle** : les filtres filtrent à la source (pas masquage CSS)
- **Garde-fou fancy** : reste un outil sérieux, lisible, WCAG AA

## Journal

- 2026-05-17 : synthèse créée à l'issue d'une session de revue complète de la nav/UX (~15 sujets) + mockup THEME-FANCY généré
