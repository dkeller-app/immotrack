# DOC-PJ — Pouvoir ajouter des pièces jointes (factures, CR entretien)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M
**Détecté** : 2026-04-28
**Lié à** : TRAV-SUIVI · DRIVE-2H

## Contexte
Aujourd'hui pas de système global de PJ. L'utilisateur veut pouvoir attacher des **fichiers** (PDF facture, photo CR d'intervention, devis, etc.) à différentes entités :
- Mouvements (facture pour un travaux)
- Travaux/entretien (CR d'intervention, photos avant/après, devis)
- Logements (DPE, plans, ERP)
- Bail / EDL (déjà partiellement, pour les photos EDL)
- Charges (facture du syndic, contrat chaudière)

## Scope
- [ ] Concevoir un système générique d'attachement (table `pj` avec fk parent + type parent + url Drive ?)
- [ ] Réutiliser l'infra Drive existante (upload, get) — pas de IndexedDB ici, Drive direct
- [ ] UI : bouton "+ Ajouter PJ" sur chaque fiche (mouvement, travaux, logement, charge)
- [ ] Liste des PJ avec preview (image) ou lien (PDF/Word)
- [ ] Suppression + remplacement

## Décisions à prendre
- [ ] Storage : Drive direct (URL) ou IndexedDB local + sync ?
- [ ] Quotas / limites taille fichier ?
- [ ] Versioning : remplacer ou garder les versions précédentes ?

## Notes utilisateur
> 💬 2026-04-28 : "pouvoir ajouter des PJ (facture ou CR pour les entretiens par exemple)"

## Journal
- 2026-04-28 : créé
