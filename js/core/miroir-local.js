/**
 * core/miroir-local.js — le MIROIR LOCAL de la base en mode cloud, en IndexedDB
 * (CDC docs/CDC-STOCKAGE.md §3.8, lot 4 ; décision D4 B).
 *
 * ═══ POURQUOI ═════════════════════════════════════════════════════════════
 * En mode cloud, une copie complète de la base vit sur l'appareil. Elle sert au
 * démarrage hors ligne, à la remontée F1 des états des lieux faits hors ligne et
 * à la garde de déconnexion. Jusqu'au lot 3 elle vivait dans `localStorage`
 * (≈ 5 Mo par origine). Mesure réelle du 30/09 : 2,47 M caractères, soit près de
 * la moitié du plafond pour UN propriétaire. Un grand compte ne tiendrait plus.
 *
 * ═══ LE CONTRAT : ZÉRO PERTE D'EDL FAIT HORS LIGNE ═════════════════════════
 * IndexedDB est ASYNCHRONE : entre `saveDB` et la fin de la transaction, une
 * fermeture brutale de l'app peut perdre la dernière écriture. Les seules
 * écritures possibles hors ligne sont celles de l'EDL (invariant 19a), et F1 ne
 * remonte que les EDL. Donc :
 *   - la BASE COMPLÈTE part en IndexedDB (écrivain à coalescence, jamais plus
 *     d'une transaction en vol) ;
 *   - les ENREGISTREMENTS D'EDL pas encore engagés en IndexedDB sont écrits
 *     SYNCHRONEMENT dans un petit JOURNAL `localStorage` (avec l'horodatage
 *     `_ecrit_at`, comme avant), puis retirés du journal dès que la transaction
 *     IndexedDB qui les porte est terminée.
 * Toute lecture du miroir = base IndexedDB + journal superposé (le plus récent
 * gagne, par `_modifiedAt`). Un EDL enregistré est donc toujours sur le disque
 * au retour de `saveDB`, exactement comme avant ce lot.
 *
 * ═══ REPLI ═════════════════════════════════════════════════════════════════
 * IndexedDB absent, refusé (navigation privée selon les navigateurs), muet
 * (certains iOS au premier `open`), ou qui échoue en écriture → le miroir
 * complet repart en `localStorage` (comportement du lot 1, éviction comprise),
 * et le repli est SIGNALÉ (callback `signaler`, affiché par l'app).
 *
 * Décisions testables ici (adaptateurs injectés) ; l'IndexedDB réel est un
 * adaptateur (`adaptateurIndexedDB`) vérifié dans le navigateur.
 */
import { ecrireAvecLiberation, MIROIR_KEY, MIROIR_ECRIT_KEY } from './stockage-local.js';

export const MIROIR_IDB = 'immotrack_miroir';
export const MIROIR_STORE = 'miroir';
export const MIROIR_ENREG = 'courant';
/** Le journal synchrone des EDL pas encore engagés en IndexedDB (clé du registre, classe « principal »). */
export const JOURNAL_EDL_KEY = MIROIR_KEY + '_edl_attente';
/** Délai au-delà duquel un `indexedDB.open` muet est traité comme un refus (repli annoncé). */
export const DELAI_OUVERTURE_MS = 3000;

// ── Adaptateur IndexedDB réel ────────────────────────────────────────────────────────────────

/**
 * UNE connexion, gardée ouverte, fermée sur `versionchange` (sinon une suppression de la base au
 * logout resterait bloquée). Toutes les écritures en `durability: 'strict'` quand le navigateur le
 * permet : le miroir est un filet, pas un cache.
 */
export function adaptateurIndexedDB(fabrique, { nom = MIROIR_IDB, delaiMs = DELAI_OUVERTURE_MS } = {}) {
  let conn = null;
  let ouverture = null;
  const ouvrir = () => {
    if (conn) return Promise.resolve(conn);
    if (ouverture) return ouverture;
    ouverture = new Promise((res, rej) => {
      let fini = false;
      const minuterie = setTimeout(() => { if (!fini) { fini = true; rej(new Error('indexeddb-muet')); } }, delaiMs);
      let r;
      try { r = fabrique.open(nom, 1); } catch (e) { fini = true; clearTimeout(minuterie); rej(e); return; }
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(MIROIR_STORE)) db.createObjectStore(MIROIR_STORE); };
      r.onsuccess = () => {
        const db = r.result;
        if (fini) { try { db.close(); } catch (_e) {} return; }
        fini = true; clearTimeout(minuterie);
        conn = db;
        conn.onversionchange = () => { try { conn.close(); } catch (_e) {} conn = null; };
        res(conn);
      };
      r.onerror = () => { if (!fini) { fini = true; clearTimeout(minuterie); rej(r.error || new Error('indexeddb-erreur')); } };
      r.onblocked = () => { if (!fini) { fini = true; clearTimeout(minuterie); rej(new Error('indexeddb-bloque')); } };
    }).finally(() => { ouverture = null; });
    return ouverture;
  };
  const transaction = (db, mode) => {
    if (mode === 'readwrite') { try { return db.transaction(MIROIR_STORE, mode, { durability: 'strict' }); } catch (_e) { /* option inconnue */ } }
    return db.transaction(MIROIR_STORE, mode);
  };
  const operer = (mode, geste) => ouvrir().then(db => new Promise((res, rej) => {
    const t = transaction(db, mode);
    let valeur;
    t.oncomplete = () => res(valeur);
    t.onerror = () => rej(t.error || new Error('indexeddb-transaction'));
    t.onabort = () => rej(t.error || new Error('indexeddb-abandon'));
    const req = geste(t.objectStore(MIROIR_STORE));
    if (req) req.onsuccess = () => { valeur = req.result; };
  }));
  return {
    /**
     * La base existe-t-elle, SANS la créer ? (`indexedDB.open` crée la base : l'appeler au démarrage
     * recréerait une base vide juste après la purge RGPD du logout.) true / false, ou null si le
     * navigateur ne sait pas le dire (`databases()` absent) — l'appelant ouvre alors normalement.
     * Lève si IndexedDB est refusé.
     */
    existe: async () => {
      if (typeof fabrique.databases !== 'function') return null;
      const liste = await fabrique.databases();
      return Array.isArray(liste) && liste.some(d => d && d.name === nom);
    },
    lire: () => operer('readonly', s => s.get(MIROIR_ENREG)),
    ecrire: (enr) => operer('readwrite', s => s.put(enr, MIROIR_ENREG)),
    effacer: () => operer('readwrite', s => s.delete(MIROIR_ENREG)),
    supprimerBase: () => new Promise(res => {
      try { if (conn) conn.close(); } catch (_e) {}
      conn = null;
      try { const r = fabrique.deleteDatabase(nom); r.onsuccess = r.onerror = r.onblocked = () => res(); }
      catch (_e) { res(); }
    }),
  };
}

// ── Le miroir ─────────────────────────────────────────────────────────────────────────────────

const cleEdl = r => String(r && r.id) + '@@' + ((r && r._espaceId) || '');
const dateDe = r => Date.parse((r && r._modifiedAt) || '') || 0;

/** Superpose les EDL du journal sur une base (le plus récent gagne ; absent → ajouté). */
export function superposerJournal(db, journal) {
  const edlJ = journal && Array.isArray(journal.edl) ? journal.edl : [];
  if (!edlJ.length) return db;
  const base = db && typeof db === 'object' ? db : {};
  const liste = Array.isArray(base.edl) ? base.edl.slice() : [];
  const index = new Map(liste.map((r, i) => [cleEdl(r), i]));
  for (const r of edlJ) {
    if (!r) continue;
    const i = index.get(cleEdl(r));
    if (i == null) { index.set(cleEdl(r), liste.length); liste.push(r); }
    else if (dateDe(r) >= dateDe(liste[i])) liste[i] = r;
  }
  return Object.assign({}, base, { edl: liste });
}

/**
 * @param {object} o
 * @param {object|null} o.idb       adaptateur { lire, ecrire, effacer, supprimerBase } (ou null : pas d'IndexedDB)
 * @param {Storage} o.stockage       localStorage (journal, horodatage, repli)
 * @param {object} [o.cles]          { miroir, ecritA, journal }
 * @param {Function} [o.horloge]
 * @param {Function} [o.signaler]    ({ type, erreur }) → l'app l'affiche ('repli', 'echec-ecriture', 'transfert-echec')
 */
export function creerMiroir({ idb, stockage, cles = {}, horloge = () => Date.now(), signaler = () => {} }) {
  const K = { miroir: cles.miroir || MIROIR_KEY, ecritA: cles.ecritA || MIROIR_ECRIT_KEY, journal: cles.journal || JOURNAL_EDL_KEY };
  let backend = null;           // null (pas initialisé) | 'indexeddb' | 'localStorage'
  let presentIdb = false;       // un enregistrement existe en IndexedDB
  let ferme = false;            // après la purge du logout : plus aucune écriture
  let engages = new Map();      // cleEdl → JSON de l'EDL tel qu'engagé en IndexedDB
  let dernier = null;           // la base à écrire (référence vivante, la plus récente)
  let enVol = null;             // promesse de la boucle d'écriture en cours
  let aRefaire = false;
  let avertir = signaler;

  const lireJournal = () => { try { return JSON.parse(stockage.getItem(K.journal) || 'null'); } catch (_e) { return null; } };
  const edlEnAttente = (db) => (db && Array.isArray(db.edl) ? db.edl : []).filter(r => r && engages.get(cleEdl(r)) !== JSON.stringify(r));

  /** Écrit (ou retire) le journal des EDL non engagés + l'horodatage, SYNCHRONEMENT. */
  function ecrireJournal(db, ecritA, avecHorodatage) {
    const attente = edlEnAttente(db);
    const paires = [];
    if (attente.length) paires.push([K.journal, JSON.stringify({ ecritA, edl: attente })]);
    if (avecHorodatage) paires.push([K.ecritA, String(ecritA)]);
    if (!attente.length) { try { stockage.removeItem(K.journal); } catch (_e) {} }
    return paires.length ? ecrireAvecLiberation(stockage, paires) : { ok: true, liberees: [], caracteresLiberes: 0, erreur: null };
  }

  function ecrireLocal(db, ecritA) {
    const r = ecrireAvecLiberation(stockage, [[K.miroir, JSON.stringify(db)], [K.ecritA, String(ecritA)]]);
    if (!r.ok) throw r.erreur;
    return true;
  }

  function basculerRepli(motif, erreur) {
    backend = 'localStorage';
    avertir({ type: motif, erreur });
  }

  function lancer() {
    if (enVol) { aRefaire = true; return enVol; }
    enVol = (async () => {
      await null;                                           // après le retour de saveDB (même tâche, microtâche)
      do {
        aRefaire = false;
        if (ferme || backend !== 'indexeddb' || !dernier) break;
        const cible = dernier;
        const ecritA = horloge();
        const json = JSON.stringify(cible);
        const eng = new Map();
        for (const r of (Array.isArray(cible.edl) ? cible.edl : [])) if (r) eng.set(cleEdl(r), JSON.stringify(r));
        try {
          await idb.ecrire({ v: 1, ecritA, json });
          presentIdb = true;
          engages = eng;
          if (!ferme) ecrireJournal(dernier, parseInt(stockage.getItem(K.ecritA) || '0', 10) || ecritA, false);
        } catch (e) {
          // IndexedDB refuse l'écriture : le journal garde les EDL ; le miroir complet repart en local.
          basculerRepli('echec-ecriture', e);
          try { ecrireLocal(dernier, horloge()); try { stockage.removeItem(K.journal); } catch (_e) {} }
          catch (e2) { avertir({ type: 'echec-repli', erreur: e2 }); }
          break;
        }
      } while (aRefaire);
    })().finally(() => { enVol = null; });
    return enVol;
  }

  return {
    /** Le backend actif : null (pas encore initialisé), 'indexeddb' ou 'localStorage'. */
    backend: () => backend,
    pret: () => backend !== null && !ferme,
    /** Brancher l'affichage des signaux (repli, échec) une fois l'app prête. */
    surSignal(fn) { if (typeof fn === 'function') avertir = fn; },

    /**
     * Ouvre IndexedDB et TRANSFÈRE un miroir `localStorage` existant : écrire, RELIRE, COMPARER,
     * puis seulement supprimer la clé locale. Tout échec → rien n'est supprimé, repli local annoncé.
     */
    async initialiser() {
      if (backend) return { backend, transfert: 'deja' };
      if (!idb) { basculerRepli('repli', new Error('indexeddb-absent')); return { backend, transfert: 'aucun' }; }
      // Rien à transférer et aucune base : on n'OUVRE pas (ouvrir crée la base — elle réapparaîtrait,
      // vide, juste après la purge du logout). Ouverture différée à la première écriture.
      if (stockage.getItem(K.miroir) == null && typeof idb.existe === 'function') {
        let existe;
        try { existe = await idb.existe(); }
        catch (e) { basculerRepli('repli', e); return { backend, transfert: 'aucun' }; }
        if (existe === false) { backend = 'indexeddb'; presentIdb = false; return { backend, transfert: 'aucun' }; }
      }
      let enr;
      try { enr = await idb.lire(); }
      catch (e) { basculerRepli('repli', e); return { backend, transfert: 'aucun' }; }
      presentIdb = !!(enr && enr.json);
      let transfert = 'aucun';
      const brut = stockage.getItem(K.miroir);
      if (brut != null) {
        const ecritLs = parseInt(stockage.getItem(K.ecritA) || '0', 10) || 0;
        if (!presentIdb || (Number(enr.ecritA) || 0) < ecritLs) {
          try {
            await idb.ecrire({ v: 1, ecritA: ecritLs || horloge(), json: brut });
            const relu = await idb.lire();
            if (!relu || relu.json !== brut) throw new Error('transfert-non-conforme');
            presentIdb = true;
            transfert = 'fait';
          } catch (e) {
            basculerRepli('transfert-echec', e);           // la clé locale RESTE : rien n'est perdu
            return { backend, transfert: 'echec' };
          }
        } else transfert = 'local-perime';
        try { stockage.removeItem(K.miroir); } catch (_e) {}
      }
      backend = 'indexeddb';
      return { backend, transfert };
    },

    /**
     * Écriture DEMANDÉE par saveDB. SYNCHRONE pour ce qui compte : journal des EDL non engagés +
     * horodatage (ou miroir complet en repli). La base complète part ensuite en IndexedDB, coalescée.
     * Contrat identique à `_miroirEcrire` : rend true, ou LÈVE l'erreur de stockage.
     * `opts.horodater === false` : n'avance pas `_ecrit_at` (rebase au login, restauration — l'état
     * écrit EST celui du cloud, il n'y a pas de travail local à remonter), comme avant ce lot.
     */
    ecrire(db, opts) {
      if (ferme) return true;
      const horodater = !(opts && opts.horodater === false);
      const ecritA = horloge();
      if (backend !== 'indexeddb') {
        if (horodater) return ecrireLocal(db, ecritA);
        const r0 = ecrireAvecLiberation(stockage, [[K.miroir, JSON.stringify(db)]]);
        if (!r0.ok) throw r0.erreur;
        return true;
      }
      dernier = db;
      const r = ecrireJournal(db, ecritA, horodater);
      lancer();
      if (!r.ok) throw r.erreur;
      return true;
    },

    /** La vue du miroir : base (IndexedDB, sinon local) + journal des EDL superposé. null si rien. */
    async lire() {
      let db = null;
      // `presentIdb` faux = aucune base connue : ne pas l'ouvrir (ce serait la créer).
      if (backend !== 'localStorage' && idb && (presentIdb || backend === null)) {
        try { const enr = await idb.lire(); if (enr && enr.json) db = JSON.parse(enr.json); } catch (_e) { db = null; }
      }
      if (!db) { try { const brut = stockage.getItem(K.miroir); if (brut) db = JSON.parse(brut); } catch (_e) { db = null; } }
      const j = lireJournal();
      if (j && Array.isArray(j.edl) && j.edl.length) db = superposerJournal(db, j);
      return db;
    },

    /** Y a-t-il un miroir sur l'appareil ? (synchrone : IndexedDB connu, journal ou clé locale) */
    present() {
      if (presentIdb) return true;
      try { return !!stockage.getItem(K.journal) || !!stockage.getItem(K.miroir); } catch (_e) { return false; }
    },

    /** Attend la fin des écritures en vol (tests, purge). */
    async attendre() { while (enVol) { try { await enVol; } catch (_e) {} } },

    /**
     * Changement d'utilisateur au LOGIN (synchrone) : journal et clé locale retirés tout de suite ;
     * l'effacement IndexedDB est mis en file AVANT toute écriture suivante (même connexion, ordre des
     * transactions) — le rebase du login qui suit écrit donc bien après.
     */
    oublier() {
      dernier = null; engages = new Map(); presentIdb = false;
      try { stockage.removeItem(K.journal); } catch (_e) {}
      try { stockage.removeItem(K.miroir); } catch (_e) {}
      if (idb && backend === 'indexeddb') {
        const p = (enVol || Promise.resolve()).then(() => idb.effacer()).catch(e => avertir({ type: 'echec-effacement', erreur: e }));
        return p;
      }
      return Promise.resolve();
    },

    /** Logout (RGPD) : plus aucune écriture, base IndexedDB SUPPRIMÉE, journal et clé locale retirés. */
    async vider() {
      ferme = true; dernier = null; engages = new Map(); presentIdb = false;
      try { stockage.removeItem(K.journal); } catch (_e) {}
      try { stockage.removeItem(K.miroir); } catch (_e) {}
      while (enVol) { try { await enVol; } catch (_e) {} }
      if (idb) await idb.supprimerBase();
    },
  };
}

// ── L'instance de l'app (partagée par js/main.js → index.html et par supabase-entry.js) ─────────
let _instance = null;
/** Le miroir de l'app : même module = même instance pour tous ses importateurs. */
export function miroir() {
  if (!_instance) {
    const fabrique = (typeof indexedDB !== 'undefined') ? indexedDB : null;
    _instance = creerMiroir({
      idb: fabrique ? adaptateurIndexedDB(fabrique) : null,
      stockage: (typeof localStorage !== 'undefined') ? localStorage : null,
    });
  }
  return _instance;
}
