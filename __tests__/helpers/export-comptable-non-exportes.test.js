/**
 * Chantier « un seul endroit pour l'argent » — lot 6, A2.
 *
 * L'export comptable n'invente aucun compte : les familles SANS ligne 2044 (dépôt de garantie, prêt,
 * achat / vente, virement interne, CCA, Divers, frais bancaires, charges récupérables…) ne sont pas
 * écrites. Elles disparaissaient EN SILENCE. Désormais elles sont LISTÉES — nombre, totaux, ventilation
 * par catégorie — avec la mention « non exportés : compte à définir avec l'expert-comptable » : fichier
 * dédié du dossier ZIP, récapitulatif, message à chaque téléchargement du FEC / journal / grand livre.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _buildMvtRows, _listNonExportes, _nonExportesResume, _nonExportesCsv, NON_EXPORTES_MENTION } from '../../js/core/export-comptable.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const lire = (f) => readFileSync(resolve(root, f), 'utf8').replace(/\r/g, '');
const P1 = lire('js/app/app-part1.js'), P2 = lire('js/app/app-part2.js');
const STD = (() => { const i = P1.indexOf('const STD_CATEGORIES = ['), j = P1.indexOf('\n];', i); return new Function(P1.slice(i, j + 3) + '\nreturn STD_CATEGORIES;')(); })();
const corps = (nom) => { const i = P2.search(new RegExp('\\n(async )?function ' + nom + '\\(')); return i < 0 ? '' : P2.slice(i, P2.indexOf('\n}', i + 1) + 2); };
const ALIAS = { 'Péage A35': 'Divers (non déductible)', 'Plombier Dupont': 'Travaux (entretien, réparation, amélioration)' };
const catMere = (nom) => STD.find((c) => c.nom === nom) || STD.find((c) => c.nom === ALIAS[nom]) || null;

const MVTS = [
  { date: '2025-01-10', cat: 'Loyers encaissés', cr: 800, qui: 'F-001', lib: 'Loyer' },
  { date: '2025-01-11', cat: 'Dépôt de garantie (reçu / restitué)', cr: 800, qui: 'F-001', lib: 'DG reçu' },
  { date: '2025-02-05', cat: 'Prêt', db: 600, qui: 'F-001', lib: 'Échéance' },
  { date: '2025-03-05', cat: 'Prêt', db: 600, qui: 'F-001', lib: 'Échéance' },
  { date: '2025-03-06', cat: 'Péage A35', db: 12.5, qui: 'F-001', lib: 'Péage' },             // alias Divers
  { date: '2025-03-07', cat: 'Plombier Dupont', db: 200, qui: 'F-001', lib: 'Fuite' },        // alias exporté
  { date: '2025-04-01', cat: 'Catégorie effacée', db: 30, qui: 'F-001', lib: '=HYPERLINK("x")' }, // inconnue
  { date: '2025-04-02', cat: 'Frais bancaires', db: 9, qui: 'SCI:Alpha', lib: 'Tenue de compte' },
  { date: '2025-04-03', cat: 'Prêt', qui: 'F-001', lib: 'Sans montant' },                     // rien à dire
  { date: '2025-05-01', cat: 'Prêt', db: 600, qui: 'F-001', lib: 'Supprimé', _deleted: true },
  { date: '2026-01-05', cat: 'Prêt', db: 600, qui: 'F-001', lib: 'Hors période' },
  { date: '2025-06-01', cat: 'Prêt', db: 600, qui: 'G-009', lib: 'Autre bailleur' },
];
const OPTS = { from: '2025-01-01', to: '2025-12-31', entityNom: 'Alpha', refs: ['F-001'], catMere };

describe('Export comptable — les mouvements non exportés sont listés, jamais tus', () => {
  it('partition du périmètre : chaque mouvement porteur d’un montant est soit écrit, soit listé', () => {
    const ecrits = _buildMvtRows(MVTS, STD, OPTS).map((r) => r.mvt);
    const listes = _listNonExportes(MVTS, STD, OPTS).rows;
    expect(ecrits.map((m) => m.lib)).toEqual(['Loyer', 'Fuite']);
    expect(listes.map((r) => r.lib)).toEqual(['DG reçu', 'Échéance', 'Échéance', 'Péage', '=HYPERLINK("x")', 'Tenue de compte']);
    const dansPerimetre = MVTS.filter((m) => !m._deleted && m.date >= '2025-01-01' && m.date <= '2025-12-31'
      && (m.qui === 'F-001' || m.qui === 'SCI:Alpha') && ((m.cr || 0) || (m.db || 0)));
    expect(ecrits.length + listes.length).toBe(dansPerimetre.length);
  });

  it('nombre, totaux et ventilation par catégorie (famille d’un alias, « sans famille » si inconnue)', () => {
    const l = _listNonExportes(MVTS, STD, OPTS);
    expect(l).toMatchObject({ count: 6, entrees: 800, sorties: 1251.5 });
    expect(l.parCategorie).toEqual([
      { cat: 'Prêt', famille: '', count: 2, entrees: 0, sorties: 1200 },
      { cat: 'Catégorie effacée', famille: 'sans famille', count: 1, entrees: 0, sorties: 30 },
      { cat: 'Dépôt de garantie (reçu / restitué)', famille: '', count: 1, entrees: 800, sorties: 0 },
      { cat: 'Frais bancaires', famille: '', count: 1, entrees: 0, sorties: 9 },
      { cat: 'Péage A35', famille: 'Divers (non déductible)', count: 1, entrees: 0, sorties: 12.5 },
    ]);
  });

  it('résumé d’écran : la mention exacte ; rien s’il n’y a rien', () => {
    expect(NON_EXPORTES_MENTION).toBe('non exportés : compte à définir avec l\'expert-comptable');
    expect(_nonExportesResume(_listNonExportes(MVTS, STD, OPTS))).toBe('6 mouvements (entrées 800,00 €, sorties 1251,50 €) non exportés : compte à définir avec l\'expert-comptable');
    expect(_nonExportesResume(_listNonExportes(MVTS.slice(0, 1), STD, OPTS))).toBe('');
  });

  it('CSV du dossier : en-tête (mention, périmètre, totaux, ventilation) puis détail, formule neutralisée', () => {
    const csv = _nonExportesCsv(_listNonExportes(MVTS, STD, OPTS), { extractionYmd: '2026-10-06', entityNom: 'Alpha', from: '2025-01-01', to: '2025-12-31' }).split('\n');
    expect(csv[0]).toBe('# Mouvements non exportés : compte à définir avec l\'expert-comptable');
    expect(csv[1]).toBe('# date d\'extraction : 2026-10-06 · bailleur : Alpha · période : 2025-01-01 → 2025-12-31');
    expect(csv[2]).toBe('# 6 mouvement(s) · entrées 800.00 · sorties 1251.50');
    expect(csv[3]).toBe('# Prêt : 2 mouvement(s) · entrées 0.00 · sorties 1200.00');
    expect(csv[7]).toBe('# Péage A35 (Divers (non déductible)) : 1 mouvement(s) · entrées 0.00 · sorties 12.50');
    expect(csv[8]).toBe('date,lot,categorie,famille,libelle,entree,sortie');
    expect(csv[9]).toBe('2025-01-11,F-001,Dépôt de garantie (reçu / restitué),,DG reçu,800.00,');
    expect(csv.find((x) => x.includes('HYPERLINK'))).toBe('2025-04-01,F-001,Catégorie effacée,sans famille,"\'=HYPERLINK(""x"")",,30.00');
    expect(csv).toHaveLength(9 + 6);
  });
});

describe('Câblage dans l’app', () => {
  it('FEC, journal et grand livre : le message de fin dit les non-exportés', () => {
    for (const f of ['downloadFEC', 'downloadJournal', 'downloadGrandLivre']) {
      expect(corps(f)).toContain('_comptaToastExport(');
      expect(corps(f)).not.toMatch(/showToast\([^)]*'ok'\)/);
    }
    // Exécuté pour de vrai (corps de l'app + vraies fonctions du module) : avertissement, ou succès simple.
    const lancer = (mouvements) => {
      const toasts = [];
      const win = { _listNonExportes, _nonExportesResume };
      const f = new Function('window', 'DB', 'STD_CATEGORIES', 'showToast', corps('_comptaNonExportes') + corps('_comptaToastExport') + '\nreturn _comptaToastExport;');
      f(win, { mouvements }, STD, (...a) => toasts.push(a))('FEC téléchargé (4 écritures)', OPTS);
      return toasts;
    };
    expect(lancer(MVTS)).toEqual([['FEC téléchargé (4 écritures) · 6 mouvements (entrées 800,00 €, sorties 1251,50 €) non exportés : compte à définir avec l\'expert-comptable', 'warn', 9000]]);
    expect(lancer(MVTS.slice(0, 1))).toEqual([['FEC téléchargé (4 écritures)', 'ok']]);
  });

  it('dossier ZIP : même tableau figé que le récap, fichier dédié, bloc du récapitulatif', () => {
    expect(corps('openDossierComptable')).toContain('o._nonExp = _comptaNonExportes(o, mvts)');
    expect(corps('_dcRun')).toContain("'ecritures/mouvements-non-exportes.csv'");
    expect(corps('_dcRun')).toContain('window._nonExportesCsv(ne,');
    expect(corps('_dcRecapOverlay')).toContain("compte à définir avec l\\'expert-comptable");
    expect(corps('_dcRecapOverlay')).not.toContain('Le dossier reste complet côté chiffres');
  });

  it('main.js expose les trois fonctions ; l’en-tête du module n’annonce plus de compte 165 jamais câblé', () => {
    const main = lire('js/main.js');
    for (const f of ['_listNonExportes', '_nonExportesResume', '_nonExportesCsv']) expect(main).toContain('window.' + f + ' = ' + f + ';');
    expect(lire('js/core/export-comptable.js')).not.toMatch(/165/);
  });
});
