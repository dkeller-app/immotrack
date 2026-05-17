# BUG-EMAIL-PROPOSAL-IRL — Modale "Proposition de mail" IRL : boutons inactifs + corps mail buggé

**Status** : ⏳ En attente (report sprint mail) · **Prio** : P2 · **Taille** : S
**Détecté** : 2026-05-17 (user, après livraison Sprint 19A v15.74+v15.75)
**Lié à** : EMAIL-AUTO ✅ v15.09, Sprint 19B EMAIL-ONGLET-PERMANENT (P1, à venir)

## Contexte

Depuis l'onglet IRL → bouton `📧 Envoyer` (panneau latéral aperçu OU modale `#ov-irl-lettre`), une modale "Proposition de mail" s'ouvre avec :
- Champs Destinataire / CC / Sujet / Corps du message
- Bloc "Pièces jointes recommandées" (Lettre IRL PDF)
- Note légale DPE F/G loi Climat 2021
- 4 boutons footer : Annuler · Partager · Copier sujet + corps · Ouvrir dans mon client mail

## Bugs constatés (capture user 2026-05-17)

### 1. Boutons footer inactifs
User : *« aucun bouton fonctionne »* — les 4 actions de la modale ne déclenchent rien (probablement handlers `onclick` cassés ou ID/refs mal résolus).

### 2. Corps de message buggé
- `Bonjour A L'OMBRE DU CHATEAU,,` → double virgule, salutation utilise le nom de l'**adresse de l'immeuble** au lieu du locataire. Helper civilité/salutation à corriger (cf `_civSalut`).
- `à compter du mois de Invalid Date` → helper de formatage `_dfm` ou équivalent reçoit une date invalide (probablement `rev.dateRevision` non renseignée pour ce cas).

## Scope (à réaliser au moment du sprint mail)

- [ ] Audit handlers footer modale "Proposition de mail" (id selector ? closeM ? wiring perdu après refacto EMAIL-AUTO v15.09 ?)
- [ ] Fix salutation : utiliser nom locataire(s), pas adresse immeuble
- [ ] Fix date "à compter de X" : vérifier `dateRevision` valide avant formatage, fallback "à la prochaine échéance" sinon
- [ ] Vérifier les autres types de mail (Quittance, Régularisation) — risque de bug commun

## Décisions

- **Report user** 2026-05-17 : *« on verra au moment du sprint mail »* — fix non urgent (workaround : copier-coller manuel)

## Notes utilisateur

> 💬 2026-05-17 : *« aucun bouton fonctionne. on verra au moment du sprint mail »* + capture modale IRL

## Journal

- 2026-05-17 : sujet créé après remontée user en clôture Sprint 19A. Reporté au sprint mail (probablement 19B EMAIL-ONGLET-PERMANENT ou sujet dédié post-19B).
