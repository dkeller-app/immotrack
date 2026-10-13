/**
 * __tests__/helpers/ia-file-attente.test.js — chantier EDL-VOIX-IA, lot B1 : file des dictées.
 * Invariants : jamais de perte silencieuse ; audio supprimé dès la transcription réussie ; une seule
 * dictée traitée à la fois ; reprise au retour du réseau ; jamais d'exception vers l'app.
 */
import { describe, it, expect, vi } from 'vitest';
import { creerFileDictees, storeMemoire, ETAPES, PURGE_JOURS } from '../../js/core/ia-file-attente.js';

const ENTREE = { piece: 'Cuisine', mode: 'entree', elements: [{ id: '0', nom: 'Sol', note: false }] };
const RESULTAT = { propositions: [{ elementId: '0', etat: null, observation: 'Carrelage.', source: 'sol', justification: null, aVerifier: null }], aAjouter: [], compteurs: [], corrections: [] };

function faux({ transcrire, structurer } = {}) {
  return {
    transcrire: vi.fn(transcrire || (async () => ({ ok: true, text: 'sol carrelage', segments: [], audioSec: 4, modele: 'v' }))),
    structurer: vi.fn(structurer || (async () => ({ ok: true, data: RESULTAT, rejets: 0, modele: 'm' }))),
  };
}
const audio = () => new Uint8Array([1, 2, 3, 4]).buffer;
const blobFaux = (buf, type) => ({ buf, type });

describe('file des dictées', () => {
  it('ajouter → traiter : transcription puis propositions ; l’audio est supprimé dès la transcription', async () => {
    const store = storeMemoire(); const client = faux();
    const f = creerFileDictees({ store, client, creerBlob: blobFaux });
    const x = await f.ajouter({ audio: audio(), mime: 'audio/webm', duree: 54, entree: ENTREE, contexte: { edlId: '7' } });
    expect(x.etape).toBe(ETAPES.AUDIO);
    expect(x.taille).toBe(4);
    const b = await f.traiter();
    expect(b).toEqual({ traitees: 1, pretes: 1, erreurs: 0 });
    const y = await f.get(x.id);
    expect(y.etape).toBe(ETAPES.PRET);
    expect(y.audio).toBe(null);                       // l'audio n'est pas conservé
    expect(y.texte).toBe('sol carrelage');
    expect(y.resultat).toEqual(RESULTAT);
    expect(client.transcrire.mock.calls[0][0]).toEqual({ buf: x.audio, type: 'audio/webm' });
    expect(client.structurer.mock.calls[0]).toEqual(['edl-piece', { ...ENTREE, texte: 'sol carrelage' }]);
  });

  it('hors ligne : la dictée reste en attente, intacte, et repart au passage suivant', async () => {
    let enLigne = false;
    const client = faux({ transcrire: async () => (enLigne ? { ok: true, text: 'sol', segments: [], audioSec: 1 } : { ok: false, code: 'offline' }) });
    const f = creerFileDictees({ store: storeMemoire(), client, creerBlob: blobFaux });
    const x = await f.ajouter({ audio: audio(), mime: 'audio/mp4', entree: ENTREE });
    await f.traiter();
    let y = await f.get(x.id);
    expect(y.etape).toBe(ETAPES.AUDIO);
    expect(y.audio).not.toBe(null);                   // jamais de perte
    expect(y.erreur.code).toBe('offline');
    enLigne = true;
    await f.traiter();
    y = await f.get(x.id);
    expect(y.etape).toBe(ETAPES.PRET);
    expect(y.erreur).toBe(null);
  });

  it('erreur non réessayable (quota, format…) : la dictée attend un geste, puis « réessayer » la relance', async () => {
    let n = 0;
    const client = faux({ transcrire: async () => (n++ === 0 ? { ok: false, code: 'quota', motif: 'audio' } : { ok: true, text: 'x', segments: [] }) });
    const f = creerFileDictees({ store: storeMemoire(), client, creerBlob: blobFaux });
    const x = await f.ajouter({ audio: audio(), mime: 'audio/webm', entree: ENTREE });
    await f.traiter();
    await f.traiter();                                  // n'insiste pas tout seul
    expect(client.transcrire).toHaveBeenCalledTimes(1);
    expect((await f.get(x.id)).erreur).toMatchObject({ code: 'quota', motif: 'audio' });
    await f.reessayer(x.id);
    expect((await f.get(x.id)).etape).toBe(ETAPES.PRET);
  });

  it('rien entendu : l’audio est supprimé quand même, erreur « vide »', async () => {
    const f = creerFileDictees({ store: storeMemoire(), client: faux({ transcrire: async () => ({ ok: true, text: '   ', segments: [] }) }), creerBlob: blobFaux });
    const x = await f.ajouter({ audio: audio(), mime: 'audio/webm', entree: ENTREE });
    await f.traiter();
    const y = await f.get(x.id);
    expect(y.audio).toBe(null);
    expect(y.erreur.code).toBe('vide');
  });

  it('structuration en échec : la transcription est gardée, seule la structuration est retentée', async () => {
    let n = 0;
    const client = faux({ structurer: async () => (n++ === 0 ? { ok: false, code: 'unavailable' } : { ok: true, data: RESULTAT }) });
    const f = creerFileDictees({ store: storeMemoire(), client, creerBlob: blobFaux });
    const x = await f.ajouter({ audio: audio(), mime: 'audio/webm', entree: ENTREE });
    await f.traiter();
    expect((await f.get(x.id)).etape).toBe(ETAPES.TEXTE);
    await f.traiter();
    expect(client.transcrire).toHaveBeenCalledTimes(1);
    expect((await f.get(x.id)).etape).toBe(ETAPES.PRET);
  });

  it('une seule dictée traitée à la fois, dans l’ordre d’arrivée ; appels concurrents partagés', async () => {
    const ordre = []; let enVol = 0, max = 0;
    const client = faux({ transcrire: async (b) => { enVol++; max = Math.max(max, enVol); ordre.push(b.buf.byteLength); await new Promise((r) => setTimeout(r, 5)); enVol--; return { ok: true, text: 't', segments: [] }; } });
    let t = 0;
    const f = creerFileDictees({ store: storeMemoire(), client, creerBlob: blobFaux, maintenant: () => new Date(Date.UTC(2026, 9, 13, 10, 0, t++)) });
    await f.ajouter({ audio: new ArrayBuffer(1), mime: 'audio/webm', entree: ENTREE });
    await f.ajouter({ audio: new ArrayBuffer(2), mime: 'audio/webm', entree: ENTREE });
    const [a, b] = [f.traiter(), f.traiter()];
    expect(a).toBe(b);
    await a;
    expect(max).toBe(1);
    expect(ordre).toEqual([1, 2]);
  });

  it('client qui lève : jamais d’exception vers l’app, la dictée reste et sera retentée', async () => {
    const f = creerFileDictees({ store: storeMemoire(), client: faux({ transcrire: async () => { throw new Error('boom'); } }), creerBlob: blobFaux });
    await f.ajouter({ audio: audio(), mime: 'audio/webm', entree: ENTREE });
    expect(await f.traiter()).toEqual({ traitees: 1, pretes: 0, erreurs: 1 });
    const xs = await f.lister();
    expect(xs[0].audio).not.toBe(null);                 // toujours là
    expect(xs[0].erreur.code).toBe('unavailable');      // réessayable au prochain passage
  });

  it('onChange appelé à chaque étape ; une erreur de l’UI ne bloque pas la file', async () => {
    const vus = [];
    const f = creerFileDictees({ store: storeMemoire(), client: faux(), creerBlob: blobFaux, onChange: (x) => { vus.push(x && x.etape); throw new Error('ui'); } });
    await f.ajouter({ audio: audio(), mime: 'audio/webm', entree: ENTREE });
    await f.traiter();
    expect(vus).toEqual([ETAPES.AUDIO, ETAPES.TEXTE, ETAPES.PRET]);
  });

  it('décisions, contexte, suppression, purge des dictées abandonnées', async () => {
    let now = new Date('2026-10-13T10:00:00Z');
    const f = creerFileDictees({ store: storeMemoire(), client: faux(), creerBlob: blobFaux, maintenant: () => now });
    const x = await f.ajouter({ audio: audio(), mime: 'audio/webm', entree: ENTREE, contexte: { session: 's1' } });
    await f.decisions(x.id, { 0: 'ok' });
    await f.contexte(x.id, { edlId: '12' });
    const y = await f.get(x.id);
    expect(y.decisions).toEqual({ 0: 'ok' });
    expect(y.contexte).toEqual({ session: 's1', edlId: '12' });
    now = new Date(now.getTime() + (PURGE_JOURS + 1) * 86400000);
    const z = await f.ajouter({ audio: audio(), mime: 'audio/webm', entree: ENTREE });
    expect(await f.purger()).toBe(1);
    expect((await f.lister()).map((i) => i.id)).toEqual([z.id]);
    await f.supprimer(z.id);
    expect(await f.lister()).toEqual([]);
  });
});
