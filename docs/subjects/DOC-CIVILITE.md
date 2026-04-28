# DOC-CIVILITE — Formules de politesse : reprendre civilité du locataire

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : XS
**Détecté** : 2026-04-28
**Lié à** : V3-REFONTE-BAIL · IRL-LETTRE-REVISION · BAIL-PRINT-POLISH

## Contexte
Dans les formules de politesse des courriers (lettre IRL, quittances, courriers cautionnement, etc.), la **civilité du locataire** (M., Mme, Mlle…) doit être reprise dynamiquement, pas en dur.

Aujourd'hui, certains templates utilisent "Madame, Monsieur" générique au lieu de la civilité réelle.

## Scope
- [ ] Identifier tous les templates de courrier (IRL, quittances, courriers générés depuis app)
- [ ] Pour chacun, remplacer "Madame, Monsieur" générique par `{civilite} {nom}` ou "Madame [Nom]" / "Monsieur [Nom]"
- [ ] Cas plusieurs locataires (colocation) : `Madame X, Monsieur Y,` dans la formule

## Décisions à prendre
- [ ] Si la civilité est manquante en DB → fallback "Madame, Monsieur" générique ou avertissement utilisateur ?

## Notes utilisateur
> 💬 2026-04-28 : "Dans formule de politesse reprendre la civilité du locataire"

## Journal
- 2026-04-28 : créé
