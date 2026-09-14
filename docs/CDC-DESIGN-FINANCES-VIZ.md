# CDC — Visualisation graphique de l'onglet Finances

**Statut : VALIDÉ par Didier le 2026-09-14.** Fait foi pour l'intégration.
Périmètre : **ajout d'une carte graphique** dans `#p-finances`, au-dessus du tableau P&L.
**Aucun moteur, aucune ligne, aucune formule, aucune fenêtre du P&L n'est touchée** — le fonctionnel reste régi par `docs/CDC-FINANCES.md` et le re-skin par `docs/CDC-DESIGN-FINANCES.md`.

Mockup de référence (fait foi) : `mockups/FINANCES-VIZ/FINANCES-VIZ.html` (2 onglets × 2 thèmes × 3 formats, vérifié navigateur).

---

## 1. Ce qu'on ajoute

Une **carte « Évolution »** unique, à **deux onglets**, insérée entre les ratios et le host `#fin-pl` :

| Onglet | Contenu | Couleurs (grammaire §5) |
|---|---|---|
| **Cash-flow réel** | aire vert/rouge **splittée à 0** (rendu natif `_mkSparkline` signColoring) + ligne **N-1** grise pointillée | `--pos` / `--neg` = **signe** du résultat ; N-1 = `--t3`. Légitime : c'est un flux signé, pas deux séries. |
| **Revenus / charges** | 2 lignes : **revenus en gris** (`--t2` + aire `--gry-soft`), **charges en corail** (`--acc`) | Légende nue « revenus » / « charges ». |

**Décision Didier — dérogation assumée à `CDC-DESIGN-FINANCES §1` (« corail = accent uniquement ») :** sur l'onglet revenus/charges, le **corail porte la série « charges »** et le **gris la série « revenus »**, pour l'identité de marque Propryo. Cette dérogation est **volontaire et bornée à cette carte** — ne pas la « corriger » vers vert/rouge dans une passe design ultérieure. L'onglet cash-flow, lui, garde vert/rouge (signe).

Le récit visuel voulu : quand le **corail passe au-dessus du gris** (charges > revenus), le mois est en cash-flow négatif.

---

## 2. Données — 12 mois glissants, périmètre de la page

- **Fenêtre = 12 mois glissants** finissant au mois courant (comme le Hero Pulse du dashboard).
- Source = `_finMonthly(y, scope, _finWindows(y, scope).constat)` **par année civile couverte**, exactement le patron de `_heroCashflowSeries` — mais alimenté avec le **`scope` de la page** (`_finEntScope(entSel, immSel)`, donc **entité + immeuble**), pas seulement l'entité.
- Par mois, on extrait du bucket `_computeFinancesMonthly` :
  - `cashflowReel` (onglet 1) ;
  - `revenus = loyersHC + recettesDiverses` (onglet 2) ;
  - `charges` (onglet 2, = charges propriétaire du socle) ;
  - `cfN1` = `cashflowReel` du même mois un an plus tôt (onglet 1, ligne N-1) — même map, années couvertes étendues de 12 mois.
- **Aucun recalcul maison** : mêmes chiffres que le tableau P&L et que le dashboard (un seul moteur).
- Mois en cours = partiel, cohérent avec le dashboard. Pas de faux zéro : si le moteur ES n'est pas chargé (file://), la carte n'est pas rendue (même garde que `rFinances`).

---

## 3. Rendu

- Renderer dédié `_finRenderViz(scope, yr)`, appelé après `_finRenderPLv2` ; peuple `#fin-viz`.
- SVG **maison**, thème-aware, calqué sur `_mkSparkline` (aire sign-split, baseline 0, tooltips `_sparkTip`) et `_mkMultiLineChart` (grille Y, labels X, légende). Réutilise `fmt()` (€), `escHtml()`, `_sparkTip()`.
- **Chiffres** : `var(--display)` (Manrope), `tabular-nums`, crans typo (héro/`--fs-h1`/`--fs-num`).
- **Cartes** : `var(--sur)` + `1px var(--bor)` + `--rl`. Onglets = pastille `--rp`, focus **corail** (`--focus-ring`).
- **Palette close** : vert, rouge, gris, corail (dérogation §1) — jamais un hexa en dur, toujours un token.

---

## 4. Responsive (3-4 formats, clair + sombre)

- PC / tablette : carte pleine largeur, hauteur graphe ~224 / ~196 px.
- Téléphone (≤ breakpoint page) : onglets en **pleine largeur**, hauteur graphe réduite (~168 px), un tap = tooltip.
- Téléphone paysage (RS-2) : la carte se resserre comme le reste de l'onglet.
- Tokens + focus identiques aux deux thèmes.

---

## 5. Ce qui NE change pas

- Moteurs `finances-monthly.js` / `-window.js` / `-scope.js`, le tableau P&L, les drills, les fenêtres, les exports.
- `_heroCashflowSeries` (dashboard) reste tel quel ; la carte Finances a son propre builder scope-complet.
- `index.html` en **CRLF**.
- Tokens de `css/main.css` (on réutilise `--pos/--neg/--acc/--t2/--t3` ; on ajoute seulement `--gry-soft` si absent, dans les deux thèmes).

---

## 6. Reste à faire (chantier `feat/finances-viz`)

1. Insérer `#fin-viz` + `_finRenderViz` + le builder `_finVizSeries` + le renderer SVG + le CSS scopé.
2. Bump version `index.html` (title + footer) + message de commit.
3. **Audit `superpowers:code-reviewer`** avant « prêt à tester ».
4. Smoke user : PC / tablette / téléphone (+ paysage), clair **et** sombre, sur les 2 onglets, périmètre Tout / entité / immeuble, exercice avec et sans données.
5. Worktree détruit après intégration ; `BACKLOG.md` mis à jour à la livraison.
