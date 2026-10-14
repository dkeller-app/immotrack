// VERIF-DOCUMENTS lot 1 — liste de confiance 2D-Doc transportée par le relais.
// Les autorités 2D-Doc publient leurs annuaires de certificats et leurs listes de révocation SANS en-tête CORS (et
// parfois en http) : le navigateur ne peut pas les lire. Le relais les récupère, les met en cache 24 h dans KV et les
// renvoie tels quels (base64). Il ne vérifie RIEN et n'est jamais cru : l'app vérifie chaque certificat et chaque
// liste de révocation contre les autorités ANCRÉES dans son code (js/core/deux-d-doc-ancres.js).
// Données publiques uniquement, aucune donnée personnelle, aucune authentification nécessaire.
// Route : GET /api/2ddoc/confiance → { source:'relais', genereLe, autorites: { FR06: { certificats:[b64], crl:b64|null } } }
import { ANCRES_2DDOC } from '../../js/core/deux-d-doc-ancres.js';
import { extraireCertificatsAnnuaire, octetsVersB64 } from '../../js/core/deux-d-doc.js';

export const CLE_KV = 'tddoc:confiance:v1';
export const CLE_ESSAI = 'tddoc:confiance:essai';   // marqueur « rafraîchissement en cours ou échoué récemment » (5 min)
export const FRAICHEUR_MS = 24 * 3600 * 1000;
const TTL_KV_S = 8 * 24 * 3600;      // copie de secours gardée 8 jours si les autorités ne répondent plus
const DELAI_MS = 8000;
const MAX_ANNUAIRE = 1024 * 1024, MAX_CRL = 512 * 1024;

async function lire(fetchImpl, url, max) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), DELAI_MS);
  try {
    const r = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: '*/*' } });
    if (!r.ok) return null;
    const annonce = Number(r.headers && r.headers.get && r.headers.get('Content-Length'));
    if (Number.isFinite(annonce) && annonce > max) return null;            // taille annoncée trop grande : pas lu
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf.length && buf.length <= max ? buf : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Récupère annuaires et CRL des 7 autorités en parallèle. Une autorité injoignable n'empêche pas les autres. */
export async function collecter(fetchImpl, maintenant = Date.now()) {
  const autorites = {};
  await Promise.all(Object.entries(ANCRES_2DDOC).map(async ([id, a]) => {
    const [annuaire, crl] = await Promise.all([lire(fetchImpl, a.annuaire, MAX_ANNUAIRE), lire(fetchImpl, a.crl, MAX_CRL)]);
    const certificats = annuaire ? extraireCertificatsAnnuaire(annuaire).map(octetsVersB64) : [];
    autorites[id] = { certificats, crl: crl ? octetsVersB64(crl) : null };
  }));
  return { source: 'relais', genereLe: new Date(maintenant).toISOString(), autorites };
}
const utile = (d) => d && d.autorites && Object.values(d.autorites).some((a) => a.certificats && a.certificats.length);
/** Fusion PAR AUTORITÉ : une autorité qui n'a pas répondu garde ses certificats et sa liste de révocation précédents. */
export function fusionner(frais, ancien) {
  if (!ancien || !ancien.autorites) return frais;
  const autorites = {};
  for (const id of new Set([...Object.keys(frais.autorites || {}), ...Object.keys(ancien.autorites)])) {
    const f = (frais.autorites || {})[id] || { certificats: [], crl: null }, a = ancien.autorites[id] || { certificats: [], crl: null };
    autorites[id] = { certificats: f.certificats && f.certificats.length ? f.certificats : (a.certificats || []), crl: f.crl || a.crl || null };
  }
  return Object.assign({}, frais, { autorites });
}

/** Cache 24 h, rafraîchi par autorité ; au plus un rafraîchissement toutes les 5 min si les autorités ne répondent pas. */
export async function obtenirConfiance(env, fetchImpl = fetch, maintenant = Date.now()) {
  const kv = env && env.SESSIONS_KV;
  let cache = null;
  try { cache = kv ? await kv.get(CLE_KV, 'json') : null; } catch { cache = null; }
  if (cache && utile(cache) && maintenant - Date.parse(cache.genereLe) < FRAICHEUR_MS) return cache;
  let essai = null;
  try { essai = kv ? await kv.get(CLE_ESSAI) : null; } catch { essai = null; }
  if (essai && cache && utile(cache)) return cache;                     // tentative récente : on sert la copie
  try { if (kv) await kv.put(CLE_ESSAI, '1', { expirationTtl: 300 }); } catch { /* marqueur facultatif */ }
  const recu = await collecter(fetchImpl, maintenant);
  if (!utile(recu)) return cache && utile(cache) ? cache : recu;      // rien obtenu : la copie (≤ 8 jours) ou rien
  const frais = fusionner(recu, cache);
  try { if (kv) { await kv.put(CLE_KV, JSON.stringify(frais), { expirationTtl: TTL_KV_S }); await kv.delete(CLE_ESSAI); } } catch { /* cache facultatif */ }
  return frais;
}

export function registerDeuxDDocRoutes(app, { fetchImpl } = {}) {
  app.get('/api/2ddoc/confiance', async (c) => {
    const d = await obtenirConfiance(c.env, fetchImpl || ((u, o) => fetch(u, o)));
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json(d, utile(d) ? 200 : 503);
  });
}
