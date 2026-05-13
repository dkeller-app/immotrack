/**
 * Tests miroir pour les helpers USER-PROFILE-FILTERS (v15.04 Sprint 6 V1.1).
 *
 * Les helpers `_calculateProfile` et `_isModuleEnabled` sont inline dans
 * index-test.html ; on réplique fidèlement leur logique ici en fonctions
 * pures testables (pas de dépendance window/DB).
 */
import { describe, it, expect } from 'vitest';

// ─── Réplique fidèle des helpers ────────────────────────────────────
const USER_PROFILE_LABELS = {
  solo:           'Solo (particulier)',
  sci_familiale:  'SCI familiale',
  pro:            'Pro (bailleur professionnel)',
  mandataire:     'Mandataire (gestion pour tiers)'
};

function calculateProfile(answers) {
  if (!answers || typeof answers !== 'object') return 'solo';
  const nb = answers.nbLogements || '1-3';
  const st = answers.statut || 'particulier';
  const m  = !!answers.estMandataire;
  const cp = answers.compta || 'autonome';
  if (st === 'mandataire' || m) return 'mandataire';
  if (st === 'sas' || cp === 'expert' || nb === '30+') return 'pro';
  if (st === 'sci' || nb === '10-30') return 'sci_familiale';
  return 'solo';
}

function isModuleEnabled(moduleKey, profile, overrides) {
  if (!moduleKey) return true;
  const ov = overrides || {};
  if (moduleKey in ov) return !!ov[moduleKey];
  const p = profile || 'solo';
  const CORE = ['dashboard-simple','biens','locataires','baux','mouvements',
                'quittances','irl','edl','mrh','params','agenda','documents'];
  if (CORE.includes(moduleKey)) return true;
  if (p === 'solo') {
    const SOLO_OFF = ['dashboard-lentilles','bailleurs-multi','candidats',
                      'travaux','pilotage-matriciel','export-fec','mandat-crg-sepa',
                      'audit-trail-ui','carnet-adresse','bank-integration'];
    if (SOLO_OFF.includes(moduleKey)) return false;
  }
  if (p === 'sci_familiale') {
    const SCI_OFF = ['pilotage-matriciel','export-fec','mandat-crg-sepa',
                     'audit-trail-ui','carnet-adresse'];
    if (SCI_OFF.includes(moduleKey)) return false;
  }
  if (p === 'pro') {
    const PRO_OFF = ['mandat-crg-sepa'];
    if (PRO_OFF.includes(moduleKey)) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
//  _calculateProfile
// ═══════════════════════════════════════════════════════════════════

describe('_calculateProfile — solo', () => {
  it('1-3 logements + particulier + non mandataire + autonome → solo', () => {
    expect(calculateProfile({
      nbLogements: '1-3', statut: 'particulier', estMandataire: false, compta: 'autonome'
    })).toBe('solo');
  });
  it('3-10 logements particulier autonome → solo', () => {
    expect(calculateProfile({
      nbLogements: '3-10', statut: 'particulier', estMandataire: false, compta: 'autonome'
    })).toBe('solo');
  });
  it('answers null → fallback solo', () => {
    expect(calculateProfile(null)).toBe('solo');
  });
  it('answers vide → fallback solo (tous defaults)', () => {
    expect(calculateProfile({})).toBe('solo');
  });
});

describe('_calculateProfile — sci_familiale', () => {
  it('SCI + 1-3 logements → sci_familiale', () => {
    expect(calculateProfile({ nbLogements: '1-3', statut: 'sci' })).toBe('sci_familiale');
  });
  it('SCI + 3-10 logements → sci_familiale', () => {
    expect(calculateProfile({ nbLogements: '3-10', statut: 'sci' })).toBe('sci_familiale');
  });
  it('particulier + 10-30 logements (sans expert) → sci_familiale (seuil volume)', () => {
    expect(calculateProfile({
      nbLogements: '10-30', statut: 'particulier', compta: 'excel'
    })).toBe('sci_familiale');
  });
});

describe('_calculateProfile — pro', () => {
  it('SAS quel que soit le reste → pro', () => {
    expect(calculateProfile({
      nbLogements: '1-3', statut: 'sas', compta: 'autonome'
    })).toBe('pro');
  });
  it('compta expert → pro (même si solo logements)', () => {
    expect(calculateProfile({
      nbLogements: '1-3', statut: 'particulier', compta: 'expert'
    })).toBe('pro');
  });
  it('30+ logements → pro même en SCI', () => {
    expect(calculateProfile({
      nbLogements: '30+', statut: 'sci', compta: 'autonome'
    })).toBe('pro');
  });
});

describe('_calculateProfile — mandataire', () => {
  it('statut=mandataire → mandataire', () => {
    expect(calculateProfile({ statut: 'mandataire' })).toBe('mandataire');
  });
  it('flag estMandataire=true → mandataire (même si statut particulier)', () => {
    expect(calculateProfile({
      statut: 'particulier', estMandataire: true
    })).toBe('mandataire');
  });
  it('mandataire bat SAS et 30+ logements (priorité haute)', () => {
    expect(calculateProfile({
      nbLogements: '30+', statut: 'sas', estMandataire: true
    })).toBe('mandataire');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  _isModuleEnabled
// ═══════════════════════════════════════════════════════════════════

describe('_isModuleEnabled — modules CORE toujours actifs', () => {
  ['dashboard-simple','biens','locataires','baux','mouvements','quittances',
   'irl','edl','mrh','params','agenda','documents'].forEach(mod => {
    it(`${mod} actif pour solo`, () => {
      expect(isModuleEnabled(mod, 'solo')).toBe(true);
    });
    it(`${mod} actif pour pro`, () => {
      expect(isModuleEnabled(mod, 'pro')).toBe(true);
    });
  });
});

describe('_isModuleEnabled — matrice profil solo', () => {
  ['dashboard-lentilles','bailleurs-multi','candidats','travaux',
   'pilotage-matriciel','export-fec','mandat-crg-sepa','audit-trail-ui',
   'carnet-adresse','bank-integration'].forEach(mod => {
    it(`${mod} masqué pour solo`, () => {
      expect(isModuleEnabled(mod, 'solo')).toBe(false);
    });
  });
});

describe('_isModuleEnabled — matrice profil sci_familiale', () => {
  it('dashboard-lentilles actif pour SCI', () => {
    expect(isModuleEnabled('dashboard-lentilles', 'sci_familiale')).toBe(true);
  });
  it('bailleurs-multi actif pour SCI', () => {
    expect(isModuleEnabled('bailleurs-multi', 'sci_familiale')).toBe(true);
  });
  it('pilotage-matriciel masqué pour SCI (réservé pro)', () => {
    expect(isModuleEnabled('pilotage-matriciel', 'sci_familiale')).toBe(false);
  });
  it('export-fec masqué pour SCI', () => {
    expect(isModuleEnabled('export-fec', 'sci_familiale')).toBe(false);
  });
  it('mandat-crg-sepa masqué pour SCI', () => {
    expect(isModuleEnabled('mandat-crg-sepa', 'sci_familiale')).toBe(false);
  });
});

describe('_isModuleEnabled — matrice profil pro', () => {
  it('pilotage-matriciel actif pour pro', () => {
    expect(isModuleEnabled('pilotage-matriciel', 'pro')).toBe(true);
  });
  it('export-fec actif pour pro', () => {
    expect(isModuleEnabled('export-fec', 'pro')).toBe(true);
  });
  it('bank-integration actif pour pro', () => {
    expect(isModuleEnabled('bank-integration', 'pro')).toBe(true);
  });
  it('mandat-crg-sepa masqué pour pro (réservé mandataire)', () => {
    expect(isModuleEnabled('mandat-crg-sepa', 'pro')).toBe(false);
  });
});

describe('_isModuleEnabled — matrice profil mandataire', () => {
  it('mandat-crg-sepa actif pour mandataire', () => {
    expect(isModuleEnabled('mandat-crg-sepa', 'mandataire')).toBe(true);
  });
  it('audit-trail-ui actif pour mandataire', () => {
    expect(isModuleEnabled('audit-trail-ui', 'mandataire')).toBe(true);
  });
  it('carnet-adresse actif pour mandataire', () => {
    expect(isModuleEnabled('carnet-adresse', 'mandataire')).toBe(true);
  });
  it('tous les modules actifs (sauf inconnu)', () => {
    ['dashboard-lentilles','bailleurs-multi','candidats','travaux',
     'pilotage-matriciel','export-fec','mandat-crg-sepa','audit-trail-ui',
     'carnet-adresse','bank-integration'].forEach(mod => {
      expect(isModuleEnabled(mod, 'mandataire')).toBe(true);
    });
  });
});

describe('_isModuleEnabled — overrides individuels', () => {
  it('override true active un module masqué par défaut', () => {
    expect(isModuleEnabled('candidats', 'solo', { candidats: true })).toBe(true);
  });
  it('override false masque un module actif par défaut', () => {
    expect(isModuleEnabled('agenda', 'solo', { agenda: false })).toBe(false);
  });
  it('override gagne contre matrice profil (cas pro)', () => {
    expect(isModuleEnabled('mandat-crg-sepa', 'pro', { 'mandat-crg-sepa': true })).toBe(true);
  });
  it('override absent → fallback matrice', () => {
    expect(isModuleEnabled('travaux', 'sci_familiale', { autre: true })).toBe(true);
  });
});

describe('_isModuleEnabled — edge cases', () => {
  it('moduleKey vide → true (no-op)', () => {
    expect(isModuleEnabled('', 'solo')).toBe(true);
  });
  it('profil null → fallback solo', () => {
    expect(isModuleEnabled('bailleurs-multi', null)).toBe(false); // solo masque
  });
  it('module inconnu → default true (ne casse pas l\'UI)', () => {
    expect(isModuleEnabled('module-inexistant', 'solo')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Cohérence des labels (sanity check)
// ═══════════════════════════════════════════════════════════════════

describe('USER_PROFILE_LABELS — cohérence', () => {
  it('chaque profil a un label humain', () => {
    ['solo','sci_familiale','pro','mandataire'].forEach(p => {
      expect(USER_PROFILE_LABELS[p]).toBeDefined();
      expect(typeof USER_PROFILE_LABELS[p]).toBe('string');
      expect(USER_PROFILE_LABELS[p].length).toBeGreaterThan(0);
    });
  });
});
