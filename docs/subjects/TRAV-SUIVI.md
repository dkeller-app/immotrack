# TRAV-SUIVI — Suivi entretien / travaux avec calendrier

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : L
**Détecté** : 2026-04-28
**Lié à** : DOC-PJ · MVT-RECURRENT

## Contexte
Module dédié au suivi des **entretiens et travaux** sur les logements/immeubles, avec **calendrier** pour visualiser les échéances et l'historique.

Cas d'usage :
- Entretien chaudière annuel obligatoire (date dernière vérif + alerte +1 an)
- Ramonage cheminée annuel
- Vérification VMC tous les 3 ans
- Travaux ponctuels (réparation, rénovation) avec devis, factures, photos
- DPE / diagnostics avec validité (10 ans pour DPE)

## Scope
- [ ] Modèle : entité `travaux` (ou `entretien`) avec date prévue/réalisée, type, fournisseur, coût, périodicité, alertes
- [ ] Vue calendrier (mois / année / agenda)
- [ ] Vue liste avec filtres par logement / type / statut
- [ ] Alertes dashboard : "à faire dans 30j", "en retard"
- [ ] Lien avec PJ (DOC-PJ : attacher facture, CR, photos)
- [ ] Lien avec mouvements (créer auto le mouvement à la facturation ?)
- [ ] Templates pré-remplis (chaudière annuelle, ramonage…)

## Décisions à prendre
- [ ] Calendrier : custom HTML/CSS ou lib externe (FullCalendar) ? (préférer custom pour rester offline-first)
- [ ] Templates : configurables par utilisateur ou en dur ?
- [ ] Lien automatique avec mouvements (création auto) ou manuel ?

## Notes utilisateur
> 💬 2026-04-28 : "Suivi entretien et des travaux avec calendrier"

## Journal
- 2026-04-28 : créé · CDC requis avant code (gros chantier)
