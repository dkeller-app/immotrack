/**
 * Module bail-link-codec — encodage/décodage des liens de signature de bail
 * (BAIL-SIGNATURE-DISTANCE Session 2, v15.226)
 *
 * Génère un URL fragment compact pour transmettre :
 *   - Le bail data (compressé via CompressionStream gzip → base64url)
 *   - Un token SHA256 tronqué pour vérification email destinataire
 *   - Date d'expiration
 *   - Identification du signataire attendu
 *
 * Utilisé par :
 *   1. ImmoTrack côté préparateur : `encodeBailLink(bail, log, email)` → URL
 *   2. Page sign.html côté destinataire : `decodeBailLink(fragment)` → {bail, log, ...}
 *   3. Vérification token : `verifyToken(bail_data, email, expected_token)` → bool
 *
 * Sécurité : tout côté client (offline-first PWA). Le token n'est PAS une signature
 * cryptographique tierce — il sert juste à empêcher l'ouverture par un email
 * différent de celui prévu. Pour signature légalement opposable eIDAS, utiliser
 * un prestataire certifié (DocuSign/Yousign).
 *
 * Compatibilité : Chrome 80+, Safari 16.4+, Firefox 113+, Node 18+.
 * Toutes les APIs sont natives Web Standards.
 */

// ─── Encoding base64url (RFC 4648 §5) ────────────────────────────
const _b64url = (bytes) => {
  // bytes: Uint8Array → string base64url
  let str = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const _b64url_decode = (str) => {
  // string base64url → Uint8Array
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

// ─── Compression gzip via CompressionStream ──────────────────────
const _gzip = async (str) => {
  const enc = new TextEncoder();
  const stream = new Blob([enc.encode(str)]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
};

const _gunzip = async (bytes) => {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
};

// ─── SHA256 via Web Crypto ───────────────────────────────────────
const _sha256_hex = async (str) => {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// ─── Helpers de normalisation ────────────────────────────────────
const _normEmail = (e) => String(e || '').trim().toLowerCase();
const _now = () => Date.now();
const _isoDay = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Encode un bail en URL fragment compact + token de vérification.
 *
 * @param {object} opts
 * @param {object} opts.bail - bail entier (sera compressé)
 * @param {object} opts.log - logement associé (pour adresse, ref…)
 * @param {object|null} opts.bailleurSignature - signature bailleur déjà
 *        capturée (paraphes + signature finale) à transmettre au locataire
 * @param {string} opts.signerEmail - email du destinataire (locataire)
 * @param {string} [opts.signerRole='locataire'] - rôle ('locataire' V1)
 * @param {string} [opts.returnEmail] - email du préparateur pour retour
 * @param {number} [opts.expiresInDays=7] - durée validité du lien
 * @returns {Promise<{fragment: string, url: string, sizeBytes: number, token: string}>}
 */
export async function encodeBailLink(opts) {
  const {
    bail, log,
    bailleurSignature = null,
    signerEmail,
    signerRole = 'locataire',
    returnEmail = '',
    expiresInDays = 7,
    baseUrl = 'https://immotrack.app/sign.html'
  } = opts || {};

  if (!bail) throw new Error('bail requis');
  if (!log) throw new Error('log requis');
  if (!signerEmail) throw new Error('signerEmail requis');

  const email = _normEmail(signerEmail);
  const exp = _now() + (expiresInDays * 86400000);

  // Payload : ce qui est compressé dans le fragment
  const payload = {
    v: 1,                       // version protocole
    bail,                       // bail entier (sans champs sensibles cachés ailleurs)
    log,                        // log entier
    bailleurSig: bailleurSignature, // signatures bailleur (canvas base64) si présent
    signer: signerRole,         // 'locataire' V1
    exp,                        // expiration ISO ms
    ret: _normEmail(returnEmail) // email retour préparateur
  };

  const json = JSON.stringify(payload);
  const compressed = await _gzip(json);
  const data_b64 = _b64url(compressed);

  // Token = SHA256(data_b64 + email + exp).slice(0, 16)
  // → empêche l'ouverture par une autre adresse email (vérif côté sign.html)
  const tokenHex = await _sha256_hex(data_b64 + '|' + email + '|' + String(exp));
  const token = tokenHex.slice(0, 16);

  // Fragment URL : data + token + email hash (premier 8 char pour pré-affichage)
  const emailHashHex = await _sha256_hex(email);
  const emailHash = emailHashHex.slice(0, 8);

  const fragment = '#v=1&data=' + data_b64 + '&t=' + token + '&eh=' + emailHash + '&exp=' + exp;
  const url = baseUrl + fragment;

  return {
    fragment,
    url,
    sizeBytes: url.length,
    token,
    emailHash,
    exp,
    // Métriques pour les tests / monitoring
    _jsonSize: json.length,
    _compressedSize: compressed.length,
    _ratio: Math.round((compressed.length / json.length) * 100) / 100
  };
}

/**
 * Décode un URL fragment de signature.
 *
 * @param {string} fragment - URL fragment (`#v=1&data=...&t=...&eh=...&exp=...`)
 * @returns {Promise<{payload: object, token: string, emailHash: string, exp: number}>}
 */
export async function decodeBailLink(fragment) {
  if (!fragment || typeof fragment !== 'string') throw new Error('fragment requis');
  let f = fragment.trim();
  if (f.startsWith('#')) f = f.slice(1);

  // Parser les paramètres
  const params = {};
  f.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) params[k] = v || '';
  });

  if (params.v !== '1') throw new Error('version protocole non supportée : ' + params.v);
  if (!params.data) throw new Error('data manquant');
  if (!params.t) throw new Error('token manquant');
  if (!params.exp) throw new Error('exp manquant');

  // Vérifier expiration
  const exp = parseInt(params.exp, 10);
  if (isNaN(exp)) throw new Error('exp invalide');
  if (_now() > exp) throw new Error('lien expiré le ' + new Date(exp).toLocaleDateString('fr-FR'));

  // Décoder
  const bytes = _b64url_decode(params.data);
  const json = await _gunzip(bytes);
  const payload = JSON.parse(json);

  return {
    payload,
    token: params.t,
    emailHash: params.eh || '',
    exp,
    rawData: params.data
  };
}

/**
 * Vérifie qu'un email saisi correspond au token du lien.
 * Appelé à l'étape 1 de sign.html (vérification email destinataire).
 *
 * @param {string} rawData - paramètre `data` du fragment (base64url)
 * @param {string} email - email saisi par l'utilisateur
 * @param {number} exp - timestamp expiration
 * @param {string} expectedToken - token attendu (paramètre `t` du fragment)
 * @returns {Promise<boolean>}
 */
export async function verifyToken(rawData, email, exp, expectedToken) {
  if (!rawData || !email || !exp || !expectedToken) return false;
  const normEmail = _normEmail(email);
  const tokenHex = await _sha256_hex(rawData + '|' + normEmail + '|' + String(exp));
  const computed = tokenHex.slice(0, 16);
  return computed === expectedToken;
}

/**
 * Calcule un identifiant court d'expiration pour affichage UX
 * (ex: "lien valable jusqu'au 5 juin 2026").
 */
export function formatExpiration(exp) {
  try {
    return new Date(exp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return '?'; }
}

/**
 * Estime si la taille d'un lien dépasse les limites navigateur connues.
 * Limites pratiques :
 *   - Chrome desktop : ~32 KB URL
 *   - Mobile Safari : ~8 KB URL
 *   - Email clients (Gmail, Outlook) : variable, ~2-8 KB safe
 *
 * @param {number} sizeBytes
 * @returns {{level: 'ok'|'warn'|'err', maxBrowser: string}}
 */
export function checkLinkSize(sizeBytes) {
  if (sizeBytes < 2000) return { level: 'ok', maxBrowser: 'tous' };
  if (sizeBytes < 8000) return { level: 'ok', maxBrowser: 'desktop + mobile' };
  if (sizeBytes < 32000) return { level: 'warn', maxBrowser: 'desktop OK, mobile risqué' };
  return { level: 'err', maxBrowser: 'risque limite navigateur — utiliser PJ ou Drive' };
}
