import { describe, it, expect, beforeEach } from 'vitest';
import {
  _auditEntry, _diffShallow, _auditFilter, _auditToCsv, _auditClean
} from '../../js/core/audit-trail.js';

beforeEach(() => {
  globalThis.window = { DB: { params: { userId: 'usr_test', userName: 'Didier Test' } } };
});

describe('_auditEntry', () => {
  it('crée une entrée minimale', () => {
    const e = _auditEntry({ action: 'create', entityType: 'logement', entityId: 1, entityRef: 'F-001' });
    expect(e.action).toBe('create');
    expect(e.entityType).toBe('logement');
    expect(e.entityId).toBe(1);
    expect(e.entityRef).toBe('F-001');
    expect(e.userId).toBe('usr_test');
    expect(e.userName).toBe('Didier Test');
    expect(e.source).toBe('ui');
    expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('source par défaut = ui, override possible', () => {
    expect(_auditEntry({ action: 'update', entityType: 'bail' }).source).toBe('ui');
    expect(_auditEntry({ action: 'update', entityType: 'bail', source: 'drive_sync' }).source).toBe('drive_sync');
    expect(_auditEntry({ action: 'update', entityType: 'bail', source: 'import' }).source).toBe('import');
  });

  it('throw si action manquante', () => {
    expect(() => _auditEntry({ entityType: 'bail' })).toThrow(/action.*obligatoires/);
  });

  it('throw si entityType manquant', () => {
    expect(() => _auditEntry({ action: 'create' })).toThrow(/obligatoires/);
  });

  it('inclut diff si fourni', () => {
    const e = _auditEntry({ action: 'update', entityType: 'bail', diff: { hc: { from: 800, to: 825 } } });
    expect(e.diff).toEqual({ hc: { from: 800, to: 825 } });
  });

  it('userId fallback = anonymous si window.DB absent', () => {
    globalThis.window = {};
    const e = _auditEntry({ action: 'create', entityType: 'logement' });
    expect(e.userId).toBe('anonymous');
  });

  it('génère userId si DB.params.userId manquant', () => {
    globalThis.window = { DB: { params: {} } };
    const e = _auditEntry({ action: 'create', entityType: 'logement' });
    expect(e.userId).toMatch(/^usr_/);
    // Le génère et le persiste
    expect(globalThis.window.DB.params.userId).toBe(e.userId);
  });

  it('userName fallback = "Utilisateur" si pas configuré', () => {
    globalThis.window = { DB: { params: { userId: 'x' } } };
    const e = _auditEntry({ action: 'create', entityType: 'logement' });
    expect(e.userName).toBe('Utilisateur');
  });
});

describe('_diffShallow', () => {
  it('détecte modification simple', () => {
    const d = _diffShallow({ hc: 800 }, { hc: 825 });
    expect(d.hc).toEqual({ from: 800, to: 825 });
  });

  it('ignore les clés inchangées', () => {
    const d = _diffShallow({ hc: 800, ch: 50 }, { hc: 825, ch: 50 });
    expect(d.ch).toBeUndefined();
  });

  it('détecte les ajouts et suppressions', () => {
    const d = _diffShallow({ hc: 800 }, { hc: 800, dpe: 'D' });
    expect(d.dpe).toEqual({ from: undefined, to: 'D' });
    const d2 = _diffShallow({ hc: 800, fin: '2025-12-31' }, { hc: 800 });
    expect(d2.fin).toEqual({ from: '2025-12-31', to: undefined });
  });

  it('skip les champs internes _', () => {
    const d = _diffShallow({ hc: 800, _modifiedAt: '2025' }, { hc: 825, _modifiedAt: '2026' });
    expect(d._modifiedAt).toBeUndefined();
    expect(d.hc).toBeDefined();
  });

  it('skip signatures et photos (binaire lourd)', () => {
    const before = { hc: 800, signatures: { x: 'data:image/png;base64,AAAAA...' } };
    const after = { hc: 825, signatures: { x: 'data:image/png;base64,BBBBB...' } };
    const d = _diffShallow(before, after);
    expect(d.signatures).toBeUndefined();
    expect(d.hc).toBeDefined();
  });

  it('tronque les strings > 200 chars', () => {
    const longStr = 'a'.repeat(300);
    const d = _diffShallow({ note: 'court' }, { note: longStr });
    expect(d.note.to.length).toBeLessThan(longStr.length);
    expect(d.note.to).toMatch(/300 chars/);
  });

  it('respecte maxKeys + flag __truncated', () => {
    const before = {};
    const after = {};
    for (let i = 0; i < 30; i++) { before['k' + i] = 0; after['k' + i] = i + 1; }
    const d = _diffShallow(before, after, 5);
    expect(d.__truncated).toBe(true);
    expect(Object.keys(d).filter(k => k !== '__truncated').length).toBe(5);
  });

  it('null-safe', () => {
    expect(_diffShallow(null, { hc: 800 })).toEqual({});
    expect(_diffShallow({ hc: 800 }, null)).toEqual({});
  });
});

describe('_auditFilter', () => {
  const entries = [
    { ts: '2026-01-15T10:00:00Z', action: 'create', entityType: 'bail', userId: 'u1' },
    { ts: '2026-02-15T10:00:00Z', action: 'update', entityType: 'bail', userId: 'u1' },
    { ts: '2026-02-20T10:00:00Z', action: 'delete', entityType: 'mouvement', userId: 'u2' },
    { ts: '2026-03-10T10:00:00Z', action: 'create', entityType: 'logement', userId: 'u1' }
  ];

  it('filtre par date from/to', () => {
    expect(_auditFilter(entries, { from: '2026-02-01', to: '2026-02-28' })).toHaveLength(2);
  });

  it('filtre par entityType', () => {
    expect(_auditFilter(entries, { entityType: 'bail' })).toHaveLength(2);
  });

  it('filtre par action', () => {
    expect(_auditFilter(entries, { action: 'delete' })).toHaveLength(1);
  });

  it('filtre par userId', () => {
    expect(_auditFilter(entries, { userId: 'u2' })).toHaveLength(1);
  });

  it('combine plusieurs filtres', () => {
    const r = _auditFilter(entries, { action: 'create', entityType: 'bail' });
    expect(r).toHaveLength(1);
  });

  it('null/undefined safe', () => {
    expect(_auditFilter(null, {})).toEqual([]);
    expect(_auditFilter(undefined, {})).toEqual([]);
  });
});

describe('_auditToCsv', () => {
  it('génère CSV avec header', () => {
    const entries = [
      { ts: '2026-01-15T10:00:00Z', userId: 'u1', userName: 'Didier', action: 'create', entityType: 'bail', entityId: 1, entityRef: 'F-001' }
    ];
    const csv = _auditToCsv(entries);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('ts,userId,userName,action,entityType,entityId,entityRef,source,diff');
    expect(lines[1]).toContain('Didier');
    expect(lines[1]).toContain('F-001');
  });

  it('escape les virgules dans userName', () => {
    const entries = [{ ts: 'x', userId: 'u', userName: 'Dupont, Marie', action: 'a', entityType: 'b' }];
    const csv = _auditToCsv(entries);
    expect(csv).toContain('"Dupont, Marie"');
  });

  it('escape les guillemets dans valeur', () => {
    const entries = [{ ts: 'x', userId: 'u', userName: 'A"B', action: 'a', entityType: 'b' }];
    const csv = _auditToCsv(entries);
    expect(csv).toContain('"A""B"');
  });

  it('export vide → juste header', () => {
    expect(_auditToCsv([]).split('\n')).toHaveLength(1);
  });

  it('null-safe', () => {
    expect(_auditToCsv(null)).toContain('ts,userId');
  });
});

describe('_auditClean', () => {
  it('garde les entrées valides', () => {
    const e = [{ ts: 'x', action: 'a', entityType: 'b' }];
    expect(_auditClean(e)).toHaveLength(1);
  });

  it('rejette les entrées sans ts', () => {
    const e = [{ action: 'a', entityType: 'b' }, { ts: 'x', action: 'a', entityType: 'b' }];
    expect(_auditClean(e)).toHaveLength(1);
  });

  it('rejette les non-objets', () => {
    const e = [null, undefined, 'string', { ts: 'x', action: 'a', entityType: 'b' }];
    expect(_auditClean(e)).toHaveLength(1);
  });
});
