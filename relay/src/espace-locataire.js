// relay/src/espace-locataire.js — ESPACE LOCATAIRE (accès par lien, sans mot de passe) : page publique + API.
// CDC : mockups/ESPACE-LOCATAIRE/CDC-ESPACE-LOCATAIRE.md (D1 → D14, GO Didier 14/10/2026). Migration : 0059.
//
// Le locataire ouvre /l#<jeton>. Le jeton vit dans le FRAGMENT : il n'atteint jamais le serveur dans l'URL (ni les
// journaux, ni le Referer) ; la page le lit et l'envoie dans l'en-tête X-El-Jeton de chaque appel /api/el/*.
// Le relais calcule SHA-256(jeton) et appelle les fonctions el_* (identité technique, el-supabase.js) : la règle
// « qui voit quoi » vit en SQL. Ici : en-têtes de sécurité, limite de débit, contrôle des fichiers déposés
// (octets magiques, taille), e-mails (mode dev tant que le domaine n'est pas actif).
import {
  JETON_RE, empreinteJeton, PIECES, PROBLEMES, URGENCES, ART21, ART23_JUSTIFICATIFS, ACCORD_VERSION, libelleAccord,
  erreurSignalement, erreurMessage, typeReel, MIME_DE, DEPOT_MAX_OCTETS, modeleEmail, TYPES_EMAIL,
} from '../../js/core/espace-locataire.js';
import { URGENCES as CONSIGNES_URGENCE, CONSIGNE_DANGER } from '../../js/core/qui-paie.js';
import { elConfigure, rpc, lireObjet, deposerObjet, contactProprietaire, ElErreur } from './el-supabase.js';
import { sha256hex } from './crypto-utils.js';
import { generateCode, hashCode, verifyCode, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from './otp.js';
import { makeSender } from './email-sender.js';

export const EL_ASSET_VERSION = '1';

// En-têtes de TOUTE réponse de l'espace locataire (page et API) — exigence pilotage : CSP, Referrer-Policy, no-store.
export const EL_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; "
  + "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
const ENTETES = {
  'Content-Security-Policy': EL_CSP, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()', 'Cross-Origin-Opener-Policy': 'same-origin',
};
export function entetesEspace(headers) { for (const [k, v] of Object.entries(ENTETES)) headers.set(k, v); }
function entetes(c) { for (const [k, v] of Object.entries(ENTETES)) c.header(k, v); }

export function renderEspacePage() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Espace locataire</title>
<link rel="stylesheet" href="/el.css?v=${EL_ASSET_VERSION}">
</head>
<body>
<div id="app" class="el-root" aria-live="polite"><p class="el-boot">Chargement…</p></div>
<noscript><p class="el-boot">L'espace locataire a besoin de JavaScript.</p></noscript>
<script type="module" src="/el.js?v=${EL_ASSET_VERSION}"></script>
</body>
</html>`;
}

// Référentiel envoyé à la page (une seule source : les modules purs de l'app).
export const REFERENTIEL = Object.freeze({
  pieces: PIECES, problemes: PROBLEMES, urgences: URGENCES, art21: ART21, art23: ART23_JUSTIFICATIFS,
  accordVersion: ACCORD_VERSION,
  consignes: Object.fromEntries(CONSIGNES_URGENCE.map((u) => [u.k, u.consignes])), danger: CONSIGNE_DANGER,
});

// Condensat d'IP salé du jour : sert à la limite des jetons invalides (en base) sans jamais conserver l'IP.
async function ipHash(c) {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'local';
  const jour = new Date().toISOString().slice(0, 10);
  const h = await sha256hex(new TextEncoder().encode(`${ip}|${jour}|${c.env.SIGNING_SECRET}`));
  return h.slice(0, 32);
}

// Limite de débit du relais (binding Workers « ratelimit » EL_RATE si présent) : par IP, toutes routes /api/el.
async function limiteDebit(c, cle) {
  const rl = c.env && c.env.EL_RATE;
  if (!rl || typeof rl.limit !== 'function') return true;
  try { const { success } = await rl.limit({ key: cle }); return success !== false; } catch { return true; }
}

const jsonErreur = (c, statut, code) => c.json({ erreur: code }, statut);
const inactif = (c) => c.json({ actif: false }, 410);

// Contexte commun d'un appel locataire : configuration, débit, jeton → empreinte, condensat d'IP.
async function ctx(c) {
  if (!elConfigure(c.env) || !c.env.SIGNING_SECRET) return { reponse: jsonErreur(c, 503, 'el_inactif') };
  const ip = await ipHash(c);
  if (!(await limiteDebit(c, 'el:' + ip))) return { reponse: jsonErreur(c, 429, 'limite') };
  const jeton = c.req.header('X-El-Jeton') || '';
  const h = JETON_RE.test(jeton) ? await empreinteJeton(jeton) : null;
  return { h, ip };
}
async function appel(c, fn, args) {
  try { return { ok: true, v: await rpc(c.env, fn, args) }; } catch (e) {
    if (e instanceof ElErreur) return { ok: false, reponse: jsonErreur(c, e.statut, e.code) };
    return { ok: false, reponse: jsonErreur(c, 502, 'el_base') };
  }
}
async function lireJson(c, max = 64 * 1024) {
  const len = Number(c.req.header('Content-Length') || 0);
  if (len > max) return null;
  try { const t = await c.req.text(); if (t.length > max) return null; return JSON.parse(t || '{}'); } catch { return null; }
}
const nomSur = (s) => String(s || '').replace(/[\u0000-\u001f"\\/<>:|?*]/g, '_').slice(0, 120) || 'document';

// ── OTP de l'accord (D10) : actif seulement si EL_CODE_ACCORD="true" ET EMAIL_MODE="resend" ──
const codeAccordRequis = (env) => env.EL_CODE_ACCORD === 'true' && env.EMAIL_MODE === 'resend';
const masque = (m) => { const [u, d] = String(m).split('@'); return (u ? u[0] : '') + '•••@' + (d ? d[0] + '•••' + d.slice(d.lastIndexOf('.')) : ''); };

export function registerEspaceLocataireRoutes(app, { sender = null } = {}) {
  app.use('/l', async (c, next) => { await next(); entetes(c); });
  app.use('/api/el/*', async (c, next) => { await next(); entetes(c); });
  app.use('/el/*', async (c, next) => { await next(); entetes(c); });

  app.get('/l', (c) => c.html(renderEspacePage()));

  app.post('/api/el/ouvrir', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const r = await appel(c, 'el_ouvrir', { p_jeton_sha256: x.h, p_ip_hash: x.ip }); if (!r.ok) return r.reponse;
    if (!r.v || r.v.actif !== true) return inactif(c);
    return c.json({ ...r.v, referentiel: REFERENTIEL, libelleAccord: libelleAccord(r.v.locataire), codeAccord: codeAccordRequis(c.env) });
  });

  for (const [route, fn] of [['documents', 'el_documents'], ['signalements', 'el_signalements'], ['messages', 'el_messages']]) {
    app.post('/api/el/' + route, async (c) => {
      const x = await ctx(c); if (x.reponse) return x.reponse;
      const r = await appel(c, fn, { p_jeton_sha256: x.h, p_ip_hash: x.ip }); if (!r.ok) return r.reponse;
      if (r.v == null) return inactif(c);
      return c.json({ liste: r.v });
    });
  }

  // Ouvrir / télécharger un fichier : la base autorise CE chemin pour 60 s, le relais le relit et le renvoie.
  app.post('/api/el/fichier', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const b = await lireJson(c, 2048);
    if (!b || !['document', 'message', 'signalement'].includes(b.source) || !/^[0-9a-f-]{36}$/.test(String(b.id || ''))) return jsonErreur(c, 400, 'invalide');
    const index = Number.isInteger(b.index) && b.index >= 0 && b.index < 10 ? b.index : null;
    const r = await appel(c, 'el_fichier', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_source: b.source, p_id: b.id, p_index: index });
    if (!r.ok) return r.reponse;
    if (!r.v) return inactif(c);
    if (r.v.absent || !r.v.path) return jsonErreur(c, 404, 'introuvable');
    let obj;
    try { obj = await lireObjet(c.env, r.v.path); } catch (e) { return jsonErreur(c, e.statut || 502, e.code || 'stockage'); }
    const mime = ['application/pdf', 'image/jpeg', 'image/png'].includes(r.v.mime) ? r.v.mime : 'application/octet-stream';
    const ext = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg';
    const nom = nomSur(r.v.nom).replace(/\.(pdf|png|jpe?g)$/i, '') + ext;
    const headers = new Headers({
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${nom.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
    });
    return new Response(obj.body, { status: 200, headers });
  });

  // Déposer une photo ou une pièce (corps binaire). Type RÉEL vérifié par octets magiques, 10 Mo au plus.
  app.post('/api/el/depot', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    if (!x.h) return inactif(c);                                     // jeton mal formé : rien n'est lu
    const len = Number(c.req.header('Content-Length') || 0);
    if (len > DEPOT_MAX_OCTETS) return jsonErreur(c, 413, 'trop_gros');
    const body = c.req.raw.body;
    if (!body) return jsonErreur(c, 400, 'vide');
    // Lecture en flux, bornée : les premiers octets donnent le type réel ; le ticket (qui vérifie le jeton) est pris
    // AVANT de lire la suite ; au-delà de 10 Mo, arrêt immédiat.
    const lecteur = body.getReader();
    const morceaux = []; let total = 0;
    const lire = async (jusqua) => {
      while (total < jusqua) {
        const { done, value } = await lecteur.read();
        if (done) return true;
        morceaux.push(value); total += value.length;
        if (total > DEPOT_MAX_OCTETS) { try { await lecteur.cancel(); } catch { /* ignoré */ } return false; }
      }
      return true;
    };
    if (!(await lire(16))) return jsonErreur(c, 413, 'trop_gros');
    if (!total) return jsonErreur(c, 400, 'vide');
    const tete = new Uint8Array(Math.min(total, 16)); { let o = 0; for (const m of morceaux) { const n = Math.min(m.length, 16 - o); tete.set(m.subarray(0, n), o); o += n; if (o >= 16) break; } }
    const ext = typeReel(tete);
    if (!ext) { try { await lecteur.cancel(); } catch { /* ignoré */ } return jsonErreur(c, 415, 'type'); }
    const r = await appel(c, 'el_depot', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_ext: ext });
    if (!r.ok) { try { await lecteur.cancel(); } catch { /* ignoré */ } return r.reponse; }
    if (!r.v || !r.v.path) { try { await lecteur.cancel(); } catch { /* ignoré */ } return inactif(c); }
    if (!(await lire(DEPOT_MAX_OCTETS + 1))) return jsonErreur(c, 413, 'trop_gros');
    const buf = new Uint8Array(total); { let o = 0; for (const m of morceaux) { buf.set(m, o); o += m.length; } }
    try { await deposerObjet(c.env, r.v.path, buf, MIME_DE[ext]); } catch (e) { return jsonErreur(c, e.statut || 502, e.code || 'stockage'); }
    const empreinte = await sha256hex(buf);
    await appel(c, 'el_depot_fin', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_path: r.v.path, p_sha256: empreinte, p_taille: buf.length });
    let brut = ''; try { brut = decodeURIComponent(String(c.req.header('X-El-Nom') || '').slice(0, 300)); } catch { brut = ''; }
    return c.json({ path: r.v.path, nom: nomSur(brut), mime: MIME_DE[ext], taille: buf.length });
  });

  app.post('/api/el/signaler', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const b = await lireJson(c);
    if (!b) return jsonErreur(c, 400, 'invalide');
    const photos = Array.isArray(b.photos) ? b.photos.slice(0, 7).map((p) => ({ path: String(p && p.path || ''), nom: nomSur(p && p.nom), mime: String(p && p.mime || '') })) : [];
    const err = erreurSignalement({ ...b, photos });
    if (err) return c.json({ erreur: 'invalide', message: err }, 400);
    const r = await appel(c, 'el_signaler', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_piece: b.piece, p_element: b.element, p_urgence: b.urgence, p_description: String(b.description).trim(), p_photos: photos });
    if (!r.ok) return r.reponse;
    if (!r.v) return inactif(c);
    return c.json({ id: r.v });
  });

  app.post('/api/el/message', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const b = await lireJson(c);
    if (!b) return jsonErreur(c, 400, 'invalide');
    const pieces = Array.isArray(b.pieces) ? b.pieces.slice(0, 5).map((p) => ({ path: String(p && p.path || ''), nom: nomSur(p && p.nom), mime: String(p && p.mime || ''), taille: Number(p && p.taille) || null })) : [];
    const err = erreurMessage(b.corps, pieces);
    if (err) return c.json({ erreur: 'invalide', message: err }, 400);
    const sig = /^[0-9a-f-]{36}$/.test(String(b.signalement_id || '')) ? b.signalement_id : null;
    const r = await appel(c, 'el_message_envoyer', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_corps: String(b.corps).trim(), p_pieces: pieces, p_signalement_id: sig });
    if (!r.ok) return r.reponse;
    if (!r.v) return inactif(c);
    return c.json({ id: r.v });
  });

  // Accord pour la quittance électronique (art. 21). Code e-mail exigé seulement quand l'e-mail est actif (D10).
  app.post('/api/el/accord/code', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    if (!codeAccordRequis(c.env)) return jsonErreur(c, 409, 'code_inactif');
    const r = await appel(c, 'el_contact', { p_jeton_sha256: x.h, p_ip_hash: x.ip }); if (!r.ok) return r.reponse;
    if (!r.v) return inactif(c);
    if (!r.v.email) return jsonErreur(c, 409, 'sans_email');
    const kv = c.env.SESSIONS_KV, cle = 'elotp:' + x.h;
    const prev = await kv.get(cle, 'json');
    const envois = prev && prev.fenetre > Date.now() - 3600_000 ? (prev.envois || 0) : 0;
    if (envois >= 3) return jsonErreur(c, 429, 'limite');
    const code = generateCode();
    await kv.put(cle, JSON.stringify({ hash: await hashCode(x.h, code), exp: Date.now() + OTP_TTL_MS, essais: 0, envois: envois + 1, fenetre: envois ? prev.fenetre : Date.now() }), { expirationTtl: 3600 });
    const s = sender || makeSender(c.env);
    const out = await s.sendModele({ to: r.v.email, type: 'code_accord', objet: 'Code de confirmation', texte: `Bonjour,\n\nCode pour confirmer le choix sur la quittance électronique : ${code}\n\nValable 10 minutes. Ne le communiquer à personne.\n\n— Propryo` });
    if (!out.sent) return jsonErreur(c, 502, 'envoi');
    return c.json({ envoye: true, a: masque(r.v.email) });
  });

  app.post('/api/el/accord', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const b = await lireJson(c, 2048);
    if (!b || typeof b.donner !== 'boolean') return jsonErreur(c, 400, 'invalide');
    let parCode = false;
    if (codeAccordRequis(c.env)) {
      const kv = c.env.SESSIONS_KV, cle = 'elotp:' + x.h;
      const o = await kv.get(cle, 'json');
      if (!o || !o.hash || Date.now() > o.exp || (o.essais || 0) >= OTP_MAX_ATTEMPTS) return jsonErreur(c, 403, 'code_requis');
      if (!(await verifyCode(x.h, String(b.code || ''), o.hash))) {
        await kv.put(cle, JSON.stringify({ ...o, essais: (o.essais || 0) + 1 }), { expirationTtl: 3600 });
        return jsonErreur(c, 403, 'code_faux');
      }
      await kv.put(cle, JSON.stringify({ ...o, hash: null }), { expirationTtl: 3600 });
      parCode = true;
    }
    const r = await appel(c, 'el_accord', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_donner: b.donner, p_version: ACCORD_VERSION, p_code: parCode });
    if (!r.ok) return r.reponse;
    if (!r.v) return inactif(c);
    return c.json({ accord: r.v });
  });
}

// ── E-mails envoyés à la demande du PROPRIÉTAIRE (connecté) : invitation et avis. Mode dev : rien ne part. ──
// Le relais vérifie, avec le jeton du propriétaire (RLS par SCI), qu'il voit bien l'accès concerné.
export function registerEspaceLocataireProprietaire(app, { requireSupabaseUser, sender = null }) {
  // État public (aucune donnée) : l'espace est-il branché, les e-mails partent-ils vraiment ?
  app.get('/el/etat', (c) => c.json({ actif: elConfigure(c.env), emails: c.env.EMAIL_MODE === 'resend' }));

  app.post('/el/notifier', async (c) => {
    const auth = await requireSupabaseUser(c);
    if (auth.error) return auth.error;
    if (!(await limiteDebit(c, 'eln:' + auth.userId))) return jsonErreur(c, 429, 'limite');
    const b = await lireJson(c, 4096);
    if (!b || !TYPES_EMAIL.includes(b.type)) return jsonErreur(c, 400, 'invalide');
    // Lien d'invitation reconstruit sur l'ORIGINE DU RELAIS (jamais un hôte fourni par le client).
    let lien = '';
    if (b.type === 'invitation') {
      if (!JETON_RE.test(String(b.jeton || ''))) return jsonErreur(c, 400, 'invalide');
      lien = new URL(c.req.url).origin + '/l#' + b.jeton;
    }
    const jwt = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
    const contact = c.env.SUPABASE_ANON_KEY ? await contactProprietaire(c.env, jwt, b.acces_id) : null;
    if (!contact) return jsonErreur(c, 403, 'interdit');
    if (!contact.email) return jsonErreur(c, 409, 'sans_email');
    const m = modeleEmail(b.type, { bailleur: String(contact.bailleur || '').slice(0, 120), lien, titre: String(b.titre || '').replace(/[\r\n]/g, ' ').slice(0, 200), statut: String(b.statut || '').replace(/[\r\n]/g, ' ').slice(0, 40) });
    if (!m) return jsonErreur(c, 400, 'invalide');
    const s = sender || makeSender(c.env);
    const out = await s.sendModele({ to: contact.email, objet: m.objet, texte: m.texte, type: b.type });
    return c.json({ envoye: !!out.sent, mode: out.dev ? 'dev' : 'resend' }, 200);
  });
}
