// ─────────────────────────────────────────────────────────────────────────────
// charge-exercice.js — rattachement d'une charge à un exercice de régularisation.
//
// Répond à : « cette charge est-elle dans ce décompte, et pour quel montant ? »
// Règle (décret 2005-240 sur les comptes de copropriété + pratique des agences) :
// une charge est rattachée à l'exercice selon la PÉRIODE qu'elle COUVRE, pas la
// date de règlement.
//   - sans période couverte → point-date : 100 % si la date de facture ∈ exercice, sinon 0.
//   - avec période couverte → coupée au prorata des jours de chevauchement avec l'exercice.
//     Une facture à cheval sur deux exercices est répartie (Σ des parts == montant).
//
// Fonction PURE (testée dans __tests__/helpers/charge-exercice.test.js).
// Réf : docs/superpowers/specs/2026-07-11-page-charges-design.md (décision B, 2026-07-11)
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000;

// UTC de bout en bout : jours comptés proprement, pas de décalage local/DST.
function _ms(d) { const [y, m, dd] = String(d).split('-').map(Number); return Date.UTC(y, m - 1, dd); }

/**
 * @param {{montant:number, date?:string, periodeFrom?:string, periodeTo?:string}} charge
 * @param {string} from  début d'exercice ISO (inclus)
 * @param {string} to    fin d'exercice ISO (incluse)
 * @returns {{amount:number, share:number, periodeDays:(number|null), overlapDays:(number|null)}}
 */
export function chargeExerciceShare(charge, from, to) {
  const montant = +(charge && charge.montant) || 0;
  const pFrom = charge && charge.periodeFrom;
  const pTo = charge && charge.periodeTo;

  // Avec période couverte → prorata des jours de chevauchement
  if (pFrom && pTo) {
    const periodeDays = Math.max(1, Math.round((_ms(pTo) - _ms(pFrom)) / DAY) + 1);
    const oStart = Math.max(_ms(pFrom), _ms(from));
    const oEnd = Math.min(_ms(pTo), _ms(to));
    const overlapDays = oEnd >= oStart ? Math.round((oEnd - oStart) / DAY) + 1 : 0;
    const share = overlapDays / periodeDays;
    return { amount: montant * share, share, periodeDays, overlapDays };
  }

  // Sans période couverte → point-date (comparaison ISO lexicographique)
  const d = charge && charge.date;
  const inside = !!(d && d >= from && d <= to);
  return { amount: inside ? montant : 0, share: inside ? 1 : 0, periodeDays: null, overlapDays: null };
}
