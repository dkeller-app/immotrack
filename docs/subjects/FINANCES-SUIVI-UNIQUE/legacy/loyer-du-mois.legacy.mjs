// FINANCES-SUIVI-UNIQUE P7 — COPIE FIGÉE (v15.715) de `_debutSuivi` et `_computeLoyerNetting` (js/core/loyer-du-mois.js),
// conservées pour que snapshot-avant.mjs / compare-moteurs.mjs / repro-arslan-101.mjs calculent encore l'« avant ».
// NE PAS MODIFIER, NON CHARGÉE PAR L'APP. `_occupation` (privée) = `occupationBaux` (exportée, même corps).
import { occupationBaux, _loyerArrearsPass } from '../../../../js/core/loyer-du-mois.js';

export function _debutSuivi(ctx, firstPaymentYm) {
  const segs = occupationBaux(ctx && ctx.bails);
  if (!segs.length) return null;
  const fp = /^\d{4}-\d{2}$/.test(String(firstPaymentYm || '')) ? String(firstPaymentYm) : null;
  if (!fp) {
    const open = segs.find((s) => !s.end);
    return open ? open.debut.slice(0, 7) : null;
  }
  let cand = null;
  for (const s of segs) { if (s.debut.slice(0, 7) <= fp) cand = s; }
  if (!cand) cand = segs[0];                       // 1er versement pendant une vacance amont
  const candYm = cand.debut.slice(0, 7);
  const janSuivi = fp.slice(0, 4) + '-01';
  return candYm > janSuivi ? candYm : janSuivi;
}

export function _computeLoyerNetting(months, graceLast, opening) {
  return _loyerArrearsPass(months, { carry: true, graceLast: !!graceLast, opening: opening || null });
}
