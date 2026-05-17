/**
 * core/group-by-imm.js — UX-GROUP-BY-IMMEUBLE v15.76
 *
 * Helpers purs (sans DB / DOM) pour grouper les logements par immeuble et
 * calculer les KPI d'un groupe (nb lots, loyer total HC, nb alertes IRL).
 * Pattern transverse réutilisable par tous les onglets affichant des logements.
 *
 * Tests Vitest miroir : __tests__/helpers/group-by-imm.test.js
 */

/**
 * Groupe une liste de logements par leur champ `imm` (immeuble).
 * - Tri alphanumérique français (avec ordre naturel : "Imm 2" < "Imm 10").
 * - Logements sans immeuble → bucket spécial `isUnassigned: true` placé en dernier.
 * - Conserve l'ordre d'origine des logements à l'intérieur de chaque groupe.
 *
 * @param {object[]} logements liste de logements (préfiltrés alive + occupé par l'appelant)
 * @returns {{key:string, imm:string|null, logements:object[], isUnassigned:boolean}[]}
 */
export function _groupLogementsByImm(logements) {
  if (!Array.isArray(logements)) return [];
  const buckets = new Map();
  const unassigned = [];
  for (const l of logements) {
    if (!l) continue;
    const imm = typeof l.imm === 'string' ? l.imm.trim() : '';
    if (!imm) {
      unassigned.push(l);
    } else {
      if (!buckets.has(imm)) buckets.set(imm, []);
      buckets.get(imm).push(l);
    }
  }
  const keys = Array.from(buckets.keys()).sort((a, b) =>
    a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })
  );
  const out = keys.map(imm => ({ key: imm, imm, logements: buckets.get(imm), isUnassigned: false }));
  if (unassigned.length) {
    out.push({ key: '__unassigned__', imm: null, logements: unassigned, isUnassigned: true });
  }
  return out;
}

/**
 * Calcule les KPI d'un groupe IRL : nb lots, loyer HC total cumulé, et
 * compteurs d'alertes par catégorie de révision IRL.
 *
 * @param {{logements:object[]}} group sortie de _groupLogementsByImm
 * @param {(log:object)=>object|null} [computeRevisionFn] callback computeIRLRevision
 * @returns {{nbLots:number, loyerTotalHC:number, nbAlertesGel:number, nbInsuffisant:number, nbDpeManquant:number}}
 */
export function _computeIRLGroupKPIs(group, computeRevisionFn) {
  const empty = { nbLots: 0, loyerTotalHC: 0, nbAlertesGel: 0, nbInsuffisant: 0, nbDpeManquant: 0 };
  if (!group || !Array.isArray(group.logements)) return empty;
  let loyerTotalHC = 0;
  let nbAlertesGel = 0;
  let nbInsuffisant = 0;
  let nbDpeManquant = 0;
  for (const l of group.logements) {
    if (typeof l.hc === 'number' && isFinite(l.hc)) loyerTotalHC += l.hc;
    if (typeof computeRevisionFn === 'function') {
      const rev = computeRevisionFn(l);
      if (rev && rev.gelDpeFG) nbAlertesGel++;
      if (rev && rev.insuffisant) nbInsuffisant++;
      if (rev && rev.dpeManquant) nbDpeManquant++;
    }
  }
  return {
    nbLots: group.logements.length,
    loyerTotalHC: Math.round(loyerTotalHC * 100) / 100,
    nbAlertesGel,
    nbInsuffisant,
    nbDpeManquant,
  };
}
