/**
 * __tests__/helpers/filets-migration.test.js — CDC-STOCKAGE lot 2 (docs/CDC-STOCKAGE.md §3.4, D2 C, G6).
 *
 * Les filets avant migration en IndexedDB `immotrack_backup` / `handles` :
 *   - 1 par migration (`filet:<espace de noms>:<label>`, la suivante écrase), 3 au plus par espace de
 *     noms, 30 jours ; la copie de la base illisible (`corrompu:*`) suit la même durée de vie ;
 *   - purgés au logout / changement d'utilisateur, sans jamais toucher `dirhandle` ;
 *   - G6 : poser un filet n'écrit AUCUN octet en localStorage (espion), la base est figée au moment
 *     de l'appel (la migration la modifie juste après).
 * Logique contre un adaptateur en mémoire ; l'adaptateur IndexedDB réel contre un faux IndexedDB
 * minimal (ouverture en version 1 + création du store, borne de temps, fermeture).
 * Les fonctions de l'app (_filetAvantMigration, _filetsExpirer, _purgerFiletsLocaux) sont EXTRAITES
 * des vrais fichiers puis EXÉCUTÉES.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as F from '../../js/core/filets-migration.js';
import { extraireFonction } from './_extraction-source.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const JOUR = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 9, 6, 12);
const muet = { info() {}, warn() {}, log() {}, error() {} };

/** Adaptateur en mémoire, même contrat que l'adaptateur IndexedDB ({ cles, lire, ecrire, supprimer }). */
function memoire(initial = {}, { refuserEcriture = false } = {}) {
  const m = new Map(Object.entries(initial));
  const journal = [];
  return {
    m, journal,
    cles: async () => [...m.keys()],
    lire: async (k) => (m.has(k) ? structuredClone(m.get(k)) : undefined),
    ecrire: async (k, v) => { journal.push(['ecrire', k]); if (refuserEcriture) throw new Error('QuotaExceededError'); m.set(k, structuredClone(v)); },
    supprimer: async (k) => { journal.push(['supprimer', k]); m.delete(k); },
  };
}
const filet = (ns, label, at) => [F.cleFilet(ns, label), { v: 1, label, ns, at, json: '{"x":"' + label + '"}' }];
const DIRHANDLE = { kind: 'directory', name: 'Sauvegardes' };

describe('planRotation — décision pure', () => {
  it('copie expirée (> 30 jours), heure illisible, heure très future : retirées, tous espaces de noms', () => {
    const entrees = [
      { cle: 'filet:immotrack_v4:a', enr: { at: T0 - 31 * JOUR } },
      { cle: 'filet:_test_immotrack_v4:b', enr: { at: T0 - 31 * JOUR } },
      { cle: 'corrompu:immotrack_v4', enr: { at: new Date(T0 - 40 * JOUR).toISOString() } },
      { cle: 'filet:immotrack_v4:c', enr: { at: 'pas une date' } },
      { cle: 'filet:immotrack_v4:d', enr: null },
      { cle: 'filet:immotrack_v4:e', enr: { at: T0 + 60 * JOUR } },
      { cle: 'filet:immotrack_v4:f', enr: { at: T0 - 29 * JOUR } },
      { cle: 'corrompu:_test_immotrack_v4', enr: { at: new Date(T0 - 2 * JOUR).toISOString() } },
      { cle: 'dirhandle', enr: { at: T0 - 999 * JOUR } },
    ];
    expect(F.planRotation(entrees, { maintenant: T0 }).sort()).toEqual([
      'corrompu:immotrack_v4', 'filet:_test_immotrack_v4:b', 'filet:immotrack_v4:a', 'filet:immotrack_v4:c',
      'filet:immotrack_v4:d', 'filet:immotrack_v4:e',
    ]);
  });
  it('exactement 30 jours : conservée (la limite est « plus de 30 jours »)', () => {
    expect(F.planRotation([{ cle: 'filet:n:a', enr: { at: T0 - 30 * JOUR } }], { maintenant: T0 })).toEqual([]);
  });
  it('plafond par espace de noms : la clé gardée compte, les plus anciennes partent, l’autre espace est intact', () => {
    const entrees = [
      { cle: 'filet:p:a', enr: { at: T0 - 4 * JOUR } },
      { cle: 'filet:p:b', enr: { at: T0 - 3 * JOUR } },
      { cle: 'filet:p:c', enr: { at: T0 - 2 * JOUR } },
      { cle: 'filet:p:neuf', enr: { at: T0 } },
      { cle: 'filet:s:x', enr: { at: T0 - 9 * JOUR } },
      { cle: 'filet:s:y', enr: { at: T0 - 8 * JOUR } },
      { cle: 'filet:s:z', enr: { at: T0 - 7 * JOUR } },
      { cle: 'filet:s:w', enr: { at: T0 - 6 * JOUR } },
    ];
    expect(F.planRotation(entrees, { ns: 'p', maintenant: T0, garder: 'filet:p:neuf' })).toEqual(['filet:p:a']);
  });
  it('un espace de noms préfixe d’un autre ne se confond pas (« p » ≠ « p2 »)', () => {
    const entrees = ['a', 'b', 'c'].map((l, i) => ({ cle: 'filet:p2:' + l, enr: { at: T0 - i * JOUR } }));
    expect(F.planRotation(entrees, { ns: 'p', maintenant: T0, garder: 'filet:p:neuf' })).toEqual([]);
  });
});

describe('poserFilet — rotation 1 par migration, 3 au plus, 30 jours', () => {
  it('même label : la suivante ÉCRASE la précédente (une seule clé)', async () => {
    const a = memoire();
    await F.poserFilet(a, { ns: 'immotrack_v4', label: 'archi-v1', json: '{"v":1}', maintenant: T0 });
    await F.poserFilet(a, { ns: 'immotrack_v4', label: 'archi-v1', json: '{"v":2}', maintenant: T0 + 1000 });
    expect([...a.m.keys()]).toEqual(['filet:immotrack_v4:archi-v1']);
    expect(a.m.get('filet:immotrack_v4:archi-v1')).toEqual({ v: 1, label: 'archi-v1', ns: 'immotrack_v4', at: T0 + 1000, json: '{"v":2}' });
  });
  it('4e migration : la plus ANCIENNE part ; dirhandle et l’autre espace de noms intacts', async () => {
    const a = memoire(Object.fromEntries([
      filet('immotrack_v4', 'm1', T0 - 5 * JOUR), filet('immotrack_v4', 'm2', T0 - 4 * JOUR), filet('immotrack_v4', 'm3', T0 - 3 * JOUR),
      filet('_test_immotrack_v4', 's1', T0 - 9 * JOUR), ['dirhandle', DIRHANDLE],
    ]));
    const r = await F.poserFilet(a, { ns: 'immotrack_v4', label: 'm4', json: '{}', maintenant: T0 });
    expect(r).toMatchObject({ ok: true, cle: 'filet:immotrack_v4:m4', supprimees: ['filet:immotrack_v4:m1'] });
    expect([...a.m.keys()].sort()).toEqual(['dirhandle', 'filet:_test_immotrack_v4:s1', 'filet:immotrack_v4:m2', 'filet:immotrack_v4:m3', 'filet:immotrack_v4:m4']);
    expect(a.m.get('dirhandle')).toEqual(DIRHANDLE);
  });
  it('écrit AVANT de faire la rotation (jamais un filet retiré sans que le nouveau soit écrit)', async () => {
    const a = memoire(Object.fromEntries([filet('n', 'm1', T0 - 3 * JOUR), filet('n', 'm2', T0 - 2 * JOUR), filet('n', 'm3', T0 - 1 * JOUR)]));
    await F.poserFilet(a, { ns: 'n', label: 'm4', json: '{}', maintenant: T0 });
    expect(a.journal).toEqual([['ecrire', 'filet:n:m4'], ['supprimer', 'filet:n:m1']]);
  });
  it('écriture refusée (IndexedDB plein, refus) : ok=false, AUCUN filet existant retiré, ne lève pas', async () => {
    const a = memoire(Object.fromEntries([filet('n', 'm1', T0 - 3 * JOUR), filet('n', 'm2', T0 - 2 * JOUR), filet('n', 'm3', T0 - 1 * JOUR)]), { refuserEcriture: true });
    const r = await F.poserFilet(a, { ns: 'n', label: 'm4', json: '{}', maintenant: T0 });
    expect(r.ok).toBe(false);
    expect(a.m.size).toBe(3);
    expect(a.journal).toEqual([['ecrire', 'filet:n:m4']]);
  });
  it('la pose retire aussi les copies expirées (base illisible de plus de 30 jours comprise)', async () => {
    const a = memoire({ 'corrompu:immotrack_v4': { at: new Date(T0 - 45 * JOUR).toISOString(), raw: '{' } });
    const r = await F.poserFilet(a, { ns: 'immotrack_v4', label: 'x', json: '{}', maintenant: T0 });
    expect(r.supprimees).toEqual(['corrompu:immotrack_v4']);
  });
});

describe('expirerCopies et purgerCopies', () => {
  it('passe de démarrage : seules les copies de plus de 30 jours partent', async () => {
    const a = memoire(Object.fromEntries([
      filet('n', 'vieux', T0 - 31 * JOUR), filet('n', 'recent', T0 - 1 * JOUR),
      ['corrompu:n', { at: new Date(T0 - 31 * JOUR).toISOString(), raw: 'x' }], ['dirhandle', DIRHANDLE],
    ]));
    expect((await F.expirerCopies(a, { maintenant: T0 })).sort()).toEqual(['corrompu:n', 'filet:n:vieux']);
    expect([...a.m.keys()].sort()).toEqual(['dirhandle', 'filet:n:recent']);
  });
  it('purge RGPD : TOUTES les copies de la base (tous espaces de noms), jamais dirhandle ni une clé étrangère', async () => {
    const a = memoire(Object.fromEntries([
      filet('immotrack_v4', 'a', T0), filet('_test_immotrack_v4', 'b', T0),
      ['corrompu:immotrack_v4', { at: 'x', raw: 'y' }], ['dirhandle', DIRHANDLE], ['autre', 1],
    ]));
    expect((await F.purgerCopies(a)).length).toBe(3);
    expect([...a.m.keys()].sort()).toEqual(['autre', 'dirhandle']);
  });
  it('IndexedDB qui lève : rien ne remonte (ne lève jamais)', async () => {
    const casse = { cles: async () => { throw new Error('SecurityError'); } };
    expect(await F.purgerCopies(casse)).toEqual([]);
    expect(await F.expirerCopies(casse, { maintenant: T0 })).toEqual([]);
  });
});

/** Faux IndexedDB minimal : bases { version, stores: Map<nom, Map> }, callbacks asynchrones. */
function fauxIndexedDB({ muet = false } = {}) {
  const bases = new Map();
  const trace = { ouvertures: [], fermetures: 0 };
  const asynchrone = fn => setTimeout(fn, 0);
  const connexion = (b) => ({
    objectStoreNames: { contains: n => b.stores.has(n) },
    createObjectStore: n => { b.stores.set(n, new Map()); },
    close: () => { trace.fermetures++; },
    transaction: (nom, mode) => {
      const t = {};
      const st = b.stores.get(nom);
      if (!st) throw new Error('NotFoundError');
      const req = (fn) => { const r = {}; asynchrone(() => { r.result = fn(); r.onsuccess && r.onsuccess(); asynchrone(() => t.oncomplete && t.oncomplete()); }); return r; };
      t.objectStore = () => ({
        get: k => req(() => st.get(k)),
        put: (v, k) => { if (mode !== 'readwrite') throw new Error('ReadOnlyError'); return req(() => { st.set(k, structuredClone(v)); }); },
        delete: k => req(() => { st.delete(k); }),
        getAllKeys: () => req(() => [...st.keys()]),
      });
      return t;
    },
  });
  return {
    bases, trace,
    open(nom, version) {
      trace.ouvertures.push([nom, version]);
      const r = {};
      if (muet) return r;
      asynchrone(() => {
        let b = bases.get(nom);
        const neuve = !b;
        if (!b) { b = { version: version || 1, stores: new Map() }; bases.set(nom, b); }
        r.result = connexion(b);
        if (neuve && r.onupgradeneeded) r.onupgradeneeded();
        r.onsuccess && r.onsuccess();
      });
      return r;
    },
  };
}

describe('adaptateurIndexedDB — la base existante, ouverte comme _bkIdbOpen', () => {
  it('ouvre `immotrack_backup` en VERSION 1 et crée le store `handles` s’il manque ; ferme chaque connexion', async () => {
    const idb = fauxIndexedDB();
    const a = F.adaptateurIndexedDB(idb, { delaiMs: 200 });
    await a.ecrire('filet:n:x', { at: T0, json: '{}' });
    expect(await a.lire('filet:n:x')).toEqual({ at: T0, json: '{}' });
    expect(await a.cles()).toEqual(['filet:n:x']);
    await a.supprimer('filet:n:x');
    expect(await a.cles()).toEqual([]);
    expect(idb.trace.ouvertures.every(([n, v]) => n === 'immotrack_backup' && v === 1)).toBe(true);
    expect([...idb.bases.get('immotrack_backup').stores.keys()]).toEqual(['handles']);
    await new Promise(r => setTimeout(r, 5));
    expect(idb.trace.fermetures).toBe(idb.trace.ouvertures.length);
  });
  it('IndexedDB MUET (certains iOS) : chaque opération est bornée — la purge rend la main', async () => {
    const a = F.adaptateurIndexedDB(fauxIndexedDB({ muet: true }), { delaiMs: 20 });
    await expect(a.cles()).rejects.toThrow('indexeddb-muet');
    expect(await F.purgerCopies(a)).toEqual([]);
    expect((await F.poserFilet(a, { ns: 'n', label: 'x', json: '{}' })).ok).toBe(false);
  });
});

// ── Les fonctions de l'APP, extraites et exécutées ──────────────────────────────────────────

/** Un localStorage espion : toute écriture est comptée (G6 : il n'y en a aucune). */
function espionLocalStorage() {
  const ecritures = [];
  const ls = {
    getItem: () => null, key: () => null, length: 0,
    setItem: (k, v) => { ecritures.push(['setItem', k, String(v).length]); },
    removeItem: (k) => { ecritures.push(['removeItem', k]); },
    clear: () => { ecritures.push(['clear']); },
  };
  return { ls, ecritures };
}

describe('G6 — _filetAvantMigration (js/app/app-part2.js), exécutée', () => {
  let SRC2;
  beforeAll(() => { SRC2 = readFileSync(resolve(repoRoot, 'js/app/app-part2.js'), 'utf8'); });

  function monter({ DB, KEY = 'immotrack_v4', adaptateur, filets = F, sansIdb = false }) {
    const { ls, ecritures } = espionLocalStorage();
    const window = { _filets: filets && Object.assign({}, filets, { adaptateurIndexedDB: () => adaptateur }) };
    const deps = { window, indexedDB: sansIdb ? undefined : {}, localStorage: ls, console: muet, KEY, DB };
    const noms = Object.keys(deps);
    const code = 'let _filetsAdaptateur = null;\n' + extraireFonction(SRC2, '_filetsIdb') + '\n'
      + extraireFonction(SRC2, '_filetAvantMigration') + '\n' + extraireFonction(SRC2, '_filetsExpirer')
      + '\nreturn { _filetAvantMigration, _filetsExpirer };';
    return { fns: new Function(...noms, code)(...noms.map(n => deps[n])), ecritures };
  }

  it('aucun octet en localStorage ; la base est FIGÉE au moment de l’appel (avant la migration)', async () => {
    const DB = { logements: [{ ref: 'A1', typeUsage: null }], baux: {} };
    const a = memoire();
    const { fns, ecritures } = monter({ DB, adaptateur: a });
    const p = fns._filetAvantMigration('archi-v1');
    DB.logements[0].typeUsage = 'habitation';            // la migration modifie la base JUSTE après l'appel
    const r = await p;
    expect(r.ok).toBe(true);
    expect(ecritures).toEqual([]);
    const enr = a.m.get('filet:immotrack_v4:archi-v1');
    expect(JSON.parse(enr.json)).toEqual({ logements: [{ ref: 'A1', typeUsage: null }], baux: {} });
  });
  it('sandbox : espace de noms `_test_immotrack_v4` (un filet de test ne peut pas évincer ceux de la prod)', async () => {
    const a = memoire(Object.fromEntries([filet('immotrack_v4', 'p1', T0), filet('immotrack_v4', 'p2', T0), filet('immotrack_v4', 'p3', T0)]));
    const { fns } = monter({ DB: {}, KEY: '_test_immotrack_v4', adaptateur: a });
    for (const l of ['s1', 's2', 's3', 's4']) await fns._filetAvantMigration(l);
    const cles = [...a.m.keys()];
    expect(cles.filter(k => k.startsWith('filet:immotrack_v4:')).length).toBe(3);
    expect(cles.filter(k => k.startsWith('filet:_test_immotrack_v4:')).length).toBe(3);
  });
  it('module absent (file://) ou IndexedDB indisponible : rien, ne lève pas, aucune écriture localStorage', async () => {
    const sansModule = monter({ DB: {}, adaptateur: memoire(), filets: null });
    expect(await sansModule.fns._filetAvantMigration('x')).toBeNull();
    expect(sansModule.ecritures).toEqual([]);
    const sansIdb = monter({ DB: {}, adaptateur: memoire(), sansIdb: true });
    expect(await sansIdb.fns._filetAvantMigration('x')).toBeNull();
  });
  it('IndexedDB qui refuse l’écriture : la migration n’est pas bloquée (résout, ne lève pas)', async () => {
    const { fns, ecritures } = monter({ DB: {}, adaptateur: memoire({}, { refuserEcriture: true }) });
    expect((await fns._filetAvantMigration('x')).ok).toBe(false);
    expect(ecritures).toEqual([]);
  });
  it('_filetsExpirer : passe de démarrage sur le vrai module', async () => {
    const a = memoire(Object.fromEntries([filet('immotrack_v4', 'vieux', Date.now() - 40 * JOUR), filet('immotrack_v4', 'neuf', Date.now())]));
    const { fns, ecritures } = monter({ DB: {}, adaptateur: a });
    expect(await fns._filetsExpirer()).toEqual(['filet:immotrack_v4:vieux']);
    expect(ecritures).toEqual([]);
  });
  it('migrations archi-v1 / archi-v4b : filet posé SEULEMENT hors boot cloud (en cloud, base vide)', () => {
    // Les deux appels, tels qu'écrits : chacun gardé par !_CLOUD_BOOT, et plus aucun ancien filet.
    const appels = (SRC2.match(/^.*_filetAvantMigration\('archi-v(?:1|4b)'\).*$/gm) || []).filter(l => !/^\s*\/\//.test(l));
    expect(appels.length).toBe(2);
    for (const l of appels) expect(l).toMatch(/if\s*\(\s*isFirstRun\s*&&\s*!_CLOUD_BOOT\s*\)\s*_filetAvantMigration\(/);
    expect(SRC2).not.toMatch(/_backupBeforeMigration/);
  });
});

describe('S-7 — _purgerFiletsLocaux (js/app/supabase-entry.js), exécutée', () => {
  let SRC;
  beforeAll(() => { SRC = readFileSync(resolve(repoRoot, 'js/app/supabase-entry.js'), 'utf8'); });
  const monter = (module, adaptateur, sansIdb = false) => new Function('_filetsMigration', 'indexedDB', 'console',
    'async ' + extraireFonction(SRC, '_purgerFiletsLocaux') + '\nreturn _purgerFiletsLocaux;')(
    module && Object.assign({}, module, { adaptateurIndexedDB: () => adaptateur }), sansIdb ? undefined : {}, muet);

  it('retire filets et base illisible, garde dirhandle', async () => {
    const a = memoire(Object.fromEntries([filet('immotrack_v4', 'a', T0), ['corrompu:immotrack_v4', { at: 'x' }], ['dirhandle', DIRHANDLE]]));
    await monter(F, a)('logout');
    expect([...a.m.keys()]).toEqual(['dirhandle']);
  });
  it('module absent ou IndexedDB qui lève : ne lève jamais (la déconnexion continue)', async () => {
    await expect(monter(null, memoire())('logout')).resolves.toBeUndefined();
    await expect(monter(F, { cles: async () => { throw new Error('x'); } })('logout')).resolves.toBeUndefined();
    await expect(monter(F, memoire(), true)('logout')).resolves.toBeUndefined();
  });
});
