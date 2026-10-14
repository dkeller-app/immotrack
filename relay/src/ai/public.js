// relay/src/ai/public.js — IA des LIENS PUBLICS (sans compte) : locataire (/l) et artisan (/a). Migration 0060, D15.
//
//   POST /api/el/ia/transcrire   corps = audio brut (X-El-Jeton)  → { text, audioSec }
//   POST /api/el/ia/structurer   JSON { task: 'incident-locataire', input }  → { data, rejets }
//   POST /api/ar/ia/transcrire   corps = audio brut (X-Ar-Jeton)  → { text, audioSec }
//   POST /api/ar/ia/structurer   JSON { task: 'constat-artisan', input }     → { data, rejets }
//
// Garde-fous (en plus de ceux du socle, src/ai/routes.js) :
//   - le lien doit être ACTIF : la base (el_ia_autorise / ar_ia_autorise, identité du relais) renvoie le compte du
//     propriétaire qui l'a émis — sinon 410 « inactif » ;
//   - seules les tâches prévues pour ce type de lien (TACHES_LIEN) ;
//   - double quota, réservé AVANT l'appel payant : celui du LIEN (par jour) et celui du COMPTE DU PROPRIÉTAIRE, à qui la
//     consommation est imputée ;
//   - journaux sans contenu (route, statut, octets, secondes, jetons, durée).
import { makeAiProvider, AiError } from './provider.js';
import { limites, lireUsageJour, decider, enregistrer } from './quota.js';
import { tache, TACHES_LIEN } from './tasks/index.js';
import { AUDIO_TYPES, AUDIO_MAX_DEFAUT, lireCorps } from './routes.js';
import { ctxLien, appel, jsonErreur, inactif } from '../espace-locataire.js';

// Quota PAR LIEN et par jour (D15) : assez pour un signalement ou une intervention, borné contre l'abus d'un lien.
export const QUOTA_LIEN = Object.freeze({
  el: { appelsJour: 8, audioSecJour: 300, imagesJour: 9 },
  ar: { appelsJour: 12, audioSecJour: 600, imagesJour: 0 },
});
const JSON_MAX_LIEN = 1536 * 1024;
const audioMax = (env) => Math.min(Number(env.AI_AUDIO_MAX_BYTES) > 0 ? Number(env.AI_AUDIO_MAX_BYTES) : AUDIO_MAX_DEFAUT, 5 * 1024 * 1024);
const mesure = (route, statut, champs = {}) => console.log(`[ai-lien] ${route} ${statut}${Object.entries(champs).map(([k, v]) => ` ${k}=${v}`).join('')}`);
const cleLien = (type, lien) => `lien-${type}-${lien}`;
async function compter(kv, uid, delta, part = '') { try { await enregistrer(kv, uid, delta, new Date(), part); } catch { mesure('quota', 'ecriture_kv_echouee'); } }

// Lien actif → { proprietaire, lien } ; sinon une réponse (410, erreur base).
async function autoriser(c, type) {
  const x = await ctxLien(c, type === 'el' ? 'X-El-Jeton' : 'X-Ar-Jeton', type + ':');
  if (x.reponse) return { reponse: x.reponse };
  if (!x.h) return { reponse: inactif(c) };
  const r = await appel(c, type === 'el' ? 'el_ia_autorise' : 'ar_ia_autorise', { p_jeton_sha256: x.h, p_ip_hash: x.ip });
  if (!r.ok) return { reponse: r.reponse };
  if (!r.v || !r.v.proprietaire || !r.v.lien) return { reponse: inactif(c) };
  return { proprietaire: String(r.v.proprietaire), lien: String(r.v.lien) };
}
// Les deux quotas (lien, puis compte du propriétaire) ; null si l'appel peut partir.
async function quotas(c, type, a, besoin) {
  const kv = c.env.SESSIONS_KV;
  const dl = decider(await lireUsageJour(kv, cleLien(type, a.lien)), QUOTA_LIEN[type], besoin);
  if (!dl.ok) return { motif: 'lien_' + dl.motif };
  const dp = decider(await lireUsageJour(kv, a.proprietaire), limites(c.env), besoin);
  if (!dp.ok) return { motif: dp.motif };
  return null;
}
const erreurIA = (c, route, e, t0) => {
  const code = e instanceof AiError ? e.code : 'unavailable';
  const st = code === 'refused' ? 422 : 502;
  mesure(route, st, { code, ms: Date.now() - t0 });
  return c.json({ erreur: code === 'refused' ? 'ia_refus' : 'ia_indisponible' }, st);
};

export function registerAiPublicRoutes(app, { providerFactory = makeAiProvider } = {}) {
  for (const type of ['el', 'ar']) {
    app.post(`/api/${type}/ia/transcrire`, async (c) => {
      const t0 = Date.now(), route = type + '/transcrire';
      const ia = providerFactory(c.env);
      if (!ia) { mesure(route, 503); return jsonErreur(c, 503, 'ia_inactive'); }
      const mime = String(c.req.header('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (!AUDIO_TYPES.has(mime)) { mesure(route, 415); return jsonErreur(c, 415, 'audio_type'); }
      const max = audioMax(c.env);
      const annonce = Number(c.req.header('Content-Length'));
      if (Number.isFinite(annonce) && annonce > max) { mesure(route, 413); return jsonErreur(c, 413, 'audio_trop_gros'); }
      const a = await autoriser(c, type); if (a.reponse) return a.reponse;
      const q = await quotas(c, type, a, { audio: true });
      if (q) { mesure(route, 429, q); return c.json({ erreur: 'quota', motif: q.motif }, 429); }
      const lu = await lireCorps(c.req, max);
      if (lu.trop || lu.buf.byteLength > max) { mesure(route, 413); return jsonErreur(c, 413, 'audio_trop_gros'); }
      if (!lu.buf.byteLength) { mesure(route, 400); return jsonErreur(c, 400, 'audio_vide'); }
      const kv = c.env.SESSIONS_KV;
      await compter(kv, cleLien(type, a.lien), { appels: 1 }); await compter(kv, a.proprietaire, { appels: 1 });
      try {
        const r = await ia.transcrire({ audio: lu.buf, mime, langue: 'fr', vocabulaire: [] });
        await compter(kv, cleLien(type, a.lien), { audioSec: r.audioSec }, 'conso'); await compter(kv, a.proprietaire, { audioSec: r.audioSec }, 'conso');
        mesure(route, 200, { ko: Math.round(lu.buf.byteLength / 1024), s: r.audioSec, ms: Date.now() - t0 });
        return c.json({ text: r.text, audioSec: r.audioSec });
      } catch (e) { return erreurIA(c, route, e, t0); }
    });

    app.post(`/api/${type}/ia/structurer`, async (c) => {
      const t0 = Date.now(), route = type + '/structurer';
      const ia = providerFactory(c.env);
      if (!ia) { mesure(route, 503); return jsonErreur(c, 503, 'ia_inactive'); }
      const annonce = Number(c.req.header('Content-Length'));
      if (Number.isFinite(annonce) && annonce > JSON_MAX_LIEN) { mesure(route, 413); return jsonErreur(c, 413, 'trop_gros'); }
      let body;
      try {
        const lu = await lireCorps(c.req, JSON_MAX_LIEN);
        if (lu.trop) { mesure(route, 413); return jsonErreur(c, 413, 'trop_gros'); }
        body = JSON.parse(new TextDecoder().decode(lu.buf));
      } catch { mesure(route, 400); return jsonErreur(c, 400, 'json'); }
      const t = body && TACHES_LIEN[type].includes(body.task) ? tache(body.task) : null;
      if (!t) { mesure(route, 400); return jsonErreur(c, 400, 'tache'); }
      const v = t.validerEntree(body.input);
      if (!v.ok) { mesure(route, 400, { tache: t.nom, raison: v.raison }); return c.json({ erreur: 'entree', raison: v.raison }, 400); }
      const nImages = t.images && Array.isArray(v.input.images) ? v.input.images.length : 0;
      const a = await autoriser(c, type); if (a.reponse) return a.reponse;
      const q = await quotas(c, type, a, { images: nImages });
      if (q) { mesure(route, 429, q); return c.json({ erreur: 'quota', motif: q.motif }, 429); }
      const kv = c.env.SESSIONS_KV;
      const res = nImages ? { appels: 1, images: nImages } : { appels: 1 };
      await compter(kv, cleLien(type, a.lien), res); await compter(kv, a.proprietaire, res);
      let r;
      try { r = await ia.structurer({ tache: t.nom, messages: t.messages(v.input), jsonSchema: t.jsonSchema, input: v.input, delaiMs: t.DELAI_MS }); }
      catch (e) { return erreurIA(c, route, e, t0); }
      await compter(kv, a.proprietaire, { jetonsE: r.jetonsE, jetonsS: r.jetonsS }, 'conso');
      const s = t.validerSortie(r.data, v.input);
      if (!s.ok) { mesure(route, 502, { tache: t.nom, code: 'invalid_output' }); return jsonErreur(c, 502, 'ia_sortie'); }
      mesure(route, 200, { tache: t.nom, je: r.jetonsE, js: r.jetonsS, rejets: s.rejets, ...(nImages ? { images: nImages } : {}), ms: Date.now() - t0 });
      return c.json({ data: s.data, rejets: s.rejets });
    });
  }
}
