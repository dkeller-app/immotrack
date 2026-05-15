# AUDIT-1 — Code dashboard existant

> Agent Explore · 2026-05-15 · Avant refonte HTML Phase B v15.25+

## Synthèse

Architecture solide et modulaire permettant une refonte sans casser les 23 drill-downs. Acteurs principaux :
- **rDash()** ligne 5253 : orchestrateur 3 modes (Finance/Gestion/Patrimoine)
- **buildDashWidget(id, ctx, col, row)** ligne 7164 : fabrique générique pour **25 widgets**
- **Drill-downs** : 16 dans `_DD[]` + 7 navigation contextuelle
- **CSS** : 62 classes `.dw-*` bien nommées
- **Tests** : 744 Vitest dont ~40 dashboard-temporel

## 1. Structure de `buildDashWidget(id, ctx, col, row)`

### Signature ligne 7164
```js
function buildDashWidget(id, ctx, col=3, row=2) {
  const {scopeLogs, mvs, mvsYTD, mvsPrev, yr, mo, refYrMo,
          activeEnt, scopeRefs, scopeImms} = ctx;
  const _cellH  = row * 72 + (row - 1) * 12;
  const _chartH = Math.max(30, _cellH - 70);
  const _valSize = Math.round((col >= 8 ? 34 : col >= 5 ? 28 : 22) + ...);
  // Helpers : lbl(), wval(), wd(), wsub(), wdelta(), gauge(), ai()
  if(id==='hero') { /* ... */ }
  if(id==='todo-unified') { /* ... */ }
  // ... 25 blocs if(id==='xxx')
}
```

### Inventaire 25 widgets

| # | ID | HTML générée (résumé) | Classes CSS | Drill-down | Helpers JS | Retour |
|---|---|---|---|---|---|---|
| 1 | context-bar | dw-context-grid + greet + date + pills | .dw-context-* | — | getSalutation() | wd(body) |
| 2 | hero | dw-hero-click + sparkline 12m | .dw-hero-* | _buildHeroDrill() | _heroCashflowSeries(), _mkSparkline(), _computeImpayes() | wd(body, '', heroStatus) |
| 3 | todo-unified | 4 quads MRH/IRL/Équip/Régul | .dw-todo-* | _buildTodoDrill() | _computeUnifiedTodo() | wd(body, '', status) |
| 4 | flux | Double sparkline rev/chg + net | .dw-flux-* | _buildFluxDrill() | _kpiMonthlySeries(), SVG | wd(body, '', grn/red) |
| 5 | rev | KPI label+value + 200px sparkline | .dw-kpi-* | _buildRevDrill() | _mkSparkline(), _kpiDelta() | wd(_kpiBody(...)) |
| 6 | chg | KPI label+value + 200px sparkline | .dw-kpi-* | _buildChgDrill() | _mkSparkline(), _kpiDelta() | wd(_kpiBody(...)) |
| 7 | cf | Valeur + sous-ligne pct YTD | .dw-label, .dw-value | — | wdelta() | wd(...) |
| 8 | cfyr | Cash-flow YTD + % progressbar | .dw-label, .dw-kpi-bar | — | gauge(), wdelta() | wd(...) |
| 9 | bars | 6 mois revenus/charges barres SVG | .dw-label | — | Barres SVG custom | wd(...) |
| 10 | occ | % occupation + bar + vacances | .dw-kpi-*, .dw-kpi-bar | _buildOccDrill() | _kpiBody() | wd(..., '', status) |
| 11 | rdt | % rendement brut + sparkline 6m | .dw-kpi-* | _buildRdtDrill() | _mkSparkline(), calcul annualisation | wd(..., '', status) |
| 12 | dg | Total DG + count mini | .dw-kpi-* | inline table | — | wd(..., '', 'blu') |
| 13 | donut | Barres catégories top 3+Autres | .dw-cat-* | _DD['donut'] + chart 6m | _mkMultiLineChart() | wd(..., '', 'blu') |
| 14 | prog | Table entité/immeuble attendu/réalisé | .dw-kpi-*, table inline | _buildProgDrill() | computeGroup(), _computeExpectedRent() | wd(..., '', grn/red) |
| 15 | solde | Table immeuble prov/charges/solde | .dw-kpi-*, table inline | _buildSoldeDrill() | Logique provisions | wd(..., '', grn/red) |
| 16 | mag | Valeur + list logements vacants | .dw-label, .dw-value | inline table | ai() | wd(..., seeAll('mag')) |
| 17 | irl | Alertes IRL applicables + imminentes | .dw-label, .dw-value | inline table | computeIRLRevision(), ai() | wd(..., seeAll('irl')) |
| 18 | bail | Alertes baux expirant | .dw-label, .dw-value | inline table | ai() | wd(..., seeAll('bail')) |
| 19 | mrh | MRH manquantes + count | .dw-label, .dw-value | inline table | — | wd(..., seeAll('mrh')) |
| 20 | regul | Régul dues + count | .dw-label, .dw-value | inline table | — | wd(..., seeAll('regul')) |
| 21 | enc | Grid attendu/reçu/reste 3 cols | .dw-label, inline grid | — | gauge() | wd(..., '', status) |
| 22 | stat | Table logement loyer/locataire/reste | table inline | — | — | wd(..., '', 'blu') |
| 23 | vac | Vacants count + list | .dw-label, .dw-value | — | ai() | wd(..., '', status) |
| 24 | ass | Assurances expirant 30j | .dw-label, .dw-value | — | ai() | wd(..., '', status) |
| 25 | agenda-dash | List overdue + upcoming 15j | .dw-label, .dw-value | _agRow() | AGENDA_CATS | wd(..., seeLink(...)) |
| — | sep-finance | div.dw-sep + label | .dw-sep | — | — | wd(...) |
| — | sep-gestion | div.dw-sep + label | .dw-sep | — | — | wd(...) |

### Pattern retour `wd(body, foot, status)`
```js
const wd = (body, foot='', status='') => ({body, foot, status});
// Statuts d'accent latéral : '' | 'red' | 'ora' | 'grn' | 'blu' → .dw-s-* (border-left 4px)
```

## 2. Render `dash-ent-cards` (Entité/Immeuble/Logements)

Localisation : `rDash()` ligne ~5329.

### Architecture (3 niveaux imbriqués)
```js
el('dash-ent-cards').innerHTML = entsToShow.map(e => {
  const eLogs = aliveLogs.filter(l => l.entity === e.nom);
  const canCollapse = eImms.length > 2;
  const expanded = _isEntExpanded(e.nom);  // localStorage persist
  // Vue pliée (>2 immeubles) : collapsed list
  const immCollapsedList = ...
  // Vue dépliée : bulles immeuble + mini-cartes logement
  const immFullBulles = ...
  return `<div class="card dw-ent-card" onclick="_entCardClick(...)">
    /* recap ent */
    ${showFullBulles ? immFullBulles : immCollapsedList}
  </div>`;
}).join('');
```

### Classes CSS

| Classe | Élément | Visuel | Interaction |
|---|---|---|---|
| `.dw-ent-card` | Conteneur entité | Card blanche, padding, hover shadow | onclick `_entCardClick(nom)` |
| `.dw-imm-bulle` | Bulle immeuble | Card imbriquée, background subtil | onclick `_immBulleClick(event, imm)` |
| `.dw-log-mini` | Mini-card logement | 160px minmax grid, border colorée | onclick `_logMiniClick(event, ref)` |
| `.dw-ent-collapsed-imm` | Item liste pliée | Flex row, font petit | onclick `_immBulleClick(event, imm)` |
| `.dw-ent-toggle` | Bouton replier/voir | Petit bouton gris | onclick `toggleEntExpand(nom, event)` |

### Statuts logement (inline style + logique métier ligne ~5395)
```js
const enc = /* montant loyer encaissé pour la période */;
const reste = Math.max(0, att - enc);
const payeC = enc >= att, partP = enc > 0 && !payeC;
const bdc = payeC ? 'rgba(63,185,80,.35)' : partP ? 'rgba(240,136,62,.5)' : 'rgba(248,81,73,.45)';
const ic  = payeC ? 'var(--grn)'         : partP ? 'var(--ora)'        : 'var(--red)';
const si  = payeC ? '✓'                  : partP ? '~'                 : '✗';
// Vacant → badge gris séparé, pas de statut paiement
```

## 3. Classes CSS `.dw-*` (62 classes)

### Groupes principaux
- **Grille** : `.dw-c1`–`.dw-c12`, `.dw-r1`–`.dw-r6`
- **Carte base** : `.dw`, `.dw-body`, `.dw-foot`
- **Statut accent** : `.dw-s-red/ora/grn/blu` (border-left 4px)
- **Typo** : `.dw-label`, `.dw-value`, `.dw-sub`
- **Boutons** : `.dw-see-all`, `.dw-see-all::after`
- **Séparateur** : `.dw-sep`, `.dw-sep-label`, `.dw-sep-line`
- **Drag/Edit** : `.dw-dragging`, `.dw-drop-before/after`, `.dw-edit`, `.dw-resize`
- **Pill** : `.dw-pill`, `.dw-pill-dot`, `.dw-pill.delta-up/down`
- **Context** : `.dw-context-grid`, `.dw-context-left/right/date/greet`
- **Hero** : `.dw-hero-click`, `.dw-hero-grid`, `.dw-hero-left/right/value/meta/impaye`, `.dw-spark-wrap`, `.dw-spark-tip`
- **KPI** : `.dw-kpi-click`, `.dw-kpi-label/value/viz/bar/bar-fill/arrow`
- **Skeleton** : `.dw-skeleton-block/line/.w-60/.w-40/.w-80`
- **Ent/Imm** : `.dw-ent-card/toggle`, `.dw-imm-bulle`, `.dw-log-mini`, `.dw-ent-collapsed-imm/-name`
- **Todo** : `.dw-todo-head/title/count`, `.dw-todo-count.red/ora/info`, `.dw-todo-quad/item/dot`
- **Cat** : `.dw-cat-row/bar/bar-fill/pct`
- **Flux** : `.dw-flux-values/sublabel/value/net`

**Total : 62 classes `.dw-*` + 3 classes mode (`.dash-mode-patrimoine/finance/gestion`)**

## 4. Drill-downs câblés (23 total)

### A. Widgets via `_DD[]` (16)
```js
_DD['hero'] = _buildHeroDrill(ctx, cf, prevCf, cfYTD);
_DD['todo-unified'] = _buildTodoDrill(ctx);
_DD['flux'] = _buildFluxDrill(ctx);
_DD['rev'] = _buildRevDrill(ctx);
_DD['chg'] = _buildChgDrill(ctx);
_DD['occ'] = _buildOccDrill(ctx);
_DD['mag'] = {title, html};  // inline
_DD['dg']  = {title, html};
_DD['irl'] = {title, html};
_DD['bail'] = {title, html};
_DD['mrh'] = {title, html};
_DD['regul'] = {title, html};
_DD['donut'] = {title, html};
_DD['prog'] = _buildProgDrill(ctx);
_DD['rdt'] = _buildRdtDrill(ctx);
_DD['solde'] = _buildSoldeDrill(ctx);
```

### B. Navigation contextuelle (7)
| # | Trigger | Handler | Cible |
|---|---|---|---|
| 17 | Hero meta « Impayés N » | `_dashGoImpayes()` ligne 5155 | Page Quittances filtrée `statut=impayée` |
| 18 | Clic `.dw-ent-card` | `_entCardClick(nom)` | `drillToEnt(nom)` — modal entité |
| 19 | Clic `.dw-imm-bulle` | `_immBulleClick(event, imm)` | `drillToImm(imm)` — modal immeuble |
| 20 | Clic `.dw-log-mini` | `_logMiniClick(event, ref)` | Fiche 360° logement |
| 21 | Bouton "Voir tout" | `_openDD(key)` | Modal `openDashDrill(...)` |
| 22 | Clic événement agenda | `go('agenda',...)` | Page Agenda + ouvre evt |
| 23 | Onboarding vide | `_renderDashOnboarding()` | CTA vers page Biens |

### C. Patterns onclick (40+ occurrences à préserver)
```html
onclick="_openDD('xxx')"
onclick="_dashCardClick('hero',event)"
onclick="event.stopPropagation();_dashGoImpayes()"
onclick="_entCardClick('${escAttr(e.nom)}')"
onclick="_immBulleClick(event,'${escAttr(imm)}')"
onclick="_logMiniClick(event,'${escAttr(l.ref)}')"
onclick="if(!_dashEditMode){...go('irl',null)}"
onclick="toggleEntExpand('${escAttr(e.nom)}',event)"
```

## 5. Points de risque pour refonte HTML

### A. Logique conditionnelle complexe par widget
- **occ** : seuils visuels 3 niveaux (≥90/≥50/défaut)
- **rdt** : seuils 3 paliers rouge/orange/vert
- **prog** : table emboîtée entité/immeuble
- **solde** : filtre catégories `DB.catConfig[c].inclCharges` (peut être vide)
- **dash-ent-cards** : `canCollapse = eImms.length > 2` + `_isEntExpanded()` (localStorage persist)
- **irl/bail** : tri par urgence, agrégat "+N autres"
- **todo-unified** : 4 quadrants sévérité + count global

### B. Variables globales mutables
| Variable | Mutation | Risque |
|---|---|---|
| `_DD = {}` | À chaque `rDash()` | Refonte doit copier toutes les clés |
| `_dashEditMode` | Mode édition | Désactive drag/onclick si true |
| `_dashCtx` | Ligne 5322 | Utilisée par drill-opens |
| `_isEntExpanded(nom)` | localStorage | État Replier/Voir persiste |
| `DB` | Référence engine | Mouvements/logements/catégories filtrés |

### C. Effets de bord post-rendu
- **Resize handler** (lignes 8100-8150) : drag × 6 rows
- **Drag handler** (lignes 8059-8099) : réordre widgets
- **Sparkline hover** (lignes 7402-7408) : tooltip SVG
- **localStorage save** : `saveDashLayout(layout)` après drop

### D. Pas d'animation CSS complexe (.15s max), pas d'effets dangereux

## 6. Tests Vitest existants

| Fichier | Concerné | Couverture |
|---|---|---|
| `dashboard-temporel.test.js` | ✅ ~40 tests | `_bailEstActifAt`, `_loyerHCAtDate`, `_chargesAtDate`, `_loyerProrataMois` |
| `dates.test.js` | ✅ | Helpers date context-bar/agenda |
| `montant.test.js` | ✅ | `fmt()` partout |
| `charges.test.js` | ✅ | Catégories, filtrage |
| `components.test.js` | ~ | Render HTML components |

**Coverage `buildDashWidget`** : ~20-30% (helpers calculs OK, pas rendu HTML)
**Coverage `rDash()`** : ~10% (tests filtrage scopeLogs)

### Helpers critiques à ne PAS toucher
- `_bailEstActifAt(log, date)`
- `_loyerHCAtDate(log, date, histo)`
- `_computeIRLRevision(log)`
- `_computeUnifiedTodo(ctx)`
- `_kpiMonthlySeries(ctx, months, fn)`
- `_mkSparkline(series, opts)` — utilisé par hero, rev, chg, rdt
- `_mkMultiLineChart(groups, opts)` — donut drill
- `_heroCashflowSeries(ctx, 12)`
- `_isLoyerCategory(cat)`
- `_kpiDelta(cur, prev, inverse)`

## Synthèse forces / risques

### ✅ Forces actuelles
1. Modularité : 25 widgets isolés dans `buildDashWidget`
2. Séparation logique/présentation : `_build*Drill()` détachées
3. Helpers testés : 744 tests Vitest
4. CSS prévisible : 62 classes `.dw-*` claires
5. UX accessibilité : aria-label, role, focus-visible déjà présents

### ⚠️ Risques refonte
1. **40+ handlers inline** : recenser exhaustivement avant
2. **État localStorage** : `_isEntExpanded()` dépend de `saveDashLayout`
3. **Variables globales** : `_DD`, `_dashCtx`, `_dashEditMode` à documenter
4. **Sparklines SVG** : `_mkSparkline()` retourne HTML SVG → ne pas casser le chemin

### 🎯 Approche recommandée
**Ne pas toucher** :
- Les 25 `if(id==='xxx')` blocs entiers (logique métier)
- Les `_build*Drill()` fonctions
- Les helpers `_kpiMonthlySeries`, `_mkSparkline`, etc.

**Reskin uniquement** :
1. Remplacer classes `.dw-*` par nouveaux tokens
2. Mettre à jour `openDashDrill()` modal style
3. Tester `_openDD(key)` end-to-end
4. Ajouter tests Vitest `buildDashWidget()` 3-4 cas par widget (20-30 nouveaux)

**Effort estimé** : 8-12h visuels + 6-8h tests = **14-20h Phase B v15.25+**
