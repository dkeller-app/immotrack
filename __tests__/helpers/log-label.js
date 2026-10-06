/**
 * Module log-label — nom d'affichage du logement (RETOURS-2026-10-05 B3, BAIL-EN-COURS-NOM-AFFICHAGE).
 *
 * `logement.ref` reste la CLÉ TECHNIQUE (jointure partout). `logement.libelle` est un TEXTE D'ÉCRAN :
 * modifiable à tout moment, même avec un bail signé. Vide ou égal à la référence → on affiche la référence.
 * Pur : ne lit jamais DB. Le texte renvoyé n'est PAS échappé (escHtml à l'affichage).
 */

const _fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const _natCmp = (a, b) => String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'fr', { numeric: true, sensitivity: 'base' });

/** Libellé saisi → valeur à stocker : trim, espaces fusionnés, caractères de contrôle retirés, 60 max.
 *  '' si vide ou égal à la référence (insensible à la casse) : dans ce cas on ne stocke rien. */
export function normaliserLibelle(raw, ref) {
  const s = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  if (!s) return '';
  if (ref != null && s.toLowerCase() === String(ref).trim().toLowerCase()) return '';
  return s;
}

/** Nom affiché : libellé normalisé, sinon référence, sinon ''. */
export function libelle(log) {
  if (!log) return '';
  return normaliserLibelle(log.libelle, log.ref) || String(log.ref == null ? '' : log.ref);
}

/** Forme mixte « Nom · réf » (choix d'un logement, confirmations) ; « réf » seule sans libellé. */
export function libelleEtRef(log) {
  if (!log) return '';
  const nom = normaliserLibelle(log.libelle, log.ref);
  const ref = String(log.ref == null ? '' : log.ref);
  return nom ? nom + ' · ' + ref : ref;
}

/** Recherche : libellé OU référence, sans casse ni accents. `q` vide → vrai. */
export function correspond(log, q) {
  const n = _fold(q).trim();
  if (!n) return true;
  if (!log) return false;
  return _fold(libelle(log)).includes(n) || _fold(log.ref).includes(n);
}

/** Tri : nom affiché (naturel), puis référence. */
export function comparer(a, b) {
  return _natCmp(libelle(a), libelle(b)) || _natCmp(a && a.ref, b && b.ref);
}
