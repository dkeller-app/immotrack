/**
 * Helpers temporels dashboard — BUG-DASH-001 Sprint 1D
 *
 * Réplique fidèle (test) des helpers _bailEstActifAt et _loyerHCAtDate
 * portés dans index-test.html (ligne ~5985 après v14.83).
 *
 * Schéma : log.{ref, hc, ch, debut, fin} + DB.irlHistorique[] global.
 */

function _isAliveTest(o) {
  // En test, on simule _isAlive : pas de tombstone (renvoie true tout le temps).
  return !o || !o._deleted;
}

export function _bailEstActifAt(log, dateRef) {
  if (!log || !log.debut) return false;
  const refStr = String(dateRef);
  const refTs = new Date(refStr + (refStr.length === 10 ? 'T00:00:00' : '')).getTime();
  const debutTs = new Date(log.debut + 'T00:00:00').getTime();
  if (Number.isNaN(refTs) || Number.isNaN(debutTs)) return false;
  if (debutTs > refTs) return false;
  if (!log.fin) return true;
  const finTs = new Date(log.fin + 'T23:59:59').getTime();
  return finTs >= refTs;
}

export function _loyerHCAtDate(log, dateRef, irlHistorique = []) {
  if (!log) return 0;
  const refStr = String(dateRef);
  const refTs = new Date(refStr + (refStr.length === 10 ? 'T00:00:00' : '')).getTime();
  if (Number.isNaN(refTs)) return Number(log.hc) || 0;
  const hist = (irlHistorique || [])
    .filter(h => _isAliveTest(h) && h.ref === log.ref && h.action !== 'renonciation' && h.dateRevision);
  if (!hist.length) return Number(log.hc) || 0;
  const sorted = hist.slice().sort((a, b) => a.dateRevision.localeCompare(b.dateRevision));
  if (refTs < new Date(sorted[0].dateRevision + 'T00:00:00').getTime()) {
    return Number(sorted[0].ancienHC) || Number(log.hc) || 0;
  }
  let applicable = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (new Date(sorted[i].dateRevision + 'T00:00:00').getTime() <= refTs) {
      applicable = sorted[i];
      break;
    }
  }
  return applicable ? (Number(applicable.nouveauHC) || Number(log.hc) || 0) : (Number(log.hc) || 0);
}

export function _chargesAtDate(log /*, dateRef, chHistorique */) {
  if (!log) return 0;
  return Number(log.ch) || 0;
}
