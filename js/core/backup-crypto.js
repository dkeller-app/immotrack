// js/core/backup-crypto.js — Chiffrement OPTIONNEL de la sauvegarde ZIP (WebCrypto natif, ZÉRO dépendance).
//
// Périmètre (décision produit 2026-07-13) : le chiffrement ne s'applique QU'AU MODE ZIP → un seul
// coffre-fort « .enc ». Le mode dossier reste toujours en clair (son intérêt = arbre navigable +
// fichiers ouvrables directement). Ici on chiffre/déchiffre le ZIP entier comme un bloc opaque.
//
// Format « PROPRYO-ENC1 » (en-tête CLAIR, puis chiffré AES-256-GCM) :
//   [ magic 12o "PROPRYO-ENC1" | version 1o | itérations PBKDF2 u32-LE 4o | sel 16o | IV 12o | chiffré+tag GCM ]
// La clé est dérivée du mot de passe par PBKDF2-SHA256 (sel aléatoire). Le mot de passe n'est
// JAMAIS stocké ; seul le sel permet de re-dériver la clé. AES-GCM est authentifié → toute
// altération (ou mauvais mot de passe) fait ÉCHOUER le déchiffrement (jamais de clair partiel).
// ⚠️ Mot de passe oublié = perte définitive (assumé). Aucun mécanisme de récupération volontaire.

export const ENC_MAGIC = 'PROPRYO-ENC1'   // 12 octets ASCII
const VERSION = 1
const KDF_ITER = 210000                    // PBKDF2-SHA256 (≈ recommandation OWASP 2023)
const SALT_LEN = 16
const IV_LEN = 12                          // 96 bits = taille d'IV recommandée pour AES-GCM
const HEADER_MIN = ENC_MAGIC.length + 1 + 4 + SALT_LEN + IV_LEN

function _crypto() {
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : null
  if (!c || !c.subtle) throw new Error('Chiffrement indisponible : WebCrypto (crypto.subtle) absent de cet environnement')
  return c
}

function _u32le(n) { return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]) }

async function _deriveKey(password, salt, iterations) {
  const c = _crypto()
  const base = await c.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveKey'])
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  )
}

function _pack(salt, iv, iterations, ct) {
  const parts = [new TextEncoder().encode(ENC_MAGIC), new Uint8Array([VERSION]), _u32le(iterations), salt, iv, ct]
  let total = 0; for (const p of parts) total += p.length
  const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

function _unpack(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  if (b.length < HEADER_MIN) throw new Error('Fichier de sauvegarde chiffré invalide (trop court)')
  if (new TextDecoder().decode(b.slice(0, ENC_MAGIC.length)) !== ENC_MAGIC) {
    throw new Error('Ce fichier n’est pas une sauvegarde Propryo chiffrée')
  }
  let o = ENC_MAGIC.length
  const version = b[o]; o += 1
  if (version !== VERSION) throw new Error('Version de chiffrement non supportée : ' + version)
  const iterations = (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; o += 4
  const salt = b.slice(o, o + SALT_LEN); o += SALT_LEN
  const iv = b.slice(o, o + IV_LEN); o += IV_LEN
  const ct = b.slice(o)
  return { version, iterations, salt, iv, ct }
}

// Chiffre le ZIP (Uint8Array) avec un mot de passe non vide → Uint8Array « .enc ».
export async function encryptBackup(zipBytes, password) {
  if (password == null || String(password) === '') throw new Error('Mot de passe requis')
  const c = _crypto()
  const salt = c.getRandomValues(new Uint8Array(SALT_LEN))
  const iv = c.getRandomValues(new Uint8Array(IV_LEN))
  const key = await _deriveKey(password, salt, KDF_ITER)
  const data = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes || [])
  const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  return _pack(salt, iv, KDF_ITER, ct)
}

// Déchiffre un « .enc » → Uint8Array (ZIP clair). Rejette si mot de passe faux / fichier altéré / format KO.
export async function decryptBackup(encBytes, password) {
  const { salt, iv, iterations, ct } = _unpack(encBytes)   // throw explicite si magic/format KO
  const c = _crypto()
  const key = await _deriveKey(password, salt, iterations)
  try {
    const pt = await c.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    return new Uint8Array(pt)
  } catch (e) {
    throw new Error('Mot de passe incorrect ou fichier corrompu')   // échec du tag GCM
  }
}

// Détecte si des octets sont une sauvegarde Propryo chiffrée (magic en tête). Jamais de throw.
export function isEncryptedBackup(bytes) {
  try {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
    if (b.length < ENC_MAGIC.length) return false
    return new TextDecoder().decode(b.slice(0, ENC_MAGIC.length)) === ENC_MAGIC
  } catch (e) { return false }
}
