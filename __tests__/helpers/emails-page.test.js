/**
 * Tests pour EMAIL-ONGLET-PERMANENT v15.79 (Sprint 19B).
 * Module js/core/emails-page.js — helpers purs pour page Communications.
 */
import { describe, it, expect } from 'vitest';
import {
  _emailsSortDesc,
  _emailsGroupByMonth,
  _emailsFormatMonthLabel,
  _emailsCountByType,
  _emailsDashboardStats,
  _emailsFilter,
} from '../../js/core/emails-page.js';

const e = (sentAt, type, entityType, entityId) => ({
  id: 'em_' + Math.random().toString(36).slice(2,8),
  sentAt, type, entityType: entityType || 'logement', entityId: entityId || 'A101',
  to: 'test@example.com', status: 'proposed',
});

describe('_emailsSortDesc', () => {
  it('tri du plus récent au plus ancien', () => {
    const list = [
      e('2026-01-05T10:00:00Z', 'quittance'),
      e('2026-03-15T10:00:00Z', 'irl-revision'),
      e('2026-02-10T10:00:00Z', 'rappel-impaye-1'),
    ];
    const out = _emailsSortDesc(list);
    expect(out.map(x => x.type)).toEqual(['irl-revision', 'rappel-impaye-1', 'quittance']);
  });
  it('ne mute pas la liste source', () => {
    const list = [e('2026-01-01T10:00:00Z', 'a'), e('2026-02-01T10:00:00Z', 'b')];
    const snapshot = JSON.stringify(list);
    _emailsSortDesc(list);
    expect(JSON.stringify(list)).toBe(snapshot);
  });
  it('robustesse : non-array → []', () => {
    expect(_emailsSortDesc(null)).toEqual([]);
    expect(_emailsSortDesc(undefined)).toEqual([]);
    expect(_emailsSortDesc({})).toEqual([]);
  });
  it('skip entries null/sans sentAt → restent à la fin', () => {
    const list = [e('2026-02-01T10:00:00Z', 'a'), null, { type: 'no-date' }];
    const out = _emailsSortDesc(list);
    expect(out.length).toBe(3);
    expect(out[0].type).toBe('a');
  });
});

describe('_emailsFormatMonthLabel', () => {
  it('2026-05 → "Mai 2026"', () => {
    expect(_emailsFormatMonthLabel('2026-05')).toBe('Mai 2026');
  });
  it('2026-01 → "Janvier 2026"', () => {
    expect(_emailsFormatMonthLabel('2026-01')).toBe('Janvier 2026');
  });
  it('2026-12 → "Décembre 2026"', () => {
    expect(_emailsFormatMonthLabel('2026-12')).toBe('Décembre 2026');
  });
  it('format invalide → retourne l\'input', () => {
    expect(_emailsFormatMonthLabel('invalid')).toBe('invalid');
    expect(_emailsFormatMonthLabel('')).toBe('');
    expect(_emailsFormatMonthLabel(null)).toBe('');
  });
});

describe('_emailsGroupByMonth', () => {
  it('groupage + tri desc par mois', () => {
    const list = [
      e('2026-03-15T10:00:00Z', 'a'),
      e('2026-01-05T10:00:00Z', 'b'),
      e('2026-03-20T10:00:00Z', 'c'),
      e('2026-02-10T10:00:00Z', 'd'),
    ];
    const out = _emailsGroupByMonth(list);
    expect(out.map(g => g.key)).toEqual(['2026-03', '2026-02', '2026-01']);
    expect(out[0].emails.length).toBe(2);
    expect(out[0].label).toBe('Mars 2026');
  });
  it('tri desc à l\'intérieur de chaque mois', () => {
    const list = [
      e('2026-03-05T10:00:00Z', 'a'),
      e('2026-03-25T10:00:00Z', 'b'),
      e('2026-03-15T10:00:00Z', 'c'),
    ];
    const out = _emailsGroupByMonth(list);
    expect(out[0].emails.map(x => x.type)).toEqual(['b', 'c', 'a']);
  });
  it('skip entries sans sentAt valide', () => {
    const list = [e('2026-01-01T10:00:00Z', 'a'), { type: 'no-date' }, null];
    const out = _emailsGroupByMonth(list);
    expect(out.length).toBe(1);
    expect(out[0].emails.length).toBe(1);
  });
  it('non-array → []', () => {
    expect(_emailsGroupByMonth(null)).toEqual([]);
  });
});

describe('_emailsCountByType', () => {
  it('compte les emails par type', () => {
    const list = [e('2026-01-01T10:00:00Z', 'quittance'), e('2026-02-01T10:00:00Z', 'quittance'), e('2026-03-01T10:00:00Z', 'irl-revision')];
    expect(_emailsCountByType(list)).toEqual({ quittance: 2, 'irl-revision': 1 });
  });
  it('skip entries sans type', () => {
    expect(_emailsCountByType([{ sentAt: 'x' }, e('2026-01-01T10:00:00Z', 'a')])).toEqual({ a: 1 });
  });
  it('non-array → {}', () => {
    expect(_emailsCountByType(null)).toEqual({});
  });
});

describe('_emailsDashboardStats', () => {
  it('total + topTypes + byMonth', () => {
    const recentIso = new Date(Date.now() - 5 * 86400000).toISOString();
    const list = [
      { sentAt: recentIso, type: 'quittance' },
      { sentAt: recentIso, type: 'quittance' },
      { sentAt: recentIso, type: 'irl-revision' },
    ];
    const stats = _emailsDashboardStats(list);
    expect(stats.total).toBe(3);
    expect(stats.last30).toBe(3);
    expect(stats.topTypes[0]).toEqual({ type: 'quittance', n: 2 });
  });
  it('last30 et last90 séparés correctement', () => {
    const now = Date.now();
    const list = [
      { sentAt: new Date(now - 15 * 86400000).toISOString(), type: 'a' },     // 15j → last30 + last90
      { sentAt: new Date(now - 60 * 86400000).toISOString(), type: 'b' },     // 60j → last90 seul
      { sentAt: new Date(now - 120 * 86400000).toISOString(), type: 'c' },    // 120j → ni l'un ni l'autre
    ];
    const stats = _emailsDashboardStats(list);
    expect(stats.last30).toBe(1);
    expect(stats.last90).toBe(2);
    expect(stats.total).toBe(3);
  });
  it('byMonth limité à 6 mois', () => {
    const list = Array.from({length: 12}, (_, i) => {
      const month = String(i + 1).padStart(2, '0');
      return { sentAt: `2026-${month}-15T10:00:00Z`, type: 'x' };
    });
    expect(_emailsDashboardStats(list).byMonth.length).toBe(6);
  });
  it('liste vide → stats vides', () => {
    expect(_emailsDashboardStats([])).toEqual({ total: 0, last30: 0, last90: 0, byMonth: [], topTypes: [] });
  });
  it('non-array → stats vides', () => {
    expect(_emailsDashboardStats(null).total).toBe(0);
  });
});

describe('_emailsFilter', () => {
  const list = [
    e('2026-01-01T10:00:00Z', 'a', 'logement', 'L1'),
    e('2026-02-01T10:00:00Z', 'b', 'logement', 'L2'),
    e('2026-03-01T10:00:00Z', 'c', 'quittance', 'Q1'),
  ];
  it('sans filtre → tout', () => {
    expect(_emailsFilter(list).length).toBe(3);
  });
  it('filter par entityType', () => {
    expect(_emailsFilter(list, 'logement').length).toBe(2);
  });
  it('filter par entityType + entityId', () => {
    const out = _emailsFilter(list, 'logement', 'L1');
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('a');
  });
  it('robustesse non-array', () => {
    expect(_emailsFilter(null)).toEqual([]);
  });
});
