/**
 * bank-regles-liste.test.js — REGLES-REFONTE phase 6b : écran « Mes règles » (version simple).
 * Sujet : docs/subjects/RETOURS-2026-10-05.md (lot D + « Décisions Didier du 06/10 »).
 *
 * Logique pure testée : regroupement par compte + filtre bailleur, vue d'une règle, « Garder les deux »
 * (le signal de doublon ne revient pas), doublons par règle à retirer. Le rendu (js/app/app-part2.js,
 * css/main.css) est vérifié par des gardes de source en fin de fichier.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  _bankRuleBuild, _bankRulesDuplicates, _bankRulesFuse, _bankRuleTombstone, _bankRuleGarderLesDeux,
  _bankRulesDoublonsParId, _bankRulesParCompte, _bankRuleVue, _bankRuleAddException, _bankRuleStatutLigne,
} from '../../js/core/bank-import.js';

const NOW = '2026-10-06T10:00:00.000Z';
let _n = 0;
const newId = () => 'rg_l_' + (++_n);
const R = (d) => {
  const b = _bankRuleBuild(Object.assign({ compte: 'cic', cat: 'C', sens: 'db' }, d), { newId, now: NOW });
  if (!b.ok) throw new Error(b.errors.join(','));
  return b.rule;
};
const ACC = [
  { id: 'cic', label: 'CIC', bailleur: 'SCI Dupont' },
  { id: 'bp', label: 'BP', bailleur: 'SCI Dupont' },
  { id: 'ca', label: 'CA', bailleur: 'Didier Keller (nom propre)' },
  { id: 'mx', label: 'Mixte', mixte: true },
  { id: 'sb', label: 'Sans bailleur' },
  { id: 'old', label: 'Fermé', bailleur: 'SCI Dupont', _deleted: true },
];

describe('_bankRulesParCompte — regroupement par compte', () => {
  const histo = { id: 'h1', pattern: 'EDF', cat: 'C', compte: '', compteAChoisir: true };
  const r1 = R({ mots: ['A'], compte: 'cic' }), r2 = R({ mots: ['B'], compte: 'bp' });
  const r3 = R({ mots: ['C'], compte: 'ca' }), r4 = R({ mots: ['D'], compte: 'mx' }), r5 = R({ mots: ['E'], compte: 'sb' });
  const orphelin = R({ mots: ['F'], compte: 'disparu' });
  const supprimee = _bankRuleTombstone(R({ mots: ['G'], compte: 'cic' }));
  const rules = [histo, r1, r2, r3, r4, r5, orphelin, supprimee];

  it('« Compte à choisir » en tête, un groupe par compte vivant, règles supprimées ignorées', () => {
    const g = _bankRulesParCompte(rules, ACC);
    expect(g.sansCompte).toEqual([histo]);
    expect(g.groupes.map(x => x.compte.id)).toEqual(['cic', 'bp', 'ca', 'mx', 'sb']);
    expect(g.groupes[0].regles).toEqual([r1]);          // la règle supprimée n'y est pas
    expect(g.inconnus).toEqual([orphelin]);             // compte supprimé : jamais perdue de vue
    expect(g.masquees).toBe(0);
  });
  it('les bailleurs distincts (comptes mixtes / sans bailleur / supprimés exclus)', () => {
    expect(_bankRulesParCompte(rules, ACC).bailleurs).toEqual(['SCI Dupont', 'Didier Keller (nom propre)']);
  });
  it('filtre bailleur : un autre bailleur est masqué et compté ; mixte, sans bailleur et « sans compte » restent', () => {
    const g = _bankRulesParCompte(rules, ACC, { bailleur: 'SCI Dupont' });
    expect(g.groupes.map(x => x.compte.id)).toEqual(['cic', 'bp', 'mx', 'sb']);
    expect(g.masquees).toBe(1);
    expect(g.bailleursMasques).toEqual(['Didier Keller (nom propre)']);
    expect(g.sansCompte).toEqual([histo]);
    expect(g.inconnus).toEqual([orphelin]);
  });
  it('« Voir tout » (vide ou « all ») ne masque rien ; casse et accents ignorés', () => {
    expect(_bankRulesParCompte(rules, ACC, { bailleur: 'all' }).masquees).toBe(0);
    expect(_bankRulesParCompte(rules, ACC, { bailleur: '' }).masquees).toBe(0);
    expect(_bankRulesParCompte(rules, ACC, { bailleur: 'sci dupont' }).groupes.map(x => x.compte.id)).toEqual(['cic', 'bp', 'mx', 'sb']);
  });
  it('entrées absentes ou invalides : jamais d\'exception', () => {
    expect(_bankRulesParCompte(null, null)).toMatchObject({ sansCompte: [], groupes: [], inconnus: [], masquees: 0 });
  });
});

describe('_bankRuleVue — ce que la liste affiche', () => {
  it('règle refondue : mots cochés, mots saisis, sens, montant, exceptions', () => {
    const r = _bankRuleAddException(R({ mots: ['SARAR'], motsLibres: ['ELEC'], sens: 'cr', montant: { type: 'exact', valeur: 18.4 } }),
      { date: '2026-09-18', libelle: 'SARAR TRAVAUX', debit: 4583.03, _fingerprint: 'fp1' }, { now: NOW });
    const v = _bankRuleVue(r);
    expect(v.mots).toEqual(['SARAR']);
    expect(v.motsLibres).toEqual(['ELEC']);
    expect(v.sens).toBe('cr');
    expect(v.montant).toEqual({ type: 'exact', valeur: 18.4 });
    expect(v.exceptions).toHaveLength(1);
    expect(v.compteAChoisir).toBe(false);
    expect(v.historique).toBe(false);
  });
  it('règle historique : le motif devient des mots « saisis », badge « Compte à choisir »', () => {
    const v = _bankRuleVue({ id: 'h', pattern: 'EDF  CLIENTS', cat: 'C' });
    expect(v.mots).toEqual([]);
    expect(v.motsLibres).toEqual(['EDF', 'CLIENTS']);
    expect(v.compteAChoisir).toBe(true);
    expect(v.historique).toBe(true);
    expect(v.sens).toBe('');
    expect(v.montant).toBeNull();
  });
});

describe('« Garder les deux » — le signal de doublon ne revient pas', () => {
  const large = R({ mots: ['SARAR'] });
  const precise = R({ mots: ['SARAR', 'SYNDIC'] });
  it('le doublon est signalé, indexé par la règle à retirer (la plus précise, couverte par la large — audit I2)', () => {
    expect(_bankRulesDuplicates([large, precise])).toHaveLength(1);
    const m = _bankRulesDoublonsParId([large, precise]);
    expect(Object.keys(m)).toEqual([precise.id]);
    expect(m[precise.id]).toBe(large);
  });
  it('mémorise la paire sur une règle (copie stampée, entrées intactes, idempotent)', () => {
    const avant = JSON.stringify([large, precise]);
    const l2 = _bankRuleGarderLesDeux(large, precise, { now: '2026-10-06T12:00:00.000Z' });
    expect(JSON.stringify([large, precise])).toBe(avant);
    expect(l2).not.toBe(large);
    expect(l2.gardeAvec).toEqual([precise.id]);
    expect(l2._modifiedAt).toBe('2026-10-06T12:00:00.000Z');
    expect(_bankRuleGarderLesDeux(l2, precise)).toBe(l2);
  });
  it('plus de signal, dans un sens comme dans l\'autre, et pour la pastille « enregistrée »', () => {
    const l2 = _bankRuleGarderLesDeux(large, precise, { now: NOW });
    expect(_bankRulesDuplicates([l2, precise])).toHaveLength(0);
    expect(_bankRulesDuplicates([precise, l2])).toHaveLength(0);
    expect(_bankRulesDoublonsParId([l2, precise])).toEqual({});
    const ligne = { libelle: 'VIR SARAR SYNDIC', date: '2026-09-15', debit: 10, credit: 0, _fingerprint: 'x' };
    expect(_bankRuleStatutLigne([large, precise], ligne, 'cic').etat).toBe('doublon');
    expect(_bankRuleStatutLigne([l2, precise], ligne, 'cic').etat).toBe('enregistree');
  });
  it('ne masque que CETTE paire : une troisième règle qui double toujours reste signalée', () => {
    const l2 = _bankRuleGarderLesDeux(large, precise, { now: NOW });
    const autre = R({ mots: ['SARAR', 'SYNDIC', 'PARIS'] });
    const d = _bankRulesDuplicates([l2, precise, autre]);
    expect(d.length).toBeGreaterThan(0);
    expect(d.every(x => !(x.a === l2 && x.b === precise))).toBe(true);
  });
  it('la fusion reste possible et fournit un tombstone par id', () => {
    const f = _bankRulesFuse(large, precise, { now: NOW });
    expect(f.garder.id).toBe(large.id);
    expect(f.tombstone).toMatchObject({ _deleted: true, id: precise.id });
  });
});

describe('Mirror navigateur — les fonctions de « Mes règles » sont chargées par le navigateur', () => {
  it('exposées sur window', async () => {
    const vm = await import('node:vm');
    const chemin = fileURLToPath(new URL('../../js/helpers/bank-import.global.js', import.meta.url));
    const bac = { window: {}, console };
    vm.createContext(bac);
    vm.runInContext(fs.readFileSync(chemin, 'utf8'), bac, { filename: chemin });
    for (const f of ['_bankRulesParCompte', '_bankRuleVue', '_bankRuleGarderLesDeux', '_bankRulesDoublonsParId']) {
      expect(typeof bac.window[f], f).toBe('function');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Gardes de source (rendu : js/app/app-part2.js, css/main.css)
// ═══════════════════════════════════════════════════════════════════
const __d = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(__d, '..', '..', f), 'utf8').replace(/\r\n/g, '\n');
const P2 = read('js/app/app-part2.js');
const CSS = read('css/main.css');
const bloc = (src, from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); return src.slice(a, b < 0 ? undefined : b); };

describe('Rendu de « Mes règles » (gardes de source)', () => {
  const zone = bloc(P2, 'let _bankRulesBailleur', 'function addImportRule()');
  it('utilise le module pur et la fenêtre de règle de la 6a', () => {
    for (const f of ['_bankRulesParCompte', '_bankRulesDoublonsParId', '_bankRuleVue', '_bankRulesFuse', '_bankRuleGarderLesDeux',
      '_bankRuleRemoveException', '_bankRuleOpen(rid)', '_bankRuleMontantTxt']) expect(zone, f).toContain(f);
  });
  it('NE refait PAS ce que Didier a écarté : ni test de libellé, ni statistiques d\'utilisation', () => {
    expect(zone).not.toContain('_bankRuleUsage');
    expect(zone).not.toMatch(/jamais utilisée|dernière fois|tester un libellé/);
  });
  it('identifiants et libellés passent par data-*, jamais dans le code d\'un onclick', () => {
    const handlers = zone.match(/on(?:click|toggle)="[^"]*"/g) || [];
    expect(handlers.length).toBeGreaterThan(3);
    for (const h of handlers) expect(h, h).not.toMatch(/\$\{|\+\s*(?:escHtml|rid|r\.|v\.|e\.|a\.)/);
  });
  // « tout texte issu d'une règle est échappé » : remplacé par un test de COMPORTEMENT (rendu réel de la
  // carte, contenu piégé) dans bank-regles-audit.test.js (« Comportement — rendu échappé »).
  it('chaque modification passe par _stamp et saveDB (tombstone par id, jamais de splice)', () => {
    expect(zone).not.toContain('.splice(');
    for (const fn of ['_bankRulesFusionner', '_bankRulesGarderLesDeux', '_bankRulesRetirerException']) {
      const b = bloc(zone, 'function ' + fn, '\n}\n');
      expect(b, fn).toContain('_stamp(');
      expect(b, fn).toContain('saveDB()');
    }
  });
  it('styles : variables CSS seulement, cibles >= 44 px, flex-wrap (pas de scroll horizontal)', () => {
    const regles = (CSS.match(/\.brg-(?:rl|bar|grp|rule|pill|exn|lnk--neg)[^{]*\{[^}]*\}/g) || []);
    expect(regles.length).toBeGreaterThan(10);
    for (const r of regles) expect(r, r).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS).toMatch(/\.brg-exn summary\{[^}]*min-height:44px/);
    expect(CSS).toMatch(/\.brg-rule\{[^}]*flex-wrap:wrap/);
  });
});
