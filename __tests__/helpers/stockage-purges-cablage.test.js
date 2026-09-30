/**
 * __tests__/helpers/stockage-purges-cablage.test.js — CDC-STOCKAGE lot 1, S-7 (G5) côté CÂBLAGE.
 *
 * `purgerCopies` est testé seul (stockage-local.test.js). Ici on prouve qu'il est BIEN APPELÉ aux
 * deux moments où une copie de la base ne doit pas survivre (audit lot 1, point 3) :
 *   1. la déconnexion (`_teardownSession`, js/app/supabase-entry.js) ;
 *   2. la connexion d'un autre propriétaire du miroir (`_purgerCacheAuLogin`) — avec
 *      l'horodatage `immotrack_v4_ecrit_at`, qui partirait sinon orphelin.
 *
 * Même méthode que offline-cablage.test.js : les fonctions sont EXTRAITES du vrai fichier puis
 * EXÉCUTÉES avec des doubles ; les modules purs (stockage-local, cache-purge, offline-boot) sont
 * les vrais. Aucune lecture de source pour comparaison.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as Stockage from '../../js/core/stockage-local.js';
import * as CachePurge from '../../js/core/cache-purge.js';
import * as OfflineBoot from '../../js/core/offline-boot.js';
import { fauxStockageQuota, chaine } from './_faux-stockage-quota.js';
import { accolades, extraireFonction } from './_extraction-source.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const muet = { info() {}, warn() {}, log() {} };

/** Le corps de `_teardownSession = async ({ … }) => { … }` (affectée dans boot()). */
function extraireTeardown(src) {
  const debut = src.indexOf('_teardownSession = async (');
  if (debut < 0) throw new Error('_teardownSession introuvable');
  const fleche = src.indexOf('=> {', debut);
  return accolades(src, fleche + 3);
}

// L'état local d'un utilisateur avant logout : miroir, horodatages, copies héritées, et ce qui suit sa propre règle.
const ETAT = () => ({
  'immotrack_v4': '{"baux":{},"logements":[]}',
  'immotrack_v4_ecrit_at': '1700000000000',
  'immotrack_v4_flush_at': '1690000000000',
  'immotrack_v4_espaces': '["e"]',
  'immotrack_v4_tag': JSON.stringify({ userId: 'u-a', espaceId: 'e-a' }),
  'immotrack_backup_archi-v1_2026-05-02': chaine(6_000),
  '_driveBackupBeforeSync': chaine(9_000),
  'immotrack_v4_corrupt_backup_1': 'x',
  '_test_immotrack_backup_archi-v4b_2026-05-20': 'y',
  'immotrack_theme_mode': 'dark',
  'autre_app_panier': '{"x":1}',
  'RELAY_APP_KEY': 'secret',
});
const COPIES = ['immotrack_backup_archi-v1_2026-05-02', '_driveBackupBeforeSync', 'immotrack_v4_corrupt_backup_1',
  '_test_immotrack_backup_archi-v4b_2026-05-20'];

let SRC;
beforeAll(() => { SRC = readFileSync(resolve(repoRoot, 'js/app/supabase-entry.js'), 'utf8'); });

/** Le vrai _purgerCopiesLocales, branché sur le vrai module et le stockage de test. */
function purgeur(st) {
  return new Function('_stockageLocal', 'localStorage', 'console',
    extraireFonction(SRC, '_purgerCopiesLocales') + '\nreturn _purgerCopiesLocales;')(Stockage, st, muet);
}

describe('Logout — _teardownSession purge les copies de la base (S-7)', () => {
  function monter({ st, refus = null, logout = { ok: true } }) {
    const trace = { authPurge: 0, reload: 0, signOut: 0, logoutApi: 0, photos: 0 };
    const deps = {
      window: {}, console: muet, localStorage: st, MIRROR_KEY: OfflineBoot.MIROIR_KEY, MIRROR_TAG_KEY: CachePurge.MIRROR_TAG_KEY,
      _offlineBoot: OfflineBoot, _cachePurge: CachePurge, _liveDBRef: null, appDbFrom: () => ({}),
      _refusDeconnexionLocale: () => refus,
      api: { logout: async () => { trace.logoutApi++; return logout; } },
      _supaClient: { auth: { signOut: async () => { trace.signOut++; } } },
      _purgerCopiesLocales: purgeur(st),
      _purgeAuthTokenKeys: () => { trace.authPurge++; },
      _deletePhotosDb: async () => { trace.photos++; },
      location: { reload: () => { trace.reload++; } },
    };
    const noms = Object.keys(deps);
    const fn = new Function(...noms, 'return async ({ flush, keepPhotos, forcer }) => ' + extraireTeardown(SRC))(...noms.map(n => deps[n]));
    return { fn, trace };
  }

  it('déconnexion normale (flush) : miroir, horodatages ET copies partent ; le reste reste', async () => {
    const st = fauxStockageQuota({ initial: ETAT() });
    const { fn, trace } = monter({ st });
    await fn({ flush: true });
    for (const k of ['immotrack_v4', 'immotrack_v4_ecrit_at', 'immotrack_v4_flush_at', 'immotrack_v4_espaces', ...COPIES]) {
      expect(st.getItem(k), k).toBeNull();
    }
    for (const k of ['immotrack_theme_mode', 'autre_app_panier', 'RELAY_APP_KEY']) expect(st.getItem(k), k).toBe(ETAT()[k]);
    expect(trace).toMatchObject({ logoutApi: 1, authPurge: 1, reload: 1 });
  });

  it('purge d’espace (sans flush) : les copies partent aussi', async () => {
    const st = fauxStockageQuota({ initial: ETAT() });
    const { fn, trace } = monter({ st });
    await fn({ flush: false, keepPhotos: true });
    for (const k of COPIES) expect(st.getItem(k), k).toBeNull();
    expect(trace).toMatchObject({ signOut: 1, reload: 1 });
  });

  it('déconnexion REFUSÉE (travail non synchronisé) : rien n’est purgé, pas même les copies', async () => {
    const st = fauxStockageQuota({ initial: ETAT() });
    const refus = { ok: false, raison: 'hors-ligne', enAttente: 1 };
    const { fn, trace } = monter({ st, refus });
    expect(await fn({ flush: true })).toBe(refus);
    expect(st.cles().sort()).toEqual(Object.keys(ETAT()).sort());
    expect(trace).toMatchObject({ reload: 0, authPurge: 0 });
  });
});

describe('Connexion — _purgerCacheAuLogin selon le propriétaire du miroir (CDC §3.6, S-7)', () => {
  function monter(st) {
    const deps = {
      console: muet, localStorage: st, MIRROR_KEY: OfflineBoot.MIROIR_KEY, MIRROR_TAG_KEY: CachePurge.MIRROR_TAG_KEY,
      _offlineBoot: OfflineBoot, _cachePurge: CachePurge, _espaceOwners: { 'e-b': 'u-b' },
      _purgerCopiesLocales: purgeur(st),
    };
    const noms = Object.keys(deps);
    return new Function(...noms, 'return ' + extraireFonction(SRC, '_purgerCacheAuLogin'))(...noms.map(n => deps[n]));
  }

  it('autre utilisateur : SYNCHRONE, rend le verdict de l’ANCIEN tag ; miroir, horodatage et copies partent', () => {
    const st = fauxStockageQuota({ initial: ETAT() });
    const cls = monter(st)({ user: { id: 'u-b' }, esp: { espaceId: 'e-b' } });
    expect(cls).toBe('other-user');                                        // une valeur, pas une promesse
    for (const k of ['immotrack_v4', 'immotrack_v4_ecrit_at', ...COPIES]) expect(st.getItem(k), k).toBeNull();
    expect(JSON.parse(st.getItem('immotrack_v4_tag'))).toEqual({ userId: 'u-b', espaceId: 'e-b' });   // tag réécrit APRÈS lecture
    expect(JSON.parse(st.getItem('immotrack_v4_espaces'))).toEqual(['e-b']);
    for (const k of ['immotrack_theme_mode', 'autre_app_panier', 'RELAY_APP_KEY']) expect(st.getItem(k), k).toBe(ETAT()[k]);
  });

  it('même utilisateur, même espace : verdict « same », rien n’est purgé (le miroir et F1 sont préservés)', () => {
    const st = fauxStockageQuota({ initial: ETAT() });
    expect(monter(st)({ user: { id: 'u-a' }, esp: { espaceId: 'e-a' } })).toBe('same');
    expect(st.getItem('immotrack_v4')).toBe(ETAT().immotrack_v4);
    expect(st.getItem('immotrack_v4_ecrit_at')).toBe('1700000000000');
  });

  it('CÂBLAGE dans onLoggedIn : le verdict retenu pour F1 est celui de l’ANCIEN tag, et la purge photos suit', async () => {
    // Le bloc `try { … }` d'onLoggedIn qui appelle _purgerCacheAuLogin, EXÉCUTÉ tel quel. S'il cessait
    // de retenir le verdict, F1 recevrait 'untagged' et ne remonterait plus les EDL hors ligne.
    const i = SRC.indexOf('_tagMiroirAvantLogin = _purgerCacheAuLogin(');
    expect(i).toBeGreaterThan(0);
    const bloc = accolades(SRC, SRC.lastIndexOf('try {', i) + 4);
    const executer = async (st, user, esp) => {
      let photos = 0;
      const deps = {
        _purgerCacheAuLogin: monter(st), _deletePhotosDb: async () => { photos++; }, user, esp, console: muet,
      };
      const noms = Object.keys(deps);
      const verdict = await new Function(...noms, "let _tagMiroirAvantLogin = 'untagged'; return (async () => { try "
        + bloc + ' catch (e) {} return _tagMiroirAvantLogin; })()')(...noms.map(n => deps[n]));
      return { verdict, photos };
    };
    expect(await executer(fauxStockageQuota({ initial: ETAT() }), { id: 'u-b' }, { espaceId: 'e-b' })).toEqual({ verdict: 'other-user', photos: 1 });
    expect(await executer(fauxStockageQuota({ initial: ETAT() }), { id: 'u-a' }, { espaceId: 'e-a' })).toEqual({ verdict: 'same', photos: 0 });
  });
});

describe('Clé du jeton de session : la constante LOCALE de supabase-entry.js = cache-purge.AUTH_STORAGE_KEY', () => {
  it('égalité (la constante locale garde l’écran de connexion indépendant de cache-purge.js)', () => {
    // La déclaration est EXÉCUTÉE telle qu'écrite dans le fichier, puis comparée à l'export du module.
    const m = SRC.match(/^const AUTH_STORAGE_KEY = ([^\r\n]+)$/m);
    expect(m).not.toBeNull();
    const locale = new Function('return (' + m[1].replace(/\s+\/\/.*$/, '') + ');')();
    expect(locale).toBe(CachePurge.AUTH_STORAGE_KEY);
    expect(Stockage.classerCle(locale)).toBe('session');
  });
});

