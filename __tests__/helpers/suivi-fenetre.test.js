/**
 * FINANCES-SUIVI-UNIQUE P4 — js/core/suivi-fenetre.js : la fenêtre unique « avance / retard » et
 * l'alerte « loyer incomplet » de Mouvements (mise en forme pure des sorties du moteur).
 *
 * Prouvé ici :
 *   - cartes / groupes / tri / « voir les N autres » / phrase de synthèse (maquette 02) ;
 *   - le MOIS et le PLAFOND du geste « Accepter le manque » (cibleManque) : mois regardé, mois
 *     précédent sous la tolérance du 10, dernier mois du bail pour un locataire parti — et, rejoué
 *     dans le moteur, le geste solde exactement la case sans toucher aux mois passés (I-1) ;
 *   - le contrôle de saisie (plafond, motif obligatoire, date) ;
 *   - I-d via la fenêtre : Σ des cartes = valeur de la case (titre) = Σ des lots, ≥ 300 jeux ;
 *   - l'index « mouvement → mois incomplet » (alerte Mouvements) et le texte de l'alerte ;
 *   - le câblage de l'app (anciennes fenêtres supprimées, aucun onclick orphelin).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { suiviLot, suiviPerimetre } from '../../js/core/suivi-loyers.js';
import {
  eur, eurSigne, phraseSynthese, decouperGroupe, trierGroupe, cibleManque, controlerSaisie,
  modeleFenetre, indexMouvementsLot, texteAlerte, debutDeCle, moisAu
} from '../../js/core/suivi-fenetre.js';
import { lotArslan, TODAY_ARSLAN, CLE_ARSLAN, vir, prng, lotAleatoire } from './suivi-loyers-fixtures.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const NB = ' ';
const OPTS = { today: TODAY_ARSLAN, graceLast: true };
const bail = (cle, debut, hc, ch, extra) => Object.assign({ cle, debut, fin: null, finEffective: null, archive: false, hc, ch, noms: 'Loc ' + cle }, extra || {});
const avecManque = (lot, m) => Object.assign({}, lot, { manques: (lot.manques || []).concat([Object.assign({ id: 'mqa_t' + Math.random().toString(36).slice(2, 6), motif: 'test', date: '2026-10-05' }, m)]) });

/** §C.3 : 650 + 10, février payé 538, mars → juillet payés 660 → reste dû 122 depuis février. */
function lotDetteAncienne() {
  const p = [vir('j', '2026-01-03', 660), vir('f', '2026-02-03', 538)];
  ['03', '04', '05', '06', '07'].forEach((m) => p.push(vir('m' + m, '2026-' + m + '-03', 660)));
  return { ref: 'D', bareme: [], manques: [], baux: [bail('D|2026-01-01', '2026-01-01', 650, 10)], paiements: p };
}

describe('P4 — mise en forme des montants et de la phrase', () => {
  it('eur / eurSigne : format français, court sans centimes ronds', () => {
    expect(eur(20)).toBe('20,00' + NB + '€');
    expect(eur(-5378.76)).toBe('5' + NB + '378,76' + NB + '€');
    expect(eurSigne(-20)).toBe('−20' + NB + '€');
    expect(eurSigne(430)).toBe('+430' + NB + '€');
    expect(eurSigne(-4.99)).toBe('−4,99' + NB + '€');
    expect(eurSigne(0.001)).toBe('0' + NB + '€');
  });
  it('phrase de synthèse (maquette) : un lot, tous, mélange, manque accepté', () => {
    const c = (solde, manque) => ({ solde, manque: manque ? { montant: manque } : null });
    expect(phraseSynthese({})).toBe('Aucun lot à regarder : tout est à jour.');
    expect(phraseSynthese({ retard: [c(-20)] })).toBe('1 lot à regarder : en retard (−20' + NB + '€)');
    expect(phraseSynthese({ acceptes: [c(0, 20)] })).toBe('1 lot à regarder : manque de 20' + NB + '€ accepté');
    expect(phraseSynthese({ retard: [c(-142.72), c(-122), c(-4.99)], avance: [c(430), c(287.42)] }))
      .toBe('5 lots à regarder : 3 en retard (−269,71' + NB + '€), 2 en avance (+717,42' + NB + '€)');
    expect(phraseSynthese({ retard: [c(-660), c(-600)] })).toBe('2 lots à regarder : tous en retard (−1' + NB + '260' + NB + '€)');
    expect(phraseSynthese({ retard: [c(-10)], acceptes: [c(0, 20), c(0, 5)] })).toBe('3 lots à regarder : 1 en retard (−10' + NB + '€), 2 manques acceptés');
  });
  it('tri décroissant en valeur absolue ; « voir les N autres » au-delà de 5', () => {
    const l = [-55, -660, -410, -600, -55, -626.24, -544.1, -484.01].map((s, i) => ({ solde: s, noms: 'N' + i, ref: 'R' + i }));
    const t = trierGroupe(l);
    expect(t.map((x) => x.solde)).toEqual([-660, -626.24, -600, -544.1, -484.01, -410, -55, -55]);
    expect(t.slice(-2).map((x) => x.noms)).toEqual(['N0', 'N4']);
    const d = decouperGroupe(t, false);
    expect(d.visibles).toHaveLength(5);
    expect(d.autres).toBe(3);
    expect(d.replie).toBe(true);
    expect(decouperGroupe(t, true).visibles).toHaveLength(8);
    expect(decouperGroupe(t.slice(0, 5), false)).toMatchObject({ autres: 0, replie: false });
  });
  it('debutDeCle lit la date de début (avec ou sans uid de bail)', () => {
    expect(debutDeCle(CLE_ARSLAN)).toBe('2026-05-03');
    expect(debutDeCle('F|X|2026-01-01|uid-9')).toBe('2026-01-01');
    expect(debutDeCle('rien')).toBe(null);
  });
});

describe('P4 — le mois et le plafond du geste (cibleManque), rejoués dans le moteur', () => {
  it('Arslan août : mois regardé, plafond 20 ; le geste solde août, septembre et octobre', () => {
    const s = suiviLot(lotArslan(), OPTS);
    const b = s.baux.find((x) => x.cle === CLE_ARSLAN);
    const c = cibleManque(b, '2026-08', false);
    expect(c).toEqual({ ym: '2026-08', plafond: 20, regle: 'mois' });
    const apres = suiviLot(avecManque(lotArslan(), { bailCle: CLE_ARSLAN, ym: c.ym, montant: c.plafond }), OPTS);
    expect(['2026-08', '2026-09', '2026-10'].map((ym) => apres.mois[ym].solde)).toEqual([0, 0, 0]);
  });
  it('dette ancienne (§C.3) : juillet payé, reste 122 depuis février → geste sur juillet, juillet soldé, le passé ne bouge pas', () => {
    const s = suiviLot(lotDetteAncienne(), { today: '2026-07-20' });
    const c = cibleManque(s.baux[0], '2026-07', false);
    expect(c).toEqual({ ym: '2026-07', plafond: 122, regle: 'mois' });
    const apres = suiviLot(avecManque(lotDetteAncienne(), { bailCle: 'D|2026-01-01', ym: c.ym, montant: c.plafond }), { today: '2026-07-20' });
    expect(apres.mois['2026-07'].solde).toBe(0);
    expect(apres.mois['2026-06'].solde).toBe(-122);      // I-1 : un mois figé ne bouge pas
  });
  it('mois sous la tolérance du 10 : le geste porte sur le mois PRÉCÉDENT (la dette ancienne affichée)', () => {
    const lot = () => ({ ref: 'G', bareme: [], manques: [], baux: [bail('G|2026-01-01', '2026-01-01', 500, 0)], paiements: [vir('j', '2026-01-04', 500)] });
    const o = { today: '2026-03-05', graceLast: true };
    const s = suiviLot(lot(), o);
    expect(s.mois['2026-03'].solde).toBe(-500);            // février seulement : mars pas encore exigible
    const c = cibleManque(s.baux[0], '2026-03', false);
    expect(c).toEqual({ ym: '2026-02', plafond: 500, regle: 'tolerance' });
    const apres = suiviLot(avecManque(lot(), { bailCle: 'G|2026-01-01', ym: c.ym, montant: c.plafond }), o);
    expect(apres.mois['2026-03'].solde).toBe(0);           // la case de mars passe à 0
    // le même montant posé sur mars aurait d'abord visé le loyer de mars, pas encore dû : la case resterait −500
    const faux = suiviLot(avecManque(lot(), { bailCle: 'G|2026-01-01', ym: '2026-03', montant: 500 }), o);
    expect(faux.mois['2026-03'].solde).toBe(-500);
  });
  it('locataire parti : dette figée → geste sur le DERNIER mois du bail', () => {
    const lot = () => ({ ref: 'P', bareme: [], manques: [],
      baux: [bail('P|2026-01-01', '2026-01-01', 600, 0, { fin: '2026-04-30', finEffective: '2026-04-30', archive: true }), bail('P|2026-06-01', '2026-06-01', 600, 0)],
      paiements: [vir('a', '2026-01-05', 600), vir('b', '2026-02-05', 600), ...['06', '07', '08', '09'].map((m, k) => vir('n' + k, '2026-' + m + '-05', 600))] });
    const o = { today: '2026-09-20' };
    const s = suiviLot(lot(), o);
    const P = suiviPerimetre([s], '2026-09');
    const carte = P.enRetard.find((c) => c.parti);
    expect(carte.solde).toBe(-1200);
    const c = cibleManque(s.baux[0], '2026-09', true);
    expect(c).toEqual({ ym: '2026-04', plafond: 1200, regle: 'parti' });
    const apres = suiviLot(avecManque(lot(), { bailCle: 'P|2026-01-01', ym: c.ym, montant: c.plafond }), o);
    expect(apres.mois['2026-09'].solde).toBe(0);
    expect(apres.mois['2026-03'].solde).toBe(-600);        // le passé ne bouge pas
  });
  it('rien à accepter : null (lot à jour, lot en avance)', () => {
    const s = suiviLot(lotArslan(), OPTS);
    const b = s.baux.find((x) => x.cle === CLE_ARSLAN);
    expect(cibleManque(b, '2026-07', false)).toBe(null);   // payé d'avance
    expect(cibleManque(b, '2026-06', false)).toBe(null);   // +780
  });
});

describe('P4 — contrôle de la saisie (formulaire)', () => {
  it('motif obligatoire, montant > 0 et plafonné, date valide', () => {
    expect(controlerSaisie({ montant: '20.00', motif: 'panne électrique', date: '2026-10-05' }, 20)).toEqual({ ok: true, erreurs: {}, montant: 20 });
    expect(controlerSaisie({ montant: '20,5', motif: 'x', date: '2026-10-05' }, 20.5).montant).toBe(20.5);
    const e = controlerSaisie({ montant: '25', motif: '  ', date: '2026-13-01' }, 20);
    expect(e.ok).toBe(false);
    expect(e.erreurs.montant).toBe('Au plus 20,00' + NB + '€ (ce qui manque).');
    expect(e.erreurs.motif).toBe('Le motif est obligatoire.');
    expect(e.erreurs.date).toBe('Date invalide.');
    expect(controlerSaisie({ montant: '0', motif: 'x', date: '2026-10-05' }, 20).erreurs.montant).toMatch(/supérieur à 0/);
    expect(controlerSaisie({ montant: '', motif: 'x', date: '2026-10-05' }, 20).ok).toBe(false);
    expect(controlerSaisie({ montant: '20.004', motif: 'x', date: '2026-10-05' }, 20).ok).toBe(true);   // tolérance au centime
  });
});

describe('P4 — la fenêtre (modeleFenetre) : cas Arslan', () => {
  it('août sans geste : 1 lot en retard, attendu 760 + 20, reçu 760 le 05/08, « Il manque 20,00 € », geste août plafond 20', () => {
    const M = modeleFenetre([suiviLot(lotArslan(), OPTS)], '2026-08');
    expect(M.solde).toBe(-20);
    expect(M.phrase).toBe('1 lot à regarder : en retard (−20' + NB + '€)');
    expect(M.retard).toHaveLength(1);
    const x = M.retard[0];
    expect(x).toMatchObject({ ref: 'Ferrette - 101', noms: 'Elise ARSLAN', bailDebut: '2026-05-03', parti: false, sens: 'retard' });
    expect(x.attendu).toEqual({ total: 780, hc: 760, ch: 20, sub: '760 loyer + 20 charges' });
    expect(x.recus).toEqual([{ mvId: 'v5', date: '2026-08-05', kind: 'virement', montant: 760, avance: false }]);
    expect(x.resultats).toEqual([{ cls: 'warn', txt: '⚠ Il manque 20,00' + NB + '€', action: 'accepter' }]);
    expect(x.geste).toMatchObject({ ym: '2026-08', plafond: 20, prefill: 20, regle: 'mois', ref: 'Ferrette - 101', bailDebut: '2026-05-03' });
  });
  it('septembre sans geste : « ✅ Septembre : payé » puis « ⚠ Reste dû des mois précédents : 20 (depuis août) »', () => {
    const x = modeleFenetre([suiviLot(lotArslan(), OPTS)], '2026-09').retard[0];
    expect(x.resultats.map((r) => r.txt)).toEqual(['✅ Septembre : payé', '⚠ Reste dû des mois précédents : 20,00' + NB + '€ (depuis août)']);
    expect(x.resultats[1].action).toBe('accepter');
  });
  it('août avec le geste : carte « Soldé : manque de 20 € accepté (motif · jj/mm) » + Annuler, case 0', () => {
    const M = modeleFenetre([suiviLot(lotArslan({ geste: true }), OPTS)], '2026-08');
    expect(M.solde).toBe(0);
    expect(M.phrase).toBe('1 lot à regarder : manque de 20' + NB + '€ accepté');
    const x = M.retard[0];
    expect(x.sens).toBe('accepte');
    expect(x.geste).toBe(null);
    expect(x.resultats).toEqual([{ cls: 'ok', txt: '✅ Soldé : manque de 20,00' + NB + '€ accepté (panne électrique · 05/08)', action: 'annuler', manqueId: 'mqa_1' }]);
    expect(M.aJour.map((a) => a.ref)).not.toContain('Ferrette - 101');
  });
  it('juin : en avance +780 « payés d\'avance le 27/06 » + note de reclassement ; juillet : à jour', () => {
    const M = modeleFenetre([suiviLot(lotArslan(), OPTS)], '2026-06', { dernierVirement: () => '2026-06-27' });
    expect(M.avance[0].resultats[0]).toEqual({ cls: 'adv', txt: '🔵 780,00' + NB + '€ payés d\'avance le 27/06' });
    expect(M.avance[0].notes).toEqual(['Si c\'est un solde de charges, reclasse le mouvement dans Charges récupérables.']);
    const jul = modeleFenetre([suiviLot(lotArslan(), OPTS)], '2026-07');
    expect(jul.nb).toBe(0);
    expect(jul.aJour).toEqual([{ ref: 'Ferrette - 101', noms: 'Elise ARSLAN' }]);
  });
  it('« Reçu pour » = argent reçu À LA FIN du mois ; un paiement postérieur est dit « réglé ensuite »', () => {
    const lot = { ref: 'L', bareme: [], manques: [], baux: [bail('L|2026-01-01', '2026-01-01', 600, 0)],
      paiements: [vir('a', '2026-01-05', 600), vir('c', '2026-03-02', 1200)] };
    const x = modeleFenetre([suiviLot(lot, { today: '2026-03-20' })], '2026-02').retard[0];
    expect(x.recus).toEqual([]);
    expect(x.resultats[0].txt).toBe('⚠ Il manque 600,00' + NB + '€');
    expect(x.notes).toContain('Réglé ensuite : 600,00' + NB + '€ le 02/03.');
  });
  it('locataire parti : pastille, dette figée, geste sur son dernier mois', () => {
    const lot = { ref: 'P', bareme: [], manques: [],
      baux: [bail('P|2026-01-01', '2026-01-01', 600, 0, { fin: '2026-04-30', finEffective: '2026-04-30', archive: true, noms: 'Paul' }), bail('P|2026-06-01', '2026-06-01', 600, 0, { noms: 'Anne' })],
      paiements: [vir('a', '2026-01-05', 600), vir('b', '2026-02-05', 600), ...['06', '07', '08', '09'].map((m, k) => vir('n' + k, '2026-' + m + '-05', 600))] };
    const M = modeleFenetre([suiviLot(lot, { today: '2026-09-20' })], '2026-09');
    const x = M.retard[0];
    expect(x).toMatchObject({ noms: 'Paul', parti: true, solde: -1200 });
    expect(x.resultats[0].txt).toBe('⚠ Reste dû à son départ : 1' + NB + '200,00' + NB + '€ (depuis mars)');
    expect(x.notes[0]).toBe('Locataire parti le 30/04/2026 : dette figée à son départ, visible jusqu\'à la fin de cette année.');
    expect(x.geste).toMatchObject({ ym: '2026-04', plafond: 1200, regle: 'parti' });
  });
  it('GLI : « couvert par la GLI » sans réduire la dette (Q4)', () => {
    const lot = { ref: 'Q', bareme: [], manques: [], baux: [bail('Q|2026-01-01', '2026-01-01', 800, 0)],
      paiements: [vir('a', '2026-01-05', 800), { id: 'g', date: '2026-03-20', montant: 1600, kind: 'gli' }] };
    const x = modeleFenetre([suiviLot(lot, { today: '2026-04-25' })], '2026-04').retard[0];
    expect(x.solde).toBe(-2400);
    expect(x.notes).toContain('Couvert par la GLI : 1' + NB + '600,00' + NB + '€ (la dette du locataire reste due).');
  });
  it('mois non exigible : seule l\'avance compte (comme la case), aucun geste', () => {
    const M = modeleFenetre([suiviLot(lotArslan(), OPTS)], '2026-09', { exigible: false });
    expect(M.retard).toEqual([]);
    expect(M.solde).toBe(0);
  });
});

describe('P4 — I-d via la fenêtre : Σ cartes = valeur de la case (titre) = Σ lots', () => {
  it('≥ 300 périmètres aléatoires, chaque mois exigible', () => {
    const rnd = prng(20261007);
    for (let n = 0; n < 300; n++) {
      const nb = 1 + Math.floor(rnd() * 3);
      const gen = Array.from({ length: nb }, (_, k) => lotAleatoire(rnd, n * 10 + k));
      const today = gen.map((g) => g.today).sort().pop();
      const lots = gen.map((g) => suiviLot(g.lot, { today }));
      const yms = new Set(); lots.forEach((s) => Object.keys(s.mois).forEach((ym) => { if (ym <= today.slice(0, 7)) yms.add(ym); }));
      for (const ym of yms) {
        const M = modeleFenetre(lots, ym);
        const sigmaCartes = r2(M.retard.concat(M.avance).reduce((t, x) => t + x.solde, 0));
        const sigmaLots = r2(lots.reduce((t, s) => t + ((s.mois[ym] && s.mois[ym].solde) || 0), 0));
        expect(M.solde, ym + ' titre = Σ lots').toBeCloseTo(sigmaLots, 2);
        expect(sigmaCartes, ym + ' Σ cartes = titre').toBeCloseTo(M.solde, 2);
        expect(M.retard.every((x) => x.solde <= 0.005) && M.avance.every((x) => x.solde > 0.005), 'groupes jamais mélangés').toBe(true);
        for (const x of M.retard) if (x.geste) expect(x.geste.plafond, 'plafond = ce que la carte affiche').toBeCloseTo(-x.solde, 2);
      }
    }
  });
});

describe('P4 — alerte Mouvements (indexMouvementsLot, texteAlerte)', () => {
  it('Arslan : le virement du 05/08 porte l\'alerte « 760 € reçus sur 780 € (−20 €) » ; aucun autre', () => {
    const idx = indexMouvementsLot(suiviLot(lotArslan(), OPTS));
    expect([...idx.keys()]).toEqual(['v5']);
    expect(idx.get('v5')).toEqual({ ym: '2026-08', ref: 'Ferrette - 101', bailCle: CLE_ARSLAN, bailDebut: '2026-05-03', du: 780, recu: 760, manque: 20, plafond: 20, accepte: null });
    expect(texteAlerte(idx.get('v5'), '2026-08-05')).toBe('Loyer incomplet : 760' + NB + '€ reçus sur 780' + NB + '€ (−20' + NB + '€). Accepter le manque ?');
    expect(texteAlerte(idx.get('v5'), '2026-07-28')).toMatch(/^Loyer incomplet \(août\) : /);
  });
  it('après le geste : plus d\'alerte, la pastille « manque accepté »', () => {
    const i = indexMouvementsLot(suiviLot(lotArslan({ geste: true }), OPTS)).get('v5');
    expect(i.manque).toBe(0);
    expect(i.accepte).toEqual({ id: 'mqa_1', montant: 20, motif: 'panne électrique', date: '2026-08-05' });
    expect(texteAlerte(i)).toBe('');
  });
  it('deux versements dans le mois : l\'alerte va sous le DERNIER ; tolérance du 10 : pas d\'alerte', () => {
    const lot = { ref: 'T', bareme: [], manques: [], baux: [bail('T|2026-01-01', '2026-01-01', 650, 10)],
      paiements: [vir('a', '2026-01-03', 660), vir('b1', '2026-02-03', 300), vir('b2', '2026-02-20', 238), vir('c', '2026-03-03', 300)] };
    const idx = indexMouvementsLot(suiviLot(lot, { today: '2026-03-05', graceLast: true }));
    expect([...idx.keys()]).toEqual(['b2']);
    expect(idx.get('b2')).toMatchObject({ ym: '2026-02', recu: 538, manque: 122 });
    const sansGrace = indexMouvementsLot(suiviLot(lot, { today: '2026-03-15', graceLast: false }));
    expect(sansGrace.get('c')).toMatchObject({ ym: '2026-03', manque: 360 });
  });
  it('un mois rattrapé ensuite n\'a plus d\'alerte (reste dû par mois d\'origine)', () => {
    const lot = { ref: 'U', bareme: [], manques: [], baux: [bail('U|2026-01-01', '2026-01-01', 500, 0)],
      paiements: [vir('a', '2026-01-03', 480), vir('b', '2026-02-03', 520)] };
    expect(indexMouvementsLot(suiviLot(lot, { today: '2026-02-20' })).size).toBe(0);
  });
  it('moisAu : dernier mois ≤ ym', () => {
    const b = suiviLot(lotArslan(), OPTS).baux.find((x) => x.cle === CLE_ARSLAN);
    expect(moisAu(b, '2026-08').ym).toBe('2026-08');
    expect(moisAu(b, '2027-02').ym).toBe('2026-10');
    expect(moisAu(b, '2026-01')).toBe(null);
  });
});

// ── Câblage (patron *-cablage.test.js) : la fenêtre unique remplace les deux anciennes ──
describe('P4 — câblage de l\'app', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url).pathname, 'utf8').replace(/\r/g, '');
  const corps = (nom) => { const i = html.indexOf('function ' + nom + '('); const j = html.indexOf('\n}', i); return i < 0 ? '' : html.slice(i, j + 2); };
  const main = readFileSync(new URL('../../js/main.js', import.meta.url).pathname, 'utf8');
  it('les anciennes fenêtres et leurs appelants ont disparu (aucun onclick orphelin)', () => {
    for (const f of ['_finDrillRetard', '_finDrillAvance', '_finDrillSuivi', '_finSuiviCarteHtml', '_finSuiviMoisBail']) {
      expect(html, f).not.toMatch(new RegExp('function ' + f + '\\('));
      expect(html, f + ' appelé').not.toMatch(new RegExp(f + '\\(\\s*[\'"\\d]'));
    }
  });
  it('les cases de la ligne d\'écart (mois ET Année) et les cases signalées ouvrent _finFenetre', () => {
    const pl = corps('_finRenderPLv2');
    expect(pl.match(/onclick="_finFenetre\(' \+ yr \+ '\)"/g) || []).toHaveLength(1);              // Année / ligne entière
    expect((pl.match(/onclick="_finFenetre\(' \+ yr \+ ',' \+ m\.mo \+ '\)"/g) || []).length).toBe(3); // mois, orange, bleu
  });
  it('la fenêtre lit le moteur (modeleFenetre sur _finSuiviCase), titre = valeur de la case', () => {
    const r = corps('_finFenetreRendre');
    expect(r).toMatch(/_finSuiviCase\(S\.yr, S\.mo\)/);
    expect(r).toMatch(/SF\.modeleFenetre\(K\.lots, K\.ym/);
    expect(r).toMatch(/const v = M\.solde;/);
    expect(r).toMatch(/fdw-tv ' \+ vCls \+ '">' \+ esc\(SF\.eurSigne\(v\)\)/);
  });
  it('le geste passe par _manqueAccepter avec le plafond calculé (dette), jamais de faux « enregistré »', () => {
    const e = corps('_mqFormEnregistrer');
    expect(e).toMatch(/_manqueAccepter\(\{ ref: fm\.getAttribute\('data-ref'\), bailDebut: fm\.getAttribute\('data-debut'\), ym: fm\.getAttribute\('data-ym'\)/);
    expect(e).toMatch(/dette: plafond \}\)/);
    expect(e).toMatch(/if \(!e\) \{ err\('global', 'Rien n\\'a été enregistré\.'\); return; \}/);
    expect(corps('_mqFormBasculer')).toMatch(/_mqLectureSeule\(\)/);
    expect(corps('_mqLectureSeule')).toMatch(/_appReadOnly/);
    expect(corps('_mqAnnulerGeste')).toMatch(/_manqueAnnuler\(id\)/);
  });
  it('Mouvements : alerte + pastille sur les lignes (tableau ET cartes téléphone), index mémoïsé', () => {
    const r = corps('rMv');
    expect(r).toMatch(/_mvManqueInfo\(m\)/);
    expect(r).toMatch(/_mvCardRowPhone\(m, net, mq\)/);
    expect(r).toMatch(/_mvMqAlerte\(m, mq, false\)/);
    expect(corps('_mvCardRowPhone')).toMatch(/_mvMqAlerte\(m, mq, true\)/);
    expect(corps('_mvManqueInfo')).toMatch(/_mvMqCache\.lots\.get\(k\)/);
    expect(corps('_mvManqueInfo')).toMatch(/indexMouvementsLot\(s\)/);
  });
  // RÉÉCRIT en P5 : en P4, _lyRelance lisait encore l'ancien moteur (lot entier depuis janvier), et le
  // bouton était retiré quand son montant différait de la carte (_finFenRelanceCoherente). La relance
  // lit désormais le MÊME suivi, par bail (lignesRelanceBail) : la condition d'écart n'a plus d'objet,
  // le bouton revient pour TOUT bail en retard (locataire parti compris) et désigne CE bail. L'égalité
  // carte = relance au centime est prouvée sur des jeux réels dans finances-suivi-p5.test.js (I-g).
  it('relance = carte : bouton pour tout bail en retard, relance DE CE BAIL (P5, plus de condition d\'écart)', () => {
    const d = corps('_finFenDetail');
    expect(d).toMatch(/if \(x\.sens === 'retard' && typeof _lyRelance === 'function' && !String\(x\.ref\)\.startsWith\('SCI:'\)\) \{/);
    expect(d).toMatch(/data-cle="' \+ esc\(x\.bailCle \|\| ''\) \+ '"/);
    expect(d).toMatch(/_lyRelance\(this\.dataset\.ref,this\.dataset\.cle\)/);
    expect(d).not.toMatch(/!x\.parti/);
    expect(html).not.toMatch(/_finFenRelanceCoherente/);
  });
  it('main.js expose window.SuiviFenetre', () => {
    expect(main).toMatch(/import \* as SuiviFenetre from '\.\/core\/suivi-fenetre\.js'/);
    expect(main).toMatch(/window\.SuiviFenetre = SuiviFenetre;/);
  });
});
