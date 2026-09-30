/**
 * __tests__/helpers/miroir-local.test.js — CDC-STOCKAGE lot 4 (G7) : le miroir cloud en IndexedDB.
 *
 * LA contrainte : ZÉRO PERTE D'EDL FAIT HORS LIGNE. IndexedDB est asynchrone ; un EDL enregistré
 * doit pourtant être sur le disque AU RETOUR de saveDB, même si l'app est tuée avant la fin de la
 * transaction. Ces tests EXÉCUTENT le vrai module avec un IndexedDB de laboratoire dont on contrôle
 * chaque transaction (réussite, échec, transaction qui ne se termine JAMAIS = app tuée) et le vrai
 * localStorage de laboratoire à quota du lot 1.
 */
import { describe, it, expect } from 'vitest';
import { creerMiroir, superposerJournal, JOURNAL_EDL_KEY } from '../../js/core/miroir-local.js';
import { fauxStockageQuota, chaine } from './_faux-stockage-quota.js';

/** IndexedDB de laboratoire : un enregistrement, des écritures qu'on peut suspendre ou faire échouer. */
function fauxIdb({ initial = null } = {}) {
  let enr = initial;
  const journal = [];               // ordre des opérations
  const reglages = { suspendre: false, echouer: false, lireEchoue: false, relireAutre: false };
  const suspendues = [];
  return {
    reglages, journal, suspendues,
    get enr() { return enr; },
    async lire() {
      journal.push('lire');
      if (reglages.lireEchoue) throw new Error('SecurityError');
      if (reglages.relireAutre && enr) return { ...enr, json: enr.json + ' ' };
      return enr;
    },
    ecrire(e) {
      journal.push('ecrire');
      if (reglages.echouer) return Promise.reject(new Error('QuotaExceededError'));
      if (reglages.suspendre) return new Promise((res) => suspendues.push(() => { enr = e; res(); }));   // app tuée = jamais résolue
      enr = e; return Promise.resolve();
    },
    async effacer() { journal.push('effacer'); enr = null; },
    async supprimerBase() { journal.push('supprimerBase'); enr = null; },
  };
}
const base = (edl = []) => ({ baux: {}, logements: [{ ref: 'A' }], edl });
const edl = (id, t, extra = {}) => ({ id, logement: 'A', type: 'Entrée', _modifiedAt: new Date(t).toISOString(), ...extra });
const flush = () => new Promise(r => setTimeout(r, 0));

describe('initialiser — IndexedDB disponible, refusé, absent', () => {
  it('sans IndexedDB : repli localStorage ANNONCÉ, et le miroir complet s’écrit en local (comportement du lot 1)', async () => {
    const st = fauxStockageQuota();
    const signaux = [];
    const m = creerMiroir({ idb: null, stockage: st, signaler: s => signaux.push(s.type) });
    expect((await m.initialiser()).backend).toBe('localStorage');
    expect(signaux).toEqual(['repli']);
    expect(m.ecrire(base([edl(1, 1)]))).toBe(true);
    expect(JSON.parse(st.getItem('immotrack_v4')).edl[0].id).toBe(1);
    expect(st.getItem('immotrack_v4_ecrit_at')).toBeTruthy();
  });

  it('IndexedDB refusé (navigation privée, SecurityError) : repli annoncé, rien de supprimé', async () => {
    const st = fauxStockageQuota({ initial: { immotrack_v4: JSON.stringify(base()), immotrack_v4_ecrit_at: '5' } });
    const idb = fauxIdb(); idb.reglages.lireEchoue = true;
    const signaux = [];
    const m = creerMiroir({ idb, stockage: st, signaler: s => signaux.push(s.type) });
    expect((await m.initialiser()).backend).toBe('localStorage');
    expect(signaux).toEqual(['repli']);
    expect(st.getItem('immotrack_v4')).not.toBeNull();                     // le miroir local est intact
  });
});

describe('Pas de base et rien à transférer : IndexedDB n’est PAS ouvert (sinon la base réapparaît après le logout)', () => {
  it('base absente : backend IndexedDB, aucune ouverture ; la première écriture crée la base', async () => {
    const st = fauxStockageQuota();
    const idb = Object.assign(fauxIdb(), { existe: async () => false });
    const m = creerMiroir({ idb, stockage: st });
    expect(await m.initialiser()).toEqual({ backend: 'indexeddb', transfert: 'aucun' });
    expect(await m.lire()).toBeNull();
    expect(idb.journal).toEqual([]);                                        // ni lecture ni création
    m.ecrire(base([edl(1, 1)]));
    await m.attendre();
    expect(idb.journal).toEqual(['ecrire']);
  });
  it('`databases()` refusé (IndexedDB interdit) : repli annoncé', async () => {
    const signaux = [];
    const idb = Object.assign(fauxIdb(), { existe: async () => { throw new Error('SecurityError'); } });
    const m = creerMiroir({ idb, stockage: fauxStockageQuota(), signaler: s => signaux.push(s.type) });
    expect((await m.initialiser()).backend).toBe('localStorage');
    expect(signaux).toEqual(['repli']);
  });
  it('navigateur qui ne sait pas dire si la base existe (null) : ouverture normale', async () => {
    const idb = Object.assign(fauxIdb(), { existe: async () => null });
    const m = creerMiroir({ idb, stockage: fauxStockageQuota() });
    await m.initialiser();
    expect(idb.journal).toEqual(['lire']);
  });
});

describe('Transfert localStorage → IndexedDB : écrire, relire, comparer, PUIS supprimer', () => {
  it('miroir local existant (avec un EDL non remonté) : copié à l’identique, puis la clé locale est libérée', async () => {
    const brut = JSON.stringify(base([edl(7, Date.UTC(2026, 8, 30, 9))]));
    const st = fauxStockageQuota({ initial: { immotrack_v4: brut, immotrack_v4_ecrit_at: '1790000000000', immotrack_v4_flush_at: '1780000000000' } });
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    expect(await m.initialiser()).toEqual({ backend: 'indexeddb', transfert: 'fait' });
    expect(idb.enr.json).toBe(brut);
    expect(idb.enr.ecritA).toBe(1790000000000);                          // l'horodatage F1 est conservé
    expect(idb.journal.slice(0, 3)).toEqual(['lire', 'ecrire', 'lire']);  // relu AVANT de supprimer
    expect(st.getItem('immotrack_v4')).toBeNull();
    expect(st.getItem('immotrack_v4_ecrit_at')).toBe('1790000000000');   // F1 compare toujours ces horodatages
    expect((await m.lire()).edl[0].id).toBe(7);                           // F1 lira bien l'EDL
  });

  it('relecture NON conforme : la clé locale RESTE, repli annoncé (rien n’est perdu)', async () => {
    const brut = JSON.stringify(base([edl(7, 1)]));
    const st = fauxStockageQuota({ initial: { immotrack_v4: brut, immotrack_v4_ecrit_at: '9' } });
    const idb = fauxIdb(); idb.reglages.relireAutre = true;
    const signaux = [];
    const m = creerMiroir({ idb, stockage: st, signaler: s => signaux.push(s.type) });
    expect(await m.initialiser()).toEqual({ backend: 'localStorage', transfert: 'echec' });
    expect(st.getItem('immotrack_v4')).toBe(brut);
    expect(signaux).toEqual(['transfert-echec']);
    expect((await m.lire()).edl[0].id).toBe(7);
  });

  it('écriture IndexedDB refusée pendant le transfert : la clé locale RESTE', async () => {
    const brut = JSON.stringify(base([edl(7, 1)]));
    const st = fauxStockageQuota({ initial: { immotrack_v4: brut, immotrack_v4_ecrit_at: '9' } });
    const idb = fauxIdb(); idb.reglages.echouer = true;
    const m = creerMiroir({ idb, stockage: st, signaler: () => {} });
    expect((await m.initialiser()).transfert).toBe('echec');
    expect(st.getItem('immotrack_v4')).toBe(brut);
  });

  it('miroir IndexedDB PLUS RÉCENT que la clé locale : la clé locale (périmée) est libérée, IndexedDB intact', async () => {
    const idb = fauxIdb({ initial: { v: 1, ecritA: 200, json: JSON.stringify(base([edl(2, 2)])) } });
    const st = fauxStockageQuota({ initial: { immotrack_v4: JSON.stringify(base([edl(1, 1)])), immotrack_v4_ecrit_at: '100' } });
    const m = creerMiroir({ idb, stockage: st });
    expect((await m.initialiser()).transfert).toBe('local-perime');
    expect(st.getItem('immotrack_v4')).toBeNull();
    expect((await m.lire()).edl.map(r => r.id)).toEqual([2]);
  });
});

describe('ZÉRO PERTE — un EDL enregistré est sur le disque AU RETOUR de ecrire()', () => {
  it('LE POINT DUR — app tuée pendant la transaction IndexedDB : au redémarrage, l’EDL est lu (journal)', async () => {
    const st = fauxStockageQuota();
    const idb = fauxIdb({ initial: { v: 1, ecritA: 1, json: JSON.stringify(base()) } });
    const m1 = creerMiroir({ idb, stockage: st, horloge: () => 5000 });
    await m1.initialiser();
    idb.reglages.suspendre = true;                                         // la transaction ne se terminera jamais
    const db = base([edl(42, 4000, { pieces: [{ nom: 'Séjour' }] })]);
    expect(m1.ecrire(db)).toBe(true);
    // Au retour de ecrire() — AVANT toute microtâche — l'EDL est déjà sur disque :
    expect(JSON.parse(st.getItem(JOURNAL_EDL_KEY)).edl.map(r => r.id)).toEqual([42]);
    expect(st.getItem('immotrack_v4_ecrit_at')).toBe('5000');
    await flush();
    expect(idb.suspendues).toHaveLength(1);                                 // la transaction est « en vol »… et l'app meurt
    // Redémarrage : nouvelle instance, même disque (IndexedDB n'a JAMAIS reçu l'EDL).
    const m2 = creerMiroir({ idb: Object.assign(fauxIdb({ initial: idb.enr }), {}), stockage: st });
    await m2.initialiser();
    const vu = await m2.lire();
    expect(vu.edl.map(r => r.id)).toEqual([42]);
    expect(vu.edl[0].pieces[0].nom).toBe('Séjour');
    expect(vu.logements[0].ref).toBe('A');                                  // la base IndexedDB est bien la base
    expect(m2.present()).toBe(true);
  });

  it('après la fin de la transaction, l’EDL engagé sort du journal (le journal reste petit)', async () => {
    const st = fauxStockageQuota();
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    m.ecrire(base([edl(1, 1000)]));
    expect(st.getItem(JOURNAL_EDL_KEY)).not.toBeNull();
    await m.attendre();
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    expect(JSON.parse(idb.enr.json).edl[0].id).toBe(1);
    // Une écriture sans changement d'EDL n'écrit pas de journal.
    const db2 = base([edl(1, 1000)]);
    m.ecrire(db2);
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
  });

  it('un EDL modifié PENDANT une transaction reste au journal jusqu’à la transaction suivante', async () => {
    const st = fauxStockageQuota();
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    idb.reglages.suspendre = true;
    const db = base([edl(1, 1000)]);
    m.ecrire(db);
    await flush();
    db.edl[0] = edl(1, 2000, { note: 'modifié pendant le vol' });            // l'autosave suivant…
    m.ecrire(db);                                                           // …est coalescé
    expect(JSON.parse(st.getItem(JOURNAL_EDL_KEY)).edl[0].note).toBe('modifié pendant le vol');
    idb.reglages.suspendre = false;
    idb.suspendues.shift()();                                              // 1re transaction terminée (ancienne version)
    await m.attendre();
    expect(JSON.parse(idb.enr.json).edl[0].note).toBe('modifié pendant le vol');   // la 2e l'a engagée
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
  });

  it('journal refusé par un stockage local plein de clés non jetables : ecrire() LÈVE (19l), et IndexedDB reçoit quand même', async () => {
    const st = fauxStockageQuota({ quota: 200, initial: { autre_app: chaine(190) } });
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    expect(() => m.ecrire(base([edl(1, 1)]))).toThrow();
    await m.attendre();
    expect(JSON.parse(idb.enr.json).edl[0].id).toBe(1);
  });
});

describe('Écrivain à coalescence', () => {
  it('10 écritures rapides → au plus 2 transactions, et la dernière état gagne', async () => {
    const st = fauxStockageQuota();
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    const db = base([]);
    for (let i = 0; i < 10; i++) { db.edl = [edl(1, 1000 + i, { n: i })]; m.ecrire(db); }
    await m.attendre();
    expect(idb.journal.filter(x => x === 'ecrire').length).toBeLessThanOrEqual(2);
    expect(JSON.parse(idb.enr.json).edl[0].n).toBe(9);
  });

  it('IndexedDB refuse une écriture : repli local ANNONCÉ, miroir complet écrit en local, rien de perdu', async () => {
    const st = fauxStockageQuota();
    const idb = fauxIdb();
    const signaux = [];
    const m = creerMiroir({ idb, stockage: st, signaler: s => signaux.push(s.type) });
    await m.initialiser();
    idb.reglages.echouer = true;
    m.ecrire(base([edl(3, 3)]));
    await m.attendre();
    expect(signaux).toEqual(['echec-ecriture']);
    expect(m.backend()).toBe('localStorage');
    expect(JSON.parse(st.getItem('immotrack_v4')).edl[0].id).toBe(3);
    expect((await m.lire()).edl[0].id).toBe(3);
  });
});

describe('lire — superposition du journal', () => {
  it('le plus récent gagne, un EDL inconnu est ajouté, un journal plus ancien n’écrase rien', () => {
    const b = base([edl(1, 2000, { v: 'base' }), edl(2, 1000, { v: 'base' })]);
    const r = superposerJournal(b, { edl: [edl(1, 1000, { v: 'journal-ancien' }), edl(2, 3000, { v: 'journal' }), edl(3, 1, { v: 'nouveau' })] });
    expect(r.edl.map(x => [x.id, x.v])).toEqual([[1, 'base'], [2, 'journal'], [3, 'nouveau']]);
    expect(b.edl[1].v).toBe('base');                                       // pas de mutation de l'entrée
  });
  it('journal sans base (IndexedDB perdu) : F1 voit quand même les EDL', () => {
    expect(superposerJournal(null, { edl: [edl(9, 1)] }).edl.map(x => x.id)).toEqual([9]);
  });
});

describe('Purges', () => {
  it('oublier (changement d’utilisateur au login) : journal et clé locale retirés tout de suite, effacement IndexedDB APRÈS l’écriture en vol et AVANT la suivante', async () => {
    const st = fauxStockageQuota();
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    idb.reglages.suspendre = true;
    m.ecrire(base([edl(1, 1)]));
    await flush();
    const p = m.oublier();
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    expect(m.present()).toBe(false);
    idb.reglages.suspendre = false;
    idb.suspendues.shift()();
    await p;
    expect(idb.enr).toBeNull();
    m.ecrire(base([edl(2, 2)]));                                            // le rebase du nouvel utilisateur
    await m.attendre();
    expect(JSON.parse(idb.enr.json).edl[0].id).toBe(2);
    expect(idb.journal.lastIndexOf('effacer')).toBeLessThan(idb.journal.lastIndexOf('ecrire'));
  });

  it('vider (logout) : base IndexedDB supprimée, journal retiré, plus aucune écriture ensuite', async () => {
    const st = fauxStockageQuota();
    const idb = fauxIdb();
    const m = creerMiroir({ idb, stockage: st });
    await m.initialiser();
    m.ecrire(base([edl(1, 1)]));
    await m.vider();
    expect(idb.journal).toContain('supprimerBase');
    expect(idb.enr).toBeNull();
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    expect(m.ecrire(base([edl(2, 2)]))).toBe(true);
    await m.attendre();
    expect(idb.enr).toBeNull();
    expect(st.getItem(JOURNAL_EDL_KEY)).toBeNull();
    expect(m.present()).toBe(false);
  });
});
