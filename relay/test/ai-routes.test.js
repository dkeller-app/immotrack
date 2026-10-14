import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { registerAiRoutes } from '../src/ai/routes.js';
import { makeAiProvider } from '../src/ai/provider.js';
import app from '../src/index.js';
import { appAuth } from './_auth.js';
import { cleJour, cleMois } from '../src/ai/quota.js';
import { CUISINE_INPUT, CUISINE_TEXTE } from './fixtures/edl-cuisine.js';

const FAKE = { ...env, AI_PROVIDER: 'fake' };
const uid = () => crypto.randomUUID();
const audio = (n = 8000) => new Uint8Array(n).fill(7);

async function transcribe(e, { sub = uid(), type = 'audio/webm;codecs=opus', body = audio(), headers = {} } = {}) {
  return app.request('/ai/transcribe?lang=fr&task=edl-piece', { method: 'POST', headers: { ...(await appAuth({ sub })), 'Content-Type': type, ...headers }, body }, e);
}
async function structure(e, payload, sub = uid()) {
  return app.request('/ai/structure', { method: 'POST', headers: { ...(await appAuth({ sub })), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, e);
}

afterEach(() => vi.restoreAllMocks());

describe('routes IA — authentification et activation', () => {
  it('401 sans jeton (les trois routes)', async () => {
    for (const [m, p] of [['GET', '/ai/status'], ['POST', '/ai/transcribe'], ['POST', '/ai/structure']]) {
      const r = await app.request(p, { method: m }, FAKE);
      expect(r.status).toBe(401);
    }
  });
  it('401 avec un jeton expiré ou d\'un autre rôle', async () => {
    const r1 = await app.request('/ai/status', { headers: await appAuth({ expiresIn: '-1m' }) }, FAKE);
    const r2 = await app.request('/ai/status', { headers: await appAuth({ role: 'anon' }) }, FAKE);
    expect([r1.status, r2.status]).toEqual([401, 401]);
  });
  it('sans clé ni fournisseur : 503 ai_disabled, status actif=false', async () => {
    const off = { ...env, AI_PROVIDER: undefined, MISTRAL_API_KEY: undefined };
    const s = await (await app.request('/ai/status', { headers: await appAuth() }, off)).json();
    expect(s.actif).toBe(false);
    expect((await transcribe(off)).status).toBe(503);
    expect((await structure(off, { task: 'edl-piece', input: CUISINE_INPUT })).status).toBe(503);
  });
  it('status : actif, fournisseur, limites et usage du jour du compte', async () => {
    const sub = uid();
    await transcribe(FAKE, { sub });
    const s = await (await app.request('/ai/status', { headers: await appAuth({ sub }) }, FAKE)).json();
    expect(s).toMatchObject({ actif: true, fournisseur: 'fake', limites: { audioSecJour: 3600, appelsJour: 200 }, usageJour: { appels: 1, audioSec: 2 } });
  });
});

describe('routes IA — transcription', () => {
  it('200 : texte + segments + durée', async () => {
    const r = await transcribe(FAKE);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.text).toBe(CUISINE_TEXTE);
    expect(j.segments).toHaveLength(5);
    expect(j.audioSec).toBe(2);
  });
  it('415 : type non audio', async () => {
    expect((await transcribe(FAKE, { type: 'application/pdf' })).status).toBe(415);
    expect((await transcribe(FAKE, { type: 'text/plain' })).status).toBe(415);
  });
  it('413 : audio trop gros (annoncé ou réel), 400 : audio vide', async () => {
    const petit = { ...FAKE, AI_AUDIO_MAX_BYTES: '1000' };
    expect((await transcribe(petit, { body: audio(2000) })).status).toBe(413);
    expect((await transcribe(FAKE, { body: new Uint8Array(0) })).status).toBe(400);
  });
  it('accepte les formats iOS / Android / import', async () => {
    for (const t of ['audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mpeg', 'audio/wav']) {
      expect((await transcribe(FAKE, { type: t })).status).toBe(200);
    }
  });
});

describe('routes IA — corps sans Content-Length et écriture KV en échec', () => {
  it('413 : corps segmenté (sans Content-Length) au-delà du plafond, lu en flux', async () => {
    const petit = { ...FAKE, AI_AUDIO_MAX_BYTES: '1000' };
    const flux = new ReadableStream({ start(ctl) { for (let i = 0; i < 5; i++) ctl.enqueue(new Uint8Array(400)); ctl.close(); } });
    const r = await app.request('/ai/transcribe', { method: 'POST', headers: { ...(await appAuth({ sub: uid() })), 'Content-Type': 'audio/webm' }, body: flux, duplex: 'half' }, petit);
    expect(r.status).toBe(413);
  });
  it('un échec d’écriture KV ne fait pas échouer (donc refacturer) une transcription réussie', async () => {
    const kvCasse = { get: async () => null, put: async () => { throw new Error('KV 429'); } };
    const r = await transcribe({ ...FAKE, SESSIONS_KV: kvCasse });
    expect(r.status).toBe(200);
    expect((await r.json()).text).toBe(CUISINE_TEXTE);
  });
});

describe('routes IA — structuration', () => {
  it('200 : propositions validées pour la pièce', async () => {
    const r = await structure(FAKE, { task: 'edl-piece', input: CUISINE_INPUT });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(Array.isArray(j.data.propositions)).toBe(true);
    expect(j.data.propositions.length).toBeGreaterThan(5);
    const ids = new Set(CUISINE_INPUT.elements.map((e) => e.id));
    for (const p of j.data.propositions) expect(ids.has(p.elementId)).toBe(true);
  });
  it('400 : JSON illisible, tâche inconnue, entrée invalide', async () => {
    const bad = await app.request('/ai/structure', { method: 'POST', headers: { ...(await appAuth()), 'Content-Type': 'application/json' }, body: '{pas json' }, FAKE);
    expect(bad.status).toBe(400);
    expect((await structure(FAKE, { task: 'inconnue', input: {} })).status).toBe(400);
    expect((await structure(FAKE, { task: 'edl-piece', input: { ...CUISINE_INPUT, texte: '' } })).status).toBe(400);
  });
});

describe('routes IA — quota par compte et par jour', () => {
  it('429 au-delà du nombre d\'appels du jour, sans toucher les autres comptes', async () => {
    const e = { ...FAKE, AI_QUOTA_CALLS: '2' };
    const sub = uid();
    expect((await transcribe(e, { sub })).status).toBe(200);
    expect((await structure(e, { task: 'edl-piece', input: CUISINE_INPUT }, sub)).status).toBe(200);
    const r = await transcribe(e, { sub });
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: 'quota', motif: 'appels' });
    expect((await transcribe(e)).status).toBe(200);   // autre compte
  });
  it('429 quand les minutes d\'audio du jour sont épuisées', async () => {
    const e = { ...FAKE, AI_QUOTA_AUDIO_SEC: '2' };
    const sub = uid();
    expect((await transcribe(e, { sub })).status).toBe(200);
    expect(await (await transcribe(e, { sub })).json()).toMatchObject({ error: 'quota', motif: 'audio' });
  });
  it('suivi de consommation jour + mois : compteurs seulement, aucun contenu', async () => {
    const sub = uid();
    await transcribe(FAKE, { sub });
    await structure(FAKE, { task: 'edl-piece', input: CUISINE_INPUT }, sub);
    const now = new Date();
    for (const k of [cleJour(sub, now), cleMois(sub, now)]) {
      const raw = await env.SESSIONS_KV.get(k);
      const v = JSON.parse(raw);
      expect(Object.keys(v).sort()).toEqual(['appels', 'audioSec', 'jetonsE', 'jetonsS']);
      expect(v.appels).toBe(2);
      expect(v.jetonsE).toBeGreaterThan(0);
      expect(raw).not.toMatch(/faillance|cuisine|placard/i);
    }
  });
});

describe('routes IA — journaux sans contenu', () => {
  it('aucune ligne de journal ne contient la transcription, un extrait ou un nom de pièce', async () => {
    const lignes = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) vi.spyOn(console, m).mockImplementation((...a) => lignes.push(a.map(String).join(' ')));
    await transcribe(FAKE);
    await structure(FAKE, { task: 'edl-piece', input: CUISINE_INPUT });
    await structure(FAKE, { task: 'edl-piece', input: { ...CUISINE_INPUT, texte: '' } });
    await transcribe({ ...FAKE, AI_QUOTA_CALLS: '1' }, { sub: 'x' }); await transcribe({ ...FAKE, AI_QUOTA_CALLS: '1' }, { sub: 'x' });
    expect(lignes.length).toBeGreaterThan(0);
    const tout = lignes.join('\n');
    for (const interdit of ['faillance', 'porte blanche', 'Cuisine', 'placard', 'Plan de travail', 'bonneta']) expect(tout).not.toContain(interdit);
  });
});

describe('routes IA — fournisseur Mistral (client HTTP injecté)', () => {
  // App dédiée : mêmes routes, garde d'auth simulée, fournisseur Mistral avec un fetch injecté
  // (aucun accès réseau, aucune dépendance au fetchMock global partagé par les autres fichiers).
  const monter = (reponse) => {
    const f = vi.fn().mockImplementation(async () => (typeof reponse === 'function' ? reponse() : reponse));
    const a = new Hono();
    registerAiRoutes(a, {
      requireSupabaseUser: async () => ({ userId: uid() }),
      providerFactory: (e) => makeAiProvider({ ...e, AI_PROVIDER: 'mistral', MISTRAL_API_KEY: 'cle-test' }, f),
    });
    return { a, f };
  };
  const rep = (o, st = 200) => () => new Response(typeof o === 'string' ? o : JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
  const post = (a, p, init) => a.request(p, { method: 'POST', ...init }, env);
  const struct = (a) => post(a, '/ai/structure', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'edl-piece', input: CUISINE_INPUT }) });

  it('transcription relayée vers api.mistral.ai, la clé ne revient jamais au client', async () => {
    const { a, f } = monter(rep({ model: 'voxtral', text: 'sol carrelage bon état', segments: [], usage: { prompt_audio_seconds: 4 } }));
    const r = await post(a, '/ai/transcribe', { headers: { 'Content-Type': 'audio/mp4' }, body: audio() });
    expect(r.status).toBe(200);
    const t = await r.text();
    expect(t).toContain('sol carrelage');
    expect(t).not.toContain('cle-test');
    expect(f.mock.calls[0][0]).toBe('https://api.mistral.ai/v1/audio/transcriptions');
  });
  it('panne fournisseur → 502 ai_unavailable (non bloquant pour l’app)', async () => {
    const { a } = monter(rep('down', 503));
    const r = await struct(a);
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'ai_unavailable' });
  });
  it('format refusé par le fournisseur → 422 ai_refused', async () => {
    const { a } = monter(rep({ detail: 'x' }, 400));
    const r = await post(a, '/ai/transcribe', { headers: { 'Content-Type': 'audio/webm' }, body: audio() });
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: 'ai_refused' });
  });
  it('sortie du modèle illisible → 502 ai_invalid_output, rien n’atteint l’app', async () => {
    const { a } = monter(rep({ choices: [{ message: { content: '["pas", "un objet"]' } }], usage: {} }));
    const r = await struct(a);
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'ai_invalid_output' });
  });
  it('élément hors liste renvoyé par le modèle → écarté, compté dans rejets', async () => {
    const data = { propositions: [
      { elementId: '7', etat: "État d'usage", observation: 'Rayures.', source: 'vasque évier style ancien avec rayures', justification: '« avec rayures »', aVerifier: null },
      { elementId: '200', etat: null, observation: 'Inventé.', source: 'vasque évier', justification: null, aVerifier: null },
    ], aAjouter: [], compteurs: [], corrections: [] };
    const { a } = monter(rep({ choices: [{ message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    const j = await (await struct(a)).json();
    expect(j.data.propositions.map((p) => p.elementId)).toEqual(['7']);
    expect(j.rejets).toBe(1);
  });
});

describe('CORS — routes IA', () => {
  it('le preflight d\'un envoi audio depuis l\'app est autorisé', async () => {
    const r = await app.request('/ai/transcribe', { method: 'OPTIONS', headers: { Origin: 'https://dkeller-app.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } }, FAKE);
    expect(r.status).toBeLessThan(300);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://dkeller-app.github.io');
  });
});
