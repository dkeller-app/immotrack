/**
 * __tests__/helpers/purge-medias-edl.test.js — EDL-VIDEO-IA : purge planifiée des vidéos à échéance (0058).
 * Fichier d'abord, ligne ensuite ; un fichier qui résiste garde sa ligne ; journal sans contenu.
 */
import { describe, it, expect, vi } from 'vitest';
import { purger, interpreterSuppression } from '../../supabase/functions/purge-medias-edl/purge.js';

const lot = (n, d = 0) => Array.from({ length: n }, (_, i) => ({ id: 'id' + (i + d), storage_path: `e/s/files/vid_${i + d}.webm` }));

describe('purge des médias d’EDL à échéance', () => {
  it('efface les fichiers puis les lignes correspondantes', async () => {
    const aPurger = vi.fn().mockResolvedValueOnce(lot(3)).mockResolvedValueOnce([]);
    const effacer = vi.fn(async (ch) => ({ effaces: ch, echecs: [] }));
    const supprimer = vi.fn(async () => ({ ok: true }));
    const b = await purger({ aPurger, effacer, supprimer, limite: 3 });
    expect(b).toEqual({ lus: 3, fichiers: 3, lignes: 3, echecs: 0, erreurs: 0 });
    expect(supprimer).toHaveBeenCalledWith(['id0', 'id1', 'id2']);
    expect(effacer.mock.invocationCallOrder[0]).toBeLessThan(supprimer.mock.invocationCallOrder[0]);
  });
  it('un fichier qui ne s’efface pas garde sa ligne (retenté au prochain passage)', async () => {
    const supprimer = vi.fn(async () => ({ ok: true }));
    const b = await purger({ aPurger: async () => lot(3), effacer: async (ch) => ({ effaces: [ch[0], ch[2]], echecs: [ch[1]] }), supprimer });
    expect(supprimer).toHaveBeenCalledWith(['id0', 'id2']);
    expect(b).toMatchObject({ fichiers: 2, lignes: 2, echecs: 1 });
  });
  it('panne de la base ou du stockage : rien n’est supprimé, erreur comptée', async () => {
    const supprimer = vi.fn();
    expect((await purger({ aPurger: async () => { throw new Error('x'); }, effacer: vi.fn(), supprimer })).erreurs).toBe(1);
    expect((await purger({ aPurger: async () => lot(2), effacer: async () => { throw new Error('x'); }, supprimer })).erreurs).toBe(1);
    expect(supprimer).not.toHaveBeenCalled();
  });
  it('plusieurs lots pleins, borné en nombre de tours', async () => {
    let d = 0;
    const b = await purger({ aPurger: async (n) => { const l = lot(n, d); d += n; return l; }, effacer: async (ch) => ({ effaces: ch }), supprimer: async () => ({ ok: true }), limite: 2, tours: 3 });
    expect(b.lignes).toBe(6);
  });
  it('interpréter storage.remove : absent = effacé ; présent = échec ; erreur = tout en échec', async () => {
    const ch = ['a', 'b', 'c'];
    expect(await interpreterSuppression(ch, [{ name: 'a' }], null, async (p) => p === 'c')).toEqual({ effaces: ['a', 'b'], echecs: ['c'] });
    expect(await interpreterSuppression(ch, null, { message: 'x' }, async () => true)).toEqual({ effaces: [], echecs: ch });
  });
});
