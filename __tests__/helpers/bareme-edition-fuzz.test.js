// BAIL-EN-COURS-MODIFIER-PERIODES — étape 1 : FUZZ léger des invariants de l'édition de périodes.
//
// Séquences de 2 à 6 gestes tirées au hasard (PRNG à GRAINE FIXE, rejouable) parmi les vrais
// écrivains du barème — saveBail (synchroniserPeriodeBail), popup de modification, révision IRL,
// clôture — et les trois opérations d'édition (modifier / supprimer / ajouter). Après CHAQUE geste :
//   I-A  aucun chevauchement entre périodes vivantes
//   I-C  au plus UNE période ouverte
//   I-F  indépendance à l'ordre du tableau (le blob cloud réordonne) : mêmes duMois sur 72 mois
// Après chaque geste d'ÉDITION réussi :
//   I-B  la couverture continue du chapitre est conservée si elle l'était en entrée
//   I-D  localité : aucun mois hors de la fenêtre de la période ne change (harnais I-1)
//   I-E  rien ne disparaît sans trace (tombstone avec raison)
//   I-H  sens : les mois libérés (reculer / supprimer) prennent le tarif de la période PRÉCÉDENTE
//   I-G  rejouer la même opération (même evtId) = no-op ; et déterminisme.
// Un échec affiche la graine et la séquence.
import { describe, it, expect } from 'vitest';
import {
  cleDePeriode, modifierPeriode, supprimerPeriode, ajouterPeriode
} from '../../js/core/bareme-edition.js';
import {
  periodeInitialeBail, appliquerNouvellePeriode, garantirCouvertureBail, cloturerBareme, synchroniserPeriodeBail
} from '../../js/core/loyer-bareme.js';
import { duMois, periodeEnVigueurA } from '../../js/core/loyer-du-mois.js';
import { infractionsI1, formatInfractionsI1 } from './finances-invariant-i1.js';

const GRAINE = 20261006;
const NB_SEQUENCES = 2000;
const REF = 'F-001';
const BD = '2023-01-01';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOIS = [];
for (let y = 2023; y <= 2028; y++) for (let m = 1; m <= 12; m++) MOIS.push(`${y}-${String(m).padStart(2, '0')}`);
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const ymOf = (d) => String(d).slice(0, 7);

const vivantes = (b) => b.filter((p) => p && !p._deleted && p.ref === REF).sort((a, c) => a.debut.localeCompare(c.debut));

function ctxDe(etat, bareme) {
  return {
    ref: REF,
    bails: [{ debut: BD, finEffective: etat.clos || null, archive: !!etat.clos, hc: etat.bail.hc, ch: etat.bail.ch }],
    bareme
  };
}

function chevauchements(b) {
  const v = vivantes(b);
  const out = [];
  for (let i = 0; i < v.length - 1; i++) {
    if (v[i].fin == null || v[i].fin >= v[i + 1].debut) out.push([v[i], v[i + 1]]);
  }
  return out;
}
const ouvertes = (b) => vivantes(b).filter((p) => p.fin == null);
function couvert(b) {
  const v = vivantes(b);
  if (!v.length || v[0].debut > BD) return false;
  for (let i = 0; i < v.length - 1; i++) {
    const f = v[i].fin;
    if (f == null) return false;
    const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
    if (d.toISOString().slice(0, 10) !== v[i + 1].debut) return false;
  }
  return true;
}

function melange(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function dateAlea(rnd, min) {
  for (let k = 0; k < 20; k++) {
    const y = 2023 + Math.floor(rnd() * 6);
    const m = 1 + Math.floor(rnd() * 12);
    const d = rnd() < 0.7 ? 1 : 1 + Math.floor(rnd() * 28);
    const s = iso(y, m, d);
    if (s >= min) return s;
  }
  return min;
}

function lancer(graine) {
  const rnd = mulberry32(graine);
  const etat = { bail: { ref: REF, debut: BD, hc: 600, ch: 80 }, clos: null };
  let b = [periodeInitialeBail(etat.bail)];
  const trace = [];
  let nEdits = 0;
  const nGestes = 2 + Math.floor(rnd() * 5);
  for (let g = 0; g < nGestes; g++) {
    const avant = b;
    const typeRoll = rnd();
    let geste, edit = null;
    if (typeRoll < 0.14) {
      etat.bail = { ...etat.bail, hc: [600, 650, 700][Math.floor(rnd() * 3)], ch: [80, 90][Math.floor(rnd() * 2)] };
      geste = `saveBail(${etat.bail.hc}+${etat.bail.ch})`;
      b = synchroniserPeriodeBail(b, { ...etat.bail }, BD);
    } else if (typeRoll < 0.30 || typeRoll < 0.40) {
      const d = dateAlea(rnd, BD);
      const src = typeRoll < 0.30 ? 'manuel' : 'irl';
      const hc = 500 + 10 * Math.floor(rnd() * 30);
      geste = `${src}@${d} ${hc}`;
      b = garantirCouvertureBail(b, etat.bail, d);
      b = appliquerNouvellePeriode(b, { ref: REF, debut: d, hc, ch: 80, source: src, bailDebut: BD, note: 'n' });
    } else if (typeRoll < 0.46 && !etat.clos) {
      const d = dateAlea(rnd, '2024-01-01');
      geste = `cloture@${d}`;
      etat.clos = d;
      b = cloturerBareme(b, REF, d);
    } else {
      const v = vivantes(b);
      const kind = rnd();
      const opts = { motif: 'fuzz', le: '2026-10-06T10:00:00.000Z', auteur: 'fuzz', evtId: 'e' + graine + '_' + g, bailHc: etat.bail.hc, bailCh: etat.bail.ch, autoriserIRL: rnd() < 0.3 };
      if (!v.length) continue;
      const T = v[Math.floor(rnd() * v.length)];
      if (kind < 0.5) {
        const patch = {};
        if (rnd() < 0.7) patch.debut = dateAlea(rnd, BD);
        if (rnd() < 0.5) patch.hc = 480 + 10 * Math.floor(rnd() * 30);
        if (rnd() < 0.3) patch.ch = 70 + Math.floor(rnd() * 40);
        geste = `modifier(${T.debut},${JSON.stringify(patch)})`;
        edit = { op: 'modifier', cle: cleDePeriode(T), patch, opts, T };
      } else if (kind < 0.8) {
        geste = `supprimer(${T.debut})`;
        edit = { op: 'supprimer', cle: cleDePeriode(T), opts, T };
      } else {
        const nouvelle = { ref: REF, debut: dateAlea(rnd, BD), hc: 500 + 10 * Math.floor(rnd() * 30), ch: 80 };
        if (rnd() < 0.3) { const f = dateAlea(rnd, nouvelle.debut); nouvelle.fin = f; }
        geste = `ajouter(${JSON.stringify(nouvelle)})`;
        edit = { op: 'ajouter', nouvelle, opts };
      }
    }
    trace.push(geste);
    const contexte = () => `graine=${graine} geste#${g}\n${trace.join('\n')}\navant=${JSON.stringify(vivantes(avant))}\naprès=${JSON.stringify(vivantes(b))}`;

    if (edit) {
      const snap = JSON.stringify(avant);
      const etaitCouvert = couvert(avant);
      const clos = etat.clos;
      let r;
      if (edit.op === 'modifier') r = modifierPeriode(avant, edit.cle, edit.patch, edit.opts);
      else if (edit.op === 'supprimer') r = supprimerPeriode(avant, edit.cle, edit.opts);
      else r = ajouterPeriode(avant, edit.nouvelle, edit.opts);
      expect(JSON.stringify(avant), 'entrée mutée\n' + contexte()).toBe(snap);
      // déterminisme
      const r2 = edit.op === 'modifier' ? modifierPeriode(avant, edit.cle, edit.patch, edit.opts)
        : edit.op === 'supprimer' ? supprimerPeriode(avant, edit.cle, edit.opts) : ajouterPeriode(avant, edit.nouvelle, edit.opts);
      expect(JSON.stringify(r2), 'non déterministe\n' + contexte()).toBe(JSON.stringify(r));
      if (r.ok && r.change) {
        nEdits++;
        b = r.periods;
        // I-G : rejouer = no-op
        const re = edit.op === 'modifier' ? modifierPeriode(b, edit.cle, edit.patch, edit.opts)
          : edit.op === 'supprimer' ? supprimerPeriode(b, edit.cle, edit.opts) : ajouterPeriode(b, edit.nouvelle, edit.opts);
        expect(re.ok && !re.change, 'rejeu non idempotent (I-G)\n' + contexte()).toBe(true);
        expect(JSON.stringify(re.periods), 'rejeu modifie le tableau (I-G)\n' + contexte()).toBe(JSON.stringify(b));
        // I-B : la couverture continue est conservée (hors bail clos : la clôture a pu tomber avant le début d'une période,
        // cas déjà traité par cloturerBareme — on ne mesure que le chapitre qui court)
        if (etaitCouvert && !clos) expect(couvert(b), 'couverture perdue (I-B)\n' + contexte()).toBe(true);
        // I-D : localité
        let fenDebut, fenFin = null;
        if (edit.op === 'modifier') {
          const d2 = r.apres ? r.apres.debut : edit.T.debut;
          fenDebut = d2 < edit.T.debut ? d2 : edit.T.debut; fenFin = edit.T.fin;
        } else if (edit.op === 'supprimer') { fenDebut = edit.T.debut; fenFin = edit.T.fin; }
        else { fenDebut = edit.nouvelle.debut; fenFin = null; }
        const figes = MOIS.filter((ym) => ym < ymOf(fenDebut) || (fenFin != null && ym > ymOf(fenFin)));
        const surf = { 'dû du mois': (ctx, ym) => duMois(ctx, ym) };
        // Un trou PRÉEXISTANT dans le barème d'entrée est comblé au tarif du bail ; duMois y retombait déjà : même valeur.
        if (edit.op !== 'ajouter' || etaitCouvert) {
          const inf = infractionsI1({ avant: ctxDe(etat, avant), apres: ctxDe(etat, b), moisFiges: figes, surfaces: surf });
          expect(inf, formatInfractionsI1(inf) + '\n' + contexte()).toEqual([]);
        }
        // I-H : les mois libérés par un recul de date ou une suppression reprennent le tarif de la précédente contiguë
        const veilleDe = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
        const P = edit.T ? vivantes(avant).find((p) => p.fin != null && p.fin === veilleDe(edit.T.debut)) : null;
        const recule = edit.op === 'modifier' && r.apres && r.apres.debut > edit.T.debut;
        if (P && (recule || edit.op === 'supprimer')) {
          const enVigueur = periodeEnVigueurA(b, REF, edit.T.debut);
          expect(enVigueur && [enVigueur.hc, enVigueur.ch], 'mois libérés au mauvais tarif (I-H)\n' + contexte()).toEqual([P.hc, P.ch]);
        }
        // I-E : toute ligne vivante en entrée est vivante en sortie (même début) ou tombstonée avec sa raison
        if (edit.op !== 'ajouter') {
          for (const p of vivantes(avant)) {
            const vit = vivantes(b).some((q) => q.debut === p.debut);
            const tomb = b.some((q) => q._deleted && q.ref === REF && q.debut === p.debut && (q._modifieePar || q._supprimeePar || q._absorbeePar));
            expect(vit || tomb, `ligne ${p.debut} disparue sans trace (I-E)\n` + contexte()).toBe(true);
          }
        }
      } else if (r.ok === false) {
        expect(JSON.stringify(r.periods), 'ok:false doit rendre le tableau INCHANGÉ\n' + contexte()).toBe(snap);
      }
    }

    // invariants de structure, après chaque geste
    expect(chevauchements(b), 'chevauchement (I-A)\n' + contexte()).toEqual([]);
    expect(ouvertes(b).length, 'plusieurs périodes ouvertes (I-C)\n' + contexte()).toBeLessThanOrEqual(1);
    const base = MOIS.map((ym) => duMois(ctxDe(etat, b), ym).total);
    const m = melange(b, rnd);
    const melangee = MOIS.map((ym) => duMois(ctxDe(etat, m), ym).total);
    expect(melangee, 'dû dépendant de l\'ordre du tableau (I-F)\n' + contexte()).toEqual(base);
  }
  return nEdits;
}

describe('fuzz — invariants de l\'édition de périodes (graine fixe ' + GRAINE + ')', () => {
  it(`${NB_SEQUENCES} séquences de 2 à 6 gestes tiennent I-A à I-G`, () => {
    let edits = 0;
    for (let s = 0; s < NB_SEQUENCES; s++) edits += lancer(GRAINE + s);
    // le test ne doit pas être vacuant : une part notable des gestes d'édition aboutit réellement
    expect(edits).toBeGreaterThan(NB_SEQUENCES * 0.5);
  });
});
