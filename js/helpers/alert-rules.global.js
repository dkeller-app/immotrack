/**
 * alert-rules.global.js — Wrapper browser (window.AlertRules)
 * (GÉNÉRÉ AUTOMATIQUEMENT par tools/sync-helpers-global-mirrors.mjs)
 *
 * ⚠️ NE PAS ÉDITER À LA MAIN. Ce fichier est régénéré depuis :
 *    __tests__/helpers/alert-rules.js
 *
 * Si tu modifies la logique, fais-le côté module ES, exécute :
 *   node tools/sync-helpers-global-mirrors.mjs
 * et commite les deux fichiers ensemble.
 */
(function(global) {
  'use strict';

  /**
   * Module alert-rules — CATALOGUE CANONIQUE des règles d'alertes du dashboard.
   * (DRY-FACTORISATION chantier 1, v15.424 — audit 2026-07-06 : les mêmes règles métier
   * étaient réécrites 2 à 6 fois avec 3 DIVERGENCES avérées entre _computeUnifiedTodo,
   * rAlertsSection et les widgets legacy _buildWidgetV1Legacy.)
   *
   * Décisions de convergence (chaque divergence tranchée ici une fois pour toutes) :
   *  - ASSURANCE HABITATION (ex-« MRH ») manquante : la source est DB.mrh (collection dédiée),
   *    PAS DB.assurances type='MRH locataire' (l'ancienne écriture du widget, divergente).
   *  - RÉGULARISATION à émettre : sémantique du todo (clarifiée par l'utilisateur) = le logement
   *    a perçu des loyers en N-1 ET aucune régularisation n'est émise en année courante N.
   *    (L'ancien widget testait « absente en N OU N-1 » sans condition de location N-1.)
   *  - IRL : classification UNIQUE (applicable / préavis ≤45 j), toujours filtrée sur
   *    !dejaApplique (l'ancienne bannière alertes ne filtrait pas la branche applicable),
   *    avec l'état « lettre envoyée » exposé en DONNÉE (les consommateurs décident du rendu).
   *
   * Règles PURES : aucune lecture de DB/window — tout passe en argument. Les tombstones
   * (_deleted) sont filtrés ici, une fois.
   *
   * Consommé par index.html via js/helpers/alert-rules.global.js (window.AlertRules),
   * GÉNÉRÉ par tools/sync-helpers-global-mirrors.mjs — source unique, pas de copie.
   */

  const alive = x => x && !x._deleted

  const joursEntre = (dateIso, today) => {
    const d = dateIso instanceof Date ? dateIso : new Date(dateIso)
    if (isNaN(d.getTime())) return null
    return Math.round((d - today) / 86400000)
  }

  /** Assurance habitation locataire MANQUANTE (obligatoire, art. 7g loi 89-462).
   *  Source canonique : la collection mrh (PAS assurances). → [{ref, locataire}] */
  function mrhManquante(scopeLogs, mrhList) {
    const list = (mrhList || []).filter(alive)
    return (scopeLogs || [])
      .filter(l => l && l.locataire && !list.some(m => m.logement === l.ref))
      .map(l => ({ ref: l.ref, locataire: l.locataire || '' }))
  }

  /** Échéances des attestations d'assurance habitation (expirées ou < horizon jours).
   *  scopé entité via logements. → [{ref, echeance, jours, expiree}] */
  function mrhEcheances(mrhList, logements, activeEnt, today, horizon = 30) {
    const out = []
    ;(mrhList || []).filter(alive).forEach(m => {
      if (!m.echeance) return
      if (activeEnt) {
        const log = (logements || []).find(l => alive(l) && l.ref === m.logement)
        if (!log || log.entity !== activeEnt) return
      }
      const jours = joursEntre(m.echeance, today)
      if (jours == null) return
      if (jours < 0) out.push({ ref: m.logement, echeance: m.echeance, jours, expiree: true })
      else if (jours <= horizon) out.push({ ref: m.logement, echeance: m.echeance, jours, expiree: false })
    })
    return out
  }

  /** Échéances des assurances propriétaire (PNO & co), portée logement OU immeuble.
   *  → [{label, compagnie, echeance, jours, expiree}] (expirées + < horizon jours) */
  function pnoEcheances(assurances, logements, activeEnt, today, horizon = 30) {
    const out = []
    ;(assurances || []).filter(alive).forEach(a => {
      if (!a.echeance) return
      let label
      if (a.portee === 'immeuble') {
        if (activeEnt && !(logements || []).some(l => alive(l) && l.entity === activeEnt && l.imm === a.immeuble)) return
        label = a.immeuble || '?'
      } else {
        if (activeEnt) {
          const log = (logements || []).find(l => alive(l) && l.ref === a.logement)
          if (!log || log.entity !== activeEnt) return
        }
        label = a.logement
      }
      const jours = joursEntre(a.echeance, today)
      if (jours == null) return
      if (jours < 0) out.push({ label, compagnie: a.compagnie || '', echeance: a.echeance, jours, expiree: true })
      else if (jours <= horizon) out.push({ label, compagnie: a.compagnie || '', echeance: a.echeance, jours, expiree: false })
    })
    return out
  }

  /** Classification IRL CANONIQUE d'une révision calculée (computeIRLRevision).
   *  rev déjà appliquée/renoncée, insuffisante ou pas encore applicable → null.
   *  → {etat:'applicable'|'preavis', jours, lettreEnvoyee, dateLettre, dateAnniv} */
  function irlClassifier(rev, log, today, isoLocal) {
    if (!rev || rev.insuffisant || rev.pasEncoreApplicable || rev.dejaApplique) return null
    const anniv = rev.dateRevision
    if (!anniv) return null
    const jours = joursEntre(anniv, today)
    if (jours == null) return null
    const annivIso = typeof isoLocal === 'function' ? isoLocal(anniv) : String(anniv)
    const lettreEnvoyee = !!(log && log.irlLettreEnvoyee && log.irlLettreEnvoyeePour === annivIso)
    const dateLettre = lettreEnvoyee ? (log.irlLettreEnvoyeeDate || '') : ''
    if (rev.isApplicable && rev.diff !== 0) {
      return { etat: 'applicable', jours, lettreEnvoyee, dateLettre, dateAnniv: annivIso }
    }
    if (jours >= 0 && jours <= 45) {
      return { etat: 'preavis', jours, lettreEnvoyee, dateLettre, dateAnniv: annivIso }
    }
    return null
  }

  /** Régularisation de charges à émettre — sémantique canonique (clarif user) :
   *  logement avec charges, LOYERS PERÇUS en N-1, et AUCUNE régul émise en année courante N.
   *  → [{ref, locataire, annee (N-1), charges}] */
  function regulAEmettre(scopeLogs, mouvements, today, isLoyerCategory) {
    const isLoyer = typeof isLoyerCategory === 'function' ? isLoyerCategory : (c => c === 'Loyers')
    const mvs = (mouvements || []).filter(alive)
    const yrCur = today.getFullYear()
    const yrPrev = yrCur - 1
    return (scopeLogs || [])
      .filter(l => l && l.locataire && (l.ch || 0) > 0)
      .filter(l => mvs.some(m =>
        m.qui === l.ref && isLoyer(m.cat) && (m.cr || 0) > 0 &&
        m.date && m.date.startsWith(String(yrPrev))))
      .filter(l => !mvs.some(m =>
        m.qui === l.ref && m.cat && /r.gularisation/i.test(m.cat) &&
        m.date && m.date.startsWith(String(yrCur))))
      .map(l => ({ ref: l.ref, locataire: l.locataire || '', annee: yrPrev, charges: l.ch || 0 }))
  }

  /** Baux arrivant à terme (expirés ou < horizon jours). → [{ref, locataire, fin, jours, expire}] */
  function bauxEcheance(scopeLogs, today, horizon = 90) {
    const out = []
    ;(scopeLogs || []).filter(l => l && l.fin && l.locataire).forEach(l => {
      const jours = joursEntre(l.fin, today)
      if (jours == null) return
      if (jours < 0) out.push({ ref: l.ref, locataire: l.locataire, fin: l.fin, jours, expire: true })
      else if (jours <= horizon) out.push({ ref: l.ref, locataire: l.locataire, fin: l.fin, jours, expire: false })
    })
    return out.sort((a, b) => a.jours - b.jours)
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.AlertRules = {
    mrhManquante: mrhManquante,
    mrhEcheances: mrhEcheances,
    pnoEcheances: pnoEcheances,
    irlClassifier: irlClassifier,
    regulAEmettre: regulAEmettre,
    bauxEcheance: bauxEcheance
  };
})(typeof window !== 'undefined' ? window : globalThis);
