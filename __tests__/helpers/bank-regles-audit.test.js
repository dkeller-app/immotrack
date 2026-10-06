/**
 * bank-regles-audit.test.js — REGLES-REFONTE, corrections de l'audit indépendant (06/10).
 *
 *  B1 — règle EN CONFLIT : la ligne de départ suit TOUJOURS la règle qu'on vient de créer, garde ce
 *       que la règle ne définit pas (son affectation faite à la main), et les AUTRES règles qui
 *       donnent un autre résultat sont dites (aperçu, message, ligne). Les autres lignes en conflit
 *       restent « ⚠ N règles possibles » (CDC ⑦.2 v2).
 *  M1 — dates échappées dans la fenêtre de règle et dans « Mes règles ».
 *  M2 — « N lignes suivront la règle » n'inclut plus les lignes classées à la main (protégées).
 *  M3 — l'identifiant de migration ne dépend pas des horodatages ni de l'ordre des clés.
 *  I2 — doublons : même condition de montant exigée ; « Fusionner » garde la plus LARGE.
 *  M4 — `_bankRulesMergeById` documentée comme NON branchée.
 *
 * Les tests « app » ne lisent pas le source avec des expressions régulières : ils EXÉCUTENT les
 * vraies fonctions de js/app/app-part*.js (extraites telles quelles) dans un bac à sable, avec le
 * vrai module js/core/bank-import.js derrière `window` et de simples bouchons pour l'affichage.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import * as Bank from '../../js/core/bank-import.js';

const {
  _bankRuleBuild, _bankMigrateRules, _bankReclassifyPrepare, _bankLineApplyRules, _bankRuleAutresResultats,
  _bankRuleTombstone, _bankRulesDuplicates, _bankRulesFuse, _bankRuleApercu, _bankRuleMatch, _bankRuleAddException,
  _bankRuleStatutLigne, _bankFingerprintRow,
} = Bank;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const NOW = '2026-10-06T10:00:00.000Z';
let _n = 0;
const newId = () => 'rg_au_' + (++_n);
const R = (draft) => {
  const b = _bankRuleBuild(Object.assign({ compte: 'cic', sens: 'db' }, draft), { newId, now: NOW });
  if (!b.ok) throw new Error(b.errors.join(','));
  return b.rule;
};
const mk = (date, libelle, amt, extra = {}) => Object.assign({ date, libelle, credit: amt > 0 ? amt : 0, debit: amt < 0 ? -amt : 0,
  signedAmount: amt, _fingerprint: _bankFingerprintRow(date, amt, libelle) }, extra);
const CHARGES = 'Charges récupérables (eau, énergie…)';

// ─── Bac à sable : les vraies fonctions de l'app, extraites du source ────────────────────────────
const SRC = read('js/app/app-part1.js') + '\n' + read('js/app/app-part2.js');
function extraire(nom) {
  const m = new RegExp('\\nfunction ' + nom + '\\(').exec(SRC);
  if (!m) return '';               // absente (ex. code d'avant le correctif) : le test qui s'en sert échoue tout seul
  const fin = SRC.indexOf('\n}\n', m.index + 1);
  return SRC.slice(m.index + 1, fin + 2);
}
const FONCTIONS = ['escHtml', 'fd',
  '_bankRuleSave', '_bankRuleErreurs', '_bankRuleCandidate', '_bankRuleMontantDepuisSaisieDraft', '_bankRuleErrMsgs', '_bankRuleErrMsg',
  '_bankRuleApplyToSourceMv', '_bankRuleAfterChange', '_bankReclassify', '_bankImportFinalizePreview', '_bankApplyRule',
  '_bankApplyHeuristic', '_bankLoyerCC', '_bankImportActif', '_bankRulePreviewRender', '_bankRuleCtx', '_bankRuleExceptionsHtml',
  '_bankRuleAutresApercuHtml', '_bankAutresReglesHtml', '_bankAutreRegleTxt', '_bankRuleMotsLibelle', '_bankRulesCarteHtml',
  '_bankRulesAffTxt', '_bankRuleMontantTxt', '_ccImmeuble', '_bankRuleLigneCase', '_bankRulePanelHtml', '_bankRuleRefForTrace'];

function app() {
  const window = Object.assign({}, Bank);
  const els = {};
  const toasts = [];
  const code = `
    let DB = { params: { bankAccounts: [] }, importRules: [], mouvements: [], logements: [], entites: [] };
    let _bankRuleDraft = null, _bankRuleAp = null, _bankRuleSugg = { mot: '', sens: '' };
    let _bankImportLines = [], _currentBankAccount = null, _bankReviewFmt = 'xlsx';
    const _bankRulesExOpen = {};
    let _bankReviewTab, _bankOpen, _affScopeAll, _affToutPar = {}, _bankReviewedOk, _bankMvIdx = -1, _bankWalk = null;
    function el(id) { return els[id] || null; }
    function showToast(msg, type) { toasts.push({ msg: String(msg), type }); }
    function fmt(n) { return (Number(n) || 0).toFixed(2) + ' €'; }
    function _uiIcon() { return ''; }
    function _isAlive(x) { return !!x && !x._deleted; }
    function _stamp(x) { if (x && typeof x === 'object') x._modifiedAt = '${NOW}'; }
    function saveDB() {}
    function closeM() {}
    function confirm2() { return true; }
    function _bankHeuristicCtx() { return {}; }
    function _bankImportRenderPreview() {}
    ${FONCTIONS.map(extraire).join('\n')}
    return { get: n => eval(n), set: (n, v) => eval(n + ' = v') };`;
  // eslint-disable-next-line no-new-func
  const api = new Function('window', 'els', 'toasts', code)(window, els, toasts);
  els['ov-bank-import'] = { classList: { contains: () => false } };      // import ouvert
  return { api, els, toasts, window, call: (f, ...a) => api.get(f)(...a) };
}

// Le cas B1 tel que l'audit l'a rejoué (audit4.cjs) : règle historique « EDF » → Assurance toujours
// active, ligne classée à la main (Travaux, Ferrette 101), nouvelle règle « EDF » → Charges récupérables.
function scenarioB1() {
  const A = app();
  const DB = A.api.get('DB');
  DB.params.bankAccounts = [{ id: 'cic', label: 'CIC', bailleur: 'SCI Dupont' }];
  DB.logements = [{ ref: 'Ferrette 101', imm: 'Ferrette', entity: 'SCI Dupont' }];
  DB.importRules = [{ pattern: 'EDF', sens: 'db', cat: 'Assurance', compte: '' }];
  _bankMigrateRules(DB.importRules, { now: NOW });
  A.api.set('_currentBankAccount', DB.params.bankAccounts[0]);
  const lignes = [
    mk('2026-09-05', 'PRLV SEPA EDF CLIENTS 124', -81,
      { suggestedCat: 'Travaux', suggestedQui: 'Ferrette 101', suggestedImm: 'Ferrette', _userEdited: true, _reviewed: true }),
    mk('2026-09-06', 'PRLV SEPA EDF CLIENTS 125', -82),                      // autre ligne, non classée
  ];
  A.api.set('_bankImportLines', lignes);
  // Brouillon tel que la fenêtre le laisse : mot « EDF » coché, catégorie changée, affectation vidée.
  A.api.set('_bankRuleDraft', { id: '', chips: ['PRLV', 'SEPA', 'EDF', 'CLIENTS', '124'], mots: ['EDF'], saisis: [], ref: '',
    sens: 'db', compte: 'cic', compteFixe: true, compteOrigine: 'import', montantUi: { type: 'none', valeur: '', min: '', max: '' },
    exceptions: [], exNew: [], cat: CHARGES, qui: '', imm: '', cc: '', bdc: false, historique: false,
    src: { date: lignes[0].date, libelle: lignes[0].libelle, credit: 0, debit: 81, _fingerprint: lignes[0]._fingerprint },
    srcIndex: 0, srcMvId: null });
  return A;
}

describe('B1 — règle en conflit : la ligne de départ suit la règle créée et garde son affectation', () => {
  it('bout en bout (vraie fonction _bankRuleSave) : classée par la nouvelle règle, affectation gardée, autre règle DITE', () => {
    const A = scenarioB1();
    A.call('_bankRuleSave');
    const L0 = A.api.get('_bankImportLines')[0];
    expect(L0.suggestedCat).toBe(CHARGES);               // avant : 'Travaux' effacé → proposition automatique
    expect(L0.suggestedQui).toBe('Ferrette 101');        // avant : '' (perdue sans le dire)
    expect(L0.suggestedImm).toBe('Ferrette');
    expect(L0._byRule).toBe(true);
    expect(L0._ruleConflicts).toBeNull();
    expect(L0._autresRegles).toHaveLength(1);
    expect(L0._autresRegles[0]).toMatchObject({ motif: 'EDF', compteAChoisir: true, cat: 'Assurance', champs: ['cat'] });
    const t = A.toasts.at(-1);
    expect(t.type).toBe('warn');
    expect(t.msg).toContain('la règle « EDF » (compte à choisir) donne un autre résultat pour la ligne de départ : Assurance');
    // La ligne montre l'autre règle, avec Modifier / Supprimer (identifiant par data-rid).
    const panel = A.call('_bankRulePanelHtml', 0);
    expect(panel).toContain('La règle « EDF » (compte à choisir) donne un autre résultat : Assurance');
    expect(panel).toMatch(/data-rid="[^"]+"[^>]*onclick="_bankAutreRegleAct\(this,'edit'\)">Modifier/);
    expect(panel).toMatch(/onclick="_bankAutreRegleAct\(this,'del'\)">Supprimer/);
  });
  it('les AUTRES lignes de l\'import en conflit restent « ⚠ 2 règles possibles » (choix manuel, CDC ⑦.2 v2)', () => {
    const A = scenarioB1();
    A.call('_bankRuleSave');
    const L1 = A.api.get('_bankImportLines')[1];
    expect(L1._byRule).toBe(false);
    expect(L1._ruleConflicts).toHaveLength(1);
    expect(L1._ruleConflicts[0].rules).toHaveLength(2);
    expect(L1._autresRegles).toBeUndefined();
  });
  it('l\'aperçu le dit AVANT d\'enregistrer', () => {
    const A = scenarioB1();
    A.els['bank-rule-preview'] = { innerHTML: '' };
    A.call('_bankRulePreviewRender');
    expect(A.els['bank-rule-preview'].innerHTML).toContain('La règle « EDF » (compte à choisir) donne un autre résultat : Assurance');
    expect(A.els['bank-rule-preview'].innerHTML).toContain('La règle que tu crées l\'emportera pour cette ligne.');
  });
  it('un reclassement ultérieur ne lui fait rien perdre ; supprimer l\'autre règle efface le signal', () => {
    const A = scenarioB1();
    A.call('_bankRuleSave');
    const DB = A.api.get('DB');
    A.call('_bankReclassify', null, -1);                         // ex. une autre règle créée / supprimée
    let L0 = A.api.get('_bankImportLines')[0];
    expect([L0.suggestedCat, L0.suggestedQui]).toEqual([CHARGES, 'Ferrette 101']);
    expect(L0._autresRegles).toHaveLength(1);
    const ih = DB.importRules.findIndex(r => r.pattern === 'EDF' && !r.mots);
    DB.importRules[ih] = _bankRuleTombstone(DB.importRules[ih], { now: NOW });
    A.call('_bankReclassify', null, -1);
    L0 = A.api.get('_bankImportLines')[0];
    expect(L0._autresRegles).toBeNull();
    expect([L0.suggestedCat, L0.suggestedQui]).toEqual([CHARGES, 'Ferrette 101']);
  });
});

describe('B1 — logique pure (_bankReclassifyPrepare, _bankRuleAutresResultats)', () => {
  const hist = () => { const r = [{ pattern: 'EDF', sens: 'db', cat: 'Assurance', compte: '' }]; _bankMigrateRules(r, { now: NOW }); return r[0]; };
  const source = () => mk('2026-09-05', 'PRLV SEPA EDF 124', -81,
    { suggestedCat: 'Travaux', suggestedQui: 'Ferrette 101', suggestedImm: 'Ferrette', _userEdited: true });
  it('la règle créée gagne pour SA ligne malgré la règle en conflit ; ce qu\'elle ne définit pas est gardé', () => {
    const h = hist(), neuve = R({ mots: ['EDF'], cat: CHARGES });
    const p = _bankReclassifyPrepare([source()], { rule: neuve, rules: [h, neuve], sourceIndex: 0, accountId: 'cic' });
    const l = p.lines[0];
    expect([l.suggestedCat, l.suggestedQui, l.suggestedImm]).toEqual([CHARGES, 'Ferrette 101', 'Ferrette']);
    expect(l._ruleConflicts).toBeNull();
    expect(l._suitRegle).toBe(true);
    expect(l._userEdited).toBe(true);                      // garde une part faite à la main : reste protégée
    expect(p.sourceAutres.map(a => [a.motif, a.cat, a.champs])).toEqual([['EDF', 'Assurance', ['cat']]]);
  });
  it('règle complète (catégorie + affectation) : plus rien de manuel, la marque « retouchée » est levée', () => {
    const neuve = R({ mots: ['EDF'], cat: CHARGES, qui: 'Ferrette 102' });
    const p = _bankReclassifyPrepare([source()], { rule: neuve, rules: [hist(), neuve], sourceIndex: 0, accountId: 'cic' });
    expect(p.lines[0].suggestedQui).toBe('Ferrette 102');
    expect(p.lines[0]._userEdited).toBeUndefined();
    // Non protégée, elle reste quand même classée par SA règle au reclassement suivant (jamais reprise en douce).
    const p2 = _bankReclassifyPrepare(p.lines, { rules: [hist(), neuve], accountId: 'cic' });
    expect([p2.lines[0].suggestedCat, p2.lines[0].suggestedQui]).toEqual([CHARGES, 'Ferrette 102']);
    expect(p2.lines[0]._ruleConflicts).toBeNull();
  });
  it('autre règle de MÊME résultat : rien à signaler ; règle d\'affectation seule différente : signalée', () => {
    const neuve = R({ mots: ['EDF'], cat: CHARGES });
    const meme = R({ mots: ['SEPA'], cat: CHARGES });
    const autreAff = R({ mots: ['PRLV'], qui: 'Krut 1' });
    const autres = _bankRuleAutresResultats([neuve, meme, autreAff], neuve, source(), { accountId: 'cic' });
    expect(autres.map(a => [a.motif, a.champs])).toEqual([['PRLV', ['aff']]]);
    // La règle elle-même (même id) n'est jamais sa propre « autre règle » ; une règle supprimée non plus.
    expect(_bankRuleAutresResultats([neuve, _bankRuleTombstone(autreAff, { now: NOW })], neuve, source(), { accountId: 'cic' })).toEqual([]);
  });
});

describe('M1 — dates échappées (fenêtre de règle et « Mes règles »)', () => {
  const EVIL = '<img src=x onerror=window.__xss=1>';
  it('« Mes règles » : date d\'exception piégée rendue en texte', () => {
    const A = app();
    const r = Object.assign(R({ mots: ['EDF'], cat: CHARGES }), {
      exceptions: [{ cle: 'k"><b>', date: EVIL, libelle: '<svg onload=x>', montant: 1, sens: 'db' }] });
    const html = A.call('_bankRulesCarteHtml', r, null);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;img src=x onerror=window.__xss=1&gt;');
  });
  it('fenêtre de règle : exceptions et lignes de l\'aperçu', () => {
    const A = scenarioB1();
    const d = A.api.get('_bankRuleDraft');
    d.exceptions = [{ cle: 'k', date: EVIL, libelle: 'x', montant: 1, sens: 'db' }];
    expect(A.call('_bankRuleExceptionsHtml', d)).not.toContain('<img');
    A.api.get('_bankImportLines')[1].date = EVIL;
    A.els['bank-rule-preview'] = { innerHTML: '' };
    A.call('_bankRulePreviewRender');
    expect(A.els['bank-rule-preview'].innerHTML).not.toContain('<img');
    expect(A.els['bank-rule-preview'].innerHTML).toContain('&lt;img');
  });
});

describe('M2 — l\'aperçu ne compte pas les lignes classées à la main dans « suivront la règle »', () => {
  it('module pur : nSuivront exclut les lignes protégées (sauf la ligne de départ), nProtegees les compte', () => {
    const r = R({ mots: ['EDF'], cat: CHARGES });
    const lignes = [mk('2026-09-01', 'EDF 1', -1, { _userEdited: true }), mk('2026-09-02', 'EDF 2', -2, { _reviewed: true }),
      mk('2026-09-03', 'EDF 3', -3), mk('2026-09-04', 'EDF 4', -4, { _userEdited: true })];
    const ap = _bankRuleApercu(r, { importLines: lignes, accountId: 'cic', sourceIndex: 0, source: lignes[0] });
    expect(ap.nSuivront).toBe(2);              // la source + EDF 3
    expect(ap.nProtegees).toBe(2);             // EDF 2 et EDF 4
    expect(ap.lignes.find(x => x.index === 0).protegee).toBe(false);
  });
  it('affichage : « 1 ligne … suivront la règle · 1 classée à la main, laissée telle quelle »', () => {
    const A = scenarioB1();
    A.api.get('_bankImportLines')[1]._userEdited = true;
    A.api.get('_bankImportLines')[1].suggestedCat = 'Énergie';
    A.els['bank-rule-preview'] = { innerHTML: '' };
    A.call('_bankRulePreviewRender');
    const h = A.els['bank-rule-preview'].innerHTML;
    expect(h).toContain('<b>1 ligne</b> de cet import suivront la règle · 1 classée à la main, laissée telle quelle');
    expect(h).toContain('<b>classée à la main</b> : laissée telle quelle (Énergie)');
  });
});

describe('M3 — identifiant de migration indépendant des horodatages et de l\'ordre des clés', () => {
  it('deux appareils : la même règle, seul `_modifiedAt` (et l\'ordre des clés) diffère → même id', () => {
    const a = [{ pattern: 'EDF', cat: 'Énergie', _modifiedAt: '2026-10-01T08:00:00.000Z' }];
    const b = [{ _modifiedAt: '2026-10-05T19:42:00.000Z', cat: 'Énergie', pattern: 'EDF' }];
    _bankMigrateRules(a, { now: NOW }); _bankMigrateRules(b, { now: NOW });
    expect(a[0].id).toBe(b[0].id);
    // Un VRAI changement de contenu donne toujours un autre id.
    const c = [{ pattern: 'EDF', cat: 'Autre' }];
    _bankMigrateRules(c, { now: NOW });
    expect(c[0].id).not.toBe(a[0].id);
  });
});

describe('I2 — doublons et fusion', () => {
  it('même mots, condition de montant différente (= loyer CC / = 700 €) : PAS des doublons', () => {
    const cc = R({ mots: ['LOYER', 'DUPONT'], sens: 'cr', cat: 'Loyers encaissés', qui: 'F-101', montant: { type: 'loyerCC' } });
    const fixe = R({ mots: ['LOYER', 'DUPONT'], sens: 'cr', cat: 'Loyers encaissés', qui: 'F-101', montant: { type: 'exact', valeur: 700 } });
    expect(_bankRulesDuplicates([cc, fixe])).toHaveLength(0);
    const ligne = mk('2026-09-05', 'VIR LOYER DUPONT', 700);
    expect(_bankRuleStatutLigne([cc, fixe], ligne, 'cic', { loyerCC: () => 700 }).etat).toBe('enregistree');
  });
  it('« SARAR » ⊂ « SARAR SYNDIC » : fusionner garde « SARAR » ; « VIR SARAR 150 » reste classée', () => {
    const large = R({ mots: ['SARAR'], cat: CHARGES });
    const precise = R({ mots: ['SARAR', 'SYNDIC'], cat: CHARGES });
    const [d] = _bankRulesDuplicates([large, precise]);
    expect(d.garder).toBe(large);
    const f = _bankRulesFuse(precise, large, { now: NOW });
    expect(f.garder.id).toBe(large.id);
    const regles = [f.garder, f.tombstone];
    const ligne = mk('2026-09-07', 'VIR SARAR 150', -150);
    expect(_bankLineApplyRules(regles, ligne, { accountId: 'cic' })).toBe(true);
    expect(ligne.suggestedCat).toBe(CHARGES);
    // Et les lignes de l'ancienne règle précise aussi.
    expect(_bankRuleMatch(f.garder, mk('2026-09-08', 'VIR SARAR SYNDIC', -150), 'cic')).toBe(true);
  });
  it('fusion : union des exceptions des deux règles', () => {
    const l1 = mk('2026-09-01', 'VIR SARAR A', -1), l2 = mk('2026-09-02', 'VIR SARAR SYNDIC B', -2);
    const large = _bankRuleAddException(R({ mots: ['SARAR'], cat: CHARGES }), l1, { now: NOW });
    const precise = _bankRuleAddException(R({ mots: ['SARAR', 'SYNDIC'], cat: CHARGES }), l2, { now: NOW });
    const f = _bankRulesFuse(large, precise, { now: NOW });
    expect(f.garder.exceptions.map(e => e.cle).sort()).toEqual([l1._fingerprint, l2._fingerprint].sort());
  });
  it('sens « dépense » ne couvre pas « les deux » : pas un doublon (fusionner perdrait les recettes)', () => {
    const db = R({ mots: ['SARAR'], cat: CHARGES, sens: 'db' });
    const deux = R({ mots: ['SARAR', 'SYNDIC'], cat: CHARGES, sens: '' });
    expect(_bankRulesDuplicates([db, deux])).toHaveLength(0);
  });
  it('« Mes règles » : le bouton dit ce qui est gardé (« Fusionner (garder « SARAR ») »)', () => {
    const A = app();
    const large = R({ mots: ['SARAR'], cat: CHARGES });
    const precise = R({ mots: ['SARAR', 'SYNDIC'], cat: CHARGES });
    const html = A.call('_bankRulesCarteHtml', precise, large);
    expect(html).toContain('Fusionner (garder « SARAR »)');
    expect(html).toContain('la plus large');
  });
});

describe('Comportement (remplace deux gardes « regex sur le source »)', () => {
  it('rendu échappé : tout texte issu d\'une règle (mots, catégorie, affectation, exception, id, doublon)', () => {
    const A = app();
    const r = Object.assign(R({ mots: ['<b>m</b>'], motsLibres: ['<u>s</u>'], cat: '<i>c</i>', qui: '<s>q</s>' }), {
      id: 'x"><script>1</script>', exceptions: [{ cle: 'k"><kbd>', date: '2026-09-01', libelle: '<svg onload=x>', montant: 1, sens: 'db' }] });
    const autre = Object.assign(R({ mots: ['<marquee>'], cat: '<i>c</i>', qui: '<s>q</s>' }), { id: '"><a>' });
    const html = A.call('_bankRulesCarteHtml', r, autre);
    for (const brut of ['<b>m', '<u>s', '<i>c', '<s>q', '<script>', '<kbd>', '<svg', '<marquee>', '"><a>']) expect(html, brut).not.toContain(brut);
    expect(html).toContain('&lt;b&gt;m&lt;/b&gt;');
  });
  it('aperçu : décocher une ligne la sort de la règle (exception mémorisée, ligne affichée « hors règle »)', () => {
    const A = scenarioB1();
    A.els['bank-rule-preview'] = { innerHTML: '' };
    A.call('_bankRulePreviewRender');
    const ap = A.api.get('_bankRuleAp');
    const k = ap.lignes.findIndex(x => x.index === 1);
    expect(k).toBeGreaterThan(0);
    expect(A.els['bank-rule-preview'].innerHTML).toMatch(new RegExp('<input type="checkbox" data-k="' + k + '" checked[^>]*onchange="_bankRuleLigneCase\\(this\\.dataset\\.k,this\\.checked\\)"'));
    A.call('_bankRuleLigneCase', String(k), false);
    const d = A.api.get('_bankRuleDraft');
    const cle = A.api.get('_bankImportLines')[1]._fingerprint;
    expect(d.exceptions.map(e => e.cle)).toEqual([cle]);
    expect(d.exNew).toEqual([cle]);
    const h = A.els['bank-rule-preview'].innerHTML;
    expect(h).toContain('hors règle : reste à classer à la main (exception mémorisée)');
    expect(h).toContain('1 exception sur la règle');
    // Recocher retire l'exception.
    A.call('_bankRuleLigneCase', String(k), true);
    expect(d.exceptions).toEqual([]);
  });
});

describe('M4 — la fusion par identifiant n\'est pas branchée, et le code le dit', () => {
  it('aucun appel dans l\'app ; la documentation le signale', () => {
    const app3 = ['js/app/app-part1.js', 'js/app/app-part2.js', 'js/app/app-part3.js'].map(read).join('\n');
    expect(app3).not.toContain('_bankRulesMergeById');
    const mod = read('js/core/bank-import.js');
    const doc = mod.slice(mod.lastIndexOf('/**', mod.indexOf('export function _bankRulesMergeById')), mod.indexOf('export function _bankRulesMergeById'));
    expect(doc).toContain('NON BRANCHÉE');
    expect(doc).toContain('REMPLACÉ EN');
  });
});
