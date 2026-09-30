/**
 * core/stockage-local.js — le REGISTRE du stockage local et les trois gestes
 * qu'il autorise (CDC docs/CDC-STOCKAGE.md, lot 1).
 *
 * ═══ POURQUOI CE MODULE EXISTE ════════════════════════════════════════════
 * Incident du 28/08 : « Mémoire pleine, cette modification n'est PAS
 * enregistrée ». Le miroir de la base (~50 Ko à 2 Mo) ne passait plus parce
 * que le `localStorage` de l'origine (~5 Mo) était rempli par des COPIES
 * COMPLÈTES de la base que rien ne retirait jamais : sauvegardes avant
 * migration datées, sauvegarde « avant sync » de l'ancien Drive, sauvegarde de
 * base corrompue. Aucune règle d'occupation, aucune éviction.
 *
 * Ce module pose la règle. Chaque clé connue de l'app a une CLASSE ; seules
 * deux classes sont jetables :
 *   - `copie`   : une copie complète de la base (jamais légitime en localStorage) ;
 *   - `retiree` : une clé que plus aucun code n'écrit ni ne lit.
 * Tout le reste est protégé, et une clé que le registre ne reconnaît pas est
 * INTOUCHABLE : l'origine github.io est partagée avec d'autres pages (S-4).
 *
 * Les trois gestes (tous sur un `storage` INJECTÉ → testables sans navigateur) :
 *   1. `ecrireAvecLiberation` — le save sacré (S-1) : sur refus de quota,
 *      libère les clés jetables puis réessaie UNE fois ;
 *   2. `nettoyer`             — au démarrage, retire toutes les clés jetables
 *      (S-5 : les comptes existants se réparent sans console) ;
 *   3. `purgerCopies`         — à la déconnexion, retire les copies (S-7, RGPD).
 *
 * Aucune API navigateur n'est appelée ici en dehors du `storage` reçu.
 */
import { MIROIR_KEY, MIROIR_ECRIT_KEY, FLUSH_OK_KEY, ESPACES_KEY } from './offline-boot.js';
import { MIRROR_TAG_KEY, AUTH_STORAGE_KEY } from './cache-purge.js';

const echap = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Clé exacte, en prod seulement (clés écrites sans `_lsKey`). */
const exacte = k => new RegExp('^' + echap(k) + '$');
/** Clé exacte, dans les deux namespaces (clés écrites via `_lsKey` : `_test_` en sandbox). */
const deuxNs = k => new RegExp('^(_test_)?' + echap(k) + '$');
/** Préfixe, dans les deux namespaces (le suffixe porte un libellé ou une date). */
const prefixe = k => new RegExp('^(_test_)?' + echap(k) + '.+$');

/**
 * Le registre. L'ORDRE COMPTE : la première règle qui reconnaît la clé
 * l'emporte (`immotrack_v4_corrupt_backup_*` doit être vue comme copie avant
 * que `immotrack_v4_*` ne soit examinée). `exemples` sert aux tests.
 */
export const REGISTRE = [
  // ── copies complètes de la base — jetables, et interdites en localStorage (S-2)
  { motif: prefixe(MIROIR_KEY + '_corrupt_backup_'), classe: 'copie', note: 'base illisible sauvegardée par initDB (legacy)', exemples: ['immotrack_v4_corrupt_backup_1714000000000'] },
  { motif: prefixe('immotrack_backup_'), classe: 'copie', note: '_backupBeforeMigration (avant lot 1)', exemples: ['immotrack_backup_archi-v1_2026-05-02', '_test_immotrack_backup_archi-v4b_2026-05-20'] },
  { motif: exacte('_driveBackupBeforeSync'), classe: 'copie', note: 'ancien Drive, retiré en v15.351', exemples: ['_driveBackupBeforeSync'] },

  // ── la base et son état
  { motif: deuxNs(MIROIR_KEY), classe: 'principal', note: 'miroir / base legacy (KEY)', exemples: ['immotrack_v4', '_test_immotrack_v4'] },
  { motif: deuxNs(MIROIR_ECRIT_KEY), classe: 'etat', note: 'dernière écriture réussie du miroir (F1)', exemples: ['immotrack_v4_ecrit_at', '_test_immotrack_v4_ecrit_at'] },
  { motif: exacte(FLUSH_OK_KEY), classe: 'etat', note: 'dernier flush cloud réussi (F1)', exemples: ['immotrack_v4_flush_at'] },
  { motif: exacte(ESPACES_KEY), classe: 'etat', note: 'espaces autorisés hors ligne', exemples: ['immotrack_v4_espaces'] },
  { motif: exacte(MIRROR_TAG_KEY), classe: 'etat', note: 'propriétaire du miroir (RGPD)', exemples: ['immotrack_v4_tag'] },
  { motif: deuxNs('immotrack_archi_v1_done'), classe: 'etat', note: 'marqueur de migration', exemples: ['immotrack_archi_v1_done'] },
  { motif: deuxNs('immotrack_archi_v4b_done'), classe: 'etat', note: 'marqueur de migration', exemples: ['immotrack_archi_v4b_done'] },
  { motif: deuxNs('immo_appareil_id'), classe: 'etat', note: 'identité de l’appareil (EDL)', exemples: ['immo_appareil_id'] },
  { motif: exacte('immo_backup_lastAt'), classe: 'etat', note: 'sauvegarde de sécurité : dernière réussite', exemples: ['immo_backup_lastAt'] },
  { motif: exacte('immo_backup_reminder_at'), classe: 'etat', note: 'rappel de sauvegarde', exemples: ['immo_backup_reminder_at'] },
  { motif: exacte('immo_backup_reminder_off'), classe: 'etat', note: 'rappel de sauvegarde désactivé', exemples: ['immo_backup_reminder_off'] },
  { motif: exacte('immo_fullapp_once'), classe: 'etat', note: 'ouverture unique de l’app complète', exemples: ['immo_fullapp_once'] },
  { motif: exacte('propryo_pwa_refus'), classe: 'etat', note: 'invitation à installer refusée', exemples: ['propryo_pwa_refus'] },

  // ── session
  { motif: new RegExp('^' + echap(AUTH_STORAGE_KEY) + '(-code-verifier)?$'), classe: 'session', note: 'jeton de session (PWA)', exemples: [AUTH_STORAGE_KEY, AUTH_STORAGE_KEY + '-code-verifier'] },

  // ── préférences d'écran (par appareil)
  ...['immotrack_active_entity', 'immo_menu_on', 'immo_fav_bar', 'immo_nav_open', 'immotrack_sb_collapsed',
    'immotrack_sb_sections_collapsed', 'immotrack_fontsize', 'immotrack_theme_mode', 'immotrack_theme',
    'immotrack_biens_view', 'immotrack_biens_tab', 'immBlocksCollapsed', 'locImmBlocksCollapsed',
    'logGroupsCollapsed', 'RELAY_BASE',
  ].map(k => ({ motif: deuxNs(k), classe: 'pref', note: 'préférence d’écran', exemples: [k, '_test_' + k] })),
  ...['immo_backup_freq', 'immo_theme'].map(k => ({ motif: exacte(k), classe: 'pref', note: 'préférence', exemples: [k] })),

  // ── secret résiduel : reconnu, mais HORS LOT 1 (signalé à part) — ni évincé ni nettoyé
  { motif: deuxNs('RELAY_APP_KEY'), classe: 'secret_residuel', note: 'ancienne clé du relais de signature (retirée) — traitement hors lot', exemples: ['RELAY_APP_KEY', '_test_RELAY_APP_KEY'] },

  // ── clés retirées : plus aucun code ne les écrit ni ne les lit — jetables
  ...['_driveBackupBeforeSyncAt', '_driveGlobalFileId', '_driveLastSync', '_myGlobalFileId', '_myEntityFileIds',
    '_drvSharedRootId', '_drvSharedRootName', '_drvInstallId', '_drvAutoDetectDismissed', '_driveModalDismiss',
    'immo_use_supabase',
  ].map(k => ({ motif: exacte(k), classe: 'retiree', note: 'ancien Drive / bi-mode', exemples: [k] })),
  ...['irl_view', 'irl_grp_collapsed', 'quit_view', 'dash_alerts_collapsed',
  ].map(k => ({ motif: deuxNs(k), classe: 'retiree', note: 'ancienne préférence d’écran', exemples: [k, '_test_' + k] })),
];

const JETABLES = new Set(['copie', 'retiree']);

/** Classe d'une clé : 'principal' | 'etat' | 'session' | 'pref' | 'copie' | 'retiree' | 'secret_residuel' | 'inconnue'. */
export function classerCle(cle) {
  if (typeof cle !== 'string' || !cle) return 'inconnue';
  for (const r of REGISTRE) if (r.motif.test(cle)) return r.classe;
  return 'inconnue';
}

/** D5 A : seules les copies complètes connues et les clés retirées peuvent partir. */
export function estEvincable(cle) { return JETABLES.has(classerCle(cle)); }

/** Poids d'une entrée dans l'unité du quota Chromium : caractères UTF-16, clé + valeur. */
export function tailleStockage(cle, valeur) {
  return String(cle == null ? '' : cle).length + (valeur == null ? 0 : String(valeur).length);
}

/** Le navigateur refuse-t-il l'écriture faute de place ? (Chromium, Firefox, Safari) */
export function estQuotaDepasse(e) {
  if (!e) return false;
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (e.code === 22 || e.code === 1014) return true;
  return /quota/i.test(String(e.message || ''));
}

/** Toutes les clés présentes (tolérant : un stockage illisible rend []). */
export function lireCles(storage) {
  const out = [];
  try {
    const n = storage.length;
    for (let i = 0; i < n; i++) { const k = storage.key(i); if (k != null) out.push(k); }
  } catch (_e) { return []; }
  return out;
}

/** [{ cle, taille }] pour chaque clé présente. (Lit TOUTES les valeurs : diagnostic seulement.) */
export function lireEntrees(storage) {
  return entreesDe(storage, lireCles(storage));
}

/**
 * [{ cle, taille }] des seules clés JETABLES. Les clés sont filtrées AVANT toute lecture : ni le
 * miroir (jusqu'à plusieurs Mo), ni les préférences, ni les clés d'autres pages de l'origine ne
 * sont lus — le chemin du save sur quota ne paie que ce qu'il peut libérer.
 */
export function lireEntreesJetables(storage) {
  return entreesDe(storage, lireCles(storage).filter(estEvincable));
}

function entreesDe(storage, cles) {
  const out = [];
  for (const cle of cles) {
    let v = null;
    try { v = storage.getItem(cle); } catch (_e) { v = null; }
    out.push({ cle, taille: tailleStockage(cle, v) });
  }
  return out;
}

/**
 * Plan de libération : copies par taille décroissante, puis clés retirées par
 * taille décroissante. Rien d'autre (D5 A). Toutes les jetables partent : elles
 * sont mortes, et un demi-nettoyage laisserait le prochain save au bord du vide.
 */
export function planLiberation(entrees) {
  const liste = Array.isArray(entrees) ? entrees.filter(e => e && estEvincable(e.cle)) : [];
  const rang = e => (classerCle(e.cle) === 'copie' ? 0 : 1);
  return liste
    .slice()
    .sort((a, b) => rang(a) - rang(b) || (b.taille || 0) - (a.taille || 0))
    .map(e => e.cle);
}

/**
 * Supprime une liste de clés (appelée UNIQUEMENT avec des clés jetables) ; rend le nombre de
 * caractères libérés. `tailles` (Map clé → taille) évite de relire une valeur déjà mesurée.
 */
function supprimer(storage, cles, tailles) {
  let caracteres = 0;
  const faites = [];
  for (const cle of cles) {
    let t = tailles && tailles.has(cle) ? tailles.get(cle) : null;
    if (t == null) {
      let v = null;
      try { v = storage.getItem(cle); } catch (_e) { v = null; }
      t = tailleStockage(cle, v);
    }
    try { storage.removeItem(cle); faites.push(cle); caracteres += t; } catch (_e) { /* on continue */ }
  }
  return { faites, caracteres };
}

/**
 * S-1 — LE SAVE SACRÉ. Écrit les paires [clé, valeur] dans l'ordre. Sur refus de
 * quota : libère les clés jetables, puis réessaie TOUTES les paires une seule
 * fois (pas de boucle). Toute autre erreur est rendue telle quelle, sans
 * éviction. Ne lève jamais.
 *
 * @returns {{ ok:boolean, liberees:string[], caracteresLiberes:number, erreur:any }}
 */
export function ecrireAvecLiberation(storage, paires) {
  const ecrire = () => { for (const [k, v] of paires) storage.setItem(k, v); };
  try {
    ecrire();
    return { ok: true, liberees: [], caracteresLiberes: 0, erreur: null };
  } catch (e) {
    if (!estQuotaDepasse(e)) return { ok: false, liberees: [], caracteresLiberes: 0, erreur: e };
    const entrees = lireEntreesJetables(storage);          // seules les valeurs jetables sont lues
    const plan = planLiberation(entrees);
    if (!plan.length) return { ok: false, liberees: [], caracteresLiberes: 0, erreur: e };
    const { faites, caracteres } = supprimer(storage, plan, new Map(entrees.map(x => [x.cle, x.taille])));
    try {
      ecrire();
      return { ok: true, liberees: faites, caracteresLiberes: caracteres, erreur: null };
    } catch (e2) {
      return { ok: false, liberees: faites, caracteresLiberes: caracteres, erreur: e2 };
    }
  }
}

/** S-5 — les clés que le nettoyage de démarrage retire (toutes les jetables présentes). */
export function clesDuNettoyage(cles) {
  return (Array.isArray(cles) ? cles : []).filter(estEvincable);
}

/** S-5 — nettoyage de démarrage, idempotent. Ne lève jamais. */
export function nettoyer(storage) {
  const { faites, caracteres } = supprimer(storage, clesDuNettoyage(lireCles(storage)));
  return { supprimees: faites, caracteres };
}

/** S-7 — les copies complètes de la base présentes (à purger au logout / changement d'utilisateur). */
export function clesCopiesLocales(cles) {
  return (Array.isArray(cles) ? cles : []).filter(k => classerCle(k) === 'copie');
}

/** S-7 — purge des copies. Rend les clés supprimées. Ne lève jamais. */
export function purgerCopies(storage) {
  return supprimer(storage, clesCopiesLocales(lireCles(storage))).faites;
}
