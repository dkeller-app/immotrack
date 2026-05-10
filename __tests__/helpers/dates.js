/**
 * Helpers de dates — version testable extraite (sandbox tests)
 *
 * ⚠️ IMPORTANT : ces helpers sont des STUBS pour démarrer le TDD.
 * Tant qu'index.html n'expose pas ses helpers en modules ES6,
 * on développe ici la spec attendue puis on porte le code dans index.html.
 *
 * Workflow TDD :
 * 1. Écrire le test dans __tests__/helpers/dates.test.js
 * 2. Faire évoluer ces stubs jusqu'à ce que les tests passent
 * 3. Quand BUG-DASH-001 sera attaqué : porter ces helpers dans index.html
 *    (à la même API exacte → les tests continueront à servir de référence)
 *
 * Voir : docs/subjects/BUG-DASH-001.md
 */

/**
 * Retourne le loyer HC en vigueur dans un bail à une date donnée.
 *
 * Logique :
 *   - Parcourir bail.revisions[] triées par date d'application (ascendante)
 *   - Retourner la révision la plus récente dont la date <= dateRef
 *   - Si aucune révision applicable → bail.hc (loyer initial)
 *
 * @param {object} bail - Objet bail avec champs .hc et .revisions[]
 * @param {string|Date} dateRef - Date de référence (ISO string ou Date)
 * @returns {number} Loyer HC en vigueur à cette date
 *
 * @example
 *   const bail = { hc: 650, revisions: [
 *     { date: '2025-01-01', nouveauHC: 665.4 }
 *   ]}
 *   _loyerHCAtDate(bail, '2024-06-15')  // 650 (avant révision)
 *   _loyerHCAtDate(bail, '2025-03-15')  // 665.4 (après révision)
 */
export function _loyerHCAtDate (bail, dateRef) {
  if (!bail) return 0
  if (!Array.isArray(bail.revisions) || bail.revisions.length === 0) {
    return Number(bail.hc) || 0
  }

  const refTs = new Date(dateRef).getTime()
  if (Number.isNaN(refTs)) return Number(bail.hc) || 0

  // Filtrer les révisions applicables (date <= refTs) et trier desc
  const applicables = bail.revisions
    .filter(r => new Date(r.date).getTime() <= refTs)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (applicables.length === 0) {
    return Number(bail.hc) || 0
  }

  return Number(applicables[0].nouveauHC) || Number(bail.hc) || 0
}

/**
 * Retourne les charges en vigueur dans un bail à une date donnée.
 * Même logique que _loyerHCAtDate mais sur le champ `ch`.
 *
 * @param {object} bail
 * @param {string|Date} dateRef
 * @returns {number}
 */
export function _chargesAtDate (bail, dateRef) {
  if (!bail) return 0
  if (!Array.isArray(bail.revisions) || bail.revisions.length === 0) {
    return Number(bail.ch) || 0
  }

  const refTs = new Date(dateRef).getTime()
  if (Number.isNaN(refTs)) return Number(bail.ch) || 0

  const applicables = bail.revisions
    .filter(r => new Date(r.date).getTime() <= refTs && 'nouvelleCH' in r)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (applicables.length === 0) {
    return Number(bail.ch) || 0
  }

  return Number(applicables[0].nouvelleCH) || Number(bail.ch) || 0
}

/**
 * Vérifie si un bail est actif à une date donnée.
 *
 * @param {object} bail - { debut, fin }
 * @param {string|Date} dateRef
 * @returns {boolean}
 */
export function _bailEstActif (bail, dateRef) {
  if (!bail || !bail.debut) return false
  const refTs = new Date(dateRef).getTime()
  const debutTs = new Date(bail.debut).getTime()
  if (Number.isNaN(refTs) || Number.isNaN(debutTs)) return false
  if (debutTs > refTs) return false
  if (!bail.fin) return true // bail sans fin = actif
  const finTs = new Date(bail.fin).getTime()
  return finTs >= refTs
}

/**
 * Vérifie si un bail tombe sous le gel IRL loi Climat 2021 (DPE F ou G).
 *
 * @param {object} bail - { dpe }
 * @returns {boolean}
 */
export function _bailGelIRL (bail) {
  if (!bail) return false
  return bail.dpe === 'F' || bail.dpe === 'G'
}
