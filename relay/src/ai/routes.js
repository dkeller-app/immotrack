// relay/src/ai/routes.js — routes du SOCLE IA, montées par src/index.js.
//
//   GET  /ai/status                       → { actif, fournisseur, limites, usageJour }
//   POST /ai/transcribe?lang=fr&task=…    corps = audio brut (Content-Type audio/*) → { text, segments, audioSec, modele }
//   POST /ai/structure                    JSON { task, input } → { data, rejets, modele }
//   (tâche `edl-photos` = état des lieux filmé : seulement si l'interrupteur AI_VIDEO est posé, cf. video.js)
//
// Toutes exigent un utilisateur connecté (même garde JWT/JWKS que POST /sessions).
// Garde-fous : taille et type de l'audio contrôlés AVANT lecture, quota par compte et par jour (KV), plafond MENSUEL par
// compte selon l'offre (base, migration 0062, src/ai/conso.js ; absent → seulement le quota du jour),
// sortie du modèle validée par la tâche, erreurs propres et non bloquantes pour l'app.
// JOURNAUX : une ligne de mesure par appel (route, statut, octets, secondes, jetons, durée) — JAMAIS
// d'audio, de texte, d'extrait, de nom de pièce ni d'identifiant (règle vérifiée par test).
import { makeAiProvider, fournisseurActif, AiError } from './provider.js';
import { limites, lireUsageJour, decider, enregistrer } from './quota.js';
import { tache, JSON_MAX_IMAGES } from './tasks/index.js';
import { videoActif, annonceVideo, VIDEO_DEFAUTS } from './video.js';
import { ocrActif, annonceOcr } from './ocr.js';
// Plafonds MENSUELS par compte selon l'offre (migration 0062) : en plus du garde-fou journalier ci-dessus (KV).
import { reserver, consigner, consignerPlusTard, pourcentage, fonctionTache, estimationAudioSec, ANALYSE_DICTEE } from './conso.js';

export const AUDIO_TYPES = new Set(['audio/mp3', 'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
export const AUDIO_MAX_DEFAUT = 10 * 1024 * 1024;   // 10 Mo ≈ 20 min d'Opus, ≈ 5 min de WAV 16 kHz
const JSON_MAX = 256 * 1024;

const audioMax = (env) => (Number(env.AI_AUDIO_MAX_BYTES) > 0 ? Number(env.AI_AUDIO_MAX_BYTES) : AUDIO_MAX_DEFAUT);
function mesure(route, statut, champs = {}) {
  const extra = Object.entries(champs).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`[ai] ${route} ${statut}${extra ? ' ' + extra : ''}`);
}
/** Lit le corps en flux, avec un plafond : un envoi sans Content-Length (segmenté) ne peut pas faire
 *  charger plus que `max` octets en mémoire. */
export async function lireCorps(req, max) {
  const flux = req.raw && req.raw.body;
  if (!flux) return { buf: new ArrayBuffer(0) };
  const lecteur = flux.getReader();
  const morceaux = []; let n = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await lecteur.cancel(); } catch { /* rien */ } return { trop: true }; }
    morceaux.push(value);
  }
  const buf = new Uint8Array(n); let o = 0;
  for (const m of morceaux) { buf.set(m, o); o += m.byteLength; }
  return { buf: buf.buffer };
}
/** Compteurs de consommation : un échec d'écriture KV ne doit JAMAIS faire échouer (donc refacturer) un appel. */
async function compter(kv, uid, delta, part = '') {
  try { await enregistrer(kv, uid, delta, new Date(), part); } catch { mesure('quota', 'ecriture_kv_echouee'); }
}
/** Consigne la consommation du compte (base, migration 0062) sans retarder la réponse quand c'est possible. */
async function consignerCompte(c, res, args) {
  const p = consignerPlusTard(c, consigner(c.env, res, args));
  if (p) await p;
}
/** Refus au plafond MENSUEL de l'offre (fonction en pause pour ce compte seulement, jusqu'au 1er du mois suivant). */
function refusMois(c, route, res) {
  mesure(route, 429, { motif: 'mois', fn: res.fonction });
  return c.json({ error: 'quota', motif: 'mois', famille: res.famille, renouvellement: res.renouvellement }, 429);
}
const avecConso = (corps, res, reelles) => {
  const pct = pourcentage(res, reelles);
  return pct == null ? corps : { ...corps, conso: { famille: res.famille, pct } };
};
function erreurIA(c, route, e, t0) {
  const code = e instanceof AiError ? e.code : 'unavailable';
  const st = code === 'refused' ? 422 : 502;
  mesure(route, st, { code, ms: Date.now() - t0 });
  return c.json({ error: code === 'refused' ? 'ai_refused' : code === 'invalid_output' ? 'ai_invalid_output' : 'ai_unavailable' }, st);
}

export function registerAiRoutes(app, { requireSupabaseUser, providerFactory = makeAiProvider }) {
  app.get('/ai/status', async (c) => {
    const gate = await requireSupabaseUser(c);
    if (gate.error) return gate.error;
    const lim = limites(c.env);
    const u = await lireUsageJour(c.env.SESSIONS_KV, gate.userId);
    const f = fournisseurActif(c.env);
    return c.json({ actif: !!f, fournisseur: f, limites: lim, usageJour: { appels: u.appels, audioSec: u.audioSec, images: u.images || 0 }, video: annonceVideo(c.env, lim.imagesJour), ocr: annonceOcr(c.env) });
  });

  app.post('/ai/transcribe', async (c) => {
    const t0 = Date.now();
    const gate = await requireSupabaseUser(c);
    if (gate.error) return gate.error;
    const ia = providerFactory(c.env);
    if (!ia) { mesure('transcribe', 503); return c.json({ error: 'ai_disabled' }, 503); }

    const mime = String(c.req.header('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!AUDIO_TYPES.has(mime)) { mesure('transcribe', 415); return c.json({ error: 'audio_type' }, 415); }
    const max = audioMax(c.env);
    const annonce = Number(c.req.header('Content-Length'));
    if (Number.isFinite(annonce) && annonce > max) { mesure('transcribe', 413); return c.json({ error: 'audio_too_large', max }, 413); }

    const lim = limites(c.env);
    const kv = c.env.SESSIONS_KV;
    const d = decider(await lireUsageJour(kv, gate.userId), lim, { audio: true });
    if (!d.ok) { mesure('transcribe', 429, { motif: d.motif }); return c.json({ error: 'quota', motif: d.motif, limites: lim }, 429); }

    const lu = await lireCorps(c.req, max);
    if (lu.trop) { mesure('transcribe', 413); return c.json({ error: 'audio_too_large', max }, 413); }
    const audio = lu.buf;
    if (audio.byteLength > max) { mesure('transcribe', 413); return c.json({ error: 'audio_too_large', max }, 413); }
    if (audio.byteLength === 0) { mesure('transcribe', 400); return c.json({ error: 'audio_empty' }, 400); }

    const langue = /^[a-z]{2}$/.test(c.req.query('lang') || '') ? c.req.query('lang') : 'fr';
    const t = tache(c.req.query('task') || '');
    // Réservation AVANT l'appel payant : l'appel compte même si le fournisseur échoue ou si la réponse se perd.
    // (KV n'est pas atomique : des appels simultanés d'un même compte peuvent encore passer le contrôle —
    // borne réelle = taille max × appels simultanés ; un compteur atomique (Durable Object) est à prévoir
    // avant l'ouverture publique.)
    // Plafond MENSUEL (minutes de dictée de l'offre) : réservation atomique d'une estimation haute, corrigée après.
    const res = await reserver(c.env, { uid: gate.userId, fonction: 'dictee', estimation: estimationAudioSec(audio.byteLength) });
    if (res.mode === 'base' && !res.ok) return refusMois(c, 'transcribe', res);
    await compter(kv, gate.userId, { appels: 1 });
    try {
      const r = await ia.transcrire({ audio, mime, langue, vocabulaire: (t && t.VOCABULAIRE) || [] });
      await compter(kv, gate.userId, { audioSec: r.audioSec }, 'conso');
      await consignerCompte(c, res, { uid: gate.userId, reelles: r.audioSec, mesures: { appels: 1, audioSec: r.audioSec } });
      mesure('transcribe', 200, { fn: 'dictee', ko: Math.round(audio.byteLength / 1024), s: r.audioSec, ms: Date.now() - t0 });
      return c.json(avecConso({ text: r.text, segments: r.segments, audioSec: r.audioSec, modele: r.modele }, res, r.audioSec));
    } catch (e) {
      await consignerCompte(c, res, { uid: gate.userId, reelles: 0, mesures: { appels: 1 } });   // réservation rendue
      return erreurIA(c, 'transcribe', e, t0);
    }
  });

  app.post('/ai/structure', async (c) => {
    const t0 = Date.now();
    const gate = await requireSupabaseUser(c);
    if (gate.error) return gate.error;
    const ia = providerFactory(c.env);
    if (!ia) { mesure('structure', 503); return c.json({ error: 'ai_disabled' }, 503); }
    // Plafond du corps : 256 Kio (texte) ; plus grand seulement si la vidéo est ouverte (images en base64).
    const video = videoActif(c.env);
    // Tâches à images hors vidéo (lecture de facture) : plafond de la plus grande ; chaque tâche garde le sien (JSON_MAX).
    const plafond = Math.max(video ? VIDEO_DEFAUTS.jsonMaxOctets : JSON_MAX, JSON_MAX_IMAGES || 0);
    const annonce = Number(c.req.header('Content-Length'));
    if (Number.isFinite(annonce) && annonce > plafond) { mesure('structure', 413); return c.json({ error: 'too_large' }, 413); }

    let body, taille = 0;
    try {
      const lu = await lireCorps(c.req, plafond);
      if (lu.trop) { mesure('structure', 413); return c.json({ error: 'too_large' }, 413); }
      taille = lu.buf.byteLength;
      body = JSON.parse(new TextDecoder().decode(lu.buf));
    } catch {
      mesure('structure', 400); return c.json({ error: 'bad_json' }, 400);
    }
    const t = tache(body && body.task);
    if (!t) { mesure('structure', 400); return c.json({ error: 'unknown_task' }, 400); }
    // Taille d'abord (vidéo éteinte : une tâche vidéo garde le plafond texte de 256 Kio, comme avant).
    if (taille > ((t.video && !video) ? JSON_MAX : (t.JSON_MAX || JSON_MAX))) { mesure('structure', 413, { tache: t.nom }); return c.json({ error: 'too_large' }, 413); }
    if (t.video && !video) { mesure('structure', 503, { tache: t.nom }); return c.json({ error: 'video_disabled' }, 503); }
    if (t.ocr && !ocrActif(c.env)) { mesure('structure', 503, { tache: t.nom }); return c.json({ error: 'ocr_disabled' }, 503); }
    const v = t.validerEntree(body.input);
    if (!v.ok) { mesure('structure', 400, { tache: t.nom, raison: v.raison }); return c.json({ error: 'bad_input', raison: v.raison }, 400); }

    const lim = limites(c.env);
    const kv = c.env.SESSIONS_KV;
    const nImages = (t.video || t.images) && Array.isArray(v.input.images) ? v.input.images.length : 0;
    const d = decider(await lireUsageJour(kv, gate.userId), lim, { images: nImages });
    if (!d.ok) { mesure('structure', 429, { motif: d.motif }); return c.json({ error: 'quota', motif: d.motif, limites: lim }, 429); }

    // Plafond MENSUEL de la famille de la tâche (migration 0062). Unités : pages lues (pièces), images (vidéo),
    // 1 par lecture de facture ou demande ; l'analyse d'une dictée consomme 15 s de dictée, avec une tolérance de 1 800 s
    // au-delà du plafond (la dernière dictée transcrite et payée est analysée ; un texte libre ne contourne pas la pause).
    const fonction = fonctionTache(t.nom);
    const unitesPrevues = (f) => (f === 'video' ? nImages : f === 'dictee' ? ANALYSE_DICTEE.estimation : 1);
    const res = await reserver(c.env, { uid: gate.userId, fonction, estimation: unitesPrevues(fonction), marge: fonction === 'dictee' ? ANALYSE_DICTEE.marge : 0 });
    if (res.mode === 'base' && !res.ok) return refusMois(c, 'structure', res);
    await compter(kv, gate.userId, nImages ? { appels: 1, images: nImages } : { appels: 1 });   // réservation avant l'appel payant
    let r;
    try {
      r = t.ocr
        // Lecture de document (OCR, point d'accès UE) : une page, annotation selon le schéma de la tâche ; facturée à la page.
        ? Object.assign(await ia.lireDocument({ tache: t.nom, image: v.input.images[0], jsonSchema: t.schema ? t.schema(v.input) : t.jsonSchema, consigne: t.consigne ? t.consigne(v.input) : '', input: v.input, delaiMs: t.DELAI_MS }), { jetonsE: 0, jetonsS: 0 })
        : await ia.structurer({ tache: t.nom, messages: t.messages(v.input), jsonSchema: t.jsonSchema, input: v.input, delaiMs: t.DELAI_MS });
    } catch (e) {
      await consignerCompte(c, res, { uid: gate.userId, reelles: 0, mesures: { appels: 1 } });   // réservation rendue
      return erreurIA(c, 'structure', e, t0);
    }
    await compter(kv, gate.userId, { jetonsE: r.jetonsE, jetonsS: r.jetonsS }, 'conso');
    // Pages réellement lues (usage_info.pages_processed de l'OCR), jamais moins d'une.
    const pages = t.ocr ? Math.max(1, Number(r.pages) || 1) : 0;
    const reelles = fonction === 'pieces' ? pages : unitesPrevues(fonction);
    await consignerCompte(c, res, { uid: gate.userId, reelles, mesures: { appels: 1, jetonsE: r.jetonsE, jetonsS: r.jetonsS, pages, images: nImages } });
    const s = t.validerSortie(r.data, v.input, { texte: r.texte });   // texte reconnu (OCR) : contrôle seulement, jamais renvoyé
    if (!s.ok) { mesure('structure', 502, { tache: t.nom, code: 'invalid_output', ms: Date.now() - t0 }); return c.json({ error: 'ai_invalid_output' }, 502); }
    mesure('structure', 200, { tache: t.nom, fn: fonction, je: r.jetonsE, js: r.jetonsS, rejets: s.rejets, ...(nImages ? { images: nImages } : {}), ...(t.ocr ? { pages, txt: typeof r.texte === 'string' && r.texte.trim() ? 1 : 0 } : {}), ms: Date.now() - t0 });
    return c.json(avecConso({ data: s.data, rejets: s.rejets, modele: r.modele }, res, reelles));
  });
}
