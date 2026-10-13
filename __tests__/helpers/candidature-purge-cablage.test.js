/**
 * CANDIDATURES-CONFORMITE lot 1 — CÂBLAGE de la purge RGPD : le VRAI code de l'app (js/app/app-part1.js,
 * app-part2.js) exécuté tel qu'il est écrit, avec le vrai module pur js/core/candidature-purge.js.
 * Les effets de bord (Storage, IndexedDB, relais, saveDB) sont des doublures qui ENREGISTRENT ce qui est
 * demandé : le test prouve le périmètre exact de ce qui est effacé, l'ordre (en ligne d'abord), la reprise
 * hors ligne, l'idempotence, et qu'aucune autre pièce n'est touchée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import * as CandPurge from '../../js/core/candidature-purge.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8');
const SYNC = ['_candPurgeAttenteLire', '_candPurgeAttenteEcrire', 'setCandidatStatut'];
const ASYNC = ['_candCloudEffacer', '_candEffacerPiecesLocales', '_candEffacerPieces', '_purgeCandidatsRefusesProd'];
const SRC = SYNC.map(n => extraireFonction(P1, n)).join('\n') + '\n'
  + ASYNC.map(n => 'async ' + extraireFonction(P1, n)).join('\n') + '\n'
  + 'async ' + extraireFonction(P2, '_handleAttachmentDelete');

const DAY = 864e5;
const U1 = '11111111-2222-4333-8444-555555555555', U2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const chemin = k => `${U1}/${U2}/files/${k}`;

function monter(DB, { enLigne = true, refusRls = [], lectureSeule = false, module = true, sandbox = false, pendantStorage = null } = {}) {
  const journal = { storage: [], idb: [], relais: [], saves: 0, audits: [] };
  const store = new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const window = {
    CandPurge: module ? CandPurge : undefined,
    __immoHorsLigne: !enLigne,
    __immoCloudRemoveCandidatFiles: async (paths) => {
      journal.storage.push([...paths]);
      if (pendantStorage) pendantStorage();
      return { effaces: paths.filter(p => !refusRls.includes(p)), echecs: paths.filter(p => refusRls.includes(p)) };
    }
  };
  const deps = {
    DB, window, localStorage, console: { warn() {}, info() {}, log() {} },
    _appReadOnly: lectureSeule, _isTestMode: sandbox, _lsKey: k => (sandbox ? '_test_' + k : k),
    _stamp: o => { o._modifiedAt = '2026-10-12T10:00:00.000Z'; },
    _tombstoneObj: p => Object.assign({ _deleted: true, _deletedAt: 't', _modifiedAt: 't' }, p || {}),
    _idbDel: async k => { journal.idb.push(k); },
    _relayPurgeForCandidat: async c => { journal.relais.push(c.id); },
    saveDB: () => { journal.saves++; },
    _auditLog: (...a) => journal.audits.push(a),
    rCandidats: () => {}, _renderInboxSurfaces: () => {}, openFicheCandidat: () => {}, showToast: () => {},
    confirm2: () => true, el: () => null, _attachmentRefresh: () => true, _refreshAfterMutation: () => {},
    _attachmentDelete: async id => { journal.attachmentDelete = (journal.attachmentDelete || []).concat(id); },
    _relayRevokeForCandidat: () => {}, _CAND_ST_LABEL: {}, currentPage: '', rLogFiche: () => {}
  };
  const noms = Object.keys(deps);
  const lets = "const _CAND_PURGE_ATTENTE_KEY = 'imsb-cand-purge-attente'; let _candPurgeEnCours = false, _candPurgeDernier = 0;\n";
  const exp = '\nreturn { ' + SYNC.concat(ASYNC, ['_handleAttachmentDelete']).join(', ') + ' };';
  const app = new Function(...noms, lets + SRC + exp)(...noms.map(n => deps[n]));
  return { app, journal, store };
}

function parc(now) {
  return {
    candidats: [
      { id: 'cand_R40', statut: 'refuse', refuseLe: new Date(now - 40 * DAY).toISOString(), entity: 'SCI X', linkId: 'L1', nom: 'Dupont', email: 'd@x.fr', _archived: true },
      { id: 'cand_R10', statut: 'refuse', refuseLe: new Date(now - 10 * DAY).toISOString(), entity: 'SCI X', nom: 'Martin' },
      { id: 'cand_LEG', statut: 'refuse', _modifiedAt: new Date(now - 35 * DAY).toISOString(), entity: 'SCI X', nom: 'Ancien', confianceScore: 55 },
      { id: 'cand_CONV', statut: 'converti', bailRef: 'T3', refuseLe: new Date(now - 400 * DAY).toISOString(), entity: 'SCI X', nom: 'Retenu' },
      { id: 'cand_EC', statut: 'enCours', _modifiedAt: new Date(now - 300 * DAY).toISOString(), entity: 'SCI X', nom: 'Actif', confianceScore: 80 }
    ],
    documents: [
      { id: 1, parentType: 'candidat', parentId: 'cand_R40', idbKey: 'ph_1_a', cloudKey: chemin('ph_1_a'), name: 'cni-dupont.pdf' },
      { id: 2, parentType: 'candidat', parentId: 'cand_R40', idbKey: 'ph_2_b', name: 'bulletins.pdf' },
      { id: 3, parentType: 'candidat', parentId: 'cand_R10', idbKey: 'ph_3_c', cloudKey: chemin('ph_3_c'), name: 'martin.pdf' },
      { id: 4, parentType: 'candidat', parentId: 'cand_LEG', idbKey: 'ph_4_d', cloudKey: chemin('ph_4_d'), name: 'ancien.pdf' },
      { id: 5, parentType: 'bail', parentId: 'cand_CONV', parentRef: 'T3', idbKey: 'ph_5_e', cloudKey: chemin('ph_5_e'), name: 'cni-retenu.pdf' },
      { id: 6, parentType: 'candidat', parentId: 'cand_EC', idbKey: 'ph_6_f', cloudKey: chemin('ph_6_f'), name: 'actif.pdf' },
      { id: 7, parentType: 'logement', parentId: 'cand_R40', idbKey: 'ph_7_g', cloudKey: chemin('ph_7_g'), name: 'dpe.pdf' }
    ]
  };
}

describe('purge RGPD — vrai câblage de _purgeCandidatsRefusesProd', () => {
  it('efface à J+30 du refus : fichiers en ligne PUIS pièces, binaires, relais, fiche — et rien d\'autre', async () => {
    const now = Date.now();
    const DB = parc(now);
    const { app, journal } = monter(DB);
    const r = await app._purgeCandidatsRefusesProd();
    expect(r.purges).toBe(2);                                    // cand_R40 + cand_LEG (refusé avant la mise à jour)
    expect(journal.storage).toEqual([[chemin('ph_1_a')], [chemin('ph_4_d')]]);
    expect(journal.idb.sort()).toEqual(['ph_1_a', 'ph_2_b', 'ph_4_d']);
    expect(journal.relais).toEqual(['cand_R40', 'cand_LEG']);
    const byId = Object.fromEntries(DB.candidats.map(c => [c.id, c]));
    expect(byId.cand_R40).toEqual({ _deleted: true, _deletedAt: 't', _modifiedAt: 't', id: 'cand_R40', entity: 'SCI X' });
    expect(byId.cand_LEG._deleted).toBe(true);
    expect(byId.cand_R10._deleted).toBeUndefined();               // J+10 : conservé
    expect(byId.cand_CONV).toMatchObject({ statut: 'converti', bailRef: 'T3' });   // converti : jamais
    expect(byId.cand_EC._deleted).toBeUndefined();
    const docs = Object.fromEntries(DB.documents.map(d => [d.id, d]));
    // pièces effacées : tombstone SANS nom de fichier ni clé
    expect(docs[1]).toEqual({ _deleted: true, _deletedAt: 't', _modifiedAt: 't', id: 1, parentType: 'candidat', parentId: 'cand_R40' });
    expect(docs[2]._deleted).toBe(true); expect(docs[4]._deleted).toBe(true);
    // pièces intactes : autre candidat, pièce migrée au bail, pièce d'un bien
    expect(docs[3]).toMatchObject({ name: 'martin.pdf', cloudKey: chemin('ph_3_c') });
    expect(docs[5]).toMatchObject({ parentType: 'bail', name: 'cni-retenu.pdf' });
    expect(docs[6]).toMatchObject({ name: 'actif.pdf' });
    expect(docs[7]).toMatchObject({ parentType: 'logement', name: 'dpe.pdf' });
    expect(journal.saves).toBeGreaterThan(0);
  });

  it('migrations de donnée : refuseLe posé sur un refusé récent sans date, score stocké effacé (Q1)', async () => {
    const now = Date.now();
    const DB = parc(now);
    const { app } = monter(DB);
    await app._purgeCandidatsRefusesProd();
    const ec = DB.candidats.find(c => c.id === 'cand_EC');
    expect('confianceScore' in ec).toBe(false);
    expect(DB.candidats.find(c => c.id === 'cand_R10').refuseLe).toBeTruthy();
  });

  it('idempotence : un 2e passage n\'efface plus rien et n\'appelle plus le stockage', async () => {
    const DB = parc(Date.now());
    const { app, journal } = monter(DB);
    await app._purgeCandidatsRefusesProd();
    const avant = journal.storage.length;
    const r2 = await app._purgeCandidatsRefusesProd();
    expect(r2.purges).toBe(0);
    expect(journal.storage.length).toBe(avant);
  });

  it('fichier en ligne qui résiste (refus RLS, réseau) → le candidat reste ENTIER, reprise au passage suivant', async () => {
    const DB = parc(Date.now());
    const { app, journal } = monter(DB, { refusRls: [chemin('ph_1_a')] });
    const r = await app._purgeCandidatsRefusesProd();
    expect(r.purges).toBe(1); expect(r.reportes).toBe(1);
    const c = DB.candidats.find(x => x.id === 'cand_R40');
    expect(c._deleted).toBeUndefined();
    expect(DB.documents.find(d => d.id === 1)).toMatchObject({ name: 'cni-dupont.pdf' });
    expect(journal.idb).not.toContain('ph_1_a');
  });

  it('hors ligne ou lecture seule → rien du tout (reprise au retour)', async () => {
    for (const opts of [{ enLigne: false }, { lectureSeule: true }]) {
      const DB = parc(Date.now());
      const { app, journal } = monter(DB, opts);
      const r = await app._purgeCandidatsRefusesProd();
      expect(r.purges).toBe(0);
      expect(journal.storage.length + journal.idb.length + journal.saves).toBe(0);
      expect(DB.candidats.find(c => c.id === 'cand_R40')._deleted).toBeUndefined();
    }
  });

  it('module de purge absent → aucune action', async () => {
    const DB = parc(Date.now());
    const { app, journal } = monter(DB, { module: false });
    const r = await app._purgeCandidatsRefusesProd();
    expect(r.purges).toBe(0);
    expect(journal.storage.length + journal.idb.length + journal.saves).toBe(0);
    expect(DB.candidats.find(c => c.id === 'cand_R40')._deleted).toBeUndefined();
  });
});

describe('relecture Fable — corrections', () => {
  it('I-1 : candidat repassé « En cours » pendant l\'appel Storage (pull cloud) → ni tombstone, ni effacement local', async () => {
    const DB = parc(Date.now());
    const { app, journal } = monter(DB, { pendantStorage: () => { const c = DB.candidats.find(x => x.id === 'cand_R40'); if (c) { c.statut = 'enCours'; delete c.refuseLe; } } });
    await app._purgeCandidatsRefusesProd();
    const c = DB.candidats.find(x => x.id === 'cand_R40');
    expect(c._deleted).toBeUndefined();
    expect(DB.documents.find(d => d.id === 1)).toMatchObject({ name: 'cni-dupont.pdf' });
    expect(journal.idb).not.toContain('ph_1_a');
  });
  it('I-2 : cloudKey de forme inconnue → candidat conservé, aucun appel Storage pour lui', async () => {
    const DB = parc(Date.now());
    DB.documents.find(d => d.id === 1).cloudKey = 'forme/inconnue.pdf';
    const { app, journal } = monter(DB);
    const r = await app._purgeCandidatsRefusesProd();
    expect(DB.candidats.find(x => x.id === 'cand_R40')._deleted).toBeUndefined();
    expect(journal.storage.flat()).not.toContain('forme/inconnue.pdf');
    expect(r.reportes).toBeGreaterThanOrEqual(1);
  });
  it('I-2 : clé nue legacy acceptée et transmise à la suppression', async () => {
    const DB = parc(Date.now());
    DB.documents.find(d => d.id === 1).cloudKey = 'ph_1_a';
    const { app, journal } = monter(DB);
    await app._purgeCandidatsRefusesProd();
    expect(journal.storage[0]).toEqual(['ph_1_a']);
    expect(DB.candidats.find(x => x.id === 'cand_R40')._deleted).toBe(true);
  });
  it('I-3 : en sandbox, une suppression manuelle ne met JAMAIS de chemin en attente (ni clé prod, ni clé _test_)', async () => {
    const DB = parc(Date.now());
    const { app, store } = monter(DB, { sandbox: true });
    await app._candEffacerPieces([DB.documents.find(d => d.id === 6)]);
    expect(DB.documents.find(d => d.id === 6)._deleted).toBe(true);
    expect(store.size).toBe(0);
  });
});

describe('suppression manuelle (décision Didier 12/10, Q2) — même routine', () => {
  it('pièce de candidat : tombstone immédiat, fichier en ligne effacé ; hors ligne → file d\'attente reprise par la purge', async () => {
    const DB = parc(Date.now());
    const hl = monter(DB, { enLigne: false });
    await hl.app._candEffacerPieces([DB.documents.find(d => d.id === 6)]);
    expect(DB.documents.find(d => d.id === 6)).toMatchObject({ _deleted: true, parentType: 'candidat' });
    expect(JSON.parse(hl.store.get('imsb-cand-purge-attente'))).toEqual([chemin('ph_6_f')]);
    // retour en ligne : la purge reprend la file
    const { app, journal, store } = monter(DB);
    store.set('imsb-cand-purge-attente', hl.store.get('imsb-cand-purge-attente'));
    await app._purgeCandidatsRefusesProd();
    expect(journal.storage[0]).toEqual([chemin('ph_6_f')]);
    expect(store.has('imsb-cand-purge-attente')).toBe(false);
  });

  it('bouton Supprimer d\'une pièce : candidat → effacement réel ; autre pièce → _attachmentDelete (preuve légale inchangée)', async () => {
    const DB = parc(Date.now());
    const { app, journal } = monter(DB);
    await app._handleAttachmentDelete(3);
    await new Promise(r => setTimeout(r, 0));
    expect(DB.documents.find(d => d.id === 3)._deleted).toBe(true);
    expect(journal.storage).toEqual([[chemin('ph_3_c')]]);
    await app._handleAttachmentDelete(7);
    expect(journal.attachmentDelete).toEqual([7]);
    expect(journal.storage.length).toBe(1);                    // aucun appel Storage pour la pièce du bien
  });

  it('_candEffacerPiecesLocales refuse toute pièce qui n\'est pas « candidat »', async () => {
    const DB = parc(Date.now());
    const { app, journal } = monter(DB);
    await app._candEffacerPiecesLocales([5, 7]);
    expect(DB.documents.find(d => d.id === 5)._deleted).toBeUndefined();
    expect(DB.documents.find(d => d.id === 7)._deleted).toBeUndefined();
    expect(journal.idb).toEqual([]);
  });

  it('repasser « En cours » annule la suppression programmée', () => {
    const DB = parc(Date.now());
    const { app } = monter(DB);
    app.setCandidatStatut('cand_R40', 'enCours');
    const c = DB.candidats.find(x => x.id === 'cand_R40');
    expect(c.refuseLe).toBeUndefined();
    expect(CandPurge.candidatsAPurger(DB.candidats, Date.now())).not.toContain('cand_R40');
  });
});
