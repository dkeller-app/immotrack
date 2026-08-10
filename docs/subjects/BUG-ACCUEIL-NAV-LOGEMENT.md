# BUG-ACCUEIL-NAV-LOGEMENT — Accueil : la tuile/lien « Logement » ne dirige vers rien

**Status** : ✅ Livré v15.407 (2026-07-03) · **Prio** : P1 · **Taille** : XS
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

- 2026-07-03 : ✅ **Livré v15.407** sur origin/main (branche fix/quickwins-ux-20260702, merge FF 4349b1e). Audit agent code-reviewer PASS (0 bloquant, 2 importants corrigés avant push : clé pdfRef transmise à _openCloudBailPdf + nettoyage état fiches au retour navigateur). Gates : check-inline-js 5/0, Vitest 1753 verts, vérif navigateur complète, 0 erreur console. Renum v15.398-400→v15.407 (collisions sessions parallèles).
