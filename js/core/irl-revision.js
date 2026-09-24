/**
 * core/irl-revision.js — IRL-REVISION (docs/subjects/IRL-REVISION.md, validé 2026-09-24).
 *
 * Ce qui se passe APRÈS « Valider la révision » :
 *   R6 — la lettre dit ce qui a été VALIDÉ (ancien loyer, nouveau loyer, indices, date d'effet
 *        réelle), lu dans l'entrée du journal `DB.irlHistorique`. Avant : `genIRLLetter`
 *        recalculait sur le loyer COURANT — une fois la révision appliquée, « Revoir la lettre »
 *        affichait une deuxième révision par-dessus la première.
 *   R7 — une révision PROGRAMMÉE (effet encore à venir) s'annule : l'entrée est retirée
 *        (tombstone, pour la propagation cloud) et le loyer d'avant REPREND à la même date via
 *        le moteur du barème existant (`appliquerNouvellePeriode`, supersession même début) —
 *        aucune période n'est détruite en silence, aucun mois passé n'est recalculé (I-1).
 *
 * Pur / testable : aucune lecture de DB, `todayIso` injecté.
 * Tests : __tests__/helpers/irl-revision.test.js
 */
import { appliquerNouvellePeriode } from './loyer-bareme.js';

const _nr = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _ymd = (v) => String(v == null ? '' : v).slice(0, 10);
const _ok = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(_ymd(iso));
const _vivante = (h) => !!h && !h._deleted && h.action !== 'renonciation';

/**
 * L'entrée validée (appliquée ou programmée) qui porte le cycle `cycleIso` du lot `ref`.
 * Un cycle couvre l'année qui précède sa date : une clé à l'ancien format (1er du mois de
 * l'anniversaire, jour anniversaire) du même cycle est reconnue ; celle du cycle d'avant, non.
 * @returns {Object|null} la plus récente (par date de validation) ; null si aucune
 */
export function entreeValideeDuCycle(journal, ref, cycleIso) {
  const cyc = _ymd(cycleIso);
  if (!_ok(cyc) || !Array.isArray(journal)) return null;
  const prev = (parseInt(cyc.slice(0, 4), 10) - 1) + cyc.slice(4);
  const want = _nr(ref);
  let best = null, bestI = -1;
  journal.forEach((h, i) => {
    if (!_vivante(h) || _nr(h.ref) !== want) return;
    const k = _ymd(h.dateRevision);
    if (!_ok(k) || k <= prev) return;
    const d = _ymd(h.date);
    if (!best || d > _ymd(best.date) || (d === _ymd(best.date) && i > bestI)) { best = h; bestI = i; }
  });
  return best;
}

/**
 * L'objet « révision » attendu par le gabarit de lettre (`_buildIRLLetterHtml`), REJOUÉ depuis
 * l'entrée validée : aucun chiffre recalculé. null si l'entrée n'a pas ses indices (legacy).
 * @returns {{T:number, N:number, irlRef:{key:string,val:number}, irlVigueur:{key:string,val:number},
 *            variation:number, nouveauHC:number, ancienHC:number, dateRevision:Date,
 *            dateEffetIso:string}|null}
 */
export function revDepuisEntree(h) {
  if (!h) return null;
  const kv = String(h.irlVigueur || '').trim();
  const kr = String(h.irlRef || '').trim();
  const m = kv.match(/^T([1-4])\s+(\d{4})$/);
  const vV = Number(h.irlVigueurVal), vR = Number(h.irlRefVal);
  if (!m || !kr || !(vV > 0) || !(vR > 0)) return null;
  const cyc = _ymd(h.dateRevision) || _ymd(h.dateEffet);
  if (!_ok(cyc)) return null;
  return {
    T: parseInt(m[1], 10), N: parseInt(m[2], 10),
    irlRef: { key: kr, val: vR }, irlVigueur: { key: kv, val: vV },
    variation: (vV - vR) / vR,
    nouveauHC: Number(h.nouveauHC) || 0,
    ancienHC: Number(h.ancienHC) || 0,
    dateRevision: new Date(cyc + 'T00:00:00'),
    dateEffetIso: _ymd(h.dateEffet) || _ymd(h.dateApplication) || cyc
  };
}

/**
 * R7 — annule la révision PROGRAMMÉE d'un lot (validée, effet encore à venir).
 * @param {{irlHistorique:Array, bareme:Array, ref:string, todayIso:string}} input
 * @returns {{ok:true, irlHistorique:Array, bareme:Array, entree:Object} | {ok:false, erreur:string}}
 */
export function annulerRevisionProgrammee(input) {
  const i = input || {};
  const today = _ymd(i.todayIso);
  const want = _nr(i.ref);
  const hist = Array.isArray(i.irlHistorique) ? i.irlHistorique : [];
  if (!want || !_ok(today)) return { ok: false, erreur: 'Données insuffisantes pour annuler la révision.' };
  // La plus récente entrée validée du lot encore en attente.
  let idx = -1;
  hist.forEach((h, k) => {
    if (_vivante(h) && _nr(h.ref) === want && h.pendingApply) idx = k;
  });
  if (idx < 0) return { ok: false, erreur: 'Aucune révision programmée pour ce lot.' };
  const e = hist[idx];
  const effet = _ymd(e.dateEffet) || _ymd(e.dateApplication);
  if (!_ok(effet) || effet <= today) {
    return { ok: false, erreur: 'La date d\'effet est atteinte : le nouveau loyer s\'applique déjà. Corriger la date d\'effet depuis l\'historique du bail.' };
  }
  const irlHistorique = hist.map((h, k) => (k === idx ? { ...h, _deleted: true, _annuleeLe: today } : h));
  // Le loyer d'avant reprend À LA MÊME DATE : la période IRL est supersédée (tombstone portant
  // sa raison, visible dans l'historique du bail), jamais un trou dans le barème.
  let bareme = Array.isArray(i.bareme) ? i.bareme : [];
  const per = bareme.find((p) => p && !p._deleted && _nr(p.ref) === want && _ymd(p.debut) === effet && p.source === 'irl');
  if (per) {
    bareme = appliquerNouvellePeriode(bareme, {
      ref: per.ref, debut: effet, hc: Number(e.ancienHC) || 0, ch: Number(per.ch) || 0,
      source: 'bail', bailDebut: per.bailDebut || undefined, note: 'Révision IRL programmée annulée'
    });
  }
  return { ok: true, irlHistorique, bareme, entree: e };
}
