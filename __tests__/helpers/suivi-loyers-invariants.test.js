/**
 * FINANCES-SUIVI-UNIQUE P1 — invariants « property-style » du moteur de suivi (§F.1, I-a à I-i).
 * PRNG à graine fixe, ≥ 300 lots aléatoires (fixtures : suivi-loyers-fixtures.js) : 1 à 3 baux,
 * entrées/sorties à jour quelconque, chevauchements, révisions IRL par le vrai chemin du barème,
 * paiements exacts/partiels/absents/doublés/d'avance/tardifs, avoirs, GLI, manques acceptés.
 *
 * I-e (ordre H-1) est vérifié par DIFFÉRENCE avec un modèle de référence écrit ici, volontairement
 * naïf (une case par mois d'origine, l'ordre H-1 écrit en clair), indépendant de _loyerArrearsPass.
 */
import { describe, it, expect } from 'vitest';
import {
  suiviLot, suiviPerimetre, versByLot, lignesRelanceBail
} from '../../js/core/suivi-loyers.js';
import { duMois } from '../../js/core/loyer-du-mois.js';
import { prng, lotAleatoire, ymAdd, vir } from './suivi-loyers-fixtures.js';
import { casReferenceIRL, surfacesSocle, infractionsI1, formatInfractionsI1 } from './finances-invariant-i1.js';

const N = 320;
const EPS = 0.011;
const r2 = (n) => Math.round(n * 100) / 100;

function jeux() {
  const rnd = prng(0x51D1);
  const out = [];
  for (let n = 0; n < N; n++) {
    const { lot, today } = lotAleatoire(rnd, n);
    const graceLast = rnd() < 0.3;
    out.push({ lot, today, graceLast, s: suiviLot(lot, { today, graceLast }) });
  }
  return out;
}
const JEUX = jeux();

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}

/** Modèle de référence H-1 (naïf, indépendant) : une case par mois d'origine. */
function referenceH1(months, ouverture, seuil) {
  const L = new Map(), C = new Map();       // idx d'origine → reste dû (−1 = ouverture)
  let av = 0;
  if (ouverture) {
    if ((ouverture.loyer || 0) > 0.005) L.set(-1, ouverture.loyer);
    if ((ouverture.charge || 0) > 0.005) C.set(-1, ouverture.charge);
    if ((ouverture.avance || 0) > 0.005) av = ouverture.avance;
  }
  const take = (map, k, pool) => { const t = Math.min(pool, map.get(k)); map.set(k, map.get(k) - t); return pool - t; };
  const asc = (map) => [...map.keys()].sort((a, b) => a - b);
  const sum = (map) => [...map.values()].reduce((t, v) => t + v, 0);
  return months.map((m, i) => {
    let pool = Math.max(0, m.received) + av; av = 0;
    // 1. loyer du mois → 2. charges du mois
    const pl = Math.min(pool, m.hc); pool -= pl;
    if (m.hc - pl > 0.005 && !m.grace) L.set(i, m.hc - pl);
    const pc = Math.min(pool, m.ch); pool -= pc;
    if (m.ch - pc > 0.005 && !m.grace) C.set(i, m.ch - pc);
    // 3. arriérés de loyer, plus vieux d'abord → 4. arriérés de charges
    for (const k of asc(L)) pool = take(L, k, pool);
    for (const k of asc(C)) pool = take(C, k, pool);
    av = pool;                                // 5. reliquat = avance
    // manque accepté : même ordre, mois courant d'abord, plafonné
    let rem = m.remise || 0;
    if (rem > 0) {
      if (L.has(i)) rem = take(L, i, rem);
      if (C.has(i)) rem = take(C, i, rem);
      for (const k of asc(L)) if (k < i) rem = take(L, k, rem);
      for (const k of asc(C)) if (k < i) rem = take(C, k, rem);
    }
    // arrondi < seuil
    const dette = sum(L) + sum(C);
    if (dette > 0.005 && dette < seuil) { L.clear(); C.clear(); }
    if (av > 0.005 && av < seuil) av = 0;
    return { retardLoyer: sum(L), retardCharge: sum(C), avance: av };
  });
}

describe(`invariants du suivi — ${N} lots aléatoires (graine fixe)`, () => {
  it('pureté : l\'entrée n\'est jamais modifiée', () => {
    const rnd = prng(7);
    for (let n = 0; n < 40; n++) {
      const { lot, today } = lotAleatoire(rnd, n);
      const copie = JSON.parse(JSON.stringify(lot));
      expect(() => suiviLot(deepFreeze(lot), { today })).not.toThrow();
      expect(lot).toEqual(copie);
    }
  });

  it('I-a · jamais retard ET avance sur un bail le même mois', () => {
    for (const { s } of JEUX) for (const b of s.baux) for (const m of b.mois) {
      expect(m.retard > 0.005 && m.avance > 0.005).toBe(false);
      expect(Math.abs(m.solde - (m.avance - m.retard))).toBeLessThan(EPS);
    }
  });

  it('I-b · conservation : Σ imputations + avance finale + arrondis d\'avance = Σ argent entré ; Σ imputations ≤ Σ dû', () => {
    for (const { lot, s } of JEUX) for (const b of s.baux) {
      const src = lot.baux.find((x) => x.cle === b.cle);
      const ouv = src.ouverture || {};
      let entre = ouv.avance || 0, impute = 0, arr = 0, du = (ouv.loyer || 0) + (ouv.charge || 0), n = 0;
      for (const m of b.mois) {
        entre += Math.max(0, m.recu + m.regleDg);
        du += m.du.total;
        for (const p of m.imputations) { impute += p.montant; n++; }
        if (m.arrondi > 0) arr += m.arrondi;
      }
      const fin = b.mois.length ? b.mois[b.mois.length - 1].avance : 0;
      expect(Math.abs(impute + fin + arr - entre)).toBeLessThan(0.006 * (n + 2));
      expect(impute).toBeLessThanOrEqual(du + 0.006 * (n + 2));
    }
  });

  it('I-c · Σ des baux = duMois(lot) chaque mois suivi ; aucun dû hors segment ni avant debutSuivi', () => {
    for (const { lot, today, s } of JEUX) {
      const ctx = { ref: lot.ref, bails: lot.baux, bareme: lot.bareme };
      const sYm = s.debutSuivi.date.slice(0, 7);
      for (let ym = sYm; ym <= today.slice(0, 7); ym = ymAdd(ym, 1)) {
        const somme = s.baux.reduce((t, b) => { const m = b.mois.find((x) => x.ym === ym); return t + (m ? m.du.total : 0); }, 0);
        expect(Math.abs(somme - duMois(ctx, ym).total)).toBeLessThan(EPS * s.baux.length);
      }
      for (const b of s.baux) for (const m of b.mois) {
        expect(m.ym >= sYm).toBe(true);
        const horsSeg = m.ym < b.debut.slice(0, 7) || (b.fin && m.ym > b.fin.slice(0, 7));
        if (horsSeg) expect(m.du.total).toBe(0);
      }
    }
  });

  it('I-d · Σ cartes = case = Σ lots ; colonne Année = position au dernier mois exigible', () => {
    for (let k = 0; k + 3 <= JEUX.length; k += 3) {
      const groupe = JEUX.slice(k, k + 3).filter((j) => j.today.slice(0, 4) === '2026');
      if (!groupe.length) continue;
      const today = groupe[0].today;
      const lots = groupe.map((j) => suiviLot(j.lot, { today, graceLast: j.graceLast }));
      for (const ym of ['2026-01', '2026-02', today.slice(0, 7)]) {
        const per = suiviPerimetre(lots, ym);
        const cartes = per.enRetard.concat(per.enAvance);
        const sigmaLots = lots.reduce((t, l) => t + (l.mois[ym] ? l.mois[ym].solde : 0), 0);
        expect(Math.abs(cartes.reduce((t, c) => t + c.solde, 0) - per.solde)).toBeLessThan(EPS);
        expect(Math.abs(per.solde - sigmaLots)).toBeLessThan(EPS);
        expect(Math.abs(per.retard - per.avance + per.solde)).toBeLessThan(EPS);
      }
      for (const l of lots) {
        const bl = versByLot(l, 2026);
        const m = l.mois[today.slice(0, 7)] || { retard: 0, avance: 0 };
        expect(bl.annual.retard).toBe(r2(m.retard));
        expect(bl.annual.avance).toBe(r2(m.avance));
      }
    }
  });

  it('I-e · ordre H-1 : chaque bail suit le modèle de référence mois par mois', () => {
    for (const { lot, s, today, graceLast } of JEUX) for (const b of s.baux) {
      const src = lot.baux.find((x) => x.cle === b.cle);
      const dueYm = today.slice(0, 7);
      const ref = referenceH1(b.mois.map((m) => ({
        hc: m.du.hc, ch: m.du.ch, received: m.recu + m.regleDg,
        remise: m.manque ? m.manque.montant : 0,
        grace: m.ym > dueYm || (graceLast && m.ym === dueYm)
      })), src.ouverture, 1);
      b.mois.forEach((m, i) => {
        expect(Math.abs(m.retardLoyer - ref[i].retardLoyer)).toBeLessThan(EPS);
        expect(Math.abs(m.retardCharge - ref[i].retardCharge)).toBeLessThan(EPS);
        expect(Math.abs(m.avance - ref[i].avance)).toBeLessThan(EPS);
        // un mois hors grâce : courant + antérieur = retard (le manque est dit une fois)
        const grace = m.ym > dueYm || (graceLast && m.ym === dueYm);
        if (!grace) expect(Math.abs(m.courant.loyer + m.courant.charge + m.anterieur.loyer + m.anterieur.charge - m.retard)).toBeLessThan(EPS);
        // H-1 : pas de charge du mois payée tant que le loyer du mois n'est pas couvert
        if (m.courant.loyer > 0.005) expect(Math.abs(m.courant.charge - m.du.ch)).toBeLessThan(EPS);
      });
    }
  });

  it('I-f · I-1 : aucun mois figé ne bouge après l\'IRL d\'août (case, carte, relance, dette de bail)', () => {
    const cas = casReferenceIRL();
    const paiements = ['01', '02', '04', '05', '06', '07', '08', '09', '10', '11', '12']
      .map((m) => vir('p' + m, '2026-' + m + '-03', m === '04' ? 1800 : 900));
    const today = '2026-12-31';
    const cache = new Map();
    const suivi = (ctx) => {
      if (!cache.has(ctx)) {
        cache.set(ctx, suiviLot({ ref: ctx.ref, bareme: ctx.bareme, manques: [], paiements,
          debutSuivi: { date: '2026-01-01', source: 'acquisition' },
          baux: ctx.bails.map((b) => Object.assign({ cle: ctx.ref + '|' + b.debut, noms: 'X' }, b)) }, { today }));
      }
      return cache.get(ctx);
    };
    const surfaces = Object.assign(surfacesSocle({ mouvements: [] }), {
      'case (suiviLot.mois)': (ctx, ym) => suivi(ctx).mois[ym],
      'carte (suiviPerimetre)': (ctx, ym) => suiviPerimetre([suivi(ctx)], ym),
      'relance (lignesRelanceBail)': (ctx, ym) => lignesRelanceBail(suivi(ctx).baux[0], { toleranceActive: false }).filter((l) => l.ym === ym),
      'dette de bail (mois du bail)': (ctx, ym) => suivi(ctx).baux[0].mois.find((m) => m.ym === ym)
    });
    const inf = infractionsI1({ avant: cas.avant, apres: cas.apres, moisFiges: cas.moisFiges, surfaces });
    expect(inf, formatInfractionsI1(inf)).toEqual([]);
    // et le harnais mesure bien quelque chose : après l'IRL, la case d'août bouge
    expect(surfaces['case (suiviLot.mois)'](cas.apres, '2026-08')).not.toEqual(surfaces['case (suiviLot.mois)'](cas.avant, '2026-08'));
  });

  it('I-g · relance = carte = KPI du bail, au centime (sans tolérance)', () => {
    for (const { lot, today } of JEUX) {
      const s = suiviLot(lot, { today, graceLast: false });
      const ym = today.slice(0, 7);
      const per = suiviPerimetre([s], ym);
      for (const b of s.baux) {
        const relance = r2(lignesRelanceBail(b, { toleranceActive: false }).reduce((t, l) => t + l.montant, 0));
        const kpi = r2(b.position.retardLoyer + b.position.retardCharge);
        expect(Math.abs(relance - kpi)).toBeLessThan(EPS);
        const carte = per.enRetard.concat(per.enAvance).find((c) => c.bailCle === b.cle);
        if (carte) expect(carte.solde).toBe(b.position.solde);
      }
      const visibles = per.enRetard.reduce((t, c) => t - c.solde, 0);
      expect(Math.abs(visibles - (s.mois[ym] ? s.mois[ym].retard : 0))).toBeLessThan(EPS);
    }
  });

  it('I-h · un manque n\'est jamais un encaissement : le reçu (base 2044 / cash) ne bouge pas', () => {
    for (const { lot, today, s } of JEUX) {
      if (!lot.manques.length) continue;
      const sans = suiviLot(Object.assign({}, lot, { manques: [] }), { today });
      const recu = (x) => x.baux.map((b) => b.mois.map((m) => [m.ym, m.recu, m.regleDg]));
      expect(recu(s)).toEqual(recu(sans));
    }
  });

  it('I-i · un manque n\'a aucun effet hors de son bail et de ses mois ≥ ym', () => {
    const rnd = prng(0xBEEF);
    let testes = 0;
    for (const { lot, today } of JEUX) {
      const base = Object.assign({}, lot, { manques: [] });
      const s0 = suiviLot(base, { today });
      if (!s0.baux.length) continue;
      const b = s0.baux[Math.floor(rnd() * s0.baux.length)];
      if (!b.mois.length) continue;
      const ym = b.mois[Math.floor(rnd() * b.mois.length)].ym;
      const s1 = suiviLot(Object.assign({}, base, { manques: [{ id: 'mqa_x', bailCle: b.cle, ym, montant: 150, motif: 'test', date: today }] }), { today });
      for (const autre of s0.baux) {
        const apres = s1.baux.find((x) => x.cle === autre.cle);
        if (autre.cle !== b.cle) expect(apres).toEqual(autre);
        // `residu` / `soldeQuittance` / `imputations` sont lus en FIN de passe : un manque qui
        // solde une dette ancienne rend légitimement le mois d'origine quittançable (cas C.3) et
        // libère un paiement ultérieur qui l'aurait recouvrée. Les POSITIONS de fin de mois, elles,
        // ne bougent pas avant ym.
        else {
          const pos = (l) => l.filter((m) => m.ym < ym).map(({ residu, soldeQuittance, imputations, ...r }) => r);
          expect(pos(apres.mois)).toEqual(pos(autre.mois));
        }
      }
      testes++;
    }
    expect(testes).toBeGreaterThan(250);
  });
});
