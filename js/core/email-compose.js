/**
 * core/email-compose.js — Infrastructure commune de proposition de mails sortants
 *
 * EMAIL-AUTO V1 (mode "proposition" — pas d'envoi backend).
 * Génère un brouillon de mail à partir d'un type + contexte, retournant
 * un objet {to, cc, subject, body, attachments, legalNote} prêt à être
 * consommé par js/components/email-modal.js (mailto:, clipboard, share).
 *
 * Pattern : helpers purs (pas de dépendance DB / DOM), exposés via window
 * pour les onclick inline d'index-test.html (cf. js/main.js pattern shadow).
 *
 * 10 types supportés V1 :
 *   quittance, avis-echeance, rappel-impaye-1, rappel-impaye-2, rappel-impaye-3,
 *   irl-revision, mrh-renouvellement, bail-signe-final, convocation-edl-sortie,
 *   decompte-regul-annuel.
 *
 * Mode V2 SaaS (envoi auto via SendGrid/Postmark) — hors scope V1.
 */

import { escHtml } from './utils.js';

// ────────────────────────────────────────────────────────────────────────────
// Templates inline (V1) — un par type. Variables interpolées : {{path.to.value}}
// ────────────────────────────────────────────────────────────────────────────

const TEMPLATES = {
  // ─── Quittance mensuelle ────────────────────────────────────────────────
  quittance: {
    subject: 'Quittance de loyer {{quittance.mois}} — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Vous trouverez ci-joint la quittance de loyer pour le mois de {{quittance.mois}} relatif au logement situé {{bail.adrBien}}.

Détail :
- Loyer hors charges : {{quittance.hc}} €
- Provisions sur charges : {{quittance.ch}} €
- Total perçu : {{quittance.total}} €

Pour toute question, n'hésitez pas à revenir vers nous.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'Quittance-{{quittance.mois}}-{{logement.ref}}.pdf', type: 'pdf' }
    ],
    legalNote: ''
  },

  // ─── Avis d'échéance (J-5 avant paiement) ──────────────────────────────
  'avis-echeance': {
    subject: 'Avis d\'échéance — Loyer {{periode}} — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Nous vous rappelons que votre loyer pour la période {{periode}} sera prélevé / à régler le {{dateEcheance}}.

Détail :
- Loyer hors charges : {{bail.hc}} €
- Provisions sur charges : {{bail.ch}} €
- Total dû : {{montant}} €

Coordonnées de paiement :
- IBAN : {{entite.iban}}
- BIC : {{entite.bic}}
- Référence à indiquer : Loyer {{periode}} {{logement.ref}}

Merci de bien vouloir effectuer ce règlement dans les délais.

Cordialement,
{{entite.gerant}}`,
    attachments: [],
    legalNote: ''
  },

  // ─── Rappel impayé n°1 (amical, J+5) ───────────────────────────────────
  'rappel-impaye-1': {
    subject: 'Rappel — Loyer {{periode}} non perçu',
    body: `Bonjour {{locataire.civNom}},

Sauf erreur ou règlement en cours de validation, nous n'avons pas réceptionné votre loyer pour la période {{periode}} (montant dû : {{montant}} €).

Il s'agit peut-être d'un simple oubli. Merci de régulariser dans les meilleurs délais ou de nous communiquer la date de paiement prévue.

Si le règlement a déjà été effectué, merci d'ignorer ce message.

Coordonnées de paiement :
- IBAN : {{entite.iban}}
- Référence : Loyer {{periode}} {{logement.ref}}

Cordialement,
{{entite.gerant}}`,
    attachments: [],
    legalNote: ''
  },

  // ─── Rappel impayé n°2 (ferme, J+15) ───────────────────────────────────
  'rappel-impaye-2': {
    subject: 'Relance — Loyer impayé {{periode}} — {{bail.adrBien}}',
    body: `{{locataire.civNom}},

Malgré notre précédent rappel, votre loyer pour la période {{periode}} (montant : {{montant}} €) demeure impayé à ce jour.

Cette situation ne peut perdurer. Nous vous demandons de régulariser sous 15 jours à compter de la réception de ce message.

À défaut de paiement ou de proposition d'échelonnement de votre part, nous serons contraints d'engager la procédure prévue à l'article 24 de la loi n° 89-462 du 6 juillet 1989 (mise en demeure par lettre recommandée, commandement de payer par huissier, puis assignation devant le tribunal).

Nous restons à votre disposition pour étudier toute solution amiable (étalement, plan de paiement).

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Conserver une trace écrite (mail + accusé lecture). Avant LRAR, proposer une dernière fois un règlement amiable.'
  },

  // ─── Rappel impayé n°3 (mise en demeure, J+30) ─────────────────────────
  'rappel-impaye-3': {
    subject: 'MISE EN DEMEURE — Loyer impayé {{periode}} — {{bail.adrBien}}',
    body: `Lettre recommandée avec accusé de réception
(et copie par email)

{{locataire.civNom}}
{{bail.adrBien}}

Objet : Mise en demeure de payer — Loyer {{periode}}

{{locataire.civNom}},

Malgré nos relances des {{rappel1Date}} et {{rappel2Date}}, nous constatons que votre loyer de la période {{periode}} d'un montant de {{montant}} € reste à ce jour impayé.

Par la présente, nous vous mettons en demeure de procéder au règlement intégral de la somme due dans un délai de huit (8) jours à compter de la réception de cette lettre.

À défaut de règlement dans ce délai, nous serons contraints :
1. de faire signifier par huissier de justice un commandement de payer visant la clause résolutoire du bail (art. 24 loi n° 89-462 du 6/7/1989),
2. puis, le cas échéant, de saisir le tribunal judiciaire en vue de la résiliation du bail et de votre expulsion.

Nous restons disposés à étudier toute proposition de règlement amiable ou de plan d'apurement de la dette.

Veuillez agréer, {{locataire.civNom}}, l'expression de nos salutations distinguées.

Fait à {{entite.siege}}, le {{dateLettre}}.

{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'OBLIGATOIRE : envoyer en lettre recommandée avec accusé de réception (LRAR). L\'email seul ne suffit pas juridiquement. Conserver les preuves d\'envoi et de réception.'
  },

  // ─── Révision IRL (annuelle) ───────────────────────────────────────────
  'irl-revision': {
    subject: 'Révision annuelle du loyer (IRL) — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Conformément à l'article 17-1 de la loi n° 89-462 du 6 juillet 1989 et à la clause de révision figurant à votre bail, nous vous informons de la révision annuelle du loyer de votre logement situé {{bail.adrBien}}.

Détail (cf. lettre détaillée en pièce jointe) :
- Loyer hors charges actuel : {{ancienHC}} €
- Nouveau loyer hors charges : {{nouveauHC}} €
- Application : à compter du mois de {{moisApplication}}

Les charges restent inchangées à {{bail.ch}} €/mois.

Pour toute question, n'hésitez pas à revenir vers nous.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'Lettre-revision-IRL-{{logement.ref}}.pdf', type: 'pdf' }
    ],
    legalNote: 'La révision n\'est valable que pour les bails non gelés (DPE ≠ F/G — loi Climat 2021 art. 23).'
  },

  // ─── Renouvellement MRH ────────────────────────────────────────────────
  'mrh-renouvellement': {
    subject: 'Renouvellement assurance habitation (MRH) — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

L'attestation d'assurance habitation actuellement en notre possession pour le logement {{bail.adrBien}} arrive à échéance le {{dateFinMRH}}.

Conformément à l'article 7g de la loi n° 89-462 du 6 juillet 1989, vous avez l'obligation de souscrire une assurance habitation (responsabilité civile locative au minimum) pendant toute la durée du bail.

Merci de bien vouloir nous transmettre votre nouvelle attestation MRH avant le {{dateFinMRH}}, par retour de mail (PDF ou photo lisible suffit).

À défaut de réception dans les délais, et conformément à votre contrat, nous serions contraints de souscrire une assurance pour votre compte et de vous en répercuter le coût.

Cordialement,
{{entite.gerant}}`,
    attachments: [],
    legalNote: 'Obligation légale (art. 7g loi 1989). Conserver la nouvelle attestation dans la fiche logement.'
  },

  // ─── Bail signé (envoi copie finale) ───────────────────────────────────
  'bail-signe-final': {
    subject: 'Bail signé — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Nous vous remercions pour la signature de votre bail concernant le logement situé {{bail.adrBien}}.

Vous trouverez en pièce jointe :
- Le contrat de bail signé (PDF)
- L'état des lieux d'entrée (PDF, si déjà réalisé)
- La notice d'information (annexe obligatoire)

Quelques informations pratiques :
- Date de prise d'effet : {{bail.debut}}
- Loyer mensuel : {{montant}} € (hors charges {{bail.hc}} € + charges {{bail.ch}} €)
- Date de paiement : le {{bail.jpay}} de chaque mois
- Dépôt de garantie : {{bail.dg}} € (reçu)

N'oubliez pas de souscrire votre assurance habitation (obligation légale) et de nous en transmettre l'attestation dans les meilleurs délais.

Bienvenue dans votre nouveau logement.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'Bail-{{logement.ref}}-signe.pdf', type: 'pdf' },
      { name: 'EDL-entree-{{logement.ref}}.pdf', type: 'pdf' }
    ],
    legalNote: 'Conserver une copie signée + accusé de réception (envoi recommandé ou remise en main propre avec signature locataire).'
  },

  // ─── Convocation EDL sortie ────────────────────────────────────────────
  'convocation-edl-sortie': {
    subject: 'Convocation — État des lieux de sortie — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Suite à votre préavis de départ du logement situé {{bail.adrBien}}, nous vous proposons de procéder à l'état des lieux de sortie le :

  {{dateEDL}} à {{heureEDL}}
  Sur place : {{bail.adrBien}}

Votre présence (ou celle d'un mandataire muni d'une procuration écrite) est requise pour la signature contradictoire de l'état des lieux, conformément à l'article 3-2 de la loi n° 89-462 du 6 juillet 1989.

Merci de bien vouloir :
- Confirmer votre disponibilité par retour de mail
- Restituer toutes les clés du logement (incluant boîte aux lettres, garage, cave)
- Fournir le relevé des compteurs (eau, gaz, électricité) si vous avez la main dessus
- Avoir effectué les éventuelles réparations locatives à votre charge

À défaut de présence et sans manifestation de votre part, l'état des lieux pourra être réalisé par huissier à vos frais (art. 3-2 al. 4 loi 1989).

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Sans présence du locataire, EDL par huissier à ses frais (art. 3-2 loi 1989). Possibilité de RDV en deux temps si besoin.'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // v15.09 Sprint 10 V1.1 — EMAIL-AUTO extension cycle locataire complet
  // 19 nouveaux types : signature bail, entrée locataire, vie du bail,
  // évolution, fin de bail, sortie/solde.
  // ═══════════════════════════════════════════════════════════════════════

  // ─── PHASE SIGNATURE BAIL ──────────────────────────────────────────────

  'bail-pret-a-signer': {
    subject: 'Votre bail est prêt à être signé — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Le projet de bail concernant le logement situé {{bail.adrBien}} est prêt à être signé.

Détail principal :
- Date de prise d'effet : {{bail.debut}}
- Durée : {{dureeBail}}
- Loyer hors charges : {{bail.hc}} €/mois
- Provisions sur charges : {{bail.ch}} €/mois
- Dépôt de garantie : {{bail.dg}} €

Vous trouverez en pièce jointe le projet de bail complet à relire. Merci de bien vouloir nous transmettre vos éventuelles questions / remarques avant la signature.

La signature aura lieu le {{dateSignature}}{{lieuSignatureTxt}}.

Documents à apporter le jour de la signature :
- Pièce d'identité en cours de validité
- Justificatif de domicile de moins de 3 mois
- Attestation MRH (assurance habitation) ou engagement de la souscrire avant entrée
- Acte de cautionnement signé par le(s) garant(s) le cas échéant

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'Projet-bail-{{logement.ref}}.pdf', type: 'pdf' }
    ],
    legalNote: 'Conserver une trace de l\'envoi du projet (sert de preuve d\'information préalable du locataire).'
  },

  'cautionnement-signe': {
    subject: 'Acte de cautionnement bien reçu — {{bail.adrBien}}',
    body: `Bonjour {{garant.civNom}},

Nous accusons réception de l'acte de cautionnement signé par vos soins en garantie des obligations locatives de {{locataire.civNom}} pour le logement situé {{bail.adrBien}}.

Cet acte engage votre solidarité au paiement des loyers, charges, et éventuelles indemnités d'occupation, dans les limites définies par le document signé.

Vous trouverez en pièce jointe une copie de l'acte cautionnement.

Pour rappel, vous pouvez à tout moment :
- Demander un point sur la situation locative (état des règlements)
- Mettre fin au cautionnement à durée indéterminée par lettre recommandée (avec préavis prévu à l'acte)

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'Cautionnement-{{logement.ref}}.pdf', type: 'pdf' }
    ],
    legalNote: 'Conservation de l\'acte original 5 ans après la fin du bail (prescription).'
  },

  'bail-avenant': {
    subject: 'Avenant à votre bail — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Nous vous transmettons en pièce jointe un avenant à votre bail concernant le logement {{bail.adrBien}}.

Objet de l'avenant : {{motifAvenant}}

Date d'application proposée : {{dateApplication}}

Merci de bien vouloir :
- Relire attentivement l'avenant
- Le signer dans les meilleurs délais (signature manuscrite ou électronique)
- Nous retourner un exemplaire signé

L'avenant ne modifie aucune autre clause du bail initial.

À votre disposition pour toute question avant signature.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'Avenant-{{logement.ref}}-{{dateApplication}}.pdf', type: 'pdf' }
    ],
    legalNote: 'L\'avenant doit être accepté explicitement (signé). Sans signature, le bail initial reste applicable.'
  },

  // ─── PHASE ENTRÉE LOCATAIRE ────────────────────────────────────────────

  'edl-convocation-entree': {
    subject: 'Convocation — État des lieux d\'entrée — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Nous vous donnons rendez-vous pour l'état des lieux d'entrée du logement situé {{bail.adrBien}} :

  Date : {{dateEDL}}
  Heure : {{heureEDL}}
  Sur place : {{bail.adrBien}}

Conformément à l'article 3-2 de la loi n° 89-462 du 6 juillet 1989, cet état des lieux contradictoire et écrit sera annexé à votre bail. Il décrit précisément l'état du logement et des équipements à votre entrée — il servira de référence à la sortie pour évaluer d'éventuelles dégradations.

Merci de :
- Confirmer votre disponibilité par retour de mail
- Prévoir 1 à 2 heures pour un examen détaillé pièce par pièce
- Vous munir d'une pièce d'identité
- Avoir souscrit votre assurance habitation (obligation art. 7g loi 1989) — apporter l'attestation

Si vous êtes empêché, vous pouvez vous faire représenter par un mandataire muni d'une procuration écrite.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Sans EDL contradictoire, présomption en faveur du locataire (logement loué en bon état art. 1731 Code civil) → grave perte pour le bailleur.'
  },

  'edl-entree-signe': {
    subject: 'État des lieux d\'entrée signé — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Vous trouverez en pièce jointe l'état des lieux d'entrée signé conjointement le {{dateEDL}} pour le logement situé {{bail.adrBien}}.

Ce document constitue la **référence officielle** de l'état du logement et de ses équipements à votre entrée.

Relevé des compteurs à votre entrée :
- Électricité : {{compteurElec}}
- Gaz : {{compteurGaz}}
- Eau froide : {{compteurEauF}}
- Eau chaude : {{compteurEauC}}

Conservez bien ce document — il sera comparé à l'état des lieux de sortie pour évaluer d'éventuelles réparations à votre charge.

Si vous constatez une anomalie non mentionnée dans les 10 jours suivant votre entrée, vous pouvez nous demander une révision par écrit (article 3-2 alinéa 5 loi 1989).

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'EDL-entree-{{logement.ref}}.pdf', type: 'pdf' }
    ],
    legalNote: 'Le locataire a 10 jours après son entrée pour demander la modification de l\'EDL. Au-delà, l\'EDL est figé.'
  },

  'bienvenue-infos-pratiques': {
    subject: 'Bienvenue ! Informations pratiques — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Bienvenue dans votre nouveau logement {{bail.adrBien}}.

Voici quelques informations pratiques pour vous installer sereinement :

📡 RACCORDEMENTS
- Électricité : à mettre en service à votre nom auprès du fournisseur de votre choix
- Gaz : idem (si applicable)
- Eau : {{contactEau}}
- Internet / TV / Téléphone : opérateurs au choix (logement éligible {{technologiesDispo}})

🚮 ORDURES MÉNAGÈRES
- Jour de collecte ordures : {{jourCollecteOM}}
- Jour de collecte tri sélectif : {{jourCollecteTri}}
- Local poubelles : {{localPoubelles}}

🏢 COPROPRIÉTÉ / VOISINAGE
- Syndic : {{syndic}}
- Règlement de copropriété : disponible sur demande
- Contacts utiles voisins / gardien : {{contactGardien}}

🚨 EN CAS D'URGENCE
- Coupure générale eau / gaz / élec : {{contactUrgence}}
- Dégât des eaux : appeler immédiatement votre assurance + nous prévenir
- Incendie : 18 (pompiers) puis nous prévenir

🛡 OBLIGATIONS RAPPEL
- Assurance habitation (MRH) à souscrire avant entrée si pas encore fait
- Entretien chaudière annuel à organiser par vos soins (si chauffage gaz/fioul/bois)
- Détecteur de fumée à entretenir (pile à remplacer)

Pour toute question, n'hésitez pas à nous contacter par mail ou téléphone.

Bonne installation et excellente vie dans votre nouveau logement.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: ''
  },

  'dg-recu': {
    subject: 'Confirmation réception dépôt de garantie — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Nous accusons bonne réception du dépôt de garantie d'un montant de {{bail.dg}} € versé le {{dateVersement}} pour le logement {{bail.adrBien}}.

Ce dépôt de garantie sera conservé pendant toute la durée du bail et restitué dans les conditions prévues par l'article 22 de la loi du 6 juillet 1989 :
- Délai de 1 mois si EDL de sortie sans dégradation par rapport à l'EDL d'entrée
- Délai de 2 mois si dégradations constatées (et arrêté de comptes copro non encore disponible)

Le dépôt de garantie est rémunéré uniquement dans certaines conditions très restrictives (non applicable dans la majorité des baux d'habitation classiques).

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Date de versement à conserver pour le calcul du délai de restitution. Si paiement par chèque, attendre encaissement effectif.'
  },

  // ─── PHASE VIE DU BAIL — DEMANDES ATTESTATIONS / NOTIFICATIONS ─────────

  'demande-attest-entretien-chauffage': {
    subject: 'Demande d\'attestation d\'entretien chauffage {{annee}} — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Conformément à l'article R224-31 du Code de l'environnement et au décret n° 2009-649 du 9 juin 2009, l'entretien annuel de la chaudière du logement {{bail.adrBien}} est à votre charge.

Pour {{annee}}, nous n'avons pas encore reçu votre attestation d'entretien. Merci de bien vouloir nous la transmettre dès que possible (PDF ou photo lisible du certificat d'entretien).

Cette attestation doit être remise par le professionnel ayant réalisé l'intervention. Elle est obligatoire et engage votre responsabilité civile (assurance habitation) en cas d'incident lié au chauffage.

Si l'entretien n'a pas encore été réalisé pour cette année, merci de prévoir l'intervention dans les meilleurs délais et de nous transmettre le justificatif ensuite.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Obligation locataire (décret 2009-649). À conserver dans la fiche logement.'
  },

  'demande-attest-mrh': {
    subject: 'Renouvellement attestation d\'assurance habitation — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

L'attestation d'assurance habitation actuellement en notre possession arrive à échéance le {{dateFinMRH}}.

Conformément à l'article 7g de la loi n° 89-462 du 6 juillet 1989, vous avez l'obligation de souscrire et maintenir une assurance habitation (responsabilité civile locative au minimum) pendant toute la durée du bail.

Merci de nous transmettre votre nouvelle attestation MRH avant le {{dateFinMRH}}, par retour de mail (PDF ou photo lisible).

À défaut de réception dans les délais, nous serions contraints, conformément à votre contrat, de souscrire une assurance pour votre compte et de vous en répercuter le coût majoré de 10 % (art. 7g).

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Obligation art. 7g loi 1989. Sans MRH, le bail peut être résilié à torts du locataire.'
  },

  'notification-travaux-a-venir': {
    subject: 'Notification de travaux à venir — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Nous vous informons que des travaux vont être réalisés dans / sur le logement situé {{bail.adrBien}} :

Nature des travaux : {{natureTravaux}}
Date de début : {{dateDebut}}
Durée estimée : {{dureeEstimee}}
Intervenant : {{intervenant}}

{{detailContexte}}

Conformément à l'article 7e de la loi n° 89-462 du 6 juillet 1989, le locataire est tenu de laisser exécuter les travaux d'amélioration des parties communes ou des parties privatives, ainsi que les travaux nécessaires au maintien en état et à l'entretien normal des locaux loués.

Si les travaux durent plus de 21 jours ouvrés, vous pouvez prétendre à une réduction proportionnelle de loyer (art. 1724 Code civil).

Pour tout aménagement de planning, contactez-nous au plus tôt.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Préavis raisonnable (8 jours minimum recommandé sauf urgence). Réduction loyer obligatoire si > 21 jours ouvrés.'
  },

  'notification-visite': {
    subject: 'Demande de créneau pour visite — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Nous aurions besoin d'accéder au logement {{bail.adrBien}} pour : {{motifVisite}}

Nous vous proposons les créneaux suivants :
- {{creneau1}}
- {{creneau2}}
- {{creneau3}}

Merci de nous indiquer celui qui vous conviendrait, ou de nous proposer un autre créneau si aucun ne fonctionne.

Conformément à la jurisprudence (article 9 loi 1989 + Cass. civ. 3e), l'accès au logement loué nécessite votre accord préalable, sauf en cas d'urgence (dégât des eaux, incendie, etc.).

Nous restons à votre disposition.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Sans accord du locataire = violation de domicile. Toujours négocier un créneau, sauf urgence avérée.'
  },

  // ─── PHASE ÉVOLUTION / FIN DE BAIL ─────────────────────────────────────

  'bail-renouvellement-3ans': {
    subject: 'Renouvellement de votre bail — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Votre bail concernant le logement {{bail.adrBien}} arrive à son terme initial le {{dateFin}}.

Conformément à l'article 10 de la loi n° 89-462 du 6 juillet 1989, sauf congé donné dans les formes légales par l'une ou l'autre des parties, votre bail sera **tacitement reconduit** pour une nouvelle période de 3 ans (ou 1 an pour un bail meublé) aux mêmes conditions.

Nous restons à votre disposition pour toute discussion concernant cette reconduction.

{{noteRevisionLoyer}}

Bonne continuation dans votre logement.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Tacite reconduction = mêmes conditions financières. Pour modifier le loyer en renouvellement, suivre la procédure encadrée art. 17-2 loi 1989 (préavis 6 mois + références).'
  },

  'bail-conge-bailleur-6mois': {
    subject: 'Congé pour {{motifConge}} — {{bail.adrBien}}',
    body: `Lettre recommandée avec accusé de réception
(et copie par email)

{{locataire.civNom}}
{{bail.adrBien}}

Objet : Congé pour {{motifConge}} — Bail du {{bail.debut}}

{{locataire.civNom}},

Conformément aux articles 15-I et 15-II de la loi n° 89-462 du 6 juillet 1989, je vous donne par la présente congé du logement {{bail.adrBien}} que je vous loue depuis le {{bail.debut}}, pour le motif suivant :

{{motifDetail}}

Le présent congé prend effet au terme du bail, soit le {{dateFin}}.

Le préavis légal de 6 mois (pour un bail nu) ou 3 mois (pour un meublé) avant cette date est respecté.

Vous trouverez ci-joint, le cas échéant, les pièces justifiant le motif allégué (offre de vente, justificatif de reprise pour un proche, etc.) conformément à la loi.

Conformément à l'article 15-II, vous bénéficiez d'un droit de préemption en cas de congé pour vente. Le présent congé vaut offre de vente aux conditions précisées en annexe.

Veuillez agréer, {{locataire.civNom}}, l'expression de mes salutations distinguées.

Fait à {{entite.siege}}, le {{dateLettre}}.

{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'OBLIGATOIRE : LRAR ou signification par huissier ou remise en main propre contre récépissé. Mentionner précisément le motif (vente, reprise pour soi/proche, motif sérieux et légitime). Joindre justificatifs.'
  },

  'bail-preavis-recu': {
    subject: 'Accusé de réception de votre préavis — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Nous accusons bonne réception de votre préavis de départ du logement situé {{bail.adrBien}}, daté du {{datePreavis}}.

Conformément à votre courrier et à la loi du 6 juillet 1989 :
- Type de bail : {{typeBail}}
- Durée du préavis : {{dureePreavis}} mois
- Date d'effet : {{dateFinPreavis}}
- Motif (si réduit) : {{motifReduction}}

Nous vous proposons de procéder à l'état des lieux de sortie à proximité de cette date :
- Date proposée : {{dateEDLSortie}}
- Heure : {{heureEDLSortie}}

Merci de :
- Confirmer cette date ou nous proposer une alternative
- Restituer toutes les clés (logement, boîte aux lettres, garage, cave, parties communes)
- Effectuer les éventuelles réparations locatives à votre charge avant l'EDL
- Préparer votre nouvelle adresse pour le solde de tout compte

Le dépôt de garantie ({{bail.dg}} €) vous sera restitué selon les délais légaux après EDL de sortie.

Nous vous remercions pour ces années de bail et vous souhaitons une bonne suite.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Conserver le préavis original (papier ou email). Le délai de préavis court à compter de la réception par le bailleur (cachet de la Poste).'
  },

  // ─── PHASE SORTIE / SOLDE ───────────────────────────────────────────────

  'edl-sortie-signe': {
    subject: 'État des lieux de sortie signé — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Vous trouverez en pièce jointe l'état des lieux de sortie signé conjointement le {{dateEDL}} pour le logement situé {{bail.adrBien}}.

Synthèse :
- Comparatif compteurs entrée / sortie : {{comparatifCompteurs}}
- Dégradations constatées : {{degradationsBilan}}

{{conclusionEDL}}

Le solde de votre dépôt de garantie sera traité dans les délais légaux (1 mois si pas de dégradation, 2 mois si dégradations à déduire).

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'EDL-sortie-{{logement.ref}}.pdf', type: 'pdf' }
    ],
    legalNote: 'Si désaccord sur l\'EDL → noter les réserves sur le document avant signature OU refuser de signer (constat par huissier à demander dans ce cas).'
  },

  'dg-restitution-integrale': {
    subject: 'Restitution intégrale de votre dépôt de garantie — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Suite à l'état des lieux de sortie du {{dateEDLSortie}} qui n'a fait apparaître aucune dégradation par rapport à l'entrée, nous vous restituons l'intégralité de votre dépôt de garantie.

Montant restitué : {{bail.dg}} €
Mode : virement bancaire
IBAN destinataire : {{ibanLocataire}}
Date prévue du virement : {{dateRestitution}}

Conformément à l'article 22 de la loi n° 89-462 du 6 juillet 1989, ce remboursement intervient dans le délai légal d'un mois suivant la restitution des clés.

Nous vous souhaitons une bonne suite et restons à votre disposition pour toute attestation utile (logement libéré, etc.).

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Délai 1 mois suivant remise des clés. Au-delà, pénalité de 10 % du loyer par mois de retard entamé (loi ALUR).'
  },

  'dg-restitution-partielle': {
    subject: 'Restitution partielle de votre dépôt de garantie — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Suite à l'état des lieux de sortie du {{dateEDLSortie}}, certaines dégradations ont été constatées et nécessitent une retenue sur votre dépôt de garantie.

Décompte :
- Dépôt de garantie initial : {{bail.dg}} €
- Retenues détaillées (factures / devis joints) :
{{detailRetenues}}
- Total retenu : {{montantRetenu}} €
- Solde restitué : {{soldeRestitue}} €

Le solde sera viré sur le compte suivant :
- IBAN : {{ibanLocataire}}
- Date prévue du virement : {{dateRestitution}}

Vous trouverez en pièce jointe les factures / devis justifiant les retenues, conformément à l'article 22 de la loi du 6 juillet 1989.

Le délai légal de restitution est de 2 mois suivant l'EDL de sortie lorsque des retenues sont effectuées.

Si vous souhaitez contester un poste, merci de nous adresser un courrier motivé sous 15 jours.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Justificatifs OBLIGATOIRES (factures, devis détaillés). Retenue sans justif = irrecevable juridiquement et passible de la pénalité 10 %/mois.'
  },

  'solde-tout-compte': {
    subject: 'Solde de tout compte final — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

À la suite de la sortie du logement {{bail.adrBien}}, nous établissons ci-dessous le solde de tout compte final :

Crédits (sommes en votre faveur) :
- Dépôt de garantie : {{bail.dg}} €
- Trop-perçu charges (régul annuelle) : {{tropPercuCharges}} €
- Autre : {{autresCredits}} €
Total crédit : {{totalCredit}} €

Débits (sommes restant à votre charge) :
- Loyer impayé : {{loyerImpaye}} €
- Charges restant dues : {{chargesDues}} €
- Retenues sur DG (réparations) : {{retenuesDG}} €
- Autre : {{autresDebits}} €
Total débit : {{totalDebit}} €

Solde net : {{soldeNet}} € ({{senseSolde}})

{{instructionsReglement}}

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Le solde de tout compte ne peut être imposé. Si le locataire conteste, action en justice possible (Tribunal Judiciaire — 5 ans de prescription).'
  },

  'attestation-logement-libere': {
    subject: 'Attestation officielle — Libération du logement {{bail.adrBien}}',
    body: `ATTESTATION DE LIBÉRATION DE LOGEMENT

Je soussigné(e), {{entite.gerant}}, agissant en qualité de bailleur (ou son mandataire) pour le compte de {{entite.nom}}, atteste par la présente que :

{{locataire.civNom}}, locataire du logement situé {{bail.adrBien}}, a effectivement libéré ledit logement en date du {{dateLiberation}}.

L'état des lieux contradictoire de sortie a été établi le {{dateEDLSortie}}. Les clés ont été remises {{modaliteRemiseClef}}.

Cette attestation est délivrée pour servir et valoir ce que de droit (changement d'adresse, démarches administratives, nouveau bail, etc.).

Fait à {{entite.siege}}, le {{dateAttestation}}.

{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'Utile au locataire pour CAF, employeur, nouveau bailleur, opérateurs téléphoniques, etc. Bonne pratique de la délivrer systématiquement.'
  },

  // ─── Décompte régularisation annuelle ──────────────────────────────────
  'decompte-regul-annuel': {
    subject: 'Décompte de régularisation des charges {{annee}} — {{bail.adrBien}}',
    body: `Bonjour {{locataire.civNom}},

Conformément à l'article 23 de la loi n° 89-462 du 6 juillet 1989, nous vous adressons le décompte de régularisation des charges pour l'année {{annee}} concernant le logement {{bail.adrBien}}.

Synthèse :
- Provisions sur charges versées sur la période : {{provisions}} €
- Charges réelles refacturables (quote-part locataire) : {{chargesReelles}} €
- Solde : {{solde}} € ({{soldeSens}})

Le détail par nature de charge (eau, ordures ménagères, chauffage collectif, entretien des parties communes, etc.) figure dans le décompte joint en PDF.

Vous disposez d'un délai d'un mois à compter de la réception de cette régularisation pour consulter sur place les justificatifs (factures, contrats, décomptes copro) si vous le souhaitez.

{{soldeAction}}

Pour toute question, n'hésitez pas à revenir vers nous.

Cordialement,
{{entite.gerant}}
{{entite.nom}}`,
    attachments: [
      { name: 'Decompte-charges-{{annee}}-{{logement.ref}}.pdf', type: 'pdf' }
    ],
    legalNote: 'Conserver les justificatifs (factures, décomptes copro) à la disposition du locataire pendant 6 mois (art. 23 loi 1989).'
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Interpolation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Résout un chemin "a.b.c" dans context. Retourne undefined si introuvable.
 * @param {object} context
 * @param {string} path
 */
function _resolvePath(context, path) {
  if (context == null) return undefined;
  const parts = String(path).split('.');
  let v = context;
  for (const p of parts) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

/**
 * Interpole un template en remplaçant chaque {{path.to.value}} par sa valeur
 * résolue dans context. Variable absente / null / '' → '(inconnu)'.
 *
 * @param {string} template
 * @param {object} context
 * @param {object} [opts]
 * @param {boolean} [opts.escapeHtml=false] Si true, échappe les valeurs HTML.
 * @returns {string}
 */
export function _interpolateEmail(template, context, opts = {}) {
  if (template == null) return '';
  const escape = opts && opts.escapeHtml === true;
  return String(template).replace(/\{\{([\w.]+)\}\}/g, (_match, path) => {
    const v = _resolvePath(context, path);
    if (v == null || v === '') return '(inconnu)';
    const s = String(v);
    return escape ? escHtml(s) : s;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// API principale
// ────────────────────────────────────────────────────────────────────────────

/**
 * Liste des types supportés en V1.
 * @returns {string[]}
 */
export function _emailTypesSupportes() {
  return Object.keys(TEMPLATES);
}

/**
 * v15.90 EM-3 DOC-CIVILITE — Enrichit ctx.locataire (et ctx.garant) avec des champs
 * dérivés civilité : civNom, civSalut, civilitePolitesse. Idempotent (no-op si déjà set).
 *
 * Mapping civilité court → long :
 *   'M.'  → 'Monsieur'
 *   'Mme' → 'Madame'
 *   ''    → '' (fallback : civNom = nom seul, civSalut = "Madame, Monsieur,")
 *
 * @param {object} ctx
 * @returns {object} ctx enrichi (nouvel objet, ne mute pas l'original)
 */
function _enrichContextCivilite(ctx) {
  if (!ctx || typeof ctx !== 'object') return ctx;
  const enriched = Object.assign({}, ctx);
  for (const key of ['locataire', 'garant']) {
    const p = ctx[key];
    if (!p || typeof p !== 'object') continue;
    const civ = String(p.civilite || '').trim();
    const civLong = civ === 'M.' ? 'Monsieur' : (civ === 'Mme' ? 'Madame' : '');
    const nom = String(p.nom || '').trim();
    enriched[key] = Object.assign({}, p, {
      // civNom : préfixe civilité (long) au nom. Si pas de civilité → juste le nom.
      civNom: p.civNom != null ? p.civNom : ((civLong ? civLong + ' ' : '') + nom).trim() || nom,
      // civSalut : formule d'appel ('Madame,' / 'Monsieur,' / 'Madame, Monsieur,' si genre inconnu)
      civSalut: p.civSalut != null ? p.civSalut : (civLong ? civLong + ',' : 'Madame, Monsieur,'),
      // civilitePolitesse : forme longue seule ('Monsieur' / 'Madame' / '' fallback)
      civilitePolitesse: p.civilitePolitesse != null ? p.civilitePolitesse : civLong
    });
  }
  return enriched;
}

/**
 * Génère un brouillon de mail pour un type donné + contexte.
 *
 * @param {string} type - Type d'email parmi _emailTypesSupportes()
 * @param {object} [context] - Données pour interpolation : { locataire, bail, logement, entite, quittance, montant, periode, ... }
 * @param {object} [opts]
 * @param {boolean} [opts.escapeHtml=false] - Si true, escape HTML les valeurs (utile pour aperçu HTML)
 * @returns {object} { to, cc, subject, body, attachments: [{name, type}], legalNote, error? }
 */
export function _emailCompose(type, context = {}, opts = {}) {
  const tpl = TEMPLATES[type];
  if (!tpl) {
    return {
      to: '',
      cc: '',
      subject: '(type inconnu)',
      body: `Erreur : type d'email "${type}" non supporté. Types disponibles : ${_emailTypesSupportes().join(', ')}.`,
      attachments: [],
      legalNote: '',
      error: 'TYPE_UNKNOWN'
    };
  }

  // v15.90 EM-3 — enrichit locataire + garant avec civNom, civSalut, civilitePolitesse
  const ctx = _enrichContextCivilite(context || {});
  const to = (ctx.locataire && ctx.locataire.email) || ctx.to || '';
  const cc = ctx.cc || '';

  const attachments = (tpl.attachments || []).map(a => ({
    name: _interpolateEmail(a.name, ctx, opts),
    type: a.type
  }));

  return {
    to,
    cc,
    subject: _interpolateEmail(tpl.subject, ctx, opts),
    body: _interpolateEmail(tpl.body, ctx, opts),
    attachments,
    legalNote: tpl.legalNote || ''
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Historique d'envoi (Phase 3) — DB.emailsSent[]
// ────────────────────────────────────────────────────────────────────────────

/**
 * Log un envoi d'email dans DB.emailsSent[]. Ne persiste PAS le body (RGPD :
 * limiter la rétention des données personnelles). Persiste uniquement les
 * métadonnées : type, destinataires, sujet, date, statut, entité liée.
 *
 * Side-effect : si window.DB existe (prod), append + window.saveDB() si dispo.
 * En tests sans DB, retourne juste l'entry construite (pas de persistance).
 *
 * @param {string} entityType - 'logement' | 'bail' | 'entite' | 'quittance' | etc.
 * @param {string} entityId - Référence de l'entité (log.ref, quittance.id, etc.)
 * @param {object} emailData - { type, to, cc, subject, status: 'proposed'|'mailto'|'copied'|'shared' }
 * @returns {object} L'entry créée (id, sentAt, type, to, cc, subject, status, entityType, entityId)
 */
export function _logEmailSent(entityType, entityId, emailData) {
  const data = emailData || {};
  const entry = {
    id: 'em_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type: data.type || '',
    to: data.to || '',
    cc: data.cc || '',
    subject: data.subject || '',
    sentAt: new Date().toISOString(),
    status: data.status || 'proposed',
    entityType: entityType || '',
    entityId: entityId || ''
  };

  // Persistance en prod (window.DB existe).
  if (typeof window !== 'undefined' && window.DB) {
    if (!Array.isArray(window.DB.emailsSent)) window.DB.emailsSent = [];
    window.DB.emailsSent.push(entry);
    if (typeof window.saveDB === 'function') {
      try { window.saveDB(); } catch (_) { /* silent — saveDB peut être bloqué en mode read-only */ }
    }
  }

  return entry;
}

/**
 * Retourne l'historique d'envoi filtré par entityType + entityId.
 * Si pas de paramètres → retourne tout l'historique (copie).
 *
 * @param {string} [entityType]
 * @param {string} [entityId]
 * @param {Array} [emailsSent] - Liste à filtrer (par défaut window.DB.emailsSent ou [])
 * @returns {Array}
 */
export function _getEmailHistory(entityType, entityId, emailsSent) {
  let list;
  if (Array.isArray(emailsSent)) {
    list = emailsSent;
  } else if (typeof window !== 'undefined' && window.DB && Array.isArray(window.DB.emailsSent)) {
    list = window.DB.emailsSent;
  } else {
    list = [];
  }

  if (!entityType && !entityId) return list.slice();

  return list.filter(e => {
    if (entityType && e.entityType !== entityType) return false;
    if (entityId && e.entityId !== entityId) return false;
    return true;
  });
}

