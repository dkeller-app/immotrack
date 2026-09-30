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
import { describe, it, expect, beforeAll } from 'vitest';
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
function monterF1({ stockage, miroirLocal }) {
  const seq = [];
  const cloud = base([]);
  const api = {
    seed: () => seq.push('seed'),
    flush: async (d) => { seq.push('flush'); seq.flushe = d; return { upserts: [], errors: [], conflicts: [], skipped: [] }; },
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
