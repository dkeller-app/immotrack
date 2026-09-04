/**
 * Tests bail-garage — structure du document « bail garage / box / stockage » (droit commun).
 * Vérifie : contenu droit-commun (aucune clause loi-89 affirmée), destination par nature,
 * indexation ICC (jamais IRL), protections bailleur, sections conditionnelles, ordre des pages,
 * réutilisation des blocs partagés injectés.
 */
import { describe, it, expect } from 'vitest';
import {
  buildGarageStructure, GARAGE_SIGNATURE_SECTION_NO, GARAGE_NB_EXEMPLAIRES,
  BAIL_GARAGE_NATURES, BAIL_GARAGE_NATURE_DEFAULT, resolveGarageNature,
  getGarageTitle, getGarageDestinationUsage,
  BAIL_GARAGE_INDICES, BAIL_GARAGE_INDEX_DEFAULT, isGarageIndexationOnByDefault
} from './bail-garage.js';

describe('Nature d\'emplacement (place/box/stockage)', () => {
  it('natures = place/box/stockage, défaut box', () => {
    expect(BAIL_GARAGE_NATURES).toEqual(['place', 'box', 'stockage']);
    expect(BAIL_GARAGE_NATURE_DEFAULT).toBe('box');
  });
  it('resolveGarageNature : valide fait autorité, sinon box', () => {
    expect(resolveGarageNature({ natureEmplacement: 'place' })).toBe('place');
    expect(resolveGarageNature({ natureEmplacement: 'stockage' })).toBe('stockage');
    expect(resolveGarageNature({})).toBe('box');
    expect(resolveGarageNature({ natureEmplacement: 'cave' })).toBe('box');
    expect(resolveGarageNature(null)).toBe('box');
  });
  it('getGarageTitle : distinct par nature, défaut box', () => {
    expect(getGarageTitle('place')).toMatch(/STATIONNEMENT/i);
    expect(getGarageTitle('box')).toMatch(/BOX/i);
    expect(getGarageTitle('stockage')).toMatch(/STOCKAGE/i);
    expect(getGarageTitle('cave')).toBe(getGarageTitle('box'));
  });
  it('getGarageDestinationUsage : place=stationnement, box/stockage=remisage, jamais habitation', () => {
    expect(getGarageDestinationUsage('place')).toMatch(/stationnement/i);
    expect(getGarageDestinationUsage('box')).toMatch(/remisage|stockage/i);
    for (const n of BAIL_GARAGE_NATURES) {
      expect(getGarageDestinationUsage(n)).not.toMatch(/habitation|résidence principale/i);
    }
  });
  it('indexation : ICC/ILC/ILAT (IRL exclu), défaut ICC, désactivée par défaut', () => {
    expect(BAIL_GARAGE_INDICES).toEqual(['ICC', 'ILC', 'ILAT']);
    expect(BAIL_GARAGE_INDICES).not.toContain('IRL');
    expect(BAIL_GARAGE_INDEX_DEFAULT).toBe('ICC');
    expect(isGarageIndexationOnByDefault()).toBe(false);
  });
});

// Blocs partagés simulés (index.html les fournit réellement) — marqueurs reconnaissables.
const SHARED = {
  header: [{ type: 'brandzone', logo: '', sciNom: 'SCI TEST' }],
  identity: [
    { type: 'h2', text: 'Entre les soussignés' },
    { type: 'h3', text: 'Le Bailleur' },
    { type: 'p', text: 'SCI TEST, représentée par sa Gérante.' },
    { type: 'h3', text: 'Le Locataire' },
    { type: 'p', text: 'M. Jean DUPONT.' }
  ],
  signature: [
    { type: 'page-break' },
    { type: 'h2', text: '16 — Signatures' },
    { type: 'p', text: 'Fait à Strasbourg, en 2 exemplaires originaux.' },
    { type: 'signature-bailleur', role: 'LE BAILLEUR — SCI TEST', bIdx: 0, remote: false },
    { type: 'signature-locataire-placeholder', label: 'Signature LOCATAIRE — M. Jean DUPONT' }
  ]
};

function baseData(over = {}) {
  return Object.assign({
    nature: 'box',
    adrBien: 'Parking souterrain, 12 rue de la Krutenau, 67000 Strasbourg',
    ensembleAdr: 'Parking souterrain, 12 rue de la Krutenau, 67000 Strasbourg',
    numEmplacement: '12', surface: '12', niveau: 'au niveau −1', descriptif: 'fermé par une porte basculante avec serrure',
    lotCopro: '112',
    dateDebut: '01/10/2026', dateFin: '30/09/2027', dureeText: '1 (un) an', dureeRecap: '1 (un) an — fin le 30/09/2027',
    preavisText: 'un (1) mois',
    loyerHC: '90,00', loyerHCLettres: 'quatre-vingt-dix euros', charges: '8,00', jourPaiement: '5',
    dg: '180,00', dgLettres: 'cent quatre-vingts euros',
    iban: 'FR76…', bic: 'BNPAFRPP', nomSci: 'SCI TEST', locNames: 'M. Jean DUPONT',
    bailleurLine: 'SCI TEST — siège Strasbourg', representantLine: 'Mme Claire FONTAINE — Gérante',
    emplacementRecap: 'Box fermé n° 12 — niveau −1 — env. 12 m²',
    hasCharges: true, hasGarant: false, erpZoneRisque: false, plusieursLocataires: false,
    indexation: { active: false }
  }, over);
}

const build = over => buildGarageStructure({ data: baseData(over), blocks: SHARED });
const allText = blocks => blocks.map(b => b.text || (b.items ? b.items.join(' ') : '') || (b.segments ? b.segments.map(s => s.text).join('') : '')).join(' \n ');
const h2s = blocks => blocks.filter(b => b.type === 'h2').map(b => b.text);

describe('buildGarageStructure — squelette & réutilisation', () => {
  it('un seul h1 (le titre) et le titre suit la nature', () => {
    expect(build({ nature: 'box' }).filter(b => b.type === 'h1')).toHaveLength(1);
    expect(build({ nature: 'place' }).find(b => b.type === 'h1').text).toMatch(/STATIONNEMENT/i);
    expect(build({ nature: 'box' }).find(b => b.type === 'h1').text).toMatch(/BOX/i);
    expect(build({ nature: 'stockage' }).find(b => b.type === 'h1').text).toMatch(/STOCKAGE/i);
  });

  it('sous-titre = Code civil, jamais un régime loi 89 affirmé', () => {
    const sub = build().find(b => b.type === 'note-center');
    expect(sub.text).toMatch(/Code civil/);
    expect(sub.text).toMatch(/hors loi/i);
  });

  it('réutilise les blocs partagés injectés (en-tête, identité, signatures)', () => {
    const out = build();
    expect(out[0]).toEqual(SHARED.header[0]);                        // brandzone en tête
    expect(out.some(b => b.type === 'h3' && b.text === 'Le Bailleur')).toBe(true);
    expect(out.some(b => b.type === 'signature-bailleur')).toBe(true);
    expect(out.some(b => b.type === 'signature-locataire-placeholder')).toBe(true);
  });

  it('constantes : signatures = §16, 2 exemplaires', () => {
    expect(GARAGE_SIGNATURE_SECTION_NO).toBe(16);
    expect(GARAGE_NB_EXEMPLAIRES).toBe(2);
  });
});

describe('buildGarageStructure — corps droit commun (16 sections)', () => {
  it('numérote §1 à §15 puis Annexes, sans DDT/diagnostics logement', () => {
    const titles = h2s(build());
    expect(titles).toContain('1 — Désignation de l\'emplacement loué');
    expect(titles).toContain('2 — Destination — usage exclusif');
    expect(titles).toContain('13 — Clause résolutoire');
    expect(titles).toContain('15 — Dispositions diverses');
    expect(titles).toContain('Annexes');
    // aucune section « Dossier de Diagnostic Technique » ni « Grille de vétusté »
    expect(titles.join(' ')).not.toMatch(/Diagnostic Technique|Grille de vétusté|Charges récupérables/i);
  });

  it('AUCUNE clause loi-89 affirmée (art. 22/24/25/17-1, décrets 87-71x, MRH, IRL applicable)', () => {
    const t = allText(build());
    expect(t).not.toMatch(/article 22 de la loi|art\. 24 de la loi|art\. 25-|article 17-1/i);
    expect(t).not.toMatch(/décret n° 87-71[23]|décret n° 2015-981|décret n° 2002-120/);
    expect(t).not.toMatch(/multirisque habitation|résidence principale|habitation principale/i);
    expect(t).not.toMatch(/grille de vétusté|Airbnb/i);
  });

  it('§2 destination : usage selon nature, JAMAIS habitation', () => {
    expect(allText(build({ nature: 'place' }))).toMatch(/stationnement d'un véhicule/i);
    expect(allText(build({ nature: 'box' }))).toMatch(/remisage et de stockage/i);
    for (const n of ['place', 'box', 'stockage']) {
      const t = allText(build({ nature: n }));
      expect(t).not.toMatch(/habiter[^.]*autoris/i);
      expect(t).toMatch(/formellement interdit/i);       // clause de sécurité présente
    }
  });
});

describe('buildGarageStructure — loyer & indexation (art. L112-2 CMF)', () => {
  it('indexation désactivée → loyer fixe, aucun indice', () => {
    const t = allText(build({ indexation: { active: false } }));
    expect(t).toMatch(/loyer est fixe/i);
    expect(t).not.toMatch(/\bICC\b|\bIRL\b|indice/i);
  });

  it('indexation activée → ICC + L112-2, et IRL explicitement écarté', () => {
    const t = allText(build({ indexation: { active: true, indice: 'ICC', indiceBase: 'T2 2026' } }));
    expect(t).toMatch(/«\s*ICC\s*»/);
    expect(t).toMatch(/L\.?\s*112-2/);
    expect(t).toMatch(/IRL[^.]*n'est pas applicable/i);   // IRL cité uniquement pour l'écarter
  });

  it('intérêts de retard art. 1231-6 présents', () => {
    expect(allText(build())).toMatch(/1231-6/);
  });
});

describe('buildGarageStructure — protections bailleur', () => {
  it('§8 présomption d\'incendie art. 1733', () => {
    expect(allText(build())).toMatch(/1733/);
    expect(allText(build())).toMatch(/présumé responsable/i);
  });

  it('§12 biens abandonnés + accession art. 555', () => {
    const t = allText(build());
    expect(t).toMatch(/réputés abandonnés/i);
    expect(t).toMatch(/accession[^.]*555|article 555/i);
  });

  it('DG non imputable sur le loyer', () => {
    expect(allText(build())).toMatch(/ne peut imputer le dépôt de garantie/i);
  });

  it('solidarité §15 uniquement si plusieurs locataires (art. 1310)', () => {
    expect(allText(build({ plusieursLocataires: false }))).not.toMatch(/1310/);
    expect(allText(build({ plusieursLocataires: true }))).toMatch(/1310/);
  });
});

describe('buildGarageStructure — sections conditionnelles', () => {
  it('§7 Garanties (caution 2297 + GLI/Visale exclues) seulement si garant', () => {
    expect(h2s(build({ hasGarant: false }))).not.toContain('7 — Garanties de paiement');
    const withG = build({ hasGarant: true });
    expect(h2s(withG)).toContain('7 — Garanties de paiement');
    const t = allText(withG);
    expect(t).toMatch(/2297/);
    expect(t).toMatch(/GLI|Visale/);
  });

  it('§5 charges : forfaitaire si hasCharges=false', () => {
    expect(allText(build({ hasCharges: false }))).toMatch(/loyer est forfaitaire/i);
    expect(allText(build({ hasCharges: true }))).toMatch(/quote-part des charges/i);
  });

  it('ERP : clause §15 + Annexe 2 « Joint » seulement en zone à risque', () => {
    expect(allText(build({ erpZoneRisque: false }))).not.toMatch(/L\.?\s*125-5/);
    const withErp = build({ erpZoneRisque: true });
    expect(allText(withErp)).toMatch(/L\.?\s*125-5/);
    const annexTable = withErp.find(b => b.type === 'table' && b.headers && b.headers[0] === 'N°');
    expect(JSON.stringify(annexTable.rows)).toMatch(/Joint \(zone à risque\)/);
  });
});

describe('buildGarageStructure — pagination (page-break avant Signatures et Annexes)', () => {
  it('un page-break précède immédiatement la page Signatures (bloc injecté)', () => {
    const out = build();
    const sigIdx = out.findIndex(b => b.type === 'h2' && /SIGNATURES/i.test(b.text));
    expect(sigIdx).toBeGreaterThan(0);
    expect(out[sigIdx - 1].type).toBe('page-break');
  });

  it('un page-break précède immédiatement la page Annexes', () => {
    const out = build();
    const annIdx = out.findIndex(b => b.type === 'h2' && b.text === 'Annexes');
    expect(annIdx).toBeGreaterThan(0);
    expect(out[annIdx - 1].type).toBe('page-break');
  });

  it('l\'ordre est corps → signatures → annexes', () => {
    const out = build();
    const resolIdx = out.findIndex(b => b.type === 'h2' && b.text === '13 — Clause résolutoire');
    const sigIdx = out.findIndex(b => b.type === 'h2' && /SIGNATURES/i.test(b.text));
    const annIdx = out.findIndex(b => b.type === 'h2' && b.text === 'Annexes');
    expect(resolIdx).toBeLessThan(sigIdx);
    expect(sigIdx).toBeLessThan(annIdx);
  });
});
