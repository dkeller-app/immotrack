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

// BAUX-ECHUS — la lettre « congé du bailleur » selon le type de bail : l'art. 15 hors bail nu, plus jamais.
import { congeBailleurModele, congePhraseTerme, congeMotifDetail } from '../../js/core/conge.js';
import { _emailCompose } from '../../js/core/email-compose.js';

describe('congeBailleurModele — une lettre par type de bail', () => {
  it('nu : congé art. 15 (annexe 15-II pour une vente) — inchangé', () => {
    expect(congeBailleurModele('nu')).toMatchObject({ tpl: 'bail-conge-bailleur-6mois', fondement: 'Loi n° 89-462 du 6 juillet 1989, article 15', annexe15II: true, motif: true });
  });
  it('meublé : art. 25-8, I, sans annexe 15-II ; locataire protégé art. 25-8, II', () => {
    expect(congeBailleurModele('meuble')).toMatchObject({ tpl: 'bail-conge-bailleur-meuble', fondement: 'Loi n° 89-462 du 6 juillet 1989, article 25-8, I', annexe15II: false, motif: true, protege: 'art. 25-8, II' });
  });
  it('étudiant / mobilité : information de fin de bail, sans motif ni art. 15', () => {
    expect(congeBailleurModele('etudiant')).toMatchObject({ tpl: 'bail-fin-terme-information', titre: 'Information de fin de bail', fondement: 'Loi n° 89-462 du 6 juillet 1989, article 25-7', motif: false });
    expect(congeBailleurModele('mobilite')).toMatchObject({ tpl: 'bail-fin-terme-information', fondement: 'Loi n° 89-462 du 6 juillet 1989, article 25-14', motif: false });
  });
  it('garage / autre : le contrat (date d\'effet libre, sans motif)', () => {
    for (const t of ['garage', 'autre']) expect(congeBailleurModele(t)).toMatchObject({ tpl: 'bail-conge-bailleur-contrat', fondement: 'Contrat de location', dateLibre: true, motif: false });
  });
});

describe('congePhraseTerme — jamais une date d\'effet antérieure à la lettre', () => {
  it('terme à venir → futur ; terme dépassé → passé', () => {
    expect(congePhraseTerme('31/05/2027', '2027-05-31', '2026-10-06')).toBe('prendra fin à son terme, le 31/05/2027');
    expect(congePhraseTerme('31/05/2026', '2026-05-31', '2026-10-06')).toBe('est arrivé à son terme le 31/05/2026');
  });
});

describe('congeMotifDetail — meublé : vente sans prix ni préemption 15-II', () => {
  it('vente en meublé : « Vente du logement. », aucun art. 15-II, aucun marqueur de prix', () => {
    const r = congeMotifDetail({ motif: 'vente', meuble: true });
    expect(r).toEqual({ motifConge: 'vente', motifDetail: 'Vente du logement.' });
  });
  it('vente en nu : toujours le prix, les conditions et la préemption 15-II', () => {
    expect(congeMotifDetail({ motif: 'vente', prix: '200000', conditions: 'libre' }).motifDetail).toMatch(/15-II/);
  });
});

describe('les lettres générées : le corps ne cite l\'art. 15 que pour le bail nu', () => {
  const ctx = { locataire: { nom: 'Martin', civilite: 'M.' }, entite: { nom: 'SCI T', gerant: 'D. K', siege: 'Strasbourg' },
    bail: { adrBien: '1 rue Test', debut: '01/09/2025' }, dateLettre: '06/10/2026', dateFin: '31/08/2027',
    motifConge: 'reprise', motifDetail: 'Reprise pour habiter.', mentionPreavis: 'MENTION', phraseTerme: 'est arrivé à son terme le 31/05/2026' };
  it('meublé : art. 25-8, I cité mot pour mot ; aucun art. 15', () => {
    const b = _emailCompose('bail-conge-bailleur-meuble', ctx).body;
    expect(b).toContain("« Le bailleur qui ne souhaite pas renouveler le contrat doit informer le locataire avec un préavis de trois mois et motiver son refus de renouvellement du bail soit par sa décision de reprendre ou de vendre le logement, soit par un motif légitime et sérieux, notamment l'inexécution par le locataire de l'une des obligations lui incombant. »");
    expect(b).toMatch(/article 25-8, I de la loi n° 89-462/);
    expect(b).not.toMatch(/article 15|15-I|15-II/);
  });
  it('étudiant / mobilité : information, sans art. 15, sans motif, avec la phrase de terme', () => {
    const b = _emailCompose('bail-fin-terme-information', ctx).body;
    expect(b).toContain('ayant pris effet le 01/09/2025, est arrivé à son terme le 31/05/2026.');
    expect(b).not.toMatch(/conclu le/);
    expect(b).toContain('MENTION');
    expect(b).not.toMatch(/article 15|motif|congé du logement|prend effet/i);
  });
  it('garage / autre : congé selon les stipulations du contrat, sans art. 15 ni motif', () => {
    const b = _emailCompose('bail-conge-bailleur-contrat', ctx).body;
    expect(b).toContain('Conformément aux stipulations du contrat de location ayant pris effet le 01/09/2025 pour 1 rue Test, je vous donne par la présente congé de ce contrat, à effet du 31/08/2027.');
    expect(b).not.toMatch(/article 15|loi n° 89-462/);
  });
});

describe('courrier « Renouvellement du bail » — 3 ou 6 ans (art. 10 et 13), 1 an meublé (art. 25-7)', () => {
  it('six ans pour les AUTRES personnes morales ; pas de « mêmes conditions »', () => {
    const b = _emailCompose('bail-renouvellement-3ans', { locataire: { nom: 'X' }, entite: {}, bail: { adrBien: 'A' }, dateFin: '2028-12-31' }).body;
    expect(b).toContain("pour trois ans si le bailleur est une personne physique ou relève de l'article 13, pour six ans s'il est une autre personne morale (articles 10 et 13 de la loi n° 89-462 du 6 juillet 1989), ou pour un an s'il s'agit d'un bail meublé (article 25-7 de la même loi)");
    expect(b).not.toMatch(/mêmes conditions/);
  });
});
