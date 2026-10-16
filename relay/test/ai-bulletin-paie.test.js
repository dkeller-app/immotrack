// VERIF-DOCUMENTS lot 3 — tâche « bulletin-paie » : lecture d'UNE page par le modèle d'OCR de Mistral (annotations
// structurées) sur le point d'accès UE, derrière l'interrupteur AI_OCR (éteint par défaut). L'IA recopie ; les règles
// de cohérence sont dans l'app (js/core/regles-bulletin.js). Aucun réseau réel : fetch injecté ou fournisseur simulé.
import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import app from '../src/index.js';
import { appAuth } from './_auth.js';
import { registerAiRoutes } from '../src/ai/routes.js';
import { makeAiProvider, OCR_BASE_UE } from '../src/ai/provider.js';
import { ocrActif } from '../src/ai/ocr.js';
import { lireUsageJour } from '../src/ai/quota.js';
import * as T from '../src/ai/tasks/bulletin-paie.js';

const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(200 * 1024);
const uid = () => crypto.randomUUID();
const FAKE = { ...env, AI_PROVIDER: 'fake' };
const struct = async (e, input, sub = uid()) => app.request('/ai/structure', { method: 'POST', headers: { ...(await appAuth({ sub })), 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'bulletin-paie', input }) }, e);

describe('entrée et sortie de la tâche', () => {
  it('une seule page, image JPEG / PNG / WebP en data URL, type bulletin ou contrat', () => {
    expect(T.validerEntree({ type: 'bulletin', images: [IMG] })).toMatchObject({ ok: true, input: { type: 'bulletin' } });
    expect(T.validerEntree({ type: 'contrat', images: [IMG] }).ok).toBe(true);
    expect(T.validerEntree({ type: 'avis', images: [IMG] })).toMatchObject({ ok: false, raison: 'type' });
    expect(T.validerEntree({ type: 'bulletin', images: [IMG, IMG] })).toMatchObject({ ok: false, raison: 'images' });
    expect(T.validerEntree({ type: 'bulletin', images: ['data:application/pdf;base64,AAAA'] })).toMatchObject({ ok: false, raison: 'image_format' });
    expect(T.validerEntree({ type: 'bulletin', images: ['data:image/jpeg;base64,' + 'A'.repeat(1200 * 1024)] })).toMatchObject({ ok: false, raison: 'image_format' });
    expect(T.validerEntree(null).ok).toBe(false);
  });
  it('sortie bornée : SIRET 14 chiffres, période AAAA-MM, montants finis, taux plausible ; valeurs écartées comptées', () => {
    const s = T.validerSortie({ lisible: true, periode: '2026-13', salarie: 'X'.repeat(500), employeur: 'E', siret: '000 000 001 00016', dateEntree: '2022-02-30x',
      brut: 2950.004, netSocial: 'beaucoup', netAvantImpot: 2291.4, impotBase: 2341.8, impotTaux: 99, impotMontant: 98.36, netAPayer: 2193.04, netImposable: 2341.8, cumulNetImposable: 1e9 }, { type: 'bulletin' });
    expect(s.ok).toBe(true);
    expect(s.data).toMatchObject({ periode: null, siret: '00000000100016', dateEntree: null, brut: 2950, netSocial: null, impotTaux: null, cumulNetImposable: null, netAPayer: 2193.04 });
    expect(s.data.salarie).toBeNull();                 // texte trop long : écarté, jamais tronqué en silence
    expect(s.rejets).toBe(5);
    expect(T.validerSortie({ lisible: false }, { type: 'bulletin' }).data.lisible).toBe(false);
    expect(T.validerSortie([], { type: 'bulletin' }).ok).toBe(false);
    expect(T.validerSortie({ lisible: true, dateDebut: '2022-05-02', siret: 'abc' }, { type: 'contrat' }).data).toMatchObject({ dateDebut: '2022-05-02', siret: null });
  });
  it('consigne : recopier sans calculer, au ton neutre ; schéma strict selon le type', () => {
    const c = T.consigne({ type: 'bulletin' });
    expect(c).toContain('Ne rien calculer');
    expect(c).not.toMatch(/\b(tu|vous|votre|vos)\b/i);
    expect(T.schema({ type: 'contrat' }).required).toContain('dateDebut');
    expect(T.schema({ type: 'bulletin' }).required).toContain('netAPayer');
  });
});

describe('interrupteur AI_OCR (éteint par défaut)', () => {
  it('éteint : 503 ocr_disabled, rien n\'est compté ; /ai/status annonce ocr.actif=false', async () => {
    const sub = uid();
    const r = await struct(FAKE, { type: 'bulletin', images: [IMG] }, sub);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe('ocr_disabled');
    expect((await lireUsageJour(env.SESSIONS_KV, sub)).appels).toBe(0);
    const s = await (await app.request('/ai/status', { headers: await appAuth() }, FAKE)).json();
    expect(s.ocr).toEqual({ actif: false });
    expect(ocrActif({ AI_OCR: 'true' })).toBe(false);   // sans fournisseur : jamais actif
  });
  it('allumé (fournisseur simulé) : lecture rendue, une image comptée au quota', async () => {
    const sub = uid();
    const r = await struct({ ...FAKE, AI_OCR: 'true' }, { type: 'bulletin', images: [IMG] }, sub);
    expect(r.status).toBe(200);
    expect((await r.json()).data).toMatchObject({ periode: '2026-08', netAPayer: 2193.04, lisible: true });
    expect((await lireUsageJour(env.SESSIONS_KV, sub)).images).toBe(1);
  });
});

describe('Mistral OCR (client HTTP injecté) : point d\'accès UE, annotation stricte, aucun texte reconnu renvoyé', () => {
  const monter = (rep, e = {}) => {
    const f = vi.fn().mockImplementation(async () => rep());
    const a = new Hono();
    registerAiRoutes(a, { requireSupabaseUser: async () => ({ userId: uid() }), providerFactory: (x) => makeAiProvider({ ...x, ...e, AI_PROVIDER: 'mistral', MISTRAL_API_KEY: 'cle-test' }, f) });
    return { a, f };
  };
  const ok = () => new Response(JSON.stringify({ model: 'mistral-ocr-2607', pages: [{ index: 0, markdown: 'DUPONT Camille NET A PAYER 2 193,04' }], usage_info: { pages_processed: 1 },
    document_annotation: JSON.stringify({ lisible: true, periode: '2026-08', salarie: 'DUPONT Camille', employeur: 'C', siret: null, dateEntree: null, brut: 2950, netSocial: 2312.6, netAvantImpot: 2291.4, impotBase: null, impotTaux: null, impotMontant: 98.36, netAPayer: 2193.04, netImposable: null, cumulNetImposable: null }) }), { status: 200 });
  const post = (a, input) => a.request('/ai/structure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'bulletin-paie', input }) }, { ...env, AI_OCR: 'true', MISTRAL_API_KEY: 'cle-test' });
  it('appel sur api.eu.mistral.ai/v1/ocr, une page, schéma strict, consigne ; la réponse ne contient que les champs', async () => {
    const { a, f } = monter(ok);
    const r = await post(a, { type: 'bulletin', images: [IMG] });
    expect(r.status).toBe(200);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${OCR_BASE_UE}/v1/ocr`);
    expect(url).toBe('https://api.eu.mistral.ai/v1/ocr');
    const b = JSON.parse(init.body);
    expect(b).toMatchObject({ model: 'mistral-ocr-latest', document: { type: 'image_url', image_url: IMG }, include_image_base64: false });
    expect(b.document_annotation_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'bulletin-paie', strict: true } });
    expect(b.document_annotation_prompt).toContain('bulletin de salaire');
    const t = await r.text();
    expect(t).not.toContain('NET A PAYER');     // le texte reconnu (markdown) ne ressort jamais
    expect(t).not.toContain('cle-test');
    expect(JSON.parse(t).data.netAPayer).toBe(2193.04);
  });
  it('point d\'accès imposé par MISTRAL_OCR_BASE_URL seulement ; jamais le point d\'accès mondial par défaut', async () => {
    const { a, f } = monter(ok, { MISTRAL_BASE_URL: 'https://api.mistral.ai' });
    await post(a, { type: 'contrat', images: [IMG] });
    expect(f.mock.calls[0][0]).toBe('https://api.eu.mistral.ai/v1/ocr');
  });
  it('annotation illisible → 502 ai_invalid_output ; fournisseur indisponible → 502 ; refus → 422', async () => {
    expect((await post(monter(() => new Response(JSON.stringify({ document_annotation: '{pas du json' }), { status: 200 })).a, { type: 'bulletin', images: [IMG] })).status).toBe(502);
    expect((await post(monter(() => new Response('x', { status: 503 })).a, { type: 'bulletin', images: [IMG] })).status).toBe(502);
    expect((await post(monter(() => new Response('{}', { status: 400 })).a, { type: 'bulletin', images: [IMG] })).status).toBe(422);
  });
  it('journaux : aucun contenu (ni montant, ni nom, ni image)', async () => {
    const lignes = []; const spy = vi.spyOn(console, 'log').mockImplementation((...x) => lignes.push(x.join(' ')));
    try { await post(monter(ok).a, { type: 'bulletin', images: [IMG] }); } finally { spy.mockRestore(); }
    const tout = lignes.join('\n');
    expect(tout).toContain('[ai] structure 200');
    expect(tout).not.toMatch(/DUPONT|2193|data:image|AAAA/);
  });
});

describe('relecture du 14/10 (Fable) : point d\'accès hors UE refusé', () => {
  it('MISTRAL_OCR_BASE_URL hors UE (ou en http) : rien n\'est envoyé, 502', async () => {
    for (const base of ['https://api.mistral.ai', 'http://api.eu.mistral.ai', 'https://eu.mistral.ai.example.com']) {
      const f = vi.fn();
      const a = new Hono();
      registerAiRoutes(a, { requireSupabaseUser: async () => ({ userId: uid() }), providerFactory: (x) => makeAiProvider({ ...x, AI_PROVIDER: 'mistral', MISTRAL_API_KEY: 'cle-test', MISTRAL_OCR_BASE_URL: base }, f) });
      const r = await a.request('/ai/structure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'bulletin-paie', input: { type: 'bulletin', images: [IMG] } }) }, { ...env, AI_OCR: 'true', MISTRAL_API_KEY: 'cle-test' });
      expect(r.status, base).toBe(502);
      expect(f).not.toHaveBeenCalled();
    }
  });
  it('contrat : valeurs écartées comptées', () => {
    expect(T.validerSortie({ lisible: true, siret: '12', dateDebut: 'hier' }, { type: 'contrat' }).rejets).toBe(2);
  });
});

describe('REGLES-PAIE (16/10/2026) : schéma étendu, contrôles de sortie, texte reconnu jamais renvoyé', () => {
  const BASE = { lisible: true, periode: '2026-08', salarie: 'S', employeur: 'E', siret: null, dateEntree: null, heures: 151.67, tauxHoraire: 19.4501, salaireBase: 2950, brut: 2950, totalCotisations: 658.6,
    lignes: [{ libelle: 'Sécurité sociale plafonnée', base: 2950, taux: 6.9, montant: 203.55 }], autresLignes: [{ libelle: 'Titres-restaurant', montant: -94.5 }],
    netSocial: 2312.6, netAvantImpot: 2291.4, impotBase: 2341.8, impotTaux: 4.2, impotMontant: 98.36, netAPayer: 2193.04, netImposable: 2341.8, cumulBrut: 23600, cumulNetImposable: 18734.4 };
  it('schéma strict : lignes de cotisations et lignes entre le total et le net, objets fermés ; consigne « recopier » au ton neutre', () => {
    const sc = T.schema({ type: 'bulletin' });
    for (const k of ['heures', 'tauxHoraire', 'salaireBase', 'totalCotisations', 'lignes', 'autresLignes', 'cumulBrut']) expect(sc.required).toContain(k);
    expect(sc.properties.lignes.items).toMatchObject({ type: 'object', additionalProperties: false, required: ['libelle', 'base', 'taux', 'montant'] });
    expect(sc.properties.autresLignes.items.required).toEqual(['libelle', 'montant']);
    const c = T.consigne({ type: 'bulletin' });
    expect(c).toContain('Ne rien calculer'); expect(c).toContain('40 lignes au plus');
    expect(c).not.toMatch(/\b(tu|vous|votre|vos)\b/i);
  });
  it('sortie : lignes bornées à 40 (au-delà : lignesTronquees), libellés bornés, valeurs hors bornes écartées', () => {
    const s = T.validerSortie({ ...BASE, lignes: Array.from({ length: 45 }, () => ({ libelle: 'L', base: 1, taux: 2, montant: 0.02 })), autresLignes: Array.from({ length: 9 }, () => ({ libelle: 'A', montant: 1 })), heures: 9999 }, { type: 'bulletin' });
    expect(s.data.lignes.length).toBe(40); expect(s.data.lignesTronquees).toBe(true);
    expect(s.data.autresLignes.length).toBe(8); expect(s.data.autresTronquees).toBe(true);
    expect(s.data.heures).toBeNull(); expect(s.rejets).toBe(1);
    const t = T.validerSortie({ ...BASE, lignes: [{ libelle: 'X'.repeat(200), base: 'a', taux: 500, montant: 1 }, 'pas un objet'] }, { type: 'bulletin' });
    expect(t.data.lignes).toEqual([{ libelle: null, base: null, taux: null, montant: 1 }]);
  });
  it('SIRET : clé de contrôle (Luhn ; La Poste) ; un chiffre lu de travers est écarté', () => {
    expect(T.siretValide('00000000100016')).toBe(true);
    expect(T.siretValide('00000000100017')).toBe(false);
    expect(T.siretValide('00000000100061')).toBe(false);   // deux chiffres voisins inversés
    expect(T.siretValide('35600000000047')).toBe(true);   // La Poste : somme des chiffres multiple de 5
    expect(T.validerSortie({ ...BASE, siret: '000 000 001 00017' }, { type: 'bulletin' }).data.siret).toBeNull();
  });
  it('texte reconnu : un nombre absent du texte de la page est écarté (compté) ; sans texte, aucun contrôle', () => {
    const texte = 'Période du 01/08/2026 | Salaire de base 151,67 19,4501 2 950,00 | Sécurité sociale plafonnée 2.950,00 6,90 203,55 | Titres-restaurant -94,50 | Total 658,60 | NET 2 193,04 | 2291.40 | 98,36 | 2341,80 | 4,20 % | 2312,60 | 23 600,00';
    const s = T.validerSortie(BASE, { type: 'bulletin' }, { texte });
    expect(s.data).toMatchObject({ brut: 2950, netAPayer: 2193.04, netAvantImpot: 2291.4, impotTaux: 4.2, cumulBrut: 23600, cumulNetImposable: null });
    expect(s.data.lignes[0]).toMatchObject({ base: 2950, taux: 6.9, montant: 203.55 });
    expect(s.data.autresLignes[0].montant).toBe(-94.5);
    expect(s.rejets).toBe(1);
    expect(T.validerSortie(BASE, { type: 'bulletin' }).data.cumulNetImposable).toBe(18734.4);
    expect(T.nombresDuTexte('1.234,56 et 1 234,56 et 1234.56 et 6,9000').has(1234.56)).toBe(true);
  });
  it('bout en bout (Mistral simulé) : le texte reconnu sert au contrôle, n\'est ni renvoyé ni journalisé', async () => {
    const md = 'MARKDOWN-SECRET Salaire de base 2 950,00 NET A PAYER 2 193,04';
    const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ model: 'mistral-ocr-2607', pages: [{ index: 0, markdown: md }], usage_info: { pages_processed: 1 },
      document_annotation: JSON.stringify({ ...BASE, brut: 2950, netAPayer: 2193.04 }) }), { status: 200 }));
    const a = new Hono();
    registerAiRoutes(a, { requireSupabaseUser: async () => ({ userId: uid() }), providerFactory: (x) => makeAiProvider({ ...x, AI_PROVIDER: 'mistral', MISTRAL_API_KEY: 'cle-test' }, f) });
    const lignes = []; const spy = vi.spyOn(console, 'log').mockImplementation((...x) => lignes.push(x.join(' ')));
    let r; try { r = await a.request('/ai/structure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: 'bulletin-paie', input: { type: 'bulletin', images: [IMG] } }) }, { ...env, AI_OCR: 'true', MISTRAL_API_KEY: 'cle-test' }); } finally { spy.mockRestore(); }
    expect(r.status).toBe(200);
    const t = await r.text();
    expect(t).not.toContain('MARKDOWN-SECRET'); expect(lignes.join(' ')).not.toContain('MARKDOWN-SECRET');
    const d = JSON.parse(t).data;
    expect(d).toMatchObject({ brut: 2950, netAPayer: 2193.04, netAvantImpot: null, totalCotisations: null });   // absents du texte : écartés
    expect(JSON.parse(t).rejets).toBeGreaterThan(5);
  });
  it('fournisseur simulé : lecture complète cohérente (ancres tenues) ; taille de la réponse bornée', async () => {
    const r = await struct({ ...FAKE, AI_OCR: 'true' }, { type: 'bulletin', images: [IMG] });
    const j = await r.json();
    expect(j.data.lignes.length).toBe(7);
    expect(Math.round(j.data.lignes.reduce((s, l) => s + l.montant, 0) * 100) / 100).toBe(j.data.totalCotisations);
    expect(JSON.stringify(j).length).toBeLessThan(4000);
    const max = T.validerSortie({ ...BASE, lignes: Array.from({ length: 60 }, () => ({ libelle: 'L'.repeat(80), base: 999999.99, taux: 99.9999, montant: 999999.99 })) }, { type: 'bulletin' });
    expect(JSON.stringify(max.data).length).toBeLessThan(8000);
  });
});
