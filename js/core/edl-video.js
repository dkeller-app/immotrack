/**
 * js/core/edl-video.js — L'ÉTAT DES LIEUX FILMÉ : règles et données (chantier EDL-VIDEO-IA).
 *
 * Décisions Didier (14/10/2026, GO phase 2) :
 *   1-2. Filmer seulement avec l'ACCORD PRÉALABLE de chaque locataire présent (case jamais pré-cochée,
 *        cochée par lui ; un représentant coche pour le locataire représenté). Refus = pas de vidéo,
 *        l'EDL continue à la voix ou à la main. Base légale retenue : intérêt légitime (preuve de l'état
 *        du logement) + accord préalable — À FAIRE VALIDER PAR L'AVOCAT DANS L'AIPD.
 *   3.   Copie au locataire : cible = ESPACE LOCATAIRE (chantier à venir). Point d'accroche : mediasEDL()
 *        ci-dessous expose les médias d'un EDL ; en attendant, le PDF dit « copie remise sur demande ».
 *   4.   L'image ne propose JAMAIS d'état (le relais l'interdit aussi).
 *   5.   « Accepter » garde aussi les photos non écartées.
 *   7.   Conservation : purge AUTOMATIQUE à restitution du dépôt de garantie + 3 ans (art. 7-1 loi 89-462),
 *        alerte « Ce qui presse » 30 jours avant, prolongeable en cas de litige.
 *   8.   720p, ~1 Mbit/s, 3 min par prise, plusieurs prises par pièce. 12. Galerie : 3 min / 200 Mo (selon plan).
 * Module PUR : ni DOM, ni réseau, ni IndexedDB.
 */

export const VERSION_TEXTE_ACCORD = '2026-10-14';
export const PRISE_MAX_SEC = 180;
export const GALERIE_MAX_SEC = 180;
export const PLAN_GRATUIT_MAX_OCTETS = 50 * 1024 * 1024;   // Supabase Free : 50 Mo par fichier
export const ALERTE_JOURS = 30;
export const PRESCRIPTION_ANS = 3;                           // art. 7-1 loi n° 89-462
export const RESTITUTION_MAX_MOIS = 2;                       // art. 22 loi n° 89-462 (délai maximal)

// ── Accord des locataires présents ──────────────────────────────────────────────────────────────────
/**
 * lignes : [{ nom, present:boolean, accord:boolean, representant?:string }]
 * Filmer est permis si au moins un locataire est présent (ou représenté) et que CHAQUE présent a coché.
 */
export function peutFilmer(lignes) {
  const l = Array.isArray(lignes) ? lignes : [];
  const presents = l.filter((x) => x && x.present);
  const manque = presents.filter((x) => x.accord !== true).map((x) => String(x.nom || 'Locataire'));
  if (!presents.length) return { ok: false, raison: 'aucun_present', manque: [] };
  return manque.length ? { ok: false, raison: 'accord_manquant', manque } : { ok: true, manque: [] };
}

/** Enregistrements horodatés posés dans l'EDL (videoAccords) pour les présents qui ont accepté. */
export function enregistrerAccords(lignes, { maintenant = new Date(), version = VERSION_TEXTE_ACCORD } = {}) {
  const at = maintenant.toISOString();
  return (Array.isArray(lignes) ? lignes : []).filter((x) => x && x.present && x.accord === true).map((x) => {
    const rep = String(x.representant || '').trim().slice(0, 120);
    return { nom: String(x.nom || '').trim().slice(0, 120) || 'Locataire', accord: true, at, version, ...(rep ? { representant: rep } : {}) };
  });
}

/** Lignes de départ de l'écran d'accord : les locataires de l'EDL, aucune case cochée. */
export function lignesAccord(noms) {
  const vus = new Set();
  return (Array.isArray(noms) ? noms : String(noms || '').split(/[,;/&]| et /))
    .map((n) => String(n || '').trim()).filter((n) => n && !vus.has(n.toLowerCase()) && vus.add(n.toLowerCase()))
    .map((nom) => ({ nom, present: true, accord: false, representant: '' }));
}

// ── Fichier vidéo ───────────────────────────────────────────────────────────────────────────────────
const EXT = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv' };
export function typeVideoNu(mime) { return String(mime || '').split(';')[0].trim().toLowerCase() || 'video/webm'; }
export function extensionVideo(mime) { return EXT[typeVideoNu(mime)] || 'webm'; }

/** Contrôle AVANT tout envoi : la limite vient du relais (/ai/status → video.fichierMaxOctets). */
export function controlerFichier({ octets, duree = 0, maxOctets = PLAN_GRATUIT_MAX_OCTETS, maxSec = 0 } = {}) {
  const n = Number(octets) || 0;
  if (n <= 0) return { ok: false, code: 'vide' };
  if (n > maxOctets) return { ok: false, code: 'trop_lourd', maxMo: Math.floor(maxOctets / (1024 * 1024)), mo: Math.ceil(n / (1024 * 1024)) };
  if (maxSec && Number(duree) > maxSec + 2) return { ok: false, code: 'trop_long', maxSec };
  return { ok: true };
}

/** Clé de fichier (même famille que les photos ph_… : chemin <espace>/<entité>/files/<clé>). */
export function cleVideo({ maintenant = Date.now(), alea = Math.random } = {}) {
  return 'vid_' + Number(maintenant).toString(36) + '_' + Math.floor(alea() * 1e9).toString(36);
}

/** Enregistrement d'une prise dans l'EDL (record.videos[]). */
export function nouvelleVideo({ cle, piece, pieceIdx, prise = 1, mime, octets, duree, sha256, maintenant = new Date(), importee = false }) {
  return {
    id: String(cle), piece: String(piece || 'Pièce').slice(0, 120), pieceIdx: Number(pieceIdx) | 0, prise: Math.max(1, Number(prise) | 0),
    mime: typeVideoNu(mime), octets: Math.max(0, Number(octets) | 0), duree: Math.max(0, Math.round(Number(duree) || 0)),
    sha256: /^[0-9a-f]{64}$/.test(String(sha256 || '')) ? String(sha256) : '', filmeLe: maintenant.toISOString(),
    cloudKey: '', ...(importee ? { importee: true } : {}),
  };
}

/** Sérialisation d'une prise (source unique, comme metaPhoto pour les photos). */
export function metaVideo(v) {
  const p = v || {};
  return {
    id: String(p.id || ''), piece: String(p.piece || ''), pieceIdx: Number(p.pieceIdx) | 0, prise: Number(p.prise) | 0 || 1,
    mime: String(p.mime || ''), octets: Number(p.octets) | 0, duree: Math.round(Number(p.duree) || 0),
    sha256: String(p.sha256 || ''), filmeLe: String(p.filmeLe || ''), cloudKey: String(p.cloudKey || ''),
    ...(p.importee ? { importee: true } : {}),
  };
}

/** Une vidéo est « à l'abri » quand son fichier est dans le stockage (cloudKey), comme une photo. */
export function videoAlAbri(v) { return !!(v && v.cloudKey); }
export function prochainNumeroPrise(videos, pieceIdx) {
  return (videos || []).filter((v) => v && Number(v.pieceIdx) === Number(pieceIdx)).reduce((m, v) => Math.max(m, Number(v.prise) || 0), 0) + 1;
}

// ── Photos tirées de la vidéo ───────────────────────────────────────────────────────────────────────
const cadreOk = (c) => c && ['x', 'y', 'l', 'h'].every((k) => Number.isFinite(Number(c[k])) && Number(c[k]) >= 0 && Number(c[k]) <= 1);
/** Sous-objet `video` d'une photo (sérialisé par metaPhoto) : de quelle prise, à quel instant, quel cadre. */
export function metaPhotoVideo(v) {
  if (!v || typeof v !== 'object' || !v.videoId) return null;
  const c = cadreOk(v.cadre) ? { x: +v.cadre.x, y: +v.cadre.y, l: +v.cadre.l, h: +v.cadre.h } : null;
  return { videoId: String(v.videoId).slice(0, 80), piece: String(v.piece || '').slice(0, 120), prise: Number(v.prise) | 0 || 1, t: Math.max(0, Math.round((Number(v.t) || 0) * 10) / 10), ...(c ? { cadre: c } : {}) };
}

/** Entrée de la tâche edl-photos pour UN appel (8 images au plus). */
export function entreePhotos({ piece, sortie, elements, images, segments = [], citeVers = {} }) {
  return {
    piece: String(piece || 'Pièce'),
    mode: sortie ? 'sortie' : 'entree',
    elements: (elements || []).map((e) => ({ id: String(e.id), nom: e.nom, ...(e.note ? { note: true } : {}), ...(citeVers[e.id] != null ? { citeVers: citeVers[e.id] } : {}) })),
    images: (images || []).map((im) => ({ id: String(im.id), t: Number(im.t) || 0, data: im.data })),
  };
}

/** Fusionne les réponses de plusieurs appels : au plus 3 images par élément (ordre de réponse), un constat. */
export function fusionnerPhotos(resultats) {
  const parEl = new Map();
  const personnes = new Set();
  for (const r of resultats || []) {
    for (const e of (r && r.elements) || []) {
      const cur = parEl.get(e.elementId) || { elementId: e.elementId, images: [], vu: null };
      for (const im of e.images || []) {
        if (cur.images.length >= 3 || cur.images.some((x) => x.imageId === im.imageId)) continue;
        cur.images.push({ imageId: im.imageId, t: im.t, cadre: im.cadre });
      }
      if (!cur.vu && e.vu) cur.vu = e.vu;
      parEl.set(e.elementId, cur);
    }
    for (const p of (r && r.personnes) || []) personnes.add(p);
  }
  return { elements: [...parEl.values()].filter((e) => e.images.length), personnes: [...personnes] };
}

/** Légende d'une photo tirée de la vidéo (écran + PDF) : « vidéo Cuisine (prise 2) à 00:41 ». */
export function legendePhoto(v, mmss) {
  const m = metaPhotoVideo(v);
  if (!m) return '';
  const f = mmss || ((t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t) % 60).padStart(2, '0')}`);
  return `vidéo ${m.piece || 'de la pièce'}${m.prise > 1 ? ` (prise ${m.prise})` : ''} à ${f(m.t)}`;
}

// ── Point d'accroche ESPACE LOCATAIRE (décision 3) ──────────────────────────────────────────────────
/**
 * Les médias d'un EDL, tels qu'un locataire pourra les consulter : prises vidéo (à l'abri ou non) et
 * photos tirées des vidéos, avec leur instant. Ne lit que l'enregistrement d'EDL ; ne fabrique aucun lien.
 * L'espace locataire (chantier séparé) réutilisera cette fonction pour lister et ouvrir les fichiers.
 */
export function mediasEDL(edl) {
  const e = edl || {};
  const videos = (e.videos || []).map(metaVideo).filter((v) => v.id);
  const photos = [];
  (e.pieces || []).forEach((p, pi) => (p && p.elements || []).forEach((x) => {
    for (const [cote, liste] of [['entree', x && x.photosE], ['sortie', x && x.photosS]]) {
      for (const ph of liste || []) {
        const v = ph && metaPhotoVideo(ph.video);
        if (v) photos.push({ piece: p.nom || '', pieceIdx: pi, element: x.nom || '', cote, idbKey: ph.idbKey || '', cloudKey: ph.cloudKey || '', ...v });
      }
    }
  }));
  return { videos, photos, accords: (e.videoAccords || []).slice(), conservation: e.conservationMedias || null };
}

/** Lignes du cadre « Vidéos de l'état des lieux » du PDF. */
export function lignesVideosPdf(edl, { duree } = {}) {
  const d = duree || ((s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  return (edl && edl.videos || []).map(metaVideo).filter((v) => v.id).map((v) => ({
    piece: v.piece + (v.prise > 1 ? ` (prise ${v.prise})` : ''),
    duree: d(v.duree),
    filmeLe: v.filmeLe ? new Date(v.filmeLe).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
    empreinte: v.sha256 || 'non calculée',   // en entier (M-14 : jamais de troncature) — c'est elle qui se vérifie
    aLAbri: videoAlAbri(v),
  }));
}

// ── Conservation (décision 7) ───────────────────────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10);
function plusMois(d, n) { const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())); return r; }
function dateUTC(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }

/**
 * Date à partir de laquelle les vidéos d'un EDL peuvent être supprimées :
 *   restitution du dépôt de garantie + 3 ans (art. 7-1 : prescription des actions nées du bail ;
 *   CNIL délibération 2021-057 § 53 : base active jusqu'à la clôture des comptes du locataire, puis
 *   archivage intermédiaire le temps de la prescription) ;
 *   à défaut de date de restitution : fin du bail + 2 mois (délai maximal de l'art. 22) + 3 ans ;
 *   bail en cours (aucune des deux) : null = conserver.
 * `prolongeJusquau` (litige) repousse la date, jamais ne l'avance.
 */
export function dateFinConservation({ restitutionDG, finBail, prolongeJusquau } = {}) {
  let base = dateUTC(restitutionDG);
  if (!base) { const f = dateUTC(finBail); base = f ? plusMois(f, RESTITUTION_MAX_MOIS) : null; }
  if (!base) return null;
  let fin = plusMois(base, 12 * PRESCRIPTION_ANS);
  const g = dateUTC(prolongeJusquau);
  if (g && g > fin) fin = g;
  return iso(fin);
}

/** Alerte « Ce qui presse » : suppression dans 30 jours ou moins. */
export function alerteConservation(dateFin, maintenant = new Date()) {
  const f = dateUTC(dateFin);
  if (!f) return null;
  const auj = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
  const jours = Math.round((f.getTime() - auj) / 86400000);
  if (jours > ALERTE_JOURS) return null;
  return { jours: Math.max(0, jours), dateFin: iso(f), echue: jours <= 0 };
}
