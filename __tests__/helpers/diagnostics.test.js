/**
 * Tests pour BAILLEUR-DIAGNOSTICS-DDT v15.05 Sprint 7 V1.1.
 * Helpers purs de gestion du Dossier Diagnostic Technique bailleur.
 */
import { describe, it, expect } from 'vitest';
import {
  DIAGS_CATALOG, DIAGS_KEYS, _diagCatalogEntry, _diagGet,
  _estDiagApplicable, _diagDateExpiration, _estDiagExpire,
  _diagStatut, _ddtComplet
} from '../../js/core/diagnostics.js';

describe('DIAGS_CATALOG — structure', () => {
  it('contient les 9 diagnostics légaux', () => {
    expect(DIAGS_CATALOG.length).toBe(9);
    expect(DIAGS_KEYS).toEqual([
      'dpe','crep','amiante','gaz','elec','erp','termites','merule','bruit'
    ]);
  });
  it('chaque entrée a label + legal + icon + isApplicable', () => {
    DIAGS_CATALOG.forEach(d => {
      expect(d.label).toBeTruthy();
      expect(d.legal).toBeTruthy();
      expect(typeof d.isApplicable).toBe('function');
    });
  });
});

describe('_diagCatalogEntry', () => {
  it('retourne l\'entrée pour une clé valide', () => {
    expect(_diagCatalogEntry('dpe').key).toBe('dpe');
    expect(_diagCatalogEntry('gaz').validityYears).toBe(6);
  });
  it('null pour clé inconnue', () => {
    expect(_diagCatalogEntry('inconnu')).toBeNull();
  });
});

describe('_diagGet — rétrocompat champs flat', () => {
  it('DPE : fallback sur log.dpe + log.dpeDate', () => {
    const log = { dpe: 'D', dpeDate: '2024-01-15' };
    const info = _diagGet(log, 'dpe');
    expect(info.classe).toBe('D');
    expect(info.date).toBe('2024-01-15');
  });
  it('Lit log.diagnostics.dpe en priorité', () => {
    const log = {
      dpe: 'G',
      dpeDate: '2010-01-01',
      diagnostics: { dpe: { classe: 'C', date: '2024-06-01' } }
    };
    const info = _diagGet(log, 'dpe');
    expect(info.classe).toBe('C');
    expect(info.date).toBe('2024-06-01');
  });
  it('Pas de fallback pour CREP (pas de champ flat)', () => {
    expect(_diagGet({}, 'crep')).toBeNull();
  });
  it('Null si logement absent', () => {
    expect(_diagGet(null, 'dpe')).toBeNull();
    expect(_diagGet({}, '')).toBeNull();
  });
});

describe('_estDiagApplicable — auto-détection par contexte logement', () => {
  it('DPE toujours applicable', () => {
    expect(_estDiagApplicable('dpe', {})).toBe(true);
    expect(_estDiagApplicable('dpe', { anneeConstruction: 2020 })).toBe(true);
  });
  it('CREP : applicable si construit avant 1949', () => {
    expect(_estDiagApplicable('crep', { anneeConstruction: 1930 })).toBe(true);
    expect(_estDiagApplicable('crep', { anneeConstruction: 1950 })).toBe(false);
    expect(_estDiagApplicable('crep', {})).toBeNull(); // info manquante
  });
  it('Amiante : applicable si permis avant 1997', () => {
    expect(_estDiagApplicable('amiante', { anneeConstruction: 1990 })).toBe(true);
    expect(_estDiagApplicable('amiante', { anneeConstruction: 2000 })).toBe(false);
  });
  it('Gaz : applicable si installation > 15 ans', () => {
    const yearOld = new Date().getFullYear() - 20;
    const yearNew = new Date().getFullYear() - 5;
    expect(_estDiagApplicable('gaz', { installationGazAnnee: yearOld })).toBe(true);
    expect(_estDiagApplicable('gaz', { installationGazAnnee: yearNew })).toBe(false);
  });
  it('Élec : idem gaz', () => {
    const yearOld = new Date().getFullYear() - 20;
    expect(_estDiagApplicable('elec', { installationElecAnnee: yearOld })).toBe(true);
  });
  it('ERP : applicable par défaut (sans data API)', () => {
    expect(_estDiagApplicable('erp', {})).toBe(true);
  });
  it('ERP : false si user a explicitement marqué hors zone risques', () => {
    expect(_estDiagApplicable('erp', { zoneRisques: false })).toBe(false);
  });
  it('Termites/Mérule/Bruit : false sauf zone explicitement déclarée', () => {
    expect(_estDiagApplicable('termites', {})).toBe(false);
    expect(_estDiagApplicable('termites', { zoneTermites: true })).toBe(true);
    expect(_estDiagApplicable('merule', {})).toBe(false);
    expect(_estDiagApplicable('bruit', {})).toBe(false);
    expect(_estDiagApplicable('bruit', { zonePEB: true })).toBe(true);
  });
  it('Override N/A par l\'utilisateur', () => {
    const log = { diagnostics: { dpe: { na: true } } };
    expect(_estDiagApplicable('dpe', log)).toBe(false);
  });
});

describe('_diagDateExpiration', () => {
  it('DPE 10 ans', () => {
    const exp = _diagDateExpiration('dpe', { date: '2024-06-15' });
    expect(exp).toBe('2034-06-15');
  });
  it('Gaz 6 ans', () => {
    const exp = _diagDateExpiration('gaz', { date: '2024-01-01' });
    expect(exp).toBe('2030-01-01');
  });
  it('ERP 6 mois', () => {
    const exp = _diagDateExpiration('erp', { date: '2024-01-15' });
    expect(exp).toBe('2024-07-15');
  });
  it('CREP avec présence plomb : 1 an', () => {
    const exp = _diagDateExpiration('crep', { date: '2024-03-01', presence: true });
    expect(exp).toBe('2025-03-01');
  });
  it('CREP sans plomb : illimité (null)', () => {
    expect(_diagDateExpiration('crep', { date: '2024-03-01', presence: false })).toBeNull();
  });
  it('Mérule / Bruit : illimités (null)', () => {
    expect(_diagDateExpiration('merule', { date: '2024-01-01' })).toBeNull();
    expect(_diagDateExpiration('bruit', { date: '2024-01-01' })).toBeNull();
  });
  it('Null si date manquante', () => {
    expect(_diagDateExpiration('dpe', {})).toBeNull();
    expect(_diagDateExpiration('dpe', { date: 'invalide' })).toBeNull();
  });
});

describe('_estDiagExpire', () => {
  it('DPE expire après 10 ans', () => {
    expect(_estDiagExpire('dpe', { date: '2010-01-01' }, new Date('2025-01-01'))).toBe(true);
    expect(_estDiagExpire('dpe', { date: '2020-01-01' }, new Date('2025-01-01'))).toBe(false);
  });
  it('Gaz expire après 6 ans', () => {
    expect(_estDiagExpire('gaz', { date: '2018-01-01' }, new Date('2025-01-01'))).toBe(true);
    expect(_estDiagExpire('gaz', { date: '2022-01-01' }, new Date('2025-01-01'))).toBe(false);
  });
  it('Mérule jamais expire (validité illimitée)', () => {
    expect(_estDiagExpire('merule', { date: '1990-01-01' }, new Date('2025-01-01'))).toBe(false);
  });
});

describe('_diagStatut', () => {
  const today = new Date('2025-06-01');
  it('valide pour DPE récent', () => {
    expect(_diagStatut('dpe', { dpe: 'C', dpeDate: '2023-06-01' }, today)).toBe('valide');
  });
  it('expire pour DPE 12 ans', () => {
    expect(_diagStatut('dpe', { dpe: 'C', dpeDate: '2013-01-01' }, today)).toBe('expire');
  });
  it('expirebientot pour DPE qui expire dans 11 mois', () => {
    // DPE de mai 2015 + 10 ans = mai 2025 ; today = juin 2025 → expiré.
    // Test : DPE de mai 2016 → mai 2026 ; today juin 2025 → reste 11 mois → expirebientot
    expect(_diagStatut('dpe', { dpe: 'C', dpeDate: '2016-05-01' }, today)).toBe('expirebientot');
  });
  it('manquant si pas de DPE renseigné', () => {
    expect(_diagStatut('dpe', {}, today)).toBe('manquant');
  });
  it('inapplicable pour CREP si construit après 1949', () => {
    expect(_diagStatut('crep', { anneeConstruction: 1970 }, today)).toBe('inapplicable');
  });
  it('na si user a marqué N/A', () => {
    const log = { diagnostics: { gaz: { na: true } } };
    // gaz par défaut renvoie null (installation manquante) → na override
    expect(_diagStatut('gaz', log, today)).toBe('inapplicable');
  });
});

describe('_ddtComplet', () => {
  it('complet si tous applicables sont valides', () => {
    const log = {
      dpe: 'C',
      dpeDate: '2024-01-01',
      anneeConstruction: 2000,    // pas CREP ni amiante
      // pas d'installation gaz/élec → null = traité comme inapplicable
      zoneRisques: false,         // ERP inapplicable
      diagnostics: {
        gaz: { na: true },        // marqué N/A
        elec: { na: true }
      }
    };
    const r = _ddtComplet(log, new Date('2025-06-01'));
    expect(r.complet).toBe(true);
    expect(r.manquants).toEqual([]);
    expect(r.expires).toEqual([]);
  });

  it('incomplet si DPE manquant', () => {
    const log = { anneeConstruction: 2000, zoneRisques: false };
    const r = _ddtComplet(log, new Date('2025-06-01'));
    expect(r.complet).toBe(false);
    expect(r.manquants).toContain('dpe');
  });

  it('incomplet si DPE expiré', () => {
    const log = {
      dpe: 'D',
      dpeDate: '2010-01-01',  // expiré en 2025
      anneeConstruction: 2000,
      zoneRisques: false
    };
    const r = _ddtComplet(log, new Date('2025-06-01'));
    expect(r.complet).toBe(false);
    expect(r.expires).toContain('dpe');
  });

  it('expirebientot n\'invalide PAS le DDT (juste un warning)', () => {
    const log = {
      dpe: 'C',
      dpeDate: '2016-05-01',     // expire en mai 2026, today juin 2025 → expirebientot
      anneeConstruction: 2000,    // CREP/amiante inapplicables
      zoneRisques: false,         // ERP inapplicable
      diagnostics: {
        gaz:  { na: true },       // marqué N/A (pas d'install gaz)
        elec: { na: true }        // idem
      }
    };
    const r = _ddtComplet(log, new Date('2025-06-01'));
    expect(r.complet).toBe(true);
    expect(r.manquants).toEqual([]);
    expect(r.expires).toEqual([]);
  });
});
