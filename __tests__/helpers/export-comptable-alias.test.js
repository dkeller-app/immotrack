/**
 * Chantier « un seul endroit pour l'argent » — lot 6, A1.
 *
 * L'export comptable (FEC, journal, grand livre, dossier ZIP) cherchait la catégorie d'un mouvement
 * par son NOM EXACT dans le référentiel. Une catégorie PERSO rattachée à une famille (alias M-1)
 * était donc ABSENTE des exports, alors que Finances et la 2044 la comptent. L'app injecte désormais
 * `catMere` (= `_finCatMere`) : la catégorie se classe par sa famille.
 *
 * Les familles SANS ligne 2044 (Divers, prêt, dépôt, CCA…) restent hors export : leurs comptes sont
 * une décision comptable en attente (lot 6, A2).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _buildMvtRows, _buildEcritures } from '../../js/core/export-comptable.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8').replace(/\r/g, '');
const P2 = readFileSync(resolve(root, 'js/app/app-part2.js'), 'utf8').replace(/\r/g, '');
const STD = (() => { const i = P1.indexOf('const STD_CATEGORIES = ['), j = P1.indexOf('\n];', i); return new Function(P1.slice(i, j + 3) + '\nreturn STD_CATEGORIES;')(); })();
const corps = (nom) => { const i = P2.indexOf('\nfunction ' + nom + '('); return i < 0 ? null : P2.slice(i, P2.indexOf('\n}', i + 1) + 2); };

// Résolveur de famille comme l'app (`_finCatMere` : nom exact du référentiel, sinon l'alias).
const ALIAS = { 'Loyer parking voisin': 'Recettes diverses', 'Plombier Dupont': 'Travaux (entretien, réparation, amélioration)', 'Péage A35': 'Divers (non déductible)' };
const catMere = (nom) => STD.find((c) => c.nom === nom) || STD.find((c) => c.nom === ALIAS[nom]) || null;

const MVTS = [
  { date: '2025-01-15', cat: 'Loyers encaissés', cr: 800, qui: 'F-001', lib: 'Loyer janvier' },
  { date: '2025-02-10', cat: 'Loyer parking voisin', cr: 60, qui: 'F-001', lib: 'Parking' },
  { date: '2025-03-20', cat: 'Plombier Dupont', db: 200, qui: 'F-001', lib: 'Fuite' },
  { date: '2025-04-01', cat: 'Péage A35', db: 12, qui: 'F-001', lib: 'Péage' },
];

describe('Export comptable — une catégorie perso se classe par sa famille', () => {
  it('avec `catMere` : les alias de familles déclarées en 2044 entrent dans l’export, au compte de leur famille', () => {
    const rows = _buildMvtRows(MVTS, STD, { catMere });
    expect(rows.map((r) => r.cat)).toEqual(['Loyers encaissés', 'Loyer parking voisin', 'Plombier Dupont']);
    expect(rows.map((r) => r.mapping.compte)).toEqual(['706000', '758000', '615200']);
    expect(rows.map((r) => r.num)).toEqual([1, 2, 3]);
  });

  it('les écritures (FEC / journal / grand livre) suivent, partie double équilibrée', () => {
    const ecr = _buildEcritures(MVTS, STD, { catMere });
    expect(ecr).toHaveLength(6);
    expect(ecr.find((e) => e.compte === '758000').credit).toBe(60);
    expect(ecr.find((e) => e.compte === '615200').debit).toBe(200);
  });

  it('une famille SANS ligne 2044 (Divers) reste hors export — décision comptable en attente (A2)', () => {
    expect(_buildMvtRows(MVTS, STD, { catMere }).some((r) => r.cat === 'Péage A35')).toBe(false);
  });

  it('sans `catMere` (ancien appelant) : seul le nom exact du référentiel compte', () => {
    expect(_buildMvtRows(MVTS, STD, {}).map((r) => r.cat)).toEqual(['Loyers encaissés']);
  });

  it('l’app passe `_finCatMere` aux deux constructeurs d’options (FEC/journal/grand livre ET dossier ZIP)', () => {
    for (const nom of ['_comptaBuildOpts', '_dcBuildOpts']) {
      const c = corps(nom);
      expect(c, nom + ' introuvable').toBeTruthy();
      expect(c, nom).toContain("catMere: (typeof _finCatMere === 'function') ? _finCatMere : null");
    }
  });
});
