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

  async function maj(item, patch) {
    const x = { ...item, ...patch, majLe: maintenant().toISOString() };
    await store.put(x);
    try { onChange(x); } catch (_) { /* l'UI ne bloque jamais la file */ }
    return x;
  }

  async function un(item) {
    let x = item;
    if (x.etape === ETAPES.AUDIO) {
      if (!x.audio) return maj(x, { erreur: { code: 'vide' } });
      const r = await client.transcrire(blob(x.audio, x.mime), { task: x.task || 'edl-piece', mime: x.mime });
      if (!r.ok) return maj(x, { erreur: { code: r.code, motif: r.motif || null, limites: r.limites || null }, essais: (x.essais || 0) + 1 });
      if (!String(r.text || '').trim()) return maj(x, { audio: null, erreur: { code: 'vide' } });   // rien entendu : l'audio part quand même
      x = await maj(x, { etape: ETAPES.TEXTE, audio: null, texte: r.text, segments: r.segments || [], audioSec: r.audioSec || x.duree || 0, erreur: null, essais: 0 });
    }
    if (x.etape === ETAPES.TEXTE) {
      const input = { ...(x.entree || {}), texte: x.texte };
      const r = await client.structurer(x.task || 'edl-piece', input);
      if (!r.ok) return maj(x, { erreur: { code: r.code, motif: r.motif || null, limites: r.limites || null }, essais: (x.essais || 0) + 1 });
      x = await maj(x, { etape: ETAPES.PRET, resultat: r.data, rejets: r.rejets || 0, modele: r.modele || '', erreur: null, essais: 0, decisions: x.decisions || {} });
    }
    return x;
  }

  const api = {
    /** Ajoute une dictée (audio = ArrayBuffer). Renvoie l'élément créé. */
    async ajouter({ audio, mime, duree = 0, task = 'edl-piece', cible = 'piece', entree, contexte = {} }) {
      const x = {
        id: idAleatoire(), cree: maintenant().toISOString(), task, cible,
        audio: audio || null, mime: String(mime || 'audio/webm'), duree: Math.round(duree), taille: audio ? audio.byteLength : 0,
        entree: entree || null, contexte, etape: ETAPES.AUDIO, erreur: null, essais: 0, decisions: {},
      };
      await store.put(x);
      try { onChange(x); } catch (_) { /* rien */ }
      return x;
    },
    async lister() {
      const xs = await store.all();
      return xs.sort((a, b) => String(a.cree).localeCompare(String(b.cree)));
    },
    get: (id) => store.get(id),
    /** Traite toutes les dictées en attente, UNE à la fois. Jamais deux traitements simultanés. */
    traiter() {
      if (enCours) return enCours;
      enCours = (async () => {
        const bilan = { traitees: 0, pretes: 0, erreurs: 0 };
        try {
          for (const x of await api.lister()) {
            if (x.etape === ETAPES.PRET) continue;
            if (x.erreur && !CODES_REESSAYABLES.has(x.erreur.code)) continue;
            let y;
            try { y = await un(x); } catch (_) {
              const cur = (await store.get(x.id)) || x;           // état le plus récent (l'audio a pu être supprimé)
              y = await maj(cur, { erreur: { code: 'unavailable' }, essais: (cur.essais || 0) + 1 });
            }
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
      const x = await store.get(id);
      if (!x) return null;
      await maj(x, { erreur: null });
      await api.traiter();
      return store.get(id);
    },
    /** Enregistre les décisions de relecture (accepter / ignorer…), sans contenu nouveau. */
    async decisions(id, decisions) {
      const x = await store.get(id);
      return x ? maj(x, { decisions: { ...(x.decisions || {}), ...decisions } }) : null;
    },
    /** Complète le contexte (ex. identifiant de l'EDL attribué après la dictée). */
    async contexte(id, patch) {
      const x = await store.get(id);
      return x ? maj(x, { contexte: { ...(x.contexte || {}), ...patch } }) : null;
    },
    /** Supprime une dictée (geste explicite, ou fin de relecture : transcription effacée). */
    async supprimer(id) {
      await store.del(id);
      try { onChange(null); } catch (_) { /* rien */ }
    },
    /** Purge les dictées abandonnées depuis plus de PURGE_JOURS (EDL jamais enregistré…). */
    async purger() {
      const limite = maintenant().getTime() - PURGE_JOURS * 86400000;
      let n = 0;
      for (const x of await store.all()) if (Date.parse(x.majLe || x.cree) < limite) { await store.del(x.id); n++; }
      return n;
    },
  };
  return api;
}
