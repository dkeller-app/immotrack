// __tests__/helpers/pdf-flow.test.js
// « Les paraphes sont sur le texte » (retour smoke 13/08, capture user).
//
// PREUVE (PDF re-généré, détecteur de débordement sous la marge basse de 272 mm) :
//   page 1 : RECT top=272.9 bas=279.9 mm x=15 w=70  ← ligne de tableau DANS la bande du pied
//            TXT  y=277.4 mm « Type d'habitat »      ← à la hauteur de « Paraphe bailleur »
//   page 5 : TXT  y=272.2 mm « Persiennes métalliques » + 14 autres
// Le pied (filet à 275 mm, cases de paraphe à 279,5 mm) est dessiné APRÈS coup sur chaque page,
// à position fixe : tout contenu qui descend sous 272 mm se retrouve donc SOUS les paraphes.
//
// Deux causes, indépendantes :
//   1. drawTable délègue à autoTable SANS marge basse → autoTable paginait dans la bande du pied ;
//   2. drawText écrit TOUTES les lignes d'un bloc en un seul appel pdf.text, sans jamais couper :
//      la boucle ne réserve que 15 mm avant le bloc, donc tout paragraphe plus haut déborde.
//
// Ce module porte l'arithmétique de la cause 2, seule partie extractible et donc testable.

import { describe, it, expect } from 'vitest';
import {
  bodyBottom, splitBlockAcrossPages, PDF_BODY, pageKinds, SECTIONS_SANS_PARAPHE,
  sectionKindFromTitle, titreSansParaphe
} from './pdf-flow.js';

describe('sectionKindFromTitle — UNE seule liste de titres pour le PDF et pour l\'écran', () => {
  // Le 13/08, cette liste existait EN DOUBLE dans index.html : le pré-scan du PDF et le
  // découpage de l'aperçu HTML. Corriger l'une sans l'autre laissait les annexes non
  // paraphées à l'écran alors qu'elles l'étaient dans le PDF.
  it('reconnaît les titres réels du bail', () => {
    expect(sectionKindFromTitle('18 — SIGNATURES')).toBe('signatures');
    expect(sectionKindFromTitle('ANNEXE A — LISTE DES RÉPARATIONS LOCATIVES')).toBe('annexe-a');
    expect(sectionKindFromTitle('ANNEXE B — LISTE DES CHARGES RÉCUPÉRABLES')).toBe('annexe-b');
    expect(sectionKindFromTitle('Notice d\'information (arrêté du 29 mai 2015)')).toBe('notice');
  });

  it('détecte la page Signatures par le MOT, quel que soit le numéro (garage §16)', () => {
    // CHANTIER BAIL-GARAGE : le bail garage numérote signatures §16 (moins de sections).
    // La détection doit tenir sur le mot, pas sur « 18 ».
    expect(sectionKindFromTitle('16 — Signatures')).toBe('signatures');
    expect(sectionKindFromTitle('16 — SIGNATURES')).toBe('signatures');
    expect(sectionKindFromTitle('Signatures')).toBe('signatures');
    expect(titreSansParaphe('16 — Signatures')).toBe(true);
  });

  it('ne confond pas un article numéroté avec la page Signatures', () => {
    expect(sectionKindFromTitle('1 — DÉSIGNATION DU LOGEMENT')).toBeNull();
    expect(sectionKindFromTitle('8 — OBLIGATIONS DU BAILLEUR')).toBeNull();
    expect(sectionKindFromTitle('18.2 — Autre chose')).toBeNull();
    expect(sectionKindFromTitle('15 — Dispositions diverses')).toBeNull();
  });

  it('DÉCISION USER 13/08 : §18, annexes et notice sans paraphe — le corps du bail en porte', () => {
    expect(titreSansParaphe('18 — SIGNATURES')).toBe(true);
    expect(titreSansParaphe('ANNEXE A — LISTE DES RÉPARATIONS LOCATIVES')).toBe(true);
    expect(titreSansParaphe('ANNEXE B — LISTE DES CHARGES RÉCUPÉRABLES')).toBe(true);
    expect(titreSansParaphe('Notice d\'information')).toBe(true);
    expect(titreSansParaphe('1 — DÉSIGNATION DU LOGEMENT')).toBe(false);
    expect(titreSansParaphe('17 — PIÈCES ANNEXÉES')).toBe(false);   // clause du bail, pas une annexe
  });
});

const OPTS = { pageH: 297, marginTop: 15, marginBottom: 25 };

describe('bodyBottom — la limite que rien ne doit franchir', () => {
  it('vaut hauteur de page moins marge basse (272 mm en A4)', () => {
    expect(bodyBottom(OPTS)).toBe(272);
  });
  it('reste sous le filet du pied de page (275 mm) et sous les cases de paraphe (279,5 mm)', () => {
    expect(bodyBottom(OPTS)).toBeLessThan(PDF_BODY.FOOT_LINE_Y);
    expect(bodyBottom(OPTS)).toBeLessThan(PDF_BODY.PARAPHE_BOX_Y);
  });
});

describe('pageKinds — quelles pages portent une case de paraphe', () => {
  // Bail réel « 102 » : 26 pages, §18 en page 13, annexe A en 14, annexe B en 20, notice en 23.
  const REEL = { signatures: 13, 'annexe-a': 14, 'annexe-b': 20, notice: 23 };

  it('DÉCISION USER 13/08 : §18, annexes et notice sans paraphe (13 → 26)', () => {
    const k = pageKinds(26, REEL);
    for (const p of [13, 14, 19, 20, 22, 23, 26]) expect(k[p - 1].noParaphe).toBe(true);
    expect(k.filter(x => x.noParaphe)).toHaveLength(14);
  });

  it('la page §18 est SANS paraphe : on y signe, on n\'y paraphe pas', () => {
    const k = pageKinds(26, REEL);
    expect(k[12]).toEqual({ page: 13, kind: 'signatures', noParaphe: true });
  });

  it('les pages du corps, avant toute section, sont à parapher', () => {
    const k = pageKinds(26, REEL);
    for (let p = 1; p <= 12; p++) expect(k[p - 1]).toEqual({ page: p, kind: 'paraphe', noParaphe: false });
  });

  it('chaque section couvre jusqu\'à la suivante', () => {
    const k = pageKinds(26, REEL);
    expect(k[13].kind).toBe('annexe-a');    // page 14
    expect(k[18].kind).toBe('annexe-a');    // page 19, continuation sans titre répété
    expect(k[19].kind).toBe('annexe-b');    // page 20
    expect(k[25].kind).toBe('notice');      // page 26
  });

  it('les pages AVANT le §18 restent paraphées, celles d\'après ne le sont plus', () => {
    const k = pageKinds(20, { signatures: 13, 'annexe-a': 15 });
    expect(k[11].noParaphe).toBe(false);    // page 12 : corps du bail
    expect(k[12].noParaphe).toBe(true);     // page 13 : §18
    expect(k[13].noParaphe).toBe(true);     // page 14 : §18 qui déborde
    expect(k[14].kind).toBe('annexe-a');    // page 15 : annexe A, sans paraphe elle aussi
    expect(k[14].noParaphe).toBe(true);
  });

  it('une section NON listée resterait paraphée (la règle porte sur la liste, pas sur « après le §18 »)', () => {
    const k = pageKinds(6, { signatures: 3, 'annexe-a': 5 }, ['signatures']);
    expect(k[2].noParaphe).toBe(true);      // §18
    expect(k[4].noParaphe).toBe(false);     // annexe A, exclue de la liste passée
  });

  it('document sans aucune section : tout est à parapher', () => {
    expect(pageKinds(3, {}).every(x => !x.noParaphe && x.kind === 'paraphe')).toBe(true);
  });

  it('la liste des sections sans paraphe : §18 + les 3 documents réglementaires annexés', () => {
    expect(SECTIONS_SANS_PARAPHE).toEqual(['signatures', 'annexe-a', 'annexe-b', 'notice']);
  });
});

describe('splitBlockAcrossPages — couper un bloc de texte au bon endroit', () => {
  it('ne coupe pas un bloc qui tient', () => {
    const c = splitBlockAcrossPages(100, 5, 4, OPTS);
    expect(c).toEqual([{ page: 0, y: 100, from: 0, to: 5 }]);
  });

  it('RÉGRESSION : coupe le bloc qui déborderait sous 272 mm', () => {
    // 10 lignes de 4 mm à partir de 260 → 300 mm sans coupure : 3 lignes tiennent, 7 passent à la page suivante.
    const c = splitBlockAcrossPages(260, 10, 4, OPTS);
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual({ page: 0, y: 260, from: 0, to: 3 });
    expect(c[1]).toEqual({ page: 1, y: 15, from: 3, to: 10 });
  });

  it('aucune ligne ne dépasse jamais la limite, quel que soit le point de départ', () => {
    for (let y = 15; y <= 271; y += 1) {
      for (const n of [1, 3, 12, 60]) {
        for (const c of splitBlockAcrossPages(y, n, 4, OPTS)) {
          expect(c.y + (c.to - c.from) * 4).toBeLessThanOrEqual(bodyBottom(OPTS) + 1e-9);
        }
      }
    }
  });

  it('bascule directement à la page suivante si plus rien ne tient', () => {
    const c = splitBlockAcrossPages(271, 4, 4, OPTS);
    expect(c).toEqual([{ page: 1, y: 15, from: 0, to: 4 }]);
  });

  it('étale un bloc plus haut qu\'une page sur autant de pages que nécessaire', () => {
    const c = splitBlockAcrossPages(15, 200, 4, OPTS);          // 800 mm de texte
    expect(c.length).toBeGreaterThan(2);
    expect(c[0].from).toBe(0);
    expect(c[c.length - 1].to).toBe(200);
    // continuité : aucune ligne perdue ni dupliquée
    for (let i = 1; i < c.length; i++) expect(c[i].from).toBe(c[i - 1].to);
  });

  it('ne boucle pas à l\'infini si une ligne est plus haute qu\'une page entière', () => {
    const c = splitBlockAcrossPages(15, 3, 500, OPTS);
    expect(c).toHaveLength(3);
    for (const x of c) expect(x.to - x.from).toBe(1);
  });

  it('tolère les entrées dégénérées (0 ligne, hauteur nulle)', () => {
    expect(splitBlockAcrossPages(100, 0, 4, OPTS)).toEqual([]);
    expect(splitBlockAcrossPages(100, 2, 0, OPTS)).toEqual([{ page: 0, y: 100, from: 0, to: 2 }]);
  });

  it('est PUR et autonome (injectable tel quel dans la popup de signature)', () => {
    expect(splitBlockAcrossPages.toString()).not.toMatch(/\b(require|import)\b/);
  });
});
