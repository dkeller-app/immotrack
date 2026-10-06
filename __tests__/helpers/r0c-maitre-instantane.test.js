import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculerInstantane, SEEDS_INSTANTANE } from './r0c-maitre-instantane.js';

/**
 * R0-C lot 1 — NON-RÉGRESSION DU MAÎTRE. La fixture a été écrite sur le moteur de base
 * (8bdd5d86) AVANT la moindre modification : 30 jeux multi-lots / multi-baux × 4 exercices ×
 * 3 variantes (fenêtre de constat, fenêtre numérique, périmètre pondéré SCI).
 *
 * Le lot 1 étend le module (dette bornée au bail, option `debutDu`, collecteur de loyers partagé)
 * mais, sans l'option, le P&L, le retard, l'ouverture N-1 et le détail par lot doivent rester
 * identiques À L'OCTET (empreinte sha256 de la sortie complète).
 */
const AVANT = JSON.parse(readFileSync(new URL('../fixtures/r0c-maitre-avant.json', import.meta.url), 'utf8'));

describe('R0-C lot 1 — le maître ne bouge pas d\'un centime sans l\'option `debutDu`', () => {
  const APRES = calculerInstantane();

  it('la fixture couvre bien 30 jeux × 4 exercices × 3 variantes (sinon le test ne mesure rien)', () => {
    expect(Object.keys(AVANT).map(Number)).toEqual(SEEDS_INSTANTANE);
    const avecRetard = Object.values(AVANT).flatMap((r) => Object.values(r)).filter((e) => e.fenetre.annual.loyerRetard > 0).length;
    expect(avecRetard).toBeGreaterThan(30);   // l'ouverture N-1 et le retard sont réellement exercés
  });

  for (const seed of SEEDS_INSTANTANE) {
    it(`jeu ${seed} : sortie complète identique (P&L, retard, ouverture, byLot)`, () => {
      expect(APRES[seed]).toEqual(AVANT[seed]);
    });
  }
});
