// FINANCES-SUIVI-UNIQUE §F.2 — PREUVE SUR LES DONNÉES RÉELLES : les 3 moteurs actuels face au
// nouveau moteur (js/core/suivi-loyers.js), lot par lot.
//
//   node docs/subjects/FINANCES-SUIVI-UNIQUE/compare-moteurs.mjs <export.json> [AAAA-MM-JJ] [--avant instantane.json] [--detail]
//
// Lecture seule ; l'export et la sortie contiennent des données réelles (ne pas versionner).
//
// MÉTHODE — chaîne d'ablation. Pour chaque ancien chiffre, on part d'une VARIANTE du nouveau
// moteur configurée comme l'ancien (lot entier, début de suivi de l'ancien, encaissé cr>0 s'il y a
// lieu, sans retenue sur dépôt, sans arrondi). Cette variante DOIT redonner l'ancien chiffre au
// centime : sinon l'écart n'a pas de cause connue → SANS_CAUSE. Puis on réintroduit les règles du
// nouveau moteur UNE PAR UNE ; l'écart produit par chaque étape reçoit le code de cette règle :
//   DEBUT_SUIVI          début du suivi = 1er jour du mois du 1er loyer encaissé (provisoire)
//   CR_DB                encaissé = cr − db (l'onglet Loyers ne comptait que cr > 0, C12)
//   PAR_BAIL             compensation par bail, dette d'un locataire parti figée (Q2)
//   HORS_PERIODE         virements hors de tout bail rattachés au bail voisin (Q3)
//   DG                   retenue sur le dépôt comptée comme règlement du bail sorti
//   ARRONDI              écart < 1 € soldé en fin de mois
//   AVANCE_NON_COMPENSEE avance de Finances non compensée (_computeLoyerChargeAlloc, défaut C2)
//   BANDEAU_ANNUEL       bandeau : pool annuel depuis le 1er janvier, sans report ni tolérance au mois
//   GLI                  indemnité GLI (Q4 : ne réduit pas la dette — aucun écart attendu, info seule)
// Sortie : un tableau par lot, le décompte des écarts par code, et exit 1 s'il reste un écart
// SANS_CAUSE (ou, avec --avant, si le fiscal a bougé d'un centime : invariant I-h).
import { readFileSync } from 'node:fs';
import { moteursActuels, contexteApp } from './snapshot-avant.mjs';

const ROOT = new URL('../../../', import.meta.url);
const { suiviLot, lotDepuisDb } = await import(new URL('js/core/suivi-loyers.js', ROOT));
const { _loyerToleranceActive, _loyerTodayLocal } = await import(new URL('js/core/loyer-statut.js', ROOT));

const args = process.argv.slice(2);
const iAvant = args.indexOf('--avant');
const fichierAvant = iAvant >= 0 ? args[iAvant + 1] : null;
const positionnels = args.filter((a, i) => !a.startsWith('--') && !(iAvant >= 0 && i === iAvant + 1));
const file = positionnels.find((a) => !/^\d{4}-\d{2}-\d{2}$/.test(a));
if (!file) { console.error('usage : node compare-moteurs.mjs <export.json> [AAAA-MM-JJ] [--avant instantane.json] [--detail]'); process.exit(2); }
const today = positionnels.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || _loyerTodayLocal();
const DETAIL = args.includes('--detail');

const DB = JSON.parse(readFileSync(file, 'utf8'));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 0.01;
const todayYm = today.slice(0, 7);
const yr = today.slice(0, 4);
const tol = _loyerToleranceActive(today);
const C = contexteApp(DB, today);
const avant = moteursActuels(DB, today);
const isGli = (mv) => { const m = C.catMere(mv && mv.cat); return !!(m && /GLI/i.test(m.nom) && m.ligne2044 === '213'); };

// Variante du nouveau moteur → { retard, avance, solde } au mois d'aujourd'hui.
function variante(lotIn, v) {
  const L = Object.assign({}, lotIn, {
    baux: lotIn.baux.map((b) => { if (!v.sansDg) return b; const c = Object.assign({}, b); delete c.dg; return c; }),
    paiements: lotIn.paiements.filter((p) => !(v.positifs && p.kind === 'virement' && p.montant <= 0))
  });
  if (v.debut) L.debutSuivi = { date: v.debut, source: 'variante' };
  const opts = { today, graceLast: v.grace != null ? v.grace : tol, seuilArrondi: v.arrondi ? 1 : 0, parLot: !!v.parLot };
  if (v.sansHors) {
    const hp = new Set(suiviLot(L, opts).horsPeriode.map((h) => h.mvId));
    L.paiements = L.paiements.filter((p) => !hp.has(p.id));
  }
  const s = suiviLot(L, opts);
  const m = s.mois[todayYm] || { retard: 0, avance: 0, solde: 0 };
  return { retard: m.retard, avance: m.avance, solde: m.solde, s };
}

// Chaîne : [ [code, variante], ... ] ; la dernière est le nouveau moteur.
function chaine(depart, etapes, metrique) {
  const out = [];
  let prev = depart[metrique];
  for (const [code, v] of etapes) {
    const val = v[metrique];
    if (Math.abs(val - prev) > EPS) out.push({ code, de: r2(prev), a: r2(val), delta: r2(val - prev) });
    prev = val;
  }
  return out;
}

const parCode = {};
const sansCause = [];
const lignes = [];
const noter = (ref, moteur, metrique, ecarts) => ecarts.forEach((e) => {
  (parCode[e.code] = parCode[e.code] || []).push({ ref, moteur, metrique, delta: e.delta });
  if (e.code === 'SANS_CAUSE') sansCause.push({ ref, moteur, metrique, ...e });
});

for (const ref of Object.keys(avant.lots)) {
  const old = avant.lots[ref];
  const lotIn = lotDepuisDb(ref, DB, { catLigne: C.catLigne, isGli });
  const neuf = variante(lotIn, { arrondi: true });
  const sDefaut = lotIn.debutSuivi ? lotIn.debutSuivi.date : null;

  // Étapes communes du nouveau moteur, à partir d'un début de suivi par défaut, lot entier.
  const vParLot = variante(lotIn, { parLot: true, sansDg: true });
  const vParBailSansHors = variante(lotIn, { sansDg: true, sansHors: true });
  const vParBail = variante(lotIn, { sansDg: true });
  const vDg = variante(lotIn, {});
  const fin = [['PAR_BAIL', vParBailSansHors], ['HORS_PERIODE', vParBail], ['DG', vDg], ['ARRONDI', neuf]];

  // ① Finances ------------------------------------------------------------------
  const F = old.finances ? old.finances.annual : { retard: 0, avance: 0 };
  // Début effectif de ① : 1er versement du lot ; avant l'exercice, borné au 1er mouvement de la
  // base (_suiviStartYm de finances-monthly) — l'ouverture N-1 ne remonte pas plus loin.
  const isoF = old.financesDebut;
  let debutF = null;
  if (isoF) {
    const ymF = isoF.slice(0, 7);
    if (ymF >= yr + '-01') debutF = ymF + '-01';
    else {
      let g = null;
      for (const m of (DB.mouvements || [])) {
        if (!m || m._deleted || !m.date || !m.qui || String(m.date).slice(0, 7) >= yr + '-01') continue;
        const r = C.catLigne(m.cat); if (!r || r.ligne2044 !== '211') continue;
        const ym = String(m.date).slice(0, 7); if (!g || ym < g) g = ym;
      }
      debutF = (g ? (ymF > g ? ymF : g) : yr + '-01') + '-01';
    }
  }
  const v0F = debutF ? variante(lotIn, { parLot: true, sansDg: true, debut: debutF }) : { retard: 0, avance: 0, solde: 0 };
  const eF = [];
  if (Math.abs(F.retard - v0F.retard) > EPS) eF.push({ code: 'SANS_CAUSE', de: F.retard, a: v0F.retard, delta: r2(v0F.retard - F.retard) });
  eF.push(...chaine(v0F, [['DEBUT_SUIVI', vParLot], ...fin], 'retard'));
  noter(ref, '① Finances', 'retard', eF);
  const eFa = [];
  if (Math.abs(F.avance - v0F.avance) > EPS) eFa.push({ code: 'AVANCE_NON_COMPENSEE', de: F.avance, a: v0F.avance, delta: r2(v0F.avance - F.avance) });
  eFa.push(...chaine(v0F, [['DEBUT_SUIVI', vParLot], ...fin], 'avance'));
  noter(ref, '① Finances', 'avance', eFa);

  // ② onglet Loyers ---------------------------------------------------------------
  const Lo = old.loyers.retardAffiche;
  const debutL = old.loyers.debutSuivi ? old.loyers.debutSuivi + '-01' : null;
  const v0L = debutL ? variante(lotIn, { parLot: true, sansDg: true, positifs: true, debut: debutL }) : { retard: 0, avance: 0, solde: 0 };
  const v1L = debutL ? variante(lotIn, { parLot: true, sansDg: true, debut: debutL }) : v0L;
  const eL = [];
  if (Math.abs(Lo - v0L.retard) > EPS) eL.push({ code: 'SANS_CAUSE', de: Lo, a: v0L.retard, delta: r2(v0L.retard - Lo) });
  eL.push(...chaine(v0L, [['CR_DB', v1L], ['DEBUT_SUIVI', vParLot], ...fin], 'retard'));
  noter(ref, '② Loyers', 'retard', eL);

  // ③ bandeau ---------------------------------------------------------------------
  const eB = [];
  if (old.bandeau) {
    const B = old.bandeau;
    // (a) tolérance du bandeau : le dû du mois courant neutralisé en bloc (_loyerSoldeAjuste)
    // (b) le pool annuel compte les encaissements post-datés de l'année
    const fut = (DB.mouvements || []).filter((m) => m && !m._deleted && m.qui === ref && (m.cr || 0) > 0 && C.isLoyerCat(m.cat)
      && m.date && m.date.startsWith(yr) && String(m.date).slice(0, 7) > todayYm).reduce((t, m) => t + (m.cr || 0), 0);
    const raw0 = r2(B.solde - fut);
    const v0B = variante(lotIn, { parLot: true, sansDg: true, positifs: true, debut: yr + '-01-01', grace: false });
    if (Math.abs(B.soldeAjuste - B.solde) > EPS) eB.push({ code: 'BANDEAU_ANNUEL', de: B.soldeAjuste, a: B.solde, delta: r2(B.solde - B.soldeAjuste) });
    if (Math.abs(fut) > EPS) eB.push({ code: 'BANDEAU_ANNUEL', de: B.solde, a: raw0, delta: r2(-fut) });
    if (Math.abs(raw0 - v0B.solde) > EPS) eB.push({ code: 'SANS_CAUSE', de: raw0, a: v0B.solde, delta: r2(v0B.solde - raw0) });
    const v1B = variante(lotIn, { parLot: true, sansDg: true, positifs: true });
    eB.push(...chaine(v0B, [['BANDEAU_ANNUEL', v1B], ['CR_DB', vParLot], ...fin], 'solde'));
    noter(ref, '③ Bandeau', 'solde', eB);
  }

  // GLI : information (Q4) — couvert, sans effet sur la dette.
  const gli = r2(Object.values(neuf.s.mois).reduce((t, m) => t + (m.couvertGli || 0), 0));
  const sortis = neuf.s.baux.filter((b) => b.sorti && b.position.retardLoyer + b.position.retardCharge > EPS)
    .map((b) => b.cle.split('|')[1] + ':' + r2(b.position.retardLoyer + b.position.retardCharge));
  lignes.push({
    ref, debut: sDefaut, src: lotIn.debutSuivi ? lotIn.debutSuivi.source : '-',
    F: F.retard + '/' + F.avance, L: Lo, B: old.bandeau ? old.bandeau.soldeAjuste : '-',
    neuf: neuf.retard + '/' + neuf.avance, solde: neuf.solde,
    causes: [...new Set([...eF, ...eFa, ...eL, ...eB].map((e) => e.code))].join(' '),
    horsPeriode: neuf.s.horsPeriode.map((h) => h.date + '→' + (h.bailCle ? h.bailCle.split('|')[1] : 'aucun') + (h.aConfirmer ? '?' : '')).join(' '),
    sortis: sortis.join(' '), gli: gli || ''
  });
  if (DETAIL) {
    console.log('\n## ' + ref);
    for (const [n, e] of [['① retard', eF], ['① avance', eFa], ['② retard', eL], ['③ solde', eB]]) {
      e.forEach((x) => console.log('  ' + n.padEnd(10) + x.code.padEnd(22) + String(x.de).padStart(10) + ' → ' + String(x.a).padStart(10) + '  (' + (x.delta > 0 ? '+' : '') + x.delta + ')'));
    }
  }
}

console.log(`\nCOMPARE-MOTEURS · export du ${today} · ${lignes.length} lots · tolérance début de mois ${tol ? 'active' : 'inactive'}`);
console.log('F = Finances retard/avance · L = onglet Loyers (reste affiché) · B = bandeau (solde ajusté) · neuf = retard/avance au ' + todayYm + ' (partis visibles inclus)');
console.table(lignes);
console.log('\nÉcarts par code de cause (nombre d\'étapes non nulles · lots concernés) :');
const codes = ['DEBUT_SUIVI', 'CR_DB', 'PAR_BAIL', 'HORS_PERIODE', 'DG', 'ARRONDI', 'AVANCE_NON_COMPENSEE', 'BANDEAU_ANNUEL', 'GLI', 'SANS_CAUSE'];
for (const c of codes) {
  const l = parCode[c] || [];
  console.log('  ' + c.padEnd(22) + String(l.length).padStart(4) + '  · ' + [...new Set(l.map((x) => x.ref))].length + ' lot(s)');
}
let echec = false;
if (sansCause.length) {
  echec = true;
  console.log('\n✗ ÉCARTS SANS CAUSE :');
  sansCause.forEach((e) => console.log('  ' + e.ref + ' · ' + e.moteur + ' ' + e.metrique + ' : ancien ' + e.de + ' / variante ' + e.a));
}
if (fichierAvant) {
  const fige = JSON.parse(readFileSync(fichierAvant, 'utf8'));
  const ok = JSON.stringify(sortKeys(fige.fiscal)) === JSON.stringify(sortKeys(avant.fiscal));
  console.log('\nI-h · fiscal (loyersHC, provisions, base2044…) identique à l\'instantané avant : ' + (ok ? 'OUI' : 'NON'));
  if (!ok) echec = true;
}
function sortKeys(x) {
  return Array.isArray(x) ? x.map(sortKeys) : (x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { o[k] = sortKeys(x[k]); return o; }, {}) : x);
}
console.log(echec ? '\nRÉSULTAT : ÉCHEC' : '\nRÉSULTAT : chaque écart a une cause');
process.exit(echec ? 1 : 0);
