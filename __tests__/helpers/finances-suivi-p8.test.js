/**
 * FINANCES-SUIVI-UNIQUE P8 — corrections du contre-audit final indépendant et deux décisions de
 * Didier restées sans écran. Chaque bloc a été écrit AVANT la correction et vu en échec.
 *
 *  A. Arrondi < 1 € : plafond CUMULÉ d'1 € par bail (12 × 0,99 € ne disparaissent plus) ; la quittance
 *     d'un mois soldé par l'arrondi atteste l'argent reçu.
 *  B. « À confirmer » : (1) début de suivi provisoire (mention) ; (2) virement entre deux baux (Q3) :
 *     choix mémorisé sur le mouvement (`mv.bailCle`), écrit par l'app, synchronisé.
 *  C. Deux manques acceptés le même mois : chacun s'annule.
 *  D. Locataire parti avec AVANCE : trop-perçu à rendre, visible (bail + fenêtre), hors de la case.
 *  E. _rgApplyRetenue (dette > dépôt) : la restitution est enregistrée, la retenue compte.
 *  F. _finSuiviLot : un lot en échec est SIGNALÉ, jamais affiché « à jour ».
 *  G. Mutants survivants du contre-audit : remiseRecue sur cibleIdx, signe de la pénalité art. 22,
 *     restitution enregistrée requise, parti avec avance.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import * as SL from '../../js/core/suivi-loyers.js';
import * as SF from '../../js/core/suivi-fenetre.js';
import * as MA from '../../js/core/manque-accepte.js';
import { _loyerArrearsPass } from '../../js/core/loyer-du-mois.js';
import { mapToRow } from '../../js/core/store-mapping.js';
import { createSupabaseStore } from '../../js/core/store-supabase.js';
import { lotArslan, TODAY_ARSLAN, CLE_ANCIEN, CLE_ARSLAN, vir } from './suivi-loyers-fixtures.js';
import { extraireFonction } from './_extraction-source.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(ROOT, 'js/app/app-part1.js'), 'utf8').replace(/\r/g, '');
const P2 = readFileSync(resolve(ROOT, 'js/app/app-part2.js'), 'utf8').replace(/\r/g, '');
const r2 = (n) => Math.round(n * 100) / 100;
const STRICT = { today: TODAY_ARSLAN, graceLast: false, seuilArrondi: 1 };
const B = (ref, debut, hc, ch, extra) => Object.assign({ cle: ref + '|' + debut, debut, fin: null, finEffective: null, archive: false, hc, ch, noms: 'Loc ' + debut }, extra || {});
const catLigne = () => ({ ligne2044: '211' });

// ── A. Arrondi plafonné à 1 € par bail ─────────────────────────────────────────────────────────
describe('A — arrondi < 1 € : plafond cumulé d\'1 € par bail', () => {
  const douze = (montant) => {
    const paiements = [];
    for (let m = 1; m <= 12; m++) paiements.push(vir('p' + m, '2026-' + String(m).padStart(2, '0') + '-05', montant));
    return SL.suiviLot({ ref: 'L', baux: [B('L', '2026-01-01', 760, 20)], bareme: [], paiements, manques: [] }, { today: '2026-12-15' }).baux[0];
  };
  it('12 virements de 779,01 sur 780 : 0,99 € arrondis UNE fois, 10,89 € restent dus', () => {
    const b = douze(779.01);
    expect(b.traces.filter((t) => t.type === 'arrondi')).toEqual([{ type: 'arrondi', ym: '2026-01', montant: -0.99, ref: null }]);
    expect(r2(b.position.retardLoyer + b.position.retardCharge)).toBe(10.89);
    expect(b.position.avance).toBe(0);
  });
  it('symétrique : 12 × 780,99 → 0,99 € abandonnés une fois, 10,89 € d\'avance', () => {
    const b = douze(780.99);
    expect(b.traces.filter((t) => t.type === 'arrondi').map((t) => t.montant)).toEqual([0.99]);
    expect(b.position.avance).toBe(10.89);
    expect(b.position.retardLoyer + b.position.retardCharge).toBe(0);
  });
  it('socle : la passe plafonne Σ |arrondis| sous le seuil (0,6 puis 0,6 → le 2ᵉ reste dû)', () => {
    const r = _loyerArrearsPass([{ hcDue: 100, chDue: 0, received: 99.4 }, { hcDue: 100, chDue: 0, received: 99.4 }], { carry: true, seuilArrondi: 1, detail: true });
    expect(r.arrondis.map((a) => a.montant)).toEqual([-0.6]);
    expect(r.loyerArrear).toBe(0.6);
  });
  it('non-régression Elise : ancien locataire (303,33 dus, 303 retenus → 0,33) et mai (0,32 d\'avance) restent soldés', () => {
    const s = SL.suiviLot(lotArslan({ geste: true }), STRICT);
    const ancien = s.baux.find((b) => b.cle === CLE_ANCIEN), elise = s.baux.find((b) => b.cle === CLE_ARSLAN);
    expect(ancien.traces.filter((t) => t.type === 'arrondi').map((t) => t.montant)).toEqual([-0.33]);
    expect(ancien.position).toEqual({ retardLoyer: 0, retardCharge: 0, avance: 0, solde: 0 });
    expect(elise.traces.filter((t) => t.type === 'arrondi').map((t) => [t.ym, t.montant])).toEqual([['2026-05', 0.32]]);
    expect(elise.position).toEqual({ retardLoyer: 0, retardCharge: 0, avance: 0, solde: 0 });
    expect(SL.suiviLot(lotArslan(), STRICT).baux.find((b) => b.cle === CLE_ARSLAN).position.retardCharge).toBe(20);
  });
  it('la quittance d\'un mois soldé par l\'arrondi atteste l\'argent reçu (303, pas 303,33)', () => {
    const e = SL.versEtatMoisLot(SL.suiviLot(lotArslan(), STRICT).baux.find((b) => b.cle === CLE_ANCIEN));
    const avril = e.byYm['2026-04'];
    expect(avril.solde).toBe(true);
    expect(avril.remise).toEqual({ montant: 0.33, loyer: 0.33, charge: 0, motif: SL.MOTIF_ARRONDI });
    expect(r2(avril.du - avril.reste - avril.remise.montant)).toBe(303);   // _loyerPayeDuMois / _quitTotal
    expect(avril.received).toBe(303);
    // mai (avance de 0,32 abandonnée) : la quittance dit 729,68 = le loyer du mois, jamais plus que reçu (730)
    const mai = SL.versEtatMoisLot(SL.suiviLot(lotArslan(), STRICT).baux.find((b) => b.cle === CLE_ARSLAN)).byYm['2026-05'];
    expect(mai.remise).toBeUndefined();
    expect(mai.du).toBe(729.68);
    expect(mai.received).toBe(730);
  });
});

// ── B1. Début de suivi provisoire : « à confirmer » ─────────────────────────────────────────────
describe('B1 — début de suivi provisoire (1er loyer reçu) : mention « à confirmer »', () => {
  it('Ferrette - 101 : suivi à partir de mars 2026, un bail commence avant → mention', () => {
    const s = SL.suiviLot(lotArslan(), STRICT);
    expect(SF.mentionDebutSuivi(s)).toEqual({
      ym: '2026-03',
      txt: 'Suivi à partir de mars 2026 (1er loyer reçu) — à confirmer',
      aide: 'Les loyers dus avant mars 2026 ne sont pas comptés tant que la date d\'acquisition n\'est pas saisie.'
    });
  });
  it('pas de mention : début confirmé (acquisition), ou aucun bail coupé', () => {
    const lot = lotArslan(); lot.debutSuivi = { date: '2026-03-01', source: 'acquisition' };
    expect(SF.mentionDebutSuivi(SL.suiviLot(lot, STRICT))).toBe(null);
    const neuf = { ref: 'N', baux: [B('N', '2026-03-01', 500, 0)], bareme: [], paiements: [vir('a', '2026-03-02', 500)], manques: [] };
    expect(SF.mentionDebutSuivi(SL.suiviLot(neuf, { today: '2026-04-20' }))).toBe(null);
  });
  it('la carte de la fenêtre porte la mention', () => {
    const s = SL.suiviLot(lotArslan(), { ...STRICT, graceLast: true });
    const M = SF.modeleFenetre([s], '2026-08', {});
    expect(M.retard[0].debutSuivi.txt).toBe('Suivi à partir de mars 2026 (1er loyer reçu) — à confirmer');
  });
  it('câblage : fenêtre (_finFenDetail) et bandeau « Tous les loyers » affichent la mention', () => {
    expect(extraireFonction(P2, '_finFenDetail')).toMatch(/x\.debutSuivi/);
    expect(extraireFonction(P2, '_lyTousLoyersHtml')).toMatch(/mentionDebutSuivi\(/);
  });
});

// ── B2. Q3 : virement entre deux baux ───────────────────────────────────────────────────────────
// FERRETTE 001 reconstitué (export du 05/10) : ancien bail 450 € parti le 06/06, nouveau 495 + 30 dès le 18/07,
// virements de 237 et 495 € le 16/07.
const lotF001 = (choix) => ({
  ref: 'FERRETTE 001', bareme: [], manques: [],
  baux: [
    { cle: 'FERRETTE 001|2024-10-01', debut: '2024-10-01', fin: null, finEffective: '2026-06-06', archive: true, hc: 450, ch: 0, noms: 'Joseph Misslin' },
    { cle: 'FERRETTE 001|2026-07-18', debut: '2026-07-18', fin: null, finEffective: null, archive: false, hc: 495, ch: 30, noms: 'Baysang Tiffany' }
  ],
  paiements: [vir('m3', '2026-03-02', 450), vir('m4', '2026-04-02', 450), vir('m6', '2026-06-02', 450),
    vir('x1', '2026-07-16', 237), vir('x2', '2026-07-16', 495, choix ? { bailCle: choix } : {}),
    vir('n8', '2026-08-03', 525), vir('n9', '2026-09-01', 525), vir('n10', '2026-10-01', 525)]
});
describe('B2 — Q3 : le virement entre deux locataires, choisi par l\'utilisateur', () => {
  it('sans choix : bail le plus proche, « à confirmer », avec les deux voisins', () => {
    const s = SL.suiviLot(lotF001(), STRICT);
    const h = s.horsPeriode.find((x) => x.mvId === 'x2');
    expect(h).toMatchObject({ bailCle: 'FERRETTE 001|2026-07-18', regle: 'plus-proche', aConfirmer: true, avantCle: 'FERRETTE 001|2024-10-01', apresCle: 'FERRETTE 001|2026-07-18' });
    const idx = SF.indexAConfirmer(s);
    expect([...idx.keys()]).toEqual(['x1', 'x2']);
    const i2 = idx.get('x2');
    expect(i2.ancien).toMatchObject({ cle: 'FERRETTE 001|2024-10-01', noms: 'Joseph Misslin' });
    expect(i2.nouveau).toMatchObject({ cle: 'FERRETTE 001|2026-07-18', noms: 'Baysang Tiffany' });
    expect(SF.texteQ3(i2)).toBe('Ce virement du 16/07 (' + SF.eur(495) + ') tombe entre deux locataires. À qui l\'attribuer ?');
    expect(SF.eur(495)).toMatch(/^495,00\s€$/);
  });
  it('choix « ancien locataire » : le virement paie Joseph Misslin, plus d\'alerte, chiffres au centime', () => {
    const avant = SL.suiviLot(lotF001(), STRICT);
    const s = SL.suiviLot(lotF001('FERRETTE 001|2024-10-01'), STRICT);
    expect(s.horsPeriode.find((x) => x.mvId === 'x2')).toMatchObject({ regle: 'choix', aConfirmer: false, bailCle: 'FERRETTE 001|2024-10-01' });
    expect(SF.indexAConfirmer(s).has('x2')).toBe(false);
    const misslin = (x) => x.baux.find((b) => b.noms === 'Joseph Misslin').position;
    const baysang = (x) => x.baux.find((b) => b.noms === 'Baysang Tiffany').position;
    // avant : Misslin doit 90 (mai impayé, le virement du 02/06 paie juin 90 puis 360 de mai), Baysang +494,90 d'avance
    expect(misslin(avant).retardLoyer).toBe(90);
    expect(baysang(avant).avance).toBe(494.9);
    // après : 495 € reviennent à Misslin → 405 € de trop-perçu ; Baysang : juillet 237 pour 237,10 dus → 0,10 arrondi → 0
    expect(misslin(s)).toEqual({ retardLoyer: 0, retardCharge: 0, avance: 405, solde: 405 });
    expect(baysang(s)).toEqual({ retardLoyer: 0, retardCharge: 0, avance: 0, solde: 0 });
  });
  it('la clé choisie résiste à la casse de la référence et à une ligne cloud posée après le choix', () => {
    const s1 = SL.suiviLot(lotF001('ferrette 001|2024-10-01'), STRICT);
    expect(s1.horsPeriode.find((x) => x.mvId === 'x2').bailCle).toBe('FERRETTE 001|2024-10-01');
    const lot = lotF001('FERRETTE 001|2024-10-01'); lot.baux[0].cle = 'FERRETTE 001|2024-10-01|uid9';
    expect(SL.suiviLot(lot, STRICT).horsPeriode.find((x) => x.mvId === 'x2').bailCle).toBe('FERRETTE 001|2024-10-01|uid9');
    // jamais un bail d'un autre logement
    expect(SL.suiviLot(lotF001('AUTRE|2024-10-01'), STRICT).horsPeriode.find((x) => x.mvId === 'x2').aConfirmer).toBe(true);
  });
  it('collecterPaiements transmet mv.bailCle ; lotDepuisDb aussi', () => {
    const mvs = [{ id: 7, date: '2026-07-16', qui: 'FERRETTE 001', cat: 'Loyers encaissés', cr: 495, bailCle: 'FERRETTE 001|2024-10-01' }];
    expect(SL.collecterPaiements(mvs, { ref: 'FERRETTE 001', catLigne })[0].bailCle).toBe('FERRETTE 001|2024-10-01');
  });
  it('synchro : mv.bailCle voyage dans legacy_raw et revient à l\'hydratation (aller-retour)', async () => {
    const ctx = { espaceId: 'E', ownerId: 'O', detUuid: (...p) => 'u-' + p.join('-'), entiteByNom: new Map(), immeubleByNom: new Map([['imm', 'u-imm']]), logementByRef: new Map([['ferrette 001', 'u-log']]), documentByLegacy: new Map() };
    const mv = { id: 7, date: '2026-07-16', qui: 'FERRETTE 001', imm: 'Imm', cat: 'Loyers encaissés', cr: 495, db: 0, bailCle: 'FERRETTE 001|2024-10-01', _modifiedAt: 'x' };
    const row = mapToRow('mouvements', mv, ctx);
    expect(row).not.toBe(null);
    const store = createSupabaseStore({ fetchTable: async (t) => (t === 'mouvements' ? [row] : []), fetchConfig: async () => ({}), detUuid: ctx.detUuid, espaceId: 'E', ownerId: 'O' });
    const db = await store.hydrate();
    expect(db.mouvements[0].bailCle).toBe('FERRETTE 001|2024-10-01');
  });
});

// Écriture côté app : _mvQ3Choisir EXÉCUTÉE (patron _manqueAccepter : undo, _stamp, audit, save étiqueté, refresh, rollback)
const FNS_Q3 = () => ['_manqueSauver', '_manqueCompteursAudit', '_mvQ3Choisir'].map((n) => extraireFonction(P1, n)).join('\n');
function appQ3({ saveOk = true, readOnly = false } = {}) {
  const ordre = [];
  const ctx = {
    window: { __immoHorsLigne: false },
    DB: { mouvements: [{ id: 7, date: '2026-07-16', qui: 'FERRETTE 001', cat: 'Loyers encaissés', cr: 495, lib: 'VIR' }], auditTrail: [] },
    _appReadOnly: readOnly, _auditPending: [], toasts: [], ordre,
    showToast: (m, t) => { ctx.toasts.push([m, t]); },
    _undoOp: (label, fn) => { ordre.push('undo:' + label); fn(); },
    _stamp: (o) => { ordre.push('stamp'); o._modifiedAt = 'STAMP'; return o; },
    _auditLog: (...a) => { ordre.push('audit:' + a[0] + ':' + a[1]); ctx._auditPending.push(a); },
    saveDB: (o) => { ordre.push('save:' + (o && o.quoi)); return saveOk; },
    _undoOnSaveDBSuccess: () => { ordre.push('undoRealigne'); },
    _refreshAfterMutation: () => { ordre.push('refresh'); },
    JSON, Object, Math, Date, String, Number, Array
  };
  vm.createContext(ctx);
  vm.runInContext(FNS_Q3(), ctx);
  return ctx;
}
describe('B2 — _mvQ3Choisir (app-part1.js) : choix mémorisé sur le mouvement', () => {
  it('écrit mv.bailCle : undo → _stamp → audit → saveDB étiqueté → refresh', () => {
    const c = appQ3();
    expect(vm.runInContext('_mvQ3Choisir(7, "FERRETTE 001|2024-10-01")', c)).toBe(true);
    expect(c.ordre).toEqual(['undo:Attribuer le virement', 'stamp', 'audit:update:mouvement', 'save:attribution', 'refresh']);
    expect(c.DB.mouvements[0]).toMatchObject({ bailCle: 'FERRETTE 001|2024-10-01', _modifiedAt: 'STAMP' });
  });
  it('lecture seule : refus, rien n\'est écrit', () => {
    const c = appQ3({ readOnly: true });
    expect(vm.runInContext('_mvQ3Choisir(7, "FERRETTE 001|2024-10-01")', c)).toBe(false);
    expect(c.ordre).toEqual([]);
    expect('bailCle' in c.DB.mouvements[0]).toBe(false);
  });
  it('sauvegarde refusée (hors ligne / stockage plein) : le mouvement revient à l\'identique', () => {
    const c = appQ3({ saveOk: false });
    const avant = JSON.parse(JSON.stringify(c.DB.mouvements[0]));
    expect(vm.runInContext('_mvQ3Choisir(7, "FERRETTE 001|2024-10-01")', c)).toBe(false);
    expect(JSON.parse(JSON.stringify(c.DB.mouvements[0]))).toEqual(avant);
    expect(c._auditPending).toEqual([]);
    expect(c.ordre).not.toContain('refresh');
  });
  it('mouvement introuvable ou clé vide : refus', () => {
    const c = appQ3();
    expect(vm.runInContext('_mvQ3Choisir(99, "X|2024-10-01")', c)).toBe(false);
    expect(vm.runInContext('_mvQ3Choisir(7, "")', c)).toBe(false);
    expect(c.ordre).toEqual([]);
  });
  it('câblage : alerte Q3 dans le tableau ET les cartes mobiles, index mémoïsé, trois choix, texte échappé', () => {
    const rmv = extraireFonction(P1, 'rMv'), ph = extraireFonction(P1, '_mvCardRowPhone');
    expect(rmv).toMatch(/_mvQ3Alerte\(m, q3, false\)/);
    expect(ph).toMatch(/_mvQ3Alerte\(m, q3, true\)/);
    const info = extraireFonction(P2, '_mvQ3Info');
    expect(info).toMatch(/_mvMqCache/);
    expect(info).toMatch(/indexAConfirmer\(s\)/);
    const al = extraireFonction(P2, '_mvQ3Alerte');
    expect(al).toMatch(/class="alert warn mqa-alert /);
    expect(al).toMatch(/Ancien locataire/);
    expect(al).toMatch(/Nouveau locataire/);
    expect(al).toMatch(/Ce n\\'est pas du loyer/);
    expect(al).toMatch(/esc\(/);
  });
});

// ── C. Deux manques le même mois : chacun s'annule ──────────────────────────────────────────────
describe('C — deux manques acceptés le même mois', () => {
  const base = () => ({ ref: 'L', baux: [B('L', '2026-01-01', 760, 20)], bareme: [], paiements: [vir('a', '2026-01-05', 760)] });   // il manque 20
  const deux = [{ id: 'm1', bailCle: 'L|2026-01-01', ym: '2026-01', montant: 10, motif: 'a', date: '2026-01-10' },
    { id: 'm2', bailCle: 'L|2026-01-01', ym: '2026-01', montant: 10, motif: 'b', date: '2026-01-11' }];
  it('le mois garde un id PAR manque ; le résumé n\'a plus d\'id composite', () => {
    const m = SL.suiviLot({ ...base(), manques: deux }, { today: '2026-01-20' }).baux[0].mois[0];
    expect(m.manques).toEqual([
      { id: 'm1', montant: 10, montantDemande: 10, motif: 'a', date: '2026-01-10' },
      { id: 'm2', montant: 10, montantDemande: 10, motif: 'b', date: '2026-01-11' }]);
    expect(m.manque.id).toBe(null);
    expect(m.manque.ids).toEqual(['m1', 'm2']);
    expect(m.retard).toBe(0);
  });
  it('la fenêtre propose un Annuler par manque, et chaque id se retrouve dans le journal', () => {
    const s = SL.suiviLot({ ...base(), manques: deux }, { today: '2026-01-20' });
    const M = SF.modeleFenetre([s], '2026-01', {});
    const annuler = M.retard.flatMap((x) => x.resultats).filter((r) => r.action === 'annuler').map((r) => r.manqueId);
    expect(annuler).toEqual(['m1', 'm2']);
    const journal = deux.map((m) => ({ ...m, type: 'manque_accepte' }));
    for (const id of annuler) expect(MA.trouverManque(journal, id)).not.toBe(null);
  });
  it('annuler l\'un laisse l\'autre : 10 € redeviennent dus', () => {
    const s = SL.suiviLot({ ...base(), manques: [{ ...deux[0], _deleted: true }, deux[1]] }, { today: '2026-01-20' });
    expect(s.baux[0].mois[0].manques.map((x) => x.id)).toEqual(['m2']);
    expect(s.baux[0].position.retardCharge + s.baux[0].position.retardLoyer).toBe(10);
  });
});

// ── D. Locataire parti avec avance ──────────────────────────────────────────────────────────────
describe('D — locataire parti avec AVANCE : trop-perçu à rendre', () => {
  const lot = () => ({ ref: 'L', bareme: [], manques: [],
    baux: [B('L', '2026-01-01', 700, 0, { archive: true, finEffective: '2026-03-10', noms: 'Parti' })],
    paiements: [vir('a', '2026-01-05', 700), vir('b', '2026-02-05', 700), vir('c', '2026-03-05', 700)] });
  it('le bail le dit (position, detteBail) : 474,19 € d\'avance (mars : 700 − 700 × 10/31)', () => {
    const b = SL.suiviLot(lot(), { today: '2026-05-05' }).baux[0];
    expect(b.position.avance).toBe(474.19);
    expect(SL.detteBail(b)).toEqual({ loyer: 0, charge: 0, avance: 474.19 });
  });
  it('le lot l\'expose HORS de la case l\'année du départ, plus l\'année suivante', () => {
    const s = SL.suiviLot(lot(), { today: '2027-02-05' });
    expect(s.mois['2026-05']).toMatchObject({ solde: 0, avance: 0, partisAvance: ['L|2026-01-01'], aRendre: 474.19 });
    expect(s.mois['2027-01']).toMatchObject({ partisAvance: [], aRendre: 0 });
  });
  it('la fenêtre : « Trop-perçu à rendre : 474,19 € » sur le locataire parti, hors du total de la case', () => {
    const s = SL.suiviLot(lot(), { today: '2027-02-05' });
    const M = SF.modeleFenetre([s], '2026-05', {});
    expect(M.solde).toBe(0);
    expect(M.aRendre).toHaveLength(1);
    expect(M.aRendre[0]).toMatchObject({ noms: 'Parti', parti: true, solde: 474.19 });
    expect(M.aRendre[0].resultats[0].txt).toBe('Trop-perçu à rendre : ' + SF.eur(474.19));
    expect(SF.modeleFenetre([s], '2027-01', {}).aRendre).toEqual([]);
    expect(extraireFonction(P2, '_finFenetreRendre')).toMatch(/M\.aRendre/);
  });
});

// ── E. _rgApplyRetenue : dette > dépôt ──────────────────────────────────────────────────────────
describe('E — retenue de tout le dépôt (dette 1 000 > dépôt 700) : comptée comme règlement', () => {
  const rg = (bail) => {
    const ctx = {
      DB: { mouvements: [] }, window: {},
      computeRegul: () => ({ entries: { k: { bail } } }),
      _rgClotureCompute: () => ({ reparations: 0, retenueRegul: 0 }),
      _calculerSoldeDG: () => ({ dgPaid: 700, retenuesDG: 0, loyerImpaye: 1000, soldeRestitue: 0 }),
      _stamp: (o) => o, saveDB: () => true, _refreshAfterMutation: () => {}, showToast: () => {}, closeM: () => {}, fmt: (n) => String(n), Math, Number
    };
    vm.createContext(ctx);
    vm.runInContext(extraireFonction(P1, '_rgApplyRetenue'), ctx);
    vm.runInContext('_rgApplyRetenue("k", 0, 0)', ctx);
    return bail;
  };
  it('_rgApplyRetenue écrit dgRestitueMontant (0 compris)', () => {
    const b = rg({ debut: '2026-01-01', finEffective: '2026-02-28', hc: 500, ch: 0, dg: 700, dgPaid: 700 });
    expect(b.dgRestitue).toBe(0);
    expect(b.dgRestitueMontant).toBe(0);
    expect(SL.restitutionEnregistree(b)).toBe(true);
  });
  it('chiffré : 2 × 500 dus, rien payé, dépôt 700 entièrement retenu → reste dû 300', () => {
    const bail = rg({ ref: 'L', debut: '2026-01-01', finEffective: '2026-02-28', hc: 500, ch: 0, dg: 700, dgPaid: 700 });
    const db = { baux: {}, baux_historique: [bail], loyerBareme: [], mouvements: [], baux_evenements: [] };
    const lot = SL.lotDepuisDb('L', db, { catLigne });
    expect(lot.baux[0].dg).toEqual({ verse: 700, retenuAutres: 0, restitue: 0, penalite: 0, date: '2026-02-28' });
    const b = SL.suiviLot(lot, { today: '2026-06-15' }).baux[0];
    expect(b.traces.filter((t) => t.type === 'dg').map((t) => t.montant)).toEqual([700]);
    expect(r2(b.position.retardLoyer + b.position.retardCharge)).toBe(300);
    // la restitution (acte) lit la dette AVANT la retenue : 1 000, jamais 300 (pas de double compte)
    expect(SL.detteBailAvantDepot(lot, lot.baux[0].cle, { today: '2026-06-15' }).loyer).toBe(1000);
  });
  it('l\'assistant de départ lit la même règle « restitution enregistrée »', () => {
    expect(P1).toMatch(/SuiviLoyers\.restitutionEnregistree\(bail\)/);
  });
});

// ── F. _finSuiviLot : échec visible ─────────────────────────────────────────────────────────────
describe('F — un lot dont le calcul échoue est signalé, jamais affiché « à jour »', () => {
  const fns = () => ['_finSuiviToday', '_finSuiviLot', '_finSuiviEchec', '_finSuiviEchecsHtml'].map((n) => extraireFonction(P2, n)).join('\n');
  const app = (DB) => {
    const erreurs = [];
    const ctx = {
      window: { SuiviLoyers: SL, _loyerTodayLocal: () => '2026-10-05', _loyerToleranceActive: () => true, _dbGen: 1 },
      DB, _finCatLigne: catLigne, _finCatMere: () => null, escHtml: (s) => String(s).replace(/</g, '&lt;'),
      console: { error: (...a) => erreurs.push(a), warn: () => {} }, erreurs, Map, WeakMap, String, Number, Object, Array, Math, Date, JSON
    };
    vm.createContext(ctx);
    vm.runInContext('let _finSuiviCache = { key: null, lots: new Map(), mvParLot: null, echecs: new Map() };\nconst _finSuiviEntrees = new WeakMap();\n' + fns(), ctx);
    return ctx;
  };
  it('barème corrompu (objet au lieu d\'une liste) : null pour les lecteurs, échec mémorisé, console.error avec le lot', () => {
    const c = app({ baux: { 'F-1': { debut: '2026-01-01', hc: 500, ch: 0 } }, baux_historique: [], loyerBareme: { corrompu: true }, mouvements: [], baux_evenements: [] });
    expect(vm.runInContext('_finSuiviLot("F-1")', c)).toBe(null);
    expect(c.erreurs.length).toBe(1);
    expect(c.erreurs[0].join(' ')).toMatch(/F-1/);
    expect(vm.runInContext('_finSuiviEchec("F-1")', c)).toMatchObject({ ref: 'F-1' });
    const h = vm.runInContext('_finSuiviEchecsHtml(["F-1", "<b>"])', c);
    expect(h).toMatch(/Calcul indisponible/);
    expect(h).toMatch(/F-1/);
    expect(h).toContain('<b>&lt;b></b>');   // la référence est échappée
    expect(h).not.toMatch(/à jour/);
  });
  it('lot sain : pas d\'échec', () => {
    const c = app({ baux: { 'F-1': { debut: '2026-01-01', hc: 500, ch: 0 } }, baux_historique: [], loyerBareme: [], mouvements: [], baux_evenements: [] });
    expect(vm.runInContext('_finSuiviLot("F-1")', c)).not.toBe(null);
    expect(vm.runInContext('_finSuiviEchec("F-1")', c)).toBe(null);
    expect(c.erreurs).toEqual([]);
  });
  it('câblage : la fenêtre et le bandeau signalent les lots en échec', () => {
    expect(extraireFonction(P2, '_finFenetreRendre')).toMatch(/_finSuiviEchecsHtml\(/);
    expect(extraireFonction(P2, '_lyTousLoyersHtml')).toMatch(/_finSuiviEchec\(/);
  });
});

// ── G. Mutants survivants du contre-audit ───────────────────────────────────────────────────────
describe('G — tests qui tuent les mutants survivants', () => {
  it('(1) quittance d\'un mois soldé par un geste ULTÉRIEUR : la remise est sur février (cibleIdx), pas sur juillet', () => {
    const pays = [vir('a', '2026-01-05', 660), vir('b', '2026-02-05', 538)].concat(['03', '04', '05', '06', '07'].map((m) => vir('p' + m, '2026-' + m + '-05', 660)));
    const s = SL.suiviLot({ ref: 'L', baux: [B('L', '2026-01-01', 650, 10)], bareme: [], paiements: pays,
      manques: [{ id: 'g', bailCle: 'L|2026-01-01', ym: '2026-07', montant: 122, motif: 'geste', date: '2026-07-20' }] }, { today: '2026-07-25' });
    const e = SL.versEtatMoisLot(s.baux[0]);
    expect(e.byYm['2026-02'].remise).toEqual({ montant: 122, loyer: 112, charge: 10, motif: 'geste' });
    expect(e.byYm['2026-07'].remise).toBeUndefined();
    expect(r2(e.byYm['2026-02'].du - e.byYm['2026-02'].reste - e.byYm['2026-02'].remise.montant)).toBe(538);
  });
  it('(2) signe de la pénalité art. 22 : restitué 466,67 dont 70 de pénalité → 303,33 retenus pour les loyers', () => {
    const db = { baux: {}, loyerBareme: [], baux_evenements: [], mouvements: [{ id: 1, date: '2026-03-09', qui: 'L', cat: 'x', cr: 700 }],
      baux_historique: [{ ref: 'L', debut: '2026-01-01', finEffective: '2026-04-13', hc: 700, ch: 0, dg: 700, dgPaid: 700, dgRetenu: 0, dgRestitueAt: '2026-06-01', dgRestitueMontant: 466.67, dgPenaliteArt22: 70 }] };
    const lot = SL.lotDepuisDb('L', db, { catLigne });
    const b = SL.suiviLot(lot, { today: '2026-10-05' }).baux[0];
    expect(b.traces.filter((t) => t.type === 'dg').map((t) => t.montant)).toEqual([303.33]);
    expect(b.position).toEqual({ retardLoyer: 0, retardCharge: 0, avance: 0, solde: 0 });
  });
  it('(3) sans restitution enregistrée, la retenue n\'est JAMAIS comptée (dgRetenu seul ne suffit pas)', () => {
    const db = { baux: {}, loyerBareme: [], baux_evenements: [], mouvements: [{ id: 1, date: '2026-03-09', qui: 'L', cat: 'x', cr: 700 }],
      baux_historique: [{ ref: 'L', debut: '2026-01-01', finEffective: '2026-04-13', hc: 700, ch: 0, dg: 700, dgPaid: 700, dgRetenu: 150 }] };
    const lot = SL.lotDepuisDb('L', db, { catLigne });
    expect(lot.baux[0].dg).toBeUndefined();
    expect(SL.restitutionEnregistree(db.baux_historique[0])).toBe(false);
    expect(SL.suiviLot(lot, { today: '2026-10-05' }).baux[0].position.retardLoyer).toBe(303.33);
  });
  it('(4) locataire parti avec avance : le trop-perçu n\'est ni une dette, ni dans la case', () => {
    const s = SL.suiviLot({ ref: 'L', bareme: [], manques: [], baux: [B('L', '2026-01-01', 700, 0, { archive: true, finEffective: '2026-03-10' })],
      paiements: [vir('a', '2026-01-05', 700), vir('b', '2026-02-05', 700), vir('c', '2026-03-05', 700)] }, { today: '2026-05-05' });
    expect(s.mois['2026-04']).toMatchObject({ retard: 0, solde: 0, partis: [], partisAvance: ['L|2026-01-01'], aRendre: 474.19 });
  });
});
