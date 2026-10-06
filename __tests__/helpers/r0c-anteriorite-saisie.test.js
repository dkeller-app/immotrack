/**
 * R0-C — 2ᵉ audit (🟡 + point légal) : l'écran « Situation du locataire », VRAI code de l'app
 * (js/app/app-part2.js) exécuté avec des doubles de DOM.
 *  - Enregistrer sans date n'est plus refusé (règle « jamais bloquer ») : la situation est notée à
 *    l'entrée du bail et l'écran le dit ;
 *  - le texte légal affiché pour un bail repris est EXACTEMENT celui arrêté le 05/10 ;
 *  - le texte de la cascade dit ce que fait le moteur (le mois en cours d'abord, puis l'arriéré).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as Anteriorite from '../../js/core/anteriorite.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const F1 = ['escHtml', '_findBailByRefTolerant'];
const F2 = ['_antDateFr', '_antMoisFr', '_antEuro', '_antBailCible', '_antLire', '_antRender', '_antEffet', '_antSituation', '_antEnregistrer'];
const SRC = F1.map((n) => extraireFonction(P1, n)).concat(F2.map((n) => extraireFonction(P2, n))).join('\n');

const TEXTE_LEGAL = 'Les loyers de la période antérieure à la vente reviennent au vendeur (art. 1614 du Code civil : depuis la vente, les fruits appartiennent à l\'acquéreur). Un arriéré de cette période n\'est dû au bailleur actuel que si l\'acte de vente le lui a transmis (cession de créance ou subrogation) ; sinon, le laisser à 0 €.';

function monter(DB, suivi) {
  const champs = {};                                    // id → { value, innerHTML }
  const el = (id) => champs[id] || null;
  const toasts = [], journal = [];
  const deps = {
    DB, window: { _anteriorite: Anteriorite }, el,
    showToast: (msg, type) => toasts.push({ msg, type }),
    confirm2: () => true, saveDB: () => journal.push('saveDB'), _stamp: (b) => journal.push('stamp:' + b.debut),
    _auditLog: () => {}, _refreshAfterMutation: () => {}, closeM: () => journal.push('closeM'), openM: () => {},
    _finLotSuivi: () => suivi, _logLabel: (x) => String((x && typeof x === 'object') ? x.ref : x), _logLabelRef: (x) => String((x && typeof x === 'object') ? x.ref : x), _uiIcon: () => '', fmt: (n) => n.toFixed(2) + ' €', setTimeout: () => {}
  };
  const noms = Object.keys(deps);
  const api = new Function(...noms, 'let _antEtat = null;\n' + SRC + '\nreturn { ' + F2.join(', ') + ', etat: (e) => { _antEtat = e; } };')(...noms.map((n) => deps[n]));
  // le rendu écrit dans #ov-anteriorite ; les champs saisis sont relus par id
  champs['ov-anteriorite'] = { innerHTML: '' };
  champs['ant-effet'] = { innerHTML: '' };
  return { api, champs, toasts, journal };
}
const DBRepris = () => ({ baux: { F: { ref: 'F', debut: '2018-03-16', hc: 650, ch: 0, typeContrat: 'repris' } }, baux_historique: [] });

describe('🟡 jamais bloquer : enregistrer sans date', () => {
  it('sans date saisie, la situation est notée à l\'entrée du bail (pas de refus), avec un avertissement', () => {
    const DB = DBRepris();
    const { api, champs, toasts, journal } = monter(DB, { date: '2026-03-01', source: 'provisoire', jouissance: null, bailsAvant: ['2018-03-16'] });
    api.etat({ ref: 'F', bailDebut: '2018-03-16', suite: [], situation: 'arriere', mois: [] });
    champs['ant-date'] = { value: '' };
    champs['ant-loyer'] = { value: '1300' };
    api._antEnregistrer();
    expect(DB.baux.F.anteriorite).toMatchObject({ date: '2018-03-16', situation: 'arriere', loyer: 1300 });
    expect(journal).toContain('saveDB');
    expect(toasts[toasts.length - 1].type).toBe('warn');
    expect(toasts[toasts.length - 1].msg).toContain('16/03/2018');
  });
  it('une date illisible suit la même règle ; une date valide est gardée telle quelle', () => {
    const DB = DBRepris();
    const { api, champs, toasts } = monter(DB, null);
    api.etat({ ref: 'F', bailDebut: '2018-03-16', suite: [], situation: 'a-jour', mois: [] });
    champs['ant-date'] = { value: '2026-02-30' };
    api._antEnregistrer();
    expect(DB.baux.F.anteriorite.date).toBe('2018-03-16');
    champs['ant-date'] = { value: '2026-03-01' };
    api._antEnregistrer();
    expect(DB.baux.F.anteriorite.date).toBe('2026-03-01');
    expect(toasts[toasts.length - 1]).toMatchObject({ type: 'ok' });
  });
  it('le champ date n\'est jamais vide à l\'ouverture : à défaut de tout, l\'entrée du bail', () => {
    const { api, champs } = monter(DBRepris(), null);
    api.etat({ ref: 'F', bailDebut: '2018-03-16', suite: [], situation: 'a-jour', mois: [] });
    api._antRender(true);
    expect(champs['ov-anteriorite'].innerHTML).toContain('id="ant-date" value="2018-03-16"');
  });
});

describe('point légal et textes de l\'écran', () => {
  it('bail repris, arriéré : le texte légal est exactement celui arrêté (art. 1614, cession de créance ou subrogation)', () => {
    const { api, champs } = monter(DBRepris(), { date: '2026-03-01', source: 'acquisition', jouissance: '2026-03-01', bailsAvant: ['2018-03-16'] });
    api.etat({ ref: 'F', bailDebut: '2018-03-16', suite: [], situation: 'arriere', mois: [] });
    api._antRender(true);
    const h = champs['ov-anteriorite'].innerHTML;
    expect(h).toContain(TEXTE_LEGAL);
    expect(h).not.toMatch(/ANIL/);
  });
  it('« Ce que Propryo en fera » décrit la vraie cascade : le mois en cours d\'abord, puis l\'arriéré', () => {
    const { api, champs } = monter(DBRepris(), null);
    api.etat({ ref: 'F', bailDebut: '2018-03-16', suite: [], situation: 'arriere', mois: [] });
    champs['ant-date'] = { value: '2026-03-01' };
    champs['ant-loyer'] = { value: '700' };
    api._antEffet();
    expect(champs['ant-effet'].innerHTML).toContain('chaque encaissement paie d\'abord le loyer et les charges de son mois ; ce qui dépasse règle l\'arriéré');
    expect(champs['ant-effet'].innerHTML).not.toContain('le plus ancien d\'abord');
  });
  it('l\'aide de la date dit ce que deviennent les loyers déjà importés d\'avant (🔴1)', () => {
    const { api, champs } = monter(DBRepris(), null);
    api.etat({ ref: 'F', bailDebut: '2018-03-16', suite: [], situation: 'a-jour', mois: [] });
    api._antRender(true);
    expect(champs['ov-anteriorite'].innerHTML).toContain('Les loyers encaissés avant cette date sont déjà dans la situation notée ci-dessous : ils ne sont pas recomptés.');
    // 3ᵉ audit A1 : aucune réserve — un terme payé d'avance se note comme tel
    expect(champs['ov-anteriorite'].innerHTML).toContain("Un terme payé d'avance avant cette date se note « avait payé d'avance ».");
    expect(champs['ov-anteriorite'].innerHTML).not.toContain('mois qui la précède');
  });
});
