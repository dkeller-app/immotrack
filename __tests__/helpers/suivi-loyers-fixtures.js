/**
 * Jeux de données du moteur de suivi des loyers (FINANCES-SUIVI-UNIQUE P1). Ce fichier N'EST
 * PAS un test : il fournit les lots de référence (cas Arslan reconstitué, §C.2 du document de
 * conception) et le générateur aléatoire à graine fixe des invariants « property-style ».
 * Montants et dates du cas Arslan : docs/subjects/FINANCES-SUIVI-UNIQUE.md (relevé bancaire),
 * noms neutralisés hors locataire déjà cité dans le document.
 */
import { periodeInitialeBail, appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';

export const TODAY_ARSLAN = '2026-10-05';
export const CLE_ANCIEN = 'Ferrette - 101|2024-08-20';
export const CLE_ARSLAN = 'Ferrette - 101|2026-05-03';

export const vir = (id, date, montant, extra) => Object.assign({ id, date, montant, kind: 'virement' }, extra || {});

/** Le lot Ferrette - 101 au 05/10/2026 (ancien bail sorti le 13/04, bail Arslan depuis le 03/05). */
export function lotArslan(opts) {
  const o = opts || {};
  return {
    ref: 'Ferrette - 101',
    baux: [
      { cle: CLE_ANCIEN, debut: '2024-08-20', fin: '2030-08-19', finEffective: '2026-04-13', archive: true,
        hc: 700, ch: 0, noms: 'Ancien locataire',
        dg: { verse: 700, retenuAutres: 150, restitue: 247, penalite: 0, date: '2026-04-13' } },
      { cle: CLE_ARSLAN, debut: '2026-05-03', fin: '2032-05-02', finEffective: null, archive: false,
        hc: 760, ch: 20, noms: 'Elise ARSLAN' }
    ],
    bareme: [],
    paiements: [
      vir('v1', '2026-03-09', 700), vir('v2', '2026-05-04', 730), vir('v3', '2026-06-02', 780),
      vir('v4', '2026-06-27', 780), vir('v5', '2026-08-05', 760), vir('v6', '2026-09-01', 780),
      vir('v7', '2026-10-02', 780)
    ],
    manques: o.geste
      ? [{ id: 'mqa_1', bailCle: CLE_ARSLAN, ym: '2026-08', montant: 20, motif: 'panne électrique', date: '2026-08-05' }]
      : []
  };
}

/** PRNG à graine fixe (mulberry32). */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const _addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return _iso(d); };
const _r2 = (n) => Math.round(n * 100) / 100;
export const ymAdd = (ym, n) => {
  let y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) + n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
};

/**
 * Un lot aléatoire : 1 à 3 baux (entrées et sorties à jour quelconque, chevauchements possibles),
 * barème construit par le VRAI chemin (periodeInitialeBail + appliquerNouvellePeriode, 0 à 2
 * révisions IRL), paiements exacts / partiels / absents / doublés / d'avance / tardifs, avoirs,
 * indemnités GLI et manques acceptés aléatoires (dont des tombstones).
 * @returns {{lot, today:string}}
 */
export function lotAleatoire(rnd, n) {
  const ref = 'LOT-' + n;
  const today = '2026-' + String(3 + Math.floor(rnd() * 9)).padStart(2, '0') + '-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0');
  const nb = 1 + Math.floor(rnd() * 3);
  let cursor = _addDays('2025-01-01', Math.floor(rnd() * 200));
  const baux = [];
  let bareme = [];
  for (let k = 0; k < nb; k++) {
    const debut = cursor;
    const dureeJ = 60 + Math.floor(rnd() * 400);
    const dernier = k === nb - 1;
    let finEffective = null;
    if (!dernier || rnd() < 0.3) finEffective = _addDays(debut, dureeJ);
    const hc = 300 + Math.floor(rnd() * 700) + (rnd() < 0.5 ? 0.5 : 0);
    const ch = rnd() < 0.3 ? 0 : 10 + Math.floor(rnd() * 50);
    const b = { cle: ref + '|' + debut, debut, fin: _addDays(debut, 365 * 3), finEffective, archive: !!finEffective, hc, ch, noms: 'Loc ' + k };
    if (finEffective && rnd() < 0.3) b.dg = { verse: hc, retenuAutres: Math.floor(rnd() * hc / 2), restitue: Math.floor(rnd() * hc / 2), penalite: 0, date: finEffective };
    if (k === 0 && rnd() < 0.15) b.ouverture = rnd() < 0.5 ? { loyer: Math.floor(rnd() * 500), charge: Math.floor(rnd() * 40) } : { avance: Math.floor(rnd() * 400) };
    baux.push(b);
    bareme = appliquerNouvellePeriode(bareme, Object.assign(periodeInitialeBail({ ref, debut, hc, ch }), { source: 'bail' }));
    // 0 à 2 révisions IRL datées au 1er d'un mois du bail
    const nIrl = Math.floor(rnd() * 3);
    let hcCur = hc;
    for (let r = 0; r < nIrl; r++) {
      const eff = ymAdd(debut.slice(0, 7), 2 + Math.floor(rnd() * 12)) + '-01';
      hcCur = _r2(hcCur * (1 + rnd() * 0.04));
      bareme = appliquerNouvellePeriode(bareme, { ref, debut: eff, hc: hcCur, ch, source: 'irl', bailDebut: debut });
    }
    // bail suivant : après une vacance, ou en chevauchement (troncature C4)
    const base = finEffective || _addDays(debut, dureeJ);
    cursor = rnd() < 0.2 ? _addDays(base, -Math.floor(rnd() * 20)) : _addDays(base, 1 + Math.floor(rnd() * 60));
  }
  // paiements : pour chaque mois de la période, un comportement tiré au sort
  const paiements = [];
  const manques = [];
  const startYm = baux[0].debut.slice(0, 7);
  const endYm = today.slice(0, 7);
  let id = 0;
  for (let ym = startYm; ym <= endYm; ym = ymAdd(ym, 1)) {
    const actif = baux.filter((b) => b.debut.slice(0, 7) <= ym && (!b.finEffective || b.finEffective.slice(0, 7) >= ym));
    const b = actif.length ? actif[actif.length - 1] : baux[baux.length - 1];
    const plein = b.hc + b.ch;
    const r = rnd();
    const jour = String(1 + Math.floor(rnd() * 27)).padStart(2, '0');
    const date = ym + '-' + jour;
    if (date > today) continue;
    if (r < 0.15) { /* absent */ } else if (r < 0.6) paiements.push(vir('p' + (id++), date, plein));
    else if (r < 0.75) paiements.push(vir('p' + (id++), date, _r2(plein * rnd())));
    else if (r < 0.85) { paiements.push(vir('p' + (id++), date, plein)); paiements.push(vir('p' + (id++), date, plein)); }
    else if (r < 0.9) paiements.push(vir('p' + (id++), date, _r2(plein + rnd() * 3)));
    else if (r < 0.94) paiements.push(vir('p' + (id++), date, -_r2(rnd() * 100)));     // avoir 211
    else if (r < 0.97) paiements.push(Object.assign(vir('g' + (id++), date, _r2(plein * 2)), { kind: 'gli' }));
    else paiements.push(vir('p' + (id++), ymAdd(ym, 2) + '-0' + (1 + Math.floor(rnd() * 8)), plein)); // tardif
    if (rnd() < 0.08) {
      manques.push({ id: 'mqa_' + (id++), bailCle: b.cle, ym, montant: _r2(rnd() * 200), motif: 'geste', date, _deleted: rnd() < 0.2 });
    }
  }
  return {
    today,
    lot: { ref, baux, bareme, paiements: paiements.filter((p) => p.date <= today), manques }
  };
}
