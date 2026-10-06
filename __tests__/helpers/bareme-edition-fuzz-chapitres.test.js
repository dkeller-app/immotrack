// BAIL-EN-COURS-MODIFIER-PERIODES — contre-audit 06/10 (🟠5) : FUZZ À DEUX CHAPITRES DE BAIL.
//
// Le fuzz historique (bareme-edition-fuzz.test.js) n'a qu'UN bail : la mutation « retirer le filtre de chapitre `_compat` »
// survivait donc à toute la suite (supprimer la 1re période du 2e bail prolongeait l'ancien locataire : nov. 2024 passait de 910 à
// 720 €). Ici : un bail 1 CLOS puis un bail 2 — CONTIGU (re-bail le lendemain de la clôture, le cas le plus courant : 60 %) ou
// après une vacance — et des gestes d'édition sur les DEUX chapitres, dont des dates AVANT le bail. Après chaque geste :
//   C-1  éditer un chapitre ne change AUCUNE ligne vivante de l'autre, ni son dû (mois entièrement dans l'autre bail)
//   C-2  un chapitre clos ne déborde pas sa clôture
//   C-3  aucune période n'est rattachée à un bail qui commence après elle
//   I-A / I-C  aucun chevauchement, au plus une période ouverte ; I-G idempotence ; entrée jamais mutée ; ok:false = inchangé.
// Graine fixe, rejouable ; un échec affiche la graine et la séquence.
import { describe, it, expect } from 'vitest';
import { cleDePeriode, modifierPeriode, supprimerPeriode, ajouterPeriode } from '../../js/core/bareme-edition.js';
import { chapitrePour, periodeInitialeBail, appliquerNouvellePeriode, garantirCouvertureBail, cloturerBareme, synchroniserPeriodeBail } from '../../js/core/loyer-bareme.js';
import { duMois } from '../../js/core/loyer-du-mois.js';

const GRAINE = 20261007;
const NB_SEQUENCES = 3000;
const REF = 'G-002';

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
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const decale = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const premierDe = (ym) => ym + '-01';
const dernierDe = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

const vivantes = (b) => b.filter((p) => p && !p._deleted && p.ref === REF).sort((a, c) => a.debut.localeCompare(c.debut));
const chap = (b, bd) => vivantes(b).filter((p) => p.bailDebut === bd);

function dateAlea(rnd, min, max) {
  for (let k = 0; k < 30; k++) {
    const y = 2023 + Math.floor(rnd() * 6), m = 1 + Math.floor(rnd() * 12);
    const d = rnd() < 0.7 ? 1 : 1 + Math.floor(rnd() * 28);
    const s = iso(y, m, d);
    if (s >= min && (!max || s <= max)) return s;
  }
  return min;
}
function melange(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function lancer(graine) {
  const rnd = mulberry32(graine);
  // ── les deux baux : bail 1 CLOS, bail 2 contigu (60 %) ou après une vacance
  const BD1 = '2023-01-01';
  const F1 = dateAlea(rnd, '2023-09-01', '2024-12-31');
  const contigu = rnd() < 0.6;
  const BD2 = contigu ? decale(F1, 1) : decale(F1, 2 + Math.floor(rnd() * 120));
  const etat = { b1: { hc: 600, ch: 80 }, b2: { hc: 900, ch: 100 }, clos2: null };
  // bail 1 : sa période initiale + 0 à 2 décisions datées, puis la clôture (comme archiverBail)
  let b = [periodeInitialeBail({ ref: REF, debut: BD1, ...etat.b1 })];
  for (let i = Math.floor(rnd() * 3); i > 0; i--) {
    const d = dateAlea(rnd, decale(BD1, 30), F1);
    b = appliquerNouvellePeriode(b, { ref: REF, debut: d, hc: 520 + 10 * Math.floor(rnd() * 20), ch: 80, source: rnd() < 0.5 ? 'manuel' : 'irl', bailDebut: BD1, note: 'b1' });
  }
  b = cloturerBareme(b, REF, F1);
  b = b.concat([periodeInitialeBail({ ref: REF, debut: BD2, ...etat.b2 })]);
  const baux = () => [
    { debut: BD1, finEffective: F1, archive: true, hc: etat.b1.hc, ch: etat.b1.ch },
    { debut: BD2, finEffective: etat.clos2, archive: !!etat.clos2, hc: etat.b2.hc, ch: etat.b2.ch }
  ];
  const ctx = (bareme) => ({ ref: REF, bails: baux(), bareme });
  const entierementDans = (ym, bd, fin) => premierDe(ym) >= bd && (!fin || dernierDe(ym) <= fin);

  const trace = [`F1=${F1} BD2=${BD2} ${contigu ? 'contigu' : 'vacance'}`];
  let nEdits = 0;
  const nGestes = 2 + Math.floor(rnd() * 5);
  for (let g = 0; g < nGestes; g++) {
    const avant = b;
    const roll = rnd();
    let geste, edit = null;
    if (roll < 0.12) {                                                     // saveBail du bail COURANT (2) — impossible une fois clos
      if (etat.clos2) continue;
      etat.b2 = { hc: [800, 900, 1000][Math.floor(rnd() * 3)], ch: [90, 100][Math.floor(rnd() * 2)] };
      geste = `saveBail2(${etat.b2.hc}+${etat.b2.ch})`;
      b = synchroniserPeriodeBail(b, { ref: REF, debut: BD2, ...etat.b2 }, BD2);
    } else if (roll < 0.30) {                                              // décision datée (manuel / IRL) sur le bail COURANT
      if (etat.clos2) continue;      // un bail clos ne reçoit plus de décision datée (le moteur de révision n'y écrit pas)
      const d = dateAlea(rnd, BD2);
      const src = rnd() < 0.5 ? 'manuel' : 'irl', hc = 700 + 10 * Math.floor(rnd() * 30);
      geste = `${src}2@${d} ${hc}`;
      b = garantirCouvertureBail(b, { ref: REF, debut: BD2, ...etat.b2 }, d);
      b = appliquerNouvellePeriode(b, { ref: REF, debut: d, hc, ch: 100, source: src, bailDebut: BD2, note: 'n' });
    } else if (roll < 0.36 && !etat.clos2) {                               // clôture du bail courant
      const d = dateAlea(rnd, decale(BD2, 30));
      geste = `cloture2@${d}`; etat.clos2 = d;
      b = cloturerBareme(b, REF, d);
    } else {                                                               // ÉDITION, sur l'un OU l'autre chapitre
      const v = vivantes(b);
      if (!v.length) continue;
      const T = v[Math.floor(rnd() * v.length)];
      const bdT = T.bailDebut;
      const tarif = bdT === BD1 ? etat.b1 : etat.b2;
      const opts = { motif: 'fuzz', le: '2026-10-06T10:00:00.000Z', auteur: 'fuzz', evtId: 'e' + graine + '_' + g, bailHc: tarif.hc, bailCh: tarif.ch, baux: baux(), autoriserIRL: rnd() < 0.3 };
      const kind = rnd();
      if (kind < 0.5) {
        const patch = {};
        if (rnd() < 0.7) patch.debut = dateAlea(rnd, BD1);                  // y compris AVANT le bail de la période
        if (rnd() < 0.5) patch.hc = 480 + 10 * Math.floor(rnd() * 60);
        if (rnd() < 0.3) patch.ch = 70 + Math.floor(rnd() * 40);
        geste = `modifier(${bdT}|${T.debut},${JSON.stringify(patch)})`;
        edit = { op: 'modifier', cle: cleDePeriode(T), patch, opts, bdT };
      } else if (kind < 0.8) {
        geste = `supprimer(${bdT}|${T.debut})`;
        edit = { op: 'supprimer', cle: cleDePeriode(T), opts, bdT };
      } else {
        const cibleBd = rnd() < 0.5 ? BD1 : BD2;
        const nouvelle = { ref: REF, debut: dateAlea(rnd, cibleBd === BD1 ? BD1 : decale(BD2, -40)), hc: 500 + 10 * Math.floor(rnd() * 40), ch: rnd() < 0.2 ? '' : 80 };
        if (rnd() < 0.5) nouvelle.bailDebut = cibleBd;
        if (rnd() < 0.3) nouvelle.fin = dateAlea(rnd, nouvelle.debut);
        // le chapitre visé : celui qu'on dit, sinon celui du bail qui occupe la date (chapitrePour, comme l'orchestrateur)
        const reel = nouvelle.bailDebut || chapitrePour(avant, REF, nouvelle.debut, baux());
        const t2 = reel === BD1 ? etat.b1 : etat.b2;
        opts.bailHc = t2.hc; opts.bailCh = t2.ch;
        geste = `ajouter(${JSON.stringify(nouvelle)})`;
        edit = { op: 'ajouter', nouvelle, opts, bdT: reel };
      }
    }
    trace.push(geste);
    const contexte = () => `graine=${graine} geste#${g}\n${trace.join('\n')}\navant=${JSON.stringify(vivantes(avant))}\naprès=${JSON.stringify(vivantes(b))}`;

    if (edit) {
      const snap = JSON.stringify(avant);
      const run = (arr) => (edit.op === 'modifier' ? modifierPeriode(arr, edit.cle, edit.patch, edit.opts)
        : edit.op === 'supprimer' ? supprimerPeriode(arr, edit.cle, edit.opts) : ajouterPeriode(arr, edit.nouvelle, edit.opts));
      const r = run(avant);
      expect(JSON.stringify(avant), 'entrée mutée\n' + contexte()).toBe(snap);
      if (r.ok && r.change) {
        nEdits++;
        b = r.periods;
        const re = run(b);
        expect(re.ok && !re.change, 'rejeu non idempotent (I-G)\n' + contexte()).toBe(true);
        // C-1 : l'AUTRE chapitre est intact — mêmes lignes vivantes, même dû
        const bdAutre = edit.bdT === BD1 ? BD2 : BD1;
        const autre = bdAutre;
        expect(JSON.stringify(chap(b, bdAutre)), `l'autre chapitre (${autre}) a changé (C-1)\n` + contexte()).toBe(JSON.stringify(chap(avant, bdAutre)));
        const finAutre = bdAutre === BD1 ? F1 : etat.clos2;
        for (const ym of MOIS.filter((m) => entierementDans(m, bdAutre, finAutre))) {
          expect(duMois(ctx(b), ym).total, `dû ${ym} de l'autre chapitre changé (C-1)\n` + contexte()).toBe(duMois(ctx(avant), ym).total);
        }
      } else if (r.ok === false) {
        expect(JSON.stringify(r.periods), 'ok:false doit rendre le tableau INCHANGÉ\n' + contexte()).toBe(snap);
      }
    }

    // invariants de structure, après chaque geste
    const v = vivantes(b);
    for (let i = 0; i < v.length - 1; i++) expect(v[i].fin != null && v[i].fin < v[i + 1].debut, `chevauchement (I-A) ${v[i].debut}→${v[i].fin} / ${v[i + 1].debut}\n` + contexte()).toBe(true);
    expect(v.filter((p) => p.fin == null).length, 'plusieurs périodes ouvertes (I-C)\n' + contexte()).toBeLessThanOrEqual(1);
    for (const p of chap(b, BD1)) expect(p.fin != null && p.fin <= F1, `le bail 1 déborde sa clôture ${F1} : ${p.debut}→${p.fin} (C-2)\n` + contexte()).toBe(true);
    if (etat.clos2) for (const p of chap(b, BD2)) expect(p.fin != null && p.fin <= etat.clos2, `le bail 2 déborde sa clôture ${etat.clos2} : ${p.debut}→${p.fin} (C-2)\n` + contexte()).toBe(true);
    for (const p of v) expect(p.bailDebut <= p.debut, `période ${p.debut} rattachée à un bail qui commence après elle (${p.bailDebut}) (C-3)\n` + contexte()).toBe(true);
    // I-F : indépendance à l'ordre du tableau
    const base = MOIS.map((ym) => duMois(ctx(b), ym).total);
    expect(MOIS.map((ym) => duMois(ctx(melange(b, rnd)), ym).total), 'dû dépendant de l\'ordre du tableau (I-F)\n' + contexte()).toEqual(base);
  }
  return nEdits;
}

describe('fuzz à DEUX chapitres de bail — contigus ou après vacance (graine fixe ' + GRAINE + ')', () => {
  it(`${NB_SEQUENCES} séquences : éditer un chapitre ne touche jamais l'autre, aucun bail ne déborde sa clôture`, () => {
    let edits = 0;
    for (let s = 0; s < NB_SEQUENCES; s++) edits += lancer(GRAINE + s);
    expect(edits).toBeGreaterThan(NB_SEQUENCES * 0.5);
  }, 120000);
});
