// relay/src/ai/provider.js — ADAPTATEUR du socle IA : une seule interface, quel que soit le fournisseur.
//
//   const ia = makeAiProvider(env, fetchImpl);
//   await ia.transcrire({ audio, mime, langue, vocabulaire })  → { text, segments, audioSec, modele }
//   await ia.structurer({ tache, messages, jsonSchema, input })  → { data, jetonsE, jetonsS, modele }
//
// Fournisseurs :
//   - "mistral" : Mistral AI (France, hébergement UE). Transcription Voxtral, structuration Mistral Small
//                 en sortie JSON stricte. Clé MISTRAL_API_KEY = SECRET wrangler, jamais dans le navigateur.
//   - "fake"    : simulé (src/ai/fake.js), seulement si AI_PROVIDER="fake" (tests / dev).
//   - aucun     : si AI_PROVIDER est absent ET qu'il n'y a pas de clé → IA désactivée (503 côté routes).
// Changer de fournisseur = ajouter une branche ici ; ni les routes ni l'app ne bougent.
//
// Erreurs : toujours une AiError { code } — 'unavailable' (réseau, délai, 5xx, 429 fournisseur),
// 'refused' (4xx fournisseur : format non accepté…), 'invalid_output' (réponse illisible). Jamais de
// contenu (audio, texte) dans le message d'erreur.
import { FAKE_TRANSCRIPTION, FAKE_TEXTE, fauxEdlPiece } from './fake.js';

export class AiError extends Error {
  constructor(code, status) { super(`ai_${code}`); this.code = code; this.status = status || 0; }
}

export const MISTRAL_BASE = 'https://api.mistral.ai';
export const DEFAUTS = {
  modeleTranscription: 'voxtral-mini-latest',
  modeleStructure: 'mistral-small-latest',
  delaiMs: 25000,
};

export function fournisseurActif(env) {
  const p = String((env && env.AI_PROVIDER) || '').trim().toLowerCase();
  if (p === 'fake') return 'fake';
  if (p === 'mistral' || (!p && env && env.MISTRAL_API_KEY)) return env && env.MISTRAL_API_KEY ? 'mistral' : null;
  return null;
}

const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

async function appel(fetchImpl, url, init, delaiMs) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(delaiMs) });
  } catch {
    throw new AiError('unavailable');
  }
  if (res.status === 429 || res.status >= 500) throw new AiError('unavailable', res.status);
  if (!res.ok) throw new AiError('refused', res.status);
  try { return await res.json(); } catch { throw new AiError('invalid_output', res.status); }
}

function mistral(env, fetchImpl) {
  const cle = env.MISTRAL_API_KEY;
  const base = String(env.MISTRAL_BASE_URL || MISTRAL_BASE).replace(/\/+$/, '');
  const delaiMs = Number(env.AI_TIMEOUT_MS) > 0 ? Number(env.AI_TIMEOUT_MS) : DEFAUTS.delaiMs;
  const mT = env.AI_MODEL_TRANSCRIBE || DEFAUTS.modeleTranscription;
  const mS = env.AI_MODEL_STRUCTURE || DEFAUTS.modeleStructure;
  const auth = { Authorization: `Bearer ${cle}` };
  return {
    nom: 'mistral',
    async transcrire({ audio, mime, langue = 'fr', vocabulaire = [] }) {
      const type = String(mime || '').split(';')[0].trim().toLowerCase();
      const fd = new FormData();
      fd.append('model', mT);
      fd.append('file', new Blob([audio], { type }), `dictee.${EXT[type] || 'bin'}`);
      if (langue) fd.append('language', langue);
      // Vocabulaire d'aide (« context_bias ») : désactivé tant que son format n'est pas vérifié avec
      // la clé réelle — un champ mal formé ferait échouer TOUTE la transcription.
      if (env.AI_CONTEXT_BIAS === 'true') for (const v of vocabulaire.slice(0, 100)) fd.append('context_bias', v);
      fd.append('timestamp_granularities', 'segment');
      const j = await appel(fetchImpl, `${base}/v1/audio/transcriptions`, { method: 'POST', headers: auth, body: fd }, delaiMs);
      if (!j || typeof j.text !== 'string') throw new AiError('invalid_output');
      const segments = Array.isArray(j.segments)
        ? j.segments.filter((s) => s && typeof s.text === 'string').map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: s.text.trim() }))
        : [];
      const u = j.usage || {};
      const audioSec = Number(u.prompt_audio_seconds) || (segments.length ? Math.ceil(segments[segments.length - 1].end) : 0);
      return { text: j.text.trim(), segments, audioSec, modele: j.model || mT };
    },
    async structurer({ tache, messages, jsonSchema }) {
      const body = {
        model: mS,
        temperature: 0,
        messages,
        response_format: { type: 'json_schema', json_schema: { name: String(tache).replace(/[^a-z0-9_-]/gi, '_'), schema: jsonSchema, strict: true } },
      };
      const j = await appel(fetchImpl, `${base}/v1/chat/completions`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }, delaiMs);
      const contenu = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      let data;
      try { data = typeof contenu === 'string' ? JSON.parse(contenu) : contenu; } catch { throw new AiError('invalid_output'); }
      if (!data || typeof data !== 'object') throw new AiError('invalid_output');
      const u = j.usage || {};
      return { data, jetonsE: Number(u.prompt_tokens) || 0, jetonsS: Number(u.completion_tokens) || 0, modele: j.model || mS };
    },
  };
}

function fake() {
  return {
    nom: 'fake',
    async transcrire({ audio }) {
      const octets = audio && audio.byteLength ? audio.byteLength : 0;
      return { text: FAKE_TEXTE, segments: FAKE_TRANSCRIPTION.map((s) => ({ ...s })), audioSec: Math.max(1, Math.round(octets / 4000)), modele: 'fake' };
    },
    async structurer({ tache, input }) {
      if (tache !== 'edl-piece') throw new AiError('refused', 400);
      const data = fauxEdlPiece(input);
      return { data, jetonsE: Math.ceil(JSON.stringify(input).length / 4), jetonsS: Math.ceil(JSON.stringify(data).length / 4), modele: 'fake' };
    },
  };
}

export function makeAiProvider(env, fetchImpl = (...a) => fetch(...a)) {
  const f = fournisseurActif(env);
  if (f === 'fake') return fake();
  if (f === 'mistral') return mistral(env, fetchImpl);
  return null;
}
