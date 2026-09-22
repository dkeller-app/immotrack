/**
 * F-7 — LE CÂBLAGE. C'est son absence qui a laissé passer le défaut.
 *
 * Le lot a remplacé `{{rappel1Date}}` / `{{rappel2Date}}` par `{{phraseRelances}}` dans le modèle
 * de mise en demeure, et a câblé DEUX chemins. Il y en avait TROIS : le Hub Communications
 * continuait de poser les anciens jetons, si bien que l'acte s'ouvrait sur « (inconnu) votre
 * loyer… ». Une régression, exactement là où le lot prétendait corriger.
 *
 * Aucun test ne pouvait l'attraper : les 14 tests portaient sur la logique du module, aucun sur
 * le câblage. Le dépôt a pourtant le précédent (`actes-mentions-cablage.test.js`), dont l'en-tête
 * dit : « Un module testé qui n'est appelé nulle part ne protège personne ».
 *
 * Ces tests lisent la source d'`index.html` et de `js/core/email-compose.js`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { phraseRelances } from '../../js/core/email-compose.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html, compose;
beforeAll(() => {
  html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, '');
  compose = readFileSync(resolve(repoRoot, 'js/core/email-compose.js'), 'utf8').replace(/\r/g, '');
});
const codeSeul = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('Le modèle et ses fournisseurs ne peuvent pas se désaccorder', () => {
  it('le modèle de mise en demeure demande `phraseRelances`, et plus les anciens jetons', () => {
    // Sur le CODE : les commentaires citent légitimement les anciens jetons pour expliquer
    // le défaut corrigé. Un test qui les compte rougirait sur de la prose.
    const c = codeSeul(compose);
    expect(c).toContain('{{phraseRelances}}');
    expect(c, 'un ancien jeton est revenu dans un modèle').not.toContain('{{rappel1Date}}');
    expect(c, 'un ancien jeton est revenu dans un modèle').not.toContain('{{rappel2Date}}');
  });

  it('plus aucun site d’index.html ne fabrique les anciens jetons', () => {
    // C'est CE test qui aurait attrapé le chemin Hub oublié : il posait encore
    // `extra.rappel1Date` alors que plus personne ne le consommait.
    const code = codeSeul(html);
    expect(code, 'un site fabrique encore rappel1Date').not.toMatch(/rappel1Date\s*[:=]/);
    expect(code, 'un site fabrique encore rappel2Date').not.toMatch(/rappel2Date\s*[:=]/);
  });

  it('CHACUN des trois chemins fournit `phraseRelances`', () => {
    // Compter les occurrences ne suffit PAS : chaque site en produit plusieurs (la clé, le
    // `typeof window.…`, le repli), si bien qu'un chemin entier pouvait disparaître sans faire
    // bouger le total. Vérifié par mutation. On nomme donc les trois fonctions.
    const code = codeSeul(html);
    const corpsDe = (nom) => {
      const i = code.indexOf('function ' + nom + '(');
      return i === -1 ? null : code.slice(i, code.indexOf('\n}', i) + 2);
    };
    for (const nom of ['_congeExtra', '_quittanceActionEmail', '_buildEmailCtxFromRef']) {
      const corps = corpsDe(nom);
      expect(corps, nom + ' introuvable — le test ne teste plus rien').toBeTruthy();
      expect(corps, nom + ' ne fournit pas la phrase d’ouverture').toContain('phraseRelances');
    }
  });

  it('l’historique n’est lu QU’À UN endroit', () => {
    const code = codeSeul(html);
    const decl = (code.match(/function\s+_relancesEnvoyees\s*\(/g) || []).length;
    expect(decl, 'deux lectures de l’historique = deux vérités').toBe(1);
    // Et personne ne refiltre `DB.emailsSent` sur les types de rappel dans son coin.
    const filtresParalleles = (code.match(/rappel-impaye-\[12\]|rappel-impaye-1['"]\s*\)/g) || []).length;
    expect(filtresParalleles).toBeLessThanOrEqual(1);
  });
});

describe('Le filtre de l’historique distingue un envoi d’une copie', () => {
  it('`copied` est explicitement exclu du code, pas seulement du commentaire', () => {
    const f = codeSeul(html).slice(codeSeul(html).indexOf('function _relancesEnvoyees'));
    const corps = f.slice(0, f.indexOf('\n}'));
    expect(corps).toMatch(/sent\s*:/);
    expect(corps).toMatch(/mailto\s*:/);
    expect(corps, 'copier un rappel n’est pas l’envoyer').not.toMatch(/copied\s*:\s*1/);
  });

  it('une seule date par rappel : la déduplication est dans le code', () => {
    const f = codeSeul(html).slice(codeSeul(html).indexOf('function _relancesEnvoyees'));
    const corps = f.slice(0, f.indexOf('\n}'));
    expect(corps, 'sans regroupement par type, deux traces du même rappel donnent deux dates')
      .toMatch(/parType/);
  });
});

describe('phraseRelances — rappel des invariants que le câblage doit préserver', () => {
  it('ne rend jamais une chaîne vide, quelle que soit l’entrée', () => {
    for (const e of [undefined, null, [], [''], ['  ', null]]) {
      expect(phraseRelances(e).length, JSON.stringify(e)).toBeGreaterThan(0);
    }
  });
  it('sans relance, n’en invente aucune', () => {
    expect(phraseRelances([])).not.toMatch(/relance/i);
  });
});
