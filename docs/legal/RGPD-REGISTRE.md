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
| **Cloudflare, Inc.** | Relais de signature à distance (Worker + R2 + KV) — `bail-sign-relay`, transit temporaire du bail le temps de la signature | R2/KV mondial par défaut (KV répliqué multi-régions) ; restreindre via *Jurisdictional Restrictions* (R2 hint `eu`) recommandé | DPA standard Cloudflare (SCC) — à accepter dans le dashboard Cloudflare | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |

**Important** : si vous activez la sync Drive, vous transférez vos données à Google. Si vos locataires ont saisi des données personnelles (nom, IBAN, email), informez-les via un avenant au bail ou un courrier ad hoc avant l'activation.

**Relais de signature** : lorsqu'un bail est envoyé en signature à distance, le PDF du bail (riche en données personnelles : noms, adresse, montants) et les preuves de signature (hash SHA-256 de l'email, téléphone, IP, user-agent, horodatages) transitent par Cloudflare. Données purgées automatiquement après **14 jours** (TTL KV) / **15 jours** (cycle de vie R2). KV étant répliqué mondialement par défaut, configurer la restriction de juridiction UE si la localisation des données dans l'UE est requise.

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

### 5. Signature électronique à distance du bail (BAIL-SIGNATURE-DISTANCE)

| Champ | Détail |
|---|---|
| **Finalité** | Recueil de la signature électronique du bail à distance (loi ELAN ; niveau eIDAS « simple ») + constitution du dossier de preuve |
| **Catégories de personnes** | Signataires du bail : bailleur(s) et locataire(s) |
| **Catégories de données** | PDF du bail (identité, adresse, loyer, DG…), hash SHA-256 de l'email du signataire, téléphone, et preuves : hash SHA-256 du PDF signé, adresse IP, user-agent, horodatages ISO 8601 |
| **Données sensibles** | Aucune |
| **Base légale** | Exécution du contrat (art. 6.1.b RGPD) + intérêt légitime à la valeur probante (art. 6.1.f) |
| **Durée de conservation** | **Côté relais Cloudflare** : éphémère — 14 j (TTL KV) / 15 j (cycle de vie R2), le temps de la signature uniquement. **Côté ImmoTrack** : bail signé + dossier de preuve conservés avec le bail (durée du bail + 3 ans, cf. traitement n°1) |
| **Destinataires** | Responsable de traitement ; Cloudflare (sous-traitant, transit temporaire) |
| **Transferts hors UE** | Possible via Cloudflare (KV répliqué mondialement) — encadré par les SCC du DPA Cloudflare ; restriction de juridiction UE recommandée |
| **Mesures techniques** | sessionId 256 bits non devinable ; jetons HMAC-SHA256 (jamais dans l'URL) ; comparaison à temps constant des secrets ; HTTPS/TLS ; chiffrement R2 au repos ; purge automatique (TTL) ; signature ordonnée (machine à états anti-rejeu) |
| **Anti-transfert (V1)** | Le lien de signature est livré uniquement à l'email du signataire ; la vérification d'email à l'ouverture (OTP) est prévue en Phase 2 |

### 6. Candidatures locataires (sélection du locataire)

| Champ | Détail |
|---|---|
| **Finalité** | Examen des dossiers de candidature en vue de sélectionner un locataire pour un logement vacant (mesures précontractuelles prises à la demande de la personne) |
| **Catégories de personnes** | Candidats locataires + leurs garants |
| **Catégories de données** | Identité (nom, prénom, civilité, DDN), contact (téléphone, email), situation (revenus mensuels, type de contrat CDI/CDD/autre), garant (nom, situation), pièces justificatives **limitées à la liste autorisée** par le décret n° 2015-1437 du 5 novembre 2015 (justificatif d'identité, de domicile, d'activité professionnelle, de ressources) |
| **Données INTERDITES** | Conformément à l'art. 22-2 de la loi n° 89-462 du 6 juillet 1989, ne sont jamais demandées : photo (hors pièce d'identité), copie de carte vitale, relevés de compte, attestation d'absence de crédit, etc. **Le RIB/IBAN n'est PAS collecté au stade candidature** — il l'est uniquement à la signature du bail (cf. traitement n°1) |
| **Données sensibles** | Aucune |
| **Base légale** | Mesures précontractuelles prises à la demande de la personne concernée (art. 6.1.b RGPD) |
| **Profilage / décision automatisée** | Un « score de confiance » est calculé comme **aide à la décision**, fondé exclusivement sur des critères de solvabilité licites (ratio revenus/loyer, nature du contrat, présence d'un garant, complétude du dossier). **Pas de décision entièrement automatisée** au sens de l'art. 22 RGPD : la sélection finale est humaine. Aucun critère discriminatoire (art. 225-1 Code pénal) n'entre dans le score |
| **Durée de conservation** | **Candidat refusé** : 30 jours après le refus, puis effacement automatique au démarrage de l'application (tombstone propagé à la sync Drive). **Candidat retenu** : converti en locataire → bascule sous le traitement n°1 (durée du bail + délais légaux) |
| **Destinataires** | Responsable de traitement uniquement ; Google (si sync Drive) |
| **Transferts hors UE** | Si Drive : oui, vers les USA, encadrés par les clauses contractuelles types (SCC) Google |
| **Mesures techniques** | Score non-discriminant transparent (barème affiché) ; purge automatique des refusés à 30 j ; isolation des données de test (`_test_immotrack_v4`) ; chiffrement transport (HTTPS/TLS) et stockage au repos |

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

**Dernière mise à jour** : 2026-06-03 (ajout traitement n°6 candidatures locataires — purge RGPD refusés 30 j, score non-discriminant, RIB exclu au stade candidature)
**Mainteneur** : responsable de traitement ImmoTrack
