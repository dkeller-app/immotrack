/**
 * IMPORT-ACTE-VENTE — construction d'un « bail repris » (Art. 1743 C. civ.).
 * Pur : aucune dépendance DB/DOM. Miroir testable de la logique inline de _acteApply.
 * Bail hérité à l'acquisition d'un bien occupé : PAS de signature ImmoTrack,
 * typeContrat:'repris', régime 'nu' par défaut (éditable ensuite dans le module Bail).
 */
export function buildReprisBail(occ, entNom, ref, nowISO) {
  const o = occ || {};
  const nom = String(o.locataire || '').trim();
  return {
    locataires: nom ? [{ nom }] : [],
    nom,
    type: 'nu',
    typeContrat: 'repris',
    entity: entNom || '',
    debut: o.debut || '',
    fin: '',
    hc: Number(o.hc) || 0,
    ch: Number(o.ch) || 0,
    dg: Number(o.dg) || 0,
    irl: '',
    jpay: '',
    modalitePaiement: 'echeoir',
    source: { import: 'acte', acteRef: o.acteRef || '', importeLe: nowISO || new Date().toISOString() },
  };
}
