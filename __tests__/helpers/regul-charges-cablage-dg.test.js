/**
 * CHARGES / DÉPÔT DE GARANTIE — câblage de la fin d'occupation (_bailFinOccupation) dans les surfaces
 * qui ÉCRIVENT ou AFFICHENT de l'argent (contre-audit du 05/10 sur 43033b4f).
 *
 * Toutes les fonctions sont les VRAIES fonctions de l'index assemblé (js/app/app-part*.js) et du module
 * js/core/gestion-dg-impayes.js ; seuls le DOM et le résolveur des impayés sont simulés :
 *   - DOM : `el(id)` rend un faux élément mémorisé (value / checked / textContent / innerHTML / hidden) ;
 *   - impayés : `_rgClotureImpayes(ref, debut, fin)` = 500 € par mois IMPAYÉ compris dans [debut, fin]
 *     (même résolveur pour l'étape régularisation ET l'étape restitution du DG, comme dans l'app).
 * Aujourd'hui figé au 05/10/2026.
 *
 * Deux scénarios :
 *   - TACITE : bail nu signé le 01/07/2023, échéance 30/06/2026 passée, jamais clôturé, locataire en place,
 *     loyers impayés de juillet à octobre → 2 000 € d'impayés, DG 500 € → 0 € à restituer, AUCUNE pénalité ;
 *   - DÉPART DÉCLARÉ au 31/08/2026 (assistant de départ), loyers payés jusqu'en août : la régularisation et la
 *     restitution du DG bornent toutes deux au 31/08 → 0 € d'impayés, 500 € à restituer, deux écrans d'accord.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as DG from '../../js/core/gestion-dg-impayes.js';
import { baseChargesLogement } from '../../js/core/regul-forfait.js';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8').replace(/\r/g, '');
function corpsDe(nom) {
  const m = new RegExp('^(?:async\\s+)?function\\s+' + nom + '\\s*\\(', 'm').exec(html);
  if (!m) throw new Error('fonction introuvable : ' + nom);
  return html.slice(m.index, html.indexOf('\n}', m.index) + 2);
}

const IMM = 'Les Tilleuls', REF = 'TIL-A1';
const RECUP = 'Charges récupérables (eau, énergie…)';
const AUJ = '2026-10-05';

/** Base de données d'un scénario. `impayes` = mois (AAAA-MM) restés impayés. */
function scenario({ depart = null, impayes }) {
  const bail = { ref: REF, entity: 'SCI', type: 'nu', debut: '2023-07-01', fin: '2026-06-30', hc: 500, ch: 100, dg: 500, dgPaid: 500, locataires: [{ nom: 'Tom' }] };
  if (depart) bail.depart = { declaredAt: '2026-07-01', congePar: 'locataire', dateSortie: depart };
  const mouvements = [];
  let id = 1;
  for (let i = 1; i <= 12; i++) mouvements.push({ id: id++, date: `2026-${String(i).padStart(2, '0')}-15`, cat: RECUP, db: 100, qui: REF, imm: IMM, lib: 'Eau ' + i });
  return {
    impayes,
    DB: {
      entites: [{ nom: 'SCI', type: 'SCI IR', immeubles: [{ nom: IMM, compteursCollectifs: [] }] }],
      logements: [{ ref: REF, imm: IMM, entity: 'SCI' }],
      baux: { [REF]: bail }, baux_historique: [], mouvements, edl: [], loyerBareme: [],
    },
  };
}

/** Monte les vraies fonctions `noms` dans un environnement de stubs (DOM simulé). */
function monter(sc, noms) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, value: '', checked: false, textContent: '', innerHTML: '', hidden: false });
  const unpaid = (debut, fin) => sc.impayes.filter((ym) => ym >= String(debut || '').slice(0, 7) && ym <= String(fin || AUJ).slice(0, 7)).length * 500;
  const W = {
    _regulFrom: '2026-01-01', _regulTo: '2026-12-31',
    _rgClotureImpayes: (ref, debut, fin) => unpaid(debut, fin),
    _loyerEtatLot: () => ({}),
    td: () => AUJ,
    _penaliteRetardDG: DG._penaliteRetardDG,
    baseChargesLogement,
    computeVetusteTotal: () => ({ total: 0 }),
  };
  globalThis.window = W;   // le module DG lit `window` à l'appel
  const scope = {
    DB: sc.DB, window: W, el, v: (id) => el(id).value, els,
    _isAlive: (x) => !!x && !x._deleted,
    _isLoyerCategory: (c) => c === 'Loyers encaissés',
    _isChargeRecupCategory: (c) => c === RECUP || c === 'Charges de copropriété',
    _catLigne2044: (c) => (c === 'Charges de copropriété' ? '229' : null),
    CC_REPARTITION_LABELS: {}, fd: (s) => s, fmtN: String, _ccType: () => ({}), _ccConsoLogPeriod: () => 0,
    fmt: (n) => (Math.round(n * 100) / 100).toFixed(2) + ' €', escHtml: (s) => String(s == null ? '' : s), _uiIcon: () => '', _lyQ: (s) => s,
    td: () => AUJ, showToast: () => {}, openM: () => {}, closeM: () => {}, confirm2: () => true, saveDB: () => {}, _stamp: () => {},
    _auditLog: () => {}, _refreshAfterMutation: () => {}, _rPeriodPage: () => {}, setTimeout: () => {},
    _calculerSoldeDG: DG._calculerSoldeDG, _dgStatut: DG._dgStatut, _calculerDelaiRestitution: DG._calculerDelaiRestitution,
    _dgVgEntreeDate: () => '', _dgVgSeedFromEdl: () => [], _dgVgRender: () => {},
    _dgVgCtx: null, _dgVgRows: [], _dgAutresRetenues: 0,
    _rgClotureImpayes: W._rgClotureImpayes, _DEPART_ACOMPTE_CAT: 'Acompte de charges (départ)',
    _forfaitAvenantsDuBail: () => undefined, _isPhone: () => false, _rgIsValidated: () => false,
    _rgJustifFactures: () => [], _rgForfaitRef: () => ({ citation: '' }), _ensureRegulPhCss: () => {},
  };
  const src = noms.map(corpsDe).join('\n');
  // eslint-disable-next-line no-new-func
  const f = new Function('scope', 'with (scope) {\n' + src + '\nreturn {' + noms.join(',') + '};\n}');
  return { fn: f(scope), els, W };
}
const CHAINE_REGUL = ['_isoLocal', '_bailTypeHasTacite', '_bailFinOccupation', '_findBailByRefTolerant', '_getAllBailsForLog',
  '_ccLogOccupations', '_ccLogsInScope', '_ccApplyCleSimple', '_ccApplySousCompteurs', '_calcCcRepartition', 'computeRegul'];

let saveWindow;
beforeAll(() => { saveWindow = globalThis.window; });
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(AUJ + 'T12:00:00')); });
afterEach(() => { vi.useRealTimers(); globalThis.window = saveWindow; });

const TACITE = () => scenario({ impayes: ['2026-07', '2026-08', '2026-09', '2026-10'] });
const DEPART = () => scenario({ depart: '2026-08-31', impayes: ['2026-09', '2026-10'] });

describe('1 · _bailFinOccupation — départ déclaré et bail clôturé', () => {
  const H = () => monter(scenario({ impayes: [] }), ['_bailTypeHasTacite', '_bailFinOccupation']).fn._bailFinOccupation;
  it('départ déclaré sur un bail nu en cours : borne l\'occupation (avant la tacite reconduction)', () => {
    expect(H()({ type: 'nu', fin: '2026-06-30', depart: { dateSortie: '2026-08-31' } }, false)).toBe('2026-08-31');
  });
  it('bail COURANT marqué clôturé sans finEffective : sa fin contractuelle borne l\'occupation', () => {
    expect(H()({ type: 'nu', fin: '2026-03-31', cloture: true }, false)).toBe('2026-03-31');
  });
  it('bail archivé : la date de départ déclarée ne prime pas sur sa fin (finEffective || fin)', () => {
    expect(H()({ type: 'nu', fin: '2026-03-31', depart: { dateSortie: '2026-08-31' } }, true)).toBe('2026-03-31');
  });
});

describe('2 · régularisation (computeRegul) — départ déclaré au 31/08', () => {
  it('occupation 01/01 → 31/08, le locataire est « parti », les charges de septembre à décembre vont au bailleur', () => {
    const { fn } = monter(DEPART(), CHAINE_REGUL);
    const res = fn.computeRegul('2026-01-01', '2026-12-31');
    const e = res.entries[REF];
    expect([e.debutOcc, e.finOcc, e.fin]).toEqual(['2026-01-01', '2026-08-31', '2026-08-31']);
    expect(e.charges).toBe(800);
    expect(Math.round(res.bailleur[IMM].total * 100) / 100).toBe(400);
  });
});

describe('3 · étape régularisation ET étape restitution du DG : un seul solde de tout compte', () => {
  const NOMS = [...CHAINE_REGUL, '_rgImmRegime', '_rgYearChargesDetail', '_rgN1Charges', '_occNonForfaitJours', '_rgClotureCompute', '_dgOpenRestitution'];
  it('départ déclaré : impayés identiques des deux côtés (0 €), 500 € à restituer', () => {
    const { fn, els } = monter(DEPART(), NOMS);
    const c = fn._rgClotureCompute(REF);
    expect(c.entry.finOcc).toBe('2026-08-31');
    expect(c.impayes).toBe(0);
    fn._dgOpenRestitution(REF);
    const body = els['ov-dg-restitution-body'].innerHTML.replace(/\s+/g, ' ');
    expect(body).toMatch(/Loyers impayés cumulés<\/td><td[^>]*>0\.00 €/);
    expect(body).toMatch(/id="dg-restit-solde-display"[^>]*>500\.00 €/);
  });
  it('tacite reconduction : la restitution compte les 2 000 € d\'impayés (juillet → octobre), 0 € à restituer', () => {
    const { fn, els } = monter(TACITE(), NOMS);
    expect(fn._rgClotureCompute(REF).impayes).toBe(2000);
    fn._dgOpenRestitution(REF);
    const body = els['ov-dg-restitution-body'].innerHTML.replace(/\s+/g, ' ');
    expect(body).toMatch(/Loyers impayés cumulés<\/td><td[^>]*>2000\.00 €/);
    expect(body).toMatch(/id="dg-restit-solde-display"[^>]*>0\.00 €/);
  });
});

describe('4 · _dgRestitRecalc — pénalité art. 22 et solde affichés', () => {
  it('tacite reconduction : aucune pénalité (aucune sortie), solde 0 €', () => {
    const { fn, els } = monter(TACITE(), ['_bailTypeHasTacite', '_bailFinOccupation', '_dgRestitRecalc']);
    fn._dgRestitRecalc(REF);
    expect(els['dg-restit-pen-row'].hidden).toBe(true);
    expect(els['dg-restit-solde-display'].textContent).toBe('0.00 €');
  });
  it('départ déclaré au 31/08, DG non restitué au 05/10 : la pénalité court depuis le départ, pas depuis l\'échéance', () => {
    const { fn, els } = monter(DEPART(), ['_bailTypeHasTacite', '_bailFinOccupation', '_dgRestitRecalc']);
    fn._dgRestitRecalc(REF);
    // délai 1 mois → date limite 30/09 ; au 05/10 : 1 mois entamé × 10 % × 500 € = 50 €
    expect(els['dg-restit-pen-amt'].textContent).toBe('+ 50.00 €');
    expect(els['dg-restit-solde-display'].textContent).toBe('550.00 €');
  });
});

describe('5 · _dgConfirmerRestitution — montant ÉCRIT sur le bail', () => {
  const confirmer = (sc) => {
    const { fn, els } = monter(sc, ['_bailTypeHasTacite', '_bailFinOccupation', '_dgConfirmerRestitution']);
    els['ov-dg-restitution-ref'] = { value: REF };
    fn._dgConfirmerRestitution();
    return sc.DB.baux[REF];
  };
  it('tacite reconduction : 0 € restitué (2 000 € d\'impayés), aucune pénalité écrite', () => {
    const b = confirmer(TACITE());
    expect(b.dgRestitueMontant).toBe(0);
    expect(b.dgPenaliteArt22).toBe(0);
  });
  it('départ déclaré : 500 € + 50 € de pénalité', () => {
    const b = confirmer(DEPART());
    expect(b.dgRestitueMontant).toBe(550);
    expect(b.dgPenaliteArt22).toBe(50);
  });
});

describe('7 · vue globale et carte Charges — chaque charge du bailleur a sa ligne, le bon numéro de ligne 2044', () => {
  /** Bail clos au 31/03/2026 ; 12 charges directes de `cat`. */
  const clos = (cat) => {
    const sc = scenario({ impayes: [] });
    sc.DB.baux = {};
    sc.DB.baux_historique = [{ ref: REF, debut: '2024-01-01', fin: '2026-03-31', finEffective: '2026-03-31', cloture: true, ch: 100, locataires: [{ nom: 'Alice' }] }];
    sc.DB.mouvements.forEach((m) => { m.cat = cat; });
    return sc;
  };
  const vueGlobale = (sc, ligne) => {
    const { fn, els, W } = monter(sc, [...CHAINE_REGUL, '_rgShowGlobal', '_rgLignes2044Bailleur']);
    W._regulFrom = '2026-01-01'; W._regulTo = '2026-12-31';
    fn._rgShowGlobal(IMM);
    return { html: els['reg-cards'].innerHTML.replace(/\s+/g, ' '), fn };
  };
  const COPRO = 'Charges de copropriété';

  it('une charge portée ENTIÈREMENT par le bailleur (vacance) a sa ligne dans la matrice — 12 lignes, pas 3', () => {
    const { html } = vueGlobale(clos(RECUP));
    expect((html.match(/<tr class="rg-mv/g) || []).length).toBe(12);
    expect(html).toContain('Eau 12');
  });

  it('copropriété (déjà déduite en 229) : la cellule bailleur le dit, l\'en-tête ne promet pas « (225) »', () => {
    const { html } = vueGlobale(clos(COPRO));
    expect((html.match(/déjà déduite en 229/g) || []).length).toBe(9);
    expect(html).not.toContain('Bailleur (225)');
  });

  it('eau : en-tête « Bailleur (225) », aucune mention 229', () => {
    const { html } = vueGlobale(clos(RECUP));
    expect(html).toContain('Bailleur (225)');
    expect(html).not.toContain('déjà déduite en');
  });

  it('titre de la carte Charges selon le CONTENU : 229 (copropriété), 225 (eau), « 225 et 229 » (les deux)', () => {
    const lignes = (sc) => {
      const { fn } = monter(sc, [...CHAINE_REGUL, '_rgLignes2044Bailleur']);
      return fn._rgLignes2044Bailleur(Object.values(fn.computeRegul('2026-01-01', '2026-12-31').bailleur));
    };
    expect(lignes(clos(COPRO))).toBe('229');
    expect(lignes(clos(RECUP))).toBe('225');
    const mixte = clos(RECUP);
    mixte.DB.mouvements.push({ id: 99, date: '2026-06-15', cat: COPRO, db: 50, qui: REF, imm: IMM, lib: 'Syndic' });
    expect(lignes(mixte)).toBe('225 et 229');
  });
});

describe('6 · _rgApplyRetenue (clôture) — restitution ÉCRITE sur le bail', () => {
  const NOMS = [...CHAINE_REGUL, '_rgImmRegime', '_rgYearChargesDetail', '_rgN1Charges', '_occNonForfaitJours', '_rgClotureCompute', '_rgApplyRetenue'];
  it('tacite reconduction : dgRestitue = 0 (impayés jusqu\'à aujourd\'hui, pas jusqu\'à l\'échéance)', () => {
    const sc = TACITE();
    monter(sc, NOMS).fn._rgApplyRetenue(REF, 0, 0);
    expect(sc.DB.baux[REF].dgRestitue).toBe(0);
  });
  it('départ déclaré : dgRestitue = 500 (impayés bornés au départ, comme l\'écran de restitution)', () => {
    const sc = DEPART();
    monter(sc, NOMS).fn._rgApplyRetenue(REF, 0, 0);
    expect(sc.DB.baux[REF].dgRestitue).toBe(500);
  });
});
