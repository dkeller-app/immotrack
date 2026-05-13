import { describe, it, expect } from 'vitest';
import {
  _attachmentBuildDoc,
  _attachmentValidateFile,
  _attachmentMatch,
  _attachmentResolve,
  _attachmentDriveName,
  _planLegacyPjMigration,
  _attachmentOrphans,
  ATTACHMENT_PARENT_TYPES,
  ATTACHMENT_CATEGORIES,
  ATTACHMENT_DEFAULT_MAX_SIZE
} from '../../js/core/attachments.js';

describe('_attachmentBuildDoc', () => {
  it('construit un doc minimal valide', () => {
    const d = _attachmentBuildDoc({
      parentType: 'mouvement', parentId: 42, parentRef: 'Loyer mai',
      logRef: 'F-001', name: 'facture.pdf', mime: 'application/pdf', size: 1234
    });
    expect(d.parentType).toBe('mouvement');
    expect(d.parentId).toBe(42);
    expect(d.parentRef).toBe('Loyer mai');
    expect(d.logRef).toBe('F-001');
    expect(d.category).toBe('documents'); // défaut
    expect(d.name).toBe('facture.pdf');
    expect(d.mime).toBe('application/pdf');
    expect(d.size).toBe(1234);
    expect(d.idbKey).toBeNull();
    expect(d.driveFileId).toBeNull();
    expect(d.id).toBeGreaterThan(0);
    expect(d.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(d._modifiedAt).toBeDefined();
  });

  it('utilise idGenerator custom si fourni', () => {
    const d = _attachmentBuildDoc({
      parentType: 'logement', name: 'plan.pdf',
      idGenerator: () => 99999
    });
    expect(d.id).toBe(99999);
  });

  it('throw si parentType invalide', () => {
    expect(() => _attachmentBuildDoc({ parentType: 'invalid', name: 'x.pdf' }))
      .toThrow(/parentType invalide/);
  });

  it('throw si parentType absent', () => {
    expect(() => _attachmentBuildDoc({ name: 'x.pdf' }))
      .toThrow(/parentType requis/);
  });

  it('throw si category invalide', () => {
    expect(() => _attachmentBuildDoc({
      parentType: 'mouvement', name: 'x.pdf', category: 'invalid'
    })).toThrow(/category invalide/);
  });

  it('throw si name absent', () => {
    expect(() => _attachmentBuildDoc({ parentType: 'mouvement' }))
      .toThrow(/name requis/);
  });

  it('truncate name à 200 caractères', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const d = _attachmentBuildDoc({
      parentType: 'mouvement', name: longName
    });
    expect(d.name.length).toBe(200);
    expect(d.originalName.length).toBe(200);
  });

  it('coerce parentId et parentRef à null si null/undefined', () => {
    const d = _attachmentBuildDoc({
      parentType: 'entite', name: 'logo.png'
    });
    expect(d.parentId).toBeNull();
    expect(d.parentRef).toBeNull();
  });

  it('coerce parentRef en string', () => {
    const d = _attachmentBuildDoc({
      parentType: 'mouvement', parentRef: 42, name: 'x.pdf'
    });
    expect(d.parentRef).toBe('42');
  });

  it('mime par défaut = application/octet-stream', () => {
    const d = _attachmentBuildDoc({
      parentType: 'mouvement', name: 'inconnu'
    });
    expect(d.mime).toBe('application/octet-stream');
  });
});

describe('_attachmentValidateFile', () => {
  it('accepte un PDF de taille normale', () => {
    const r = _attachmentValidateFile({ size: 500_000, type: 'application/pdf' });
    expect(r.valid).toBe(true);
  });

  it('accepte une image JPEG', () => {
    expect(_attachmentValidateFile({ size: 100_000, type: 'image/jpeg' }).valid).toBe(true);
    expect(_attachmentValidateFile({ size: 100_000, type: 'image/png' }).valid).toBe(true);
    expect(_attachmentValidateFile({ size: 100_000, type: 'image/webp' }).valid).toBe(true);
  });

  it('rejette si fichier > 10 Mo (défaut)', () => {
    const r = _attachmentValidateFile({ size: 11 * 1024 * 1024, type: 'image/jpeg' });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/trop lourd/i);
  });

  it('rejette si taille 0', () => {
    expect(_attachmentValidateFile({ size: 0, type: 'image/jpeg' }).valid).toBe(false);
  });

  it('rejette si fichier null', () => {
    expect(_attachmentValidateFile(null).valid).toBe(false);
    expect(_attachmentValidateFile(undefined).valid).toBe(false);
  });

  it('maxSize customisable', () => {
    const r = _attachmentValidateFile(
      { size: 3 * 1024 * 1024, type: 'image/jpeg' },
      { maxSize: 2 * 1024 * 1024 }
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/max 2 Mo/i);
  });

  it('rejette mime non supporté', () => {
    const r = _attachmentValidateFile({ size: 1000, type: 'application/x-executable' });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/non support/i);
  });

  it('accepte sous-type image arbitraire (image/heic)', () => {
    const r = _attachmentValidateFile({ size: 1000, type: 'image/heic' });
    expect(r.valid).toBe(true); // pattern image/* accepté
  });

  it('acceptedMimes customisable', () => {
    const r = _attachmentValidateFile(
      { size: 1000, type: 'application/zip' },
      { acceptedMimes: ['application/zip'] }
    );
    expect(r.valid).toBe(true);
  });

  it('acceptedMimes vide → tous types acceptés', () => {
    const r = _attachmentValidateFile(
      { size: 1000, type: 'random/type' },
      { acceptedMimes: [] }
    );
    expect(r.valid).toBe(true);
  });
});

describe('_attachmentMatch', () => {
  const attachments = [
    { id: 1, parentType: 'mouvement', parentId: 10, logRef: 'F-001', category: 'documents' },
    { id: 2, parentType: 'mouvement', parentId: 11, logRef: 'F-001', category: 'documents' },
    { id: 3, parentType: 'logement', parentId: 100, logRef: 'F-001', category: 'photos' },
    { id: 4, parentType: 'edl', parentId: 50, logRef: 'F-002', category: 'edl' },
    { id: 5, parentType: 'mouvement', parentId: 12, logRef: 'F-001', category: 'documents', _deleted: true }
  ];

  it('filtre par parentType', () => {
    expect(_attachmentMatch(attachments, { parentType: 'mouvement' })).toHaveLength(2);
    expect(_attachmentMatch(attachments, { parentType: 'logement' })).toHaveLength(1);
  });

  it('filtre par parentId', () => {
    const r = _attachmentMatch(attachments, { parentId: 10 });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(1);
  });

  it('filtre combiné parentType + parentId', () => {
    const r = _attachmentMatch(attachments, { parentType: 'mouvement', parentId: 11 });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(2);
  });

  it('filtre par logRef', () => {
    expect(_attachmentMatch(attachments, { logRef: 'F-001' })).toHaveLength(3); // tombstone exclu
    expect(_attachmentMatch(attachments, { logRef: 'F-002' })).toHaveLength(1);
  });

  it('filtre par category', () => {
    expect(_attachmentMatch(attachments, { category: 'photos' })).toHaveLength(1);
    expect(_attachmentMatch(attachments, { category: 'documents' })).toHaveLength(2);
  });

  it('exclut tombstones par défaut', () => {
    expect(_attachmentMatch(attachments, { parentType: 'mouvement' }).length).toBe(2);
  });

  it('inclut tombstones si includeDeleted', () => {
    expect(_attachmentMatch(attachments, { parentType: 'mouvement', includeDeleted: true }).length).toBe(3);
  });

  it('null/undefined safe', () => {
    expect(_attachmentMatch(null, {})).toEqual([]);
    expect(_attachmentMatch(undefined, {})).toEqual([]);
  });
});

describe('_attachmentResolve', () => {
  const attachments = [
    { id: 1, parentType: 'mouvement', parentId: 10, uploadedAt: '2025-01-15T10:00:00Z' },
    { id: 2, parentType: 'mouvement', parentId: 10, uploadedAt: '2025-03-15T10:00:00Z' },
    { id: 3, parentType: 'mouvement', parentId: 11, uploadedAt: '2025-02-15T10:00:00Z' }
  ];

  it('résout par attachmentId direct', () => {
    const r = _attachmentResolve(attachments, { attachmentId: 2 });
    expect(r.id).toBe(2);
  });

  it('résout par parent : prend le plus récent', () => {
    const r = _attachmentResolve(attachments, { parentType: 'mouvement', parentId: 10 });
    expect(r.id).toBe(2); // 2025-03-15 > 2025-01-15
  });

  it('retourne null si aucun match', () => {
    expect(_attachmentResolve(attachments, { parentId: 999 })).toBeNull();
  });

  it('null safe', () => {
    expect(_attachmentResolve(null, {})).toBeNull();
  });
});

describe('_attachmentDriveName', () => {
  it('format category_date_nom', () => {
    const name = _attachmentDriveName('documents', 'Facture mai.pdf', new Date('2025-05-15T10:00:00Z'));
    expect(name).toBe('documents_2025-05-15_Facture mai.pdf');
  });

  it('retire caractères dangereux \\\\ et /', () => {
    const name = _attachmentDriveName('photos', 'photo\\test/x.jpg', new Date('2025-05-15T10:00:00Z'));
    expect(name).toBe('photos_2025-05-15_phototestx.jpg');
  });

  it('limite à 150 caractères', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const name = _attachmentDriveName('documents', longName, new Date('2025-05-15T10:00:00Z'));
    // 'documents_2025-05-15_' = 21 caractères + 150 max = 171 max
    expect(name.length).toBeLessThanOrEqual(180);
  });

  it('fallback si name vide', () => {
    const name = _attachmentDriveName('documents', '', new Date('2025-05-15T10:00:00Z'));
    expect(name).toBe('documents_2025-05-15_document');
  });
});

describe('_planLegacyPjMigration', () => {
  it('détecte les PJ legacy', () => {
    const mvts = [
      { id: 1, pj: { dataB64: 'data:image/jpeg;base64,abc', name: 'a.jpg' } },
      { id: 2, pj: { dataB64: 'data:application/pdf;base64,def', name: 'b.pdf' } },
      { id: 3 }, // pas de PJ
      { id: 4, pjId: 99 }, // déjà migré
      { id: 5, pj: { dataB64: 'data:abc', name: 'c.png' }, _deleted: true } // tombstone
    ];
    const r = _planLegacyPjMigration(mvts);
    expect(r.total).toBe(2);
    expect(r.candidates).toHaveLength(2);
    expect(r.totalBytesLegacy).toBeGreaterThan(0);
  });

  it('null safe', () => {
    expect(_planLegacyPjMigration(null).total).toBe(0);
    expect(_planLegacyPjMigration(undefined).candidates).toEqual([]);
  });

  it('exclut les mouvements avec pjId déjà défini', () => {
    const mvts = [
      { id: 1, pj: { dataB64: 'abc', name: 'a.jpg' }, pjId: 100 }
    ];
    expect(_planLegacyPjMigration(mvts).total).toBe(0);
  });
});

describe('_attachmentOrphans', () => {
  it('détecte attachements sans binaire (ni idbKey ni driveFileId)', () => {
    const atts = [
      { id: 1, idbKey: 'k1', driveFileId: null },     // OK (cache local)
      { id: 2, idbKey: null, driveFileId: 'd1' },      // OK (Drive)
      { id: 3, idbKey: 'k2', driveFileId: 'd2' },      // OK (les deux)
      { id: 4, idbKey: null, driveFileId: null },      // ORPHELIN
      { id: 5, idbKey: null, driveFileId: null, _deleted: true } // exclu
    ];
    const orphans = _attachmentOrphans(atts);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe(4);
  });

  it('null safe', () => {
    expect(_attachmentOrphans(null)).toEqual([]);
  });
});

describe('Constantes exportées', () => {
  it('ATTACHMENT_PARENT_TYPES contient les 10 types attendus', () => {
    expect(ATTACHMENT_PARENT_TYPES).toContain('mouvement');
    expect(ATTACHMENT_PARENT_TYPES).toContain('logement');
    expect(ATTACHMENT_PARENT_TYPES).toContain('edl');
    expect(ATTACHMENT_PARENT_TYPES).toHaveLength(10);
  });

  it('ATTACHMENT_CATEGORIES = 9 sous-dossiers Drive', () => {
    expect(ATTACHMENT_CATEGORIES).toContain('documents');
    expect(ATTACHMENT_CATEGORIES).toContain('photos');
    expect(ATTACHMENT_CATEGORIES).toHaveLength(9);
  });

  it('ATTACHMENT_DEFAULT_MAX_SIZE = 10 Mo', () => {
    expect(ATTACHMENT_DEFAULT_MAX_SIZE).toBe(10 * 1024 * 1024);
  });
});
