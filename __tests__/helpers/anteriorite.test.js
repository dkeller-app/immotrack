import { describe, it, expect } from 'vitest';
import { debutSuiviLot, normaliserAnteriorite, normaliserDate } from '../../js/core/anteriorite.js';

/**
 * R0-C · Q1 RÉVISÉ (Didier 05/10, maquette MAQUETTE-ANTERIORITE validée) — le point de départ des
 * loyers suivis d'un lot : date d'achat > antériorité notée > date provisoire « à confirmer ».
 * Jamais l'absence de relevés.
 */
const bail = (debut, extra = {}) => ({ debut, hc: 700, ch: 0, ...extra });

describe('normaliserDate', () => {
  it('accepte AAAA-MM-JJ, AAAA-MM et un ISO horodaté ; refuse le reste sans jamais réécrire une saisie', () => {
    expect(normaliserDate('2026-03-15')).toBe('2026-03-15');
    expect(normaliserDate('2026-03')).toBe('2026-03-01');
    expect(normaliserDate('2026-03-15T10:00:00Z')).toBe('2026-03-15');
    expect(normaliserDate('2026-02-30')).toBeNull();
    expect(normaliserDate('15/03/2026')).toBeNull();
    expect(normaliserDate('')).toBeNull();
  });
});

describe('debutSuiviLot — la date d\'achat borne tout (bien acheté loué)', () => {
  it('Ferrette : bail de 2018 chez le vendeur, acheté le 01/03/2026 → suivi au 01/03/2026, situation à noter', () => {
    const r = debutSuiviLot({ dateAcqImm: '2026-03-01', bails: [bail('2018-03-16')], provisoireIso: '2026-03-01' });
    expect(r).toMatchObject({ date: '2026-03-01', source: 'acquisition', jouissance: '2026-03-01', aConfirmer: false, ouverture: null });
    expect(r.bailsAvant).toEqual(['2018-03-16']);
  });
  it('l\'exception par logement prime sur la date de l\'immeuble', () => {
    expect(debutSuiviLot({ dateAcqLot: '2026-05-10', dateAcqImm: '2026-03-01', bails: [bail('2020-01-01')] }).date).toBe('2026-05-10');
  });
  it('un bail commencé APRÈS l\'achat n\'a rien à noter', () => {
    expect(debutSuiviLot({ dateAcqImm: '2024-01-01', bails: [bail('2025-09-01')] }).bailsAvant).toEqual([]);
  });
  it('un bail terminé avant l\'achat n\'a rien à noter non plus', () => {
    const r = debutSuiviLot({ dateAcqImm: '2026-03-01', bails: [bail('2019-01-01', { finEffective: '2025-12-31', archive: true }), bail('2026-01-15')] });
    expect(r.bailsAvant).toEqual(['2026-01-15']);
  });
});

describe('debutSuiviLot — l\'antériorité notée donne la date ET le solde d\'ouverture, une seule fois', () => {
  it('arrivée dans Propryo : bail de 2019, suivi au 01/01/2026 avec 1 300 € d\'arriéré de loyer', () => {
    const r = debutSuiviLot({ bails: [bail('2019-09-04', { anteriorite: { date: '2026-01-01', situation: 'arriere', loyer: 1300, charges: 0 } })], provisoireIso: '2024-02-01' });
    expect(r).toMatchObject({ date: '2026-01-01', source: 'anteriorite', aConfirmer: false });
    expect(r.ouverture).toEqual({ date: '2026-01-01', bailDebut: '2019-09-04', loyer: 1300, charge: 0, avance: 0 });
  });
  it('avance notée → ouverture en avance ; « à jour » → pas d\'ouverture mais la date vaut', () => {
    expect(debutSuiviLot({ bails: [bail('2019-09-04', { anteriorite: { date: '2026-01-01', situation: 'avance', avance: 700 } })] }).ouverture)
      .toMatchObject({ loyer: 0, charge: 0, avance: 700 });
    const aj = debutSuiviLot({ bails: [bail('2019-09-04', { anteriorite: { date: '2026-01-01', situation: 'a-jour' } })] });
    expect(aj).toMatchObject({ date: '2026-01-01', source: 'anteriorite', ouverture: null });
  });
  it('bien acheté loué + situation notée à la date d\'achat : la date d\'achat ET le solde', () => {
    const r = debutSuiviLot({ dateAcqImm: '2026-03-01', bails: [bail('2024-08-20', { anteriorite: { date: '2026-03-01', situation: 'arriere', loyer: 1400 } })] });
    expect(r).toMatchObject({ date: '2026-03-01', source: 'anteriorite', jouissance: '2026-03-01' });
    expect(r.ouverture.loyer).toBe(1400);
  });
  it('une antériorité datée AVANT l\'achat ne vaut pas (le bailleur actuel ne suivait rien à cette date)', () => {
    const r = debutSuiviLot({ dateAcqImm: '2026-03-01', bails: [bail('2024-08-20', { anteriorite: { date: '2025-12-01', situation: 'arriere', loyer: 900 } })] });
    expect(r).toMatchObject({ date: '2026-03-01', source: 'acquisition', ouverture: null });
  });
  it('plusieurs baux notés : la plus récente fait foi (le passé est résumé par son solde)', () => {
    const r = debutSuiviLot({ bails: [
      bail('2018-01-01', { finEffective: '2023-12-31', archive: true, anteriorite: { date: '2020-01-01', situation: 'arriere', loyer: 500 } }),
      bail('2024-01-01', { anteriorite: { date: '2026-01-01', situation: 'avance', avance: 300 } })] });
    expect(r.ouverture).toMatchObject({ bailDebut: '2024-01-01', avance: 300, loyer: 0 });
  });
});

describe('debutSuiviLot — (b) données existantes : date provisoire, aucun chiffre ne bouge', () => {
  it('sans date d\'achat ni antériorité : la date provisoire (1ᵉʳ loyer encaissé), marquée à confirmer si elle tronque un bail', () => {
    const r = debutSuiviLot({ bails: [bail('2024-08-20')], provisoireIso: '2026-03-01' });
    expect(r).toMatchObject({ date: '2026-03-01', source: 'provisoire', aConfirmer: true, ouverture: null });
  });
  it('payé dès le mois d\'entrée : la date provisoire ne tronque rien → rien à confirmer', () => {
    expect(debutSuiviLot({ bails: [bail('2024-02-01')], provisoireIso: '2024-02-01' }).aConfirmer).toBe(false);
  });
  it('ni loyer ni bail : rien à suivre (date null), comme l\'ancien moteur', () => {
    expect(debutSuiviLot({ bails: [], provisoireIso: null })).toMatchObject({ date: null, source: null, aConfirmer: false });
  });
  it('les baux supprimés (tombstones) ne comptent pas', () => {
    expect(debutSuiviLot({ bails: [bail('2019-01-01', { _deleted: true })], provisoireIso: '2026-03-01' }).aConfirmer).toBe(false);
  });
});

describe('normaliserAnteriorite — ce qui est enregistré dans bail.anteriorite', () => {
  const T = '2026-10-05T10:00:00.000Z';
  it('arriéré : loyer, charges et mois (triés, dédoublonnés) ; l\'avance saisie par erreur n\'est pas gardée', () => {
    expect(normaliserAnteriorite({ date: '2026-03-01', situation: 'arriere', loyer: '1400', charges: '0', avance: 50, mois: ['2026-02', '2026-01', '2026-02'] }, { maintenant: T }))
      .toEqual({ date: '2026-03-01', situation: 'arriere', loyer: 1400, charges: 0, avance: 0, mois: ['2026-01', '2026-02'], note: '', saisiLe: T });
  });
  it('avance : seul le montant d\'avance est gardé ; virgule décimale acceptée', () => {
    expect(normaliserAnteriorite({ date: '2026-01-01', situation: 'avance', avance: '700,50', loyer: 300 }, { maintenant: T }))
      .toMatchObject({ situation: 'avance', avance: 700.5, loyer: 0, charges: 0, mois: [] });
  });
  it('à jour : aucun montant', () => {
    expect(normaliserAnteriorite({ date: '2026-01-01', situation: 'a-jour', loyer: 300 }, { maintenant: T }))
      .toMatchObject({ situation: 'a-jour', loyer: 0, avance: 0 });
  });
  it('sans date valide : rien n\'est enregistré à moitié (null) ; montants négatifs ramenés à 0', () => {
    expect(normaliserAnteriorite({ date: '', situation: 'arriere', loyer: 300 })).toBeNull();
    expect(normaliserAnteriorite({ date: '2026-01-01', situation: 'arriere', loyer: -40 }, { maintenant: T }).loyer).toBe(0);
  });
});
