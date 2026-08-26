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
    expect(has('const _forcee = _irlModeLecture(log).force;')).toBe(true);
  });
});

describe('AUDIT I1 — le forçage vaut pour UN cycle, pas « pour toujours »', () => {
  it('la trace est portée par le cycle, et vit dans le blob de configuration', () => {
    // Avant : un booléen `log.irlForceeLe` jamais effacé → toutes les lettres futures du lot
    // contournaient le contrôle DPE, définitivement.
    expect(has('log.irlForceeLe = td();')).toBe(false);
    expect(has('log.irlForceePar =')).toBe(false);
    expect(has('DB.params.irlForcee')).toBe(true);
    expect(has('function _irlForcePourCycle(ref, cycleIso)')).toBe(true);
  });
  it('l\'édition de la lettre ET son marquage « envoyée » lisent le MÊME mode', () => {
    // Sinon on édite une lettre qu\'on ne peut jamais marquer envoyée (« non calculable »).
    expect(has('const _forcee = _irlModeLecture(log).force;')).toBe(true);
    expect(has('const rev = computeIRLRevision(log, _irlModeLecture(log));')).toBe(true);
  });
  it('la trace ne va PAS dans une colonne cloud inexistante : elle voyage dans DB.params', () => {
    expect(has('function _irlSetForcage(ref, val)')).toBe(true);
    expect(has('if (!DB.params.irlForcee) DB.params.irlForcee = {};')).toBe(true);
  });
});

describe('Le mode forcé ne devient jamais le mode normal', () => {
  it('`force` ne franchit QUE les sorties dues à une règle, pas un calcul', () => {
    // D23 — la sortie anticipée « DPE absent » (muet, non calculée) est SUPPRIMÉE : un DPE absent
    // ou périmé ne retient plus la révision (elle est calculée et proposée, cf. irl-dpe-gate).
    expect(has("if (!dpe && !_force) {")).toBe(false);
    // Seul le gel F/G reste une sortie de RÈGLE, franchie par force — désormais via le garde-fou
    // testé irl-dpe-gate (F ou G VALIDE ; un F/G périmé ne gèle plus).
    expect(has("if (_gate.gel && !_force) {")).toBe(true);
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
  it('le geste forcé laisse une trace datée, nominative et RATTACHÉE À SON CYCLE', () => {
    expect(has('_irlSetForcage(ref, {')).toBe(true);
    expect(has("le: td(), par: (typeof _qeQui === 'function') ? _qeQui() : ''")).toBe(true);
  });
  it('AUDIT C2 — le pré-vol d\'applyIRL ne consulte JAMAIS le cycle éteint', () => {
    // Sinon la révision ORDINAIRE d'un lot dont un vieux cycle dort est détournée vers un
    // avertissement qui ne la concerne pas, et se voit proposer le loyer du mauvais cycle.
    // L'appel se termine sur `fmt })` : aucun `surCyclePerdu` ne s'y glisse.
    expect(has('window.gardeFouRevision(rev0, { gainMensuel: _gfGainCycle(log, rev0), fmtMontant: fmt }) : null;')).toBe(true);
  });
  it('le cycle éteint ne s\'ouvre que sur le geste explicite de la pastille', () => {
    expect(has("_gfOuvrir('${_lyQ(e.ref)}',{surCyclePerdu:true})")).toBe(true);
    expect(has('surCyclePerdu: !!(opts && opts.surCyclePerdu)')).toBe(true);
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
    expect(has('window.gardeFouRevision(rev, { gainMensuel: _gfGainCycle(log, rev), fmtMontant: fmt,')).toBe(true);
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
    expect(has('onclick="_gfOuvrir(\'${_lyQ(e.ref)}\',{surCyclePerdu:true})">Appliquer quand même</button>')).toBe(true);
  });
});

describe('AUDIT I5 — la restitution du DG avertit, elle ne bloque plus (§0)', () => {
  it('le repli silencieux sur td() a disparu, ET le refus sec aussi', () => {
    expect(has("const dateRestitution = v('dg-restit-date') || td();")).toBe(false);
    expect(has("const dateRestitution = v('dg-restit-date') || '';")).toBe(true);
    expect(has("showToast('Saisis la date réelle du virement de restitution")).toBe(false);
  });
  it('sans date, l\'app explique ce qui deviendra incalculable et laisse passer', () => {
    // AUDIT I-5 — UNE seule décision, donc UN seul confirm : deux `confirm2` d'affilée
    // disaient la même chose. Le §0 demande de prévenir, pas d'ériger deux portes.
    expect(has('if (!dateRestitution && !confirm2(')).toBe(false);
    expect(SRC.split('confirm2(_msgConfirm)').length - 1).toBe(1);
  });
});

describe('CONTRE-AUDIT R3 — la restitution DG n\'annonce plus un état qu\'elle n\'écrit pas', () => {
  it('sans date, la confirmation dit « INCOMPLÈTE » et ce qui restera à faire', () => {
    // `dgRestitueAt` EST le drapeau de restitution partout : vide, le bail demeure « à
    // restituer ». Faire confirmer « le bail sera marqué DG restitué » puis afficher
    // « ✓ DG restitué » était un demi-état annoncé comme complet.
    expect(has('Enregistrer une restitution INCOMPLÈTE ?')).toBe(true);
    expect(has('le bail restera « à restituer » tant que la date manque')).toBe(true);
  });
  it('et le message de fin dit la même chose que la confirmation', () => {
    expect(has('Restitution enregistrée SANS date')).toBe(true);
    expect(has("dateRestitution ? 'ok' : 'warn'")).toBe(true);
  });
  it('avec une date, le message complet est conservé', () => {
    expect(has('Le bail sera marqué comme "DG restitué" + entrée audit-trail.')).toBe(true);
  });
});
