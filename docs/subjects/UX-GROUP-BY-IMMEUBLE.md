# UX-GROUP-BY-IMMEUBLE — Tri visuel par immeuble avec séparateurs (règle transverse tous onglets)

**Status** : 🔄 IRL livré v15.76 + drill-downs v15.77 · 9 onglets restants · **Prio** : P2 · **Taille** : M (~3-5h transverse) ou S (~30 min IRL seul)
**Détecté** : 2026-05-17 (user, session pilotage)
**Lié à** : V3-VISUEL P2, design system, NAV-AUDIT-PROFILS, LOG-LISTE-CARDS ✅ v14.2 (qui groupe déjà par bailleur)

## Contexte

User : *« pour l'onglet IRL, tous les biens sont mélangés. On peut faire un tri visuel par immeuble avec des séparateurs ? règles pour tous les onglets »*.

Sur l'onglet IRL (et probablement plusieurs autres : Loyers, Quittances, EDL, Assurances, Équipements, Régul, Travaux), la liste/grid des logements affiche tous les biens à la suite sans groupement visuel par immeuble. À mesure que le patrimoine grandit (>10 lots, plusieurs SCI/SAS), la lecture devient confuse.

L'onglet **Biens** (LOG-LISTE-CARDS livré v14.2) a déjà un pattern de groupement par bailleur — il faut s'en inspirer pour cohérence.

## Scope (proposé)

### Phase 1 — Audit transverse (~30 min)
Liste tous les onglets affichant des logements/baux/équipements en flat list :
- `#p-irl` (révision IRL — demande explicite)
- `#p-loyers` (mouvements)
- `#p-quit` (quittances)
- `#p-edl` (états des lieux)
- `#p-ass` (assurances PNO/GLI/MRH)
- `#p-equip` (équipements + interventions)
- `#p-regul` (régularisations)
- `#p-travaux` (suivi travaux)
- `#p-baux` (baux & locataires)
- `#p-pj` (PJ documents)

Pour chacun : noter le sélecteur DOM courant, la fn de render (`rIRL`, `rMv`, etc.), le composant (table / cards / list) et l'éventuel filtre immeuble déjà présent (`#xxx-f-imm`).

### Phase 2 — Design system (~30 min)
Définir le composant `groupHeader-imm` réutilisable :
- Sticky en haut du groupe (z-index, top:0)
- Icône 🏛 + nom immeuble + compteur (`Immeuble A · 3 lots`)
- Action collapse/expand (toggle, persist localStorage `immotrack_group_collapsed_X`)
- Couleur de séparateur subtile (var `--bor-soft` ou similaire)
- Dark mode OK
- Responsive (header burger sur <480px)

### Phase 3 — Helper transverse (~30 min)
Helper inline `_groupLogementsByImmeuble(logements, renderItemFn)` retournant le HTML groupé. Le `renderItemFn` reste spécifique à l'onglet (card IRL, ligne quittance, etc.). On factorise UNIQUEMENT la mise en groupe.

Module pur testable : `js/core/group-by-imm.js` avec `_groupArrayByKey(arr, keyFn)` + tests Vitest.

### Phase 4 — Cascade implé (~2-3h)
Appliquer dans les 10 onglets identifiés. Ordre par ROI :
1. IRL (demande directe)
2. Loyers/Mouvements (volume de lignes le plus dense)
3. Quittances (suivi mensuel)
4. EDL (parfois plusieurs entrée+sortie par bail)
5. Assurances (PNO/GLI + MRH locataires)
6. Équipements (multi-interventions)
7. Régul (1× par an mais utile en multi-SCI)
8. Travaux, Baux, PJ (lower priority)

### Phase 5 — Tests Vitest (~15 min)
- `_groupArrayByKey([{imm:'A',...},{imm:'B'},{imm:'A'}], 'imm')` → `{A: [...], B: [...]}`
- Tri alphanumérique stable des groupes
- Items "sans immeuble" → groupe `(non assigné)` en dernier

## Décisions

À prendre :
- **D1** : groupement par immeuble OU par entité/bailleur (LOG-LISTE-CARDS groupe par bailleur, pas immeuble) ? Sur les onglets multi-SCI, on peut avoir 2 niveaux (Entité > Immeuble).
- **D2** : collapse/expand par défaut ouvert ? Persistance par onglet ou globale ?
- **D3** : compteur de groupe = nb lots, OU nb lignes (peut différer ex. plusieurs quittances par lot) ?
- **D4** : "sans immeuble" → groupe dédié OU exclu ?
- **D5** : sticky header OU statique ? Sticky = meilleure lisibilité en scroll mais complexité CSS responsive.

## Prompt de démarrage de session

(À générer au moment d'attaquer, après réponses D1-D5.)

## Notes utilisateur

> 💬 2026-05-17 : *« pour l'onglet IRL, tous les biens sont mélangés. On peut faire un tri visuel par immeuble avec des séparateurs ? règles pour tous les onglets »*

## Journal

- 2026-05-17 : sujet créé en session pilotage suite remontée user. Statut ⬜ À faire, scope transverse défini, 5 décisions à arbitrer avant d'attaquer.
- 2026-05-17 : **mockups 4 variantes** livrés (`docs/strategie/mockups/group-by-immeuble/index.html`, commit `29d0d93`) appliquant la nouvelle règle gravée `feedback_mockup_first.md` (captée dans la même session).
- 2026-05-17 : **décision user** = variante D (sections collapsibles) + KPI condensés de la variante B (nb lots / loyer HC tot / nb alertes ⚠).
- 2026-05-17 **v15.76 ✅ IRL implé** :
  - Module pur `js/core/group-by-imm.js` (2 exports : `_groupLogementsByImm` + `_computeIRLGroupKPIs`, 18 tests Vitest).
  - Helpers inline `index.html` (pattern shadow, duplication couverte par les tests) : `_groupLogementsByImm`, `_computeIRLGroupKPIs`, `_irlGrpCollapsedSet`, `_irlGrpToggleCollapse`, `_irlBuildGroups`, `_irlRenderGroupHeader`.
  - `rIRL()` mode cards : refonte pour render groups au lieu de flat list.
  - CSS `.irl-grp` + `.irl-grp-head` + `.irl-grp-body` (cohérent design system, responsive 1/2/3/4 cols selon viewport, dark mode OK).
  - Persistance collapse `localStorage.irl_grp_collapsed` (array de keys).
  - Vitest 772 → 790 (zéro régression). Commit à pousser.
  - Vérif preview : 3 groupes rendus, KPI corrects (3 lots / 1 950 € HC / 2 ⚠ pour Ferrette), collapse via clic, persistance localStorage validée après re-render.
- Reste : propagation aux 9 autres onglets (Loyers, Quittances, EDL, Assurances, Équipements, Régul, Travaux, Baux, PJ) — au fil de la roadmap V3-REFONTE-* onglet par onglet.
- 2026-05-17 **v15.77 ✅ drill-downs IRL** : 3 drill-downs candidats validés par user (commit `4b05514`).
  - Module pur `js/core/irl-drill.js` (4 helpers, 21 tests Vitest) : `_irlDeltaImm`, `_irlListAlertes`, `_irlProjectionAnnuelle`, `_irlListLotsForDrill`.
  - KPI du header rendus cliquables (`.kpi.drillable` + `onclick` avec `event.stopPropagation`).
  - Modale unifiée `#ov-irl-drill` avec 3 vues (lots/alerts/compta) sélectionnables via pastilles d'onglets.
  - Vue **lots** : synthèse imm + liste lots avec statut IRL + HC actuel → nouveau.
  - Vue **alerts** : lots en alerte typés (gel DPE F/G, DPE manquant, index IRL manquant).
  - Vue **loyer** : loyer HC mensuel total, projection annuelle, Δ post-révisions.
  - Vitest 790 → 811, zéro régression.
  - Mockups responsive validés : `docs/strategie/mockups/group-by-immeuble/` (galerie 4 variantes + responsive media queries natives).
  - Dette technique mockup toggle device → `docs/subjects/TOOLING-MOCKUP-DEVICE-TOGGLE.md`.
