/**
 * core/gestion-dg-impayes.js — GESTION DG & IMPAYÉS v15.12 Sprint 12 V1.1
 *
 * Helpers purs (sans DB / DOM) pour :
 *   1. Tracking du dépôt de garantie (DG) : versé/dû/délai légal restitution
 *   2. Plan d'apurement (saisie échéances + tracking paiement)
 *   3. Procédure judiciaire (commandement huissier → assignation → jugement)
 *
 * Cadre légal :
 *   - Délai restitution DG : 1 mois (sans dégradation EDL sortie) ou 2 mois (avec retenue)
 *     - Loi 89-462 art. 22 modifiée par loi ALUR 2014
 *     - Au-delà du délai : pénalité 10% du loyer/mois entamé à charge bailleur
 *   - Procédure impayés :
 *     - LRAR mise en demeure → 8 jours
 *     - Commandement de payer par huissier (art. 24 loi 1989) → 2 mois
 *     - Assignation tribunal → jugement → expulsion
 *
 * Tests Vitest miroir : __tests__/helpers/gestion-dg-impayes.test.js
 */

// ────────────────────────────────────────────────────────────────────────────
// Bloc A — Gestion DG
// ────────────────────────────────────────────────────────────────────────────

const DG_STATUS = {
  MANQUANT: 'manquant',          // DG dû mais non versé
  PARTIEL:  'partiel',            // versé < dû
  COMPLET:  'complet',            // versé >= dû
  A_RESTITUER: 'a_restituer',     // bail clôturé, DG à restituer dans délai
  RESTITUE: 'restitue',           // DG restitué (intégral ou partiel)
  EN_RETARD: 'en_retard'          // bail clôturé, délai légal dépassé
};

/**
 * Calcule le statut DG d'un bail.
 * @param {object} bail - { dg, dgPaid, dgDateVersement, dgRestitueAt, cloture, finEffective }
 * @param {Date|string} [dateRef=today]
 * @returns {{ statut, dgDu, dgPaid, soldeRestant, joursRestants?, joursRetard? }}
 */
export function _dgStatut(bail, dateRef) {
  if (!bail) return { statut: DG_STATUS.MANQUANT, dgDu: 0, dgPaid: 0, soldeRestant: 0 };
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  const dgDu = Number(bail.dg) || 0;
  const dgPaid = Number(bail.dgPaid) || 0;
  const soldeRestant = dgDu - dgPaid;

  if (bail.dgRestitueAt) {
    return { statut: DG_STATUS.RESTITUE, dgDu, dgPaid, soldeRestant: 0 };
  }

  // Bail clôturé (fin effective passée) → analyse délai restitution
  if (bail.cloture && bail.finEffective) {
    const finDate = new Date(bail.finEffective + 'T23:59:59');
    if (!Number.isNaN(finDate.getTime())) {
      const delaiMois = _calculerDelaiRestitution(bail);
      const dateLimite = new Date(finDate);
      dateLimite.setMonth(dateLimite.getMonth() + delaiMois);
      const joursRestants = Math.floor((dateLimite.getTime() - today.getTime()) / 86400000);
      if (joursRestants < 0) {
        return { statut: DG_STATUS.EN_RETARD, dgDu, dgPaid, soldeRestant, joursRetard: -joursRestants, delaiMois };
      }
      return { statut: DG_STATUS.A_RESTITUER, dgDu, dgPaid, soldeRestant, joursRestants, delaiMois };
    }
  }

  // Bail actif
  if (dgPaid <= 0 && dgDu > 0) return { statut: DG_STATUS.MANQUANT, dgDu, dgPaid, soldeRestant };
  if (dgPaid < dgDu) return { statut: DG_STATUS.PARTIEL, dgDu, dgPaid, soldeRestant };
  return { statut: DG_STATUS.COMPLET, dgDu, dgPaid, soldeRestant: 0 };
}

/**
 * Calcule le délai légal de restitution DG selon l'EDL de sortie.
 * Loi 89-462 art. 22 modifiée par ALUR 2014.
 *
 * @param {object} bail
 * @param {Array} [edls] - DB.edl pour chercher l'EDL sortie (optionnel)
 * @returns {1|2} - 1 mois si EDL sortie sans retenue, 2 mois sinon
 */
export function _calculerDelaiRestitution(bail, edls) {
  if (!bail) return 2;
  // Si le bail a une indication explicite de dégradations → 2 mois
  if (Number(bail.dgRetenu) > 0) return 2;
  // Si l'EDL sortie a des dégradations comparées à entrée → 2 mois
  const edlSortie = (edls||[]).find(e => e && !e._deleted && e.logement === bail.ref && e.type === 'Sortie');
  if (edlSortie) {
    const hasDegradation = (edlSortie.pieces||[]).some(p =>
      (p.elements||[]).some(el =>
        el.etatS && el.etatS !== el.etatE && (el.etatS === 'Mauvais état' || (el.etatS === 'État d\'usage' && el.etatE === 'Bon état'))
      )
    );
    if (hasDegradation) return 2;
  }
  return 1;
}

/**
 * Calcule le solde de restitution DG = DG versé - retenues - loyers impayés.
 * @param {object} bail
 * @param {Array} mouvements
 * @returns {{ dgPaid, retenuesDG, loyerImpaye, soldeRestitue }}
 */
export function _calculerSoldeDG(bail, mouvements) {
  if (!bail) return { dgPaid: 0, retenuesDG: 0, loyerImpaye: 0, soldeRestitue: 0 };
  const dgPaid = Number(bail.dgPaid) || 0;
  const retenuesDG = Number(bail.dgRetenu) || 0;
  // Loyers impayés depuis le début du bail
  const loyerImpaye = _calculerLoyerImpayeCumule(bail, mouvements);
  const soldeRestitue = Math.max(0, dgPaid - retenuesDG - loyerImpaye);
  return { dgPaid, retenuesDG, loyerImpaye, soldeRestitue };
}

/** Cumul des loyers impayés sur toute la durée du bail.
 *  @param dateRef optional — borne supérieure (= today si non fourni). Permet
 *  des tests déterministes. */
function _calculerLoyerImpayeCumule(bail, mouvements, dateRef) {
  if (!bail || !bail.debut) return 0;
  const debut = new Date(bail.debut + 'T00:00:00');
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  const fin = bail.finEffective ? new Date(bail.finEffective + 'T23:59:59') :
              bail.fin ? new Date(bail.fin + 'T23:59:59') : today;
  if (Number.isNaN(debut.getTime())) return 0;
  const nbMois = Math.max(0, (fin.getFullYear()-debut.getFullYear())*12 + (fin.getMonth()-debut.getMonth()) + 1);
  const loyerMensuel = (Number(bail.hc)||0) + (Number(bail.ch)||0);
  const attendu = nbMois * loyerMensuel;
  const ref = bail.ref;
  const encaisse = (mouvements||[]).filter(m =>
    m && !m._deleted && m.qui === ref && (m.cr||0) > 0
  ).reduce((s,m) => s + (Number(m.cr)||0), 0);
  return Math.max(0, attendu - encaisse);
}

// ────────────────────────────────────────────────────────────────────────────
// Bloc B — Plan d'apurement
// ────────────────────────────────────────────────────────────────────────────

/**
 * Statut d'un plan d'apurement.
 * @param {object} plan - { dateDebut, montantTotal, echeances:[{date, montant, paye}] }
 * @param {Date|string} [dateRef]
 * @returns {{ statut: 'a_jour'|'retard'|'termine'|'aucun', montantPaye, montantDu, prochaineEcheance, retardJours }}
 */
export function _planApurementStatut(plan, dateRef) {
  if (!plan || !Array.isArray(plan.echeances) || !plan.echeances.length) {
    return { statut: 'aucun', montantPaye: 0, montantDu: 0, prochaineEcheance: null, retardJours: 0 };
  }
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  let montantPaye = 0, montantDu = 0;
  let prochaineEcheance = null, retardJours = 0;
  for (const ech of plan.echeances) {
    if (!ech) continue;
    montantDu += Number(ech.montant) || 0;
    if (ech.paye) {
      montantPaye += Number(ech.montant) || 0;
    } else {
      // Première échéance non payée → prochaine
      if (!prochaineEcheance) {
        prochaineEcheance = ech.date;
        const dEch = new Date(ech.date + 'T23:59:59');
        if (!Number.isNaN(dEch.getTime())) {
          const j = Math.floor((today.getTime() - dEch.getTime()) / 86400000);
          if (j > 0) retardJours = j;
        }
      }
    }
  }
  if (montantPaye >= montantDu && montantDu > 0) {
    return { statut: 'termine', montantPaye, montantDu, prochaineEcheance: null, retardJours: 0 };
  }
  if (retardJours > 0) {
    return { statut: 'retard', montantPaye, montantDu, prochaineEcheance, retardJours };
  }
  return { statut: 'a_jour', montantPaye, montantDu, prochaineEcheance, retardJours: 0 };
}

// ────────────────────────────────────────────────────────────────────────────
// Bloc B — Procédure judiciaire
// ────────────────────────────────────────────────────────────────────────────

const PROCEDURE_ETAT = {
  AUCUNE:              'aucune',
  MISE_EN_DEMEURE:     'mise_en_demeure',     // LRAR envoyée
  COMMANDEMENT_PAYER:  'commandement_payer',  // huissier (art. 24 loi 1989)
  ASSIGNATION:         'assignation',          // tribunal
  JUGEMENT:            'jugement',             // jugement rendu (résiliation + expulsion)
  CLOTUREE:            'cloturee'              // procédure terminée (paiement / expulsion effective)
};

/**
 * Détermine l'état actuel de la procédure judiciaire selon les dates renseignées.
 * @param {object} procedure - { miseEnDemeureDate, commandementDate, assignationDate, jugementDate, clotureDate }
 * @returns {{ etat: string, prochaineSemainesAttente?: number, nbJoursDernEtape?: number }}
 */
export function _procedureJudiciaireEtat(procedure, dateRef) {
  if (!procedure) return { etat: PROCEDURE_ETAT.AUCUNE };
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  // État = dernière étape franchie
  let etat = PROCEDURE_ETAT.AUCUNE;
  let derniereDate = null;
  if (procedure.miseEnDemeureDate)    { etat = PROCEDURE_ETAT.MISE_EN_DEMEURE;     derniereDate = procedure.miseEnDemeureDate; }
  if (procedure.commandementDate)     { etat = PROCEDURE_ETAT.COMMANDEMENT_PAYER;  derniereDate = procedure.commandementDate; }
  if (procedure.assignationDate)      { etat = PROCEDURE_ETAT.ASSIGNATION;         derniereDate = procedure.assignationDate; }
  if (procedure.jugementDate)         { etat = PROCEDURE_ETAT.JUGEMENT;            derniereDate = procedure.jugementDate; }
  if (procedure.clotureDate)          { etat = PROCEDURE_ETAT.CLOTUREE;            derniereDate = procedure.clotureDate; }

  const out = { etat };
  if (derniereDate) {
    const dD = new Date(derniereDate + 'T00:00:00');
    if (!Number.isNaN(dD.getTime())) {
      out.nbJoursDernEtape = Math.floor((today.getTime() - dD.getTime()) / 86400000);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Bloc B — Vue agrégée impayés actifs
// ────────────────────────────────────────────────────────────────────────────

/**
 * Liste les baux avec impayés actifs, triés par ancienneté + montant.
 * @param {Array} logements
 * @param {object} baux
 * @param {Array} mouvements
 * @param {Date|string} [dateRef]
 * @returns {Array<{ref, locataire, montantImpaye, ancienneteJours, dernierPaiement, statut}>}
 */
export function _listerImpayesActifs(logements, baux, mouvements, dateRef) {
  const today = dateRef instanceof Date ? dateRef : new Date(String(dateRef||new Date().toISOString().slice(0,10)) + 'T00:00:00');
  const out = [];
  for (const l of (logements||[])) {
    if (!l || l._deleted || l.archived || !l.locataire) continue;
    const bail = baux && baux[l.ref];
    if (!bail || bail.cloture) continue;
    const impayeCumule = _calculerLoyerImpayeCumule(bail, mouvements, today);
    if (impayeCumule < 1) continue;
    // Dernier paiement reçu
    const paiements = (mouvements||[])
      .filter(m => m && !m._deleted && m.qui === l.ref && (m.cr||0) > 0 && m.date)
      .sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const dernierPaiement = paiements.length ? paiements[0].date : null;
    // Ancienneté = jours depuis le 1er impayé non couvert
    const debut = bail.debut ? new Date(bail.debut + 'T00:00:00') : null;
    let ancienneteJours = 0;
    if (debut) {
      const lastPay = dernierPaiement ? new Date(dernierPaiement + 'T00:00:00') : debut;
      ancienneteJours = Math.floor((today.getTime() - lastPay.getTime()) / 86400000);
    }
    // Statut basé sur l'ancienneté + montant cumulé
    let statut = 'recent';
    if (ancienneteJours > 90) statut = 'critique';
    else if (ancienneteJours > 45) statut = 'serieux';
    else if (ancienneteJours > 15) statut = 'a_relancer';
    // Si procédure judiciaire en cours, statut surchargé
    const proc = bail.procedure ? _procedureJudiciaireEtat(bail.procedure, today) : null;
    if (proc && proc.etat !== PROCEDURE_ETAT.AUCUNE) {
      statut = 'procedure_' + proc.etat;
    }
    out.push({
      ref: l.ref,
      locataire: l.locataire,
      montantImpaye: impayeCumule,
      ancienneteJours,
      dernierPaiement,
      statut,
      procedureEtat: proc ? proc.etat : PROCEDURE_ETAT.AUCUNE
    });
  }
  // Tri : procédure judiciaire avancée d'abord, puis ancienneté décroissante
  const procRank = { jugement:5, assignation:4, commandement_payer:3, mise_en_demeure:2, cloturee:1, aucune:0 };
  out.sort((a,b) => {
    const ra = procRank[a.procedureEtat] || 0;
    const rb = procRank[b.procedureEtat] || 0;
    if (rb !== ra) return rb - ra;
    return b.ancienneteJours - a.ancienneteJours;
  });
  return out;
}

// Exports utilitaires
export { DG_STATUS, PROCEDURE_ETAT };
