/**
 * _mvCreate — module pur js/core/mv-create.js + parité du shadow inline (app-part1.js).
 *
 *   M-1  défaut : horodatage → audit (lib || fac || id) → push → saveDB → rafraîchissement.
 *   M-2  options : stamp:false, audit:'after'|false, auditLabel, save:false, refresh:false.
 *   M-3  dépendances absentes (audit, saveDB, refresh) : ignorées, jamais d'exception.
 *   M-4  le shadow inline se comporte EXACTEMENT comme le module, pour toutes les options.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireFonction } from './_extraction-source.js';
import { mvCreate } from '../../js/core/mv-create.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8');
const shadow = new Function(extraireFonction(P1, '_mvCreateShadow') + '\nreturn _mvCreateShadow;')();

function deps(ev, partiel) {
  const mouvements = [];
  const d = {
    mouvements: { push: (m) => { ev.push(['push', m.id]); mouvements.push(m); } },
    stamp: (m) => { m._modifiedAt = 'T'; ev.push(['stamp', m.id]); },
    auditLog: (...a) => ev.push(['audit', ...a]),
    saveDB: () => ev.push(['save']),
    refresh: () => ev.push(['refresh']),
  };
  if (partiel) partiel.forEach((k) => { delete d[k]; });
  return d;
}

describe('M · mvCreate', () => {
  it('M-1 défaut : stamp, audit avant, push, save, refresh', () => {
    const ev = [];
    const m = mvCreate({ id: 7, lib: 'Ballon', fac: 'F1' }, deps(ev));
    expect(m._modifiedAt).toBe('T');
    expect(ev).toEqual([['stamp', 7], ['audit', 'create', 'mouvement', 7, 'Ballon'], ['push', 7], ['save'], ['refresh']]);
  });
  it('M-1 libellé d\'audit : lib, sinon fac, sinon id', () => {
    const ev = [];
    mvCreate({ id: 8, fac: 'F2' }, deps(ev), { stamp: false, save: false, refresh: false });
    mvCreate({ id: 9 }, deps(ev), { stamp: false, save: false, refresh: false });
    expect(ev.filter((e) => e[0] === 'audit').map((e) => e[4])).toEqual(['F2', '9']);
  });
  it('M-2 options : audit après, libellé imposé, sans save ni refresh', () => {
    const ev = [];
    mvCreate({ id: 1, lib: 'X' }, deps(ev), { audit: 'after', auditLabel: 'X (bank_import)', save: false, refresh: false });
    expect(ev).toEqual([['stamp', 1], ['push', 1], ['audit', 'create', 'mouvement', 1, 'X (bank_import)']]);
  });
  it('M-2 options : ni stamp ni audit (migration de démarrage)', () => {
    const ev = [];
    const m = mvCreate({ id: 2, _modifiedAt: 'déjà' }, deps(ev), { stamp: false, audit: false, save: false, refresh: false });
    expect(ev).toEqual([['push', 2]]);
    expect(m._modifiedAt).toBe('déjà');
  });
  it('M-3 dépendances absentes : ignorées', () => {
    const ev = [];
    expect(() => mvCreate({ id: 3 }, deps(ev, ['auditLog', 'saveDB', 'refresh', 'stamp']))).not.toThrow();
    expect(ev).toEqual([['push', 3]]);
  });
  it('M-4 parité du shadow inline : mêmes effets pour toutes les combinaisons d\'options', () => {
    const vals = { stamp: [undefined, true, false], audit: [undefined, 'before', 'after', false], save: [undefined, false], refresh: [undefined, false], auditLabel: [undefined, 'L'] };
    let n = 0;
    for (const stamp of vals.stamp) for (const audit of vals.audit) for (const save of vals.save) for (const refresh of vals.refresh) for (const auditLabel of vals.auditLabel) {
      const opts = { stamp, audit, save, refresh, auditLabel };
      const a = [], b = [];
      const ma = mvCreate({ id: 5, lib: 'M' }, deps(a), opts);
      const mb = shadow({ id: 5, lib: 'M' }, deps(b), opts);
      expect(b).toEqual(a);
      expect(mb).toEqual(ma);
      n++;
    }
    expect(n).toBe(96);
    // sans options du tout
    const a = [], b = [];
    mvCreate({ id: 6 }, deps(a)); shadow({ id: 6 }, deps(b));
    expect(b).toEqual(a);
  });
  it('M-4 le shadow est le même texte que le module (corps identique)', () => {
    const src = readFileSync(resolve(root, 'js/core/mv-create.js'), 'utf8');
    const corps = (s, nom) => extraireFonction(s, nom).replace(/^[^{]*\{/, '').replace(/\s+/g, ' ').trim();
    expect(corps(P1, '_mvCreateShadow')).toBe(corps(src, 'mvCreate'));
  });
});
