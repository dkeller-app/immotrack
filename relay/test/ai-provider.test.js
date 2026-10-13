import { describe, it, expect, vi } from 'vitest';
import { makeAiProvider, fournisseurActif, AiError, MISTRAL_BASE } from '../src/ai/provider.js';
import * as T from '../src/ai/tasks/edl-piece.js';
import { CUISINE_INPUT } from './fixtures/edl-cuisine.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

describe('adaptateur IA — choix du fournisseur', () => {
  it('fake seulement si demandé explicitement ; mistral si clé ; sinon désactivé', () => {
    expect(fournisseurActif({ AI_PROVIDER: 'fake' })).toBe('fake');
    expect(fournisseurActif({ MISTRAL_API_KEY: 'k' })).toBe('mistral');
    expect(fournisseurActif({ AI_PROVIDER: 'mistral', MISTRAL_API_KEY: 'k' })).toBe('mistral');
    expect(fournisseurActif({ AI_PROVIDER: 'mistral' })).toBe(null);   // pas de clé → pas d'IA
    expect(fournisseurActif({})).toBe(null);
    expect(fournisseurActif({ AI_PROVIDER: 'openai', MISTRAL_API_KEY: 'k' })).toBe(null);
    expect(makeAiProvider({})).toBe(null);
  });
});

describe('adaptateur IA — Mistral (client HTTP injecté)', () => {
  const env = { MISTRAL_API_KEY: 'cle-test' };

  it('transcrire : multipart vers /v1/audio/transcriptions, clé en en-tête, réponse normalisée', async () => {
    const f = vi.fn().mockResolvedValue(json({ model: 'voxtral-mini-2602', text: ' bonjour ', segments: [{ start: 0, end: 2.4, text: ' bonjour ' }], usage: { prompt_audio_seconds: 3 } }));
    const r = await makeAiProvider(env, f).transcrire({ audio: new Uint8Array([1, 2, 3]).buffer, mime: 'audio/webm;codecs=opus', langue: 'fr', vocabulaire: ['faïence'] });
    expect(r).toEqual({ text: 'bonjour', segments: [{ start: 0, end: 2.4, text: 'bonjour' }], audioSec: 3, modele: 'voxtral-mini-2602' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${MISTRAL_BASE}/v1/audio/transcriptions`);
    expect(init.headers.Authorization).toBe('Bearer cle-test');
    expect(init.body.get('model')).toBe('voxtral-mini-latest');
    expect(init.body.get('language')).toBe('fr');
    expect(init.body.get('file').name).toBe('dictee.webm');
    expect(init.body.get('file').type).toBe('audio/webm');
    expect(init.body.getAll('context_bias')).toEqual([]);          // désactivé par défaut
  });

  it('context_bias seulement si AI_CONTEXT_BIAS=true', async () => {
    const f = vi.fn().mockResolvedValue(json({ text: 'x', usage: {} }));
    await makeAiProvider({ ...env, AI_CONTEXT_BIAS: 'true' }, f).transcrire({ audio: new ArrayBuffer(4), mime: 'audio/mp4', vocabulaire: ['faïence', 'crédence'] });
    expect(f.mock.calls[0][1].body.getAll('context_bias')).toEqual(['faïence', 'crédence']);
    expect(f.mock.calls[0][1].body.get('file').name).toBe('dictee.m4a');
  });

  it('structurer : chat completions en json_schema strict, température 0, jetons comptés', async () => {
    const data = { propositions: [], aAjouter: [], compteurs: [], corrections: [] };
    const f = vi.fn().mockResolvedValue(json({ model: 'mistral-small-2603', choices: [{ message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 1200, completion_tokens: 300 } }));
    const input = T.validerEntree(CUISINE_INPUT).input;
    const r = await makeAiProvider(env, f).structurer({ tache: 'edl-piece', messages: T.messages(input), jsonSchema: T.jsonSchema, input });
    expect(r).toEqual({ data, jetonsE: 1200, jetonsS: 300, modele: 'mistral-small-2603' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${MISTRAL_BASE}/v1/chat/completions`);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('mistral-small-latest');
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'edl-piece', schema: T.jsonSchema, strict: true } });
  });

  it('modèles surchargeables par variables d\'environnement', async () => {
    const f = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: '{}' } }] }));
    await makeAiProvider({ ...env, AI_MODEL_STRUCTURE: 'mistral-medium-latest' }, f).structurer({ tache: 'edl-piece', messages: [], jsonSchema: {} });
    expect(JSON.parse(f.mock.calls[0][1].body).model).toBe('mistral-medium-latest');
  });

  it('erreurs : réseau/5xx/429 → unavailable ; 4xx → refused ; JSON illisible → invalid_output', async () => {
    const p = (f) => makeAiProvider(env, f);
    const code = async (pr) => { try { await pr; return 'ok'; } catch (e) { expect(e).toBeInstanceOf(AiError); return e.code; } };
    expect(await code(p(vi.fn().mockRejectedValue(new Error('net'))).transcrire({ audio: new ArrayBuffer(1), mime: 'audio/webm' }))).toBe('unavailable');
    expect(await code(p(vi.fn().mockResolvedValue(json({}, 503))).transcrire({ audio: new ArrayBuffer(1), mime: 'audio/webm' }))).toBe('unavailable');
    expect(await code(p(vi.fn().mockResolvedValue(json({}, 429))).transcrire({ audio: new ArrayBuffer(1), mime: 'audio/webm' }))).toBe('unavailable');
    expect(await code(p(vi.fn().mockResolvedValue(json({}, 422))).transcrire({ audio: new ArrayBuffer(1), mime: 'audio/webm' }))).toBe('refused');
    expect(await code(p(vi.fn().mockResolvedValue(json({ nope: 1 }))).transcrire({ audio: new ArrayBuffer(1), mime: 'audio/webm' }))).toBe('invalid_output');
    expect(await code(p(vi.fn().mockResolvedValue(json({ choices: [{ message: { content: 'pas du json' } }] }))).structurer({ tache: 't', messages: [] }))).toBe('invalid_output');
  });

  it('le message d\'erreur ne contient jamais de contenu', async () => {
    const f = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: 'SECRET-CONTENU' } }] }));
    try { await makeAiProvider(env, f).structurer({ tache: 't', messages: [] }); } catch (e) { expect(String(e.message)).not.toContain('SECRET'); }
  });
});

describe('adaptateur IA — fournisseur simulé', () => {
  it('transcrit (texte fixe) et structure la pièce', async () => {
    const ia = makeAiProvider({ AI_PROVIDER: 'fake' });
    const t = await ia.transcrire({ audio: new ArrayBuffer(8000), mime: 'audio/webm' });
    expect(t.text).toContain('faillance');
    expect(t.audioSec).toBe(2);
    const input = T.validerEntree(CUISINE_INPUT).input;
    const s = await ia.structurer({ tache: 'edl-piece', input });
    expect(T.validerSortie(s.data, input).ok).toBe(true);
    await expect(ia.structurer({ tache: 'autre', input })).rejects.toBeInstanceOf(AiError);
  });
});
