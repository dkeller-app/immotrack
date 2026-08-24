/**
 * __tests__/helpers/logout-contrat.test.js — chantier EDL TERRAIN, lot 4 (F2).
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══════════════════════════════════════════
 * `logout()` a changé de contrat : il ne déconnecte plus inconditionnellement,
 * il peut RENDRE UN REFUS. Or `grep logout __tests__/` ne trouvait rien — le
 * contrat de retour n'était vérifié nulle part. C'est ce trou qui a laissé
 * passer le bloquant de l'audit (la déconnexion hors ligne détruisait l'EDL),
 * et qui laissait survivre une mutation supprimant purement et simplement la
 * décision de refus.
 *
 * `createBoot` est importable (aucun effet de bord au chargement) : on
 * l'EXÉCUTE avec un client supabase de laboratoire et un moteur de synchro
 * doublé, et on regarde ce que `logout` rend et ce qu'il a réellement fait.
 */
import { describe, it, expect } from 'vitest';
import { createBoot } from '../../js/app/supabase-boot.js';

/** Le strict minimum qu'exige `createBoot` d'un client supabase-js. */
function clientFactice(journal) {
  return {
    auth: {
      signOut: async () => { journal.push('signOut'); return { error: null }; },
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({}),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  };
}

/**
 * Un `from()` de laboratoire : chaînable, et qui résout comme le ferait
 * PostgREST. Suffit à laisser le moteur de synchro écrire sa configuration
 * d'espace sans réseau — c'est tout ce dont `logout` a besoin pour aller au
 * bout de son flush final.
 */
function tableFactice(reponse) {
  const chaine = {
    upsert: () => chaine, insert: () => chaine, update: () => chaine, delete: () => chaine,
    select: () => chaine, eq: () => chaine, in: () => chaine, is: () => chaine,
    order: () => chaine, range: () => chaine, limit: () => chaine, single: () => chaine,
    maybeSingle: () => chaine,
    then: (res) => res(reponse),
  };
  return chaine;
}

/**
 * Monte l'API AVEC un vrai moteur de synchro câblé — donc en exécutant la
 * décision réelle de `logout`, pas une doublure de cette décision. C'est la
 * seule façon de vérifier le SITE D'APPEL : un test qui n'éprouverait que la
 * fonction du module resterait vert si `logout` cessait de l'appeler.
 */
function monterAvecMoteur({ reponse = { data: [], error: null } } = {}) {
  const journal = [];
  const client = clientFactice(journal);
  client.from = () => tableFactice(reponse);
  const api = createBoot(client);
  api.wireStores({
    espaces: [{ espaceId: 'e1', ownerId: 'o1' }],
    getDB: () => ({ baux: {}, logements: [] }),
    schedule: () => {},
  });
  return { api, journal };
}

describe('logout — le CONTRAT de retour (invariant 19g)', () => {
  it('sans moteur de synchro câblé, la déconnexion aboutit et rend { ok: true }', async () => {
    const journal = [];
    const api = createBoot(clientFactice(journal));
    const r = await api.logout();
    expect(r).toEqual({ ok: true });
    expect(journal).toContain('signOut');
  });

  it('le contrat rend TOUJOURS un objet — jamais undefined', async () => {
    // Trois appelants testent `r.ok === false`. Un `undefined` les ferait tous
    // enchaîner sur la purge comme si la déconnexion avait réussi.
    const journal = [];
    const api = createBoot(clientFactice(journal));
    for (const opts of [undefined, {}, { forcer: true }]) {
      const r = await api.logout(opts);
      expect(r && typeof r).toBe('object');
      expect(typeof r.ok).toBe('boolean');
    }
  });

  it('un client sans `auth` est refusé à la construction, pas à l’usage', () => {
    expect(() => createBoot(null)).toThrow();
    expect(() => createBoot({ from: () => ({}) })).toThrow();
  });
});

/**
 * La RÈGLE de comptage, telle que `logout` l'applique. Elle vivait en double :
 * une version écrite à la main dans `supabase-boot.js` (vivante, non testée) et
 * une version dans le module (testée, morte). Il n'en reste qu'une, et c'est
 * celle-ci qu'on éprouve — sur les formes de résumé que le moteur produit
 * réellement (`{coll, key}` par enregistrement).
 */
describe('la règle de comptage appliquée par logout (source unique)', () => {
  it('un résumé PROPRE autorise la déconnexion', async () => {
    const { peutSeDeconnecter } = await import('../../js/core/offline-boot.js');
    const s = { upserts: [{ coll: 'edl' }], errors: [], conflicts: [], skipped: [] };
    const reste = s.errors.length + s.conflicts.length + s.skipped.length;
    expect(peutSeDeconnecter({ ecrituresEnAttente: reste }).peut).toBe(true);
  });

  it('erreurs, conflits et refus comptent TOUS comme du travail non parti', async () => {
    const { peutSeDeconnecter } = await import('../../js/core/offline-boot.js');
    for (const s of [
      { errors: [{ coll: 'edl' }], conflicts: [], skipped: [] },
      { errors: [], conflicts: [{ coll: 'edl' }], skipped: [] },
      { errors: [], conflicts: [], skipped: [{ coll: 'edl' }] },
    ]) {
      const reste = s.errors.length + s.conflicts.length + s.skipped.length;
      expect(peutSeDeconnecter({ ecrituresEnAttente: reste }).peut).toBe(false);
    }
  });

  it('un blocage CHRONIQUE se distingue d’un problème de réseau', async () => {
    // Seulement des « skipped » = clé étrangère non résoluble : le moteur
    // retentera sans fin. Dire « attends le réseau » serait faux, et la question
    // reviendrait à chaque déconnexion jusqu'au clic réflexe.
    const { verdictDeconnexion, messageDeconnexionRefusee } = await import('../../js/core/offline-boot.js');
    const v = verdictDeconnexion({ moteurPresent: true, ecrituresEnAttente: 1, seulementBloquees: true });
    expect(v.raison).toBe('blocage-chronique');
    const m = messageDeconnexionRefusee({ enAttente: 1, raison: v.raison, quoi: ['edl'] });
    expect(m.texte).not.toMatch(/Reconnecte-toi à un réseau/);
    expect(m.texte).toContain('edl');
  });

  it('le motif NOMME les collections concernées — le résumé n’était lu par personne', async () => {
    const { messageDeconnexionRefusee } = await import('../../js/core/offline-boot.js');
    const m = messageDeconnexionRefusee({ enAttente: 2, raison: 'non-synchronise', quoi: ['edl', 'baux'] });
    expect(m.texte).toContain('edl');
    expect(m.texte).toContain('baux');
  });
});

/**
 * ═══ LE SITE D'APPEL, EXÉCUTÉ ══════════════════════════════════════════════
 * Les tests ci-dessus éprouvent la RÈGLE ; ceux-ci éprouvent que `logout`
 * l'APPELLE. La distinction n'est pas théorique : une mutation qui remplaçait
 * l'appel par un « oui » constant survivait à toute la suite tant que personne
 * n'exécutait `logout` avec un moteur de synchro câblé.
 */
describe('logout — la règle est réellement APPLIQUÉE (site d’appel)', () => {
  it('flush PROPRE : la déconnexion aboutit, et signOut a bien eu lieu', async () => {
    const { api, journal } = monterAvecMoteur();
    const r = await api.logout();
    expect(r.ok).toBe(true);
    expect(journal).toContain('signOut');
  });

  it('LE POINT DUR — flush EN ÉCHEC : la déconnexion est refusée et signOut N’A PAS eu lieu', async () => {
    // Le refus doit précéder la déconnexion : sinon la session part, la purge
    // du miroir suit, et le travail non synchronisé disparaît avec.
    const { api, journal } = monterAvecMoteur({ reponse: { data: null, error: { message: 'réseau indisponible' } } });
    const r = await api.logout();
    expect(r.ok).toBe(false);
    expect(r.enAttente).toBeGreaterThan(0);
    expect(journal).not.toContain('signOut');
  });

  it('le refus NOMME ce qui est en attente', async () => {
    const { api } = monterAvecMoteur({ reponse: { data: null, error: { message: 'boum' } } });
    const r = await api.logout();
    expect(Array.isArray(r.quoi)).toBe(true);
    expect(r.quoi.length).toBeGreaterThan(0);
  });

  it('le passage en FORCE déconnecte malgré l’échec — on prévient, on n’enferme pas', async () => {
    const { api, journal } = monterAvecMoteur({ reponse: { data: null, error: { message: 'boum' } } });
    const r = await api.logout({ forcer: true });
    expect(r.ok).toBe(true);
    expect(journal).toContain('signOut');
  });
});
