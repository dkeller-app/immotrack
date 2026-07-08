# CRG-PDF-GERANCE — compte-rendu de gérance PDF (agence → propriétaire)

> User 2026-07-08 : « pouvoir sortir un pdf de résumé pour une agence qui enverrait au client,
> avec les paiements reçus, charges and co ». Pensé SaaS/agence dès le départ (règle déploiement).

## Contenu du document (standard CRG)
Période sélectionnable (mois/trimestre/année) × périmètre (bailleur/entité, immeuble ou lot) :
1. **Loyers & paiements reçus** par lot (moteur unique `_computeLoyerStatut` : reçu / dû du bail
   de l'époque / statut avec report + solde du locataire).
2. **Charges payées** par poste (moteur `_computeFinancesMonthly` : taxe, travaux, assurance,
   honoraires, récupérables) avec liste des mouvements.
3. **Provisions encaissées vs charges récupérables** (solde de régul).
4. Honoraires de gestion (pour l'agence), **solde net reversé au propriétaire**.
5. En-tête entité/agence (logo à terme), période, mentions.

## Implémentation
- Réutilise la chaîne PDF existante (`_emailGenPdfAttachment` / html2canvas des documents officiels)
  + le bloc d'envoi unifié `_openShareModal` (v15.424) pour l'envoi par email.
- AUCUN nouveau moteur de calcul : uniquement les moteurs existants (source unique).
- Dépendances : SUIVI-LOYERS-SOURCE-UNIQUE Phases C-D (chiffres unifiés d'abord).

## Statut
⬜ À faire (P2) — après Phases C-D du moteur unique. Mockup-first (document = visuel).
