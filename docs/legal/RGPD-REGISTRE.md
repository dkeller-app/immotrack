# Registre des traitements de données personnelles — ImmoTrack

**Version** : 1.1
**Date** : 2026-05-11 (maj 2026-06-08)
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
| **Cloudflare, Inc.** | Relais à distance (Worker + R2 + KV) — `bail-sign-relay` : transit temporaire (1) du bail le temps de la **signature**, (2) des **dépôts de candidature en ligne** (dossier + pièces) le temps de leur rapatriement, (3) **espace locataire** (traitement n°8) : page et API servies par le relais, **sans stockage** côté Cloudflare (les données restent dans Supabase ; seul un code de confirmation de 10 min peut transiter en KV) | R2/KV mondial par défaut (KV répliqué multi-régions) ; restreindre via *Jurisdictional Restrictions* (R2 hint `eu`) recommandé | DPA standard Cloudflare (SCC) — à accepter dans le dashboard Cloudflare | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| **Mistral AI** (France) | IA : transcription de la dictée de l'état des lieux (Voxtral) et préparation des propositions (Mistral Small) — appelée **uniquement par le relais** (clé jamais dans le navigateur) | Union européenne | Contrat de sous-traitance (DPA) Mistral à accepter ; **rétention zéro** à activer (facturation à l'usage) et **entraînement refusé** dans la console — à confirmer | [legal.mistral.ai](https://legal.mistral.ai) |

**Important** : si vous activez la sync Drive, vous transférez vos données à Google. Si vos locataires ont saisi des données personnelles (nom, IBAN, email), informez-les via un avenant au bail ou un courrier ad hoc avant l'activation.

**Relais de signature** : lorsqu'un bail est envoyé en signature à distance, le PDF du bail (riche en données personnelles : noms, adresse, montants) et les preuves de signature (hash SHA-256 de l'email, téléphone, IP, user-agent, horodatages) transitent par Cloudflare. Données purgées automatiquement après **14 jours** (TTL KV) / **15 jours** (cycle de vie R2). KV étant répliqué mondialement par défaut, configurer la restriction de juridiction UE si la localisation des données dans l'UE est requise.

**Relais de candidature en ligne** : lorsqu'un bailleur invite un candidat à déposer son dossier en ligne (sans création de compte), le formulaire (identité, situation, garant) et les pièces justificatives téléversées transitent par le même relais Cloudflare (`bail-sign-relay`, stockage KV). Le lien candidat a une entropie de 256 bits (non devinable) ; le jeton de capacité bailleur (`ownerToken`) n'est **jamais** placé dans une URL ni journalisé. Données purgées automatiquement à l'expiration de l'invitation (**TTL KV = 7 / 14 / 30 jours** selon la durée choisie), après rapatriement dans l'app par le bailleur. Le rapatriement est **automatisé** (à l'ouverture de l'onglet Candidats, au retour de focus de la fenêtre, et toutes les 3 min) mais ne collecte **aucune donnée nouvelle** : il récupère uniquement ce que le candidat a volontairement déposé. Le « score de confiance » n'est **jamais** calculé ni transmis côté relais — il est recalculé localement dans l'app.

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
| **Canal de collecte** | (a) **Saisie manuelle** par le bailleur dans l'app ; (b) **Dépôt en ligne par le candidat** via un lien sécurisé sans compte (relais Cloudflare `bail-sign-relay`) : le candidat remplit le formulaire et téléverse ses pièces, qui transitent par le relais (KV) puis sont **rapatriées automatiquement** dans l'app par le bailleur (déclencheurs : ouverture de l'onglet Candidats, retour de focus, intervalle 3 min) — le rapatriement automatisé **ne collecte aucune donnée nouvelle**, il récupère ce que le candidat a volontairement déposé |
| **Catégories de personnes** | Candidats locataires + leurs garants |
| **Catégories de données** | Identité (nom, prénom, civilité, DDN), contact (téléphone, email), situation (revenus mensuels, type de contrat CDI/CDD/autre), garant (nom, situation), pièces justificatives **limitées à la liste autorisée** par le décret n° 2015-1437 du 5 novembre 2015 (justificatif d'identité, de domicile, d'activité professionnelle, de ressources) |
| **Données INTERDITES** | Conformément à l'art. 22-2 de la loi n° 89-462 du 6 juillet 1989, ne sont jamais demandées : photo (hors pièce d'identité), copie de carte vitale, relevés de compte, attestation d'absence de crédit, etc. **Le RIB/IBAN n'est PAS collecté au stade candidature** — il l'est uniquement à la signature du bail (cf. traitement n°1) |
| **Données sensibles** | Aucune |
| **Base légale** | Mesures précontractuelles prises à la demande de la personne concernée (art. 6.1.b RGPD) |
| **Profilage / décision automatisée** | Un « score de confiance » est calculé comme **aide à la décision**, fondé exclusivement sur des critères de solvabilité licites (ratio revenus/loyer, nature du contrat, présence d'un garant, complétude du dossier). **Pas de décision entièrement automatisée** au sens de l'art. 22 RGPD : la sélection finale est humaine. Aucun critère discriminatoire (art. 225-1 Code pénal) n'entre dans le score |
| **Durée de conservation** | **Candidat refusé** : 30 jours après le refus, puis effacement automatique au démarrage de l'application (tombstone propagé à la sync Drive). **Candidat retenu** : converti en locataire → bascule sous le traitement n°1 (durée du bail + délais légaux). **Côté relais (dépôt en ligne)** : dossier déposé + pièces éphémères — purge automatique à l'expiration de l'invitation (TTL KV = 7/14/30 j selon la durée choisie), après rapatriement par le bailleur |
| **Destinataires** | Responsable de traitement uniquement ; Google (si sync Drive) ; **Cloudflare** (sous-traitant : transit temporaire du dépôt en ligne le temps du rapatriement — cf. section Sous-traitants) |
| **Transferts hors UE** | Si Drive : oui, vers les USA (SCC Google). **Dépôt en ligne** : transit via Cloudflare KV (répliqué mondialement) — encadré par les SCC du DPA Cloudflare ; restriction de juridiction UE recommandée |
| **Mesures techniques** | Score non-discriminant transparent (barème affiché) ; purge automatique des refusés à 30 j ; isolation des données de test (`_test_immotrack_v4`) ; chiffrement transport (HTTPS/TLS) et stockage au repos. **Dépôt en ligne** : lien candidat 256 bits non devinable ; `ownerToken` jamais placé dans une URL ni journalisé ; le relais répond en 200 (statut) au polling (pas de fuite par code d'erreur) ; **score jamais calculé ni transmis côté relais** (recalcul local) ; rapatriement automatisé sans collecte de donnée nouvelle |

### 7. Dictée de l'état des lieux assistée par IA (EDL-VOIX-IA)

| Champ | Détail |
|---|---|
| **Finalité** | Aider à remplir l'état des lieux : un commentaire oral d'une pièce est transcrit, puis une IA **propose** un état et une observation par élément cité. Rien n'entre dans l'EDL sans validation humaine, élément par élément ; l'EDL reste contradictoire et signé par les parties (« l'IA lit, la loi décide ») |
| **Catégories de personnes** | Utilisateur qui dicte (bailleur, gestionnaire, agent) ; incidemment le locataire ou toute personne présente dont la voix serait captée |
| **Catégories de données** | Enregistrement audio de la dictée (voix) ; transcription ; propositions (état, observation, extrait entendu) ; marque lisible par machine sur les valeurs acceptées (`iaE` / `iaS` / `compteursIA` : booléens, horodatage, modèle) ; compteurs de consommation par compte (appels, secondes d'audio, jetons — **sans aucun contenu**) |
| **Données sensibles** | Aucune attendue. La notice demande de prévenir les présents et d'éviter de citer des informations personnelles ; la consigne donnée au modèle interdit d'en reporter dans les observations |
| **Base légale** | Exécution du service souscrit par l'utilisateur (art. 6.1.b) ; pour la voix d'un tiers présent : intérêt légitime à établir l'EDL (art. 6.1.f), avec information préalable (notice) |
| **Durée de conservation** | **Audio** : jamais conservé — gardé sur l'appareil seulement le temps de l'envoi (file d'attente hors ligne en IndexedDB), supprimé dès la transcription réussie ; s'il ne peut pas partir (hors ligne, service indisponible, rien entendu), il reste sur l'appareil jusqu'à l'envoi ou sa suppression par l'utilisateur, 30 jours au plus (purge automatique) ; le relais ne le stocke pas. **Transcription et propositions** : sur l'appareil le temps de la relecture, puis effacées. **Valeurs validées** : avec l'EDL (traitement n°4). **Fournisseur** : rétention zéro (décision du 13/10/2026, à confirmer sur le compte Mistral) ; à défaut, 30 jours au plus pour la détection des abus. **Compteurs de consommation** : 48 h (quota du jour) et 400 jours (suivi mensuel), sans contenu |
| **Destinataires** | Responsable de traitement ; Cloudflare (relais, transit) ; Mistral AI (sous-traitant) |
| **Transferts hors UE** | Aucun prévu : Mistral AI héberge dans l'UE. Transit par le relais Cloudflare (cf. sous-traitants) |
| **Profilage / décision automatisée** | Aucun : propositions soumises à validation humaine une par une ; aucun score |
| **Transparence (AI Act art. 50)** | Mention « Proposé par l'IA, à vérifier » sur chaque proposition ; notice à la première utilisation ; mention discrète dans le PDF signé si au moins une proposition a été acceptée ; marquage lisible par machine |
| **Mesures techniques** | Clé du fournisseur en secret du relais, jamais dans le navigateur ; routes authentifiées (JWT Supabase) ; taille et type de l'audio contrôlés ; quota par compte et par jour ; sortie du modèle validée (éléments de la liste, états autorisés, extrait réellement entendu) ; **journaux sans contenu** (vérifié par test) ; aucune écriture sur un EDL signé |
| **AIPD** | **Recommandée** (voix captée au domicile, IA) — à réaliser avec l'avocat avant l'ouverture commerciale |

### 8. Espace locataire par lien, sans mot de passe (ESPACE-LOCATAIRE, migration 0059)

| Champ | Détail |
|---|---|
| **Finalité** | Mettre à disposition du locataire (chaque colocataire séparément) les documents de SON bail (bail et avenants signés, états des lieux signés, quittances, décomptes de charges et justificatifs), recueillir son accord pour la quittance électronique (art. 21 loi n° 89-462), lui permettre de signaler un problème dans le logement et d'échanger avec le bailleur |
| **Canal de collecte** | Lien personnel `…/l#<jeton>` transmis par le bailleur (fenêtre d'envoi, ou e-mail quand l'envoi sera actif). Aucun compte, aucun mot de passe. Le jeton (256 bits) est dans le fragment de l'URL : jamais envoyé au serveur dans l'URL, jamais journalisé |
| **Catégories de personnes** | Locataires et colocataires ; bailleur et associés de la SCI (auteurs des réponses, affichés sous le nom du bailleur) |
| **Catégories de données** | Nom du locataire (copie pour l'affichage), adresse du logement, nom du bailleur ; documents du bail (déjà détenus par le bailleur) ; accord quittance électronique (date, version du texte, retrait) ; signalements (pièce, nature, urgence, description, photos — ré-encodées dans le navigateur, ce qui retire les métadonnées GPS) ; messages et pièces jointes ; **journal minimal** : date de dernière visite (au plus une écriture par heure). Côté relais : condensat d'adresse IP salé du jour pour limiter les jetons invalides (jamais l'IP en clair, effacé après 24 h) |
| **Données sensibles** | Aucune attendue |
| **Base légale** | Exécution du contrat de bail (art. 6.1.b) et obligations légales (art. 6.1.c : quittance art. 21, justificatifs de charges art. 23 loi n° 89-462). Transmission électronique de la quittance : **accord exprès** du locataire (case non pré-cochée, horodatée, retirable) |
| **Profilage / décision automatisée** | Aucun |
| **Durée de conservation** | **Accès par le lien** : tout le bail ; puis jusqu'à la clôture des comptes (documents, messages) ; puis 6 mois de consultation des documents seuls ; plafond fin du bail + 14 mois (art. 22 et 23 loi n° 89-462 ; CNIL, délibération n° 2021-057). **Données** : chez le bailleur, avec le dossier du bail (traitement n°1). Ouvertures de fichiers et tentatives invalides : purgées après 24 h |
| **Destinataires** | Le locataire concerné (ses seuls documents, messages, signalements) ; le bailleur et les associés de la SCI selon leurs droits (RLS par SCI) ; Supabase (hébergement, UE) ; Cloudflare (relais, transit sans stockage) ; Resend (envoi d'e-mails, **non actif** : à inscrire comme sous-traitant à l'activation) |
| **Transferts hors UE** | Aucun stockage hors UE prévu. Transit par le relais Cloudflare (DPA, SCC) ; Resend (États-Unis) à l'activation des e-mails, encadré par SCC / DPF |
| **Mesures techniques** | Jeton tiré dans le navigateur du bailleur, **seule son empreinte SHA-256 est stockée** (table sans aucune lecture possible) ; révocation et renouvellement immédiats ; le relais n'a **aucune clé de service** : identité technique limitée aux fonctions `el_*`, qui filtrent par bail et par accès (simulation d'isolation : un locataire ne voit rien d'un autre locataire, d'un autre lot ni d'une autre SCI) ; fichiers lisibles seulement 60 s après autorisation ; dépôts limités (JPEG, PNG, PDF ; 10 Mo ; octets vérifiés) ; en-têtes CSP sans source externe, `no-referrer`, `no-store`, `noindex` ; limite des jetons invalides (20 / heure / IP) et plafonds d'écriture ; aucun traceur ni mesure d'audience ; la qualification juridique interne d'un incident (« qui paie ») n'est jamais montrée au locataire |

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

**Dernière mise à jour** : 2026-10-14 (traitement n°8 **espace locataire par lien** ; Cloudflare : rôle (3) sans stockage ; Resend à inscrire à l'activation des e-mails). Précédente : 2026-10-13 (traitement n°7 **dictée de l'EDL assistée par IA** + sous-traitant **Mistral AI** ; AIPD recommandée). Plus ancienne : 2026-06-08 (traitement n°6 étendu — **canal de dépôt en ligne** via relais Cloudflare : TTL invitation 7/14/30 j, `ownerToken` hors URL, score jamais calculé/transmis côté relais ; **rapatriement automatisé** documenté — aucune donnée nouvelle collectée ; Cloudflare ajouté aux sous-traitants/destinataires des candidatures)
**Mainteneur** : responsable de traitement ImmoTrack
