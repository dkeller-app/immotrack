/**
 * __tests__/helpers/purge-medias-edl.test.js — EDL-VIDEO-IA : purge planifiée des vidéos à échéance (0058).
 * Ligne d'abord (la base ne supprime que ce qui est encore à échéance), fichier ensuite ; journal sans contenu.
 */
import { describe, it, expect, vi } from 'vitest';
import { purger, interpreterSuppression } from '../../supabase/functions/purge-medias-edl/purge.js';

const lot = (n, d = 0) => Array.from({ length: n }, (_, i) => ({ id: 'id' + (i + d), storage_path: `e/s/files/vid_${i + d}.webm` }));

describe('purge des médias d’EDL à échéance', () => {
  it('supprime les lignes encore à échéance, PUIS efface leurs fichiers', async () => {
    const aPurger = vi.fn().mockResolvedValueOnce(lot(3)).mockResolvedValueOnce([]);
    const supprimer = vi.fn(async (ids) => ids.map((id) => `e/s/files/vid_${id.slice(2)}.webm`));
    const effacer = vi.fn(async (ch) => ({ effaces: ch, echecs: [] }));
    const b = await purger({ aPurger, effacer, supprimer, limite: 3 });
    expect(b).toEqual({ lus: 3, lignes: 3, fichiers: 3, echecs: 0, erreurs: 0 });
    expect(supprimer).toHaveBeenCalledWith(['id0', 'id1', 'id2']);
    expect(supprimer.mock.invocationCallOrder[0]).toBeLessThan(effacer.mock.invocationCallOrder[0]);
  });
  it('un gel posé entre-temps : la base garde la ligne, son fichier n’est PAS effacé', async () => {
    const effacer = vi.fn(async (ch) => ({ effaces: ch, echecs: [] }));
    const b = await purger({ aPurger: async () => lot(3), supprimer: async () => ['e/s/files/vid_0.webm', 'e/s/files/vid_2.webm'], effacer });
    expect(effacer).toHaveBeenCalledWith(['e/s/files/vid_0.webm', 'e/s/files/vid_2.webm']);
    expect(b).toMatchObject({ lignes: 2, fichiers: 2 });
  });
  it('fichier qui résiste : compté (sur-conservation à reprendre), jamais l’inverse', async () => {
    const b = await purger({ aPurger: async () => lot(2), supprimer: async (ids) => ids.map((i) => i), effacer: async (ch) => ({ effaces: [ch[0]], echecs: [ch[1]] }) });
    expect(b).toMatchObject({ lignes: 2, fichiers: 1, echecs: 1 });
  });
  it('panne de la base : rien n’est effacé, erreur comptée', async () => {
    const effacer = vi.fn();
    expect((await purger({ aPurger: async () => { throw new Error('x'); }, effacer, supprimer: vi.fn() })).erreurs).toBe(1);
    expect((await purger({ aPurger: async () => lot(2), supprimer: async () => { throw new Error('x'); }, effacer })).erreurs).toBe(1);
    expect(effacer).not.toHaveBeenCalled();
  });
  it('plusieurs lots pleins, borné en nombre de tours', async () => {
    let d = 0;
    const b = await purger({ aPurger: async (n) => { const l = lot(n, d); d += n; return l; }, supprimer: async (ids) => ids, effacer: async (ch) => ({ effaces: ch }), limite: 2, tours: 3 });
    expect(b.lignes).toBe(6);
  });
  it('interpréter storage.remove : absent = effacé ; présent = échec ; erreur = tout en échec', async () => {
    const ch = ['a', 'b', 'c'];
    expect(await interpreterSuppression(ch, [{ name: 'a' }], null, async (p) => p === 'c')).toEqual({ effaces: ['a', 'b'], echecs: ['c'] });
    expect(await interpreterSuppression(ch, null, { message: 'x' }, async () => true)).toEqual({ effaces: [], echecs: ch });
  });
});
