/**
 * __tests__/helpers/stockage-save-sacre.test.js — CDC-STOCKAGE lot 1, gate G2 (et G3 côté app).
 *
 * « ON REMPLIT LE STOCKAGE, LE SAVE PASSE QUAND MÊME. »
 *
 * L'incident du 28/08, rejoué : un localStorage rempli à ras bord par des
 * copies complètes de la base (sauvegardes avant migration, ancien Drive) et le
 * vrai `saveDB` d'index.html qui tente d'écrire le miroir. Avant le lot 1 :
 * refus, toast « Mémoire pleine ». Après : les copies partent, le miroir est
 * écrit, et rien d'autre n'a bougé.
 *
 * Rien n'est lu dans la source pour être comparé : `saveDB`, `_miroirEcrire` et
 * `_stockageNettoyer` sont EXTRAITS d'index.html puis EXÉCUTÉS avec le vrai
 * module js/core/stockage-local.js branché comme dans l'app (`window._stockage`,
 * posé par js/main.js) et un faux localStorage à quota façon Chromium.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as Stockage from '../../js/core/stockage-local.js';
import { ecritureAutoriseeHorsLigne } from '../../js/core/offline-boot.js';
import { fauxStockageQuota, chaine } from './_faux-stockage-quota.js';
import { extraireFonction } from './_extraction-source.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const QUOTA = 5_242_880;   // ~10 Mio stockés en UTF-16 : le quota d'une origine sous Chromium

// L'état d'un compte réel avant correctif (mesures du 28/08) + ce qui doit survivre.
const HERITAGE = () => ({
  'immotrack_backup_archi-v1_2026-05-02': chaine(603_000),
  'immotrack_backup_archi-v4b_2026-05-20': chaine(918_000),
  '_driveBackupBeforeSync': chaine(1_630_000),
  '_driveBackupBeforeSyncAt': '2026-05-01T10:00:00.000Z',
  '_driveLastSync': '1714000000000',
  'immotrack_v4': '{"baux":{},"logements":[],"ancien":true}',   // le miroir périmé à remplacer
  'immotrack_theme_mode': 'dark',
  'immo-supabase-auth': '{"access_token":"t"}',
  'immotrack_v4_tag': '{"userId":"u","espaceId":"e"}',
  'autre_app_panier': '{"x":1}',
  'RELAY_APP_KEY': 'secret',
});
const SURVIVANTS = ['immotrack_theme_mode', 'immo-supabase-auth', 'immotrack_v4_tag', 'autre_app_panier', 'RELAY_APP_KEY'];

let usine, usineNettoyage;
beforeAll(() => {
  const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  const src = extraireFonction(html, 'saveDB') + '\n' + extraireFonction(html, '_miroirEcrire');
  usine = new Function('window', 'localStorage', 'KEY', 'DB', '_CLOUD_BOOT', '_saveDBQuotaWarn', src + '\nreturn saveDB;');
  usineNettoyage = new Function('window', 'localStorage', extraireFonction(html, '_stockageNettoyer') + '\nreturn _stockageNettoyer;');
});

/** Monte le vrai saveDB, branché comme dans l'app. */
function monter({ KEY = 'immotrack_v4', stockage, modeCloud = true, db, module = true }) {
  const alertes = [];
  const envois = [];
  const win = { __immoSupabaseMode: modeCloud, __immoMarkDirty: () => envois.push(1) };
  if (module) win._stockage = Stockage;
  const saveDB = usine(win, stockage, KEY, db, false, e => alertes.push(e));
  return { saveDB, win, alertes, envois };
}

const baseDe = n => ({ baux: {}, logements: [], charge: chaine(n) });

describe('G2 — LE POINT DUR : stockage saturé par l’héritage, le save passe quand même', () => {
  it('mode cloud : miroir de 2,2 M caractères écrit, horodaté, AUCUNE alerte, copies retirées, le reste intact', () => {
    const st = fauxStockageQuota({ quota: QUOTA, initial: HERITAGE() });
    const db = baseDe(2_200_000);
    // Preuve que sans éviction, l'écriture échouerait (l'incident).
    expect(() => st.setItem('immotrack_v4', JSON.stringify(db))).toThrow();

    const { saveDB, alertes, envois } = monter({ stockage: st, db });
    expect(saveDB()).toBe(true);
    expect(alertes).toEqual([]);                                         // pas de « Mémoire pleine »
    expect(st.getItem('immotrack_v4')).toBe(JSON.stringify(db));
    expect(Number(st.getItem('immotrack_v4_ecrit_at'))).toBeGreaterThan(0);
    expect(envois).toHaveLength(1);                                      // le cloud reçoit toujours
    for (const k of ['immotrack_backup_archi-v1_2026-05-02', 'immotrack_backup_archi-v4b_2026-05-20',
      '_driveBackupBeforeSync', '_driveBackupBeforeSyncAt', '_driveLastSync']) {
      expect(st.getItem(k), k).toBeNull();
    }
    const h = HERITAGE();
    for (const k of SURVIVANTS) expect(st.getItem(k), k).toBe(h[k]);
    expect(st.usage()).toBeLessThanOrEqual(QUOTA);
  });

  it('sandbox (branche legacy) : même garantie, et la base de PROD n’est jamais évincée', () => {
    const st = fauxStockageQuota({ quota: QUOTA, initial: { ...HERITAGE(), '_test_immotrack_backup_archi-v1_2026-05-02': chaine(200_000) } });
    const db = baseDe(2_000_000);
    const { saveDB, alertes } = monter({ KEY: '_test_immotrack_v4', stockage: st, db, modeCloud: false });
    expect(saveDB()).toBe(true);
    expect(alertes).toEqual([]);
    expect(st.getItem('_test_immotrack_v4')).toBe(JSON.stringify(db));
    expect(st.getItem('_test_immotrack_backup_archi-v1_2026-05-02')).toBeNull();
    expect(st.getItem('immotrack_v4')).toBe(HERITAGE().immotrack_v4);   // miroir de prod : classe « principal »
  });

  it('hors ligne : un état des lieux s’enregistre après éviction (le seul cas où le miroir est la seule copie)', () => {
    const st = fauxStockageQuota({ quota: QUOTA, initial: HERITAGE() });
    const db = baseDe(2_200_000);
    const { saveDB, win, alertes } = monter({ stockage: st, db });
    win.__immoHorsLigne = true;
    win.__immoEcritureHorsLigneOK = quoi => ecritureAutoriseeHorsLigne(quoi);
    win.__immoMarkDirty = () => {};                                      // hors ligne : pas de destination cloud
    expect(saveDB({ quoi: 'edl', autosave: true })).toBe(true);
    expect(alertes).toEqual([]);
    expect(st.getItem('immotrack_v4')).toBe(JSON.stringify(db));
    expect(st.getItem('_driveBackupBeforeSync')).toBeNull();
  });

  it('échec honnête quand rien n’est jetable : faux, UNE alerte, rien de supprimé (19l inchangé)', () => {
    const initial = { 'autre_app_panier': chaine(3_000_000), 'immotrack_theme_mode': 'dark', 'RELAY_APP_KEY': 'secret' };
    const st = fauxStockageQuota({ quota: QUOTA, initial });
    const { saveDB, alertes, envois } = monter({ stockage: st, db: baseDe(2_500_000) });
    expect(saveDB()).toBe(false);
    expect(alertes).toHaveLength(1);
    expect(st.cles().sort()).toEqual(Object.keys(initial).sort());
    expect(st.getItem('immotrack_v4_ecrit_at')).toBeNull();              // pas d'horodatage sans miroir (F1)
    expect(envois).toHaveLength(1);                                      // le cloud part quand même
  });

  it('module absent (ouverture en file://) : écriture directe, comportement d’avant le lot', () => {
    const st = fauxStockageQuota({ quota: QUOTA, initial: HERITAGE() });
    const { saveDB, alertes } = monter({ stockage: st, db: baseDe(2_200_000), module: false });
    expect(saveDB()).toBe(false);
    expect(alertes).toHaveLength(1);
    expect(st.getItem('_driveBackupBeforeSync')).not.toBeNull();         // rien n'est supprimé sans registre
  });
});

describe('Entrée cloud (js/app/supabase-entry.js) — rebase du miroir au login (S-1) et purge au logout (G5, S-7)', () => {
  let usineEntree;
  beforeAll(() => {
    const src = readFileSync(resolve(repoRoot, 'js/app/supabase-entry.js'), 'utf8');
    usineEntree = new Function('_stockageLocal', 'localStorage', 'MIRROR_KEY', 'console',
      extraireFonction(src, '_purgerCopiesLocales') + '\n' + extraireFonction(src, '_ecrireMiroir')
      + '\nreturn { _purgerCopiesLocales, _ecrireMiroir };');
  });
  const muet = { info() {}, warn() {} };

  it('rebase au login sur un stockage saturé : le miroir passe après éviction', () => {
    const st = fauxStockageQuota({ quota: QUOTA, initial: HERITAGE() });
    const { _ecrireMiroir } = usineEntree(Stockage, st, 'immotrack_v4', muet);
    const json = JSON.stringify(baseDe(2_200_000));
    expect(_ecrireMiroir(json)).toBe(true);
    expect(st.getItem('immotrack_v4')).toBe(json);
    expect(st.getItem('_driveBackupBeforeSync')).toBeNull();
  });

  it('logout : toutes les copies complètes partent, le reste suit sa propre règle', () => {
    const st = fauxStockageQuota({ initial: { ...HERITAGE(), 'immotrack_v4_corrupt_backup_1': 'x', '_test_immotrack_backup_a_2026-01-01': 'y' } });
    const { _purgerCopiesLocales } = usineEntree(Stockage, st, 'immotrack_v4', muet);
    _purgerCopiesLocales('logout');
    expect(st.cles().filter(k => Stockage.classerCle(k) === 'copie')).toEqual([]);
    for (const k of ['immo-supabase-auth', 'autre_app_panier', 'RELAY_APP_KEY', 'immotrack_theme_mode']) expect(st.getItem(k), k).not.toBeNull();
  });

  it('module absent : ni throw ni suppression', () => {
    const st = fauxStockageQuota({ initial: HERITAGE() });
    const { _purgerCopiesLocales, _ecrireMiroir } = usineEntree(null, st, 'immotrack_v4', muet);
    expect(() => _purgerCopiesLocales('logout')).not.toThrow();
    expect(st.cles().sort()).toEqual(Object.keys(HERITAGE()).sort());
    expect(_ecrireMiroir('{}')).toBe(true);                               // stockage libre : écriture directe
  });
});

describe('Base illisible — _conserverBaseIllisible : le message s’affiche TOUJOURS (audit lot 1, point 3)', () => {
  // Sur certains iOS, le premier `indexedDB.open` ne répond jamais : sans borne, la promesse de
  // conservation ne se résolvait jamais, aucun message, une base vide sans explication.
  const monter = (idbPutRaw) => {
    const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
    return new Function('_idbPutRaw', 'KEY', 'console', extraireFonction(html, '_conserverBaseIllisible') + '\nreturn _conserverBaseIllisible;')(
      idbPutRaw, '_test_immotrack_v4', { warn() {} });
  };

  it('IndexedDB qui ne répond JAMAIS : la promesse se résout à « non conservée » après le délai', async () => {
    const debut = Date.now();
    const r = await monter(() => new Promise(() => {}))('{illisible', 40);
    expect(r).toBe(false);
    expect(Date.now() - debut).toBeGreaterThanOrEqual(35);
  });

  it('délai par défaut ≈ 3 s (borne, pas une attente infinie)', async () => {
    const vus = [];
    const origine = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms) => { vus.push(ms); return origine(fn, 0); };
    try { expect(await monter(() => new Promise(() => {}))('{illisible')).toBe(false); }
    finally { globalThis.setTimeout = origine; }
    expect(vus).toContain(3000);
  });

  it('écriture réussie : « conservée », et c’est bien la base illisible qui est écrite sous sa clé', async () => {
    const ecrits = [];
    const r = await monter((k, v) => { ecrits.push([k, v]); return Promise.resolve(); })('{illisible', 1000);
    expect(r).toBe(true);
    expect(ecrits).toHaveLength(1);
    expect(ecrits[0][0]).toBe('corrompu:_test_immotrack_v4');
    expect(ecrits[0][1].raw).toBe('{illisible');
  });

  it('écriture refusée ou IndexedDB absent : « non conservée », sans lever', async () => {
    expect(await monter(() => Promise.reject(new Error('QuotaExceededError')))('{x', 1000)).toBe(false);
    expect(await monter(() => { throw new ReferenceError('indexedDB is not defined'); })('{x', 1000)).toBe(false);
  });
});

describe('G3 côté app — _stockageNettoyer au démarrage', () => {
  it('retire copies et clés retirées, garde le reste, idempotent', () => {
    const st = fauxStockageQuota({ initial: { ...HERITAGE(), '_test_immotrack_v4': '{}', '_test_irl_view': 'x' } });
    const nettoyer = usineNettoyage({ _stockage: Stockage }, st);
    nettoyer();
    const attendus = ['immotrack_v4', '_test_immotrack_v4', ...SURVIVANTS].sort();
    expect(st.cles().sort()).toEqual(attendus);
    nettoyer();
    expect(st.cles().sort()).toEqual(attendus);
  });

  it('module absent : ne touche à rien et ne lève pas', () => {
    const st = fauxStockageQuota({ initial: HERITAGE() });
    expect(() => usineNettoyage({}, st)()).not.toThrow();
    expect(st.cles().sort()).toEqual(Object.keys(HERITAGE()).sort());
  });
});
