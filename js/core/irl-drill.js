/**
 * core/irl-drill.js — UX-GROUP-BY-IMMEUBLE drill-downs v15.77
 *
 * Helpers purs pour les drill-downs des KPI d'un groupe d'immeuble IRL :
 * - liste enrichie des lots (ref, locataire, statut)
 * - delta cumulé des révisions applicables (Σ (nouveau - actuel))
 * - liste des lots en alerte (DPE F/G gelé, index manquant, DPE manquant)
 * - projection annuelle revenu HC
 *
 * Tests Vitest miroir : __tests__/helpers/irl-drill.test.js
 */

/**
 * Calcule le delta total des révisions IRL applicables du groupe.
 * Pour chaque lot avec rev applicable, somme (nouveauHC - hc).
 * @param {object[]} logements
 * @param {(log:object)=>object|null} computeRevisionFn
 * @returns {number} delta en € HC arrondi 2 décimales
 */
export function _irlDeltaImm(logements, computeRevisionFn) {
  if (!Array.isArray(logements) || typeof computeRevisionFn !== 'function') return 0;
  let delta = 0;
  for (const l of logements) {
    if (!l) continue;
    const rev = computeRevisionFn(l);
    if (!rev || !rev.isApplicable || rev.dejaApplique) continue;
    if (typeof rev.nouveauHC === 'number' && typeof l.hc === 'number') {
      delta += rev.nouveauHC - l.hc;
    }
  }
  return Math.round(delta * 100) / 100;
}

/**
 * Renvoie la liste des lots en alerte pour cet immeuble, avec leur type.
 * @param {object[]} logements
 * @param {(log:object)=>object|null} computeRevisionFn
 * @returns {{ref:string, locataire:string, type:'gel'|'dpeManquant'|'insuffisant', detail:string}[]}
 */
export function _irlListAlertes(logements, computeRevisionFn) {
  if (!Array.isArray(logements) || typeof computeRevisionFn !== 'function') return [];
  const out = [];
  for (const l of logements) {
    if (!l) continue;
    const rev = computeRevisionFn(l);
    if (!rev) continue;
    if (rev.gelDpeFG) {
      out.push({ ref: l.ref, locataire: l.locataire || '', type: 'gel',
        detail: `DPE ${rev.dpe || 'F/G'} — loi Climat 2021 art. 23` });
    } else if (rev.dpeManquant) {
      out.push({ ref: l.ref, locataire: l.locataire || '', type: 'dpeManquant',
        detail: 'DPE non renseigné dans le bail' });
    } else if (rev.insuffisant) {
      out.push({ ref: l.ref, locataire: l.locataire || '', type: 'insuffisant',
        detail: `Index IRL ${rev.missingKey || ''} manquant en table` });
    }
  }
  return out;
}

/**
 * Projection annuelle = loyer HC mensuel × 12 (arrondi 2 décimales).
 * @param {number} loyerMensuelHC
 * @returns {number}
 */
export function _irlProjectionAnnuelle(loyerMensuelHC) {
  if (typeof loyerMensuelHC !== 'number' || !isFinite(loyerMensuelHC)) return 0;
  return Math.round(loyerMensuelHC * 12 * 100) / 100;
}

/**
 * Liste les lots du groupe avec leur statut IRL résumé pour affichage drill.
 * @param {object[]} logements
 * @param {(log:object)=>object|null} computeRevisionFn
 * @returns {{ref:string, locataire:string, hc:number, statut:string, nouveauHC:number|null}[]}
 */
export function _irlListLotsForDrill(logements, computeRevisionFn) {
  if (!Array.isArray(logements)) return [];
  return logements.filter(l => l && l.ref).map(l => {
    const rev = (typeof computeRevisionFn === 'function') ? computeRevisionFn(l) : null;
    let statut = '—';
    let nouveauHC = null;
    if (rev) {
      if (rev.gelDpeFG) statut = `🔒 Gelé DPE ${rev.dpe || 'F/G'}`;
      else if (rev.dpeManquant) statut = '📋 DPE manquant';
      else if (rev.insuffisant) statut = `⚠ Index ${rev.missingKey || ''} manquant`;
      else if (rev.pasEncoreApplicable) statut = '⏳ Bail < 1 an';
      else if (rev.dejaApplique) statut = '✅ Appliquée';
      else if (rev.isApplicable) {
        statut = '✓ Applicable';
        if (typeof rev.nouveauHC === 'number') nouveauHC = Math.round(rev.nouveauHC * 100) / 100;
      } else statut = '⏱ À venir';
    } else statut = '⚠ Bail incomplet';
    return {
      ref: l.ref,
      locataire: l.locataire || '',
      hc: typeof l.hc === 'number' ? l.hc : 0,
      statut,
      nouveauHC,
    };
  });
}
