# LOG-LISTE-CARDS — Refonte liste logements/immeubles en cartes (à la Qalimo)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (3-8h)
**Détecté** : 2026-05-01
**Lié à** : LOG-FICHE-360 · LOG-PHOTOS · DASH-V2 · V3-VISUEL · LOG-ARCHIVE

## Contexte
Demande utilisateur 2026-05-01 (avec 2e capture Qalimo) : montrer une **vue liste des biens** moderne en cartes.

## Référence : capture Qalimo (2026-05-01) — vue liste "Biens"

**Header**
- Breadcrumb : `Page précédente > Biens`
- Titre `Biens`
- Tabs **`Tous mes biens`** / `Biens archivés` (cf `LOG-ARCHIVE`)

**Toolbar**
- Bouton primaire `+ Ajouter un bien` (bleu)
- Bouton secondaire `📥 Exporter`
- Champ recherche (avec icône loupe)
- Boutons `Filtrer` (icône) + `Tri` (icône)

**Cartes immeuble** (grid 4 colonnes desktop, responsive)
Chaque carte contient :
- En-tête : nom du bailleur + menu `⋮`
- Image principale (cf `LOG-PHOTOS`)
- Badge ratio occupation : `2 biens loués / 3` avec barre de progression verte
- Nom de l'immeuble (`Immeuble 1`)
- Badge type (`Habitation`)
- Nombre de biens (`3 Biens` ou `0 Bien`)
- Période d'activité (`8 oct 2024 - 7 nov 2027`)
- Loyer total mensuel (`339.89 € /mois`)

## Diagnostic ImmoTrack actuel
À vérifier dans le code, mais probablement :
- Liste logements en **tableau dense** (pas en cartes visuelles)
- Pas de **hiérarchie visuelle Immeuble → Logement** explicite
- Pas de **photo principale** par bien dans la liste
- Pas de **ratio occupation** inline
- Toolbar minimale (pas de tri/filtre/export structurés)

→ Refonte UX → impression "amateur" actuel vs "pro" Qalimo. Bloquant V1 commerciale.

## Scope

### Phase 1 — Vue cartes immeubles (P1 / S, ~3-4h)
- [ ] Layout grid responsive (4 cols desktop / 2 cols tablette / 1 col mobile)
- [ ] Carte immeuble :
  - [ ] Header : entité bailleur + menu actions (`⋮` : Modifier, Archiver, Voir détails)
  - [ ] Image principale (placeholder gris si pas de `LOG-PHOTOS`)
  - [ ] Badge ratio occupation calculé : `{N loués} / {N total} biens loués` + barre progression
  - [ ] Nom immeuble + badge type
  - [ ] Compteur biens
  - [ ] Période activité
  - [ ] Loyer total mensuel consolidé (somme des loyers HC actifs)
- [ ] Click carte → ouvre `LOG-FICHE-360`

### Phase 2 — Toolbar (P1 / S, ~2-3h)
- [ ] Bouton primaire `+ Ajouter un bien` (cohérent avec Bail wizard ?)
- [ ] Bouton `Exporter` → CSV/Excel des biens (lien avec `IMPORT-EXCEL-LOG` template)
- [ ] Champ recherche : filtrage temps réel sur nom/adresse/locataire/bailleur
- [ ] Bouton `Filtrer` : popover avec filtres (entité, type bail, statut occupation, ville…)
- [ ] Bouton `Tri` : dropdown (par nom / loyer / occupation / date création)

### Phase 3 — Tabs Actifs/Archivés (P1 / S, ~1h)
- [ ] Tab `Tous mes biens` (par défaut, `archived=false`)
- [ ] Tab `Biens archivés` (cf `LOG-ARCHIVE`)
- [ ] Compteur sur chaque tab : `Tous mes biens (12)` · `Archivés (3)`

### Phase 4 — Vue Logements individuels (vs Immeubles)
- [ ] Décision UX : montrer **immeubles** par défaut (regroupement) ou **logements** (à plat) ?
- [ ] Recommandation : **toggle Immeubles ↔ Logements** en haut, plus 2 vues distinctes
- [ ] Vue Logements : mêmes cartes mais 1 carte = 1 logement (pas regroupé par immeuble)

## Décisions à prendre
- [ ] Vue par défaut : Immeubles (Qalimo) ou Logements (à plat) ? → Recommandation : Immeubles si plusieurs logements/immeuble, sinon Logements à plat
- [ ] Image principale : 1ère photo de `LOG-PHOTOS` ou photo dédiée "couverture" ? → 1ère photo + badge "Définir comme couverture" possible
- [ ] Filtres exacts : à arbitrer (entité, ville, type bail, occupation, DPE, etc.)
- [ ] Mobile : afficher cartes en stack vertical (cf `MOBILE-AUDIT-ONGLETS`)

## Sous-sujet à classer
**LOG-ARCHIVE** (P2 / S) — archivage de biens : voir doc dédié.

## Différenciant + parité
| Solution | Vue cartes | Photos | Ratio occup. | Tri/filtre | Tabs archivés |
|---|---|---|---|---|---|
| Qalimo | ✅ | ✅ | ✅ | ✅ | ✅ |
| BailFacile | ✅ partiel | ✅ | partiel | ✅ | ? |
| Rentila | ❌ tableau | ❌ | ❌ | partiel | ❌ |
| Smovin | ✅ | ✅ | ✅ | ✅ | ✅ |
| **ImmoTrack actuel** | ❌ probablement | ❌ | ❌ | partiel | ❌ |
| **ImmoTrack après LOG-LISTE-CARDS** | ✅ | ✅ | ✅ | ✅ | ✅ |

## Notes utilisateur
> 💬 2026-05-01 : "un autre vue de qalimo" (capture liste biens fournie)

## Journal
- 2026-05-01 : créé · à coupler étroitement avec LOG-FICHE-360, LOG-PHOTOS et LOG-ARCHIVE
