# BUG-ACCUEIL-NAV-LOGEMENT — Accueil : la tuile/lien « Logement » ne dirige vers rien

**Status** : 🔄 En cours (session quick wins 2026-07-02) · **Prio** : P1 · **Taille** : XS
**Détecté** : 2026-07-02 (user, test app réelle)

## Contexte

> 💬 2026-07-02 : *« accueil : logement ne dirige vers rien »*

Sur la page Accueil, l'élément « Logement » (tuile / raccourci / lien) est cliquable mais n'ouvre rien. Navigation morte.

## Scope

1. Repro : identifier l'élément exact sur l'Accueil (tuile, carte KPI, raccourci) et son handler (`onclick` absent, route morte, ou fonction renommée lors d'une refonte).
2. Fix : câbler vers l'onglet Biens (ou fiche 360 selon le contexte du clic).
3. Balayer TOUS les éléments cliquables de l'Accueil (règle : pas de zone morte) — vérifier chaque tuile/raccourci dirige quelque part.

## Notes utilisateur

> 💬 2026-07-02 : « accueil : logement ne dirige vers rien »

## Journal

- 2026-07-02 : sujet créé en session pilotage (triage retours test user).
