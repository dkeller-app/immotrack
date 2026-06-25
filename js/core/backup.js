// js/core/backup.js — Cœur PUR de la sauvegarde de sécurité (testable, zéro DOM/réseau).
export const FREQ_MS = { jour: 86400000, semaine: 604800000, mois: 2592000000 }   // mois ≈ 30 j

const p2 = n => String(n).padStart(2, '0')
// Horodatage LOCAL AAAA-MM-JJ_HHhMM (nomme zip + snapshots JSON).
export function backupStamp(date) {
  const d = date || new Date()
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + 'h' + p2(d.getMinutes())
}
// Période écoulée ? 'manuel' → jamais auto. lastAt null/0 → dû.
export function dueForBackup(lastAt, frequence, nowMs) {
  if (frequence === 'manuel') return false
  const span = FREQ_MS[frequence] || FREQ_MS.semaine
  if (!lastAt) return true
  return (nowMs - lastAt) >= span
}

const _safeName = s => String(s == null ? 'fichier' : s).replace(/[^a-zA-Z0-9._-]/g, '_')

// Fichiers Storage à sauvegarder = porteurs d'une clé cloud ET postérieurs à lastBackupAt.
// → [{ key, name, kind, ts }]. Sources : documents[].cloudKey, baux[ref].signatures.cloudPdfKey
// (+ .certRef.cloudPdfKey), edl[].cloudPdfKey, photos EDL (forme RÉELLE confirmée par grep —
// cf. _edlPreloadPhotos dans index.html : pieces[].elements[].photosE/photosS,
// cles[].photos/photosS, compteursPhotos[k][], mobilier.elements[].photosE/photosS ;
// chaque photo = { idbKey, cloudKey?, ts, synced, name } — l'horodatage est `ts`).
export function collectBackupFiles(db, lastBackupAt) {
  const out = []
  // Sans lastBackupAt → tout. Un fichier porteur d'une clé MAIS sans horodatage (records legacy/importés)
  // est TOUJOURS inclus : mieux re-sauvegarder un doublon (le manifeste dédoublonne) que perdre une preuve légale.
  const after = ts => !lastBackupAt || !ts || new Date(ts).getTime() > lastBackupAt
  const push = (key, name, kind, ts) => { if (key && after(ts)) out.push({ key, name, kind, ts: ts || null }) }
  for (const d of (db && db.documents) || []) push(d.cloudKey, _safeName(d.nom || ('doc-' + d.id)), 'document', d._modifiedAt)
  for (const [ref, b] of Object.entries((db && db.baux) || {})) {
    const s = b && b.signatures; if (!s) continue
    push(s.cloudPdfKey, _safeName('bail-' + ref + '.pdf'), 'document', s.signedAt || b._modifiedAt)
    if (s.certRef) push(s.certRef.cloudPdfKey, _safeName('certificat-' + ref + '.pdf'), 'document', s.signedAt || b._modifiedAt)
  }
  for (const e of (db && db.edl) || []) {
    push(e.cloudPdfKey, _safeName('edl-' + (e.id || '') + '.pdf'), 'document', e._modifiedAt)
    // Photos EDL — on parcourt EXACTEMENT les mêmes emplacements que _edlPreloadPhotos (index.html).
    const pushPhoto = ph => {
      if (!ph || !ph.cloudKey) return
      const stamp = ph.ts || e._modifiedAt
      // Audit M4 : unicité du nom de fichier. slice(-12) faisait collisionner 2 photos dont les
      // 12 derniers chars d'idbKey coïncident → getFileHandle(create:true) en écrasait une.
      // On sanitise l'idbKey COMPLET (fallback cloudKey) → nom déterministe et distinct.
      const uid = _safeName(ph.idbKey || ph.cloudKey || 'photo')
      push(ph.cloudKey, _safeName('photo-' + uid + '.jpg'), 'photo', stamp)
    }
    for (const pc of (e.pieces || [])) for (const x of (pc.elements || [])) {
      for (const ph of (x.photosE || [])) pushPhoto(ph)
      for (const ph of (x.photosS || [])) pushPhoto(ph)
    }
    for (const c of (e.cles || [])) {
      for (const ph of (c.photos || [])) pushPhoto(ph)
      for (const ph of (c.photosS || [])) pushPhoto(ph)
    }
    const cp = e.compteursPhotos || {}
    for (const k of Object.keys(cp)) for (const ph of (cp[k] || [])) pushPhoto(ph)
    const mobEls = (e.mobilier && Array.isArray(e.mobilier.elements)) ? e.mobilier.elements : []
    for (const m of mobEls) {
      for (const ph of (m.photosE || [])) pushPhoto(ph)
      for (const ph of (m.photosS || [])) pushPhoto(ph)
    }
    // DAAF — 5e emplacement légal (détecteur de fumée, obligation R129-13). Forme confirmée par grep
    // (index.html L29168/29314/29339) : edl.daaf.photos[] = { name, idbKey, cloudKey?, ts }.
    for (const ph of ((e.daaf && e.daaf.photos) || [])) pushPhoto(ph)
  }
  return out
}

// Manifeste cumulatif (mode dossier) : dédoublonne les clés, historise les snapshots JSON.
export function buildManifest(prev, snapshotName, newKeys, iso, frequence) {
  const p = prev || {}
  const keys = Array.from(new Set([...(p.fichiersSauvegardes || []), ...(newKeys || [])]))
  const versions = Array.from(new Set([...(p.versionsJson || []), snapshotName]))
  return { format: 'propryo-backup-1', derniereSauvegarde: iso, frequence, fichiersSauvegardes: keys, versionsJson: versions }
}

// CRC-32 (pour le ZIP).
let _crcTable = null
function _crcInit() { _crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); _crcTable[n] = c >>> 0 } }
export function crc32(bytes) {
  if (!_crcTable) _crcInit()
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ZIP « stored » (méthode 0, sans compression — PDF/JPEG déjà compressés). entries=[{name,bytes:Uint8Array}] → Uint8Array.
export function storedZip(entries) {
  const enc = new TextEncoder()
  const locals = [], centrals = []; let offset = 0
  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF]
  const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]
  for (const e of entries) {
    const nameB = enc.encode(e.name), data = e.bytes, crc = crc32(data), sz = data.length
    const lh = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nameB.length), u16(0))
    locals.push(new Uint8Array(lh), nameB, data)
    const ch = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(sz), u32(sz), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))
    centrals.push(new Uint8Array(ch), nameB)
    offset += lh.length + nameB.length + data.length
  }
  const cdStart = offset
  let cdSize = 0; for (const c of centrals) cdSize += c.length
  const eocd = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cdSize), u32(cdStart), u16(0)))
  const parts = [...locals, ...centrals, eocd]
  let total = 0; for (const p of parts) total += p.length
  const out = new Uint8Array(total); let pos = 0; for (const p of parts) { out.set(p, pos); pos += p.length }
  return out
}
