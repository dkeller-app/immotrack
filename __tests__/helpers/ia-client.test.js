/**
 * __tests__/helpers/ia-client.test.js — chantier EDL-VOIX-IA, lot B1 : client du socle IA.
 * Le client ne lève jamais et ne porte jamais la clé du fournisseur (le relais la détient).
 */
import { describe, it, expect, vi } from 'vitest';
import { creerClientIA, codeDepuisReponse, messageErreur, CODES_REESSAYABLES } from '../../js/core/ia-client.js';

const rep = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const client = (fetchImpl, o = {}) => creerClientIA({ base: 'https://relais.test/', getToken: async () => 'jeton', fetchImpl, enLigne: () => true, ...o });

describe('client IA — appels', () => {
  it('transcrire : audio brut, type sans paramètre ajouté, jeton de session en Bearer', async () => {
    const f = vi.fn(() => rep(200, { text: 'sol carrelage', segments: [{ start: 0, end: 1, text: 'sol' }], audioSec: 3, modele: 'm' }));
    const audio = new Blob([new Uint8Array(10)], { type: 'audio/webm' });
    const r = await client(f).transcrire(audio, { mime: 'audio/mp4' });
    expect(r).toEqual({ ok: true, text: 'sol carrelage', segments: [{ start: 0, end: 1, text: 'sol' }], audioSec: 3, modele: 'm' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://relais.test/ai/transcribe?lang=fr&task=edl-piece');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('audio/mp4');
    expect(init.headers.Authorization).toBe('Bearer jeton');
    expect(init.body).toBe(audio);
  });
  it('structurer : JSON { task, input }', async () => {
    const f = vi.fn(() => rep(200, { data: { propositions: [] }, rejets: 2, modele: 'x' }));
    const r = await client(f).structurer('edl-piece', { piece: 'Cuisine' });
    expect(r).toEqual({ ok: true, data: { propositions: [] }, rejets: 2, modele: 'x' });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ task: 'edl-piece', input: { piece: 'Cuisine' } });
  });
  it('statut', async () => {
    const r = await client(() => rep(200, { actif: true, limites: { audioSecJour: 3600 }, usageJour: { appels: 1 } })).statut();
    expect(r).toEqual({ ok: true, actif: true, limites: { audioSecJour: 3600 }, usageJour: { appels: 1 } });
  });
});

describe('client IA — erreurs, jamais d’exception', () => {
  it('hors ligne : aucun appel, code offline', async () => {
    const f = vi.fn();
    expect(await client(f, { enLigne: () => false }).transcrire(new Blob([]))).toEqual({ ok: false, code: 'offline' });
    expect(f).not.toHaveBeenCalled();
  });
  it('pas de session : code auth, aucun appel', async () => {
    const f = vi.fn();
    expect((await client(f, { getToken: async () => '' }).statut()).code).toBe('auth');
    expect(f).not.toHaveBeenCalled();
  });
  it('réseau coupé pendant l’appel → unavailable (ou offline si la connexion est tombée)', async () => {
    expect((await client(() => Promise.reject(new TypeError('x'))).statut()).code).toBe('unavailable');
    let enLigne = true;
    const r = await client(() => { enLigne = false; return Promise.reject(new TypeError('x')); }, { enLigne: () => enLigne }).statut();
    expect(r.code).toBe('offline');
  });
  it('codes HTTP → codes métier', () => {
    expect(codeDepuisReponse(401, {})).toBe('auth');
    expect(codeDepuisReponse(429, { error: 'quota' })).toBe('quota');
    expect(codeDepuisReponse(503, { error: 'ai_disabled' })).toBe('disabled');
    expect(codeDepuisReponse(404, null)).toBe('disabled');          // relais pas encore déployé
    expect(codeDepuisReponse(413, {})).toBe('too_large');
    expect(codeDepuisReponse(415, {})).toBe('format');
    expect(codeDepuisReponse(422, {})).toBe('refused');
    expect(codeDepuisReponse(400, { error: 'audio_empty' })).toBe('vide');
    expect(codeDepuisReponse(400, { error: 'bad_input' })).toBe('invalid');
    expect(codeDepuisReponse(502, {})).toBe('unavailable');
  });
  it('quota : motif et limites remontés', async () => {
    const r = await client(() => rep(429, { error: 'quota', motif: 'audio', limites: { audioSecJour: 3600 } })).transcrire(new Blob([]));
    expect(r).toEqual({ ok: false, code: 'quota', motif: 'audio', limites: { audioSecJour: 3600 } });
  });
  it('sans adresse de relais : désactivé', async () => {
    expect((await creerClientIA({ base: '', getToken: async () => 'j' }).statut()).code).toBe('disabled');
  });
});

describe('messages d’erreur', () => {
  it('ton neutre, et seuls réseau / service / session sont réessayés automatiquement', () => {
    for (const c of ['offline', 'auth', 'quota', 'disabled', 'too_large', 'format', 'refused', 'vide', 'invalid', 'unavailable']) {
      const m = messageErreur(c, { motif: 'audio', limites: { audioSecJour: 3600 } });
      expect(m.titre).toBeTruthy();
      expect(`${m.titre} ${m.texte}`).not.toMatch(/(?<!\p{L})(tu|te|toi|ton|ta|tes|vous|votre|vos)(?!\p{L})/iu);
      expect(m.reessayable).toBe(CODES_REESSAYABLES.has(c) || c === 'unavailable');
    }
    expect(messageErreur('quota', { motif: 'audio', limites: { audioSecJour: 3600 } }).texte).toContain('60 minutes');
  });
});
