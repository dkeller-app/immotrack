/**
 * Tests — CONGÉ & RÉSILIATION. Module js/core/conge.js
 */
import { describe, it, expect } from 'vitest';
import {
  CONGE_MOTIFS, CONGE_CAS_REDUITS, ART15_II_ALINEAS,
  letterToProDoc, art15IIProDoc, congeBailleurPreavisMois, congeLocatairePreavis,
  addMoisClamped, locataireProtege, congeMentionPreavis
} from '../../js/core/conge.js';

describe('préavis bailleur (art. 15-I nu, art. 25-8 I meublé)', () => {
  it('6 mois nu, 3 mois meublé', () => {
    expect(congeBailleurPreavisMois('nu')).toBe(6);
    expect(congeBailleurPreavisMois('')).toBe(6);
    expect(congeBailleurPreavisMois('meuble')).toBe(3);
  });
  it('BAUX-ECHUS — aucun préavis légal : étudiant, mobilité (fin au terme), garage, autre (le contrat)', () => {
    for (const t of ['etudiant', 'mobilite', 'garage', 'autre']) expect(congeBailleurPreavisMois(t)).toBe(null);
  });
  it('la lettre ne dit jamais « de null mois » : elle dit ce que dit la loi', () => {
    expect(congeMentionPreavis(6, 'nu')).toMatch(/^Le délai de préavis légal applicable à ce congé est de 6 mois/);
    expect(congeMentionPreavis(null, 'etudiant')).toMatch(/article 25-7 .* prend fin à son terme, sans qu'un congé soit nécessaire/);
    expect(congeMentionPreavis(null, 'mobilite')).toMatch(/non renouvelable et non reconductible \(article 25-14/);
    expect(congeMentionPreavis(null, 'garage')).toBe('Le délai de préavis applicable à ce congé est celui prévu au contrat de location.');
    expect(congeMentionPreavis(null, 'mobilite')).not.toMatch(/null/);
  });
});

describe('préavis locataire', () => {
  it('nu plein = 3 mois', () => {
    const r = congeLocatairePreavis({ typeBail: 'nu', casReduit: 'Aucun (préavis plein)' });
    expect(r.mois).toBe(3); expect(r.reduit).toBe(false);
  });
  it('meublé = 1 mois sans justif', () => {
    const r = congeLocatairePreavis({ typeBail: 'meuble', casReduit: 'Aucun (préavis plein)' });
    expect(r.mois).toBe(1); expect(r.sansJustif).toBe(true);
  });
  it('zone tendue = 1 mois, mention seule (sans justif)', () => {
    const r = congeLocatairePreavis({ typeBail: 'nu', casReduit: 'Zone tendue' });
    expect(r.mois).toBe(1); expect(r.reduit).toBe(true); expect(r.sansJustif).toBe(true);
  });
  it('mutation = 1 mois AVEC justificatif', () => {
    const r = congeLocatairePreavis({ typeBail: 'nu', casReduit: 'Mutation professionnelle' });
    expect(r.mois).toBe(1); expect(r.reduit).toBe(true); expect(r.sansJustif).toBe(false);
  });
  it('10 cas réduits recensés', () => {
    expect(CONGE_CAS_REDUITS.length).toBe(11); // « Aucun » + 10 cas
  });
});

describe('addMoisClamped — recadrage fin de mois', () => {
  it('date + préavis, recadré', () => {
    expect(addMoisClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMoisClamped('2026-06-15', 3)).toBe('2026-09-15');
  });
});

describe('locataire protégé (art. 15-III)', () => {
  it('>65 + ressources faibles → bloquant', () => {
    const r = locataireProtege({ plusDe65: true, ressourcesFaibles: true });
    expect(r.protege).toBe(true); expect(r.bloquant).toBe(true);
  });
  it('exception bailleur âgé/modeste → non bloquant', () => {
    const r = locataireProtege({ plusDe65: true, ressourcesFaibles: true, bailleurAgeOuModeste: true });
    expect(r.bloquant).toBe(false);
  });
  it('non protégé', () => {
    expect(locataireProtege({ plusDe65: false, ressourcesFaibles: true }).bloquant).toBe(false);
  });
});

describe('letterToProDoc — corps de lettre → .pro-doc, anti-XSS', () => {
  it('paragraphes + gras + sauts', () => {
    const h = letterToProDoc('Bonjour,\n\nVoici **le montant** dû.\nMerci.');
    expect(h).toMatch(/<p>Bonjour,<\/p>/);
    expect(h).toMatch(/<strong>le montant<\/strong>/);
    expect(h).toMatch(/dû\.<br>Merci\./);
  });
  it('échappe le HTML injecté (nom/valeur)', () => {
    const h = letterToProDoc('Objet <img src=x onerror=alert(1)>');
    expect(h).not.toMatch(/<img/);
    expect(h).toMatch(/&lt;img/);
  });
  it('ne produit pas de <p> vide (clause conditionnelle absente)', () => {
    const h = letterToProDoc('Début.\n\n\n\nFin.');
    expect(h).not.toMatch(/<p><\/p>/);
    expect(h).toBe('<p>Début.</p><p>Fin.</p>');
  });
});

describe('art. 15-II verbatim', () => {
  it('5 alinéas reproduits', () => {
    expect(ART15_II_ALINEAS.length).toBe(5);
    expect(ART15_II_ALINEAS[0]).toMatch(/à peine de nullité, indiquer le prix et les conditions/);
    expect(art15IIProDoc()).toMatch(/reproduction imposée à peine de nullité/i);
  });
  it('CONGE_MOTIFS = 3 motifs légaux', () => {
    expect(CONGE_MOTIFS.map(m => m.k)).toEqual(['reprise', 'vente', 'legitime']);
  });
});
