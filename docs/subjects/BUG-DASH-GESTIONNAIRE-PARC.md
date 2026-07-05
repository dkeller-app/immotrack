# BUG-DASH-GESTIONNAIRE-PARC — Dashboard mode gestionnaire : tableau parc tronqué >8 apparts + colonne Quittance toujours rouge

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : S
**Détecté** : 2026-07-02 (user, test app réelle)
**Lié à** : DASH-PROFILES (mode Gestionnaire livré v15.13), contrainte [[project_dashboard_onescreen]] (1 écran PC ~900 px)

## Contexte

> 💬 2026-07-02 : *« tableau de bord : mode gestionnaire : pilotage parc pas visible entièrement si plus de 8 apparts, Quittance toujours en rouge (pourquoi ? pourquoi pas juste quand la quittance est demandée on met le point sinon - ) »*

Deux problèmes sur le widget « Pilotage du parc » du dashboard mode Gestionnaire :

### A. Tableau tronqué au-delà de ~8 logements
Le widget n'affiche pas tout le parc si >8 apparts. Conflit avec la contrainte dure « dashboard sur 1 écran » → il faut une solution qui scale (scroll interne du widget, pagination, densité réduite, ou drill-down « voir tout ») SANS casser le 1-écran.

### B. Colonne Quittance toujours en rouge
Le point rouge s'affiche systématiquement, même quand aucune quittance n'est attendue. Logique attendue (user) :
- Quittance **demandée** par le locataire (flag bail) et non envoyée → point (rouge/orange)
- Quittance demandée et envoyée → point vert
- Quittance **non demandée** → « – » (pas de signal, pas de bruit)

Vérifier le flag existant « quittance demandée » sur le bail (il existe côté quittances/EMAIL-AUTO) et l'utiliser comme condition d'affichage.

## Scope

1. Lire le render du widget parc (mode gestionnaire) + la source du statut Quittance.
2. Fix B (logique point/–) — quick win.
3. Fix A : choisir le pattern d'overflow (proposer au user si ambigu ; scroll interne sticky-header = candidat naturel).

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : sujet créé en session pilotage (triage retours test user).

## Inventaire + mockup

- Cause A (tronqué) : `scopeLogs.slice(0,8)` l.9760 dans `_renderDashV4Gestionnaire`, pas de scroll interne.
- Cause B (Quittance rouge) : l.9782 rouge = aucune quittance émise le mois courant ; AUCUN flag « quittance demandée » n existe sur le bail (seul `quittanceAuto`) → à créer (case sur le bail) pour la logique point/–.
- 2026-07-05 : **mockup livré** dans `mockups/dashboard-cockpit/index.html` (origin/main 694c23b) : table complète scroll interne ~260px, en-têtes collants, intercalaires immeuble, colonne Quit. point vert/rouge/– + légende. Attente validation user (commun aux 3 variantes actions).
