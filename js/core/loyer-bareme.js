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

/**
 * « Montant réellement saisi » — CDC Finances §M-1 bis : l'app ne devine rien. Un champ VIDE
 * n'est pas un zéro, et un zéro doit être une SAISIE EXPLICITE.
 *
 * Ce qui se passait sans cette distinction (mesuré en prod le 2026-08-20) : un import de
 * fichier de référence dont la colonne « charges » est vide pose bail.ch = '' ; `''` passe le
 * test `!= null` puis `Number('') || 0` vaut 0 — la provision du barème tombait à 0 € pour
 * tous les mois suivants, à la première révision IRL comme au premier enregistrement du bail.
 *
 * @param {*} v valeur brute (champ de formulaire, cellule importée, valeur stockée)
 * @returns {number|null} le nombre saisi, ou null si rien ne l'a été
 */
export function montantSaisi(v) {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Premier montant réellement saisi de la chaîne des sources (bail → lot → barème en vigueur).
 * Rend null si AUCUNE source ne sait : c'est à l'appelant d'assumer son plancher, pas au
 * helper d'inventer un 0.
 */
export function premierMontantSaisi(...candidats) {
  for (const c of candidats) {
    const n = montantSaisi(c);
    if (n != null) return n;
  }
  return null;
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

/**
 * Période vivante OUVERTE (fin==null) du lot, la plus tardive, filtrée par `ok(p)` (ref tolérante).
 * Base commune des trois sélecteurs du module — une seule boucle, un seul comportement.
 */
function _openPeriodIdxWhere(periods, ref, ok) {
  const want = _nr(ref);
  let idx = -1, best = '';
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (!p || p._deleted || _nr(p.ref) !== want || p.fin != null) continue;
    if (ok && !ok(p)) continue;
    const d = _ymd(p.debut);
    if (d >= best) { best = d; idx = i; }
  }
  return idx;
}

/** Période vivante ouverte (fin==null) du lot dont le début est ≤ dateLimite (ref tolérante). */
function _openPeriodIdx(periods, ref, dateLimite) {
  return _openPeriodIdxWhere(periods, ref, dateLimite ? (p) => _ymd(p.debut) <= dateLimite : null);
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
 *
 * LA PÉRIODE DU BAIL EST CELLE QUE LE BAIL A CRÉÉE — source 'bail'. C'est la seule que cette
 * fonction a le droit de réécrire. Les révisions IRL et les corrections datées ont leur propre
 * chemin d'écriture (appliquerNouvellePeriode, appelé sous popup de validation) : elles portent
 * le tarif en vigueur ou à venir, jamais celui des champs du formulaire de bail.
 *
 * CE QUI SE PASSAIT AVANT (mesuré en prod le 2026-08-20, v15.541) : la sélection prenait « la
 * période ouverte de plus grand début », sans distinction de source. Dès qu'une révision était
 * PROGRAMMÉE pour une date future, elle était la seule période ouverte du lot — un saveBail sans
 * le moindre changement financier (un numéro de téléphone) la ramenait au tarif du bail :
 *     AVANT  2024-01-01→2026-08-31 700+100 · 2026-09-01→ouverte 730+100 [irl]
 *     APRÈS  2024-01-01→2026-08-31 700+100 · 2026-09-01→ouverte 700+100 [irl]
 * La révision disparaissait du barème et de la timeline. Elle revenait seule au démarrage suivant
 * (pendingApply), mais entre-temps l'écran mentait et une quittance émise dans cette fenêtre
 * partait au mauvais tarif.
 *
 * Aucune horloge n'entre dans la décision : le résultat d'un enregistrement ne dépend pas de
 * l'heure à laquelle on enregistre (et reste testable sans figer la date du jour).
 *
 *   - période ouverte de source 'bail' → son hc/ch suit les termes du formulaire ;
 *   - sinon, période ouverte appartenant à CE bail (même bailDebut) → on n'y touche pas ;
 *   - sinon → création de la période initiale (bail neuf, ou re-bail après clôture).
 *
 * @param {Array} periods barème courant
 * @param {{ref, debut, hc, ch}} bail
 */
export function synchroniserPeriodeBail(periods, bail) {
  const arr = (periods || []).map((p) => ({ ...p }));
  if (!bail || !bail.debut) return arr;
  const hcSaisi = montantSaisi(bail.hc);
  const chSaisi = montantSaisi(bail.ch);
  // source absente = barème d'avant l'introduction du champ : c'est une période de bail.
  const idx = _openPeriodIdxWhere(arr, bail.ref, (p) => (p.source || 'bail') === 'bail');
  if (idx >= 0) {
    const cur = arr[idx];
    // LOT 3 — une valeur NON SAISIE ne remplace jamais une valeur connue. `pf()` rend 0 pour
    // un champ vide et un import à colonne vide pose '' : sans ce garde-fou, un simple
    // enregistrement mettait la provision (ou le loyer) du barème à 0 € pour tous les mois
    // suivants, sans popup ni avertissement. Un 0 réellement saisi, lui, écrit bien 0.
    const hc = hcSaisi != null ? hcSaisi : (montantSaisi(cur.hc) != null ? montantSaisi(cur.hc) : 0);
    const ch = chSaisi != null ? chSaisi : (montantSaisi(cur.ch) != null ? montantSaisi(cur.ch) : 0);
    if ((Number(cur.hc) || 0) === hc && (Number(cur.ch) || 0) === ch) return arr;  // idempotent
    arr[idx] = { ...cur, hc, ch };
    return arr;
  }
  // Pas de période de bail ouverte : si une période ouverte appartient quand même à CE bail
  // (révision IRL programmée ou en vigueur, correction manuelle datée), elle porte le tarif
  // courant du lot — on la laisse. Sans ce garde-fou on lui repeindrait le loyer du formulaire.
  if (_openPeriodIdxWhere(arr, bail.ref, (p) => _ymd(p.bailDebut) === _ymd(bail.debut)) >= 0) return arr;
  const p = periodeInitialeBail(bail);
  if (p) arr.push(p);
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

/**
 * Clôture CIBLÉE par (ref, debut) — audit HISTORIQUE-BAIL-ONGLET 17/07 : le chemin « fin
 * explicite » d'une correction de période doit fermer LA période insérée, pas la période
 * ouverte la plus récente du lot (cloturerBareme), sinon la vivante se corrompt (fin < debut).
 * No-op si fin < debut ou période introuvable. PUR.
 */
export function cloturerPeriodeParDebut(periods, ref, debutIso, finIso) {
  const want = _nr(ref);
  const debut = _ymd(debutIso);
  const fin = _ymd(finIso);
  if (!debut || !fin || fin < debut) return (periods || []).map((p) => ({ ...p }));
  return (periods || []).map((p) => {
    if (p && !p._deleted && _nr(p.ref) === want && _ymd(p.debut) === debut && p.fin == null) {
      return { ...p, fin };
    }
    return { ...p };
  });
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
