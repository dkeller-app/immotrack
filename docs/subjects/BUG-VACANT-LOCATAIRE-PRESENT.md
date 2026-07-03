# BUG-VACANT-LOCATAIRE-PRESENT — Logement affiché « Vacant » alors qu'un locataire est en place depuis 6+ ans

**Status** : ✅ Livré v15.407 (2026-07-03) · **Prio** : P1 · **Taille** : S
**Détecté** : 2026-07-02 (user, test app réelle, 2e vague — capture picker « F4 / Vacant » dans Loyers & Mouvements)

## Contexte

> 💬 2026-07-02 : *« pourquoi le logement est vacant alors qu'il y a un locataire depuis longtemps ? même si le locataire est présent depuis plus de 6 ans ? »*

Le picker de logement (Loyers & Mouvements) affiche « Vacant » pour F4 alors qu'un locataire est en place depuis 6+ ans.

## Piste principale (à vérifier en code)

Bail nu de 3/6 ans dont la date de fin est DÉPASSÉE sans gestion de la **tacite reconduction** : le check « bail actif » (`fin >= aujourd'hui`) considère le bail expiré → logement compté vacant. Or loi 89-462 art. 10 : à défaut de congé, le bail est reconduit tacitement aux mêmes conditions → le locataire est bien en place.

Précédent connexe : v15.343 BUG-STATUT-TACITE (échéance dépassée déjà distinguée quelque part) — vérifier si le fix couvre le site du picker et TOUS les sites qui calculent « vacant » (dashboard occupation, tuile Accueil nbVacants, pickers, cartes).

## Scope

1. Repro sur les données : trouver le calcul du label « Vacant » du picker mouvements.
2. Inventaire des sites « vacant/occupé » et alignement sur une règle unique : bail non clôturé + non résilié = actif même si fin < aujourd'hui (tacite reconduction), sauf types non reconductibles (mobilité, garage ?) — vérifier au code.
3. Fix + tests.

## Journal

- 2026-07-02 : sujet créé (2e vague retours test). Traité en session quick wins.

- 2026-07-03 : ✅ **Livré v15.407** sur origin/main (branche fix/quickwins-ux-20260702, merge FF 4349b1e). Audit agent code-reviewer PASS (0 bloquant, 2 importants corrigés avant push : clé pdfRef transmise à _openCloudBailPdf + nettoyage état fiches au retour navigateur). Gates : check-inline-js 5/0, Vitest 1753 verts, vérif navigateur complète, 0 erreur console. Renum v15.398-400→v15.407 (collisions sessions parallèles).
