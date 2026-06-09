# Fiche candidat — modale large (Variante A) — Design

**Date :** 2026-06-08
**Statut :** validé (mockup Variante A approuvé par l'utilisateur)
**Mockup de référence :** `mockups/candidature/fiche-candidat-redesign.html` (Variante A — « Décision à droite, sticky »)

## Objectif

La fiche candidat (`openFicheCandidat`, modale `#ov-fiche-candidat`) est aujourd'hui plafonnée à `max-width:920px` : sur grand écran elle gaspille l'espace, le contenu est jugé trop serré (« limite »). On l'élargit en **modale large** réagencée en 2 colonnes, avec la **colonne décision (score + conversion) collée à droite**, et un comportement **responsive PC / tablette / téléphone**.

**Périmètre :** uniquement la **mise en page** de la fiche (CSS + structure du `body.innerHTML` de `openFicheCandidat`). **Aucune** modification de logique, de données, de scoring, des actions, du GED, ni de la conversion. Tout ce qui marche aujourd'hui (toggle « Pièces vérifiées », boutons pipeline, demande de complément, pièces jointes, CTA conversion) doit continuer à marcher à l'identique.

## Layout cible (Variante A)

**Modale** (`#ov-fiche-candidat .modal`) :
- `width: 92vw; max-width: 1280px; max-height: 90vh`.
- En-tête (hero) qui reste en haut ; corps scrollable.

**En-tête (hero, pleine largeur)** : avatar initiales + nom + badge statut, sous-titre (bien · date début · source), bouton « ✏ Modifier » à droite. (Inchangé fonctionnellement.)

**Corps : grille 2 colonnes** `grid-template-columns: 1.7fr 1fr; gap: 18px; align-items: start`.

- **Colonne gauche (données)**, dans l'ordre :
  1. Carte **Pipeline de candidature** : stepper 4 étapes + rangée d'actions (Valider / Refuser / Demander un complément / Repasser en cours) + bannière complément D13 (si présente).
  2. Sous-grille 2 colonnes : carte **Identité** | carte **Situation**.
  3. Carte **Garant** (pleine largeur de la colonne gauche).
  4. Carte **Pièces du dossier** : en-tête (titre + toggle « Pièces vérifiées »), ligne « Dossier déclaré complet », liste GED (`_renderAttachmentSection`) + « + Ajouter ».
- **Colonne droite (décision, collée)** `position: sticky; top: 0; align-self: start` :
  1. Carte **Score de confiance** : anneau + barres critères + badge « déclaratif » + tip.
  2. Carte **Conversion** (CTA selon statut : converti / validé / à valider).

## Responsive

- **Tablette (≤ ~1000px)** : la grille principale passe en **1 colonne** (la colonne décision repasse sous les données) ; le `sticky` est désactivé. Les sous-grilles 2-col (Identité|Situation) peuvent rester en 2 colonnes tant que la largeur le permet, sinon s'empilent.
- **Téléphone (≤ ~560px)** : tout en **1 colonne**, sous-grilles empilées, boutons d'action en **pleine largeur**, score non collant, liste GED lisible (nom tronqué proprement, actions accessibles).

Breakpoints alignés sur l'existant du sandbox (`@media (max-width:680px)` déjà utilisé pour `.fc-g2`).

## Contraintes

- **Sandbox-first** : modifs uniquement dans `index-candidature-test.html` (CSS scopé `#ov-fiche-candidat` + template `body.innerHTML` de `openFicheCandidat`). Prod = étape ultérieure.
- **Design system** : tokens du thème (sombre + autres) — `--sur --sur2 --bor --t1 --t2 --t3 --blu --grn --ora --red --rl --r`, jamais de couleurs en dur hors fallback.
- **Aucune régression fonctionnelle** : mêmes IDs/handlers (`toggleCandidatPiecesVerifiees`, `setCandidatStatut`, `refuserCandidat`, `demanderComplementCandidat`, `convertCandidatToBail`, `_editCandidatFromFiche`, `_renderAttachmentSection`).
- **Responsive 3 formats** validé en vrai navigateur.

## Hors périmètre

- Logique de scoring, données, conversion, relais, notifications (T13x).
- Autres écrans/fiches.
- Propagation prod (`index.html`) → étape dédiée après validation visuelle.

## Critères de succès

1. Sur grand écran, la fiche occupe ~92vw (plafond 1280px), plus aérée, score + CTA visibles en permanence à droite pendant le scroll.
2. Tablette : 1 colonne propre, pas de sticky, rien de coupé.
3. Téléphone : 1 colonne, boutons pleine largeur, GED lisible.
4. Toutes les actions/fonctions de la fiche fonctionnent comme avant.
