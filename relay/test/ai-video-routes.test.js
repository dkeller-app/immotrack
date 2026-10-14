// État des lieux FILMÉ — interrupteur AI_VIDEO, plafonds, quota d'images, journaux sans contenu.
// Décision Didier (14/10) : bêta sur les offres gratuites ; la vidéo s'ouvre plus tard en posant une
// variable, sans redéploiement. Éteinte, elle ne doit RIEN changer à la dictée.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index.js';
import { appAuth } from './_auth.js';
import { cleJour } from '../src/ai/quota.js';
import { CUISINE_INPUT } from './fixtures/edl-cuisine.js';
import { PHOTOS_INPUT } from './fixtures/edl-photos.js';

const OFF = { ...env, AI_PROVIDER: 'fake', AI_VIDEO: undefined };
const ON = { ...env, AI_PROVIDER: 'fake', AI_VIDEO: 'true' };
const uid = () => crypto.randomUUID();
async function structure(e, payload, sub = uid()) {
  return app.request('/ai/structure', { method: 'POST', headers: { ...(await appAuth({ sub })), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, e);
}
const status = async (e, sub = uid()) => (await app.request('/ai/status', { headers: await appAuth({ sub }) }, e)).json();

afterEach(() => vi.restoreAllMocks());

describe('vidéo — interrupteur', () => {
  it('éteinte par défaut : status video.actif=false, edl-photos → 503 video_disabled, dictée intacte', async () => {
    const s = await status(OFF);
    expect(s.actif).toBe(true);
    expect(s.video).toMatchObject({ actif: false, fichierMaxOctets: 50 * 1024 * 1024, priseMaxSec: 180, imagesParAppel: 8 });
    const r = await structure(OFF, { task: 'edl-photos', input: PHOTOS_INPUT });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'video_disabled' });
    expect((await structure(OFF, { task: 'edl-piece', input: CUISINE_INPUT })).status).toBe(200);
  });
  it('AI_VIDEO="true" sans fournisseur d\'IA : reste éteinte', async () => {
    const s = await status({ ...env, AI_PROVIDER: undefined, MISTRAL_API_KEY: undefined, AI_VIDEO: 'true' });
    expect(s.video.actif).toBe(false);
  });
  it('allumée : status annonce les limites (fichier max surchargeable sans code)', async () => {
    const s = await status({ ...ON, AI_VIDEO_FILE_MAX_BYTES: '209715200', AI_QUOTA_IMAGES: '1500' });
    expect(s.video).toEqual({ actif: true, fichierMaxOctets: 209715200, priseMaxSec: 180, imagesParAppel: 8, imagesJour: 1500 });
  });
  it('allumée : 200, photos proposées pour les éléments cités, jamais d\'état', async () => {
    const r = await structure(ON, { task: 'edl-photos', input: PHOTOS_INPUT });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.data.elements.map((e) => e.elementId).sort()).toEqual(['0', '13']);
    expect(JSON.stringify(j)).not.toMatch(/"etat"/);
  });
});

describe('vidéo — plafonds de corps', () => {
  it('éteinte : un corps de plus de 256 Kio est refusé (413) — comme avant', async () => {
    const lourd = { ...PHOTOS_INPUT, images: PHOTOS_INPUT.images.map((im) => ({ ...im, data: 'data:image/jpeg;base64,' + 'A'.repeat(90 * 1024) })) };
    expect((await structure(OFF, { task: 'edl-photos', input: lourd })).status).toBe(413);
  });
  it('allumée : 8 images de ~100 Ko passent ; edl-piece reste plafonnée à 256 Kio', async () => {
    const huit = Array.from({ length: 8 }, (_, i) => ({ id: 'i' + i, t: i * 3, data: 'data:image/jpeg;base64,' + 'A'.repeat(130 * 1024) }));
    expect((await structure(ON, { task: 'edl-photos', input: { ...PHOTOS_INPUT, images: huit } })).status).toBe(200);
    const texteLong = { ...CUISINE_INPUT, elements: [...CUISINE_INPUT.elements], bourrage: 'x'.repeat(300 * 1024) };
    expect((await structure(ON, { task: 'edl-piece', input: texteLong })).status).toBe(413);
  });
});

describe('vidéo — quota d\'images par compte et par jour', () => {
  it('429 motif images quand l\'appel dépasserait le quota ; compteur images en KV, sans contenu', async () => {
    const e = { ...ON, AI_QUOTA_IMAGES: '6' };
    const sub = uid();
    expect((await structure(e, { task: 'edl-photos', input: PHOTOS_INPUT }, sub)).status).toBe(200);   // 4 images
    const r = await structure(e, { task: 'edl-photos', input: PHOTOS_INPUT }, sub);                      // 4 de plus > 6
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ error: 'quota', motif: 'images' });
    expect((await structure(e, { task: 'edl-piece', input: CUISINE_INPUT }, sub)).status).toBe(200);   // la dictée reste ouverte
    const raw = await env.SESSIONS_KV.get(cleJour(sub, new Date()));
    expect(JSON.parse(raw).images).toBe(4);
    expect(raw).not.toMatch(/base64|Cuisine|Sol/);
    expect((await status(e, sub)).usageJour.images).toBe(4);
  });
});

describe('vidéo — journaux sans contenu', () => {
  it('ni image, ni nom d\'élément, ni nom de pièce dans les journaux', async () => {
    const lignes = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) vi.spyOn(console, m).mockImplementation((...a) => lignes.push(a.map(String).join(' ')));
    await structure(ON, { task: 'edl-photos', input: PHOTOS_INPUT });
    await structure(OFF, { task: 'edl-photos', input: PHOTOS_INPUT });
    await structure(ON, { task: 'edl-photos', input: { ...PHOTOS_INPUT, images: [] } });
    const tout = lignes.join('\n');
    expect(lignes.length).toBeGreaterThan(0);
    for (const interdit of ['base64', 'AAAA', 'Cuisine', 'Plaques', 'Fenêtre', 't0410']) expect(tout).not.toContain(interdit);
  });
});
