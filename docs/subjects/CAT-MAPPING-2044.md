# CAT-MAPPING-2044 — ⚠️ PAS un sujet séparé : à traiter DANS V3-REFONTE-LOYERS

> **Statut : 🔗 FUSIONNÉ → `V3-REFONTE-LOYERS` (Chantier A).**
> Ne pas ouvrir de chantier concurrent. Ce doc = **constat + cas de test réel** à donner à la
> session loyers, qui possède déjà « l'**éditeur de correspondance pour catégories custom**,
> rebranché sur le moteur 2044 unique » (V3-REFONTE-LOYERS, Chantier A, l.104).

## Constat (découvert en testant REPORTING-BAILLEUR sur données réelles, 2026-06-08)

Tous les rapports fiscaux (déclaration 2044, Bilan annuel, onglet **Finances**) mappent les
mouvements aux lignes 2044 **par le nom EXACT des catégories standard** (`STD_CATEGORIES`).
`_stdCategoryByName` ne consulte que cette constante ; `DB.categories` n'est qu'une liste de noms
**sans `ligne2044`**. → toute catégorie perso/legacy est **non mappée → comptée 0**.

C'est exactement le problème que résout le **Chantier A** de V3-REFONTE-LOYERS (correspondance
catégorie→ligne 2044). Quand ce chantier livre, Finances + Bilan + 2044 s'allument **ensemble**.

## Cas de test réel (base user, sandbox, 173 mvts tous en 2026, toutes catégories ≠STD)
`Loyers`(60)→211 · `Prêt`(28)→250 · `Charges`(17)→229/227 ? · `Charges Communes SCI`(14)→récup ?
· `Assurances PNO`(13)→223 · `Assurances GLI`(10)→223 · `Travaux / Réno`(7)→224 · `Gestion`(6)→221
· `Divers`(6)→213 ? · `Charges ND`(6)→exclu ? · `Remb GLI`(4)→213 · `Cautions`(2)→DG/special.
→ idéal jeu de validation pour l'éditeur de correspondance (suggestion auto + validation user).

## Ce dont REPORTING-BAILLEUR (Finances) a besoin de ce chantier
- Une **liste de catégories EFFECTIVE** (STD + perso mappées avec leur `ligne2044`/`type`),
  exposée de façon que `_finChargeBuckets` / `_finLoyersHC` / `_compute2044` / `_computeBilanAnnuel`
  la consomment **au lieu de `STD_CATEGORIES` seul**.
- Dès que c'est en place, Finances bascule dessus (1 ligne par helper) — pas de logique nouvelle.

## Règle (rappel)
Ne **jamais** auto-mapper en silence : sur des chiffres fiscaux, une correspondance fausse =
déclaration fausse. Suggestion → validation user, toujours.
