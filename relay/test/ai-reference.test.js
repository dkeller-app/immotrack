// Mesure de qualité sur le jeu de RÉFÉRENCE (cuisine du 12/10). Avec le fournisseur SIMULÉ, ces
// chiffres valident la chaîne (validation, garde-fous, mesure) — pas la qualité d'un modèle. La mesure
// réelle se fait avec la clé : `node scripts/eval-edl.mjs` (cf. en-tête du script).
import { describe, it, expect } from 'vitest';
import { makeAiProvider } from '../src/ai/provider.js';
import * as T from '../src/ai/tasks/edl-piece.js';
import { mesurerEdl } from '../src/ai/eval-edl.js';
import { CUISINE_INPUT, CUISINE_ATTENDU } from './fixtures/edl-cuisine.js';

describe('jeu de référence — cuisine (fournisseur simulé)', () => {
  it('chaîne complète : structuration → validation → mesure', async () => {
    const input = T.validerEntree(CUISINE_INPUT).input;
    const r = await makeAiProvider({ AI_PROVIDER: 'fake' }).structurer({ tache: 'edl-piece', input });
    const v = T.validerSortie(r.data, input);
    expect(v.ok).toBe(true);
    expect(v.rejets).toBe(0);                       // tout extrait cité figure dans la transcription
    const m = mesurerEdl(v.data, CUISINE_ATTENDU);
    console.log('[mesure-simule]', JSON.stringify(m));
    expect(m.nonCitesTouches).toBe(0);              // invariant : aucun élément non cité touché
    expect(m.elementsPrecision).toBe(1);
    expect(m.elementsRappel).toBeGreaterThanOrEqual(0.9);
    expect(m.etatsJustes).toBeGreaterThanOrEqual(0.9);
    expect(m.correctionsTrouvees).toBeGreaterThanOrEqual(0.75);
  });

  it('la mesure détecte une sortie mauvaise (élément non cité touché, état inventé)', () => {
    const m = mesurerEdl({ propositions: [
      { elementId: '2', etat: 'Bon état', observation: 'Murs propres.' },      // Murs : non cités
      { elementId: '7', etat: 'Bon état', observation: 'Évier.' },             // état faux
    ], corrections: [] }, CUISINE_ATTENDU);
    expect(m.nonCitesTouches).toBe(1);
    expect(m.etatsJustes).toBe(0);
    expect(m.detail.etatsFaux).toEqual(['Évier']);
  });
});
