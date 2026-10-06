/**
 * bank-regles-interface.test.js — REGLES-REFONTE phase 6a : INTERFACE de la fenêtre de règle.
 * Sujet : docs/subjects/RETOURS-2026-10-05.md (lot D + « Décisions Didier du 06/10 »).
 *
 * Logique pure testée : puce libre « + mot » (diagnostic en direct), condition de montant saisie,
 * cases de l'aperçu (décocher = exception, y compris le cas SARAR 4 583,03 € au réimport),
 * actions de l'alerte « natures différentes », statut de la pastille « ✓ Règle enregistrée ».
 * Le branchement (js/app/app-part*.js, css/main.css) est vérifié par les gardes de source en fin de fichier.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  _bankRuleBuild, _bankRuleApercu, _bankRuleMatch, _bankRuleAddException, _bankRuleRemoveException,
  _bankRuleLineKey, _bankMotsDuLibelle, _bankLineApplyRules, _bankReclassifyPrepare,
  _bankRuleMontantDepuisSaisie, _bankMotSaisiDiagnostic, _bankRuleExceptionsApresCase,
  _bankRuleExceptionPortee, _bankRuleSuggestions, _bankRuleStatutLigne,
} from '../../js/core/bank-import.js';

const NOW = '2026-10-06T10:00:00.000Z';
let _n = 0;
const newId = () => 'rg_ui_' + (++_n);
const L = (libelle, montant, extra = {}) => Object.assign({
  libelle, date: '2026-09-15', credit: montant > 0 ? montant : 0, debit: montant < 0 ? -montant : 0,
  _fingerprint: 'fp|' + libelle + '|' + montant,
}, extra);
const R = (draft, opts = {}) => {
  const b = _bankRuleBuild(draft, Object.assign({ newId, now: NOW }, opts));
  if (!b.ok) throw new Error('règle invalide : ' + b.errors.join(','));
  return b.rule;
};

describe('_bankRuleMontantDepuisSaisie — condition de montant de la fenêtre', () => {
  it('aucune condition', () => {
    expect(_bankRuleMontantDepuisSaisie({ type: 'none' })).toEqual({ montant: null, aucune: true, invalide: false });
    expect(_bankRuleMontantDepuisSaisie(null).aucune).toBe(true);
  });
  it('= loyer CC du mois', () => {
    expect(_bankRuleMontantDepuisSaisie({ type: 'loyerCC' }).montant).toEqual({ type: 'loyerCC' });
  });
  it('montant exact : « 150,00 » et « 1 234,50 » lus, signe ignoré', () => {
    expect(_bankRuleMontantDepuisSaisie({ type: 'exact', valeur: '150,00' }).montant).toEqual({ type: 'exact', valeur: 150 });
    expect(_bankRuleMontantDepuisSaisie({ type: 'exact', valeur: '1 234,50 €' }).montant).toEqual({ type: 'exact', valeur: 1234.5 });
    expect(_bankRuleMontantDepuisSaisie({ type: 'exact', valeur: '-4583,03' }).montant).toEqual({ type: 'exact', valeur: 4583.03 });
  });
  it('montant exact vide, nul ou illisible : invalide (rien n\'est corrigé en silence)', () => {
    for (const v of ['', '0', '0,00', 'abc', '12x']) {
      const r = _bankRuleMontantDepuisSaisie({ type: 'exact', valeur: v });
      expect(r.invalide, JSON.stringify(v)).toBe(true);
      expect(r.montant).toBeNull();
    }
  });
  it('plage : deux bornes, ou une seule ; min > max ou deux champs vides = invalide', () => {
    expect(_bankRuleMontantDepuisSaisie({ type: 'plage', min: '140', max: '160,50' }).montant).toEqual({ type: 'plage', min: 140, max: 160.5 });
    expect(_bankRuleMontantDepuisSaisie({ type: 'plage', min: '140', max: '' }).montant).toEqual({ type: 'plage', min: 140, max: null });
    expect(_bankRuleMontantDepuisSaisie({ type: 'plage', min: '', max: '99' }).montant).toEqual({ type: 'plage', min: null, max: 99 });
    expect(_bankRuleMontantDepuisSaisie({ type: 'plage', min: '200', max: '100' }).invalide).toBe(true);
    expect(_bankRuleMontantDepuisSaisie({ type: 'plage', min: '', max: '' }).invalide).toBe(true);
    expect(_bankRuleMontantDepuisSaisie({ type: 'plage', min: 'x', max: '100' }).invalide).toBe(true);
  });
  it('la condition saisie passe telle quelle dans la règle construite et dans l\'aperçu', () => {
    const m = _bankRuleMontantDepuisSaisie({ type: 'plage', min: '140', max: '160' }).montant;
    const r = R({ mots: ['SARAR'], compte: 'A', montant: m });
    expect(_bankRuleMatch(r, L('VIR SARAR', -150), 'A')).toBe(true);
    expect(_bankRuleMatch(r, L('VIR SARAR', -4583.03), 'A')).toBe(false);
  });
});

describe('_bankMotSaisiDiagnostic — retour en direct de la puce « + mot »', () => {
  const ctx = { motsLibelle: ['VIR', 'PRLV', 'ELECTRICITE', 'SARAR'], saisis: ['PROVIS'], puces: ['SARAR'] };
  it('vide / espace / doublon / déjà une puce : non ajoutable, avec le bon état', () => {
    expect(_bankMotSaisiDiagnostic('', ctx)).toMatchObject({ etat: 'vide', ajoutable: false });
    expect(_bankMotSaisiDiagnostic('   ', ctx).etat).toBe('vide');
    expect(_bankMotSaisiDiagnostic('EL EC', ctx)).toMatchObject({ etat: 'espace', ajoutable: false });
    expect(_bankMotSaisiDiagnostic('provis', ctx)).toMatchObject({ etat: 'doublon', ajoutable: false });
    expect(_bankMotSaisiDiagnostic('Sarar', ctx)).toMatchObject({ etat: 'puce', ajoutable: false });
  });
  it('un morceau présent dans le libellé de départ : « ELEC » trouvé dans ELECTRICITE (accents et casse ignorés)', () => {
    expect(_bankMotSaisiDiagnostic('elec', ctx)).toMatchObject({ etat: 'present', ajoutable: true, trouveDans: 'ELECTRICITE' });
    expect(_bankMotSaisiDiagnostic('électr', ctx)).toMatchObject({ etat: 'present', trouveDans: 'ELECTRICITE' });
  });
  it('absent du libellé de départ : ajoutable, mais signalé (la ligne de départ ne suivrait plus la règle)', () => {
    expect(_bankMotSaisiDiagnostic('GAZ', ctx)).toMatchObject({ etat: 'absent', ajoutable: true, trouveDans: '' });
  });
  it('sans libellé de départ (création à froid sans référence) : tout mot propre est ajoutable', () => {
    expect(_bankMotSaisiDiagnostic('EDF', {})).toMatchObject({ etat: 'absent', ajoutable: true });
  });
});

describe('Cases de l\'aperçu — décocher = exception ; le cas SARAR 4 583,03 €', () => {
  const P = 'VIR PERM SARAR SYNDIC FERRETTE PROVISION CHARGES';
  const ligne = (lib, m, extra) => L(lib, m, extra);
  const IMPORT = [
    ligne(P + ' OCT 2026', -150),
    ligne(P + ' SEP 2026', -150),
    ligne('VIR SARAR SYNDIC FACTURE TRAVAUX PEINTURE PALIERS FERRETTE', -4583.03),
    ligne('VIR SARAR SYNDIC REMBT TROP PERCU CHARGES 2025', 212.4),
  ];
  const ctxApercu = { importLines: IMPORT, mouvements: [], accountId: 'A', sourceIndex: 0 };
  const draft = (extra = {}) => Object.assign({ mots: ['SARAR', 'SYNDIC'], compte: 'A', sens: 'db', cat: 'Charges récupérables' }, extra);

  it('la case décochée de SARAR 4 583,03 € devient une exception de la règle (clé = empreinte)', () => {
    const ex = _bankRuleExceptionsApresCase([], IMPORT[2], false, { now: NOW });
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ cle: _bankRuleLineKey(IMPORT[2]), montant: 4583.03, sens: 'db' });
    const r = R(draft({ exceptions: ex }));
    expect(r.exceptions).toHaveLength(1);
  });
  it('aperçu : la ligne exception reste listée, décochée ; la ligne source reste cochée et verrouillée', () => {
    const ex = _bankRuleExceptionsApresCase([], IMPORT[2], false, { now: NOW });
    const ap = _bankRuleApercu(R(draft({ exceptions: ex })), ctxApercu);
    const sarar = ap.lignes.find(x => x.index === 2);
    expect(sarar).toMatchObject({ coche: false, verrouille: false });
    const src = ap.lignes.find(x => x.source);
    expect(src).toMatchObject({ index: 0, coche: true, verrouille: true });
    expect(ap.nCochees).toBe(2);
  });
  it('recocher retire l\'exception ; recocher deux fois / décocher deux fois ne double rien', () => {
    let ex = _bankRuleExceptionsApresCase([], IMPORT[2], false, { now: NOW });
    ex = _bankRuleExceptionsApresCase(ex, IMPORT[2], false, { now: NOW });
    expect(ex).toHaveLength(1);
    ex = _bankRuleExceptionsApresCase(ex, IMPORT[2], true, { now: NOW });
    expect(ex).toHaveLength(0);
    expect(_bankRuleExceptionsApresCase(ex, IMPORT[2], true)).toEqual([]);
  });
  it('l\'entrée n\'est pas modifiée', () => {
    const avant = [];
    _bankRuleExceptionsApresCase(avant, IMPORT[2], false, { now: NOW });
    expect(avant).toEqual([]);
  });
  it('à l\'enregistrement : la ligne exception n\'est PAS reclassée, les autres le sont', () => {
    const ex = _bankRuleExceptionsApresCase([], IMPORT[2], false, { now: NOW });
    const r = R(draft({ exceptions: ex }));
    const prep = _bankReclassifyPrepare(IMPORT.map(l => Object.assign({}, l)), { rule: r, sourceIndex: 0, accountId: 'A' });
    const classe = prep.lines.map(l => { _bankLineApplyRules([r], l, { accountId: 'A' }); return !!l._byRule; });
    expect(classe).toEqual([true, true, false, false]);   // rembt (recette) : sens dépense ; SARAR 4 583,03 : exception
  });
  it('au RÉIMPORT du même relevé : la ligne reste hors règle (même empreinte)', () => {
    const ex = _bankRuleExceptionsApresCase([], IMPORT[2], false, { now: NOW });
    const r = R(draft({ exceptions: ex }));
    const reimport = L('VIR SARAR SYNDIC FACTURE TRAVAUX PEINTURE PALIERS FERRETTE', -4583.03);   // nouvelle lecture, même empreinte
    expect(_bankRuleMatch(r, reimport, 'A')).toBe(false);
    const autre = L('VIR SARAR SYNDIC FACTURE TRAVAUX PEINTURE PALIERS FERRETTE', -4583.04);
    expect(_bankRuleMatch(r, autre, 'A')).toBe(true);
  });
  it('supprimer une exception la rend à la règle, sans rien reclasser dans les mouvements en base', () => {
    const ex = _bankRuleExceptionsApresCase([], IMPORT[2], false, { now: NOW });
    const r = R(draft({ exceptions: ex }));
    const r2 = _bankRuleRemoveException(r, ex[0].cle, { now: NOW });
    expect(r2.exceptions).toEqual([]);
    const mv = { id: 1, lib: IMPORT[2].libelle, db: 4583.03, cr: 0, date: '2026-09-15', _bankAccountId: 'A', _fingerprint: IMPORT[2]._fingerprint, cat: 'Travaux' };
    const avant = JSON.stringify(mv);
    _bankRuleApercu(r2, { mouvements: [mv], accountId: 'A' });
    expect(JSON.stringify(mv)).toBe(avant);
  });
  it('exception posée puis ligne sortie du motif : l\'exception ne porte plus sur la règle', () => {
    const ex = _bankRuleExceptionsApresCase([], IMPORT[2], false, { now: NOW });
    const large = R(draft({ mots: ['SARAR'], exceptions: ex }));
    expect(_bankRuleExceptionPortee(large, ex[0])).toBe(true);
    const serre = R(draft({ mots: ['SARAR', 'PROVISION'], exceptions: ex }));
    expect(_bankRuleExceptionPortee(serre, ex[0])).toBe(false);
  });
});

describe('_bankRuleSuggestions — actions de l\'alerte « natures différentes »', () => {
  const P = 'VIR PERM SARAR SYNDIC FERRETTE PROVISION CHARGES';
  const src = L(P + ' OCT 2026', -150, { suggestedCat: 'Charges récupérables' });
  const IMPORT = [
    src,
    L('VIR SARAR SYNDIC FACTURE TRAVAUX PEINTURE PALIERS FERRETTE', -4583.03, { suggestedCat: 'Travaux' }),
    L('VIR SARAR SYNDIC REMBT TROP PERCU CHARGES 2025', 212.4, { suggestedCat: 'Charges récupérables' }),
  ];
  const ctx = { importLines: IMPORT, mouvements: [], accountId: 'A', sourceIndex: 0, motsLibelle: _bankMotsDuLibelle(src.libelle) };
  it('propose le mot du libellé qui sépare les natures (PROVISION)', () => {
    const r = R({ mots: ['SARAR'], compte: 'A', sens: 'db' });
    const s = _bankRuleSuggestions(r, ctx);
    expect(s.mot).toBe('PROVISION');
    const apres = R({ mots: ['SARAR', s.mot], compte: 'A', sens: 'db' });
    expect(_bankRuleApercu(apres, ctx).mixed).toBe(false);
  });
  it('propose de fixer le sens quand la règle attrape dépenses ET recettes', () => {
    const r = R({ mots: ['SARAR', 'SYNDIC'], compte: 'A', sens: '' });
    expect(_bankRuleSuggestions(r, ctx).sens).toBe('db');
  });
  it('rien à proposer quand les lignes sont homogènes', () => {
    const r = R({ mots: ['PROVISION'], compte: 'A', sens: 'db' });
    expect(_bankRuleSuggestions(r, ctx)).toEqual({ mot: '', sens: '' });
  });
  it('sans ligne source (création à froid) : pas de mot proposé', () => {
    const r = R({ mots: ['SARAR'], compte: 'A', sens: 'db' });
    const s = _bankRuleSuggestions(r, { importLines: IMPORT, mouvements: [], accountId: 'A', motsLibelle: ctx.motsLibelle });
    expect(s.mot).toBe('');
  });
});

describe('_bankRuleStatutLigne — la pastille « ✓ Règle enregistrée »', () => {
  const ligne = L('VIR PERM SARAR SYNDIC FERRETTE PROVISION CHARGES OCT 2026', -150);
  const base = { compte: 'A', sens: 'db', cat: 'Charges récupérables' };
  it('aucune règle : bouton « Mémoriser la règle »', () => {
    expect(_bankRuleStatutLigne([], ligne, 'A').etat).toBe('aucune');
    expect(_bankRuleStatutLigne(null, ligne, 'A').etat).toBe('aucune');
  });
  it('une règle du même compte la couvre : enregistrée (avec la règle, pour « Modifier »)', () => {
    const r = R(Object.assign({ mots: ['SARAR', 'SYNDIC'] }, base));
    const s = _bankRuleStatutLigne([r], ligne, 'A');
    expect(s.etat).toBe('enregistree');
    expect(s.regles.map(x => x.id)).toEqual([r.id]);
  });
  it('la règle d\'un AUTRE compte ne couvre pas la ligne', () => {
    const r = R(Object.assign({ mots: ['SARAR'] }, base, { compte: 'B' }));
    expect(_bankRuleStatutLigne([r], ligne, 'A').etat).toBe('aucune');
  });
  it('règle supprimée ignorée', () => {
    const r = R(Object.assign({ mots: ['SARAR'] }, base));
    expect(_bankRuleStatutLigne([{ _deleted: true, id: r.id, pattern: 'SARAR' }], ligne, 'A').etat).toBe('aucune');
  });
  it('règle historique (motif seul) : reconnue aussi', () => {
    expect(_bankRuleStatutLigne([{ id: 'h1', pattern: 'SARAR SYNDIC', sens: 'db', compte: 'A' }], ligne, 'A').etat).toBe('enregistree');
  });
  it('ligne sortie de la règle (exception) : état exception, avec la règle pour « Réintégrer »', () => {
    const r0 = R(Object.assign({ mots: ['SARAR', 'SYNDIC'] }, base));
    const r = _bankRuleAddException(r0, ligne, { now: NOW });
    const s = _bankRuleStatutLigne([r], ligne, 'A');
    expect(s.etat).toBe('exception');
    expect(s.exceptions.map(x => x.id)).toEqual([r.id]);
    expect(s.regles).toEqual([]);
  });
  it('une exception sur une AUTRE ligne n\'affecte pas celle-ci', () => {
    const r0 = R(Object.assign({ mots: ['SARAR', 'SYNDIC'] }, base));
    const r = _bankRuleAddException(r0, L('VIR SARAR SYNDIC AUTRE', -9), { now: NOW });
    expect(_bankRuleStatutLigne([r], ligne, 'A').etat).toBe('enregistree');
  });
  it('deux règles de même résultat, l\'une incluse dans l\'autre : doublon', () => {
    const a = R(Object.assign({ mots: ['SARAR'] }, base));
    const b = R(Object.assign({ mots: ['SARAR', 'SYNDIC'] }, base));
    const s = _bankRuleStatutLigne([a, b], ligne, 'A');
    expect(s.etat).toBe('doublon');
    expect(s.regles).toHaveLength(2);
  });
  it('deux règles aux résultats différents : pas un doublon (le conflit se traite à l\'import)', () => {
    const a = R(Object.assign({ mots: ['SARAR'] }, base));
    const b = R(Object.assign({ mots: ['SARAR', 'SYNDIC'] }, base, { cat: 'Travaux' }));
    expect(_bankRuleStatutLigne([a, b], ligne, 'A').etat).toBe('enregistree');
  });
  it('fiche d\'un mouvement enregistré (forme {lib, cr, db}) : même verdict', () => {
    const r = R(Object.assign({ mots: ['SARAR'] }, base));
    const mv = { id: 9, date: '2026-10-05', lib: ligne.libelle, db: 150, cr: 0, _bankAccountId: 'A' };
    expect(_bankRuleStatutLigne([r], mv, mv._bankAccountId).etat).toBe('enregistree');
    expect(_bankRuleStatutLigne([r], mv, 'B').etat).toBe('aucune');
  });
  it('condition « = loyer CC » : évaluée avec le loyer fourni (pas de règle qui élargit en silence)', () => {
    const r = R({ mots: ['LOYER'], compte: 'A', sens: 'cr', qui: 'F-101', montant: { type: 'loyerCC' } });
    const l = L('VIR LOYER DUPONT', 680);
    expect(_bankRuleStatutLigne([r], l, 'A', { loyerCC: () => 680 }).etat).toBe('enregistree');
    expect(_bankRuleStatutLigne([r], l, 'A', { loyerCC: () => 700 }).etat).toBe('aucune');
    expect(_bankRuleStatutLigne([r], l, 'A').etat).toBe('aucune');
  });
});

// ── Gardes de source : branchement de l'interface (js/app/app-part2.js, app-part1.js, css/main.css) ──
const __dir = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.resolve(__dir, '../..', f), 'utf8');
const P2 = read('js/app/app-part2.js');
const P1 = read('js/app/app-part1.js');
const CSS = read('css/main.css');
const bloc = (src, debut, fin) => { const i = src.indexOf(debut); const j = src.indexOf(fin, i + 1); return i >= 0 && j > i ? src.slice(i, j) : ''; };

describe('Branchement de l\'interface (gardes de source)', () => {
  const fen = bloc(P2, 'function _bankRuleRender()', 'function _bankRuleErrMsg');
  it('le champ texte « motif » et les boutons de mots de la phase 4 ont disparu au profit des puces', () => {
    expect(fen).not.toContain('bank-rule-pat');
    expect(fen).not.toContain('_bankRuleToggleMot');
    expect(fen).toContain('brg-chip');
    expect(P2).toContain('_bankMotSaisiDiagnostic');
  });
  it('aucune donnée du libellé ni identifiant dans le code d\'un onclick de la fenêtre de règle', () => {
    const zone = bloc(P2, 'function _bankRuleRender()', 'function _bankRuleSave()');
    const handlers = zone.match(/on(?:click|change|input|keydown)="[^"]*"/g) || [];
    for (const h of handlers) {
      expect(h, h).not.toMatch(/\$\{|\+\s*(?:escHtml|d\.|w\b|x\.|r\.|a\.)/);
    }
  });
  it('l\'aperçu a des cases décochables qui mémorisent des exceptions', () => {
    expect(P2).toContain('_bankRuleExceptionsApresCase');
    expect(P2).toContain('brg-cb');
  });
  it('la condition de montant est branchée (module pur)', () => {
    expect(P2).toContain('_bankRuleMontantDepuisSaisie');
  });
  it('la pastille remplace « Mémoriser la règle » (ligne d\'import ET fiche mouvement)', () => {
    expect(P2).toContain('_bankRuleStatutLigne');
    expect(P1).toContain('_bankRuleStatutHtml');
    expect(P2).toContain('Règle enregistrée');
  });
  it('les styles vivent dans css/main.css, sans hex en dur', () => {
    const regles = CSS.match(/\.brg-[^{]*\{[^}]*\}/g) || [];
    expect(regles.length).toBeGreaterThan(20);
    for (const r of regles) expect(r, r).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it('cibles tactiles >= 44 px et champs à 16 px', () => {
    expect(CSS).toMatch(/\.brg-chip\s*\{[^}]*min-height:44px/);
    expect(CSS).toMatch(/\.brg-x\s*\{[^}]*(?:min-width:44px|width:44px)/);
    expect(CSS).toMatch(/\.brg-inp\s*\{[^}]*font-size:16px/);
  });
});
