/**
 * __tests__/helpers/stockage-local.test.js — CDC-STOCKAGE lot 1 (docs/CDC-STOCKAGE.md).
 *
 * Le registre des clés du stockage local et les trois gestes qu'il autorise :
 * libérer pour que le save passe (S-1), nettoyer au démarrage (S-5), purger
 * les copies à la déconnexion (S-7). Tout est EXÉCUTÉ contre un faux
 * `localStorage` à quota façon Chromium : aucune lecture de source.
 *
 * Les règles de fond (D5 A, S-4) : seules les copies complètes CONNUES et les
 * clés RETIRÉES partent. Jamais la base sandbox, jamais une préférence, jamais
 * une clé que le registre ne reconnaît pas — d'autres pages partagent
 * l'origine github.io.
 */
import { describe, it, expect } from 'vitest';
import {
  classerCle, estEvincable, tailleStockage, estQuotaDepasse, lireEntrees,
  planLiberation, ecrireAvecLiberation, clesDuNettoyage, nettoyer,
  clesCopiesLocales, purgerCopies, REGISTRE,
} from '../../js/core/stockage-local.js';
import { MIROIR_KEY, MIROIR_ECRIT_KEY, FLUSH_OK_KEY, ESPACES_KEY } from '../../js/core/offline-boot.js';
import { MIRROR_TAG_KEY, AUTH_STORAGE_KEY } from '../../js/core/cache-purge.js';
import { fauxStockageQuota, chaine } from './_faux-stockage-quota.js';

// L'état hérité réel mesuré chez Didier le 28/08, plus une clé d'une autre page de l'origine.
const HERITAGE = () => ({
  'immotrack_backup_archi-v1_2026-05-02': chaine(603_000),
  'immotrack_backup_archi-v4b_2026-05-20': chaine(918_000),
  '_driveBackupBeforeSync': chaine(1_630_000),
  '_driveBackupBeforeSyncAt': '2026-05-01T10:00:00.000Z',
  '_driveGlobalFileId': 'abc',
  '_driveLastSync': '123',
  'immotrack_v4_corrupt_backup_1714000000000': chaine(10_000),
  '_test_immotrack_backup_archi-v1_2026-05-02': chaine(5_000),
  'immo_use_supabase': '1',
  '_test_irl_view': 'grille',
  'autre_app_panier': '{"x":1}',                 // clé étrangère (autre page de l'origine)
  '_test_immotrack_v4': '{"baux":{},"logements":[]}',   // base sandbox
  'immotrack_theme_mode': 'dark',                // préférence
  'immo-supabase-auth': '{"access_token":"t"}',  // jeton de session (PWA)
  'RELAY_APP_KEY': 'secret',                     // secret résiduel : hors lot, intouché
  'immotrack_v4_tag': '{"userId":"u","espaceId":"e"}',
});

describe('Constantes locales du registre = exports des modules qui les possèdent (pas d’import : main.js)', () => {
  it('égalité avec offline-boot.js et cache-purge.js', async () => {
    const L = await import('../../js/core/stockage-local.js');
    expect([L.MIROIR_KEY, L.MIROIR_ECRIT_KEY, L.FLUSH_OK_KEY, L.ESPACES_KEY]).toEqual([MIROIR_KEY, MIROIR_ECRIT_KEY, FLUSH_OK_KEY, ESPACES_KEY]);
    expect([L.MIRROR_TAG_KEY, L.AUTH_STORAGE_KEY]).toEqual([MIRROR_TAG_KEY, AUTH_STORAGE_KEY]);
  });
  it('écritures remontées par F1 : égalité avec offline-boot.js, sous-ensemble des écritures autorisées hors ligne, sans edl-pieces', async () => {
    const L = await import('../../js/core/stockage-local.js');
    const O = await import('../../js/core/offline-boot.js');
    expect([...L.ECRITURES_REMONTEES_PAR_F1]).toEqual(O.ECRITURES_REMONTEES_PAR_F1);
    for (const q of O.ECRITURES_REMONTEES_PAR_F1) expect(O.ECRITURES_HORS_LIGNE).toContain(q);
    expect(O.ECRITURES_REMONTEES_PAR_F1).not.toContain('edl-pieces');   // log.edlTemplate : pas dans DB.edl
  });
});

describe('classerCle — le registre reconnaît chaque clé de l’app', () => {
  it('le miroir et son horodatage, dans les deux namespaces', () => {
    expect(classerCle(MIROIR_KEY)).toBe('principal');
    expect(classerCle('_test_immotrack_v4')).toBe('principal');
    expect(classerCle(MIROIR_ECRIT_KEY)).toBe('etat');
    expect(classerCle('_test_immotrack_v4_ecrit_at')).toBe('etat');
    expect(classerCle(FLUSH_OK_KEY)).toBe('etat');
    expect(classerCle(ESPACES_KEY)).toBe('etat');
    expect(classerCle(MIRROR_TAG_KEY)).toBe('etat');
  });

  it('le jeton de session et son vérificateur PKCE', () => {
    expect(classerCle(AUTH_STORAGE_KEY)).toBe('session');
    expect(classerCle(AUTH_STORAGE_KEY + '-code-verifier')).toBe('session');
  });

  it('les copies complètes connues, quel que soit le namespace', () => {
    for (const k of ['immotrack_backup_archi-v1_2026-05-02', '_test_immotrack_backup_x_2026-01-01',
      'immotrack_v4_corrupt_backup_1714000000000', '_test_immotrack_v4_corrupt_backup_1',
      '_driveBackupBeforeSync']) {
      expect(classerCle(k), k).toBe('copie');
    }
  });

  it('une sauvegarde corrompue n’est PAS confondue avec l’état du miroir (préfixe commun)', () => {
    expect(classerCle('immotrack_v4_corrupt_backup_1')).toBe('copie');
    expect(classerCle('immotrack_v4_ecrit_at')).toBe('etat');
  });

  it('les clés retirées (Drive, bi-mode, anciennes préférences)', () => {
    for (const k of ['_driveBackupBeforeSyncAt', '_driveGlobalFileId', '_driveLastSync', '_myGlobalFileId',
      '_myEntityFileIds', '_drvSharedRootId', '_drvSharedRootName', '_drvInstallId',
      '_drvAutoDetectDismissed', '_driveModalDismiss', 'immo_use_supabase',
      'irl_view', '_test_irl_view', 'irl_grp_collapsed', 'quit_view', 'dash_alerts_collapsed']) {
      expect(classerCle(k), k).toBe('retiree');
    }
  });

  it('les préférences d’écran (prod et sandbox) ne sont jamais des copies', () => {
    for (const k of ['immotrack_theme_mode', '_test_immotrack_theme_mode', 'immotrack_theme', 'immo_menu_on',
      'immo_fav_bar', 'immo_nav_open', 'immBlocksCollapsed', 'logGroupsCollapsed', 'RELAY_BASE',
      'immo_backup_freq', 'immo_theme']) {
      expect(classerCle(k), k).toBe('pref');
    }
    // `immo_backup_*` (réglage de la sauvegarde de sécurité) ≠ `immotrack_backup_*` (copie)
    expect(classerCle('immo_backup_lastAt')).toBe('etat');
  });

  it('RELAY_APP_KEY est reconnu mais HORS LOT : ni évincé ni nettoyé', () => {
    expect(classerCle('RELAY_APP_KEY')).toBe('secret_residuel');
    expect(classerCle('_test_RELAY_APP_KEY')).toBe('secret_residuel');
    expect(estEvincable('RELAY_APP_KEY')).toBe(false);
  });

  it('S-4 — une clé non reconnue est « inconnue », donc intouchable', () => {
    for (const k of ['autre_app_panier', 'immotrack_v4x', 'backup', 'immotrack_backup', '', null, undefined]) {
      expect(classerCle(k), String(k)).toBe('inconnue');
      expect(estEvincable(k)).toBe(false);
    }
  });

  it('seules les classes « copie » et « retiree » sont évinçables (D5 A)', () => {
    const classes = new Set(REGISTRE.map(r => r.classe));
    for (const c of classes) {
      const exemple = REGISTRE.find(r => r.classe === c);
      expect(Array.isArray(exemple.exemples) && exemple.exemples.length > 0, c).toBe(true);
      for (const k of exemple.exemples) expect(estEvincable(k), k).toBe(c === 'copie' || c === 'retiree');
    }
  });
});

describe('tailleStockage / estQuotaDepasse', () => {
  it('compte clé + valeur en caractères (unité du quota Chromium)', () => {
    expect(tailleStockage('ab', 'éé')).toBe(4);
    expect(tailleStockage('k', null)).toBe(1);
  });
  it('reconnaît le refus de quota des différents navigateurs', () => {
    expect(estQuotaDepasse({ name: 'QuotaExceededError' })).toBe(true);
    expect(estQuotaDepasse({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(estQuotaDepasse({ code: 22 })).toBe(true);
    expect(estQuotaDepasse({ name: 'Error', message: 'exceeded the quota' })).toBe(true);
    expect(estQuotaDepasse({ name: 'SecurityError', message: 'access denied' })).toBe(false);
    expect(estQuotaDepasse(null)).toBe(false);
  });
});

describe('planLiberation — copies par taille décroissante, puis clés retirées, rien d’autre', () => {
  it('ordonne et filtre', () => {
    const st = fauxStockageQuota({ initial: HERITAGE() });
    const plan = planLiberation(lireEntrees(st));
    expect(plan.slice(0, 5)).toEqual([
      '_driveBackupBeforeSync',
      'immotrack_backup_archi-v4b_2026-05-20',
      'immotrack_backup_archi-v1_2026-05-02',
      'immotrack_v4_corrupt_backup_1714000000000',
      '_test_immotrack_backup_archi-v1_2026-05-02',
    ]);
    expect(new Set(plan.slice(5))).toEqual(new Set([
      '_driveBackupBeforeSyncAt', '_driveGlobalFileId', '_driveLastSync', 'immo_use_supabase', '_test_irl_view',
    ]));
    for (const k of ['autre_app_panier', '_test_immotrack_v4', 'immotrack_theme_mode', 'immo-supabase-auth',
      'RELAY_APP_KEY', 'immotrack_v4_tag']) {
      expect(plan).not.toContain(k);
    }
  });
  it('entrées vides ou absentes → rien', () => {
    expect(planLiberation([])).toEqual([]);
    expect(planLiberation(undefined)).toEqual([]);
  });
});

describe('ecrireAvecLiberation — S-1 : on remplit le stockage, le save passe quand même', () => {
  const QUOTA = 5_242_880;   // ~10 Mio en UTF-16 : le quota d'une origine sous Chromium

  it('LE POINT DUR — stockage saturé par l’héritage, base de 2,2 M caractères : écrit après éviction', () => {
    const st = fauxStockageQuota({ quota: QUOTA, initial: HERITAGE() });
    const base = chaine(2_200_000);
    // Sans libération, l'écriture serait refusée : on le prouve d'abord.
    expect(() => st.setItem('immotrack_v4', base)).toThrow();
    const r = ecrireAvecLiberation(st, [['immotrack_v4', base], ['immotrack_v4_ecrit_at', '1700000000000']]);
    expect(r.ok).toBe(true);
    expect(st.getItem('immotrack_v4')).toHaveLength(2_200_000);
    expect(st.getItem('immotrack_v4_ecrit_at')).toBe('1700000000000');
    expect(r.liberees).toContain('_driveBackupBeforeSync');
    expect(r.caracteresLiberes).toBeGreaterThan(3_000_000);
    // Rien de ce qui n'est pas évinçable n'a bougé.
    const h = HERITAGE();
    for (const k of ['autre_app_panier', '_test_immotrack_v4', 'immotrack_theme_mode', 'immo-supabase-auth',
      'RELAY_APP_KEY', 'immotrack_v4_tag']) {
      expect(st.getItem(k), k).toBe(h[k]);
    }
    // Plus aucune copie ni clé retirée.
    expect(st.cles().filter(k => estEvincable(k))).toEqual([]);
  });

  it('stockage libre : une seule écriture, rien n’est supprimé', () => {
    const st = fauxStockageQuota({ quota: QUOTA, initial: HERITAGE() });
    const r = ecrireAvecLiberation(st, [['immotrack_v4', '{}']]);
    expect(r).toEqual({ ok: true, liberees: [], caracteresLiberes: 0, erreur: null });
    expect(st.getItem('_driveBackupBeforeSync')).not.toBeNull();   // l'éviction n'a lieu QUE sur refus
  });

  it('stockage plein de clés NON évinçables : échec honnête, rien de supprimé', () => {
    const st = fauxStockageQuota({ quota: 1000, initial: { 'autre_app_panier': chaine(600), 'immotrack_theme_mode': chaine(380) } });
    const r = ecrireAvecLiberation(st, [['immotrack_v4', chaine(100)]]);
    expect(r.ok).toBe(false);
    expect(estQuotaDepasse(r.erreur)).toBe(true);
    expect(r.liberees).toEqual([]);
    expect(st.cles().sort()).toEqual(['autre_app_panier', 'immotrack_theme_mode']);
  });

  it('la base elle-même ne tient plus : échec APRÈS éviction (un seul nouvel essai, pas de boucle)', () => {
    let essais = 0;
    const st = fauxStockageQuota({ quota: 1000, initial: { '_driveBackupBeforeSync': chaine(500) } });
    const setItem = st.setItem.bind(st);
    st.setItem = (k, v) => { essais++; return setItem(k, v); };
    const r = ecrireAvecLiberation(st, [['immotrack_v4', chaine(2000)]]);
    expect(r.ok).toBe(false);
    expect(r.liberees).toEqual(['_driveBackupBeforeSync']);
    expect(essais).toBe(2);
  });

  it('une erreur qui n’est pas un quota (stockage interdit) ne déclenche AUCUNE éviction', () => {
    const st = fauxStockageQuota({ initial: HERITAGE() });
    st.setItem = () => { const e = new Error('denied'); e.name = 'SecurityError'; throw e; };
    const r = ecrireAvecLiberation(st, [['immotrack_v4', '{}']]);
    expect(r.ok).toBe(false);
    expect(r.erreur.name).toBe('SecurityError');
    expect(r.liberees).toEqual([]);
    expect(st.getItem('_driveBackupBeforeSync')).not.toBeNull();
  });

  it('les deux écritures (miroir + horodatage) passent ensemble après éviction', () => {
    // Horodatage refusé seul (le miroir est passé) : F1 ne doit pas lire une date d'une écriture d'avant.
    const st = fauxStockageQuota({ quota: 120, initial: { '_driveLastSync': chaine(30) } });
    const r = ecrireAvecLiberation(st, [['immotrack_v4', chaine(50)], ['immotrack_v4_ecrit_at', chaine(25)]]);
    expect(r.ok).toBe(true);
    expect(st.getItem('immotrack_v4')).toHaveLength(50);
    expect(st.getItem('immotrack_v4_ecrit_at')).toHaveLength(25);
  });
});

describe('nettoyer — S-5 : les comptes existants se réparent en ouvrant l’app (D3 A)', () => {
  it('supprime copies et clés retirées des DEUX namespaces, garde tout le reste', () => {
    const st = fauxStockageQuota({ initial: HERITAGE() });
    const r = nettoyer(st);
    expect(new Set(r.supprimees)).toEqual(new Set(clesDuNettoyage(Object.keys(HERITAGE()))));
    expect(r.caracteres).toBeGreaterThan(3_000_000);
    expect(st.cles().sort()).toEqual(['RELAY_APP_KEY', '_test_immotrack_v4', 'autre_app_panier',
      'immo-supabase-auth', 'immotrack_theme_mode', 'immotrack_v4_tag']);
  });

  it('idempotent : un second passage ne supprime rien', () => {
    const st = fauxStockageQuota({ initial: HERITAGE() });
    nettoyer(st);
    const avant = st.cles().sort();
    expect(nettoyer(st)).toEqual({ supprimees: [], caracteres: 0 });
    expect(st.cles().sort()).toEqual(avant);
  });

  it('stockage vide ou illisible : rien, sans lever', () => {
    expect(nettoyer(fauxStockageQuota())).toEqual({ supprimees: [], caracteres: 0 });
    const casse = { get length() { throw new Error('SecurityError'); }, key() { return null; } };
    expect(nettoyer(casse)).toEqual({ supprimees: [], caracteres: 0 });
  });
});

describe('purgerCopies — S-7 : aucune copie de la base ne survit à la déconnexion (G5)', () => {
  it('ne vise QUE les copies complètes (le reste suit sa propre règle de purge)', () => {
    expect(new Set(clesCopiesLocales(Object.keys(HERITAGE())))).toEqual(new Set([
      'immotrack_backup_archi-v1_2026-05-02', 'immotrack_backup_archi-v4b_2026-05-20', '_driveBackupBeforeSync',
      'immotrack_v4_corrupt_backup_1714000000000', '_test_immotrack_backup_archi-v1_2026-05-02',
    ]));
  });

  it('exécuté sur le stockage : les copies partent, le jeton et le reste sont laissés au logout existant', () => {
    const st = fauxStockageQuota({ initial: HERITAGE() });
    const parties = purgerCopies(st);
    expect(parties).toHaveLength(5);
    expect(st.cles().some(k => classerCle(k) === 'copie')).toBe(false);
    expect(st.getItem('immo-supabase-auth')).not.toBeNull();
    expect(st.getItem('autre_app_panier')).not.toBeNull();
    expect(st.getItem('RELAY_APP_KEY')).not.toBeNull();
  });
});

describe('Coût de l’éviction — les valeurs NON jetables ne sont jamais lues (audit lot 1, point 4)', () => {
  // Le save sur quota ne doit pas relire le miroir (jusqu'à plusieurs Mo), les préférences, le jeton,
  // ni les clés des autres pages de l'origine : seules les valeurs qu'il peut libérer l'intéressent.
  function espionner(st) {
    const lus = new Map();
    const getItem = st.getItem.bind(st);
    st.getItem = (k) => { lus.set(k, (lus.get(k) || 0) + 1); return getItem(k); };
    return lus;
  }
  const NON_JETABLES = ['autre_app_panier', '_test_immotrack_v4', 'immotrack_theme_mode', 'immo-supabase-auth',
    'RELAY_APP_KEY', 'immotrack_v4_tag'];

  it('ecrireAvecLiberation sur quota : aucune lecture non jetable, chaque jetable lue une seule fois', () => {
    const st = fauxStockageQuota({ quota: 5_242_880, initial: { ...HERITAGE(), 'immotrack_v4': chaine(900_000) } });
    const lus = espionner(st);
    const r = ecrireAvecLiberation(st, [['immotrack_v4', chaine(2_200_000)]]);
    expect(r.ok).toBe(true);
    for (const k of [...NON_JETABLES, 'immotrack_v4']) expect(lus.get(k) || 0, k).toBe(0);
    for (const k of r.liberees) expect(lus.get(k), k).toBe(1);
  });

  it('nettoyer et purgerCopies : aucune lecture non jetable', () => {
    for (const geste of [nettoyer, purgerCopies]) {
      const st = fauxStockageQuota({ initial: { ...HERITAGE(), 'immotrack_v4': chaine(900_000) } });
      const lus = espionner(st);
      geste(st);
      for (const k of [...NON_JETABLES, 'immotrack_v4']) expect(lus.get(k) || 0, `${geste.name} ${k}`).toBe(0);
    }
  });
});
