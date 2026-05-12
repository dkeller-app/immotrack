import { describe, it, expect, beforeEach } from 'vitest';
import { _logError, _logEvent, _exportMonitoringLogs, _clearMonitoringLogs } from '../../js/core/monitoring.js';

beforeEach(() => {
  globalThis.window = {
    DB: { params: { monitoringEnabled: true } },
    addEventListener: () => {}
  };
  // navigator/location sont undefined en Node — le module monitoring est null-safe
});

describe('_logError', () => {
  it('capture une erreur dans DB.errorLog si enabled', () => {
    const e = _logError(new Error('Boom'), { filename: 'app.js', lineno: 42 });
    expect(e.message).toBe('Boom');
    expect(e.file).toBe('app.js');
    expect(e.line).toBe(42);
    expect(window.DB.errorLog).toHaveLength(1);
  });

  it('no-op si monitoringEnabled = false', () => {
    window.DB.params.monitoringEnabled = false;
    expect(_logError(new Error('x'))).toBeNull();
    expect(window.DB.errorLog).toBeUndefined();
  });

  it('no-op si DB absent', () => {
    delete window.DB;
    expect(_logError(new Error('x'))).toBeNull();
  });

  it('tronque les messages > 500 chars', () => {
    const longMsg = 'a'.repeat(700);
    const e = _logError(new Error(longMsg));
    expect(e.message.length).toBe(500);
  });

  it('tronque les stack traces > 1500 chars', () => {
    const err = new Error('x');
    err.stack = 'a'.repeat(2000);
    const e = _logError(err);
    expect(e.stack.length).toBe(1500);
  });

  it('anonymise userAgent + pathname via hash', () => {
    const e = _logError(new Error('x'));
    expect(e.pathHash).toMatch(/^[a-f0-9]+$/);
    expect(e.uaHash).toMatch(/^[a-f0-9]+$/);
    // pathHash et uaHash sont des hashes même quand l'input est vide (Node test)
    // → on vérifie juste qu'ils sont des strings hex (pas de userAgent leak)
  });

  it('cap soft 200 entrées → keep last 100', () => {
    window.DB.errorLog = new Array(250).fill({ ts: 'x', message: 'old' });
    _logError(new Error('new'));
    expect(window.DB.errorLog.length).toBeLessThanOrEqual(101);
  });

  it('coerce string errors sans crash', () => {
    expect(() => _logError('Plain string')).not.toThrow();
    const e = _logError('Plain string');
    expect(e.message).toBe('Plain string');
  });
});

describe('_logEvent', () => {
  it('capture un event dans DB.eventLog si enabled', () => {
    const e = _logEvent('page_view', { tab: 'dashboard' });
    expect(e.name).toBe('page_view');
    expect(e.props.tab).toBe('dashboard');
    expect(window.DB.eventLog).toHaveLength(1);
  });

  it('no-op si désactivé', () => {
    window.DB.params.monitoringEnabled = false;
    expect(_logEvent('x')).toBeNull();
  });

  it('cap soft 500 entrées', () => {
    window.DB.eventLog = new Array(600).fill({ ts: 'x', name: 'old' });
    _logEvent('new');
    expect(window.DB.eventLog.length).toBeLessThanOrEqual(251);
  });

  it('tronque name > 100 chars', () => {
    const e = _logEvent('a'.repeat(200));
    expect(e.name.length).toBe(100);
  });
});

describe('_exportMonitoringLogs', () => {
  it('exporte JSON structuré', () => {
    window.DB.errorLog = [{ ts: 'x', message: 'test' }];
    window.DB.eventLog = [{ ts: 'y', name: 'evt' }];
    const json = _exportMonitoringLogs(window.DB);
    const p = JSON.parse(json);
    expect(p._meta.app).toBe('ImmoTrack');
    expect(p.errorLog).toHaveLength(1);
    expect(p.eventLog).toHaveLength(1);
  });

  it('null safe', () => {
    const json = _exportMonitoringLogs(null);
    expect(JSON.parse(json).errorLog).toEqual([]);
  });
});

describe('_clearMonitoringLogs', () => {
  it('efface tous les logs', () => {
    window.DB.errorLog = [{ ts: 'x' }, { ts: 'y' }];
    window.DB.eventLog = [{ ts: 'z' }];
    const r = _clearMonitoringLogs(window.DB);
    expect(r.cleared).toBe(3);
    expect(window.DB.errorLog).toEqual([]);
    expect(window.DB.eventLog).toEqual([]);
  });

  it('null safe', () => {
    expect(_clearMonitoringLogs(null).cleared).toBe(0);
  });
});
