/**
 * R0-B — le PÉRIMÈTRE de la bulle Impayés, testé en COMPORTEMENT.
 *
 * `r0-source-unique.test.js` épingle la forme du code (« plus de `filter(l => l.locataire)` »).
 * C'est fragile : un `.filter(x => x.locataire)`, un `filter(function(l){…})`, ou le filtre
 * déplacé dans la boucle (`if (!l.locataire) return;`) réintroduiraient EXACTEMENT le défaut en
 * gardant ce test vert. Ici on exécute la fonction.
 *
 * `_computeImpayes` vit dans le monolithe : on l'extrait d'`index.html` et on l'exécute, comme
 * `data-defaults.test.js` le fait pour `_applyDataDefaults`. Les dépendances au moteur sont
 * injectées, parce que ce qu'on teste est le PÉRIMÈTRE — quels lots entrent, lesquels non —
 * pas l'arithmétique du maître, qui a ses propres tests.
 *
 * La question qui a motivé ces cas : en retirant le filtre, est-ce qu'on fait entrer autre chose
 * que le lot visé ? Un lot vacant, un lot d'un autre bailleur, un lot avec un mouvement négatif ?
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

let computeImpayes;
beforeAll(() => {
  const html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');
  const extrait = (nom) => {
    const i = html.indexOf('function ' + nom + '(');
    const j = html.indexOf('\n}', i);
    return (i === -1 || j === -1) ? null : html.slice(i, j + 2);
  };
  const src = extrait('_computeImpayes');
  const srcNoms = extrait('_nomsDuBail');
  if (!src || !srcNoms) throw new Error('_computeImpayes / _nomsDuBail introuvables dans index.html');
  // Le maître est STUBBÉ : on mesure le périmètre, pas le calcul du retard.
  const factory = new Function('DB', '_finMonthly', '_finEntScope', '_finWindows', '_bienActiveBail', 'window',
    `${srcNoms}\n${src}\nreturn _computeImpayes;`);
  computeImpayes = (db, byLot, bailActif) => factory(
    db,
    () => ({ byLot }),
    () => null,
    () => null,
    (ref) => (bailActif || {})[ref] || null,
    { _loyerTodayLocal: () => '2026-09-15' }
  )({ scopeLogs: db.logements, yr: '2026', mo: '', activeEnt: 'SCI T' });
});

const lot = (ref, extra) => ({ ref, entity: 'SCI T', hc: 900, ch: 0, locataire: '', ...(extra || {}) });
const avecRetard = (retard) => ({ annual: { retard, encaisse: 0, duHC: retard, duCH: 0 }, months: [] });

describe('R0-B — ce qui doit ENTRER dans la bulle', () => {
  it('LE CAS VISÉ : bail actif, cache vide, rien encaissé → l’impayé est visible', () => {
    const r = computeImpayes(
      { logements: [lot('F-012')], baux_historique: [] },
      { 'F-012': avecRetard(8100) },
      { 'F-012': { ref: 'F-012', locataires: [{ nom: 'DUPONT Marc' }] } }
    );
    expect(r.count).toBe(1);
    expect(r.totalDue).toBe(8100);
    expect(r.items[0].locataire, 'une créance anonyme est inexploitable').toBe('DUPONT Marc');
  });

  it('LOCATAIRE PARTI en devant de l’argent : le nom vient de l’historique', () => {
    // La clôture vide `log.locataire` ET retire le bail des actifs : les deux sources se
    // taisent en même temps. Sans l’historique, la ligne s’afficherait sans nom.
    const r = computeImpayes(
      { logements: [lot('F-020')],
        baux_historique: [{ ref: 'F-020', finEffective: '2026-06-30', locataires: [{ nom: 'MARTIN Léa' }] }] },
      { 'F-020': avecRetard(2400) }, {}
    );
    expect(r.count).toBe(1);
    expect(r.items[0].locataire).toBe('MARTIN Léa');
  });

  it('plusieurs baux archivés : on prend le DERNIER parti', () => {
    const r = computeImpayes(
      { logements: [lot('F-021')],
        baux_historique: [
          { ref: 'F-021', finEffective: '2024-03-31', locataires: [{ nom: 'ANCIEN' }] },
          { ref: 'F-021', finEffective: '2026-06-30', locataires: [{ nom: 'RECENT' }] }
        ] },
      { 'F-021': avecRetard(1200) }, {}
    );
    expect(r.items[0].locataire).toBe('RECENT');
  });
});

describe('R0-B — ce qui NE doit PAS entrer', () => {
  it('lot sans entrée au moteur : ignoré', () => {
    const r = computeImpayes({ logements: [lot('V-9')], baux_historique: [] }, {}, {});
    expect(r.count).toBe(0);
    expect(r.totalDue).toBe(0);
  });

  it('lot présent au moteur mais SANS retard : ignoré', () => {
    const r = computeImpayes({ logements: [lot('V-9')], baux_historique: [] }, { 'V-9': avecRetard(0) }, {});
    expect(r.count).toBe(0);
  });

  it('retard NÉGATIF (locataire en avance) : ignoré, jamais compté en impayé', () => {
    const r = computeImpayes({ logements: [lot('F-3')], baux_historique: [] }, { 'F-3': avecRetard(-500) }, {});
    expect(r.count).toBe(0);
    expect(r.totalDue).toBe(0);
  });

  it('résidu sous le seuil du maître (0,50 €) : ignoré', () => {
    const r = computeImpayes({ logements: [lot('F-4')], baux_historique: [] }, { 'F-4': avecRetard(0.4) }, {});
    expect(r.count).toBe(0);
  });

  it('lot d’un AUTRE bailleur présent dans byLot : hors périmètre', () => {
    // `scopeLogs` borne en amont — le moteur peut porter plus de lots que la vue courante.
    const r = computeImpayes(
      { logements: [lot('F-1')], baux_historique: [] },
      { 'F-1': avecRetard(900), 'AUTRE': avecRetard(50000) }, {}
    );
    expect(r.count).toBe(1);
    expect(r.totalDue, 'un lot hors périmètre a gonflé le total').toBe(900);
  });
});

describe('R0-B — le total reste celui du maître', () => {
  it('plusieurs lots : somme exacte, sans arrondi parasite', () => {
    const r = computeImpayes(
      { logements: [lot('A'), lot('B'), lot('C')], baux_historique: [] },
      { A: avecRetard(1200.5), B: avecRetard(300.25), C: avecRetard(0) }, {}
    );
    expect(r.count).toBe(2);
    expect(r.totalDue).toBe(1500.75);
  });
});
