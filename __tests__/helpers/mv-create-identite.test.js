/**
 * _mvCreate — TEST D'IDENTITÉ (chantier TRAVAUX : QUI PAIE ?, lot b).
 *
 * Les trois créateurs de mouvement de l'app — saveMv (création), import bancaire
 * (_bankImportConfirm) et migration des factures de compteurs (_migrateCcFacturesToMouvements) —
 * passent désormais par l'API unique _mvCreate. Ce test EXÉCUTE le vrai code d'avant (figé dans
 * fixtures/mv-create-avant.js.txt, origin/main 230aff97) et le vrai code d'après (js/app/*.js),
 * avec les mêmes doubles, et exige :
 *   I-1  des enregistrements IDENTIQUES (JSON du DB entier, ordre des clés compris) ;
 *   I-2  la même séquence d'effets (horodatage, audit et son libellé, push, saveDB, rafraîchissement,
 *        fermeture, liste) dans le même ordre ;
 * avec l'implémentation du module (window.MvCreate) ET avec le shadow inline (démarrage).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as MvCreate from '../../js/core/mv-create.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const AVANT = readFileSync(resolve(root, '__tests__/helpers/fixtures/mv-create-avant.js.txt'), 'utf8');

const NOMS = ['saveMv', '_bankImportConfirm', '_migrateCcFacturesToMouvements'];
const SRC_APRES = [extraireFonction(P1, '_mvCreateShadow'), extraireFonction(P1, '_mvCreate'), extraireFonction(P1, '_stamp'),
  'async ' + extraireFonction(P1, 'saveMv'), extraireFonction(P2, '_bankImportConfirm'), extraireFonction(P2, '_migrateCcFacturesToMouvements')].join('\n');
const SRC_AVANT = [AVANT, extraireFonction(P1, '_stamp')].join('\n');

/** Monte un jeu de fonctions (avant ou après) autour d'un DB et d'un formulaire, avec un journal d'effets. */
function monter(src, { DB, form = {}, bank = {}, avecModule = true }) {
  const ev = [];
  let n = 1000;
  const window = {
    MvCreate: avecModule ? MvCreate : undefined,
    _bankComputeLastImport: (lines, prevCount) => ({ count: prevCount + lines.length, last: 'x' }),
    _bankPendingSnapshot: (l) => ({ snap: l.libelle }),
  };
  const deps = {
    DB, window,
    el: (id) => ({ value: form[id] != null ? form[id] : '' }),
    v: (id) => (form[id] != null ? String(form[id]) : ''),
    pf: (id) => parseFloat(form[id]) || 0,
    nid: () => ++n,
    td: () => '2026-10-13',
    showToast: (msg) => ev.push(['toast', msg]),
    closeM: (id) => ev.push(['closeM', id]),
    rMv: () => ev.push(['rMv']),
    _auditLog: (...a) => ev.push(['audit', ...a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x))]),
    saveDB: () => ev.push(['saveDB', JSON.stringify(DB.mouvements)]),
    _refreshAfterMutation: () => ev.push(['refresh']),
    _attachmentSaveForMouvement: async () => ({ id: 777 }),
    _mvDocPending: null, _mvDocCleared: false,
    _preserverSaufChampsPilotes: (m, old) => { Object.keys(old).forEach((k) => { if (!(k in m)) m[k] = old[k]; }); },
    _mvShowChargeRepartitionInfo: () => ev.push(['repartition']),
    _idbDel: async () => {},
    confirm2: () => true,
    _isAlive: (x) => x && !x._deleted,
    _bankImportLines: bank.lines || [],
    _currentBankAccount: bank.account || null,
    _bankLineDone: () => true,
    _pendingBankImport: null,
    _bankImportRecap: (c) => ev.push(['recap', c.length]),
  };
  const noms = Object.keys(deps);
  // Trace des pushs : un Proxy sur le tableau signale chaque push dans l'ordre des effets.
  const arr = DB.mouvements || [];
  const push = arr.push.bind(arr);
  arr.push = (...xs) => { xs.forEach((x) => ev.push(['push', x.id])); return push(...xs); };
  DB.mouvements = arr;
  const f = new Function(...noms, src + '\nreturn { ' + NOMS.join(', ') + ' };')(...noms.map((k) => deps[k]));
  return { f, ev, DB };
}

const dbBase = () => ({
  mouvements: [{ id: 1, date: '2026-01-05', lib: 'Loyer janvier', cat: 'Loyers encaissés', qui: 'T2', imm: 'Tilleuls', db: 0, cr: 650, fac: '', compteurCcId: '' }],
  logements: [{ ref: 'T2', imm: 'Résidence Les Tilleuls' }, { ref: 'F1', imm: 'Ferrette' }],
  categories: ['Loyers encaissés', 'Eau (récupérable)', 'Électricité commune'],
  entites: [{ id: 1, nom: 'SCI', immeubles: [{ nom: 'Résidence Les Tilleuls', compteursCollectifs: [
    { id: 'cc1', nom: 'Eau générale', type: 'eau-f', factures: [{ dateFacture: '2026-03-01', montant: 412.5, datePeriode: 'T1' }, { dateFacture: '2026-06-01', montant: 380 }] },
    { id: 'cc2', nom: 'Électricité hall', type: 'elec', factures: [{ dateFacture: '2026-02-10', montant: 96.4 }] },
    { id: 'cc3', nom: 'Gaz chaufferie', type: 'gaz', factures: [] },
  ] }] }],
  params: {},
});

const lignes = () => ([
  { libelle: 'PRLV EDF', date: '2026-09-02', debit: 84.2, credit: 0, suggestedCat: 'Électricité commune', suggestedQui: 'T2', suggestedImm: '', fitid: 'F1', _fingerprint: 'fp1', _rules: ['r1'] },
  { libelle: 'VIR LOYER MEYER', date: '2026-09-05', debit: 0, credit: 650, suggestedCat: 'Loyers encaissés', suggestedQui: 'F1', suggestedImm: '', _fingerprint: 'fp2' },
  { libelle: 'RELEVE GERANCE', date: '2026-09-10', debit: 0, credit: 0, _sp: [
    { cat: 'Loyers encaissés', qui: 'T2', sens: 'cr', montant: 650, lib: 'Loyer sept', date: '2026-09-10', fac: 'Q9' },
    { cat: 'Frais de gestion', qui: 'SCI:SCI', sens: 'db', montant: 52, fac: 'H9' },
    { cat: 'Eau (récupérable)', qui: 'T2', cc: 'cc1', sens: 'db', montant: 40 },
  ], _dateReleve: '2026-09-11', _libelleReleve: 'RELEVE GERANCE SEPT' },
  { libelle: 'EXCLUE', date: '2026-09-12', debit: 10, credit: 0, _userExclude: true },
]);

const formNouveau = {
  'mv-edit-id': '', 'mv-lib': 'Remplacement ballon', 'mv-date': '2026-10-16', 'mv-imm': 'Résidence Les Tilleuls',
  'mv-cat': 'Travaux (entretien, réparation, amélioration)', 'mv-qui': 'T2', 'mv-cc': '', 'mv-db': '1140', 'mv-cr': '', 'mv-fac': 'F-2026-458',
};

describe('I · _mvCreate : mêmes enregistrements, même séquence d\'effets', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T08:30:00.000Z')); vi.spyOn(Math, 'random').mockReturnValue(0.4242); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  for (const avecModule of [true, false]) {
    const via = avecModule ? 'module window.MvCreate' : 'shadow inline (démarrage)';

    it(`saveMv, création — ${via}`, async () => {
      const a = monter(SRC_AVANT, { DB: dbBase(), form: formNouveau, avecModule });
      const b = monter(SRC_APRES, { DB: dbBase(), form: formNouveau, avecModule });
      await a.f.saveMv(); await b.f.saveMv();
      // RETOURS 15/10 (lot 2, point 5) : seul ajout voulu — un mouvement saisi et classé à la main porte _classeMain.
      expect(b.DB.mouvements[1]._classeMain).toBe(true);
      const sansMarqueur = x => JSON.parse(JSON.stringify(x).replace(/\\*"_classeMain\\*":true,?/g, ''));
      expect(JSON.stringify(sansMarqueur(b.DB))).toBe(JSON.stringify(a.DB));
      expect(sansMarqueur(b.ev)).toEqual(JSON.parse(JSON.stringify(a.ev)));
      expect(a.DB.mouvements).toHaveLength(2);
      expect(a.ev.map((e) => e[0])).toEqual(['audit', 'push', 'saveDB', 'closeM', 'rMv', 'refresh', 'toast', 'repartition']);
    });

    it(`saveMv, modification (chemin non migré, inchangé) — ${via}`, async () => {
      const f = { ...formNouveau, 'mv-edit-id': '1', 'mv-lib': 'Loyer janvier corrigé', 'mv-cat': 'Loyers encaissés', 'mv-db': '', 'mv-cr': '650' };
      const a = monter(SRC_AVANT, { DB: dbBase(), form: f, avecModule });
      const b = monter(SRC_APRES, { DB: dbBase(), form: f, avecModule });
      await a.f.saveMv(); await b.f.saveMv();
      expect(JSON.stringify(b.DB)).toBe(JSON.stringify(a.DB));
      expect(b.ev).toEqual(a.ev);
      expect(a.DB.mouvements[0]._modifiedAt).toBe('2026-10-13T08:30:00.000Z');
    });

    it(`import bancaire (lignes simples, découpées, compteur, exclue) — ${via}`, () => {
      const bank = () => ({ lines: lignes(), account: { id: 'acc1', lastImport: { count: 3 } } });
      const a = monter(SRC_AVANT, { DB: dbBase(), bank: bank(), avecModule });
      const b = monter(SRC_APRES, { DB: dbBase(), bank: bank(), avecModule });
      a.f._bankImportConfirm(); b.f._bankImportConfirm();
      expect(JSON.stringify(b.DB)).toBe(JSON.stringify(a.DB));
      expect(b.ev).toEqual(a.ev);
      expect(a.DB.mouvements).toHaveLength(1 + 5);
      // l'audit suit le push, un seul saveDB, aucun rafraîchissement global
      const kinds = a.ev.map((e) => e[0]);
      expect(kinds.filter((k) => k === 'saveDB')).toHaveLength(1);
      expect(kinds).not.toContain('refresh');
      expect(kinds.slice(0, 2)).toEqual(['push', 'audit']);
    });

    it(`migration des factures de compteurs (boot) — ${via}`, () => {
      const a = monter(SRC_AVANT, { DB: dbBase(), avecModule });
      const b = monter(SRC_APRES, { DB: dbBase(), avecModule });
      a.f._migrateCcFacturesToMouvements(); b.f._migrateCcFacturesToMouvements();
      expect(JSON.stringify(b.DB)).toBe(JSON.stringify(a.DB));
      expect(b.ev).toEqual(a.ev);
      expect(a.DB.mouvements).toHaveLength(1 + 3);
      expect(a.ev.map((e) => e[0])).toEqual(['push', 'push', 'push', 'saveDB']);   // ni horodatage _stamp, ni audit
      // idempotente : un second passage ne crée rien
      b.f._migrateCcFacturesToMouvements();
      expect(b.DB.mouvements).toHaveLength(4);
    });
  }

  it('le test mord : un _mvCreate qui audite APRÈS le push dans saveMv est détecté', async () => {
    const muté = SRC_APRES.replace("_mvCreate(m, { save: false, refresh: false });", "_mvCreate(m, { audit: 'after', save: false, refresh: false });");
    expect(muté).not.toBe(SRC_APRES);
    const a = monter(SRC_AVANT, { DB: dbBase(), form: formNouveau });
    const b = monter(muté, { DB: dbBase(), form: formNouveau });
    await a.f.saveMv(); await b.f.saveMv();
    expect(b.ev).not.toEqual(a.ev);
  });
});
