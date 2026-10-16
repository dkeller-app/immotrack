// __tests__/helpers/lecture-photo-client.test.js — LECTURE-PHOTOS : client du lecteur (Worker de module, repli sur le fil
// principal, délai). Doublure de Worker : le parcours réel est vérifié au geste dans Chrome sans tête.
import { describe, it, expect, vi } from 'vitest';
import { clientLecturePhoto, sourceVersGris } from '../../js/core/lecture-photo-client.js';

function fauxWorker(repondre) {
  const w = { messages: [], termine: false, onmessage: null, onerror: null };
  w.postMessage = (m, transfert) => { w.messages.push({ m, transfert }); Promise.resolve().then(() => repondre && repondre(w, m)); };
  w.terminate = () => { w.termine = true; };
  return w;
}
const G = { w: 2, h: 1, d: new Uint8Array([10, 200]) };

describe('clientLecturePhoto', () => {
  it('envoie une COPIE des pixels au Worker (transférée) et rend sa réponse', async () => {
    const w = fauxWorker((ww, m) => ww.onmessage({ data: { id: m.id, texte: 'DC04X', etape: 'grille', essais: 3, nettete: 1.5 } }));
    const c = clientLecturePhoto({ creerWorker: () => w });
    const r = await c.lire(G, { essais: 10, nettete: true });
    expect(r).toMatchObject({ texte: 'DC04X', etape: 'grille', nettete: 1.5 });
    expect(w.messages[0].m).toMatchObject({ w: 2, h: 1, opts: { essais: 10, nettete: true } });
    expect(w.messages[0].transfert).toHaveLength(1);
    expect(Array.from(G.d)).toEqual([10, 200]);                       // l'image de l'appelant est intacte
  });
  it('un seul Worker pour plusieurs lectures ; réponses rendues à la bonne demande', async () => {
    let n = 0; const w = fauxWorker((ww, m) => ww.onmessage({ data: { id: m.id, texte: 'DC0' + m.id } }));
    const c = clientLecturePhoto({ creerWorker: () => { n++; return w; } });
    const [a, b] = await Promise.all([c.lire(G), c.lire(G)]);
    expect(n).toBe(1); expect(a.texte).not.toBe(b.texte);
  });
  it('Worker impossible à créer (navigateur ancien) → repli sur le fil principal', async () => {
    const repli = vi.fn(async () => ({ texte: 'DC04R', etape: 'entier', essais: 1 }));
    const c = clientLecturePhoto({ creerWorker: () => { throw new Error('module workers'); }, repli });
    expect((await c.lire(G)).texte).toBe('DC04R'); expect(repli).toHaveBeenCalledTimes(1);
  });
  it('erreur du Worker (chargement du module) → demandes en cours et suivantes passent au repli', async () => {
    const w = fauxWorker((ww) => ww.onerror(new Event('error')));
    const repli = vi.fn(async () => ({ texte: null, etape: null, essais: 0 }));
    const c = clientLecturePhoto({ creerWorker: () => w, repli });
    await c.lire(G); await c.lire(G);
    expect(repli).toHaveBeenCalledTimes(2); expect(w.termine).toBe(true);
  });
  it('sans Worker ni repli → aucune lecture, marquée « indisponible » (jamais confondue avec « aucun code »)', async () => {
    expect(await clientLecturePhoto({}).lire(G)).toMatchObject({ texte: null, indisponible: true });
  });
  it('réponse trop lente → null au bout du délai (la page n\'attend jamais indéfiniment)', async () => {
    vi.useFakeTimers();
    const crees = []; const c = clientLecturePhoto({ creerWorker: () => { const w = fauxWorker(null); crees.push(w); return w; }, delaiMs: 1000 });
    const p = c.lire(G); const p2 = c.lire(G); await vi.advanceTimersByTimeAsync(1100);
    expect(await p).toMatchObject({ texte: null, delai: true }); expect(await p2).toMatchObject({ texte: null, delai: true });
    expect(crees[0].termine).toBe(true);                               // travail orphelin arrêté
    c.lire(G); expect(crees).toHaveLength(2);                          // nouveau Worker (pas de passage au repli)
    vi.useRealTimers();
  });
  it('lecture arrêtée faute de temps dans le Worker → « interrompu » transmis', async () => {
    const w = fauxWorker((ww, m) => ww.onmessage({ data: { id: m.id, texte: null, interrompu: true } }));
    expect(await clientLecturePhoto({ creerWorker: () => w }).lire(G)).toMatchObject({ texte: null, interrompu: true });
  });
  it('le Worker répond une erreur de lecture → null', async () => {
    const w = fauxWorker((ww, m) => ww.onmessage({ data: { id: m.id, erreur: 'boom' } }));
    expect(await clientLecturePhoto({ creerWorker: () => w }).lire(G)).toMatchObject({ texte: null, interrompu: true });
  });
});

describe('sourceVersGris', () => {
  const canvas = (w, h) => { const c = { width: w, height: h, appels: [] };
    c.getContext = () => ({ fillStyle: '', fillRect: (...a) => c.appels.push(['fillRect', ...a]), drawImage: (...a) => c.appels.push(['drawImage', ...a]),
      getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }) }); return c; };
  it('réduit à 3 000 px au plus, fond blanc, puis niveaux de gris', () => {
    const g = sourceVersGris({ tag: 'img' }, 6000, 4000, canvas);
    expect([g.w, g.h]).toEqual([3000, 2000]); expect(g.d[0]).toBe(255);
  });
  it('image petite : taille d\'origine', () => {
    const g = sourceVersGris({}, 800, 600, canvas, 3000); expect([g.w, g.h]).toEqual([800, 600]);
  });
});
