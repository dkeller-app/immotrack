/**
 * Tests du module georisques-erp-detector
 * (FEAT-GEORISQUES-ERP, v15.252)
 *
 * Fixtures = valeurs RÉELLES observées sur les API live le 2026-06-02
 * (BAN api-adresse.data.gouv.fr + Géorisques www.georisques.gouv.fr/api/v1).
 */

import { describe, it, expect } from 'vitest';
import {
  parentInsee,
  banUrl, seismicUrl, radonUrl, pprnUrl, pprtUrl, pprmUrl, georisquesReportUrl,
  parseBan, parseSeismic, parseRadon, parsePpr,
  decideErp, ERP_INDETERMINE,
} from './georisques-erp-detector.js';

describe('parentInsee — normalisation arrondissements PLM', () => {
  it('Paris 8e (75108) → commune 75056', () => { expect(parentInsee('75108')).toBe('75056'); });
  it('Paris 20e (75120) → 75056', () => { expect(parentInsee('75120')).toBe('75056'); });
  it('Lyon 3e (69383) → commune 69123', () => { expect(parentInsee('69383')).toBe('69123'); });
  it('Marseille 1er (13201) → commune 13055', () => { expect(parentInsee('13201')).toBe('13055'); });
  it('Marseille 16e (13216) → 13055', () => { expect(parentInsee('13216')).toBe('13055'); });
  it('commune normale inchangée (23096 Guéret)', () => { expect(parentInsee('23096')).toBe('23096'); });
  it('Nice (06088) inchangée', () => { expect(parentInsee('06088')).toBe('06088'); });
  it('vide / null → chaîne vide', () => {
    expect(parentInsee('')).toBe('');
    expect(parentInsee(null)).toBe('');
    expect(parentInsee(undefined)).toBe('');
  });
});

describe('URL builders — gotcha snake_case vs camelCase', () => {
  it('banUrl encode l\'adresse + limit=1', () => {
    expect(banUrl('15 rue de la Paix 75002 Paris'))
      .toBe('https://api-adresse.data.gouv.fr/search/?q=15%20rue%20de%20la%20Paix%2075002%20Paris&limit=1');
  });
  it('seismicUrl utilise code_insee (snake)', () => {
    expect(seismicUrl('06088')).toBe('https://www.georisques.gouv.fr/api/v1/zonage_sismique?code_insee=06088');
  });
  it('radonUrl utilise code_insee (snake)', () => {
    expect(radonUrl('23096')).toBe('https://www.georisques.gouv.fr/api/v1/radon?code_insee=23096');
  });
  it('pprnUrl utilise codeInsee (CAMELCASE — snake renverrait le dataset national entier)', () => {
    expect(pprnUrl('75056')).toBe('https://www.georisques.gouv.fr/api/v1/gaspar/pprn?codeInsee=75056');
    expect(pprnUrl('75056')).not.toContain('code_insee');
  });
  it('pprtUrl + pprmUrl utilisent codeInsee (camelCase)', () => {
    expect(pprtUrl('06088')).toContain('gaspar/pprt?codeInsee=06088');
    expect(pprmUrl('06088')).toContain('gaspar/pprm?codeInsee=06088');
  });
  it('georisquesReportUrl inclut codeInsee + lon/lat si fournis', () => {
    expect(georisquesReportUrl('06088', [7.26579, 43.695081]))
      .toBe('https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?codeInsee=06088&lon=7.26579&lat=43.695081');
    expect(georisquesReportUrl('06088', null))
      .toBe('https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?codeInsee=06088');
  });
});

describe('parseBan — extraction INSEE + coords', () => {
  it('extrait citycode + coords + ville (feature Paris réelle)', () => {
    const json = { features: [{
      properties: { citycode: '75108', postcode: '75008', city: 'Paris', label: '55 Rue du Faubourg Saint-Honoré 75008 Paris', score: 0.96 },
      geometry: { coordinates: [2.316931, 48.87063] }
    }] };
    expect(parseBan(json)).toEqual({
      insee: '75108', postcode: '75008', city: 'Paris',
      label: '55 Rue du Faubourg Saint-Honoré 75008 Paris', score: 0.96,
      lonlat: [2.316931, 48.87063],
    });
  });
  it('features vide → null', () => { expect(parseBan({ features: [] })).toBeNull(); });
  it('citycode absent → null', () => {
    expect(parseBan({ features: [{ properties: { city: 'X' }, geometry: { coordinates: [1, 2] } }] })).toBeNull();
  });
  it('json malformé → null', () => {
    expect(parseBan(null)).toBeNull();
    expect(parseBan({})).toBeNull();
  });
});

describe('parseSeismic — zonage_sismique', () => {
  it('Nice zone 4', () => {
    expect(parseSeismic({ data: [{ code_zone: '4', zone_sismicite: '4 - MOYENNE' }] }))
      .toEqual({ zone: 4, label: '4 - MOYENNE' });
  });
  it('Paris zone 1', () => {
    expect(parseSeismic({ data: [{ code_zone: '1', zone_sismicite: '1 - TRES FAIBLE' }] }))
      .toEqual({ zone: 1, label: '1 - TRES FAIBLE' });
  });
  it('data vide → null (déclenche fallback arrondissement côté orchestration)', () => {
    expect(parseSeismic({ results: 0, data: [] })).toBeNull();
  });
  it('json malformé → null', () => { expect(parseSeismic(null)).toBeNull(); });
});

describe('parseRadon — classe potentiel', () => {
  it('Guéret catégorie 3', () => {
    expect(parseRadon({ data: [{ classe_potentiel: '3' }] })).toEqual({ category: 3 });
  });
  it('Paris catégorie 1', () => {
    expect(parseRadon({ data: [{ classe_potentiel: '1' }] })).toEqual({ category: 1 });
  });
  it('data vide → null', () => { expect(parseRadon({ data: [] })).toBeNull(); });
  it('json malformé → null', () => { expect(parseRadon(undefined)).toBeNull(); });
});

describe('parsePpr — wrapper totalElements/content', () => {
  it('Paris 3 PPRN avec noms', () => {
    const json = { totalElements: 3, content: [
      { libPpr: 'R111.3 - Dissolution de gypse' },
      { libPpr: 'R111.3 - Anciennes carrières' },
      { libPpr: 'PPRi de Paris - Révision' },
    ] };
    expect(parsePpr(json)).toEqual({
      count: 3,
      names: ['R111.3 - Dissolution de gypse', 'R111.3 - Anciennes carrières', 'PPRi de Paris - Révision'],
    });
  });
  it('aucun PPR → count 0', () => {
    expect(parsePpr({ totalElements: 0, content: [] })).toEqual({ count: 0, names: [] });
  });
  it('json malformé → count 0', () => { expect(parsePpr(null)).toEqual({ count: 0, names: [] }); });
});

describe('decideErp — règle légale tri-état (ERP obligatoire si PPR | sismicité≥2 | radon cat.3)', () => {
  it('Paris 8e : PPRN présent → requis', () => {
    const r = decideErp({
      seismic: { zone: 1, label: '1 - TRES FAIBLE' }, radon: { category: 1 },
      pprn: { count: 3, names: ['PPRi de Paris - Révision'] },
    });
    expect(r.required).toBe(true);
    expect(r.reasons.join(' ')).toContain('PPR');
  });
  it('Nice : sismicité zone 4 + PPRN → requis', () => {
    const r = decideErp({
      seismic: { zone: 4, label: '4 - MOYENNE' }, radon: { category: 1 },
      pprn: { count: 7, names: ['PPRN-IF Nice 2017'] },
    });
    expect(r.required).toBe(true);
    expect(r.reasons.some(x => /[Ss]ismicit|zone 4/.test(x))).toBe(true);
  });
  it('Guéret : sismicité zone 2 + radon cat.3, aucun PPR → requis', () => {
    const r = decideErp({ seismic: { zone: 2, label: '2 - FAIBLE' }, radon: { category: 3 }, pprn: { count: 0, names: [] } });
    expect(r.required).toBe(true);
    expect(r.reasons.some(x => /[Rr]adon/.test(x))).toBe(true);
    expect(r.reasons.some(x => /zone 2/.test(x))).toBe(true);
  });
  it('Lyon 3e (parent 69123) : sismicité zone 2 seule → requis', () => {
    const r = decideErp({ seismic: { zone: 2, label: '2 - FAIBLE' }, radon: { category: 1 }, pprn: { count: 0, names: [] } });
    expect(r.required).toBe(true);
  });
  it('Orléans : PPRi seul (sismicité 1, radon 1) → requis', () => {
    const r = decideErp({ seismic: { zone: 1, label: '1 - TRES FAIBLE' }, radon: { category: 1 }, pprn: { count: 1, names: ['Révision PPRi Val d\'Orléans'] } });
    expect(r.required).toBe(true);
  });
  it('Commune sans aucun risque (sismicité 1 + radon 1 + 0 PPR ×3, 5 signaux définitifs) → NON requis', () => {
    const r = decideErp({ seismic: { zone: 1, label: '1 - TRES FAIBLE' }, radon: { category: 1 }, pprn: { count: 0, names: [] }, pprt: { count: 0, names: [] }, pprm: { count: 0, names: [] } });
    expect(r.required).toBe(false);
    expect(r.reasons).toEqual([]);
  });
  it('PPRT technologique seul → requis', () => {
    const r = decideErp({ seismic: { zone: 1 }, radon: { category: 1 }, pprn: { count: 0, names: [] }, pprt: { count: 1, names: ['PPRT SITE X'] } });
    expect(r.required).toBe(true);
    expect(r.reasons.join(' ')).toContain('technologique');
  });
  it('PPRM minier seul → requis', () => {
    const r = decideErp({ seismic: { zone: 1 }, radon: { category: 1 }, pprn: { count: 0, names: [] }, pprt: { count: 0, names: [] }, pprm: { count: 2, names: ['PPRM Houillères'] } });
    expect(r.required).toBe(true);
    expect(r.reasons.join(' ')).toContain('minier');
  });
});

describe('decideErp — dégradation gracieuse (jamais d\'affirmation si incertain)', () => {
  it('sismicité indisponible (null) → indéterminé même si radon+ppr OK', () => {
    const r = decideErp({ seismic: null, radon: { category: 1 }, pprn: { count: 0, names: [] } });
    expect(r.required).toBe(ERP_INDETERMINE);
  });
  it('PPRN indisponible (null) → indéterminé', () => {
    const r = decideErp({ seismic: { zone: 1 }, radon: { category: 1 }, pprn: null });
    expect(r.required).toBe(ERP_INDETERMINE);
  });
  it('PPRT indisponible (null) → indéterminé même si sismicité+radon+PPRN+PPRM connus & clairs (commune Seveso non vérifiable)', () => {
    const r = decideErp({ seismic: { zone: 1 }, radon: { category: 1 }, pprn: { count: 0, names: [] }, pprt: null, pprm: { count: 0, names: [] } });
    expect(r.required).toBe(ERP_INDETERMINE);
  });
  it('PPRM indisponible (null) → indéterminé même si les 4 autres signaux sont clairs', () => {
    const r = decideErp({ seismic: { zone: 1 }, radon: { category: 1 }, pprn: { count: 0, names: [] }, pprt: { count: 0, names: [] }, pprm: null });
    expect(r.required).toBe(ERP_INDETERMINE);
  });
  it('tout indisponible → indéterminé', () => {
    expect(decideErp({}).required).toBe(ERP_INDETERMINE);
    expect(decideErp({ seismic: null, radon: null, pprn: null }).required).toBe(ERP_INDETERMINE);
  });
  it('un seul trigger fiable suffit MÊME si un autre signal manque (sécurité : on affirme « requis »)', () => {
    // sismicité zone 4 connue, radon manquant, ppr manquant → requis (trigger positif l\'emporte)
    const r = decideErp({ seismic: { zone: 4, label: '4 - MOYENNE' }, radon: null, pprn: null });
    expect(r.required).toBe(true);
  });
  it('ERP_INDETERMINE est une valeur ASCII stable', () => {
    expect(ERP_INDETERMINE).toBe('indetermine');
  });
});
