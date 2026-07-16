/**
 * core/loyer-bareme.js — AUDIT-SUIVI-LOYERS étape 2 (2026-07-15) : le noyau PUR qui
 * construit et fait évoluer DB.loyerBareme[] (source de vérité du loyer dans le temps).
 *
 * Une période = {ref, debut, fin|null, hc, ch, source:'bail'|'irl'|'manuel'|'cloture',
 * bailDebut, note, _deleted?}. Append-only + tombstones (transite par le blob espace_config
 * comme irlHistorique — aucune table relationnelle). Consommé en lecture par duMois()
 * (loyer-du-mois.js), qui filtre les tombstones et lit `fin` sur chaque période.
 *
 * DÉCISION Q1 (user 14/07) : chaque révision IRL porte une DATE D'EFFET EXPLICITE, jamais
 * rétroactive, jamais avant un mois déjà quittancé (le passé quittancé ne se recalcule jamais).
 * Pré-remplissage : validée avant/au 1er anniversaire de l'année → effet au 1er du mois de
 * l'anniversaire ; validée après → 1er du mois suivant la validation. Modifiable, re-validée
 * par les mêmes garde-fous (clampDateEffet).
 *
 * Fonctions PURES (aucune lecture de DB) — testées : __tests__/helpers/loyer-bareme.test.js.
 */

const _nr = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _ymd = (iso) => String(iso == null ? '' : iso).slice(0, 10);

/** '2026-03-15' | '2026-03' → '2026-03-01'. */
export function _premierDuMois(iso) {
  const s = String(iso == null ? '' : iso);
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : '';
}

/** '2026-06-20' → '2026-07-01' (franchit l'année). */
export function _premierDuMoisSuivant(iso) {
  const p = _premierDuMois(iso);
  if (!p) return '';
  let y = parseInt(p.slice(0, 4), 10);
  let m = parseInt(p.slice(5, 7), 10) + 1;
  if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** Veille d'une date ISO. */
function _veille(iso) {
  const d = new Date(_ymd(iso) + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Applique les garde-fous Q1 à une date d'effet (pré-remplie OU saisie par l'utilisateur) :
 *   1. jamais avant le 1er du mois de l'anniversaire de l'année en cours ;
 *   2. jamais avant/dans un mois déjà quittancé (effet ≥ 1er du mois SUIVANT le dernier quittancé).
 * Normalise toujours au 1er du mois. `ajustee` = la date a dû être remontée (à signaler dans l'UI).
 * @param {string} effetIso date d'effet proposée
 * @param {{annivMoisPremierIso?:string, dernierMoisQuittanceYm?:string}} opts
 * @returns {{effetIso:string, ajustee:boolean}}
 */
export function clampDateEffet(effetIso, opts) {
  const o = opts || {};
  let effet = _premierDuMois(effetIso);
  const propose = effet;
  const annivMin = o.annivMoisPremierIso ? _premierDuMois(o.annivMoisPremierIso) : '';
  if (annivMin && effet < annivMin) effet = annivMin;
  if (o.dernierMoisQuittanceYm) {
    const minLibre = _premierDuMoisSuivant(o.dernierMoisQuittanceYm + '-01');
    if (minLibre && effet < minLibre) effet = minLibre;
  }
  return { effetIso: effet, ajustee: effet !== propose };
}

/**
 * Pré-remplit la date d'effet d'une révision IRL (Q1) puis applique les garde-fous.
 * @param {{anniversaireIso:string, validationIso:string, dernierMoisQuittanceYm?:string}} input
 * @returns {{effetIso:string, ajustee:boolean}}
 */
export function computeDateEffetIRL(input) {
  const i = input || {};
  const anniv = _ymd(i.anniversaireIso);
  const validation = _ymd(i.validationIso);
  const annivMoisPremier = _premierDuMois(anniv);
  // Validée avant/au jour de l'anniversaire → effet au 1er du mois de l'anniversaire ;
  // validée après → 1er du mois suivant la validation.
  const propose = (validation && anniv && validation > anniv)
    ? _premierDuMoisSuivant(validation)
    : annivMoisPremier;
  return clampDateEffet(propose, { annivMoisPremierIso: annivMoisPremier, dernierMoisQuittanceYm: i.dernierMoisQuittanceYm });
}

/** Période initiale à la création d'un bail (source 'bail', fin ouverte). */
export function periodeInitialeBail(bail) {
  if (!bail || !bail.debut) return null;
  const debut = _ymd(bail.debut);
  return {
    ref: bail.ref, debut, fin: null,
    hc: Number(bail.hc) || 0, ch: Number(bail.ch) || 0,
    source: 'bail', bailDebut: debut, note: ''
  };
}

/** Période vivante ouverte (fin==null) du lot dont le début est ≤ dateLimite (ref tolérante). */
function _openPeriodIdx(periods, ref, dateLimite) {
  const want = _nr(ref);
  let idx = -1, best = '';
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (!p || p._deleted || _nr(p.ref) !== want || p.fin != null) continue;
    const d = _ymd(p.debut);
    if (dateLimite && d > dateLimite) continue;
    if (d >= best) { best = d; idx = i; }
  }
  return idx;
}

/**
 * Ajoute une nouvelle période et clôture la période ouverte précédente du même lot à la veille
 * du nouveau début. PUR (retourne un nouveau tableau, copies des objets modifiés).
 * Idempotent : une période vivante identique (ref+debut+source+hc+ch) existe déjà → no-op
 * (le boot _applyPendingIRLRevisions rejoue les révisions à chaque démarrage).
 * @param {Array} periods barème courant
 * @param {{ref, debut, hc, ch, source, bailDebut?, note?}} nouvelle
 */
export function appliquerNouvellePeriode(periods, nouvelle) {
  const arr = (periods || []).map((p) => ({ ...p }));
  if (!nouvelle || !nouvelle.debut) return arr;
  const debut = _ymd(nouvelle.debut);
  const want = _nr(nouvelle.ref);
  const src = nouvelle.source || 'manuel';
  const hc = Number(nouvelle.hc) || 0;
  const ch = Number(nouvelle.ch) || 0;
  // Idempotence : même période vivante déjà présente ?
  const exists = arr.some((p) => p && !p._deleted && _nr(p.ref) === want && _ymd(p.debut) === debut
    && p.source === src && (Number(p.hc) || 0) === hc && (Number(p.ch) || 0) === ch);
  if (exists) return arr;
  // Clôture de la période ouverte précédente (début < nouveau début).
  const idx = _openPeriodIdx(arr, nouvelle.ref, _veille(debut));
  if (idx >= 0 && _ymd(arr[idx].debut) < debut) arr[idx] = { ...arr[idx], fin: _veille(debut) };
  arr.push({
    ref: nouvelle.ref, debut, fin: null, hc, ch, source: src,
    bailDebut: nouvelle.bailDebut != null ? _ymd(nouvelle.bailDebut) : debut,
    note: nouvelle.note || ''
  });
  return arr;
}

/**
 * Synchronise le barème avec le bail courant à chaque saveBail (création OU édition). PUR.
 *   - aucune période ouverte du lot → crée la période initiale (bail neuf / après clôture) ;
 *   - période ouverte présente → met à jour son hc/ch/bailDebut EN PLACE (édition des termes
 *     courants du bail via « Modifier bail » — le loyer courant change, pas une révision datée).
 * Les révisions IRL passent par appliquerNouvellePeriode (période datée), pas par ici.
 * @param {Array} periods barème courant
 * @param {{ref, debut, hc, ch}} bail
 */
export function synchroniserPeriodeBail(periods, bail) {
  const arr = (periods || []).map((p) => ({ ...p }));
  if (!bail || !bail.debut) return arr;
  const idx = _openPeriodIdx(arr, bail.ref, null);
  const hc = Number(bail.hc) || 0;
  const ch = Number(bail.ch) || 0;
  if (idx < 0) {
    const p = periodeInitialeBail(bail);
    if (p) arr.push(p);
    return arr;
  }
  const cur = arr[idx];
  if ((Number(cur.hc) || 0) === hc && (Number(cur.ch) || 0) === ch) return arr;  // idempotent
  arr[idx] = { ...cur, hc, ch };
  return arr;
}

/** Clôture (pose une fin) la période ouverte d'un lot — au re-bail / départ. PUR. */
export function cloturerBareme(periods, ref, finIso) {
  const arr = (periods || []).map((p) => ({ ...p }));
  const fin = _ymd(finIso);
  if (!fin) return arr;
  const idx = _openPeriodIdx(arr, ref, null);
  if (idx >= 0) arr[idx] = { ...arr[idx], fin };
  return arr;
}

/** Tombstone toutes les périodes vivantes d'un bail donné (bailDebut) d'un lot. PUR. */
export function tombstonerPeriodesDuBail(periods, ref, bailDebut) {
  const want = _nr(ref);
  const bd = _ymd(bailDebut);
  return (periods || []).map((p) => {
    if (p && !p._deleted && _nr(p.ref) === want && _ymd(p.bailDebut) === bd) return { ...p, _deleted: true };
    return { ...p };
  });
}
