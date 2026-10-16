// Page de dépôt : saisie des ressources nettes mensuelles (AIDE-DECISION, relecture du 16/10) — la virgule décimale
// n'est plus collée aux euros (« 1 450,50 » valait 145 050), le montant alimente le taux d'effort du propriétaire.
import { describe, it, expect } from 'vitest';
import src from '../public/dossier.js?raw';
const debut = src.indexOf('function parseRevenus(v){');
const fin = src.indexOf('\n}', debut) + 2;
const parseRevenus = new Function(src.slice(debut, fin) + '\nreturn parseRevenus;')();

describe('parseRevenus', () => {
  it.each([
    ['3200', 3200], ['3 200', 3200], ['3 200', 3200], ['3 200 €', 3200],
    ['1450,50', 1451], ['1 450,49 €', 1450], ['1.450', 1450], ['1.450,50', 1451], ['1450.5', 1451]
  ])('%s → %s €', (v, n) => expect(parseRevenus(v)).toBe(n));
  it.each([[''], ['abc'], ['0'], [null], [undefined], ['-'], ['0,4']])('%s → 0 (champ requis)', (v) => expect(parseRevenus(v)).toBe(0));
  it('libellé : ressources nettes mensuelles, allocations comprises', () => {
    expect(src).toContain('Ressources nettes mensuelles, allocations comprises (€)');
  });
});
