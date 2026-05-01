# LOG-LISTE-CARDS — Refonte liste logements/immeubles en cartes (à la Qalimo)

**Status** : ✅ Livré v14.2 (Phases 1 & 2 — 2026-05-01) · **Prio** : P1 · **Taille** : M (livré ~5h)
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

### Phase 1 — Vue cartes immeubles ✅ Livré v14.2 commit `df7b66f`
- [x] Layout grid responsive (4 cols ≥1280 / 3 cols 1024-1280 / 2 cols 768-1023 / 1 col mobile)
- [x] Carte immeuble :
  - [x] Header : entité bailleur + menu actions ⋮ (Voir détails / Modifier / Archiver / Restaurer / Supprimer)
  - [x] Image principale (placeholder gris dégradé en attendant `LOG-PHOTOS`)
  - [x] Badge ratio occupation : `{N loués} / {N total} biens loués` + barre progression (verte/orange/rouge)
  - [x] Nom immeuble + badge type (déduit des logements)
  - [x] Compteur biens
  - [x] Période activité (min(bail.debut), max(bail.fin) sur baux actifs)
  - [x] Loyer total mensuel consolidé (somme HC + mention provisions charges)
- [x] Click carte → `openLogFiche(ref)` (livré en étape 5 LOG-FICHE-360 Phase 1)

### Phase 2 — Toolbar ✅ Livré v14.2 commit `a4bed74`
- [x] Bouton primaire `+ Bien`
- [x] Bouton `Exporter` → CSV (15 colonnes : Ref/Immeuble/Bailleur/Type/Surface/Étage/Adresse/HC/CH/DG/Locataire/Début/Fin/Statut/IRL, BOM UTF-8)
- [x] Champ recherche : filtrage temps réel sur ref/imm/locataire/entity/adr/type avec icône loupe + bouton clear
- [x] Bouton `Filtrer` : popover avec selects Bailleur / Statut occupation (Loué/Vacant) / Type, badge compteur de filtres actifs
- [x] Bouton `Tri` : popover radios (Nom A-Z, Nom Z-A, Loyer +/-, Occupation, Plus récents)
- [x] Bonus : auto-fermeture popovers sur clic extérieur ou Esc, popovers en bottom-sheet sur mobile

### Phase 3 — Tabs Actifs/Archivés ✅ Livré v14.2 commit `7070fb3` (sujet jumeau LOG-ARCHIVE)
- [x] Tab `Tous mes biens` (par défaut)
- [x] Tab `Biens archivés`
- [x] Compteurs dynamiques sur chaque tab

### Phase 4 — Toggle Immeubles / Logements ✅ Livré v14.2 commit `df7b66f`
- [x] Décision UX : **toggle Immeubles ↔ Logements** en haut, Immeubles par défaut (persiste localStorage `immotrack_biens_view`)
- [x] Vue Logements : 1 carte par logement avec statut Loué/Vacant + locataire + immeuble en badge mute

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
- 2026-05-01 : ✅ **Phase 1 livrée v14.2** · commit `df7b66f` · cartes immeubles + cartes logements (toggle), grid responsive 4/3/2/1 cols, ratio occupation visuel, design system respecté (variables CSS, dark mode, focus-visible, --shadow-card-hover)
- 2026-05-01 : ✅ **Phase 2 livrée v14.2** · commit `a4bed74` · toolbar complète (recherche live, filtres bailleur/statut/type, tri 6 critères, export CSV), badge compteur de filtres actifs, empty state filtres dédié
- 2026-05-01 : ✅ **Phase 3 livrée v14.2** · commit `7070fb3` (couplé LOG-ARCHIVE) · tabs Actifs/Archivés avec compteurs
- 2026-05-01 : Restant pour V1 : connecter `LOG-PHOTOS` (image principale réelle au lieu du placeholder), affiner badge "type" agrégé sur immeuble multi-types
