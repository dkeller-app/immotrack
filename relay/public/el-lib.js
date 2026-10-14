// el-lib.js — fonctions PURES de la page /l (aucun DOM, aucun réseau) : importées par el.js, testées par le relais.

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const SANS_ACCENT = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** 'avril 2026' ou '2026-04' → '2026-04' ; autre chose → ''. */
export function cleMois(periode) {
  const s = String(periode == null ? '' : periode).trim().toLowerCase();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const m = /^([a-zéèêûôîà]+)\s+(\d{4})$/.exec(s);
  if (!m) return '';
  const i = MOIS.findIndex((x) => SANS_ACCENT(x) === SANS_ACCENT(m[1]));
  return i < 0 ? '' : m[2] + '-' + String(i + 1).padStart(2, '0');
}

const jour = (s) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s || '')); return m ? m[1] : ''; };

/**
 * Rang d'un document pour dire « le plus récent » : la PÉRIODE pour une quittance (une quittance rééditée plus tard
 * ne devient pas plus récente que celle d'un mois suivant), sinon la date du document, sinon la date de publication.
 * Jamais l'ordre de publication seul (plusieurs quittances peuvent être publiées ou rééditées le même jour).
 */
export function rangDocument(d) {
  const x = d || {};
  const mk = x.type === 'quittance' ? cleMois(x.periode) : '';
  return mk ? mk + '-01' : (jour(x.date_doc) || jour(x.publie_le));
}

/** Comparateur « plus récent d'abord » : rang, puis date du document, puis date de publication (ISO complet). */
export function plusRecentDabord(a, b) {
  return rangDocument(b).localeCompare(rangDocument(a))
    || jour(b && b.date_doc).localeCompare(jour(a && a.date_doc))
    || String((b && b.publie_le) || '').localeCompare(String((a && a.publie_le) || ''));
}

/** Document mis en avant (« Nouveau ») : publié depuis moins de `jours` jours, le plus récent par période / date. */
export function documentNouveau(docs, maintenant = Date.now(), jours = 30) {
  const l = (docs || []).filter((d) => { const t = new Date(d && d.publie_le).getTime(); return !isNaN(t) && maintenant - t < jours * 864e5; });
  return l.sort(plusRecentDabord)[0] || null;
}

/** Texte de confirmation après « Donner l'accord » / « Retirer l'accord » (date et heure du serveur). */
export function confirmationAccord(donner, accord, fdh) {
  const a = accord || {};
  const q = donner ? a.donne_le : a.retire_le;
  const quand = q && fdh ? fdh(q) : '';
  return (donner ? 'Accord enregistré' : 'Accord retiré') + (quand ? ' le ' + quand : '') + '.';
}
