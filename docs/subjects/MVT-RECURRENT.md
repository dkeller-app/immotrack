# MVT-RECURRENT — Mouvements récurrents avec récurrence configurable

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M
**Détecté** : 2026-04-28
**Lié à** : V3-REFONTE-LOYERS

## Contexte
Aujourd'hui, certains mouvements doivent être saisis manuellement chaque mois/trimestre :
- Assurance PNO / MRH (mensuelle ou annuelle)
- Mensualité d'un prêt
- Prélèvement syndic
- Taxe foncière (annuelle)
- Charges abonnement (chaudière, internet, etc.)

L'utilisateur veut pouvoir **créer un mouvement récurrent** avec **fréquence configurable** (mensuel / trimestriel / semestriel / annuel / custom) et **génération automatique** des écritures à chaque échéance.

## Scope
- [ ] Modèle : entité `mvt_recurrent` (template) avec montant, catégorie, périodicité, dateDébut, dateFin (optionnel), prochain
- [ ] Génération auto des écritures effectives à la date d'échéance (cron-like au login ?)
- [ ] UI : éditer les récurrences ; voir prochaines échéances
- [ ] Mécanisme : "à valider" (l'utilisateur confirme l'écriture quand elle se produit) vs "auto" (généré direct)
- [ ] Modification d'une récurrence (changement montant, fin de récurrence)

## Décisions à prendre
- [ ] "À valider" vs "auto" par défaut ? (recommandation : à valider, l'utilisateur garde le contrôle)
- [ ] Affichage des prochaines échéances : dans le dashboard ? Onglet dédié ?
- [ ] Quand génération réelle : login / changement de mois / clic explicite "Générer ce mois" ?

## Notes utilisateur
> 💬 2026-04-28 : "créer des mouvements récurrents (assurance, pret …) pouvoir choisir la récurrence"

## Journal
- 2026-04-28 : créé
