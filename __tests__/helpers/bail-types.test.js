/**
 * Tests BAIL-TYPES — couverture des 6 types de bail (BAIL-TYPES Phase B Étape 5 v15.195)
 *
 * Source de vérité documentée : `bail-types.js` (helpers purs extraits).
 * Ces tests valident que la logique légale type-aware câblée dans
 * `buildBailStructure` (index.html v15.193) respecte les textes officiels.
 *
 * Refs légifrance ciblées :
 * - Loi 89-462 art. 10, 22, 25-3 à 25-18
 * - Décret 2015-981 art. 2 (11 catégories mobilier obligatoires)
 * - Loi ELAN 2018 art. 107 (bail mobilité)
 * - Code civil art. 1709 (location libre garage)
 */

import { describe, it, expect } from 'vitest';
import {
  BAIL_TYPES,
  BAIL_TYPE_DEFAULT,
  MOB_CATEGORIES_DECRET_2015_981,
  MOB_CATEGORY_KEYS,
  isBailFurnished,
  getBailDureeMonths,
  getBailDgMonthsMax,
  getBailLegalRefs,
  getBailPreavisMonths,
  isTaciteReconductionAllowed,
  getMobilierCompletion,
  isMobilierLegallyComplete,
  resolveBailType
} from './bail-types.js';

describe('BAIL_TYPES — constantes', () => {
  it('couvre les 6 types ImmoTrack', () => {
    expect(BAIL_TYPES).toHaveLength(6);
    expect(BAIL_TYPES).toEqual(['nu', 'meuble', 'etudiant', 'mobilite', 'garage', 'autre']);
  });

  it('défaut = nu (rétrocompat baux v<15.191)', () => {
    expect(BAIL_TYPE_DEFAULT).toBe('nu');
  });

  it('MOB_CATEGORIES contient exactement les 11 catégories du décret 2015-981', () => {
    expect(Object.keys(MOB_CATEGORIES_DECRET_2015_981)).toHaveLength(11);
    expect(MOB_CATEGORY_KEYS).toHaveLength(11);
  });

  it('MOB_CATEGORIES_DECRET_2015_981 est figé (immutable)', () => {
    expect(Object.isFrozen(MOB_CATEGORIES_DECRET_2015_981)).toBe(true);
    expect(Object.isFrozen(MOB_CATEGORY_KEYS)).toBe(true);
  });

  it('chaque catégorie a un libellé non vide', () => {
    for (const key of MOB_CATEGORY_KEYS) {
      expect(MOB_CATEGORIES_DECRET_2015_981[key]).toMatch(/\S/);
    }
  });
});

describe('isBailFurnished — meublé/étudiant/mobilité sont des meublés', () => {
  it('renvoie true pour meublé, étudiant, mobilité', () => {
    expect(isBailFurnished('meuble')).toBe(true);
    expect(isBailFurnished('etudiant')).toBe(true);
    expect(isBailFurnished('mobilite')).toBe(true);
  });

  it('renvoie false pour nu, garage, autre', () => {
    expect(isBailFurnished('nu')).toBe(false);
    expect(isBailFurnished('garage')).toBe(false);
    expect(isBailFurnished('autre')).toBe(false);
  });

  it('gère types invalides / undefined', () => {
    expect(isBailFurnished(undefined)).toBe(false);
    expect(isBailFurnished(null)).toBe(false);
    expect(isBailFurnished('')).toBe(false);
    expect(isBailFurnished('xyz')).toBe(false);
  });
});

describe('getBailDureeMonths — durées légales par type', () => {
  it('meublé = 12 mois (art. 25-7)', () => {
    expect(getBailDureeMonths('meuble')).toBe(12);
  });

  it('étudiant = 9 mois non reconductible (art. 25-7 dernier alinéa)', () => {
    expect(getBailDureeMonths('etudiant')).toBe(9);
  });

  it('mobilité = null (1-10 mois variable, art. 25-14)', () => {
    expect(getBailDureeMonths('mobilite')).toBeNull();
  });

  it('garage / autre = null (durée libre)', () => {
    expect(getBailDureeMonths('garage')).toBeNull();
    expect(getBailDureeMonths('autre')).toBeNull();
  });

  it('nu personne physique = 36 mois (3 ans, art. 10)', () => {
    expect(getBailDureeMonths('nu', { isPersoPhysique: true })).toBe(36);
  });

  it('nu personne morale (SCI) = 72 mois (6 ans, art. 10)', () => {
    expect(getBailDureeMonths('nu', { isPersoPhysique: false })).toBe(72);
    expect(getBailDureeMonths('nu')).toBe(72);  // default = morale
  });

  it('défaut (type inconnu) tombe sur règle bail nu', () => {
    expect(getBailDureeMonths('xyz')).toBe(72);
  });
});

describe('getBailDgMonthsMax — plafond DG par type', () => {
  it('nu = 1 mois loyer HC (art. 22)', () => {
    expect(getBailDgMonthsMax('nu')).toBe(1);
  });

  it('meublé = 2 mois (art. 25-6)', () => {
    expect(getBailDgMonthsMax('meuble')).toBe(2);
  });

  it('étudiant = 2 mois (variante meublé art. 25-6)', () => {
    expect(getBailDgMonthsMax('etudiant')).toBe(2);
  });

  it('mobilité = 0 — INTERDIT (loi ELAN art. 107)', () => {
    expect(getBailDgMonthsMax('mobilite')).toBe(0);
  });

  it('garage / autre = null (libre)', () => {
    expect(getBailDgMonthsMax('garage')).toBeNull();
    expect(getBailDgMonthsMax('autre')).toBeNull();
  });

  it('défaut tombe sur bail nu (1 mois)', () => {
    expect(getBailDgMonthsMax(undefined)).toBe(1);
  });
});

describe('getBailLegalRefs — articles à citer par type', () => {
  it('nu cite art. 10 (durée) + art. 22 (DG)', () => {
    const refs = getBailLegalRefs('nu');
    expect(refs.some(r => /art\.\s*10/.test(r))).toBe(true);
    expect(refs.some(r => /art\.\s*22/.test(r))).toBe(true);
  });

  it('meublé cite art. 25-3 à 25-11 + décret 2015-981', () => {
    const refs = getBailLegalRefs('meuble');
    expect(refs.some(r => /25-3.*25-11/.test(r))).toBe(true);
    expect(refs.some(r => /2015-981/.test(r))).toBe(true);
  });

  it('étudiant cite art. 25-7 dernier alinéa + décret 2015-981', () => {
    const refs = getBailLegalRefs('etudiant');
    expect(refs.some(r => /25-7/.test(r))).toBe(true);
    expect(refs.some(r => /2015-981/.test(r))).toBe(true);
  });

  it('mobilité cite art. 25-12 à 25-18 + loi ELAN art. 107', () => {
    const refs = getBailLegalRefs('mobilite');
    expect(refs.some(r => /25-12.*25-18/.test(r))).toBe(true);
    expect(refs.some(r => /ELAN.*107/i.test(r))).toBe(true);
  });

  it('garage cite Code civil art. 1709', () => {
    const refs = getBailLegalRefs('garage');
    expect(refs.some(r => /1709/.test(r))).toBe(true);
  });

  it('autre = aucune ref (régime libre)', () => {
    expect(getBailLegalRefs('autre')).toEqual([]);
  });
});

describe('getBailPreavisMonths — préavis selon partie et type', () => {
  describe('Locataire', () => {
    it('nu = 3 mois (art. 15-I)', () => {
      expect(getBailPreavisMonths('nu', 'locataire')).toBe(3);
    });

    it('meublé/étudiant/mobilité = 1 mois', () => {
      expect(getBailPreavisMonths('meuble', 'locataire')).toBe(1);
      expect(getBailPreavisMonths('etudiant', 'locataire')).toBe(1);
      expect(getBailPreavisMonths('mobilite', 'locataire')).toBe(1);
    });

    it('garage / autre = null (libre)', () => {
      expect(getBailPreavisMonths('garage', 'locataire')).toBeNull();
      expect(getBailPreavisMonths('autre', 'locataire')).toBeNull();
    });
  });

  describe('Bailleur', () => {
    it('nu = 6 mois (art. 15-I)', () => {
      expect(getBailPreavisMonths('nu', 'bailleur')).toBe(6);
    });

    it('meublé = 3 mois (art. 25-8)', () => {
      expect(getBailPreavisMonths('meuble', 'bailleur')).toBe(3);
    });

    it('étudiant = null (pas de congé bailleur, non reconductible)', () => {
      expect(getBailPreavisMonths('etudiant', 'bailleur')).toBeNull();
    });

    it('mobilité = null (pas de congé bailleur)', () => {
      expect(getBailPreavisMonths('mobilite', 'bailleur')).toBeNull();
    });

    it('garage / autre = null', () => {
      expect(getBailPreavisMonths('garage', 'bailleur')).toBeNull();
      expect(getBailPreavisMonths('autre', 'bailleur')).toBeNull();
    });
  });

  it('partie inconnue = null', () => {
    expect(getBailPreavisMonths('nu', 'tiers')).toBeNull();
    expect(getBailPreavisMonths('nu')).toBeNull();
  });
});

describe('isTaciteReconductionAllowed — tacite reconduction par type', () => {
  it('nu = oui (art. 10)', () => {
    expect(isTaciteReconductionAllowed('nu')).toBe(true);
  });

  it('meublé = oui pour 1 an (art. 25-8)', () => {
    expect(isTaciteReconductionAllowed('meuble')).toBe(true);
  });

  it('étudiant = NON (9 mois non reconductible, art. 25-7 dernier al.)', () => {
    expect(isTaciteReconductionAllowed('etudiant')).toBe(false);
  });

  it('mobilité = NON (art. 25-15)', () => {
    expect(isTaciteReconductionAllowed('mobilite')).toBe(false);
  });

  it('garage / autre = NON (régime libre, à préciser au contrat)', () => {
    expect(isTaciteReconductionAllowed('garage')).toBe(false);
    expect(isTaciteReconductionAllowed('autre')).toBe(false);
  });
});

describe('getMobilierCompletion — décompte 11 catégories', () => {
  it('mobilier vide / null / undefined = 0/11 incomplet', () => {
    expect(getMobilierCompletion(null)).toMatchObject({ count: 0, total: 11, complete: false });
    expect(getMobilierCompletion(undefined)).toMatchObject({ count: 0, total: 11, complete: false });
    expect(getMobilierCompletion({})).toMatchObject({ count: 0, total: 11, complete: false });
  });

  it('mobilier non-objet = 0/11 (defensive)', () => {
    expect(getMobilierCompletion('oui')).toMatchObject({ count: 0, total: 11, complete: false });
    expect(getMobilierCompletion(42)).toMatchObject({ count: 0, total: 11, complete: false });
  });

  it('toutes catégories cochées = 11/11 complet', () => {
    const full = {};
    for (const k of MOB_CATEGORY_KEYS) full[k] = true;
    const result = getMobilierCompletion(full);
    expect(result.count).toBe(11);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('catégorie manquante = listée dans missing', () => {
    const partial = {};
    for (const k of MOB_CATEGORY_KEYS) partial[k] = true;
    delete partial.frigo;  // simule "pas de frigo"
    const result = getMobilierCompletion(partial);
    expect(result.count).toBe(10);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(['frigo']);
  });

  it('plusieurs catégories manquantes', () => {
    const partial = { literie: true, table: true };  // 2/11
    const result = getMobilierCompletion(partial);
    expect(result.count).toBe(2);
    expect(result.complete).toBe(false);
    expect(result.missing).toHaveLength(9);
    expect(result.missing).toContain('frigo');
    expect(result.missing).toContain('luminaires');
  });

  it('valeurs falsy (false / 0 / "") = non cochées', () => {
    const partial = { literie: true, table: false, frigo: 0, vaisselle: '' };
    const result = getMobilierCompletion(partial);
    expect(result.count).toBe(1);  // seul literie compte
  });
});

describe('isMobilierLegallyComplete — validation juridique', () => {
  it('bail nu = toujours valide (pas de mobilier requis)', () => {
    expect(isMobilierLegallyComplete({ type: 'nu' })).toBe(true);
    expect(isMobilierLegallyComplete({ type: 'nu', mobilier: null })).toBe(true);
  });

  it('bail garage / autre = toujours valide', () => {
    expect(isMobilierLegallyComplete({ type: 'garage' })).toBe(true);
    expect(isMobilierLegallyComplete({ type: 'autre' })).toBe(true);
  });

  it('bail meublé sans mobilier = NON valide', () => {
    expect(isMobilierLegallyComplete({ type: 'meuble' })).toBe(false);
    expect(isMobilierLegallyComplete({ type: 'meuble', mobilier: {} })).toBe(false);
  });

  it('bail meublé incomplet (10/11) = NON valide', () => {
    const partial = {};
    for (const k of MOB_CATEGORY_KEYS) partial[k] = true;
    delete partial.frigo;
    expect(isMobilierLegallyComplete({ type: 'meuble', mobilier: partial })).toBe(false);
  });

  it('bail meublé complet (11/11) = valide', () => {
    const full = {};
    for (const k of MOB_CATEGORY_KEYS) full[k] = true;
    expect(isMobilierLegallyComplete({ type: 'meuble', mobilier: full })).toBe(true);
  });

  it('bail étudiant complet (11/11) = valide (variante meublé)', () => {
    const full = {};
    for (const k of MOB_CATEGORY_KEYS) full[k] = true;
    expect(isMobilierLegallyComplete({ type: 'etudiant', mobilier: full })).toBe(true);
  });

  it('bail mobilité complet (11/11) = valide', () => {
    const full = {};
    for (const k of MOB_CATEGORY_KEYS) full[k] = true;
    expect(isMobilierLegallyComplete({ type: 'mobilite', mobilier: full })).toBe(true);
  });

  it('bail sans type = traité comme nu (rétrocompat)', () => {
    expect(isMobilierLegallyComplete({})).toBe(true);
    expect(isMobilierLegallyComplete(null)).toBe(true);
  });
});

describe('Cohérence inter-helpers (smoke tests sur les 6 types)', () => {
  it.each(BAIL_TYPES)('type %s : tous les helpers répondent sans throw', (type) => {
    expect(() => isBailFurnished(type)).not.toThrow();
    expect(() => getBailDureeMonths(type)).not.toThrow();
    expect(() => getBailDgMonthsMax(type)).not.toThrow();
    expect(() => getBailLegalRefs(type)).not.toThrow();
    expect(() => getBailPreavisMonths(type, 'locataire')).not.toThrow();
    expect(() => getBailPreavisMonths(type, 'bailleur')).not.toThrow();
    expect(() => isTaciteReconductionAllowed(type)).not.toThrow();
    expect(() => isMobilierLegallyComplete({ type })).not.toThrow();
  });

  it('mobilité a DG=0 ET pas de congé bailleur (cohérence loi ELAN)', () => {
    expect(getBailDgMonthsMax('mobilite')).toBe(0);
    expect(getBailPreavisMonths('mobilite', 'bailleur')).toBeNull();
    expect(isTaciteReconductionAllowed('mobilite')).toBe(false);
  });

  it('étudiant a durée 9 mois ET pas de tacite ET pas de congé bailleur', () => {
    expect(getBailDureeMonths('etudiant')).toBe(9);
    expect(isTaciteReconductionAllowed('etudiant')).toBe(false);
    expect(getBailPreavisMonths('etudiant', 'bailleur')).toBeNull();
  });
});

// v15.349 FIX-DETECTION-TYPE-BAIL — type effectif depuis bail.type (autorité),
// fallback log.typeUsage. NE doit JAMAIS lire bail.typeContrat (initial/renouvellement/repris).
describe('resolveBailType — type effectif (bail.type prioritaire, fallback log.typeUsage)', () => {
  it('bail.type explicite fait autorité', () => {
    expect(resolveBailType({ type: 'meuble' }, null)).toBe('meuble');
    expect(resolveBailType({ type: 'mobilite' }, { typeUsage: 'habitation-meuble' })).toBe('mobilite');
    expect(resolveBailType({ type: 'garage' }, null)).toBe('garage');
    expect(resolveBailType({ type: 'etudiant' }, null)).toBe('etudiant');
  });

  it('bail.type prioritaire même si log.typeUsage diffère', () => {
    expect(resolveBailType({ type: 'nu' }, { typeUsage: 'etudiant' })).toBe('nu');
  });

  it('bail.type absent → déduit de log.typeUsage (rétrocompat pré-v15.191)', () => {
    expect(resolveBailType({}, { typeUsage: 'habitation-meuble' })).toBe('meuble');
    expect(resolveBailType({}, { typeUsage: 'etudiant' })).toBe('etudiant');
    expect(resolveBailType({}, { typeUsage: 'mobilite' })).toBe('mobilite');
  });

  it('bail.type absent + typeUsage non meublé/inconnu/absent → nu', () => {
    expect(resolveBailType({}, { typeUsage: 'habitation' })).toBe('nu');
    expect(resolveBailType({}, {})).toBe('nu');
    expect(resolveBailType({}, null)).toBe('nu');
  });

  it('bail null/undefined → nu', () => {
    expect(resolveBailType(null, null)).toBe('nu');
    expect(resolveBailType(undefined, undefined)).toBe('nu');
  });

  it('bail.type invalide (hors liste) → fallback typeUsage puis nu', () => {
    expect(resolveBailType({ type: 'colocation' }, { typeUsage: 'etudiant' })).toBe('etudiant');
    expect(resolveBailType({ type: 'colocation' }, null)).toBe('nu');
  });

  it('NE lit PAS typeContrat — régression du bug détecté', () => {
    // typeContrat = nature du contrat (initial/renouvellement/repris), JAMAIS le type de bail.
    expect(resolveBailType({ typeContrat: 'meuble' }, null)).toBe('nu');
    expect(resolveBailType({ typeContrat: 'mobilite' }, null)).toBe('nu');
    expect(resolveBailType({ type: 'meuble', typeContrat: 'renouvellement' }, null)).toBe('meuble');
  });
});
