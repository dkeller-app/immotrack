import { describe, it, expect } from 'vitest'
import { backupStamp, dueForBackup, FREQ_MS, collectBackupFiles, buildManifest, crc32, storedZip, backupDocName, buildLogMap, backupFolderFor } from '../../js/core/backup.js'

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
      { id: 1, cloudKey: 'esp/seg/files/d1', _modifiedAt: '2026-06-20T10:00:00Z', name: 'bail.pdf', originalName: 'bail.pdf', mime: 'application/pdf' },
      { id: 2, cloudKey: 'esp/seg/files/d2', _modifiedAt: '2026-06-23T10:00:00Z', name: 'dpe.pdf', originalName: 'dpe.pdf', mime: 'application/pdf' },
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
  // Fix audit #1 — un fichier porteur d'une clé MAIS sans horodatage (legacy/importé) ne doit JAMAIS
  // être dropé en silence quand lastBackupAt est posé (preuve légale perdue). On préfère un doublon.
  it('clé sans horodatage incluse même avec lastBackupAt non-null', () => {
    const dbNoTs = { documents: [{ id: 1, cloudKey: 'esp/seg/files/legacy', name: 'legacy.pdf' }] }
    const last = new Date('2026-06-22T00:00:00Z').getTime()
    expect(collectBackupFiles(dbNoTs, last).map(f => f.key)).toEqual(['esp/seg/files/legacy'])
  })
  // Bug « format non reconnu » (Windows) : les documents étaient écrits SANS extension
  // (lecture de `d.nom` inexistant → fallback `doc-<id>`). Le champ réel est originalName||name.
  it('nom de document : extension préservée + id pour l’unicité', () => {
    const f = collectBackupFiles(db, null).find(x => x.key === 'esp/seg/files/d1')
    expect(f.name).toBe('bail-1.pdf')           // base lisible + -id + .ext
  })

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
  // Fix audit #2 — DAAF = 5e emplacement légal (détecteur de fumée, R129-13). Forme confirmée par grep
  // (index.html L29168/29314/29339) : edl.daaf.photos[] = { name, idbKey, cloudKey?, ts }.
  it('photos EDL : emplacement DAAF (détecteur de fumée) collecté', () => {
    const dbDaaf = { edl: [{ id: 7, _modifiedAt: '2026-06-23T10:00:00Z', daaf: { statut: 'present', photos: [{ idbKey: 'idbDAAF', cloudKey: 'kd', ts: '2026-06-23T09:30:00Z' }] } }] }
    const photos = collectBackupFiles(dbDaaf, null).filter(f => f.kind === 'photo')
    expect(photos.map(f => f.key)).toEqual(['kd'])
    expect(photos[0].kind).toBe('photo')
    expect(photos[0].ts).toBe('2026-06-23T09:30:00Z')
  })
  it('photo sans cloudKey ignorée', () => {
    const dbNoKey = { edl: [{ id: 1, pieces: [{ elements: [{ photosE: [{ idbKey: 'x', ts: '2026-06-23T08:00:00Z' }] }] }] }] }
    expect(collectBackupFiles(dbNoKey, null).length).toBe(0)
  })
  // Fix audit M4 — 2 photos dont les 12 derniers chars d'idbKey coïncident NE doivent PAS partager
  // le même `name` (sinon getFileHandle(create:true) en écraserait une dans le dossier). On nomme
  // désormais sur l'idbKey COMPLET sanitisé → noms distincts garantis.
  it('noms de photos uniques même si 12 derniers chars idbKey identiques', () => {
    const dbColl = {
      edl: [{
        id: 1,
        pieces: [{
          elements: [{
            photosE: [
              { idbKey: 'edl1_pieceA_0123456789AB', cloudKey: 'esp/seg/files/phA', ts: '2026-06-23T08:00:00Z' },
              { idbKey: 'edl1_pieceB_0123456789AB', cloudKey: 'esp/seg/files/phB', ts: '2026-06-23T08:01:00Z' }
            ]
          }]
        }]
      }]
    }
    const photos = collectBackupFiles(dbColl, null).filter(f => f.kind === 'photo')
    expect(photos.length).toBe(2)
    const names = photos.map(f => f.name)
    expect(names[0]).not.toBe(names[1])               // pas de collision
    expect(new Set(names).size).toBe(2)               // 2 noms distincts
  })
})
// ── Rangement en arbre Bailleur / Immeuble / Appartement / Type ──
describe('buildLogMap', () => {
  it('indexe ref → { entity, imm, ref }', () => {
    const db = { logements: [{ ref: 'L1', entity: 'SCI Alpha', imm: 'Résidence A' }] }
    expect(buildLogMap(db).get('L1')).toEqual({ entity: 'SCI Alpha', imm: 'Résidence A', ref: 'L1' })
  })
  it('ref numérique coercée en clé string', () => {
    const db = { logements: [{ ref: 7, entity: 'X' }] }
    expect(buildLogMap(db).get('7')).toBeTruthy()
  })
  it('logement sans ref ignoré', () => {
    expect(buildLogMap({ logements: [{ entity: 'X' }] }).size).toBe(0)
  })
  // Ref réutilisée après suppression (tombstone) : un logement VIVANT l'emporte sur le _deleted.
  it('logement vivant l’emporte sur un tombstone de même ref', () => {
    const db = { logements: [
      { ref: 'L1', entity: 'ANCIEN', _deleted: true },
      { ref: 'L1', entity: 'NOUVEAU' }
    ] }
    expect(buildLogMap(db).get('L1').entity).toBe('NOUVEAU')
    const db2 = { logements: [
      { ref: 'L1', entity: 'NOUVEAU' },
      { ref: 'L1', entity: 'ANCIEN', _deleted: true }
    ] }
    expect(buildLogMap(db2).get('L1').entity).toBe('NOUVEAU')   // ordre inverse → même résultat
  })
  it('db vide / sans logements → map vide', () => {
    expect(buildLogMap(null).size).toBe(0)
    expect(buildLogMap({}).size).toBe(0)
  })
})
describe('backupFolderFor', () => {
  const logMap = buildLogMap({ logements: [
    { ref: 'L1', entity: 'SCI Alpha', imm: 'Résidence A' },
    { ref: 'L2', entity: 'Jean Dupont' }                       // sans immeuble
  ] })
  it('bien avec immeuble : Bailleur / Immeuble / Appartement / Type', () => {
    expect(backupFolderFor(logMap, 'L1', 'bail'))
      .toBe('Bailleur — SCI Alpha/Immeuble — Résidence A/Appartement — L1/Bail')
  })
  it('bien sans immeuble : pas de niveau Immeuble', () => {
    expect(backupFolderFor(logMap, 'L2', 'edl'))
      .toBe('Bailleur — Jean Dupont/Appartement — L2/État des lieux')
  })
  it('photos EDL → sous-dossier dédié Photos', () => {
    expect(backupFolderFor(logMap, 'L1', 'photos'))
      .toBe('Bailleur — SCI Alpha/Immeuble — Résidence A/Appartement — L1/État des lieux/Photos')
  })
  it('logement introuvable → _Non rattachés / Type', () => {
    expect(backupFolderFor(logMap, 'INCONNU', 'quittances')).toBe('_Non rattachés/Quittances')
    expect(backupFolderFor(logMap, null, 'bail')).toBe('_Non rattachés/Bail')
  })
  it('catégorie inconnue → Documents', () => {
    expect(backupFolderFor(logMap, 'L2', 'divers')).toBe('Bailleur — Jean Dupont/Appartement — L2/Documents')
  })
  it('caractères interdits FS sanitisés dans les segments (accents gardés)', () => {
    const lm = buildLogMap({ logements: [{ ref: 'A/B:C', entity: 'Immo <SARL>', imm: 'Résidence Élysée' }] })
    const p = backupFolderFor(lm, 'A/B:C', 'bail')
    expect(p).not.toMatch(/[<>:"|?*\\]/)                        // aucun caractère interdit (hors séparateurs /)
    expect(p).toContain('Immeuble — Résidence Élysée')         // accents préservés
    expect(p).toContain('Immo SARL')                           // < > → espace, espaces collapsés
  })
})
// ── collectBackupFiles : dossier logique attaché à chaque fichier ──
describe('collectBackupFiles — rangement en arbre', () => {
  const db = {
    logements: [{ ref: 'L1', entity: 'SCI Alpha', imm: 'Résidence A' }],
    documents: [{ id: 1, cloudKey: 'k/d1', logRef: 'L1', category: 'documents', name: 'dpe.pdf', mime: 'application/pdf', _modifiedAt: '2026-06-20T10:00:00Z' }],
    baux: { 'L1': { signatures: { cloudPdfKey: 'k/bail', certRef: { cloudPdfKey: 'k/cert' }, signedAt: '2026-06-23T09:00:00Z' } } },
    edl: [{ id: 9, logement: 'L1', cloudPdfKey: 'k/edl', _modifiedAt: '2026-06-19T10:00:00Z',
      pieces: [{ elements: [{ photosE: [{ idbKey: 'ph1', cloudKey: 'k/ph1', ts: '2026-06-23T08:00:00Z' }] }] }] }]
  }
  const byKey = k => collectBackupFiles(db, null).find(f => f.key === k)
  it('document → dossier du bien + Documents', () => {
    expect(byKey('k/d1').dir).toBe('Bailleur — SCI Alpha/Immeuble — Résidence A/Appartement — L1/Documents')
  })
  it('bail + certificat → dossier Bail du bien', () => {
    expect(byKey('k/bail').dir).toBe('Bailleur — SCI Alpha/Immeuble — Résidence A/Appartement — L1/Bail')
    expect(byKey('k/cert').dir).toBe('Bailleur — SCI Alpha/Immeuble — Résidence A/Appartement — L1/Bail')
  })
  it('EDL PDF → dossier État des lieux du bien', () => {
    expect(byKey('k/edl').dir).toBe('Bailleur — SCI Alpha/Immeuble — Résidence A/Appartement — L1/État des lieux')
  })
  it('photo EDL → sous-dossier Photos + nom daté', () => {
    const ph = byKey('k/ph1')
    expect(ph.dir).toBe('Bailleur — SCI Alpha/Immeuble — Résidence A/Appartement — L1/État des lieux/Photos')
    expect(ph.name).toMatch(/^\d{4}-\d{2}-\d{2}_photo-.+\.jpg$/)   // préfixe date AAAA-MM-JJ
  })
  it('document sans logRef → _Non rattachés', () => {
    const orphan = { documents: [{ id: 2, cloudKey: 'k/orphan', name: 'x.pdf', mime: 'application/pdf' }] }
    expect(collectBackupFiles(orphan, null)[0].dir).toBe('_Non rattachés/Documents')
  })
})
describe('backupDocName', () => {
  it('nom original → extension conservée + id suffixé', () => {
    expect(backupDocName({ id: 1782133475720, originalName: 'quittance-2024-06.pdf', mime: 'application/pdf' }))
      .toBe('quittance-2024-06-1782133475720.pdf')
  })
  it('name seul (pas originalName)', () => {
    expect(backupDocName({ id: 7, name: 'photo.jpg' })).toBe('photo-7.jpg')
  })
  it('pas d’extension dans le nom → dérivée du MIME', () => {
    expect(backupDocName({ id: 9, name: 'scan-sans-ext', mime: 'image/png' })).toBe('scan-sans-ext-9.png')
  })
  it('aucun nom → base doc-<id> + extension du MIME', () => {
    expect(backupDocName({ id: 42, mime: 'image/jpeg' })).toBe('doc-42-42.jpg')
  })
  it('extension de nom en MAJUSCULES → minuscule', () => {
    expect(backupDocName({ id: 3, name: 'Bail.PDF' })).toBe('Bail-3.pdf')
  })
  it('ni nom ni MIME connu → fallback .bin (jamais sans extension)', () => {
    expect(backupDocName({ id: 5 })).toBe('doc-5-5.bin')
    expect(backupDocName({ id: 6, mime: 'application/x-inconnu' })).toBe('doc-6-6.bin')
  })
  it('Word docx via MIME long', () => {
    expect(backupDocName({ id: 8, name: 'contrat', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
      .toBe('contrat-8.docx')
  })
  it('2 documents de MÊME nom original → noms de fichiers DISTINCTS (anti-collision)', () => {
    const a = backupDocName({ id: 100, name: 'facture.pdf' })
    const b = backupDocName({ id: 200, name: 'facture.pdf' })
    expect(a).not.toBe(b)
  })
  it('séparateurs de chemin du nom sanitisés', () => {
    expect(backupDocName({ id: 1, name: 'a/b.pdf' })).toBe('a_b-1.pdf')
  })
  it('originalName prioritaire sur name', () => {
    expect(backupDocName({ id: 4, originalName: 'vrai.pdf', name: 'autre.docx' })).toBe('vrai-4.pdf')
  })
  it('nom non-string ne throw pas (coercion défensive — sinon TOUTE la sauvegarde avorte)', () => {
    expect(() => backupDocName({ id: 12, name: 12345, mime: 'application/pdf' })).not.toThrow()
    expect(backupDocName({ id: 12, name: 12345, mime: 'application/pdf' })).toBe('12345-12.pdf')
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
  // Fix audit #3 — bit 11 (UTF-8) du general purpose bit flag = 0x0800, pour les noms accentués.
  // Local header : offset 0-3 sig, 4-5 version, 6-7 gp-flag (little-endian) → [0x00, 0x08].
  it('local header pose le bit UTF-8 (gp-flag 0x0800)', () => {
    const u8 = storedZip([{ name: 'données.json', bytes: new TextEncoder().encode('{}') }])
    expect([u8[6], u8[7]]).toEqual([0x00, 0x08])
  })
  it('EOCD annonce le bon nombre d\'entrées', () => {
    const u8 = storedZip([{ name: 'a.txt', bytes: new TextEncoder().encode('aa') }, { name: 'b.txt', bytes: new TextEncoder().encode('bbb') }, { name: 'c.txt', bytes: new TextEncoder().encode('c') }])
    const tail = u8.slice(u8.length - 22)
    const count = tail[10] | (tail[11] << 8)
    expect(count).toBe(3)
  })
})
