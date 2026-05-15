# PLAN-REFONTE-HTML — Refonte HTML widgets dashboard Phase B

> Agent Plan · 2026-05-15 · Sur la base AUDIT-1 + AUDIT-2

## Stratégie globale — 3 approches

### A. Big-bang refonte `buildDashWidget`
- ✅ Cohérence visuelle parfaite · 1 commit auditable
- ❌ Aucun rollback granulaire · validation user binaire (oui/non)
- Effort : 14-20h · Risque : **Élevé**

### B. Refonte progressive widget par widget
- ✅ Validation user granulaire · rollback par widget
- ❌ Période transitoire bancale (v1 + v2 cohabitent)
- Effort : 18-26h · Risque : **Moyen**

### C. Système render version `dashRenderV` ⭐ **RECOMMANDÉ**
```js
function buildDashWidget(id, ctx, col=3, row=2) {
  const v = (DB.params && DB.params.dashRenderV) || 'v1';
  return v === 'v2'
    ? _buildWidgetV2Modern(id, ctx, col, row)
    : _buildWidgetV1Legacy(id, ctx, col, row);
}
```
- ✅ Rollback instantané (1 flag) · 744 tests Vitest restent verts (v1 inchangé)
- ✅ Dogfooding sandbox-first · pas de cohabitation forcée
- ✅ Tests parity v1↔v2 garantissent préservation 23 drills
- ❌ +50 lignes dispatcher · 2h scaffolding additionnel
- Effort : 20-28h · Risque : **Bas**

## Plan détaillé par widget

### Effort par widget (Approche C)

| # | Widget | Effort | Drills préservés | Risque |
|---|---|---|---|---|
| 1 | context-bar | M (2h) | — | Dépendance `mvsYTD` au scope ent |
| 2 | hero | L (4h) | hero, _dashGoImpayes | Sparkline SVG vs HTML bars du mockup |
| 3 | todo-unified | M (2-3h) | todo-unified | Vérifier shape `_computeUnifiedTodo` |
| 4 | flux | M (2-3h) | flux | Normalisation barres sur max 12 mois |
| 5 | occ | S (45min) | occ | Aucun |
| 6 | rdt | S (45min) | rdt | Sub-line à enrichir (théorique) |
| 7 | donut | M (1-1.5h) | donut | **⚠ Validation user explicite** (v2 Phase 3 avait choisi liste à barres) |
| 8 | dg | S (30min) | dg | Aucun |
| 9 | prog | M (2h) | prog | Préserver tableau hiérarchique dans drill |
| 10 | solde | M (1.5h) | solde | Normalisation barres sur max\|solde\| |
| 11 | agenda-dash | M (2h) | agenda | Max 1 event/cellule + badge "+N" |
| 12 | mag | S (45min) | mag | Premier vacant + "+N autres" |
| 13 | mrh/irl/bail/regul/vac/stat | 4×S (2-3h) | 4 drills | Faible (widgets niche) |
| 14 | **dash-ent-cards (Patrimoine)** | **L (5-6h)** | _entCardClick, _immBulleClick, _logMiniClick | Performance avec 50+ logements |
| 15 | context-bar Agence (multi-portfolio) | L (4h) | 4 nouveaux à créer | **⚠ Hors scope Phase B → Phase C** |
| 16 | Vue Comptable invité (nouveau) | M (3-4h) | Aucun (lecture seule) | Composant nouveau v2-only |

## Plan d'attaque temporel

| Étape | Travaux | Effort | Tests Vitest ajoutés | Rollback |
|---|---|---|---|---|
| **0. Setup** | Renommer `buildDashWidget` → `_buildWidgetV1Legacy` · créer dispatcher · toggle Paramètres | 2-3h | 3 tests dispatcher | Supprimer dispatcher |
| **1. Widgets prio** | hero + todo + flux + 4 KPI + context-bar | 6-8h | ~16 tests structure + parity | Toggle v1 |
| **2. Widgets sec.** | prog + solde + agenda | 4-6h | ~8 tests | Toggle v1 |
| **3. Patrimoine** | dash-ent-cards refonte complète | 4-6h | ~5 tests + perf | Toggle v1 |
| **4. Comptable** | Overlay modal + 6 exports + ventilation 2044 | 3-4h | ~5 tests | Feature flag |
| **5. Polish** | Responsive 3 bp + a11y + validation user finale | 2-4h | — | — |
| **TOTAL** | | **24-36h** | ~30-40 tests | |

## Tests Vitest à écrire

- `dashboard-v2-render.test.js` — Structure HTML par widget
- `dashboard-v2-drilldowns.test.js` — `_DD[key]` toujours peuplé
- `dashboard-v2-parity.test.js` — v1 et v2 produisent même `_DD[key]`
- `dashboard-v2-a11y.test.js` — aria-label, role, tabindex
- `dashboard-v2-dispatcher.test.js` — flag routes correctement
- `dashboard-v2-perf.test.js` — stress 50 logs sous 100ms

**Total : 30-40 nouveaux tests · 3-5h**

## Risques + mitigations (12 identifiés)

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Casser un drill-down | Faible | **Critique** | Approche C + tests parity v1↔v2 |
| 2 | Performance Patrimoine 50+ logs | Moyenne | Élevé | Test perf dédié, transform/opacity only |
| 3 | Sparkline SVG vs HTML bars | Moyenne | Moyen | Conserver SVG, wrapper `.spark` flex |
| 4 | Cohabitation v1/v2 effets bord | Faible | Moyen | Toggle binaire, pas de cohab forcée |
| 5 | `_computeUnifiedTodo` shape | Faible | Moyen | Confirmé liste plat (ligne 7317) |
| 6 | conic-gradient sur old browsers | Très faible | Faible | Chrome desktop only OK |
| 7 | **Donut vs liste à barres** | Élevée | Faible | **Validation user explicite avant code** |
| 8 | Mode Agence trop ambitieux | Élevée | Élevé | **Sortir scope → Phase C** |
| 9 | Tests Vitest break renommage | Moyenne | Élevé | Alias compat si appels directs |
| 10 | Responsive 1440 → 768 → 375 | Moyenne | Élevé | Media queries dédiées + test 3 vp |
| 11 | Sidebar accidentellement touchée | Faible | Moyen | Grep pre-commit, exclure `.sb-*` |
| 12 | User n'aime pas Dark Boursorama | Moyenne | Faible | Variables CSS centralisées 1 ligne |

## Verdict

**Refonte HTML faisable en 24-36h sur 1-2 semaines part-time** avec l'**Approche C (système render version)** :
- ✅ Préserve 23 drill-downs sans toucher aux `_build*Drill`
- ✅ Préserve les helpers métier (`_mkSparkline`, `_computeUnifiedTodo`, `_kpiMonthlySeries`)
- ✅ Rollback instantané via flag `DB.params.dashRenderV`

**Conditions sine qua non** :
1. Approche C non négociable (sécurité rollback)
2. Tests parity v1↔v2 systématiques (engagement 100% drills)
3. Validation user après **chaque étape**
4. **Confirmer donut vs liste-à-barres** avant code widget donut
5. **Mode Agence reporté Phase C** (logique métier nouvelle hors scope)

**Recommandation** : Go, en suivant ce plan séquencé.
