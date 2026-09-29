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

import { normNomEntite, sirenDe, trouverDoublonEntite, appartientAEspace } from '../../js/core/entite-doublon.js';

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
let html, saveEntSrc, acteDupSrc;
const extractFn = (src, name) => {
  const start = src.indexOf(`function ${name}(`)
  if (start === -1) return null
  return src.slice(start, src.indexOf('\n}', start) + 2)
}
beforeAll(() => {
  html = readFileSync(resolve(__dir, '../../index.html'), 'utf8').replace(/\r/g, '');
  saveEntSrc = extractFn(html, 'saveEnt');
  acteDupSrc = extractFn(html, '_acteFindDupEntity');
});

describe('non-divergence — le shadow inline d\'index.html est identique au module', () => {
  it.each(['normNomEntite', 'sirenDe', 'appartientAEspace', 'trouverDoublonEntite'])('%s', name => {
    const mod = readFileSync(resolve(__dir, '../../js/core/entite-doublon.js'), 'utf8').replace(/\r/g, '').replace(/^export /gm, '');
    const inline = extractFn(html, name);
    expect(inline).toBeTruthy();
    expect(inline).toBe(extractFn(mod, name));
  });
});

// logements par défaut : un bien par bailleur, taggé comme lui (multi-espace)
function runSaveEnt({ entites, form, confirmAnswer = false, editId = '', logements, extra = {}, ownEspaceId = null }) {
  const toasts = [], confirms = [], calls = { saveDB: 0, stamp: 0, audit: 0, closeM: 0 };
  const fields = { 'ent-edit-id': editId, 'ent-gerants': '', 'ent-type': 'SCI', 'ent-rcs': '', 'ent-siege': '', 'ent-iban': '', 'ent-bic': '', 'ent-email-envoi': '', ...form };
  const DB = { entites, logements: logements || entites.map((e, i) => ({ ref: 'L' + (i + 1), entity: e.nom, _espaceId: e._espaceId })), baux: {}, baux_historique: [], quittances: [], mouvements: [], ...extra };
  const env = {
    DB,
    window: { __immoOwnEspaceId: () => ownEspaceId },
    appartientAEspace,
    el: id => (id in fields ? { value: fields[id] } : null),
    v: id => fields[id] ?? '',
    nid: () => 999,
    _entSigB64: undefined, _entLogoB64: undefined,
    _preserverChampsExistants: (a, b) => { if (b && b._espaceId) a._espaceId = b._espaceId; return a },
    normNomEntite, sirenDe, trouverDoublonEntite,
    _stamp: () => { calls.stamp++ }, _auditLog: () => { calls.audit++ },
    saveDB: () => { calls.saveDB++ }, closeM: () => { calls.closeM++ }, rBailleurs: () => {}, _refreshAfterMutation: () => {},
    showToast: (m, t) => toasts.push({ m, t }),
    confirm2: m => { confirms.push(m); return confirmAnswer },
    _frAfterSave: undefined,
  };
  const fn = new Function(...Object.keys(env), saveEntSrc + '\nreturn saveEnt();');
  fn(...Object.values(env));
  return { DB, toasts, confirms, calls };
}

describe('_acteFindDupEntity (import d\'acte) — réutilise la même règle', () => {
  const run = (entites, siren, nom) => new Function('DB', 'trouverDoublonEntite', acteDupSrc + '\nreturn _acteFindDupEntity;')({ entites }, trouverDoublonEntite)(siren, nom);
  const a = { id: 1, nom: 'SCI ALTA', siren: '111222333' }, b = { id: 2, nom: 'SCI BETA', siren: '444555666' };
  it('SIRET de l\'acte → trouve le bailleur par ses 9 premiers chiffres', () => {
    expect(run([a, b], '444 555 666 00012', 'SCI INCONNUE')).toBe(b);
  });
  it('SIREN prioritaire sur le nom', () => {
    expect(run([a, b], '444555666', 'SCI ALTA')).toBe(b);
  });
  it('à défaut de SIREN, par nom (casse et espaces ignorés)', () => {
    expect(run([a, b], '', ' sci  alta ')).toBe(a);
  });
  it('rien → null', () => {
    expect(run([a, b], '', 'SCI GAMMA')).toBe(null);
  });
});

describe('saveEnt — garde-fou nom / SIREN', () => {
  it('SCÉNARIO P0 — renommer un bailleur avec le nom d\'un autre est REFUSÉ, rien n\'est modifié', () => {
    const marion = { id: 1, nom: 'SCI SMARTOSAURUS', siren: '994086379', _espaceId: 'M' };
    const didier = { id: 3, nom: 'SCI SMARTOSAURUS DIdier', siren: '994 086 379 00017', _espaceId: 'D' };
    const { DB, toasts, calls } = runSaveEnt({ entites: [marion, didier], editId: '3', form: { 'ent-nom': 'SCI SMARTOSAURUS', 'ent-siren': didier.siren } });
    expect(calls.saveDB).toBe(0);
    expect(calls.stamp).toBe(0);                                   // refus AVANT horodatage…
    expect(calls.audit).toBe(0);                                   // …et avant journal d'audit
    expect(calls.closeM).toBe(0);                                  // la fiche reste ouverte pour corriger
    expect(DB.entites[1].nom).toBe('SCI SMARTOSAURUS DIdier');   // pas renommé
    expect(DB.logements[1].entity).toBe('SCI SMARTOSAURUS DIdier'); // cascade jamais lancée
    expect(toasts.some(t => t.t === 'err' && /déjà/.test(t.m))).toBe(true);
  });

  it('fiches DÉJÀ homonymes : modifier un autre champ sans changer le nom est enregistré, avec avertissement', () => {
    const m = { id: 1, nom: 'SCI SMARTOSAURUS', siren: '994086379', _espaceId: 'M' };
    const d = { id: 3, nom: 'SCI SMARTOSAURUS', siren: '994086379', _espaceId: 'D' };
    const { DB, toasts, calls } = runSaveEnt({ entites: [m, d], editId: '3', form: { 'ent-nom': 'SCI SMARTOSAURUS', 'ent-siren': '994086379', 'ent-iban': 'FR76 NOUVEAU' } });
    expect(calls.saveDB).toBe(1);
    expect(DB.entites[1].iban).toBe('FR76 NOUVEAU');
    expect(toasts.some(t => t.t === 'warn' && /même nom/.test(t.m))).toBe(true);
  });

  it('AUDIT 2 cas A — corriger la CASSE vers le nom exact d\'un autre bailleur est refusé', () => {
    const m = { id: 1, nom: 'SCI SMARTOSAURUS', siren: '', _espaceId: 'M' };
    const d = { id: 3, nom: 'SCI Smartosaurus', siren: '', _espaceId: 'D' };
    const { DB, calls } = runSaveEnt({ entites: [m, d], editId: '3', form: { 'ent-nom': 'SCI SMARTOSAURUS', 'ent-siren': '' } });
    expect(calls.saveDB).toBe(0);
    expect(DB.entites[1].nom).toBe('SCI Smartosaurus');
    expect(DB.logements[1].entity).toBe('SCI Smartosaurus');
  });

  it('AUDIT 2 cas B — nom hérité avec espace insécable, normalisé au simple enregistrement : refusé', () => {
    const m = { id: 1, nom: 'SCI X', siren: '', _espaceId: 'M' };
    const d = { id: 3, nom: 'SCI X', siren: '', _espaceId: 'D' };
    const { DB, calls } = runSaveEnt({ entites: [m, d], editId: '3', form: { 'ent-nom': 'SCI X', 'ent-siren': '', 'ent-iban': 'FR76' } });
    expect(calls.saveDB).toBe(0);
    expect(DB.logements[1].entity).toBe('SCI X');
  });

  it('AUDIT 2 cas C — un bien créé en session (non tagué) suit le renommage du bailleur de l\'espace PROPRE', () => {
    const m = { id: 1, nom: 'SCI S', siren: '', _espaceId: 'M' };
    const d = { id: 3, nom: 'SCI S', siren: '', _espaceId: 'D' };
    const logements = [{ ref: 'M1', entity: 'SCI S', _espaceId: 'M' }, { ref: 'D1', entity: 'SCI S', _espaceId: 'D' }, { ref: 'D2-neuf', entity: 'SCI S' }];
    const { DB } = runSaveEnt({ entites: [m, d], editId: '3', logements, ownEspaceId: 'D', form: { 'ent-nom': 'SCI S Didier', 'ent-siren': '' } });
    const by = r => DB.logements.find(l => l.ref === r).entity;
    expect(by('D1')).toBe('SCI S Didier');
    expect(by('D2-neuf')).toBe('SCI S Didier');
    expect(by('M1')).toBe('SCI S');
  });

  it('… et ne suit PAS le renommage d\'un bailleur d\'un espace TIERS', () => {
    const m = { id: 1, nom: 'SCI S', siren: '', _espaceId: 'M' };
    const d = { id: 3, nom: 'SCI S', siren: '', _espaceId: 'D' };
    const logements = [{ ref: 'M1', entity: 'SCI S', _espaceId: 'M' }, { ref: 'D2-neuf', entity: 'SCI S' }];
    const { DB } = runSaveEnt({ entites: [m, d], editId: '1', logements, ownEspaceId: 'D', form: { 'ent-nom': 'SCI S Marion', 'ent-siren': '' } });
    expect(DB.logements.find(l => l.ref === 'M1').entity).toBe('SCI S Marion');
    expect(DB.logements.find(l => l.ref === 'D2-neuf').entity).toBe('SCI S');
  });

  it('périmètre appliqué à TOUTES les collections de la cascade (baux, historique, quittances, mouvements SCI)', () => {
    const m = { id: 1, nom: 'SCI S', siren: '', _espaceId: 'M' };
    const d = { id: 3, nom: 'SCI S', siren: '', _espaceId: 'D' };
    const two = (k, v) => [{ [k]: v, _espaceId: 'M' }, { [k]: v, _espaceId: 'D' }];
    const extra = {
      baux: { BM: { entity: 'SCI S', _espaceId: 'M' }, BD: { entity: 'SCI S', _espaceId: 'D' } },
      baux_historique: two('entity', 'SCI S'), quittances: two('entity', 'SCI S'), mouvements: two('qui', 'SCI:SCI S'),
    };
    const { DB } = runSaveEnt({ entites: [m, d], editId: '3', extra, ownEspaceId: 'D', form: { 'ent-nom': 'SCI S Didier', 'ent-siren': '' } });
    expect([DB.baux.BM.entity, DB.baux.BD.entity]).toEqual(['SCI S', 'SCI S Didier']);
    expect(DB.baux_historique.map(x => x.entity)).toEqual(['SCI S', 'SCI S Didier']);
    expect(DB.quittances.map(x => x.entity)).toEqual(['SCI S', 'SCI S Didier']);
    expect(DB.mouvements.map(x => x.qui)).toEqual(['SCI:SCI S', 'SCI:SCI S Didier']);
  });

  it('sans homonyme, la cascade reste globale (comportement historique, tags mêlés)', () => {
    const e = { id: 1, nom: 'SCI ALTA', siren: '', _espaceId: 'M' };
    const logements = [{ ref: 'A', entity: 'SCI ALTA', _espaceId: 'M' }, { ref: 'B', entity: 'SCI ALTA' }];
    const { DB } = runSaveEnt({ entites: [e], editId: '1', logements, ownEspaceId: 'D', form: { 'ent-nom': 'SCI ALTA 2', 'ent-siren': '' } });
    expect(DB.logements.map(l => l.entity)).toEqual(['SCI ALTA 2', 'SCI ALTA 2']);
  });

  it('renommer l\'un de deux homonymes ne déplace QUE les biens de son espace', () => {
    const m = { id: 1, nom: 'SCI SMARTOSAURUS', siren: '', _espaceId: 'M' };
    const d = { id: 3, nom: 'SCI SMARTOSAURUS', siren: '', _espaceId: 'D' };
    const { DB, calls } = runSaveEnt({ entites: [m, d], editId: '3', form: { 'ent-nom': 'SCI SMARTOSAURUS Didier', 'ent-siren': '' } });
    expect(calls.saveDB).toBe(1);
    expect(DB.logements.find(l => l._espaceId === 'D').entity).toBe('SCI SMARTOSAURUS Didier');
    expect(DB.logements.find(l => l._espaceId === 'M').entity).toBe('SCI SMARTOSAURUS');   // Marion intacte
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
