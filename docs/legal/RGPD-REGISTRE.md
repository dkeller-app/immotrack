# Registre des traitements de données personnelles — ImmoTrack

**Version** : 1.0
**Date** : 2026-05-11
**Base légale** : Règlement (UE) 2016/679 art. 30 ("RGPD")
**Statut** : Modèle à compléter par chaque utilisateur ImmoTrack (responsable du traitement)

---

## Identité du responsable de traitement

| Champ | À compléter par l'utilisateur |
|---|---|
| Nom / Raison sociale | _ex : Didier Keller / SCI Mon Patrimoine_ |
| Adresse | _adresse complète_ |
| SIREN (si pro) | _le cas échéant_ |
| Email contact RGPD | _adresse email dédiée_ |
| DPO (si désigné) | _Non obligatoire si < 250 employés, sauf traitement sensible_ |

---

## Sous-traitants (art. 28 RGPD)

| Sous-traitant | Service | Localisation données | DPA signé | Référence |
|---|---|---|---|---|
| **Google Ireland Limited** | Stockage Drive (sync optionnelle) | UE + US (transferts encadrés clauses contractuelles types) | Oui — voir [DPA-GOOGLE-DRIVE.md](DPA-GOOGLE-DRIVE.md) | [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum) |

**Important** : si vous activez la sync Drive, vous transférez vos données à Google. Si vos locataires ont saisi des données personnelles (nom, IBAN, email), informez-les via un avenant au bail ou un courrier ad hoc avant l'activation.

---

## Traitements

### 1. Gestion locative — Données des locataires

| Champ | Détail |
|---|---|
| **Finalité** | Exécution du contrat de bail (art. 6.1.b RGPD) + obligations légales (quittances, IRL, EDL) |
| **Catégories de personnes** | Locataires actuels + anciens locataires (durée du bail + 3 ans légaux ou 5 ans CRG mandataires) + garants |
| **Catégories de données** | Identité (nom, prénom, civilité, DDN, lieu naissance, adresse précédente), contact (téléphone, email), financier (IBAN si paiement SEPA — sinon non collecté), bail (loyer, charges, DG, durée, dates) |
| **Données sensibles** | Aucune (pas de données de santé, opinions politiques, etc.) |
| **Durée de conservation** | Pendant le bail + 3 ans après son terme (art. 2224 Code civil prescription civile commune) + 6 ans (art. L102B LPF pour mandataire Hoguet ou expert-comptable) |
| **Destinataires** | Responsable de traitement uniquement ; Google (si sync Drive) ; expert-comptable et avocat sur demande |
| **Transferts hors UE** | Si Drive : oui, vers les USA, encadrés par les clauses contractuelles types (SCC) Google |
| **Mesures techniques** | Chiffrement transport (HTTPS/TLS), chiffrement stockage (localStorage navigateur + Drive chiffré au repos), accès via OAuth Google (compte utilisateur unique) |

### 2. Suivi des bailleurs (entités juridiques + personnes physiques)

| Champ | Détail |
|---|---|
| **Finalité** | Gestion patrimoniale + déclarations fiscales (2044, 2072) + comptabilité |
| **Catégories de personnes** | Bailleurs particuliers (personnes physiques) + représentants de SCI/SAS (personnes physiques) |
| **Catégories de données** | Identité (nom, prénom, gérants pour SCI), juridique (SIREN, RCS, type juridique, statuts), bancaire (IBAN versement loyers + reversement honoraires si Hoguet) |
| **Durée de conservation** | Durée d'activité + 10 ans (obligation comptable art. L123-22 Code Commerce) |
| **Destinataires** | Responsable de traitement, expert-comptable, fisc (déclarations) |

### 3. Journal d'activité (Sprint 3A AUDIT-TRAIL)

| Champ | Détail |
|---|---|
| **Finalité** | Traçabilité des modifications pour CRG (Compte Rendu de Gestion mandataire) et conformité RGPD |
| **Catégories de personnes** | Utilisateurs de l'application (= responsable de traitement seul en V1) |
| **Catégories de données** | userId (UUID anonyme), userName (renseigné par utilisateur), timestamp, action, type d'entité modifiée, ref user-facing, diff (delta des champs modifiés, hors champs binaires) |
| **Durée de conservation** | Cap soft 10 000 entrées (~6 mois en usage régulier) puis prune des 5000 plus anciennes ; ou export CSV + purge manuelle via UI Paramètres |
| **Destinataires** | Responsable de traitement uniquement |

### 4. Photos d'état des lieux (EDL)

| Champ | Détail |
|---|---|
| **Finalité** | Preuve photographique de l'état du logement à l'entrée + sortie (obligation art. 3 loi 89-462 + décret 2016-382) |
| **Catégories de personnes** | Locataires (incidemment dans les photos si présents) |
| **Catégories de données** | Photos JPEG/PNG (pieces, compteurs, clés) stockées en IndexedDB local + Drive si sync |
| **Durée de conservation** | Bail + 3 ans (preuve en cas de litige restitution DG) |
| **Stockage** | IndexedDB navigateur (`immotrack_photos`) + Google Drive si sync (dossier dédié `📋 EDL/` par logement) |

---

## Droits des personnes concernées (art. 15-22 RGPD)

Les locataires peuvent exercer :

- **Droit d'accès** (art. 15) : copie des données les concernant. Procédure : email au responsable de traitement, réponse sous 1 mois.
- **Droit de rectification** (art. 16) : correction des données inexactes (nom, email, etc.).
- **Droit à l'effacement** (art. 17) : suppression à la fin du bail + délais légaux (cf durées de conservation supra).
- **Droit à la portabilité** (art. 20) : récupération des données dans un format structuré (JSON via export ImmoTrack > Paramètres > "Mes données").
- **Droit d'opposition** (art. 21) : refus du traitement (sauf base légale contractuelle qui prime).

**Procédure recommandée** : créer un email type "rgpd@<votre-domaine>" ou utiliser une adresse dédiée. Tracer toutes les demandes dans `DB.auditTrail` (action='rgpd_request').

---

## Notification de violation (art. 33-34)

En cas de fuite de données (vol device + Drive non chiffré local, compromission compte Google, etc.) :
1. **Dans les 72 heures** : notification à la CNIL via le portail [https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles)
2. **Si risque élevé** : information des locataires concernés (lettre ou email).

---

## Mesures de sécurité techniques

| Risque | Mesure |
|---|---|
| Vol device | Chiffrement disque OS (BitLocker/FileVault) + verrouillage session |
| Compromission Drive | 2FA obligatoire sur le compte Google ; révocation token via [myaccount.google.com/security](https://myaccount.google.com/security) |
| Quota localStorage dépassé | Photos en IndexedDB (pas en localStorage) ; cap auditTrail 10k entrées |
| XSS | Helpers `escHtml` / `_h` / `_raw` (cf Sprint 1A SECU-INNERHTML) — neutralisent injections HTML dans données user |
| Backup | Sync Drive optionnelle + export JSON manuel via Paramètres |

---

## Mises à jour de ce registre

À actualiser à chaque modification :
- Ajout d'un sous-traitant (Stripe, Sentry, etc.)
- Nouveau type de traitement (multi-user, portail locataire, etc.)
- Changement de durée de conservation

**Dernière mise à jour** : 2026-05-11
**Mainteneur** : responsable de traitement ImmoTrack
