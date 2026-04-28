# MRH-AUTO-LOC — MRH : récupérer auto le locataire selon logement

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : S
**Détecté** : 2026-04-28
**Lié à** : -

## Contexte
Dans le formulaire de saisie d'une assurance MRH (Multi-Risques Habitation), quand l'utilisateur sélectionne un logement, le **locataire** (qui est le souscripteur de la MRH) doit être **rempli automatiquement** depuis le bail en cours sur ce logement.

Évite la double saisie et les erreurs de cohérence locataire/logement.

## Scope
- [ ] Trouver le formulaire MRH (probablement `#mrh` onglet)
- [ ] Au `change` du select logement → query bail actif → fill champ locataire
- [ ] Si plusieurs locataires (colocation) → afficher tous + permettre choix
- [ ] Si pas de bail actif → message "aucun locataire en cours sur ce logement"

## Décisions à prendre
- [ ] Cas colocation : 1 MRH par locataire ou 1 MRH partagée ? (probablement 1 par locataire)

## Notes utilisateur
> 💬 2026-04-28 : "MRH : récupérer automatiquement le locataire en fonction du logement"

## Journal
- 2026-04-28 : créé
