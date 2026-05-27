/**
 * Tests du module annonce-generator — LOG-ANNONCE Étape 1 (v15.207)
 *
 * Vérifie :
 *  - Banques figées (immutables) + cohérence (4 tons + 3 formats valides)
 *  - PRNG seedé (déterminisme par seed donné)
 *  - Helpers de formatage (etageLabel, MAP_EXPO, adjLifestyle)
 *  - Générateurs de sections (titre, accroche, description, atouts, quartier, dossier)
 *  - Orchestrateur `genererAnnonce` : 3 formats × 4 tons × cas avec/sans options
 *  - Règle anti-mensonge : aucun adjectif émis si donnée absente
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Constantes
  TONS_VALIDES, FORMATS_VALIDES,
  MAP_EXPO, MAP_VUE, MAP_LUM, MAP_CALM, MAP_CAR,
  BANQUE_TITRES, BANQUE_ACCROCHES,
  // PRNG
  setSeed, rand, pick, seedFromString,
  // Helpers
  etageLabel, adjLifestyle, formaterDateFr, garantiesLabel,
  // Générateurs
  genererTitre, genererAccroche, genererDescription, genererAtouts,
  genererQuartier, genererDossier, genererAnnonce,
} from './annonce-generator.js';

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════
function makeLog(overrides = {}) {
  return {
    ref: 'TEST-001', type: 'T3', surf: 65, npp: 3, etage: '4',
    typeUsage: 'habitation-nu',
    dpe: { classe: 'C', valConv: 95, ges: 'C' },
    equipements: {
      cuisine: { equipee: true, four: true, plaques: true, hotte: true, lave_vaisselle: true, micro_ondes: true, customs: ['Cuisine américaine ouverte sur séjour'] },
      sanitaires: { bain: true, douche: true, wc_separe: true, lave_linge: true },
      technologies: { fibre: true, tnt: true }
    },
    annexes: {
      cave: { present: true, num: '7' },
      parking: { present: true, num: '14', type: 'box' },
      customs: []
    },
    exterieurs: {
      balcon: { present: true, surface: 8 },
      terrasse: { present: false },
      jardin_privatif: { present: false }
    },
    presentation: {
      exposition: 'sud', vue: 'degagee', luminosite: 'tres-lumineux',
      calme: 'rue-calme', caractere_ancien: 'moulures-parquet'
    },
    quartier: {
      transports: { tramway: 4, gare: 8 },
      commerces: { boulangerie: 'dans la rue', supermarche: 3, pharmacie: 5 },
      services: { ecoles_primaires: true, college: true, parc: true, restaurants: true },
      reperes: ['Cathédrale (3 min)', 'Place Kléber (5 min)'],
      caractere: ['centre-historique', 'quartier-residentiel']
    },
    locationInfo: { disponibilite: '2026-06-15', garanties_acceptees: ['caution_solidaire', 'visale'] },
    ...overrides
  };
}

function makeImm(overrides = {}) {
  return {
    nom: 'Mésange', adr: '12 rue de la Mésange', codePostal: '67000', ville: 'Strasbourg',
    periodeConstr: 'Avant 1949', regimeJuridique: 'Copropriété',
    equipementsCommuns: { ascenseur: true, interphone: true, digicode: true, local_velos: true },
    ...overrides
  };
}

function makeBail(overrides = {}) {
  return { hc: 950, ch: 80, dg: 950, ...overrides };
}

// ═══════════════════════════════════════════════════════════════
// Constantes & banques
// ═══════════════════════════════════════════════════════════════
describe('Constantes et banques', () => {
  it('TONS_VALIDES contient 4 tons', () => {
    expect(TONS_VALIDES).toHaveLength(4);
    expect(TONS_VALIDES).toEqual(['factuel', 'storytelling', 'convivial', 'haut-gamme']);
  });

  it('FORMATS_VALIDES contient 3 formats', () => {
    expect(FORMATS_VALIDES).toHaveLength(3);
    expect(FORMATS_VALIDES).toEqual(['leboncoin', 'detaille', 'sms']);
  });

  it('MAPS de traduction sont figées (Object.freeze)', () => {
    expect(Object.isFrozen(MAP_EXPO)).toBe(true);
    expect(Object.isFrozen(MAP_VUE)).toBe(true);
    expect(Object.isFrozen(MAP_LUM)).toBe(true);
    expect(Object.isFrozen(MAP_CALM)).toBe(true);
    expect(Object.isFrozen(MAP_CAR)).toBe(true);
  });

  it('BANQUE_TITRES a une entrée par ton avec au moins 5 variantes', () => {
    expect(Object.isFrozen(BANQUE_TITRES)).toBe(true);
    for (const ton of TONS_VALIDES) {
      expect(BANQUE_TITRES[ton]).toBeDefined();
      expect(BANQUE_TITRES[ton].length).toBeGreaterThanOrEqual(5);
      // Chaque variante a `si` (function) et `tpl` (function)
      BANQUE_TITRES[ton].forEach((v, idx) => {
        expect(typeof v.si).toBe('function');
        expect(typeof v.tpl).toBe('function');
      });
    }
  });

  it('BANQUE_ACCROCHES a une entrée par ton avec au moins 3 variantes', () => {
    for (const ton of TONS_VALIDES) {
      expect(BANQUE_ACCROCHES[ton]).toBeDefined();
      expect(BANQUE_ACCROCHES[ton].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('BANQUE_TITRES storytelling a au moins 10 variantes (différenciant prouvé)', () => {
    expect(BANQUE_TITRES.storytelling.length).toBeGreaterThanOrEqual(10);
  });
});

// ═══════════════════════════════════════════════════════════════
// PRNG
// ═══════════════════════════════════════════════════════════════
describe('PRNG (Mulberry32)', () => {
  beforeEach(() => setSeed(42));

  it('rand() retourne un nombre entre 0 et 1', () => {
    for (let i = 0; i < 100; i++) {
      const r = rand();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('même seed = même séquence (déterminisme)', () => {
    setSeed(42);
    const seq1 = [rand(), rand(), rand()];
    setSeed(42);
    const seq2 = [rand(), rand(), rand()];
    expect(seq1).toEqual(seq2);
  });

  it('seeds différents = séquences différentes', () => {
    setSeed(42);
    const seq1 = [rand(), rand(), rand()];
    setSeed(123);
    const seq2 = [rand(), rand(), rand()];
    expect(seq1).not.toEqual(seq2);
  });

  it('pick(arr) retourne un élément du tableau', () => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pick(arr));
    }
  });

  it('pick([]) retourne chaîne vide (defensive)', () => {
    expect(pick([])).toBe('');
    expect(pick(null)).toBe('');
    expect(pick(undefined)).toBe('');
  });

  it('seedFromString : déterministe par string + counter', () => {
    expect(seedFromString('TEST-001', 0)).toBe(seedFromString('TEST-001', 0));
    expect(seedFromString('TEST-001', 1)).not.toBe(seedFromString('TEST-001', 0));
    expect(seedFromString('TEST-002', 0)).not.toBe(seedFromString('TEST-001', 0));
  });

  it('seedFromString gère string vide / null', () => {
    expect(seedFromString('', 0)).toBeGreaterThan(0);
    expect(seedFromString(null, 5)).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Helpers de formatage
// ═══════════════════════════════════════════════════════════════
describe('etageLabel', () => {
  it('RDC → "rez-de-chaussée"', () => {
    expect(etageLabel('0')).toBe('rez-de-chaussée');
    expect(etageLabel(0)).toBe('rez-de-chaussée');
    expect(etageLabel('RDC')).toBe('rez-de-chaussée');
    expect(etageLabel('rdc')).toBe('rez-de-chaussée');
  });

  it('1er → "1er étage"', () => {
    expect(etageLabel('1')).toBe('1er étage');
    expect(etageLabel(1)).toBe('1er étage');
  });

  it('2+ → "Nème étage"', () => {
    expect(etageLabel('4')).toBe('4ème étage');
    expect(etageLabel(7)).toBe('7ème étage');
  });

  it('valeurs falsy → chaîne vide', () => {
    expect(etageLabel(null)).toBe('');
    expect(etageLabel(undefined)).toBe('');
    expect(etageLabel('')).toBe('');
  });
});

describe('adjLifestyle (adjectif selon surface)', () => {
  beforeEach(() => setSeed(1));

  it('surface > 100 → adj "généreux/spacieux/vastes"', () => {
    const adj = adjLifestyle({ surf: 120 });
    expect(['généreusement dimensionné', 'spacieux', 'aux volumes confortables']).toContain(adj);
  });

  it('surface 70-100 → adj intermediaires', () => {
    const adj = adjLifestyle({ surf: 80 });
    expect(['agréablement spacieux', 'aux belles proportions', 'parfaitement agencé']).toContain(adj);
  });

  it('surface 45-70 → adj fonctionnels', () => {
    const adj = adjLifestyle({ surf: 50 });
    expect(['fonctionnel', 'à l\'agencement réfléchi', 'bien pensé']).toContain(adj);
  });

  it('surface < 45 → adj cosy/compact', () => {
    const adj = adjLifestyle({ surf: 25 });
    expect(['cosy', 'au format idéal pour un pied-à-terre', 'intelligemment optimisé']).toContain(adj);
  });
});

describe('formaterDateFr', () => {
  it('formate ISO → fr long', () => {
    expect(formaterDateFr('2026-06-15')).toMatch(/15 juin 2026/);
  });

  it('null/undefined/"" → chaîne vide', () => {
    expect(formaterDateFr(null)).toBe('');
    expect(formaterDateFr(undefined)).toBe('');
    expect(formaterDateFr('')).toBe('');
  });
});

describe('garantiesLabel', () => {
  it('1 garantie → label seul', () => {
    expect(garantiesLabel(['caution_solidaire'])).toBe('Caution solidaire');
  });

  it('plusieurs → joint avec " ou "', () => {
    expect(garantiesLabel(['caution_solidaire', 'visale'])).toBe('Caution solidaire ou Visale (gratuit, Action Logement)');
  });

  it('vide / non-array → chaîne vide', () => {
    expect(garantiesLabel([])).toBe('');
    expect(garantiesLabel(null)).toBe('');
    expect(garantiesLabel(undefined)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════
// Générateurs de sections
// ═══════════════════════════════════════════════════════════════
describe('genererTitre', () => {
  beforeEach(() => setSeed(seedFromString('TEST-001', 0)));

  it('produit un titre non vide pour bien complet', () => {
    const t = genererTitre(makeLog(), makeImm(), 'storytelling');
    expect(t).toBeTruthy();
    expect(t.length).toBeGreaterThan(20);
  });

  it.each(TONS_VALIDES)('produit un titre pour le ton "%s"', (ton) => {
    const t = genererTitre(makeLog(), makeImm(), ton);
    expect(t).toBeTruthy();
    expect(t).toContain('Strasbourg'); // imm.ville
  });

  it('ton invalide → fallback storytelling', () => {
    const t = genererTitre(makeLog(), makeImm(), 'xyz-invalide');
    expect(t).toBeTruthy();
  });

  it('titre storytelling est < 100 caractères (recommandation LeBonCoin)', () => {
    setSeed(1);
    for (let i = 0; i < 20; i++) {
      const t = genererTitre(makeLog(), makeImm(), 'storytelling');
      expect(t.length).toBeLessThan(100);
    }
  });

  it('même seed = même titre (déterminisme)', () => {
    setSeed(42);
    const t1 = genererTitre(makeLog(), makeImm(), 'storytelling');
    setSeed(42);
    const t2 = genererTitre(makeLog(), makeImm(), 'storytelling');
    expect(t1).toBe(t2);
  });

  it('seeds différents → titres potentiellement différents', () => {
    const titres = new Set();
    for (let i = 0; i < 30; i++) {
      setSeed(i * 7919);
      titres.add(genererTitre(makeLog(), makeImm(), 'storytelling'));
    }
    expect(titres.size).toBeGreaterThan(3); // au moins 4 variations différentes sur 30 essais
  });

  it('bien minimal (que type+surf+ville) → fallback safe', () => {
    const log = { type: 'T2', surf: 40, npp: 2, etage: '1' };
    const imm = { ville: 'Lyon', codePostal: '69000' };
    const t = genererTitre(log, imm, 'storytelling');
    expect(t).toBeTruthy();
    expect(t).toContain('Lyon');
  });
});

describe('genererAccroche', () => {
  beforeEach(() => setSeed(seedFromString('TEST-001', 0)));

  it('produit accroche non vide', () => {
    const a = genererAccroche(makeLog(), makeImm(), 'storytelling');
    expect(a).toBeTruthy();
    expect(a.length).toBeGreaterThan(50);
  });

  it.each(TONS_VALIDES)('produit accroche pour le ton "%s"', (ton) => {
    const a = genererAccroche(makeLog(), makeImm(), ton);
    expect(a).toBeTruthy();
  });

  it('cas vue mer → mentionne "mer" en storytelling', () => {
    const log = makeLog({ presentation: { ...makeLog().presentation, vue: 'mer-montagne' } });
    setSeed(1);
    // Tester plusieurs seeds pour tomber sur la variante mer
    let found = false;
    for (let i = 0; i < 20; i++) {
      setSeed(i);
      const a = genererAccroche(log, makeImm({ ville: 'Biarritz' }), 'storytelling');
      if (/mer/i.test(a)) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('mode factuel utilise "loi Carrez" ou structure neutre', () => {
    setSeed(1);
    const a = genererAccroche(makeLog(), makeImm(), 'factuel');
    expect(a).toMatch(/T3|Appartement|pièces|m²/);
  });
});

describe('genererDescription', () => {
  it.each(TONS_VALIDES)('produit description pour le ton "%s"', (ton) => {
    const d = genererDescription(makeLog(), ton);
    expect(d).toBeTruthy();
    expect(d.length).toBeGreaterThan(30);
  });

  it('inclut les équipements cuisine si présents (storytelling)', () => {
    const log = makeLog();
    setSeed(1);
    const d = genererDescription(log, 'storytelling');
    expect(d.toLowerCase()).toMatch(/cuisine/);
  });

  it('respecte le nombre de chambres (npp - 1)', () => {
    const log = makeLog({ npp: 5 });
    const d = genererDescription(log, 'storytelling');
    expect(d).toMatch(/4 chambres/);
  });

  it('cas 1 chambre (T2)', () => {
    const log = makeLog({ npp: 2 });
    const d = genererDescription(log, 'storytelling');
    expect(d.toLowerCase()).toMatch(/chambre/);
  });
});

describe('genererAtouts (règle anti-mensonge)', () => {
  it('génère atouts pour bien complet', () => {
    const atouts = genererAtouts(makeLog(), makeImm());
    expect(atouts.length).toBeGreaterThanOrEqual(5);
  });

  it('NE génère PAS d\'atout balcon si absent', () => {
    const log = makeLog({ exterieurs: { balcon: { present: false }, terrasse: { present: false }, jardin_privatif: { present: false } } });
    const atouts = genererAtouts(log, makeImm());
    expect(atouts.filter(a => /balcon/i.test(a))).toHaveLength(0);
  });

  it('NE génère PAS d\'atout exposition si pas renseignée', () => {
    const log = makeLog({ presentation: { ...makeLog().presentation, exposition: '' } });
    const atouts = genererAtouts(log, makeImm());
    expect(atouts.filter(a => /exposition|plein sud|sud-est/i.test(a))).toHaveLength(0);
  });

  it('NE génère PAS d\'atout ascenseur si l\'immeuble n\'en a pas', () => {
    const log = makeLog({ etage: '5' });
    const imm = makeImm({ equipementsCommuns: { ascenseur: false } });
    const atouts = genererAtouts(log, imm);
    expect(atouts.filter(a => /ascenseur/i.test(a))).toHaveLength(0);
  });

  it('NE génère PAS d\'atout fibre si pas présente', () => {
    const log = makeLog();
    log.equipements.technologies.fibre = false;
    const atouts = genererAtouts(log, makeImm());
    expect(atouts.filter(a => /fibre/i.test(a))).toHaveLength(0);
  });

  it('génère un atout par élément réellement présent', () => {
    const log = makeLog();
    const atouts = genererAtouts(log, makeImm());
    // Exposition sud
    expect(atouts.some(a => /plein sud/i.test(a))).toBe(true);
    // Balcon 8 m²
    expect(atouts.some(a => /balcon/i.test(a) && /8/.test(a))).toBe(true);
    // Cave + parking
    expect(atouts.some(a => /cave/i.test(a) || /parking/i.test(a) || /box/i.test(a))).toBe(true);
    // Fibre
    expect(atouts.some(a => /fibre/i.test(a))).toBe(true);
    // Caractère ancien
    expect(atouts.some(a => /caractère|moulures|parquet/i.test(a))).toBe(true);
  });
});

describe('genererQuartier', () => {
  it('exploite log.quartier.transports', () => {
    const q = genererQuartier(makeLog(), makeImm(), 'storytelling');
    expect(q).toMatch(/tramway|gare/i);
  });

  it('exploite log.quartier.reperes', () => {
    const q = genererQuartier(makeLog(), makeImm(), 'storytelling');
    expect(q).toMatch(/Cathédrale/i);
  });

  it('fallback si pas de quartier saisi', () => {
    const log = makeLog({ quartier: null });
    const q = genererQuartier(log, makeImm(), 'storytelling');
    expect(q).toContain('Strasbourg');
  });

  it('quartier mode factuel utilise "Repères" au lieu de "À deux pas"', () => {
    const q = genererQuartier(makeLog(), makeImm(), 'factuel');
    expect(q).toMatch(/Repères/);
  });
});

describe('genererDossier', () => {
  it('retourne 7 pièces standard', () => {
    const d = genererDossier(makeLog());
    expect(d.pieces).toHaveLength(7);
  });

  it('chaque pièce commence par ✓', () => {
    const d = genererDossier(makeLog());
    d.pieces.forEach(p => expect(p).toMatch(/^✓ /));
  });

  it('inclut DossierFacile dans l\'astuce', () => {
    const d = genererDossier(makeLog());
    expect(d.astuce).toMatch(/DossierFacile/i);
  });

  it('mentionne le garant (clause loi ALUR)', () => {
    const d = genererDossier(makeLog());
    expect(d.pieces.join(' ')).toMatch(/garant/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// Orchestrateur principal
// ═══════════════════════════════════════════════════════════════
describe('genererAnnonce — orchestrateur', () => {
  it('produit titre + body non vides', () => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail());
    expect(r.titre).toBeTruthy();
    expect(r.body).toBeTruthy();
    expect(r.stats.caracteres).toBeGreaterThan(500);
  });

  it.each(FORMATS_VALIDES)('produit annonce pour le format "%s"', (format) => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { format });
    expect(r.titre).toBeTruthy();
    expect(r.body).toBeTruthy();
    expect(r.format).toBe(format);
  });

  it.each(TONS_VALIDES)('produit annonce pour le ton "%s"', (ton) => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { ton });
    expect(r.titre).toBeTruthy();
    expect(r.body).toBeTruthy();
    expect(r.ton).toBe(ton);
  });

  it('format SMS est court (~200-400 c.)', () => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { format: 'sms' });
    expect(r.stats.caracteres).toBeLessThan(500);
  });

  it('format leboncoin contient les 4 sections clés', () => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { format: 'leboncoin' });
    expect(r.body).toContain('LE BIEN');
    expect(r.body).toContain('LES ATOUTS');
    expect(r.body).toContain('LE QUARTIER');
    expect(r.body).toContain('PRATIQUE');
  });

  it('format detaille ajoute "PROFIL RECHERCHÉ"', () => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { format: 'detaille' });
    expect(r.body).toContain('PROFIL RECHERCHÉ');
  });

  it('includeDossier: true ajoute la section dossier', () => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { includeDossier: true });
    expect(r.body).toContain('DOSSIER À FOURNIR');
    expect(r.body).toContain('DossierFacile');
  });

  it('includeDossier: false omet la section dossier', () => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { includeDossier: false });
    expect(r.body).not.toContain('DOSSIER À FOURNIR');
  });

  it('affiche le loyer total + détail HC + charges', () => {
    const r = genererAnnonce(makeLog(), makeImm(), { hc: 950, ch: 80, dg: 950 });
    expect(r.body).toMatch(/950 € HC/);
    expect(r.body).toMatch(/80 € charges/);
    expect(r.body).toMatch(/1030 € CC|1 030 € CC/);
  });

  it('même seed = même annonce (déterminisme)', () => {
    const r1 = genererAnnonce(makeLog(), makeImm(), makeBail(), { seed: 12345 });
    const r2 = genererAnnonce(makeLog(), makeImm(), makeBail(), { seed: 12345 });
    expect(r1.titre).toBe(r2.titre);
    expect(r1.body).toBe(r2.body);
  });

  it('counter différent = annonce potentiellement différente', () => {
    const titres = new Set();
    for (let i = 0; i < 20; i++) {
      titres.add(genererAnnonce(makeLog(), makeImm(), makeBail(), { counter: i }).titre);
    }
    expect(titres.size).toBeGreaterThan(2);
  });

  it('aucun mensonge : pas de "plein sud" si exposition vide', () => {
    const log = makeLog({ presentation: { ...makeLog().presentation, exposition: '' } });
    const r = genererAnnonce(log, makeImm(), makeBail(), { format: 'leboncoin', seed: 1 });
    expect(r.body).not.toMatch(/plein sud/i);
  });

  it('aucun mensonge : pas de "balcon" si absent', () => {
    const log = makeLog({ exterieurs: { balcon: { present: false }, terrasse: { present: false }, jardin_privatif: { present: false } } });
    const r = genererAnnonce(log, makeImm(), makeBail(), { format: 'leboncoin', seed: 1 });
    expect(r.body).not.toMatch(/balcon/i);
  });

  it('input null/undefined : ne plante pas (defensive)', () => {
    expect(() => genererAnnonce(null, null, null)).not.toThrow();
    expect(() => genererAnnonce(undefined, undefined, undefined)).not.toThrow();
    expect(() => genererAnnonce({}, {}, {})).not.toThrow();
  });

  it('garanties Visale : présente dans le bloc Pratique', () => {
    const log = makeLog({ locationInfo: { disponibilite: '2026-06-15', garanties_acceptees: ['visale'] } });
    const r = genererAnnonce(log, makeImm(), makeBail());
    expect(r.body).toMatch(/Visale/);
  });

  it('format invalide → fallback leboncoin', () => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { format: 'xyz' });
    expect(r.format).toBe('leboncoin');
  });

  it('ton invalide → fallback storytelling', () => {
    const r = genererAnnonce(makeLog(), makeImm(), makeBail(), { ton: 'xyz' });
    expect(r.ton).toBe('storytelling');
  });
});

// ═══════════════════════════════════════════════════════════════
// Cas pathologiques (post-audit v15.207 — bugs 1/2/3)
// ═══════════════════════════════════════════════════════════════
describe('Cas pathologiques (post-audit)', () => {
  it('balcon présent SANS surface saisie → pas de "undefined m²"', () => {
    const log = makeLog({ exterieurs: { balcon: { present: true /* surface manque */ }, terrasse: { present: false }, jardin_privatif: { present: false } } });
    for (let seed = 1; seed <= 30; seed++) {
      const r = genererAnnonce(log, makeImm(), makeBail(), { seed });
      expect(r.titre).not.toMatch(/undefined/i);
      expect(r.body).not.toMatch(/undefined/i);
      expect(r.titre).not.toMatch(/NaN/);
      expect(r.body).not.toMatch(/NaN/);
    }
  });

  it('jardin présent SANS surface saisie → pas de "undefined m²"', () => {
    const log = makeLog({ type: 'Maison', npp: 5, exterieurs: { balcon: { present: false }, terrasse: { present: false }, jardin_privatif: { present: true /* surface manque */ } } });
    for (let seed = 1; seed <= 30; seed++) {
      const r = genererAnnonce(log, makeImm(), makeBail(), { seed });
      expect(r.titre).not.toMatch(/undefined/i);
      expect(r.body).not.toMatch(/undefined/i);
    }
  });

  it('terrasse présente surface = 0 → pas de "0 m²"', () => {
    const log = makeLog({ exterieurs: { balcon: { present: false }, terrasse: { present: true, surface: 0 }, jardin_privatif: { present: false } } });
    for (let seed = 1; seed <= 30; seed++) {
      const r = genererAnnonce(log, makeImm(), makeBail(), { seed });
      expect(r.titre).not.toMatch(/\b0 m²/);
    }
  });

  it('dpe entier manquant (log.dpe = null) → ne plante pas', () => {
    const log = makeLog({ dpe: null });
    expect(() => genererAnnonce(log, makeImm(), makeBail())).not.toThrow();
    const r = genererAnnonce(log, makeImm(), makeBail(), { seed: 1 });
    expect(r.body).not.toMatch(/undefined/i);
  });

  it('dpe = {} vide → ne plante pas + aucune mention DPE', () => {
    const log = makeLog({ dpe: {} });
    const r = genererAnnonce(log, makeImm(), makeBail(), { seed: 1, includeDossier: false });
    expect(r.body).not.toMatch(/undefined/i);
    expect(r.body).not.toMatch(/Classe \./);  // "Classe ." (vide) ne doit pas apparaître
  });

  it('presentation = null → ne plante pas + pas d\'invention', () => {
    const log = makeLog({ presentation: null });
    expect(() => genererAnnonce(log, makeImm(), makeBail())).not.toThrow();
    const r = genererAnnonce(log, makeImm(), makeBail(), { seed: 1 });
    expect(r.body).not.toMatch(/plein sud|baigné de lumière|moulures/i);
  });

  it('equipements = null → ne plante pas', () => {
    const log = makeLog({ equipements: null });
    expect(() => genererAnnonce(log, makeImm(), makeBail())).not.toThrow();
  });

  it('exterieurs = null → ne plante pas', () => {
    const log = makeLog({ exterieurs: null });
    expect(() => genererAnnonce(log, makeImm(), makeBail())).not.toThrow();
  });

  it('annexes = null → ne plante pas', () => {
    const log = makeLog({ annexes: null });
    expect(() => genererAnnonce(log, makeImm(), makeBail())).not.toThrow();
  });

  it('ville avec accents/apostrophes (Saint-Étienne, l\'Île-Rousse)', () => {
    const r1 = genererAnnonce(makeLog(), makeImm({ ville: 'Saint-Étienne', codePostal: '42000' }), makeBail(), { seed: 1 });
    expect(r1.titre).toContain('Saint-Étienne');
    const r2 = genererAnnonce(makeLog(), makeImm({ ville: "l'Île-Rousse", codePostal: '20220' }), makeBail(), { seed: 1 });
    expect(r2.body).toContain("l'Île-Rousse");
  });

  it('T1 (npp=1) → 0 chambre, pas d\'erreur sur "Math.max(0, npp-1)"', () => {
    const log = makeLog({ type: 'T1', surf: 25, npp: 1 });
    const r = genererAnnonce(log, makeImm(), makeBail(), { seed: 1 });
    expect(r.body).not.toMatch(/-1 chambres/);
    expect(r.body).not.toMatch(/0 chambres? confortables?/);
  });

  it('npp = 0 (Studio) → ne génère pas "0 chambre" disgracieux', () => {
    const log = makeLog({ type: 'Studio', surf: 22, npp: 0 });
    const r = genererAnnonce(log, makeImm(), makeBail(), { seed: 1 });
    expect(r.body).not.toMatch(/-1 chambres/);
  });

  it('surf = 0 → adj lifestyle "cosy" (pas crash)', () => {
    const log = makeLog({ surf: 0 });
    expect(() => genererAnnonce(log, makeImm(), makeBail())).not.toThrow();
  });

  it('loyer hc=0 et ch=0 → annonce sans total bizarre', () => {
    const r = genererAnnonce(makeLog(), makeImm(), { hc: 0, ch: 0, dg: 0 }, { seed: 1 });
    expect(r.body).toMatch(/0 €/);
    expect(r.body).not.toMatch(/undefined/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// Cas multi-villes (différenciation prouvée)
// ═══════════════════════════════════════════════════════════════
describe('Cas multi-villes (couverture diversifiée)', () => {
  it('cas Paris 11e sans extérieur', () => {
    const log = makeLog({ ref: 'PARIS-11', type: 'T2', surf: 42, npp: 2, etage: '3',
      exterieurs: { balcon: { present: false }, terrasse: { present: false }, jardin_privatif: { present: false } },
      presentation: { exposition: 'sud-est', vue: 'cour', luminosite: 'lumineux', calme: 'cour-interieure', caractere_ancien: 'moulures-parquet' }
    });
    const imm = makeImm({ adr: '47 rue de la Roquette', codePostal: '75011', ville: 'Paris' });
    const r = genererAnnonce(log, imm, { hc: 1450, ch: 90, dg: 1450 }, { ton: 'storytelling', seed: 1 });
    expect(r.body).toContain('Paris');
    expect(r.body).not.toMatch(/balcon/i); // pas d'invention
  });

  it('cas Maison Toulouse avec jardin', () => {
    const log = makeLog({ ref: 'TLS-MAISON', type: 'Maison', surf: 120, npp: 5, etage: '0',
      dpe: { classe: 'A', valConv: 55, ges: 'A' },
      exterieurs: { balcon: { present: false }, terrasse: { present: true, surface: 18 }, jardin_privatif: { present: true, surface: 350 } },
      presentation: { exposition: 'sud', vue: 'jardin', luminosite: 'tres-lumineux', calme: 'quartier-residentiel', caractere_ancien: '' }
    });
    const imm = makeImm({ adr: '14 impasse des Glycines', codePostal: '31100', ville: 'Toulouse', periodeConstr: 'Depuis 2005', regimeJuridique: 'Monopropriété', equipementsCommuns: {} });
    const r = genererAnnonce(log, imm, { hc: 1850, ch: 0 }, { ton: 'storytelling', seed: 1 });
    expect(r.body).toContain('Toulouse');
    expect(r.body).toMatch(/jardin/i);
    expect(r.body).toMatch(/350/);
  });

  it('cas Studio meublé Lyon (étudiant)', () => {
    const log = makeLog({ ref: 'LY-STUDIO', type: 'Studio', surf: 24, npp: 1, etage: '2',
      typeUsage: 'habitation-meuble',
      equipements: { cuisine: { equipee: true, plaques: true, micro_ondes: true, customs: [] }, sanitaires: { douche: true, lave_linge: true }, technologies: { fibre: true } },
      exterieurs: { balcon: { present: false }, terrasse: { present: false }, jardin_privatif: { present: false } },
      presentation: { exposition: 'est', luminosite: 'lumineux', calme: 'cour-interieure' }
    });
    const imm = makeImm({ ville: 'Lyon', codePostal: '69004' });
    const r = genererAnnonce(log, imm, { hc: 550, ch: 60 }, { ton: 'convivial', seed: 1 });
    expect(r.titre.toLowerCase()).toMatch(/studio|24m²|meublé/);
  });
});
