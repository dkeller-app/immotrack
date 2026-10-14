// supabase/functions/purge-medias-edl/purge.js — LOGIQUE de la purge planifiée des vidéos d'état des lieux
// (EDL-VIDEO-IA, décision Didier 14/10/2026 n° 7 ; migration 0058). Pure et testée
// (__tests__/helpers/purge-medias-edl.test.js) ; index.ts ne fait que brancher Supabase (rôle service).
//
// Règle : seuls des médias SCELLÉS à échéance (restitution du dépôt de garantie + 3 ans, art. 7-1 loi n° 89-462,
// jamais avant scellé + 3 ans — plancher posé par la base), hors gel pour litige, sont purgés.
// Ordre (relecture Fable M3) : la LIGNE d'abord — `edl_medias_purger_lignes` ne supprime que ce qui est ENCORE à
// échéance au moment de l'appel (un gel posé entre-temps protège) et rend les chemins —, PUIS ces fichiers-là.
// Un fichier qui ne s'efface pas est compté (sur-conservation à reprendre à la main), jamais une ligne « preuve »
// qui pointerait vers un fichier disparu.
// Journal : des NOMBRES seulement (aucun chemin, aucun identifiant).

export const LOT = 100;

/**
 * @param {object} o
 * @param {Function} o.aPurger    (limite) => Promise<[{ id, storage_path }]>              (rpc edl_medias_a_purger)
 * @param {Function} o.supprimer  (ids[]) => Promise<string[]>  chemins des lignes supprimées (rpc edl_medias_purger_lignes)
 * @param {Function} o.effacer    (chemins[]) => Promise<{ effaces: string[], echecs: string[] }>  (Storage API)
 * @param {number}   [o.tours]    nombre de lots au plus par exécution
 */
export async function purger({ aPurger, effacer, supprimer, tours = 5, limite = LOT }) {
  const bilan = { lus: 0, lignes: 0, fichiers: 0, echecs: 0, erreurs: 0 };
  for (let t = 0; t < tours; t++) {
    let lot;
    try { lot = await aPurger(limite); } catch (_) { bilan.erreurs++; break; }
    if (!Array.isArray(lot) || !lot.length) break;
    bilan.lus += lot.length;
    let chemins;
    try { chemins = await supprimer(lot.map((x) => x.id)); } catch (_) { bilan.erreurs++; break; }
    chemins = Array.isArray(chemins) ? chemins : [];
    bilan.lignes += chemins.length;
    if (chemins.length) {
      try {
        const r = await effacer(chemins);
        bilan.fichiers += ((r && r.effaces) || []).length;
        bilan.echecs += ((r && r.echecs) || []).length;
      } catch (_) { bilan.erreurs++; bilan.echecs += chemins.length; }
    }
    if (chemins.length < lot.length || lot.length < limite) break;   // gel posé entre-temps, ou dernier lot
  }
  return bilan;
}

/** Interprète la réponse de storage.remove() : chemins effacés (un chemin déjà absent compte comme effacé). */
export function interpreterSuppression(chemins, data, error, existe) {
  if (error) return Promise.resolve({ effaces: [], echecs: chemins.slice() });
  const retires = new Set((Array.isArray(data) ? data : []).map((o) => o && o.name).filter(Boolean));
  return Promise.all(chemins.map(async (p) => (retires.has(p) || !(await existe(p)) ? { p, ok: true } : { p, ok: false })))
    .then((rs) => ({ effaces: rs.filter((x) => x.ok).map((x) => x.p), echecs: rs.filter((x) => !x.ok).map((x) => x.p) }));
}
