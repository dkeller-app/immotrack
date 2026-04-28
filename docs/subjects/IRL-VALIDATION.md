# IRL-VALIDATION — IRL : case validation envoi + rappel date augmentation

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M
**Détecté** : 2026-04-28
**Lié à** : V3-REFONTE-IRL · BUG-IRL-001

## Contexte
Workflow IRL incomplet : pas de traçabilité de l'envoi + pas de rappel à la date effective.

Besoins :
1. **Case "Envoi validé"** sur chaque révision IRL → permet de tracer que le courrier a bien été envoyé
2. **Rappel** à la date d'application de la nouvelle valeur IRL → notifier l'utilisateur de prendre en compte la nouvelle valeur dans ses mouvements/quittances

## Scope
- [ ] Ajouter checkbox "Envoi validé" sur la fiche révision IRL (état booléen + date validation)
- [ ] Stocker dateApplication (= mois anniversaire bail) dans la fiche révision
- [ ] Système de rappel à la date d'application :
  - Soit toast au login si dateApplication >= aujourd'hui
  - Soit ligne dédiée dans le dashboard "À traiter" / "À valider"
  - Soit notif locale (si PWA + permissions)
- [ ] Quand "Prise en compte validée" coché → ajuster les loyers attendus dans les mouvements à venir

## Décisions à prendre
- [ ] Mécanisme de rappel : toast / dashboard / notif PWA / les 3 ?
- [ ] Auto-update des loyers après validation : automatique ou bouton "Appliquer" manuel ?

## Notes utilisateur
> 💬 2026-04-28 : "IRL : ajouter une case pour valider l'envoi. Mettre un rappel à la date de l'augmentation IRL pour valider la prise en compte IRL"

## Journal
- 2026-04-28 : créé
