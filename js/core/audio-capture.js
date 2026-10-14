/**
 * js/core/audio-capture.js — ENREGISTREMENT DE LA DICTÉE (chantier EDL-VOIX-IA, lot B1).
 *
 * MediaRecorder, sans dépendance. Formats (relevé du 13/10) :
 *   - audio/webm;codecs=opus : Chrome, Android, Firefox, Safari ≥ 18.4 (iOS 18.4, mars 2025) ;
 *   - audio/mp4 (AAC)        : Safari 14.1 → 18.3 ;
 *   - repli final            : import d'un fichier audio (application Dictaphone du téléphone).
 * Toutes les dépendances navigateur sont injectées (tests sans navigateur).
 */

export const FORMATS_PREFERES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
export const DUREE_MAX_S = 300;   // 5 min par dictée (CDC §2) ; au-delà : arrêt, la dictée est gardée

export function captureDisponible(win) {
  try {
    return !!(win && win.MediaRecorder && win.navigator && win.navigator.mediaDevices && typeof win.navigator.mediaDevices.getUserMedia === 'function');
  } catch (_) { return false; }
}

export function choisirFormat(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return '';
  for (const f of FORMATS_PREFERES) { try { if (isTypeSupported(f)) return f; } catch (_) { /* suivant */ } }
  return '';   // le navigateur choisit
}

/** Type « nu » (sans codecs) envoyé au relais. */
export function typeNu(mime) {
  return String(mime || '').split(';')[0].trim().toLowerCase() || 'audio/webm';
}

export function codeErreurMicro(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'micro_refuse';
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'micro_absent';
  return 'capture';
}

/**
 * @param {object} o
 * @param {Function} o.getUserMedia   (contraintes) => Promise<MediaStream>
 * @param {Function} o.MediaRecorder  constructeur
 * @param {Function} [o.maintenant]   () => ms
 * @param {number}   [o.maxSec]
 * @param {Function} [o.planifier]    (fn, ms) => id   (setInterval)
 * @param {Function} [o.annulerPlan]  (id) => void      (clearInterval)
 * @param {Function} [o.onTick]       (secondes) => void
 * @param {Function} [o.onMax]        () => void  — durée maximale atteinte (l'enregistrement s'arrête)
 */
export function creerEnregistreur(o) {
  const now = o.maintenant || (() => Date.now());
  const maxSec = o.maxSec || DUREE_MAX_S;
  const planifier = o.planifier || ((fn, ms) => setInterval(fn, ms));
  const annulerPlan = o.annulerPlan || ((id) => clearInterval(id));
  let flux = null, rec = null, morceaux = [], etat = 'inactif', cumulMs = 0, depuis = 0, minuteur = null, mime = '';

  const secondes = () => Math.floor((cumulMs + (etat === 'enregistre' ? now() - depuis : 0)) / 1000);
  const couperFlux = () => { try { (flux && flux.getTracks ? flux.getTracks() : []).forEach((t) => t.stop()); } catch (_) { /* rien */ } flux = null; };
  const tic = () => {
    const s = secondes();
    try { o.onTick && o.onTick(s); } catch (_) { /* rien */ }
    if (s >= maxSec && etat === 'enregistre') { try { o.onMax && o.onMax(); } catch (_) { /* rien */ } }
  };

  return {
    get etat() { return etat; },
    get mime() { return mime; },
    get flux() { return flux; },
    secondes,
    async demarrer() {
      if (etat !== 'inactif') return { ok: false, code: 'deja' };
      try {
        flux = await o.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      } catch (e) { return { ok: false, code: codeErreurMicro(e) }; }
      try {
        const choix = choisirFormat(o.MediaRecorder.isTypeSupported && o.MediaRecorder.isTypeSupported.bind(o.MediaRecorder));
        rec = choix ? new o.MediaRecorder(flux, { mimeType: choix, audioBitsPerSecond: 32000 }) : new o.MediaRecorder(flux);
        mime = rec.mimeType || choix || 'audio/webm';
        morceaux = [];
        rec.ondataavailable = (ev) => { if (ev && ev.data && ev.data.size) morceaux.push(ev.data); };
        rec.start(1000);
      } catch (_) { couperFlux(); return { ok: false, code: 'capture' }; }
      etat = 'enregistre'; depuis = now(); cumulMs = 0;
      minuteur = planifier(tic, 500);
      return { ok: true, mime };
    },
    pause() {
      if (etat !== 'enregistre' || !rec) return false;
      try { rec.pause(); } catch (_) { return false; }
      cumulMs += now() - depuis; etat = 'pause'; tic();
      return true;
    },
    reprendre() {
      if (etat !== 'pause' || !rec) return false;
      try { rec.resume(); } catch (_) { return false; }
      depuis = now(); etat = 'enregistre';
      return true;
    },
    /** Arrête et rend { morceaux, mime, duree } (Blob construit par l'appelant). */
    arreter() {
      return new Promise((resolve) => {
        if (!rec || etat === 'inactif' || etat === 'fini') { resolve(null); return; }
        if (etat === 'enregistre') cumulMs += now() - depuis;
        etat = 'fini';
        if (minuteur != null) { annulerPlan(minuteur); minuteur = null; }
        const fin = () => { couperFlux(); resolve({ morceaux: morceaux.slice(), mime: typeNu(mime), duree: Math.round(cumulMs / 1000) }); };
        try { rec.onstop = fin; rec.stop(); } catch (_) { fin(); }
      });
    },
    /** Abandon : rien n'est gardé. */
    annuler() {
      if (minuteur != null) { annulerPlan(minuteur); minuteur = null; }
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (_) { /* rien */ }
      morceaux = []; etat = 'fini'; couperFlux();
    },
  };
}
