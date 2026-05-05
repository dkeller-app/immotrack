# GANTT-OCCUPATION — Plan d'occupation Gantt immeuble (FICHES-PARITE-360 Session 2)

**Status** : ✅ **Livré v14.45** · **Prio** : P1 · **Taille** : M (~3h, killer feature)
**Détecté** : 2026-05-03
**Lié à** : FICHES-PARITE-360 Session 2 · VACANCE-VIZ (réutilise `_getAllBailsForLog`, `_monthsBetweenIso`)

## Demande utilisateur

> 💬 « 1 fais moi rêver ! n'oublie pas il faut que ce soit PC/ tablette et tel ! et tu es un vrai expert design et on pense expérience utilisateur !! »

Choix de l'option 1 du backlog FICHES-PARITE-360 Session 2 :
> Plan d'occupation Gantt immeuble · 24 mois passés + 12 futurs, ligne par logement, barres = baux par locataire · **Killer feature** vs Qalimo/BailFacile/Smovin

## Vision design

Pas un Gantt « projet » classique. Un **« écosystème vivant de l'immeuble »** : chaque locataire est un personnage (couleur identitaire persistante), chaque logement est une scène, le temps coule de gauche à droite.

### Layout

```
┌───────────────────────────────────────────────────────────────┐
│ 📅 Plan d'occupation       ●Bail actuel ●Projeté ░Vacance    │
│                                                                 │
│ Occup. mensuelle ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
│                                ↓ aujourd'hui                   │
│ ┌──────────┐ ┌──────────────────│──────────────────────────┐  │
│ │  F-001   │ │█ Pierre ████│ ░ │█ Natalia ████│▓ proj. ▓│ │  │
│ │ T2 65m²  │ │ 8/22→5/24   │vac│ 8/24→en cours│           │ │  │
│ ┌──────────┐ ┌──────────────────│──────────────────────────┐  │
│ │  F-002   │ │░░░░░│██ Marc ████████│██ proj. ██│         │ │  │
│ │ T3 78m²  │ │  vac │ 11/24→11/27   │           │         │ │  │
│ └──────────┘ └──────────────────│──────────────────────────┘  │
│                                                                 │
│ ┌──────┬──────┬──────┐                                         │
│ │ 78%  │24mois│-12K€ │ Stats footer                            │
│ │occup │bail  │manque│                                         │
│ └──────┴──────┴──────┘                                         │
└───────────────────────────────────────────────────────────────┘
```

## 7 éléments wahoo

### 1. Couleur par locataire = hash déterministe HSL
```js
function _tenantColor(name) {
  let hash = 0;
  for(let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  const h = (Math.abs(hash) % 320 + 20); // évite zone rouge 340-360°
  return `hsl(${h}, 62%, 52%)`;
}
```
**Pierre est toujours bleu turquoise**, sur 3 fiches différentes ou 6 mois plus tard. Mémoire visuelle inter-vues = wahoo discret. La zone rouge (350-20°) est exclue pour ne pas confondre avec « vacance ».

### 2. Mini-strip d'occupation globale (top du Gantt)
Une barre fine 18 px qui agrège le **% d'occupation de l'immeuble entier** mois par mois. 5 paliers de couleur (vert solide ≥ 95% → orange 70% → rouge < 40%). Permet de repérer les creux d'un coup d'œil avant de descendre dans les lignes.

### 3. Marker « Aujourd'hui » vertical avec animation pulse
- Trait 2 px `var(--acc)` traversant tout le Gantt
- Pseudo-élément `::before` : disque 8 px en haut avec `box-shadow` glow bleu
- Animation `@keyframes igt-pulse` 2.2s ease-in-out infinite (opacity 0.85 ↔ 1.0)
- Subtil mais accroche l'œil

### 4. Différenciation passé / futur via motif
- **Bail réalisé** : barre pleine, couleur HSL solide
- **Projection** (échéance bail courant non clôturé) : `repeating-linear-gradient(45deg)` rayures + opacity 0.78 → indique « théorique, pas encore réalisé »
- **Vacance** : zone vide, hachures rouges très douces sur le track de fond (`repeating-linear-gradient(135deg, transparent, rgba(220,38,38,.06))`)

### 5. Hover bar → highlight cross-row du locataire
```js
function _ganttHighlight(tenant, on) {
  document.querySelectorAll('.immf-gantt-bar').forEach(b => {
    if(b.getAttribute('data-tenant') === tenant) {
      b.classList.toggle('immf-gantt-bar-hl', on);
    } else if(on) {
      b.classList.add('immf-gantt-bar-dim');
    } else {
      b.classList.remove('immf-gantt-bar-dim');
    }
  });
}
```
Si Pierre a habité F-001 puis F-003, hover sur n'importe quelle barre Pierre fait **clignoter doucement TOUTES** ses barres dans tout l'immeuble. Lecture du « parcours locataire ». Animation `@keyframes igb-pulse` 1.4s ease-in-out infinite.

### 6. Clic bar → drill-in fiche logement
Le Gantt n'est pas un cul-de-sac : `onclick → openLogFiche(ref)`.

### 7. Stats footer
3 KPIs en `.logf-hero-stats-3` (cohérence visuelle avec le scoreboard hero) :
- **Taux d'occupation moyen 24m** : agrégé sur tous les logements en gestion
- **Durée moyenne d'un bail** : `avg(_monthsBetweenIso(debut, fin))` sur baux clôturés
- **Manque à gagner cumulé 24m** : somme des loyers de référence (dernier bail) sur tous les mois vacants

## Responsive — 3 formats

| Breakpoint | Mois | Ligne | Label gauche | Label dans bar |
|---|---|---|---|---|
| **PC ≥ 1280 px** | 36 (24+12) | 44 px | 160 px | si bar > 6% |
| **Tablette 768-1279** | 36 (24+12) | 38 px | 110 px | si bar > 6% |
| **Tablette 768-900** | 36 compactés | 34 px | 90 px | hidden (légende cachée aussi) |
| **Mobile ≤ 600 px** | 36 (zoom out) | 30 px | 64 px | hidden (tooltip suffit) |
| Mobile stats | — | — | — | grid 1 col au lieu de 3 |

## Architecture technique

### State + sub-tabs
```js
let _currentImmFicheTab = 'logements'; // 'logements' | 'plan'
function setImmFicheTab(tab) {
  if(['logements','plan'].indexOf(tab) < 0) return;
  _currentImmFicheTab = tab;
  rImmFiche();
}
```

### Plage temporelle
- `startDate` = `today.month - 24, day 1`
- `endDate` = `today.month + 12, day 1` (exclusif)
- `totalMs` = `endDate - startDate`
- `toPct(iso)` convertit une date ISO en % de la timeline (clampé 0-100)

### Découpage barres
Pour chaque bail, on crée 1 ou 2 segments :
- **Segment réalisé** : `[debut → min(fin, today)]` — barre solide
- **Segment projection** : `[max(debut, today) → fin]` si bail courant non clôturé avec fin future

### Mini-strip occupation
Pour chaque mois (×36), on calcule :
- `totalLog` = nb logements en gestion ce mois (au moins 1 bail démarré avant ou pendant)
- `occupLog` = nb logements avec bail actif sur le 15 du mois
- `pct = round(occupLog / totalLog × 100)`
- Couleur : 5 paliers vert→jaune→rouge

### Stats footer
- Boucle 24 mois × N logements × bails
- Compte mois loués vs mois en gestion
- Compte durées des baux clôturés (en mois)
- Cumule manque à gagner par mois vacant (loyer du dernier bail antérieur)

## CSS clés

- `.immf-gantt-wrap` : container surface bordé, padding, overflow:hidden
- `.immf-gantt-row` : grid `[label fixe | track 1fr]` gap 10 px
- `.immf-gantt-track` : `position:relative`, hauteur fixe, hachures vacance par défaut
- `.immf-gantt-bar` : `position:absolute` left/width en %, transitions hover
- `.immf-gantt-today` : ligne verticale absolue 2 px avec `::before` disque
- `@keyframes igb-pulse` (highlight) + `@keyframes igt-pulse` (today)

## Critères d'acceptance

- [x] Sous-onglet « 📅 Plan d'occupation » actif sur fiche immeuble
- [x] Tab switching fonctionnel (state `_currentImmFicheTab` + setter)
- [x] 36 mois affichés (24 passés + mois courant + 11 futurs)
- [x] 1 ligne par logement de l'immeuble
- [x] Barres bail colorées par locataire (couleur déterministe persistante)
- [x] Segment réalisé + segment projection différenciés (rayures projection)
- [x] Mini-strip d'occupation globale top du Gantt
- [x] Marker « Aujourd'hui » vertical avec pulse animation
- [x] Header mois (J F M... + millésime au changement d'année)
- [x] Hover bar → highlight cross-row du locataire (animation pulse)
- [x] Click bar → ouverture fiche logement
- [x] Tooltip natif `title` sur chaque barre (locataire + dates + loyer)
- [x] Stats footer : taux occupation moyen 24m / durée bail moyenne / manque à gagner
- [x] Empty state si pas de logement
- [x] Responsive PC ≥ 1280 / tablette 768-1279 / mobile ≤ 600
- [x] Dark mode OK (couleurs `var(--sur)`, `var(--bor)`, etc.)
- [x] A11y : `role="tablist"` / `aria-selected` sur sous-onglets, `tabindex` + `Enter` sur lignes

## Limites connues / améliorations futures

- **Highlight cross-row** ne fonctionne que sur PC (pas de hover sur tactile). Acceptable en v1, à réfléchir pour mobile (long-press ?).
- **Drag-zoom** : pas implémenté. Plage 36 mois fixe. Si utilisateur a > 5 ans d'historique, il ne voit que les 24 derniers mois — acceptable car la roadmap prévoit Performance bailleur (Session 7) avec analytics multi-immeubles.
- **Baux historique sans `nom`** : fallback `'—'` (couleur grise). À nettoyer dans ARCHI-DB-DOUBLONS Phase 4.
- **Pas de filtre par locataire/période** : roadmap Session 7 si besoin.

## Journal

- 2026-05-03 : créé · vision design + 7 éléments wahoo + responsive 3 breakpoints + stats footer
- 2026-05-03 : livré v14.45 · helpers `_tenantColor` / `_tenantColorLight` / `_renderImmFichePlanGantt` / `_ganttHighlight` / `setImmFicheTab` · CSS `~200 lignes` · animations CSS `@keyframes igt-pulse` + `igb-pulse`
- 2026-05-03 (v14.46) : 3 améliorations suite retour utilisateur

### v14.46 — Tacite reconduction + zones vacance labellisées + pictogramme bail clôturé

#### Bug : projection manquante sur baux en tacite reconduction
> 💬 « zito a son anniversaire de bail en juin. ok pour les améliorations »

ZITO bail signé en 06/2024, fin théorique 06/2025 (1 an meublé) → fin date passée. Mais le bail est en **tacite reconduction** : pas de clôture, le bail est toujours actif jusqu'à la prochaine échéance anniversaire.

**Fix** : détection tacite reconduction via lecture directe `DB.baux[ref]` :
```js
const isTaciteReconduction = rawCurrent
  && !rawCurrent.cloture
  && !rawCurrent.finEffective
  && rawCurrent.fin
  && rawCurrent.fin <= todayIso;
```
Si vrai, calcul de la prochaine échéance anniversaire (+1 an itéré jusqu'à dépasser today) et override de la fin pour le rendu Gantt. La barre courante s'étend ainsi jusqu'à la prochaine date anniversaire et le segment projection apparaît correctement.

Tooltip enrichi : `(tacite reconduction → prochaine échéance)` au lieu de `(échéance projetée)` pour ces baux-là.

#### Amélioration 1 : labels « Vacant X mois (-Y €) » dans zones vacance ≥ 3 mois
- Calcul des `vacancySpans` par logement (gaps entre baux dans la fenêtre 36m)
- Filtre : durée ≥ 3 mois ET largeur visible > 4% de la timeline
- Pour chaque zone retenue, rendu d'un overlay `.immf-gantt-vac` avec :
  - Background hachures rouges plus visibles que celles du fond (vs `.06` → `.16` opacity)
  - Bordure dashed rouge légère
  - Label centré : `🚫 Vacant 5 mois · -2 800 €` (full) ou `🚫 5 mois` (compact si < 10% largeur)
  - Tooltip natif détaillé
- Calcul du manque à gagner : `(months × dernier loyer ref antérieur)` cumulé sur la zone

#### Amélioration 2 : pictogramme ✓ à la fin des baux clôturés
Pour chaque bail dont la fin est dans le passé ET qui n'est PAS en tacite reconduction (= bail vraiment terminé) :
- CSS `.immf-gantt-bar-ended::after` : disque blanc 14×14 px avec ✓ noir, position absolute right
- Box-shadow subtle pour détacher du fond
- Tooltip enrichi `(bail terminé)`
- Adaptation dark mode

Permet de visuellement distinguer « bail courant qui finit naturellement bientôt » d'un « bail vraiment terminé sans renouvellement ».

#### CSS ajoutés
- `.immf-gantt-bar-ended::after` (pictogramme ✓)
- `.immf-gantt-vac` (overlay vacance avec hachures + bordure)
- `.immf-gantt-vac:hover` (intensification au survol)
- `.immf-gantt-vac-lbl` (typographie label vacance)
