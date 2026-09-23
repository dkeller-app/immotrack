/**
 * Le DB VIVANT, pas son miroir — le câblage de `js/main.js` et des modules qui lisent `window.DB`.
 *
 * LE PIÈGE, une deuxième fois. `index.html:4570` déclare `let DB = {}` : une liaison LEXICALE,
 * qui n'est **pas** une propriété de `window`. `window.DB` n'existe que posé par `__immoSetDB`
 * (chemin cloud, après hydratation) et RIEN ne le remet à jour quand `DB` est réassigné
 * (`index.html:5821`, `59053`, `60236`).
 *
 * Donc `window.DB?.irlHistorique` vaut `undefined` en session locale / sandbox, et un
 * historique PÉRIMÉ après un import, une restauration ou une adoption cross-onglet. Le module
 * `_loyerHCAtDate` retombe alors sur `log.hc` — le loyer COURANT, déjà révisé — pour TOUS les
 * mois antérieurs à la révision. Le dû des mois passés est surévalué : impayé fantôme.
 *
 * C'est le mécanisme R0-D, reconduit sur un autre domaine. Le dépôt a déjà le bon geste :
 * `index.html:4573` expose `window.__immoGetDB = () => DB`, et `appDbFrom(window)`
 * (js/core/utils.js) en fait un lecteur testé.
 *
 * Ces tests EXÉCUTENT le câblage réel extrait de `js/main.js` — pas une reconstitution.
 * Une assertion de source seule ne prouverait pas le chiffre.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

import {
  appDbFrom, _loyerHCAtDate, _loyerProrataMois, _loyerProrataMoisSplit
} from '../../js/core/utils.js';
import { _baremeOfLot } from '../../js/core/loyer-du-mois.js';
import { _auditEntry } from '../../js/core/audit-trail.js';
import { _logEmailSent, _getEmailHistory } from '../../js/core/email-compose.js';
import { _calculerDelaiRestitution } from '../../js/core/gestion-dg-impayes.js';
import { _logError, _logEvent } from '../../js/core/monitoring.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let mainJs;
beforeAll(() => { mainJs = readFileSync(resolve(repoRoot, 'js/main.js'), 'utf8').replace(/\r/g, ''); });

/** Le code source EXACT d'un câblage `window.X = …;` de js/main.js (corps de flèche sans `;`). */
function cablage(nom) {
  const i = mainJs.indexOf('\nwindow.' + nom + ' =');
  if (i === -1) return null;
  const j = mainJs.indexOf(';', i);
  return j === -1 ? null : mainJs.slice(i + 1, j + 1);
}

/** Exécute le câblage réel contre un faux `window`, et rend la globale posée. */
function poser(nom, faux) {
  const code = cablage(nom);
  if (!code) throw new Error('câblage de window.' + nom + ' introuvable — ce test ne teste plus rien');
  const bac = {
    window: faux, console,
    appDbFrom, _loyerHCAtDate, _loyerProrataMois, _loyerProrataMoisSplit, _baremeOfLot
  };
  vm.createContext(bac);
  vm.runInContext(code, bac);
  return faux[nom];
}

/** La forme RÉELLE d'une session locale / sandbox : le getter, et AUCUNE propriété `DB`. */
const sessionLocale = (db) => ({ __immoGetDB: () => db });
/** La forme réelle d'une session cloud APRÈS réassignation de `DB` : miroir périmé. */
const miroirPerime = (vivant, perime) => ({ __immoGetDB: () => vivant, DB: perime });

const LOT = { ref: 'F3-FERRETTE', hc: 750, ch: 50 };
// Révision au 1er janvier 2025 : 700 € avant, 750 € après. `log.hc` porte déjà les 750.
const HISTO = [{ ref: 'F3-FERRETTE', ancienHC: 700, nouveauHC: 750, dateRevision: '2025-01-01', dateEffet: '2025-01-01' }];
const BAIL_COURANT = [{ debut: '2020-01-01', fin: '', hc: 750, ch: 50 }];

describe('Le loyer HC d’un mois passé — window._loyerHCAtDate', () => {
  it('en session LOCALE, rend le loyer D’ALORS (700 €), pas celui d’aujourd’hui', () => {
    const f = poser('_loyerHCAtDate', sessionLocale({ irlHistorique: HISTO }));
    expect(f(LOT, '2024-06-01')).toBe(700);
  });

  it('après la date d’effet, rend bien le loyer révisé (la réponse n’est pas figée)', () => {
    const f = poser('_loyerHCAtDate', sessionLocale({ irlHistorique: HISTO }));
    expect(f(LOT, '2025-06-01')).toBe(750);
  });

  it('un miroir window.DB PÉRIMÉ ne l’emporte pas sur le DB vivant', () => {
    const f = poser('_loyerHCAtDate', miroirPerime({ irlHistorique: HISTO }, { irlHistorique: [] }));
    expect(f(LOT, '2024-06-01')).toBe(700);
  });

  it('sans aucun DB lisible, il dégrade sur log.hc (pas de crash)', () => {
    const f = poser('_loyerHCAtDate', {});
    expect(f(LOT, '2024-06-01')).toBe(750);
  });
});

describe('Le dû proraté d’un mois passé — window._loyerProrataMoisSplit / _loyerProrataMois', () => {
  it('le split d’un mois plein AVANT la révision porte le HC d’alors', () => {
    const f = poser('_loyerProrataMoisSplit', sessionLocale({ irlHistorique: HISTO }));
    const s = f(LOT, 2024, 5, BAIL_COURANT);          // juin 2024
    expect(s.hc).toBeCloseTo(700, 6);
    expect(s.ch).toBeCloseTo(50, 6);
  });

  it('le total d’un mois plein AVANT la révision vaut 750 € (700 HC + 50 CH), pas 800 €', () => {
    const f = poser('_loyerProrataMois', sessionLocale({ irlHistorique: HISTO }));
    expect(f(LOT, 2024, 5, BAIL_COURANT)).toBeCloseTo(750, 6);
  });
});

describe('Le barème historisé d’un lot — window._baremeOfLot', () => {
  it('en session LOCALE, trouve les périodes du lot', () => {
    const bareme = [{ ref: 'F3-FERRETTE', debut: '2020-01-01', hc: 700 }];
    const f = poser('_baremeOfLot', sessionLocale({ loyerBareme: bareme }));
    expect(f('F3-FERRETTE')).toHaveLength(1);
  });
});

/**
 * LE BALAYAGE. Un correctif site par site se fait reprendre au premier `window.DB` réécrit :
 * le piège est INVISIBLE (pas d'erreur, pas de log, juste un chiffre faux). Cette barrière lit
 * TOUT `js/**` et refuse la moindre lecture du miroir.
 *
 * Le SEUL endroit qui a le droit d'y toucher est son ÉCRIVAIN, `__immoSetDB` (index.html:7023) :
 * il pose le miroir pour le code qui n'a pas accès à la liaison lexicale. Il n'est pas dans `js/`.
 */
describe('Balayage — plus aucun module ne lit le miroir `window.DB`', () => {
  const codeSeul = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  /** TOUS les .js sous js/, mirrors générés (`js/helpers/*.global.js`) compris : un mirror qui
   *  lirait le miroir `window.DB` est exactement le cas qu'on veut voir échouer, même si on le
   *  corrige alors dans sa source plutôt que dans le fichier généré. */
  function fichiersJs(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) out.push(...fichiersJs(p));
      else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
  }

  it('aucune lecture de `window.DB` ne subsiste dans js/** (hors commentaires)', () => {
    const fautifs = [];
    for (const f of fichiersJs(resolve(repoRoot, 'js'))) {
      const code = codeSeul(readFileSync(f, 'utf8'));
      if (/window\.DB\b/.test(code)) fautifs.push(f.slice(repoRoot.length + 1).replace(/\\/g, '/'));
    }
    expect(fautifs, '`window.DB` est un MIROIR (absent en local, périmé après réassignation) : lire appDbFrom(window)').toEqual([]);
  });

  it('js/main.js expose bien les quatre lecteurs corrigés (sinon la barrière est vraie par le vide)', () => {
    for (const nom of ['_loyerHCAtDate', '_loyerProrataMois', '_loyerProrataMoisSplit', '_baremeOfLot']) {
      expect(cablage(nom), 'câblage de window.' + nom + ' introuvable').toMatch(/appDbFrom\(window\)/);
    }
  });

  /**
   * LE PIÈGE INVERSE, trouvé par l'audit de ce correctif même.
   *
   * `window.DB` ne répondait pas qu'à « quel état ? », il répondait aussi, par accident, à
   * « l'hydratation a-t-elle eu lieu ? » — puisque seul `__immoSetDB` le pose. `appDbFrom` rend
   * TOUJOURS un objet (le getter rend le `let DB`, au pire `{}`). Remplacer l'un par l'autre sur
   * la purge IndexedDB des photos supprimait donc la garde : `listIdbOnlyBinaries({})` rend `[]`,
   * `leftovers.length === 0`, et on effaçait des binaires qui sont la seule copie restante.
   * La preuve d'hydratation doit venir de `_liveDBRef` (affecté après un `__immoSetDB` réussi).
   *
   * Pas de test d'exécution ici : `supabase-entry.js` est le module de boot cloud, il ne s'importe
   * pas hors navigateur. Cette barrière lit la source — c'est faible, et c'est assumé : mieux que
   * rien sur le seul chemin DESTRUCTIF du lot.
   */
  it('la purge IndexedDB des photos reste gardée par une preuve d’hydratation', () => {
    const src = codeSeul(readFileSync(resolve(repoRoot, 'js/app/supabase-entry.js'), 'utf8'));
    const m = /const dbNow = ([^\n]+)/.exec(src);
    expect(m, 'le garde-fou `dbNow` de la purge a disparu — ce test ne teste plus rien').toBeTruthy();
    expect(m[1], 'appDbFrom() seul est TOUJOURS truthy : sans `_liveDBRef`, la purge n’est plus gardée')
      .toMatch(/_liveDBRef/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Le MÊME piège dans les modules qui lisent `window.DB` directement.
// Ici on installe un faux `globalThis.window` : c'est bien la globale que ces modules lisent.
// ────────────────────────────────────────────────────────────────────────────
let windowInstalle = false;
function installerWindow(faux) { globalThis.window = faux; windowInstalle = true; return faux; }
afterEach(() => { if (windowInstalle) { delete globalThis.window; windowInstalle = false; } });

describe('L’auteur d’une entrée d’audit — audit-trail.js', () => {
  it('en session LOCALE, porte le nom et l’identifiant réels, pas « anonymous »', () => {
    installerWindow(sessionLocale({ params: { userId: 'usr_reel', userName: 'Didier' } }));
    const e = _auditEntry({ action: 'update', entityType: 'bail', entityId: 'b1' });
    expect(e.userId).toBe('usr_reel');
    expect(e.userName).toBe('Didier');
  });
});

describe('L’historique des mails envoyés — email-compose.js', () => {
  it('en session LOCALE, l’envoi est réellement persisté dans le DB vivant', () => {
    const db = {};
    installerWindow(sessionLocale(db));
    _logEmailSent('bail', 'b1', { type: 'relance', to: 'a@b.c', subject: 'S' });
    expect(db.emailsSent).toHaveLength(1);
    expect(_getEmailHistory('bail', 'b1')).toHaveLength(1);
  });
});

describe('Le délai légal de restitution du dépôt — gestion-dg-impayes.js', () => {
  it('en session LOCALE, l’EDL de sortie dégradé fait bien basculer à 2 mois', () => {
    const edlSortie = {
      logement: 'F3-FERRETTE', type: 'Sortie', date: '2026-03-10',
      pieces: [{ elements: [{ etatE: 'Bon état', etatS: 'Mauvais état' }] }]
    };
    installerWindow(sessionLocale({ edl: [edlSortie] }));
    const bail = { ref: 'F3-FERRETTE', debut: '2020-01-01', fin: '2026-03-10' };
    expect(_calculerDelaiRestitution(bail)).toBe(2);
  });
});

describe('Le journal d’erreurs — monitoring.js', () => {
  it('en session LOCALE, l’erreur est écrite dans le DB vivant', () => {
    const db = { params: { monitoringEnabled: true } };
    installerWindow(sessionLocale(db));
    _logError(new Error('boum'));
    _logEvent('vue', {});
    expect(db.errorLog).toHaveLength(1);
    expect(db.eventLog).toHaveLength(1);
  });
});
