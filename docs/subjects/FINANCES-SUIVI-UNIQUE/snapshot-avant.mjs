// FINANCES-SUIVI-UNIQUE P0 — INSTANTANÉ « AVANT » des trois moteurs ACTUELS + agrégats fiscaux.
//
//   node docs/subjects/FINANCES-SUIVI-UNIQUE/snapshot-avant.mjs <export.json> [AAAA-MM-JJ] > instantane.json
//
// Lecture seule. L'export contient des données réelles : NE JAMAIS versionner ni l'export ni la
// sortie (à garder hors du dépôt). Sortie JSON STABLE (clés triées) pour un diff exact.
//
// Pour chaque lot de l'export (logements vivants ∪ lots porteurs d'un byLot Finances) :
//   ① finances  — _computeFinancesMonthly (js/core/finances-monthly.js), câblé comme _finMonthly
//                 (app-part2.js) : fenêtre de CONSTAT, loyerDue = _finBailHcChAt (début au 1er
//                 versement du lot, _getLogementStartIso app-part1.js), activeLots, résolveurs M-1 ;
//   ② loyers    — etatMoisLot (js/core/loyers-mois.js) câblé comme _loyerEtatLot (app-part1.js) :
//                 encaissé cr>0, début _debutSuivi ; + retardLot(toléranceActive) comme _lyEtatLot ;
//   ③ bandeau   — _computeLoyerStatut (js/core/loyer-statut.js) câblé comme _suiviLoyerStrip
//                 (app-part1.js) + _loyerSoldeAjuste ;
//   fiscal      — loyersHC, provisions, base2044 (+ loyersBrut, avance, recettesDiverses) annuels
//                 et mensuels du P&L, périmètre « tout » (invariant I-h du chantier).
// Les répliques suivent le code de js/app/*.js au 06/10/2026 (même démarche que repro-arslan-101.mjs) ;
// la seule valeur injectée est `today` (le jour de l'export), l'app lisant l'horloge.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../../../', import.meta.url);
const CORE = new URL('js/core/', ROOT);
const { _computeFinancesMonthly } = await import(new URL('finances-monthly.js', CORE));
const { duMoisFromRaw, bailsFromRaw, _debutSuivi } = await import(new URL('loyer-du-mois.js', CORE));
const { _computeLoyerStatut, _loyerSoldeAjuste, _loyerToleranceActive, _loyerTodayLocal } = await import(new URL('loyer-statut.js', CORE));
const { etatMoisLot, ymRange, retardLot } = await import(new URL('loyers-mois.js', CORE));
const { computeConstatWindow } = await import(new URL('finances-window.js', CORE));
const { _isLoyerCategory, catCtxFromDb } = await import(new URL('utils.js', CORE));

/** Le référentiel STD_CATEGORIES de l'app, LU dans app-part1.js (pas recopié : il ne peut pas diverger). */
export function stdCategories() {
  const src = readFileSync(new URL('js/app/app-part1.js', ROOT), 'utf8');
  const a = src.indexOf('const STD_CATEGORIES = [');
  const b = src.indexOf('\n];', a);
  if (a < 0 || b < 0) throw new Error('STD_CATEGORIES introuvable dans app-part1.js');
  return new Function('return ' + src.slice(a + 'const STD_CATEGORIES = '.length, b + 2))();
}

/** JSON à clés triées (diff stable). */
export function stableStringify(v) {
  const tri = (x) => (Array.isArray(x) ? x.map(tri)
    : (x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { o[k] = tri(x[k]); return o; }, {}) : x));
  return JSON.stringify(tri(v), null, 1);
}

/** Résolveurs de l'app reconstitués sur un export (aucun global). */
export function contexteApp(DB, today) {
  const STD = stdCategories();
  const stdByName = (n) => STD.find((c) => c.nom === n);
  const nr = (s) => String(s == null ? '' : s).trim().toLowerCase();
  // _finCatMere / _finCatLigne (app-part2.js) — STD, alias, puis replis legacy clé par clé.
  const catMere = (cat) => {
    if (!cat) return null;
    const std = stdByName(cat);
    if (std) return std;
    const alias = (DB.catAlias || {})[cat];
    if (alias) { const m = stdByName(alias); if (m) return m; }
    const m = (DB.catMapping || {})[cat] || ((DB.params && DB.params.legal2044Mapping) || {})[cat];
    if (m === '__ignore') return stdByName('Divers (non déductible)');
    if (m) { const mere = STD.find((c) => c.ligne2044 === m); if (mere) return mere; }
    return null;
  };
  const catLigne = (cat) => { const m = catMere(cat); return m && m.ligne2044 ? { ligne2044: m.ligne2044, type: m.type } : null; };
  const catCtx = catCtxFromDb(DB, STD);
  const isLoyerCat = (cat) => _isLoyerCategory(cat, catCtx);
  const findBail = (ref) => {                                // _findBailByRefTolerant
    if (!DB.baux) return null;
    if (DB.baux[ref]) return DB.baux[ref];
    for (const k of Object.keys(DB.baux)) if (nr(k) === nr(ref)) return DB.baux[k];
    return null;
  };
  const raw = (ref) => ({ currentBail: findBail(ref), bauxHistorique: DB.baux_historique || [], bareme: DB.loyerBareme || [] });
  const duLot = (ref, ym) => duMoisFromRaw(ref, ym, raw(ref));             // _duMoisLot
  const allBails = (ref) => {                                             // _getAllBailsForLog (débuts seuls)
    const out = [];
    const cur = findBail(ref);
    if (cur && !cur._deleted && cur.debut) out.push(cur.debut);
    (DB.baux_historique || []).forEach((b) => { if (b && !b._deleted && b.debut && (b.ref === ref || nr(b.ref) === nr(ref))) out.push(b.debut); });
    return out.sort();
  };
  const logementStartIso = (ref) => {                                     // _getLogementStartIso (sans filtre tombstone, fidèle)
    let first = null;
    for (const m of (DB.mouvements || [])) {
      if (m.qui !== ref) continue;
      if (!isLoyerCat(m.cat) || !(m.cr > 0) || !m.date) continue;
      if (!first || m.date < first) first = m.date;
    }
    if (first) return first;
    const b = allBails(ref);
    return b.length ? b[0] : null;
  };
  const logementStartMi = (ref, yr) => {                                  // _getLogementStartMi
    const iso = logementStartIso(ref);
    if (!iso) return null;
    if (iso > yr + '-12-31') return null;
    if (iso < yr + '-01-01') return 0;
    return parseInt(iso.slice(5, 7), 10) - 1;
  };
  const finBailHcChAt = (qui, ym) => {                                    // _finBailHcChAt
    if (!qui || !ym) return { hc: 0, ch: 0 };
    const y = parseInt(ym.slice(0, 4), 10), m0 = parseInt(ym.slice(5, 7), 10) - 1;
    const startMi = logementStartMi(qui, y);
    if (startMi == null || m0 < startMi) return { hc: 0, ch: 0 };
    const d = duLot(qui, ym);
    return { hc: d.hc || 0, ch: d.ch || 0 };
  };
  return { STD, catMere, catLigne, isLoyerCat, findBail, raw, duLot, logementStartIso, finBailHcChAt, nr, today };
}

/** Les sorties des 3 moteurs actuels + le fiscal, pour chaque lot de l'export. */
export function moteursActuels(DB, today) {
  const C = contexteApp(DB, today);
  const yr = parseInt(today.slice(0, 4), 10);
  const todayYm = today.slice(0, 7);
  const tol = _loyerToleranceActive(today);
  const alive = (x) => x && !x._deleted;
  const logements = (DB.logements || []).filter((l) => l && !l._deleted && l.ref);

  // ── ① Finances (_finMonthly, périmètre « tout ») ─────────────────────────────
  const activeLots = logements.map((l) => l.ref).filter((ref) => {
    for (let mm = 1; mm <= 12; mm++) { const d = C.finBailHcChAt(ref, yr + '-' + String(mm).padStart(2, '0')); if ((d.hc || 0) + (d.ch || 0) > 0.005) return true; }
    return false;
  });
  const isRecupACharge = (m) => {                                         // _finIsRecupACharge
    if (!m || !m.date) return false;
    const ym = String(m.date).slice(0, 7);
    const qui = m.qui || '';
    if (qui && qui.indexOf('SCI:') !== 0) {
      const lg = logements.find((l) => l.ref === qui);
      if (lg && lg.compteCharges === false) return true;
      const d = C.finBailHcChAt(qui, ym);
      return ((d.hc || 0) + (d.ch || 0)) <= 0.005;
    }
    if (!qui && m.imm) {
      const lots = logements.filter((l) => l.imm === m.imm);
      if (!lots.length) return false;
      return !lots.some((l) => { const d = C.finBailHcChAt(l.ref, ym); return ((d.hc || 0) + (d.ch || 0)) > 0.005; });
    }
    return false;
  };
  const win = computeConstatWindow({ year: yr, today, mouvements: DB.mouvements || [],
    filtreMouvement: (mv) => { const r = C.catLigne(mv && mv.cat); return !(r && r.ligne2044 === '250'); } });
  const fin = _computeFinancesMonthly({
    mouvements: DB.mouvements || [], year: yr, scope: null,
    scopeWeight: (s, m) => ((!m || m._deleted) ? 0 : 1),
    catLigne: C.catLigne, loyerDue: C.finBailHcChAt, activeLots,
    isEcheance: (m) => { const mere = C.catMere(m && m.cat); return !!(mere && mere.nom === 'Prêt'); },
    isGestionCharge: (m) => { const mere = C.catMere(m && m.cat); return !!(mere && mere.gestionCharge); },
    isRecupCharge: (m) => { const mere = C.catMere(m && m.cat); return !!(mere && mere.recup); },
    isRecupACharge, window: win
  });
  const FISC = ['loyersBrut', 'loyersHC', 'provisions', 'avance', 'recettesDiverses', 'base2044'];
  const pick = (b) => FISC.reduce((o, k) => { o[k] = b[k]; return o; }, {});
  const fiscal = { annuel: pick(fin.annual), mois: fin.months.reduce((o, b) => { o[b.ym] = pick(b); return o; }, {}),
    fenetre: { lastMonth: fin.lastMonth, dueMonth: fin.dueMonth } };

  const refs = new Set(logements.map((l) => l.ref));
  Object.keys(fin.byLot || {}).forEach((r) => { if (r) refs.add(r); });
  const lots = {};
  for (const ref of [...refs].sort()) {
    // ── ② onglet Loyers (_loyerEtatLot + _lyEtatLot) ──────────────────────────
    const recu = {}, src = {};
    let fp = null;
    for (const m of (DB.mouvements || [])) {
      if (!alive(m) || m.qui !== ref || !((m.cr || 0) > 0) || !C.isLoyerCat(m.cat) || !m.date) continue;
      const ym = String(m.date).slice(0, 7);
      recu[ym] = (recu[ym] || 0) + (m.cr || 0);
      (src[ym] || (src[ym] = [])).push({ date: String(m.date).slice(0, 10), id: m.id != null ? m.id : null, montant: m.cr || 0 });
      if (!fp || ym < fp) fp = ym;
    }
    const raw = C.raw(ref);
    const startYm = _debutSuivi({ ref, bails: bailsFromRaw(ref, raw), bareme: DB.loyerBareme || [] }, fp);
    const months = (startYm && startYm <= todayYm) ? ymRange(startYm, todayYm).map((ym) => {
      const d = C.duLot(ref, ym);
      return { ym, hcDue: d.hc || 0, chDue: d.ch || 0, received: recu[ym] || 0, sources: src[ym] || [] };
    }) : [];
    const etat = etatMoisLot(months, { graceLast: false });
    const rl = retardLot(etat, { toleranceActive: tol });
    const loyers = {
      debutSuivi: startYm, premierVersement: fp, reste: etat.reste, resteLoyer: etat.resteLoyer, resteCharge: etat.resteCharge,
      avance: etat.avance, retardAffiche: rl.reste, nbMoisNonSoldes: etat.nbMoisNonSoldes,
      list: etat.list.map((e) => ({ ym: e.ym, du: e.du, received: e.received, reste: e.reste, solde: e.solde }))
    };
    // ── ③ bandeau (_suiviLoyerStrip + _loyerSoldeAjuste) ─────────────────────
    const log = logements.find((l) => l.ref === ref);
    let bandeau = null;
    if (log) {
      const monthlyFull = (Number(log.hc) || 0) + (Number(log.ch) || 0);
      const totalPaid = (DB.mouvements || []).filter(alive).filter((m) => m.qui === ref && (m.cr || 0) > 0 && C.isLoyerCat(m.cat) && m.date && m.date.startsWith(String(yr)))
        .reduce((s, m) => s + (m.cr || 0), 0);
      const s = _computeLoyerStatut({ year: yr, today, monthlyFull, totalPaid,
        dueOfMonth: (mi0) => C.duLot(ref, yr + '-' + String(mi0 + 1).padStart(2, '0')).total });
      bandeau = { solde: s.solde, soldeAjuste: Math.round(_loyerSoldeAjuste(s, today) * 100) / 100, recu: s.recu, attendu: s.attendu,
        totalPaid: Math.round(totalPaid * 100) / 100, frise: s.months.map((m) => m.cls).join(' ') };
    }
    const bl = fin.byLot && fin.byLot[ref];
    lots[ref] = {
      finances: bl ? { annual: bl.annual, solde: bl.solde, months: bl.months } : null,
      financesDebut: C.logementStartIso(ref),
      loyers, bandeau
    };
  }
  return { meta: { today, annee: yr, toleranceActive: tol, nbLots: Object.keys(lots).length }, fiscal, lots };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error('usage : node snapshot-avant.mjs <export.json> [AAAA-MM-JJ]'); process.exit(2); }
  const today = process.argv[3] || _loyerTodayLocal();
  const DB = JSON.parse(readFileSync(file, 'utf8'));
  process.stdout.write(stableStringify(moteursActuels(DB, today)) + '\n');
}
