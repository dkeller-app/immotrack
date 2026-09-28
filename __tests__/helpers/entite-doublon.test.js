// Garde-fou bailleurs en double — incident réel 28/09 (P0 « fusion de deux SCI homonymes »).
//
// L'app relie logements, baux, quittances et mouvements à leur bailleur par le NOM. Deux bailleurs
// portant le même nom deviennent indiscernables : renommer « SCI SMARTOSAURUS DIdier » en
// « SCI SMARTOSAURUS » a fusionné sur l'écran deux SCI (12 biens au lieu de 6). Le multi-espace
// (SCI partagée par un autre associé) mêle dans DB.entites des bailleurs de plusieurs espaces :
// la vérification porte sur TOUS.
//
// Règles :
//   - nom identique à un autre bailleur (casse, espaces, tirets typographiques ignorés) → REFUS ;
//   - même SIREN (9 premiers chiffres d'un SIRET) → avertissement, l'utilisateur décide.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { normNomEntite, sirenDe, trouverDoublonEntite } from '../../js/core/entite-doublon.js';

describe('normNomEntite', () => {
  it('ignore casse, espaces multiples, espaces insécables et tirets typographiques', () => {
    expect(normNomEntite('  SCI  Smartosaurus ')).toBe('sci smartosaurus');
    expect(normNomEntite('SCI A—B')).toBe(normNomEntite('sci a-b'));
    expect(normNomEntite(null)).toBe('');
  });
});

describe('sirenDe', () => {
  it('SIREN saisi avec ou sans espaces', () => {
    expect(sirenDe('994 086 379')).toBe('994086379');
    expect(sirenDe('994086379')).toBe('994086379');
  });
  it('SIRET (14 chiffres) → ses 9 premiers chiffres', () => {
    expect(sirenDe('994 086 379 00017')).toBe('994086379');
  });
  it('saisie incomplète ou fantaisiste → vide (pas de faux doublon)', () => {
    expect(sirenDe('99408')).toBe('');
    expect(sirenDe('9940863790')).toBe('');
    expect(sirenDe('')).toBe('');
    expect(sirenDe(undefined)).toBe('');
  });
});

describe('trouverDoublonEntite', () => {
  const marion = { id: 1783849907398, nom: 'SCI SMARTOSAURUS', siren: '994086379', _espaceId: 'M' };
  const didier = { id: 3, nom: 'SCI SMARTOSAURUS DIdier', siren: '994 086 379 00017', _espaceId: 'D' };
  const autre = { id: 7, nom: 'SCI ALTA', siren: '111222333' };

  it('CAS VÉCU — renommer la copie avec le nom de la SCI partagée : doublon de NOM', () => {
    const r = trouverDoublonEntite([marion, didier, autre], { nom: 'SCI SMARTOSAURUS', siren: didier.siren }, didier);
    expect(r.nom).toBe(marion);
  });

  it('même SIREN sous un autre nom : doublon de SIREN (SIRET vs SIREN)', () => {
    const r = trouverDoublonEntite([marion, autre], { nom: 'SCI SMARTO bis', siren: '994 086 379 00017' }, null);
    expect(r.nom).toBe(null);
    expect(r.siren).toBe(marion);
  });

  it('le bailleur en cours d\'édition ne se détecte pas lui-même (comparé par objet, pas par id)', () => {
    // les ids legacy peuvent coïncider entre espaces : on exclut l'OBJET édité, pas un id
    const homonymeId = { id: 3, nom: 'SCI ALTA 2', siren: '' };
    const r = trouverDoublonEntite([didier, homonymeId], { nom: 'SCI SMARTOSAURUS DIdier', siren: didier.siren }, didier);
    expect(r).toEqual({ nom: null, siren: null });
  });

  it('un bailleur supprimé (tombstone) ne compte pas', () => {
    const r = trouverDoublonEntite([{ ...marion, _deleted: true }], { nom: 'SCI SMARTOSAURUS', siren: '994086379' }, null);
    expect(r).toEqual({ nom: null, siren: null });
  });

  it('pas de SIREN saisi → aucun doublon de SIREN', () => {
    const r = trouverDoublonEntite([{ id: 9, nom: 'M. Dupont', siren: '' }], { nom: 'Mme Durand', siren: '' }, null);
    expect(r).toEqual({ nom: null, siren: null });
  });

  it('entrées dégradées', () => {
    expect(trouverDoublonEntite(null, { nom: 'X' }, null)).toEqual({ nom: null, siren: null });
    expect(trouverDoublonEntite([null, marion], null, null)).toEqual({ nom: null, siren: null });
  });
});

// ── Comportement réel de saveEnt (fonction extraite d'index.html, exécutée avec des doublures) ──
const __dir = dirname(fileURLToPath(import.meta.url));
let saveEntSrc;
beforeAll(() => {
  const html = readFileSync(resolve(__dir, '../../index.html'), 'utf8').replace(/\r/g, '');
  const start = html.indexOf('function saveEnt() {');
  saveEntSrc = html.slice(start, html.indexOf('\n}', start) + 2);
});

function runSaveEnt({ entites, form, confirmAnswer = false, editId = '' }) {
  const toasts = [], confirms = [], calls = { saveDB: 0 };
  const fields = { 'ent-edit-id': editId, 'ent-gerants': '', 'ent-type': 'SCI', 'ent-rcs': '', 'ent-siege': '', 'ent-iban': '', 'ent-bic': '', 'ent-email-envoi': '', ...form };
  const DB = { entites, logements: [{ ref: 'L1', entity: entites[0] && entites[0].nom }], baux: {}, baux_historique: [], quittances: [], mouvements: [] };
  const env = {
    DB,
    el: id => (id in fields ? { value: fields[id] } : null),
    v: id => fields[id] ?? '',
    nid: () => 999,
    _entSigB64: undefined, _entLogoB64: undefined,
    _preserverChampsExistants: (a, b) => { if (b && b._espaceId) a._espaceId = b._espaceId; return a },
    _entiteDoublon: trouverDoublonEntite, _sirenDe: sirenDe,
    _stamp: () => {}, _auditLog: () => {},
    saveDB: () => { calls.saveDB++ }, closeM: () => {}, rBailleurs: () => {}, _refreshAfterMutation: () => {},
    showToast: (m, t) => toasts.push({ m, t }),
    confirm2: m => { confirms.push(m); return confirmAnswer },
    _frAfterSave: undefined,
  };
  const fn = new Function(...Object.keys(env), saveEntSrc + '\nreturn saveEnt();');
  fn(...Object.values(env));
  return { DB, toasts, confirms, calls };
}

describe('saveEnt — garde-fou nom / SIREN', () => {
  it('SCÉNARIO P0 — renommer un bailleur avec le nom d\'un autre est REFUSÉ, rien n\'est modifié', () => {
    const marion = { id: 1, nom: 'SCI SMARTOSAURUS', siren: '994086379', _espaceId: 'M' };
    const didier = { id: 3, nom: 'SCI SMARTOSAURUS DIdier', siren: '994 086 379 00017', _espaceId: 'D' };
    const { DB, toasts, calls } = runSaveEnt({ entites: [marion, didier], editId: '3', form: { 'ent-nom': 'SCI SMARTOSAURUS', 'ent-siren': didier.siren } });
    expect(calls.saveDB).toBe(0);
    expect(DB.entites[1].nom).toBe('SCI SMARTOSAURUS DIdier');   // pas renommé
    expect(DB.logements[0].entity).toBe('SCI SMARTOSAURUS');      // cascade jamais lancée
    expect(toasts.some(t => t.t === 'err' && /déjà/.test(t.m))).toBe(true);
  });

  it('créer un bailleur avec un nom existant (autre casse) est refusé', () => {
    const { DB, calls } = runSaveEnt({ entites: [{ id: 1, nom: 'SCI ALTA' }], form: { 'ent-nom': 'sci  alta', 'ent-siren': '' } });
    expect(calls.saveDB).toBe(0);
    expect(DB.entites).toHaveLength(1);
  });

  it('même SIREN : avertit ; « Annuler » n\'enregistre pas', () => {
    const { DB, confirms, calls } = runSaveEnt({ entites: [{ id: 1, nom: 'SCI ALTA', siren: '111222333' }], form: { 'ent-nom': 'SCI ALTA BIS', 'ent-siren': '111 222 333 00012' }, confirmAnswer: false });
    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toMatch(/SCI ALTA/);
    expect(calls.saveDB).toBe(0);
    expect(DB.entites).toHaveLength(1);
  });

  it('même SIREN : « OK » enregistre (l\'utilisateur décide)', () => {
    const { DB, calls } = runSaveEnt({ entites: [{ id: 1, nom: 'SCI ALTA', siren: '111222333' }], form: { 'ent-nom': 'SCI ALTA BIS', 'ent-siren': '111222333' }, confirmAnswer: true });
    expect(calls.saveDB).toBe(1);
    expect(DB.entites).toHaveLength(2);
  });

  it('réenregistrer un bailleur sans changer son nom ni son SIREN passe sans question', () => {
    const e = { id: 1, nom: 'SCI ALTA', siren: '111222333' };
    const { confirms, calls } = runSaveEnt({ entites: [e, { id: 2, nom: 'SCI BETA', siren: '' }], editId: '1', form: { 'ent-nom': 'SCI ALTA', 'ent-siren': '111222333' } });
    expect(confirms).toHaveLength(0);
    expect(calls.saveDB).toBe(1);
  });

  it('paire SIREN déjà existante : réenregistrer sans toucher au SIREN ne repose pas la question', () => {
    const a = { id: 1, nom: 'SCI ALTA', siren: '111222333' }, b = { id: 2, nom: 'SCI ALTA BIS', siren: '111222333' };
    const { confirms, calls } = runSaveEnt({ entites: [a, b], editId: '2', form: { 'ent-nom': 'SCI ALTA BIS', 'ent-siren': '111 222 333' } });
    expect(confirms).toHaveLength(0);
    expect(calls.saveDB).toBe(1);
  });

  it('renommer vers un nom libre passe et la cascade s\'applique', () => {
    const e = { id: 1, nom: 'SCI ALTA', siren: '' };
    const { DB, calls } = runSaveEnt({ entites: [e], editId: '1', form: { 'ent-nom': 'SCI ALTA COLMAR', 'ent-siren': '' } });
    expect(calls.saveDB).toBe(1);
    expect(DB.logements[0].entity).toBe('SCI ALTA COLMAR');
  });
});
