/**
 * __tests__/helpers/edl-video.test.js — chantier EDL-VIDEO-IA : état des lieux filmé.
 * Couvre : choix des images (edl-video-images), règles et données (edl-video), envoi reprenable (tus-client),
 * capture vidéo (audio-capture, mode vidéo), file d'attente (étape images), sérialisation des photos.
 */
import { describe, it, expect, vi } from 'vitest';
import * as Img from '../../js/core/edl-video-images.js';
import * as V from '../../js/core/edl-video.js';
import { creerEnvoiTus, metadonnees, pointEntree, MORCEAU } from '../../js/core/tus-client.js';
import { creerEnregistreur, choisirFormatVideo, codeErreurCamera, VIDEO_PRISE_MAX_S, CONTRAINTES_VIDEO } from '../../js/core/audio-capture.js';
import { creerFileDictees, storeMemoire, ETAPES, instantsCites } from '../../js/core/ia-file-attente.js';
import { metaPhoto } from '../../js/core/edl-photos.js';

// ── edl-video-images ──────────────────────────────────────────────────────────────────────────────────
const grisUni = (v, n = 16) => new Float32Array(n).fill(v);
describe('images : mesure', () => {
  it('mesurer : luminosité moyenne, netteté nulle sur une image uniforme, forte sur un damier', () => {
    const w = 8, h = 8;
    const uni = new Uint8ClampedArray(w * h * 4).fill(120);
    const m = Img.mesurer(uni, w, h);
    expect(Math.round(m.lum)).toBe(120);
    expect(m.nettete).toBe(0);
    const dam = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = (x + y) % 2 ? 255 : 0; const i = (y * w + x) * 4; dam[i] = dam[i + 1] = dam[i + 2] = v; dam[i + 3] = 255; }
    expect(Img.mesurer(dam, w, h).nettete).toBeGreaterThan(10000);
  });
  it('ecart : 0 pour deux images identiques, 255 si tailles différentes', () => {
    expect(Img.ecart(grisUni(10), grisUni(10))).toBe(0);
    expect(Img.ecart(grisUni(10), grisUni(40))).toBe(30);
    expect(Img.ecart(grisUni(10, 4), grisUni(10, 8))).toBe(255);
  });
});

describe('images : sélecteur en continu', () => {
  const e = (t, v, nettete, lum = 120) => ({ t, gris: grisUni(v), nettete, lum });
  it('une image (la plus nette) par vue ; nouvelle vue au changement d’image ou après 3 s', () => {
    const s = Img.creerSelecteur();
    const seq = [e(0, 100, 50), e(0.5, 102, 80), e(1, 101, 60), e(1.5, 200, 30), e(2, 202, 90), e(5.5, 203, 40)];
    for (const x of seq) { const r = s.ajouter(x); if (r.meilleur) s.attacher(r.idx, 'img@' + x.t); }
    const out = s.terminer();
    expect(out.map((x) => x.t)).toEqual([0.5, 2, 5.5]);
    expect(out.map((x) => x.donnee)).toEqual(['img@0.5', 'img@2', 'img@5.5']);
  });
  it('préfère une image claire ; vue entièrement sombre écartée ; vue floue gardée et marquée', () => {
    const s = Img.creerSelecteur();
    const seq = [e(0, 100, 900, 10), e(0.5, 100, 300, 120), e(1, 180, 800, 5), e(1.5, 30, 1000), e(2, 32, 1000), e(2.5, 250, 50)];
    for (const x of seq) { const r = s.ajouter(x); if (r.meilleur) s.attacher(r.idx, x.t); }
    const out = s.terminer();
    expect(out.map((x) => x.t)).toEqual([0.5, 1.5, 2.5]);   // vue sombre (t=1) écartée
    expect(out.find((x) => x.t === 2.5).flou).toBe(true);
    expect(out.find((x) => x.t === 1.5).flou).toBe(false);
  });
  it('une image non capturée (attacher jamais appelé) n’est pas rendue', () => {
    const s = Img.creerSelecteur();
    s.ajouter(e(0, 10, 50));
    expect(s.terminer()).toEqual([]);
  });
});

describe('images : utilitaires', () => {
  it('lots de 8, dimensions d’envoi, mm:ss', () => {
    expect(Img.lots(Array.from({ length: 17 }, (_, i) => i)).map((l) => l.length)).toEqual([8, 8, 1]);
    expect(Img.dimensionsEnvoi(720, 1280)).toEqual({ w: 432, h: 768 });
    expect(Img.dimensionsEnvoi(300, 200)).toEqual({ w: 300, h: 200 });
    expect(Img.mmss(41.4)).toBe('00:41');
    expect(Img.mmss(125)).toBe('02:05');
  });
  it('instantCite : interpolation dans le segment ; null sans segments ou extrait absent', () => {
    const segs = [{ start: 37.3, end: 47.7, text: 'un de la vaisselle, une plaque de cuisson avec rayures, placard en haut' }];
    const t = Img.instantCite(segs, 'une plaque de cuisson avec rayures');
    expect(t).toBeGreaterThan(38); expect(t).toBeLessThan(41);
    expect(Img.instantCite([], 'x')).toBeNull();
    expect(Img.instantCite(segs, 'baignoire')).toBeNull();
  });
  it('rectPixels et ajusterCadre restent dans l’image', () => {
    expect(Img.rectPixels({ x: 0, y: 0.42, l: 1, h: 0.38 }, 576, 1024)).toEqual({ sx: 0, sy: 430, sw: 576, sh: 389 });
    expect(Img.ajusterCadre({ x: 0.9, y: 0.9, l: 0.5, h: 0.5 }, { dx: 0.2 })).toEqual({ x: 0.5, y: 0.5, l: 0.5, h: 0.5 });
    expect(Img.ajusterCadre({ x: 0, y: 0, l: 0.2, h: 0.2 }, { dl: -0.5 }).l).toBe(0.1);
  });
});

// ── edl-video : accord, fichier, données, conservation ──────────────────────────────────────────────────
describe('accord des locataires présents (décisions 1-2)', () => {
  it('aucune case pré-cochée ; filmer seulement si CHAQUE présent a accepté', () => {
    const l = V.lignesAccord('Claire Martin, Paul Martin');
    expect(l).toEqual([{ nom: 'Claire Martin', present: true, accord: false, representant: '' }, { nom: 'Paul Martin', present: true, accord: false, representant: '' }]);
    expect(V.peutFilmer(l)).toEqual({ ok: false, raison: 'accord_manquant', manque: ['Claire Martin', 'Paul Martin'] });
    l[0].accord = true;
    expect(V.peutFilmer(l).manque).toEqual(['Paul Martin']);
    l[1].present = false;                                   // absent : sans objet
    expect(V.peutFilmer(l).ok).toBe(true);
    expect(V.peutFilmer([{ nom: 'A', present: false, accord: true }])).toMatchObject({ ok: false, raison: 'aucun_present' });
    expect(V.peutFilmer([{ nom: 'A', present: true, accord: 'true' }]).ok).toBe(false);   // seul true compte
  });
  it('accords horodatés, versionnés, représentant noté ; seuls les présents qui ont accepté', () => {
    const at = new Date('2026-10-14T10:02:00Z');
    const r = V.enregistrerAccords([{ nom: 'Claire', present: true, accord: true }, { nom: 'Paul', present: true, accord: true, representant: 'Jean (mandataire)' }, { nom: 'Zoé', present: false, accord: true }], { maintenant: at });
    expect(r).toEqual([
      { nom: 'Claire', accord: true, at: '2026-10-14T10:02:00.000Z', version: V.VERSION_TEXTE_ACCORD },
      { nom: 'Paul', accord: true, at: '2026-10-14T10:02:00.000Z', version: V.VERSION_TEXTE_ACCORD, representant: 'Jean (mandataire)' },
    ]);
  });
});

describe('fichier vidéo', () => {
  it('plan gratuit : refus propre au-delà de 50 Mo ; limite surchargée par le relais', () => {
    expect(V.controlerFichier({ octets: 20 * 1048576 }).ok).toBe(true);
    expect(V.controlerFichier({ octets: 51 * 1048576 })).toEqual({ ok: false, code: 'trop_lourd', maxMo: 50, mo: 51 });
    expect(V.controlerFichier({ octets: 120 * 1048576, maxOctets: 200 * 1048576 }).ok).toBe(true);
    expect(V.controlerFichier({ octets: 10, duree: 200, maxSec: 180 })).toMatchObject({ ok: false, code: 'trop_long' });
    expect(V.controlerFichier({ octets: 0 }).code).toBe('vide');
  });
  it('clé, extension, enregistrement et sérialisation d’une prise ; prise suivante', () => {
    expect(V.cleVideo({ maintenant: 1000, alea: () => 0.5 })).toMatch(/^vid_[a-z0-9]+_[a-z0-9]+$/);
    expect(V.extensionVideo('video/mp4;codecs=avc1')).toBe('mp4');
    const v = V.nouvelleVideo({ cle: 'vid_a', piece: 'Cuisine', pieceIdx: 3, mime: 'video/webm;codecs=vp9', octets: 7100000, duree: 58.8, sha256: 'a'.repeat(64), maintenant: new Date('2026-10-14T10:06:00Z') });
    expect(v).toEqual({ id: 'vid_a', piece: 'Cuisine', pieceIdx: 3, prise: 1, mime: 'video/webm', octets: 7100000, duree: 59, sha256: 'a'.repeat(64), filmeLe: '2026-10-14T10:06:00.000Z', cloudKey: '' });
    expect(V.metaVideo({ ...v, intrus: 'x' })).toEqual(v);
    expect(V.nouvelleVideo({ cle: 'b', sha256: 'pas-un-hash' }).sha256).toBe('');
    expect(V.prochainNumeroPrise([v, { ...v, prise: 2 }, { ...v, pieceIdx: 1, prise: 5 }], 3)).toBe(3);
    expect(V.metaVideo({ ...v, registre: true }).registre).toBe(true);
    expect(V.videoAlAbri(v)).toBe(false);
  });
});

describe('son d’une vidéo importée', () => {
  it('encoderWav : en-tête RIFF/WAVE PCM 16 bits mono, échantillons bornés', () => {
    const b = V.encoderWav(new Float32Array([0, 1, -1, 2]), 16000);
    const d = new DataView(b);
    const s = (o, n) => String.fromCharCode(...new Uint8Array(b, o, n));
    expect([s(0, 4), s(8, 4), s(12, 4), s(36, 4)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(b.byteLength).toBe(44 + 8);
    expect([d.getUint16(22, true), d.getUint32(24, true), d.getUint16(34, true)]).toEqual([1, 16000, 16]);
    expect([d.getInt16(44, true), d.getInt16(46, true), d.getInt16(48, true), d.getInt16(50, true)]).toEqual([0, 32767, -32768, 32767]);
  });
});

describe('photos tirées de la vidéo', () => {
  it('metaPhotoVideo garde prise, instant, cadre ; rejette un cadre hors image ; metaPhoto le sérialise', () => {
    const v = { videoId: 'vid_a', piece: 'Cuisine', prise: 1, t: 41.04, cadre: { x: 0, y: 0.42, l: 1, h: 0.38 } };
    expect(V.metaPhotoVideo(v)).toEqual({ videoId: 'vid_a', piece: 'Cuisine', prise: 1, t: 41, cadre: { x: 0, y: 0.42, l: 1, h: 0.38 } });
    expect(V.metaPhotoVideo({ ...v, cadre: { x: 2, y: 0, l: 1, h: 1 } }).cadre).toBeUndefined();
    expect(V.metaPhotoVideo({ t: 3 })).toBeNull();
    expect(metaPhoto({ idbKey: 'ph_1', cloudKey: 'c', video: v }).video.t).toBe(41);
    expect(metaPhoto({ idbKey: 'ph_1' }).video).toBeUndefined();                 // photo ordinaire inchangée
  });
  it('entreePhotos et fusion des lots : 3 images au plus par élément, premier constat', () => {
    const inp = V.entreePhotos({ piece: 'Cuisine', sortie: false, elements: [{ id: '0', nom: 'Sol' }, { id: '24', nom: 'Autres', note: true }], images: [{ id: 'a', t: 1, data: 'd' }], citeVers: { 0: 26.1 } });
    expect(inp).toEqual({ piece: 'Cuisine', mode: 'entree', elements: [{ id: '0', nom: 'Sol', citeVers: 26.1 }, { id: '24', nom: 'Autres', note: true }], images: [{ id: 'a', t: 1, data: 'd' }] });
    const im = (id) => ({ imageId: id, t: 1, cadre: { x: 0, y: 0, l: 1, h: 1 } });
    const f = V.fusionnerPhotos([
      { elements: [{ elementId: '0', images: [im('a'), im('b')], vu: null }], personnes: ['b'] },
      { elements: [{ elementId: '0', images: [im('b'), im('c'), im('d')], vu: 'Carreaux de ciment.' }, { elementId: '4', images: [], vu: 'x' }], personnes: [] },
    ]);
    expect(f.elements).toEqual([{ elementId: '0', images: [im('a'), im('b'), im('c')], vu: 'Carreaux de ciment.' }]);
    expect(f.personnes).toEqual(['b']);
  });
  it('légende : pièce, prise et instant', () => {
    expect(V.legendePhoto({ videoId: 'v', piece: 'Cuisine', prise: 2, t: 41 }, Img.mmss)).toBe('vidéo Cuisine (prise 2) à 00:41');
    expect(V.legendePhoto(null)).toBe('');
  });
});

describe('point d’accroche de l’espace locataire (décision 3) et PDF', () => {
  const edl = {
    videos: [{ id: 'vid_a', piece: 'Cuisine', pieceIdx: 0, prise: 1, mime: 'video/webm', octets: 7, duree: 59, sha256: 'a'.repeat(64), filmeLe: '2026-10-14T10:06:00Z', cloudKey: 'e/s/files/vid_a' }],
    videoAccords: [{ nom: 'Claire', accord: true, at: '2026-10-14T10:02:00Z', version: '2026-10-14' }],
    pieces: [{ nom: 'Cuisine', elements: [{ nom: 'Sol', photosE: [{ idbKey: 'ph_1', cloudKey: 'k', video: { videoId: 'vid_a', piece: 'Cuisine', prise: 1, t: 33 } }, { idbKey: 'ph_2' }], photosS: [] }] }],
  };
  it('mediasEDL : prises, photos tirées des vidéos avec leur instant, accords — sans fabriquer de lien', () => {
    const m = V.mediasEDL(edl);
    expect(m.videos).toHaveLength(1);
    expect(m.photos).toEqual([{ piece: 'Cuisine', pieceIdx: 0, element: 'Sol', cote: 'entree', idbKey: 'ph_1', cloudKey: 'k', videoId: 'vid_a', prise: 1, t: 33 }]);
    expect(m.accords).toHaveLength(1);
    expect(JSON.stringify(m)).not.toMatch(/https?:/);
    expect(V.mediasEDL(null)).toEqual({ videos: [], photos: [], accords: [], conservation: null });
  });
  it('lignes du cadre « Vidéos » du PDF : empreinte abrégée, à l’abri', () => {
    const l = V.lignesVideosPdf(edl);
    expect(l[0]).toMatchObject({ piece: 'Cuisine', duree: '0:59', empreinte: 'a'.repeat(64), aLAbri: true });
  });
});

describe('conservation (décision 7 : restitution du DG + 3 ans, alerte 30 jours, prolongeable)', () => {
  it('restitution du dépôt + 3 ans', () => {
    expect(V.dateFinConservation({ restitutionDG: '2023-11-15' })).toBe('2026-11-15');
  });
  it('sans restitution saisie : fin du bail + 2 mois (art. 22) + 3 ans ; bail en cours : null', () => {
    expect(V.dateFinConservation({ finBail: '2026-06-30' })).toBe('2029-08-30');
    expect(V.dateFinConservation({})).toBeNull();
  });
  it('litige : la prolongation repousse, n’avance jamais', () => {
    expect(V.dateFinConservation({ restitutionDG: '2023-11-15', prolongeJusquau: '2028-01-01' })).toBe('2028-01-01');
    expect(V.dateFinConservation({ restitutionDG: '2023-11-15', prolongeJusquau: '2024-01-01' })).toBe('2026-11-15');
  });
  it('alerte à 30 jours, échue le jour même ; rien au-delà', () => {
    const auj = new Date('2026-10-16T09:00:00Z');
    expect(V.alerteConservation('2026-11-15', auj)).toEqual({ jours: 30, dateFin: '2026-11-15', echue: false });
    expect(V.alerteConservation('2026-12-15', auj)).toBeNull();
    expect(V.alerteConservation('2026-10-16', auj)).toEqual({ jours: 0, dateFin: '2026-10-16', echue: true });
    expect(V.alerteConservation(null, auj)).toBeNull();
  });
});

// ── tus-client ────────────────────────────────────────────────────────────────────────────────────────
function serveurTus({ coupure = null, expire = false } = {}) {
  let recu = 0; const corps = []; let creations = 0; let patchs = 0;
  const f = vi.fn(async (url, init) => {
    const h = init.headers;
    if (init.method === 'POST') {
      creations++;
      return new Response(null, { status: 201, headers: { Location: '/storage/v1/upload/resumable/abc' + creations } });
    }
    if (init.method === 'HEAD') {
      if (expire && String(url).includes('old')) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: { 'Upload-Offset': String(recu) } });
    }
    if (init.method === 'PATCH') {
      patchs++;
      if (expire && String(url).includes('old')) return new Response(null, { status: 410 });
      if (coupure && patchs === coupure) throw new TypeError('réseau coupé');
      expect(Number(h['Upload-Offset'])).toBe(recu);
      expect(h['Content-Type']).toBe('application/offset+octet-stream');
      const n = init.body.byteLength; recu += n; corps.push(n);
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(recu) } });
    }
    return new Response(null, { status: 400 });
  });
  return { f, etat: () => ({ recu, corps, creations }) };
}
const lire = (debut, fin) => Promise.resolve(new Uint8Array(fin - debut).buffer);
const base = (f, o = {}) => creerEnvoiTus({ endpoint: 'https://p.storage.supabase.co/storage/v1/upload/resumable', getToken: async () => 'jeton', apikey: 'anon', bucket: 'espace-files', objet: 'e/s/files/vid_a', type: 'video/webm', taille: 13 * 1024 * 1024, lire, fetchImpl: f, attendre: async () => {}, enLigne: () => true, ...o });

describe('envoi reprenable TUS', () => {
  it('métadonnées en base64, point d’entrée du stockage dédié', () => {
    expect(metadonnees({ bucket: 'b', objet: 'o', type: 'video/webm' })).toBe('bucketName Yg==,objectName bw==,contentType dmlkZW8vd2VibQ==,cacheControl MzYwMA==');
    expect(pointEntree('https://xcbtashflclswyiyvfgn.supabase.co')).toBe('https://xcbtashflclswyiyvfgn.storage.supabase.co/storage/v1/upload/resumable');
  });
  it('création (x-upsert false), morceaux de 6 Mo, progression, adresse mémorisée', async () => {
    const s = serveurTus(); const prog = []; const urls = [];
    const r = await base(s.f, { onProgres: (a, b) => prog.push(a), onUrl: (u) => urls.push(u) }).demarrer();
    expect(r.ok).toBe(true);
    expect(s.etat().corps).toEqual([MORCEAU, MORCEAU, 1024 * 1024]);
    expect(prog.at(-1)).toBe(13 * 1024 * 1024);
    expect(urls).toEqual(['https://p.storage.supabase.co/storage/v1/upload/resumable/abc1']);
    const post = s.f.mock.calls[0][1];
    expect(post.headers).toMatchObject({ 'x-upsert': 'false', 'Tus-Resumable': '1.0.0', Authorization: 'Bearer jeton', apikey: 'anon', 'Upload-Length': String(13 * 1024 * 1024) });
  });
  it('coupure réseau au 2e morceau : reprise à la position du serveur', async () => {
    const s = serveurTus({ coupure: 2 });
    const r = await base(s.f).demarrer();
    expect(r.ok).toBe(true);
    expect(s.etat().recu).toBe(13 * 1024 * 1024);
  });
  it('reprise d’un envoi commencé (adresse connue) : HEAD puis envoi du reste', async () => {
    const s = serveurTus();
    const r = await base(s.f, { url: 'https://p.storage.supabase.co/storage/v1/upload/resumable/abc0' }).demarrer();
    expect(r.ok).toBe(true);
    expect(s.f.mock.calls[0][1].method).toBe('HEAD');
  });
  it('adresse expirée (24 h) : nouvelle création, une seule fois', async () => {
    const s = serveurTus({ expire: true });
    const r = await base(s.f, { url: 'https://p.storage.supabase.co/x/old' }).demarrer();
    expect(r.ok).toBe(true);
    expect(s.etat().creations).toBe(1);
  });
  it('sans session, refus, fichier déjà là, hors ligne : codes nommés, jamais d’exception', async () => {
    expect((await base(vi.fn(), { getToken: async () => '' }).demarrer()).code).toBe('auth');
    expect((await base(vi.fn(async () => new Response(null, { status: 403 }))).demarrer()).code).toBe('refuse');
    expect((await base(vi.fn(async () => new Response(null, { status: 409 }))).demarrer()).code).toBe('existe');
    expect((await base(vi.fn(async () => { throw new TypeError('x'); }), { enLigne: () => false }).demarrer()).code).toBe('offline');
  });
});

// ── capture vidéo ─────────────────────────────────────────────────────────────────────────────────────
function bancVideo({ refus = null } = {}) {
  let t = 0; const plans = new Map(); let seq = 0; const recs = [];
  const pistesA = [{ kind: 'audio', stop: vi.fn() }]; const pistesV = [{ kind: 'video', stop: vi.fn() }];
  const flux = { getTracks: () => [...pistesA, ...pistesV], getAudioTracks: () => pistesA };
  const contraintes = [];
  class MR {
    constructor(f, opts) { this.flux = f; this.opts = opts || {}; this.mimeType = (opts && opts.mimeType) || ''; this.state = 'inactive'; recs.push(this); }
    static isTypeSupported(x) { return x.startsWith('video/webm') || x === 'audio/webm;codecs=opus'; }
    start() { this.state = 'recording'; this.ondataavailable({ data: { size: 3 } }); }
    pause() { this.state = 'paused'; } resume() { this.state = 'recording'; }
    stop() { this.ondataavailable({ data: { size: 5 } }); this.state = 'inactive'; this.onstop && this.onstop(); }
  }
  class MS { constructor(p) { this.pistes = p; } }
  const rec = creerEnregistreur({
    video: true, MediaStream: MS, MediaRecorder: MR, maintenant: () => t,
    getUserMedia: async (c) => { contraintes.push(c); if (refus) { const e = new Error('x'); e.name = refus; throw e; } return flux; },
    planifier: (fn) => { const id = ++seq; plans.set(id, fn); return id; }, annulerPlan: (id) => plans.delete(id),
  });
  return { rec, recs, contraintes, avance: (ms) => { t += ms; plans.forEach((fn) => fn()); }, pistesV };
}
describe('capture vidéo (mode vidéo de l’enregistreur)', () => {
  it('caméra arrière 720p max, WebM, ~1 Mbit/s ; 2e enregistreur audio seul pour la dictée', async () => {
    const b = bancVideo();
    const r = await b.rec.demarrer();
    expect(r).toEqual({ ok: true, mime: 'video/webm;codecs=vp9,opus' });
    expect(b.contraintes[0]).toBe(CONTRAINTES_VIDEO);
    expect(CONTRAINTES_VIDEO.video.height.max).toBe(720);
    expect(b.recs[0].opts.videoBitsPerSecond).toBe(1000000);
    expect(b.recs[1].mimeType).toBe('audio/webm;codecs=opus');
    b.avance(4000); b.rec.pause(); b.avance(9000); b.rec.reprendre(); b.avance(2000);
    expect(b.recs.every((x) => x.state === 'recording')).toBe(true);
    const out = await b.rec.arreter();
    expect(out).toMatchObject({ mime: 'video/webm', duree: 6, audio: { mime: 'audio/webm' } });
    expect(b.rec.instant()).toBe(6);
    expect(out.morceaux).toHaveLength(2);
    expect(out.audio.morceaux).toHaveLength(2);
    expect(b.pistesV[0].stop).toHaveBeenCalled();
  });
  it('3 min par prise ; caméra refusée nommée', async () => {
    expect(VIDEO_PRISE_MAX_S).toBe(180);
    expect((await bancVideo({ refus: 'NotAllowedError' }).rec.demarrer()).code).toBe('camera_refusee');
    expect(codeErreurCamera({ name: 'NotReadableError' })).toBe('camera_absente');
    expect(choisirFormatVideo((t) => t === 'video/mp4')).toBe('video/mp4');
  });
});

// ── file : étape images ───────────────────────────────────────────────────────────────────────────────
describe('file : pièce filmée (étape images, lots de 8)', () => {
  const ENTREE = { piece: 'Cuisine', mode: 'entree', elements: [{ id: '0', nom: 'Sol', note: false }, { id: '13', nom: 'Plaques de cuisson', note: false }] };
  const RES = { propositions: [{ elementId: '13', etat: "État d'usage", observation: 'Rayures.', source: 'une plaque de cuisson avec rayures', justification: 'x', aVerifier: null }], aAjouter: [], compteurs: [], corrections: [] };
  const images = Array.from({ length: 10 }, (_, i) => ({ id: 'i' + i, t: i * 5, data: 'data:image/jpeg;base64,AA==' }));
  const photo = (ids) => ({ elements: [{ elementId: '13', images: ids.map((imageId) => ({ imageId, t: 1, cadre: { x: 0, y: 0, l: 1, h: 1 } })), vu: null }], personnes: [] });
  const client = (o = {}) => ({
    transcrire: vi.fn(o.transcrire || (async () => ({ ok: true, text: 'une plaque de cuisson avec rayures', segments: [{ start: 37.3, end: 47.7, text: 'une plaque de cuisson avec rayures' }] }))),
    structurer: vi.fn(o.structurer || (async (task, input) => (task === 'edl-piece' ? { ok: true, data: RES, modele: 'm' } : { ok: true, data: photo([input.images[0].id]), modele: 'mv' }))),
  });
  const blob = (b, t) => ({ b, t });
  it('voix puis photos : 2 appels edl-photos (8 + 2 images), indices d’instant, résultat fusionné', async () => {
    const c = client();
    const f = creerFileDictees({ store: storeMemoire(), client: c, creerBlob: blob });
    const x = await f.ajouter({ audio: new Uint8Array(4).buffer, mime: 'audio/webm', entree: ENTREE, images, video: { id: 'vid_a' } });
    await f.traiter();
    const y = await f.get(x.id);
    expect(y.etape).toBe(ETAPES.PRET);
    const appels = c.structurer.mock.calls.filter((a) => a[0] === 'edl-photos');
    expect(appels.map((a) => a[1].images.length)).toEqual([8, 2]);
    expect(appels[0][1].elements.find((e) => e.id === '13').citeVers).toBeGreaterThan(37);
    expect(y.photos.elements[0].images.map((i) => i.imageId)).toEqual(['i0', 'i8']);
    expect(y.video).toEqual({ id: 'vid_a' });
    expect(instantsCites(y)['13']).toBeGreaterThan(37);
  });
  it('coupure au 2e lot : le 1er n’est pas refait au passage suivant', async () => {
    let n = 0;
    const c = client({ structurer: async (task, input) => (task === 'edl-piece' ? { ok: true, data: RES } : (++n === 2 ? { ok: false, code: 'offline' } : { ok: true, data: photo([input.images[0].id]) })) });
    const f = creerFileDictees({ store: storeMemoire(), client: c, creerBlob: blob });
    const x = await f.ajouter({ audio: new Uint8Array(4).buffer, mime: 'audio/webm', entree: ENTREE, images });
    await f.traiter();
    expect((await f.get(x.id)).etape).toBe(ETAPES.IMAGES);
    await f.traiter();
    const y = await f.get(x.id);
    expect(y.etape).toBe(ETAPES.PRET);
    expect(n).toBe(3);
  });
  it('vidéo éteinte côté relais : propositions de la voix gardées, photos sautées (jamais bloquant)', async () => {
    const c = client({ structurer: async (task) => (task === 'edl-piece' ? { ok: true, data: RES } : { ok: false, code: 'disabled' }) });
    const f = creerFileDictees({ store: storeMemoire(), client: c, creerBlob: blob });
    const x = await f.ajouter({ audio: new Uint8Array(4).buffer, mime: 'audio/webm', entree: ENTREE, images });
    await f.traiter();
    const y = await f.get(x.id);
    expect(y).toMatchObject({ etape: ETAPES.PRET, photosIndisponibles: 'disabled', resultat: RES });
  });
  it('rien entendu ou pas de son : les photos sont quand même proposées', async () => {
    const c = client({ transcrire: async () => ({ ok: true, text: '  ', segments: [] }) });
    const f = creerFileDictees({ store: storeMemoire(), client: c, creerBlob: blob });
    const x = await f.ajouter({ audio: new Uint8Array(4).buffer, mime: 'audio/webm', entree: ENTREE, images });
    await f.traiter();
    expect((await f.get(x.id))).toMatchObject({ etape: ETAPES.PRET, texte: '' });
    const f2 = creerFileDictees({ store: storeMemoire(), client: client(), creerBlob: blob });
    const z = await f2.ajouter({ audio: null, mime: 'audio/webm', entree: ENTREE, images });
    await f2.traiter();
    expect((await f2.get(z.id)).etape).toBe(ETAPES.PRET);
  });
  it('une dictée sans images ne change pas de parcours', async () => {
    const c = client();
    const f = creerFileDictees({ store: storeMemoire(), client: c, creerBlob: blob });
    const x = await f.ajouter({ audio: new Uint8Array(4).buffer, mime: 'audio/webm', entree: ENTREE });
    await f.traiter();
    expect((await f.get(x.id)).etape).toBe(ETAPES.PRET);
    expect(c.structurer.mock.calls.map((a) => a[0])).toEqual(['edl-piece']);
  });
});
