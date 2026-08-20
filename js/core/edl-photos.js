/**
 * core/edl-photos.js — les photos de l'état des lieux (chantier EDL TERRAIN).
 *
 * CDC : docs/CDC-EDL.md §2 (photos) et §3bis (bug de production du 20/08).
 *
 * LOT 0 — invariants 22 et 34i : ouvrir un EDL ne doit plus monter TOUS les
 * binaires en mémoire. `_edlPreloadPhotos` (index.html) chargeait les 98 photos
 * de l'EDL F3 réel, soit ≈ 60 Mo de base64, avant même le premier rendu : iOS
 * décharge l'onglet sous pression mémoire et la visite en cours est perdue.
 * Le préchargement passe « à la demande » : seules les vignettes visibles sont
 * hydratées.
 *
 * Ce module ne connaît ni le DOM, ni IndexedDB, ni le réseau. Il répond à
 * « QUOI charger » ; l'inline garde le « COMMENT ».
 */

/** Les 8 emplacements de photos de compteurs (entrée + sortie). */
export const EDL_COMPTEUR_PHOTO_KEYS = ['elec', 'gaz', 'eauC', 'eauF', 'elecS', 'gazS', 'eauCS', 'eauFS'];

function _push(out, seen, arr) {
  if (!Array.isArray(arr)) return;
  for (const ph of arr) {
    if (!ph || !ph.idbKey) continue;
    if (seen.has(ph.idbKey)) continue;
    seen.add(ph.idbKey);
    out.push(ph);
  }
}

/**
 * Collecte TOUTES les photos d'un enregistrement d'EDL, dédupliquées par idbKey.
 * Source unique : pièces (E + S), clés (E + S), compteurs (8 emplacements),
 * inventaire mobilier (E + S). Une photo sans `idbKey` n'est pas collectable.
 *
 * @param {object} edlRec
 * @returns {Array<object>} les objets photo eux-mêmes (idbKey, cloudKey, name…)
 */
export function collectEdlPhotos(edlRec) {
  const out = [];
  const seen = new Set();
  if (!edlRec || typeof edlRec !== 'object') return out;

  (edlRec.pieces || []).forEach(p => (p && p.elements || []).forEach(x => {
    if (!x) return;
    _push(out, seen, x.photosE);
    _push(out, seen, x.photosS);
  }));

  (edlRec.cles || []).forEach(c => {
    if (!c) return;
    _push(out, seen, c.photos);
    _push(out, seen, c.photosS);
  });

  const cpt = edlRec.compteursPhotos || {};
  EDL_COMPTEUR_PHOTO_KEYS.forEach(k => _push(out, seen, cpt[k]));

  const mob = (edlRec.mobilier && Array.isArray(edlRec.mobilier.elements)) ? edlRec.mobilier.elements : [];
  mob.forEach(m => {
    if (!m) return;
    _push(out, seen, m.photosE);
    _push(out, seen, m.photosS);
  });

  return out;
}

/** Les clés IndexedDB de toutes les photos d'un EDL, dédupliquées. */
export function edlPhotoKeys(edlRec) {
  return collectEdlPhotos(edlRec).map(ph => ph.idbKey);
}

/** Index idbKey → objet photo (pour retrouver le cloudKey d'une vignette). */
export function photoIndexByKey(photos) {
  const idx = {};
  (photos || []).forEach(ph => { if (ph && ph.idbKey) idx[ph.idbKey] = ph; });
  return idx;
}

/**
 * Quelles vignettes sont « à l'écran », marge comprise, à partir de leurs
 * rectangles mesurés. Sert au premier rendu : on n'attend pas la première
 * notification de l'IntersectionObserver pour montrer ce qui est déjà visible.
 *
 * @param {Array<{idbKey:string, top:number, bottom:number}>} rects
 * @param {{viewportHeight?:number, margin?:number}} [opt]
 * @returns {Array<string>} les idbKey dans la bande visible
 */
export function keysInViewband(rects, { viewportHeight = 0, margin = 300 } = {}) {
  const out = [];
  for (const r of rects || []) {
    if (!r || !r.idbKey) continue;
    // Rectangle plat = élément sans boîte de rendu (modale pas encore affichée) :
    // NON mesurable, donc pas « visible ». Sans ce garde-fou, les 77 vignettes
    // d'un EDL réel tombent toutes dans la bande (0 > -300 et 0 < h+300) et on
    // recharge tout — exactement le défaut que le lot 0 supprime.
    if (!(r.bottom > r.top)) continue;
    if (r.bottom > -margin && r.top < viewportHeight + margin) out.push(r.idbKey);
  }
  return out;
}

/**
 * QUOI hydrater maintenant : les photos demandées (= vignettes visibles) qui ne
 * sont pas déjà en mémoire. Rien d'autre. Aucune photo hors de `visibleKeys`
 * ne peut sortir d'ici — c'est ce qui rend l'invariant 34i vrai.
 *
 * @param {{photos?:Array<object>, visibleKeys?:Array<string>|Set<string>, cache?:object}} arg
 * @returns {Array<object>} sous-ensemble de `photos`, sans doublon, ordre d'entrée
 */
export function photosToHydrate({ photos = [], visibleKeys = [], cache = {} } = {}) {
  const wanted = visibleKeys instanceof Set ? visibleKeys : new Set(visibleKeys || []);
  const done = new Set();
  const out = [];
  for (const ph of photos || []) {
    if (!ph || !ph.idbKey) continue;
    if (!wanted.has(ph.idbKey)) continue;
    if (cache && cache[ph.idbKey]) continue;
    if (done.has(ph.idbKey)) continue;
    done.add(ph.idbKey);
    out.push(ph);
  }
  return out;
}
