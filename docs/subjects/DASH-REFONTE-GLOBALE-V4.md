# DASH-REFONTE-GLOBALE-V4 — Refonte visuelle globale dashboard + sidebar + cohérence dark

**Status** : 🔄 En cours · **Prio** : P1 (priorisé immédiat) · **Taille** : XL (1 session longue ~6-8h, sandbox)
**Lié à** : DASH-V2, V3-VISUEL, DASH-PROFILES, `project_immotrack.md`, `project_dashboard_onescreen.md`
**Sandbox-first** : `index-test.html` uniquement, prod après OK explicite user
**Référence visuelle validée** : `docs/strategie/dashboard-mockups/galerie-finale-sans-surcharge.html` (V4 Stripe narrative, note user 8/10)

## Genèse

Après le sprint fractionné Phase B (Étape A jauge cockpit livrée v15.33, Sprint 1 bandeau Priorisation v15.35), le résultat hybride a été rejeté par l'utilisateur :

> capture v15.35 — sidebar à l'ancienne style clair-bleu jure avec le thème, widget "À TRAITER 5" duplique le bandeau Priorisation, cockpit pas encore narratif, cartes "MRH manquante" répétées 3× au lieu de groupées.
>
> User : « pourquoi tu ne reprend pas tout le design d'un coup ? on reprend la sidebar aussi · on pense aux autres visu »

→ Décision : abandon du sprint-par-sprint, **refonte globale en 1 session** avec checkpoints visuels.

## Scope (4 checkpoints validables)

### CP1 — Fondations (thème dark + sidebar + bandeau dédupliqué + suppression doublon)

- **Thème dark Boursorama par défaut** sur tout l'app si `DB.params.dashRenderV === 'v2'`. Sobre + Coloré restent dispos via sélecteur 3-thèmes.
  - Migration localStorage : `immotrack_theme_mode = 'dark'` par défaut (clé séparée de `immotrack_theme` qui est l'objet Paramètres).
- **Sidebar refondue** (`#sidebar` global, impact 100% de l'app) :
  - 280px largeur, fond `--sur` dark, bordure `--bor` dark
  - Sections collapsibles (Vue d'ensemble / Patrimoine / Locataires / Finances / Configuration)
  - Logo + version v15.36 en haut
  - **Entités épinglées** en bas (top 3 par revenus, cliquables → filtre dashboard sur cette entité)
  - **Footer utilisateur** : avatar + "Didier K." + lien Paramètres
  - Comportement : ancienne sidebar conservée pour `[data-theme="sobre"]` et `[data-theme="colore"]` (no-regression sur ces thèmes)
- **Bandeau Priorisation (v15.35) — fixes** :
  - Déduplication par type : `Assurances ×3` au lieu de 3 cards "MRH manquante"
  - Responsive : breakpoint tablet 1024px + halo `::before` désactivé sous 768px + `white-space: nowrap` retiré
  - `dash-prio-card-sub` → 2 lignes max (`-webkit-line-clamp`)
- **Suppression widget "À TRAITER" (todo unifié)** dans le grid : redondant avec bandeau top. Drill-down `_DD['todo-unified']` préservé (accessible depuis bandeau CTA "DÉMARRER →").

→ **Validation user CP1 sur capture avant CP2.**

### CP2 — Cockpit Hero V4 Stripe narrative

- Remplacer la jauge 220×220 actuelle (tronquée sur row=3) par le format **V4 Stripe narrative** :
  - Eyebrow "COCKPIT FINANCIER · AVRIL 2026"
  - Titre principal : "**8 250 € reçus** sur 8 250 € attendus · 100 % collecté"
  - Sous-titre delta : "↑ vs Mars 2026 (+250 €)"
  - 4 satellites compactés en row sous le titre : Recettes / Charges / Cash-flow / Occupation
  - Pas de jauge SVG géante — barre de progression horizontale fine de 100% intégrée au titre
- Comparaison **vs mois-1 (Mars 2026)**, JAMAIS N-1
- Préservation drill-down `_DD['hero']` (helper `_buildHeroDrill` intact)

→ **Validation user CP2.**

### CP3 — Cash-flow 12 mois Bloomberg + 5 KPIs sparklines

- **Cash-flow 12 mois** (widget existant `_fluxV2`) → Bloomberg style :
  - Sparkline 12 mois SVG dense
  - Axe X mois abrégés (J F M A M J J A S O N D)
  - Baseline 0 + ligne pointillée moyenne
  - Delta affiché : "vs Mars 2026" (pas N-1)
- **Row 5 KPIs Bloomberg** (Occupation / Rendement brut / Charges % loyers / DG détenus / Vacance) :
  - Valeur grosse 22-26px
  - Delta avec flèche + couleur
  - Mini-sparkline 12 mois horizontal dans la cell
- Helpers `_mkSparkline`, `_kpiMonthlySeries`, `_heroCashflowSeries` **intacts**.

→ **Validation user CP3.**

### CP4 — dash-ent-cards SCI/Immeubles/Logements + polish responsive 3 formats

- **Bas du dashboard** : `dash-ent-cards` (existant) restylisé V4 narrative — cards SCI puis Immeubles puis Logements
  - Scale N lots OK (cards, pas table dense)
  - Hover → drill-down entité
- **Audit responsive** sur 3 formats :
  - Desktop 1440×900 (cible PC one-screen)
  - Tablette 1024×768
  - Mobile 375×800
- **Audit des 14 autres onglets sous thème dark** (impact sidebar globale) :
  - Import / Données
  - Loyers & Mouvements
  - Biens
  - Agenda
  - Équipements
  - Baux & Locataires
  - Assurances
  - Quittances
  - États des lieux
  - Pilotage
  - Révision IRL
  - Régularisation
  - Paramètres
  - Export / Sauvegarde
  - **Pour chacun** : screenshot rapide en dark, lister incompatibilités évidentes (texte clair sur fond clair, bordures invisibles, focus states cassés, modales transparentes — cf BUG-UI-DARK-MODAL). **Patch en bloc minimal** (variables CSS suffisent dans 80% des cas). Si trop gros (>30 min un onglet) → notes pour V3-VISUEL.
- Bump final **v15.36** (title + footer + commit).

→ **Validation user CP4 → bilan session + propagation prod si OK.**

## Règles non-négociables (rappel mémoire user)

1. **Sandbox-first** : tout dans `index-test.html`. `index.html` (prod) seulement après "OK" explicite user.
2. **23 drill-downs préservés** : tous les `_build*Drill()` helpers et `_DD[...]` assignments intacts.
3. **Helpers métier intacts** : `_computeUnifiedTodo`, `_mkSparkline`, `_heroCashflowSeries`, `_buildHeroDrill`, `_kpiMonthlySeries`, `_loyerProrataMois`, `_getActiveBailHcCh*`.
4. **Flag `DB.params.dashRenderV === 'v2'`** : toute la refonte derrière ce flag. Rollback = passer la valeur à `'v1'`.
5. **3 thèmes preservés** : sobre / coloré / dark fonctionnent tous (sélecteur top-right).
6. **Responsive 3 formats** : desktop 1440×900 / tablette 1024×768 / mobile 375×800.
7. **No "Coach IA"** : on n'a pas d'IA, c'est de la priorisation par règles. Libellé = "Priorisation {Mois Année}".
8. **No gamification** (no XP, badges, niveaux).
9. **Comparaisons vs mois-1**, jamais N-1.
10. **Édit / modify + verify** : après chaque modif majeure, grep sites collatéraux + état localStorage avant de demander un test.
11. **BACKLOG temps réel** : à chaque checkpoint livré, MAJ BACKLOG.md immédiatement (statut + version + commit `Pilotage : ...`).

## Workflow (la session dédiée)

```
1. Lire :
   - BACKLOG.md
   - docs/subjects/DASH-REFONTE-GLOBALE-V4.md (ce fichier)
   - docs/strategie/dashboard-mockups/galerie-finale-sans-surcharge.html (référence visuelle V4)
   - DASHBOARD-DRILLDOWNS-INVENTAIRE.md si présent (sinon grep _DD[ dans index-test.html)
   - Code actuel index-test.html lignes 90-110 (HTML dashboard top), 5300-5380 (rDash), 7220-7310 (bandeau), 7310+ (heroV2 + autres widgets v2)
   - css/main.css lignes 4100-4310 (bandeau Priorisation v15.35)

2. Confirmer le scope avec user en 5 lignes avant code

3. CP1 — Fondations
   - Bump v15.36
   - Commit "v15.36 CP1 : thème dark + sidebar + bandeau dédupliqué + suppression todo doublon"
   - MAJ BACKLOG.md (status: 🔄 CP1 livré)
   - Demander capture user

4. CP2 — Cockpit Hero V4
   - Commit "v15.36 CP2 : cockpit Stripe narrative"
   - MAJ BACKLOG
   - Demander capture

5. CP3 — Cash-flow + 5 KPIs
   - Commit "v15.36 CP3 : Bloomberg sparklines + 5 KPIs"
   - MAJ BACKLOG
   - Demander capture

6. CP4 — dash-ent-cards + audit 14 onglets + polish responsive
   - Commit "v15.36 CP4 : bas dashboard + audit dark 14 onglets + responsive"
   - MAJ BACKLOG (sujet ✅ Livré sandbox v15.36, propagation prod en attente)
   - Bilan + checklist patch onglets cassés (s'il en reste)

7. Bilan session + commit "Pilotage : bilan session DASH-REFONTE-GLOBALE-V4 v15.36"
```

## Prompt de démarrage (à coller dans une nouvelle session Claude Code)

Voir section `## PROMPT DE DÉMARRAGE` ci-dessous.

## Décisions captées

- **Q1** : Sidebar globale ou par-thème ? → **Globale** (refondue côté CSS variables, ancienne sidebar préservée via `[data-theme="sobre"]` / `[data-theme="colore"]`)
- **Q2** : Refonte en sprint ou bloc ? → **Bloc** (sprint donnait hybride moche)
- **Q3** : Audit 14 onglets dans la même session ? → **Oui mais audit léger** (variables CSS suffisent en majorité, gros patches renvoyés à V3-VISUEL)
- **Q4** : Suppression widget "À TRAITER" du grid ? → **Oui** (redondant avec bandeau top, drill-down préservé via bandeau CTA)

## Notes utilisateur

> 💬 _2026-05-15 : "pourquoi tu ne reprend pas tout le design d'un coup ? on reprend la sidebar aussi · on pense aux autres visu"_

## Journal

- 2026-05-15 : créé — refonte globale en remplacement du sprint-par-sprint Phase B (Étape A v15.33 + Sprint 1 v15.35 fusionnés dans cette session unique). Démarrage planifié dans session dédiée Claude Code fraîche.

---

## PROMPT DE DÉMARRAGE

```
On attaque DASH-REFONTE-GLOBALE-V4 — refonte visuelle globale du dashboard + sidebar + audit dark des 14 autres onglets.

LIRE EN PREMIER (dans cet ordre) :
1. C:\Users\Did_K\Desktop\Immo\BACKLOG.md
2. C:\Users\Did_K\Desktop\Immo\docs\subjects\DASH-REFONTE-GLOBALE-V4.md (sujet complet)
3. C:\Users\Did_K\Desktop\Immo\docs\strategie\dashboard-mockups\galerie-finale-sans-surcharge.html (référence visuelle V4 validée user note 8/10)
4. C:\Users\Did_K\Desktop\Immo\index-test.html sections :
   - lignes 90-110 (HTML dashboard top)
   - lignes 5300-5380 (function rDash + _renderTopBandeauPrio call)
   - lignes 7220-7310 (function _renderTopBandeauPrio bandeau Priorisation)
   - lignes 7311+ (_heroV2 + _fluxV2 + autres widgets v2)
5. C:\Users\Did_K\Desktop\Immo\css\main.css lignes 4100-4310 (bandeau Priorisation v15.35)
6. C:\Users\Did_K\Desktop\Immo\index-test.html sidebar HTML (grep "id=\"sidebar\"" ou "class=\"sidebar\"")

CONTEXTE :
- Sandbox-first : tout dans index-test.html, prod (index.html) après OK user explicite
- Refonte derrière flag DB.params.dashRenderV === 'v2' déjà en place
- Thème dark Boursorama par défaut sur v2, 3-thèmes (sobre/coloré/dark) preservés via sélecteur top-right
- 23 drill-downs à préserver intacts (helpers _build*Drill et _DD[...])
- Comparaisons vs mois-1 (Mars 2026), JAMAIS N-1
- No "Coach IA" (libellé = "Priorisation {Mois Année}")
- No gamification
- Responsive 3 formats : 1440×900 / 1024×768 / 375×800
- Helpers métier intacts : _computeUnifiedTodo, _mkSparkline, _heroCashflowSeries, _buildHeroDrill, _kpiMonthlySeries, _loyerProrataMois

PLAN (4 checkpoints validables par user) :

CP1 — Fondations
- Thème dark par défaut quand dashRenderV='v2' (localStorage immotrack_theme_mode='dark')
- Sidebar 280px dark refondue (sections collapsibles + entités épinglées + footer DK)
  → ancienne sidebar preservée pour [data-theme="sobre"] / [data-theme="colore"]
- Bandeau Priorisation fixes : dédupli par type ("Assurances ×3" au lieu de 3 "MRH manquante"), responsive corrigé (breakpoint 1024px + halo désactivé < 768px + white-space nowrap retiré)
- Suppression widget "À TRAITER" du grid (drill-down préservé via bandeau CTA "DÉMARRER →")
- Bump v15.36, commit, MAJ BACKLOG, demander capture user

CP2 — Cockpit Hero V4 Stripe narrative
- Remplacer jauge SVG 220×220 par format narrative : eyebrow + titre "8 250 € reçus sur 8 250 € attendus · 100 %" + sous-titre delta "vs Mars 2026" + barre progress horizontale fine + 4 satellites compactés en row
- Commit, MAJ BACKLOG, capture

CP3 — Cash-flow 12 mois Bloomberg + 5 KPIs sparklines
- Cash-flow widget : sparkline 12 mois SVG dense + axe X + baseline + delta vs Mars 2026
- Row 5 KPIs (Occupation / Rendement / Charges%loyers / DG / Vacance) : valeur grosse + delta + mini-sparkline 12 mois inline
- Commit, MAJ BACKLOG, capture

CP4 — dash-ent-cards + audit dark 14 autres onglets + polish responsive
- dash-ent-cards SCI/Immeubles/Logements en bas restylé V4 narrative
- Audit rapide des 14 autres onglets en thème dark (Import, Loyers, Biens, Agenda, Équipements, Baux, Assurances, Quittances, États des lieux, Pilotage, Révision IRL, Régularisation, Paramètres, Export) : screenshot rapide + patch CSS variables si rapide, notes V3-VISUEL si gros
- Responsive final 3 formats (1440 / 1024 / 375)
- Commit, MAJ BACKLOG ✅ Livré sandbox v15.36, bilan session
- Demander propagation prod (oui/non)

WORKFLOW :
- À CHAQUE checkpoint : commit + MAJ BACKLOG temps réel + demander capture user avant CP suivant
- Modify + verify : après chaque modif majeure, grep sites collatéraux + état localStorage
- En cas de blocage / dérive scope : STOP, demander à l'utilisateur

Quand tu reviens en session pilotage, dis "où en est DASH-REFONTE-GLOBALE-V4" pour sync.

Démarre par lire les 6 fichiers/sections listés, puis fais un résumé en 5 lignes de ce que tu as compris (scope CP1 + plan d'attaque CP1), puis attends mon GO avant de coder.
```
