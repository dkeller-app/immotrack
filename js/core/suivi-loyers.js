/**
 * core/suivi-loyers.js — FINANCES-SUIVI-UNIQUE P1 : LE moteur unique du suivi des loyers.
 *
 * Conception validée : docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md (§B API, §C algorithme,
 * §I décisions de Didier du 06/10). Il REMPLACERA (P3 à P7, branchement famille par famille via
 * les adaptateurs ci-dessous) les trois moteurs qui répondaient chacun à leur façon à « ce
 * locataire est-il à jour ? » : le netting par lot de finances-monthly.js, etatMoisLot
 * (loyers-mois.js) et _computeLoyerStatut (loyer-statut.js). P1 : AUCUN écran ne le lit encore.
 *
 * Ce n'est pas un 4ᵉ moteur d'imputation : le socle est conservé tel quel —
 *   - le dû d'un mois = duMois (barème historisé, prorata, troncature C4, invariant I-1),
 *     restreint au segment du bail par l'option `bailDebut` ;
 *   - l'imputation = _loyerArrearsPass (cascade H-1, report d'avance, fragments datés), avec
 *     les extensions §B.2 (remise = manque accepté, seuilArrondi, detail, kind, grace).
 * Ce qui change, c'est l'UNITÉ : le BAIL, plus le lot (décision 1 du 05/10 : « cumul compensé
 * par locataire »). La dette d'un ancien locataire n'est jamais payée par le suivant.
 *
 * Règles encodées (décisions de Didier, §I) :
 *   - imputation à la DATE BANCAIRE ; jamais retard ET avance sur un bail le même mois ;
 *   - manque accepté : solde ce qui manque (ordre H-1), plafonné, jamais d'avance, jamais reçu ;
 *   - locataire parti : dette FIGÉE à son départ (plus aucun dû ne naît), visible dans le lot
 *     pendant l'année civile en cours (celle de `today`) seulement, puis absente de toute vue de
 *     lot ; elle reste sur le bail (`position`, `detteBail`) pour la retenue sur le dépôt ;
 *   - virement entre deux baux (Q3) : `paiement.bailCle` (choix de l'utilisateur) fait foi ;
 *     sinon le bail le plus proche dans le temps, tracé et marqué « à confirmer » ;
 *   - indemnité GLI (Q4) : ne réduit PAS la dette ; exposée en `couvertGli` (information) ;
 *   - écart < 1 € en fin de mois soldé, trace { type:'arrondi' } ;
 *   - début du suivi INJECTÉ ({date, source}) ; défaut provisoire = 1er jour du mois du 1er
 *     loyer encaissé (debutSuiviDefaut). Le suivi raisonne AU MOIS : un 1er loyer reçu le 09/03
 *     paie mars entier.
 *
 * PUR : aucune lecture de DB, aucune horloge (`opts.today` obligatoire), aucun DOM.
 * Tests : __tests__/helpers/suivi-loyers.test.js (cas §F.1), suivi-loyers-invariants.test.js
 * (I-a à I-i), suivi-loyers-socle.test.js (extensions du socle).
 */

import { duMois, occupationBaux, _loyerArrearsPass } from './loyer-du-mois.js';
import { ymRange, lignesRelance, EPS_CENTIME } from './loyers-mois.js';

const _r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const _nr = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _isIso = (s) => /^\d{4}-\d{2}-\d{2}/.test(String(s || ''));
const _dernierJour = (ym) => {
  const y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10);
  return ym + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
};
const _jours = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const _maxYm = (a, b) => (a > b ? a : b);
const _minYm = (a, b) => (a < b ? a : b);

/** Clé stable d'un bail (§B.3) : `ref|debut[|_bailUid]`. */
export function cleBail(ref, bail) {
  const b = bail || {};
  return String(ref) + '|' + String(b.debut || '').slice(0, 10) + (b._bailUid ? '|' + b._bailUid : '');
}

/**
 * Début de suivi PROVISOIRE d'un lot (décision 05/10 b, « à confirmer ») : 1er jour du mois du
 * 1er loyer encaissé (virement positif). Sans aucun paiement : début du bail le plus récent,
 * ouvert OU archivé (zéro paiement = pire retard, jamais invisible : un bail archivé qui n'a
 * jamais payé garde sa vraie dette). Sans aucun bail : null (rien à suivre).
 * À remplacer par immeuble.dateAcquisition / l'antériorité du bail quand R0-C les livrera.
 */
export function debutSuiviDefaut(lotIn) {
  const L = lotIn || {};
  const dates = (L.paiements || [])
    .filter((p) => p && !p._deleted && (p.kind || 'virement') === 'virement' && (Number(p.montant) || 0) > 0.005 && _isIso(p.date))
    .map((p) => String(p.date).slice(0, 10))
    .sort();
  if (dates.length) return { date: dates[0].slice(0, 7) + '-01', source: 'provisoire' };
  const segs = occupationBaux(L.baux || []).filter((s) => !s.end || s.end >= s.debut);
  const ouvert = segs.find((s) => !s.end);
  const dernier = ouvert || (segs.length ? segs[segs.length - 1] : null);
  return dernier ? { date: dernier.debut, source: 'provisoire' } : null;
}

/** Retenue sur le dépôt imputée aux loyers (§C.1.5), d'après la restitution enregistrée. */
function _retenueDg(dg) {
  if (!dg) return 0;
  const v = (Number(dg.verse) || 0) - (Number(dg.retenuAutres) || 0) - (Number(dg.restitue) || 0) + (Number(dg.penalite) || 0);
  return v > 0.005 ? _r2(v) : 0;
}

/** Le mois du bail à `ym`, ou à défaut le dernier mois ≤ ym (position reportée). */
function _moisAu(sb, ym) {
  let hit = null;
  for (const m of sb.mois) { if (m.ym > ym) break; hit = m; }
  return hit;
}

/**
 * LE suivi d'un lot, bail par bail.
 * @param {Object} lotIn { ref, baux:[{cle?, debut, fin, finEffective, archive, hc, ch, noms,
 *        ouverture?:{loyer,charge,avance}, dg?:{verse,retenuAutres,restitue,penalite,date}}],
 *        bareme, paiements:[{id, date, montant /* cr−db *\/, kind:'virement'|'gli', bailCle?}],
 *        manques:[{id, bailCle, ym, montant, motif, date, _deleted}], debutSuivi?:{date, source} }
 * @param {Object} opts { today (obligatoire), dueYm? (défaut : mois de today), graceLast?,
 *        seuilArrondi? (défaut 1), parLot? (DIAGNOSTIC compare-moteurs : un seul pseudo-bail
 *        sur tout le lot, comme les anciens moteurs — jamais pour l'affichage) }
 * @returns {SuiviLot} cf. §B.4 (+ horsSuivi, bauxIgnores, today, dueYm)
 */
export function suiviLot(lotIn, opts) {
  const L = lotIn || {};
  const o = opts || {};
  if (!_isIso(o.today)) throw new TypeError('suiviLot : opts.today (AAAA-MM-JJ) est obligatoire — le moteur n\'a pas d\'horloge');
  const today = String(o.today).slice(0, 10);
  const todayYm = today.slice(0, 7);
  const dueYm = /^\d{4}-\d{2}$/.test(String(o.dueYm || '')) ? String(o.dueYm) : todayYm;
  const graceLast = !!o.graceLast;
  const seuil = o.seuilArrondi != null ? Math.max(0, Number(o.seuilArrondi) || 0) : 1;
  const horizon = _maxYm(todayYm, dueYm);
  const ref = L.ref;
  const debutSuivi = (L.debutSuivi && _isIso(L.debutSuivi.date))
    ? { date: String(L.debutSuivi.date).slice(0, 10), source: L.debutSuivi.source || 'provisoire' }
    : debutSuiviDefaut(L);
  const res = { ref, debutSuivi, today, dueYm, baux: [], mois: {}, horsPeriode: [], horsSuivi: [], bauxIgnores: [], manquesIgnores: [] };
  if (!debutSuivi) return res;
  const sYm = debutSuivi.date.slice(0, 7);
  const sPremier = sYm + '-01';

  // 1. Baux : vivants, triés, TRONQUÉS (la règle de duMois, pas une copie).
  const src = Array.isArray(L.baux) ? L.baux : [];
  const ctxBails = src.map((b) => ({ debut: b && b.debut, fin: b && b.fin, finEffective: b && b.finEffective, archive: b && b.archive, hc: b && b.hc, ch: b && b.ch, _deleted: b && b._deleted }));
  const ctx = { ref, bails: ctxBails, bareme: L.bareme || [] };
  let suivis = [];
  for (const sg of occupationBaux(ctxBails)) {
    const b = src[sg.i];
    const cle = b.cle || cleBail(ref, b);
    if (sg.end && sg.end < sg.debut) { res.bauxIgnores.push({ cle, raison: 'recouvert' }); continue; }
    if (sg.end && sg.end < sPremier) { res.bauxIgnores.push({ cle, raison: 'avant-suivi' }); continue; }
    suivis.push({ b, cle, debut: sg.debut, end: sg.end, argent: [], gli: [] });
  }
  if (o.parLot) {
    // DIAGNOSTIC : le lot vu comme un seul occupant (dû du lot, aucune attribution par bail).
    const ouvert = suivis.some((x) => !x.end);
    suivis = [{ b: { noms: '(lot)', dg: null }, cle: '(lot)', debut: sPremier, end: ouvert || !suivis.length ? null : suivis[suivis.length - 1].end, argent: [], gli: [], parLot: true,
      dgs: suivis.map((x) => ({ cle: x.cle, dg: x.b.dg, fin: x.end })) }];
  }
  const dansSeg = (x, d) => x.debut <= d && (!x.end || d <= x.end);

  // 2. Attribution des paiements à la DATE BANCAIRE (au jour) ; hors segment → Q3, tracé.
  const paiements = (Array.isArray(L.paiements) ? L.paiements : [])
    .filter((p) => p && !p._deleted && _isIso(p.date) && Math.abs(Number(p.montant) || 0) > 0.005)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const p of paiements) {
    const date = String(p.date).slice(0, 10);
    const montant = _r2(p.montant);
    const kind = p.kind === 'gli' ? 'gli' : 'virement';
    if (date < sPremier) { res.horsSuivi.push({ mvId: p.id, date, montant, kind }); continue; }
    let cible = null, regle = null, aConfirmer = false;
    const choisi = (p.bailCle != null && !o.parLot) ? suivis.find((x) => x.cle === p.bailCle) : null;
    if (choisi) {
      cible = choisi;
      if (!dansSeg(choisi, date)) regle = 'choix';
    } else {
      cible = suivis.find((x) => dansSeg(x, date)) || null;
      if (!cible) {
        let avant = null;
        for (const x of suivis) if (x.end && x.end < date && (!avant || x.end > avant.end)) avant = x;
        const apres = suivis.find((x) => x.debut > date) || null;
        if (avant && apres) {
          regle = 'plus-proche'; aConfirmer = true;
          cible = _jours(avant.end, date) < _jours(date, apres.debut) ? avant : apres;   // égalité → le nouveau
        } else if (apres) { regle = 'vacance-avant'; cible = apres; }
        else if (avant) { regle = 'vacance-apres'; cible = avant; }
        else regle = 'aucun-bail';
      }
    }
    if (regle) res.horsPeriode.push({ mvId: p.id, date, montant, bailCle: cible ? cible.cle : null, regle, aConfirmer });
    if (cible) (kind === 'gli' ? cible.gli : cible.argent).push({ id: p.id, date, montant, kind });
  }
  // Règlement sans virement : la retenue sur le dépôt, datée de la fin effective (§C.1.5).
  for (const x of suivis) {
    const lst = x.parLot ? x.dgs : [{ cle: x.cle, dg: x.b.dg, fin: x.end }];
    for (const d of lst) {
      const r = _retenueDg(d.dg);
      if (!r) continue;
      const date = _isIso(d.dg.date) ? String(d.dg.date).slice(0, 10) : d.fin;
      if (!date || date < sPremier) continue;
      x.argent.push({ id: 'dg:' + d.cle, date, montant: r, kind: 'dg' });
    }
  }

  // 3. Passe par bail, mois par mois, de debutSuivi à aujourd'hui (au-delà si paiement tardif).
  const manques = (Array.isArray(L.manques) ? L.manques : [])
    .filter((m) => m && !m._deleted && /^\d{4}-\d{2}$/.test(String(m.ym || '')) && (Number(m.montant) || 0) > 0.005);
  // Un manque rattaché à aucun bail suivi (clé inconnue, bail ignoré) : jamais silencieux.
  if (!o.parLot) {
    for (const m of manques) {
      if (!suivis.some((x) => x.cle === m.bailCle)) res.manquesIgnores.push({ id: m.id, bailCle: m.bailCle, ym: m.ym, montant: _r2(m.montant), raison: 'bail-inconnu' });
    }
  }
  for (const x of suivis) {
    let first = x.parLot ? sYm : _maxYm(sYm, x.debut.slice(0, 7));
    let last = x.end ? _minYm(x.end.slice(0, 7), horizon) : horizon;
    if (x.end && x.end.slice(0, 7) < first) last = first;
    for (const p of x.argent.concat(x.gli)) { const ym = p.date.slice(0, 7); first = _minYm(first, ym); last = _maxYm(last, ym); }
    const yms = first <= last ? ymRange(first, last) : [];
    const mqs = manques.filter((m) => x.parLot || m.bailCle === x.cle);
    const parYm = (arr, ym) => arr.filter((p) => p.date.slice(0, 7) === ym);
    const entrees = yms.map((ym) => {
      const d = x.parLot ? duMois(ctx, ym) : duMois(ctx, ym, { bailDebut: x.debut });
      const argent = parYm(x.argent, ym);
      const mq = mqs.filter((m) => m.ym === ym);
      return {
        ym, d, argent, gli: parYm(x.gli, ym), mq,
        pass: {
          hcDue: d.hc, chDue: d.ch,
          received: argent.reduce((t, p) => t + p.montant, 0),
          sources: argent.filter((p) => p.montant > 0).map((p) => ({ date: p.date, id: p.id, montant: p.montant, kind: p.kind })),
          remise: mq.reduce((t, m) => t + (Number(m.montant) || 0), 0),
          grace: ym > dueYm || (graceLast && ym === dueYm)
        }
      };
    });
    const passOpts = { carry: true, opening: (!x.parLot && x.b.ouverture) || null, seuilArrondi: seuil, detail: true, avoirNegatif: true };
    const pass = _loyerArrearsPass(entrees.map((e) => e.pass), passOpts);
    // Le RESTE DÛ par mois d'origine (relance, quittançabilité) se lit au dernier mois EXIGIBLE :
    // un encaissement post-daté (décision « B ») ne solde pas aujourd'hui un mois passé. Les
    // positions mensuelles, chronologiques, sont identiques dans les deux passes.
    const nExig = entrees.filter((e) => e.ym <= dueYm).length;
    const passExig = nExig < entrees.length ? _loyerArrearsPass(entrees.slice(0, nExig).map((e) => e.pass), passOpts) : pass;
    const traces = [];
    // Manque sur un mois hors des mois suivis du bail : sans effet, mais tracé explicitement.
    for (const m of mqs) {
      if (!yms.includes(m.ym)) traces.push({ type: 'manque-ignore', ym: m.ym, montant: _r2(m.montant), ref: m.id, raison: 'hors-mois-du-bail' });
    }
    const mois = entrees.map((e, i) => {
      const pm = pass.months[i];
      const recu = _r2(e.argent.filter((p) => p.kind === 'virement').reduce((t, p) => t + p.montant, 0));
      const regleDg = _r2(e.argent.filter((p) => p.kind === 'dg').reduce((t, p) => t + p.montant, 0));
      const couvertGli = _r2(e.gli.reduce((t, p) => t + p.montant, 0));
      const retard = _r2(pm.loyerArrear + pm.chargeArrear);
      const dep = pm.anterieur.depuisIdx;
      // `montant` = la remise APPLIQUÉE (plafonnée à la dette) ; `montantDemande` = le geste saisi.
      const manque = !e.mq.length ? null : (e.mq.length === 1
        ? { id: e.mq[0].id, montant: pm.remiseAppliquee, montantDemande: _r2(e.mq[0].montant), motif: e.mq[0].motif || '', date: e.mq[0].date || null }
        : { id: e.mq.map((m) => m.id).join(','), montant: pm.remiseAppliquee, montantDemande: _r2(e.pass.remise), motif: e.mq.map((m) => m.motif || '').join(' ; '), date: e.mq.map((m) => m.date || '').sort().pop() || null });
      e.argent.filter((p) => p.kind === 'dg').forEach((p) => traces.push({ type: 'dg', ym: e.ym, montant: p.montant, ref: p.id }));
      e.gli.forEach((p) => traces.push({ type: 'gli', ym: e.ym, montant: p.montant, ref: p.id }));
      e.mq.forEach((m) => traces.push({ type: 'manque', ym: e.ym, montant: _r2(m.montant), ref: m.id }));
      if (pm.arrondi) traces.push({ type: 'arrondi', ym: e.ym, montant: pm.arrondi, ref: null });
      const residu = i < nExig ? passExig.retardMois[i] : pass.retardMois[i];
      return {
        ym: e.ym,
        du: { hc: e.d.hc, ch: e.d.ch, total: e.d.total },
        exigible: e.ym <= dueYm,
        recu, regleDg, couvertGli,
        avoirDette: pm.avoirDette || 0,     // avoir net du mois au-delà de l'argent disponible → dette de loyer
        imputations: pass.imputations[i].map((p) => ({ mvId: p.id, date: p.date, kind: p.kind || null, montant: p.montant, poste: p.poste })),
        courant: pm.courant,
        anterieur: { loyer: pm.anterieur.loyer, charge: pm.anterieur.charge, depuis: dep === null ? null : (dep === -1 ? 'ouverture' : entrees[dep].ym) },
        retardLoyer: pm.loyerArrear, retardCharge: pm.chargeArrear, retard, avance: pm.avance,
        solde: _r2(pm.avance - retard),
        residu: { loyer: residu.loyer, charge: residu.charge },
        manque, remiseAppliquee: pm.remiseAppliquee, arrondi: pm.arrondi,
        paye: e.d.total > EPS_CENTIME && pm.courant.loyer + pm.courant.charge <= EPS_CENTIME,
        soldeQuittance: e.d.total > EPS_CENTIME && residu.loyer + residu.charge <= EPS_CENTIME
      };
    });
    let pos = null;
    for (const m of mois) if (m.ym <= dueYm) pos = m;
    res.baux.push({
      cle: x.cle, ref, debut: x.debut, fin: x.end,
      sorti: !!(x.end && x.end < todayYm + '-01'),
      noms: x.b.noms || '',
      dueYm,
      mois,
      position: pos
        ? { retardLoyer: pos.retardLoyer, retardCharge: pos.retardCharge, avance: pos.avance, solde: pos.solde }
        : { retardLoyer: 0, retardCharge: 0, avance: 0, solde: 0 },
      traces: traces.sort((a, b) => String(a.ym).localeCompare(String(b.ym)))
    });
  }

  // 4. Le lot, mois par mois : Σ des baux ACTIFS + dette figée des partis visibles (Q2).
  let fin = horizon;
  for (const b of res.baux) if (b.mois.length) fin = _maxYm(fin, b.mois[b.mois.length - 1].ym);
  const anneeEnCours = today.slice(0, 4);
  for (const ym of ymRange(sYm, fin)) {
    const premier = ym + '-01', dernier = _dernierJour(ym);
    const lm = { solde: 0, retard: 0, retardLoyer: 0, retardCharge: 0, avance: 0, bauxActifs: [], partis: [], couvertGli: 0 };
    for (const b of res.baux) {
      const exact = b.mois.find((m) => m.ym === ym);
      if (exact) lm.couvertGli += exact.couvertGli;
      const actif = b.cle === '(lot)' || (b.debut <= dernier && (!b.fin || b.fin >= premier));
      const visibleParti = !actif && b.fin && b.fin < premier
        && ym.slice(0, 4) === anneeEnCours && b.fin.slice(0, 4) === anneeEnCours;
      if (!actif && !visibleParti) continue;
      const m = _moisAu(b, ym);
      if (actif) {
        lm.bauxActifs.push(b.cle);
        if (m) { lm.retardLoyer += m.retardLoyer; lm.retardCharge += m.retardCharge; lm.avance += m.avance; }
      } else if (m && m.retard > EPS_CENTIME) {
        lm.partis.push(b.cle);
        lm.retardLoyer += m.retardLoyer; lm.retardCharge += m.retardCharge;
      }
    }
    lm.retardLoyer = _r2(lm.retardLoyer); lm.retardCharge = _r2(lm.retardCharge);
    lm.retard = _r2(lm.retardLoyer + lm.retardCharge);
    lm.avance = _r2(lm.avance);
    lm.solde = _r2(lm.avance - lm.retard);
    lm.couvertGli = _r2(lm.couvertGli);
    res.mois[ym] = lm;
  }
  return res;
}

/** Carte d'un bail pour un mois (§B.4) — ce que la fenêtre unique affichera. */
function _carte(lot, b, ym, parti) {
  const m = _moisAu(b, ym);
  if (!m) return null;
  const exact = m.ym === ym;
  // COPIES : la fenêtre peut manipuler une carte sans altérer le suivi (ni le cache futur).
  return {
    ref: lot.ref, bailCle: b.cle, noms: b.noms, parti: !!parti,
    du: exact ? Object.assign({}, m.du) : { hc: 0, ch: 0, total: 0 },
    recu: exact ? m.recu : 0,
    imputations: exact ? m.imputations.map((p) => Object.assign({}, p)) : [],
    courant: exact ? Object.assign({}, m.courant) : { loyer: 0, charge: 0 },
    anterieur: exact ? Object.assign({}, m.anterieur) : { loyer: m.retardLoyer, charge: m.retardCharge, depuis: m.anterieur.depuis || (m.retard > EPS_CENTIME ? m.ym : null) },
    manque: exact && m.manque ? Object.assign({}, m.manque) : null,
    couvertGli: exact ? m.couvertGli : 0,
    solde: parti ? _r2(-m.retard) : m.solde
  };
}

/**
 * La case d'un mois sur un périmètre ET le contenu de la fenêtre unique (§B.4).
 * Σ des cartes = valeur de la case = Σ des lots (I-d). Pas de groupe « locataires sortis »
 * (décision Q2) : un parti visible est une carte EN RETARD marquée `parti:true`.
 * @param {Array} lots sorties de suiviLot
 * @param {string} ym 'YYYY-MM'
 */
export function suiviPerimetre(lots, ym) {
  const out = { ym, solde: 0, retard: 0, avance: 0, enRetard: [], enAvance: [], aJour: [], phrase: { nbRetard: 0, nbAvance: 0, nbManques: 0 } };
  let nbManques = 0;
  for (const lot of (lots || [])) {
    const lm = lot && lot.mois && lot.mois[ym];
    if (!lm) continue;
    out.solde += lm.solde; out.retard += lm.retard; out.avance += lm.avance;
    let nonNul = false;
    const noms = [];
    for (const cle of lm.bauxActifs.concat(lm.partis)) {
      const b = lot.baux.find((x) => x.cle === cle);
      if (!b) continue;
      const c = _carte(lot, b, ym, lm.partis.includes(cle));
      if (!c) continue;
      if (!c.parti && b.noms) noms.push(b.noms);
      if (c.manque) nbManques++;
      if (c.solde < -EPS_CENTIME) { out.enRetard.push(c); nonNul = true; }
      else if (c.solde > EPS_CENTIME) { out.enAvance.push(c); nonNul = true; }
    }
    if (!nonNul && lm.bauxActifs.length) out.aJour.push({ ref: lot.ref, noms: noms.join(' · ') });
  }
  const parMontant = (a, b) => Math.abs(b.solde) - Math.abs(a.solde);
  out.enRetard.sort(parMontant); out.enAvance.sort(parMontant);
  out.solde = _r2(out.solde); out.retard = _r2(out.retard); out.avance = _r2(out.avance);
  out.phrase = { nbRetard: out.enRetard.length, nbAvance: out.enAvance.length, nbManques };
  return out;
}

// ── Adaptateurs de compatibilité (strangler, §B.4) — supprimés en fin de chantier (P7) ──────

/**
 * Forme `byLot[ref]` de _computeFinancesMonthly, calculée par le suivi. Changement de NATURE
 * assumé (§E.2) : le retard/l'avance d'un mois sont la POSITION de fin de mois (plus le résidu
 * attribué au mois d'origine) ; l'annuel est la position au dernier mois exigible de l'année.
 * @param {Object} suivi sortie de suiviLot
 * @param {number|string} annee
 * @param {{lastMonth?:number}} [opts] défaut : 12 (année close), mois de today (année en cours)
 */
export function versByLot(suivi, annee, opts) {
  const s = suivi || {};
  const y = String(annee);
  const ty = String(s.today || '').slice(0, 4);
  const lastMonth = (opts && opts.lastMonth != null) ? Math.max(0, Math.min(12, opts.lastMonth | 0))
    : (y < ty ? 12 : (y > ty ? 0 : parseInt(String(s.today).slice(5, 7), 10)));
  const dueYm = s.dueYm || String(s.today || '').slice(0, 7);
  // Rattrapage : la part de l'argent reçu ce mois-là qui a payé un mois ANTÉRIEUR.
  const ratt = {};
  for (const b of (s.baux || [])) for (const m of b.mois) for (const p of m.imputations) {
    if (!p.date || p.kind !== 'virement') continue;
    const pym = String(p.date).slice(0, 7);
    if (pym > m.ym) ratt[pym] = (ratt[pym] || 0) + p.montant;
  }
  const months = [];
  for (let mo = 1; mo <= lastMonth; mo++) {
    const ym = y + '-' + String(mo).padStart(2, '0');
    let duHC = 0, duCH = 0, encaisse = 0;
    for (const b of (s.baux || [])) {
      const m = b.mois.find((x) => x.ym === ym);
      if (m) { duHC += m.du.hc; duCH += m.du.ch; encaisse += m.recu; }
    }
    const lm = (s.mois && s.mois[ym]) || null;
    const exig = ym <= dueYm;
    months.push({
      ym, duHC: _r2(duHC), duCH: _r2(duCH), encaisse: _r2(encaisse),
      loyerRetard: lm && exig ? lm.retardLoyer : 0, chargeRetard: lm && exig ? lm.retardCharge : 0,
      avance: lm ? lm.avance : 0, rattrapage: _r2(ratt[ym] || 0)
    });
  }
  const sum = (k) => _r2(months.reduce((t, m) => t + m[k], 0));
  let posYm = null;
  for (const m of months) if (m.ym <= dueYm) posYm = m.ym;
  const lp = posYm && s.mois && s.mois[posYm];
  const retard = lp ? lp.retard : 0, avance = lp ? lp.avance : 0;
  return {
    months,
    annual: { duHC: sum('duHC'), duCH: sum('duCH'), encaisse: sum('encaisse'), retard, avance },
    solde: _r2(avance - retard)
  };
}

/**
 * Forme `etatMoisLot` (loyers-mois.js) d'UN bail : list, byYm, paiements, datePaiement… pour
 * peutQuittancer, moisProposables, datePaiementMois, mentionDateRecu, moisRailLot, retardLot.
 * Mêmes règles que etatMoisLot (D6 au centime, I-DATE) ; un mois soldé par un manque accepté
 * est soldé (décision Q1 : quittance pour le montant reçu, mention de la remise).
 */
export function versEtatMoisLot(suiviBail) {
  const sb = suiviBail || { mois: [] };
  const dueYm = sb.dueYm || '9999-12';
  const mois = (sb.mois || []).filter((m) => m.ym <= dueYm);
  const list = mois.map((m) => {
    const hcDue = _r2(m.du.hc), chDue = _r2(m.du.ch);
    const du = _r2(hcDue + chDue);
    const resteLoyer = _r2(m.residu.loyer), resteCharge = _r2(m.residu.charge);
    const reste = _r2(resteLoyer + resteCharge);
    // Un mois sans dû qui porte une dette (avoir net après la sortie, défaut 1 du contre-audit)
    // n'est pas une vacance : sa dette doit rester dans la relance (I-g : relance = KPI).
    const vacance = du <= EPS_CENTIME && reste <= EPS_CENTIME;
    const solde = !vacance && reste <= EPS_CENTIME;
    const brut = m.imputations;
    // Une retenue sur dépôt (kind 'dg') n'est PAS un mouvement bancaire : elle n'a pas d'id
    // lisible par les lecteurs « par id » (paiements) ; elle est rendue à part, dans `reglements`.
    const paiements = brut.filter((p) => p.date && p.kind !== 'dg').map((p) => ({ date: p.date, id: p.mvId, montant: p.montant, poste: p.poste }));
    const reglements = brut.filter((p) => p.date && p.kind === 'dg').map((p) => ({ date: p.date, kind: 'dg', montant: p.montant, poste: p.poste }));
    const totalImpute = _r2(brut.reduce((t, p) => t + p.montant, 0));
    const totalDate = _r2(paiements.concat(reglements).reduce((t, p) => t + p.montant, 0));
    const complet = totalImpute - totalDate <= EPS_CENTIME;
    const datesVersements = [...new Set(paiements.map((p) => p.date))].sort();
    const ligne = {
      ym: m.ym, hcDue, chDue, du,
      received: _r2(m.recu + m.regleDg),
      resteLoyer, resteCharge, reste,
      solde,
      partiel: !vacance && reste > EPS_CENTIME && reste < du - EPS_CENTIME,
      vacance,
      paiements,
      montantImpute: totalImpute,
      datesVersements,
      nbVersements: datesVersements.length,
      datePaiement: (solde && complet && datesVersements.length) ? datesVersements[datesVersements.length - 1] : null
    };
    if (reglements.length) ligne.reglements = reglements;   // absent sinon : forme etatMoisLot inchangée
    return ligne;
  });
  const byYm = {};
  list.forEach((e) => { byYm[e.ym] = e; });
  const dernier = mois.length ? mois[mois.length - 1] : null;
  const nonSoldes = list.filter((e) => !e.vacance && e.reste > EPS_CENTIME);
  return {
    list, byYm,
    resteLoyer: dernier ? dernier.retardLoyer : 0,
    resteCharge: dernier ? dernier.retardCharge : 0,
    reste: dernier ? _r2(dernier.retardLoyer + dernier.retardCharge) : 0,
    avance: dernier ? dernier.avance : 0,
    nbMoisNonSoldes: nonSoldes.length,
    premierMoisNonSolde: nonSoldes.length ? nonSoldes[0].ym : null
  };
}

/** Le tableau du courrier de relance d'UN bail (même source que la carte, I-g). */
export function lignesRelanceBail(suiviBail, opts) {
  return lignesRelance(versEtatMoisLot(suiviBail), opts);
}

/** Dette d'un bail (= `_computeDetteBail` du CDC R0-C) : position au dernier mois exigible. */
export function detteBail(suiviBail) {
  const p = (suiviBail && suiviBail.position) || { retardLoyer: 0, retardCharge: 0, avance: 0 };
  return { loyer: p.retardLoyer, charge: p.retardCharge, avance: p.avance };
}

/** `_computeDetteBail` (CDC-R0C lot 2) : la dette d'un bail désigné par sa clé, ou null. */
export function _computeDetteBail(lotIn, bailCle, opts) {
  const sb = suiviLot(lotIn, opts).baux.find((b) => b.cle === bailCle);
  return sb ? detteBail(sb) : null;
}

// ── Collecteur unique des paiements (§B.5) ──────────────────────────────────────────────

const _estLoyer = (mv, catLigne) => {
  const r = typeof catLigne === 'function' ? catLigne(mv.cat) : null;
  return !!(r && r.ligne2044 === '211');
};
const _montantNet = (mv) => _r2((Number(mv.cr) || 0) - (Number(mv.db) || 0));

/**
 * Les paiements d'un lot depuis les mouvements bancaires : `qui` = ref (tolérant), ligne 211
 * par `catLigne` (alias compris, comme _finCatLigne), montant = cr − db (fin de C12),
 * tombstones filtrés. Le dépôt (catégorie spéciale) n'y entre jamais. `isGli(mv)` (injecté)
 * marque les indemnités GLI (`kind:'gli'`). `bailCleOf(mv)` (défaut : `mv.bailCle`) lit le
 * choix mémorisé de l'utilisateur pour un virement entre deux baux (Q3).
 * @returns {Array<{id, date, montant, kind, bailCle?}>} triés par date
 */
export function collecterPaiements(mouvements, opts) {
  const o = opts || {};
  const want = _nr(o.ref);
  if (!want) return [];
  const bailCleOf = typeof o.bailCleOf === 'function' ? o.bailCleOf : ((mv) => mv.bailCle);
  const out = [];
  for (const mv of (Array.isArray(mouvements) ? mouvements : [])) {
    if (!mv || mv._deleted || !_isIso(mv.date) || _nr(mv.qui) !== want) continue;
    const montant = _montantNet(mv);
    if (Math.abs(montant) <= 0.005) continue;
    const gli = typeof o.isGli === 'function' && !!o.isGli(mv);
    if (!gli && !_estLoyer(mv, o.catLigne)) continue;
    const p = { id: mv.id, date: String(mv.date).slice(0, 10), montant, kind: gli ? 'gli' : 'virement' };
    const bc = bailCleOf(mv);
    if (bc != null && bc !== '') p.bailCle = bc;
    out.push(p);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** H-2 — encaissements de loyer (211) SANS lot rattaché : ignorés par le suivi, rendus ici. */
export function paiementsNonAffectes(mouvements, opts) {
  const o = opts || {};
  return (Array.isArray(mouvements) ? mouvements : [])
    .filter((mv) => mv && !mv._deleted && _isIso(mv.date) && !_nr(mv.qui) && _estLoyer(mv, o.catLigne)
      && Math.abs(_montantNet(mv)) > 0.005)
    .map((mv) => ({ id: mv.id, date: String(mv.date).slice(0, 10), montant: _montantNet(mv), kind: 'virement' }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Restitution du dépôt ENREGISTRÉE sur un bail sorti → champs de la retenue (§C.1.5).
 * Enregistrée ⇔ un champ que seule une restitution écrit est présent :
 *   - `dgRestitueAt` / `dgRestitueMontant` (écrits par _dgConfirmerRestitution, app-part2.js) ;
 *   - l'ancien `dgRestitue` > 0 (formulaire du bail « DG restitué » et _rgApplyRetenue,
 *     app-part1.js ; seule trace de restitution dans les données réelles, ex. Ferrette - 101).
 * `dgRetenu` seul NE suffit PAS : il est posé au formulaire ou à la clôture de régul avant
 * toute restitution. Sans restitution enregistrée : rien (sinon le dépôt paierait la dette
 * AVANT la restitution, et la restitution lirait une dette nulle).
 * Versé = `dgPaid` s'il est renseigné (0 compris : dépôt jamais versé), sinon `dg` contractuel.
 */
function _dgDuBail(b) {
  if (!b || !b.finEffective) return undefined;
  const defini = (v) => v != null && v !== '' && Number.isFinite(Number(v));
  const mt = b.dgRestitueMontant;
  const restMontant = defini(mt);
  const enregistree = restMontant || !!b.dgRestitueAt || (Number(b.dgRestitue) || 0) > 0;
  if (!enregistree) return undefined;
  return {
    verse: defini(b.dgPaid) ? Number(b.dgPaid) : (Number(b.dg) || 0),
    retenuAutres: Number(b.dgRetenu) || 0,
    restitue: restMontant ? Number(mt) : (Number(b.dgRestitue) || 0),
    penalite: Number(b.dgPenaliteArt22) || 0,
    date: String(b.finEffective).slice(0, 10)
  };
}

const _nomsBail = (b) => b.nom || (Array.isArray(b.locataires) ? b.locataires.map((l) => l && l.nom).filter(Boolean).join(' & ') : '') || '';

/**
 * Assemble l'entrée `LotIn` de suiviLot depuis les collections BRUTES de l'app (injectées :
 * aucune lecture de `DB` globale). Même forme de baux que bailsFromRaw (bail COURANT : seule
 * finEffective le clôt, tacite reconduction C7 ; bail archivé : finEffective|fin).
 * @param {string} ref
 * @param {Object} db { baux, baux_historique, loyerBareme, mouvements, baux_evenements }
 * @param {{catLigne:function, isGli?:function, bailCleOf?:function,
 *          debutSuivi?:{date,source}}} opts `debutSuivi` absent ⇒ défaut provisoire
 */
export function lotDepuisDb(ref, db, opts) {
  const D = db || {};
  const o = opts || {};
  const want = _nr(ref);
  let cur = D.baux && D.baux[ref];
  if (!cur && D.baux) for (const k of Object.keys(D.baux)) { if (_nr(k) === want) { cur = D.baux[k]; break; } }
  const baux = [];
  const mk = (b, archive) => {
    const x = {
      cle: cleBail(ref, b), debut: String(b.debut).slice(0, 10),
      fin: archive ? (b.fin || null) : null, finEffective: b.finEffective || null, archive,
      hc: Number(b.hc) || 0, ch: Number(b.ch) || 0, noms: _nomsBail(b)
    };
    const dg = _dgDuBail(b);
    if (dg) x.dg = dg;
    if (b.anteriorite && typeof b.anteriorite === 'object') {
      x.ouverture = { loyer: Number(b.anteriorite.loyer) || 0, charge: Number(b.anteriorite.charge) || 0, avance: Number(b.anteriorite.avance) || 0 };
    }
    return x;
  };
  if (cur && !cur._deleted && cur.debut) baux.push(mk(cur, false));
  for (const b of (D.baux_historique || [])) {
    if (!b || b._deleted || !b.debut || _nr(b.ref) !== want) continue;
    baux.push(mk(b, true));
  }
  baux.sort((x, y) => x.debut.localeCompare(y.debut));
  const isGli = typeof o.isGli === 'function' ? o.isGli : ((mv) => mv.cat === 'Indemnité GLI / loyers impayés');
  const paiements = collecterPaiements(D.mouvements, { ref, catLigne: o.catLigne, isGli, bailCleOf: o.bailCleOf });
  const manques = (D.baux_evenements || [])
    .filter((e) => e && e.type === 'manque_accepte' && _nr(e.ref) === want)
    .map((e) => {
      const bd = String(e.bailDebut || '').slice(0, 10);
      const b = baux.find((x) => x.debut === bd && (!e.bailUid || x.cle.endsWith('|' + e.bailUid)));
      return {
        id: e.id, bailCle: b ? b.cle : cleBail(ref, { debut: bd, _bailUid: e.bailUid }),
        ym: e.ym, montant: Number(e.montant) || 0, motif: e.motif || '', date: e.date || null, _deleted: !!e._deleted
      };
    });
  const lot = { ref, baux, bareme: D.loyerBareme || [], paiements, manques };
  lot.debutSuivi = (o.debutSuivi && _isIso(o.debutSuivi.date)) ? o.debutSuivi : debutSuiviDefaut(lot);
  return lot;
}
