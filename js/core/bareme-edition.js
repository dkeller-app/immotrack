/**
 * core/bareme-edition.js — BAIL-EN-COURS-MODIFIER-PERIODES (2026-10-06) : modifier / supprimer /
 * ajouter UNE période de l'historique du bail (DB.loyerBareme), proprement et sans rien casser.
 *
 * Module PUR et ADDITIF : aucune lecture de DB, aucune horloge (`le`, `auteur`, `evtId` sont
 * injectés par `opts`), aucune modification de loyer-bareme.js (partagé par saveBail, l'IRL,
 * l'avenant et la migration) — on importe ce qu'on réutilise, on ne touche à rien d'existant.
 *
 * RÈGLE DE DIDIER : « on ne bloque jamais l'utilisateur : des alertes, pas de blocage ».
 * `ok:false` ne désigne donc QUE une entrée inexploitable (période disparue entre l'affichage et
 * l'enregistrement, date illisible ou hors du bail, montant négatif) — jamais une décision
 * métier. Les mois déjà quittancés, le trop-perçu, l'écart avec une quittance émise sont des
 * ALERTES calculées par `impactEdition` et montrées par l'écran.
 *
 * IDENTIFIER UNE PÉRIODE : la CLÉ {ref, bailDebut, debut}, jamais l'index du tableau (le blob
 * cloud réécrit le tableau, un autre appareil le réordonne). On n'ajoute pas de champ `id` :
 * `_reprendreApres` (loyer-bareme.js) recopie l'objet entier, l'id serait dupliqué par chaque split.
 *
 * RIEN NE DISPARAÎT SANS TRACE (invariant I-E) : une période modifiée / supprimée / absorbée reste
 * dans le tableau, tombstonée AVEC SA RAISON (`_modifieePar`, `_supprimeePar`, `_absorbeePar`) —
 * la timeline (bail-historique.js) en fait une carte. Les lignes écrites portent `_edition`.
 *
 * Invariants garantis (testés : __tests__/helpers/bareme-edition*.test.js) :
 *   I-A pas de chevauchement · I-B couverture continue conservée · I-C ≤ 1 période ouverte ·
 *   I-D localité (le dû ne change que sur la fenêtre de la période) · I-E trace de tout ·
 *   I-F déterminisme, indépendance à l'ordre du tableau · I-G idempotence (même evtId → no-op).
 */
import {
  garantirCouvertureBail, appliquerNouvellePeriode, cloturerPeriodeParDebut, chapitrePour, montantSaisi
} from './loyer-bareme.js';
import { duMois, finOccupationBail } from './loyer-du-mois.js';

const _nr = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _ymd = (iso) => String(iso == null ? '' : iso).slice(0, 10);
const _isoOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const _vivante = (p) => !!(p && !p._deleted);
/** Une valeur de formulaire / d'API renseignée : ni absente, ni null, ni chaîne vide. */
const _renseigne = (v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/** Décalage de `n` jours d'une date ISO (arithmétique UTC : aucun saut d'heure d'été). */
function _decale(iso, n) {
  const [y, m, d] = _ymd(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const _veille = (iso) => _decale(iso, -1);
const _lendemain = (iso) => _decale(iso, +1);

/** `bailDebut` absent = barème antérieur au champ : on ne peut rien conclure, donc on n'exclut pas. */
const _compat = (p, bd) => { const b = _ymd(p && p.bailDebut); return !b || !bd || b === bd; };

/** La clé d'une période : {ref, bailDebut, debut}. */
export function cleDePeriode(p) {
  return { ref: p && p.ref, bailDebut: _ymd(p && p.bailDebut), debut: _ymd(p && p.debut) };
}

/**
 * Retrouve la période VIVANTE désignée par une clé (ref tolérante, chapitre compatible).
 * Plusieurs candidates (stock corrompu) → LA DERNIÈRE du tableau (même règle que M7 des tests de
 * couverture par chapitre).
 * @returns {{idx:number, periode:Object}|null}
 */
export function trouverPeriode(periods, cle) {
  if (!cle) return null;
  let hit = null;
  const bd = _ymd(cle.bailDebut);
  for (let i = 0; i < (periods || []).length; i++) {
    const p = periods[i];
    if (!_vivante(p) || _nr(p.ref) !== _nr(cle.ref) || _ymd(p.debut) !== _ymd(cle.debut)) continue;
    if (!_compat(p, bd)) continue;
    hit = { idx: i, periode: p };
  }
  return hit;
}

const _sommaire = (p) => (p ? {
  debut: _ymd(p.debut), fin: p.fin == null ? null : _ymd(p.fin),
  hc: Number(p.hc) || 0, ch: Number(p.ch) || 0, source: p.source || 'bail'
} : null);

/** Cette opération (même evtId) a-t-elle déjà été appliquée ? (idempotence I-G, rejeu d'un autre appareil) */
function _dejaFait(arr, evtId) {
  if (!evtId) return false;
  return arr.some((p) => p && ((p._modifieePar && p._modifieePar.evtId === evtId)
    || (p._supprimeePar && p._supprimeePar.evtId === evtId)
    || (p._absorbeePar && p._absorbeePar.evtId === evtId)
    || (p._edition && p._edition.evtId === evtId)));
}

function _echec(arr, raison, extra) {
  return Object.assign({ ok: false, change: false, periods: arr, avant: null, apres: null, touchees: [], avertissements: [], raison }, extra || {});
}

/**
 * Barème ANTÉRIEUR au champ `bailDebut` : la période ne dit pas à quel bail elle appartient. `_compat` accepte alors tout,
 * et une suppression traversait les chapitres (elle prolongeait le locataire d'avant). Quand les baux du lot sont connus
 * (`opts.baux`), on déduit le chapitre de la DATE : {debut: début du bail qui occupe la date, jusqua: début du suivant}.
 * Sans baux, ou sans bail qui couvre la date : null (comportement historique, rien n'est conclu).
 */
function _chapitreDeduit(arr, T, baux) {
  if (_ymd(T.bailDebut) || !Array.isArray(baux) || !baux.length) return null;
  const cd = chapitrePour(arr, T.ref, T.debut, baux);
  if (!cd) return null;
  let jusqua = null;
  for (const b of baux) {
    const d = _ymd(b && b.debut);
    if (b && !b._deleted && d > cd && (!jusqua || d < jusqua)) jusqua = d;
  }
  return { debut: cd, jusqua };
}

/** Contexte commun d'une opération sur une période : copie, cible, voisinage. */
function _contexte(periods, cle, opts) {
  const arr = (periods || []).map((p) => ({ ...p }));
  const o = opts || {};
  if (_dejaFait(arr, o.evtId)) return { fini: Object.assign(_echec(arr, 'deja-applique'), { ok: true }) };
  const f = trouverPeriode(arr, cle);
  if (!f) return { fini: _echec(arr, 'introuvable') };
  const T = arr[f.idx];
  const deduit = _chapitreDeduit(arr, T, o.baux);
  const bd = _ymd(T.bailDebut) || (deduit ? deduit.debut : '');
  const dansChap = (p) => { const b = _ymd(p && p.bailDebut); if (b) return b === bd; const d = _ymd(p.debut); return d >= deduit.debut && (!deduit.jusqua || d < deduit.jusqua); };
  const lot = (p) => _vivante(p) && _nr(p.ref) === _nr(T.ref) && (deduit ? dansChap(p) : _compat(p, bd));
  const Td = _ymd(T.debut);
  const Tf = T.fin == null ? null : _ymd(T.fin);
  const autres = arr.filter((p) => p !== T && lot(p));
  return { arr, o, T, idx: f.idx, bd, lot, Td, Tf, autres, le: o.le || '', evtId: o.evtId || null };
}

const _bailPour = (T, bd, o) => ({ ref: T.ref, debut: bd, hc: o.bailHc, ch: o.bailCh });

/**
 * Modifie une période : date d'effet (début), loyer HC, charges. `patch = {debut?, hc?, ch?}` ;
 * un champ absent ou vide est INCHANGÉ (un champ vide n'est pas un zéro : `montantSaisi`).
 * `opts = {motif, le, auteur, evtId, bailHc?, bailCh?, autoriserIRL?}` — `bailHc/bailCh` : le
 * tarif du bail du chapitre, pour combler un trou préexistant (comme le fait duMois).
 *
 *  - 1ʳᵉ période du chapitre : sa date EST celle du bail → ignorée + avertissement ;
 *  - période issue d'une révision IRL (sans `autoriserIRL`) : seules les charges se modifient ici
 *    (date et loyer passent par les gestes IRL) → avertissement `irl-geste-dedie` ;
 *  - reculer la date : la période précédente (contiguë) est PROLONGÉE ;
 *  - avancer la date : les périodes entièrement recouvertes sont ABSORBÉES, celle qui chevauche est ROGNÉE ;
 *  - la fin de la période ne bouge pas (seule la date de début se modifie).
 */
export function modifierPeriode(periods, cle, patch, opts) {
  const c = _contexte(periods, cle, opts);
  if (c.fini) return c.fini;
  const { arr, o, T, idx, bd, lot, Td, Tf, le, evtId } = c;
  const pt = patch || {};
  const avert = [];
  const irl = T.source === 'irl' && !o.autoriserIRL;

  // ── montants
  let mH = pt.hc !== undefined ? montantSaisi(pt.hc) : null;
  const mC = pt.ch !== undefined ? montantSaisi(pt.ch) : null;
  // Un montant PRÉSENT mais non numérique ('abc', NaN) n'est pas « inchangé » : c'est une erreur dite, pas un refus muet.
  if ((_renseigne(pt.hc) && mH == null) || (_renseigne(pt.ch) && mC == null)) return _echec(arr, 'montant-invalide');
  if ((mH != null && mH < 0) || (mC != null && mC < 0)) return _echec(arr, 'montant-invalide');
  if (irl && mH != null && mH !== (Number(T.hc) || 0)) { avert.push('irl-geste-dedie'); mH = null; }
  const hc = mH != null ? mH : T.hc;
  const ch = mC != null ? mC : T.ch;

  // ── date
  let d2 = Td;
  if (pt.debut !== undefined && pt.debut !== null && pt.debut !== '') {
    const d = _ymd(pt.debut);
    if (!_isoOk(d)) return _echec(arr, 'date-invalide');
    d2 = d;
  }
  const premiere = bd ? Td === bd : !c.autres.some((p) => _ymd(p.debut) < Td);
  if (d2 !== Td) {
    if (irl) { if (!avert.includes('irl-geste-dedie')) avert.push('irl-geste-dedie'); d2 = Td; }
    else if (premiere) { avert.push('premiere-periode-date'); d2 = Td; }
    else if (d2 > Td && Tf != null && d2 > Tf) return _echec(arr, 'date-apres-fin');
    else if (d2 < Td && bd && d2 < bd) return _echec(arr, 'avant-bail');
  }

  // ── rien ne change : no-op, aucune trace
  if (d2 === Td && (Number(hc) || 0) === (Number(T.hc) || 0) && (Number(ch) || 0) === (Number(T.ch) || 0)) {
    return { ok: true, change: false, periods: arr, avant: _sommaire(T), apres: _sommaire(T), touchees: [], avertissements: avert };
  }

  const touchees = [];
  if (d2 > Td) {
    // RECULER : la précédente, si elle était contiguë, est prolongée jusqu'à la veille de la nouvelle date.
    let iP = -1;
    arr.forEach((p, i) => {
      if (p !== T && lot(p) && p.fin != null && _ymd(p.fin) === _veille(Td) && (iP < 0 || _ymd(p.debut) > _ymd(arr[iP].debut))) iP = i;
    });
    if (iP >= 0) {
      const P = arr[iP];
      arr[iP] = { ...P, fin: _veille(d2) };
      if (le) arr[iP]._modifiedAt = le;
      touchees.push({ cle: cleDePeriode(P), champ: 'fin', avant: _ymd(P.fin), apres: _veille(d2) });
    } else avert.push('trou-preexistant');
  } else if (d2 < Td) {
    // AVANCER : absorber ce qui est entièrement recouvert, rogner ce qui chevauche la nouvelle date.
    arr.forEach((p, i) => {
      if (p === T || !lot(p)) return;
      const pd = _ymd(p.debut), pf = p.fin == null ? null : _ymd(p.fin);
      if (pd >= d2 && pd < Td) {
        arr[i] = { ...p, _deleted: true, _absorbeePar: { debut: d2, hc: Number(hc) || 0, ch: Number(ch) || 0, le, evtId } };
        if (le) arr[i]._modifiedAt = le;
        touchees.push({ cle: cleDePeriode(p), champ: 'absorbee', avant: _sommaire(p), apres: null });
        if (p.source === 'irl') avert.push('absorbe-irl');
      } else if (pd < d2 && (pf == null || pf >= d2)) {
        arr[i] = { ...p, fin: _veille(d2) };
        if (le) arr[i]._modifiedAt = le;
        touchees.push({ cle: cleDePeriode(p), champ: 'fin', avant: pf, apres: _veille(d2) });
      }
    });
  }

  // ── la source : irl reste irl ; la 1re période « bail » reste « bail » ; une autre période « bail »
  //    (continuation dérivée, complément de couverture) devient « manuel » — sinon appliquerNouvellePeriode
  //    la traiterait encore comme dérivée et la supersèderait en silence à la prochaine révision.
  const src = T.source || 'bail';
  const s2 = (src === 'bail' && !premiere) ? 'manuel' : src;

  arr[idx] = { ...T, _deleted: true, _modifieePar: { debut: d2, hc: Number(hc) || 0, ch: Number(ch) || 0, le, auteur: o.auteur || '', evtId, motif: o.motif || '' } };
  if (le) arr[idx]._modifiedAt = le;
  const ligne = {
    ref: T.ref, debut: d2, fin: T.fin == null ? null : _ymd(T.fin),
    hc: Number(hc) || 0, ch: Number(ch) || 0, source: s2,
    note: T.note || '', _edition: { evtId, de: src, le }
  };
  if (T.bailDebut != null) ligne.bailDebut = T.bailDebut;
  if (le) ligne._modifiedAt = le;
  arr.push(ligne);

  const out = bd ? garantirCouvertureBail(arr, _bailPour(T, bd, o), d2) : arr;
  return { ok: true, change: true, periods: out, avant: _sommaire(T), apres: _sommaire(ligne), touchees, avertissements: avert };
}

/**
 * Supprime une période. Les mois qu'elle couvrait prennent le tarif de la période PRÉCÉDENTE
 * (celle-ci est prolongée) : c'est le sens « annuler cette modification ».
 *  - 1ʳᵉ période du chapitre : ses mois prennent le tarif de la SUIVANTE (une ligne `source:'bail'`
 *    est écrite — déplacer la suivante casserait son lien IRL) + avertissement `premiere-periode-supprimee` ;
 *  - seule période : rien n'est écrit, le loyer du bail s'applique (couverture reposée) ;
 *  - période de clôture : la précédente prend SA fin — jamais au-delà de la clôture.
 * Une période issue d'une révision IRL n'est pas supprimable ici (`irl-geste-dedie` : « Annuler la
 * révision »), sauf `opts.autoriserIRL`.
 */
export function supprimerPeriode(periods, cle, opts) {
  const c = _contexte(periods, cle, opts);
  if (c.fini) return c.fini;
  const { arr, o, T, idx, bd, lot, Td, Tf, le, evtId } = c;
  if (T.source === 'irl' && !o.autoriserIRL) return _echec(arr, 'irl-geste-dedie');
  const avert = [];
  const touchees = [];

  let iP = -1;
  arr.forEach((p, i) => {
    if (p !== T && lot(p) && p.fin != null && _ymd(p.fin) === _veille(Td) && (iP < 0 || _ymd(p.debut) > _ymd(arr[iP].debut))) iP = i;
  });
  const avant = c.autres.some((p) => _ymd(p.debut) < Td);
  let N = null;
  for (const p of c.autres) if (_ymd(p.debut) > Td && (!N || _ymd(p.debut) < _ymd(N.debut))) N = p;

  let reprise;
  let filler = null;
  if (iP >= 0) {
    const P = arr[iP];
    arr[iP] = { ...P, fin: Tf };
    if (le) arr[iP]._modifiedAt = le;
    touchees.push({ cle: cleDePeriode(P), champ: 'fin', avant: _ymd(P.fin), apres: Tf });
    reprise = 'precedente';
  } else if (!avant) {
    if (N) {
      filler = {
        ref: T.ref, debut: Td, fin: Tf, hc: Number(N.hc) || 0, ch: Number(N.ch) || 0, source: 'bail',
        note: 'Période supprimée — tarif de la période suivante', _edition: { evtId, de: T.source || 'bail', le }
      };
      if (T.bailDebut != null) filler.bailDebut = T.bailDebut;
      if (le) filler._modifiedAt = le;
      avert.push('premiere-periode-supprimee');
      reprise = 'suivante';
    } else { avert.push('seule-periode'); reprise = 'bail'; }
  } else { avert.push('trou-preexistant'); reprise = 'bail'; }

  arr[idx] = { ...T, _deleted: true, _supprimeePar: { le, auteur: o.auteur || '', evtId, motif: o.motif || '', reprise } };
  if (le) arr[idx]._modifiedAt = le;
  if (filler) arr.push(filler);
  // Filet : un trou (suppression de la seule période, trou préexistant) est comblé au tarif du bail
  // — borné à la fin de la période supprimée, pour ne jamais rouvrir un bail clos.
  const out = bd ? garantirCouvertureBail(arr, _bailPour(T, bd, o), Tf ? _lendemain(Tf) : undefined) : arr;
  return { ok: true, change: true, periods: out, avant: _sommaire(T), apres: filler ? _sommaire(filler) : null, touchees, avertissements: avert };
}

/** Diff des lignes vivantes avant/après : fins changées, lignes disparues (remplacées). */
function _diffTouchees(avant, apres) {
  const k = (p) => `${_nr(p.ref)}|${_ymd(p.bailDebut)}|${_ymd(p.debut)}`;
  const mapApres = new Map();
  apres.forEach((p) => { if (_vivante(p)) mapApres.set(k(p), p); });
  const out = [];
  for (const p of avant) {
    if (!_vivante(p)) continue;
    const q = mapApres.get(k(p));
    if (!q) out.push({ cle: cleDePeriode(p), champ: 'remplacee', avant: _sommaire(p), apres: null });
    else if (_ymd(q.fin) !== _ymd(p.fin) || (q.fin == null) !== (p.fin == null)) {
      out.push({ cle: cleDePeriode(p), champ: 'fin', avant: p.fin == null ? null : _ymd(p.fin), apres: q.fin == null ? null : _ymd(q.fin) });
    }
  }
  return out;
}

/**
 * Ajoute une période manquante : fine enveloppe autour de l'EXISTANT (même séquence que l'ancien
 * geste « Corriger une période », retiré) — couverture garantie avant la date, puis `appliquerNouvellePeriode`
 * (coupe la période en vigueur, se borne sur la prochaine décision), puis fin explicite éventuelle.
 * `nouvelle = {ref, debut, fin?, hc, ch, bailDebut?}` ; `opts = {motif, le, auteur, evtId, baux?,
 * bailHc?, bailCh?}` (`baux` : baux du lot, pour rattacher la date au bon chapitre).
 */
export function ajouterPeriode(periods, nouvelle, opts) {
  const arr = (periods || []).map((p) => ({ ...p }));
  const o = opts || {};
  const n = nouvelle || {};
  if (_dejaFait(arr, o.evtId)) return Object.assign(_echec(arr, 'deja-applique'), { ok: true });
  const debut = _ymd(n.debut);
  if (!_isoOk(debut)) return _echec(arr, 'date-invalide');
  const hc = montantSaisi(n.hc);
  const ch = montantSaisi(n.ch);
  if (hc == null) return _echec(arr, 'montant-invalide');
  if (hc < 0 || (ch != null && ch < 0)) return _echec(arr, 'montant-invalide');
  if (_renseigne(n.ch) && ch == null) return _echec(arr, 'montant-invalide');   // 'abc' / NaN : erreur dite, pas un zéro
  const bd = _ymd(n.bailDebut) || chapitrePour(arr, n.ref, debut, o.baux || []);
  if (!bd) return _echec(arr, 'aucun-bail');
  if (debut < bd) return _echec(arr, 'avant-bail', { bailDebut: bd });
  // La fin d'occupation du bail du chapitre (LA même que le dû) : une période ajoutée dans un bail CLOS ne la déborde jamais
  // (sinon elle chevauche la vacance, et un ré-ancrage ultérieur du bail suivant créerait un chevauchement).
  let finChap = _ymd(o.finChapitre);
  if (!finChap) {
    const bc = (o.baux || []).find((b) => b && !b._deleted && _ymd(b.debut) === bd);
    finChap = bc ? _ymd(finOccupationBail(bc, bc.archive !== false)) : '';
  }
  if (finChap && debut > finChap) return _echec(arr, 'apres-cloture', { finChapitre: finChap });
  let fin = n.fin ? _ymd(n.fin) : null;
  if (fin && (!_isoOk(fin) || fin < debut)) return _echec(arr, 'fin-invalide');
  if (finChap && (!fin || fin > finChap)) fin = finChap;
  const avert = [];
  if (arr.some((p) => _vivante(p) && _nr(p.ref) === _nr(n.ref) && _ymd(p.debut) === debut && _compat(p, bd))) avert.push('remplace-periode');

  const le = o.le || '';
  let out = garantirCouvertureBail(arr, { ref: n.ref, debut: bd, hc: o.bailHc, ch: o.bailCh }, debut);
  // CHARGES VIDES : « un champ vide n'est pas un zéro » (LOT 3). Elles reprennent la provision de la période en vigueur à cette
  // date (sinon celle du bail) ; faute de source, 0 — mais DIT (`charges-vides`), jamais en silence.
  let chFinal = ch;
  if (chFinal == null) {
    const encours = out.filter((p) => _vivante(p) && _nr(p.ref) === _nr(n.ref) && _compat(p, bd) && _ymd(p.debut) <= debut && (p.fin == null || _ymd(p.fin) >= debut))
      .sort((a, b) => _ymd(b.debut).localeCompare(_ymd(a.debut)))[0];
    const repris = montantSaisi(encours && encours.ch);
    const bailCh = montantSaisi(o.bailCh);
    chFinal = repris != null ? repris : (bailCh != null ? bailCh : 0);
    avert.push(repris != null || bailCh != null ? 'charges-reprises' : 'charges-vides');
  }
  out = appliquerNouvellePeriode(out, { ref: n.ref, debut, fin, hc, ch: chFinal, source: 'manuel', bailDebut: bd, note: o.motif || '' });
  if (fin) out = cloturerPeriodeParDebut(out, n.ref, debut, fin);
  const change = JSON.stringify(out) !== JSON.stringify(arr);
  if (!change) return { ok: true, change: false, periods: arr, avant: null, apres: null, touchees: [], avertissements: avert };
  const last = out[out.length - 1];
  let apres = null;
  if (last && _vivante(last) && _ymd(last.debut) === debut && last.source === 'manuel') {
    last._edition = { evtId: o.evtId || null, de: null, le };
    if (le) last._modifiedAt = le;
    apres = _sommaire(last);
  }
  return { ok: true, change: true, periods: out, avant: null, apres, touchees: _diffTouchees(arr, out), avertissements: avert };
}

// ════════════════════════════════════════════════════════════════════════════
// IMPACT « avant / après » — ce que l'écran dit AVANT d'enregistrer (alerte NON bloquante).
// Lecture seule de duMois() : le chiffre affiché est exactement celui que Finances, Loyers et les
// quittances afficheront ensuite — aucun moteur concurrent.
// ════════════════════════════════════════════════════════════════════════════
const _ymOf = (d) => _ymd(d).slice(0, 7);
function _ymPlus(ym, n) {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String(((m % 12) + 12) % 12 + 1).padStart(2, '0')}`;
}
const _cleLigne = (p) => `${_ymd(p.bailDebut)}|${_ymd(p.debut)}|${p.fin == null ? '' : _ymd(p.fin)}|${Number(p.hc) || 0}|${Number(p.ch) || 0}`;
const _tot = (d) => ({ hc: d.hc, ch: d.ch, total: d.total });
const _r2 = (n) => Math.round(n * 100) / 100;

/**
 * Les mois dont le dû change entre deux barèmes d'un même lot.
 * @param {{ref:string, bails:Array, avant:Array, apres:Array, jusquAu?:string}} input
 *   `bails` : forme attendue par duMois (bailsFromRaw) ; `jusquAu` : le mois courant ('YYYY-MM' ou
 *   date) — les mois au-delà sont le FUTUR (pas de trop-perçu, pas de quittance), sans jusquAu tout est passé.
 * @returns {{mois:Array<{ym,avant,apres,delta}>, futur:{ym,des,avant,apres,delta,nbMois,ouvert}|null,
 *            fenetre:{debut:'YYYY-MM', fin:'YYYY-MM'|null}|null, deltaTotal:number}}
 *   `fenetre` = premier et dernier mois dont le dû change (`fin:null` : l'écart se poursuit sans fin) ;
 *   `futur.ouvert` : l'écart du futur n'a pas de fin (« à partir de… »).
 */
export function impactEdition(input) {
  const i = input || {};
  const vv = (b) => (b || []).filter((p) => _vivante(p) && _nr(p.ref) === _nr(i.ref) && p.debut);
  const A = vv(i.avant), B = vv(i.apres);
  const setA = new Set(A.map(_cleLigne)), setB = new Set(B.map(_cleLigne));
  const diff = A.filter((p) => !setB.has(_cleLigne(p))).concat(B.filter((p) => !setA.has(_cleLigne(p))));
  const vide = { mois: [], futur: null, fenetre: null, deltaTotal: 0 };
  if (!diff.length) return vide;
  let debut = '9999-99-99', fin = '', ouverte = false;
  for (const p of diff) {
    const d = _ymd(p.debut);
    if (d < debut) debut = d;
    if (p.fin == null) ouverte = true; else if (_ymd(p.fin) > fin) fin = _ymd(p.fin);
  }
  const cur = i.jusquAu ? _ymOf(i.jusquAu) : null;
  const ym0 = _ymOf(debut);
  const ymFin = ouverte ? null : _ymOf(fin);
  let limite = ymFin;
  if (ouverte) limite = _ymPlus(cur && cur > ym0 ? cur : ym0, 36);
  const ctxA = { ref: i.ref, bails: i.bails || [], bareme: i.avant || [] };
  const ctxB = { ref: i.ref, bails: i.bails || [], bareme: i.apres || [] };
  const mois = [];
  let futur = null, nbFutur = 0, premier = '', dernier = '';
  for (let ym = ym0, n = 0; ym <= limite && n < 600; ym = _ymPlus(ym, 1), n++) {
    const a = duMois(ctxA, ym), b = duMois(ctxB, ym);
    if (a.hc === b.hc && a.ch === b.ch) continue;
    if (!premier) premier = ym;
    dernier = ym;
    const ligne = { ym, avant: _tot(a), apres: _tot(b), delta: _r2(b.total - a.total) };
    if (cur && ym > cur) {
      nbFutur++;
      if (!futur) futur = { ym, des: ym + '-01', avant: ligne.avant, apres: ligne.apres, delta: ligne.delta, nbMois: 0 };
    } else mois.push(ligne);
  }
  const sansFin = ouverte && dernier === limite;
  if (futur) { futur.nbMois = nbFutur; futur.ouvert = sansFin; }
  if (!premier) return vide;
  return { mois, futur, fenetre: { debut: premier, fin: sansFin ? null : dernier }, deltaTotal: _r2(mois.reduce((s, m) => s + m.delta, 0)) };
}

// ════════════════════════════════════════════════════════════════════════════
// ÉCRASEMENT MULTI-APPAREILS — détecteur des modifications de période « perdues ».
// Le barème vit dans le blob `espace_config`, réécrit EN ENTIER sans garde de version : un appareil pas encore rafraîchi
// peut écraser une modification faite ailleurs, sans erreur. Le JOURNAL (`baux_evenements`, une ligne versionnée par
// modification) survit, lui. Une entrée du journal dont l'`id` (= `evtId` porté par les lignes du barème qu'elle a écrites)
// n'apparaît dans AUCUNE ligne du barème n'a pas été appliquée (ou a été écrasée) : on la propose à « Réappliquer ».
// Une entrée n'est SUPERSÉDÉE que si une entrée postérieure sur la même période a, elle, été APPLIQUÉE (son id figure dans le barème) :
// on ne rejoue pas par-dessus une décision plus récente qui tient. Si la postérieure est perdue aussi (deux corrections écrasées
// ensemble : la date, puis le montant), les DEUX sont proposées, de la plus ancienne à la plus récente — rejouées dans cet ordre
// (`chaineDeRejeu`), la seconde retrouve la période que la première vient de recréer. Avant que le rejeu ne pose quoi que ce
// soit, `planRejeu` compare la période vivante à ce que le journal en avait vu (révision IRL / avenant / bail survenus entre-temps).
// Une entrée dont les dates sont illisibles est IGNORÉE (le journal vient du cloud, écrit par d'autres membres : jamais de confiance).
// JAMAIS de rejeu automatique (le geste est explicite, et idempotent).
// ════════════════════════════════════════════════════════════════════════════
// Les dates d'une entrée du journal (cloud : écrites par d'autres membres) : strictement AAAA-MM-JJ, sinon l'entrée est ignorée.
const _debutLisible = (x) => !!x && _isoOk(String(x.debut == null ? '' : x.debut));
function _datesLisibles(e) {
  if (e.avant && !_debutLisible(e.avant)) return false;
  if (e.apres && !_debutLisible(e.apres)) return false;
  if (e.action !== 'ajoutee' && !e.avant) return false;
  if (e.action !== 'supprimee' && !e.apres) return false;
  return true;
}
/**
 * @param {Array} journal DB.baux_evenements
 * @param {Array} bareme DB.loyerBareme
 * @param {{ref?:string, ignorees?:Object<string,boolean>}} [opts]
 * @returns {Array<{id,action,date,auteur,motif,ref,bailDebut,avant,apres,entree}>} les entrées non appliquées, la plus ancienne d'abord
 */
export function periodesNonAppliquees(journal, bareme, opts) {
  const o = opts || {};
  const ign = o.ignorees || {};
  const portes = new Set();
  for (const p of (bareme || [])) {
    if (!p) continue;
    for (const k of ['_modifieePar', '_supprimeePar', '_absorbeePar', '_edition']) if (p[k] && p[k].evtId) portes.add(p[k].evtId);
  }
  const refDe = (e) => _nr(String(e.ref == null ? '' : e.ref).split('@@')[0]);
  const es = (journal || []).filter((e) => e && !e._deleted && e.type === 'periode' && e.id != null && (!o.ref || refDe(e) === _nr(String(o.ref).split('@@')[0])));
  const debuts = (e) => new Set([e.avant && e.avant.debut, e.apres && e.apres.debut].filter(Boolean).map(_ymd));
  const out = [];
  for (const e of es) {
    if (portes.has(e.id) || ign[e.id] || !['modifiee', 'supprimee', 'ajoutee'].includes(e.action)) continue;
    if (!_datesLisibles(e)) continue;
    const de = debuts(e);
    const supersedee = es.some((f) => f !== e && portes.has(f.id) && String(f.date || '') > String(e.date || '') && refDe(f) === refDe(e)
      && _ymd(f.bailDebut) === _ymd(e.bailDebut) && [...debuts(f)].some((d) => de.has(d)));
    if (supersedee) continue;
    out.push({ id: e.id, action: e.action, date: e.date, auteur: e.auteur || '', motif: e.motif || '', ref: e.ref, bailDebut: _ymd(e.bailDebut), avant: e.avant || null, apres: e.apres || null, entree: e });
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// ════════════════════════════════════════════════════════════════════════════
// RÉAPPLIQUER SANS ÉCRASER — le rejeu d'une entrée perdue ne repose JAMAIS des montants absolus par-dessus une décision plus
// récente. `planRejeu` compare la période vivante à `entree.avant` ; si elles diffèrent (révision IRL, avenant, saveBail passés
// entre-temps) c'est une DIVERGENCE : on ALERTE (l'utilisateur décide, « des alertes, pas de blocage »), et, s'il maintient, on ne
// pose que les champs que l'entrée avait réellement changés (`apres` ≠ `avant`). Jamais `autoriserIRL` : date et loyer d'une
// période issue d'une révision IRL passent par les gestes IRL.
// ════════════════════════════════════════════════════════════════════════════
const _finNorm = (f) => (f == null ? null : _ymd(f));
const _refSans = (r) => String(r == null ? '' : r).split('@@')[0];

/**
 * @param {{ref,action,bailDebut,avant,apres}} x une entrée de `periodesNonAppliquees`
 * @param {Array} bareme barème VIVANT (ou le barème courant d'une simulation)
 * @returns {{etat:'ok'|'diverge'|'introuvable'|'irl-geste', ecarts:Array<{champ,journal,vivant}>, patch:Object|null,
 *            restreint:string[], cle:Object|null, vivant:Object|null}}
 *   `restreint` : champs de l'entrée qu'on ne rejoue pas ici (période IRL : 'debut', 'hc').
 */
export function planRejeu(x, bareme) {
  const ref = _refSans(x && x.ref);
  const bd = _ymd(x && x.bailDebut);
  const vide = { ecarts: [], patch: null, restreint: [], cle: null, vivant: null };
  if (!x) return Object.assign({ etat: 'introuvable' }, vide);
  if (x.action === 'ajoutee') {
    const ap = x.apres || {};
    const v = (bareme || []).find((p) => _vivante(p) && _nr(p.ref) === _nr(ref) && _ymd(p.debut) === _ymd(ap.debut) && _compat(p, bd));
    const ecarts = [];
    if (v && ((Number(v.hc) || 0) !== (Number(ap.hc) || 0) || (Number(v.ch) || 0) !== (Number(ap.ch) || 0))) {
      ecarts.push({ champ: 'periode-existante', journal: { hc: Number(ap.hc) || 0, ch: Number(ap.ch) || 0 }, vivant: _sommaire(v) });
    }
    return Object.assign({}, vide, { etat: ecarts.length ? 'diverge' : 'ok', ecarts, vivant: v ? _sommaire(v) : null });
  }
  const av = x.avant || {}, ap = x.apres || {};
  const cle = { ref, bailDebut: bd, debut: _ymd(av.debut) };
  const f = trouverPeriode(bareme, cle);
  if (!f) return Object.assign({}, vide, { etat: 'introuvable', cle });
  const v = _sommaire(f.periode);
  const ecarts = [];
  if (Number(av.hc) !== v.hc && av.hc != null) ecarts.push({ champ: 'hc', journal: Number(av.hc) || 0, vivant: v.hc });
  if (Number(av.ch) !== v.ch && av.ch != null) ecarts.push({ champ: 'ch', journal: Number(av.ch) || 0, vivant: v.ch });
  if (av.fin !== undefined && _finNorm(av.fin) !== v.fin) ecarts.push({ champ: 'fin', journal: _finNorm(av.fin), vivant: v.fin });
  if (av.source && (av.source || 'bail') !== v.source) ecarts.push({ champ: 'source', journal: av.source, vivant: v.source });
  const irl = v.source === 'irl' || av.source === 'irl';
  if (x.action === 'supprimee') {
    if (irl) return Object.assign({}, vide, { etat: 'irl-geste', ecarts, cle, vivant: v, restreint: ['supprimer'] });
    return Object.assign({}, vide, { etat: ecarts.length ? 'diverge' : 'ok', ecarts, patch: {}, cle, vivant: v });
  }
  // modifiee : UNIQUEMENT les champs que l'entrée avait changés.
  const patch = {};
  const restreint = [];
  if (_ymd(ap.debut) && _ymd(ap.debut) !== _ymd(av.debut)) { if (irl) restreint.push('debut'); else patch.debut = _ymd(ap.debut); }
  if (ap.hc != null && Number(ap.hc) !== Number(av.hc)) { if (irl) restreint.push('hc'); else patch.hc = Number(ap.hc); }
  if (ap.ch != null && Number(ap.ch) !== Number(av.ch)) patch.ch = Number(ap.ch);
  if (!Object.keys(patch).length && restreint.length) return Object.assign({}, vide, { etat: 'irl-geste', ecarts, cle, vivant: v, restreint });
  return Object.assign({}, vide, { etat: ecarts.length ? 'diverge' : 'ok', ecarts, patch, restreint, cle, vivant: v });
}

/** Les entrées à rejouer pour « Réappliquer » `x` : les perdues du MÊME bail, de la plus ancienne jusqu'à `x`, dans l'ordre du journal. */
export function chaineDeRejeu(perdues, x) {
  const L = perdues || [];
  const i = L.findIndex((y) => y && x && String(y.id) === String(x.id));
  if (i < 0) return [];
  return L.slice(0, i + 1).filter((y) => _nr(_refSans(y.ref)) === _nr(_refSans(x.ref)) && _ymd(y.bailDebut) === _ymd(x.bailDebut));
}

/**
 * Rejoue la chaîne SUR UNE COPIE, sans rien écrire : à chaque étape, plan puis opération pure. S'arrête à la première étape
 * qui ne peut pas (période introuvable : l'étape précédente ne l'a pas recréée ; geste IRL) ou qui DIVERGE (sauf `forcer`).
 * @returns {{ok:boolean, etapes:Array<{id,plan}>, stop:null|{id, raison:'introuvable'|'diverge'|'irl-geste', plan}, periods:Array}}
 */
export function simulerRejeu(chaine, bareme, opts) {
  const o = opts || {};
  let arr = (bareme || []).map((p) => ({ ...p }));
  const etapes = [];
  for (const x of (chaine || [])) {
    const plan = planRejeu(x, arr);
    etapes.push({ id: x.id, plan });
    if (plan.etat === 'introuvable' || plan.etat === 'irl-geste') return { ok: false, etapes, stop: { id: x.id, raison: plan.etat, plan }, periods: arr };
    if (plan.etat === 'diverge' && !o.forcer) return { ok: false, etapes, stop: { id: x.id, raison: 'diverge', plan }, periods: arr };
    const op = { le: x.date, auteur: x.auteur, motif: x.motif, evtId: x.id, baux: o.baux, bailHc: o.bailHc, bailCh: o.bailCh };
    let r;
    if (x.action === 'ajoutee') r = ajouterPeriode(arr, { ref: _refSans(x.ref), debut: x.apres.debut, fin: x.apres.fin || null, hc: x.apres.hc, ch: x.apres.ch, bailDebut: x.bailDebut }, op);
    else if (x.action === 'supprimee') r = supprimerPeriode(arr, plan.cle, op);
    else r = modifierPeriode(arr, plan.cle, plan.patch, op);
    if (!r.ok) return { ok: false, etapes, stop: { id: x.id, raison: r.raison || 'erreur', plan }, periods: arr };
    arr = r.periods;
  }
  return { ok: true, etapes, stop: null, periods: arr };
}

// ════════════════════════════════════════════════════════════════════════════
// RÉVISION IRL PROGRAMMÉE — le moteur IRL (`_applyPendingIRLRevisions`) ne l'applique que si le loyer vivant du lot vaut encore
// `ancienHC`. Modifier le loyer en vigueur le change : la révision serait sautée sans un mot. La fenêtre le DIT (alerte non
// bloquante) ; le correctif du moteur lui-même est du ressort de la session « IRL & courriers ».
// ════════════════════════════════════════════════════════════════════════════
/**
 * @param {Array} irlHistorique DB.irlHistorique
 * @param {string} ref
 * @param {{debutBail?:string}} [opts] une révision d'un cycle antérieur au bail en cours ne le concerne pas
 * @returns {{dateEffet:string, ancienHC:number, nouveauHC:number, cycle:string}|null} la plus récente en attente, sinon null
 */
export function irlProgrammeeDuLot(irlHistorique, ref, opts) {
  const want = _nr(_refSans(ref));
  const debut = _ymd(opts && opts.debutBail);
  let best = null;
  for (const h of (irlHistorique || [])) {
    if (!h || h._deleted || h.action === 'renonciation' || !h.pendingApply || _nr(_refSans(h.ref)) !== want) continue;
    const eff = _ymd(h.dateEffet) || _ymd(h.dateApplication);
    const cyc = _ymd(h.dateRevision);
    if (!_isoOk(eff) || (debut && cyc && cyc < debut)) continue;
    if (!best || eff > best.dateEffet) best = { dateEffet: eff, ancienHC: Number(h.ancienHC), nouveauHC: Number(h.nouveauHC), cycle: cyc };
  }
  return best;
}
