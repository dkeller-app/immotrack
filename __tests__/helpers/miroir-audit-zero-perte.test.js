/**
 * __tests__/helpers/miroir-audit-zero-perte.test.js — CDC-STOCKAGE lot 4, régressions de l'audit
 * « zéro perte d'EDL » (30/09). Chaque test rejoue une PREUVE de perte du rapport (P1 à P7) sur le
 * VRAI module, avec un « disque » IndexedDB partagé entre démarrages successifs.
 */
import { describe, it, expect } from 'vitest';
import { creerMiroir, JOURNAL_EDL_KEY } from '../../js/core/miroir-local.js';
import * as OB from '../../js/core/offline-boot.js';
import { fauxStockageQuota, chaine } from './_faux-stockage-quota.js';

/** IndexedDB de laboratoire dont le contenu (`disque.enr`) survit aux démarrages. */
function fauxIdb(disque) {
  const r = { lireEchoue: false, lireEchoueUneFois: false, suspendre: false, suspendues: [], effacerMuet: false };
  return {
    r,
    existe: async () => disque.enr != null,
    async lire() {
      if (r.lireEchoueUneFois) { r.lireEchoueUneFois = false; throw new Error('UnknownError'); }
      if (r.lireEchoue) throw new Error('indexeddb-muet');
      return disque.enr;
    },
    ecrire(e) { if (r.suspendre) return new Promise(res => r.suspendues.push(() => { disque.enr = e; res(); })); disque.enr = e; return Promise.resolve(); },
    effacer() { if (r.effacerMuet) return new Promise(() => {}); disque.enr = null; return Promise.resolve(); },
    async supprimerBase() { disque.enr = null; },
  };
}
const edl = (id, iso, x = {}) => ({ id, logement: 'A', _modifiedAt: iso, ...x });
const base = (e = []) => ({ logements: [{ ref: 'A' }], baux: {}, edl: e });
const tick = () => new Promise(r => setTimeout(r, 0));
const edlDuDisque = d => (d.enr ? JSON.parse(d.enr.json).edl.map(e => e.id) : []);
let t = 1_000_000;
const horloge = () => ++t;
const TAG = JSON.stringify({ userId: 'u1', espaceId: 'e1' });

describe('R1 — un IndexedDB illisible n’est JAMAIS « absent », et le transfert n’écrase JAMAIS', () => {
  it('P1 — repli au démarrage (IndexedDB muet) après une visite hors ligne : F1 retente et VOIT l’EDL', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '100', immotrack_v4_tag: TAG } });
    const disque = { enr: { v: 2, ecritA: 50, tag: TAG, json: JSON.stringify(base()) } };
    const m1 = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m1.initialiser();
    m1.ecrire(base([edl(42, '2026-09-30T10:00:00.000Z')])); await m1.attendre();
    // Démarrage 2 EN LIGNE : IndexedDB muet → repli ; il redevient disponible dans la session.
    const idb2 = fauxIdb(disque); idb2.r.lireEchoue = true;
    const m2 = creerMiroir({ idb: idb2, stockage: st, horloge, signaler: () => {} });
    expect((await m2.initialiser()).backend).toBe('localStorage');
    expect(m2.incertain()).toBe(true);
    expect(m2.present()).toBe(true);                                       // la garde le compte
    idb2.r.lireEchoue = false;
    const vu = await m2.lireEtat();                                         // ce que lit F1 (retente d'abord)
    expect(vu.etat).toBe('base');
    const f = OB.fusionnerEdlHorsLigne(base(), vu.db, { dernierFlushA: 100 });
    expect(f.ajoutes).toHaveLength(1);
    expect(f.db.edl.map(e => e.id)).toEqual([42]);
    expect(m2.backend()).toBe('indexeddb');
  });

  it('P1 bis — IndexedDB TOUJOURS illisible pendant la session : état « illisible », puis une clé locale « plus récente » ne l’écrase pas au démarrage suivant', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '100', immotrack_v4_tag: TAG } });
    const disque = { enr: { v: 2, ecritA: 50, tag: TAG, json: JSON.stringify(base()) } };
    const m1 = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m1.initialiser();
    m1.ecrire(base([edl(42, '2026-09-30T10:00:00.000Z')])); await m1.attendre();
    const idb2 = fauxIdb(disque); idb2.r.lireEchoue = true;
    const m2 = creerMiroir({ idb: idb2, stockage: st, horloge, signaler: () => {} });
    await m2.initialiser();
    const vu = await m2.lireEtat();
    expect(vu.etat).toBe('illisible');
    m2.proteger();                                                          // ce que fait F1
    m2.ecrire(base([]), { horodater: false });                              // rebase du login (repli : clé locale)
    m2.ecrire(base([edl(1, '2026-09-30T11:00:00.000Z')]));                  // une saisie ordinaire
    expect(m2.protege()).toBe(true);
    // Repli + protégé + IndexedDB inconnu (contre-audit 🟡) : la base complète n'est PAS recopiée en
    // local ; la saisie de la session est au journal, la base IndexedDB n'est pas touchée.
    expect(st.getItem('immotrack_v4')).toBeNull();
    expect(edlDuDisque(disque)).toEqual([42]);
    // Démarrage 3 : IndexedDB OK → base IndexedDB (EDL 42) + journal (EDL 1) : rien n'est perdu.
    const m3 = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    const r = await m3.initialiser();
    expect(r.backend).toBe('indexeddb');
    expect((await m3.lire()).edl.map(e => e.id).sort()).toEqual([1, 42]);
    expect(Math.max(+st.getItem('immotrack_v4_ecrit_at'), m3.travailA())).toBeGreaterThan(100);   // F1 poussera
  });
  it('P1 ter — repli NON protégé (F1 n’a rien trouvé à protéger) : la clé locale complète reste écrite, et le transfert FUSIONNE ensuite', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '100', immotrack_v4_tag: TAG } });
    const disque = { enr: { v: 2, ecritA: 50, tag: TAG, json: JSON.stringify(base([edl(42, '2026-09-30T10:00:00.000Z')])) } };
    const idb2 = fauxIdb(disque); idb2.r.lireEchoue = true;
    const m2 = creerMiroir({ idb: idb2, stockage: st, horloge, signaler: () => {} });
    await m2.initialiser();
    m2.ecrire(base([edl(1, '2026-09-30T11:00:00.000Z')]));                  // repli simple : miroir complet local
    expect(JSON.parse(st.getItem('immotrack_v4')).edl.map(e => e.id)).toEqual([1]);
    const m3 = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    expect((await m3.initialiser()).transfert).toBe('fusion');
    expect(edlDuDisque(disque).sort()).toEqual([1, 42]);
  });

  it('P7 — une lecture IndexedDB en échec au moment de F1 (sans repli) : « illisible », jamais « absente »', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: TAG } });
    const disque = { enr: { v: 2, ecritA: 1, tag: TAG, json: JSON.stringify(base([edl(7, '2026-09-01T00:00:00Z')])) } };
    const idb = fauxIdb(disque);
    const m = creerMiroir({ idb, stockage: st, horloge });
    await m.initialiser();
    idb.r.lireEchoue = true;
    expect((await m.lireEtat()).etat).toBe('illisible');
    idb.r.lireEchoue = false; idb.r.lireEchoueUneFois = true;             // UN échec transitoire : nouvel essai
    const vu = await m.lireEtat();
    expect(vu.etat).toBe('base');
    expect(vu.db.edl.map(e => e.id)).toEqual([7]);
  });

  it('mode PROTÉGÉ : une écriture relit et FUSIONNE les EDL déjà en IndexedDB (le rebase ne les écrase pas)', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: TAG } });
    const disque = { enr: { v: 2, ecritA: 1, travailA: 900, tag: TAG, json: JSON.stringify(base([edl(42, '2026-09-30T10:00:00Z')])) } };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m.initialiser();
    m.proteger();
    m.ecrire(base([edl(1, '2026-09-30T12:00:00Z')]), { horodater: false }); // rebase du cloud (sans l'EDL 42)
    await m.attendre();
    expect(edlDuDisque(disque).sort()).toEqual([1, 42]);
    expect(disque.enr.travailA).toBeGreaterThanOrEqual(900);
  });

  it('mode PROTÉGÉ et IndexedDB illisible : aucune écriture (rien n’est écrasé), le journal garde la saisie', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: TAG } });
    const avant = { v: 2, ecritA: 1, tag: TAG, json: JSON.stringify(base([edl(42, '2026-09-30T10:00:00Z')])) };
    const disque = { enr: avant };
    const idb = fauxIdb(disque);
    const m = creerMiroir({ idb, stockage: st, horloge });
    await m.initialiser();
    m.proteger();
    idb.r.lireEchoue = true;
    m.ecrire(base([edl(5, '2026-09-30T12:00:00Z')]));
    await m.attendre();
    expect(disque.enr).toBe(avant);
    expect(JSON.parse(st.getItem(JOURNAL_EDL_KEY)).edl.map(e => e.id)).toEqual([5]);
  });
});

describe('O3 — le premier save d’une session ne met au journal QUE l’EDL modifié ; `_ecrit_at` d’abord', () => {
  it('P6 — 50 EDL signés en IndexedDB, 1 modifié : journal d’UN EDL', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: TAG } });
    const edls = Array.from({ length: 50 }, (_, i) => edl(i, '2026-09-01T00:00:00Z', { signature: 'data:image/png;base64,' + 'A'.repeat(20000) }));
    const disque = { enr: { v: 2, ecritA: 1, tag: TAG, json: JSON.stringify(base(edls)) } };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m.initialiser();
    const db = await m.lire();
    db.edl[3] = { ...db.edl[3], _modifiedAt: '2026-09-30T10:00:00Z', note: 'visite' };
    m.ecrire(db);
    const j = JSON.parse(st.getItem(JOURNAL_EDL_KEY));
    expect(j.edl.map(e => e.id)).toEqual([3]);
    expect(st.getItem(JOURNAL_EDL_KEY).length).toBeLessThan(25000);
  });

  it('P5 — journal refusé (quota) : `_ecrit_at` a quand même avancé (F1 poussera), IndexedDB reçoit l’EDL', async () => {
    let plein = false;
    const st = fauxStockageQuota({ initial: { immotrack_v4_ecrit_at: '10', immotrack_v4_flush_at: '20' } });
    const set = st.setItem.bind(st);
    st.setItem = (k, v) => { if (plein && k === JOURNAL_EDL_KEY) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return set(k, v); };
    const disque = { enr: { v: 2, ecritA: 1, tag: null, json: JSON.stringify(base()) } };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m.initialiser();
    plein = true;
    expect(() => m.ecrire(base([edl(5, '2026-09-30T10:00:00Z')]))).toThrow();
    await m.attendre();
    expect(edlDuDisque(disque)).toEqual([5]);
    expect(OB.doitPousserAvantHydratation({ tagMiroir: 'same', miroirEcritA: +st.getItem('immotrack_v4_ecrit_at'), dernierFlushA: 20 })).toBe(true);
  });
});

describe('O4 — navigateur tué : localStorage récent perdu, IndexedDB présent → F1 voit le travail (travailA)', () => {
  it('l’enregistrement IndexedDB porte `travailA` ; sans `_ecrit_at` ni journal, travailA() > flush_at', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_flush_at: '500', immotrack_v4_tag: TAG } });
    const disque = { enr: null };
    const m1 = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge: () => 1000 });
    await m1.initialiser();
    m1.ecrire(base([edl(99, '2026-09-30T10:00:00Z')])); await m1.attendre();
    expect(disque.enr.travailA).toBe(1000);
    // Le navigateur entier est tué : Chromium perd les écritures localStorage récentes.
    st.removeItem('immotrack_v4_ecrit_at'); st.removeItem(JOURNAL_EDL_KEY);
    const m2 = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m2.initialiser();
    const ecritA = Math.max(+(st.getItem('immotrack_v4_ecrit_at') || 0), m2.travailA());   // ce que calcule F1
    expect(OB.doitPousserAvantHydratation({ tagMiroir: 'same', miroirEcritA: ecritA, dernierFlushA: 500 })).toBe(true);
    expect((await m2.lire()).edl.map(e => e.id)).toEqual([99]);
  });
  it('navigateur tué : TOUT le localStorage récent perdu (tag compris) — le tag est restauré depuis IndexedDB, l’EDL reste lisible', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: TAG } });
    const disque = { enr: null };
    const m1 = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge: () => 4000 });
    await m1.initialiser();
    m1.ecrire(base([edl(99, '2026-09-30T10:00:00Z')])); await m1.attendre();
    for (const k of st.cles()) st.removeItem(k);                            // localStorage vierge à la relance
    const m2 = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m2.initialiser();
    expect(st.getItem('immotrack_v4_tag')).toBe(TAG);                       // F1 et le démarrage hors ligne le reconnaîtront
    expect(m2.travailA()).toBe(4000);
    expect((await m2.lire()).edl.map(e => e.id)).toEqual([99]);
  });
  it('tag local PRÉSENT et différent : rien n’est restauré (autre propriétaire)', async () => {
    const autre = JSON.stringify({ userId: 'B', espaceId: 'eb' });
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: autre } });
    const disque = { enr: { v: 2, ecritA: 1, travailA: 1, tag: TAG, json: JSON.stringify(base([edl(1, 'x')])) } };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m.initialiser();
    expect(st.getItem('immotrack_v4_tag')).toBe(autre);
    expect(await m.lire()).toBeNull();
  });

  it('un rebase (non horodaté) n’invente pas de travail : travailA n’avance pas', async () => {
    const st = fauxStockageQuota();
    const disque = { enr: null };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge: () => 7777 });
    await m.initialiser();
    m.ecrire(base([edl(1, 'x')]), { horodater: false }); await m.attendre();
    expect(disque.enr.travailA).toBe(0);
    expect(st.getItem('immotrack_v4_ecrit_at')).toBeNull();
  });
});

describe('O5 — changement d’utilisateur : la base de l’ancien propriétaire n’est jamais resservie', () => {
  it('P4 — oublier() en REPLI efface quand même IndexedDB', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_ecrit_at: '10', immotrack_v4_tag: JSON.stringify({ userId: 'A', espaceId: 'ea' }) } });
    const disque = { enr: { v: 2, ecritA: 999, tag: st.getItem('immotrack_v4_tag'), json: JSON.stringify(base([edl('A-secret', '2026-01-01T00:00:00Z')])) } };
    const idb = fauxIdb(disque); idb.r.lireEchoue = true;
    const m = creerMiroir({ idb, stockage: st, horloge, signaler: () => {} });
    await m.initialiser();                                                  // repli
    st.removeItem('immotrack_v4_ecrit_at');                                 // _purgerCacheAuLogin
    await m.oublier();
    expect(disque.enr).toBeNull();
  });
  it('P4 bis — effacement impossible : une base d’un AUTRE tag n’est ni servie ni fusionnée ; la clé locale sans `_ecrit_at` gagne', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: JSON.stringify({ userId: 'B', espaceId: 'eb' }), immotrack_v4: JSON.stringify(base([edl('B', '2026-02-01T00:00:00Z')])) } });
    const disque = { enr: { v: 2, ecritA: 999, tag: JSON.stringify({ userId: 'A', espaceId: 'ea' }), json: JSON.stringify(base([edl('A-secret', '2026-01-01T00:00:00Z')])) } };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    expect((await m.initialiser()).transfert).toBe('fait');
    expect((await m.lire()).edl.map(e => e.id)).toEqual(['B']);
    expect(edlDuDisque(disque)).toEqual(['B']);
  });
  it('base d’un autre tag, sans clé locale : absente (jamais servie, pas « incertaine »)', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: JSON.stringify({ userId: 'B', espaceId: 'eb' }) } });
    const disque = { enr: { v: 2, ecritA: 999, tag: JSON.stringify({ userId: 'A', espaceId: 'ea' }), json: JSON.stringify(base([edl('A-secret', 'x')])) } };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m.initialiser();
    expect(await m.lireEtat()).toEqual({ etat: 'absente', db: null });
    expect(m.present()).toBe(false);
  });
});

describe('P3 — oublier() pendant une écriture en vol, rebase immédiat', () => {
  it('le rebase du nouvel utilisateur n’est PAS effacé, et l’écriture en vol ne repositionne rien', async () => {
    const st = fauxStockageQuota();
    const disque = { enr: null };
    const idb = fauxIdb(disque);
    const m = creerMiroir({ idb, stockage: st, horloge });
    await m.initialiser();
    idb.r.suspendre = true;
    m.ecrire(base([edl(1, '2026-01-01T00:00:00Z')])); await tick();
    const p = m.oublier();
    expect(m.present()).toBe(false);
    m.ecrire(base([edl(2, '2026-01-02T00:00:00Z')]), { horodater: false });
    idb.r.suspendre = false; idb.r.suspendues.shift()();
    await p; await m.attendre(); await tick();
    expect(edlDuDisque(disque)).toEqual([2]);
  });
  it('l’écriture en vol qui se termine APRÈS oublier() ne repositionne ni « présent » ni les engagés', async () => {
    const st = fauxStockageQuota();
    const disque = { enr: null };
    const idb = fauxIdb(disque);
    let libererEffacement;
    idb.effacer = () => new Promise(res => { libererEffacement = () => { disque.enr = null; res(); }; });
    const m = creerMiroir({ idb, stockage: st, horloge });
    await m.initialiser();
    idb.r.suspendre = true;
    m.ecrire(base([edl(1, '2026-01-01T00:00:00Z')])); await tick();
    const p = m.oublier();
    idb.r.suspendre = false; idb.r.suspendues.shift()();                   // l'écriture de l'ANCIEN utilisateur aboutit
    await tick(); await tick();
    expect(m.present()).toBe(false);                                        // rien de l'ancien n'est « présent »
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    libererEffacement(); await p;
    expect(disque.enr).toBeNull();
  });

  it('X3 — une écriture PLANIFIÉE avant oublier() n’est jamais exécutée : après l’effacement, seule l’écriture du nouvel utilisateur', async () => {
    const st = fauxStockageQuota();
    const disque = { enr: null };
    const idb = fauxIdb(disque);
    const ops = [];
    const ecrireVrai = idb.ecrire.bind(idb), effacerVrai = idb.effacer.bind(idb);
    idb.ecrire = (e) => { ops.push('ecrire:' + JSON.parse(e.json).edl.map(x => x.id).join(',')); return ecrireVrai(e); };
    idb.effacer = () => { ops.push('effacer'); return effacerVrai(); };
    const m = creerMiroir({ idb, stockage: st, horloge });
    await m.initialiser();
    idb.r.suspendre = true;
    m.ecrire(base([edl(1, '2026-01-01T00:00:00Z')])); await tick();      // en vol
    m.ecrire(base([edl(1, '2026-01-02T00:00:00Z')]));                     // PLANIFIÉE (pas encore lancée)
    const p = m.oublier();
    m.ecrire(base([edl(2, '2026-01-03T00:00:00Z')]), { horodater: false }); // rebase du nouvel utilisateur
    idb.r.suspendre = false; idb.r.suspendues.shift()();
    await p; await m.attendre();
    expect(ops).toEqual(['ecrire:1', 'effacer', 'ecrire:2']);
  });

  it('X11 — le tag local change en cours de session : la base IndexedDB de l’ancien tag n’est plus servie', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4_tag: TAG } });
    const disque = { enr: { v: 2, ecritA: 1, tag: TAG, json: JSON.stringify(base([edl(1, 'x')])) } };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m.initialiser();
    expect((await m.lireEtat()).etat).toBe('base');
    st.setItem('immotrack_v4_tag', JSON.stringify({ userId: 'B', espaceId: 'eb' }));
    expect(await m.lireEtat()).toEqual({ etat: 'absente', db: null });
  });

  it('point 🟡 — repli + mode protégé + IndexedDB inconnu : un grand compte n’écrit QUE l’horodatage et les EDL (pas de « Mémoire pleine »)', async () => {
    const st = fauxStockageQuota({ quota: 5_242_880, initial: { immotrack_v4_tag: TAG, immotrack_v4_flush_at: '1' } });
    const idb = fauxIdb({ enr: null }); idb.r.lireEchoue = true; idb.existe = async () => null;   // base présente mais MUETTE
    const m = creerMiroir({ idb, stockage: st, horloge, delaiMs: 20, signaler: () => {} });
    await m.initialiser();
    expect(m.backend()).toBe('localStorage');
    expect(m.incertain()).toBe(true);
    m.proteger();
    const grand = Object.assign(base([edl(1, '2026-09-30T10:00:00Z'), edl(2, '2026-09-30T10:00:00Z')]), { mouvements: chaine(3_000_000) });
    m.ecrire(grand, { horodater: false });                                  // rebase (base du cloud, 3 M caractères)
    grand.edl = [edl(1, '2026-09-30T11:00:00Z', { note: 'visite' }), grand.edl[1]];   // seul l'EDL 1 change
    for (let i = 0; i < 3; i++) expect(m.ecrire(grand)).toBe(true);         // saisies de la session : aucune n'échoue
    expect(st.getItem('immotrack_v4')).toBeNull();
    expect(JSON.parse(st.getItem(JOURNAL_EDL_KEY)).edl.map(e => e.note)).toEqual(['visite']);
    expect(st.usage()).toBeLessThan(10_000);
  });

  it('effacement IndexedDB MUET : oublier() est borné (le login ne se fige pas)', async () => {
    const disque = { enr: { v: 2, ecritA: 1, tag: null, json: JSON.stringify(base()) } };
    const idb = fauxIdb(disque); idb.r.effacerMuet = true;
    const signaux = [];
    const m = creerMiroir({ idb, stockage: fauxStockageQuota(), horloge, delaiMs: 30, signaler: s => signaux.push(s.type) });
    await m.initialiser();
    await m.oublier();
    expect(signaux).toEqual(['echec-effacement']);
  });
});

describe('Un stockage local plein ne rend pas le journal plus gros que nécessaire', () => {
  it('le journal d’un EDL de 20 K caractères passe sur un stockage presque plein de clés jetables (éviction)', async () => {
    const st = fauxStockageQuota({ quota: 60000, initial: { _driveBackupBeforeSync: chaine(40000), immotrack_v4_tag: TAG } });
    const disque = { enr: { v: 2, ecritA: 1, tag: TAG, json: JSON.stringify(base()) } };
    const m = creerMiroir({ idb: fauxIdb(disque), stockage: st, horloge });
    await m.initialiser();
    expect(m.ecrire(base([edl(1, 'x', { s: chaine(20000) })]))).toBe(true);
    expect(st.getItem('_driveBackupBeforeSync')).toBeNull();
  });
});
