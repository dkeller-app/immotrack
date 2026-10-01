/**
 * __tests__/helpers/miroir-cablage.test.js — CDC-STOCKAGE lot 4 : les LECTEURS et ÉCRIVAINS de l'app
 * rebranchés sur le miroir IndexedDB, EXÉCUTÉS tels qu'ils sont écrits dans les fichiers.
 *
 * Les tests hors ligne existants (offline-cablage, offline-boot, offline-ui, supabase-offline-auth)
 * exercent toujours le chemin localStorage (module de miroir absent) et restent inchangés. Ici, le
 * même code réel reçoit le VRAI module js/core/miroir-local.js, branché sur un IndexedDB de
 * laboratoire : c'est le chemin de la prod après le lot 4.
 *
 * Ce qui exige un vrai compte cloud (connexion, hydratation, envoi réel) est couvert ici par le code
 * réel de F1 / du démarrage hors ligne / de la garde et de la purge, avec des doubles pour le réseau.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createBoot } from '../../js/app/supabase-boot.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as OfflineBoot from '../../js/core/offline-boot.js';
import * as CachePurge from '../../js/core/cache-purge.js';
import * as Stockage from '../../js/core/stockage-local.js';
import { creerMiroir, JOURNAL_EDL_KEY } from '../../js/core/miroir-local.js';
import { fauxStockageQuota } from './_faux-stockage-quota.js';
import { extraireFonction, accolades } from './_extraction-source.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let ENTRY, HTML;
beforeAll(() => {
  ENTRY = readFileSync(resolve(repoRoot, 'js/app/supabase-entry.js'), 'utf8');
  HTML = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
});
const muet = { info() {}, warn() {}, log() {}, error() {} };
const flush = () => new Promise(r => setTimeout(r, 0));

/** IndexedDB de laboratoire (voir miroir-local.test.js). */
function fauxIdb(initial = null) {
  let enr = initial;
  const ops = [];
  const r = { suspendre: false, suspendues: [] };
  return {
    r, ops, get enr() { return enr; },
    async lire() { ops.push('lire'); return enr; },
    ecrire(e) { ops.push('ecrire'); if (r.suspendre) return new Promise(res => r.suspendues.push(() => { enr = e; res(); })); enr = e; return Promise.resolve(); },
    async effacer() { ops.push('effacer'); enr = null; },
    async supprimerBase() { ops.push('supprimerBase'); enr = null; },
  };
}
/** Le `_miroirLocal` tel que supabase-entry le voit (module importé), autour d'UNE instance. */
const moduleMiroir = (m) => ({ miroir: () => m });
const base = (edl = []) => ({ baux: {}, logements: [{ ref: 'A' }], edl });
const edl = (id, t, extra = {}) => ({ id, logement: 'A', type: 'Entrée', _modifiedAt: new Date(t).toISOString(), ...extra });
const TAG = JSON.stringify({ userId: 'u1', espaceId: 'e1' });

// ── F1 : la remontée des EDL hors ligne au démarrage EN LIGNE ─────────────────────────────────
function monterF1({ stockage, miroirLocal, flushLeve = false, cloud = base([]) }) {
  const seq = [];
  const api = {
    seed: () => seq.push('seed'),
    flush: async (d) => {
      seq.push('flush'); seq.flushe = d;
      if (flushLeve) throw new Error('sealSignedBaux : empreinte impossible');   // non isolé par enregistrement
      return { upserts: [], errors: [], conflicts: [], skipped: [] };
    },
  };
  const fn = new Function('window', 'localStorage', 'MIRROR_KEY', '_offlineBoot', '_recordKey', 'console', '_miroirLocal',
    'return async ' + extraireFonction(ENTRY, '_remonterTravailHorsLigne'))(
    { __immoCrumb: () => {} }, stockage, 'immotrack_v4', OfflineBoot, null, muet, miroirLocal);
  return { lancer: () => fn({ api, db: cloud, setSync: () => {}, tagMiroir: 'same', espacesAutorises: { e1: 'u1' } }), seq };
}

describe('F1 sur le miroir IndexedDB — ZÉRO PERTE D’EDL fait hors ligne', () => {
  it('GATE (a) — miroir localStorage existant avec un EDL non remonté : transféré en IndexedDB, puis REMONTÉ au démarrage en ligne', async () => {
    const brut = JSON.stringify(base([edl(77, Date.UTC(2026, 8, 30, 8), { pieces: [{ nom: 'Cuisine' }] })]));
    const st = fauxStockageQuota({ initial: {
      immotrack_v4: brut, immotrack_v4_ecrit_at: '1790000000000', immotrack_v4_flush_at: '1780000000000', immotrack_v4_tag: TAG,
    } });
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    expect((await m.initialiser()).transfert).toBe('fait');
    expect(st.getItem('immotrack_v4')).toBeNull();                          // la clé locale est libérée…
    const { lancer, seq } = monterF1({ stockage: st, miroirLocal: moduleMiroir(m) });
    const r = await lancer();
    expect(r.ajoutes).toBe(1);                                              // …et l'EDL remonte quand même
    expect(seq.flushe.edl.map(x => x.id)).toEqual([77]);
    expect(seq.flushe.edl[0].pieces[0].nom).toBe('Cuisine');
  });

  it('app TUÉE pendant la transaction IndexedDB d’un EDL fait hors ligne : F1 le remonte (journal synchrone)', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG } });
    const idb = fauxIdb({ v: 1, ecritA: 900, json: JSON.stringify(base([])) });
    const m1 = creerMiroir({ idb, stockage: st, horloge: () => 5000 });
    await m1.initialiser();
    idb.r.suspendre = true;
    m1.ecrire(base([edl(42, 4000)]));                                       // saveDB({ quoi:'edl' }) hors ligne
    await flush();                                                          // …et l'app meurt ici
    const m2 = creerMiroir({ idb: fauxIdb(idb.enr), stockage: st });        // redémarrage EN LIGNE
    await m2.initialiser();
    const { lancer, seq } = monterF1({ stockage: st, miroirLocal: moduleMiroir(m2) });
    const r = await lancer();
    expect(r.ajoutes).toBe(1);
    expect(seq.flushe.edl.map(x => x.id)).toEqual([42]);
  });
});

// ── Démarrage hors ligne ─────────────────────────────────────────────────────────────────────
describe('onHorsLigne — le démarrage hors ligne lit le miroir IndexedDB', () => {
  it('GATE (b) — la base affichée hors ligne vient d’IndexedDB, journal des EDL superposé', async () => {
    const st = fauxStockageQuota({ initial: {
      immotrack_v4_ecrit_at: String(Date.now()), immotrack_v4_espaces: JSON.stringify(['e1']),
      [JOURNAL_EDL_KEY]: JSON.stringify({ ecritA: 2, edl: [edl(5, 2000)] }),
    } });
    const idb = fauxIdb({ v: 1, ecritA: 1, json: JSON.stringify(Object.assign(base([edl(4, 1000)]), { logements: [{ ref: 'A' }, { ref: 'B' }] })) });
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    let injecte = null;
    const win = { __immoSetDB: d => { injecte = d; return true; }, __immoRender: () => {}, __immoEntrerHorsLigne: () => {}, __immoCrumb: () => {} };
    const fn = new Function('window', 'localStorage', 'document', 'MIRROR_KEY', '_offlineBoot', '_liftDriveGate', 'wireLoginForm', 'console', '_miroirLocal',
      'return async ' + extraireFonction(ENTRY, 'onHorsLigne'))(
      win, st, { documentElement: { removeAttribute() {} } }, 'immotrack_v4', OfflineBoot, () => {}, () => { throw new Error('ne doit pas revenir au formulaire'); }, muet, moduleMiroir(m));
    await fn({}, { remove() {} }, { user: { email: 'd@e.fr' } });
    expect(injecte.logements.map(l => l.ref)).toEqual(['A', 'B']);
    expect(injecte.edl.map(e => e.id).sort()).toEqual([4, 5]);
    expect(win.__immoHorsLigne).toBe(true);
  });
});

// ── Garde de déconnexion ─────────────────────────────────────────────────────────────────────
describe('_refusDeconnexionLocale — un miroir IndexedDB compte (plus de clé locale)', () => {
  it('hors ligne, travail non parti, miroir SEULEMENT en IndexedDB : la déconnexion est REFUSÉE', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_ecrit_at: '2000', immotrack_v4_flush_at: '1000' } });
    const m = creerMiroir({ idb: fauxIdb({ v: 1, ecritA: 2000, json: JSON.stringify(base()) }), stockage: st });
    await m.initialiser();
    expect(st.getItem('immotrack_v4')).toBeNull();
    const fn = new Function('window', 'localStorage', 'MIRROR_KEY', '_offlineBoot', 'console', '_miroirLocal',
      'return ' + extraireFonction(ENTRY, '_refusDeconnexionLocale'))({ __immoHorsLigne: true }, st, 'immotrack_v4', OfflineBoot, muet, moduleMiroir(m));
    expect(fn({ api: { sync: null }, forcer: false })).toMatchObject({ ok: false, raison: 'hors-ligne-non-synchronise' });
  });
  it('`_ecrit_at` perdu (navigateur tué) : `travailA` en IndexedDB suffit à refuser (O4)', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '1000' } });
    const m = creerMiroir({ idb: fauxIdb({ v: 2, ecritA: 3000, travailA: 3000, tag: null, json: JSON.stringify(base()) }), stockage: st });
    await m.initialiser();
    const fn = new Function('window', 'localStorage', 'MIRROR_KEY', '_offlineBoot', 'console', '_miroirLocal',
      'return ' + extraireFonction(ENTRY, '_refusDeconnexionLocale'))({ __immoHorsLigne: true }, st, 'immotrack_v4', OfflineBoot, muet, moduleMiroir(m));
    expect(fn({ api: { sync: null }, forcer: false })).toMatchObject({ ok: false, raison: 'hors-ligne-non-synchronise' });
  });
});

// ── Purges ───────────────────────────────────────────────────────────────────────────────────
function extraireTeardown(src) {
  const debut = src.indexOf('_teardownSession = async (');
  const fleche = src.indexOf('=> {', debut);
  return accolades(src, fleche + 3);
}
describe('Purges RGPD du miroir IndexedDB', () => {
  it('GATE (d) — logout : la base `immotrack_miroir` est SUPPRIMÉE avant le rechargement, journal retiré', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_ecrit_at: '1', immotrack_v4_flush_at: '2', [JOURNAL_EDL_KEY]: '{"edl":[]}' } });
    const idb = fauxIdb({ v: 1, ecritA: 1, json: JSON.stringify(base()) });
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    const ordre = [];
    const deps = {
      window: {}, console: muet, localStorage: st, MIRROR_KEY: 'immotrack_v4', MIRROR_TAG_KEY: CachePurge.MIRROR_TAG_KEY,
      _offlineBoot: OfflineBoot, _cachePurge: CachePurge, _liveDBRef: null, appDbFrom: () => ({}),
      _refusDeconnexionLocale: () => null, api: { logout: async () => ({ ok: true }) },
      _supaClient: { auth: { signOut: async () => {} } }, _purgerCopiesLocales: () => {}, _purgeAuthTokenKeys: () => {},
      _deletePhotosDb: async () => {}, location: { reload: () => ordre.push('reload:' + (idb.enr === null ? 'base-absente' : 'base-PRESENTE')) },
      _miroirLocal: moduleMiroir(m),
    };
    const noms = Object.keys(deps);
    const fn = new Function(...noms, 'return async ({ flush, keepPhotos, forcer }) => ' + extraireTeardown(ENTRY))(...noms.map(n => deps[n]));
    await fn({ flush: true });
    expect(idb.ops).toContain('supprimerBase');
    expect(ordre).toEqual(['reload:base-absente']);
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    expect(m.ecrire(base([edl(1, 1)]))).toBe(true);                        // après la purge : plus rien n'est écrit
    await m.attendre();
    expect(idb.enr).toBeNull();
  });

  it('ordre F14.1 dans onLoggedIn : l’effacement IndexedDB de l’ancien propriétaire est TERMINÉ avant la pose du nouveau tag', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: JSON.stringify({ userId: 'u-a', espaceId: 'e-a' }) } });
    let liberer;
    const idb = fauxIdb({ v: 2, ecritA: 1, tag: st.getItem('immotrack_v4_tag'), json: JSON.stringify(base([edl(1, 1)])) });
    idb.effacer = () => new Promise(res => { liberer = () => { idb.ops.push('effacer-fini'); res(); }; });
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    const i = ENTRY.indexOf('_tagMiroirAvantLogin = _purgerCacheAuLogin(');
    const bloc = accolades(ENTRY, ENTRY.lastIndexOf('try {', i) + 4);
    const purgeDeps = { console: muet, localStorage: st, MIRROR_KEY: 'immotrack_v4', MIRROR_TAG_KEY: CachePurge.MIRROR_TAG_KEY,
      _offlineBoot: OfflineBoot, _cachePurge: CachePurge, _purgerCopiesLocales: () => {}, _miroirLocal: moduleMiroir(m) };
    const noms = Object.keys(purgeDeps);
    const purger = new Function(...noms, 'return ' + extraireFonction(ENTRY, '_purgerCacheAuLogin'))(...noms.map(n => purgeDeps[n]));
    const deps = {
      _purgerCacheAuLogin: purger, _deletePhotosDb: async () => {}, user: { id: 'u-b' }, esp: { espaceId: 'e-b' }, console: muet,
      _miroirLocal: moduleMiroir(m), _ecrireTagEtEspacesLogin: () => idb.ops.push('tag:' + (idb.ops.includes('effacer-fini') ? 'APRÈS effacement' : 'AVANT effacement')),
    };
    const n2 = Object.keys(deps);
    const p = new Function(...n2, "let _tagMiroirAvantLogin = 'untagged'; return (async () => { try " + bloc + ' catch (e) {} return _tagMiroirAvantLogin; })()')(...n2.map(n => deps[n]));
    await flush(); await flush();
    expect(idb.ops.filter(x => x.startsWith('tag:'))).toEqual([]);          // le tag attend l'effacement
    liberer();
    expect(await p).toBe('other-user');
    expect(idb.ops.filter(x => x.startsWith('tag:'))).toEqual(['tag:APRÈS effacement']);
  });

  it('changement d’utilisateur au login : `_purgerCacheAuLogin` oublie le miroir IndexedDB et le journal', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: JSON.stringify({ userId: 'u-a', espaceId: 'e-a' }), [JOURNAL_EDL_KEY]: '{"edl":[{"id":1}]}' } });
    const idb = fauxIdb({ v: 1, ecritA: 1, json: JSON.stringify(base([edl(1, 1)])) });
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    const deps = {
      console: muet, localStorage: st, MIRROR_KEY: 'immotrack_v4', MIRROR_TAG_KEY: CachePurge.MIRROR_TAG_KEY,
      _offlineBoot: OfflineBoot, _cachePurge: CachePurge, _purgerCopiesLocales: () => {}, _miroirLocal: moduleMiroir(m),
    };
    const noms = Object.keys(deps);
    const fn = new Function(...noms, 'return ' + extraireFonction(ENTRY, '_purgerCacheAuLogin'))(...noms.map(n => deps[n]));
    expect(fn({ user: { id: 'u-b' }, esp: { espaceId: 'e-b' } })).toBe('other-user');
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();                        // synchrone
    await m.attendre(); await flush();
    expect(idb.ops).toContain('effacer');
    expect(idb.enr).toBeNull();
  });
});

// ── Écrivains ────────────────────────────────────────────────────────────────────────────────
// ── R1 dans le câblage : F1 sur un miroir ILLISIBLE ──────────────────────────────────────────
describe('R1 — F1 sur un miroir IndexedDB illisible : protégé, dernier envoi figé, déconnexion refusée', () => {
  it('F1 remonte ce qui est lisible, protège le miroir et N’AVANCE PAS `_flush_at` ; la garde refuse ensuite', async () => {
    const st = fauxStockageQuota({ initial: {
      immotrack_v4_ecrit_at: '5000', immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG,
      [JOURNAL_EDL_KEY]: JSON.stringify({ ecritA: 5000, edl: [edl(8, 4000)] }),
    } });
    const disque = fauxIdb({ v: 2, ecritA: 4000, tag: TAG, json: JSON.stringify(base([edl(42, 3000)])) });
    const m = creerMiroir({ idb: disque, stockage: st, delaiMs: 20 });
    await m.initialiser();
    disque.lire = async () => { throw new Error('UnknownError'); };           // IndexedDB illisible au moment de F1
    const { lancer, seq } = monterF1({ stockage: st, miroirLocal: moduleMiroir(m) });
    const r = await lancer();
    expect(seq.flushe.edl.map(x => x.id)).toEqual([8]);                     // le lisible (journal) remonte
    expect(r.envoiOk).toBe(true);
    expect(m.protege()).toBe(true);
    expect(st.getItem('immotrack_v4_flush_at')).toBe('1000');               // F1 réessaiera au prochain démarrage
    const refus = new Function('window', 'localStorage', 'MIRROR_KEY', '_offlineBoot', 'console', '_miroirLocal',
      'return ' + extraireFonction(ENTRY, '_refusDeconnexionLocale'))({ __immoHorsLigne: false }, st, 'immotrack_v4', OfflineBoot, muet, moduleMiroir(m));
    expect(refus({ api: { sync: {} }, forcer: false })).toMatchObject({ ok: false, raison: 'miroir-illisible' });   // même EN LIGNE, moteur présent
  });

  it('F1 : `_ecrit_at` perdu (navigateur tué) mais `travailA` en IndexedDB → F1 pousse quand même (O4)', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG } });
    const m = creerMiroir({ idb: fauxIdb({ v: 2, ecritA: 4000, travailA: 4000, tag: TAG, json: JSON.stringify(base([edl(55, 3000)])) }), stockage: st });
    await m.initialiser();
    const { lancer, seq } = monterF1({ stockage: st, miroirLocal: moduleMiroir(m) });
    expect((await lancer()).ajoutes).toBe(1);
    expect(seq.flushe.edl.map(x => x.id)).toEqual([55]);
  });
});

// ── Contre-audit C1 / C2 / X4 / X5 ───────────────────────────────────────────────────────────
/** Le vrai rebase du login (`_ecrireMiroir`), branché sur le miroir. */
function rebase(st, m) {
  return new Function('_stockageLocal', 'localStorage', 'MIRROR_KEY', 'console', '_miroirLocal',
    'return ' + extraireFonction(ENTRY, '_ecrireMiroir'))(Stockage, st, 'immotrack_v4', muet, moduleMiroir(m));
}
/** Le vrai `runFlush` d'onLoggedIn (fonction fléchée), avec des doubles pour le reste de la session. */
function monterRunFlush({ st, m }) {
  const debut = ENTRY.indexOf('const runFlush = async (fn) => {');
  const corps = accolades(ENTRY, ENTRY.indexOf('=> {', debut) + 3);
  const deps = {
    flushTimer: null, setSync: () => {}, _sessionDead: () => {}, _deadShown: false, backoffUntil: 0,
    _miroirLocal: m ? moduleMiroir(m) : null, _offlineBoot: OfflineBoot, localStorage: st, _liveChannel: null,
    _hasCloudWrites: null, _auditCloudFlush: () => {}, _conflitsEdlEnAttente: [], _repullCloud: () => {},
    navigator: { onLine: true }, console: muet,
  };
  const noms = Object.keys(deps);
  return new Function(...noms, 'return async (fn) => ' + corps)(...noms.map(n => deps[n]));
}
const propre = async () => ({ upserts: [], errors: [], conflicts: [], skipped: [] });

describe('C1 — l’envoi de F1 LÈVE : le rebase n’écrase pas le miroir, `_flush_at` reste figé', () => {
  it('EDL engagé en IndexedDB : F1 rend la base du cloud mais PROTÈGE ; le vrai rebase FUSIONNE (EDL 42 conservé)', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_ecrit_at: '5000', immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG } });
    const disque = fauxIdb({ v: 2, ecritA: 5000, travailA: 5000, tag: TAG, json: JSON.stringify(base([edl(42, 4000)])) });
    const m = creerMiroir({ idb: disque, stockage: st });
    await m.initialiser();
    const { lancer } = monterF1({ stockage: st, miroirLocal: moduleMiroir(m), flushLeve: true });
    const r = await lancer();
    expect(r.db.edl).toEqual([]);                                          // la base du cloud, sans l'EDL
    expect(m.protege()).toBe(true);
    rebase(st, m)(r.db);
    m.ecrire(Object.assign({}, r.db, { baux: { X: 1 } }));                  // un saveDB ordinaire
    await m.attendre();
    expect(JSON.parse(disque.enr.json).edl.map(e => e.id)).toEqual([42]);
    await monterRunFlush({ st, m })(propre);                                // un flush propre de la session
    expect(st.getItem('immotrack_v4_flush_at')).toBe('1000');              // figé : F1 réessaiera
  });

  it('EDL resté au JOURNAL seulement (app tuée avant la transaction) : il ne quitte jamais le journal', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_ecrit_at: '5000', immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG,
      [JOURNAL_EDL_KEY]: JSON.stringify({ ecritA: 5000, edl: [edl(77, 4000)] }) } });
    const disque = fauxIdb({ v: 2, ecritA: 900, travailA: 900, tag: TAG, json: JSON.stringify(base([])) });
    const m = creerMiroir({ idb: disque, stockage: st });
    await m.initialiser();
    const r = await monterF1({ stockage: st, miroirLocal: moduleMiroir(m), flushLeve: true }).lancer();
    rebase(st, m)(r.db);
    m.ecrire(Object.assign({}, r.db, { edl: [edl(5, 6000)] }));             // une saisie de la session
    await m.attendre();
    const j = JSON.parse(st.getItem(JOURNAL_EDL_KEY)).edl.map(e => e.id).sort();
    expect(j).toEqual([5, 77]);                                            // 77 TOUJOURS là
    expect((await m.lire()).edl.map(e => e.id).sort()).toEqual([5, 77]);
  });
});

describe('C2 — navigateur tué puis IndexedDB muet au démarrage suivant', () => {
  it('IndexedDB RESTE muet : F1 protège avant la sortie anticipée ; rien n’écrase la base ; démarrage suivant → F1 pousse', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG } });   // `_ecrit_at` PERDU
    const enr = { v: 2, ecritA: 5000, travailA: 5000, tag: TAG, json: JSON.stringify(base([edl(42, 4000)])) };
    const muetIdb = fauxIdb(enr); muetIdb.lire = async () => { throw new Error('indexeddb-muet'); };
    const m2 = creerMiroir({ idb: muetIdb, stockage: st, delaiMs: 20, signaler: () => {} });
    await m2.initialiser();
    expect(m2.incertain()).toBe(true);
    const r = await monterF1({ stockage: st, miroirLocal: moduleMiroir(m2) }).lancer();
    expect(r.ajoutes).toBe(0);                                              // rien de lisible à remonter…
    expect(m2.protege()).toBe(true);                                        // …mais le miroir est PROTÉGÉ
    rebase(st, m2)(r.db);
    m2.ecrire(Object.assign({}, r.db, { baux: { X: 1 } }));
    await monterRunFlush({ st, m: m2 })(propre);
    expect(st.getItem('immotrack_v4_flush_at')).toBe('1000');
    expect(JSON.parse(st.getItem('immotrack_v4')).baux).toEqual({ X: 1 }); // Q3 : copie hors ligne complète (elle tient)
    const refus = new Function('window', 'localStorage', 'MIRROR_KEY', '_offlineBoot', 'console', '_miroirLocal',
      'return ' + extraireFonction(ENTRY, '_refusDeconnexionLocale'))({}, st, 'immotrack_v4', OfflineBoot, muet, moduleMiroir(m2));
    expect(refus({ api: { sync: {} }, forcer: false })).toMatchObject({ raison: 'miroir-illisible' });
    expect(muetIdb.enr.json).toBe(enr.json);                                // la base IndexedDB n'a pas été touchée
    // Démarrage 3 : IndexedDB revenu.
    const m3 = creerMiroir({ idb: fauxIdb(enr), stockage: st });
    await m3.initialiser();
    const f3 = monterF1({ stockage: st, miroirLocal: moduleMiroir(m3) });
    expect((await f3.lancer()).ajoutes).toBe(1);
    expect(f3.seq.flushe.edl.map(e => e.id)).toEqual([42]);
  });

  it('X4 — IndexedDB muet au démarrage SEULEMENT et `_ecrit_at` perdu : F1 RETENTE, voit travailA et pousse tout de suite', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG } });
    const enr = { v: 2, ecritA: 5000, travailA: 5000, tag: TAG, json: JSON.stringify(base([edl(42, 4000)])) };
    const idb = fauxIdb(enr);
    let muet = true;
    const lireVrai = idb.lire;
    idb.lire = async () => { if (muet) throw new Error('indexeddb-muet'); return lireVrai(); };
    const m = creerMiroir({ idb, stockage: st, delaiMs: 20, signaler: () => {} });
    await m.initialiser();
    muet = false;                                                           // IndexedDB répond à nouveau
    const f = monterF1({ stockage: st, miroirLocal: moduleMiroir(m) });
    expect((await f.lancer()).ajoutes).toBe(1);
    expect(f.seq.flushe.edl.map(e => e.id)).toEqual([42]);
    expect(m.protege()).toBe(false);
  });
});

describe('X5 — l’écrivain de `_flush_at` dans onLoggedIn (`runFlush`)', () => {
  it('flush propre : `_flush_at` avance ; miroir PROTÉGÉ : il n’avance pas ; flush incomplet : il n’avance pas', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '1000' } });
    const m = creerMiroir({ idb: fauxIdb(null), stockage: st });
    await m.initialiser();
    await monterRunFlush({ st, m })(propre);
    const apres = Number(st.getItem('immotrack_v4_flush_at'));
    expect(apres).toBeGreaterThan(1000);
    st.setItem('immotrack_v4_flush_at', '1000');
    await monterRunFlush({ st, m })(async () => ({ upserts: [], errors: [{ message: 'x' }], conflicts: [], skipped: [] }));
    expect(st.getItem('immotrack_v4_flush_at')).toBe('1000');
    m.proteger();
    await monterRunFlush({ st, m })(propre);
    expect(st.getItem('immotrack_v4_flush_at')).toBe('1000');
  });
});

describe('Message du refus « miroir-illisible »', () => {
  it('dit ce qui se passe et quoi faire (pas le texte générique du réseau)', () => {
    const m = OfflineBoot.messageDeconnexionRefusee({ enAttente: 1, raison: 'miroir-illisible' });
    expect(m.texte).toContain('La copie de cet appareil n\'a pas pu être relue');
    expect(m.texte).toContain('Recharger l\'application pour relire la copie');
  });
});

// ── Garde de déconnexion de supabase-boot (module séparé : lit ce que supabase-entry expose) ──
describe('supabase-boot — la garde de déconnexion compte le miroir IndexedDB (M7)', () => {
  afterEach(() => vi.unstubAllGlobals());
  function client(journal) {
    return {
      auth: { signOut: async () => { journal.push('signOut'); return { error: null }; }, getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      from: () => ({}), channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    };
  }
  it('hors ligne, miroir SEULEMENT en IndexedDB, travail non parti : logout REFUSÉ, rien n’est déconnecté', async () => {
    vi.stubGlobal('localStorage', fauxStockageQuota({ initial: { immotrack_v4_ecrit_at: '2000', immotrack_v4_flush_at: '1000' } }));
    vi.stubGlobal('window', { __immoHorsLigne: true, __immoMiroirPresent: () => true, __immoMiroirEtat: () => ({ present: true, protege: false, travailA: 0 }) });
    const journal = [];
    const r = await createBoot(client(journal)).logout();
    expect(r).toMatchObject({ ok: false, raison: 'hors-ligne-non-synchronise' });
    expect(journal).toEqual([]);
  });
  it('`_ecrit_at` perdu : `travailA` (IndexedDB) suffit à refuser (O4)', async () => {
    vi.stubGlobal('localStorage', fauxStockageQuota({ initial: { immotrack_v4_flush_at: '1000' } }));
    vi.stubGlobal('window', { __immoHorsLigne: true, __immoMiroirPresent: () => true, __immoMiroirEtat: () => ({ present: true, protege: false, travailA: 3000 }) });
    const journal = [];
    expect(await createBoot(client(journal)).logout()).toMatchObject({ ok: false });
    expect(journal).toEqual([]);
  });
  it('miroir PROTÉGÉ : refus « miroir-illisible » ; sans miroir, la déconnexion passe', async () => {
    vi.stubGlobal('localStorage', fauxStockageQuota());
    vi.stubGlobal('window', { __immoMiroirPresent: () => true, __immoMiroirEtat: () => ({ present: true, protege: true, travailA: 0 }) });
    expect(await createBoot(client([])).logout()).toMatchObject({ ok: false, raison: 'miroir-illisible' });
    vi.stubGlobal('window', { __immoMiroirPresent: () => false, __immoMiroirEtat: () => ({ present: false, protege: false, travailA: 0 }) });
    const journal = [];
    expect(await createBoot(client(journal)).logout()).toEqual({ ok: true });
    expect(journal).toEqual(['signOut']);
  });
});

describe('Écrivains rebranchés', () => {
  it('rebase au login (`_ecrireMiroir`) : en IndexedDB, SANS avancer `_ecrit_at` (l’état écrit est celui du cloud)', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_ecrit_at: '123' } });
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    const fn = new Function('_stockageLocal', 'localStorage', 'MIRROR_KEY', 'console', '_miroirLocal',
      'return ' + extraireFonction(ENTRY, '_ecrireMiroir'))(Stockage, st, 'immotrack_v4', muet, moduleMiroir(m));
    expect(fn(base([edl(1, 1)]))).toBe(true);
    await m.attendre();
    expect(JSON.parse(idb.enr.json).edl[0].id).toBe(1);
    expect(st.getItem('immotrack_v4_ecrit_at')).toBe('123');
    expect(st.getItem('immotrack_v4')).toBeNull();
  });

  it('saveDB RÉEL hors ligne (EDL) : au retour, l’EDL est déjà dans le journal ; la base part en IndexedDB', async () => {
    const st = fauxStockageQuota();
    const idb = fauxIdb({ v: 1, ecritA: 1, json: JSON.stringify(base()) });
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    idb.r.suspendre = true;
    const DB = base([edl(9, Date.now())]);
    const win = {
      __immoSupabaseMode: true, __immoHorsLigne: true, __immoMarkDirty: () => {},
      __immoEcritureHorsLigneOK: q => OfflineBoot.ecritureAutoriseeHorsLigne(q), _miroirLocal: moduleMiroir(m), _stockage: Stockage,
    };
    const alertes = [];
    const src = extraireFonction(HTML, 'saveDB') + '\n' + extraireFonction(HTML, '_miroirEcrire') + '\n' + extraireFonction(HTML, '_miroirEcrireCloud');
    const saveDB = new Function('window', 'localStorage', 'KEY', 'DB', '_CLOUD_BOOT', '_saveDBQuotaWarn', src + '\nreturn saveDB;')(
      win, st, 'immotrack_v4', DB, false, e => alertes.push(e));
    expect(saveDB({ quoi: 'edl', autosave: true })).toBe(true);
    expect(JSON.parse(st.getItem(JOURNAL_EDL_KEY)).edl.map(r => r.id)).toEqual([9]);   // AVANT toute transaction
    expect(Number(st.getItem('immotrack_v4_ecrit_at'))).toBeGreaterThan(0);
    expect(st.getItem('immotrack_v4')).toBeNull();                         // plus de base complète en local
    expect(alertes).toEqual([]);
    await flush();                                                          // la transaction est lancée…
    expect(idb.r.suspendues).toHaveLength(1);
    idb.r.suspendre = false; idb.r.suspendues.shift()();                    // …et se termine
    await m.attendre();
    expect(JSON.parse(idb.enr.json).edl[0].id).toBe(9);
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    expect(saveDB({ quoi: 'logement' })).toBe(false);                       // 19a inchangé
  });

  it('le journal est reconnu par le registre (classe « principal » : jamais évincé)', () => {
    expect(Stockage.classerCle(JOURNAL_EDL_KEY)).toBe('principal');
    expect(Stockage.estEvincable(JOURNAL_EDL_KEY)).toBe(false);
  });
});

// ── Contre-audit de 40fabad0 ─────────────────────────────────────────────────────────────────
// P9 : un EDL qui EXISTE au cloud et a été MODIFIÉ hors ligne. En mode protégé, le rebase (l'état du
// cloud) n'entre JAMAIS au journal — sinon la version cloud gagne sans condition au démarrage suivant.
describe('P9 — en mode protégé, un rebase n’ajoute JAMAIS d’entrée au journal (quel que soit le backend)', () => {
  const vOld = edl(42, Date.UTC(2026, 8, 29, 10), { v: 'cloud' });
  const vOff = edl(42, Date.UTC(2026, 8, 30, 10), { v: 'hors-ligne' });
  const flushA = String(Date.UTC(2026, 8, 29, 12));
  const enrOff = () => ({ v: 2, ecritA: 1, travailA: Date.UTC(2026, 8, 30, 10), tag: TAG, json: JSON.stringify(base([vOff])) });

  it('IndexedDB lisible, l’envoi de F1 lève (C1) : la version cloud ne remplace pas la saisie hors ligne ; démarrage suivant → F1 la met à jour au cloud', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: flushA, immotrack_v4_tag: TAG } });
    const idb = fauxIdb(enrOff());
    const m1 = creerMiroir({ idb, stockage: st });
    await m1.initialiser();
    const r1 = await monterF1({ stockage: st, miroirLocal: moduleMiroir(m1), flushLeve: true, cloud: base([vOld]) }).lancer();
    expect(m1.protege()).toBe(true);
    rebase(st, m1)(r1.db);                                                  // le login écrit l'état du cloud
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();                         // rien au journal
    // Une saisie AVANT la fin de l'écriture IndexedDB : seul le nouvel EDL entre au journal (la version
    // cloud de l'EDL 42 est la référence des engagés, elle n'est pas « en attente »).
    m1.ecrire(Object.assign({}, r1.db, { edl: [...r1.db.edl, edl(5, Date.UTC(2026, 9, 1, 9))] }));
    expect(JSON.parse(st.getItem(JOURNAL_EDL_KEY)).edl.map(e => e.id)).toEqual([5]);
    await m1.attendre();
    expect((await m1.lire()).edl.map(e => e.v || e.id)).toEqual(['hors-ligne', 5]);
    const m2 = creerMiroir({ idb: fauxIdb(idb.enr), stockage: st });
    await m2.initialiser();
    const f2 = monterF1({ stockage: st, miroirLocal: moduleMiroir(m2), cloud: base([vOld]) });
    expect(await f2.lancer()).toMatchObject({ majs: 1, ajoutes: 1 });
    expect(f2.seq.flushe.edl.map(e => e.v || e.id)).toEqual(['hors-ligne', 5]);
  });

  it('repli (IndexedDB muet toute la session) : le rebase n’entre pas au journal ; démarrage suivant → la saisie hors ligne gagne et remonte', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: flushA, immotrack_v4_tag: TAG } });
    const enr = enrOff();
    const muetIdb = fauxIdb(enr); muetIdb.lire = async () => { throw new Error('indexeddb-muet'); };
    const m1 = creerMiroir({ idb: muetIdb, stockage: st, delaiMs: 20, signaler: () => {} });
    await m1.initialiser();
    const r1 = await monterF1({ stockage: st, miroirLocal: moduleMiroir(m1), cloud: base([vOld]) }).lancer();
    expect(m1.protege()).toBe(true);
    rebase(st, m1)(r1.db);
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    const m2 = creerMiroir({ idb: fauxIdb(enr), stockage: st });
    await m2.initialiser();
    expect((await m2.lire()).edl.map(e => e.v)).toEqual(['hors-ligne']);
    const f2 = monterF1({ stockage: st, miroirLocal: moduleMiroir(m2), cloud: base([vOld]) });
    expect((await f2.lancer()).majs).toBe(1);
    expect(f2.seq.flushe.edl.map(e => e.v)).toEqual(['hors-ligne']);
  });
});

// P10 : la clé locale d'un repli PRÉCÉDENT porte un EDL fait hors ligne, jamais remonté (F1 a levé).
// En mode protégé, toute réécriture de la clé locale relit et fusionne ses EDL.
describe('P10 — en mode protégé, la clé locale n’est jamais réécrite sans fusionner ses EDL', () => {
  const flushA = String(Date.UTC(2026, 8, 29, 12));
  const e77 = edl(77, Date.UTC(2026, 8, 30, 10), { v: 'hors-ligne' });
  async function sessionsAB(st, idbA, idbB) {
    // Session A — HORS LIGNE, repli NON protégé (F1 ne tourne pas hors ligne) : 77 va dans la clé locale.
    const mA = creerMiroir({ idb: idbA, stockage: st, delaiMs: 20, signaler: () => {} });
    await mA.initialiser();
    expect(mA.backend()).toBe('localStorage');
    mA.ecrire(base([]), { horodater: false });
    mA.ecrire(base([e77]));
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    expect(JSON.parse(st.getItem('immotrack_v4')).edl.map(e => e.id)).toEqual([77]);
    // Session B — EN LIGNE : F1 lit 77, l'envoi LÈVE (C1) → protégé ; rebase (cloud sans 77), puis une saisie.
    const mB = creerMiroir({ idb: idbB, stockage: st, delaiMs: 20, signaler: () => {} });
    await mB.initialiser();
    const fB = monterF1({ stockage: st, miroirLocal: moduleMiroir(mB), flushLeve: true });
    const rB = await fB.lancer();
    expect(fB.seq.flushe.edl.map(e => e.id)).toEqual([77]);                // F1 l'avait bien vu
    expect(mB.protege()).toBe(true);
    rebase(st, mB)(rB.db);
    mB.ecrire(Object.assign({}, rB.db, { edl: [edl(5, Date.UTC(2026, 9, 1, 9))] }));
    expect(JSON.parse(st.getItem('immotrack_v4')).edl.map(e => e.id).sort((a, b) => a - b)).toEqual([5, 77]);
  }

  it('scénario de l’audit — IndexedDB muet en A et B, revenu en C : 77 est lu et remonté', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: flushA, immotrack_v4_tag: TAG } });
    const enr = { v: 2, ecritA: 1, tag: TAG, json: JSON.stringify(base([])) };
    const idbMuet = () => { const i = fauxIdb(enr); i.lire = async () => { throw new Error('indexeddb-muet'); }; i.ecrire = async () => { throw new Error('indexeddb-muet'); }; return i; };
    await sessionsAB(st, idbMuet(), idbMuet());
    const mC = creerMiroir({ idb: fauxIdb(enr), stockage: st });
    expect((await mC.initialiser()).transfert).toBe('fusion');
    expect((await mC.lire()).edl.map(e => e.id).sort((a, b) => a - b)).toEqual([5, 77]);
    const fC = monterF1({ stockage: st, miroirLocal: moduleMiroir(mC) });
    expect((await fC.lancer()).ajoutes).toBe(2);
    expect(fC.seq.flushe.edl.find(e => e.id === 77).v).toBe('hors-ligne');
  });

  it('variante IndexedDB REFUSÉ (navigation privée) : la clé locale est la seule copie — 77 y reste et remonte', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: flushA, immotrack_v4_tag: TAG } });
    const idbRefuse = () => { const i = fauxIdb(null); i.lire = async () => { const e = new Error('refus'); e.name = 'SecurityError'; throw e; }; return i; };
    await sessionsAB(st, idbRefuse(), idbRefuse());
    const mC = creerMiroir({ idb: idbRefuse(), stockage: st, delaiMs: 20, signaler: () => {} });
    await mC.initialiser();
    const fC = monterF1({ stockage: st, miroirLocal: moduleMiroir(mC) });
    expect((await fC.lancer()).ajoutes).toBe(2);
    expect(fC.seq.flushe.edl.map(e => e.id).sort((a, b) => a - b)).toEqual([5, 77]);
  });
});

// Q3 : en repli protégé, la copie hors ligne reste utilisable quand elle tient ; sinon, le démarrage
// hors ligne le DIT (plus de formulaire de connexion muet).
describe('Q3 — repli protégé : copie hors ligne complète si elle tient, message dédié sinon', () => {
  function monterHorsLigne(st, m, { showError } = {}) {
    const vu = { injecte: null, formulaire: 0, erreurs: [] };
    const win = { __immoSetDB: d => { vu.injecte = d; return true; }, __immoRender: () => {}, __immoEntrerHorsLigne: o => { vu.bandeau = o; }, __immoCrumb: () => {} };
    const fn = new Function('window', 'localStorage', 'document', 'MIRROR_KEY', '_offlineBoot', '_liftDriveGate', 'wireLoginForm', 'console', '_miroirLocal', 'showError',
      'return async ' + extraireFonction(ENTRY, 'onHorsLigne'))(
      win, st, { documentElement: { removeAttribute() {} } }, 'immotrack_v4', OfflineBoot, () => {}, () => { vu.formulaire++; },
      muet, moduleMiroir(m), showError || ((_o, msg) => vu.erreurs.push(msg)));
    return { lancer: () => fn({}, { remove() {} }, { user: { email: 'd@e.fr' } }), vu, win, m };
  }
  /** IndexedDB muet (lecture ET écriture) : sa base reste celle d'avant, intouchée. */
  const m2Idb = () => {
    const i = fauxIdb({ v: 2, ecritA: 1, travailA: 1, tag: TAG, json: JSON.stringify(base([])) });
    i.lire = async () => { throw new Error('indexeddb-muet'); };
    i.ecrire = async () => { throw new Error('indexeddb-muet'); };
    return i;
  };
  async function sessionProtegee(st, dbSession) {
    const muetIdb = m2Idb();
    const signaux = [];
    const m1 = creerMiroir({ idb: muetIdb, stockage: st, delaiMs: 20, signaler: s => signaux.push(s.type) });
    await m1.initialiser();
    const r1 = await monterF1({ stockage: st, miroirLocal: moduleMiroir(m1) }).lancer();
    expect(m1.protege()).toBe(true);
    signaux.length = 0;
    rebase(st, m1)(Object.assign({}, r1.db, dbSession));
    m1.ecrire(Object.assign({}, r1.db, dbSession, { edl: [edl(9, Date.UTC(2026, 9, 1, 9), { note: 'visite' })] }));
    // Démarrage suivant HORS LIGNE, IndexedDB toujours muet.
    const m2 = creerMiroir({ idb: muetIdb, stockage: st, delaiMs: 20, signaler: () => {} });
    await m2.initialiser();
    return { m2, signaux };
  }

  it('la base TIENT : le démarrage hors ligne suivant ouvre l’app complète, EDL de la session compris', async () => {
    const st = fauxStockageQuota({ quota: 5_242_880, initial: { immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG, immotrack_v4_espaces: JSON.stringify(['e1']) } });
    const { m2, signaux } = await sessionProtegee(st, { logements: [{ ref: 'A' }, { ref: 'B' }] });
    expect(signaux).toEqual([]);
    const h = monterHorsLigne(st, m2);
    await h.lancer();
    expect(h.vu.formulaire).toBe(0);
    expect(h.vu.injecte.logements.map(l => l.ref)).toEqual(['A', 'B']);
    expect(h.vu.injecte.edl.map(e => e.note)).toEqual(['visite']);
    expect(h.win.__immoHorsLigne).toBe(true);
  });

  it('la base NE TIENT PAS : signal « copie-incomplete », puis le démarrage hors ligne affiche le message dédié avec le formulaire (EDL conservés)', async () => {
    const st = fauxStockageQuota({ quota: 50_000, initial: { immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG, immotrack_v4_espaces: JSON.stringify(['e1']) } });
    const { m2, signaux } = await sessionProtegee(st, { mouvements: 'x'.repeat(60_000) });
    expect(signaux).toEqual(['copie-incomplete']);
    expect(st.getItem('immotrack_v4')).toBeNull();
    expect(JSON.parse(st.getItem(JOURNAL_EDL_KEY)).edl.map(e => e.note)).toEqual(['visite']);   // l'EDL est sur l'appareil
    const h = monterHorsLigne(st, m2);
    await h.lancer();
    expect(h.vu.injecte).toBeNull();                                        // pas d'app à moitié vide
    expect(h.vu.formulaire).toBe(1);
    expect(h.vu.erreurs).toEqual(['Copie hors ligne incomplète sur cet appareil : se connecter au réseau pour continuer ; les états des lieux saisis sont conservés.']);
    expect(st.getItem(JOURNAL_EDL_KEY)).not.toBeNull();                     // rien n'est effacé
  });

  it('🟡 copie incomplète signalée, ANCIENNE base locale présente : le démarrage hors ligne ouvre l’app et le bandeau le dit ; une session hors ligne ne lève pas la marque, une copie complète venue du cloud oui', async () => {
    const ancienne = JSON.stringify(Object.assign(base([]), { logements: [{ ref: 'ANCIEN' }] }));
    const st = fauxStockageQuota({ quota: 50_000, initial: { immotrack_v4: ancienne, immotrack_v4_flush_at: '1000', immotrack_v4_tag: TAG, immotrack_v4_espaces: JSON.stringify(['e1']) } });
    const { m2, signaux } = await sessionProtegee(st, { mouvements: 'x'.repeat(60_000) });
    expect(signaux).toEqual(['copie-incomplete']);
    expect(st.getItem('immotrack_v4')).toBe(ancienne);                      // l'ancienne copie n'est pas touchée
    const MSG = 'Copie hors ligne ancienne sur cet appareil : se connecter au réseau pour la mettre à jour ; les états des lieux saisis sont conservés.';
    const h = monterHorsLigne(st, m2);
    await h.lancer();
    expect(h.vu.injecte.logements.map(l => l.ref)).toEqual(['ANCIEN']);    // l'app reste utilisable…
    expect(h.vu.injecte.edl.map(e => e.note)).toEqual(['visite']);         // …EDL de la session compris
    expect(h.vu.bandeau.libelle).toBe(MSG);                                 // …et dit que la copie est ancienne
    // Une saisie HORS LIGNE réécrit la copie ancienne : elle ne la rend pas récente.
    m2.ecrire(Object.assign({}, h.vu.injecte, { edl: [...h.vu.injecte.edl, edl(10, Date.UTC(2026, 9, 1, 12))] }));
    const h2 = monterHorsLigne(st, creerMiroir({ idb: m2Idb(), stockage: st, delaiMs: 20, signaler: () => {} }));
    await h2.m.initialiser(); await h2.lancer();
    expect(h2.vu.bandeau.libelle).toBe(MSG);
    // Session EN LIGNE dont la base tient : copie complète venue du cloud → la marque tombe.
    const m3 = creerMiroir({ idb: m2Idb(), stockage: st, delaiMs: 20, signaler: () => {} });
    await m3.initialiser();
    const r3 = await monterF1({ stockage: st, miroirLocal: moduleMiroir(m3), flushLeve: true }).lancer();
    rebase(st, m3)(r3.db);
    const h3 = monterHorsLigne(st, creerMiroir({ idb: m2Idb(), stockage: st, delaiMs: 20, signaler: () => {} }));
    await h3.m.initialiser(); await h3.lancer();
    expect(h3.vu.bandeau.libelle).toMatch(/^Hors ligne — /);
    expect(h3.vu.injecte.edl.map(e => e.id).sort((a, b) => a - b)).toEqual([9, 10]);   // rien n'est perdu en route
  });
});
