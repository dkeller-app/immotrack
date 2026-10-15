/**
 * bank-regles-relecture-ciblee.test.js — correctifs de la relecture ciblée (migration des règles et
 * classement d'argent) faite à l'intégration de la refonte des règles sur main (v15.744 provisoire).
 *
 * A1 — une règle historique réenregistrée (« Ouvrir et choisir le compte ») garde son motif comme UN
 *      morceau : aucun élargissement silencieux (« LOYER DUPONT » n'attrape pas « DUPONT MARTIN LOYER »).
 * A2 — l'identifiant de migration ne dépend que du contenu (pas de la position dans la liste).
 * B1 — « Fusionner » ne garde jamais une règle à mot entier qui n'attrape pas tout ce qu'attrapait
 *      la règle historique (sous-chaîne) qu'elle remplacerait.
 * B2 — pas de doublon quand la règle gardée exclut (exception) une ligne que l'autre classe.
 * B4 — logement et compteur collectif s'excluent dans une règle (le compteur l'emporte).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  _bankRuleBuild, _bankRuleToDraft, _bankRuleMatch, _bankMigrateRules, _bankRulesDuplicates,
  _bankRuleAddException,
} from '../../js/core/bank-import.js';

const NOW = '2026-10-15T10:00:00.000Z';
let _n = 0;
const newId = () => 'rg_rc_' + (++_n);
const L = (libelle, amt, extra = {}) => Object.assign({ date: '2026-10-05', libelle, credit: amt > 0 ? amt : 0, debit: amt < 0 ? -amt : 0, signedAmount: amt }, extra);
const R = (d) => { const b = _bankRuleBuild(Object.assign({ compte: 'cic', cat: 'C', sens: 'db' }, d), { newId, now: NOW }); if (!b.ok) throw new Error(b.errors.join(',')); return b.rule; };

describe('A1 — règle historique réenregistrée : même ensemble de lignes attrapées', () => {
  const hist = () => { const r = [{ pattern: 'LOYER  DUPONT', sens: 'cr', cat: 'Loyers encaissés', qui: 'A1' }]; _bankMigrateRules(r, { now: NOW }); return r[0]; };
  const libelles = ['VIR LOYER DUPONT OCT', 'vir loyer dupont', 'DUPONT MARTIN LOYER GARAGE', 'LOYER-DUPONT', 'VIR SEPA DUPONT LOYER', 'LOYER DUPONTEL', 'XLOYER DUPONT'];
  it('le brouillon garde le motif en un seul morceau', () => {
    expect(_bankRuleToDraft(hist()).motsLibres).toEqual(['LOYER DUPONT']);
  });
  it('après « choisir le compte » + enregistrer, chaque libellé est attrapé exactement comme avant (sur ce compte)', () => {
    const h = hist();
    const d = Object.assign(_bankRuleToDraft(h), { compte: 'cic' });
    const b = _bankRuleBuild(d, { base: h, now: NOW });
    expect(b.ok).toBe(true);
    for (const lib of libelles) {
      expect(_bankRuleMatch(b.rule, L(lib, 700), 'cic'), lib).toBe(_bankRuleMatch(h, L(lib, 700), 'cic'));
    }
    expect(_bankRuleMatch(b.rule, L('DUPONT MARTIN LOYER GARAGE', 700), 'cic')).toBe(false);
  });
});

describe('A2 — identifiant de migration indépendant de la position', () => {
  it('une règle ajoutée plus haut ne change pas l\'identifiant des suivantes', () => {
    const a = [{ pattern: 'EDF', cat: 'X' }, { pattern: 'SARAR', cat: 'Y' }];
    const b = [{ pattern: 'NOUVELLE', cat: 'Z' }, { _deleted: true, pattern: 'VIEILLE' }, { pattern: 'EDF', cat: 'X' }, { pattern: 'SARAR', cat: 'Y' }];
    _bankMigrateRules(a, { now: NOW }); _bankMigrateRules(b, { now: '2027-01-01T00:00:00.000Z' });
    expect(b[2].id).toBe(a[0].id);
    expect(b[3].id).toBe(a[1].id);
  });
  it('deux règles identiques reçoivent deux identifiants distincts', () => {
    const r = [{ pattern: 'EDF', cat: 'X' }, { pattern: 'EDF', cat: 'X' }];
    _bankMigrateRules(r, { now: NOW });
    expect(r[0].id).not.toBe(r[1].id);
    expect(r[1].id).toBe(r[0].id + '-2');
  });
});

describe('B1 — fusion : un mot entier ne remplace pas une sous-chaîne qui attrape plus', () => {
  it('« EDF » (mot entier) et l\'historique « PRLV EDF » ne sont pas des doublons', () => {
    const a = R({ mots: ['EDF'] });
    const b = { id: 'h1', pattern: 'PRLV EDF', compte: 'cic', sens: 'db', cat: 'C' };
    expect(_bankRuleMatch(b, L('PRLV EDFENR 2024', -50), 'cic')).toBe(true);
    expect(_bankRuleMatch(a, L('PRLV EDFENR 2024', -50), 'cic')).toBe(false);
    expect(_bankRulesDuplicates([a, b])).toHaveLength(0);
  });
  it('un mot entouré de séparateurs DANS le motif historique le couvre toujours (doublon conservé)', () => {
    const a = R({ mots: ['SEPA'] });
    const b = { id: 'h2', pattern: 'PRLV SEPA EDF', compte: 'cic', sens: 'db', cat: 'C' };
    const d = _bankRulesDuplicates([a, b]);
    expect(d).toHaveLength(1);
    expect(d[0].garder).toBe(a);
  });
});

describe('B2 — fusion : l\'exception de la règle gardée ne fait pas perdre une ligne classée par l\'autre', () => {
  it('[EDF] avec exception « PRLV EDF SYNDIC » et [EDF, SYNDIC] : pas de doublon', () => {
    const ligne = L('PRLV EDF SYNDIC', -80, { fitid: 'F1', _fingerprint: 'fitid:F1' });
    const large = _bankRuleAddException(R({ mots: ['EDF'] }), ligne, { now: NOW });
    const precise = R({ mots: ['EDF', 'SYNDIC'] });
    expect(_bankRuleMatch(precise, ligne, 'cic')).toBe(true);
    expect(_bankRuleMatch(large, ligne, 'cic')).toBe(false);
    expect(_bankRulesDuplicates([large, precise])).toHaveLength(0);
  });
  it('si l\'autre règle exclut aussi la ligne, le doublon reste signalé', () => {
    const ligne = L('PRLV EDF SYNDIC', -80, { fitid: 'F2', _fingerprint: 'fitid:F2' });
    const large = _bankRuleAddException(R({ mots: ['EDF'] }), ligne, { now: NOW });
    const precise = _bankRuleAddException(R({ mots: ['EDF', 'SYNDIC'] }), ligne, { now: NOW });
    expect(_bankRulesDuplicates([large, precise])).toHaveLength(1);
  });
});

describe('B4 — logement et compteur collectif s\'excluent', () => {
  it('le compteur l\'emporte (même règle que _bankRulePrefill et que le filet de l\'import)', () => {
    const r = R({ mots: ['SAUR'], qui: 'A1', compteurCcId: 'CC1', imm: 'Alpha' });
    expect(r).toMatchObject({ qui: '', compteurCcId: 'CC1', imm: 'Alpha' });
  });
});

describe('B5 / A1 — textes de la fenêtre (garde de source)', () => {
  const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'js', 'app', 'app-part2.js'), 'utf8');
  it('la règle historique annonce son comportement réel', () => {
    expect(src).toContain('son motif reste cherché tel quel (mots côte à côte, dans cet ordre)');
    expect(src).not.toContain('ses mots seront cherchés dans n\\\'importe quel ordre');
  });
  it('le mouvement d\'origine dont le logement est remplacé le dit', () => {
    expect(src).toContain('remplacé par l\\\'affectation de la règle');
  });
});

// ── Relecture adverse de la fusion (Opus) ─────────────────────────────────────────────────────────
import { _bankReclassifyPrepare } from '../../js/core/bank-import.js';
describe('Inversion des montants : le classement non retouché est vidé puis rejoué', () => {
  it('une proposition (affectation) d\'avant l\'inversion ne survit pas ; une ligne classée à la main reste', () => {
    const lignes = [
      Object.assign(L('PRLV EDF', -50), { suggestedCat: 'Loyers encaissés', suggestedQui: 'F-101', confidence: 0.8 }),
      Object.assign(L('VIR DUPONT', 700), { suggestedCat: 'Loyers encaissés', suggestedQui: 'F-102', _userEdited: true }),
    ];
    const p = _bankReclassifyPrepare(lignes, { rule: null, rules: [], accountId: 'cic' });
    expect(p.lines[0].suggestedQui).toBeUndefined();
    expect(p.lines[0].suggestedCat).toBeUndefined();
    expect(p.lines[1].suggestedQui).toBe('F-102');
  });
  const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'js', 'app', 'app-part2.js'), 'utf8');
  it('_bankToggleInvert passe par le chemin unique _bankReclassify', () => {
    const f = src.slice(src.indexOf('function _bankToggleInvert()'), src.indexOf('function _bankAfterRead('));
    expect(f).toContain('_bankReclassify(null, -1);');
    expect(f).not.toContain('_bankImportFinalizePreview(_bankImportLines.map(');
  });
  it('« Fusionner » demande confirmation ; règle sans effet refusée ; compte supprimé à rechoisir ; bouton ✕ libellé', () => {
    const fu = src.slice(src.indexOf('function _bankRulesFusionner('), src.indexOf('function _bankRulesGarderLesDeux('));
    expect(fu).toContain('confirm2(');
    expect(src).toContain("errs.push('rien')");
    expect(src).toContain('Rien à appliquer : choisir une catégorie ou une affectation (étape 5).');
    expect(src).toContain('compteSupprime: !!dr.compte && !compteVivant');
    expect(src).toContain('>✕ Retirer</button>');
  });
});
