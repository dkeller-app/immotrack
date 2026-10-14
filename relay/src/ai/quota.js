// relay/src/ai/quota.js — quota quotidien et suivi de consommation IA, PAR COMPTE, SANS CONTENU.
//
// KV (binding existant SESSIONS_KV, préfixes dédiés) :
//   aiq:{uid}:{AAAA-MM-JJ} → { appels, audioSec, jetonsE, jetonsS }   TTL 48 h  (quota du jour)
//   aiu:{uid}:{AAAA-MM}    → { appels, audioSec, jetonsE, jetonsS }   TTL 400 j (suivi mensuel)
// Jamais d'audio, de texte, de nom de pièce ni d'identifiant de bail : seulement des compteurs.
// KV est « à cohérence éventuelle » et sans opération atomique : le quota est un garde-fou de coût, PAS
// une barrière exacte. Des appels SIMULTANÉS d'un même compte authentifié peuvent tous passer le contrôle
// (chaque appel reste borné par la taille max). Réservation avant l'appel payant pour réduire la fenêtre ;
// compteur atomique (Durable Object) à prévoir avant l'ouverture publique.
//
// Valeurs par défaut surchargeables par variables d'environnement (wrangler.toml [vars]).
export const QUOTA_DEFAUTS = { audioSecJour: 3600, appelsJour: 200 };

const VIDE = () => ({ appels: 0, audioSec: 0, jetonsE: 0, jetonsS: 0 });

export function limites(env) {
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);
  return {
    audioSecJour: n(env && env.AI_QUOTA_AUDIO_SEC, QUOTA_DEFAUTS.audioSecJour),
    appelsJour: n(env && env.AI_QUOTA_CALLS, QUOTA_DEFAUTS.appelsJour),
  };
}

const jour = (d) => d.toISOString().slice(0, 10);
const mois = (d) => d.toISOString().slice(0, 7);
export const cleJour = (uid, d) => `aiq:${uid}:${jour(d)}`;
export const cleMois = (uid, d) => `aiu:${uid}:${mois(d)}`;

async function lire(kv, cle) {
  try { const v = await kv.get(cle, 'json'); return v && typeof v === 'object' ? { ...VIDE(), ...v } : VIDE(); } catch { return VIDE(); }
}

export async function lireUsageJour(kv, uid, now = new Date()) { return lire(kv, cleJour(uid, now)); }

// Décide AVANT l'appel au fournisseur. `audio` = vrai pour une transcription (qui consomme des minutes).
export function decider(usage, lim, { audio = false } = {}) {
  if (usage.appels >= lim.appelsJour) return { ok: false, motif: 'appels' };
  if (audio && usage.audioSec >= lim.audioSecJour) return { ok: false, motif: 'audio' };
  return { ok: true };
}

export async function enregistrer(kv, uid, delta, now = new Date()) {
  const ajoute = (u) => ({
    appels: u.appels + (delta.appels || 0),
    audioSec: u.audioSec + Math.max(0, Math.round(delta.audioSec || 0)),
    jetonsE: u.jetonsE + Math.max(0, Math.round(delta.jetonsE || 0)),
    jetonsS: u.jetonsS + Math.max(0, Math.round(delta.jetonsS || 0)),
  });
  const kj = cleJour(uid, now), km = cleMois(uid, now);
  const [uj, um] = await Promise.all([lire(kv, kj), lire(kv, km)]);
  await Promise.all([
    kv.put(kj, JSON.stringify(ajoute(uj)), { expirationTtl: 2 * 86400 }),
    kv.put(km, JSON.stringify(ajoute(um)), { expirationTtl: 400 * 86400 }),
  ]);
}
