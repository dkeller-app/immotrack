/**
 * La frise d'occupation d'un immeuble — `_renderImmFichePlanGantt`.
 *
 * J'y ai livré un `ReferenceError` EN PRODUCTION : la boucle est `activeLogs.forEach(log => …)`
 * et j'avais écrit `l.ref`. Rien ne l'a vu, parce que la branche fautive est gardée par
 * `typeof loyerDuLotA === 'function'` — faux en mode `file://` et dans un test Node naïf. Le
 * défaut n'existait QUE dans l'app déployée, la seule où `js/main.js` pose `window.loyerDuLotA`.
 *
 * Ces tests exécutent donc la fonction AVEC le lecteur présent. Sans cette condition, ils ne
 * prouveraient rien.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loyerDuLotA } from '../../js/core/legal-bilan.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

const corpsDe = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  if (i === -1) return null;
  const j = html.indexOf('\n}', i);
  return j === -1 ? null : html.slice(i, j + 2);
};

/** Exécute la frise avec ses dépendances, `loyerDuLotA` COMPRIS. */
function frise(db, activeLogs, avecLecteur = true) {
  const src = [corpsDe('_renderImmFichePlanGantt'), corpsDe('_ctxLoyerLot'), corpsDe('_getAllBailsForLog')].join('\n');
  if (!corpsDe('_renderImmFichePlanGantt')) throw new Error('frise introuvable — le test ne teste plus rien');
  const esc = (x) => String(x == null ? '' : x);
  const deps = {
    DB: db,
    loyerDuLotA: avecLecteur ? loyerDuLotA : undefined,
    _findBailByRefTolerant: (ref) => (db.baux || {})[ref] || null,
    _monthsBetweenIso: (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 2629800000)),
    _daysBetweenIso: (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)),
    _bailEcheanceEffective: () => null,
    _bailPreavisInfo: () => null,
    _ganttHighlight: () => '',
    _immFicheNewLog: () => {},
    _lyQ: esc,
    fd: (iso) => String(iso || '').slice(0, 10),
    min: Math.min,
    _tenantColor: () => '#000',
    _tenantColorLight: () => '#fff',
    _uiIcon: () => '',
    escHtml: esc,
    fmt: (n) => String(Math.round(n || 0)) + ' €',
    fmtN: (n) => String(Math.round(n || 0)),
    openLogFiche: () => {},
    _isAlive: (x) => !!x && !x._deleted,
    _DMC: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'],
    go: () => {},
    _immVueFrise: true
  };
  const noms = Object.keys(deps);
  const f = new Function(...noms, src + '\nreturn _renderImmFichePlanGantt;');
  // Signature réelle : (ent, im, activeLogs). Les intervertir renvoyait l'état vide « pas encore
  // de logement » — et le test passait sans jamais entrer dans la fonction.
  return f(...noms.map((n) => deps[n]))({ nom: 'SCI Test' }, { nom: 'Résidence' }, activeLogs);
}

const LOTS = [{ ref: 'A-1', imm: 'Résidence', hc: 950, ch: 120, loyerHcRef: 950, chargesRef: 120 }];
const DB_VIDE = {
  logements: LOTS,
  baux: {},
  // Un bail terminé + des mois vides dans les 24 derniers : exactement le cas qui plantait.
  baux_historique: [{ ref: 'A-1', debut: '2024-01-01', fin: '2025-06-30', finEffective: '2025-06-30', hc: 800, ch: 90 }],
  loyerBareme: []
};

describe('La frise d’un immeuble ne plante pas quand le lecteur de loyer est présent', () => {
  it('un lot avec des mois vides rend la frise, sans ReferenceError', () => {
    // C'est EXACTEMENT le cas livré cassé : `l is not defined`, sans try/catch, donc la fiche
    // immeuble restait figée — et comme `_immVueFrise` était déjà à true, tout rendu ultérieur
    // relevait. Fiche morte jusqu'au rechargement.
    expect(() => frise(DB_VIDE, LOTS)).not.toThrow();
    const html = frise(DB_VIDE, LOTS);
    // Le rendu doit REELLEMENT contenir le pied de frise : sans cette vérification, un état vide
    // rendu par une mauvaise signature d'appel ferait passer le test sans rien exécuter.
    expect(html, 'la frise n a pas été rendue').toMatch(/manque à gagner/i);
    expect(html).not.toContain('Pas encore de logement');
  });

  it('le même appel SANS le lecteur passe aussi — c’est ce repli qui masquait le défaut', () => {
    expect(() => frise(DB_VIDE, LOTS, false)).not.toThrow();
  });

  it('un immeuble sans aucun lot ne plante pas', () => {
    expect(() => frise({ ...DB_VIDE, logements: [] }, [])).not.toThrow();
  });

  it('un lot sans le moindre bail ne plante pas', () => {
    expect(() => frise({ ...DB_VIDE, baux_historique: [] }, LOTS)).not.toThrow();
  });
});

describe('La frise lit la ref comme le reste de la fiche', () => {
  it('un historique enregistré dans une autre casse reste rattaché', () => {
    // Les deux appels filtraient l'historique en STRICT tout en résolvant le bail courant de
    // façon TOLÉRANTE : sur un lot « B12 » dont l'historique porte « b12 », la lecture perdait
    // ses baux et retombait sur le loyer SOUHAITÉ d'aujourd'hui — I-1 réintroduit par le filtre.
    const ctxSrc = corpsDe('_ctxLoyerLot');
    expect(ctxSrc, '_ctxLoyerLot introuvable').toBeTruthy();
    const f = new Function('DB', '_findBailByRefTolerant',
      ctxSrc + '\nreturn _ctxLoyerLot;')(
      { loyerBareme: [], baux: {}, logements: [{ ref: 'B12', hc: 1100, ch: 150 }],
        baux_historique: [{ ref: 'b12', debut: '2024-01-01', finEffective: '2026-06-30', hc: 800, ch: 90 }] },
      () => null);
    const ctx = f('B12');
    expect(ctx.hists.length, 'l’historique en minuscules est perdu').toBe(1);
    expect(loyerDuLotA('2026-07-01', 'B12', ctx)).toEqual({ hc: 800, ch: 90 });
  });

  it('les deux surfaces passent par ce constructeur, pas par un filtre à elles', () => {
    const sansCommentaires = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const appels = (sansCommentaires.match(/loyerDuLotA\(/g) || []).length;
    const ctx = (sansCommentaires.match(/_ctxLoyerLot\(/g) || []).length;
    expect(appels).toBeGreaterThanOrEqual(2);
    expect(ctx, 'une surface s’est refait son propre contexte').toBeGreaterThanOrEqual(appels);
  });
});
