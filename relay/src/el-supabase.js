// relay/src/el-supabase.js — ESPACE LOCATAIRE : accès Supabase de l'IDENTITÉ TECHNIQUE du relais (migration 0059).
//
// Le relais n'a AUCUNE clé de service : il se connecte comme un utilisateur ordinaire (compte dédié, sans espace ni
// SCI, inscrit dans public.el_relais), avec la clé PUBLIQUE du projet. Ce compte ne peut, par construction SQL :
//   • qu'appeler les fonctions el_* (qui exigent un jeton de locataire valide et filtrent par bail et par accès) ;
//   • lire dans le seau QUE les chemins ouverts depuis moins de 60 s par ces fonctions, et déposer QUE sous ticket.
// L'identité du relais ne fait JAMAIS de requête de table : seulement /rpc/el_* et /storage/v1/object (test « frontière »).
// Seule exception, SOUS LE JETON DU PROPRIÉTAIRE (RLS par SCI) : contactProprietaire (el_acces_contact), avant un e-mail.
//
// Secrets : EL_RELAIS_EMAIL, EL_RELAIS_MOT_DE_PASSE (wrangler secret put). Variables : SUPABASE_URL,
// SUPABASE_ANON_KEY (clé publique, la même que l'app).

const BUCKET = 'espace-files';
let _session = null;   // { token, exp } — cache par isolat (jamais journalisé)

export function elConfigure(env) {
  return !!(env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.EL_RELAIS_EMAIL && env.EL_RELAIS_MOT_DE_PASSE);
}

const base = (env) => String(env.SUPABASE_URL || '').replace(/\/+$/, '');

export class ElErreur extends Error {
  constructor(statut, code) { super(code); this.statut = statut; this.code = code; }
}

async function jetonRelais(env, fetchImpl) {
  const now = Date.now();
  if (_session && _session.exp - 60_000 > now) return _session.token;
  const r = await fetchImpl(`${base(env)}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.EL_RELAIS_EMAIL, password: env.EL_RELAIS_MOT_DE_PASSE }),
  });
  if (!r.ok) { _session = null; throw new ElErreur(503, 'el_identite'); }
  const j = await r.json();
  if (!j || !j.access_token) throw new ElErreur(503, 'el_identite');
  _session = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 };
  return _session.token;
}
export function _resetSessionPourTests() { _session = null; }

// Traduction des erreurs SQL de la 0059 en statuts HTTP (aucun détail interne renvoyé au navigateur).
function erreurDepuis(status, corps) {
  const msg = String((corps && (corps.message || corps.msg)) || '');
  const code = String((corps && corps.code) || '');
  if (/el:limite/.test(msg)) return new ElErreur(429, 'limite');
  if (/el:ferme/.test(msg)) return new ElErreur(409, 'ferme');
  if (/el:accord-requis/.test(msg)) return new ElErreur(400, 'accord_requis');   // créneau hors jours ouvrés (0060)
  if (/ar:montant/.test(msg)) return new ElErreur(400, 'montant');
  if (code === '42501' || status === 401 || status === 403) return new ElErreur(503, 'el_identite');
  if (code === '23514' || code === '22023' || /(el|ar):(photo|piece|type|version|date|heure)/.test(msg)) return new ElErreur(400, 'invalide');
  return new ElErreur(502, 'el_base');
}

// Frontière : la liste EXACTE des fonctions « côté lien » appelées sous l'identité du relais (0059, 0060). Les fonctions
// réservées aux membres (el_acces_emettre, ar_acces_emettre, ar_devis_decider…) n'y figurent pas.
export const FONCTIONS_RELAIS = new Set([
  'el_ouvrir', 'el_documents', 'el_signalements', 'el_messages', 'el_fichier', 'el_depot', 'el_depot_fin', 'el_signaler',
  'el_message_envoyer', 'el_accord', 'el_contact', 'el_creneau_confirmer', 'el_ia_autorise',
  'ar_ouvrir', 'ar_fichier', 'ar_depot', 'ar_depot_fin', 'ar_document', 'ar_creneau', 'ar_constat', 'ar_ia_autorise',
])
export async function rpc(env, fn, args, fetchImpl = fetch) {
  if (!FONCTIONS_RELAIS.has(fn)) throw new ElErreur(500, 'fonction');
  const token = await jetonRelais(env, fetchImpl);
  const r = await fetchImpl(`${base(env)}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(args),
  });
  let corps = null;
  try { corps = await r.json(); } catch { corps = null; }
  if (!r.ok) {
    if (r.status === 401) _session = null;
    throw erreurDepuis(r.status, corps);
  }
  return corps;
}

const cheminSur = (p) => typeof p === 'string' && /^[0-9a-f-]{36}\/[A-Za-z0-9_-]+\/[A-Za-z0-9._\/-]+$/.test(p) && !p.includes('..') && !p.includes('//');
const encoderChemin = (p) => p.split('/').map(encodeURIComponent).join('/');

/** Lit un objet que la base vient d'« ouvrir » (60 s). Renvoie la Response Storage (flux) ou lève. */
export async function lireObjet(env, path, fetchImpl = fetch) {
  if (!cheminSur(path)) throw new ElErreur(400, 'chemin');
  const token = await jetonRelais(env, fetchImpl);
  const r = await fetchImpl(`${base(env)}/storage/v1/object/authenticated/${BUCKET}/${encoderChemin(path)}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (r.status === 404 || r.status === 400) throw new ElErreur(404, 'introuvable');
  if (!r.ok) throw new ElErreur(502, 'stockage');
  return r;
}

/** Dépose un fichier sous ticket (5 min), sans écrasement. */
export async function deposerObjet(env, path, bytes, mime, fetchImpl = fetch) {
  if (!cheminSur(path)) throw new ElErreur(400, 'chemin');
  const token = await jetonRelais(env, fetchImpl);
  const r = await fetchImpl(`${base(env)}/storage/v1/object/${BUCKET}/${encoderChemin(path)}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': mime, 'x-upsert': 'false', 'cache-control': 'no-store' },
    body: bytes,
  });
  if (!r.ok) throw new ElErreur(502, 'stockage');
  return true;
}

/**
 * Destinataire et signataire d'un e-mail, lus EN BASE avec le jeton du propriétaire (fonction el_acces_contact : droit
 * d'écriture sur la SCI exigé, accès non révoqué ni terminé). Jamais fournis par le client : pas de relais d'e-mails
 * ouvert. Renvoie { email, bailleur } ou null (refus, accès inactif, erreur).
 */
export async function contactProprietaire(env, jwtProprietaire, accesId, jetonSha256 = null, fetchImpl = fetch, fn = 'el_acces_contact') {
  if (!/^[0-9a-f-]{36}$/.test(String(accesId || ''))) return null;
  if (!['el_acces_contact', 'ar_acces_contact'].includes(fn)) return null;
  try {
    const r = await fetchImpl(`${base(env)}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwtProprietaire}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(jetonSha256 ? { p_acces_id: accesId, p_jeton_sha256: jetonSha256 } : { p_acces_id: accesId }),
    });
    if (!r.ok) return null;
    const v = await r.json().catch(() => null);
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}
