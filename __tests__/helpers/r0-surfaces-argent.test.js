/**
 * R-0 — les surfaces d'ARGENT lisent le bail, pas le cache `l.locataire`.
 *
 * Deux commits ont corrigé ces surfaces sans écrire un seul test. Vérifier en exécution était
 * nécessaire, pas suffisant : rien n'empêchait de remettre un filtre sur le cache le lendemain.
 *
 * ⚠️ Ces tests visent les surfaces VIVANTES. La grille de widgets legacy (`buildDashWidget`)
 * n'a aucun appelant : y tester quoi que ce soit donnerait une fausse assurance. Les deux
 * surfaces réellement rendues sont le bandeau Pilotage (≥768) et l'Accueil téléphone (≤767).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

const corpsDe = (nom) => {
  const i = html.indexOf('function ' + nom + '(');
  if (i === -1) return null;
  const j = html.indexOf('\n}', i);
  return j === -1 ? null : html.slice(i, j + 2);
};
const codeSeul = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Extrait `_lotEstLoue` et `_dgDuLot` d'index.html et les exécute pour de vrai. */
function charger(db) {
  const src = [corpsDe('_lotEstLoue'), corpsDe('_dgDuLot')].join('\n');
  const f = new Function('DB', '_bienIsBailActif', '_bienActiveBail',
    src + '\nreturn { _lotEstLoue, _dgDuLot };');
  const actif = (ref) => {
    const b = db.baux && db.baux[ref];
    return (b && !b._deleted && !b.cloture && !b.finEffective) ? b : null;
  };
  return f(db, (ref) => !!actif(ref), actif);
}

const DB_CAS = {
  baux: {
    // Bail repris : actif, mais le cache du lot est VIDE (pas de nom sur le bail).
    'A-1': { ref: 'A-1', debut: '2024-01-01', dg: 1500, locataires: [] },
    // Bail CLÔTURÉ : le cache du lot garde encore l'ancien locataire.
    'D-4': { ref: 'D-4', debut: '2022-01-01', finEffective: '2026-03-31', cloture: true, dg: 800 },
    // Bail sans dépôt renseigné : la fiche fait alors foi.
    'C-3': { ref: 'C-3', debut: '2024-01-01' }
  }
};
const LOTS = {
  A1: { ref: 'A-1', locataire: '', dg: 1200 },
  D4: { ref: 'D-4', locataire: 'ANCIEN Jean', dg: 800 },
  C3: { ref: 'C-3', locataire: 'MARTIN', dg: 900 },
  V9: { ref: 'V-9', locataire: '', dg: 0 }
};

describe('_lotEstLoue — le bail répond, jamais le cache', () => {
  let M; beforeAll(() => { M = charger(DB_CAS); });

  it('bail ACTIF mais cache VIDE → loué (le cas que le cache faisait disparaître)', () => {
    expect(M._lotEstLoue(LOTS.A1)).toBe(true);
  });

  it('bail CLÔTURÉ mais cache encore rempli → vacant (l’erreur symétrique)', () => {
    expect(M._lotEstLoue(LOTS.D4)).toBe(false);
  });

  it('aucun bail → vacant', () => {
    expect(M._lotEstLoue(LOTS.V9)).toBe(false);
  });

  it('entrées dégradées : jamais d’exception', () => {
    expect(M._lotEstLoue(null)).toBe(false);
    expect(M._lotEstLoue({})).toBe(false);
  });
});

describe('_dgDuLot — le dépôt du bail en cours l’emporte sur la fiche', () => {
  let M; beforeAll(() => { M = charger(DB_CAS); });

  it('bail 1 500 € contre fiche 1 200 € → 1 500 €', () => {
    expect(M._dgDuLot(LOTS.A1)).toBe(1500);
  });

  it('bail sans dépôt → la fiche sert de repli', () => {
    expect(M._dgDuLot(LOTS.C3)).toBe(900);
  });

  it('ni l’un ni l’autre → zéro, jamais NaN', () => {
    expect(M._dgDuLot(LOTS.V9)).toBe(0);
    expect(M._dgDuLot({ ref: 'X' })).toBe(0);
  });
});

describe('Le total des dépôts détenus (bandeau Pilotage) — surface VIVANTE', () => {
  let M; beforeAll(() => { M = charger(DB_CAS); });

  it('compte le bail repris, écarte le bail clôturé, et prend le montant du bail', () => {
    // La formule exacte du bandeau. Chacune des trois attentes échouait AVANT le correctif :
    //  · A-1 était exclu (cache vide) alors qu'il est loué et que 1 500 € sont détenus ;
    //  · D-4 était compté (cache périmé) alors que le dépôt a été restitué ;
    //  · le montant retenu venait de la fiche (1 200 €), pas du bail.
    const lots = [LOTS.A1, LOTS.D4, LOTS.C3, LOTS.V9];
    const retenus = lots.filter(l => M._lotEstLoue(l) && M._dgDuLot(l) > 0);
    const total = retenus.reduce((s, l) => s + M._dgDuLot(l), 0);
    expect(retenus.map(l => l.ref)).toEqual(['A-1', 'C-3']);
    expect(total).toBe(2400);

    // Ce que l'ancienne logique donnait, pour mémoire : le mauvais lot, au mauvais montant.
    const avant = lots.filter(l => l.locataire && (l.dg || 0) > 0).reduce((s, l) => s + (l.dg || 0), 0);
    expect(avant).toBe(1700);
  });

  it('un total ne peut pas contredire les lignes qui le composent', () => {
    // Le KPI Dépôts sommait `l.dg` alors que ses lignes affichaient `_dgDuLot` : 3 100 € de
    // total pour 3 400 € de lignes. Une somme et son détail se lisent ensemble.
    const lots = [LOTS.A1, LOTS.C3];
    const lignes = lots.map(l => M._dgDuLot(l));
    expect(lignes.reduce((a, b) => a + b, 0)).toBe(2400);
  });
});

describe('Aucune surface d’argent VIVANTE ne remet un filtre sur le cache', () => {
  /**
   * Liste des fonctions qui affichent un MONTANT et lisent encore `l.locataire`.
   * Conçue pour SE VIDER : corriger l'une fait rougir son test, ce qui oblige à la retirer
   * d'ici. Et rien de nouveau ne peut y entrer sans être remarqué.
   *
   * Elle est VIDE depuis v15.662 : plus aucune surface d'argent vivante ne décide sur le cache.
   * Si une ligne réapparaît ici, c'est une régression assumée — pas un oubli.
   */
  const RESTE_A_FAIRE = [];

  /** Les surfaces corrigées. Une entrée qui repart au cache fait rougir immédiatement. */
  const CORRIGEES = [
    '_v4ComputeLotStatus',   // Accueil téléphone — mettait attendu/reçu à zéro
    '_pilLotLigne',          // matrice du Pilotage — cellule loyer et filtre « vacant »
    '_lyTousLoyersHtml',     // page Loyers — chips de retard et d'avance
    '_computeUnifiedTodo',   // tâches unifiées — révisions IRL et entretien
    '_collectIRLRappels',    // récap des rappels IRL
    '_pilCollectFamilles',   // « À regarder » — assurance et diagnostics d'un lot loué
    '_pilIrlDot',            // pastille IRL de la fiche lot
    '_v4NavCounts',          // barre latérale — compteurs locataires et baux
    'agendaAutoSync',        // agenda — révision IRL, fin de bail, préavis
    'openEquipIntervention', // sélecteur de lot d'une intervention
    '_bootDataJobs'          // audit de cohérence IRL au démarrage
  ];

  it('les surfaces DÉJÀ corrigées ne sont pas revenues au cache', () => {
    for (const nom of CORRIGEES) {
      const corps = corpsDe(nom);
      expect(corps, nom + ' introuvable — le test ne teste plus rien').toBeTruthy();
      // On vise les DÉCISIONS (`!l.locataire`, `filter(l => l.locataire)`), pas l'affichage
      // d'un nom, qui reste légitime.
      const code = codeSeul(corps);
      expect(code, nom + ' décide encore sur le cache').not.toMatch(/!\s*l(?:og)?\.locataire/);
      expect(code, nom + ' filtre encore sur le cache').not.toMatch(/filter\s*\(\s*l\s*=>\s*l\.locataire(?!\s*\?)/);
    }
  });

  it('le bandeau Pilotage compte les lots loués sur le bail', () => {
    const corps = codeSeul(corpsDe('_renderPilotage'));
    expect(corps).toMatch(/scopeLogs\.filter\(_lotEstLoue\)/);
    expect(corps, 'le comptage du cache est revenu').not.toMatch(/DashCtx\.occupationKpis/);
  });

  it('la liste de ce qui reste est EXACTE — ni oubli, ni ligne périmée', () => {
    for (const nom of RESTE_A_FAIRE) {
      const corps = corpsDe(nom);
      expect(corps, nom + ' a disparu : retirer la ligne de RESTE_A_FAIRE').toBeTruthy();
      expect(codeSeul(corps), nom + ' est corrigé : retirer la ligne de RESTE_A_FAIRE')
        .toMatch(/l\.locataire|log\.locataire/);
    }
  });
});
