import { describe, it, expect } from 'vitest';
import { VISALE_PLAFONDS, visaleNormaliser, visaleRenseigne, visaleControle, visaleFusionner } from '../../js/core/visale.js';

describe('VISALE_PLAFONDS — barème du 06/01/2026 (visale.fr)', () => {
  it('3 zones, charges comprises, forfait étudiant', () => {
    expect(VISALE_PLAFONDS.dateEffet).toBe('2026-01-06');
    expect(VISALE_PLAFONDS.zones.map(z => z.max)).toEqual([1940, 1575, 1365]);
    expect(VISALE_PLAFONDS.zones.map(z => z.etudiant)).toEqual([1000, 840, 680]);
  });
});

describe('visaleNormaliser', () => {
  it('null / vide → null', () => {
    expect(visaleNormaliser(null)).toBeNull();
    expect(visaleNormaliser({ visaId: '  ' })).toBeNull();
    expect(visaleNormaliser({})).toBeNull();
  });
  it('legacy { visaId } conservé, champs manquants neutres', () => {
    expect(visaleNormaliser({ visaId: ' V-1 ' })).toEqual({ visaId: 'V-1', beneficiaires: '', loyerMax: null, validite: '', cautionValidee: false });
  });
  it('montant texte « 850 € » / « 1 575,50 » → nombre ; invalide → null', () => {
    expect(visaleNormaliser({ visaId: 'V', loyerMax: '850 €' }).loyerMax).toBe(850);
    expect(visaleNormaliser({ visaId: 'V', loyerMax: '1 575,50' }).loyerMax).toBe(1575.5);
    expect(visaleNormaliser({ visaId: 'V', loyerMax: 'abc' }).loyerMax).toBeNull();
    expect(visaleNormaliser({ visaId: 'V', loyerMax: 0 }).loyerMax).toBeNull();
  });
  it('validité ISO seulement', () => {
    expect(visaleNormaliser({ visaId: 'V', validite: '2026-12-14' }).validite).toBe('2026-12-14');
    expect(visaleNormaliser({ visaId: 'V', validite: '14/12/2026' }).validite).toBe('');
  });
  it('cautionValidee booléen strict', () => {
    expect(visaleNormaliser({ visaId: 'V', cautionValidee: 'oui' }).cautionValidee).toBe(false);
    expect(visaleNormaliser({ visaId: 'V', cautionValidee: true }).cautionValidee).toBe(true);
  });
});

describe('visaleRenseigne', () => {
  it('vrai seulement si un n° de visa', () => {
    expect(visaleRenseigne({ visaId: 'V' })).toBe(true);
    expect(visaleRenseigne({ visaId: ' ' })).toBe(false);
    expect(visaleRenseigne(null)).toBe(false);
  });
});

describe('visaleControle', () => {
  const vis = { visaId: 'V', loyerMax: 850, validite: '2026-12-14' };
  it('loyer CC > loyer max → depasse', () => {
    const r = visaleControle(vis, { loyerCC: 900, aujourdhui: '2026-09-28' });
    expect(r.depasse).toEqual({ loyerCC: 900, loyerMax: 850 });
    expect(r.expire).toBeNull();
  });
  it('loyer CC = loyer max → pas de dépassement (au plus)', () => {
    expect(visaleControle(vis, { loyerCC: 850, aujourdhui: '2026-09-28' }).depasse).toBeNull();
  });
  it('loyer inconnu ou loyer max absent → aucun verdict', () => {
    expect(visaleControle(vis, { loyerCC: 0, aujourdhui: '2026-09-28' }).depasse).toBeNull();
    expect(visaleControle({ visaId: 'V' }, { loyerCC: 900, aujourdhui: '2026-09-28' }).depasse).toBeNull();
  });
  it('validité passée → expire ; le jour même reste valable', () => {
    expect(visaleControle(vis, { loyerCC: 800, aujourdhui: '2026-12-15' }).expire).toEqual({ validite: '2026-12-14' });
    expect(visaleControle(vis, { loyerCC: 800, aujourdhui: '2026-12-14' }).expire).toBeNull();
  });
  it('pas de visa → aucun contrôle', () => {
    expect(visaleControle(null, { loyerCC: 900, aujourdhui: '2026-09-28' })).toEqual({ depasse: null, expire: null });
  });
  it('arrondi au centime (charges décimales)', () => {
    expect(visaleControle({ visaId: 'V', loyerMax: 900 }, { loyerCC: 780.1 + 119.9, aujourdhui: '2026-01-01' }).depasse).toBeNull();
  });
});

describe('visaleFusionner — complément du dossier en ligne (n° seul)', () => {
  it('même n° → garde les champs saisis par le bailleur', () => {
    const ex = { visaId: 'V-1', beneficiaires: 'M. L', loyerMax: 900, validite: '2026-12-01', cautionValidee: true };
    expect(visaleFusionner(ex, { visaId: 'V-1' })).toEqual(ex);
  });
  it('n° différent → nouveau visa, anciens champs abandonnés', () => {
    const ex = { visaId: 'V-1', loyerMax: 900 };
    expect(visaleFusionner(ex, { visaId: 'V-2' })).toEqual({ visaId: 'V-2', beneficiaires: '', loyerMax: null, validite: '', cautionValidee: false });
  });
  it('entrant vide → existant inchangé ; existant vide → entrant', () => {
    expect(visaleFusionner({ visaId: 'V-1', loyerMax: 900 }, null).loyerMax).toBe(900);
    expect(visaleFusionner(null, { visaId: 'V-3' }).visaId).toBe('V-3');
    expect(visaleFusionner(null, null)).toBeNull();
  });
});
