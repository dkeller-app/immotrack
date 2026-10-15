/**
 * bank-regles-filet.test.js — REGLES-REFONTE : la migration des règles (ajout d'un id) pose le filet
 * pré-migration du STOCKAGE lot 2 (`_filetAvantMigration`) AVANT de modifier la base, et seulement
 * s'il y a réellement une règle à migrer. On EXÉCUTE la vraie `_bankMigrerRegles` de js/app/app-part1.js
 * avec le vrai module js/core/bank-import.js derrière `window`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import * as Bank from '../../js/core/bank-import.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/app/app-part1.js'), 'utf8').replace(/\r\n/g, '\n');
const m = /\nfunction _bankMigrerRegles\(/.exec(SRC);
const CODE = SRC.slice(m.index + 1, SRC.indexOf('\n}\n', m.index + 1) + 2);

function sandbox(db) {
  const calls = [];
  const snap = [];
  const window = Object.assign({}, Bank);
  const _filetAvantMigration = (label) => { calls.push(label); snap.push(JSON.stringify(db.importRules)); return Promise.resolve(null); };
  const fn = new Function('DB', 'window', '_filetAvantMigration', CODE + '\nreturn _bankMigrerRegles;')(db, window, _filetAvantMigration);
  return { fn, calls, snap };
}

describe('filet avant migration des règles', () => {
  it('pose le filet AVANT la migration quand une règle vivante n\'a pas d\'id', () => {
    const db = { importRules: [{ pattern: 'EDF', cat: 'Charges', compte: '' }, { pattern: 'X', _deleted: true }] };
    const { fn, calls, snap } = sandbox(db);
    const r = fn('démarrage');
    expect(calls).toEqual(['regles-ids']);
    expect(JSON.parse(snap[0])[0].id).toBeUndefined();   // le filet voit la base d'AVANT
    expect(r.migrated).toBe(1);
    expect(db.importRules[0].id).toMatch(/^rg_/);
  });
  it('ne pose pas de filet quand tout est déjà migré (idempotent, pas de copie à chaque démarrage)', () => {
    const db = { importRules: [{ id: 'rg_1', pattern: 'EDF', compte: 'cic' }, { pattern: 'Z', _deleted: true }] };
    const { fn, calls } = sandbox(db);
    fn('démarrage');
    expect(calls).toEqual([]);
  });
  it('ne pose pas de filet sans règles, ni sur une base qui n\'est pas la base courante', () => {
    const vide = sandbox({ importRules: [] });
    vide.fn('démarrage');
    expect(vide.calls).toEqual([]);
    const db = { importRules: [{ pattern: 'EDF' }] };
    const autre = sandbox(db);
    autre.fn('import', { importRules: [{ pattern: 'EDF' }] });
    expect(autre.calls).toEqual([]);
  });
  it('un filet qui plante ne bloque jamais la migration', () => {
    const db = { importRules: [{ pattern: 'EDF' }] };
    const window = Object.assign({}, Bank);
    const fn = new Function('DB', 'window', '_filetAvantMigration', CODE + '\nreturn _bankMigrerRegles;')(db, window, () => { throw new Error('idb'); });
    expect(() => fn('démarrage')).not.toThrow();
    expect(db.importRules[0].id).toMatch(/^rg_/);
  });
});
