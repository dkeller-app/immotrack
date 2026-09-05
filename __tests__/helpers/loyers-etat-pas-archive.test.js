/**
 * CDC-LOYERS-DESIGN V13 + §2 — L'ÉTAT, PAS L'ARCHIVE.
 *
 * « On ne retrouve pas une quittance. […] Quand on a édité une quittance, l'app retient
 *   (pour le KPI de suivi) mais on ne garde pas le document en visuel. Si l'utilisateur veut
 *   une quittance passée, il la réédite. »
 *
 * Ce que ces tests protègent : la CONTRAINTE DURE du §V13 — « aucune des deux surfaces ne
 * grossit avec l'historique ». Une liste de quittances est exactement ce qui grossit ; elle
 * se réintroduit en dix lignes, et rien dans un test de valeur ne le verrait.
 *
 * Chaque suppression du §2 est vérifiée AVEC la preuve que son information est atteignable
 * ailleurs — c'est la règle 4 de solidité du CDC-V1-LIGHT.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moisRailLot } from '../../js/core/quittance-editeur.js';
import { etatMoisLot } from '../../js/core/loyers-mois.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/main.css'), 'utf8');
const has = (s) => SRC.includes(s);

describe('V13 — l\'état vit à DEUX endroits, et nulle part ailleurs', () => {
  it('1. l\'écran Loyers : la pastille « Quittances éditées ce mois » ouvre l\'état du mois courant', () => {
    // MOBILE-REFONTE line-icons : l'emoji préfixe est devenu _uiIcon('receipt'); on ancre
    // sur la pastille + son libellé en toutes lettres.
    expect(has("pastille('quit-mois'")).toBe(true);
    expect(has('Quittances éditées ce mois')).toBe(true);
    expect(has("kind === 'quit-mois'")).toBe(true);
  });
  it('2. la fiche du bien : une bande de douze cases par année', () => {
    expect(has('function _renderEtat12Mois(ref, year)')).toBe(true);
    expect(has('Quittancement ${year}')).toBe(true);
  });
  it('un clic sur une case ouvre l\'éditeur SUR CE MOIS', () => {
    expect(has('function _ouvrirQuittanceSurMois(ref, ym)')).toBe(true);
    expect(has('onclick="_ouvrirQuittanceSurMois(')).toBe(true);
  });
  it('les deux surfaces lisent la MÊME source que le rail de l\'éditeur (aucun 2ᵉ calcul)', () => {
    expect(has('window.moisRailLot(etat, deja.yms, year, today.slice(0, 7), deja.dates)')).toBe(true);
  });
});

describe('§2 — ce qui disparaît, et où va son information', () => {
  it('la LISTE des quittances par année disparaît → l\'information est dans les 12 cases', () => {
    expect(has('function _renderQuitForLog')).toBe(false);
    expect(has('Aucune quittance en ${year}')).toBe(false);
    expect(has('function _renderEtat12Mois')).toBe(true);
  });
  it('la GALERIE de documents de l\'onglet Documents disparaît → même bande de 12 cases', () => {
    expect(has('<div class="logf-doc-name">Quittance ${escHtml(q.mois||\'—\')}</div>')).toBe(false);
    expect(has('Aucune quittance enregistrée pour ce logement.')).toBe(false);
    expect(has("' Quittancement', icon: '🧾'")).toBe(true);
  });
  it('le « voir toutes » vers une liste infinie disparaît', () => {
    expect(has('voir toutes</a>')).toBe(false);
  });
  it('l\'écran dit explicitement qu\'aucun document n\'est stocké', () => {
    expect(has("Aucune quittance n'est stockée")).toBe(true);
  });
  it('aucune notion de VERSION n\'est introduite (rien n\'est stocké, donc rien n\'est versionné)', () => {
    expect(has('quittanceVersion')).toBe(false);
    expect(has('rééditée le')).toBe(false);
    expect(has('écraser ou garder')).toBe(false);
  });
});

describe('Contrainte dure — aucune des deux surfaces ne grossit avec l\'historique', () => {
  it('la bande a exactement 12 cases, quel que soit le nombre de mois suivis', () => {
    const mois = (ym) => ({ ym, hcDue: 500, chDue: 100, received: 600, sources: [{ date: ym + '-05', montant: 600 }] });
    const petit = etatMoisLot([mois('2026-01'), mois('2026-02')]);
    const gros = etatMoisLot(Array.from({ length: 60 }, (_, i) => {
      const y = 2021 + Math.floor(i / 12), m = (i % 12) + 1;
      return mois(`${y}-${String(m).padStart(2, '0')}`);
    }));
    expect(moisRailLot(petit, [], 2026, '2026-06').length).toBe(12);
    expect(moisRailLot(gros, [], 2026, '2026-06').length).toBe(12);
    expect(moisRailLot(gros, [], 2021, '2026-06').length).toBe(12);
  });
  it('la grille CSS est à 12 colonnes fixes, jamais une liste qui s\'allonge', () => {
    expect(CSS.includes('.e12-g{display:grid;grid-template-columns:repeat(12,minmax(0,1fr))')).toBe(true);
  });
  it('elle se replie à 6 puis 4 colonnes sur les petits écrans, sans déborder', () => {
    expect(CSS.includes('@media (max-width:820px){ .e12-g{grid-template-columns:repeat(6,minmax(0,1fr))')).toBe(true);
    expect(CSS.includes('@media (max-width:520px){ .e12-g{grid-template-columns:repeat(4,minmax(0,1fr))')).toBe(true);
  });
});

describe('Migration — les quittances existantes deviennent des états, rien n\'est jeté', () => {
  it('DB.quittances reste la source des états : aucune purge, aucune conversion destructrice', () => {
    // Le schéma convient déjà (lot, mois, date d'édition) : la « migration » du lot 5 est
    // une relecture, pas une réécriture. Aucun code ne doit supprimer d'entrées existantes.
    // Les deux seules affectations autorisées sont des initialisations défensives
    // (`if (!DB.quittances) DB.quittances = []`), jamais une remise à zéro.
    const affectations = SRC.split('DB.quittances = []').length - 1;
    const defensives = SRC.split('if (!DB.quittances) DB.quittances = []').length - 1;
    expect(affectations).toBe(defensives);
    expect(has('DB.quittances.length = 0')).toBe(false);
    expect(has('DB.quittances.splice(')).toBe(false);
  });
  it('les états se lisent par (lot, mois) — l\'unicité est déjà garantie à la création', () => {
    expect(has('const deja = DB.quittances.find(q => q && !q._deleted && q.logement === ref && q.mois === mois);')).toBe(true);
  });
});
