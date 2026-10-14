# CDC PROPRYO — Cahier des charges global (référence unique)

**Version 1 — 13/10/2026.** Validé par Didier dans la session de Pilotage (visuels acteurs, communications, cycle de vie, timeline resserrée).
**Remplace** `docs/CDC-V1-LIGHT.md` (périmé). Toute session — pilotage ou chantier — lit ce document **en premier**. Seul le Pilotage le modifie, après validation de Didier.

Sources de preuve : inventaire des interactions établi dans le code le 13/10 (fichiers et lignes cités dans la session de pilotage), `docs/strategie/AUDIT-EN-COURS-2026-10-13.md`, rapports `docs/strategie/DOSSIER-BP/reports/` (pain points, EDL visio / travaux / dossiers, IA business plan et options, audit Locataire.live, audit des solutions d'EDL vidéo, chiffrage).

---

## 1. Vision et principes

**Pourquoi.** Gérer son parc immobilier ne doit pas être un second métier. Propryo vise le bailleur particulier et la SCI familiale qui investissent mais ne veulent pas gérer.

**Principes non négociables**
1. **Propryo agit, le propriétaire valide seulement ce qui l'engage** juridiquement ou financièrement. Tout le reste est automatique.
2. **L'IA lit, la loi décide.** L'IA lit des photos, des documents, la voix ; un moteur de règles déterministe et sourcé décide (qui paie, ce qui est légal). Aucune réponse juridique inventée par une IA générative. L'humain valide toujours.
3. **Jamais de score sur une personne** (candidat, locataire) : uniquement des constats factuels, sourcés et datés (RGPD art. 22, arrêt CJUE SCHUFA C-634/21, AI Act annexe III).
4. **Une seule source pour l'argent** : le dû vient du bail, le payé de la banque ; tout montant est calculé par le moteur Finances, jamais à côté.
5. **Jamais bloquer un enregistrement** : avertir avec le rappel légal, l'utilisateur décide.
6. **Textes légaux cités mot pour mot** avec leur source (Légifrance en priorité).
7. **Données en Europe**, cloisonnées par SCI ; fournisseurs d'IA hébergés dans l'UE.

---

## 2. Acteurs

| Acteur | Aujourd'hui | Cible |
|---|---|---|
| **Propriétaire** (titulaire du compte) | Accès complet à ses structures (nom propre, SCI) | Idem + notifications téléphone, SMS, e-mail |
| **Associé de SCI** (partage) | Invité par SCI, en écriture ou lecture seule ; la lecture seule n'est bloquée que par le serveur (l'écran affiche les boutons) ; aucune alerte reçue | Écran adapté au rôle ; résumé des événements de ses SCI |
| **Co-gérant signataire** | Signe le bail côté bailleur, sur place ou à distance (mécanisme distinct du partage) | Idem |
| **Locataire / colocataire** | Aucun compte ; signe le bail à distance par lien, l'état des lieux sur place ; reçoit ses documents seulement si le propriétaire les partage | **Espace locataire par lien** sans mot de passe : documents, signalement d'incident, messages, accord pour l'électronique |
| **Candidat** | Dépose son dossier sans compte via un lien | Idem + accusés et réponses automatiques, alertes factuelles côté propriétaire |
| **Garant** | Acte de cautionnement imprimé, signé sur papier | **Signature en ligne** (voir § 6.4) |
| **Comptable** | Aucun accès ; reçoit le ZIP transmis par le propriétaire | Dossier annuel envoyé au comptable désigné, validé en 1 clic |
| **Artisan** | N'existe pas | Reçoit la demande d'intervention, dépose devis et facture par lien |
| Tiers (notaire, syndic, diagnostiqueur, assureur) | Données saisies seulement | Inchangé (pas de flux) |

---

## 3. Matrice des droits (cible)

| Domaine | Propriétaire | Associé écriture | Associé lecture | Locataire | Candidat | Garant | Comptable | Artisan |
|---|---|---|---|---|---|---|---|---|
| Biens, diagnostics | Tout | Ses SCI | Voir | — | — | — | — | — |
| Annonces | Tout | Ses SCI | Voir | — | Voir l'annonce | — | — | — |
| Candidatures | Tout | Ses SCI | Voir | — | Son dossier | Ses pièces via le candidat | — | — |
| Bail, avenants | Créer, signer | Ses SCI | Voir | Signer, voir le sien | — | Signer l'acte de cautionnement, recevoir le bail | — | — |
| État des lieux | Créer, signer | Ses SCI | Voir | Signer, compléter sous 10 jours | — | — | — | — |
| Loyers, quittances | Tout | Ses SCI | Voir | Ses quittances | — | Prévenu en cas d'impayé grave | — | — |
| Charges | Tout | Ses SCI | Voir | Son décompte et les justificatifs | — | — | — | — |
| Incidents, travaux | Tout | Ses SCI | Voir | Signaler, suivre les siens | — | — | — | Sa demande, ses devis et factures |
| Finances, 2044 | Tout | Ses SCI | Voir | — | — | — | Dossier annuel | — |
| Partage | Inviter, révoquer | — | — | — | — | — | — | — |

---

## 4. État réel des interactions (13/10/2026, vérifié dans le code)

- **Aucun e-mail n'est envoyé par l'app.** Documents = téléchargement puis partage manuel (copier, mailto, SMS, WhatsApp, QR, partage natif). L'envoi Gmail est du code mort ; `DOC_ENVOI_ACTIF = false`. Les codes de vérification de signature s'affichent à l'écran (relais en mode dev : `EMAIL_MODE="dev"`, `OTP_REQUIRED="false"`).
- **Signature à distance du bail** en service (relais Cloudflare, preuves, certificat) ; relance manuelle de chaque signataire ; le locataire ne reçoit pas automatiquement la copie signée.
- **État des lieux** signé sur place uniquement (canvas).
- **Garant** : acte imprimé, signé sur papier.
- **Banque** : import de fichiers OFX / QFX / XLSX (CSV refusé) ; aucune API bancaire.
- **Données publiques** : INSEE (IRL, automatique 1×/jour), ADEME (DPE de la fiche logement), BAN + Géorisques (détection de l'état des risques uniquement).
- **impots.gouv, Visale, DossierFacile** : liens et rappels, aucune API.
- **Alertes** : uniquement dans l'app, pour la personne connectée (« Ce qui presse », pastilles, agenda) ; aucun envoi aux locataires ni aux associés.
- **Annonces** : texte copiable ou PDF, aucune publication.
- **Abonnements** : table `plans` existante, rien n'applique les quotas ; « Stripe » dans le code désigne le thème graphique.

**Relations fausses à ne jamais écrire** : le candidat n'utilise aucun annuaire (c'est le propriétaire qui vérifie) ; « envoyer une quittance » ≠ e-mail aujourd'hui ; le garant ne signe pas électroniquement aujourd'hui ; co-gérant signataire ≠ associé du partage ; BAN ne sert qu'à l'état des risques.

---

## 5. Communications et automatisation (cible)

### 5.1 Canaux
| Canal | Usage | Prérequis |
|---|---|---|
| Dans l'app | Centre de notifications, pastilles, « Ce qui presse » | Existant |
| Notification push | Téléphone, app installée (Android, iPhone) | Web push |
| E-mail | Envoyé par Propryo depuis propryo.fr, avec un lien | Activer Resend + domaine |
| SMS | Codes, urgences, relances importantes (coût à inclure dans les formules) | Prestataire (Octopush prévu) |
| Espace locataire | Lien sans mot de passe : documents, incidents, messages | À construire |
| Recommandé | Lettre recommandée électronique qualifiée ou postale, pour les actes | Prestataire à choisir (valeur juridique à vérifier) |
| Partage manuel | Copier, WhatsApp : reste possible, n'est plus obligatoire | Existant |

### 5.2 Niveaux d'automatisation
- **Automatique** : tout ce qui informe ou met un document à disposition sans engager le propriétaire.
- **Préparé, validé en 1 clic** : tout ce qui engage juridiquement ou financièrement (hausse IRL, régularisation, mise en demeure, congé, commande à un artisan, envoi au comptable).
- **Le propriétaire décide** : ce que Propryo ne peut pas faire à sa place (déclaration d'occupation sur impots.gouv).

### 5.3 Catalogue des événements
| Événement | Ce que fait Propryo | Pour | Canaux | Niveau |
|---|---|---|---|---|
| Loyer reçu | Quittance générée, déposée, e-mail « disponible » avec lien | Locataire | Espace, e-mail | Auto (accord du locataire) |
| Loyer non reçu J+5 | Relance amiable ; alerte propriétaire | Locataire, propriétaire | E-mail, SMS, push | Auto |
| Impayé J+30 | Mise en demeure préparée, chiffrée ; garant prévenu | Propriétaire, locataire, garant | Recommandé, e-mail | 1 clic |
| Bail signé par tous | Copie signée à chaque signataire | Locataire, garant, propriétaire | Espace, e-mail | Auto |
| État des lieux signé | Copie + rappel du délai de 10 jours | Locataire | Espace, e-mail | Auto |
| Anniversaire IRL | Lettre préparée M-1 ; le propriétaire peut renoncer | Propriétaire, locataire | Push, espace, e-mail | 1 clic |
| Régularisation des charges | Décompte préparé ; justificatifs mis à disposition | Propriétaire, locataire | Espace, e-mail | 1 clic |
| Assurance habitation expirée | Demande de nouvelle attestation, relance | Locataire | Espace, e-mail, SMS | Auto |
| Entretien chaudière dû | Rappel au locataire, dépôt de l'attestation | Locataire | Espace, e-mail | Auto |
| Incident signalé | Accusé ; propriétaire prévenu avec « qui paie » ; urgence par SMS | Locataire, propriétaire | Espace, push, SMS | Auto |
| Intervention à commander | Demande à l'artisan choisi ; devis et facture par lien | Propriétaire, artisan | E-mail | 1 clic |
| Dossier candidat reçu | Notification ; accusé au candidat | Propriétaire, candidat | Push, e-mail | Auto |
| Candidat non retenu | Message courtois ; suppression des données à 30 jours | Candidat | E-mail | 1 clic |
| Congé à délivrer | Acte avec délais légaux | Propriétaire, locataire | Recommandé | 1 clic |
| Changement d'occupant | Rappel de la déclaration d'occupation, informations préparées | Propriétaire | App, push | Le propriétaire décide |
| Activité sur une SCI partagée | Résumé des événements | Associés | App, e-mail | Auto |
| Clôture de l'année | Lien vers le dossier comptable | Comptable, propriétaire | E-mail | 1 clic |

### 5.4 Obligations légales liées
- **Quittance dématérialisée** : avec l'accord exprès du locataire (recueilli à la signature du bail) ; quittance gratuite sur demande.
- **Congé du bailleur** : lettre recommandée avec AR, acte de commissaire de justice ou remise en main propre contre récépissé.
- **Justificatifs de charges** : tenus à disposition 6 mois après le décompte.

---

## 6. Cycle de vie d'une location

| Étape | Aujourd'hui | Cible | Règle légale clé |
|---|---|---|---|
| 1. Le bien | Création guidée, acte notarié (PDF texte), DPE ADEME, risques Géorisques, partage SCI | Pré-remplissage complet depuis l'adresse ; lecture IA des actes scannés | Location interdite : G depuis 01/01/2025, F au 01/01/2028, E au 01/01/2034 |
| 2. Mise en location | Annonce conforme (copie, PDF) | Annonces « facilitées » (texte et photos prêts), pas de publication automatique ; rappel du gel F/G | Mentions obligatoires ; loyer gelé F/G depuis 24/08/2022 |
| 3. Candidatures | Lien de dépôt, tri, complément, refus, conversion | Pièces de la liste légale, avertissement hors liste, alertes factuelles, étude IA des pièces, avis d'imposition vérifié (2D-Doc), suppression réelle à 30 jours | Décret 2015-1437 ; amende jusqu'à 3 000 € / 15 000 € |
| 4. Bail et signature | Contrat type 2026, annexes, signature à distance, cautionnement papier | Codes e-mail/SMS actifs, copie automatique, accord pour l'électronique, cautionnement signé en ligne | Contrat type (décret 2026-596) depuis le 01/10/2026 |
| 5. Entrée | État des lieux photo signé sur place ; rappel de déclaration d'occupation | **État des lieux dicté à la voix** (IA), copie automatique, rappel des 10 jours, demande d'attestation d'assurance | Complément sous 10 jours (art. 3-2 loi 1989) |
| 6. Chaque mois | Dû / encaissé, quittance si payé, relances | Synchro bancaire, quittance auto, relances auto, mise en demeure 1 clic | Quittance gratuite ; électronique avec accord exprès |
| 7. Chaque année | IRL M-1 non rétroactive, régularisation, entretiens, Finances, 2044, export | Envois validés en 1 clic, justificatifs dans l'espace, rappel d'entretien au locataire, envoi au comptable | Révision 1×/an, non rétroactive, réclamable dans l'année (art. 17-1) |
| 8. Incidents et travaux | Rien de dédié | **Registre, « qui paie » avec la loi, artisans, preuves, coût dans Finances, tri des photos par IA** | Réparations locatives (décret 87-712), le reste au bailleur sauf faute |
| 9. Fin de bail | Congés, EDL de sortie comparé, vétusté, solde de tout compte | Congé en recommandé électronique, coûts de remise en état proposés | Restitution 1 mois / 2 mois ; pénalité 10 % du loyer par mois de retard (art. 22) |
| 10. Relocation | Vacant signalé, rappel de déclaration d'occupation | Annonce relancée en 1 clic | Déclaration des occupants (amende 150 € par local) |

### 6.4 Acte de cautionnement signé en ligne — conditions légales (vérifiées sur Légifrance le 13/10/2026)
- **Art. 22-1 loi 89-462** : la caution personne physique signe un acte faisant apparaître le montant du loyer et les conditions de sa révision, la reproduction de l'avant-dernier alinéa de l'article, et **appose la mention prévue par l'article 2297 du Code civil** ; le bailleur **remet à la caution un exemplaire du bail**.
- **Art. 2297 C. civ.** (réforme 2021) : mention **« apposée par la caution elle-même »** (plus nécessairement manuscrite) indiquant le **montant maximal garanti**.
- **Conséquences produit** : la caution **saisit elle-même** sa mention (jamais pré-remplie), vérification d'identité par code, remise automatique du bail à la caution, signature électronique avec preuves.
- **À corriger d'abord** : validité de l'acte en colocation (désignation du colocataire garanti) — relevé par l'audit, à confirmer.

---

## 7. IA

| Brique | Ce que fait l'IA | Ce que décide la règle / l'humain | Fournisseur |
|---|---|---|---|
| État des lieux à la voix — **en production (v15.733)** | Transcrit le commentaire par pièce, propose état et observation par élément, lit les compteurs | L'utilisateur accepte, modifie ou ignore chaque ligne ; les deux parties signent | Mistral (Voxtral + Small), UE |
| Étude des dossiers candidats — **2D-Doc + indices en production (v15.741), lecture IA des bulletins livrée éteinte** | Lit les bulletins (OCR, page 1) ; règles de cohérence | Constats factuels sourcés ; signature 2D-Doc vérifiée sur l'appareil ; annuaire des entreprises ; aucun score ; le propriétaire décide (`docs/CDC-VERIF-DOCUMENTS.md`) | Mistral OCR, point d'accès UE |
| Incidents — **en production (v15.738)** | Aide le locataire puis l'artisan à décrire ; constat neutre | Moteur « qui paie » sourcé, affiché seulement à la fin ; le propriétaire valide (`docs/CDC-INCIDENT-CIRCUIT.md`) | Mistral, UE |
| EDL filmé — **codé, désactivé (v15.735)** jusqu'aux premiers clients ; sortie comparée et copilote financier plus tard | Extrait de la vidéo les photos de chaque élément | Validation humaine | Mistral Small (vision), UE |

**Garde-fous** : mention « proposé par l'IA, à vérifier » (AI Act art. 50, en vigueur depuis le 02/08/2026) ; clé jamais dans le navigateur (route authentifiée du relais) ; audio et images non conservés après traitement sauf preuve voulue par l'utilisateur ; aucun contenu dans les journaux ; quotas par compte ; analyse d'impact RGPD avec l'avocat avant l'ouverture publique.

### 7.1 Composante R&D (retour SEMIA du 14/10/2026)

Ce qui est de l'**intégration** (pas de la R&D) : branchement des modèles Mistral, vérification 2D-Doc selon la spécification publique, appels d'annuaires, règles arithmétiques.

Ce qui relève de la **recherche** (résultat incertain ; base d'un dossier d'aide ou d'incubateur) :
1. **Lecture robuste du code 2D-Doc sur photo de téléphone** (flou, perspective, faible contraste) : les lecteurs libres échouent au-delà d'une certaine dégradation.
2. **Extraction fiable sur des bulletins de paie hétérogènes** avec mesure d'incertitude, pour s'abstenir plutôt que produire un faux écart.
3. **Détection d'altérations sans code officiel** (structure PDF, compression d'image) avec un taux de faux positifs maîtrisé.
4. **Comparaison automatique entrée / sortie à partir des vidéos d'état des lieux** (même élément, changement d'état).
5. **Présentation non scorante** : montrer qu'un ensemble de constats ne fonctionne pas comme un score de fait.

Protocole d'évaluation (corpus 100 % synthétique, jeu figé, seuils fixés à l'avance : 0 faux « valide » 2D-Doc, faux positifs ≤ 2 % par pièce) : `docs/CDC-VERIF-DOCUMENTS.md` §7.

---

## 8. Travaux : le circuit d'un incident

1. Signalement (par le propriétaire aujourd'hui ; par le locataire avec l'espace locataire).
2. **Qui paie ?** Verdict du moteur avec le texte cité ; « à arbitrer » dans les zones grises.
3. Si à la charge du locataire : il est informé, rappel de son assurance habitation (assistance).
4. Si à la charge du bailleur : **carnet d'artisans** (alimenté par les interventions passées) → sinon **recherche dans l'annuaire officiel des entreprises** par métier et commune, actives seulement ; **RGE ADEME** pour l'énergie → en urgence, **numéro d'assistance** de l'assurance habitation du locataire ou PNO du bailleur.
5. Garde-fous : devis obligatoire avant intervention, mise en garde sur les arnaques au dépannage. Propryo **liste**, ne recommande pas ; pas de réseau maison ni de commission.
6. Preuves (photos, devis, facture), statut, **coût envoyé dans Finances** (dépense du bien, part déductible).

---

## 9. Timeline (resserrée, validée le 13/10/2026)

| Période | Pilotage | Chantier Dossiers | Chantier IA et EDL | Chantier Travaux | Chantier Plateforme |
|---|---|---|---|---|---|
| Mi-octobre | Tests au vert, intégration « Bail en cours » et « Règles », 3 failles de sécurité, ménage, CDC | Candidatures conformes (lots 1-2 faits) | Socle IA Mistral | — | — |
| Fin octobre – mi-novembre | Intégrations au fil de l'eau | Lecture IA des pièces, alertes | EDL dicté à la voix | Incidents, « qui paie », artisans, Finances | — |
| Fin novembre | Idem | Avis d'imposition 2D-Doc | Idem | Tri IA des photos | Formules, essai, paiement ; e-mails et codes activés |
| **Décembre 2026** | **Bêta privée, 10 testeurs, avec les 3 IA** | — | — | — | — |
| T1 2027 | **Lancement public** | — | EDL vidéo, sortie comparée | — | Espace locataire, envois automatiques, SMS, push, recommandé, synchro bancaire, cautionnement en ligne |
| T2–T3 2027 | — | — | Copilote financier | — | Annonces facilitées, associés et comptable prévenus |
| T4 2027 | Décision sur l'offre aux professionnels (critères chiffrés) | | | | |

**Échéances extérieures** : 23/11/2026 fin de l'encadrement des loyers (sauf prolongation) · 01/01/2027 coefficient DPE électricité 1,7 · 01/09/2027 émission de facture électronique pour les PME · 02/12/2027 règles « haut risque » de l'AI Act · 01/01/2028 location interdite des logements F.

**Conditions** : clé Mistral fournie par Didier ; validations de maquette sous 48 h ; 3 failles de sécurité corrigées avant la bêta ; avocat et analyse d'impact RGPD lancés en parallèle ; bêta limitée aux 10 testeurs informés.

---

## 10. Organisation : le réseau de sessions

- **Pilotage** (Opus) : seul intégrateur de `main`, seul à modifier ce CDC et `BACKLOG.md`, numérote les versions (main + 1 à chaque intégration), distribue le travail, relaie les maquettes à Didier et transmet ses GO.
- **Chantiers par domaine** (Opus) : Dossiers, IA et EDL, Travaux, Plateforme. Chacun dans son worktree et sa branche, avec son prompt (`PROMPT-CHANTIER-*.md`), s'arrête à la maquette, livre une branche poussée et un rapport.
- **Tâches mécaniques** (Haiku / Sonnet) : tests datés, ménage des branches, mises à jour de documents.
- **Fable** : uniquement la relecture ciblée des parties argent, migrations et droits d'accès, suppressions, signature ; jamais pour développer.
- Communication : le Pilotage lance et relance les chantiers, qui lui rendent la main ; aucune session ne pousse sur `main`.

---

## 11. Décisions arrêtées et hors périmètre

- Pas de micro-entreprise : société dès le départ.
- Pas de score sur les candidats ; pas de fichier de mauvais payeurs.
- Pas de publication automatique des annonces (option lointaine via partenariats payants).
- Pas de réseau d'artisans maison ni de commission sur les interventions.
- Pas de banque intégrée.
- Déclaration d'occupation : rappel et préparation seulement (pas d'API impots.gouv).
- Pas de pourcentage de rentabilité affiché dans l'app.
