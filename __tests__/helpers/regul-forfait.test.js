/**
 * Tests — FORFAIT DE CHARGES (art. 25-10 meublé / art. 8-1, V colocation) dans la RÉGULARISATION. Module js/core/regul-forfait.js
 * + câblage réel de computeRegul / _rgYearChargesDetail (fonctions extraites d'index.html).
 *
 * Audit 30/09 (portage régul/forfait) :
 *  🔴1 la base N-1 de l'estimation au départ était amputée des charges de la période au forfait ;
 *  🔴2 un avenant « À signer » d'un bail CLOS était attribué au bail suivant du même logement ;
 *  🟡5 le repère de date ne disait pas la FIN d'un forfait (forfait de mars à août).
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  forfaitAvenantsDuBail, occNonForfaitJours, forfaitIntervalles, appliquerForfaitOccupation,
  periodeForfaitLibelle, baseChargesLogement, avenantObjetApplique, avenantApplicationAffichee,
} from '../../js/core/regul-forfait.js';
import * as AvenantRegistre from '../../js/core/avenant-registre.js';
import { listeAvenants, numeroSuivant, debutsBauxClos } from '../../js/core/avenant-registre.js';

const FORFAIT = 'Passage au forfait de charges';
const PROVISIONS = 'Passage aux provisions avec régularisation';
const av = (no, date, mode, extra = {}) => Object.assign({ id: 'av' + no + date, type: 'avenant', ref: 'L1', bailDebut: '2025-01-01', no, statut: 'a_signer', date, objets: [{ k: 'charges', data: { mode, montant: 100 } }] }, extra);
const bail = (debut = '2025-01-01', extra = {}) => Object.assign({ ref: 'L1', debut, ch: 100 }, extra);

/** Occupation au format computeRegul : une charge de 100 € le 15 et une provision de 100 € chaque mois. */
function occupation(b, annee, { du = 1, au = 12 } = {}) {
  const details = [], moisDetails = [];
  for (let m = du; m <= au; m++) {
    const mm = String(m).padStart(2, '0');
    details.push({ date: `${annee}-${mm}-15`, lib: 'Charges ' + mm, montant: 100, mvId: `mv-${annee}-${mm}` });
    moisDetails.push({ mois: `${annee}-${mm}`, ch: 100 });
  }
  const fin = new Date(Date.UTC(annee, au, 0)).toISOString().slice(0, 10);
  return { ref: 'L1', bail: b, debutOcc: `${annee}-${String(du).padStart(2, '0')}-01`, finOcc: fin, details, moisDetails, charges: details.length * 100, provisions: moisDetails.length * 100 };
}

describe('forfaitIntervalles — périodes au forfait qui recoupent la fenêtre', () => {
  it('forfait de mars à août puis retour aux provisions → un intervalle 01/03 → 31/08', () => {
    const avs = [av(1, '2026-03-01', FORFAIT), av(2, '2026-09-01', PROVISIONS)];
    expect(forfaitIntervalles(bail(), '2026-01-01', '2026-12-31', avs)).toEqual([{ du: '2026-03-01', au: '2026-08-31' }]);
  });
  it('forfait en cours au début de la fenêtre, coupé à la fenêtre', () => {
    const avs = [av(1, '2025-07-01', FORFAIT)];
    expect(forfaitIntervalles(bail(), '2026-01-01', '2026-06-30', avs)).toEqual([{ du: '2026-01-01', au: '2026-06-30' }]);
  });
  it('exercice antérieur à l\'avenant → aucun intervalle', () => {
    expect(forfaitIntervalles(bail(), '2025-01-01', '2025-12-31', [av(1, '2026-07-01', FORFAIT)])).toEqual([]);
  });
  it('forfait d\'origine (flag seul) → toute la fenêtre ; sans flag → rien', () => {
    expect(forfaitIntervalles(bail('2025-01-01', { chForfait: true }), '2026-01-01', '2026-12-31', [])).toEqual([{ du: '2026-01-01', au: '2026-12-31' }]);
    expect(forfaitIntervalles(bail(), '2026-01-01', '2026-12-31', [])).toEqual([]);
  });
  it('deux périodes au forfait dans la même fenêtre', () => {
    const avs = [av(1, '2026-02-01', FORFAIT), av(2, '2026-04-01', PROVISIONS), av(3, '2026-10-01', FORFAIT)];
    expect(forfaitIntervalles(bail(), '2026-01-01', '2026-12-31', avs)).toEqual([{ du: '2026-02-01', au: '2026-03-31' }, { du: '2026-10-01', au: '2026-12-31' }]);
  });
});

describe('periodeForfaitLibelle — repère de date imprimé', () => {
  it('« du … au … » (fin du forfait dite), « et » entre deux périodes, « sur toute la période »', () => {
    expect(periodeForfaitLibelle({ toute: false, intervalles: [{ du: '2026-03-01', au: '2026-08-31' }] })).toBe('du 01/03/2026 au 31/08/2026');
    expect(periodeForfaitLibelle({ toute: false, intervalles: [{ du: '2026-02-01', au: '2026-03-31' }, { du: '2026-10-01', au: '2026-12-31' }] }))
      .toBe('du 01/02/2026 au 31/03/2026 et du 01/10/2026 au 31/12/2026');
    expect(periodeForfaitLibelle({ toute: true, intervalles: [{ du: '2026-01-01', au: '2026-12-31' }] })).toBe('sur toute la période');
    expect(periodeForfaitLibelle(null)).toBe('');
  });
});

describe('appliquerForfaitOccupation — post-traitement de computeRegul', () => {
  it('année de transition : garde janvier-juin, retire juillet-décembre, et CONSERVE les lignes retirées', () => {
    const e = appliquerForfaitOccupation(occupation(bail(), 2026), { from: '2026-01-01', to: '2026-12-31', avenants: [av(1, '2026-07-01', FORFAIT)] });
    expect(e.charges).toBe(600);
    expect(e.provisions).toBe(600);
    expect(e.forfait.excluCharges).toBe(600);
    expect(e.forfait.excluProvisions).toBe(600);
    expect(e.forfait.exclusDetails).toHaveLength(6);
    expect(e.forfait.exclusDetails[0].date).toBe('2026-07-15');
    expect(e.forfait.partiel).toBe(true);
    expect(e.forfait.intervalles).toEqual([{ du: '2026-07-01', au: '2026-12-31' }]);
  });
  it('exercice N-1 antérieur à l\'avenant : intact, aucun repère', () => {
    const e = appliquerForfaitOccupation(occupation(bail(), 2025), { from: '2025-01-01', to: '2025-12-31', avenants: [av(1, '2026-07-01', FORFAIT)] });
    expect(e.charges).toBe(1200);
    expect(e.provisions).toBe(1200);
    expect(e.forfait).toBeUndefined();
  });
  it('forfait de mars à août : repère = la période exacte, pas « à compter du 01/03 »', () => {
    const e = appliquerForfaitOccupation(occupation(bail(), 2026), { from: '2026-01-01', to: '2026-12-31', avenants: [av(1, '2026-03-01', FORFAIT), av(2, '2026-09-01', PROVISIONS)] });
    expect(e.charges).toBe(600);
    expect(periodeForfaitLibelle(e.forfait)).toBe('du 01/03/2026 au 31/08/2026');
  });
  it('repère évalué sur l\'OCCUPATION (départ au 30/06) : forfait posé au 01/07 hors occupation → aucun repère', () => {
    const e = appliquerForfaitOccupation(occupation(bail(), 2026, { au: 6 }), { from: '2026-01-01', to: '2026-12-31', avenants: [av(1, '2026-07-01', FORFAIT)] });
    expect(e.forfait).toBeUndefined();
    expect(e.provisions).toBe(600);
  });
  it('forfait sur toute l\'occupation sans aucun mouvement → repère « toute la période », 0 exclu', () => {
    const e = appliquerForfaitOccupation({ ref: 'L1', bail: bail(), debutOcc: '2026-01-01', finOcc: '2026-12-31', details: [], moisDetails: [], charges: 0, provisions: 0 },
      { from: '2026-01-01', to: '2026-12-31', avenants: [av(1, '2025-07-01', FORFAIT)] });
    expect(e.forfait.toute).toBe(true);
    expect(e.forfait.excluCharges).toBe(0);
  });
  it('bail sans forfait : rien ne change', () => {
    const e = appliquerForfaitOccupation(occupation(bail(), 2026), { from: '2026-01-01', to: '2026-12-31', avenants: [] });
    expect(e.charges).toBe(1200);
    expect(e.forfait).toBeUndefined();
  });
});

describe('baseChargesLogement — 🔴1 la base N-1 estime les charges du LOGEMENT', () => {
  it('N-1 au forfait de juillet à décembre : base = 1200 (et non 600)', () => {
    const e = appliquerForfaitOccupation(occupation(bail(), 2025), { from: '2025-01-01', to: '2025-12-31', avenants: [av(1, '2025-07-01', FORFAIT), av(2, '2026-01-01', PROVISIONS)] });
    expect(e.charges).toBe(600); // la régul de 2025 ne régularise pas le forfait…
    const b = baseChargesLogement([e]);
    expect(b.total).toBe(1200); // …mais la base d'estimation reste la charge du logement
    expect(b.moves).toHaveLength(12);
  });
  it('relocation : le bail A au forfait n\'ampute pas la base du bail B', () => {
    const a = appliquerForfaitOccupation(occupation(bail('2024-01-01'), 2025, { au: 6 }), { from: '2025-01-01', to: '2025-12-31', avenants: [av(1, '2025-01-01', FORFAIT, { bailDebut: '2024-01-01' })] });
    const b = appliquerForfaitOccupation(occupation(bail('2025-07-01'), 2025, { du: 7 }), { from: '2025-01-01', to: '2025-12-31', avenants: [] });
    expect(a.charges + b.charges).toBe(600);
    expect(baseChargesLogement([a, b]).total).toBe(1200);
  });
  it('un même mouvement réparti sur deux occupations est regroupé', () => {
    const d = { date: '2025-03-15', lib: 'Eau', montant: 40, mvId: 'x' };
    expect(baseChargesLogement([{ details: [d] }, { details: [], forfait: { exclusDetails: [Object.assign({}, d, { montant: 60 })] } }]))
      .toEqual({ total: 100, moves: [{ key: 'id:x', date: '2025-03-15', lib: 'Eau', montant: 100 }] });
  });
});

describe('🔴2 — un avenant d\'un bail CLOS n\'est jamais attribué au bail suivant', () => {
  // Bail A (meublé) du 01/01/2024, clos au 31/12/2025 ; avenant n° 3 « passage au forfait » resté
  // À signer, effet au 01/01/2026. Bail B (nu) au 01/01/2026 sur le même logement.
  const A = { ref: 'L2', debut: '2024-01-01', finEffective: '2025-12-31', ch: 100 };
  const B = { ref: 'L2', debut: '2026-01-01', ch: 100 };
  const avA = av(3, '2026-01-01', FORFAIT, { ref: 'L2', bailDebut: '2024-01-01' });
  const avB = av(1, '2026-06-01', FORFAIT, { ref: 'L2', bailDebut: '2026-01-01' });
  const historique = [Object.assign({}, A)];

  it('debutsBauxClos : débuts des baux clos du logement, jamais le début du bail courant', () => {
    expect(debutsBauxClos(historique, 'L2', B)).toEqual(['2024-01-01']);
    expect(debutsBauxClos([Object.assign({}, B)], 'L2', B)).toEqual([]);
    expect(debutsBauxClos(historique, 'L9', B)).toEqual([]);
  });
  it('bail B (courant) : l\'avenant de A n\'est ni listé, ni numéroté, ni lu par la régul', () => {
    const args = { journal: [avA], bailEvents: [], cle: 'L2', bail: B, debutsClos: debutsBauxClos(historique, 'L2', B) };
    expect(listeAvenants(args)).toEqual([]);
    expect(numeroSuivant(args)).toBe(1);
    const avs = forfaitAvenantsDuBail(Object.assign({ finIso: '' }, args));
    const e = appliquerForfaitOccupation(occupation(B, 2026), { from: '2026-01-01', to: '2026-12-31', avenants: avs });
    expect(e.charges).toBe(1200);
    expect(e.provisions).toBe(1200);
    expect(e.forfait).toBeUndefined();
  });
  it('sans l\'information des baux clos, l\'ancien rattachement (date ≥ début) reprenait l\'avenant de A — le défaut corrigé', () => {
    expect(listeAvenants({ journal: [avA], cle: 'L2', bail: B }).map((a) => a.no)).toEqual([3]);
  });
  it('bail A (clos) : son propre avenant lui reste rattaché ; celui de B ne l\'est pas', () => {
    const avs = forfaitAvenantsDuBail({ journal: [avA, avB], bailEvents: [], cle: 'L2', bail: A, finIso: '2025-12-31', debutsClos: debutsBauxClos(historique, 'L2', A) });
    expect(avs.map((a) => a.no)).toEqual([3]);
  });
  it('bail B : son propre avenant reste lu (forfait du 01/06)', () => {
    const avs = forfaitAvenantsDuBail({ journal: [avA, avB], bailEvents: [], cle: 'L2', bail: B, debutsClos: debutsBauxClos(historique, 'L2', B) });
    expect(avs.map((a) => a.no)).toEqual([1]);
    const e = appliquerForfaitOccupation(occupation(B, 2026), { from: '2026-01-01', to: '2026-12-31', avenants: avs });
    expect(e.charges).toBe(500);
  });
});

describe('occNonForfaitJours — fraction d\'occupation restée aux provisions', () => {
  const avs = [av(1, '2026-07-01', FORFAIT)];
  it('transition au 01/07 : 181 jours ; forfait total : 0 ; N-1 : 365', () => {
    expect(occNonForfaitJours(bail(), '2026-01-01', '2026-12-31', avs)).toBe(181);
    expect(occNonForfaitJours(bail(), '2026-07-01', '2026-12-31', avs)).toBe(0);
    expect(occNonForfaitJours(bail(), '2025-01-01', '2025-12-31', avs)).toBe(365);
  });
  it('bornes vides ou inversées → 0', () => {
    expect(occNonForfaitJours(bail(), '', '2026-12-31', avs)).toBe(0);
    expect(occNonForfaitJours(bail(), '2026-12-31', '2026-01-01', avs)).toBe(0);
  });
});

describe('avenantObjetApplique — « appliqué » ou « document seulement »', () => {
  const c = { prevHc: 500, newHc: 500, prevCh: 100, newCh: 100, prevForfait: false, newForfait: false };
  it('charges : passage au forfait au même montant = appliqué ; rien ne change = document seulement', () => {
    expect(avenantObjetApplique({ k: 'charges' }, Object.assign({}, c, { newForfait: true }))).toBe(true);
    expect(avenantObjetApplique({ k: 'charges' }, c)).toBe(false);
    expect(avenantObjetApplique({ k: 'charges' }, Object.assign({}, c, { newCh: 120 }))).toBe(true);
  });
  it('loyer : seul le montant compte ; autres objets : document seulement', () => {
    expect(avenantObjetApplique({ k: 'loyer' }, Object.assign({}, c, { newHc: 550 }))).toBe(true);
    expect(avenantObjetApplique({ k: 'loyer' }, Object.assign({}, c, { newForfait: true }))).toBe(false);
    expect(avenantObjetApplique({ k: 'duree' }, c)).toBe(false);
  });
});

describe('avenantApplicationAffichee — texte vrai d\'un avenant lot 2 « forfait seul » (données non réécrites)', () => {
  const b = { ref: 'L1', debut: '2025-01-01', chForfait: true };
  const lot2 = { id: 'a1', no: 1, statut: 'a_signer', date: '2026-07-01', appliques: [], docSeul: ['Charges'], objets: [{ k: 'charges', data: { mode: FORFAIT, montant: '100' } }] };
  it('lot 2 enregistré « document seulement : charges » mais honoré par la régul → affiché appliqué', () => {
    expect(avenantApplicationAffichee(lot2, { bail: b, avenants: [lot2] })).toEqual({ appliques: ['Passage au forfait de charges'], docSeul: [] });
    expect(lot2.appliques).toEqual([]);   // donnée intacte
  });
  it('« À signer » du lot 3 (pas encore appliqué) : affichage inchangé', () => {
    const av = Object.assign({}, lot2, { aLaSignature: true, prevus: ['Passage au forfait de charges'] });
    expect(avenantApplicationAffichee(av, { bail: b, avenants: [av] })).toEqual({ appliques: [], docSeul: ['Charges'] });
  });
  it('annulé : affichage inchangé ; déjà au forfait (régime inchangé) : inchangé', () => {
    const ann = Object.assign({}, lot2, { statut: 'annule' });
    expect(avenantApplicationAffichee(ann, { bail: b, avenants: [ann] }).appliques).toEqual([]);
    const avant = Object.assign({}, lot2, { id: 'a0', no: 0, date: '2026-01-01' });
    expect(avenantApplicationAffichee(lot2, { bail: b, avenants: [avant, lot2] }).appliques).toEqual([]);
  });
});

// ── Câblage réel : computeRegul + _forfaitAvenantsDuBail + _rgYearChargesDetail + _rgN1Charges
//    extraits d'index.html, branchés sur le module (comme main.js le fait sur window). ─────────────
describe('câblage index.html — computeRegul / base N-1 réelles', () => {
  let html;
  beforeAll(() => { html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8').replace(/\r/g, ''); });
  const corpsDe = (src, nom) => {
    const m = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm').exec(src);
    if (!m) throw new Error('fonction introuvable : ' + nom);
    return src.slice(m.index, src.indexOf('\n}', m.index) + 2);
  };
  function charger(DB) {
    const win = {
      appliquerForfaitOccupation, forfaitAvenantsDuBail, AvenantRegistre, baseChargesLogement,
      _regulFrom: '2026-01-01', _regulTo: '2026-12-31',
    };
    const src = ['_isoLocal', '_bailTypeHasTacite', '_bailFinOccupation', 'computeRegul', '_forfaitAvenantsDuBail', '_rgYearChargesDetail', '_rgN1Charges'].map((n) => corpsDe(html, n)).join('\n');
    // eslint-disable-next-line no-new-func
    return new Function('window', 'DB', '_isAlive', '_isLoyerCategory', '_isChargeRecupCategory', '_calcCcRepartition', 'CC_REPARTITION_LABELS', 'fd',
      src + '\nreturn { computeRegul, _rgN1Charges };')(
      win, DB, (x) => !!x && !x._deleted, (c) => c === 'Loyers', (c) => c === 'Charges', () => ({ parts: [] }), {}, (s) => s);
  }
  const mvts = (ref, annees) => {
    const out = [];
    for (const y of annees) for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      out.push({ id: `l-${ref}-${y}-${mm}`, date: `${y}-${mm}-05`, cat: 'Loyers', cr: 600, db: 0, qui: ref });
      out.push({ id: `c-${ref}-${y}-${mm}`, date: `${y}-${mm}-15`, cat: 'Charges', cr: 0, db: 100, qui: ref, lib: 'Charges ' + mm });
    }
    return out;
  };

  it('🔴1 : forfait 01/07/2025 → provisions 01/01/2026 : base N-1 = 1200 (et non 600) ; régul 2025 sans le forfait', () => {
    const DB = {
      logements: [{ ref: 'L1', imm: 'I' }], baux: { L1: { ref: 'L1', debut: '2025-01-01', ch: 100 } }, baux_historique: [],
      mouvements: mvts('L1', [2025, 2026]), entites: [], bailEvents: [],
      baux_evenements: [av(1, '2025-07-01', FORFAIT), av(2, '2026-01-01', PROVISIONS)],
    };
    const { computeRegul, _rgN1Charges } = charger(DB);
    const r25 = computeRegul('2025-01-01', '2025-12-31').entries.L1;
    expect(r25.charges).toBe(600);
    expect(r25.provisions).toBe(600);
    expect(periodeForfaitLibelle(r25.forfait)).toBe('du 01/07/2025 au 31/12/2025');
    const r26 = computeRegul('2026-01-01', '2026-12-31').entries.L1;
    expect(r26.charges).toBe(1200);
    expect(r26.forfait).toBeUndefined();
    expect(_rgN1Charges('L1').total).toBe(1200);
  });

  it('lot 3 : forfait « À signer » → régul inchangée ; signé → forfait honoré dès effetApplique', () => {
    const av = { id: 'av3', type: 'avenant', ref: 'L1', bailDebut: '2025-01-01', no: 1, statut: 'a_signer', aLaSignature: true, date: '2026-07-01',
      objets: [{ k: 'charges', data: { mode: FORFAIT, montant: '100' } }] };
    const DB = { logements: [{ ref: 'L1', imm: 'I' }], baux: { L1: { ref: 'L1', debut: '2025-01-01', ch: 100, type: 'meuble' } }, baux_historique: [],
      mouvements: mvts('L1', [2026]), entites: [], bailEvents: [], baux_evenements: [av] };
    const { computeRegul } = charger(DB);
    const avant = computeRegul('2026-01-01', '2026-12-31').entries.L1;
    expect(avant.charges).toBe(1200); expect(avant.provisions).toBe(1200); expect(avant.forfait).toBeUndefined();
    // Signature : statut « Signé », date réellement appliquée recalée au 1ᵉʳ septembre.
    DB.baux_evenements = [Object.assign({}, av, { statut: 'signe', signeLe: '2026-08-20', effetApplique: '2026-09-01' })];
    DB.baux.L1.chForfait = true;
    const apres = computeRegul('2026-01-01', '2026-12-31').entries.L1;
    expect(apres.charges).toBe(800);       // janvier → août
    expect(apres.provisions).toBe(800);
    expect(periodeForfaitLibelle(apres.forfait)).toBe('du 01/09/2026 au 31/12/2026');
  });

  it('contre-audit : bail clos au 31/03, forfait au 01/06, charges datées APRÈS le départ = vacance → au bailleur ; rien retiré au forfait, aucun repère vide', () => {
    const mv = [];
    for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0');
      if (m <= 3) mv.push({ id: 'l' + m, date: `2026-${mm}-05`, cat: 'Loyers', cr: 600, db: 0, qui: 'L7' });
      mv.push({ id: 'c' + m, date: `2026-${mm}-15`, cat: 'Charges', cr: 0, db: 100, qui: 'L7', lib: 'Charges ' + mm }); }
    const DB = {
      logements: [{ ref: 'L7', imm: 'I' }], baux: {}, bailEvents: [], entites: [], mouvements: mv,
      baux_historique: [{ ref: 'L7', debut: '2025-01-01', finEffective: '2026-03-31', ch: 100, type: 'meuble' }],
      baux_evenements: [av(1, '2026-06-01', FORFAIT, { ref: 'L7', statut: 'signe', effetApplique: '2026-06-01' })],
    };
    const res = charger(DB).computeRegul('2026-01-01', '2026-12-31');
    const e = res.entries['L7|h0'];
    expect(e.finOcc).toBe('2026-03-31');
    expect(e.forfait).toBeUndefined();           // avant : intervalles:[] et 700 € exclus → « (vide) » au PDF
    expect(e.charges).toBe(300);                 // janvier → mars seulement (fix/charges-hors-occupation)
    expect(Math.round(res.bailleur.I.total * 100) / 100).toBe(900); // avril → décembre : vacance, au bailleur
    expect(periodeForfaitLibelle(e.forfait)).toBe('');
  });
  it('module (défensif) : forfait qui ne recoupe pas l\'occupation → aucune exclusion, même d\'une ligne datée pendant le forfait', () => {
    const occ = occupation(bail(), 2026, { au: 3 });
    // computeRegul n'impute plus une charge hors occupation à un locataire (elle va au bailleur) ;
    // le module reste robuste si une telle ligne lui parvient quand même.
    occ.details.push({ date: '2026-07-15', lib: 'Ligne hors occupation (défensif)', montant: 100, mvId: 'x' }); occ.charges += 100;
    const e = appliquerForfaitOccupation(occ, { from: '2026-01-01', to: '2026-12-31', avenants: [av(1, '2026-06-01', FORFAIT)] });
    expect(e.forfait).toBeUndefined();
    expect(e.charges).toBe(400);
  });

  it('🔴2 : bail A clos avec avenant forfait « À signer » au 01/01/2026, bail B nu au 01/01/2026 → régul de B intacte', () => {
    const DB = {
      logements: [{ ref: 'L2', imm: 'I' }],
      baux: { L2: { ref: 'L2', debut: '2026-01-01', ch: 100, type: 'nu' } },
      baux_historique: [{ ref: 'L2', debut: '2024-01-01', finEffective: '2025-12-31', ch: 100, type: 'meuble' }],
      mouvements: mvts('L2', [2026]), entites: [], bailEvents: [],
      baux_evenements: [av(3, '2026-01-01', FORFAIT, { ref: 'L2', bailDebut: '2024-01-01' })],
    };
    const { computeRegul } = charger(DB);
    const b = computeRegul('2026-01-01', '2026-12-31').entries.L2;
    expect(b.charges).toBe(1200);
    expect(b.provisions).toBe(1200);
    expect(b.forfait).toBeUndefined();
  });
});
