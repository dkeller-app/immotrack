# ENT-SAVE-IMM — Modifier entité : Enregistrer entité sauve aussi l'immeuble en saisie

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S
**Détecté** : 2026-04-28
**Lié à** : -

## Contexte
Dans le formulaire "Modifier entité", il y a un sous-formulaire pour ajouter un nouvel immeuble. Si l'utilisateur clique sur "Enregistrer entité" sans avoir explicitement cliqué sur "Enregistrer immeuble", la saisie immeuble est perdue.

L'utilisateur souhaite que **"Enregistrer entité" enregistre aussi l'immeuble en saisie**, pour éviter la perte de données. Question ouverte : faut-il alors **supprimer le bouton "Enregistrer immeuble"** (single source of truth) ?

## Scope
- [ ] Vérifier l'état du form immeuble au moment du save entité (pristine vs dirty)
- [ ] Si dirty → valider et persister l'immeuble avant le save entité
- [ ] Décider du sort du bouton "Enregistrer immeuble" (cf décision)

## Décisions à prendre
- [ ] **Garder ou supprimer le bouton "Enregistrer immeuble"** ?
  - Garder = utile si on veut ajouter plusieurs immeubles d'affilée sans fermer la modale entité
  - Supprimer = simplifie le flow ; un save entité = tout est sauvegardé
- → Recommandation : garder le bouton, mais auto-save au "Enregistrer entité" si dirty (compromis)

## Notes utilisateur
> 💬 2026-04-28 : "Dans modifier entité, quand on clique sur enregistré entité, enregister la saisie du nouvel immeuble aussi (ne faut-il pas supprimer le bouton enregistrer immeuble ?)"

## Journal
- 2026-04-28 : créé
