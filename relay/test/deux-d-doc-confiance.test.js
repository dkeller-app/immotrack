// VERIF-DOCUMENTS lot 1 — liste de confiance 2D-Doc transportée par le relais (cache KV 24 h, aucune vérification
// côté relais : l'app vérifie tout contre ses ancres). Aucun appel réseau réel : fetch simulé.
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import app from '../src/index.js';
import { obtenirConfiance, collecter, registerDeuxDDocRoutes, CLE_KV, FRAICHEUR_MS } from '../src/deux-d-doc-confiance.js';
import { ANCRES_2DDOC } from '../../js/core/deux-d-doc-ancres.js';

const DER = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05]);           // « certificat » minimal (le relais ne l'interprète pas)
const enc = new TextEncoder();
function multipart(...ders) {
  const parts = []; for (const d of ders) { parts.push(enc.encode('\r\n--End\r\nContent-type: application/pkix-cert\r\n\r\n'), d); }
  parts.push(enc.encode('\r\n--End--\r\n'));
  const t = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { t.set(p, o); o += p.length; } return t;
}
function faux(reponses) {
  const appels = [];
  const f = async (url) => { appels.push(url); const r = reponses(url); if (r instanceof Error) throw r; return r ? new Response(r, { status: 200 }) : new Response('non', { status: 404 }); };
  f.appels = appels; return f;
}
const toutRepond = faux((u) => (u.endsWith('.crl') ? new Uint8Array([0x30, 0x00]) : multipart(DER, DER)));

beforeEach(async () => { await env.SESSIONS_KV.delete(CLE_KV); });

describe('collecte des annuaires et des listes de révocation', () => {
  it('interroge les 7 autorités ancrées (annuaire + CRL) et renvoie du base64 brut', async () => {
    const f = faux((u) => (u.endsWith('.crl') ? new Uint8Array([0x30, 0x00]) : multipart(DER, DER)));
    const d = await collecter(f, Date.UTC(2026, 9, 14));
    expect(f.appels.length).toBe(14);
    expect(Object.keys(d.autorites).sort()).toEqual(Object.keys(ANCRES_2DDOC).sort());
    expect(d.autorites.FR06.certificats).toEqual(['MAMCAQU=', 'MAMCAQU=']);
    expect(d.autorites.FR06.crl).toBe('MAA=');
    expect(d).toMatchObject({ source: 'relais', genereLe: '2026-10-14T00:00:00.000Z' });
  });
  it('une autorité injoignable ou en erreur n\'empêche pas les autres', async () => {
    const f = faux((u) => (u.includes('certigna') ? new Error('réseau') : u.includes('sunnystamp') ? null : u.endsWith('.crl') ? new Uint8Array([0x30, 0x00]) : multipart(DER)));
    const d = await collecter(f);
    expect(d.autorites.FR03).toEqual({ certificats: [], crl: null });
    expect(d.autorites.FR07).toEqual({ certificats: [], crl: null });
    expect(d.autorites.FR06.certificats.length).toBe(1);
  });
});

describe('cache KV 24 h et copie de secours', () => {
  it('met en cache, sert le cache frais sans réseau, rafraîchit après 24 h', async () => {
    const t0 = Date.UTC(2026, 9, 14, 8);
    const d1 = await obtenirConfiance(env, toutRepond, t0);
    expect(d1.autorites.FR06.certificats.length).toBe(2);
    const muet = faux(() => { throw new Error('ne doit pas être appelé'); });
    const d2 = await obtenirConfiance(env, muet, t0 + FRAICHEUR_MS - 1000);
    expect(d2.genereLe).toBe(d1.genereLe);
    expect(muet.appels.length).toBe(0);
    const d3 = await obtenirConfiance(env, toutRepond, t0 + FRAICHEUR_MS + 1000);
    expect(d3.genereLe).not.toBe(d1.genereLe);
  });
  it('autorités toutes injoignables : la dernière copie est rendue ; sans copie, rien d\'inventé', async () => {
    const t0 = Date.UTC(2026, 9, 14, 8);
    const panne = faux(() => new Error('panne'));
    const vide = await obtenirConfiance(env, panne, t0);
    expect(Object.values(vide.autorites).every((a) => a.certificats.length === 0 && a.crl === null)).toBe(true);
    await obtenirConfiance(env, toutRepond, t0);
    const secours = await obtenirConfiance(env, panne, t0 + 3 * FRAICHEUR_MS);
    expect(secours.genereLe).toBe(new Date(t0).toISOString());
  });
});

describe('route GET /api/2ddoc/confiance', () => {
  it('publique, sans authentification ; 503 si rien n\'a pu être obtenu', async () => {
    const a = new Hono(); registerDeuxDDocRoutes(a, { fetchImpl: toutRepond });
    const r = await a.request('/api/2ddoc/confiance', {}, env);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect((await r.json()).autorites.FR09.certificats.length).toBe(2);
    await env.SESSIONS_KV.delete(CLE_KV);
    const b = new Hono(); registerDeuxDDocRoutes(b, { fetchImpl: faux(() => null) });
    expect((await b.request('/api/2ddoc/confiance', {}, env)).status).toBe(503);
  });
  it('branchée sur le relais : sert le cache, avec CORS pour l\'app', async () => {
    await env.SESSIONS_KV.put(CLE_KV, JSON.stringify({ source: 'relais', genereLe: new Date().toISOString(), autorites: { FR06: { certificats: ['MAMCAQU='], crl: null } } }));
    const r = await app.request('/api/2ddoc/confiance', { headers: { Origin: 'https://app.propryo.fr' } }, env);
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://app.propryo.fr');
    expect((await r.json()).autorites.FR06.certificats).toEqual(['MAMCAQU=']);
  });
});
