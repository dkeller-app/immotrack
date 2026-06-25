import { describe, it, expect } from 'vitest'
import { backupStamp, dueForBackup, FREQ_MS, collectBackupFiles, buildManifest, crc32, storedZip } from '../../js/core/backup.js'

describe('backupStamp', () => {
  it('formate AAAA-MM-JJ_HHhMM (local)', () => { expect(backupStamp(new Date(2026, 5, 24, 14, 30, 0))).toBe('2026-06-24_14h30') })
  it('zéro-pad mois/jour/heure/minute', () => { expect(backupStamp(new Date(2026, 0, 3, 4, 5, 0))).toBe('2026-01-03_04h05') })
})
describe('dueForBackup', () => {
  const now = new Date('2026-06-24T12:00:00Z').getTime()
  it('jamais → dû', () => expect(dueForBackup(null, 'semaine', now)).toBe(true))
  it('manuel → jamais', () => expect(dueForBackup(now - 10 * FREQ_MS.jour, 'manuel', now)).toBe(false))
  it('semaine non écoulée → non', () => expect(dueForBackup(now - 3 * FREQ_MS.jour, 'semaine', now)).toBe(false))
  it('semaine écoulée → oui', () => expect(dueForBackup(now - 8 * FREQ_MS.jour, 'semaine', now)).toBe(true))
  it('fréquence inconnue → fallback semaine', () => expect(dueForBackup(now - 8 * FREQ_MS.jour, 'bidon', now)).toBe(true))
})
describe('collectBackupFiles', () => {
  const db = {
    documents: [
      { id: 1, cloudKey: 'esp/seg/files/d1', _modifiedAt: '2026-06-20T10:00:00Z', nom: 'bail.pdf' },
      { id: 2, cloudKey: 'esp/seg/files/d2', _modifiedAt: '2026-06-23T10:00:00Z', nom: 'dpe.pdf' },
      { id: 3, _modifiedAt: '2026-06-23T10:00:00Z' }
    ],
    baux: { 'L1': { signatures: { cloudPdfKey: 'esp/seg/files/bp_L1', certRef: { cloudPdfKey: 'esp/seg/files/bc_L1' }, signedAt: '2026-06-23T09:00:00Z' } } },
    edl: [ { id: 9, cloudPdfKey: 'esp/seg/files/edl9', _modifiedAt: '2026-06-19T10:00:00Z' } ]
  }
  it('postérieurs à lastBackupAt seulement', () => {
    const last = new Date('2026-06-22T00:00:00Z').getTime()
    expect(collectBackupFiles(db, last).map(f => f.key).sort()).toEqual(['esp/seg/files/bc_L1', 'esp/seg/files/bp_L1', 'esp/seg/files/d2'])
  })
  it('lastBackupAt null → tout (sans clé ignoré)', () => { expect(collectBackupFiles(db, null).length).toBe(5) })

  // ── Photos EDL — forme RÉELLE confirmée par grep (_edlPreloadPhotos, index.html L26791) ──
  // pieces[].elements[].photosE/photosS, cles[].photos/photosS, compteursPhotos[k][], mobilier.elements[].photosE/photosS
  // Chaque photo : { idbKey, cloudKey?, ts, synced, name }. Le timestamp est `ts` (pas `_modifiedAt`).
  const dbPhotos = {
    edl: [{
      id: 42,
      _modifiedAt: '2026-06-23T10:00:00Z',
      pieces: [{
        nom: 'Séjour',
        elements: [{
          nom: 'Mur',
          photosE: [{ idbKey: 'idbAAAA', cloudKey: 'esp/seg/files/phE1', ts: '2026-06-23T08:00:00Z' }],
          photosS: [{ idbKey: 'idbBBBB', cloudKey: 'esp/seg/files/phS1', ts: '2026-06-23T08:30:00Z' }]
        }]
      }],
      cles: [{ type: 'Porte', photos: [{ idbKey: 'idbCCCC', cloudKey: 'esp/seg/files/phCle', ts: '2026-06-23T08:45:00Z' }], photosS: [{ idbKey: 'idbDDDD', cloudKey: 'esp/seg/files/phCleS', ts: '2026-06-23T08:46:00Z' }] }],
      compteursPhotos: { elec: [{ idbKey: 'idbEEEE', cloudKey: 'esp/seg/files/phElec', ts: '2026-06-23T08:50:00Z' }] },
      mobilier: { elements: [{ nom: 'Lit', photosE: [{ idbKey: 'idbFFFF', cloudKey: 'esp/seg/files/phMob', ts: '2026-06-23T08:55:00Z' }], photosS: [] }] }
    }]
  }
  it('photos EDL : tous les emplacements réels (pieces/cles/compteurs/mobilier)', () => {
    const keys = collectBackupFiles(dbPhotos, null).filter(f => f.kind === 'photo').map(f => f.key).sort()
    expect(keys).toEqual([
      'esp/seg/files/phCle', 'esp/seg/files/phCleS', 'esp/seg/files/phE1',
      'esp/seg/files/phElec', 'esp/seg/files/phMob', 'esp/seg/files/phS1'
    ])
  })
  it('photos EDL : kind=photo + horodatées par ts photo', () => {
    const ph = collectBackupFiles(dbPhotos, null).find(f => f.key === 'esp/seg/files/phE1')
    expect(ph.kind).toBe('photo')
    expect(ph.ts).toBe('2026-06-23T08:00:00Z')
  })
  it('photos EDL : filtre incrémental sur le ts de la photo', () => {
    const last = new Date('2026-06-23T08:47:00Z').getTime()
    const keys = collectBackupFiles(dbPhotos, last).filter(f => f.kind === 'photo').map(f => f.key).sort()
    // Seules elec (08:50) et mobilier (08:55) sont postérieures à 08:47
    expect(keys).toEqual(['esp/seg/files/phElec', 'esp/seg/files/phMob'])
  })
  it('photo sans cloudKey ignorée', () => {
    const dbNoKey = { edl: [{ id: 1, pieces: [{ elements: [{ photosE: [{ idbKey: 'x', ts: '2026-06-23T08:00:00Z' }] }] }] }] }
    expect(collectBackupFiles(dbNoKey, null).length).toBe(0)
  })
})
describe('buildManifest', () => {
  it('accumule clés + historise snapshots', () => {
    const m = buildManifest({ fichiersSauvegardes: ['a'], versionsJson: ['donnees-old.json'] }, 'donnees-2026-06-24_14h30.json', ['b', 'c'], '2026-06-24T14:30:00Z', 'semaine')
    expect(m.fichiersSauvegardes.sort()).toEqual(['a', 'b', 'c'])
    expect(m.versionsJson).toContain('donnees-2026-06-24_14h30.json')
    expect(m.derniereSauvegarde).toBe('2026-06-24T14:30:00Z'); expect(m.frequence).toBe('semaine')
  })
  it('dédoublonne les clés répétées', () => {
    const m = buildManifest({ fichiersSauvegardes: ['a', 'b'], versionsJson: [] }, 'snap.json', ['b', 'a', 'c'], '2026-06-24T14:30:00Z', 'mois')
    expect(m.fichiersSauvegardes.sort()).toEqual(['a', 'b', 'c'])
    expect(m.format).toBe('propryo-backup-1')
  })
  it('prev null → init propre', () => {
    const m = buildManifest(null, 'snap.json', ['a'], '2026-06-24T14:30:00Z', 'jour')
    expect(m.fichiersSauvegardes).toEqual(['a'])
    expect(m.versionsJson).toEqual(['snap.json'])
  })
})
describe('crc32', () => { it('"123456789" = 0xCBF43926', () => { expect(crc32(new TextEncoder().encode('123456789')) >>> 0).toBe(0xCBF43926) }) })
describe('storedZip', () => {
  it('ZIP valide (PK local + EOCD)', () => {
    const u8 = storedZip([{ name: 'donnees.json', bytes: new TextEncoder().encode('{"a":1}') }, { name: 'documents/x.txt', bytes: new TextEncoder().encode('hello') }])
    expect([u8[0], u8[1], u8[2], u8[3]]).toEqual([0x50, 0x4B, 0x03, 0x04])
    const tail = u8.slice(u8.length - 22)
    expect([tail[0], tail[1], tail[2], tail[3]]).toEqual([0x50, 0x4B, 0x05, 0x06])
  })
  it('EOCD annonce le bon nombre d\'entrées', () => {
    const u8 = storedZip([{ name: 'a.txt', bytes: new TextEncoder().encode('aa') }, { name: 'b.txt', bytes: new TextEncoder().encode('bbb') }, { name: 'c.txt', bytes: new TextEncoder().encode('c') }])
    const tail = u8.slice(u8.length - 22)
    const count = tail[10] | (tail[11] << 8)
    expect(count).toBe(3)
  })
})
