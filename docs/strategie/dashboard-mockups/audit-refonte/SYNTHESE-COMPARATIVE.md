# Synthèse comparative — 3 audits refonte HTML

> Croisée des 3 rapports : AUDIT-1 (code existant) · AUDIT-2 (mockup cible) · PLAN-REFONTE-HTML

## TL;DR

| Aspect | Verdict |
|---|---|
| **Faisabilité technique** | 🟢 OK · architecture modulaire favorable |
| **Effort** | 🟠 24-36h sur 1-2 semaines (vs 8-12h estimé initial) |
| **Risque préservation 23 drills** | 🟢 Faible si approche C |
| **Stratégie recommandée** | 🟢 Approche C (système render version) |
| **Mode Agence** | 🔴 Hors scope → Phase C dédiée |
| **2 décisions user critiques** | 🟠 Donut vs liste · Default v1 ou v2 dans index.html |

## Points d'alignement total (3 audits)

### 1. Préservation 23 drill-downs = engagement absolu
- AUDIT-1 inventorie les 23 (16 widgets `_DD[]` + 7 navigation)
- AUDIT-2 confirme tous les patterns dans le mockup (drill-ind ↗, onclick préservés)
- PLAN propose tests parity v1↔v2 pour garantir 100%

### 2. Helpers métier intouchables
Liste consensus :
- `_mkSparkline()` — utilisé hero/rev/chg/rdt
- `_kpiMonthlySeries()` — flux, etc.
- `_computeUnifiedTodo()` — todo-unified
- `_heroCashflowSeries()` — hero
- `_kpiDelta()` — pills delta
- Tous les `_build*Drill()` — drill détaillés
- `_computeImpayes()`, `_computeIRLRevision()`

### 3. CSS centralisé via variables
10 variables CSS suffisent pour 95% du design (`--bg`, `--bg2`, `--bg3`, `--t`, `--t2`, `--t3`, `--acc`, `--pos`, `--neg`, `--warn`). Toute la palette peut basculer en changeant ces variables.

### 4. Sidebar non touchée (engagement user)
- AUDIT-1 : sidebar = `.sb-*` classes, non concernées par refonte
- PLAN : grep pre-commit pour exclure `.sb-*`

## Contradictions à arbitrer

### A. Inventaire widgets : 16, 18, 23 ou 25 ?
| Source | Compte |
|---|---|
| Doc DRILL-DOWNS-INVENTAIRE.md (déjà commité) | 16 widgets _DD + 7 nav = 23 |
| AUDIT-1 | **25 widgets** dans buildDashWidget (incluant `cf`, `cfyr`, `bars`, `enc`, `stat`) |
| AUDIT-2 | 18 visibles selon vue |
| PLAN | 16 visibles principaux + 6 niche |

→ Vérité : **25 widgets définis** dans `buildDashWidget`, dont **16 ont un drill-down** explicit. 9 widgets sont soit masqués par défaut (`rev`, `chg`, `bars`, `cf`, `cfyr`), soit informatifs sans drill (`enc`, `stat`, séparateurs).

### B. Donut vs liste à barres
- AUDIT-2 : le mockup montre **donut conic-gradient**
- AUDIT-1 : commentaire code ligne 7658 dit `« v2 Phase 3 : liste à barres pour remplacer donut jugé peu visuel »`
- PLAN : flag **« validation user explicite »**

→ **Action user requise** : on suit le mockup (donut) ou on garde la liste à barres v2 Phase 3 ?

### C. Mode Agence : Phase B ou Phase C ?
- Mockup intègre la vue Agence complète (switcher portfolio + commissions + Top bailleurs)
- AUDIT-1 : DASH_TAB_PRESETS n'a PAS de preset 'agence'
- PLAN : **« hors scope → Phase C »** car demande de nouvelles fonctions métier (`_computeCommissionsHoguet`, multi-portfolio)

→ Recommandation : reporter Agence à Phase C. Tu confirmes ?

### D. Sparkline : SVG actuel ou HTML bars du mockup ?
- Code : `_mkSparkline()` SVG avec tooltips + accessibilité
- Mockup : `<div class="spark"><div class="spark-bar"></div>...</div>` simple
- PLAN recommande : **conserver SVG** (déjà testé, accessibilité bonne), juste adapter wrapper `.spark`

→ OK pour conserver SVG ?

## Décisions critiques utilisateur

### 1. Approche refonte
- **A** Big-bang : risqué, mais cohérent
- **B** Progressive : cohab v1/v2 visible
- **C** Render version (recommandé) : rollback instantané, +50 lignes

### 2. Donut vs liste à barres
- **Donut** (mockup) : visuel moderne, 4 segments CSS pur
- **Liste à barres** (v2 Phase 3) : choix user antérieur, plus dense

### 3. Mode Agence
- **Inclus Phase B** : +8-12h, demande nouvelles fonctions métier
- **Reporté Phase C** : recommandé, scope clair

### 4. Default v1 vs v2 dans index.html après promotion
- **v1 par défaut** : transition douce, toggle pour beta-testeurs
- **v2 par défaut** : push UX nouvelle, retour à v1 possible via toggle

### 5. Effort 24-36h acceptable ?
- Estimation Phase B initiale : 11-16h
- Plan réaliste : **24-36h** (+ 8-12h Agence Phase C plus tard)

## Findings critiques de l'audit code (AUDIT-1)

### Variables globales à connaître
- `_DD = {}` — peuplée à chaque rDash(), drill-downs
- `_dashCtx` — contexte utilisé par drill-opens
- `_dashEditMode` — mode édition (drag, resize)
- `_drillEntNom`, `_drillEntImm` — tracking modal courant

### État persistant
- `localStorage._isEntExpanded(nom)` — état Replier/Voir entité (mode Patrimoine)
- `localStorage.immotrack_theme` — **conflit récent corrigé v15.25** (Paramètres > Thème + toggle 3 thèmes)
- `localStorage.immotrack_theme_mode` — nouvelle clé v15.25 pour toggle 3 thèmes

### Tests Vitest existants
- 744 tests passants
- 40 sur dashboard-temporel (helpers métier)
- 20-30% coverage sur buildDashWidget (helpers OK, pas rendu HTML)
- 10% coverage sur rDash (filtrage scope OK)

## Plan d'action proposé

### Étape 1 (immédiat) — Décisions user
Tu valides :
- [ ] **Approche C** (render version system)
- [ ] **Donut conic-gradient** OU liste à barres
- [ ] **Mode Agence reporté Phase C**
- [ ] **Sparkline SVG conservé**
- [ ] **Default v1 dans index.html** après promotion (v2 dans sandbox)
- [ ] **Effort 24-36h** sur 1-2 semaines accepté

### Étape 2 — Scaffolding (Setup système version)
- 2-3h
- `buildDashWidget` → `_buildWidgetV1Legacy` (renommage sans modif)
- Nouveau `_buildWidgetV2Modern` qui délègue à v1 par défaut
- Dispatcher en haut
- Toggle dans Paramètres dashboard
- Tests dispatcher (3 tests)

### Étape 3 — Itérations par widget
Cadence : 1-2 commits par jour, validation user après chaque étape majeure :
- hero (4h)
- todo-unified (2-3h)
- flux (2-3h)
- context-bar (2h)
- 4 KPI (occ/rdt/dg/donut) (3-4h cumulés)
- prog + solde + agenda (4-6h)
- dash-ent-cards Patrimoine (5-6h)
- Vue Comptable (3-4h)
- Polish + responsive (2-4h)

### Étape 4 — Promotion
Après validation visuelle complète :
- Copier changes index-test.html → index.html
- Garder v1 default dans prod (toggle accessible)
- Activer v2 default après 1 semaine de feedback OK

## Ma recommandation finale

**GO avec approche C**, mais **mode Agence reporté Phase C**. Effort réel : **24-30h sur 2 semaines part-time** (sans Agence).

Tu valides les 6 décisions de la section "Étape 1" ?
