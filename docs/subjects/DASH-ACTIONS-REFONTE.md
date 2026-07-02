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
