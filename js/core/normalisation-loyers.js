/**
 * core/normalisation-loyers.js — NORMALISATION-LOYERS (01/10). Module PUR, testé.
 *
 * POURQUOI. La catégorie héritée « Loyers » (et l'ancien libellé du référentiel « Arriérés de
 * loyers ») ne vit plus au cloud (0 mouvement au 01/10), mais elle reste dans les sauvegardes JSON
 * d'avril (38 à 50 mouvements par fichier). Elle reviendrait par une RESTAURATION de sauvegarde ou
 * un IMPORT JSON, qui réinjectent les données telles quelles. Décision Didier (01/10) : le code ne
 * tolère plus « Loyers » ; les données passent dans « Loyers encaissés » (ligne 211). Cette fonction
 * est LE point unique de cette normalisation, appelé à chaque porte d'entrée des données
 * (initDB, restauration, import JSON, travaux de démarrage cloud).
 *
 * Elle retire aussi `locNouvIban` du bail (minimisation RGPD : l'IBAN du locataire n'est ni demandé
 * ni gardé). Sur un bail SIGNÉ, seul le champ à la RACINE est retiré : `signatures.bailSnapshot` et
 * l'empreinte (`bailLegalContent`, js/core/bail-content-hash.js) n'en dépendent pas et ne sont
 * JAMAIS touchés. Un IBAN présent DANS un snapshot signé est seulement compté (décision D3 ouverte).
 *
 * Périmètre EXACT : seuls les noms « Loyers » et « Arriérés de loyers » sont visés, à la lettre.
 * Une catégorie voisine (« loyer » en minuscules, au singulier : espace eaa6b867, autre utilisateur,
 * sans accord) n'est PAS touchée.
 *
 * Catégorie personnelle homonyme : si l'espace rattache « Loyers » à AUTRE CHOSE que la ligne 211
 * (alias vers une autre mère, mapping vers une autre ligne, ou « __ignore »), c'est un choix de
 * l'utilisateur : ce nom est laissé intact partout (mouvements, règles, réglages) et signalé.
 *
 * Idempotente : un second passage ne modifie rien et ne tamponne rien.
 */

export const CATEGORIE_LOYERS = 'Loyers encaissés';
export const CATEGORIES_LOYERS_HERITEES = Object.freeze(['Loyers', 'Arriérés de loyers']);
const LIGNE_LOYERS = '211';

const _own = (obj, k) => (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, k)) ? obj[k] : undefined;
const _tamponDefaut = (o) => { if (o && typeof o === 'object') o._modifiedAt = new Date().toISOString(); return o; };

/** Bail signé (le document scellé) : on n'y pose même pas de tampon, seul le retrait est fait. */
function _signe(b) {
  const s = b && b.signatures;
  return !!(s && typeof s === 'object' && (s.locked || s.signedAt));
}

/**
 * Le nom hérité est-il, dans CET espace, une catégorie personnelle rattachée ailleurs qu'aux loyers ?
 * Rattaché à la ligne 211 (ou pas rattaché du tout) = l'héritage à normaliser.
 */
export function homonymePerso(db, nom) {
  const D = db || {};
  const alias = _own(D.catAlias, nom);
  if (alias && alias !== CATEGORIE_LOYERS) return true;
  const params = D.params && typeof D.params === 'object' ? D.params : {};
  // Même précédence que le classifieur (catCtxFromDb, js/core/utils.js) : catMapping prime, clé par clé,
  // sur legal2044Mapping. Seul le rattachement EFFECTIF décide.
  const m = _own(D.catMapping, nom) || _own(params.legal2044Mapping, nom);
  return !!(m && String(m) !== LIGNE_LOYERS);
}

/** Retire `locNouvIban` à la racine d'un bail. Renvoie true si le champ existait. */
function _purgerIbanRacine(b, stamp) {
  if (!b || typeof b !== 'object' || !Object.prototype.hasOwnProperty.call(b, 'locNouvIban')) return false;
  delete b.locNouvIban;
  if (!_signe(b)) stamp(b);
  return true;
}

function _ibanDansSnapshot(b) {
  const snap = b && b.signatures && b.signatures.bailSnapshot;
  return !!(snap && typeof snap === 'object' && snap.locNouvIban != null && snap.locNouvIban !== '');
}

/**
 * @param {object} db   le DB de l'app (muté EN PLACE : la restauration garde la référence vivante)
 * @param {{stamp?: Function}} [opts] `stamp` = `_stamp` de l'app (pose `_modifiedAt`)
 * @returns {{modifie:boolean, mouvements:number, reglesImport:number, categories:number,
 *   reglages:number, baux:number, historique:number, journal:number,
 *   ibanSnapshotsSignes:number, nomsSautes:string[]}}
 */
export function normaliserDonneesLoyers(db, opts) {
  const stamp = (opts && typeof opts.stamp === 'function') ? opts.stamp : _tamponDefaut;
  const r = { modifie: false, mouvements: 0, reglesImport: 0, categories: 0, reglages: 0,
    baux: 0, historique: 0, journal: 0, ibanSnapshotsSignes: 0, nomsSautes: [] };
  if (!db || typeof db !== 'object') return r;

  // ── 1. Catégories héritées → « Loyers encaissés » ─────────────────────────────────────────
  const noms = new Set();
  for (const n of CATEGORIES_LOYERS_HERITEES) {
    if (homonymePerso(db, n)) r.nomsSautes.push(n); else noms.add(n);
  }
  if (noms.size) {
    if (Array.isArray(db.mouvements)) {
      for (const m of db.mouvements) {
        if (m && typeof m === 'object' && noms.has(m.cat)) { m.cat = CATEGORIE_LOYERS; stamp(m); r.mouvements++; }
      }
    }
    if (Array.isArray(db.importRules)) {
      for (const x of db.importRules) {
        if (x && typeof x === 'object' && noms.has(x.cat)) { x.cat = CATEGORIE_LOYERS; r.reglesImport++; }
      }
    }
    if (Array.isArray(db.categories) && db.categories.some(c => noms.has(c))) {
      const avant = db.categories.length;
      db.categories = db.categories.filter(c => !noms.has(c));
      r.categories = avant - db.categories.length;
      if (!db.categories.includes(CATEGORIE_LOYERS)) db.categories.push(CATEGORIE_LOYERS);
    }
    // Réglages rattachés au nom hérité : sans objet une fois le nom disparu. Les tombstones
    // (`params._deletedCategories`) sont gardées : elles empêchent le nom de revenir.
    const params = (db.params && typeof db.params === 'object') ? db.params : null;
    for (const table of [db.catConfig, db.catMapping, db.catAlias, params && params.legal2044Mapping]) {
      if (!table || typeof table !== 'object') continue;
      for (const n of noms) {
        if (Object.prototype.hasOwnProperty.call(table, n)) { delete table[n]; r.reglages++; }
      }
    }
  }

  // ── 2. IBAN du locataire (RGPD) : la racine seulement, jamais le document signé ─────────────
  if (db.baux && typeof db.baux === 'object') {
    for (const b of Object.values(db.baux)) {
      if (_purgerIbanRacine(b, stamp)) r.baux++;
      if (_signe(b) && _ibanDansSnapshot(b)) r.ibanSnapshotsSignes++;
    }
  }
  if (Array.isArray(db.baux_historique)) {
    for (const b of db.baux_historique) {
      if (_purgerIbanRacine(b, stamp)) r.historique++;
      if (_signe(b) && _ibanDansSnapshot(b)) r.ibanSnapshotsSignes++;
    }
  }
  // Journal des baux signés : un changement portant sur l'IBAN est retiré ; une entrée qui n'a
  // plus aucun changement est supprimée logiquement (même règle que le filet SQL préparé dans
  // mockups/MIGRATION-LOYERS, NON appliqué en base).
  if (Array.isArray(db.baux_evenements)) {
    for (const e of db.baux_evenements) {
      if (!e || typeof e !== 'object' || !Array.isArray(e.changements)) continue;
      const garde = e.changements.filter(c => !(c && c.champ === 'locNouvIban'));
      if (garde.length === e.changements.length) continue;
      e.changements = garde;
      if (!garde.length) e._deleted = true;
      stamp(e);
      r.journal++;
    }
  }

  r.modifie = !!(r.mouvements || r.reglesImport || r.categories || r.reglages || r.baux || r.historique || r.journal);
  return r;
}
