/**
 * Tests pour la logique de merge scan Drive → DB.documents.
 *
 * Le helper _drvMergeScanResults est inline dans index-test.html (Sprint 5D).
 * Pour tester sa logique sans dépendance à window/DOM, on réimplémente la même
 * logique pure ici en tant que fonction testable.
 */
import { describe, it, expect } from 'vitest';

// Réplique fidèle de la logique inline (sans saveDB / showToast / _idbDel)
function mergeScanResultsPure(scanResults, logRef, db, options = {}) {
  if (!scanResults || !logRef || !db) return { added: 0, tombstoned: 0, unchanged: 0 };
  const log = (db.logements || []).find(l => l && !l._deleted && l.ref === logRef);
  if (!log) return { added: 0, tombstoned: 0, unchanged: 0 };
  if (!db.documents) db.documents = [];

  let added = 0, tombstoned = 0, unchanged = 0;
  const now = options.now || new Date().toISOString();
  const idGenerator = options.idGenerator || (() => Math.floor(Math.random() * 1e9));

  for (const [category, driveFiles] of Object.entries(scanResults)) {
    const driveIds = new Set(driveFiles.map(f => f.id));

    for (const f of driveFiles) {
      const existing = db.documents.find(d =>
        d && !d._deleted && d.driveFileId === f.id
      );
      if (existing) { unchanged++; continue; }
      db.documents.push({
        id: idGenerator(),
        parentType: 'logement',
        parentId: log.id,
        parentRef: logRef,
        logRef,
        category,
        idbKey: null,
        driveFileId: f.id,
        driveWebViewLink: f.webViewLink || null,
        name: f.name,
        originalName: f.name,
        mime: f.mimeType || 'application/octet-stream',
        size: Number(f.size) || 0,
        uploadedAt: f.modifiedTime || now,
        _modifiedAt: now,
        _discoveredFromDrive: true
      });
      added++;
    }

    const dbDocsForCat = db.documents.filter(d =>
      d && !d._deleted && d.driveFileId &&
      d.parentType === 'logement' && d.parentRef === logRef &&
      d.category === category
    );
    for (const d of dbDocsForCat) {
      if (!driveIds.has(d.driveFileId)) {
        Object.assign(d, {
          _deleted: true,
          _deletedAt: now,
          _modifiedAt: now,
          _deletedBy: 'drive_web'
        });
        tombstoned++;
      }
    }
  }
  return { added, tombstoned, unchanged };
}

function mkDb() {
  return {
    logements: [{ id: 1, ref: 'F-001' }],
    documents: []
  };
}

describe('_drvMergeScanResults — additions', () => {
  it('ajoute un fichier Drive nouveau', () => {
    const db = mkDb();
    const scan = {
      documents: [{ id: 'drive_abc', name: 'facture.pdf', mimeType: 'application/pdf', size: 1234 }]
    };
    const r = mergeScanResultsPure(scan, 'F-001', db);
    expect(r.added).toBe(1);
    expect(db.documents).toHaveLength(1);
    expect(db.documents[0].driveFileId).toBe('drive_abc');
    expect(db.documents[0].parentType).toBe('logement');
    expect(db.documents[0].logRef).toBe('F-001');
    expect(db.documents[0].category).toBe('documents');
    expect(db.documents[0]._discoveredFromDrive).toBe(true);
  });

  it('marque idbKey:null pour les fichiers découverts (lazy load à venir)', () => {
    const db = mkDb();
    const scan = { photos: [{ id: 'd1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 500 }] };
    mergeScanResultsPure(scan, 'F-001', db);
    expect(db.documents[0].idbKey).toBeNull();
  });

  it('skip un fichier déjà dans DB (par driveFileId)', () => {
    const db = mkDb();
    db.documents = [{
      id: 99, parentType: 'logement', parentId: 1, parentRef: 'F-001', logRef: 'F-001',
      category: 'documents', driveFileId: 'drive_abc', name: 'old.pdf'
    }];
    const scan = { documents: [{ id: 'drive_abc', name: 'facture.pdf', size: 1234 }] };
    const r = mergeScanResultsPure(scan, 'F-001', db);
    expect(r.added).toBe(0);
    expect(r.unchanged).toBe(1);
    expect(db.documents).toHaveLength(1);
  });

  it('multi-catégories : photos + documents', () => {
    const db = mkDb();
    const scan = {
      documents: [{ id: 'd1', name: 'a.pdf', size: 100 }],
      photos: [{ id: 'p1', name: 'b.jpg', size: 200 }, { id: 'p2', name: 'c.png', size: 300 }]
    };
    const r = mergeScanResultsPure(scan, 'F-001', db);
    expect(r.added).toBe(3);
    const cats = new Set(db.documents.map(d => d.category));
    expect(cats.has('documents')).toBe(true);
    expect(cats.has('photos')).toBe(true);
  });
});

describe('_drvMergeScanResults — tombstones', () => {
  it('tombstone un fichier DB avec driveFileId absent du scan', () => {
    const db = mkDb();
    db.documents = [{
      id: 99, parentType: 'logement', parentId: 1, parentRef: 'F-001', logRef: 'F-001',
      category: 'documents', driveFileId: 'drive_old', name: 'supprimé.pdf'
    }];
    const scan = { documents: [] }; // pas de fichier dans Drive
    const r = mergeScanResultsPure(scan, 'F-001', db);
    expect(r.tombstoned).toBe(1);
    expect(db.documents[0]._deleted).toBe(true);
    expect(db.documents[0]._deletedBy).toBe('drive_web');
  });

  it('ne tombstone PAS les docs sans driveFileId (jamais uploadés)', () => {
    const db = mkDb();
    db.documents = [{
      id: 99, parentType: 'logement', parentId: 1, parentRef: 'F-001', logRef: 'F-001',
      category: 'documents', driveFileId: null, idbKey: 'k1', name: 'local-only.pdf'
    }];
    const scan = { documents: [] };
    const r = mergeScanResultsPure(scan, 'F-001', db);
    expect(r.tombstoned).toBe(0);
    expect(db.documents[0]._deleted).toBeUndefined();
  });

  it('ne tombstone pas les docs d\'autres logements', () => {
    const db = mkDb();
    db.logements.push({ id: 2, ref: 'F-002' });
    db.documents = [{
      id: 99, parentType: 'logement', parentId: 2, parentRef: 'F-002', logRef: 'F-002',
      category: 'documents', driveFileId: 'drive_x', name: 'autre.pdf'
    }];
    const scan = { documents: [] };
    const r = mergeScanResultsPure(scan, 'F-001', db);
    expect(r.tombstoned).toBe(0);
    expect(db.documents[0]._deleted).toBeUndefined();
  });

  it('ne tombstone pas dans une catégorie non scannée', () => {
    const db = mkDb();
    db.documents = [{
      id: 99, parentType: 'logement', parentId: 1, parentRef: 'F-001', logRef: 'F-001',
      category: 'photos', driveFileId: 'drive_p', name: 'photo.jpg'
    }];
    const scan = { documents: [] }; // scan seulement documents, pas photos
    const r = mergeScanResultsPure(scan, 'F-001', db);
    expect(r.tombstoned).toBe(0);
  });
});

describe('_drvMergeScanResults — null safe + edge cases', () => {
  it('null scan → 0 ops', () => {
    expect(mergeScanResultsPure(null, 'F-001', mkDb()).added).toBe(0);
  });

  it('logement inconnu → 0 ops', () => {
    const r = mergeScanResultsPure({ documents: [{ id: 'x' }] }, 'INEXISTANT', mkDb());
    expect(r.added).toBe(0);
  });

  it('db.documents undefined → initialisé', () => {
    const db = { logements: [{ id: 1, ref: 'F-001' }] };
    mergeScanResultsPure({ documents: [{ id: 'x', name: 'y.pdf' }] }, 'F-001', db);
    expect(db.documents).toBeDefined();
    expect(db.documents.length).toBe(1);
  });

  it('scan vide → unchanged 0, added 0, tombstoned 0', () => {
    const db = mkDb();
    const r = mergeScanResultsPure({}, 'F-001', db);
    expect(r.added).toBe(0);
    expect(r.tombstoned).toBe(0);
    expect(r.unchanged).toBe(0);
  });

  it('cycle complet : add → already-exists → tombstone si Drive supprime', () => {
    const db = mkDb();
    const opts = { now: '2025-05-13T12:00:00Z', idGenerator: (() => { let i = 100; return () => i++; })() };

    // 1er scan : Drive a 2 fichiers
    let r1 = mergeScanResultsPure(
      { documents: [{ id: 'd1', name: 'a.pdf' }, { id: 'd2', name: 'b.pdf' }] },
      'F-001', db, opts
    );
    expect(r1.added).toBe(2);
    expect(db.documents).toHaveLength(2);

    // 2e scan identique : tout déjà sync
    let r2 = mergeScanResultsPure(
      { documents: [{ id: 'd1', name: 'a.pdf' }, { id: 'd2', name: 'b.pdf' }] },
      'F-001', db, opts
    );
    expect(r2.added).toBe(0);
    expect(r2.unchanged).toBe(2);

    // 3e scan : Drive a perdu d2 (user a supprimé manuellement)
    let r3 = mergeScanResultsPure(
      { documents: [{ id: 'd1', name: 'a.pdf' }] },
      'F-001', db, opts
    );
    expect(r3.added).toBe(0);
    expect(r3.tombstoned).toBe(1);
    expect(r3.unchanged).toBe(1);
    const d2 = db.documents.find(d => d.driveFileId === 'd2');
    expect(d2._deleted).toBe(true);
  });
});
