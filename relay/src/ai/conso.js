// relay/src/ai/conso.js — CONSOMMATION IA PAR COMPTE et PLAFONDS MENSUELS selon l'offre (chantier CONSO-IA, migration 0062).
//
//   1. AVANT l'appel payant : reserver() demande à la base (fonction ia_reserver, ligne du mois VERROUILLÉE) si la famille
//      de la fonction est sous le plafond du compte, et réserve une estimation. Deux appels simultanés du même compte
//      sont sérialisés par la base : on ne dépasse pas le plafond en lançant des appels en parallèle.
//   2. APRÈS : consigner() corrige la réservation (unités réelles − estimation ; tout est rendu si l'appel a échoué) et
//      ajoute les mesures du jour (appels, secondes d'audio, pages, images, jetons, coût estimé en micro-euros).
//
// Identité : celle, technique, du relais (public.el_relais, src/el-supabase.js) — jamais le jeton de l'utilisateur
// (il pourrait sinon remettre son propre compteur à zéro). Le compte est l'identifiant vérifié du jeton (sub) ou, pour
// les liens publics, le propriétaire qui a émis le lien.
//
// JAMAIS BLOQUANT : identité du relais absente, migration 0062 pas encore appliquée, base lente ou en erreur → mode
// « kv » : l'appel suit les seuls plafonds journaliers de wrangler.toml (src/ai/quota.js), comme avant.
// AUCUNE donnée personnelle : identifiant de compte, fonction, compteurs. Rien d'autre ne part en base ni au journal.
import { elConfigure, rpc } from '../el-supabase.js';
import { coutMicroEur } from './prix.js';

// Fonction mesurée → famille plafonnée (les demandes du locataire et de l'artisan partagent un même plafond).
export const FAMILLE_DE = Object.freeze({
  dictee: 'dictee', pieces: 'pieces', locataire: 'liens', artisan: 'liens', factures: 'factures', video: 'video',
});
// Tâche de structuration → fonction. Toute tâche du registre DOIT y figurer (test « chaque tâche a sa fonction »).
export const FONCTION_TACHE = Object.freeze({
  'edl-piece': 'dictee', 'edl-photos': 'video', 'bulletin-paie': 'pieces', 'lecture-facture': 'factures',
  'incident-locataire': 'locataire', 'constat-artisan': 'artisan',
});
export const fonctionTache = (nom) => (Object.prototype.hasOwnProperty.call(FONCTION_TACHE, nom) ? FONCTION_TACHE[nom] : null);

// Estimation de la durée d'un audio AVANT transcription, volontairement HAUTE (≈ 24 kb/s) puis corrigée par la durée
// facturée : une rafale d'appels réserve trop, jamais trop peu. Bornée (une dictée ≤ 30 min).
// (≈ 16 kb/s, bornée à 3 600 s = le garde-fou journalier de dictée.)
export const estimationAudioSec = (octets) => Math.min(3600, Math.max(1, Math.ceil((Number(octets) || 0) / 2000)));
// Analyse d'une dictée (edl-piece) : 15 s de dictée consommées, tolérée jusqu'à 1 800 s au-delà du plafond (migration 0062).
export const ANALYSE_DICTEE = Object.freeze({ estimation: 15, marge: 1800 });

const DELAI_MS = 4000;
const ABSENT_MS = 5 * 60 * 1000;
let _absentJusqua = 0;   // migration 0062 pas appliquée : on ne redemande pas pendant 5 min (par isolat)
export function _resetConsoPourTests() { _absentJusqua = 0; }

const journal = (etat, champs = {}) => console.log(`[ai-conso] ${etat}${Object.entries(champs).map(([k, v]) => ` ${k}=${v}`).join('')}`);
function avecDelai(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('delai'), { code: 'delai' })), ms); })])
    .finally(() => clearTimeout(t));
}

/**
 * Réserve avant l'appel payant.
 * @returns {Promise<{mode:'kv'}|{mode:'base', ok:boolean, famille:string, fonction:string, estimation:number, unites:number, plafond:number|null, mois:string, renouvellement:string}>}
 */
export async function reserver(env, { uid, fonction, estimation = 0, marge = 0 }, fetchImpl) {
  const famille = FAMILLE_DE[fonction];
  if (!uid || !famille || !elConfigure(env) || Date.now() < _absentJusqua) return { mode: 'kv' };
  const est = Math.max(0, Math.min(100000, Math.round(Number(estimation) || 0)));
  try {
    const m = Math.max(0, Math.min(3600, Math.round(Number(marge) || 0)));
    const r = await avecDelai(rpc(env, 'ia_reserver', { p_user: uid, p_famille: famille, p_estimation: est, ...(m ? { p_marge: m } : {}) }, fetchImpl), DELAI_MS);
    if (!r || typeof r.ok !== 'boolean' || typeof r.mois !== 'string') { journal('reponse_illisible'); return { mode: 'kv' }; }
    const plafond = r.plafond == null ? null : Number(r.plafond);
    return { mode: 'base', ok: r.ok, famille, fonction, estimation: est, unites: Number(r.unites) || 0, plafond, mois: r.mois, renouvellement: String(r.renouvellement || '') };
  } catch (e) {
    const pg = String((e && e.pg) || '');
    if (pg === 'PGRST202' || pg === '42883' || pg === '42P01') { _absentJusqua = Date.now() + ABSENT_MS; journal('base_absente'); return { mode: 'kv' }; }
    journal('base_indisponible', { code: (e && e.code) || 'erreur' });
    // Base lente ou en erreur : l'appel passe (jamais bloquant) mais sa consommation RÉELLE est quand même consignée
    // ensuite (estimation 0 → la correction ajoute les unités réelles au compteur) : rien n'échappe au plafond suivant
    // ni à l'écran de l'administrateur. (Si la réservation a abouti malgré le délai, le compte est compté deux fois :
    // erreur prudente, jamais en faveur d'un dépassement.)
    return { mode: 'mesure', ok: true, famille, fonction, estimation: 0, unites: 0, plafond: null, mois: moisParis(), renouvellement: '' };
  }
}
/** Premier jour du mois en cours à l'heure de Paris (« AAAA-MM-01 »), comme la base (_ia_mois). */
export function moisParis(d = new Date()) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).formatToParts(d);
    const y = p.find((x) => x.type === 'year').value, m = p.find((x) => x.type === 'month').value;
    return `${y}-${m}-01`;
  } catch { return d.toISOString().slice(0, 7) + '-01'; }
}

/** Part du plafond utilisée APRÈS l'appel (unités réelles), en % entier ; null sans plafond. */
export function pourcentage(res, reelles) {
  if (!res || res.mode !== 'base' || res.plafond == null) return null;
  if (res.plafond <= 0) return 100;
  const apres = Math.max(0, res.unites - res.estimation + Math.max(0, Number(reelles) || 0));
  return Math.min(999, Math.round((apres / res.plafond) * 100));
}

/**
 * Consigne après l'appel (réussi ou non). Ne lève jamais. `reelles` = unités réellement consommées (0 si échec).
 * `mesures` = { appels, audioSec, pages, images, jetonsE, jetonsS }.
 */
export async function consigner(env, res, { uid, reelles = 0, mesures = {} }, fetchImpl) {
  if (!res || (res.mode !== 'base' && res.mode !== 'mesure') || !uid) return;
  const m = mesures || {};
  const n = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const audioSec = n(m.audioSec, 100000), pages = n(m.pages, 100), jetonsE = n(m.jetonsE, 10000000), jetonsS = n(m.jetonsS, 10000000);
  try {
    await avecDelai(rpc(env, 'ia_consigner', {
      p_user: uid, p_mois: res.mois, p_famille: res.famille, p_fonction: res.fonction,
      p_correction: Math.max(-100000, Math.min(100000, n(reelles, 100000) - res.estimation)),
      p_appels: n(m.appels == null ? 1 : m.appels, 10), p_audio_sec: audioSec, p_pages: pages, p_images: n(m.images, 100),
      p_jetons_e: jetonsE, p_jetons_s: jetonsS,
      p_cout_micro_eur: Math.min(10000000, coutMicroEur({ audioSec, jetonsE, jetonsS, pages })),
    }, fetchImpl), DELAI_MS);
  } catch (e) {
    journal('consigne_echouee', { code: (e && e.code) || 'erreur' });
  }
}

/** Lance la consigne sans retarder la réponse quand le contexte d'exécution le permet. */
export function consignerPlusTard(c, promesse) {
  try { if (c && c.executionCtx && typeof c.executionCtx.waitUntil === 'function') { c.executionCtx.waitUntil(promesse); return null; } } catch { /* pas de contexte (tests) */ }
  return promesse;
}
