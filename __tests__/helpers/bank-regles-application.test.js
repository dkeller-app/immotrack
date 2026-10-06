/**
 * bank-regles-application.test.js — REGLES-REFONTE phase 4 : APPLICATION des règles.
 * Sujet : docs/subjects/RETOURS-2026-10-05.md (lot D + « Décisions Didier du 06/10 »).
 *
 * Décisions testées :
 *  - la règle s'applique à la ligne SOURCE (qui n'est plus verrouillée « retouchée » par la
 *    création de la règle), aux lignes de l'import en cours, aux imports futurs ;
 *  - jamais d'écrasement silencieux d'une ligne classée à la main : sautée ET comptée ;
 *  - depuis la fiche d'un mouvement enregistré : CE mouvement, et lui seul, est mis à jour ;
 *  - identité par id (deux règles au même motif sur deux comptes), tombstone par id ;
 *  - « = loyer CC » comparé au loyer du MOIS DU VIREMENT ;
 *  - règle historique inchangée, migration idempotente.
 * Le branchement (js/app/app-part*.js) est vérifié par les gardes de source en fin de fichier.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  _bankRuleBuild, _bankMigrateRules, _bankRuleIdxById, _bankRuleById, _bankRuleFindForTrace,
  _bankRuleTombstone, _bankRuleExactDuplicate, _bankRuleApercu, _bankRuleMatch, _bankRuleUsage,
  _bankLineApplyRules, _bankReclassifyPrepare, _bankRulePatchMouvement, _bankRuleMotsDuChamp,
  _bankRuleTraceKey, _bankRulePrefill,
} from '../../js/core/bank-import.js';
import { normaliserDonneesLoyers } from '../../js/core/normalisation-loyers.js';

const NOW = '2026-10-06T10:00:00.000Z';
let _n = 0;
const newId = () => 'rg_app_' + (++_n);
const L = (libelle, montant, extra = {}) => Object.assign({
  libelle, date: '2026-09-15', credit: montant > 0 ? montant : 0, debit: montant < 0 ? -montant : 0,
}, extra);
const R = (draft, opts = {}) => {
  const b = _bankRuleBuild(draft, Object.assign({ newId, now: NOW }, opts));
  if (!b.ok) throw new Error('règle invalide : ' + b.errors.join(','));
  return b.rule;
};

describe('_bankLineApplyRules — classement d\'une ligne (ex-inline _bankApplyRule)', () => {
  it('trace les IDENTIFIANTS et garde le motif lisible + l\'id dans _ruleOrigin', () => {
    const r = R({ mots: ['SARAR'], compte: 'A', sens: 'cr', cat: 'Charges récupérables', qui: 'F-101' });
    const line = L('VIR SARAR SYNDIC', 150);
    expect(_bankLineApplyRules([r], line, { accountId: 'A' })).toBe(true);
    expect(line._rules).toEqual([r.id]);
    expect(line.suggestedCat).toBe('Charges récupérables');
    expect(line.suggestedQui).toBe('F-101');
    expect(line._byRule).toBe(true);
    expect(line._ruleOrigin).toMatchObject({ cat: 'SARAR', catId: r.id, aff: 'SARAR', affId: r.id });
  });
  it('règle supprimée (tombstone) ignorée', () => {
    const r = R({ mots: ['SARAR'], compte: 'A', cat: 'X' });
    const line = L('VIR SARAR', 150);
    expect(_bankLineApplyRules([_bankRuleTombstone(r, { now: NOW })], line, { accountId: 'A' })).toBe(false);
    expect(line._rules).toEqual([]);
  });
  it('règle historique INCHANGÉE : sous-chaîne, compte vide = tous les comptes ; trace = id après migration', () => {
    const rules = [{ pattern: 'EDF CLI', cat: 'Énergie' }];
    _bankMigrateRules(rules, { now: NOW });
    const line = L('PRLV EDF CLIENTS PARTICULIERS', -80);
    expect(_bankLineApplyRules(rules, line, { accountId: 'Z' })).toBe(true);
    expect(line.suggestedCat).toBe('Énergie');
    expect(line._rules).toEqual([rules[0].id]);
    // Sous-chaîne CONTIGUË : l'ordre compte toujours pour une règle historique.
    expect(_bankLineApplyRules(rules, L('PRLV CLI EDF', -80), { accountId: 'Z' })).toBe(false);
  });
  it('« le bailleur du compte » résolu depuis le compte de l\'import', () => {
    const r = R({ mots: ['ICARUS'], compte: 'A', cat: 'Honoraires', bailleurDuCompte: true });
    const line = L('ICARUS FACTURE', -50);
    _bankLineApplyRules([r], line, { accountId: 'A', account: { id: 'A', bailleur: 'SCI DUPONT' } });
    expect(line.suggestedQui).toBe('SCI:SCI DUPONT');
    expect(line._ruleOrigin.aff).toBe('le bailleur du compte');
    expect(line._ruleOrigin.affId).toBe(r.id);
  });
});

describe('_bankReclassifyPrepare — import en cours après création d\'une règle', () => {
  const rule = R({ mots: ['SARAR'], compte: 'A', sens: 'cr', cat: 'Charges récupérables', qui: 'F-101' });
  const lignes = () => [
    // 0 : la ligne SOURCE, marquée retouchée par l'ouverture de la fenêtre de règle
    L('VIR SARAR SYNDIC', 150, { suggestedCat: 'Autre', _userEdited: true, _byRule: false }),
    // 1 : classée à la main AUTREMENT → sautée ET comptée
    L('VIR SARAR TRAVAUX', 150, { date: '2026-09-20', suggestedCat: 'Travaux', suggestedQui: 'F-102', _userEdited: true }),
    // 2 : validée, déjà classée comme la règle le ferait → sautée ET comptée (elle correspond et est à la main)
    L('VIR SARAR SYNDIC OCT', 150, { date: '2026-10-01', suggestedCat: 'Charges récupérables', suggestedQui: 'F-101', _reviewed: true }),
    // 3 : classée à la main, la règle ne la touche pas (ne correspond pas) → sautée, pas comptée
    L('PRLV EDF', -80, { suggestedCat: 'Énergie', _userEdited: true }),
    // 4 : non retouchée → reclassée
    L('VIR SARAR NOV', 150, { date: '2026-11-01', suggestedCat: 'Autre', matchSource: 'proposition', _byRule: false }),
  ];

  it('la ligne SOURCE suit la règle et n\'est plus verrouillée « retouchée »', () => {
    const src = lignes();
    const p = _bankReclassifyPrepare(src, { rule, sourceIndex: 0, accountId: 'A' });
    expect(p.sourceSuit).toBe(true);
    const s = p.lines[0];
    expect(s._userEdited).toBeUndefined();
    expect(s._suitRegle).toBe(true);
    expect(s.suggestedCat).toBeUndefined();          // classement retiré : il sera refait par la règle
    // Le classement (comme _bankImportFinalizePreview) la classe par la règle.
    expect(_bankLineApplyRules([rule], s, { accountId: 'A' })).toBe(true);
    expect(s.suggestedCat).toBe('Charges récupérables');
    expect(s._userEdited).toBeUndefined();
    // Les lignes d'entrée ne sont pas modifiées (fonction pure).
    expect(src[0]._userEdited).toBe(true);
    expect(src[0].suggestedCat).toBe('Autre');
  });
  it('une ligne SOURCE validée (_reviewed) suit aussi la règle, et reste validée', () => {
    const src = [L('VIR SARAR SYNDIC', 150, { suggestedCat: 'Autre', _reviewed: true })];
    const p = _bankReclassifyPrepare(src, { rule, sourceIndex: 0, accountId: 'A' });
    expect(p.lines[0]._suitRegle).toBe(true);
    expect(p.lines[0]._reviewed).toBe(true);
  });
  it('ligne classée à la main : sautée ET comptée pour le message (si elle correspond à la règle)', () => {
    const src = lignes();
    const p = _bankReclassifyPrepare(src, { rule, sourceIndex: 0, accountId: 'A' });
    expect(p.lines[1]).toBe(src[1]);                 // intacte (même objet)
    expect(p.lines[2]).toBe(src[2]);
    expect(p.lines[3]).toBe(src[3]);
    expect(p.protegees).toBe(2);                     // lignes 1 et 2 (correspondent + classées à la main)
    // La ligne non retouchée est remise à classer.
    expect(p.lines[4].suggestedCat).toBeUndefined();
    expect(p.lines[4].matchSource).toBeUndefined();
  });
  it('ligne source qui ne correspond pas : laissée telle quelle (sourceSuit:false)', () => {
    const src = [L('PRLV EDF', -80, { suggestedCat: 'Énergie', _userEdited: true })];
    const p = _bankReclassifyPrepare(src, { rule, sourceIndex: 0, accountId: 'A' });
    expect(p.sourceSuit).toBe(false);
    expect(p.lines[0]).toBe(src[0]);
  });
  it('import d\'un AUTRE compte : la règle ne touche rien, rien n\'est compté', () => {
    const p = _bankReclassifyPrepare(lignes(), { rule, sourceIndex: 0, accountId: 'B' });
    expect(p.protegees).toBe(0);
    expect(p.sourceSuit).toBe(false);
  });
  it('après une suppression (pas de règle) : rien compté, lignes manuelles gardées', () => {
    const src = lignes();
    const p = _bankReclassifyPrepare(src, { accountId: 'A' });
    expect(p.protegees).toBe(0);
    expect(p.sourceSuit).toBe(null);
    expect(p.lines[1]).toBe(src[1]);
    expect(p.lines[0]).toBe(src[0]);                 // retouchée, et plus de règle source
  });
  it('règle supprimée passée par erreur : traitée comme absente', () => {
    const p = _bankReclassifyPrepare(lignes(), { rule: _bankRuleTombstone(rule, { now: NOW }), sourceIndex: 0, accountId: 'A' });
    expect(p.protegees).toBe(0);
    expect(p.sourceSuit).toBe(null);
  });
});

describe('Identité par id — deux règles au même motif, comptes différents', () => {
  const ra = R({ mots: ['SARAR'], compte: 'A', cat: 'Charges récupérables' });
  const rb = R({ mots: ['SARAR'], compte: 'B', cat: 'Travaux' });
  it('ouverture : la bonne règle, par son id ou par la trace du bon compte', () => {
    const rules = [ra, rb];
    expect(_bankRuleById(rules, rb.id)).toBe(rb);
    expect(_bankRuleIdxById(rules, rb.id)).toBe(1);
    // trace historique (motif) d'un mouvement du compte B → la règle de B, pas celle de A
    expect(_bankRuleFindForTrace(rules, 'SARAR', 'B')).toBe(rb);
    expect(_bankRuleFindForTrace(rules, 'SARAR', 'A')).toBe(ra);
  });
  it('suppression par id : seule la règle visée devient un tombstone, l\'autre continue de classer', () => {
    const rules = [ra, rb];
    const i = _bankRuleIdxById(rules, rb.id);
    rules[i] = _bankRuleTombstone(rules[i], { now: NOW });
    expect(rules[1]).toMatchObject({ _deleted: true, id: rb.id, compte: 'B' });
    expect(_bankRuleById(rules, rb.id)).toBe(null);
    expect(_bankRuleById(rules, ra.id)).toBe(ra);
    const la = L('VIR SARAR', 150), lb = L('VIR SARAR', 150);
    expect(_bankLineApplyRules(rules, la, { accountId: 'A' })).toBe(true);
    expect(_bankLineApplyRules(rules, lb, { accountId: 'B' })).toBe(false);
    // tombstone ignoré aussi par l'aperçu, la trace et l'usage
    expect(_bankRuleFindForTrace(rules, rb.id, 'B')).toBe(null);
    expect(_bankRuleUsage(rules[1], [{ _rules: [rb.id] }]).count).toBe(1); // trace conservée sur le mouvement…
    expect(_bankRuleApercu(rules[1], { mouvements: [] }).lignes).toEqual([]);
  });
});

describe('Doublon exact refusé', () => {
  it('même compte, mots, sens, résultat → la règle existante est renvoyée', () => {
    const r1 = R({ mots: ['EDF'], compte: 'A', sens: 'db', cat: 'Énergie' });
    const cand = R({ mots: ['edf'], compte: 'A', sens: 'db', cat: 'Énergie' });
    expect(_bankRuleExactDuplicate([r1], cand)).toBe(r1);
    // autre compte : pas un doublon
    expect(_bankRuleExactDuplicate([r1], R({ mots: ['EDF'], compte: 'B', sens: 'db', cat: 'Énergie' }))).toBe(null);
    // la règle elle-même (modification) n'est pas son propre doublon
    const edit = R({ mots: ['EDF'], compte: 'A', sens: 'db', cat: 'Énergie' }, { base: r1 });
    expect(edit.id).toBe(r1.id);
    expect(_bankRuleExactDuplicate([r1], edit)).toBe(null);
    // un doublon supprimé ne bloque pas
    expect(_bankRuleExactDuplicate([_bankRuleTombstone(r1, { now: NOW })], cand)).toBe(null);
  });
  it('compte obligatoire pour une nouvelle règle (refus clair)', () => {
    const b = _bankRuleBuild({ mots: ['EDF'], cat: 'Énergie' }, { newId, now: NOW });
    expect(b.ok).toBe(false);
    expect(b.errors).toContain('compte');
  });
});

describe('_bankRulePatchMouvement — fiche d\'un mouvement ENREGISTRÉ', () => {
  const rule = R({ mots: ['SARAR'], compte: 'A', sens: 'cr', cat: 'Charges récupérables', qui: 'F-101' });
  it('met à jour CE mouvement : catégorie, affectation, trace de l\'id ; l\'entrée n\'est pas modifiée', () => {
    const mv = { id: 7, date: '2026-09-15', lib: 'VIR SARAR SYNDIC', cr: 150, db: 0, cat: 'Autre', qui: '', _bankAccountId: 'A', _rules: ['ancien'] };
    const res = _bankRulePatchMouvement(rule, mv);
    expect(res.ok).toBe(true);
    expect(res.changed).toBe(true);
    expect(res.patch).toEqual({ cat: 'Charges récupérables', qui: 'F-101', imm: '', compteurCcId: '', _rules: ['ancien', rule.id] });
    expect(mv.cat).toBe('Autre');                    // pur : l'appelant applique
  });
  it('lui seul : un autre mouvement (autre compte, autre libellé) n\'est pas concerné', () => {
    const autreCompte = { id: 8, date: '2026-09-15', lib: 'VIR SARAR SYNDIC', cr: 150, _bankAccountId: 'B' };
    expect(_bankRulePatchMouvement(rule, autreCompte)).toMatchObject({ ok: false, raison: 'ne-correspond-pas', patch: null });
    const sansMot = { id: 9, date: '2026-09-15', lib: 'VIR SYNDIC', cr: 150, _bankAccountId: 'A' };
    expect(_bankRulePatchMouvement(rule, sansMot).ok).toBe(false);
  });
  it('déjà classé ainsi : rien à changer (changed:false)', () => {
    const mv = { id: 7, date: '2026-09-15', lib: 'VIR SARAR SYNDIC', cr: 150, cat: 'Charges récupérables', qui: 'F-101', imm: '', compteurCcId: '', _bankAccountId: 'A', _rules: [rule.id] };
    expect(_bankRulePatchMouvement(rule, mv)).toMatchObject({ ok: true, changed: false });
  });
  it('règle sans affectation : l\'affectation du mouvement n\'est pas touchée', () => {
    const r = R({ mots: ['SARAR'], compte: 'A', cat: 'Travaux' });
    const res = _bankRulePatchMouvement(r, { id: 1, date: '2026-09-15', lib: 'SARAR', cr: 4583.03, qui: 'F-103', _bankAccountId: 'A' });
    expect(res.patch).toEqual({ cat: 'Travaux', _rules: [r.id] });
  });
  it('mouvement supprimé ou règle supprimée : rien', () => {
    expect(_bankRulePatchMouvement(rule, { _deleted: true }).ok).toBe(false);
    expect(_bankRulePatchMouvement(_bankRuleTombstone(rule, { now: NOW }), { lib: 'SARAR', cr: 1, _bankAccountId: 'A' }).ok).toBe(false);
  });
});

describe('« = loyer CC » : loyer charges comprises du MOIS DU VIREMENT', () => {
  const rule = R({ mots: ['DUPONT'], compte: 'A', sens: 'cr', cat: 'Loyers encaissés', qui: 'F-101', montant: { type: 'loyerCC' } });
  // Loyer CC du logement : 680 € jusqu'en mars, 700 € à partir d'avril (révision).
  const appels = [];
  const loyerCC = (qui, ym) => { appels.push([qui, ym]); return qui !== 'F-101' ? 0 : (ym < '2026-04' ? 680 : 700); };
  it('le mois passé au fournisseur est celui de la date de la ligne', () => {
    appels.length = 0;
    expect(_bankRuleMatch(rule, L('VIR M DUPONT', 680, { date: '2026-03-03' }), 'A', { loyerCC })).toBe(true);
    expect(appels).toEqual([['F-101', '2026-03']]);
    expect(_bankRuleMatch(rule, L('VIR M DUPONT', 680, { date: '2026-04-03' }), 'A', { loyerCC })).toBe(false);
    expect(_bankRuleMatch(rule, L('VIR M DUPONT', 700, { date: '2026-04-03' }), 'A', { loyerCC })).toBe(true);
  });
  it('transmis par le classement, le reclassement, l\'aperçu et la fiche mouvement', () => {
    const line = L('VIR M DUPONT', 700, { date: '2026-04-03' });
    expect(_bankLineApplyRules([rule], line, { accountId: 'A', loyerCC })).toBe(true);
    expect(_bankLineApplyRules([rule], L('VIR M DUPONT', 700, { date: '2026-04-03' }), { accountId: 'A' })).toBe(false);
    const p = _bankReclassifyPrepare([L('VIR M DUPONT', 680, { date: '2026-03-03', _userEdited: true, suggestedCat: 'Autre' })],
      { rule, accountId: 'A', loyerCC });
    expect(p.protegees).toBe(1);
    const ap = _bankRuleApercu(rule, { importLines: [L('VIR M DUPONT', 680, { date: '2026-03-03' })], accountId: 'A', loyerCC });
    expect(ap.lignes.length).toBe(1);
    const mv = { id: 1, date: '2026-03-03', lib: 'VIR M DUPONT', cr: 680, _bankAccountId: 'A' };
    expect(_bankRulePatchMouvement(rule, mv, { loyerCC }).ok).toBe(true);
    expect(_bankRulePatchMouvement(rule, Object.assign({}, mv, { cr: 700 }), { loyerCC }).ok).toBe(false);
  });
});

describe('Migration au démarrage : idempotente', () => {
  it('un seul passage attribue les id ; le second ne change rien (pas de stamp, pas de sauvegarde)', () => {
    const rules = [{ pattern: 'EDF', cat: 'Énergie' }, { pattern: 'SARAR', compte: 'A', cat: 'X' },
      { _deleted: true, pattern: 'VIEUX' }];
    const r1 = _bankMigrateRules(rules, { now: NOW });
    expect(r1.migrated).toBe(2);
    const snap = JSON.stringify(rules);
    const r2 = _bankMigrateRules(rules, { now: '2027-01-01T00:00:00.000Z' });
    expect(r2.migrated).toBe(0);
    expect(JSON.stringify(rules)).toBe(snap);
    expect(rules[0].compteAChoisir).toBe(true);     // règle historique sans compte : signalée, active
    expect(rules[1].compteAChoisir).toBeUndefined();
    expect(rules[2].id).toBeUndefined();            // tombstone laissé tel quel
    // la règle historique migrée garde son comportement
    expect(_bankRuleMatch(rules[0], L('PRLV EDF', -1), 'nimporte')).toBe(true);
  });
  it('deux appareils qui migrent la même base obtiennent les mêmes id', () => {
    const a = [{ pattern: 'EDF', cat: 'Énergie' }], b = [{ pattern: 'EDF', cat: 'Énergie' }];
    _bankMigrateRules(a, { now: NOW }); _bankMigrateRules(b, { now: '2027-01-01T00:00:00.000Z' });
    expect(a[0].id).toBe(b[0].id);
  });
});

describe('_bankRuleMotsDuChamp — champ motif (avant les puces de la phase 6)', () => {
  it('mot cliqué = mot entier, mot tapé = morceau de mot ; rien n\'est deviné', () => {
    expect(_bankRuleMotsDuChamp('SARAR elec', ['sarar'])).toEqual({ mots: ['SARAR'], motsLibres: ['elec'] });
    expect(_bankRuleMotsDuChamp('', ['SARAR'])).toEqual({ mots: [], motsLibres: [] });
    expect(_bankRuleMotsDuChamp('  EDF  edf  Électricité ', [])).toEqual({ mots: [], motsLibres: ['EDF', 'Électricité'] });
  });
  it('construit une règle refondue : « ELEC » tapé attrape ELECTRICITE, mot cliqué exige le mot entier', () => {
    const mm = _bankRuleMotsDuChamp('EDF ELEC', ['EDF']);
    const r = R(Object.assign({ compte: 'A', cat: 'Énergie' }, mm));
    expect(_bankRuleMatch(r, L('PRLV EDF ELECTRICITE', -80), 'A')).toBe(true);
    expect(_bankRuleMatch(r, L('PRLV EDFX ELECTRICITE', -80), 'A')).toBe(false);
  });
});

describe('_bankRuleUsage — traces par id, traces historiques du même compte', () => {
  it('compte la trace par id et la trace historique (motif) du même compte uniquement', () => {
    const r = R({ mots: ['SARAR'], compte: 'A', cat: 'X' });
    const mvs = [
      { date: '2026-09-01', _rules: [r.id], _bankAccountId: 'A' },
      { date: '2026-09-10', _rules: ['sarar'], _bankAccountId: 'A' },
      { date: '2026-09-20', _rules: ['SARAR'], _bankAccountId: 'B' },   // autre compte : pas elle
      { date: '2026-09-30', _rules: [r.id], _deleted: true },
    ];
    expect(_bankRuleUsage(r, mvs)).toEqual({ count: 2, lastDate: '2026-09-10' });
  });
  it('_bankRuleTraceKey : id, à défaut motif', () => {
    expect(_bankRuleTraceKey({ id: 'rg_1', pattern: 'X' })).toBe('rg_1');
    expect(_bankRuleTraceKey({ pattern: 'X' })).toBe('X');
    expect(_bankRuleTraceKey(null)).toBe('');
  });
});

describe('Écritures de catégorie sur les règles : stampées', () => {
  it('normalisation des loyers : la règle renommée reçoit un _modifiedAt', () => {
    const db = { importRules: [{ id: 'rg_1', pattern: 'DUPONT', cat: 'Loyers' }, { id: 'rg_2', pattern: 'EDF', cat: 'Énergie' }] };
    normaliserDonneesLoyers(db, { stamp: o => { o._modifiedAt = NOW; return o; } });
    expect(db.importRules[0]).toMatchObject({ cat: 'Loyers encaissés', _modifiedAt: NOW });
    expect(db.importRules[1]._modifiedAt).toBeUndefined();   // pas touchée, pas stampée
  });
});

// ─── Gardes de source : le branchement de l'app (js/app/app-part*.js) ──────────────────────────
describe('Branchement app (gardes de source)', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const src = ['app-part1.js', 'app-part2.js', 'app-part3.js']
    .map(f => fs.readFileSync(path.join(root, 'js', 'app', f), 'utf8')).join('\n');
  it('plus aucune recherche de règle par motif, plus de motif deviné', () => {
    expect(src).not.toMatch(/function _bankRuleIdxOf\b/);
    expect(src).not.toMatch(/_bankRuleIdxOf\(/);
    expect(src).not.toMatch(/function _bankSuggestPattern\b/);
    expect(src).not.toMatch(/importRules \|\| \[\]\)\.findIndex\(r => r && !r\._deleted && String\(r\.pattern/);
    expect(src).not.toMatch(/_tombstoneObj\(\{ pattern: r\.pattern \}\)/);
  });
  it('les identifiants de règle passent par data-rid, jamais injectés dans onclick', () => {
    expect(src).not.toMatch(/_bankRuleOpen\(' \+ (idx|r\.id)/);
    expect(src).toMatch(/onclick="_bankRuleOpen\(this\.dataset\.rid\)"/);
  });
  it('migration au démarrage, à l\'hydratation, à la restauration et à l\'import JSON', () => {
    expect(src).toMatch(/function _bankMigrerRegles\(source, db\) \{[\s\S]{0,300}window\._bankMigrateRules\(d\.importRules\)/);
    for (const s of ["_bankMigrerRegles('initDB')", "_bankMigrerRegles('hydratation')",
      "_bankMigrerRegles('restauration')", "_bankMigrerRegles('import JSON', data)"]) expect(src).toContain(s);
    // saveDB à l'hydratation seulement si une règle a changé (pas de boucle de synchro)
    expect(src).toMatch(/\(_mr && _mr\.migrated\)\) \{\s*saveDB\(\);/);
  });
  it('la fermeture de l\'import remet à zéro le compte courant (D6)', () => {
    expect(src).toMatch(/if \(id === 'ov-bank-import' && typeof _bankImportOnClose === 'function'\)/);
    // window.closeM (module components/modal.js) enveloppé à l'ouverture de l'import
    expect(src).toMatch(/window\.closeM = function \(id\) \{\s*orig\.apply\(this, arguments\);\s*if \(id === 'ov-bank-import'\) \{ try \{ _bankImportOnClose\(\);/);
    expect((src.match(/_bankInstallCloseHook\(\);\s+\/\/ REGLES-REFONTE phase 4 \(D6\)[^\n]*\n\s*openM\('ov-bank-import'\)/g) || []).length).toBe(2);
    expect(src).toMatch(/function _bankImportOnClose\(\) \{\s*_currentBankAccount = null;/);
  });
  it('migrations de catégorie d\'initDB : la règle modifiée est stampée', () => {
    expect(src).toContain("if (r && r.cat === 'Prêt') { r.cat = _NN; _stamp(r); }");
    expect(src).toContain('if (r && _CAT_MIGRATION[r.cat]) { r.cat = _CAT_MIGRATION[r.cat]; _stamp(r); }');
  });
  it('condition « = loyer CC » : le résolveur unique du dû du mois (_duMoisLot), aucun calcul réécrit', () => {
    expect(src).toMatch(/function _bankLoyerCC\(qui, ym\) \{[\s\S]{0,200}_duMoisLot\(qui, ym\)/);
  });
});


describe('Règle -> ligne : une règle n\'efface JAMAIS un champ qu\'elle ne définit pas', () => {
  const catSeule = R({ mots: ['SARAR'], compte: 'A', cat: 'Charges récupérables' });
  const affSeule = R({ mots: ['SARAR'], compte: 'A', qui: 'F-101' });
  const avecAff = R({ mots: ['SARAR'], compte: 'A', cat: 'Travaux', qui: 'F-102' });
  const ligne = () => L('VIR SARAR', 150, { suggestedCat: 'Autre', suggestedQui: 'F-205', suggestedImm: 'Les Tilleuls', suggestedCc: '' });

  it('règle catégorie seule : la catégorie change, l\'affectation de la ligne reste', () => {
    const l = ligne();
    expect(_bankLineApplyRules([catSeule], l, { accountId: 'A' })).toBe(true);
    expect(l.suggestedCat).toBe('Charges récupérables');
    expect(l.suggestedQui).toBe('F-205');
    expect(l.suggestedImm).toBe('Les Tilleuls');
  });
  it('règle affectation seule : l\'affectation change, la catégorie de la ligne reste', () => {
    const l = ligne();
    _bankLineApplyRules([affSeule], l, { accountId: 'A' });
    expect(l.suggestedQui).toBe('F-101');
    expect(l.suggestedCat).toBe('Autre');
  });
  it('règle avec catégorie ET affectation : les deux sont appliquées', () => {
    const l = ligne();
    _bankLineApplyRules([avecAff], l, { accountId: 'A' });
    expect(l.suggestedCat).toBe('Travaux');
    expect(l.suggestedQui).toBe('F-102');
  });
  it('règle « bailleur du compte » non résolvable (compte mixte) : rien n\'est effacé', () => {
    const r = R({ mots: ['SARAR'], compte: 'A', cat: 'Travaux', bailleurDuCompte: true });
    const l = ligne();
    _bankLineApplyRules([r], l, { accountId: 'A', account: { mixte: true } });
    expect(l.suggestedQui).toBe('F-205');
  });
  it('règle HISTORIQUE (pattern seul) : comportement inchangé, le champ non défini est remis à vide', () => {
    const rules = [{ pattern: 'SARAR', cat: 'Charges récupérables' }];
    _bankMigrateRules(rules, { now: NOW });
    const l = ligne();
    _bankLineApplyRules(rules, l, { accountId: 'A' });
    expect(l.suggestedCat).toBe('Charges récupérables');
    expect(l.suggestedQui).toBe('');
    expect(l.suggestedImm).toBe('');
  });
  it('reclassement : ligne SOURCE suivant une règle catégorie seule garde son affectation', () => {
    const src = [L('VIR SARAR', 150, { suggestedCat: 'Autre', suggestedQui: 'F-205', suggestedImm: 'Les Tilleuls', _userEdited: true })];
    const p = _bankReclassifyPrepare(src, { rule: catSeule, sourceIndex: 0, accountId: 'A' });
    expect(p.lines[0].suggestedQui).toBe('F-205');
    expect(p.lines[0].suggestedCat).toBeUndefined();         // la catégorie sera posée par la règle
    _bankLineApplyRules([catSeule], p.lines[0], { accountId: 'A' });
    expect(p.lines[0].suggestedCat).toBe('Charges récupérables');
    expect(p.lines[0].suggestedQui).toBe('F-205');
  });
  it('reclassement : ligne SOURCE avec une règle qui porte l\'affectation : celle de la règle gagne', () => {
    const src = [L('VIR SARAR', 150, { suggestedCat: 'Autre', suggestedQui: 'F-205', _userEdited: true })];
    const p = _bankReclassifyPrepare(src, { rule: avecAff, sourceIndex: 0, accountId: 'A' });
    _bankLineApplyRules([avecAff], p.lines[0], { accountId: 'A' });
    expect(p.lines[0].suggestedQui).toBe('F-102');
    expect(p.lines[0].suggestedCat).toBe('Travaux');
  });
  it('fiche mouvement : une règle catégorie seule ne vide pas le logement du mouvement', () => {
    const mv = { id: 1, date: '2026-09-15', lib: 'VIR SARAR', cr: 150, cat: 'Autre', qui: 'F-205', imm: 'Les Tilleuls', _bankAccountId: 'A' };
    const res = _bankRulePatchMouvement(catSeule, mv, {});
    expect(res.patch.cat).toBe('Charges récupérables');
    expect('qui' in res.patch).toBe(false);
    expect('imm' in res.patch).toBe(false);
  });
});

describe('Message de reclassement : lignes qui correspondent ET déjà classées à la main', () => {
  const r = R({ mots: ['SARAR'], compte: 'A', cat: 'Charges récupérables' });
  it('compte toute ligne qui correspond et est _userEdited / _reviewed, quel que soit son classement', () => {
    const src = [
      L('VIR SARAR 1', 150, { suggestedCat: 'Charges récupérables', _reviewed: true }),   // même classement : comptée
      L('VIR SARAR 2', 150, { suggestedCat: 'Travaux', _userEdited: true }),
      L('PRLV EDF', -80, { suggestedCat: 'Énergie', _userEdited: true }),                // ne correspond pas
      L('VIR SARAR 3', 150),                                                             // non classée à la main
    ];
    const p = _bankReclassifyPrepare(src, { rule: r, accountId: 'A' });
    expect(p.protegees).toBe(2);
    expect(p.lines[1]).toBe(src[1]);
  });
  it('aucune ligne à la main qui correspond : 0 (aucun message)', () => {
    const p = _bankReclassifyPrepare([L('VIR SARAR 3', 150)], { rule: r, accountId: 'A' });
    expect(p.protegees).toBe(0);
  });
  it('le texte affiché est la phrase courte, au singulier et au pluriel', () => {
    const SRC = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../js/app/app-part2.js'), 'utf8');
    expect(SRC).toContain("' lignes déjà classées à la main laissées telles quelles'");
    expect(SRC).toContain("' ligne déjà classée à la main laissée telle quelle'");
  });
});

describe('Ligne / mouvement -> règle : pré-remplissage (_bankRulePrefill)', () => {
  it('reprend catégorie + logement + immeuble d\'un mouvement', () => {
    expect(_bankRulePrefill({ cat: 'Charges récupérables', qui: 'F-101', imm: 'Les Tilleuls' }))
      .toEqual({ cat: 'Charges récupérables', qui: 'F-101', imm: 'Les Tilleuls', cc: '' });
  });
  it('reprend une SCI, ou un compteur (le compteur l\'emporte sur le logement)', () => {
    expect(_bankRulePrefill({ cat: 'X', qui: 'SCI:Dupont' }).qui).toBe('SCI:Dupont');
    const p = _bankRulePrefill({ qui: 'F-101', compteurCcId: 'cc1', imm: 'Im' });
    expect(p).toEqual({ cat: '', qui: '', imm: 'Im', cc: 'cc1' });
  });
  it('rien de classé / entrée absente : tout vide', () => {
    expect(_bankRulePrefill(null)).toEqual({ cat: '', qui: '', imm: '', cc: '' });
    expect(_bankRulePrefill({})).toEqual({ cat: '', qui: '', imm: '', cc: '' });
  });
  it('branché dans la fenêtre de règle pour la ligne ET le mouvement', () => {
    const SRC = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../js/app/app-part2.js'), 'utf8');
    expect(SRC).toMatch(/window\._bankRulePrefill\(line\s*\r?\n?\s*\? \{ cat: line\.suggestedCat/);
    expect(SRC).toMatch(/mv \? \{ cat: mv\.cat, qui: mv\.qui, imm: mv\.imm, compteurCcId: mv\.compteurCcId \}/);
  });
});
