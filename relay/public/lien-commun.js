// lien-commun.js — outils partagés des pages par lien du relais (espace locataire /l, lien de l'artisan /a).
// Aucune dépendance, aucun CDN. Toute donnée affichée passe par textContent (h() n'utilise jamais innerHTML).

export function h(tag, props, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;   // CSSOM : permis par la CSP (style-src 'self'), contrairement à l'attribut
    else if (k === 'value' && (tag === 'input' || tag === 'textarea')) el.value = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const e of enfants.flat(Infinity)) {
    if (e == null || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}

export const P = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z', doc: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  tool: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  chat: 'M4 5h16v11H9l-5 4z', check: 'M5 12.5 10 17l9-10', lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  back: 'M15 5l-7 7 7 7', x: 'M6 6l12 12M18 6 6 18', chev: 'M9 5l7 7-7 7', dl: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  shield: 'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z', info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v6M12 7.5v.5',
  clip: 'M20 11.5 12 19.5a5 5 0 0 1-7-7L13.5 4a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  alert: 'M12 3 2 20h20zM12 10v4M12 17v.5', mail: 'M3 5h18v14H3zM3 7l9 6 9-6', plus: 'M12 5v14M5 12h14',
  zip: 'M3 4h18v5H3zM5 9v11h14V9M10 13h4', ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M6 6l12 12', send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  key: 'M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8M11 12 20 3M16 7l3 3', euro: 'M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9',
  mic: 'M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8', spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  cal: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4', upload: 'M12 16V4M7 9l5-5 5 5M5 20h14', drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  scale: 'M12 4v16M6 20h12M5 8h14M5 8 2.5 14a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z', stop: 'M7 7h10v10H7z',
};
export function I(n, s) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
  if (s) { svg.style.width = s + 'px'; svg.style.height = s + 'px'; }
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', P[n] || ''); svg.append(p);
  return svg;
}
export function marque() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('class', 'mark'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Propryo');
  const r = document.createElementNS(ns, 'rect');
  for (const [k, v] of Object.entries({ x: 1.76, y: 1.76, width: 28.48, height: 28.48, rx: 7.68, fill: 'none', stroke: 'var(--acc)', 'stroke-width': 3.52 })) r.setAttribute(k, v);
  const c = document.createElementNS(ns, 'circle');
  for (const [k, v] of Object.entries({ cx: 21.34, cy: 21.34, r: 4.1, fill: 'var(--acc)' })) c.setAttribute(k, v);
  svg.append(r, c); return svg;
}
export const fd = (s) => { if (!s) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); if (m && (String(s).length <= 10 || /T23:59:59/.test(String(s)))) return `${m[3]}/${m[2]}/${m[1]}`; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
export const fdh = (s) => { const d = new Date(s); if (isNaN(d)) return ''; return fd(s) + ' à ' + String(d.getHours()).padStart(2, '0') + ' h ' + String(d.getMinutes()).padStart(2, '0'); };
export const jourLong = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); if (!m) return ''; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) + ' ' + m[1]; };
export const heure = (hm) => (hm ? String(hm).replace(':', ' h ') : '');
export const plage = (c) => !c ? '' : jourLong(c.date) + (c.debut && c.fin ? ' entre ' + heure(c.debut) + ' et ' + heure(c.fin) : c.debut ? ' à partir de ' + heure(c.debut) : '');
export const taille = (n) => !n ? '' : n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' Ko' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo';
export const euros = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');

export function creerToast(root) {
  let t = null;
  return (texte) => {
    const old = root.querySelector('.toast'); if (old) old.remove();
    const el = h('div', { class: 'toast', role: 'status' }, texte); root.append(el);
    clearTimeout(t); t = setTimeout(() => el.remove(), 3500);
  };
}

export function choisirFichiers(accept, multiple, onfiles, capture) {
  const inp = h('input', { type: 'file', accept, multiple: multiple || null, capture: capture || null, class: 'vh' });
  inp.addEventListener('change', () => { onfiles([...inp.files]); inp.remove(); });
  document.body.append(inp); inp.click();
}

/** Photo ré-encodée en JPEG (réduit le poids ET retire les métadonnées, dont la position GPS). PDF : tel quel. */
export async function preparerImage(file, maxPx = 1600, qualite = 0.85) {
  if (file.type === 'application/pdf') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise((res) => cv.toBlob((b) => res(b || file), 'image/jpeg', qualite));
  } catch (e) { if (/^image\/(jpeg|png)$/.test(file.type)) return file; throw new Error('Format non accepté : photo (JPEG, PNG) ou PDF.'); }
}
/** Image réduite en data URL pour l'IA (1024 px, JPEG) : elle n'est pas conservée. */
export async function imagePourIA(file, maxPx = 1024) {
  if (!/^image\//.test(file.type || '')) return null;
  const b = await preparerImage(file, maxPx, 0.7);
  return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(null); fr.readAsDataURL(b); });
}

/**
 * Dictée : enregistrement court (3 min au plus) au micro de la page (Permissions-Policy microphone=(self)).
 * onEtat({ etat: 'enregistre'|'arrete'|'erreur', secondes, blob, message }).
 */
export function creerDictee(onEtat, maxSec = 180) {
  let rec = null, flux = null, morceaux = [], t0 = 0, minuterie = null;
  const typeAudio = () => (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) ? (['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t)) || '') : '';
  const disponible = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined');
  async function demarrer() {
    if (!disponible()) { onEtat({ etat: 'erreur', message: 'Dictée indisponible sur cet appareil : écrire plutôt.' }); return; }
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { onEtat({ etat: 'erreur', message: 'Micro refusé ou indisponible : écrire plutôt, ou autoriser le micro.' }); return; }
    morceaux = [];
    const type = typeAudio();
    rec = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
    rec.onstop = () => {
      clearInterval(minuterie); flux.getTracks().forEach((t) => t.stop());
      const blob = new Blob(morceaux, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] });
      onEtat({ etat: 'arrete', secondes: Math.round((Date.now() - t0) / 1000), blob });
      rec = null;
    };
    t0 = Date.now(); rec.start(1000);
    onEtat({ etat: 'enregistre', secondes: 0 });
    minuterie = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); onEtat({ etat: 'enregistre', secondes: s }); if (s >= maxSec) arreter(); }, 1000);
  }
  function arreter() { if (rec && rec.state !== 'inactive') rec.stop(); }
  return { demarrer, arreter, actif: () => !!rec, disponible };
}
export const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
