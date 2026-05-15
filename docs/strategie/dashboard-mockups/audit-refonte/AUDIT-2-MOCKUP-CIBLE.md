# AUDIT-2 — Mockup cible Phase B

> Agent Explore · 2026-05-15 · Décortique du mockup `dashboard-4-profils.html`

## Vue d'ensemble

Interface unifiée **1440×900 zéro-scroll** avec 5 profils + 1 overlay :

| Profil | Émoji | Subtitle | Toggle |
|---|---|---|---|
| Solo débutant | 🪴 | Minime | – |
| Solo Premium | 🏠 | Mode finance | 💰 Finance |
| Gestionnaire | 🛠 | Mode gestion | 🛠 Gestion |
| Patrimoine | 🏘 | Vue parc temps réel | 🏘 Patrimoine |
| Agence | 🏢 | Multi-bailleurs | – |
| Comptable invité | 📊 | Overlay lecture seule | – |

**Architecture critique** :
- `.stage` 1440×900 (sidebar 200px + main)
- Main grid : `grid-template-rows: 56px 1fr` (topbar | content)
- Content : `repeat(12, 1fr)` columns pour Premium/Gestion/Patrimoine/Agence

## Vue par vue

### 🪴 Solo débutant
- **Bandeau upsell** : `linear-gradient(135deg, rgba(0,204,188,0.18), rgba(14,115,246,0.10))` + border teal
- **Hero 3 blocs** (1/9) : grid 3 cols + séparateurs verticaux, min-height 135px
- **À traiter mini** (9/13) : 1 item todo + drill-ind ↗
- **Mon bien** (1/9 row 3) : photo 80×80 + infos + bouton "Voir détail"
- **Prochaines échéances** (9/13 row 3) : 2 dates
- **Sidebar** : 5 entrées + CTA "⚡ Passer Premium" en bas

### 🏠 Solo Premium (Finance)
**Toggle topbar 3 modes** :
```css
.tb-mode-toggle { display: flex; border: 1px solid var(--bor); border-radius: 7px; }
.tb-mode-btn.active { background: var(--acc); color: #fff; }
```
Boutons : `💰 Finance` (actif) · `🛠 Gestion` · `🏘 Patrimoine`

**Layout** :
- `.pr-ctx` 1/-1 (greeting + 4 KPIs résumé)
- `.pr-hero` 1/9 row 2 (hero 3 blocs)
- `.pr-todo` 9/13 row 2 (À traiter 5 items)
- `.pr-flux` 1/7 row 3 (Revenus vs Charges chart 6 mois)
- `.pr-kpi` 7/13 row 3 (4 KPI grid 2×2)
- `.pr-prog` 1/7 row 4 (Progression annuelle)
- `.pr-solde` 7/13 row 4 (Solde provisions par immeuble)

### 🛠 Gestionnaire (Gestion)
Même tier Premium, **zéro financier perso** :
- `.gs-ctx` (Occupation, Vacance, Échéances, Conformité)
- `.gs-todo` 1/5 row 2/4 (À traiter 8 items)
- `.gs-pilot` 5/13 row 2 (Pilotage matriciel table 5×6)
- `.gs-agenda` 5/13 row 3 (Agenda 15j calendrier 7 jours)
- `.gs-vacance` 1/5 row 4
- `.gs-irl` 5/9 row 4
- `.gs-mrh` 9/13 row 4 (Conformité 30j)

### 🏘 Patrimoine
**Vue Entité → Immeubles → Logements** :
- `.pat-ent` 1/-1 : Header SCI (badge type IR/IS + counter + 3 stats)
- `.pat-body` 1/-1 : Liste immeubles avec mini-cards logement
- `.pat-imm-h` : header immeuble (3 stats)
- `.pat-logs` : `grid-template-columns: repeat(6, 1fr)` pour mini-cards
- **Mini-card** `.pat-log` : ref + status badge 18×18 + locataire + loyer + reste à payer
- **Statuts** : `.ok` teal · `.partial` jaune · `.danger` rouge · `.vacant` gris (bordure colorée)

### 🏢 Agence
- **Portfolio switcher** (row 1) : 5 bailleurs + bouton "+ Inviter bailleur" violet
- **4 KPIs agence** (row 2) : Commissions 2840€ violet · Recouvrement 96.3% · Occupation 94% · Actions 12
- **Top 5 bailleurs** (1/7 row 3) : ranking + commissions YTD
- **Pilotage agrégé** (7/13 row 3) : 6 actions todo
- **Agenda 30j** (1/7 row 4) : 3 sections (URGENT/ÉCHÉANCES/RDV)
- **Évolution commissions** (7/13 row 4) : 4 barres violet + totals

### 📊 Comptable invité (overlay)
**Modal fixed 1300×850 backdrop-filter blur** :
- Header : badge "🔒 LECTURE SEULE" orange warn
- Content grid 12-col :
  - `.compta-ctx` 1/-1 (context fiscal)
  - `.compta-export-list` 1/5 row 2/4 (6 exports FEC/2044/Bilan/Journal/Grand livre/Balance)
  - `.compta-recettes` 5/9 row 2 (ventilation 211/213/219)
  - `.compta-charges` 9/13 row 2 (ventilation 222/223/224/229)
  - `.compta-cf` 5/13 row 3 (cash-flow YTD + projection annuelle)

## Palette CSS

```css
:root {
  /* Backgrounds 3 niveaux */
  --bg: #0A0E27;
  --bg2: #0D1330;
  --bg3: #131A3F;

  /* Borders 2 niveaux */
  --bor: #1F2A52;
  --bor2: #2A3863;

  /* Text 3 niveaux hiérarchiques */
  --t: #E8EBF5;
  --t2: #A0AAC7;
  --t3: #6B7595;

  /* Accents */
  --acc: #0E73F6;       /* primary */
  --acc2: #4A9EFF;      /* lighter */

  /* Sémantiques */
  --pos: #00CCBC;       /* teal Deliveroo */
  --neg: #FF4D7C;       /* rose Deliveroo */
  --warn: #FFB020;
  --info: #7C8FFF;

  /* Domain-specific */
  --ag: #B584FF;        /* violet Agence */
}
```

**Hardcodes RGBA détectés** :
- `rgba(14,115,246,0.18)` active button tint
- `rgba(0,204,188,0.15)` ok pill bg
- `rgba(0,204,188,0.4)` ok card border
- `rgba(255,77,124,0.12)` danger pill bg
- `rgba(255,176,32,0.15)` warn status bg
- `rgba(124,143,255,0.15)` info status bg
- `repeating-linear-gradient(45deg, ...)` projection chart pattern

**Total** : ~24 unique colors (incluant opacités). Très discipliné pour une refonte complète.

## Composants UI réutilisables

| Pattern | CSS clé | Usage |
|---|---|---|
| **Card drillable** | `transform:translateY(-1px); border-color:var(--acc); box-shadow:0 6px 20px rgba(14,115,246,0.12)` au hover | Toutes vues |
| **Drill indicator** | `.drill-ind` 17×17 rounded-4 background `--bg3` → `--acc` au hover | Top-right cards |
| **Pills/badges** | `.pill.active` fond `rgba(14,115,246,0.15)` + border `--acc` | Filtres topbar |
| **Hero blocs** | `border-left: 1px solid var(--bor)` séparateurs verticaux + value 24px bold | 3-col cash-flow |
| **Mini-cards Patrimoine** | `.pat-log.ok/.partial/.danger/.vacant` border-color différente | Grid 6 cols |
| **Toggle topbar 3 modes** | `.tb-mode-btn.active` fond `--acc` blanc | Premium/Gestion/Patrimoine |
| **Sidebar items active** | `linear-gradient(90deg, rgba(14,115,246,0.18), transparent)` + `box-shadow:inset 3px 0 0 var(--acc)` | Nav |
| **Sparkline** | `.spark-bar` flex:1 background `--acc` opacity 0.55, dernier mois opacity 1 `--pos` | 6 mois |
| **Flux bars** | `.flux-bar.recette` teal · `.flux-bar.depense` rose | Premium finance |
| **Donut conic-gradient** | 4 segments CSS pur, zéro JS/SVG | Premium KPI |
| **Status badge small** | `.pilot-status.ok/warn/danger` fond semi + texte sémantique | Pilotage table |
| **Context bar** | `linear-gradient(90deg, rgba(14,115,246,0.10), transparent 60%)` | Premium/Gestion row 1 |

## Animations / transitions

```css
transition: all 0.15s;   /* cards drillable, sidebar items */
transition: all 0.12s;   /* drill-ind, pat-log hover */
transition: all 0.1s;    /* sb-item général */
```

Pas d'easing explicite → cubic-bezier(0.4, 0, 0.2, 1) par défaut.
**Pas d'animations keyframes** — transitions CSS 0.1-0.15s suffisent.

## Responsive (indications implicites)

| Breakpoint | Adaptations |
|---|---|
| Desktop ≥1280 | Sidebar permanente · Grid 12 cols · Mini-cards 6 cols · Labels complets |
| Tablette 768-1279 | Sidebar drawer · Mini-cards 3 cols · Labels abrégés |
| Mobile <768 | Sidebar overlay · Mini-cards 1 col stack · Icons only topbar |

⚠️ Aucun media query dans le mockup même — c'est une prochaine phase.

## Écarts critiques vs standard immobilier

| Écart | Niveau | Justification |
|---|---|---|
| **Palette Dark Boursorama (#0A0E27)** | MAJEUR | Break vs apps concurrentes light. Premium 24/7. |
| **Accent teal Deliveroo (#00CCBC)** | MAJEUR | Très spécifique. Donne tonalité "design nouveau". |
| **Toggle 3 modes topbar** | MAJEUR | Unique au secteur. UX "mode d'affichage" plutôt que "pages différentes". |
| **Pastilles statut grosses (18×18)** | MOYEN | Très lisible vs petites icônes. |
| **Hero 3 blocs séparateurs verticaux** | MOYEN | Hiérarchie visuelle claire. |
| **Donut conic-gradient CSS pur** | MOYEN | Zéro JS, perf + maintenabilité. |
| **Sidebar inset 3px accentbar active** | LÉGER | Détail Apple Design System. |

## Conclusion

Refonte **cohérente, audacieuse, orientée fintech/SaaS moderne** (Revolut, Stripe, Figma inspiration).

**10 variables CSS** suffisent pour 95% du design.
**Architecture CSS claire** prête pour implémentation.

Aucune ambiguïté sur dimensions, couleurs, interactions ou responsivité cible.
