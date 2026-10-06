/**
 * FINANCES-SUIVI-UNIQUE P2 — l'entrée « manque accepté » du journal du bail (js/core/manque-accepte.js),
 * sa synchro (mappeur, rattachement store-sync, hydratation), son effet sur le calcul (suiviLot) et la
 * non-régression des lecteurs existants de DB.baux_evenements, puis l'écriture côté app
 * (_manqueAccepter / _manqueAnnuler, js/app/app-part1.js) EXÉCUTÉE contre des doublures.
 * Spécification : docs/subjects/FINANCES-SUIVI-UNIQUE-MOTEUR.md §D, §I Q1, invariant I-i.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import * as MA from '../../js/core/manque-accepte.js';
import {
  validerManque, nouveauManque, annulerManque, trouverManque, estManqueActif, bailDuManque,
  rattachementManque, manquesDuLot, TYPE_MANQUE
} from '../../js/core/manque-accepte.js';
import { suiviLot, lotDepuisDb } from '../../js/core/suivi-loyers.js';
import { mapToRow } from '../../js/core/store-mapping.js';
import { createSupabaseStore } from '../../js/core/store-supabase.js';
import { createStoreSync } from '../../js/core/store-sync.js';
import { journalDuBail, reappliquerJournalBaux, entreeJournalAuto } from '../../js/core/bail-modifications.js';
import { avenantsDuBail, listeAvenants } from '../../js/core/avenant-registre.js';
import { collectBackupFiles } from '../../js/core/backup.js';
import { _findPersonalDataForRef } from '../../js/core/rgpd.js';
import { extraireFonction } from './_extraction-source.js';

const NOW = '2026-10-06T08:00:00.000Z';
const base = (extra) => Object.assign({ ref: 'F-1', bailDebut: '2026-05-01', ym: '2026-08', montant: 20, motif: 'panne électrique', date: '2026-08-05' }, extra || {});
const creer = (extra, opts) => nouveauManque(base(extra), Object.assign({ uid: 'u1', now: NOW, plafond: 20 }, opts || {}));
const champs = (erreurs) => erreurs.map((e) => e.champ).sort();

// ── 1. Validation ──────────────────────────────────────────────────────────────
describe('validerManque — saisie', () => {
  it('saisie complète au plafond : valide', () => {
    expect(validerManque(base(), { plafond: 20 })).toEqual([]);
  });
  it('montant > 0 obligatoire (0, négatif, NaN, vide)', () => {
    for (const montant of [0, -5, NaN, '', 'abc', 0.004]) expect(champs(validerManque(base({ montant }), { plafond: 20 }))).toEqual(['montant']);
  });
  it('motif obligatoire, espaces seuls refusés', () => {
    for (const motif of ['', '   ', '\n\t', null, undefined, 12]) expect(champs(validerManque(base({ motif }), { plafond: 20 }))).toEqual(['motif']);
  });
  it('mois AAAA-MM valide, jamais avant le début du bail', () => {
    for (const ym of ['2026-13', '2026-8', '202608', '', null]) expect(champs(validerManque(base({ ym }), { plafond: 20 }))).toEqual(['ym']);
    expect(champs(validerManque(base({ ym: '2026-04' }), { plafond: 20 }))).toEqual(['ym']);
    expect(validerManque(base({ ym: '2026-05' }), { plafond: 20 })).toEqual([]);
  });
  it('plafond = dette du mois fournie par l\'appelant : obligatoire, montant ≤ plafond (au centime)', () => {
    expect(champs(validerManque(base(), {}))).toEqual(['plafond']);
    expect(champs(validerManque(base(), { plafond: 0 }))).toEqual(['plafond']);
    expect(champs(validerManque(base({ montant: 20.01 }), { plafond: 20 }))).toEqual(['montant']);
    expect(validerManque(base({ montant: 19.999 }), { plafond: 20 })).toEqual([]);   // arrondi au centime = 20
    expect(validerManque(base({ montant: 12.5 }), { plafond: 20 })).toEqual([]);
    expect(validerManque(base({ montant: 20.01 }), { plafond: 20 })[0].message).toMatch(/dépasse.*20,00/);
  });
  it('logement, début du bail et date du geste contrôlés', () => {
    expect(champs(validerManque(base({ ref: '' }), { plafond: 20 }))).toEqual(['ref']);
    expect(champs(validerManque(base({ bailDebut: '2026-5-1' }), { plafond: 20 }))).toEqual(['bailDebut']);
    expect(champs(validerManque(base({ date: '05/08/2026' }), { plafond: 20 }))).toEqual(['date']);
  });
});

// ── 2. Création ────────────────────────────────────────────────────────────────
describe('nouveauManque — forme stockée (§D)', () => {
  it('entrée exacte : id mqa_+uid, type, ref nue, montant au centime, motif nettoyé, _modifiedAt', () => {
    const r = nouveauManque(base({ ref: 'F-1@@ESP2', montant: '19.996', motif: '  panne électrique ', bailUid: 'b9', _espaceId: 'ESP2', auteur: ' Didier ' }), { uid: 'abc', now: NOW, plafond: 20 });
    expect(r).toEqual({ ok: true, entree: {
      id: 'mqa_abc', type: 'manque_accepte', ref: 'F-1', bailDebut: '2026-05-01', ym: '2026-08', montant: 20,
      motif: 'panne électrique', date: '2026-08-05', _modifiedAt: NOW, bailUid: 'b9', auteur: 'Didier', _espaceId: 'ESP2'
    } });
  });
  it('champs optionnels absents → clés absentes ; date absente → jour du geste (now)', () => {
    const r = creer({ date: undefined });
    expect(r.entree).toEqual({ id: 'mqa_u1', type: TYPE_MANQUE, ref: 'F-1', bailDebut: '2026-05-01', ym: '2026-08', montant: 20, motif: 'panne électrique', date: '2026-10-06', _modifiedAt: NOW });
  });
  it('refus : erreurs rendues, aucune entrée ; uid et now obligatoires (aucune horloge, aucun aléa ici)', () => {
    expect(creer({ motif: ' ' })).toEqual({ ok: false, erreurs: [{ champ: 'motif', message: 'Le motif est obligatoire.' }] });
    expect(champs(creer({}, { uid: '' }).erreurs)).toEqual(['id']);
    expect(champs(creer({}, { now: 'hier' }).erreurs)).toEqual(['now']);
  });
  it('rattachementManque : début, ligne cloud propre, espace — jamais signedAt', () => {
    expect(rattachementManque({ debut: '2026-05-01T00:00', _bailUid: 'u1', _espaceId: 'E', signatures: { signedAt: 'x' } })).toEqual({ bailDebut: '2026-05-01', bailUid: 'u1', _espaceId: 'E' });
    expect(rattachementManque({ debut: '2026-05-01' })).toEqual({ bailDebut: '2026-05-01' });
  });
});

// ── 3. Annulation = tombstone ; nouvelle acceptation = nouvel id ─────────────────
describe('annulation (tombstone) et nouvelle acceptation', () => {
  it('annulerManque : _deleted + _deletedAt + _modifiedAt, le reste conservé', () => {
    const e = creer().entree;
    const avant = { ...e };
    expect(annulerManque(e, '2026-10-07T09:00:00.000Z')).toBe(e);
    expect(e).toEqual({ ...avant, _deleted: true, _deletedAt: '2026-10-07T09:00:00.000Z', _modifiedAt: '2026-10-07T09:00:00.000Z' });
    expect(estManqueActif(e)).toBe(false);
  });
  it('déjà annulé ou autre type : null, rien touché ; now obligatoire', () => {
    const e = creer().entree; annulerManque(e, NOW);
    const fige = JSON.stringify(e);
    expect(annulerManque(e, '2027-01-01T00:00:00.000Z')).toBe(null);
    expect(JSON.stringify(e)).toBe(fige);
    const modif = { id: 'bj', type: 'modification' };
    expect(annulerManque(modif, NOW)).toBe(null);
    expect(modif).toEqual({ id: 'bj', type: 'modification' });
    expect(() => annulerManque(creer().entree, '')).toThrow(TypeError);
  });
  it('trouverManque : seulement un manque ACTIF ; une nouvelle acceptation a un NOUVEL id (pas de résurrection)', () => {
    const journal = [{ id: 'mqa_u1', type: 'modification' }, creer().entree];
    expect(trouverManque(journal, 'mqa_u1')).toBe(journal[1]);
    annulerManque(journal[1], NOW);
    expect(trouverManque(journal, 'mqa_u1')).toBe(null);
    const neuf = creer({}, { uid: 'u2' }).entree;
    journal.push(neuf);
    expect(neuf.id).toBe('mqa_u2');
    expect(journal[1]._deleted).toBe(true);
    expect(trouverManque(journal, 'mqa_u2')).toBe(neuf);
    expect(trouverManque(journal, null)).toBe(null);
  });
});

// ── 4. Bail visé et sélecteur ────────────────────────────────────────────────
function dbLot() {
  return {
    baux: { 'F-1': { debut: '2026-05-01', hc: 760, ch: 20, nom: 'Arslan', _bailUid: 'u1' } },
    baux_historique: [
      { ref: 'F-1', debut: '2025-01-01', fin: '2027-12-31', finEffective: '2026-04-30', hc: 700, ch: 0, nom: 'Ancien', _bailUid: 'h1' },
      { ref: 'F-1', debut: '2024-01-01', finEffective: '2024-12-31', hc: 650, ch: 0, _deleted: true }
    ],
    loyerBareme: [],
    mouvements: [
      ['m1', '2026-01-03', 700], ['m2', '2026-02-03', 700], ['m3', '2026-03-03', 700], ['m4', '2026-04-03', 700],
      ['p5', '2026-05-02', 780], ['p6', '2026-06-02', 780], ['p7', '2026-07-05', 760], ['p8', '2026-08-02', 780]
    ].map(([id, date, cr]) => ({ id, date, qui: 'F-1', cat: 'Loyers encaissés', cr, db: 0 })),
    baux_evenements: []
  };
}
const catLigne = (c) => (c === 'Loyers encaissés' ? { ligne2044: '211', type: 'recette' } : null);
const OPTS = { today: '2026-08-20' };
const lotDe = (db) => lotDepuisDb('F-1', db, { catLigne, debutSuivi: { date: '2026-01-01', source: 'acquisition' } });
const juillet = (s) => s.baux.find((b) => b.cle === 'F-1|2026-05-01|u1').mois.find((m) => m.ym === '2026-07');

describe('bailDuManque — le bail visé (courant ou archivé)', () => {
  const db = dbLot();
  it('bail courant (même début), clé tolérante (casse, @@espace)', () => {
    expect(bailDuManque(db, 'F-1', '2026-05-01')).toEqual({ bail: db.baux['F-1'], archive: false });
    expect(bailDuManque(db, ' f-1@@ESP ', '2026-05-01').bail).toBe(db.baux['F-1']);
  });
  it('bail archivé (locataire parti) ; archive supprimée ignorée ; inconnu → null', () => {
    expect(bailDuManque(db, 'F-1', '2025-01-01')).toEqual({ bail: db.baux_historique[0], archive: true });
    expect(bailDuManque(db, 'F-1', '2024-01-01')).toBe(null);
    expect(bailDuManque(db, 'F-2', '2026-05-01')).toBe(null);
    expect(bailDuManque(db, 'F-1', 'pas-une-date')).toBe(null);
  });
});

describe('manquesDuLot — alimente suiviLot({ manques }) au format exact, tombstones filtrés', () => {
  it('format { id, bailCle, ym, montant, motif, date, _deleted:false } ; clé de bail = celle du suivi', () => {
    const db = dbLot();
    const e = creer({ ym: '2026-07', ...rattachementManque(db.baux['F-1']) }).entree;
    const mort = creer({ ym: '2026-07' }, { uid: 'u0' }).entree; annulerManque(mort, NOW);
    db.baux_evenements.push(mort, e, { id: 'bj', type: 'modification', ref: 'F-1' });
    expect(manquesDuLot(db, 'F-1')).toEqual([{ id: 'mqa_u1', bailCle: 'F-1|2026-05-01|u1', ym: '2026-07', montant: 20, motif: 'panne électrique', date: '2026-08-05', _deleted: false }]);
    expect(lotDe(db).baux.map((b) => b.cle)).toContain('F-1|2026-05-01|u1');
    expect(manquesDuLot(db, 'F-2')).toEqual([]);
  });
  it('ligne du bail changée depuis le geste (bail re-signé : nouvel uid) → le seul bail de ce début fait foi', () => {
    const db = dbLot();
    db.baux_evenements.push(creer({ ym: '2026-07', bailUid: 'perime' }).entree);
    expect(manquesDuLot(db, 'F-1')[0].bailCle).toBe('F-1|2026-05-01|u1');
  });
  it('bail inconnu : clé non résolue, rendue telle quelle (suiviLot la signale en manquesIgnores, jamais en silence)', () => {
    const db = dbLot();
    db.baux_evenements.push(creer({ bailDebut: '2023-03-01', ym: '2023-04' }).entree);
    const m = manquesDuLot(db, 'F-1');
    expect(m[0].bailCle).toBe('F-1|2023-03-01');
    expect(suiviLot(lotDe(db), OPTS).manquesIgnores).toEqual([{ id: 'mqa_u1', bailCle: 'F-1|2023-03-01', ym: '2023-04', montant: 20, raison: 'bail-inconnu' }]);
  });
});

// ── 5. Effet sur le calcul ──────────────────────────────────────────────────────
describe('effet sur suiviLot (bout en bout depuis le DB)', () => {
  it('sans geste : juillet −20 (charges, H-1), position août −20', () => {
    const s = suiviLot(lotDe(dbLot()), OPTS);
    expect(juillet(s)).toMatchObject({ solde: -20, retardCharge: 20, manque: null });
    expect(s.mois['2026-08'].solde).toBe(-20);
  });
  it('manque accepté sur juillet : juillet et août soldés, reçu inchangé (jamais un encaissement)', () => {
    const db = dbLot();
    db.baux_evenements.push(creer({ ym: '2026-07', ...rattachementManque(db.baux['F-1']) }).entree);
    const s = suiviLot(lotDe(db), OPTS);
    expect(juillet(s)).toMatchObject({ solde: 0, recu: 760, remiseAppliquee: 20, manque: { id: 'mqa_u1', montant: 20, montantDemande: 20, motif: 'panne électrique', date: '2026-08-05' } });
    expect(s.mois['2026-08'].solde).toBe(0);
  });
  it('manque annulé (tombstone) : sortie IDENTIQUE à l\'absence de geste (égalité profonde)', () => {
    const sans = suiviLot(lotDe(dbLot()), OPTS);
    const db = dbLot();
    const e = creer({ ym: '2026-07', ...rattachementManque(db.baux['F-1']) }).entree;
    db.baux_evenements.push(e);
    annulerManque(e, NOW);
    expect(suiviLot(lotDe(db), OPTS)).toEqual(sans);
  });
  it('I-i : un manque sur un AUTRE bail ou un AUTRE mois n\'a aucun effet sur juillet du bail courant', () => {
    const sans = suiviLot(lotDe(dbLot()), OPTS);
    const db = dbLot();
    db.baux_evenements.push(
      creer({ ym: '2026-07', ...rattachementManque(db.baux_historique[0]) }, { uid: 'autreBail' }).entree,   // bail de l'ancien locataire
      creer({ ym: '2026-06', ...rattachementManque(db.baux['F-1']) }, { uid: 'autreMois' }).entree          // juin : rien ne manquait
    );
    const s = suiviLot(lotDe(db), OPTS);
    const cour = (x) => x.baux.find((b) => b.cle === 'F-1|2026-05-01|u1');
    expect(cour(s).mois.map((m) => [m.ym, m.solde, m.retard, m.avance])).toEqual(cour(sans).mois.map((m) => [m.ym, m.solde, m.retard, m.avance]));
    expect(cour(s).position).toEqual(cour(sans).position);
    expect(s.mois['2026-07'].solde).toBe(-20);
    // le geste de juin, sans dette, n'a rien appliqué et n'a créé aucune avance
    expect(cour(s).mois.find((m) => m.ym === '2026-06')).toMatchObject({ remiseAppliquee: 0, avance: 0 });
  });
});

// ── 6. Synchro : mappeur, hydratation, rattachement store-sync ────────────────
const ctxMap = () => ({
  espaceId: 'ESP', ownerId: 'OWN', detUuid: (...p) => 'uuid:' + p.join('|'),
  entiteByNom: new Map(), immeubleByNom: new Map(), logementByRef: new Map([['f-1', 'uuid:logement|f-1']]), documentByLegacy: new Map()
});

describe('store-mapping — aller-retour du type manque_accepte (rien n\'est perdu)', () => {
  const e = { ...creer({ bailUid: 'u1' }).entree, _espaceId: 'ESP2' };
  it('type_evenement manque_accepte (liste blanche 0056), date du geste, bail_debut, ligne propre du bail', () => {
    const r = mapToRow('baux_evenements', e, ctxMap());
    expect(r).toMatchObject({ id: 'uuid:bailevt|mqa_u1', legacy_id: 'mqa_u1', bail_id: 'uuid:bail|f-1|u1', type_evenement: 'manque_accepte', date_evenement: '2026-08-05', bail_debut: '2026-05-01' });
    const { _espaceId, ...sansTag } = e;
    expect(r.legacy_raw).toEqual(sansTag);
  });
  it('sans bailUid → ligne historique du logement ; tombstone → même ligne (suppression douce)', () => {
    const { bailUid, ...e2 } = e;
    expect(mapToRow('baux_evenements', e2, ctxMap()).bail_id).toBe('uuid:bail|f-1');
    const t = { ...e }; annulerManque(t, NOW);
    expect(mapToRow('baux_evenements', t, ctxMap()).id).toBe('uuid:bailevt|mqa_u1');
  });
  it('un type inconnu reste rangé en « autre » (inchangé)', () => {
    expect(mapToRow('baux_evenements', { ...e, type: 'bizarre' }, ctxMap()).type_evenement).toBe('autre');
  });
  it('hydratation depuis legacy_raw : l\'entrée revient à l\'identique et alimente le même suivi', async () => {
    const row = mapToRow('baux_evenements', e, ctxMap());
    const s = createSupabaseStore({ fetchTable: async (n) => (n === 'baux_evenements' ? [{ legacy_raw: row.legacy_raw }] : []), fetchConfig: async () => ({}) });
    const db = await s.hydrate();
    const { _espaceId, ...sansTag } = e;
    expect(db.baux_evenements).toEqual([sansTag]);
    const local = { ...dbLot(), baux_evenements: [sansTag] };
    expect(manquesDuLot(local, 'F-1')).toEqual(manquesDuLot({ ...dbLot(), baux_evenements: [e] }, 'F-1'));
  });
});

function mockStore() {
  const calls = [];
  return {
    calls,
    upsert: async (coll, rec) => { calls.push({ op: 'upsert', coll, rec: { ...rec } }); return { status: 'inserted', version: 1 }; },
    remove: async (coll, rec) => { calls.push({ op: 'remove', coll, rec: { ...rec } }); return { status: 'deleted', version: 2 }; },
    archive: async (coll, rec) => { calls.push({ op: 'archive', coll, rec: { ...rec } }); return { status: 'archived', version: 3 }; }
  };
}
const dbSync = () => ({ entites: [{ nom: 'SCI A', immeubles: [] }], logements: [{ ref: 'F-1', entity: 'SCI A' }], baux: {}, baux_historique: [], baux_evenements: [] });

describe('store-sync — rattachement du manque à la ligne de son bail avant le 1ᵉʳ envoi', () => {
  it('bail NEUF (uid posé dans le même flush) : le manque reçoit cet uid, même créé avec un uid périmé', async () => {
    const store = mockStore();
    const db = dbSync();
    const sync = createStoreSync({ store, getDB: () => db, newUid: () => 'n1' });
    sync.seed();
    db.baux['F-1'] = { debut: '2026-05-01', entity: 'SCI A', hc: 760, ch: 20 };
    db.baux_evenements.push(creer({ bailUid: 'perime' }).entree);
    await sync.flush();
    expect(db.baux['F-1']._bailUid).toBe('n1');
    expect(db.baux_evenements[0].bailUid).toBe('n1');
    expect(db.baux_evenements[0].signedAt).toBeUndefined();   // jamais pris pour une modification du document signé
    expect(store.calls.map((c) => c.op + ':' + c.coll)).toEqual(['upsert:baux', 'upsert:baux_evenements']);
  });
  it('bail ARCHIVÉ (aucun bail vivant de ce début) : l\'uid posé à la création est conservé', async () => {
    const store = mockStore();
    const db = { ...dbSync(), baux: { 'F-1': { debut: '2026-05-01', entity: 'SCI A', _bailUid: 'u1' } }, baux_historique: [{ ref: 'F-1', debut: '2025-01-01', _bailUid: 'h1', _archivedAt: '2026-04-30', entity: 'SCI A' }] };
    const sync = createStoreSync({ store, getDB: () => db, newUid: () => 'zz' });
    sync.seed();
    db.baux_evenements.push(creer({ bailDebut: '2025-01-01', ym: '2026-03', ...rattachementManque(db.baux_historique[0]) }).entree);
    await sync.flush();
    expect(db.baux_evenements[0].bailUid).toBe('h1');
    expect(mapToRow('baux_evenements', db.baux_evenements[0], ctxMap()).bail_id).toBe('uuid:bail|f-1|h1');
  });
  it('annulation après envoi : tombstone → suppression (remove), l\'entrée n\'est plus retouchée', async () => {
    const store = mockStore();
    const db = { ...dbSync(), baux: { 'F-1': { debut: '2026-05-01', entity: 'SCI A', _bailUid: 'u1' } } };
    const sync = createStoreSync({ store, getDB: () => db, newUid: () => 'zz' });
    sync.seed();
    const e = creer({ ...rattachementManque(db.baux['F-1']) }).entree;
    db.baux_evenements.push(e);
    await sync.flush();
    store.calls.length = 0;
    db.baux['F-1']._bailUid = 'u1';
    annulerManque(e, '2026-10-07T00:00:00.000Z');
    await sync.flush();
    expect(store.calls.map((c) => c.op + ':' + c.coll)).toEqual(['remove:baux_evenements']);
    expect(e.bailUid).toBe('u1');
  });
});

// ── 7. Non-régression des lecteurs de DB.baux_evenements ──────────────────────
describe('lecteurs existants de baux_evenements : un manque accepté ne les trompe pas', () => {
  const SIG = { signedAt: '2026-05-01T10:00:00Z', locked: true };
  const bail = () => ({ debut: '2026-05-01', hc: 760, ch: 20, nom: 'Arslan', notes: '', signatures: { ...SIG, bailSnapshot: {} }, _bailUid: 'u1' });
  // Un manque qui porterait même un signedAt (cas hostile) ne doit jamais être réappliqué au bail.
  const manque = () => ({ ...creer({ ...rattachementManque(bail()) }).entree, signedAt: SIG.signedAt, changements: [{ champ: 'hc', apres: 1 }] });
  it('journalDuBail / reappliquerJournalBaux : seul le type « modification » est lu', () => {
    expect(journalDuBail([manque()], 'F-1', bail())).toEqual([]);
    const baux = { 'F-1': bail() };
    reappliquerJournalBaux(baux, [manque()]);
    expect(baux['F-1'].hc).toBe(760);
  });
  it('entreeJournalAuto : le manque présent dans le journal ne change rien au diff automatique', () => {
    const ref = bail(); const vivant = { ...bail(), notes: 'x' };
    const a = entreeJournalAuto('F-1', vivant, ref, [], { date: NOW, id: 'bja' });
    const b = entreeJournalAuto('F-1', vivant, ref, [manque()], { date: NOW, id: 'bja' });
    expect(b).toEqual(a);
  });
  it('registre des avenants : ignoré (liste, numérotation)', () => {
    expect(avenantsDuBail([manque()], 'F-1', bail())).toEqual([]);
    expect(listeAvenants({ journal: [manque()], bailEvents: [], cle: 'F-1', bail: bail() })).toEqual([]);
  });
  it('sauvegarde des PDF : aucun blob pour un manque', () => {
    expect(collectBackupFiles({ baux_evenements: [{ ...manque(), pdfKey: 'k' }] }, null)).toEqual([]);
  });
  it('RGPD : le manque (motif = texte libre) est bien dans les données du logement (voulu, §D)', () => {
    const d = _findPersonalDataForRef({ logements: [{ ref: 'F-1' }], baux_evenements: [manque()] }, 'F-1');
    expect(d.journalBail.map((e) => e.id)).toEqual(['mqa_u1']);
  });
});

// ── 8. Écriture côté app : _manqueAccepter / _manqueAnnuler EXÉCUTÉES ─────────
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(resolve(repoRoot, 'js/app/app-part1.js'), 'utf8').replace(/\r/g, '');
const FNS = ['_manqueNouvelUid', '_manqueSauver', '_manqueCompteursAudit', '_manqueAccepter', '_manqueAnnuler'].map((n) => extraireFonction(SRC, n)).join('\n');

function app({ saveOk = true, readOnly = false, horsLigne = false } = {}) {
  const ordre = [];
  const ctx = {
    window: { ManqueAccepte: MA, __immoHorsLigne: horsLigne },
    DB: { ...dbLot(), params: { userName: 'Didier' }, auditTrail: [] },
    _appReadOnly: readOnly,
    _auditPending: [],
    toasts: [], ordre,
    showToast: (m, t) => { ctx.toasts.push([m, t]); },
    _undoOp: (label, fn) => { ordre.push('undo:' + label); fn(); },
    _stamp: (o) => { ordre.push('stamp'); o._modifiedAt = 'STAMP'; return o; },
    _auditLog: (...a) => { ordre.push('audit:' + a[0]); ctx._auditPending.push(a); },
    saveDB: (o) => { ordre.push('save:' + (o && o.quoi)); return saveOk; },
    _undoOnSaveDBSuccess: () => { ordre.push('undoRealigne'); },
    _refreshAfterMutation: () => { ordre.push('refresh'); },
    JSON, Object, Math, Date, String, Number, Array
  };
  vm.createContext(ctx);
  vm.runInContext(FNS, ctx);
  return ctx;
}
const ACC = { ref: 'F-1', bailDebut: '2026-05-01', ym: '2026-07', montant: 20, motif: 'panne électrique', date: '2026-08-05', dette: 20 };

describe('_manqueAccepter / _manqueAnnuler (app-part1.js) — patron du repo, exécutés', () => {
  it('accepter : undo → push → _stamp → audit → saveDB({quoi:"manque"}) → refresh ; entrée rattachée au bail', () => {
    const c = app();
    const e = vm.runInContext('_manqueAccepter(' + JSON.stringify(ACC) + ')', c);
    expect(c.ordre).toEqual(['undo:Accepter le manque', 'stamp', 'audit:manque-accepte', 'save:manque', 'refresh']);
    expect(c.DB.baux_evenements).toHaveLength(1);
    expect(c.DB.baux_evenements[0]).toBe(e);
    expect(e).toMatchObject({ type: 'manque_accepte', ref: 'F-1', bailDebut: '2026-05-01', bailUid: 'u1', ym: '2026-07', montant: 20, motif: 'panne électrique', auteur: 'Didier', _modifiedAt: 'STAMP' });
    expect(e.id).toMatch(/^mqa_[a-z0-9]+$/);
    expect(c._auditPending[0].slice(0, 3)).toEqual(['manque-accepte', 'bail', 'F-1']);
    // et le moteur le lit
    expect(manquesDuLot(c.DB, 'F-1').map((m) => m.id)).toEqual([e.id]);
  });
  it('refus de validation (plafond absent, motif vide, montant > dette) : rien n\'est écrit', () => {
    for (const p of [{ dette: undefined }, { motif: '  ' }, { montant: 25 }]) {
      const c = app();
      expect(vm.runInContext('_manqueAccepter(' + JSON.stringify({ ...ACC, ...p }) + ')', c)).toBe(null);
      expect(c.ordre).toEqual([]);
      expect(c.DB.baux_evenements).toEqual([]);
      expect(c.toasts[0][1]).toBe('err');
    }
  });
  it('bail introuvable : refus, rien n\'est écrit', () => {
    const c = app();
    expect(vm.runInContext('_manqueAccepter(' + JSON.stringify({ ...ACC, bailDebut: '2020-01-01' }) + ')', c)).toBe(null);
    expect(c.ordre).toEqual([]);
  });
  it('garde _appReadOnly : refus avant toute écriture', () => {
    const c = app({ readOnly: true });
    expect(vm.runInContext('_manqueAccepter(' + JSON.stringify(ACC) + ')', c)).toBe(null);
    expect(vm.runInContext('_manqueAnnuler("x")', c)).toBe(false);
    expect(c.ordre).toEqual([]);
  });
  it('saveDB refusé (hors ligne) : journal restauré, trace d\'audit retirée, pas de refresh, message existant non recouvert', () => {
    const c = app({ saveOk: false, horsLigne: true });
    expect(vm.runInContext('_manqueAccepter(' + JSON.stringify(ACC) + ')', c)).toBe(null);
    expect(c.DB.baux_evenements).toEqual([]);
    expect(c._auditPending).toEqual([]);
    expect(c.ordre).not.toContain('refresh');
    expect(c.toasts).toEqual([]);
  });
  it('saveDB en échec (stockage plein, audit déjà versé) : restauré, auditTrail tronqué, base d\'annulation réalignée, message', () => {
    const c = app({ saveOk: false });
    c.saveDB = () => { c.ordre.push('save'); c.DB.auditTrail.push(...c._auditPending); c._auditPending.length = 0; return false; };
    expect(vm.runInContext('_manqueAccepter(' + JSON.stringify(ACC) + ')', c)).toBe(null);
    expect(c.DB.baux_evenements).toEqual([]);
    expect(c.DB.auditTrail).toEqual([]);
    expect(c.ordre).toContain('undoRealigne');
    expect(c.toasts[0][0]).toMatch(/NON enregistré/);
  });
  it('annuler : tombstone + _stamp + audit + save + refresh ; puis une nouvelle acceptation a un NOUVEL id', () => {
    const c = app();
    const e = vm.runInContext('_manqueAccepter(' + JSON.stringify(ACC) + ')', c);
    c.ordre.length = 0;
    expect(vm.runInContext('_manqueAnnuler(' + JSON.stringify(e.id) + ')', c)).toBe(true);
    expect(c.ordre).toEqual(['undo:Annuler le manque accepté', 'stamp', 'audit:manque-annule', 'save:manque', 'refresh']);
    expect(c.DB.baux_evenements[0]).toMatchObject({ id: e.id, _deleted: true, _modifiedAt: 'STAMP' });
    expect(manquesDuLot(c.DB, 'F-1')).toEqual([]);
    expect(vm.runInContext('_manqueAnnuler(' + JSON.stringify(e.id) + ')', c)).toBe(false);   // déjà annulé
    const e2 = vm.runInContext('_manqueAccepter(' + JSON.stringify(ACC) + ')', c);
    expect(e2.id).not.toBe(e.id);
    expect(c.DB.baux_evenements).toHaveLength(2);
  });
  it('annuler avec saveDB en échec : l\'entrée revient à l\'identique (plus de tombstone)', () => {
    const c = app();
    const e = vm.runInContext('_manqueAccepter(' + JSON.stringify(ACC) + ')', c);
    const avant = JSON.parse(JSON.stringify(e));
    c.saveDB = () => false;
    expect(vm.runInContext('_manqueAnnuler(' + JSON.stringify(e.id) + ')', c)).toBe(false);
    expect(JSON.parse(JSON.stringify(c.DB.baux_evenements[0]))).toEqual(avant);
  });
});
