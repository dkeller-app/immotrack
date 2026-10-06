/**
 * Garde-fou du LOT 0 « code mort » (chantier Finances source unique, 06/10/2026).
 *
 * Ces fonctions n'avaient AUCUN appelant atteignable : l'ancienne grille de widgets de l'Accueil
 * (jamais rendue — `rAccueil` route vers `_renderAccueilPhone` / `_renderPilotage`), la modale
 * entité #ov-ent-detail (ouverte seulement depuis ses propres boutons), d'anciens calculs
 * comptables et des copies file:// de modules eux-mêmes sans appelant. Plusieurs portaient des
 * règles de calcul périmées : un correctif écrit dessus ne s'affichait jamais (R-0, v15.716).
 *
 * Ils ne doivent pas revenir. Les commentaires qui racontent leur histoire sont autorisés ;
 * une définition ou un appel (y compris dans un attribut `onclick`) ne l'est pas.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sansCommentaires = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

// index.html (assemblé : coquille + app-part*.js) + tout js/ hors bibliothèques tierces.
const SOURCES = (() => {
  const out = ['index.html'];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(rel); }
      else if (/\.(m?js)$/.test(e.name)) out.push(rel);
    }
  };
  walk('js');
  return out;
})();
const CODE = SOURCES.map((f) => [f, sansCommentaires(lire(f))]);

const SUPPRIMES = [
  // Ancienne grille de widgets de l'Accueil et ses drills
  'buildDashWidget', '_buildWidgetV1Legacy', '_buildWidgetV2Modern', '_heroV2', '_heroCashflowSeries',
  '_buildHeroDrill', '_kpiMonthlySeries', '_buildRevDrill', '_buildChgDrill', '_occPerimetre', '_buildOccDrill',
  '_buildBailSegments', '_getActiveBailHcCh', '_buildProgDrill', '_buildSoldeDrill', '_buildFluxDrill',
  '_buildRdtDrill', '_realiseInclCat',
  // Modale entité #ov-ent-detail
  '_showEntModal', 'drillToEnt', 'drillToImm', 'drillToLog', '_entCardClick', '_immBulleClick', '_logMiniClick',
  '_navToParent', 'drillEntToLoyers', '_isEntExpanded', 'toggleEntExpand',
  // Bail : badge jamais lu (seule l'entrée Bail.getStatus le référençait)
  'getBailStatus',
  // Anciens calculs comptables / pilotage
  '_computeComptaBailleur', '_renderComptaSparkline', '_renderEntFichePanelComptaGlobale', '_exportComptaBailleurCsv',
  'getCurrentRent', '_pilSoldeLocataire', '_pilEncaisseMois',
  // Modules sans appelant (et leurs copies file://)
  '_listerImpayesActifs', '_statutQuittance', '_escaladeAlerte', 'QUITTANCE_STATUS', 'orphelinsHorsPerimetre',
  '_finScopeOrphelins', '_irlDeltaImm', '_irlListAlertes', '_irlProjectionAnnuelle', '_irlListLotsForDrill',
];

describe('Lot 0 — le code mort supprimé ne revient pas', () => {
  for (const nom of SUPPRIMES) {
    it(nom + ' : ni définition ni appel', () => {
      const re = new RegExp('(?<![\\w$])' + nom.replace(/\$/g, '\\$') + '(?![\\w$])');
      const coupables = CODE.filter(([, c]) => re.test(c)).map(([f]) => f);
      expect(coupables, nom + ' réapparaît').toEqual([]);
    });
  }

  it('les modules sans appelant restent supprimés', () => {
    for (const f of ['js/core/quittances-actives.js', 'js/core/irl-drill.js']) {
      expect(fs.existsSync(path.join(ROOT, f)), f).toBe(false);
    }
  });

  it('les modales que plus rien n’ouvrait restent supprimées', () => {
    const html = sansCommentaires(lire('index.html'));
    for (const id of ['ov-ent-detail', 'ov-irl-drill']) expect(html, id).not.toContain('id="' + id + '"');
  });

  it('previewBailData ne reconstruit plus les 13 pages HTML mortes (clauses périmées)', () => {
    const html = lire('index.html');
    const i = html.indexOf('function previewBailData('), j = html.indexOf('\n}', i);
    expect(i).toBeGreaterThan(-1);
    const corps = sansCommentaires(html.slice(i, j));
    expect(corps).not.toMatch(/\bconst p(1[0-3]?|[2-9]) = /);
    expect(corps).not.toContain('class="bail-page" id="page-');
    expect(corps).toContain('buildBailStructure(');           // le seul rendu, inchangé
  });
});
