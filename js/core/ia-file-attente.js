/**
 * js/core/ia-file-attente.js — FILE D'ATTENTE DES DICTÉES (chantier EDL-VOIX-IA, lot B1).
 *
 * Règles (CDC §3, prompt §9) :
 *   - une dictée n'est JAMAIS perdue en silence : elle vit dans IndexedDB jusqu'à ce que
 *     l'utilisateur ait fini de relire ses propositions, ou qu'il la supprime lui-même ;
 *   - hors ligne, elle attend ; elle part seule au retour du réseau (une à la fois) ;
 *   - l'AUDIO est supprimé dès que la transcription a réussi (jamais conservé au-delà) ;
 *   - la transcription et les propositions restent sur l'appareil le temps de la relecture, puis
 *     sont effacées (terminer) ; seul le texte validé entre dans l'EDL ;
 *   - jamais de blocage de l'EDL : la file tourne en tâche de fond, l'app n'attend rien d'elle.
 *
 * Étapes d'une dictée : 'audio' (à transcrire) → 'texte' (à structurer) → 'pret' (à relire).
 * Une erreur se pose à côté de l'étape ({ code, motif }) ; une erreur « réessayable » (réseau, service,
 * session) est retentée au prochain passage, les autres attendent un geste (Réessayer / Supprimer).
 *
 * Le magasin (`store`) est injecté : storeIndexedDB() dans l'app, storeMemoire() dans les tests.
 * L'audio est stocké en ArrayBuffer + type (les Blob en IndexedDB sont capricieux sur l'ancien Safari).
 */
import { CODES_REESSAYABLES } from './ia-client.js';

export const ETAPES = Object.freeze({ AUDIO: 'audio', TEXTE: 'texte', PRET: 'pret' });
export const PURGE_JOURS = 30;

export function storeMemoire() {
  const m = new Map();
  return {
    async all() { return [...m.values()].map((x) => ({ ...x })); },
    async get(id) { const x = m.get(id); return x ? { ...x } : null; },
    async put(x) { m.set(x.id, { ...x }); },
    async del(id) { m.delete(id); },
  };
}

export function storeIndexedDB({ nom = 'propryo_ia', magasin = 'dictees', idb } = {}) {
  const fabrique = idb || (typeof indexedDB !== 'undefined' ? indexedDB : null);
  let ouverture = null;
  const ouvrir = () => {
    if (!fabrique) return Promise.reject(new Error('indexeddb_absent'));
    if (!ouverture) {
      ouverture = new Promise((res, rej) => {
        const rq = fabrique.open(nom, 1);
        rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains(magasin)) db.createObjectStore(magasin, { keyPath: 'id' }); };
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => { ouverture = null; rej(rq.error); };
      });
    }
    return ouverture;
  };
  const tx = async (mode, fn) => {
    const db = await ouvrir();
    return new Promise((res, rej) => {
      const t = db.transaction(magasin, mode);
      const s = t.objectStore(magasin);
      let out;
      const rq = fn(s);
      if (rq) rq.onsuccess = () => { out = rq.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    all: () => tx('readonly', (s) => s.getAll()).then((x) => x || []),
    get: (id) => tx('readonly', (s) => s.get(id)).then((x) => x || null),
    put: (x) => tx('readwrite', (s) => s.put(x)),
    del: (id) => tx('readwrite', (s) => s.delete(id)),
  };
}

function idAleatoire() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (_) { /* repli */ }
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * @param {object} o
 * @param {object} o.store      magasin { all, get, put, del }
 * @param {object} o.client     client IA (creerClientIA) : transcrire(blob,{task,mime}), structurer(task,input)
 * @param {Function} [o.maintenant]  () => Date
 * @param {Function} [o.onChange]    (item|null) — appelé après chaque changement (rafraîchir l'UI)
 * @param {Function} [o.creerBlob]   (buffer, type) => Blob (injectable)
 */
export function creerFileDictees({ store, client, maintenant = () => new Date(), onChange = () => {}, creerBlob } = {}) {
  const blob = creerBlob || ((buf, type) => new Blob([buf], { type }));
  let enCours = null;
  const jour = () => maintenant().toISOString().slice(0, 10);

  // Toutes les écritures passent en SÉRIE : pas de lecture-modification-écriture entrelacée (deux
  // décisions rapprochées, une suppression pendant un traitement, un contexte posé en parallèle).
  let chaine = Promise.resolve();
  const serie = (fn) => { const p = chaine.then(fn, fn); chaine = p.catch(() => {}); return p; };
  const notifier = (x) => { try { onChange(x); } catch (_) { /* l'UI ne bloque jamais la file */ } };

  /** Fusionne `patch` (objet, ou fonction de l'état RELU) sur l'état actuel en base. Si la dictée a été
   *  supprimée entre-temps, rien n'est réécrit (une suppression demandée est respectée) : rend null. */
  function maj(id, patch) {
    return serie(async () => {
      const cur = await store.get(id);
      if (!cur) return null;
      const p = typeof patch === 'function' ? patch(cur) : patch;
      const x = { ...cur, ...p, majLe: maintenant().toISOString() };
      await store.put(x);
      notifier(x);
      return x;
    });
  }
  const erreur = (r) => ({ erreur: { code: r.code, motif: r.motif || null, limites: r.limites || null, le: jour() } });

  async function un(item) {
    let x = item;
    if (x.etape === ETAPES.AUDIO) {
      if (!x.audio) return maj(x.id, { erreur: { code: 'vide', le: jour() } });
      const r = await client.transcrire(blob(x.audio, x.mime), { task: x.task || 'edl-piece', mime: x.mime });
      if (!r.ok) return maj(x.id, (c) => ({ ...erreur(r), essais: (c.essais || 0) + 1 }));
      // Rien entendu : l'audio est GARDÉ (« Réessayer » ou « Supprimer », au choix de l'utilisateur).
      if (!String(r.text || '').trim()) return maj(x.id, { erreur: { code: 'vide', le: jour() } });
      x = await maj(x.id, { etape: ETAPES.TEXTE, audio: null, texte: r.text, segments: r.segments || [], audioSec: r.audioSec || x.duree || 0, erreur: null, essais: 0 });
      if (!x) return null;
    }
    if (x.etape === ETAPES.TEXTE) {
      const r = await client.structurer(x.task || 'edl-piece', { ...(x.entree || {}), texte: x.texte });
      if (!r.ok) return maj(x.id, (c) => ({ ...erreur(r), essais: (c.essais || 0) + 1 }));
      x = await maj(x.id, (c) => ({ etape: ETAPES.PRET, resultat: r.data, rejets: r.rejets || 0, modele: r.modele || '', erreur: null, essais: 0, decisions: c.decisions || {} }));
    }
    return x;
  }

  /** Réessayée seule au prochain passage ? (réseau, service, session, IA momentanément désactivée,
   *  quota d'un jour PASSÉ). Les autres attendent un geste (Réessayer / Supprimer). */
  function reessayableSeule(e) {
    if (!e) return true;
    if (CODES_REESSAYABLES.has(e.code) || e.code === 'disabled') return true;
    return e.code === 'quota' && e.le !== jour();
  }

  const api = {
    /** Ajoute une dictée (audio = ArrayBuffer). Renvoie l'élément créé. */
    ajouter({ audio, mime, duree = 0, task = 'edl-piece', cible = 'piece', entree, contexte = {} }) {
      const x = {
        id: idAleatoire(), cree: maintenant().toISOString(), task, cible,
        audio: audio || null, mime: String(mime || 'audio/webm'), duree: Math.round(duree), taille: audio ? audio.byteLength : 0,
        entree: entree || null, contexte, etape: ETAPES.AUDIO, erreur: null, essais: 0, decisions: {},
      };
      return serie(async () => { await store.put(x); notifier(x); return x; });
    },
    async lister() {
      const xs = await store.all();
      return xs.sort((a, b) => String(a.cree).localeCompare(String(b.cree)));
    },
    get: (id) => store.get(id),
    reessayableSeule,
    /** Traite toutes les dictées en attente, UNE à la fois. Jamais deux traitements simultanés. */
    traiter() {
      if (enCours) return enCours;
      enCours = (async () => {
        const bilan = { traitees: 0, pretes: 0, erreurs: 0 };
        try {
          for (const x of await api.lister()) {
            if (x.etape === ETAPES.PRET) continue;
            if (x.erreur && !reessayableSeule(x.erreur)) continue;
            let y;
            try { y = await un(x); } catch (_) {
              y = await maj(x.id, (c) => ({ erreur: { code: 'unavailable', le: jour() }, essais: (c.essais || 0) + 1 }));
            }
            if (!y) continue;                                   // supprimée pendant le traitement
            bilan.traitees++;
            if (y.etape === ETAPES.PRET) bilan.pretes++;
            if (y.erreur) {
              bilan.erreurs++;
              if (y.erreur.code === 'offline') break;            // inutile d'insister hors ligne
            }
          }
        } finally { enCours = null; }
        return bilan;
      })();
      return enCours;
    },
    /** Lève l'erreur d'une dictée (geste « Réessayer ») puis relance la file. */
    async reessayer(id) {
      await maj(id, { erreur: null });
      await api.traiter();
      return store.get(id);
    },
    /** Enregistre les décisions de relecture (fusion sur l'état relu : aucune décision perdue). */
    decisions(id, decisions) {
      return maj(id, (c) => ({ decisions: { ...(c.decisions || {}), ...decisions } }));
    },
    /** Complète le contexte (ex. identifiant de l'EDL attribué après la dictée). */
    contexte(id, patch) {
      return maj(id, (c) => ({ contexte: { ...(c.contexte || {}), ...patch } }));
    },
    /** Supprime une dictée (geste explicite, ou fin de relecture : transcription effacée). */
    supprimer(id) {
      return serie(async () => { await store.del(id); notifier(null); });
    },
    /** Purge les dictées abandonnées depuis plus de PURGE_JOURS (EDL jamais enregistré…). */
    purger() {
      const limite = maintenant().getTime() - PURGE_JOURS * 86400000;
      return serie(async () => {
        let n = 0;
        for (const x of await store.all()) if (Date.parse(x.majLe || x.cree) < limite) { await store.del(x.id); n++; }
        return n;
      });
    },
  };
  return api;
}
