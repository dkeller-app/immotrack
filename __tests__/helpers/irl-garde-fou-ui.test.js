/**
 * CDC-LOYERS-DESIGN V20/V21, dans l'application — invariants STRUCTURELS.
 *
 * Ce lot défait des refus durs qui vivaient depuis longtemps dans le code : deux `alert()`
 * « Application annulée » dans `applyIRL`, et deux retours d'erreur dans le constructeur de
 * la lettre. Un seul d'entre eux qui revient, et l'utilisateur est de nouveau coincé — c'est
 * exactement ce que Didier a rejeté (« tu arrêtes de bloquer ! là je peux rien faire ! »).
 *
 * Le pendant est tout aussi important : le mode forcé ne doit JAMAIS devenir le mode normal.
 * Le calcul ne change pas, seule la règle est franchie, et uniquement après confirmation.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const has = (s) => SRC.includes(s);

describe('V20 — les refus durs de la révision ont disparu', () => {
  it('les deux alert() bloquants d\'applyIRL sont partis', () => {
    expect(has('Application annulée.')).toBe(false);
    expect(has("saisir le DPE avant d\\'appliquer la révision.")).toBe(false);
  });
  it('applyIRL ouvre la fenêtre d\'avertissement au lieu de s\'arrêter', () => {
    expect(has('if (g) { _gfOuvrir(ref); return; }')).toBe(true);
    expect(has('function applyIRL(ref, newHC, opts) {')).toBe(true);
  });
  it('la lettre de révision peut partir « quand même » une fois la confirmation cochée', () => {
    expect(has('function _buildIRLLetterHtml(log, bail, ent, rev, opts) {')).toBe(true);
    expect(has('if (rev.dpeManquant && !_force) {')).toBe(true);
    expect(has('if (rev.gelDpeFG && !_force) {')).toBe(true);
    expect(has('const _forcee = !!(log.irlForceeLe);')).toBe(true);
  });
});

describe('Le mode forcé ne devient jamais le mode normal', () => {
  it('`force` ne franchit QUE les sorties dues à une règle, pas un calcul', () => {
    expect(has("if (!dpe && !_force) {")).toBe(true);
    expect(has("if ((dpe === 'F' || dpe === 'G') && !_force) {")).toBe(true);
    // les sorties « il n'y a rien à calculer » restent inconditionnelles
    expect(has("if (!cal || cal.etat === 'trop-jeune') {")).toBe(true);
    expect(has('if(!valN || !valN1) {')).toBe(true);
  });
  it('aucune surface d\'affichage ne passe `force` : l\'écran continue de dire « non révisable »', () => {
    // Les SEULS appels forcés sont ceux du geste explicite : la fenêtre d'avertissement
    // (pour chiffrer ce qu'elle propose), applyIRL en mode confirmé, et la lettre d'un lot
    // qui porte déjà la trace du forçage. Aucune liste, aucun ruban, aucun calendrier.
    const forces = SRC.split('computeIRLRevision(log, { force:').length - 1;
    expect(forces).toBe(3);
    expect(has('const rev = computeIRLRevision(log, { force: _forceIrl });')).toBe(true);
    expect(has('const rev = computeIRLRevision(log, { force: _forcee });')).toBe(true);
    // les surfaces d'affichage appellent la version honnête
    expect(has('function _lyRevisions(etats)')).toBe(true);
    const lyRev = SRC.slice(SRC.indexOf('function _lyRevisions(etats)'), SRC.indexOf('function _lyRevisions(etats)') + 400);
    expect(lyRev.includes('force')).toBe(false);
  });
  it('le geste forcé laisse une trace datée et nominative', () => {
    expect(has('log.irlForceeLe = td();')).toBe(true);
    expect(has('log.irlForceePar =')).toBe(true);
  });
});

describe('La fenêtre d\'avertissement dit les trois choses exigées par V20', () => {
  it('elle cite la règle, dit ce que ça engage, demande une confirmation', () => {
    expect(has('id="gf-loi"')).toBe(true);
    expect(has('Ce que ça engage')).toBe(true);
    expect(has('id="gf-ok"')).toBe(true);
  });
  it('le bouton reste désactivé tant que la case n\'est pas cochée — et rien d\'autre ne le bloque', () => {
    expect(has('function _gfSetOk(on) {')).toBe(true);
    expect(has('b.disabled = !on;')).toBe(true);
  });
  it('les textes viennent du module, pas de l\'écran', () => {
    expect(has('window.gardeFouRevision(rev, { gainMensuel: _gfGainCycle(log, rev), fmtMontant: fmt })')).toBe(true);
  });
});

describe('V21 — là où il n\'y a rien à débloquer, il n\'y a pas de bouton', () => {
  it('la fenêtre masque le bouton, la case et les blocs de règle', () => {
    expect(has("el('gf-cta').style.display = 'none';")).toBe(true);
    expect(has("document.querySelector('#ov-irl-garde .gf-cf').style.display = 'none';")).toBe(true);
  });
  it('le titre ne sonne pas comme un mur', () => {
    expect(has('Rien à réviser pour l’instant')).toBe(true);
    expect(has("g.titre || 'Révision impossible'")).toBe(false);
  });
  it('dans la liste, ces lots ont « Pourquoi ? » et pas « quand même »', () => {
    expect(has('title="Pourquoi ce lot n’est pas révisable">Pourquoi ?</button>')).toBe(true);
    expect(has('window.revisionForcable(r))')).toBe(true);
  });
  it('le panneau des IRL non appliquées porte « Appliquer quand même »', () => {
    expect(has('onclick="_gfOuvrir(\'${_lyQ(e.ref)}\')">Appliquer quand même</button>')).toBe(true);
  });
});
