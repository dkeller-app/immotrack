# NAV-SIDEBAR-CLEANUP — Sidebar : sortir Paramètres + Export/Sauvegarde (→ menu bouton connexion), replacer EDL hors « Comptabilité »

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S
**Détecté** : 2026-07-02 (user, test app réelle)
**Lié à** : V3-REFONTE-PARAMS (P2, contenu de l'onglet), V3-REFONTE-NAV-ONGLETS (19D)

## Contexte

> 💬 2026-07-02 : *« paramètres et export sauvegarde : revoir ce qu'il y a dedans et l'utilité. supprimer de la side bar (on l'a dans le bouton de connexion pour paramètres et ajouter pour export / sauvegarde) »*
> 💬 2026-07-02 : *« EDL : pourquoi dans sous-catégorie comptabilité ? »*

## Scope

### A. Paramètres + Export/Sauvegarde hors sidebar
1. **Audit de contenu** d'abord : lister ce qu'il y a dans Paramètres et dans Export/Sauvegarde, ce qui est utile, ce qui est mort (recoupe V3-REFONTE-PARAMS — cet audit EST la première phase de V3-REFONTE-PARAMS).
2. Retirer les 2 entrées de la sidebar.
3. Menu du bouton de connexion (avatar) : « Paramètres » y existe déjà → **ajouter « Export / Sauvegarde »**.
4. Vérifier tous les liens internes qui routent vers `#p-params` / `#p-export` (toasts, boutons maintenance, RGPD, FEC…) — ils doivent continuer de fonctionner.

### B. EDL mal rangé
L'EDL est aujourd'hui sous la section « Comptabilité » de la sidebar — aucun sens métier (l'état des lieux est un acte du cycle locatif, pas comptable). → Le replacer dans le groupe locatif (près de Locataires/Baux). Décision de placement à valider avec le user au mockup nav.

## Règles gravées applicables

- Sandbox-first, vérif collatérale (grep tous les `goto`/routes vers params/export)
- Attention mobile : le bottom-sheet « Plus » (BUG-MOBILE-MENU-PLUS v15.142) liste aussi ces onglets → cohérence 3 formats

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : sujet créé en session pilotage (triage retours test user). Absorbe la partie « placement nav » ; le contenu détaillé de Paramètres reste V3-REFONTE-PARAMS.
