/**
 * __tests__/helpers/supabase-offline-auth.test.js — chantier EDL TERRAIN, lot 4.
 *
 * ═══ LA FAILLE F4, PROUVÉE AVANT D'ÉCRIRE LE LOT ═══════════════════════════
 * CDC docs/CDC-EDL.md §3ter, F4 :
 *   « Point rassurant, à PROUVER par un test réel : supabase-js 2.110.2 embarque
 *     AuthRetryableFetchError / isAuthRetryableFetchError — il distingue une
 *     panne réseau d'un jeton refusé et devrait réessayer sans émettre
 *     SIGNED_OUT. C'EST LA CHARNIÈRE DE TOUT LE MODE HORS LIGNE : si ce
 *     comportement n'est pas celui-là, le lot 4 ne tient pas. »
 *
 * Ce fichier ne teste pas notre code : il teste la BIBLIOTHÈQUE VENDORÉE telle
 * qu'elle est livrée (js/vendor/supabase-js-2.110.2.esm.js), avec un `fetch`
 * qui échoue comme il échoue dans un appartement sans réseau. C'est la seule
 * façon honnête de répondre à la question.
 *
 * Si un jour ce fichier rougit après une mise à jour de supabase-js, le mode
 * hors ligne du lot 4 doit être ré-instruit avant de déployer quoi que ce soit.
 */
import { describe, it, expect } from 'vitest';
import { createClient } from '../../js/vendor/supabase-js-2.110.2.esm.js';

const URL_SUPA = 'https://exemple.supabase.co';
const ANON = 'cle-anon-de-test';

/** Une session persistée valide, comme celle laissée par un login la veille. */
function sessionPersistee({ expiresInSec = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'jeton-acces',
    refresh_token: 'jeton-refresh',
    token_type: 'bearer',
    expires_in: expiresInSec,
    expires_at: now + expiresInSec,
    user: { id: 'user-1', email: 'didier@exemple.fr', aud: 'authenticated', role: 'authenticated' },
  };
}

/** Stockage mémoire, à la place de localStorage (l'app en a un vrai). */
function stockage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
    _tout: () => Object.fromEntries(m),
  };
}

const CLE_SESSION = 'sb-exemple-auth-token';

function client({ fetchImpl, initial }) {
  return createClient(URL_SUPA, ANON, {
    auth: {
      storage: stockage(initial),
      storageKey: CLE_SESSION,
      persistSession: true,
      autoRefreshToken: false,      // on isole l'appel, pas la boucle de refresh
      detectSessionInUrl: false,    // pas de window ici
    },
    global: { fetch: fetchImpl },
  });
}

/** Le `fetch` d'un téléphone sans réseau : il REJETTE (il ne rend pas un 4xx). */
const fetchSansReseau = () => Promise.reject(new TypeError('Failed to fetch'));

/** Le serveur répond, et refuse le jeton. */
const fetchJetonRefuse = () => Promise.resolve(new Response(
  JSON.stringify({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }),
  { status: 401, headers: { 'Content-Type': 'application/json' } }
));

describe('F4 — panne réseau ≠ jeton refusé (charnière du hors ligne)', () => {
  it('getUser() sans réseau échoue en erreur RÉESSAYABLE, pas en session morte', async () => {
    const sb = client({ fetchImpl: fetchSansReseau, initial: { [CLE_SESSION]: JSON.stringify(sessionPersistee()) } });
    const { data, error } = await sb.auth.getUser();
    expect(data.user).toBeNull();
    expect(error).toBeTruthy();
    // Le nom porté par supabase-js pour une panne de transport.
    expect(error.name).toBe('AuthRetryableFetchError');
    // Et la sémantique qui va avec : c'est un incident réseau, pas un refus.
    expect(error.status).toBe(0);
  });

  it('un jeton REFUSÉ, lui, ne se présente PAS comme réessayable', async () => {
    const sb = client({ fetchImpl: fetchJetonRefuse, initial: { [CLE_SESSION]: JSON.stringify(sessionPersistee()) } });
    const { data, error } = await sb.auth.getUser();
    expect(data.user).toBeNull();
    expect(error).toBeTruthy();
    expect(error.name).not.toBe('AuthRetryableFetchError');
    expect(error.status).toBe(401);
  });

  it('sans réseau, la session persistée n’est PAS effacée du stockage', async () => {
    const store = stockage({ [CLE_SESSION]: JSON.stringify(sessionPersistee()) });
    const sb = createClient(URL_SUPA, ANON, {
      auth: { storage: store, storageKey: CLE_SESSION, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchSansReseau },
    });
    await sb.auth.getUser();
    expect(store.getItem(CLE_SESSION)).toBeTruthy();
    // …et elle reste lisible EN LOCAL : c'est ce sur quoi le lot 4 s'appuie
    // pour ouvrir l'app hors ligne (getSession ne va pas au réseau).
    const { data } = await sb.auth.getSession();
    expect(data.session).toBeTruthy();
    expect(data.session.user.id).toBe('user-1');
  });

  it('sans réseau, AUCUN événement SIGNED_OUT n’est émis', async () => {
    const sb = client({ fetchImpl: fetchSansReseau, initial: { [CLE_SESSION]: JSON.stringify(sessionPersistee()) } });
    const evts = [];
    const { data: sub } = sb.auth.onAuthStateChange((evt, sess) => { evts.push({ evt, aSession: !!sess }); });
    await sb.auth.getUser();
    await sb.auth.getUser();
    await new Promise(r => setTimeout(r, 60));
    try { sub.subscription.unsubscribe(); } catch (_) {}
    // C'est LA phrase du CDC : une panne réseau ne doit jamais déclencher la
    // bannière « ta session a expiré » (invariant 19i).
    expect(evts.filter(e => e.evt === 'SIGNED_OUT')).toHaveLength(0);
  });

  it('getSession() ne touche pas au réseau : il répond même si fetch explose', async () => {
    let appelsReseau = 0;
    const sb = client({
      fetchImpl: () => { appelsReseau++; return Promise.reject(new TypeError('Failed to fetch')); },
      initial: { [CLE_SESSION]: JSON.stringify(sessionPersistee()) },
    });
    const { data, error } = await sb.auth.getSession();
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
    expect(appelsReseau).toBe(0);
  });
});
