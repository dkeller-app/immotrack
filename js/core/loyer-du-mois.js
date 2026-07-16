/**
 * core/loyer-du-mois.js — AUDIT-SUIVI-LOYERS étape 1 (2026-07-15) :
 * LE résolveur unique du dû d'un mois (audit docs/subjects/AUDIT-SUIVI-LOYERS-2026-07-14.md,
 * décisions actées 14/07). Remplace à terme les 4 moteurs divergents
 * (_finBailHcChAt / _suiviLoyerStrip / _v4ComputeLotStatus / _pilCumulLocataire).
 *
 * Le fil conducteur : le loyer d'un mois est une DONNÉE, pas une déduction.
 *   1. Mois QUITTANCÉ → le montant de la quittance émise, figé (B3 : re-imprimer ≠ re-calculer).
 *   2. Sinon → le barème historisé DB.loyerBareme (périodes datées ; une révision IRL
 *      porte une date d'effet EXPLICITE, jamais rétroactive — Q1).
 *   3. Sinon (barème absent/lacunaire) → repli hc/ch du bail du segment (figé pour un
 *      bail archivé, courant pour le bail actif) — comblé par la migration (étape 3).
 *
 * Occupation (les baux) :
 *   - tombstones filtrés (C10) ;
 *   - la fin qui compte pour le dû est finEffective (clôture) ; la fin CONTRACTUELLE d'un
 *     bail COURANT est ignorée (tacite reconduction, C7 : un reconduit qui cesse de payer
 *     reste visible) ; un bail archivé sans finEffective retombe sur sa fin papier ;
 *   - chevauchements TRONQUÉS défensivement (un lot n'a qu'un occupant à la fois) : l'ancien
 *     bail s'arrête à la veille du suivant (C4/CAS 5 : fin du dû doublé au re-bail) ;
 *   - prorata jours d'occupation (entrée/sortie/transition intra-mois, loi 6 juil. 1989).
 *
 * Pur / testable : aucune lecture de DB — tout le contexte est injecté.
 * Tests : __tests__/helpers/loyer-du-mois.test.js (CAS 0-6 du harness
 * _import/repro-audit-suivi-loyers.mjs, encodés en comportement ATTENDU).
 */

const _r2 = (n) => Math.round(n * 100) / 100;
const _isAlive = (o) => !!o && !o._deleted;
// Ref TOLÉRANTE (trim + minuscule), même politique que _loyerHCAtDate/_findBailByRefTolerant :
// une période enregistrée avec une ref légèrement différente reste rattachée (CAS 3).
const _nr = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _isoShift = (iso, jours) => {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() + jours);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const _isoVeille = (iso) => _isoShift(iso, -1);
const _isoLendemain = (iso) => _isoShift(iso, +1);

/**
 * Les périodes de barème d'un lot : ref tolérante, tombstones filtrés, triées par début.
 * C'est LE sélecteur (unique) — plus jamais de filtre strict qui rend l'historique invisible.
 * @param {Array} bareme collection globale DB.loyerBareme (ou déjà scopée)
 * @param {string} ref ref du lot
 */
export function _baremeOfLot(bareme, ref) {
  const want = _nr(ref);
  return (bareme || [])
    .filter((p) => _isAlive(p) && p.debut && _nr(p.ref) === want)
    .slice()
    .sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
}

/** Période du barème en vigueur à une date (dernière dont debut <= date, fin ouverte ou >= date). */
function _periodeAt(periods, iso) {
  let hit = null;
  for (const p of periods) {
    const d = String(p.debut).slice(0, 10);
    if (d > iso) break;
    if (!p.fin || String(p.fin).slice(0, 10) >= iso) hit = p;
    else hit = null;                        // trou entre deux périodes → repli bail
  }
  return hit;
}

/**
 * Segments d'occupation normalisés depuis les baux du lot (vivants, triés, TRONQUÉS).
 * end = null → occupation ouverte (bail courant, tacite reconduction incluse).
 */
function _occupation(bails) {
  const segs = (bails || [])
    .filter((b) => _isAlive(b) && b.debut)
    .map((b) => ({
      debut: String(b.debut).slice(0, 10),
      // Bail archivé sans finEffective NI fin (données cassées) : reste ouvert ici — la
      // troncature par le bail suivant le rattrape ; l'étape 2 (archiverBail pose
      // finEffective) ferme le cas à l'écriture, la migration (étape 3) répare le stock.
      end: b.finEffective ? String(b.finEffective).slice(0, 10)
        : (b.archive ? (b.fin ? String(b.fin).slice(0, 10) : null) : null),
      hc: Number(b.hc) || 0,
      ch: Number(b.ch) || 0
    }))
    .sort((a, b) => a.debut.localeCompare(b.debut));
  for (let i = 0; i < segs.length - 1; i++) {
    const veille = _isoVeille(segs[i + 1].debut);
    if (!segs[i].end || segs[i].end > veille) segs[i].end = veille;
  }
  return segs;
}

/**
 * LE dû d'un mois pour un lot. Politiques : quittance figée > barème daté > repli bail.
 * @param {Object} ctx { ref, bails:[{debut,fin,finEffective,archive,hc,ch,_deleted}],
 *                       bareme:[{ref,debut,fin,hc,ch,_deleted}], quittances:[{ym,hc,ch,_deleted}] }
 * @param {string} ym 'YYYY-MM'
 * @returns {{hc:number, ch:number, total:number, source:'quittance'|'bareme'|'bail'|'vacance'}}
 */
export function duMois(ctx, ym) {
  const empty = { hc: 0, ch: 0, total: 0, source: 'vacance' };
  if (!ctx || !/^\d{4}-\d{2}$/.test(String(ym || ''))) return empty;
  ym = String(ym);

  // 1. Le mois est quittancé → le document émis fait foi, définitivement (B3).
  // Plusieurs quittances vivantes sur le même mois : la DERNIÈRE de la collection gagne
  // (collections append-only → la plus récemment émise).
  let q = null;
  for (const x of ctx.quittances || []) { if (_isAlive(x) && String(x.ym) === ym) q = x; }
  if (q) {
    const hc = _r2(Number(q.hc) || 0), ch = _r2(Number(q.ch) || 0);
    return { hc, ch, total: _r2(hc + ch), source: 'quittance' };
  }

  // 2. Occupation × barème, prorata jours.
  const y = parseInt(ym.slice(0, 4), 10);
  const m = parseInt(ym.slice(5, 7), 10);
  const first = ym + '-01';
  const joursDansMois = new Date(y, m, 0).getDate();
  const last = ym + '-' + String(joursDansMois).padStart(2, '0');
  const periods = _baremeOfLot(ctx.bareme, ctx.ref);

  let hc = 0, ch = 0, usedBareme = false, occupied = false;
  for (const seg of _occupation(ctx.bails)) {
    const d0 = seg.debut > first ? seg.debut : first;
    const d1 = (seg.end && seg.end < last) ? seg.end : last;
    if (d0 > d1) continue;
    occupied = true;
    // Sous-segments aux frontières des périodes de barème (une correction manuelle peut
    // tomber en cours de mois — Q1 ne produit que des 1ers du mois, mais on reste exact).
    const cuts = new Set([d0]);
    for (const p of periods) {
      const pd = String(p.debut).slice(0, 10);
      if (pd > d0 && pd <= d1) cuts.add(pd);
      if (p.fin) {
        const nd = _isoLendemain(String(p.fin).slice(0, 10));
        if (nd > d0 && nd <= d1) cuts.add(nd);
      }
    }
    const starts = Array.from(cuts).sort();
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i];
      const e = i + 1 < starts.length ? _isoVeille(starts[i + 1]) : d1;
      const jours = parseInt(e.slice(8, 10), 10) - parseInt(s.slice(8, 10), 10) + 1;
      if (jours <= 0) continue;
      const p = _periodeAt(periods, s);
      if (p) usedBareme = true;
      // Repli champ par champ, symétrique : une période sans hc (ou sans ch) retombe
      // sur la valeur du bail du segment.
      const rHc = p && p.hc != null ? (Number(p.hc) || 0) : seg.hc;
      const rCh = p && p.ch != null ? (Number(p.ch) || 0) : seg.ch;
      const f = jours / joursDansMois;
      hc += rHc * f;
      ch += rCh * f;
    }
  }
  if (!occupied) return empty;
  hc = _r2(hc); ch = _r2(ch);
  // `source` est un label de diagnostic : un mois MIXTE (barème sur une partie, repli
  // bail sur l'autre) est étiqueté 'bareme' — affiner à l'étape 3 si l'écran en a besoin.
  return { hc, ch, total: _r2(hc + ch), source: usedBareme ? 'bareme' : 'bail' };
}

/**
 * AUDIT-SUIVI-LOYERS étape 4 — assemble le ctx duMois depuis les collections BRUTES de l'app,
 * puis délègue à duMois(). POINT D'ENTRÉE UNIQUE des 5 surfaces (via l'inline _duMoisLot).
 * La forme des baux est le point sensible : un bail COURANT à fin contractuelle passée reste
 * OUVERT (tacite reconduction, C7) — seule finEffective le clôture ; un bail archivé se clôt sur
 * finEffective|fin. On préserve donc la distinction (≠ _getAllBailsForLog qui la collapse).
 * @param {string} ref ref du lot
 * @param {string} ym 'YYYY-MM'
 * @param {Object} raw { currentBail:DB.baux[ref]|null, bauxHistorique:DB.baux_historique,
 *                       bareme:DB.loyerBareme, quittances:[{ym,hc,ch,_deleted}] du lot }
 */
export function duMoisFromRaw(ref, ym, raw) {
  raw = raw || {};
  const want = _nr(ref);
  const bails = [];
  const cur = raw.currentBail;
  if (cur && !cur._deleted && cur.debut) {
    // Bail COURANT : fin contractuelle IGNORÉE pour le dû (tacite reconduction) — on ne passe
    // que finEffective à duMois, jamais `fin`, et archive:false.
    bails.push({ debut: cur.debut, finEffective: cur.finEffective || null, archive: false, hc: Number(cur.hc) || 0, ch: Number(cur.ch) || 0 });
  }
  for (const b of (raw.bauxHistorique || [])) {
    if (!b || b._deleted || !b.debut || _nr(b.ref) !== want) continue;
    bails.push({ debut: b.debut, fin: b.fin || null, finEffective: b.finEffective || null, archive: true, hc: Number(b.hc) || 0, ch: Number(b.ch) || 0 });
  }
  return duMois({ ref, bails, bareme: raw.bareme || [], quittances: raw.quittances || [] }, ym);
}

/**
 * Départ du suivi d'un lot (B2, décision user) : 1er versement du lot, avec le rattrapage
 * d'entrée réintégré (C6) — les mois entre le début du bail et le 1er versement sont DUS
 * (pas une avance) ; le bornage ne s'applique qu'aux MILLÉSIMES antérieurs au suivi
 * (les années sans données restent bornées — pas de « −63 050 € » fantôme).
 * Aucun paiement : début du bail SI un bail est encore actif (zéro paiement = pire retard,
 * pas invisible) ; sinon null (rien à suivre).
 * @param {Object} ctx même contexte que duMois
 * @param {string|null} firstPaymentYm 'YYYY-MM' du 1er versement du lot, ou null
 * @returns {string|null} 'YYYY-MM' de départ du suivi
 */
export function _debutSuivi(ctx, firstPaymentYm) {
  const segs = _occupation(ctx && ctx.bails);
  if (!segs.length) return null;
  const fp = /^\d{4}-\d{2}$/.test(String(firstPaymentYm || '')) ? String(firstPaymentYm) : null;
  if (!fp) {
    const open = segs.find((s) => !s.end);
    return open ? open.debut.slice(0, 7) : null;
  }
  let cand = null;
  for (const s of segs) { if (s.debut.slice(0, 7) <= fp) cand = s; }
  if (!cand) cand = segs[0];                       // 1er versement pendant une vacance amont
  const candYm = cand.debut.slice(0, 7);
  const janSuivi = fp.slice(0, 4) + '-01';
  return candYm > janSuivi ? candYm : janSuivi;
}

/**
 * Passage chronologique d'imputation des encaissements sur les dûs — MOTEUR PARTAGÉ.
 * Même algorithme que l'historique _computeLoyerArrears (cascade loyer courant → charges
 * courant → récup arriérés loyer FIFO → récup arriérés charges FIFO, files des manques
 * par mois pour le drill « cause du retard ») + option `carry` : l'excédent d'un mois
 * (avance) est REPORTÉ sur les mois suivants et couvre leurs dûs AVANT de laisser naître
 * un retard (netting avance↔retard, C2/CAS 6 — décision user 14/07). Sans `carry`,
 * comportement legacy à l'identique (consommé par _computeLoyerArrears jusqu'à l'étape 4).
 * @param {Array<{hcDue:number, chDue:number, received:number}>} months chronologiques (échus)
 * @param {{carry?:boolean, graceLast?:boolean}} [opts]
 */
export function _loyerArrearsPass(months, opts) {
  const carry = !!(opts && opts.carry);
  const graceLast = !!(opts && opts.graceLast);
  const ms = months || [];
  const lastIdx = ms.length - 1;
  const loyerQ = [], chargeQ = [];                  // files des manques : {idx, short, due, recv}
  const sumQ = (q) => q.reduce((s, e) => s + e.short, 0);
  const recover = (q, amt) => { let a = amt; for (const e of q) { if (a <= 0.0000001) break; const t = Math.min(a, e.short); e.short -= t; a -= t; } };
  let avanceCarry = 0;
  const perMonth = ms.map((m, idx) => {
    const hcDue = Math.max(0, Number(m.hcDue) || 0);
    const chDue = Math.max(0, Number(m.chDue) || 0);
    const recv = Number(m.received) || 0;
    const grace = graceLast && idx === lastIdx;     // mois courant sous tolérance : manque neuf non compté
    let pool = Math.max(0, recv) + (carry ? avanceCarry : 0);
    if (carry) avanceCarry = 0;
    const loyerCur = Math.min(pool, hcDue); pool -= loyerCur;
    const loyerShort = hcDue - loyerCur;
    if (loyerShort > 0.005 && !grace) loyerQ.push({ idx, short: loyerShort, due: hcDue, recv });
    const chargeCur = Math.min(pool, chDue); pool -= chargeCur;
    const chargeShort = chDue - chargeCur;
    if (chargeShort > 0.005 && !grace) chargeQ.push({ idx, short: chargeShort, due: chDue, recv });
    const recL = Math.min(pool, sumQ(loyerQ)); pool -= recL; recover(loyerQ, recL);   // arriérés loyer (priorité)
    const recC = Math.min(pool, sumQ(chargeQ)); pool -= recC; recover(chargeQ, recC);
    const out = { loyerArrear: _r2(sumQ(loyerQ)), chargeArrear: _r2(sumQ(chargeQ)) };
    if (carry) { avanceCarry = pool; out.avance = _r2(avanceCarry); }
    return out;
  });
  const clean = (q) => q.filter((e) => e.short > 0.005).map((e) => ({ idx: e.idx, short: _r2(e.short), due: _r2(e.due), recv: _r2(e.recv) }));
  const last = perMonth.length ? perMonth[perMonth.length - 1] : { loyerArrear: 0, chargeArrear: 0 };
  // RÉSIDU par mois (colonnes P&L) : le manque ENCORE dû attribué à son mois d'origine
  // (net des rattrapages ET du netting). Invariant : Σ = arriéré final.
  const residual = (q) => { const a = ms.map(() => 0); q.forEach((e) => { if (e.short > 0.005) a[e.idx] = _r2(a[e.idx] + e.short); }); return a; };
  const loyerRes = residual(loyerQ), chargeRes = residual(chargeQ);
  const retardMois = ms.map((m, idx) => ({ loyer: loyerRes[idx], charge: chargeRes[idx] }));
  const res = { months: perMonth, retardMois, loyerArrear: last.loyerArrear, chargeArrear: last.chargeArrear, causeLoyer: clean(loyerQ), causeCharge: clean(chargeQ) };
  if (carry) res.avance = _r2(avanceCarry);
  return res;
}

/**
 * Arriérés + avance d'un lot AVEC netting avance↔retard (LA politique cible des 5 surfaces,
 * étape 4). Une avance disponible couvre les mois dus suivants avant de laisser naître un
 * retard → retard>0 ET avance>0 simultanés impossibles par construction.
 * `months[].avance` = avance résiduelle APRÈS le mois (l'avance « vit » au mois qui la reçoit
 * et s'éteint au mois qui la consomme). NE CHANGE PAS l'imputation fiscale (encaissement,
 * _computeLoyerChargeAlloc) — la 2044 est en amont, intouchable.
 * @param {Array<{hcDue:number, chDue:number, received:number}>} months chronologiques (échus)
 * @param {boolean} [graceLast] neutralise le manque neuf du dernier mois (tolérance <10)
 */
export function _computeLoyerNetting(months, graceLast) {
  return _loyerArrearsPass(months, { carry: true, graceLast: !!graceLast });
}
