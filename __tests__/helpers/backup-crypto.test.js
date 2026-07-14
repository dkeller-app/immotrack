import { describe, it, expect } from 'vitest'
import { encryptBackup, decryptBackup, isEncryptedBackup, ENC_MAGIC } from '../../js/core/backup-crypto.js'

const bytes = s => new TextEncoder().encode(s)
const PLAIN = bytes('PK\x03\x04 faux zip — contenu binaire quelconque ' + 'x'.repeat(500))

describe('encryptBackup / decryptBackup', () => {
  it('round-trip : déchiffrer redonne EXACTEMENT le clair', async () => {
    const enc = await encryptBackup(PLAIN, 'motdepasse-fort-123')
    expect(enc).toBeInstanceOf(Uint8Array)
    expect(enc.length).toBeGreaterThan(PLAIN.length)              // en-tête + tag GCM
    const dec = await decryptBackup(enc, 'motdepasse-fort-123')
    expect(new TextDecoder().decode(dec)).toBe(new TextDecoder().decode(PLAIN))
  })

  it('mauvais mot de passe → rejette (jamais de clair partiel)', async () => {
    const enc = await encryptBackup(PLAIN, 'bon-mdp')
    await expect(decryptBackup(enc, 'mauvais-mdp')).rejects.toThrow()
  })

  it('fichier altéré (1 octet du chiffré) → rejette (AES-GCM authentifié)', async () => {
    const enc = await encryptBackup(PLAIN, 'mdp')
    enc[enc.length - 1] ^= 0xFF                                   // corrompt le dernier octet (tag/chiffré)
    await expect(decryptBackup(enc, 'mdp')).rejects.toThrow()
  })

  it('en-tête altéré (magic) → rejette avec message clair', async () => {
    const enc = await encryptBackup(PLAIN, 'mdp')
    enc[0] ^= 0xFF
    await expect(decryptBackup(enc, 'mdp')).rejects.toThrow(/Propryo/i)
  })

  it('mot de passe vide → refuse de chiffrer', async () => {
    await expect(encryptBackup(PLAIN, '')).rejects.toThrow()
    await expect(encryptBackup(PLAIN, null)).rejects.toThrow()
  })

  it('deux chiffrements du même clair → sorties DIFFÉRENTES (sel + IV aléatoires)', async () => {
    const a = await encryptBackup(PLAIN, 'mdp')
    const b = await encryptBackup(PLAIN, 'mdp')
    expect(a).not.toEqual(b)                                      // pas de réutilisation sel/IV
    // mais les deux déchiffrent bien
    expect(new TextDecoder().decode(await decryptBackup(a, 'mdp'))).toBe(new TextDecoder().decode(PLAIN))
    expect(new TextDecoder().decode(await decryptBackup(b, 'mdp'))).toBe(new TextDecoder().decode(PLAIN))
  })

  it('mot de passe accentué / unicode géré', async () => {
    const enc = await encryptBackup(PLAIN, 'Élysée-🔒-café')
    expect(new TextDecoder().decode(await decryptBackup(enc, 'Élysée-🔒-café'))).toBe(new TextDecoder().decode(PLAIN))
  })
})

// Parité avec l'outil autonome dechiffrer-sauvegarde.html : ce test REPLIQUE les offsets d'octets
// EXACTS que l'outil lit (magic 12 / version 1 / itérations u32-LE 4 / sel 16 / IV 12 / chiffré) puis
// déchiffre par PBKDF2-SHA256 + AES-GCM. Si le module change son format sans mettre l'outil à jour,
// ce test casse → garde-fou anti-perte-de-données à la récupération (l'outil est la bouée de secours).
describe('parité format ↔ outil autonome (dechiffrer-sauvegarde.html)', () => {
  const TOOL_MAGIC = 'PROPRYO-ENC1', TOOL_SALT = 16, TOOL_IV = 12
  it('un .enc du module se déchiffre avec la logique d’offsets de l’outil', async () => {
    const plain = new TextEncoder().encode('PK contenu — bouée de secours ' + 'q'.repeat(200))
    const enc = await encryptBackup(plain, 'mdp-de-secours')
    // --- réplique EXACTE de l'unpack() de l'outil ---
    expect(new TextDecoder().decode(enc.slice(0, TOOL_MAGIC.length))).toBe(TOOL_MAGIC)
    let o = TOOL_MAGIC.length
    expect(enc[o]).toBe(1); o += 1                                             // version
    const iterations = (enc[o] | (enc[o + 1] << 8) | (enc[o + 2] << 16) | (enc[o + 3] << 24)) >>> 0; o += 4
    const salt = enc.slice(o, o + TOOL_SALT); o += TOOL_SALT
    const iv = enc.slice(o, o + TOOL_IV); o += TOOL_IV
    const ct = enc.slice(o)
    // --- déchiffrement identique à run() de l'outil ---
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode('mdp-de-secours'), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    const dec = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct))
    expect(new TextDecoder().decode(dec)).toBe(new TextDecoder().decode(plain))
  })
})
describe('isEncryptedBackup', () => {
  it('reconnaît un fichier chiffré Propryo', async () => {
    const enc = await encryptBackup(PLAIN, 'mdp')
    expect(isEncryptedBackup(enc)).toBe(true)
  })
  it('un zip clair (PK) n’est PAS détecté chiffré', () => {
    expect(isEncryptedBackup(PLAIN)).toBe(false)
    expect(isEncryptedBackup(new Uint8Array([0x50, 0x4B, 0x03, 0x04]))).toBe(false)
  })
  it('entrée courte / vide → false sans throw', () => {
    expect(isEncryptedBackup(new Uint8Array([1, 2, 3]))).toBe(false)
    expect(isEncryptedBackup(new Uint8Array(0))).toBe(false)
  })
  it('ENC_MAGIC exporté et présent en tête du fichier chiffré', async () => {
    const enc = await encryptBackup(PLAIN, 'mdp')
    expect(new TextDecoder().decode(enc.slice(0, ENC_MAGIC.length))).toBe(ENC_MAGIC)
  })
})
