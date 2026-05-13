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
    body: `Bonjour {{locataire.nom}},

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
    body: `Bonjour {{locataire.nom}},

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
    body: `Bonjour {{locataire.nom}},

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
    body: `{{locataire.nom}},

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

{{locataire.nom}}
{{bail.adrBien}}

Objet : Mise en demeure de payer — Loyer {{periode}}

{{locataire.nom}},

Malgré nos relances des {{rappel1Date}} et {{rappel2Date}}, nous constatons que votre loyer de la période {{periode}} d'un montant de {{montant}} € reste à ce jour impayé.

Par la présente, nous vous mettons en demeure de procéder au règlement intégral de la somme due dans un délai de huit (8) jours à compter de la réception de cette lettre.

À défaut de règlement dans ce délai, nous serons contraints :
1. de faire signifier par huissier de justice un commandement de payer visant la clause résolutoire du bail (art. 24 loi n° 89-462 du 6/7/1989),
2. puis, le cas échéant, de saisir le tribunal judiciaire en vue de la résiliation du bail et de votre expulsion.

Nous restons disposés à étudier toute proposition de règlement amiable ou de plan d'apurement de la dette.

Veuillez agréer, {{locataire.nom}}, l'expression de nos salutations distinguées.

Fait à {{entite.siege}}, le {{dateLettre}}.

{{entite.gerant}}
{{entite.nom}}`,
    attachments: [],
    legalNote: 'OBLIGATOIRE : envoyer en lettre recommandée avec accusé de réception (LRAR). L\'email seul ne suffit pas juridiquement. Conserver les preuves d\'envoi et de réception.'
  },

  // ─── Révision IRL (annuelle) ───────────────────────────────────────────
  'irl-revision': {
    subject: 'Révision annuelle du loyer (IRL) — {{bail.adrBien}}',
    body: `Bonjour {{locataire.nom}},

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
    body: `Bonjour {{locataire.nom}},

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
    body: `Bonjour {{locataire.nom}},

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
    body: `Bonjour {{locataire.nom}},

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

  // ─── Décompte régularisation annuelle ──────────────────────────────────
  'decompte-regul-annuel': {
    subject: 'Décompte de régularisation des charges {{annee}} — {{bail.adrBien}}',
    body: `Bonjour {{locataire.nom}},

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

  const ctx = context || {};
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

