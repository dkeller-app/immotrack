// relay/src/espace-artisan.js — LIEN DE L'ARTISAN (sans compte) : page publique /a + API /api/ar/*.
// CDC : docs/CDC-INCIDENT-CIRCUIT.md (D13, D14 ; GO Didier 14/10/2026). Migration : 0060.
//
// Même frontière que l'espace locataire (0059, option C) : l'artisan ouvre /a#<jeton> ; le jeton vit dans le FRAGMENT et
// part dans l'en-tête X-Ar-Jeton ; le relais calcule SHA-256(jeton) et appelle les SEULES fonctions ar_* sous l'identité
// technique (el-supabase.js). La règle « qui voit quoi » et la décision sur un devis (plafond) vivent en SQL.
// Ici : en-têtes de sécurité (ceux de l'espace locataire), limite de débit, contrôle des fichiers, e-mails (mode dev).
import { TEXTES } from '../../js/core/qui-paie.js';
import { CONSTATS, AMPLEURS, SOUS_TYPES_EXTERIEURE, phrasePlafond, normaliserConstat, normaliserCreneau, montant, modeleEmailArtisan, STATUTS_DEVIS, exigeAccordExpres } from '../../js/core/incident-circuit.js';
import { JETON_RE, empreinteJeton } from '../../js/core/espace-locataire.js';
import { elConfigure, lireObjet, contactProprietaire } from './el-supabase.js';
import { entetes, ctxLien, appel, lireJson, nomSur, jsonErreur, inactif, recevoirDepot, limiteDebit, MENTION_IA_LIEN, EL_ASSET_VERSION } from './espace-locataire.js';
import { fournisseurActif } from './ai/provider.js';
import { makeSender } from './email-sender.js';

// Même numéro que la page du locataire (el.css et lien-commun.js sont partagés) : jamais une URL ?v= déjà servie.
const codePostal = (adresse) => { const m = /\b(\d{5})\b/.exec(String(adresse || '')); return m ? m[1] : ''; };
export const AR_ASSET_VERSION = EL_ASSET_VERSION;

export function renderArtisanPage() {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Demande d'intervention</title>
<link rel="stylesheet" href="/el.css?v=${AR_ASSET_VERSION}">
</head>
<body>
<div id="app" class="el-root" aria-live="polite"><p class="el-boot">Chargement…</p></div>
<noscript><p class="el-boot">Cette page a besoin de JavaScript.</p></noscript>
<script type="module" src="/ar.js?v=${AR_ASSET_VERSION}"></script>
</body>
</html>`;
}

// Référentiel envoyé à la page (une seule source : les modules purs).
export const REFERENTIEL_ARTISAN = Object.freeze({
  constats: CONSTATS, ampleurs: AMPLEURS, sousTypes: SOUS_TYPES_EXTERIEURE, statutsDevis: STATUTS_DEVIS,
  devis: { ref: TEXTES["devis-2017"].ref, extrait: TEXTES["devis-2017"].extrait, url: TEXTES["devis-2017"].url }, mentionIA: MENTION_IA_LIEN,
});

const ctx = (c) => ctxLien(c, 'X-Ar-Jeton', 'ar:');
const UUID = /^[0-9a-f-]{36}$/;

export function registerEspaceArtisanRoutes(app) {
  app.use('/a', async (c, next) => { await next(); entetes(c); });
  app.use('/api/ar/*', async (c, next) => { await next(); entetes(c); });

  app.get('/a', (c) => c.html(renderArtisanPage()));

  app.post('/api/ar/ouvrir', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const r = await appel(c, 'ar_ouvrir', { p_jeton_sha256: x.h, p_ip_hash: x.ip }); if (!r.ok) return r.reponse;
    if (!r.v || r.v.actif !== true) return inactif(c);
    // Accord exprès pour le créneau proposé (le locataire confirme) : information affichée à l'artisan.
    const cr = r.v.creneau && r.v.creneau.date ? exigeAccordExpres(String(r.v.creneau.date).slice(0, 10), codePostal(r.v.demande && r.v.demande.adresse)) : null;
    return c.json({ ...r.v, phrasePlafond: phrasePlafond(r.v.plafond_ttc), creneauAccordExpres: cr, referentiel: REFERENTIEL_ARTISAN, ia: !!fournisseurActif(c.env) });
  });

  // Ouvrir une photo de la demande (par son rang) ou un dépôt de ce lien : autorisation de 60 s posée par la base.
  app.post('/api/ar/fichier', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const b = await lireJson(c, 2048);
    if (!b || !['demande', 'depot'].includes(b.source)) return jsonErreur(c, 400, 'invalide');
    const index = Number.isInteger(b.index) && b.index >= 0 && b.index < 6 ? b.index : null;
    const id = UUID.test(String(b.id || '')) ? b.id : null;
    const r = await appel(c, 'ar_fichier', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_source: b.source, p_index: index, p_id: id });
    if (!r.ok) return r.reponse;
    if (!r.v) return inactif(c);
    if (r.v.absent || !r.v.path) return jsonErreur(c, 404, 'introuvable');
    let obj;
    try { obj = await lireObjet(c.env, r.v.path); } catch (e) { return jsonErreur(c, e.statut || 502, e.code || 'stockage'); }
    const mime = ['application/pdf', 'image/jpeg', 'image/png'].includes(r.v.mime) ? r.v.mime : 'application/octet-stream';
    const ext = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg';
    const nom = nomSur(r.v.nom).replace(/\.(pdf|png|jpe?g)$/i, '') + ext;
    return new Response(obj.body, { status: 200, headers: new Headers({
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${nom.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
    }) });
  });

  app.post('/api/ar/depot', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    if (!x.h) return inactif(c);
    return recevoirDepot(c, {
      nomEntete: 'X-Ar-Nom',
      ticket: async (ext) => {
        const r = await appel(c, 'ar_depot', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_ext: ext });
        return !r.ok ? { reponse: r.reponse } : (r.v && r.v.path ? { path: r.v.path } : null);
      },
      fin: async (path, sha, taille) => {
        const f = await appel(c, 'ar_depot_fin', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_path: path, p_sha256: sha, p_taille: taille });
        return !f.ok ? { reponse: f.reponse } : f.v === true;
      },
    });
  });

  // Enregistrer un devis, une facture ou une photo déposé : la base décide du statut d'un devis (plafond figé sur le lien).
  app.post('/api/ar/document', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const b = await lireJson(c, 4096);
    if (!b || !['devis', 'facture', 'photo'].includes(b.type) || typeof b.path !== 'string' || b.path.length > 600) return jsonErreur(c, 400, 'invalide');
    const m = b.type === 'photo' ? null : montant(b.montant_ttc);
    if (b.type !== 'photo' && !(m > 0)) return c.json({ erreur: 'montant', message: 'Indiquer le montant TTC.' }, 400);
    const r = await appel(c, 'ar_document', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_type: b.type, p_path: b.path, p_nom: nomSur(b.nom), p_montant_ttc: m, p_numero: String(b.numero || '').replace(/[\r\n]/g, ' ').slice(0, 60) || null });
    if (!r.ok) return r.reponse;
    if (!r.v) return inactif(c);
    return c.json(r.v);
  });

  app.post('/api/ar/creneau', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const b = await lireJson(c, 2048);
    const cr = normaliserCreneau(b);
    if (!cr) return c.json({ erreur: 'invalide', message: 'Indiquer un jour et, si possible, une plage horaire (fin après le début).' }, 400);
    const r = await appel(c, 'ar_creneau', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_date: cr.date, p_debut: cr.debut, p_fin: cr.fin });
    if (!r.ok) return r.reponse;
    if (r.v == null) return inactif(c);
    return c.json({ creneau: cr, accordExpres: exigeAccordExpres(cr.date, b && /^\d{5}$/.test(String(b.cp || '')) ? b.cp : '') });
  });

  // Constat NEUTRE (proposé par l'IA, confirmé par l'artisan). Il ne voit jamais la répartition.
  app.post('/api/ar/constat', async (c) => {
    const x = await ctx(c); if (x.reponse) return x.reponse;
    const b = await lireJson(c, 8192);
    const k = normaliserConstat(b, new Date().toISOString());
    if (!k) return c.json({ erreur: 'invalide', message: 'Choisir le constat.' }, 400);
    const r = await appel(c, 'ar_constat', { p_jeton_sha256: x.h, p_ip_hash: x.ip, p_constat: k.constat, p_sous_type: k.sousType, p_ampleur: k.ampleur, p_resume: k.resume });
    if (!r.ok) return r.reponse;
    if (r.v == null) return inactif(c);
    return c.json({ constat: k });
  });
}

// ── E-mail d'invitation de l'artisan, à la demande du PROPRIÉTAIRE (connecté). Mode dev : rien ne part. ──
// Le destinataire est lu EN BASE (ar_acces_contact : droit d'écriture exigé, lien actif, jeton de CE lien) : jamais fourni
// par le client (pas de relais d'e-mails ouvert). Le lien est reconstruit sur l'ORIGINE DU RELAIS.
// Plafond d'envois (comme le code du locataire, 3 / heure) : 3 invitations par lien et par heure, 30 par compte et par
// jour. Le destinataire est en base, mais un membre peut le poser : pas de rafale vers une adresse tierce.
export const ENVOIS_LIEN_HEURE = 3, ENVOIS_COMPTE_JOUR = 30;
async function envoiPermis(kv, accesId, userId) {
  if (!kv) return true;
  const now = Date.now(), jour = new Date(now).toISOString().slice(0, 10);
  const cl = 'arn:' + accesId, cc = 'arnj:' + userId + ':' + jour;
  const pl = await kv.get(cl, 'json'), nc = Number(await kv.get(cc)) || 0;
  const nl = pl && pl.fenetre > now - 3600_000 ? (pl.envois || 0) : 0;
  if (nl >= ENVOIS_LIEN_HEURE || nc >= ENVOIS_COMPTE_JOUR) return false;
  await kv.put(cl, JSON.stringify({ envois: nl + 1, fenetre: nl ? pl.fenetre : now }), { expirationTtl: 3600 });
  await kv.put(cc, String(nc + 1), { expirationTtl: 86400 });
  return true;
}
export function registerEspaceArtisanProprietaire(app, { requireSupabaseUser, sender = null }) {
  app.post('/ar/notifier', async (c) => {
    const auth = await requireSupabaseUser(c);
    if (auth.error) return auth.error;
    if (!(await limiteDebit(c, 'arn:' + auth.userId))) return jsonErreur(c, 429, 'limite');
    const b = await lireJson(c, 4096);
    if (!b || !UUID.test(String(b.acces_id || '')) || !JETON_RE.test(String(b.jeton || ''))) return jsonErreur(c, 400, 'invalide');
    if (!elConfigure(c.env) || !c.env.SUPABASE_ANON_KEY) return jsonErreur(c, 503, 'el_inactif');
    const jwt = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
    const contact = await contactProprietaire(c.env, jwt, b.acces_id, await empreinteJeton(b.jeton), fetch, 'ar_acces_contact');
    if (!contact) return jsonErreur(c, 403, 'interdit');
    if (!contact.email) return jsonErreur(c, 409, 'sans_email');
    if (!(await envoiPermis(c.env.SESSIONS_KV, b.acces_id, auth.userId))) return jsonErreur(c, 429, 'limite');
    const m = modeleEmailArtisan({ bailleur: String(contact.bailleur || '').slice(0, 120), lien: new URL(c.req.url).origin + '/a#' + b.jeton });
    if (!m) return jsonErreur(c, 400, 'invalide');
    const s = sender || makeSender(c.env);
    const out = await s.sendModele({ to: contact.email, objet: m.objet, texte: m.texte, type: 'invitation_artisan' });
    return c.json({ envoye: !!out.sent, mode: out.dev ? 'dev' : 'resend' }, 200);
  });
}
