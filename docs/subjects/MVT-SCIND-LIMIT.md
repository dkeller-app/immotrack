# MVT-SCIND-LIMIT — Mouvements : limite sur le nombre de scindages d'une ligne ?

**Status** : ⬜ À faire · **Prio** : P3 · **Taille** : XS
**Détecté** : 2026-04-28
**Lié à** : MVT-SCIND-CAT · V3-REFONTE-LOYERS

## Contexte
Question utilisateur : la fonction "scinder une ligne" de mouvement a-t-elle une limite ? À investiguer dans le code.

Si limite codée en dur → vérifier qu'elle est cohérente. Si pas de limite → vérifier que ça ne casse pas l'UI au-delà de N splits.

## Scope
- [ ] Trouver la fonction `scinderMouvement` / `splitMouvement` dans le code
- [ ] Vérifier s'il y a une limite (boucle, max=N, etc.)
- [ ] Tester avec 5+ scindages successifs sur une même ligne

## Notes utilisateur
> 💬 2026-04-28 : "Mouvements : est-ce qu'il y a une limite sur le nombre de scinder une ligne ?"

## Journal
- 2026-04-28 : créé · question à investiguer
