/**
 * Tests read-log-for-bail — résolution centralisée champs « bien » côté bail.
 * (G1 audit v15.216 — couverture du contrat immutabilité légale + imm partiel)
 */

import { describe, it, expect } from 'vitest';
import { readLogForBail } from './read-log-for-bail.js';

// ─── Fixtures ───────────────────────────────────────────────────────
const makeLog = (over = {}) => ({
  ref: 'LOG-1', entity: 'SCI Test', imm: 'Imm A',
  type: 'T3', surf: 65, npp: 3, etage: '3',
  adr: '15 rue X, 75001 Paris',
  dpe: { classe: 'C', ges: 'C', date: '2023-01-15', valConv: 180 },
  etatRisques: { erp: 'oui', plomb: 'non', amiante: 'non', elec: 'oui', gaz: 'non', bruit: 'non' },
  chauffage: { elec: false, gaz: true, coll: false, label: 'Gaz individuel' },
  ecs: { elec: false, gaz: true, coll: false, label: 'Gaz' },
  ...over
});

const makeImm = (over = {}) => ({
  id: 'imm1', nom: 'Imm A',
  adr: '15 rue X', codePostal: '75001', ville: 'Paris',
  annee: 1925, periodeConstr: 'Avant 1949', regimeJuridique: 'Copropriété',
  equipementsCommuns: { ascenseur: true, customs: [] },
  ...over
});

const makeBailSigne = (snapshotLog, snapshotImm) => ({
  ref: 'LOG-1', signatures: {
    signedAt: '2026-01-15',
    bailSnapshot: {
      log: snapshotLog,
      imm: snapshotImm,
      capturedAt: '2026-01-15T10:00:00Z'
    }
  }
});

// Lookup factice (simule DB.entites.find)
const makeLookup = (entityToImm) => (entity, immNom) => {
  if (!entityToImm[entity]) return null;
  return entityToImm[entity][immNom] || null;
};

// ─── Cas nominaux ───────────────────────────────────────────────────
describe('readLogForBail — bail NON signé (cas nominal)', () => {
  it('lookup courant : imm autoritative → adresse complète', () => {
    const log = makeLog();
    const imm = makeImm();
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': imm } });
    const r = readLogForBail(null, log, lookup);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris');
    expect(r._bailSignedSnapshot).toBe(false);
    expect(r._immCodePostal).toBe('75001');
    expect(r._immVille).toBe('Paris');
    expect(r._immPeriodeConstr).toBe('Avant 1949');
    expect(r._immRegime).toBe('Copropriété');
    expect(r._immAnnee).toBe(1925);
  });

  it('aliases legacy DPE / risques / chauffage flat', () => {
    const log = makeLog();
    const r = readLogForBail(null, log, () => null);
    expect(r.dpe).toBe('C');
    expect(r.ges).toBe('C');
    expect(r.erp).toBe('oui');
    expect(r.chauffGaz).toBe(true);
    expect(r.chauff).toBe('Gaz individuel');
  });

  it('lookup retourne null (imm orphelin) → fallback log.adr legacy', () => {
    const log = makeLog();
    const r = readLogForBail(null, log, () => null);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris');
    expect(r._immCodePostal).toBe('');
  });
});

// ─── F1 — Immutabilité légale bail signé ────────────────────────────
describe('F1 — Immutabilité bail signé (audit v15.215)', () => {
  it('bail signé : src vient du snapshot.log, PAS du log courant', () => {
    const snapshotLog = { ...makeLog(), adr: '5 rue Z, 75002 Paris' };
    const logCourant = { ...makeLog(), adr: '15 rue X, 75001 Paris' }; // modifié post-sign
    const bail = makeBailSigne(snapshotLog);
    const r = readLogForBail(bail, logCourant, () => null);
    expect(r._bailSignedSnapshot).toBe(true);
    expect(r.adrBien).toBe('5 rue Z, 75002 Paris'); // snapshot préservé
    expect(r.adrBien).not.toBe('15 rue X, 75001 Paris');
  });

  it('bail signé : AUCUN lookup DB.entites courant (immutabilité)', () => {
    const snapshotLog = { ...makeLog(), adr: '5 rue Z, 75002 Paris' };
    const bail = makeBailSigne(snapshotLog);
    // Lookup spy : doit JAMAIS être appelé
    let lookupCalled = false;
    const lookup = () => { lookupCalled = true; return makeImm({ codePostal: '99999', ville: 'NOWHERE' }); };
    const r = readLogForBail(bail, null, lookup);
    expect(lookupCalled).toBe(false);
    expect(r.adrBien).toBe('5 rue Z, 75002 Paris');
  });

  it('bail signé avec snapshot.imm (G2 v15.217) → adresse depuis snapshot.imm', () => {
    const snapshotLog = { ...makeLog(), adr: 'fallback rue' };
    const snapshotImm = makeImm({ adr: '5 rue Z', codePostal: '75002', ville: 'Paris' });
    const bail = makeBailSigne(snapshotLog, snapshotImm);
    // Lookup courant divergeant — doit être IGNORÉ
    const lookup = () => makeImm({ adr: '99 rue Y', codePostal: '99999', ville: 'NOWHERE' });
    const r = readLogForBail(bail, null, lookup);
    expect(r.adrBien).toBe('5 rue Z, 75002 Paris');
    expect(r._immCodePostal).toBe('75002');
    expect(r._immVille).toBe('Paris');
  });

  it('bail signé MAIS snapshot.log sans .adr → adrBien vide (dégradé mais immutable)', () => {
    const snapshotLog = { ...makeLog(), adr: undefined };
    delete snapshotLog.adr;
    const bail = makeBailSigne(snapshotLog);
    const r = readLogForBail(bail, null, () => makeImm()); // lookup IGNORÉ
    expect(r.adrBien).toBe('');
    expect(r._bailSignedSnapshot).toBe(true);
  });

  it('bail signé MAIS bailSnapshot.log absent → _isSignedSnapshot=false + lookup courant', () => {
    const bail = { ref: 'LOG-1', signatures: { signedAt: '2026-01-15', bailSnapshot: { log: null } } };
    const log = makeLog();
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': makeImm() } });
    const r = readLogForBail(bail, log, lookup);
    expect(r._bailSignedSnapshot).toBe(false);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris'); // lookup courant OK
  });
});

// ─── F3 — Imm partiellement migré ───────────────────────────────────
describe('F3 — Imm partiellement migré (audit v15.215)', () => {
  it('imm avec rue seule (sans CP/ville) → legacy log.adr préservé', () => {
    const log = makeLog({ adr: '15 rue X, 75001 Paris' });
    const imm = { adr: '10 rue Y' }; // sans CP ni ville
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': imm } });
    const r = readLogForBail(null, log, lookup);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris');
    expect(r.adrBien).not.toBe('10 rue Y');
  });

  it('imm avec CP seul → legacy log.adr préservé', () => {
    const log = makeLog({ adr: '15 rue X, 75001 Paris' });
    const imm = { codePostal: '75011' };
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': imm } });
    const r = readLogForBail(null, log, lookup);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris');
  });

  it('imm avec ville seule → legacy log.adr préservé', () => {
    const log = makeLog({ adr: '15 rue X, 75001 Paris' });
    const imm = { ville: 'Paris' };
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': imm } });
    const r = readLogForBail(null, log, lookup);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris');
  });

  it('imm partiel → période/régime/année quand même extraits si présents', () => {
    const log = makeLog({ adr: '15 rue X, 75001 Paris', periodeConstr: 'Avant 1949' });
    const imm = { adr: '10 rue Y', periodeConstr: 'De 1990 à 2005', annee: 1995 };
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': imm } });
    const r = readLogForBail(null, log, lookup);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris'); // adr legacy
    expect(r._immPeriodeConstr).toBe('De 1990 à 2005'); // imm partiel quand même utilisé
    expect(r._immAnnee).toBe(1995);
  });

  it('imm complet → autoritative, écrase legacy', () => {
    const log = makeLog({ adr: '15 rue X, 75001 Paris' });
    const imm = makeImm({ adr: '20 rue W', codePostal: '75020', ville: 'Paris' });
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': imm } });
    const r = readLogForBail(null, log, lookup);
    expect(r.adrBien).toBe('20 rue W, 75020 Paris');
  });
});

// ─── Cas pathologiques ──────────────────────────────────────────────
describe('readLogForBail — cas pathologiques', () => {
  it('bail null + log null → {}', () => {
    expect(readLogForBail(null, null, () => null)).toEqual({});
  });

  it('bail = {} (no signatures) + log → lookup courant', () => {
    const log = makeLog();
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': makeImm() } });
    const r = readLogForBail({}, log, lookup);
    expect(r._bailSignedSnapshot).toBe(false);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris');
  });

  it('bail signé avec signatures.bailSnapshot=null → lookup courant', () => {
    const bail = { signatures: { signedAt: '2026-01-15', bailSnapshot: null } };
    const log = makeLog();
    const lookup = makeLookup({ 'SCI Test': { 'Imm A': makeImm() } });
    const r = readLogForBail(bail, log, lookup);
    expect(r._bailSignedSnapshot).toBe(false);
    expect(r.adrBien).toBe('15 rue X, 75001 Paris');
  });

  it('lookupImm pas une fonction → traite imm comme null', () => {
    const log = makeLog();
    const r = readLogForBail(null, log, 'not a function');
    expect(r.adrBien).toBe('15 rue X, 75001 Paris'); // fallback log.adr
    expect(r._immCodePostal).toBe('');
  });

  it('lookupImm jette une exception — propage pas (ou catch ?)', () => {
    const log = makeLog();
    const lookup = () => { throw new Error('DB inaccessible'); };
    // Le contrat actuel ne catch pas — c'est intentionnel (fail loud côté caller).
    expect(() => readLogForBail(null, log, lookup)).toThrow();
  });
});
