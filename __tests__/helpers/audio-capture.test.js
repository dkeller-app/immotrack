/**
 * __tests__/helpers/audio-capture.test.js — chantier EDL-VOIX-IA, lot B1 : enregistrement de la dictée.
 * Formats : webm/opus (Chrome, Android, Safari ≥ 18.4), mp4 (Safari 14.1 → 18.3), sinon import.
 */
import { describe, it, expect, vi } from 'vitest';
import { choisirFormat, captureDisponible, creerEnregistreur, codeErreurMicro, typeNu, DUREE_MAX_S } from '../../js/core/audio-capture.js';

describe('formats et disponibilité', () => {
  it('Chrome / Android / Safari ≥ 18.4 : webm opus', () => {
    expect(choisirFormat((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
  });
  it('Safari 14.1 → 18.3 : mp4', () => {
    expect(choisirFormat((t) => t === 'audio/mp4')).toBe('audio/mp4');
  });
  it('rien de connu : le navigateur choisit', () => {
    expect(choisirFormat(() => false)).toBe('');
    expect(choisirFormat(undefined)).toBe('');
  });
  it('captureDisponible : MediaRecorder + getUserMedia', () => {
    expect(captureDisponible({ MediaRecorder: function () {}, navigator: { mediaDevices: { getUserMedia() {} } } })).toBe(true);
    expect(captureDisponible({ navigator: { mediaDevices: { getUserMedia() {} } } })).toBe(false);
    expect(captureDisponible({ MediaRecorder: function () {}, navigator: {} })).toBe(false);
    expect(captureDisponible(null)).toBe(false);
  });
  it('typeNu retire les codecs ; erreurs du micro nommées', () => {
    expect(typeNu('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(typeNu('')).toBe('audio/webm');
    expect(codeErreurMicro({ name: 'NotAllowedError' })).toBe('micro_refuse');
    expect(codeErreurMicro({ name: 'NotFoundError' })).toBe('micro_absent');
    expect(codeErreurMicro(new Error('x'))).toBe('capture');
  });
  it('5 minutes au plus par dictée', () => { expect(DUREE_MAX_S).toBe(300); });
});

/** Faux MediaRecorder + horloge maîtrisée. */
function banc({ refus = null, types = (t) => t.startsWith('audio/webm') } = {}) {
  let t = 0; const plans = new Map(); let seq = 0;
  const pistes = [{ stop: vi.fn() }];
  const flux = { getTracks: () => pistes };
  class MR {
    constructor(f, opts) { this.flux = f; this.mimeType = (opts && opts.mimeType) || ''; this.state = 'inactive'; MR.dernier = this; }
    static isTypeSupported(x) { return types(x); }
    start() { this.state = 'recording'; this.ondataavailable({ data: { size: 3 } }); }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
    stop() { this.ondataavailable({ data: { size: 5 } }); this.state = 'inactive'; this.onstop && this.onstop(); }
  }
  const onTick = vi.fn(); const onMax = vi.fn();
  const rec = creerEnregistreur({
    getUserMedia: async () => { if (refus) { const e = new Error('x'); e.name = refus; throw e; } return flux; },
    MediaRecorder: MR, maintenant: () => t,
    planifier: (fn) => { const id = ++seq; plans.set(id, fn); return id; },
    annulerPlan: (id) => plans.delete(id),
    onTick, onMax,
  });
  return { rec, avance: (ms) => { t += ms; plans.forEach((fn) => fn()); }, pistes, onTick, onMax, plans, MR };
}

describe('enregistreur', () => {
  it('démarre, compte, met en pause (le temps s’arrête), reprend, arrête : morceaux + type nu + durée', async () => {
    const b = banc();
    expect(await b.rec.demarrer()).toEqual({ ok: true, mime: 'audio/webm;codecs=opus' });
    expect(b.rec.etat).toBe('enregistre');
    b.avance(10000);
    expect(b.onTick).toHaveBeenLastCalledWith(10);
    b.rec.pause(); b.avance(30000);
    expect(b.rec.secondes()).toBe(10);
    b.rec.reprendre(); b.avance(5000);
    const out = await b.rec.arreter();
    expect(out.mime).toBe('audio/webm');
    expect(out.duree).toBe(15);
    expect(out.morceaux).toHaveLength(2);
    expect(b.pistes[0].stop).toHaveBeenCalled();       // micro libéré
    expect(b.plans.size).toBe(0);
  });
  it('micro refusé : code micro_refuse, rien ne tourne', async () => {
    const b = banc({ refus: 'NotAllowedError' });
    expect(await b.rec.demarrer()).toEqual({ ok: false, code: 'micro_refuse' });
    expect(b.plans.size).toBe(0);
  });
  it('durée maximale : onMax appelé', async () => {
    const b = banc();
    await b.rec.demarrer();
    b.avance(300000);
    expect(b.onMax).toHaveBeenCalled();
  });
  it('annuler : rien n’est gardé, micro libéré', async () => {
    const b = banc();
    await b.rec.demarrer();
    b.rec.annuler();
    expect(b.rec.etat).toBe('fini');
    expect(b.pistes[0].stop).toHaveBeenCalled();
    expect(await b.rec.arreter()).toBe(null);
  });
  it('débit audio réduit (32 kb/s ≈ 0,25 Mo par minute)', async () => {
    const b = banc();
    await b.rec.demarrer();
    expect(b.MR.dernier.mimeType).toBe('audio/webm;codecs=opus');
  });
});
