/**
 * R0-C lot 1 — GÉNÉRATEUR DE JEUX déterministe (PRNG à graine fixe), partagé par :
 *   - l'instantané du maître (r0c-maitre-instantane.test.js) : non-régression au centime ;
 *   - le harnais d'égalité (r0c-egalite-maitre.test.js) : dette de restitution == dette Finances.
 *
 * Ce fichier N'EST PAS un test. Il fabrique des baux, un barème construit par le VRAI chemin
 * (`periodeInitialeBail` + `appliquerNouvellePeriode`, jamais une période écrite à la main) et des
 * relevés bancaires variés : paiements exacts, partiels, absents, doublés, en retard d'un ou
 * plusieurs exercices, payés d'avance le 28 du mois précédent, contre-passés (débit sur loyer).
 *
 * Toute modification de ce générateur INVALIDE l'instantané figé
 * (__tests__/fixtures/r0c-maitre-avant.json) : ne le toucher qu'en régénérant la fixture
 * AVANT toute modification du moteur (cf. commentaire de r0c-maitre-instantane.test.js).
 */

import { periodeInitialeBail, appliquerNouvellePeriode } from '../../js/core/loyer-bareme.js';
import { duMois } from '../../js/core/loyer-du-mois.js';

/** PRNG mulberry32 — déterministe, suffisant pour des jeux de test. */
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

const _r2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
export const ymAdd = (ym, k) => {
  let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + k;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return y + '-' + pad(m);
};
export const ymRange = (a, b) => { const o = []; for (let ym = a; ym <= b; ym = ymAdd(ym, 1)) o.push(ym); return o; };
const lastDay = (ym) => ym + '-' + pad(new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate());
const veille = (iso) => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

/** Catégories des jeux → traitement du maître (même forme que `_finCatLigne`). */
export const CAT = {
  'Loyers encaissés': { ligne2044: '211', type: 'recette' },
  'Loyer F3 (alias)': { ligne2044: '211', type: 'recette' },   // alias M-1 d'une catégorie loyer
  'Taxe foncière': { ligne2044: '227', type: 'charge' },
  'Assurance PNO': { ligne2044: '223', type: 'charge' },
  'Intérêts d\'emprunt': { ligne2044: '250', type: 'charge' },
  'Travaux': { ligne2044: '224', type: 'charge' },
  'Recettes diverses': { ligne2044: '213', type: 'recette' }
};
export const catLigne = (c) => CAT[c] || null;          // DG, Prêt, Eau → null (hors 2044)
export const isEcheance = (m) => !!m && m.cat === 'Prêt';
export const isRecupCharge = (m) => !!m && m.cat === 'Eau (récupérable)';
/** Prédicat « catégorie de loyer » utilisé pour le 1ᵉʳ versement (même rôle que `_isLoyerCategory`). */
export const estLoyer = (c) => c === 'Loyers encaissés' || c === 'Loyer F3 (alias)';

/** 1ᵉʳ versement de loyer d'un lot ('YYYY-MM'), même prédicat que `_getLogementStartIso` (cr > 0). */
export function premierVersementYm(mouvements, ref) {
  let fp = null;
  for (const m of mouvements || []) {
    if (!m || m._deleted || m.qui !== ref || !estLoyer(m.cat) || !((Number(m.cr) || 0) > 0) || !m.date) continue;
    const ym = String(m.date).slice(0, 7);
    if (!fp || ym < fp) fp = ym;
  }
  return fp;
}

/**
 * Un bail + son barème (0 à 3 révisions IRL datées, vrai chemin du barème).
 * @returns {{bail, bareme}}
 */
function genBail(R, ref, debut, fin, archive) {
  const hc = 400 + Math.floor(R() * 80) * 10;
  const ch = Math.floor(R() * 16) * 10;
  const bail = { ref, debut, hc, ch };
  let bareme = [periodeInitialeBail(bail)];
  const nbRev = Math.floor(R() * 4);
  let cur = hc;
  let eff = ymAdd(debut.slice(0, 7), 12);
  for (let i = 0; i < nbRev; i++) {
    const effIso = eff + '-01';
    if (fin && effIso > fin) break;
    if (effIso > '2026-12-01') break;
    cur = _r2(cur * (1 + 0.01 + R() * 0.025));
    bareme = appliquerNouvellePeriode(bareme, { ref, debut: effIso, hc: cur, ch, source: 'irl', bailDebut: debut, note: 'IRL' });
    eff = ymAdd(eff, 12);
  }
  // PIÈGE I-1 armé : le bail porte le loyer COURANT (après révisions), jamais celui d'origine.
  const b = { debut, hc: cur, ch, archive: !!archive };
  if (fin) b.finEffective = fin;
  return { bail: b, bareme };
}

/**
 * Relevés d'un bail sur [de, à] : un comportement de paiement par mois.
 * `ctx` sert à lire le dû RÉEL du mois (duMois) — le locataire paie ce qu'on lui a demandé.
 */
function genPaiements(R, ref, ctx, de, a) {
  const out = [];
  const cat = () => (R() < 0.15 ? 'Loyer F3 (alias)' : 'Loyers encaissés');
  let dette = 0;
  for (const ym of ymRange(de, a)) {
    const d = duMois(ctx, ym);
    const du = _r2(d.total);
    if (du <= 0) continue;
    const jour = 1 + Math.floor(R() * 27);
    const x = R();
    let montant = du, date = ym + '-' + pad(jour);
    if (x < 0.10) { dette += du; continue; }                                  // impayé
    else if (x < 0.20) { montant = _r2(du * (0.3 + R() * 0.6)); dette += du - montant; } // partiel
    else if (x < 0.27) { montant = _r2(du * 2); dette -= du; }                // doublé (trop-perçu)
    else if (x < 0.34 && dette > 0) { montant = _r2(du + dette); dette = 0; } // rattrapage
    else if (x < 0.40) { date = veille(ym + '-01').slice(0, 8) + '28'; }      // terme à échoir : payé le 28 du mois d'avant
    out.push({ date, cat: cat(), qui: ref, cr: montant, db: 0 });
  }
  // rattrapage tardif (autre exercice) d'une partie de la dette restante
  if (dette > 0 && R() < 0.5) {
    const ym = ymAdd(a, 1 + Math.floor(R() * 14));
    if (ym <= '2026-09') out.push({ date: ym + '-15', cat: 'Loyers encaissés', qui: ref, cr: _r2(dette * (0.3 + R() * 0.7)), db: 0 });
  }
  // contre-passation (rejet de prélèvement) : un DÉBIT sur la catégorie loyer
  if (out.length && R() < 0.15) {
    const p = out[Math.floor(R() * out.length)];
    out.push({ date: p.date.slice(0, 8) + '28', cat: p.cat, qui: ref, cr: 0, db: _r2(p.cr / 2) });
  }
  return out;
}

/**
 * JEU à UN bail (harnais d'égalité). Début du bail n'importe quel jour de 2021 à 2026 ;
 * ouvert (tacite reconduction) ou clos (finEffective). Le 1ᵉʳ versement peut arriver APRÈS
 * l'entrée (locataire qui ne paie pas ses premiers mois — cas Q1).
 * @returns {{ref, ctx:{ref,bails,bareme}, bailDebut, fin, mouvements, today}}
 */
export function jeuUnBail(seed) {
  const R = prng(seed);
  const ref = 'LOT-' + seed;
  const TODAYS = ['2026-09-30', '2026-09-05', '2026-12-31', '2026-01-15', '2026-06-10'];
  const today = TODAYS[Math.floor(R() * TODAYS.length)];
  const y0 = 2021 + Math.floor(R() * 6);
  const debutYm = y0 + '-' + pad(1 + Math.floor(R() * 12));
  const jour = R() < 0.6 ? 1 : 2 + Math.floor(R() * 26);
  let debut = debutYm + '-' + pad(jour);
  if (debut > today) debut = today.slice(0, 7) + '-01';
  let fin = null;
  if (R() < 0.45) {
    const k = 3 + Math.floor(R() * 48);
    const fy = ymAdd(debut.slice(0, 7), k);
    fin = (fy >= today.slice(0, 7)) ? null : (R() < 0.5 ? lastDay(fy) : fy + '-' + pad(1 + Math.floor(R() * 27)));
  }
  const { bail, bareme } = genBail(R, ref, debut, fin, !!fin);
  const ctx = { ref, bails: [bail], bareme };
  // Q1 : parfois le 1ᵉʳ versement n'arrive que plusieurs mois après l'entrée.
  const retardDemarrage = R() < 0.25 ? 1 + Math.floor(R() * 8) : 0;
  const de = ymAdd(debut.slice(0, 7), retardDemarrage);
  const a = [fin ? fin.slice(0, 7) : null, today.slice(0, 7)].filter(Boolean).sort()[0];
  const mouvements = de <= a ? genPaiements(R, ref, ctx, de, a) : [];
  // bruit : autres catégories du même lot (le dépôt NE compte JAMAIS comme loyer) + autre lot
  mouvements.push({ date: debut, cat: 'Dépôt de garantie (reçu / restitué)', qui: ref, cr: bail.hc, db: 0 });
  mouvements.push({ date: debut.slice(0, 7) + '-20', cat: 'Taxe foncière', qui: ref, cr: 0, db: 600 });
  mouvements.push({ date: debut.slice(0, 7) + '-11', cat: 'Loyers encaissés', qui: 'AUTRE-LOT', cr: 999, db: 0 });
  // Un encaissement daté dans le futur (post-daté) ne doit pas entrer dans la dette exigible.
  if (R() < 0.2) mouvements.push({ date: ymAdd(today.slice(0, 7), 1) + '-02', cat: 'Loyers encaissés', qui: ref, cr: 500, db: 0 });
  return { ref, ctx, bailDebut: debut, fin, mouvements: mouvements.filter((m) => m.date <= '2027-12-31'), today };
}

/**
 * JEU MULTI-LOTS, MULTI-BAUX (instantané du maître) : 1 à 4 lots, 1 à 3 baux successifs par
 * lot (vacances, rotation dans le mois, bail clos sans paiement), loyers non affectés, charges
 * propriétaire, échéances de prêt, intérêts datés 31/12, charges récupérables, recettes 213.
 */
export function jeuMultiLots(seed) {
  const R = prng(seed);
  const lots = [];
  const mouvements = [];
  const nbLots = 1 + Math.floor(R() * 4);
  for (let l = 0; l < nbLots; l++) {
    const ref = 'M' + seed + '-' + l;
    const bails = []; let bareme = [];
    let cur = (2021 + Math.floor(R() * 3)) + '-' + pad(1 + Math.floor(R() * 12)) + '-01';
    const nbBaux = 1 + Math.floor(R() * 3);
    for (let b = 0; b < nbBaux; b++) {
      const dureeMois = 6 + Math.floor(R() * 30);
      const finYm = ymAdd(cur.slice(0, 7), dureeMois);
      const dernier = b === nbBaux - 1;
      const ouvert = dernier && R() < 0.6;
      const fin = ouvert ? null : (R() < 0.5 ? lastDay(finYm) : finYm + '-14');
      const g = genBail(R, ref, cur, fin, !ouvert);
      bails.push(g.bail);
      bareme = bareme.concat(g.bareme);
      const ctx = { ref, bails: [g.bail], bareme: g.bareme };
      const a = (fin ? fin.slice(0, 7) : '2026-09');
      if (R() < 0.85) mouvements.push(...genPaiements(R, ref, ctx, cur.slice(0, 7), a < '2026-09' ? a : '2026-09'));
      if (!fin) break;
      // vacance de 0 à 3 mois, rotation parfois dans le même mois
      const vac = Math.floor(R() * 4);
      cur = vac === 0 ? ymAdd(fin.slice(0, 7), 1) + '-01' : ymAdd(fin.slice(0, 7), vac) + '-' + pad(1 + Math.floor(R() * 20));
      if (cur <= fin) cur = ymAdd(fin.slice(0, 7), 1) + '-01';
      if (cur > '2026-08-01') break;
    }
    lots.push({ ref, ctx: { ref, bails, bareme } });
    for (let y = 2022; y <= 2026; y++) {
      if (R() < 0.7) mouvements.push({ date: y + '-10-15', cat: 'Taxe foncière', qui: ref, cr: 0, db: 500 + Math.floor(R() * 500) });
      if (R() < 0.4) mouvements.push({ date: y + '-03-02', cat: 'Eau (récupérable)', qui: ref, cr: 0, db: 80 + Math.floor(R() * 100) });
    }
  }
  for (let y = 2022; y <= 2026; y++) {
    for (let mo = 1; mo <= 12; mo++) if (R() < 0.8) mouvements.push({ date: y + '-' + pad(mo) + '-10', cat: 'Prêt', qui: '', cr: 0, db: 900 });
    mouvements.push({ date: y + '-12-31', cat: 'Intérêts d\'emprunt', qui: '', cr: 0, db: 1200 + Math.floor(R() * 800) });
    if (R() < 0.5) mouvements.push({ date: y + '-06-05', cat: 'Loyers encaissés', qui: '', cr: 300, db: 0 });   // non affecté (H-2)
    if (R() < 0.3) mouvements.push({ date: y + '-07-07', cat: 'Recettes diverses', qui: '', cr: 150, db: 0 });
  }
  return { lots, mouvements };
}
