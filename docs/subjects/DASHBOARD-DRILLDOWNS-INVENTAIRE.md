# DASHBOARD-DRILLDOWNS-INVENTAIRE — Engagement préservation 100% (Phase B)

> **Statut** : 🔄 Inventaire exhaustif livré 2026-05-15 · base d'engagement pour Phase B implémentation
> **Demande user** : *« tu reprends bien tous les drill down qu'on a déjà créé and co ! je veux quelque chose de top ! »*

---

## Promesse

Les **23 drill-downs** identifiés ci-dessous seront **TOUS préservés** dans la refonte Phase B. Aucun ne disparaît. Certains seront enrichis visuellement (palette Dark Boursorama, animations, hiérarchie) mais le **contenu et la logique métier restent identiques**.

---

## A. Drill-downs widget dashboard (16) — via `_DD[key]` + `openDashDrill()`

Stockés dans l'objet `_DD = {}` (ligne 8083 d'`index-test.html`), ouverts par `_openDD(key)` qui appelle `openDashDrill(title, html)`.

| # | Widget | Clé `_DD[]` | Build function | Contenu drill | Refonte Phase B |
|---|---|---|---|---|---|
| 1 | Cash-flow Hero | `hero` | `_buildHeroDrill(ctx, cf, prevCf, cfYTD)` ligne 5948 | Détail cash-flow mois courant · YTD · variation N-1 | ✅ Préservé · même contenu, modal Dark Boursorama |
| 2 | À traiter (unifié) | `todo-unified` | `_buildTodoDrill(ctx)` ligne 6952 | Toutes actions groupées par sévérité (critique/attention/info) avec compteurs par type | ✅ Préservé · groupes colorés `red/ora/info` conservés |
| 3 | Revenus vs Charges | `flux` | `_buildFluxDrill(ctx)` ligne 6658 | Détail mensuel recettes/dépenses + cumul YTD + tableau par catégorie | ✅ Préservé · chart amélioré gradient |
| 4 | Revenus loyers | `rev` | `_buildRevDrill(ctx)` ligne 6068 | Table revenus par logement avec mois en colonnes | ✅ Préservé (widget masqué par défaut depuis v2) |
| 5 | Charges totales | `chg` | `_buildChgDrill(ctx)` ligne 6093 | Table dépenses par catégorie + ventilation | ✅ Préservé |
| 6 | Occupation | `occ` | `_buildOccDrill(ctx)` ligne 6117 | Taux occupation + liste vacants + durée vacance | ✅ Préservé · timeline visuelle améliorée |
| 7 | Manque à gagner vacance | `mag` | inline ligne 7459 | Table : Log · Immeuble · Loyer/mois · Perte/an | ✅ Préservé |
| 8 | Dépôts de garantie | `dg` | inline ligne 7472 | Table : Logement · Locataire · DG | ✅ Préservé · total + sous-totaux par immeuble ajoutés |
| 9 | Révisions IRL | `irl` | inline ligne 7495 | Table : Log · Locataire · Échéance · HC actuel · Nouveau HC + simulation prochaine révision | ✅ Préservé · bouton « Appliquer » direct |
| 10 | Baux à terme | `bail` | inline ligne 7529 | Table : Log · Locataire · Fin bail · Statut (J restants) | ✅ Préservé · CTA renouvellement bail |
| 11 | MRH manquantes | `mrh` | inline ligne 7540 | Table : Log · Locataire · Tél · Mail (pour relancer le locataire) | ✅ Préservé · bouton « Email MRH » direct |
| 12 | Régularisations | `regul` | inline ligne 7560 | Table : Log · Locataire · Charges/mois (régul N-1 due) | ✅ Préservé · CTA générer régul |
| 13 | Charges par catégorie | `donut` | inline ligne 7615 | Donut + table catégorie + sous-catégories + drill récursif vers Cash-flow | ✅ Préservé · donut animé |
| 14 | Progression annuelle | `prog` | `_buildProgDrill(ctx)` ligne 6347 | Chart cumul attendu/réalisé 12 mois + tableau par logement + écart | ✅ Préservé · chart agrandi |
| 15 | Rendement brut | `rdt` | `_buildRdtDrill(ctx)` ligne 7004 | Calcul rendement par logement (loyer × 12 / valeur estimée) | ✅ Préservé · ajout simulation revente/refi |
| 16 | Solde provisions | `solde` | `_buildSoldeDrill(ctx)` ligne 6578 | Détail par immeuble (provisions versées vs charges réelles) | ✅ Préservé · drill vers fiche immeuble |

## B. Drill-downs navigation contextuelle (4)

| # | Trigger | Fonction | Action |
|---|---|---|---|
| 17 | Hero meta « Loyers impayés N logements » | `_dashGoImpayes()` ligne 5155 (v15.18) | Navigue vers page Quittances filtrée `statut=impayée` |
| 18 | Clic carte entité (SCI / bailleur) | `_entCardClick(nom)` → `drillToEnt(nom)` ligne 8093 | Modal entité avec mouvements consolidés + KPIs |
| 19 | Clic bulle immeuble | `_immBulleClick(event, imm)` → `drillToImm(imm)` ligne 8110 | Modal immeuble avec lots + mouvements |
| 20 | Clic mini-card logement | `_logMiniClick(event, ref)` | Fiche 360° du logement |

## C. Drill-downs alertes & navigation (3)

| # | Trigger | Fonction | Action |
|---|---|---|---|
| 21 | Pill « N actions requises » top dashboard | `dash-alert-pill` onclick (ligne 119) | Scroll smooth vers section `#dash-alerts` |
| 22 | Widget Agenda (mode Gestion) | clic événement | Vers page Agenda + ouvre l'événement |
| 23 | Bandeau onboarding (si 0 logements) | `_renderDashOnboarding()` | CTA « + Mon premier bien » → page Biens |

---

## Mapping refonte Phase B — où chaque drill restera accessible

### Mode 💰 Finance (Premium — Didier)
Tous les drills financiers sont accessibles depuis les cartes correspondantes :
- Hero → drill cash-flow (1)
- Flux → drill revenus/charges (3)
- 4 KPIs 2×2 : drill `occ`/`rdt`/`donut`/`dg` (6, 15, 13, 8)
- Prog → drill progression (14)
- Solde → drill solde provisions (16)
- **À traiter** card (top-right) → drill todo-unified (2)
- Pill impayés sur Hero → `_dashGoImpayes` (17)

### Mode 🛠 Gestion (Premium — même tier, autre angle)
Tous les drills opérationnels :
- À traiter → drill todo-unified (2)
- Pilotage matriciel → drills `bail` (10), `mrh` (11), `irl` (9), `regul` (12)
- Agenda 15j → drill Agenda (22)
- Vacance → drill `mag` (7)
- Conformité → drills `mrh` (11) + IRL (9) + DPE (à créer)

### Mode 🏘 Patrimoine (Premium — même tier, vue parc)
- Header SCI → drill entité (18) `drillToEnt`
- Bloc immeuble → drill immeuble (19) `drillToImm`
- Mini-card logement → drill logement 360° (20) `_logMiniClick`
- Statuts visuels (✓ ~ X Vacant) maintenus pour scan instantané

### Mode Solo débutant
Drills minimaux mais présents :
- À traiter mini → drill todo (2)
- Card « Mon bien » → drill logement 360° (20)
- Card « Prochaines échéances » → drill agenda mini (22)

### Mode Agence
- 4 KPI cards agence → drills propres (commissions, recouvrement, occupation, actions critiques)
- Top 5 bailleurs → drill entité (18) par bailleur
- Pilotage agrégé → drill multi-bailleur (étend drill todo-unified)
- Vue Comptable invitée → exports rapides (6 boutons)

---

## Implémentation Phase B — checklist préservation

Avant chaque commit de Phase B, je vérifierai :

- [ ] Les **16 entrées `_DD['key']`** sont toujours peuplées par `rDash()`
- [ ] La fonction `_openDD(key)` est toujours appelable (et appelée via onclick sur les cartes du nouveau dashboard)
- [ ] Les fonctions `_dashGoImpayes`, `_entCardClick`, `_immBulleClick`, `_logMiniClick`, `drillToEnt`, `drillToImm` sont conservées
- [ ] `openDashDrill(title, html)` rend correctement le modal (juste palette mise à jour, pas la logique)
- [ ] Le système de redimensionnement / repositionnement modal sur mobile fonctionne toujours
- [ ] Les onclick `stopPropagation()` (cas Hero impayé) sont conservés
- [ ] Tests Vitest : pas de régression sur les helpers utilisés par les builds (déjà 744 tests passants)

## Approche technique recommandée

**On NE TOUCHE PAS aux fonctions `_build*Drill`** existantes. Elles génèrent le HTML interne du modal — c'est la **logique métier**.

**On reskin uniquement** :
1. `openDashDrill(title, html)` → applique la palette Dark Boursorama au modal
2. Les cartes du dashboard (visuelles) → onclick toujours vers `_openDD(key)` ou `drillTo*(...)`
3. Les nouveaux widgets (Patrimoine, Agence, etc.) → ajoutent leurs propres drill-downs aux 23 existants, ne remplacent rien

**Effort estimé** : 8-12h pour la refonte visuelle, **+0h pour les drill-downs** (préservés tels quels). C'est ça la beauté de l'approche : la logique métier validée reste intacte, on ne change que la skin.

---

## Engagement

Je m'engage à ce que **aucune fonctionnalité de drill-down ne disparaisse** dans la refonte Phase B. Si tu détectes un drill manquant après mes commits, je le re-câble dans les 30 min suivantes — sans question.
