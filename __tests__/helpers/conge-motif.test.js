/**
 * Le générateur COMMUN du motif de congé — celui que la modale d'actes et le Hub
 * Communications appellent désormais tous les deux.
 *
 * Ce qu'on protège ici, c'est la raison d'être du module : le Hub composait son propre motif,
 * ne demandait ni le prix ni les conditions de la vente, et émettait quand même la phrase
 * « aux prix et conditions indiqués ci-dessus ». L'article 15-II de la loi n° 89-462 du
 * 6 juillet 1989 impose ces deux mentions à peine de nullité : le congé ne valait rien, et
 * rien ne le signalait — le garde-fou DOC-C ne lit que les marqueurs « ‹…› », qu'aucun
 * générateur ne posait sur ce chemin.
 */

import { describe, it, expect } from 'vitest';
import { congeMotifDetail, congeDateEffet, congeMentionPreavis, ART15_II_ALINEAS } from '../../js/core/conge.js';
import { mentionsManquantes, emporteNullite } from '../../js/core/actes-mentions.js';

describe('congeMotifDetail — vente (art. 15-II)', () => {
  it('le prix manquant pose un marqueur que le garde-fou reconnaît comme fatal', () => {
    const { motifDetail } = congeMotifDetail({ motif: 'vente', conditions: 'vente libre' });
    expect(motifDetail).toContain('‹prix›');
    const m = mentionsManquantes(motifDetail);
    expect(m.map((x) => x.marqueur)).toEqual(['prix']);
    expect(emporteNullite(m)).toBe(true);
  });

  it('les conditions manquantes aussi', () => {
    const { motifDetail } = congeMotifDetail({ motif: 'vente', prix: '250000' });
    expect(mentionsManquantes(motifDetail).map((x) => x.marqueur)).toEqual(['conditions']);
  });

  it('les deux renseignés : aucun marqueur, et le prix PRÉCÈDE la phrase de préemption', () => {
    const { motifDetail } = congeMotifDetail({ motif: 'vente', prix: '250000', conditions: 'vente libre' });
    expect(mentionsManquantes(motifDetail)).toEqual([]);
    // « aux prix et conditions indiqués ci-dessus » n'est vrai que s'ils sont réellement au-dessus.
    expect(motifDetail.indexOf('250000')).toBeLessThan(motifDetail.indexOf('ci-dessus'));
    expect(motifDetail.indexOf('vente libre')).toBeLessThan(motifDetail.indexOf('ci-dessus'));
  });

  it('un champ blanc compte comme vide (un espace n’est pas un prix)', () => {
    const { motifDetail } = congeMotifDetail({ motif: 'vente', prix: '   ', conditions: '\t' });
    expect(mentionsManquantes(motifDetail).map((x) => x.marqueur)).toEqual(['prix', 'conditions']);
  });

  it('art15Inline=true reproduit les CINQ alinéas dans le corps (un email n’a pas d’annexe)', () => {
    const { motifDetail } = congeMotifDetail({ motif: 'vente', prix: '1', conditions: 'c', art15Inline: true });
    for (const a of ART15_II_ALINEAS) expect(motifDetail).toContain(a);
    expect(motifDetail).not.toContain('figurent en annexe');
  });

  it('art15Inline=false renvoie à l’annexe et ne duplique PAS les alinéas', () => {
    const { motifDetail } = congeMotifDetail({ motif: 'vente', prix: '1', conditions: 'c', art15Inline: false });
    expect(motifDetail).toContain('figurent en annexe du présent congé');
    expect(motifDetail).not.toContain(ART15_II_ALINEAS[0]);
  });

  it('motifConge = "vente" (il alimente l’objet de la lettre)', () => {
    expect(congeMotifDetail({ motif: 'vente' }).motifConge).toBe('vente');
  });
});

describe('congeMotifDetail — reprise (art. 15-I)', () => {
  it('nom, adresse ET nature du lien manquants → trois mentions fatales', () => {
    // L'art. 15-I exige « les nom et adresse du bénéficiaire de la reprise ainsi que la nature
    // du lien », le tout à peine de nullité : les trois sont au même rang.
    const { motifDetail } = congeMotifDetail({ motif: 'reprise' });
    const m = mentionsManquantes(motifDetail);
    expect(m.map((x) => x.marqueur))
      .toEqual(['bénéficiaire', 'adresse du bénéficiaire', 'nature du lien avec le bailleur']);
    expect(emporteNullite(m)).toBe(true);
  });

  it('un lien VIDE est signalé, jamais remplacé par une affirmation', () => {
    // Le défaut « le bailleur lui-même » est une affirmation de FAIT. La poser à la place d'un
    // champ vide, c'est écrire dans un acte une chose que personne n'a saisie — et la mention
    // est de celles qui emportent nullité. Le formulaire de la modale, lui, propose ce choix
    // dans un `<select>` : l'utilisateur le voit et le retient, ce qui est tout autre chose.
    const { motifDetail } = congeMotifDetail({ motif: 'reprise', benef: 'Paul', benefAdr: '1 rue X' });
    expect(motifDetail).not.toContain('(le bailleur lui-même)');
    expect(mentionsManquantes(motifDetail).map((x) => x.marqueur)).toEqual(['nature du lien avec le bailleur']);
  });

  it('le lien retenu par l’utilisateur est repris tel quel', () => {
    const { motifDetail } = congeMotifDetail({ motif: 'reprise', benef: 'P', benefAdr: 'A', lien: 'le bailleur lui-même' });
    expect(motifDetail).toContain('(le bailleur lui-même)');
    expect(mentionsManquantes(motifDetail)).toEqual([]);
  });

  it('le lien fourni remplace le défaut', () => {
    expect(congeMotifDetail({ motif: 'reprise', benef: 'P', benefAdr: 'A', lien: 'un ascendant' }).motifDetail)
      .toContain('(un ascendant)');
  });
});

describe('congeMotifDetail — motif légitime et sérieux (art. 15-I)', () => {
  it('description manquante → mention fatale', () => {
    const r = congeMotifDetail({ motif: 'legitime' });
    expect(r.motifConge).toBe('motif légitime et sérieux');
    expect(emporteNullite(mentionsManquantes(r.motifDetail))).toBe(true);
  });

  it('description fournie → rien à signaler', () => {
    expect(mentionsManquantes(congeMotifDetail({ motif: 'legitime', legitime: 'troubles répétés' }).motifDetail))
      .toEqual([]);
  });
});

describe('congeMotifDetail — robustesse', () => {
  it('sans argument, ne jette pas et retombe sur la reprise', () => {
    expect(congeMotifDetail().motifConge).toBe('reprise');
    expect(congeMotifDetail(null).motifConge).toBe('reprise');
  });

  it('un motif inconnu retombe sur la reprise plutôt que de produire un acte sans motif', () => {
    expect(congeMotifDetail({ motif: 'n’importe quoi' }).motifConge).toBe('reprise');
  });
});

describe('congeDateEffet — une date d’effet que le préavis permet d’atteindre', () => {
  it('le préavis tient encore : on garde le terme le plus proche', () => {
    expect(congeDateEffet({ finIso: '2027-12-31', preavisMois: 6, cycleMois: 36, todayIso: '2026-09-23' }))
      .toEqual({ finIso: '2027-12-31', pushed: false });
  });

  it('le préavis ne tient plus : report au terme SUIVANT (un congé tardif est nul)', () => {
    expect(congeDateEffet({ finIso: '2026-12-31', preavisMois: 6, cycleMois: 36, todayIso: '2026-09-23' }))
      .toEqual({ finIso: '2029-12-31', pushed: true });
  });

  it('report répété tant qu’il le faut', () => {
    const r = congeDateEffet({ finIso: '2020-06-30', preavisMois: 3, cycleMois: 12, todayIso: '2026-09-23' });
    expect(r.pushed).toBe(true);
    expect(r.finIso >= '2027-01-01').toBe(true);
  });

  it('la limite se calcule au dernier jour du mois, pas en débordant sur le suivant', () => {
    // 6 mois avant le 31 décembre, c'est le 30 juin — pas le 1er juillet. Délivré le 1er juillet,
    // le congé pour le 31 décembre est tardif, donc nul : il DOIT être reporté.
    expect(congeDateEffet({ finIso: '2026-12-31', preavisMois: 6, cycleMois: 36, todayIso: '2026-07-01' }).pushed)
      .toBe(true);
    // Délivré le 30 juin, il tient encore.
    expect(congeDateEffet({ finIso: '2026-12-31', preavisMois: 6, cycleMois: 36, todayIso: '2026-06-30' }).pushed)
      .toBe(false);
  });

  it('données inexploitables → pas de date inventée, pas de boucle', () => {
    expect(congeDateEffet({ finIso: '', preavisMois: 6, cycleMois: 36, todayIso: '2026-09-23' }).finIso).toBe('');
    expect(congeDateEffet({ finIso: '2026-12-31', todayIso: '' }).finIso).toBe('');
    expect(congeDateEffet()).toEqual({ finIso: '', pushed: false });
    // Un cycle absurde ne doit pas figer l'onglet.
    expect(congeDateEffet({ finIso: '2000-01-31', preavisMois: 6, cycleMois: 0, todayIso: '2026-09-23' }).pushed)
      .toBe(true);
  });
});

describe('congeMentionPreavis — une phrase, deux chemins', () => {
  it('annonce le délai ET que la date d’effet a été fixée pour le respecter', () => {
    const s = congeMentionPreavis(6);
    expect(s).toContain('6 mois');
    expect(s).toContain('fixée pour le respecter');
  });
});
