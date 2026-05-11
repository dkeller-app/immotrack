/**
 * Helpers DPE et gel IRL — SPRINT 1 (loi Climat 2021)
 *
 * Stubs testables avant intégration dans index.html.
 * Spec : interdire révision IRL pour passoires thermiques (loi 2021-1104 art 23, applicable depuis 24/08/2022)
 *
 * Voir : docs/subjects/IRL-DPE-FG.md (livré v13.31)
 */

const DPE_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** Liste de classes DPE valides */
export function _isDpeClassValide(classe) {
  return DPE_CLASSES.includes(String(classe || '').toUpperCase());
}

/**
 * Détecte si un bail tombe sous le gel IRL DPE F/G.
 * @param {object} bail - Objet avec champ .dpe (string 'A'..'G')
 * @returns {boolean}
 */
export function _bailGelDpeFG(bail) {
  if (!bail) return false;
  const c = String(bail.dpe || '').toUpperCase();
  return c === 'F' || c === 'G';
}

/**
 * Vérifie si un DPE est expiré (validité 10 ans).
 * @param {string} dpeDateIso - Date du DPE en ISO (YYYY-MM-DD)
 * @param {Date} [refDate=now] - Date de référence
 * @returns {boolean}
 */
export function _dpeExpire(dpeDateIso, refDate = new Date()) {
  if (!dpeDateIso) return false;
  const dpeDate = new Date(dpeDateIso);
  if (Number.isNaN(dpeDate.getTime())) return false;
  const tenYearsLater = new Date(dpeDate);
  tenYearsLater.setFullYear(tenYearsLater.getFullYear() + 10);
  return refDate >= tenYearsLater;
}

/**
 * Décision sur la révisabilité IRL pour un bail donné.
 * Combine :
 *   - DPE manquant → impossible (besoin d'info)
 *   - DPE F/G → gel loi Climat (hard block)
 *   - DPE expiré (> 10 ans) → warning (autorisé mais avertissement)
 *   - DPE A-E valide → autorisé
 *
 * @param {object} bail - { dpe, dpeDate }
 * @returns {{revisable: boolean, blocking: boolean, raison: string}}
 */
export function _estRevisableIRL(bail) {
  if (!bail) return { revisable: false, blocking: true, raison: 'Bail non fourni' };
  const c = String(bail.dpe || '').toUpperCase();
  if (!c) return { revisable: false, blocking: true, raison: 'DPE non renseigné' };
  if (!_isDpeClassValide(c)) return { revisable: false, blocking: true, raison: 'DPE invalide' };
  if (c === 'F' || c === 'G') {
    return { revisable: false, blocking: true, raison: `Loyer gelé DPE ${c} (loi Climat 2021 art 23, 24/08/2022)` };
  }
  if (_dpeExpire(bail.dpeDate)) {
    return { revisable: true, blocking: false, raison: 'DPE expiré (> 10 ans) — révision autorisée mais à renouveler' };
  }
  return { revisable: true, blocking: false, raison: '' };
}
