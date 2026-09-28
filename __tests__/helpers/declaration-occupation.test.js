import { describe, it, expect } from 'vitest';
import { GMBI_MOTIFS_VACANCE, gmbiEcheance, gmbiAlerteSortie, gmbiAlerteEntree } from '../../js/core/declaration-occupation.js';

describe('gmbiEcheance — « avant le 1er juillet » de la campagne suivante', () => {
  it('changement du 02/01/N au 31/12/N → 1er juillet N+1', () => {
    expect(gmbiEcheance('2026-03-01')).toBe('2027-07-01');
    expect(gmbiEcheance('2026-01-02')).toBe('2027-07-01');
    expect(gmbiEcheance('2026-12-31')).toBe('2027-07-01');
  });
  it('changement le 1er janvier N → campagne N (1er juillet N)', () => {
    expect(gmbiEcheance('2027-01-01')).toBe('2027-07-01');
  });
  it('date invalide → vide', () => {
    expect(gmbiEcheance('')).toBe('');
    expect(gmbiEcheance('14/12/2026')).toBe('');
  });
});

describe('gmbiAlerteSortie', () => {
  const log = { ref: 'COL-BOX4', nom: 'Garage Colmar box 4' };
  const bail = { ref: 'COL-BOX4', locataires: [{ nom: 'Paul Weber' }], finEffective: '2026-06-30' };
  it('catégorie vacant + 4 motifs officiels + dernier occupant', () => {
    const a = gmbiAlerteSortie({ log, bail, dateSortie: '2026-06-30' });
    expect(a.kind).toBe('sortie');
    expect(a.ref).toBe('COL-BOX4');
    expect(a.date).toBe('2026-06-30');
    expect(a.echeance).toBe('2027-07-01');
    expect(a.occupants).toEqual([{ nom: 'Paul Weber', ddn: '', lieuNaiss: '' }]);
    expect(GMBI_MOTIFS_VACANCE).toHaveLength(4);
  });
  it('legacy : bail.nom sans locataires[]', () => {
    const a = gmbiAlerteSortie({ log, bail: { nom: 'X' }, dateSortie: '2026-06-30' });
    expect(a.occupants[0].nom).toBe('X');
  });
  it('sans date de sortie → null (rien à dire)', () => {
    expect(gmbiAlerteSortie({ log, bail, dateSortie: '' })).toBeNull();
  });
});

describe('gmbiAlerteEntree', () => {
  const log = { ref: 'FER-001', nom: 'Ferrette 001' };
  const bail = { ref: 'FER-001', debut: '2026-03-01', hc: 780, ch: 120, locataires: [{ nom: 'Marion Leroy', ddn: '1998-04-12', lieuNaiss: 'Mulhouse (68)' }] };
  it('occupé par des tiers : occupants, date d\'entrée, loyer HC, échéance', () => {
    const a = gmbiAlerteEntree({ log, bail });
    expect(a.kind).toBe('entree');
    expect(a.date).toBe('2026-03-01');
    expect(a.echeance).toBe('2027-07-01');
    expect(a.loyerHC).toBe(780);
    expect(a.occupants).toEqual([{ nom: 'Marion Leroy', ddn: '1998-04-12', lieuNaiss: 'Mulhouse (68)' }]);
  });
  it('bail repris à l\'achat → pas d\'alerte', () => {
    expect(gmbiAlerteEntree({ log, bail: { ...bail, typeContrat: 'repris' } })).toBeNull();
  });
  it('renouvellement → pas d\'alerte', () => {
    expect(gmbiAlerteEntree({ log, bail: { ...bail, typeContrat: 'renouvellement' } })).toBeNull();
  });
  it('mêmes occupants que le bail précédent (casse, espaces, ordre) → pas d\'alerte', () => {
    const precedent = { locataires: [{ nom: ' marion  LEROY ' }] };
    expect(gmbiAlerteEntree({ log, bail, precedent })).toBeNull();
  });
  it('occupants différents du bail précédent → alerte', () => {
    const precedent = { locataires: [{ nom: 'Julie Morel' }] };
    expect(gmbiAlerteEntree({ log, bail, precedent })).not.toBeNull();
  });
  it('sans locataire nommé ou sans date de début → null', () => {
    expect(gmbiAlerteEntree({ log, bail: { ...bail, locataires: [{ nom: ' ' }] } })).toBeNull();
    expect(gmbiAlerteEntree({ log, bail: { ...bail, debut: '' } })).toBeNull();
  });
  it('loyer HC absent ou nul → null (champ facultatif)', () => {
    expect(gmbiAlerteEntree({ log, bail: { ...bail, hc: 0 } }).loyerHC).toBeNull();
  });
});
