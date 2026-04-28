# BAIL-PARAPHE-PLACEHOLDER — Bail : supprimer le texte "à compléter" dans cadre paraphe locataire

**Status** : ⬜ À faire · **Prio** : P3 · **Taille** : XS
**Détecté** : 2026-04-29
**Lié à** : BAIL-PRINT-POLISH

## Contexte
Dans le cadre "Paraphe locataire" (probablement aperçu/édition bail ou bloc signature), un texte placeholder "à compléter" est affiché en gris italique dans la zone de signature.

L'utilisateur veut **supprimer** ce texte (le cadre vide est plus propre, on n'a pas besoin de l'indication).

## Scope
- [ ] Trouver l'élément dans le code (probablement template signature locataire — `_paraphFmt`, `signZoneFmt`, ou template bail aperçu)
- [ ] Retirer le texte "à compléter" (ou le rendre conditionnel : seulement si pas de signature uploadée + masquer en print/PDF)
- [ ] Vérifier que ça ne casse pas le layout du cadre vide

## Décisions à prendre
- [ ] Suppression totale ou conditionnelle (afficher seulement en édition, pas en aperçu/PDF) ?
  - Recommandation : suppression totale, le cadre vide se comprend tout seul

## Notes utilisateur
> 💬 2026-04-29 : "supprimer le texte à compléter" (capture cadre Paraphe locataire)

## Journal
- 2026-04-29 : créé
