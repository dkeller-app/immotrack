/**
 * Chantier « un seul endroit pour l'argent » — lot 6, A3.
 *
 * Un avoir ou un remboursement (assurance remboursée, honoraires ristournés, loyer rendu au locataire)
 * était IGNORÉ par l'export comptable : seul le sens « normal » de la catégorie comptait (cr pour une
 * recette, db pour une charge). L'export dépassait donc Finances du montant de l'avoir. Désormais le
 * mouvement est écrit au NET, et un net négatif s'écrit EN SENS INVERSE sur le MÊME compte.
 *
 * Garde-fou : le net de l'export (FEC / journal / grand livre / dossier ZIP) = Finances, par catégorie
 * et par année.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _buildMvtRows, _buildEcritures, _buildGrandLivre } from '../../js/core/export-comptable.js';
import { _dcBuildPlan, _dcIndexCsv } from '../../js/core/dossier-comptable.js';
import { _computeFinancesMonthly } from '../../js/core/finances-monthly.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const P1 = readFileSync(resolve(root, 'js/app/app-part1.js'), 'utf8').replace(/\r/g, '');
const STD = (() => { const i = P1.indexOf('const STD_CATEGORIES = ['), j = P1.indexOf('\n];', i); return new Function(P1.slice(i, j + 3) + '\nreturn STD_CATEGORIES;')(); })();
const ALIAS = { 'Ristourne agence': 'Frais de gestion / honoraires / comptabilité', 'Plombier Dupont': 'Travaux (entretien, réparation, amélioration)' };
const catMere = (nom) => STD.find((c) => c.nom === nom) || STD.find((c) => c.nom === ALIAS[nom]) || null;

const LOYER = 'Loyers encaissés', DIV = 'Recettes diverses', HONO = 'Frais de gestion / honoraires / comptabilité';
const ASSU = "Primes d'assurance (PNO, GLI)", TRAV = 'Travaux (entretien, réparation, amélioration)';
const TF = 'Taxe foncière (et taxes annexes)', COPRO = 'Charges de copropriété', INT = "Prêt — Intérêts d'emprunt";

// Deux années, des avoirs dans chaque sens, un alias M-1 remboursé, un mouvement à net nul.
const MVTS = [
  { date: '2025-01-10', cat: LOYER, cr: 800, qui: 'F-001', lib: 'Loyer janvier' },
  { date: '2025-01-25', cat: LOYER, db: 50, qui: 'F-001', lib: 'Trop-perçu rendu' },          // loyer rendu
  { date: '2025-02-02', cat: ASSU, db: 300, qui: 'F-001', lib: 'PNO' },
  { date: '2025-03-15', cat: ASSU, cr: 40, qui: 'F-001', lib: 'Remboursement PNO' },          // avoir assurance
  { date: '2025-04-01', cat: 'Ristourne agence', cr: 25, qui: 'F-001', lib: 'Ristourne' },    // alias M-1 en avoir
  { date: '2025-04-03', cat: HONO, db: 90, qui: 'F-001', lib: 'Honoraires' },
  { date: '2025-05-05', cat: 'Plombier Dupont', db: 200, cr: 200, qui: 'F-001', lib: 'Net nul' }, // net 0 → rien
  { date: '2025-06-06', cat: TF, db: 700, qui: 'F-001', lib: 'TF' },
  { date: '2025-06-20', cat: TF, cr: 120, qui: 'F-001', lib: 'Dégrèvement TF' },
  { date: '2025-07-07', cat: DIV, cr: 30, qui: 'F-001', lib: 'Divers' },
  { date: '2025-07-08', cat: DIV, db: 10, qui: 'F-001', lib: 'Divers rendu' },
  { date: '2025-08-08', cat: COPRO, db: 400, qui: 'F-001', lib: 'Appel copro' },
  { date: '2025-09-09', cat: COPRO, cr: 60, qui: 'F-001', lib: 'Régul copro favorable' },
  { date: '2025-12-31', cat: INT, db: 500, qui: 'F-001', lib: 'Intérêts' },
  { date: '2026-01-10', cat: LOYER, cr: 820, qui: 'F-001', lib: 'Loyer janvier' },
  { date: '2026-02-11', cat: TRAV, db: 1000, qui: 'F-001', lib: 'Toiture' },
  { date: '2026-03-12', cat: TRAV, cr: 150, qui: 'F-001', lib: 'Avoir couvreur' },
  { date: '2026-03-13', cat: ASSU, cr: 80, qui: 'F-001', lib: 'Avoir sans prime cette année' },  // net annuel NÉGATIF
];

// Finances : ligne 2044 → champ de l'annuel (même famille que l'export), sens « normal » de la ligne.
const CHAMP = { 211: 'loyersBrut', 213: 'recettesDiverses', 221: 'honoraires', 223: 'assurance', 224: 'travaux', 227: 'taxe', 229: 'recup', 250: 'interets' };
const finances = (yr) => _computeFinancesMonthly({
  mouvements: MVTS, year: yr, scope: null, scopeWeight: () => 1, today: yr + '-12-31',
  catLigne: (cat) => { const s = catMere(cat); return s && s.ligne2044 ? { ligne2044: s.ligne2044, type: s.type } : null; },
}).annual;
// Export : net par ligne 2044 lu sur le JOURNAL (partie double), dans le sens normal du compte.
const exportNet = (yr) => {
  const rows = _buildMvtRows(MVTS, STD, { from: yr + '-01-01', to: yr + '-12-31', catMere });
  const lignes = new Map(rows.map((r) => [r.mapping.compte, r.std.ligne2044]));
  const net = {};
  _buildEcritures(MVTS, STD, { from: yr + '-01-01', to: yr + '-12-31', catMere }).forEach((e) => {
    const l = lignes.get(e.compte); if (!l) return;                  // compte tiers (411 / 401)
    const recette = l === '211' || l === '213';
    net[l] = (net[l] || 0) + (recette ? e.credit - e.debit : e.debit - e.credit);
  });
  return net;
};

describe('Export comptable — avoir / remboursement en sens inverse sur le même compte', () => {
  it('un net négatif donne une ligne `inverse`, au montant absolu ; un net nul ne donne rien', () => {
    const rows = _buildMvtRows(MVTS, STD, { from: '2025-01-01', to: '2025-12-31', catMere });
    const par = (lib) => rows.find((r) => r.lib === lib);
    expect(par('Trop-perçu rendu')).toMatchObject({ montant: 50, inverse: true });
    expect(par('Remboursement PNO')).toMatchObject({ montant: 40, inverse: true });
    expect(par('Ristourne')).toMatchObject({ montant: 25, inverse: true, cat: 'Ristourne agence' });
    expect(par('PNO')).toMatchObject({ montant: 300, inverse: false });
    expect(par('Net nul')).toBeUndefined();
  });

  it('charge remboursée : crédit du compte de charge, débit du fournisseur', () => {
    const e = _buildEcritures(MVTS, STD, { from: '2025-03-01', to: '2025-03-31', catMere });
    expect(e).toEqual([
      expect.objectContaining({ compte: '401000', debit: 40, credit: 0, contrepartie: '616000' }),
      expect.objectContaining({ compte: '616000', debit: 0, credit: 40, contrepartie: '401000' }),
    ]);
  });

  it('loyer rendu : débit du compte de produit, crédit du locataire', () => {
    const e = _buildEcritures(MVTS, STD, { from: '2025-01-20', to: '2025-01-31', catMere });
    expect(e).toEqual([
      expect.objectContaining({ compte: '706000', debit: 50, credit: 0, contrepartie: '411000' }),
      expect.objectContaining({ compte: '411000', debit: 0, credit: 50, contrepartie: '706000' }),
    ]);
  });

  it('le journal reste équilibré (Σ débit = Σ crédit) et le grand livre porte le solde net', () => {
    const e = _buildEcritures(MVTS, STD, { from: '2025-01-01', to: '2025-12-31', catMere });
    const d = e.reduce((s, x) => s + x.debit, 0), c = e.reduce((s, x) => s + x.credit, 0);
    expect(Math.round(d * 100)).toBe(Math.round(c * 100));
    const gl = _buildGrandLivre(e);
    const assu = (Array.isArray(gl) ? gl : Object.values(gl)).find((x) => x.compte === '616000');
    expect(assu.totalDebit - assu.totalCredit).toBe(260);           // 300 − 40
  });

  it.each([2025, 2026])('net de l’export = Finances, ligne par ligne (%i)', (yr) => {
    const fin = finances(yr), exp = exportNet(yr);
    for (const [l, champ] of Object.entries(CHAMP)) {
      expect([l, Math.round((exp[l] || 0) * 100)]).toEqual([l, Math.round((fin[champ] || 0) * 100)]);
    }
    // Garde-fou du garde-fou : chaque ligne exportée est bien comparée.
    for (const l of Object.keys(exp)) expect(CHAMP).toHaveProperty(l);
  });

  it('les montants attendus (lecture humaine des deux années)', () => {
    expect(exportNet(2025)).toEqual({ 211: 750, 223: 260, 221: 65, 227: 580, 213: 20, 229: 340, 250: 500 });
    expect(exportNet(2026)).toEqual({ 211: 820, 224: 850, 223: -80 });
  });

  it('dossier ZIP : montant SIGNÉ dans index.csv, nom de facture en valeur absolue', () => {
    const rows = _buildMvtRows(MVTS, STD, { from: '2025-03-01', to: '2025-03-31', catMere });
    const mvt = rows[0].mvt;
    const docs = [{ id: 'D1', name: 'avoir.pdf', mime: 'application/pdf', idbKey: 'k1' }];
    const plan = _dcBuildPlan(rows.map((r) => ({ ...r, mvt: { ...r.mvt, pjId: 'D1' } })), { documents: docs, logements: [{ ref: 'F-001', entity: 'SCI A' }] });
    expect(plan.rows[0]).toMatchObject({ montant: -40, hasPj: true });
    expect(_dcIndexCsv(plan).split('\n')[2]).toContain(',-40.00,');
    expect(plan.rows[0].fileName).toContain('40');
    expect(plan.rows[0].fileName).not.toContain('-40');
  });
});
