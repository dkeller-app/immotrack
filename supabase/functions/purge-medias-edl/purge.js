// supabase/functions/purge-medias-edl/purge.js — LOGIQUE de la purge planifiée des vidéos d'état des lieux
// (EDL-VIDEO-IA, décision Didier 14/10/2026 n° 7 ; migration 0058). Pure et testée
// (__tests__/helpers/purge-medias-edl.test.js) ; index.ts ne fait que brancher Supabase (rôle service).
//
// Règle : à échéance (restitution du dépôt de garantie + 3 ans, art. 7-1 loi n° 89-462, jamais avant signature
// + 3 ans — plancher posé par la base), hors gel pour litige, on supprime D'ABORD le fichier du stockage, PUIS
// la ligne du registre (la garde 0058 n'autorise la suppression d'une ligne scellée qu'à échéance). Un fichier
// qui ne s'efface pas garde sa ligne : il sera retenté au prochain passage (jamais de ligne orpheline qui
// ferait perdre la trace d'un fichier encore présent).
// Journal : des NOMBRES seulement (aucun chemin, aucun identifiant).

export const LOT = 100;

/**
 * @param {object} o
 * @param {Function} o.aPurger    (limite) => Promise<[{ id, storage_path }]>          (rpc edl_medias_a_purger)
 * @param {Function} o.effacer    (chemins[]) => Promise<{ effaces: string[], echecs: string[] }>  (Storage API)
 * @param {Function} o.supprimer  (ids[]) => Promise<{ ok: boolean }>                  (delete edl_medias)
 * @param {number}   [o.tours]    nombre de lots au plus par exécution
 */
export async function purger({ aPurger, effacer, supprimer, tours = 5, limite = LOT }) {
  const bilan = { lus: 0, fichiers: 0, lignes: 0, echecs: 0, erreurs: 0 };
  for (let t = 0; t < tours; t++) {
    let lot;
    try { lot = await aPurger(limite); } catch (_) { bilan.erreurs++; break; }
    if (!Array.isArray(lot) || !lot.length) break;
    bilan.lus += lot.length;
    let r;
    try { r = await effacer(lot.map((x) => x.storage_path)); } catch (_) { bilan.erreurs++; break; }
    const effaces = new Set((r && r.effaces) || []);
    const ids = lot.filter((x) => effaces.has(x.storage_path)).map((x) => x.id);
    bilan.fichiers += ids.length;
    bilan.echecs += lot.length - ids.length;
    if (ids.length) {
      try { const s = await supprimer(ids); if (s && s.ok) bilan.lignes += ids.length; else bilan.erreurs++; } catch (_) { bilan.erreurs++; }
    }
    if (ids.length < lot.length || lot.length < limite) break;   // échecs : on n'insiste pas ; dernier lot
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
