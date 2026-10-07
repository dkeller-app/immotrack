// Reconstitution Finances / Loyers pour le lot "Ferrette - 101" (Elise ARSLAN), données réelles.
// node arslan-101.mjs   (lecture seule du repo)
import { readFileSync } from 'node:fs';
const R = '/home/user/immotrack/js/core/';
const LG = new URL('./legacy/', import.meta.url);   // P7 : anciens moteurs figés
const { _computeFinancesMonthly } = await import(new URL('finances-monthly.legacy.mjs', LG));
const { duMoisFromRaw, bailsFromRaw } = await import(R + 'loyer-du-mois.js');
const { _computeLoyerNetting, _debutSuivi } = await import(new URL('loyer-du-mois.legacy.mjs', LG));
const { _computeLoyerChargeAlloc } = await import(new URL('loyer-statut.legacy.mjs', LG));
const { etatMoisLot, ymRange } = await import(new URL('loyers-mois.legacy.mjs', LG));

const DB = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const LOT = 'Ferrette - 101', YR = 2026, TODAY = '2026-10-05';
const LOY = new Set(['Loyers encaissés']);              // seule cat 211 présente sur ce lot (DG = special, ligne vide)
const catLigne = (c) => LOY.has(c) ? { ligne2044: '211', type: 'recette' } : null;
const mvLot = DB.mouvements.filter(m => m && !m._deleted && m.qui === LOT);

// --- répliques fidèles de l'app (app-part1.js:8860-8883, 8981-8999 ; app-part2.js:29435-29443)
const raw = { currentBail: DB.baux[LOT], bauxHistorique: DB.baux_historique, bareme: DB.loyerBareme };
const startIso = mvLot.filter(m => LOY.has(m.cat) && m.cr > 0).map(m => m.date).sort()[0];
const startMi = startIso < YR + '-01-01' ? 0 : parseInt(startIso.slice(5, 7)) - 1;
const loyerDue = (q, ym) => {
  if (q !== LOT) return { hc: 0, ch: 0 };
  const m0 = parseInt(ym.slice(5, 7)) - 1, y = parseInt(ym.slice(0, 4));
  if (y < YR || (y === YR && m0 < startMi)) return { hc: 0, ch: 0 };
  const d = duMoisFromRaw(LOT, ym, raw); return { hc: d.hc, ch: d.ch };
};
console.log('1er versement =', startIso, '→ startMi', startMi);

// (a) Finances : fenêtre constat lastMonth=10, exigibilité dueMonth=10, today 05/10 → graceLast
const fin = _computeFinancesMonthly({
  mouvements: mvLot, year: YR, scope: null, scopeWeight: () => 1, catLigne, loyerDue,
  activeLots: [LOT], window: { lastMonth: 10, dueMonth: 10, today: TODAY },
});
const bl = fin.byLot[LOT];
console.log('\n(a) Finances byLot (dueMonth', fin.dueMonth, ')');
console.table(bl.months);
console.log('annual', bl.annual, 'solde', bl.solde);

// (b) netting compensé seul, (c) charge-alloc non compensé
const months = bl.months.map(m => ({ hcDue: m.duHC, chDue: m.duCH, received: m.encaisse }));
const net = _computeLoyerNetting(months, true);
const alloc = _computeLoyerChargeAlloc(months);
console.log('\n(b) netting retardMois / avance par mois / causes');
console.table(bl.months.map((m, i) => ({ ym: m.ym, ...net.retardMois[i], avanceApres: net.months[i].avance, arrLoy: net.months[i].loyerArrear, arrCh: net.months[i].chargeArrear })));
console.log('causeLoyer', net.causeLoyer, 'causeCharge', net.causeCharge);
console.log('\n(c) charge-alloc');
console.table(alloc.map((a, i) => ({ ym: bl.months[i].ym, ...a })));

// (d) onglet Loyers : etatMoisLot (app-part1.js:9014-9058), sans/avec tolérance
const recu = {}, src = {}; let fp = null;
for (const m of mvLot) { if (!(m.cr > 0) || !LOY.has(m.cat)) continue; const ym = m.date.slice(0, 7);
  recu[ym] = (recu[ym] || 0) + m.cr; (src[ym] = src[ym] || []).push({ date: m.date, id: m.id, montant: m.cr }); if (!fp || ym < fp) fp = ym; }
const startYm = _debutSuivi({ ref: LOT, bails: bailsFromRaw(LOT, raw), bareme: DB.loyerBareme }, fp);
for (const g of [false, true]) {
  const et = etatMoisLot(ymRange(startYm, TODAY.slice(0, 7)).map(ym => { const d = duMoisFromRaw(LOT, ym, raw);
    return { ym, hcDue: d.hc, chDue: d.ch, received: recu[ym] || 0, sources: src[ym] || [] }; }), { graceLast: g });
  console.log('\n(d) etatMoisLot graceLast=' + g, 'debutSuivi', startYm, 'reste', et.reste, 'avance', et.avance);
  console.table(et.list.map(e => ({ ym: e.ym, du: e.du, recu: e.received, resteL: e.resteLoyer, resteC: e.resteCharge, solde: e.solde, pay: e.paiements.map(p => p.date + ':' + p.montant + p.poste[0]).join(' ') })));
}
// contrôle F-101 (autre lot) : aucune intersection
console.log('\nF-101 mvts dans le lot ?', mvLot.some(m => m.qui === 'F-101'), '| barème Ferrette - 101 :', DB.loyerBareme.filter(p => p.ref === LOT));
