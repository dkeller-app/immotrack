/**
 * CDC-LOYERS-DESIGN — L'ÉDITEUR DE QUITTANCE (V6/V7/V8/V9/V10/V11/V12).
 *
 * Ce qui se joue ici : la règle « l'app prévient mais ne bloque pas ». Didier a rejeté
 * explicitement l'inverse (« tu arrêtes de bloquer les quittances ! là je peux rien faire ! »),
 * et le CDC abroge la décision D6 du CDC-QUITTANCES-IRL (« quittance seulement si le mois est
 * soldé »). Ces tests vérifient donc DEUX choses à chaque fois : que l'avertissement est là,
 * ET que le geste reste possible.
 */
import { describe, it, expect } from 'vitest';
import { etatMoisLot } from '../../js/core/loyers-mois.js';
import {
  MOIS_ETAT, moisRailLot, moisParDefaut, anneeParDefaut, anneesDisponibles,
  verdictEmission, etiquetteSansPaiement, validerSaisieLibre, lotSuivant, cleMeta
} from '../../js/core/quittance-editeur.js';

/** Un lot loué de janvier à juin 2026, 500 HC + 100 CH. */
const mois = (ym, received, sources) => ({ ym, hcDue: 500, chDue: 100, received, sources });
const S = (date, montant) => [{ date, id: 'v' + date, montant }];

const etatBase = () => etatMoisLot([
  mois('2026-01', 600, S('2026-01-05', 600)),
  mois('2026-02', 600, S('2026-02-05', 600)),
  mois('2026-03', 0),                                  // non payé
  mois('2026-04', 300, S('2026-04-05', 300)),          // partiel
  mois('2026-05', 600, S('2026-05-05', 600)),
  mois('2026-06', 1200, S('2026-06-05', 1200))         // paie juin + une avance
]);

describe('V6 — le rail des mois : douze cases, chacune dit son état', () => {
  const etat = etatBase();
  const rail = moisRailLot(etat, ['2026-01'], 2026, '2026-06', { '2026-01': '2026-02-03' });

  it('les douze mois de l\'année sont présents, même hors bail', () => {
    expect(rail.length).toBe(12);
    expect(rail[11].etat).toBe(MOIS_ETAT.OFF);   // décembre : pas de bail
  });
  it('un mois déjà quittancé se rouvre — c\'est ça, rééditer', () => {
    expect(rail[0].etat).toBe(MOIS_ETAT.DONE);
    expect(rail[0].editeeLe).toBe('2026-02-03');
  });
  it('un mois soldé non quittancé est proposé', () => {
    expect(rail[1].etat).toBe(MOIS_ETAT.OK);
  });
  it('un mois non payé et un mois partiel affichent ce qui reste APRÈS la cascade', () => {
    // Les 300 € d'avril et l'excédent de juin remontent en FIFO sur les manques antérieurs :
    // le rail montre ce qui reste RÉELLEMENT dû, pas le manque brut du mois. C'est la cascade
    // unique qui décide — l'éditeur ne recalcule rien.
    expect(rail[2].etat).toBe(MOIS_ETAT.NO);
    expect(rail[2].reste).toBe(100);
    expect(rail[3].etat).toBe(MOIS_ETAT.NO);
    expect(rail[3].reste).toBe(200);
  });
  it('le mois pré-coché est le PLUS ANCIEN mois soldé non quittancé', () => {
    expect(moisParDefaut(rail)).toBe('2026-02');
  });
  it('l\'année ouverte est l\'année COURANTE dès qu\'elle a quelque chose', () => {
    expect(anneeParDefaut(etat, ['2026-01'], '2026-06')).toBe('2026');
    expect(anneesDisponibles(etat, ['2024-11'])).toEqual(['2024', '2026']);
  });
  it('on n\'ouvre PAS sur une vieille année sous prétexte qu\'un mois n\'a jamais été quittancé', () => {
    // Bail ancien, jamais quittancé : le geste de tous les jours porte sur le mois en cours.
    const vieux = etatMoisLot([
      mois('2021-01', 0), mois('2021-02', 0),
      mois('2026-05', 600, S('2026-05-05', 600)), mois('2026-06', 600, S('2026-06-05', 600))
    ]);
    expect(anneeParDefaut(vieux, [], '2026-06')).toBe('2026');
  });
  it('bail terminé : on ouvre sur l\'année utile la plus récente', () => {
    const fini = etatMoisLot([mois('2023-04', 600, S('2023-04-05', 600))]);
    expect(anneeParDefaut(fini, [], '2026-06')).toBe('2023');
  });
});

describe('V8 — le critère est PAYÉ, pas ÉCHU', () => {
  it('un mois FUTUR couvert par une avance est proposable comme les autres', () => {
    const etat = etatMoisLot([
      mois('2026-06', 1800, S('2026-06-03', 1800)),
      mois('2026-07', 0), mois('2026-08', 0)
    ]);
    const rail = moisRailLot(etat, [], 2026, '2026-06');
    expect(rail[6].etat).toBe(MOIS_ETAT.OK);   // juillet, futur mais payé
    expect(rail[7].etat).toBe(MOIS_ETAT.OK);   // août, idem
  });
  it('un mois futur NON couvert retombe dans le garde-fou V7, pas dans une catégorie à part', () => {
    const etat = etatMoisLot([mois('2026-06', 600, S('2026-06-03', 600)), mois('2026-07', 0)]);
    const rail = moisRailLot(etat, [], 2026, '2026-06');
    expect(rail[6].etat).toBe(MOIS_ETAT.FUT);
    const v = verdictEmission(rail, ['2026-07']);
    expect(v.risques.length).toBe(1);
    expect(v.confirmationRequise).toBe(true);
  });
});

describe('V7 — un mois non soldé : on avertit, on NE BLOQUE PAS', () => {
  const etat = etatBase();
  const rail = moisRailLot(etat, [], 2026, '2026-06');

  it('le mois non soldé reste sélectionnable et produit bien un document', () => {
    const v = verdictEmission(rail, ['2026-03']);
    expect(v.nbDocs).toBe(1);                   // le geste passe
    expect(v.total).toBe(600);
  });
  it('l\'avertissement nomme les mois et le reste dû', () => {
    const v = verdictEmission(rail, ['2026-03', '2026-04']);
    expect(v.risques.map((m) => m.ym)).toEqual(['2026-03', '2026-04']);
    expect(v.resteTotal).toBe(300);
  });
  it('une confirmation explicite est exigée — et c\'est le SEUL frein', () => {
    const v = verdictEmission(rail, ['2026-03']);
    expect(v.confirmationRequise).toBe(true);
    expect(v).not.toHaveProperty('bloquant');
    expect(v).not.toHaveProperty('interdit');
  });
  it('sur des mois soldés, aucune confirmation n\'est demandée', () => {
    const v = verdictEmission(rail, ['2026-01', '2026-02']);
    expect(v.confirmationRequise).toBe(false);
    expect(v.nbDocs).toBe(2);
  });
  it('I7 — N mois cochés = N documents, jamais un document « mars à mai »', () => {
    const v = verdictEmission(rail, ['2026-01', '2026-02', '2026-05']);
    expect(v.nbDocs).toBe(3);
  });
  it('rééditer un mois déjà quittancé est signalé, jamais empêché', () => {
    const r2 = moisRailLot(etat, ['2026-01'], 2026, '2026-06', { '2026-01': '2026-02-03' });
    const v = verdictEmission(r2, ['2026-01']);
    expect(v.reedits.length).toBe(1);
    expect(v.nbDocs).toBe(1);
    expect(v.confirmationRequise).toBe(false);   // rééditer n'engage rien de neuf
  });
});

describe('V9 — l\'étiquette « sans paiement constaté » vit DANS L\'APP', () => {
  it('elle porte qui a confirmé et quand — utile au partage SCI', () => {
    const e = etiquetteSansPaiement({ forceePar: 'Didier', forceeLe: '2026-08-19' });
    expect(e.visible).toBe(true);
    expect(e.libelle).toBe('sans paiement constaté');
    expect(e.survol).toContain('Didier');
    expect(e.survol).toContain('2026-08-19');
  });
  it('sans trace de geste forcé, aucune étiquette', () => {
    expect(etiquetteSansPaiement(null).visible).toBe(false);
    expect(etiquetteSansPaiement({}).visible).toBe(false);
  });
  it('la clé de trace identifie un couple (lot, mois)', () => {
    expect(cleMeta('FERR-001', '2026-03')).toBe('FERR-001|2026-03');
  });
});

describe('V11/V12 — la saisie libre', () => {
  it('elle exige le minimum qui fait une quittance, et dit ce qui manque', () => {
    const r = validerSaisieLibre({ bailleurNom: 'SCI X', hc: 0, ch: 0 });
    expect(r.valide).toBe(false);
    expect(r.manquants).toContain('le nom du locataire');
    expect(r.manquants).toContain('un montant');
  });
  it('complète, elle est normalisée et marquée « libre »', () => {
    const r = validerSaisieLibre({
      bailleurNom: 'SCI X', locataireNom: 'Mme Y', adresse: '1 rue Z',
      debut: '2025-11-01', fin: '2025-11-30', hc: 650, ch: 80
    });
    expect(r.valide).toBe(true);
    expect(r.normalisee.libre).toBe(true);
    expect(r.normalisee.total).toBe(730);
  });
  it('la date de paiement est FACULTATIVE et vide par défaut : sans elle, la ligne ne sort pas', () => {
    const r = validerSaisieLibre({
      bailleurNom: 'A', locataireNom: 'B', adresse: 'C', debut: '2025-11-01', fin: '2025-11-30', hc: 100
    });
    expect(r.normalisee.datePaiement).toBeNull();
  });
});

describe('V6 — l\'enchaînement « lot suivant » quand on entre par la porte globale', () => {
  const pile = [{ ref: 'A-01', nb: 1 }, { ref: 'B-02', nb: 3 }, { ref: 'C-03', nb: 1 }];
  it('passe au lot suivant de la pile', () => {
    expect(lotSuivant(pile, 'A-01').ref).toBe('B-02');
    expect(lotSuivant(pile, 'B-02').ref).toBe('C-03');
  });
  it('au dernier lot, il n\'y a plus de suivant — la tournée est finie', () => {
    expect(lotSuivant(pile, 'C-03')).toBeNull();
  });
  it('un lot hors pile ouvre la pile par son début', () => {
    expect(lotSuivant(pile, 'Z-99').ref).toBe('A-01');
    expect(lotSuivant([], 'A-01')).toBeNull();
  });
});
