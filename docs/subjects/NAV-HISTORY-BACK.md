# NAV-HISTORY-BACK — Bouton retour navigateur fonctionnel partout (History API)

**Status** : 🔄 En cours (session quick wins 2026-07-02) · **Prio** : **P1 (« absolument » — user)** · **Taille** : M
**Détecté** : 2026-07-02 (user, test app réelle, 2e vague)

## Contexte

> 💬 2026-07-02 : *« il faut absolument mettre en place le bouton retour du navigateur partout. si l'app ouvre un onglet en tunnel, le bouton retour doit faire revenir à la page d'avant »*

L'app est une SPA (navigation via `go(page)`) sans intégration History API : le bouton retour du navigateur sort de l'app (ou ne fait rien en PWA) au lieu de revenir à la page précédente. Les « tunnels » (fiche 360 bien/immeuble/bailleur, drill-downs) aggravent le problème : on s'enfonce sans chemin de retour naturel.

## Scope

1. `go(page)` pousse un état `history.pushState({page, ctx}, ...)` ; handler `popstate` re-navigue SANS re-pousser (flag).
2. Fiches 360 (`openLogFiche(ref)` / `openImmFiche(entId,immId)` / `openEntFiche(id)`) : l'état doit inclure le contexte (ref/ids) pour que le retour ET le re-avant restaurent la bonne fiche.
3. Boot : `replaceState` initial sur la page d'entrée.
4. Décision : les modales/overlays sont-elles dans l'historique ? (proposition : NON en V1 — Échap/backdrop les ferment déjà ; seules les PAGES entrent dans l'historique. Extension possible plus tard.)
5. Mobile PWA : le geste retour Android doit suivre le même chemin.

## Notes utilisateur

> 💬 2026-07-02 : voir Contexte.

## Journal

- 2026-07-02 : sujet créé (2e vague retours test). Implémentation directe en session quick wins (décision user « fais-le toi-même, direct sur index »).
