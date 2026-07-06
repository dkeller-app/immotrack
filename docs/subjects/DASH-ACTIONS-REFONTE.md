# DASH-ACTIONS-REFONTE — Refonte complète « Actions priorisées » (dashboard)

**Status** : ⬜ À faire · **Prio** : **P1 (prio user explicite)** · **Taille** : M (mockup-first)
**Détecté** : 2026-07-02 (user, test app réelle)
**Lié à** : DASH-PROFILES, contrainte [[project_dashboard_onescreen]], règle mockup-first

## Contexte

> 💬 2026-07-02 : *« actions priorisées : 5 en visu, j'en ai 14 en cours. Comment on fait ? redondance avec les bulles en dessous. Je pense qu'il faut retravailler complètement cette page (prio) »*

Problèmes identifiés :
1. **Capacité** : le bloc affiche 5 actions alors que le user en a 14 en cours → 9 invisibles, aucune indication qu'il en manque, pas de « voir tout ».
2. **Redondance** : les « bulles » en dessous (alertes/badges) répètent la même information sous une autre forme → double signal, double bruit.
3. **Verdict user** : retravailler complètement la page (pas un patch).

## Direction (à explorer en mockups)

- Une **seule** surface de priorisation (fusionner actions priorisées + bulles d'alertes) : source unique, tri par urgence/impact.
- Scalable : 3 actions comme 30 (compteur + groupement par type ou par bien + « voir tout » drill-down).
- Respect 1 écran PC (~900 px) : le bloc ne grandit pas, il condense.
- Cohérence avec la refonte du widget parc gestionnaire (BUG-DASH-GESTIONNAIRE-PARC) — même session possible.

## Règles gravées applicables

- **Mockup-first** : variantes A/B/C × PC/tablette/téléphone × drill-downs post-clic AVANT de coder.
- **Sandbox-first** : index-test.html d'abord.
- Pas de graphique/badge décoratif sans contexte.

## Décisions à prendre (avant mockups)

- D1 : que fusionne-t-on exactement ? (inventaire des sources actuelles : actions priorisées + bulles + alertes dashboard)
- D2 : groupement par type d'action, par bien, ou par urgence ?
- D3 : le « voir tout » ouvre un drill-down modal ou un onglet dédié ?

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : sujet créé en session pilotage (triage retours test user). Marqué P1 « prio » par le user.

## Inventaire code réel (2026-07-05, agent Explore)

- Sources : `_computeUnifiedTodo` (l.11922, 8 types, score+sévérité, AUCUNE limite au calcul) · `_TODO_TYPE_META` (l.12597) · `rAlertsSection` (l.13929) = la bannière redondante à fusionner.
- Limites d affichage : Premium = top 3 GROUPES (slice(0,3) l.8790) · Gestionnaire = 5 items bruts (l.9807) → incohérent, et le « voir tout » (`_openDD(todo-unified)`) existe déjà côté Premium.
- Parc gestionnaire : `_renderDashV4Gestionnaire` l.9728, `scopeLogs.slice(0,8)` l.9760, pas de scroll interne. Colonne Quit. l.9782 : rouge = aucune quittance émise le mois courant — PAS de flag « quittance demandée » sur le bail (seul `bail.quittanceAuto` existe) → le flag est à créer.

## Mockups

- 2026-07-05 : **mockups livrés** `C:\Users\Did_K\Desktop\Immo\mockups\dashboard-cockpit\index.html` (LOCAL, retire du repo public commit ee0ce30 - decision user 2026-07-05 : mockups jamais sur GitHub) — 3 variantes (A file unique triée sections Urgent/Semaine/Planifier · B groupes dépliables toutes catégories · C triage 3 colonnes) × responsive natif, drill « Tout voir » cliquable avec filtres, dataset réaliste 14 actions. **Attente choix user A/B/C.**

- 2026-07-05 : **décision user = VARIANTE B** (pastilles par catégorie dépliables) + refonte layout demandée et mockée : parc pleine hauteur à GAUCHE (tableau resserré, les 12 lots tiennent sans scroll), colonne DROITE = Agenda 15j → À traiter (B, groupe le plus urgent ouvert par défaut) → 4 widgets conformité en 2×2. Page totale ~813px = 1 écran. Mockup local mis à jour, en attente du GO user pour implémentation.

- 2026-07-06 : ✅ **LIVRÉ v15.418** origin/main (c04f88c). Bloc « À traiter » = TOUTES les actions groupées en pastilles dépliables (variante B, groupe urgent pré-ouvert, bulle figée scroll interne, CTA directes, « Tout voir » → drill todo-unified existant). Audit code-reviewer : FAIL initial → 5 correctifs appliqués (Échu rouge non-reconductibles via _bailTypeHasTacite · flag hors _BAIL_FIELD_MAP · toggles alertes morts retirés · double € · légende) → re-vérifié navigateur. Note audit : les toggles bannière étaient un no-op (#dash-alerts déjà masqué par CSS V4 !important depuis v15.37). Reste : appliquer la même surface au mode Premium (coach top-3) = itération suivante si le user la veut.
